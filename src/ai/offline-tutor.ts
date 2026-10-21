/**
 * What the app does when the phone cannot run the language model.
 *
 * This is not a pretend AI. It is a small scripted tutor that handles the most
 * common beginner exchanges from curated content, and says plainly that free-form
 * conversation needs WebGPU. Everything else in the app — shadowing, tone grading,
 * lessons — is unaffected.
 */
import { ALL_PHRASES } from '../content/lessons';
import type { TutorReply } from '../types';

export const OFFLINE_BANNER =
  'No WebGPU on this device, so the conversation model is off. Lessons, shadowing and tone grading all still run locally.';

export const OFFLINE_LABEL = 'Scripted tutor';

interface Scripted {
  match: RegExp;
  zh: string;
  pinyin: string;
  en: string;
  note: string;
}

const SCRIPTS: Scripted[] = [
  {
    match: /\b(hi|hello|hey|good morning|good evening)\b|你好|哈罗/i,
    zh: '你好',
    pinyin: 'ni2 hao3',
    en: 'Hello.',
    note: '你好 is the all-purpose greeting. Say ní hǎo — the first syllable rises, the second dips then lifts.',
  },
  {
    match: /how are you|你好吗|how's it going/i,
    zh: '我很好谢谢',
    pinyin: 'wo3 hen3 hao3 xie4 xie5',
    en: "I'm very well, thank you.",
    note: 'Answer with 我很好 then 谢谢. 很 (hěn) softens adjectives — it is not really "very".',
  },
  {
    match: /\b(thank|thanks|ta)\b|谢谢/i,
    zh: '不客气',
    pinyin: 'bu2 ke4 qi5',
    en: "You're welcome.",
    note: '不客气 is bú kèqi — 不 shifts to the 2nd tone before a 4th tone.',
  },
  {
    match: /my name is (.+)|我叫|what.*your name|你叫什么/i,
    zh: '你叫什么名字',
    pinyin: 'ni3 jiao4 shen2 me5 ming2 zi5',
    en: 'What is your name?',
    note: '我叫 + name, literally "I am called". 名字 (míngzi) is name.',
  },
  {
    match: /how much|多少钱|price|cost/i,
    zh: '这个多少钱',
    pinyin: 'zhe4 ge5 duo1 shao5 qian2',
    en: 'How much is this?',
    note: '多少钱 literally "how much money". 少 here is neutral: shao, not shǎo.',
  },
  {
    match: /too expensive|贵|cheap|discount/i,
    zh: '太贵了便宜一点',
    pinyin: 'tai4 gui4 le5 pian2 yi5 yi4 dian3',
    en: 'Too expensive — a little cheaper.',
    note: '太…了 is the "too much" frame. 便宜一点 = "a bit cheaper".',
  },
  {
    match: /bathroom|toilet|restroom|washroom|卫生间|厕所|洗手间/i,
    zh: '洗手间在哪儿',
    pinyin: 'xi3 shou3 jian1 zai4 na3 er2',
    en: 'Where is the bathroom?',
    note: '在哪儿 (zài nǎr) means "where is it". 洗手间 is the polite word.',
  },
  {
    match: /where is|怎么走|迷路|lost/i,
    zh: '请问怎么走',
    pinyin: 'qing3 wen4 zen3 me5 zou3',
    en: 'Excuse me, how do I get there?',
    note: 'Start any request to a stranger with 请问 — it is the polite opener.',
  },
  {
    match: /water|tea|beer|drink|水|茶/i,
    zh: '请给我水',
    pinyin: 'qing3 gei3 wo3 shui3',
    en: 'Please give me water.',
    note: '请 + 给我 + thing is the polite request pattern.',
  },
  {
    match: /hungry|food|eat|menu|吃|饿/i,
    zh: '我饿了菜单在哪儿',
    pinyin: 'wo3 e4 le5 cai4 dan1 zai4 na3 er2',
    en: "I'm hungry. Where is the menu?",
    note: '了 after 饿 marks the change of state — you are hungry now.',
  },
  {
    match: /don'?t understand|repeat|again|听不懂|再说/i,
    zh: '请再说一遍',
    pinyin: 'qing3 zai4 shuo1 yi2 bian4',
    en: 'Please say that again.',
    note: '一遍 is yí biàn — 一 becomes 2nd tone before a 4th tone.',
  },
  {
    match: /how do you say|what does .* mean|translate/i,
    zh: '这是什么意思',
    pinyin: 'zhe4 shi4 shen2 me5 yi4 si5',
    en: 'What does this mean?',
    note: '意思 (yìsi) is "meaning"; the second syllable is neutral.',
  },
  {
    match: /bye|goodbye|see you|再见/i,
    zh: '再见明天见',
    pinyin: 'zai4 jian4 ming2 tian1 jian4',
    en: 'Goodbye. See you tomorrow.',
    note: '明天见 = "see you tomorrow". Swap 明天 for any time word.',
  },
];

/** Picks a lesson phrase the learner has probably not drilled yet. */
function suggestion(): Scripted {
  const phrase = ALL_PHRASES[Math.floor(Math.random() * ALL_PHRASES.length)];
  return {
    match: /.*/,
    zh: phrase.hanzi,
    pinyin: phrase.pinyin,
    en: phrase.en,
    note: 'Try copying this one out loud in Shadowing — that mode works fully offline.',
  };
}

export function offlineReply(input: string): TutorReply {
  const text = input.trim();
  const hit = SCRIPTS.find((s) => s.match.test(text)) ?? suggestion();
  return { zh: hit.zh, pinyin: hit.pinyin, en: hit.en, note: hit.note, raw: hit.zh };
}

export function offlinePhraseReply(phrase: { hanzi: string; pinyin: string; en: string }): TutorReply {
  return {
    zh: phrase.hanzi,
    pinyin: phrase.pinyin,
    en: phrase.en,
    note: 'Generated from the built-in phrase bank because the language model is unavailable.',
    raw: phrase.hanzi,
  };
}
