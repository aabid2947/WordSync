import { describe, expect, it } from 'vitest';
import { SuggestionModel } from './model';
import { suggestFast } from './fastpath';
import type { Snapshot } from '../storage/types';

const snapshot: Snapshot = {
  version: 1,
  unigrams: [
    ['brown', 9],
    ['brownie', 4],
    ['the', 100],
  ],
  ngrams: [['the quick', 'fox', 5]],
};
const model = new SuggestionModel(snapshot);

describe('suggestFast', () => {
  it('completes the partial word when the caret is mid-word', () => {
    const out = suggestFast(model, 'the quick brow', 14, 3);
    expect(out.map((s) => s.word)).toEqual(['brown', 'brownie']);
    expect(out[0]?.source).toBe('frequency');
  });

  it('predicts the next word when the caret follows a space', () => {
    const out = suggestFast(model, 'the quick ', 10, 3);
    expect(out[0]?.word).toBe('fox');
    expect(out[0]?.source).toBe('ngram');
  });

  it('uses the caret offset, ignoring text after it', () => {
    // Caret after "brow" (offset 14); the trailing "n fox" is ignored.
    const out = suggestFast(model, 'the quick brown fox', 14, 3);
    expect(out.map((s) => s.word)).toEqual(['brown', 'brownie']);
  });
});
