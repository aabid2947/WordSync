// Relay base URL. Set WXT_RELAY_URL in a .env file before building once the
// Cloudflare Worker is deployed (CP6 / deployment). The placeholder lets the
// extension build; the Gboard QR flow only works against a real relay, but the
// Skip / zero-setup path works regardless.
export const RELAY_URL: string =
  (import.meta.env.WXT_RELAY_URL as string | undefined) ??
  'https://wordsync-relay.example.workers.dev';
