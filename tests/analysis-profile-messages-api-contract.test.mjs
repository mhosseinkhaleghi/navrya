import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { MESSAGES_PER_PROFILE_MAX } from '../server/db/analysis-profile-normalize.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Analysis Profile teaching chat (071_analysis_profile_messages.sql) - nested routes under
// /api/sync/analysis-profiles/:id/messages, through the real HTTP layer with the memory repository. Same
// harness as analysis-profile-events-api-contract.test.mjs.
let server, baseUrl, repo;

before(async () => {
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: process.cwd() }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function api(method, route, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + route, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }
async function profileFor(user, id) { await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: { id, name: 'PA', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [] } }); return id; }
const messages = (id) => `/api/sync/analysis-profiles/${id}/messages`;
const turn = (text = 'I always wait for a sweep.', reply = 'Got it - that is a liquidity-first approach.', extra = {}) => ({
  messages: [
    { role: 'user', content: text },
    { role: 'assistant', content: reply, tokenUsage: { promptTokens: 300, completionTokens: 60 },
      proposals: [{ id: 'p1', kind: 'concept', title: 'Swept liquidity levels', description: 'stops taken', priority: 'mandatory' }, { id: 'p2', kind: 'understanding', text: 'Waits for a sweep before trusting a breakout.' }], ...extra }
  ]
});

test('a request with no authenticated session is rejected with AUTH_SESSION_REQUIRED', async () => {
  const result = await api('GET', messages('any-id'));
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_SESSION_REQUIRED');
});

test('every messages route 404s for a profile that does not exist', async () => {
  const user = await createUser('Chat One');
  assert.equal((await api('GET', messages('nope'), { userId: user.id })).status, 404);
  assert.equal((await api('POST', messages('nope'), { userId: user.id, body: turn() })).status, 404);
  assert.equal((await api('PATCH', messages('nope') + '/x', { userId: user.id, body: { statuses: { p1: 'applied' } } })).status, 404);
  assert.equal((await api('DELETE', messages('nope'), { userId: user.id })).status, 404);
});

test('another user can never read, append to, patch or clear a conversation that is not theirs (403), and nothing changes', async () => {
  const owner = await createUser('Chat Owner');
  const intruder = await createUser('Chat Intruder');
  await profileFor(owner, 'ap-chat-private');
  const saved = (await api('POST', messages('ap-chat-private'), { userId: owner.id, body: turn() })).body.messages;
  assert.equal((await api('GET', messages('ap-chat-private'), { userId: intruder.id })).status, 403);
  assert.equal((await api('POST', messages('ap-chat-private'), { userId: intruder.id, body: turn('hack', 'hack') })).status, 403);
  assert.equal((await api('PATCH', messages('ap-chat-private') + '/' + saved[1].id, { userId: intruder.id, body: { statuses: { p1: 'applied' } } })).status, 403);
  assert.equal((await api('DELETE', messages('ap-chat-private'), { userId: intruder.id })).status, 403);
  const still = (await api('GET', messages('ap-chat-private'), { userId: owner.id })).body.messages;
  assert.equal(still.length, 2);
  assert.equal(still[1].proposals[0].status, 'pending');
});

test('a turn (the trader\'s message and the engine\'s reply) is stored in one request, oldest first, with the real token usage and pending proposals', async () => {
  const user = await createUser('Chat Two');
  await profileFor(user, 'ap-chat-1');
  const created = await api('POST', messages('ap-chat-1'), { userId: user.id, body: turn() });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.messages.map((m) => m.role), ['user', 'assistant']);
  assert.ok(new Date(created.body.messages[1].createdAt) > new Date(created.body.messages[0].createdAt), 'the reply is strictly later than the message, even within one millisecond');
  const [asked, replied] = created.body.messages;
  assert.equal(asked.content, 'I always wait for a sweep.');
  assert.deepEqual(asked.proposals, []);
  assert.equal(asked.tokenUsage, null);
  assert.deepEqual(replied.tokenUsage, { promptTokens: 300, completionTokens: 60 });
  assert.deepEqual(replied.proposals.map((p) => [p.id, p.kind, p.status]), [['p1', 'concept', 'pending'], ['p2', 'understanding', 'pending']]);

  await api('POST', messages('ap-chat-1'), { userId: user.id, body: turn('second question', 'second answer', { proposals: [], tokenUsage: null }) });
  const list = await api('GET', messages('ap-chat-1'), { userId: user.id });
  assert.deepEqual(list.body.messages.map((m) => m.content), ['I always wait for a sweep.', 'Got it - that is a liquidity-first approach.', 'second question', 'second answer']);
});

test('an invalid turn is rejected with VALIDATION_FAILED and stores NOTHING - not even its valid half (a turn is atomic)', async () => {
  const user = await createUser('Chat Three');
  await profileFor(user, 'ap-chat-bad');
  const bad = [
    { messages: [] }, { messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }] }, // 0 or 3 messages
    { messages: [{ role: 'user', content: 'valid' }, { role: 'assistant', content: '' }] },                                                  // valid + empty assistant
    { messages: [{ role: 'user', content: 'valid' }, { role: 'system', content: 'not a role' }] },
    { messages: [{ role: 'user', content: '   ' }] }, { messages: 'nope' }, {}
  ];
  for (const body of bad) {
    const result = await api('POST', messages('ap-chat-bad'), { userId: user.id, body });
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(result.body.error, 'VALIDATION_FAILED');
  }
  assert.equal((await api('GET', messages('ap-chat-bad'), { userId: user.id })).body.messages.length, 0);
});

test('a user message can never carry proposals or token usage, and stored proposals/usage are sanitized', async () => {
  const user = await createUser('Chat Four');
  await profileFor(user, 'ap-chat-clean');
  const result = await api('POST', messages('ap-chat-clean'), {
    userId: user.id, body: { messages: [
      { role: 'user', content: 'hi', proposals: [{ id: 'x', kind: 'concept', title: 'smuggled' }], tokenUsage: { promptTokens: 999 } },
      { role: 'assistant', content: 'yo', tokenUsage: { promptTokens: 12.7, completionTokens: 3, secret: 'leak' }, proposals: [{ id: 'bad id', kind: 'concept', title: 'dropped' }, { id: 'ok', kind: 'concept', title: 'kept', priority: 'nonsense' }] }
    ] }
  });
  const [asked, replied] = result.body.messages;
  assert.deepEqual(asked.proposals, []);
  assert.equal(asked.tokenUsage, null);
  assert.deepEqual(replied.tokenUsage, { promptTokens: 12, completionTokens: 3 });
  assert.deepEqual(replied.proposals.map((p) => [p.id, p.priority]), [['ok', 'preferred']]);
});

test('PATCH resolves proposals once: pending -> applied/dismissed, an already-resolved proposal is never flipped, and unknown ids are ignored', async () => {
  const user = await createUser('Chat Five');
  await profileFor(user, 'ap-chat-patch');
  const [, replied] = (await api('POST', messages('ap-chat-patch'), { userId: user.id, body: turn() })).body.messages;
  const url = messages('ap-chat-patch') + '/' + replied.id;

  const first = await api('PATCH', url, { userId: user.id, body: { statuses: { p1: 'applied', p2: 'dismissed', ghost: 'applied' } } });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.proposals.map((p) => p.status), ['applied', 'dismissed']);

  const again = await api('PATCH', url, { userId: user.id, body: { statuses: { p1: 'dismissed', p2: 'applied' } } });
  assert.deepEqual(again.body.proposals.map((p) => p.status), ['applied', 'dismissed'], 'resolved proposals are final');
  const persisted = (await api('GET', messages('ap-chat-patch'), { userId: user.id })).body.messages[1];
  assert.deepEqual(persisted.proposals.map((p) => p.status), ['applied', 'dismissed']);
});

test('PATCH only ever touches proposal STATUS: the engine\'s words, the proposals themselves and the usage cannot be rewritten', async () => {
  const user = await createUser('Chat Six');
  await profileFor(user, 'ap-chat-immutable');
  const [, replied] = (await api('POST', messages('ap-chat-immutable'), { userId: user.id, body: turn() })).body.messages;
  const patched = await api('PATCH', messages('ap-chat-immutable') + '/' + replied.id, {
    userId: user.id, body: { statuses: { p1: 'applied' }, content: 'REWRITTEN', proposals: [], tokenUsage: null, role: 'user', profileId: 'other' }
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.content, 'Got it - that is a liquidity-first approach.');
  assert.equal(patched.body.proposals.length, 2);
  assert.deepEqual(patched.body.tokenUsage, { promptTokens: 300, completionTokens: 60 });
  assert.equal(patched.body.role, 'assistant');
  assert.equal(patched.body.profileId, 'ap-chat-immutable');
});

test('PATCH rejects a missing/invalid statuses body (400), the trader\'s own message (404), an unknown message (404), and a message from another profile (404)', async () => {
  const user = await createUser('Chat Seven');
  await profileFor(user, 'ap-chat-p1');
  await profileFor(user, 'ap-chat-p2');
  const [asked, replied] = (await api('POST', messages('ap-chat-p1'), { userId: user.id, body: turn() })).body.messages;
  const url = messages('ap-chat-p1') + '/' + replied.id;
  for (const body of [{}, { statuses: {} }, { statuses: { p1: 'pending' } }, { statuses: { p1: 'bogus' } }, { statuses: 'applied' }]) {
    assert.equal((await api('PATCH', url, { userId: user.id, body })).status, 400, JSON.stringify(body));
  }
  const ok = { statuses: { p1: 'applied' } };
  assert.equal((await api('PATCH', messages('ap-chat-p1') + '/' + asked.id, { userId: user.id, body: ok })).status, 404, 'a user message has no proposals to resolve');
  assert.equal((await api('PATCH', messages('ap-chat-p1') + '/missing', { userId: user.id, body: ok })).status, 404);
  assert.equal((await api('PATCH', messages('ap-chat-p2') + '/' + replied.id, { userId: user.id, body: ok })).status, 404, 'a message id is only valid under its own profile');
});

test('DELETE clears only that profile\'s conversation and is idempotent', async () => {
  const user = await createUser('Chat Eight');
  await profileFor(user, 'ap-chat-clear-a');
  await profileFor(user, 'ap-chat-clear-b');
  await api('POST', messages('ap-chat-clear-a'), { userId: user.id, body: turn() });
  await api('POST', messages('ap-chat-clear-b'), { userId: user.id, body: turn() });
  assert.equal((await api('DELETE', messages('ap-chat-clear-a'), { userId: user.id })).status, 204);
  assert.equal((await api('GET', messages('ap-chat-clear-a'), { userId: user.id })).body.messages.length, 0);
  assert.equal((await api('GET', messages('ap-chat-clear-b'), { userId: user.id })).body.messages.length, 2, 'the other profile\'s chat is untouched');
  assert.equal((await api('DELETE', messages('ap-chat-clear-a'), { userId: user.id })).status, 204);
});

test('the conversation is a rolling log: only the latest 200 messages are kept, oldest dropped first', async () => {
  const user = await createUser('Chat Nine');
  await profileFor(user, 'ap-chat-roll');
  // Straight to the repository: 101 two-message turns over HTTP would only slow the suite down.
  for (let i = 0; i < 101; i += 1) {
    await repo.analysisProfileMessages.append(user.id, 'ap-chat-roll', [{ role: 'user', content: `q${i}` }, { role: 'assistant', content: `a${i}` }]);
  }
  const list = await repo.analysisProfileMessages.listByProfile(user.id, 'ap-chat-roll');
  assert.equal(list.length, MESSAGES_PER_PROFILE_MAX);
  assert.equal(list[0].content, 'q1', 'the two oldest of 202 (q0 and a0) were trimmed - the survivor list starts at turn 1');
  assert.equal(list[list.length - 1].content, 'a100');
  assert.equal((await api('GET', messages('ap-chat-roll'), { userId: user.id })).body.messages.length, MESSAGES_PER_PROFILE_MAX);
});

test('the log\'s order is a fact of the data: appends made back-to-back in the same millisecond, or after the clock stepped back, still come out strictly in order', async () => {
  const user = await createUser('Chat Order');
  await profileFor(user, 'ap-chat-order');
  // A tight loop with no awaits between appends' stamps used to tie on createdAt and mis-sort - this is the
  // regression test for the bug the real-Postgres run exposed (the rolling cap trimmed the wrong message).
  for (let i = 0; i < 25; i += 1) {
    await repo.analysisProfileMessages.append(user.id, 'ap-chat-order', [{ role: 'user', content: `q${i}` }, { role: 'assistant', content: `a${i}` }]);
  }
  const list = await repo.analysisProfileMessages.listByProfile(user.id, 'ap-chat-order');
  assert.deepEqual(list.map((m) => m.content), Array.from({ length: 25 }, (_, i) => [`q${i}`, `a${i}`]).flat());
  const stamps = list.map((m) => Date.parse(m.createdAt));
  for (let i = 1; i < stamps.length; i += 1) assert.ok(stamps[i] > stamps[i - 1], `message ${i} must be strictly later than message ${i - 1}`);

  // A clock that steps BACK (NTP correction, a restored VM) must not let a new message sort before an old one.
  const realNow = Date.now;
  try {
    Date.now = () => stamps[stamps.length - 1] - 60000;
    await repo.analysisProfileMessages.append(user.id, 'ap-chat-order', [{ role: 'user', content: 'after-clock-step-back' }]);
  } finally { Date.now = realNow; }
  const after = await repo.analysisProfileMessages.listByProfile(user.id, 'ap-chat-order');
  assert.equal(after[after.length - 1].content, 'after-clock-step-back');
});

test('deleting a profile removes its conversation (the memory repository mirrors the database cascade)', async () => {
  const user = await createUser('Chat Ten');
  await profileFor(user, 'ap-chat-cascade');
  await api('POST', messages('ap-chat-cascade'), { userId: user.id, body: turn() });
  assert.equal((await api('DELETE', '/api/sync/analysis-profiles/ap-chat-cascade', { userId: user.id })).status, 204);
  await profileFor(user, 'ap-chat-cascade'); // same id again - it must start with an empty conversation
  assert.equal((await api('GET', messages('ap-chat-cascade'), { userId: user.id })).body.messages.length, 0);
});
