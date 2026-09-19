import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract for migration 065 (subscription-bonus lots + immutable allocations) and for memory /
// PostgreSQL repository parity of the lot accounting. There is no PostgreSQL in CI-less sandboxes, so what CAN run
// deterministically with zero database is asserted here against the real SQL and repository source text; the
// executable counterpart is subscription-bonus-lots-postgres-integration.test.mjs (DATABASE_URL-gated).
//
// What this file exists to catch: the memory repo has no CHECK constraints, no locks and no triggers, so a lot
// accounting that is correct in memory can still be non-atomic, lock in the wrong order, or miss a constraint in
// production PostgreSQL. Lock ORDER matters most: every code path takes the wallet_accounts row FIRST and the lot
// rows second, which is what makes settlement / refund / repair deadlock-free and serialisable per user.

const root = process.cwd();
const migrationsDir = path.join(root, 'server', 'db', 'migrations');
const read = async (...parts) => (await readFile(path.join(root, ...parts), 'utf8')).replace(/\r\n/g, '\n');
const MIGRATION = '065_subscription_bonus_lots.sql';

async function tableBody(sql, table) {
  const match = new RegExp('CREATE TABLE IF NOT EXISTS ' + table + ' \\(([\\s\\S]*?)\\n\\);').exec(sql);
  assert.ok(match, 'could not find CREATE TABLE IF NOT EXISTS ' + table);
  return match[1];
}

test('065_subscription_bonus_lots.sql exists, is the ONLY migration numbered 065, and 064 is still the discount-code migration', async () => {
  const files = await readdir(migrationsDir);
  assert.deepEqual(files.filter((name) => name.startsWith('065_')), [MIGRATION]);
  assert.ok(files.includes('064_discount_codes.sql'), 'historic migrations are never renamed or removed');
});

test('subscription_bonus_lots: one lot per payment transaction, linked to its ledger grant, integer money, arithmetic CHECKs', async () => {
  const sql = await read('server', 'db', 'migrations', MIGRATION);
  const body = await tableBody(sql, 'subscription_bonus_lots');
  const columns = [
    ['id', /\bid\s+TEXT PRIMARY KEY/],
    ['seq', /\bseq\s+BIGSERIAL/],
    ['user_id', /user_id\s+TEXT NOT NULL REFERENCES users\(id\)/],
    ['transaction_id', /transaction_id\s+TEXT NOT NULL UNIQUE REFERENCES payment_transactions\(id\)/],
    ['grant_ledger_id', /grant_ledger_id\s+TEXT NOT NULL UNIQUE REFERENCES wallet_ledger\(id\)/],
    ['original_micro_usd', /original_micro_usd\s+BIGINT NOT NULL/],
    ['consumed_micro_usd', /consumed_micro_usd\s+BIGINT NOT NULL DEFAULT 0/],
    ['reversed_micro_usd', /reversed_micro_usd\s+BIGINT NOT NULL DEFAULT 0/],
    ['status', /\bstatus\s+TEXT NOT NULL DEFAULT 'active'/],
    ['granted_at', /granted_at\s+TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp\(\)/],
    ['reversed_at', /reversed_at\s+TIMESTAMPTZ/],
    ['reversal_ledger_id', /reversal_ledger_id\s+TEXT UNIQUE REFERENCES wallet_ledger\(id\)/],
    ['refund_transaction_id', /refund_transaction_id\s+TEXT REFERENCES payment_transactions\(id\)/],
    ['created_at', /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/]
  ];
  columns.forEach(([name, re]) => assert.match(body, re, 'missing or malformed column: ' + name));
  assert.match(body, /status\s+IN\s+\('active',\s*'reversed'\)/, 'status is restricted to active|reversed');
  assert.match(body, /original_micro_usd\s*>\s*0/, 'a lot is always a positive amount');
  assert.match(body, /consumed_micro_usd\s*>=\s*0/);
  assert.match(body, /reversed_micro_usd\s*>=\s*0/);
  assert.match(body, /consumed_micro_usd\s*\+\s*reversed_micro_usd\s*<=\s*original_micro_usd/, 'consumed + reversed can never exceed the original: remaining is never negative');
  assert.match(body, /status\s*=\s*'reversed'\)\s*=\s*\(reversal_ledger_id IS NOT NULL\)|reversal_ledger_id IS NOT NULL[\s\S]{0,80}status\s*=\s*'reversed'|status\s*=\s*'reversed'[\s\S]{0,120}reversal_ledger_id IS NOT NULL/,
    'a lot is reversed exactly when it points at its reversal ledger entry');
  assert.doesNotMatch(body, /\b(NUMERIC|DECIMAL|REAL|DOUBLE|FLOAT)\b/i, 'no inexact monetary type');
  assert.doesNotMatch(body, /remaining_micro_usd/i, 'remaining is derived (original - consumed - reversed), never a second stored truth');
});

test('subscription_bonus_lots: a partial index serves the FIFO scan of a user\'s ACTIVE lots in grant order', async () => {
  const sql = await read('server', 'db', 'migrations', MIGRATION);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS\s+\w+\s+ON subscription_bonus_lots \(user_id,\s*granted_at,\s*seq\)\s+WHERE status = 'active'/);
});

test('subscription_bonus_allocations: one immutable row per (lot, AI settlement), integer positive amounts, database-enforced immutability', async () => {
  const sql = await read('server', 'db', 'migrations', MIGRATION);
  const body = await tableBody(sql, 'subscription_bonus_allocations');
  const columns = [
    ['id', /\bid\s+TEXT PRIMARY KEY/],
    ['lot_id', /lot_id\s+TEXT NOT NULL REFERENCES subscription_bonus_lots\(id\)/],
    ['ledger_id', /ledger_id\s+TEXT NOT NULL REFERENCES wallet_ledger\(id\)/],
    ['user_id', /user_id\s+TEXT NOT NULL REFERENCES users\(id\)/],
    ['amount_micro_usd', /amount_micro_usd\s+BIGINT NOT NULL/],
    ['created_at', /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/]
  ];
  columns.forEach(([name, re]) => assert.match(body, re, 'missing or malformed column: ' + name));
  assert.match(body, /amount_micro_usd\s*>\s*0/, 'an allocation is always a positive amount');
  assert.match(body, /UNIQUE\s*\(lot_id,\s*ledger_id\)/, 'a settlement can allocate to a given lot only once');
  assert.match(sql, /CREATE INDEX IF NOT EXISTS\s+\w+\s+ON subscription_bonus_allocations \(ledger_id\)/, 'the ledger -> allocations lookup is indexed');

  assert.match(sql, /CREATE OR REPLACE FUNCTION\s+\w+\(\)\s+RETURNS trigger/i, 'an immutability trigger function');
  assert.match(sql, /RAISE EXCEPTION/, 'the trigger refuses the change');
  assert.match(sql, /CREATE TRIGGER\s+subscription_bonus_allocations_immutable\s+BEFORE UPDATE OR DELETE ON subscription_bonus_allocations/i, 'UPDATE and DELETE of an allocation are both rejected by the database itself');
});

test('065 is additive only and idempotent: no destructive statement, no edit of an existing table, IF NOT EXISTS everywhere', async () => {
  const sql = await read('server', 'db', 'migrations', MIGRATION);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN|INDEX|SCHEMA)/i);
  assert.doesNotMatch(sql, /\b(TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+\s+SET|INSERT\s+INTO)\b/i, 'no data is rewritten or backfilled');
  assert.doesNotMatch(sql, /CONCURRENTLY/i, 'a plain .sql migration runs inside a transaction');
  assert.doesNotMatch(sql, /ALTER TABLE\s+(?!subscription_bonus_)/i, 'no existing table is altered');
  assert.equal((sql.match(/CREATE TABLE(?! IF NOT EXISTS)/gi) || []).length, 0, 'every CREATE TABLE is IF NOT EXISTS');
  assert.equal((sql.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/gi) || []).length, 0, 'every CREATE INDEX is IF NOT EXISTS');
});

test('the migration runner will pick 065 up: migrations are applied in numeric filename order', async () => {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  assert.ok(files.indexOf(MIGRATION) > files.indexOf('064_discount_codes.sql'));
  assert.equal(files[files.length - 1], MIGRATION, '065 is the newest migration');
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

test('repo.memory.mjs and repo.pg.mjs expose IDENTICAL subscriptionBonus method surfaces and both register the domain', async () => {
  const [memory, pg] = await Promise.all([read('server', 'db', 'repo.memory.mjs'), read('server', 'db', 'repo.pg.mjs')]);
  const memoryMethods = methodNames(domainBlock(memory, 'subscriptionBonus'));
  const pgMethods = methodNames(domainBlock(pg, 'subscriptionBonus'));
  assert.deepEqual(memoryMethods, pgMethods, 'memory and PG method sets must match exactly');
  ['allocationsForLedgerIds', 'getByTransactionId', 'grant', 'listByTransactionIds', 'reverseForRefund'].forEach((method) => {
    assert.ok(memoryMethods.includes(method), 'subscriptionBonus is missing ' + method);
  });
  memoryMethods.forEach((method) => assert.doesNotMatch(method, /^(update|delete|remove|set|edit|patch)/i, method + ': allocations are immutable'));
  for (const [label, source] of [['memory', memory], ['pg', pg]]) {
    assert.match(source.slice(source.lastIndexOf('\n  return {')), /\bsubscriptionBonus\b/, label + ': subscriptionBonus must be registered on the repo object');
  }
});

test('PostgreSQL grant: ONE transaction - account row lock first, refund check, ledger + balance + lot together, unique violation mapped', async () => {
  const pg = await read('server', 'db', 'repo.pg.mjs');
  const block = domainBlock(pg, 'subscriptionBonus');
  const grant = block.slice(block.indexOf('async grant('), block.indexOf('async reverseForRefund('));
  assert.ok(grant.length > 50, 'grant() must be found');
  assert.match(grant, /BEGIN/);
  assert.match(grant, /COMMIT/);
  assert.match(grant, /ROLLBACK/);
  const accountLock = grant.search(/FROM wallet_accounts WHERE user_id\s*=\s*\$1 FOR UPDATE/);
  assert.ok(accountLock > -1, 'grant locks the wallet_accounts row');
  const refundCheck = grant.search(/type\s*=\s*'refund'[^;`]*originalTransactionId/);
  assert.ok(refundCheck > accountLock, 'the refund-exists check happens AFTER the account lock, inside the same transaction (closes the repair/refund race)');
  const lotInsert = grant.search(/INSERT INTO subscription_bonus_lots/);
  assert.ok(lotInsert > refundCheck, 'the lot is inserted after the checks');
  assert.match(grant, /INSERT INTO wallet_ledger/, 'the SUBSCRIPTION_BONUS ledger row is written by the same transaction (no separate wallet.grant call)');
  assert.match(grant, /promo_balance_micro_usd\s*=\s*promo_balance_micro_usd\s*\+/, 'and so is the promo balance credit');
  assert.match(grant, /REFUNDED/);
  assert.match(grant, /23505/);
  assert.equal((grant.match(/COMMIT/g) || []).length >= 1, true);
});

test('PostgreSQL reversal: account lock BEFORE the lot lock, amount is the lot\'s own remainder (never derived from the aggregate promo balance), idempotent', async () => {
  const pg = await read('server', 'db', 'repo.pg.mjs');
  const block = domainBlock(pg, 'subscriptionBonus');
  const reversal = block.slice(block.indexOf('async reverseForRefund('), block.indexOf('async getByTransactionId('));
  assert.ok(reversal.length > 50, 'reverseForRefund() must be found');
  const accountLock = reversal.search(/FROM wallet_accounts WHERE user_id\s*=\s*\$1 FOR UPDATE/);
  const lotLock = reversal.search(/FROM subscription_bonus_lots[^`;]*FOR UPDATE/);
  assert.ok(accountLock > -1 && lotLock > -1, 'both rows are locked');
  assert.ok(accountLock < lotLock, 'lock order: wallet_accounts first, lot second - the same order settle() takes');
  assert.match(reversal, /original_micro_usd\s*-\s*\w*\.?consumed_micro_usd|Number\(\w+\.original_micro_usd\)\s*-\s*Number\(\w+\.consumed_micro_usd\)/, 'the reversed amount is original - consumed');
  assert.doesNotMatch(reversal, /(LEAST|GREATEST)\s*\([^)]*promo_balance_micro_usd/i, 'never clamped by, or derived from, the aggregate promo balance');
  assert.doesNotMatch(reversal, /Math\.(min|max)\([^)]*(promo|balance)/i);
  assert.match(reversal, /INSERT INTO wallet_ledger/, 'the reversal ledger row (also the zero-amount one) is written in the same transaction');
  assert.match(reversal, /UPDATE subscription_bonus_lots/);
  assert.match(reversal, /status\s*=\s*'reversed'/);
  assert.match(reversal, /BEGIN/);
  assert.match(reversal, /COMMIT/);
  assert.match(reversal, /ROLLBACK/);
  assert.match(reversal, /duplicate/, 'a second reversal is reported as a duplicate, never applied twice');
});

test('PostgreSQL settle: lot allocation happens INSIDE the settlement transaction, after the account lock, FIFO by (granted_at, seq), before COMMIT', async () => {
  const pg = await read('server', 'db', 'repo.pg.mjs');
  const wallet = domainBlock(pg, 'wallet');
  const settle = wallet.slice(wallet.indexOf('async settle('), wallet.indexOf('async release('));
  assert.ok(settle.length > 200, 'settle() must be found');
  const accountLock = settle.search(/FROM wallet_accounts WHERE user_id\s*=\s*\$1 FOR UPDATE/);
  const lotLock = settle.search(/FROM subscription_bonus_lots[^`;]*FOR UPDATE/);
  const ledgerInsert = settle.search(/INSERT INTO wallet_ledger/);
  const allocationInsert = settle.search(/INSERT INTO subscription_bonus_allocations/);
  const commit = settle.lastIndexOf("client.query('COMMIT')");
  assert.ok(accountLock > -1 && lotLock > accountLock, 'account row first, then the lot rows');
  assert.match(settle, /FROM subscription_bonus_lots[^`;]*status\s*=\s*'active'[^`;]*ORDER BY granted_at,\s*seq[^`;]*FOR UPDATE/, 'active lots, oldest grant first, ties by insertion order');
  assert.ok(allocationInsert > ledgerInsert && ledgerInsert > lotLock, 'ledger row exists before the allocations that reference it');
  assert.ok(commit > allocationInsert, 'lot consumption, allocations and the ledger row commit together');
  assert.match(settle, /UPDATE subscription_bonus_lots SET consumed_micro_usd/, 'lot consumption is updated in the same transaction');
  assert.match(settle, /23505/, 'the duplicate-settlement path still rolls the whole transaction back (allocations included)');
});

test('memory settle mirrors it: lots first in (grantedAt, seq) order, allocations recorded in the same synchronous block', async () => {
  const memory = await read('server', 'db', 'repo.memory.mjs');
  const wallet = domainBlock(memory, 'wallet');
  const settle = wallet.slice(wallet.indexOf('async settle('), wallet.indexOf('async release('));
  assert.match(settle, /subscriptionBonusLots/);
  assert.match(settle, /subscriptionBonusAllocations/);
  assert.match(settle, /grantedAt/);
  assert.match(settle, /\.seq\b/);
  assert.doesNotMatch(settle, /await/, 'no await inside the memory settle: check-and-write is one atomic step');
});

test('server-authoritative: no caller can pass lot amounts - settleAiCall and the internal bridge never mention lots', async () => {
  const [walletService, internal] = await Promise.all([read('server', 'commercial', 'wallet-service.mjs'), read('server', 'community', 'routes.internal.mjs')]);
  assert.doesNotMatch(walletService, /subscriptionBonus|bonusLot|lotId/i);
  assert.doesNotMatch(internal, /subscriptionBonus|bonusLot|lotId/i);
});

test('AI_SETTLEMENT ledger rows are written ONLY by the two repositories\' wallet.settle(), so no path can spend a lot without an allocation', async () => {
  const dirs = ['server'];
  const offenders = [];
  async function walk(dir) {
    for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(rel); continue; }
      if (!entry.name.endsWith('.mjs')) continue;
      const src = await read(...rel.split(path.sep));
      const writesSettlement = /INSERT INTO wallet_ledger[^;]*'AI_SETTLEMENT'/.test(src) || /type:\s*'AI_SETTLEMENT'/.test(src);
      if (writesSettlement && !/repo\.(pg|memory)\.mjs$/.test(entry.name)) offenders.push(rel);
    }
  }
  for (const dir of dirs) await walk(dir);
  assert.deepEqual(offenders, [], 'these files write AI_SETTLEMENT ledger rows outside the repositories');
});

test('subscription-bonus.mjs goes through the lot domain: grant and reversal use repo.subscriptionBonus, not a bare wallet.grant with a computed amount', async () => {
  const src = await read('server', 'commercial', 'subscription-bonus.mjs');
  assert.match(src, /repo\.subscriptionBonus\.grant\(/);
  assert.match(src, /repo\.subscriptionBonus\.reverseForRefund\(/);
  assert.doesNotMatch(src, /type:\s*'SUBSCRIPTION_BONUS_REVERSAL'/, 'the reversal amount is decided inside the repository, under the locks');
  assert.doesNotMatch(src, /-Math\.abs\(grant\.promoDeltaMicroUsd\)/, 'the old full-amount reversal is gone');
});
