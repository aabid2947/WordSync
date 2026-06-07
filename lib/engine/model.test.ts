import { describe, expect, it } from 'vitest';
import { SuggestionModel } from './model';
import type { Snapshot } from '../storage/types';

const snapshot: Snapshot = {
  version: 1,
  unigrams: [
    ['apple', 3],
    ['apply', 5],
    ['application', 1],
    ['banana', 2],
    ['the', 100],
  ],
  ngrams: [
    ['quick brown', 'fox', 4], // trigram
    ['brown', 'fox', 3], // bigram
    ['brown', 'bear', 1],
    ['hello', 'world', 2],
  ],
};

const model = new SuggestionModel(snapshot);

describe('completePrefix', () => {
  it('returns words extending the prefix, ranked by frequency', () => {
    const out = model.completePrefix('app', 5);
    expect(out.map((s) => s.word)).toEqual(['apply', 'apple', 'application']);
    expect(out[0]?.score).toBe(1); // top match normalized to 1
    expect(out.every((s) => s.source === 'frequency')).toBe(true);
  });

  it('excludes the exact prefix (already fully typed)', () => {
    expect(model.completePrefix('apple', 5).map((s) => s.word)).toEqual([]);
  });

  it('respects the limit', () => {
    expect(model.completePrefix('app', 1).map((s) => s.word)).toEqual(['apply']);
  });

  it('returns [] for an empty prefix or unknown prefix', () => {
    expect(model.completePrefix('', 5)).toEqual([]);
    expect(model.completePrefix('zzz', 5)).toEqual([]);
  });
});

describe('predictNext', () => {
  it('prefers the trigram match over the bigram match', () => {
    const out = model.predictNext(['the', 'quick', 'brown'], 3);
    expect(out[0]?.word).toBe('fox');
    expect(out[0]?.score).toBe(1);
    expect(out[0]?.source).toBe('ngram');
  });

  it('falls back to the bigram when no trigram exists', () => {
    const out = model.predictNext(['something', 'brown'], 3);
    const fox = out.find((s) => s.word === 'fox');
    const bear = out.find((s) => s.word === 'bear');
    expect(fox).toBeDefined();
    expect(bear).toBeDefined();
    // 'fox' (count 3) outranks 'bear' (count 1) within the bigram tier.
    expect(fox!.score).toBeGreaterThan(bear!.score);
  });

  it('falls back to the global unigram prior with no context match', () => {
    const out = model.predictNext(['nonexistent'], 3);
    // 'the' is the most frequent word, so it leads the fallback.
    expect(out[0]?.word).toBe('the');
  });

  it('dedupes a word across tiers keeping its best score', () => {
    // 'fox' appears in both the trigram (w=1.0) and bigram (w=0.6) tiers.
    const out = model.predictNext(['quick', 'brown'], 5);
    expect(out.filter((s) => s.word === 'fox')).toHaveLength(1);
    expect(out.find((s) => s.word === 'fox')?.score).toBe(1);
  });
});
