'use strict';

/* ============================================================
   ブロック配置（18列固定。記号:
     N=普通 / H=硬い(HP2) / h=硬い(HP3) / I=アイテム / X=消えない / .=空)

   palette: そのステージの普通ブロック＆HP=1の硬いブロックで使う色セット
   ============================================================ */
const STAGES = [
  // 1: ハート💕 — レッド/ピンク
  { name: 'Heart',
    palette: ['#F7A8C4', '#FFB4D0', '#F590B0', '#FFC0DC', '#FF9FB6'],
    rows: [
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

  // 2: 星✨ — ゴールド（メタル金色）
  { name: 'Star',
    palette: ['#D4AF37', '#C9962B', '#E5BB52', '#B8860B', '#DAA520'],
    rows: [
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

  // 3: 花🌸 — チェリーブロッサム
  { name: 'Flower',
    palette: ['#FFB6C8', '#FFC4D2', '#FFA8BC', '#FFC9D6', '#FFAEC4'],
    rows: [
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

  // 4: 猫🐈 — オレンジ/三毛（顔: 三角耳・目・鼻・口）
  { name: 'Cat',
    palette: ['#FFC890', '#FFB47A', '#FFD4A4', '#FFC080', '#FFA868'],
    rows: [
      '....HH......HH....',
      '...HHHH....HHHH...',
      '...NNNNNNNNNNNN...',
      '...NNNNNNNNNNNN...',
      '...NN.II..II.NN...',
      '...NNNNNNNNNNNN...',
      '...NNNN.NN.NNNN...',
      '...NNNNNNNNNNNN...',
      '....NNNNNNNNNN....',
      '.....NNNNNNNN.....',
    ] },

  // 5: 月と雲🌙 — ブルー/シルバー
  { name: 'Moon',
    palette: ['#A8D8F0', '#C2E2F4', '#90C8E8', '#B4DAEC', '#7DB8DC'],
    rows: [
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

  // 6: リボン🎀 — ピンク/ラベンダー
  { name: 'Ribbon',
    palette: ['#F7A8C4', '#FFB8D5', '#E89AB8', '#FFCEE0', '#FFA8C8'],
    rows: [
      '...NNN......NNN...',
      '...NNNN....NNNN...',
      '...NNNNNNNNNNNN...',
      '...NNH.IIII.HNN...',
      '...NNNNNNNNNNNN...',
      '...NNNN....NNNN...',
      '...NNN......NNN...',
    ] },

  // 7: インベーダー👾 — グリーン/サイバー
  { name: 'Invader',
    palette: ['#A8E0C0', '#8FD4A8', '#C0E8D0', '#7CCB95', '#B0E0BC'],
    rows: [
      '....N..NNNN..N....',
      '.....NNNNNNNN.....',
      '....NNHHNNHHNN....',
      '....NNNNNNNNNN....',
      '....NN.NNNN.NN....',
      '....N..NNNN..N....',
      '....I..IIII..I....',
    ] },

  // 8: 雪の結晶❄ — アイスブルー
  { name: 'Snowflake',
    palette: ['#B8E0F0', '#C8E8F4', '#A0D8EC', '#D0EBF6', '#B0DCEE'],
    rows: [
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

  // 9: クラウン👑 — パープル/ロイヤル（3つの尖塔・左右対称・中央に宝石1個）
  { name: 'Crown',
    palette: ['#D6B8F0', '#C8A8E8', '#DCC2F2', '#B89BE0', '#C0AAEC'],
    rows: [
      '...h.....h.....h..',
      '...h.....h.....h..',
      '...hh...hhh...hh..',
      '...hhhhhhhhhhhhh..',
      '...HHHHHHHHHHHHH..',
      '...HHHHHHIHHHHHH..',
      '...HHHHHHHHHHHHH..',
      '...hhhhhhhhhhhhh..',
    ] },

  // 10: BOSS パソコンの基板 — エレクトリックグリーン
  // 上侵入口（列4,9,14）から行06の横通路へ抜けるための縦穴を左右に追加
  { name: 'PC Circuit',
    palette: ['#A8E0C0', '#80D49A', '#9CD8AE', '#B4E4C8', '#88CC9C'],
    rows: [
      'XXX.XXXX.XXXX.XXXX',
      'XNXNNHNNNNNNHNNNNX',
      'XNX.XNXXXXXXNX.XNX',
      'XNNNNNNNINNNNNNNNX',
      'XNX..NXHXXXNN..NXX',
      '.NNNNNNNNINNNNNNN.',
      'XXXNXXXXXXXHXNXNXX',
      'XNNNNNNHNNNNNNNNNX',
      'XXXXXXNXXXXXXXXXXX',
      'XXXXX.XXXXXXXXXXXX',
    ] },
];
