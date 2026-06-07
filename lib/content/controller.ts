import { blend } from '../engine/blend';
import { planAcceptance, type Acceptance } from '../engine/accept';
import { suggestFast } from '../engine/fastpath';
import { SuggestionModel } from '../engine/model';
import { splitAtCaret } from '../text/tokenize';
import type { LearnEvent, Snapshot } from '../storage/types';

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

  setSnapshot(snapshot: Snapshot): void {
    this.model = new SuggestionModel(snapshot);
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
      this.shown = [];
      return this.shown;
    }

    this.shown = blend([suggestFast(this.model, state.text, state.caret, this.limit)], this.limit).map(
      (s) => s.word,
    );
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
