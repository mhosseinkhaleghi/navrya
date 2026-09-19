// Pure domain logic for subscription discount codes - no repo, no HTTP, no clock of its own. The repositories
// (repo.memory.mjs / repo.pg.mjs) call assertCodeAvailable()/assertStoredCodeValid() so memory and PostgreSQL
// enforce ONE set of rules; the admin routes and the checkout use the parsers/DTO shapers below.
//
// Stored units (never floats): a 'percent' code stores integer BASIS POINTS (1500 = 15%), a 'fixed' code stores
// integer MICRO-USD. Admin-facing units (percent / USD) exist only at the API boundary and are converted once,
// with an explicit decimal-places check, by parseDiscountCodeInput().
import { randomBytes } from 'node:crypto';
import { ApiError } from '../community/errors.mjs';
import { PAID_PLAN_NAMES } from './commercial-defaults.mjs';

export const DISCOUNT_TYPES = ['percent', 'fixed'];
// 'code': the customer types it. 'automatic': there is no code to type - the discount is advertised per customer (the plan
// cards) and applied at checkout by its id. The mode is fixed at creation, like the code string itself.
export const APPLICATION_MODES = ['code', 'automatic'];
const CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
const MAX_CAMPAIGN_NAME_LENGTH = 80;
const MICRO = 1000000;

// The pattern is applied to the RAW trimmed text BEFORE any case folding: 'ſ'.toUpperCase() === 'S',
// 'ı'.toUpperCase() === 'I' and NFKC folds full-width Latin into ASCII, so folding first would let a
// look-alike string collide with (or slip past) the unique-code guarantee.
export function normalizeDiscountCode(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!CODE_PATTERN.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

// An automatic discount has no customer-typed code, but every reservation and redemption row is keyed by a code string, so it
// owns an internal identifier that satisfies the same pattern and unique index: 'AUTO-' + 48 random bits. Nobody is ever
// shown it, and the checkout refuses to accept it as typed input.
export function generateAutomaticCode() {
  return 'AUTO-' + randomBytes(6).toString('hex').toUpperCase();
}

// planIds is the list of paid plans a discount applies to; an empty (or missing) list means EVERY paid plan.
export function codeAppliesToPlan(code, planId) {
  return !Array.isArray(code.planIds) || code.planIds.length === 0 || code.planIds.includes(planId);
}

function isValidPlanIds(planIds) {
  return Array.isArray(planIds) && planIds.every((id, index) => PAID_PLAN_NAMES.includes(id) && planIds.indexOf(id) === index);
}

// Exact integer math. Percent rounds half-up on BigInt (a float product of two large integers can be off by one
// micro-USD); fixed is clamped to the price so the final amount is never negative.
export function computeDiscount({ originalAmountMicroUsd, discountType, discountValue }) {
  if (!Number.isSafeInteger(originalAmountMicroUsd) || originalAmountMicroUsd < 0) throw new RangeError('originalAmountMicroUsd must be a non-negative integer');
  if (!Number.isSafeInteger(discountValue) || discountValue < 0) throw new RangeError('discountValue must be a non-negative integer');
  const original = BigInt(originalAmountMicroUsd);
  let discount;
  if (discountType === 'percent') discount = (original * BigInt(discountValue) + 5000n) / 10000n;
  else if (discountType === 'fixed') discount = BigInt(discountValue);
  else throw new TypeError('unknown discountType: ' + discountType);
  if (discount > original) discount = original;
  return { discountAmountMicroUsd: Number(discount), finalAmountMicroUsd: Number(original - discount) };
}

const toMs = (value) => (value instanceof Date ? value.getTime() : Date.parse(value));

// Precedence: inactive > expired > scheduled > exhausted > active. A window opens AT startsAt and closes AT
// expiresAt (inclusive start, exclusive end). Capacity in use = confirmed + live pending reservations.
export function deriveCodeStatus(code, stats, now = new Date()) {
  const at = toMs(now);
  if (!code.active) return 'inactive';
  if (code.expiresAt && toMs(code.expiresAt) <= at) return 'expired';
  if (code.startsAt && toMs(code.startsAt) > at) return 'scheduled';
  if (code.maxRedemptions != null && stats.confirmed + stats.pendingReservations >= code.maxRedemptions) return 'exhausted';
  return 'active';
}

// The ONE availability rule set, shared by the read-only quote check and the authoritative reservation. `ownRow`
// is this user's live-or-confirmed redemption of the code (if any); `stats` counts confirmed + live reservations.
// Unknown and deactivated codes are indistinguishable on purpose (no existence oracle).
export function assertCodeAvailable({ code, stats, ownRow, now = Date.now(), planId }) {
  if (!code || !code.active) throw new ApiError(404, 'DISCOUNT_CODE_INVALID');
  // A live code used on a plan outside its scope is refused with its own reason (the caller already knows the code).
  if (planId && !codeAppliesToPlan(code, planId)) throw new ApiError(409, 'DISCOUNT_CODE_PLAN_NOT_ELIGIBLE', null, { planIds: code.planIds });
  if (code.expiresAt && toMs(code.expiresAt) <= now) throw new ApiError(409, 'DISCOUNT_CODE_EXPIRED', null, { expiresAt: code.expiresAt });
  if (code.startsAt && toMs(code.startsAt) > now) throw new ApiError(409, 'DISCOUNT_CODE_NOT_STARTED', null, { startsAt: code.startsAt });
  if (ownRow) {
    if (ownRow.status === 'confirmed') throw new ApiError(409, 'DISCOUNT_CODE_ALREADY_USED');
    throw new ApiError(409, 'DISCOUNT_CODE_RESERVATION_PENDING', null, { transactionId: ownRow.transactionId || null, reservedUntil: ownRow.reservedUntil });
  }
  if (code.maxRedemptions != null && stats.confirmed + stats.pendingReservations >= code.maxRedemptions) throw new ApiError(409, 'DISCOUNT_CODE_EXHAUSTED');
}

// Defence in depth: the values a database CHECK would refuse are refused here too, in BOTH repositories.
export function assertStoredCodeValid(code) {
  const invalid = () => new ApiError(400, 'VALIDATION_FAILED');
  if (!DISCOUNT_TYPES.includes(code.discountType)) throw invalid();
  if (!Number.isSafeInteger(code.discountValue)) throw invalid();
  if (code.discountType === 'percent' && (code.discountValue < 1 || code.discountValue > 10000)) throw invalid();
  if (code.discountType === 'fixed' && code.discountValue < 1) throw invalid();
  if (code.maxRedemptions != null && (!Number.isSafeInteger(code.maxRedemptions) || code.maxRedemptions < 1)) throw invalid();
  if (code.startsAt && code.expiresAt && toMs(code.expiresAt) <= toMs(code.startsAt)) throw invalid();
  if (code.applicationMode !== undefined && !APPLICATION_MODES.includes(code.applicationMode)) throw invalid();
  if (code.planIds !== undefined && !isValidPlanIds(code.planIds)) throw invalid();
}

// How many digits follow the decimal point (99 for exponent notation, which is refused rather than guessed).
export function decimalPlaces(value) {
  if (Number.isInteger(value)) return 0;
  const text = String(value);
  if (/e/i.test(text)) return 99; // exponent notation for a fractional value: refuse rather than guess
  return text.split('.')[1].length;
}

function fieldError(field) { return new ApiError(400, 'VALIDATION_FAILED', null, { field }); }

// Missing / null / [] = every paid plan. Anything else must be an array of real PAID plan ids (duplicates collapse).
function parsePlanIds(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw fieldError('planIds');
  const planIds = [];
  for (const id of value) {
    if (typeof id !== 'string' || !PAID_PLAN_NAMES.includes(id)) throw fieldError('planIds');
    if (!planIds.includes(id)) planIds.push(id);
  }
  return planIds;
}

function parseDate(value, field) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw fieldError(field);
  return new Date(value).toISOString();
}

// Admin-facing units -> stored units. `partial` is a PATCH: only present fields are validated/returned; the code
// string itself is immutable. `existing` supplies the current type/window so a partial edit is validated against
// the record it will be merged into.
export function parseDiscountCodeInput(body, { partial = false, existing = null } = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const out = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);

  // The mode decides whether a customer-typed code exists at all, so it is settled first. Both it and the code string are
  // immutable after creation.
  if (partial) {
    if (has('applicationMode')) throw fieldError('applicationMode');
    if (has('code')) throw fieldError('code');
  } else {
    const mode = has('applicationMode') && input.applicationMode !== undefined && input.applicationMode !== null ? input.applicationMode : 'code';
    if (!APPLICATION_MODES.includes(mode)) throw fieldError('applicationMode');
    out.applicationMode = mode;
    if (mode === 'automatic') {
      if (has('code') && input.code !== undefined && input.code !== null && input.code !== '') throw fieldError('code');
      out.code = generateAutomaticCode();
    } else {
      const code = normalizeDiscountCode(input.code);
      if (!code) throw fieldError('code');
      out.code = code;
    }
  }

  if (!partial || has('campaignName')) {
    const name = typeof input.campaignName === 'string' ? input.campaignName.trim() : '';
    if (!name || name.length > MAX_CAMPAIGN_NAME_LENGTH) throw fieldError('campaignName');
    out.campaignName = name;
  }

  if (!partial || has('discountType') || has('discountValue')) {
    const type = has('discountType') ? input.discountType : (existing && existing.discountType);
    if (!DISCOUNT_TYPES.includes(type)) throw fieldError('discountType');
    // Changing the type without restating the value would silently reinterpret the old number in a new unit.
    if (partial && type !== (existing && existing.discountType) && !has('discountValue')) throw fieldError('discountValue');
    if (partial && !has('discountValue')) {
      out.discountType = type;
    } else {
      const raw = input.discountValue;
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) throw fieldError('discountValue');
      if (type === 'percent') {
        if (raw > 100 || decimalPlaces(raw) > 2) throw fieldError('discountValue');
        out.discountValue = Math.round(raw * 100);
      } else {
        if (decimalPlaces(raw) > 6) throw fieldError('discountValue');
        out.discountValue = Math.round(raw * MICRO);
        if (!Number.isSafeInteger(out.discountValue) || out.discountValue < 1) throw fieldError('discountValue');
      }
      out.discountType = type;
    }
  }

  if (!partial || has('maxRedemptions')) {
    const raw = input.maxRedemptions;
    if (raw === undefined || raw === null) out.maxRedemptions = null;
    else if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 1) throw fieldError('maxRedemptions');
    else out.maxRedemptions = raw;
  }

  if (!partial || has('startsAt')) out.startsAt = parseDate(input.startsAt, 'startsAt');
  if (!partial || has('expiresAt')) out.expiresAt = parseDate(input.expiresAt, 'expiresAt');
  const startsAt = 'startsAt' in out ? out.startsAt : (existing && existing.startsAt);
  const expiresAt = 'expiresAt' in out ? out.expiresAt : (existing && existing.expiresAt);
  if (startsAt && expiresAt && toMs(expiresAt) <= toMs(startsAt)) throw fieldError('expiresAt');

  if (!partial || has('planIds')) out.planIds = parsePlanIds(input.planIds);

  if (has('active')) {
    if (typeof input.active !== 'boolean') throw fieldError('active');
    out.active = input.active;
  } else if (!partial) {
    out.active = true;
  }
  return out;
}

// The internal identifier of an AUTOMATIC discount (its 'code') is a server implementation detail, never something a
// customer typed or should see - scrubbed from every customer-facing pricing snapshot. Admin (which manages the discount by
// this same codeId) and the server's own stored transaction metadata keep the real value in full.
export function customerFacingPricing(pricing) {
  if (!pricing || !pricing.discount || !pricing.discount.automatic) return pricing;
  return { ...pricing, discount: { ...pricing.discount, code: null } };
}

export function toAdminDiscountValue(code) {
  return code.discountType === 'percent' ? code.discountValue / 100 : code.discountValue / MICRO;
}

// The lean, customer-facing shape for the checkout urgency poll (GET /api/sync/subscriptions/discount-codes/:id/status)
// - status/live capacity only, never the admin units, the code text or timestamps a customer has no reason to see.
export function toCodeStatusDto(code, stats, now = new Date()) {
  const status = deriveCodeStatus(code, stats, now);
  return { status, active: status === 'active', expiresAt: code.expiresAt, startsAt: code.startsAt, maxRedemptions: code.maxRedemptions, remaining: stats.remaining };
}

// The code shape the admin API returns: admin units for the value, derived status, live stats.
export function toCodeDto(code, stats, now = new Date()) {
  return {
    id: code.id, code: code.code, campaignName: code.campaignName, active: code.active, discountType: code.discountType,
    applicationMode: code.applicationMode || 'code', planIds: Array.isArray(code.planIds) ? code.planIds : [],
    discountValue: toAdminDiscountValue(code), startsAt: code.startsAt, expiresAt: code.expiresAt, maxRedemptions: code.maxRedemptions,
    status: deriveCodeStatus(code, stats, now),
    stats: { confirmed: stats.confirmed, pendingReservations: stats.pendingReservations, remaining: stats.remaining },
    createdAt: code.createdAt, updatedAt: code.updatedAt
  };
}
