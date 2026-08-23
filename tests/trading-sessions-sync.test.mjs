import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// session-workspace-logic.js is never executed in a vm sandbox anywhere in this project's own
// test suite (see tests/trade-regression.test.mjs) - it registers a MutationObserver and drives
// setInterval-based render loops, both of which would need extensive faking to sandbox safely.
// This file follows the same established convention for that specific file: static source
// assertions for the wiring, backed by real dynamic coverage of the underlying mechanism itself
// in tests/server-replica.test.mjs (the replica's own hydrate/upsert/remove/rollback contract,
// domain-agnostic) and tests/trading-sessions-api-contract.test.mjs (the server-side
// idempotent-upsert contract) - together these two files verify "a write applies locally, then
// reaches the server, and a fresh load hydrates from the server" end-to-end by layer, exactly as
// the codebase already tests every other migrated domain's own *-store.js file.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

test('session-workspace-logic.js registers the sessions list domain against /api/sync/sessions and hydrates it', async () => {
  const text = await source('session-workspace-logic.js');
  assert.match(text, /window\.TradeJournalServerReplica\.registerListDomain\('sessions',\s*\{/);
  assert.match(text, /hydrateUrl:\s*'\/api\/sync\/sessions'/);
  assert.match(text, /writeUrl:\s*'\/api\/sync\/sessions'/);
  assert.match(text, /deleteUrlFor:\s*function\s*\(id\)\s*\{\s*return\s*'\/api\/sync\/sessions\/'\s*\+\s*encodeURIComponent\(id\)/);
  assert.match(text, /extractList:\s*function\s*\(body\)\s*\{\s*return\s*\(body\s*&&\s*body\.sessions\)\s*\|\|\s*\[\]/);
  assert.match(text, /replica\(\)\.hydrate\(\)/);
});

test('list()/save()/removeSession() read and write through the replica, not localStorage', async () => {
  const text = await source('session-workspace-logic.js');
  assert.match(text, /function replica\(\)\s*\{\s*return window\.TradeJournalServerReplica\s*&&\s*window\.TradeJournalServerReplica\.domain\('sessions'\);\s*\}/);
  assert.match(text, /const list\s*=\s*function\(\)\{\s*const domain=replica\(\);\s*return domain\?domain\.list\(\):\[\];\s*\};/);
  assert.match(text, /function save\(session\)\{\s*const domain=replica\(\);\s*if\(domain\)domain\.upsert\(session\)\.catch\(function\(\)\{\}\);/);
  assert.match(text, /function removeSession\(idValue\)\{\s*const domain=replica\(\);\s*if\(domain\)domain\.remove\(idValue\)\.catch\(function\(\)\{\}\);/);
});

test('the sync wiring looks up TradeJournalDevUserSwitcher live inside each function, never caches it at script-load time', async () => {
  const text = await source('session-workspace-logic.js');
  // dev-user-switcher.js's <script> tag loads after this file's in every character page's
  // existing order - caching `window.TradeJournalDevUserSwitcher` in a top-level const at this
  // file's load time would permanently capture undefined. A regression here would silently
  // break the session-images upload sender, since it would always see "no current user".
  assert.doesNotMatch(text, /const devUser\s*=\s*window\.TradeJournalDevUserSwitcher/);
  assert.match(text, /function devUser\(\)\s*\{\s*return window\.TradeJournalDevUserSwitcher;\s*\}/);
});

test('the one-time local-to-server migration is gated by a per-character-per-user flag, upserts every pre-existing local session through the replica (idempotent by id), and clears the legacy local bucket afterward', async () => {
  const text = await source('session-workspace-logic.js');
  assert.match(text, /function migrateExistingLocalSessions\(\)/);
  assert.match(text, /tradejournal:sessions-migrated:v1:'\s*\+\s*layer\.character\s*\+\s*':'\s*\+\s*uid/);
  assert.match(text, /if\s*\(localStorage\.getItem\(flagKey\)\)\s*return;/);
  assert.match(text, /Promise\.all\(legacyLocal\.map\(function\s*\(session\)\s*\{\s*return domain\.upsert\(session\)\.then\(function\s*\(\)\s*\{\s*return true;\s*\}\)\.catch\(function\s*\(\)\s*\{\s*return false;\s*\}\);/);
  assert.match(text, /localStorage\.removeItem\(key\);/);
});

test("HOTFIX regression guard: migrateExistingLocalSessions() no longer clears `key` / sets the 'done' flag until every upsert has actually settled, and keeps only the sessions that genuinely failed for a retry next load - real production data-loss bug fixed alongside sessionsAdapter.js's own createSession() type omission (the exact scenario that was silently losing sessions: an upsert 500s, server-replica.js rolls it back, and the old code had already deleted the only other copy from localStorage and marked migration done forever)", async () => {
  const text = await source('session-workspace-logic.js');
  assert.doesNotMatch(text, /legacyLocal\.forEach\(function\s*\(session\)\s*\{\s*domain\.upsert\(session\)\.catch\(function\s*\(\)\s*\{\}\);\s*\}\);\s*localStorage\.setItem\(flagKey/, 'the old fire-and-forget-then-unconditionally-clear shape must be gone');
  assert.match(text, /const stillLocal\s*=\s*legacyLocal\.filter\(function\s*\(_,\s*index\)\s*\{\s*return\s*!results\[index\];\s*\}\);/);
  assert.match(text, /if\s*\(stillLocal\.length\)\s*\{\s*localStorage\.setItem\(key,\s*JSON\.stringify\(stillLocal\)\);\s*return;\s*\}/);
});

test('there is no more reconcile-from-server / bidirectional sync-queue "sessions" module - hydrate() is now the only pull from the server, matching every other migrated domain', async () => {
  const text = await source('session-workspace-logic.js');
  assert.doesNotMatch(text, /reconcileFromServer/);
  assert.doesNotMatch(text, /mergeServerSessions/);
  assert.doesNotMatch(text, /queue\.registerModule\('sessions'/);
  assert.doesNotMatch(text, /window\.addEventListener\('online'/);
});

test("session-images upload patch-back still runs through sync-queue.js (the one piece server-replica.js has no generic equivalent for - a partial patch into a nested entry, not a whole-record upsert), and now matches/upserts against the replica instead of localStorage", async () => {
  const text = await source('session-workspace-logic.js');
  assert.match(text, /queue\.registerModule\('session-images',\s*function\s*\(entry\)/);
  assert.match(text, /fetch\('\/api\/sync\/sessions\/images',\s*\{/);
  assert.match(text, /const domain\s*=\s*replica\(\);\s*const sessions\s*=\s*domain\s*\?\s*domain\.list\(\)\s*:\s*\[\];/);
  assert.match(text, /if\s*\(matched\s*&&\s*domain\)\s*return\s*domain\.upsert\(matched\);/);
});

test('the old Storage.prototype.setItem monkeypatch and its "New Session" click listener are gone - confirmed dead in the live NAVRYA app (no matching element exists) even before this migration, and the localStorage write it watched for no longer happens', async () => {
  const text = await source('session-workspace-logic.js');
  assert.doesNotMatch(text, /Storage\.prototype\.setItem\s*=/);
  assert.doesNotMatch(text, /__swAwaitNew/);
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

test('all four character pages load server-replica.js and sync-queue.js before session-workspace-logic.js and session-entry-flow.js', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const replicaIndex = html.indexOf('server-replica.js');
    const queueIndex = html.indexOf('sync-queue.js');
    assert.ok(replicaIndex > -1, character + ': server-replica.js present');
    assert.ok(queueIndex > -1, character + ': sync-queue.js present');
    assert.ok(replicaIndex < html.indexOf('session-workspace-logic.js'), character + ': server-replica before session-workspace-logic');
    assert.ok(queueIndex < html.indexOf('session-workspace-logic.js'), character + ': sync-queue before session-workspace-logic');
    assert.ok(queueIndex < html.indexOf('session-entry-flow.js'), character + ': sync-queue before session-entry-flow');
  }
});
