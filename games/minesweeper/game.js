'use strict';

/* ============================================================
   マインスイーパー
   ============================================================ */

const ROOT = '../../';
const IDLE_MS = 30000;

const DIFFICULTIES = {
  beginner:     { rows: 9,  cols: 9,  mines: 10, cell: 40, label: '初級' },
  intermediate: { rows: 16, cols: 16, mines: 40, cell: 34, label: '中級' },
  expert:       { rows: 16, cols: 30, mines: 99, cell: 30, label: '上級' },
};
const MODE_LABEL = { safe: 'セーフ', hardcore: 'ハードコア' };

const state = {
  rows: 9, cols: 9, mines: 10,
  difficulty: 'beginner', mode: 'safe',
  grid: [],
  minesPlaced: false,
  started: false,
  over: false,
  won: false,
  flags: 0,
  firstFlagDone: false,
  elapsed: 0,
  startTime: 0,
};

let timerId = null;
let idleId = null;
let charData = null;
let selectedId = 'mia';
let modalChoice = { difficulty: 'beginner', mode: 'safe' };

/* ---------------- キャラ / メッセージ ---------------- */
const messageWindow = {
  el: null, textEl: null, hideTimer: null, typingTimer: null, isTyping: false, fullText: '',
  init() {
    this.el = document.getElementById('message-window');
    this.textEl = document.getElementById('message-text');
    this.el.addEventListener('click', () => this.skip());
  },
  show(text) {
    if (!text) return;
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

function say(scene) {
  const lines = charData && charData.lines.minesweeper && charData.lines.minesweeper[scene];
  if (lines && lines.length) messageWindow.show(Characters.pickRandom(lines));
}

function renderChar() {
  const img = document.getElementById('char-img');
  const fb = document.getElementById('char-fallback');
  fb.textContent = charData.emoji || '🐈';
  img.onload = () => { img.hidden = false; fb.hidden = true; };
  img.onerror = () => { img.hidden = true; fb.hidden = false; };
  img.src = ROOT + charData.image.portrait;
}

/* ---------------- 盤面 ---------------- */
function makeCell() { return { mine: false, revealed: false, flagged: false, adj: 0 }; }

function newGame(difficulty, mode) {
  const cfg = DIFFICULTIES[difficulty];
  state.difficulty = difficulty;
  state.mode = mode;
  state.rows = cfg.rows;
  state.cols = cfg.cols;
  state.mines = cfg.mines;
  state.grid = Array.from({ length: cfg.rows }, () => Array.from({ length: cfg.cols }, makeCell));
  state.minesPlaced = false;
  state.started = false;
  state.over = false;
  state.won = false;
  state.flags = 0;
  state.firstFlagDone = false;
  state.elapsed = 0;
  stopTimer();

  document.documentElement.style.setProperty('--cell', cfg.cell + 'px');
  document.getElementById('board').style.gridTemplateColumns = `repeat(${cfg.cols}, var(--cell))`;
  render();
  say('start');
  resetIdle();
}

function inBounds(r, c) { return r >= 0 && r < state.rows && c >= 0 && c < state.cols; }
function neighbors(r, c) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    if (inBounds(r + dr, c + dc)) out.push([r + dr, c + dc]);
  }
  return out;
}

function placeMines(excludeR, excludeC) {
  let placed = 0;
  while (placed < state.mines) {
    const r = Math.floor(Math.random() * state.rows);
    const c = Math.floor(Math.random() * state.cols);
    if (state.grid[r][c].mine) continue;
    if (excludeR === r && excludeC === c) continue;
    state.grid[r][c].mine = true;
    placed++;
  }
  for (let r = 0; r < state.rows; r++) for (let c = 0; c < state.cols; c++) {
    if (state.grid[r][c].mine) continue;
    state.grid[r][c].adj = neighbors(r, c).filter(([nr, nc]) => state.grid[nr][nc].mine).length;
  }
  state.minesPlaced = true;
}

/* ---------------- 操作 ---------------- */
function reveal(r, c) {
  if (state.over || state.won) return;
  const cell = state.grid[r][c];
  if (cell.revealed || cell.flagged) return;

  if (!state.started) { state.started = true; startTimer(); }
  if (!state.minesPlaced) {
    // セーフ: 最初に開けたマスは地雷にしない。ハードコア: そのまま
    placeMines(state.mode === 'safe' ? r : -1, state.mode === 'safe' ? c : -1);
  }

  if (cell.mine) { cell.revealed = true; gameOver(r, c); return; }
  floodReveal(r, c);
  resetIdle();
  checkWin();
  if (!state.over && !state.won) render();
}

function floodReveal(r, c) {
  const stack = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    const cell = state.grid[cr][cc];
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    if (cell.adj === 0) for (const [nr, nc] of neighbors(cr, cc)) {
      if (!state.grid[nr][nc].revealed) stack.push([nr, nc]);
    }
  }
}

function toggleFlag(r, c) {
  if (state.over || state.won) return;
  const cell = state.grid[r][c];
  if (cell.revealed) return;
  cell.flagged = !cell.flagged;
  state.flags += cell.flagged ? 1 : -1;
  if (cell.flagged && !state.firstFlagDone) { state.firstFlagDone = true; say('first_flag'); }
  else if (cell.flagged && state.flags === state.mines - 1) say('almost_clear');
  resetIdle();
  render();
}

function chord(r, c) {
  if (state.over || state.won) return;
  const cell = state.grid[r][c];
  if (!cell.revealed || cell.adj === 0) return;
  const nbrs = neighbors(r, c);
  const flagged = nbrs.filter(([nr, nc]) => state.grid[nr][nc].flagged).length;
  if (flagged !== cell.adj) return;
  for (const [nr, nc] of nbrs) {
    const n = state.grid[nr][nc];
    if (!n.revealed && !n.flagged) {
      if (n.mine) { n.revealed = true; gameOver(nr, nc); return; }
      floodReveal(nr, nc);
    }
  }
  resetIdle();
  checkWin();
  if (!state.over && !state.won) render();
}

/* ---------------- 勝敗 ---------------- */
function checkWin() {
  for (let r = 0; r < state.rows; r++) for (let c = 0; c < state.cols; c++) {
    const cell = state.grid[r][c];
    if (!cell.mine && !cell.revealed) return;
  }
  state.won = true;
  stopTimer();
  render();
  say('clear');
  saveResult(true);
  setTimeout(() => showResult(true), 700);
}

function gameOver(er, ec) {
  state.over = true;
  stopTimer();
  for (let r = 0; r < state.rows; r++) for (let c = 0; c < state.cols; c++) {
    if (state.grid[r][c].mine) state.grid[r][c].revealed = true;
  }
  state.explodedR = er; state.explodedC = ec;
  render();
  say('gameover');
  saveResult(false);
  setTimeout(() => showResult(false), 700);
}

/* ---------------- 記録 ---------------- */
function scoreKey() { return `scores:minesweeper:${state.difficulty}:${state.mode}`; }

function saveResult(win) {
  const sec = Math.floor(state.elapsed / 1000);
  const prev = Storage.get(scoreKey(), { fastestTime: null, totalPlays: 0, totalWins: 0, winRate: 0, lastPlayed: null });
  const totalPlays = (prev.totalPlays || 0) + 1;
  const totalWins = (prev.totalWins || 0) + (win ? 1 : 0);
  const isFastest = win && (prev.fastestTime == null || sec < prev.fastestTime);
  const rec = {
    fastestTime: isFastest ? sec : prev.fastestTime,
    totalPlays,
    totalWins,
    winRate: Math.round((totalWins / totalPlays) * 100),
    lastPlayed: new Date().toISOString(),
  };
  Storage.set(scoreKey(), rec);
  state._lastRec = rec;
  state._isFastest = isFastest;
}

function showResult(win) {
  const rec = state._lastRec;
  const sec = Math.floor(state.elapsed / 1000);
  const rows = document.getElementById('result-rows');
  rows.innerHTML = '';
  const add = (label, value, best) => {
    const row = document.createElement('div');
    row.className = 'result-row' + (best ? ' is-best' : '');
    row.innerHTML = `<span>${label}</span><span><strong>${value}</strong>${best ? '<span class="badge">更新！</span>' : ''}</span>`;
    rows.appendChild(row);
  };
  const clearLines = charData.lines.minesweeper.clear;
  const overLines = charData.lines.minesweeper.gameover;
  document.getElementById('result-title').textContent =
    win ? (clearLines && clearLines[0]) || 'クリア！' : (overLines && overLines[0]) || 'ゲームオーバー';

  add(win ? 'クリアタイム' : '経過タイム', fmtTime(state.elapsed), false);
  if (win) add('最速タイム', rec.fastestTime != null ? fmtTime(rec.fastestTime * 1000) : '-', state._isFastest);
  add('累計プレイ', rec.totalPlays, false);
  add('クリア回数', rec.totalWins, false);
  add('勝率', rec.winRate + '%', false);

  document.getElementById('result-modal').classList.add('is-visible');
}

/* ---------------- タイマー / アイドル ---------------- */
function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function startTimer() {
  state.startTime = Date.now();
  state.elapsed = 0;
  stopTimer();
  timerId = setInterval(() => {
    state.elapsed = Date.now() - state.startTime;
    document.getElementById('timer').textContent = fmtTime(state.elapsed);
  }, 500);
}
function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
function resetIdle() {
  if (idleId) clearTimeout(idleId);
  idleId = setTimeout(() => { if (!state.over && !state.won) say('idle'); }, IDLE_MS);
}

/* ---------------- 描画 ---------------- */
function render() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = state.grid[r][c];
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.r = r;
      el.dataset.c = c;
      if (cell.revealed) {
        if (cell.mine) {
          el.classList.add('is-mine');
          if (state.explodedR === r && state.explodedC === c) el.classList.add('is-exploded');
        } else {
          el.classList.add('is-open');
          if (cell.adj > 0) { el.classList.add('n' + cell.adj); el.textContent = cell.adj; }
        }
      } else if (cell.flagged) {
        el.classList.add('is-flag');
      }
      board.appendChild(el);
    }
  }
  document.getElementById('mines-left').textContent = state.mines - state.flags;
}

/* ---------------- モーダル ---------------- */
function openNewModal() {
  modalChoice = { difficulty: state.difficulty, mode: state.mode };
  syncChoiceUI();
  document.getElementById('new-modal').classList.add('is-visible');
}
function closeNewModal() { document.getElementById('new-modal').classList.remove('is-visible'); }
function syncChoiceUI() {
  document.querySelectorAll('#choice-difficulty .ms-opt').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.difficulty === modalChoice.difficulty));
  document.querySelectorAll('#choice-mode .ms-opt').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.mode === modalChoice.mode));
}

/* ---------------- 初期化 ---------------- */
async function init() {
  messageWindow.init();
  selectedId = Storage.get('selectedCharacter', 'mia');
  try { charData = await Characters.load(selectedId, ROOT + 'characters/'); }
  catch (_) { try { charData = await Characters.load('mia', ROOT + 'characters/'); } catch (e) { console.error(e); } }
  if (charData) renderChar();

  document.getElementById('btn-new').addEventListener('click', openNewModal);
  document.getElementById('btn-cancel').addEventListener('click', closeNewModal);
  document.getElementById('btn-start').addEventListener('click', () => {
    closeNewModal();
    newGame(modalChoice.difficulty, modalChoice.mode);
  });
  document.getElementById('char-portrait').addEventListener('click', () => say('idle'));

  document.querySelectorAll('#choice-difficulty .ms-opt').forEach((b) =>
    b.addEventListener('click', () => { modalChoice.difficulty = b.dataset.difficulty; syncChoiceUI(); }));
  document.querySelectorAll('#choice-mode .ms-opt').forEach((b) =>
    b.addEventListener('click', () => { modalChoice.mode = b.dataset.mode; syncChoiceUI(); }));

  document.getElementById('btn-again').addEventListener('click', () => {
    document.getElementById('result-modal').classList.remove('is-visible');
    newGame(state.difficulty, state.mode);
  });
  document.getElementById('btn-change').addEventListener('click', () => {
    document.getElementById('result-modal').classList.remove('is-visible');
    openNewModal();
  });

  // 盤面操作
  const board = document.getElementById('board');
  let lpTimer = null, lpFired = false;

  board.addEventListener('click', (e) => {
    if (lpFired) { lpFired = false; return; }
    const el = e.target.closest('.cell');
    if (el) reveal(Number(el.dataset.r), Number(el.dataset.c));
  });
  board.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const el = e.target.closest('.cell');
    if (el) toggleFlag(Number(el.dataset.r), Number(el.dataset.c));
  });
  board.addEventListener('dblclick', (e) => {
    const el = e.target.closest('.cell');
    if (el) chord(Number(el.dataset.r), Number(el.dataset.c));
  });
  // 長押しで旗（タッチ対応）
  board.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.cell');
    if (!el) return;
    lpFired = false;
    lpTimer = setTimeout(() => {
      lpFired = true;
      toggleFlag(Number(el.dataset.r), Number(el.dataset.c));
    }, 500);
  });
  const cancelLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
  board.addEventListener('pointerup', cancelLp);
  board.addEventListener('pointerleave', cancelLp);
  board.addEventListener('pointermove', cancelLp);

  // 設定済みデフォルトで初期盤面を用意しつつ、モーダルで開始
  newGame(modalChoice.difficulty, modalChoice.mode);
  openNewModal();
}

document.addEventListener('DOMContentLoaded', init);
