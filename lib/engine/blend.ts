import type { Suggestion, SuggestionSource } from './types';

// On a score tie, personal data wins over the generic model (CLAUDE.md §6).
const SOURCE_RANK: Record<SuggestionSource, number> = {
  frequency: 0,
  ngram: 1,
  llm: 2,
};

/**
 * Merge candidate lists (fast path + LLM) into a deduped, ranked top-k. For each
 * word the highest-scoring candidate wins; ties break toward personal sources.
 */
export function blend(lists: Suggestion[][], limit: number): Suggestion[] {
  const best = new Map<string, Suggestion>();
  for (const list of lists) {
    for (const s of list) {
      const cur = best.get(s.word);
      if (!cur || isBetter(s, cur)) best.set(s.word, s);
    }
  }
  return [...best.values()].sort(compare).slice(0, Math.max(0, limit));
}

function isBetter(a: Suggestion, b: Suggestion): boolean {
  if (a.score !== b.score) return a.score > b.score;
  return SOURCE_RANK[a.source] < SOURCE_RANK[b.source];
}

function compare(a: Suggestion, b: Suggestion): number {
  if (a.score !== b.score) return b.score - a.score;
  return SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
}
