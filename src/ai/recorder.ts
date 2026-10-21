/**
 * Microphone capture, decoded to the 16 kHz mono float samples that both the
 * speech recogniser and the pitch tracker want. The audio never leaves the phone.
 */
export interface Recording {
  audio: Float32Array;
  sampleRate: number;
  seconds: number;
}

const TARGET_RATE = 16000;

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

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    } catch {
      // Already stopped.
    }
    this.release();
  }

  private release(): void {
    this.recorder = null;
    this.parts = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
