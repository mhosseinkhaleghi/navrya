import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

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
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }

test('a request with no x-dev-user-id is rejected with AUTH_SESSION_REQUIRED', async () => {
  const result = await api('GET', '/api/sync/ai-chat-history');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_SESSION_REQUIRED');
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

// Atomic append (security/correctness hardening pass): PATCH's own `messages` field is now ONLY
// the new turn(s) being added this call - the server concatenates them onto the real, current
// stored array (see routes.ai-chat-history.mjs/repo.*.mjs's own comments), never a client-supplied
// full array replacing it wholesale.
test('PATCH /:id appends only the delta it is sent onto the real, current messages - not a whole-array replace - and tokens accumulate', async () => {
  const user = await createUser('Trader3');
  const created = await api('POST', '/api/sync/ai-chat-history', {
    userId: user.id, body: { provider: 'openai', title: 'T', messages: [{ role: 'user', content: 'a' }], tokens: 10 }
  });
  const appended = await api('PATCH', '/api/sync/ai-chat-history/' + created.body.id, {
    userId: user.id,
    body: { messages: [{ role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }], tokens: 15 }
  });
  assert.equal(appended.status, 200);
  assert.deepEqual(appended.body.messages, [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }], 'the original message plus only the new delta - a client resending an already-stored message would double it, which is exactly why the client no longer does that (see ai-chat-history-store.js)');
  assert.equal(appended.body.tokens, 25, 'tokens must accumulate across PATCH calls, not reset to the latest value');
});

// The actual regression this pass fixes: the OLD contract (client GETs, concatenates, PATCHes the
// whole array back) lost a message whenever two appends to the same conversation raced - the
// second PATCH's client-side snapshot didn't yet include the first append, so its own "whole
// array" PATCH silently overwrote it. Two concurrent delta-only PATCHes (the new contract) must
// both survive regardless of arrival order.
test('two concurrent PATCH /:id appends to the same conversation both survive - the second never overwrites the first (the lost-update race this pass removes)', async () => {
  const user = await createUser('Trader3b');
  const created = await api('POST', '/api/sync/ai-chat-history', {
    userId: user.id, body: { provider: 'openai', title: 'T', messages: [{ role: 'user', content: 'seed' }], tokens: 1 }
  });
  const [first, second] = await Promise.all([
    api('PATCH', '/api/sync/ai-chat-history/' + created.body.id, { userId: user.id, body: { messages: [{ role: 'user', content: 'turn-a' }], tokens: 1 } }),
    api('PATCH', '/api/sync/ai-chat-history/' + created.body.id, { userId: user.id, body: { messages: [{ role: 'user', content: 'turn-b' }], tokens: 1 } })
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const final = await api('GET', '/api/sync/ai-chat-history/' + created.body.id, { userId: user.id });
  const contents = final.body.messages.map((m) => m.content);
  assert.ok(contents.includes('turn-a'), 'the first concurrent append must not be lost');
  assert.ok(contents.includes('turn-b'), 'the second concurrent append must not be lost');
  assert.equal(final.body.messages.length, 3, 'seed + both concurrent turns, never fewer');
  assert.equal(final.body.tokens, 3, 'both concurrent appends\' own token counts must both be counted, not one overwriting the other');
});

test('replaying the same turnId is an idempotent success and never duplicates history or tokens', async () => {
  const user = await createUser('Trader-idempotent');
  const conversationId = 'aiConv-client-api-idempotent';
  const firstBody = {
    id: conversationId, provider: 'openai', title: 'T', turnId: 'turn-1', tokens: 2,
    messages: [{ role: 'user', content: 'a', turnId: 'turn-1' }, { role: 'assistant', content: 'b', turnId: 'turn-1' }]
  };
  const created = await api('POST', '/api/sync/ai-chat-history', { userId: user.id, body: firstBody });
  const replayedCreate = await api('POST', '/api/sync/ai-chat-history', { userId: user.id, body: firstBody });
  assert.equal(created.status, 201);
  assert.equal(replayedCreate.status, 201);
  assert.equal(replayedCreate.body.id, conversationId);

  const patchBody = {
    turnId: 'turn-2', tokens: 3,
    messages: [{ role: 'user', content: 'c', turnId: 'turn-2' }, { role: 'assistant', content: 'd', turnId: 'turn-2' }]
  };
  assert.equal((await api('PATCH', '/api/sync/ai-chat-history/' + conversationId, { userId: user.id, body: patchBody })).status, 200);
  assert.equal((await api('PATCH', '/api/sync/ai-chat-history/' + conversationId, { userId: user.id, body: patchBody })).status, 200);
  const final = await api('GET', '/api/sync/ai-chat-history/' + conversationId, { userId: user.id });
  assert.equal(final.body.messages.length, 4);
  assert.equal(final.body.tokens, 5);
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
