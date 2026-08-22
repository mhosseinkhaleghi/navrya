import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { testToken } from './helpers/auth-token.mjs';

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

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) headers['x-dev-user-id'] = testToken(userId);
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }

function sampleSignature(id, sessionId) {
  return {
    id, sessionId, character: 'hunter', market: 'London', timeframe: '5m', date: '2026-01-01',
    movementSequence: [{ orderIndex: 0, direction: 'up', magnitude: 'medium' }],
    patternIds: ['pattern-1'], strategyIds: ['strategy-1'],
    scenarioOutcomes: [{ patternId: 'pattern-1', occurred: true }],
    tradeSummary: { count: 1, wins: 1, losses: 0, netPnl: 25 },
    fateSummaryText: 'Closed strong after the London open sweep.'
  };
}

test('a request with no x-dev-user-id is rejected with AUTH_TOKEN_REQUIRED', async () => {
  const result = await api('GET', '/api/sync/session-signatures');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_TOKEN_REQUIRED');
});

test('POST upserts a full signature and GET lists it back identically', async () => {
  const user = await createUser('Hunter One');
  const created = await api('POST', '/api/sync/session-signatures', { userId: user.id, body: sampleSignature('sig-a', 'session-a') });
  assert.equal(created.status, 200);
  assert.equal(created.body.id, 'sig-a');
  assert.equal(created.body.sessionId, 'session-a');
  assert.deepEqual(created.body.movementSequence, sampleSignature('sig-a', 'session-a').movementSequence);
  assert.deepEqual(created.body.tradeSummary, { count: 1, wins: 1, losses: 0, netPnl: 25 });

  const list = await api('GET', '/api/sync/session-signatures', { userId: user.id });
  assert.equal(list.status, 200);
  assert.equal(list.body.signatures.length, 1);
  assert.equal(list.body.signatures[0].fateSummaryText, 'Closed strong after the London open sweep.');
});

test('re-POSTing the same id is an idempotent upsert, not a duplicate', async () => {
  const user = await createUser('Hunter Two');
  await api('POST', '/api/sync/session-signatures', { userId: user.id, body: sampleSignature('sig-b', 'session-b') });
  const changed = sampleSignature('sig-b', 'session-b');
  changed.fateSummaryText = 'Updated summary after re-analysis.';
  const updated = await api('POST', '/api/sync/session-signatures', { userId: user.id, body: changed });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.fateSummaryText, 'Updated summary after re-analysis.');

  const list = await api('GET', '/api/sync/session-signatures', { userId: user.id });
  assert.equal(list.body.signatures.length, 1, 're-upserting the same id must never create a second row');
});

test('a signature belonging to another user cannot be overwritten or deleted - the real ownership check, not a silent no-op', async () => {
  const owner = await createUser('Owner');
  const stranger = await createUser('Stranger');
  await api('POST', '/api/sync/session-signatures', { userId: owner.id, body: sampleSignature('sig-c', 'session-c') });

  const strangerOverwrite = await api('POST', '/api/sync/session-signatures', { userId: stranger.id, body: sampleSignature('sig-c', 'session-c') });
  assert.equal(strangerOverwrite.status, 403);
  assert.equal(strangerOverwrite.body.error, 'NOT_SIGNATURE_OWNER');

  const strangerDelete = await api('DELETE', '/api/sync/session-signatures/sig-c', { userId: stranger.id });
  assert.equal(strangerDelete.status, 403);

  // The owner's row must be completely untouched by the rejected stranger attempt above - this
  // is the exact bug an ON CONFLICT DO UPDATE with no ownership pre-check would have caused.
  const list = await api('GET', '/api/sync/session-signatures', { userId: owner.id });
  assert.equal(list.body.signatures.length, 1);
  assert.equal(list.body.signatures[0].fateSummaryText, sampleSignature('sig-c', 'session-c').fateSummaryText);
});

test('DELETE removes the signature', async () => {
  const user = await createUser('Hunter Three');
  await api('POST', '/api/sync/session-signatures', { userId: user.id, body: sampleSignature('sig-d', 'session-d') });
  const deleted = await api('DELETE', '/api/sync/session-signatures/sig-d', { userId: user.id });
  assert.equal(deleted.status, 204);
  const list = await api('GET', '/api/sync/session-signatures', { userId: user.id });
  assert.equal(list.body.signatures.length, 0);
});

test('a signature with no id or no sessionId is rejected with VALIDATION_FAILED', async () => {
  const user = await createUser('Hunter Four');
  const noId = await api('POST', '/api/sync/session-signatures', { userId: user.id, body: { sessionId: 'session-e' } });
  assert.equal(noId.status, 400);
  assert.equal(noId.body.error, 'VALIDATION_FAILED');
  const noSessionId = await api('POST', '/api/sync/session-signatures', { userId: user.id, body: { id: 'sig-e' } });
  assert.equal(noSessionId.status, 400);
});
