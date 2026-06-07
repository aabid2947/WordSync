import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// See https://wxt.dev/api/config.html
// WXT has no official Preact module, so Preact is wired through its own Vite preset.
export default defineConfig({
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: {
    name: 'WordSync',
    description:
      'Local-first word suggestions for the web, synced with your Gboard dictionary.',
    // `offscreen` hosts the WebLLM engine (WebGPU is unavailable in the service worker).
    // `scripting` + `<all_urls>` content script power suggestions in any text field.
    permissions: ['storage', 'offscreen', 'scripting', 'activeTab'],
    // WebLLM downloads model weights/libs from these CDNs (data, not code — MV3 OK).
    // The relay host is reached via CORS from the onboarding page (no entry needed).
    host_permissions: [
      'https://huggingface.co/*',
      'https://*.huggingface.co/*',
      'https://raw.githubusercontent.com/*',
    ],
    // `'wasm-unsafe-eval'` is required by WebLLM's WASM runtime (CP9).
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    // The base wordlist is fetched at runtime by the content script (kept out of
    // the content bundle). Public English data — no privacy concern in exposing it.
    web_accessible_resources: [{ resources: ['words-en.txt'], matches: ['<all_urls>'] }],
  },
});
