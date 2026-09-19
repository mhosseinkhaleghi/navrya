// Pure domain logic for subscription discount codes - no repo, no HTTP, no clock of its own. The repositories
// (repo.memory.mjs / repo.pg.mjs) call assertCodeAvailable()/assertStoredCodeValid() so memory and PostgreSQL
// enforce ONE set of rules; the admin routes and the checkout use the parsers/DTO shapers below.
//
// Stored units (never floats): a 'percent' code stores integer BASIS POINTS (1500 = 15%), a 'fixed' code stores
// integer MICRO-USD. Admin-facing units (percent / USD) exist only at the API boundary and are converted once,
// with an explicit decimal-places check, by parseDiscountCodeInput().
import { ApiError } from '../community/errors.mjs';

export const DISCOUNT_TYPES = ['percent', 'fixed'];
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
export function assertCodeAvailable({ code, stats, ownRow, now = Date.now() }) {
  if (!code || !code.active) throw new ApiError(404, 'DISCOUNT_CODE_INVALID');
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
}

// How many digits follow the decimal point (99 for exponent notation, which is refused rather than guessed).
export function decimalPlaces(value) {
  if (Number.isInteger(value)) return 0;
  const text = String(value);
  if (/e/i.test(text)) return 99; // exponent notation for a fractional value: refuse rather than guess
  return text.split('.')[1].length;
}

function fieldError(field) { return new ApiError(400, 'VALIDATION_FAILED', null, { field }); }

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

  if (partial) {
    if (has('code')) throw fieldError('code');
  } else {
    const code = normalizeDiscountCode(input.code);
    if (!code) throw fieldError('code');
    out.code = code;
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

  if (has('active')) {
    if (typeof input.active !== 'boolean') throw fieldError('active');
    out.active = input.active;
  } else if (!partial) {
    out.active = true;
  }
  return out;
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
    discountValue: toAdminDiscountValue(code), startsAt: code.startsAt, expiresAt: code.expiresAt, maxRedemptions: code.maxRedemptions,
    status: deriveCodeStatus(code, stats, now),
    stats: { confirmed: stats.confirmed, pendingReservations: stats.pendingReservations, remaining: stats.remaining },
    createdAt: code.createdAt, updatedAt: code.updatedAt
  };
}
