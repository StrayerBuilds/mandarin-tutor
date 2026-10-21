/**
 * Numbered-pinyin helpers.
 *
 * Lessons are authored as numbered pinyin ("ni3 hao3") because that form is
 * unambiguous and trivial to score against. Learners read tone marks, so we
 * convert to diacritics for display.
 */

const TONE_MARKS: Record<string, string[]> = {
  a: ['a', 'ā', 'á', 'ǎ', 'à'],
  o: ['o', 'ō', 'ó', 'ǒ', 'ò'],
  e: ['e', 'ē', 'é', 'ě', 'è'],
  i: ['i', 'ī', 'í', 'ǐ', 'ì'],
  u: ['u', 'ū', 'ú', 'ǔ', 'ù'],
  ü: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

const MARK_TO_PLAIN = new Map<string, { plain: string; tone: number }>();
for (const [plain, marks] of Object.entries(TONE_MARKS)) {
  marks.forEach((m, i) => {
    if (i > 0) MARK_TO_PLAIN.set(m, { plain, tone: i });
  });
}

export interface Syllable {
  /** Plain syllable without the tone digit, e.g. "hao". */
  plain: string;
  /** 1-4 for full tones, 5 for neutral (no mark / tone 5). */
  tone: number;
  /** The syllable as authored, digit form, e.g. "hao3". */
  raw: string;
}

export function toneOfSyllable(raw: string): number {
  const m = raw.match(/(\d)$/);
  if (m) {
    const t = Number(m[1]);
    return t >= 1 && t <= 5 ? t : 5;
  }
  // Diacritic form, e.g. "hǎo"
  for (const ch of raw) {
    const hit = MARK_TO_PLAIN.get(ch);
    if (hit) return hit.tone;
  }
  return 5;
}

export function plainOfSyllable(raw: string): string {
  let out = raw.replace(/\d$/, '').replace(/v/g, 'ü').toLowerCase();
  for (const ch of out) {
    const hit = MARK_TO_PLAIN.get(ch);
    if (hit) {
      out = out.replace(ch, hit.plain);
    }
  }
  return out;
}

export function parsePinyin(pinyin: string): Syllable[] {
  return pinyin
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, plain: plainOfSyllable(raw), tone: toneOfSyllable(raw) }));
}

/**
 * Which letter carries the tone mark.
 * Rule: 'a' wins; else the later of 'o'/'e'; else the last vowel (covers iu/ui,
 * and ü in lü/nü).
 */
function markIndex(s: string): number {
  const a = s.indexOf('a');
  if (a >= 0) return a;
  const o = s.indexOf('o');
  const e = s.indexOf('e');
  if (o >= 0 || e >= 0) return Math.max(o, e);
  for (let i = s.length - 1; i >= 0; i--) {
    if ('iuü'.includes(s[i])) return i;
  }
  return -1;
}

/** "hao3" -> "hǎo" */
export function toMarked(raw: string): string {
  const tone = toneOfSyllable(raw);
  const s = raw
    .replace(/\d$/, '')
    .replace(/v/g, 'ü')
    .toLowerCase();
  if (tone < 1 || tone > 4) return s;

  const target = markIndex(s);
  if (target < 0) return s;

  const marks = TONE_MARKS[s[target]];
  if (!marks) return s;
  return s.slice(0, target) + marks[tone] + s.slice(target + 1);
}

/** Whole phrase to marked pinyin: "ni3 hao3" -> "nǐ hǎo" */
export function toMarkedPhrase(pinyin: string): string {
  return parsePinyin(pinyin)
    .map((s) => toMarked(s.raw))
    .join(' ');
}

export function toneClassLabel(tone: number): string {
  switch (tone) {
    case 1:
      return '1st tone · high & flat';
    case 2:
      return '2nd tone · rising';
    case 3:
      return '3rd tone · dip & rise';
    case 4:
      return '4th tone · falling';
    default:
      return 'neutral · light & short';
  }
}

export function toneMarkSample(tone: number): string {
  switch (tone) {
    case 1:
      return 'ā';
    case 2:
      return 'á';
    case 3:
      return 'ǎ';
    case 4:
      return 'à';
    default:
      return 'a';
  }
}

/** Strips everything that is not a CJK ideograph, so ASR noise can't skew scoring. */
export function hanziOnly(input: string): string {
  return [...input].filter((ch) => /\p{Script=Han}/u.test(ch)).join('');
}

export function countHanzi(input: string): number {
  return hanziOnly(input).length;
}
