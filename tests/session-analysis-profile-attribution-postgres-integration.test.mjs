import assert from 'node:assert/strict';
import test from 'node:test';
import { dropAnalysisProfileTestUser } from './helpers/analysis-profile-pg-cleanup.mjs';

// The REAL-PostgreSQL companion to session-analysis-profile-attribution-migration-contract.test.mjs and
// analysis-profile-usage-api-contract.test.mjs - proves migration 075 really applies to the live ledger, the
// JSONB coverage round-trips, listForProfile() filters/orders like the memory repository, and (the one thing only a
// real database can show) that the loose profile id has NO foreign key: deleting a profile leaves its completions
// - and the AI Analysis Discipline credit they carry - untouched. Skips cleanly without DATABASE_URL.
//
//   DATABASE_URL=postgres://user:pass@host:5432/dbname node --test tests/session-analysis-profile-attribution-postgres-integration.test.mjs

const hasDb = !!process.env.DATABASE_URL;

if (!hasDb) {
  test('SKIPPED (no DATABASE_URL) - session analysis profile attribution PostgreSQL integration', { skip: true }, () => {});
  console.log('session-analysis-profile-attribution-postgres-integration.test.mjs: DATABASE_URL not set - skipped. Set DATABASE_URL to a disposable test Postgres to run this file.');
} else {
  const { createPool } = await import('../server/db/pool.mjs');
  const { run: runMigrations } = await import('../server/db/migrate.mjs');
  const { createPgRepo } = await import('../server/db/repo.pg.mjs');

  let pool, repo, userId, sessionId;

  test.before(async () => {
    await runMigrations();
    pool = createPool(process.env.DATABASE_URL);
    repo = createPgRepo(pool);
    userId = (await repo.users.create({ displayName: 'APAttrIT Trader' })).id;
    await repo.instrumentCatalog.upsert(userId, { id: 'apattr-instr', code: 'XAUUSD' });
    sessionId = (await repo.tradingSessions.upsert(userId, { id: 'apattr-sess', market: 'London', instrument: 'XAUUSD', timeframe: '15m', date: '2026-01-01', entries: [] })).id;
    await repo.analysisProfiles.upsert(userId, { id: 'apattr-p1', name: 'One', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [] });
    await repo.analysisProfiles.upsert(userId, { id: 'apattr-p2', name: 'Two', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [] });
  });

  test.after(async () => {
    if (pool) {
      await pool.query('DELETE FROM session_ai_analysis_completions WHERE user_id=$1', [userId]).catch(() => {});
      await pool.query('DELETE FROM trading_sessions WHERE user_id=$1', [userId]).catch(() => {});
    }
    await dropAnalysisProfileTestUser(pool, userId);
    if (pool) await pool.end();
  });

  test('migration 075 is applied: the four attribution columns exist, are nullable, and analysis_profile_id has NO foreign key', async () => {
    const { rows } = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='session_ai_analysis_completions' AND column_name IN ('analysis_profile_id','analysis_profile_revision','active_market_session','concept_coverage')");
    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    assert.equal(Object.keys(byName).length, 4);
    assert.equal(byName.concept_coverage.data_type, 'jsonb');
    for (const r of rows) assert.equal(r.is_nullable, 'YES', `${r.column_name} must be nullable (legacy rows have no attribution)`);
    const fks = await pool.query("SELECT 1 FROM information_schema.key_column_usage kcu JOIN information_schema.table_constraints tc ON tc.constraint_name = kcu.constraint_name WHERE kcu.table_name='session_ai_analysis_completions' AND kcu.column_name='analysis_profile_id' AND tc.constraint_type='FOREIGN KEY'");
    assert.equal(fks.rows.length, 0, 'a foreign key here would let a profile delete cascade away discipline credit');
  });

  test('record() stores the attribution and the JSONB coverage round-trips; a legacy-shaped record (no attribution) stores NULLs', async () => {
    const coverage = [{ conceptId: 'c1', status: 'applied' }, { conceptId: 'c2', status: 'unaddressed' }];
    const { completion } = await repo.sessionAiAnalysisCompletions.record({
      userId, sessionId, analysisId: 'apattr-a1', analysisType: 'initial', provider: 'openai', model: 'gpt',
      analysisProfileId: 'apattr-p1', analysisProfileRevision: '3.0.h4sh', activeMarketSession: 'London', conceptCoverage: coverage
    });
    assert.equal(completion.analysisProfileId, 'apattr-p1');
    assert.equal(completion.analysisProfileRevision, '3.0.h4sh');
    assert.equal(completion.activeMarketSession, 'London');
    assert.deepEqual(completion.conceptCoverage, coverage);
    const legacy = (await repo.sessionAiAnalysisCompletions.record({ userId, sessionId, analysisId: 'apattr-legacy', analysisType: 'update' })).completion;
    assert.equal(legacy.analysisProfileId, null);
    assert.equal(legacy.conceptCoverage, null);
    assert.equal(legacy.activeMarketSession, '');
  });

  test('the repository re-sanitizes attribution (defense in depth): a bad session label / coverage status never reaches the row', async () => {
    const { completion } = await repo.sessionAiAnalysisCompletions.record({
      userId, sessionId, analysisId: 'apattr-dirty', analysisProfileId: 'apattr-p1', activeMarketSession: 'Mars', conceptCoverage: [{ conceptId: 'c1', status: 'bogus' }]
    });
    assert.equal(completion.activeMarketSession, '');
    assert.equal(completion.conceptCoverage, null);
  });

  test('a retried analysisId is idempotent (first write wins, no duplicate row)', async () => {
    const again = await repo.sessionAiAnalysisCompletions.record({ userId, sessionId, analysisId: 'apattr-a1', analysisProfileId: 'apattr-p2' });
    assert.equal(again.created, false);
    assert.equal(again.completion.analysisProfileId, 'apattr-p1', 'the retry must not re-attribute the run to a different profile');
  });

  test('listForProfile() returns only that user\'s runs under that profile, oldest first, excluding unattributed and other-profile runs', async () => {
    await repo.sessionAiAnalysisCompletions.record({ userId, sessionId, analysisId: 'apattr-a2', analysisProfileId: 'apattr-p2', occurredAt: '2026-02-01T00:00:00.000Z' });
    await repo.sessionAiAnalysisCompletions.record({ userId, sessionId, analysisId: 'apattr-a3', analysisProfileId: 'apattr-p1', occurredAt: '2026-01-01T00:00:00.000Z' });
    const ids = (await repo.sessionAiAnalysisCompletions.listForProfile(userId, 'apattr-p1')).map((c) => c.analysisId);
    assert.ok(ids.includes('apattr-a1') && ids.includes('apattr-a3') && ids.includes('apattr-dirty'));
    assert.ok(!ids.includes('apattr-a2') && !ids.includes('apattr-legacy'));
    assert.equal(ids[0], 'apattr-a3', 'the oldest (2026-01-01) run comes first');
    assert.deepEqual((await repo.sessionAiAnalysisCompletions.listForProfile('someone-else', 'apattr-p1')), [], 'scoped to the caller');
  });

  test('deleting the profile leaves its completions in place (no cascade) - the discipline credit survives, and the ledger still lists them for the user', async () => {
    const before = (await repo.sessionAiAnalysisCompletions.listForUser(userId)).length;
    await repo.analysisProfiles.remove(userId, 'apattr-p1');
    const after = await repo.sessionAiAnalysisCompletions.listForUser(userId);
    assert.equal(after.length, before);
    assert.ok(after.some((c) => c.analysisId === 'apattr-a1' && c.analysisProfileId === 'apattr-p1'), 'the row still names the (now deleted) profile');
  });
}
