import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { ManualBillingProvider } from '../server/commercial/manual-billing-provider.mjs';
import { BscCryptoBillingProvider } from '../server/commercial/bsc-crypto-billing-provider.mjs';
import { confirmTransaction, failTransaction } from '../server/commercial/payment-service.mjs';
import { checkInvoicePayment } from '../server/commercial/crypto-invoice-service.mjs';
import { resolveUserEntitlements } from '../server/commercial/entitlement-resolver.mjs';
import {
  newRepo, makeUser, makeAdmin, makeCode, assertApiError, assertStats, setPlanBonus, setPlanPrice, ledgerEntries,
  setBscConfig, mockRpc, makeReceipt, withApp, ORIGINAL_FETCH, TX_HASH_A,
  HOUR_MS, MINUTE_MS, PRO_15_DISCOUNT, PRO_15_FINAL
} from './helpers/discount-fixtures.mjs';

// Reservation / release / expiry / late-payment / refund semantics of discounted subscription
// checkout, at the service level (real providers + confirmTransaction over the memory repo). Time is
// driven with node:test's mocked Date - never sleeps.
//
// Approved decisions under test:
//   - Manual hold = 24h; BSC hold = the invoice expiry. A lapsed hold stops counting immediately.
//   - STRICT LATE-PAYMENT RULE: if a limited-code hold lapsed AND its slot was reused, the subscription
//     is NOT activated; the verified payment is credited to the paid wallet exactly once (TOP_UP with
//     sourceAction 'discount-capacity-lost'), the transaction is failed, and the outcome is visible.
//   - A refunded redemption stays consumed (one redemption per user, capacity not returned).

afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

test('a pending discounted checkout holds capacity; failing the transaction releases it, and the released user is not penalised', async () => {
  const repo = newRepo();
  const manual = new ManualBillingProvider(repo);
  const code = await makeCode(repo, { code: 'HOLD1', maxRedemptions: 1 });
  const [a, b] = await Promise.all([makeUser(repo, 'A'), makeUser(repo, 'B')]);

  const first = await manual.createSubscription({ userId: a.id, planId: 'pro', discountCode: 'HOLD1' });
  await assertApiError(manual.createSubscription({ userId: b.id, planId: 'pro', discountCode: 'HOLD1' }), { status: 409, code: 'DISCOUNT_CODE_EXHAUSTED' });
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 0, pendingReservations: 1, remaining: 0 });

  const failed = await failTransaction(repo, first.transactionId);
  assert.equal(failed.transaction.status, 'failed');
  const row = await repo.discountRedemptions.getByTransactionId(first.transactionId);
  assert.equal(row.status, 'released');
  assert.equal(row.releaseReason, 'transaction_failed');
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 0, pendingReservations: 0, remaining: 1 });

  assert.equal((await manual.createSubscription({ userId: b.id, planId: 'pro', discountCode: 'HOLD1' })).status, 'pending');
});

test('a released user may check out with the same code again (a failed checkout never consumed their one redemption)', async () => {
  const repo = newRepo();
  const manual = new ManualBillingProvider(repo);
  await makeCode(repo, { code: 'AGAIN', maxRedemptions: 5 });
  const user = await makeUser(repo, 'Retrier');
  const first = await manual.createSubscription({ userId: user.id, planId: 'pro', discountCode: 'AGAIN' });
  await failTransaction(repo, first.transactionId);
  const retry = await manual.createSubscription({ userId: user.id, planId: 'pro', discountCode: 'AGAIN' });
  assert.equal(retry.status, 'pending');
  assert.notEqual(retry.transactionId, first.transactionId);
});

test('confirming consumes the slot for good; a later fail on a confirmed transaction is inert and releases nothing', async () => {
  const repo = newRepo();
  const manual = new ManualBillingProvider(repo);
  const code = await makeCode(repo, { code: 'TAKEN', maxRedemptions: 1 });
  const [a, b] = await Promise.all([makeUser(repo, 'A'), makeUser(repo, 'B')]);
  const first = await manual.createSubscription({ userId: a.id, planId: 'pro', discountCode: 'TAKEN' });

  await confirmTransaction(repo, first.transactionId);
  assert.equal((await repo.subscriptions.getActiveForUser(a.id)).planId, 'pro');
  assert.equal((await repo.discountRedemptions.getByTransactionId(first.transactionId)).status, 'confirmed');
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 1, pendingReservations: 0, remaining: 0 });

  assert.equal((await failTransaction(repo, first.transactionId)).alreadyProcessed, true);
  assert.equal((await repo.discountRedemptions.getByTransactionId(first.transactionId)).status, 'confirmed');
  await assertApiError(manual.createSubscription({ userId: b.id, planId: 'pro', discountCode: 'TAKEN' }), { status: 409, code: 'DISCOUNT_CODE_EXHAUSTED' });
});

test('MANUAL hold is 24 hours: still held at 23h59m, released for others at 24h01m', async (t) => {
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const repo = newRepo();
  const manual = new ManualBillingProvider(repo);
  const code = await makeCode(repo, { code: 'DAYHOLD', maxRedemptions: 1 });
  const [a, b] = await Promise.all([makeUser(repo, 'Holder'), makeUser(repo, 'Waiter')]);
  const first = await manual.createSubscription({ userId: a.id, planId: 'pro', discountCode: 'DAYHOLD' });

  t.mock.timers.setTime(start + 24 * HOUR_MS - MINUTE_MS);
  await assertApiError(manual.createSubscription({ userId: b.id, planId: 'pro', discountCode: 'DAYHOLD' }), { status: 409, code: 'DISCOUNT_CODE_EXHAUSTED' });

  t.mock.timers.setTime(start + 24 * HOUR_MS + MINUTE_MS);
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 0, pendingReservations: 0, remaining: 1 });
  assert.equal((await manual.createSubscription({ userId: b.id, planId: 'pro', discountCode: 'DAYHOLD' })).status, 'pending');
  const swept = await repo.discountRedemptions.getByTransactionId(first.transactionId);
  assert.equal(swept.status, 'expired');
  assert.equal(swept.releaseReason, 'hold_lapsed');
});

test('BSC invoice expiry: the transaction stays pending (existing behavior) but the hold lapses with the invoice and the slot frees', async (t) => {
  const repo = newRepo();
  await setBscConfig(repo, { invoiceExpiryMinutes: 30 });
  mockRpc({ chainId: 56 });
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const bsc = new BscCryptoBillingProvider(repo);
  const code = await makeCode(repo, { code: 'INVOICE', maxRedemptions: 1 });
  const [a, b] = await Promise.all([makeUser(repo, 'Payer'), makeUser(repo, 'Next')]);
  const first = await bsc.createSubscription({ userId: a.id, planId: 'pro', discountCode: 'INVOICE' });

  t.mock.timers.setTime(start + 29 * MINUTE_MS);
  await assertApiError(bsc.createSubscription({ userId: b.id, planId: 'pro', discountCode: 'INVOICE' }), { status: 409, code: 'DISCOUNT_CODE_EXHAUSTED' });

  t.mock.timers.setTime(start + 31 * MINUTE_MS);
  const expired = await checkInvoicePayment(repo, first.invoiceId, {});
  assert.equal(expired.status, 'expired');
  assert.equal((await repo.paymentTransactions.get(first.transactionId)).status, 'pending', 'invoice expiry does not fail the transaction');
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 0, pendingReservations: 0, remaining: 1 });
  assert.ok((await bsc.createSubscription({ userId: b.id, planId: 'pro', discountCode: 'INVOICE' })).invoiceId, 'the freed slot can be taken');
});

test('BSC late payment: an expired-hold payment RE-CLAIMS the slot when nobody took it, and the subscription activates normally', async (t) => {
  const repo = newRepo();
  await setBscConfig(repo, { invoiceExpiryMinutes: 30 });
  mockRpc({ chainId: 56 });
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const bsc = new BscCryptoBillingProvider(repo);
  const code = await makeCode(repo, { code: 'SLOWPAY', maxRedemptions: 1 });
  const user = await makeUser(repo, 'Slow Payer');
  const checkout = await bsc.createSubscription({ userId: user.id, planId: 'pro', discountCode: 'SLOWPAY' });

  t.mock.timers.setTime(start + 45 * MINUTE_MS);
  mockRpc({ chainId: 56, blockNumber: 105, receipt: makeReceipt({ blockNumber: 100, amount: 12_741_500n * 10n ** 12n }) });
  const result = await checkInvoicePayment(repo, checkout.invoiceId, { txHash: TX_HASH_A });
  assert.equal(result.status, 'confirmed');
  assert.equal((await repo.subscriptions.getActiveForUser(user.id)).planId, 'pro');
  assert.equal((await repo.discountRedemptions.getByTransactionId(checkout.transactionId)).status, 'confirmed');
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 1, pendingReservations: 0, remaining: 0 });
});

// Builds the strict-rule scenario: A's Manual hold lapses (25h), B reuses the only slot and pays.
async function lostLateScenario(t) {
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const repo = newRepo();
  await setPlanBonus(repo, 'pro', 5); // configured, to prove a purchase that never happened grants no bonus
  const code = await makeCode(repo, { code: 'LATE15', maxRedemptions: 1 });
  const [a, b] = await Promise.all([makeUser(repo, 'Late Payer'), makeUser(repo, 'Early Payer')]);
  const manual = new ManualBillingProvider(repo);
  const first = await manual.createSubscription({ userId: a.id, planId: 'pro', discountCode: 'late15' });
  t.mock.timers.setTime(start + 25 * HOUR_MS);
  const second = await manual.createSubscription({ userId: b.id, planId: 'pro', discountCode: 'LATE15' });
  await confirmTransaction(repo, second.transactionId);
  return { repo, code, a, b, first, second };
}

test('STRICT RULE (Manual): a verified late payment whose slot was reused fails the transaction, credits the wallet exactly once, grants no subscription and no bonus, and never exceeds the cap', async (t) => {
  const { repo, code, a, first } = await lostLateScenario(t);
  const before = await repo.wallet.getAccount(a.id);

  // five simultaneous duplicate confirmations - exactly-once must hold under concurrency too
  const results = await Promise.all(Array.from({ length: 5 }, () => confirmTransaction(repo, first.transactionId, { adminUserId: null })));

  const transaction = await repo.paymentTransactions.get(first.transactionId);
  assert.equal(transaction.status, 'failed');
  assert.equal(await repo.subscriptions.getActiveForUser(a.id), null, 'no subscription was activated');
  assert.equal((await resolveUserEntitlements(a.id, repo)).plan, 'free');

  const after = await repo.wallet.getAccount(a.id);
  assert.equal(after.paidBalanceMicroUsd - before.paidBalanceMicroUsd, PRO_15_FINAL, 'the verified payment is credited to the paid wallet, once');
  assert.equal(after.promoBalanceMicroUsd, before.promoBalanceMicroUsd, 'no wallet bonus for a purchase that did not happen');
  const credits = await ledgerEntries(repo, a.id, 'TOP_UP');
  assert.equal(credits.length, 1);
  assert.equal(credits[0].sourceAction, 'discount-capacity-lost');
  assert.equal(credits[0].idempotencyKey, 'discount-lost:' + first.transactionId);
  assert.equal(credits[0].metadata.transactionId, first.transactionId);
  assert.equal((await ledgerEntries(repo, a.id, 'SUBSCRIPTION_BONUS')).length, 0);

  const reported = results.filter((result) => result.discountLost === true);
  assert.ok(reported.length >= 1, 'the outcome is reported to the caller, not swallowed');
  reported.forEach((result) => {
    assert.equal(result.creditedMicroUsd, PRO_15_FINAL);
    assert.equal(result.transaction.status, 'failed');
  });

  const again = await confirmTransaction(repo, first.transactionId);
  assert.equal(again.alreadyProcessed, true);
  assert.equal((await ledgerEntries(repo, a.id, 'TOP_UP')).length, 1, 'a later duplicate credits nothing');

  assert.notEqual((await repo.discountRedemptions.getByTransactionId(first.transactionId)).status, 'confirmed');
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 1, pendingReservations: 0, remaining: 0 });
});

test('STRICT RULE (BSC): the verified on-chain payment ends as mismatched_credited - invoice failed, wallet credited, no subscription', async (t) => {
  const repo = newRepo();
  await setBscConfig(repo, { invoiceExpiryMinutes: 30 });
  mockRpc({ chainId: 56 });
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  await setPlanBonus(repo, 'pro', 5);
  const bsc = new BscCryptoBillingProvider(repo);
  const code = await makeCode(repo, { code: 'BSCLATE', maxRedemptions: 1 });
  const [a, b] = await Promise.all([makeUser(repo, 'Late Crypto Payer'), makeUser(repo, 'Early Crypto Payer')]);
  const first = await bsc.createSubscription({ userId: a.id, planId: 'pro', discountCode: 'bsclate' });
  t.mock.timers.setTime(start + 31 * MINUTE_MS);
  const second = await bsc.createSubscription({ userId: b.id, planId: 'pro', discountCode: 'BSCLATE' });
  await confirmTransaction(repo, second.transactionId);

  mockRpc({ chainId: 56, blockNumber: 105, receipt: makeReceipt({ blockNumber: 100, amount: 12_741_500n * 10n ** 12n }) });
  const result = await checkInvoicePayment(repo, first.invoiceId, { txHash: TX_HASH_A });
  assert.equal(result.status, 'mismatched_credited');
  assert.equal(result.creditedMicroUsd, PRO_15_FINAL);

  const invoice = await repo.cryptoInvoices.get(first.invoiceId);
  assert.equal(invoice.status, 'failed');
  assert.equal(invoice.mismatchCreditedMicroUsd, PRO_15_FINAL);
  assert.equal((await repo.paymentTransactions.get(first.transactionId)).status, 'failed');
  assert.equal(await repo.subscriptions.getActiveForUser(a.id), null);
  assert.equal((await ledgerEntries(repo, a.id, 'TOP_UP')).length, 1);
  assert.equal((await ledgerEntries(repo, a.id, 'SUBSCRIPTION_BONUS')).length, 0);

  const repoll = await checkInvoicePayment(repo, first.invoiceId, {});
  assert.equal(repoll.status, 'mismatched_credited', 'later polls keep reporting the same outcome');
  assert.equal(repoll.creditedMicroUsd, PRO_15_FINAL);
  assert.equal((await ledgerEntries(repo, a.id, 'TOP_UP')).length, 1);
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 1, pendingReservations: 0, remaining: 0 });
});

test('the lost-late-payment outcome is VISIBLE: admin transaction list, customer billing history and the customer wallet ledger all show it', async (t) => {
  const { repo, a, second, first } = await lostLateScenario(t);
  await confirmTransaction(repo, first.transactionId);
  t.mock.timers.reset();
  const admin = await makeAdmin(repo, 'Visibility Admin');

  await withApp(async ({ api }) => {
    const adminList = await api('GET', '/api/admin/commercial/transactions', { userId: admin.id });
    assert.equal(adminList.status, 200);
    const lost = adminList.body.transactions.find((row) => row.id === first.transactionId);
    assert.equal(lost.status, 'failed');
    assert.equal(lost.discountOutcome.reason, 'DISCOUNT_CAPACITY_LOST');
    assert.equal(lost.discountOutcome.creditedMicroUsd, PRO_15_FINAL);
    const winner = adminList.body.transactions.find((row) => row.id === second.transactionId);
    assert.ok(winner.discountOutcome == null, 'a normal purchase carries no discount outcome');

    const history = await api('GET', '/api/sync/wallet/transactions', { userId: a.id });
    const own = history.body.transactions.find((row) => row.id === first.transactionId);
    assert.equal(own.status, 'failed');
    assert.equal(own.discountOutcome.reason, 'DISCOUNT_CAPACITY_LOST');
    assert.equal(own.discountOutcome.creditedMicroUsd, PRO_15_FINAL);

    const ledger = await api('GET', '/api/sync/wallet/ledger', { userId: a.id });
    assert.ok(ledger.body.entries.some((entry) => entry.type === 'TOP_UP' && entry.sourceAction === 'discount-capacity-lost' && entry.cashDeltaMicroUsd === PRO_15_FINAL));
  }, { repo });
});

test('an admin edit between checkout and confirmation never changes what was quoted: price, discount, code terms and bonus all come from the snapshot', async () => {
  const repo = newRepo();
  const manual = new ManualBillingProvider(repo);
  await setPlanBonus(repo, 'pro', 3);
  const code = await makeCode(repo, { code: 'SNAPSHOT', maxRedemptions: 5 });
  const user = await makeUser(repo, 'Snapshot Buyer');
  const checkout = await manual.createSubscription({ userId: user.id, planId: 'pro', discountCode: 'SNAPSHOT' });
  const before = await repo.wallet.getAccount(user.id);

  await setPlanPrice(repo, 'pro', 99);
  await setPlanBonus(repo, 'pro', 50);
  await repo.discountCodes.update(code.id, { discountValue: 5000, active: false });

  await confirmTransaction(repo, checkout.transactionId);
  const subscription = await repo.subscriptions.getActiveForUser(user.id);
  assert.equal(subscription.planId, 'pro');
  assert.equal(subscription.priceAmountMicroUsd, PRO_15_FINAL, 'the subscription records what was actually charged');
  const after = await repo.wallet.getAccount(user.id);
  assert.equal(after.promoBalanceMicroUsd - before.promoBalanceMicroUsd, 3_000_000, 'the bonus granted is the snapshot, not today\'s plan setting');
  const redemption = await repo.discountRedemptions.getByTransactionId(checkout.transactionId);
  assert.equal(redemption.status, 'confirmed', 'a deactivated code does not void an already-issued checkout');
  assert.equal(redemption.discountAmountMicroUsd, PRO_15_DISCOUNT);
});

test('a user with a live discounted checkout cannot start a second one with the same code: RESERVATION_PENDING names the pending transaction', async () => {
  const repo = newRepo();
  const manual = new ManualBillingProvider(repo);
  await makeCode(repo, { code: 'ONCE', maxRedemptions: 5 });
  const user = await makeUser(repo, 'Impatient');
  const first = await manual.createSubscription({ userId: user.id, planId: 'pro', discountCode: 'ONCE' });
  await assertApiError(
    manual.createSubscription({ userId: user.id, planId: 'plus', discountCode: 'ONCE' }),
    { status: 409, code: 'DISCOUNT_CODE_RESERVATION_PENDING', details: { transactionId: first.transactionId } }
  );
  assert.equal((await repo.paymentTransactions.listForUser(user.id)).length, 1);
});

test('REFUND: refunds exactly what was charged, revokes the plan, and the redemption stays consumed - the user cannot redeem again and the slot is not returned', async () => {
  const repo = newRepo();
  const manual = new ManualBillingProvider(repo);
  const code = await makeCode(repo, { code: 'REFUNDME', maxRedemptions: 1 });
  const [a, b] = await Promise.all([makeUser(repo, 'Refunded Buyer'), makeUser(repo, 'Next Buyer')]);
  const checkout = await manual.createSubscription({ userId: a.id, planId: 'pro', discountCode: 'REFUNDME' });
  await confirmTransaction(repo, checkout.transactionId);

  await assertApiError(manual.refund({ transactionId: checkout.transactionId, amountUsd: 14.99 }), { status: 400, code: 'PARTIAL_REFUND_NOT_SUPPORTED' });
  const refund = await manual.refund({ transactionId: checkout.transactionId, amountUsd: 12.7415 });
  assert.equal((await repo.paymentTransactions.get(refund.transactionId)).amountMicroUsd, PRO_15_FINAL, 'the refund is for the discounted amount actually paid');
  await confirmTransaction(repo, refund.transactionId, { adminUserId: 'admin-1' });

  assert.equal(await repo.subscriptions.getActiveForUser(a.id), null);
  assert.equal((await resolveUserEntitlements(a.id, repo)).plan, 'free');
  const redemption = await repo.discountRedemptions.getByTransactionId(checkout.transactionId);
  assert.equal(redemption.status, 'confirmed');
  assert.ok(redemption.refundedAt, 'the refund is recorded on the redemption');
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 1, pendingReservations: 0, remaining: 0 });
  await assertApiError(manual.createSubscription({ userId: a.id, planId: 'pro', discountCode: 'REFUNDME' }), { status: 409, code: 'DISCOUNT_CODE_ALREADY_USED' });
  await assertApiError(manual.createSubscription({ userId: b.id, planId: 'pro', discountCode: 'REFUNDME' }), { status: 409, code: 'DISCOUNT_CODE_EXHAUSTED' });
});

test('REFUND of a zero-price subscription revokes the entitlement and keeps the redemption consumed', async () => {
  const repo = newRepo();
  const manual = new ManualBillingProvider(repo);
  const code = await makeCode(repo, { code: 'FREEPRO', discountValue: 10000, maxRedemptions: 1 });
  const user = await makeUser(repo, 'Free Buyer');
  const checkout = await manual.createSubscription({ userId: user.id, planId: 'pro', discountCode: 'FREEPRO' });
  assert.equal(checkout.status, 'confirmed');
  assert.equal((await repo.subscriptions.getActiveForUser(user.id)).planId, 'pro');

  const refund = await manual.refund({ transactionId: checkout.transactionId });
  await confirmTransaction(repo, refund.transactionId, { adminUserId: 'admin-1' });
  assert.equal(await repo.subscriptions.getActiveForUser(user.id), null);
  assert.equal((await repo.discountRedemptions.getByTransactionId(checkout.transactionId)).status, 'confirmed');
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 1, pendingReservations: 0, remaining: 0 });
});
