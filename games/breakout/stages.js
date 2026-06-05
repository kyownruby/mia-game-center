'use strict';

/* ============================================================
   ブロック配置（18列固定。記号:
     N=普通 / H=硬い(HP2) / h=硬い(HP3) / I=アイテム / X=消えない / .=空)

   各ステージはテーマに沿った絵柄で、横幅を使い切らずに中央寄せで配置
   ============================================================ */
const STAGES = [
  // 1: ハート💕（10×10、ロブ太め＋V字ノッチ）
  { name: 'Heart', rows: [
    '....NN....NN......',
    '...NNNN..NNNN.....',
    '...NNNN..NNNN.....',
    '...NNNNNNNNNN.....',
    '...NNNNNNNNNN.....',
    '...NNNNNNNNNN.....',
    '....NNNNNNNN......',
    '.....NNNNNN.......',
    '......NNNN........',
    '.......NN.........',
  ] },

  // 2: 星✨（9×9、両端Item）
  { name: 'Star', rows: [
    '........I.........',
    '........N.........',
    '.......NNN........',
    '....NNNNNNNNN.....',
    '.....NNNNNNN......',
    '......NNNNN.......',
    '.....NN...NN......',
    '....NN.....NN.....',
    '...NN.......NN....',
  ] },

  // 3: 花🌸（9×9、雌しべItem）
  { name: 'Flower', rows: [
    '.......NNN........',
    '......NNNNN.......',
    '.......NNN........',
    '....NN.....NN.....',
    '...NNN..I..NNN....',
    '....NN.....NN.....',
    '.......NNN........',
    '......NNNNN.......',
    '.......NNN........',
  ] },

  // 4: 猫🐈（10×10、目はItem、耳に硬い）
  { name: 'Cat', rows: [
    '....HH.......HH...',
    '...HHHH.....HHHH..',
    '...NNNNNNNNNNNN...',
    '..NNNNNNNNNNNNNN..',
    '..NN.II.NN.II.NN..',
    '..NNNNNNNNNNNNNN..',
    '..NNN.NNNNNN.NNN..',
    '..NNNNN.NN.NNNNN..',
    '..NNNNNNNNNNNNNN..',
    '...NNNNNNNNNNNN...',
  ] },

  // 5: 月と雲🌙（8×9、三日月）
  { name: 'Moon', rows: [
    '.....NNNNNN.......',
    '....NNNNNNNN......',
    '....NN....NN......',
    '....NN............',
    '....NN............',
    '....NN............',
    '....NN....NN......',
    '....NNNNNNNN......',
    '.....NNNNNN.......',
  ] },

  // 6: リボン🎀（12×7、結び目に硬いとItem）
  { name: 'Ribbon', rows: [
    '...NNN......NNN...',
    '...NNNN....NNNN...',
    '...NNNNNNNNNNNN...',
    '...NNH.IIII.HNN...',
    '...NNNNNNNNNNNN...',
    '...NNNN....NNNN...',
    '...NNN......NNN...',
  ] },

  // 7: インベーダー👾（10×7、目に硬い、足にItem）
  { name: 'Invader', rows: [
    '....N..NNNN..N....',
    '.....NNNNNNNN.....',
    '....NNHHNNHHNN....',
    '....NNNNNNNNNN....',
    '....NN.NNNN.NN....',
    '....N..NNNN..N....',
    '....I..IIII..I....',
  ] },

  // 8: 雪の結晶❄（12×11、6角対称・先端Item）
  { name: 'Snowflake', rows: [
    '........II........',
    '........HH........',
    '...H....HH....H...',
    '...HH...HH...HH...',
    '....HH..HH..HH....',
    '...HHHHHHHHHHHH...',
    '....HH..HH..HH....',
    '...HH...HH...HH...',
    '...H....HH....H...',
    '........HH........',
    '........II........',
  ] },

  // 9: クラウン👑（11×8、3つの尖塔＋宝石Item）
  { name: 'Crown', rows: [
    '...h....h....h....',
    '...h....h....h....',
    '...hh..hh...hh....',
    '...hhhhhhhhhhh....',
    '...HHHHHHHHHHH....',
    '...HIHHIIHHIHH....',
    '...HHHHHHHHHHH....',
    '...hhhhhhhhhhh....',
  ] },

  // 10: BOSS パソコンの基板（X=配線外枠／N=回路の中身／H=接合点／I=CPUコア）
  // 侵入口: 上=列4,9,14 / 下=列6 / 横通路=行6両端
  { name: 'PC Circuit', rows: [
    'XXX.XXXX.XXXX.XXXX',
    'XNXNNHNNNNNNHNNNNX',
    'XNXXXNXXXXXXNXXXNX',
    'XNNNNNNNINNNNNNNNX',
    'XNXXXNXHXXXNNXXNXX',
    '.NNNNNNNNINNNNNNN.',
    'XXXNXXXXXXXHXNXNXX',
    'XNNNNNNHNNNNNNNNNX',
    'XXXXXXNXXXXXXXXXXX',
    'XXXXX.XXXXXXXXXXXX',
  ] },
];
