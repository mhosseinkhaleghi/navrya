import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { beforeEach } from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { ManualBillingProvider } from '../server/commercial/manual-billing-provider.mjs';
import { getWalletRules, invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';

const root = process.cwd();
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');

// The wallet top-up floor is $5 (WALLET_DEFAULTS.minimumTopUpUsd,
// server/commercial/commercial-defaults.mjs) - the smallest amount the wallet UI offers. Still
// admin-editable afterward via Admin > Commercial > Wallet (PATCH /commercial/wallet-rules)
// exactly as before: this is a code DEFAULT, not a new mechanism. Mirrors
// payment-transactions.test.mjs's own createMemoryRepo()/ManualBillingProvider convention.
beforeEach(() => invalidateCommercialConfigCache());

test('the default minimum wallet top-up is $5 - the same amount the wallet UI offers as its smallest chip', async () => {
  const repo = createMemoryRepo();
  const rules = await getWalletRules(repo);
  assert.equal(rules.minimumTopUpUsd, 5);
});

test('a top-up of exactly the minimum ($5) is accepted', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  const result = await billing.createWalletTopUp({ userId: user.id, amountUsd: 5 });
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
    () => billing.createWalletTopUp({ userId: user.id, amountUsd: 4.5 }),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.code, 'WALLET_TOPUP_BELOW_MINIMUM');
      assert.equal(error.details.minimumTopUpUsd, 5);
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

// An admin can still raise/lower the minimum afterward (the new default does not remove this
// existing control) - PATCH /commercial/wallet-rules already covers the HTTP route itself
// (commercial-admin-api-contract.test.mjs); this just confirms the default doesn't change how an
// override is applied.
test('an admin override still takes effect over the $5 default', async () => {
  const repo = createMemoryRepo();
  await repo.commercialConfig.publish('wallet:minimumTopUpUsd', { amount: 20 }, {});
  invalidateCommercialConfigCache();
  const rules = await getWalletRules(repo);
  assert.equal(rules.minimumTopUpUsd, 20);

  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  await assert.rejects(() => billing.createWalletTopUp({ userId: user.id, amountUsd: 10 }), { code: 'WALLET_TOPUP_BELOW_MINIMUM' });
  const result = await billing.createWalletTopUp({ userId: user.id, amountUsd: 20 });
  assert.equal(result.status, 'pending');
});

// The reported bug: the wallet offered a $5 amount chip while the server's configured floor was
// $10, so picking it produced "مبلغ خیلی کم است". The client could not know the floor up front -
// GET /api/sync/wallet returned only balances. It now serves minimumTopUpUsd from the SAME
// getWalletRules() both billing providers enforce against.
test('GET /api/sync/wallet serves the real minimumTopUpUsd alongside the balances, from getWalletRules()', async () => {
  const src = await read('server', 'community', 'routes.wallet.mjs');
  assert.match(src, /import \{ getWalletRules \} from '\.\.\/commercial\/commercial-config\.mjs'/);
  const idx = src.indexOf("app.get('/',");
  assert.ok(idx > -1);
  const handler = src.slice(idx, idx + 700);
  assert.match(handler, /getWalletRules\(repo\)/);
  assert.match(handler, /minimumTopUpUsd: walletRules\.minimumTopUpUsd/);
});

// Static/structural coverage for the client - this codebase's node:test harness does not render
// JSX (see header-wallet-balance-static.test.mjs's own comment for the established convention).
test('the top-up amount chips are filtered against the server minimum, never a hardcoded list', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  assert.match(src, /const TOPUP_PRESET_AMOUNTS = \[5, 10, 25, 50, 100\];/);
  const idx = src.indexOf('function topUpChoices(');
  assert.ok(idx > -1, 'topUpChoices must exist');
  const fn = src.slice(idx, idx + 400);
  assert.match(fn, /TOPUP_PRESET_AMOUNTS\.filter\(\(v\) => v >= min\)/, 'presets below the server floor must be dropped, not offered and then rejected');
  assert.match(src, /topUpChoices\(wallet\.minimumTopUpUsd\)\.map/, 'the rendered chips must come from the server-supplied minimum');
  assert.doesNotMatch(src, /\[5, 10, 25, 50\]\.map/, 'the old hardcoded chip list must be gone');
});

test('WalletCard validates the typed amount against the server minimum before the payment sheet can open', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const fnIdx = src.indexOf('function WalletCard(');
  assert.ok(fnIdx > -1, 'WalletCard must exist');
  const fn = src.slice(fnIdx, fnIdx + 12000);
  assert.match(fn, /const minTopUpUsd = Number\(wallet\.minimumTopUpUsd\)/);
  assert.match(fn, /const belowMinimum = !\(amountUsd >= minTopUpUsd\)/);
  assert.match(fn, /disabled=\{belowMinimum\}/, 'the CTA must be blocked while the amount is below the floor');
  assert.match(fn, /subTopUpMinHint/, 'the minimum must be stated inline while typing, not only after a rejection');
});

test('WalletCard still routes a server WALLET_TOPUP_BELOW_MINIMUM to the dedicated onBelowMinimum popup', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const fnIdx = src.indexOf('function WalletCard(');
  const fn = src.slice(fnIdx, fnIdx + 12000);
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

// Migration 049 exists because a stored override WINS over the default: a deployment previously
// set to $10 through the admin UI would otherwise keep rejecting the $5 the UI now offers.
test('migration 049 lowers an existing above-$5 minimumTopUpUsd override, and only that key', async () => {
  const sql = await read('server', 'db', 'migrations', '049_wallet_minimum_topup_5.sql');
  assert.match(sql, /UPDATE commercial_config_overrides/);
  assert.match(sql, /config_key = 'wallet:minimumTopUpUsd'/);
  assert.match(sql, /\(value ->> 'amount'\)::numeric > 5/, 'must only ever LOWER a floor above $5, never raise one an operator deliberately set lower');
});
