import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract test against the real migration SQL text - no live Postgres required, same
// precedent as tests/support-tickets-migration-contract.test.mjs/learned-commands-migration-
// contract.test.mjs (see either file's own header comment for why this repo verifies new
// migrations this way).

const root = process.cwd();
let migrationSql;

test.before(async () => {
  migrationSql = await readFile(path.join(root, 'server', 'db', 'migrations', '060_media_assets.sql'), 'utf8');
});

test('060_media_assets.sql creates media_assets with every required column', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS media_assets \(([\s\S]*?)\n\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement for media_assets');
  const body = tableMatch[1];
  const requiredColumns = [
    ['id', /id\s+TEXT PRIMARY KEY/],
    ['user_id', /user_id\s+TEXT NOT NULL REFERENCES users\(id\)/],
    ['storage_object_id', /storage_object_id\s+TEXT NOT NULL REFERENCES storage_objects\(id\)/],
    ['url', /url\s+TEXT NOT NULL/],
    ['kind', /kind\s+TEXT NOT NULL CHECK \(kind IN \('chart','image'\)\)/],
    ['source', /source\s+TEXT NOT NULL DEFAULT 'upload' CHECK \(source IN \('capture','upload'\)\)/],
    ['session_id', /session_id\s+TEXT REFERENCES trading_sessions\(id\)/],
    ['active_market_session', /active_market_session\s+TEXT/],
    ['metadata_status', /metadata_status\s+TEXT NOT NULL DEFAULT 'not_applicable' CHECK \(metadata_status IN \('not_applicable','processing','ready','failed','unavailable'\)\)/],
    ['is_trading_chart', /is_trading_chart\s+BOOLEAN/],
    ['symbol', /symbol\s+TEXT/],
    ['timeframe', /timeframe\s+TEXT/],
    ['confidence', /confidence\s+REAL CHECK \(confidence IS NULL OR \(confidence >= 0 AND confidence <= 1\)\)/],
    ['registered_at', /registered_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/],
    ['created_at', /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/],
    ['deleted_at', /deleted_at\s+TIMESTAMPTZ/]
  ];
  requiredColumns.forEach(([name, re]) => assert.match(body, re, 'missing or malformed column: ' + name));
});

test('060_media_assets.sql creates media_asset_links with every required column and a uniqueness guard', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS media_asset_links \(([\s\S]*?)\n\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement for media_asset_links');
  const body = tableMatch[1];
  assert.match(body, /id\s+TEXT PRIMARY KEY/);
  assert.match(body, /media_asset_id\s+TEXT NOT NULL REFERENCES media_assets\(id\)/);
  assert.match(body, /user_id\s+TEXT NOT NULL REFERENCES users\(id\)/);
  assert.match(body, /domain\s+TEXT NOT NULL CHECK \(domain IN \('sessionEntry','trade','pattern','strategy'\)\)/);
  assert.match(body, /record_id\s+TEXT NOT NULL/);
  assert.match(migrationSql, /CREATE UNIQUE INDEX IF NOT EXISTS media_asset_links_unique_idx ON media_asset_links \(media_asset_id, domain, record_id\);/);
});

test('060_media_assets.sql declares the expected indexes', () => {
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS media_assets_user_recent_idx ON media_assets \(user_id, created_at DESC\) WHERE deleted_at IS NULL;/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS media_assets_user_symbol_idx ON media_assets \(user_id, symbol\) WHERE deleted_at IS NULL;/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS media_assets_user_timeframe_idx ON media_assets \(user_id, timeframe\) WHERE deleted_at IS NULL;/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS media_asset_links_asset_idx ON media_asset_links \(media_asset_id\);/);
});

test('the migration is purely additive - CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS throughout, never ALTER/DROP on a pre-existing table', () => {
  assert.doesNotMatch(migrationSql, /ALTER TABLE/);
  assert.doesNotMatch(migrationSql, /DROP (TABLE|COLUMN|INDEX)/i);
});

test('060 is a real, uniquely-numbered migration file', async () => {
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((f) => f.endsWith('.sql'));
  const own = files.filter((f) => f.startsWith('060_'));
  assert.equal(own.length, 1, 'exactly one migration file must claim number 060');
  assert.equal(own[0], '060_media_assets.sql');
});
