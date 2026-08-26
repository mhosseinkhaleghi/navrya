import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Instrument Catalog domain (025_instrument_catalog.sql) - mirrors accounts-api-contract.test.mjs's
// shape: ownership isolation, idempotent upsert-by-client-id, and the one real business rule this
// domain exists to enforce (codes unique per user after normalization).

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

test('a request with no auth is rejected', async () => {
  const result = await api('GET', '/api/sync/instrument-catalog');
  assert.equal(result.status, 401);
});

test('POST upserts a catalog entry and GET reassembles it, normalized (trimmed/uppercased)', async () => {
  const user = await createUser('Catalog Trader');
  const created = await api('POST', '/api/sync/instrument-catalog', { userId: user.id, body: { id: 'instr-a', code: '  xauusd  ' } });
  assert.equal(created.status, 200);
  assert.equal(created.body.code, 'XAUUSD');

  const fetched = await api('GET', '/api/sync/instrument-catalog/instr-a', { userId: user.id });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.code, 'XAUUSD');

  const list = await api('GET', '/api/sync/instrument-catalog', { userId: user.id });
  assert.equal(list.body.instrumentCatalog.length, 1);
});

test('an empty or invalid code is rejected, never silently coerced to an empty string entry', async () => {
  const user = await createUser('Invalid Code Trader');
  const empty = await api('POST', '/api/sync/instrument-catalog', { userId: user.id, body: { id: 'instr-empty', code: '   ' } });
  assert.equal(empty.status, 400);
  const tooLong = await api('POST', '/api/sync/instrument-catalog', { userId: user.id, body: { id: 'instr-long', code: 'X'.repeat(40) } });
  assert.equal(tooLong.status, 400);
});

test('re-POSTing the same catalog id is an idempotent upsert, not a duplicate', async () => {
  const user = await createUser('Idempotent Catalog Trader');
  await api('POST', '/api/sync/instrument-catalog', { userId: user.id, body: { id: 'instr-b', code: 'XAUUSD' } });
  const updated = await api('POST', '/api/sync/instrument-catalog', { userId: user.id, body: { id: 'instr-b', code: 'XAUUSD', displayName: 'Gold' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.displayName, 'Gold');
  const list = await api('GET', '/api/sync/instrument-catalog', { userId: user.id });
  assert.equal(list.body.instrumentCatalog.length, 1, 're-upserting the same id must never create a second catalog row');
});

test('a duplicate normalized code (different id, same user) is rejected with INSTRUMENT_ALREADY_EXISTS - codes are unique per user after normalization', async () => {
  const user = await createUser('Duplicate Code Trader');
  await api('POST', '/api/sync/instrument-catalog', { userId: user.id, body: { id: 'instr-c1', code: 'BTCUSDT' } });
  const duplicate = await api('POST', '/api/sync/instrument-catalog', { userId: user.id, body: { id: 'instr-c2', code: 'btcusdt' } });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error, 'INSTRUMENT_ALREADY_EXISTS');
  const list = await api('GET', '/api/sync/instrument-catalog', { userId: user.id });
  assert.equal(list.body.instrumentCatalog.length, 1);
});

test('the same code is never rejected as a duplicate across two different users - the uniqueness rule is per user, not global', async () => {
  const userA = await createUser('User A');
  const userB = await createUser('User B');
  const a = await api('POST', '/api/sync/instrument-catalog', { userId: userA.id, body: { id: 'instr-shared-a', code: 'XAUUSD' } });
  const b = await api('POST', '/api/sync/instrument-catalog', { userId: userB.id, body: { id: 'instr-shared-b', code: 'XAUUSD' } });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
});

test('a catalog entry belonging to another user cannot be fetched, upserted, or deleted', async () => {
  const owner = await createUser('Catalog Owner');
  const stranger = await createUser('Catalog Stranger');
  await api('POST', '/api/sync/instrument-catalog', { userId: owner.id, body: { id: 'instr-d', code: 'XAUUSD' } });

  const strangerFetch = await api('GET', '/api/sync/instrument-catalog/instr-d', { userId: stranger.id });
  assert.equal(strangerFetch.status, 404, "another user's GET by id must not leak someone else's catalog entry");

  const strangerOverwrite = await api('POST', '/api/sync/instrument-catalog', { userId: stranger.id, body: { id: 'instr-d', code: 'BTCUSDT' } });
  assert.equal(strangerOverwrite.status, 403);
  assert.equal(strangerOverwrite.body.error, 'NOT_INSTRUMENT_OWNER');

  const strangerDelete = await api('DELETE', '/api/sync/instrument-catalog/instr-d', { userId: stranger.id });
  assert.equal(strangerDelete.status, 403);
});

test('DELETE removes a catalog entry outright - no archive semantics, since nothing else references its id', async () => {
  const user = await createUser('Catalog Delete Trader');
  await api('POST', '/api/sync/instrument-catalog', { userId: user.id, body: { id: 'instr-e', code: 'XAUUSD' } });
  const deleted = await api('DELETE', '/api/sync/instrument-catalog/instr-e', { userId: user.id });
  assert.equal(deleted.status, 204);
  const list = await api('GET', '/api/sync/instrument-catalog', { userId: user.id });
  assert.equal(list.body.instrumentCatalog.length, 0);
});

test('listByUser returns entries sorted by code', async () => {
  const user = await createUser('Sorted Catalog Trader');
  await api('POST', '/api/sync/instrument-catalog', { userId: user.id, body: { id: 'instr-f1', code: 'XAUUSD' } });
  await api('POST', '/api/sync/instrument-catalog', { userId: user.id, body: { id: 'instr-f2', code: 'BTCUSDT' } });
  const list = await api('GET', '/api/sync/instrument-catalog', { userId: user.id });
  assert.deepEqual(list.body.instrumentCatalog.map((item) => item.code), ['BTCUSDT', 'XAUUSD']);
});

test('all four character pages load instrument-catalog.types.js then instrument-catalog-store.js, after server-replica.js', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(process.cwd(), 'public', 'pages', character, 'index.html'), 'utf8');
    const replicaIndex = html.indexOf('<script src="../shared/server-replica.js">');
    const typesIndex = html.indexOf('<script src="../shared/instrument-catalog.types.js">');
    const storeIndex = html.indexOf('<script src="../shared/instrument-catalog-store.js">');
    assert.ok(replicaIndex > -1 && typesIndex > -1 && storeIndex > -1, character + ': all three scripts present');
    assert.ok(replicaIndex < typesIndex && typesIndex < storeIndex, character + ': loaded in dependency order');
  }
});
