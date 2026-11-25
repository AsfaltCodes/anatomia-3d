// Every string has both languages, and every t('key') used in js/ exists.
import { readFileSync, readdirSync } from 'node:fs';

const strings = JSON.parse(readFileSync('data/strings.json', 'utf8'));
const errors = [];

for (const [key, value] of Object.entries(strings))
  for (const lang of ['ro', 'en'])
    if (!value[lang]?.trim()) errors.push(`${key}: missing ${lang}`);

for (const file of readdirSync('js').filter(f => f.endsWith('.js'))) {
  const code = readFileSync(`js/${file}`, 'utf8');
  for (const [, key] of code.matchAll(/\bt\('([^']+)'\)/g))
    if (!strings[key]) errors.push(`js/${file}: unknown key ${key}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('OK');
