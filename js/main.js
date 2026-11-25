import { t, setStrings, setLang, getLang, nameOf, descOf, matches, normalize } from './i18n.js';
import { load, save } from './storage.js';
import { createQuiz, availableDetails } from './quiz.js';
import { createScene, SYSTEMS, hasWebGL } from './scene.js';
import { createThumbnails } from './dither.js';
import { showResults, formatTime } from './results.js';

const app = document.getElementById('app');
const nav = document.querySelector('.systems');
const drawer = document.getElementById('drawer');
const burger = document.querySelector('.burger');
const QUIZ_SYSTEMS = ['bones', 'muscles', 'nerves'];
const MODES = ['click', 'name', 'learn'];
const FEEDBACK_MS = 650;
const REVEAL_MS = 1400;
const MAX_SEARCH_RESULTS = 8;

let structures = [];
let quizzes = [];
let page = null;
let scenePromise = null;
let sceneCanvas = null;
let thumbsPromise = null;
const handlers = { pick: null, hover: null };

const escape = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const quizName = q => q.name[getLang()];
const poolOf = q => structures.filter(s => s.system === q.system && (!q.region || s.region === q.region));
const quizFor = s => quizzes.find(q => q.system === s.system && q.region === s.region);
const bestKey = (quizId, mode, detail) => `best:${quizId}:${mode}:${detail}`;
const bestOf = q => ['main', 'all', 'progressive']
  .map(d => load(bestKey(q.id, 'click', d), null))
  .filter(Boolean)
  .reduce((a, b) => (!a || b.score > a.score ? b : a), null);

const ICONS = {
  layers: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3 2 7l8 4 8-4-8-4Zm-6.5 7L2 10.8l8 4 8-4-1.5-.8L10 13 3.5 10Zm0 3L2 13.8l8 4 8-4-1.5-.8L10 16l-6.5-3Z"/></svg>',
  reset: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4a6 6 0 1 1-5.66 4H2.3A8 8 0 1 0 4 4.7V2H2v6h6V6H5.4A6 6 0 0 1 10 4Z"/></svg>',
  skip: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4v12l9-6-9-6Zm10 0v12h2V4h-2Z"/></svg>',
};

/* ---------- Top bar ---------- */

function quizLinks(system) {
  return quizzes.filter(q => q.system === system)
    .map(q => `<a href="#/quiz/${q.id}">${escape(quizName(q))}</a>`).join('');
}

function renderNav() {
  nav.innerHTML = QUIZ_SYSTEMS.map(system => `
    <details class="menu">
      <summary>${t(`system.${system}`)}</summary>
      <div class="menu-panel">${quizLinks(system)}</div>
    </details>`).join('');
  drawer.innerHTML = `
    <div class="search">
      <input type="search" autocomplete="off" spellcheck="false">
      <div class="search-results" role="listbox" hidden></div>
    </div>
    ${QUIZ_SYSTEMS.map(system => `<p class="drawer-heading">${t(`system.${system}`)}</p><div class="drawer-links">${quizLinks(system)}</div>`).join('')}
    <div class="lang" role="group" aria-label="Limba / Language"><button data-lang="ro">RO</button><button data-lang="en">EN</button></div>`;
  document.querySelectorAll('.search').forEach(attachSearch);
  document.querySelectorAll('[data-lang]').forEach(b => {
    b.setAttribute('aria-pressed', b.dataset.lang === getLang());
    b.onclick = () => setLang(b.dataset.lang);
  });
  nav.querySelectorAll('details').forEach(d => d.addEventListener('toggle', () => {
    if (d.open) nav.querySelectorAll('details').forEach(other => { if (other !== d) other.open = false; });
  }));
}

function closeMenus() {
  document.querySelectorAll('details.menu[open]').forEach(d => { d.open = false; });
  document.querySelectorAll('.search-results').forEach(r => { r.hidden = true; });
  drawer.hidden = true;
  burger.setAttribute('aria-expanded', 'false');
}

function searchResults(query) {
  const q = normalize(query);
  if (!q) return [];
  const hit = name => normalize(name.ro).includes(q) || normalize(name.en).includes(q);
  const fromQuizzes = quizzes.filter(quiz => hit(quiz.name))
    .map(quiz => ({ href: `#/quiz/${quiz.id}`, title: quizName(quiz), note: t(`system.${quiz.system}`) }));
  const fromParts = structures.filter(s => s.system !== 'skin' && hit(s.name))
    .map(s => ({ href: `#/quiz/${quizFor(s).id}`, title: nameOf(s), note: quizName(quizFor(s)) }));
  return [...fromQuizzes, ...fromParts].slice(0, MAX_SEARCH_RESULTS);
}

function attachSearch(box) {
  const input = box.querySelector('input');
  const list = box.querySelector('.search-results');
  input.placeholder = t('search.placeholder');
  input.setAttribute('aria-label', t('search.placeholder'));
  input.oninput = () => {
    const results = searchResults(input.value);
    list.hidden = !input.value.trim();
    list.innerHTML = results.length
      ? results.map(r => `<a href="${r.href}" role="option"><span>${escape(r.title)}</span><small>${escape(r.note)}</small></a>`).join('')
      : `<p class="search-empty">${t('search.empty')}</p>`;
  };
  input.onkeydown = e => {
    if (e.key === 'Enter') list.querySelector('a')?.click();
    if (e.key === 'Escape') { input.value = ''; list.hidden = true; input.blur(); }
  };
  list.onclick = e => { if (e.target.closest('a')) { input.value = ''; list.hidden = true; } };
}

/* ---------- Router ---------- */

function route() {
  closeMenus();
  page?.leave?.();
  const match = location.hash.match(/^#\/quiz\/([\w-]+)$/);
  const quiz = match && quizzes.find(q => q.id === match[1]);
  page = match ? (quiz ? playPage(quiz) : notFound()) : homePage();
  document.body.dataset.page = match ? 'play' : 'home';
  page.enter();
  window.scrollTo(0, 0);
}

function notFound() {
  return {
    enter() { app.innerHTML = `<p class="message">${t('error.notfound')} <a href="#/">${t('nav.home')}</a></p>`; },
    relabel() { this.enter(); },
  };
}

/* ---------- Home ---------- */

function homePage() {
  let thumbs = null;

  function render() {
    app.innerHTML = `
      <div class="home">
        ${QUIZ_SYSTEMS.map(system => `
          <section class="group">
            <h2>${t(`system.${system}`)}</h2>
            <div class="cards">${quizzes.filter(q => q.system === system).map(card).join('')}</div>
          </section>`).join('')}
        <footer class="credits">${t('app.credits')}</footer>
      </div>`;
    drawThumbnails();
  }

  function card(q) {
    const best = bestOf(q);
    return `<a class="card" href="#/quiz/${q.id}" data-quiz="${q.id}">
      <canvas class="thumb" aria-hidden="true"></canvas>
      <span class="card-body">
        <span class="card-title">${escape(quizName(q))}</span>
        <span class="card-meta">${poolOf(q).length} ${t('home.parts')}${best ? `<span class="card-best">${t('home.best')} ${best.score}%</span>` : ''}</span>
      </span>
    </a>`;
  }

  function drawThumbnails() {
    if (!thumbs) return;
    app.querySelectorAll('.card').forEach(el => {
      const canvas = el.querySelector('canvas');
      thumbs.draw(canvas, el.dataset.quiz);
      const spin = () => thumbs.spin(canvas, el.dataset.quiz);
      el.addEventListener('pointerenter', spin);
      el.addEventListener('focus', spin);
      el.addEventListener('pointerleave', () => thumbs.stop());
      el.addEventListener('blur', () => thumbs.stop());
    });
  }

  const self = {
    enter() {
      render();
      thumbsPromise ??= createThumbnails(structures, quizzes).catch(() => null);
      thumbsPromise.then(result => {
        thumbs = result;
        if (page === self) drawThumbnails();
      });
    },
    leave() { thumbs?.stop(); },
    relabel: render,
  };
  return self;
}

/* ---------- Play ---------- */

function ensureScene() {
  if (!scenePromise) {
    sceneCanvas = document.createElement('canvas');
    scenePromise = createScene(sceneCanvas, structures).then(scene => {
      scene.onPick((id, e) => handlers.pick?.(id, e));
      scene.onHover((id, e) => handlers.hover?.(id, e));
      return scene;
    });
    scenePromise.catch(() => { scenePromise = null; });
  }
  return scenePromise;
}

function playPage(quizDef) {
  const { system } = quizDef;
  const pool = poolOf(quizDef);
  const byId = new Map(structures.map(s => [s.id, s]));
  const details = availableDetails(pool);
  let mode = MODES.includes(load('mode', 'click')) ? load('mode', 'click') : 'click';
  let detail = details.includes(load('detail', 'main')) ? load('detail', 'main') : details[0];
  let answerStyle = load('answerStyle', 'choices');
  let scene = null;
  let quiz = null;
  let startedAt = 0;
  let clock = 0;
  let locked = false;
  let selected = null;
  let el = {};
  const timers = new Set();
  const later = (fn, ms) => timers.add(setTimeout(fn, ms));
  const self = {};

  function layout() {
    app.innerHTML = `
      <section class="play">
        <div class="promptbar">
          <div class="prompt" aria-live="polite"></div>
          <div class="stats"></div>
          <div class="progress"><div></div></div>
        </div>
        <div class="stage">
          <p class="loading">${t('app.loading')}</p>
          <div class="sheet" hidden></div>
        </div>
        <div class="toolbar">
          <label class="select"><span class="sr-only">${t('mode.label')}</span>
            <select data-mode>${MODES.map(m => `<option value="${m}" ${m === mode ? 'selected' : ''}>${t(`mode.${m}`)}</option>`).join('')}</select>
          </label>
          <label class="select" data-detail-wrap><span class="sr-only">${t('detail.label')}</span>
            <select data-detail>${details.map(d => `<option value="${d}" ${d === detail ? 'selected' : ''}>${t(`detail.${d}`)}</option>`).join('')}</select>
          </label>
          <details class="menu layers">
            <summary class="tool">${ICONS.layers}<span class="label">${t('play.layers')}</span></summary>
            <div class="menu-panel up">${SYSTEMS.map(s => `<label class="check"><input type="checkbox" data-layer="${s}"> ${t(`system.${s}`)}</label>`).join('')}</div>
          </details>
          <span class="spacer"></span>
          <button class="tool" data-reset title="${t('play.reset')}">${ICONS.reset}<span class="label">${t('play.reset')}</span></button>
          <button class="tool" data-skip title="${t('play.skip')}">${ICONS.skip}<span class="label">${t('play.skip')}</span></button>
        </div>
        <dialog class="results"></dialog>
      </section>`;
    const root = app.querySelector('.play');
    el = {
      root,
      prompt: root.querySelector('.prompt'),
      stats: root.querySelector('.stats'),
      bar: root.querySelector('.progress div'),
      stage: root.querySelector('.stage'),
      sheet: root.querySelector('.sheet'),
      dialog: root.querySelector('dialog'),
    };
  }

  function syncToolbar() {
    el.root.querySelector('[data-detail-wrap]').hidden = mode === 'learn' || details.length < 2;
    el.root.querySelector('[data-skip]').hidden = mode === 'learn';
    el.root.querySelectorAll('[data-layer]').forEach(box => { box.checked = scene.layers[box.dataset.layer]; });
  }

  function renderStats(tries = 0) {
    if (!quiz) { el.stats.innerHTML = ''; el.bar.style.width = '0'; return; }
    const { done, total } = quiz.progress;
    el.bar.style.width = `${(done / total) * 100}%`;
    el.stats.innerHTML = `
      <span class="stat">${done}/${total}</span>
      <span class="tries" title="${t('play.tries')}">${[0, 1, 2].map(i => `<i class="${i < tries ? 'used' : ''}"></i>`).join('')}</span>
      <span class="stat" data-clock>${formatTime(performance.now() - startedAt)}</span>
      <span class="stat strong">${quiz.score()}%</span>`;
  }

  function setPrompt(kicker, name = '', note = '') {
    el.prompt.innerHTML = `<span class="kicker">${escape(kicker)}</span>${name ? ` <strong>${escape(name)}</strong>` : ''}${note ? `<span class="note">${escape(note)}</span>` : ''}`;
  }

  function renderPrompt() {
    if (!quiz) {
      if (selected) setPrompt(t(`system.${selected.system}`), nameOf(selected), descOf(selected));
      else setPrompt(t('play.learn'));
      return;
    }
    if (!scene.layers[system]) { scene.setLayer(system, true); syncToolbar(); }
    if (mode === 'click') setPrompt(t('play.find'), nameOf(quiz.current));
    else { setPrompt(t('play.which')); renderSheet(); }
  }

  function renderSheet() {
    el.sheet.hidden = false;
    const tabs = `<div class="tabs">
      <button data-style="choices" aria-pressed="${answerStyle === 'choices'}">${t('play.choices')}</button>
      <button data-style="type" aria-pressed="${answerStyle === 'type'}">${t('play.type')}</button></div>`;
    if (answerStyle === 'choices') {
      el.sheet.innerHTML = tabs + `<div class="choices">${quiz.choices(4).map(s =>
        `<button data-choice="${s.id}">${escape(nameOf(s))}</button>`).join('')}</div>`;
      el.sheet.querySelectorAll('[data-choice]').forEach(b => { b.onclick = () => answer(b.dataset.choice, b); });
    } else {
      el.sheet.innerHTML = tabs + `<form class="type"><input autocomplete="off" spellcheck="false" placeholder="${t('play.placeholder')}" aria-label="${t('play.placeholder')}"><button class="btn btn-primary">${t('play.check')}</button></form>`;
      const input = el.sheet.querySelector('input');
      el.sheet.querySelector('form').onsubmit = e => {
        e.preventDefault();
        if (!input.value.trim()) return;
        const result = answer(matches(input.value, quiz.current) ? quiz.current.id : '', null);
        if (result === 'wrong') { input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); input.select(); }
      };
      if (matchMedia('(pointer: fine)').matches) input.focus();
    }
    el.sheet.querySelectorAll('[data-style]').forEach(b => {
      b.onclick = () => { answerStyle = b.dataset.style; save('answerStyle', answerStyle); renderSheet(); };
    });
  }

  function nextPrompt(afterReveal = false) {
    locked = false;
    if (afterReveal && mode === 'click') scene.frameFocus(700);
    scene.clearHighlights();
    renderStats(0);
    if (quiz.finished) return finish();
    renderPrompt();
    if (mode === 'name') {
      scene.highlight(quiz.current.id, 'target');
      scene.flyTo(quiz.current.id);
    }
  }

  function answer(id, button) {
    if (locked || !quiz || quiz.finished) return null;
    const target = quiz.current;
    const totalBefore = quiz.progress.total;
    const { result, tries } = quiz.answer(id);
    if (result === 'ignored') return result;
    if (quiz.progress.total > totalBefore) toast(t('play.unlocked'));

    if (result === 'wrong') {
      renderStats(tries);
      if (button) { button.classList.add('wrong'); button.disabled = true; }
      if (mode === 'click') {
        scene.highlight(id, 'wrong');
        el.prompt.classList.add('shake');
        later(() => { el.prompt.classList.remove('shake'); scene.highlight(id, null); }, FEEDBACK_MS);
      }
      return result;
    }

    locked = true;
    renderStats(result === 'reveal' ? 3 : tries - 1);
    el.sheet.querySelector(`[data-choice="${target.id}"]`)?.classList.add('right');
    if (result === 'correct') {
      if (mode === 'click') scene.highlight(target.id, 'correct');
      later(nextPrompt, FEEDBACK_MS);
    } else {
      setPrompt(t('play.answer'), nameOf(target));
      if (mode === 'click') {
        scene.highlight(target.id, 'target');
        scene.flyTo(target.id);
      }
      later(() => nextPrompt(true), REVEAL_MS);
    }
    return result;
  }

  function finish() {
    clearInterval(clock);
    el.sheet.hidden = true;
    showResults(el.dialog, {
      title: quizName(quizDef),
      score: quiz.score(),
      timeMs: performance.now() - startedAt,
      key: bestKey(quizDef.id, mode, detail),
      onAgain: start,
      onAnother: () => { location.hash = '#/'; },
    });
  }

  function toast(text) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = text;
    el.stage.append(node);
    later(() => node.remove(), 2600);
  }

  function start() {
    timers.forEach(clearTimeout);
    timers.clear();
    clearInterval(clock);
    locked = false;
    selected = null;
    scene.clearHighlights();
    scene.frameFocus(0);
    el.sheet.hidden = true;
    el.sheet.innerHTML = '';
    syncToolbar();
    quiz = mode === 'learn' ? null : createQuiz({ structures, system, region: quizDef.region, mode, detail });
    if (quiz) {
      startedAt = performance.now();
      clock = setInterval(() => {
        const c = el.stats.querySelector('[data-clock]');
        if (c) c.textContent = formatTime(performance.now() - startedAt);
      }, 250);
      nextPrompt();
    } else {
      renderStats();
      renderPrompt();
    }
  }

  function wire() {
    el.root.querySelector('[data-mode]').onchange = e => { mode = e.target.value; save('mode', mode); start(); };
    el.root.querySelector('[data-detail]').onchange = e => { detail = e.target.value; save('detail', detail); start(); };
    el.root.querySelectorAll('[data-layer]').forEach(box => { box.onchange = () => scene.setLayer(box.dataset.layer, box.checked); });
    el.root.querySelector('[data-reset]').onclick = () => scene.frameFocus(600);
    el.root.querySelector('[data-skip]').onclick = () => {
      if (locked || !quiz || quiz.finished) return;
      quiz.skip();
      nextPrompt();
    };
    handlers.hover = id => {
      if (mode !== 'learn' || selected) return;
      const s = id && byId.get(id);
      if (s) setPrompt(t(`system.${s.system}`), nameOf(s));
      else renderPrompt();
    };
    handlers.pick = id => {
      if (mode === 'click') return answer(id, null);
      if (mode !== 'learn') return;
      scene.clearHighlights();
      selected = id ? byId.get(id) : null;
      if (id) scene.highlight(id, 'target');
      renderPrompt();
    };
  }

  return Object.assign(self, {
    async enter() {
      layout();
      try {
        scene = await ensureScene();
      } catch (err) {
        if (page === self) el.stage.innerHTML = `<p class="message">${t(err.message === 'webgl' ? 'error.webgl' : 'error.load')}</p>`;
        return;
      }
      if (page !== self) return;
      el.stage.querySelector('.loading').remove();
      el.stage.prepend(sceneCanvas);
      SYSTEMS.forEach(s => scene.setLayer(s, s === system || s === 'skin'));
      scene.setFocus(system, pool.map(s => s.id));
      scene.resume();
      wire();
      start();
    },
    leave() {
      timers.forEach(clearTimeout);
      clearInterval(clock);
      handlers.pick = handlers.hover = null;
      if (el.dialog?.open) el.dialog.close();
      scene?.clearHighlights();
      scene?.pause();
    },
    relabel() {
      if (!scene) return;
      el.root.querySelectorAll('[data-mode] option').forEach(o => { o.textContent = t(`mode.${o.value}`); });
      el.root.querySelectorAll('[data-detail] option').forEach(o => { o.textContent = t(`detail.${o.value}`); });
      el.root.querySelectorAll('.check').forEach(label => { label.lastChild.textContent = ` ${t(`system.${label.querySelector('input').dataset.layer}`)}`; });
      el.root.querySelector('.layers .label').textContent = t('play.layers');
      el.root.querySelector('[data-reset] .label').textContent = t('play.reset');
      el.root.querySelector('[data-skip] .label').textContent = t('play.skip');
      if (locked || (quiz && quiz.finished)) return;
      if (mode === 'name' && quiz) {
        el.sheet.querySelectorAll('[data-choice]').forEach(b => { b.textContent = nameOf(byId.get(b.dataset.choice)); });
        el.sheet.querySelectorAll('[data-style]').forEach(b => { b.textContent = t(`play.${b.dataset.style}`); });
        setPrompt(t('play.which'));
      } else renderPrompt();
    },
  });
}

/* ---------- Boot ---------- */

async function boot() {
  try {
    const [strings, data, quizList] = await Promise.all(
      ['data/strings.json', 'data/structures.json', 'data/quizzes.json'].map(u => fetch(u).then(r => r.json())));
    setStrings(strings);
    structures = data;
    quizzes = quizList;
  } catch {
    app.innerHTML = '<p class="message">Pornește site-ul printr-un server local (vezi docs/documentatie.md).<br>Run the site through a local server (see README.md).</p>';
    return;
  }
  document.documentElement.lang = getLang();
  renderNav();
  burger.onclick = () => {
    const open = drawer.hidden;
    closeMenus();
    drawer.hidden = !open;
    burger.setAttribute('aria-expanded', String(open));
  };
  document.addEventListener('click', e => {
    if (!e.target.closest('details.menu')) document.querySelectorAll('details.menu[open]').forEach(d => { d.open = false; });
    if (!e.target.closest('.search')) document.querySelectorAll('.search-results').forEach(r => { r.hidden = true; });
    if (e.target.closest('.drawer a, .menu-panel a')) closeMenus();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
  document.addEventListener('langchange', () => { renderNav(); page?.relabel?.(); });
  window.addEventListener('hashchange', route);
  route();
}

boot();
