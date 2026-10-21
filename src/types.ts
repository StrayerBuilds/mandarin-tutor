export interface Phrase {
  id: string;
  /** Chinese text. Must contain no punctuation, and one character per pinyin syllable. */
  hanzi: string;
  /** Space separated numbered pinyin, e.g. "ni3 hao3". Same length as [...hanzi]. */
  pinyin: string;
  en: string;
}

export interface Lesson {
  id: string;
  titleZh: string;
  title: string;
  phrases: Phrase[];
}

export interface ToneWord {
  tone: Tone;
  hanzi: string;
  pinyin: string;
  en: string;
}

export interface ToneSet {
  id: string;
  /** Plain syllable without tone, e.g. "ma". */
  syllable: string;
  words: ToneWord[];
}

export type Tone = 1 | 2 | 3 | 4 | 5;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TutorReply {
  zh: string;
  pinyin: string;
  en: string;
  note: string;
  /** Topic the tutor wants the learner to practise next, when it names one. */
  suggest?: string;
  raw: string;
}

export interface ToneScore {
  index: number;
  expected: number;
  detected: number;
  confidence: number;
  score: number;
  /** Normalised pitch height samples (0..1) for this syllable. */
  contour: number[];
}

export interface PitchReport {
  sampleRate: number;
  durationS: number;
  voicedRatio: number;
  f0Median: number;
  segments: number;
  aligned: boolean;
  /** Full utterance pitch, normalised 0..1, ~120 samples. */
  contour: number[];
  tones: ToneScore[];
  /** Average of the scored (non-neutral, non-skipped) syllables. */
  averageScore: number;
  summary: string;
  tips: string[];
}

export type Capability = 'webgpu' | 'wasm-only';
