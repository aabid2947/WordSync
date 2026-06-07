import { describe, expect, it } from 'vitest';
import { boundedLevenshtein } from './distance';

describe('boundedLevenshtein', () => {
  it('is 0 for identical strings', () => {
    expect(boundedLevenshtein('hello', 'hello', 2)).toBe(0);
  });

  it('counts single edits (insert / substitute / delete)', () => {
    expect(boundedLevenshtein('helo', 'hello', 2)).toBe(1); // insertion
    expect(boundedLevenshtein('hallo', 'hello', 2)).toBe(1); // substitution
    expect(boundedLevenshtein('hell', 'hello', 2)).toBe(1); // deletion
  });

  it('counts a two-edit difference', () => {
    expect(boundedLevenshtein('recieve', 'receive', 2)).toBe(2);
  });

  it('returns max+1 once the budget is exceeded (cutoff)', () => {
    expect(boundedLevenshtein('cat', 'dog', 2)).toBe(3);
    expect(boundedLevenshtein('a', 'abcd', 1)).toBe(2); // length gap alone exceeds max
  });
});
