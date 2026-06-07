import type { LearnEvent, Snapshot, WordRow } from '../lib/storage/types';
import type { WordPage } from '../lib/storage/words';
import type { CompletionRequest, CompletionResult, LlmStatus } from '../lib/engine/llm';

/**
 * Typed cross-context messaging over `chrome.runtime` directly. Deliberately does
 * NOT use webextension-polyfill / @webext-core/messaging: those self-execute on
 * import and throw "This script should only be loaded in a browser extension" in
 * frames without an extension context (e.g. a site's sandboxed iframes), which
 * crashed the whole content script. This layer simply no-ops where there's no
 * runtime. Each message `type` must be handled in exactly one context.
 */
interface ProtocolMap {
  hydrate(): Snapshot;
  learn(events: LearnEvent[]): void;
  getBaseWords(): string[];
  seed(words: string[]): { imported: number };
  requestCompletion(request: CompletionRequest): CompletionResult;
  generateCompletion(request: CompletionRequest): CompletionResult;
  llmStatus(): LlmStatus;
  getStats(): { words: number };
  listWords(opts: { query?: string; limit?: number; offset?: number }): WordPage;
  deleteWord(word: string): void;
  exportWords(): { words: WordRow[] };
  clearData(): void;
}

type Keys = keyof ProtocolMap;
type Arg<K extends Keys> = Parameters<ProtocolMap[K]>[0];
type Ret<K extends Keys> = Awaited<ReturnType<ProtocolMap[K]>>;

interface Envelope {
  __wordsync: true;
  type: string;
  data: unknown;
}
interface Reply {
  data?: unknown;
  __error?: string;
}

interface MinimalRuntime {
  id?: string;
  lastError?: { message?: string };
  sendMessage(message: unknown, callback: (response: unknown) => void): void;
  onMessage: {
    addListener(
      cb: (
        message: unknown,
        sender: unknown,
        sendResponse: (response: unknown) => void,
      ) => boolean | undefined,
    ): void;
  };
}

function getRuntime(): MinimalRuntime | undefined {
  return (globalThis as { chrome?: { runtime?: MinimalRuntime } }).chrome?.runtime;
}

export function sendMessage<K extends Keys>(type: K, data: Arg<K>): Promise<Ret<K>> {
  return new Promise<Ret<K>>((resolve, reject) => {
    const rt = getRuntime();
    if (!rt?.sendMessage) {
      reject(new Error('wordsync: no extension runtime'));
      return;
    }
    const envelope: Envelope = { __wordsync: true, type, data };
    rt.sendMessage(envelope, (response: unknown) => {
      const lastError = rt.lastError;
      if (lastError) {
        reject(new Error(lastError.message ?? 'sendMessage failed'));
        return;
      }
      const reply = response as Reply | undefined;
      if (reply?.__error) {
        reject(new Error(reply.__error));
        return;
      }
      resolve(reply?.data as Ret<K>);
    });
  });
}

type MessageHandler<K extends Keys> = (message: { data: Arg<K> }) => Ret<K> | Promise<Ret<K>>;

const handlers = new Map<string, (data: unknown) => unknown>();
let listening = false;

export function onMessage<K extends Keys>(type: K, handler: MessageHandler<K>): void {
  handlers.set(type, (data) => handler({ data: data as Arg<K> }));
  ensureListener();
}

function ensureListener(): void {
  const rt = getRuntime();
  if (listening || !rt?.onMessage) return;
  listening = true;
  rt.onMessage.addListener((message, _sender, sendResponse) => {
    const env = message as Envelope | undefined;
    if (env?.__wordsync !== true) return undefined;
    const handler = handlers.get(env.type);
    if (!handler) return undefined;
    Promise.resolve()
      .then(() => handler(env.data))
      .then((data) => sendResponse({ data } satisfies Reply))
      .catch((e: unknown) =>
        sendResponse({ __error: e instanceof Error ? e.message : String(e) } satisfies Reply),
      );
    return true; // keep the channel open for the async response
  });
}
