'use strict';

/* 簡易CPUの動作検証（Node 実行用）: node games/mia-shogi/cpu.test.js */

const E = require('./engine.js');
const CPU = require('./cpu.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
}
function piece(type, owner, promoted = false) { return { type, owner, promoted }; }

console.log('--- ふつう: 詰みがあれば詰ます ---');
{
  // 先手番・後手玉(0,4)は今は王手ではない。
  // 持ち駒の金を(1,4)に打つと頭金で詰み（金(2,5)が(1,4)を支える）。
  const board = E.emptyBoard();
  board[0][4] = piece('K', 'gote');
  board[2][5] = piece('G', 'sente');  // 打つ金を支える
  board[8][8] = piece('K', 'sente');
  const hands = E.emptyHands();
  hands.sente.G = 1;
  const s = { board, hands, turn: 'sente' };
  check('開始時は後手玉に王手がかかっていない（合法な局面）', E.isInCheck(s.board, 'gote') === false);
  const m = CPU.chooseMove(s, 'normal');
  const after = E.applyMove(s, m);
  check('ふつうCPUは詰みの一手を選ぶ', E.isCheckmate(after) === true);
}

console.log('--- ふつう: タダ駒は取る ---');
{
  // 先手番。後手の飛車(3,4)が無防備。先手歩(4,4)で取れる。
  const board = E.emptyBoard();
  board[8][4] = piece('K', 'sente');
  board[0][4] = piece('K', 'gote');
  board[3][4] = piece('R', 'gote');   // タダの飛車
  board[4][4] = piece('P', 'sente');  // これで取れる
  const s = { board, hands: E.emptyHands(), turn: 'sente' };
  const m = CPU.chooseMove(s, 'normal');
  check('ふつうCPUは無防備な飛車を取る', m.to[0] === 3 && m.to[1] === 4 && m.from && m.from[0] === 4 && m.from[1] === 4);
}

console.log('--- ふつう: タダで取られる手は避ける ---');
{
  // 先手番。歩(6,0)を(5,0)に進めると後手飛車(5,4)…ではなく、
  // (5,0)が後手の香(0,0)の利きに入る形にして「進めると取られる」を作る。
  const board = E.emptyBoard();
  board[8][4] = piece('K', 'sente');
  board[0][8] = piece('K', 'gote');
  board[0][0] = piece('L', 'gote');   // 0筋を直射する香
  board[6][0] = piece('P', 'sente');  // 進めると(5,0),(4,0)...は香の利き → 取られる
  board[6][4] = piece('P', 'sente');  // 安全な歩（こちらを選んでほしい）
  const s = { board, hands: E.emptyHands(), turn: 'sente' };
  // 香(0,0)は(1,0)が空なら下方向に利く → (6,0)の歩を(5,0)へ出すと香に取られる
  let risky = false;
  for (let i = 0; i < 20; i++) {
    const m = CPU.chooseMove(s, 'normal');
    if (m.from && m.from[0] === 6 && m.from[1] === 0) { risky = true; break; }
  }
  check('ふつうCPUはタダで取られる歩突きを避ける', risky === false);
}

console.log('--- やさしい/共通: 必ず合法手を返す ---');
{
  const s = E.initialState();
  const legal = E.legalMoves(s);
  const e = CPU.chooseMove(s, 'easy');
  const n = CPU.chooseMove(s, 'normal');
  const inLegal = (mv) => legal.some((x) => E.movesEqual(x, mv));
  check('easy は合法手を返す', inLegal(e));
  check('normal は合法手を返す', inLegal(n));
}

console.log('--- 王手されたら必ず受ける（合法手のみ） ---');
{
  // 後手番。後手玉(0,4)が先手飛車(4,4)に王手されている。
  const board = E.emptyBoard();
  board[0][4] = piece('K', 'gote');
  board[4][4] = piece('R', 'sente');
  board[8][0] = piece('K', 'sente');
  const s = { board, hands: E.emptyHands(), turn: 'gote' };
  const m = CPU.chooseMove(s, 'normal');
  const after = E.applyMove(s, m);
  check('受けた後は自玉が王手されていない', E.isInCheck(after.board, 'gote') === false);
}

console.log('');
console.log(`結果: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
