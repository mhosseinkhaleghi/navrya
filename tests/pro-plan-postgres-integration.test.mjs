import assert from 'node:assert/strict';
import test from 'node:test';

// The REAL-PostgreSQL companion to pro-plan-check-migration-contract.test.mjs. It proves what the in-memory
// repository cannot: that a confirmed Pro subscription purchase actually activates on a real, fully-migrated
// PostgreSQL database, and that an admin can assign the Pro plan directly - both were blocked before migration 066
// widened the users.plan and user_subscriptions.plan_id CHECKs (a CHECK the memory repository never enforces).
//
// Skips cleanly (one explicit log line, exit 0) unless DATABASE_URL is set - `npm test` must never fail or hang
// because no database is reachable. Run it ONLY against a disposable or staging TEST database - never production:
//
//   DATABASE_URL=postgres://user:pass@host:5432/dbname node --test tests/pro-plan-postgres-integration.test.mjs
//
// It applies every pending migration (066 included) and creates users named "ProPlanIT ..."; cleanup is best-effort
// and removes only the rows of those users.

const hasDb = !!process.env.DATABASE_URL;

if (!hasDb) {
  test('SKIPPED (no DATABASE_URL) - Pro plan PostgreSQL integration', { skip: true }, () => {});
  console.log('pro-plan-postgres-integration.test.mjs: DATABASE_URL not set - skipped. Set DATABASE_URL to a real Postgres instance to run this file.');
} else {
  const { createPool } = await import('../server/db/pool.mjs');
  const { run: runMigrations } = await import('../server/db/migrate.mjs');
  const { createPgRepo } = await import('../server/db/repo.pg.mjs');
  const { confirmTransaction } = await import('../server/commercial/payment-service.mjs');
  const { resolveUserEntitlements } = await import('../server/commercial/entitlement-resolver.mjs');
  const { ManualBillingProvider } = await import('../server/commercial/manual-billing-provider.mjs');

  let pool, repo;
  const userIds = [];

  test.before(async () => {
    await runMigrations();
    pool = createPool(process.env.DATABASE_URL);
    repo = createPgRepo(pool);
  });
  test.after(async () => {
    // Best-effort cleanup, scoped strictly to the fixture users - never touches other data.
    const swallow = (promise) => promise.catch(() => {});
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

  async function makeUser(name) {
    const user = await repo.users.create({ displayName: 'ProPlanIT ' + name });
    userIds.push(user.id);
    return user;
  }

  test('migration 066 is applied: both CHECKs accept pro on the live database', async () => {
    const { rows: usersConstraint } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='users'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%plan%'`
    );
    assert.ok(usersConstraint.some((row) => /'pro'/.test(row.def)), 'users.plan CHECK must allow pro: ' + JSON.stringify(usersConstraint));
    const { rows: subsConstraint } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='user_subscriptions'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%plan_id%'`
    );
    assert.ok(subsConstraint.some((row) => /'pro'/.test(row.def)), 'user_subscriptions.plan_id CHECK must allow pro: ' + JSON.stringify(subsConstraint));
  });

  test('the database itself would have rejected pro before 066 (control): the widened CHECK genuinely permits a value the old one did not', async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='users'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%plan%'`
    );
    const def = rows[0].def;
    assert.match(def, /'free'/); assert.match(def, /'plus'/); assert.match(def, /'personalized'/);
    assert.match(def, /'pro'/, 'the live CHECK must literally include pro, not merely omit an exclusion');
  });

  test('a real user record can be assigned plan=pro directly (admin "assign plan" path)', async () => {
    const user = await makeUser('Assign');
    const updated = await repo.users.update(user.id, { plan: 'pro' });
    assert.equal(updated.plan, 'pro');
    const reloaded = await repo.users.get(user.id);
    assert.equal(reloaded.plan, 'pro');
  });

  test('a confirmed Pro subscription purchase activates end to end on real PostgreSQL: transaction confirms, user_subscriptions gets plan_id=pro, entitlements resolve to pro', async () => {
    const user = await makeUser('Purchase');
    const manual = new ManualBillingProvider(repo);
    const checkout = await manual.createSubscription({ userId: user.id, planId: 'pro' });
    assert.equal(checkout.status, 'pending');

    const result = await confirmTransaction(repo, checkout.transactionId);
    assert.equal(result.alreadyProcessed, false);
    assert.equal(result.transaction.status, 'confirmed');

    const subscription = await repo.subscriptions.getActiveForUser(user.id);
    assert.ok(subscription, 'an active subscription row must exist');
    assert.equal(subscription.planId, 'pro');
    assert.equal(subscription.status, 'active');
    assert.equal(subscription.paymentTransactionId, checkout.transactionId);

    const entitlements = await resolveUserEntitlements(user.id, repo);
    assert.equal(entitlements.plan, 'pro');
  });

  test('renewing an existing Pro subscription (same plan, second purchase) updates the row in place without a CHECK violation', async () => {
    const user = await makeUser('Renew');
    const manual = new ManualBillingProvider(repo);
    const first = await manual.createSubscription({ userId: user.id, planId: 'pro' });
    await confirmTransaction(repo, first.transactionId);
    const originalSubscriptionId = (await repo.subscriptions.getActiveForUser(user.id)).id;

    const second = await manual.createSubscription({ userId: user.id, planId: 'pro' });
    await confirmTransaction(repo, second.transactionId);
    const renewed = await repo.subscriptions.getActiveForUser(user.id);
    assert.equal(renewed.id, originalSubscriptionId, 'renewal updates the SAME row rather than creating a second one');
    assert.equal(renewed.planId, 'pro');
    assert.equal(renewed.paymentTransactionId, second.transactionId);
  });

  test('refunding a Pro subscription reverts entitlements to free, without a CHECK violation on the way down', async () => {
    const user = await makeUser('Refund');
    const manual = new ManualBillingProvider(repo);
    const checkout = await manual.createSubscription({ userId: user.id, planId: 'pro' });
    await confirmTransaction(repo, checkout.transactionId);
    assert.equal((await resolveUserEntitlements(user.id, repo)).plan, 'pro');

    const refundRequest = await manual.refund({ transactionId: checkout.transactionId });
    await confirmTransaction(repo, refundRequest.transactionId, { adminUserId: null });
    assert.equal(await repo.subscriptions.getActiveForUser(user.id), null);
    assert.equal((await resolveUserEntitlements(user.id, repo)).plan, 'free');
  });

  test('an invalid plan value is still rejected by the database (the CHECK was widened, not removed)', async () => {
    await assert.rejects(
      pool.query(`INSERT INTO users (id, display_name, plan) VALUES ('propl-it-bogus-user', 'Bogus', 'not-a-real-plan')`),
      (error) => error.code === '23514'
    );
    await assert.rejects(
      pool.query(`UPDATE users SET plan='not-a-real-plan' WHERE id=$1`, [(await makeUser('Guard')).id]),
      (error) => error.code === '23514'
    );
  });
}
