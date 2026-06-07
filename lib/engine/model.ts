import { contextKeys } from '../text/tokenize';
import type { Snapshot } from '../storage/types';
import type { Suggestion } from './types';

interface Entry {
  word: string;
  count: number;
}

// Backoff weights: a more specific context beats a less specific one, and the
// global unigram prior is only a weak fallback when no context matches.
const W_TRIGRAM = 1.0;
const W_BIGRAM = 0.6;
const W_UNIGRAM = 0.1;

/**
 * In-memory suggestion model the content script hydrates from a {@link Snapshot}.
 * All lookups are synchronous so the fast path stays well under the 16 ms budget.
 */
export class SuggestionModel {
  readonly version: number;
  /** All words, sorted ascending for prefix range scans. */
  private readonly words: Entry[];
  /** Words sorted by count desc — the unigram fallback for next-word prediction. */
  private readonly topWords: Entry[];
  /** context -> candidate next-words, each list sorted by count desc. */
  private readonly byContext: Map<string, Entry[]>;

  constructor(snapshot: Snapshot) {
    this.version = snapshot.version;

    this.words = snapshot.unigrams.map(([word, count]) => ({ word, count }));
    this.words.sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));

    this.topWords = [...this.words].sort((a, b) => b.count - a.count);

    this.byContext = new Map();
    for (const [context, next, count] of snapshot.ngrams) {
      const list = this.byContext.get(context);
      if (list) list.push({ word: next, count });
      else this.byContext.set(context, [{ word: next, count }]);
    }
    for (const list of this.byContext.values()) list.sort((a, b) => b.count - a.count);
  }

  /** Words extending `prefix` (excluding the exact prefix), ranked by frequency. */
  completePrefix(prefix: string, limit: number): Suggestion[] {
    const p = prefix.toLowerCase();
    if (!p || limit <= 0) return [];
    const matches = this.prefixRange(p).filter((e) => e.word !== p);
    if (matches.length === 0) return [];
    matches.sort((a, b) => b.count - a.count);
    const max = matches[0]!.count || 1;
    return matches
      .slice(0, limit)
      .map((e) => ({ word: e.word, score: e.count / max, source: 'frequency' as const }));
  }

  /** Next-word predictions for `context` (oldest-first tokens), with trigram->bigram->unigram backoff. */
  predictNext(context: string[], limit: number): Suggestion[] {
    if (limit <= 0) return [];
    const n = context.length;
    const trigram = n >= 2 ? `${context[n - 2]} ${context[n - 1]}` : '';
    const bigram = n >= 1 ? context[n - 1]! : '';

    const scored = new Map<string, number>();
    const consider = (entries: Entry[] | undefined, weight: number): void => {
      if (!entries || entries.length === 0) return;
      const max = entries[0]!.count || 1; // entries are pre-sorted by count desc
      for (const e of entries) {
        const score = weight * (e.count / max);
        if (score > (scored.get(e.word) ?? 0)) scored.set(e.word, score);
      }
    };

    consider(trigram ? this.byContext.get(trigram) : undefined, W_TRIGRAM);
    consider(bigram ? this.byContext.get(bigram) : undefined, W_BIGRAM);
    consider(this.topWords, W_UNIGRAM);

    return [...scored.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word, score]) => ({ word, score, source: 'ngram' as const }));
  }

  /**
   * Optimistically fold a just-committed word into the in-memory model so it's
   * suggestable immediately in this tab, before the SW round-trips it to disk.
   * (The global unigram prior used for fallback is intentionally not rebuilt —
   * it's a weak signal and refreshes on the next hydrate.)
   */
  note(word: string, context: string[]): void {
    const w = word.toLowerCase();
    if (!w) return;
    this.bumpUnigram(w);
    for (const ctx of contextKeys(context)) this.bumpNgram(ctx, w);
  }

  private bumpUnigram(word: string): void {
    const i = this.lowerBound(word);
    const found = this.words[i];
    if (found && found.word === word) found.count += 1;
    else this.words.splice(i, 0, { word, count: 1 });
  }

  private bumpNgram(context: string, next: string): void {
    let list = this.byContext.get(context);
    if (!list) {
      list = [];
      this.byContext.set(context, list);
    }
    const entry = list.find((e) => e.word === next);
    if (entry) entry.count += 1;
    else list.push({ word: next, count: 1 });
    list.sort((a, b) => b.count - a.count); // keep desc for predictNext normalization
  }

  /** Entries whose word starts with `prefix`, via binary-search lower bound. */
  private prefixRange(prefix: string): Entry[] {
    const out: Entry[] = [];
    for (let i = this.lowerBound(prefix); i < this.words.length; i++) {
      const entry = this.words[i]!;
      if (!entry.word.startsWith(prefix)) break;
      out.push(entry);
    }
    return out;
  }

  private lowerBound(prefix: string): number {
    let lo = 0;
    let hi = this.words.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.words[mid]!.word < prefix) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
