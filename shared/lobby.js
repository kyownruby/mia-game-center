const GAMES = [
  { id: 'solitaire', name: 'ソリティア', emoji: '🃏', icon: 'assets/icons/games/solitaire.png', url: 'games/solitaire/index.html', ready: true },
  { id: 'minesweeper', name: 'マインスイーパー', emoji: '💣', icon: 'assets/icons/games/minesweeper.png', url: 'games/minesweeper/index.html', ready: true },
  { id: 'breakout', name: 'ブロックくずし', emoji: '🧱', icon: 'assets/icons/games/breakout.png', ready: false },
  { id: 'comingsoon', name: 'まだまだ追加予定！', emoji: '＋', ready: false, placeholder: true },
];

const TYPING_SPEED_MS = 50;
const AUTO_HIDE_DELAY_MS = 4000;

const SELECTABLE = ['mia', 'kyown', 'rain'];    // アバターとして選べるキャラ

const chars = {};
let selectedId = 'mia';

function speaker() {
  return chars[selectedId];   // ロビーの主役＝選択中アバター
}

const messageWindow = {
  el: null,
  textEl: null,
  hideTimer: null,
  typingTimer: null,
  isTyping: false,
  fullText: '',

  init() {
    this.el = document.getElementById('message-window');
    this.textEl = document.getElementById('message-text');
    this.el.addEventListener('click', () => this.skipTyping());
  },

  show(text) {
    if (!text) return;
    this.cancelTimers();
    this.fullText = text;
    this.textEl.textContent = '';
    this.el.classList.add('is-visible');
    this.typeOut();
  },

  typeOut() {
    let i = 0;
    this.isTyping = true;
    this.typingTimer = setInterval(() => {
      this.textEl.textContent += this.fullText[i];
      i++;
      if (i >= this.fullText.length) {
        clearInterval(this.typingTimer);
        this.typingTimer = null;
        this.isTyping = false;
        this.scheduleHide();
      }
    }, TYPING_SPEED_MS);
  },

  skipTyping() {
    if (!this.isTyping) return;
    clearInterval(this.typingTimer);
    this.typingTimer = null;
    this.textEl.textContent = this.fullText;
    this.isTyping = false;
    this.scheduleHide();
  },

  scheduleHide() {
    this.hideTimer = setTimeout(() => this.hide(), AUTO_HIDE_DELAY_MS);
  },

  hide() {
    this.el.classList.remove('is-visible');
  },

  cancelTimers() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.typingTimer) {
      clearInterval(this.typingTimer);
      this.typingTimer = null;
    }
    this.isTyping = false;
  },
};

function applyAvatarImage(imgEl, emojiEl, src) {
  emojiEl.hidden = true; // 既定で隠し、画像読み込み失敗時のみ表示（FOUC防止）
  imgEl.onload = () => {
    imgEl.hidden = false;
    emojiEl.hidden = true;
  };
  imgEl.onerror = () => {
    imgEl.hidden = true;
    emojiEl.hidden = false;
  };
  imgEl.src = src;
}

function renderHeaderAvatar() {
  const ch = chars[selectedId];
  const emojiEl = document.getElementById('avatar-emoji');
  emojiEl.textContent = ch.emoji;
  applyAvatarImage(document.getElementById('avatar-img'), emojiEl, ch.image.avatar);
  document.getElementById('avatar-name').textContent = ch.displayName;
  document.documentElement.style.setProperty('--avatar-color', ch.theme.primaryColor);
}

function openAvatarModal() {
  document.getElementById('avatar-modal').classList.add('is-visible');
}

function closeAvatarModal() {
  document.getElementById('avatar-modal').classList.remove('is-visible');
}

function selectAvatar(id) {
  selectedId = id;
  Storage.set('selectedCharacter', id);
  renderHeaderAvatar();
  renderSpeakerPortrait();
  closeAvatarModal();
  messageWindow.show(Characters.pickRandom(speaker().lines.greeting_return));
}

function renderGameTiles() {
  const grid = document.getElementById('game-grid');
  grid.innerHTML = '';
  GAMES.forEach((game) => {
    const tile = document.createElement('button');
    tile.className = 'game-tile' + (game.placeholder ? ' is-placeholder' : '');
    tile.dataset.gameId = game.id;

    const thumb = document.createElement('div');
    thumb.className = 'game-tile__thumb';
    if (game.icon) {
      const img = document.createElement('img');
      img.alt = game.name;
      const emoji = document.createElement('span');
      emoji.textContent = game.emoji;
      thumb.append(img, emoji);
      applyAvatarImage(img, emoji, game.icon);
    } else {
      thumb.textContent = game.emoji;
    }

    const name = document.createElement('div');
    name.className = 'game-tile__name';
    name.textContent = game.name;

    tile.append(thumb, name);
    tile.addEventListener('mouseenter', () => {
      if (game.placeholder) return;
      const lines = speaker().lines.game_hover?.[game.id];
      messageWindow.show(Characters.pickRandom(lines));
    });
    tile.addEventListener('click', () => {
      if (game.ready && game.url) { window.location.href = game.url; return; }
      alert(game.placeholder ? '新しいゲーム、お楽しみに〜！' : `${game.name}は準備中だよっ💦`);
    });
    grid.appendChild(tile);
  });
}

function renderSpeakerPortrait() {
  const ch = speaker();
  const fallbackEl = document.getElementById('mia-portrait-fallback');
  fallbackEl.textContent = ch.emoji;
  applyAvatarImage(
    document.getElementById('mia-portrait-img'),
    fallbackEl,
    ch.image.portrait
  );
}

function renderModalOptions() {
  const container = document.getElementById('modal-options');
  container.innerHTML = '';
  SELECTABLE.forEach((id) => {
    const ch = chars[id];
    const btn = document.createElement('button');
    btn.className = 'modal__option';
    btn.dataset.selectCharacter = id;
    btn.addEventListener('click', () => selectAvatar(id));

    const icon = document.createElement('span');
    icon.className = 'modal__option-icon';
    icon.style.background = ch.theme.primaryColor;
    const img = document.createElement('img');
    img.alt = '';
    img.hidden = true;
    const emoji = document.createElement('span');
    emoji.textContent = ch.emoji;
    icon.append(img, emoji);

    const name = document.createElement('span');
    name.className = 'modal__option-name';
    name.textContent = ch.displayName;

    btn.append(icon, name);
    container.appendChild(btn);
    applyAvatarImage(img, emoji, ch.image.avatar);
  });
}

function setupPortraitClick() {
  document.getElementById('mia-portrait').addEventListener('click', () => {
    messageWindow.show(Characters.pickRandom(speaker().lines.click_idle));
  });
}

function setupAvatarSwitcher() {
  document.getElementById('header-avatar').addEventListener('click', openAvatarModal);
  document.getElementById('avatar-modal').addEventListener('click', (e) => {
    if (e.target.id === 'avatar-modal') closeAvatarModal();
  });
}

function showInitialGreeting() {
  const ch = speaker();
  const isFirst = !Storage.get('firstVisit');
  const lines = isFirst ? ch.lines.greeting_first : ch.lines.greeting_return;
  if (isFirst) Storage.set('firstVisit', true);
  messageWindow.show(Characters.pickRandom(lines));
}

async function init() {
  try {
    const loaded = await Characters.loadAll(SELECTABLE);
    loaded.forEach((ch) => { chars[ch.id] = ch; });
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<p style="padding:1em;color:#c33">キャラデータ読み込み失敗。HTTPサーバ経由で開いてね💦</p>'
    );
    return;
  }
  selectedId = Storage.get('selectedCharacter', 'mia');
  if (!chars[selectedId]) selectedId = 'mia';
  messageWindow.init();
  renderSpeakerPortrait();
  renderModalOptions();
  renderHeaderAvatar();
  renderGameTiles();
  setupPortraitClick();
  setupAvatarSwitcher();
  showInitialGreeting();
}

document.addEventListener('DOMContentLoaded', init);
