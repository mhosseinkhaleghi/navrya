import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
let migrationSql;

test.before(async () => {
  migrationSql = await readFile(path.join(root, 'server', 'db', 'migrations', '056_gemini_text_model_pricing.sql'), 'utf8');
});

test('migration 056 seeds every selectable Gemini Chat model with the published Standard text rates', () => {
  const normalized = migrationSql.replace(/\s+/g, ' ');
  assert.match(normalized, /'gemini', 'gemini-3\.1-pro-preview', 0\.0020, 0\.0120, 0\.00020, 'USD', true/);
  assert.match(normalized, /'gemini', 'gemini-2\.5-flash', 0\.0003, 0\.0025, 0\.00003, 'USD', true/);
  assert.match(normalized, /'gemini', 'gemini-2\.5-flash-lite', 0\.0001, 0\.0004, 0\.00001, 'USD', true/);
});

test('migration 056 is additive and preserves an existing admin-managed model rate', () => {
  assert.match(migrationSql, /ON CONFLICT \(provider, model\) DO NOTHING;/);
  assert.doesNotMatch(migrationSql, /\b(UPDATE|DELETE|DROP|ALTER)\b/i);
});

test('migration 056 is the only migration using its sequence number', async () => {
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((name) => name.startsWith('056_'));
  assert.deepEqual(files, ['056_gemini_text_model_pricing.sql']);
});
