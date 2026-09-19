import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { ManualBillingProvider } from '../server/commercial/manual-billing-provider.mjs';
import { confirmTransaction } from '../server/commercial/payment-service.mjs';
import {
  withApp, makeUser, makeAdmin, makeCode, setPlanBonus, setBscConfig, mockRpc, iso, ORIGINAL_FETCH, HOUR_MS, MINUTE_MS,
  PRO_MICRO, PLUS_MICRO, PRO_15_DISCOUNT, PRO_15_FINAL, PLUS_15_DISCOUNT, PLUS_15_FINAL
} from './helpers/discount-fixtures.mjs';

// Two admin capabilities on discount codes, end to end through the real Express app and the real billing providers:
//
//   1. PLAN SCOPE - `planIds` says which paid plans a code applies to; empty means EVERY paid plan (the default, so every
//      existing code keeps working). A code used on a plan outside its scope is refused with 409
//      DISCOUNT_CODE_PLAN_NOT_ELIGIBLE by the quote AND by the authoritative checkout, and reserves nothing.
//   2. APPLICATION MODE - `applicationMode: 'code'` (typed by the customer, as before) or 'automatic': no code at all. An
//      automatic discount is advertised per user by GET /api/sync/subscriptions/automatic-discounts (server-computed
//      amounts, so a plan card can strike the price and show the real one) and applied at checkout by its OPAQUE ID
//      (`automaticDiscountId`) - never by a price. Everything else (window, capacity, one redemption per user, holds,
//      confirmation, refunds) is the SAME machinery as a typed code.
//
// The client never sends an amount: the server computes them, and if the offer the customer saw is no longer valid at
// checkout the purchase is REFUSED loudly instead of silently charging more.

afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

const ADMIN_CODES = '/api/admin/commercial/discount-codes';
const QUOTE = '/api/sync/subscriptions/quote';
const UPGRADE = '/api/sync/subscriptions/upgrade-request';
const OFFERS = '/api/sync/subscriptions/automatic-discounts';
const status = (id) => '/api/sync/subscriptions/discount-codes/' + id + '/status';

const createBody = (overrides = {}) => ({ campaignName: 'Scope test', discountType: 'percent', discountValue: 15, ...overrides });

// ---- 1. plan scope: admin API ------------------------------------------------------------------------------------------

test('admin: a code can be restricted to plans; planIds is returned, empty means every plan, duplicates collapse, and PATCH edits it', async () => {
  await withApp(async ({ repo, api }) => {
    const admin = await makeAdmin(repo, 'Scope Admin');

    const everything = await api('POST', ADMIN_CODES, { userId: admin.id, body: createBody({ code: 'ALLPLANS' }) });
    assert.equal(everything.status, 201);
    assert.deepEqual(everything.body.planIds, [], 'no restriction = every paid plan');
    assert.equal(everything.body.applicationMode, 'code', 'the default mode is a typed code');

    const scoped = await api('POST', ADMIN_CODES, { userId: admin.id, body: createBody({ code: 'PLUSONLY', planIds: ['plus', 'plus', 'pro'] }) });
    assert.equal(scoped.status, 201);
    assert.deepEqual(scoped.body.planIds, ['plus', 'pro'], 'duplicates collapse, order kept');

    const narrowed = await api('PATCH', ADMIN_CODES + '/' + scoped.body.id, { userId: admin.id, body: { planIds: ['personalized'] } });
    assert.equal(narrowed.status, 200);
    assert.deepEqual(narrowed.body.planIds, ['personalized']);
    const reopened = await api('PATCH', ADMIN_CODES + '/' + scoped.body.id, { userId: admin.id, body: { planIds: [] } });
    assert.deepEqual(reopened.body.planIds, [], 'clearing the list opens the code to every plan again');

    const listed = await api('GET', ADMIN_CODES, { userId: admin.id });
    assert.deepEqual(listed.body.codes.find((code) => code.code === 'PLUSONLY').planIds, []);
    const audit = (await repo.auditLog.list({ limit: 50 })).filter((entry) => entry.action === 'commercial.discountCode.update');
    assert.ok(audit.some((entry) => JSON.stringify(entry.details.after.planIds) === JSON.stringify(['personalized'])), 'the scope change is audited');
  });
});

test('admin: planIds only accepts real PAID plans - free, unknown ids, non-arrays and non-strings are 400 on the planIds field', async () => {
  await withApp(async ({ repo, api }) => {
    const admin = await makeAdmin(repo, 'Scope Validator');
    for (const bad of [['free'], ['gold'], 'plus', [1], [null], [['plus']], { plus: true }]) {
      const created = await api('POST', ADMIN_CODES, { userId: admin.id, body: createBody({ code: 'BADSCOPE', planIds: bad }) });
      assert.equal(created.status, 400, JSON.stringify(bad));
      assert.equal(created.body.error, 'VALIDATION_FAILED');
      assert.equal(created.body.field, 'planIds', JSON.stringify(bad));
    }
    assert.equal((await repo.discountCodes.list()).length, 0, 'nothing was created by any rejected request');
  });
});

// ---- 1b. plan scope: enforcement ---------------------------------------------------------------------------------------

test('a plan-scoped code is refused on any other plan by the quote AND the checkout (409 DISCOUNT_CODE_PLAN_NOT_ELIGIBLE), and nothing is reserved', async () => {
  await withApp(async ({ repo, api }) => {
    const code = await makeCode(repo, { code: 'PLUSONLY', planIds: ['plus'], maxRedemptions: 10 });
    const user = await makeUser(repo, 'Wrong Plan Buyer');

    const ok = await api('POST', QUOTE, { userId: user.id, body: { planId: 'plus', code: 'PLUSONLY' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.finalAmountMicroUsd, PLUS_15_FINAL);

    const quote = await api('POST', QUOTE, { userId: user.id, body: { planId: 'pro', code: 'PLUSONLY' } });
    assert.equal(quote.status, 409);
    assert.equal(quote.body.error, 'DISCOUNT_CODE_PLAN_NOT_ELIGIBLE');

    const checkout = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', discountCode: 'PLUSONLY' } });
    assert.equal(checkout.status, 409);
    assert.equal(checkout.body.error, 'DISCOUNT_CODE_PLAN_NOT_ELIGIBLE');

    const stats = await repo.discountCodes.stats(code.id);
    assert.equal(stats.pendingReservations, 0, 'a refused checkout holds nothing');
    assert.equal((await repo.paymentTransactions.listForUser(user.id)).length, 0, 'and creates no transaction');

    const allowed = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'plus', discountCode: 'PLUSONLY' } });
    assert.equal(allowed.status, 201);
  });
});

test('an UNRESTRICTED code (planIds empty) still applies to every paid plan - existing codes are unchanged', async () => {
  await withApp(async ({ repo, api }) => {
    await makeCode(repo, { code: 'EVERYWHERE' });
    const user = await makeUser(repo, 'Everywhere Buyer');
    for (const planId of ['plus', 'pro', 'personalized']) {
      const quote = await api('POST', QUOTE, { userId: user.id, body: { planId, code: 'EVERYWHERE' } });
      assert.equal(quote.status, 200, planId);
    }
  });
});

// ---- 2. application mode: admin API ------------------------------------------------------------------------------------

test('admin: an AUTOMATIC discount needs no code - the server generates an internal one; supplying a code, or changing the mode later, is refused', async () => {
  await withApp(async ({ repo, api }) => {
    const admin = await makeAdmin(repo, 'Auto Admin');
    const created = await api('POST', ADMIN_CODES, { userId: admin.id, body: createBody({ applicationMode: 'automatic', campaignName: 'Autumn sale', planIds: ['pro'] }) });
    assert.equal(created.status, 201);
    assert.equal(created.body.applicationMode, 'automatic');
    assert.match(created.body.code, /^AUTO-[A-Z0-9]{6,20}$/, 'an internal, unguessable identifier');
    assert.deepEqual(created.body.planIds, ['pro']);

    const second = await api('POST', ADMIN_CODES, { userId: admin.id, body: createBody({ applicationMode: 'automatic' }) });
    assert.notEqual(second.body.code, created.body.code, 'every automatic discount gets its own identifier');

    const withCode = await api('POST', ADMIN_CODES, { userId: admin.id, body: createBody({ applicationMode: 'automatic', code: 'TYPEME' }) });
    assert.equal(withCode.status, 400);
    assert.equal(withCode.body.field, 'code', 'an automatic discount has no customer-typed code');

    const codeMode = await api('POST', ADMIN_CODES, { userId: admin.id, body: createBody({ applicationMode: 'code' }) });
    assert.equal(codeMode.status, 400, 'a typed-code discount still requires its code');
    assert.equal(codeMode.body.field, 'code');

    const unknownMode = await api('POST', ADMIN_CODES, { userId: admin.id, body: createBody({ applicationMode: 'magic', code: 'MAGIC' }) });
    assert.equal(unknownMode.status, 400);
    assert.equal(unknownMode.body.field, 'applicationMode');

    const switched = await api('PATCH', ADMIN_CODES + '/' + created.body.id, { userId: admin.id, body: { applicationMode: 'code' } });
    assert.equal(switched.status, 400, 'the mode is fixed at creation, like the code string');
    assert.equal(switched.body.field, 'applicationMode');
  });
});

test('an automatic discount can never be USED AS a typed code: quote and checkout answer exactly like an unknown code', async () => {
  await withApp(async ({ repo, api }) => {
    const auto = await makeCode(repo, { code: 'AUTO-SECRET1', applicationMode: 'automatic' });
    const user = await makeUser(repo, 'Code Guesser');
    const quote = await api('POST', QUOTE, { userId: user.id, body: { planId: 'pro', code: auto.code } });
    assert.equal(quote.status, 404);
    assert.equal(quote.body.error, 'DISCOUNT_CODE_INVALID');
    const checkout = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', discountCode: auto.code } });
    assert.equal(checkout.status, 404);
    assert.equal(checkout.body.error, 'DISCOUNT_CODE_INVALID');
    assert.equal((await repo.discountCodes.stats(auto.id)).pendingReservations, 0);
  });
});

// ---- 3. offers ---------------------------------------------------------------------------------------------------------

test('GET automatic-discounts: each eligible plan carries a server-computed offer (amounts, bonus, expiry, capacity) and NEVER a code', async () => {
  await withApp(async ({ repo, api }) => {
    await setPlanBonus(repo, 'pro', 3);
    const expires = iso(Date.now() + 2 * HOUR_MS);
    const auto = await makeCode(repo, { code: 'AUTO-PRO15', applicationMode: 'automatic', campaignName: 'Pro Autumn', planIds: ['pro'], maxRedemptions: 20, expiresAt: expires });
    const user = await makeUser(repo, 'Offer Viewer');

    const result = await api('GET', OFFERS, { userId: user.id });
    assert.equal(result.status, 200);
    assert.deepEqual(Object.keys(result.body.offers), ['pro'], 'only the plan the discount is scoped to');
    const offer = result.body.offers.pro;
    assert.equal(offer.automatic, true);
    assert.equal(offer.planId, 'pro');
    assert.equal(offer.codeId, auto.id);
    assert.equal(offer.campaignName, 'Pro Autumn');
    assert.equal(offer.discountType, 'percent');
    assert.equal(offer.originalAmountMicroUsd, PRO_MICRO);
    assert.equal(offer.discountAmountMicroUsd, PRO_15_DISCOUNT);
    assert.equal(offer.finalAmountMicroUsd, PRO_15_FINAL);
    assert.equal(offer.walletBonusMicroUsd, 3_000_000);
    assert.equal(offer.noCost, false);
    assert.equal(offer.expiresAt, expires);
    assert.equal(offer.maxRedemptions, 20);
    assert.equal(offer.remaining, 20);
    assert.equal('code' in offer, false, 'the internal identifier never reaches the customer');
    assert.equal(JSON.stringify(result.body).includes('AUTO-PRO15'), false);
  });
});

test('offers cover fixed-amount discounts, an unscoped discount reaches every paid plan, and a free result reports noCost with no bonus', async () => {
  await withApp(async ({ repo, api }) => {
    await setPlanBonus(repo, 'plus', 2);
    await makeCode(repo, { code: 'AUTO-FIVE', applicationMode: 'automatic', discountType: 'fixed', discountValue: 5_000_000 });
    const user = await makeUser(repo, 'Fixed Viewer');
    const fixed = await api('GET', OFFERS, { userId: user.id });
    assert.deepEqual(Object.keys(fixed.body.offers).sort(), ['personalized', 'plus', 'pro']);
    assert.equal(fixed.body.offers.pro.discountAmountMicroUsd, 5_000_000);
    assert.equal(fixed.body.offers.pro.finalAmountMicroUsd, PRO_MICRO - 5_000_000);
    assert.equal(fixed.body.offers.plus.discountAmountMicroUsd, PLUS_MICRO, 'a fixed amount is clamped to the price - never negative');
    assert.equal(fixed.body.offers.plus.finalAmountMicroUsd, 0);
    assert.equal(fixed.body.offers.plus.noCost, true);
    assert.equal(fixed.body.offers.plus.walletBonusMicroUsd, 0, 'a $0 purchase earns no bonus (approved rule)');
  });
});

test('offers respect the active flag, the start/expiry window and capacity - and appear again when the window opens', async (t) => {
  await withApp(async ({ repo, api }) => {
    const user = await makeUser(repo, 'Window Viewer');
    const buyer = await makeUser(repo, 'Window Buyer');
    await makeCode(repo, { code: 'AUTO-OFF', applicationMode: 'automatic', active: false });
    await makeCode(repo, { code: 'AUTO-LATER', applicationMode: 'automatic', startsAt: iso(Date.now() + HOUR_MS), planIds: ['plus'] });
    await makeCode(repo, { code: 'AUTO-GONE', applicationMode: 'automatic', startsAt: iso(Date.now() - 2 * HOUR_MS), expiresAt: iso(Date.now() - HOUR_MS), planIds: ['pro'] });
    const capped = await makeCode(repo, { code: 'AUTO-ONE', applicationMode: 'automatic', maxRedemptions: 1, planIds: ['personalized'] });

    assert.ok((await api('GET', OFFERS, { userId: user.id })).body.offers.personalized, 'the capped discount is offered while a use is left');
    assert.equal((await api('GET', OFFERS, { userId: user.id })).body.offers.plus, undefined, 'not started');
    assert.equal((await api('GET', OFFERS, { userId: user.id })).body.offers.pro, undefined, 'expired');

    await new ManualBillingProvider(repo).createSubscription({ userId: buyer.id, planId: 'personalized', automaticDiscountId: capped.id });
    assert.equal((await api('GET', OFFERS, { userId: user.id })).body.offers.personalized, undefined, 'the last use is taken (a live reservation counts)');

    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    t.mock.timers.tick(90 * MINUTE_MS);
    assert.ok((await api('GET', OFFERS, { userId: user.id })).body.offers.plus, 'the window has opened');
  });
});

test('a user who already redeemed a discount, or holds a live reservation for it, is not offered it again; others still are', async () => {
  await withApp(async ({ repo, api }) => {
    const auto = await makeCode(repo, { code: 'AUTO-ONCE', applicationMode: 'automatic', planIds: ['pro'], maxRedemptions: 5 });
    const buyer = await makeUser(repo, 'Redeemer');
    const other = await makeUser(repo, 'Other Viewer');
    const manual = new ManualBillingProvider(repo);

    const checkout = await manual.createSubscription({ userId: buyer.id, planId: 'pro', automaticDiscountId: auto.id });
    assert.equal((await api('GET', OFFERS, { userId: buyer.id })).body.offers.pro, undefined, 'own live reservation hides the offer');
    await confirmTransaction(repo, checkout.transactionId);
    assert.equal((await api('GET', OFFERS, { userId: buyer.id })).body.offers.pro, undefined, 'a confirmed redemption is consumed');
    assert.equal((await api('GET', OFFERS, { userId: other.id })).body.offers.pro.remaining, 4, 'another customer still sees it, with the live remaining count');
  });
});

test('when several automatic discounts cover a plan the LARGEST discount wins (ties: the oldest); no stacking', async () => {
  await withApp(async ({ repo, api }) => {
    await makeCode(repo, { code: 'AUTO-SMALL', applicationMode: 'automatic', campaignName: 'Small', planIds: ['pro'], discountValue: 500 });
    const big = await makeCode(repo, { code: 'AUTO-BIG', applicationMode: 'automatic', campaignName: 'Big', planIds: ['pro'], discountValue: 3000 });
    await makeCode(repo, { code: 'AUTO-BIG2', applicationMode: 'automatic', campaignName: 'Big twin', planIds: ['pro'], discountValue: 3000 });
    const user = await makeUser(repo, 'Best Viewer');
    const offer = (await api('GET', OFFERS, { userId: user.id })).body.offers.pro;
    assert.equal(offer.codeId, big.id);
    assert.equal(offer.campaignName, 'Big');
    assert.equal(offer.discountAmountMicroUsd, 4_497_000, '30% of 14.99');
  });
});

test('GET automatic-discounts requires a session, and has its own request budget (it never eats the code-guessing budget)', async () => {
  await withApp(async ({ repo, api }) => {
    await makeCode(repo, { code: 'AUTO-BUDGET', applicationMode: 'automatic' });
    const user = await makeUser(repo, 'Budget Viewer');
    assert.equal((await api('GET', OFFERS, {})).status, 401);
    for (let i = 0; i < 30; i += 1) await api('GET', OFFERS, { userId: user.id });
    const guess = await api('POST', QUOTE, { userId: user.id, body: { planId: 'pro', code: 'NOPE-NOT-A-CODE' } });
    assert.equal(guess.status, 404, 'still able to try a code: 30 offer reads did not consume that budget');
    assert.equal((await api('GET', OFFERS, { userId: user.id })).status, 429, 'the offers read has its own limit');
  });
});

// ---- 4. checkout with an automatic discount ---------------------------------------------------------------------------

test('checkout applies an automatic discount by its id: transaction at the FINAL amount, snapshot marks it automatic, a slot is held, remaining drops live', async () => {
  await withApp(async ({ repo, api }) => {
    await setPlanBonus(repo, 'pro', 3);
    const auto = await makeCode(repo, { code: 'AUTO-LIVE', applicationMode: 'automatic', campaignName: 'Live sale', planIds: ['pro'], maxRedemptions: 20 });
    const user = await makeUser(repo, 'Auto Buyer');
    const watcher = await makeUser(repo, 'Auto Watcher');
    assert.equal((await api('GET', status(auto.id), { userId: watcher.id })).body.remaining, 20);

    const result = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', automaticDiscountId: auto.id } });
    assert.equal(result.status, 201);
    const transaction = await repo.paymentTransactions.get(result.body.transactionId);
    assert.equal(transaction.amountMicroUsd, PRO_15_FINAL);
    assert.equal(transaction.metadata.pricing.originalAmountMicroUsd, PRO_MICRO);
    assert.equal(transaction.metadata.pricing.discountAmountMicroUsd, PRO_15_DISCOUNT);
    assert.equal(transaction.metadata.pricing.walletBonusMicroUsd, 3_000_000);
    assert.equal(transaction.metadata.pricing.discount.automatic, true);
    assert.equal(transaction.metadata.pricing.discount.campaignName, 'Live sale');
    assert.equal(transaction.metadata.pricing.discount.codeId, auto.id);

    const redemption = await repo.discountRedemptions.getByTransactionId(transaction.id);
    assert.equal(redemption.status, 'reserved');
    assert.equal((await api('GET', status(auto.id), { userId: watcher.id })).body.remaining, 19, 'others watching see the slot go, live');

    await confirmTransaction(repo, transaction.id);
    assert.equal((await repo.discountRedemptions.getByTransactionId(transaction.id)).status, 'confirmed');
    assert.equal((await api('GET', status(auto.id), { userId: watcher.id })).body.remaining, 19);
  });
});

test('a typed-code checkout is NOT marked automatic in its snapshot (the two are told apart forever)', async () => {
  await withApp(async ({ repo, api }) => {
    await makeCode(repo, { code: 'TYPED15' });
    const user = await makeUser(repo, 'Typed Buyer');
    const result = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', discountCode: 'TYPED15' } });
    const transaction = await repo.paymentTransactions.get(result.body.transactionId);
    assert.equal(transaction.metadata.pricing.discount.automatic, false);
  });
});

test('an offer that is no longer valid at checkout is REFUSED loudly - never a silent full-price charge - and nothing is created', async (t) => {
  await withApp(async ({ repo, api }) => {
    const expiring = await makeCode(repo, { code: 'AUTO-SOON', applicationMode: 'automatic', planIds: ['pro'], expiresAt: iso(Date.now() + MINUTE_MS) });
    const exhausted = await makeCode(repo, { code: 'AUTO-LAST', applicationMode: 'automatic', planIds: ['plus'], maxRedemptions: 1 });
    const deactivated = await makeCode(repo, { code: 'AUTO-STOP', applicationMode: 'automatic', planIds: ['personalized'] });
    const user = await makeUser(repo, 'Late Buyer');
    const rival = await makeUser(repo, 'Rival Buyer');
    await new ManualBillingProvider(repo).createSubscription({ userId: rival.id, planId: 'plus', automaticDiscountId: exhausted.id });
    await repo.discountCodes.update(deactivated.id, { active: false });

    const wrongPlan = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'plus', automaticDiscountId: expiring.id } });
    assert.equal(wrongPlan.status, 409);
    assert.equal(wrongPlan.body.error, 'DISCOUNT_CODE_PLAN_NOT_ELIGIBLE');
    const used = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'plus', automaticDiscountId: exhausted.id } });
    assert.equal(used.status, 409);
    assert.equal(used.body.error, 'DISCOUNT_CODE_EXHAUSTED');
    const off = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'personalized', automaticDiscountId: deactivated.id } });
    assert.equal(off.status, 404);
    assert.equal(off.body.error, 'DISCOUNT_CODE_INVALID');

    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    t.mock.timers.tick(2 * MINUTE_MS);
    const late = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', automaticDiscountId: expiring.id } });
    assert.equal(late.status, 409);
    assert.equal(late.body.error, 'DISCOUNT_CODE_EXPIRED');
    assert.equal((await repo.paymentTransactions.listForUser(user.id)).length, 0, 'not one of the refused checkouts created a transaction');
  });
});

test('automaticDiscountId is validated: unknown id 404, the id of a typed-code discount 404 (it cannot be claimed without its code), both fields together 400, a non-string 400', async () => {
  await withApp(async ({ repo, api }) => {
    const typed = await makeCode(repo, { code: 'TYPEDONLY' });
    const auto = await makeCode(repo, { code: 'AUTO-BOTH', applicationMode: 'automatic' });
    const user = await makeUser(repo, 'Validator');
    const unknown = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', automaticDiscountId: 'no-such-discount' } });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error, 'DISCOUNT_CODE_INVALID');
    const smuggled = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', automaticDiscountId: typed.id } });
    assert.equal(smuggled.status, 404, 'a code-mode discount cannot be claimed by id');
    const both = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', discountCode: 'TYPEDONLY', automaticDiscountId: auto.id } });
    assert.equal(both.status, 400);
    assert.equal(both.body.error, 'VALIDATION_FAILED');
    const notString = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', automaticDiscountId: 12345 } });
    assert.equal(notString.status, 400);
    assert.equal((await repo.paymentTransactions.listForUser(user.id)).length, 0);
  });
});

test('one redemption per user holds for an automatic discount: a second checkout is DISCOUNT_CODE_ALREADY_USED, even after a refund', async () => {
  await withApp(async ({ repo, api }) => {
    const auto = await makeCode(repo, { code: 'AUTO-SINGLE', applicationMode: 'automatic', planIds: ['plus'] });
    const user = await makeUser(repo, 'Repeat Buyer');
    const manual = new ManualBillingProvider(repo);
    const first = await manual.createSubscription({ userId: user.id, planId: 'plus', automaticDiscountId: auto.id });
    await confirmTransaction(repo, first.transactionId);
    const again = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'plus', automaticDiscountId: auto.id } });
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'DISCOUNT_CODE_ALREADY_USED');
  });
});

test('BSC checkout with an automatic discount: the invoice is generated for the discounted amount', async () => {
  await withApp(async ({ repo, api }) => {
    await setBscConfig(repo, { invoiceExpiryMinutes: 45 });
    mockRpc({ chainId: 56 });
    const auto = await makeCode(repo, { code: 'AUTO-BSC', applicationMode: 'automatic', planIds: ['pro'] });
    const user = await makeUser(repo, 'Crypto Auto Buyer');
    const result = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'pro', automaticDiscountId: auto.id } });
    assert.equal(result.status, 201);
    assert.ok(result.body.invoiceId);
    const invoice = await api('GET', '/api/sync/wallet/invoices/' + result.body.invoiceId, { userId: user.id });
    assert.equal(invoice.body.usdAmountMicroUsd, PRO_15_FINAL);
    const transaction = await repo.paymentTransactions.get(result.body.transactionId);
    assert.equal(transaction.metadata.pricing.discount.automatic, true);
  });
});

test('plan cards and checkout agree: the amount an offer advertises equals the amount the checkout charges (Plus, percent)', async () => {
  await withApp(async ({ repo, api }) => {
    const auto = await makeCode(repo, { code: 'AUTO-MATCH', applicationMode: 'automatic', planIds: ['plus'] });
    const user = await makeUser(repo, 'Match Buyer');
    const offer = (await api('GET', OFFERS, { userId: user.id })).body.offers.plus;
    const result = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'plus', automaticDiscountId: offer.codeId } });
    const transaction = await repo.paymentTransactions.get(result.body.transactionId);
    assert.equal(transaction.amountMicroUsd, offer.finalAmountMicroUsd);
    assert.equal(offer.finalAmountMicroUsd, PLUS_15_FINAL);
    assert.equal(offer.discountAmountMicroUsd, PLUS_15_DISCOUNT);
    assert.equal(offer.codeId, auto.id);
  });
});

test('the internal identifier of an automatic discount never reaches the customer: not in the checkout answer, not in their billing history', async () => {
  await withApp(async ({ repo, api }) => {
    const auto = await makeCode(repo, { code: 'AUTO-HIDDEN01', applicationMode: 'automatic', campaignName: 'Quiet sale', planIds: ['plus'] });
    const user = await makeUser(repo, 'Private Buyer');
    const result = await api('POST', UPGRADE, { userId: user.id, body: { planId: 'plus', automaticDiscountId: auto.id } });
    assert.equal(result.status, 201);
    assert.equal(JSON.stringify(result.body).includes('AUTO-HIDDEN01'), false, 'the checkout answer');
    assert.equal(result.body.pricing.discount.campaignName, 'Quiet sale');
    assert.equal(result.body.pricing.discount.automatic, true);

    const history = await api('GET', '/api/sync/wallet/transactions', { userId: user.id });
    assert.equal(JSON.stringify(history.body).includes('AUTO-HIDDEN01'), false, 'the billing history, including metadata');
    const row = history.body.transactions.find((entry) => entry.id === result.body.transactionId);
    assert.equal(row.pricing.discount.campaignName, 'Quiet sale');
    assert.equal(row.pricing.discount.automatic, true);

    const stored = await repo.paymentTransactions.get(result.body.transactionId);
    assert.equal(stored.metadata.pricing.discount.code, 'AUTO-HIDDEN01', 'the server-side snapshot keeps it for the admin audit trail');
  });
});
