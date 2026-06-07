import { afterEach, describe, expect, it } from 'vitest';
import { readField } from './caret';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('readField (input/textarea)', () => {
  it('reads value and caret offset from an input', () => {
    const el = document.createElement('input');
    el.value = 'hello world';
    document.body.appendChild(el);
    el.focus();
    el.setSelectionRange(5, 5);
    expect(readField(el)).toEqual({ text: 'hello world', caret: 5 });
  });

  it('reads from a textarea, defaulting caret to end when unset', () => {
    const el = document.createElement('textarea');
    el.value = 'abc';
    document.body.appendChild(el);
    const state = readField(el);
    expect(state?.text).toBe('abc');
    expect(state?.caret).toBeTypeOf('number');
  });
});
