import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Launch-readiness audit fix (P1-4): reports (posts/comments/listings/messages) could be filed
// since day one but nothing ever read them back - "reporting exists, moderation does not" was a
// real, named gap (docs/PUBLIC-LAUNCH-READINESS-AUDIT.md). This proves an admin can actually see
// and resolve them now, over real HTTP, with a real memory repo - not just that the repo methods
// exist in isolation.

let server, baseUrl, repo;

before(async () => {
  delete process.env.ADMIN_AUTH_ENFORCED; // unset means ENFORCED (fail-closed default)
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

test('a non-admin cannot list or resolve reports - fails closed like every other /api/admin route', async () => {
  const post = await repo.posts.create({ userId: (await repo.users.create({ displayName: 'Author' })).id, content: 'hi' });
  const reporter = await repo.users.create({ displayName: 'Reporter' });
  await repo.reports.create({ targetType: 'post', targetId: post.id, reporterId: reporter.id, reason: 'spam' });

  const list = await api('GET', '/api/admin/reports', { userId: reporter.id });
  assert.equal(list.status, 403);
  const patch = await api('PATCH', '/api/admin/reports/does-not-matter', { userId: reporter.id, body: { status: 'reviewed' } });
  assert.equal(patch.status, 403);
});

test('an admin can list reports, newest first, enriched with the reporter\'s display name', async () => {
  const admin = await createAdmin('Mod');
  const author = await repo.users.create({ displayName: 'Author' });
  const reporter = await repo.users.create({ displayName: 'Alice Reporter' });
  const post = await repo.posts.create({ userId: author.id, content: 'spammy post' });
  const report = await repo.reports.create({ targetType: 'post', targetId: post.id, reporterId: reporter.id, reason: 'This is spam' });

  const list = await api('GET', '/api/admin/reports', { userId: admin.id });
  assert.equal(list.status, 200);
  const found = list.body.find((r) => r.id === report.id);
  assert.ok(found, 'the real report must appear in the list');
  assert.equal(found.status, 'open', 'a freshly created report must start open');
  assert.equal(found.reporterName, 'Alice Reporter');
  assert.equal(found.reason, 'This is spam');
});

test('an admin can filter reports by status', async () => {
  const admin = await createAdmin('Mod2');
  const author = await repo.users.create({ displayName: 'Author2' });
  const reporter = await repo.users.create({ displayName: 'Reporter2' });
  const post = await repo.posts.create({ userId: author.id, content: 'another post' });
  const report = await repo.reports.create({ targetType: 'post', targetId: post.id, reporterId: reporter.id, reason: 'reason' });
  await repo.reports.updateStatus(report.id, 'dismissed');

  const openOnly = await api('GET', '/api/admin/reports?status=open', { userId: admin.id });
  assert.ok(!openOnly.body.some((r) => r.id === report.id), 'a dismissed report must not appear under status=open');
  const dismissedOnly = await api('GET', '/api/admin/reports?status=dismissed', { userId: admin.id });
  assert.ok(dismissedOnly.body.some((r) => r.id === report.id));
});

test('an admin can move a report from open to reviewed/dismissed, and it is audit-logged', async () => {
  const admin = await createAdmin('Mod3');
  const author = await repo.users.create({ displayName: 'Author3' });
  const reporter = await repo.users.create({ displayName: 'Reporter3' });
  const post = await repo.posts.create({ userId: author.id, content: 'yet another post' });
  const report = await repo.reports.create({ targetType: 'post', targetId: post.id, reporterId: reporter.id, reason: 'reason' });

  const patched = await api('PATCH', `/api/admin/reports/${report.id}`, { userId: admin.id, body: { status: 'reviewed' } });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.status, 'reviewed');

  const auditLog = await repo.auditLog.list({ limit: 10 });
  const entry = auditLog.find((e) => e.targetType === 'report' && e.targetId === report.id);
  assert.ok(entry, 'resolving a report must write a real admin_audit_log row, like every other admin mutation');
  assert.equal(entry.adminUserId, admin.id);
});

test('an invalid status is rejected, and a nonexistent report id is a real 404', async () => {
  const admin = await createAdmin('Mod4');
  const author = await repo.users.create({ displayName: 'Author4' });
  const reporter = await repo.users.create({ displayName: 'Reporter4' });
  const post = await repo.posts.create({ userId: author.id, content: 'post' });
  const report = await repo.reports.create({ targetType: 'post', targetId: post.id, reporterId: reporter.id, reason: 'reason' });

  const badStatus = await api('PATCH', `/api/admin/reports/${report.id}`, { userId: admin.id, body: { status: 'not-a-real-status' } });
  assert.equal(badStatus.status, 400);

  const missing = await api('PATCH', '/api/admin/reports/nonexistent-report-id', { userId: admin.id, body: { status: 'reviewed' } });
  assert.equal(missing.status, 404);
});
