import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), key: index => Array.from(values.keys())[index] || null, get length() { return values.size; } };
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
  querySelector(sel) { return sel === '[data-dev-user-switcher]' ? (this.children.find(c => c.dataset && c.dataset.devUserSwitcher === '') || null) : null; }
  remove() {}
  get classList() { const self = this; return { add(c) { self.className = (self.className + ' ' + c).trim(); }, remove() {}, toggle() {} }; }
}

function descendants(node) { return node && node.children ? [node, ...node.children.flatMap(descendants)] : [node]; }
function textOf(node) { return descendants(node).map(n => n.textContent || '').join(' '); }

function makeSandbox(fetchImpl, localStorage, options) {
  const settings = new FakeNode('div'); settings.className = 'panel-settings';
  const noSettingsPanel = options && options.noSettingsPanel;
  const document = {
    createElement: tag => new FakeNode(tag),
    createTextNode: text => { const node = new FakeNode('#text'); node.textContent = text; return node; },
    documentElement: { lang: 'en' },
    body: new FakeNode('body'),
    querySelector: sel => (!noSettingsPanel && sel === '.panel-settings') ? settings : null,
    addEventListener() {}
  };
  const storage = localStorage || memoryStorage();
  const sandbox = {
    window: { top: { location: { hash: '' } } }, document, localStorage: storage, fetch: fetchImpl,
    MutationObserver: class { observe() {} },
    setTimeout: fn => fn(), clearTimeout() {}, Math
  };
  sandbox.window = Object.assign(sandbox.window, { document, localStorage: storage, fetch: fetchImpl, setTimeout: sandbox.setTimeout });
  return { sandbox, settings };
}

async function load(fetchImpl, localStorage, options) {
  const { sandbox, settings } = makeSandbox(fetchImpl, localStorage, options);
  vm.runInNewContext(await source('dev-user-switcher.js'), sandbox, { filename: 'dev-user-switcher.js' });
  return { window: sandbox.window, settings };
}

test('currentUserId()/setToken persist under the tradejournal:auth-token key, not the old dev-user-id key', async () => {
  const localStorage = memoryStorage();
  const { window } = await load(async () => ({ ok: false }), localStorage, { noSettingsPanel: true });
  await window.TradeJournalDevUserSwitcher.register({ email: 'a@b.com', password: 'abcd', displayName: 'A' }).catch(() => {});
  assert.equal(localStorage.getItem('tradejournal:dev-user-id'), null, 'the old key must not be used anymore');
});

test('register() POSTs to /api/auth/register, persists the returned token, and resolves the user', async () => {
  let requestBody = null;
  const fetchImpl = async (url, options) => {
    assert.equal(url, '/api/auth/register');
    requestBody = JSON.parse(options.body);
    return { ok: true, status: 201, json: async () => ({ user: { id: 'u1', displayName: requestBody.displayName }, token: 'signed-token-1' }) };
  };
  const { window } = await load(fetchImpl, memoryStorage(), { noSettingsPanel: true });
  const user = await window.TradeJournalDevUserSwitcher.register({ email: 'trader@example.com', password: 'abcd', displayName: 'Trader' });
  assert.equal(user.id, 'u1');
  assert.equal(requestBody.email, 'trader@example.com');
  assert.equal(window.TradeJournalDevUserSwitcher.currentUserId(), 'signed-token-1', 'the session token, not the raw user id, is what gets stored/attached to requests');
});

test('login() POSTs to /api/auth/login and never persists a token on a rejected response', async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, '/api/auth/login');
    return { ok: false, status: 401, json: async () => ({ error: 'INVALID_CREDENTIALS' }) };
  };
  const { window } = await load(fetchImpl, memoryStorage(), { noSettingsPanel: true });
  await assert.rejects(
    () => window.TradeJournalDevUserSwitcher.login({ email: 'x@y.com', password: 'wrong' }),
    (error) => error.code === 'INVALID_CREDENTIALS'
  );
  assert.equal(window.TradeJournalDevUserSwitcher.currentUserId(), '', 'a rejected login must never leave a token in storage');
});

test('loginWithGoogle(credential) POSTs the credential to /api/auth/google', async () => {
  let sentCredential = null;
  const fetchImpl = async (url, options) => {
    assert.equal(url, '/api/auth/google');
    sentCredential = JSON.parse(options.body).credential;
    return { ok: true, status: 200, json: async () => ({ user: { id: 'u2', displayName: 'G' }, token: 'signed-token-2' }) };
  };
  const { window } = await load(fetchImpl, memoryStorage(), { noSettingsPanel: true });
  await window.TradeJournalDevUserSwitcher.loginWithGoogle('raw-google-id-token');
  assert.equal(sentCredential, 'raw-google-id-token');
  assert.equal(window.TradeJournalDevUserSwitcher.currentUserId(), 'signed-token-2');
});

test('logout() clears the stored token', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:auth-token', 'some-token');
  const { window } = await load(async () => ({ ok: true }), localStorage, { noSettingsPanel: true });
  window.TradeJournalDevUserSwitcher.logout();
  assert.equal(window.TradeJournalDevUserSwitcher.currentUserId(), '');
});

test('isStoredUserValid() checks the token against GET /api/users/me, is cached per page load, and never self-heals', async () => {
  let fetchCount = 0;
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:auth-token', 'a-token');
  const { window } = await load(async (url) => { fetchCount += 1; assert.equal(url, '/api/users/me'); return { ok: true, json: async () => ({ id: 'u1' }) }; }, localStorage, { noSettingsPanel: true });
  assert.equal(await window.TradeJournalDevUserSwitcher.isStoredUserValid(), true);
  assert.equal(fetchCount, 1);
  await window.TradeJournalDevUserSwitcher.isStoredUserValid();
  assert.equal(fetchCount, 1, 'the validation result is cached for the lifetime of the page load, not re-fetched every call');
  assert.equal(localStorage.getItem('tradejournal:auth-token'), 'a-token', 'a pure check must never mutate storage as a side effect');
});

test('isStoredUserValid() is false with no stored token at all, without making a network call', async () => {
  let called = false;
  const { window } = await load(async () => { called = true; return { ok: true, json: async () => ({}) }; }, memoryStorage(), { noSettingsPanel: true });
  assert.equal(await window.TradeJournalDevUserSwitcher.isStoredUserValid(), false);
  assert.equal(called, false);
});

test('ensureUser() resolves the stored token when valid, and REJECTS (no self-heal / no auto-bootstrap) when invalid or missing', async () => {
  const validStorage = memoryStorage();
  validStorage.setItem('tradejournal:auth-token', 'good-token');
  const valid = await load(async () => ({ ok: true, json: async () => ({ id: 'u1' }) }), validStorage, { noSettingsPanel: true });
  assert.equal(await valid.window.TradeJournalDevUserSwitcher.ensureUser(), 'good-token');

  const invalid = await load(async () => ({ ok: false }), memoryStorage(), { noSettingsPanel: true });
  await assert.rejects(() => invalid.window.TradeJournalDevUserSwitcher.ensureUser(), /NOT_AUTHENTICATED/);
});

test('the Settings card shows the logged-in identity and a Log out control - no DEV MODE badge, no switch-to-any-user dropdown', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:auth-token', 'a-token');
  const { settings } = await load(async () => ({ ok: true, json: async () => ({ id: 'u1', displayName: 'Real Trader', email: 'real@example.com' }) }), localStorage);
  const card = settings.children.find(c => c.dataset && c.dataset.devUserSwitcher === '');
  assert.ok(card, 'a card guarded by data-dev-user-switcher must be appended into .panel-settings');
  assert.doesNotMatch(textOf(card), /DEV MODE/, 'the old non-production warning must be gone now that authentication is real');
  const selects = descendants(card).filter(n => n.tagName === 'select');
  assert.equal(selects.length, 0, 'the old switch-to-any-existing-user dropdown (an impersonation hole) must not exist anymore');
  const inputs = descendants(card).filter(n => n.tagName === 'input');
  assert.equal(inputs.length, 0, 'no free-text display-name input either - account creation lives on the select page now');
});
