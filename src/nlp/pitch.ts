/**
 * Tone analysis from raw audio.
 *
 * Mandarin tones are pitch contours, so we can grade them without any cloud
 * service or model: track F0 (fundamental frequency) frame by frame with
 * normalised autocorrelation, normalise each utterance to its own pitch range
 * (so it doesn't matter whether you have a high or low voice), split the
 * utterance into syllable-ish blocks, then match the shape of each block against
 * the four canonical tone contours.
 *
 * This is a heuristic, not a phonetics lab: it is good at "your third tone is
 * flat" and honest about what it cannot tell. Everything runs in a few
 * milliseconds on-device.
 */
import type { PitchReport, ToneScore } from '../types';

const FRAME_S = 0.04;
const HOP_S = 0.01;
const MIN_F0 = 70;
const MAX_F0 = 450;
const CLARITY_MIN = 0.34;
const SPLIT_SEMITONES = 8;
const MIN_SEG_FRAMES = 7;
const CONTOUR_POINTS = 120;

/** Canonical tone shapes, five points, 0 = speaker's low end, 1 = their high end. */
const TEMPLATES: Record<number, number[]> = {
  1: [0.88, 0.95, 0.94, 0.9, 0.87], // high and flat
  2: [0.3, 0.12, 0.2, 0.55, 0.95], // dip then rise
  3: [0.5, 0.22, 0.1, 0.18, 0.52], // low, dips, mild rise
  4: [0.97, 0.8, 0.48, 0.18, 0.05], // falls hard
};

/** Exposed so the UI can draw the target shape next to the learner's own pitch. */
export function toneTemplate(tone: number): number[] {
  return TEMPLATES[tone] ?? TEMPLATES[1];
}

interface Frame {
  f0: number;
  clarity: number;
  rms: number;
  semitone: number;
  level: number;
  voiced: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.round((p / 100) * (s.length - 1)), 0, s.length - 1);
  return s[idx];
}

/** Normalised autocorrelation pitch estimate for one window. */
function frameF0(x: Float32Array, start: number, len: number, sr: number): { f0: number; clarity: number } {
  const minLag = Math.floor(sr / MAX_F0);
  const maxLag = Math.min(Math.floor(sr / MIN_F0), len - 2);
  if (maxLag <= minLag) return { f0: 0, clarity: 0 };

  // Mean-removed copy of the window, plus prefix sums of squares for fast
  // normalisation of each lag.
  const w = new Float32Array(len);
  let mean = 0;
  for (let i = 0; i < len; i++) mean += x[start + i];
  mean /= len;
  for (let i = 0; i < len; i++) w[i] = x[start + i] - mean;

  const prefix = new Float64Array(len + 1);
  for (let i = 0; i < len; i++) prefix[i + 1] = prefix[i] + w[i] * w[i];

  let bestLag = -1;
  let bestR = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let dot = 0;
    const n = len - lag;
    for (let i = 0; i < n; i++) dot += w[i] * w[i + lag];
    const e0 = prefix[n];
    const e1 = prefix[len] - prefix[lag];
    if (e0 <= 1e-9 || e1 <= 1e-9) continue;
    const r = dot / Math.sqrt(e0 * e1);
    if (r > bestR) {
      bestR = r;
      bestLag = lag;
    }
  }
  if (bestLag < 0) return { f0: 0, clarity: 0 };
  return { f0: sr / bestLag, clarity: clamp(bestR, 0, 1) };
}

function trackPitch(audio: Float32Array, sr: number): Frame[] {
  const frameLen = Math.max(64, Math.round(FRAME_S * sr));
  const hop = Math.max(16, Math.round(HOP_S * sr));
  const raw: Frame[] = [];

  for (let start = 0; start + frameLen <= audio.length; start += hop) {
    let sum = 0;
    for (let i = 0; i < frameLen; i++) sum += audio[start + i] * audio[start + i];
    const rms = Math.sqrt(sum / frameLen);
    const { f0, clarity } = frameF0(audio, start, frameLen, sr);
    raw.push({ f0, clarity, rms, semitone: 0, level: 0, voiced: false });
  }
  if (raw.length === 0) return raw;

  const rmsValues = raw.map((f) => f.rms);
  const energyFloor = Math.max(0.004, 0.18 * percentile(rmsValues, 90));

  for (const f of raw) {
    f.voiced = f.clarity >= CLARITY_MIN && f.rms >= energyFloor && f.f0 >= MIN_F0 && f.f0 <= MAX_F0;
  }

  const voicedF0 = raw.filter((f) => f.voiced).map((f) => f.f0);
  if (voicedF0.length < 4) return raw;

  const medianF0 = median(voicedF0);
  for (const f of raw) {
    f.semitone = f.voiced && f.f0 > 0 ? 12 * Math.log2(f.f0 / medianF0) : 0;
  }

  const st = raw.filter((f) => f.voiced).map((f) => f.semitone);
  const p5 = percentile(st, 5);
  const p95 = percentile(st, 95);
  // A monotone reading collapses the range; widen it so we don't amplify noise.
  const span = Math.max(p95 - p5, 3);
  const low = (p5 + p95) / 2 - span / 2;
  for (const f of raw) {
    f.level = clamp((f.semitone - low) / span, 0, 1);
  }
  return raw;
}

interface Seg {
  from: number;
  to: number;
}

function segmentSyllables(frames: Frame[]): Seg[] {
  const segs: Seg[] = [];
  let cur: number[] = [];

  const close = () => {
    if (cur.length >= 4) segs.push({ from: cur[0], to: cur[cur.length - 1] });
    cur = [];
  };

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!f.voiced) {
      close();
      continue;
    }
    if (cur.length >= MIN_SEG_FRAMES) {
      const ref = median(cur.map((k) => frames[k].semitone));
      if (Math.abs(f.semitone - ref) > SPLIT_SEMITONES) {
        close();
      }
    }
    cur.push(i);
  }
  close();

  // Drop slivers that are clearly click/noise artefacts next to a real segment.
  const substantial = segs.filter((s) => s.to - s.from >= 4);
  return substantial.length > 0 ? substantial : segs;
}

function sampleContour(frames: Frame[], from: number, to: number, points: number): number[] {
  const out: number[] = [];
  const span = Math.max(1, to - from);
  for (let i = 0; i < points; i++) {
    const at = from + Math.round((i / (points - 1)) * span);
    out.push(frames[clamp(at, from, to)].level);
  }
  return out;
}

function resample5(contour: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 5; i++) {
    out.push(contour[Math.round((i / 4) * (contour.length - 1))]);
  }
  return out;
}

function distance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / a.length);
}

export function classifyTone(contour: number[]): { tone: number; confidence: number } {
  const probe = resample5(contour);
  const ranked = [1, 2, 3, 4]
    .map((tone) => ({ tone, d: distance(probe, TEMPLATES[tone]) }))
    .sort((a, b) => a.d - b.d);

  const best = ranked[0];
  const second = ranked[1];
  const margin = clamp((second.d - best.d) / Math.max(0.08, second.d), 0, 1);
  const fit = clamp(1 - best.d / 0.5, 0, 1);
  const confidence = clamp(0.45 * margin + 0.55 * fit, 0, 1);
  return { tone: best.tone, confidence };
}

function scoreAgainst(expected: number, detected: number, confidence: number): number {
  if (expected === detected) return Math.round(55 + 45 * confidence);
  // Confidently wrong is much worse than a coin-flip detection.
  return Math.round(Math.max(5, 45 * (1 - confidence)));
}

function buildTips(tones: ToneScore[], voicedRatio: number, aligned: boolean): string[] {
  const tips: string[] = [];

  if (!aligned) {
    tips.push(
      'I could not line your syllables up one-by-one, so the per-syllable scores below are estimated from timing alone. Try one phrase at a time, at a steady pace.',
    );
  }
  if (voicedRatio < 0.3) {
    tips.push('Very little of the recording sounded like speech — get closer to the mic and cut out background noise.');
  }

  const confusions = new Map<string, number>();
  let lowThird = 0;
  let thirdTotal = 0;
  for (const t of tones) {
    if (t.expected === 5) continue;
    if (t.expected === 3) {
      thirdTotal++;
      if (t.detected === 1) lowThird++;
    }
    if (t.detected !== t.expected && t.confidence > 0.35) {
      const key = `${t.expected}->${t.detected}`;
      confusions.set(key, (confusions.get(key) ?? 0) + 1);
    }
  }

  if (thirdTotal > 0 && lowThird === thirdTotal) {
    tips.push('Your third tone is coming out flat and high. Drop your pitch low first, then let it drift back up.');
  }

  const worst = [...confusions.entries()].sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 1) {
    const [from, to] = worst[0].split('->').map(Number);
    const hints: Record<string, string> = {
      '1->4': '1st tones are falling. Keep them level and hold them a beat longer.',
      '4->1': '4th tones are staying level. Let them fall sharply, like you are annoyed.',
      '2->3': '2nd tones are dipping. Start low and climb steadily to the top.',
      '3->2': '3rd tones are climbing too early. Stay low in the middle of the syllable.',
      '1->3': 'You are dipping tones that should be flat and high.',
      '3->1': 'You are flattening 3rd tones. They need to sink first.',
      '4->3': 'Falling tones are dipping instead. Drop straight down.',
      '2->1': 'Rising tones are staying flat. Push the pitch up as you finish the syllable.',
    };
    const hint = hints[`${from}->${to}`];
    if (hint) tips.push(hint);
  }

  return tips.slice(0, 3);
}

/**
 * Grades a recording against the tones you were supposed to say.
 * @param audio mono samples
 * @param sampleRate samples per second
 * @param expectedTones one entry per syllable of the target (5 = neutral, not scored)
 */
export function analyseTones(audio: Float32Array, sampleRate: number, expectedTones: number[]): PitchReport {
  const frames = trackPitch(audio, sampleRate);
  const voiced = frames.filter((f) => f.voiced);
  const voicedRatio = frames.length ? voiced.length / frames.length : 0;
  const durationS = audio.length / sampleRate;

  const base: PitchReport = {
    sampleRate,
    durationS,
    voicedRatio,
    f0Median: median(voiced.map((f) => f.f0)),
    segments: 0,
    aligned: false,
    contour: [],
    tones: [],
    averageScore: 0,
    summary: '',
    tips: [],
  };

  if (frames.length === 0 || voiced.length < 4) {
    return {
      ...base,
      summary: 'No pitched speech found in that recording.',
      tips: ['Hold the record button while you speak, and keep the phrase under about 10 seconds.'],
    };
  }

  const segs = segmentSyllables(frames);
  const first = voiced[0];
  const last = voiced[voiced.length - 1];
  const fromFrame = frames.indexOf(first);
  const toFrame = frames.indexOf(last);

  base.segments = segs.length;
  base.contour = sampleContour(frames, fromFrame, toFrame, CONTOUR_POINTS);

  const aligned = segs.length === expectedTones.length;
  base.aligned = aligned;

  const tones: ToneScore[] = expectedTones.map((expected, index) => {
    let contour: number[];
    let scale = 1;

    if (aligned) {
      const s = segs[index];
      contour = sampleContour(frames, s.from, s.to, 24);
    } else {
      // Proportional fallback: assume even pacing across the voiced span.
      const span = Math.max(1, toFrame - fromFrame);
      const a = fromFrame + Math.round((index / expectedTones.length) * span);
      const b = fromFrame + Math.round(((index + 1) / expectedTones.length) * span) - 1;
      contour = sampleContour(frames, a, Math.max(a + 1, b), 24);
      scale = 0.5;
    }

    const { tone, confidence } = classifyTone(contour);
    const conf = confidence * scale;
    return {
      index,
      expected,
      detected: tone,
      confidence: conf,
      score: expected === 5 ? 0 : scoreAgainst(expected, tone, conf),
      contour,
    };
  });

  base.tones = tones;

  const scored = tones.filter((t) => t.expected !== 5);
  base.averageScore = scored.length
    ? Math.round(scored.reduce((a, t) => a + t.score, 0) / scored.length)
    : 0;

  const hits = scored.filter((t) => t.detected === t.expected).length;
  base.summary = scored.length
    ? `${hits}/${scored.length} syllables matched the target tone · ${base.averageScore}%`
    : 'Nothing scoreable in that phrase (all neutral tones).';
  base.tips = buildTips(tones, voicedRatio, aligned);

  return base;
}
