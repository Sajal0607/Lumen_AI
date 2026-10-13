// Pure conversation utilities. No DOM or storage access, so they are easy to
// unit test. All functions return new objects instead of mutating inputs.

export const TITLE_MAX_LENGTH = 48;
export const DEFAULT_TITLE = 'New chat';

export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Builds a short, single-line title from the first user message.
 * Strips common Markdown syntax and truncates at a word boundary.
 */
export function deriveTitle(text, maxLength = TITLE_MAX_LENGTH) {
  if (typeof text !== 'string') return DEFAULT_TITLE;
  const cleaned = text
    .replace(/```[\s\S]*?(```|$)/g, ' ') // fenced code
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links / images
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '') // headings, quotes, list markers
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return DEFAULT_TITLE;
  if (cleaned.length <= maxLength) return cleaned;

  const slice = cleaned.slice(0, maxLength - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxLength * 0.5 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s.,;:!?-]+$/, '')}…`;
}

export function normalizeTitle(title, maxLength = 80) {
  const cleaned = String(title ?? '').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, maxLength) || DEFAULT_TITLE;
}

export function createConversation(now = Date.now()) {
  return { id: createId(), title: DEFAULT_TITLE, titleEdited: false, createdAt: now, updatedAt: now, messages: [] };
}

export function createMessage(role, content, extra = {}, now = Date.now()) {
  return { id: createId(), role, content, createdAt: now, status: 'complete', ...extra };
}

/** Appends a message. The first user message sets the title unless the user renamed it. */
export function appendMessage(conversation, message, now = Date.now()) {
  const isFirstUserMessage = message.role === 'user' && !conversation.messages.some((m) => m.role === 'user');
  const title =
    isFirstUserMessage && !conversation.titleEdited ? deriveTitle(message.content) : conversation.title;
  return { ...conversation, title, updatedAt: now, messages: [...conversation.messages, message] };
}

export function updateMessage(conversation, messageId, changes, now = Date.now()) {
  return {
    ...conversation,
    updatedAt: now,
    messages: conversation.messages.map((m) => (m.id === messageId ? { ...m, ...changes } : m)),
  };
}

export function renameConversation(conversation, title, now = Date.now()) {
  return { ...conversation, title: normalizeTitle(title), titleEdited: true, updatedAt: now };
}

/** Removes the trailing assistant message (if any) so the last user turn can be re-answered. */
export function removeTrailingAssistant(conversation, now = Date.now()) {
  const messages = [...conversation.messages];
  while (messages.length && messages[messages.length - 1].role === 'assistant') messages.pop();
  return { ...conversation, updatedAt: now, messages };
}

/**
 * Converts stored messages into the API payload: drops errored or empty
 * messages and merges consecutive same-role turns. Returns [] if the result
 * does not end with a user message.
 */
export function toApiMessages(messages) {
  const result = [];
  for (const message of messages) {
    if (message.status === 'error' || !message.content?.trim()) continue;
    const previous = result[result.length - 1];
    if (previous && previous.role === message.role) {
      previous.content += `\n\n${message.content}`;
    } else {
      result.push({ role: message.role, content: message.content });
    }
  }
  while (result.length && result[0].role !== 'user') result.shift();
  if (!result.length || result[result.length - 1].role !== 'user') return [];
  return result;
}

export function sortConversations(conversations) {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Groups conversations (already sorted) into date buckets for the sidebar. */
export function groupConversationsByDate(conversations, now = Date.now()) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const day = 24 * 60 * 60 * 1000;
  const buckets = [
    { label: 'Today', test: (t) => t >= today },
    { label: 'Yesterday', test: (t) => t >= today - day },
    { label: 'Previous 7 days', test: (t) => t >= today - 7 * day },
    { label: 'Previous 30 days', test: (t) => t >= today - 30 * day },
    { label: 'Older', test: () => true },
  ];
  const groups = buckets.map(({ label }) => ({ label, conversations: [] }));
  for (const conversation of conversations) {
    const index = buckets.findIndex(({ test }) => test(conversation.updatedAt));
    groups[index].conversations.push(conversation);
  }
  return groups.filter((g) => g.conversations.length > 0);
}

/** Validates and repairs data loaded from storage. Drops anything malformed. */
export function sanitizeStoredState(raw) {
  const empty = { conversations: [], activeId: null };
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.conversations)) return empty;

  const conversations = raw.conversations
    .filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages))
    .map((c) => ({
      id: c.id,
      title: normalizeTitle(c.title),
      titleEdited: Boolean(c.titleEdited),
      createdAt: Number(c.createdAt) || Date.now(),
      updatedAt: Number(c.updatedAt) || Number(c.createdAt) || Date.now(),
      messages: c.messages
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map((m) => ({
          id: typeof m.id === 'string' ? m.id : createId(),
          role: m.role,
          content: m.content,
          createdAt: Number(m.createdAt) || Date.now(),
          // A message that was mid-stream when the page closed is treated as stopped.
          status: m.status === 'streaming' ? 'stopped' : ['complete', 'error', 'stopped'].includes(m.status) ? m.status : 'complete',
          ...(typeof m.error === 'string' ? { error: m.error } : {}),
        })),
    }));

  const activeId = conversations.some((c) => c.id === raw.activeId) ? raw.activeId : null;
  return { conversations, activeId };
}
