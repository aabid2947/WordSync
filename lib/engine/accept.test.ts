import { describe, expect, it } from 'vitest';
import { planAcceptance } from './accept';

describe('planAcceptance', () => {
  it('replaces the typed prefix and appends a space (completion)', () => {
    expect(planAcceptance({ text: 'the bro', caret: 7 }, 'brown')).toEqual({
      deleteBefore: 3,
      text: 'brown ',
      word: 'brown',
      context: ['the'],
    });
  });

  it('inserts with deleteBefore 0 for the next-word case', () => {
    expect(planAcceptance({ text: 'the quick ', caret: 10 }, 'fox')).toEqual({
      deleteBefore: 0,
      text: 'fox ',
      word: 'fox',
      context: ['the', 'quick'],
    });
  });

  it('matches a leading capital in the prefix', () => {
    expect(planAcceptance({ text: 'Bro', caret: 3 }, 'brown').text).toBe('Brown ');
  });

  it('upcases when the prefix is all caps', () => {
    expect(planAcceptance({ text: 'BRO', caret: 3 }, 'brown').text).toBe('BROWN ');
  });

  it('capitalizes a next-word at the start of input', () => {
    expect(planAcceptance({ text: '', caret: 0 }, 'hello').text).toBe('Hello ');
  });

  it('keeps the canonical lowercase word for learning regardless of display case', () => {
    expect(planAcceptance({ text: 'Bro', caret: 3 }, 'brown').word).toBe('brown');
  });

  it('can omit the trailing space', () => {
    expect(planAcceptance({ text: 'bro', caret: 3 }, 'brown', false).text).toBe('brown');
  });
});
