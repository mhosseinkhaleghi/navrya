import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

class FakeNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; this.attributes = {}; this._handlers = {}; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(type, fn) { this._handlers[type] = fn; }
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
  remove() {}
  focus() {}
  get classList() {
    const self = this;
    return {
      add(c) { if (self.className.split(' ').indexOf(c) === -1) self.className = (self.className + ' ' + c).trim(); },
      remove(c) { self.className = self.className.split(' ').filter(x => x !== c).join(' '); },
      toggle(c, on) { const has = self.className.split(' ').indexOf(c) > -1; const want = on === undefined ? !has : on; if (want && !has) this.add(c); else if (!want && has) this.remove(c); }
    };
  }
}

function descendants(node) { return node && node.children ? [node, ...node.children.flatMap(descendants)] : [node]; }
class Option { constructor(text, value, defaultSelected, selected) { this.text = text; this.value = value; this.selected = !!selected; } }

async function pageSandbox() {
  const layerCalls = [];
  let lastPage = null;
  const state = { hash: '' };
  const aiLink = new FakeNode('a'); aiLink.attributes.href = '#ai-settings';
  const communityLink = new FakeNode('a'); communityLink.attributes.href = '#community';
  const sidebarLinks = [aiLink, communityLink];
  const windowHandlers = {};
  const document = {
    createElement: tag => new FakeNode(tag),
    createTextNode: text => { const n = new FakeNode('#text'); n.textContent = text; return n; },
    documentElement: { lang: 'en' },
    querySelectorAll: sel => sel === '.sidebar nav a' ? sidebarLinks : [],
    querySelector: () => null,
    addEventListener() {}
  };
  const sandbox = {
    window: {}, document,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { get hash() { return state.hash; }, set hash(v) { state.hash = v; } },
    MutationObserver: class { observe() {} },
    setTimeout: fn => fn(), clearTimeout() {},
    Option, Math, JSON, console, Intl
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, location: sandbox.location,
    addEventListener(type, fn) { windowHandlers[type] = windowHandlers[type] || []; windowHandlers[type].push(fn); },
    setTimeout: sandbox.setTimeout,
    TradeJournalPanelLayer: { show: (page, view) => { layerCalls.push(view); lastPage = page; } }
  });
  for (const file of ['ai-i18n.js', 'ai-settings-store.js']) {
    vm.runInNewContext(await source(file), sandbox, { filename: file });
  }
  return {
    sandbox, layerCalls, sidebarLinks, windowHandlers,
    setHash: v => { state.hash = v; },
    getPage: () => lastPage
  };
}

async function loadPage(hashBefore) {
  const ctx = await pageSandbox();
  ctx.setHash(hashBefore || '');
  vm.runInNewContext(await source('ai-settings-ui.js'), ctx.sandbox, { filename: 'ai-settings-ui.js' });
  return ctx;
}

test('renders and calls layer.show(page, "ai-settings") when the hash already matches on load (e.g. a page refresh)', async () => {
  const ctx = await loadPage('#ai-settings');
  assert.deepEqual(ctx.layerCalls, ['ai-settings']);
});

test('does not render anything when the hash does not match #ai-settings on load', async () => {
  const ctx = await loadPage('#community');
  assert.deepEqual(ctx.layerCalls, []);
});

test('renders on hashchange when navigating to #ai-settings from elsewhere', async () => {
  const ctx = await loadPage('#community');
  assert.deepEqual(ctx.layerCalls, [], 'sanity check - nothing rendered yet');
  ctx.setHash('#ai-settings');
  (ctx.windowHandlers.hashchange || []).forEach(fn => fn());
  assert.deepEqual(ctx.layerCalls, ['ai-settings']);
});

test('the manual sidebar active-class toggle marks only the #ai-settings link active, mirroring the pattern already used for #community/#mindset/profile', async () => {
  const ctx = await loadPage('#ai-settings');
  assert.match(ctx.sidebarLinks[0].className, /active/, '#ai-settings link is active');
  assert.doesNotMatch(ctx.sidebarLinks[1].className, /active/, '#community link is not');
});

test('the page reuses ai-settings-ui.js\'s existing buildSection() output - provider/model selects, BYO key field, and a genuinely disabled voice checkbox are all present', async () => {
  const ctx = await loadPage('#ai-settings');
  const page = ctx.getPage();
  const all = descendants(page);
  const selects = all.filter(n => n.tagName === 'select');
  assert.ok(selects.length >= 2, 'provider select and model select are both present');
  const keyInput = all.find(n => n.tagName === 'input' && n.type === 'password');
  assert.ok(keyInput, 'the BYO API key field is present');
  const voiceCheckbox = all.find(n => n.tagName === 'input' && n.type === 'checkbox' && n.disabled === true);
  assert.ok(voiceCheckbox, 'the voice-mode checkbox is present and genuinely disabled, not just styled that way');
  const aiSettingsCard = all.find(n => n.dataset && n.dataset.aiSettings === '');
  assert.ok(aiSettingsCard, 'the original data-ai-settings card is still the thing being rendered - a relocation, not a rewrite');
});

test('the generic-Settings-page mounting path (ensureAiSettings/.panel-settings) is gone from the source', async () => {
  const text = await source('ai-settings-ui.js');
  assert.doesNotMatch(text, /ensureAiSettings/);
  assert.doesNotMatch(text, /\.panel-settings/);
});
