import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { createPgRepo } from '../server/db/repo.pg.mjs';

// Structural contract of migrations 068-070 (no database needed - the real-PostgreSQL behaviour is proven by
// tests/referral-postgres-integration.test.mjs) plus the memory <-> PostgreSQL method-surface parity of the referral
// repository domains.
const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '..', 'server', 'db', 'migrations');
const read = (name) => readFileSync(path.join(migrationsDir, name), 'utf8');
const sql068 = read('068_referral_programs.sql');
const sql069 = read('069_referral_attribution_earnings.sql');
const sql070 = read('070_referral_payouts.sql');
const all = sql068 + sql069 + sql070;
// Executable SQL only - comments explain intent and may legitimately contain words like "floats" or "real".
const code = (sql) => sql.replace(/--.*$/gm, '');

test('migrations 068-070 exist, sort after every earlier migration and are additive only', () => {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  const index = (prefix) => files.findIndex((name) => name.startsWith(prefix));
  assert.ok(index('068_') > index('066_') && index('069_') === index('068_') + 1 && index('070_') === index('069_') + 1);
  assert.doesNotMatch(code(all), /DROP\s+TABLE|TRUNCATE|DROP\s+COLUMN|ALTER\s+TABLE\s+\w+\s+DROP\s+COLUMN/i, 'no destructive DDL');
  // The only DROP allowed is the guarded wallet_ledger CHECK replacement (same pattern as 064) and idempotent trigger re-creation.
  const drops = code(all).match(/DROP\s+\w+/gi) || [];
  assert.ok(drops.every((d) => /TRIGGER|CONSTRAINT/i.test(d)), 'only TRIGGER/CONSTRAINT drops: ' + drops.join(','));
  assert.match(all, /CREATE TABLE IF NOT EXISTS/);
  assert.doesNotMatch(all, /CREATE TABLE (?!IF NOT EXISTS)/);
});

test('068: program versions are immutable once published, one published version per program, one platform default', () => {
  assert.match(sql068, /referral_program_versions_guard_immutable/);
  assert.match(sql068, /IF OLD\.status <> 'draft' THEN/);
  assert.match(sql068, /referral_program_versions_single_published_uidx[^;]*WHERE status = 'published'/);
  assert.match(sql068, /referral_programs_single_default_uidx[^;]*WHERE is_platform_default = true/);
  assert.match(sql068, /BEFORE DELETE ON referral_program_versions/);
  for (const column of ['commission_bps', 'hold_days', 'cash_out_minimum_micro_usd', 'program_budget_cap_micro_usd', 'per_user_cap_micro_usd', 'min_margin_micro_usd', 'payout_asset_policy', 'eligible_sources', 'rules_hash']) {
    assert.match(sql068, new RegExp(column));
  }
});
test('068: a wallet top-up can never be an eligible commission source (CHECK), and money/rates are integers', () => {
  assert.match(sql068, /eligible_sources <@ ARRAY\['subscription', 'storage_purchase', 'ai_margin'\]::text\[\]/);
  assert.doesNotMatch(sql068.replace(/--.*$/gm, ''), /wallet_topup/, 'wallet_topup does not appear in any executable statement of 068');
  assert.doesNotMatch(code(all), /\b(FLOAT|REAL|DOUBLE PRECISION)\b|NUMERIC\(\d+,\s*[1-9]\d*\)/i, 'no floating point / fractional money columns');
  assert.match(sql068, /commission_bps\s+INT NOT NULL CHECK \(commission_bps BETWEEN 0 AND 10000\)/);
});
test('068: partner assignments are their own audited domain - one active per user, terms immutable, never touching profile_role', () => {
  assert.match(sql068, /referral_partner_assignments_single_active_uidx[^;]*WHERE status = 'active'/);
  assert.match(sql068, /referral_partner_assignments_guard_immutable/);
  assert.match(sql068, /CHECK \(mode <> 'influencer' OR program_version_id IS NOT NULL\)/);
  assert.match(sql068, /created_by\s+TEXT NOT NULL REFERENCES users\(id\)/);
  assert.doesNotMatch(all.replace(/--.*$/gm, ''), /profile_role/, 'the user-editable profile role is never referenced by the SQL');
});

test('069: attribution is unique per referred user with a self-referral backstop and a frozen rules snapshot', () => {
  assert.match(sql069, /referred_user_id\s+TEXT NOT NULL UNIQUE REFERENCES users\(id\)/);
  assert.match(sql069, /CHECK \(referrer_user_id <> referred_user_id\)/);
  assert.match(sql069, /rules_snapshot\s+JSONB NOT NULL/);
});
test('069: earning lots carry the bucket CHECK, a per-payment idempotency identity and never a wallet_topup source', () => {
  assert.match(sql069, /CHECK \(ai_converted_micro_usd \+ payout_reserved_micro_usd \+ paid_micro_usd \+ reversed_micro_usd <= original_micro_usd\)/);
  assert.match(sql069, /UNIQUE \(source, source_event_id\)/);
  assert.match(sql069, /payment_transaction_id\s+TEXT UNIQUE REFERENCES payment_transactions\(id\)/);
  assert.match(sql069, /source\s+TEXT NOT NULL CHECK \(source IN \('subscription', 'storage_purchase', 'ai_margin'\)\)/);
});
test('069: the ledger, conversions, reversals and attempts are append-only and the ledger is idempotent', () => {
  for (const table of ['referral_ledger_entries', 'referral_ai_conversions', 'referral_reversals', 'referral_attribution_attempts']) {
    assert.match(sql069, new RegExp(`BEFORE UPDATE OR DELETE ON ${table}`));
  }
  assert.match(sql069, /idempotency_key\s+TEXT NOT NULL UNIQUE/);
  for (const state of ['pending', 'available_cash', 'ai_converted', 'payout_reserved', 'paid', 'reversed', 'debt']) {
    assert.match(sql069, new RegExp(`'${state}'`), 'ledger state ' + state);
  }
});
test('069: the wallet ledger CHECK is widened with REFERRAL_AI_CONVERSION and keeps every earlier type', () => {
  const sql064 = read('064_discount_codes.sql');
  const listed = (sql) => (sql.match(/wallet_ledger_type_check CHECK \(type IN \(([\s\S]*?)\)\);/) || [])[1].match(/'[A-Z_]+'/g);
  const earlier = listed(sql064);
  const widened = listed(sql069);
  for (const type of earlier) assert.ok(widened.includes(type), 'kept ' + type);
  assert.ok(widened.includes("'REFERRAL_AI_CONVERSION'"));
  assert.match(sql069, /pg_get_constraintdef\(oid\) LIKE '%AI_SETTLEMENT%'/, 'finds the old constraint by definition, never by a guessed name');
});

test('070: payout requests pin BSC (56), keep amount/recipient immutable and enforce the state machine in the database', () => {
  assert.match(sql070, /chain_id\s+INT NOT NULL CHECK \(chain_id = 56\)/);
  assert.match(sql070, /referral_payout_requests_guard/);
  assert.match(sql070, /amount, recipient, asset and policy are immutable/);
  for (const [from, to] of [['requested', 'under_review'], ['under_review', 'approved'], ['approved', 'submitted'], ['submitted', 'confirmed'], ['confirmed', 'paid']]) {
    assert.match(sql070, new RegExp(`OLD\\.status = '${from}'\\s+AND NEW\\.status IN \\([^)]*'${to}'`));
  }
  assert.match(sql070, /status <> 'paid' OR \(paid_at IS NOT NULL AND finalized_by IS NOT NULL\)/);
  assert.match(sql070, /status NOT IN \('submitted', 'confirmed', 'paid'\) OR tx_hash IS NOT NULL/);
});
test('070: the transaction hash is unique and lower-case hex; the recipient is encrypted, hashed and masked - never stored plaintext', () => {
  assert.match(sql070, /referral_payout_requests_tx_hash_uidx[^;]*WHERE tx_hash IS NOT NULL/);
  assert.match(sql070, /tx_hash ~ '\^0x\[0-9a-f\]\{64\}\$'/);
  assert.match(sql070, /recipient_address_enc\s+TEXT NOT NULL/);
  assert.match(sql070, /recipient_address_hash\s+TEXT NOT NULL/);
  assert.match(sql070, /recipient_masked\s+TEXT NOT NULL/);
  assert.doesNotMatch(sql070.replace(/--.*$/gm, ''), /recipient_address\s+TEXT/, 'no plaintext recipient column');
  assert.match(sql070, /UNIQUE \(user_id, idempotency_key\)/);
});
test('070: payout events and lot allocations are append-only; an allocation targets exactly one of conversion / payout', () => {
  assert.match(sql070, /BEFORE UPDATE OR DELETE ON referral_payout_events/);
  assert.match(sql070, /BEFORE UPDATE OR DELETE ON referral_lot_allocations/);
  assert.match(sql070, /kind = 'ai_conversion' AND conversion_id IS NOT NULL AND payout_request_id IS NULL/);
  assert.match(sql070, /kind = 'payout_reservation' AND payout_request_id IS NOT NULL AND conversion_id IS NULL/);
});
test('the documented lock order appears in the migration and both repository implementations', () => {
  const order = 'wallet_accounts -> referral_programs -> referral_accounts -> referral_earning_lots (by seq) -> referral_payout_requests';
  assert.ok(sql069.includes(order));
  assert.ok(readFileSync(path.join(here, '..', 'server', 'db', 'referral-repo.pg.mjs'), 'utf8').includes(order));
});

// --- memory <-> PostgreSQL method-surface parity ------------------------------------------------------------
const DOMAINS = ['referralPrograms', 'referral', 'referralEarnings', 'referralPayouts', 'referralReports'];
const fakePool = { query: async () => ({ rows: [], rowCount: 0 }), connect: async () => ({ query: async () => ({ rows: [] }), release() {} }) };

test('the memory and PostgreSQL repositories expose the same referral domains', () => {
  const memory = createMemoryRepo();
  const pg = createPgRepo(fakePool);
  for (const domain of DOMAINS) {
    assert.ok(memory[domain], 'memory has ' + domain);
    assert.ok(pg[domain], 'pg has ' + domain);
  }
});
test('every referral domain has the identical method names in both repositories (no method can exist in only one backend)', () => {
  const memory = createMemoryRepo();
  const pg = createPgRepo(fakePool);
  for (const domain of DOMAINS) {
    assert.deepEqual(Object.keys(pg[domain]).sort(), Object.keys(memory[domain]).sort(), domain + ' method surface');
    for (const name of Object.keys(memory[domain])) {
      assert.equal(typeof pg[domain][name], 'function', `${domain}.${name} is a function in pg`);
      assert.equal(pg[domain][name].length, memory[domain][name].length, `${domain}.${name} takes the same number of arguments`);
    }
  }
});
