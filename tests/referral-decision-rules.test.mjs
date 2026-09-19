import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MICRO, rulesHashOf, buildRulesSnapshot, commissionEndsAtFor, maturesAtFor, decideEarning, summarizeLots,
  planReversal, atomicAmountFor, applyMarginGuard, parseAssignmentInput, computeCommission
} from '../server/commercial/referral-rules.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = '2026-06-01T00:00:00.000Z';

function version(overrides = {}) {
  return {
    id: 'v1', programId: 'p1', rulesHash: 'h', commissionBps: 1000, eligibleSources: ['subscription'], eligiblePlans: null,
    eligibleProducts: null, attributionWindowDays: 30, holdDays: 14, commissionTermDays: null, cashOutMinimumMicroUsd: 10 * MICRO,
    programBudgetCapMicroUsd: null, perUserCapMicroUsd: null, perCustomerCapMicroUsd: null, campaignCapMicroUsd: null,
    maxReferredCustomers: null, minMarginMicroUsd: 0, minMarginBps: 0, paymentFeeBps: 0, serviceCostBps: 0, payoutAssetPolicy: 'bep20_usdt',
    ...overrides
  };
}
function attribution(rulesOverrides = {}, overrides = {}) {
  const rulesSnapshot = { ...buildRulesSnapshot({ version: version(), assignment: null, mode: 'standard' }), ...rulesOverrides };
  return { status: 'active', commissionEndsAt: null, rulesSnapshot, ...overrides };
}
const base = { source: 'subscription', referrerMode: 'standard', programStatus: 'active', finalAmountMicroUsd: 20 * MICRO, confirmedAt: NOW };

// --- rulesHashOf --------------------------------------------------------------------------------
test('rulesHashOf is deterministic, order-insensitive for arrays, and changes when any financial rule changes', () => {
  const a = rulesHashOf({ commissionBps: 1000, eligibleSources: ['subscription', 'storage_purchase'] });
  const b = rulesHashOf({ commissionBps: 1000, eligibleSources: ['storage_purchase', 'subscription'] });
  assert.equal(a, b);
  assert.notEqual(a, rulesHashOf({ commissionBps: 1001, eligibleSources: ['subscription', 'storage_purchase'] }));
  assert.match(a, /^[0-9a-f]{64}$/);
});

// --- buildRulesSnapshot -------------------------------------------------------------------------
test('buildRulesSnapshot for standard mode copies the version terms and ignores any assignment overrides', () => {
  const snap = buildRulesSnapshot({ version: version({ commissionBps: 800 }), assignment: { rateBpsOverride: 5000 }, mode: 'standard' });
  assert.equal(snap.commissionBps, 800);
  assert.equal(snap.mode, 'standard');
  assert.equal(snap.assignmentId, null);
});
test('buildRulesSnapshot for influencer mode applies the rate override, tighter caps and a source subset', () => {
  const snap = buildRulesSnapshot({
    version: version({ commissionBps: 800, eligibleSources: ['subscription', 'storage_purchase'], perCustomerCapMicroUsd: 50 * MICRO, maxReferredCustomers: 100 }),
    assignment: { id: 'a1', rateBpsOverride: 2000, allowedSources: ['subscription', 'ai_margin'], perCustomerCapMicroUsd: 20 * MICRO, maxReferredCustomers: 500, commissionTermDays: 90, partnershipCapMicroUsd: 1000 * MICRO },
    mode: 'influencer'
  });
  assert.equal(snap.commissionBps, 2000);
  assert.deepEqual(snap.eligibleSources, ['subscription'], 'a source the version does not allow can never be added by an assignment');
  assert.equal(snap.caps.perCustomerCapMicroUsd, 20 * MICRO, 'the tighter of the two per-customer caps wins');
  assert.equal(snap.caps.maxReferredCustomers, 100, 'the tighter headcount wins');
  assert.equal(snap.caps.partnershipCapMicroUsd, 1000 * MICRO);
  assert.equal(snap.commissionTermDays, 90);
  assert.equal(snap.assignmentId, 'a1');
});

test('commissionEndsAtFor / maturesAtFor add whole days and treat a null term as unlimited', () => {
  assert.equal(commissionEndsAtFor(NOW, null), null);
  assert.equal(commissionEndsAtFor(NOW, 10), new Date(Date.parse(NOW) + 10 * DAY).toISOString());
  assert.equal(maturesAtFor(NOW, 14), new Date(Date.parse(NOW) + 14 * DAY).toISOString());
  assert.equal(maturesAtFor(NOW, 0), NOW);
});

// --- decideEarning: refusals ---------------------------------------------------------------------
test('decideEarning never earns from a wallet top-up (or any non-eligible source)', () => {
  const result = decideEarning({ ...base, source: 'wallet_topup', attribution: attribution() });
  assert.equal(result.outcome, 'skipped');
  assert.equal(result.reason, 'SOURCE_NOT_ELIGIBLE');
});
test('decideEarning refuses a source the snapshot does not list (storage is off by default)', () => {
  assert.equal(decideEarning({ ...base, source: 'storage_purchase', attribution: attribution() }).reason, 'SOURCE_NOT_ELIGIBLE');
});
test('decideEarning refuses a zero or negative paid amount (a 100%-discount purchase earns nothing)', () => {
  assert.equal(decideEarning({ ...base, finalAmountMicroUsd: 0, attribution: attribution() }).reason, 'ZERO_AMOUNT');
  assert.equal(decideEarning({ ...base, finalAmountMicroUsd: -5, attribution: attribution() }).reason, 'ZERO_AMOUNT');
});
test('decideEarning refuses when the attribution is void, the referrer is disabled, or the program is archived', () => {
  assert.equal(decideEarning({ ...base, attribution: attribution({}, { status: 'void' }) }).reason, 'ATTRIBUTION_VOID');
  assert.equal(decideEarning({ ...base, referrerMode: 'disabled', attribution: attribution() }).reason, 'REFERRER_DISABLED');
  assert.equal(decideEarning({ ...base, programStatus: 'archived', attribution: attribution() }).reason, 'PROGRAM_ARCHIVED');
});
test('decideEarning: a PAUSED program still earns for an existing attribution (pause only blocks new attributions)', () => {
  assert.equal(decideEarning({ ...base, programStatus: 'paused', attribution: attribution() }).outcome, 'earned');
});
test('decideEarning refuses a payment after the commission term ended', () => {
  const ended = attribution({}, { commissionEndsAt: new Date(Date.parse(NOW) - DAY).toISOString() });
  assert.equal(decideEarning({ ...base, attribution: ended }).reason, 'OUTSIDE_TERM');
});
test('decideEarning enforces plan and product eligibility lists', () => {
  const planLimited = attribution({ eligiblePlans: ['pro'] });
  assert.equal(decideEarning({ ...base, planId: 'plus', attribution: planLimited }).reason, 'PLAN_NOT_ELIGIBLE');
  assert.equal(decideEarning({ ...base, planId: 'pro', attribution: planLimited }).outcome, 'earned');
  const productLimited = attribution({ eligibleSources: ['storage_purchase'], eligibleProducts: ['s100'] });
  assert.equal(decideEarning({ ...base, source: 'storage_purchase', productId: 's500', attribution: productLimited }).reason, 'PRODUCT_NOT_ELIGIBLE');
});
test('decideEarning refuses a NEW referred customer once maxReferredCustomers is reached, but not one who already earned', () => {
  const capped = attribution({ caps: { ...attribution().rulesSnapshot.caps, maxReferredCustomers: 2 } });
  assert.equal(decideEarning({ ...base, attribution: capped, usage: { qualifiedCustomerCount: 2, attributionHasEarning: false } }).reason, 'CUSTOMER_CAP');
  assert.equal(decideEarning({ ...base, attribution: capped, usage: { qualifiedCustomerCount: 2, attributionHasEarning: true } }).outcome, 'earned');
});

// --- decideEarning: math ---------------------------------------------------------------------------
test('decideEarning earns floor(base * bps / 10000) and sets the maturity from the hold days', () => {
  const result = decideEarning({ ...base, attribution: attribution() });
  assert.equal(result.outcome, 'earned');
  assert.equal(result.commissionMicroUsd, 2 * MICRO);
  assert.equal(result.commissionableBaseMicroUsd, 20 * MICRO);
  assert.equal(result.maturesAt, new Date(Date.parse(NOW) + 14 * DAY).toISOString());
});
test('decideEarning deducts tax and excluded items from the commissionable base', () => {
  const result = decideEarning({ ...base, taxMicroUsd: 2 * MICRO, excludedMicroUsd: 3 * MICRO, attribution: attribution() });
  assert.equal(result.commissionableBaseMicroUsd, 15 * MICRO);
  assert.equal(result.commissionMicroUsd, 1.5 * MICRO);
});
test('decideEarning clamps with the contribution-margin guard, counting the wallet bonus as a cost', () => {
  // base 20, 10% => 2.00. paymentFee 0, serviceCost 50% = 10, walletBonus 8, minMargin 0 -> room = 20-10-8 = 2 -> earned
  const tight = attribution({ margin: { minMarginMicroUsd: 0, minMarginBps: 0, paymentFeeBps: 0, serviceCostBps: 5000 } });
  assert.equal(decideEarning({ ...base, walletBonusMicroUsd: 8 * MICRO, attribution: tight }).outcome, 'earned');
  // bonus 9.5 -> room = 0.5 -> clamped to 0.50
  const clamped = decideEarning({ ...base, walletBonusMicroUsd: 9.5 * MICRO, attribution: tight });
  assert.equal(clamped.outcome, 'clamped');
  assert.equal(clamped.commissionMicroUsd, 0.5 * MICRO);
  assert.match(clamped.reason, /MARGIN_GUARD/);
  // bonus 12 -> no room -> skipped
  const none = decideEarning({ ...base, walletBonusMicroUsd: 12 * MICRO, attribution: tight });
  assert.equal(none.outcome, 'skipped');
  assert.equal(none.reason, 'MARGIN_GUARD');
});
test('decideEarning clamps to the remaining program budget and reports which cap bound', () => {
  const capped = attribution({ caps: { ...attribution().rulesSnapshot.caps, programBudgetCapMicroUsd: 10 * MICRO } });
  const result = decideEarning({ ...base, attribution: capped, usage: { programUsedMicroUsd: 9 * MICRO + 500000 } });
  assert.equal(result.outcome, 'clamped');
  assert.equal(result.commissionMicroUsd, 500000);
  assert.match(result.reason, /CAP:programBudget/);
});
test('decideEarning skips once the budget is exhausted (never a negative or fractional grant)', () => {
  const capped = attribution({ caps: { ...attribution().rulesSnapshot.caps, perUserCapMicroUsd: 5 * MICRO } });
  const result = decideEarning({ ...base, attribution: capped, usage: { perUserUsedMicroUsd: 5 * MICRO } });
  assert.equal(result.outcome, 'skipped');
  assert.equal(result.reason, 'CAP_REACHED');
});
test('decideEarning outcome is always an integer micro-USD amount', () => {
  for (const amount of [1, 7, 999, 123457, 20 * MICRO + 3]) {
    const result = decideEarning({ ...base, finalAmountMicroUsd: amount, attribution: attribution({ commissionBps: 333 }) });
    if (result.outcome !== 'skipped') assert.ok(Number.isSafeInteger(result.commissionMicroUsd));
  }
});

// --- applyMarginGuard extra cost ----------------------------------------------------------------------
test('applyMarginGuard subtracts a known extra cost at face value on top of the estimated bps costs', () => {
  const result = applyMarginGuard({ commissionMicroUsd: 500, netRevenueMicroUsd: 1000, extraCostMicroUsd: 700 });
  assert.equal(result.roomForCommissionMicroUsd, 300);
  assert.equal(result.grantedMicroUsd, 300);
});

// --- summarizeLots -----------------------------------------------------------------------------------
function lot(overrides = {}) {
  return { originalMicroUsd: 1000, aiConvertedMicroUsd: 0, payoutReservedMicroUsd: 0, paidMicroUsd: 0, reversedMicroUsd: 0, maturesAt: null, ...overrides };
}
test('summarizeLots splits the free remainder into pending vs available by maturity and derives spendable after debt', () => {
  const nowMs = Date.parse(NOW);
  const totals = summarizeLots([
    lot({ maturesAt: new Date(nowMs + DAY).toISOString() }),                         // pending 1000
    lot({ maturesAt: new Date(nowMs - DAY).toISOString(), aiConvertedMicroUsd: 300 }), // available 700, converted 300
    lot({ maturesAt: new Date(nowMs - DAY).toISOString(), payoutReservedMicroUsd: 400, paidMicroUsd: 100 }), // available 500
    lot({ maturesAt: new Date(nowMs - DAY).toISOString(), reversedMicroUsd: 1000 })  // fully reversed
  ], { openDebtMicroUsd: 200, now: nowMs });
  assert.equal(totals.pendingMicroUsd, 1000);
  assert.equal(totals.availableCashMicroUsd, 1200);
  assert.equal(totals.aiConvertedMicroUsd, 300);
  assert.equal(totals.payoutReservedMicroUsd, 400);
  assert.equal(totals.paidMicroUsd, 100);
  assert.equal(totals.reversedMicroUsd, 1000);
  assert.equal(totals.debtMicroUsd, 200);
  assert.equal(totals.spendableMicroUsd, 1000, 'open debt is held back from what may be converted or paid out');
});
test('summarizeLots spendable never goes negative when debt exceeds what is available', () => {
  assert.equal(summarizeLots([lot()], { openDebtMicroUsd: 99999 }).spendableMicroUsd, 0);
});

// --- planReversal ------------------------------------------------------------------------------------
test('planReversal takes from the free remainder first, then reserved, then records debt', () => {
  // original 1000: remaining 300, reserved 200, converted 400, paid 100. Full refund -> claw back all 1000.
  const plan = planReversal({ originalMicroUsd: 1000, remainingMicroUsd: 300, reservedMicroUsd: 200, commissionAfterMicroUsd: 0 });
  assert.deepEqual(plan, { totalMicroUsd: 1000, fromRemaining: 300, fromReserved: 200, debt: 500 });
});
test('planReversal on a pending-only lot cancels it entirely with no reserved amount and no debt', () => {
  assert.deepEqual(planReversal({ originalMicroUsd: 1000, remainingMicroUsd: 1000, reservedMicroUsd: 0, commissionAfterMicroUsd: 0 }),
    { totalMicroUsd: 1000, fromRemaining: 1000, fromReserved: 0, debt: 0 });
});
test('planReversal for a partial refund reverses only the increment and is cumulative-safe', () => {
  // first partial refund shrinks the entitlement 1000 -> 600 : clawback 400 (all of it debt, nothing free)
  const first = planReversal({ originalMicroUsd: 1000, remainingMicroUsd: 0, reservedMicroUsd: 0, commissionAfterMicroUsd: 600 });
  assert.equal(first.totalMicroUsd, 400);
  assert.equal(first.debt, 400);
  // a second refund shrinks it to 400: only the additional 200 is new debt, not another 600
  const second = planReversal({ originalMicroUsd: 1000, remainingMicroUsd: 0, reservedMicroUsd: 0, alreadyClawedMicroUsd: 400, commissionAfterMicroUsd: 400 });
  assert.equal(second.totalMicroUsd, 200);
  assert.equal(second.debt, 200);
});
test('planReversal is a no-op when nothing more needs to be clawed back (idempotent replay)', () => {
  const plan = planReversal({ originalMicroUsd: 1000, remainingMicroUsd: 0, reservedMicroUsd: 0, alreadyClawedMicroUsd: 1000, commissionAfterMicroUsd: 0 });
  assert.deepEqual(plan, { totalMicroUsd: 0, fromRemaining: 0, fromReserved: 0, debt: 0 });
});
test('planReversal conserves the total: fromRemaining + fromReserved + debt == totalMicroUsd (sweep)', () => {
  for (let remaining = 0; remaining <= 300; remaining += 75) {
    for (let reserved = 0; reserved <= 300; reserved += 100) {
      for (const after of [0, 250, 700, 1000]) {
        const plan = planReversal({ originalMicroUsd: 1000, remainingMicroUsd: remaining, reservedMicroUsd: reserved, commissionAfterMicroUsd: after });
        assert.equal(plan.fromRemaining + plan.fromReserved + plan.debt, plan.totalMicroUsd);
        assert.ok(plan.fromRemaining >= 0 && plan.fromReserved >= 0 && plan.debt >= 0);
      }
    }
  }
});

// --- atomicAmountFor ---------------------------------------------------------------------------------
test('atomicAmountFor converts micro-USD to 18-decimal token atomic units exactly', () => {
  assert.equal(atomicAmountFor(10 * MICRO, 18), '10000000000000000000');
  assert.equal(atomicAmountFor(1, 18), '1000000000000');
  assert.equal(atomicAmountFor(123456, 6), '123456');
});
test('atomicAmountFor refuses a token with fewer than 6 decimals and a non-positive amount', () => {
  assert.throws(() => atomicAmountFor(100, 5), RangeError);
  assert.throws(() => atomicAmountFor(0, 18), RangeError);
  assert.throws(() => atomicAmountFor(1.5, 18), RangeError);
});

// --- parseAssignmentInput: partnership cap + term -----------------------------------------------------
test('parseAssignmentInput converts the partnership cap and term for an influencer', () => {
  const parsed = parseAssignmentInput({ mode: 'influencer', programVersionId: 'v1', partnershipCapUsd: 2500, commissionTermDays: 365, allowedSources: ['subscription'] });
  assert.equal(parsed.partnershipCapMicroUsd, 2500 * MICRO);
  assert.equal(parsed.commissionTermDays, 365);
  assert.deepEqual(parsed.allowedSources, ['subscription']);
});

test('computeCommission stays consistent with decideEarning on a plain earning', () => {
  const result = decideEarning({ ...base, attribution: attribution({ commissionBps: 1234 }) });
  assert.equal(result.commissionMicroUsd, computeCommission({ commissionableBaseMicroUsd: 20 * MICRO, commissionBps: 1234 }));
});
