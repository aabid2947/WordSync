import { describe, expect, it } from 'vitest';
import { deepActiveElement, isEditable } from './detect';

function input(type: string): HTMLInputElement {
  const el = document.createElement('input');
  el.type = type;
  return el;
}

describe('isEditable', () => {
  it('accepts text-like inputs', () => {
    for (const type of ['text', 'search', 'url', 'email', 'tel']) {
      expect(isEditable(input(type))).toBe(true);
    }
  });

  it('rejects password and non-text inputs', () => {
    for (const type of ['password', 'number', 'checkbox', 'range', 'date', 'color']) {
      expect(isEditable(input(type))).toBe(false);
    }
  });

  it('rejects disabled / readonly inputs', () => {
    const disabled = input('text');
    disabled.disabled = true;
    const readonly = input('text');
    readonly.readOnly = true;
    expect(isEditable(disabled)).toBe(false);
    expect(isEditable(readonly)).toBe(false);
  });

  it('accepts enabled textarea, rejects disabled', () => {
    expect(isEditable(document.createElement('textarea'))).toBe(true);
    const disabled = document.createElement('textarea');
    disabled.disabled = true;
    expect(isEditable(disabled)).toBe(false);
  });

  it('accepts contenteditable via attribute, rejects plain elements', () => {
    const t = document.createElement('div');
    t.setAttribute('contenteditable', 'true');
    const empty = document.createElement('div');
    empty.setAttribute('contenteditable', '');
    expect(isEditable(t)).toBe(true);
    expect(isEditable(empty)).toBe(true);
    expect(isEditable(document.createElement('div'))).toBe(false);
  });

  it('rejects non-elements', () => {
    expect(isEditable(null)).toBe(false);
    expect(isEditable(document.createTextNode('x'))).toBe(false);
  });
});

describe('deepActiveElement', () => {
  it('returns the focused element', () => {
    const el = document.createElement('input');
    document.body.appendChild(el);
    el.focus();
    expect(deepActiveElement()).toBe(el);
    el.remove();
  });
});
