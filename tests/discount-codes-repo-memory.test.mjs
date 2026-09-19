import assert from 'node:assert/strict';
import test from 'node:test';
import {
  newRepo, makeUser, makeCode, requireDiscountDomains, assertApiError, assertStats, iso,
  PRO_MICRO, PLUS_MICRO, HOUR_MS, MINUTE_MS
} from './helpers/discount-fixtures.mjs';

// Repository contract for the dedicated discount-code domain, exercised against repo.memory.mjs.
// The SAME contract is asserted for repo.pg.mjs structurally in discount-codes-migration-contract.test.mjs
// and behaviorally (against a real database) in discount-codes-postgres-integration.test.mjs.
//
// Stored form: discountValue is basis points for 'percent' (1500 = 15%) and integer micro-USD for
// 'fixed'. Capacity in use = confirmed redemptions + reserved redemptions whose reservedUntil is still
// in the future. All timing-sensitive tests drive time through node:test's mocked Date, never sleeps.
//
// Surface pinned here:
//   repo.discountCodes:        create, get, getByCode, list, update(id, patch, {updatedBy}), stats(id)
//   repo.discountRedemptions:  reserve({codeId,userId,planId,originalAmountMicroUsd,reservedUntil}),
//                              attachTransaction, confirmForTransaction, releaseForTransaction,
//                              markRefundedForTransaction, getByTransactionId, listForCode

async function reserve(repo, codeId, userId, { holdMs = 10 * MINUTE_MS, original = PRO_MICRO, planId = 'pro' } = {}) {
  return repo.discountRedemptions.reserve({ codeId, userId, planId, originalAmountMicroUsd: original, reservedUntil: iso(Date.now() + holdMs) });
}

// reserve + a real pending subscription transaction attached to it, like the checkout does.
async function reserveWithTx(repo, codeId, userId, options) {
  const redemption = await reserve(repo, codeId, userId, options);
  const transaction = await repo.paymentTransactions.create({
    userId, type: 'subscription', provider: 'manual', externalTransactionId: 'test-' + redemption.id,
    amountMicroUsd: redemption.finalAmountMicroUsd, currency: 'USD', productId: (options && options.planId) || 'pro',
    metadata: { planId: (options && options.planId) || 'pro' }
  });
  await repo.discountRedemptions.attachTransaction(redemption.id, transaction.id);
  return { redemption, transaction };
}

test('a code has a unique code string; a duplicate is refused with DISCOUNT_CODE_EXISTS and never overwrites', async () => {
  const repo = newRepo();
  const code = await makeCode(repo, { code: 'SPRING30', campaignName: 'Spring', maxRedemptions: 30 });
  assert.ok(code.id);
  assert.equal(code.code, 'SPRING30');
  assert.equal(code.campaignName, 'Spring');
  assert.equal(code.discountType, 'percent');
  assert.equal(code.discountValue, 1500);
  assert.equal(code.maxRedemptions, 30);
  assert.equal(code.active, true);
  assert.equal((await repo.discountCodes.getByCode('SPRING30')).id, code.id);
  assert.equal(await repo.discountCodes.getByCode('NOPE'), null);
  assert.equal((await repo.discountCodes.get(code.id)).code, 'SPRING30');

  await assertApiError(makeCode(repo, { code: 'SPRING30', campaignName: 'Other' }), { status: 409, code: 'DISCOUNT_CODE_EXISTS' });
  assert.equal((await repo.discountCodes.list()).length, 1);
  assert.equal((await repo.discountCodes.getByCode('SPRING30')).campaignName, 'Spring');
});

test('the repository refuses stored values a database CHECK would refuse (defence in depth), with VALIDATION_FAILED', async () => {
  const repo = newRepo();
  const invalid = [
    { discountType: 'bogus' },
    { discountType: 'percent', discountValue: 0 },
    { discountType: 'percent', discountValue: 10001 },
    { discountType: 'fixed', discountValue: 0 },
    { discountValue: 1.5 },
    { maxRedemptions: 0 },
    { startsAt: iso(2_000_000_000_000), expiresAt: iso(1_000_000_000_000) }
  ];
  for (const overrides of invalid) await assertApiError(makeCode(repo, overrides), { status: 400, code: 'VALIDATION_FAILED' });
  assert.equal((await repo.discountCodes.list()).length, 0);
});

test('reserve computes the snapshot on the server: 15% of the Plus price, and the reservation appears in the code stats', async () => {
  const repo = newRepo();
  const code = await makeCode(repo, { code: 'PLUS15', campaignName: 'Plus fifteen', maxRedemptions: 5 });
  const user = await makeUser(repo, 'Buyer');
  const redemption = await reserve(repo, code.id, user.id, { original: PLUS_MICRO, planId: 'plus' });
  assert.equal(redemption.status, 'reserved');
  assert.equal(redemption.codeId, code.id);
  assert.equal(redemption.userId, user.id);
  assert.equal(redemption.planId, 'plus');
  assert.equal(redemption.transactionId, null);
  assert.equal(redemption.originalAmountMicroUsd, 4_990_000);
  assert.equal(redemption.discountAmountMicroUsd, 748_500);
  assert.equal(redemption.finalAmountMicroUsd, 4_241_500);
  assert.equal(redemption.code, 'PLUS15');
  assert.equal(redemption.campaignName, 'Plus fifteen');
  assert.equal(redemption.discountType, 'percent');
  assert.equal(redemption.discountValue, 1500);
  assert.ok(redemption.reservedUntil);
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 0, pendingReservations: 1, remaining: 4 });
});

test('a redemption snapshot is immutable: editing the code later changes future redemptions only', async () => {
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: 10 });
  const [a, b] = await Promise.all([makeUser(repo, 'A'), makeUser(repo, 'B')]);
  const first = await reserve(repo, code.id, a.id);
  assert.equal(first.discountAmountMicroUsd, 2_248_500);

  await repo.discountCodes.update(code.id, { discountValue: 5000, campaignName: 'Renamed' });
  const second = await reserve(repo, code.id, b.id);
  assert.equal(second.discountAmountMicroUsd, 7_495_000, 'a redemption made after the edit uses the new terms');
  assert.equal(second.campaignName, 'Renamed');

  const rows = await repo.discountRedemptions.listForCode(code.id);
  const firstAgain = rows.find((row) => row.id === first.id);
  assert.equal(firstAgain.discountAmountMicroUsd, 2_248_500, 'the earlier redemption still shows the terms it was made under');
  assert.equal(firstAgain.discountValue, 1500);
  assert.notEqual(firstAgain.campaignName, 'Renamed');
});

test('a limited code caps DISTINCT USERS: the reservation after the last slot is refused with DISCOUNT_CODE_EXHAUSTED', async () => {
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: 2 });
  const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((name) => makeUser(repo, name)));
  const { transaction: txA } = await reserveWithTx(repo, code.id, a.id);
  const { transaction: txB } = await reserveWithTx(repo, code.id, b.id);
  await assertApiError(reserve(repo, code.id, c.id), { status: 409, code: 'DISCOUNT_CODE_EXHAUSTED' });

  assert.equal((await repo.discountRedemptions.confirmForTransaction(txA.id)).ok, true);
  assert.equal((await repo.discountRedemptions.confirmForTransaction(txB.id)).ok, true);
  await assertApiError(reserve(repo, code.id, c.id), { status: 409, code: 'DISCOUNT_CODE_EXHAUSTED' });
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 2, pendingReservations: 0, remaining: 0 });
});

test('a user may redeem a given code once: pending -> RESERVATION_PENDING, confirmed -> ALREADY_USED, released -> may try again', async () => {
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: 10 });
  const user = await makeUser(repo, 'Repeat Buyer');
  const { transaction } = await reserveWithTx(repo, code.id, user.id);

  await assertApiError(reserve(repo, code.id, user.id), { status: 409, code: 'DISCOUNT_CODE_RESERVATION_PENDING', details: { transactionId: transaction.id } });

  assert.equal((await repo.discountRedemptions.confirmForTransaction(transaction.id)).ok, true);
  await assertApiError(reserve(repo, code.id, user.id), { status: 409, code: 'DISCOUNT_CODE_ALREADY_USED' });

  const other = await makeUser(repo, 'Failed Buyer');
  const failed = await reserveWithTx(repo, code.id, other.id);
  await repo.discountRedemptions.releaseForTransaction(failed.transaction.id, 'transaction_failed');
  const retry = await reserve(repo, code.id, other.id);
  assert.equal(retry.status, 'reserved', 'a released reservation never consumed the user\'s one redemption');
});

test('concurrency: 50 different users racing for a 30-user code yield exactly 30 reservations and 20 EXHAUSTED', async () => {
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: 30 });
  const users = await Promise.all(Array.from({ length: 50 }, (_, i) => makeUser(repo, 'Racer ' + i)));
  const results = await Promise.allSettled(users.map((user) => reserve(repo, code.id, user.id, { holdMs: HOUR_MS })));

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 30);
  assert.equal(rejected.length, 20);
  rejected.forEach((r) => assert.equal(r.reason.code, 'DISCOUNT_CODE_EXHAUSTED'));
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 0, pendingReservations: 30, remaining: 0 });
  const rows = await repo.discountRedemptions.listForCode(code.id);
  assert.equal(rows.length, 30);
  assert.equal(new Set(rows.map((row) => row.userId)).size, 30, 'never two live rows for one user');
});

test('concurrency: one user firing 10 parallel reservations gets exactly one', async () => {
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: 5 });
  const user = await makeUser(repo, 'Double Clicker');
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => reserve(repo, code.id, user.id)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  results.filter((r) => r.status === 'rejected').forEach((r) => assert.equal(r.reason.code, 'DISCOUNT_CODE_RESERVATION_PENDING'));
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 0, pendingReservations: 1, remaining: 4 });
});

test('concurrency: 40 users each reserving, attaching and confirming end with exactly 10 confirmed on a 10-user code', async () => {
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: 10 });
  const users = await Promise.all(Array.from({ length: 40 }, (_, i) => makeUser(repo, 'Buyer ' + i)));
  const outcomes = await Promise.allSettled(users.map(async (user) => {
    const { transaction } = await reserveWithTx(repo, code.id, user.id, { holdMs: HOUR_MS });
    return repo.discountRedemptions.confirmForTransaction(transaction.id);
  }));
  assert.equal(outcomes.filter((o) => o.status === 'fulfilled' && o.value.ok).length, 10);
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 10, pendingReservations: 0, remaining: 0 });
});

test('an unlimited code (maxRedemptions null) never exhausts and reports remaining null', async () => {
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: null });
  const users = await Promise.all(Array.from({ length: 60 }, (_, i) => makeUser(repo, 'U' + i)));
  const results = await Promise.allSettled(users.map((user) => reserve(repo, code.id, user.id)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 60);
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 0, pendingReservations: 60, remaining: null });
});

test('a lapsed hold stops counting toward capacity immediately and is swept to expired the next time the code is reserved', async (t) => {
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: 1 });
  const [a, b] = await Promise.all([makeUser(repo, 'A'), makeUser(repo, 'B')]);
  await reserveWithTx(repo, code.id, a.id, { holdMs: 10 * MINUTE_MS });
  await assertApiError(reserve(repo, code.id, b.id), { status: 409, code: 'DISCOUNT_CODE_EXHAUSTED' });

  t.mock.timers.setTime(start + 11 * MINUTE_MS);
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 0, pendingReservations: 0, remaining: 1 });
  const taken = await reserve(repo, code.id, b.id);
  assert.equal(taken.status, 'reserved');

  const rowA = (await repo.discountRedemptions.listForCode(code.id)).find((row) => row.userId === a.id);
  assert.equal(rowA.status, 'expired');
  assert.equal(rowA.releaseReason, 'hold_lapsed');
  assert.ok(rowA.releasedAt);
});

test('a user whose earlier hold lapsed can reserve the same code again (only live rows enforce one-per-user)', async (t) => {
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: null });
  const user = await makeUser(repo, 'Patient Buyer');
  await reserve(repo, code.id, user.id, { holdMs: 10 * MINUTE_MS });
  t.mock.timers.setTime(start + 11 * MINUTE_MS);
  const again = await reserve(repo, code.id, user.id);
  assert.equal(again.status, 'reserved');
  const rows = await repo.discountRedemptions.listForCode(code.id);
  assert.deepEqual(rows.map((row) => row.status).sort(), ['expired', 'reserved']);
});

test('confirm and release are idempotent; release never touches a confirmed redemption', async () => {
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: 5 });
  const [a, b] = await Promise.all([makeUser(repo, 'A'), makeUser(repo, 'B')]);
  const { transaction: txA } = await reserveWithTx(repo, code.id, a.id);
  const { transaction: txB } = await reserveWithTx(repo, code.id, b.id);

  const first = await repo.discountRedemptions.confirmForTransaction(txA.id);
  const second = await repo.discountRedemptions.confirmForTransaction(txA.id);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.redemption.status, 'confirmed');
  assert.ok(first.redemption.confirmedAt);
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 1, pendingReservations: 1, remaining: 3 });

  assert.equal((await repo.discountRedemptions.releaseForTransaction(txB.id, 'transaction_failed')).released, true);
  assert.equal((await repo.discountRedemptions.releaseForTransaction(txB.id, 'transaction_failed')).released, false);
  assert.equal((await repo.discountRedemptions.releaseForTransaction(txA.id, 'transaction_failed')).released, false);
  const rowA = await repo.discountRedemptions.getByTransactionId(txA.id);
  const rowB = await repo.discountRedemptions.getByTransactionId(txB.id);
  assert.equal(rowA.status, 'confirmed');
  assert.equal(rowB.status, 'released');
  assert.equal(rowB.releaseReason, 'transaction_failed');
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 1, pendingReservations: 0, remaining: 4 });
});

test('a late confirmation RE-CLAIMS its slot when the hold lapsed but nobody took the slot', async (t) => {
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: 1 });
  const a = await makeUser(repo, 'Late Payer');
  const { transaction } = await reserveWithTx(repo, code.id, a.id, { holdMs: 10 * MINUTE_MS });
  t.mock.timers.setTime(start + 2 * HOUR_MS);

  const result = await repo.discountRedemptions.confirmForTransaction(transaction.id);
  assert.equal(result.ok, true);
  assert.equal(result.redemption.status, 'confirmed');
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 1, pendingReservations: 0, remaining: 0 });
});

test('a late confirmation also re-claims from the swept "expired" state when the slot has since been freed', async (t) => {
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: 1 });
  const [a, b] = await Promise.all([makeUser(repo, 'A'), makeUser(repo, 'B')]);
  const { transaction: txA } = await reserveWithTx(repo, code.id, a.id, { holdMs: 10 * MINUTE_MS });
  t.mock.timers.setTime(start + 11 * MINUTE_MS);
  const { transaction: txB } = await reserveWithTx(repo, code.id, b.id);          // sweeps A to 'expired'
  assert.equal((await repo.discountRedemptions.getByTransactionId(txA.id)).status, 'expired');
  await repo.discountRedemptions.releaseForTransaction(txB.id, 'transaction_failed'); // B walks away

  const result = await repo.discountRedemptions.confirmForTransaction(txA.id);
  assert.equal(result.ok, true);
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 1, pendingReservations: 0, remaining: 0 });
});

test('STRICT RULE: a late confirmation whose slot was reused is refused with DISCOUNT_CAPACITY_LOST and never exceeds the cap', async (t) => {
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: 1 });
  const [a, b] = await Promise.all([makeUser(repo, 'Late'), makeUser(repo, 'Early')]);
  const { transaction: txA } = await reserveWithTx(repo, code.id, a.id, { holdMs: 10 * MINUTE_MS });
  t.mock.timers.setTime(start + 11 * MINUTE_MS);
  const { transaction: txB } = await reserveWithTx(repo, code.id, b.id);
  assert.equal((await repo.discountRedemptions.confirmForTransaction(txB.id)).ok, true);

  const late = await repo.discountRedemptions.confirmForTransaction(txA.id);
  assert.equal(late.ok, false);
  assert.equal(late.reason, 'DISCOUNT_CAPACITY_LOST');
  assert.notEqual((await repo.discountRedemptions.getByTransactionId(txA.id)).status, 'confirmed');
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 1, pendingReservations: 0, remaining: 0 });
});

test('inactive, not-yet-open and expired codes cannot be reserved; the error names why', async () => {
  const repo = newRepo();
  const user = await makeUser(repo, 'Buyer');
  const inactive = await makeCode(repo, { active: false });
  await assertApiError(reserve(repo, inactive.id, user.id), { status: 404, code: 'DISCOUNT_CODE_INVALID' });

  const future = await makeCode(repo, { startsAt: iso(Date.now() + 5 * HOUR_MS) });
  await assertApiError(reserve(repo, future.id, user.id), { status: 409, code: 'DISCOUNT_CODE_NOT_STARTED', details: { startsAt: future.startsAt } });

  const past = await makeCode(repo, { startsAt: iso(Date.now() - 5 * HOUR_MS), expiresAt: iso(Date.now() - HOUR_MS) });
  await assertApiError(reserve(repo, past.id, user.id), { status: 409, code: 'DISCOUNT_CODE_EXPIRED', details: { expiresAt: past.expiresAt } });

  await assertApiError(reserve(repo, 'no-such-code-id', user.id), { status: 404, code: 'DISCOUNT_CODE_INVALID' });
});

test('the date window opens AT startsAt and closes AT expiresAt (inclusive start, exclusive end)', async (t) => {
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const repo = newRepo();
  const code = await makeCode(repo, { startsAt: iso(start + 60_000), expiresAt: iso(start + 120_000) });
  const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((name) => makeUser(repo, name)));

  await assertApiError(reserve(repo, code.id, a.id), { status: 409, code: 'DISCOUNT_CODE_NOT_STARTED' });
  t.mock.timers.setTime(start + 60_000);
  assert.equal((await reserve(repo, code.id, a.id)).status, 'reserved');
  t.mock.timers.setTime(start + 120_000 - 1);
  assert.equal((await reserve(repo, code.id, b.id)).status, 'reserved');
  t.mock.timers.setTime(start + 120_000);
  await assertApiError(reserve(repo, code.id, c.id), { status: 409, code: 'DISCOUNT_CODE_EXPIRED' });
});

test('deactivating or expiring a code never voids a checkout that already holds a price: confirmation still succeeds, new reservations do not', async (t) => {
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const repo = newRepo();
  const code = await makeCode(repo, { expiresAt: iso(start + 30 * MINUTE_MS), maxRedemptions: 5 });
  const [a, b] = await Promise.all([makeUser(repo, 'Holder'), makeUser(repo, 'Newcomer')]);
  const { transaction } = await reserveWithTx(repo, code.id, a.id, { holdMs: 24 * HOUR_MS });

  await repo.discountCodes.update(code.id, { active: false });
  t.mock.timers.setTime(start + 40 * MINUTE_MS); // now also past the code's own expiry

  assert.equal((await repo.discountRedemptions.confirmForTransaction(transaction.id)).ok, true);
  await assertApiError(reserve(repo, code.id, b.id), { status: 404, code: 'DISCOUNT_CODE_INVALID' });
});

test('capacity can never be lowered below what is in use, but can be raised or removed; a lapsed hold is not "in use"', async (t) => {
  const start = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: 3 });
  const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((name) => makeUser(repo, name)));
  const { transaction: txA } = await reserveWithTx(repo, code.id, a.id, { holdMs: HOUR_MS });
  await repo.discountRedemptions.confirmForTransaction(txA.id);
  await reserveWithTx(repo, code.id, b.id, { holdMs: HOUR_MS });          // live pending
  await reserveWithTx(repo, code.id, c.id, { holdMs: 5 * MINUTE_MS });    // will lapse

  await assertApiError(repo.discountCodes.update(code.id, { maxRedemptions: 1 }), { status: 409, code: 'DISCOUNT_CAPACITY_BELOW_USED' });
  assert.equal((await repo.discountCodes.update(code.id, { maxRedemptions: 3 })).maxRedemptions, 3);

  t.mock.timers.setTime(start + 10 * MINUTE_MS); // C's hold lapsed: only A (confirmed) + B (live) are in use
  assert.equal((await repo.discountCodes.update(code.id, { maxRedemptions: 2 })).maxRedemptions, 2);
  await assertApiError(repo.discountCodes.update(code.id, { maxRedemptions: 1 }), { status: 409, code: 'DISCOUNT_CAPACITY_BELOW_USED' });
  assert.equal((await repo.discountCodes.update(code.id, { maxRedemptions: null })).maxRedemptions, null);
  await assertApiError(repo.discountCodes.update('missing-id', { active: false }), { status: 404, code: 'DISCOUNT_CODE_NOT_FOUND' });
});

test('a refunded redemption stays consumed: the slot is not returned and the user cannot redeem again', async () => {
  const repo = newRepo();
  const code = await makeCode(repo, { maxRedemptions: 1 });
  const [a, b] = await Promise.all([makeUser(repo, 'Refunded Buyer'), makeUser(repo, 'Next Buyer')]);
  const { transaction } = await reserveWithTx(repo, code.id, a.id);
  await repo.discountRedemptions.confirmForTransaction(transaction.id);

  const refunded = await repo.discountRedemptions.markRefundedForTransaction(transaction.id);
  assert.equal(refunded.status, 'confirmed', 'a refund does not un-confirm the redemption');
  assert.ok(refunded.refundedAt, 'the refund is recorded on the redemption');
  assertStats(await repo.discountCodes.stats(code.id), { confirmed: 1, pendingReservations: 0, remaining: 0 });
  await assertApiError(reserve(repo, code.id, a.id), { status: 409, code: 'DISCOUNT_CODE_ALREADY_USED' });
  await assertApiError(reserve(repo, code.id, b.id), { status: 409, code: 'DISCOUNT_CODE_EXHAUSTED' });
});

test('a transaction carries at most one redemption, lookups by transaction work, and history lists newest first', async () => {
  const repo = newRepo();
  requireDiscountDomains(repo);
  const code = await makeCode(repo, { maxRedemptions: 5 });
  const [a, b] = await Promise.all([makeUser(repo, 'A'), makeUser(repo, 'B')]);
  const first = await reserveWithTx(repo, code.id, a.id);
  await new Promise((resolve) => setTimeout(resolve, 5)); // distinct createdAt, so "newest first" is not decided by a timestamp tie
  const second = await reserveWithTx(repo, code.id, b.id);

  await assert.rejects(repo.discountRedemptions.attachTransaction(second.redemption.id, first.transaction.id), 'one transaction can back only one redemption');
  assert.equal((await repo.discountRedemptions.getByTransactionId(first.transaction.id)).id, first.redemption.id);
  assert.equal(await repo.discountRedemptions.getByTransactionId('no-such-transaction'), null);

  const rows = await repo.discountRedemptions.listForCode(code.id);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, second.redemption.id, 'newest first');
  for (const field of ['userId', 'transactionId', 'planId', 'status', 'originalAmountMicroUsd', 'discountAmountMicroUsd', 'finalAmountMicroUsd', 'reservedUntil', 'createdAt']) {
    assert.ok(field in rows[0], 'history row exposes ' + field);
  }
});
