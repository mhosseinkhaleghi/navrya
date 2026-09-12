import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract test against the real migration SQL text - no live Postgres required, same
// precedent as tests/learned-commands-migration-contract.test.mjs (see that file's own header
// comment for why this repo verifies new migrations this way).

const root = process.cwd();
let migrationSql;

test.before(async () => {
  migrationSql = await readFile(path.join(root, 'server', 'db', 'migrations', '058_support_tickets.sql'), 'utf8');
});

test('058_support_tickets.sql creates support_tickets with every required column', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS support_tickets \(([\s\S]*?)\n\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement for support_tickets');
  const body = tableMatch[1];
  const requiredColumns = [
    ['id', /id\s+TEXT PRIMARY KEY/],
    ['user_id', /user_id\s+TEXT NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/],
    ['subject', /subject\s+TEXT NOT NULL/],
    ['category', /category\s+TEXT NOT NULL CHECK \(category IN \('technical','billing','account','other'\)\)/],
    ['status', /status\s+TEXT NOT NULL DEFAULT 'open' CHECK \(status IN \('open','waiting_user','resolved','closed'\)\)/],
    ['last_activity_at', /last_activity_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/],
    ['owner_unread', /owner_unread\s+BOOLEAN NOT NULL DEFAULT false/],
    ['created_at', /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/],
    ['updated_at', /updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/]
  ];
  requiredColumns.forEach(([name, re]) => assert.match(body, re, 'missing or malformed column: ' + name));
});

test('058_support_tickets.sql creates support_ticket_messages with every required column', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS support_ticket_messages \(([\s\S]*?)\n\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement for support_ticket_messages');
  const body = tableMatch[1];
  assert.match(body, /id\s+TEXT PRIMARY KEY/);
  assert.match(body, /ticket_id\s+TEXT NOT NULL REFERENCES support_tickets\(id\) ON DELETE CASCADE/);
  assert.match(body, /author_id\s+TEXT NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(body, /author_role\s+TEXT NOT NULL CHECK \(author_role IN \('user','staff'\)\)/);
  assert.match(body, /content\s+TEXT NOT NULL/);
  assert.match(body, /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
});

test('058_support_tickets.sql creates community_notification_cursors keyed by user_id', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS community_notification_cursors \(([\s\S]*?)\n\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement for community_notification_cursors');
  const body = tableMatch[1];
  assert.match(body, /user_id\s+TEXT PRIMARY KEY REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(body, /last_seen_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
});

test('058_support_tickets.sql declares the expected indexes', () => {
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets \(user_id, last_activity_at DESC\);/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets \(status, last_activity_at DESC\);/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON support_ticket_messages \(ticket_id, created_at\);/);
});

test('the migration is purely additive - CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS throughout, never ALTER/DROP on a pre-existing table', () => {
  assert.doesNotMatch(migrationSql, /ALTER TABLE/);
  assert.doesNotMatch(migrationSql, /DROP (TABLE|COLUMN|INDEX)/i);
});

test('058 is a real, uniquely-numbered migration file (a later migration, e.g. 059, may legitimately extend the same table)', async () => {
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((f) => f.endsWith('.sql'));
  const own = files.filter((f) => f.startsWith('058_'));
  assert.equal(own.length, 1, 'exactly one migration file must claim number 058');
  assert.equal(own[0], '058_support_tickets.sql');
});
