import { load, save } from './storage.js';

let strings = {};
let lang = load('lang', 'ro');

export function setStrings(obj) {
  strings = obj;
}

export function t(key) {
  return strings[key]?.[lang] ?? key;
}

export function getLang() {
  return lang;
}

export function setLang(next) {
  lang = next;
  save('lang', next);
  globalThis.document?.documentElement.setAttribute('lang', next);
  globalThis.document?.dispatchEvent(new Event('langchange'));
}

export const nameOf = s => s.name[lang];
export const descOf = s => s.desc[lang];

export function normalize(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const GENERIC_WORDS = /^(muschiul|muschii|osul|oasele|nervul|lobul|girusul|nucleul|ventriculul|ventriculii) /;

// "Scapula (omoplatul)" accepts "scapula" and "omoplatul"; "Mușchiul biceps brahial" accepts "biceps brahial".
function acceptedAnswers(name) {
  const full = normalize(name);
  const outside = normalize(name.replace(/\(.*?\)/g, ''));
  const inside = [...name.matchAll(/\((.*?)\)/g)].map(m => normalize(m[1]));
  return [full, outside, outside.replace(GENERIC_WORDS, ''), ...inside];
}

export function matches(input, structure) {
  const guess = normalize(input);
  if (!guess) return false;
  return [structure.name.ro, structure.name.en].some(name => acceptedAnswers(name).includes(guess));
}

// "Mușchiul biceps" → try 1: "M_______ b_____"; try 2 also shows the last letter.
export function hintFor(name, tries) {
  const hidden = name.replace(/\S+/g, word => word[0] + '_'.repeat([...word].length - 1));
  return tries < 2 ? hidden : hidden.slice(0, -1) + name.slice(-1);
}
