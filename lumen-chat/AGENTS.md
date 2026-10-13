# AGENTS.md

Guidance for AI agents working on Lumen Chat.

## Architecture

- **Frontend**: plain HTML (`index.html`) + vanilla ES modules in `src/js/` + Tailwind CSS (`src/styles/main.css`), bundled by Vite. **No React, TypeScript or frontend frameworks** — this is a hard requirement from the product owner.
- **Backend**: Express 5 (`server/app.js`, entry `server/index.js`). The only route that matters is `POST /api/chat`.
- **Shared server core**: `server/lib/` (config, validation, Claude streaming, error mapping). Both Express and the Netlify Function (`netlify/functions/chat.mjs`) use it — change behavior there, not in the wrappers.
- **Persistence**: conversations live in browser `localStorage` (`src/js/storage.js`, key `lumen-chat:state:v1`). There is no server-side storage by design.

## Streaming protocol

NDJSON over a POST response: `text`, `done`, `error` events (see README). Errors before the first Claude event are returned as JSON with an HTTP status — `openChatStream` awaits the first SDK event precisely so upstream errors (401/429/404) can still set the status code.

## Conventions

- Keep pure logic (no DOM/storage) in `src/js/conversations.js` and `server/lib/validation.js`, and cover it in `test/` with `node:test`.
- Conversation helpers return new objects; don't mutate state in place.
- All model/user Markdown goes through `renderMarkdown()` (raw HTML escaped, DOMPurify sanitize). User messages render as plain text. Never set `innerHTML` with unsanitized content; `el(..., { html })` is only for trusted icon SVG or sanitized output.
- Client-facing errors come only from `toClientError()`; never forward SDK messages, stack traces or env values.
- The API key is server-only. Vite's `envPrefix` is `LUMEN_PUBLIC_`; don't add Anthropic values to any browser-exposed variable.
- Default model is `claude-opus-5-5` (`server/lib/config.js`), overridable with `ANTHROPIC_MODEL`.

## Non-obvious decisions

- Consecutive same-role messages are merged (client `toApiMessages` and server validation) so a failed response followed by a new user message still forms a valid alternating conversation.
- Switching or deleting a conversation stops an in-flight generation; the partial text is kept with status `stopped`.
- Messages saved mid-stream (page closed) are restored as `stopped`.
- Tailwind is v3 with `darkMode: 'class'`; the theme is applied by an inline script in `index.html` before first paint.
