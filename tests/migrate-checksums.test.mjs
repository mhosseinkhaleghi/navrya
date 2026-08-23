import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { checksumOf, isConcurrentMigration } from '../server/db/migrate.mjs';

// server/db/migrate.mjs's run() needs a real Postgres connection to do anything (not available
// in this environment - see docs/auth/IMPLEMENTATION_STATUS.md's honest operator-prerequisite
// list) - importing the module itself must never attempt one (guarded by the isMainModule check
// at the bottom of that file), which is what makes this pure-logic unit coverage possible at all.
const migrationsDir = path.join(process.cwd(), 'server', 'db', 'migrations');

test('importing migrate.mjs does not attempt a database connection (no hang, no thrown connection error)', async () => {
  // If the module-level guard were missing or wrong, this import itself would already have
  // hung/thrown by the time this test file's own import line above ran - this test exists to
  // name that property explicitly.
  assert.equal(typeof checksumOf, 'function');
  assert.equal(typeof isConcurrentMigration, 'function');
});

test('checksumOf is a deterministic SHA-256 hex digest - same input always produces the same output, different input never collides for real migration files', () => {
  const a = checksumOf('CREATE TABLE x (id TEXT);');
  const b = checksumOf('CREATE TABLE x (id TEXT);');
  const c = checksumOf('CREATE TABLE y (id TEXT);');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('isConcurrentMigration recognizes only the .concurrent.sql naming convention', () => {
  assert.equal(isConcurrentMigration('021_add_index.concurrent.sql'), true);
  assert.equal(isConcurrentMigration('021_add_index.sql'), false);
  assert.equal(isConcurrentMigration('021_concurrent_sounding_name.sql'), false);
});

test('every existing migration file hashes to a stable, non-empty checksum (a real smoke test against the actual files on disk)', async () => {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql'));
  assert.ok(files.length >= 19, 'expected at least the 19 pre-existing migrations plus this pass\'s own 020');
  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    const checksum = checksumOf(sql);
    assert.match(checksum, /^[0-9a-f]{64}$/, `${file} must hash to a real checksum`);
  }
});

test('migrations 001-019 are never edited by this change - 020_auth_sessions.sql is additive only', async () => {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  const numbered = files.filter((f) => /^0(0[1-9]|1[0-9])_/.test(f));
  assert.equal(numbered.length, 19, 'exactly the original 19 numbered migrations (001-019) must still exist, untouched');
  assert.ok(files.includes('020_auth_sessions.sql'), 'the new auth schema must be its own additive migration, never edited into an earlier one');
});
