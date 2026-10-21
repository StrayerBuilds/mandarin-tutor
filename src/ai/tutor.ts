/**
 * Single entry point for "get a reply". Chooses the on-device model when it is
 * loaded and falls back to curated content when the phone cannot run WebGPU, so
 * the UI never has to care which is in play.
 */
import { systemPrompt, trimHistory, PHRASE_GEN_PROMPT, parseGeneratedPhrases, type Scenario, type TutorMode } from '../content/prompts';
import { ALL_PHRASES } from '../content/lessons';
import { offlineReply } from './offline-tutor';
import { llm } from './llm';
import type { ChatMessage, Phrase } from '../types';

const MAX_HISTORY = 10;

export function modelReady(): boolean {
  return llm.ready;
}

export function modelLabel(): string {
  return llm.ready ? (llm.modelId ?? 'on-device model') : 'scripted tutor (no WebGPU)';
}

export async function* streamReply(
  history: ChatMessage[],
  mode: TutorMode,
  scenario?: Scenario,
): AsyncGenerator<string> {
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';

  if (!llm.ready) {
    const reply = offlineReply(lastUser);
    yield `ZH: ${reply.zh}\nPY: ${reply.pinyin}\nEN: ${reply.en}\nNOTE: ${reply.note}`;
    return;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(mode, scenario) },
    ...trimHistory(history, MAX_HISTORY),
  ];

  yield* llm.stream(messages, mode === 'explain' ? 0.4 : 0.75, 400);
}

/** Extra practice sentences, tailored to a topic when the model is available. */
export async function generatePhrases(topic: string, count: number): Promise<Phrase[]> {
  if (llm.ready) {
    const raw = await llm.complete(
      [
        { role: 'system', content: PHRASE_GEN_PROMPT },
        {
          role: 'user',
          content: `Write ${count} sentences about: ${topic || 'everyday life'}.`,
        },
      ],
      0.8,
      500,
    );
    const parsed = parseGeneratedPhrases(raw, Date.now().toString(36));
    if (parsed.length > 0) return parsed.slice(0, count);
  }

  return pickFromBank(topic, count);
}

function pickFromBank(topic: string, count: number): Phrase[] {
  const needle = topic.trim().toLowerCase();
  const pool = needle
    ? ALL_PHRASES.filter(
        (p) => p.en.toLowerCase().includes(needle) || p.pinyin.includes(needle),
      )
    : [];
  const source = pool.length >= count ? pool : [...pool, ...ALL_PHRASES];

  const seen = new Set<string>();
  const picked: Phrase[] = [];
  for (let i = 0; source.length > 0 && picked.length < count && i < source.length * 3; i++) {
    const candidate = source[Math.floor(Math.random() * source.length)];
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    picked.push({ ...candidate, id: `bank-${Date.now().toString(36)}-${picked.length}` });
  }
  return picked;
}
