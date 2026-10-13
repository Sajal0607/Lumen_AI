import 'highlight.js/styles/github-dark.css';
import '../styles/main.css';

import { ChatRequestError, streamChat } from './api.js';
import {
  DEFAULT_TITLE,
  appendMessage,
  createConversation,
  createMessage,
  removeTrailingAssistant,
  renameConversation,
  toApiMessages,
  updateMessage,
} from './conversations.js';
import { loadPrefs, loadState, savePrefs, saveState } from './storage.js';
import { setupComposer } from './ui/composer.js';
import { el, hydrateIcons, iconSvg, toast } from './ui/dom.js';
import { focusConversation, renderSidebar } from './ui/sidebar.js';
import { renderThread, updateStreamingMessage } from './ui/thread.js';

const SUGGESTIONS = [
  { title: 'Explain a concept', prompt: 'Explain how HTTPS works, step by step, as if I were a new developer.' },
  { title: 'Write some code', prompt: 'Write a JavaScript function that debounces another function, with a short usage example.' },
  { title: 'Plan something', prompt: 'Help me plan a 3-day weekend trip to Lisbon with a mix of food, culture and walking.' },
  { title: 'Compare options', prompt: 'Compare PostgreSQL, MySQL and SQLite in a table: strengths, weaknesses and best use cases.' },
];

const $ = (id) => document.getElementById(id);
const dom = {
  app: $('app'),
  sidebar: $('sidebar'),
  backdrop: $('sidebar-backdrop'),
  sidebarOpen: $('sidebar-open'),
  sidebarClose: $('sidebar-close'),
  newChat: $('new-chat'),
  headerNewChat: $('header-new-chat'),
  list: $('conversation-list'),
  title: $('chat-title'),
  scroll: $('thread-scroll'),
  welcome: $('welcome'),
  suggestions: $('suggestions'),
  messages: $('messages'),
  scrollBottom: $('scroll-bottom'),
  themeToggle: $('theme-toggle'),
  deleteDialog: $('delete-dialog'),
  deleteName: $('delete-dialog-name'),
};

const mobileQuery = window.matchMedia('(max-width: 767px)');
const prefs = loadPrefs();

const state = {
  ...loadState(),
  renamingId: null,
  /** @type {{ conversationId: string, messageId: string, controller: AbortController } | null} */
  generation: null,
};

let stickToBottom = true;
let renderQueued = false;
let storageWarningShown = false;

// ---------------------------------------------------------------------------
// State helpers

const getConversation = (id) => state.conversations.find((c) => c.id === id) ?? null;
const getActive = () => getConversation(state.activeId);

function replaceConversation(next) {
  state.conversations = state.conversations.map((c) => (c.id === next.id ? next : c));
}

function persist() {
  if (!saveState(state) && !storageWarningShown) {
    storageWarningShown = true;
    toast('Browser storage is full — recent changes may not be saved. Delete old chats to free space.', 'error', 6000);
  }
}

// ---------------------------------------------------------------------------
// Rendering

function render() {
  const active = getActive();
  const hasMessages = Boolean(active?.messages.length);

  renderSidebar(dom.list, state, sidebarHandlers);

  const title = active ? active.title : DEFAULT_TITLE;
  dom.title.textContent = title;
  document.title = active ? `${title} · Lumen` : 'Lumen Chat';

  dom.welcome.classList.toggle('hidden', hasMessages);
  dom.messages.classList.toggle('hidden', !hasMessages);
  if (hasMessages) {
    renderThread(dom.messages, active, {
      streamingId: state.generation?.conversationId === active.id ? state.generation.messageId : null,
      onRegenerate: regenerate,
    });
  } else {
    dom.messages.replaceChildren();
  }

  composer.setBusy(Boolean(state.generation));
  if (stickToBottom) scrollToBottom();
}

function scheduleStreamingRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const generation = state.generation;
    if (!generation || generation.conversationId !== state.activeId) return;
    const message = getActive()?.messages.find((m) => m.id === generation.messageId);
    if (message && !updateStreamingMessage(dom.messages, message)) render();
    if (stickToBottom) scrollToBottom();
  });
}

function scrollToBottom(behavior = 'auto') {
  dom.scroll.scrollTo({ top: dom.scroll.scrollHeight, behavior });
}

function renderSuggestions() {
  dom.suggestions.replaceChildren(
    ...SUGGESTIONS.map(({ title, prompt }) =>
      el(
        'button',
        { type: 'button', role: 'listitem', class: 'suggestion', onclick: () => send(prompt) },
        el('span', { class: 'block font-medium', text: title }),
        el('span', { class: 'mt-0.5 block truncate text-ink-500 dark:text-ink-400', text: prompt }),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Chat actions

function send(text) {
  if (state.generation) return false;
  let conversation = getActive();
  if (!conversation) {
    conversation = createConversation();
    state.conversations = [conversation, ...state.conversations];
    state.activeId = conversation.id;
  }
  replaceConversation(appendMessage(conversation, createMessage('user', text)));
  stickToBottom = true;
  persist();
  generate(conversation.id);
  return true;
}

async function generate(conversationId) {
  const conversation = getConversation(conversationId);
  const apiMessages = toApiMessages(conversation?.messages ?? []);
  if (!apiMessages.length) {
    toast('There is no message to respond to.', 'error');
    return;
  }

  const assistant = createMessage('assistant', '', { status: 'streaming' });
  replaceConversation(appendMessage(conversation, assistant));
  const controller = new AbortController();
  state.generation = { conversationId, messageId: assistant.id, controller };
  render();

  let content = '';
  let final;
  try {
    const { stopReason } = await streamChat(apiMessages, {
      signal: controller.signal,
      onText(chunk) {
        content += chunk;
        const current = getConversation(conversationId);
        if (!current) return;
        replaceConversation(updateMessage(current, assistant.id, { content }));
        scheduleStreamingRender();
      },
    });
    final = { status: 'complete', stopReason };
  } catch (error) {
    if (error.name === 'AbortError') {
      final = { status: 'stopped' };
    } else {
      const message =
        error instanceof ChatRequestError ? error.message : 'Something unexpected happened. Please try again.';
      final = { status: 'error', error: message };
    }
  }

  state.generation = null;
  const current = getConversation(conversationId);
  if (current) {
    replaceConversation(updateMessage(current, assistant.id, { content, ...final }));
    persist();
  }
  render();
  if (final.status === 'error' && conversationId === state.activeId) {
    dom.messages.querySelector('[role="alert"] button')?.focus();
  } else if (!mobileQuery.matches) {
    composer.focus();
  }
}

function stopGeneration() {
  state.generation?.controller.abort();
}

function regenerate() {
  const active = getActive();
  if (!active || state.generation) return;
  replaceConversation(removeTrailingAssistant(active));
  stickToBottom = true;
  generate(active.id);
}

function startNewChat() {
  stopGeneration();
  state.activeId = null;
  state.renamingId = null;
  persist();
  render();
  if (mobileQuery.matches) setSidebarOpen(false);
  composer.focus();
}

function selectConversation(id) {
  if (id !== state.activeId) stopGeneration();
  state.activeId = id;
  state.renamingId = null;
  stickToBottom = true;
  persist();
  render();
  if (mobileQuery.matches) setSidebarOpen(false, { restoreFocus: false });
  composer.focus();
}

const sidebarHandlers = {
  onSelect: selectConversation,
  onStartRename(id) {
    state.renamingId = id;
    render();
  },
  onRename(id, title) {
    const conversation = getConversation(id);
    state.renamingId = null;
    if (conversation && title.trim() && title.trim() !== conversation.title) {
      replaceConversation(renameConversation(conversation, title));
      persist();
    }
    render();
    focusConversation(dom.list, id);
  },
  onCancelRename(id) {
    state.renamingId = null;
    render();
    focusConversation(dom.list, id);
  },
  onDelete(id) {
    const conversation = getConversation(id);
    if (!conversation) return;
    dom.deleteName.textContent = conversation.title;
    dom.deleteDialog.returnValue = '';
    dom.deleteDialog.showModal();
    dom.deleteDialog.addEventListener(
      'close',
      () => {
        if (dom.deleteDialog.returnValue !== 'confirm') {
          focusConversation(dom.list, id);
          return;
        }
        if (state.generation?.conversationId === id) stopGeneration();
        state.conversations = state.conversations.filter((c) => c.id !== id);
        if (state.activeId === id) state.activeId = null;
        persist();
        render();
        toast('Chat deleted.');
        dom.newChat.focus();
      },
      { once: true },
    );
  },
};

// ---------------------------------------------------------------------------
// Sidebar layout & theme

function setSidebarOpen(open, { restoreFocus = true } = {}) {
  dom.app.dataset.sidebar = open ? 'open' : 'closed';
  dom.sidebarOpen.setAttribute('aria-expanded', String(open));
  dom.sidebar.inert = !open;
  const mobile = mobileQuery.matches;
  dom.backdrop.classList.toggle('hidden', !(open && mobile));
  if (!mobile) {
    prefs.sidebarOpen = open;
    savePrefs(prefs);
  }
  if (open) dom.newChat.focus({ preventScroll: true });
  else if (restoreFocus) dom.sidebarOpen.focus();
}

function applyLayout() {
  setSidebarOpen(mobileQuery.matches ? false : prefs.sidebarOpen !== false, { restoreFocus: false });
  if (!mobileQuery.matches && document.activeElement === dom.newChat) composer.focus();
}

function updateThemeIcon() {
  const dark = document.documentElement.classList.contains('dark');
  dom.themeToggle.innerHTML = iconSvg(dark ? 'sun' : 'moon');
  dom.themeToggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

// ---------------------------------------------------------------------------
// Wiring

const composer = setupComposer({
  form: $('composer'),
  input: $('composer-input'),
  sendButton: $('send-button'),
  stopButton: $('stop-button'),
  onSubmit: send,
  onStop: stopGeneration,
});

hydrateIcons();
updateThemeIcon();
renderSuggestions();

dom.newChat.addEventListener('click', startNewChat);
dom.headerNewChat.addEventListener('click', startNewChat);
dom.sidebarOpen.addEventListener('click', () => setSidebarOpen(true));
dom.sidebarClose.addEventListener('click', () => setSidebarOpen(false));
dom.backdrop.addEventListener('click', () => setSidebarOpen(false));
mobileQuery.addEventListener('change', applyLayout);

dom.themeToggle.addEventListener('click', () => {
  const dark = document.documentElement.classList.toggle('dark');
  prefs.theme = dark ? 'dark' : 'light';
  savePrefs(prefs);
  updateThemeIcon();
});

dom.scroll.addEventListener(
  'scroll',
  () => {
    const distance = dom.scroll.scrollHeight - dom.scroll.scrollTop - dom.scroll.clientHeight;
    stickToBottom = distance < 80;
    dom.scrollBottom.classList.toggle('hidden', stickToBottom || dom.messages.classList.contains('hidden'));
  },
  { passive: true },
);
dom.scrollBottom.addEventListener('click', () => {
  stickToBottom = true;
  scrollToBottom('smooth');
  composer.focus();
});

document.addEventListener('keydown', (event) => {
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.shiftKey && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    startNewChat();
  } else if (event.key === 'Escape' && mobileQuery.matches && dom.app.dataset.sidebar === 'open' && !dom.deleteDialog.open) {
    setSidebarOpen(false);
  }
});

// Save any partial response if the page closes mid-stream.
window.addEventListener('pagehide', persist);

applyLayout();
render();
composer.focus();
