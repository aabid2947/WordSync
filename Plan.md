# WordSync — Browser Extension

> Local-first word suggestion for the web, synced with your Gboard dictionary.

---

## What We're Building

A Chrome extension that watches what you type across any website and shows intelligent word suggestions — like Gboard, but for your desktop browser. Everything runs on your device. No account. No cloud. No data leaving the browser.

---

## Two Modes

### Mode A — Gboard Sync (optional)
Users with years of custom words in Gboard can import their dictionary via a **QR bridge**:

1. Export `dictionary.txt` from Gboard (`Settings > Dictionary > Personal Dictionary > ⋮ > Export`)
2. Extension shows a QR code → user scans it on their phone
3. Phone browser opens a simple upload page → user picks the file
4. Extension receives it instantly, parses it, loads all words
5. Relay server deletes the file the moment it's received

> The Gboard export tap is unavoidable — Android won't let any app read another app's private storage. The QR method eliminates every other step.

### Mode B — Zero Setup (opt-out)
Skip the Gboard sync entirely. The extension activates immediately after install with a base English model and learns from your typing over time. You can always import later from Settings.

---

## How Suggestions Work

| Layer | What it does |
|---|---|
| **WebLLM (local model)** | Runs a small language model in-browser via WebGPU. Predicts next words and completes partial words. Downloaded once, cached locally. |
| **Personal frequency table** | Stored in IndexedDB. Every word you type or accept is counted. Frequent words are ranked higher than model predictions. |
| **Gboard dictionary** | Pre-seeds the frequency table on import so the model is personalised from keystroke one. |

**Privacy:** All data lives in the browser. Nothing is synced, uploaded, or logged. Uninstalling deletes everything.

---

## Onboarding

Opens automatically on first install. One screen at a time — users never see the full complexity upfront.

| Step | Screen | User action |
|---|---|---|
| 1 | Export from Gboard | Follow the path on screen. One-tap copy of instructions. Skip available. |
| 2 | Scan QR to transfer | Scan with phone → pick `dictionary.txt` → done in two taps. |
| 3 | Import confirmed | See word count + preview. Extension activates immediately. |

Tapping **Skip** at any step bypasses the Gboard flow and lands on the active extension with zero config.

---

**QR Relay **
- `POST /create-session` → returns token + short-lived upload URL (expires in 10 min)
- Phone uploads file to URL with session token
- Extension polls `GET /session/:token` every 2s → downloads file → relay deletes it
- File never written to disk, never logged

**Local Storage**

| Store | Contents |
|---|---|
| `IndexedDB: words` | word, count, lastSeen, source (typed / gboard / accepted) |
| `IndexedDB: sessions` | sessionId, wordsTyped, wordsSuggested, wordsAccepted |
| `localStorage` | settings: model choice, strip position, suggestion count, sync flag |
| `Cache API` | WebLLM model weights (~200–400 MB, downloaded once) |

---

## Roadmap

| Version | Focus | Status |
|---|---|---|
| v0.1 | Content script, text field detection, n-gram suggestions, IndexedDB word store | **Now** |
| v0.2 | QR relay server, dictionary parser, onboarding stepper | **Now** |
| v0.3 | WebLLM integration, model + frequency blending, GPU → CPU fallback | Next |
| v0.4 | Polished suggestion strip, keyboard nav, per-site opt-out, dark mode | Next |
| v0.5 | Options page, word management, export, reset | Later |
| v1.0 | Chrome Web Store submission | Later |

---

## Open Questions

- Which model hits the best quality/size tradeoff? (Candidates: Phi-3.5-mini, Qwen2.5-0.5B, TinyLlama)
- Suggestion strip: float near cursor or anchor to viewport edge?
- How to handle sites that block content script injection?
- Self-host QR relay or use Cloudflare Workers free tier?
- Firefox port in v1?

---

## Out of Scope (v1)

- Cloud sync across devices
- iOS / Android app
- Multi-language support
- Any telemetry or server-side model improvement
- Google / Microsoft / Apple account integration