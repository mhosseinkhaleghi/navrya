import assert from 'node:assert/strict';
import test from 'node:test';
import { createPgRepo } from '../server/db/repo.pg.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { activateOrRenewSubscription } from '../server/commercial/subscription-service.mjs';

// Two payment-path defects found by the payment audit, each reproduced against the real code.
//
// 1. repo.pg.mjs's claimTxHash(): the plain UPDATE raises a unique_violation (23505) when another invoice already holds
//    the hash. That was never caught, so on the real database the answer to "this hash is already claimed" was a 500
//    COMMUNITY_API_FAILED (the memory repository the other tests run against answered correctly). It is also
//    case-insensitive now, since a transaction hash is the same transaction in any letter case.
// 2. activateOrRenewSubscription(): documented as "extends the period" but restarted the period from NOW, so renewing
//    the same plan before it ended silently forfeited the days the customer had already paid for.

// A scripted pg pool: `rules` is [ [predicate on the SQL text, () => result | throw] ... ], every call is recorded.
function scriptedPool(rules) {
  const calls = [];
  return {
    calls,
    async query(text, params) {
      calls.push({ text, params });
      for (const [matches, answer] of rules) if (matches(text)) return answer(params);
      throw new Error('unexpected query: ' + text);
    }
  };
}
const invoiceRow = (overrides) => ({ id: 'inv-1', transaction_id: 'tx-1', provider: 'bsc_crypto', chain_id: 56, asset_symbol: 'USDT', token_contract: '0xtoken', token_decimals: 18, recipient_address: '0xdeposit', atomic_amount: '1', usd_amount_micro_usd: 1, exchange_rate_snapshot: 1, status: 'pending', expires_at: new Date(), tx_hash: null, confirmation_count: 0, created_at: new Date(), confirmed_at: null, mismatch_credited_micro_usd: null, gateway_invoice_id: null, ...overrides });
const HASH = '0x' + 'ab'.repeat(32);
const isSelectOwn = (text) => /SELECT \* FROM crypto_invoices WHERE id=\$1/.test(text);
const isSelectTaken = (text) => /lower\(tx_hash\)/.test(text);
const isUpdate = (text) => /UPDATE crypto_invoices SET tx_hash/.test(text);

test('pg claimTxHash: a hash another invoice already holds is ANSWERED (claimedByOtherInvoice), never thrown as a 500 - both when the lookup sees it and when a concurrent claim wins the race', async () => {
  const seen = scriptedPool([[isSelectOwn, () => ({ rows: [invoiceRow()] })], [isSelectTaken, () => ({ rows: [{ id: 'other-invoice' }] })]]);
  const seenClaim = await createPgRepo(seen).cryptoInvoices.claimTxHash('inv-1', HASH);
  assert.deepEqual(seenClaim, { ok: false, claimedByOtherInvoice: true });
  assert.equal(seen.calls.some((call) => isUpdate(call.text)), false, 'nothing is written when the hash is taken');

  // The other invoice claims between our lookup and our UPDATE: the UNIQUE index raises 23505.
  const raced = scriptedPool([
    [isSelectOwn, () => ({ rows: [invoiceRow()] })], [isSelectTaken, () => ({ rows: [] })],
    [isUpdate, () => { throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }); }]
  ]);
  assert.deepEqual(await createPgRepo(raced).cryptoInvoices.claimTxHash('inv-1', HASH), { ok: false, claimedByOtherInvoice: true });
});

test('pg claimTxHash: the lookup is case-insensitive and the hash is stored lower-cased; a hash this invoice already holds (any case) is an idempotent success', async () => {
  const claiming = scriptedPool([[isSelectOwn, () => ({ rows: [invoiceRow()] })], [isSelectTaken, () => ({ rows: [] })], [isUpdate, (params) => ({ rows: [invoiceRow({ tx_hash: params[1] })] })]]);
  const claimed = await createPgRepo(claiming).cryptoInvoices.claimTxHash('inv-1', HASH.toUpperCase().replace('0X', '0x'));
  assert.equal(claimed.ok, true);
  assert.equal(claiming.calls.find((call) => isUpdate(call.text)).params[1], HASH, 'stored lower-cased');
  assert.deepEqual(claiming.calls.find((call) => isSelectTaken(call.text)).params, [HASH, 'inv-1'], 'looked up lower-cased, excluding this invoice');

  const legacy = scriptedPool([[isSelectOwn, () => ({ rows: [invoiceRow({ tx_hash: '0x' + 'AB'.repeat(32) })] })]]);
  const resumed = await createPgRepo(legacy).cryptoInvoices.claimTxHash('inv-1', HASH);
  assert.equal(resumed.ok, true, 'a mixed-case hash stored before this rule can still be resumed by its own invoice');
  assert.equal(legacy.calls.length, 1, 'no further query is needed');
});

test('pg claimTxHash: an invoice that already holds a DIFFERENT hash refuses a second claim, and an unexpected database error is not swallowed', async () => {
  const other = '0x' + 'cd'.repeat(32);
  const holding = scriptedPool([[isSelectOwn, () => ({ rows: [invoiceRow({ tx_hash: other })] })], [isSelectTaken, () => ({ rows: [] })], [isUpdate, () => ({ rows: [] })]]);
  assert.deepEqual(await createPgRepo(holding).cryptoInvoices.claimTxHash('inv-1', HASH), { ok: false, claimedByOtherInvoice: false });

  const failing = scriptedPool([[isSelectOwn, () => ({ rows: [invoiceRow()] })], [isSelectTaken, () => ({ rows: [] })], [isUpdate, () => { throw Object.assign(new Error('connection lost'), { code: '08006' }); }]]);
  await assert.rejects(createPgRepo(failing).cryptoInvoices.claimTxHash('inv-1', HASH), /connection lost/);
});

// ---- subscription renewal ------------------------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const transaction = (userId, id, overrides) => ({ id, userId, provider: 'manual', amountMicroUsd: 4990000, currency: 'USD', metadata: { planId: 'plus', billingInterval: 'month' }, ...overrides });
const monthAfter = (date) => { const end = new Date(date); end.setMonth(end.getMonth() + 1); return end; };

test('renewing the SAME plan before it ends EXTENDS the paid period from its current end - the days already paid for are not forfeited', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Early Renewer' });
  const first = await activateOrRenewSubscription(repo, transaction(user.id, 'tx-1'));
  // Ten days into the month, the customer renews.
  const tenDaysLeftOfOriginal = new Date(Date.now() + 20 * DAY);
  await repo.subscriptions.update(first.id, { currentPeriodEnd: tenDaysLeftOfOriginal.toISOString() });
  const renewed = await activateOrRenewSubscription(repo, transaction(user.id, 'tx-2'));

  assert.equal(renewed.id, first.id, 'still the same subscription, renewed in place');
  assert.equal(new Date(renewed.currentPeriodEnd).getTime(), monthAfter(tenDaysLeftOfOriginal).getTime(), 'one more interval added to the CURRENT end (20 days left + a month), not to now');
  assert.equal(new Date(renewed.currentPeriodStart).toISOString(), new Date(first.currentPeriodStart).toISOString(), 'the same continuous period keeps its start');
  assert.equal(renewed.paymentTransactionId, 'tx-2');
  assert.equal(renewed.status, 'active');
});

test('a yearly renewal extends by a year from the current end, and a renewal of a period that is cancelling clears the cancellation', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Yearly Renewer' });
  const first = await activateOrRenewSubscription(repo, transaction(user.id, 'tx-1', { metadata: { planId: 'pro', billingInterval: 'year' } }));
  await repo.subscriptions.update(first.id, { cancelAtPeriodEnd: true });
  const end = new Date(first.currentPeriodEnd);
  const renewed = await activateOrRenewSubscription(repo, transaction(user.id, 'tx-2', { metadata: { planId: 'pro', billingInterval: 'year' } }));
  const expected = new Date(end); expected.setFullYear(expected.getFullYear() + 1);
  assert.equal(new Date(renewed.currentPeriodEnd).getTime(), expected.getTime());
  assert.equal(renewed.cancelAtPeriodEnd, false);
});

test('a first purchase, and a switch to a DIFFERENT plan, still start a fresh period from now (only a same-plan renewal extends)', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Switcher' });
  const before = Date.now();
  const first = await activateOrRenewSubscription(repo, transaction(user.id, 'tx-1'));
  assert.ok(Math.abs(new Date(first.currentPeriodEnd).getTime() - monthAfter(new Date(before)).getTime()) < 5000);
  const other = await activateOrRenewSubscription(repo, transaction(user.id, 'tx-2', { metadata: { planId: 'pro', billingInterval: 'month' } }));
  assert.notEqual(other.id, first.id, 'a different plan keeps its own history row');
  assert.ok(Math.abs(new Date(other.currentPeriodEnd).getTime() - monthAfter(new Date()).getTime()) < 5000, 'a new plan starts now');
});
