# ⚡ Claude Token Estimator

A chat interface that **counts tokens and estimates cost before every API call**. See exactly what you're about to spend, compare across models, then decide to send or cancel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/arielnishri-svg/token-estimator)

![Cost estimate panel](screenshot.png)
![Main interface](screenshot1.png)

---

## Use in any Claude chat (no API key needed)

Don't want to run the standalone app? You can drop the token estimator directly into any Claude chat as an artifact — no API key required since claude.ai handles auth.

**Option 1 — Download from the app**

Visit the live app and click the **snippet ↓** button in the top bar. It downloads a `claude-token-estimator-snippet.txt` file.

1. Open the file
2. Select all (`Cmd + A`)
3. Copy (`Cmd + C`)
4. Go to [claude.ai](https://claude.ai) and start a **new empty chat** — this is important, it will not render in a long existing conversation
5. Paste and hit send

Claude renders the tool as an interactive artifact on the right side of the screen. No API key needed.

**Option 2 — Download from GitHub**

Download [`public/snippet.txt`](https://github.com/arielnishri-svg/token-estimator/blob/main/public/snippet.txt) directly from this repo, copy the contents, and paste into any Claude chat.

**Option 3 — Text expander**

Save the snippet to [Raycast](https://raycast.com), Espanso, or Alfred. Set a keyword like `;;estimator` and it pastes the full prompt anywhere — no opening files needed.

> Note: The in-chat version does not support file attachments. All other features (token counting, cost estimation, model switching, thinking modes) work the same.

---

## Why this exists

claude.ai hides token counts and costs from you. This tool exposes everything: exact input tokens, estimated output cost, and a side-by-side model comparison — all before you commit to a single API call.

---

## Features

- **Exact token count** before sending via Anthropic's `/v1/messages/count_tokens` (free call)
- **Cross-model cost comparison** at estimate time — switch models before committing
- **Thinking mode controls** — off / extended / adaptive with effort levels (low → max)
- **Thinking budget slider** for extended mode (1,024–32,000 tokens)
- **Max output slider** — cap the maximum tokens Claude can output (controls worst-case cost)
- **File attachments** — attach PDF, Word (docx), plain text, and images (png, jpg, webp, gif)
- **Drag & drop** — drop files anywhere on the app
- **Session cost tracker** — running total tokens and spend in the top bar
- **Estimate accuracy feedback** — see actual vs estimated tokens after each response
- **System prompt** — persistent instructions prepended to every message in the session
- **Show thinking toggle** — reveal or hide Claude's internal reasoning chain
- **Multi-turn conversations** — full history maintained across messages
- **Clear button** — reset the session without reloading the page
- **API key stored locally** in your browser's localStorage, never sent anywhere except `api.anthropic.com`

---

## How it works

```
Configure settings → Type message → Attach files (optional) → Press Enter → Review cost estimate → Send or cancel
```

1. **Configure** — pick model, thinking mode, effort, max output tokens
2. **Attach files** — click the 📎 paperclip or drag and drop onto the app
3. **Type** your message and press Enter (or click Estimate)
4. **Review** — exact input token count (including file contents), estimated output cost, all models compared side by side
5. **Switch models** in the estimate panel if needed — click any card to switch before sending
6. **Send** — see actual vs estimated token count after the response

> Estimating is free. Anthropic does not charge for `/v1/messages/count_tokens` calls.

---

## File attachments

| File type | How it's handled |
|-----------|-----------------|
| PDF (`.pdf`) | Sent as base64 directly to the API — natively supported |
| Word (`.docx`, `.doc`) | Text extracted in the browser via mammoth.js, then sent as a text document |
| Plain text (`.txt`) | Read as text and sent inline |
| Images (`.png`, `.jpg`, `.webp`, `.gif`) | Sent as base64 — natively supported |

- Attach multiple files at once
- Each attachment shows as a chip with filename, size, and an × to remove it
- Attachments are included in the token count estimate before you send
- After sending, attachment names appear as pills in the message history
- You can attach a file without writing any message text

---

## Controls reference

| Control | What it does |
|---------|-------------|
| **Model** | Select which Claude model to use. Loads live from the API on startup with pricing shown inline. |
| **Think** | Set thinking mode: `off` (no thinking), `extended` (you set exact token budget), `adaptive` (Claude decides based on effort level). |
| **Effort** | Only visible in `adaptive` or `off` mode. Controls how hard Claude works: low → medium → high → max. |
| **Think budget** | Only visible in `extended` mode. Slider sets the maximum thinking tokens (1,024–32,000). |
| **Max out** | Hard cap on total output tokens. Controls the worst-case cost ceiling. Default: 16,000. |
| **Show thinking** | Toggle visibility of Claude's reasoning chain. When enabled, a collapsible Thinking section appears above each response. |
| **Sys prompt** | Click to open a text area. Whatever you write is prepended to every message as a system-level instruction — invisible to Claude as a user message but shapes every response. Resets on page reload. |
| **Clear** | Resets the full session: message history, token totals, cost counter. Appears after the first message. |
| **📎 Paperclip** | Opens a file picker. Accepts pdf, docx, doc, txt, png, jpg, webp, gif. Multiple files supported. |
| **API key** | View or forget your stored key. Click in the top-right config bar. |

---

## System prompt examples

```
You are a concise assistant. Never use bullet points.
```
```
Always respond in French.
```
```
You are a senior Python engineer. Keep answers technical and skip explanations.
```

---

## Model & mode guide

| Model | Price | Best for |
|-------|-------|----------|
| Haiku 4.5 | $1/$5 per MTok | Short rewrites, classification, simple Q&A, high-volume tasks |
| Sonnet 4 | $3/$15 per MTok | Coding, writing, analysis |
| Sonnet 4.5 | $3/$15 per MTok | Coding, writing, analysis |
| Sonnet 4.6 | $3/$15 per MTok | Coding, writing, analysis — start here for most tasks |
| Opus 4 | $5/$25 per MTok | Complex reasoning, hard debugging |
| Opus 4.1 | $5/$25 per MTok | Complex reasoning, hard debugging |
| Opus 4.5 | $5/$25 per MTok | Complex reasoning, hard debugging |
| Opus 4.6 | $5/$25 per MTok | Complex reasoning, hard debugging |
| Opus 4.7 | $5/$25 per MTok | Hardest tasks — maximum capability, quality > cost |

| Thinking mode | When to use |
|---------------|-------------|
| off | Simple tasks, rewrites, short answers |
| adaptive · low | Light analysis, drafting |
| adaptive · medium | Default for most tasks |
| adaptive · high | Code review, strategy, careful reasoning |
| adaptive · max | Hardest problems — Claude thinks as much as it wants |
| extended | Set an exact thinking token budget manually |

---

## Quick start

```bash
git clone https://github.com/arielnishri-svg/token-estimator
cd token-estimator
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), paste your Anthropic API key, and go.

Get a key at [console.anthropic.com](https://console.anthropic.com).

---

## Deploy to Vercel (free)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import your GitHub repo — no environment variables needed
4. Deploy

Or use the **Deploy with Vercel** button at the top of this README.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `effort: Extra inputs are not permitted` | Switch thinking mode — effort is only valid in `off` mode |
| Models show "loading…" | API call failed; falls back to Haiku / Sonnet / Opus automatically |
| Estimate resets after typing | By design — editing message, settings, or attachments requires a fresh estimate |
| Think budget slider missing | Only visible in `extended` mode |
| Effort pills missing | Only visible in `adaptive` or `off` mode on capable models (not Haiku) |
| Clear button missing | Appears only after at least one message has been sent |
| docx not parsing | Browser must support ArrayBuffer (all modern browsers do) — try refreshing |
| File too large | PDFs and images over ~5MB may hit API limits — split or compress before attaching |

---

## Notes

- Thinking/effort features require Sonnet or Opus — Haiku does not support them
- Output cost estimates are approximate; actual output length varies
- Thinking tokens bill at the same rate as output tokens
- The system prompt resets on page reload — it is not persisted to localStorage
- mammoth.js (for docx parsing) is loaded on demand from a CDN the first time you attach a Word file
