import { topNgrams, topUnigrams } from './words';
import type { Snapshot } from './types';

/**
 * Build the compact top-N model the content script hydrates into memory for the
 * synchronous fast path. Kept small (tuples, capped counts) to stay cheap over
 * the messaging channel and light in every frame.
 */
export async function buildSnapshot(
  opts: { unigramLimit?: number; ngramLimit?: number } = {},
): Promise<Snapshot> {
  const { unigramLimit = 8000, ngramLimit = 20000 } = opts;
  const [unigrams, ngrams] = await Promise.all([
    topUnigrams(unigramLimit),
    topNgrams(ngramLimit),
  ]);
  return {
    version: Date.now(),
    unigrams: unigrams.map((r) => [r.word, r.count]),
    ngrams: ngrams.map((r) => [r.context, r.next, r.count]),
  };
}
