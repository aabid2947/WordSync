import { splitAtCaret } from '../text/tokenize';
import { blend } from './blend';
import type { SuggestionModel } from './model';
import type { Suggestion } from './types';

/**
 * The synchronous fast path the content script runs on every relevant keystroke.
 * Mid-word: personal completions + base completions + spelling corrections,
 * blended and ranked. After a separator: next-word prediction. Pure by design.
 */
export function suggestFast(
  model: SuggestionModel,
  text: string,
  caret: number,
  limit: number,
): Suggestion[] {
  const { prefix, context } = splitAtCaret(text, caret);
  if (!prefix) return model.predictNext(context, limit);
  return blend(
    [
      model.completePrefix(prefix, limit),
      model.basePrefix(prefix, limit),
      model.correct(prefix, limit),
    ],
    limit,
  );
}
