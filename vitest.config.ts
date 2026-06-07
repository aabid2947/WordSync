import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  // WxtVitest provides the `browser` mock (fakeBrowser), auto-imports, and resets
  // extension state between tests.
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**', '.wxt/**', '.output/**', 'relay/**'],
  },
});
