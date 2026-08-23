import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// End-to-end through the real HTTP route (POST /api/users/heartbeat), not just the repo layer
// directly (already covered by admin-repo-memory.test.mjs) - this is what
// public/pages/shared/admin-heartbeat.js actually calls from the browser.
let server, baseUrl, repo;

before(async () => {
  delete process.env.ADMIN_AUTH_ENFORCED;
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
// Admin authorization fails closed by default now (server/admin/auth-admin.mjs) - a caller needs
// a real role='admin' row, not just any identified account.
async function createAdmin(name) {
  const user = await repo.users.create({ displayName: name });
  return repo.users.update(user.id, { role: 'admin' });
}

test('POST /api/users/heartbeat creates a session on the first call, reuses it on a second call, and it shows up as online in the admin Users list', async () => {
  const user = await createUser('Heartbeat Tester');

  const first = await api('POST', '/api/users/heartbeat', { userId: user.id });
  assert.equal(first.status, 200);
  const second = await api('POST', '/api/users/heartbeat', { userId: user.id });
  assert.equal(second.status, 200);

  const sessions = await repo.sessions.listByUser(user.id);
  assert.equal(sessions.length, 1, 'a second heartbeat within the window must not create a duplicate session');

  const admin = await createAdmin('Admin');
  const usersList = await api('GET', '/api/admin/users', { userId: admin.id });
  const row = usersList.body.users.find((u) => u.id === user.id);
  assert.equal(row.isOnline, true);
  assert.ok(row.lastLoginAt);
});

test('a heartbeat with no x-dev-user-id is rejected like every other protected community route', async () => {
  const result = await api('POST', '/api/users/heartbeat');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_SESSION_REQUIRED');
});

test('a session that goes stale (no heartbeat within the sweep threshold) is marked ended on the next admin Users query, not before', async () => {
  const user = await createUser('Stale Tester');
  await api('POST', '/api/users/heartbeat', { userId: user.id });
  const admin = await createAdmin('Admin2');

  // Directly exercises the sweep the admin Users route runs (sessions.sweepStale) with a
  // threshold shorter than real elapsed time, mirroring the same technique used in
  // admin-repo-memory.test.mjs, since the production 135s threshold can't be waited out here.
  await new Promise((resolve) => setTimeout(resolve, 5));
  await repo.sessions.sweepStale(1);

  const usersList = await api('GET', '/api/admin/users', { userId: admin.id });
  const row = usersList.body.users.find((u) => u.id === user.id);
  assert.equal(row.isOnline, false, 'a session ended by the sweep must no longer report as online');
});
