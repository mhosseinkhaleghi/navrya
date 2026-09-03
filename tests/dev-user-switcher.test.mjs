import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// ADR-0001: dev-user-switcher.js no longer stores a credential anywhere (no
// tradejournal:auth-token, no localStorage at all) - identity lives in window.__NAVRYA_AUTH__,
// populated by an early GET /api/auth/session (either boot-language-gate.js's own call on
// character pages, or this module's own self-bootstrap fallback on select/admin pages, which
// don't load that gate). currentUserId() now returns the REAL internal user id, fixing the
// pre-existing bug where every "is this mine?" comparison across the app (communityView.jsx,
// marketplaceView.jsx, messagesView.jsx) silently compared against a raw bearer token instead.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}

class FakeNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; this.attributes = {}; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener() {}
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector(sel) { return sel === '[data-dev-user-switcher]' ? (this.children.find((c) => c.dataset && c.dataset.devUserSwitcher === '') || null) : null; }
  remove() {}
  get classList() { const self = this; return { add(c) { self.className = (self.className + ' ' + c).trim(); }, remove() {}, toggle() {} }; }
}

function descendants(node) { return node && node.children ? [node, ...node.children.flatMap(descendants)] : [node]; }
function textOf(node) { return descendants(node).map((n) => n.textContent || '').join(' '); }

// authReady, when passed, pre-seeds window.__NAVRYA_AUTH_READY__ (simulating boot-language-gate.js
// having already resolved, the normal case on a character page) so this module's own
// self-bootstrap fallback fetch is never triggered and fetchImpl is only ever used for the
// specific register/login/logout/etc. call under test.
function makeSandbox(fetchImpl, options) {
  const settings = new FakeNode('div'); settings.className = 'panel-settings';
  const noSettingsPanel = options && options.noSettingsPanel;
  const document = {
    createElement: (tag) => new FakeNode(tag),
    createTextNode: (text) => { const node = new FakeNode('#text'); node.textContent = text; return node; },
    documentElement: { lang: 'en' },
    body: new FakeNode('body'),
    querySelector: (sel) => (!noSettingsPanel && sel === '.panel-settings') ? settings : null,
    addEventListener() {}
  };
  const localStorage = memoryStorage();
  const initialAuth = (options && options.authReady) || { authenticated: false, userId: null, user: null, csrfToken: null };
  const sandbox = {
    window: { top: { location: { hash: '' } }, __NAVRYA_AUTH_READY__: Promise.resolve(initialAuth), __NAVRYA_AUTH__: initialAuth },
    document, localStorage, fetch: fetchImpl,
    MutationObserver: class { observe() {} },
    BroadcastChannel: undefined, // not available in this sandbox - logout() must tolerate its absence
    setTimeout: (fn) => fn(), clearTimeout() {}, Math
  };
  sandbox.window = Object.assign(sandbox.window, { document, localStorage, fetch: fetchImpl, setTimeout: sandbox.setTimeout });
  return { sandbox, settings, localStorage };
}

async function load(fetchImpl, options) {
  const { sandbox, settings, localStorage } = makeSandbox(fetchImpl, options);
  vm.runInNewContext(await source('dev-user-switcher.js'), sandbox, { filename: 'dev-user-switcher.js' });
  return { window: sandbox.window, settings, localStorage };
}

test('no credential is ever written to localStorage - not under the old dev-user-id key, not under any auth-token key', async () => {
  const { window, localStorage } = await load(async () => ({ ok: true, status: 201, json: async () => ({ user: { id: 'u1', displayName: 'A' }, csrfToken: 'csrf-1' }) }), { noSettingsPanel: true });
  await window.TradeJournalDevUserSwitcher.register({ email: 'a@b.com', password: 'a genuinely long passphrase', displayName: 'A' });
  assert.equal(localStorage.length, 0, 'identity lives in window.__NAVRYA_AUTH__ only - no browser storage at all');
});

test('register() POSTs to /api/auth/register with credentials included, and currentUserId() returns the REAL internal user id (not a token)', async () => {
  let requestBody = null;
  let sawCredentials = null;
  const fetchImpl = async (url, options) => {
    assert.equal(url, '/api/auth/register');
    sawCredentials = options.credentials;
    requestBody = JSON.parse(options.body);
    return { ok: true, status: 201, json: async () => ({ user: { id: 'real-user-id-42', displayName: requestBody.displayName }, csrfToken: 'csrf-1' }) };
  };
  const { window } = await load(fetchImpl, { noSettingsPanel: true });
  const user = await window.TradeJournalDevUserSwitcher.register({ email: 'trader@example.com', password: 'a genuinely long passphrase', displayName: 'Trader' });
  assert.equal(user.id, 'real-user-id-42');
  assert.equal(requestBody.email, 'trader@example.com');
  assert.equal(sawCredentials, 'include');
  assert.equal(window.TradeJournalDevUserSwitcher.currentUserId(), 'real-user-id-42', 'the real user id must be returned, never a bearer token or anything else');
});

test('login() POSTs to /api/auth/login and never sets auth state on a rejected response', async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, '/api/auth/login');
    return { ok: false, status: 401, json: async () => ({ error: 'INVALID_CREDENTIALS' }) };
  };
  const { window } = await load(fetchImpl, { noSettingsPanel: true });
  await assert.rejects(
    () => window.TradeJournalDevUserSwitcher.login({ email: 'x@y.com', password: 'wrong' }),
    (error) => error.code === 'INVALID_CREDENTIALS'
  );
  assert.equal(window.TradeJournalDevUserSwitcher.currentUserId(), '', 'a rejected login must never leave a user id set');
});

test('loginWithGoogle(credential) POSTs the credential to /api/auth/google', async () => {
  let sentCredential = null;
  const fetchImpl = async (url, options) => {
    assert.equal(url, '/api/auth/google');
    sentCredential = JSON.parse(options.body).credential;
    return { ok: true, status: 200, json: async () => ({ user: { id: 'real-user-id-99', displayName: 'G' }, csrfToken: 'csrf-2' }) };
  };
  const { window } = await load(fetchImpl, { noSettingsPanel: true });
  await window.TradeJournalDevUserSwitcher.loginWithGoogle('raw-google-id-token');
  assert.equal(sentCredential, 'raw-google-id-token');
  assert.equal(window.TradeJournalDevUserSwitcher.currentUserId(), 'real-user-id-99');
});

test('logout() delegates the CSRF header to csrf-fetch-patch.js, then clears state only after a confirmed server logout', async () => {
  let loggedOutViaServer = false;
  const fetchImpl = async (url, options) => {
    if (url === '/api/auth/logout') {
      loggedOutViaServer = true;
      assert.equal(options.headers, undefined, 'the central cookie-mirroring fetch patch owns CSRF headers');
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({ authenticated: false }) };
  };
  const { window } = await load(fetchImpl, { noSettingsPanel: true, authReady: { authenticated: true, userId: 'user-1', user: { id: 'user-1' }, csrfToken: 'real-csrf-token' } });
  window.__NAVRYA_AUTH__ = { authenticated: true, userId: 'user-1', user: { id: 'user-1' }, csrfToken: 'real-csrf-token' };
  await window.TradeJournalDevUserSwitcher.logout();
  assert.ok(loggedOutViaServer, 'logout must actually revoke the session server-side, not just clear local state');
  assert.equal(window.TradeJournalDevUserSwitcher.currentUserId(), '');
  assert.equal(window.top.location.hash, '/', 'logout navigates to the account/login route');
});

test('logout() keeps local auth and route intact when the server call fails, so a live server session is never mistaken for a logout', async () => {
  const fetchImpl = async (url) => {
    if (url === '/api/auth/logout') return Promise.reject(new TypeError('Failed to fetch'));
    return { ok: true, json: async () => ({ authenticated: false }) };
  };
  const { window } = await load(fetchImpl, { noSettingsPanel: true });
  window.__NAVRYA_AUTH__ = { authenticated: true, userId: 'user-1', user: { id: 'user-1' }, csrfToken: 'real-csrf-token' };
  await assert.rejects(() => window.TradeJournalDevUserSwitcher.logout(), /Failed to fetch/);
  assert.equal(window.TradeJournalDevUserSwitcher.currentUserId(), 'user-1');
  assert.equal(window.top.location.hash, '');
});

test('logout() rejects a CSRF failure without clearing local auth or routing to the chooser', async () => {
  const { window } = await load(async (url) => {
    if (url === '/api/auth/logout') return { ok: false, status: 403, json: async () => ({ error: 'CSRF_TOKEN_MISSING' }) };
    return { ok: true, json: async () => ({ authenticated: false }) };
  }, { noSettingsPanel: true, authReady: { authenticated: true, userId: 'user-1', user: { id: 'user-1' }, csrfToken: 'old-token' } });
  await assert.rejects(() => window.TradeJournalDevUserSwitcher.logout(), (error) => error.code === 'CSRF_TOKEN_MISSING');
  assert.equal(window.TradeJournalDevUserSwitcher.currentUserId(), 'user-1');
  assert.equal(window.top.location.hash, '');
});

test('isStoredUserValid() reflects the real, already-resolved session bootstrap - true when authenticated, false when not', async () => {
  const authed = await load(async () => ({ ok: true, json: async () => ({ authenticated: false }) }), { noSettingsPanel: true, authReady: { authenticated: true, userId: 'u1', user: { id: 'u1' }, csrfToken: 'c' } });
  assert.equal(await authed.window.TradeJournalDevUserSwitcher.isStoredUserValid(), true);

  const anon = await load(async () => ({ ok: true, json: async () => ({ authenticated: false }) }), { noSettingsPanel: true });
  assert.equal(await anon.window.TradeJournalDevUserSwitcher.isStoredUserValid(), false);
});

test('ensureUser() resolves the real user id when authenticated, and REJECTS (no self-heal / no auto-bootstrap) when not', async () => {
  const authed = await load(async () => ({ ok: true, json: async () => ({ authenticated: false }) }), { noSettingsPanel: true, authReady: { authenticated: true, userId: 'good-user-id', user: { id: 'good-user-id' }, csrfToken: 'c' } });
  assert.equal(await authed.window.TradeJournalDevUserSwitcher.ensureUser(), 'good-user-id');

  const anon = await load(async () => ({ ok: true, json: async () => ({ authenticated: false }) }), { noSettingsPanel: true });
  await assert.rejects(() => anon.window.TradeJournalDevUserSwitcher.ensureUser(), /NOT_AUTHENTICATED/);
});

test('on a page that has NOT already started the session bootstrap (select/admin, no boot-language-gate.js), this module starts it itself exactly once', async () => {
  let fetchCount = 0;
  const { sandbox, settings } = makeSandbox(async (url, options) => {
    fetchCount += 1;
    assert.equal(url, '/api/auth/session');
    assert.equal(options.credentials, 'include');
    return { ok: true, json: async () => ({ authenticated: true, user: { id: 'self-bootstrapped-id' }, csrfToken: 'c' }) };
  }, { noSettingsPanel: true });
  delete sandbox.window.__NAVRYA_AUTH_READY__;
  delete sandbox.window.__NAVRYA_AUTH__;
  void settings;
  vm.runInNewContext(await source('dev-user-switcher.js'), sandbox, { filename: 'dev-user-switcher.js' });
  const userId = await sandbox.window.TradeJournalDevUserSwitcher.ensureUser();
  assert.equal(userId, 'self-bootstrapped-id');
  assert.equal(fetchCount, 1);
});

test('the Settings card shows the logged-in identity and a Log out control - no DEV MODE badge, no switch-to-any-user dropdown', async () => {
  const { settings } = await load(async () => ({ ok: true, json: async () => ({ authenticated: false }) }), { authReady: { authenticated: true, userId: 'u1', user: { id: 'u1', displayName: 'Real Trader', email: 'real@example.com' }, csrfToken: 'c' } });
  const card = settings.children.find((c) => c.dataset && c.dataset.devUserSwitcher === '');
  assert.ok(card, 'a card guarded by data-dev-user-switcher must be appended into .panel-settings');
  assert.match(textOf(card), /Real Trader/, 'the real, already-known user identity is shown synchronously - no extra network round trip needed to render it');
  assert.doesNotMatch(textOf(card), /DEV MODE/, 'the old non-production warning must be gone now that authentication is real');
  const selects = descendants(card).filter((n) => n.tagName === 'select');
  assert.equal(selects.length, 0, 'the old switch-to-any-existing-user dropdown (an impersonation hole) must not exist anymore');
  const inputs = descendants(card).filter((n) => n.tagName === 'input');
  assert.equal(inputs.length, 0, 'no free-text display-name input either - account creation lives on the select page now');
});
