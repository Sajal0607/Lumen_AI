import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Anthropic from '@anthropic-ai/sdk';
import { createApp } from '../server/app.js';
import { toClientError } from '../server/lib/chat-stream.js';
import { DEFAULT_MODEL, getChatConfig } from '../server/lib/config.js';

const FAKE_KEY = 'test-key-not-real';

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

const post = (url, body) =>
  fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /api/chat', () => {
  let server;
  let url;
  let lastParams;
  const previousKey = process.env.ANTHROPIC_API_KEY;

  before(async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fakeOpenStream = async (params) => {
      lastParams = params;
      async function* events() {
        yield { type: 'text', text: 'Hello' };
        yield { type: 'text', text: ', world' };
        yield { type: 'done', stopReason: 'end_turn' };
      }
      return { events: events(), abort() {} };
    };
    ({ server, url } = await listen(createApp({ openStream: fakeOpenStream })));
  });

  after(() => {
    server.closeAllConnections();
    server.close();
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  });

  it('streams NDJSON text events', async () => {
    const res = await post(url, { messages: [{ role: 'user', content: 'Hi' }] });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/x-ndjson/);
    const events = (await res.text()).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(events.map((e) => e.type), ['text', 'text', 'done']);
    assert.equal(events.filter((e) => e.type === 'text').map((e) => e.text).join(''), 'Hello, world');
    assert.equal(lastParams.model, getChatConfig().model);
    assert.deepEqual(lastParams.messages, [{ role: 'user', content: 'Hi' }]);
  });

  it('returns 400 for invalid requests', async () => {
    const res = await post(url, { messages: [{ role: 'robot', content: 'Hi' }] });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'invalid_request');
  });

  it('returns 400 for malformed JSON without leaking a stack trace', async () => {
    const res = await post(url, '{not json');
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.ok(!text.includes('at '), 'response should not contain a stack trace');
  });

  it('returns 503 when the API key is missing, without echoing secrets', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await post(url, { messages: [{ role: 'user', content: 'Hi' }] });
      assert.equal(res.status, 503);
      assert.equal((await res.json()).error.code, 'missing_api_key');
    } finally {
      process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    }
  });
});

describe('toClientError', () => {
  it('maps rate limits to 429 with a friendly message', () => {
    const error = new Anthropic.RateLimitError(429, { type: 'error' }, `rate limited ${FAKE_KEY}`, new Headers());
    const mapped = toClientError(error);
    assert.equal(mapped.status, 429);
    assert.equal(mapped.code, 'rate_limited');
    assert.ok(!mapped.message.includes(FAKE_KEY));
  });

  it('maps unknown errors to a generic 500', () => {
    const mapped = toClientError(new Error('secret internal detail'));
    assert.equal(mapped.status, 500);
    assert.ok(!mapped.message.includes('secret'));
  });
});

describe('getChatConfig', () => {
  it('uses a sensible default model and reads overrides', () => {
    assert.equal(getChatConfig({}).model, DEFAULT_MODEL);
    assert.equal(getChatConfig({ ANTHROPIC_MODEL: 'claude-sonnet-5-5' }).model, 'claude-sonnet-5-5');
    assert.equal(getChatConfig({ ANTHROPIC_EFFORT: 'bogus' }).effort, undefined);
    assert.equal(getChatConfig({ ANTHROPIC_EFFORT: 'LOW' }).effort, 'low');
  });
});
