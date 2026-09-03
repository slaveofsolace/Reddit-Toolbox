(() => {
  'use strict';

  const { Core } = globalThis.RedditToolbox;

  class SettingsStore {
    constructor(namespace = 'reddit-toolbox') {
      this.namespace = namespace;
    }

    key(name) {
      return `${this.namespace}:${name}`;
    }

    get(name, fallback = null) {
      const key = this.key(name);
      try {
        if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
        const raw = globalThis.localStorage?.getItem(key);
        return raw === null || raw === undefined ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    }

    set(name, value) {
      const key = this.key(name);
      try {
        if (typeof GM_setValue === 'function') {
          GM_setValue(key, value);
          return true;
        }
        globalThis.localStorage?.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }

    remove(name) {
      const key = this.key(name);
      try {
        if (typeof GM_deleteValue === 'function') {
          GM_deleteValue(key);
          return true;
        }
        globalThis.localStorage?.removeItem(key);
        return true;
      } catch {
        return false;
      }
    }
  }

  function downloadText(filename, text, type = 'application/json') {
    const blob = new Blob([text], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  Core.SettingsStore = SettingsStore;
  Core.downloadText = downloadText;
})();
