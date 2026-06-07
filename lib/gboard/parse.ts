import { tokenize } from '../text/tokenize';

export interface ParsedDictionary {
  /** Unique, lowercased words ready to feed seedWords(). */
  entries: Array<{ word: string }>;
  /** Count of unique words extracted. */
  imported: number;
  /** Lines that yielded no usable word. */
  skipped: number;
  /** Non-empty, non-comment lines processed. */
  total: number;
}

/**
 * Parse a Gboard / Android personal-dictionary export. The export format varies
 * across Android versions (plain words, `word⇥locale`, `freq⇥word⇥locale`, …),
 * so this is deliberately tolerant: take the first non-numeric column as the
 * word and tokenize it (splitting multi-word phrases). Never throws on bad input.
 *
 * NOTE: validate against a real export and adjust the column heuristic if needed
 * (CLAUDE.md §8).
 */
export function parseGboardDictionary(text: string): ParsedDictionary {
  const lines = text.split(/\r\n|\r|\n/);
  const seen = new Set<string>();
  const entries: Array<{ word: string }> = [];
  let total = 0;
  let skipped = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    total += 1;

    const columns = line
      .split('\t')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    // The word is the first column that isn't a bare frequency number.
    const wordColumn = columns.find((c) => !/^\d+$/.test(c));
    if (wordColumn === undefined) {
      skipped += 1;
      continue;
    }

    const tokens = tokenize(stripQuotes(wordColumn)).filter((t) => t.length <= 40);
    if (tokens.length === 0) {
      skipped += 1;
      continue;
    }
    for (const token of tokens) {
      if (!seen.has(token)) {
        seen.add(token);
        entries.push({ word: token });
      }
    }
  }

  return { entries, imported: entries.length, skipped, total };
}

function stripQuotes(value: string): string {
  return value.replace(/^["']+|["']+$/g, '');
}
