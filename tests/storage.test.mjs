import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, save } from '../js/storage.js';

test('load returns the fallback when localStorage throws', () => {
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(load('k', { a: 1 }), { a: 1 });
  assert.doesNotThrow(() => save('k', 1));
});

test('load returns the fallback when localStorage is missing', () => {
  delete globalThis.localStorage;
  assert.equal(load('k', 5), 5);
});

test('save then load round-trips JSON', () => {
  const store = {};
  globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  save('best', { score: 90 });
  assert.deepEqual(load('best', null), { score: 90 });
  delete globalThis.localStorage;
});
