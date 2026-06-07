// One-time: download a ~50k frequency-ordered English word list and write a
// cleaned copy to public/ (served as a packaged extension asset, fetched once
// per frame at runtime — not inlined into the content script).
//
// Source: hermitdave/FrequencyWords en_50k (OpenSubtitles-derived frequencies).
// NOTE: that data is CC-BY-SA — fine for use with attribution; confirm/swap for
// a public-domain list if that license is a problem for your release.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC =
  'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/words-en.txt');

const res = await fetch(SRC);
if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
const text = await res.text();

// Each line is "word count", frequency-ordered. Keep order; alpha words len >= 2.
const seen = new Set();
const words = [];
for (const line of text.split(/\r?\n/)) {
  const w = line.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (/^[a-z]{2,}$/.test(w) && !seen.has(w)) {
    seen.add(w);
    words.push(w);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, words.join('\n') + '\n');
console.log(`wrote ${words.length} words to ${OUT}`);
