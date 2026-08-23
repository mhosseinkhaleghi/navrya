import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Phase 1 built this file as a token-decoding boot-time guard; ADR-0001's move to cookie-based
// sessions removed the client-readable credential that decoding depended on entirely, so the
// boot-time owner-mismatch DECISION now lives in boot-language-gate.js (see that file's own test
// file, tests/boot-language-gate.test.mjs, for the real-session-driven purge-decision coverage).
// This file (user-scope-guard.js) is kept as the on-demand PURGE LIBRARY only - purgeAll() and
// the key/prefix lists it purges - used directly by dev-user-switcher.js's logout() and by
// boot-language-gate.js's own (deliberately duplicated, see that file's comment) copy of the same
// routine. It no longer reads any credential, decodes any token, or auto-runs anything at load.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}

function flush() { return new Promise((resolve) => setImmediate(resolve)); }

async function loadGuard({ localStorage, imageStoreClearAll }) {
  const sandbox = { window: {}, localStorage, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } } };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent() {}, addEventListener() {},
    TradeJournalImageStore: imageStoreClearAll ? { clearAll: imageStoreClearAll } : undefined
  });
  vm.runInNewContext(await source('user-scope-guard.js'), sandbox, { filename: 'user-scope-guard.js' });
  return { guard: sandbox.window.TradeJournalUserScopeGuard, sandbox, localStorage };
}

test('loading the module alone never purges anything and never writes an owner-user-id stamp - it no longer auto-runs any identity check at load time', async () => {
  const localStorage = memoryStorage({
    'tradejournal:patterns:v1': JSON.stringify([{ id: 'p1' }]),
    'tradejournal:trades:v1': JSON.stringify([{ id: 't1' }])
  });
  await loadGuard({ localStorage });
  assert.ok(localStorage.getItem('tradejournal:patterns:v1'), 'no purge happens just from the module loading');
  assert.ok(localStorage.getItem('tradejournal:trades:v1'));
  assert.equal(localStorage.getItem('tradejournal:owner-user-id:v1'), null, 'nothing stamps an owner id on its own - that decision lives in boot-language-gate.js now');
});

test('purgeAll() wipes every scoped key unconditionally, including the sync outbox with real pending entries queued', async () => {
  const localStorage = memoryStorage({
    'tradejournal:owner-user-id:v1': 'user-A',
    'tradejournal:patterns:v1': JSON.stringify([{ id: 'p1' }]),
    'tradejournal:trades:v1': JSON.stringify([{ id: 't1' }]),
    'tradejournal:sync-queue:v1': JSON.stringify([{ id: 'sync-1', module: 'trades', recordId: 't1', action: 'upsert', payload: { id: 't1' }, attempts: 0, nextAttemptAt: 0 }])
  });
  const { guard } = await loadGuard({ localStorage });
  guard.purgeAll();
  assert.equal(localStorage.getItem('tradejournal:patterns:v1'), null);
  assert.equal(localStorage.getItem('tradejournal:trades:v1'), null);
  assert.equal(localStorage.getItem('tradejournal:sync-queue:v1'), null, 'a pending write must never survive a purge under a different account');
  assert.equal(localStorage.getItem('tradejournal:owner-user-id:v1'), null, 'purgeAll clears its own stamp too, leaving a clean slate');
});

test('migration-flag prefixes are swept for ANY embedded id on a purge', async () => {
  const localStorage = memoryStorage({
    'tradejournal:patterns-migrated:v1:user-old-1': '2020-01-01T00:00:00.000Z',
    'tradejournal:companion-state-migrated:v1:user-old-2': '2020-01-01T00:00:00.000Z'
  });
  const { guard } = await loadGuard({ localStorage });
  guard.purgeAll();
  assert.equal(localStorage.getItem('tradejournal:patterns-migrated:v1:user-old-1'), null);
  assert.equal(localStorage.getItem('tradejournal:companion-state-migrated:v1:user-old-2'), null);
});

test('explicitly out-of-scope keys survive a purge unconditionally: the opt-in BYOK key and internal one-time data-shape flags', async () => {
  const localStorage = memoryStorage({
    'tradejournal:ai-byok:v1': JSON.stringify({ openai: 'sk-should-survive' }),
    'tradejournal:sessions-shared-migration:v1': '2024-01-01T00:00:00.000Z',
    'tradejournal:session-library-empty-reset:v1': '2024-01-01T00:00:00.000Z',
    'tradejournal:ai-settings:v1': JSON.stringify({ provider: 'anthropic' }) // Group B preference - out of this guard's scope
  });
  const { guard } = await loadGuard({ localStorage });
  guard.purgeAll();
  assert.ok(localStorage.getItem('tradejournal:ai-byok:v1'), 'the opt-in BYOK key was explicitly kept out of scope');
  assert.ok(localStorage.getItem('tradejournal:sessions-shared-migration:v1'));
  assert.ok(localStorage.getItem('tradejournal:session-library-empty-reset:v1'));
  assert.ok(localStorage.getItem('tradejournal:ai-settings:v1'), 'Group B preferences are deferred to a later phase, not purged here');
});

class FakeDomNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  addEventListener() {} removeEventListener() {} querySelectorAll() { return []; } querySelector() { return null; } remove() {}
  get classList() { return { add() {}, remove() {}, toggle() {} }; }
}

test('the real dev-user-switcher.js logout() sequence calls purgeAll() and clears window.__NAVRYA_AUTH__, without needing any credential in storage', async () => {
  const localStorage = memoryStorage({
    'tradejournal:owner-user-id:v1': 'user-A',
    'tradejournal:trades:v1': JSON.stringify([{ id: 't1' }])
  });
  const document = {
    createElement: (tag) => new FakeDomNode(tag), createTextNode: (text) => { const node = new FakeDomNode('#text'); node.textContent = text; return node; },
    documentElement: { lang: 'en' }, body: new FakeDomNode('body'), querySelector: () => null, addEventListener() {}
  };
  let loggedOutRequested = false;
  const fetchStub = (url, options) => {
    if (url === '/api/auth/logout') { loggedOutRequested = true; return Promise.resolve({ ok: true, json: async () => ({ ok: true }) }); }
    return Promise.resolve({ ok: true, json: async () => ({ authenticated: false }) });
  };
  const sandbox = {
    window: { top: { location: { hash: '' } }, __NAVRYA_AUTH__: { authenticated: true, userId: 'user-A', user: { id: 'user-A' }, csrfToken: 'csrf-abc' } },
    document, localStorage, fetch: fetchStub,
    MutationObserver: class { observe() {} }, setTimeout: (fn) => fn(), clearTimeout() {}, Math,
    BroadcastChannel: undefined,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, { document, localStorage, fetch: fetchStub, dispatchEvent() {}, addEventListener() {}, setTimeout: sandbox.setTimeout });
  vm.runInNewContext(await source('user-scope-guard.js'), sandbox, { filename: 'user-scope-guard.js' });
  vm.runInNewContext(await source('dev-user-switcher.js'), sandbox, { filename: 'dev-user-switcher.js' });
  await sandbox.window.TradeJournalDevUserSwitcher.logout();
  assert.ok(loggedOutRequested, 'a real POST /api/auth/logout must be attempted, not just a local flag flip');
  assert.equal(localStorage.getItem('tradejournal:owner-user-id:v1'), null, 'the local purge ran as part of logout()');
  assert.equal(localStorage.getItem('tradejournal:trades:v1'), null);
  assert.equal(sandbox.window.__NAVRYA_AUTH__.authenticated, false, 'in-memory auth state is cleared too');
});

test('IndexedDB: purgeAll() calls TradeJournalImageStore.clearAll() directly when it is already available', async () => {
  let cleared = false;
  const { guard } = await loadGuard({ localStorage: memoryStorage(), imageStoreClearAll: async () => { cleared = true; } });
  guard.purgeAll();
  await flush();
  assert.ok(cleared, 'clearAll() must be invoked directly when the image store module has already loaded');
});

test('IndexedDB: purgeAll() leaves a pending-clear flag instead when TradeJournalImageStore has not loaded yet', async () => {
  const { sandbox, guard } = await loadGuard({ localStorage: memoryStorage() }); // no imageStoreClearAll
  guard.purgeAll();
  assert.equal(sandbox.window.__TJ_PENDING_IMAGE_STORE_CLEAR__, true, 'session-entry-flow.js is the one place this flag is ever consumed, once it loads later in the real script order');
});

test('the guard exposes the exact key lists it purges, so a future silent edit narrowing them is caught here rather than discovered as a leak', async () => {
  const { guard } = await loadGuard({ localStorage: memoryStorage() });
  ['tradejournal:patterns:v1', 'tradejournal:strategies:v2', 'tradejournal:trades:v1', 'tradejournal:sessions:v1:shared',
    'tradejournal:mental-health-profile:v2', 'tradejournal:companion-state:v1', 'tradejournal:sync-queue:v1', 'tradejournal:dev-user-id'
  ].forEach((key) => assert.ok(guard.exactKeys.includes(key), key + ' must be in the purge set'));
  ['tradejournal:patterns-migrated:v1:', 'tradejournal:strategies-migrated:v1:', 'tradejournal:trades-migrated:v1:',
    'tradejournal:sessions-migrated:v1:', 'tradejournal:mental-health-migrated:v1:', 'tradejournal:companion-state-migrated:v1:'
  ].forEach((prefix) => assert.ok(guard.migrationFlagPrefixes.includes(prefix), prefix + ' must be swept'));
  assert.equal(guard.exactKeys.includes('tradejournal:ai-byok:v1'), false, 'explicitly out of scope per product decision');
});

// ============================================================================
// Script order - unchanged invariant: the guard must still run before any other shared store's
// own top-level read(), which in this classic-script architecture means it must be the very
// first shared <script> tag immediately after app.js. boot-language-gate.js and
// csrf-fetch-patch.js run even earlier than that, in <head>, before app.js itself - neither
// reads/writes any of the EXACT_KEYS-scoped domain data this guard purges (the former reads only
// the session cookie via a real fetch; the latter reads only the CSRF cookie), so their existing
// position ahead of app.js is not a violation of this invariant.
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
    const nextScriptAfterApp = html.indexOf('<script src=', appIndex + 1);
    assert.equal(nextScriptAfterApp, guardIndex, character + ': the guard is the immediate next script after app.js, nothing else in between');
    laterModules.forEach((file) => {
      const idx = html.indexOf('<script src="../shared/' + file + '">');
      assert.ok(idx > guardIndex, character + ': ' + file + ' must load after user-scope-guard.js');
    });
  }
});

test('boot-language-gate.js and csrf-fetch-patch.js load in <head>, before app.js - the two scripts genuinely allowed to run earlier than the guard', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const bootIndex = html.indexOf('<script src="../shared/boot-language-gate.js">');
    const csrfIndex = html.indexOf('<script src="../shared/csrf-fetch-patch.js">');
    const appIndex = html.indexOf('<script src="app.js">');
    assert.ok(bootIndex > -1 && bootIndex < appIndex, character + ': boot-language-gate.js must load before app.js');
    assert.ok(csrfIndex > -1 && csrfIndex < appIndex, character + ': csrf-fetch-patch.js must load before app.js');
    assert.ok(csrfIndex > bootIndex, character + ': csrf-fetch-patch.js loads right after boot-language-gate.js');
  }
});
