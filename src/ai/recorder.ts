/**
 * Microphone capture, decoded to the 16 kHz mono float samples that both the
 * speech recogniser and the pitch tracker want. The audio never leaves the phone.
 */
export interface Recording {
  audio: Float32Array;
  sampleRate: number;
  seconds: number;
}

export interface ListenOptions {
  /** Raw RMS level per frame, for a live input meter. */
  onLevel?: (level: number) => void;
  /** Quiet time that ends the learner's turn. */
  silenceMs?: number;
  /** Speech shorter than this is treated as a cough, not a sentence. */
  minSpeechMs?: number;
  /** Give up when nobody speaks at all. */
  startTimeoutMs?: number;
  /** Hard stop so a forgotten microphone can't record forever. */
  maxMs?: number;
}

const TARGET_RATE = 16000;
/** Voice-activity frame. Short enough to feel instant, long enough to be cheap. */
const FRAME_MS = 60;

function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
}

export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const src = i * ratio;
    const left = Math.floor(src);
    const right = Math.min(left + 1, input.length - 1);
    const frac = src - left;
    out[i] = input[left] * (1 - frac) + input[right] * frac;
  }
  return out;
}

async function decodeToMono16k(blob: Blob): Promise<Recording> {
  const bytes = await blob.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(bytes);
    const channels = decoded.numberOfChannels;
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < channels; c++) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += data[i] / channels;
    }
    const audio = resampleLinear(mono, decoded.sampleRate, TARGET_RATE);
    return { audio, sampleRate: TARGET_RATE, seconds: audio.length / TARGET_RATE };
  } finally {
    void ctx.close();
  }
}

export class MicRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private parts: Blob[] = [];
  private timer: number | null = null;
  /** Voice-activity polling, only used by `listen()`. */
  private vadTimer: number | null = null;
  private vadSettle: ((spoke: boolean) => void) | null = null;
  private endRequested = false;

  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    );
  }

  get recording(): boolean {
    return this.recorder?.state === 'recording';
  }

  /** @param maxMs hard stop so a forgotten recording can't fill memory. */
  async start(maxMs = 15000): Promise<void> {
    if (!MicRecorder.isSupported()) {
      throw new Error('This browser cannot record audio. Try Chrome on Android or Safari on iOS.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const mimeType = pickMimeType();
    this.parts = [];
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.parts.push(e.data);
    };
    this.recorder.start();

    this.timer = window.setTimeout(() => {
      this.stop().catch(() => {});
    }, maxMs);
  }

  async stop(): Promise<Recording> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const recorder = this.recorder;
    if (!recorder) throw new Error('Nothing is being recorded.');

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.parts, { type: recorder.mimeType || 'audio/webm' }));
      if (recorder.state === 'inactive') {
        resolve(new Blob(this.parts, { type: recorder.mimeType || 'audio/webm' }));
        return;
      }
      recorder.stop();
    });

    this.release();

    if (blob.size === 0) throw new Error('The recording was empty — hold the button while you speak.');
    return decodeToMono16k(blob);
  }

  /**
   * Waits for one spoken turn and ends it by itself once the learner goes quiet.
   *
   * This is what makes hands-free conversation possible: open the microphone,
   * let the level meter show that we are hearing something, then stop the moment
   * there has been real speech followed by silence. Resolves with null when
   * nothing usable was said, so the caller can simply ask again.
   */
  async listen(opts: ListenOptions = {}): Promise<Recording | null> {
    const {
      onLevel,
      silenceMs = 1000,
      minSpeechMs = 300,
      startTimeoutMs = 10000,
      maxMs = 20000,
    } = opts;

    if (!MicRecorder.isSupported()) {
      throw new Error('This browser cannot record audio. Try Chrome on Android or Safari on iOS.');
    }

    this.endRequested = false;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // The analyser shares the same stream as the recorder purely to watch the
    // level; the audio we keep comes from the MediaRecorder below.
    const ctx = new AudioContext();
    try {
      await ctx.resume();
    } catch {
      // Nothing to resume on some browsers.
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(this.stream).connect(analyser);
    const frame = new Float32Array(analyser.fftSize);

    const mimeType = pickMimeType();
    this.parts = [];
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.parts.push(e.data);
    };
    // Timeslices so a long turn still has audio by the time we stop.
    this.recorder.start(200);

    const startedAt = performance.now();
    const calibratedUntil = startedAt + 250;
    let noise = 0.006;
    let speechAt = 0;
    let lastLoudAt = 0;

    try {
      const spoke = await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (value: boolean) => {
          if (settled) return;
          settled = true;
          if (this.vadTimer !== null) {
            clearInterval(this.vadTimer);
            this.vadTimer = null;
          }
          this.vadSettle = null;
          resolve(value);
        };
        this.vadSettle = settle;

        this.vadTimer = window.setInterval(() => {
          analyser.getFloatTimeDomainData(frame);
          const level = rms(frame);
          onLevel?.(level);

          const now = performance.now();
          if (now < calibratedUntil) {
            // Learn the room's noise floor, but never let it climb so high that
            // quiet speech stops registering.
            noise = Math.min(0.03, Math.max(noise, level));
            return;
          }

          const threshold = Math.min(0.05, Math.max(0.008, noise * 2.2));
          if (level > threshold) {
            lastLoudAt = now;
            if (speechAt === 0) speechAt = now;
          } else {
            noise = noise * 0.97 + level * 0.03;
          }

          const spokeEnough = speechAt > 0 && lastLoudAt - speechAt >= minSpeechMs;
          if (spokeEnough && now - lastLoudAt >= silenceMs) settle(true);
          else if (this.endRequested) settle(speechAt > 0);
          else if (now - startedAt >= maxMs) settle(spokeEnough);
          else if (speechAt === 0 && now - startedAt >= startTimeoutMs) settle(false);
        }, FRAME_MS);
      });

      if (!spoke) {
        this.cancel();
        return null;
      }
      try {
        return await this.stop();
      } catch {
        // Too short to decode, or the microphone was pulled away mid-turn.
        return null;
      }
    } finally {
      void ctx.close().catch(() => {});
    }
  }

  /** Ends an in-flight listen() now, keeping whatever has been said so far. */
  endListen(): void {
    this.endRequested = true;
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.vadTimer !== null) {
      clearInterval(this.vadTimer);
      this.vadTimer = null;
    }
    const settle = this.vadSettle;
    this.vadSettle = null;
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    } catch {
      // Already stopped.
    }
    this.release();
    settle?.(false);
  }

  private release(): void {
    this.recorder = null;
    this.parts = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
