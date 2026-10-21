/**
 * Turns a recording into a grade: what you said (local speech recognition) plus
 * how you said it (pitch analysis), combined into one score with actionable notes.
 */
import { analyseTones } from './pitch';
import { hanziOnly, parsePinyin } from './pinyin';
import type { Phrase, PitchReport } from '../types';

export interface ShadowResult {
  transcript: string;
  contentScore: number;
  toneScore: number;
  overall: number;
  /** Target characters the recogniser did not hear. */
  missing: string[];
  /** Characters it heard that aren't in the target. */
  extra: string[];
  pitch: PitchReport | null;
  verdict: string;
}

/** Longest common subsequence over characters, with the unmatched characters on both sides. */
function alignChars(target: string[], heard: string[]) {
  const n = target.length;
  const m = heard.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = target[i] === heard[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const missing: string[] = [];
  const extra: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (target[i] === heard[j]) {
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      missing.push(target[i++]);
    } else {
      extra.push(heard[j++]);
    }
  }
  while (i < n) missing.push(target[i++]);
  while (j < m) extra.push(heard[j++]);

  return { lcs: dp[0][0], missing, extra };
}

export function scoreAttempt(
  phrase: Phrase,
  transcript: string,
  audio: Float32Array,
  sampleRate: number,
): ShadowResult {
  const target = [...hanziOnly(phrase.hanzi)];
  const heard = [...hanziOnly(transcript)];
  const { lcs, missing, extra } = alignChars(target, heard);

  const recall = target.length ? lcs / target.length : 0;
  const precision = heard.length ? lcs / heard.length : 0;
  const f1 = recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0;
  const contentScore = Math.round(f1 * 100);

  const expectedTones = parsePinyin(phrase.pinyin).map((s) => s.tone);
  const pitch = audio.length > 0 ? analyseTones(audio, sampleRate, expectedTones) : null;
  const scoreable = expectedTones.filter((t) => t !== 5).length;
  const toneScore = pitch && scoreable > 0 ? pitch.averageScore : 0;

  const overall =
    pitch && scoreable > 0 ? Math.round(0.55 * contentScore + 0.45 * toneScore) : contentScore;

  let verdict: string;
  if (overall >= 90) verdict = 'Excellent — that was clear.';
  else if (overall >= 75) verdict = 'Good. Close to the target.';
  else if (overall >= 55) verdict = 'Understandable, but the tones need work.';
  else if (overall >= 30) verdict = 'Partly there — listen to the model again and copy the melody.';
  else verdict = 'Not matching yet. Slow down and copy the model one syllable at a time.';

  return {
    transcript,
    contentScore,
    toneScore,
    overall,
    missing,
    extra,
    pitch,
    verdict,
  };
}
