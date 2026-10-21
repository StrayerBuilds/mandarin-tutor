/**
 * Speech recognition, on device.
 *
 * Default path: Whisper running locally through transformers.js on WebAssembly
 * (works on every phone, including iPhones without WebGPU) or WebGPU when you turn
 * it on for speed. The model is a few tens of megabytes, cached by the browser
 * after the first download, and then it works with no network at all.
 *
 * Optional path: the browser's built-in recogniser, which is faster and more
 * accurate but streams your voice to a server on most platforms. Settings labels
 * it clearly, and it is off by default.
 */
import { env, pipeline } from '@huggingface/transformers';

type RawAsrOutput = { text?: string } | { text?: string }[];
type AsrFn = (audio: Float32Array, options?: Record<string, unknown>) => Promise<RawAsrOutput>;

interface PendingLoad {
  key: string;
  promise: Promise<AsrFn>;
}

let loaded: { key: string; fn: AsrFn } | null = null;
let pending: PendingLoad | null = null;
let runtimeConfigured = false;

export interface AsrProgress {
  progress: number;
  label: string;
}

function keyOf(model: string, device: string): string {
  return `${model}|${device}`;
}

/** Points onnxruntime at the locally served wasm instead of a CDN, so the
 *  recogniser keeps working offline after the first visit. */
function configureRuntime(): void {
  if (runtimeConfigured) return;
  runtimeConfigured = true;

  env.allowLocalModels = false;
  env.useBrowserCache = true;

  const backends = (env as unknown as { backends?: { onnx?: { wasm?: Record<string, unknown> } } }).backends;
  const wasm = backends?.onnx?.wasm;
  if (wasm) {
    wasm.wasmPaths = new URL('ort/', document.baseURI).href;
    // Static hosts can't send COOP/COEP, so SharedArrayBuffer is unavailable.
    wasm.numThreads = 1;
    wasm.proxy = false;
  }
}

export function isAsrReady(model: string, device: string): boolean {
  return loaded?.key === keyOf(model, device);
}

export async function ensureAsr(
  model: string,
  device: 'wasm' | 'webgpu',
  onProgress: (p: AsrProgress) => void,
): Promise<void> {
  const key = keyOf(model, device);
  if (loaded?.key === key) return;
  if (pending?.key === key) {
    await pending.promise;
    return;
  }

  configureRuntime();

  const promise = (async (): Promise<AsrFn> => {
    const fn = (await pipeline('automatic-speech-recognition', model, {
      device,
      dtype: device === 'webgpu' ? 'fp32' : 'q8',
      progress_callback: (info: { status?: string; progress?: number; file?: string }) => {
        if (info?.status === 'progress' && typeof info.progress === 'number') {
          onProgress({ progress: info.progress / 100, label: info.file ?? 'model' });
        }
      },
    })) as unknown as AsrFn;

    loaded = { key, fn };
    return fn;
  })();

  pending = { key, promise };
  try {
    await promise;
  } finally {
    if (pending?.key === key) pending = null;
  }
}

export async function transcribe(audio: Float32Array): Promise<string> {
  if (!loaded) throw new Error('The speech model is still loading.');
  const out = await loaded.fn(audio, { language: 'chinese', task: 'transcribe' });
  const first = Array.isArray(out) ? out[0] : out;
  return (first?.text ?? '').trim();
}

/* ------------------------------------------------------------------ *
 * Optional: the browser's own recogniser (needs the network on most
 * platforms — clearly labelled as such in Settings).
 * ------------------------------------------------------------------ */

interface WsAlternative {
  transcript: string;
}
interface WsResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: WsAlternative;
}
interface WsResultList {
  readonly length: number;
  [index: number]: WsResult;
}
interface WsEvent {
  results: WsResultList;
  resultIndex: number;
}
interface WsErrorEvent {
  error: string;
}
interface WsRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: WsEvent) => void) | null;
  onerror: ((event: WsErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type WsCtor = new () => WsRecognition;

function recognitionCtor(): WsCtor | null {
  const w = window as unknown as { SpeechRecognition?: WsCtor; webkitSpeechRecognition?: WsCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function webSpeechSupported(): boolean {
  return recognitionCtor() !== null;
}

export function transcribeWithWebSpeech(timeoutMs = 8000): Promise<string> {
  const Ctor = recognitionCtor();
  if (!Ctor) return Promise.reject(new Error('This browser has no built-in speech recognition.'));

  return new Promise<string>((resolve, reject) => {
    const rec = new Ctor();
    rec.lang = 'zh-CN';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        rec.abort();
      } catch {
        // already finished
      }
      fn();
    };

    const timer = setTimeout(() => finish(() => reject(new Error('Nothing was heard.'))), timeoutMs);

    rec.onresult = (event) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) text += result[0]?.transcript ?? '';
      }
      if (text) finish(() => resolve(text.trim()));
    };
    rec.onerror = (event) => finish(() => reject(new Error(`Speech recognition failed: ${event.error}`)));
    rec.onend = () => finish(() => reject(new Error('Nothing was heard.')));

    try {
      rec.start();
    } catch (err) {
      finish(() => reject(err as Error));
    }
  });
}
