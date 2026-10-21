/**
 * Shared app state and the actions that mutate it. Views read this object and
 * subscribe for change notifications; nothing else holds app-level state.
 */
import { detectCapabilities, type Capabilities } from '../ai/capabilities';
import { ensureAsr } from '../ai/asr';
import { isModelCached, llm, resolveModelId } from '../ai/llm';
import { tts, type TtsStatus } from '../ai/tts';
import { store, type Settings } from '../store';

export type TabId = 'home' | 'chat' | 'shadow' | 'tones' | 'settings';

export interface StageStatus {
  state: 'idle' | 'loading' | 'ready' | 'error';
  progress: number;
  text: string;
  error?: string;
}

export const app = {
  caps: null as Capabilities | null,
  tts: { available: false, voiceName: null, message: 'Checking voices…' } as TtsStatus,
  settings: store.settings,
  model: { state: 'idle', progress: 0, text: '' } as StageStatus,
  speech: { state: 'idle', progress: 0, text: '' } as StageStatus,
  tab: 'home' as TabId,
  cachedModel: false,
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify(): void {
  for (const listener of listeners) listener();
}

export async function initApp(): Promise<void> {
  store.load();
  app.settings = store.settings;
  app.tts = await tts.ready();
  app.caps = await detectCapabilities();
  if (app.caps.webgpu) {
    app.cachedModel = await isModelCached(app.settings.modelSize, app.caps.shaderF16);
  }
  notify();
}

export function updateSettings(patch: Partial<Settings>): void {
  store.save(patch);
  app.settings = store.settings;

  if (patch.modelSize !== undefined && llm.ready) {
    // The loaded checkpoint no longer matches the setting.
    llm.dispose();
    app.model = { state: 'idle', progress: 0, text: '' };
  }
  if (
    (patch.asrModel !== undefined || patch.asrDevice !== undefined) &&
    app.speech.state === 'ready'
  ) {
    app.speech = { state: 'idle', progress: 0, text: '' };
  }
  notify();
}

export async function loadModel(): Promise<void> {
  if (!app.caps) return;
  if (!app.caps.webgpu) {
    app.model = {
      state: 'error',
      progress: 0,
      text: 'WebGPU unavailable',
      error: 'This browser cannot run the language model. Everything else still works.',
    };
    notify();
    return;
  }
  if (app.model.state === 'loading' || llm.ready) return;

  app.model = { state: 'loading', progress: 0, text: 'Preparing…' };
  notify();

  try {
    await llm.load(app.settings.modelSize, app.caps.shaderF16, (p) => {
      app.model = { state: 'loading', progress: p.progress, text: p.text };
      notify();
    });
    app.model = { state: 'ready', progress: 1, text: llm.modelId ?? 'ready' };
    app.cachedModel = true;
  } catch (err) {
    app.model = {
      state: 'error',
      progress: 0,
      text: 'Model failed to load',
      error: (err as Error).message,
    };
  }
  notify();
}

export function unloadModel(): void {
  llm.dispose();
  app.model = { state: 'idle', progress: 0, text: '' };
  notify();
}

/** Loads the local speech recogniser on first use, with progress for the UI. */
export async function ensureSpeech(): Promise<boolean> {
  if (app.speech.state === 'ready') return true;
  if (app.speech.state === 'loading') {
    // Wait for the in-flight load.
    while (app.speech.state === 'loading') {
      await new Promise((r) => setTimeout(r, 120));
    }
    return app.speech.state === 'ready';
  }

  app.speech = { state: 'loading', progress: 0, text: 'Preparing speech recognition…' };
  notify();

  try {
    await ensureAsr(app.settings.asrModel, app.settings.asrDevice, (p) => {
      app.speech = { state: 'loading', progress: p.progress, text: p.label };
      notify();
    });
    app.speech = { state: 'ready', progress: 1, text: app.settings.asrModel };
    notify();
    return true;
  } catch (err) {
    app.speech = {
      state: 'error',
      progress: 0,
      text: 'Speech model failed to load',
      error: (err as Error).message,
    };
    notify();
    return false;
  }
}

export function currentModelId(): string | null {
  if (!app.caps) return null;
  return resolveModelId(app.settings.modelSize, app.caps.shaderF16).id;
}
