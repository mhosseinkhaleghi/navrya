import assert from 'node:assert/strict';
import test from 'node:test';

// The OPTIONAL real-PostgreSQL companion to discount-codes-repo-memory.test.mjs and
// discount-codes-migration-contract.test.mjs. It proves the properties an in-memory fake CANNOT:
// row-lock serialization under real concurrent connections, database-enforced uniqueness, the
// database clock, and the widened wallet_ledger CHECK.
//
// Skips cleanly (one explicit log line, exit 0) unless DATABASE_URL is set - `npm test` must never
// fail or hang because no database is reachable. To run it against a real, disposable database:
//
//   DATABASE_URL=postgres://user:pass@host:5432/dbname node --test tests/discount-codes-postgres-integration.test.mjs
//
// HONEST STATUS: this file has never been executed in the authoring sandbox (no Postgres, no
// DATABASE_URL). It must be run against a real database before this feature is promoted.

const hasDb = !!process.env.DATABASE_URL;

if (!hasDb) {
  test('SKIPPED (no DATABASE_URL) - discount codes PostgreSQL integration', { skip: true }, () => {});
  console.log('discount-codes-postgres-integration.test.mjs: DATABASE_URL not set - skipped. Set DATABASE_URL to a real Postgres instance to run this file.');
} else {
  const { createPool } = await import('../server/db/pool.mjs');
  const { run: runMigrations } = await import('../server/db/migrate.mjs');
  const { createPgRepo } = await import('../server/db/repo.pg.mjs');

  let pool, repo;
  const userIds = [];
  const codeIds = [];
  const iso = (ms) => new Date(ms).toISOString();
  const PRO_MICRO = 14_990_000;

  test.before(async () => {
    await runMigrations();
    pool = createPool(process.env.DATABASE_URL);
    repo = createPgRepo(pool);
  });
  test.after(async () => {
    // Best-effort cleanup - never leaves fixtures behind in a shared database.
    for (const id of codeIds) await pool.query('DELETE FROM discount_redemptions WHERE code_id=$1', [id]).catch(() => {});
    for (const id of codeIds) await pool.query('DELETE FROM discount_codes WHERE id=$1', [id]).catch(() => {});
    for (const id of userIds) await pool.query('DELETE FROM wallet_ledger WHERE user_id=$1', [id]).catch(() => {});
    for (const id of userIds) await pool.query('DELETE FROM wallet_accounts WHERE user_id=$1', [id]).catch(() => {});
    for (const id of userIds) await pool.query('DELETE FROM users WHERE id=$1', [id]).catch(() => {});
    await pool.end();
  });

  let counter = 0;
  async function makeUser(name) {
    const user = await repo.users.create({ displayName: name });
    userIds.push(user.id);
    return user;
  }
  async function makeCode(overrides = {}) {
    counter += 1;
    const code = await repo.discountCodes.create({
      code: 'PGIT' + Date.now().toString(36).toUpperCase() + counter, campaignName: 'PG integration', discountType: 'percent', discountValue: 1500,
      startsAt: null, expiresAt: null, maxRedemptions: null, active: true, createdBy: null, ...overrides
    });
    codeIds.push(code.id);
    return code;
  }
  const reserve = (codeId, userId, holdMs = 10 * 60 * 1000) => repo.discountRedemptions.reserve({
    codeId, userId, planId: 'pro', originalAmountMicroUsd: PRO_MICRO, reservedUntil: iso(Date.now() + holdMs)
  });

  test('migration 064 has been applied: both tables exist and wallet_ledger accepts the new types but still rejects unknown ones', async () => {
    for (const table of ['discount_codes', 'discount_redemptions']) {
      const { rows } = await pool.query('SELECT 1 FROM information_schema.tables WHERE table_name=$1', [table]);
      assert.equal(rows.length, 1, table + ' must exist');
    }
    const user = await makeUser('PG Ledger User');
    const granted = await repo.wallet.grant(user.id, { type: 'SUBSCRIPTION_BONUS', promoDeltaMicroUsd: 1_000_000, idempotencyKey: 'pg-it-bonus:' + user.id, sourceAction: 'subscription-bonus' });
    assert.equal(granted.ok, true);
    await repo.wallet.grant(user.id, { type: 'SUBSCRIPTION_BONUS_REVERSAL', promoDeltaMicroUsd: -1_000_000, idempotencyKey: 'pg-it-reversal:' + user.id, sourceAction: 'subscription-refund' });
    await assert.rejects(
      pool.query(`INSERT INTO wallet_ledger (id, user_id, type, idempotency_key) VALUES ($1,$2,'BOGUS_TYPE',$3)`, ['pg-it-bogus-' + user.id, user.id, 'pg-it-bogus:' + user.id]),
      (error) => error.code === '23514'
    );
    const duplicate = await repo.wallet.grant(user.id, { type: 'SUBSCRIPTION_BONUS', promoDeltaMicroUsd: 1_000_000, idempotencyKey: 'pg-it-bonus:' + user.id });
    assert.equal(duplicate.duplicate, true, 'the ledger idempotency key is UNIQUE in the database');
    const found = await repo.wallet.ledgerEntriesByIdempotencyKeys(['pg-it-bonus:' + user.id, 'pg-it-reversal:' + user.id, 'nope']);
    assert.equal(found.length, 2);
  });

  test('the code string is unique at the database level', async () => {
    const code = await makeCode();
    await assert.rejects(repo.discountCodes.create({ ...code, id: undefined, createdBy: null }), (error) => error.code === 'DISCOUNT_CODE_EXISTS' && error.status === 409);
  });

  test('50 users racing over real connections for a 30-user code yield exactly 30 reservations', async () => {
    const code = await makeCode({ maxRedemptions: 30 });
    const users = await Promise.all(Array.from({ length: 50 }, (_, i) => makeUser('PG Racer ' + i)));
    const results = await Promise.allSettled(users.map((user) => reserve(code.id, user.id)));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 30);
    results.filter((r) => r.status === 'rejected').forEach((r) => assert.equal(r.reason.code, 'DISCOUNT_CODE_EXHAUSTED'));
    const stats = await repo.discountCodes.stats(code.id);
    assert.equal(stats.pendingReservations, 30);
    assert.equal(stats.remaining, 0);
  });

  test('one user firing 10 parallel reservations gets exactly one (partial unique index + row lock)', async () => {
    const code = await makeCode({ maxRedemptions: 5 });
    const user = await makeUser('PG Double Clicker');
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => reserve(code.id, user.id)));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    results.filter((r) => r.status === 'rejected').forEach((r) => assert.ok(['DISCOUNT_CODE_RESERVATION_PENDING', 'DISCOUNT_CODE_ALREADY_USED'].includes(r.reason.code)));
  });

  test('the database enforces one LIVE redemption per (code, user) even when the application logic is bypassed', async () => {
    const code = await makeCode({ maxRedemptions: null });
    const user = await makeUser('PG Bypass User');
    const first = await reserve(code.id, user.id);
    const insert = (id, status) => pool.query(
      `INSERT INTO discount_redemptions (id, code_id, user_id, status, plan_id, code_snapshot, campaign_name_snapshot, discount_type_snapshot, discount_value_snapshot,
         original_amount_micro_usd, discount_amount_micro_usd, final_amount_micro_usd, reserved_until)
       VALUES ($1,$2,$3,$4,'pro','X','X','percent',1500,1,0,1, now() + interval '1 hour')`, [id, code.id, user.id, status]);
    await assert.rejects(insert('pg-it-dup-' + first.id, 'reserved'), (error) => error.code === '23505');
    await repo.discountRedemptions.releaseForTransaction('unused', 'x'); // no-op on an unknown transaction
    await pool.query(`UPDATE discount_redemptions SET status='released' WHERE id=$1`, [first.id]);
    await insert('pg-it-after-release-' + first.id, 'reserved'); // allowed: the first row is no longer live
  });

  test('a lapsed hold (database clock) frees the slot; a late confirmation re-claims it, or is refused with DISCOUNT_CAPACITY_LOST when the slot was reused', async () => {
    const code = await makeCode({ maxRedemptions: 1 });
    const [a, b] = await Promise.all([makeUser('PG Late'), makeUser('PG Early')]);
    const lapsed = await repo.discountRedemptions.reserve({ codeId: code.id, userId: a.id, planId: 'pro', originalAmountMicroUsd: PRO_MICRO, reservedUntil: iso(Date.now() - 60_000) });
    const txA = await repo.paymentTransactions.create({ userId: a.id, type: 'subscription', provider: 'manual', amountMicroUsd: lapsed.finalAmountMicroUsd, productId: 'pro', metadata: { planId: 'pro' } });
    await repo.discountRedemptions.attachTransaction(lapsed.id, txA.id);
    assert.equal((await repo.discountCodes.stats(code.id)).pendingReservations, 0, 'a lapsed hold does not count');

    const reused = await reserve(code.id, b.id);
    const txB = await repo.paymentTransactions.create({ userId: b.id, type: 'subscription', provider: 'manual', amountMicroUsd: reused.finalAmountMicroUsd, productId: 'pro', metadata: { planId: 'pro' } });
    await repo.discountRedemptions.attachTransaction(reused.id, txB.id);
    assert.equal((await repo.discountRedemptions.confirmForTransaction(txB.id)).ok, true);

    const late = await repo.discountRedemptions.confirmForTransaction(txA.id);
    assert.equal(late.ok, false);
    assert.equal(late.reason, 'DISCOUNT_CAPACITY_LOST');
    assert.equal((await repo.discountCodes.stats(code.id)).confirmed, 1, 'the cap was never exceeded');
  });

  test('confirm and release are idempotent, and lowering capacity below usage is refused under the row lock', async () => {
    const code = await makeCode({ maxRedemptions: 3 });
    const [a, b] = await Promise.all([makeUser('PG Confirm A'), makeUser('PG Confirm B')]);
    const one = await reserve(code.id, a.id);
    const two = await reserve(code.id, b.id);
    const txA = await repo.paymentTransactions.create({ userId: a.id, type: 'subscription', provider: 'manual', amountMicroUsd: one.finalAmountMicroUsd, productId: 'pro', metadata: { planId: 'pro' } });
    await repo.discountRedemptions.attachTransaction(one.id, txA.id);
    assert.equal((await repo.discountRedemptions.confirmForTransaction(txA.id)).ok, true);
    assert.equal((await repo.discountRedemptions.confirmForTransaction(txA.id)).ok, true);
    assert.equal((await repo.discountCodes.stats(code.id)).confirmed, 1);
    assert.ok(two.id);

    await assert.rejects(repo.discountCodes.update(code.id, { maxRedemptions: 1 }), (error) => error.code === 'DISCOUNT_CAPACITY_BELOW_USED' && error.status === 409);
    assert.equal((await repo.discountCodes.update(code.id, { maxRedemptions: 2 })).maxRedemptions, 2);
  });
}
