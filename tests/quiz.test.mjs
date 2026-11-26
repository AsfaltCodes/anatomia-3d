import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuiz, isBetter, availableDetails, isComplete, updateMissed } from '../js/quiz.js';

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

test('choices on the main level come only from the main tier when it is big enough', () => {
  const q = quiz('main', 'name');
  assert.ok(q.choices(2).every(s => s.tier === 1));
});

const R = [
  { id: 'h1', system: 'bones', region: 'head', tier: 1 },
  { id: 'h2', system: 'bones', region: 'head', tier: 1 },
  { id: 'h3', system: 'bones', region: 'head', tier: 2 },
  { id: 'l1', system: 'bones', region: 'leg', tier: 1 },
  { id: 'l2', system: 'bones', region: 'leg', tier: 1 },
];

test('a region limits the pool and the choices', () => {
  const q = createQuiz({ structures: R, system: 'bones', region: 'head', mode: 'name', detail: 'all', rng: fixed });
  assert.equal(q.progress.total, 3);
  assert.ok(q.choices(4).every(s => s.region === 'head'));
});

test('no region means the whole system', () => {
  const q = createQuiz({ structures: R, system: 'bones', region: null, mode: 'click', detail: 'all', rng: fixed });
  assert.equal(q.progress.total, 5);
});

test('choices fall back to the whole pool when the active tier is too small', () => {
  const q = createQuiz({ structures: R, system: 'bones', region: 'head', mode: 'name', detail: 'main', rng: fixed });
  assert.equal(q.choices(3).length, 3);
});

test('availableDetails offers levels only when the main tier is a real subset of 4+', () => {
  const tiers = (...t) => t.map((tier, i) => ({ id: String(i), tier }));
  assert.deepEqual(availableDetails(tiers(1, 1, 1, 1, 2)), ['main', 'all', 'progressive']);
  assert.deepEqual(availableDetails(tiers(1, 1, 1, 1)), ['all']);
  assert.deepEqual(availableDetails(tiers(1, 2, 2, 2, 2)), ['all']);
});

test('isComplete: a record counts for the card only if it covered every part', () => {
  assert.ok(isComplete({ score: 80, timeMs: 1, total: 13 }, 13));
  assert.ok(!isComplete({ score: 100, timeMs: 1, total: 7 }, 13));
  assert.ok(!isComplete({ score: 100, timeMs: 1 }, 13));
  assert.ok(!isComplete(null, 13));
});

test('mistakes() lists parts not answered right on the first try, in quiz order', () => {
  const q = createQuiz({ structures: R, system: 'bones', region: 'head', mode: 'click', detail: 'all', rng: fixed });
  const first = q.current; q.answer(first.id);
  const second = q.current; q.answer('x'); q.answer(second.id);
  const third = q.current; q.skip();
  assert.deepEqual(q.mistakes().map(s => s.id), [second.id, third.id]);
});

test('createQuiz with ids restricts the pool', () => {
  const q = createQuiz({ structures: R, system: 'bones', mode: 'click', detail: 'all', ids: ['h3', 'l1'], rng: fixed });
  assert.equal(q.progress.total, 2);
});

test('updateMissed adds new mistakes and drops parts answered right', () => {
  const answered = [{ id: 'a', points: 100 }, { id: 'b', points: 33 }, { id: 'c', points: 0 }];
  assert.deepEqual(updateMissed(['a', 'd'], answered).sort(), ['b', 'c', 'd']);
});

test('isBetter: higher score wins, a tie goes to the faster time', () => {
  assert.ok(isBetter({ score: 90, timeMs: 5 }, null));
  assert.ok(isBetter({ score: 90, timeMs: 5 }, { score: 90, timeMs: 9 }));
  assert.ok(!isBetter({ score: 80, timeMs: 1 }, { score: 90, timeMs: 9 }));
  assert.ok(!isBetter({ score: 90, timeMs: 9 }, { score: 90, timeMs: 9 }));
});
