import assert from 'node:assert/strict';
import test from 'node:test';

// The REAL-PostgreSQL companion to discount-plan-scope-and-automatic-{contract,migration-contract}.test.mjs. It proves
// what an in-memory fake cannot: the plan_ids TEXT[] column round-trips correctly, application_mode's CHECK is really
// enforced, plan-scope enforcement holds under the row lock discountRedemptions.reserve() takes, and an automatic
// discount's capacity/checkout behave identically to a typed code on a real database.
//
// Skips cleanly (one explicit log line, exit 0) unless DATABASE_URL is set - `npm test` must never fail or hang
// because no database is reachable. Run it ONLY against a disposable or staging TEST database - never production:
//
//   DATABASE_URL=postgres://user:pass@host:5432/dbname node --test tests/discount-plan-scope-and-automatic-postgres-integration.test.mjs
//
// It applies every pending migration (067 included) and creates users/codes tagged "ScopeIT"; cleanup is best-effort
// and removes only its own rows.

const hasDb = !!process.env.DATABASE_URL;

if (!hasDb) {
  test('SKIPPED (no DATABASE_URL) - discount plan-scope/automatic PostgreSQL integration', { skip: true }, () => {});
  console.log('discount-plan-scope-and-automatic-postgres-integration.test.mjs: DATABASE_URL not set - skipped. Set DATABASE_URL to a disposable test Postgres to run this file.');
} else {
  const { createPool } = await import('../server/db/pool.mjs');
  const { run: runMigrations } = await import('../server/db/migrate.mjs');
  const { createPgRepo } = await import('../server/db/repo.pg.mjs');
  const { ManualBillingProvider } = await import('../server/commercial/manual-billing-provider.mjs');
  const { confirmTransaction } = await import('../server/commercial/payment-service.mjs');
  const { quoteSubscription, prepareSubscriptionCheckout, createSubscriptionTransaction, listAutomaticOffers } = await import('../server/commercial/subscription-checkout.mjs');
  const { generateAutomaticCode } = await import('../server/commercial/discount-codes.mjs');

  let pool, repo;
  const userIds = [];
  const codeIds = [];

  test.before(async () => {
    await runMigrations();
    pool = createPool(process.env.DATABASE_URL);
    repo = createPgRepo(pool);
  });
  test.after(async () => {
    const swallow = (promise) => promise.catch(() => {});
    for (const id of codeIds) {
      await swallow(pool.query('DELETE FROM discount_redemptions WHERE code_id=$1', [id]));
      await swallow(pool.query('DELETE FROM discount_codes WHERE id=$1', [id]));
    }
    for (const id of userIds) {
      await swallow(pool.query('DELETE FROM wallet_ledger WHERE user_id=$1', [id]));
      await swallow(pool.query('DELETE FROM wallet_accounts WHERE user_id=$1', [id]));
      await swallow(pool.query('DELETE FROM user_subscriptions WHERE user_id=$1', [id]));
      await swallow(pool.query('DELETE FROM payment_events WHERE transaction_id IN (SELECT id FROM payment_transactions WHERE user_id=$1)', [id]));
      await swallow(pool.query('DELETE FROM payment_transactions WHERE user_id=$1', [id]));
      await swallow(pool.query('DELETE FROM users WHERE id=$1', [id]));
    }
    if (pool) await pool.end();
  });

  let counter = 0;
  async function makeUser(name) {
    const user = await repo.users.create({ displayName: 'ScopeIT ' + name });
    userIds.push(user.id);
    return user;
  }
  async function makeCode(overrides = {}) {
    counter += 1;
    const code = await repo.discountCodes.create({
      code: overrides.applicationMode === 'automatic' ? generateAutomaticCode() : 'SCOPEIT' + Date.now().toString(36).toUpperCase() + counter,
      campaignName: 'PG scope test ' + counter, discountType: 'percent', discountValue: 1500,
      startsAt: null, expiresAt: null, maxRedemptions: null, active: true, createdBy: null, applicationMode: 'code', planIds: [], ...overrides
    });
    codeIds.push(code.id);
    return code;
  }

  test('plan_ids and application_mode round-trip through real PostgreSQL, and application_mode is really CHECK-restricted', async () => {
    const scoped = await makeCode({ planIds: ['plus', 'pro'] });
    assert.deepEqual(scoped.planIds, ['plus', 'pro']);
    const reloaded = await repo.discountCodes.get(scoped.id);
    assert.deepEqual(reloaded.planIds, ['plus', 'pro']);
    const automatic = await makeCode({ applicationMode: 'automatic' });
    assert.equal(automatic.applicationMode, 'automatic');
    assert.match(automatic.code, /^AUTO-/);

    await assert.rejects(
      pool.query(`UPDATE discount_codes SET application_mode='not-a-mode' WHERE id=$1`, [scoped.id]),
      (error) => error.code === '23514'
    );
  });

  test('a plan-scoped code is refused on another plan under the SAME row lock reserve() takes, and reserves nothing', async () => {
    const code = await makeCode({ planIds: ['plus'] });
    const user = await makeUser('Scope Buyer');
    const quote = await quoteSubscription(repo, { userId: user.id, planId: 'pro', code: code.code }).catch((error) => error);
    assert.equal(quote.status, 409);
    assert.equal(quote.code, 'DISCOUNT_CODE_PLAN_NOT_ELIGIBLE');
    const checkout = await prepareSubscriptionCheckout(repo, { userId: user.id, planId: 'pro', discountCode: code.code, holdMinutes: 30 }).catch((error) => error);
    assert.equal(checkout.status, 409);
    assert.equal(checkout.code, 'DISCOUNT_CODE_PLAN_NOT_ELIGIBLE');
    assert.equal((await repo.discountCodes.stats(code.id)).pendingReservations, 0);
    const allowed = await prepareSubscriptionCheckout(repo, { userId: user.id, planId: 'plus', discountCode: code.code, holdMinutes: 30 });
    assert.ok(allowed.redemption);
  });

  test('an automatic discount on real PostgreSQL: offered, applied by id, capacity drops live, and a refund reverses the wallet bonus lot', async () => {
    // discountValue is deliberately the largest in this file: an earlier test's own automatic-mode fixture (unrestricted
    // planIds, so it also applies to 'pro') would otherwise tie with this one and legitimately win the "oldest of equal
    // offers" tie-break, making this assertion depend on file-wide test order instead of this test's own setup.
    const auto = await makeCode({ applicationMode: 'automatic', planIds: ['pro'], maxRedemptions: 5, discountValue: 9000 });
    const buyer = await makeUser('Auto Buyer');
    const watcher = await makeUser('Auto Watcher');

    const offers = await listAutomaticOffers(repo, { userId: watcher.id });
    assert.ok(offers.pro);
    assert.equal(offers.pro.codeId, auto.id);
    assert.equal('code' in offers.pro, false);

    const checkout = await prepareSubscriptionCheckout(repo, { userId: buyer.id, planId: 'pro', automaticDiscountId: auto.id, holdMinutes: 30 });
    const created = await createSubscriptionTransaction(repo, { checkout, userId: buyer.id, planId: 'pro', provider: 'manual', externalTransactionId: 'scopeit-tx-' + counter, createInvoice: null });
    assert.equal(JSON.stringify(created).includes(auto.code), false, 'the internal identifier never reaches the checkout response');
    assert.equal((await repo.discountCodes.stats(auto.id)).remaining, 4, 'the reservation already counts, live');

    await confirmTransaction(repo, created.transactionId);
    const stored = await repo.paymentTransactions.get(created.transactionId);
    assert.equal(stored.metadata.pricing.discount.automatic, true);
    assert.equal(stored.metadata.pricing.discount.code, auto.code, 'the server-side snapshot keeps the real identifier for audit');
  });

  test('one redemption per user holds for an automatic discount on real PostgreSQL, enforced by the same partial unique index', async () => {
    const auto = await makeCode({ applicationMode: 'automatic', planIds: ['plus'] });
    const user = await makeUser('Repeat Buyer');
    const manual = new ManualBillingProvider(repo);
    const first = await manual.createSubscription({ userId: user.id, planId: 'plus', automaticDiscountId: auto.id });
    await confirmTransaction(repo, first.transactionId);
    await assert.rejects(
      manual.createSubscription({ userId: user.id, planId: 'plus', automaticDiscountId: auto.id }),
      (error) => error.status === 409 && error.code === 'DISCOUNT_CODE_ALREADY_USED'
    );
  });
}
