import { browser } from 'wxt/browser';
import { onMessage, sendMessage } from '../utils/messages';
import { buildSnapshot } from '../lib/storage/snapshot';
import { clearAll } from '../lib/storage/db';
import { clearMetrics, getMetrics, recordAccept, recordLlmSample } from '../lib/storage/metrics';
import {
  allWords,
  applyLearnEvents,
  deleteWord,
  listWords,
  seedWords,
  wordCount,
} from '../lib/storage/words';

// Minimal typing for chrome.offscreen (absent from the webextension-polyfill types).
interface OffscreenApi {
  hasDocument?: () => Promise<boolean>;
  createDocument: (opts: {
    url: string;
    reasons: string[];
    justification: string;
  }) => Promise<void>;
}
function offscreenApi(): OffscreenApi | undefined {
  return (globalThis as { chrome?: { offscreen?: OffscreenApi } }).chrome?.offscreen;
}

let offscreenReady: Promise<void> | null = null;
function ensureOffscreen(): Promise<void> {
  if (!offscreenReady) {
    offscreenReady = (async () => {
      const api = offscreenApi();
      if (!api) throw new Error('offscreen API unavailable');
      if (await api.hasDocument?.()) return;
      await api.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Run the local suggestion model (WebGPU) off the service worker.',
      });
    })().catch((err) => {
      offscreenReady = null; // allow retry
      throw err;
    });
  }
  return offscreenReady;
}

// Base vocabulary, fetched once in the SW (the extension's own context — not
// subject to the host page's CSP, unlike a content-script fetch). Cached for the
// SW's lifetime.
let baseWordsCache: string[] | null = null;
async function getBaseWordsCached(): Promise<string[]> {
  if (baseWordsCache) return baseWordsCache;
  try {
    const res = await fetch(browser.runtime.getURL('/words-en.txt'));
    const text = await res.text();
    baseWordsCache = text.split('\n').map((w) => w.trim()).filter(Boolean);
  } catch {
    baseWordsCache = [];
  }
  return baseWordsCache;
}

// Background service worker — the sole writer to IndexedDB and the orchestration
// hub. It holds no long-lived state (MV3 can evict it at any time); every handler
// reads/writes durable storage directly.
export default defineBackground(() => {
  // Content scripts pull the latest top-N model on activation.
  onMessage('hydrate', () => buildSnapshot());

  // Content scripts debounce/batch learn events before sending; each batch is
  // applied in a single transaction. Applied immediately (not re-queued) because
  // a deferred flush could be lost if the SW is suspended mid-wait.
  onMessage('learn', async ({ data }) => {
    if (data.length === 0) return;
    try {
      await applyLearnEvents(data);
    } catch (err) {
      console.warn('[wordsync] learn failed', err);
    }
  });

  // Onboarding imports a Gboard dictionary; the SW remains the sole DB writer.
  onMessage('seed', async ({ data }) => {
    const imported = await seedWords(data.map((word) => ({ word })));
    return { imported };
  });

  // Content asks for LLM next-word candidates; the SW spins up the offscreen doc
  // (lazily, once) and forwards. Any failure degrades to the fast path.
  onMessage('requestCompletion', async ({ data }) => {
    try {
      await ensureOffscreen();
      const res = await sendMessage('generateCompletion', data);
      void recordLlmSample({
        context: data.context.join(' '),
        predictions: res.words,
        latencyMs: res.latencyMs ?? 0,
        ok: res.ok ?? true,
        ...(res.loadedMs != null ? { loadedMs: res.loadedMs } : {}),
      }).catch(() => {});
      return { words: res.words };
    } catch {
      return { words: [] };
    }
  });

  // Content scripts get the base vocabulary from here (CSP-immune on strict sites).
  onMessage('getBaseWords', () => getBaseWordsCached());

  onMessage('getStats', async () => ({ words: await wordCount() }));

  // Options page — word management, export, reset (SW stays the sole DB writer).
  onMessage('listWords', ({ data }) => listWords(data));
  onMessage('deleteWord', ({ data }) => deleteWord(data));
  onMessage('exportWords', async () => ({ words: await allWords() }));
  onMessage('clearData', () => clearAll());

  // Local metrics (personal evaluation, esp. WebLLM).
  onMessage('recordAccept', ({ data }) => {
    void recordAccept(data).catch(() => {});
  });
  onMessage('getMetrics', () => getMetrics());
  onMessage('clearMetrics', () => clearMetrics());

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
    }
  });
});
