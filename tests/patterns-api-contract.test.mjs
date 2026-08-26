import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

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
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}
async function createUser(name) {
  return repo.users.create({ displayName: name });
}
// Instrument Catalog domain: a brand-new pattern now requires a real, cataloged instrument.
async function seedInstrument(userId, code = 'XAUUSD') {
  return repo.instrumentCatalog.upsert(userId, { id: 'instr-' + userId + '-' + code, code });
}

function samplePattern(id) {
  return {
    id, name: 'UTAD WYCKOF', description: 'Wyckoff UTAD structure', completionThreshold: 70, usageCount: 3, isPublic: false,
    instruments: ['XAUUSD'],
    stages: [
      { id: id + '-stage-1', order: 1, text: 'Strong spike move' },
      { id: id + '-stage-2', order: 2, text: 'Counter-direction accumulation' }
    ],
    referenceScreenshots: [
      { id: id + '-shot-1', fileName: 'chart.png', blobId: 'blob-1', uploadedAt: '2026-01-01T00:00:00.000Z', note: 'entry zone' }
    ],
    chatHistory: [
      { id: id + '-msg-1', role: 'user', content: 'how many stages?', createdAt: '2026-01-01T00:01:00.000Z' },
      { id: id + '-msg-2', role: 'assistant', content: 'four stages', createdAt: '2026-01-01T00:02:00.000Z', suggestedStages: [{ id: 'x', order: 1, text: 'a' }] }
    ]
  };
}

test('a request with no x-dev-user-id is rejected with AUTH_SESSION_REQUIRED', async () => {
  const result = await api('GET', '/api/sync/patterns');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_SESSION_REQUIRED');
});

test('POST upserts a full nested pattern (stages + screenshots + chat history) and GET reassembles it identically', async () => {
  const user = await createUser('Hunter One');
  await seedInstrument(user.id);
  const created = await api('POST', '/api/sync/patterns', { userId: user.id, body: samplePattern('pattern-a') });
  assert.equal(created.status, 200);
  assert.equal(created.body.stages.length, 2);
  assert.equal(created.body.stages[0].text, 'Strong spike move');
  assert.equal(created.body.referenceScreenshots.length, 1);
  assert.equal(created.body.chatHistory.length, 2);
  assert.deepEqual(created.body.chatHistory[1].suggestedStages, [{ id: 'x', order: 1, text: 'a' }]);

  const fetched = await api('GET', '/api/sync/patterns/pattern-a', { userId: user.id });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.name, 'UTAD WYCKOF');

  const list = await api('GET', '/api/sync/patterns', { userId: user.id });
  assert.equal(list.body.patterns.length, 1);
});

test('re-POSTing the same pattern id is an idempotent upsert, not a duplicate, and fully replaces stages/screenshots/chat', async () => {
  const user = await createUser('Hunter Two');
  await seedInstrument(user.id);
  await api('POST', '/api/sync/patterns', { userId: user.id, body: samplePattern('pattern-b') });

  const changed = samplePattern('pattern-b');
  changed.usageCount = 9;
  changed.stages.push({ id: 'pattern-b-stage-3', order: 3, text: 'Distribution' });
  const updated = await api('POST', '/api/sync/patterns', { userId: user.id, body: changed });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.usageCount, 9);
  assert.equal(updated.body.stages.length, 3);

  const list = await api('GET', '/api/sync/patterns', { userId: user.id });
  assert.equal(list.body.patterns.length, 1, 're-upserting the same id must never create a second pattern record');
});

test('a pattern belonging to another user cannot be fetched, upserted, or deleted', async () => {
  const owner = await createUser('Owner');
  const stranger = await createUser('Stranger');
  await seedInstrument(owner.id);
  await api('POST', '/api/sync/patterns', { userId: owner.id, body: samplePattern('pattern-c') });

  const strangerFetch = await api('GET', '/api/sync/patterns/pattern-c', { userId: stranger.id });
  assert.equal(strangerFetch.status, 404);

  const strangerOverwrite = await api('POST', '/api/sync/patterns', { userId: stranger.id, body: samplePattern('pattern-c') });
  assert.equal(strangerOverwrite.status, 403);
  assert.equal(strangerOverwrite.body.error, 'NOT_PATTERN_OWNER');

  const strangerDelete = await api('DELETE', '/api/sync/patterns/pattern-c', { userId: stranger.id });
  assert.equal(strangerDelete.status, 403);
});

// ---- Instrument Catalog domain ----

test('a brand-new pattern with an empty instruments array is rejected with PATTERN_INSTRUMENT_REQUIRED', async () => {
  const user = await createUser('No Instrument Pattern');
  await seedInstrument(user.id);
  const body = samplePattern('pattern-no-instruments');
  body.instruments = [];
  const result = await api('POST', '/api/sync/patterns', { userId: user.id, body });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'PATTERN_INSTRUMENT_REQUIRED');
});

test('a brand-new pattern whose instrument is not in the user\'s own catalog is rejected with INSTRUMENT_NOT_IN_CATALOG', async () => {
  const user = await createUser('Uncataloged Instrument Pattern');
  // Deliberately no seedInstrument() call.
  const result = await api('POST', '/api/sync/patterns', { userId: user.id, body: samplePattern('pattern-uncataloged') });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'INSTRUMENT_NOT_IN_CATALOG');
});

test('editing an already-existing pattern never gets retroactively forced to keep an instrument assigned', async () => {
  const user = await createUser('Legacy Pattern Editor');
  await seedInstrument(user.id);
  const created = await api('POST', '/api/sync/patterns', { userId: user.id, body: samplePattern('pattern-legacy-instrument') });
  assert.equal(created.status, 200);
  const edited = samplePattern('pattern-legacy-instrument');
  edited.instruments = [];
  edited.usageCount = 9;
  const result = await api('POST', '/api/sync/patterns', { userId: user.id, body: edited });
  assert.equal(result.status, 200, 'clearing instruments on an edit of a pre-existing pattern must never be rejected');
});

test('DELETE removes the pattern and its child rows', async () => {
  const user = await createUser('Hunter Three');
  await seedInstrument(user.id);
  await api('POST', '/api/sync/patterns', { userId: user.id, body: samplePattern('pattern-d') });
  const deleted = await api('DELETE', '/api/sync/patterns/pattern-d', { userId: user.id });
  assert.equal(deleted.status, 204);
  const list = await api('GET', '/api/sync/patterns', { userId: user.id });
  assert.equal(list.body.patterns.length, 0);
});

test('POST /api/sync/patterns/images uploads a base64 screenshot under the pattern category', async () => {
  const user = await createUser('Hunter Four');
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const result = await api('POST', '/api/sync/patterns/images', { userId: user.id, body: { dataUrl: `data:image/png;base64,${tinyPng}` } });
  assert.equal(result.status, 201);
  assert.match(result.body.url, /^\/uploads\/pattern\/img-.+\.png$/);
});
