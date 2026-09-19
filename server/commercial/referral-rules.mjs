// Pure domain logic for the Referral & Affiliate subsystem - no repo, no HTTP, no clock of its own
// (the caller always passes `now`). Mirrors the established "one rule set, two repositories" shape
// of discount-codes.mjs / subscription-bonus-lots.mjs: repo.pg.mjs and repo.memory.mjs both import
// this module so the numbers can never drift between the two backends, only HOW they lock/persist
// differs.
//
// Units (never floats, per instruction): BPS integers 0-10000 for rates/percentages, integer
// micro-USD for every money value. Every division that produces money uses BigInt and floors
// (never rounds up - an admin-set rate must never accidentally overpay a referrer).
import { ApiError } from '../community/errors.mjs';

export const MICRO = 1000000;
export const BPS_MAX = 10000;

export const PROGRAM_KINDS = ['standard', 'influencer'];
export const PROGRAM_STATUSES = ['draft', 'active', 'paused', 'archived'];
export const VERSION_STATUSES = ['draft', 'published', 'superseded', 'archived'];
export const ASSIGNMENT_MODES = ['disabled', 'standard', 'influencer'];
export const ASSIGNMENT_STATUSES = ['active', 'superseded', 'revoked'];

// Never wallet_topup - a qualifying source is real, confirmed platform revenue (spec: "wallet
// top-ups must never earn commission"). 'ai_margin' is additive-only: it produces zero commission
// unless a PUBLISHED program version explicitly lists it, and its own base is never the top-up
// amount, only settled gross margin - see computeAiMarginBase() below.
export const EARNING_SOURCES = ['subscription', 'storage_purchase', 'ai_margin'];
export const DEFAULT_ELIGIBLE_SOURCES = ['subscription'];

export const PAYOUT_ASSET_POLICIES = ['bep20_usdt'];

// The lot's own life stages - which bucket columns can move. 'pending'/'available_cash' are never
// stored (see deriveLotStatus below): they are derived from `maturesAt` vs `now` because a lot's
// row never has to be rewritten just because time passed.
export const LOT_LIFECYCLE_BUCKETS = ['aiConvertedMicroUsd', 'payoutReservedMicroUsd', 'paidMicroUsd', 'reversedMicroUsd'];

// The seven states the spec names for a referral earning's OVERALL reported status - this is a
// DERIVED view (deriveLotStatus), never a stored column, so there is exactly one source of truth
// for a lot's numbers (its bucket columns) and one place that turns them into a status word.
export const EARNING_STATUSES = ['pending', 'available_cash', 'ai_converted', 'payout_reserved', 'paid', 'reversed', 'debt'];

export const PAYOUT_STATES = ['requested', 'under_review', 'approved', 'submitted', 'confirmed', 'paid'];
export const PAYOUT_TERMINAL_STATES = ['rejected', 'cancelled', 'failed'];
export const PAYOUT_ALL_STATES = [...PAYOUT_STATES, ...PAYOUT_TERMINAL_STATES];

// Legal payout transitions - enforced in BOTH the pure validator here and a mirroring database
// trigger (070_referral_payouts.sql), same "defence in depth" precedent as discount-codes.mjs's
// assertStoredCodeValid() mirroring a CHECK constraint.
const PAYOUT_TRANSITIONS = {
  requested: ['under_review', 'cancelled', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['submitted', 'rejected'],
  submitted: ['confirmed', 'failed'],
  confirmed: ['paid', 'failed'],
  paid: [],
  rejected: [],
  cancelled: [],
  failed: []
};
export function assertLegalPayoutTransition(from, to) {
  const allowed = PAYOUT_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ApiError(409, 'PAYOUT_ILLEGAL_TRANSITION', null, { from, to });
  }
}

function isMicroUsd(value) { return Number.isSafeInteger(value) && value >= 0; }
function isBps(value) { return Number.isSafeInteger(value) && value >= 0 && value <= BPS_MAX; }

// Exact integer math, BigInt to avoid any float rounding on a large base * large bps product,
// always floored (an admin-set rate must never accidentally overpay a referrer) - the exact
// formula the instruction specifies: commission = floor(commissionableBase * commissionBps / 10000).
export function computeCommission({ commissionableBaseMicroUsd, commissionBps }) {
  if (!isMicroUsd(commissionableBaseMicroUsd)) throw new RangeError('commissionableBaseMicroUsd must be a non-negative integer');
  if (!isBps(commissionBps)) throw new RangeError('commissionBps must be an integer in [0, 10000]');
  const commission = (BigInt(commissionableBaseMicroUsd) * BigInt(commissionBps)) / BigInt(BPS_MAX);
  return Number(commission);
}

// commissionableBase = final amount actually paid - taxes - refunds/credits - explicitly excluded
// fees/items (instruction's exact formula). `taxMicroUsd`/`excludedMicroUsd` default to 0 (this
// codebase has no per-payment tax/fee column yet - see payment_transactions' own column list), so
// this reduces to `finalAmountMicroUsd` unchanged until one is ever wired in, never invented here.
export function computeCommissionableBase({ finalAmountMicroUsd, taxMicroUsd = 0, refundedMicroUsd = 0, excludedMicroUsd = 0 }) {
  const base = (Number(finalAmountMicroUsd) || 0) - (Number(taxMicroUsd) || 0) - (Number(refundedMicroUsd) || 0) - (Number(excludedMicroUsd) || 0);
  return Math.max(0, Math.trunc(base));
}

// Contribution-margin guard (instruction: "net revenue - payment fee - service/AI cost - referral
// liability must remain above the configured minimum margin"). `paymentFeeBps`/`serviceCostBps` are
// admin-set ESTIMATES snapshotted on the program version (no real per-payment fee/cost column
// exists in payment_transactions today - see ARCHITECTURE.md 7.x for the honest scope note), so
// this is a conservative estimate-based guard, not a query against real per-payment costs.
// Returns the (possibly reduced) commission plus which outcome applied - never throws; a guard
// that fully exhausts the margin simply clamps the commission to 0 (outcome 'skipped:margin_guard'),
// it never blocks the underlying payment or the referral relationship itself.
export function applyMarginGuard({ commissionMicroUsd, netRevenueMicroUsd, paymentFeeBps = 0, serviceCostBps = 0, minMarginMicroUsd = 0, minMarginBps = 0 }) {
  if (!isMicroUsd(commissionMicroUsd)) throw new RangeError('commissionMicroUsd must be a non-negative integer');
  const revenue = Math.max(0, Number(netRevenueMicroUsd) || 0);
  const paymentFee = Math.trunc((revenue * (Number(paymentFeeBps) || 0)) / BPS_MAX);
  const serviceCost = Math.trunc((revenue * (Number(serviceCostBps) || 0)) / BPS_MAX);
  const minMargin = Math.max(Number(minMarginMicroUsd) || 0, Math.trunc((revenue * (Number(minMarginBps) || 0)) / BPS_MAX));
  // Room for referral liability = everything left over after fees/costs/the required minimum margin.
  const roomForCommissionMicroUsd = Math.max(0, revenue - paymentFee - serviceCost - minMargin);
  const grantedMicroUsd = Math.min(commissionMicroUsd, roomForCommissionMicroUsd);
  const outcome = grantedMicroUsd >= commissionMicroUsd ? 'earned' : (grantedMicroUsd > 0 ? 'clamped' : 'skipped:margin_guard');
  return { grantedMicroUsd, outcome, paymentFeeMicroUsd: paymentFee, serviceCostMicroUsd: serviceCost, minMarginMicroUsd: minMargin, roomForCommissionMicroUsd };
}

// A single named cap check: `usedMicroUsd` is what this scope (program budget / per-user /
// per-customer / campaign) has already accrued EXCLUDING this candidate amount (reversed lots
// already excluded by the caller's own aggregate query - reversal releases budget immediately,
// per the instruction: "Reserve campaign budget when a qualifying payment becomes pending").
// `capMicroUsd` of null/undefined means unlimited. Returns the amount this ONE cap allows.
function clampToCap(candidateMicroUsd, capMicroUsd, usedMicroUsd) {
  if (capMicroUsd == null) return candidateMicroUsd;
  const remaining = Math.max(0, Number(capMicroUsd) - (Number(usedMicroUsd) || 0));
  return Math.min(candidateMicroUsd, remaining);
}

// Applies every configured cap (program budget across ALL its versions, per-user, per-customer,
// campaign/partnership) in a fixed, deterministic order and reports which one(s) actually bound -
// never throws; an amount reduced to 0 by a cap is a valid, auditable 'skipped:cap' outcome exactly
// like the margin guard above, not a rejected payment.
export function applyCaps(candidateMicroUsd, caps) {
  let amount = Math.max(0, Number(candidateMicroUsd) || 0);
  const limitedBy = [];
  const order = ['programBudget', 'perUser', 'perCustomer', 'campaign'];
  for (const key of order) {
    const cap = caps && caps[key];
    if (!cap) continue;
    const next = clampToCap(amount, cap.capMicroUsd, cap.usedMicroUsd);
    if (next < amount) limitedBy.push(key);
    amount = next;
  }
  return { grantedMicroUsd: amount, limitedBy };
}

// One referred-customer cap (maxReferredCustomers): a boolean gate, checked BEFORE any money math,
// since a program can cap headcount independently of dollar caps.
export function customerCapReached(referredCustomerCount, maxReferredCustomers) {
  return maxReferredCustomers != null && Number(referredCustomerCount) >= Number(maxReferredCustomers);
}

// AI gross-margin commission base (instruction: "calculate commission only from settled actual AI
// gross margin, never from wallet top-up amount"). `cashShareRatio` in [0,1] scales the margin down
// to the CASH-funded portion of the settlement only - promo/bonus/referral-AI-credit-funded spend
// earns nothing (it was never real incoming revenue), matching the same "only real money" posture
// the subscription/storage sources already have. Floors to an integer micro-USD.
export function computeAiMarginBase({ retailChargeMicroUsd, providerCostMicroUsd, cashDeltaMicroUsd, totalDeltaMicroUsd }) {
  const retail = Math.max(0, Number(retailChargeMicroUsd) || 0);
  const cost = Math.max(0, Number(providerCostMicroUsd) || 0);
  const grossMargin = Math.max(0, retail - cost);
  const total = Math.max(0, Number(totalDeltaMicroUsd) || 0);
  const cash = Math.max(0, Number(cashDeltaMicroUsd) || 0);
  if (total <= 0) return 0;
  const cashShareMicro = Math.trunc((BigInt(grossMargin) * BigInt(Math.min(cash, total)) * BigInt(MICRO) / BigInt(total)).toString()) / MICRO;
  return Math.max(0, Math.trunc(cashShareMicro));
}

// ---------------------------------------------------------------------------------------------
// Lot status derivation (mirrors subscription-bonus.mjs's bonusFigures() precedent: numbers live
// in stored bucket columns, the status WORD is always computed from them, never a second stored
// truth). `hasOpenDebt` comes from a caller-side join against referral_debt_cases - reported here
// as 'debt' even though the underlying buckets still say ai_converted/paid, because the funds were
// clawed back into a recoverable liability, not actually reversed in place.
// ---------------------------------------------------------------------------------------------
export function lotRemainingMicroUsd(lot) {
  return Math.max(0, lot.originalMicroUsd - lot.aiConvertedMicroUsd - lot.payoutReservedMicroUsd - lot.paidMicroUsd - lot.reversedMicroUsd);
}
export function lotIsMatured(lot, now = Date.now()) {
  return !lot.maturesAt || new Date(lot.maturesAt).getTime() <= now;
}
export function deriveLotStatus(lot, { hasOpenDebt = false, now = Date.now() } = {}) {
  if (hasOpenDebt) return 'debt';
  const remaining = lotRemainingMicroUsd(lot);
  if (lot.reversedMicroUsd >= lot.originalMicroUsd && lot.originalMicroUsd > 0) return 'reversed';
  if (lot.paidMicroUsd > 0 && remaining === 0 && lot.reversedMicroUsd === 0) return 'paid';
  if (lot.payoutReservedMicroUsd > 0 && remaining === 0) return 'payout_reserved';
  if (lot.aiConvertedMicroUsd > 0 && remaining === 0) return 'ai_converted';
  if (remaining === 0) return 'reversed';
  return lotIsMatured(lot, now) ? 'available_cash' : 'pending';
}

// ---------------------------------------------------------------------------------------------
// FIFO lot allocation - the ONE deterministic, documented order this subsystem uses (instruction:
// "Implement FIFO or another explicitly documented deterministic allocation order"), oldest MATURED
// grant first (ties broken by insertion `seq`), mirroring subscription-bonus-lots.mjs's own
// allocateFifo() exactly but generalized to a caller-supplied "how much of this lot is still free"
// reader so the same function serves AI conversion (draws from `available` remaining) and payout
// reservation (also draws from `available` remaining, mutually exclusive with conversion since both
// consume the same remaining pool).
// ---------------------------------------------------------------------------------------------
export function allocateFifo(lots, amountMicroUsd) {
  if (!Number.isSafeInteger(amountMicroUsd) || amountMicroUsd < 0) throw new RangeError('allocateFifo needs a non-negative integer micro-USD amount');
  const allocations = [];
  let left = amountMicroUsd;
  for (const lot of lots) {
    if (left <= 0) break;
    const free = Math.max(0, Number(lot.availableMicroUsd) || 0);
    const take = Math.min(left, free);
    if (take > 0) {
      allocations.push({ lotId: lot.id, amountMicroUsd: take });
      left -= take;
    }
  }
  return { allocations, unallocatedMicroUsd: left };
}
export const sumAllocations = (allocations) => allocations.reduce((sum, allocation) => sum + allocation.amountMicroUsd, 0);

// Reversal math for a refund/chargeback/cancellation that reduces the ORIGINAL commissionable
// base (a partial refund) rather than voiding it entirely. Recomputes what the commission SHOULD
// be on the new (reduced) base at the SAME snapshotted bps, and returns the delta to claw back -
// cumulative and idempotent-safe: calling this again with a larger refundedMicroUsd on the same
// original numbers reproduces the same total, so the caller can always reverse "one more delta"
// rather than needing to track how much of a partial refund was already applied.
export function recomputeCommissionAfterRefund({ originalBaseMicroUsd, refundedMicroUsd, commissionBps }) {
  const newBase = Math.max(0, (Number(originalBaseMicroUsd) || 0) - (Number(refundedMicroUsd) || 0));
  return computeCommission({ commissionableBaseMicroUsd: newBase, commissionBps });
}

// ---------------------------------------------------------------------------------------------
// Validation: mirrors discount-codes.mjs's parseDiscountCodeInput()/assertStoredCodeValid() shape -
// admin-facing units (percent, USD) are converted to stored units (bps, micro-USD) at exactly one
// boundary, with the same values a database CHECK would refuse refused here too (defence in depth).
// ---------------------------------------------------------------------------------------------
function fieldError(field) { return new ApiError(400, 'VALIDATION_FAILED', null, { field }); }
function isPlainObject(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }

function decimalPlaces(value) {
  if (Number.isInteger(value)) return 0;
  const text = String(value);
  if (/e/i.test(text)) return 99;
  return text.split('.')[1].length;
}

function parseUsdToMicro(raw, field, { allowZero = false } = {}) {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || (!allowZero && raw <= 0)) throw fieldError(field);
  if (decimalPlaces(raw) > 6) throw fieldError(field);
  const micro = Math.round(raw * MICRO);
  if (!Number.isSafeInteger(micro) || micro < 0) throw fieldError(field);
  return micro;
}
function parsePercentToBps(raw, field, { allowZero = true, max = 100 } = {}) {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > max || (!allowZero && raw <= 0)) throw fieldError(field);
  if (decimalPlaces(raw) > 2) throw fieldError(field);
  const bps = Math.round(raw * 100);
  if (!Number.isSafeInteger(bps) || bps < 0) throw fieldError(field);
  return bps;
}
function parseOptionalInt(raw, field, { min = 0 } = {}) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < min) throw fieldError(field);
  return raw;
}
function parseOptionalUsdToMicro(raw, field) {
  if (raw === undefined || raw === null || raw === '') return null;
  return parseUsdToMicro(raw, field, { allowZero: true });
}
function parseDate(value, field) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw fieldError(field);
  return new Date(value).toISOString();
}
function parseSources(raw, field) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || !raw.length) throw fieldError(field);
  const sources = Array.from(new Set(raw));
  if (!sources.every((source) => EARNING_SOURCES.includes(source))) throw fieldError(field);
  return sources;
}

const has = (input, key) => Object.prototype.hasOwnProperty.call(input, key);

// A DRAFT version's full financial rule set. `partial` supports a draft PATCH (only present fields
// validated); a PUBLISHED/superseded/archived version is immutable - the caller (referral-programs.mjs)
// refuses to call this against anything but a draft row, enforced again by the database trigger.
export function parseProgramVersionInput(body, { partial = false, existing = null } = {}) {
  const input = isPlainObject(body) ? body : {};
  const out = {};
  const need = (key) => !partial || has(input, key);

  if (need('commissionBps')) out.commissionBps = (() => {
    const raw = input.commissionBps;
    if (!Number.isSafeInteger(raw) || raw < 0 || raw > BPS_MAX) throw fieldError('commissionBps');
    return raw;
  })();
  if (need('eligibleSources')) {
    const sources = parseSources(input.eligibleSources ?? DEFAULT_ELIGIBLE_SOURCES, 'eligibleSources');
    out.eligibleSources = sources || DEFAULT_ELIGIBLE_SOURCES;
  }
  if (need('eligiblePlans')) {
    const raw = input.eligiblePlans;
    if (raw !== null && raw !== undefined && !(Array.isArray(raw) && raw.every((v) => typeof v === 'string'))) throw fieldError('eligiblePlans');
    out.eligiblePlans = raw && raw.length ? raw : null; // null = every plan eligible
  }
  if (need('attributionWindowDays')) out.attributionWindowDays = (() => {
    const raw = input.attributionWindowDays;
    if (!Number.isSafeInteger(raw) || raw < 1 || raw > 365) throw fieldError('attributionWindowDays');
    return raw;
  })();
  if (need('holdDays')) out.holdDays = (() => {
    const raw = input.holdDays;
    if (!Number.isSafeInteger(raw) || raw < 0 || raw > 180) throw fieldError('holdDays');
    return raw;
  })();
  if (need('commissionTermDays')) out.commissionTermDays = parseOptionalInt(input.commissionTermDays, 'commissionTermDays', { min: 1 });
  if (need('cashOutMinimumUsd')) out.cashOutMinimumMicroUsd = parseUsdToMicro(input.cashOutMinimumUsd ?? 10, 'cashOutMinimumUsd', { allowZero: true });
  if (need('programBudgetCapUsd')) out.programBudgetCapMicroUsd = parseOptionalUsdToMicro(input.programBudgetCapUsd, 'programBudgetCapUsd');
  if (need('perUserCapUsd')) out.perUserCapMicroUsd = parseOptionalUsdToMicro(input.perUserCapUsd, 'perUserCapUsd');
  if (need('perCustomerCapUsd')) out.perCustomerCapMicroUsd = parseOptionalUsdToMicro(input.perCustomerCapUsd, 'perCustomerCapUsd');
  if (need('campaignCapUsd')) out.campaignCapMicroUsd = parseOptionalUsdToMicro(input.campaignCapUsd, 'campaignCapUsd');
  if (need('maxReferredCustomers')) out.maxReferredCustomers = parseOptionalInt(input.maxReferredCustomers, 'maxReferredCustomers', { min: 1 });
  if (need('minMarginUsd')) out.minMarginMicroUsd = parseUsdToMicro(input.minMarginUsd ?? 0, 'minMarginUsd', { allowZero: true });
  if (need('minMarginPercent')) out.minMarginBps = parsePercentToBps(input.minMarginPercent ?? 0, 'minMarginPercent', { allowZero: true });
  if (need('paymentFeePercent')) out.paymentFeeBps = parsePercentToBps(input.paymentFeePercent ?? 0, 'paymentFeePercent', { allowZero: true });
  if (need('serviceCostPercent')) out.serviceCostBps = parsePercentToBps(input.serviceCostPercent ?? 0, 'serviceCostPercent', { allowZero: true });
  if (need('payoutAssetPolicy')) {
    const raw = input.payoutAssetPolicy ?? 'bep20_usdt';
    if (!PAYOUT_ASSET_POLICIES.includes(raw)) throw fieldError('payoutAssetPolicy');
    out.payoutAssetPolicy = raw;
  }
  if (need('effectiveFrom')) out.effectiveFrom = parseDate(input.effectiveFrom, 'effectiveFrom') || new Date().toISOString();
  if (need('effectiveTo')) out.effectiveTo = parseDate(input.effectiveTo, 'effectiveTo');
  const effectiveFrom = 'effectiveFrom' in out ? out.effectiveFrom : (existing && existing.effectiveFrom);
  const effectiveTo = 'effectiveTo' in out ? out.effectiveTo : (existing && existing.effectiveTo);
  if (effectiveFrom && effectiveTo && Date.parse(effectiveTo) <= Date.parse(effectiveFrom)) throw fieldError('effectiveTo');
  return out;
}

// Admin-set negotiated override for one INFLUENCER assignment. Every field is optional (falls back
// to the assigned program version's own value) - only an explicit override narrows/replaces it.
export function parseAssignmentInput(body) {
  const input = isPlainObject(body) ? body : {};
  if (!ASSIGNMENT_MODES.includes(input.mode)) throw fieldError('mode');
  const out = { mode: input.mode };
  if (out.mode === 'influencer') {
    if (typeof input.programVersionId !== 'string' || !input.programVersionId) throw fieldError('programVersionId');
    out.programVersionId = input.programVersionId;
    if (has(input, 'rateBpsOverride') && input.rateBpsOverride !== null) {
      const raw = input.rateBpsOverride;
      if (!Number.isSafeInteger(raw) || raw < 0 || raw > BPS_MAX) throw fieldError('rateBpsOverride');
      out.rateBpsOverride = raw;
    } else out.rateBpsOverride = null;
  } else if (out.mode === 'standard') {
    if (has(input, 'programVersionId') && input.programVersionId) out.programVersionId = input.programVersionId;
    else out.programVersionId = null; // resolves to the currently published platform-default version at attribution time
  } else {
    out.programVersionId = null;
  }
  out.effectiveFrom = parseDate(input.effectiveFrom, 'effectiveFrom') || new Date().toISOString();
  out.effectiveTo = parseDate(input.effectiveTo, 'effectiveTo');
  if (out.effectiveTo && Date.parse(out.effectiveTo) <= Date.parse(out.effectiveFrom)) throw fieldError('effectiveTo');
  out.programBudgetCapMicroUsd = parseOptionalUsdToMicro(input.campaignCapUsd, 'campaignCapUsd');
  out.perCustomerCapMicroUsd = parseOptionalUsdToMicro(input.perCustomerCapUsd, 'perCustomerCapUsd');
  out.maxReferredCustomers = parseOptionalInt(input.maxReferredCustomers, 'maxReferredCustomers', { min: 1 });
  out.allowedSources = parseSources(input.allowedSources, 'allowedSources') || null; // null = inherit the program version's eligibleSources
  out.notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 2000) : null;
  return out;
}

// The effective referral terms for a user at attribution/earning time: DISABLED accounts earn
// nothing; an unassigned account resolves to implicit STANDARD only when the platform-default
// program has autoEnrollUnassigned and a published version (approved default posture); an assigned
// row always wins over the implicit fallback, including an explicit 'disabled' assignment.
export function resolveEffectiveMode({ assignment, defaultProgram }) {
  if (assignment && assignment.status === 'active') {
    const now = Date.now();
    const started = !assignment.effectiveFrom || Date.parse(assignment.effectiveFrom) <= now;
    const notEnded = !assignment.effectiveTo || Date.parse(assignment.effectiveTo) > now;
    if (started && notEnded) return assignment.mode; // 'disabled' | 'standard' | 'influencer'
  }
  if (defaultProgram && defaultProgram.autoEnrollUnassigned && defaultProgram.status === 'active' && defaultProgram.publishedVersion) {
    return 'standard';
  }
  return 'disabled';
}

// The rate an influencer assignment actually pays - its own override if set, otherwise the
// assigned program version's own commissionBps (never a second, hand-typed default).
export function resolveEffectiveCommissionBps({ mode, assignment, programVersion }) {
  if (mode === 'influencer' && assignment && assignment.rateBpsOverride != null) return assignment.rateBpsOverride;
  return programVersion ? programVersion.commissionBps : 0;
}

export function referralCodePattern() { return /^[A-Z2-9]{6,10}$/; }
// Excludes visually ambiguous characters (0/O, 1/I/L) so a spoken/handwritten/shared code is never
// misread - the same "share a code out loud" concern discount codes never had to solve (those are
// typed by the same person who saw them on screen).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateReferralCode(randomBytesFn) {
  const bytes = randomBytesFn(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}
export function normalizeReferralCode(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  return referralCodePattern().test(trimmed) ? trimmed : null;
}
