// Pixel art (logo and star) drawn with the same 4×4 Bayer dithering as the card thumbnails.
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const threshold = (x, y) => BAYER_4[(y % 4) * 4 + (x % 4)];

const PINK = '#e6397a';
const PINK_LIGHT = '#f4a6c3';
const GOLD = '#e9b44c';

// A bone on a 16×16 grid: a shaft between two double knobs, lit from the top-left.
const GRID = 16;
const SHAFT = [[3.8, 3.8], [12.2, 12.2]];
const KNOBS = [[2.2, 5.4], [5.4, 2.2], [10.6, 13.8], [13.8, 10.6]];

function insideBone(x, y) {
  const [[ax, ay], [bx, by]] = SHAFT;
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  const shaft = Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) <= 1.45;
  return shaft || KNOBS.some(([kx, ky]) => Math.hypot(x - kx, y - ky) <= 2.2);
}

function boneCells() {
  const cells = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!insideBone(x + 0.5, y + 0.5)) continue;
      const lit = !insideBone(x - 0.5, y - 0.5) || !insideBone(x + 0.5, y - 0.5) || !insideBone(x - 0.5, y + 0.5);
      const color = lit ? (threshold(x, y) < 0.6 ? PINK_LIGHT : PINK) : PINK;
      cells.push({ x, y, color });
    }
  }
  return cells;
}

export function logoSVG(height = 24, title = '') {
  const rects = boneCells().map(({ x, y, color }) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`).join('');
  const label = title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"';
  return `<svg class="logo-mark" ${label} viewBox="0 0 ${GRID} ${GRID}" style="width:${height}px;height:${height}px" shape-rendering="crispEdges">${rects}</svg>`;
}

// A five-point star, rasterised to a grid and dithered from pink (top-left) to gold (bottom-right).
export function drawStar(canvas, cells = 14) {
  const size = canvas.clientWidth || 28;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');
  const unit = canvas.width / cells;
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.2 : 0.5;
    return [0.5 + r * Math.cos(angle), 0.54 + r * Math.sin(angle)];
  });
  const inside = (px, py) => {
    let hit = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      if (!inside((x + 0.5) / cells, (y + 0.5) / cells)) continue;
      const gradient = (x + y) / (2 * (cells - 1));
      ctx.fillStyle = gradient > threshold(x, y) ? GOLD : PINK;
      ctx.fillRect(Math.floor(x * unit), Math.floor(y * unit), Math.ceil(unit), Math.ceil(unit));
    }
  }
}
