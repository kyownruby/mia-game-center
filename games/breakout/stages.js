'use strict';

/* ============================================================
   ブロック配置（20列固定。記号:
     N=普通 / H=硬い(HP2) / h=硬い(HP3) / I=アイテム / X=消えない / .=空)

   テーマ別の絵柄ステージ：1〜3シンプル→10ボス（PC回路）
   ============================================================ */
const STAGES = [
  // 1: ハート💕（普通のみ）
  { name: 'Heart', rows: [
    '....NNNN....NNNN....',
    '...NNNNNN..NNNNNN...',
    '..NNNNNNNNNNNNNNNN..',
    '..NNNNNNNNNNNNNNNN..',
    '..NNNNNNNNNNNNNNNN..',
    '...NNNNNNNNNNNNNN...',
    '....NNNNNNNNNNNN....',
    '.....NNNNNNNNNN.....',
    '......NNNNNNNN......',
    '.......NNNNNN.......',
    '........NNNN........',
    '.........NN.........',
  ] },

  // 2: 星✨（先端にItem）
  { name: 'Star', rows: [
    '.........II.........',
    '........NNNN........',
    '........NNNN........',
    'NNNNNNNNNNNNNNNNNNNN',
    '.NNNNNNNNNNNNNNNNNN.',
    '..NNNNNNNNNNNNNNNN..',
    '...NNNNNNNNNNNNNN...',
    '....NNNN....NNNN....',
    '....NNN......NNN....',
    '....NN........NN....',
  ] },

  // 3: 花🌸（4花弁＋雌しべアイテム）
  { name: 'Flower', rows: [
    '.....NNNN..NNNN.....',
    '....NNNNNNNNNNNN....',
    '....NNNNNNNNNNNN....',
    '.....NNNN..NNNN.....',
    '.NN....NN..NN....NN.',
    'NNNN..NN.II.NN..NNNN',
    '.NN....NN..NN....NN.',
    '.....NNNN..NNNN.....',
    '....NNNNNNNNNNNN....',
    '....NNNNNNNNNNNN....',
    '.....NNNN..NNNN.....',
  ] },

  // 4: 猫🐈（耳に硬いブロック、目はItem）
  { name: 'Cat', rows: [
    '..NN..........NN....',
    '.HNNN........NNNH...',
    '.NNNNNNNNNNNNNNNN...',
    'NNNNNNNNNNNNNNNNNN..',
    'NNN.II.NNNN.II.NNN..',
    'NNNNNNNNNNNNNNNNNN..',
    'NNNN.NN....NN.NNNN..',
    'NNNNNNNNNNNNNNNNNN..',
    '.NNNNNNNNNNNNNNNN...',
    '..NNNNNNNNNNNNNN....',
  ] },

  // 5: 月と雲🌙（左に三日月、右に雲、ところどころに硬いブロック）
  { name: 'Moon & Cloud', rows: [
    '.NNNN.......NN......',
    'NNNNNN.....NNNN.....',
    'NNN........NNNNNN...',
    'NNN.......NNNNNNNN..',
    'NNN.H....NNNNNNNNN..',
    'NNN.....NNNNNNNNNN..',
    'NNN....NNNNNNNNNNN..',
    'NNNN..NNNNNNNNNNNN..',
    'NNNNNNNNNNN....NN...',
    '.NNNN..........NN...',
  ] },

  // 6: リボン🎀（結び目に硬い＋Item）
  { name: 'Ribbon', rows: [
    'NNNN........NNNN....',
    'NNNNN......NNNNN....',
    'NNNNNN....NNNNNN....',
    '.NNNNNN..NNNNNN.....',
    '..NNNNNNNNNNNN......',
    '....NNHIIHNN........',
    '..NNNNNNNNNNNN......',
    '.NNNNNN..NNNNNN.....',
    'NNNNNN....NNNNNN....',
    'NNNNN......NNNNN....',
    'NNNN........NNNN....',
  ] },

  // 7: インベーダー風👾（硬いを目に、消えないを足に）
  { name: 'Invader', rows: [
    '....N..NNNN..N......',
    '.....NNNNNNNN.......',
    '....NNHHNNHHNN......',
    '....NNNNNNNNNN......',
    '....NN.NNNN.NN......',
    '....N..NNNN..N......',
    '.....I..II..I.......',
    '.....X........X.....',
  ] },

  // 8: 雪の結晶❄（硬いブロック＋Itemの中央）
  { name: 'Snowflake', rows: [
    '.........II.........',
    '.........HH.........',
    '....H....HH....H....',
    '.HHHH....HH....HHHH.',
    '...HH....HH....HH...',
    '.....HHHHHHHHHH.....',
    '.....HHHHHHHHHH.....',
    '...HH....HH....HH...',
    '.HHHH....HH....HHHH.',
    '....H....HH....H....',
    '.........HH.........',
    '.........II.........',
  ] },

  // 9: クラウン👑（3つの尖塔・宝石としてItem、HP3で堅め）
  { name: 'Crown', rows: [
    '.hh.....hh....hh....',
    '.hh.....hh....hh....',
    '.hh.....hh....hh....',
    '.hhhhhhhhhhhhhhhh...',
    '.HHHHHHHHHHHHHHHH...',
    '.HHIHHHIIHHIIHHIH...',
    '.HHHHHHHHHHHHHHHH...',
    '.HHHHHHHHHHHHHHHH...',
    'hhhhhhhhhhhhhhhhhh..',
  ] },

  // 10: BOSS パソコンの回路（消えないブロックで区画を作り、中に色んな種類）
  { name: 'PC Circuit', rows: [
    'XXXXXXXXXXXXXXXXXXXX',
    'X.NHIX.XhhIIX.XNNHIX',
    'X.NHIX.XhhIIX.XNNHIX',
    'XXX.X.XXX.XXXXX.XXXX',
    'XHHHX.X.NIIN.X.X.NNX',
    'XHHHX.X.NIIN.X.X.NNX',
    'XXXXX.XXXXXX.XXX.XXX',
    'XNNNXIIXhhhXXIIINNHX',
    'XNNNXIIXhhhXXIIINNHX',
    'XXXXXXXXXXXXXXXXXXXX',
  ] },
];
