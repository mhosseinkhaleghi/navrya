import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Journey G (AI Companion & Journey Orchestration) - mirrors tests/mental-health-api-contract.
// test.mjs's own shape exactly, since server/community/routes.companion.mjs was deliberately
// built as a 1:1 mirror of routes.mental-health.mjs (see 018_companion_state.sql's comment).
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
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }

function sampleState() {
  return {
    version: 1, lastUpdatedAt: '2026-01-01T00:00:00.000Z',
    walkthroughSeenAt: '2026-01-01T00:00:00.000Z', currentGoal: 'strategies',
    dismissedSteps: { 'journey:intake': '2026-01-01T00:00:00.000Z' },
    snoozedSteps: {}, skippedOptional: ['intake'],
    preferences: { experienceLevel: 'beginner', explanationDepth: 'balanced', teachingPreference: 'example_first', initiativePreference: 'normal', interactionPreference: 'text' }
  };
}

test('a request with no x-dev-user-id is rejected with AUTH_SESSION_REQUIRED', async () => {
  const result = await api('GET', '/api/sync/companion-state');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_SESSION_REQUIRED');
});

test('GET returns a null state for a user who has never saved one', async () => {
  const user = await createUser('Hunter Zero');
  const result = await api('GET', '/api/sync/companion-state', { userId: user.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.state, null);
});

test('POST upserts the whole state document and GET reassembles it identically', async () => {
  const user = await createUser('Hunter One');
  const created = await api('POST', '/api/sync/companion-state', { userId: user.id, body: sampleState() });
  assert.equal(created.status, 200);
  assert.equal(created.body.state.currentGoal, 'strategies');
  assert.equal(created.body.state.preferences.experienceLevel, 'beginner');
  assert.deepEqual(created.body.state.skippedOptional, ['intake']);

  const fetched = await api('GET', '/api/sync/companion-state', { userId: user.id });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.state.dismissedSteps['journey:intake'], '2026-01-01T00:00:00.000Z');
});

test('re-POSTing replaces the whole document, not a merge or a second row', async () => {
  const user = await createUser('Hunter Two');
  await api('POST', '/api/sync/companion-state', { userId: user.id, body: sampleState() });

  const changed = sampleState();
  changed.currentGoal = null;
  changed.preferences.initiativePreference = 'low';
  const updated = await api('POST', '/api/sync/companion-state', { userId: user.id, body: changed });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.state.currentGoal, null);

  const fetched = await api('GET', '/api/sync/companion-state', { userId: user.id });
  assert.equal(fetched.body.state.preferences.initiativePreference, 'low', 're-upserting must fully replace the stored document');
});

test('a state document is scoped strictly by the real auth token, never a payload field - a different user sees nothing', async () => {
  const owner = await createUser('Owner');
  const stranger = await createUser('Stranger');
  await api('POST', '/api/sync/companion-state', { userId: owner.id, body: sampleState() });

  const strangerFetch = await api('GET', '/api/sync/companion-state', { userId: stranger.id });
  assert.equal(strangerFetch.status, 200);
  assert.equal(strangerFetch.body.state, null, 'a different real user must never see another user\'s Companion state');
});

test('POSTing a non-object JSON body is rejected (Express\'s own strict JSON parsing refuses a bare top-level primitive before the route\'s own VALIDATION_FAILED check ever runs)', async () => {
  const user = await createUser('Hunter Three');
  const result = await api('POST', '/api/sync/companion-state', { userId: user.id, body: 'not an object' });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'INVALID_JSON');
});
