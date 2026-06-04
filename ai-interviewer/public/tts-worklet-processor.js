/**
 * AudioWorklet processor for robust TTS playback.
 * Uses a ring buffer to absorb network jitter and ensure gapless audio.
 *
 * KEY FIX: Underrun grace period.
 * When the buffer temporarily empties between TTS chunks (different Speak/Flush
 * results from Deepgram), the processor continues outputting silence for up to
 * 300ms instead of immediately declaring "drained". This bridges the gap between
 * consecutive TTS audio chunks and prevents the stop-start stuttering that occurs
 * when each chunk is treated as a separate playback session.
 *
 * Main thread → Worklet messages:
 *   { type: 'audio', samples: Float32Array }  — new PCM data
 *   { type: 'flush' }                         — force-start even if pre-buffer threshold wasn't met
 *   { type: 'reset' }                         — clear buffer for next turn
 *
 * Worklet → Main thread messages:
 *   { type: 'playing' }   — playback has started
 *   { type: 'drained' }   — buffer fully consumed AND grace period expired
 */
class TtsPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Ring buffer: 30 seconds at 24kHz = 720,000 samples
    this.bufferSize = 24000 * 30;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;

    // State
    this.playing = false;
    this.preBufferSamples = 24000 * 0.2; // 200ms pre-buffer threshold
    this.notifiedDrained = false;

    // Grace period: number of render quanta (128 samples each) to wait
    // before declaring "drained" when the buffer temporarily empties.
    // 300ms at 24kHz = 7200 samples / 128 = ~56 quanta.
    this.graceQuanta = Math.ceil(24000 * 0.3 / 128);
    this.silenceCountdown = 0;

    this.port.onmessage = (event) => {
      const { type, samples } = event.data;

      switch (type) {
        case 'audio':
          // Write incoming samples into the ring buffer
          for (let i = 0; i < samples.length; i++) {
            this.buffer[this.writeIndex % this.bufferSize] = samples[i];
            this.writeIndex++;
          }
          this.notifiedDrained = false;
          // Reset grace timer — new audio arrived, no need to drain
          this.silenceCountdown = this.graceQuanta;

          // Auto-start playback once pre-buffer threshold is reached
          if (!this.playing && this.available() >= this.preBufferSamples) {
            this.playing = true;
            this.port.postMessage({ type: 'playing' });
          }
          break;

        case 'flush':
          // Force-start playback with whatever we have (used on ai_eot for short sentences)
          if (!this.playing && this.available() > 0) {
            this.playing = true;
            this.silenceCountdown = this.graceQuanta;
            this.port.postMessage({ type: 'playing' });
          }
          break;

        case 'reset':
          // Clear buffer for next AI turn
          this.readIndex = this.writeIndex;
          this.playing = false;
          this.notifiedDrained = false;
          this.silenceCountdown = 0;
          break;
      }
    };
  }

  available() {
    return this.writeIndex - this.readIndex;
  }

  process(inputs, outputs) {
    const output = outputs[0][0]; // mono, 128 samples per render quantum

    if (!this.playing) {
      output.fill(0);
      return true;
    }

    const avail = this.available();
    const toRead = Math.min(output.length, avail);

    for (let i = 0; i < toRead; i++) {
      output[i] = this.buffer[this.readIndex % this.bufferSize];
      this.readIndex++;
    }

    // Fill remainder with silence on buffer underrun
    for (let i = toRead; i < output.length; i++) {
      output[i] = 0;
    }

    if (this.available() > 0) {
      // Buffer has data — keep grace timer fully charged
      this.silenceCountdown = this.graceQuanta;
    } else {
      // Buffer empty — count down grace period before declaring drained.
      // This bridges brief gaps between consecutive TTS audio chunks.
      if (this.silenceCountdown > 0) {
        this.silenceCountdown--;
      } else if (!this.notifiedDrained) {
        // Grace period expired with no new audio — truly drained
        this.notifiedDrained = true;
        this.playing = false;
        this.port.postMessage({ type: 'drained' });
      }
    }

    return true; // keep processor alive
  }
}

registerProcessor('tts-playback-processor', TtsPlaybackProcessor);
