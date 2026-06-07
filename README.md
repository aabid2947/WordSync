# WordSync

> Local-first word suggestion for the web, synced with your Gboard dictionary.

A Chrome extension that watches what you type across any website and shows intelligent word
suggestions — like Gboard, but for your desktop browser. **Everything runs on your device.
No account. No cloud. No data leaving the browser.**

---

## Features

- **Inline suggestions anywhere** — works in any text field, textarea, or rich editor on any site.
- **Two ways to start:**
  - **Gboard Sync** *(optional)* — import years of custom words from your phone via a one-time QR bridge.
  - **Zero Setup** — install and go; a base English model learns from your typing over time.
- **Local intelligence** — a personal frequency table (IndexedDB) plus an optional in-browser
  language model (WebLLM / WebGPU) blend to rank suggestions.
- **Private by design** — no telemetry, no analytics, no server-side model. Uninstalling deletes everything.

## How it works

| Layer | Role |
|---|---|
| Personal frequency + n-gram table | Fast path. Every word you type or accept is counted and ranked locally. |
| WebLLM (local model) | Optional. Runs a small model in-browser via WebGPU for smarter completions. |
| Gboard dictionary | Optional import that pre-seeds your table so it's personal from keystroke one. |

The only network traffic the extension ever makes is (1) a one-time model-weights download and
(2) the QR relay *during an active import* — nothing else leaves your browser.

## Tech stack

- **Extension:** [WXT](https://wxt.dev) (Manifest V3) · TypeScript · Preact
- **Local model:** [WebLLM](https://github.com/mlc-ai/web-llm) (WebGPU)
- **Storage:** IndexedDB · `chrome.storage` · Cache API
- **QR relay:** Cloudflare Workers + Durable Objects (in-memory, never persisted)

## Development

```bash
npm install
npm run dev          # load unpacked in Chrome with HMR
npm run build        # production build
npm run zip          # store-ready package
npm test             # unit tests

# QR relay (separate deploy target)
cd relay && npm run dev
```

## Project docs

- [Plan.md](Plan.md) — product spec and roadmap
- [CLAUDE.md](CLAUDE.md) — technical implementation guide (architecture, subsystems, deployment)

## Status

Early development. See the roadmap in [Plan.md](Plan.md) — currently building v0.1 (field detection,
n-gram engine, local word store) and v0.2 (QR relay, dictionary import, onboarding).

## Privacy

WordSync collects nothing and sends nothing to any server about your typing. All learning happens
locally. See the privacy notes in [CLAUDE.md](CLAUDE.md#0-non-negotiable-invariants).
