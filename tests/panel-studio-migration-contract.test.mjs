import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract test against the real migration SQL text - no live Postgres required, same
// precedent as tests/support-tickets-migration-contract.test.mjs.

const root = process.cwd();
let migrationSql;

test.before(async () => {
  migrationSql = await readFile(path.join(root, 'server', 'db', 'migrations', '076_panel_studio_artifacts.sql'), 'utf8');
});

test('076 creates panel_studio_artifacts with every required column', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS panel_studio_artifacts \(([\s\S]*?)\n\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement for panel_studio_artifacts');
  const body = tableMatch[1];
  const requiredColumns = [
    ['id', /id\s+TEXT PRIMARY KEY/],
    ['user_id', /user_id\s+TEXT NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/],
    ['target', /target\s+TEXT NOT NULL CHECK \(target IN \('dashboard\.panel'\)\)/],
    ['title', /title\s+TEXT NOT NULL/],
    ['status', /status\s+TEXT NOT NULL DEFAULT 'draft' CHECK \(status IN \('draft','ready','applied','archived'\)\)/],
    ['current_revision_id', /current_revision_id\s+TEXT/],
    ['applied_revision_id', /applied_revision_id\s+TEXT/],
    ['created_at', /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/],
    ['updated_at', /updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/]
  ];
  requiredColumns.forEach(([name, re]) => assert.match(body, re, 'missing or malformed column: ' + name));
});

test('076 creates panel_studio_revisions with every required column and its own size/enum guardrails', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS panel_studio_revisions \(([\s\S]*?)\n\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement for panel_studio_revisions');
  const body = tableMatch[1];
  assert.match(body, /id\s+TEXT PRIMARY KEY/);
  assert.match(body, /artifact_id\s+TEXT NOT NULL REFERENCES panel_studio_artifacts\(id\) ON DELETE CASCADE/);
  assert.match(body, /revision_number\s+INTEGER NOT NULL/);
  assert.match(body, /source\s+TEXT NOT NULL CHECK \(octet_length\(source\) <= 12288\)/, 'source byte ceiling must mirror dashboardPanelBuilder.MAX_SOURCE_BYTES (12KB)');
  assert.match(body, /source_kind\s+TEXT NOT NULL CHECK \(source_kind IN \('generated','manual-edit','restore'\)\)/);
  assert.match(body, /prompt\s+TEXT CHECK \(prompt IS NULL OR char_length\(prompt\) <= 400\)/, 'prompt char ceiling must mirror dashboardPanelBuilder.MAX_PROMPT_CHARS (400)');
  assert.match(body, /restored_from_revision_id\s+TEXT REFERENCES panel_studio_revisions\(id\)/);
  assert.match(body, /provider\s+TEXT CHECK \(provider IS NULL OR provider IN \('openai','anthropic'\)\)/);
  assert.match(body, /coding_engine_id\s+TEXT CHECK \(coding_engine_id IS NULL OR coding_engine_id IN \('codex','claude-code'\)\)/);
  assert.match(body, /created_by\s+TEXT NOT NULL REFERENCES users\(id\)/);
  assert.match(body, /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
});

test('076 declares the expected indexes, including a per-artifact unique revision-number index', () => {
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS panel_studio_artifacts_user_idx ON panel_studio_artifacts \(user_id, updated_at DESC\);/);
  assert.match(migrationSql, /CREATE UNIQUE INDEX IF NOT EXISTS panel_studio_revisions_number_idx ON panel_studio_revisions \(artifact_id, revision_number\);/);
});

test('current_revision_id and applied_revision_id are independent nullable FK pointers, added via ALTER so the two tables never form a circular insert dependency', () => {
  assert.match(migrationSql, /ADD CONSTRAINT panel_studio_artifacts_current_revision_fkey FOREIGN KEY \(current_revision_id\) REFERENCES panel_studio_revisions\(id\) ON DELETE SET NULL/);
  assert.match(migrationSql, /ADD CONSTRAINT panel_studio_artifacts_applied_revision_fkey FOREIGN KEY \(applied_revision_id\) REFERENCES panel_studio_revisions\(id\) ON DELETE SET NULL/);
  // Unlike 041_conversation_scenarios.sql, no DEFERRABLE constraint modifier is actually used on
  // either FK here - the artifact row is always inserted (with both pointers NULL) before its
  // first revision can reference it, so there is no circular-insert problem to defer around.
  const alterBlock = /ALTER TABLE panel_studio_artifacts[\s\S]*?;/.exec(migrationSql);
  assert.ok(alterBlock, 'could not find the ALTER TABLE block adding the two FK constraints');
  assert.doesNotMatch(alterBlock[0], /DEFERRABLE/);
});

test('076 is a real, uniquely-numbered migration file', async () => {
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((f) => f.endsWith('.sql'));
  const own = files.filter((f) => f.startsWith('076_'));
  assert.equal(own.length, 1, 'exactly one migration file must claim number 076');
  assert.equal(own[0], '076_panel_studio_artifacts.sql');
});
