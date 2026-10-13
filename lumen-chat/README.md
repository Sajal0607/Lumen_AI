# Lumen Chat

A polished, ChatGPT-style chat website powered by Anthropic's Claude. The frontend is plain HTML, Tailwind CSS and vanilla JavaScript modules; the backend is Node.js + Express using the official `@anthropic-ai/sdk`. Claude responses stream to the browser token by token, and conversations are saved in the browser's `localStorage`.

## Features

- Sidebar of saved conversations (grouped by date) with new chat, select, inline rename and delete (with confirmation)
- Collapsible sidebar on desktop, off-canvas drawer on mobile
- Welcome screen with suggested prompts
- Auto-growing composer: **Enter** sends, **Shift+Enter** adds a newline, **Esc** stops generation
- Streaming responses with a stop button and a typing indicator
- Safe Markdown rendering (lists, links, tables, syntax-highlighted code) sanitized with DOMPurify; raw HTML is shown as text
- Copy buttons for whole responses and individual code blocks; regenerate/retry for the latest response
- Clear error states (missing key, rate limits, upstream errors, network failures)
- Light/dark theme, accessible labels, visible focus rings, keyboard shortcuts (`Ctrl/⌘ + Shift + O` for a new chat)

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML, vanilla JS (ES modules), Tailwind CSS 3 + `@tailwindcss/typography`, marked, highlight.js, DOMPurify |
| Build | Vite (dev server + bundler), PostCSS, Autoprefixer |
| Backend | Node.js ≥ 20, Express 5, `@anthropic-ai/sdk` |
| Tests | Node's built-in test runner (`node --test`) |
| Hosting (optional) | Netlify: static `dist/` + a Netlify Function at `/api/chat` |

## Prerequisites

- Node.js 20 or newer and npm
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com/))

## Installation

```bash
npm install
cp .env.example .env
# then edit .env and set ANTHROPIC_API_KEY
```

### Environment variables (server-side only)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | — | Your Anthropic API key. Read only by the server. |
| `ANTHROPIC_MODEL` | no | `claude-opus-5-5` | Claude model ID to use. |
| `ANTHROPIC_MAX_TOKENS` | no | `32000` | Maximum output tokens per response. |
| `ANTHROPIC_EFFORT` | no | model default | `low`, `medium`, `high`, `xhigh` or `max`. Leave unset for models that don't support effort. |
| `PORT` | no | `3001` | Port for the Express server. |

The API key is never sent to the browser. Vite is configured with `envPrefix: 'LUMEN_PUBLIC_'`, so no `ANTHROPIC_*` (or `VITE_*`) variable can be bundled into frontend code. `.env` is git-ignored.

## Development

```bash
npm run dev
```

This runs two processes:

- **Express API** on `http://localhost:3001` (restarts on changes in `server/`)
- **Vite dev server** on `http://localhost:5173` with hot reload; requests to `/api/*` are proxied to Express

Open http://localhost:5173.

## Production

```bash
npm run build   # Vite + Tailwind -> dist/
npm start       # Express serves dist/ and /api on PORT (default 3001)
```

Open http://localhost:3001. Put the app behind HTTPS (e.g. a reverse proxy) in real deployments; disable response buffering for `/api/chat` so streaming works (the server already sends `X-Accel-Buffering: no` for nginx).

### Deploying to Netlify

`netlify.toml` builds the frontend into `dist/` and deploys `netlify/functions/chat.mjs` at `/api/chat`. That function reuses the exact validation and streaming code in `server/lib/`. On Netlify, AI Gateway supplies Anthropic credentials automatically; you can instead set your own `ANTHROPIC_API_KEY` in the site's environment variables. `netlify dev` runs the same setup locally.

## Tests

```bash
npm test
```

Covers request validation, error mapping (no secrets in client errors), the Express streaming route (with a fake Claude stream, so no API key or network is needed), and the conversation utilities (title generation, regeneration, API payload building, stored-state repair, date grouping).

## API

`POST /api/chat` with `{ "messages": [{ "role": "user" | "assistant", "content": "..." }] }`.

- On validation or upstream errors before streaming starts: a JSON error `{ "error": { "code", "message" } }` with an appropriate status (400, 413, 429, 502, 503, 504).
- On success: `200` with `application/x-ndjson`, one JSON event per line:
  - `{"type":"text","text":"..."}`
  - `{"type":"done","stopReason":"end_turn"}`
  - `{"type":"error","code":"...","message":"..."}` if a failure happens mid-stream

Closing the connection (the stop button) aborts the upstream Claude request.

`GET /api/health` (Express only) reports whether a key is configured and which model is in use.

## Project structure

```
index.html              App shell (Vite entry)
src/styles/main.css     Tailwind entry + component styles
src/js/main.js          App state and wiring
src/js/api.js           Streaming client for /api/chat (NDJSON)
src/js/conversations.js Pure conversation utilities (tested)
src/js/storage.js       localStorage persistence
src/js/markdown.js      marked + highlight.js + DOMPurify
src/js/ui/*.js          Sidebar, thread, composer, DOM helpers
server/index.js         Express entry point
server/app.js           Express app (routes, static serving)
server/lib/             Config, validation, Claude streaming + error mapping
netlify/functions/      Netlify Function wrapper for /api/chat
test/                   node:test suites
```

## Troubleshooting

- **"The server is missing its Anthropic API key"** – create `.env` from `.env.example`, set `ANTHROPIC_API_KEY`, and restart `npm run dev`.
- **"The AI provider rejected the server credentials"** – the key is invalid or revoked; generate a new one.
- **"The configured Claude model is not available"** – check `ANTHROPIC_MODEL` for typos or use the default.
- **Requests fail with 400 after setting `ANTHROPIC_EFFORT`** – the chosen model doesn't support effort; unset it.
- **"Too many requests"** – you hit Anthropic rate limits; wait and retry.
- **Responses arrive all at once instead of streaming** – a proxy is buffering; disable buffering for `/api/chat`.
- **`npm start` shows a blank page or warns about `dist/`** – run `npm run build` first.
- **Port already in use** – set `PORT` in `.env` (Vite's proxy follows `PORT` too).
- **Chats disappeared** – history lives in this browser's `localStorage`; clearing site data or using a private window removes it.
