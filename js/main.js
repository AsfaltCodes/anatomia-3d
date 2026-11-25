import { t, setStrings, setLang, getLang, nameOf, descOf, matches, normalize } from './i18n.js';
import { load, save } from './storage.js';
import { createQuiz, availableDetails, isComplete } from './quiz.js';
import { createScene, SYSTEMS, hasWebGL } from './scene.js';
import { createThumbnails } from './dither.js';
import { showResults, formatTime } from './results.js';
import { logoSVG, drawStar } from './logo.js';

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
// A card only shows runs that covered the whole quiz, so 100% always means every part.
const bestOf = q => ['all', 'progressive', 'main']
  .map(d => load(bestKey(q.id, 'click', d), null))
  .filter(r => isComplete(r, poolOf(q).length))
  .reduce((a, b) => (!a || b.score > a.score ? b : a), null);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const noHover = matchMedia('(hover: none)');

function toast(text) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = text;
  document.querySelector('.toasts').append(node);
  setTimeout(() => node.remove(), 2600);
}

function footer() {
  return `<footer class="site-footer">
    <nav aria-label="Footer">
      <a href="#/" data-top>${t('footer.quizzes')}</a>
      <a href="#/despre">${t('footer.about')}</a>
      <a href="#/confidentialitate">${t('footer.privacy')}</a>
    </nav>
    <p>${t('app.credits')}</p>
    <p>© 2026 Anatomia 3D · ${t('footer.made')}</p>
  </footer>`;
}

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

const INFO_ROUTES = { '#/despre': 'about', '#/confidentialitate': 'privacy' };

function route() {
  closeMenus();
  page?.leave?.();
  const match = location.hash.match(/^#\/quiz\/([\w-]+)$/);
  const quiz = match && quizzes.find(q => q.id === match[1]);
  const info = INFO_ROUTES[location.hash];
  if (match) page = quiz ? playPage(quiz) : notFound();
  else if (info) page = infoPage(info);
  else page = homePage();
  document.body.dataset.page = match ? 'play' : 'page';
  if (page !== homeInstance) window.scrollTo(0, 0);
  page.enter();
  setTitle();
}

function setTitle() {
  const quiz = location.hash.startsWith('#/quiz/') && quizzes.find(q => location.hash === `#/quiz/${q.id}`);
  const info = INFO_ROUTES[location.hash];
  const label = quiz ? quizName(quiz) : info ? t(`${info}.title`) : '';
  document.title = label ? `${label} · Anatomia 3D` : 'Anatomia 3D';
}

function infoPage(kind) {
  const paragraphs = text => text.split('\n\n').map(p => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`).join('');
  const self = {
    enter() {
      app.innerHTML = `
        <article class="info">
          <h1>${t(`${kind}.title`)}</h1>
          ${paragraphs(t(`${kind}.body`))}
          ${kind === 'about' ? `<h2>${t('about.sources')}</h2>${paragraphs(t('about.licenses'))}` : ''}
          ${kind === 'privacy' ? `<button class="btn" data-reset-progress>${t('privacy.reset')}</button>` : ''}
        </article>
        ${footer()}`;
      app.querySelector('[data-reset-progress]')?.addEventListener('click', () => {
        if (!confirm(t('privacy.confirm'))) return;
        try {
          Object.keys(localStorage).filter(k => k.startsWith('best:')).forEach(k => localStorage.removeItem(k));
        } catch {}
        toast(t('privacy.done'));
      });
    },
    relabel() { self.enter(); setTitle(); },
  };
  return self;
}

function notFound() {
  return {
    enter() { app.innerHTML = `<p class="message">${t('error.notfound')} <a href="#/">${t('nav.home')}</a></p>`; },
    relabel() { this.enter(); },
  };
}

/* ---------- Home ---------- */

let homeInstance = null;
let homeScroll = 0;

function homePage() {
  let thumbs = null;
  let spinning = null;
  let scrollFrame = 0;

  function render() {
    const complete = quizzes.filter(q => bestOf(q)?.score === 100).length;
    app.innerHTML = `
      <div class="home">
        <header class="hero">
          <div class="hero-mark">${logoSVG(96)}</div>
          <h1>Anatomia 3D</h1>
          <p class="hero-lead">${t('home.lead')}</p>
          <div class="search hero-search">
            <input type="search" autocomplete="off" spellcheck="false">
            <div class="search-results" role="listbox" hidden></div>
          </div>
          <div class="chips">${QUIZ_SYSTEMS.map(s => `<button class="chip" data-jump="${s}">${t(`system.${s}`)}</button>`).join('')}</div>
          ${complete ? `<p class="hero-progress">${complete} ${t('home.of')} ${quizzes.length} ${t('home.complete')}</p>` : ''}
        </header>
        ${QUIZ_SYSTEMS.map(system => `
          <section class="group" id="group-${system}">
            <h2>${t(`system.${system}`)}</h2>
            <div class="cards">${quizzes.filter(q => q.system === system).map(card).join('')}</div>
          </section>`).join('')}
      </div>
      ${footer()}`;
    attachSearch(app.querySelector('.hero-search'));
    app.querySelectorAll('[data-jump]').forEach(b => {
      b.onclick = () => document.getElementById(`group-${b.dataset.jump}`).scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    });
    app.querySelectorAll('.star').forEach(c => drawStar(c));
    drawThumbnails();
  }

  function card(q) {
    const best = bestOf(q);
    const perfect = best?.score === 100;
    return `<a class="card${perfect ? ' perfect' : ''}" href="#/quiz/${q.id}" data-quiz="${q.id}">
      <span class="thumb-wrap">
        <canvas class="thumb" aria-hidden="true"></canvas>
        ${perfect ? `<canvas class="star" role="img" aria-label="${t('home.perfect')}" title="${t('home.perfect')}"></canvas>` : ''}
      </span>
      <span class="card-body">
        <span class="card-title">${escape(quizName(q))}</span>
        <span class="card-meta">
          <span>${poolOf(q).length} ${t('home.parts')}</span>
          <span class="${best ? 'card-best' : ''}">${best ? `${t('home.best')} ${best.score}%` : t('home.notPlayed')}</span>
        </span>
        <span class="card-progress" aria-hidden="true"><i style="width:${best ? best.score : 0}%"></i></span>
      </span>
    </a>`;
  }

  function spinCard(el) {
    if (!thumbs || reducedMotion.matches || el === spinning) return;
    spinning = el;
    if (el) thumbs.spin(el.querySelector('.thumb'), el.dataset.quiz);
    else thumbs.stop();
  }

  // Touch screens can't hover, so the card nearest the middle of the screen spins instead.
  function spinCentreCard() {
    scrollFrame = 0;
    if (!noHover.matches || page !== self) return;
    const middle = innerHeight / 2;
    let best = null;
    let bestDistance = Infinity;
    app.querySelectorAll('.card').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const d = Math.abs(r.top + r.height / 2 - middle);
      if (d < bestDistance) { bestDistance = d; best = el; }
    });
    spinCard(best);
  }
  const onScroll = () => { scrollFrame ||= requestAnimationFrame(spinCentreCard); };

  function drawThumbnails() {
    if (!thumbs) return;
    spinning = null;
    app.querySelectorAll('.card').forEach(el => {
      const canvas = el.querySelector('.thumb');
      thumbs.draw(canvas, el.dataset.quiz);
      canvas.classList.add('drawn');
      if (noHover.matches) return;
      el.addEventListener('pointerenter', () => spinCard(el));
      el.addEventListener('focus', () => spinCard(el));
      el.addEventListener('pointerleave', () => spinCard(null));
      el.addEventListener('blur', () => spinCard(null));
    });
    spinCentreCard();
  }

  const self = {
    enter() {
      render();
      requestAnimationFrame(() => window.scrollTo(0, homeScroll));
      addEventListener('scroll', onScroll, { passive: true });
      thumbsPromise ??= createThumbnails(structures, quizzes).catch(() => null);
      thumbsPromise.then(result => {
        thumbs = result;
        if (page === self) drawThumbnails();
      });
    },
    leave() {
      homeScroll = scrollY;
      removeEventListener('scroll', onScroll);
      thumbs?.stop();
    },
    relabel: render,
  };
  homeInstance = self;
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
  let mode = 'click';
  let detail = details.includes('all') ? 'all' : details[0];
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
          <a class="back" href="#/"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.7 4.3 7 10l5.7 5.7-1.4 1.4L4.2 10l7.1-7.1 1.4 1.4Z"/></svg><span>${escape(quizName(quizDef))}</span></a>
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
    if (quiz.progress.total > totalBefore) stageToast(t('play.unlocked'));

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
      total: quiz.progress.total,
      key: bestKey(quizDef.id, mode, detail),
      onAgain: start,
      onAnother: () => { location.hash = '#/'; },
    });
  }

  function stageToast(text) {
    const node = document.createElement('div');
    node.className = 'stage-toast';
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
    el.root.querySelector('[data-mode]').onchange = e => { mode = e.target.value; start(); };
    el.root.querySelector('[data-detail]').onchange = e => { detail = e.target.value; start(); };
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
    let lastEmptyTap = 0;
    handlers.pick = id => {
      if (!id) {
        const now = performance.now();
        if (now - lastEmptyTap < 350) scene.frameFocus(500);
        lastEmptyTap = now;
      }
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
      el.root.querySelector('.back span').textContent = quizName(quizDef);
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
  document.querySelector('.brand-mark').outerHTML = logoSVG(26);
  const skip = document.querySelector('[data-skip-link]');
  skip.onclick = e => { e.preventDefault(); app.focus(); };
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
    if (e.target.closest('[data-top]') && location.hash === '#/') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
  document.addEventListener('langchange', () => {
    renderNav();
    skip.textContent = t('nav.skip');
    page?.relabel?.();
    setTitle();
  });
  skip.textContent = t('nav.skip');
  window.addEventListener('hashchange', route);
  route();
}

boot();
