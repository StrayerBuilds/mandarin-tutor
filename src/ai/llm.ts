/**
 * The on-device language model.
 *
 * WeChat-free, account-free, token-free: Qwen2.5 is downloaded once into the
 * browser's cache, then every reply is generated on the phone's GPU. Model ids are
 * resolved against WebLLM's own bundled list at runtime so a library update that
 * renames a checkpoint degrades gracefully instead of breaking the app.
 */
import {
  CreateWebWorkerMLCEngine,
  hasModelInCache,
  prebuiltAppConfig,
  type InitProgressReport,
  type MLCEngineInterface,
} from '@mlc-ai/web-llm';
import type { ChatMessage } from '../types';
import type { ModelSize } from '../store';

const SIZE_PATTERN: Record<ModelSize, RegExp> = {
  small: /Qwen2\.5-0\.5B/i,
  balanced: /Qwen2\.5-1\.5B/i,
  large: /Qwen2\.5-3B/i,
};

export const MODEL_CHOICES: Record<ModelSize, { label: string; approxMB: number; blurb: string }> = {
  small: { label: 'Qwen2.5 0.5B', approxMB: 400, blurb: 'Tiny and quick. Weakest Chinese. Fine for a first try on an older phone.' },
  balanced: { label: 'Qwen2.5 1.5B', approxMB: 830, blurb: 'The sweet spot. Holds a real conversation and still loads in seconds.' },
  large: { label: 'Qwen2.5 3B', approxMB: 1900, blurb: 'Best grammar and vocabulary. Needs a recent phone with plenty of free storage.' },
};

export interface LoadProgress {
  progress: number;
  text: string;
}

/** Picks the best available checkpoint for a size, honouring f16 support. */
export function resolveModelId(size: ModelSize, preferF16: boolean): { id: string | null; candidates: string[] } {
  const ids = prebuiltAppConfig.model_list.map((m) => m.model_id);
  const candidates = ids.filter((id) => SIZE_PATTERN[size].test(id));
  if (candidates.length === 0) return { id: null, candidates: [] };

  const isF16 = (id: string) => /q4f16|f16/i.test(id);
  const isF32 = (id: string) => /q4f32|f32/i.test(id);
  const f16 = candidates.filter(isF16);
  const f32 = candidates.filter(isF32);
  const ordered = preferF16 ? [...f16, ...f32] : [...f32, ...f16];
  const pool = ordered.length > 0 ? ordered : candidates;
  return { id: pool[0], candidates: pool };
}

export async function isModelCached(size: ModelSize, preferF16: boolean): Promise<boolean> {
  const { id } = resolveModelId(size, preferF16);
  if (!id) return false;
  try {
    return await hasModelInCache(id);
  } catch {
    return false;
  }
}

type StreamShape = AsyncIterable<{ choices: { delta?: { content?: string } }[] }>;

export class LocalLLM {
  private engine: MLCEngineInterface | null = null;
  private worker: Worker | null = null;
  private loading = false;
  modelId: string | null = null;

  get ready(): boolean {
    return this.engine !== null;
  }

  get isLoading(): boolean {
    return this.loading;
  }

  async load(size: ModelSize, preferF16: boolean, onProgress: (p: LoadProgress) => void): Promise<string> {
    if (this.loading) throw new Error('A model is already loading.');

    const { id } = resolveModelId(size, preferF16);
    if (!id) {
      throw new Error(
        `This WebLLM build has no Qwen2.5 model for the "${size}" size. Try another size in Settings.`,
      );
    }

    this.loading = true;
    this.dispose();

    try {
      this.worker = new Worker(new URL('./llm-worker.ts', import.meta.url), { type: 'module' });
      this.engine = await CreateWebWorkerMLCEngine(this.worker, id, {
        initProgressCallback: (report: InitProgressReport) => {
          onProgress({ progress: report.progress ?? 0, text: report.text ?? 'Loading model…' });
        },
      });
      this.modelId = id;
      return id;
    } catch (err) {
      this.dispose();
      throw err;
    } finally {
      this.loading = false;
    }
  }

  async *stream(messages: ChatMessage[], temperature = 0.7, maxTokens = 400): AsyncGenerator<string> {
    if (!this.engine) throw new Error('The model is not loaded yet.');
    try {
      const chunks = (await this.engine.chat.completions.create({
        // Structurally identical to OpenAI's message shape; the cast only avoids
        // depending on WebLLM's exported union type name.
        messages: messages as never,
        stream: true,
        temperature,
        max_tokens: maxTokens,
      })) as unknown as StreamShape;

      for await (const chunk of chunks) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
    } catch (err) {
      // Once a generation fails the engine's worker is usually gone, and every
      // later turn fails the same way — the conversation then just alternates
      // between listening and an error. Dropping the dead engine here makes
      // `ready` false, so the next turn falls back to the scripted tutor and the
      // learner still gets an answer.
      this.dispose();
      throw err;
    }
  }

  async complete(messages: ChatMessage[], temperature = 0.7, maxTokens = 400): Promise<string> {
    let out = '';
    for await (const piece of this.stream(messages, temperature, maxTokens)) out += piece;
    return out;
  }

  /** Stops generation mid-flight when the learner taps Stop. */
  interrupt(): void {
    try {
      this.engine?.interruptGenerate();
    } catch {
      // Nothing to interrupt.
    }
  }

  dispose(): void {
    try {
      // `unload` is async and may itself reject when the worker is already dead.
      void this.engine?.unload().catch(() => {});
    } catch {
      // Already gone.
    }
    this.worker?.terminate();
    this.engine = null;
    this.worker = null;
    this.modelId = null;
  }
}

export const llm = new LocalLLM();
