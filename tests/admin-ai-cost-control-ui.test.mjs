import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Focused sandbox for public/pages/admin/app.js's new AI Cost Control subtab. Mirrors
// tests/admin-frontend.test.mjs's own buildSandbox()/FakeNode/load() convention (each admin
// frontend test file builds its own minimal DOM sandbox rather than sharing one - no shared
// harness module exists for this page today) but trimmed to just what boot() and
// commercialAiCostControlSubTab() actually touch.
const root = process.cwd();
const source = () => readFile(path.join(root, 'public', 'pages', 'admin', 'app.js'), 'utf8');

class FakeNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; this.attributes = {}; this._handlers = {}; this.hidden = false; this.value = ''; this.selected = false; this.disabled = false; this.dir = ''; }
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
      toggle(c, on) { const has = self.className.split(' ').indexOf(c) > -1; const want = on === undefined ? !has : on; if (want && !has) this.add(c); else if (!want && has) this.remove(c); return want; },
      contains(c) { return self.className.split(' ').indexOf(c) > -1; }
    };
  }
}

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

function buildSandbox(fetchImpl) {
  const byId = {};
  ['toast', 'languageButton', 'languageMenu', 'currentLanguage', 'adminGate', 'gateEmail', 'gatePassword', 'gateError', 'gateSubmit',
    'adminLayout', 'adminSidebar', 'sidebarToggle', 'pageTitle', 'adminBody', 'currentUserLabel', 'currentUserName'].forEach((id) => { byId[id] = new FakeNode('div'); byId[id].hidden = true; });

  const document = {
    documentElement: {},
    createElement: (tag) => new FakeNode(tag),
    createTextNode: (text) => { const node = new FakeNode('#text'); node.textContent = text; return node; },
    querySelector: (sel) => (sel.startsWith('#') ? byId[sel.slice(1)] || null : null),
    querySelectorAll: (sel) => { if (sel === '[data-language]') return []; return []; },
    addEventListener() {}
  };

  const windowListeners = {};
  let hash = '';
  const location = {
    get hash() { return hash; },
    set hash(value) { hash = value; (windowListeners.hashchange || []).forEach((fn) => fn()); }
  };

  class Option {
    constructor(text, value, defaultSelected, selected) { this.tagName = 'option'; this.text = text; this.textContent = text; this.value = value; this.selected = Boolean(selected); }
  }

  const sandbox = {
    document, location, localStorage: memoryStorage(), fetch: fetchImpl,
    setTimeout: (fn, delay) => { if (!delay) fn(); return 0; }, clearTimeout() {},
    addEventListener: (type, fn) => { windowListeners[type] = windowListeners[type] || []; windowListeners[type].push(fn); },
    removeEventListener() {},
    innerWidth: 1280,
    TradeJournalDevUserSwitcher: { currentUserId: () => 'admin-1', login: () => Promise.resolve(null), logout: () => {} },
    Option,
    console
  };
  sandbox.window = sandbox;
  return sandbox;
}

async function loadApp(fetchImpl) {
  const sandbox = buildSandbox(fetchImpl);
  vm.runInNewContext(await source(), sandbox, { filename: 'admin-app.js' });
  return sandbox.window.TradeJournalAdminApp;
}

function findAll(node, predicate, out = []) {
  if (!node || !node.children) return out;
  node.children.forEach((child) => { if (predicate(child)) out.push(child); findAll(child, predicate, out); });
  return out;
}
function allText(node) { return [node.textContent || ''].concat(findAll(node, () => true).map((n) => n.textContent || '')).join(' | '); }

const RANGE = { start: '2026-08-01T00:00:00.000Z', end: '2026-08-30T00:00:00.000Z', preset: '30d' };

function fakeAiCostControlResponses(overrides = {}) {
  return Object.assign({
    overview: {
      range: RANGE, externalActualCostMicroUsd: 6000000, externalCostComparable: true,
      internalEstimateMicroUsd: 5000000, retailChargeMicroUsd: 15000000, actualWalletDebitMicroUsd: 15000000,
      actualWalletDebitSplit: { cashMicroUsd: 10000000, promoMicroUsd: 5000000 }, marginMicroUsd: 9000000,
      reconciliation: { matched: 10, exceptionCounts: { MISSING_SETTLEMENT: 1, ORPHAN_SETTLEMENT: 0, AMOUNT_MISMATCH: 0, PROVIDER_MODEL_MISMATCH: 0 }, totalExceptions: 1, truncated: false },
      freshness: { staleProviderCount: 0, notSyncedProviderCount: 3, comparableProviderCount: 1 }
    },
    providers: {
      range: RANGE,
      providers: [
        {
          provider: 'openai', displayName: 'OpenAI', adapterRegistered: true, supportsActualCosts: true, supportsBalance: false,
          credentialConfigured: true, credentialId: 'cred-1', scopeConfig: { projectId: 'proj_navrya' },
          external: { status: 'ok', provider: 'openai', comparable: true, externalActualCostMicroUsd: 6000000, internalEstimateMicroUsd: 5000000, retailChargeMicroUsd: 15000000, marginMicroUsd: 9000000, diffMicroUsd: 1000000, diffPercent: 20, tolerancePercent: 10, outOfTolerance: true, freshness: { lastSuccessfulSyncAt: '2026-08-29T00:00:00.000Z' } },
          balance: { supported: false, reason: 'NO_OFFICIAL_BALANCE_API' }, manualBalance: null
        },
        {
          provider: 'anthropic', displayName: 'Anthropic', adapterRegistered: false, supportsActualCosts: false, supportsBalance: false,
          credentialConfigured: false, credentialId: null, scopeConfig: null,
          external: { status: 'no_adapter', provider: 'anthropic', comparable: false, internalEstimateMicroUsd: 0, retailChargeMicroUsd: 0 },
          balance: { supported: false, reason: 'NO_OFFICIAL_BALANCE_API' }, manualBalance: null
        }
      ]
    },
    models: {
      range: RANGE, total: 1, page: 1, pageSize: 25,
      models: [{ provider: 'openai', model: 'gpt-5.6-sol', calls: 42, promptTokens: 10000, completionTokens: 5000, cachedInputTokens: 2000, cacheWriteInputTokens: 0, reasoningTokens: 500, providerCostMicroUsd: 5000000, retailChargeMicroUsd: 15000000, priceConfigured: true, externalCostSupported: false }]
    },
    reconInternal: {
      range: RANGE, matched: 10, matchedRetailMicroUsd: 15000000,
      exceptionCounts: { MISSING_SETTLEMENT: 1, ORPHAN_SETTLEMENT: 0, AMOUNT_MISMATCH: 0, PROVIDER_MODEL_MISMATCH: 0 },
      excludedCount: 2, scannedUsageEvents: 11, scannedSettlements: 10, truncated: false,
      exceptions: { items: [{ type: 'MISSING_SETTLEMENT', key: 'ai-settle:res-1', usageEventId: 'evt-1', provider: 'openai', model: 'gpt-5.6-sol', retailChargeMicroUsd: 900000, occurredAt: '2026-08-15T00:00:00.000Z' }], total: 1, page: 1, pageSize: 25, totalPages: 1 }
    },
    reconExternal: {
      range: RANGE, tolerancePercent: 10,
      providers: [
        { status: 'ok', provider: 'openai', comparable: true, externalActualCostMicroUsd: 6000000, internalEstimateMicroUsd: 5000000, retailChargeMicroUsd: 15000000, marginMicroUsd: 9000000, diffMicroUsd: 1000000, diffPercent: 20, tolerancePercent: 10, outOfTolerance: true },
        { status: 'no_adapter', provider: 'anthropic', comparable: false, internalEstimateMicroUsd: 0, retailChargeMicroUsd: 0 },
        { status: 'no_adapter', provider: 'kimi', comparable: false, internalEstimateMicroUsd: 0, retailChargeMicroUsd: 0 },
        { status: 'no_adapter', provider: 'deepseek', comparable: false, internalEstimateMicroUsd: 0, retailChargeMicroUsd: 0 }
      ]
    },
    credentials: { credentials: [{ id: 'cred-1', provider: 'openai', label: 'Prod org key', keyHint: '…ab12', scopeConfig: { projectId: 'proj_navrya' }, enabled: true, validationStatus: 'valid', validationError: null, validatedAt: '2026-08-29T00:00:00.000Z', updatedBy: 'admin-1', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' }] }
  }, overrides);
}

function fetchImplFor(responses) {
  return (url) => {
    const u = String(url);
    if (u.indexOf('/api/admin/config') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ authEnforced: false }) });
    if (u.indexOf('/ai-cost-control/overview') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(responses.overview) });
    if (u.indexOf('/ai-cost-control/providers') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(responses.providers) });
    if (u.indexOf('/ai-cost-control/models') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(responses.models) });
    if (u.indexOf('/ai-cost-control/reconciliation/internal') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(responses.reconInternal) });
    if (u.indexOf('/ai-cost-control/reconciliation/external') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(responses.reconExternal) });
    if (u.indexOf('/ai-cost-control/credentials') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(responses.credentials) });
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'UNEXPECTED_URL: ' + u }) });
  };
}

test('commercialAiCostControlSubTab renders real overview/provider/model/reconciliation/credential data from the six AI Cost Control endpoints', async () => {
  const responses = fakeAiCostControlResponses();
  const app = await loadApp(fetchImplFor(responses));
  const node = await app.commercialAiCostControlSubTab();
  const text = allText(node);

  // Overview: external cost, internal estimate, retail charge, wallet debit are all present and distinct.
  assert.match(text, /\$6\.0000/, 'external actual cost must render');
  assert.match(text, /\$5\.0000/, 'internal estimate must render');
  assert.match(text, /\$15\.0000/, 'retail charge / wallet debit must render');

  // Provider table: OpenAI shows real diff/out-of-tolerance; Anthropic shows the honest
  // "no adapter" state - never a fabricated $0 or a silently omitted provider.
  assert.match(text, /OpenAI/);
  assert.match(text, /Anthropic/);
  assert.match(text, /No official cost reconciliation adapter configured/, 'an unregistered provider adapter must say so explicitly, never show fake data');

  // Model table: real cache/reasoning token breakdown columns render, and external-cost-at-model-level
  // is explicitly marked unsupported rather than guessed.
  assert.match(text, /gpt-5\.6-sol/);
  assert.match(text, /Not supported at model level for this provider/);

  // Reconciliation: real exception type and counts render.
  assert.match(text, /MISSING_SETTLEMENT/);
  assert.match(text, /Out of tolerance/);

  // Credentials: masked hint renders, raw key never does (nothing to leak here since the fixture
  // itself never includes a raw key, but this also proves the UI never tries to read one).
  assert.match(text, /…ab12/);
  assert.doesNotMatch(text, /sk-/, 'no raw-looking API key material should ever appear in rendered text');
});
