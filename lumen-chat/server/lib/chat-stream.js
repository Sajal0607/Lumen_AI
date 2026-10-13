// Shared Claude streaming logic used by both the Express route and the
// Netlify Function. Produces a simple newline-delimited JSON (NDJSON) event
// protocol for the browser:
//   {"type":"text","text":"..."}            – a chunk of assistant text
//   {"type":"done","stopReason":"end_turn"} – generation finished
//   {"type":"error","code":"...","message":"..."} – failure after streaming began

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, getChatConfig, hasApiCredentials } from './config.js';
import { ValidationError, validateChatRequest } from './validation.js';

export class ChatError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ChatError';
    this.status = status;
    this.code = code;
  }
}

let cachedClient;
function getClient() {
  // The SDK reads ANTHROPIC_API_KEY (and ANTHROPIC_BASE_URL, if set) itself.
  cachedClient ??= new Anthropic({ maxRetries: 2 });
  return cachedClient;
}

/** Validates the body and builds Claude request parameters. Throws ChatError. */
export function prepareChat(body, env = process.env) {
  if (!hasApiCredentials(env)) {
    throw new ChatError(
      503,
      'missing_api_key',
      'The server is missing its Anthropic API key. Set ANTHROPIC_API_KEY on the server and restart.',
    );
  }

  let messages;
  try {
    messages = validateChatRequest(body);
  } catch (error) {
    if (error instanceof ValidationError) throw new ChatError(400, error.code, error.message);
    throw error;
  }

  const { model, maxTokens, effort } = getChatConfig(env);
  const params = { model, max_tokens: maxTokens, system: SYSTEM_PROMPT, messages };
  if (effort) params.output_config = { effort };
  return params;
}

/**
 * Opens a Claude stream and waits for the first event so that upstream
 * failures (auth, rate limits, bad model) surface as a thrown error *before*
 * the HTTP response is committed. Returns an async iterator of protocol events.
 */
export async function openChatStream(params, { signal, client = getClient() } = {}) {
  const stream = client.messages.stream(params, { signal });
  const iterator = stream[Symbol.asyncIterator]();
  const first = await iterator.next();

  async function* events() {
    let result = first;
    while (!result.done) {
      const event = result.value;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text };
      }
      result = await iterator.next();
    }
    const final = await stream.finalMessage();
    yield { type: 'done', stopReason: final.stop_reason };
  }

  return { events: events(), abort: () => stream.abort() };
}

/** True when the error was caused by the client aborting / disconnecting. */
export function isAbortError(error) {
  return error instanceof Anthropic.APIUserAbortError || error?.name === 'AbortError';
}

/** Maps any error to a client-safe `{ status, code, message }` (no secrets or stacks). */
export function toClientError(error) {
  if (error instanceof ChatError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (isAbortError(error)) {
    return { status: 499, code: 'aborted', message: 'The request was cancelled.' };
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return {
      status: 502,
      code: 'upstream_auth',
      message: 'The AI provider rejected the server credentials. Check the configured API key.',
    };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return {
      status: 429,
      code: 'rate_limited',
      message: 'Too many requests right now. Please wait a moment and try again.',
    };
  }
  if (error instanceof Anthropic.NotFoundError) {
    return {
      status: 502,
      code: 'model_unavailable',
      message: 'The configured Claude model is not available. Check ANTHROPIC_MODEL on the server.',
    };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return {
      status: 400,
      code: 'upstream_bad_request',
      message: 'Claude could not process this conversation. It may be too long — try starting a new chat.',
    };
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { status: 504, code: 'upstream_timeout', message: 'Claude took too long to respond. Please try again.' };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 502, code: 'upstream_unreachable', message: 'Could not reach Claude. Please try again.' };
  }
  if (error instanceof Anthropic.APIError && (error.status === 529 || error.status >= 500)) {
    return {
      status: 503,
      code: 'upstream_unavailable',
      message: 'Claude is temporarily overloaded or unavailable. Please try again shortly.',
    };
  }
  if (error instanceof SyntaxError) {
    return { status: 400, code: 'invalid_json', message: 'Request body must be valid JSON.' };
  }
  return { status: 500, code: 'internal_error', message: 'Something went wrong on the server. Please try again.' };
}

/** Logs a server-side summary of an error without request contents or credentials. */
export function logChatError(error) {
  if (isAbortError(error) || error instanceof ChatError) return;
  const status = error?.status ? ` (status ${error.status})` : '';
  console.error(`[chat] ${error?.name ?? 'Error'}${status}: ${error?.message ?? error}`);
}
