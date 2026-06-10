'use strict';

/* ============================================================
   ミア将棋 — 戦法データ（全10種・囲いとセット）
   仕様書 §5① のリストをそのまま定義。
   level: beginner / intermediate / advanced
   type : 表示用タイプ（攻め / 守り / バランス など）
   castle: セットで組む囲い
   ============================================================ */

const STRATEGIES = [
  // ---- 初心者向け（3つ）----
  {
    id: 'shikenbisha',
    no: 1,
    name: '四間飛車',
    level: 'beginner',
    type: 'バランス',
    castle: '美濃囲い',
    desc: '飛車を左から4つ目に振る大定番。守りとのセットが覚えやすい。',
  },
  {
    id: 'nakabisha',
    no: 2,
    name: '中飛車',
    level: 'beginner',
    type: 'やや攻撃',
    castle: '美濃囲い',
    desc: '飛車を真ん中に振り、攻めの狙いが分かりやすい。',
  },
  {
    id: 'bogin',
    no: 3,
    name: '棒銀',
    level: 'beginner',
    type: '攻撃',
    castle: '舟囲い',
    desc: '銀をまっすぐ進めて攻める超シンプルな攻め筋。',
  },

  // ---- 中級者向け（4つ）----
  {
    id: 'yagura',
    no: 4,
    name: '矢倉',
    level: 'intermediate',
    type: '守り',
    castle: '矢倉囲い',
    desc: '居飛車のがっちり型。守りが固く基本が詰まっているが手順が長め。',
  },
  {
    id: 'sankenbisha',
    no: 5,
    name: '三間飛車',
    level: 'intermediate',
    type: '攻撃寄り',
    castle: '美濃囲い',
    desc: '飛車を左から3つ目に。四間飛車より攻撃的な振り飛車。',
  },
  {
    id: 'gokigen',
    no: 6,
    name: 'ゴキゲン中飛車',
    level: 'intermediate',
    type: '攻撃',
    castle: '美濃囲い',
    desc: '中飛車を攻撃的にした人気戦法。早い攻めが魅力。',
  },
  {
    id: 'kakugawari',
    no: 7,
    name: '角換わり',
    level: 'intermediate',
    type: '攻撃〜バランス',
    castle: '矢倉囲い／腰掛け銀',
    desc: '序盤に角を交換してから戦うスピーディーな居飛車戦法。',
  },

  // ---- 上級者向け（3つ）----
  {
    id: 'anaguma',
    no: 8,
    name: '振り飛車穴熊',
    level: 'advanced',
    type: '守り（鉄壁）',
    castle: '振り飛車穴熊',
    desc: '振り飛車＋超鉄壁の穴熊。固いが組むのに手数がかかる。',
  },
  {
    id: 'gangi',
    no: 9,
    name: '雁木',
    level: 'advanced',
    type: 'バランス（柔軟）',
    castle: '雁木囲い',
    desc: 'プロでも復活した人気戦法。攻守に対応できる柔軟さが魅力。',
  },
  {
    id: 'migishiken',
    no: 10,
    name: '右四間飛車',
    level: 'advanced',
    type: '攻め（一点突破）',
    castle: '（簡易な囲い）',
    desc: '飛車・角・銀・桂を一点に集中させてブチ抜く超攻撃的戦法。',
  },
];

const STRATEGY_LEVELS = [
  { id: 'beginner', label: '初心者向け' },
  { id: 'intermediate', label: '中級者向け' },
  { id: 'advanced', label: '上級者向け' },
];
