import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract for migration 066 (widens the two schema CHECKs that predate the Pro plan). This repo has no
// PostgreSQL in CI-less sandboxes, so what CAN run deterministically with zero database is asserted here against the
// real SQL and repository source text; the executable counterpart is pro-plan-postgres-integration.test.mjs
// (DATABASE_URL-gated).
//
// The real gap this migration closes: users.plan (026_commercial_config.sql) and user_subscriptions.plan_id
// (031_subscriptions.sql) both restrict their value to ('free','plus','personalized') - a leftover from before the
// Pro plan existed, even though PLAN_NAMES in server/commercial/commercial-defaults.mjs has included 'pro' since it
// was added. A confirmed Pro subscription fails on real PostgreSQL (CHECK violation, after the payment was already
// marked confirmed); the in-memory repository enforces no such CHECK, so every purely memory-repo test passes.

const root = process.cwd();
const migrationsDir = path.join(root, 'server', 'db', 'migrations');
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');
const MIGRATION = '066_widen_plan_checks_for_pro.sql';

test('066_widen_plan_checks_for_pro.sql exists and is the ONLY migration numbered 066', async () => {
  const files = (await readdir(migrationsDir)).filter((name) => name.startsWith('066_'));
  assert.deepEqual(files, [MIGRATION]);
});

test('every historic migration (001-065) is untouched by this change', async () => {
  const files = await readdir(migrationsDir);
  assert.ok(files.includes('026_commercial_config.sql'), 'the original users.plan migration must still exist unedited');
  assert.ok(files.includes('031_subscriptions.sql'), 'the original user_subscriptions.plan_id migration must still exist unedited');
  assert.ok(files.includes('064_discount_codes.sql'));
  assert.ok(files.includes('065_subscription_bonus_lots.sql'));
  const original026 = await read('server', 'db', 'migrations', '026_commercial_config.sql');
  assert.match(original026, /CHECK \(plan IN \('free','plus','personalized'\)\)/, 'the historic migration keeps its ORIGINAL (now superseded) CHECK text - it is never edited');
  const original031 = await read('server', 'db', 'migrations', '031_subscriptions.sql');
  assert.match(original031, /CHECK \(plan_id IN \('free','plus','personalized'\)\)/, 'the historic migration keeps its ORIGINAL (now superseded) CHECK text - it is never edited');
});

test('the migration runner will pick 066 up after 065 in numeric filename order', async () => {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  assert.ok(files.indexOf(MIGRATION) > files.indexOf('065_subscription_bonus_lots.sql'));
  assert.equal(files[files.length - 1], MIGRATION, '066 is the newest migration');
});

test('users.plan is widened to allow pro while keeping free/plus/personalized, and the old auto-generated constraint is found by its definition, never guessed', async () => {
  const sql = await read('server', 'db', 'migrations', MIGRATION);
  // The two DO blocks are the migration's only two statements shaped "DO $$ ... END $$;" - the users one is
  // whichever comes first, found by content rather than assumed order.
  const doBlocks = Array.from(sql.matchAll(/DO \$\$[\s\S]*?END \$\$;/g), (m) => m[0]);
  assert.equal(doBlocks.length, 2, 'exactly two constraint-replacement blocks');
  const usersBlock = doBlocks.find((block) => block.includes("conrelid = 'users'::regclass"));
  assert.ok(usersBlock, 'a DO block targeting users must exist');
  assert.match(usersBlock, /pg_constraint/i, 'the old constraint is found robustly, not by a guessed name');
  assert.match(usersBlock, /DROP CONSTRAINT/i);
  assert.match(sql, /ALTER TABLE users ADD CONSTRAINT \w+ CHECK \(plan IN \('free',\s*'plus',\s*'pro',\s*'personalized'\)\)/);
});

test('user_subscriptions.plan_id is widened the same way', async () => {
  const sql = await read('server', 'db', 'migrations', MIGRATION);
  const doBlocks = Array.from(sql.matchAll(/DO \$\$[\s\S]*?END \$\$;/g), (m) => m[0]);
  const subsBlock = doBlocks.find((block) => block.includes("conrelid = 'user_subscriptions'::regclass"));
  assert.ok(subsBlock, 'a DO block targeting user_subscriptions must exist');
  assert.match(subsBlock, /pg_constraint/i);
  assert.match(subsBlock, /DROP CONSTRAINT/i);
  assert.match(sql, /ALTER TABLE user_subscriptions ADD CONSTRAINT \w+ CHECK \(plan_id IN \('free',\s*'plus',\s*'pro',\s*'personalized'\)\)/);
});

test('the migration is additive and re-runnable: no destructive statement, IF NOT EXISTS/DROP CONSTRAINT only, ALTERs only the two plan tables', async () => {
  const sql = await read('server', 'db', 'migrations', MIGRATION);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN|INDEX|SCHEMA)\b/i, 'only a CONSTRAINT may ever be dropped here');
  assert.doesNotMatch(sql, /\b(TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+\s+SET|INSERT\s+INTO)\b/i, 'no data is rewritten or backfilled');
  assert.doesNotMatch(sql, /CONCURRENTLY/i, 'a plain .sql migration runs inside a transaction');
  const alters = Array.from(sql.matchAll(/ALTER TABLE\s+(?:IF EXISTS\s+)?(\w+)/gi), (m) => m[1]);
  assert.ok(alters.length >= 2);
  alters.forEach((table) => assert.ok(['users', 'user_subscriptions'].includes(table), 'unexpected ALTER TABLE ' + table));
  assert.equal((sql.match(/CREATE TABLE(?! IF NOT EXISTS)/gi) || []).length, 0);
  assert.equal((sql.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/gi) || []).length, 0);
});

// Deliberately NOT tested by scanning every historic migration's raw SQL text for a plan CHECK that "still excludes
// pro": 026/031 ALWAYS show their original, now-superseded CHECK text (historic migrations are never edited - the
// widening happens through 066's ALTER, applied afterwards), so that scan would flag the very files this migration
// is designed to leave untouched. Whether the LIVE, fully-migrated database still has a plan-restricting CHECK that
// excludes pro is instead proven by pro-plan-postgres-integration.test.mjs against a real, freshly migrated database.

test('the application layer already accepted pro before this migration (PLAN_NAMES) - this migration brings the database into agreement, not the other way round', async () => {
  const defaults = await read('server', 'commercial', 'commercial-defaults.mjs');
  assert.match(defaults, /PLAN_NAMES\s*=\s*\[\s*'free',\s*'plus',\s*'pro',\s*'personalized'\s*\]/);
});

test('the memory repository enforces no plan CHECK of its own (nothing there needed to change for parity)', async () => {
  const memory = await read('server', 'db', 'repo.memory.mjs');
  assert.doesNotMatch(memory, /'free'.*'plus'.*'personalized'/, 'the memory repo must not hardcode a plan allow-list that would need separate widening');
});
