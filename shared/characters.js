/**
 * キャラデータ（JSON）の読み込み
 * basePath はロビー("characters/") / ゲーム("../../characters/") で切り替え可能
 */
const Characters = (() => {
  const cache = {};
  const ASSET_V = '17'; // キャッシュ対策バージョン（更新時に上げる）

  async function load(id, basePath = 'characters/') {
    if (cache[id]) return cache[id];
    const res = await fetch(`${basePath}${id}.json?v=${ASSET_V}`);
    if (!res.ok) throw new Error(`Failed to load character: ${id}`);
    const data = await res.json();
    cache[id] = data;
    return data;
  }

  async function loadAll(ids, basePath) {
    return Promise.all(ids.map((id) => load(id, basePath)));
  }

  function pickRandom(arr) {
    if (!arr || arr.length === 0) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  }

  return { load, loadAll, pickRandom };
})();
