import { splitAtCaret } from '../text/tokenize';
import type { SuggestionModel } from './model';
import type { Suggestion } from './types';

/**
 * The synchronous fast path the content script runs on every relevant keystroke.
 * Routes to prefix completion when mid-word, or next-word prediction when the
 * caret sits after a separator. Pure and allocation-light by design.
 */
export function suggestFast(
  model: SuggestionModel,
  text: string,
  caret: number,
  limit: number,
): Suggestion[] {
  const { prefix, context } = splitAtCaret(text, caret);
  return prefix ? model.completePrefix(prefix, limit) : model.predictNext(context, limit);
}
