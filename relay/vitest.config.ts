import { defineConfig } from 'vitest/config';

// Tests cover the pure logic (session lifecycle, tokens, routing) in Node.
// Full workerd/miniflare integration runs via `wrangler dev` against a real
// runtime (needs a Cloudflare account).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
