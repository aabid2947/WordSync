import { describe, expect, it } from 'vitest';
import { blend } from './blend';
import type { Suggestion } from './types';

const s = (word: string, score: number, source: Suggestion['source']): Suggestion => ({
  word,
  score,
  source,
});

describe('blend', () => {
  it('dedupes a word across lists, keeping the higher score', () => {
    const out = blend(
      [
        [s('fox', 0.9, 'ngram'), s('the', 0.1, 'ngram')],
        [s('fox', 0.5, 'llm'), s('foxes', 0.8, 'llm')],
      ],
      2,
    );
    expect(out.map((x) => x.word)).toEqual(['fox', 'foxes']);
    expect(out[0]).toMatchObject({ word: 'fox', score: 0.9, source: 'ngram' });
  });

  it('breaks score ties toward personal sources over the LLM', () => {
    const out = blend([[s('cat', 0.5, 'llm')], [s('cat', 0.5, 'frequency')]], 1);
    expect(out[0]?.source).toBe('frequency');
  });

  it('sorts by score desc then source priority, and applies the limit', () => {
    const out = blend(
      [
        [s('a', 0.3, 'llm'), s('b', 0.7, 'ngram')],
        [s('c', 0.7, 'frequency')],
      ],
      2,
    );
    // b and c tie at 0.7; frequency outranks ngram, so c comes first.
    expect(out.map((x) => x.word)).toEqual(['c', 'b']);
  });

  it('returns [] for an empty input or non-positive limit', () => {
    expect(blend([], 5)).toEqual([]);
    expect(blend([[s('a', 1, 'ngram')]], 0)).toEqual([]);
  });
});
