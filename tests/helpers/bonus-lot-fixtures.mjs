import assert from 'node:assert/strict';
import { ManualBillingProvider } from '../../server/commercial/manual-billing-provider.mjs';
import { confirmTransaction } from '../../server/commercial/payment-service.mjs';

// Shared fixtures for the subscription-bonus LOT accounting tests. They are written against ANY repository
// (memory or PostgreSQL) so the in-memory suite and the DATABASE_URL-gated PostgreSQL integration test drive
// the very same scenarios and the very same independent model.
//
// Purchases are created straight through repo.paymentTransactions with the checkout's pricing SNAPSHOT
// (metadata.pricing.walletBonusMicroUsd) instead of through the plan settings: the bonus is granted from that
// snapshot, and it keeps these fixtures from writing global commercial config into a shared test database.

export const M = (usd) => Math.round(usd * 1_000_000);

export function requireLotDomain(repo) {
  assert.ok(repo.subscriptionBonus && typeof repo.subscriptionBonus.getByTransactionId === 'function',
    'repo.subscriptionBonus is missing - subscription-bonus lot accounting does not exist yet');
}

// A user whose promo balance is exactly what the test says. The signup promo is zeroed BEFORE any lot exists (an
// admin debit is outside lot accounting), so a scenario's numbers are explicit rather than depending on a default.
export async function freshUser(repo, name, { paidMicroUsd = 0, promoMicroUsd = 0, keepSignupPromo = false, track } = {}) {
  const user = await repo.users.create({ displayName: name });
  if (track) track(user);
  if (!keepSignupPromo) {
    const { promoBalanceMicroUsd } = await repo.wallet.getAccount(user.id);
    if (promoBalanceMicroUsd > 0) await repo.wallet.grant(user.id, { type: 'ADMIN_DEBIT', promoDeltaMicroUsd: -promoBalanceMicroUsd, sourceAction: 'test-zero-signup-promo' });
  }
  if (paidMicroUsd) await repo.wallet.grant(user.id, { type: 'TOP_UP', cashDeltaMicroUsd: paidMicroUsd, sourceAction: 'test-top-up' });
  if (promoMicroUsd) await repo.wallet.grant(user.id, { type: 'ADMIN_CREDIT', promoDeltaMicroUsd: promoMicroUsd, sourceAction: 'test-promo' });
  return user;
}

export async function balances(repo, userId) {
  const account = await repo.wallet.getAccount(userId);
  return { paid: account.paidBalanceMicroUsd, promo: account.promoBalanceMicroUsd };
}

// A CONFIRMED paid subscription purchase that carries `bonusMicroUsd` in its checkout snapshot.
// The default plan is 'plus', not 'pro': the shipped schema (031_subscriptions.sql / 026_commercial_config.sql) only accepts
// free|plus|personalized in user_subscriptions.plan_id and users.plan, so a confirmed 'pro' purchase cannot be activated on a
// real PostgreSQL yet - a pre-existing gap, unrelated to bonus lots, that the in-memory repo (no CHECK constraints) cannot show.
export async function buyBonus(repo, userId, bonusMicroUsd, { planId = 'plus', amountMicroUsd = 4_990_000, confirm = true } = {}) {
  const transaction = await repo.paymentTransactions.create({
    userId, type: 'subscription', provider: 'manual', amountMicroUsd, currency: 'USD', productId: planId,
    metadata: {
      planId, priceAmountUsd: amountMicroUsd / 1_000_000, billingInterval: 'month',
      pricing: { originalAmountMicroUsd: amountMicroUsd, discountAmountMicroUsd: 0, finalAmountMicroUsd: amountMicroUsd, walletBonusMicroUsd: bonusMicroUsd, discount: null }
    }
  });
  if (confirm) await confirmTransaction(repo, transaction.id);
  return transaction.id;
}

// Simulates a crash between the status flip and the bonus grant: confirmed, bonus owed, nothing granted.
export async function buyBonusWithoutGrant(repo, userId, bonusMicroUsd, options) {
  const txId = await buyBonus(repo, userId, bonusMicroUsd, { ...options, confirm: false });
  await repo.paymentTransactions.setStatus(txId, 'confirmed', { confirmedAt: new Date().toISOString() });
  return txId;
}

// The REAL AI path: reserve, then settle from the (server-computed) retail charge. Nothing about the bonus is passed in.
export async function reserveAi(repo, userId, retailChargeMicroUsd) {
  const reserved = await repo.wallet.reserve(userId, { estimatedRetailMicroUsd: retailChargeMicroUsd, provider: 'openai', model: 'gpt-test', feature: 'aiChat' });
  assert.equal(reserved.ok, true, 'the reservation must succeed (' + JSON.stringify(reserved) + ')');
  return reserved.reservation.id;
}
export function settleAi(repo, reservationId, retailChargeMicroUsd, extra = {}) {
  return repo.wallet.settle(reservationId, {
    providerCostMicroUsd: Math.round(retailChargeMicroUsd / 2), retailChargeMicroUsd, markupPercent: 100, retailMultiplier: 2, tokenDiscountPercent: 0,
    provider: 'openai', model: 'gpt-test', feature: 'aiChat', idempotencyKey: 'ai-settle:' + reservationId, ...extra
  });
}
export async function spendAi(repo, userId, retailChargeMicroUsd) {
  const reservationId = await reserveAi(repo, userId, retailChargeMicroUsd);
  const settled = await settleAi(repo, reservationId, retailChargeMicroUsd);
  assert.equal(settled.ok, true);
  return { reservationId, settled };
}

export async function refundPurchase(repo, txId, adminUserId = null) {
  const request = await new ManualBillingProvider(repo).refund({ transactionId: txId });
  await confirmTransaction(repo, request.transactionId, { adminUserId });
  return request;
}

export async function lotFor(repo, txId) {
  requireLotDomain(repo);
  return repo.subscriptionBonus.getByTransactionId(txId);
}

export async function allocationsFor(repo, userId, lotId) {
  const settlements = (await repo.wallet.ledgerForUser(userId, { limit: 5000 })).filter((entry) => entry.type === 'AI_SETTLEMENT');
  const all = await repo.subscriptionBonus.allocationsForLedgerIds(settlements.map((entry) => entry.id));
  return lotId ? all.filter((allocation) => allocation.lotId === lotId) : all;
}

// The invariants that must hold after ANY interleaving of settlement, refund, repair and retries.
export async function assertLotInvariants(repo, userId, txId) {
  const lot = await lotFor(repo, txId);
  assert.ok(lot, 'a lot must exist for ' + txId);
  ['originalMicroUsd', 'consumedMicroUsd', 'reversedMicroUsd', 'remainingMicroUsd'].forEach((field) => {
    assert.ok(Number.isSafeInteger(lot[field]) && lot[field] >= 0, field + ' must be a non-negative integer of microUSD, got ' + lot[field]);
  });
  assert.ok(lot.originalMicroUsd > 0);
  assert.equal(lot.consumedMicroUsd + lot.reversedMicroUsd + lot.remainingMicroUsd, lot.originalMicroUsd, 'original = consumed + reversed + remaining');

  const allocations = await allocationsFor(repo, userId, lot.id);
  allocations.forEach((allocation) => assert.ok(Number.isSafeInteger(allocation.amountMicroUsd) && allocation.amountMicroUsd > 0, 'every allocation is a positive integer'));
  assert.equal(allocations.reduce((sum, allocation) => sum + allocation.amountMicroUsd, 0), lot.consumedMicroUsd, 'consumed equals the sum of the immutable allocations');

  const [grant] = await repo.wallet.ledgerEntriesByIdempotencyKeys(['subscription-bonus:' + txId]);
  assert.ok(grant, 'the lot is linked to a SUBSCRIPTION_BONUS ledger grant');
  assert.equal(grant.id, lot.grantLedgerId);
  assert.equal(grant.promoDeltaMicroUsd, lot.originalMicroUsd);

  const [reversal] = await repo.wallet.ledgerEntriesByIdempotencyKeys(['subscription-bonus-reversal:' + txId]);
  if (lot.status === 'reversed') {
    assert.equal(lot.remainingMicroUsd, 0, 'a reversed lot has nothing left');
    assert.ok(reversal, 'a reversed lot has its reversal ledger entry - also when nothing was left to reverse');
    assert.equal(reversal.id, lot.reversalLedgerId);
    assert.equal(reversal.promoDeltaMicroUsd, 0 - lot.reversedMicroUsd, 'the ledger reverses exactly what the lot says was reversed');
    assert.equal(reversal.cashDeltaMicroUsd, 0, 'a bonus reversal never touches the paid balance');
  } else {
    assert.equal(lot.status, 'active');
    assert.equal(lot.reversedMicroUsd, 0);
    assert.equal(reversal, undefined, 'an active lot has no reversal entry');
  }
  return lot;
}

// ---- an independent model of the accounting, for differential testing -----------------------------------------
export function lcg(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

// Drives a random but reproducible sequence of purchases, AI spends and refunds through the REAL repository and,
// step by step, compares every balance and every lot with a plain-arithmetic model of the documented rules:
//   AI charge -> promo first (aggregate promo, as before); inside promo the ACTIVE lots first, FIFO (grant time, then
//   insertion order); then generic promo; the remainder is paid. Refund -> reverse only the lot's unspent remainder.
export async function runModelScenario(repo, { seed, steps = 16, track, namePrefix = '' }) {
  const rand = lcg(seed);
  const int = (low, high) => low + Math.floor(rand() * (high - low + 1));
  const genericMicroUsd = int(0, 4) * 500_000 + int(0, 2) * 7;
  const model = { generic: genericMicroUsd, paid: 60_000_000, lots: [] };
  const user = await freshUser(repo, namePrefix + 'Model ' + seed, { paidMicroUsd: model.paid, promoMicroUsd: model.generic, track });
  const lotRemaining = (lot) => (lot.refunded ? 0 : lot.original - lot.consumed);
  const promoOf = () => model.generic + model.lots.reduce((sum, lot) => sum + lotRemaining(lot), 0);

  async function compare(label) {
    const actual = await balances(repo, user.id);
    assert.equal(actual.promo, promoOf(), label + ': promo balance');
    assert.equal(actual.paid, model.paid, label + ': paid balance');
    assert.ok(actual.promo >= 0, label + ': promo never negative');
    for (const lot of model.lots) {
      const stored = await assertLotInvariants(repo, user.id, lot.txId);
      assert.equal(stored.originalMicroUsd, lot.original, label + ': original');
      assert.equal(stored.consumedMicroUsd, lot.consumed, label + ': consumed');
      assert.equal(stored.reversedMicroUsd, lot.refunded ? lot.original - lot.consumed : 0, label + ': reversed');
      assert.equal(stored.status, lot.refunded ? 'reversed' : 'active', label + ': status');
    }
  }

  for (let step = 0; step < steps; step += 1) {
    const roll = rand();
    const refundable = model.lots.filter((lot) => !lot.refunded);
    if (roll < 0.3 || (!model.lots.length && roll < 0.7)) {
      const original = int(500_000, 6_000_000);
      const txId = await buyBonus(repo, user.id, original);
      model.lots.push({ txId, original, consumed: 0, refunded: false });
      await compare('step ' + step + ' buy');
    } else if (roll < 0.85 || !refundable.length) {
      const charge = int(1, 3_500_000);
      await spendAi(repo, user.id, charge);
      const promoSpend = Math.max(0, Math.min(promoOf(), charge));
      let lotSpend = Math.min(promoSpend, model.lots.reduce((sum, lot) => sum + lotRemaining(lot), 0));
      const fromLots = lotSpend;
      for (const lot of model.lots) {
        const take = Math.min(lotSpend, lotRemaining(lot));
        lot.consumed += take;
        lotSpend -= take;
      }
      model.generic -= promoSpend - fromLots;
      model.paid -= charge - promoSpend;
      await compare('step ' + step + ' spend ' + charge);
    } else {
      const lot = refundable[int(0, refundable.length - 1)];
      await refundPurchase(repo, lot.txId);
      lot.refunded = true;
      await compare('step ' + step + ' refund');
    }
  }
  return { user, model };
}
