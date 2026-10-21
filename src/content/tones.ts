/**
 * Tone-drill data: real minimal quadruplets where only the tone changes.
 * These are the classic pairs Chinese teachers use, so drilling them trains the
 * exact contrasts that English speakers collapse (T2/T3 and T1/T4 especially).
 */
import type { ToneSet } from '../types';

export const TONE_SETS: ToneSet[] = [
  {
    id: 'ma',
    syllable: 'ma',
    words: [
      { tone: 1, hanzi: '妈', pinyin: 'ma1', en: 'mother' },
      { tone: 2, hanzi: '麻', pinyin: 'ma2', en: 'hemp / numb' },
      { tone: 3, hanzi: '马', pinyin: 'ma3', en: 'horse' },
      { tone: 4, hanzi: '骂', pinyin: 'ma4', en: 'to scold' },
    ],
  },
  {
    id: 'shi',
    syllable: 'shi',
    words: [
      { tone: 1, hanzi: '湿', pinyin: 'shi1', en: 'wet' },
      { tone: 2, hanzi: '十', pinyin: 'shi2', en: 'ten' },
      { tone: 3, hanzi: '史', pinyin: 'shi3', en: 'history' },
      { tone: 4, hanzi: '是', pinyin: 'shi4', en: 'to be' },
    ],
  },
  {
    id: 'tang',
    syllable: 'tang',
    words: [
      { tone: 1, hanzi: '汤', pinyin: 'tang1', en: 'soup' },
      { tone: 2, hanzi: '糖', pinyin: 'tang2', en: 'sugar' },
      { tone: 3, hanzi: '躺', pinyin: 'tang3', en: 'to lie down' },
      { tone: 4, hanzi: '烫', pinyin: 'tang4', en: 'scalding hot' },
    ],
  },
  {
    id: 'ba',
    syllable: 'ba',
    words: [
      { tone: 1, hanzi: '八', pinyin: 'ba1', en: 'eight' },
      { tone: 2, hanzi: '拔', pinyin: 'ba2', en: 'to pull out' },
      { tone: 3, hanzi: '把', pinyin: 'ba3', en: 'to hold / measure word' },
      { tone: 4, hanzi: '爸', pinyin: 'ba4', en: 'dad' },
    ],
  },
  {
    id: 'yi',
    syllable: 'yi',
    words: [
      { tone: 1, hanzi: '衣', pinyin: 'yi1', en: 'clothing' },
      { tone: 2, hanzi: '姨', pinyin: 'yi2', en: 'aunt' },
      { tone: 3, hanzi: '椅', pinyin: 'yi3', en: 'chair' },
      { tone: 4, hanzi: '意', pinyin: 'yi4', en: 'meaning' },
    ],
  },
  {
    id: 'wu',
    syllable: 'wu',
    words: [
      { tone: 1, hanzi: '屋', pinyin: 'wu1', en: 'room' },
      { tone: 2, hanzi: '无', pinyin: 'wu2', en: 'none' },
      { tone: 3, hanzi: '五', pinyin: 'wu3', en: 'five' },
      { tone: 4, hanzi: '雾', pinyin: 'wu4', en: 'fog' },
    ],
  },
  {
    id: 'yan',
    syllable: 'yan',
    words: [
      { tone: 1, hanzi: '烟', pinyin: 'yan1', en: 'smoke' },
      { tone: 2, hanzi: '盐', pinyin: 'yan2', en: 'salt' },
      { tone: 3, hanzi: '眼', pinyin: 'yan3', en: 'eye' },
      { tone: 4, hanzi: '燕', pinyin: 'yan4', en: 'swallow (bird)' },
    ],
  },
  {
    id: 'qi',
    syllable: 'qi',
    words: [
      { tone: 1, hanzi: '七', pinyin: 'qi1', en: 'seven' },
      { tone: 2, hanzi: '骑', pinyin: 'qi2', en: 'to ride' },
      { tone: 3, hanzi: '起', pinyin: 'qi3', en: 'to get up' },
      { tone: 4, hanzi: '气', pinyin: 'qi4', en: 'air / anger' },
    ],
  },
  {
    id: 'ji',
    syllable: 'ji',
    words: [
      { tone: 1, hanzi: '鸡', pinyin: 'ji1', en: 'chicken' },
      { tone: 2, hanzi: '极', pinyin: 'ji2', en: 'extremely' },
      { tone: 3, hanzi: '几', pinyin: 'ji3', en: 'how many' },
      { tone: 4, hanzi: '记', pinyin: 'ji4', en: 'to remember' },
    ],
  },
  {
    id: 'xi',
    syllable: 'xi',
    words: [
      { tone: 1, hanzi: '西', pinyin: 'xi1', en: 'west' },
      { tone: 2, hanzi: '习', pinyin: 'xi2', en: 'to practise' },
      { tone: 3, hanzi: '洗', pinyin: 'xi3', en: 'to wash' },
      { tone: 4, hanzi: '细', pinyin: 'xi4', en: 'thin / fine' },
    ],
  },
  {
    id: 'tong',
    syllable: 'tong',
    words: [
      { tone: 1, hanzi: '通', pinyin: 'tong1', en: 'to pass through' },
      { tone: 2, hanzi: '铜', pinyin: 'tong2', en: 'copper' },
      { tone: 3, hanzi: '桶', pinyin: 'tong3', en: 'bucket' },
      { tone: 4, hanzi: '痛', pinyin: 'tong4', en: 'painful' },
    ],
  },
  {
    id: 'wen',
    syllable: 'wen',
    words: [
      { tone: 1, hanzi: '温', pinyin: 'wen1', en: 'warm' },
      { tone: 2, hanzi: '文', pinyin: 'wen2', en: 'writing' },
      { tone: 3, hanzi: '吻', pinyin: 'wen3', en: 'to kiss' },
      { tone: 4, hanzi: '问', pinyin: 'wen4', en: 'to ask' },
    ],
  },
  {
    id: 'hui',
    syllable: 'hui',
    words: [
      { tone: 1, hanzi: '灰', pinyin: 'hui1', en: 'grey' },
      { tone: 2, hanzi: '回', pinyin: 'hui2', en: 'to return' },
      { tone: 3, hanzi: '悔', pinyin: 'hui3', en: 'to regret' },
      { tone: 4, hanzi: '会', pinyin: 'hui4', en: 'can / to know how' },
    ],
  },
  {
    id: 'zhu',
    syllable: 'zhu',
    words: [
      { tone: 1, hanzi: '猪', pinyin: 'zhu1', en: 'pig' },
      { tone: 2, hanzi: '竹', pinyin: 'zhu2', en: 'bamboo' },
      { tone: 3, hanzi: '煮', pinyin: 'zhu3', en: 'to boil' },
      { tone: 4, hanzi: '住', pinyin: 'zhu4', en: 'to live (somewhere)' },
    ],
  },
  {
    id: 'liu',
    syllable: 'liu',
    words: [
      { tone: 1, hanzi: '溜', pinyin: 'liu1', en: 'to slip away' },
      { tone: 2, hanzi: '流', pinyin: 'liu2', en: 'to flow' },
      { tone: 3, hanzi: '柳', pinyin: 'liu3', en: 'willow' },
      { tone: 4, hanzi: '六', pinyin: 'liu4', en: 'six' },
    ],
  },
  {
    id: 'du',
    syllable: 'du',
    words: [
      { tone: 1, hanzi: '都', pinyin: 'du1', en: 'capital city' },
      { tone: 2, hanzi: '读', pinyin: 'du2', en: 'to read' },
      { tone: 3, hanzi: '堵', pinyin: 'du3', en: 'blocked / jammed' },
      { tone: 4, hanzi: '度', pinyin: 'du4', en: 'degree' },
    ],
  },
  {
    id: 'wan',
    syllable: 'wan',
    words: [
      { tone: 1, hanzi: '弯', pinyin: 'wan1', en: 'to bend / curved' },
      { tone: 2, hanzi: '完', pinyin: 'wan2', en: 'finished' },
      { tone: 3, hanzi: '晚', pinyin: 'wan3', en: 'late' },
      { tone: 4, hanzi: '万', pinyin: 'wan4', en: 'ten thousand' },
    ],
  },
  {
    id: 'bao',
    syllable: 'bao',
    words: [
      { tone: 1, hanzi: '包', pinyin: 'bao1', en: 'bag' },
      { tone: 2, hanzi: '薄', pinyin: 'bao2', en: 'thin (flat things)' },
      { tone: 3, hanzi: '饱', pinyin: 'bao3', en: 'full (from eating)' },
      { tone: 4, hanzi: '抱', pinyin: 'bao4', en: 'to hug' },
    ],
  },
  {
    id: 'pao',
    syllable: 'pao',
    words: [
      { tone: 1, hanzi: '抛', pinyin: 'pao1', en: 'to throw' },
      { tone: 2, hanzi: '袍', pinyin: 'pao2', en: 'robe' },
      { tone: 3, hanzi: '跑', pinyin: 'pao3', en: 'to run' },
      { tone: 4, hanzi: '泡', pinyin: 'pao4', en: 'bubble / to soak' },
    ],
  },
  {
    id: 'sheng',
    syllable: 'sheng',
    words: [
      { tone: 1, hanzi: '生', pinyin: 'sheng1', en: 'raw / to be born' },
      { tone: 2, hanzi: '绳', pinyin: 'sheng2', en: 'rope' },
      { tone: 3, hanzi: '省', pinyin: 'sheng3', en: 'province / to save' },
      { tone: 4, hanzi: '胜', pinyin: 'sheng4', en: 'to win' },
    ],
  },
];
