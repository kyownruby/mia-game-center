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
  difficulty: 'normal',
  assist: true,
};

let game = null;            // ShogiEngine の局面 { board, hands, turn }
let legalCache = [];        // 現在手番の合法手
let selection = null;       // { kind:'board', r, c } | { kind:'hand', type }
let pendingPromotion = null;// { plain, promote } 成り確認待ち
let gameOver = false;

const charCache = {};
let selfChar = null;
let oppChar = null;

/* 先手＝あなた / 後手＝相手キャラ */
function ownerLabel(owner) {
  if (owner === 'sente') return 'あなた';
  return oppChar ? oppChar.displayName : '相手';
}

/* ---------------- キャラ / メッセージ ---------------- */
const messageWindow = {
  el: null, textEl: null, hideTimer: null, typingTimer: null, isTyping: false, fullText: '',
  init() {
    this.el = document.getElementById('message-window');
    this.textEl = document.getElementById('message-text');
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

function applyImage(imgEl, fbEl, src) {
  if (!imgEl) return;
  fbEl.hidden = true;
  imgEl.onload = () => { imgEl.hidden = false; fbEl.hidden = true; };
  imgEl.onerror = () => { imgEl.hidden = true; fbEl.hidden = false; };
  imgEl.src = src;
}

/* ---------------- 準備画面 ---------------- */
function renderSelfCard() {
  if (!selfChar) return;
  document.getElementById('self-name').textContent = selfChar.displayName;
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

    const note = document.createElement('span');
    note.className = 'opp-card__note';
    note.textContent = pickGreeting(ch);

    btn.append(icon, name, note);
    btn.addEventListener('click', () => {
      setup.opponentId = id;
      renderOpponentOptions();
      updateStartButton();
    });
    grid.appendChild(btn);
  });
}

function pickGreeting(ch) {
  const lines = ch.lines && (ch.lines.greeting_return || ch.lines.greeting_first);
  if (lines && lines.length) return lines[0];
  return 'よろしくねっ';
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

function setupDifficultyButtons() {
  document.querySelectorAll('[data-difficulty]').forEach((btn) => {
    btn.classList.toggle('is-selected', btn.dataset.difficulty === setup.difficulty);
    btn.addEventListener('click', () => {
      setup.difficulty = btn.dataset.difficulty;
      document.querySelectorAll('[data-difficulty]').forEach((b) => {
        b.classList.toggle('is-selected', b.dataset.difficulty === setup.difficulty);
      });
    });
  });
}

function setupAssistToggle() {
  const toggle = document.getElementById('assist-toggle');
  const sync = () => {
    toggle.classList.toggle('is-on', setup.assist);
    toggle.setAttribute('aria-pressed', String(setup.assist));
    toggle.querySelector('.toggle__label').textContent = setup.assist ? 'ON' : 'OFF';
  };
  sync();
  toggle.addEventListener('click', () => { setup.assist = !setup.assist; sync(); });
}

function updateStartButton() {
  const btn = document.getElementById('btn-start');
  btn.disabled = !(setup.opponentId && setup.strategyId);
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
  const inCheck = ShogiEngine.isInCheck(game.board, game.turn);
  el.textContent = `${ownerLabel(game.turn)}の番` + (inCheck ? '（王手！）' : '');
  el.classList.toggle('is-check', inCheck);
}

function renderGameChar() {
  if (!oppChar) return;
  document.getElementById('opp-label').textContent = `対戦相手：${oppChar.displayName}`;
  applyImage(
    document.getElementById('char-img'),
    document.getElementById('char-fallback'),
    ROOT + oppChar.image.portrait
  );
  document.getElementById('char-fallback').textContent = oppChar.emoji || '🐈';
}

function renderAssist() {
  const box = document.getElementById('assist-box');
  const strat = STRATEGIES.find((s) => s.id === setup.strategyId);
  if (!setup.assist) {
    box.innerHTML = '<span class="assist__off">アシストOFF</span>';
    return;
  }
  box.innerHTML =
    `<div class="assist__title">アシスト（${strat ? strat.name : ''}）</div>` +
    `<div class="assist__body">${strat ? `「${strat.castle}」` : '囲い'}を意識して指してみてね💕<br>` +
    `AIの推奨手は次のフェーズで届くよっ🐾</div>`;
}

function renderAll() {
  renderBoard();
  renderHand('sente');
  renderHand('gote');
  renderTurn();
}

/* ---------------- 操作 ---------------- */
function onCellClick(r, c) {
  if (gameOver || pendingPromotion) return;
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
  if (gameOver || pendingPromotion) return;
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

function commitMove(move) {
  const capturing = move.from && game.board[move.to[0]][move.to[1]];
  game = ShogiEngine.applyMove(game, move);
  selection = null;
  legalCache = ShogiEngine.legalMoves(game);
  saveGame();
  renderAll();

  // 勝敗・王手の判定（手番は既に相手へ移っている）
  if (legalCache.length === 0) {
    const winner = ShogiEngine.opponentOf(game.turn);
    endGame(winner, 'checkmate');
    return;
  }
  if (ShogiEngine.isInCheck(game.board, game.turn)) {
    messageWindow.show('王手っ！⚔️');
  } else if (move.promote) {
    messageWindow.show('成ったよっ✨');
  } else if (capturing) {
    messageWindow.show('駒を取ったねっ🐾');
  }
}

function endGame(winner, reason) {
  gameOver = true;
  Storage.remove(SAVE_KEY);
  renderAll();
  const youWon = winner === 'sente';
  const title = reason === 'resign'
    ? (youWon ? '相手が投了したよっ🎉' : 'お疲れさま、投了だねっ')
    : (youWon ? '詰みっ！あなたの勝ちっ🎉' : '詰まされちゃった…！');
  const sub = youWon ? `${ownerLabel(winner)}の勝利っ💕` : `${ownerLabel(winner)}の勝ちっ`;
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-sub').textContent = sub;
  document.getElementById('result-modal').classList.add('is-visible');
  messageWindow.show(youWon ? 'やったねご主人っ💕✨' : 'うぅ〜、次はがんばろっ🐾');
}

/* ---------------- セーブ / 再開 ---------------- */
function saveGame() {
  if (gameOver) return;
  Storage.set(SAVE_KEY, {
    board: game.board,
    hands: game.hands,
    turn: game.turn,
    setup: { ...setup },
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
  enterGameScreen();
  return true;
}

/* ---------------- 画面遷移 ---------------- */
function enterGameScreen() {
  oppChar = charCache[setup.opponentId] || charCache['mia'];
  gameOver = false;
  selection = null;
  pendingPromotion = null;
  legalCache = ShogiEngine.legalMoves(game);

  document.getElementById('setup-screen').hidden = true;
  document.getElementById('game-screen').hidden = false;
  document.getElementById('result-modal').classList.remove('is-visible');

  renderGameChar();
  renderAssist();
  renderAll();
}

function startGame() {
  game = ShogiEngine.initialState();
  enterGameScreen();
  saveGame();
  const start = oppChar.lines && oppChar.lines.greeting_first;
  messageWindow.show(start && start.length ? start[0] : 'よろしくおねがいしますっ！');
}

function backToSetup() {
  document.getElementById('game-screen').hidden = true;
  document.getElementById('result-modal').classList.remove('is-visible');
  document.getElementById('setup-screen').hidden = false;
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
  setup.selfId = Storage.get('selectedCharacter', 'mia');

  const ids = Array.from(new Set([...OPPONENTS, setup.selfId]));
  await Promise.all(ids.map((id) => loadChar(id).catch((e) => console.error(id, e))));
  selfChar = charCache[setup.selfId] || charCache['mia'];

  renderSelfCard();
  renderOpponentOptions();
  renderStrategyOptions();
  setupDifficultyButtons();
  setupAssistToggle();
  updateStartButton();

  document.getElementById('btn-start').addEventListener('click', () => {
    if (setup.opponentId && setup.strategyId) startGame();
  });
  document.getElementById('char-portrait').addEventListener('click', () => {
    const lines = oppChar && oppChar.lines && oppChar.lines.click_idle;
    if (lines && lines.length) messageWindow.show(Characters.pickRandom(lines));
  });
  document.getElementById('btn-resign').addEventListener('click', resign);
  document.getElementById('btn-suspend').addEventListener('click', suspendGame);

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
