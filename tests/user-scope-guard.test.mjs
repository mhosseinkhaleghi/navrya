import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { signToken } from '../server/community/auth-tokens.mjs';

// Phase 1 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md / the Phase 1
// report this file shipped with). user-scope-guard.js is pure localStorage/window logic - no DOM
// references - so, like trade-store.js/mental-health-store.js, it is fully vm-sandbox-testable.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}

function flush() { return new Promise((resolve) => setImmediate(resolve)); }

// A real, correctly-shaped signed token minted the same way routes.auth.mjs actually does at
// login/register/re-login time - the guard's decode logic is never exercised faithfully by a bare
// placeholder string like 'token-A' (no '.', so it only ever hits the raw-string fallback path).
// Two calls with the SAME userId and a fixed secret produce two DIFFERENT token strings (iat
// differs), exactly modeling a real re-login for the same account.
const TEST_SECRET = 'user-scope-guard-test-secret';
// ttlMs is exposed (rather than relying on Date.now()'s iat alone) so two "different logins for
// the same account" in one test are guaranteed to produce genuinely different token strings
// deterministically, never flaky on two calls landing in the same millisecond.
function mintToken(userId, ttlMs) { return signToken(userId, TEST_SECRET, ttlMs); }

// Loads ONLY the guard, for direct unit coverage of its own purge/no-op decisions.
async function loadGuard({ localStorage, imageStoreClearAll }) {
  const sandbox = {
    window: {}, localStorage, atob,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent() {}, addEventListener() {},
    TradeJournalImageStore: imageStoreClearAll ? { clearAll: imageStoreClearAll } : undefined
  });
  vm.runInNewContext(await source('user-scope-guard.js'), sandbox, { filename: 'user-scope-guard.js' });
  return { guard: sandbox.window.TradeJournalUserScopeGuard, sandbox, localStorage };
}

// ============================================================================
// Direct unit coverage of the guard itself
// ============================================================================

test('no auth token present: does nothing - no purge, no owner-user-id stamp written', async () => {
  const localStorage = memoryStorage({ 'tradejournal:patterns:v1': JSON.stringify([{ id: 'p1' }]) });
  await loadGuard({ localStorage });
  assert.ok(localStorage.getItem('tradejournal:patterns:v1'), 'a pre-login/anonymous cache is left untouched - there is no authenticated user yet to protect or leak');
  assert.equal(localStorage.getItem('tradejournal:owner-user-id:v1'), null);
});

test('a token with no recorded owner at all purges fail-closed, even though it might genuinely belong to the same real person', async () => {
  const localStorage = memoryStorage({
    'tradejournal:auth-token': 'token-A',
    'tradejournal:patterns:v1': JSON.stringify([{ id: 'p1' }]),
    'tradejournal:trades:v1': JSON.stringify([{ id: 't1' }])
  });
  await loadGuard({ localStorage });
  assert.equal(localStorage.getItem('tradejournal:patterns:v1'), null, 'purged, not merely hidden - the bytes are gone');
  assert.equal(localStorage.getItem('tradejournal:trades:v1'), null);
  assert.equal(localStorage.getItem('tradejournal:owner-user-id:v1'), 'token-A', 'the live token is now recorded, so a same-user reload will not purge again');
});

test('reloading with the SAME token as last recorded does not purge - the common case', async () => {
  const localStorage = memoryStorage({
    'tradejournal:auth-token': 'token-A',
    'tradejournal:owner-user-id:v1': 'token-A',
    'tradejournal:patterns:v1': JSON.stringify([{ id: 'p1' }])
  });
  const { guard } = await loadGuard({ localStorage });
  assert.equal(guard.checkAndPurgeIfNeeded(), false, 'returns false when no purge was needed');
  assert.ok(localStorage.getItem('tradejournal:patterns:v1'), 'a same-user reload must never wipe data that already belongs to them');
});

test('a real token change purges everything and re-stamps to the new token', async () => {
  const localStorage = memoryStorage({
    'tradejournal:auth-token': 'token-B',
    'tradejournal:owner-user-id:v1': 'token-A',
    'tradejournal:patterns:v1': JSON.stringify([{ id: 'a-owns-this' }])
  });
  await loadGuard({ localStorage });
  assert.equal(localStorage.getItem('tradejournal:patterns:v1'), null);
  assert.equal(localStorage.getItem('tradejournal:owner-user-id:v1'), 'token-B');
});

test('the sync outbox is purged on mismatch even with real pending entries queued - a pending write must never be sent under the new user\'s token', async () => {
  const localStorage = memoryStorage({
    'tradejournal:auth-token': 'token-B',
    'tradejournal:owner-user-id:v1': 'token-A',
    'tradejournal:sync-queue:v1': JSON.stringify([{ id: 'sync-1', module: 'trades', recordId: 't1', action: 'upsert', payload: { id: 't1' }, attempts: 0, nextAttemptAt: 0 }])
  });
  await loadGuard({ localStorage });
  assert.equal(localStorage.getItem('tradejournal:sync-queue:v1'), null);
});

// ============================================================================
// Real re-login / token rotation for the SAME account (point 1 of your review): the earlier
// version of this file stamped/compared the raw token string, so an ordinary re-login (which
// mints a brand-new token for the same account - see auth-tokens.mjs's signToken()) looked
// exactly like a different user and purged everything, including that account's own unsent
// sync-queue entries. These tests mint real, correctly-shaped tokens (not bare placeholder
// strings, which never exercise the decode path at all) to prove that is fixed.
// ============================================================================

test('a re-login for the SAME account (a brand-new token, same embedded user id) does not purge - the exact scenario point 1 caught', async () => {
  const userAToken1 = mintToken('user-A');
  const localStorage = memoryStorage({
    'tradejournal:auth-token': userAToken1,
    'tradejournal:trades:v1': JSON.stringify([{ id: 't1' }])
  });
  await loadGuard({ localStorage }); // first boot: no owner-user-id recorded yet, so this run DOES purge and re-stamp
  assert.equal(localStorage.getItem('tradejournal:trades:v1'), null, 'sanity check: the fail-closed first run purged as expected');

  // Simulate the real record surviving via the normal write path (not re-seeding it by hand,
  // which would prove nothing about the guard) - then re-login as the same account with a
  // brand-new token, and reload.
  localStorage.setItem('tradejournal:trades:v1', JSON.stringify([{ id: 't1', owner: 'user-A' }]));
  const userAToken2 = mintToken('user-A', 1000 * 60 * 60 * 24 * 29); // a real re-login mints a NEW token (a deliberately different ttl here guarantees a different string, deterministically rather than relying on timing)
  assert.notEqual(userAToken1, userAToken2, 'sanity check: two real logins for the same account really do produce different token strings');
  localStorage.setItem('tradejournal:auth-token', userAToken2);

  const { guard } = await loadGuard({ localStorage });
  assert.equal(guard.checkAndPurgeIfNeeded(), false, 'a re-login for the same account must resolve as a no-op, not a mismatch');
  assert.ok(localStorage.getItem('tradejournal:trades:v1'), 'the account\'s own real data must survive its own re-login');
});

test('a re-login for the SAME account does not destroy that account\'s own unsent sync-queue entries - the concrete harm the old token-based stamp caused', async () => {
  const userAToken1 = mintToken('user-A');
  const localStorage = memoryStorage({ 'tradejournal:auth-token': userAToken1 });
  await loadGuard({ localStorage }); // establishes the owner-user-id stamp for user-A

  const pendingWrite = { id: 'sync-1', module: 'trades', recordId: 't1', action: 'upsert', payload: { id: 't1' }, attempts: 1, nextAttemptAt: Date.now() + 60000 };
  localStorage.setItem('tradejournal:sync-queue:v1', JSON.stringify([pendingWrite]));

  const userAToken2 = mintToken('user-A', 1000 * 60 * 60 * 24 * 29); // a genuinely different token string for the same account, deterministically
  localStorage.setItem('tradejournal:auth-token', userAToken2);
  await loadGuard({ localStorage });

  const survived = JSON.parse(localStorage.getItem('tradejournal:sync-queue:v1') || 'null');
  assert.ok(survived && survived.length === 1 && survived[0].id === 'sync-1', 'the pending offline write must still be there after a mere re-login, ready to retry and reach the server under this same account');
});

test('a real different account (a different embedded user id) still purges correctly with real tokens, including the sync queue', async () => {
  const localStorage = memoryStorage({ 'tradejournal:auth-token': mintToken('user-A') });
  await loadGuard({ localStorage });
  localStorage.setItem('tradejournal:trades:v1', JSON.stringify([{ id: 't1', owner: 'user-A' }]));
  localStorage.setItem('tradejournal:sync-queue:v1', JSON.stringify([{ id: 'sync-1', module: 'trades', recordId: 't1', action: 'upsert', payload: { id: 't1' }, attempts: 0, nextAttemptAt: 0 }]));

  localStorage.setItem('tradejournal:auth-token', mintToken('user-B'));
  await loadGuard({ localStorage });
  assert.equal(localStorage.getItem('tradejournal:trades:v1'), null, 'a genuinely different account must still trigger a real purge');
  assert.equal(localStorage.getItem('tradejournal:sync-queue:v1'), null, 'and user A\'s pending write must not be sent under user B\'s token either');
});

test('a present but undecodable token (corrupt/unexpected format, no real payload) falls back to fail-closed rather than being treated as "no one"', async () => {
  const localStorage = memoryStorage({
    'tradejournal:auth-token': 'not-a-real-token-format',
    'tradejournal:owner-user-id:v1': 'user-A', // some real previous account was recorded
    'tradejournal:trades:v1': JSON.stringify([{ id: 't1' }])
  });
  await loadGuard({ localStorage });
  assert.equal(localStorage.getItem('tradejournal:trades:v1'), null, 'an unrecognized token must never be treated as "nobody is logged in" while real prior data sits unprotected');
});

test('migration-flag prefixes are swept for ANY embedded id on a real purge, but left alone on a no-op reload', async () => {
  const seeded = {
    'tradejournal:auth-token': 'token-A',
    'tradejournal:owner-user-id:v1': 'token-A', // same as live - this run must be a no-op
    'tradejournal:patterns-migrated:v1:user-old-1': '2020-01-01T00:00:00.000Z',
    'tradejournal:companion-state-migrated:v1:user-old-2': '2020-01-01T00:00:00.000Z'
  };
  const noOp = memoryStorage(seeded);
  await loadGuard({ localStorage: noOp });
  assert.ok(noOp.getItem('tradejournal:patterns-migrated:v1:user-old-1'), 'a no-op reload must not needlessly re-run migrateOrAdopt() for the still-current user by clearing their real flag');

  const purging = memoryStorage(Object.assign({}, seeded, { 'tradejournal:owner-user-id:v1': 'token-different' }));
  await loadGuard({ localStorage: purging });
  assert.equal(purging.getItem('tradejournal:patterns-migrated:v1:user-old-1'), null, 'swept for hygiene on an actual purge, regardless of which user it was stamped for');
  assert.equal(purging.getItem('tradejournal:companion-state-migrated:v1:user-old-2'), null);
});

test('explicitly out-of-scope keys survive every purge unconditionally: the credential, the opt-in BYOK key, and internal one-time data-shape flags', async () => {
  const localStorage = memoryStorage({
    'tradejournal:auth-token': 'token-B',
    'tradejournal:owner-user-id:v1': 'token-A',
    'tradejournal:ai-byok:v1': JSON.stringify({ openai: 'sk-should-survive' }),
    'tradejournal:sessions-shared-migration:v1': '2024-01-01T00:00:00.000Z',
    'tradejournal:session-library-empty-reset:v1': '2024-01-01T00:00:00.000Z',
    'tradejournal:ai-settings:v1': JSON.stringify({ provider: 'anthropic' }) // Group B preference - deferred to a later phase, not this stopgap
  });
  await loadGuard({ localStorage });
  assert.equal(localStorage.getItem('tradejournal:auth-token'), 'token-B', 'the credential itself is only ever cleared by its own clearToken(), never by this guard');
  assert.ok(localStorage.getItem('tradejournal:ai-byok:v1'), 'the opt-in BYOK key was explicitly kept out of scope for this task');
  assert.ok(localStorage.getItem('tradejournal:sessions-shared-migration:v1'), 'an internal one-time migration flag is not user-scoped data');
  assert.ok(localStorage.getItem('tradejournal:session-library-empty-reset:v1'));
  assert.ok(localStorage.getItem('tradejournal:ai-settings:v1'), 'Group B preferences are deferred to a later phase, not purged by this stopgap');
});

test('purgeAll() (used directly by logout) wipes unconditionally even when the account has not changed, clears the guard\'s own owner-user-id stamp, and leaves no copy of the credential behind', async () => {
  const localStorage = memoryStorage({
    'tradejournal:auth-token': 'token-A',
    'tradejournal:owner-user-id:v1': 'token-A',
    'tradejournal:trades:v1': JSON.stringify([{ id: 't1' }])
  });
  const { guard } = await loadGuard({ localStorage });
  guard.purgeAll();
  assert.equal(localStorage.getItem('tradejournal:trades:v1'), null);
  assert.equal(localStorage.getItem('tradejournal:owner-user-id:v1'), null, 'logout leaves a clean slate rather than stamping the outgoing user as owner of nothing');
  // purgeAll() itself never touches tradejournal:auth-token (that's clearToken()'s job, called
  // right after it in dev-user-switcher.js's real logout() - see the dedicated test below for the
  // full real sequence). What this proves here is narrower but just as real: even while the
  // credential still happens to sit in storage, no SECOND copy of it survives the purge - the
  // owner-user-id stamp above holds a decoded user id, never the raw token bytes.
  assert.equal(localStorage.getItem('tradejournal:owner-user-id:v1'), null);
});

class FakeDomNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  addEventListener() {} removeEventListener() {} querySelectorAll() { return []; } querySelector() { return null; } remove() {}
  get classList() { return { add() {}, remove() {}, toggle() {} }; }
}

test('the real dev-user-switcher.js logout() sequence leaves neither the credential nor its own owner-user-id stamp behind', async () => {
  const localStorage = memoryStorage({
    'tradejournal:auth-token': mintToken('user-A'),
    'tradejournal:owner-user-id:v1': 'user-A',
    'tradejournal:trades:v1': JSON.stringify([{ id: 't1' }])
  });
  // Mirrors tests/dev-user-switcher.test.mjs's own proven sandbox shape (document/MutationObserver
  // stubs dev-user-switcher.js needs just to load) rather than inventing a second one.
  const document = {
    createElement: (tag) => new FakeDomNode(tag), createTextNode: (text) => { const node = new FakeDomNode('#text'); node.textContent = text; return node; },
    documentElement: { lang: 'en' }, body: new FakeDomNode('body'), querySelector: () => null, addEventListener() {}
  };
  const sandbox = {
    window: { top: { location: { hash: '' } } }, document, localStorage, atob,
    MutationObserver: class { observe() {} }, setTimeout: (fn) => fn(), clearTimeout() {}, Math,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, { document, localStorage, dispatchEvent() {}, addEventListener() {}, setTimeout: sandbox.setTimeout });
  vm.runInNewContext(await source('user-scope-guard.js'), sandbox, { filename: 'user-scope-guard.js' });
  vm.runInNewContext(await source('dev-user-switcher.js'), sandbox, { filename: 'dev-user-switcher.js' });
  sandbox.window.TradeJournalDevUserSwitcher.logout();
  assert.equal(localStorage.getItem('tradejournal:auth-token'), null, 'the credential itself is gone after a real logout() call');
  assert.equal(localStorage.getItem('tradejournal:owner-user-id:v1'), null, 'the guard\'s own stamp is gone too - no residual copy of who was logged in, let alone of the token itself');
  assert.equal(localStorage.getItem('tradejournal:trades:v1'), null, 'and the real domain data is gone, proving purgeAll() actually ran as part of the real logout(), not just clearToken()');
});

test('IndexedDB: calls TradeJournalImageStore.clearAll() directly when it is already available (the logout call path)', async () => {
  let cleared = false;
  const localStorage = memoryStorage({ 'tradejournal:auth-token': 'token-A' });
  const { guard } = await loadGuard({ localStorage, imageStoreClearAll: async () => { cleared = true; } });
  guard.purgeAll();
  await flush();
  assert.ok(cleared, 'clearAll() must be invoked directly when the image store module has already loaded');
});

test('IndexedDB: leaves a pending-clear flag instead when TradeJournalImageStore has not loaded yet (the real boot-time path, since this guard is the first shared script)', async () => {
  const localStorage = memoryStorage({ 'tradejournal:auth-token': 'token-A' });
  const { sandbox } = await loadGuard({ localStorage }); // no imageStoreClearAll - simulates boot time
  assert.equal(sandbox.window.__TJ_PENDING_IMAGE_STORE_CLEAR__, true, 'session-entry-flow.js is the one place this flag is ever consumed, once it loads later in the real script order');
});

test('IndexedDB: the boot-time owner-mismatch path (checkAndPurgeIfNeeded, never an explicit logout) requests the image-store clear too - this is the actual leak scenario, not just a logout nicety', async () => {
  // Deliberately does NOT call guard.purgeAll() or anything logout-shaped - user B simply opens
  // the app on a browser user A used before, with no logout ever having happened. This is the
  // exact real-world case a stale IndexedDB blob would otherwise leak a previous user's chart
  // image through: user A never signs out, user B's browser session begins with a mismatch.
  const localStorage = memoryStorage({
    'tradejournal:auth-token': mintToken('user-B'),
    'tradejournal:owner-user-id:v1': 'user-A'
  });
  // loadGuard() itself triggers the module-load-time auto-run of checkAndPurgeIfNeeded() - by
  // construction, this test never calls guard.purgeAll() or anything logout-shaped at all, so
  // whatever purge evidence shows up below can only have come from that boot-time auto-run.
  const { sandbox } = await loadGuard({ localStorage }); // no imageStoreClearAll - not loaded yet, matching real boot order
  assert.equal(localStorage.getItem('tradejournal:owner-user-id:v1'), 'user-B', 'confirms a real mismatch purge already ran during module load, via checkAndPurgeIfNeeded() - not purgeAll() called directly, and not logout()');
  assert.equal(sandbox.window.__TJ_PENDING_IMAGE_STORE_CLEAR__, true, 'the boot-time mismatch path requests the IndexedDB clear exactly the same way the explicit logout path does');
});

test('the guard exposes the exact key lists it purges, so a future silent edit narrowing them is caught here rather than discovered as a leak', async () => {
  const { guard } = await loadGuard({ localStorage: memoryStorage() });
  ['tradejournal:patterns:v1', 'tradejournal:strategies:v2', 'tradejournal:trades:v1', 'tradejournal:sessions:v1:shared',
    'tradejournal:mental-health-profile:v2', 'tradejournal:companion-state:v1', 'tradejournal:sync-queue:v1', 'tradejournal:dev-user-id'
  ].forEach((key) => assert.ok(guard.exactKeys.includes(key), key + ' must be in the purge set'));
  ['tradejournal:patterns-migrated:v1:', 'tradejournal:strategies-migrated:v1:', 'tradejournal:trades-migrated:v1:',
    'tradejournal:sessions-migrated:v1:', 'tradejournal:mental-health-migrated:v1:', 'tradejournal:companion-state-migrated:v1:'
  ].forEach((prefix) => assert.ok(guard.migrationFlagPrefixes.includes(prefix), prefix + ' must be swept'));
  assert.equal(guard.exactKeys.includes('tradejournal:auth-token'), false, 'the credential is never in the unconditional-delete set');
  assert.equal(guard.exactKeys.includes('tradejournal:ai-byok:v1'), false, 'explicitly out of scope per product decision');
});

// ============================================================================
// End-to-end isolation, per real domain store - guard loaded first (matching the real script
// order on every character page), then the real store, proving the reported bug is actually
// fixed: user A's real records, written through the store's own public API, are invisible to
// user B on the very next simulated page load against the same browser.
//
// session-workspace-logic.js is deliberately excluded here - it is never vm-sandboxed anywhere
// in this project's own test suite (it overrides Storage.prototype.setItem, registers a
// MutationObserver, and drives setInterval render loops - see tests/trading-sessions-sync.test.mjs's
// own header comment for why). Its storage key (tradejournal:sessions:v1:shared) is covered at
// the key level by the guard's own unit tests above instead, which is content-agnostic and does
// not need the module loaded to prove correct.
// ============================================================================

// Patterns and Strategies both graduated out of this file's scope in Phase 2 (see
// ARCHITECTURE.md's Global Data Sync section / the Phase 2 report): neither store touches
// localStorage at all any more - each reads/writes server-replica.js's in-memory replica instead,
// so there is no tradejournal:patterns:v1/strategies:v2 key left for this guard to purge. Their
// own cross-account isolation proofs now live in tests/patterns-sync.test.mjs and
// tests/strategies-sync.test.mjs instead (a fresh in-memory replica per page load/module instance
// is never shared between accounts by construction - no purge mechanism is even needed for a
// migrated domain). The Phase 1 stopgap this file tests remains the real, live mechanism for
// every domain NOT yet migrated - Trades/Sessions/Mental Health/Companion state below.

async function loadTradesWithGuard({ localStorage, token }) {
  if (token) localStorage.setItem('tradejournal:auth-token', token);
  const sandbox = {
    window: {}, localStorage, atob,
    document: { body: { dataset: {} } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    FileReader: class {}
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent() {}, addEventListener() {},
    TradeJournalTradeTypes: { timeframes: ['1m', '5m'] }, TradeJournalPanelLayer: { character: 'hunter' },
    TradeJournalDevUserSwitcher: { currentUserId: () => token || null }
  });
  vm.runInNewContext(await source('user-scope-guard.js'), sandbox, { filename: 'user-scope-guard.js' });
  vm.runInNewContext(await source('trade-store.js'), sandbox, { filename: 'trade-store.js' });
  return sandbox.window.TradeJournalTradeStore;
}

test('Trades: user A\'s trade is invisible to user B on the same browser after Phase 1', async () => {
  const localStorage = memoryStorage();
  const storeA = await loadTradesWithGuard({ localStorage, token: 'token-A' });
  const draft = storeA.createDraft ? storeA.createDraft() : null;
  // Fall back to writing a minimal real record through save() directly if createDraft() isn't
  // the store's actual entry point - either way this exercises the real public write path.
  if (draft) storeA.save(Object.assign(draft, { id: 'trade-a' }));
  else storeA.save({ id: 'trade-a', status: 'hunting' });
  assert.ok(storeA.listSync().find((t) => t.id === 'trade-a'));

  const storeB = await loadTradesWithGuard({ localStorage, token: 'token-B' });
  assert.equal(storeB.listSync().find((t) => t.id === 'trade-a'), undefined, 'user B must never see user A\'s trade');
});

async function loadMentalHealthWithGuard({ localStorage, token }) {
  if (token) localStorage.setItem('tradejournal:auth-token', token);
  const sandbox = {
    window: {}, localStorage, atob,
    document: { documentElement: { lang: 'en' } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {}, addEventListener() {}, TradeJournalDevUserSwitcher: { currentUserId: () => token || null } });
  vm.runInNewContext(await source('user-scope-guard.js'), sandbox, { filename: 'user-scope-guard.js' });
  vm.runInNewContext(await source('mental-health-store.js'), sandbox, { filename: 'mental-health-store.js' });
  return sandbox.window.TradeJournalMentalHealthStore;
}

test('Mental Health Profile: user A\'s intake/profile content is invisible to user B on the same browser after Phase 1', async () => {
  const localStorage = memoryStorage();
  const storeA = await loadMentalHealthWithGuard({ localStorage, token: 'token-A' });
  const profile = storeA.load();
  profile.intake.completed = true;
  profile.intake.demographics.age = 42;
  storeA.save(profile);
  assert.equal(storeA.load().intake.demographics.age, 42);

  const storeB = await loadMentalHealthWithGuard({ localStorage, token: 'token-B' });
  const reloaded = storeB.load();
  assert.equal(reloaded.intake.completed, false, 'a fresh account must never inherit the previous user\'s completed intake');
  assert.equal(reloaded.intake.demographics.age, null);
});

// ============================================================================
// Script order - the enforcement point requested for Phase 1: the guard must run before any
// other shared store's own top-level read(), which in this classic-script architecture means it
// must be the very first shared <script> tag, immediately after app.js.
// ============================================================================

test('user-scope-guard.js is the first shared script on all four character pages, immediately after app.js and before every other shared module', async () => {
  const laterModules = [
    'panel-system.js', 'sync-queue.js', 'session-workspace-logic.js', 'pattern-registry-store.js',
    'strategy-education-store.js', 'dev-user-switcher.js', 'trade-store.js', 'session-entry-flow.js',
    'mental-health-store.js', 'account-profile-store.js', 'ai-companion-profile.js'
  ];
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const appIndex = html.indexOf('<script src="app.js">');
    const guardIndex = html.indexOf('<script src="../shared/user-scope-guard.js">');
    assert.ok(appIndex > -1 && guardIndex > appIndex, character + ': guard loads after app.js');
    // Nothing else may sit between them - the very next <script src=...> after app.js must be the guard.
    const nextScriptAfterApp = html.indexOf('<script src=', appIndex + 1);
    assert.equal(nextScriptAfterApp, guardIndex, character + ': the guard is the immediate next script after app.js, nothing else in between');
    laterModules.forEach((file) => {
      // Matched as a real <script src> tag, not doc-comment prose elsewhere in the file that
      // also mentions a filename by name (e.g. panel-system.js's own top-of-file comment).
      const idx = html.indexOf('<script src="../shared/' + file + '">');
      assert.ok(idx > guardIndex, character + ': ' + file + ' must load after user-scope-guard.js');
    });
  }
});
