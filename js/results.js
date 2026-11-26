import { t } from './i18n.js';
import { isBetter } from './quiz.js';
import { load, save } from './storage.js';
import { drawStar } from './logo.js';

export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function countUp(el, to, ms = 1000) {
  const start = performance.now();
  function step(now) {
    const k = Math.min((now - start) / ms, 1);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// A burst of square pink dots snapped to a 4px grid, like the dithered thumbnails.
function celebrate(canvas) {
  if (!canvas.isConnected) return;
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width;
  canvas.height = height;
  const pink = getComputedStyle(document.documentElement).getPropertyValue('--pink');
  const dots = Array.from({ length: 160 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 5;
    return { x: width / 2, y: height * 0.35, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2 };
  });
  const start = performance.now();
  function step(now) {
    const k = (now - start) / 1400;
    if (!canvas.isConnected) return;
    ctx.clearRect(0, 0, width, height);
    if (k >= 1) return;
    ctx.fillStyle = pink;
    ctx.globalAlpha = 1 - k;
    for (const d of dots) {
      d.x += d.vx;
      d.y += d.vy;
      d.vy += 0.1;
      ctx.fillRect(Math.round(d.x / 4) * 4, Math.round(d.y / 4) * 4, 4, 4);
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

export function bestScore(key) {
  return load(key, null);
}

const escape = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function showResults(dialog, { title, score, timeMs, total, key, mistakes = [], reviewCount = 0, onAgain, onAnother, onShow, onReview }) {
  const best = load(key, null);
  const record = isBetter({ score, timeMs }, best);
  if (record) save(key, { score, timeMs, total });

  dialog.innerHTML = `
    <canvas aria-hidden="true"></canvas>
    ${score === 100 ? '<canvas class="star results-star" aria-hidden="true"></canvas>' : ''}
    <p class="results-title">${title}</p>
    <p class="results-score"><span>0</span>%</p>
    <p class="results-meta">${t('results.time')} ${formatTime(timeMs)}${record ? ` <span class="badge">${t('results.record')}</span>` : ''}</p>
    ${mistakes.length ? `<div class="mistakes">
      <p class="mistakes-title">${t('results.mistakes')} (${mistakes.length})</p>
      <ul>${mistakes.map(m => `<li><span>${escape(m.name)}</span><button class="link" data-show="${m.id}">${t('results.show')}</button></li>`).join('')}</ul>
    </div>` : ''}
    <div class="results-actions">
      ${reviewCount ? `<button class="btn" data-review>${t('results.review')} (${reviewCount})</button>` : ''}
      <button class="btn btn-primary" data-again>${t('results.again')}</button>
      <button class="btn" data-another>${t('results.another')}</button>
    </div>`;
  dialog.showModal();
  const star = dialog.querySelector('.results-star');
  if (star) drawStar(star);
  countUp(dialog.querySelector('.results-score span'), score);
  const confetti = dialog.querySelector('canvas:not(.star)');
  if (score === 100) setTimeout(() => celebrate(confetti), 500);
  dialog.querySelector('[data-again]').onclick = () => { dialog.close(); onAgain(); };
  dialog.querySelector('[data-another]').onclick = () => { dialog.close(); onAnother(); };
  dialog.querySelector('[data-review]')?.addEventListener('click', () => { dialog.close(); onReview(); });
  dialog.querySelectorAll('[data-show]').forEach(b => { b.onclick = () => { dialog.close(); onShow(b.dataset.show); }; });
}
