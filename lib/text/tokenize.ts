/**
 * Shared tokenization used by both the learning path (counting what the user
 * types) and the suggestion path (deriving prefix + context). Unicode-aware so
 * it works across languages even though v1 ships English-first.
 */

// A "word" token: letters/numbers plus intra-word apostrophes (don't, it's).
const WORD_RE = /[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu;

/** Split text into lowercase word tokens. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(WORD_RE) ?? [];
}

const PARTIAL_WORD_RE = /[\p{L}\p{N}']+$/u;

/** The partial word immediately before the caret, in its original case. */
export function wordBeforeCaret(text: string, caret: number): string {
  return text.slice(0, caret).match(PARTIAL_WORD_RE)?.[0] ?? '';
}

/**
 * Given raw text and a caret offset, return the partial word immediately before
 * the caret (the prefix being typed, lowercased) and the preceding tokens (the
 * context). The prefix is empty when the caret sits just after a separator —
 * that's the "predict the next word" case.
 */
export function splitAtCaret(
  text: string,
  caret: number,
): { prefix: string; context: string[] } {
  const before = text.slice(0, caret);
  const raw = wordBeforeCaret(text, caret);
  const prefix = raw.toLowerCase();
  const contextText = raw ? before.slice(0, before.length - raw.length) : before;
  return { prefix, context: tokenize(contextText) };
}

/**
 * N-gram context keys for a sequence of preceding tokens: the last token alone
 * (bigram context) and the last two joined by a space (trigram context). Shared
 * by the DB writer and the in-memory model so persisted and optimistic n-grams
 * line up exactly.
 */
export function contextKeys(context: string[]): string[] {
  const out: string[] = [];
  const n = context.length;
  if (n >= 1) out.push(context[n - 1]!);
  if (n >= 2) out.push(`${context[n - 2]} ${context[n - 1]}`);
  return out;
}
