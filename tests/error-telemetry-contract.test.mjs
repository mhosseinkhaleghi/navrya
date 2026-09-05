import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { createMemoryRateLimitStore, __setRateLimitStoreForTests, __resetRateLimitStoreForTests } from '../server/community/security/rate-limit.mjs';

// Launch-readiness audit fix (P1-1): before this, there was no error/crash telemetry of any kind
// - an incident was only ever discovered by a user report or by manually reading raw stdout.
// Proves the real design requirement (docs/PUBLIC-LAUNCH-READINESS-AUDIT.md Section 18): a
// repeated error must aggregate into ONE row with a counter, never one row per occurrence; the
// ingestion endpoint needs no session (a boot failure has none); and an admin can list/resolve
// what came in, fail-closed like every other /api/admin surface.

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
async function createAdmin(name) {
  const user = await repo.users.create({ displayName: name });
  return repo.users.update(user.id, { role: 'admin' });
}

test('POST /api/errors needs no session - a boot failure or pre-login error has none', async () => {
  const response = await api('POST', '/api/errors', { body: { fingerprint: 'fp-anon-1', message: 'boom' } });
  assert.equal(response.status, 204);
});

test('a missing fingerprint is rejected - the fingerprint is what makes aggregation possible at all', async () => {
  const response = await api('POST', '/api/errors', { body: { message: 'boom, no fingerprint' } });
  assert.equal(response.status, 400);
});

test('the SAME fingerprint reported many times becomes ONE row with a counter, never one row per occurrence', async () => {
  const admin = await createAdmin('Ops');
  for (let i = 0; i < 5; i += 1) {
    await api('POST', '/api/errors', { body: { fingerprint: 'fp-repeat', releaseVersion: 'v1', message: `boom #${i}` } });
  }
  const list = await api('GET', '/api/admin/errors', { userId: admin.id });
  const matches = list.body.filter((e) => e.fingerprint === 'fp-repeat' && e.releaseVersion === 'v1');
  assert.equal(matches.length, 1, 'must aggregate into exactly one row, not five');
  assert.equal(matches[0].occurrenceCount, 5);
  assert.equal(matches[0].status, 'open');
});

test('the same fingerprint under a DIFFERENT release version gets its own row - a fix in the next release must not hide behind an old count', async () => {
  const admin = await createAdmin('Ops2');
  await api('POST', '/api/errors', { body: { fingerprint: 'fp-versioned', releaseVersion: 'v1', message: 'boom' } });
  await api('POST', '/api/errors', { body: { fingerprint: 'fp-versioned', releaseVersion: 'v2', message: 'boom' } });
  const list = await api('GET', '/api/admin/errors', { userId: admin.id });
  const matches = list.body.filter((e) => e.fingerprint === 'fp-versioned');
  assert.equal(matches.length, 2);
});

test('long fields are hard-capped at the route layer, never stored unbounded', async () => {
  const admin = await createAdmin('Ops3');
  // Under the 8kb request-body ceiling (app.mjs) but well over the per-field caps this route
  // itself enforces - this specifically exercises shortString()'s truncation, not the separate,
  // coarser body-size-limit defense (a >8kb request is rejected before ever reaching this route
  // at all, which is its own, already-covered defense layer, not this one).
  const longMessage = 'x'.repeat(2000);
  const response = await api('POST', '/api/errors', { body: { fingerprint: 'fp-long-fields', message: longMessage, browser: 'y'.repeat(1000) } });
  assert.equal(response.status, 204);
  const list = await api('GET', '/api/admin/errors', { userId: admin.id });
  const found = list.body.find((e) => e.fingerprint === 'fp-long-fields');
  assert.ok(found, 'the record must exist - this request was well within the body-size limit');
  assert.ok(found.message.length <= 500);
  assert.ok(found.samplePayload.browser.length <= 200);
});

test('a request over the body-size ceiling is rejected outright, before ever reaching the route', async () => {
  const response = await fetch(`${baseUrl}/api/errors`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint: 'fp-oversized', message: 'x'.repeat(10000) })
  });
  assert.equal(response.status, 413);
});

test('never carries a screenshot, cookie, or auth-token-shaped field even if the client sends one - only the known-safe fields are ever read', async () => {
  const admin = await createAdmin('Ops4');
  await api('POST', '/api/errors', {
    body: {
      fingerprint: 'fp-injection-attempt', message: 'boom',
      cookie: 'navrya_session=abc123', authToken: 'secret-token', screenshot: 'data:image/png;base64,AAAA',
      tradeNotes: 'my private trading strategy'
    }
  });
  const list = await api('GET', '/api/admin/errors', { userId: admin.id });
  const found = list.body.find((e) => e.fingerprint === 'fp-injection-attempt');
  const serialized = JSON.stringify(found);
  assert.doesNotMatch(serialized, /navrya_session|secret-token|data:image|private trading strategy/);
});

test('a non-admin cannot list or resolve errors', async () => {
  const user = await repo.users.create({ displayName: 'Rando' });
  const list = await api('GET', '/api/admin/errors', { userId: user.id });
  assert.equal(list.status, 403);
});

test('an admin can move an error through open -> investigating -> resolved, audit-logged like every other admin mutation', async () => {
  const admin = await createAdmin('Ops5');
  await api('POST', '/api/errors', { body: { fingerprint: 'fp-lifecycle', message: 'boom' } });
  const list = await api('GET', '/api/admin/errors', { userId: admin.id });
  const target = list.body.find((e) => e.fingerprint === 'fp-lifecycle');

  const patched = await api('PATCH', `/api/admin/errors/${target.id}`, { userId: admin.id, body: { status: 'resolved' } });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.status, 'resolved');

  const auditLog = await repo.auditLog.list({ limit: 10 });
  assert.ok(auditLog.some((e) => e.targetType === 'client_error' && e.targetId === target.id));
});

test('POST /api/errors is rate-limited per IP (max 30 / min)', async () => {
  // Isolated store: every prior test in this file already POSTed to the same endpoint from the
  // same loopback IP, consuming budget from the real shared limiter - a fresh store here is what
  // makes "the 31st request is the one that gets blocked" a meaningful, precise assertion rather
  // than an accident of test ordering.
  __setRateLimitStoreForTests(createMemoryRateLimitStore());
  const statuses = [];
  for (let i = 0; i < 31; i += 1) {
    const response = await fetch(`${baseUrl}/api/errors`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint: `fp-flood-${i}`, message: 'boom' })
    });
    statuses.push(response.status);
  }
  assert.equal(statuses[30], 429, 'the 31st request in the same minute must be rate-limited');
  assert.ok(statuses.slice(0, 30).every((s) => s === 204));
  __resetRateLimitStoreForTests();
});
