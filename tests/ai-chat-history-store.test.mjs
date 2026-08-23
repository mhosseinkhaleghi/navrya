import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

async function storeSandbox(fetchFn, token) {
  const events = [];
  const sandbox = {
    window: {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    fetch: fetchFn || (async () => { throw new Error('fetch must not be called in this test'); })
  };
  sandbox.window = Object.assign(sandbox.window, {
    fetch: sandbox.fetch,
    dispatchEvent: (event) => events.push(event.type),
    TradeJournalDevUserSwitcher: { currentUserId: () => (token === undefined ? 'token-abc' : token) }
  });
  vm.runInNewContext(await source('ai-chat-history-store.js'), sandbox, { filename: 'ai-chat-history-store.js' });
  return { window: sandbox.window, events };
}

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

test('every request attaches the real session token as x-dev-user-id, and throws NOT_SIGNED_IN when signed out', async () => {
  let seenHeaders = null;
  const { window } = await storeSandbox(async (url, options) => { seenHeaders = options.headers; return jsonResponse(200, { conversations: [] }); });
  await window.TradeJournalAiChatHistoryStore.listFor('openai');
  assert.equal(seenHeaders['x-dev-user-id'], 'token-abc');

  const { window: signedOut } = await storeSandbox(async () => { throw new Error('must never be called'); }, null);
  await assert.rejects(() => signedOut.TradeJournalAiChatHistoryStore.listFor('openai'), /NOT_SIGNED_IN/);
});

test('listFor(provider) fetches the full list and filters to one provider client-side', async () => {
  const conversations = [
    { id: 'c1', title: 'A', provider: 'openai', messageCount: 2, tokens: 10, updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'c2', title: 'B', provider: 'anthropic', messageCount: 4, tokens: 20, updatedAt: '2026-01-02T00:00:00Z' }
  ];
  const { window } = await storeSandbox(async (url) => { assert.match(url, /\/api\/sync\/ai-chat-history\/?$/); return jsonResponse(200, { conversations }); });
  const openaiOnly = await window.TradeJournalAiChatHistoryStore.listFor('openai');
  assert.equal(openaiOnly.length, 1);
  assert.equal(openaiOnly[0].id, 'c1');
});

test('startConversation POSTs the first exchange with a derived title and returns the created conversation, and fires the changed event', async () => {
  let sentBody = null;
  const { window, events } = await storeSandbox(async (url, options) => {
    assert.equal(options.method, 'POST');
    sentBody = JSON.parse(options.body);
    return jsonResponse(201, { id: 'conv-1', title: sentBody.title, provider: sentBody.provider, messages: sentBody.messages, tokens: sentBody.tokens, updatedAt: '2026-01-01T00:00:00Z' });
  });
  const created = await window.TradeJournalAiChatHistoryStore.startConversation('openai', 'How do I read a bull flag?', 'It is a continuation pattern.', 42);
  assert.equal(created.id, 'conv-1');
  assert.equal(sentBody.provider, 'openai');
  assert.equal(sentBody.title, 'How do I read a bull flag?');
  assert.deepEqual(sentBody.messages, [{ role: 'user', content: 'How do I read a bull flag?' }, { role: 'assistant', content: 'It is a continuation pattern.' }]);
  assert.equal(sentBody.tokens, 42);
  assert.deepEqual(events, ['tradejournal:ai-chat-history-changed']);
});

// Atomic append (security/correctness hardening pass): appendExchange used to GET the current
// conversation, concatenate the new turn onto it client-side, then PATCH the whole array back - a
// lost-update race between two near-simultaneous calls (two tabs, or a slow request straddling a
// fast one), each reading the same base array and each silently overwriting the other's appended
// turn. It now sends only this turn's own new messages; the server appends them atomically.
test('appendExchange sends only this turn\'s own new messages (no GET first) and PATCHes just that delta plus this call\'s own token count', async () => {
  const calls = [];
  const { window, events } = await storeSandbox(async (url, options) => {
    calls.push({ url, method: options.method });
    const body = JSON.parse(options.body);
    return jsonResponse(200, { id: 'conv-1', messages: body.messages, tokens: body.tokens });
  });
  const result = await window.TradeJournalAiChatHistoryStore.appendExchange('conv-1', 'follow-up question', 'follow-up answer', 12);
  assert.equal(calls.length, 1, 'no GET round trip any more - a single PATCH is the whole call');
  assert.equal(calls[0].method, 'PATCH');
  assert.deepEqual(result.messages, [{ role: 'user', content: 'follow-up question' }, { role: 'assistant', content: 'follow-up answer' }], 'only the new turn is ever sent - appending onto the existing history is the server\'s own job now');
  assert.equal(result.tokens, 12);
  assert.deepEqual(events, ['tradejournal:ai-chat-history-changed']);
});

test('remove() DELETEs the conversation and fires the changed event', async () => {
  let calledUrl = null, calledMethod = null;
  const { window, events } = await storeSandbox(async (url, options) => { calledUrl = url; calledMethod = options.method; return { status: 204, ok: true, json: async () => ({}) }; });
  await window.TradeJournalAiChatHistoryStore.remove('conv-1');
  assert.equal(calledMethod, 'DELETE');
  assert.match(calledUrl, /\/conv-1$/);
  assert.deepEqual(events, ['tradejournal:ai-chat-history-changed']);
});

test('clear(provider) deletes every conversation for that provider only, then fires the changed event once', async () => {
  const conversations = [
    { id: 'c1', title: 'A', provider: 'openai', messageCount: 1, tokens: 1, updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'c2', title: 'B', provider: 'openai', messageCount: 1, tokens: 1, updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'c3', title: 'C', provider: 'anthropic', messageCount: 1, tokens: 1, updatedAt: '2026-01-01T00:00:00Z' }
  ];
  const deleted = [];
  const { window, events } = await storeSandbox(async (url, options) => {
    if (!options || (options.method || 'GET') === 'GET') return jsonResponse(200, { conversations });
    deleted.push(url);
    return { status: 204, ok: true, json: async () => ({}) };
  });
  await window.TradeJournalAiChatHistoryStore.clear('openai');
  assert.equal(deleted.length, 2);
  assert.ok(deleted.every((url) => url.indexOf('c1') > -1 || url.indexOf('c2') > -1));
  assert.deepEqual(events, ['tradejournal:ai-chat-history-changed']);
});
