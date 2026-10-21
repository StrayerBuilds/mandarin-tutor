/**
 * Shadowing: hear a line, say it back, get graded on both the words (on-device
 * speech recognition) and the melody (pitch analysis). The recording never
 * leaves the phone.
 */
import { h, button, card, frag } from '../dom';
import { meter, notice, phraseCard, pitchCanvas, scoreRing } from '../components';
import { LESSONS } from '../../content/lessons';
import { transcribe } from '../../ai/asr';
import { MicRecorder } from '../../ai/recorder';
import { scoreAttempt, type ShadowResult } from '../../nlp/score';
import { tts } from '../../ai/tts';
import { store } from '../../store';
import { app, ensureSpeech, subscribe } from '../state';
import type { Phrase } from '../../types';

type Phase = 'idle' | 'preparing' | 'recording' | 'working';

export function mount(container: HTMLElement): () => void {
  let lessonIndex = 0;
  let phraseIndex = 0;
  let result: ShadowResult | null = null;
  /** True when the words could not be checked, so the grade falls back to tones. */
  let skippedWords = false;
  let phase: Phase = 'idle';
  let status = '';

  const recorder = new MicRecorder();

  const phrase = (): Phrase => LESSONS[lessonIndex].phrases[phraseIndex];

  function hasTones(r: ShadowResult | null): boolean {
    return !!r?.pitch?.tones.some((t) => t.expected !== 5);
  }

  function shownScore(r: ShadowResult): number {
    if (skippedWords && r.pitch && r.pitch.tones.some((t) => t.expected !== 5)) {
      return r.pitch.averageScore;
    }
    return r.overall;
  }

  function statusText(): string {
    if (phase === 'preparing' && app.speech.state === 'loading') {
      return `Downloading the speech model once — ${Math.round(app.speech.progress * 100)}%. It is cached on this phone afterwards.`;
    }
    return status;
  }

  async function speak(): Promise<void> {
    tts.unlock();
    await tts.speak(phrase().hanzi, app.settings.speechRate);
  }

  function step(delta: number): void {
    let li = lessonIndex;
    let pi = phraseIndex + delta;

    while (pi < 0) {
      li -= 1;
      if (li < 0) li = LESSONS.length - 1;
      pi += LESSONS[li].phrases.length;
    }
    while (pi >= LESSONS[li].phrases.length) {
      pi -= LESSONS[li].phrases.length;
      li = (li + 1) % LESSONS.length;
    }

    lessonIndex = li;
    phraseIndex = pi;
    result = null;
    status = '';
    render();
  }

  async function startRecording(): Promise<void> {
    result = null;
    skippedWords = false;
    phase = 'preparing';
    status = 'Getting the microphone ready…';
    render();

    try {
      const ok = await ensureSpeech();
      skippedWords = !ok;
      if (!ok) {
        status = 'Speech model unavailable — recording anyway, tones only.';
        render();
      }

      await recorder.start(10000);
      phase = 'recording';
      status = 'Recording — say the phrase, then tap Stop.';
      render();
    } catch (err) {
      phase = 'idle';
      status = (err as Error).message;
      render();
    }
  }

  async function finishRecording(): Promise<void> {
    phase = 'working';
    status = 'Analysing on this phone…';
    render();

    try {
      const clip = await recorder.stop();

      let transcript = '';
      if (!skippedWords) {
        status = 'Transcribing on this phone…';
        render();
        try {
          transcript = await transcribe(clip.audio);
        } catch {
          // Recognition failed (noise, empty clip). Tone grading still works.
          skippedWords = true;
        }
      }

      result = scoreAttempt(phrase(), transcript, clip.audio, clip.sampleRate);
      store.recordAttempt(phrase().id, shownScore(result));
    } catch (err) {
      status = (err as Error).message;
    } finally {
      phase = 'idle';
      render();
    }
  }

  function toggleRecord(): void {
    if (phase === 'recording') {
      void finishRecording();
      return;
    }
    if (phase === 'idle') void startRecording();
  }

  function resultsCard(): HTMLElement | null {
    if (!result) return null;
    const r = result;
    const tones = hasTones(r);

    return card(
      h('h2', { text: 'Your attempt' }),
      h('div', { class: 'result' },
        scoreRing(shownScore(r)),
        h('div', { class: 'result__text' },
          h('p', { text: r.verdict }),
          r.transcript
            ? h('p', { class: 'muted small', text: `I heard: ${r.transcript}` })
            : h('p', {
                class: 'muted small',
                text: skippedWords
                  ? 'Word matching was skipped, so this attempt is graded on tones alone.'
                  : 'No words were recognised. Get closer to the mic and try again.',
              }),
        ),
      ),
      meter('Words matched', r.contentScore),
      tones ? meter('Tones', r.toneScore) : null,
      r.missing.length ? h('p', { class: 'muted small', text: `Missed: ${r.missing.join(' ')}` }) : null,
      r.extra.length ? h('p', { class: 'muted small', text: `Extra: ${r.extra.join(' ')}` }) : null,
      r.pitch
        ? frag(
            h('h3', { text: 'Your pitch against the target' }),
            pitchCanvas(r.pitch.contour, r.pitch.tones),
            h('p', { class: 'muted small', text: r.pitch.summary }),
          )
        : null,
      r.pitch && r.pitch.tips.length
        ? h('ul', { class: 'bullets' }, ...r.pitch.tips.map((tip) => h('li', { text: tip })))
        : null,
    );
  }

  function render(): void {
    container.textContent = '';
    const p = phrase();
    const attempt = store.progress()[p.id];

    const recordLabel =
      phase === 'recording'
        ? '⏹ Stop'
        : phase === 'preparing'
          ? 'Preparing…'
          : phase === 'working'
            ? 'Working…'
            : '🎤 Record';

    container.append(
      frag(
        h('h1', { class: 'view__title', text: 'Shadowing' }),
        h('p', { class: 'view__sub', text: 'Listen to a line, say it back, and get graded on the words and the tones.' }),
        MicRecorder.isSupported()
          ? null
          : notice('This browser cannot record audio, so shadowing is unavailable here.', 'warn'),
        app.tts.available ? null : notice(app.tts.message, 'warn'),
        app.settings.useWebSpeechSTT
          ? notice(
              'Shadowing always uses the on-device recogniser, because the tone grader needs the actual recording. That setting applies to the Conversation tab.',
              'info',
            )
          : null,

        h('div', { class: 'chips chips--wrap' },
          ...LESSONS.map((lesson, index) =>
            h('button', {
              class: `chip${index === lessonIndex ? ' chip--on' : ''}`,
              attrs: { type: 'button' },
              text: lesson.title,
              onClick: () => {
                lessonIndex = index;
                phraseIndex = 0;
                result = null;
                status = '';
                render();
              },
            }),
          ),
        ),

        card(
          phraseCard(p, {
            showPinyin: app.settings.showPinyin,
            showEnglish: app.settings.showEnglish,
            toneScores: result?.pitch?.tones,
            onSpeak: () => void speak(),
          }),
          attempt
            ? h('p', {
                class: 'muted small',
                text: `Best ${Math.round(attempt.best)}% · ${attempt.attempts} attempt${attempt.attempts === 1 ? '' : 's'}`,
              })
            : null,
          h('div', { class: 'row' },
            button(recordLabel, 'btn btn--mic', () => toggleRecord(), {
              disabled: phase === 'preparing' || phase === 'working',
            }),
            button('🔊 Hear it', 'btn btn--ghost', () => void speak()),
          ),
          h('div', { class: 'composer__status', text: statusText() }),
        ),

        resultsCard(),

        h('div', { class: 'row row--end' },
          button('◀ Previous', 'btn btn--ghost small-btn', () => step(-1)),
          h('span', { class: 'muted small', text: `${phraseIndex + 1} / ${LESSONS[lessonIndex].phrases.length}` }),
          button('Next ▶', 'btn btn--ghost small-btn', () => step(1)),
        ),
      ),
    );
  }

  render();

  const unsubscribe = subscribe(() => {
    // Never rebuild the page under an active microphone or while scoring.
    if (phase === 'recording' || phase === 'working') return;
    render();
  });

  return () => {
    unsubscribe();
    recorder.cancel();
  };
}
