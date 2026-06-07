import { browser } from 'wxt/browser';
import type { SuggestionSource } from '../engine/types';

// Local-only usage metrics for personal evaluation (esp. WebLLM quality over
// days). Stored in chrome.storage.local — never sent anywhere; cleared on demand
// and on uninstall. recentLlm keeps a small ring buffer of context->prediction
// samples so you can eyeball the model's output. Capped + opt-in to clear.

export interface LlmSample {
  ts: number;
  context: string;
  predictions: string[];
  latencyMs: number;
  ok: boolean;
}

export interface Metrics {
  since: number;
  llm: {
    requests: number;
    errors: number;
    totalLatencyMs: number;
    loads: number;
    loadErrors: number;
    totalLoadMs: number;
  };
  accepts: Partial<Record<SuggestionSource, number>>;
  recentLlm: LlmSample[];
}

const KEY = 'metrics';
const MAX_SAMPLES = 100;

function empty(): Metrics {
  return {
    since: Date.now(),
    llm: { requests: 0, errors: 0, totalLatencyMs: 0, loads: 0, loadErrors: 0, totalLoadMs: 0 },
    accepts: {},
    recentLlm: [],
  };
}

export async function getMetrics(): Promise<Metrics> {
  const stored = (await browser.storage.local.get(KEY))[KEY] as Partial<Metrics> | undefined;
  return { ...empty(), ...stored };
}

// Serialize read-modify-write so concurrent records (multiple frames) don't clobber.
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run as Promise<T>;
}

async function save(metrics: Metrics): Promise<void> {
  await browser.storage.local.set({ [KEY]: metrics });
}

export function recordLlmSample(sample: {
  context: string;
  predictions: string[];
  latencyMs: number;
  ok: boolean;
  loadedMs?: number;
}): Promise<void> {
  return enqueue(async () => {
    const m = await getMetrics();
    m.llm.requests += 1;
    if (!sample.ok) m.llm.errors += 1;
    m.llm.totalLatencyMs += sample.latencyMs;
    if (sample.loadedMs != null) {
      m.llm.loads += 1;
      m.llm.totalLoadMs += sample.loadedMs;
      if (!sample.ok) m.llm.loadErrors += 1;
    }
    m.recentLlm.unshift({
      ts: Date.now(),
      context: sample.context,
      predictions: sample.predictions,
      latencyMs: sample.latencyMs,
      ok: sample.ok,
    });
    if (m.recentLlm.length > MAX_SAMPLES) m.recentLlm.length = MAX_SAMPLES;
    await save(m);
  });
}

export function recordAccept(source: SuggestionSource): Promise<void> {
  return enqueue(async () => {
    const m = await getMetrics();
    m.accepts[source] = (m.accepts[source] ?? 0) + 1;
    await save(m);
  });
}

export function clearMetrics(): Promise<void> {
  return enqueue(() => save(empty()));
}
