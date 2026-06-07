import { splitAtCaret, wordBeforeCaret } from '../text/tokenize';

export interface Acceptance {
  /** Characters before the caret to replace (the typed prefix; 0 for next-word). */
  deleteBefore: number;
  /** Exact text to insert (cased, with trailing space). */
  text: string;
  /** Canonical lowercase word, for the learn event. */
  word: string;
  /** Preceding tokens, for the learn event's n-gram context. */
  context: string[];
}

/**
 * Plan how to apply an accepted suggestion to the current field state: how much
 * of the typed prefix to replace, and the exact (re-cased) text to insert.
 */
export function planAcceptance(
  state: { text: string; caret: number },
  word: string,
  appendSpace = true,
): Acceptance {
  const { context } = splitAtCaret(state.text, state.caret);
  const rawPrefix = wordBeforeCaret(state.text, state.caret); // original case for matching
  const cased = applyCase(rawPrefix, context, word);
  return {
    deleteBefore: rawPrefix.length,
    text: appendSpace ? `${cased} ` : cased,
    word: word.toLowerCase(),
    context,
  };
}

/** Re-case the suggestion to match what the user typed (or sentence start). */
function applyCase(prefix: string, context: string[], word: string): string {
  if (prefix) {
    const first = prefix[0]!;
    if (isUpper(first)) {
      if (prefix.length > 1 && prefix === prefix.toUpperCase()) return word.toUpperCase();
      return capitalize(word);
    }
    return word;
  }
  // Next-word: capitalize only at the start of input (a crude sentence-start signal).
  return context.length === 0 ? capitalize(word) : word;
}

function isUpper(ch: string): boolean {
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1);
}
