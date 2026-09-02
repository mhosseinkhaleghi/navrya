import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// End-to-end HTTP coverage for the two purchase paths the checkout UI actually calls, over the
// real Express app (same createApp()/createMemoryRepo() topology as
// account-profile-api-contract.test.mjs). The unit-level tests around these already pass through
// the billing providers directly; these exist because BOTH bugs this covers were invisible at
// that level and only showed up as a real request:
//
//   1. GET /api/sync/wallet did not serve minimumTopUpUsd at all, so the client offered a $5 chip
//      that the server then rejected with 400 WALLET_TOPUP_BELOW_MINIMUM / minimumTopUpUsd: 10.
//   2. Both billing providers validated planId against their own hardcoded
//      ['plus', 'personalized'] list, so "Upgrade to Pro" - a plan that had already shipped to
//      production in the UI, the catalog and the admin panel - answered 400 VALIDATION_FAILED.

let server, baseUrl, repo;

before(async () => {
  delete process.env.ADMIN_AUTH_ENFORCED;
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => invalidateCommercialConfigCache());

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test('GET /api/sync/wallet serves the real top-up floor alongside the balances', async () => {
  const user = await repo.users.create({ displayName: 'Wallet Shopper' });
  const result = await api('GET', '/api/sync/wallet', { userId: user.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.minimumTopUpUsd, 5);
  assert.equal(typeof result.body.totalBalanceMicroUsd, 'number');
});

test('the smallest amount the wallet UI offers ($5) is actually accepted by the server', async () => {
  const user = await repo.users.create({ displayName: 'Five Dollar Shopper' });
  const minimum = (await api('GET', '/api/sync/wallet', { userId: user.id })).body.minimumTopUpUsd;
  const result = await api('POST', '/api/sync/wallet/topup-request', { userId: user.id, body: { amountUsd: minimum } });
  assert.equal(result.status, 201, 'the exact advertised minimum must never be rejected');
  assert.equal(result.body.status, 'pending');
});

test('an amount below the floor is refused with the floor itself in the body, which is what the popup renders', async () => {
  const user = await repo.users.create({ displayName: 'Too Small' });
  const result = await api('POST', '/api/sync/wallet/topup-request', { userId: user.id, body: { amountUsd: 4 } });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'WALLET_TOPUP_BELOW_MINIMUM');
  assert.equal(result.body.minimumTopUpUsd, 5);
});

test('the floor served to the client and the floor enforced on purchase are always the same number', async () => {
  await repo.commercialConfig.publish('wallet:minimumTopUpUsd', { amount: 12 }, {});
  invalidateCommercialConfigCache();
  const user = await repo.users.create({ displayName: 'Override Shopper' });

  const served = (await api('GET', '/api/sync/wallet', { userId: user.id })).body.minimumTopUpUsd;
  assert.equal(served, 12, 'an admin override must reach the client, not just the enforcement path');

  const justBelow = await api('POST', '/api/sync/wallet/topup-request', { userId: user.id, body: { amountUsd: served - 1 } });
  assert.equal(justBelow.status, 400);
  const exactly = await api('POST', '/api/sync/wallet/topup-request', { userId: user.id, body: { amountUsd: served } });
  assert.equal(exactly.status, 201);

  await repo.commercialConfig.publish('wallet:minimumTopUpUsd', { amount: 5 }, {});
  invalidateCommercialConfigCache();
});

test('every paid plan in the catalog can actually be purchased - including pro, which used to 400', async () => {
  const catalog = (await api('GET', '/api/sync/subscriptions/catalog', { userId: (await repo.users.create({ displayName: 'Catalog Reader' })).id })).body.plans;
  const paidPlans = Object.keys(catalog).filter((planId) => planId !== 'free');
  assert.ok(paidPlans.includes('pro'), 'the catalog the UI renders must include pro');

  for (const planId of paidPlans) {
    const user = await repo.users.create({ displayName: 'Upgrader ' + planId });
    const result = await api('POST', '/api/sync/subscriptions/upgrade-request', { userId: user.id, body: { planId } });
    assert.equal(result.status, 201, 'a plan the catalog offers must be purchasable: ' + planId);
    assert.equal(result.body.status, 'pending');
  }
});

test('a plan that is not a real paid plan is still rejected', async () => {
  const user = await repo.users.create({ displayName: 'Bad Plan' });
  for (const planId of ['free', 'enterprise', '', null]) {
    const result = await api('POST', '/api/sync/subscriptions/upgrade-request', { userId: user.id, body: { planId } });
    assert.equal(result.status, 400, 'must reject planId: ' + JSON.stringify(planId));
    assert.equal(result.body.error, 'VALIDATION_FAILED');
  }
});

test('a purchase still only creates a PENDING transaction - nothing is entitled before confirmation', async () => {
  const user = await repo.users.create({ displayName: 'Not Yet Pro' });
  await api('POST', '/api/sync/subscriptions/upgrade-request', { userId: user.id, body: { planId: 'pro' } });
  const subscription = await api('GET', '/api/sync/subscriptions', { userId: user.id });
  assert.equal(subscription.body.plan, 'free', 'requesting an upgrade must never grant the plan by itself');
  assert.equal(subscription.body.subscription, null);
});
