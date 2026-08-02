import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const source = () => readFile(path.join(root, 'public', 'pages', 'admin', 'app.js'), 'utf8');

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

class FakeNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; this.attributes = {}; this._handlers = {}; this.hidden = false; }
  addEventListener(type, fn) { this._handlers[type] = this._handlers[type] || []; this._handlers[type].push(fn); }
  removeEventListener() {}
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  focus() {}
  get classList() {
    const self = this;
    return {
      add(c) { if (self.className.split(' ').indexOf(c) === -1) self.className = (self.className + ' ' + c).trim(); },
      remove(c) { self.className = self.className.split(' ').filter((x) => x !== c).join(' '); },
      toggle(c, on) { const has = self.className.split(' ').indexOf(c) > -1; const want = on === undefined ? !has : on; if (want && !has) this.add(c); else if (!want && has) this.remove(c); }
    };
  }
}

function buildSandbox(fetchImpl) {
  const toast = new FakeNode('div');
  const languageButton = new FakeNode('button');
  const languageMenu = new FakeNode('div'); languageMenu.hidden = true;
  const currentLanguage = new FakeNode('span');
  const langButtons = ['fa', 'ar', 'en', 'es'].map((l) => { const b = new FakeNode('button'); b.dataset.language = l; return b; });
  const adminGate = new FakeNode('div'); adminGate.hidden = true;
  const testModeBadge = new FakeNode('p'); testModeBadge.hidden = true;
  const enforcedBadge = new FakeNode('p'); enforcedBadge.hidden = true;
  const continueTestMode = new FakeNode('button'); continueTestMode.hidden = true;
  const adminShell = new FakeNode('main'); adminShell.hidden = true;
  const adminBody = new FakeNode('div');
  const tabButtons = ['users', 'ai', 'technical', 'xp', 'marketplace', 'financial'].map((tab) => { const b = new FakeNode('button'); b.dataset.tab = tab; return b; });

  const byId = { toast, languageButton, languageMenu, currentLanguage, adminGate, testModeBadge, enforcedBadge, continueTestMode, adminShell, adminBody };

  const documentElement = {};
  const document = {
    documentElement,
    createElement: (tag) => new FakeNode(tag),
    querySelector: (sel) => (sel.startsWith('#') ? byId[sel.slice(1)] || null : null),
    querySelectorAll: (sel) => {
      if (sel === '[data-i18n]') return [];
      if (sel === '[data-language]') return langButtons;
      if (sel === '#adminTabs button') return tabButtons;
      return [];
    },
    addEventListener() {}
  };

  let hash = '';
  const location = { get hash() { return hash; }, set hash(value) { hash = value; } };

  const sandbox = {
    document, location, localStorage: memoryStorage(), fetch: fetchImpl,
    setTimeout: (fn, delay) => { if (!delay) fn(); return 0; }, clearTimeout() {},
    addEventListener() {}, removeEventListener() {},
    console
  };
  sandbox.window = sandbox; // real browsers alias window to the global object itself

  return { sandbox, els: { toast, languageButton, languageMenu, currentLanguage, langButtons, adminGate, testModeBadge, enforcedBadge, continueTestMode, adminShell, adminBody, tabButtons } };
}

async function load(fetchCallCounter) {
  const fetchImpl = (...args) => {
    fetchCallCounter.count += 1;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ authEnforced: false }) });
  };
  const { sandbox, els } = buildSandbox(fetchImpl);
  vm.runInNewContext(await source(), sandbox, { filename: 'admin-app.js' });
  return { app: sandbox.window.TradeJournalAdminApp, els, sandbox };
}

test('route() parses all six admin tab hashes and defaults to "users" for anything else', async () => {
  const counter = { count: 0 };
  const { app, sandbox } = await load(counter);
  const cases = [
    ['#/admin/users', 'users'], ['#/admin/ai', 'ai'], ['#/admin/technical', 'technical'],
    ['#/admin/xp', 'xp'], ['#/admin/marketplace', 'marketplace'], ['#/admin/financial', 'financial'],
    ['', 'users'], ['#/admin/unknown', 'users'], ['#/dashboard/hunter', 'users']
  ];
  cases.forEach(([hash, expected]) => {
    sandbox.location.hash = hash;
    assert.equal(app.route(), expected, 'hash ' + JSON.stringify(hash) + ' should route to ' + expected);
  });
});

test('the XP & Segmentation tab renders its placeholder and issues zero additional fetch calls', async () => {
  const counter = { count: 0 };
  const { app } = await load(counter);
  const beforeCount = counter.count; // boot() itself calls fetch once on load - that's expected and unrelated
  const node = await app.xpTab();
  assert.equal(counter.count, beforeCount, 'the XP placeholder tab must never call fetch/the API');
  const texts = node.children.map((child) => child.textContent).join(' ');
  assert.match(texts, /XP control and user segmentation/);
  assert.match(texts, /coming in the next phase/i);
});

test('on load, the admin gate becomes visible with the TEST MODE banner shown (auth disabled by default in the stub config)', async () => {
  const counter = { count: 0 };
  const { els } = await load(counter);
  await new Promise((resolve) => setTimeout(resolve, 0)); // let boot()'s fetch chain settle
  assert.equal(els.adminGate.hidden, false);
  assert.equal(els.testModeBadge.hidden, false);
  assert.equal(els.continueTestMode.hidden, false);
  assert.equal(els.enforcedBadge.hidden, true);
});
