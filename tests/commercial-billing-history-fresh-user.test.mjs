import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Task B.6/B.7 - investigated the reported "four payments for every new user" through the actual
// response source (server/commercial/manual-billing-provider.mjs, the signup path, and the
// in-memory repo's lazy-self-seed convention). Conclusion: no auto-creation path exists anywhere
// in this codebase - the only four payment_transactions.create() call sites are each behind an
// explicit user/admin action (topup-request, upgrade-request, purchase-request, admin refund).
// This test enforces that conclusion as a real regression contract, not a one-off finding: a
// brand-new user must see an EMPTY billing history and EXACTLY ONE automatic financial event (the
// signup PROMO_CREDIT wallet-ledger entry, which is explicitly permitted and is NOT a payment
// transaction).
let server, baseUrl, repo;

before(async () => {
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function api(method, path, userId) {
  const headers = await authHeadersFor(repo, userId);
  const response = await fetch(baseUrl + path, { method, headers });
  return { status: response.status, body: await response.json() };
}

test('a brand-new user has zero payment_transactions (empty billing history)', async () => {
  const user = await repo.users.create({ displayName: 'Fresh User' });
  const result = await api('GET', '/api/sync/wallet/transactions', user.id);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.transactions, [], 'a fresh user must have no payment_transactions rows of any type');
});

test('a brand-new user\'s wallet ledger has exactly one entry - the signup PROMO_CREDIT - and nothing else', async () => {
  const user = await repo.users.create({ displayName: 'Fresh User 2' });
  const result = await api('GET', '/api/sync/wallet/ledger', user.id);
  assert.equal(result.status, 200);
  assert.equal(result.body.entries.length, 1, 'the only permitted automatic financial event is the one signup promo credit');
  assert.equal(result.body.entries[0].type, 'PROMO_CREDIT');
});

test('repo.paymentTransactions.listForUser never lazily seeds rows for a user who has never made a purchase (unlike storageProducts.list()\'s deliberate catalog self-seed)', async () => {
  const user = await repo.users.create({ displayName: 'Fresh User 3' });
  const rows = await repo.paymentTransactions.listForUser(user.id);
  assert.deepEqual(rows, []);
});

test('a fresh user\'s subscription/storage state carries no marketplace mock-purchase data mixed into real billing shapes', async () => {
  const user = await repo.users.create({ displayName: 'Fresh User 4' });
  const subs = await api('GET', '/api/sync/subscriptions', user.id);
  assert.equal(subs.body.subscription, null);
  assert.equal(subs.body.plan, 'free');
  const storage = await api('GET', '/api/sync/storage', user.id);
  assert.deepEqual(storage.body.entitlements, []);
});
