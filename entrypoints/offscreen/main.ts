import { buildPrompt, extractWords, type CompletionRequest, type LlmStatus } from '../../lib/engine/llm';
import { getSettings } from '../../lib/storage/settings';
import { onMessage } from '../../utils/messages';

// The WebLLM host. Lives in an offscreen document because WebGPU is unavailable
// in the service worker. The engine + model weights load lazily on first request.
// NOTE: model loading, WebGPU inference, and CPU fallback can only be verified in
// a real browser on capable hardware — not headlessly.

type Engine = Awaited<ReturnType<(typeof import('@mlc-ai/web-llm'))['CreateMLCEngine']>>;

const status: LlmStatus = { ready: false, loading: false, error: null };
let enginePromise: Promise<Engine> | null = null;

function loadEngine(): Promise<Engine> {
  if (enginePromise) return enginePromise;
  status.loading = true;
  status.error = null;
  enginePromise = (async () => {
    if (!('gpu' in navigator)) throw new Error('WebGPU unavailable');
    const webllm = await import('@mlc-ai/web-llm');
    const { model } = await getSettings();
    const engine = await webllm.CreateMLCEngine(model, { initProgressCallback: () => {} });
    status.ready = true;
    return engine;
  })()
    .catch((err: unknown) => {
      status.error = err instanceof Error ? err.message : String(err);
      enginePromise = null; // allow a later retry (e.g. after weights cache)
      throw err;
    })
    .finally(() => {
      status.loading = false;
    });
  return enginePromise;
}

async function complete(request: CompletionRequest, limit: number): Promise<string[]> {
  const prompt = buildPrompt(request.context);
  if (!prompt) return [];
  const engine = await loadEngine();
  const reply = await engine.chat.completions.create({
    messages: [
      {
        role: 'system',
        content:
          'Continue the user text with only the most likely next word or two. Reply with words only, no punctuation or explanation.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 8,
    temperature: 0.2,
  });
  const text = reply.choices[0]?.message?.content ?? '';
  return extractWords(text, limit);
}

onMessage('generateCompletion', async ({ data }) => {
  try {
    return { words: await complete(data, 3) };
  } catch {
    return { words: [] }; // fail silent — fast path still serves suggestions
  }
});

onMessage('llmStatus', () => ({ ...status }));
