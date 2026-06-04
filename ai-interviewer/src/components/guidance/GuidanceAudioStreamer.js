"use client";

import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';

const TTS_SAMPLE_RATE = 24000;
const TTS_PREFIX_BYTE = 0x01;

/**
 * GuidanceAudioStreamer — Audio WebSocket client for Guidance (Teacher) mode.
 *
 * Mirrors AudioStreamer but connects to /ws/guidance-bridge and sends
 * guidance_config instead of interview_config. No timer signals, no evaluation.
 */
const GuidanceAudioStreamer = forwardRef(({ isActive, config, onAiToken, onAiTurnEnd, onSessionId, onSessionEnded, onTranscriptReady, onUserTranscript }, ref) => {
  const processorRef = useRef(null);
  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const configRef = useRef(config);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const barsRef = useRef([]);

  const ttsContextRef = useRef(null);
  const ttsWorkletRef = useRef(null);

  const micGainRef = useRef(null);
  const sendAudioRef = useRef(true);     // false = don't send audio to backend
  const aiSpeakingRef = useRef(false);
  const ttsEotReceivedRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isAiPlaying, setIsAiPlaying] = useState(false);

  useImperativeHandle(ref, () => ({
    signalResponseComplete: () => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "response_complete" }));
        console.log("Guidance signal sent: response_complete");
      }
    },
    signalEndSession: () => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "end_session" }));
        console.log("Guidance signal sent: end_session");
      }
    },
  }));

  useEffect(() => { configRef.current = config; }, [config]);

  const handleTtsAudio = (pcmBytes) => {
    // Stop sending audio on first TTS chunk of a new AI turn
    if (!aiSpeakingRef.current && !ttsEotReceivedRef.current) {
      aiSpeakingRef.current = true;
      sendAudioRef.current = false;  // stop sending mic audio during AI speech
      setIsAiPlaying(true);
    }

    const int16 = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    if (ttsWorkletRef.current) {
      ttsWorkletRef.current.port.postMessage(
        { type: 'audio', samples: float32 },
        [float32.buffer]
      );
    }
  };

  const handleAiTurnComplete = () => {
    ttsEotReceivedRef.current = true;
    if (ttsWorkletRef.current) {
      ttsWorkletRef.current.port.postMessage({ type: 'flush' });
    }
    // Resume sending mic audio to backend for buffering
    aiSpeakingRef.current = false;
    sendAudioRef.current = true;
    setIsAiPlaying(false);
    // Enable Done button after short delay (REST-based STT)
    setTimeout(() => {
      if (onTranscriptReady) onTranscriptReady();
    }, 1000);
  };

  useEffect(() => {
    // Guard flag — set true by cleanup to suppress StrictMode false errors.
    let isCancelled = false;

    const startAudioStreaming = async () => {
      try {
        socketRef.current = new WebSocket("ws://localhost:8001/ws/guidance-bridge");
        socketRef.current.binaryType = 'arraybuffer';

        socketRef.current.onopen = () => {
          if (isCancelled) return;
          console.log("Guidance WebSocket Opened");
          if (configRef.current) {
            const configPayload = JSON.stringify({
              type: "guidance_config",
              subject: configRef.current.subject,
              subtopic: configRef.current.subtopic,
            });
            socketRef.current.send(configPayload);
            console.log("Guidance config sent:", configPayload);
          }
        };

        socketRef.current.onerror = () => {
          // Suppress errors from StrictMode's first (aborted) mount
          if (!isCancelled) console.error("Guidance WebSocket connection error.");
        };

        socketRef.current.onmessage = (event) => {
          if (isCancelled) return;

          if (event.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(event.data);
            if (bytes.length > 1 && bytes[0] === TTS_PREFIX_BYTE) {
              handleTtsAudio(bytes.slice(1));
            }
            return;
          }

          if (typeof event.data === 'string') {
            try {
              const msg = JSON.parse(event.data);
              switch (msg.type) {
                case "session_id":
                  console.log("Guidance session ID:", msg.sessionId);
                  if (onSessionId) onSessionId(msg.sessionId);
                  break;
                case "ai_response":
                  ttsEotReceivedRef.current = false;
                  if (onAiToken) onAiToken(msg.text);
                  break;
                case "ai_eot":
                  console.log("Teacher turn complete.");
                  handleAiTurnComplete();
                  if (onAiTurnEnd) onAiTurnEnd();
                  break;
                case "deepgram_ready":
                  console.log("Deepgram connected for guidance.");
                  break;
                case "transcript_ready":
                  console.log("Transcript buffered — Done button enabled.");
                  if (onTranscriptReady) onTranscriptReady();
                  break;
                case "user_transcript":
                  console.log("User said:", msg.text);
                  if (onUserTranscript) onUserTranscript(msg.text);
                  break;
                case "session_ended":
                  console.log("Guidance session ended by server.");
                  if (onSessionEnded) onSessionEnded();
                  break;
                default:
                  console.log("Unknown guidance message:", msg.type);
              }
            } catch (err) {
              console.error("Error parsing guidance message:", err);
            }
          }
        };

        socketRef.current.onclose = (event) => {
          if (!isCancelled) console.log("Guidance WebSocket Closed:", event.code, event.reason);
        };

        // If StrictMode already cancelled us before we got here, bail out
        if (isCancelled) return;

        // Mic access
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (isCancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
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

        // Visualizer
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

        // Audio streaming processor
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        processor.onaudioprocess = (e) => {
          // Only send audio when AI is NOT speaking — backend buffers for REST transcription
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

        // TTS AudioWorklet
        const ttsCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: TTS_SAMPLE_RATE });
        ttsContextRef.current = ttsCtx;

        await ttsCtx.audioWorklet.addModule('/tts-worklet-processor.js');
        const workletNode = new AudioWorkletNode(ttsCtx, 'tts-playback-processor');
        workletNode.connect(ttsCtx.destination);

        workletNode.port.onmessage = (event) => {
          if (event.data.type === 'drained') {
            // Safety net — resume audio sending
            if (aiSpeakingRef.current) {
              aiSpeakingRef.current = false;
              sendAudioRef.current = true;
              setIsAiPlaying(false);
            }
          }
        };

        ttsWorkletRef.current = workletNode;
        setIsRecording(true);

      } catch (err) {
        if (!isCancelled) console.error("Error initializing guidance audio:", err);
      }
    };

    const stopAudioHardware = () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close().catch(() => {});
      if (ttsContextRef.current?.state !== 'closed') ttsContextRef.current?.close().catch(() => {});
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
      isCancelled = true;
      stopAudioHardware();
      if (socketRef.current) { socketRef.current.close(); socketRef.current = null; }
    };
  }, [isActive]);

  return (
    <div className="flex items-center space-x-3 py-2 px-4 bg-white rounded-full shadow-sm border border-gray-100 max-w-fit">
      {isRecording ? (
        <>
          <div className={`relative flex items-center justify-center w-8 h-8 rounded-full ${
            isAiPlaying ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'
          }`}>
            {isAiPlaying ? (
              <Volume2 className="w-4 h-4 z-10 animate-pulse" />
            ) : (
              <>
                <Mic className="w-4 h-4 z-10" />
                <span className="absolute inset-0 rounded-full border border-emerald-300 animate-ping opacity-60"></span>
              </>
            )}
          </div>
          <div className="flex items-center space-x-1 h-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} ref={el => barsRef.current[i] = el}
                className={`w-1 rounded-full ${isAiPlaying ? 'bg-indigo-500' : 'bg-emerald-600'}`}
                style={{ height: '4px', transition: 'height 75ms ease-out' }} />
            ))}
          </div>
          <span className={`text-xs font-semibold tracking-wide uppercase pr-1 ml-1 ${
            isAiPlaying ? 'text-indigo-500' : 'text-slate-500'
          }`}>{isAiPlaying ? 'Teacher Speaking' : 'Listening'}</span>
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

GuidanceAudioStreamer.displayName = 'GuidanceAudioStreamer';
export default GuidanceAudioStreamer;
