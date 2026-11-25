import { t } from './i18n.js';
import { isBetter } from './quiz.js';
import { load, save } from './storage.js';

export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function countUp(el, to, ms = 1200) {
  const start = performance.now();
  function step(now) {
    const k = Math.min((now - start) / ms, 1);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// A burst of square "dither dots" in the accent colour, snapped to a 4px grid.
function celebrate(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width;
  canvas.height = height;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent');
  const dots = Array.from({ length: 220 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 7;
    return { x: width / 2, y: height / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 2 };
  });
  const start = performance.now();
  function step(now) {
    const k = (now - start) / 1500;
    ctx.clearRect(0, 0, width, height);
    if (k >= 1) return;
    ctx.fillStyle = accent;
    ctx.globalAlpha = 1 - k;
    for (const d of dots) {
      d.x += d.vx;
      d.y += d.vy;
      d.vy += 0.12;
      ctx.fillRect(Math.round(d.x / 4) * 4, Math.round(d.y / 4) * 4, 4, 4);
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

export function showResults(container, { score, timeMs, key, onAgain, onMenu }) {
  const best = load(key, null);
  const record = isBetter({ score, timeMs }, best);
  if (record) save(key, { score, timeMs });

  container.innerHTML = `
    <section class="results">
      <canvas></canvas>
      <div>
        <p class="eyebrow">${t('results.heading')}</p>
        ${record ? `<span class="record">${t('results.record')}</span>` : ''}
        <p class="score"><span>0</span><small>%</small></p>
        <p class="meta">${t('results.time')} ${formatTime(timeMs)}</p>
        <div class="row">
          <button class="btn" data-again>${t('results.again')}</button>
          <button class="btn btn-ghost" data-menu>${t('results.menu')}</button>
        </div>
      </div>
    </section>`;
  countUp(container.querySelector('.score span'), score);
  if (score === 100) setTimeout(() => celebrate(container.querySelector('canvas')), 900);
  container.querySelector('[data-again]').onclick = onAgain;
  container.querySelector('[data-menu]').onclick = onMenu;
}
