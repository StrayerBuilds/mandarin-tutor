import { h, button, frag } from '../dom';
import { notice } from '../components';
import { SCENARIOS, parseTutorReply, type Scenario, type TutorMode } from '../../content/prompts';
import { transcribe, webSpeechSupported, transcribeWithWebSpeech } from '../../ai/asr';
import { MicRecorder } from '../../ai/recorder';
import { streamReply } from '../../ai/tutor';
import { tts } from '../../ai/tts';
import { store } from '../../store';
import { app, ensureSpeech, subscribe } from '../state';
import type { ChatMessage, TutorReply } from '../../types';

const STARTERS = [
  '你好，我叫 Tom。',
  '我想练习点菜。',
  'Why does 了 go at the end?',
  '请慢一点说。',
];

function replyBody(reply: TutorReply, showPinyin: boolean, showEnglish: boolean): HTMLElement {
  return frag(
    h('div', { class: 'bubble__zh', text: reply.zh }),
    showPinyin && reply.pinyin ? h('div', { class: 'bubble__py', text: reply.pinyin }) : null,
    showEnglish && reply.en ? h('div', { class: 'bubble__en', text: reply.en }) : null,
    reply.note ? h('div', { class: 'bubble__note', text: reply.note }) : null,
  ) as unknown as HTMLElement;
}

export function mount(container: HTMLElement): () => void {
  let mode: TutorMode = 'chat';
  let scenario: Scenario = SCENARIOS[0];
  let history: ChatMessage[] = store.chat().filter((m) => m.role !== 'system');
  let busy = false;
  const recorder = new MicRecorder();

  const list = h('div', { class: 'bubbles' });
  const input = h('textarea', {
    class: 'composer__input',
    attrs: { rows: '1', placeholder: '写中文，或者用英文提问…' },
  }) as HTMLTextAreaElement;
  const sendBtn = button('Send', 'btn btn--send', () => void send());
  const micBtn = button('🎤', 'btn btn--mic', () => void dictate());
  const status = h('div', { class: 'composer__status' });
  const stopBtn = button('Stop', 'btn btn--ghost small-btn', () => {
    // Streaming is driven by a local flag; the model itself is interrupted below.
    cancelled = true;
    void import('../../ai/llm').then(({ llm }) => llm.interrupt());
  });
  let cancelled = false;
  let dictating = false;

  function renderAssistantNode(node: HTMLElement, raw: string, showSpeak: boolean) {
    const reply = parseTutorReply(raw);
    node.textContent = '';
    node.classList.add('bubble--assistant');
    const body = h('div', { class: 'bubble__body' });
    const fragNode = replyBody(reply, app.settings.showPinyin, app.settings.showEnglish);
    body.append(fragNode);
    node.append(body);
    if (showSpeak && reply.zh) {
      node.append(
        button('🔊', 'bubble__speak', () => void tts.speak(reply.zh, app.settings.speechRate)),
      );
    }
  }

  function renderList() {
    list.textContent = '';
    if (history.length === 0) {
      list.append(
        h('div', { class: 'empty' },
          h('p', { text: app.model.state === 'ready' ? '先说一句吧 — say something to start.' : 'Scripted tutor mode: try one of these.' }),
          h('div', { class: 'chips' },
            ...STARTERS.map((s) =>
              h('button', { class: 'chip', attrs: { type: 'button' }, text: s, onClick: () => { input.value = s; void send(); } }),
            ),
          ),
        ),
      );
      return;
    }
    for (const message of history) {
      if (message.role === 'user') {
        list.append(h('div', { class: 'bubble bubble--user', text: message.content }));
      } else {
        const node = h('div', { class: 'bubble' });
        renderAssistantNode(node, message.content, true);
        list.append(node);
      }
    }
    scrollToEnd();
  }

  function scrollToEnd() {
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  }

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;

    cancelled = false;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    history.push({ role: 'user', content: text });
    renderList();

    const placeholder: ChatMessage = { role: 'assistant', content: '' };
    const node = h('div', { class: 'bubble bubble--streaming' });
    list.append(node);
    scrollToEnd();

    try {
      for await (const piece of streamReply(history, mode, mode === 'scenario' ? scenario : undefined)) {
        if (cancelled) break;
        placeholder.content += piece;
        renderAssistantNode(node, placeholder.content, false);
        scrollToEnd();
      }
      node.classList.remove('bubble--streaming');
      renderAssistantNode(node, placeholder.content || '(no output)', true);
      history.push(placeholder);
      store.saveChat(history);
    } catch (err) {
      node.classList.remove('bubble--streaming');
      node.textContent = '';
      node.append(notice(`Generation failed: ${(err as Error).message}`, 'error'));
    } finally {
      busy = false;
      sendBtn.disabled = false;
      status.textContent = '';
    }
  }

  async function dictate() {
    if (busy) return;

    // Second tap = stop. One state flag drives both directions, so re-rendering
    // the composer can never leave a stale listener behind.
    if (dictating) {
      await stopDictation();
      return;
    }

    if (app.settings.useWebSpeechSTT && webSpeechSupported()) {
      micBtn.disabled = true;
      status.textContent = 'Listening…';
      try {
        const text = await transcribeWithWebSpeech();
        input.value = (input.value + ' ' + text).trim();
        status.textContent = '';
        void send();
      } catch (err) {
        status.textContent = (err as Error).message;
      } finally {
        micBtn.disabled = false;
      }
      return;
    }

    status.textContent = 'Preparing speech recognition…';
    const ok = await ensureSpeech();
    if (!ok) {
      status.textContent = '';
      return;
    }

    try {
      await recorder.start(12000);
    } catch (err) {
      status.textContent = (err as Error).message;
      return;
    }

    dictating = true;
    micBtn.textContent = '⏹';
    status.textContent = 'Recording… tap ⏹ to stop';
  }

  async function stopDictation() {
    dictating = false;
    micBtn.textContent = '🎤';
    status.textContent = 'Transcribing on device…';
    try {
      const clip = await recorder.stop();
      const text = await transcribe(clip.audio);
      if (!text) {
        status.textContent = 'Nothing recognised. Try again.';
        return;
      }
      input.value = (input.value + ' ' + text).trim();
      status.textContent = '';
      await send();
    } catch (err) {
      status.textContent = (err as Error).message;
    }
  }

  function modeRow(): HTMLElement {
    const modes: { id: TutorMode; label: string }[] = [
      { id: 'chat', label: 'Conversation' },
      { id: 'scenario', label: 'Roleplay' },
      { id: 'explain', label: 'Explain' },
    ];
    return h('div', { class: 'chips' },
      ...modes.map((m) =>
        h('button', {
          class: `chip${mode === m.id ? ' chip--on' : ''}`,
          attrs: { type: 'button' },
          text: m.label,
          onClick: () => {
            mode = m.id;
            renderAll();
          },
        }),
      ),
    );
  }

  function scenarioRow(): HTMLElement | null {
    if (mode !== 'scenario') return null;
    return h('div', { class: 'chips chips--wrap' },
      ...SCENARIOS.map((s) =>
        h('button', {
          class: `chip${scenario.id === s.id ? ' chip--on' : ''}`,
          attrs: { type: 'button' },
          text: s.title,
          onClick: () => {
            scenario = s;
            renderAll();
          },
        }),
      ),
    );
  }

  function renderAll() {
    container.textContent = '';
    container.append(
      frag(
        h('h1', { class: 'view__title', text: 'Conversation' }),
        app.model.state === 'ready'
          ? h('p', { class: 'view__sub', text: 'Replies are generated on this phone.' })
          : notice('The language model is not loaded, so replies come from the built-in scripted tutor. Load it from the Home tab for free-form conversation.', 'info'),
        modeRow(),
        scenarioRow(),
        list,
        h('div', { class: 'composer' },
          input,
          h('div', { class: 'composer__actions' }, micBtn, sendBtn),
          status,
        ),
        h('div', { class: 'row row--end' },
          history.length > 0
            ? button('Clear chat', 'btn btn--ghost small-btn', () => {
                history = [];
                store.saveChat(history);
                renderList();
              })
            : null,
          busy ? stopBtn : null,
        ),
      ),
    );
    renderList();
  }

  renderAll();
  const unsubscribe = subscribe(() => {
    // Re-render only the shell-level bits that depend on global state, and never
    // while a recording or a generation is in flight.
    if (busy || dictating) return;
    renderAll();
  });

  return () => {
    unsubscribe();
    recorder.cancel();
  };
}
