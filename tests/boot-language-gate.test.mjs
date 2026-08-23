import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Phase 8e of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section): boot-language-gate.js is the first script on every character page - real
// dynamic vm-sandbox coverage of its own logic (it has no DOM-building/MutationObserver
// dependency, unlike session-workspace-logic.js/panel-system.js, so unlike those files it CAN be
// sandboxed). The static assertions below cover the pieces this test suite genuinely cannot
// execute (the HTML script-order itself, and select/app.js's/admin/app.js's/navrya-src/store.js's
// own now-migrated call sites - the last is a .jsx-adjacent ES module this plain `node --test`
// runner has no transform for, same limitation as every other navrya-src file).
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

async function runGate({ localStorage, fetchImpl, timers } = {}) {
  localStorage = localStorage || memoryStorage();
  const root = { lang: 'fa', dir: 'rtl', style: {} };
  const scheduled = [];
  const sandbox = {
    window: {}, document: { documentElement: root }, localStorage,
    fetch: fetchImpl || (async () => { throw new Error('fetch must not be called in this test'); }),
    AbortController: typeof AbortController === 'function' ? AbortController : undefined,
    setTimeout: timers ? timers.setTimeout : ((fn, ms) => { const id = scheduled.length; scheduled.push({ fn, ms }); return id; }),
    clearTimeout: timers ? timers.clearTimeout : ((id) => { if (scheduled[id]) scheduled[id].cancelled = true; })
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage });
  vm.runInNewContext(await source('boot-language-gate.js'), sandbox, { filename: 'boot-language-gate.js' });
  await new Promise((resolve) => setImmediate(resolve)); // let the fetch promise chain settle
  return { root, window: sandbox.window, scheduled };
}

test('with no auth token, reveals immediately with the real fa/rtl default - never calls fetch', async () => {
  const { root } = await runGate({ localStorage: memoryStorage() });
  assert.equal(root.lang, 'fa');
  assert.equal(root.dir, 'rtl');
  assert.equal(root.style.visibility, 'visible');
});

test('with a token and a real saved language preference, applies it and reveals', async () => {
  const localStorage = memoryStorage({ 'tradejournal:auth-token': 'test-user' });
  const { root } = await runGate({
    localStorage,
    fetchImpl: async (url, options) => {
      assert.equal(url, '/api/sync/preferences');
      assert.equal(options.headers['x-dev-user-id'], 'test-user');
      return { ok: true, json: async () => ({ preferences: [{ id: 'language', value: 'es', updatedAt: 'x' }] }) };
    }
  });
  assert.equal(root.lang, 'es');
  assert.equal(root.dir, 'ltr');
  assert.equal(root.style.visibility, 'visible');
});

test("HOTFIX regression guard: reveal() must set visibility to the literal string 'visible', never clear it to '' - this was a real production bug (a permanent black screen on every character dashboard after login). The hiding rule (<style>html{visibility:hidden}</style>) is a stylesheet rule, not an inline style; clearing an inline style that was never set to 'hidden' in the first place is a no-op, and the stylesheet rule keeps applying forever. This test seeded root.style.visibility with a non-empty sentinel first, so a regression back to `visibility = ''` would still pass root.style.visibility !== 'sentinel' but MUST fail this exact assertion.", async () => {
  const localStorage = memoryStorage();
  const root = { lang: 'fa', dir: 'rtl', style: { visibility: 'hidden-sentinel' } };
  const sandbox = {
    window: {}, document: { documentElement: root }, localStorage,
    fetch: async () => { throw new Error('fetch must not be called in this test'); },
    AbortController: typeof AbortController === 'function' ? AbortController : undefined,
    setTimeout: (fn) => { fn(); return 0; }, clearTimeout: () => {}
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage });
  vm.runInNewContext(await source('boot-language-gate.js'), sandbox, { filename: 'boot-language-gate.js' });
  assert.equal(root.style.visibility, 'visible', "reveal() must explicitly set visibility to 'visible' - clearing to '' does not override the html{visibility:hidden} stylesheet rule");
});

test("the literal source text sets visibility = 'visible', and never clears it to '' - a static backstop for the same regression class in case the dynamic test above is ever weakened", async () => {
  const text = await source('boot-language-gate.js');
  assert.match(text, /root\.style\.visibility\s*=\s*'visible'/);
  assert.doesNotMatch(text, /root\.style\.visibility\s*=\s*''/, "clearing to '' does not override the <style>html{visibility:hidden}</style> stylesheet rule - this is the exact bug that shipped a permanent black screen");
});

test('arabic resolves to rtl, same as Persian', async () => {
  const localStorage = memoryStorage({ 'tradejournal:auth-token': 'test-user' });
  const { root } = await runGate({
    localStorage,
    fetchImpl: async () => ({ ok: true, json: async () => ({ preferences: [{ id: 'language', value: 'ar' }] }) })
  });
  assert.equal(root.lang, 'ar');
  assert.equal(root.dir, 'rtl');
});

test('with a token but no saved preference row yet (a real account with nothing set), falls back to the honest default, not an error state', async () => {
  const localStorage = memoryStorage({ 'tradejournal:auth-token': 'test-user' });
  const { root } = await runGate({
    localStorage,
    fetchImpl: async () => ({ ok: true, json: async () => ({ preferences: [] }) })
  });
  assert.equal(root.lang, 'fa');
  assert.equal(root.dir, 'rtl');
});

test('a hydration failure (non-ok response) reveals with the default AND sets the explicit failure flag - never silently shown as success', async () => {
  const localStorage = memoryStorage({ 'tradejournal:auth-token': 'test-user' });
  const { root, window } = await runGate({
    localStorage,
    fetchImpl: async () => ({ ok: false, status: 500 })
  });
  assert.equal(root.lang, 'fa');
  assert.equal(root.style.visibility, 'visible');
  assert.equal(window.__TJ_LANGUAGE_HYDRATE_FAILED__, true);
});

test('a network-level fetch rejection is treated the same as a non-ok response - reveals with the default and sets the failure flag', async () => {
  const localStorage = memoryStorage({ 'tradejournal:auth-token': 'test-user' });
  const { root, window } = await runGate({
    localStorage,
    fetchImpl: async () => { throw new TypeError('Failed to fetch'); }
  });
  assert.equal(root.lang, 'fa');
  assert.equal(window.__TJ_LANGUAGE_HYDRATE_FAILED__, true);
});

test('an unrecognized saved language value falls back to the honest default rather than applying garbage', async () => {
  const localStorage = memoryStorage({ 'tradejournal:auth-token': 'test-user' });
  const { root } = await runGate({
    localStorage,
    fetchImpl: async () => ({ ok: true, json: async () => ({ preferences: [{ id: 'language', value: 'klingon' }] }) })
  });
  assert.equal(root.lang, 'fa');
  assert.equal(root.dir, 'rtl');
});

test('the one legitimate storage read is tradejournal:auth-token - the single documented EXACT_KEYS exception, same as every other migrated domain', async () => {
  const text = await source('boot-language-gate.js');
  const calls = Array.from(text.matchAll(/localStorage\s*\.\s*(\w+)\s*\(([^)]*)\)/g));
  assert.equal(calls.length, 1, JSON.stringify(calls));
  assert.equal(calls[0][1], 'getItem');
  assert.match(calls[0][2], /tradejournal:auth-token/);
});

test('a timeout aborts the request and reveals with the default, marking the failure flag - a hung network must never leave the page invisible forever', async () => {
  const localStorage = memoryStorage({ 'tradejournal:auth-token': 'test-user' });
  let timeoutFn = null;
  const { root, window } = await runGate({
    localStorage,
    timers: {
      setTimeout: (fn, ms) => { timeoutFn = fn; assert.ok(ms > 0 && ms <= 10000, 'a real, bounded timeout must be set'); return 1; },
      clearTimeout: () => {}
    },
    fetchImpl: (url, options) => new Promise((resolve, reject) => {
      // Never resolves on its own - only the abort signal (fired by the timeout callback) settles it,
      // proving the timeout is actually wired to the real fetch call, not just declared and unused.
      if (options && options.signal) options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })
  });
  assert.ok(timeoutFn, 'a timeout callback must have been scheduled');
  timeoutFn();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(root.style.visibility, 'visible');
  assert.equal(window.__TJ_LANGUAGE_HYDRATE_FAILED__, true);
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
    // Nothing real (a stylesheet, another script) sits between the hiding style and the gate -
    // the window of unhidden-but-unstyled content must be as close to zero as possible.
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

test('select/app.js and admin/app.js no longer read or write tradejournal-language - hardcoded to their own existing \'en\' default, confirmed from the removed fallback, not migrated (pre-auth, no user_id to attach a preference to)', async () => {
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
