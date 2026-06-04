"use client";

import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';

const TTS_SAMPLE_RATE = 24000;   // Must match Deepgram TTS config (linear16, 24kHz)
const TTS_PREFIX_BYTE = 0x01;    // Server prefixes TTS audio frames with this byte

const AudioStreamer = forwardRef(({ isActive, config, onEvaluation, onAiToken, onAiTurnEnd, onSessionId, onTranscriptReady, onUserTranscript }, ref) => {
  const processorRef = useRef(null);
  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const configRef = useRef(config);

  // Audio Visualizer Refs (capture — 16kHz)
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const barsRef = useRef([]);

  // TTS Playback Refs (AudioWorklet-based, 24kHz)
  const ttsContextRef = useRef(null);
  const ttsWorkletRef = useRef(null);   // AudioWorkletNode

  // Mic send control during AI speech — mic stays hot (gain=1) always,
  // but we stop SENDING audio to the backend/Deepgram during AI turns.
  // This avoids flooding Deepgram with silence which causes slow speech
  // detection when the user starts speaking.
  const micGainRef = useRef(null);
  const sendAudioRef = useRef(true);     // false = don't send audio to backend
  const aiSpeakingRef = useRef(false);
  const ttsEotReceivedRef = useRef(false);

  // State for UI indicator
  const [isRecording, setIsRecording] = useState(false);
  const [isAiPlaying, setIsAiPlaying] = useState(false);

  // Expose imperative methods to parent via ref
  useImperativeHandle(ref, () => ({
    signalResponseComplete: (codeContent) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        const payload = { type: "response_complete" };
        if (codeContent) {
          payload.codeContent = codeContent;
        }
        socketRef.current.send(JSON.stringify(payload));
        console.log("Signal sent: response_complete", codeContent ? '(with code)' : '');
      } else {
        console.warn("Cannot signal response_complete: Audio WebSocket is not open.");
      }
    },
    signalEndInterview: () => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "end_interview" }));
        console.log("Signal sent: end_interview");
      } else {
        console.warn("Cannot signal end_interview: Audio WebSocket is not open.");
      }
    },
    // Preferred path when the timer expires — tells the audio bridge to run
    // trigger_closing_and_cleanup() which guarantees the LLM sends its closing
    // acknowledgement before the gRPC stream is closed.
    signalTimerExpired: () => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "timer_expired" }));
        console.log("Signal sent: timer_expired");
      } else {
        console.warn("Cannot signal timer_expired: Audio WebSocket is not open.");
      }
    },
  }));

  useEffect(() => { configRef.current = config; }, [config]);

  // ── TTS: Feed audio to AudioWorklet ──

  const handleTtsAudio = (pcmBytes) => {
    // Stop sending audio on first TTS chunk of a new AI turn
    if (!aiSpeakingRef.current && !ttsEotReceivedRef.current) {
      aiSpeakingRef.current = true;
      sendAudioRef.current = false;  // stop sending mic audio — no need to buffer during AI speech
      setIsAiPlaying(true);
    }

    // Convert Int16 PCM → Float32
    const int16 = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    // Feed to AudioWorklet ring buffer (zero-copy transfer)
    if (ttsWorkletRef.current) {
      ttsWorkletRef.current.port.postMessage(
        { type: 'audio', samples: float32 },
        [float32.buffer]
      );
    }
  };

  const handleAiTurnComplete = () => {
    ttsEotReceivedRef.current = true;
    // Tell worklet to flush (start playback even if pre-buffer threshold wasn't met)
    if (ttsWorkletRef.current) {
      ttsWorkletRef.current.port.postMessage({ type: 'flush' });
    }
    // Resume sending mic audio to Deepgram immediately so the user's
    // first words are captured without any delay. The mic was never muted
    // (gain stayed at 1), we just stopped sending — so Deepgram gets
    // fresh audio instantly with no silence→speech transition lag.
    // Resume sending mic audio to backend for buffering.
    aiSpeakingRef.current = false;
    sendAudioRef.current = true;
    setIsAiPlaying(false);
    // Enable Done button after a short delay (STT is now REST-based,
    // no streaming transcript_ready event). The 1s delay lets the user
    // start speaking before the button appears.
    setTimeout(() => {
      if (onTranscriptReady) onTranscriptReady();
    }, 1000);
  };

  useEffect(() => {
    let isMounted = true;
    let retryTimeout = null;

    const startAudioStreaming = async (retries = 3) => {
      try {
        // 1. Open WebSocket
        socketRef.current = new WebSocket("ws://localhost:8001/ws/audio-bridge");
        socketRef.current.binaryType = 'arraybuffer';

        socketRef.current.onopen = () => {
          console.log("Audio WebSocket Opened");
          if (configRef.current) {
            const configPayload = JSON.stringify({
              type: "interview_config",
              subject: configRef.current.subject,
              subtopic: configRef.current.subtopic,
              difficulty: configRef.current.difficulty,
              time: configRef.current.time,
              candidateName: configRef.current.candidateName || "",
            });
            socketRef.current.send(configPayload);
            console.log("Transaction 1 sent: interview_config", configPayload);
          }
        };

        socketRef.current.onerror = (error) => console.error("Audio WebSocket Error:", error);

        socketRef.current.onmessage = (event) => {
          // Binary frame = TTS audio
          if (event.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(event.data);
            if (bytes.length > 1 && bytes[0] === TTS_PREFIX_BYTE) {
              handleTtsAudio(bytes.slice(1));
            }
            return;
          }

          // Text frame = control messages
          if (typeof event.data === 'string') {
            try {
              const msg = JSON.parse(event.data);
              switch (msg.type) {
                case "session_id":
                  // Audio bridge sends this after interview_config handshake.
                  // Forward it to the parent so the visual-analysis WebSocket can be init'd.
                  console.log("Session ID received from audio bridge:", msg.sessionId);
                  if (onSessionId) onSessionId(msg.sessionId);
                  break;
                case "ai_response":
                  ttsEotReceivedRef.current = false; // new AI turn
                  if (onAiToken) onAiToken(msg.text);
                  break;
                case "ai_eot":
                  console.log("AI turn complete.");
                  handleAiTurnComplete();
                  if (onAiTurnEnd) onAiTurnEnd();
                  break;
                case "deepgram_ready":
                  console.log("Deepgram connected. Audio capture is live.");
                  break;
                case "transcript_ready":
                  console.log("Transcript buffered — Done button enabled.");
                  if (onTranscriptReady) onTranscriptReady();
                  break;
                case "user_transcript":
                  console.log("User said:", msg.text);
                  if (onUserTranscript) onUserTranscript(msg.text);
                  break;
                case "evaluation":
                  console.log("Received evaluation report:", msg.data);
                  if (onEvaluation) onEvaluation(msg.data);
                  // M2 FIX: Don't close socket here. The isActive=false useEffect
                  // fires after onEvaluation → handleEvaluation → setIsActive(false),
                  // and stopAudioHardware() there already closes the socket cleanly.
                  break;
                default:
                  console.log("Unknown message type:", msg.type);
              }
            } catch (err) {
              console.error("Error parsing websocket message:", err);
            }
          }
        };

        socketRef.current.onclose = (event) => {
          console.log("Audio WebSocket Closed:", event.code, event.reason);
        };

        // 2. Mic access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isMounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;

        // 3. Capture AudioContext (16kHz)
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyserRef.current = analyser;
        analyser.fftSize = 256;

        const source = audioContext.createMediaStreamSource(stream);
        const micGain = audioContext.createGain();
        micGainRef.current = micGain;
        micGain.gain.value = 1;  // Mic stays at full gain ALWAYS

        source.connect(micGain);
        micGain.connect(analyser);

        // Visualizer loop
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const updateVisualizer = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const barCount = 5;
          const chunkSize = Math.floor(bufferLength / barCount);
          for (let i = 0; i < barCount; i++) {
            if (!barsRef.current[i]) continue;
            let sum = 0;
            for (let j = 0; j < chunkSize; j++) sum += dataArray[i * chunkSize + j];
            const avg = sum / chunkSize;
            const h = 4 + (avg / 255) * 20;
            barsRef.current[i].style.height = `${h}px`;
          }
          animationFrameRef.current = requestAnimationFrame(updateVisualizer);
        };
        updateVisualizer();

        // ScriptProcessor for audio streaming
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        processor.onaudioprocess = (e) => {
          // Only send audio when AI is NOT speaking — this prevents flooding
          // Deepgram with silence (which causes slow speech detection on resume).
          // The mic stays hot, we just don't send the data.
          // Only send audio when AI is NOT speaking — backend buffers this
          // for REST transcription when the user clicks Done.
          if (socketRef.current?.readyState === WebSocket.OPEN && sendAudioRef.current) {
            const f32 = e.inputBuffer.getChannelData(0);
            const i16 = new Int16Array(f32.length);
            for (let i = 0; i < f32.length; i++) {
              i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
            }
            socketRef.current.send(i16.buffer);
          }
        };
        micGain.connect(processor);
        processor.connect(audioContext.destination);

        // 4. TTS Playback AudioContext + AudioWorklet (24kHz)
        const ttsCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: TTS_SAMPLE_RATE });
        ttsContextRef.current = ttsCtx;

        await ttsCtx.audioWorklet.addModule('/tts-worklet-processor.js');
        const workletNode = new AudioWorkletNode(ttsCtx, 'tts-playback-processor');
        workletNode.connect(ttsCtx.destination);

        // Listen for worklet signals
        workletNode.port.onmessage = (event) => {
          if (event.data.type === 'drained') {
            console.log("[TTS] Audio fully drained.");
            // Safety net — resume audio sending if handleAiTurnComplete didn't fire.
            if (aiSpeakingRef.current) {
              aiSpeakingRef.current = false;
              sendAudioRef.current = true;
              setIsAiPlaying(false);
            }
          } else if (event.data.type === 'playing') {
            console.log("[TTS] Playback started (pre-buffer reached).");
          }
        };

        ttsWorkletRef.current = workletNode;
        console.log("[TTS] AudioWorklet initialized. Ready for playback.");

        setIsRecording(true);

      } catch (err) {
        console.error("Error initializing audio stream:", err);
        if (err.name === 'NotReadableError' && retries > 0 && isMounted) {
          console.warn('Mic locked, retrying in 1s...');
          retryTimeout = setTimeout(() => startAudioStreaming(retries - 1), 1000);
        }
      }
    };

    const stopAudioHardware = () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close().catch(console.error);
      if (ttsContextRef.current?.state !== 'closed') ttsContextRef.current?.close().catch(console.error);
      if (processorRef.current) processorRef.current.disconnect();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

      processorRef.current = null;
      streamRef.current = null;
      audioContextRef.current = null;
      analyserRef.current = null;
      ttsContextRef.current = null;
      ttsWorkletRef.current = null;
      micGainRef.current = null;
      aiSpeakingRef.current = false;
      ttsEotReceivedRef.current = false;
      sendAudioRef.current = true;

      setIsRecording(false);
      setIsAiPlaying(false);
    };

    if (isActive) {
      startAudioStreaming();
    } else {
      stopAudioHardware();
      if (socketRef.current) { socketRef.current.close(); socketRef.current = null; }
    }

    return () => {
      isMounted = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      stopAudioHardware();
      if (socketRef.current) { socketRef.current.close(); socketRef.current = null; }
    };
  }, [isActive]);

  return (
    <div className="flex items-center space-x-3 py-2 px-4 bg-white rounded-full shadow-sm border border-gray-100 max-w-fit">
      {isRecording ? (
        <>
          <div className={`relative flex items-center justify-center w-8 h-8 rounded-full ${
            isAiPlaying ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'
          }`}>
            {isAiPlaying ? (
              <Volume2 className="w-4 h-4 z-10 animate-pulse" />
            ) : (
              <>
                <Mic className="w-4 h-4 z-10" />
                <span className="absolute inset-0 rounded-full border border-blue-300 animate-ping opacity-60"></span>
              </>
            )}
          </div>
          <div className="flex items-center space-x-1 h-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} ref={el => barsRef.current[i] = el}
                className={`w-1 rounded-full ${isAiPlaying ? 'bg-violet-500' : 'bg-blue-600'}`}
                style={{ height: '4px', transition: 'height 75ms ease-out' }} />
            ))}
          </div>
          <span className={`text-xs font-semibold tracking-wide uppercase pr-1 ml-1 ${
            isAiPlaying ? 'text-violet-500' : 'text-slate-500'
          }`}>{isAiPlaying ? 'AI Speaking' : 'Listening'}</span>
        </>
      ) : (
        <>
          <div className="flex items-center justify-center w-8 h-8 bg-slate-50 rounded-full text-slate-400">
            <MicOff className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-1 h-6 mix-blend-multiply">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="w-1 rounded-full bg-gray-200" style={{ height: '4px' }} />
            ))}
          </div>
          <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase pr-1 ml-1">Mic Off</span>
        </>
      )}
    </div>
  );
});

AudioStreamer.displayName = 'AudioStreamer';
export default AudioStreamer;
