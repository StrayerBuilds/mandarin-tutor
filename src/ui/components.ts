/** Reusable pieces of the practice UI. */
import { h, scoreClass } from './dom';
import { parsePinyin, toMarked, toneClassLabel } from '../nlp/pinyin';
import { toneTemplate } from '../nlp/pitch';
import type { Phrase, ToneScore } from '../types';

export interface PhraseOptions {
  showPinyin?: boolean;
  showEnglish?: boolean;
  /** Per-syllable grade, used to colour each character. */
  toneScores?: ToneScore[];
  onSpeak?: () => void;
}

/** Characters with their pinyin above them, optionally colour-coded by grade. */
export function phraseCard(phrase: Phrase, opts: PhraseOptions = {}): HTMLElement {
  const { showPinyin = true, showEnglish = true, toneScores, onSpeak } = opts;
  const syllables = parsePinyin(phrase.pinyin);
  const chars = [...phrase.hanzi];

  const row = h('div', { class: 'phrase__row' });
  chars.forEach((char, index) => {
    const syllable = syllables[index];
    const score = toneScores?.find((t) => t.index === index);
    const cell = h('div', { class: 'phrase__cell' });

    if (showPinyin && syllable) {
      cell.append(h('span', { class: 'phrase__pinyin', text: toMarked(syllable.raw) }));
    }
    const mark = h('span', { class: 'phrase__char', text: char });
    if (score && score.expected !== 5) {
      mark.classList.add('phrase__char--' + scoreClass(score.score));
      const heard = score.detected && score.detected !== score.expected ? ` · heard ${toneClassLabel(score.detected)}` : '';
      mark.title = `${toneClassLabel(score.expected)}${heard} · ${Math.round(score.score)}%`;
    }
    cell.append(mark);
    row.append(cell);
  });

  const body = h('div', { class: 'phrase__body' }, row);
  if (showEnglish && phrase.en) {
    body.append(h('div', { class: 'phrase__en', text: phrase.en }));
  }

  const wrap = h('div', { class: 'phrase' }, body);
  if (onSpeak) {
    wrap.classList.add('phrase--tappable');
    wrap.addEventListener('click', onSpeak);
    wrap.append(h('span', { class: 'phrase__hint', text: '🔊 tap to hear' }));
  }
  return wrap;
}

/**
 * Draws the learner's pitch curve against the four canonical tone shapes, one
 * dashed target per syllable. This is the bit that makes "your third tone is
 * flat" visible instead of mysterious.
 */
export function pitchCanvas(contour: number[], tones: ToneScore[]): HTMLCanvasElement {
  const width = 620;
  const height = 200;
  const canvas = h('canvas', { class: 'pitch' });
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const padX = 10;
  const padY = 14;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const xAt = (t: number) => padX + t * plotW;
  const yAt = (level: number) => padY + (1 - level) * plotH;

  ctx.clearRect(0, 0, width, height);

  // Grid: high / mid / low bands.
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (const level of [0, 0.5, 1]) {
    ctx.beginPath();
    ctx.moveTo(padX, yAt(level));
    ctx.lineTo(width - padX, yAt(level));
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('high', padX + 2, yAt(1) + 12);
  ctx.fillText('low', padX + 2, yAt(0) - 4);

  const slots = Math.max(1, tones.length);

  // Dashed reference contour per syllable.
  tones.forEach((tone, slot) => {
    if (tone.expected === 5) return;
    const template = toneTemplate(tone.expected);
    const from = slot / slots;
    const to = (slot + 1) / slots;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    template.forEach((level, i) => {
      const x = xAt(from + (i / (template.length - 1)) * (to - from));
      const y = yAt(level);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  });

  // The learner's own pitch.
  if (contour.length > 1) {
    ctx.strokeStyle = '#ff8a70';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    contour.forEach((level, i) => {
      const x = xAt(i / (contour.length - 1));
      const y = yAt(level);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // Per-syllable verdict chips along the bottom.
  tones.forEach((tone, slot) => {
    if (tone.expected === 5) return;
    const x = xAt((slot + 0.5) / slots);
    const ok = tone.detected === tone.expected;
    ctx.fillStyle = ok ? '#57d9a3' : '#ff6b6b';
    ctx.beginPath();
    ctx.arc(x, height - 8, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  return canvas;
}

export function scoreRing(score: number): HTMLElement {
  return h(
    'div',
    { class: `ring ring--${scoreClass(score)}` },
    h('span', { class: 'ring__value', text: String(Math.round(score)) }),
    h('span', { class: 'ring__label', text: 'score' }),
  );
}

export function meter(label: string, value: number): HTMLElement {
  return h(
    'div',
    { class: 'meter' },
    h('div', { class: 'meter__head' }, h('span', { text: label }), h('span', { text: `${Math.round(value)}%` })),
    h('div', { class: 'meter__track' }, h('div', { class: `meter__fill meter__fill--${scoreClass(value)}`, style: { width: `${Math.max(2, value)}%` } })),
  );
}

export function notice(text: string, kind: 'info' | 'warn' | 'error' = 'info'): HTMLElement {
  return h('div', { class: `notice notice--${kind}`, text });
}
