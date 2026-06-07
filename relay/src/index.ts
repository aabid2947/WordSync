import { corsHeaders, matchRoute } from './router';
import { generateToken } from './tokens';
import { UPLOAD_PAGE } from './upload-page';
import { Session } from './durable-object';

// Re-export the Durable Object class so the runtime can bind it.
export { Session };

export interface Env {
  SESSION: DurableObjectNamespace;
}

function json(data: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get('Origin'));

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const route = matchRoute(request.method, url.pathname);
    switch (route.name) {
      case 'create': {
        const token = generateToken();
        return json({ token, uploadUrl: `${url.origin}/u/${token}`, expiresInSeconds: 600 }, cors);
      }
      case 'uploadPage':
        return new Response(UPLOAD_PAGE, {
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors },
        });
      case 'upload':
      case 'poll': {
        const stub = env.SESSION.get(env.SESSION.idFromName(route.token));
        const res = await stub.fetch(request);
        const out = new Response(res.body, res);
        for (const [key, value] of Object.entries(cors)) out.headers.set(key, value);
        return out;
      }
      default:
        return new Response('Not found', { status: 404, headers: cors });
    }
  },
} satisfies ExportedHandler<Env>;
