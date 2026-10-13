// Server-side configuration read from environment variables.
// Nothing in this module is ever sent to the browser.

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const DEFAULT_MAX_TOKENS = 32_000;

const EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

export const SYSTEM_PROMPT = [
  'You are Lumen, a helpful, knowledgeable assistant in a chat web app.',
  'Answer clearly and concisely. Use Markdown for structure when it helps:',
  'headings, lists, tables, and fenced code blocks with a language tag.',
].join(' ');

export function getChatConfig(env = process.env) {
  const maxTokens = Number.parseInt(env.ANTHROPIC_MAX_TOKENS ?? '', 10);
  const effort = env.ANTHROPIC_EFFORT?.trim().toLowerCase();

  return {
    model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : DEFAULT_MAX_TOKENS,
    effort: EFFORT_LEVELS.has(effort) ? effort : undefined,
  };
}

/** True when the SDK can find a credential in the environment. */
export function hasApiCredentials(env = process.env) {
  return Boolean(env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim());
}
