// The suggestion strip. Vanilla DOM inside a Shadow root so the host page's CSS
// can't touch it and ours can't leak out. No framework in this hot path.

const STYLE = `
:host { all: initial; }
.strip {
  position: fixed;
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  font: 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  z-index: 2147483647;
  max-width: 90vw;
  overflow: hidden;
}
.chip {
  appearance: none;
  border: 0;
  border-radius: 6px;
  padding: 5px 10px;
  background: #f1f3f4;
  color: #202124;
  cursor: pointer;
  white-space: nowrap;
  font: inherit;
}
.chip:hover { background: #e3e6e8; }
.chip.active { background: #1a73e8; color: #fff; }
@media (prefers-color-scheme: dark) {
  .strip { background: #2a2a2e; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5); }
  .chip { background: #3c3c40; color: #e8eaed; }
  .chip:hover { background: #48484d; }
  .chip.active { background: #8ab4f8; color: #202124; }
}
`;

export type AcceptHandler = (index: number) => void;

export class SuggestionStrip {
  private readonly host: HTMLElement;
  private readonly container: HTMLElement;
  private items: HTMLButtonElement[] = [];
  private highlighted = -1;
  private onAccept: AcceptHandler | null = null;

  constructor(private readonly doc: Document = document) {
    this.host = doc.createElement('wordsync-strip');
    this.host.style.position = 'fixed';
    this.host.style.top = '0';
    this.host.style.left = '0';
    this.host.style.display = 'none';
    const root = this.host.attachShadow({ mode: 'open' });

    const style = doc.createElement('style');
    style.textContent = STYLE;
    this.container = doc.createElement('div');
    this.container.className = 'strip';
    root.append(style, this.container);

    (doc.body ?? doc.documentElement).appendChild(this.host);
  }

  show(words: string[], rect: DOMRect | null, onAccept: AcceptHandler): void {
    if (words.length === 0) {
      this.hide();
      return;
    }
    this.onAccept = onAccept;
    this.render(words);
    this.host.style.display = 'block'; // visible first so we can measure for placement
    this.reposition(rect);
  }

  hide(): void {
    this.host.style.display = 'none';
    this.highlighted = -1;
  }

  isVisible(): boolean {
    return this.host.style.display !== 'none';
  }

  /** Move the active highlight (wraps). */
  move(direction: 1 | -1): void {
    if (this.items.length === 0) return;
    const n = this.items.length;
    if (this.highlighted < 0) this.highlighted = direction > 0 ? 0 : n - 1;
    else this.highlighted = (this.highlighted + direction + n) % n;
    this.paintHighlight();
  }

  /** Accept the highlighted item, or the first if none is highlighted. */
  acceptHighlighted(): void {
    if (this.items.length === 0) return;
    this.onAccept?.(this.highlighted >= 0 ? this.highlighted : 0);
  }

  reposition(rect: DOMRect | null): void {
    const margin = 6;
    const win = this.doc.defaultView;
    const vw = win?.innerWidth ?? 1024;
    const vh = win?.innerHeight ?? 768;
    const box = this.container.getBoundingClientRect();
    const w = box.width || 180;
    const h = box.height || 32;

    let top: number;
    let left: number;
    if (rect && (rect.width || rect.height || rect.left || rect.bottom)) {
      left = Math.max(margin, Math.min(rect.left, vw - w - margin));
      const below = rect.bottom + margin;
      // Prefer below the caret; flip above when it would overflow the viewport
      // bottom (e.g. chat composers anchored near the bottom, like Gemini).
      top = below + h <= vh ? below : Math.max(margin, rect.top - h - margin);
    } else {
      left = Math.max(margin, vw - w - margin);
      top = vh - h - margin;
    }

    this.container.style.left = `${left}px`;
    this.container.style.top = `${top}px`;
    this.container.style.right = 'auto';
    this.container.style.bottom = 'auto';
  }

  /** Whether an event target is inside the strip (so outside-clicks can dismiss). */
  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.host.contains(target);
  }

  destroy(): void {
    this.host.remove();
  }

  private render(words: string[]): void {
    this.container.textContent = '';
    this.highlighted = -1;
    this.items = words.map((word, index) => {
      const chip = this.doc.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = word;
      // mousedown (not click) + preventDefault keeps focus/selection in the field.
      chip.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.onAccept?.(index);
      });
      this.container.appendChild(chip);
      return chip;
    });
  }

  private paintHighlight(): void {
    this.items.forEach((chip, i) => chip.classList.toggle('active', i === this.highlighted));
  }
}
