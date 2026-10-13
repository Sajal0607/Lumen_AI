// Message thread rendering, including the live streaming message.
import { enhanceCodeBlocks, renderMarkdown } from '../markdown.js';
import { createCopyButton, el, formatTime, iconSvg } from './dom.js';

const STOP_NOTES = {
  stopped: 'Generation stopped.',
  max_tokens: 'Response reached the maximum length.',
  refusal: 'Claude declined to continue this response.',
};

/**
 * Renders all messages of a conversation.
 * @param {HTMLOListElement} list
 * @param {object} conversation
 * @param {{ streamingId: string|null, onRegenerate(): void }} options
 */
export function renderThread(list, conversation, { streamingId, onRegenerate }) {
  list.replaceChildren();
  const messages = conversation?.messages ?? [];
  const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant');

  messages.forEach((message, index) => {
    const isStreaming = message.id === streamingId;
    const canRegenerate = index === lastAssistantIndex && !streamingId && index === messages.length - 1;
    list.append(
      message.role === 'user'
        ? renderUserMessage(message)
        : renderAssistantMessage(message, { isStreaming, canRegenerate, onRegenerate }),
    );
  });
}

function renderUserMessage(message) {
  return el(
    'li',
    { class: 'flex animate-fade-in flex-col items-end', dataset: { id: message.id } },
    el('h3', { class: 'sr-only', text: 'You said:' }),
    el('div', { class: 'message-user', text: message.content }),
    el('time', {
      class: 'mt-1 pr-2 text-[11px] text-ink-400',
      datetime: new Date(message.createdAt).toISOString(),
      text: formatTime(message.createdAt),
    }),
  );
}

function renderAssistantMessage(message, { isStreaming, canRegenerate, onRegenerate }) {
  const item = el('li', { class: 'group flex gap-3 sm:gap-4', dataset: { id: message.id, role: 'assistant' } });
  const avatar = el('span', {
    class: 'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-500 text-white',
    html: iconSvg('spark', 14),
  });
  const body = el('div', { class: 'min-w-0 flex-1' }, el('h3', { class: 'sr-only', text: 'Lumen said:' }));
  item.append(avatar, body);

  const content = el('div', { class: 'message-assistant', dataset: { content: '' } });
  body.append(content);

  if (isStreaming && !message.content) {
    content.replaceWith(typingIndicator());
    return item;
  }

  if (message.content) {
    setAssistantContent(content, message.content, { streaming: isStreaming });
  }

  if (message.status === 'error') {
    body.append(errorBlock(message.error, canRegenerate ? onRegenerate : null));
  } else if (STOP_NOTES[message.status] || STOP_NOTES[message.stopReason]) {
    body.append(el('p', { class: 'message-note', text: STOP_NOTES[message.status] ?? STOP_NOTES[message.stopReason] }));
  }

  if (!isStreaming && message.content) {
    const actions = el('div', { class: 'message-actions' });
    actions.append(createCopyButton(() => message.content, 'Copy response', { showLabel: false }));
    if (canRegenerate && message.status !== 'error') {
      actions.append(
        el('button', {
          type: 'button',
          class: 'icon-btn-sm',
          'aria-label': 'Regenerate response',
          title: 'Regenerate',
          html: iconSvg('refresh', 14),
          onclick: onRegenerate,
        }),
      );
    }
    actions.append(
      el('time', {
        class: 'ml-2 text-[11px]',
        datetime: new Date(message.createdAt).toISOString(),
        text: formatTime(message.createdAt),
      }),
    );
    body.append(actions);
  }
  return item;
}

function typingIndicator() {
  return el(
    'div',
    { class: 'typing-indicator flex h-7 items-center gap-1', role: 'status', 'aria-label': 'Lumen is thinking' },
    el('span'),
    el('span'),
    el('span'),
  );
}

function errorBlock(message, onRetry) {
  return el(
    'div',
    { class: 'message-error', role: 'alert' },
    el('span', { class: 'mt-0.5 shrink-0', html: iconSvg('alert', 16) }),
    el(
      'div',
      { class: 'flex-1' },
      el('p', { class: 'font-medium', text: 'Something went wrong' }),
      el('p', { class: 'mt-0.5 opacity-90', text: message || 'The response could not be generated.' }),
    ),
    onRetry &&
      el(
        'button',
        { type: 'button', class: 'btn-secondary shrink-0 !py-1 !text-xs', onclick: onRetry },
        el('span', { class: 'inline-flex items-center gap-1', html: `${iconSvg('refresh', 12)}<span>Retry</span>` }),
      ),
  );
}

function setAssistantContent(container, text, { streaming }) {
  container.innerHTML = renderMarkdown(text); // sanitized by DOMPurify
  container.classList.toggle('streaming-cursor', streaming);
  enhanceCodeBlocks(container, createCopyButton);
}

/**
 * Efficiently updates only the streaming message's content (throttled to one
 * render per animation frame by the caller).
 */
export function updateStreamingMessage(list, message) {
  const item = list.querySelector(`[data-id="${CSS.escape(message.id)}"]`);
  if (!item) return false;
  const body = item.querySelector('.min-w-0');
  let content = body.querySelector('[data-content]');
  if (!content) {
    body.querySelector('.typing-indicator')?.remove();
    content = el('div', { class: 'message-assistant', dataset: { content: '' } });
    body.append(content);
  }
  setAssistantContent(content, message.content, { streaming: true });
  return true;
}
