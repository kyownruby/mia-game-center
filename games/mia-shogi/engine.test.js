'use strict';

/* ミア将棋ルールエンジンの動作検証（Node 実行用） */
/*   実行: node games/mia-shogi/engine.test.js                 */

const E = require('./engine.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
}

function piece(type, owner, promoted = false) { return { type, owner, promoted }; }
function place(board, r, c, p) { board[r][c] = p; }

console.log('--- 初期局面 ---');
{
  const s = E.initialState();
  const moves = E.legalMoves(s);
  check('初期局面の合法手は30手', moves.length === 30);
  check('開始時は王手ではない', E.isInCheck(s.board, 'sente') === false && E.isInCheck(s.board, 'gote') === false);
  check('開始時は詰みではない', E.isCheckmate(s) === false);
  const promoMoves = moves.filter((m) => m.promote);
  check('初期局面に成り手は無い', promoMoves.length === 0);
}

console.log('--- 二歩 ---');
{
  const board = E.emptyBoard();
  place(board, 8, 4, piece('K', 'sente'));
  place(board, 0, 4, piece('K', 'gote'));
  place(board, 5, 2, piece('P', 'sente'));      // 3筋(col2)に先手の歩
  const s = { board, hands: { sente: { P: 1 }, gote: {} }, turn: 'sente' };
  const drops = E.legalMoves(s).filter((m) => m.drop === 'P');
  const sameColAsPawn = drops.some((m) => m.to[1] === 2);
  check('歩のある筋(col2)には歩を打てない（二歩）', sameColAsPawn === false);
  const otherCol = drops.some((m) => m.to[1] === 3);
  check('別の筋には歩を打てる', otherCol === true);
}

console.log('--- 行き所のない駒 / 強制成り ---');
{
  // 最上段(row0)へ進む先手の歩 → 強制成り
  const board = E.emptyBoard();
  place(board, 8, 4, piece('K', 'sente'));
  place(board, 0, 8, piece('K', 'gote'));
  place(board, 1, 0, piece('P', 'sente'));
  const s = { board, hands: { sente: {}, gote: {} }, turn: 'sente' };
  const pawnMoves = E.legalMoves(s).filter((m) => m.from && m.from[0] === 1 && m.from[1] === 0);
  check('最上段へ進む歩は成り手のみ', pawnMoves.length === 1 && pawnMoves[0].promote === true);

  // 持ち駒の歩は最上段(row0)に打てない
  const s2 = { board: (() => { const b = E.emptyBoard(); place(b, 8, 4, piece('K', 'sente')); place(b, 0, 8, piece('K', 'gote')); return b; })(),
    hands: { sente: { P: 1 }, gote: {} }, turn: 'sente' };
  const dropRow0 = E.legalMoves(s2).some((m) => m.drop === 'P' && m.to[0] === 0);
  check('歩は最上段(row0)に打てない', dropRow0 === false);
}

console.log('--- 頭金の詰み ---');
{
  const board = E.emptyBoard();
  place(board, 0, 4, piece('K', 'gote'));       // 後手玉
  place(board, 1, 4, piece('G', 'sente'));      // 頭金
  place(board, 2, 4, piece('L', 'sente'));      // 金を支える香
  place(board, 8, 0, piece('K', 'sente'));
  const s = { board, hands: E.emptyHands(), turn: 'gote' };
  check('後手玉は王手されている', E.isInCheck(s.board, 'gote') === true);
  check('頭金は詰み', E.isCheckmate(s) === true);
}

console.log('--- 打ち歩詰め ---');
{
  // 後手玉(0,4)。両脇(0,3)(0,5)は後手の香で塞がる（玉は動けず、香で歩は取れない）。
  // (1,3)(1,5)を先手の金で押さえ、(1,4)も金が利く。ここに歩を打つと詰み＝反則。
  const board = E.emptyBoard();
  place(board, 0, 4, piece('K', 'gote'));
  place(board, 0, 3, piece('L', 'gote'));
  place(board, 0, 5, piece('L', 'gote'));
  place(board, 2, 3, piece('G', 'sente'));
  place(board, 2, 5, piece('G', 'sente'));
  place(board, 8, 8, piece('K', 'sente'));
  const s = { board, hands: { sente: { P: 1 }, gote: {} }, turn: 'sente' };

  const dropAt14 = { from: null, to: [1, 4], drop: 'P', promote: false };
  // 参考: uchifuzume を無視すれば「歩打ち(1,4)で詰み」が成立しているはず
  const afterDrop = E.applyMove(s, dropAt14);
  check('歩打ち(1,4)は本来詰みの形', E.isCheckmate(afterDrop) === true);

  const legalWith = E.legalMoves(s, { uchifuzume: true });
  const legalWithout = E.legalMoves(s, { uchifuzume: false });
  const inWith = legalWith.some((m) => E.movesEqual(m, dropAt14));
  const inWithout = legalWithout.some((m) => E.movesEqual(m, dropAt14));
  check('打ち歩詰めは合法手から除外される', inWith === false);
  check('（uchifuzume無効なら歩打ちは候補に含まれる＝除外理由が打ち歩詰めである）', inWithout === true);
}

console.log('--- 王手放置の禁止 ---');
{
  // 後手の飛車(0,4)が先手玉(4,4)を直射。間の駒を動かすと自玉が王手 → 不可
  const board = E.emptyBoard();
  place(board, 4, 4, piece('K', 'sente'));
  place(board, 0, 4, piece('R', 'gote'));
  place(board, 2, 4, piece('G', 'sente'));      // 合い駒（これを横に動かすと王手放置）
  place(board, 8, 0, piece('K', 'gote'));
  const s = { board, hands: E.emptyHands(), turn: 'sente' };
  const goldSideways = E.legalMoves(s).some((m) => m.from && m.from[0] === 2 && m.from[1] === 4 && m.to[1] !== 4);
  check('ピンされた金を横に動かす手は非合法', goldSideways === false);
  const goldStraight = E.legalMoves(s).some((m) => m.from && m.from[0] === 2 && m.from[1] === 4 && m.to[1] === 4);
  check('縦（筋を外さない）move は合法', goldStraight === true);
}

console.log('--- 駒取り→持ち駒（成り駒は素の駒で持つ） ---');
{
  const board = E.emptyBoard();
  place(board, 8, 4, piece('K', 'sente'));
  place(board, 0, 4, piece('K', 'gote'));
  place(board, 5, 5, piece('R', 'sente'));
  place(board, 3, 5, piece('P', 'gote', true)); // と金（成った歩）
  const s = { board, hands: E.emptyHands(), turn: 'sente' };
  const cap = { from: [5, 5], to: [3, 5], drop: null, promote: false };
  const ns = E.applyMove(s, cap);
  check('と金を取ると持ち駒は歩(P)に戻る', ns.hands.sente.P === 1);
}

console.log('');
console.log(`結果: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
