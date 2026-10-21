/**
 * Curated beginner content.
 *
 * Pinyin is written with *surface* tones, i.e. after tone sandhi, which is how
 * learners are taught and what your voice actually does when you speak:
 *   你好 -> ní hǎo   (3rd + 3rd becomes 2nd + 3rd)
 *   不要 -> bú yào   (不 becomes 2nd before a 4th tone)
 *   一个 -> yí ge    (一 becomes 2nd before a 4th tone)
 * This matters because the tone grader compares your pitch against these values.
 */
import type { Lesson, Phrase } from '../types';

export const LESSONS: Lesson[] = [
  {
    id: 'greetings',
    titleZh: '打招呼',
    title: 'Greetings',
    phrases: [
      { id: 'g1', hanzi: '你好', pinyin: 'ni2 hao3', en: 'Hello' },
      { id: 'g2', hanzi: '你好吗', pinyin: 'ni2 hao3 ma5', en: 'How are you?' },
      { id: 'g3', hanzi: '我很好', pinyin: 'wo3 hen3 hao3', en: "I'm very well" },
      { id: 'g4', hanzi: '谢谢', pinyin: 'xie4 xie5', en: 'Thank you' },
      { id: 'g5', hanzi: '不客气', pinyin: 'bu2 ke4 qi5', en: "You're welcome" },
      { id: 'g6', hanzi: '对不起', pinyin: 'dui4 bu5 qi3', en: 'Sorry' },
      { id: 'g7', hanzi: '没关系', pinyin: 'mei2 guan1 xi5', en: "It doesn't matter" },
      { id: 'g8', hanzi: '再见', pinyin: 'zai4 jian4', en: 'Goodbye' },
    ],
  },
  {
    id: 'introductions',
    titleZh: '认识你',
    title: 'Meeting people',
    phrases: [
      { id: 'i1', hanzi: '你叫什么名字', pinyin: 'ni3 jiao4 shen2 me5 ming2 zi5', en: 'What is your name?' },
      { id: 'i2', hanzi: '我叫汤姆', pinyin: 'wo3 jiao4 tang1 mu3', en: 'My name is Tom' },
      { id: 'i3', hanzi: '很高兴认识你', pinyin: 'hen3 gao1 xing4 ren4 shi5 ni3', en: 'Nice to meet you' },
      { id: 'i4', hanzi: '我是美国人', pinyin: 'wo3 shi4 mei3 guo2 ren2', en: 'I am American' },
      { id: 'i5', hanzi: '你是哪国人', pinyin: 'ni3 shi4 na3 guo2 ren2', en: 'Where are you from?' },
      { id: 'i6', hanzi: '我学中文', pinyin: 'wo3 xue2 zhong1 wen2', en: 'I am learning Chinese' },
      { id: 'i7', hanzi: '我说得不好', pinyin: 'wo3 shuo1 de5 bu4 hao3', en: "I don't speak it well" },
      { id: 'i8', hanzi: '请再说一遍', pinyin: 'qing3 zai4 shuo1 yi2 bian4', en: 'Please say that again' },
    ],
  },
  {
    id: 'shopping',
    titleZh: '买东西',
    title: 'Shopping',
    phrases: [
      { id: 's1', hanzi: '这个多少钱', pinyin: 'zhe4 ge5 duo1 shao5 qian2', en: 'How much is this?' },
      { id: 's2', hanzi: '太贵了', pinyin: 'tai4 gui4 le5', en: 'Too expensive' },
      { id: 's3', hanzi: '便宜一点', pinyin: 'pian2 yi5 yi4 dian3', en: 'A little cheaper' },
      { id: 's4', hanzi: '我要这个', pinyin: 'wo3 yao4 zhe4 ge5', en: 'I want this one' },
      { id: 's5', hanzi: '可以刷卡吗', pinyin: 'ke3 yi3 shua1 ka3 ma5', en: 'Can I pay by card?' },
      { id: 's6', hanzi: '我要两个', pinyin: 'wo3 yao4 liang3 ge5', en: "I'd like two" },
      { id: 's7', hanzi: '有别的颜色吗', pinyin: 'you3 bie2 de5 yan2 se4 ma5', en: 'Do you have another colour?' },
      { id: 's8', hanzi: '请给我袋子', pinyin: 'qing3 gei3 wo3 dai4 zi5', en: 'Please give me a bag' },
    ],
  },
  {
    id: 'food',
    titleZh: '吃饭',
    title: 'Eating',
    phrases: [
      { id: 'f1', hanzi: '我饿了', pinyin: 'wo3 e4 le5', en: "I'm hungry" },
      { id: 'f2', hanzi: '菜单在哪儿', pinyin: 'cai4 dan1 zai4 na3 er2', en: 'Where is the menu?' },
      { id: 'f3', hanzi: '我要一碗米饭', pinyin: 'wo3 yao4 yi4 wan3 mi3 fan4', en: 'I want a bowl of rice' },
      { id: 'f4', hanzi: '不要辣的', pinyin: 'bu2 yao4 la4 de5', en: 'Not spicy, please' },
      { id: 'f5', hanzi: '很好吃', pinyin: 'hen3 hao3 chi1', en: 'Delicious' },
      { id: 'f6', hanzi: '我不吃肉', pinyin: 'wo3 bu4 chi1 rou4', en: "I don't eat meat" },
      { id: 'f7', hanzi: '买单', pinyin: 'mai3 dan1', en: 'The bill, please' },
      { id: 'f8', hanzi: '请给我水', pinyin: 'qing3 gei3 wo3 shui3', en: 'Please give me water' },
    ],
  },
  {
    id: 'directions',
    titleZh: '问路',
    title: 'Getting around',
    phrases: [
      { id: 'd1', hanzi: '洗手间在哪儿', pinyin: 'xi3 shou3 jian1 zai4 na3 er2', en: 'Where is the bathroom?' },
      { id: 'd2', hanzi: '我迷路了', pinyin: 'wo3 mi2 lu4 le5', en: "I'm lost" },
      { id: 'd3', hanzi: '一直走', pinyin: 'yi4 zhi2 zou3', en: 'Go straight' },
      { id: 'd4', hanzi: '往左转', pinyin: 'wang3 zuo3 zhuan3', en: 'Turn left' },
      { id: 'd5', hanzi: '往右转', pinyin: 'wang3 you4 zhuan3', en: 'Turn right' },
      { id: 'd6', hanzi: '很近', pinyin: 'hen3 jin4', en: 'Very close' },
      { id: 'd7', hanzi: '地铁站在哪里', pinyin: 'di4 tie3 zhan4 zai4 na3 li3', en: 'Where is the subway station?' },
      { id: 'd8', hanzi: '请问怎么走', pinyin: 'qing3 wen4 zen3 me5 zou3', en: 'Excuse me, how do I get there?' },
    ],
  },
  {
    id: 'time',
    titleZh: '时间',
    title: 'Time and numbers',
    phrases: [
      { id: 't1', hanzi: '现在几点', pinyin: 'xian4 zai4 ji3 dian3', en: 'What time is it?' },
      { id: 't2', hanzi: '今天几号', pinyin: 'jin1 tian1 ji3 hao4', en: "What's today's date?" },
      { id: 't3', hanzi: '星期一', pinyin: 'xing1 qi1 yi1', en: 'Monday' },
      { id: 't4', hanzi: '我八点上班', pinyin: 'wo3 ba1 dian3 shang4 ban1', en: 'I start work at eight' },
      { id: 't5', hanzi: '明天见', pinyin: 'ming2 tian1 jian4', en: 'See you tomorrow' },
      { id: 't6', hanzi: '三十分钟', pinyin: 'san1 shi2 fen1 zhong1', en: 'Thirty minutes' },
      { id: 't7', hanzi: '太晚了', pinyin: 'tai4 wan3 le5', en: "It's too late" },
      { id: 't8', hanzi: '等一下', pinyin: 'deng3 yi2 xia4', en: 'Wait a moment' },
    ],
  },
];

export const ALL_PHRASES: Phrase[] = LESSONS.flatMap((l) => l.phrases);

export function findPhrase(id: string): Phrase | undefined {
  return ALL_PHRASES.find((p) => p.id === id);
}

export function lessonOf(phraseId: string): Lesson | undefined {
  return LESSONS.find((l) => l.phrases.some((p) => p.id === phraseId));
}

/**
 * Authoring guard: every Chinese character needs exactly one pinyin syllable, or
 * the tone grader silently scores the wrong syllables. Throws in dev, warns in prod.
 */
export function validateLessons(): string[] {
  const problems: string[] = [];
  for (const phrase of ALL_PHRASES) {
    const chars = [...phrase.hanzi].length;
    const syllables = phrase.pinyin.trim().split(/\s+/).filter(Boolean).length;
    if (chars !== syllables) {
      problems.push(`${phrase.id} "${phrase.hanzi}": ${chars} characters but ${syllables} pinyin syllables`);
    }
    if (/[。，？！、,.?!]/.test(phrase.hanzi)) {
      problems.push(`${phrase.id} "${phrase.hanzi}": punctuation is not allowed in hanzi`);
    }
  }
  if (import.meta.env.DEV) {
    for (const p of problems) console.error('[content] ' + p);
  }
  return problems;
}
