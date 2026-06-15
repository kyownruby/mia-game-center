/**
 * トランプ絵札（J/Q/K）のキャラ立ち絵デザイン共通モジュール
 *
 * スート → キャラ対応:
 *   ♥ ハート  → ミア
 *   ♣ クラブ  → きょん
 *   ♠ スペード → レイン
 *   ♦ ダイヤ  → しおり
 *
 * 使い方（カード生成時）:
 *   if (Cards.isFace(rank) && Cards.hasFace(suit)) {
 *     el.classList.add('card--face', Cards.faceClass(suit));
 *     centerHtml = Cards.faceImageHtml(suit, ROOT);   // ROOT は画像ルート(例:'../../')
 *   }
 * さらに shared/cards.css を読み込むと、絵札の見た目（身長・足元ラインの統一）が
 * そのまま適用される。四隅のランク＋スート記号は .card__corner（z-index:2）で前面に。
 */
const Cards = (() => {
  // スート → キャラ立ち絵ファイル名
  const FACE_CHAR = {
    H: 'mia_portrait.png',     // ♥ ハート → ミア
    C: 'kyown_portrait.png',   // ♣ クラブ → きょん
    S: 'rain_portrait.png',    // ♠ スペード → レイン
    D: 'shiori_portrait.png',  // ♦ ダイヤ → しおり
  };
  const IMG_DIR = 'assets/images/characters/';

  // 絵札（J=11 / Q=12 / K=13）か
  function isFace(rank) { return rank >= 11 && rank <= 13; }
  // そのスートに対応キャラがいるか
  function hasFace(suit) { return !!FACE_CHAR[suit]; }
  // キャラ別調整用のクラス名（CSSの .face-<suit> と対応）
  function faceClass(suit) { return 'face-' + suit; }
  // 絵札中央に置くキャラ立ち絵の <img> HTML。root は画像ルート（既定 '../../'）
  function faceImageHtml(suit, root) {
    const file = FACE_CHAR[suit];
    if (!file) return '';
    return `<img class="card__face-img" alt="" src="${(root || '../../') + IMG_DIR + file}">`;
  }

  return { FACE_CHAR, isFace, hasFace, faceClass, faceImageHtml };
})();
