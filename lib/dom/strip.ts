// The suggestion strip. Vanilla DOM inside a Shadow root so the host page's CSS
// can't touch it and ours can't leak out. Rendered in the browser TOP LAYER via
// the Popover API so it sits above all page content regardless of the page's
// z-index / transforms / overflow (falls back to a high-z-index fixed element).

const STYLE = `
:host { all: initial; }
.strip {
  position: static;
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  font: 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
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
  private visible = false;
  private readonly usePopover: boolean;
  private onAccept: AcceptHandler | null = null;

  constructor(private readonly doc: Document = document) {
    this.host = doc.createElement('wordsync-strip');
    // Defensive, !important host box styles so the host page's CSS can't hide or
    // mis-position us. The host carries the position; the strip flows inside it.
    const s = this.host.style;
    for (const [prop, val] of [
      ['position', 'fixed'],
      ['inset', 'auto'],
      ['top', '0'],
      ['left', '0'],
      ['margin', '0'],
      ['padding', '0'],
      ['border', '0'],
      ['background', 'transparent'],
      ['z-index', '2147483647'],
      ['max-width', '92vw'],
      ['pointer-events', 'auto'],
      ['visibility', 'visible'],
      ['opacity', '1'],
    ] as const) {
      s.setProperty(prop, val, 'important');
    }

    this.usePopover = typeof (this.host as { showPopover?: unknown }).showPopover === 'function';
    if (this.usePopover) this.host.setAttribute('popover', 'manual');
    else s.setProperty('display', 'none', 'important');

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
    this.open();
    this.reposition(rect); // after opening, so the box has measurable dimensions
  }

  hide(): void {
    if (this.usePopover) {
      try {
        if (this.visible) (this.host as { hidePopover(): void }).hidePopover();
      } catch {
        /* not open */
      }
    } else {
      this.host.style.setProperty('display', 'none', 'important');
    }
    this.visible = false;
    this.highlighted = -1;
  }

  isVisible(): boolean {
    return this.visible;
  }

  move(direction: 1 | -1): void {
    if (this.items.length === 0) return;
    const n = this.items.length;
    if (this.highlighted < 0) this.highlighted = direction > 0 ? 0 : n - 1;
    else this.highlighted = (this.highlighted + direction + n) % n;
    this.paintHighlight();
  }

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
      top = below + h <= vh ? below : Math.max(margin, rect.top - h - margin);
    } else {
      left = Math.max(margin, vw - w - margin);
      top = vh - h - margin;
    }

    this.host.style.setProperty('top', `${top}px`, 'important');
    this.host.style.setProperty('left', `${left}px`, 'important');
  }

  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.host.contains(target);
  }

  destroy(): void {
    this.host.remove();
  }

  private open(): void {
    if (this.usePopover) {
      try {
        if (!this.visible) (this.host as { showPopover(): void }).showPopover();
      } catch {
        // Already open, or not connected — fall back to display.
        this.host.style.setProperty('display', 'block', 'important');
      }
    } else {
      this.host.style.setProperty('display', 'block', 'important');
    }
    this.visible = true;
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
