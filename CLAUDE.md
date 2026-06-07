# WordSync — Technical Implementation Guide

> Local-first word suggestion for the web, synced with your Gboard dictionary.
> This file is the source of truth for *how* WordSync is built. The product spec lives in [Plan.md](Plan.md).

---

## 0. Non-negotiable invariants

These override convenience. If a task would violate one, stop and flag it.

1. **Privacy.** The only network traffic allowed is (a) downloading model weights from a CDN, and (b) the QR relay *during an active import*. No telemetry, no analytics SDK, no error reporting to a server, no logging of user text anywhere. Uninstall must leave nothing behind. If you add a `fetch`/`connect-src`, justify it against this rule in the PR.
2. **Never block typing.** The fast path (frequency + n-gram) must return suggestions synchronously in **< 16 ms** on the content-script side. The LLM is always async, debounced, cancellable, and merged in *after* the fast path — it may never gate a keystroke or the host page's own input handling.
3. **Never break the host page.** The content script runs on `<all_urls>`. Wrap everything in try/catch, fail silent, isolate all UI in a Shadow DOM, and never throw into the page's event loop. A bug must degrade to "no suggestions," never to "the site is broken."
4. **MV3 compliance.** No remote code execution. WASM is bundled, not fetched. Model *weights* are data (allowed). State that must survive the service worker lives in `chrome.storage` / IndexedDB, never in service-worker module globals.

---

## 1. Stack

| Concern | Choice | Notes |
|---|---|---|
| Extension framework | **WXT** (Vite-based, MV3-first) | Auto-manifest, HMR, `-b firefox` target for the v1 port. |
| Language | **TypeScript**, strict | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` on. |
| UI (popup / options / onboarding) | **Preact** + signals | Tiny runtime. JSX via `preact`. |
| Suggestion strip (content script) | **Vanilla DOM in Shadow DOM** | No framework in the hot path — zero per-keystroke overhead, no injection-surface from a framework runtime. |
| Local model | **WebLLM** (`@mlc-ai/web-llm`) via WebGPU | Runs in an **offscreen document**. See §6. |
| Storage | **IndexedDB** (via `idb`) + `chrome.storage.local` + WebLLM's own weight cache | See §5. |
| QR relay | **Cloudflare Workers + Durable Objects** | In-memory file handoff, never persisted. See §7. |
| QR / parsing libs | `qrcode` (render), tolerant hand-rolled dict parser | See §8. |
| Tests | **Vitest** (+ `fake-indexeddb`), **Playwright** (E2E w/ unpacked ext), `@cloudflare/vitest-pool-workers` (relay) | See §10. |

> **Decisions baked in for the Plan's open questions:** default model = **Qwen2.5-0.5B-Instruct (`q4f16_1`)** (smallest coherent prebuilt; swappable in settings — Phi-3.5-mini is ~2 GB, too big for a default). Strip position = **float near caret** (mirror-div technique) with anchored-bar fallback. Relay = **Cloudflare Workers**. Firefox = **v1+, n-gram only** (WebGPU/WebLLM support there is immature; the n-gram engine is cross-browser).

---

## 2. Architecture

Five runtime contexts. Keep responsibilities where they are — this split is what keeps the hot path fast and MV3-legal.

```
┌─ Content script (per frame, isolated world) ──────────────┐
│  • text-field detection, caret tracking                   │
│  • in-memory suggestion index (hydrated top-N)            │
│  • FAST PATH lookup (freq + n-gram)  ← <16ms, synchronous  │
│  • Shadow-DOM suggestion strip + keyboard nav             │
│  • emits learn-events, requests LLM completions           │
└───────────────┬───────────────────────────────────────────┘
                │ chrome.runtime messaging (WXT messaging)
┌───────────────▼─── Background service worker (ephemeral) ──┐
│  • SOLE writer to IndexedDB (batched)                      │
│  • hydrates content scripts with the top-N snapshot        │
│  • owns settings, install/onboarding lifecycle            │
│  • orchestrates the offscreen LLM + relay polling          │
└──────┬──────────────────────────────┬─────────────────────┘
       │ chrome.offscreen             │ chrome.runtime
┌──────▼─── Offscreen document ──┐  ┌─▼── Popup / Options / Onboarding ─┐
│  • WebLLM engine (WebGPU)      │  │  • Preact UIs                     │
│  • next-word / completion gen  │  │  • read/write settings + words    │
│  • CPU fallback                │  └───────────────────────────────────┘
└────────────────────────────────┘
```

**Why this split (do not "simplify" it away):**
- The fast path lives **in the content script**, not the service worker. The SW can be evicted mid-typing; reviving it costs 50–100 ms+, which would blow the latency budget. So each content script holds its own in-memory snapshot and answers locally. Writes are fire-and-forget to the SW.
- The SW is the **single writer** to IndexedDB so counts don't race across tabs/frames. It batches writes and broadcasts incremental snapshot deltas.
- WebGPU is **not available in a service worker**. WebLLM must run in a document context → the **offscreen document** is the MV3-correct home. (⚠️ Verify WebGPU is exposed in the offscreen document on the target Chrome version during v0.3 spike; if not, fall back to a hidden extension page/tab as the engine host.)

### Messaging contract
Define one typed message union in `utils/messages.ts`; route through WXT's `defineExtensionMessaging`. Core messages:

| Message | From → To | Payload | Reply |
|---|---|---|---|
| `hydrate` | content → SW | `{ frameKind }` | top-N snapshot `{ unigrams, ngrams, version }` |
| `learn` | content → SW | `{ events: LearnEvent[] }` (batched/debounced) | ack |
| `snapshot-delta` | SW → content (broadcast) | incremental updates | — |
| `llm:complete` | content → SW → offscreen | `{ context, prefix, reqId }` | streamed/!final `{ reqId, suggestions }` |
| `llm:cancel` | content → SW → offscreen | `{ reqId }` | — |
| `relay:*` | onboarding/SW | session lifecycle (§7) | — |

`reqId` is monotonic per content script; the strip ignores any LLM reply whose `reqId` is stale (input moved on).

---

## 3. Directory layout (WXT)

```
wordsync/
  wxt.config.ts              # manifest, permissions, CSP, env
  package.json
  entrypoints/
    background.ts            # service worker: DB writer, orchestration
    content.ts               # content script (all_frames, all_urls)
    offscreen/               # WebLLM host (HTML + ts)
      index.html
      main.ts
    popup/                   # Preact: status, quick toggles
    options/                 # Preact: word mgmt, export, reset, settings
    onboarding/              # Preact: 3-step stepper
  components/                # shared Preact components
  lib/
    engine/
      fastpath.ts            # freq + n-gram blend (the hot path)
      blend.ts               # merge fast-path + LLM, rank
      ngram.ts               # context model
    storage/
      db.ts                  # idb schema + migrations
      words.ts               # word/ngram repo (SW-side writer)
      settings.ts            # chrome.storage wrapper + defaults
      snapshot.ts            # build/diff top-N snapshots
    dom/
      detect.ts              # editable-field detection
      caret.ts               # caret rect (mirror-div + Range)
      insert.ts              # framework-safe text insertion
      strip.ts               # Shadow-DOM suggestion UI + keynav
    gboard/
      parse.ts               # dictionary.txt parser
    relay/
      client.ts              # create-session, poll, fetch file
  utils/
    messages.ts              # typed messaging contract
    env.ts                   # RELAY_URL, MODEL_CDN, defaults
  assets/                    # icons, store screenshots
  tests/                     # vitest + playwright
relay/                       # Cloudflare Worker (separate deploy)
  wrangler.toml
  src/
    index.ts                 # routes
    session.ts               # Durable Object (in-memory file)
    upload-page.html         # phone upload UI
```

---

## 4. Commands

```bash
# Extension (run from repo root)
npm run dev            # wxt dev — loads unpacked Chrome w/ HMR
npm run dev:firefox    # wxt dev -b firefox
npm run build          # wxt build (chrome)
npm run build:firefox  # wxt build -b firefox
npm run zip            # wxt zip — store-ready package(s)
npm run compile        # tsc --noEmit (typecheck)
npm run lint           # eslint
npm test               # vitest
npm run test:e2e       # playwright

# Relay (run from ./relay)
npm run dev            # wrangler dev
npm run deploy         # wrangler deploy
npm test               # vitest (workers pool / miniflare)
```

`wxt.config.ts` defines: `permissions: ['storage', 'offscreen', 'scripting']`, host permissions for `RELAY_URL` + model CDN, content script `matches: ['<all_urls>']`, `all_frames: true`, `run_at: 'document_idle'`, and:
```
content_security_policy.extension_pages =
  "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' https://<model-cdn> https://<relay-host>;"
```
(`'wasm-unsafe-eval'` is required by WebLLM's WASM.)

---

## 5. Storage

### IndexedDB (`lib/storage/db.ts`, via `idb`)
| Store | keyPath | Indexes | Fields |
|---|---|---|---|
| `words` | `word` | `count`, `lastSeen`, `source` | `word, count, lastSeen, source('typed'|'gboard'|'accepted')` |
| `ngrams` | `[context, next]` | `context` | `context, next, count` — `context` = previous 1–2 tokens (space-joined, lowercased) |
| `sessions` | `sessionId` | `startedAt` | `sessionId, startedAt, wordsTyped, wordsSuggested, wordsAccepted` |

The `ngrams` store powers next-word prediction; `words` powers prefix completion + unigram priors. Only the **background SW** writes; it batches `learn` events (debounce ~500 ms or N events) and bumps counts in a single transaction.

### Settings — `chrome.storage.local` (NOT `localStorage`)
> **Deviation from Plan.md (intentional):** the Plan lists `localStorage` for settings. In MV3 the service worker has no `localStorage`, and settings must be read/written from the SW, popup, options, *and* content scripts with change events. `chrome.storage.local` is the only API available in all those contexts. Use it.

Schema (with defaults in `settings.ts`):
```ts
{
  model: 'Qwen2.5-0.5B-Instruct-q4f16_1',
  useLLM: true,            // false until weights are cached / on unsupported HW
  stripPosition: 'caret',  // 'caret' | 'anchored'
  suggestionCount: 3,
  gboardSynced: false,
  siteDenylist: [],        // per-site opt-out (v0.4)
  onboarded: false,
}
```

### Model weights — Cache API
WebLLM manages its own weight cache (Cache API / IndexedDB). We only pick the cache mode and surface download progress. ~400–600 MB for the default model, downloaded once. Never bundle weights in the extension package (store size limits + update churn).

---

## 6. Suggestion engine

### Fast path — `lib/engine/fastpath.ts` (content-script, synchronous, <16 ms)
On each relevant keystroke, from the in-memory snapshot:
1. Determine `prefix` (current partial word) and `context` (previous 1–2 tokens) via caret + Selection.
2. **Prefix completion:** unigrams starting with `prefix`, ranked by `count` (recency-weighted).
3. **Next-word (empty prefix):** `ngrams` for `context`, ranked by `count`; back off bigram → unigram.
4. Return top `suggestionCount`. This is what the strip renders *immediately*.

The snapshot is a top-N slice (e.g. ≤10k unigrams + top n-grams, a few hundred KB) hydrated on first focus of an editable field in the frame (lazy — don't hydrate every idle iframe). Personal frequency outranks generic model priors by design (Plan §"How Suggestions Work").

### LLM path — `lib/engine/blend.ts` + offscreen (async, debounced, cancellable)
- Debounce ~150–250 ms of idle typing, then send `llm:complete { context, prefix, reqId }`.
- Offscreen runs WebLLM with a **capped output** (we need 1–3 words, not sentences): small `max_tokens`, stop on whitespace/punctuation.
- **Cancel aggressively:** on any new keystroke, send `llm:cancel` and interrupt generation; drop stale `reqId` replies.
- Merge: when a valid LLM reply arrives, re-rank and *upgrade* the strip in place (don't fl:icker — diff the list). Frequency hits still win ties.
- **Fallback ladder:** WebGPU available → GPU. No WebGPU / load failure → attempt WASM/CPU (slow; consider auto-setting `useLLM=false` and showing fast-path-only). Weights not yet cached → fast-path only + a "download model" affordance in popup. Always functional without the LLM.

### Memory/latency budget
GPU model resident ~ model size; only load once, in the single offscreen doc (never per-tab). If memory pressure or repeated load failures, disable LLM and persist `useLLM=false`.

---

## 7. QR relay (Cloudflare Workers + Durable Object)

Goal: hand a `dictionary.txt` from the phone to the extension **without ever writing it to disk or logging it**.

**Durable Object `Session`** (keyed by token) holds the file bytes in an **instance variable** (in-memory) — *not* `state.storage` (which persists) and *not* KV (also persists). An `alarm()` evicts after the TTL.

Endpoints (`relay/src/index.ts`):
| Route | Caller | Behavior |
|---|---|---|
| `POST /create-session` | extension | crypto-random token → `{ token, uploadUrl, expiresAt }` (TTL 10 min). Rate-limited. |
| `GET /u/:token` | phone browser | serves `upload-page.html` (file picker). |
| `POST /u/:token` | phone | stores bytes in the DO instance var; size-capped; marks ready. |
| `GET /session/:token` | extension (poll 2 s) | `204` until ready; then returns bytes **once**, then DO self-destructs. |

Rules: CORS limited to the extension origin (`chrome-extension://<id>`) + the phone page; never `console.log` the body; no analytics; reject oversized uploads; constant-time-ish token compare. The Worker is the only server component in the whole product — keep it that way.

Client (`lib/relay/client.ts`): create session → render `uploadUrl` as QR (onboarding) → poll `GET /session/:token` every 2 s → on bytes, parse (§8), seed DB, stop polling.

---

## 8. Gboard dictionary parser — `lib/gboard/parse.ts`

⚠️ **Verify the real export format against an actual Gboard `dictionary.txt` before trusting any assumption.** Android personal-dictionary exports have varied (tab-separated `word\tshortcut\tlocale\tfrequency`, sometimes a header line). Write a **tolerant** parser:
- Split on newlines; skip blank lines and obvious headers/comments.
- Split each line on tab; heuristically pick the word column (the alphabetic token); ignore shortcut/locale/frequency columns if present.
- Normalize (trim, drop control chars), dedupe case-insensitively, keep original case for display.
- Seed into `words` with `source:'gboard'` and a base `count` (so they rank from keystroke one per Plan §"How Suggestions Work").
- Be defensive: never throw on a malformed line — collect a parse summary `{ imported, skipped }` to show in onboarding step 3.

---

## 9. Content-script subsystems (the hard parts)

### Field detection — `lib/dom/detect.ts`
- `focusin` on `document`; recognize `<input>` (text-like `type`s), `<textarea>`, `[contenteditable=""|"true"]`.
- **iframes:** `all_frames:true` runs the script per frame; cross-origin frames get isolated instances — fine. Activate lazily per frame on first editable focus.
- **Shadow DOM:** open roots — traverse and attach; **closed roots are inaccessible** (document as a known limitation).
- Respect `siteDenylist` and skip non-injectable pages (`chrome://`, Web Store, `view-source:`, PDF viewer) — fail silent.

### Caret position — `lib/dom/caret.ts`
- `contenteditable`: `Range.getBoundingClientRect()`.
- `<input>`/`<textarea>`: no native caret rect → **mirror-div technique** (clone styles into an off-screen div, measure the caret offset). Document it; it's fiddly with scroll/padding.
- If coords unavailable → `stripPosition` falls back to `'anchored'` (viewport-edge bar).

### Safe insertion — `lib/dom/insert.ts`
Accepting a suggestion must work with **React/Vue/controlled inputs**:
- `<input>`/`<textarea>`: use the native value setter + dispatch a proper `InputEvent('input', {bubbles})` so frameworks see the change (setting `.value` directly is swallowed by React). `document.execCommand('insertText')` is an acceptable fallback.
- `contenteditable`: Selection/Range insertion + `input` event.
Test against a React fixture in E2E — this is the classic breakage point.

### Suggestion strip — `lib/dom/strip.ts`
- Attach a host element to `document.body`; render the UI inside a **Shadow DOM** with all styles scoped inside (no leakage either direction). High `z-index`, `pointer-events` only on the strip.
- **Keyboard nav (v0.4):** Tab/↑/↓ cycle, Enter/Tab accept, Esc dismiss — only capture keys while the strip is visible *and* a suggestion is highlighted, so host shortcuts keep working. Dark mode via `prefers-color-scheme`.

---

## 10. Testing

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest (+ `fake-indexeddb`) | parser, fastpath ranking, blend/dedup, ngram backoff, storage repo, snapshot diff |
| Component | Vitest + `@testing-library/preact` | popup, options, onboarding steps |
| E2E | Playwright (persistent context, `--load-extension`) | field detection, strip render/position, **accept into a React fixture**, skip-onboarding flow |
| Relay | Vitest + `@cloudflare/vitest-pool-workers` | full session lifecycle, TTL eviction, oversize/abuse rejection, no-persistence assertion |

CI must run `compile` + `lint` + unit + relay tests on every PR; E2E on PRs touching `lib/dom/**` or `content.ts`.

---

## 11. Roadmap → concrete work

| Ver | Deliverable | Key files |
|---|---|---|
| **v0.1** | Field detection, caret, fast-path n-gram engine, IndexedDB store, basic strip | `detect.ts`, `caret.ts`, `fastpath.ts`, `ngram.ts`, `db.ts`, `words.ts`, `strip.ts`, `background.ts` |
| **v0.2** | Relay (Worker+DO), dict parser, Preact onboarding stepper, install→onboarding | `relay/**`, `gboard/parse.ts`, `relay/client.ts`, `entrypoints/onboarding/**` |
| **v0.3** | Offscreen WebLLM, GPU→CPU fallback, model+freq blend, download/progress UX | `entrypoints/offscreen/**`, `blend.ts`, messaging `llm:*` |
| **v0.4** | Polished strip, keyboard nav, per-site opt-out, dark mode | `strip.ts`, `settings.ts`, popup |
| **v0.5** | Options page: word mgmt, export, reset | `entrypoints/options/**`, `snapshot.ts` |
| **v1.0** | Chrome Web Store submission (§12) | `assets/**`, CI, store listing |

---

## 12. Deployment to production

### Extension → Chrome Web Store
1. **Build & package:** `npm run build && npm run zip` → store-ready zip. Bump version in `package.json`/manifest (semver; CWS requires increasing version).
2. **Developer account:** Chrome Web Store dev account (one-time $5).
3. **Listing assets** (in `assets/`): 128px icon, ≥1 screenshot (1280×800 or 640×400), short + detailed description, category = Productivity.
4. **Privacy & permissions disclosures (must match our invariants):**
   - **Single purpose:** "Inline word suggestions for text fields, computed locally."
   - **Permission justifications:** `<all_urls>`/host = "suggestions must work in any text field on any site"; `offscreen` = "run the local model off the service worker"; `storage` = "local dictionary + settings"; relay host = "one-time, in-memory dictionary import."
   - **Data usage:** declare **no data collected / no data sold** — and keep it true (no telemetry).
5. **Submit:** manual upload, or automate via `wxt submit` (wraps `publish-browser-extension`) with store credentials in CI secrets. Expect review latency (hours–days); broad host permissions may draw extra scrutiny — the single-purpose + no-data story is the defense.

### Relay → Cloudflare
- `cd relay && npm run deploy` (`wrangler deploy`). Bind the Durable Object in `wrangler.toml`. Use a stable custom domain.
- Set the deployed relay URL as the build-time `RELAY_URL` (`utils/env.ts`) consumed by the extension before packaging. Staging vs prod via wrangler environments.

### CI (GitHub Actions)
- **PR:** `compile` → `lint` → unit + relay tests → `build` (+ conditional E2E).
- **Tag `v*`:** build + zip both browsers → `wxt submit` (Chrome; Firefox AMO later) and `wrangler deploy` the relay. Store/Cloudflare creds in repo secrets. Never commit secrets or the relay URL of a private env.

### Firefox (v1+)
WXT builds it (`-b firefox`) and the n-gram engine is cross-browser. Gate the WebLLM features behind capability detection — ship Firefox as **fast-path only** until its WebGPU/WebLLM support is solid.

---

## 13. Conventions

- TS strict; no `any` in `lib/**` without a comment justifying it.
- All cross-context calls go through the typed `utils/messages.ts` contract — no raw `chrome.runtime.sendMessage` string literals.
- Content-script code is defensive by default: optional chaining on DOM, try/catch at every entry point, never assume an API exists (feature-detect `navigator.gpu`, `chrome.offscreen`, Shadow DOM).
- Keep the hot path allocation-light: reuse buffers/arrays in `fastpath.ts`, no per-keystroke promises where a sync lookup works.
- When you touch anything network-facing, re-read §0.1 and confirm the traffic is one of the two allowed kinds.
