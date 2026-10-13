// Browser client for the backend streaming endpoint. Talks only to our own
// server (/api/chat); no credentials ever live in the browser.

export class ChatRequestError extends Error {
  constructor(message, { code = 'request_failed', status = 0 } = {}) {
    super(message);
    this.name = 'ChatRequestError';
    this.code = code;
    this.status = status;
  }
}

/** Parses newline-delimited JSON from a ReadableStream, yielding each event. */
export async function* readNdjson(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield JSON.parse(line);
      }
    }
    const rest = (buffer + decoder.decode()).trim();
    if (rest) yield JSON.parse(rest);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Streams a Claude response. Calls `onText(chunk)` as text arrives.
 * Resolves with `{ stopReason }`; rejects with ChatRequestError or AbortError.
 */
export async function streamChat(messages, { signal, onText }) {
  let response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ChatRequestError('Could not reach the server. Check your connection and try again.', {
      code: 'network_error',
    });
  }

  if (!response.ok) {
    let message = `The server responded with an error (${response.status}).`;
    let code = 'request_failed';
    try {
      const data = await response.json();
      if (data?.error?.message) message = data.error.message;
      if (data?.error?.code) code = data.error.code;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ChatRequestError(message, { code, status: response.status });
  }

  if (!response.body) throw new ChatRequestError('Streaming is not supported by this browser.');

  let stopReason = null;
  try {
    for await (const event of readNdjson(response.body)) {
      if (event.type === 'text') onText(event.text);
      else if (event.type === 'done') stopReason = event.stopReason;
      else if (event.type === 'error') throw new ChatRequestError(event.message, { code: event.code });
    }
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof ChatRequestError) throw error;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new ChatRequestError('The connection was interrupted while Claude was responding.', {
      code: 'stream_interrupted',
    });
  }

  if (!stopReason) {
    throw new ChatRequestError('The response ended unexpectedly. Please try again.', { code: 'stream_incomplete' });
  }
  return { stopReason };
}
