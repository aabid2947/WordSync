import { defineExtensionMessaging } from '@webext-core/messaging';
import type { LearnEvent, Snapshot } from '../lib/storage/types';

/**
 * Typed cross-context messaging contract. All `runtime.sendMessage` traffic goes
 * through this — no raw string-keyed messages elsewhere (CLAUDE.md §13).
 */
interface ProtocolMap {
  /** Content script -> SW: fetch the current top-N model snapshot for hydration. */
  hydrate(): Snapshot;
  /** Content script -> SW: persist a batch of committed words (fire-and-forget). */
  learn(events: LearnEvent[]): void;
  /** Onboarding -> SW: bulk-seed imported Gboard words. Returns the count added. */
  seed(words: string[]): { imported: number };
  /** UI -> SW: lightweight stats for the popup. */
  getStats(): { words: number };
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
