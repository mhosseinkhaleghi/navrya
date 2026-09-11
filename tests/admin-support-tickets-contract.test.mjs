import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Admin Support Tickets queue/reply surface - same real-HTTP-over-a-real-memory-repo shape as
// tests/admin-reports-contract.test.mjs.

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

async function createUser(name, email) { return repo.users.create({ displayName: name, email }); }
async function createAdmin(name) {
  const user = await repo.users.create({ displayName: name });
  return repo.users.update(user.id, { role: 'admin' });
}

test('a non-admin cannot use any admin ticket endpoint - fails closed like every other /api/admin route', async () => {
  const user = await createUser('NonAdmin', 'nonadmin@example.com');
  const ticket = await repo.supportTickets.create({ userId: user.id, subject: 'x', category: 'other', content: 'hi' });

  const list = await api('GET', '/api/admin/support-tickets', { userId: user.id });
  assert.equal(list.status, 403);
  const detail = await api('GET', `/api/admin/support-tickets/${ticket.id}`, { userId: user.id });
  assert.equal(detail.status, 403);
  const reply = await api('POST', `/api/admin/support-tickets/${ticket.id}/messages`, { userId: user.id, body: { message: 'nope' } });
  assert.equal(reply.status, 403);
  const status = await api('PATCH', `/api/admin/support-tickets/${ticket.id}/status`, { userId: user.id, body: { status: 'resolved' } });
  assert.equal(status.status, 403);
});

test('an admin can list, search by subject/email/id, and filter by status/category', async () => {
  const admin = await createAdmin('QueueAdmin');
  const alice = await createUser('Alice Trader', 'alice@example.com');
  const bob = await createUser('Bob Trader', 'bob@example.com');
  const t1 = await repo.supportTickets.create({ userId: alice.id, subject: 'Cannot withdraw funds', category: 'billing', content: 'help' });
  await repo.supportTickets.create({ userId: bob.id, subject: 'Chart is frozen', category: 'technical', content: 'help' });

  const all = await api('GET', '/api/admin/support-tickets', { userId: admin.id });
  assert.equal(all.status, 200);
  const allIds = all.body.tickets.map((t) => t.id);
  assert.ok(allIds.includes(t1.id), 'the unfiltered list must include every ticket, not just this test\'s own');

  const bySubject = await api('GET', '/api/admin/support-tickets?search=withdraw', { userId: admin.id });
  assert.equal(bySubject.body.total, 1);
  assert.equal(bySubject.body.tickets[0].id, t1.id);

  const byEmail = await api('GET', '/api/admin/support-tickets?search=alice%40example.com', { userId: admin.id });
  assert.equal(byEmail.body.total, 1);
  assert.equal(byEmail.body.tickets[0].ownerEmail, 'alice@example.com');

  const byId = await api('GET', `/api/admin/support-tickets?search=${t1.id}`, { userId: admin.id });
  assert.equal(byId.body.total, 1);

  const byCategory = await api('GET', '/api/admin/support-tickets?category=billing', { userId: admin.id });
  assert.equal(byCategory.body.total, 1);
  assert.equal(byCategory.body.tickets[0].category, 'billing');

  const byStatus = await api('GET', '/api/admin/support-tickets?status=open', { userId: admin.id });
  assert.ok(byStatus.body.tickets.every((t) => t.awaitingStaff === true), 'every status=open row must be marked awaitingStaff');
  assert.ok(byStatus.body.tickets.some((t) => t.id === t1.id), 'both fresh tickets are open, awaiting staff');
});

test('an admin can open a full conversation, reply as staff, and transition status - each action is audit-logged', async () => {
  const admin = await createAdmin('ReplyAdmin');
  const user = await createUser('Conversant', 'conversant@example.com');
  const ticket = await repo.supportTickets.create({ userId: user.id, subject: 'Need help', category: 'technical', content: 'It is broken.' });

  const detail = await api('GET', `/api/admin/support-tickets/${ticket.id}`, { userId: admin.id });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.messages.length, 1);
  assert.equal(detail.body.ticket.ownerEmail, 'conversant@example.com');

  const reply = await api('POST', `/api/admin/support-tickets/${ticket.id}/messages`, { userId: admin.id, body: { message: 'Looking into it now.' } });
  assert.equal(reply.status, 201);
  assert.equal(reply.body.message.authorRole, 'staff');
  assert.equal(reply.body.ticket.status, 'waiting_user');

  const resolve = await api('PATCH', `/api/admin/support-tickets/${ticket.id}/status`, { userId: admin.id, body: { status: 'resolved' } });
  assert.equal(resolve.status, 200);
  assert.equal(resolve.body.status, 'resolved');

  const badStatus = await api('PATCH', `/api/admin/support-tickets/${ticket.id}/status`, { userId: admin.id, body: { status: 'not-a-real-status' } });
  assert.equal(badStatus.status, 400);

  const auditLog = await repo.auditLog.list({ limit: 20 });
  const replyEntry = auditLog.find((e) => e.action === 'support-ticket.reply' && e.targetId === ticket.id);
  const statusEntry = auditLog.find((e) => e.action === 'support-ticket.status' && e.targetId === ticket.id);
  assert.ok(replyEntry, 'a staff reply must write an admin_audit_log row');
  assert.equal(replyEntry.adminUserId, admin.id);
  assert.ok(statusEntry, 'a status transition must write an admin_audit_log row');
});

test('a staff reply can resolve/close in the same action via nextStatus, and a closed ticket can be reopened by an explicit status change', async () => {
  const admin = await createAdmin('ResolveAdmin');
  const user = await createUser('ResolveUser', 'resolveuser@example.com');
  const ticket = await repo.supportTickets.create({ userId: user.id, subject: 'Quick', category: 'other', content: 'x' });

  const reply = await api('POST', `/api/admin/support-tickets/${ticket.id}/messages`, { userId: admin.id, body: { message: 'Fixed.', nextStatus: 'closed' } });
  assert.equal(reply.body.ticket.status, 'closed');

  const reopen = await api('PATCH', `/api/admin/support-tickets/${ticket.id}/status`, { userId: admin.id, body: { status: 'open' } });
  assert.equal(reopen.status, 200);
  assert.equal(reopen.body.status, 'open');
});

test('a nonexistent ticket id is a real 404 for every admin endpoint', async () => {
  const admin = await createAdmin('NotFoundAdmin');
  const detail = await api('GET', '/api/admin/support-tickets/does-not-exist', { userId: admin.id });
  assert.equal(detail.status, 404);
  const status = await api('PATCH', '/api/admin/support-tickets/does-not-exist/status', { userId: admin.id, body: { status: 'resolved' } });
  assert.equal(status.status, 404);
});
