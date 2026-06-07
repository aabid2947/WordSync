import { describe, it, expect } from 'vitest';
import { tokenize, splitAtCaret } from './tokenize';

describe('tokenize', () => {
  it('lowercases and splits on punctuation/whitespace', () => {
    expect(tokenize('Hello, World!')).toEqual(['hello', 'world']);
  });

  it('keeps intra-word apostrophes', () => {
    expect(tokenize("don't it's")).toEqual(["don't", "it's"]);
  });

  it('returns [] for empty / punctuation-only input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ... ')).toEqual([]);
  });
});

describe('splitAtCaret', () => {
  it('extracts the partial word before the caret as prefix', () => {
    const { prefix, context } = splitAtCaret('the quick bro', 13);
    expect(prefix).toBe('bro');
    expect(context).toEqual(['the', 'quick']);
  });

  it('returns empty prefix when caret follows a space (next-word case)', () => {
    const { prefix, context } = splitAtCaret('the quick ', 10);
    expect(prefix).toBe('');
    expect(context).toEqual(['the', 'quick']);
  });

  it('respects the caret offset, ignoring text after it', () => {
    const { prefix, context } = splitAtCaret('hello wor ld', 9);
    expect(prefix).toBe('wor');
    expect(context).toEqual(['hello']);
  });
});
