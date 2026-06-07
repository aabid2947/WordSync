// The privacy-critical core of the relay, kept free of any Cloudflare runtime
// imports so it can be unit-tested in plain Node. The Durable Object is a thin
// wrapper around this. Invariants: the file lives only in memory, is served at
// most once, and is unavailable past the TTL.

export type PutResult = { ok: true } | { ok: false; status: number; message: string };

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB — dictionaries are tiny

export interface Upload {
  bytes: Uint8Array;
  contentType: string;
}

export class SessionState {
  private upload: Upload | null = null;
  private consumed = false;

  constructor(
    private readonly createdAt: number,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly maxBytes: number = DEFAULT_MAX_BYTES,
  ) {}

  isExpired(now: number): boolean {
    return now - this.createdAt > this.ttlMs;
  }

  /** Store the uploaded file in memory. One upload per session. */
  put(bytes: Uint8Array, contentType: string, now: number): PutResult {
    if (this.isExpired(now)) return { ok: false, status: 410, message: 'Session expired' };
    if (this.consumed || this.upload) return { ok: false, status: 409, message: 'Already uploaded' };
    if (bytes.byteLength > this.maxBytes) return { ok: false, status: 413, message: 'File too large' };
    this.upload = { bytes, contentType };
    return { ok: true };
  }

  /** Ready to hand off: uploaded, not yet consumed, not expired. */
  isReady(now: number): boolean {
    return !this.consumed && this.upload !== null && !this.isExpired(now);
  }

  /** Take the file exactly once, then drop it from memory. */
  take(now: number): Upload | null {
    if (!this.isReady(now)) return null;
    const upload = this.upload;
    this.upload = null;
    this.consumed = true;
    return upload;
  }
}
