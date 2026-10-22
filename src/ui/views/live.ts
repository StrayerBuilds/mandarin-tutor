/**
 * Live conversation: tap once, then just talk.
 *
 * Each turn is listen → transcribe → reply → speak, and the microphone is only
 * open while listening, so the tutor's own voice can never feed back into the
 * next turn. 小文 leads in English and then gives the Chinese, because the
 * learner cannot follow spoken Chinese yet.
 *
 * The tutor also names the topic and the activity it wants to do next, which
 * this view turns into a repeat-after-me drill graded exactly like Shadowing —
 * same word matching, same tone analysis, same history.
 */
import { h, button, card, frag } from '../dom';
import { meter, notice, phraseCard, pitchCanvas, scoreRing } from '../components';
import { parseTutorReply } from '../../content/prompts';
import { LESSONS, matchLessons } from '../../content/lessons';
import { transcribe, transcribeWithWebSpeech, webSpeechSupported, isNoiseTranscript } from '../../ai/asr';
import { MicRecorder, type Recording } from '../../ai/recorder';
import { generatePhrases, streamReply } from '../../ai/tutor';
import { tts } from '../../ai/tts';
import { scoreAttempt, type ShadowResult } from '../../nlp/score';
import { store } from '../../store';
import { app, ensureSpeech, loadModel, subscribe, unloadModel } from '../state';
import type { ChatMessage, Lesson, Phrase, TutorReply } from '../../types';

type Phase = 'off' | 'listening' | 'thinking' | 'speaking';

/** Focused repeat-after-me activity, run inside Live rather than handing off. */
type DrillPhase = 'idle' | 'modelling' | 'listening' | 'grading';

interface Line {
  kind: 'learner' | 'tutor';
  text?: string;
  reply?: TutorReply;
}

interface Suggestion {
  topic: string;
  /** What 小文 wants the two of you to do together, in its own words. */
  activity: string;
  lesson: Lesson | null;
  phrases: Phrase[] | null;
  busy: boolean;
  failed: boolean;
}

interface Drill {
  phrases: Phrase[];
  index: number;
  result: ShadowResult | null;
  /** The number shown on the ring — tones alone when word matching was skipped. */
  shown: number;
  skippedWords: boolean;
  phase: DrillPhase;
  status: string;
}

const OPENING: TutorReply = {
  zh: '你好，我是小文。',
  pinyin: 'ni3 hao3 wo3 shi4 xiao3 wen2',
  en: "Hey, good to meet you — I'm Xiaowen. I'll say things in English first, then in Chinese. So, what's on your mind today?",
  note: 'Talk to me in English or Chinese, whichever comes out — I understand both.',
  activity: 'Tell me what to teach you',
  raw: '',
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The real reason a turn produced nothing.
 *
 * A model worker that the phone has killed rejects with an event or a bare
 * object, not an Error, so `(err as Error).message` is empty. Reporting that
 * empty string is what turned a crashed model into the vague "empty reply".
 */
function describeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  const loose = err as { message?: string; type?: string; error?: unknown };
  if (loose?.error instanceof Error && loose.error.message) return loose.error.message;
  if (typeof loose?.message === 'string' && loose.message) return loose.message;
  if (typeof loose?.type === 'string' && loose.type) return `the tutor model stopped (${loose.type})`;
  const text = String(err ?? '').trim();
  return text && text !== '[object Object]' ? text : 'the tutor model stopped responding';
}

/**
 * How long to wait after 小文 stops talking before opening the microphone. The
 * speaker and the room keep ringing for a moment, and without this gap the tail
 * of its own voice counts as the learner starting to speak.
 */
const SPEAKER_SETTLE_MS = 650;

export function mount(container: HTMLElement, openLesson: (lessonId: string) => void): () => void {
  let phase: Phase = 'off';
  let status = '';
  let lines: Line[] = [];
  let history: ChatMessage[] = [];
  let streaming: string | null = null;
  let suggestion: Suggestion | null = null;
  let drill: Drill | null = null;
  let lastTopic = '';
  /** Why the last turn produced no answer, kept on screen until it works again. */
  let replyError = '';
  /** Turns in a row that ended without an answer. */
  let emptyTurns = 0;
  /** Bumped on every end/interrupt so in-flight turns know they are stale. */
  let session = 0;
  /** Same idea for the drill, which runs while the conversation is stopped. */
  let drillSession = 0;

  const recorder = new MicRecorder();
  const webSpeech = () => app.settings.useWebSpeechSTT && webSpeechSupported();

  const micIcon = h('span', { class: 'live__icon', text: '🎙' });
  const micLabel = h('span', { class: 'live__label', text: 'Start' });
  const micBtn = h(
    'button',
    { class: 'live__mic', attrs: { type: 'button' }, onClick: () => onMic() },
    micIcon,
    micLabel,
  );
  const levelFill = h('i');
  const endBtn = button('End call', 'btn btn--ghost small-btn', () => end());
  const statusEl = h('div', { class: 'composer__status' });
  const noticesEl = h('div');
  const transcriptEl = h('div', { class: 'bubbles' });
  const practiceEl = h('div');
  const planEl = h('div');

  container.append(
    frag(
      h('h1', { class: 'view__title', text: 'Live' }),
      h('p', {
        class: 'view__sub',
        text: 'A hands-free conversation with 小文, your bilingual tutor. It answers in English first and then in Chinese, suggests what to do together, and scores your attempts the way Shadowing does.',
      }),
      noticesEl,
      h('div', { class: 'live' },
        micBtn,
        h('div', { class: 'live__level' }, levelFill),
      ),
      h('div', { class: 'live__controls' }, endBtn),
      statusEl,
      transcriptEl,
      practiceEl,
      planEl,
    ),
  );

  /* ---------- pieces of the page ---------- */

  function statusText(): string {
    if (phase === 'listening' && !webSpeech() && app.speech.state === 'loading') {
      return `Downloading the speech model once — ${Math.round(app.speech.progress * 100)}%. It is cached on this phone afterwards.`;
    }
    return status;
  }

  function notices(): Node[] {
    const out: Node[] = [];
    if (replyError) {
      // Never hide this. A turn that produces nothing is otherwise impossible to
      // diagnose from the outside.
      out.push(
        frag(
          notice(`小文 could not answer: ${replyError}`, 'error'),
          button('Reload the tutor model', 'btn small-btn', () => void reloadModel()),
        ),
      );
    }
    if (!MicRecorder.isSupported()) {
      out.push(notice('This browser cannot record audio, so live conversation is unavailable here.', 'warn'));
    }
    if (!app.tts.available) out.push(notice(app.tts.message, 'warn'));
    if (app.caps && !app.caps.webgpu) {
      out.push(
        notice(
          'No WebGPU on this device, so 小文 cannot answer free-form questions. You can still hold a conversation with the built-in scripted replies.',
          'info',
        ),
      );
    } else if (app.model.state === 'loading') {
      out.push(notice(`Loading 小文 — ${Math.round(app.model.progress * 100)}%. ${app.model.text}`, 'info'));
    } else if (app.model.state !== 'ready' && phase === 'off') {
      out.push(
        frag(
          notice('The tutor model is not loaded yet, so answers come from a small scripted tutor.', 'info'),
          button('Load the tutor model', 'btn small-btn', () => void loadModel()),
        ),
      );
    }
    return out;
  }

  /** A failed generation usually means the model's worker died. Reloading fixes it. */
  async function reloadModel(): Promise<void> {
    replyError = '';
    unloadModel();
    paint();
    await loadModel();
    if (app.model.state === 'error') {
      replyError = app.model.error ?? 'The tutor model could not be reloaded.';
    }
    paint();
  }

  /** English first, then the Chinese — so a beginner hears the meaning first. */
  async function say(reply: TutorReply): Promise<void> {
    const en = reply.en.trim();
    const zh = reply.zh.trim();
    if (en) await tts.speak(en, app.settings.speechRate, { lang: 'en' });
    if (zh) await tts.speak(zh, app.settings.speechRate, { lang: 'zh' });
  }

  function bubbleFor(reply: TutorReply, showSpeak: boolean): HTMLElement {
    const node = h('div', { class: 'bubble bubble--assistant' });
    node.append(
      h('div', { class: 'bubble__body' },
        app.settings.showEnglish && reply.en ? h('div', { class: 'bubble__en bubble__en--lead', text: reply.en }) : null,
        h('div', { class: 'bubble__zh', text: reply.zh }),
        app.settings.showPinyin && reply.pinyin ? h('div', { class: 'bubble__py', text: reply.pinyin }) : null,
        reply.note ? h('div', { class: 'bubble__note', text: reply.note }) : null,
      ),
    );
    if (showSpeak && reply.zh) {
      node.append(button('🔊', 'bubble__speak', () => void say(reply)));
    }
    return node;
  }

  function paintTranscript(): void {
    transcriptEl.textContent = '';
    if (lines.length === 0) {
      transcriptEl.append(
        h('div', { class: 'empty' },
          h('p', { class: 'muted', text: 'Tap the microphone and start talking. Say it in English — 小文 answers in English, then in Chinese. Your words are shown back so you can see what was heard.' }),
        ),
      );
      return;
    }
    for (const line of lines) {
      if (line.kind === 'learner') {
        // Shown back so the learner can tell straight away whether they were heard.
        transcriptEl.append(
          h('div', { class: 'bubble bubble--user' },
            h('div', { class: 'bubble__who', text: 'You said' }),
            h('div', { text: line.text ?? '' }),
          ),
        );
      } else if (line.reply) {
        transcriptEl.append(bubbleFor(line.reply, true));
      }
    }
    if (streaming !== null) {
      const partial = parseTutorReply(streaming);
      transcriptEl.append(
        h('div', { class: 'bubble bubble--assistant bubble--streaming' },
          h('div', { class: 'bubble__body' },
            h('div', { class: 'bubble__en bubble__en--lead', text: partial.en || '…' }),
            partial.zh ? h('div', { class: 'bubble__zh', text: partial.zh }) : null,
          ),
        ),
      );
    }
    requestAnimationFrame(() => {
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
    });
  }

  /** The lesson (or the lines) the tutor asked for last. */
  function practiceCard(): HTMLElement | null {
    if (!suggestion) return null;
    const s = suggestion;
    const phrases = drillPhrases();

    const rows: (HTMLElement | null)[] = [
      h('h2', { text: 'Practise together' }),
      h('p', { class: 'muted small', text: `小文 heard you are interested in: ${s.topic}` }),
    ];
    if (s.activity) rows.push(h('p', { class: 'muted small', text: `小文 suggests: ${s.activity}` }));

    if (s.lesson) {
      rows.push(
        phraseCard(s.lesson.phrases[0], {
          showPinyin: app.settings.showPinyin,
          showEnglish: app.settings.showEnglish,
          onSpeak: () => void tts.speak(s.lesson!.phrases[0].hanzi, app.settings.speechRate),
        }),
      );
    } else if (s.phrases) {
      rows.push(
        ...s.phrases.map((phrase) =>
          phraseCard(phrase, {
            showPinyin: app.settings.showPinyin,
            showEnglish: app.settings.showEnglish,
            onSpeak: () => void tts.speak(phrase.hanzi, app.settings.speechRate),
          }),
        ),
      );
    } else {
      rows.push(
        h('p', {
          class: 'muted small',
          text: 'No built-in lesson covers this yet. Write three lines for it and I will say them for you.',
        }),
        h('div', { class: 'row' },
          button(s.busy ? 'Writing…' : 'Write practice lines', 'btn', () => void makeLines(), {
            disabled: s.busy,
          }),
        ),
      );
    }

    if (phrases && phrases.length > 0) {
      rows.push(
        h('div', { class: 'row' },
          button('🎯 Do it together', 'btn btn--mic', () => startDrill()),
        ),
        h('p', {
          class: 'muted small',
          text: '小文 says each line in English and then Chinese, listens to you repeat it, and scores your words and tones — same grading as Shadowing.',
        }),
      );
    }

    if (s.failed) rows.push(notice('Could not write those lines. Try again in a moment.', 'warn'));

    return h('div', { class: 'card' }, ...rows);
  }

  /** The lines a drill would use: the matched lesson first, else the written ones. */
  function drillPhrases(): Phrase[] | null {
    if (!suggestion) return null;
    if (suggestion.lesson) return suggestion.lesson.phrases.slice(0, 4);
    if (suggestion.phrases && suggestion.phrases.length > 0) return suggestion.phrases;
    return null;
  }

  function startDrill(): void {
    const phrases = drillPhrases();
    if (!phrases || phrases.length === 0) return;
    drillSession += 1;
    drill = { phrases, index: 0, result: null, shown: 0, skippedWords: false, phase: 'idle', status: '' };
    tts.cancel();
    paint();
  }

  function closeDrill(): void {
    drillSession += 1;
    drill = null;
    tts.cancel();
    paint();
  }

  function stepDrill(delta: number): void {
    const d = drill;
    if (!d) return;
    drillSession += 1;
    d.index = (d.index + delta + d.phrases.length) % d.phrases.length;
    d.result = null;
    d.shown = 0;
    d.skippedWords = false;
    d.status = '';
    paint();
  }

  /** 小文 models the line the way it speaks everything else: English, then Chinese. */
  async function modelPhrase(phrase: Phrase): Promise<void> {
    tts.unlock();
    if (phrase.en) await tts.speak(phrase.en, app.settings.speechRate, { lang: 'en' });
    await tts.speak(phrase.hanzi, app.settings.speechRate, { lang: 'zh' });
  }

  /**
   * One turn of the activity: model it, hear it back hands-free, then grade it
   * with the same word-and-tone analysis Shadowing uses.
   */
  async function drillTurn(): Promise<void> {
    const d = drill;
    if (!d || d.phase !== 'idle') return;
    const phrase = d.phrases[d.index];
    const mine = ++drillSession;

    d.result = null;
    d.shown = 0;
    d.status = '';

    d.phase = 'modelling';
    d.status = 'Listen — English first, then the Chinese.';
    paint();
    await modelPhrase(phrase);
    if (mine !== drillSession) return;
    // Let the speaker and the room go quiet before the microphone opens.
    await delay(SPEAKER_SETTLE_MS);
    if (mine !== drillSession) return;

    d.phase = 'listening';
    d.status = 'Getting the microphone ready…';
    paint();
    const speechReady = await ensureSpeech();
    if (mine !== drillSession) return;

    d.status = "Your turn — say it back. I'll stop listening when you stop.";
    paint();

    let clip: Recording | null = null;
    try {
      clip = await recorder.listen({ onLevel: setLevel });
    } catch (err) {
      d.phase = 'idle';
      d.status = (err as Error).message;
      paint();
      return;
    }
    if (mine !== drillSession) return;
    if (!clip) {
      d.phase = 'idle';
      d.status = "I didn't catch that — tap Say it back and try again.";
      paint();
      return;
    }

    d.phase = 'grading';
    d.status = 'Marking your words and tones on this phone…';
    paint();

    let transcript = '';
    d.skippedWords = !speechReady;
    if (speechReady) {
      try {
        transcript = await transcribe(clip.audio);
      } catch {
        // Noise or an empty clip: the tone grader can still work on the audio.
        d.skippedWords = true;
      }
    }
    if (mine !== drillSession) return;

    const result = scoreAttempt(phrase, transcript, clip.audio, clip.sampleRate);
    const pitch = result.pitch;
    const tones = pitch?.tones.some((t) => t.expected !== 5) ?? false;
    // Word matching needs the recogniser; without it the tones alone are the fair grade.
    const shown = d.skippedWords && pitch && tones ? pitch.averageScore : result.overall;

    d.result = result;
    d.shown = shown;
    d.phase = 'idle';
    d.status = '';
    store.recordAttempt(phrase.id, shown);
    paint();
  }

  function drillResults(d: Drill): HTMLElement | null {
    if (!d.result) return null;
    const r = d.result;
    const tones = r.pitch?.tones.some((t) => t.expected !== 5) ?? false;

    return card(
      h('h2', { text: 'Your attempt' }),
      h('div', { class: 'result' },
        scoreRing(d.shown),
        h('div', { class: 'result__text' },
          h('p', { text: r.verdict }),
          r.transcript
            ? h('p', { class: 'muted small', text: `I heard: ${r.transcript}` })
            : h('p', {
                class: 'muted small',
                text: d.skippedWords
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

  function drillCard(): DocumentFragment | null {
    if (!drill) return null;
    const d = drill;
    const phrase = d.phrases[d.index];
    const busy = d.phase !== 'idle';
    const attempt = store.progress()[phrase.id];

    const label =
      d.phase === 'modelling'
        ? 'Listening…'
        : d.phase === 'listening'
          ? '👂 Listening'
          : d.phase === 'grading'
            ? 'Marking…'
            : '🎤 Say it back';

    return frag(
      card(
        h('h2', { text: 'Practising with 小文' }),
        h('p', {
          class: 'muted small',
          text: `Line ${d.index + 1} of ${d.phrases.length}. 小文 says it in English, then Chinese — copy the melody.`,
        }),
        phraseCard(phrase, {
          showPinyin: app.settings.showPinyin,
          showEnglish: app.settings.showEnglish,
          toneScores: d.result?.pitch?.tones,
          onSpeak: () => void modelPhrase(phrase),
        }),
        attempt
          ? h('p', {
              class: 'muted small',
              text: `Best ${Math.round(attempt.best)}% · ${attempt.attempts} attempt${attempt.attempts === 1 ? '' : 's'}`,
            })
          : null,
        h('div', { class: 'row' },
          button(label, 'btn btn--mic', () => void drillTurn(), { disabled: busy }),
          button('🔊 小文 says it', 'btn btn--ghost', () => void modelPhrase(phrase), { disabled: busy }),
        ),
        d.status ? h('div', { class: 'composer__status', text: d.status }) : null,
      ),
      drillResults(d),
      h('div', { class: 'row row--end' },
        button('◀ Previous', 'btn btn--ghost small-btn', () => stepDrill(-1), { disabled: busy }),
        button('Next ▶', 'btn btn--ghost small-btn', () => stepDrill(1), { disabled: busy }),
        button('Done', 'btn btn--ghost small-btn', () => closeDrill(), { disabled: busy }),
      ),
    );
  }

  function planCard(): HTMLElement | null {
    const plan = store.plan();
    const entries = Object.entries(plan)
      .sort((a, b) => b[1].last - a[1].last)
      .slice(0, 4);
    if (entries.length === 0) return null;

    return h('div', { class: 'card' },
      h('h2', { text: 'Your plan' }),
      h('p', { class: 'muted small', text: 'Topics the live tutor has suggested, newest first.' }),
      h('ul', { class: 'plan' },
        ...entries.map(([lessonId, item]) => {
          const lesson = LESSONS.find((l) => l.id === lessonId);
          return h('li', {},
            h('span', {},
              h('span', { class: 'plan__title', text: lesson?.title ?? lessonId }),
              h('span', { class: 'plan__topic', text: item.topic }),
            ),
            button('Open', 'btn btn--ghost small-btn', () => openLesson(lessonId)),
          );
        }),
      ),
    );
  }

  function paint(): void {
    const states: Record<Phase, { icon: string; label: string; cls: string }> = {
      off: { icon: '🎙', label: 'Start', cls: '' },
      listening: { icon: '👂', label: 'Listening', cls: 'live__mic--on live__mic--listening' },
      thinking: { icon: '💭', label: 'Thinking', cls: 'live__mic--on' },
      speaking: { icon: '🗣', label: 'Interrupt', cls: 'live__mic--speaking' },
    };
    const view = states[phase];
    micIcon.textContent = view.icon;
    micLabel.textContent = phase === 'off' ? 'Start' : view.label;
    micBtn.className = `live__mic ${view.cls}`.trim();
    micBtn.disabled = phase === 'thinking' || !MicRecorder.isSupported() || drill !== null;
    endBtn.hidden = phase === 'off';

    statusEl.textContent = statusText();

    noticesEl.textContent = '';
    noticesEl.append(...notices());

    paintTranscript();
    practiceEl.textContent = '';
    // A running activity takes the place of the suggestion card.
    const practice = drill ? drillCard() : practiceCard();
    if (practice) practiceEl.append(practice);
    planEl.textContent = '';
    const plan = planCard();
    if (plan) planEl.append(plan);

    if (phase === 'off') levelFill.style.width = '0%';
  }

  function setLevel(level: number): void {
    // RMS is small even for loud speech; scale it so the bar is worth watching.
    levelFill.style.width = `${Math.min(100, Math.round(level * 900))}%`;
  }

  /* ---------- the conversation loop ---------- */

  function onMic(): void {
    if (phase === 'off') {
      void run();
      return;
    }
    if (phase === 'listening') {
      // Send what has been said so far instead of waiting out the silence gap.
      recorder.endListen();
      return;
    }
    if (phase === 'speaking') tts.cancel();
  }

  function end(): void {
    session += 1;
    drillSession += 1;
    drill = null;
    phase = 'off';
    status = '';
    streaming = null;
    recorder.cancel();
    tts.cancel();
    paint();
  }

  /** Waits for one spoken turn. Returns null when nothing usable was heard. */
  async function listenOnce(mine: number): Promise<string | null> {
    phase = 'listening';
    status = 'Listening — say it in English. 小文 answers in English, then gives the Chinese.';
    paint();

    /** Drops silence, coughs and Whisper's invented credits. */
    const usable = (text: string): string | null => {
      const heard = text.trim();
      return heard && !isNoiseTranscript(heard) ? heard : null;
    };

    if (webSpeech()) {
      try {
        // The learner is a beginner, so they are speaking English to us.
        const text = await transcribeWithWebSpeech(12000, 'en-US');
        return mine === session ? usable(text) : null;
      } catch {
        return null;
      }
    }

    status = '';
    const ready = await ensureSpeech();
    if (mine !== session) return null;
    if (!ready) {
      phase = 'off';
      status = app.speech.error ?? 'The speech model could not load.';
      paint();
      return null;
    }

    status = 'Listening — say it in English. 小文 answers in English, then gives the Chinese.';
    paint();

    try {
      const clip = await recorder.listen({ onLevel: setLevel });
      if (mine !== session || !clip) return null;
      phase = 'thinking';
      status = 'Working out what you said…';
      paint();
      // English, not the Chinese pin: the learner talks to 小文 in English, and
      // Chinese recognition turns every English sentence into characters.
      const text = await transcribe(clip.audio, 'english');
      return mine === session ? usable(text) : null;
    } catch (err) {
      if (mine !== session) return null;
      phase = 'off';
      status = (err as Error).message;
      paint();
      return null;
    }
  }

  /** Says a whole tutor turn out loud: English first, then the Chinese. */
  async function speak(reply: TutorReply, mine: number): Promise<boolean> {
    const en = reply.en.trim();
    const zh = reply.zh.trim();
    if (!en && !zh) return mine === session;

    phase = 'speaking';
    status = 'Speaking — tap the microphone to interrupt.';
    paint();

    if (en) {
      status = '小文 is explaining in English.';
      paint();
      await tts.speak(en, app.settings.speechRate, { lang: 'en' });
      if (mine !== session) return false;
    }
    if (zh) {
      status = 'Now the Chinese — copy the melody.';
      paint();
      await tts.speak(zh, app.settings.speechRate, { lang: 'zh' });
    }
    return mine === session;
  }

  async function run(): Promise<void> {
    tts.unlock();
    session += 1;
    const mine = session;
    lines = [];
    history = [];
    suggestion = null;
    lastTopic = '';
    streaming = null;
    emptyTurns = 0;

    lines.push({ kind: 'tutor', reply: OPENING });
    status = '小文 is saying hello.';
    paint();
    if (!(await speak(OPENING, mine))) return;

    while (mine === session) {
      const heard = await listenOnce(mine);
      if (mine !== session) return;
      // listenOnce gives up for good when the microphone or the model is dead.
      if (phase === 'off') return;

      if (!heard) {
        status = "I didn't catch that — tap the microphone and try again.";
        paint();
        await delay(400);
        continue;
      }

      lines.push({ kind: 'learner', text: heard });
      history.push({ role: 'user', content: heard });
      phase = 'thinking';
      status = '小文 is thinking…';
      streaming = '';
      paint();

      let raw = '';
      let failure = '';
      try {
        for await (const piece of streamReply(history, 'live')) {
          if (mine !== session) return;
          raw += piece;
          streaming = raw;
          paintTranscript();
        }
      } catch (err) {
        if (mine !== session) return;
        failure = describeError(err);
      }
      streaming = null;

      const reply = parseTutorReply(raw);
      // Show the real reason. Reporting this as a vague "nothing came back"
      // hides whether the model threw, died, or simply returned nothing.
      if (!reply.zh && !reply.en) {
        replyError = failure || 'the model returned an empty reply.';
        status = `小文 could not answer: ${replyError}`;
        emptyTurns += 1;
        // One silent turn can be a hiccup, and the next one falls back to the
        // scripted tutor. Two in a row means answering is not going to work, and
        // re-opening the microphone would just loop for ever.
        if (emptyTurns >= 2) {
          phase = 'off';
          status = 'I stopped the call because 小文 cannot answer right now. Reload the tutor model from the notice above, then tap Start.';
          paint();
          return;
        }
        paint();
        await delay(600);
        continue;
      }
      replyError = '';
      emptyTurns = 0;

      history.push({ role: 'assistant', content: raw });
      lines.push({ kind: 'tutor', reply });
      handleSuggestion(reply);
      paint();

      if (!(await speak(reply, mine))) return;
      await delay(SPEAKER_SETTLE_MS);
    }
  }

  /**
   * Turns the tutor's two closing lines into a concrete offer: the topic it
   * names becomes a lesson (or written lines), and ACTIVITY becomes the wording
   * of the activity itself.
   */
  function handleSuggestion(reply: TutorReply): void {
    const trim = (value: string | undefined) => (value ?? '').replace(/^[-–—\s]+|[-–—\s]+$/g, '').trim();
    const activity = trim(reply.activity);
    const topic = trim(reply.suggest);

    // Keep the latest activity on the current offer even when the topic repeats.
    if (activity && suggestion) suggestion.activity = activity;

    if (topic.length < 3 || topic.toLowerCase() === lastTopic) return;
    lastTopic = topic.toLowerCase();

    const lesson = matchLessons(topic, 1)[0] ?? null;
    suggestion = { topic, activity, lesson, phrases: null, busy: false, failed: false };
    if (lesson) store.recordSuggestion(lesson.id, topic);
  }

  /** Writes three lines on a topic no built-in lesson covers. */
  async function makeLines(): Promise<void> {
    if (!suggestion || suggestion.busy) return;
    const current = suggestion;
    current.busy = true;
    paint();
    try {
      current.phrases = await generatePhrases(current.topic, 3);
    } catch {
      current.failed = true;
    } finally {
      current.busy = false;
      paint();
    }
  }

  paint();

  const unsubscribe = subscribe(() => {
    // Do not rebuild the page under an open microphone, a live generation, or
    // a drill that is mid-turn.
    if (phase === 'listening' || phase === 'thinking') return;
    if (drill && drill.phase !== 'idle') return;
    paint();
  });

  return () => {
    session += 1;
    drillSession += 1;
    unsubscribe();
    recorder.cancel();
    tts.cancel();
  };
}
