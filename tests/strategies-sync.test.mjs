import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// strategy-education-store.js is not executed in a vm sandbox here for the same reason
// session-workspace-logic.js/pattern-registry-store.js aren't (see
// tests/trading-sessions-sync.test.mjs's header comment) - static source assertions for the
// wiring, backed by real dynamic coverage of the underlying mechanism in
// tests/sync-queue.test.mjs and the server-side contract in
// tests/strategies-api-contract.test.mjs.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

test('strategy-education-store.js registers a strategies sender that POSTs upserts to /api/sync/strategies and DELETEs on the delete action', async () => {
  const text = await source('strategy-education-store.js');
  assert.match(text, /queue\.registerModule\('strategies'/);
  assert.match(text, /fetch\('\/api\/sync\/strategies',\s*\{\s*\n?\s*method:\s*'POST'/);
  assert.match(text, /fetch\('\/api\/sync\/strategies\/'\s*\+\s*encodeURIComponent\(entry\.recordId\),\s*\{\s*method:\s*'DELETE'/);
});

test('create(), save(), and remove() each enqueue to the sync queue right after their own write() call', async () => {
  const text = await source('strategy-education-store.js');
  assert.match(text, /write\(\[strategy\]\.concat\(listSync\(\)\)\);\s*if\s*\(window\.TradeJournalSyncQueue\)\s*window\.TradeJournalSyncQueue\.enqueue\('strategies',\s*strategy\.id,\s*strategy\);\s*return strategy;/);
  assert.match(text, /write\(values\);\s*if\s*\(window\.TradeJournalSyncQueue\)\s*window\.TradeJournalSyncQueue\.enqueue\('strategies',\s*strategy\.id,\s*strategy\);\s*return strategy;/);
  assert.match(text, /if\s*\(window\.TradeJournalSyncQueue\)\s*window\.TradeJournalSyncQueue\.enqueue\('strategies',\s*id,\s*null,\s*'delete'\);/);
});

test("the attachment() factory preserves fileUrl through normalize(), not just blobId/dataUrl - otherwise the 'strategy-images' sender's patched-in server URL would be silently dropped on the next save", async () => {
  const text = await source('strategy-education-store.js');
  assert.match(text, /function attachment\(item, category\) \{ item = item \|\| \{\}; return \{[^}]*fileUrl: item\.fileUrl/);
});

test("addAttachments() only passes 'strategy' as the image-store category for image-type files - non-image attachments (pdf/txt/docx) stay local-only", async () => {
  const text = await source('strategy-education-store.js');
  assert.match(text, /await window\.TradeJournalImageStore\.saveImage\(item\.blobId, file, \/\^image\\\/\/\.test\(file\.type\) \? 'strategy' : undefined\);/);
});

test('the one-time activation checks the server before deciding whether to push local strategies up (protects against a legacy-migration duplicate)', async () => {
  const text = await source('strategy-education-store.js');
  assert.match(text, /function migrateOrAdopt\(\)/);
  assert.match(text, /tradejournal:strategies-migrated:v1:'\s*\+\s*uid/);
  assert.match(text, /if\s*\(result\s*&&\s*Array\.isArray\(result\.strategies\)\s*&&\s*result\.strategies\.length\)\s*\{\s*\n\s*write\(result\.strategies\);/);
  assert.match(text, /listSync\(\)\.forEach\(function\s*\(strategy\)\s*\{\s*queue\.enqueue\('strategies',\s*strategy\.id,\s*strategy\);/);
});

test('all four character pages load sync-queue.js before strategy-education-store.js', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const queueIndex = html.indexOf('sync-queue.js');
    assert.ok(queueIndex > -1, character + ': sync-queue.js present');
    assert.ok(queueIndex < html.indexOf('strategy-education-store.js'), character + ': sync-queue before strategy-education-store');
  }
});
