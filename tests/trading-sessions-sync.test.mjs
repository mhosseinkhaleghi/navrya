import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// session-workspace-logic.js is never executed in a vm sandbox anywhere in this project's own
// test suite (see tests/trade-regression.test.mjs) - it overrides Storage.prototype.setItem,
// registers a MutationObserver, and drives setInterval-based render loops, all of which would
// need extensive faking to sandbox safely. This file follows the same established convention
// for that specific file: static source assertions for the wiring, backed by real dynamic
// coverage of the underlying mechanism itself in tests/sync-queue.test.mjs (the outbox/retry/
// backoff behavior, module-agnostic) and tests/trading-sessions-api-contract.test.mjs (the
// server-side idempotent-upsert contract) - together these three files verify "an offline
// write is queued, then reaches the server exactly once on reconnect" end-to-end by layer,
// exactly as the codebase already tests this specific file.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

test('session-workspace-logic.js registers a sessions sender that POSTs upserts to /api/sync/sessions and DELETEs on the delete action', async () => {
  const text = await source('session-workspace-logic.js');
  assert.match(text, /queue\.registerModule\('sessions'/);
  assert.match(text, /fetch\('\/api\/sync\/sessions',\s*\{\s*\n?\s*method:\s*'POST'/);
  assert.match(text, /fetch\('\/api\/sync\/sessions\/'\s*\+\s*encodeURIComponent\(entry\.recordId\),\s*\{\s*method:\s*'DELETE'/);
});

test("save() enqueues to the sync queue right after persist(), and removeSession() enqueues a 'delete' action", async () => {
  const text = await source('session-workspace-logic.js');
  assert.match(text, /function save\(session\)\{[\s\S]*?persist\(items\);\s*if\(window\.TradeJournalSyncQueue\)window\.TradeJournalSyncQueue\.enqueue\('sessions',session\.id,session\)/);
  assert.match(text, /function removeSession\(idValue\)\{[\s\S]*?persist\(items\);\s*if\(window\.TradeJournalSyncQueue\)window\.TradeJournalSyncQueue\.enqueue\('sessions',idValue,null,'delete'\)/);
});

test('the sync wiring looks up TradeJournalDevUserSwitcher live inside each function, never caches it at script-load time', async () => {
  const text = await source('session-workspace-logic.js');
  // dev-user-switcher.js's <script> tag loads after this file's in every character page's
  // existing order - caching `window.TradeJournalDevUserSwitcher` in a top-level const at this
  // file's load time would permanently capture undefined. A regression here would silently
  // break every sync send, since the sender would always see "no current user".
  assert.doesNotMatch(text, /const devUser\s*=\s*window\.TradeJournalDevUserSwitcher/);
  assert.match(text, /function devUser\(\)\s*\{\s*return window\.TradeJournalDevUserSwitcher;\s*\}/);
});

test('the one-time local-to-server migration is gated by a per-character-per-user flag and enqueues every existing local session by id (upsert, so a repeat run is idempotent)', async () => {
  const text = await source('session-workspace-logic.js');
  assert.match(text, /function migrateExistingLocalSessions\(\)/);
  assert.match(text, /tradejournal:sessions-migrated:v1:'\s*\+\s*layer\.character\s*\+\s*':'\s*\+\s*uid/);
  assert.match(text, /if\s*\(localStorage\.getItem\(flagKey\)\)\s*return;/);
  assert.match(text, /list\(\)\.forEach\(function\s*\(session\)\s*\{\s*queue\.enqueue\('sessions',\s*session\.id,\s*session\);/);
});

test('reconciliation pulls GET /api/sync/sessions and merges by id with the server copy winning, and re-runs on the online event', async () => {
  const text = await source('session-workspace-logic.js');
  assert.match(text, /fetch\('\/api\/sync\/sessions',\s*\{\s*headers:\s*\{\s*'x-dev-user-id':\s*uid\s*\}\s*\}\)/);
  assert.match(text, /\/\/ server wins on conflict/);
  assert.match(text, /window\.addEventListener\('online',\s*reconcileFromServer\)/);
});

test("TradeJournalImageStore.saveImage() takes an optional, additive category param - existing 2-arg callers in other modules are untouched, only this file's own session entry upload passes 'session'", async () => {
  const text = await source('session-entry-flow.js');
  assert.match(text, /async function saveImage\(id,blob,category\)/);
  assert.match(text, /category\s*&&\s*window\.TradeJournalSyncQueue/);
  // Module name is derived from `category` (e.g. 'session' -> 'session-images'), not
  // hardcoded, since this same generalized saveImage() now backs every migrated module's own
  // image category (pattern-registry-store.js's 'pattern', etc.) - see the shared comment above
  // saveImage() in this file.
  assert.match(text, /TradeJournalSyncQueue\.enqueue\(category\+'-images',id,\{dataUrl:dataUrl,category:category\}\)/);
  assert.match(text, /await saveImage\(imageBlobId,state\.imageBlob,'session'\)/);
});

test('all four character pages load sync-queue.js before session-workspace-logic.js and session-entry-flow.js', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const queueIndex = html.indexOf('sync-queue.js');
    assert.ok(queueIndex > -1, character + ': sync-queue.js present');
    assert.ok(queueIndex < html.indexOf('session-workspace-logic.js'), character + ': sync-queue before session-workspace-logic');
    assert.ok(queueIndex < html.indexOf('session-entry-flow.js'), character + ': sync-queue before session-entry-flow');
  }
});
