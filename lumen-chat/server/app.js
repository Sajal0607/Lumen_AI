import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getChatConfig, hasApiCredentials } from './lib/config.js';
import { isAbortError, logChatError, openChatStream, prepareChat, toClientError } from './lib/chat-stream.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Creates the Express app. `openStream` is injectable for tests.
 * @param {{ serveStatic?: boolean, openStream?: typeof openChatStream }} [options]
 */
export function createApp({ serveStatic = false, openStream = openChatStream } = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    });
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, model: getChatConfig().model, configured: hasApiCredentials() });
  });

  app.post('/api/chat', express.json({ limit: '2mb' }), async (req, res) => {
    const controller = new AbortController();
    // Abort the upstream Claude request if the browser disconnects or presses stop.
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    let stream;
    try {
      const params = prepareChat(req.body);
      stream = await openStream(params, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      logChatError(error);
      const { status, code, message } = toClientError(error);
      res.status(status).json({ error: { code, message } });
      return;
    }

    res.status(200).set({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    try {
      for await (const event of stream.events) {
        if (controller.signal.aborted) break;
        res.write(`${JSON.stringify(event)}\n`);
      }
    } catch (error) {
      if (!controller.signal.aborted && !isAbortError(error)) {
        logChatError(error);
        const { code, message } = toClientError(error);
        res.write(`${JSON.stringify({ type: 'error', code, message })}\n`);
      }
    } finally {
      if (controller.signal.aborted) stream.abort();
      if (!res.writableEnded) res.end();
    }
  });

  app.all('/api/{*path}', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Unknown API route.' } });
  });

  if (serveStatic) {
    const distDir = path.join(rootDir, 'dist');
    if (!existsSync(distDir)) {
      console.warn('[server] dist/ not found. Run "npm run build" before "npm start".');
    }
    app.use(express.static(distDir, { index: 'index.html', maxAge: '1h' }));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  }

  // JSON parse errors and anything else that escapes a route.
  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    logChatError(error);
    const status = error?.type === 'entity.too.large' ? 413 : error?.type === 'entity.parse.failed' ? 400 : 500;
    const message =
      status === 413
        ? 'The request is too large.'
        : status === 400
          ? 'Request body must be valid JSON.'
          : 'Something went wrong on the server.';
    res.status(status).json({ error: { code: status === 500 ? 'internal_error' : 'invalid_request', message } });
  });

  return app;
}
