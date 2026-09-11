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

async function api(method, path, { body, userId, headers } = {}) {
  const reqHeaders = { 'Content-Type': 'application/json', ...(headers || {}) };
  if (userId) Object.assign(reqHeaders, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + path, { method, headers: reqHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function createUser(name) { return repo.users.create({ displayName: name }); }
async function createAdmin(name) {
  const user = await repo.users.create({ displayName: name });
  return repo.users.update(user.id, { role: 'admin' });
}

test('a request with no session is rejected with AUTH_SESSION_REQUIRED', async () => {
  const list = await api('GET', '/api/sync/support-tickets');
  assert.equal(list.status, 401);
  assert.equal(list.body.error, 'AUTH_SESSION_REQUIRED');
});

test('create, list, read (marks read), reply, and close a ticket the caller owns', async () => {
  const user = await createUser('Owner1');
  const created = await api('POST', '/api/sync/support-tickets', { userId: user.id, body: { subject: 'Cannot log in', category: 'account', message: 'My reset link expired.' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'open');
  assert.equal(created.body.unread, false);

  const list = await api('GET', '/api/sync/support-tickets', { userId: user.id });
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].id, created.body.id);

  const detail = await api('GET', `/api/sync/support-tickets/${created.body.id}`, { userId: user.id });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.messages.length, 1);
  assert.equal(detail.body.messages[0].authorRole, 'user');
  assert.equal(detail.body.messages[0].authorName, 'Owner1');

  const reply = await api('POST', `/api/sync/support-tickets/${created.body.id}/messages`, { userId: user.id, body: { message: 'Any update?' } });
  assert.equal(reply.status, 201);
  assert.equal(reply.body.ticket.status, 'open');
  assert.equal(reply.body.message.authorRole, 'user');

  const closed = await api('POST', `/api/sync/support-tickets/${created.body.id}/close`, { userId: user.id });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.status, 'closed');

  const closedAgain = await api('POST', `/api/sync/support-tickets/${created.body.id}/close`, { userId: user.id });
  assert.equal(closedAgain.status, 409);
  assert.equal(closedAgain.body.error, 'ALREADY_CLOSED');

  const replyAfterClose = await api('POST', `/api/sync/support-tickets/${created.body.id}/messages`, { userId: user.id, body: { message: 'one more' } });
  assert.equal(replyAfterClose.status, 409);
  assert.equal(replyAfterClose.body.error, 'TICKET_CLOSED');
});

test('a second normal user gets a safe denial (403) for another user\'s ticket - read, reply, and close', async () => {
  const owner = await createUser('Owner2');
  const stranger = await createUser('Stranger2');
  const created = await api('POST', '/api/sync/support-tickets', { userId: owner.id, body: { subject: 'Private', category: 'other', message: 'hello' } });

  const readDenied = await api('GET', `/api/sync/support-tickets/${created.body.id}`, { userId: stranger.id });
  assert.equal(readDenied.status, 403);
  assert.equal(readDenied.body.error, 'NOT_TICKET_OWNER');

  const replyDenied = await api('POST', `/api/sync/support-tickets/${created.body.id}/messages`, { userId: stranger.id, body: { message: 'butting in' } });
  assert.equal(replyDenied.status, 403);

  const closeDenied = await api('POST', `/api/sync/support-tickets/${created.body.id}/close`, { userId: stranger.id });
  assert.equal(closeDenied.status, 403);

  const nonexistent = await api('GET', '/api/sync/support-tickets/does-not-exist', { userId: stranger.id });
  assert.equal(nonexistent.status, 404);
  assert.equal(nonexistent.body.error, 'TICKET_NOT_FOUND');
});

test('validation: blank/oversized subject and message are rejected server-side', async () => {
  const user = await createUser('Validator');
  const blankSubject = await api('POST', '/api/sync/support-tickets', { userId: user.id, body: { subject: '   ', category: 'technical', message: 'hi' } });
  assert.equal(blankSubject.status, 400);
  const longSubject = await api('POST', '/api/sync/support-tickets', { userId: user.id, body: { subject: 'x'.repeat(161), category: 'technical', message: 'hi' } });
  assert.equal(longSubject.status, 400);
  const badCategory = await api('POST', '/api/sync/support-tickets', { userId: user.id, body: { subject: 'ok', category: 'nonsense', message: 'hi' } });
  assert.equal(badCategory.status, 400);
  const longMessage = await api('POST', '/api/sync/support-tickets', { userId: user.id, body: { subject: 'ok', category: 'technical', message: 'x'.repeat(5001) } });
  assert.equal(longMessage.status, 400);
});

test('CSRF: a state-changing request with a valid session but no/incorrect CSRF token is rejected', async () => {
  const user = await createUser('CsrfUser');
  const { Cookie } = await authHeadersFor(repo, user.id);
  const response = await fetch(baseUrl + '/api/sync/support-tickets', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie }, // no x-csrf-token
    body: JSON.stringify({ subject: 'x', category: 'technical', message: 'hi' })
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, 'CSRF_TOKEN_MISSING');
});

test('rate limiting: exceeding the ticket-creation limit returns 429', async () => {
  const user = await createUser('RateLimited');
  let sawLimited = false;
  for (let i = 0; i < 12; i += 1) {
    const result = await api('POST', '/api/sync/support-tickets', { userId: user.id, body: { subject: 'Ticket ' + i, category: 'other', message: 'msg ' + i } });
    if (result.status === 429) { sawLimited = true; break; }
  }
  assert.ok(sawLimited, 'the 11th ticket within the window must be rate-limited (max 10 per 15 minutes)');
});

test('notifications summary: reflects a staff reply and clears on open; supportAwaitingStaffCount is absent for a non-admin', async () => {
  const user = await createUser('BadgeUser');
  const admin = await createAdmin('BadgeAdmin');
  const created = await api('POST', '/api/sync/support-tickets', { userId: user.id, body: { subject: 'Badge test', category: 'technical', message: 'hi' } });

  const beforeReply = await api('GET', '/api/sync/notifications/summary', { userId: user.id });
  assert.equal(beforeReply.body.supportUnread, 0);
  assert.equal(beforeReply.body.supportAwaitingStaffCount, null, 'a non-admin never sees the shared awaiting-staff count');

  const adminReply = await api('POST', `/api/admin/support-tickets/${created.body.id}/messages`, { userId: admin.id, body: { message: 'We are on it.' } });
  assert.equal(adminReply.status, 201);

  const afterReply = await api('GET', '/api/sync/notifications/summary', { userId: user.id });
  assert.equal(afterReply.body.supportUnread, 1, 'a staff reply must increment the ticket owner\'s unread-support badge');

  await api('GET', `/api/sync/support-tickets/${created.body.id}`, { userId: user.id }); // opening the ticket marks it read
  const afterOpen = await api('GET', '/api/sync/notifications/summary', { userId: user.id });
  assert.equal(afterOpen.body.supportUnread, 0, 'opening the ticket must clear the owner\'s unread-support count');

  const adminSummary = await api('GET', '/api/sync/notifications/summary', { userId: admin.id });
  assert.equal(typeof adminSummary.body.supportAwaitingStaffCount, 'number', 'an admin does see the shared awaiting-staff count on the same canonical endpoint');
});

test('community ack: acknowledging clears the caller\'s own community badge and never conflates it with the support badge', async () => {
  const me = await createUser('AckUser');
  const other = await createUser('AckOther');
  // Prime the cursor first (this user's first-ever lookup) - otherwise the post below would be
  // "historic" relative to that first lookup and correctly not count, per the same rule verified
  // in tests/support-tickets-repo-memory.test.mjs.
  await api('GET', '/api/sync/notifications/summary', { userId: me.id });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await api('POST', '/api/community/posts', { userId: other.id, body: { content: 'hello everyone' } });

  const summary = await api('GET', '/api/sync/notifications/summary', { userId: me.id });
  assert.equal(summary.body.communityUnread, 1);
  assert.equal(summary.body.supportUnread, 0, 'community activity must never bleed into the support count');

  const ack = await api('POST', '/api/sync/notifications/community/ack', { userId: me.id });
  assert.equal(ack.status, 200);

  const afterAck = await api('GET', '/api/sync/notifications/summary', { userId: me.id });
  assert.equal(afterAck.body.communityUnread, 0);
});
