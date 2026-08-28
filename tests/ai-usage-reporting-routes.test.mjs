import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Client and admin per-model AI cost reporting (task D). Mirrors admin-api-contract.test.mjs's
// harness exactly.
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
async function createAdmin(name) { const user = await repo.users.create({ displayName: name }); return repo.users.update(user.id, { role: 'admin' }); }

test('GET /api/users/me/ai-usage-by-model returns only this user\'s own gateway-origin usage, never another user\'s or a client-reported row', async () => {
  const me = await createUser('Reporter');
  const other = await createUser('Other');
  await repo.usageEvents.create({ userId: me.id, provider: 'openai', model: 'gpt-4o', totalTokens: 10, source: 'test', origin: 'client' }); // untrusted, must be excluded
  await repo.usageEvents.create({ userId: me.id, provider: 'openai', model: 'gpt-4o', totalTokens: 100, source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 2000, retailChargeMicroUsd: 4000 });
  await repo.usageEvents.create({ userId: other.id, provider: 'openai', model: 'gpt-4o', totalTokens: 999, source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 999000, retailChargeMicroUsd: 999000 });
  const result = await api('GET', '/api/users/me/ai-usage-by-model', { userId: me.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.byModel.length, 1);
  assert.equal(result.body.byModel[0].totalTokens, 100, 'the client-reported row and the other user\'s row must both be excluded');
  assert.equal(result.body.byModel[0].providerCostMicroUsd, 2000);
});

test('GET /api/admin/users/:id includes aiCost with a real per-model breakdown', async () => {
  const admin = await createAdmin('Admin AI');
  const target = await createUser('Cost Target');
  await repo.usageEvents.create({ userId: target.id, provider: 'anthropic', model: 'claude-sonnet-4-5', totalTokens: 50, source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 1500, retailChargeMicroUsd: 3000 });
  const result = await api('GET', `/api/admin/users/${target.id}`, { userId: admin.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.aiCost.providerCostMicroUsd, 1500);
  assert.equal(result.body.aiCost.retailChargeMicroUsd, 3000);
  assert.equal(result.body.aiCost.byModel[0].model, 'claude-sonnet-4-5');
});

test('GET /api/admin/ai/usage-by-model aggregates real settled cost across every user, rejecting a non-admin caller', async () => {
  const admin = await createAdmin('Admin AI 2');
  const plain = await createUser('Plain');
  const u1 = await createUser('U1'), u2 = await createUser('U2');
  await repo.usageEvents.create({ userId: u1.id, provider: 'openai', model: 'gpt-4o-mini', totalTokens: 10, source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 100, retailChargeMicroUsd: 200 });
  await repo.usageEvents.create({ userId: u2.id, provider: 'openai', model: 'gpt-4o-mini', totalTokens: 10, source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 100, retailChargeMicroUsd: 200 });
  const rejected = await api('GET', '/api/admin/ai/usage-by-model', { userId: plain.id });
  assert.equal(rejected.status, 403);
  const result = await api('GET', '/api/admin/ai/usage-by-model', { userId: admin.id });
  assert.equal(result.status, 200);
  const row = result.body.byModel.find((r) => r.model === 'gpt-4o-mini');
  assert.equal(row.calls, 2);
  assert.equal(row.providerCostMicroUsd, 200);
});
