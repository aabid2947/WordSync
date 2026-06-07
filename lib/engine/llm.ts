import { tokenize } from '../text/tokenize';

export interface CompletionRequest {
  /** The partial word being typed (empty for next-word prediction). */
  prefix: string;
  /** Preceding tokens, oldest-first. */
  context: string[];
}

export interface CompletionResult {
  words: string[];
}

export interface LlmStatus {
  ready: boolean;
  loading: boolean;
  error: string | null;
}

/** Build the prompt fed to the local model from the preceding context. */
export function buildPrompt(context: string[]): string {
  return context.join(' ');
}

/**
 * Turn a raw model generation into clean candidate words: tokenized, lowercased,
 * deduped, capped. Pure so it's unit-tested without the model.
 */
export function extractWords(generated: string, limit: number): string[] {
  if (limit <= 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokenize(generated)) {
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= limit) break;
  }
  return out;
}
