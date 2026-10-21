/**
 * Live conversation: tap once, then just talk.
 *
 * Each turn is listen → transcribe → reply → speak, and the microphone is only
 * open while listening, so the tutor's own voice can never feed back into the
 * next turn. The tutor also names the topic it wants the learner to practise
 * next, which this view turns into a real lesson — or, when no lesson covers it,
 * into lines written on the spot and graded in Shadowing.
 */
import { h, button, frag } from '../dom';
import { notice, phraseCard } from '../components';
import { parseTutorReply } from '../../content/prompts';
import { LESSONS, matchLessons } from '../../content/lessons';
import { transcribe, transcribeWithWebSpeech, webSpeechSupported } from '../../ai/asr';
import { MicRecorder } from '../../ai/recorder';
import { generatePhrases, streamReply } from '../../ai/tutor';
import { tts } from '../../ai/tts';
import { store } from '../../store';
import { app, ensureSpeech, loadModel, subscribe } from '../state';
import type { ChatMessage, Lesson, Phrase, TutorReply } from '../../types';

type Phase = 'off' | 'listening' | 'thinking' | 'speaking';

interface Line {
  kind: 'learner' | 'tutor';
  text?: string;
  reply?: TutorReply;
}

interface Suggestion {
  topic: string;
  lesson: Lesson | null;
  phrases: Phrase[] | null;
  busy: boolean;
  failed: boolean;
}

const OPENING: TutorReply = {
  zh: '你好，我是小文。你想练习什么？',
  pinyin: 'ni3 hao3 wo3 shi4 xiao3 wen2 ni3 xiang3 lian4 xi2 shen2 me5',
  en: "Hello, I'm Xiaowen. What would you like to practise?",
  note: 'Answer in Chinese or English — I understand both.',
  raw: '',
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function mount(container: HTMLElement, openLesson: (lessonId: string) => void): () => void {
  let phase: Phase = 'off';
  let status = '';
  let lines: Line[] = [];
  let history: ChatMessage[] = [];
  let streaming: string | null = null;
  let suggestion: Suggestion | null = null;
  let lastTopic = '';
  /** Bumped on every end/interrupt so in-flight turns know they are stale. */
  let session = 0;

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
        text: 'A hands-free conversation with 小文. It stops listening when you stop talking, answers out loud, and lines up what to practise next.',
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

  function bubbleFor(reply: TutorReply, showSpeak: boolean): HTMLElement {
    const node = h('div', { class: 'bubble bubble--assistant' });
    node.append(
      h('div', { class: 'bubble__body' },
        h('div', { class: 'bubble__zh', text: reply.zh }),
        app.settings.showPinyin && reply.pinyin ? h('div', { class: 'bubble__py', text: reply.pinyin }) : null,
        app.settings.showEnglish && reply.en ? h('div', { class: 'bubble__en', text: reply.en }) : null,
        reply.note ? h('div', { class: 'bubble__note', text: reply.note }) : null,
      ),
    );
    if (showSpeak && reply.zh) {
      node.append(button('🔊', 'bubble__speak', () => void tts.speak(reply.zh, app.settings.speechRate)));
    }
    return node;
  }

  function paintTranscript(): void {
    transcriptEl.textContent = '';
    if (lines.length === 0) {
      transcriptEl.append(
        h('div', { class: 'empty' },
          h('p', { class: 'muted', text: 'Tap the microphone and start talking. Chinese or English, either is fine.' }),
        ),
      );
      return;
    }
    for (const line of lines) {
      if (line.kind === 'learner') {
        transcriptEl.append(h('div', { class: 'bubble bubble--user', text: line.text ?? '' }));
      } else if (line.reply) {
        transcriptEl.append(bubbleFor(line.reply, true));
      }
    }
    if (streaming !== null) {
      const raw = streaming;
      transcriptEl.append(
        h('div', { class: 'bubble bubble--assistant bubble--streaming' },
          h('div', { class: 'bubble__body' },
            h('div', { class: 'bubble__zh', text: parseTutorReply(raw).zh || '…' }),
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

    const rows: (HTMLElement | null)[] = [
      h('h2', { text: 'Practise next' }),
      h('p', { class: 'muted small', text: `小文 heard you are interested in: ${s.topic}` }),
    ];

    if (s.lesson) {
      rows.push(
        phraseCard(s.lesson.phrases[0], {
          showPinyin: app.settings.showPinyin,
          showEnglish: app.settings.showEnglish,
          onSpeak: () => void tts.speak(s.lesson!.phrases[0].hanzi, app.settings.speechRate),
        }),
        h('div', { class: 'row' },
          button(`Practise ${s.lesson.title}`, 'btn', () => openLesson(s.lesson!.id)),
        ),
        h('p', { class: 'muted small', text: 'Opens Shadowing with that lesson, where your attempt gets scored.' }),
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

    if (s.failed) rows.push(notice('Could not write those lines. Try again in a moment.', 'warn'));

    return h('div', { class: 'card' }, ...rows);
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
    micBtn.disabled = phase === 'thinking' || !MicRecorder.isSupported();
    endBtn.hidden = phase === 'off';

    statusEl.textContent = statusText();

    noticesEl.textContent = '';
    noticesEl.append(...notices());

    paintTranscript();
    practiceEl.textContent = '';
    const practice = practiceCard();
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
    status = 'Listening — speak in Chinese or English.';
    paint();

    if (webSpeech()) {
      try {
        const text = await transcribeWithWebSpeech(12000);
        return mine === session ? text.trim() || null : null;
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

    status = 'Listening — speak in Chinese or English.';
    paint();

    try {
      const clip = await recorder.listen({ onLevel: setLevel });
      if (mine !== session || !clip) return null;
      phase = 'thinking';
      status = 'Working out what you said…';
      paint();
      const text = await transcribe(clip.audio);
      return mine === session ? text.trim() || null : null;
    } catch (err) {
      if (mine !== session) return null;
      phase = 'off';
      status = (err as Error).message;
      paint();
      return null;
    }
  }

  async function speak(zh: string, mine: number): Promise<boolean> {
    if (!zh.trim()) return mine === session;
    phase = 'speaking';
    status = 'Speaking — tap the microphone to interrupt.';
    paint();
    await tts.speak(zh, app.settings.speechRate);
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

    lines.push({ kind: 'tutor', reply: OPENING });
    status = '小文 is saying hello.';
    paint();
    if (!(await speak(OPENING.zh, mine))) return;

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
      try {
        for await (const piece of streamReply(history, 'live')) {
          if (mine !== session) return;
          raw += piece;
          streaming = raw;
          paintTranscript();
        }
      } catch (err) {
        if (mine !== session) return;
        status = `The reply failed: ${(err as Error).message}`;
      }
      streaming = null;

      const reply = parseTutorReply(raw);
      if (!reply.zh) {
        status = 'Nothing came back that time — say that again.';
        paint();
        await delay(400);
        continue;
      }

      history.push({ role: 'assistant', content: raw });
      lines.push({ kind: 'tutor', reply });
      handleSuggestion(reply.suggest);
      paint();

      if (!(await speak(reply.zh, mine))) return;
      await delay(250);
    }
  }

  function handleSuggestion(rawTopic: string | undefined): void {
    const topic = (rawTopic ?? '').replace(/^[-–—\s]+|[-–—\s]+$/g, '').trim();
    if (topic.length < 3 || topic.toLowerCase() === lastTopic) return;
    lastTopic = topic.toLowerCase();

    const lesson = matchLessons(topic, 1)[0] ?? null;
    suggestion = { topic, lesson, phrases: null, busy: false, failed: false };
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
    // Do not rebuild the page under an open microphone or a live generation.
    if (phase === 'listening' || phase === 'thinking') return;
    paint();
  });

  return () => {
    session += 1;
    unsubscribe();
    recorder.cancel();
    tts.cancel();
  };
}
