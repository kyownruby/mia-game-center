/**
 * mia-gc 名前空間付き localStorage ラッパー
 */
const Storage = (() => {
  const PREFIX = 'mia-gc:';
  return {
    get(key, fallback = null) {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },
    set(key, value) {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    },
    remove(key) {
      localStorage.removeItem(PREFIX + key);
    },
  };
})();
