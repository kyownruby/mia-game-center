'use strict';

/* ============================================================
   ミア将棋 — Phase 2
   ・対局準備画面（自キャラ / 相手キャラ / 戦法 / 難易度 / アシスト）
   ・engine.js（ShogiEngine）と連携して実際に駒を動かせる
   ・成り確認 / 持ち駒打ち / 王手・詰み / セーブ・再開（ふたり指し）
   ※ CPU/AI 思考は Phase 3 以降。ここでは両手番を手動操作して検証できる。
   ============================================================ */

const ROOT = '../../';
const SAVE_KEY = 'shogi:save';

/* 相手として選べるキャラ（自キャラは実行時に除外） */
const OPPONENTS = ['mia', 'kyown', 'rain', 'shiori'];

const PIECE_KANJI = {
  P: '歩', L: '香', N: '桂', S: '銀', G: '金', B: '角', R: '飛', K: '玉',
};
const PROMOTED_KANJI = {
  P: 'と', L: '杏', N: '圭', S: '全', B: '馬', R: '龍',
};
const HAND_KANJI = { R: '飛', B: '角', G: '金', S: '銀', N: '桂', L: '香', P: '歩' };

function glyph(piece) {
  if (!piece) return '';
  return piece.promoted ? PROMOTED_KANJI[piece.type] : PIECE_KANJI[piece.type];
}

/* ---------------- 状態 ---------------- */
const setup = {
  selfId: 'mia',
  opponentId: null,
  strategyId: null,
  mode: 'cpu',          // 'cpu' = JS CPU / 'ai' = Claude AI（要APIキー）
  assist: true,
};

/* CPU/AIどちらでも内部的に使う強さ（難易度UIは廃止し固定） */
const CPU_LEVEL = 'normal';

let game = null;            // ShogiEngine の局面 { board, hands, turn }
let legalCache = [];        // 現在手番の合法手
let selection = null;       // { kind:'board', r, c } | { kind:'hand', type }
let pendingPromotion = null;// { plain, promote } 成り確認待ち
let gameOver = false;
let cpuThinking = false;    // CPU思考中は人間の操作をブロック
let hintLoading = false;    // アシスト取得中
let hintMove = null;        // AIが推奨した手（盤上ハイライト用）
let aiComment = null;       // 直近のCPUの手に対するAIコメント（commitMoveで表示）
let moveHistory = [];       // 棋譜（人間が読める文字列の配列・直近のみ保持）
let positionCounts = {};    // 局面キー → 出現回数（千日手検出用）

const RECORD_KEY = 'shogi:record';

const charCache = {};
let selfChar = null;
let oppChar = null;

/* 先手＝あなた / 後手＝相手キャラ */
function ownerLabel(owner) {
  if (owner === 'sente') return 'あなた';
  return oppChar ? oppChar.displayName : '相手';
}

/* ---------------- キャラ / メッセージ ---------------- */
/* 自分側・相手側で別々のメッセージ窓を持てるようにファクトリ化 */
function createMessageWindow(winId, txtId) {
  return {
    winId, txtId,
    el: null, textEl: null, hideTimer: null, typingTimer: null, isTyping: false, fullText: '',
    init() {
      this.el = document.getElementById(this.winId);
      this.textEl = document.getElementById(this.txtId);
      if (this.el) this.el.addEventListener('click', () => this.skip());
    },
    show(text) {
      if (!text || !this.el) return;
      this.cancel();
      this.fullText = text;
      this.textEl.textContent = '';
      this.el.classList.add('is-visible');
      let i = 0;
      this.isTyping = true;
      this.typingTimer = setInterval(() => {
        this.textEl.textContent += this.fullText[i++];
        if (i >= this.fullText.length) { clearInterval(this.typingTimer); this.typingTimer = null; this.isTyping = false; this.scheduleHide(); }
      }, 50);
    },
    skip() {
      if (!this.isTyping) return;
      clearInterval(this.typingTimer); this.typingTimer = null;
      this.textEl.textContent = this.fullText; this.isTyping = false; this.scheduleHide();
    },
    scheduleHide() { this.hideTimer = setTimeout(() => this.el.classList.remove('is-visible'), 4000); },
    cancel() {
      if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
      if (this.typingTimer) { clearInterval(this.typingTimer); this.typingTimer = null; }
      this.isTyping = false;
    },
  };
}

const messageWindow = createMessageWindow('message-window', 'message-text');   // 自分（アドバイザー）
const oppMsg = createMessageWindow('opp-message-window', 'opp-message-text');   // 相手

function applyImage(imgEl, fbEl, src) {
  if (!imgEl) return;
  fbEl.hidden = true;
  imgEl.onload = () => { imgEl.hidden = false; fbEl.hidden = true; scheduleFitGame(); };
  imgEl.onerror = () => { imgEl.hidden = true; fbEl.hidden = false; scheduleFitGame(); };
  imgEl.src = src;
}

/* ---------------- 準備画面 ---------------- */
function renderSelfCard() {
  if (!selfChar) return;
  document.getElementById('self-name').textContent = selfChar.displayName;
  document.querySelector('.self-card__icon').style.background = selfChar.theme.primaryColor;
  applyImage(
    document.getElementById('self-img'),
    document.getElementById('self-fallback'),
    ROOT + selfChar.image.avatar
  );
  document.getElementById('self-fallback').textContent = selfChar.emoji || '🐈';
}

function renderOpponentOptions() {
  const grid = document.getElementById('opponent-grid');
  grid.innerHTML = '';
  OPPONENTS.filter((id) => id !== setup.selfId).forEach((id) => {
    const ch = charCache[id];
    if (!ch) return;
    const btn = document.createElement('button');
    btn.className = 'opp-card';
    btn.dataset.opponent = id;
    if (id === setup.opponentId) btn.classList.add('is-selected');

    const icon = document.createElement('span');
    icon.className = 'opp-card__icon';
    icon.style.background = ch.theme.primaryColor;
    const img = document.createElement('img');
    img.alt = '';
    img.hidden = true;
    const fb = document.createElement('span');
    fb.textContent = ch.emoji || '🐈';
    icon.append(img, fb);
    applyImage(img, fb, ROOT + ch.image.avatar);

    const name = document.createElement('span');
    name.className = 'opp-card__name';
    name.textContent = ch.displayName;

    btn.append(icon, name);
    btn.addEventListener('click', () => {
      setup.opponentId = id;
      renderOpponentOptions();
      updateStartButton();
    });
    grid.appendChild(btn);
  });
}

function renderStrategyOptions() {
  const wrap = document.getElementById('strategy-list');
  wrap.innerHTML = '';
  STRATEGY_LEVELS.forEach((lv) => {
    const group = document.createElement('div');
    group.className = 'strat-group';

    const heading = document.createElement('div');
    heading.className = 'strat-group__title';
    heading.textContent = lv.label;
    group.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'strat-group__items';
    STRATEGIES.filter((s) => s.level === lv.id).forEach((s) => {
      const btn = document.createElement('button');
      btn.className = 'strat-card';
      btn.dataset.strategy = s.id;
      if (s.id === setup.strategyId) btn.classList.add('is-selected');
      btn.innerHTML =
        `<span class="strat-card__name">${s.name}</span>` +
        `<span class="strat-card__type">${s.type}</span>` +
        `<span class="strat-card__castle">囲い：${s.castle}</span>` +
        `<span class="strat-card__desc">${s.desc}</span>`;
      btn.addEventListener('click', () => {
        setup.strategyId = s.id;
        renderStrategyOptions();
        updateStartButton();
      });
      list.appendChild(btn);
    });
    group.appendChild(list);
    wrap.appendChild(group);
  });
}

function setupModeButtons() {
  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      setup.mode = btn.dataset.mode;
      refreshModeButtons();
    });
  });
  refreshModeButtons();
}

/* モードボタンの選択状態と、AIモードの有効/無効（キー有無）を更新する */
function refreshModeButtons() {
  const aiReady = typeof ShogiAI !== 'undefined' && ShogiAI.hasKey();
  // キーが無いのにAIモードが選ばれていたらCPUへ戻す
  if (setup.mode === 'ai' && !aiReady) setup.mode = 'cpu';

  document.querySelectorAll('[data-mode]').forEach((b) => {
    const isAi = b.dataset.mode === 'ai';
    b.disabled = isAi && !aiReady;
    b.classList.toggle('is-selected', b.dataset.mode === setup.mode && !b.disabled);
  });

  const hint = document.getElementById('mode-hint');
  if (hint) {
    hint.textContent = aiReady
      ? 'AIモード：Claudeが相手をするよ✨ / CPUモード：内蔵のJS CPUと対局🐾'
      : 'AIモードは下の「AI連携」でAPIキーを保存すると選べるよっ🐾';
  }
}

function setupAssistToggle() {
  const toggle = document.getElementById('assist-toggle');
  const sync = () => {
    toggle.classList.toggle('is-on', setup.assist);
    toggle.setAttribute('aria-pressed', String(setup.assist));
    toggle.querySelector('.toggle__label').textContent = setup.assist ? 'ON' : 'OFF';
    syncStrategyVisibility();
  };
  sync();
  toggle.addEventListener('click', () => { setup.assist = !setup.assist; sync(); });
}

/* アシストOFF＝戦法なし（自由対局）。戦法ブロックの表示と開始条件を連動させる */
function syncStrategyVisibility() {
  document.getElementById('strategy-block').hidden = !setup.assist;
  updateStartButton();
}

// アシストONなら戦法が必須、OFFなら相手だけでOK
function isReadyToStart() {
  return setup.assist ? !!(setup.opponentId && setup.strategyId) : !!setup.opponentId;
}

function updateStartButton() {
  const btn = document.getElementById('btn-start');
  const ready = isReadyToStart();
  btn.disabled = !ready;
}

/* ---------------- 盤・持ち駒の描画 ---------------- */
function targetsForSelection() {
  if (!selection) return [];
  if (selection.kind === 'board') {
    return legalCache.filter((m) => m.from && m.from[0] === selection.r && m.from[1] === selection.c);
  }
  return legalCache.filter((m) => m.drop === selection.type);
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  const targets = targetsForSelection();
  const checkSquare = (() => {
    if (gameOver) return null;
    if (!ShogiEngine.isInCheck(game.board, game.turn)) return null;
    return ShogiEngine.findKing(game.board, game.turn);
  })();

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const piece = game.board[r][c];

      if (selection && selection.kind === 'board' && selection.r === r && selection.c === c) {
        cell.classList.add('is-selected');
      }
      const tgt = targets.find((m) => m.to[0] === r && m.to[1] === c);
      if (tgt) cell.classList.add(piece ? 'is-capture' : 'is-target');
      if (checkSquare && checkSquare[0] === r && checkSquare[1] === c) cell.classList.add('is-check');
      if (hintMove) {
        const isFrom = hintMove.from && hintMove.from[0] === r && hintMove.from[1] === c;
        const isTo = hintMove.to[0] === r && hintMove.to[1] === c;
        if (isFrom || isTo) cell.classList.add('is-hint');
      }

      if (piece) {
        const p = document.createElement('span');
        p.className = 'piece' + (piece.owner === 'gote' ? ' is-gote' : '') + (piece.promoted ? ' is-promoted' : '');
        p.textContent = glyph(piece);
        cell.appendChild(p);
      }
      cell.addEventListener('click', () => onCellClick(r, c));
      boardEl.appendChild(cell);
    }
  }
}

function renderHand(owner) {
  const el = document.getElementById(owner === 'sente' ? 'hand-sente' : 'hand-gote');
  el.innerHTML = '';
  const hand = game.hands[owner];
  const items = ShogiEngine.HAND_ORDER.filter((t) => hand[t] > 0);
  if (!items.length) {
    el.innerHTML = '<span class="hand__empty">なし</span>';
    return;
  }
  items.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = 'hand__piece';
    if (!gameOver && game.turn === owner) btn.classList.add('is-selectable');
    if (selection && selection.kind === 'hand' && game.turn === owner && selection.type === t) {
      btn.classList.add('is-selected');
    }
    btn.textContent = HAND_KANJI[t] + (hand[t] > 1 ? hand[t] : '');
    btn.addEventListener('click', () => onHandClick(owner, t));
    el.appendChild(btn);
  });
}

function renderTurn() {
  const el = document.getElementById('turn-indicator');
  if (!el) return;
  if (gameOver) { el.textContent = ''; return; }
  if (cpuThinking) {
    el.textContent = `${ownerLabel('gote')}が考え中…🤔`;
    el.classList.remove('is-check');
    return;
  }
  const inCheck = ShogiEngine.isInCheck(game.board, game.turn);
  el.textContent = `${ownerLabel(game.turn)}の番` + (inCheck ? '（王手！）' : '');
  el.classList.toggle('is-check', inCheck);
}

function renderGameChar() {
  // アドバイザー＝自分の選択キャラ（右側）
  if (selfChar) {
    document.getElementById('self-stage-name').textContent = selfChar.displayName;
    document.getElementById('char-fallback').textContent = selfChar.emoji || '🐈';
    applyImage(
      document.getElementById('char-img'),
      document.getElementById('char-fallback'),
      ROOT + selfChar.image.portrait
    );
  }
  // 相手キャラ（反対側＝左）
  if (oppChar) {
    document.getElementById('opp-name').textContent = oppChar.displayName;
    document.getElementById('opp-fallback').textContent = oppChar.emoji || '🐈';
    applyImage(
      document.getElementById('opp-img'),
      document.getElementById('opp-fallback'),
      ROOT + oppChar.image.portrait
    );
  }
}

function renderAssist() {
  const box = document.getElementById('assist-box');
  const strat = STRATEGIES.find((s) => s.id === setup.strategyId);
  if (!setup.assist) {
    box.innerHTML = '<span class="assist__off">アシストOFF</span>';
    return;
  }
  box.innerHTML = `<div class="assist__title">アシスト：${strat ? strat.name : '自由'} / ${strat ? strat.castle : '自由'}</div>`;
}

function renderAll() {
  renderBoard();
  renderHand('sente');
  renderHand('gote');
  renderTurn();
  scheduleFitGame();
}

/* 対局画面を画面サイズに合わせて丸ごと縮小（ロビーと同方式・拡大はしない） */
let fitRaf = null;
function fitGame() {
  const main = document.querySelector('.game-body');
  const fit = document.getElementById('game-fit');
  if (!main || !fit || main.offsetParent === null) return;
  fit.style.transform = 'none';   // 計測のため一旦等倍へ
  const styles = getComputedStyle(main);
  const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const availH = main.clientHeight - padY;
  const availW = main.clientWidth - padX;
  const needH = fit.offsetHeight;
  const needW = fit.offsetWidth;
  if (needH <= 0 || needW <= 0) return;
  const scale = Math.min(1, availH / needH, availW / needW);
  fit.style.transform = `scale(${scale})`;
}
function scheduleFitGame() {
  if (fitRaf) cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(fitGame);
}

/* ---------------- AIアシスト（自分の番で推奨手を自動表示） ---------------- */
// 着手等で状況が変わったら古い応答を捨てるためのトークン
let hintReqId = 0;

async function maybeAutoHint() {
  hintReqId++;
  if (!setup.assist || gameOver || game.turn !== 'sente') return;
  if (typeof ShogiAI === 'undefined' || !ShogiAI.hasKey()) return;
  const myId = hintReqId;
  const strat = STRATEGIES.find((s) => s.id === setup.strategyId);
  hintLoading = true;
  messageWindow.show(shogiLine(selfChar, 'advisor', 'thinking') || 'うーん、考えるね…🤔');
  const res = await ShogiAI.suggestMove(game, legalCache, {
    selfName: selfChar ? selfChar.displayName : 'アドバイザー',
    tone: selfChar ? (selfChar.tone || selfChar.description) : '',
    strategyName: strat ? strat.name : '自由',
    castle: strat ? strat.castle : '自由',
    recentMoves: moveHistory.slice(),   // 直近の手の履歴を渡す
  });
  hintLoading = false;
  // 取得中に着手・投了・手番変化があったら破棄
  if (myId !== hintReqId || gameOver || game.turn !== 'sente') return;
  if (res) {
    hintMove = legalCache[res.moveIndex];
    renderAll();
    messageWindow.show(res.reason || 'この手がいいと思うっ！✨');
  }
}

/* ---------------- 操作 ---------------- */
function onCellClick(r, c) {
  if (gameOver || pendingPromotion || cpuThinking || game.turn !== 'sente') return;
  const piece = game.board[r][c];

  if (selection) {
    const matches = targetsForSelection().filter((m) => m.to[0] === r && m.to[1] === c);
    if (matches.length === 1) { commitMove(matches[0]); return; }
    if (matches.length >= 2) { askPromotion(matches); return; }
    // 着手先でなければ、自分の駒なら選び直し、それ以外は解除
    if (piece && piece.owner === game.turn) { selectBoard(r, c); return; }
    clearSelection();
    return;
  }

  if (piece && piece.owner === game.turn) selectBoard(r, c);
}

function onHandClick(owner, type) {
  if (gameOver || pendingPromotion || cpuThinking || game.turn !== 'sente') return;
  if (owner !== game.turn) return;
  if (selection && selection.kind === 'hand' && selection.type === type) { clearSelection(); return; }
  selection = { kind: 'hand', type };
  renderAll();
}

function selectBoard(r, c) {
  selection = { kind: 'board', r, c };
  renderAll();
}

function clearSelection() {
  selection = null;
  renderAll();
}

function askPromotion(matches) {
  const plain = matches.find((m) => !m.promote);
  const promote = matches.find((m) => m.promote);
  pendingPromotion = { plain, promote };
  document.getElementById('promote-modal').classList.add('is-visible');
}

function resolvePromotion(doPromote) {
  const choice = doPromote ? pendingPromotion.promote : pendingPromotion.plain;
  document.getElementById('promote-modal').classList.remove('is-visible');
  pendingPromotion = null;
  commitMove(choice);
}

/* キャラJSONの将棋セリフを引く（無ければ null） */
function shogiLine(ch, role, scene) {
  const s = ch && ch.lines && ch.lines.shogi && ch.lines.shogi[role] && ch.lines.shogi[role][scene];
  return (s && s.length) ? Characters.pickRandom(s) : null;
}

function commitMove(move) {
  const mover = game.turn;   // 指す側（apply前）
  const capturing = move.from && game.board[move.to[0]][move.to[1]];

  // 履歴へ記録（apply前の盤面で手を文章化）
  if (typeof ShogiAI !== 'undefined') {
    const moverLabel = mover === 'sente' ? '▲' : '△';
    moveHistory.push(moverLabel + ShogiAI.describeMove(game, move));
    if (moveHistory.length > 12) moveHistory.shift();   // 直近12手だけ保持
  }

  game = ShogiEngine.applyMove(game, move);

  // 新しい局面の出現回数をカウント（千日手検出用）
  if (typeof ShogiAI !== 'undefined') {
    const key = ShogiAI.positionKey(game);
    positionCounts[key] = (positionCounts[key] || 0) + 1;
  }

  selection = null;
  hintMove = null;           // 着手したらヒント表示を消す
  legalCache = ShogiEngine.legalMoves(game);
  saveGame();
  renderAll();

  // 勝敗・王手の判定（手番は既に相手へ移っている）
  if (legalCache.length === 0) {
    const winner = ShogiEngine.opponentOf(game.turn);
    endGame(winner, 'checkmate');
    return;
  }

  const gaveCheck = ShogiEngine.isInCheck(game.board, game.turn);
  if (mover === 'sente') {
    // あなたの手 → 自分側（アドバイザー）が反応
    if (gaveCheck || move.promote || capturing) {
      messageWindow.show(shogiLine(selfChar, 'advisor', 'praise') || (gaveCheck ? '王手っ！⚔️' : 'いいねっ✨'));
    }
  } else {
    // CPUの手 → 相手側（ライバル）が反応。AIコメントがあれば最優先
    if (aiComment) {
      oppMsg.show(aiComment);
      aiComment = null;
    } else {
      let scene = gaveCheck ? 'check' : (capturing ? 'capture' : 'aizuchi');
      if (scene !== 'aizuchi' || Math.random() < 0.4) {
        const line = shogiLine(oppChar, 'rival', scene);
        if (line) oppMsg.show(line);
        else if (gaveCheck) oppMsg.show('王手！');
      }
    }
  }

  if (!gameOver) {
    if (game.turn === 'gote') scheduleCpuMove();        // 相手（後手）の番 → CPUが指す
    else if (mover === 'gote') maybeAutoHint();          // 自分（先手）の番が回ってきた → 推奨手を自動表示
  }
}

/* ---------------- CPU ---------------- */
/* 千日手（同一局面の繰り返し）に当たる手を除外した合法手を返す */
function nonRepeatingMoves(state, moves) {
  if (typeof ShogiAI === 'undefined') return moves;
  const filtered = moves.filter((m) => {
    const ns = ShogiEngine.applyMove(state, m);
    const key = ShogiAI.positionKey(ns);
    return (positionCounts[key] || 0) < 2;   // この手を指すと3回目になるなら除外
  });
  return filtered.length ? filtered : moves;  // 全部消えたら元のまま
}

function scheduleCpuMove() {
  cpuThinking = true;
  renderTurn();
  setTimeout(doCpuMove, 500);
}

async function doCpuMove() {
  if (gameOver) { cpuThinking = false; return; }
  let move = null;
  aiComment = null;

  // 千日手に当たる手を除いた合法手を使う（AI・JS CPU 共通の候補リスト）
  const candidateMoves = nonRepeatingMoves(game, legalCache);

  // AIモードのときだけClaudeに選ばせる（失敗時はJS CPUへフォールバック）
  if (setup.mode === 'ai' && typeof ShogiAI !== 'undefined' && ShogiAI.hasKey()) {
    const res = await ShogiAI.chooseMove(game, candidateMoves, {
      opponentName: oppChar ? oppChar.displayName : '相手',
      tone: oppChar ? (oppChar.tone || oppChar.description) : '',
      difficulty: CPU_LEVEL,
      recentMoves: moveHistory.slice(),   // 直近の手の履歴を渡す
    });
    if (res) {
      move = candidateMoves[res.moveIndex];   // AIに渡したリストから取る（ズレ防止）
      aiComment = res.comment || null;
    }
  }
  if (!move) move = ShogiCPU.chooseMove(game, CPU_LEVEL, candidateMoves);

  cpuThinking = false;
  if (gameOver) return;            // 取得中に投了/中断された場合
  if (!move) { endGame('sente', 'checkmate'); return; }
  commitMove(move);
}

function endGame(winner, reason) {
  gameOver = true;
  cpuThinking = false;
  Storage.remove(SAVE_KEY);
  renderAll();
  const youWon = winner === 'sente';
  const rec = recordResult(setup.opponentId, youWon);
  const title = reason === 'resign'
    ? (youWon ? '相手が投了したよっ🎉' : 'お疲れさま、投了だねっ')
    : (youWon ? '詰みっ！あなたの勝ちっ🎉' : '詰まされちゃった…！');
  const sub = youWon ? `${ownerLabel(winner)}の勝利っ💕` : `${ownerLabel(winner)}の勝ちっ`;
  const vs = rec.vs[setup.opponentId] || { w: 0, l: 0 };
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-sub').textContent = sub;
  document.getElementById('result-record').textContent =
    `通算 ${rec.wins}勝${rec.losses}敗　／　${ownerLabel('gote')}戦 ${vs.w}勝${vs.l}敗`;
  document.getElementById('result-modal').classList.add('is-visible');
  // 自分（アドバイザー）と相手（ライバル）それぞれの口調で
  if (youWon) {
    messageWindow.show(shogiLine(selfChar, 'advisor', 'win') || 'やったねっ💕✨');
    const l = shogiLine(oppChar, 'rival', 'lose'); if (l) oppMsg.show(l);
  } else {
    messageWindow.show(shogiLine(selfChar, 'advisor', 'lose') || 'うぅ〜、次はがんばろっ🐾');
    const l = shogiLine(oppChar, 'rival', 'win'); if (l) oppMsg.show(l);
  }
}

/* ---------------- 戦績 ---------------- */
function loadRecord() {
  return Storage.get(RECORD_KEY, { wins: 0, losses: 0, vs: {} });
}

function recordResult(opponentId, youWon) {
  const r = loadRecord();
  if (youWon) r.wins++; else r.losses++;
  if (!r.vs[opponentId]) r.vs[opponentId] = { w: 0, l: 0 };
  if (youWon) r.vs[opponentId].w++; else r.vs[opponentId].l++;
  Storage.set(RECORD_KEY, r);
  return r;
}

function renderSetupRecord() {
  const el = document.getElementById('setup-record');
  if (!el) return;
  const r = loadRecord();
  el.textContent = (r.wins || r.losses)
    ? `これまでの戦績：${r.wins}勝${r.losses}敗`
    : 'まだ対局していないよっ。最初の一局いこ〜っ🐾';
}

/* ---------------- AIキー設定 ---------------- */
function renderAiStatus() {
  const el = document.getElementById('ai-status');
  if (!el || typeof ShogiAI === 'undefined') return;
  const on = ShogiAI.hasKey();
  el.textContent = on
    ? `AI連携：ON（${ShogiAI.AI_MODEL}）。AIモードとアシストが使えるよっ✨`
    : 'AI連携：OFF（キー未設定）。CPUモードとセリフで遊べるよっ🐾';
  el.classList.toggle('is-on', on);
}

function setupAiKeyControls() {
  if (typeof ShogiAI === 'undefined') return;
  const input = document.getElementById('ai-key-input');
  document.getElementById('ai-key-save').addEventListener('click', () => {
    const v = (input.value || '').trim();
    if (!v) { alert('APIキーを入力してねっ🐾'); return; }
    ShogiAI.setKey(v);
    input.value = '';
    renderAiStatus();
    refreshModeButtons();   // AIモードを選べるように更新
    alert('APIキーを保存したよっ！この端末のブラウザだけに保存されるからねっ💕');
  });
  document.getElementById('ai-key-clear').addEventListener('click', () => {
    ShogiAI.clearKey();
    input.value = '';
    renderAiStatus();
    refreshModeButtons();   // キーが無くなったらAIモードを無効化（CPUへ戻す）
  });
}

/* ---------------- セーブ / 再開 ---------------- */
function saveGame() {
  if (gameOver) return;
  Storage.set(SAVE_KEY, {
    board: game.board,
    hands: game.hands,
    turn: game.turn,
    setup: { ...setup },
    moveHistory: moveHistory.slice(),
    positionCounts: { ...positionCounts },
  });
}

function hasSave() {
  const s = Storage.get(SAVE_KEY, null);
  return s && s.board && s.setup;
}

function loadSave() {
  const s = Storage.get(SAVE_KEY, null);
  if (!s) return false;
  Object.assign(setup, s.setup);
  game = { board: s.board, hands: s.hands, turn: s.turn };
  moveHistory = Array.isArray(s.moveHistory) ? s.moveHistory.slice() : [];
  positionCounts = (s.positionCounts && typeof s.positionCounts === 'object') ? { ...s.positionCounts } : {};
  enterGameScreen();
  return true;
}

/* ---------------- 画面遷移 ---------------- */
function enterGameScreen() {
  oppChar = charCache[setup.opponentId] || charCache['mia'];
  gameOver = false;
  cpuThinking = false;
  hintLoading = false;
  hintMove = null;
  selection = null;
  pendingPromotion = null;
  legalCache = ShogiEngine.legalMoves(game);

  document.getElementById('setup-screen').hidden = true;
  document.getElementById('game-screen').hidden = false;
  document.getElementById('result-modal').classList.remove('is-visible');

  renderGameChar();
  renderAssist();
  renderAll();

  if (!gameOver) {
    if (game.turn === 'gote') scheduleCpuMove();   // 再開時など、相手の番ならCPUを動かす
    else maybeAutoHint();                          // 自分の番なら推奨手を自動表示
  }
}

function startGame() {
  game = ShogiEngine.initialState();
  moveHistory = [];        // 前局の履歴・局面カウントを持ち越さない
  positionCounts = {};
  enterGameScreen();
  saveGame();
  // アドバイザー（自分キャラ）の応援、相手（ライバル）のあいさつ
  messageWindow.show(shogiLine(selfChar, 'advisor', 'start') || 'いっしょにがんばろっ！');
  const oppStart = shogiLine(oppChar, 'rival', 'start');
  if (oppStart) oppMsg.show(oppStart);
}

function backToSetup() {
  document.getElementById('game-screen').hidden = true;
  document.getElementById('result-modal').classList.remove('is-visible');
  document.getElementById('setup-screen').hidden = false;
  renderSetupRecord();
}

function suspendGame() {
  saveGame();
  alert('対局を保存したよっ！次に開いたとき続きから遊べるからねっ🐾');
  window.location.href = ROOT + 'index.html';
}

function resign() {
  if (!confirm('投了する？（あなたの負けになるよ）')) return;
  endGame('gote', 'resign');
}

/* ---------------- 再開モーダル ---------------- */
function openResumeModal() {
  document.getElementById('resume-modal').classList.add('is-visible');
}
function closeResumeModal() {
  document.getElementById('resume-modal').classList.remove('is-visible');
}

/* ---------------- 初期化 ---------------- */
async function loadChar(id) {
  if (charCache[id]) return charCache[id];
  const data = await Characters.load(id, ROOT + 'characters/');
  charCache[id] = data;
  return data;
}

async function init() {
  messageWindow.init();
  oppMsg.init();
  setup.selfId = Storage.get('selectedCharacter', 'mia');

  const ids = Array.from(new Set([...OPPONENTS, setup.selfId]));
  await Promise.all(ids.map((id) => loadChar(id).catch((e) => console.error(id, e))));
  selfChar = charCache[setup.selfId] || charCache['mia'];

  renderSelfCard();
  renderOpponentOptions();
  renderStrategyOptions();
  setupModeButtons();
  setupAssistToggle();
  updateStartButton();
  renderSetupRecord();
  setupAiKeyControls();
  renderAiStatus();

  document.getElementById('btn-start').addEventListener('click', () => {
    if (isReadyToStart()) startGame();
  });
  document.getElementById('char-portrait').addEventListener('click', () => {
    const lines = selfChar && selfChar.lines && selfChar.lines.click_idle;
    if (lines && lines.length) messageWindow.show(Characters.pickRandom(lines));
  });
  document.getElementById('opp-portrait').addEventListener('click', () => {
    const lines = oppChar && oppChar.lines && oppChar.lines.click_idle;
    if (lines && lines.length) oppMsg.show(Characters.pickRandom(lines));
  });
  document.getElementById('btn-resign').addEventListener('click', resign);
  document.getElementById('btn-suspend').addEventListener('click', suspendGame);
  window.addEventListener('resize', scheduleFitGame);

  // 成り確認モーダル
  document.getElementById('promote-yes').addEventListener('click', () => resolvePromotion(true));
  document.getElementById('promote-no').addEventListener('click', () => resolvePromotion(false));

  // リザルトモーダル
  document.getElementById('btn-again').addEventListener('click', () => { backToSetup(); });

  // 再開モーダル
  document.getElementById('resume-yes').addEventListener('click', () => { closeResumeModal(); loadSave(); });
  document.getElementById('resume-no').addEventListener('click', () => { closeResumeModal(); Storage.remove(SAVE_KEY); });

  if (hasSave()) openResumeModal();
}

document.addEventListener('DOMContentLoaded', init);
