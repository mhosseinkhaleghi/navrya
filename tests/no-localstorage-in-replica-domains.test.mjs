import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Enforcement pass for the local-first-to-server-authoritative migration (see ARCHITECTURE.md's
// Global Data Sync section / the Phase 2, Phase 3, and Phase 8 reports). A real regression guard:
// any future edit that reintroduces a localStorage/sessionStorage/indexedDB read or write into
// one of the domains already migrated onto server-replica.js's in-memory replica - Patterns,
// Strategy Education, Trade Store, Mental Health Profile, Companion state, Sessions,
// user-preferences.js (Phase 8a), session-signature-store.js (Phase 8a, same caveat as
// session-workspace-logic.js below), psychology-store.js (Phase 8b), and the replica module
// itself - fails this test immediately, rather than being discovered later as a real
// data-isolation bug.
//
// This is deliberately scoped to only the already-migrated files (plus
// session-workspace-logic.js's and session-signature-store.js's own documented, narrowly-allowed
// one-time/legacy local-recovery reads - see their own tests below), not a whole-repository
// sweep. Every not-yet-migrated Phase 8 sub-module (panel layout, language, AI settings, app
// settings) and the account-profile XP dedupe bookkeeping remain legitimately, extensively
// localStorage-backed for now - see this same phase's report for the honest reasoning. A
// repo-wide "zero localStorage outside one allowlist" test would either have to allowlist most of
// the codebase today (providing little real protection beyond what's already true) or be actively
// misleading about how much of this migration is actually complete - this test is honest about
// its own narrower scope instead.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const navryaSrc = (...parts) => path.join(root, 'navrya-src', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

const STORAGE_CALL = /\b(localStorage|sessionStorage|indexedDB)\s*\.\s*\w+\s*\(/g;

async function storageCallsAt(fullPath) {
  const text = await readFile(fullPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const calls = [];
  lines.forEach((line, index) => {
    let match;
    STORAGE_CALL.lastIndex = 0;
    while ((match = STORAGE_CALL.exec(line))) calls.push({ line: index + 1, text: line.trim(), api: match[1] });
  });
  return calls;
}
async function storageCalls(file) { return storageCallsAt(shared(file)); }
async function storageCallsInNavryaSrc(file) { return storageCallsAt(navryaSrc(file)); }

test('server-replica.js never calls localStorage/sessionStorage/indexedDB except the one documented credential read - that is the entire point of this module', async () => {
  const calls = await storageCalls('server-replica.js');
  assert.equal(calls.length, 1, 'exactly one storage call is expected: reading the auth token to attach as the request header');
  assert.match(calls[0].text, /localStorage\.getItem\('tradejournal:auth-token'\)/, 'the one permitted call must be reading the credential, nothing else');
});

test('pattern-registry-store.js has zero localStorage/sessionStorage/indexedDB calls - Sessions migrated in Phase 3, so even its old cross-domain scenario-usage scan of raw sessions data is gone (reads window.TradeJournalWorkspace.list() now, see trading-sessions-sync.test.mjs)', async () => {
  const calls = await storageCalls('pattern-registry-store.js');
  assert.equal(calls.length, 0, JSON.stringify(calls));
});

test('strategy-education-store.js has zero localStorage/sessionStorage/indexedDB calls - every reference left in the file is prose in a comment', async () => {
  const calls = await storageCalls('strategy-education-store.js');
  assert.equal(calls.length, 0, JSON.stringify(calls));
});

test('trade-store.js has no localStorage calls left for its OWN domain (trades) - the only remaining calls are the documented, deliberate Group B preference (trade-settings), out of scope for this phase', async () => {
  const calls = await storageCalls('trade-store.js');
  calls.forEach((call) => {
    assert.match(call.text, /SETTINGS_KEY/, `unexpected storage call in trade-store.js:${call.line} - ${call.text}`);
  });
});

test('mental-health-store.js has zero localStorage/sessionStorage/indexedDB calls - every reference left in the file is prose in a comment', async () => {
  const calls = await storageCalls('mental-health-store.js');
  assert.equal(calls.length, 0, JSON.stringify(calls));
});

test('ai-companion-profile.js has zero localStorage/sessionStorage/indexedDB calls - every reference left in the file is prose in a comment', async () => {
  const calls = await storageCalls('ai-companion-profile.js');
  assert.equal(calls.length, 0, JSON.stringify(calls));
});

test("session-workspace-logic.js's only remaining storage calls belong to its two documented, narrowly-scoped one-time local-recovery functions (migrateLegacyPerCharacterSessions() and migrateExistingLocalSessions()) - reading/clearing pre-replica local data exactly once, never an ongoing cache", async () => {
  const calls = await storageCalls('session-workspace-logic.js');
  assert.ok(calls.length > 0, 'this file is expected to still have a few narrowly-scoped calls - if this ever hits zero, tighten this test to assert.equal(calls.length, 0) like the other fully-migrated files above');
  calls.forEach((call) => {
    assert.match(
      call.text,
      /FLAG|flagKey|\bkey\b|tradejournal:sessions:v1:'\s*\+\s*character|legacyLocal/,
      `unexpected storage call in session-workspace-logic.js:${call.line} - ${call.text}`
    );
  });
});

test('ai-journey-steps.js has zero localStorage/sessionStorage/indexedDB calls - its own sessionsCache() reads window.TradeJournalWorkspace.list() now, same as every other cross-domain Sessions reader', async () => {
  const calls = await storageCalls('ai-journey-steps.js');
  assert.equal(calls.length, 0, JSON.stringify(calls));
});

test('user-preferences.js has zero localStorage/sessionStorage/indexedDB calls - every reference left in the file is prose in a comment', async () => {
  const calls = await storageCalls('user-preferences.js');
  assert.equal(calls.length, 0, JSON.stringify(calls));
});

test("session-signature-store.js's only remaining storage call is the documented, deliberate legacy per-character Sessions scan inside backfillFromLegacy() - genuinely dead in practice today (session-workspace-logic.js's own migration already merges/deletes those keys on every load), kept only as defensive recovery", async () => {
  const calls = await storageCalls('session-signature-store.js');
  assert.equal(calls.length, 1, JSON.stringify(calls));
  assert.match(calls[0].text, /tradejournal:sessions:v1:'\s*\+\s*character/, `unexpected storage call in session-signature-store.js:${calls[0].line} - ${calls[0].text}`);
});

test('psychology-store.js has zero localStorage/sessionStorage/indexedDB calls - settings()/saveSettings() read/write window.TradeJournalUserPreferences now (Phase 8b)', async () => {
  const calls = await storageCalls('psychology-store.js');
  assert.equal(calls.length, 0, JSON.stringify(calls));
});

test('ai-settings-store.js has no localStorage calls left for its own migrated fields - the only remaining calls are the documented, deliberate local-only BYOK mechanism (LOCAL_PERSIST_FLAG_KEY/BYOK_KEY), explicitly deferred to Phase 8f (deletion, not migration)', async () => {
  const calls = await storageCalls('ai-settings-store.js');
  calls.forEach((call) => {
    assert.match(call.text, /LOCAL_PERSIST_FLAG_KEY|BYOK_KEY/, `unexpected storage call in ai-settings-store.js:${call.line} - ${call.text}`);
  });
});

test('ai-usage-store.js has zero localStorage/sessionStorage/indexedDB calls - today()/thisMonth()/lifetime() read a server-hydrated baseline through server-replica.js now (Phase 8c), reconciled onto the same ai_usage_events table reportToServer() already wrote to before this migration', async () => {
  const calls = await storageCalls('ai-usage-store.js');
  assert.equal(calls.length, 0, JSON.stringify(calls));
});

test('panel-system.js has zero localStorage/sessionStorage/indexedDB calls - its old panel-grid load()/save() mechanism was confirmed dead (Phase 8d) and removed outright rather than migrated; the real, live panel-layout persistence lives in navrya-src/dashboardView.jsx instead', async () => {
  const calls = await storageCalls('panel-system.js');
  assert.equal(calls.length, 0, JSON.stringify(calls));
});

test('dashboardView.jsx and settingsView.jsx (the real dashboard-board persistence and its "Manage panels" consumer) have zero localStorage/sessionStorage/indexedDB calls - boardKey()/loadBoard()/saveBoard() read/write window.TradeJournalUserPreferences now (Phase 8d)', async () => {
  const dashboardCalls = await storageCallsInNavryaSrc('dashboardView.jsx');
  assert.equal(dashboardCalls.length, 0, JSON.stringify(dashboardCalls));
  const settingsCalls = await storageCallsInNavryaSrc('settingsView.jsx');
  assert.equal(settingsCalls.length, 0, JSON.stringify(settingsCalls));
});
