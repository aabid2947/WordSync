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

/**
 * Given raw text and a caret offset, return the partial word immediately before
 * the caret (the prefix being typed) and the preceding tokens (the context).
 * The prefix is empty when the caret sits just after a separator — that's the
 * "predict the next word" case.
 */
export function splitAtCaret(
  text: string,
  caret: number,
): { prefix: string; context: string[] } {
  const before = text.slice(0, caret);
  // Trailing run of word characters = the prefix currently being typed.
  const prefixMatch = before.match(/[\p{L}\p{N}']+$/u);
  const prefix = (prefixMatch?.[0] ?? '').toLowerCase();
  const contextText = prefix ? before.slice(0, before.length - prefix.length) : before;
  return { prefix, context: tokenize(contextText) };
}
