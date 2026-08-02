import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// Mirrors community-api-contract.test.mjs's setup exactly: createApp() has zero import-time
// side effects, so each server here gets its own memory repo and OS-assigned port.
let server, baseUrl, repo;

before(async () => {
  delete process.env.ADMIN_AUTH_ENFORCED; // default/unset -> requireAdmin treats every identified dev-user as admin
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) headers['x-dev-user-id'] = userId;
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function createUser(name) {
  const { body } = await api('POST', '/api/users', { body: { displayName: name } });
  return body;
}

test('GET /api/admin/config reflects the ADMIN_AUTH_ENFORCED env flag live, without auth', async () => {
  delete process.env.ADMIN_AUTH_ENFORCED;
  let result = await api('GET', '/api/admin/config');
  assert.equal(result.status, 200);
  assert.equal(result.body.authEnforced, false);
  process.env.ADMIN_AUTH_ENFORCED = 'true';
  result = await api('GET', '/api/admin/config');
  assert.equal(result.body.authEnforced, true);
  delete process.env.ADMIN_AUTH_ENFORCED; // restore for every other test in this file
});

test('with enforcement disabled (the default), any identified dev-user can use admin routes with no role check', async () => {
  const user = await createUser('Plain User');
  const result = await api('GET', '/api/admin/users', { userId: user.id });
  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.body.users));
});

test('GET /api/admin/ai/keys never includes the raw apiKey value, for a set provider, an unset provider, or after a failed upsert attempt', async () => {
  const admin = await createUser('Admin');
  await repo.adminKeys.upsert({ provider: 'openai', apiKey: 'sk-super-secret-value' });
  await assert.rejects(repo.adminKeys.upsert({ provider: 'anthropic', apiKey: '' })); // failed attempt - must never leave a leaked/partial row either
  const result = await api('GET', '/api/admin/ai/keys', { userId: admin.id });
  assert.equal(result.status, 200);
  const raw = JSON.stringify(result.body);
  assert.doesNotMatch(raw, /sk-super-secret-value/, 'the raw key must never appear anywhere in the response body');
  const openaiEntry = result.body.find((row) => row.provider === 'openai');
  const anthropicEntry = result.body.find((row) => row.provider === 'anthropic');
  assert.equal(openaiEntry.isSet, true);
  assert.equal(anthropicEntry.isSet, false);
  assert.equal(Object.prototype.hasOwnProperty.call(openaiEntry, 'apiKey'), false);
});

test('POST /api/admin/ai/keys sets a key (masked response only) and writes exactly one audit log row', async () => {
  const admin = await createUser('Admin2');
  const before = await repo.auditLog.list({ limit: 100 });
  const result = await api('POST', '/api/admin/ai/keys', { userId: admin.id, body: { provider: 'kimi', apiKey: 'kimi-secret-abc' } });
  assert.equal(result.status, 201);
  assert.equal(result.body.isSet, true);
  assert.equal(Object.prototype.hasOwnProperty.call(result.body, 'apiKey'), false);
  const after = await repo.auditLog.list({ limit: 100 });
  assert.equal(after.length, before.length + 1);
  assert.equal(after[0].action, 'ai.keys.set');
  assert.doesNotMatch(JSON.stringify(after[0].details), /kimi-secret-abc/, 'the audit trail must never contain the key material itself');
});

test('PATCH /api/admin/users/:id changes role/suspendedAt and writes one audit log row', async () => {
  const admin = await createUser('Admin3');
  const target = await createUser('Target User');
  const before = await repo.auditLog.list({ limit: 100 });
  const result = await api('PATCH', `/api/admin/users/${target.id}`, { userId: admin.id, body: { role: 'moderator' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.role, 'moderator');
  const after = await repo.auditLog.list({ limit: 100 });
  assert.equal(after.length, before.length + 1);
  assert.equal(after[0].action, 'user.update');
});

test('POST /api/admin/ai/pricing writes one audit log row and GET /api/admin/finance/overview never fabricates a number when nothing is configured', async () => {
  const admin = await createUser('Admin4');
  const emptyFinance = await api('GET', '/api/admin/finance/overview', { userId: admin.id });
  assert.equal(emptyFinance.status, 200);
  const openaiCost = emptyFinance.body.aiCostByProvider.find((row) => row.provider === 'openai');
  assert.equal(openaiCost.cost, null);
  assert.equal(openaiCost.reason, 'NO_PRICING_SET');
  const openaiBudget = emptyFinance.body.remainingBudgetByProvider.find((row) => row.provider === 'openai');
  assert.equal(openaiBudget.remaining, null);
  assert.equal(openaiBudget.reason, 'NO_BUDGET_SET');

  const before = await repo.auditLog.list({ limit: 100 });
  const pricingResult = await api('POST', '/api/admin/ai/pricing', { userId: admin.id, body: { provider: 'openai', promptPricePer1k: 0.001, completionPricePer1k: 0.002, monthlyTokenBudget: 1000 } });
  assert.equal(pricingResult.status, 201);
  const after = await repo.auditLog.list({ limit: 100 });
  assert.equal(after.length, before.length + 1);
  assert.equal(after[0].action, 'ai.pricing.set');

  const financeAfterPricing = await api('GET', '/api/admin/finance/overview', { userId: admin.id });
  const openaiCostAfter = financeAfterPricing.body.aiCostByProvider.find((row) => row.provider === 'openai');
  assert.equal(openaiCostAfter.reason, undefined, 'once pricing is set, no reason code should remain');
  assert.equal(typeof openaiCostAfter.cost, 'number');
});

test('PATCH /api/admin/marketplace/listings/:id can delist and feature a listing, and writes one audit log row per call', async () => {
  const admin = await createUser('Admin5');
  const seller = await createUser('Seller');
  const listing = await repo.listings.create({ sellerId: seller.id, type: 'pattern', sourceId: 'src-1', title: 'A pattern', previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString(), status: 'published' });

  const beforeCount = (await repo.auditLog.list({ limit: 100 })).length;
  const featureResult = await api('PATCH', `/api/admin/marketplace/listings/${listing.id}`, { userId: admin.id, body: { featured: true } });
  assert.equal(featureResult.status, 200);
  assert.equal(featureResult.body.featured, true);
  const delistResult = await api('PATCH', `/api/admin/marketplace/listings/${listing.id}`, { userId: admin.id, body: { status: 'delisted' } });
  assert.equal(delistResult.status, 200);
  assert.equal(delistResult.body.status, 'delisted');
  const afterCount = (await repo.auditLog.list({ limit: 100 })).length;
  assert.equal(afterCount, beforeCount + 2, 'each mutating call must write exactly one audit row');

  const listResult = await api('GET', '/api/admin/marketplace/listings?status=all', { userId: admin.id });
  const found = listResult.body.find((row) => row.id === listing.id);
  assert.equal(found.sellerName, 'Seller');
});

test('GET /api/admin/technical reports the memory backend honestly and never fabricates error-tracking data', async () => {
  const admin = await createUser('Admin6');
  const result = await api('GET', '/api/admin/technical', { userId: admin.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.db.backend, 'memory');
  assert.equal(result.body.db.ok, true);
  assert.deepEqual(result.body.migrations, []);
  assert.equal(result.body.errorTracking, 'not implemented');
});

test('with ADMIN_AUTH_ENFORCED=true, a non-admin role is rejected with 403 and an admin role is admitted', async () => {
  process.env.ADMIN_AUTH_ENFORCED = 'true';
  let enforcedServer;
  try {
    const enforcedRepo = createMemoryRepo();
    enforcedServer = createApp({ repo: enforcedRepo, uploadsDir: '/tmp' }).listen(0);
    await new Promise((resolve) => enforcedServer.once('listening', resolve));
    const enforcedBaseUrl = `http://127.0.0.1:${enforcedServer.address().port}`;
    async function enforcedApi(method, path, { body, userId } = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (userId) headers['x-dev-user-id'] = userId;
      const response = await fetch(enforcedBaseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    }

    const plainUser = await enforcedApi('POST', '/api/users', { body: { displayName: 'Plain' } }).then((r) => r.body);
    const rejected = await enforcedApi('GET', '/api/admin/users', { userId: plainUser.id });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.body.error, 'ADMIN_ROLE_REQUIRED');

    const adminUser = await enforcedApi('POST', '/api/users', { body: { displayName: 'Real Admin' } }).then((r) => r.body);
    await enforcedRepo.users.update(adminUser.id, { role: 'admin' });
    const admitted = await enforcedApi('GET', '/api/admin/users', { userId: adminUser.id });
    assert.equal(admitted.status, 200);
  } finally {
    delete process.env.ADMIN_AUTH_ENFORCED;
    if (enforcedServer) await new Promise((resolve) => enforcedServer.close(resolve));
  }
});
