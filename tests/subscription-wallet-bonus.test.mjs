import assert from 'node:assert/strict';
import test from 'node:test';
import { ManualBillingProvider } from '../server/commercial/manual-billing-provider.mjs';
import { confirmTransaction, failTransaction } from '../server/commercial/payment-service.mjs';
import { resolveUserEntitlements } from '../server/commercial/entitlement-resolver.mjs';
import { PLAN_DEFAULTS } from '../server/commercial/commercial-defaults.mjs';
import {
  newRepo, makeUser, makeAdmin, makeCode, staleReauthHeaders, setPlanBonus, ledgerEntries, withApp, assertApiError,
  PRO_MICRO
} from './helpers/discount-fixtures.mjs';

// Admin-configurable wallet bonus (`walletBonusUsd`) for every paid plan purchase.
//
// Approved decisions under test:
//   - The bonus is credited to the PROMO wallet balance, only after a CONFIRMED payment, exactly once,
//     from the transaction snapshot (never today's plan setting).
//   - A zero-price purchase (confirmed final payable amount == 0) receives NO bonus.
//   - Refund reverses entitlement AND bonus through an idempotent SUBSCRIPTION_BONUS_REVERSAL entry.
//   - `bonusStatus: 'missing'` (confirmed, bonus owed, no ledger grant - e.g. a crash between the status
//     flip and the grant) has an admin-visible, idempotent, step-up-protected repair path:
//       POST /api/admin/commercial/transactions/:id/repair-bonus
//         200 { repaired, alreadyGranted, bonusStatus, transactionId }
//         409 BONUS_REPAIR_NOT_APPLICABLE { reason: NOT_SUBSCRIPTION|NOT_CONFIRMED|NO_BONUS|REFUNDED }
//
// bonusStatus values: 'none' | 'pending' | 'credited' | 'reversed' | 'missing'
//   admin rows:    row.bonusStatus          customer rows: row.bonus = { amountMicroUsd, status }
//   ledger keys:   'subscription-bonus:<txId>' and 'subscription-bonus-reversal:<originalTxId>'

const BONUS_USD = 5;
const BONUS_MICRO = 5_000_000;

async function scenario({ bonusUsd = BONUS_USD, planId = 'pro', discountCode } = {}) {
  const repo = newRepo();
  if (bonusUsd !== null) await setPlanBonus(repo, planId, bonusUsd);
  const user = await makeUser(repo, 'Bonus Buyer');
  const manual = new ManualBillingProvider(repo);
  const checkout = await manual.createSubscription({ userId: user.id, planId, discountCode });
  return { repo, user, manual, checkout, txId: checkout.transactionId };
}

async function refund(repo, manual, txId, adminUserId = 'admin-1') {
  const request = await manual.refund({ transactionId: txId });
  await confirmTransaction(repo, request.transactionId, { adminUserId });
  return request;
}

async function promoBalance(repo, userId) { return (await repo.wallet.getAccount(userId)).promoBalanceMicroUsd; }

// Simulates a crash between the status flip and the bonus grant: confirmed, subscription-type, no ledger grant.
async function markConfirmedWithoutGrant(repo, txId) {
  await repo.paymentTransactions.setStatus(txId, 'confirmed', { confirmedAt: new Date().toISOString() });
}

// ---- configuration ---------------------------------------------------------------------------------

test('walletBonusUsd defaults to 0 for every plan, and is part of each plan\'s config (Free fixed at 0)', () => {
  for (const planId of ['free', 'plus', 'pro', 'personalized']) {
    assert.equal(PLAN_DEFAULTS[planId].walletBonusUsd, 0, planId + ' defaults to no bonus');
  }
});

test('the subscription catalog exposes the configured bonus so customers see it before purchase', async () => {
  await withApp(async ({ repo, api }) => {
    const user = await makeUser(repo, 'Catalog Reader');
    const before = await api('GET', '/api/sync/subscriptions/catalog', { userId: user.id });
    for (const planId of ['free', 'plus', 'pro', 'personalized']) assert.equal(before.body.plans[planId].walletBonusUsd, 0, planId);

    await setPlanBonus(repo, 'pro', 7.5);
    const after = await api('GET', '/api/sync/subscriptions/catalog', { userId: user.id });
    assert.equal(after.body.plans.pro.walletBonusUsd, 7.5);
    assert.equal(after.body.plans.free.walletBonusUsd, 0);
    assert.equal(after.body.plans.plus.walletBonusUsd, 0);
  });
});

test('an admin can set walletBonusUsd for a paid plan (audited); Free is fixed at 0; invalid values are rejected', async () => {
  await withApp(async ({ repo, api }) => {
    const admin = await makeAdmin(repo, 'Bonus Admin');
    const regular = await makeUser(repo, 'Regular');
    assert.equal((await api('PATCH', '/api/admin/commercial/plans/pro', { userId: regular.id, body: { walletBonusUsd: 5 } })).status, 403);

    const set = await api('PATCH', '/api/admin/commercial/plans/pro', { userId: admin.id, body: { walletBonusUsd: 5 } });
    assert.equal(set.status, 200);
    assert.equal(set.body.plan.walletBonusUsd, 5);
    const audit = (await repo.auditLog.list({ limit: 200 })).find((entry) => entry.action === 'commercial.plan.update' && entry.targetId === 'pro');
    assert.equal(audit.details.before.walletBonusUsd, 0);
    assert.equal(audit.details.after.walletBonusUsd, 5);

    const free = await api('PATCH', '/api/admin/commercial/plans/free', { userId: admin.id, body: { walletBonusUsd: 5 } });
    assert.equal(free.status, 200);
    assert.equal(free.body.plan.walletBonusUsd, 0, 'Free stays fixed at zero even if a caller sends a bonus for it');

    for (const bad of [-1, 'abc', 10000.01, 1.1234567, null]) {
      const result = await api('PATCH', '/api/admin/commercial/plans/pro', { userId: admin.id, body: { walletBonusUsd: bad } });
      assert.equal(result.status, 400, 'walletBonusUsd ' + JSON.stringify(bad));
    }
    assert.equal((await api('PATCH', '/api/admin/commercial/plans/pro', { userId: admin.id, body: { walletBonusUsd: 10000 } })).status, 200, 'the $10,000 ceiling is inclusive');
    assert.equal((await api('PATCH', '/api/admin/commercial/plans/pro', { userId: admin.id, body: { walletBonusUsd: 0 } })).status, 200, 'the bonus can be switched off');
  });
});

// ---- granting --------------------------------------------------------------------------------------

test('the bonus is granted only after payment is confirmed, to the PROMO balance, through the ledger', async () => {
  const { repo, user, txId } = await scenario();
  const start = await repo.wallet.getAccount(user.id);

  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS')).length, 0, 'a pending checkout grants nothing');
  assert.equal((await repo.wallet.getAccount(user.id)).promoBalanceMicroUsd, start.promoBalanceMicroUsd);

  await confirmTransaction(repo, txId);
  const after = await repo.wallet.getAccount(user.id);
  assert.equal(after.promoBalanceMicroUsd - start.promoBalanceMicroUsd, BONUS_MICRO);
  assert.equal(after.paidBalanceMicroUsd, start.paidBalanceMicroUsd, 'never the paid (withdrawable) balance');

  const entries = await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].promoDeltaMicroUsd, BONUS_MICRO);
  assert.equal(entries[0].cashDeltaMicroUsd, 0);
  assert.equal(entries[0].idempotencyKey, 'subscription-bonus:' + txId);
  assert.equal(entries[0].sourceAction, 'subscription-bonus');
  assert.equal(entries[0].metadata.transactionId, txId);
});

test('a failed purchase grants no bonus, while a confirmed one beside it does (so the mechanism is provably live)', async () => {
  const { repo, user, manual, txId } = await scenario();
  const buyer = await makeUser(repo, 'Confirmed Buyer');
  const confirmedTx = (await manual.createSubscription({ userId: buyer.id, planId: 'pro' })).transactionId;
  const start = await promoBalance(repo, user.id);

  await failTransaction(repo, txId);
  await confirmTransaction(repo, txId); // a failed transaction can never later be confirmed
  await confirmTransaction(repo, confirmedTx);

  assert.equal(await promoBalance(repo, user.id), start, 'the failed purchase got nothing');
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS')).length, 0);
  assert.equal((await ledgerEntries(repo, buyer.id, 'SUBSCRIPTION_BONUS')).length, 1, 'the confirmed purchase beside it did receive its bonus');
});

test('a plan with no bonus configured snapshots a zero bonus and grants no ledger entry at all', async () => {
  const { repo, user, txId } = await scenario({ bonusUsd: null });
  const snapshot = (await repo.paymentTransactions.get(txId)).metadata.pricing;
  assert.ok(snapshot, 'every new subscription checkout carries a pricing snapshot');
  assert.equal(snapshot.walletBonusMicroUsd, 0);
  await confirmTransaction(repo, txId);
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS')).length, 0);
  assert.equal((await repo.subscriptions.getActiveForUser(user.id)).planId, 'pro');
});

test('EXACTLY ONCE: sequential and 5-way concurrent duplicate confirmations never double-credit or double-activate', async () => {
  const { repo, user, txId } = await scenario();
  const start = await promoBalance(repo, user.id);
  const results = await Promise.all(Array.from({ length: 5 }, () => confirmTransaction(repo, txId)));
  assert.equal(results.filter((result) => result.alreadyProcessed === false).length, 1, 'exactly one call did the work');

  const again = await confirmTransaction(repo, txId);
  assert.equal(again.alreadyProcessed, true);
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS')).length, 1);
  assert.equal(await promoBalance(repo, user.id) - start, BONUS_MICRO);
  assert.equal((await repo.subscriptions.listForUser(user.id)).length, 1);
});

test('SNAPSHOT: the bonus is what was configured when the checkout was created, not today\'s setting', async () => {
  const { repo, user, txId } = await scenario({ bonusUsd: 5 });
  const start = await promoBalance(repo, user.id);
  await setPlanBonus(repo, 'pro', 20);
  await confirmTransaction(repo, txId);
  assert.equal(await promoBalance(repo, user.id) - start, BONUS_MICRO, 'not the later $20');

  const later = await new ManualBillingProvider(repo).createSubscription({ userId: (await makeUser(repo, 'Later')).id, planId: 'pro' });
  const laterTx = await repo.paymentTransactions.get(later.transactionId);
  assert.equal(laterTx.metadata.pricing.walletBonusMicroUsd, 20_000_000, 'a new checkout snapshots the new setting');
});

test('a discounted purchase that still costs money keeps its bonus - including when only ONE micro-USD is payable', async () => {
  const repo = newRepo();
  await setPlanBonus(repo, 'pro', BONUS_USD);
  const manual = new ManualBillingProvider(repo);
  await makeCode(repo, { code: 'PAYAPENNY', discountType: 'fixed', discountValue: 14_989_999 });
  const user = await makeUser(repo, 'Almost Free');
  const checkout = await manual.createSubscription({ userId: user.id, planId: 'pro', discountCode: 'PAYAPENNY' });
  assert.equal(checkout.status, 'pending');
  assert.equal((await repo.paymentTransactions.get(checkout.transactionId)).amountMicroUsd, 1);

  await confirmTransaction(repo, checkout.transactionId);
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS')).length, 1);
});

test('APPROVED DECISION: a ZERO-PRICE purchase receives NO bonus, even though the plan has one configured', async () => {
  const repo = newRepo();
  await setPlanBonus(repo, 'pro', BONUS_USD);
  await makeCode(repo, { code: 'FREEPRO', discountType: 'percent', discountValue: 10000, maxRedemptions: 5 });
  const manual = new ManualBillingProvider(repo);
  const user = await makeUser(repo, 'Free Buyer');
  const start = await promoBalance(repo, user.id);

  const checkout = await manual.createSubscription({ userId: user.id, planId: 'pro', discountCode: 'FREEPRO' });
  assert.equal(checkout.status, 'confirmed');
  assert.equal(checkout.noCost, true);
  assert.equal((await repo.subscriptions.getActiveForUser(user.id)).planId, 'pro', 'the subscription itself is granted');
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS')).length, 0);
  assert.equal(await promoBalance(repo, user.id), start, 'the wallet is untouched');
  assert.equal(checkout.pricing.walletBonusMicroUsd, 0, 'the snapshot honestly says no bonus');
  assert.equal((await repo.paymentTransactions.get(checkout.transactionId)).metadata.pricing.walletBonusMicroUsd, 0);

  // a duplicate confirmation still grants nothing
  await confirmTransaction(repo, checkout.transactionId);
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS')).length, 0);
});

test('the quote shows a zero wallet bonus for a zero-price result (never promises a bonus that will not be granted)', async () => {
  await withApp(async ({ repo, api }) => {
    await setPlanBonus(repo, 'pro', BONUS_USD);
    await makeCode(repo, { code: 'FREEPRO', discountValue: 10000 });
    await makeCode(repo, { code: 'HALFOFF', discountValue: 5000 });
    const user = await makeUser(repo, 'Quoter');
    const free = await api('POST', '/api/sync/subscriptions/quote', { userId: user.id, body: { planId: 'pro', code: 'FREEPRO' } });
    assert.equal(free.body.noCost, true);
    assert.equal(free.body.walletBonusMicroUsd, 0);
    const half = await api('POST', '/api/sync/subscriptions/quote', { userId: user.id, body: { planId: 'pro', code: 'HALFOFF' } });
    assert.equal(half.body.walletBonusMicroUsd, BONUS_MICRO);
  });
});

test('a legacy transaction with no pricing snapshot grants no bonus, whatever the plan is configured to today', async () => {
  const repo = newRepo();
  await setPlanBonus(repo, 'plus', 9);
  const user = await makeUser(repo, 'Legacy Buyer');
  const legacy = await repo.paymentTransactions.create({
    userId: user.id, type: 'subscription', provider: 'manual', externalTransactionId: 'legacy-1', amountMicroUsd: 4_990_000, currency: 'USD',
    productId: 'plus', metadata: { planId: 'plus', priceAmountUsd: 4.99, billingInterval: 'month' }
  });
  const control = await makeUser(repo, 'New-style Buyer');
  const controlTx = (await new ManualBillingProvider(repo).createSubscription({ userId: control.id, planId: 'plus' })).transactionId;
  const start = await promoBalance(repo, user.id);

  await confirmTransaction(repo, legacy.id);
  await confirmTransaction(repo, controlTx);

  assert.equal(await promoBalance(repo, user.id), start, 'the legacy row has no snapshot, so it owes no bonus');
  assert.equal((await repo.subscriptions.getActiveForUser(user.id)).planId, 'plus');
  const controlEntries = await ledgerEntries(repo, control.id, 'SUBSCRIPTION_BONUS');
  assert.equal(controlEntries.length, 1, 'a new-style checkout beside it does get its bonus');
  assert.equal(controlEntries[0].promoDeltaMicroUsd, 9_000_000, 'and it is the configured amount');
});

// ---- refund ----------------------------------------------------------------------------------------

test('REFUND revokes the entitlement AND reverses the bonus through an idempotent reversing ledger entry', async () => {
  const { repo, user, manual, txId } = await scenario();
  const start = await promoBalance(repo, user.id);
  await confirmTransaction(repo, txId);
  assert.equal(await promoBalance(repo, user.id) - start, BONUS_MICRO);

  const request = await refund(repo, manual, txId);
  assert.equal(await repo.subscriptions.getActiveForUser(user.id), null);
  assert.equal((await resolveUserEntitlements(user.id, repo)).plan, 'free');
  assert.equal(await promoBalance(repo, user.id), start, 'the bonus is taken back - nothing refundable is left behind');

  const reversals = await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS_REVERSAL');
  assert.equal(reversals.length, 1);
  assert.equal(reversals[0].promoDeltaMicroUsd, -BONUS_MICRO);
  assert.equal(reversals[0].cashDeltaMicroUsd, 0);
  assert.equal(reversals[0].idempotencyKey, 'subscription-bonus-reversal:' + txId);
  assert.equal(reversals[0].metadata.originalTransactionId, txId);
  assert.equal(reversals[0].metadata.refundTransactionId, request.transactionId);

  await confirmTransaction(repo, request.transactionId, { adminUserId: 'admin-1' });
  await assertApiError(manual.refund({ transactionId: txId }), { status: 409, code: 'ALREADY_REFUNDED' });
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS_REVERSAL')).length, 1, 'no second reversal, however often it is retried');
  assert.equal(await promoBalance(repo, user.id), start);
});

test('a bonus that was partly spent on AI is reversed only for its unspent remainder (snapshot lot, not today\'s plan setting) and never drives promo negative', async () => {
  const { repo, user, manual, txId } = await scenario();
  const start = await promoBalance(repo, user.id);
  await confirmTransaction(repo, txId);
  assert.equal(await promoBalance(repo, user.id), start + BONUS_MICRO, 'the bonus was granted');
  // The bonus is spent through the REAL AI path, so the lot tracks how much of it a charge consumed.
  const reserved = await repo.wallet.reserve(user.id, { estimatedRetailMicroUsd: 2_300_000, provider: 'openai', model: 'gpt-test', feature: 'aiChat' });
  await repo.wallet.settle(reserved.reservation.id, {
    providerCostMicroUsd: 1_150_000, retailChargeMicroUsd: 2_300_000, markupPercent: 100, retailMultiplier: 2, tokenDiscountPercent: 0,
    provider: 'openai', model: 'gpt-test', feature: 'aiChat', idempotencyKey: 'ai-settle:' + reserved.reservation.id
  });
  assert.equal(await promoBalance(repo, user.id), start + BONUS_MICRO - 2_300_000);
  await setPlanBonus(repo, 'pro', 99);

  await refund(repo, manual, txId);
  assert.equal(await promoBalance(repo, user.id), start, 'only the unspent $2.70 was reversed; the promo the user already had is untouched');
  const reversals = await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS_REVERSAL');
  assert.equal(reversals.length, 1, 'exactly one reversing entry');
  assert.equal(reversals[0].promoDeltaMicroUsd, -2_700_000, 'the exact unspent remainder of the lot, not the full $5 and not the later $99 setting');
});

test('a refund never reverses a bonus that was never granted (missing grant), and leaves the row as none', async () => {
  const { repo, user, manual, txId } = await scenario();
  await markConfirmedWithoutGrant(repo, txId); // status flipped, grant never happened
  const control = await makeUser(repo, 'Normal Buyer');
  const controlTx = (await manual.createSubscription({ userId: control.id, planId: 'pro' })).transactionId;
  await confirmTransaction(repo, controlTx);
  const start = await promoBalance(repo, user.id);

  await refund(repo, manual, txId);
  await refund(repo, manual, controlTx);

  assert.equal((await ledgerEntries(repo, control.id, 'SUBSCRIPTION_BONUS_REVERSAL')).length, 1, 'a granted bonus IS reversed on refund');
  assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS_REVERSAL')).length, 0, 'a bonus that was never granted is not "reversed" into a debit');
  assert.equal(await promoBalance(repo, user.id), start);
});

// ---- visibility: enrichment of admin + customer transaction lists ---------------------------------

async function seedStatuses() {
  const repo = newRepo();
  await setPlanBonus(repo, 'pro', BONUS_USD);
  await makeCode(repo, { code: 'FREEPRO', discountValue: 10000 });
  const manual = new ManualBillingProvider(repo);
  const build = async (label, planId = 'pro', discountCode) => {
    const user = await makeUser(repo, label);
    const checkout = await manual.createSubscription({ userId: user.id, planId, discountCode });
    return { user, txId: checkout.transactionId };
  };
  const pending = await build('Pending');
  const credited = await build('Credited');
  await confirmTransaction(repo, credited.txId);
  const reversed = await build('Reversed');
  await confirmTransaction(repo, reversed.txId);
  await refund(repo, manual, reversed.txId);
  const failed = await build('Failed');
  await failTransaction(repo, failed.txId);
  const missing = await build('Missing');
  await markConfirmedWithoutGrant(repo, missing.txId);
  const zeroPrice = await build('Zero price', 'pro', 'FREEPRO');
  return { repo, pending, credited, reversed, failed, missing, zeroPrice };
}

test('ADMIN transaction list carries pricing and bonusStatus: pending / credited / reversed / none / missing', async () => {
  const { repo, pending, credited, reversed, failed, missing, zeroPrice } = await seedStatuses();
  const admin = await makeAdmin(repo, 'List Admin');
  await withApp(async ({ api }) => {
    const result = await api('GET', '/api/admin/commercial/transactions', { userId: admin.id });
    assert.equal(result.status, 200);
    const rows = new Map(result.body.transactions.map((row) => [row.id, row]));
    assert.equal(rows.get(pending.txId).bonusStatus, 'pending');
    assert.equal(rows.get(credited.txId).bonusStatus, 'credited');
    assert.equal(rows.get(reversed.txId).bonusStatus, 'reversed');
    assert.equal(rows.get(failed.txId).bonusStatus, 'none');
    assert.equal(rows.get(missing.txId).bonusStatus, 'missing');
    assert.equal(rows.get(zeroPrice.txId).bonusStatus, 'none');

    const pricing = rows.get(credited.txId).pricing;
    assert.equal(pricing.originalAmountMicroUsd, PRO_MICRO);
    assert.equal(pricing.finalAmountMicroUsd, PRO_MICRO);
    assert.equal(pricing.walletBonusMicroUsd, BONUS_MICRO);
    assert.equal(pricing.discount, null);
    assert.equal(rows.get(zeroPrice.txId).pricing.discount.code, 'FREEPRO');
    assert.equal(rows.get(zeroPrice.txId).pricing.finalAmountMicroUsd, 0);
  }, { repo });
});

test('CUSTOMER billing history shows each purchase\'s own pricing and bonus state (and only their own)', async () => {
  const { repo, pending, credited, reversed, zeroPrice } = await seedStatuses();
  await withApp(async ({ api }) => {
    const mine = async (who) => (await api('GET', '/api/sync/wallet/transactions', { userId: who.user.id })).body.transactions;

    const creditedRows = await mine(credited);
    const own = creditedRows.find((row) => row.id === credited.txId);
    assert.equal(own.bonus.status, 'credited');
    assert.equal(own.bonus.amountMicroUsd, BONUS_MICRO);
    assert.equal(own.pricing.finalAmountMicroUsd, PRO_MICRO);
    assert.ok(creditedRows.every((row) => row.userId === credited.user.id), 'never another user\'s transaction');

    assert.equal((await mine(pending)).find((row) => row.id === pending.txId).bonus.status, 'pending');
    assert.equal((await mine(reversed)).find((row) => row.type === 'subscription' && row.id === reversed.txId).bonus.status, 'reversed');
    const free = (await mine(zeroPrice)).find((row) => row.id === zeroPrice.txId);
    assert.equal(free.bonus.status, 'none');
    assert.equal(free.pricing.discount.code, 'FREEPRO');
  }, { repo });
});

test('a legacy transaction row is enriched with a safe fallback (original = amount, no discount, no bonus)', async () => {
  const repo = newRepo();
  const user = await makeUser(repo, 'Legacy');
  const admin = await makeAdmin(repo, 'Legacy Admin');
  const legacy = await repo.paymentTransactions.create({
    userId: user.id, type: 'subscription', provider: 'manual', externalTransactionId: 'legacy-2', amountMicroUsd: 4_990_000, currency: 'USD',
    productId: 'plus', metadata: { planId: 'plus', priceAmountUsd: 4.99, billingInterval: 'month' }
  });
  await withApp(async ({ api }) => {
    const row = (await api('GET', '/api/admin/commercial/transactions', { userId: admin.id })).body.transactions.find((r) => r.id === legacy.id);
    assert.ok(row.pricing, 'subscription rows are enriched with a pricing object, even when the stored row predates snapshots');
    assert.equal(row.pricing.originalAmountMicroUsd, 4_990_000);
    assert.equal(row.pricing.finalAmountMicroUsd, 4_990_000);
    assert.equal(row.pricing.discountAmountMicroUsd, 0);
    assert.equal(row.pricing.walletBonusMicroUsd, 0);
    assert.equal(row.pricing.discount, null);
    assert.equal(row.bonusStatus, 'none');
  }, { repo });
});

// ---- repair / reconciliation of a lost bonus ------------------------------------------------------

const REPAIR = (id) => '/api/admin/commercial/transactions/' + id + '/repair-bonus';

async function confirmedWithoutGrant() {
  const ctx = await scenario();
  await markConfirmedWithoutGrant(ctx.repo, ctx.txId);
  return ctx;
}

test('REPAIR: an admin can recover a lost bonus exactly once, from the snapshot, and the row becomes credited', async () => {
  const ctx = await confirmedWithoutGrant();
  const { repo, user, txId } = ctx;
  const admin = await makeAdmin(repo, 'Repair Admin');
  const start = await promoBalance(repo, user.id);
  await setPlanBonus(repo, 'pro', 50); // today's setting must not matter

  await withApp(async ({ api }) => {
    const first = await api('POST', REPAIR(txId), { userId: admin.id });
    assert.equal(first.status, 200);
    assert.equal(first.body.repaired, true);
    assert.equal(first.body.alreadyGranted, false);
    assert.equal(first.body.bonusStatus, 'credited');
    assert.equal(first.body.transactionId, txId);

    const entries = await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].idempotencyKey, 'subscription-bonus:' + txId, 'the SAME key the normal grant uses, so a later replay cannot double-credit');
    assert.equal(entries[0].promoDeltaMicroUsd, BONUS_MICRO);
    assert.equal(await promoBalance(repo, user.id) - start, BONUS_MICRO);

    const audit = (await repo.auditLog.list({ limit: 200 })).find((entry) => entry.action === 'commercial.transaction.repairBonus' && entry.targetId === txId);
    assert.ok(audit, 'the repair is audited');
    assert.equal(audit.targetType, 'paymentTransaction');
    assert.equal(audit.details.repaired, true);

    const second = await api('POST', REPAIR(txId), { userId: admin.id });
    assert.equal(second.status, 200);
    assert.equal(second.body.repaired, false);
    assert.equal(second.body.alreadyGranted, true);
    assert.equal(second.body.bonusStatus, 'credited');
    assert.equal(await promoBalance(repo, user.id) - start, BONUS_MICRO, 'a second repair credits nothing');

    const row = (await api('GET', '/api/admin/commercial/transactions', { userId: admin.id })).body.transactions.find((r) => r.id === txId);
    assert.equal(row.bonusStatus, 'credited');
  }, { repo });
});

test('REPAIR is safe under concurrency: five simultaneous repairs credit exactly once', async () => {
  const { repo, user, txId } = await confirmedWithoutGrant();
  const admin = await makeAdmin(repo, 'Concurrent Repair Admin');
  const start = await promoBalance(repo, user.id);
  await withApp(async ({ api }) => {
    const results = await Promise.all(Array.from({ length: 5 }, () => api('POST', REPAIR(txId), { userId: admin.id })));
    results.forEach((result) => assert.equal(result.status, 200));
    assert.equal(results.filter((result) => result.body.repaired === true).length, 1);
    assert.equal((await ledgerEntries(repo, user.id, 'SUBSCRIPTION_BONUS')).length, 1);
    assert.equal(await promoBalance(repo, user.id) - start, BONUS_MICRO);
  }, { repo });
});

test('REPAIR requires admin authorization AND a fresh re-authentication (it moves wallet money)', async () => {
  const { repo, user, txId } = await confirmedWithoutGrant();
  const admin = await makeAdmin(repo, 'Step Up Admin');
  const start = await promoBalance(repo, user.id);
  await withApp(async ({ api }) => {
    assert.equal((await api('POST', REPAIR(txId), { userId: user.id })).status, 403, 'a non-admin is refused');
    const stale = await staleReauthHeaders(repo, admin.id);
    const refused = await api('POST', REPAIR(txId), { headers: stale });
    assert.equal(refused.status, 401);
    assert.equal(refused.body.error, 'STEP_UP_REQUIRED');
    assert.equal(await promoBalance(repo, user.id), start, 'nothing was credited');
    assert.equal((await api('POST', REPAIR('no-such-transaction'), { userId: admin.id })).status, 404);
  }, { repo });
});

test('REPAIR refuses every case where there is nothing (or nothing safe) to repair: 409 BONUS_REPAIR_NOT_APPLICABLE with a reason', async () => {
  const repo = newRepo();
  await setPlanBonus(repo, 'pro', BONUS_USD);
  await makeCode(repo, { code: 'FREEPRO', discountValue: 10000 });
  const admin = await makeAdmin(repo, 'Guard Admin');
  const manual = new ManualBillingProvider(repo);
  const user = await makeUser(repo, 'Guarded');

  const pending = (await manual.createSubscription({ userId: user.id, planId: 'pro' })).transactionId;
  const failed = (await manual.createSubscription({ userId: (await makeUser(repo, 'F')).id, planId: 'pro' })).transactionId;
  await failTransaction(repo, failed);
  const credited = (await manual.createSubscription({ userId: (await makeUser(repo, 'C')).id, planId: 'pro' })).transactionId;
  await confirmTransaction(repo, credited);
  const zero = (await manual.createSubscription({ userId: (await makeUser(repo, 'Z')).id, planId: 'pro', discountCode: 'FREEPRO' })).transactionId;
  const refundedUser = await makeUser(repo, 'R');
  const refundedTx = (await manual.createSubscription({ userId: refundedUser.id, planId: 'pro' })).transactionId;
  await markConfirmedWithoutGrant(repo, refundedTx);
  await refund(repo, manual, refundedTx); // refunded while its grant was still missing
  const topUp = (await manual.createWalletTopUp({ userId: user.id, amountUsd: 10 })).transactionId;
  await confirmTransaction(repo, topUp);
  const legacy = (await repo.paymentTransactions.create({
    userId: user.id, type: 'subscription', provider: 'manual', amountMicroUsd: 4_990_000, productId: 'plus', metadata: { planId: 'plus', billingInterval: 'month' }
  })).id;
  await markConfirmedWithoutGrant(repo, legacy);

  await withApp(async ({ api }) => {
    const expectations = [
      [pending, 'NOT_CONFIRMED'], [failed, 'NOT_CONFIRMED'], [zero, 'NO_BONUS'], [refundedTx, 'REFUNDED'],
      [topUp, 'NOT_SUBSCRIPTION'], [legacy, 'NO_BONUS']
    ];
    for (const [id, reason] of expectations) {
      const result = await api('POST', REPAIR(id), { userId: admin.id });
      assert.equal(result.status, 409, reason + ' for ' + id);
      assert.equal(result.body.error, 'BONUS_REPAIR_NOT_APPLICABLE');
      assert.equal(result.body.reason, reason);
    }
    // an already-credited purchase is not an error - it is the idempotent "nothing to do" answer
    const noop = await api('POST', REPAIR(credited), { userId: admin.id });
    assert.equal(noop.status, 200);
    assert.equal(noop.body.repaired, false);
    assert.equal(noop.body.alreadyGranted, true);
  }, { repo });
});
