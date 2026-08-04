import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

async function seedUser(repo, name) { return repo.users.create({ displayName: name || 'Trader' }); }

test('a fresh user has the new profile defaults (trader/not_started/0 XP), never fabricated as verified', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  assert.equal(user.profileRole, 'trader');
  assert.equal(user.kycStatus, 'not_started');
  assert.equal(user.xpTotal, 0);
  assert.equal(user.emailVerified, false);
  assert.equal(user.phoneVerified, false);
});

test('users.updateProfile changes trader-editable fields and structurally cannot touch kycStatus/xpTotal/role', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  const updated = await repo.users.updateProfile(user.id, { displayName: 'New Name', email: 'a@b.com', phone: '+98123', profileRole: 'mentor', kycStatus: 'verified', xpTotal: 99999, role: 'admin' });
  assert.equal(updated.displayName, 'New Name');
  assert.equal(updated.email, 'a@b.com');
  assert.equal(updated.profileRole, 'mentor');
  assert.equal(updated.kycStatus, 'not_started', 'kycStatus in the patch object must be silently ignored, not applied');
  assert.equal(updated.xpTotal, 0, 'xpTotal must not be settable through the trader-facing update path');
  assert.equal(updated.role, 'user', 'the admin-only role column must not be settable through the trader-facing update path');
});

test('users.updateProfile rejects a duplicate email across two different users', async () => {
  const repo = createMemoryRepo();
  const a = await seedUser(repo, 'A');
  const b = await seedUser(repo, 'B');
  await repo.users.updateProfile(a.id, { email: 'taken@example.com' });
  await assert.rejects(repo.users.updateProfile(b.id, { email: 'taken@example.com' }), /EMAIL_TAKEN/);
});

test('users.updateKyc is the only way kycStatus changes, and rejects an invalid status', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  const updated = await repo.users.updateKyc(user.id, 'verified');
  assert.equal(updated.kycStatus, 'verified');
  await assert.rejects(repo.users.updateKyc(user.id, 'not_a_real_status'), /VALIDATION_FAILED/);
});

test('xpEvents.record bumps xpTotal and listForUser/totalForUser reflect it', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  await repo.xpEvents.record({ userId: user.id, type: 'trade_closed', points: 5, meta: { tradeId: 't1' } });
  await repo.xpEvents.record({ userId: user.id, type: 'trade_closed', points: 5, meta: { tradeId: 't2' } });
  const total = await repo.xpEvents.totalForUser(user.id);
  assert.equal(total, 10);
  const events = await repo.xpEvents.listForUser(user.id);
  assert.equal(events.length, 2);
  const fresh = await repo.users.get(user.id);
  assert.equal(fresh.xpTotal, 10, 'xpTotal on the user record itself must also be updated, not just derivable by summing events');
});

test('xpEvents.hasType backs once-per-user idempotency checks', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  assert.equal(await repo.xpEvents.hasType(user.id, 'intake_completed'), false);
  await repo.xpEvents.record({ userId: user.id, type: 'intake_completed', points: 15, meta: {} });
  assert.equal(await repo.xpEvents.hasType(user.id, 'intake_completed'), true);
});

test('achievements.unlock is idempotent per (user, key) and returns created:false on a repeat', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  const first = await repo.achievements.unlock({ userId: user.id, achievementKey: 'first_trade_closed', evidence: { tradeIds: ['t1'] } });
  assert.equal(first.created, true);
  const second = await repo.achievements.unlock({ userId: user.id, achievementKey: 'first_trade_closed', evidence: { tradeIds: ['t1', 't2'] } });
  assert.equal(second.created, false, 'a repeat unlock for the same key must not create a second row');
  const list = await repo.achievements.listForUser(user.id);
  assert.equal(list.length, 1);
});

test('xpEvents.record with a repeated dedupeKey reports {duplicate:true} and never double-increments xpTotal', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  const first = await repo.xpEvents.record({ userId: user.id, type: 'session_created', domain: 'session', points: 2, sourceType: 'session', sourceId: 's1', dedupeKey: 'session.created:s1', meta: {} });
  assert.equal(first.duplicate, undefined);
  assert.equal(first.user.xpTotal, 2);
  const second = await repo.xpEvents.record({ userId: user.id, type: 'session_created', domain: 'session', points: 2, sourceType: 'session', sourceId: 's1', dedupeKey: 'session.created:s1', meta: {} });
  assert.equal(second.duplicate, true);
  const fresh = await repo.users.get(user.id);
  assert.equal(fresh.xpTotal, 2, 'a duplicate dedupeKey must never increment xpTotal a second time');
});

test('xpEvents.countForSource counts only events for the given type+sourceId, backing PER_SOURCE_MAX caps', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  await repo.xpEvents.record({ userId: user.id, type: 'session_chart_entry_added', domain: 'session', points: 2, sourceType: 'session', sourceId: 's1', dedupeKey: 'session.entry:e1' });
  await repo.xpEvents.record({ userId: user.id, type: 'session_chart_entry_added', domain: 'session', points: 2, sourceType: 'session', sourceId: 's1', dedupeKey: 'session.entry:e2' });
  await repo.xpEvents.record({ userId: user.id, type: 'session_chart_entry_added', domain: 'session', points: 2, sourceType: 'session', sourceId: 's2', dedupeKey: 'session.entry:e3' });
  assert.equal(await repo.xpEvents.countForSource(user.id, 'session_chart_entry_added', 's1'), 2);
  assert.equal(await repo.xpEvents.countForSource(user.id, 'session_chart_entry_added', 's2'), 1);
});

test('xpEvents.domainTotalToday/recurringTotalToday only sum domain-tagged events from today, excluding once-per-user types', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  await repo.xpEvents.record({ userId: user.id, type: 'trade_plan_created', domain: 'trade', points: 5, dedupeKey: 'trade.plan:t1' });
  await repo.xpEvents.record({ userId: user.id, type: 'first_trade_bonus', domain: 'trade', points: 10, dedupeKey: 'once:first_trade_bonus' });
  await repo.xpEvents.record({ userId: user.id, type: 'achievement:first_trade_closed', domain: null, points: 10, meta: {} });
  assert.equal(await repo.xpEvents.domainTotalToday(user.id, 'trade'), 15, 'domainTotalToday sums every domain-tagged event, including once-per-user ones');
  assert.equal(await repo.xpEvents.recurringTotalToday(user.id, ['first_trade_bonus']), 5, 'recurringTotalToday excludes once-per-user types and domain-less achievement rows');
});

test('xpEvents.domainBreakdown and sourceIdsWithAllTypes back mastery-gate snapshot building', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  await repo.xpEvents.record({ userId: user.id, type: 'strategy_position_management_completed', domain: 'strategy', points: 8, sourceType: 'strategy', sourceId: 'strat1', dedupeKey: 'a' });
  await repo.xpEvents.record({ userId: user.id, type: 'strategy_risk_management_completed', domain: 'strategy', points: 8, sourceType: 'strategy', sourceId: 'strat1', dedupeKey: 'b' });
  assert.deepEqual(await repo.xpEvents.sourceIdsWithAllTypes(user.id, ['strategy_position_management_completed', 'strategy_risk_management_completed', 'strategy_overall_framework_completed']), [], 'not complete until all three types exist for the same sourceId');
  await repo.xpEvents.record({ userId: user.id, type: 'strategy_overall_framework_completed', domain: 'strategy', points: 6, sourceType: 'strategy', sourceId: 'strat1', dedupeKey: 'c' });
  assert.deepEqual(await repo.xpEvents.sourceIdsWithAllTypes(user.id, ['strategy_position_management_completed', 'strategy_risk_management_completed', 'strategy_overall_framework_completed']), ['strat1']);
  const breakdown = await repo.xpEvents.domainBreakdown(user.id);
  assert.equal(breakdown.strategy, 22);
  assert.equal(breakdown.trade, 0);
});

test('marketplace listings accept the widened type enum including subscription', async () => {
  const repo = createMemoryRepo();
  const seller = await seedUser(repo, 'Seller');
  const listing = await repo.listings.create({ sellerId: seller.id, type: 'subscription', sourceId: 'sub-1', title: 'Monthly Mentorship', previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString() });
  assert.equal(listing.type, 'subscription');
});
