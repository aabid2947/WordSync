import { browser } from 'wxt/browser';
import { onMessage } from '../utils/messages';
import { buildSnapshot } from '../lib/storage/snapshot';
import { applyLearnEvents, seedWords, wordCount } from '../lib/storage/words';

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

  onMessage('getStats', async () => ({ words: await wordCount() }));

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
    }
  });
});
