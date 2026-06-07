/** Where a word came from — used for ranking heuristics and word management. */
export type WordSource = 'typed' | 'gboard' | 'accepted';

/** Unigram row: one entry per distinct word. */
export interface WordRow {
  word: string;
  count: number;
  lastSeen: number;
  source: WordSource;
}

/** N-gram row: `next` follows `context` (1 or 2 preceding tokens). Keyed by [context, next]. */
export interface NgramRow {
  context: string;
  next: string;
  count: number;
}

/** Per-session usage stats (for the options page later). */
export interface SessionRow {
  sessionId: string;
  startedAt: number;
  wordsTyped: number;
  wordsSuggested: number;
  wordsAccepted: number;
}

/** A single thing-the-user-committed, sent from the content script to the SW writer. */
export interface LearnEvent {
  /** The committed word. */
  word: string;
  /** Preceding tokens (already tokenized, oldest-first). */
  context: string[];
  source: WordSource;
  ts: number;
}

// Compact tuple forms keep the hydration snapshot small over the messaging channel.
export type SnapshotUnigram = [word: string, count: number];
export type SnapshotNgram = [context: string, next: string, count: number];

export interface Snapshot {
  version: number;
  unigrams: SnapshotUnigram[];
  ngrams: SnapshotNgram[];
}
