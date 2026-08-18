import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { testToken } from './helpers/auth-token.mjs';

// Real, multiple, resumable conversations for the global AI assistant dock - mounted at
// /api/sync/ai-chat-history (server/community/routes.ai-chat-history.mjs), behind requireAuth.
let server, baseUrl, repo;

before(async () => {
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) headers['x-dev-user-id'] = testToken(userId);
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }

test('a request with no x-dev-user-id is rejected with AUTH_TOKEN_REQUIRED', async () => {
  const result = await api('GET', '/api/sync/ai-chat-history');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_TOKEN_REQUIRED');
});

test('POST creates a conversation from its first exchange, GET / lists it as a lightweight summary (no message bodies), GET /:id returns the full thread', async () => {
  const user = await createUser('Trader');
  const created = await api('POST', '/api/sync/ai-chat-history', {
    userId: user.id,
    body: { provider: 'openai', title: 'How do I read this chart?', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }], tokens: 30 }
  });
  assert.equal(created.status, 201);
  assert.ok(created.body.id);
  assert.equal(created.body.tokens, 30);

  const list = await api('GET', '/api/sync/ai-chat-history', { userId: user.id });
  assert.equal(list.status, 200);
  assert.equal(list.body.conversations.length, 1);
  assert.equal(list.body.conversations[0].id, created.body.id);
  assert.equal(list.body.conversations[0].messageCount, 2);
  assert.equal('messages' in list.body.conversations[0], false, 'the list route must stay lightweight');

  const detail = await api('GET', '/api/sync/ai-chat-history/' + created.body.id, { userId: user.id });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.messages.length, 2);
});

test('POST rejects an empty/missing messages array', async () => {
  const user = await createUser('Trader2');
  const result = await api('POST', '/api/sync/ai-chat-history', { userId: user.id, body: { provider: 'openai', messages: [] } });
  assert.equal(result.status, 400);
});

test('PATCH /:id appends (whole-array replace of messages, but tokens accumulate) and updates updatedAt', async () => {
  const user = await createUser('Trader3');
  const created = await api('POST', '/api/sync/ai-chat-history', {
    userId: user.id, body: { provider: 'openai', title: 'T', messages: [{ role: 'user', content: 'a' }], tokens: 10 }
  });
  const appended = await api('PATCH', '/api/sync/ai-chat-history/' + created.body.id, {
    userId: user.id,
    body: { messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }], tokens: 15 }
  });
  assert.equal(appended.status, 200);
  assert.equal(appended.body.messages.length, 3);
  assert.equal(appended.body.tokens, 25, 'tokens must accumulate across PATCH calls, not reset to the latest value');
});

test('a conversation belonging to another user cannot be fetched, appended to, or deleted - 404 in every case, never a leak', async () => {
  const owner = await createUser('Owner');
  const stranger = await createUser('Stranger');
  const created = await api('POST', '/api/sync/ai-chat-history', {
    userId: owner.id, body: { provider: 'openai', title: 'T', messages: [{ role: 'user', content: 'a' }], tokens: 5 }
  });

  const getAsStranger = await api('GET', '/api/sync/ai-chat-history/' + created.body.id, { userId: stranger.id });
  assert.equal(getAsStranger.status, 404);

  const patchAsStranger = await api('PATCH', '/api/sync/ai-chat-history/' + created.body.id, { userId: stranger.id, body: { messages: [{ role: 'user', content: 'x' }] } });
  assert.equal(patchAsStranger.status, 404);

  const deleteAsStranger = await api('DELETE', '/api/sync/ai-chat-history/' + created.body.id, { userId: stranger.id });
  assert.equal(deleteAsStranger.status, 404);

  const strangerList = await api('GET', '/api/sync/ai-chat-history', { userId: stranger.id });
  assert.equal(strangerList.body.conversations.length, 0);

  const stillThere = await api('GET', '/api/sync/ai-chat-history/' + created.body.id, { userId: owner.id });
  assert.equal(stillThere.status, 200, 'the real owner must be unaffected by a stranger\'s failed attempts');
});

test('DELETE /:id removes a conversation the caller actually owns', async () => {
  const user = await createUser('Trader4');
  const created = await api('POST', '/api/sync/ai-chat-history', {
    userId: user.id, body: { provider: 'openai', title: 'T', messages: [{ role: 'user', content: 'a' }], tokens: 1 }
  });
  const deleted = await api('DELETE', '/api/sync/ai-chat-history/' + created.body.id, { userId: user.id });
  assert.equal(deleted.status, 204);
  const getAfter = await api('GET', '/api/sync/ai-chat-history/' + created.body.id, { userId: user.id });
  assert.equal(getAfter.status, 404);
});
