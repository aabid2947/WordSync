import { SuggestionController } from '../lib/content/controller';
import { caretRect, readField } from '../lib/dom/caret';
import { deepActiveElement, isEditable } from '../lib/dom/detect';
import { acceptInto } from '../lib/dom/insert';
import { SuggestionStrip } from '../lib/dom/strip';
import { getSettings, watchSettings, type Settings } from '../lib/storage/settings';
import { sendMessage } from '../utils/messages';

// Content script — every frame, every site (isolated world). All handlers are
// defensive: a failure degrades to "no suggestions", never a broken page.
export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    void boot().catch(() => {});
  },
});

async function boot(): Promise<void> {
  const initial = await getSettings().catch(() => null);
  if (!initial) return;

  let settings = initial;
  let disabled = isDenied(settings);
  const controller = new SuggestionController(settings.suggestionCount);
  let strip: SuggestionStrip | null = null;
  let target: HTMLElement | null = null;
  let modelLoading = false;
  let learnTimer: ReturnType<typeof setTimeout> | null = null;

  function isDenied(s: Settings): boolean {
    try {
      return s.siteDenylist.includes(location.hostname);
    } catch {
      return false;
    }
  }

  function getStrip(): SuggestionStrip {
    if (!strip) strip = new SuggestionStrip();
    return strip;
  }

  async function ensureModel(): Promise<void> {
    if (controller.ready || modelLoading) return;
    modelLoading = true;
    try {
      controller.setSnapshot(await sendMessage('hydrate', undefined));
    } catch {
      // SW unavailable — stay quiet; we retry on the next focus.
    } finally {
      modelLoading = false;
    }
  }

  function scheduleLearnFlush(): void {
    if (learnTimer != null) return;
    learnTimer = setTimeout(() => {
      learnTimer = null;
      const batch = controller.drainLearn();
      if (batch.length > 0) void sendMessage('learn', batch).catch(() => {});
    }, 1500);
  }

  function refresh(): void {
    if (disabled || !target) return;
    try {
      const state = readField(target);
      if (!state) {
        strip?.hide();
        return;
      }
      const words = controller.update(state);
      if (controller.pendingCount > 0) scheduleLearnFlush();
      if (words.length === 0) {
        strip?.hide();
        return;
      }
      getStrip().show(words, caretRect(target), onAccept);
    } catch {
      strip?.hide();
    }
  }

  function onAccept(index: number): void {
    if (!target) return;
    try {
      const state = readField(target);
      if (!state) return;
      const plan = controller.accept(state, index);
      if (!plan) return;
      acceptInto(target, plan.deleteBefore, plan.text);
      scheduleLearnFlush();
      queueMicrotask(refresh); // surface next-word suggestions after the insert
    } catch {
      strip?.hide();
    }
  }

  function onFocusIn(e: Event): void {
    if (disabled) return;
    if (isEditable(e.target)) {
      target = e.target;
      void ensureModel().then(refresh);
    } else {
      target = null;
      strip?.hide();
    }
  }

  function onInput(e: Event): void {
    if (e.target === target) refresh();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!strip || !strip.isVisible()) return;
    switch (e.key) {
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        e.stopPropagation();
        strip.acceptHighlighted();
        break;
      case 'ArrowDown':
        e.preventDefault();
        strip.move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        strip.move(-1);
        break;
      case 'Escape':
        strip.hide();
        break;
      default:
        break;
    }
  }

  function onReposition(): void {
    if (strip?.isVisible() && target) strip.reposition(caretRect(target));
  }

  function onPointerDown(e: Event): void {
    if (strip?.isVisible() && !strip.contains(e.target)) strip.hide();
  }

  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('scroll', onReposition, true);
  window.addEventListener('resize', onReposition, true);
  document.addEventListener('pointerdown', onPointerDown, true);

  watchSettings((s) => {
    settings = s;
    disabled = isDenied(s);
    controller.setLimit(s.suggestionCount);
    if (disabled) strip?.hide();
  });

  // Handle the case where an editable is already focused at load time.
  const active = deepActiveElement();
  if (isEditable(active)) {
    target = active;
    void ensureModel().then(refresh);
  }
}
