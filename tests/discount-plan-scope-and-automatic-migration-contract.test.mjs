import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract for migration 067 (discount_codes.plan_ids / application_mode) and for memory/PostgreSQL
// repository parity of the two new admin capabilities. This repo has no PostgreSQL in CI-less sandboxes, so what
// CAN run deterministically with zero database is asserted here against the real SQL and repository source text;
// the executable counterpart is the DATABASE_URL-gated PostgreSQL integration file.

const root = process.cwd();
const migrationsDir = path.join(root, 'server', 'db', 'migrations');
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');
const MIGRATION = '067_discount_code_scope_and_mode.sql';

test('067_discount_code_scope_and_mode.sql exists and is the ONLY migration numbered 067', async () => {
  const files = (await readdir(migrationsDir)).filter((name) => name.startsWith('067_'));
  assert.deepEqual(files, [MIGRATION]);
});

test('the migration runner will pick 067 up after 066 in numeric filename order', async () => {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  assert.ok(files.indexOf(MIGRATION) > files.indexOf('066_widen_plan_checks_for_pro.sql'));
});

test('plan_ids defaults to an empty array (every paid plan) and carries no CHECK on its values - the allowed set is an application-layer concern, not a database one', async () => {
  const sql = await read('server', 'db', 'migrations', MIGRATION);
  assert.match(sql, /ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS plan_ids\s+TEXT\[\]\s+NOT NULL DEFAULT '\{\}'/);
  const planIdsLine = sql.split('\n').find((line) => line.includes('plan_ids'));
  assert.doesNotMatch(planIdsLine, /CHECK/i, 'plan_ids must not hardcode plan names in a database CHECK (see 066\'s own history)');
});

test('application_mode defaults to \'code\' (existing rows are unaffected) and is restricted to code|automatic', async () => {
  const sql = await read('server', 'db', 'migrations', MIGRATION);
  assert.match(sql, /ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS application_mode\s+TEXT NOT NULL DEFAULT 'code'\s+CHECK \(application_mode IN \('code',\s*'automatic'\)\)/);
});

test('the migration is additive and re-runnable: no destructive statement, only discount_codes is touched, IF NOT EXISTS everywhere', async () => {
  const sql = await read('server', 'db', 'migrations', MIGRATION);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN|INDEX|SCHEMA)\b/i);
  assert.doesNotMatch(sql, /\b(TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+\s+SET|INSERT\s+INTO)\b/i, 'no data is rewritten or backfilled');
  assert.doesNotMatch(sql, /CONCURRENTLY/i, 'a plain .sql migration runs inside a transaction');
  const alters = Array.from(sql.matchAll(/ALTER TABLE\s+(?:IF EXISTS\s+)?(\w+)/gi), (m) => m[1]);
  assert.ok(alters.length >= 2);
  alters.forEach((table) => assert.equal(table, 'discount_codes'));
  assert.equal((sql.match(/CREATE TABLE(?! IF NOT EXISTS)/gi) || []).length, 0);
  assert.equal((sql.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/gi) || []).length, 0);
});

// ---- memory / PostgreSQL repository parity ---------------------------------------------------------------------------

function domainBlock(source, name) {
  const start = source.indexOf('\n  const ' + name + ' = {');
  assert.ok(start > -1, name + ' domain is missing');
  const end = source.indexOf('\n  };', start);
  assert.ok(end > start, name + ' domain block is not terminated');
  return source.slice(start, end);
}
const methodNames = (block) => Array.from(block.matchAll(/^    async (\w+)\(/gm), (m) => m[1]).sort();

test('repo.memory.mjs and repo.pg.mjs both add discountCodes.listAutomatic() and keep an identical discountCodes method set', async () => {
  const [memory, pg] = await Promise.all([read('server', 'db', 'repo.memory.mjs'), read('server', 'db', 'repo.pg.mjs')]);
  const memoryMethods = methodNames(domainBlock(memory, 'discountCodes'));
  const pgMethods = methodNames(domainBlock(pg, 'discountCodes'));
  assert.deepEqual(memoryMethods, pgMethods, 'memory and PG method sets must match exactly');
  assert.ok(memoryMethods.includes('listAutomatic'), 'discountCodes.listAutomatic must exist');
});

test('PostgreSQL: discountRedemptions.check() and .reserve() thread planId into assertCodeAvailable() so plan scope is enforced under the same row lock as every other rule', async () => {
  const pg = await read('server', 'db', 'repo.pg.mjs');
  const block = domainBlock(pg, 'discountRedemptions');
  const check = block.slice(block.indexOf('async check('), block.indexOf('async reserve('));
  assert.match(check, /planId/);
  const reserve = block.slice(block.indexOf('async reserve('));
  assert.match(reserve, /planId/);
});

test('subscription-checkout.mjs enforces plan scope on the quote AND the authoritative checkout, and never trusts the client for which discount applies', async () => {
  const src = await read('server', 'commercial', 'subscription-checkout.mjs');
  assert.match(src, /repo\.discountRedemptions\.check\(\{ codeId: record\.id, userId, planId \}\)/);
  assert.match(src, /codeAppliesToPlan/);
  assert.match(src, /automaticDiscountId/);
  assert.doesNotMatch(src, /req\.body\.(amountUsd|amountMicroUsd|finalAmountMicroUsd)/);
});

test('the internal identifier of an automatic discount is scrubbed from the customer-facing pricing helper, and only there - the admin DTO keeps it', async () => {
  const [discountCodes, bonus] = await Promise.all([read('server', 'commercial', 'discount-codes.mjs'), read('server', 'commercial', 'subscription-bonus.mjs')]);
  assert.match(discountCodes, /export function customerFacingPricing/);
  assert.match(bonus, /customerFacingPricing\(info\.pricing\)/, 'enrichTransactionsForCustomer must use it');
  const adminFn = bonus.slice(bonus.indexOf('export async function enrichTransactionsForAdmin'), bonus.indexOf('export async function enrichTransactionsForCustomer'));
  assert.doesNotMatch(adminFn, /customerFacingPricing/, 'the admin view keeps the real identifier');
});
