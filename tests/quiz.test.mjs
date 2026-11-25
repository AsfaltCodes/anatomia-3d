import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuiz, isBetter } from '../js/quiz.js';

const S = [
  { id: 'a', system: 'bones', tier: 1 },
  { id: 'b', system: 'bones', tier: 1 },
  { id: 'c', system: 'bones', tier: 2 },
  { id: 'm', system: 'muscles', tier: 1 },
  { id: 'skin', system: 'skin', tier: 1 },
];
const fixed = () => 0;
const quiz = (detail, mode = 'click') => createQuiz({ structures: S, system: 'bones', mode, detail, rng: fixed });

test('main uses tier 1 of the chosen system only', () => {
  assert.equal(quiz('main').progress.total, 2);
});

test('all uses every tier of the system', () => {
  assert.equal(quiz('all').progress.total, 3);
});

test('a click on empty space is ignored', () => {
  const q = quiz('main');
  assert.equal(q.answer(null).result, 'ignored');
  assert.deepEqual(q.progress, { done: 0, total: 2 });
});

test('weights are 100 / 66 for first and second try', () => {
  const q = quiz('main');
  assert.equal(q.answer(q.current.id).result, 'correct');
  const id = q.current.id;
  assert.equal(q.answer('zzz').result, 'wrong');
  q.answer(id);
  assert.equal(q.score(), 83);
  assert.ok(q.finished);
  assert.equal(q.current, null);
});

test('the third miss reveals and moves on', () => {
  const q = quiz('main');
  q.answer('x');
  q.answer('x');
  const r = q.answer('x');
  assert.deepEqual(r, { result: 'reveal', tries: 3 });
  assert.equal(q.progress.done, 1);
});

test('skip counts as zero', () => {
  const q = quiz('main');
  q.skip();
  q.answer(q.current.id);
  assert.equal(q.score(), 50);
});

test('progressive unlocks the next tier at 80% or more', () => {
  const q = quiz('progressive');
  q.answer(q.current.id);
  q.answer(q.current.id);
  assert.ok(!q.finished);
  assert.equal(q.progress.total, 3);
  assert.equal(q.current.id, 'c');
});

test('progressive stops below 80%', () => {
  const q = quiz('progressive');
  q.skip();
  q.answer(q.current.id);
  assert.ok(q.finished);
});

test('choices include the current part and stay in the same system', () => {
  const q = quiz('all', 'name');
  const c = q.choices(3);
  assert.equal(c.length, 3);
  assert.ok(c.includes(q.current));
  assert.ok(c.every(s => s.system === 'bones'));
});

test('isBetter: higher score wins, a tie goes to the faster time', () => {
  assert.ok(isBetter({ score: 90, timeMs: 5 }, null));
  assert.ok(isBetter({ score: 90, timeMs: 5 }, { score: 90, timeMs: 9 }));
  assert.ok(!isBetter({ score: 80, timeMs: 1 }, { score: 90, timeMs: 9 }));
  assert.ok(!isBetter({ score: 90, timeMs: 9 }, { score: 90, timeMs: 9 }));
});
