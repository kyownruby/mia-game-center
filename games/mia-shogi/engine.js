'use strict';

/* ============================================================
   ミア将棋 — ルールエンジン（engine.js）
   DOM に一切触らない純粋なロジック。ブラウザでは window.ShogiEngine、
   Node では module.exports として読み込める（テスト用）。

   盤表現: board[row][col]  row0=上(後手/gote), row8=下(先手/sente)
   駒:      null | { type, owner:'sente'|'gote', promoted:bool }
   type:    'P'歩 'L'香 'N'桂 'S'銀 'G'金 'B'角 'R'飛 'K'玉
   手番:    state.turn = 'sente' | 'gote'
   持ち駒:  state.hands = { sente:{P:0,...}, gote:{...} }
   ============================================================ */

(function (root) {

  const HAND_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

  // 先手視点（前 = 上 = row が減る方向）のベクトル
  const STEP = {
    K: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
    G: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]],
    S: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]],
    N: [[-2, -1], [-2, 1]],
    P: [[-1, 0]],
  };
  const SLIDE = {
    R: [[-1, 0], [1, 0], [0, -1], [0, 1]],
    B: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    L: [[-1, 0]],
  };
  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  const inBoard = (r, c) => r >= 0 && r < 9 && c >= 0 && c < 9;
  const opponentOf = (owner) => (owner === 'sente' ? 'gote' : 'sente');

  /* 駒種・成り状態から（先手視点の）移動ベクトルを返す */
  function vectorsFor(piece) {
    const { type, promoted } = piece;
    if (promoted) {
      if (type === 'P' || type === 'L' || type === 'N' || type === 'S') {
        return { steps: STEP.G, slides: [] };
      }
      if (type === 'B') return { steps: ORTHO, slides: SLIDE.B };   // 馬
      if (type === 'R') return { steps: DIAG, slides: SLIDE.R };    // 龍
    }
    if (type === 'K') return { steps: STEP.K, slides: [] };
    if (type === 'G') return { steps: STEP.G, slides: [] };
    if (type === 'S') return { steps: STEP.S, slides: [] };
    if (type === 'N') return { steps: STEP.N, slides: [] };
    if (type === 'P') return { steps: STEP.P, slides: [] };
    if (type === 'R') return { steps: [], slides: SLIDE.R };
    if (type === 'B') return { steps: [], slides: SLIDE.B };
    if (type === 'L') return { steps: [], slides: SLIDE.L };
    return { steps: [], slides: [] };
  }

  /* 持ち主の向きに合わせてベクトルの row 符号を反転（後手は前＝下） */
  function orientedVectors(piece) {
    const { steps, slides } = vectorsFor(piece);
    const sign = piece.owner === 'sente' ? 1 : -1;
    return {
      steps: steps.map(([dr, dc]) => [dr * sign, dc]),
      slides: slides.map(([dr, dc]) => [dr * sign, dc]),
    };
  }

  function inPromoZone(owner, row) {
    return owner === 'sente' ? row <= 2 : row >= 6;
  }

  function isPromotable(piece) {
    return !piece.promoted && piece.type !== 'G' && piece.type !== 'K';
  }

  /* その駒が tr に着地すると以後動けない（＝強制成り）か */
  function mustPromoteAtRow(piece, tr) {
    if (piece.promoted) return false;
    const o = piece.owner;
    if (piece.type === 'P' || piece.type === 'L') {
      return o === 'sente' ? tr === 0 : tr === 8;
    }
    if (piece.type === 'N') {
      return o === 'sente' ? tr <= 1 : tr >= 7;
    }
    return false;
  }

  /* 打てる段か（行き所のない駒の禁止） */
  function canDropAtRow(type, owner, row) {
    if (type === 'P' || type === 'L') return owner === 'sente' ? row >= 1 : row <= 7;
    if (type === 'N') return owner === 'sente' ? row >= 2 : row <= 6;
    return true;
  }

  function hasUnpromotedPawn(board, owner, col) {
    for (let r = 0; r < 9; r++) {
      const p = board[r][col];
      if (p && p.owner === owner && p.type === 'P' && !p.promoted) return true;
    }
    return false;
  }

  function findKing(board, owner) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (p && p.owner === owner && p.type === 'K') return [r, c];
      }
    }
    return null;
  }

  /* (tr,tc) が byOwner の駒に利いているか */
  function isAttacked(board, tr, tc, byOwner) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (!p || p.owner !== byOwner) continue;
        const { steps, slides } = orientedVectors(p);
        for (const [dr, dc] of steps) {
          if (r + dr === tr && c + dc === tc) return true;
        }
        for (const [dr, dc] of slides) {
          let nr = r + dr, nc = c + dc;
          while (inBoard(nr, nc)) {
            if (nr === tr && nc === tc) return true;
            if (board[nr][nc]) break;
            nr += dr; nc += dc;
          }
        }
      }
    }
    return false;
  }

  function isInCheck(board, owner) {
    const k = findKing(board, owner);
    if (!k) return false;
    return isAttacked(board, k[0], k[1], opponentOf(owner));
  }

  /* ---- 局面操作 ---- */
  function cloneState(s) {
    return {
      board: s.board.map((row) => row.map((p) => (p ? { type: p.type, owner: p.owner, promoted: p.promoted } : null))),
      hands: { sente: Object.assign({}, s.hands.sente), gote: Object.assign({}, s.hands.gote) },
      turn: s.turn,
    };
  }

  function applyMove(state, move) {
    const s = cloneState(state);
    const owner = state.turn;
    if (move.drop) {
      s.hands[owner][move.drop] = (s.hands[owner][move.drop] || 0) - 1;
      s.board[move.to[0]][move.to[1]] = { type: move.drop, owner, promoted: false };
    } else {
      const [fr, fc] = move.from;
      const [tr, tc] = move.to;
      const piece = s.board[fr][fc];
      const captured = s.board[tr][tc];
      if (captured) {
        s.hands[owner][captured.type] = (s.hands[owner][captured.type] || 0) + 1;
      }
      s.board[fr][fc] = null;
      s.board[tr][tc] = { type: piece.type, owner, promoted: piece.promoted || !!move.promote };
    }
    s.turn = opponentOf(owner);
    return s;
  }

  /* ---- 指し手生成 ---- */
  function pushBoardMove(piece, fr, fc, tr, tc, out) {
    const canPromote = isPromotable(piece) && (inPromoZone(piece.owner, fr) || inPromoZone(piece.owner, tr));
    if (mustPromoteAtRow(piece, tr)) {
      out.push({ from: [fr, fc], to: [tr, tc], drop: null, promote: true });
      return;
    }
    out.push({ from: [fr, fc], to: [tr, tc], drop: null, promote: false });
    if (canPromote) out.push({ from: [fr, fc], to: [tr, tc], drop: null, promote: true });
  }

  function pseudoMoves(state) {
    const { board, hands, turn } = state;
    const out = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (!p || p.owner !== turn) continue;
        const { steps, slides } = orientedVectors(p);
        for (const [dr, dc] of steps) {
          const nr = r + dr, nc = c + dc;
          if (!inBoard(nr, nc)) continue;
          const t = board[nr][nc];
          if (t && t.owner === turn) continue;
          pushBoardMove(p, r, c, nr, nc, out);
        }
        for (const [dr, dc] of slides) {
          let nr = r + dr, nc = c + dc;
          while (inBoard(nr, nc)) {
            const t = board[nr][nc];
            if (t && t.owner === turn) break;
            pushBoardMove(p, r, c, nr, nc, out);
            if (t) break;
            nr += dr; nc += dc;
          }
        }
      }
    }
    // 打ち込み
    for (const type of HAND_ORDER) {
      if (!hands[turn][type]) continue;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c]) continue;
          if (!canDropAtRow(type, turn, r)) continue;
          if (type === 'P' && hasUnpromotedPawn(board, turn, c)) continue; // 二歩
          out.push({ from: null, to: [r, c], drop: type, promote: false });
        }
      }
    }
    return out;
  }

  function kingSafe(state, move) {
    const ns = applyMove(state, move);
    return !isInCheck(ns.board, state.turn);
  }

  /* 打ち歩詰め判定（歩を打って相手が即詰みになるなら反則） */
  function isUchifuzume(state, move) {
    const ns = applyMove(state, move);             // ns.turn = 相手
    if (!isInCheck(ns.board, ns.turn)) return false;
    return legalMoves(ns, { uchifuzume: false }).length === 0;
  }

  function legalMoves(state, opts) {
    const uchifuzume = !opts || opts.uchifuzume !== false;
    return pseudoMoves(state).filter((m) => {
      if (!kingSafe(state, m)) return false;
      if (uchifuzume && m.drop === 'P' && isUchifuzume(state, m)) return false;
      return true;
    });
  }

  function isCheckmate(state) {
    return isInCheck(state.board, state.turn) && legalMoves(state, { uchifuzume: false }).length === 0;
  }

  /* ---- 初期局面 ---- */
  function emptyBoard() {
    return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null));
  }

  function emptyHands() {
    const h = () => ({ R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 });
    return { sente: h(), gote: h() };
  }

  function initialState() {
    const board = emptyBoard();
    const back = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'];
    back.forEach((t, c) => { board[0][c] = { type: t, owner: 'gote', promoted: false }; });
    board[1][1] = { type: 'R', owner: 'gote', promoted: false };
    board[1][7] = { type: 'B', owner: 'gote', promoted: false };
    for (let c = 0; c < 9; c++) board[2][c] = { type: 'P', owner: 'gote', promoted: false };
    for (let c = 0; c < 9; c++) board[6][c] = { type: 'P', owner: 'sente', promoted: false };
    board[7][1] = { type: 'B', owner: 'sente', promoted: false };
    board[7][7] = { type: 'R', owner: 'sente', promoted: false };
    back.forEach((t, c) => { board[8][c] = { type: t, owner: 'sente', promoted: false }; });
    return { board, hands: emptyHands(), turn: 'sente' };
  }

  function movesEqual(a, b) {
    if (!a || !b) return false;
    if (a.drop !== b.drop) return false;
    if (!!a.promote !== !!b.promote) return false;
    const samePos = (x, y) => (x === null && y === null) || (x && y && x[0] === y[0] && x[1] === y[1]);
    return samePos(a.from, b.from) && samePos(a.to, b.to);
  }

  const ShogiEngine = {
    HAND_ORDER,
    inBoard,
    opponentOf,
    inPromoZone,
    isPromotable,
    canDropAtRow,
    hasUnpromotedPawn,
    findKing,
    isAttacked,
    isInCheck,
    cloneState,
    applyMove,
    pseudoMoves,
    legalMoves,
    isCheckmate,
    initialState,
    emptyBoard,
    emptyHands,
    movesEqual,
  };

  root.ShogiEngine = ShogiEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = ShogiEngine;

})(typeof globalThis !== 'undefined' ? globalThis : this);
