import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// ADR-0001 superseded Phase 8e's localStorage-token-based version: boot-language-gate.js is now
// the CONSOLIDATED real-session boot gate (identity + purge-on-mismatch + language + reveal +
// redirect), driven by one GET /api/auth/session call (credentials:'include' - the HttpOnly
// session cookie rides along automatically). Real dynamic vm-sandbox coverage of its own logic
// (no DOM-building/MutationObserver dependency, so - like the Phase 8e version - it CAN be
// sandboxed), plus static assertions for the pieces this suite genuinely cannot execute.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (index) => Array.from(values.keys())[index] || null,
    get length() { return values.size; }
  };
}

async function runGate({ localStorage, fetchImpl, timers, topLocation } = {}) {
  localStorage = localStorage || memoryStorage();
  const root = { lang: 'fa', dir: 'rtl', style: {} };
  const scheduled = [];
  const top = { location: topLocation || { hash: '' } };
  const sandbox = {
    window: { top: top }, document: { documentElement: root }, localStorage,
    fetch: fetchImpl || (async () => { throw new Error('fetch must not be called in this test'); }),
    AbortController: typeof AbortController === 'function' ? AbortController : undefined,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    setTimeout: timers ? timers.setTimeout : ((fn, ms) => { const id = scheduled.length; scheduled.push({ fn, ms }); return id; }),
    clearTimeout: timers ? timers.clearTimeout : ((id) => { if (scheduled[id]) scheduled[id].cancelled = true; })
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {}, addEventListener() {} });
  vm.runInNewContext(await source('boot-language-gate.js'), sandbox, { filename: 'boot-language-gate.js' });
  await sandbox.window.__NAVRYA_AUTH_READY__;
  return { root, window: sandbox.window, scheduled, top };
}

test('unauthenticated (no session): reveals with the en/ltr default AND redirects to the account route (window.top.location.hash)', async () => {
  const { root, top } = await runGate({
    fetchImpl: async () => ({ ok: true, json: async () => ({ authenticated: false, user: null, csrfToken: null, language: null }) })
  });
  assert.equal(root.lang, 'en');
  assert.equal(root.dir, 'ltr');
  assert.equal(root.style.visibility, 'visible');
  assert.equal(top.location.hash, '/', 'an unauthenticated dashboard visit must redirect to the account/character-select route');
});

test('authenticated, with a real saved language preference: applies it, reveals, and populates window.__NAVRYA_AUTH__ with the REAL user id - never redirects', async () => {
  const { root, window, top } = await runGate({
    fetchImpl: async (url, options) => {
      assert.equal(url, '/api/auth/session');
      assert.equal(options.credentials, 'include');
      assert.equal(options.cache, 'no-store');
      return { ok: true, json: async () => ({ authenticated: true, user: { id: 'user-42', displayName: 'Trader' }, csrfToken: 'csrf-xyz', language: 'es' }) };
    }
  });
  assert.equal(root.lang, 'es');
  assert.equal(root.dir, 'ltr');
  assert.equal(root.style.visibility, 'visible');
  assert.equal(top.location.hash, '', 'an authenticated visit must never redirect');
  assert.equal(window.__NAVRYA_AUTH__.authenticated, true);
  assert.equal(window.__NAVRYA_AUTH__.userId, 'user-42');
  assert.equal(window.__NAVRYA_AUTH__.csrfToken, 'csrf-xyz');
});

test('a real user id different from the one last recorded on this browser triggers a purge (fail-closed on first load too, since no stamp exists yet)', async () => {
  const localStorage = memoryStorage({ 'tradejournal:trades:v1': JSON.stringify([{ id: 't1', owner: 'someone-else' }]) });
  await runGate({
    localStorage,
    fetchImpl: async () => ({ ok: true, json: async () => ({ authenticated: true, user: { id: 'user-99' }, csrfToken: 'c', language: 'en' }) })
  });
  assert.equal(localStorage.getItem('tradejournal:trades:v1'), null, 'no prior owner stamp is treated as a mismatch - fail closed, matching Phase 1\'s original rule');
  assert.equal(localStorage.getItem('tradejournal:owner-user-id:v1'), 'user-99');
});

test('reloading as the SAME real user id as last recorded does not purge', async () => {
  const localStorage = memoryStorage({
    'tradejournal:owner-user-id:v1': 'user-42',
    'tradejournal:trades:v1': JSON.stringify([{ id: 't1', owner: 'user-42' }])
  });
  await runGate({
    localStorage,
    fetchImpl: async () => ({ ok: true, json: async () => ({ authenticated: true, user: { id: 'user-42' }, csrfToken: 'c', language: 'en' }) })
  });
  assert.ok(localStorage.getItem('tradejournal:trades:v1'), 'a same-user reload must never wipe data that already belongs to them');
});

test("HOTFIX regression guard: reveal() must set visibility to the literal string 'visible', never clear it to '' - a real prior production bug (permanent black screen after login)", async () => {
  const rootNode = { lang: 'fa', dir: 'rtl', style: { visibility: 'hidden-sentinel' } };
  const sandbox = {
    window: { top: { location: { hash: '' } } }, document: { documentElement: rootNode }, localStorage: memoryStorage(),
    fetch: async () => ({ ok: true, json: async () => ({ authenticated: false }) }),
    AbortController: typeof AbortController === 'function' ? AbortController : undefined,
    CustomEvent: class {},
    setTimeout: (fn) => { fn(); return 0; }, clearTimeout: () => {}
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage: sandbox.localStorage, dispatchEvent() {}, addEventListener() {} });
  vm.runInNewContext(await source('boot-language-gate.js'), sandbox, { filename: 'boot-language-gate.js' });
  await sandbox.window.__NAVRYA_AUTH_READY__;
  assert.equal(rootNode.style.visibility, 'visible', "reveal() must explicitly set visibility to 'visible' - clearing to '' does not override the html{visibility:hidden} stylesheet rule");
});

test('arabic resolves to rtl, same as Persian', async () => {
  const { root } = await runGate({
    fetchImpl: async () => ({ ok: true, json: async () => ({ authenticated: true, user: { id: 'u1' }, csrfToken: 'c', language: 'ar' }) })
  });
  assert.equal(root.lang, 'ar');
  assert.equal(root.dir, 'rtl');
});

test('an unrecognized saved language value falls back to the honest default rather than applying garbage', async () => {
  const { root } = await runGate({
    fetchImpl: async () => ({ ok: true, json: async () => ({ authenticated: true, user: { id: 'u1' }, csrfToken: 'c', language: 'klingon' }) })
  });
  assert.equal(root.lang, 'en');
  assert.equal(root.dir, 'ltr');
});

test('a hydration failure (non-ok response) redirects to account with the default and explicit failure flag', async () => {
  const { root, window, top } = await runGate({ fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.equal(root.lang, 'en');
  assert.equal(root.style.visibility, 'visible');
  assert.equal(window.__TJ_LANGUAGE_HYDRATE_FAILED__, true);
  assert.equal(top.location.hash, '/');
});

test('a network-level fetch rejection is treated the same as a non-ok response and redirects to account', async () => {
  const { root, window, top } = await runGate({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal(root.lang, 'en');
  assert.equal(window.__TJ_LANGUAGE_HYDRATE_FAILED__, true);
  assert.equal(top.location.hash, '/');
});

test('a timeout aborts the request and reveals with the default, marking the failure flag - a hung network must never leave the page invisible forever', async () => {
  // Deliberately does not use runGate() - that helper now awaits __NAVRYA_AUTH_READY__ to full
  // resolution, but this test's whole point is to fire the timeout AFTER the script has started
  // (and captured the timeout callback) but BEFORE the fetch would otherwise resolve. Awaiting
  // the ready-promise first would deadlock (nothing has triggered the abort yet), so this test
  // builds the sandbox directly and calls timeoutFn() before awaiting.
  let timeoutFn = null;
  const rootNode = { lang: 'fa', dir: 'rtl', style: {} };
  const localStorage = memoryStorage();
  const sandbox = {
    window: { top: { location: { hash: '' } } }, document: { documentElement: rootNode }, localStorage,
    fetch: (url, options) => new Promise((resolve, reject) => {
      if (options && options.signal) options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }),
    AbortController: typeof AbortController === 'function' ? AbortController : undefined,
    CustomEvent: class {},
    setTimeout: (fn, ms) => { timeoutFn = fn; assert.ok(ms > 0 && ms <= 10000, 'a real, bounded timeout must be set'); return 1; },
    clearTimeout: () => {}
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {}, addEventListener() {} });
  vm.runInNewContext(await source('boot-language-gate.js'), sandbox, { filename: 'boot-language-gate.js' });
  assert.ok(timeoutFn, 'a timeout callback must have been scheduled');
  timeoutFn();
  await sandbox.window.__NAVRYA_AUTH_READY__;
  assert.equal(rootNode.style.visibility, 'visible');
  assert.equal(sandbox.window.__TJ_LANGUAGE_HYDRATE_FAILED__, true);
  assert.equal(sandbox.window.top.location.hash, '/');
});

// ---- Static assertions for the pieces this suite cannot execute directly ----

test('boot-language-gate.js is the very first script on all four character pages, before app.js, with the hiding <style> right before it', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const styleIndex = html.indexOf('<style>html{visibility:hidden}</style>');
    const gateIndex = html.indexOf('<script src="../shared/boot-language-gate.js">');
    const appIndex = html.indexOf('<script src="app.js">');
    assert.ok(styleIndex > -1, character + ': hiding style present');
    assert.ok(gateIndex > -1, character + ': boot-language-gate.js present');
    assert.ok(appIndex > -1, character + ': app.js present');
    assert.ok(styleIndex < gateIndex, character + ': hiding style before the gate script');
    assert.ok(gateIndex < appIndex, character + ': boot-language-gate.js loads before app.js');
    const between = html.slice(styleIndex + '<style>html{visibility:hidden}</style>'.length, gateIndex).trim();
    assert.equal(between, '', character + ': nothing should sit between the hiding style and the gate script');
  }
});

test('every character app.js no longer bootstraps lang/dir from localStorage - boot-language-gate.js owns that now', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const text = await readFile(path.join(root, 'public', 'pages', character, 'app.js'), 'utf8');
    assert.doesNotMatch(text, /localStorage\s*\.\s*\w+\s*\(/, character + ': app.js must have zero localStorage calls left');
    assert.doesNotMatch(text, /document\.documentElement\.lang\s*=/, character + ': app.js must not set lang itself any more');
    assert.doesNotMatch(text, /document\.documentElement\.dir\s*=/, character + ': app.js must not set dir itself any more');
  }
});

test("select/app.js and admin/app.js no longer read or write tradejournal-language - hardcoded to their own existing 'en' default (pre-auth, no user_id to attach a preference to)", async () => {
  const selectSrc = await readFile(path.join(root, 'public', 'pages', 'select', 'app.js'), 'utf8');
  const adminSrc = await readFile(path.join(root, 'public', 'pages', 'admin', 'app.js'), 'utf8');
  [selectSrc, adminSrc].forEach((text, i) => {
    const label = i === 0 ? 'select/app.js' : 'admin/app.js';
    assert.doesNotMatch(text, /localStorage\s*\.\s*(get|set)Item\s*\(\s*'tradejournal-language'/, label);
    assert.match(text, /let activeLanguage = 'en';/, label + ' must default to its own existing default');
  });
});

test("navrya-src/store.js's setLanguage() reads/writes through window.TradeJournalUserPreferences under the 'language' key, not localStorage", async () => {
  const text = await readFile(path.join(root, 'navrya-src', 'store.js'), 'utf8');
  assert.doesNotMatch(text, /localStorage\s*\.\s*\w+\s*\(/, 'store.js must have zero localStorage calls left');
  assert.match(text, /window\.TradeJournalUserPreferences\.setPref\('language', lang\)/);
});
