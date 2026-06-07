import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetDBForTests } from './db';
import {
  allWords,
  applyLearnEvents,
  deleteWord,
  listWords,
  queryByContext,
  queryByPrefix,
  seedWords,
  topUnigrams,
  wordCount,
} from './words';
import type { LearnEvent } from './types';

const typed = (word: string, context: string[] = [], ts = 1): LearnEvent => ({
  word,
  context,
  source: 'typed',
  ts,
});

beforeEach(async () => {
  await __resetDBForTests();
});

describe('applyLearnEvents', () => {
  it('creates then increments word counts and tracks lastSeen', async () => {
    await applyLearnEvents([typed('hello', [], 1), typed('hello', [], 2)]);
    const rows = await queryByPrefix('hel');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ word: 'hello', count: 2, lastSeen: 2 });
  });

  it('records both bigram and trigram contexts', async () => {
    await applyLearnEvents([typed('fox', ['the', 'quick', 'brown'])]);
    expect((await queryByContext('brown'))[0]).toMatchObject({ next: 'fox', count: 1 });
    expect((await queryByContext('quick brown'))[0]).toMatchObject({ next: 'fox', count: 1 });
  });

  it('lowercases words on the way in', async () => {
    await applyLearnEvents([typed('Hello')]);
    expect((await queryByPrefix('hel'))[0]?.word).toBe('hello');
  });
});

describe('queryByPrefix', () => {
  it('returns prefix matches sorted by count desc, limited', async () => {
    await applyLearnEvents([
      ...Array.from({ length: 3 }, (_, i) => typed('apple', [], i)),
      ...Array.from({ length: 5 }, (_, i) => typed('apply', [], i)),
      typed('banana'),
    ]);
    const rows = await queryByPrefix('app', 10);
    expect(rows.map((r) => r.word)).toEqual(['apply', 'apple']);
  });

  it('returns [] for an empty prefix', async () => {
    await applyLearnEvents([typed('hello')]);
    expect(await queryByPrefix('')).toEqual([]);
  });
});

describe('queryByContext', () => {
  it('ranks candidate next-words by count', async () => {
    await applyLearnEvents([
      typed('world', ['hello']),
      typed('world', ['hello']),
      typed('there', ['hello']),
    ]);
    const rows = await queryByContext('hello');
    expect(rows.map((r) => r.next)).toEqual(['world', 'there']);
    expect(rows[0]?.count).toBe(2);
  });
});

describe('seedWords', () => {
  it('bulk-imports words that then rank by prefix, tagged as the source', async () => {
    const imported = await seedWords(
      [{ word: 'serendipity', count: 5 }, { word: 'serene' }],
      'gboard',
      100,
    );
    expect(imported).toBe(2);
    const rows = await queryByPrefix('ser');
    expect(rows.map((r) => r.word)).toEqual(['serendipity', 'serene']);
    expect(rows[0]?.source).toBe('gboard');
  });

  it('adds counts to existing words instead of duplicating', async () => {
    await applyLearnEvents([typed('cat')]);
    await seedWords([{ word: 'cat', count: 9 }]);
    expect(await wordCount()).toBe(1);
    expect((await queryByPrefix('cat'))[0]?.count).toBe(10);
  });
});

describe('topUnigrams', () => {
  it('returns the highest-count words first', async () => {
    await seedWords([{ word: 'a', count: 10 }, { word: 'b', count: 3 }, { word: 'c', count: 7 }], 'typed', 1);
    expect((await topUnigrams(2)).map((r) => r.word)).toEqual(['a', 'c']);
  });
});

describe('listWords', () => {
  it('filters by query, sorts by count desc, and paginates', async () => {
    await seedWords(
      [{ word: 'apple', count: 3 }, { word: 'apply', count: 9 }, { word: 'banana', count: 5 }],
      'typed',
      1,
    );
    const page = await listWords({ query: 'app', limit: 1, offset: 0 });
    expect(page.total).toBe(2);
    expect(page.words.map((w) => w.word)).toEqual(['apply']); // highest count first
    const next = await listWords({ query: 'app', limit: 1, offset: 1 });
    expect(next.words.map((w) => w.word)).toEqual(['apple']);
  });
});

describe('deleteWord', () => {
  it('removes the word and the n-grams that would resurface it', async () => {
    await applyLearnEvents([typed('fox', ['the', 'quick'])]);
    await deleteWord('fox');
    expect(await queryByPrefix('fox')).toEqual([]);
    expect(await queryByContext('quick')).toEqual([]); // ngram with next='fox' gone
  });
});

describe('allWords', () => {
  it('returns every stored word', async () => {
    await seedWords([{ word: 'a' }, { word: 'b' }], 'typed', 1);
    expect((await allWords()).map((w) => w.word).sort()).toEqual(['a', 'b']);
  });
});
