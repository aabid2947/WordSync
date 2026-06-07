import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession, pollForFile } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createSession', () => {
  it('returns the session payload on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ token: 't', uploadUrl: 'u', expiresInSeconds: 600 }), {
            status: 200,
          }),
      ),
    );
    await expect(createSession('https://r')).resolves.toMatchObject({ token: 't', uploadUrl: 'u' });
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    await expect(createSession('https://r')).rejects.toThrow();
  });
});

describe('pollForFile', () => {
  it('polls past 204s and returns the file text once ready', async () => {
    const queue = [
      new Response(null, { status: 204 }),
      new Response('serendipity\tquokka', { status: 200 }),
    ];
    const fetchMock = vi.fn(async () => queue.shift()!);
    vi.stubGlobal('fetch', fetchMock);

    await expect(pollForFile('tok', { base: 'https://r', intervalMs: 1 })).resolves.toBe(
      'serendipity\tquokka',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when the session has expired', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('expired', { status: 410 })));
    await expect(pollForFile('tok', { base: 'https://r', intervalMs: 1 })).rejects.toThrow();
  });
});
