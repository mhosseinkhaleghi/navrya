import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { confirmTransaction } from '../server/commercial/payment-service.mjs';
import {
  awardReferralForTransaction, reprocessReferralForTransaction, reverseReferralForTransaction, awardReferralForAiSettlement, __resetAiMarginGateForTests
} from '../server/commercial/referral-earnings.mjs';
import { MICRO } from '../server/commercial/referral-rules.mjs';
import { setupProgram, attribute, payoutArgs } from './helpers/referral-repo-scenarios.mjs';

// The referral commission through the REAL commercial payment-confirmation choke point (confirmTransaction), the way a payer
// and an admin actually trigger it - not by calling the repository directly.
beforeEach(() => __resetAiMarginGateForTests());

async function subscriptionTx(repo, userId, amountUsd, meta = {}) {
  return repo.paymentTransactions.create({
    userId, type: 'subscription', provider: 'manual', amountMicroUsd: Math.round(amountUsd * MICRO), currency: 'USD', productId: 'pro',
    metadata: { planId: 'pro', billingInterval: 'month', ...meta }
  });
}
async function refundOf(repo, original, amountUsd = null) {
  const refund = await repo.paymentTransactions.create({
    userId: original.userId, type: 'refund', provider: 'manual', amountMicroUsd: amountUsd == null ? original.amountMicroUsd : Math.round(amountUsd * MICRO),
    currency: 'USD', productId: null, metadata: { originalTransactionId: original.id }
  });
  return confirmTransaction(repo, refund.id, { adminUserId: 'admin' });
}
const totals = async (repo, userId) => (await repo.referralEarnings.summaryForUser(userId)).totals;

test('a confirmed subscription payment creates exactly one commission lot, and a replayed confirmation never doubles it', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo, { commissionBps: 1000 });
  const { referred } = await attribute(repo, ctx);
  const tx = await subscriptionTx(repo, referred.id, 20);
  const first = await confirmTransaction(repo, tx.id);
  assert.equal(first.alreadyProcessed, false);
  const replay = await confirmTransaction(repo, tx.id);
  assert.equal(replay.alreadyProcessed, true);
  const lots = await repo.referralEarnings.lotsForUser(ctx.referrer.id);
  assert.equal(lots.length, 1);
  assert.equal(lots[0].originalMicroUsd, 2 * MICRO, '10% of the $20.00 actually paid');
  assert.equal(lots[0].source, 'subscription');
  assert.equal(lots[0].sourceEventId, tx.id);
  assert.equal((await reprocessReferralForTransaction(repo, tx.id)).duplicate, true, 'an admin reprocess is idempotent too');
  assert.equal((await repo.referralEarnings.lotsForUser(ctx.referrer.id)).length, 1);
});

test('commission is computed from the FINAL amount actually paid, not the list price', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo, { commissionBps: 1000 });
  const { referred } = await attribute(repo, ctx);
  const tx = await subscriptionTx(repo, referred.id, 12, { pricing: { originalAmountMicroUsd: 20 * MICRO, discountAmountMicroUsd: 8 * MICRO, finalAmountMicroUsd: 12 * MICRO, walletBonusMicroUsd: 0, discount: null } });
  await confirmTransaction(repo, tx.id);
  assert.equal((await repo.referralEarnings.lotsForUser(ctx.referrer.id))[0].originalMicroUsd, 1.2 * MICRO);
});

test('a wallet top-up by an attributed user never earns commission - no lot and no outcome', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo);
  const { referred } = await attribute(repo, ctx);
  const topUp = await repo.paymentTransactions.create({ userId: referred.id, type: 'wallet_topup', provider: 'manual', amountMicroUsd: 500 * MICRO, currency: 'USD', productId: null, metadata: {} });
  await confirmTransaction(repo, topUp.id);
  assert.equal((await repo.referralEarnings.lotsForUser(ctx.referrer.id)).length, 0);
  assert.equal(await repo.referralEarnings.getOutcome('wallet_topup', topUp.id), null, 'the top-up never even reaches the earning code');
  assert.deepEqual(await totals(repo, ctx.referrer.id), { ...(await totals(repo, ctx.referrer.id)), lifetimeEarnedMicroUsd: 0 });
  // Even called directly, the earning rules refuse it.
  const direct = await awardReferralForTransaction(repo, { ...topUp, status: 'confirmed', confirmedAt: new Date().toISOString() });
  assert.equal(direct.outcome, 'skipped');
  assert.equal(direct.reason, 'SOURCE_NOT_ELIGIBLE');
});

test('a pending, failed or unconfirmed payment never earns (server-authoritative confirmation only)', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo);
  const { referred } = await attribute(repo, ctx);
  const tx = await subscriptionTx(repo, referred.id, 20);
  assert.equal((await awardReferralForTransaction(repo, tx)).reason, 'NOT_CONFIRMED', 'a pending transaction');
  await repo.paymentTransactions.setStatus(tx.id, 'failed', {});
  assert.equal((await reprocessReferralForTransaction(repo, tx.id)).reason, 'NOT_CONFIRMED', 'a failed transaction');
  assert.equal((await repo.referralEarnings.lotsForUser(ctx.referrer.id)).length, 0);
});

test('a zero-amount (fully discounted) subscription earns nothing but is recorded as a skipped outcome', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo);
  const { referred } = await attribute(repo, ctx);
  const tx = await subscriptionTx(repo, referred.id, 0, { pricing: { originalAmountMicroUsd: 20 * MICRO, discountAmountMicroUsd: 20 * MICRO, finalAmountMicroUsd: 0, walletBonusMicroUsd: 0, discount: null } });
  await confirmTransaction(repo, tx.id);
  assert.equal((await repo.referralEarnings.lotsForUser(ctx.referrer.id)).length, 0);
  assert.equal((await repo.referralEarnings.getOutcome('subscription', tx.id)).reason, 'ZERO_AMOUNT');
});

test('a payer with no attribution costs nothing and creates no record', async () => {
  const repo = createMemoryRepo();
  await setupProgram(repo);
  const stranger = await repo.users.create({ displayName: 'Stranger' });
  const tx = await subscriptionTx(repo, stranger.id, 20);
  await confirmTransaction(repo, tx.id);
  assert.deepEqual(await repo.referralEarnings.listOutcomes(), []);
});

test('storage purchases earn only when the attribution snapshot lists the source', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo, { extra: { eligibleSources: ['subscription', 'storage_purchase'] } });
  const { referred } = await attribute(repo, ctx);
  const tx = await repo.paymentTransactions.create({
    userId: referred.id, type: 'storage_purchase', provider: 'manual', amountMicroUsd: 10 * MICRO, currency: 'USD', productId: 's100',
    metadata: { productId: 's100', capacityBytes: 1e9, validityDays: 30, priceAmountMicroUsd: 10 * MICRO }
  });
  await confirmTransaction(repo, tx.id);
  const lot = (await repo.referralEarnings.lotsForUser(ctx.referrer.id))[0];
  assert.equal(lot.source, 'storage_purchase');
  assert.equal(lot.originalMicroUsd, 1 * MICRO);
});

test('the contribution-margin guard counts the subscription wallet bonus as a cost and clamps the commission', async () => {
  const repo = createMemoryRepo();
  // 50% commission on $20 = $10, but service cost 20% ($4) + wallet bonus $8 leave only $8 of room -> clamped to $8.
  const ctx = await setupProgram(repo, { commissionBps: 5000, extra: { serviceCostPercent: 20 } });
  const { referred } = await attribute(repo, ctx);
  const tx = await subscriptionTx(repo, referred.id, 20, { pricing: { originalAmountMicroUsd: 20 * MICRO, discountAmountMicroUsd: 0, finalAmountMicroUsd: 20 * MICRO, walletBonusMicroUsd: 8 * MICRO, discount: null } });
  await confirmTransaction(repo, tx.id);
  const lot = (await repo.referralEarnings.lotsForUser(ctx.referrer.id))[0];
  assert.equal(lot.originalMicroUsd, 8 * MICRO);
  assert.equal(lot.snapshot.outcome, 'clamped');
  assert.match(lot.snapshot.reason, /MARGIN_GUARD/);
});

test('a referral failure can NEVER break, roll back or delay a real payment; a reprocess recovers the earning', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo);
  const { referred } = await attribute(repo, ctx);
  const realRecord = repo.referralEarnings.recordEarning;
  repo.referralEarnings.recordEarning = async () => { throw new Error('database blip'); };
  const originalError = console.error;
  console.error = () => {};
  const tx = await subscriptionTx(repo, referred.id, 20);
  let result;
  try { result = await confirmTransaction(repo, tx.id); } finally { console.error = originalError; }
  assert.equal(result.alreadyProcessed, false);
  assert.equal((await repo.paymentTransactions.get(tx.id)).status, 'confirmed', 'the payment is confirmed');
  assert.ok(await repo.subscriptions.getActiveForUser(referred.id), 'and the subscription is active');
  assert.equal((await repo.referralEarnings.lotsForUser(ctx.referrer.id)).length, 0, 'the referral part simply did not happen');
  assert.deepEqual((await repo.referralEarnings.findUnprocessedQualifyingPayments()).map((r) => r.transactionId), [tx.id], 'and it is visible to Admin');
  repo.referralEarnings.recordEarning = realRecord;
  assert.equal((await reprocessReferralForTransaction(repo, tx.id)).outcome, 'earned');
  assert.equal((await repo.referralEarnings.lotsForUser(ctx.referrer.id)).length, 1);
});

// --- reversals through confirmTransaction(refund) ----------------------------------------------------------
test('a refund of a still-pending earning cancels it and releases its budget', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo, { holdDays: 14, extra: { programBudgetCapUsd: 100 } });
  const { referred } = await attribute(repo, ctx);
  const tx = await subscriptionTx(repo, referred.id, 20);
  await confirmTransaction(repo, tx.id);
  assert.equal((await totals(repo, ctx.referrer.id)).pendingMicroUsd, 2 * MICRO);
  assert.equal(await repo.referralReports.programBudgetUsed(ctx.program.id), 2 * MICRO);
  await refundOf(repo, tx);
  const after = await totals(repo, ctx.referrer.id);
  assert.equal(after.pendingMicroUsd, 0);
  assert.equal(after.reversedMicroUsd, 2 * MICRO);
  assert.equal(await repo.referralReports.programBudgetUsed(ctx.program.id), 0);
  assert.equal((await repo.referralEarnings.listDebtCases()).length, 0, 'no debt for a pending earning');
});

test('a refund after the earning was converted to AI credit creates recoverable debt and blocks payouts', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo, { commissionBps: 5000 }); // holdDays 0
  const { referred } = await attribute(repo, ctx);
  const first = await subscriptionTx(repo, referred.id, 40); // $20.00 commission
  await confirmTransaction(repo, first.id);
  const second = await subscriptionTx(repo, referred.id, 40); // another $20.00
  await confirmTransaction(repo, second.id);
  const converted = await repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 20 * MICRO, idempotencyKey: 'conv' });
  assert.equal(converted.ok, true);
  await refundOf(repo, first); // the first lot was the FIFO one that got converted
  const cases = await repo.referralEarnings.listDebtCases({ userId: ctx.referrer.id });
  assert.equal(cases.length, 1);
  assert.equal(cases[0].amountMicroUsd, 20 * MICRO);
  const blocked = await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'blocked'));
  assert.deepEqual([blocked.ok, blocked.reason], [false, 'DEBT_OPEN']);
});

test('a refund that arrives while a payout is requested (pre-send) auto-rejects the request and frees the other lots', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo, { commissionBps: 5000 });
  const { referred } = await attribute(repo, ctx);
  const a = await subscriptionTx(repo, referred.id, 30); // $15
  await confirmTransaction(repo, a.id);
  const b = await subscriptionTx(repo, referred.id, 20); // $10
  await confirmTransaction(repo, b.id);
  const request = (await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 25 * MICRO, 'pre'))).request;
  await refundOf(repo, a);
  assert.equal((await repo.referralPayouts.getRequest(request.id)).status, 'rejected');
  const t = await totals(repo, ctx.referrer.id);
  assert.equal(t.payoutReservedMicroUsd, 0);
  assert.equal(t.availableCashMicroUsd, 10 * MICRO);
});

test('partial refunds reverse only the increment, cumulatively, through the service', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo, { commissionBps: 1000 });
  const { referred } = await attribute(repo, ctx);
  const tx = await subscriptionTx(repo, referred.id, 100); // $10.00 commission
  await confirmTransaction(repo, tx.id);
  const partial = async (usd, ref) => {
    const refund = await repo.paymentTransactions.create({ userId: referred.id, type: 'refund', provider: 'manual', amountMicroUsd: usd * MICRO, currency: 'USD', productId: null, metadata: { originalTransactionId: tx.id } });
    await repo.paymentTransactions.setStatus(refund.id, 'confirmed', { confirmedAt: new Date().toISOString() });
    return reverseReferralForTransaction(repo, await repo.paymentTransactions.get(tx.id), { reason: 'refund', triggerRef: ref });
  };
  assert.equal((await partial(40, 'p1')).plan.totalMicroUsd, 4 * MICRO); // 40% refunded -> commission 6.00
  assert.equal((await partial(20, 'p2')).plan.totalMicroUsd, 2 * MICRO); // cumulative 60% -> commission 4.00
  assert.equal((await totals(repo, ctx.referrer.id)).reversedMicroUsd, 6 * MICRO);
});

test('a chargeback recorded by an admin removes the whole commission and is idempotent per reference', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo);
  const { referred } = await attribute(repo, ctx);
  const tx = await subscriptionTx(repo, referred.id, 50);
  await confirmTransaction(repo, tx.id);
  const original = await repo.paymentTransactions.get(tx.id);
  const one = await reverseReferralForTransaction(repo, original, { reason: 'chargeback', triggerRef: 'cb-1' });
  assert.equal(one.plan.totalMicroUsd, 5 * MICRO);
  const two = await reverseReferralForTransaction(repo, original, { reason: 'chargeback', triggerRef: 'cb-1' });
  assert.equal(two.duplicate, true);
  assert.equal((await totals(repo, ctx.referrer.id)).reversedMicroUsd, 5 * MICRO);
});

// --- AI gross-margin source ---------------------------------------------------------------------------------
function settlement(overrides = {}) {
  return {
    ok: true,
    ledgerEntry: { id: 'led-1', userId: null, cashDeltaMicroUsd: -1000000, promoDeltaMicroUsd: 0, providerCostMicroUsd: 400000, retailChargeMicroUsd: 1000000, idempotencyKey: 'ai-settle:res-1', createdAt: new Date().toISOString(), ...overrides }
  };
}
test('AI margin is off by default: a standard program never earns from AI usage', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo);
  const { referred } = await attribute(repo, ctx);
  const result = await awardReferralForAiSettlement(repo, settlement({ userId: referred.id }));
  assert.equal(result.outcome, 'none');
  assert.equal((await repo.referralEarnings.lotsForUser(ctx.referrer.id)).length, 0);
});
test('AI margin, when a version enables it, earns only from the settled CASH-funded gross margin', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo, { commissionBps: 5000, extra: { eligibleSources: ['ai_margin'] } });
  const { referred } = await attribute(repo, ctx);
  // retail $1.00, provider cost $0.40 -> gross margin $0.60, entirely cash-funded -> 50% = $0.30
  const cash = await awardReferralForAiSettlement(repo, settlement({ userId: referred.id }));
  assert.equal(cash.outcome, 'earned');
  assert.equal(cash.lot.originalMicroUsd, 300000);
  assert.equal(cash.lot.source, 'ai_margin');
  // half promo-funded -> only half of the margin counts: $0.30 * 50% = $0.15
  const mixed = await awardReferralForAiSettlement(repo, settlement({ userId: referred.id, cashDeltaMicroUsd: -500000, promoDeltaMicroUsd: -500000, idempotencyKey: 'ai-settle:res-2' }));
  assert.equal(mixed.lot.originalMicroUsd, 150000);
  // fully promo / bonus / referral-credit-funded -> nothing (it was never real revenue)
  const promo = await awardReferralForAiSettlement(repo, settlement({ userId: referred.id, cashDeltaMicroUsd: 0, promoDeltaMicroUsd: -1000000, idempotencyKey: 'ai-settle:res-3' }));
  assert.equal(promo.outcome, 'skipped');
  // idempotent per settlement, and a replayed (already settled) result is ignored outright
  assert.equal((await awardReferralForAiSettlement(repo, settlement({ userId: referred.id }))).duplicate, true);
  assert.equal((await awardReferralForAiSettlement(repo, { ...settlement({ userId: referred.id }), alreadySettled: true })).reason, 'NOT_A_NEW_SETTLEMENT');
  // a wallet TOP-UP amount is never a base: a settlement with no margin earns nothing
  const loss = await awardReferralForAiSettlement(repo, settlement({ userId: referred.id, providerCostMicroUsd: 2000000, idempotencyKey: 'ai-settle:res-4' }));
  assert.equal(loss.outcome, 'skipped');
});
test('the AI-margin hook never throws into billing and costs nothing for a user with no attribution', async () => {
  const repo = createMemoryRepo();
  await setupProgram(repo, { extra: { eligibleSources: ['ai_margin'] } });
  const stranger = await repo.users.create({ displayName: 'Stranger' });
  assert.equal((await awardReferralForAiSettlement(repo, settlement({ userId: stranger.id }))).reason, 'NOT_ELIGIBLE');
  assert.equal((await awardReferralForAiSettlement(repo, { ok: false })).reason, 'NOT_A_NEW_SETTLEMENT');
});
