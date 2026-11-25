import { load, save } from './storage.js';

// The theme follows the device until the person picks one with the toggle.
const deviceDark = matchMedia('(prefers-color-scheme: dark)');

export function isDark() {
  const chosen = load('theme', null);
  return chosen ? chosen === 'dark' : deviceDark.matches;
}

function apply() {
  const chosen = load('theme', null);
  if (chosen) document.documentElement.dataset.theme = chosen;
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark() ? '#141216' : '#ffffff');
  document.dispatchEvent(new Event('themechange'));
}

export function toggleTheme() {
  save('theme', isDark() ? 'light' : 'dark');
  apply();
}

export function forgetTheme() {
  try { localStorage.removeItem('theme'); } catch {}
  apply();
}

deviceDark.addEventListener('change', () => { if (!load('theme', null)) apply(); });
