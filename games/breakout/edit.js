'use strict';

/* ============================================================
   ブロックくずし エディットモード（開発者向け隠し機能）
   ------------------------------------------------------------
   - ゲーム画面で「EDIT」を順番に押すと起動
   - ステージのブロック配置をマウスで編集・テストプレイ
   - stages.js 全文を書き出し（ダウンロード／クリップボード）
   - game.js / stages.js のグローバル（state, STAGES, newGame,
     buildStage, startLoop, say）を参照する
   ============================================================ */

window.EditMode = (function () {
  const COLS = 18;
  const MAX_ROWS = 10;
  const SYMBOLS = ['N', 'H', 'h', 'I', 'X', '.'];
  const SYMBOL_LABEL = { N: '普通', H: '硬2', h: '硬3', I: 'item', X: '壁', '.': '空' };
  const DEFAULT_PALETTE = ['#F7A8C4', '#FFB4D0', '#F590B0', '#FFC0DC', '#FF9FB6'];

  const ed = {
    active: false,
    testing: false,
    stages: [],
    current: 0,
    brush: 'N',
    mirror: false,
    undoStack: [],
    redoStack: [],
    dirty: false,
    painting: false,
    paintValue: 'N',
    keySeq: [],
    dragFrom: null,
    original: [],   // 起動時のステージ（差分比較の基準）
  };

  let root, testbar;

  /* ---------------- 起動コマンド検知（EDIT順番押し） ---------------- */
  function feedKey(code) {
    const map = { KeyE: 'E', KeyD: 'D', KeyI: 'I', KeyT: 'T' };
    const ch = map[code];
    if (!ch) return;
    ed.keySeq.push(ch);
    if (ed.keySeq.length > 4) ed.keySeq.shift();
    if (ed.keySeq.join('') === 'EDIT') { ed.keySeq = []; enter(); }
  }

  function gameInputBlocked() { return ed.active && !ed.testing; }

  /* ---------------- ステージ正規化 ---------------- */
  function normRows(rows) {
    return (rows || []).slice(0, MAX_ROWS).map((r) => {
      let s = String(r).replace(/[^NHhIX.]/g, '.');
      if (s.length < COLS) s = s.padEnd(COLS, '.');
      return s.slice(0, COLS);
    });
  }
  function normStage(st) {
    return {
      name: st.name || 'Stage',
      palette: (st.palette && st.palette.length ? st.palette.slice() : DEFAULT_PALETTE.slice()),
      rows: normRows(st.rows && st.rows.length ? st.rows : ['.'.repeat(COLS)]),
    };
  }
  function emptyStage(n) {
    return { name: 'Stage' + n, palette: DEFAULT_PALETTE.slice(), rows: Array.from({ length: 7 }, () => '.'.repeat(COLS)), _oid: null };
  }
  function cur() { return ed.stages[ed.current]; }

  /* ---------------- 起動／終了 ---------------- */
  function enter() {
    if (ed.active) return;
    ed.active = true;
    ed.testing = false;
    if (typeof state !== 'undefined') state.ended = true; // 背景ゲームを止める
    const base = (typeof STAGES !== 'undefined' ? STAGES : []).map(normStage);
    ed.original = clone(base);                    // 差分比較の基準（_oidなし）
    ed.stages = base.map((s, i) => { s._oid = i; return s; }); // 各ステージに元番号を付与
    if (!ed.stages.length) { ed.stages = [emptyStage(1)]; ed.original = []; }
    ed.current = 0;
    ed.brush = 'N';
    ed.mirror = false;
    ed.undoStack = []; ed.redoStack = [];
    ed.dirty = false;
    buildUI();
    showOverlay();
  }

  function close() {
    if (ed.dirty && !confirm('まだ書き出してない変更があるよ。閉じちゃう？')) return;
    ed.active = false; ed.testing = false;
    hideOverlay(); hideTestbar();
  }

  /* ---------------- スナップショット（Undo/Redo） ---------------- */
  function snapshot() {
    ed.undoStack.push({ stages: clone(ed.stages), current: ed.current });
    if (ed.undoStack.length > 60) ed.undoStack.shift();
    ed.redoStack = [];
  }
  function undo() {
    if (!ed.undoStack.length) return;
    ed.redoStack.push({ stages: clone(ed.stages), current: ed.current });
    const s = ed.undoStack.pop();
    ed.stages = s.stages; ed.current = Math.min(s.current, ed.stages.length - 1);
    ed.dirty = true; renderAll();
  }
  function redo() {
    if (!ed.redoStack.length) return;
    ed.undoStack.push({ stages: clone(ed.stages), current: ed.current });
    const s = ed.redoStack.pop();
    ed.stages = s.stages; ed.current = Math.min(s.current, ed.stages.length - 1);
    ed.dirty = true; renderAll();
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- セル描画（塗り） ---------------- */
  function setCell(st, r, c, ch) {
    if (r < 0 || r >= st.rows.length || c < 0 || c >= COLS) return;
    const row = st.rows[r];
    st.rows[r] = row.substring(0, c) + ch + row.substring(c + 1);
  }
  function paintCell(r, c, ch) {
    const st = cur();
    setCell(st, r, c, ch);
    updateCell(r, c);
    if (ed.mirror) { setCell(st, r, COLS - 1 - c, ch); updateCell(r, COLS - 1 - c); }
    ed.dirty = true;
  }
  // ドラッグ塗り中は対象セルだけ更新（全再描画はしない）
  function updateCell(r, c) {
    const grid = root && root.querySelector('#ed-grid');
    if (!grid) return;
    const el = grid.children[r * COLS + c];
    if (!el) return;
    const ch = cur().rows[r][c] || '.';
    el.className = 'ed-cell' + (ch === '.' ? ' is-empty' : '');
    el.style.background = swatchColor(ch, r, c);
    el.textContent = (ch === 'I') ? '★' : (ch === 'X') ? '✕' : (ch === 'H' || ch === 'h') ? ch : '';
  }

  /* ---------------- ステージ操作 ---------------- */
  function selectStage(i) { ed.current = i; renderAll(); }
  function addStage() {
    snapshot();
    ed.stages.push(emptyStage(ed.stages.length + 1));
    ed.current = ed.stages.length - 1;
    ed.dirty = true; renderAll();
  }
  function duplicateStage(i) {
    snapshot();
    const copy = clone(ed.stages[i]);
    copy._oid = null;            // 複製は新規ステージ扱い
    copy.name = copy.name + ' Copy';
    ed.stages.splice(i + 1, 0, copy);
    ed.current = i + 1;
    ed.dirty = true; renderAll();
  }
  function deleteStage(i) {
    if (ed.stages.length <= 1) { alert('最低1ステージは残してねっ🐾'); return; }
    if (!confirm(`ステージ${i + 1}「${ed.stages[i].name}」を削除する？`)) return;
    snapshot();
    ed.stages.splice(i, 1);
    ed.current = Math.min(ed.current, ed.stages.length - 1);
    ed.dirty = true; renderAll();
  }
  function moveStage(from, to) {
    if (from === to || from < 0 || to < 0 || from >= ed.stages.length || to >= ed.stages.length) return;
    snapshot();
    const [m] = ed.stages.splice(from, 1);
    ed.stages.splice(to, 0, m);
    ed.current = to;
    ed.dirty = true; renderAll();
  }
  function setRowCount(n) {
    const st = cur();
    n = Math.max(1, Math.min(MAX_ROWS, n));
    if (n === st.rows.length) return;
    if (n < st.rows.length) {
      const removed = st.rows.slice(n);
      const hasBlocks = removed.some((r) => /[NHhIX]/.test(r));
      if (hasBlocks && !confirm('削除する行にブロックがあるよ。減らす？')) return;
      snapshot();
      st.rows = st.rows.slice(0, n);
    } else {
      snapshot();
      while (st.rows.length < n) st.rows.push('.'.repeat(COLS));
    }
    ed.dirty = true; renderAll();
  }

  /* ---------------- テストプレイ ---------------- */
  function testPlay() {
    const def = clone(cur());
    ed.testing = true;
    hideOverlay();
    showTestbar();
    if (typeof newGame === 'function') {
      newGame('free', 'inf', 1, { testPlay: true, testDef: def });
      if (typeof startLoop === 'function') startLoop();
    }
  }
  function backToEditor() {
    ed.testing = false;
    if (typeof state !== 'undefined') state.ended = true;
    hideTestbar();
    showOverlay();
  }

  /* ---------------- 差分の算出 ---------------- */
  function stageKey(st) {
    return JSON.stringify({ name: st.name, palette: st.palette, rows: normRows(st.rows) });
  }
  function contentOf(s) {
    return { name: s.name, palette: s.palette.slice(), rows: normRows(s.rows) };
  }
  // 起動時の状態(ed.original)と現在(ed.stages)を比較し、更新/追加/削除/並べ替えを抽出
  function buildDiff() {
    const changes = [];
    const presentOids = new Set(ed.stages.map((s) => s._oid).filter((o) => o != null));
    // 削除：元にあって今ないもの
    ed.original.forEach((o, i) => {
      if (!presentOids.has(i)) changes.push({ op: 'delete', ref: '#' + (i + 1), origIndex: i + 1, name: o.name });
    });
    // 更新／追加＋最終順
    let newCounter = 0;
    const finalOrder = [];
    ed.stages.forEach((s) => {
      if (s._oid == null) {
        newCounter++;
        const ref = 'new' + newCounter;
        finalOrder.push(ref);
        changes.push({ op: 'add', ref, name: s.name, stage: contentOf(s) });
      } else {
        const ref = '#' + (s._oid + 1);
        finalOrder.push(ref);
        const o = ed.original[s._oid];
        if (o && stageKey(o) !== stageKey(s)) {
          changes.push({ op: 'update', ref, origIndex: s._oid + 1, name: s.name, stage: contentOf(s) });
        }
      }
    });
    // 並べ替え判定：残った元ステージの並びが昇順でなければ reordered
    const keptIdx = ed.stages.filter((s) => s._oid != null).map((s) => s._oid);
    let reordered = false;
    for (let i = 1; i < keptIdx.length; i++) if (keptIdx[i] < keptIdx[i - 1]) { reordered = true; break; }
    const summary = {
      updated: changes.filter((c) => c.op === 'update').map((c) => c.origIndex),
      added: changes.filter((c) => c.op === 'add').map((c) => c.name),
      deleted: changes.filter((c) => c.op === 'delete').map((c) => c.origIndex),
      reordered,
    };
    return { changes, finalOrder, summary };
  }

  function timestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function diffFilename() { return timestamp() + '_breakout_edit.json'; }

  function buildDiffPayload() {
    const diff = buildDiff();
    const json = JSON.stringify({
      type: 'breakout-stage-edit',
      game: 'breakout',
      target: 'games/breakout/stages.js',
      exportedAt: new Date().toISOString(),
      baseStageCount: ed.original.length,
      finalStageCount: ed.stages.length,
      summary: diff.summary,
      changes: diff.changes,
      finalOrder: diff.finalOrder,
      applyInstructions:
        'games/breakout/stages.js に適用してね。origIndex は元(1始まり)のステージ番号。' +
        'op=update は該当ステージを stage の内容で置換、op=add は新規ステージ（stage の内容）、' +
        'op=delete は該当ステージを削除。最終的な並び順は finalOrder（#N=元ステージ / newN=追加ステージ）に従う。' +
        '変更のないステージは stages.js の既存内容（コメント含む）をそのまま保持してね。',
    }, null, 2);
    return { json, isEmpty: diff.changes.length === 0 && !diff.summary.reordered };
  }

  function validate() {
    const issues = [];
    if (!ed.stages.length) { issues.push('ステージが0個です'); return issues; }
    ed.stages.forEach((st, i) => {
      const rows = normRows(st.rows);
      if (rows.length < 1 || rows.length > MAX_ROWS) issues.push(`#${i + 1}: 行数が1〜10の範囲外`);
      rows.forEach((r, ri) => {
        if (r.length !== COLS) issues.push(`#${i + 1} 行${ri + 1}: ${r.length}文字（18でない）`);
        if (/[^NHhIX.]/.test(r)) issues.push(`#${i + 1} 行${ri + 1}: 不正な記号`);
      });
      if (!st.palette.some((c) => /^#[0-9A-Fa-f]{6}$/.test(c))) issues.push(`#${i + 1}: 有効な色（#RRGGBB）が無い`);
      const breakable = rows.join('').split('').filter((c) => 'NHhI'.includes(c)).length;
      if (breakable === 0) issues.push(`#${i + 1}「${st.name}」: 破壊可能ブロックが無い（クリア対象なし）`);
    });
    return issues;
  }

  function confirmExport() {
    const issues = validate();
    if (issues.length) {
      return confirm('⚠️ 気になるところがあるよ:\n\n' + issues.join('\n') + '\n\nこのまま書き出す？');
    }
    return true;
  }

  function downloadDiff() {
    const payload = buildDiffPayload();
    if (payload.isEmpty) { alert('変更がないみたい🐾 何か編集してから書き出してねっ'); return; }
    if (!confirmExport()) return;
    const blob = new Blob([payload.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = diffFilename();
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    ed.dirty = false;
    toast('差分JSONを書き出したよっ🐾');
  }
  function copyDiff() {
    const payload = buildDiffPayload();
    if (payload.isEmpty) { alert('変更がないみたい🐾 何か編集してから書き出してねっ'); return; }
    if (!confirmExport()) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload.json).then(
        () => { ed.dirty = false; toast('差分JSONをコピーしたよっ💕'); },
        () => toast('コピーに失敗したよ💦 ダウンロードを使ってね')
      );
    } else {
      toast('この環境ではコピー不可💦 ダウンロードを使ってね');
    }
  }

  /* ---------------- UI 構築 ---------------- */
  function buildUI() {
    root = document.getElementById('bk-editor');
    testbar = document.getElementById('bk-testbar');
    root.innerHTML =
      '<div class="ed-bar">' +
        '<div class="ed-tabs" id="ed-tabs"></div>' +
        '<button class="ed-add" id="ed-add" title="ステージを追加">＋ 追加</button>' +
        '<div class="ed-spacer"></div>' +
        '<button class="ed-close" id="ed-close" title="閉じる (Esc)">× 閉じる</button>' +
      '</div>' +
      '<div class="ed-body">' +
        '<div class="ed-gridwrap"><div class="ed-grid" id="ed-grid"></div></div>' +
        '<div class="ed-panel">' +
          '<div class="ed-sec"><div class="ed-sec__t">ブラシ</div><div class="ed-brushes" id="ed-brushes"></div></div>' +
          '<div class="ed-sec"><label class="ed-check"><input type="checkbox" id="ed-mirror"> 左右ミラー</label>' +
            '<div class="ed-tools"><button id="ed-undo">↶ 元に戻す</button><button id="ed-redo">↷ やり直し</button></div></div>' +
          '<div class="ed-sec"><div class="ed-sec__t">ステージ名</div><input type="text" id="ed-name" class="ed-name"></div>' +
          '<div class="ed-sec"><div class="ed-sec__t">パレット</div><div class="ed-palette" id="ed-palette"></div></div>' +
          '<div class="ed-sec"><div class="ed-sec__t">行数</div><div class="ed-rows"><button id="ed-rowminus">−</button><span id="ed-rowcount">7</span><button id="ed-rowplus">＋</button></div></div>' +
          '<div class="ed-sec ed-actions">' +
            '<button class="ed-btn ed-btn--play" id="ed-test">▶ テストプレイ</button>' +
            '<button class="ed-btn ed-btn--dl" id="ed-export">⬇ 差分JSONを書き出し</button>' +
            '<button class="ed-btn" id="ed-copy">📋 差分JSONをコピー</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ed-toast" id="ed-toast" hidden></div>';

    // ブラシ
    const bwrap = root.querySelector('#ed-brushes');
    SYMBOLS.forEach((s) => {
      const b = document.createElement('button');
      b.className = 'ed-brush'; b.dataset.sym = s;
      b.innerHTML = `<span class="ed-brush__sw" data-sym="${s}"></span><span>${s === '.' ? '空' : s}</span>`;
      b.title = SYMBOL_LABEL[s];
      b.addEventListener('click', () => { ed.brush = s; renderBrushes(); });
      bwrap.appendChild(b);
    });

    root.querySelector('#ed-add').addEventListener('click', addStage);
    root.querySelector('#ed-close').addEventListener('click', close);
    root.querySelector('#ed-mirror').addEventListener('change', (e) => { ed.mirror = e.target.checked; });
    root.querySelector('#ed-undo').addEventListener('click', undo);
    root.querySelector('#ed-redo').addEventListener('click', redo);
    root.querySelector('#ed-name').addEventListener('input', (e) => { cur().name = e.target.value; ed.dirty = true; renderTabs(); });
    root.querySelector('#ed-rowminus').addEventListener('click', () => setRowCount(cur().rows.length - 1));
    root.querySelector('#ed-rowplus').addEventListener('click', () => setRowCount(cur().rows.length + 1));
    root.querySelector('#ed-test').addEventListener('click', testPlay);
    root.querySelector('#ed-export').addEventListener('click', downloadDiff);
    root.querySelector('#ed-copy').addEventListener('click', copyDiff);

    // ドラッグ塗り終了
    document.addEventListener('mouseup', () => { ed.painting = false; });

    renderAll();
  }

  function renderAll() { renderTabs(); renderBrushes(); renderPanel(); renderGrid(); }

  function renderTabs() {
    const tabs = root.querySelector('#ed-tabs');
    if (!tabs) return;
    tabs.innerHTML = '';
    ed.stages.forEach((st, i) => {
      const tab = document.createElement('div');
      tab.className = 'ed-tab' + (i === ed.current ? ' is-active' : '');
      tab.draggable = true;
      tab.innerHTML = `<span class="ed-tab__num">${i + 1}</span><span class="ed-tab__name">${escapeHtml(st.name)}</span>` +
        (i === ed.current ? '<span class="ed-tab__act"><button class="ed-tab__dup" title="複製">⎘</button><button class="ed-tab__del" title="削除">×</button></span>' : '');
      tab.addEventListener('click', (e) => { if (e.target.closest('.ed-tab__act')) return; selectStage(i); });
      tab.addEventListener('dragstart', () => { ed.dragFrom = i; });
      tab.addEventListener('dragover', (e) => e.preventDefault());
      tab.addEventListener('drop', (e) => { e.preventDefault(); if (ed.dragFrom != null) moveStage(ed.dragFrom, i); ed.dragFrom = null; });
      const dup = tab.querySelector('.ed-tab__dup');
      const del = tab.querySelector('.ed-tab__del');
      if (dup) dup.addEventListener('click', (e) => { e.stopPropagation(); duplicateStage(i); });
      if (del) del.addEventListener('click', (e) => { e.stopPropagation(); deleteStage(i); });
      tabs.appendChild(tab);
    });
  }

  function renderBrushes() {
    if (!root) return;
    root.querySelectorAll('.ed-brush').forEach((b) => b.classList.toggle('is-active', b.dataset.sym === ed.brush));
    root.querySelectorAll('.ed-brush__sw').forEach((sw) => { sw.style.background = swatchColor(sw.dataset.sym, 0, 0); sw.style.borderColor = sw.dataset.sym === '.' ? '#ccc' : 'transparent'; });
  }

  function renderPanel() {
    if (!root) return;
    const st = cur();
    root.querySelector('#ed-name').value = st.name;
    root.querySelector('#ed-mirror').checked = ed.mirror;
    root.querySelector('#ed-rowcount').textContent = st.rows.length;
    // パレット
    const pal = root.querySelector('#ed-palette');
    pal.innerHTML = '';
    st.palette.forEach((c, idx) => {
      const inp = document.createElement('input');
      inp.type = 'color'; inp.value = /^#[0-9A-Fa-f]{6}$/.test(c) ? c : '#F7A8C4';
      inp.className = 'ed-swatch';
      inp.addEventListener('input', (e) => { st.palette[idx] = e.target.value; ed.dirty = true; renderGrid(); });
      pal.appendChild(inp);
    });
  }

  function renderGrid() {
    const grid = root && root.querySelector('#ed-grid');
    if (!grid) return;
    const st = cur();
    grid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    grid.innerHTML = '';
    st.rows.forEach((row, r) => {
      for (let c = 0; c < COLS; c++) {
        const ch = row[c] || '.';
        const cell = document.createElement('div');
        cell.className = 'ed-cell' + (ch === '.' ? ' is-empty' : '');
        cell.style.background = swatchColor(ch, r, c);
        if (ch === 'H' || ch === 'h' || ch === 'I' || ch === 'X') {
          cell.textContent = ch === 'I' ? '★' : ch === 'X' ? '✕' : ch;
        }
        cell.addEventListener('mousedown', (e) => {
          e.preventDefault();
          snapshot();
          ed.painting = true; ed.paintValue = ed.brush;
          paintCell(r, c, ed.paintValue);
        });
        cell.addEventListener('mouseenter', () => { if (ed.painting) paintCell(r, c, ed.paintValue); });
        grid.appendChild(cell);
      }
    });
  }

  // セルのプレビュー色（実ゲームの見た目に近づける）
  function swatchColor(ch, r, c) {
    const st = cur();
    const pal = (st && st.palette && st.palette.length) ? st.palette : DEFAULT_PALETTE;
    switch (ch) {
      case 'N': return pal[(r + c) % pal.length];
      case 'H': return '#7E97B8';
      case 'h': return '#8C7F9C';
      case 'I': return '#FFEC4F';
      case 'X': return '#5E5466';
      default: return 'transparent';
    }
  }

  /* ---------------- 表示トグル／トースト ---------------- */
  function showOverlay() { root.hidden = false; }
  function hideOverlay() { if (root) root.hidden = true; }
  function showTestbar() { if (testbar) testbar.hidden = false; }
  function hideTestbar() { if (testbar) testbar.hidden = true; }
  let toastTimer = null;
  function toast(msg) {
    const t = root && root.querySelector('#ed-toast');
    if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  /* ---------------- Esc / 編集に戻る ---------------- */
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (ed.testing) { e.preventDefault(); backToEditor(); }
      else if (ed.active) { e.preventDefault(); close(); }
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-back-edit');
    if (btn) btn.addEventListener('click', backToEditor);
  });

  /* ---------------- 公開API ---------------- */
  return {
    feedKey,
    gameInputBlocked,
    get active() { return ed.active; },
  };
})();
