import type { ChatMessage } from './types';

const SETTINGS_KEY = 'zhongwen.settings.v1';
const PROGRESS_KEY = 'zhongwen.progress.v1';
const TONE_KEY = 'zhongwen.tones.v1';
const CHAT_KEY = 'zhongwen.chat.v1';

export interface Settings {
  /** Which Qwen2.5 checkpoint to run. Resolved against WebLLM's built-in list. */
  modelSize: ModelSize;
  /** Whisper checkpoint for local speech recognition. */
  asrModel: string;
  /** Whisper execution provider. WebGPU is much faster but not on every phone. */
  asrDevice: 'wasm' | 'webgpu';
  speechRate: number;
  showPinyin: boolean;
  showEnglish: boolean;
  /**
   * Opt-in only. The browser's built-in recogniser is fast and accurate but on
   * most platforms it streams your audio to a server, which breaks the whole
   * point of this app. Off by default, and labelled clearly in Settings.
   */
  useWebSpeechSTT: boolean;
}

export type ModelSize = 'small' | 'balanced' | 'large';

export const DEFAULT_SETTINGS: Settings = {
  modelSize: 'balanced',
  asrModel: 'onnx-community/whisper-tiny',
  asrDevice: 'wasm',
  speechRate: 0.85,
  showPinyin: true,
  showEnglish: true,
  useWebSpeechSTT: false,
};

export interface Attempt {
  attempts: number;
  best: number;
  last: number;
}

export type ProgressMap = Record<string, Attempt>;

export interface ToneDrillStat {
  correct: number;
  total: number;
}

export type ToneStats = Record<string, ToneDrillStat>;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota. Losing study history is not worth interrupting practice.
  }
}

export const store = {
  settings: DEFAULT_SETTINGS,

  load(): void {
    this.settings = read<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
  },

  save(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    write(SETTINGS_KEY, this.settings);
  },

  progress(): ProgressMap {
    return read<ProgressMap>(PROGRESS_KEY, {});
  },

  recordAttempt(phraseId: string, score: number): void {
    const all = this.progress();
    const prev = all[phraseId] ?? { attempts: 0, best: 0, last: 0 };
    all[phraseId] = {
      attempts: prev.attempts + 1,
      best: Math.max(prev.best, score),
      last: score,
    };
    write(PROGRESS_KEY, all);
  },

  toneStats(): ToneStats {
    return read<ToneStats>(TONE_KEY, {});
  },

  recordToneDrill(setId: string, tone: number, correct: boolean): void {
    const all = this.toneStats();
    const key = `${setId}:${tone}`;
    const prev = all[key] ?? { correct: 0, total: 0 };
    all[key] = { correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 };
    write(TONE_KEY, all);
  },

  chat(): ChatMessage[] {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    } catch {
      return [];
    }
  },

  saveChat(messages: ChatMessage[]): void {
    // Keep the persisted history small; the model context is trimmed separately.
    write(CHAT_KEY, messages.slice(-40));
  },

  resetAll(): void {
    try {
      localStorage.removeItem(SETTINGS_KEY);
      localStorage.removeItem(PROGRESS_KEY);
      localStorage.removeItem(TONE_KEY);
      localStorage.removeItem(CHAT_KEY);
    } catch {
      // ignore
    }
  },
};
