// Sidebar: grouped conversation list with select, rename and delete.
import { groupConversationsByDate, sortConversations } from '../conversations.js';
import { el, iconSvg } from './dom.js';

/**
 * @param {HTMLElement} container
 * @param {{ conversations: any[], activeId: string|null, renamingId: string|null }} state
 * @param {{ onSelect(id), onStartRename(id), onRename(id, title), onCancelRename(), onDelete(id) }} handlers
 */
export function renderSidebar(container, state, handlers) {
  const { conversations, activeId, renamingId } = state;
  container.replaceChildren();

  if (conversations.length === 0) {
    container.append(
      el('p', {
        class: 'px-3 py-6 text-center text-sm text-ink-400',
        text: 'No conversations yet. Start a new chat to see it here.',
      }),
    );
    return;
  }

  for (const group of groupConversationsByDate(sortConversations(conversations))) {
    const headingId = `group-${group.label.replace(/\W+/g, '-').toLowerCase()}`;
    const list = el('ul', { class: 'space-y-0.5', 'aria-labelledby': headingId });

    for (const conversation of group.conversations) {
      const isActive = conversation.id === activeId;
      const item = el('li', { class: 'conversation-item', dataset: { active: String(isActive), id: conversation.id } });

      if (conversation.id === renamingId) {
        item.append(renameInput(conversation, handlers));
      } else {
        item.append(
          el('button', {
            type: 'button',
            class: 'conversation-select',
            title: conversation.title,
            'aria-current': isActive ? 'page' : null,
            text: conversation.title,
            onclick: () => handlers.onSelect(conversation.id),
          }),
          el(
            'div',
            { class: 'conversation-actions' },
            el('button', {
              type: 'button',
              class: 'icon-btn-sm',
              'aria-label': `Rename “${conversation.title}”`,
              title: 'Rename',
              html: iconSvg('pencil', 14),
              onclick: () => handlers.onStartRename(conversation.id),
            }),
            el('button', {
              type: 'button',
              class: 'icon-btn-sm hover:!text-red-600',
              'aria-label': `Delete “${conversation.title}”`,
              title: 'Delete',
              html: iconSvg('trash', 14),
              onclick: () => handlers.onDelete(conversation.id),
            }),
          ),
        );
      }
      list.append(item);
    }

    container.append(el('h3', { id: headingId, class: 'conversation-group-label', text: group.label }), list);
  }
}

function renameInput(conversation, handlers) {
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    if (save) handlers.onRename(conversation.id, input.value);
    else handlers.onCancelRename(conversation.id);
  };
  const input = el('input', {
    type: 'text',
    class: 'conversation-rename',
    'aria-label': 'Conversation title',
    maxlength: '80',
    onkeydown: (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    },
    onblur: () => finish(true),
  });
  input.value = conversation.title;
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
  return input;
}

/** Moves focus back to the select button of a conversation after re-render. */
export function focusConversation(container, id) {
  const button = container.querySelector(`[data-id="${CSS.escape(id)}"] .conversation-select`);
  button?.focus();
}
