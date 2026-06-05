'use strict';

/* ============================================================
   ブロックくずし（Canvas）
   ============================================================ */

const ROOT = '../../';
const IDLE_MS = 30000;

const CANVAS_W = 960, CANVAS_H = 640;
const COLS = 18;                            // 横半分にしたうえで縦横比を整える
const BLOCK_GAP = 3, BLOCK_VGAP = 6, BLOCK_TOP = 80, BLOCK_SIDE = 80; // キャンバス端と外側ブロックの余白
const BLOCK_W = (CANVAS_W - BLOCK_SIDE * 2 - BLOCK_GAP * (COLS - 1)) / COLS;
const BLOCK_H = 24;

/* ---- 強打（Strike）関連 ---- */
const STRIKE_WINDOW_MS = 100;     // パドル接触±0.1秒
const STRIKE_DURATION_MS = 500;   // 強打の効果時間
const STRIKE_SPEED_MULT = 1.7;    // 速度倍率
const STRIKE_DIALOG_COOLDOWN_MS = 3000;

const PADDLE_BASE_W = 120, PADDLE_BIG_W = 180, PADDLE_SMALL_W = 80;
const PADDLE_H = 14, PADDLE_Y = CANVAS_H - 50;
const PADDLE_SPEED = 720; // px/s

const BALL_R_BASE = 8, BALL_R_BIG = 14;
const BALL_SPEED_BASE = 380, BALL_SPEED_FAST = 540, BALL_SPEED_SLOW = 260;
const BALL_MAX_VX_RATIO = 0.75; // パドル端で跳ね返した時の vx 上限割合

const ITEM_W = 26, ITEM_H = 14, ITEM_VY = 160;
const ITEM_DROP_FROM_NORMAL = 0.05;
const EFFECT_MS = 10000;

const ITEM_TYPES = [
  'paddle_expand', 'multiball', 'ball_fast', 'ball_slow', 'penetrating',
  'extra_life', 'sticky', 'barrier', 'paddle_shrink', 'ball_big',
];

const BLOCK_COLORS = {
  N: ['#F7A8C4', '#A8D8F0', '#FFE08A', '#A8E0C0', '#D6B8F0'],
  H: ['#A4BCE0', '#7E97B8'],          // HP=2,1
  h: ['#B7A6CE', '#CCBADC', '#E0CFEC'], // HP=3,2,1（暗背景向けに明るめ）
  I: '#4FD8E8',                        // ステージのパレットと被らない鮮やかシアン
  X: '#5E5466',                        // 暗背景でも視認できる程度
};

const SCORE = { N: 10, H: 30, h: 30, I: 20, COMBO_STEP: 5, COMBO_MAX: 50,
  LIFE_BONUS: 500, STAGE_BONUS: 1000, ALL_CLEAR_BONUS: 5000 };

/* ---------------- 状態 ---------------- */
const state = {
  mode: 'arcade',          // 'arcade' | 'free'
  lifeMode: '3',           // '3' | '1' | 'inf'
  stage: 1,
  lives: 3,
  score: 0,
  combo: 0,
  maxCombo: 0,
  blocksBrokenTotal: 0,
  paddle: { x: CANVAS_W / 2 - PADDLE_BASE_W / 2, w: PADDLE_BASE_W },
  balls: [],
  blocks: [],
  items: [],
  particles: [],
  effect: null,           // { type, until }  併用不可・常に1スロット
  barrier: false,         // 別状態（取得時にエフェクトスロットも上書きはしない）
  sticky: false,          // 別状態（エフェクトと連動）
  penetrating: false,
  ballSpeed: BALL_SPEED_BASE,
  paddleWTarget: PADDLE_BASE_W,
  ballBig: false,
  launched: false,
  awaitingLaunch: false,  // ボールがパドル上にいる状態
  stageStartTime: 0,
  stageElapsed: 0,
  runStartTime: 0,        // アーケード総タイム
  runElapsed: 0,
  paused: false,
  ended: false,
  won: false,             // ステージ/アーケード完遂

  /* ---- 強打 ---- */
  lastSpaceTime: 0,
  lastPaddleHitTime: 0,
  lastPaddleHitBall: null,
  paddleFlashUntil: 0,
  lastStrikeDialog: 0,
  floatTexts: [],
};

let canvas, ctx;
let rafId = null;
let lastT = 0;
let charData = null;
let selectedId = 'mia';
let modalChoice = { mode: 'arcade', life: '3' };
let idleId = null;
const keys = { left: false, right: false };

/* ---------------- キャラ／メッセージ ---------------- */
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
    this.fullText = text; this.textEl.textContent = '';
    this.el.classList.add('is-visible');
    let i = 0; this.isTyping = true;
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
  const lines = charData && charData.lines.breakout && charData.lines.breakout[scene];
  if (lines && lines.length) messageWindow.show(Characters.pickRandom(lines));
}

function renderChar() {
  const img = document.getElementById('char-img');
  const fb = document.getElementById('char-fallback');
  fb.textContent = charData.emoji || '🐈';
  fb.hidden = true;
  img.onload = () => { img.hidden = false; fb.hidden = true; };
  img.onerror = () => { img.hidden = true; fb.hidden = false; };
  img.src = ROOT + charData.image.portrait;
}

/* ---------------- ステージ / 盤面構築 ---------------- */
function buildStage(n) {
  const def = STAGES[n - 1];
  const palette = def.palette || BLOCK_COLORS.N;
  state.blocks = [];
  def.rows.forEach((row, ri) => {
    for (let ci = 0; ci < COLS; ci++) {
      const ch = row[ci];
      if (!ch || ch === '.') continue;
      const x = BLOCK_SIDE + ci * (BLOCK_W + BLOCK_GAP);
      const y = BLOCK_TOP + ri * (BLOCK_H + BLOCK_VGAP);
      let hp = 1;
      if (ch === 'H') hp = 2;
      else if (ch === 'h') hp = 3;
      else if (ch === 'X') hp = Infinity;
      // ステージのパレットから位置依存で色を決定。
      // N: そのまま使う／H,h: HP=1になった時に同じ色で表示するため weakColor として保持
      const paletteColor = palette[(ri + ci) % palette.length];
      const color = ch === 'N' ? paletteColor : null;
      const weakColor = (ch === 'H' || ch === 'h') ? paletteColor : null;
      state.blocks.push({ x, y, w: BLOCK_W, h: BLOCK_H, type: ch, hp, alive: true, color, weakColor });
    }
  });
}

function aliveCount() {
  let n = 0;
  for (const b of state.blocks) if (b.alive && b.type !== 'X') n++;
  return n;
}

function breakablePresent() { return aliveCount() > 0; }

/* ---------------- パドル／ボール初期化 ---------------- */
function resetPaddle() {
  state.paddle.w = PADDLE_BASE_W;
  state.paddleWTarget = PADDLE_BASE_W;
  state.paddle.x = CANVAS_W / 2 - state.paddle.w / 2;
}
function newBallOnPaddle() {
  return {
    x: state.paddle.x + state.paddle.w / 2,
    y: PADDLE_Y - BALL_R_BASE - 2,
    vx: 0, vy: 0, r: state.ballBig ? BALL_R_BIG : BALL_R_BASE,
    stuck: true,
  };
}
function resetBalls() {
  state.balls = [newBallOnPaddle()];
  state.awaitingLaunch = true;
  state.launched = false;
}

/* ---------------- 効果 ---------------- */
function clearEffect() {
  // 現在の効果を打ち消す（時限効果のみ。barrier/multiballは別状態）
  state.paddleWTarget = PADDLE_BASE_W;
  state.ballSpeed = BALL_SPEED_BASE;
  state.penetrating = false;
  state.sticky = false;
  state.ballBig = false;
  // ボール半径も戻す
  for (const b of state.balls) b.r = BALL_R_BASE;
  state.effect = null;
  // パドルが狭くなる場合 x位置を調整しないと右端越境するが描画で clamp する
}
function applyEffect(type) {
  // 「全部上書き・併用不可」: 時限効果のスロットを更新する
  clearEffect();
  const now = performance.now();
  switch (type) {
    case 'paddle_expand': state.paddleWTarget = PADDLE_BIG_W; state.effect = { type, until: now + EFFECT_MS }; break;
    case 'paddle_shrink': state.paddleWTarget = PADDLE_SMALL_W; state.effect = { type, until: now + EFFECT_MS }; break;
    case 'ball_fast':     state.ballSpeed = BALL_SPEED_FAST;   state.effect = { type, until: now + EFFECT_MS }; rescaleBallSpeeds(); break;
    case 'ball_slow':     state.ballSpeed = BALL_SPEED_SLOW;   state.effect = { type, until: now + EFFECT_MS }; rescaleBallSpeeds(); break;
    case 'penetrating':   state.penetrating = true;            state.effect = { type, until: now + EFFECT_MS }; break;
    case 'sticky':        state.sticky = true;                 state.effect = { type, until: now + EFFECT_MS }; break;
    case 'ball_big':      state.ballBig = true; for (const b of state.balls) b.r = BALL_R_BIG; state.effect = { type, until: now + EFFECT_MS }; break;
    case 'multiball':     spawnMultiball(); break; // スロット占有しない
    case 'barrier':       state.barrier = true; break;          // スロット占有しない
    case 'extra_life':    if (state.lifeMode !== 'inf') state.lives++; break; // 即時
  }
}
function rescaleBallSpeeds() {
  for (const b of state.balls) {
    if (b.stuck) continue;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const k = state.ballSpeed / sp;
    b.vx *= k; b.vy *= k;
  }
}
function spawnMultiball() {
  const moving = state.balls.filter((b) => !b.stuck);
  const seed = moving[0] || state.balls[0];
  if (!seed) return;
  const speed = state.ballSpeed;
  const angles = [-Math.PI / 6, Math.PI / 6];
  for (const a of angles) {
    const baseA = Math.atan2(seed.vy || -1, seed.vx || 0);
    const na = baseA + a;
    state.balls.push({ x: seed.x, y: seed.y, vx: Math.cos(na) * speed, vy: Math.sin(na) * speed,
      r: state.ballBig ? BALL_R_BIG : BALL_R_BASE, stuck: false });
  }
}

/* ---------------- アイテム ---------------- */
function spawnItemAt(x, y) {
  const type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
  state.items.push({ x: x - ITEM_W / 2, y: y, vy: ITEM_VY, type });
}

/* ---------------- 物理 & 衝突 ---------------- */
function updatePaddle(dt) {
  const dir = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
  state.paddle.x += dir * PADDLE_SPEED * dt;
  // パドル幅を目標値に滑らかに寄せる（イージング）
  state.paddle.w += (state.paddleWTarget - state.paddle.w) * Math.min(1, dt * 12);
  state.paddle.x = Math.max(0, Math.min(CANVAS_W - state.paddle.w, state.paddle.x));
}

function launchBall() {
  const b = state.balls[0];
  if (!b) return;
  // 軽くランダムな角度で発射（垂直に近い）
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
  b.vx = Math.cos(angle) * state.ballSpeed;
  b.vy = Math.sin(angle) * state.ballSpeed;
  b.stuck = false;
  state.awaitingLaunch = false;
  state.launched = true;
  if (state.stageStartTime === 0) state.stageStartTime = performance.now();
  if (state.mode === 'arcade' && state.runStartTime === 0) state.runStartTime = performance.now();
  say('ball_launch');
}

/* Space キーの統合ハンドラ: 発射 / スティッキー解放 / 強打タイミング */
function onSpace() {
  if (state.ended) return;
  if (state.awaitingLaunch) { launchBall(); return; }
  // スティッキー吸着中のボールがあれば離す
  for (const b of state.balls) if (b.stuck) { releaseStuckBall(b); return; }
  // 強打タイミング判定（パドル接触±0.1秒）
  const now = performance.now();
  if (state.lastPaddleHitTime && now - state.lastPaddleHitTime <= STRIKE_WINDOW_MS && state.lastPaddleHitBall) {
    triggerStrike(state.lastPaddleHitBall);
    state.lastPaddleHitTime = 0;
    return;
  }
  // まだパドルに当たってない → 次回のために押下時刻を記録
  state.lastSpaceTime = now;
}

function triggerStrike(b) {
  if (!b || b.stuck) return;
  const now = performance.now();
  b.strikeUntil = now + STRIKE_DURATION_MS;
  b.vx *= STRIKE_SPEED_MULT;
  b.vy *= STRIKE_SPEED_MULT;
  state.paddleFlashUntil = now + 250;
  state.floatTexts.push({ text: 'Strike!', x: b.x, y: b.y - 30, life: 0.7, max: 0.7 });
  if (now - state.lastStrikeDialog >= STRIKE_DIALOG_COOLDOWN_MS) {
    state.lastStrikeDialog = now;
    say('strike');
  }
}
function releaseStuckBall(b) {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
  b.vx = Math.cos(angle) * state.ballSpeed;
  b.vy = Math.sin(angle) * state.ballSpeed;
  b.stuck = false;
}

function updateBalls(dt) {
  // 吸着中ボールはパドル位置に追従
  for (const b of state.balls) {
    if (b.stuck) {
      b.x = state.paddle.x + state.paddle.w / 2;
      b.y = PADDLE_Y - b.r - 2;
    }
  }
  // 移動・衝突
  for (const b of state.balls) {
    if (b.stuck) continue;
    b.x += b.vx * dt; b.y += b.vy * dt;
    // 壁
    if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); }
    if (b.x + b.r > CANVAS_W) { b.x = CANVAS_W - b.r; b.vx = -Math.abs(b.vx); }
    if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); }
    // パドル
    if (b.vy > 0 && b.y + b.r >= PADDLE_Y && b.y - b.r <= PADDLE_Y + PADDLE_H) {
      if (b.x >= state.paddle.x && b.x <= state.paddle.x + state.paddle.w) {
        if (state.sticky) {
          b.stuck = true; b.vx = 0; b.vy = 0;
          b.y = PADDLE_Y - b.r - 2;
        } else {
          b.y = PADDLE_Y - b.r;
          const hitOffset = (b.x - (state.paddle.x + state.paddle.w / 2)) / (state.paddle.w / 2);
          const sp = Math.hypot(b.vx, b.vy) || state.ballSpeed;
          b.vx = hitOffset * sp * BALL_MAX_VX_RATIO;
          b.vy = -Math.sqrt(Math.max(sp * sp - b.vx * b.vx, sp * sp * 0.25));
        }
        state.combo = 0;
        updateComboDisplay();
        // 強打：パドル接触±0.1秒以内にSpaceが押されていれば成功
        const now = performance.now();
        state.lastPaddleHitTime = now;
        state.lastPaddleHitBall = b;
        if (state.lastSpaceTime && now - state.lastSpaceTime <= STRIKE_WINDOW_MS) {
          triggerStrike(b);
          state.lastSpaceTime = 0;
        }
      }
    }
    // 強打効果の期限切れ → 速度を通常値に戻す（方向は維持）
    if (b.strikeUntil && performance.now() >= b.strikeUntil) {
      b.strikeUntil = 0;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const k = state.ballSpeed / sp;
      b.vx *= k; b.vy *= k;
    }
    // 強打中のキラキラ軌跡
    if (b.strikeUntil && Math.random() < 0.6) {
      state.particles.push({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 60, vy: 30 + Math.random() * 40,
        life: 0.35, r: 2 + Math.random() * 2, c: 'hsla(50,95%,75%,1)' });
    }
    // ブロック
    collideBallWithBlocks(b);
  }
  // 画面下に落ちたボールを処理
  for (let i = state.balls.length - 1; i >= 0; i--) {
    const b = state.balls[i];
    if (b.y - b.r > CANVAS_H) {
      if (state.balls.length > 1) { state.balls.splice(i, 1); continue; }
      // 最後のボール → バリアで救済 or ライフ消費
      if (state.barrier) {
        state.barrier = false;
        b.y = PADDLE_Y - b.r - 4;
        b.vy = -Math.abs(b.vy || state.ballSpeed);
        if (b.vx === 0) b.vx = (Math.random() - 0.5) * state.ballSpeed;
        continue;
      }
      state.balls.splice(i, 1);
      onBallLost();
    }
  }
}

function collideBallWithBlocks(b) {
  // 1フレーム内で複数ブロックと当たり得るので近接順に処理
  const penetrating = state.penetrating || (b.strikeUntil && b.strikeUntil > performance.now());
  for (let i = 0; i < state.blocks.length; i++) {
    const blk = state.blocks[i];
    if (!blk.alive) continue;
    const cx = clamp(b.x, blk.x, blk.x + blk.w);
    const cy = clamp(b.y, blk.y, blk.y + blk.h);
    const dx = b.x - cx, dy = b.y - cy;
    if (dx * dx + dy * dy > b.r * b.r) continue;
    // 衝突 → ヒット
    hitBlock(blk, b);
    // 貫通中でも消えないブロックは反射させる
    const passThrough = penetrating && blk.type !== 'X';
    if (!passThrough) {
      // 跳ね返し方向：x方向 vs y方向の侵入量で判定
      const overlapX = b.r - Math.abs(dx);
      const overlapY = b.r - Math.abs(dy);
      if (overlapY < overlapX) {
        b.vy = dy < 0 ? -Math.abs(b.vy) : Math.abs(b.vy);
        b.y += dy < 0 ? -overlapY : overlapY;
      } else {
        b.vx = dx < 0 ? -Math.abs(b.vx) : Math.abs(b.vx);
        b.x += dx < 0 ? -overlapX : overlapX;
      }
      break; // 1フレーム1回反射
    }
  }
}

function clamp(v, a, c) { return Math.max(a, Math.min(c, v)); }

function hitBlock(blk, ball) {
  if (blk.type === 'X') {
    // 反射のみ。コンボは継続。
    return;
  }
  blk.hp--;
  if (blk.hp > 0) {
    // 硬いブロックの途中ヒット：スコアなし／コンボ継続
    spawnParticles(blk.x + blk.w / 2, blk.y + blk.h / 2, 4);
    return;
  }
  // 破壊
  blk.alive = false;
  state.blocksBrokenTotal++;
  let pts = 0;
  if (blk.type === 'N') pts = SCORE.N;
  else if (blk.type === 'H' || blk.type === 'h') pts = SCORE.H;
  else if (blk.type === 'I') pts = SCORE.I;
  state.score += pts;
  state.combo++;
  if (state.combo > state.maxCombo) state.maxCombo = state.combo;
  const cb = Math.min(SCORE.COMBO_STEP * state.combo, SCORE.COMBO_MAX);
  state.score += cb;
  updateHud();
  spawnParticles(blk.x + blk.w / 2, blk.y + blk.h / 2, 12);
  // ダイアログ：10個ごと / コンボ10 / 残り1個
  if (state.blocksBrokenTotal % 10 === 0) say('blocks_10');
  if (state.combo === 10) say('combo');
  if (aliveCount() === 1) say('almost_clear');
  // アイテム落下
  if (blk.type === 'I') spawnItemAt(blk.x + blk.w / 2, blk.y + blk.h / 2);
  else if (blk.type === 'N' && Math.random() < ITEM_DROP_FROM_NORMAL) spawnItemAt(blk.x + blk.w / 2, blk.y + blk.h / 2);
  // ステージクリア判定
  if (aliveCount() === 0) onStageClear();
}

function updateItems(dt) {
  for (let i = state.items.length - 1; i >= 0; i--) {
    const it = state.items[i];
    it.y += it.vy * dt;
    // パドル捕獲
    if (it.y + ITEM_H >= PADDLE_Y && it.y <= PADDLE_Y + PADDLE_H) {
      if (it.x + ITEM_W >= state.paddle.x && it.x <= state.paddle.x + state.paddle.w) {
        applyEffect(it.type);
        state.items.splice(i, 1);
        continue;
      }
    }
    if (it.y > CANVAS_H) state.items.splice(i, 1);
  }
}

function updateEffect(now) {
  if (state.effect && now >= state.effect.until) {
    clearEffect();
  }
}

function spawnParticles(x, y, n) {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 80 + Math.random() * 120;
    state.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 30, life: 0.5, r: 2 + Math.random() * 2,
      c: `hsla(${Math.floor(330 + Math.random() * 40)},80%,75%,1)` });
  }
}
function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 240 * dt; p.life -= dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function updateFloatTexts(dt) {
  for (let i = state.floatTexts.length - 1; i >= 0; i--) {
    const t = state.floatTexts[i];
    t.y -= 60 * dt; t.life -= dt;
    if (t.life <= 0) state.floatTexts.splice(i, 1);
  }
}

/* ---------------- イベント ---------------- */
function onBallLost() {
  say('ball_lost');
  state.combo = 0;
  if (state.lifeMode === 'inf') {
    resetBalls();
    return;
  }
  state.lives--;
  if (state.lives <= 0) {
    gameOver();
  } else {
    resetBalls();
  }
  updateHud();
}

function onStageClear() {
  // ステージクリアボーナス
  state.score += SCORE.STAGE_BONUS;
  if (state.lifeMode !== 'inf') state.score += state.lives * SCORE.LIFE_BONUS;
  state.stageElapsed = performance.now() - (state.stageStartTime || performance.now());
  say('stage_clear');
  if (state.mode === 'free') {
    state.ended = true; state.won = true;
    setTimeout(() => showResult({ kind: 'stage_clear' }), 700);
    return;
  }
  // アーケード：次へ
  if (state.stage >= STAGES.length) {
    state.score += SCORE.ALL_CLEAR_BONUS;
    state.runElapsed = performance.now() - (state.runStartTime || performance.now());
    state.ended = true; state.won = true;
    say('all_clear');
    setTimeout(() => showResult({ kind: 'all_clear' }), 700);
    return;
  }
  state.stage++;
  // 効果リセット → 次ステージ開始
  clearEffect();
  state.items = []; state.particles = [];
  state.stageStartTime = 0;
  setTimeout(() => { buildStage(state.stage); resetBalls(); updateHud(); }, 700);
}

function gameOver() {
  state.ended = true;
  state.won = false;
  state.runElapsed = performance.now() - (state.runStartTime || performance.now());
  say('gameover');
  setTimeout(() => showResult({ kind: 'gameover' }), 800);
}

/* ---------------- 描画 ---------------- */
function drawScene() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  // 背景はCSSなので透明クリア。微妙なグリッド模様だけ追加可能だが省略。

  // ブロック
  for (const b of state.blocks) {
    if (!b.alive) continue;
    drawBlock(b);
  }
  // パドル
  drawPaddle();
  // バリア表示
  if (state.barrier) {
    ctx.fillStyle = 'rgba(168, 216, 240, 0.55)';
    ctx.fillRect(0, PADDLE_Y + PADDLE_H + 8, CANVAS_W, 6);
  }
  // ボール
  for (const b of state.balls) drawBall(b);
  // アイテム
  for (const it of state.items) drawItem(it);
  // パーティクル
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 発射待ちのガイド
  if (state.awaitingLaunch) {
    ctx.fillStyle = 'rgba(240,230,240,0.85)';
    ctx.font = 'bold 18px "Hiragino Maru Gothic ProN", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Space で発射っ！', CANVAS_W / 2, PADDLE_Y - 40);
  }
  // フロート文字（Strike! など）
  for (const t of state.floatTexts) {
    const a = Math.max(0, t.life / t.max);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = 'bold 28px "Hiragino Maru Gothic ProN", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255,210,90,0.9)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#FFE680';
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }
  // 効果残り時間
  if (state.effect) {
    const left = Math.max(0, state.effect.until - performance.now());
    const ratio = left / EFFECT_MS;
    ctx.fillStyle = 'rgba(247,168,196,0.95)';
    ctx.fillRect(BLOCK_SIDE, 12, (CANVAS_W - BLOCK_SIDE * 2) * ratio, 4);
    ctx.fillStyle = 'rgba(240,230,240,0.9)';
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('効果: ' + effectLabel(state.effect.type), BLOCK_SIDE, 30);
  }
}
function effectLabel(t) {
  return ({ paddle_expand: 'パドル拡張', paddle_shrink: 'パドル縮小', ball_fast: 'ボール加速',
    ball_slow: 'ボール減速', penetrating: '貫通弾', sticky: 'スティッキー', ball_big: 'ボール巨大化' })[t] || t;
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawBlock(b) {
  // 硬いブロック（HP>1）: 角ばった立体的なメタル風
  if ((b.type === 'H' || b.type === 'h') && b.hp > 1) {
    const base = b.type === 'h' ? '#8C7F9C' : '#7E97B8';
    ctx.fillStyle = base;
    roundRect(ctx, b.x, b.y, b.w, b.h, 2); ctx.fill();
    // エンボス：上＆左に光、下＆右に影
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, 2);
    ctx.fillRect(b.x + 2, b.y + 4, 2, b.h - 8);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(b.x + 2, b.y + b.h - 4, b.w - 4, 2);
    ctx.fillRect(b.x + b.w - 4, b.y + 4, 2, b.h - 8);
    return;
  }
  // 通常 / アイテム / 消えない / 硬いブロックのHP=1 → 普通ブロックと同じ見た目
  let color;
  if (b.type === 'I') color = BLOCK_COLORS.I;
  else if (b.type === 'X') color = BLOCK_COLORS.X;
  else color = b.color || b.weakColor;
  ctx.fillStyle = color;
  roundRect(ctx, b.x, b.y, b.w, b.h, 6); ctx.fill();
  // ハイライト
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  roundRect(ctx, b.x + 2, b.y + 2, b.w - 4, 4, 3); ctx.fill();
  if (b.type === 'I') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('★', b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }
  if (b.type === 'X') {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x + 4, b.y + 4); ctx.lineTo(b.x + b.w - 4, b.y + b.h - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.x + b.w - 4, b.y + 4); ctx.lineTo(b.x + 4, b.y + b.h - 4); ctx.stroke();
  }
}
function drawPaddle() {
  const now = performance.now();
  const flashing = state.paddleFlashUntil > now;
  if (flashing) {
    // 強打成功時の光彩
    ctx.save();
    ctx.shadowColor = '#FFE680';
    ctx.shadowBlur = 28;
    ctx.fillStyle = '#FFEAA0';
    roundRect(ctx, state.paddle.x - 3, PADDLE_Y - 3, state.paddle.w + 6, PADDLE_H + 6, 10); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = flashing ? '#FFD0E5' : '#F7A8C4';
  roundRect(ctx, state.paddle.x, PADDLE_Y, state.paddle.w, PADDLE_H, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  roundRect(ctx, state.paddle.x + 4, PADDLE_Y + 2, state.paddle.w - 8, 4, 3); ctx.fill();
}
function drawBall(b) {
  ctx.fillStyle = state.penetrating ? '#FFD15B' : 'white';
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(90,74,79,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
}
function drawItem(it) {
  ctx.fillStyle = '#FFD15B';
  roundRect(ctx, it.x, it.y, ITEM_W, ITEM_H, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('?', it.x + ITEM_W / 2, it.y + ITEM_H / 2);
  ctx.textBaseline = 'alphabetic';
}

/* ---------------- HUD ---------------- */
function updateHud() {
  document.getElementById('score').textContent = state.score;
  document.getElementById('lives').textContent =
    state.lifeMode === 'inf' ? '∞' : '♥'.repeat(Math.max(0, state.lives));
  updateComboDisplay();
  if (state.mode === 'arcade') {
    document.getElementById('stage-stat').hidden = false;
    document.getElementById('stage').textContent = state.stage + ' / ' + STAGES.length;
  } else {
    document.getElementById('stage-stat').hidden = false;
    document.getElementById('stage').textContent = String(state.stage);
  }
}
function updateComboDisplay() {
  document.getElementById('combo').textContent = '×' + state.combo;
}

/* ---------------- ループ ---------------- */
function loop(t) {
  if (!rafId) return;
  const dt = Math.min(0.033, (t - lastT) / 1000 || 0);
  lastT = t;
  if (!state.ended && !state.paused) {
    updatePaddle(dt);
    updateBalls(dt);
    updateItems(dt);
    updateParticles(dt);
    updateFloatTexts(dt);
    updateEffect(performance.now());
  }
  drawScene();
  rafId = requestAnimationFrame(loop);
}
function startLoop() {
  cancelAnimationFrame(rafId);
  lastT = performance.now();
  rafId = requestAnimationFrame(loop);
}

/* ---------------- ゲーム生成 ---------------- */
function newGame(mode, life, stage) {
  state.mode = mode;
  state.lifeMode = life;
  state.stage = stage || 1;
  state.score = 0;
  state.combo = 0;
  state.maxCombo = 0;
  state.blocksBrokenTotal = 0;
  state.lives = life === '1' ? 1 : life === 'inf' ? 1 : 3;
  state.items = []; state.particles = [];
  state.effect = null; state.barrier = false;
  state.sticky = false; state.penetrating = false; state.ballBig = false;
  state.ballSpeed = BALL_SPEED_BASE;
  state.ended = false; state.won = false;
  state.stageStartTime = 0; state.stageElapsed = 0;
  state.runStartTime = 0; state.runElapsed = 0;
  state.lastSpaceTime = 0; state.lastPaddleHitTime = 0; state.lastPaddleHitBall = null;
  state.paddleFlashUntil = 0; state.lastStrikeDialog = 0; state.floatTexts = [];
  resetPaddle();
  buildStage(state.stage);
  resetBalls();
  updateHud();
  recordPlay(); // プレイ回数+1
  say('start');
}

/* ---------------- 記録 ---------------- */
function freeKey(stage) { return `scores:breakout:stage:${String(stage).padStart(2,'0')}`; }
const ARCADE_KEY = 'scores:breakout:arcade';

function recordPlay() {
  if (state.mode === 'free') {
    const k = freeKey(state.stage);
    const r = Storage.get(k, { bestScore: 0, fastestTime: null, maxCombo: 0, totalPlays: 0, totalWins: 0, lastPlayed: null });
    r.totalPlays = (r.totalPlays || 0) + 1;
    r.lastPlayed = new Date().toISOString();
    Storage.set(k, r);
  } else {
    const r = Storage.get(ARCADE_KEY, { bestScore: 0, fastestTime: null, maxCombo: 0, maxReachedStage: 0, totalPlays: 0, totalClears: 0, lastPlayed: null });
    r.totalPlays = (r.totalPlays || 0) + 1;
    r.lastPlayed = new Date().toISOString();
    Storage.set(ARCADE_KEY, r);
  }
}
function saveResult(kind) {
  const sec = Math.floor(state.stageElapsed / 1000);
  if (state.mode === 'free') {
    const k = freeKey(state.stage);
    const prev = Storage.get(k, { bestScore: 0, fastestTime: null, maxCombo: 0, totalPlays: 0, totalWins: 0, lastPlayed: null });
    const newBest = state.score > (prev.bestScore || 0);
    const newFastest = kind === 'stage_clear' && (prev.fastestTime == null || sec < prev.fastestTime);
    const newCombo = state.maxCombo > (prev.maxCombo || 0);
    const rec = {
      bestScore: Math.max(prev.bestScore || 0, state.score),
      fastestTime: newFastest ? sec : prev.fastestTime,
      maxCombo: Math.max(prev.maxCombo || 0, state.maxCombo),
      totalPlays: prev.totalPlays || 0,
      totalWins: (prev.totalWins || 0) + (kind === 'stage_clear' ? 1 : 0),
      lastPlayed: new Date().toISOString(),
    };
    Storage.set(k, rec);
    return { rec, newBest, newFastest, newCombo };
  } else {
    const totalSec = Math.floor(state.runElapsed / 1000);
    const prev = Storage.get(ARCADE_KEY, { bestScore: 0, fastestTime: null, maxCombo: 0, maxReachedStage: 0, totalPlays: 0, totalClears: 0, lastPlayed: null });
    const newBest = state.score > (prev.bestScore || 0);
    const newFastest = kind === 'all_clear' && (prev.fastestTime == null || totalSec < prev.fastestTime);
    const newCombo = state.maxCombo > (prev.maxCombo || 0);
    const rec = {
      bestScore: Math.max(prev.bestScore || 0, state.score),
      fastestTime: newFastest ? totalSec : prev.fastestTime,
      maxCombo: Math.max(prev.maxCombo || 0, state.maxCombo),
      maxReachedStage: Math.max(prev.maxReachedStage || 0, state.stage),
      totalPlays: prev.totalPlays || 0,
      totalClears: (prev.totalClears || 0) + (kind === 'all_clear' ? 1 : 0),
      lastPlayed: new Date().toISOString(),
    };
    Storage.set(ARCADE_KEY, rec);
    return { rec, newBest, newFastest, newCombo };
  }
}

/* ---------------- リザルト表示 ---------------- */
function showResult({ kind }) {
  const { rec, newBest, newFastest, newCombo } = saveResult(kind);
  const rows = document.getElementById('result-rows');
  const actions = document.getElementById('result-actions');
  rows.innerHTML = ''; actions.innerHTML = '';
  const add = (l, v, best) => {
    const row = document.createElement('div');
    row.className = 'result-row' + (best ? ' is-best' : '');
    row.innerHTML = `<span>${l}</span><span><strong>${v}</strong>${best ? '<span class="badge">更新！</span>' : ''}</span>`;
    rows.appendChild(row);
  };

  const lines = charData.lines.breakout;
  let title;
  if (kind === 'stage_clear') title = lines.stage_clear[0] || 'クリア！';
  else if (kind === 'all_clear') title = lines.all_clear[0] || '全クリア！';
  else title = lines.gameover[0] || 'ゲームオーバー';
  document.getElementById('result-title').textContent = title;

  if (kind === 'stage_clear') {
    add('今回のスコア', state.score, newBest);
    add('クリアタイム', fmtTime(state.stageElapsed), newFastest);
    add('最大コンボ', state.maxCombo, newCombo);
    add('ベストスコア', rec.bestScore, false);
    add('最速タイム', rec.fastestTime != null ? fmtTime(rec.fastestTime * 1000) : '-', false);
  } else if (kind === 'all_clear') {
    add('総スコア', state.score, newBest);
    add('総クリアタイム', fmtTime(state.runElapsed), newFastest);
    add('最大コンボ', state.maxCombo, newCombo);
    add('ベストスコア', rec.bestScore, false);
  } else {
    add('到達ステージ', state.stage + (state.mode === 'arcade' ? ' / ' + STAGES.length : ''), false);
    add('今回のスコア', state.score, false);
    add('最大コンボ', state.maxCombo, false);
  }

  // ボタン
  const mkBtn = (label, accent, handler, asLink) => {
    const el = document.createElement(asLink ? 'a' : 'button');
    el.className = 'pill-btn' + (accent ? ' pill-btn--accent' : '');
    el.textContent = label;
    if (asLink) el.href = '../../index.html';
    else el.addEventListener('click', handler);
    return el;
  };
  if (state.mode === 'free') {
    actions.appendChild(mkBtn('もう一度遊ぶ', true, () => { closeResult(); newGame('free', state.lifeMode, state.stage); }));
    actions.appendChild(mkBtn('ステージ選択', false, () => { closeResult(); openStageModal(); }));
    actions.appendChild(mkBtn('ロビーに戻る', false, null, true));
  } else {
    if (kind === 'all_clear' || kind === 'gameover') {
      actions.appendChild(mkBtn(kind === 'all_clear' ? 'もう一度挑戦' : 'もう一度挑戦', true,
        () => { closeResult(); newGame('arcade', state.lifeMode, 1); }));
      actions.appendChild(mkBtn('ロビーに戻る', false, null, true));
    }
  }
  document.getElementById('result-modal').classList.add('is-visible');
}
function closeResult() { document.getElementById('result-modal').classList.remove('is-visible'); }
function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ---------------- モーダル ---------------- */
function syncModalChoice() {
  document.querySelectorAll('#choice-mode .bk-opt').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.mode === modalChoice.mode));
  document.querySelectorAll('#choice-life .bk-opt').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.life === modalChoice.life));
}
function openNewModal() {
  syncModalChoice();
  document.getElementById('new-modal').classList.add('is-visible');
}
function closeNewModal() { document.getElementById('new-modal').classList.remove('is-visible'); }
function openStageModal() {
  const grid = document.getElementById('stage-grid');
  grid.innerHTML = '';
  for (let i = 1; i <= STAGES.length; i++) {
    const tile = document.createElement('button');
    tile.className = 'bk-stage-tile';
    const rec = Storage.get(freeKey(i), null);
    const best = rec && rec.bestScore ? rec.bestScore : 0;
    const cleared = rec && rec.totalWins > 0;
    tile.innerHTML = `<span class="bk-stage-tile__num">${i}</span>
      <span class="bk-stage-tile__best">Best: ${best}</span>
      <span class="bk-stage-tile__check">${cleared ? '✓ クリア' : '—'}</span>`;
    tile.addEventListener('click', () => {
      closeStageModal();
      newGame('free', modalChoice.life, i);
    });
    grid.appendChild(tile);
  }
  document.getElementById('stage-modal').classList.add('is-visible');
}
function closeStageModal() { document.getElementById('stage-modal').classList.remove('is-visible'); }

/* ---------------- 初期化 ---------------- */
async function init() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  messageWindow.init();
  selectedId = Storage.get('selectedCharacter', 'mia');
  try { charData = await Characters.load(selectedId, ROOT + 'characters/'); }
  catch (_) { try { charData = await Characters.load('mia', ROOT + 'characters/'); } catch (e) { console.error(e); } }
  if (charData) renderChar();

  // ボタン
  document.getElementById('btn-new').addEventListener('click', openNewModal);
  document.getElementById('btn-cancel').addEventListener('click', closeNewModal);
  document.getElementById('btn-start').addEventListener('click', () => {
    closeNewModal();
    if (modalChoice.mode === 'arcade') newGame('arcade', modalChoice.life, 1);
    else openStageModal();
  });
  document.getElementById('btn-stage-back').addEventListener('click', () => { closeStageModal(); openNewModal(); });
  document.getElementById('char-portrait').addEventListener('click', () => say('start'));

  document.querySelectorAll('#choice-mode .bk-opt').forEach((b) =>
    b.addEventListener('click', () => { modalChoice.mode = b.dataset.mode; syncModalChoice(); }));
  document.querySelectorAll('#choice-life .bk-opt').forEach((b) =>
    b.addEventListener('click', () => { modalChoice.life = b.dataset.life; syncModalChoice(); }));

  // キー入力
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'Space') { e.preventDefault(); onSpace(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
  });

  // 初期セットアップ：ゆるい1ステージ目をプレビュー表示 → モーダル
  newGame('arcade', '3', 1);
  startLoop();
  openNewModal();
}

document.addEventListener('DOMContentLoaded', init);
