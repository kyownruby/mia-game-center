'use strict';

/* ============================================================
   ミア将棋 — AI連携（ai.js）／各自APIキー方式
   ・ブラウザから Claude API を直接呼ぶ（ユーザー自身のキー）
   ・AIには必ず「合法手リスト＋index」を渡し、返ってきた moveIndex を
     JS側で範囲検証する（反則ゼロ・仕様§6準拠）
   ・キー無し/通信失敗/不正レスポンスは null を返し、呼び出し側が
     JS CPU(ShogiCPU)へフォールバックする
   ・純粋関数（パース/検証/プロンプト生成）は Node でテスト可能
   ブラウザは window.ShogiAI、Node は module.exports。
   ============================================================ */

(function (root) {
  const API_URL = 'https://api.anthropic.com/v1/messages';
  const ANTHROPIC_VERSION = '2023-06-01';
  const AI_MODEL = 'claude-haiku-4-5';
  const KEY_STORAGE = 'shogi:apiKey';

  const PIECE_KANJI = { P: '歩', L: '香', N: '桂', S: '銀', G: '金', B: '角', R: '飛', K: '玉' };
  const PROMOTED_KANJI = { P: 'と', L: '杏', N: '圭', S: '全', B: '馬', R: '龍' };

  /* ---------------- APIキー管理（ブラウザのみ） ---------------- */
  function getKey() {
    if (typeof Storage === 'undefined') return null;
    return Storage.get(KEY_STORAGE, null);
  }
  function setKey(value) {
    if (typeof Storage === 'undefined') return;
    Storage.set(KEY_STORAGE, value);
  }
  function clearKey() {
    if (typeof Storage === 'undefined') return;
    Storage.remove(KEY_STORAGE);
  }
  function hasKey() {
    const k = getKey();
    return typeof k === 'string' && k.trim().length > 0;
  }

  /* ---------------- 純粋関数：パース・検証 ---------------- */
  function stripJsonFences(text) {
    if (!text) return '';
    let t = String(text).trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    return t.trim();
  }

  function parseAiJson(text) {
    const t = stripJsonFences(text);
    try {
      return JSON.parse(t);
    } catch (_) {
      const m = t.match(/\{[\s\S]*\}/);
      if (m) {
        try { return JSON.parse(m[0]); } catch (__) { /* noop */ }
      }
      return null;
    }
  }

  /* moveIndex を 0..legalCount-1 に検証。OKなら整数、NGなら -1 */
  function validMoveIndex(obj, legalCount) {
    if (!obj || typeof obj.moveIndex !== 'number' || !isFinite(obj.moveIndex)) return -1;
    const i = Math.floor(obj.moveIndex);
    if (i < 0 || i >= legalCount) return -1;
    return i;
  }

  /* ---------------- 純粋関数：盤・手の文章化 ---------------- */
  function glyphAt(piece) {
    if (!piece) return '・';
    return piece.promoted ? (PROMOTED_KANJI[piece.type] || PIECE_KANJI[piece.type]) : PIECE_KANJI[piece.type];
  }

  function describeBoard(state) {
    const rows = [];
    for (let r = 0; r < 9; r++) {
      const cells = [];
      for (let c = 0; c < 9; c++) {
        const p = state.board[r][c];
        cells.push(p ? (p.owner === 'sente' ? '▲' : '△') + glyphAt(p) : '・・');
      }
      rows.push(`行${r}: ` + cells.join(' '));
    }
    return rows.join('\n');
  }

  function describeHand(hand) {
    const order = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
    const parts = order.filter((t) => hand && hand[t] > 0).map((t) => `${PIECE_KANJI[t]}×${hand[t]}`);
    return parts.length ? parts.join(' ') : 'なし';
  }

  function describeMove(state, m) {
    if (m.drop) {
      return `持ち駒の${PIECE_KANJI[m.drop]}を(${m.to[0]},${m.to[1]})に打つ`;
    }
    const p = state.board[m.from[0]][m.from[1]];
    const name = glyphAt(p);
    return `${name}(${m.from[0]},${m.from[1]})→(${m.to[0]},${m.to[1]})${m.promote ? ' 成' : ''}`;
  }

  function movesList(state, legalMoves) {
    return legalMoves.map((m, i) => `${i}: ${describeMove(state, m)}`).join('\n');
  }

  /* 盤面＋手番＋両者の持ち駒から、局面を一意に表す文字列キーを作る */
  function positionKey(state) {
    const b = state.board.map((row) =>
      row.map((p) => {
        if (!p) return '..';
        const side = p.owner === 'sente' ? 's' : 'g';
        const prom = p.promoted ? '+' : '';
        return side + prom + p.type;
      }).join('')
    ).join('/');
    const hand = (h) => ['R', 'B', 'G', 'S', 'N', 'L', 'P'].map((t) => (h && h[t]) || 0).join(',');
    return `${state.turn}|${b}|S:${hand(state.hands.sente)}|G:${hand(state.hands.gote)}`;
  }

  /* ---------------- 純粋関数：プロンプト生成 ---------------- */
  function buildMovePrompt(state, legalMoves, opts) {
    const o = opts || {};
    const owner = state.turn === 'sente' ? '先手(▲/下側)' : '後手(△/上側)';
    const lines = [
      `あなたは将棋の対戦相手「${o.opponentName || 'あいて'}」です。口調・性格: ${o.tone || '自然な口調'}`,
      `あなたは${owner}。難易度: ${o.difficulty === 'easy' ? 'やさしい（甘い手も指してよい）' : 'ふつう（駒得・王手・詰みを意識）'}`,
      '盤面（▲=先手 △=後手、行0=上 行8=下）:',
      describeBoard(state),
      `あなたの持ち駒: ${describeHand(state.hands[state.turn])}`,
    ];

    // 直近の手の履歴（あれば渡す）
    if (o.recentMoves && o.recentMoves.length) {
      lines.push('', 'これまでの直近の手（古い→新しい）:', o.recentMoves.join('\n'));
    }

    lines.push(
      '',
      'あなたが指せる合法手リスト（この中から必ず1つだけ選ぶ）:',
      movesList(state, legalMoves),
      '',
      '【重要な方針】',
      '・同じ局面を繰り返す手（直前に動かした駒をすぐ元へ戻す等）は選ばない。対局を前進させること。',
      '・駒得・玉の安全・攻めの形作りを意識し、戦略的に意味のある手を選ぶ。',
      '',
      '次のJSON形式のみで返答してください。前置きやMarkdownのコードブロックは不要です。',
      `{"moveIndex": <選んだ合法手の番号(0〜${legalMoves.length - 1})>, "comment": "<あなたの口調での短い一言>"}`
    );
    return lines.join('\n');
  }

  function buildAssistPrompt(state, legalMoves, opts) {
    const o = opts || {};
    const lines = [
      `あなたは将棋のアドバイザー「${o.selfName || 'アドバイザー'}」です。口調・性格: ${o.tone || '自然な口調'}`,
      `プレイヤー(先手▲/下側)を応援しながら、戦法「${o.strategyName || '自由'}」（囲い: ${o.castle || '自由'}）に沿った一手を勧めます。`,
      '盤面（▲=先手 △=後手、行0=上 行8=下）:',
      describeBoard(state),
      `先手の持ち駒: ${describeHand(state.hands.sente)}`,
    ];

    // 直近の手の履歴（あれば渡す）
    if (o.recentMoves && o.recentMoves.length) {
      lines.push('', 'これまでの直近の手（古い→新しい）:', o.recentMoves.join('\n'));
    }

    lines.push(
      '',
      'プレイヤーが指せる合法手リスト（この中から1つ推奨する）:',
      movesList(state, legalMoves),
      '',
      '【重要な方針】同じ局面を繰り返す手は勧めない。戦法の方針に沿って対局を前進させる手を選ぶ。',
      '',
      '次のJSON形式のみで返答してください。前置きやMarkdownのコードブロックは不要です。',
      'reasonは必ず30文字以内・1文で、あなたの口調のまま簡潔に。',
      `{"moveIndex": <推奨する合法手の番号(0〜${legalMoves.length - 1})>, "reason": "<30文字以内の一言アドバイス>"}`
    );
    return lines.join('\n');
  }

  /* ---------------- 通信（ブラウザ） ---------------- */
  async function callClaude(apiKey, prompt, maxTokens) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: maxTokens || 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error('Claude API error: ' + res.status);
    const data = await res.json();
    return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }

  /* CPUの一手をAIに選ばせる。成功で{moveIndex,comment}、失敗でnull */
  async function chooseMove(state, legalMoves, opts) {
    const key = getKey();
    if (!key || !legalMoves.length) return null;
    try {
      const text = await callClaude(key, buildMovePrompt(state, legalMoves, opts), 1000);
      const obj = parseAiJson(text);
      const idx = validMoveIndex(obj, legalMoves.length);
      if (idx < 0) return null;
      return { moveIndex: idx, comment: (obj && typeof obj.comment === 'string') ? obj.comment : '' };
    } catch (e) {
      console.warn('AI chooseMove failed, fallback to JS CPU:', e.message);
      return null;
    }
  }

  /* アシストの推奨手。成功で{moveIndex,reason}、失敗でnull */
  async function suggestMove(state, legalMoves, opts) {
    const key = getKey();
    if (!key || !legalMoves.length) return null;
    try {
      const text = await callClaude(key, buildAssistPrompt(state, legalMoves, opts), 1000);
      const obj = parseAiJson(text);
      const idx = validMoveIndex(obj, legalMoves.length);
      if (idx < 0) return null;
      return { moveIndex: idx, reason: (obj && typeof obj.reason === 'string') ? obj.reason : '' };
    } catch (e) {
      console.warn('AI suggestMove failed:', e.message);
      return null;
    }
  }

  const ShogiAI = {
    AI_MODEL,
    getKey, setKey, clearKey, hasKey,
    stripJsonFences, parseAiJson, validMoveIndex,
    describeBoard, describeHand, describeMove, movesList,
    positionKey,
    buildMovePrompt, buildAssistPrompt,
    callClaude, chooseMove, suggestMove,
  };

  root.ShogiAI = ShogiAI;
  if (typeof module !== 'undefined' && module.exports) module.exports = ShogiAI;

})(typeof globalThis !== 'undefined' ? globalThis : this);
