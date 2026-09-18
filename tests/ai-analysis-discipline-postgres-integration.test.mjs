import assert from 'node:assert/strict';
import test from 'node:test';

// AI Analysis Discipline (063_ai_analysis_discipline.sql) - the OPTIONAL, real-Postgres companion
// to tests/ai-analysis-discipline-migration-contract.test.mjs's own zero-DB structural checks.
// Same skip-guard/harness convention as tests/learned-commands-postgres-integration.test.mjs.
//
// Skips cleanly (a single explicit log line, zero assertions run, exit 0) unless DATABASE_URL is
// set - `npm test` must never fail or hang because no real database is reachable in this sandbox.
//
//   DATABASE_URL=postgres://user:pass@host:5432/dbname node --test tests/ai-analysis-discipline-postgres-integration.test.mjs
//
// NOT executed in this session - no DATABASE_URL/reachable Postgres instance in this sandboxed
// environment.

const hasDb = !!process.env.DATABASE_URL;

if (!hasDb) {
  test('SKIPPED (no DATABASE_URL) - AI Analysis Discipline PostgreSQL integration', { skip: true }, () => {});
  console.log('ai-analysis-discipline-postgres-integration.test.mjs: DATABASE_URL not set - skipped. Set DATABASE_URL to a real Postgres instance to run this file.');
} else {
  const { createPool } = await import('../server/db/pool.mjs');
  const { run: runMigrations } = await import('../server/db/migrate.mjs');
  const { createPgRepo } = await import('../server/db/repo.pg.mjs');

  let pool, repo;
  const createdUserIds = [];

  test.before(async () => {
    await runMigrations();
    pool = createPool(process.env.DATABASE_URL);
    repo = createPgRepo(pool);
  });
  test.after(async () => {
    for (const id of createdUserIds) {
      await pool.query('DELETE FROM session_ai_analysis_completions WHERE user_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM user_discipline_settings WHERE user_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM trading_sessions WHERE user_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM users WHERE id=$1', [id]).catch(() => {});
    }
    await pool.end();
  });

  async function createUser(name) {
    const user = await repo.users.create({ displayName: name });
    createdUserIds.push(user.id);
    return user;
  }

  test('migration 063 has actually been applied - both real tables exist with the expected columns', async () => {
    const { rows: completionCols } = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='session_ai_analysis_completions'`);
    const completionColumns = completionCols.map((r) => r.column_name);
    ['id', 'user_id', 'session_id', 'entry_id', 'analysis_id', 'analysis_type', 'provider', 'model', 'source', 'occurred_at', 'created_at']
      .forEach((col) => assert.ok(completionColumns.includes(col), 'missing real column: ' + col));

    const { rows: settingsCols } = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='user_discipline_settings'`);
    const settingsColumns = settingsCols.map((r) => r.column_name);
    ['user_id', 'timezone', 'created_at', 'updated_at'].forEach((col) => assert.ok(settingsColumns.includes(col), 'missing real column: ' + col));
  });

  test('sessionAiAnalysisCompletions.record is idempotent on analysis_id against the real database, matching repo.memory.mjs\'s own identical contract', async () => {
    const user = await createUser('PG Discipline Trader');
    await repo.instrumentCatalog.upsert(user.id, { id: 'pg-instrument-' + user.id, code: 'XAUUSD' });
    const session = await repo.tradingSessions.upsert(user.id, { id: 'pg-sess-' + user.id, market: 'London', instrument: 'XAUUSD', timeframe: '15m', date: '2026-01-01', entries: [] });

    const first = await repo.sessionAiAnalysisCompletions.record({ userId: user.id, sessionId: session.id, entryId: null, analysisId: 'pg-analysis-1' });
    assert.equal(first.created, true);
    const retry = await repo.sessionAiAnalysisCompletions.record({ userId: user.id, sessionId: session.id, entryId: null, analysisId: 'pg-analysis-1' });
    assert.equal(retry.created, false, 'a retried analysisId must never create a second row against the real database');

    const rows = await repo.sessionAiAnalysisCompletions.listForUser(user.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sessionId, session.id);
  });

  test('disciplineSettings.ensure is write-once against the real database - a later different candidate never re-buckets the stored timezone', async () => {
    const user = await createUser('PG Timezone Trader');
    const first = await repo.disciplineSettings.ensure(user.id, 'Asia/Tehran');
    assert.equal(first, 'Asia/Tehran');
    const second = await repo.disciplineSettings.ensure(user.id, 'America/New_York');
    assert.equal(second, 'Asia/Tehran', 'the real Postgres row must stay stable once written');
    assert.equal(await repo.disciplineSettings.get(user.id), 'Asia/Tehran');
  });

  test('session_id has ON DELETE CASCADE - removing the owning Session removes its completions too, against the real database', async () => {
    const user = await createUser('PG Cascade Trader');
    await repo.instrumentCatalog.upsert(user.id, { id: 'pg-instrument2-' + user.id, code: 'XAUUSD' });
    const session = await repo.tradingSessions.upsert(user.id, { id: 'pg-sess2-' + user.id, market: 'London', instrument: 'XAUUSD', timeframe: '15m', date: '2026-01-01', entries: [] });
    await repo.sessionAiAnalysisCompletions.record({ userId: user.id, sessionId: session.id, analysisId: 'pg-analysis-cascade' });
    await repo.tradingSessions.remove(user.id, session.id);
    assert.equal((await repo.sessionAiAnalysisCompletions.listForUser(user.id)).length, 0);
  });
}
