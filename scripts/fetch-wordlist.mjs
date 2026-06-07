// One-time: download a public-domain English frequency list (frequency-ordered)
// and write a cleaned copy into the repo as the bundled base vocabulary.
// Source: github.com/first20hours/google-10000-english (MIT / public-domain data).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC =
  'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../lib/engine/data/words-en.txt');

const res = await fetch(SRC);
if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
const text = await res.text();

// Keep frequency order (line index = rank); keep only plain alpha words length >= 2.
const seen = new Set();
const words = [];
for (const line of text.split(/\r?\n/)) {
  const w = line.trim().toLowerCase();
  if (/^[a-z]{2,}$/.test(w) && !seen.has(w)) {
    seen.add(w);
    words.push(w);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, words.join('\n') + '\n');
console.log(`wrote ${words.length} words to ${OUT}`);
