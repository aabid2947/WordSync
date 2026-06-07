import { defineExtensionMessaging } from '@webext-core/messaging';
import type { LearnEvent, Snapshot, WordRow } from '../lib/storage/types';
import type { WordPage } from '../lib/storage/words';
import type { CompletionRequest, CompletionResult, LlmStatus } from '../lib/engine/llm';

/**
 * Typed cross-context messaging contract. All `runtime.sendMessage` traffic goes
 * through this — no raw string-keyed messages elsewhere (CLAUDE.md §13).
 */
interface ProtocolMap {
  /** Content script -> SW: fetch the current top-N model snapshot for hydration. */
  hydrate(): Snapshot;
  /** Content script -> SW: persist a batch of committed words (fire-and-forget). */
  learn(events: LearnEvent[]): void;
  /** Content -> SW: the bundled base vocabulary (SW fetches it — CSP-immune). */
  getBaseWords(): string[];
  /** Onboarding -> SW: bulk-seed imported Gboard words. Returns the count added. */
  seed(words: string[]): { imported: number };
  /** UI -> SW: lightweight stats for the popup. */
  getStats(): { words: number };
  /** Options -> SW: search/paginate the word store. */
  listWords(opts: { query?: string; limit?: number; offset?: number }): WordPage;
  /** Options -> SW: delete a single word. */
  deleteWord(word: string): void;
  /** Options -> SW: all words, for export. */
  exportWords(): { words: WordRow[] };
  /** Options -> SW: wipe all learned data. */
  clearData(): void;
  /** Content -> SW: get LLM next-word candidates (SW spins up + forwards to offscreen). */
  requestCompletion(request: CompletionRequest): CompletionResult;
  /** SW -> offscreen: actually run the model. Handled ONLY in the offscreen doc. */
  generateCompletion(request: CompletionRequest): CompletionResult;
  /** UI/SW -> offscreen: model load status. Handled ONLY in the offscreen doc. */
  llmStatus(): LlmStatus;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
