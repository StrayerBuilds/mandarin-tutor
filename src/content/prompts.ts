/**
 * Prompts and reply parsing.
 *
 * The model is forced into a labelled four-line format so the app can render
 * characters, pinyin and English as separate layers and grade against the pinyin.
 * Parsing is deliberately forgiving: small models drift, and a missing label
 * should degrade to "Chinese only" rather than showing the learner raw markup.
 */
import type { Phrase, TutorReply } from '../types';

export type TutorMode = 'chat' | 'scenario' | 'explain';

export interface Scenario {
  id: string;
  title: string;
  setup: string;
}

export const SCENARIOS: Scenario[] = [
  { id: 'cafe', title: 'Ordering coffee', setup: 'You are a barista in a busy Beijing café. Take my order and ask about size and milk.' },
  { id: 'taxi', title: 'Taking a taxi', setup: 'You are a friendly taxi driver in Shanghai. I will tell you where to go; ask for the address if it is unclear.' },
  { id: 'market', title: 'Haggling at a market', setup: 'You are a stallholder at a clothing market. Start at a high price and let me bargain.' },
  { id: 'hotel', title: 'Checking into a hotel', setup: 'You are the receptionist at a hotel. Ask for my passport and confirm the number of nights.' },
  { id: 'doctor', title: 'At the doctor', setup: 'You are a doctor. Ask what is wrong, how long it has been going on, and give simple advice.' },
  { id: 'friend', title: 'Meeting a friend', setup: 'You are my Chinese friend meeting me after a long time. Be warm and curious about my life.' },
  { id: 'restaurant', title: 'Ordering food', setup: 'You are a waiter at a small restaurant. Recommend dishes and ask about spice and drinks.' },
  { id: 'directions', title: 'Asking for directions', setup: 'You are a passer-by in a big city. I am lost; tell me the way and mention landmarks.' },
];

const FORMAT_RULES = `
Always reply in exactly this four-line format, in this order, with nothing before or after:

ZH: <your Chinese, characters only, no pinyin, no English>
PY: <pinyin with tone numbers, one syllable per Chinese character, space separated, e.g. ni3 hao3>
EN: <natural English translation of the ZH line>
NOTE: <one short, concrete tip in English: the grammar point, tone, or word you just used>

Hard rules:
- Keep ZH to one or two short sentences.
- PY must have exactly one syllable per character in ZH.
- Never merge lines. Never add extra labels. Never use markdown.
- Stay at HSK 1-2 level unless the learner explicitly asks for more.
- If the learner wrote something incorrect, put the corrected version in ZH and explain the fix in NOTE.
`.trim();

export function systemPrompt(mode: TutorMode, scenario?: Scenario): string {
  const persona =
    "You are 小文, a patient Mandarin tutor for an English-speaking beginner. You correct gently and never lecture.";

  if (mode === 'scenario' && scenario) {
    return `${persona}

Roleplay: ${scenario.setup}
Stay in character as that person. Speak only Chinese in ZH, and keep your turns short so the learner gets a chance to reply. End each turn with a question.

${FORMAT_RULES}`;
  }

  if (mode === 'explain') {
    return `${persona}

The learner is asking about how Chinese works. Answer their question directly in the EN line, give a concrete Chinese example in ZH, and use NOTE for a memory hook or a common mistake to avoid.

${FORMAT_RULES}`;
  }

  return `${persona}

Chat naturally about everyday things — food, weather, work, travel, hobbies. Keep it simple and warm. Always end with a short question so the conversation keeps going.

${FORMAT_RULES}`;
}

const LABEL_MAP: Record<string, keyof TutorReply> = {
  zh: 'zh',
  '中文': 'zh',
  chinese: 'zh',
  py: 'pinyin',
  pinyin: 'pinyin',
  '拼音': 'pinyin',
  en: 'en',
  english: 'en',
  '英文': 'en',
  note: 'note',
  notes: 'note',
  tip: 'note',
  '提示': 'note',
};

/** Pulls ZH / PY / EN / NOTE out of a model reply, tolerating markdown and Chinese labels. */
export function parseTutorReply(raw: string): TutorReply {
  const reply: TutorReply = { zh: '', pinyin: '', en: '', note: '', raw };
  const lineRe = /^\s*(?:[-*#>\s]|\*\*)*\s*(ZH|PY|EN|NOTE|NOTES|TIP|中文|拼音|英文|提示)\s*(?:\*\*)?\s*[:：]\s*(.*)$/i;

  const lines = raw.split(/\r?\n/);
  let current: keyof TutorReply | null = null;

  for (const line of lines) {
    const m = line.match(lineRe);
    if (m) {
      const field = LABEL_MAP[m[1].toLowerCase()];
      if (field) {
        current = field;
        reply[field] = m[2].trim();
        continue;
      }
    }
    if (current && line.trim()) {
      reply[current] = `${reply[current]} ${line.trim()}`.trim();
    }
  }

  // Model ignored the format: show what it wrote rather than an empty card.
  if (!reply.zh) {
    reply.zh = raw.replace(/^\s*(ZH|PY|EN|NOTE)\s*[:：].*$/gim, '').trim() || raw.trim();
  }
  // Some models separate the pinyin with hyphens or slashes by syllable.
  reply.pinyin = reply.pinyin.replace(/[-–/]/g, ' ').replace(/\s+/g, ' ').trim();

  return reply;
}

export const PHRASE_GEN_PROMPT = `You write Chinese practice sentences for a beginner English speaker.

Produce exactly the number of sentences requested, one per line, in this format:

<number>. <Chinese characters> | <pinyin with tone numbers, one syllable per character, space separated> | <English>

Rules:
- Characters only on the left of the first bar, no pinyin and no punctuation marks other than , and ! inside the Chinese.
- Exactly one pinyin syllable per Chinese character.
- HSK 1-2 vocabulary and grammar. Short sentences.
- No commentary, no headings, no blank lines.`;

/** Parses the phrase-generator output into app phrases. */
export function parseGeneratedPhrases(raw: string, tag: string): Phrase[] {
  const out: Phrase[] = [];
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const cleaned = line.replace(/^\s*\d+\s*[).、]\s*/, '').trim();
    if (!cleaned || !cleaned.includes('|')) continue;

    const parts = cleaned.split('|').map((p) => p.trim());
    if (parts.length < 2) continue;

    const hanzi = [...parts[0]].filter((ch) => /\p{Script=Han}/u.test(ch)).join('');
    const pinyin = parts[1].replace(/[-–/]/g, ' ').replace(/\s+/g, ' ').toLowerCase();
    const en = parts[2] ?? '';
    if (!hanzi || !pinyin) continue;

    const syllables = pinyin.split(' ').filter(Boolean).length;
    if ([...hanzi].length !== syllables) continue;

    out.push({ id: `gen-${tag}-${out.length}`, hanzi, pinyin, en });
  }

  return out;
}

/** Keeps the context short — a phone cannot afford a long history. */
export function trimHistory<T>(messages: T[], maxMessages: number): T[] {
  if (messages.length <= maxMessages) return messages;
  return messages.slice(messages.length - maxMessages);
}
