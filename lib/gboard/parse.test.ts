import { describe, expect, it } from 'vitest';
import { parseGboardDictionary } from './parse';

const words = (text: string) => parseGboardDictionary(text).entries.map((e) => e.word);

describe('parseGboardDictionary', () => {
  it('parses one word per line', () => {
    expect(words('serendipity\nquokka\n')).toEqual(['serendipity', 'quokka']);
  });

  it('takes the word column from tab-separated "word<tab>locale"', () => {
    expect(words('serendipity\ten_US\nquokka\ten_US')).toEqual(['serendipity', 'quokka']);
  });

  it('skips a leading frequency column ("freq<tab>word<tab>locale")', () => {
    expect(words('5\tserendipity\ten')).toEqual(['serendipity']);
  });

  it('splits multi-word phrase entries into tokens', () => {
    expect(words('new york\ten')).toEqual(['new', 'york']);
  });

  it('lowercases and dedupes across lines', () => {
    const result = parseGboardDictionary('cat\ncat\nCat');
    expect(result.entries.map((e) => e.word)).toEqual(['cat']);
    expect(result.imported).toBe(1);
    expect(result.total).toBe(3);
  });

  it('does NOT misclassify short words as locale codes', () => {
    expect(words('to\nis\nof\ngo')).toEqual(['to', 'is', 'of', 'go']);
  });

  it('skips comments and blank lines (not counted in total)', () => {
    const result = parseGboardDictionary('# Personal dictionary export\n\nword\n');
    expect(result.entries.map((e) => e.word)).toEqual(['word']);
    expect(result.total).toBe(1);
  });

  it('skips lines with no extractable word and counts them', () => {
    const result = parseGboardDictionary('123\t456\nhello');
    expect(result.entries.map((e) => e.word)).toEqual(['hello']);
    expect(result.skipped).toBe(1);
    expect(result.total).toBe(2);
  });

  it('strips surrounding quotes', () => {
    expect(words('"hello"')).toEqual(['hello']);
  });

  it('returns an empty result for empty input without throwing', () => {
    expect(parseGboardDictionary('')).toEqual({ entries: [], imported: 0, skipped: 0, total: 0 });
  });
});
