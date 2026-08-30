import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Journey H2 expressive/context follow-up. Mirrors tests/companion-state-api-contract.test.mjs's
// own real-Express/real-in-memory-repo shape exactly. The one write path (POST /record) always
// server-increments - a client can only ever say "this scenario was just delivered," never a
// count, which is the real contract this file exists to prove (spec section 16's own "never trust
// a client-supplied count" rule).
let server, baseUrl, uploadsDir, repo;

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-'));
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(uploadsDir, { recursive: true, force: true });
});

async function api(method, urlPath, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + urlPath, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }

test('a request with no real session is rejected', async () => {
  const getResult = await api('GET', '/api/sync/conversation-scenario-exposures');
  assert.equal(getResult.status, 401);
  const postResult = await api('POST', '/api/sync/conversation-scenario-exposures/record', { body: { scenarioKey: 'session.purpose' } });
  assert.equal(postResult.status, 401);
});

test('GET returns an empty, bounded map for a user with no exposure history yet', async () => {
  const user = await createUser('Fresh User');
  const result = await api('GET', '/api/sync/conversation-scenario-exposures', { userId: user.id });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.exposures, {});
});

test('POST /record always server-increments - the response never reflects a client-supplied count, only the real stored one', async () => {
  const user = await createUser('Repeat User');
  const first = await api('POST', '/api/sync/conversation-scenario-exposures/record', { userId: user.id, body: { scenarioKey: 'session.purpose', count: 9999 } });
  assert.equal(first.status, 200);
  assert.equal(first.body.exposure.count, 1, 'a client-supplied count field must be completely ignored - the server always increments from its own stored value');

  const second = await api('POST', '/api/sync/conversation-scenario-exposures/record', { userId: user.id, body: { scenarioKey: 'session.purpose' } });
  assert.equal(second.body.exposure.count, 2);

  const fetched = await api('GET', '/api/sync/conversation-scenario-exposures', { userId: user.id });
  assert.equal(fetched.body.exposures['session.purpose'].count, 2);
});

// Architecture-audit fix verification: two tabs/devices concurrently recording the same real
// scenario exposure must never lose an increment (read 2 / read 2 / write 3 / write 3). Both real
// backends implement this as a genuine atomic upsert - repo.pg.mjs via a single `INSERT ... ON
// CONFLICT ... DO UPDATE SET count = count + 1` statement (atomic at the database level, never a
// separate read-then-write round trip), repo.memory.mjs via a synchronous (no `await` between its
// own read and write) function body, which Node's single-threaded event loop can never interleave
// with another call to the same function. This test exercises the real HTTP/Express/repo path
// with genuinely concurrent requests, not a synthetic unit-level race.
test('20 concurrent POST /record calls for the same scenario never lose an increment - the final count is exactly 20', async () => {
  const user = await createUser('Concurrent User');
  await Promise.all(Array.from({ length: 20 }, () =>
    api('POST', '/api/sync/conversation-scenario-exposures/record', { userId: user.id, body: { scenarioKey: 'session.purpose' } })
  ));
  const fetched = await api('GET', '/api/sync/conversation-scenario-exposures', { userId: user.id });
  assert.equal(fetched.body.exposures['session.purpose'].count, 20, 'every one of 20 concurrent increments must be reflected - none lost to a read-then-write race');
});

test('exposure counts are tracked independently per scenario key, never conflated', async () => {
  const user = await createUser('Multi Scenario User');
  await api('POST', '/api/sync/conversation-scenario-exposures/record', { userId: user.id, body: { scenarioKey: 'session.purpose' } });
  await api('POST', '/api/sync/conversation-scenario-exposures/record', { userId: user.id, body: { scenarioKey: 'session.purpose' } });
  await api('POST', '/api/sync/conversation-scenario-exposures/record', { userId: user.id, body: { scenarioKey: 'pattern.purpose' } });

  const fetched = await api('GET', '/api/sync/conversation-scenario-exposures', { userId: user.id });
  assert.equal(fetched.body.exposures['session.purpose'].count, 2);
  assert.equal(fetched.body.exposures['pattern.purpose'].count, 1);
});

test('lastVariantKey is recorded from the request and updates on every call; a request with none clears it to null', async () => {
  const user = await createUser('Variant User');
  const withVariant = await api('POST', '/api/sync/conversation-scenario-exposures/record', { userId: user.id, body: { scenarioKey: 'session.purpose', variantKey: 'FIRST_TIME' } });
  assert.equal(withVariant.body.exposure.lastVariantKey, 'FIRST_TIME');
  const withoutVariant = await api('POST', '/api/sync/conversation-scenario-exposures/record', { userId: user.id, body: { scenarioKey: 'session.purpose' } });
  assert.equal(withoutVariant.body.exposure.lastVariantKey, null);
});

test('exposure history is scoped strictly by the real auth token, never a payload field - a different real user starts fresh', async () => {
  const owner = await createUser('Owner');
  const stranger = await createUser('Stranger');
  await api('POST', '/api/sync/conversation-scenario-exposures/record', { userId: owner.id, body: { scenarioKey: 'session.purpose' } });

  const strangerFetch = await api('GET', '/api/sync/conversation-scenario-exposures', { userId: stranger.id });
  assert.deepEqual(strangerFetch.body.exposures, {}, 'a different real user must never see another user\'s exposure history');
});

test('POST /record without a scenarioKey is rejected - never silently records against an empty key', async () => {
  const user = await createUser('No Key User');
  const result = await api('POST', '/api/sync/conversation-scenario-exposures/record', { userId: user.id, body: {} });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'VALIDATION_FAILED');
});

test('the stored/returned shape is exactly the bounded set the spec requires - count, lastPresentedAt, lastVariantKey - nothing else, no raw message text, no Psychology data', async () => {
  const user = await createUser('Shape User');
  const result = await api('POST', '/api/sync/conversation-scenario-exposures/record', { userId: user.id, body: { scenarioKey: 'session.purpose', variantKey: 'STANDARD' } });
  assert.deepEqual(Object.keys(result.body.exposure).sort(), ['count', 'lastPresentedAt', 'lastVariantKey']);
});
