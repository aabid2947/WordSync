import { afterEach, describe, expect, it } from 'vitest';
import { acceptInto } from './insert';

function field(tag: 'input' | 'textarea', value: string, caret: number): HTMLInputElement | HTMLTextAreaElement {
  const el = document.createElement(tag) as HTMLInputElement | HTMLTextAreaElement;
  el.value = value;
  document.body.appendChild(el);
  el.focus();
  el.setSelectionRange(caret, caret);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('acceptInto (input/textarea)', () => {
  it('replaces the prefix before the caret (completion)', () => {
    const el = field('input', 'the quick bro', 13);
    acceptInto(el, 3, 'brown');
    expect(el.value).toBe('the quick brown');
    expect(el.selectionStart).toBe(15);
  });

  it('inserts at the caret with deleteBefore=0 (next-word)', () => {
    const el = field('input', 'the quick ', 10);
    acceptInto(el, 0, 'fox ');
    expect(el.value).toBe('the quick fox ');
    expect(el.selectionStart).toBe(14);
  });

  it('preserves text after a mid-string caret', () => {
    const el = field('input', 'go here now', 3);
    acceptInto(el, 0, 'to ');
    expect(el.value).toBe('go to here now');
  });

  it('fires an InputEvent so frameworks observe the change', () => {
    const el = field('input', 'hel', 3);
    let fired = false;
    let data: string | null = null;
    el.addEventListener('input', (e) => {
      fired = true;
      data = (e as InputEvent).data;
    });
    acceptInto(el, 3, 'hello');
    expect(fired).toBe(true);
    expect(data).toBe('hello');
    expect(el.value).toBe('hello');
  });

  it('works for textarea too', () => {
    const el = field('textarea', 'foo ba', 6);
    acceptInto(el, 2, 'bar');
    expect(el.value).toBe('foo bar');
  });
});
