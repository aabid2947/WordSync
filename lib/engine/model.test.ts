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

describe('note (optimistic learning)', () => {
  it('adds a new word so it is immediately completable', () => {
    const m = new SuggestionModel({ version: 1, unigrams: [['apple', 2]], ngrams: [] });
    expect(m.completePrefix('ser', 5)).toEqual([]);
    m.note('serendipity', []);
    expect(m.completePrefix('ser', 5).map((s) => s.word)).toEqual(['serendipity']);
  });

  it('increments an existing word so its rank can overtake', () => {
    const m = new SuggestionModel({ version: 1, unigrams: [['cat', 1], ['car', 5]], ngrams: [] });
    m.note('cat', []);
    m.note('cat', []);
    expect(m.completePrefix('ca', 5).map((s) => s.word)).toEqual(['car', 'cat']); // 3 vs 5
    m.note('cat', []);
    m.note('cat', []);
    m.note('cat', []);
    expect(m.completePrefix('ca', 5).map((s) => s.word)).toEqual(['cat', 'car']); // 6 vs 5
  });

  it('makes a noted n-gram predict its next word', () => {
    const m = new SuggestionModel({ version: 1, unigrams: [], ngrams: [] });
    m.note('coffee', ['morning']);
    expect(m.predictNext(['morning'], 3).map((s) => s.word)).toContain('coffee');
  });
});

describe('base vocabulary + correction', () => {
  function withBase(): SuggestionModel {
    const m = new SuggestionModel({ version: 1, unigrams: [['hello', 2]], ngrams: [] });
    m.loadBase(['hello', 'help', 'world', 'yellow', 'hero']);
    return m;
  }

  it('isKnown covers both personal and base words', () => {
    const m = withBase();
    expect(m.isKnown('hello')).toBe(true); // personal
    expect(m.isKnown('world')).toBe(true); // base
    expect(m.isKnown('zzzz')).toBe(false);
  });

  it('basePrefix returns base completions, excluding personal duplicates', () => {
    const m = withBase();
    const words = m.basePrefix('he', 5).map((s) => s.word);
    expect(words).toContain('help');
    expect(words).toContain('hero');
    expect(words).not.toContain('hello'); // personal, surfaced by the personal layer instead
    expect(m.basePrefix('he', 5).every((s) => s.source === 'base')).toBe(true);
  });

  it('correct fixes an unknown typo toward near words', () => {
    const m = withBase();
    const out = m.correct('helo', 3);
    expect(out.map((s) => s.word)).toContain('hello'); // edit distance 1
    expect(out[0]?.source).toBe('correction');
  });

  it('corrects a longer word at distance 2 sharing the first letter', () => {
    const m = new SuggestionModel({ version: 1, unigrams: [], ngrams: [] });
    m.loadBase(['elaborating', 'elaborate', 'decorating']);
    // exoborating -> elaborating is 2 edits (x->l, o->a) and shares the first letter.
    expect(m.correct('exoborating', 3).map((s) => s.word)).toContain('elaborating');
  });

  it('does not "correct" a correctly-spelled known word', () => {
    const m = withBase();
    expect(m.correct('world', 3)).toEqual([]); // known base word
    expect(m.correct('hello', 3)).toEqual([]); // known personal word
  });

  it('ignores fragments shorter than 3 characters', () => {
    expect(withBase().correct('he', 3)).toEqual([]);
  });
});
