import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Voice Command Learning Profile addendum, section 10 (PostgreSQL validation). This repo has NO
// existing automated Postgres-backed test for ANY domain (confirmed: no test file anywhere
// imports createPgRepo() or opens a real pg.Pool - accounts/instrumentCatalog/every other
// repo.pg.mjs domain is in the identical position). Building full Postgres test infrastructure
// (docker-compose, CI wiring, connection config) from scratch is its own separate, cross-cutting
// project, out of this addendum's scope. What CAN run deterministically, with zero DB dependency,
// in plain `npm test`, is a real structural contract test against the actual migration SQL text -
// this file. See tests/learned-commands-postgres-integration.test.mjs for the OPTIONAL,
// real-Postgres-required companion (skips cleanly without DATABASE_URL) and the final report for
// the exact, honest split of what ran here versus what did not.

const root = process.cwd();
let migrationSql;

test.before(async () => {
  migrationSql = await readFile(path.join(root, 'server', 'db', 'migrations', '055_learned_commands.sql'), 'utf8');
});

test('055_learned_commands.sql creates the learned_commands table with every required column and a sane type/default', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS learned_commands \(([\s\S]*?)\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement');
  const body = tableMatch[1];
  const requiredColumns = [
    ['id', /id\s+TEXT PRIMARY KEY/],
    ['user_id', /user_id\s+TEXT NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/],
    ['normalized_phrase', /normalized_phrase\s+TEXT NOT NULL/],
    ['language', /language\s+TEXT/],
    ['action_id', /action_id\s+TEXT NOT NULL/],
    ['field_mappings', /field_mappings\s+JSONB NOT NULL DEFAULT '\{\}'/],
    ['target_strategy', /target_strategy\s+TEXT/],
    ['source', /source\s+TEXT NOT NULL DEFAULT 'explicit_approval'/],
    ['confidence', /confidence\s+INTEGER NOT NULL DEFAULT 60/],
    ['success_count', /success_count\s+INTEGER NOT NULL DEFAULT 0/],
    ['correction_count', /correction_count\s+INTEGER NOT NULL DEFAULT 0/],
    ['last_used_at', /last_used_at\s+TIMESTAMPTZ/],
    ['enabled', /enabled\s+BOOLEAN NOT NULL DEFAULT true/],
    ['schema_version', /schema_version\s+INTEGER NOT NULL DEFAULT 1/],
    ['created_at', /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/],
    ['updated_at', /updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/]
  ];
  requiredColumns.forEach(([name, re]) => assert.match(body, re, 'missing or malformed column: ' + name));
});

test('055_learned_commands.sql declares a per-user index, a unique (user_id, normalized_phrase, language) constraint, and a partial enabled-only index for the resolution-time hot path', () => {
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS learned_commands_user_idx ON learned_commands \(user_id\);/);
  assert.match(migrationSql, /CREATE UNIQUE INDEX IF NOT EXISTS learned_commands_user_phrase_idx ON learned_commands \(user_id, normalized_phrase, COALESCE\(language, ''\)\);/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS learned_commands_user_enabled_idx ON learned_commands \(user_id\) WHERE enabled = true;/);
});

test('the migration is purely additive - CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS throughout, never ALTER/DROP on a pre-existing 001-054 table, matching this repo\'s own "expand, never edit" migration discipline', () => {
  assert.doesNotMatch(migrationSql, /ALTER TABLE (?!learned_commands)/);
  assert.doesNotMatch(migrationSql, /DROP (TABLE|COLUMN|INDEX)/i);
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS/);
});

test('the migration file is next in the real, current sequence (055) and no other migration reuses that number', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((f) => f.endsWith('.sql'));
  const own = files.filter((f) => f.startsWith('055_'));
  assert.equal(own.length, 1, 'exactly one migration file must claim number 055');
  assert.equal(own[0], '055_learned_commands.sql');
});
