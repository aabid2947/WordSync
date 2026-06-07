import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { clearMetrics, getMetrics, recordAccept, recordLlmSample } from './metrics';

beforeEach(async () => {
  await fakeBrowser.storage.local.clear();
  await clearMetrics();
});

describe('metrics', () => {
  it('starts effectively empty', async () => {
    await fakeBrowser.storage.local.clear();
    const m = await getMetrics();
    expect(m.llm.requests).toBe(0);
    expect(m.accepts).toEqual({});
    expect(m.recentLlm).toEqual([]);
  });

  it('records LLM samples (newest first) with latency + error tallies', async () => {
    await recordLlmSample({ context: 'the quick', predictions: ['fox'], latencyMs: 120, ok: true });
    await recordLlmSample({ context: 'hello', predictions: [], latencyMs: 80, ok: false });
    const m = await getMetrics();
    expect(m.llm.requests).toBe(2);
    expect(m.llm.errors).toBe(1);
    expect(m.llm.totalLatencyMs).toBe(200);
    expect(m.recentLlm).toHaveLength(2);
    expect(m.recentLlm[0]?.context).toBe('hello'); // newest first
  });

  it('counts model loads when loadedMs is present', async () => {
    await recordLlmSample({ context: 'a', predictions: ['b'], latencyMs: 50, ok: true, loadedMs: 5000 });
    const m = await getMetrics();
    expect(m.llm.loads).toBe(1);
    expect(m.llm.totalLoadMs).toBe(5000);
  });

  it('tallies accepts by source', async () => {
    await recordAccept('llm');
    await recordAccept('llm');
    await recordAccept('frequency');
    const m = await getMetrics();
    expect(m.accepts.llm).toBe(2);
    expect(m.accepts.frequency).toBe(1);
  });

  it('clears all stats', async () => {
    await recordAccept('llm');
    await recordLlmSample({ context: 'x', predictions: ['y'], latencyMs: 10, ok: true });
    await clearMetrics();
    const m = await getMetrics();
    expect(m.accepts).toEqual({});
    expect(m.llm.requests).toBe(0);
    expect(m.recentLlm).toEqual([]);
  });
});
