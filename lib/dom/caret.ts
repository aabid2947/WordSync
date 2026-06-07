// Reading the current text + caret from an editable, and locating the caret on
// screen for strip placement. The text/offset reads are deterministic and unit
// tested; the on-screen coordinate math is layout-dependent and verified in a
// real browser (E2E / manual), failing safe to `null` so the strip anchors.

export interface FieldState {
  /** Full text content of the field. */
  text: string;
  /** Caret offset within `text`. */
  caret: number;
}

/** Read text + caret offset. Returns null if it can't be determined. */
export function readField(el: HTMLElement): FieldState | null {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return { text: el.value, caret: el.selectionStart ?? el.value.length };
  }
  // contenteditable — treated as plain text (sufficient for v1 suggestions).
  const win = el.ownerDocument.defaultView ?? window;
  const sel = win.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  const pre = el.ownerDocument.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return { text: el.textContent ?? '', caret: pre.toString().length };
}

// Style properties (kebab-case) the mirror div must copy to measure the caret.
const MIRROR_PROPS = [
  'box-sizing', 'width', 'height', 'overflow-x', 'overflow-y',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'font-style', 'font-variant', 'font-weight', 'font-stretch', 'font-size',
  'line-height', 'font-family', 'text-align', 'text-transform', 'text-indent',
  'letter-spacing', 'word-spacing', 'tab-size',
];

/** Screen rect of the caret, or null if unavailable (caller falls back to anchored). */
export function caretRect(el: HTMLElement): DOMRect | null {
  try {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return inputCaretRect(el);
    }
    const win = el.ownerDocument.defaultView ?? window;
    const sel = win.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rects = range.getClientRects();
    if (rects.length > 0) return rects[0]!;
    return el.getBoundingClientRect();
  } catch {
    return null;
  }
}

/** Mirror-div technique: inputs/textareas expose no caret rect, so measure a clone. */
function inputCaretRect(el: HTMLInputElement | HTMLTextAreaElement): DOMRect | null {
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  if (!win) return null;

  const computed = win.getComputedStyle(el);
  const div = doc.createElement('div');
  for (const prop of MIRROR_PROPS) {
    div.style.setProperty(prop, computed.getPropertyValue(prop));
  }
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = el instanceof HTMLInputElement ? 'nowrap' : 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.style.top = '0';
  div.style.left = '0';

  const caret = el.selectionStart ?? el.value.length;
  div.textContent = el.value.slice(0, caret);
  const marker = doc.createElement('span');
  marker.textContent = el.value.slice(caret) || '.';
  div.appendChild(marker);

  doc.body.appendChild(div);
  const elRect = el.getBoundingClientRect();
  const lineHeight = parseFloat(computed.lineHeight) || elRect.height;
  const x = elRect.left + marker.offsetLeft - el.scrollLeft;
  const y = elRect.top + marker.offsetTop - el.scrollTop;
  div.remove();

  return new DOMRect(x, y, 0, lineHeight);
}
