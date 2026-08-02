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

async function loadInto(sandbox, files) {
  for (const file of files) vm.runInNewContext(await source(file), sandbox, { filename: file });
  return sandbox.window;
}

class FakeNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; this.style = {}; this.attributes = {}; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener() {}
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
  remove() {}
  get classList() {
    const self = this;
    return {
      add(c) { if (self.className.split(' ').indexOf(c) === -1) self.className = (self.className + ' ' + c).trim(); },
      remove(c) { self.className = self.className.split(' ').filter(x => x !== c).join(' '); },
      toggle(c, on) { if (on) this.add(c); else this.remove(c); }
    };
  }
}

// Route/open tests only need TradeJournalTradeStore/TradeJournalMentalHealthCharts to be
// truthy (mental-health-profile-page.js's load guard requires them) - neither is exercised
// by the 'intake'/'redflags' tabs these tests touch, so plain stub objects are sufficient.
function makeSandbox(localStorage) {
  const state = { hash: '' };
  const sandbox = {
    window: {}, localStorage: localStorage || memoryStorage(),
    document: {
      createElement: tag => new FakeNode(tag),
      createTextNode: text => { const node = new FakeNode('#text'); node.textContent = text; return node; },
      documentElement: { lang: 'en' },
      body: new FakeNode('body'),
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {}
    },
    location: { get hash() { return state.hash; }, set hash(value) { state.hash = value; } },
    history: { replaceState: (_s, _t, url) => { state.hash = url; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    setTimeout, clearTimeout
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage: sandbox.localStorage, dispatchEvent() {}, addEventListener() {},
    document: sandbox.document, setTimeout, clearTimeout,
    TradeJournalTradeStore: {},
    TradeJournalMentalHealthCharts: {}
  });
  return sandbox;
}

async function profilePageSandbox(layerCalls) {
  const sandbox = makeSandbox();
  await loadInto(sandbox, ['mental-health.types.js', 'mental-health-i18n.js', 'mental-health-safety.js', 'mental-health-store.js']);
  sandbox.window.TradeJournalPanelLayer = { show: (_page, view) => layerCalls.push(view) };
  await loadInto(sandbox, ['mental-health-profile-page.js']);
  return sandbox;
}

test('B2: route() parses #mindset/profile hashes for all four tabs and rejects anything else', async () => {
  const layerCalls = [];
  const sandbox = await profilePageSandbox(layerCalls);
  const page = sandbox.window.TradeJournalMentalHealthProfilePage;

  sandbox.location.hash = '#mindset/profile';
  assert.equal(page.route(), 'intake');
  sandbox.location.hash = '#mindset/profile/intake';
  assert.equal(page.route(), 'intake');
  sandbox.location.hash = '#mindset/profile/psychological';
  assert.equal(page.route(), 'psychological');
  sandbox.location.hash = '#mindset/profile/continuous';
  assert.equal(page.route(), 'continuous');
  sandbox.location.hash = '#mindset/profile/redflags';
  assert.equal(page.route(), 'redflags');
  sandbox.location.hash = '#mindset/profile/not-a-real-tab';
  assert.equal(page.route(), null);
  sandbox.location.hash = '#strategies/patterns/some-id/details';
  assert.equal(page.route(), null);
  sandbox.location.hash = '#mindset';
  assert.equal(page.route(), null, 'the bare #mindset route belongs to psychology-ui.js, not the profile page');
});

test('B2: open(tab) sets the hash and routes through TradeJournalPanelLayer.show(page, "psychology")', async () => {
  const layerCalls = [];
  const sandbox = await profilePageSandbox(layerCalls);
  const page = sandbox.window.TradeJournalMentalHealthProfilePage;

  page.open('redflags');
  assert.equal(sandbox.location.hash, '#mindset/profile/redflags');
  assert.ok(layerCalls.includes('psychology'), 'renderPage() must hand the built page to layer.show with the "psychology" nav key');

  layerCalls.length = 0;
  page.open();
  assert.equal(sandbox.location.hash, '#mindset/profile/intake', 'open() with no/invalid tab defaults to intake');
  assert.ok(layerCalls.includes('psychology'));

  layerCalls.length = 0;
  page.open('not-a-real-tab');
  assert.equal(sandbox.location.hash, '#mindset/profile/intake', 'an unrecognized tab also falls back to intake, not a broken hash');
});

test('B3: continuousTrackingTab() renders a preTradeContext section (previously missing entirely)', async () => {
  const layerCalls = [];
  const sandbox = await profilePageSandbox(layerCalls);
  const i18n = sandbox.window.TradeJournalMentalHealthI18n;
  const store = sandbox.window.TradeJournalMentalHealthStore;
  const page = sandbox.window.TradeJournalMentalHealthProfilePage;

  let profile = store.load();
  profile = store.addPreTradeContext(profile, 'trade-1', { sleepQuality: 3, significantPersonalEvent: 'divorce filing' });
  profile = store.addPreTradeContext(profile, 'trade-2', { sleepQuality: 8, significantPersonalEvent: null });
  assert.equal(profile.continuousTracking.preTradeContext.length, 2, 'sanity check on the write path itself');

  const wrap = page.continuousTrackingTab(profile);
  const preTradeCard = wrap.children.find(child => child.children[0] && child.children[0].textContent === i18n.t('mhPreTradeContextTitle'));
  assert.ok(preTradeCard, 'a card titled mhPreTradeContextTitle must be rendered in the Continuous Tracking tab');
  const list = preTradeCard.children[1];
  assert.equal(list.children.length, profile.continuousTracking.preTradeContext.length, 'every recorded pre-trade context entry must appear in the rendered list');
});
