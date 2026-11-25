// Pixel art (logo and star) in the same 4×4 Bayer dither as the card thumbnails.
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const threshold = (x, y) => BAYER_4[(y % 4) * 4 + (x % 4)];
const cssColor = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// A vertebra seen from above: the body at the top, the hole for the spinal cord,
// the transverse processes as wings and the spinous process pointing down.
const VERTEBRA = [
  '................',
  '.....######.....',
  '...##########...',
  '..############..',
  '..############..',
  '...##########...',
  '....########....',
  '....##....##....',
  '######....######',
  '.#####....#####.',
  '.....##..##.....',
  '......####......',
  '.......##.......',
  '.......##.......',
  '.......##.......',
  '................',
];
const GRID = 16;
const PINK = '#e6397a';
const PINK_LIGHT = '#f6a5c4';

export function logoSVG(height = 24, title = '') {
  const rects = [];
  VERTEBRA.forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== '#') return;
    const topEdge = y < 6 && VERTEBRA[y - 1]?.[x] !== '#';
    rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${topEdge ? PINK_LIGHT : PINK}"/>`);
  }));
  const label = title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"';
  return `<svg class="logo-mark" ${label} viewBox="0 0 ${GRID} ${GRID}" style="width:${height}px;height:${height}px" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}

/* ---------- Star ---------- */

const STAR_CELLS = 14;
const STAR_POINTS = Array.from({ length: 10 }, (_, i) => {
  const angle = -Math.PI / 2 + (i * Math.PI) / 5;
  const r = i % 2 ? 0.2 : 0.5;
  return [0.5 + r * Math.cos(angle), 0.54 + r * Math.sin(angle)];
});

function insideStar(px, py) {
  let hit = false;
  for (let i = 0, j = STAR_POINTS.length - 1; i < STAR_POINTS.length; j = i++) {
    const [xi, yi] = STAR_POINTS[i];
    const [xj, yj] = STAR_POINTS[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// The star turns around its vertical axis: it is squashed by cos(angle), and how much light
// a cell catches decides, through the Bayer matrix, whether it is gold (lit) or pink (shadow).
export function drawStar(canvas, angle = 0) {
  const size = canvas.clientWidth || 52;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const px = Math.round(size * dpr);
  if (canvas.width !== px) canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  const unit = px / STAR_CELLS;
  const squash = Math.cos(angle);
  const facing = Math.abs(squash);
  const gold = cssColor('--gold') || '#e9b44c';
  const pink = cssColor('--pink') || PINK;
  ctx.clearRect(0, 0, px, px);
  if (facing < 0.08) return;
  for (let y = 0; y < STAR_CELLS; y++) {
    for (let x = 0; x < STAR_CELLS; x++) {
      const u = ((x + 0.5) / STAR_CELLS - 0.5) / squash + 0.5;
      const v = (y + 0.5) / STAR_CELLS;
      if (u < 0 || u > 1 || !insideStar(u, v)) continue;
      const side = squash > 0 ? 1 - u : u;
      const light = (0.25 + 0.75 * facing) * (0.55 + 0.6 * side);
      ctx.fillStyle = light > threshold(x, y) ? gold : pink;
      ctx.fillRect(Math.floor(x * unit), Math.floor(y * unit), Math.ceil(unit), Math.ceil(unit));
    }
  }
}

// One animation loop for every star on the page; it stops by itself when none are left.
const TURN_MS = 2400;
let starLoop = 0;

export function startStars() {
  const stars = () => document.querySelectorAll('canvas.star');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stars().forEach(c => drawStar(c, 0));
    return;
  }
  if (starLoop) return;
  const tick = now => {
    const list = stars();
    if (!list.length || document.hidden) { starLoop = 0; return; }
    const angle = (now / TURN_MS) * Math.PI * 2;
    list.forEach(c => drawStar(c, angle));
    starLoop = requestAnimationFrame(tick);
  };
  starLoop = requestAnimationFrame(tick);
}

globalThis.document?.addEventListener('visibilitychange', () => { if (!document.hidden) startStars(); });
