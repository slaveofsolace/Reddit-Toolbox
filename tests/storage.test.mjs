import test from 'node:test';
import assert from 'node:assert/strict';
import { loadToolbox } from './load-toolbox.mjs';

test('SettingsStore tolerates blocked browser storage', () => {
  const localStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  };
  const { Core } = loadToolbox({ globals: { localStorage } });
  const store = new Core.SettingsStore('test');
  assert.equal(store.get('settings', 'fallback'), 'fallback');
  assert.equal(store.set('settings', { value: true }), false);
  assert.equal(store.remove('settings'), false);
});

test('SettingsStore uses userscript storage when available', () => {
  const values = new Map();
  const { Core } = loadToolbox({ globals: {
    GM_getValue: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    GM_setValue: (key, value) => values.set(key, value),
    GM_deleteValue: (key) => values.delete(key)
  }});
  const store = new Core.SettingsStore('test');
  assert.equal(store.set('settings', { value: true }), true);
  assert.deepEqual({ ...store.get('settings') }, { value: true });
  assert.equal(store.remove('settings'), true);
  assert.equal(store.get('settings', null), null);
});
