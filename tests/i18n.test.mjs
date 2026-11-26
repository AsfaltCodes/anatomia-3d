import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, matches, setStrings, t, setLang, getLang, nameOf, hintFor } from '../js/i18n.js';

test('hintFor reveals first letters, then word starts and the last letter', () => {
  assert.equal(hintFor('Mușchiul biceps brahial', 1), 'M_______ b_____ b______');
  assert.equal(hintFor('Mușchiul biceps brahial', 2), 'M_______ b_____ b_____l');
  assert.equal(hintFor('Femurul', 1), 'F______');
});

test('normalize strips diacritics in both comma and cedilla forms', () => {
  assert.equal(normalize('  Mușchiul   BICEPS '), 'muschiul biceps');
  assert.equal(normalize('Muşchiul ţesut'), 'muschiul tesut');
});

test('matches the Romanian or English name', () => {
  const s = { name: { ro: 'Nervul sciatic', en: 'Sciatic nerve' } };
  assert.ok(matches('nervul sciatic', s));
  assert.ok(matches('SCIATIC NERVE', s));
  assert.ok(!matches('femur', s));
  assert.ok(!matches('', s));
});

test('matches without the parenthetical or the generic first word', () => {
  const scapula = { name: { ro: 'Scapula (omoplatul)', en: 'Scapula' } };
  assert.ok(matches('scapula', scapula));
  assert.ok(matches('omoplatul', scapula));
  const biceps = { name: { ro: 'Mușchiul biceps brahial', en: 'Biceps brachii' } };
  assert.ok(matches('biceps brahial', biceps));
  assert.ok(!matches('biceps', biceps));
});

test('t falls back to the key when a string is missing', () => {
  setStrings({ 'menu.start': { ro: 'Începe', en: 'Start' } });
  assert.equal(t('x.y'), 'x.y');
  setLang('en');
  assert.equal(t('menu.start'), 'Start');
  assert.equal(getLang(), 'en');
});

test('nameOf follows the current language', () => {
  const s = { name: { ro: 'Femurul', en: 'Femur' } };
  setLang('ro');
  assert.equal(nameOf(s), 'Femurul');
});
