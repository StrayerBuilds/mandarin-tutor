import { h, button, card } from '../dom';
import { meter, notice } from '../components';
import { MODEL_CHOICES } from '../../ai/llm';
import { store } from '../../store';
import { LESSONS } from '../../content/lessons';
import { OFFLINE_BANNER, OFFLINE_LABEL } from '../../ai/offline-tutor';
import { app, loadModel, subscribe, unloadModel, type TabId } from '../state';

function progressLine(progress: number, text: string): HTMLElement {
  return h(
    'div',
    { class: 'progress' },
    h('div', { class: 'progress__track' }, h('div', { class: 'progress__fill', style: { width: `${Math.max(3, progress * 100)}%` } })),
    h('div', { class: 'progress__label', text }),
  );
}

function modelCard(onGo: (tab: TabId) => void): HTMLElement {
  const caps = app.caps;
  const size = app.settings.modelSize;
  const choice = MODEL_CHOICES[size];

  if (!caps) {
    return card(h('h2', { text: 'Tutor model' }), h('p', { class: 'muted', text: 'Checking what this phone can do…' }));
  }

  if (!caps.webgpu) {
    return card(
      h('h2', { text: 'Tutor model' }),
      notice(OFFLINE_BANNER, 'warn'),
      h('p', { class: 'muted', text: 'Reasons reported by this browser:' }),
      h('ul', { class: 'bullets' }, ...caps.blockers.map((b) => h('li', { text: b }))),
    );
  }

  const status = app.model;

  if (status.state === 'loading') {
    return card(
      h('h2', { text: 'Tutor model' }),
      progressLine(status.progress, status.text || 'Downloading…'),
      h('p', { class: 'muted', text: 'This takes a few minutes once. After that it loads from the phone cache.' }),
    );
  }

  if (status.state === 'ready') {
    return card(
      h('h2', { text: 'Running on this phone' }),
      h('p', { class: 'model-name', text: app.model.text }),
      h('p', { class: 'muted', text: 'Every reply is generated here. Nothing is sent anywhere, and there is no token bill.' }),
      button('Unload model', 'btn btn--ghost', () => unloadModel()),
    );
  }

  if (status.state === 'error') {
    return card(
      h('h2', { text: 'Tutor model' }),
      notice(status.error ?? 'Something went wrong.', 'error'),
      button('Try again', 'btn', () => void loadModel()),
    );
  }

  return card(
    h('h2', { text: 'Tutor model' }),
    h('p', { class: 'muted', text: choice.blurb }),
    app.cachedModel
      ? notice('Already downloaded on this phone — loading will be quick.', 'info')
      : h('p', { class: 'muted', text: `One-time download of about ${choice.approxMB} MB, kept in the browser cache.` }),
    button(`Load ${choice.label}`, 'btn', () => void loadModel()),
    h('p', { class: 'muted small', text: 'You can change the size in Settings. Smaller models load faster and are a bit weaker at Chinese.' }),
    h('div', { class: 'row' }, button('Open Settings', 'btn btn--ghost', () => onGo('settings'))),
  );
}

export function mount(container: HTMLElement, go: (tab: TabId) => void): () => void {
  const render = () => {
    container.textContent = '';

    const progress = store.progress();
    const practised = Object.keys(progress).length;
    const scores = Object.values(progress).map((p) => p.best);
    const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const totalPhrases = LESSONS.reduce((sum, l) => sum + l.phrases.length, 0);

    const modeButton = (tab: TabId, title: string, blurb: string, cls = '') =>
      h(
        'button',
        { class: `tile ${cls}`, attrs: { type: 'button' }, onClick: () => go(tab) },
        h('span', { class: 'tile__title', text: title }),
        h('span', { class: 'tile__blurb', text: blurb }),
      );

    container.append(
      h('h1', { class: 'view__title', text: '中文 Tutor' }),
      h('p', { class: 'view__sub', text: 'Speak Mandarin with a tutor that lives on your phone.' }),

      h('div', { class: 'tiles' },
        modeButton('shadow', 'Shadowing', 'Hear a line, say it back, get graded on words and tones.'),
        modeButton('tones', 'Tone trainer', 'Drill mā má mǎ mà until the four tones are obvious.'),
        modeButton('chat', 'Conversation', 'Chat or roleplay in Chinese, corrected as you go.'),
        modeButton('settings', 'Settings', 'Model size, voices, diagnostics.'),
      ),

      modelCard(go),

      card(
        h('h2', { text: 'Your practice' }),
        practised === 0
          ? h('p', { class: 'muted', text: `No attempts yet. ${totalPhrases} phrases are ready in Shadowing.` })
          : h('div', {},
              h('p', { class: 'muted', text: `${practised} of ${totalPhrases} phrases attempted.` }),
              meter('Average best score', average),
            ),
      ),

      card(
        h('h2', { text: 'How this stays free' }),
        h('p', { class: 'muted', text: 'There is no server behind this app. The language model, the speech recogniser and the voice all run on your phone.' }),
        h('ul', { class: 'bullets' },
          h('li', { text: 'First visit downloads the app and the models into browser storage.' }),
          h('li', { text: 'After that it works with no network — try airplane mode.' }),
          h('li', { text: 'Nothing is uploaded, so there are no tokens to pay for.' }),
        ),
        h('p', { class: 'muted small', text: `Currently: ${app.model.state === 'ready' ? 'on-device model' : OFFLINE_LABEL}.` }),
      ),
    );
  };

  render();
  return subscribe(render);
}
