import { RELAY_URL } from '../../utils/env';

export interface RelaySession {
  token: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

interface PollOptions {
  base?: string;
  signal?: AbortSignal;
  intervalMs?: number;
}

/** Start a relay session; the returned uploadUrl is what the QR encodes. */
export async function createSession(base: string = RELAY_URL): Promise<RelaySession> {
  const res = await fetch(`${base}/create-session`, { method: 'POST' });
  if (!res.ok) throw new Error(`create-session failed (${res.status})`);
  return (await res.json()) as RelaySession;
}

/**
 * Poll the relay until the phone uploads the file, then return its text. Resolves
 * once; throws on expiry, error, or abort. The relay deletes the file on read.
 */
export async function pollForFile(token: string, options: PollOptions = {}): Promise<string> {
  const { base = RELAY_URL, signal, intervalMs = 2000 } = options;
  while (!signal?.aborted) {
    const res = await fetch(`${base}/session/${token}`, signal ? { signal } : {});
    if (res.status === 204) {
      await delay(intervalMs, signal);
      continue;
    }
    if (res.status === 410) throw new Error('Session expired');
    if (!res.ok) throw new Error(`relay error (${res.status})`);
    return res.text();
  }
  throw new Error('aborted');
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}
