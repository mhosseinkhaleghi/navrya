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
async function createUser(name) { return repo.users.create({ displayName: name }); }

test('a request with no x-dev-user-id is rejected with AUTH_SESSION_REQUIRED', async () => {
  const result = await api('GET', '/api/sync/preferences');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_SESSION_REQUIRED');
});

test('a brand-new account has no preferences at all - never a fabricated default row', async () => {
  const user = await createUser('Fresh User');
  const list = await api('GET', '/api/sync/preferences', { userId: user.id });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.preferences, []);
});

test('POST upserts one preference by key and GET lists it back, with a real jsonb value (not just a number)', async () => {
  const user = await createUser('Pref User');
  const created = await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'similarityThreshold', value: 70 } });
  assert.equal(created.status, 200);
  assert.equal(created.body.id, 'similarityThreshold');
  assert.equal(created.body.value, 70);
  assert.ok(created.body.updatedAt);

  const objectValue = await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'panelLayout', value: { collapsed: true, order: ['dashboard', 'sessions'] } } });
  assert.equal(objectValue.status, 200);
  assert.deepEqual(objectValue.body.value, { collapsed: true, order: ['dashboard', 'sessions'] });

  const list = await api('GET', '/api/sync/preferences', { userId: user.id });
  assert.equal(list.body.preferences.length, 2);
});

test('re-POSTing the same key overwrites the value, never creates a second row for that key', async () => {
  const user = await createUser('Overwrite User');
  await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'similarityThreshold', value: 70 } });
  await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'similarityThreshold', value: 85 } });
  const list = await api('GET', '/api/sync/preferences', { userId: user.id });
  assert.equal(list.body.preferences.length, 1);
  assert.equal(list.body.preferences[0].value, 85);
});

test("changing one preference never touches a different key written moments earlier - the whole point of a per-key upsert instead of a whole-document write", async () => {
  const user = await createUser('Multi Key User');
  await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'similarityThreshold', value: 70 } });
  await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'language', value: 'fa' } });
  await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'similarityThreshold', value: 90 } });

  const list = await api('GET', '/api/sync/preferences', { userId: user.id });
  const byKey = Object.fromEntries(list.body.preferences.map((row) => [row.id, row.value]));
  assert.equal(byKey.similarityThreshold, 90);
  assert.equal(byKey.language, 'fa', 'unrelated key must survive a different key being updated');
});

test("one user's preferences are completely invisible to another - a composite (user_id, pref_key) key, not a shared row", async () => {
  const userA = await createUser('User A');
  const userB = await createUser('User B');
  await api('POST', '/api/sync/preferences', { userId: userA.id, body: { id: 'similarityThreshold', value: 30 } });
  await api('POST', '/api/sync/preferences', { userId: userB.id, body: { id: 'similarityThreshold', value: 95 } });

  const listA = await api('GET', '/api/sync/preferences', { userId: userA.id });
  const listB = await api('GET', '/api/sync/preferences', { userId: userB.id });
  assert.equal(listA.body.preferences.length, 1);
  assert.equal(listA.body.preferences[0].value, 30);
  assert.equal(listB.body.preferences.length, 1);
  assert.equal(listB.body.preferences[0].value, 95);
});

test('DELETE resets one preference to its client-side default by removing the row entirely, never storing an explicit null', async () => {
  const user = await createUser('Reset User');
  await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'similarityThreshold', value: 70 } });
  const deleted = await api('DELETE', '/api/sync/preferences/similarityThreshold', { userId: user.id });
  assert.equal(deleted.status, 204);
  const list = await api('GET', '/api/sync/preferences', { userId: user.id });
  assert.equal(list.body.preferences.length, 0);
});

test('DELETE accepts validated language and character keys without requiring a value', async () => {
  const user = await createUser('Preference Reset User');
  await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'language', value: 'es' } });
  await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'character', value: 'sage' } });
  assert.equal((await api('DELETE', '/api/sync/preferences/language', { userId: user.id })).status, 204);
  assert.equal((await api('DELETE', '/api/sync/preferences/character', { userId: user.id })).status, 204);
});

test('POST with no id is rejected with VALIDATION_FAILED', async () => {
  const user = await createUser('Bad Request User');
  const result = await api('POST', '/api/sync/preferences', { userId: user.id, body: { value: 70 } });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'VALIDATION_FAILED');
});

test('preference keys, values, and the language enum are bounded and validated before persistence', async () => {
  const user = await createUser('Validated Preference User');
  const invalidKey = await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'language;drop', value: 'en' } });
  const invalidLanguage = await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'language', value: '<script>' } });
  const invalidCharacter = await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'character', value: 'admin' } });
  const oversized = await api('POST', '/api/sync/preferences', { userId: user.id, body: { id: 'panelLayout', value: 'x'.repeat(16 * 1024) } });
  [invalidKey, invalidLanguage, invalidCharacter, oversized].forEach((result) => {
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'VALIDATION_FAILED');
  });
});
