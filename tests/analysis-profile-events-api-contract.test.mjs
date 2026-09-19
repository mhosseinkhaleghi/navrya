import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Analysis Profile engine-memory learning ledger (067_analysis_profile_memory.sql) - nested,
// append-only routes under /api/sync/analysis-profiles/:id/events. Same harness as
// tests/analysis-profiles-api-contract.test.mjs.
let server, baseUrl, repo;

before(async () => {
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: process.cwd() }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }
function sampleProfile(id) { return { id, name: 'PA', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [] }; }

test('a request with no authenticated session is rejected with AUTH_SESSION_REQUIRED', async () => {
  const result = await api('GET', '/api/sync/analysis-profiles/any-id/events');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_SESSION_REQUIRED');
});

test('GET/POST 404s for a profile that does not exist', async () => {
  const user = await createUser('Trader One');
  const get = await api('GET', '/api/sync/analysis-profiles/not-real/events', { userId: user.id });
  assert.equal(get.status, 404);
  assert.equal(get.body.error, 'ANALYSIS_PROFILE_NOT_FOUND');
  const post = await api('POST', '/api/sync/analysis-profiles/not-real/events', { userId: user.id, body: { kind: 'note' } });
  assert.equal(post.status, 404);
});

test('POST records a real event, and GET lists it back - newest first', async () => {
  const user = await createUser('Trader Two');
  await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile('ap-events-1') });
  const created = await api('POST', '/api/sync/analysis-profiles/ap-events-1/events', {
    userId: user.id, body: { kind: 'concept_added', title: 'Taught: swept liquidity levels', detail: 'accepted an AI suggestion', understandingVersion: 1, tokenUsage: { promptTokens: 120, completionTokens: 40 } }
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.kind, 'concept_added');
  assert.equal(created.body.tokenUsage.promptTokens, 120);

  const second = await api('POST', '/api/sync/analysis-profiles/ap-events-1/events', { userId: user.id, body: { kind: 'note', title: 'Manual note' } });
  assert.equal(second.status, 201);

  const list = await api('GET', '/api/sync/analysis-profiles/ap-events-1/events', { userId: user.id });
  assert.equal(list.status, 200);
  assert.equal(list.body.events.length, 2);
  assert.equal(list.body.events[0].title, 'Manual note', 'newest event must come first');
  assert.equal(list.body.events[1].title, 'Taught: swept liquidity levels');
});

test('POST without a kind is rejected with VALIDATION_FAILED', async () => {
  const user = await createUser('Trader Three');
  await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile('ap-events-2') });
  const result = await api('POST', '/api/sync/analysis-profiles/ap-events-2/events', { userId: user.id, body: { title: 'no kind' } });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'VALIDATION_FAILED');
});

test('a stranger cannot list or record events against another user\'s profile - cross-user isolation', async () => {
  const owner = await createUser('Owner');
  const stranger = await createUser('Stranger');
  await api('POST', '/api/sync/analysis-profiles', { userId: owner.id, body: sampleProfile('ap-events-owned') });
  await api('POST', '/api/sync/analysis-profiles/ap-events-owned/events', { userId: owner.id, body: { kind: 'note', title: 'owner note' } });

  const strangerGet = await api('GET', '/api/sync/analysis-profiles/ap-events-owned/events', { userId: stranger.id });
  assert.equal(strangerGet.status, 403);
  assert.equal(strangerGet.body.error, 'NOT_ANALYSIS_PROFILE_OWNER');

  const strangerPost = await api('POST', '/api/sync/analysis-profiles/ap-events-owned/events', { userId: stranger.id, body: { kind: 'note', title: 'hijack attempt' } });
  assert.equal(strangerPost.status, 403);

  const ownerList = await api('GET', '/api/sync/analysis-profiles/ap-events-owned/events', { userId: owner.id });
  assert.equal(ownerList.body.events.length, 1, 'the real owner\'s ledger must be completely unaffected');
});

test('there is no PATCH or DELETE on an event - the ledger is append-only by construction', async () => {
  const user = await createUser('Trader Four');
  await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile('ap-events-3') });
  const created = await api('POST', '/api/sync/analysis-profiles/ap-events-3/events', { userId: user.id, body: { kind: 'note', title: 'x' } });
  const authHeaders = await authHeadersFor(repo, user.id);
  const patch = await fetch(`${baseUrl}/api/sync/analysis-profiles/ap-events-3/events/${created.body.id}`, { method: 'PATCH', headers: authHeaders });
  assert.equal(patch.status, 404, 'no route exists to modify an event');
  const del = await fetch(`${baseUrl}/api/sync/analysis-profiles/ap-events-3/events/${created.body.id}`, { method: 'DELETE', headers: authHeaders });
  assert.equal(del.status, 404, 'no route exists to delete an event');
});
