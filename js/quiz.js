const POINTS = [100, 66, 33, 0];
const MAX_TRIES = 3;
const UNLOCK_SCORE = 80;

export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createQuiz({ structures, system, region = null, mode, detail, ids = null, rng = Math.random }) {
  const inSystem = structures.filter(s => s.system === system && (!region || s.region === region) && (!ids || ids.includes(s.id)));
  const tiers = [...new Set(inSystem.map(s => s.tier))].sort();
  let tierIndex = 0;
  const ofTier = tier => shuffle(inSystem.filter(s => s.tier === tier), rng);

  let queue = detail === 'all' ? shuffle(inSystem, rng) : ofTier(tiers[0]);
  let position = 0;
  let tries = 0;
  const points = [];
  const answered = [];

  function next(earned) {
    points.push(earned);
    answered.push({ structure: queue[position], points: earned });
    position++;
    tries = 0;
    if (position === queue.length && detail === 'progressive' && score() >= UNLOCK_SCORE && tierIndex < tiers.length - 1) {
      tierIndex++;
      queue = queue.concat(ofTier(tiers[tierIndex]));
    }
  }

  function score() {
    if (!points.length) return 0;
    return Math.round(points.reduce((a, b) => a + b, 0) / points.length);
  }

  return {
    mode,
    get current() { return queue[position] ?? null; },
    get finished() { return position >= queue.length; },
    get progress() { return { done: position, total: queue.length }; },
    score,
    answered: () => answered.map(a => ({ id: a.structure.id, points: a.points })),
    mistakes: () => answered.filter(a => a.points < 100).map(a => a.structure),

    answer(id) {
      const target = queue[position];
      if (id == null || !target) return { result: 'ignored', tries };
      tries++;
      if (id === target.id) {
        const used = tries;
        next(POINTS[used - 1]);
        return { result: 'correct', tries: used };
      }
      if (tries >= MAX_TRIES) {
        next(0);
        return { result: 'reveal', tries: MAX_TRIES };
      }
      return { result: 'wrong', tries };
    },

    skip() {
      if (queue[position]) next(0);
    },

    choices(n = 4) {
      const target = queue[position];
      const active = detail === 'all' ? inSystem : inSystem.filter(s => s.tier <= tiers[tierIndex]);
      const pool = active.length >= n ? active : inSystem;
      const others = shuffle(pool.filter(s => s !== target), rng).slice(0, n - 1);
      return shuffle([target, ...others], rng);
    },
  };
}

// Parts missed in this game join the list; parts answered right on the first try leave it.
export function updateMissed(prev, answered) {
  const missed = new Set(prev);
  for (const { id, points } of answered) {
    if (points === 100) missed.delete(id);
    else missed.add(id);
  }
  return [...missed];
}

export function availableDetails(pool) {
  const main = pool.filter(s => s.tier === 1).length;
  return main >= 4 && main < pool.length ? ['main', 'all', 'progressive'] : ['all'];
}

export function isComplete(record, poolSize) {
  return !!record && record.total === poolSize;
}

export function isBetter(a, b) {
  if (!b) return true;
  return a.score > b.score || (a.score === b.score && a.timeMs < b.timeMs);
}
