// Accepting a suggestion. The hard requirement: it must work with React/Vue and
// other controlled inputs, which ignore a direct `.value =` assignment because
// they track the native setter. See CLAUDE.md §9.

/**
 * Set an input/textarea value through the prototype's native setter so React's
 * value tracker registers the change, then notify via a real InputEvent.
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

/**
 * Replace the `deleteBefore` characters immediately before the caret with `text`,
 * then place the caret after the inserted text. This single primitive covers both
 * cases: completion (deleteBefore = prefix length) and next-word (deleteBefore = 0).
 */
export function acceptInto(el: HTMLElement, deleteBefore: number, text: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const caret = el.selectionStart ?? el.value.length;
    const from = Math.max(0, caret - deleteBefore);
    const next = el.value.slice(0, from) + text + el.value.slice(caret);
    setNativeValue(el, next);
    const pos = from + text.length;
    el.setSelectionRange(pos, pos);
    el.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: text }),
    );
    return;
  }
  acceptIntoContentEditable(el, deleteBefore, text);
}

function acceptIntoContentEditable(el: HTMLElement, deleteBefore: number, text: string): void {
  const doc = el.ownerDocument;
  const win = doc.defaultView ?? window;
  const sel = win.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  // Extend the selection backward over the prefix (same text node, common case).
  if (deleteBefore > 0) {
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    const offset = range.startOffset;
    if (node.nodeType === Node.TEXT_NODE && offset >= deleteBefore) {
      const r = doc.createRange();
      r.setStart(node, offset - deleteBefore);
      r.setEnd(node, offset);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }

  // execCommand fires the beforeinput/input events editors rely on and is undoable.
  let ok = false;
  try {
    ok = doc.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }
  if (ok) return;

  // Fallback: replace the selection by hand and dispatch input.
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = doc.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
}
