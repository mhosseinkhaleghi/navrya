import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

async function seedUsers(repo, names) {
  const users = [];
  for (const name of names) users.push(await repo.users.create({ displayName: name, email: name.toLowerCase().replace(/\s+/g, '') + '@example.com' }));
  return users;
}

test('supportTickets.create: validates subject/category/content and stores the first message as author_role user', async () => {
  const repo = createMemoryRepo();
  const [user] = await seedUsers(repo, ['Alice']);

  await assert.rejects(() => repo.supportTickets.create({ userId: user.id, subject: '', category: 'technical', content: 'help' }), (e) => e.code === 'VALIDATION_FAILED');
  await assert.rejects(() => repo.supportTickets.create({ userId: user.id, subject: 'x'.repeat(161), category: 'technical', content: 'help' }), (e) => e.code === 'VALIDATION_FAILED');
  await assert.rejects(() => repo.supportTickets.create({ userId: user.id, subject: 'ok', category: 'not-a-category', content: 'help' }), (e) => e.code === 'VALIDATION_FAILED');
  await assert.rejects(() => repo.supportTickets.create({ userId: user.id, subject: 'ok', category: 'technical', content: '   ' }), (e) => e.code === 'VALIDATION_FAILED');
  await assert.rejects(() => repo.supportTickets.create({ userId: user.id, subject: 'ok', category: 'technical', content: 'x'.repeat(5001) }), (e) => e.code === 'VALIDATION_FAILED');

  const ticket = await repo.supportTickets.create({ userId: user.id, subject: 'Cannot log in', category: 'account', content: 'My password reset link expired.' });
  assert.equal(ticket.status, 'open');
  assert.equal(ticket.userId, user.id);
  const messages = await repo.supportTickets.listMessages(ticket.id);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].authorRole, 'user');
  assert.equal(messages[0].content, 'My password reset link expired.');
});

test('state model: staff reply -> waiting_user by default; user reply reopens a resolved ticket to open; closed rejects an ordinary user reply', async () => {
  const repo = createMemoryRepo();
  const [user, staff] = await seedUsers(repo, ['Bob', 'Staff']);
  const ticket = await repo.supportTickets.create({ userId: user.id, subject: 'Billing question', category: 'billing', content: 'Why was I charged twice?' });

  const afterStaffReply = await repo.supportTickets.reply({ ticketId: ticket.id, authorId: staff.id, authorRole: 'staff', content: 'Looking into it now.' });
  assert.equal(afterStaffReply.ticket.status, 'waiting_user');
  assert.equal(afterStaffReply.ticket.ownerUnread, true, 'a staff reply must set ownerUnread');

  const resolved = await repo.supportTickets.updateStatus(ticket.id, 'resolved');
  assert.equal(resolved.status, 'resolved');

  const afterUserReply = await repo.supportTickets.reply({ ticketId: ticket.id, authorId: user.id, authorRole: 'user', content: 'Actually still an issue.' });
  assert.equal(afterUserReply.ticket.status, 'open', 'a user reply to a resolved ticket must reopen it');

  const closed = await repo.supportTickets.close(ticket.id, user.id);
  assert.equal(closed.status, 'closed');
  await assert.rejects(
    () => repo.supportTickets.reply({ ticketId: ticket.id, authorId: user.id, authorRole: 'user', content: 'one more thing' }),
    (e) => e.code === 'TICKET_CLOSED' && e.status === 409
  );

  // The one supported way a closed ticket moves again: an explicit admin status change.
  const reopened = await repo.supportTickets.updateStatus(ticket.id, 'open');
  assert.equal(reopened.status, 'open');
});

test('a staff reply can resolve/close in the same action via nextStatus', async () => {
  const repo = createMemoryRepo();
  const [user, staff] = await seedUsers(repo, ['Carol', 'Staff2']);
  const ticket = await repo.supportTickets.create({ userId: user.id, subject: 'Quick fix', category: 'technical', content: 'Button is broken.' });
  const result = await repo.supportTickets.reply({ ticketId: ticket.id, authorId: staff.id, authorRole: 'staff', content: 'Fixed, please confirm.', nextStatus: 'resolved' });
  assert.equal(result.ticket.status, 'resolved');
});

test('ownership: a non-owner staff-role reply is rejected for the user-role path, and closing requires ownership', async () => {
  const repo = createMemoryRepo();
  const [owner, stranger] = await seedUsers(repo, ['Dave', 'Eve']);
  const ticket = await repo.supportTickets.create({ userId: owner.id, subject: 'My ticket', category: 'other', content: 'hello' });
  await assert.rejects(
    () => repo.supportTickets.reply({ ticketId: ticket.id, authorId: stranger.id, authorRole: 'user', content: 'not mine' }),
    (e) => e.code === 'NOT_TICKET_OWNER' && e.status === 403
  );
  await assert.rejects(() => repo.supportTickets.close(ticket.id, stranger.id), (e) => e.code === 'NOT_TICKET_OWNER' && e.status === 403);
  await assert.rejects(() => repo.supportTickets.close(ticket.id, 'nonexistent-user'), (e) => e.code === 'NOT_TICKET_OWNER' && e.status === 403);
});

test('closing twice is rejected with ALREADY_CLOSED', async () => {
  const repo = createMemoryRepo();
  const [user] = await seedUsers(repo, ['Frank']);
  const ticket = await repo.supportTickets.create({ userId: user.id, subject: 'Done', category: 'other', content: 'thanks' });
  await repo.supportTickets.close(ticket.id, user.id);
  await assert.rejects(() => repo.supportTickets.close(ticket.id, user.id), (e) => e.code === 'ALREADY_CLOSED' && e.status === 409);
});

test('notifications.supportUnreadCountForUser: a staff reply increments it, opening (markRead) clears it', async () => {
  const repo = createMemoryRepo();
  const [user, staff] = await seedUsers(repo, ['Grace', 'Staff3']);
  const ticket = await repo.supportTickets.create({ userId: user.id, subject: 'Need help', category: 'technical', content: 'x' });
  assert.equal(await repo.notifications.supportUnreadCountForUser(user.id), 0);

  await repo.supportTickets.reply({ ticketId: ticket.id, authorId: staff.id, authorRole: 'staff', content: 'On it.' });
  assert.equal(await repo.notifications.supportUnreadCountForUser(user.id), 1, 'a staff reply must increment the owner unread-support count');

  await repo.supportTickets.markRead(ticket.id, user.id);
  assert.equal(await repo.notifications.supportUnreadCountForUser(user.id), 0, 'opening the ticket (markRead) must clear the unread-support count');
});

test('notifications.supportAwaitingStaffCount: a user reply increments it, a staff reply/status transition decrements it, correctly', async () => {
  const repo = createMemoryRepo();
  const [user, staff] = await seedUsers(repo, ['Henry', 'Staff4']);
  const before = await repo.notifications.supportAwaitingStaffCount();
  const ticket = await repo.supportTickets.create({ userId: user.id, subject: 'Queue test', category: 'technical', content: 'x' });
  assert.equal(await repo.notifications.supportAwaitingStaffCount(), before + 1, 'a new ticket starts open, awaiting staff');

  await repo.supportTickets.reply({ ticketId: ticket.id, authorId: staff.id, authorRole: 'staff', content: 'Replying.' });
  assert.equal(await repo.notifications.supportAwaitingStaffCount(), before, 'a staff reply (default waiting_user) must decrement the shared awaiting-staff count');

  await repo.supportTickets.reply({ ticketId: ticket.id, authorId: user.id, authorRole: 'user', content: 'Still broken.' });
  assert.equal(await repo.notifications.supportAwaitingStaffCount(), before + 1, 'a user reply must increment the shared awaiting-staff count again');

  await repo.supportTickets.updateStatus(ticket.id, 'resolved');
  assert.equal(await repo.notifications.supportAwaitingStaffCount(), before, 'an explicit admin status transition away from open must decrement it');
});

// A real, if tiny, delay between a cursor moment and a later write - createdAt/lastSeenAt are
// millisecond-resolution ISO timestamps, so two calls issued back-to-back inside one synchronous
// test tick can otherwise land on the exact same millisecond, which would defeat the very
// "strictly after" comparison this test is verifying.
function tick() { return new Promise((resolve) => setTimeout(resolve, 2)); }

test('notifications.communityUnreadCount: only counts posts/comments by others after the cursor; self-authored content never counts; first lookup initializes the cursor to now', async () => {
  const repo = createMemoryRepo();
  const [me, other] = await seedUsers(repo, ['Ivan', 'Julia']);

  // Historic content from before this user's first lookup must never create a false badge.
  await repo.posts.create({ userId: other.id, content: 'old post' });
  await tick();
  assert.equal(await repo.notifications.communityUnreadCount(me.id), 0, 'first lookup must initialize the cursor to now, so pre-existing content is never counted');

  await tick();
  await repo.posts.create({ userId: other.id, content: 'new post by someone else' });
  await repo.posts.create({ userId: me.id, content: 'my own new post' });
  await repo.comments.create({ postId: (await repo.posts.list({ limit: 1 }))[0].id, userId: other.id, content: 'a comment by someone else' });

  assert.equal(await repo.notifications.communityUnreadCount(me.id), 2, 'only the other user\'s post + comment count, never my own post');

  await repo.notifications.acknowledgeCommunity(me.id);
  await tick();
  assert.equal(await repo.notifications.communityUnreadCount(me.id), 0, 'acknowledging (opening Community) must clear the badge');

  await repo.posts.create({ userId: other.id, content: 'yet another post' });
  assert.equal(await repo.notifications.communityUnreadCount(me.id), 1, 'activity after acknowledgement must count again');
});

test('notifications.summaryFor: supportAwaitingStaffCount is only computed/exposed for an admin caller', async () => {
  const repo = createMemoryRepo();
  const [user] = await seedUsers(repo, ['Karen']);
  const asUser = await repo.notifications.summaryFor(user.id, { isAdmin: false });
  assert.equal(asUser.supportAwaitingStaffCount, null);
  const asAdmin = await repo.notifications.summaryFor(user.id, { isAdmin: true });
  assert.equal(typeof asAdmin.supportAwaitingStaffCount, 'number');
});
