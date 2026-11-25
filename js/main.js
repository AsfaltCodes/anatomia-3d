import { t, setStrings, setLang, getLang, nameOf, descOf, matches } from './i18n.js';
import { load, save } from './storage.js';
import { createQuiz } from './quiz.js';
import { createScene, SYSTEMS, hasWebGL } from './scene.js';
import { createTitle } from './dither.js';
import { showResults, formatTime } from './results.js';

const app = document.getElementById('app');
const QUIZ_SYSTEMS = ['bones', 'muscles', 'nerves'];
const MODES = ['click', 'name', 'learn'];
const DETAILS = ['main', 'all', 'progressive'];
const FEEDBACK_MS = 650;
const REVEAL_MS = 1400;

let structures = [];
let screen = null;
let scene = null;
let gameCanvas = null;
const handlers = { pick: null, hover: null };

const escape = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const bestKey = ({ system, mode, detail }) => `best:${system}:${mode}:${detail}`;

function show(next) {
  screen?.leave?.();
  screen = next;
  app.innerHTML = '';
  screen.enter();
}

function relabelStatic() {
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === getLang()));
}

function titleScreen() {
  let title = null;
  return {
    enter() {
      app.innerHTML = `
        <section class="title">
          <div>
            <p class="eyebrow">${t('app.tagline')}</p>
            <h1>Anatomia<br><em>3D</em></h1>
            <p class="lead">${t('app.lead')}</p>
            <button class="btn" data-start>${t('title.start')} <span aria-hidden="true">→</span></button>
          </div>
          <canvas class="title-canvas" aria-hidden="true"></canvas>
        </section>`;
      app.querySelector('[data-start]').onclick = () => show(menuScreen());
      createTitle(app.querySelector('canvas')).then(handle => {
        if (screen === this) title = handle;
        else handle.dispose();
      });
    },
    leave() { title?.dispose(); },
    relabel() {
      app.querySelector('.title .eyebrow').textContent = t('app.tagline');
      app.querySelector('.title .lead').textContent = t('app.lead');
      app.querySelector('[data-start]').firstChild.textContent = `${t('title.start')} `;
    },
  };
}

function menuScreen() {
  const choice = { system: 'bones', mode: 'click', detail: 'main', ...load('menu', {}) };
  const count = (system, detail) => structures.filter(s => s.system === system && (detail !== 'main' || s.tier === 1)).length;

  function option(group, value, title, sub) {
    return `<button class="option" data-group="${group}" data-value="${value}" aria-pressed="${choice[group] === value}">
      <strong>${title}</strong><span>${sub}</span></button>`;
  }

  function render() {
    const best = load(bestKey(choice), null);
    app.innerHTML = `
      <section class="menu">
        <h2>${t('menu.heading')}</h2>
        <div class="menu-group">
          <p class="eyebrow">${t('menu.system')}</p>
          <div class="options">${QUIZ_SYSTEMS.map(s => option('system', s, t(`system.${s}`), `${count(s, 'all')} ${t('menu.count')}`)).join('')}</div>
        </div>
        <div class="menu-group">
          <p class="eyebrow">${t('menu.mode')}</p>
          <div class="options">${MODES.map(m => option('mode', m, t(`mode.${m}`), t(`mode.${m}.desc`))).join('')}</div>
        </div>
        ${choice.mode === 'learn' ? '' : `
        <div class="menu-group">
          <p class="eyebrow">${t('menu.detail')}</p>
          <div class="options">
            ${option('detail', 'main', t('detail.main'), `${count(choice.system, 'main')} ${t('menu.count')}`)}
            ${option('detail', 'all', t('detail.all'), `${count(choice.system, 'all')} ${t('menu.count')}`)}
            ${option('detail', 'progressive', t('detail.progressive'), t('detail.progressive.desc'))}
          </div>
        </div>`}
        <div class="menu-foot">
          <p class="best">${choice.mode === 'learn' ? '' : best
            ? `${t('menu.best')}: <b>${best.score}%</b> · ${formatTime(best.timeMs)}`
            : t('menu.nobest')}</p>
          <button class="btn" data-play>${t('menu.play')} <span aria-hidden="true">→</span></button>
        </div>
      </section>`;
    app.querySelectorAll('.option').forEach(b => b.onclick = () => {
      choice[b.dataset.group] = b.dataset.value;
      save('menu', choice);
      render();
    });
    app.querySelector('[data-play]').onclick = () => show(gameScreen({ ...choice }));
  }

  return { enter: render, relabel: render };
}

async function ensureScene() {
  if (scene) return scene;
  gameCanvas = document.createElement('canvas');
  scene = await createScene(gameCanvas, structures);
  scene.onPick((id, e) => handlers.pick?.(id, e));
  scene.onHover((id, e) => handlers.hover?.(id, e));
  scene.start();
  return scene;
}

function gameScreen(config) {
  const { system, mode, detail } = config;
  const byId = new Map(structures.map(s => [s.id, s]));
  const quiz = mode === 'learn' ? null : createQuiz({ structures, system, mode, detail });
  let answerStyle = load('answerStyle', 'choices');
  let startedAt = 0;
  let timer = 0;
  let locked = false;
  let selected = null;
  let el = {};
  const timers = new Set();
  const later = (fn, ms) => timers.add(setTimeout(fn, ms));

  function layout() {
    app.innerHTML = `
      <section class="game">
        <div class="hud">
          <div class="prompt">
            <p class="eyebrow" data-k="eyebrow"></p>
            <h2 data-k="title">${t('app.loading')}</h2>
            ${quiz ? '<div class="progress"><div></div></div><div class="tries"><i></i><i></i><i></i></div>' : ''}
          </div>
          ${quiz ? `<div class="stats">
            <div class="stat"><span class="eyebrow">%</span><b data-k="score">0</b></div>
            <div class="stat"><span class="eyebrow" data-k="timeLabel"></span><b data-k="time">00:00</b></div>
          </div>` : ''}
        </div>
        ${mode === 'name' ? '<div class="answer"></div>' : ''}
        <div class="side">
          <div class="layers"><p class="eyebrow" data-k="layersLabel"></p>
            ${SYSTEMS.map(s => `<label><input type="checkbox" data-layer="${s}"> <span data-k="layer-${s}"></span></label>`).join('')}
          </div>
          <div class="actions">
            <button class="btn btn-ghost btn-small" data-reset></button>
            ${quiz ? '<button class="btn btn-ghost btn-small" data-skip></button>' : ''}
            <button class="btn btn-small" data-quit></button>
          </div>
        </div>
        <p class="hint" data-k="hint"></p>
        <div class="tooltip"></div>
        <aside class="panel"><button data-close></button><p class="eyebrow"></p><h3></h3><p class="alt"></p><p class="desc"></p></aside>
      </section>`;
    const root = app.querySelector('.game');
    const q = k => root.querySelector(`[data-k="${k}"]`);
    el = { root, q, title: q('title'), eyebrow: q('eyebrow'), answer: root.querySelector('.answer'),
      tooltip: root.querySelector('.tooltip'), panel: root.querySelector('.panel') };
  }

  function relabel() {
    const { q, root } = el;
    el.tooltip.classList.remove('show');
    q('layersLabel').textContent = t('game.layers');
    SYSTEMS.forEach(s => { q(`layer-${s}`).textContent = t(`system.${s}`); });
    q('hint').textContent = mode === 'learn' ? `${t('learn.hint')} · ${t('game.hint')}` : t('game.hint');
    if (quiz) q('timeLabel').textContent = t('results.time');
    root.querySelector('[data-reset]').textContent = t('game.reset');
    root.querySelector('[data-quit]').textContent = t('game.quit');
    root.querySelector('[data-skip]')?.replaceChildren(t('game.skip'));
    root.querySelector('[data-close]').textContent = t('learn.close');
    if (quiz && !quiz.finished && !locked) renderPrompt();
    if (!quiz) {
      el.eyebrow.textContent = t('mode.learn');
      el.title.textContent = t(`system.${system}`);
      if (selected) openPanel(selected);
    }
  }

  function syncLayers() {
    el.root.querySelectorAll('[data-layer]').forEach(box => { box.checked = scene.layers[box.dataset.layer]; });
  }

  function renderTries(used = 0) {
    el.root.querySelectorAll('.tries i').forEach((dot, i) => dot.classList.toggle('used', i < used));
  }

  function renderStats() {
    const { done, total } = quiz.progress;
    el.root.querySelector('.progress div').style.width = `${(done / total) * 100}%`;
    el.q('score').textContent = quiz.score();
  }

  function renderPrompt() {
    const target = quiz.current;
    if (!scene.layers[system]) { scene.setLayer(system, true); syncLayers(); }
    if (mode === 'click') {
      el.eyebrow.textContent = t('game.find');
      el.title.textContent = nameOf(target);
    } else {
      el.eyebrow.textContent = t('mode.name');
      el.title.textContent = t('game.which');
      renderAnswer();
    }
  }

  function renderAnswer() {
    const tabs = `<div class="answer-tabs">
      <button data-style="choices" aria-pressed="${answerStyle === 'choices'}">${t('game.choices')}</button>
      <button data-style="type" aria-pressed="${answerStyle === 'type'}">${t('game.type')}</button></div>`;
    if (answerStyle === 'choices') {
      el.answer.innerHTML = tabs + `<div class="choices">${quiz.choices(4).map(s =>
        `<button data-choice="${s.id}">${escape(nameOf(s))}</button>`).join('')}</div>`;
      el.answer.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => answer(b.dataset.choice, b));
    } else {
      el.answer.innerHTML = tabs + `<form class="type-row"><input autocomplete="off" placeholder="${t('game.placeholder')}" aria-label="${t('game.answer')}"><button class="btn">${t('game.submit')}</button></form>`;
      const input = el.answer.querySelector('input');
      el.answer.querySelector('form').onsubmit = e => {
        e.preventDefault();
        if (!input.value.trim()) return;
        const ok = matches(input.value, quiz.current);
        const r = answer(ok ? quiz.current.id : '', null);
        if (r === 'wrong') { input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); input.select(); }
      };
      input.focus();
    }
    el.answer.querySelectorAll('[data-style]').forEach(b => b.onclick = () => {
      answerStyle = b.dataset.style;
      save('answerStyle', answerStyle);
      renderAnswer();
    });
  }

  function nextPrompt(afterReveal = false) {
    locked = false;
    if (afterReveal && mode === 'click') scene.reset();
    scene.clearHighlights();
    renderTries(0);
    renderStats();
    if (quiz.finished) return finish();
    renderPrompt();
    if (mode === 'name') {
      scene.highlight(quiz.current.id, 'target');
      scene.flyTo(quiz.current.id);
    }
  }

  function answer(id, button) {
    if (locked || quiz.finished) return null;
    const target = quiz.current;
    const totalBefore = quiz.progress.total;
    const { result, tries } = quiz.answer(id);
    if (result === 'ignored') return result;
    if (quiz.progress.total > totalBefore) toast(t('game.unlocked'));

    if (result === 'wrong') {
      renderTries(tries);
      if (button) { button.classList.add('wrong'); button.disabled = true; }
      if (mode === 'click') {
        scene.highlight(id, 'wrong');
        el.title.classList.add('flash-wrong');
        later(() => { el.title.classList.remove('flash-wrong'); scene.highlight(id, null); }, FEEDBACK_MS);
      }
      return result;
    }

    locked = true;
    renderTries(result === 'reveal' ? 3 : tries - 1);
    renderStats();
    const rightButton = el.answer?.querySelector(`[data-choice="${target.id}"]`);
    rightButton?.classList.add('right');
    if (result === 'correct') {
      if (mode === 'click') scene.highlight(target.id, 'correct');
      later(nextPrompt, FEEDBACK_MS);
    } else {
      if (mode === 'click') {
        el.eyebrow.textContent = t('game.answer');
        scene.highlight(target.id, 'target');
        scene.flyTo(target.id);
      } else {
        el.title.textContent = nameOf(target);
      }
      later(() => nextPrompt(true), REVEAL_MS);
    }
    return result;
  }

  function finish() {
    const timeMs = performance.now() - startedAt;
    show(resultsScreen({ config, score: quiz.score(), timeMs }));
  }

  function toast(text) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = text;
    el.root.append(node);
    setTimeout(() => node.remove(), 2500);
  }

  function openPanel(s) {
    const other = getLang() === 'ro' ? 'en' : 'ro';
    el.panel.querySelector('.eyebrow').textContent = t(`system.${s.system}`);
    el.panel.querySelector('h3').textContent = nameOf(s);
    el.panel.querySelector('.alt').textContent = s.name[other];
    el.panel.querySelector('.desc').textContent = descOf(s);
    el.panel.classList.add('open');
  }

  function closePanel() {
    selected = null;
    el.panel.classList.remove('open');
    scene.clearHighlights();
  }

  function wire() {
    el.root.querySelectorAll('[data-layer]').forEach(box => box.onchange = () => scene.setLayer(box.dataset.layer, box.checked));
    el.root.querySelector('[data-reset]').onclick = () => scene.reset();
    el.root.querySelector('[data-quit]').onclick = () => show(menuScreen());
    el.root.querySelector('[data-close]').onclick = closePanel;
    const skip = el.root.querySelector('[data-skip]');
    if (skip) skip.onclick = () => {
      if (locked || quiz.finished) return;
      quiz.skip();
      nextPrompt();
    };

    handlers.hover = (id, e) => {
      const s = id && byId.get(id);
      if (mode === 'learn' && s) {
        el.tooltip.textContent = nameOf(s);
        el.tooltip.style.left = `${e.clientX}px`;
        el.tooltip.style.top = `${e.clientY}px`;
      }
      el.tooltip.classList.toggle('show', mode === 'learn' && !!s);
    };
    handlers.pick = id => {
      if (mode === 'click') return answer(id, null);
      if (mode === 'learn') {
        if (!id) return closePanel();
        selected = byId.get(id);
        scene.clearHighlights();
        scene.highlight(id, 'target');
        openPanel(selected);
      }
    };
  }

  return {
    async enter() {
      layout();
      try {
        await ensureScene();
      } catch (err) {
        app.innerHTML = `<p class="center-msg">${t(err.message === 'webgl' ? 'error.webgl' : 'error.load')}</p>`;
        return;
      }
      if (screen !== this) return;
      el.root.prepend(gameCanvas);
      SYSTEMS.forEach(s => scene.setLayer(s, s === system || s === 'skin'));
      scene.setPickSystem(system);
      scene.clearHighlights();
      scene.frameSystem(system);
      syncLayers();
      wire();
      relabel();
      if (quiz) {
        startedAt = performance.now();
        timer = setInterval(() => { el.q('time').textContent = formatTime(performance.now() - startedAt); }, 250);
        nextPrompt();
      }
    },
    leave() {
      clearInterval(timer);
      timers.forEach(clearTimeout);
      handlers.pick = handlers.hover = null;
      scene?.clearHighlights();
    },
    relabel,
  };
}

function resultsScreen({ config, score, timeMs }) {
  const render = () => showResults(app, {
    score, timeMs, key: bestKey(config),
    onAgain: () => show(gameScreen(config)),
    onMenu: () => show(menuScreen()),
  });
  let shown = false;
  return {
    enter() { render(); shown = true; },
    relabel() {
      app.querySelector('.results .eyebrow').textContent = t('results.heading');
      app.querySelector('.meta').textContent = `${t('results.time')} ${formatTime(timeMs)}`;
      app.querySelector('[data-again]').textContent = t('results.again');
      app.querySelector('[data-menu]').textContent = t('results.menu');
      app.querySelector('.record')?.replaceChildren(t('results.record'));
      return shown;
    },
  };
}

async function boot() {
  document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => setLang(b.dataset.lang));
  document.querySelector('[data-go="title"]').onclick = () => show(titleScreen());
  document.addEventListener('langchange', () => { relabelStatic(); screen?.relabel?.(); });
  document.documentElement.lang = getLang();
  try {
    const [strings, data] = await Promise.all(['data/strings.json', 'data/structures.json'].map(u => fetch(u).then(r => r.json())));
    setStrings(strings);
    structures = data;
  } catch {
    app.innerHTML = '<p class="center-msg">Pornește site-ul printr-un server local (vezi docs/documentatie.md).<br>Run the site through a local server (see README.md).</p>';
    return;
  }
  relabelStatic();
  if (!hasWebGL()) {
    app.innerHTML = `<p class="center-msg">${t('error.webgl')}</p>`;
    return;
  }
  show(titleScreen());
}

boot();
