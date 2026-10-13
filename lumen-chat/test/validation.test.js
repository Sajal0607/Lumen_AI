import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LIMITS, ValidationError, validateChatRequest } from '../server/lib/validation.js';

describe('validateChatRequest', () => {
  it('accepts a simple conversation', () => {
    const messages = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'How are you?' },
    ];
    assert.deepEqual(validateChatRequest({ messages }), messages);
  });

  it('rejects non-object bodies and missing messages', () => {
    for (const body of [null, 'text', [], {}, { messages: [] }, { messages: 'hi' }]) {
      assert.throws(() => validateChatRequest(body), ValidationError);
    }
  });

  it('rejects invalid roles and non-string content', () => {
    assert.throws(() => validateChatRequest({ messages: [{ role: 'system', content: 'x' }] }), /invalid role/);
    assert.throws(() => validateChatRequest({ messages: [{ role: 'user', content: 42 }] }), /must be a string/);
  });

  it('drops blank messages and merges consecutive same-role turns', () => {
    const result = validateChatRequest({
      messages: [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: '   ' },
        { role: 'user', content: 'Second' },
      ],
    });
    assert.deepEqual(result, [{ role: 'user', content: 'First\n\nSecond' }]);
  });

  it('requires the conversation to start and end with a user message', () => {
    assert.throws(
      () => validateChatRequest({ messages: [{ role: 'assistant', content: 'Hi' }, { role: 'user', content: 'Yo' }] }),
      /start with a user message/,
    );
    assert.throws(
      () => validateChatRequest({ messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Yo' }] }),
      /last message must be from the user/,
    );
  });

  it('enforces size limits', () => {
    const tooMany = Array.from({ length: LIMITS.maxMessages + 1 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: 'x',
    }));
    assert.throws(() => validateChatRequest({ messages: tooMany }), /at most/);
    assert.throws(
      () => validateChatRequest({ messages: [{ role: 'user', content: 'x'.repeat(LIMITS.maxMessageChars + 1) }] }),
      /exceeds/,
    );
  });
});
