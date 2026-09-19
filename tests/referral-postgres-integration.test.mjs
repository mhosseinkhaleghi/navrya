import assert from 'node:assert/strict';
import test from 'node:test';

// The REAL-PostgreSQL companion to tests/referral-repo-memory.test.mjs and tests/referral-migration-contract.test.mjs.
// It proves what the in-memory repository cannot: the same 30 behavioural scenarios on a real database (repository
// parity), real row-lock serialisation between AI conversion and payout reservation on separate connections, and the
// CHECK constraints / immutability triggers / state machine of migrations 068-070.
//
// Skips cleanly (one explicit log line, exit 0) unless DATABASE_URL is set - `npm test` must never fail or hang because no
// database is reachable. Run it ONLY against a disposable TEST database - it TRUNCATEs every referral_* table between
// scenarios (TRUNCATE bypasses the row-level immutability triggers, which is exactly what a disposable database allows):
//
//   DATABASE_URL=postgres://user:pass@host:5432/dbname node --test tests/referral-postgres-integration.test.mjs

const hasDb = !!process.env.DATABASE_URL;

if (!hasDb) {
  test('SKIPPED (no DATABASE_URL) - referral PostgreSQL integration', { skip: true }, () => {});
  console.log('referral-postgres-integration.test.mjs: DATABASE_URL not set - skipped. Set DATABASE_URL to a disposable test Postgres to run this file.');
} else {
  const { createPool } = await import('../server/db/pool.mjs');
  const { run: runMigrations } = await import('../server/db/migrate.mjs');
  const { createPgRepo } = await import('../server/db/repo.pg.mjs');
  const scenarios = await import('./helpers/referral-repo-scenarios.mjs');
  const { MICRO } = await import('../server/commercial/referral-rules.mjs');
  const { setupProgram, attribute, pay, payoutArgs, createUser } = scenarios;

  const REFERRAL_TABLES = [
    'referral_lot_allocations', 'referral_payout_events', 'referral_payout_requests', 'referral_ai_conversions', 'referral_debt_cases',
    'referral_reversals', 'referral_ledger_entries', 'referral_earning_outcomes', 'referral_earning_lots', 'referral_attribution_attempts',
    'referral_attributions', 'referral_click_stats', 'referral_accounts', 'referral_codes', 'referral_partner_assignments',
    'referral_program_versions', 'referral_programs'
  ];
  let pool, repo;
  async function reset() { await pool.query('TRUNCATE ' + REFERRAL_TABLES.join(', ')); return repo; }

  test.before(async () => {
    await runMigrations();
    pool = createPool(process.env.DATABASE_URL);
    repo = createPgRepo(pool);
  });
  test.after(async () => {
    if (pool) { await reset().catch(() => {}); await pool.end(); }
  });

  // --- 1. repository parity: the identical scenarios the memory repo passes --------------------------------
  scenarios.registerReferralRepoScenarios({ test, makeRepo: reset, label: 'postgres' });

  // --- 2. row-lock serialisation on REAL connections --------------------------------------------------------
  // A race made of Promise.all does not prove locking (the critical sections may simply never overlap), so the proof is
  // deterministic: a second connection HOLDS the per-user referral_accounts lock, the operation is started, and it must
  // NOT finish while the lock is held - then it must finish correctly once the lock is released.
  async function assertBlockedUntilRelease(userId, operation) {
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('INSERT INTO referral_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
      await holder.query('SELECT * FROM referral_accounts WHERE user_id=$1 FOR UPDATE', [userId]);
      let settled = false;
      const pending = operation().then((value) => { settled = true; return value; });
      await new Promise((resolve) => setTimeout(resolve, 600));
      assert.equal(settled, false, 'the operation must wait for the referral_accounts row lock');
      await holder.query('COMMIT');
      return await pending;
    } finally {
      holder.release();
    }
  }
  test('[postgres] AI conversion waits for the per-user referral_accounts lock, then succeeds', async () => {
    await reset();
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    await pay(repo, referred, 200, { confirmedDaysAgo: 1 });
    const result = await assertBlockedUntilRelease(ctx.referrer.id, () => repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 5 * MICRO, idempotencyKey: 'lock-c' }));
    assert.equal(result.ok, true);
  });
  test('[postgres] a payout reservation waits for the per-user referral_accounts lock, then succeeds', async () => {
    await reset();
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    await pay(repo, referred, 200, { confirmedDaysAgo: 1 });
    const result = await assertBlockedUntilRelease(ctx.referrer.id, () => repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'lock-p')));
    assert.equal(result.ok, true);
  });
  test('[postgres] a reversal waits for the per-user lock too (so it cannot interleave with a conversion)', async () => {
    await reset();
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    const { tx } = await pay(repo, referred, 200, { confirmedDaysAgo: 1 });
    const result = await assertBlockedUntilRelease(ctx.referrer.id, () => repo.referralEarnings.reverseEarning({ source: 'subscription', sourceEventId: tx.id, trigger: 'refund', triggerRef: 'lock-r', commissionAfterMicroUsd: 0 }));
    assert.equal(result.reversed, true);
  });

  test('[postgres] many concurrent conversions and payout requests never overspend a lot and never deadlock', async () => {
    await reset();
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    await pay(repo, referred, 300, { confirmedDaysAgo: 3 }); // 10% of $300 = $30.00 commission
    await pay(repo, referred, 300, { confirmedDaysAgo: 2 }); // $30.00 more -> $60.00 in total
    const operations = [];
    for (let i = 0; i < 12; i++) operations.push(repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 7 * MICRO, idempotencyKey: 'stress-c' + i }));
    for (let i = 0; i < 12; i++) operations.push(repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'stress-p' + i)));
    const results = await Promise.all(operations);
    const wins = results.filter((r) => r.ok);
    const spent = wins.reduce((sum, r) => sum + (r.conversion ? r.conversion.amountMicroUsd : r.request.amountMicroUsd), 0);
    assert.ok(spent <= 60 * MICRO, 'never more than the $60.00 that was earned');
    const totals = (await repo.referralEarnings.summaryForUser(ctx.referrer.id)).totals;
    assert.equal(totals.aiConvertedMicroUsd + totals.payoutReservedMicroUsd, spent);
    assert.equal(totals.aiConvertedMicroUsd + totals.payoutReservedMicroUsd + totals.availableCashMicroUsd, 60 * MICRO, 'every micro-USD is accounted for exactly once');
    const { rows } = await pool.query('SELECT COUNT(*) AS n FROM referral_earning_lots WHERE ai_converted_micro_usd + payout_reserved_micro_usd + paid_micro_usd + reversed_micro_usd > original_micro_usd');
    assert.equal(Number(rows[0].n), 0);
  });

  test('[postgres] an idempotent replay returns the same conversion even when fired concurrently (never a double credit)', async () => {
    await reset();
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    await pay(repo, referred, 200, { confirmedDaysAgo: 1 });
    const before = (await repo.wallet.getAccount(ctx.referrer.id)).promoBalanceMicroUsd;
    const results = await Promise.all(Array.from({ length: 6 }, () => repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 3 * MICRO, idempotencyKey: 'same-key' })));
    assert.equal(new Set(results.map((r) => r.conversion.id)).size, 1, 'one conversion, however many concurrent replays');
    assert.equal((await repo.wallet.getAccount(ctx.referrer.id)).promoBalanceMicroUsd - before, 3 * MICRO);
  });

  test('[postgres] two concurrent earning events for one payment produce exactly one lot', async () => {
    await reset();
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    const tx = await repo.paymentTransactions.create({ userId: referred.id, type: 'subscription', provider: 'manual', amountMicroUsd: 20 * MICRO, currency: 'USD', productId: 'pro', metadata: {} });
    await repo.paymentTransactions.setStatus(tx.id, 'confirmed', { confirmedAt: new Date().toISOString() });
    const args = { source: 'subscription', sourceEventId: tx.id, paymentTransactionId: tx.id, referredUserId: referred.id, planId: 'pro', finalAmountMicroUsd: 20 * MICRO, confirmedAt: new Date().toISOString() };
    const results = await Promise.all(Array.from({ length: 5 }, () => repo.referralEarnings.recordEarning(args)));
    assert.equal(results.filter((r) => !r.duplicate).length, 1);
    assert.equal((await repo.referralEarnings.lotsForUser(ctx.referrer.id)).length, 1);
  });

  // --- 3. constraints, triggers and the state machine enforced by the DATABASE itself -------------------------
  const restrictViolation = '23001';
  async function expectDbError(code, sql, params) {
    await assert.rejects(() => pool.query(sql, params), (error) => { assert.equal(error.code, code, error.message); return true; });
  }
  test('[postgres] a published program version cannot be edited or deleted at the database level', async () => {
    await reset();
    const ctx = await setupProgram(repo);
    await expectDbError(restrictViolation, 'UPDATE referral_program_versions SET commission_bps = 9999 WHERE id=$1', [ctx.version.id]);
    await expectDbError(restrictViolation, 'DELETE FROM referral_program_versions WHERE id=$1', [ctx.version.id]);
    await pool.query(`UPDATE referral_program_versions SET effective_to = now() + interval '1 day' WHERE id=$1`, [ctx.version.id]); // a status-side column may still change
  });
  test('[postgres] the earnings ledger, conversions and allocations are append-only', async () => {
    await reset();
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    await pay(repo, referred, 200, { confirmedDaysAgo: 1 });
    await repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 2 * MICRO, idempotencyKey: 'ao' });
    await expectDbError(restrictViolation, 'UPDATE referral_ledger_entries SET amount_micro_usd = 1', []);
    await expectDbError(restrictViolation, 'DELETE FROM referral_ledger_entries', []);
    await expectDbError(restrictViolation, 'UPDATE referral_ai_conversions SET amount_micro_usd = 1', []);
    await expectDbError(restrictViolation, 'UPDATE referral_lot_allocations SET amount_micro_usd = 1', []);
  });
  test('[postgres] the lot bucket CHECK refuses any spend beyond the original amount', async () => {
    await reset();
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    const { result } = await pay(repo, referred, 20);
    await expectDbError('23514', 'UPDATE referral_earning_lots SET paid_micro_usd = original_micro_usd + 1 WHERE id=$1', [result.lot.id]);
  });
  test('[postgres] payout requests: amount/recipient immutable, legal transitions only, tx hash frozen once confirmed', async () => {
    await reset();
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    await pay(repo, referred, 200, { confirmedDaysAgo: 1 });
    const { request } = await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'db-p'));
    await expectDbError(restrictViolation, 'UPDATE referral_payout_requests SET amount_micro_usd = 1 WHERE id=$1', [request.id]);
    await expectDbError(restrictViolation, 'UPDATE referral_payout_requests SET recipient_address_enc = $2 WHERE id=$1', [request.id, 'other']);
    await expectDbError(restrictViolation, `UPDATE referral_payout_requests SET status='paid', paid_at=now(), finalized_by=$2 WHERE id=$1`, [request.id, ctx.admin.id]);
    await expectDbError(restrictViolation, `UPDATE referral_payout_requests SET tx_hash=$2 WHERE id=$1`, [request.id, '0x' + 'a'.repeat(64)]);
    await expectDbError(restrictViolation, `UPDATE referral_payout_requests SET chain_id = 1 WHERE id=$1`, [request.id]); // the immutability trigger fires before the chain_id = 56 CHECK
    await expectDbError(restrictViolation, 'DELETE FROM referral_payout_requests WHERE id=$1', [request.id]);
  });
  test('[postgres] only one platform-default program, one published version and one active assignment can exist', async () => {
    await reset();
    const ctx = await setupProgram(repo);
    await expectDbError('23505', `INSERT INTO referral_programs (id, kind, name, is_platform_default) VALUES ('dup-default','standard','x',true)`, []);
    const draft = await repo.referralPrograms.createDraftVersion(ctx.program.id, { commissionBps: 100 }, { createdBy: ctx.admin.id });
    await expectDbError('23505', `UPDATE referral_program_versions SET status='published', published_at=now(), published_by=$2 WHERE id=$1`, [draft.id, ctx.admin.id]);
    const user = await createUser(repo, 'Partner');
    await pool.query(`INSERT INTO referral_partner_assignments (id, user_id, mode, created_by) VALUES ('a-one',$1,'disabled',$2)`, [user.id, ctx.admin.id]);
    await expectDbError('23505', `INSERT INTO referral_partner_assignments (id, user_id, mode, created_by) VALUES ('a-two',$1,'standard',$2)`, [user.id, ctx.admin.id]);
  });
  test('[postgres] the wallet ledger accepts REFERRAL_AI_CONVERSION and still refuses unknown types', async () => {
    await reset();
    const user = await createUser(repo, 'WalletUser');
    await repo.wallet.getAccount(user.id);
    await pool.query(`INSERT INTO wallet_ledger (id, user_id, type, promo_delta_micro_usd, idempotency_key) VALUES ($1,$2,'REFERRAL_AI_CONVERSION',1,$3)`, ['wl-ok-' + user.id, user.id, 'k-ok-' + user.id]);
    await expectDbError('23514', `INSERT INTO wallet_ledger (id, user_id, type, idempotency_key) VALUES ($1,$2,'NOT_A_TYPE',$3)`, ['wl-bad-' + user.id, user.id, 'k-bad-' + user.id]);
  });
  test('[postgres] a self-referral and a duplicate attribution are refused by the database even if the application check were skipped', async () => {
    await reset();
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    const insert = (id, referredId, referrerId) => pool.query(
      `INSERT INTO referral_attributions (id, referred_user_id, referrer_user_id, code_id, program_id, program_version_id, mode, commission_bps, rules_snapshot) VALUES ($1,$2,$3,$4,$5,$6,'standard',1,'{}')`,
      [id, referredId, referrerId, ctx.code.id, ctx.program.id, ctx.version.id]
    );
    await assert.rejects(() => insert('self', ctx.referrer.id, ctx.referrer.id), (e) => e.code === '23514');
    await assert.rejects(() => insert('dupe', referred.id, ctx.referrer.id), (e) => e.code === '23505');
  });
}
