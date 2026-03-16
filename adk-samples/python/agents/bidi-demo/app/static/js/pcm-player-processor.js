/**
 * An audio worklet processor that stores the PCM audio data sent from the main thread
 * to a buffer and plays it.
 *
 * FIXES:
 * 1. Pre-buffer threshold: waits for enough data before starting playback
 *    to prevent clipped/slow audio at the start of each response.
 * 2. Safe endOfAudio: lets the buffer drain naturally instead of wiping
 *    unplayed audio mid-sentence.
 */
class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Ring buffer: 24kHz x 180 seconds
    this.bufferSize = 24000 * 180;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;

    // --- FIX 1: Pre-buffer gate ---
    // Don't start playing until we have at least 4800 samples (200ms) queued.
    // This prevents the slow/clipped ramp-up at the start of each utterance.
    this.PRE_BUFFER_SAMPLES = 9600; // 400ms at 24kHz
    this.isPlaying = false;

    // --- FIX 2: Graceful endOfAudio ---
    // Instead of wiping the buffer, we set a flag to stop accepting NEW audio.
    // The remaining buffered audio drains naturally, then playback pauses.
    this.drainOnly = false;

    this.port.onmessage = (event) => {
      if (event.data.command === 'endOfAudio') {
        // Let the buffer finish playing rather than cutting it off instantly.
        // Reset the gate so the next response re-triggers pre-buffering.
        this.drainOnly = true;
        this.isPlaying = true; // keep playing what's left
        console.log("endOfAudio received — draining remaining buffer.");
        return;
      }

      // If we're in drain mode, ignore new audio until the buffer empties.
      // (This handles rapid back-to-back responses cleanly.)
      if (this.drainOnly) {
        // Only accept new audio once the buffer has fully drained.
        if (this.readIndex === this.writeIndex) {
          this.drainOnly = false;
          this.isPlaying = false; // re-arm the pre-buffer gate
        } else {
          return;
        }
      }

      // Decode base64 int16 PCM and enqueue
      const int16Samples = new Int16Array(event.data);
      this._enqueue(int16Samples);

      // Arm playback once we have enough pre-buffered data
      if (!this.isPlaying && this._bufferedSamples() >= this.PRE_BUFFER_SAMPLES) {
        this.isPlaying = true;
        console.log("Pre-buffer threshold reached — starting playback.");
      }
    };
  }

  // Returns how many unplayed samples are currently buffered.
  _bufferedSamples() {
    if (this.writeIndex >= this.readIndex) {
      return this.writeIndex - this.readIndex;
    }
    return this.bufferSize - this.readIndex + this.writeIndex;
  }

  // Push incoming Int16 data into the ring buffer.
  _enqueue(int16Samples) {
    for (let i = 0; i < int16Samples.length; i++) {
      const floatVal = int16Samples[i] / 32768;
      this.buffer[this.writeIndex] = floatVal;
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

      // Overflow: overwrite oldest samples
      if (this.writeIndex === this.readIndex) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const framesPerBlock = output[0].length;

    for (let frame = 0; frame < framesPerBlock; frame++) {
      let sample = 0.0;

      if (this.isPlaying && this.readIndex !== this.writeIndex) {
        sample = this.buffer[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.bufferSize;

        // Buffer fully drained after endOfAudio — reset for next response
        if (this.drainOnly && this.readIndex === this.writeIndex) {
          this.drainOnly = false;
          this.isPlaying = false;
          console.log("Buffer drained — ready for next response.");
        }
      }

      output[0][frame] = sample;
      if (output.length > 1) {
        output[1][frame] = sample;
      }
    }

    return true;
  }
}

registerProcessor('pcm-player-processor', PCMPlayerProcessor);