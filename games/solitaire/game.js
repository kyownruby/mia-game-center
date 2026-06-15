'use strict';

/* ============================================================
   クロンダイク・ソリティア
   ============================================================ */

const ROOT = '../../';
const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_STR = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
// 絵札（J/Q/K）のスート → キャラ立ち絵マッピング
const FACE_CHAR = {
  H: 'mia_portrait.png',     // ♥ ハート → ミア
  C: 'kyown_portrait.png',   // ♣ クラブ → きょん
  S: 'rain_portrait.png',    // ♠ スペード → レイン
  D: 'shiori_portrait.png',  // ♦ ダイヤ → しおり
};
const isFace = (r) => r >= 11 && r <= 13;
const IDLE_MS = 30000;

const isRed = (c) => c.suit === 'H' || c.suit === 'D';
const colorOf = (c) => (isRed(c) ? 'r' : 'b');
const rankStr = (r) => RANK_STR[r] || String(r);

/* ---------------- 状態 ---------------- */
const state = {
  stock: [],
  waste: [],
  foundations: { S: [], H: [], D: [], C: [] },
  tableau: [[], [], [], [], [], [], []],
  score: 0,
  drawMode: 1,
  startTime: 0,
  elapsed: 0,
  history: [],
  won: false,
  lost: false,
};

let timerId = null;
let idleId = null;
let autoId = null;
let autoRunning = false;   // 自動完成中はセリフ連打を抑制
let selection = null;     // {type, key, index}
let charData = null;
let selectedId = 'mia';

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
  const lines = charData && charData.lines.solitaire && charData.lines.solitaire[scene];
  if (lines && lines.length) messageWindow.show(Characters.pickRandom(lines));
}

function renderChar() {
  const img = document.getElementById('char-img');
  const fb = document.getElementById('char-fallback');
  fb.textContent = charData.emoji || '🐈';
  fb.hidden = true; // 失敗時のみ表示（FOUC防止）
  img.onload = () => { img.hidden = false; fb.hidden = true; };
  img.onerror = () => { img.hidden = true; fb.hidden = false; };
  img.src = ROOT + charData.image.portrait;
}

/* ---------------- デッキ ---------------- */
function buildDeck() {
  const deck = [];
  for (const s of SUITS) for (let r = 1; r <= 13; r++) deck.push({ suit: s, rank: r, faceUp: false, id: s + r });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function deal() {
  const deck = buildDeck();
  state.foundations = { S: [], H: [], D: [], C: [] };
  state.tableau = [[], [], [], [], [], [], []];
  for (let col = 0; col < 7; col++) {
    for (let n = 0; n <= col; n++) {
      const card = deck.pop();
      card.faceUp = n === col;
      state.tableau[col].push(card);
    }
  }
  state.stock = deck;
  state.waste = [];
  state.score = 0;
  state.history = [];
  state.won = false;
  state.lost = false;
}

/* ---------------- 状態スナップショット（Undo） ---------------- */
function snapshot() {
  state.history.push(JSON.stringify({
    stock: state.stock, waste: state.waste,
    foundations: state.foundations, tableau: state.tableau, score: state.score,
  }));
  if (state.history.length > 500) state.history.shift();
  updateButtons();
}
function undo() {
  if (!state.history.length) return;
  const snap = JSON.parse(state.history.pop());
  state.stock = snap.stock; state.waste = snap.waste;
  state.foundations = snap.foundations; state.tableau = snap.tableau; state.score = snap.score;
  selection = null;
  say('undo');
  render();
  resetIdle();
}

/* ---------------- 移動ルール ---------------- */
function canToFoundation(card) {
  const pile = state.foundations[card.suit];
  return pile.length === 0 ? card.rank === 1 : pile[pile.length - 1].rank + 1 === card.rank;
}
function canToTableau(bottom, col) {
  const c = state.tableau[col];
  if (c.length === 0) return bottom.rank === 13;
  const top = c[c.length - 1];
  return top.faceUp && top.rank === bottom.rank + 1 && colorOf(top) !== colorOf(bottom);
}
function isValidRun(cards) {
  for (let i = 1; i < cards.length; i++) {
    if (!cards[i - 1].faceUp || !cards[i].faceUp) return false;
    if (cards[i - 1].rank !== cards[i].rank + 1 || colorOf(cards[i - 1]) === colorOf(cards[i])) return false;
  }
  return cards[0].faceUp;
}

/* 指定カードidの場所と、動かせるか */
function locate(id) {
  const w = state.waste;
  if (w.length && w[w.length - 1].id === id) return { type: 'waste', key: null, index: w.length - 1, movable: true };
  for (const s of SUITS) {
    const f = state.foundations[s];
    if (f.length && f[f.length - 1].id === id) return { type: 'foundation', key: s, index: f.length - 1, movable: true };
  }
  for (let col = 0; col < 7; col++) {
    const t = state.tableau[col];
    const idx = t.findIndex((c) => c.id === id);
    if (idx !== -1) {
      const run = t.slice(idx);
      return { type: 'tableau', key: col, index: idx, movable: isValidRun(run) };
    }
  }
  return null;
}

function movingCards(src) {
  if (src.type === 'waste') return [state.waste[state.waste.length - 1]];
  if (src.type === 'foundation') return [state.foundations[src.key][state.foundations[src.key].length - 1]];
  return state.tableau[src.key].slice(src.index);
}

function removeFromSource(src) {
  if (src.type === 'waste') return [state.waste.pop()];
  if (src.type === 'foundation') return [state.foundations[src.key].pop()];
  const moved = state.tableau[src.key].splice(src.index);
  return moved;
}

/* 移動を試みる。成功でtrue */
function tryMove(src, dest) {
  if (state.won || state.lost) return false;
  const cards = movingCards(src);
  if (!cards.length) return false;

  if (dest.type === 'foundation') {
    if (cards.length !== 1) return false;
    const card = cards[0];
    if (card.suit !== dest.key || !canToFoundation(card)) return false;
  } else if (dest.type === 'tableau') {
    if (src.type === 'tableau' && src.key === dest.key) return false;
    if (!isValidRun(cards) || !canToTableau(cards[0], dest.key)) return false;
  } else {
    return false;
  }

  snapshot();
  const moved = removeFromSource(src);

  let pts = 0;
  if (dest.type === 'foundation') {
    state.foundations[dest.key].push(moved[0]);
    pts += src.type === 'waste' ? 5 : 10;
  } else {
    state.tableau[dest.key].push(...moved);
    if (src.type === 'waste') pts += 10;
    else if (src.type === 'foundation') pts -= 15;
  }

  // 場札の裏向きを表向きに
  if (src.type === 'tableau') {
    const col = state.tableau[src.key];
    if (col.length && !col[col.length - 1].faceUp) { col[col.length - 1].faceUp = true; pts += 5; }
  }

  state.score = Math.max(0, state.score + pts);
  selection = null;
  resetIdle();

  if (dest.type === 'foundation' && !autoRunning) say('foundation_move');
  render();
  checkWin();
  checkStuck();
  return true;
}

/* カードを自動で組札へ（ダブルクリック） */
function autoToFoundation(id) {
  if (state.won || state.lost) return;
  const src = locate(id);
  if (!src || !src.movable) return;
  const cards = movingCards(src);
  if (cards.length !== 1) return;
  tryMove(src, { type: 'foundation', key: cards[0].suit });
}

/* ---------------- 山札めくり ---------------- */
function drawFromStock() {
  if (state.won || state.lost) return;
  if (state.stock.length === 0) {
    if (state.waste.length === 0) return;
    snapshot();
    while (state.waste.length) { const c = state.waste.pop(); c.faceUp = false; state.stock.push(c); }
  } else {
    snapshot();
    const n = Math.min(state.drawMode, state.stock.length);
    for (let i = 0; i < n; i++) { const c = state.stock.pop(); c.faceUp = true; state.waste.push(c); }
  }
  selection = null;
  resetIdle();
  render();
  checkStuck();
}

/* ---------------- 詰み判定 ---------------- */
function hasPlacement() {
  // 場札の一番上 → 組札
  for (let col = 0; col < 7; col++) {
    const t = state.tableau[col];
    if (t.length && t[t.length - 1].faceUp && canToFoundation(t[t.length - 1])) return true;
  }
  // 場札の有効な連なり → 別の列
  for (let col = 0; col < 7; col++) {
    const t = state.tableau[col];
    for (let idx = 0; idx < t.length; idx++) {
      if (!t[idx].faceUp) continue;
      const run = t.slice(idx);
      if (!isValidRun(run)) continue;
      for (let d = 0; d < 7; d++) {
        if (d !== col && canToTableau(run[0], d)) return true;
      }
      break; // この列で最上位の表向きカードだけ調べれば十分
    }
  }
  // めくり札の各カード（山札を循環すれば到達可能）→ 組札 or 場札
  for (const card of state.waste) {
    if (canToFoundation(card)) return true;
    for (let d = 0; d < 7; d++) if (canToTableau(card, d)) return true;
  }
  return false;
}

function checkStuck() {
  if (state.won || state.lost) return;
  if (state.stock.length !== 0) return;   // 山札を一周し終えてから判定
  if (hasPlacement()) return;
  state.lost = true;
  stopTimer();
  say('stuck');
  setTimeout(showStuckResult, 700);
}

function showStuckResult() {
  const rows = document.getElementById('result-rows');
  rows.innerHTML = '';
  const add = (label, value) => {
    const row = document.createElement('div');
    row.className = 'result-row';
    row.innerHTML = `<span>${label}</span><span><strong>${value}</strong></span>`;
    rows.appendChild(row);
  };
  add('今回のスコア', state.score);
  add('経過タイム', fmtTime(state.elapsed));
  const stuckLines = charData.lines.solitaire.stuck;
  document.getElementById('result-title').textContent =
    (stuckLines && stuckLines[0]) || 'うーん、詰みかも…💦';
  document.getElementById('result-modal').classList.add('is-visible');
}

/* ---------------- ヒント ---------------- */
function findHint() {
  // 1) 組札へ動かせる手（waste / 各列の一番上）
  const tops = [];
  if (state.waste.length) tops.push({ src: { type: 'waste' }, card: state.waste[state.waste.length - 1] });
  for (let col = 0; col < 7; col++) {
    const t = state.tableau[col];
    if (t.length && t[t.length - 1].faceUp) tops.push({ src: { type: 'tableau', key: col, index: t.length - 1 }, card: t[t.length - 1] });
  }
  for (const o of tops) {
    if (canToFoundation(o.card)) return { src: o.src, card: o.card, dest: { type: 'foundation', key: o.card.suit } };
  }
  // 2) 場札 → 場札（裏向きカードを表に出せる手のみ提案。位置替えだけの無意味な手は除外）
  for (let col = 0; col < 7; col++) {
    const t = state.tableau[col];
    const idx = t.findIndex((c) => c.faceUp);
    if (idx === -1) continue;
    const run = t.slice(idx);
    if (!isValidRun(run)) continue;
    const reveals = idx > 0 && !t[idx - 1].faceUp;   // 移動で裏向きカードが表になる
    if (!reveals) continue;
    for (let d = 0; d < 7; d++) {
      if (d !== col && canToTableau(run[0], d)) {
        return { src: { type: 'tableau', key: col, index: idx }, card: run[0], dest: { type: 'tableau', col: d } };
      }
    }
  }
  // 3) waste → 場札
  if (state.waste.length) {
    const card = state.waste[state.waste.length - 1];
    for (let d = 0; d < 7; d++) if (canToTableau(card, d)) return { src: { type: 'waste' }, card, dest: { type: 'tableau', col: d } };
  }
  return null;
}

function showHint() {
  if (state.won || state.lost) return;
  say('hint');
  const hint = findHint();
  if (!hint) { say('stuck'); return; }
  render();
  const srcEl = document.querySelector(`.card[data-id="${hint.card.id}"]`);
  if (srcEl) srcEl.classList.add('is-hint-src');
  let dstEl = null;
  if (hint.dest.type === 'foundation') dstEl = document.querySelector(`.pile--foundation[data-suit="${hint.dest.key}"]`);
  else dstEl = document.querySelector(`.tableau-col[data-col="${hint.dest.col}"]`);
  if (dstEl) dstEl.classList.add('is-hint-dst');
  setTimeout(() => {
    document.querySelectorAll('.is-hint-src').forEach((e) => e.classList.remove('is-hint-src'));
    document.querySelectorAll('.is-hint-dst').forEach((e) => e.classList.remove('is-hint-dst'));
  }, 2200);
}

/* ---------------- 自動完成 ---------------- */
function allTableauFaceUp() {
  return state.tableau.every((col) => col.every((c) => c.faceUp));
}
function autoAvailable() {
  return !state.won && !state.lost && allTableauFaceUp() &&
    (state.stock.length > 0 || state.waste.length > 0 || state.tableau.some((c) => c.length > 0));
}
function stopAuto() {
  if (autoId) { clearInterval(autoId); autoId = null; }
  autoRunning = false;
}
function startAutoComplete() {
  if (autoId) return;
  autoRunning = true;
  say('auto_complete');
  let guard = 0;
  autoId = setInterval(() => {
    const candidates = [];
    if (state.waste.length) candidates.push({ type: 'waste', card: state.waste[state.waste.length - 1] });
    for (let col = 0; col < 7; col++) {
      const t = state.tableau[col];
      if (t.length) candidates.push({ type: 'tableau', key: col, index: t.length - 1, card: t[t.length - 1] });
    }
    for (const c of candidates) {
      if (canToFoundation(c.card)) { tryMove(c, { type: 'foundation', key: c.card.suit }); guard = 0; return; }
    }
    // 直接動かせない → 山札/めくり札を循環させて掘り出す
    if (state.stock.length > 0 || state.waste.length > 0) {
      guard++;
      if (guard > state.stock.length + state.waste.length + 2) { stopAuto(); return; }
      drawFromStock();
      return;
    }
    stopAuto();
  }, 140);
}

/* ---------------- 勝利判定 / リザルト ---------------- */
function checkWin() {
  if (SUITS.every((s) => state.foundations[s].length === 13)) {
    state.won = true;
    stopAuto();
    stopTimer();
    say('clear');
    setTimeout(showResult, 700);
  }
}

function scoreKey() { return `scores:solitaire:draw${state.drawMode}`; }

function showResult() {
  const elapsedSec = Math.floor(state.elapsed / 1000);
  const bonus = Math.max(0, 1000 - elapsedSec * 2);
  state.score += bonus;
  document.getElementById('score').textContent = state.score;

  const prev = Storage.get(scoreKey(), { best: 0, plays: 0, fastestTime: null, totalWins: 0, lastPlayed: null });
  const isBestScore = state.score > (prev.best || 0);
  const isFastest = prev.fastestTime == null || elapsedSec < prev.fastestTime;
  const rec = {
    best: Math.max(prev.best || 0, state.score),
    plays: prev.plays || 0,   // プレイ回数は新規開始時に加算済み
    fastestTime: isFastest ? elapsedSec : prev.fastestTime,
    totalWins: (prev.totalWins || 0) + 1,
    lastPlayed: new Date().toISOString(),
  };
  Storage.set(scoreKey(), rec);

  const rows = document.getElementById('result-rows');
  rows.innerHTML = '';
  const add = (label, value, best) => {
    const row = document.createElement('div');
    row.className = 'result-row' + (best ? ' is-best' : '');
    row.innerHTML = `<span>${label}</span><span><strong>${value}</strong>${best ? '<span class="badge">更新！</span>' : ''}</span>`;
    rows.appendChild(row);
  };
  add('今回のスコア', state.score, isBestScore);
  add('クリアタイム', fmtTime(state.elapsed), isFastest);
  add('クリアボーナス', '+' + bonus, false);
  add('ベストスコア', rec.best, false);
  add('最速タイム', fmtTime(rec.fastestTime * 1000), false);
  add('クリア回数', rec.totalWins, false);

  document.getElementById('result-title').textContent =
    (charData.lines.solitaire.clear && charData.lines.solitaire.clear[0]) || 'クリア！';
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
  idleId = setTimeout(() => { if (!state.won) say('idle'); }, IDLE_MS);
}

/* ---------------- 描画 ---------------- */
function makeCardEl(card) {
  const el = document.createElement('div');
  el.className = 'card ' + (isRed(card) ? 'is-red' : 'is-black');
  el.dataset.id = card.id;
  if (!card.faceUp) { el.classList.add('is-down'); return el; }
  const r = rankStr(card.rank), s = SUIT_SYM[card.suit];
  // 絵札（J/Q/K）は中央にキャラ立ち絵、それ以外は大きなスート記号
  let center;
  if (isFace(card.rank) && FACE_CHAR[card.suit]) {
    el.classList.add('card--face');
    center = `<div class="card__center"><img class="card__face-img" alt="" src="${ROOT}assets/images/characters/${FACE_CHAR[card.suit]}"></div>`;
  } else {
    center = `<div class="card__center">${s}</div>`;
  }
  el.innerHTML =
    `<div class="card__corner card__corner--tl">${r}<span class="suit">${s}</span></div>` +
    center +
    `<div class="card__corner card__corner--br">${r}<span class="suit">${s}</span></div>`;
  return el;
}

function render() {
  clearDragLayer(); // 取り残された浮遊カードの掃除（保険）
  // 山札
  const stockEl = document.getElementById('stock');
  stockEl.innerHTML = '';
  if (state.stock.length) stockEl.appendChild(makeCardEl({ suit: 'S', rank: 0, faceUp: false, id: 'stockback' }));

  // めくり札（Draw3は最大3枚を横にずらす）
  const wasteEl = document.getElementById('waste');
  wasteEl.innerHTML = '';
  const showN = state.drawMode === 3 ? 3 : 1;
  const start = Math.max(0, state.waste.length - showN);
  for (let i = start; i < state.waste.length; i++) {
    const card = state.waste[i];
    const el = makeCardEl(card);
    el.style.left = (i - start) * 30 + 'px';
    if (i === state.waste.length - 1) el.classList.add('is-draggable');
    wasteEl.appendChild(el);
  }

  // 組札
  for (const s of SUITS) {
    const pile = document.querySelector(`.pile--foundation[data-suit="${s}"]`);
    pile.innerHTML = '';
    const f = state.foundations[s];
    pile.dataset.symbol = f.length ? '' : SUIT_SYM[s];
    if (f.length) { const el = makeCardEl(f[f.length - 1]); el.classList.add('is-draggable'); pile.appendChild(el); }
  }

  // 場札
  const tab = document.getElementById('tableau');
  tab.innerHTML = '';
  for (let col = 0; col < 7; col++) {
    const colEl = document.createElement('div');
    colEl.className = 'tableau-col';
    colEl.dataset.col = col;
    colEl.dataset.pile = 'tableau';
    let top = 0;
    const cards = state.tableau[col];
    for (let i = 0; i < cards.length; i++) {
      const el = makeCardEl(cards[i]);
      el.style.top = top + 'px';
      if (cards[i].faceUp) el.classList.add('is-draggable');
      colEl.appendChild(el);
      top += cards[i].faceUp ? 30 : 14;
    }
    tab.appendChild(colEl);
  }

  document.getElementById('score').textContent = state.score;
  applySelectionHighlight();
  updateButtons();
}

function applySelectionHighlight() {
  document.querySelectorAll('.card.is-selected').forEach((e) => e.classList.remove('is-selected'));
  if (!selection) return;
  const cards = movingCards(selection);
  cards.forEach((c) => { const el = document.querySelector(`.card[data-id="${c.id}"]`); if (el) el.classList.add('is-selected'); });
}

function updateButtons() {
  document.getElementById('btn-undo').disabled = state.history.length === 0;
  document.getElementById('btn-auto').hidden = !autoAvailable();
}

/* ---------------- クリック移動 / 選択 ---------------- */
function pileFromElement(el) {
  const pileEl = el.closest('[data-pile]');
  if (!pileEl) return null;
  const type = pileEl.dataset.pile;
  if (type === 'foundation') return { type: 'foundation', key: pileEl.dataset.suit };
  if (type === 'tableau') return { type: 'tableau', col: Number(pileEl.dataset.col) };
  return { type };
}

function handleCardClick(id, el) {
  const loc = locate(id);
  if (!selection) {
    if (loc && loc.movable) { selection = { type: loc.type, key: loc.key, index: loc.index }; applySelectionHighlight(); }
    return;
  }
  // 選択済み → このカードのある場所を移動先に
  const destPile = pileFromElement(el);
  if (destPile && tryMoveToPile(destPile)) return;
  // 失敗したら選択し直し
  selection = (loc && loc.movable) ? { type: loc.type, key: loc.key, index: loc.index } : null;
  applySelectionHighlight();
}

function tryMoveToPile(destPile) {
  if (!selection) return false;
  let dest;
  if (destPile.type === 'foundation') dest = { type: 'foundation', key: destPile.key };
  else if (destPile.type === 'tableau') dest = { type: 'tableau', key: destPile.col };
  else return false;
  return tryMove(selection, dest);
}

/* ---------------- ドラッグ&ドロップ ---------------- */
let drag = null;

function clearDragLayer() {
  const dl = document.getElementById('drag-layer');
  if (dl) dl.remove();
}

function finishDrag() {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerCancel);
  clearDragLayer();
}

function onPointerDown(e) {
  if (drag || state.won || state.lost) return; // 多重ドラッグ・終了後を防止
  const cardEl = e.target.closest('.card');
  if (!cardEl || !cardEl.classList.contains('is-draggable')) return;
  const id = cardEl.dataset.id;
  const loc = locate(id);
  if (!loc || !loc.movable) return;
  const cards = movingCards(loc);
  const rect = cardEl.getBoundingClientRect();
  drag = {
    src: { type: loc.type, key: loc.key, index: loc.index },
    cards, startX: e.clientX, startY: e.clientY,
    offX: e.clientX - rect.left, offY: e.clientY - rect.top,
    moved: false, id,
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
}

function beginDragLayer() {
  clearDragLayer(); // 念のため古い残骸を除去
  const layer = document.createElement('div');
  layer.id = 'drag-layer';
  let top = 0;
  drag.cards.forEach((c) => {
    const el = makeCardEl(c);
    el.style.position = 'absolute';
    el.style.top = top + 'px';
    el.style.left = '0px';
    layer.appendChild(el);
    top += 30;
  });
  document.body.appendChild(layer);
  drag.layer = layer;
  drag.cards.forEach((c) => { const el = document.querySelector(`.card[data-id="${c.id}"]`); if (el) el.style.opacity = '0.25'; });
}

function onPointerMove(e) {
  if (!drag) return;
  if (!drag.moved) {
    if (Math.abs(e.clientX - drag.startX) < 5 && Math.abs(e.clientY - drag.startY) < 5) return;
    drag.moved = true;
    beginDragLayer();
  }
  drag.layer.style.transform = `translate(${e.clientX - drag.offX}px, ${e.clientY - drag.offY}px)`;
}

function onPointerCancel() {
  if (!drag) { finishDrag(); return; }
  drag = null;
  finishDrag();
  render();
}

function onPointerUp(e) {
  if (!drag) { finishDrag(); return; }
  const d = drag;
  drag = null;
  finishDrag(); // リスナー解除＋浮遊カード除去

  if (!d.moved) {
    handleCardClick(d.id, document.querySelector(`.card[data-id="${d.id}"]`) || e.target);
    return;
  }

  // ドロップ先判定（浮遊カードは既に除去済み）
  const els = document.elementsFromPoint(e.clientX, e.clientY);
  let destPile = null;
  for (const el of els) {
    const p = el.closest && el.closest('[data-pile]');
    if (p) { destPile = pileFromElement(p); break; }
  }
  if (destPile) {
    let dest = null;
    if (destPile.type === 'foundation') dest = { type: 'foundation', key: destPile.key };
    else if (destPile.type === 'tableau') dest = { type: 'tableau', key: destPile.col };
    if (dest && tryMove(d.src, dest)) return;
  }
  render(); // 失敗 → 元に戻す
}

/* ---------------- 新規ゲーム ---------------- */
function newGame(drawMode) {
  state.drawMode = drawMode;
  deal();
  selection = null;
  // プレイ回数カウント
  const rec = Storage.get(scoreKey(), { best: 0, plays: 0, fastestTime: null, totalWins: 0, lastPlayed: null });
  rec.plays = (rec.plays || 0) + 1;
  rec.lastPlayed = new Date().toISOString();
  Storage.set(scoreKey(), rec);
  render();
  startTimer();
  resetIdle();
  say('start');
}

function openDrawModal() { document.getElementById('draw-modal').classList.add('is-visible'); }
function closeDrawModal() { document.getElementById('draw-modal').classList.remove('is-visible'); }

/* ---------------- 初期化 ---------------- */
async function init() {
  messageWindow.init();
  selectedId = Storage.get('selectedCharacter', 'mia');
  try {
    charData = await Characters.load(selectedId, ROOT + 'characters/');
  } catch (_) {
    try { charData = await Characters.load('mia', ROOT + 'characters/'); }
    catch (e) { console.error(e); }
  }
  if (charData) renderChar();

  // ボタン
  document.getElementById('btn-new').addEventListener('click', openDrawModal);
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-hint').addEventListener('click', showHint);
  document.getElementById('btn-auto').addEventListener('click', startAutoComplete);
  document.getElementById('btn-again').addEventListener('click', () => {
    document.getElementById('result-modal').classList.remove('is-visible');
    newGame(state.drawMode);
  });
  document.getElementById('char-portrait').addEventListener('click', () => say('idle'));

  // Draw モーダル
  document.querySelectorAll('[data-draw]').forEach((btn) => {
    btn.addEventListener('click', () => { closeDrawModal(); newGame(Number(btn.dataset.draw)); });
  });

  // 盤面操作
  const board = document.getElementById('board');
  board.addEventListener('pointerdown', onPointerDown);
  document.getElementById('stock').addEventListener('click', (e) => { if (!drag || !drag.moved) drawFromStock(); });
  board.addEventListener('dblclick', (e) => {
    const c = e.target.closest('.card');
    if (c && c.closest('#stock')) return;
    if (c) autoToFoundation(c.dataset.id);
  });
  board.addEventListener('contextmenu', (e) => { e.preventDefault(); showHint(); });
  // 空の置き場へのクリック移動（カード以外のパイル領域）
  board.addEventListener('click', (e) => {
    if (!selection) return;
    if (e.target.closest('.card')) return;
    const pile = pileFromElement(e.target);
    if (pile) tryMoveToPile(pile);
  });

  openDrawModal(); // 起動時にモード選択
}

document.addEventListener('DOMContentLoaded', init);
