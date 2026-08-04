import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// pattern-registry-store.js is not executed in a vm sandbox here for the same reason
// session-workspace-logic.js isn't (see tests/trading-sessions-sync.test.mjs's header comment) -
// static source assertions for the wiring, backed by real dynamic coverage of the underlying
// mechanism in tests/sync-queue.test.mjs and the server-side contract in
// tests/patterns-api-contract.test.mjs.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

test('pattern-registry-store.js registers a patterns sender that POSTs upserts to /api/sync/patterns and DELETEs on the delete action', async () => {
  const text = await source('pattern-registry-store.js');
  assert.match(text, /queue\.registerModule\('patterns'/);
  assert.match(text, /fetch\('\/api\/sync\/patterns',\s*\{\s*\n?\s*method:\s*'POST'/);
  assert.match(text, /fetch\('\/api\/sync\/patterns\/'\s*\+\s*encodeURIComponent\(entry\.recordId\),\s*\{\s*method:\s*'DELETE'/);
});

test('save(), create(), and remove() each enqueue to the sync queue right after their own write() call', async () => {
  const text = await source('pattern-registry-store.js');
  assert.match(text, /write\(items\);\s*\n\s*if\s*\(window\.TradeJournalSyncQueue\)\s*window\.TradeJournalSyncQueue\.enqueue\('patterns',\s*value\.id,\s*value\);\s*\n\s*return value;/);
  assert.match(text, /write\(items\);\s*\n\s*if\s*\(window\.TradeJournalSyncQueue\)\s*window\.TradeJournalSyncQueue\.enqueue\('patterns',\s*pattern\.id,\s*pattern\);\s*\n\s*return pattern;/);
  assert.match(text, /if\s*\(window\.TradeJournalSyncQueue\)\s*window\.TradeJournalSyncQueue\.enqueue\('patterns',\s*id,\s*null,\s*'delete'\);/);
});

test('the one-time activation checks the server BEFORE deciding whether to seed/push local defaults, to avoid duplicating a different browser\'s already-synced patterns', async () => {
  const text = await source('pattern-registry-store.js');
  assert.match(text, /function migrateOrAdopt\(\)/);
  assert.match(text, /tradejournal:patterns-migrated:v1:'\s*\+\s*uid/);
  assert.match(text, /if\s*\(result\s*&&\s*Array\.isArray\(result\.patterns\)\s*&&\s*result\.patterns\.length\)\s*\{\s*\n\s*write\(result\.patterns\);/);
  assert.match(text, /read\(\)\.forEach\(function\s*\(pattern\)\s*\{\s*queue\.enqueue\('patterns',\s*pattern\.id,\s*pattern\);/);
});

test("addScreenshots() passes 'pattern' as the category to TradeJournalImageStore.saveImage()", async () => {
  const text = await source('pattern-registry-store.js');
  assert.match(text, /await window\.TradeJournalImageStore\.saveImage\(image\.blobId, file, 'pattern'\);/);
});

test("TradeJournalImageStore.saveImage() derives the sync-queue module name from category (category + '-images'), not a hardcoded name, since multiple modules now share it", async () => {
  const text = await source('session-entry-flow.js');
  assert.match(text, /TradeJournalSyncQueue\.enqueue\(category\+'-images',id,\{dataUrl:dataUrl,category:category\}\)/);
});

test('all four character pages load sync-queue.js before pattern-registry-store.js', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const queueIndex = html.indexOf('sync-queue.js');
    assert.ok(queueIndex > -1, character + ': sync-queue.js present');
    assert.ok(queueIndex < html.indexOf('pattern-registry-store.js'), character + ': sync-queue before pattern-registry-store');
  }
});
