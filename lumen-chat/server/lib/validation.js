// Validation and normalization for incoming chat requests.
// Pure functions with no I/O so they can be unit tested and shared between
// the Express server and the Netlify Function.

export const LIMITS = Object.freeze({
  maxMessages: 200,
  maxMessageChars: 100_000,
  maxTotalChars: 400_000,
});

const ROLES = new Set(['user', 'assistant']);

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.code = 'invalid_request';
  }
}

/**
 * Validates a `{ messages: [{ role, content }] }` body and returns a
 * normalized message list ready to send to Claude:
 * - whitespace-only messages are dropped
 * - consecutive messages with the same role are merged
 * - the conversation must start and end with a user message
 *
 * Throws ValidationError with a client-safe message on failure.
 */
export function validateChatRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError('"messages" must be a non-empty array.');
  }
  if (messages.length > LIMITS.maxMessages) {
    throw new ValidationError(`A conversation can contain at most ${LIMITS.maxMessages} messages.`);
  }

  let totalChars = 0;
  const normalized = [];

  messages.forEach((message, index) => {
    if (!message || typeof message !== 'object') {
      throw new ValidationError(`Message ${index} must be an object.`);
    }
    const { role, content } = message;
    if (!ROLES.has(role)) {
      throw new ValidationError(`Message ${index} has an invalid role. Use "user" or "assistant".`);
    }
    if (typeof content !== 'string') {
      throw new ValidationError(`Message ${index} content must be a string.`);
    }
    if (content.length > LIMITS.maxMessageChars) {
      throw new ValidationError(`Message ${index} exceeds ${LIMITS.maxMessageChars} characters.`);
    }
    totalChars += content.length;
    if (totalChars > LIMITS.maxTotalChars) {
      throw new ValidationError('The conversation is too long. Start a new chat to continue.');
    }

    if (content.trim() === '') return;

    const previous = normalized[normalized.length - 1];
    if (previous && previous.role === role) {
      previous.content += `\n\n${content}`;
    } else {
      normalized.push({ role, content });
    }
  });

  if (normalized.length === 0) {
    throw new ValidationError('Messages must contain some text.');
  }
  if (normalized[0].role !== 'user') {
    throw new ValidationError('The conversation must start with a user message.');
  }
  if (normalized[normalized.length - 1].role !== 'user') {
    throw new ValidationError('The last message must be from the user.');
  }

  return normalized;
}
