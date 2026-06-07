import { describe, expect, it } from 'vitest';
import { SessionState } from '../src/session-state';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('SessionState', () => {
  it('accepts an upload and serves it exactly once', () => {
    const s = new SessionState(0);
    expect(s.isReady(0)).toBe(false);
    expect(s.put(bytes('hi'), 'text/plain', 0)).toEqual({ ok: true });
    expect(s.isReady(0)).toBe(true);

    const taken = s.take(0);
    expect(taken).not.toBeNull();
    expect(new TextDecoder().decode(taken!.bytes)).toBe('hi');

    expect(s.take(0)).toBeNull(); // consume-once
    expect(s.isReady(0)).toBe(false);
  });

  it('expires after the TTL', () => {
    const ttl = 1000;
    const s = new SessionState(0, ttl);
    expect(s.put(bytes('x'), 'text/plain', 0)).toEqual({ ok: true });
    expect(s.isExpired(ttl + 1)).toBe(true);
    expect(s.isReady(ttl + 1)).toBe(false);
    expect(s.take(ttl + 1)).toBeNull();
  });

  it('rejects an upload past the TTL', () => {
    const s = new SessionState(0, 1000);
    expect(s.put(bytes('x'), 'text/plain', 2000)).toMatchObject({ ok: false, status: 410 });
  });

  it('rejects oversize uploads', () => {
    const s = new SessionState(0, 10_000, 4);
    expect(s.put(bytes('toolong'), 'text/plain', 0)).toMatchObject({ ok: false, status: 413 });
  });

  it('rejects a second upload', () => {
    const s = new SessionState(0);
    expect(s.put(bytes('a'), 'text/plain', 0).ok).toBe(true);
    expect(s.put(bytes('b'), 'text/plain', 0)).toMatchObject({ ok: false, status: 409 });
  });
});
