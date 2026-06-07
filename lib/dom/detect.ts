// Editable-field detection. Must be conservative: never treat a field as
// editable unless we're sure, and never suggest into password fields.

const SUGGESTABLE_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', '']);

/** True for a contenteditable host (handles inherited/effective editability). */
export function isContentEditableEl(el: HTMLElement): boolean {
  if (el.isContentEditable) return true; // effective value, follows inheritance
  const attr = el.getAttribute('contenteditable');
  return attr === '' || attr === 'true' || attr === 'plaintext-only';
}

/** True if we should offer suggestions in this element. */
export function isEditable(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    return SUGGESTABLE_INPUT_TYPES.has(type) && !el.disabled && !el.readOnly;
  }
  return isContentEditableEl(el);
}

/**
 * The truly-focused element, descending through open shadow roots. Closed shadow
 * roots are inaccessible by design — those fields simply won't get suggestions.
 */
export function deepActiveElement(root: DocumentOrShadowRoot = document): Element | null {
  let active: Element | null = root.activeElement;
  while (active && active.shadowRoot && active.shadowRoot.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}
