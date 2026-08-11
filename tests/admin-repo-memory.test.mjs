import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

async function seedUser(repo, name) { return repo.users.create({ displayName: name || 'Trader' }); }

test('sessions.heartbeat creates one open session on the first call and updates the same row on later calls', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  const first = await repo.sessions.heartbeat(user.id);
  const second = await repo.sessions.heartbeat(user.id);
  assert.equal(first.id, second.id, 'a second heartbeat must reuse the same open session, not create a new one');
  const sessions = await repo.sessions.listByUser(user.id);
  assert.equal(sessions.length, 1);
});

test('sessions.sweepStale respects the threshold: a generous threshold leaves a fresh session open, a zero threshold ends it', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  await repo.sessions.heartbeat(user.id);
  await repo.sessions.sweepStale(60000); // 60s - the session (created moments ago) is nowhere near stale
  const stillOpen = await repo.sessions.listByUser(user.id);
  assert.equal(stillOpen[0].endedAt, null, 'a generous threshold must not end a session created moments ago');
  await new Promise((resolve) => setTimeout(resolve, 5)); // guarantee real elapsed time past a tiny threshold
  await repo.sessions.sweepStale(1); // 1ms - the >=5ms real gap above must now count as stale
  const nowEnded = await repo.sessions.listByUser(user.id);
  assert.ok(nowEnded[0].endedAt, 'a threshold shorter than the real elapsed time must end the session');
});

test('sessions.aggregateByUser reports isOnline for a fresh heartbeat and reports accumulated hoursOnline', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  await repo.sessions.heartbeat(user.id);
  const agg = await repo.sessions.aggregateByUser();
  assert.equal(agg[user.id].isOnline, true);
  assert.ok(agg[user.id].lastLoginAt);
  assert.equal(typeof agg[user.id].hoursOnline, 'number');
});

test('sessions.hoursOnlineFor accumulates across multiple sessions instead of resetting on each new one (the character-switch bug)', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  await repo.sessions.heartbeat(user.id); // session 1 starts (sets startedAt)
  await new Promise((resolve) => setTimeout(resolve, 5));
  await repo.sessions.heartbeat(user.id); // advances lastHeartbeatAt, so the session now spans a real >=5ms duration
  await new Promise((resolve) => setTimeout(resolve, 5));
  await repo.sessions.sweepStale(1); // ends session 1: its >=5ms-stale lastHeartbeatAt crosses the 1ms threshold
  const afterFirst = await repo.sessions.hoursOnlineFor(user.id);
  assert.ok(afterFirst > 0, 'a completed session must contribute non-zero accumulated time');

  await repo.sessions.heartbeat(user.id); // session 2 starts - the equivalent of switching character (a fresh page load)
  const afterSecond = await repo.sessions.hoursOnlineFor(user.id);
  assert.ok(afterSecond >= afterFirst, 'starting a new session must never reduce the previously accumulated total');
});

test('usageEvents.create is tracked and aggregateByUser/aggregateByProviderForMonth sum correctly', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  await repo.usageEvents.create({ userId: user.id, provider: 'openai', promptTokens: 10, completionTokens: 20, totalTokens: 30, source: 'test' });
  await repo.usageEvents.create({ userId: user.id, provider: 'openai', promptTokens: 5, completionTokens: 5, totalTokens: 10, source: 'test' });
  const byUser = await repo.usageEvents.aggregateByUser();
  assert.equal(byUser[user.id], 40);
  const monthKey = new Date().toISOString().slice(0, 7);
  const byMonth = await repo.usageEvents.aggregateByProviderForMonth(monthKey);
  const openai = byMonth.find((row) => row.provider === 'openai');
  assert.equal(openai.totalTokens, 40);
  assert.equal(openai.promptTokens, 15);
  assert.equal(openai.completionTokens, 25);
});

test('providerPricing.upsert is idempotent per provider (one row, latest values win)', async () => {
  const repo = createMemoryRepo();
  await repo.providerPricing.upsert({ provider: 'openai', promptPricePer1k: 0.01, completionPricePer1k: 0.02, monthlyTokenBudget: 100000 });
  await repo.providerPricing.upsert({ provider: 'openai', promptPricePer1k: 0.05, completionPricePer1k: 0.06, monthlyTokenBudget: 200000 });
  const rows = await repo.providerPricing.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].promptPricePer1k, 0.05);
  assert.equal(rows[0].monthlyTokenBudget, 200000);
});

test('adminKeys.upsert stores a key and rejects an empty one', async () => {
  const repo = createMemoryRepo();
  const row = await repo.adminKeys.upsert({ provider: 'openai', apiKey: 'sk-test-123' });
  assert.equal(row.apiKey, 'sk-test-123');
  const fetched = await repo.adminKeys.get('openai');
  assert.equal(fetched.apiKey, 'sk-test-123');
  await assert.rejects(repo.adminKeys.upsert({ provider: 'openai', apiKey: '  ' }), /VALIDATION_FAILED/);
});

test('auditLog.create records every mutation and list() surfaces them all', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  await repo.auditLog.create({ adminUserId: user.id, action: 'user.update', targetType: 'user', targetId: user.id, details: { role: 'admin' } });
  await repo.auditLog.create({ adminUserId: user.id, action: 'ai.keys.set', targetType: 'adminKey', targetId: 'openai', details: {} });
  const entries = await repo.auditLog.list({});
  assert.equal(entries.length, 2);
  const actions = entries.map((entry) => entry.action).sort();
  assert.deepEqual(actions, ['ai.keys.set', 'user.update']);
});

test('users.update patches role and suspendedAt without touching other fields', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo, 'Someone');
  const updated = await repo.users.update(user.id, { role: 'admin' });
  assert.equal(updated.role, 'admin');
  assert.equal(updated.displayName, 'Someone');
  await assert.rejects(repo.users.update('missing-id', { role: 'admin' }), /USER_NOT_FOUND/);
});

test('listings.listAll returns every status, and can be filtered to one', async () => {
  const repo = createMemoryRepo();
  const seller = await seedUser(repo, 'Seller');
  await repo.listings.create({ sellerId: seller.id, type: 'pattern', sourceId: 'p1', title: 'Draft one', previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString(), status: 'draft' });
  await repo.listings.create({ sellerId: seller.id, type: 'pattern', sourceId: 'p2', title: 'Published one', previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString(), status: 'published' });
  const all = await repo.listings.listAll({});
  assert.equal(all.length, 2);
  const drafts = await repo.listings.listAll({ status: 'draft' });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].title, 'Draft one');
});

test('purchases.aggregateByBuyer sums count and total per buyer', async () => {
  const repo = createMemoryRepo();
  const seller = await seedUser(repo, 'Seller');
  const buyer = await seedUser(repo, 'Buyer');
  const listingA = await repo.listings.create({ sellerId: seller.id, type: 'pattern', sourceId: 'a', title: 'A', previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString() });
  const listingB = await repo.listings.create({ sellerId: seller.id, type: 'pattern', sourceId: 'b', title: 'B', previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString() });
  await repo.purchases.create({ listingId: listingA.id, buyerId: buyer.id, priceAtPurchase: 10 });
  await repo.purchases.create({ listingId: listingB.id, buyerId: buyer.id, priceAtPurchase: 5 });
  const agg = await repo.purchases.aggregateByBuyer();
  assert.equal(agg[buyer.id].count, 2);
  assert.equal(agg[buyer.id].total, 15);
});

test('memory repo health() is honestly synthetic, never claims a real database check', async () => {
  const repo = createMemoryRepo();
  const health = await repo.health();
  assert.equal(health.backend, 'memory');
  assert.equal(health.dbOk, true);
  assert.deepEqual(health.migrations, []);
});
