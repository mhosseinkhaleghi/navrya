import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { beforeEach } from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { ManualBillingProvider } from '../server/commercial/manual-billing-provider.mjs';
import { getWalletRules, invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';

const root = process.cwd();
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');

// Real-money testing request - the wallet top-up minimum was lowered from $10 to $1
// (WALLET_DEFAULTS.minimumTopUpUsd, server/commercial/commercial-defaults.mjs) so a real, small
// top-up can be tested end to end. Still admin-editable afterward via Admin > Commercial > Wallet
// (PATCH /commercial/wallet-rules) exactly as before - this is a new code DEFAULT, not a new
// mechanism. Mirrors payment-transactions.test.mjs's own createMemoryRepo()/ManualBillingProvider
// convention.
beforeEach(() => invalidateCommercialConfigCache());

test('the default minimum wallet top-up is $1', async () => {
  const repo = createMemoryRepo();
  const rules = await getWalletRules(repo);
  assert.equal(rules.minimumTopUpUsd, 1);
});

test('a top-up of exactly the minimum ($1) is accepted', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  const result = await billing.createWalletTopUp({ userId: user.id, amountUsd: 1 });
  assert.equal(result.status, 'pending');
});

// The exact error the client's below-minimum popup (navrya-src/accountProfileView.jsx's
// TopUpMinimumModal) reads minimumTopUpUsd from - this contract must hold for that popup to ever
// show the real, current, admin-configured minimum instead of a stale/hardcoded guess.
test('a top-up below the minimum is rejected with WALLET_TOPUP_BELOW_MINIMUM and the real minimumTopUpUsd in the error details', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  await assert.rejects(
    () => billing.createWalletTopUp({ userId: user.id, amountUsd: 0.5 }),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.code, 'WALLET_TOPUP_BELOW_MINIMUM');
      assert.equal(error.details.minimumTopUpUsd, 1);
      return true;
    }
  );
});

test('a zero or negative top-up amount is rejected the same way, never silently accepted', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  await assert.rejects(() => billing.createWalletTopUp({ userId: user.id, amountUsd: 0 }), { code: 'WALLET_TOPUP_BELOW_MINIMUM' });
  await assert.rejects(() => billing.createWalletTopUp({ userId: user.id, amountUsd: -5 }), { code: 'WALLET_TOPUP_BELOW_MINIMUM' });
});

// An admin can still raise/lower the minimum afterward (the lowered default does not remove this
// existing control) - PATCH /commercial/wallet-rules already covers the HTTP route itself
// (commercial-admin-api-contract.test.mjs); this just confirms the lowered default doesn't change
// how an override is applied.
test('an admin override still takes effect over the new $1 default', async () => {
  const repo = createMemoryRepo();
  await repo.commercialConfig.publish('wallet:minimumTopUpUsd', { amount: 5 }, {});
  invalidateCommercialConfigCache();
  const rules = await getWalletRules(repo);
  assert.equal(rules.minimumTopUpUsd, 5);

  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  await assert.rejects(() => billing.createWalletTopUp({ userId: user.id, amountUsd: 2 }), { code: 'WALLET_TOPUP_BELOW_MINIMUM' });
  const result = await billing.createWalletTopUp({ userId: user.id, amountUsd: 5 });
  assert.equal(result.status, 'pending');
});

// Static/structural coverage for the client popup - this codebase's node:test harness does not
// render JSX (see header-wallet-balance-static.test.mjs's own comment for the established
// convention). Confirms the below-minimum case is routed to a dedicated popup, not just the
// generic inline Notice banner every other wallet/storage/subscription error uses.
test('WalletCard routes WALLET_TOPUP_BELOW_MINIMUM to a dedicated onBelowMinimum callback, not the generic onNotice path', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const fnIdx = src.indexOf('function WalletCard(');
  assert.ok(fnIdx > -1, 'WalletCard must exist');
  const fn = src.slice(fnIdx, fnIdx + 2200);
  assert.match(fn, /error\.details\.error === 'WALLET_TOPUP_BELOW_MINIMUM'/);
  assert.match(fn, /onBelowMinimum\(error\.details\.minimumTopUpUsd\)/);
});

test('TopUpMinimumModal is a real Modal reading its amount from the server-supplied minimumTopUpUsd, and is wired into SubscriptionTab', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const modalIdx = src.indexOf('function TopUpMinimumModal(');
  assert.ok(modalIdx > -1, 'TopUpMinimumModal must exist');
  const modalFn = src.slice(modalIdx, modalIdx + 900);
  assert.match(modalFn, /<Modal /);
  assert.match(modalFn, /subTopUpMinTitle/);
  assert.match(modalFn, /subTopUpMinBody/);
  assert.match(modalFn, /minimumTopUpUsd/);
  assert.match(src, /belowMinimumUsd != null[\s\S]{0,80}<TopUpMinimumModal/);
});
