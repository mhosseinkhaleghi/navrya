import assert from 'node:assert/strict';
import test from 'node:test';
import { ManualBillingProvider } from '../server/commercial/manual-billing-provider.mjs';
import { confirmTransaction } from '../server/commercial/payment-service.mjs';
import { repairSubscriptionBonus } from '../server/commercial/subscription-bonus.mjs';
import { newRepo, makeAdmin, ledgerEntries, withApp, assertApiError } from './helpers/discount-fixtures.mjs';
import {
  M, requireLotDomain, freshUser, balances, buyBonus, buyBonusWithoutGrant, reserveAi, settleAi, spendAi, refundPurchase, lotFor, allocationsFor,
  assertLotInvariants, runModelScenario
} from './helpers/bonus-lot-fixtures.mjs';

// Subscription-bonus LOT accounting (migration 065). Replaces the earlier refund rule that reversed the WHOLE bonus
// and could leave a negative promo balance after the user had spent part of it on AI analyses.
//
// Business rule under test:
//   - A confirmed paid subscription grants its wallet bonus as before, now as a LOT linked to the payment transaction
//     and to the SUBSCRIPTION_BONUS ledger grant (original / consumed / reversed / remaining).
//   - AI settlement tracks, server-side, how much of each lot a charge consumed (immutable allocation records).
//     Deterministic order: ACTIVE lots first, FIFO by grant time (ties: insertion order), then generic promo
//     (signup / admin credit) as before, then the paid balance.
//   - Refund reverses ONLY the lot's unspent remainder. Fully consumed => a zero-amount reversal entry (auditable),
//     no debit of generic promo or of the paid balance. Nothing consumed => the full bonus, as before.
//   - The reversal never reads the aggregate promo balance: signup/admin promo is never mistaken for bonus remainder.
//
// Repository surface (identical in repo.memory.mjs and repo.pg.mjs):
//   repo.subscriptionBonus.grant({ userId, transactionId, amountMicroUsd, planId })
//        -> { ok, granted, duplicate, lot } | { ok: false, reason: 'REFUNDED' }
//   repo.subscriptionBonus.reverseForRefund({ transactionId, refundTransactionId, adminUserId })
//        -> { ok, reversed, duplicate, reason: 'NO_LOT', lot, reversedMicroUsd, fullyConsumed }
//   repo.subscriptionBonus.getByTransactionId(txId) / listByTransactionIds(ids) -> lot(s)
//        lot = { id, userId, transactionId, grantLedgerId, originalMicroUsd, consumedMicroUsd, reversedMicroUsd,
//                remainingMicroUsd, status: 'active' | 'reversed', grantedAt, reversedAt, reversalLedgerId, refundTransactionId }
//   repo.subscriptionBonus.allocationsForLedgerIds(ledgerIds) -> [{ id, lotId, transactionId, ledgerId, userId, amountMicroUsd }]
//   repo.wallet.settle(...) additionally returns { subscriptionBonusUsedMicroUsd, subscriptionBonusAllocations }

const BONUS = M(5);

// ---- repository surface --------------------------------------------------------------------------------------------

test('repo.subscriptionBonus exists with the documented methods, and offers no way to edit or delete an allocation', () => {
  const repo = newRepo();
  requireLotDomain(repo);
  ['grant', 'reverseForRefund', 'getByTransactionId', 'listByTransactionIds', 'allocationsForLedgerIds'].forEach((method) => {
    assert.equal(typeof repo.subscriptionBonus[method], 'function', method + ' must exist');
  });
  Object.keys(repo.subscriptionBonus).forEach((method) => {
    assert.doesNotMatch(method, /^(update|delete|remove|set|edit|patch)/i, method + ' would let an allocation be rewritten - allocations are immutable');
  });
});

test('lots and allocations are returned as copies: mutating a returned record never changes the stored accounting', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Copy Buyer', { paidMicroUsd: M(10) });
  const txId = await buyBonus(repo, user.id, BONUS);
  await spendAi(repo, user.id, M(1));
  const lot = await lotFor(repo, txId);
  lot.consumedMicroUsd = 0; lot.originalMicroUsd = 1;
  const [allocation] = await allocationsFor(repo, user.id, lot.id);
  allocation.amountMicroUsd = 999;
  const again = await lotFor(repo, txId);
  assert.equal(again.originalMicroUsd, BONUS);
  assert.equal(again.consumedMicroUsd, M(1));
  assert.equal((await allocationsFor(repo, user.id, lot.id))[0].amountMicroUsd, M(1));
});

// ---- grant -----------------------------------------------------------------------------------------------------------

test('a confirmed paid subscription creates ONE lot, linked to its transaction and to its SUBSCRIPTION_BONUS ledger grant', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Lot Buyer');
  const txId = await buyBonus(repo, user.id, BONUS);
  const lot = await assertLotInvariants(repo, user.id, txId);
  assert.equal(lot.userId, user.id);
  assert.equal(lot.transactionId, txId);
  assert.equal(lot.originalMicroUsd, BONUS);
  assert.equal(lot.consumedMicroUsd, 0);
  assert.equal(lot.remainingMicroUsd, BONUS);
  assert.equal(lot.reversedMicroUsd, 0);
  assert.equal(lot.status, 'active');
  assert.equal(lot.reversalLedgerId, null);
  assert.ok(lot.grantedAt, 'the lot records when it was granted (the FIFO key)');
  assert.deepEqual(await balances(repo, user.id), { paid: 0, promo: BONUS }, 'the wallet grant itself is unchanged: BONUS to the promo balance');
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS')).length, 1);
});

test('no bonus configured, or a zero-price purchase, creates no lot at all (approved rule: zero-price earns nothing)', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'No Lot Buyer');
  const noBonus = await buyBonus(repo, user.id, 0);
  const zeroPrice = await buyBonus(repo, user.id, BONUS, { amountMicroUsd: 0 });
  requireLotDomain(repo);
  assert.equal(await repo.subscriptionBonus.getByTransactionId(noBonus), null);
  assert.equal(await repo.subscriptionBonus.getByTransactionId(zeroPrice), null);
  assert.deepEqual(await balances(repo, user.id), { paid: 0, promo: 0 });
});

test('duplicate confirmation, and a direct second grant, credit and record the lot exactly once (sequential and concurrent)', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Dup Buyer');
  const txId = await buyBonus(repo, user.id, BONUS, { confirm: false });
  await Promise.all(Array.from({ length: 5 }, () => confirmTransaction(repo, txId)));
  await confirmTransaction(repo, txId);
  const lot = await assertLotInvariants(repo, user.id, txId);
  assert.equal(lot.originalMicroUsd, BONUS);
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS')).length, 1);
  assert.equal((await balances(repo, user.id)).promo, BONUS);

  const again = await repo.subscriptionBonus.grant({ userId: user.id, transactionId: txId, amountMicroUsd: BONUS, planId: 'pro' });
  assert.equal(again.ok, true);
  assert.equal(again.duplicate, true);
  assert.equal(again.granted, false);
  assert.equal((await balances(repo, user.id)).promo, BONUS, 'a replayed grant credits nothing');
});

// ---- settlement: allocation --------------------------------------------------------------------------------------------

test('settlement with no lot behaves exactly as before: promo first, then paid, no allocation, nothing bonus-related reported', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Plain Spender', { paidMicroUsd: M(10), promoMicroUsd: M(1) });
  const { reservationId, settled } = await spendAi(repo, user.id, M(3));
  assert.deepEqual(await balances(repo, user.id), { paid: M(10) - M(2), promo: 0 });
  assert.equal(settled.subscriptionBonusUsedMicroUsd, 0);
  assert.deepEqual(settled.subscriptionBonusAllocations, []);
  assert.deepEqual(await allocationsFor(repo, user.id), []);
  const entry = (await ledgerEntries(repo, user.id, 'AI_SETTLEMENT'))[0];
  assert.equal(entry.idempotencyKey, 'ai-settle:' + reservationId);
  assert.equal(entry.promoDeltaMicroUsd, -M(1));
  assert.equal(entry.cashDeltaMicroUsd, -M(2));
});

test('the bonus lot is consumed BEFORE generic promo, and the allocation record links the exact settlement to the exact amount', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Lot First', { paidMicroUsd: M(10), promoMicroUsd: M(3) });
  const txId = await buyBonus(repo, user.id, BONUS);
  const { settled } = await spendAi(repo, user.id, M(2));

  const lot = await assertLotInvariants(repo, user.id, txId);
  assert.equal(lot.consumedMicroUsd, M(2), 'the whole charge came out of the bonus lot');
  assert.equal(lot.remainingMicroUsd, M(3));
  assert.deepEqual(await balances(repo, user.id), { paid: M(10), promo: M(3) + BONUS - M(2) });
  assert.equal(settled.subscriptionBonusUsedMicroUsd, M(2));
  assert.deepEqual(settled.subscriptionBonusAllocations, [{ lotId: lot.id, transactionId: txId, amountMicroUsd: M(2) }]);
  const allocations = await allocationsFor(repo, user.id);
  assert.equal(allocations.length, 1);
  assert.equal(allocations[0].ledgerId, settled.ledgerEntry.id);
  assert.equal(allocations[0].lotId, lot.id);
  assert.equal(allocations[0].userId, user.id);
  assert.equal(allocations[0].amountMicroUsd, M(2));
});

test('one charge spanning lot + generic promo + paid allocates only the lot part to the lot', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Spanner', { paidMicroUsd: M(10), promoMicroUsd: M(3) });
  const txId = await buyBonus(repo, user.id, BONUS);
  const { settled } = await spendAi(repo, user.id, M(9)); // 5 lot + 3 generic promo + 1 paid
  assert.equal(settled.subscriptionBonusUsedMicroUsd, BONUS);
  assert.equal(settled.ledgerEntry.promoDeltaMicroUsd, -M(8));
  assert.equal(settled.ledgerEntry.cashDeltaMicroUsd, -M(1));
  const lot = await assertLotInvariants(repo, user.id, txId);
  assert.equal(lot.consumedMicroUsd, BONUS);
  assert.equal(lot.remainingMicroUsd, 0);
  assert.deepEqual(await balances(repo, user.id), { paid: M(9), promo: 0 });
});

test('several lots are consumed in deterministic FIFO order across settlements', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Fifo', { paidMicroUsd: M(30) });
  const a = await buyBonus(repo, user.id, M(5));
  const b = await buyBonus(repo, user.id, M(3));
  const c = await buyBonus(repo, user.id, M(2));

  const first = await spendAi(repo, user.id, M(6.5));
  assert.deepEqual(first.settled.subscriptionBonusAllocations.map((x) => [x.transactionId, x.amountMicroUsd]), [[a, M(5)], [b, M(1.5)]], 'oldest lot first, then the next');
  const second = await spendAi(repo, user.id, M(2));
  assert.deepEqual(second.settled.subscriptionBonusAllocations.map((x) => [x.transactionId, x.amountMicroUsd]), [[b, M(1.5)], [c, M(0.5)]]);

  assert.deepEqual([(await assertLotInvariants(repo, user.id, a)).consumedMicroUsd, (await assertLotInvariants(repo, user.id, b)).consumedMicroUsd,
    (await assertLotInvariants(repo, user.id, c)).consumedMicroUsd], [M(5), M(3), M(0.5)]);
  assert.equal((await balances(repo, user.id)).promo, M(1.5));
});

test('lots granted at the SAME instant fall back to insertion order, and a reversed lot is skipped even though it is the oldest', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-19T10:00:00.000Z') });
  const repo = newRepo();
  const user = await freshUser(repo, 'Tie', { paidMicroUsd: M(30) });
  const a = await buyBonus(repo, user.id, M(4));
  const b = await buyBonus(repo, user.id, M(4));
  assert.equal((await lotFor(repo, a)).grantedAt, (await lotFor(repo, b)).grantedAt, 'precondition: identical grant timestamps');
  const first = await spendAi(repo, user.id, M(1));
  assert.deepEqual(first.settled.subscriptionBonusAllocations.map((x) => x.transactionId), [a], 'insertion order breaks the tie deterministically');

  await refundPurchase(repo, a);
  const second = await spendAi(repo, user.id, M(2));
  assert.deepEqual(second.settled.subscriptionBonusAllocations.map((x) => [x.transactionId, x.amountMicroUsd]), [[b, M(2)]], 'a refunded lot no longer absorbs charges');
  await assertLotInvariants(repo, user.id, a);
  await assertLotInvariants(repo, user.id, b);
});

test('a lot with an earlier grant time is consumed first even when it was inserted later (grant time, not id or insertion, is the key)', async (t) => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Clock', { paidMicroUsd: M(30) });
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-19T10:00:00.000Z') });
  const later = await buyBonus(repo, user.id, M(4));
  t.mock.timers.reset();
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-19T09:00:00.000Z') });
  const earlier = await buyBonus(repo, user.id, M(4));
  const { settled } = await spendAi(repo, user.id, M(1));
  assert.deepEqual(settled.subscriptionBonusAllocations.map((x) => x.transactionId), [earlier]);
  assert.equal((await lotFor(repo, later)).consumedMicroUsd, 0);
});

test('amounts stay integer microUSD: an odd charge is consumed and reversed to the exact micro-dollar', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Odd Amounts', { paidMicroUsd: M(10) });
  const txId = await buyBonus(repo, user.id, 4_999_999);
  await spendAi(repo, user.id, 1_234_567);
  await spendAi(repo, user.id, 1);
  const lot = await assertLotInvariants(repo, user.id, txId);
  assert.equal(lot.consumedMicroUsd, 1_234_568);
  await refundPurchase(repo, txId);
  const reversed = await assertLotInvariants(repo, user.id, txId);
  assert.equal(reversed.reversedMicroUsd, 4_999_999 - 1_234_568);
  assert.equal((await balances(repo, user.id)).promo, 0);
});

test('the caller cannot dictate lot consumption: forged allocation fields on settle are ignored, the server decides from lot state', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Forger', { paidMicroUsd: M(10) });
  const txId = await buyBonus(repo, user.id, BONUS);
  const reservationId = await reserveAi(repo, user.id, M(1));
  const settled = await settleAi(repo, reservationId, M(1), {
    subscriptionBonusUsedMicroUsd: M(999), lotId: 'forged', lotAllocations: [{ lotId: 'forged', amountMicroUsd: M(999) }], subscriptionBonusAllocations: []
  });
  assert.equal(settled.subscriptionBonusUsedMicroUsd, M(1));
  const lot = await assertLotInvariants(repo, user.id, txId);
  assert.equal(lot.consumedMicroUsd, M(1));
});

// ---- refund: the business rule ------------------------------------------------------------------------------------------

test('RULE 1 - no AI use: the full bonus is reversed, exactly as before', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Unused', { keepSignupPromo: true });
  const before = (await balances(repo, user.id)).promo;
  const txId = await buyBonus(repo, user.id, BONUS);
  const request = await refundPurchase(repo, txId);

  const lot = await assertLotInvariants(repo, user.id, txId);
  assert.equal(lot.status, 'reversed');
  assert.equal(lot.reversedMicroUsd, BONUS);
  assert.equal(lot.consumedMicroUsd, 0);
  assert.equal(lot.refundTransactionId, request.transactionId);
  assert.ok(lot.reversedAt);
  assert.equal((await balances(repo, user.id)).promo, before, 'promo is exactly what it was before the purchase');
  const [reversal] = await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS_REVERSAL');
  assert.equal(reversal.promoDeltaMicroUsd, -BONUS);
  assert.equal(reversal.metadata.fullyConsumed, false);
});

test('RULE 2 - $5 bonus, $2.30 spent on AI, refund: only the unspent $2.70 is reversed', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Partial', { keepSignupPromo: true });
  const before = (await balances(repo, user.id)).promo;
  const txId = await buyBonus(repo, user.id, BONUS);
  await spendAi(repo, user.id, M(2.3));
  await refundPurchase(repo, txId);

  const lot = await assertLotInvariants(repo, user.id, txId);
  assert.equal(lot.consumedMicroUsd, M(2.3));
  assert.equal(lot.reversedMicroUsd, M(2.7));
  assert.equal(lot.remainingMicroUsd, 0);
  assert.equal(lot.status, 'reversed');
  const [reversal] = await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS_REVERSAL');
  assert.equal(reversal.promoDeltaMicroUsd, -M(2.7));
  assert.deepEqual(
    { originalTransactionId: reversal.metadata.originalTransactionId, lotId: reversal.metadata.lotId, originalMicroUsd: reversal.metadata.originalMicroUsd,
      consumedMicroUsd: reversal.metadata.consumedMicroUsd, reversedMicroUsd: reversal.metadata.reversedMicroUsd, fullyConsumed: reversal.metadata.fullyConsumed },
    { originalTransactionId: txId, lotId: lot.id, originalMicroUsd: BONUS, consumedMicroUsd: M(2.3), reversedMicroUsd: M(2.7), fullyConsumed: false },
    'the reversal entry is self-describing for audit'
  );
  assert.equal((await balances(repo, user.id)).promo, before, 'the signup promo the user already had is untouched, and nothing went negative');
});

test('RULE 3 - the bonus is fully spent: a ZERO-amount reversal is recorded, no generic promo or paid balance is debited, promo never goes negative', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Spent', { paidMicroUsd: M(10), keepSignupPromo: true });
  const before = await balances(repo, user.id);
  const txId = await buyBonus(repo, user.id, BONUS);
  await spendAi(repo, user.id, BONUS);
  assert.equal((await balances(repo, user.id)).promo, before.promo, 'the bonus is gone, the signup promo is intact');
  await refundPurchase(repo, txId);

  const lot = await assertLotInvariants(repo, user.id, txId);
  assert.equal(lot.status, 'reversed');
  assert.equal(lot.consumedMicroUsd, BONUS);
  assert.equal(lot.reversedMicroUsd, 0);
  assert.equal(lot.remainingMicroUsd, 0);
  assert.ok(lot.reversalLedgerId, 'the fully-consumed outcome is auditable through a reversal ledger entry');
  const reversals = await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS_REVERSAL');
  assert.equal(reversals.length, 1);
  assert.equal(reversals[0].promoDeltaMicroUsd, 0);
  assert.equal(reversals[0].cashDeltaMicroUsd, 0);
  assert.equal(reversals[0].metadata.fullyConsumed, true);
  assert.equal(reversals[0].metadata.reversedMicroUsd, 0);
  assert.deepEqual(await balances(repo, user.id), before, 'promo and paid are exactly what they were before the purchase');
});

test('existing signup / admin promo is never mistaken for bonus remainder: it survives a refund of a partly and of a fully spent bonus', async () => {
  const repo = newRepo();
  const partial = await freshUser(repo, 'Admin Promo A', { paidMicroUsd: M(10), promoMicroUsd: M(3) });
  const partialTx = await buyBonus(repo, partial.id, BONUS);
  await spendAi(repo, partial.id, M(2));
  await refundPurchase(repo, partialTx);
  assert.equal((await balances(repo, partial.id)).promo, M(3), 'the $3 admin promo is intact; only the $3 unspent bonus left');

  const spent = await freshUser(repo, 'Admin Promo B', { paidMicroUsd: M(10), promoMicroUsd: M(3) });
  const spentTx = await buyBonus(repo, spent.id, BONUS);
  await spendAi(repo, spent.id, M(6.5)); // 5 from the lot, 1.5 from the admin promo
  assert.equal((await balances(repo, spent.id)).promo, M(1.5));
  await refundPurchase(repo, spentTx);
  const lot = await assertLotInvariants(repo, spent.id, spentTx);
  assert.equal(lot.reversedMicroUsd, 0);
  assert.deepEqual(await balances(repo, spent.id), { paid: M(10), promo: M(1.5) }, 'the remaining admin promo is NOT debited to "make up" for the spent bonus');
});

test('with several lots, refunding one reverses only THAT lot\'s remainder', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Two Lots', { paidMicroUsd: M(30) });
  const a = await buyBonus(repo, user.id, M(5));
  const b = await buyBonus(repo, user.id, M(3));
  await spendAi(repo, user.id, M(6.5)); // a fully consumed, b consumed 1.5
  await refundPurchase(repo, b);
  const lotB = await assertLotInvariants(repo, user.id, b);
  assert.equal(lotB.reversedMicroUsd, M(1.5));
  const lotA = await assertLotInvariants(repo, user.id, a);
  assert.equal(lotA.status, 'active', 'the other lot is untouched');
  assert.equal(lotA.remainingMicroUsd, 0);
  assert.equal((await balances(repo, user.id)).promo, 0);
  await refundPurchase(repo, a);
  assert.equal((await assertLotInvariants(repo, user.id, a)).reversedMicroUsd, 0);
  assert.deepEqual(await balances(repo, user.id), { paid: M(30), promo: 0 }, 'never negative');
});

test('the reversal comes from the lot, not from today\'s plan setting or the aggregate promo balance', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Rich', { paidMicroUsd: M(10), promoMicroUsd: M(50) }); // lots of unrelated promo
  const txId = await buyBonus(repo, user.id, BONUS);
  await spendAi(repo, user.id, M(1));
  await repo.commercialConfig.publish('plan:pro:walletBonusUsd', { amountUsd: 99 }, {});
  await refundPurchase(repo, txId);
  assert.equal((await lotFor(repo, txId)).reversedMicroUsd, M(4));
  assert.equal((await balances(repo, user.id)).promo, M(50), 'all $50 of unrelated promo remains');
});

test('a subscription that never had a bonus lot is refunded without any reversal entry, and nothing is debited', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'No Bonus Refund', { paidMicroUsd: M(10), promoMicroUsd: M(2) });
  const txId = await buyBonus(repo, user.id, 0);
  await refundPurchase(repo, txId);
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS_REVERSAL')).length, 0);
  assert.deepEqual(await balances(repo, user.id), { paid: M(10), promo: M(2) });
});

// ---- idempotency & concurrency -----------------------------------------------------------------------------------------

test('a duplicate AI settlement (sequential and 5-way concurrent) never allocates or charges twice', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Dup Settle', { paidMicroUsd: M(10) });
  const txId = await buyBonus(repo, user.id, BONUS);
  const reservationId = await reserveAi(repo, user.id, M(2));
  const results = await Promise.all(Array.from({ length: 5 }, () => settleAi(repo, reservationId, M(2))));
  results.forEach((result) => assert.equal(result.ok, true));
  assert.equal(results.filter((result) => !result.alreadySettled).length, 1, 'exactly one settlement really ran');
  const again = await settleAi(repo, reservationId, M(2));
  assert.equal(again.alreadySettled, true);

  const lot = await assertLotInvariants(repo, user.id, txId);
  assert.equal(lot.consumedMicroUsd, M(2));
  assert.equal((await allocationsFor(repo, user.id, lot.id)).length, 1);
  assert.equal((await balances(repo, user.id)).promo, M(3));
});

test('a duplicate refund (retried confirmation, second request, second direct reversal) reverses exactly once', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Dup Refund', { paidMicroUsd: M(10) });
  const txId = await buyBonus(repo, user.id, BONUS);
  await spendAi(repo, user.id, M(2));
  const request = await refundPurchase(repo, txId);
  await confirmTransaction(repo, request.transactionId, { adminUserId: null });
  await assertApiError(new ManualBillingProvider(repo).refund({ transactionId: txId }), { status: 409, code: 'ALREADY_REFUNDED' });
  const direct = await repo.subscriptionBonus.reverseForRefund({ transactionId: txId, refundTransactionId: request.transactionId, adminUserId: null });
  assert.equal(direct.ok, true);
  assert.equal(direct.duplicate, true);
  assert.equal(direct.reversed, false);

  const lot = await assertLotInvariants(repo, user.id, txId);
  assert.equal(lot.reversedMicroUsd, M(3));
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS_REVERSAL')).length, 1);
  assert.equal((await balances(repo, user.id)).promo, 0);
});

test('a direct reversal for a transaction with no lot is a harmless no-op', async () => {
  const repo = newRepo();
  requireLotDomain(repo);
  const user = await freshUser(repo, 'No Lot Direct');
  const result = await repo.subscriptionBonus.reverseForRefund({ transactionId: 'no-such-transaction', refundTransactionId: 'r', adminUserId: null });
  assert.equal(result.ok, true);
  assert.equal(result.reversed, false);
  assert.equal(result.reason, 'NO_LOT');
  assert.deepEqual(await balances(repo, user.id), { paid: 0, promo: 0 });
});

const ticks = async (count) => { for (let i = 0; i < count; i += 1) await Promise.resolve(); };

test('a settlement racing a refund preserves every invariant in every interleaving (both orders)', async () => {
  const outcomes = new Set();
  for (let delay = 0; delay <= 90; delay += 2) {
    for (const settleFirst of [true, false]) {
      const repo = newRepo();
      const user = await freshUser(repo, 'Race ' + delay + settleFirst, { paidMicroUsd: M(10) });
      const txId = await buyBonus(repo, user.id, BONUS);
      const reservationId = await reserveAi(repo, user.id, M(2));
      const doSettle = async () => { if (!settleFirst) await ticks(delay); return settleAi(repo, reservationId, M(2)); };
      const doRefund = async () => { if (settleFirst) await ticks(delay); return refundPurchase(repo, txId); };
      await Promise.all([doSettle(), doRefund()]);

      const lot = await assertLotInvariants(repo, user.id, txId);
      const { paid, promo } = await balances(repo, user.id);
      assert.equal(lot.status, 'reversed');
      assert.equal(lot.consumedMicroUsd + lot.reversedMicroUsd, BONUS, 'consumed + reversed accounts for the whole bonus');
      assert.equal(promo, 0, 'the promo balance ends at exactly zero, never negative');
      assert.equal(paid, M(10) - (M(2) - lot.consumedMicroUsd), 'whatever the bonus did not cover was charged to paid, nothing more');
      outcomes.add(lot.consumedMicroUsd === M(2) ? 'settled-first' : lot.consumedMicroUsd === 0 ? 'refunded-first' : 'other');
    }
  }
  assert.ok(outcomes.has('settled-first') && outcomes.has('refunded-first'), 'the test must actually exercise both orders, saw: ' + Array.from(outcomes).join(','));
  assert.ok(!outcomes.has('other'));
});

test('concurrent settlements never consume more than the lot holds', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Concurrent Spend', { paidMicroUsd: M(20) });
  const txId = await buyBonus(repo, user.id, BONUS);
  const reservations = await Promise.all(Array.from({ length: 5 }, () => reserveAi(repo, user.id, M(2))));
  await Promise.all(reservations.map((id) => settleAi(repo, id, M(2))));
  const lot = await assertLotInvariants(repo, user.id, txId);
  assert.equal(lot.consumedMicroUsd, BONUS);
  assert.equal(lot.remainingMicroUsd, 0);
  assert.deepEqual(await balances(repo, user.id), { paid: M(20) - M(5), promo: 0 });
});

test('DIFFERENTIAL: 60 seeded random purchase / spend / refund sequences match an independent model at every step', async () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const repo = newRepo();
    await runModelScenario(repo, { seed });
  }
});

// ---- repair ---------------------------------------------------------------------------------------------------------------

test('REPAIR creates the linked lot atomically with the repaired grant, exactly once, and the repaired lot then absorbs AI charges', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Repaired', { paidMicroUsd: M(10) });
  const txId = await buyBonusWithoutGrant(repo, user.id, BONUS);
  requireLotDomain(repo);
  assert.equal(await repo.subscriptionBonus.getByTransactionId(txId), null, 'precondition: crash before the grant left no lot');

  const results = await Promise.all(Array.from({ length: 5 }, () => repairSubscriptionBonus(repo, txId)));
  assert.equal(results.filter((result) => result.repaired).length, 1);
  const lot = await assertLotInvariants(repo, user.id, txId);
  assert.equal(lot.originalMicroUsd, BONUS);
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS')).length, 1);
  assert.equal((await balances(repo, user.id)).promo, BONUS);

  const second = await repairSubscriptionBonus(repo, txId);
  assert.equal(second.repaired, false);
  assert.equal(second.alreadyGranted, true);
  assert.equal((await balances(repo, user.id)).promo, BONUS);

  await spendAi(repo, user.id, M(2));
  assert.equal((await lotFor(repo, txId)).consumedMicroUsd, M(2));
});

test('REPAIR is refused after a refund and writes nothing: no lot, no ledger entry, no balance change', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Refunded First', { paidMicroUsd: M(10) });
  const txId = await buyBonusWithoutGrant(repo, user.id, BONUS);
  await refundPurchase(repo, txId);
  await assert.rejects(repairSubscriptionBonus(repo, txId), (error) => error.status === 409 && error.code === 'BONUS_REPAIR_NOT_APPLICABLE' && error.details.reason === 'REFUNDED');

  requireLotDomain(repo);
  assert.equal(await repo.subscriptionBonus.getByTransactionId(txId), null);
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS')).length, 0);
  assert.deepEqual(await balances(repo, user.id), { paid: M(10), promo: 0 });

  // The repository itself is the last line of defence: even a caller that skipped the service-level check cannot grant after a refund.
  const direct = await repo.subscriptionBonus.grant({ userId: user.id, transactionId: txId, amountMicroUsd: BONUS, planId: 'pro' });
  assert.equal(direct.ok, false);
  assert.equal(direct.reason, 'REFUNDED');
  assert.equal(await repo.subscriptionBonus.getByTransactionId(txId), null);
  assert.deepEqual(await balances(repo, user.id), { paid: M(10), promo: 0 });
});

test('REPAIR racing a refund never leaves a granted-but-unreversed bonus behind (every interleaving)', async () => {
  const seen = new Set();
  for (let delay = 0; delay <= 60; delay += 1) {
    for (const repairFirst of [true, false]) {
      const repo = newRepo();
      const user = await freshUser(repo, 'Repair Race ' + delay + repairFirst, { paidMicroUsd: M(10) });
      const txId = await buyBonusWithoutGrant(repo, user.id, BONUS);
      const doRepair = async () => { if (!repairFirst) await ticks(delay); return repairSubscriptionBonus(repo, txId); };
      const doRefund = async () => { if (repairFirst) await ticks(delay); return refundPurchase(repo, txId); };
      const [repair, refund] = await Promise.allSettled([doRepair(), doRefund()]);
      assert.equal(refund.status, 'fulfilled', 'the refund itself always succeeds');
      if (repair.status === 'rejected') assert.equal(repair.reason.code, 'BONUS_REPAIR_NOT_APPLICABLE');

      requireLotDomain(repo);
      const lot = await repo.subscriptionBonus.getByTransactionId(txId);
      if (lot) {
        await assertLotInvariants(repo, user.id, txId);
        assert.equal(lot.status, 'reversed', 'a lot that exists after a refund is reversed');
        seen.add('repaired-then-reversed');
      } else {
        assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS')).length, 0);
        seen.add('repair-refused');
      }
      assert.deepEqual(await balances(repo, user.id), { paid: M(10), promo: 0 }, 'the user never keeps a bonus for a refunded purchase');
    }
  }
  assert.ok(seen.has('repair-refused') && seen.has('repaired-then-reversed'), 'the sweep must exercise both outcomes, saw: ' + Array.from(seen).join(','));
});

// ---- DTOs -------------------------------------------------------------------------------------------------------------------

async function dtoScenario() {
  const repo = newRepo();
  const admin = await makeAdmin(repo, 'Lot Admin');
  const user = await freshUser(repo, 'Lot Customer', { paidMicroUsd: M(30) });
  const other = await freshUser(repo, 'Other Customer', { paidMicroUsd: M(5) });
  const pending = await buyBonus(repo, user.id, BONUS, { confirm: false });
  const oldest = await buyBonus(repo, user.id, BONUS);
  const middle = await buyBonus(repo, user.id, M(2));
  const active = await buyBonus(repo, user.id, M(4));
  await spendAi(repo, user.id, M(7.3)); // FIFO: oldest 5, middle 2, active 0.3
  await refundPurchase(repo, oldest);
  await refundPurchase(repo, middle);
  const otherTx = await buyBonus(repo, other.id, M(1));
  return { repo, admin, user, other, pending, oldest, middle, active, otherTx };
}

const BONUS_FIELDS = ['originalMicroUsd', 'consumedMicroUsd', 'remainingMicroUsd', 'reversedMicroUsd'];
const pickBonus = (bonus) => ({ status: bonus.status, ...Object.fromEntries(BONUS_FIELDS.map((field) => [field, bonus[field]])) });

test('CUSTOMER transactions carry original / consumed / remaining / reversed bonus for every state, and only the customer\'s own', async () => {
  const s = await dtoScenario();
  await withApp(async ({ api }) => {
    const { status, body } = await api('GET', '/api/sync/wallet/transactions', { userId: s.user.id });
    assert.equal(status, 200);
    const byId = new Map(body.transactions.map((row) => [row.id, row]));
    assert.equal(byId.has(s.otherTx), false, 'another customer\'s purchase is never listed');

    assert.deepEqual(pickBonus(byId.get(s.pending).bonus), { status: 'pending', originalMicroUsd: BONUS, consumedMicroUsd: 0, remainingMicroUsd: 0, reversedMicroUsd: 0 });
    assert.deepEqual(pickBonus(byId.get(s.oldest).bonus), { status: 'reversed', originalMicroUsd: BONUS, consumedMicroUsd: BONUS, remainingMicroUsd: 0, reversedMicroUsd: 0 },
      'oldest lot: fully consumed by the FIFO charge, so its refund reversed nothing');
    assert.deepEqual(pickBonus(byId.get(s.middle).bonus), { status: 'reversed', originalMicroUsd: M(2), consumedMicroUsd: M(2), remainingMicroUsd: 0, reversedMicroUsd: 0 });
    assert.deepEqual(pickBonus(byId.get(s.active).bonus), { status: 'credited', originalMicroUsd: M(4), consumedMicroUsd: M(0.3), remainingMicroUsd: M(3.7), reversedMicroUsd: 0 });
    assert.equal(byId.get(s.active).bonus.amountMicroUsd, M(4), 'the pre-existing amountMicroUsd field keeps meaning "the bonus that was owed"');
  }, { repo: s.repo });
});

test('ADMIN transactions carry the same bonus figures next to the existing bonusStatus', async () => {
  const s = await dtoScenario();
  await withApp(async ({ api }) => {
    const { status, body } = await api('GET', '/api/admin/commercial/transactions', { userId: s.admin.id });
    assert.equal(status, 200);
    const byId = new Map(body.transactions.map((row) => [row.id, row]));
    assert.equal(byId.get(s.pending).bonusStatus, 'pending');
    assert.equal(byId.get(s.oldest).bonusStatus, 'reversed');
    assert.equal(byId.get(s.active).bonusStatus, 'credited');
    assert.deepEqual(pickBonus(byId.get(s.active).bonus), { status: 'credited', originalMicroUsd: M(4), consumedMicroUsd: M(0.3), remainingMicroUsd: M(3.7), reversedMicroUsd: 0 });
    assert.deepEqual(pickBonus(byId.get(s.oldest).bonus), { status: 'reversed', originalMicroUsd: BONUS, consumedMicroUsd: BONUS, remainingMicroUsd: 0, reversedMicroUsd: 0 });
    assert.equal(byId.get(s.otherTx).bonusStatus, 'credited', 'an admin sees every customer purchase');
  }, { repo: s.repo });
});

test('a PARTIALLY consumed refunded bonus shows the reversed remainder in the transaction DTO', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Dto Partial', { paidMicroUsd: M(10) });
  const txId = await buyBonus(repo, user.id, BONUS);
  await spendAi(repo, user.id, M(2.3));
  await refundPurchase(repo, txId);
  await withApp(async ({ api }) => {
    const row = (await api('GET', '/api/sync/wallet/transactions', { userId: user.id })).body.transactions.find((r) => r.id === txId);
    assert.deepEqual(pickBonus(row.bonus), { status: 'reversed', originalMicroUsd: BONUS, consumedMicroUsd: M(2.3), remainingMicroUsd: 0, reversedMicroUsd: M(2.7) });
  }, { repo });
});

function assertLedgerDto(entries, s) {
  const byType = (type) => entries.filter((entry) => entry.type === type);
  const settlements = byType('AI_SETTLEMENT');
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].subscriptionBonusUsedMicroUsd, M(7.3), 'the whole charge was covered by bonus lots');
  assert.deepEqual(settlements[0].subscriptionBonusAllocations.map((a) => [a.transactionId, a.amountMicroUsd]),
    [[s.oldest, BONUS], [s.middle, M(2)], [s.active, M(0.3)]], 'FIFO allocations, visible per lot');

  const grants = byType('SUBSCRIPTION_BONUS');
  // A customer entry carries no `metadata` (internal - see customer-billing-dto.mjs), so its grant is found through the lot's own transaction id.
  const grantFor = (txId) => grants.find((entry) => (entry.metadata ? entry.metadata.transactionId : entry.bonusLot && entry.bonusLot.transactionId) === txId);
  assert.deepEqual(pickBonus(grantFor(s.active).bonusLot), { status: 'active', originalMicroUsd: M(4), consumedMicroUsd: M(0.3), remainingMicroUsd: M(3.7), reversedMicroUsd: 0 });
  assert.equal(grantFor(s.active).bonusLot.transactionId, s.active);

  const reversals = byType('SUBSCRIPTION_BONUS_REVERSAL');
  assert.equal(reversals.length, 2);
  reversals.forEach((entry) => {
    assert.equal(entry.promoDeltaMicroUsd, 0, 'both were fully consumed: zero-amount reversals');
    assert.equal(entry.bonusLot.status, 'reversed');
    assert.equal(entry.bonusLot.reversedMicroUsd, 0);
    assert.equal(entry.bonusLot.remainingMicroUsd, 0);
  });
  byType('TOP_UP').forEach((entry) => {
    assert.equal('bonusLot' in entry, false, 'unrelated entries carry no bonus fields');
    assert.equal('subscriptionBonusUsedMicroUsd' in entry, false);
  });
}

test('CUSTOMER ledger: settlements show the bonus they consumed, bonus entries show their lot state, other entries are unchanged', async () => {
  const s = await dtoScenario();
  await withApp(async ({ api }) => {
    const { status, body } = await api('GET', '/api/sync/wallet/ledger', { userId: s.user.id });
    assert.equal(status, 200);
    assertLedgerDto(body.entries, s);
    body.entries.forEach((entry) => assert.equal(entry.userId, s.user.id));
  }, { repo: s.repo });
});

test('ADMIN global ledger and per-user wallet carry the same enrichment', async () => {
  const s = await dtoScenario();
  await withApp(async ({ api }) => {
    const global = await api('GET', '/api/admin/commercial/ledger', { userId: s.admin.id });
    assert.equal(global.status, 200);
    assertLedgerDto(global.body.entries.filter((entry) => entry.userId === s.user.id), s);
    const wallet = await api('GET', '/api/admin/commercial/users/' + s.user.id + '/wallet', { userId: s.admin.id });
    assert.equal(wallet.status, 200);
    assertLedgerDto(wallet.body.ledger, s);
    assert.ok(wallet.body.account, 'the account block is unchanged');
  }, { repo: s.repo });
});

test('a legacy ledger entry that predates lots is served safely, without invented bonus fields', async () => {
  const repo = newRepo();
  const user = await freshUser(repo, 'Legacy Ledger', { paidMicroUsd: M(5) });
  await repo.wallet.grant(user.id, { type: 'SUBSCRIPTION_BONUS', promoDeltaMicroUsd: M(1), sourceAction: 'legacy', idempotencyKey: 'subscription-bonus:legacy-tx', metadata: { transactionId: 'legacy-tx' } });
  await withApp(async ({ api }) => {
    const { status, body } = await api('GET', '/api/sync/wallet/ledger', { userId: user.id });
    assert.equal(status, 200);
    const legacy = body.entries.find((entry) => entry.type === 'SUBSCRIPTION_BONUS');
    assert.ok(legacy);
    assert.ok(legacy.bonusLot === null || legacy.bonusLot === undefined, 'no lot => no lot state is invented');
  }, { repo });
});
