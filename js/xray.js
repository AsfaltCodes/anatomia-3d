// The title's "x-ray" lens: a copy of the word filled with dither dots, clipped to a circle
// that follows the pointer (or drifts by itself until someone touches it).
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const IDLE_MS = 2500;

function ditherTile(density, ink, paper) {
  const cells = BAYER_4.map((t, i) => t < density
    ? `<rect x="${i % 4}" y="${Math.floor(i / 4)}" width="1" height="1" fill="${ink}"/>` : '').join('');
  const background = paper ? `<rect width="4" height="4" fill="${paper}"/>` : '';
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 4' shape-rendering='crispEdges'>${background}${cells}</svg>`)}")`;
}

export function paintXrayPatterns(root) {
  const css = getComputedStyle(document.documentElement);
  const pink = css.getPropertyValue('--pink').trim();
  const film = css.getPropertyValue('--pink-soft').trim();
  root.style.setProperty('--xray-letters', ditherTile(0.7, pink));
  root.style.setProperty('--xray-film', ditherTile(0.13, pink, film));
}

export function createXray(root) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastInput = -Infinity;
  let raf = 0;

  function place(x, y) {
    root.style.setProperty('--x', `${x}px`);
    root.style.setProperty('--y', `${y}px`);
  }

  function drift(now) {
    raf = requestAnimationFrame(drift);
    if (now - lastInput < IDLE_MS) return;
    const { width, height } = root.getBoundingClientRect();
    const t = now / 1000;
    place(width * (0.5 + 0.38 * Math.sin(t * 0.45)), height * (0.5 + 0.22 * Math.sin(t * 0.9 + 1)));
  }

  function follow(e) {
    const rect = root.getBoundingClientRect();
    lastInput = performance.now();
    place(e.clientX - rect.left, e.clientY - rect.top);
  }

  paintXrayPatterns(root);
  root.addEventListener('pointermove', follow);
  root.addEventListener('pointerdown', follow);
  const onTheme = () => paintXrayPatterns(root);
  document.addEventListener('themechange', onTheme);

  if (reduced) {
    const { width, height } = root.getBoundingClientRect();
    place(width * 0.42, height * 0.5);
  } else {
    raf = requestAnimationFrame(drift);
  }

  return {
    dispose() {
      cancelAnimationFrame(raf);
      document.removeEventListener('themechange', onTheme);
    },
  };
}
