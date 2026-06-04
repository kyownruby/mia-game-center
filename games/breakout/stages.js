'use strict';

/* ============================================================
   ブロック配置（10列固定。記号:
     N=普通 / H=硬い(HP2) / h=硬い(HP3) / I=アイテム / X=消えない / .=空)
   ============================================================ */
const STAGES = [
  // 1: シンプル横一列
  { rows: ['NNNNNNNNNN'] },
  // 2: シンプル2段
  { rows: ['NNNNNNNNNN', 'NNNNNNNNNN'] },
  // 3: ピラミッド
  { rows: ['..NNNNNN..', '.NNNNNNNN.', 'NNNNNNNNNN'] },
  // 4: 硬いブロックが1段
  { rows: ['HHHHHHHHHH', 'NNNNNNNNNN', 'NNNNNNNNNN'] },
  // 5: 4段ミックス
  { rows: ['HHHHHHHHHH', 'NHNHNHNHNH', 'HNHNHNHNHN', 'NNNNNNNNNN'] },
  // 6: チェッカー
  { rows: ['HNHNHNHNHN', 'NHNHNHNHNH', 'HNHNHNHNHN', 'NHNHNHNHNH'] },
  // 7: アイテム＋消えない混在
  { rows: ['NNNNNNNNNN', '.X.NININ.X', 'NNHHHHHHNN', 'NNNINNINNN'] },
  // 8: 戦略性
  { rows: ['HHIHHHHIHH', '.X.NNNN.X.', 'NNHHHHHHNN', 'NNIN..NIN.'] },
  // 9: 硬3混じり＋アイテム
  { rows: ['hhhhIhhhhI', 'HhHhHhHhHh', '.hIhIhIhI.', 'HHHHHHHHHH'] },
  // 10: ボスステージ（全部盛り）
  { rows: ['XhhIIIIhhX', 'hHHHHHHHHh', '.NXHHHHXN.', 'HIHHHHHHIH', 'NNNNHHNNNN', '.IXNNNNXI.'] },
];
