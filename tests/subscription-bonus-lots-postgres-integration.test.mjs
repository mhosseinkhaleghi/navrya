import assert from 'node:assert/strict';
import test from 'node:test';

// The REAL-PostgreSQL companion to subscription-bonus-lots.test.mjs and subscription-bonus-lots-migration-contract.test.mjs.
// It proves what an in-memory fake cannot: row-lock serialisation between AI settlement, refund and repair under real
// concurrent connections, the atomicity of lot consumption with the ledger write, the CHECK constraints and the
// immutability trigger of migration 065, and that the SAME independent model that validates the memory repository also
// validates the PostgreSQL one.
//
// Skips cleanly (one explicit log line, exit 0) unless DATABASE_URL is set - `npm test` must never fail or hang because no
// database is reachable. Run it ONLY against a disposable or staging TEST database - never production data:
//
//   DATABASE_URL=postgres://user:pass@host:5432/dbname node --test tests/subscription-bonus-lots-postgres-integration.test.mjs
//
// It applies the pending migrations (065 included) and creates users named "LotIT ..."; cleanup is best-effort and removes
// only the rows of those users (it never touches other data and never writes global commercial configuration).

const hasDb = !!process.env.DATABASE_URL;

if (!hasDb) {
  test('SKIPPED (no DATABASE_URL) - subscription bonus lots PostgreSQL integration', { skip: true }, () => {});
  console.log('subscription-bonus-lots-postgres-integration.test.mjs: DATABASE_URL not set - skipped. Set DATABASE_URL to a disposable test Postgres to run this file.');
} else {
  const { createPool } = await import('../server/db/pool.mjs');
  const { run: runMigrations } = await import('../server/db/migrate.mjs');
  const { createPgRepo } = await import('../server/db/repo.pg.mjs');
  const { repairSubscriptionBonus } = await import('../server/commercial/subscription-bonus.mjs');
  const fixtures = await import('./helpers/bonus-lot-fixtures.mjs');
  const { M, freshUser, balances, buyBonus, buyBonusWithoutGrant, reserveAi, settleAi, spendAi, refundPurchase, lotFor, allocationsFor, assertLotInvariants, runModelScenario } = fixtures;

  let pool, repo;
  const users = [];
  const track = (user) => users.push(user.id);
  const newUser = (name, options) => freshUser(repo, 'LotIT ' + name, { ...options, track });

  test.before(async () => {
    await runMigrations();
    pool = createPool(process.env.DATABASE_URL);
    repo = createPgRepo(pool);
  });

  test.after(async () => {
    // Best-effort, scoped strictly to the fixture users. The allocation immutability trigger is switched off for exactly
    // this cleanup (table owner only) and switched back on in a finally block.
    const swallow = (promise) => promise.catch(() => {});
    if (pool && users.length) {
      try {
        await swallow(pool.query('ALTER TABLE subscription_bonus_allocations DISABLE TRIGGER subscription_bonus_allocations_immutable'));
        for (const id of users) {
          await swallow(pool.query('DELETE FROM subscription_bonus_allocations WHERE user_id=$1', [id]));
          await swallow(pool.query('DELETE FROM subscription_bonus_lots WHERE user_id=$1', [id]));
          await swallow(pool.query('DELETE FROM wallet_ledger WHERE user_id=$1', [id]));
          await swallow(pool.query('DELETE FROM wallet_reservations WHERE user_id=$1', [id]));
          await swallow(pool.query('DELETE FROM wallet_accounts WHERE user_id=$1', [id]));
          await swallow(pool.query('DELETE FROM payment_events WHERE transaction_id IN (SELECT id FROM payment_transactions WHERE user_id=$1)', [id]));
          await swallow(pool.query('DELETE FROM user_subscriptions WHERE user_id=$1', [id]));
          await swallow(pool.query('DELETE FROM payment_transactions WHERE user_id=$1', [id]));
          await swallow(pool.query('DELETE FROM users WHERE id=$1', [id]));
        }
      } finally {
        await swallow(pool.query('ALTER TABLE subscription_bonus_allocations ENABLE TRIGGER subscription_bonus_allocations_immutable'));
      }
    }
    if (pool) await pool.end();
  });

  const BONUS = M(5);

  test('migration 065 is applied: both tables, the CHECKs and the immutability trigger exist', async () => {
    for (const table of ['subscription_bonus_lots', 'subscription_bonus_allocations']) {
      const { rows } = await pool.query('SELECT 1 FROM information_schema.tables WHERE table_name=$1', [table]);
      assert.equal(rows.length, 1, table + ' must exist');
    }
    const { rows: triggers } = await pool.query(`SELECT 1 FROM pg_trigger WHERE tgname='subscription_bonus_allocations_immutable' AND NOT tgisinternal`);
    assert.equal(triggers.length, 1, 'the allocation immutability trigger exists');
  });

  test('the database itself rejects an over-consumed lot, a non-positive allocation and an allocation UPDATE / DELETE', async () => {
    const user = await newUser('Constraints', { paidMicroUsd: M(10) });
    const txId = await buyBonus(repo, user.id, BONUS);
    await spendAi(repo, user.id, M(1));
    const lot = await lotFor(repo, txId);
    const [allocation] = await allocationsFor(repo, user.id, lot.id);

    await assert.rejects(pool.query('UPDATE subscription_bonus_lots SET consumed_micro_usd = original_micro_usd + 1 WHERE id=$1', [lot.id]), (error) => error.code === '23514', 'consumed + reversed <= original');
    await assert.rejects(pool.query('UPDATE subscription_bonus_lots SET status=$2 WHERE id=$1', [lot.id, 'reversed']), (error) => error.code === '23514', 'reversed status requires the reversal ledger link');
    await assert.rejects(pool.query('UPDATE subscription_bonus_allocations SET amount_micro_usd = 1 WHERE id=$1', [allocation.id]), (error) => Boolean(error), 'allocations cannot be edited');
    await assert.rejects(pool.query('DELETE FROM subscription_bonus_allocations WHERE id=$1', [allocation.id]), (error) => Boolean(error), 'allocations cannot be deleted');
    await assert.rejects(
      pool.query('INSERT INTO subscription_bonus_allocations (id, lot_id, ledger_id, user_id, amount_micro_usd) VALUES ($1,$2,$3,$4,0)', ['lotit-zero-' + lot.id, lot.id, allocation.ledgerId, user.id]),
      (error) => error.code === '23514' || error.code === '23505', 'a zero amount (or a repeat of the same lot+settlement pair) is refused'
    );
    await assertLotInvariants(repo, user.id, txId);
  });

  test('grant writes lot + ledger + balance atomically, once; a repeated or post-refund grant changes nothing', async () => {
    const user = await newUser('Grant', { paidMicroUsd: M(10) });
    const txId = await buyBonus(repo, user.id, BONUS);
    const lot = await assertLotInvariants(repo, user.id, txId);
    assert.equal(lot.status, 'active');
    assert.deepEqual(await balances(repo, user.id), { paid: M(10), promo: BONUS });
    const duplicate = await repo.subscriptionBonus.grant({ userId: user.id, transactionId: txId, amountMicroUsd: BONUS, planId: 'plus' });
    assert.equal(duplicate.duplicate, true);
    assert.deepEqual(await balances(repo, user.id), { paid: M(10), promo: BONUS });

    const refunded = await buyBonusWithoutGrant(repo, user.id, BONUS);
    await refundPurchase(repo, refunded);
    const refused = await repo.subscriptionBonus.grant({ userId: user.id, transactionId: refunded, amountMicroUsd: BONUS, planId: 'plus' });
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'REFUNDED');
    assert.equal(await repo.subscriptionBonus.getByTransactionId(refunded), null);
    assert.deepEqual(await balances(repo, user.id), { paid: M(10), promo: BONUS });
  });

  test('the business rule end to end on PostgreSQL: $5 bonus, $2.30 spent, refund reverses exactly $2.70; fully spent reverses zero', async () => {
    const partial = await newUser('Partial', { paidMicroUsd: M(10), promoMicroUsd: M(3) });
    const partialTx = await buyBonus(repo, partial.id, BONUS);
    await spendAi(repo, partial.id, M(2.3));
    await refundPurchase(repo, partialTx);
    const lot = await assertLotInvariants(repo, partial.id, partialTx);
    assert.deepEqual([lot.consumedMicroUsd, lot.reversedMicroUsd, lot.status], [M(2.3), M(2.7), 'reversed']);
    assert.deepEqual(await balances(repo, partial.id), { paid: M(10), promo: M(3) }, 'the admin promo is untouched');

    const spent = await newUser('Spent', { paidMicroUsd: M(10) });
    const spentTx = await buyBonus(repo, spent.id, BONUS);
    await spendAi(repo, spent.id, BONUS);
    await refundPurchase(repo, spentTx);
    const spentLot = await assertLotInvariants(repo, spent.id, spentTx);
    assert.deepEqual([spentLot.consumedMicroUsd, spentLot.reversedMicroUsd, spentLot.status], [BONUS, 0, 'reversed']);
    assert.deepEqual(await balances(repo, spent.id), { paid: M(10), promo: 0 }, 'no negative promo, paid untouched');
  });

  test('a settlement whose ledger insert fails rolls back its lot consumption and allocations too (atomicity)', async () => {
    const user = await newUser('Atomic', { paidMicroUsd: M(10) });
    const txId = await buyBonus(repo, user.id, BONUS);
    const reservationId = await reserveAi(repo, user.id, M(1));
    // Another ledger row already owns the idempotency key this settlement will use -> its INSERT hits the unique index.
    await repo.wallet.grant(user.id, { type: 'ADMIN_CREDIT', promoDeltaMicroUsd: 0, idempotencyKey: 'ai-settle:' + reservationId, sourceAction: 'lotit-collision' });
    const before = await balances(repo, user.id);
    const result = await settleAi(repo, reservationId, M(1));
    assert.equal(result.alreadySettled, true);
    assert.deepEqual(await balances(repo, user.id), before, 'no balance movement');
    const lot = await assertLotInvariants(repo, user.id, txId);
    assert.equal(lot.consumedMicroUsd, 0, 'the lot was not consumed');
    assert.deepEqual(await allocationsFor(repo, user.id, lot.id), [], 'and no allocation survived');
  });

  test('concurrent duplicate settlements of ONE reservation allocate exactly once', async () => {
    const user = await newUser('Dup Settle', { paidMicroUsd: M(10) });
    const txId = await buyBonus(repo, user.id, BONUS);
    const reservationId = await reserveAi(repo, user.id, M(2));
    const results = await Promise.all(Array.from({ length: 6 }, () => settleAi(repo, reservationId, M(2))));
    results.forEach((result) => assert.equal(result.ok, true));
    const lot = await assertLotInvariants(repo, user.id, txId);
    assert.equal(lot.consumedMicroUsd, M(2));
    assert.equal((await allocationsFor(repo, user.id, lot.id)).length, 1);
    assert.equal((await balances(repo, user.id)).promo, M(3));
  });

  test('concurrent settlements across several connections never consume more than the lot holds', async () => {
    const user = await newUser('Concurrent Spend', { paidMicroUsd: M(20) });
    const txId = await buyBonus(repo, user.id, BONUS);
    const reservations = [];
    for (let i = 0; i < 8; i += 1) reservations.push(await reserveAi(repo, user.id, M(1)));
    await Promise.all(reservations.map((id) => settleAi(repo, id, M(1))));
    const lot = await assertLotInvariants(repo, user.id, txId);
    assert.equal(lot.consumedMicroUsd, BONUS, 'exactly the whole lot');
    assert.deepEqual(await balances(repo, user.id), { paid: M(20) - M(3), promo: 0 });
  });

  test('a settlement racing a refund on real connections preserves every invariant, 25 times', async () => {
    for (let round = 0; round < 25; round += 1) {
      const user = await newUser('Race ' + round, { paidMicroUsd: M(10) });
      const txId = await buyBonus(repo, user.id, BONUS);
      const reservationId = await reserveAi(repo, user.id, M(2));
      await Promise.all([settleAi(repo, reservationId, M(2)), refundPurchase(repo, txId)]);
      const lot = await assertLotInvariants(repo, user.id, txId);
      const { paid, promo } = await balances(repo, user.id);
      assert.equal(lot.status, 'reversed');
      assert.equal(lot.consumedMicroUsd + lot.reversedMicroUsd, BONUS);
      assert.equal(promo, 0, 'never negative');
      assert.equal(paid, M(10) - (M(2) - lot.consumedMicroUsd));
    }
  });

  test('concurrent repairs credit once; a repair racing a refund never leaves a granted-but-unreversed bonus, 25 times', async () => {
    const user = await newUser('Repair', { paidMicroUsd: M(10) });
    const txId = await buyBonusWithoutGrant(repo, user.id, BONUS);
    const results = await Promise.all(Array.from({ length: 6 }, () => repairSubscriptionBonus(repo, txId)));
    assert.equal(results.filter((result) => result.repaired).length, 1);
    await assertLotInvariants(repo, user.id, txId);
    assert.equal((await balances(repo, user.id)).promo, BONUS);

    for (let round = 0; round < 25; round += 1) {
      const racer = await newUser('Repair Race ' + round, { paidMicroUsd: M(10) });
      const raceTx = await buyBonusWithoutGrant(repo, racer.id, BONUS);
      const [repair, refund] = await Promise.allSettled([repairSubscriptionBonus(repo, raceTx), refundPurchase(repo, raceTx)]);
      assert.equal(refund.status, 'fulfilled');
      if (repair.status === 'rejected') assert.equal(repair.reason.code, 'BONUS_REPAIR_NOT_APPLICABLE');
      const lot = await repo.subscriptionBonus.getByTransactionId(raceTx);
      if (lot) { await assertLotInvariants(repo, racer.id, raceTx); assert.equal(lot.status, 'reversed'); }
      assert.deepEqual(await balances(repo, racer.id), { paid: M(10), promo: 0 }, 'the user never keeps a bonus for a refunded purchase');
    }
  });

  // ---- lock order, proven deterministically: a second connection HOLDS a row lock and the operation must wait for it ----
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function assertWaitsForLock({ lockSql, lockParams, operation, label }) {
    const holder = await pool.connect();
    let finished = false;
    let pending;
    try {
      await holder.query('BEGIN');
      await holder.query(lockSql, lockParams);
      pending = operation().then((value) => { finished = true; return value; }, (error) => { finished = true; throw error; });
      await sleep(600);
      assert.equal(finished, false, label + ' must wait for the row lock held by another connection');
    } finally {
      await holder.query('COMMIT').catch(() => {});
      holder.release();
    }
    return pending;
  }

  test('LOCK ORDER: a refund reversal waits for the wallet account row lock, then reverses exactly the remainder', async () => {
    const user = await newUser('Lock Reverse', { paidMicroUsd: M(10) });
    const txId = await buyBonus(repo, user.id, BONUS);
    await spendAi(repo, user.id, M(1));
    const result = await assertWaitsForLock({
      lockSql: 'SELECT 1 FROM wallet_accounts WHERE user_id=$1 FOR UPDATE', lockParams: [user.id], label: 'reverseForRefund',
      operation: () => repo.subscriptionBonus.reverseForRefund({ transactionId: txId, refundTransactionId: null, adminUserId: null })
    });
    assert.equal(result.reversed, true);
    assert.equal(result.reversedMicroUsd, M(4));
    await assertLotInvariants(repo, user.id, txId);
  });

  test('LOCK ORDER: a bonus grant (repair) waits for the wallet account row lock', async () => {
    const user = await newUser('Lock Grant', { paidMicroUsd: M(10) });
    const txId = await buyBonusWithoutGrant(repo, user.id, BONUS);
    const result = await assertWaitsForLock({
      lockSql: 'SELECT 1 FROM wallet_accounts WHERE user_id=$1 FOR UPDATE', lockParams: [user.id], label: 'subscriptionBonus.grant',
      operation: () => repo.subscriptionBonus.grant({ userId: user.id, transactionId: txId, amountMicroUsd: BONUS, planId: 'plus' })
    });
    assert.equal(result.granted, true);
    await assertLotInvariants(repo, user.id, txId);
  });

  test('LOCK ORDER: an AI settlement waits for the lot row lock and then consumes the lot', async () => {
    const user = await newUser('Lock Settle', { paidMicroUsd: M(10) });
    const txId = await buyBonus(repo, user.id, BONUS);
    const reservationId = await reserveAi(repo, user.id, M(2));
    const result = await assertWaitsForLock({
      lockSql: 'SELECT 1 FROM subscription_bonus_lots WHERE transaction_id=$1 FOR UPDATE', lockParams: [txId], label: 'wallet.settle',
      operation: () => settleAi(repo, reservationId, M(2))
    });
    assert.equal(result.subscriptionBonusUsedMicroUsd, M(2));
    assert.equal((await assertLotInvariants(repo, user.id, txId)).consumedMicroUsd, M(2));
  });

  test('LOCK ORDER: a repair queued behind the account lock re-checks for a refund AFTER it gets the lock, and refuses (writes nothing)', async () => {
    const user = await newUser('Lock Repair Refund', { paidMicroUsd: M(10) });
    const txId = await buyBonusWithoutGrant(repo, user.id, BONUS);
    const holder = await pool.connect();
    let result;
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM wallet_accounts WHERE user_id=$1 FOR UPDATE', [user.id]);
      let finished = false;
      const pending = repo.subscriptionBonus.grant({ userId: user.id, transactionId: txId, amountMicroUsd: BONUS, planId: 'plus' }).then((value) => { finished = true; return value; });
      await sleep(400);
      assert.equal(finished, false, 'the grant is queued behind the account lock');
      // While it is queued, the refund for this purchase is created (and committed) - the grant must see it once it runs.
      await repo.paymentTransactions.create({ userId: user.id, type: 'refund', provider: 'manual', amountMicroUsd: 4_990_000, currency: 'USD', productId: 'plus', metadata: { originalTransactionId: txId, originalType: 'subscription' } });
      await holder.query('COMMIT');
      result = await pending;
    } finally {
      holder.release();
    }
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'REFUNDED');
    assert.equal(await repo.subscriptionBonus.getByTransactionId(txId), null);
    assert.deepEqual(await balances(repo, user.id), { paid: M(10), promo: 0 });
  });

  test('LOCK ORDER: a refund reversal queued behind the account lock reads the lot AFTER it gets the lock, so a settlement that committed first is respected', async () => {
    const user = await newUser('Lock Reverse Fresh', { paidMicroUsd: M(10) });
    const txId = await buyBonus(repo, user.id, BONUS);
    const holder = await pool.connect();
    let result;
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM wallet_accounts WHERE user_id=$1 FOR UPDATE', [user.id]);
      let finished = false;
      const pending = repo.subscriptionBonus.reverseForRefund({ transactionId: txId, refundTransactionId: null, adminUserId: null }).then((value) => { finished = true; return value; });
      await sleep(400);
      assert.equal(finished, false, 'the reversal is queued behind the account lock');
      // A settlement (simulated in SQL by the lock holder) consumes $2 of the lot and commits BEFORE the reversal runs.
      await holder.query('UPDATE subscription_bonus_lots SET consumed_micro_usd = consumed_micro_usd + $2 WHERE transaction_id=$1', [txId, M(2)]);
      await holder.query('UPDATE wallet_accounts SET promo_balance_micro_usd = promo_balance_micro_usd - $2 WHERE user_id=$1', [user.id, M(2)]);
      await holder.query('COMMIT');
      result = await pending;
    } finally {
      holder.release();
    }
    assert.equal(result.reversed, true);
    assert.equal(result.reversedMicroUsd, M(3), 'only what was still unspent when the lock was obtained');
    const lot = await lotFor(repo, txId);
    assert.deepEqual([lot.consumedMicroUsd, lot.reversedMicroUsd, lot.remainingMicroUsd], [M(2), M(3), 0]);
    assert.equal((await balances(repo, user.id)).promo, 0, 'never negative');
  });

  test('STRESS: settlements, refunds and repairs fired in the same instant never deadlock and always conserve the bonus (40 rounds)', async () => {
    for (let round = 0; round < 40; round += 1) {
      const user = await newUser('Stress ' + round, { paidMicroUsd: M(20) });
      const a = await buyBonus(repo, user.id, M(5));
      const b = await buyBonus(repo, user.id, M(3));
      const repaired = await buyBonusWithoutGrant(repo, user.id, M(2));
      const reservations = [];
      for (let i = 0; i < 3; i += 1) reservations.push(await reserveAi(repo, user.id, M(2)));
      const refundOfRepaired = await repo.paymentTransactions.create({
        userId: user.id, type: 'refund', provider: 'manual', amountMicroUsd: 4_990_000, currency: 'USD', productId: 'plus', metadata: { originalTransactionId: repaired, originalType: 'subscription' }
      });
      const results = await Promise.allSettled([
        ...reservations.map((id) => settleAi(repo, id, M(2))),
        repo.subscriptionBonus.reverseForRefund({ transactionId: a, refundTransactionId: null, adminUserId: null }),
        repo.subscriptionBonus.reverseForRefund({ transactionId: b, refundTransactionId: null, adminUserId: null }),
        repo.subscriptionBonus.grant({ userId: user.id, transactionId: repaired, amountMicroUsd: M(2), planId: 'plus' })
      ]);
      results.forEach((result) => assert.equal(result.status, 'fulfilled', 'no operation may fail or deadlock: ' + (result.reason && result.reason.message)));
      assert.equal(results[results.length - 1].value.ok, false, 'the repair is refused because a refund already exists');
      assert.equal(refundOfRepaired.type, 'refund');
      let consumedTotal = 0;
      for (const txId of [a, b]) {
        const lot = await assertLotInvariants(repo, user.id, txId);
        assert.equal(lot.status, 'reversed');
        consumedTotal += lot.consumedMicroUsd;
      }
      const { paid, promo } = await balances(repo, user.id);
      assert.equal(promo, 0, 'both lots are reversed, so no promo remains and none went negative');
      assert.equal(paid, M(20) - (M(6) - consumedTotal), 'whatever the bonus did not cover was charged to paid');
    }
  });

  test('DIFFERENTIAL: seeded random purchase / spend / refund sequences match the independent model at every step on PostgreSQL', async () => {
    for (let seed = 1; seed <= 12; seed += 1) await runModelScenario(repo, { seed, steps: 14, track, namePrefix: 'LotIT ' });
  });
}
