import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MICRO, BPS_MAX, computeCommission, computeCommissionableBase, applyMarginGuard, applyCaps,
  customerCapReached, computeAiMarginBase, lotRemainingMicroUsd, lotIsMatured, deriveLotStatus,
  allocateFifo, sumAllocations, recomputeCommissionAfterRefund, parseProgramVersionInput,
  parseAssignmentInput, resolveEffectiveMode, resolveEffectiveCommissionBps, assertLegalPayoutTransition,
  generateReferralCode, normalizeReferralCode, referralCodePattern
} from '../server/commercial/referral-rules.mjs';

// --- computeCommission -------------------------------------------------------------------------
test('computeCommission floors, never rounds up, and never uses float arithmetic', () => {
  // 999999 * 333 / 10000 = 33299.9667 -> floors to 33299, never 33300.
  assert.equal(computeCommission({ commissionableBaseMicroUsd: 999999, commissionBps: 333 }), 33299);
  assert.equal(computeCommission({ commissionableBaseMicroUsd: 100 * MICRO, commissionBps: BPS_MAX }), 100 * MICRO);
  assert.equal(computeCommission({ commissionableBaseMicroUsd: 0, commissionBps: 5000 }), 0);
  assert.equal(computeCommission({ commissionableBaseMicroUsd: 10 * MICRO, commissionBps: 0 }), 0);
});
test('computeCommission refuses a non-integer or negative base, or an out-of-range bps', () => {
  assert.throws(() => computeCommission({ commissionableBaseMicroUsd: -1, commissionBps: 100 }));
  assert.throws(() => computeCommission({ commissionableBaseMicroUsd: 1.5, commissionBps: 100 }));
  assert.throws(() => computeCommission({ commissionableBaseMicroUsd: 100, commissionBps: -1 }));
  assert.throws(() => computeCommission({ commissionableBaseMicroUsd: 100, commissionBps: BPS_MAX + 1 }));
});

test('computeCommissionableBase subtracts tax/refund/excluded and never goes negative', () => {
  assert.equal(computeCommissionableBase({ finalAmountMicroUsd: 10000, taxMicroUsd: 500, refundedMicroUsd: 0, excludedMicroUsd: 0 }), 9500);
  assert.equal(computeCommissionableBase({ finalAmountMicroUsd: 100, taxMicroUsd: 50, refundedMicroUsd: 80, excludedMicroUsd: 0 }), 0);
  assert.equal(computeCommissionableBase({ finalAmountMicroUsd: 100 }), 100);
});

// --- applyMarginGuard ---------------------------------------------------------------------------
test('applyMarginGuard grants the full commission when plenty of margin room remains', () => {
  const result = applyMarginGuard({
    commissionMicroUsd: 1000, netRevenueMicroUsd: 10 * MICRO, paymentFeeBps: 300, serviceCostBps: 200, minMarginMicroUsd: 5 * MICRO
  });
  assert.equal(result.outcome, 'earned');
  assert.equal(result.grantedMicroUsd, 1000);
});
test('applyMarginGuard clamps the commission down when the margin is tight, never below zero', () => {
  // revenue 1000, fee 10% = 100, service 10% = 100, minMargin 700 -> room = 1000-100-100-700 = 100
  const result = applyMarginGuard({ commissionMicroUsd: 500, netRevenueMicroUsd: 1000, paymentFeeBps: 1000, serviceCostBps: 1000, minMarginMicroUsd: 700 });
  assert.equal(result.outcome, 'clamped');
  assert.equal(result.grantedMicroUsd, 100);
});
test('applyMarginGuard skips entirely (grants 0) when there is no room at all, never negative', () => {
  const result = applyMarginGuard({ commissionMicroUsd: 500, netRevenueMicroUsd: 100, paymentFeeBps: 5000, serviceCostBps: 5000, minMarginMicroUsd: 100 });
  assert.equal(result.outcome, 'skipped:margin_guard');
  assert.equal(result.grantedMicroUsd, 0);
  assert.ok(result.grantedMicroUsd >= 0);
});
test('applyMarginGuard minMargin is the larger of the flat floor and the bps-derived floor', () => {
  const result = applyMarginGuard({ commissionMicroUsd: 10, netRevenueMicroUsd: 1000, minMarginMicroUsd: 900, minMarginBps: 100 });
  // bps-derived = 1000*100/10000=10, flat=900 -> min margin is 900 (the larger), room=1000-0-0-900=100
  assert.equal(result.minMarginMicroUsd, 900);
  assert.equal(result.roomForCommissionMicroUsd, 100);
});

// --- applyCaps -----------------------------------------------------------------------------------
test('applyCaps clamps to whichever configured cap binds first, in the documented order', () => {
  const result = applyCaps(1000, {
    programBudget: { capMicroUsd: 5000, usedMicroUsd: 4700 }, // remaining 300
    perUser: { capMicroUsd: 2000, usedMicroUsd: 0 }
  });
  assert.equal(result.grantedMicroUsd, 300);
  assert.deepEqual(result.limitedBy, ['programBudget']);
});
test('applyCaps with no caps configured passes the full amount through unchanged', () => {
  const result = applyCaps(1000, {});
  assert.equal(result.grantedMicroUsd, 1000);
  assert.deepEqual(result.limitedBy, []);
});
test('applyCaps never reports a cap as limiting when it does not actually bind', () => {
  const result = applyCaps(100, { programBudget: { capMicroUsd: 5000, usedMicroUsd: 0 } });
  assert.equal(result.grantedMicroUsd, 100);
  assert.deepEqual(result.limitedBy, []);
});
test('customerCapReached is a pure headcount gate independent of money caps', () => {
  assert.equal(customerCapReached(5, 5), true);
  assert.equal(customerCapReached(4, 5), false);
  assert.equal(customerCapReached(5, null), false);
});

// --- computeAiMarginBase --------------------------------------------------------------------------
test('computeAiMarginBase scales gross margin down to the cash-funded share only', () => {
  // retail 1000, cost 400 -> grossMargin 600; cash 500 of total 1000 -> half is cash-funded -> 300
  assert.equal(computeAiMarginBase({ retailChargeMicroUsd: 1000, providerCostMicroUsd: 400, cashDeltaMicroUsd: 500, totalDeltaMicroUsd: 1000 }), 300);
});
test('computeAiMarginBase is zero when the settlement was entirely promo/bonus-funded', () => {
  assert.equal(computeAiMarginBase({ retailChargeMicroUsd: 1000, providerCostMicroUsd: 400, cashDeltaMicroUsd: 0, totalDeltaMicroUsd: 1000 }), 0);
});
test('computeAiMarginBase never goes negative when provider cost exceeds retail (a loss-making call)', () => {
  assert.equal(computeAiMarginBase({ retailChargeMicroUsd: 100, providerCostMicroUsd: 500, cashDeltaMicroUsd: 100, totalDeltaMicroUsd: 100 }), 0);
});
test('computeAiMarginBase is zero for a zero-total settlement (never divides by zero)', () => {
  assert.equal(computeAiMarginBase({ retailChargeMicroUsd: 1000, providerCostMicroUsd: 400, cashDeltaMicroUsd: 0, totalDeltaMicroUsd: 0 }), 0);
});

// --- lot status derivation -------------------------------------------------------------------------
function lot(overrides = {}) {
  return { originalMicroUsd: 1000, aiConvertedMicroUsd: 0, payoutReservedMicroUsd: 0, paidMicroUsd: 0, reversedMicroUsd: 0, maturesAt: null, ...overrides };
}
test('deriveLotStatus: an unmatured lot is pending, a matured untouched lot is available_cash', () => {
  const future = new Date(Date.now() + 60000).toISOString();
  const past = new Date(Date.now() - 60000).toISOString();
  assert.equal(deriveLotStatus(lot({ maturesAt: future })), 'pending');
  assert.equal(deriveLotStatus(lot({ maturesAt: past })), 'available_cash');
  assert.equal(deriveLotStatus(lot({ maturesAt: null })), 'available_cash');
});
test('deriveLotStatus: fully allocated buckets report their own terminal status', () => {
  assert.equal(deriveLotStatus(lot({ aiConvertedMicroUsd: 1000 })), 'ai_converted');
  assert.equal(deriveLotStatus(lot({ payoutReservedMicroUsd: 1000 })), 'payout_reserved');
  assert.equal(deriveLotStatus(lot({ paidMicroUsd: 1000 })), 'paid');
  assert.equal(deriveLotStatus(lot({ reversedMicroUsd: 1000 })), 'reversed');
});
test('deriveLotStatus: an open debt case always reports "debt" regardless of the bucket state', () => {
  assert.equal(deriveLotStatus(lot({ paidMicroUsd: 1000 }), { hasOpenDebt: true }), 'debt');
  assert.equal(deriveLotStatus(lot({ aiConvertedMicroUsd: 1000 }), { hasOpenDebt: true }), 'debt');
});
test('lotRemainingMicroUsd never goes negative and matches the CHECK-constraint invariant', () => {
  assert.equal(lotRemainingMicroUsd(lot({ aiConvertedMicroUsd: 300, reversedMicroUsd: 200 })), 500);
  assert.equal(lotRemainingMicroUsd(lot({ aiConvertedMicroUsd: 1000, reversedMicroUsd: 200 })), 0);
});
test('lotIsMatured respects maturesAt against the supplied clock', () => {
  const at = new Date('2026-01-01T00:00:00Z').getTime();
  assert.equal(lotIsMatured({ maturesAt: '2026-01-01T00:00:00Z' }, at), true);
  assert.equal(lotIsMatured({ maturesAt: '2026-01-02T00:00:00Z' }, at), false);
  assert.equal(lotIsMatured({ maturesAt: null }, at), true);
});

// --- FIFO allocation -------------------------------------------------------------------------------
test('allocateFifo drains the oldest lots first and reports any unallocated remainder', () => {
  const lots = [{ id: 'a', availableMicroUsd: 100 }, { id: 'b', availableMicroUsd: 50 }, { id: 'c', availableMicroUsd: 200 }];
  const { allocations, unallocatedMicroUsd } = allocateFifo(lots, 120);
  assert.deepEqual(allocations, [{ lotId: 'a', amountMicroUsd: 100 }, { lotId: 'b', amountMicroUsd: 20 }]);
  assert.equal(unallocatedMicroUsd, 0);
  assert.equal(sumAllocations(allocations), 120);
});
test('allocateFifo reports the true shortfall when total available is insufficient', () => {
  const lots = [{ id: 'a', availableMicroUsd: 10 }];
  const { allocations, unallocatedMicroUsd } = allocateFifo(lots, 50);
  assert.equal(sumAllocations(allocations), 10);
  assert.equal(unallocatedMicroUsd, 40);
});
test('allocateFifo skips lots with nothing available without erroring', () => {
  const lots = [{ id: 'a', availableMicroUsd: 0 }, { id: 'b', availableMicroUsd: 40 }];
  const { allocations } = allocateFifo(lots, 40);
  assert.deepEqual(allocations, [{ lotId: 'b', amountMicroUsd: 40 }]);
});
test('allocateFifo refuses a negative or non-integer amount', () => {
  assert.throws(() => allocateFifo([], -1));
  assert.throws(() => allocateFifo([], 1.5));
});

// --- refund/chargeback reversal math -----------------------------------------------------------------
test('recomputeCommissionAfterRefund reduces the base by exactly the refund and re-applies the same bps', () => {
  // original base 10000 @ 1000bps(10%) = 1000 commission; refund 4000 -> new base 6000 -> new commission 600
  const original = computeCommission({ commissionableBaseMicroUsd: 10000, commissionBps: 1000 });
  const afterRefund = recomputeCommissionAfterRefund({ originalBaseMicroUsd: 10000, refundedMicroUsd: 4000, commissionBps: 1000 });
  assert.equal(original, 1000);
  assert.equal(afterRefund, 600);
  const reversalDelta = original - afterRefund;
  assert.equal(reversalDelta, 400);
});
test('recomputeCommissionAfterRefund on a full refund reduces the commission to exactly zero', () => {
  assert.equal(recomputeCommissionAfterRefund({ originalBaseMicroUsd: 10000, refundedMicroUsd: 10000, commissionBps: 1000 }), 0);
});
test('recomputeCommissionAfterRefund never goes negative on an over-large refund figure', () => {
  assert.equal(recomputeCommissionAfterRefund({ originalBaseMicroUsd: 10000, refundedMicroUsd: 99999, commissionBps: 1000 }), 0);
});

// --- payout state machine ----------------------------------------------------------------------------
test('assertLegalPayoutTransition allows exactly the documented forward path', () => {
  assert.doesNotThrow(() => assertLegalPayoutTransition('requested', 'under_review'));
  assert.doesNotThrow(() => assertLegalPayoutTransition('under_review', 'approved'));
  assert.doesNotThrow(() => assertLegalPayoutTransition('approved', 'submitted'));
  assert.doesNotThrow(() => assertLegalPayoutTransition('submitted', 'confirmed'));
  assert.doesNotThrow(() => assertLegalPayoutTransition('confirmed', 'paid'));
});
test('assertLegalPayoutTransition allows cancel/reject/fail only from their legal origin states', () => {
  assert.doesNotThrow(() => assertLegalPayoutTransition('requested', 'cancelled'));
  assert.throws(() => assertLegalPayoutTransition('under_review', 'cancelled'), /PAYOUT_ILLEGAL_TRANSITION/);
  assert.doesNotThrow(() => assertLegalPayoutTransition('submitted', 'failed'));
});
test('assertLegalPayoutTransition refuses skipping a stage and refuses any move out of a terminal state', () => {
  assert.throws(() => assertLegalPayoutTransition('requested', 'approved'));
  assert.throws(() => assertLegalPayoutTransition('paid', 'requested'));
  assert.throws(() => assertLegalPayoutTransition('rejected', 'requested'));
});

// --- input validation (admin-facing units -> stored units) --------------------------------------------
test('parseProgramVersionInput converts USD/percent admin units to micro-USD/bps and rejects wallet_topup', () => {
  const parsed = parseProgramVersionInput({
    commissionBps: 1000, eligibleSources: ['subscription'], attributionWindowDays: 30, holdDays: 14,
    cashOutMinimumUsd: 10, minMarginUsd: 2, minMarginPercent: 1.5, paymentFeePercent: 2.9, serviceCostPercent: 1
  });
  assert.equal(parsed.commissionBps, 1000);
  assert.equal(parsed.cashOutMinimumMicroUsd, 10 * MICRO);
  assert.equal(parsed.minMarginBps, 150);
  assert.equal(parsed.paymentFeeBps, 290);
  assert.deepEqual(parsed.eligibleSources, ['subscription']);
});
test('parseProgramVersionInput refuses wallet_topup as an eligible source', () => {
  assert.throws(() => parseProgramVersionInput({
    commissionBps: 1000, eligibleSources: ['wallet_topup'], attributionWindowDays: 30, holdDays: 14, cashOutMinimumUsd: 10
  }), /VALIDATION_FAILED/);
});
test('parseProgramVersionInput refuses an out-of-range commissionBps or a negative cap', () => {
  assert.throws(() => parseProgramVersionInput({ commissionBps: 10001, eligibleSources: ['subscription'], attributionWindowDays: 30, holdDays: 14, cashOutMinimumUsd: 10 }));
  assert.throws(() => parseProgramVersionInput({
    commissionBps: 1000, eligibleSources: ['subscription'], attributionWindowDays: 30, holdDays: 14, cashOutMinimumUsd: 10, programBudgetCapUsd: -5
  }));
});
test('parseProgramVersionInput partial mode only validates present fields against the existing row', () => {
  const existing = { effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null };
  const patch = parseProgramVersionInput({ commissionBps: 500 }, { partial: true, existing });
  assert.deepEqual(patch, { commissionBps: 500 });
});

test('parseAssignmentInput requires a programVersionId for influencer mode but not for disabled', () => {
  assert.throws(() => parseAssignmentInput({ mode: 'influencer' }), /VALIDATION_FAILED/);
  assert.doesNotThrow(() => parseAssignmentInput({ mode: 'disabled' }));
  const parsed = parseAssignmentInput({ mode: 'influencer', programVersionId: 'v1', rateBpsOverride: 1200 });
  assert.equal(parsed.rateBpsOverride, 1200);
});
test('parseAssignmentInput refuses an unknown mode', () => {
  assert.throws(() => parseAssignmentInput({ mode: 'self-service' }), /VALIDATION_FAILED/);
});

// --- effective mode/rate resolution --------------------------------------------------------------------
test('resolveEffectiveMode: an explicit active assignment always wins, including an explicit disabled', () => {
  assert.equal(resolveEffectiveMode({ assignment: { status: 'active', mode: 'disabled' }, defaultProgram: { autoEnrollUnassigned: true, status: 'active', publishedVersion: {} } }), 'disabled');
  assert.equal(resolveEffectiveMode({ assignment: { status: 'active', mode: 'influencer' }, defaultProgram: null }), 'influencer');
});
test('resolveEffectiveMode: no assignment resolves to implicit standard only when auto-enroll + a published default exist', () => {
  assert.equal(resolveEffectiveMode({ assignment: null, defaultProgram: { autoEnrollUnassigned: true, status: 'active', publishedVersion: { id: 'v1' } } }), 'standard');
  assert.equal(resolveEffectiveMode({ assignment: null, defaultProgram: { autoEnrollUnassigned: false, status: 'active', publishedVersion: { id: 'v1' } } }), 'disabled');
  assert.equal(resolveEffectiveMode({ assignment: null, defaultProgram: null }), 'disabled');
});
test('resolveEffectiveMode: a not-yet-started or already-ended assignment falls back to the implicit default', () => {
  const future = { status: 'active', mode: 'influencer', effectiveFrom: new Date(Date.now() + 60000).toISOString(), effectiveTo: null };
  assert.equal(resolveEffectiveMode({ assignment: future, defaultProgram: { autoEnrollUnassigned: true, status: 'active', publishedVersion: {} } }), 'standard');
});
test('resolveEffectiveCommissionBps: an influencer override wins over the version default', () => {
  assert.equal(resolveEffectiveCommissionBps({ mode: 'influencer', assignment: { rateBpsOverride: 2500 }, programVersion: { commissionBps: 1000 } }), 2500);
  assert.equal(resolveEffectiveCommissionBps({ mode: 'standard', assignment: null, programVersion: { commissionBps: 1000 } }), 1000);
});

// --- referral code shape ---------------------------------------------------------------------------
test('generateReferralCode never contains visually ambiguous characters (0/O, 1/I/L)', () => {
  const fixedBytes = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
  const code = generateReferralCode(() => fixedBytes);
  assert.match(code, referralCodePattern());
  assert.doesNotMatch(code, /[01IOL]/);
});
test('normalizeReferralCode uppercases and validates shape, rejecting a malformed code', () => {
  assert.equal(normalizeReferralCode('ab2cd3ef'), 'AB2CD3EF');
  assert.equal(normalizeReferralCode('short'), null);
  assert.equal(normalizeReferralCode('has spaces'), null);
  assert.equal(normalizeReferralCode(42), null);
});
