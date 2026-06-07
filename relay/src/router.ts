import { isValidToken } from './tokens';

export type Route =
  | { name: 'create' }
  | { name: 'uploadPage'; token: string }
  | { name: 'upload'; token: string }
  | { name: 'poll'; token: string }
  | { name: 'notFound' };

/** Pure request routing — decoupled from the runtime so it can be tested directly. */
export function matchRoute(method: string, pathname: string): Route {
  if (method === 'POST' && pathname === '/create-session') return { name: 'create' };

  const upload = pathname.match(/^\/u\/([^/]+)$/);
  if (upload) {
    const token = upload[1]!;
    if (!isValidToken(token)) return { name: 'notFound' };
    if (method === 'GET') return { name: 'uploadPage', token };
    if (method === 'POST') return { name: 'upload', token };
  }

  const poll = pathname.match(/^\/session\/([^/]+)$/);
  if (poll && method === 'GET') {
    const token = poll[1]!;
    if (!isValidToken(token)) return { name: 'notFound' };
    return { name: 'poll', token };
  }

  return { name: 'notFound' };
}

/**
 * Permissive CORS: the random token is the capability, so we echo the caller's
 * origin (the extension's chrome-extension:// origin, or the phone's browser).
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
  };
}
