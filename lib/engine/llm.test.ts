import { describe, expect, it } from 'vitest';
import { buildPrompt, extractWords } from './llm';

describe('buildPrompt', () => {
  it('joins context tokens with spaces', () => {
    expect(buildPrompt(['the', 'quick'])).toBe('the quick');
    expect(buildPrompt([])).toBe('');
  });
});

describe('extractWords', () => {
  it('tokenizes, lowercases, dedupes, and caps to the limit', () => {
    expect(extractWords('Brown fox, brown bear!', 3)).toEqual(['brown', 'fox', 'bear']);
  });

  it('trims surrounding whitespace and punctuation noise', () => {
    expect(extractWords('   hello   world  ', 5)).toEqual(['hello', 'world']);
  });

  it('returns [] for empty generation or non-positive limit', () => {
    expect(extractWords('', 3)).toEqual([]);
    expect(extractWords('hello', 0)).toEqual([]);
  });
});
