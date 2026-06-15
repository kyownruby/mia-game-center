'use strict';

/* ============================================================
   ミア将棋 — 簡易CPU（cpu.js）
   ShogiEngine が出した合法手の中から1手を選ぶだけ。ルール判断はしない。
   difficulty:
     'easy'   … ほぼランダム（たまに取れる駒を取る）＝甘い手も指す
     'normal' … 駒得・タダ取り回避・王手/詰み狙いの簡易1手読み
   ブラウザは window.ShogiCPU、Node は module.exports。
   ============================================================ */

(function (root) {
  const E = (typeof require !== 'undefined') ? require('./engine.js') : root.ShogiEngine;

  // 駒の価値（素の駒）
  const VAL = { P: 1, L: 3, N: 4, S: 5, G: 6, B: 8, R: 10, K: 1000 };
  // 成り駒の価値
  const PROMO_VAL = { P: 7, L: 6, N: 6, S: 6, B: 12, R: 13 };

  function pieceValue(p) {
    if (!p) return 0;
    if (p.promoted && PROMO_VAL[p.type] != null) return PROMO_VAL[p.type];
    return VAL[p.type] || 0;
  }

  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function isCapture(state, m) {
    return m.from && state.board[m.to[0]][m.to[1]];
  }

  function chooseEasy(moves, state) {
    const caps = moves.filter((m) => isCapture(state, m));
    if (caps.length && Math.random() < 0.45) return rand(caps);
    return rand(moves);
  }

  function chooseNormal(moves, state) {
    const me = state.turn;
    const opp = E.opponentOf(me);
    let best = null;
    let bestScore = -Infinity;

    for (const m of moves) {
      const capVal = isCapture(state, m) ? pieceValue(state.board[m.to[0]][m.to[1]]) : 0;
      const ns = E.applyMove(state, m);

      // 着地した自駒が相手に取られそうか（取り返しのリスク）
      let risk = 0;
      if (E.isAttacked(ns.board, m.to[0], m.to[1], opp)) {
        risk = pieceValue(ns.board[m.to[0]][m.to[1]]);
      }

      let score = capVal - risk * 0.9;
      if (m.promote) score += 2;

      if (E.isInCheck(ns.board, opp)) {
        score += 1;
        if (E.legalMoves(ns).length === 0) score += 1000; // 詰み
      }

      score += Math.random() * 0.3; // 同点はばらけさせる
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  function chooseMove(state, difficulty, presetMoves) {
    const moves = presetMoves && presetMoves.length ? presetMoves : E.legalMoves(state);
    if (!moves.length) return null;
    if (difficulty === 'easy') return chooseEasy(moves, state);
    return chooseNormal(moves, state);
  }

  const ShogiCPU = { chooseMove, pieceValue, VAL, PROMO_VAL };

  root.ShogiCPU = ShogiCPU;
  if (typeof module !== 'undefined' && module.exports) module.exports = ShogiCPU;

})(typeof globalThis !== 'undefined' ? globalThis : this);
