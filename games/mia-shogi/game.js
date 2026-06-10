'use strict';

/* ============================================================
   ミア将棋 — Phase 1
   ・対局準備画面（自キャラ / 相手キャラ / 戦法 / 難易度 / アシスト）
   ・9×9 盤の表示と初期配置
   ※ ルール判定・駒移動・CPU・AI は後続フェーズで実装。
     ここでは「見た目と初期配置の確認」までを担当する。
   ============================================================ */

const ROOT = '../../';

/* 相手として選べるキャラ（自キャラは実行時に除外） */
const OPPONENTS = ['mia', 'kyown', 'rain', 'shiori'];

/* 駒の漢字表記（成り駒含む） */
const PIECE_KANJI = {
  P: '歩', L: '香', N: '桂', S: '銀', G: '金', B: '角', R: '飛', K: '玉',
};
const PROMOTED_KANJI = {
  P: 'と', L: '杏', N: '圭', S: '全', B: '馬', R: '龍',
};

function glyph(piece) {
  if (!piece) return '';
  return piece.promoted ? PROMOTED_KANJI[piece.type] : PIECE_KANJI[piece.type];
}

/* ---------------- 状態 ---------------- */
const setup = {
  selfId: 'mia',
  opponentId: null,
  strategyId: null,
  difficulty: 'normal', // easy / normal
  assist: true,
};

const state = {
  board: [],          // 9x9: null か { type, owner:'sente'|'gote', promoted:bool }
  hands: { sente: {}, gote: {} },
};

const charCache = {};   // id -> キャラデータ
let selfChar = null;
let oppChar = null;

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

/* ---------------- 盤面 初期配置 ---------------- */
/* row 0 = 上（後手/相手）, row 8 = 下（先手/自分） */
function buildInitialBoard() {
  const empty = () => Array.from({ length: 9 }, () => null);
  const board = Array.from({ length: 9 }, empty);
  const back = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'];

  // 後手（上）
  back.forEach((t, c) => { board[0][c] = { type: t, owner: 'gote', promoted: false }; });
  board[1][1] = { type: 'R', owner: 'gote', promoted: false }; // 8二 飛
  board[1][7] = { type: 'B', owner: 'gote', promoted: false }; // 2二 角
  for (let c = 0; c < 9; c++) board[2][c] = { type: 'P', owner: 'gote', promoted: false };

  // 先手（下）
  for (let c = 0; c < 9; c++) board[6][c] = { type: 'P', owner: 'sente', promoted: false };
  board[7][1] = { type: 'B', owner: 'sente', promoted: false }; // 8八 角
  board[7][7] = { type: 'R', owner: 'sente', promoted: false }; // 2八 飛
  back.forEach((t, c) => { board[8][c] = { type: t, owner: 'sente', promoted: false }; });

  return board;
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

/* ---------------- 対局画面 ---------------- */
function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      const piece = state.board[r][c];
      if (piece) {
        const p = document.createElement('span');
        p.className = 'piece' + (piece.owner === 'gote' ? ' is-gote' : '') + (piece.promoted ? ' is-promoted' : '');
        p.textContent = glyph(piece);
        cell.appendChild(p);
      }
      boardEl.appendChild(cell);
    }
  }
}

function renderHands() {
  // Phase 1 は持ち駒なし（空表示）。後続フェーズで取った駒を反映する。
  document.getElementById('hand-gote').innerHTML = '<span class="hand__empty">なし</span>';
  document.getElementById('hand-sente').innerHTML = '<span class="hand__empty">なし</span>';
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
    `<div class="assist__body">推奨手の提案はこのあとのフェーズで届くよっ🐾<br>` +
    `今は${strat ? `「${strat.castle}」` : '囲い'}を意識して並べてみてね💕</div>`;
}

function startGame() {
  oppChar = charCache[setup.opponentId];
  state.board = buildInitialBoard();
  state.hands = { sente: {}, gote: {} };

  document.getElementById('setup-screen').hidden = true;
  document.getElementById('game-screen').hidden = false;

  renderGameChar();
  renderBoard();
  renderHands();
  renderAssist();

  const start = oppChar.lines && oppChar.lines.greeting_first;
  messageWindow.show(start && start.length ? start[0] : 'よろしくおねがいしますっ！');
}

function backToSetup() {
  document.getElementById('game-screen').hidden = true;
  document.getElementById('setup-screen').hidden = false;
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

  // 相手候補＋自キャラをまとめて読み込み
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
  document.getElementById('btn-resign').addEventListener('click', backToSetup);
  document.getElementById('btn-suspend').addEventListener('click', backToSetup);
}

document.addEventListener('DOMContentLoaded', init);
