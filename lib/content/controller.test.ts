import { describe, expect, it } from 'vitest';
import { SuggestionController } from './controller';
import type { Snapshot } from '../storage/types';

const snapshot: Snapshot = {
  version: 1,
  unigrams: [
    ['brown', 5],
    ['bring', 3],
  ],
  ngrams: [['the', 'quick', 4]],
};

function make(): SuggestionController {
  const c = new SuggestionController(3, () => 42);
  c.setSnapshot(snapshot);
  return c;
}

describe('SuggestionController', () => {
  it('returns prefix completions ranked by frequency', () => {
    expect(make().update({ text: 'br', caret: 2 })).toEqual(['brown', 'bring']);
  });

  it('suppresses suggestions on a truly empty field', () => {
    expect(make().update({ text: '', caret: 0 })).toEqual([]);
  });

  it('detects a word commit when a separator clears the prefix, and learns it optimistically', () => {
    const c = make();
    c.update({ text: 'hello', caret: 5 }); // prefix "hello"
    c.update({ text: 'hello ', caret: 6 }); // prefix cleared -> commit "hello"

    expect(c.drainLearn()).toEqual([{ word: 'hello', context: [], source: 'typed', ts: 42 }]);
    // note() folded it into the model, so it's completable right away
    expect(c.update({ text: 'hel', caret: 3 })).toContain('hello');
  });

  it('plans an acceptance and records an accepted learn event', () => {
    const c = make();
    c.update({ text: 'br', caret: 2 }); // shows ['brown', 'bring']
    const plan = c.accept({ text: 'br', caret: 2 }, 0);
    expect(plan).toMatchObject({ deleteBefore: 2, text: 'brown ', word: 'brown' });
    expect(c.drainLearn()).toEqual([{ word: 'brown', context: [], source: 'accepted', ts: 42 }]);
  });

  it('is inert before a snapshot is set', () => {
    const c = new SuggestionController();
    expect(c.update({ text: 'br', caret: 2 })).toEqual([]);
    expect(c.accept({ text: 'br', caret: 2 }, 0)).toBeNull();
  });

  it('returns null when accepting an out-of-range index', () => {
    const c = make();
    c.update({ text: 'br', caret: 2 });
    expect(c.accept({ text: 'br', caret: 2 }, 9)).toBeNull();
  });
});
