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
  click() { if (this.onclick) this.onclick(); }
  get classList() {
    const self = this;
    return { add(c) { if (self.className.split(' ').indexOf(c) === -1) self.className = (self.className + ' ' + c).trim(); }, remove() {}, toggle() {} };
  }
}

function descendants(node) { return node && node.children ? [node, ...node.children.flatMap(descendants)] : [node]; }
function findByTag(root, tag) { return descendants(root).find(n => n && n.tagName === tag); }
function findAllByTag(root, tag) { return descendants(root).filter(n => n && n.tagName === tag); }
function findByTitle(root, title) { return descendants(root).find(n => n && n.title === title); }

// Loads the real ai-i18n.js, ai-settings-store.js and ai-process-registry.js modules
// alongside global-ai-dock.js in one sandbox, then stubs only the pieces the module
// deliberately treats as external integration points (trade store/UI, mental-health
// store/AI/safety, fetch) so the branch under test can be asserted precisely.
async function dockSandbox(overrides) {
  const fakeNav = new FakeNode('a'); fakeNav.id = 'assistantNav';
  const body = new FakeNode('body');
  const document = {
    createElement: tag => new FakeNode(tag),
    createTextNode: text => { const node = new FakeNode('#text'); node.textContent = text; return node; },
    documentElement: { lang: 'en' },
    body,
    querySelector: sel => sel === '#assistantNav' ? fakeNav : null,
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const sandbox = {
    window: {}, document, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    MutationObserver: class { observe() {} },
    setTimeout: fn => fn(), clearTimeout() {},
    fetch: overrides.fetch || (async () => { throw new Error('fetch must not be called in this test'); }),
    FileReader: class {}, URL, Promise, Set, Math, JSON, console
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, fetch: sandbox.fetch,
    TradeJournalMentalHealthStore: overrides.mentalHealthStore,
    TradeJournalMentalHealthAI: overrides.mentalHealthAI,
    TradeJournalMentalHealthSafety: overrides.mentalHealthSafety,
    TradeJournalAIUsage: overrides.aiUsage || { record() {} }
  });
  for (const file of ['ai-i18n.js', 'ai-settings-store.js', 'ai-process-registry.js']) {
    vm.runInNewContext(await source(file), sandbox, { filename: file });
  }
  vm.runInNewContext(await source('global-ai-dock.js'), sandbox, { filename: 'global-ai-dock.js' });
  const bar = body.children[0], panel = body.children[1];
  return { window: sandbox.window, fakeNav, body, bar, panel };
}

test('the docked launcher element is mounted with the data-global-ai-launcher attribute the calculator FAB repoints to', async () => {
  const { bar, panel } = await dockSandbox({});
  assert.ok(bar, 'a launcher bar element is appended to document.body');
  assert.equal(bar.dataset.globalAiLauncher, '', 'the exact attribute trade-ui.js\'s ensureGlobalUi() looks for');
  const providerBadge = descendants(bar).find(n => n.className === 'tj-dock-provider-badge');
  assert.equal(providerBadge.textContent, 'OpenAI', 'the provider badge must resolve the real i18n label (aiProviderOpenAI), not a raw fallback key');
  assert.equal(panel.hidden, true, 'the panel starts collapsed');
});

test('the sidebar #assistantNav link is NOT wired by the dock anymore - it now navigates to #ai-settings like a normal sidebar link, and never expands the panel', async () => {
  const { fakeNav, panel } = await dockSandbox({});
  assert.equal(fakeNav._handlers.click, undefined, 'global-ai-dock.js must not attach any click handler to #assistantNav - the sidebar item is a plain navigation link now');
  assert.equal(panel.hidden, true, 'the panel stays collapsed - only the floating launcher (data-global-ai-launcher) can open it');
});

test('the dock source no longer queries or attaches any listener to #assistantNav', async () => {
  const text = await source('global-ai-dock.js');
  assert.doesNotMatch(text, /querySelector\('#assistantNav'\)/, 'wireAssistantNav() and its DOM lookup were removed, not just left dormant');
  assert.doesNotMatch(text, /function wireAssistantNav/, 'the function itself is gone');
});

test('the calculator FAB in trade-ui.js targets the exact attribute the dock launcher carries', async () => {
  const dockText = await source('global-ai-dock.js');
  const tradeUiText = await source('trade-ui.js');
  assert.match(dockText, /bar\.dataset\.globalAiLauncher\s*=\s*''/);
  assert.match(tradeUiText, /document\.querySelector\('\[data-global-ai-launcher\]'\)/);
});

test('A6 OFF (default): sending a message never touches TradeJournalMentalHealthStore and goes through /api/ai/chat instead', async () => {
  const usageRecorded = [];
  let fetchCall = null;
  const mentalHealthStore = { addMessage() { throw new Error('therapist mode is off - addMessage must never be called'); }, load() { throw new Error('load must never be called either'); } };
  const { window, panel } = await dockSandbox({
    mentalHealthStore,
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'general help', suggestions: [], provider: 'openai', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }) }; },
    aiUsage: { record: entry => usageRecorded.push(entry) }
  });
  const input = findByTag(panel, 'textarea');
  const sendBtn = findByTitle(panel, window.TradeJournalAII18n.t('aiDockSend'));
  input.value = 'how do I read this chart?';
  await sendBtn.onclick();
  assert.ok(fetchCall, 'the OFF-mode gateway must be called');
  assert.equal(fetchCall.url, '/api/ai/chat');
  assert.equal(fetchCall.body.message, 'how do I read this chart?');
  assert.equal(fetchCall.body.provider, 'openai');
  // usageRecorded[0] is an object literal built inside the vm sandbox (a different
  // Object.prototype), so compare fields directly rather than deepEqual against an
  // outer-realm literal.
  assert.equal(usageRecorded.length, 1, 'the dock must record usage itself since this call bypasses the decorated AI clients');
  assert.equal(usageRecorded[0].provider, 'openai');
  assert.equal(usageRecorded[0].usage.totalTokens, 2);
  const messages = findAllByTag(panel, 'div').filter(n => n.className.indexOf('tj-dock-msg') === 0);
  assert.ok(messages.some(m => m.textContent === 'general help'), 'the assistant reply must render in the transcript');
});

test('A6 ON: toggling therapist mode routes through TradeJournalMentalHealthAI.chat(), appends to the profile chat history, and never calls the OFF-mode gateway', async () => {
  const addMessageCalls = [];
  const mentalHealthStore = {
    load: () => ({ chatHistory: [] }),
    addMessage: (profile, role, content) => { addMessageCalls.push([role, content]); return profile; }
  };
  const mentalHealthAI = { chat: async (_profile, message) => ({ flagged: false, reply: 'noted: ' + message, suggestions: [] }) };
  const { window, panel } = await dockSandbox({ mentalHealthStore, mentalHealthAI, fetch: async () => { throw new Error('the OFF-mode gateway must not be called while therapist mode is on'); } });

  const therapistBox = descendants(panel).find(n => n.type === 'checkbox');
  therapistBox.checked = true;
  therapistBox.onchange();

  const input = findByTag(panel, 'textarea');
  const sendBtn = findByTitle(panel, window.TradeJournalAII18n.t('aiDockSend'));
  input.value = 'I feel anxious about this trade';
  await sendBtn.onclick();

  assert.deepEqual(addMessageCalls, [['user', 'I feel anxious about this trade'], ['assistant', 'noted: I feel anxious about this trade']], 'both turns must be appended to the mental-health profile\'s own chat history via its existing store');
});

test('A6 ON: a flagged message stops at the safety gate - the assistant turn is never appended and the safety card renders instead of a reply', async () => {
  const addMessageCalls = [];
  const mentalHealthStore = { load: () => ({ chatHistory: [] }), addMessage: (profile, role, content) => { addMessageCalls.push([role, content]); return profile; } };
  const mentalHealthAI = { chat: async () => ({ flagged: true, reply: '', suggestions: [] }) };
  const mentalHealthSafety = { renderSafetyCard: () => { const node = new FakeNode('div'); node.className = 'safety-card'; return node; } };
  const { window, panel } = await dockSandbox({ mentalHealthStore, mentalHealthAI, mentalHealthSafety });

  const therapistBox = descendants(panel).find(n => n.type === 'checkbox');
  therapistBox.checked = true;
  therapistBox.onchange();

  const input = findByTag(panel, 'textarea');
  const sendBtn = findByTitle(panel, window.TradeJournalAII18n.t('aiDockSend'));
  input.value = 'a message the safety gate flags';
  await sendBtn.onclick();

  assert.deepEqual(addMessageCalls, [['user', 'a message the safety gate flags']], 'only the user turn is recorded - checkText() runs unconditionally inside chat() before any reply is produced');
  const safetyCard = descendants(panel).find(n => n.className === 'safety-card');
  assert.ok(safetyCard, 'the safety card must be rendered in place of a normal reply');
});
