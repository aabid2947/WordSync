import { afterEach, describe, expect, it, vi } from 'vitest';
import { SuggestionStrip } from './strip';

afterEach(() => {
  document.body.innerHTML = '';
});

function chips(): NodeListOf<HTMLButtonElement> {
  const host = document.querySelector('wordsync-strip')!;
  return host.shadowRoot!.querySelectorAll<HTMLButtonElement>('.chip');
}

describe('SuggestionStrip', () => {
  it('renders a chip per word inside a shadow root', () => {
    const strip = new SuggestionStrip();
    strip.show(['fox', 'foxes'], null, () => {});
    expect([...chips()].map((c) => c.textContent)).toEqual(['fox', 'foxes']);
    expect(strip.isVisible()).toBe(true);
  });

  it('calls onAccept with the chip index on mousedown', () => {
    const strip = new SuggestionStrip();
    const onAccept = vi.fn();
    strip.show(['a', 'b'], null, onAccept);
    chips()[1]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(onAccept).toHaveBeenCalledWith(1);
  });

  it('acceptHighlighted defaults to the first item', () => {
    const strip = new SuggestionStrip();
    const onAccept = vi.fn();
    strip.show(['a', 'b'], null, onAccept);
    strip.acceptHighlighted();
    expect(onAccept).toHaveBeenCalledWith(0);
  });

  it('move() drives the highlight and wraps around', () => {
    const strip = new SuggestionStrip();
    const onAccept = vi.fn();
    strip.show(['a', 'b', 'c'], null, onAccept);
    strip.move(-1); // from none -> last
    strip.acceptHighlighted();
    expect(onAccept).toHaveBeenLastCalledWith(2);
    strip.move(1); // wrap last -> first
    strip.acceptHighlighted();
    expect(onAccept).toHaveBeenLastCalledWith(0);
  });

  it('hides on empty words and toggles visibility', () => {
    const strip = new SuggestionStrip();
    strip.show([], null, () => {});
    expect(strip.isVisible()).toBe(false);
    strip.show(['x'], null, () => {});
    expect(strip.isVisible()).toBe(true);
    strip.hide();
    expect(strip.isVisible()).toBe(false);
  });
});
