import { SuggestionController } from '../lib/content/controller';
import { caretRect, readField, type FieldState } from '../lib/dom/caret';
import { deepActiveElement, isEditable } from '../lib/dom/detect';
import { acceptInto } from '../lib/dom/insert';
import { SuggestionStrip } from '../lib/dom/strip';
import { getSettings, isHostDenied, watchSettings, type Settings } from '../lib/storage/settings';
import { splitAtCaret } from '../lib/text/tokenize';
import { sendMessage } from '../utils/messages';

// Base English vocabulary, requested from the SW (which fetches it once). Going
// through the SW avoids the host page's CSP blocking a content-script fetch on
// strict sites (Gmail, Gemini, WhatsApp). Cached per frame.
let baseWordsPromise: Promise<string[]> | null = null;
function loadBaseWords(): Promise<string[]> {
  if (!baseWordsPromise) {
    baseWordsPromise = sendMessage('getBaseWords', undefined).catch(() => []);
  }
  return baseWordsPromise;
}

// Content script — every frame, every site (isolated world). All handlers are
// defensive: a failure degrades to "no suggestions", never a broken page.
export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  // Inject into about:blank / about:srcdoc / data: frames too — rich-text editors
  // like TinyMCE and CKEditor put their editable <body> inside such an iframe.
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  runAt: 'document_idle',
  main() {
    const hasCtx = !!(globalThis as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id;
    console.log('[wordsync] content loaded', { url: location.href, hasCtx, top: window.top === window });
    // about:blank / srcdoc / sandboxed frames (which the fallback flags inject
    // into) may have no usable extension context — `chrome.runtime.id` is absent.
    // Bail before touching any extension API so the messaging polyfill can't throw.
    if (!hasCtx) return;
    void boot().catch((e) => console.log('[wordsync] boot error', e));
  },
});

async function boot(): Promise<void> {
  const initial = await getSettings().catch(() => null);
  if (!initial) return;

  let settings = initial;
  let disabled = isDenied(settings);
  console.log('[wordsync] boot', { host: location.hostname, disabled });
  const controller = new SuggestionController(settings.suggestionCount);
  let strip: SuggestionStrip | null = null;
  let target: HTMLElement | null = null;
  let modelLoading = false;
  let learnTimer: ReturnType<typeof setTimeout> | null = null;
  let llmTimer: ReturnType<typeof setTimeout> | null = null;
  let llmSeq = 0; // bumped on every refresh; stale LLM replies are ignored

  function isDenied(s: Settings): boolean {
    try {
      return isHostDenied(s.siteDenylist, location.hostname);
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
      const base = await loadBaseWords();
      controller.setBase(base);
      console.log('[wordsync] model ready, base words:', base.length);
    } catch (e) {
      console.log('[wordsync] ensureModel failed', e);
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
    llmSeq += 1; // invalidate any in-flight LLM request
    try {
      const state = readField(target);
      if (!state) {
        strip?.hide();
        return;
      }
      const words = controller.update(state);
      console.log('[wordsync] refresh', { text: state.text, caret: state.caret, words, ready: controller.ready });
      if (controller.pendingCount > 0) scheduleLearnFlush();
      if (words.length === 0) {
        strip?.hide();
        return;
      }
      getStrip().show(words, caretRect(target), onAccept);
      maybeRequestLLM(state, llmSeq);
    } catch {
      strip?.hide();
    }
  }

  function maybeRequestLLM(state: FieldState, seq: number): void {
    if (!settings.useLLM || !controller.ready || !controller.suggestsNextWord) return;
    if (llmTimer != null) clearTimeout(llmTimer);
    const { context } = splitAtCaret(state.text, state.caret);
    llmTimer = setTimeout(() => {
      llmTimer = null;
      void sendMessage('requestCompletion', { prefix: '', context })
        .then(({ words }) => {
          if (seq !== llmSeq || !target || words.length === 0) return;
          const merged = controller.blendWith(words);
          if (merged.length > 0) getStrip().show(merged, caretRect(target), onAccept);
        })
        .catch(() => {});
    }, 200);
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
    // Resolve the truly-focused element, descending through open shadow roots
    // (a focusin's target is retargeted to the shadow host, which isn't editable).
    const path = (e.composedPath?.() ?? []) as EventTarget[];
    const candidate = path.find(isEditable) ?? deepActiveElement() ?? e.target;
    console.log(
      '[wordsync] focusin',
      (candidate as Element | null)?.tagName,
      'editable=',
      isEditable(candidate),
    );
    if (isEditable(candidate)) {
      target = candidate;
      void ensureModel().then(refresh);
    } else {
      target = null;
      strip?.hide();
    }
  }

  function onInput(e: Event): void {
    // Match the tracked field, or a node inside it — some editors fire `input`
    // on a nested node rather than the contenteditable host itself.
    const t = e.target;
    if (t === target || (target !== null && t instanceof Node && target.contains(t))) refresh();
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
    if (!strip?.isVisible()) return;
    const t = e.target;
    if (strip.contains(t)) return; // clicking a chip
    if (target !== null && t instanceof Node && target.contains(t)) return; // clicking in the field
    strip.hide();
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
