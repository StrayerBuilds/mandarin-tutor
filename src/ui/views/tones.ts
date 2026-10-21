/**
 * Tone trainer.
 *
 * You hear one word from a minimal quadruplet (mā má mǎ mà) and pick the tone
 * you heard. Everything is spoken by the phone's own voice, so the drill works
 * with no network and no accounts.
 */
import { h, button, card, frag } from '../dom';
import { meter, notice } from '../components';
import { TONE_SETS } from '../../content/tones';
import { toMarked, toneClassLabel, toneMarkSample } from '../../nlp/pinyin';
import { tts } from '../../ai/tts';
import { store } from '../../store';
import { app, subscribe } from '../state';
import type { Tone, ToneSet, ToneWord } from '../../types';

const TONES: Tone[] = [1, 2, 3, 4];

export function mount(container: HTMLElement): () => void {
  let setIndex = 0;
  let target: ToneWord | null = null;
  let chosen: Tone | null = null;
  const session = { correct: 0, total: 0 };

  const currentSet = (): ToneSet => TONE_SETS[setIndex];

  function play(word: ToneWord | null = target): void {
    if (!word) return;
    tts.unlock();
    void tts.speak(word.hanzi, app.settings.speechRate);
  }

  function nextRound(playIt = true): void {
    const words = currentSet().words;
    if (words.length === 0) return;

    let pick = words[Math.floor(Math.random() * words.length)];
    // Avoid repeating the same tone twice in a row when there is a choice.
    for (let guard = 0; target && pick.tone === target.tone && guard < 8; guard++) {
      pick = words[Math.floor(Math.random() * words.length)];
    }

    target = pick;
    chosen = null;
    render();
    if (playIt) play();
  }

  function answer(tone: Tone): void {
    if (!target || chosen !== null) return;
    chosen = tone;

    const correct = tone === target.tone;
    session.total += 1;
    if (correct) session.correct += 1;
    store.recordToneDrill(currentSet().id, target.tone, correct);

    render();
    // Replay so the answer and the sound line up in your head.
    play();
  }

  function answerRow(): HTMLElement {
    const answered = chosen !== null && target !== null;
    return h('div', { class: 'answers' },
      ...TONES.map((tone) => {
        let cls = 'answer';
        if (answered && target) {
          if (tone === target.tone) cls += ' answer--right';
          else if (tone === chosen) cls += ' answer--wrong';
        } else if (tone === chosen) {
          cls += ' answer--on';
        }
        return h(
          'button',
          { class: cls, attrs: { type: 'button' }, onClick: () => answer(tone) },
          h('span', { class: 'answer__mark', text: toneMarkSample(tone) }),
          h('span', { class: 'answer__label', text: toneClassLabel(tone) }),
        );
      }),
    );
  }

  function revealCard(): HTMLElement | null {
    if (!target || chosen === null) return null;
    const correct = chosen === target.tone;
    const stats = store.toneStats()[`${currentSet().id}:${target.tone}`];

    return card(
      h('div', { class: `reveal reveal--${correct ? 'good' : 'bad'}` },
        h('p', { class: 'reveal__verdict', text: correct ? 'Correct' : `Not quite — that was ${toneClassLabel(target.tone)}` }),
        h('div', { class: 'reveal__word' },
          h('span', { class: 'reveal__hanzi', text: target.hanzi }),
          h('span', { class: 'reveal__pinyin', text: toMarked(target.pinyin) }),
          h('span', { class: 'muted small', text: target.en }),
        ),
        stats ? h('p', { class: 'muted small', text: `${toneClassLabel(target.tone)}: ${stats.correct}/${stats.total} so far` }) : null,
      ),
      h('div', { class: 'row' },
        button('🔊 Again', 'btn btn--ghost', () => play()),
        button('Next word', 'btn', () => nextRound()),
      ),
    );
  }

  function statsCard(): HTMLElement {
    const stats = store.toneStats();
    const setId = currentSet().id;
    const rows = TONES.map((tone) => {
      const stat = stats[`${setId}:${tone}`];
      if (!stat || stat.total === 0) {
        return h('p', { class: 'muted small', text: `${toneClassLabel(tone)} — not drilled yet` });
      }
      return meter(
        `${toneClassLabel(tone)} (${stat.correct}/${stat.total})`,
        Math.round((stat.correct / stat.total) * 100),
      );
    });

    return card(
      h('h2', { text: 'How this set is going' }),
      session.total > 0
        ? h('p', { class: 'muted small', text: `This session: ${session.correct}/${session.total} correct.` })
        : null,
      ...rows,
    );
  }

  function referenceCard(): HTMLElement {
    const set = currentSet();
    return card(
      h('h2', { text: `${set.syllable} — the four tones` }),
      h('p', { class: 'muted', text: 'Only the tone changes the meaning. Tap any word to hear it.' }),
      h('div', { class: 'tones__grid' },
        ...set.words.map((word) =>
          h(
            'button',
            { class: 'toneword', attrs: { type: 'button' }, onClick: () => play(word) },
            h('span', { class: 'toneword__pinyin', text: toMarked(word.pinyin) }),
            h('span', { class: 'toneword__hanzi', text: word.hanzi }),
            h('span', { class: 'toneword__en', text: word.en }),
          ),
        ),
      ),
    );
  }

  function render(): void {
    container.textContent = '';
    const set = currentSet();

    container.append(
      frag(
        h('h1', { class: 'view__title', text: 'Tone trainer' }),
        h('p', { class: 'view__sub', text: 'Hear a word, pick the tone you heard. Drilling these pairs is what makes Chinese sound right.' }),
        app.tts.available ? null : notice(app.tts.message, 'warn'),

        h('div', { class: 'chips chips--wrap' },
          ...TONE_SETS.map((item, index) =>
            h('button', {
              class: `chip${index === setIndex ? ' chip--on' : ''}`,
              attrs: { type: 'button' },
              text: item.syllable,
              onClick: () => {
                setIndex = index;
                target = null;
                chosen = null;
                nextRound();
              },
            }),
          ),
        ),

        card(
          h('h2', { text: `Which tone did you hear? (${set.syllable})` }),
          h('p', { class: 'muted', text: target ? 'Listen, then pick the tone. The word stays hidden until you answer.' : 'Press play and pick the tone you hear.' }),
          h('div', { class: 'row' },
            button('🔊 Play the word', 'btn', () => (target ? play() : nextRound())),
            button('Skip', 'btn btn--ghost', () => nextRound()),
          ),
          answerRow(),
        ),

        revealCard(),
        referenceCard(),
        statsCard(),
      ),
    );
  }

  render();

  const unsubscribe = subscribe(render);

  return () => {
    unsubscribe();
    tts.cancel();
  };
}
