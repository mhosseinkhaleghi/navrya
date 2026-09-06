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

test('adminModelOverrides stores one provider fallback model and rejects a blank value', async () => {
  const repo = createMemoryRepo();
  await repo.adminModelOverrides.upsert({ provider: 'gemini', model: 'gemini-3.1-pro-preview' });
  const replaced = await repo.adminModelOverrides.upsert({ provider: 'gemini', model: 'gemini-2.5-flash' });
  assert.equal(replaced.model, 'gemini-2.5-flash');
  assert.equal((await repo.adminModelOverrides.list()).length, 1);
  await assert.rejects(repo.adminModelOverrides.upsert({ provider: 'gemini', model: ' ' }), /VALIDATION_FAILED/);
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

// --- Section 7.16 follow-up: usageEvents.aggregateByUserAndProvider + providerHealth ---

test('usageEvents.aggregateByUserAndProvider breaks a single user\'s tokens down per provider, not just one lifetime total', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  await repo.usageEvents.create({ userId: user.id, provider: 'openai', totalTokens: 100, source: 'patterns.chat' });
  await repo.usageEvents.create({ userId: user.id, provider: 'openai', totalTokens: 50, source: 'trades.analyze' });
  await repo.usageEvents.create({ userId: user.id, provider: 'anthropic', totalTokens: 30, source: 'ai.chat' });
  const other = await seedUser(repo, 'Other');
  await repo.usageEvents.create({ userId: other.id, provider: 'openai', totalTokens: 999, source: 'ai.chat' });
  const byProvider = await repo.usageEvents.aggregateByUserAndProvider(user.id);
  const byProviderMap = {};
  byProvider.forEach((row) => { byProviderMap[row.provider] = row.totalTokens; });
  assert.deepEqual(byProviderMap, { openai: 150, anthropic: 30 }, 'must sum per-provider for this user only, unaffected by another user\'s usage');
});

test('providerHealth.record stores an event and latestByProvider() reports the most recent one per provider', async () => {
  const repo = createMemoryRepo();
  await repo.providerHealth.record({ provider: 'openai', ok: true, latencyMs: 400, source: 'ai.chat' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await repo.providerHealth.record({ provider: 'openai', ok: false, errorCode: 'OPENAI_401', latencyMs: 120, source: 'ai.testConnection' });
  await repo.providerHealth.record({ provider: 'anthropic', ok: true, latencyMs: 900, source: 'ai.chat' });
  const latest = await repo.providerHealth.latestByProvider();
  assert.equal(latest.openai.ok, false, 'must report the LAST event for a provider, not the first');
  assert.equal(latest.openai.errorCode, 'OPENAI_401');
  assert.equal(latest.anthropic.ok, true);
  assert.equal(latest.kimi, undefined, 'a provider with no events at all must simply be absent, never fabricated');
});

test('providerHealth.aggregateSince computes calls/failures/avgLatencyMs per provider within the window, ignoring older events', async () => {
  const repo = createMemoryRepo();
  const old = { provider: 'openai', ok: true, latencyMs: 1000, source: 'ai.chat' };
  await repo.providerHealth.record(old);
  const cutoff = new Date(Date.now() + 5).toISOString(); // everything recorded so far is now "before" this cutoff
  await new Promise((resolve) => setTimeout(resolve, 10));
  await repo.providerHealth.record({ provider: 'openai', ok: true, latencyMs: 300, source: 'ai.chat' });
  await repo.providerHealth.record({ provider: 'openai', ok: false, errorCode: 'OPENAI_500', latencyMs: 100, source: 'ai.chat' });
  const agg = await repo.providerHealth.aggregateSince(cutoff);
  const openai = agg.find((row) => row.provider === 'openai');
  assert.equal(openai.calls, 2, 'the event recorded before the cutoff must not count');
  assert.equal(openai.failures, 1);
  assert.equal(openai.avgLatencyMs, 200);
});

test('providerHealth.recent returns newest-first across all providers, capped at the given limit', async () => {
  const repo = createMemoryRepo();
  for (let i = 0; i < 5; i += 1) {
    await repo.providerHealth.record({ provider: i % 2 ? 'anthropic' : 'openai', ok: true, latencyMs: i, source: 'ai.chat' });
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  const recent = await repo.providerHealth.recent({ limit: 3 });
  assert.equal(recent.length, 3);
  assert.equal(recent[0].latencyMs, 4, 'newest event (latencyMs:4, recorded last) must come first');
  assert.equal(recent[2].latencyMs, 2);
});

// --- Global AI assistant dock: real, multiple, resumable conversations (017_ai_conversations.sql) ---

test('aiChatHistory.create/list/get round-trip a real conversation, with a running token total', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  const conv = await repo.aiChatHistory.create({
    userId: user.id, provider: 'openai', title: 'How do I read this chart?',
    messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }], tokens: 30
  });
  assert.ok(conv.id);
  assert.equal(conv.tokens, 30);

  const list = await repo.aiChatHistory.list(user.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, conv.id);
  assert.equal(list[0].messageCount, 2);
  assert.equal(list[0].tokens, 30);
  assert.equal(list[0].messages, undefined, 'the list summary must stay lightweight - no message bodies');

  const fetched = await repo.aiChatHistory.get(user.id, conv.id);
  assert.equal(fetched.messages.length, 2);
});

// Atomic append (security/correctness hardening pass): `messages` is now ONLY the new turn(s)
// this call is adding - appendAndSave concatenates them onto the real, current stored array
// server-side (mirrors repo.pg.mjs's own jsonb `||` UPDATE), never a client-supplied full array
// replacing it wholesale (the old shape was a lost-update race between concurrent callers - see
// tests/ai-chat-history-api-contract.test.mjs's own concurrent-PATCH regression test).
test('aiChatHistory.appendAndSave concatenates only the new messages it is given onto the real, current array, and INCREMENTS tokens rather than replacing them', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  const conv = await repo.aiChatHistory.create({ userId: user.id, provider: 'openai', title: 'T', messages: [{ role: 'user', content: 'a' }], tokens: 10 });
  const appended = await repo.aiChatHistory.appendAndSave(user.id, conv.id, {
    messages: [{ role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }], tokens: 15
  });
  assert.deepEqual(appended.messages, [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }], 'the original message plus only the new delta');
  assert.equal(appended.tokens, 25, 'tokens must accumulate (10 + 15), never be replaced by the latest call\'s value alone');
});

test('aiChatHistory conversations are isolated per user - another user can neither read, append to, nor delete one that is not theirs', async () => {
  const repo = createMemoryRepo();
  const owner = await seedUser(repo, 'Owner');
  const stranger = await seedUser(repo, 'Stranger');
  const conv = await repo.aiChatHistory.create({ userId: owner.id, provider: 'openai', title: 'T', messages: [{ role: 'user', content: 'a' }], tokens: 5 });

  assert.equal(await repo.aiChatHistory.get(stranger.id, conv.id), null);
  assert.equal(await repo.aiChatHistory.appendAndSave(stranger.id, conv.id, { messages: [{ role: 'user', content: 'x' }], tokens: 1 }), null);
  assert.equal(await repo.aiChatHistory.remove(stranger.id, conv.id), false);
  assert.ok(await repo.aiChatHistory.get(owner.id, conv.id), 'the real owner must still be able to read it after a stranger\'s failed attempts');

  const strangerList = await repo.aiChatHistory.list(stranger.id);
  assert.equal(strangerList.length, 0, 'list() must never leak another user\'s conversations');
});

test('aiChatHistory.remove deletes a conversation the owner actually owns', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  const conv = await repo.aiChatHistory.create({ userId: user.id, provider: 'openai', title: 'T', messages: [{ role: 'user', content: 'a' }], tokens: 1 });
  assert.equal(await repo.aiChatHistory.remove(user.id, conv.id), true);
  assert.equal(await repo.aiChatHistory.get(user.id, conv.id), null);
});

test('aiChatHistory.list is newest-first', async () => {
  const repo = createMemoryRepo();
  const user = await seedUser(repo);
  const first = await repo.aiChatHistory.create({ userId: user.id, provider: 'openai', title: 'First', messages: [{ role: 'user', content: 'a' }], tokens: 1 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await repo.aiChatHistory.create({ userId: user.id, provider: 'openai', title: 'Second', messages: [{ role: 'user', content: 'a' }], tokens: 1 });
  const list = await repo.aiChatHistory.list(user.id);
  assert.deepEqual(list.map((c) => c.id), [second.id, first.id]);
});
