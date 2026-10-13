// Netlify deployment of POST /api/chat. Reuses the same validation and
// streaming core as the Express server. On Netlify, AI Gateway injects
// ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL into this function's environment.
import {
  isAbortError,
  logChatError,
  openChatStream,
  prepareChat,
  toClientError,
} from '../../server/lib/chat-stream.js';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

export default async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: { code: 'method_not_allowed', message: 'Use POST.' } });
  }

  let stream;
  try {
    const body = await req.json();
    stream = await openChatStream(prepareChat(body), { signal: req.signal });
  } catch (error) {
    logChatError(error);
    const { status, code, message } = toClientError(error);
    return json(status, { error: { code, message } });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream.events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (error) {
        if (!isAbortError(error)) {
          logChatError(error);
          const { code, message } = toClientError(error);
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', code, message })}\n`));
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Stream already closed by a client disconnect.
        }
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
};

export const config = { path: '/api/chat' };
