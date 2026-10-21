/**
 * App shell: a tiny tab router, the service worker that makes the app
 * installable and offline-capable, and the first-tap speech unlock that iOS
 * requires. There is no backend — everything runs from this bundle.
 */
import './styles.css';
import { h } from './ui/dom';
import { validateLessons } from './content/lessons';
import { tts } from './ai/tts';
import { app, initApp, type TabId } from './ui/state';
import { mount as mountHome } from './ui/views/home';
import { mount as mountChat } from './ui/views/chat';
import { mount as mountShadow } from './ui/views/shadow';
import { mount as mountTones } from './ui/views/tones';
import { mount as mountLive } from './ui/views/live';
import { mount as mountSettings } from './ui/views/settings';

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'live', icon: '🎙', label: 'Live' },
  { id: 'shadow', icon: '🗣', label: 'Shadow' },
  { id: 'tones', icon: '🎵', label: 'Tones' },
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
];

const root = document.getElementById('app');
if (!root) throw new Error('#app is missing from index.html');

const main = h('main', { class: 'app__main' });
const nav = h('nav', { class: 'nav' });

root.textContent = '';
root.append(h('div', { class: 'app' }, main, nav));

let disposeView: (() => void) | null = null;
/** Set when a lesson should be open in Shadowing on the next visit. */
let pendingLesson: string | null = null;

function openLesson(lessonId: string): void {
  pendingLesson = lessonId;
  show('shadow');
}

function mountView(tab: TabId, container: HTMLElement): () => void {
  switch (tab) {
    case 'shadow': {
      const lessonId = pendingLesson ?? undefined;
      pendingLesson = null;
      return mountShadow(container, { lessonId });
    }
    case 'tones':
      return mountTones(container);
    case 'chat':
      return mountChat(container);
    case 'live':
      return mountLive(container, openLesson);
    case 'settings':
      return mountSettings(container);
    case 'home':
    default:
      return mountHome(container, show);
  }
}

function renderNav(): void {
  nav.textContent = '';
  nav.append(
    ...TABS.map((tab) =>
      h(
        'button',
        {
          class: `nav__btn${app.tab === tab.id ? ' nav__btn--on' : ''}`,
          attrs: { type: 'button', 'aria-label': tab.label },
          onClick: () => show(tab.id),
        },
        h('span', { class: 'nav__icon', text: tab.icon }),
        h('span', { class: 'nav__label', text: tab.label }),
      ),
    ),
  );
}

function show(tab: TabId): void {
  disposeView?.();
  disposeView = null;

  app.tab = tab;
  main.textContent = '';
  disposeView = mountView(tab, main);

  renderNav();
  window.scrollTo({ top: 0 });
}

// iOS only speaks inside a gesture the first time, so unlock on the first tap.
let unlocked = false;
document.addEventListener(
  'pointerdown',
  () => {
    if (unlocked) return;
    unlocked = true;
    tts.unlock();
  },
  { once: true },
);

if (import.meta.env.DEV) {
  const problems = validateLessons();
  if (problems.length > 0) console.warn('[lessons]', problems);
}

show('home');
void initApp().catch((err: unknown) => console.error('Initialisation failed', err));

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href).catch(() => {
      // Offline caching is a bonus; the app works without it.
    });
  });
}
