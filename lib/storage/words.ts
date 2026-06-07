import { getDB } from './db';
import type { LearnEvent, NgramRow, WordRow, WordSource } from './types';

/**
 * Build the n-gram context keys for an event: the immediately preceding token
 * (bigram) and the two preceding tokens joined (trigram). The fast path backs
 * off trigram -> bigram -> unigram, so we store both.
 */
function buildContexts(context: string[]): string[] {
  const out: string[] = [];
  const n = context.length;
  if (n >= 1) out.push(context[n - 1]!);
  if (n >= 2) out.push(`${context[n - 2]} ${context[n - 1]}`);
  return out;
}

/** Apply a batch of learn events in a single transaction (the SW is the sole writer). */
export async function applyLearnEvents(events: LearnEvent[]): Promise<void> {
  if (events.length === 0) return;
  const db = await getDB();
  const tx = db.transaction(['words', 'ngrams'], 'readwrite');
  const words = tx.objectStore('words');
  const ngrams = tx.objectStore('ngrams');

  for (const ev of events) {
    const word = ev.word.toLowerCase();
    if (!word) continue;

    const existing = await words.get(word);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = ev.ts;
      await words.put(existing);
    } else {
      await words.put({ word, count: 1, lastSeen: ev.ts, source: ev.source });
    }

    for (const context of buildContexts(ev.context)) {
      const key: [string, string] = [context, word];
      const ng = await ngrams.get(key);
      if (ng) {
        ng.count += 1;
        await ngrams.put(ng);
      } else {
        await ngrams.put({ context, next: word, count: 1 });
      }
    }
  }

  await tx.done;
}

/** Words starting with `prefix`, ranked by count then recency. Powers prefix completion. */
export async function queryByPrefix(prefix: string, limit = 20): Promise<WordRow[]> {
  const p = prefix.toLowerCase();
  if (!p) return [];
  const db = await getDB();
  // `words` is keyed by `word`, so a key range gives an efficient prefix scan.
  const range = IDBKeyRange.bound(p, `${p}￿`);
  const rows = await db.getAll('words', range);
  rows.sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen);
  return rows.slice(0, limit);
}

/** Words that have followed `context`, ranked by count. Powers next-word prediction. */
export async function queryByContext(context: string, limit = 20): Promise<NgramRow[]> {
  if (!context) return [];
  const db = await getDB();
  const rows = await db.getAllFromIndex('ngrams', 'by-context', context);
  rows.sort((a, b) => b.count - a.count);
  return rows.slice(0, limit);
}

/** Highest-count words overall (snapshot hydration + unigram backoff). */
export async function topUnigrams(limit: number): Promise<WordRow[]> {
  const db = await getDB();
  const out: WordRow[] = [];
  let cursor = await db
    .transaction('words')
    .store.index('by-count')
    .openCursor(null, 'prev');
  while (cursor && out.length < limit) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}

/** Highest-count n-grams overall (snapshot hydration). */
export async function topNgrams(limit: number): Promise<NgramRow[]> {
  const db = await getDB();
  const out: NgramRow[] = [];
  let cursor = await db
    .transaction('ngrams')
    .store.index('by-count')
    .openCursor(null, 'prev');
  while (cursor && out.length < limit) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}

/** Bulk-import words (Gboard seed). Returns the number of newly created entries. */
export async function seedWords(
  entries: Array<{ word: string; count?: number }>,
  source: WordSource = 'gboard',
  ts = Date.now(),
): Promise<number> {
  const db = await getDB();
  let imported = 0;
  const CHUNK = 500;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const tx = db.transaction('words', 'readwrite');
    const store = tx.objectStore('words');
    for (const entry of entries.slice(i, i + CHUNK)) {
      const word = entry.word.toLowerCase().trim();
      if (!word) continue;
      const add = entry.count ?? 1;
      const existing = await store.get(word);
      if (existing) {
        existing.count += add;
        existing.lastSeen = ts;
        await store.put(existing);
      } else {
        await store.put({ word, count: add, lastSeen: ts, source });
        imported += 1;
      }
    }
    await tx.done;
  }
  return imported;
}

export async function wordCount(): Promise<number> {
  const db = await getDB();
  return db.count('words');
}
