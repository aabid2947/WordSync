// Session tokens. 18 random bytes = 144 bits of entropy, hex-encoded. The token
// is the only capability — knowing it is what authorizes upload/download — so it
// must be unguessable and validated before being used as a Durable Object name.

export function generateToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function isValidToken(token: string): boolean {
  return /^[0-9a-f]{32,72}$/.test(token);
}
