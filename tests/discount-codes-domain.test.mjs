import assert from 'node:assert/strict';
import test from 'node:test';

// Pure domain logic for subscription discount codes - no repo, no HTTP. The module is loaded
// lazily inside each test so that, until server/commercial/discount-codes.mjs exists, every test
// fails on its own with a clear reason instead of the whole file dying at import time.
//
// Contract pinned here (Phase 2 of the approved plan):
//   normalizeDiscountCode(raw)                                -> 'ABC123' | null
//   computeDiscount({ originalAmountMicroUsd, discountType, discountValue })
//                                                             -> { discountAmountMicroUsd, finalAmountMicroUsd }
//   deriveCodeStatus(code, stats, now)                        -> 'inactive'|'expired'|'scheduled'|'exhausted'|'active'
// discountValue is the STORED form: basis points for 'percent' (1500 = 15%), integer micro-USD for 'fixed'.
const load = () => import('../server/commercial/discount-codes.mjs');

function assertAmounts(result, discount, final) {
  assert.equal(result.discountAmountMicroUsd, discount, 'discountAmountMicroUsd');
  assert.equal(result.finalAmountMicroUsd, final, 'finalAmountMicroUsd');
  assert.ok(Number.isInteger(result.discountAmountMicroUsd) && Number.isInteger(result.finalAmountMicroUsd), 'money must stay integer micro-USD');
}

test('normalizeDiscountCode trims and upper-cases ASCII codes, so every spelling of one code collapses to one canonical string', async () => {
  const { normalizeDiscountCode } = await load();
  assert.equal(normalizeDiscountCode('spring30'), 'SPRING30');
  assert.equal(normalizeDiscountCode('  Spring30\n'), 'SPRING30');
  assert.equal(normalizeDiscountCode('a-b_c-1'), 'A-B_C-1');
  assert.equal(normalizeDiscountCode('abc'), 'ABC', 'minimum length is 3');
  assert.equal(normalizeDiscountCode('x'.repeat(32)), 'X'.repeat(32), 'maximum length is 32');
  assert.equal(normalizeDiscountCode('Spring30'), normalizeDiscountCode(' SPRING30 '));
});

test('normalizeDiscountCode rejects anything outside [A-Z0-9_-]{3,32}, including look-alike Unicode that would case-fold INTO ASCII', async () => {
  const { normalizeDiscountCode } = await load();
  // 'ſ'.toUpperCase() === 'S' and 'ı'.toUpperCase() === 'I' in JavaScript, and NFKC folds full-width
  // Latin to ASCII - so non-ASCII must be rejected BEFORE any case/Unicode folding, otherwise two
  // visually different strings could collide on (or slip past) the unique-code guarantee.
  const bad = [
    '', '   ', 'ab', 'x'.repeat(33), 'SPRING 30', 'SPRING.30', 'SPRING/30', 'SPRING30!',
    'ſpring30', 'lıfe', 'ＳＰＲＩＮＧ', 'کد۱۲۳', 'PROMO🎉',
    null, undefined, 42, {}, ['SPRING30']
  ];
  for (const value of bad) assert.equal(normalizeDiscountCode(value), null, 'must reject ' + JSON.stringify(value));
});

test('computeDiscount percent codes use integer basis points and exact integer math', async () => {
  const { computeDiscount } = await load();
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 14_990_000, discountType: 'percent', discountValue: 1500 }), 2_248_500, 12_741_500);
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 4_990_000, discountType: 'percent', discountValue: 1500 }), 748_500, 4_241_500);
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 14_990_000, discountType: 'percent', discountValue: 1250 }), 1_873_750, 13_116_250);
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 14_990_000, discountType: 'percent', discountValue: 1 }), 1_499, 14_988_501);
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 14_990_000, discountType: 'percent', discountValue: 10000 }), 14_990_000, 0);
});

test('computeDiscount rounds half-up deterministically', async () => {
  const { computeDiscount } = await load();
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 3, discountType: 'percent', discountValue: 5000 }), 2, 1);            // 1.5 -> 2
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 1, discountType: 'percent', discountValue: 5000 }), 1, 0);            // 0.5 -> 1
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 1, discountType: 'percent', discountValue: 4999 }), 0, 1);            // 0.4999 -> 0
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 4_999_999, discountType: 'percent', discountValue: 3333 }), 1_666_500, 3_333_499); // 1666499.6667 -> 1666500
});

test('computeDiscount never uses float arithmetic - an input where naive Math.round(a*b/10000) is off by one micro-USD', async () => {
  const { computeDiscount } = await load();
  // 3_518_061_459_098 * 9551 exceeds 2^53, so float math gives 3_360_100_499_585 here; the exact
  // integer answer is ...584. (Found by search and cross-checked with BigInt - see the plan's arithmetic table.)
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 3_518_061_459_098, discountType: 'percent', discountValue: 9551 }), 3_360_100_499_584, 157_960_959_514);
});

test('computeDiscount fixed codes subtract integer micro-USD and clamp to the original price', async () => {
  const { computeDiscount } = await load();
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 14_990_000, discountType: 'fixed', discountValue: 5_000_000 }), 5_000_000, 9_990_000);
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 14_990_000, discountType: 'fixed', discountValue: 20_000_000 }), 14_990_000, 0);
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 14_990_000, discountType: 'fixed', discountValue: 14_990_000 }), 14_990_000, 0);
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 14_990_000, discountType: 'fixed', discountValue: 14_989_999 }), 14_989_999, 1);
  assertAmounts(computeDiscount({ originalAmountMicroUsd: 0, discountType: 'fixed', discountValue: 1_000_000 }), 0, 0);
});

test('computeDiscount invariants hold across a deterministic sweep: discount + final == original, 0 <= discount <= original, all integers', async () => {
  const { computeDiscount } = await load();
  let seed = 123456789;
  const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
  for (let i = 0; i < 600; i += 1) {
    const original = next() % 100_000_000;
    const percent = i % 2 === 0;
    const value = percent ? 1 + (next() % 10000) : 1 + (next() % 150_000_000);
    const result = computeDiscount({ originalAmountMicroUsd: original, discountType: percent ? 'percent' : 'fixed', discountValue: value });
    assert.ok(Number.isInteger(result.discountAmountMicroUsd) && Number.isInteger(result.finalAmountMicroUsd), 'integers for ' + original + '/' + value);
    assert.equal(result.discountAmountMicroUsd + result.finalAmountMicroUsd, original, 'sum for ' + original + '/' + value);
    assert.ok(result.discountAmountMicroUsd >= 0 && result.discountAmountMicroUsd <= original, 'range for ' + original + '/' + value);
  }
});

test('computeDiscount refuses non-integer or negative money and unknown discount types instead of guessing', async () => {
  const { computeDiscount } = await load();
  const ok = { originalAmountMicroUsd: 1_000_000, discountType: 'percent', discountValue: 1000 };
  assert.throws(() => computeDiscount({ ...ok, originalAmountMicroUsd: 1.5 }));
  assert.throws(() => computeDiscount({ ...ok, originalAmountMicroUsd: -1 }));
  assert.throws(() => computeDiscount({ ...ok, originalAmountMicroUsd: Number.NaN }));
  assert.throws(() => computeDiscount({ ...ok, discountType: 'bogus' }));
  assert.throws(() => computeDiscount({ ...ok, discountValue: 1.5 }));
  assert.throws(() => computeDiscount({ ...ok, discountValue: -1 }));
});

test('deriveCodeStatus reports inactive / expired / scheduled / exhausted / active with an inclusive start and exclusive end', async () => {
  const { deriveCodeStatus } = await load();
  const now = new Date('2030-06-01T12:00:00.000Z');
  const base = { active: true, startsAt: null, expiresAt: null, maxRedemptions: null };
  const none = { confirmed: 0, pendingReservations: 0 };
  assert.equal(deriveCodeStatus(base, none, now), 'active');
  assert.equal(deriveCodeStatus({ ...base, active: false }, none, now), 'inactive');
  assert.equal(deriveCodeStatus({ ...base, startsAt: '2030-06-02T00:00:00.000Z' }, none, now), 'scheduled');
  assert.equal(deriveCodeStatus({ ...base, expiresAt: '2030-05-31T00:00:00.000Z' }, none, now), 'expired');
  // boundaries: a window opens AT startsAt and closes AT expiresAt
  assert.equal(deriveCodeStatus({ ...base, startsAt: '2030-06-01T12:00:00.000Z' }, none, now), 'active');
  assert.equal(deriveCodeStatus({ ...base, expiresAt: '2030-06-01T12:00:00.000Z' }, none, now), 'expired');
  assert.equal(deriveCodeStatus({ ...base, expiresAt: '2030-06-01T12:00:00.001Z' }, none, now), 'active');
});

test('deriveCodeStatus counts confirmed AND live pending reservations against capacity, and unlimited codes never exhaust', async () => {
  const { deriveCodeStatus } = await load();
  const now = new Date('2030-06-01T12:00:00.000Z');
  const capped = { active: true, startsAt: null, expiresAt: null, maxRedemptions: 2 };
  assert.equal(deriveCodeStatus(capped, { confirmed: 1, pendingReservations: 0 }, now), 'active');
  assert.equal(deriveCodeStatus(capped, { confirmed: 1, pendingReservations: 1 }, now), 'exhausted');
  assert.equal(deriveCodeStatus(capped, { confirmed: 2, pendingReservations: 0 }, now), 'exhausted');
  assert.equal(deriveCodeStatus({ ...capped, maxRedemptions: null }, { confirmed: 5_000_000, pendingReservations: 9 }, now), 'active');
});

test('deriveCodeStatus precedence is inactive > expired > scheduled > exhausted > active', async () => {
  const { deriveCodeStatus } = await load();
  const now = new Date('2030-06-01T12:00:00.000Z');
  const full = { confirmed: 2, pendingReservations: 0 };
  assert.equal(deriveCodeStatus({ active: false, startsAt: null, expiresAt: '2030-01-01T00:00:00.000Z', maxRedemptions: 2 }, full, now), 'inactive');
  assert.equal(deriveCodeStatus({ active: true, startsAt: null, expiresAt: '2030-01-01T00:00:00.000Z', maxRedemptions: 2 }, full, now), 'expired');
  assert.equal(deriveCodeStatus({ active: true, startsAt: '2031-01-01T00:00:00.000Z', expiresAt: null, maxRedemptions: 2 }, full, now), 'scheduled');
});
