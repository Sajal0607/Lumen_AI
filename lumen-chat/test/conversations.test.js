import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_TITLE,
  TITLE_MAX_LENGTH,
  appendMessage,
  createConversation,
  createMessage,
  deriveTitle,
  groupConversationsByDate,
  removeTrailingAssistant,
  renameConversation,
  sanitizeStoredState,
  toApiMessages,
} from '../src/js/conversations.js';

describe('deriveTitle', () => {
  it('uses short messages as-is', () => {
    assert.equal(deriveTitle('  Plan a trip   to Rome '), 'Plan a trip to Rome');
  });

  it('truncates long messages at a word boundary with an ellipsis', () => {
    const title = deriveTitle('Explain the differences between TCP and UDP and when I should use each of them in practice');
    assert.ok(title.length <= TITLE_MAX_LENGTH, `title too long: ${title.length}`);
    assert.ok(title.endsWith('…'));
    assert.ok(!title.includes('  '));
  });

  it('strips markdown and code fences', () => {
    assert.equal(deriveTitle('# **Fix** this `bug`\n```js\nconst x = 1;\n```'), 'Fix this bug');
  });

  it('falls back to the default title for empty input', () => {
    assert.equal(deriveTitle('   '), DEFAULT_TITLE);
    assert.equal(deriveTitle(undefined), DEFAULT_TITLE);
  });
});

describe('conversation updates', () => {
  it('titles the conversation from the first user message only', () => {
    let convo = createConversation(1);
    convo = appendMessage(convo, createMessage('user', 'Hello there', {}, 2), 2);
    convo = appendMessage(convo, createMessage('assistant', 'Hi!', {}, 3), 3);
    convo = appendMessage(convo, createMessage('user', 'Something else', {}, 4), 4);
    assert.equal(convo.title, 'Hello there');
    assert.equal(convo.messages.length, 3);
    assert.equal(convo.updatedAt, 4);
    assert.deepEqual(convo.messages.map((m) => m.role), ['user', 'assistant', 'user']);
    assert.ok(convo.messages.every((m) => typeof m.createdAt === 'number'));
  });

  it('keeps a user-chosen title', () => {
    let convo = renameConversation(createConversation(), '  My   chat ');
    assert.equal(convo.title, 'My chat');
    convo = appendMessage(convo, createMessage('user', 'Hello'));
    assert.equal(convo.title, 'My chat');
  });

  it('removes trailing assistant messages for regeneration', () => {
    let convo = createConversation();
    convo = appendMessage(convo, createMessage('user', 'Q'));
    convo = appendMessage(convo, createMessage('assistant', 'A'));
    assert.deepEqual(removeTrailingAssistant(convo).messages.map((m) => m.role), ['user']);
  });
});

describe('toApiMessages', () => {
  it('drops errored/empty messages and merges same-role turns', () => {
    const messages = [
      createMessage('user', 'One'),
      createMessage('assistant', '', { status: 'error', error: 'boom' }),
      createMessage('user', 'Two'),
    ];
    assert.deepEqual(toApiMessages(messages), [{ role: 'user', content: 'One\n\nTwo' }]);
  });

  it('returns [] when the last message is not from the user', () => {
    assert.deepEqual(toApiMessages([createMessage('user', 'Q'), createMessage('assistant', 'A')]), []);
  });
});

describe('sanitizeStoredState', () => {
  it('drops malformed data and marks interrupted messages as stopped', () => {
    const state = sanitizeStoredState({
      activeId: 'missing',
      conversations: [
        { id: 'a', title: 'A', createdAt: 1, updatedAt: 2, messages: [{ id: 'm', role: 'assistant', content: 'x', status: 'streaming' }] },
        { id: 'b', messages: 'nope' },
        null,
      ],
    });
    assert.equal(state.conversations.length, 1);
    assert.equal(state.activeId, null);
    assert.equal(state.conversations[0].messages[0].status, 'stopped');
  });

  it('returns an empty state for garbage', () => {
    assert.deepEqual(sanitizeStoredState('garbage'), { conversations: [], activeId: null });
  });
});

describe('groupConversationsByDate', () => {
  it('buckets conversations by recency', () => {
    const now = new Date('2026-03-10T12:00:00').getTime();
    const day = 86_400_000;
    const groups = groupConversationsByDate(
      [{ updatedAt: now }, { updatedAt: now - day }, { updatedAt: now - 3 * day }, { updatedAt: now - 90 * day }],
      now,
    );
    assert.deepEqual(groups.map((g) => g.label), ['Today', 'Yesterday', 'Previous 7 days', 'Older']);
  });
});
