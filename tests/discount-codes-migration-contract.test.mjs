import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract for migration 064 and for memory/PostgreSQL repository parity. This repo has
// no Postgres available in CI-less sandboxes (see learned-commands-migration-contract.test.mjs's
// header), so what CAN run deterministically with zero database is asserted here against the real
// SQL and repository source text; the executable counterpart is
// discount-codes-postgres-integration.test.mjs (DATABASE_URL-gated).
//
// One real gap this file exists to catch: 027_wallet.sql restricts wallet_ledger.type with a CHECK
// that does not include the new subscription-bonus types. The memory repo has no such CHECK, so a
// missing migration would pass every memory test and fail only in production PostgreSQL.

const root = process.cwd();
const migrationsDir = path.join(root, 'server', 'db', 'migrations');
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');

test('064_discount_codes.sql exists and is the ONLY migration numbered 064', async () => {
  const files = (await readdir(migrationsDir)).filter((name) => name.startsWith('064_'));
  assert.deepEqual(files, ['064_discount_codes.sql']);
});

test('discount_codes: integer money, normalized unique code, CHECK-guarded type/value/capacity/window', async () => {
  const sql = await read('server', 'db', 'migrations', '064_discount_codes.sql');
  const table = /CREATE TABLE IF NOT EXISTS discount_codes \(([\s\S]*?)\n\);/.exec(sql);
  assert.ok(table, 'could not find CREATE TABLE IF NOT EXISTS discount_codes');
  const body = table[1];
  const columns = [
    ['id', /\bid\s+TEXT PRIMARY KEY/], ['code', /\bcode\s+TEXT NOT NULL/], ['campaign_name', /campaign_name\s+TEXT NOT NULL/],
    ['active', /\bactive\s+BOOLEAN NOT NULL DEFAULT true/], ['discount_type', /discount_type\s+TEXT NOT NULL/],
    ['discount_value', /discount_value\s+BIGINT NOT NULL/], ['starts_at', /starts_at\s+TIMESTAMPTZ/], ['expires_at', /expires_at\s+TIMESTAMPTZ/],
    ['max_redemptions', /max_redemptions\s+INTEGER/], ['created_by', /created_by\s+TEXT REFERENCES users\(id\)/],
    ['updated_by', /updated_by\s+TEXT REFERENCES users\(id\)/],
    ['created_at', /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/], ['updated_at', /updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/]
  ];
  columns.forEach(([name, re]) => assert.match(body, re, 'missing or malformed column: ' + name));

  assert.match(body, /discount_type\s+IN\s+\('percent',\s*'fixed'\)/, 'type is restricted to percent|fixed');
  assert.match(body, /BETWEEN\s+1\s+AND\s+10000/, 'percent is basis points 1..10000');
  assert.match(body, /discount_value\s*>\s*0/, 'a fixed amount must be positive');
  assert.match(body, /max_redemptions\s+IS\s+NULL\s+OR\s+max_redemptions\s*>\s*0/, 'capacity is NULL (unlimited) or positive');
  assert.match(body, /expires_at\s*>\s*starts_at/, 'the window must be non-empty');
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS\s+\w+\s+ON discount_codes \(code\)/, 'the normalized code is unique at the database level');
});

test('discount_redemptions: snapshot columns, integer money, live-row uniqueness per (code, user), one redemption per transaction', async () => {
  const sql = await read('server', 'db', 'migrations', '064_discount_codes.sql');
  const table = /CREATE TABLE IF NOT EXISTS discount_redemptions \(([\s\S]*?)\n\);/.exec(sql);
  assert.ok(table, 'could not find CREATE TABLE IF NOT EXISTS discount_redemptions');
  const body = table[1];
  const columns = [
    ['id', /\bid\s+TEXT PRIMARY KEY/],
    ['code_id', /code_id\s+TEXT NOT NULL REFERENCES discount_codes\(id\)/],
    ['user_id', /user_id\s+TEXT NOT NULL REFERENCES users\(id\)/],
    ['transaction_id', /transaction_id\s+TEXT REFERENCES payment_transactions\(id\)/],
    ['status', /\bstatus\s+TEXT NOT NULL/], ['plan_id', /plan_id\s+TEXT NOT NULL/],
    ['code_snapshot', /code_snapshot\s+TEXT NOT NULL/], ['campaign_name_snapshot', /campaign_name_snapshot\s+TEXT NOT NULL/],
    ['discount_type_snapshot', /discount_type_snapshot\s+TEXT NOT NULL/], ['discount_value_snapshot', /discount_value_snapshot\s+BIGINT NOT NULL/],
    ['original_amount_micro_usd', /original_amount_micro_usd\s+BIGINT NOT NULL/],
    ['discount_amount_micro_usd', /discount_amount_micro_usd\s+BIGINT NOT NULL/],
    ['final_amount_micro_usd', /final_amount_micro_usd\s+BIGINT NOT NULL/],
    ['reserved_until', /reserved_until\s+TIMESTAMPTZ NOT NULL/], ['confirmed_at', /confirmed_at\s+TIMESTAMPTZ/],
    ['released_at', /released_at\s+TIMESTAMPTZ/], ['release_reason', /release_reason\s+TEXT/], ['refunded_at', /refunded_at\s+TIMESTAMPTZ/],
    ['created_at', /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/]
  ];
  columns.forEach(([name, re]) => assert.match(body, re, 'missing or malformed column: ' + name));
  assert.match(body, /status\s+IN\s+\('reserved',\s*'confirmed',\s*'released',\s*'expired'\)/, 'the four lifecycle states');

  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS\s+\w+\s+ON discount_redemptions \(code_id,\s*user_id\)\s+WHERE\s+status\s+IN\s+\('reserved',\s*'confirmed'\)/,
    'one LIVE redemption per user per code, enforced by a partial unique index (released/expired rows do not block a retry)');
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS\s+\w+\s+ON discount_redemptions \(transaction_id\)\s+WHERE\s+transaction_id\s+IS\s+NOT\s+NULL/,
    'a transaction backs at most one redemption');
  assert.match(sql, /CREATE INDEX IF NOT EXISTS\s+\w+\s+ON discount_redemptions \(code_id,\s*status\)/, 'capacity counts are index-backed');
});

test('money is integer everywhere - no NUMERIC/FLOAT/DECIMAL/REAL anywhere in the migration', async () => {
  const sql = await read('server', 'db', 'migrations', '064_discount_codes.sql');
  assert.doesNotMatch(sql, /\b(NUMERIC|FLOAT|DOUBLE PRECISION|DECIMAL|REAL)\b/i);
});

test('wallet_ledger.type is widened to include SUBSCRIPTION_BONUS and SUBSCRIPTION_BONUS_REVERSAL while keeping every existing type', async () => {
  const sql = await read('server', 'db', 'migrations', '064_discount_codes.sql');
  assert.match(sql, /ALTER TABLE wallet_ledger/);
  for (const type of ['PROMO_CREDIT', 'TOP_UP', 'AI_RESERVATION', 'AI_SETTLEMENT', 'AI_RELEASE', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'SUBSCRIPTION_BONUS', 'SUBSCRIPTION_BONUS_REVERSAL']) {
    assert.match(sql, new RegExp("'" + type + "'"), 'the widened CHECK must allow ' + type);
  }
  // The inline CHECK in 027 has an auto-generated name; the migration must not depend on guessing it.
  assert.match(sql, /pg_constraint|DROP CONSTRAINT IF EXISTS/i, 'the old constraint is found/dropped robustly');
});

test('the migration is additive and re-runnable: IF NOT EXISTS throughout, ALTERs only wallet_ledger, nothing destructive', async () => {
  const sql = await read('server', 'db', 'migrations', '064_discount_codes.sql');
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN|INDEX|SCHEMA)/i);
  assert.doesNotMatch(sql, /\b(TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+\s+SET)\b/i);
  assert.doesNotMatch(sql, /CONCURRENTLY/i, 'a plain .sql migration runs inside a transaction');
  const alters = Array.from(sql.matchAll(/ALTER TABLE\s+(?:IF EXISTS\s+)?(\w+)/gi), (m) => m[1]);
  alters.forEach((table) => assert.ok(['wallet_ledger', 'discount_codes', 'discount_redemptions'].includes(table), 'unexpected ALTER TABLE ' + table));
  assert.equal((sql.match(/CREATE TABLE(?! IF NOT EXISTS)/gi) || []).length, 0, 'every CREATE TABLE is IF NOT EXISTS');
  assert.equal((sql.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/gi) || []).length, 0, 'every CREATE INDEX is IF NOT EXISTS');
});

// ---- memory / PostgreSQL repository parity ----------------------------------------------------------

function domainBlock(source, name) {
  const start = source.indexOf('\n  const ' + name + ' = {');
  assert.ok(start > -1, name + ' domain is missing');
  const end = source.indexOf('\n  };', start);
  assert.ok(end > start, name + ' domain block is not terminated');
  return source.slice(start, end);
}
const methodNames = (block) => Array.from(block.matchAll(/^    async (\w+)\(/gm), (m) => m[1]).sort();

const REQUIRED = {
  discountCodes: ['create', 'get', 'getByCode', 'list', 'stats', 'update'],
  discountRedemptions: ['attachTransaction', 'confirmForTransaction', 'getByTransactionId', 'listForCode', 'markRefundedForTransaction', 'releaseForTransaction', 'reserve']
};

test('repo.memory.mjs and repo.pg.mjs expose IDENTICAL method surfaces for discountCodes and discountRedemptions', async () => {
  const [memory, pg] = await Promise.all([read('server', 'db', 'repo.memory.mjs'), read('server', 'db', 'repo.pg.mjs')]);
  for (const [domain, required] of Object.entries(REQUIRED)) {
    const memoryMethods = methodNames(domainBlock(memory, domain));
    const pgMethods = methodNames(domainBlock(pg, domain));
    assert.deepEqual(memoryMethods, pgMethods, domain + ': memory and PG method sets must match exactly');
    required.forEach((method) => assert.ok(memoryMethods.includes(method), domain + ' is missing ' + method));
  }
});

test('both repositories register the new domains on the repo object, and both expose wallet.ledgerEntriesByIdempotencyKeys()', async () => {
  const [memory, pg] = await Promise.all([read('server', 'db', 'repo.memory.mjs'), read('server', 'db', 'repo.pg.mjs')]);
  for (const [label, source] of [['memory', memory], ['pg', pg]]) {
    const registration = source.slice(source.lastIndexOf('\n  return {'));
    assert.match(registration, /\bdiscountCodes\b/, label + ': discountCodes must be registered');
    assert.match(registration, /\bdiscountRedemptions\b/, label + ': discountRedemptions must be registered');
    assert.match(domainBlock(source, 'wallet'), /async ledgerEntriesByIdempotencyKeys\(/, label + ': wallet.ledgerEntriesByIdempotencyKeys');
  }
});

test('PostgreSQL atomicity: reservations serialize on a row lock, use the database clock, and map unique violations to domain errors', async () => {
  const pg = await read('server', 'db', 'repo.pg.mjs');
  const redemptions = domainBlock(pg, 'discountRedemptions');
  assert.match(redemptions, /FROM discount_codes[^;`]*FOR UPDATE/, 'reserve/confirm lock the discount_codes row so all capacity decisions for one code serialize');
  assert.match(redemptions, /BEGIN/);
  assert.match(redemptions, /COMMIT/);
  assert.match(redemptions, /ROLLBACK/);
  assert.match(redemptions, /reserved_until\s*(<=|>)\s*now\(\)/, 'hold lapse is judged by the DATABASE clock, not the app server\'s');
  assert.match(redemptions, /23505/, 'a unique-index violation is mapped to a domain error, never a raw pg error');
  assert.match(redemptions, /DISCOUNT_CODE_EXHAUSTED/);
  assert.match(redemptions, /DISCOUNT_CAPACITY_LOST/);

  const codes = domainBlock(pg, 'discountCodes');
  assert.match(codes, /FOR UPDATE/, 'lowering the cap re-checks usage under the same row lock');
  assert.match(codes, /DISCOUNT_CAPACITY_BELOW_USED/);
  assert.match(codes, /DISCOUNT_CODE_EXISTS/);

  const wallet = domainBlock(pg, 'wallet');
  assert.match(wallet, /idempotency_key\s*=\s*ANY\(/, 'the batched ledger lookup is a single indexed query');
});
