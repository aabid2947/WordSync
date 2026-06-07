export type SuggestionSource = 'frequency' | 'correction' | 'ngram' | 'base' | 'llm';

export interface Suggestion {
  /** The suggested word (lowercased; the inserter re-cases to match context). */
  word: string;
  /** Normalized 0..1 confidence, comparable across sources for blending. */
  score: number;
  source: SuggestionSource;
}
