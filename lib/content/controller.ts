import { blend } from '../engine/blend';
import { planAcceptance, type Acceptance } from '../engine/accept';
import { suggestFast } from '../engine/fastpath';
import { SuggestionModel } from '../engine/model';
import { splitAtCaret } from '../text/tokenize';
import type { LearnEvent, Snapshot } from '../storage/types';
import type { Suggestion } from '../engine/types';

// LLM suggestions sit just below a strong personal match but can outrank weak
// fallbacks. Exact weighting is a tuning knob (CLAUDE.md §6).
const LLM_TOP_SCORE = 0.65;
const LLM_STEP = 0.05;

export interface FieldState {
  text: string;
  caret: number;
}

/**
 * The content script's orchestration brain, decoupled from the DOM for testing.
 * It owns the in-memory model, detects word commits, queues learn events, and
 * plans acceptances. content.ts is the thin glue that feeds it field states and
 * renders/inserts the results.
 */
export class SuggestionController {
  private model: SuggestionModel | null = null;
  private lastPrefix = '';
  private lastContext: string[] = [];
  private shown: string[] = [];
  private lastFast: Suggestion[] = [];
  private nextWord = false;
  private baseWords: string[] = [];
  private pending: LearnEvent[] = [];

  constructor(
    private limit = 3,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get ready(): boolean {
    return this.model !== null;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /** True when the last update was a next-word context (worth an LLM query). */
  get suggestsNextWord(): boolean {
    return this.nextWord;
  }

  setSnapshot(snapshot: Snapshot): void {
    this.model = new SuggestionModel(snapshot);
    if (this.baseWords.length > 0) this.model.loadBase(this.baseWords);
  }

  /** Provide the bundled base vocabulary; applied to the current/next model. */
  setBase(words: string[]): void {
    this.baseWords = words;
    this.model?.loadBase(words);
  }

  setLimit(limit: number): void {
    this.limit = Math.max(1, limit);
  }

  /** Feed a new field state; returns the words to display. Detects word commits. */
  update(state: FieldState): string[] {
    if (!this.model) return [];
    const { prefix, context } = splitAtCaret(state.text, state.caret);

    // A word was committed when the prefix cleared after having been non-empty
    // (the user typed a separator after a word).
    if (prefix === '' && this.lastPrefix !== '') {
      this.commit(this.lastPrefix, this.lastContext, 'typed');
    }
    this.lastPrefix = prefix;
    this.lastContext = context;

    // Don't suggest on a truly empty field (no prefix, no context).
    if (prefix === '' && context.length === 0) {
      this.nextWord = false;
      this.lastFast = [];
      this.shown = [];
      return this.shown;
    }

    this.nextWord = prefix === '';
    this.lastFast = suggestFast(this.model, state.text, state.caret, this.limit);
    this.shown = blend([this.lastFast], this.limit).map((s) => s.word);
    return this.shown;
  }

  /**
   * Re-rank the last fast-path suggestions together with async LLM next-word
   * candidates. Returns the new display list. Fast-path (personal) wins ties.
   */
  blendWith(llmWords: string[]): string[] {
    const llm: Suggestion[] = [];
    llmWords.forEach((word, i) => {
      const w = word.toLowerCase();
      if (w) llm.push({ word: w, score: Math.max(0.1, LLM_TOP_SCORE - i * LLM_STEP), source: 'llm' });
    });
    this.shown = blend([this.lastFast, llm], this.limit).map((s) => s.word);
    return this.shown;
  }

  /** Plan acceptance of the suggestion at `index` (from the last `update`). */
  accept(state: FieldState, index: number): Acceptance | null {
    if (!this.model) return null;
    const word = this.shown[index];
    if (word == null) return null;
    const plan = planAcceptance(state, word);
    this.commit(plan.word, plan.context, 'accepted');
    // We inserted "<word> ", so the next prefix is empty and the word joins context.
    this.lastPrefix = '';
    this.lastContext = [...plan.context, plan.word];
    return plan;
  }

  /** Drain queued learn events for sending to the SW. */
  drainLearn(): LearnEvent[] {
    return this.pending.splice(0, this.pending.length);
  }

  private commit(word: string, context: string[], source: LearnEvent['source']): void {
    const w = word.toLowerCase();
    if (!w) return;
    this.model?.note(w, context);
    this.pending.push({ word: w, context, source, ts: this.now() });
  }
}
