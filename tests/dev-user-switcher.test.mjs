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
    querySelector: sel => (!noSettingsPanel && sel === '.panel-settings') ? settings : null,
    addEventListener() {}
  };
  const storage = localStorage || memoryStorage();
  // Option is a real DOM global (<option> element constructor) that dev-user-switcher.js's
  // refresh() calls via `new Option(...)` to populate the user <select> - not provided by
  // Node by default, so the sandbox must supply a minimal stand-in.
  class Option { constructor(text, value, defaultSelected, selected) { this.text = text; this.value = value; this.selected = !!selected; } }
  const sandbox = {
    window: {}, document, localStorage: storage, fetch: fetchImpl, Option,
    MutationObserver: class { observe() {} },
    setTimeout: fn => fn(), clearTimeout() {}, Math
  };
  sandbox.window = Object.assign(sandbox.window, { document, localStorage: storage, fetch: fetchImpl, setTimeout: sandbox.setTimeout, Option });
  return { sandbox, settings };
}

async function load(fetchImpl, localStorage, options) {
  const { sandbox, settings } = makeSandbox(fetchImpl, localStorage, options);
  vm.runInNewContext(await source('dev-user-switcher.js'), sandbox, { filename: 'dev-user-switcher.js' });
  return { window: sandbox.window, settings };
}

test('the DEV MODE label is rendered directly in the settings card DOM, not just documented in code', async () => {
  const { settings } = await load(async () => ({ ok: true, json: async () => [] }));
  const card = settings.children.find(c => c.dataset && c.dataset.devUserSwitcher === '');
  assert.ok(card, 'a card guarded by data-dev-user-switcher must be appended into .panel-settings');
  assert.match(textOf(card), /DEV MODE — not real authentication/, 'the exact non-production warning must be visible in the rendered card');
});

test('ensureUser() reuses an already-stored id without calling the server at all', async () => {
  // noSettingsPanel avoids mounting the settings card, whose own refresh() legitimately
  // fetches the user list for display purposes - that's separate from ensureUser() itself,
  // which is what this test isolates.
  let fetchCalled = false;
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:dev-user-id', 'existing-user');
  const { window } = await load(async () => { fetchCalled = true; return { json: async () => [] }; }, localStorage, { noSettingsPanel: true });
  const id = await window.TradeJournalDevUserSwitcher.ensureUser();
  assert.equal(id, 'existing-user');
  assert.equal(fetchCalled, false, 'no bootstrap request is needed once an id is already chosen');
});

test('ensureUser() adopts the first server-known user when none is stored locally yet', async () => {
  const { window } = await load(async () => ({ json: async () => ([{ id: 'server-user-1', displayName: 'Someone' }]) }));
  const id = await window.TradeJournalDevUserSwitcher.ensureUser();
  assert.equal(id, 'server-user-1');
  assert.equal(window.TradeJournalDevUserSwitcher.currentUserId(), 'server-user-1', 'the adopted id is persisted for next time');
});

test('ensureUser() auto-creates a user when neither a stored id nor any server users exist', async () => {
  let createBody = null;
  const fetchImpl = async (url, options) => {
    if (url === '/api/users' && (!options || !options.method)) return { ok: true, json: async () => [] };
    if (url === '/api/users' && options.method === 'POST') { createBody = JSON.parse(options.body); return { ok: true, status: 201, json: async () => ({ id: 'new-user-1', displayName: createBody.displayName }) }; }
    throw new Error('unexpected fetch ' + url);
  };
  const { window } = await load(fetchImpl);
  const id = await window.TradeJournalDevUserSwitcher.ensureUser();
  assert.equal(id, 'new-user-1');
  assert.ok(createBody.displayName, 'a generated display name is sent when auto-creating a fallback user');
  assert.equal(window.TradeJournalDevUserSwitcher.currentUserId(), 'new-user-1', 'a successful create persists the new id');
});

test('createUser() is exported and reusable by external callers (the login-time name step), and never persists on a failed/invalid response', async () => {
  const failing = await load(async (url, options) => {
    if (options && options.method === 'POST') return { ok: false, status: 500, json: async () => ({ error: 'BOOM' }) };
    return { ok: true, json: async () => [] }; // GET /api/users - unrelated to the create call under test
  });
  await assert.rejects(
    () => failing.window.TradeJournalDevUserSwitcher.createUser('Someone'),
    (error) => error.message === 'BOOM' && error.status === 500
  );
  assert.equal(failing.window.TradeJournalDevUserSwitcher.currentUserId(), '', 'a failed create must never leave a garbage id (e.g. the literal string "undefined") in storage');

  const succeeding = await load(async (url, options) => {
    if (options && options.method === 'POST') return { ok: true, status: 201, json: async () => ({ id: 'created-123', displayName: JSON.parse(options.body).displayName }) };
    return { ok: true, json: async () => [] };
  });
  const user = await succeeding.window.TradeJournalDevUserSwitcher.createUser('New Trader');
  assert.equal(user.id, 'created-123');
  assert.equal(succeeding.window.TradeJournalDevUserSwitcher.currentUserId(), 'created-123', 'a successful create persists the id as a side effect, so callers do not need to do it themselves');
});

test('the Settings card no longer offers a "create new user" form - only switching between existing users, since creation now happens at login', async () => {
  const { settings } = await load(async () => ({ ok: true, json: async () => [{ id: 'u1', displayName: 'A' }] }));
  const card = settings.children.find(c => c.dataset && c.dataset.devUserSwitcher === '');
  const inputs = descendants(card).filter(n => n.tagName === 'input');
  assert.equal(inputs.length, 0, 'no free-text display-name input should remain in the Settings card');
  const selects = descendants(card).filter(n => n.tagName === 'select');
  assert.equal(selects.length, 1, 'the switch-between-existing-users dropdown is still present');
});
