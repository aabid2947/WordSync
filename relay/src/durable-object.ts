import { DurableObject } from 'cloudflare:workers';
import { SessionState } from './session-state';

/**
 * One instance per session token. Holds the uploaded file ONLY in an instance
 * field (never `ctx.storage`, never KV — both persist to disk). When the DO is
 * evicted for being idle, the file vanishes with it; that's intended. No alarms,
 * no storage: expiry is enforced lazily on each request.
 */
export class Session extends DurableObject {
  private readonly session = new SessionState(Date.now());

  override async fetch(request: Request): Promise<Response> {
    const now = Date.now();
    if (this.session.isExpired(now)) return new Response('Session expired', { status: 410 });

    if (request.method === 'POST') {
      const bytes = new Uint8Array(await request.arrayBuffer());
      const contentType = request.headers.get('Content-Type') ?? 'text/plain';
      const result = this.session.put(bytes, contentType, now);
      if (!result.ok) return new Response(result.message, { status: result.status });
      return new Response('ok');
    }

    // GET = the extension polling. 204 until ready; then hand off exactly once.
    const taken = this.session.take(now);
    if (!taken) return new Response(null, { status: 204 });
    return new Response(taken.bytes, { headers: { 'Content-Type': taken.contentType } });
  }
}
