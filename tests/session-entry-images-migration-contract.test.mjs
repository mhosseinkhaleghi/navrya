import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract test against the real migration SQL text - no live Postgres required, same
// precedent as tests/media-assets-migration-contract.test.mjs.

const root = process.cwd();
let migrationSql;

test.before(async () => {
  migrationSql = await readFile(path.join(root, 'server', 'db', 'migrations', '061_session_entry_images.sql'), 'utf8');
});

test('061_session_entry_images.sql creates trading_session_entry_images with every required column', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS trading_session_entry_images \(([\s\S]*?)\n\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement');
  const body = tableMatch[1];
  const requiredColumns = [
    ['id', /id\s+TEXT PRIMARY KEY/],
    ['entry_id', /entry_id\s+TEXT NOT NULL REFERENCES trading_session_entries\(id\) ON DELETE CASCADE/],
    ['session_id', /session_id\s+TEXT NOT NULL REFERENCES trading_sessions\(id\) ON DELETE CASCADE/],
    ['order_index', /order_index\s+INTEGER NOT NULL DEFAULT 0/],
    ['media_asset_id', /media_asset_id\s+TEXT REFERENCES media_assets\(id\)/],
    ['image_blob_id', /image_blob_id\s+TEXT/],
    ['image_url', /image_url\s+TEXT/],
    ['timeframe', /timeframe\s+TEXT/],
    ['detected_timeframe', /detected_timeframe\s+TEXT/],
    ['created_at', /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/]
  ];
  requiredColumns.forEach(([name, re]) => assert.match(body, re, 'missing or malformed column: ' + name));
});

test('061 declares an entry_id/order_index index', () => {
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS trading_session_entry_images_entry_idx ON trading_session_entry_images \(entry_id, order_index\);/);
});

test('the migration is purely additive - never touches trading_session_entries or any other pre-existing table', () => {
  assert.doesNotMatch(migrationSql, /ALTER TABLE/);
  assert.doesNotMatch(migrationSql, /DROP (TABLE|COLUMN|INDEX)/i);
});

test('061 is a real, uniquely-numbered migration file', async () => {
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((f) => f.endsWith('.sql'));
  const own = files.filter((f) => f.startsWith('061_'));
  assert.equal(own.length, 1, 'exactly one migration file must claim number 061');
  assert.equal(own[0], '061_session_entry_images.sql');
});
