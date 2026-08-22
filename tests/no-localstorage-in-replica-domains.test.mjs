import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Enforcement pass for the local-first-to-server-authoritative migration (see ARCHITECTURE.md's
// Global Data Sync section / the Phase 2 report). A real regression guard: any future edit that
// reintroduces a localStorage/sessionStorage/indexedDB read or write into one of the six domains
// already migrated onto server-replica.js's in-memory replica - Patterns, Strategy Education,
// Trade Store, Mental Health Profile, Companion state, and the replica module itself - fails this
// test immediately, rather than being discovered later as a real data-isolation bug.
//
// This is deliberately scoped to only the six already-migrated files, not a whole-repository
// sweep. Sessions and every Group B preference (language, panel layout, AI settings, psychology
// settings, session signatures, the account-profile XP dedupe bookkeeping, ...) remain
// legitimately, extensively localStorage-backed for now - see this same phase's report for the
// honest reasoning (Sessions specifically cannot be vm-sandbox-tested and has 5+ external raw
// readers of its own storage key, a materially larger and riskier migration than any of the six
// domains here). A repo-wide "zero localStorage outside one allowlist" test would either have to
// allowlist most of the codebase today (providing little real protection beyond what's already
// true) or be actively misleading about how much of this migration is actually complete - this
// test is honest about its own narrower scope instead.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

const STORAGE_CALL = /\b(localStorage|sessionStorage|indexedDB)\s*\.\s*\w+\s*\(/g;

async function storageCalls(file) {
  const text = await source(file);
  const lines = text.split(/\r?\n/);
  const calls = [];
  lines.forEach((line, index) => {
    let match;
    STORAGE_CALL.lastIndex = 0;
    while ((match = STORAGE_CALL.exec(line))) calls.push({ line: index + 1, text: line.trim(), api: match[1] });
  });
  return calls;
}

test('server-replica.js never calls localStorage/sessionStorage/indexedDB except the one documented credential read - that is the entire point of this module', async () => {
  const calls = await storageCalls('server-replica.js');
  assert.equal(calls.length, 1, 'exactly one storage call is expected: reading the auth token to attach as the request header');
  assert.match(calls[0].text, /localStorage\.getItem\('tradejournal:auth-token'\)/, 'the one permitted call must be reading the credential, nothing else');
});

test('pattern-registry-store.js has no localStorage calls left for its OWN domain (patterns) - the only remaining calls are the documented, deliberate cross-domain reads of Sessions data (not migrated in this phase)', async () => {
  const calls = await storageCalls('pattern-registry-store.js');
  calls.forEach((call) => {
    // scenarioUsage()'s loop iterates every localStorage key looking for the tradejournal:sessions:v1:
    // prefix, then reads that one key via a loop variable (`key`) rather than the literal string on
    // this particular line - allowed alongside the literal-prefix check itself and the length/key()
    // enumeration calls, since all four lines belong to that one documented, deliberate function.
    assert.match(call.text, /tradejournal:sessions:v1:|localStorage\.length|localStorage\.key\(|localStorage\.getItem\(key\)/, `unexpected storage call in pattern-registry-store.js:${call.line} - ${call.text}`);
  });
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
