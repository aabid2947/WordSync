import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetDBForTests } from './db';
import { applyLearnEvents, seedWords } from './words';
import { buildSnapshot } from './snapshot';

beforeEach(async () => {
  await __resetDBForTests();
});

describe('buildSnapshot', () => {
  it('emits top unigrams (count desc) and ngrams as compact tuples', async () => {
    await seedWords([{ word: 'the', count: 100 }, { word: 'fox', count: 5 }], 'typed', 1);
    await applyLearnEvents([{ word: 'fox', context: ['the', 'quick', 'brown'], source: 'typed', ts: 2 }]);

    const snap = await buildSnapshot({ unigramLimit: 10, ngramLimit: 10 });

    expect(snap.unigrams[0]).toEqual(['the', 100]);
    expect(snap.ngrams.some(([context, next]) => context === 'brown' && next === 'fox')).toBe(true);
    expect(typeof snap.version).toBe('number');
  });

  it('respects the unigram limit', async () => {
    await seedWords(
      Array.from({ length: 20 }, (_, i) => ({ word: `w${i}`, count: i + 1 })),
      'typed',
      1,
    );
    const snap = await buildSnapshot({ unigramLimit: 5, ngramLimit: 5 });
    expect(snap.unigrams).toHaveLength(5);
    // Highest count first: w19 (count 20) ... w15 (count 16).
    expect(snap.unigrams[0]).toEqual(['w19', 20]);
  });
});
