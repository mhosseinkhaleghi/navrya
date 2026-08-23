import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

async function calculator() {
  const sandbox = { window: {} };
  vm.runInNewContext(await source('trade-calculator.js'), sandbox, { filename: 'trade-calculator.js' });
  return sandbox.window.TradeJournalTradeCalculator;
}

test('calculator returns net profit for a long target', async () => {
  const calc = await calculator();
  const value = calc.solve({ direction: 'long', entryPrice: 100, stopLoss: 95, positionSize: 5000, leverage: 10, feePercent: .06, takeProfits: [{ price: 110, portionPercent: 100 }] }, new Set(['entryPrice', 'stopLoss', 'positionSize', 'leverage']));
  assert.equal(value.totalCommission, 6);
  assert.equal(value.potentialProfit, 494);
  assert.equal(value.potentialProfitPercent, 98.8);
  assert.equal(value.rr, 2);
});

test('calculator returns net profit for a short target', async () => {
  const calc = await calculator();
  const value = calc.solve({ direction: 'short', entryPrice: 100, stopLoss: 105, positionSize: 5000, leverage: 10, feePercent: .06, takeProfits: [{ price: 90, portionPercent: 100 }] }, new Set(['entryPrice', 'stopLoss', 'positionSize', 'leverage']));
  assert.equal(value.potentialProfit, 494);
  assert.equal(value.rr, 2);
});

test('calculator weights multiple take-profit targets', async () => {
  const calc = await calculator();
  const value = calc.solve({ direction: 'long', entryPrice: 100, stopLoss: 95, positionSize: 5000, leverage: 10, feePercent: .06, takeProfits: [{ price: 105, portionPercent: 50 }, { price: 110, portionPercent: 50 }] }, new Set(['entryPrice', 'stopLoss', 'positionSize', 'leverage']));
  assert.equal(value.potentialProfit, 369);
  assert.equal(value.potentialProfitPercent, 73.8);
});

test('calculator solves risk amount and position size bidirectionally', async () => {
  const calc = await calculator();
  const value = calc.solve({ direction: 'long', entryPrice: 100, stopLoss: 95, riskPercent: 1, accountBalance: 10000, feePercent: .06, takeProfits: [{ price: 110, portionPercent: 100 }] }, new Set(['entryPrice', 'stopLoss', 'riskPercent', 'accountBalance']));
  assert.equal(value.riskAmount, 100);
  assert.equal(value.positionSize, 2000);
  assert.equal(value.potentialProfit, 197.6);
});

test('calculator leaves profit empty when inputs are insufficient', async () => {
  const calc = await calculator();
  const value = calc.solve({ entryPrice: 100, takeProfits: [{ price: 110, portionPercent: 100 }] }, new Set(['entryPrice']));
  assert.equal(value.potentialProfit, null);
  assert.equal(value.potentialProfitPercent, null);
});

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), key: index => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}

test('pattern report returns an explicit insufficient-data contract', async () => {
  const localStorage = memoryStorage();
  const sandbox = { window: {}, localStorage, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }, FileReader: class {} };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {} });
  vm.runInNewContext(await source('pattern-registry-store.js'), sandbox, { filename: 'pattern-registry-store.js' });
  const report = sandbox.window.TradeJournalPatternStore.scenarioReport('missing-pattern');
  assert.equal(report.hasData, false);
  assert.equal(report.detectionCount, null);
  assert.equal(report.averageCompletion, null);
  assert.equal(report.occurrenceRate, null);
});

test('session signature backfill skips unfinished sessions and is idempotent', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:sessions:v1:hunter', JSON.stringify([
    { id: 'closed-1', status: 'closed', market: 'London', timeframe: '5m', fateSummary: { note: 'Continuation won' }, entries: [] },
    { id: 'open-1', status: 'open', market: 'London', timeframe: '5m', entries: [] },
    { id: 'closed-no-fate', status: 'closed', market: 'London', timeframe: '5m', entries: [] }
  ]));
  // A minimal in-memory fake of the real /api/sync/session-signatures contract (see
  // routes.session-signatures.mjs) - GET returns whatever has been POSTed so far, POST
  // upserts by id. Phase 8a moved this store onto server-replica.js, same as every other
  // migrated domain, so it needs server-replica.js loaded + a real authenticated
  // window.__NAVRYA_AUTH__ (ADR-0001) + a fetch mock, not just a fake localStorage.
  let signatures = [];
  const fetchImpl = async (url, options) => {
    if (url === '/api/sync/session-signatures' && (!options || !options.method || options.method === 'GET')) return { ok: true, json: async () => ({ signatures }) };
    if (url === '/api/sync/session-signatures' && options.method === 'POST') {
      const record = JSON.parse(options.body);
      signatures = signatures.filter((s) => s.id !== record.id).concat(record);
      return { ok: true, json: async () => record };
    }
    throw new Error('unexpected fetch in session-signature backfill test: ' + url);
  };
  const sandbox = { window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'test-user', user: { id: 'test-user' }, csrfToken: 'test-csrf' } }, localStorage, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }, setTimeout: fn => fn(), Date, Set, fetch: fetchImpl };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {}, fetch: sandbox.fetch });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('session-signature-store.js'), sandbox, { filename: 'session-signature-store.js' });
  const store = sandbox.window.TradeJournalSessionSignatureStore;
  await new Promise((resolve) => setImmediate(resolve)); // let hydrate() + the module's own auto-run backfill() settle
  assert.equal(store.listSync().length, 1);
  assert.equal(store.listSync()[0].sessionId, 'closed-1');
  assert.equal(await store.backfill(), 0);
  assert.equal(store.listSync().length, 1);
});

test('session signature engine handles an empty library', async () => {
  const sandbox = { window: {}, Promise, Set, Math };
  vm.runInNewContext(await source('session-signature-engine.js'), sandbox, { filename: 'session-signature-engine.js' });
  assert.deepEqual(Array.from(sandbox.window.TradeJournalSessionSignatureEngine.compare({ market: 'London' }, [])), []);
});

test('all character pages load session signature modules in dependency order', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const types = html.indexOf('session-signature.types.js');
    const store = html.indexOf('session-signature-store.js');
    const engine = html.indexOf('session-signature-engine.js');
    const ui = html.indexOf('session-signature-ui.js');
    const workspace = html.indexOf('session-workspace-logic.js');
    // session-library.js is retired - the NAVRYA sessions app (navrya-src/character-app.jsx's
    // SessionsApp, mounted into #navryaSessionsRoot) now owns the session list and loads after
    // its workspace dependency, same as session-library.js used to.
    // Matched as a real <script src> tag, not the doc-comment prose above it that also
    // mentions this bundle's filename by name.
    const sessionsApp = html.indexOf('<script src="../shared/navrya-' + character + '-sessions-app.js">');
    assert.ok(types > -1 && types < store && store < engine && engine < ui && ui < workspace, character + ' signature script order');
    assert.ok(sessionsApp > workspace, character + ' navrya sessions app script order');
  }
});

test('all character pages load account profile modules in dependency order, link its CSS, and expose a stable #userChip', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const css = html.indexOf('account-profile.css');
    const rules = html.indexOf('profile-xp-rules.js');
    const achievements = html.indexOf('profile-achievements.js');
    const types = html.indexOf('account-profile.types.js');
    const i18n = html.indexOf('account-profile-i18n.js');
    const store = html.indexOf('account-profile-store.js');
    const ui = html.indexOf('account-profile-ui.js');
    const devUserSwitcher = html.indexOf('dev-user-switcher.js');
    assert.ok(css > -1, character + ' must link account-profile.css');
    assert.ok(devUserSwitcher > -1 && devUserSwitcher < store, character + ' dev-user-switcher.js must load before account-profile-store.js');
    assert.ok(rules > -1 && rules < ui, character + ' profile-xp-rules.js must load before account-profile-ui.js');
    assert.ok(achievements > -1 && achievements < ui, character + ' profile-achievements.js must load before account-profile-ui.js');
    assert.ok(types > -1 && types < ui, character + ' account-profile.types.js must load before account-profile-ui.js');
    assert.ok(i18n > -1 && i18n < ui, character + ' account-profile-i18n.js must load before account-profile-ui.js');
    assert.ok(store > -1 && store < ui, character + ' account-profile-store.js must load before account-profile-ui.js');
  }
  // The sidebar/header shell is a React root now (navrya-src/character-app.jsx) - #userChip is
  // rendered by CharacterIdentity.jsx and wired to TradeJournalAccountProfilePage.open() there,
  // not present in the static HTML the way the old static sidebar markup was.
  const identity = await source('navrya/components/identity/CharacterIdentity.jsx');
  assert.match(identity, /id="userChip"/, 'CharacterIdentity.jsx must render a stable #userChip');
  const characterApp = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
  assert.match(characterApp, /onIdentityClick=\{[^}]*TradeJournalAccountProfilePage/, 'character-app.jsx must wire the header identity click to open Account Profile');
});

test('trade store preserves hunting to open to emotion to closed lifecycle', async () => {
  const localStorage = memoryStorage();
  const events = [];
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'test-user', user: { id: 'test-user' }, csrfToken: 'test-csrf' } }, localStorage,
    document: { body: { dataset: {} } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    FileReader: class {},
    fetch: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ trades: [] }) }
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent: event => events.push(event), fetch: sandbox.fetch, TradeJournalTradeTypes: { timeframes: ['1m', '5m'] }, TradeJournalPanelLayer: { character: 'engineer' } });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('trade-store.js'), sandbox, { filename: 'trade-store.js' });
  await new Promise((resolve) => setImmediate(resolve)); // let hydrate() settle first
  const store = sandbox.window.TradeJournalTradeStore;
  let trade = store.createDraft({ status: 'hunting', source: { sessionId: 'session-1', scenarioId: 'scenario-1' } });
  trade = store.save(trade);
  assert.equal(store.findBySource('session-1', 'scenario-1').status, 'hunting');
  trade = store.updateStatus(trade.id, 'open');
  assert.ok(trade.openedAt);
  store.addEmotion(trade.id, { dominantEmotions: ['calm'], note: 'first' });
  trade = store.addEmotion(trade.id, { dominantEmotions: ['confident'], note: 'second' });
  assert.equal(trade.emotionLog.length, 2);
  trade = store.updateStatus(trade.id, 'closed', { exitPrice: 110, pnl: 25, outcome: 'win' });
  assert.equal(trade.status, 'closed');
  assert.ok(trade.closedAt);
  assert.ok(events.length >= 5);
});

test('trade store normalizes per-emotion intensity/tag details and clamps out-of-range input', async () => {
  const localStorage = memoryStorage();
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'test-user', user: { id: 'test-user' }, csrfToken: 'test-csrf' } }, localStorage,
    document: { body: { dataset: {} } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    FileReader: class {},
    fetch: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ trades: [] }) }
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {}, fetch: sandbox.fetch, TradeJournalTradeTypes: { timeframes: ['1m', '5m'] }, TradeJournalPanelLayer: { character: 'hunter' } });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('trade-store.js'), sandbox, { filename: 'trade-store.js' });
  await new Promise((resolve) => setImmediate(resolve)); // let hydrate() settle first
  const store = sandbox.window.TradeJournalTradeStore;
  let trade = store.save(store.createDraft({ status: 'open' }));
  trade = store.addEmotion(trade.id, { dominantEmotions: ['afraid'], emotionDetails: [{ emotion: 'afraid', intensity: 99, tags: ['ترس از ضرر', 'ترس از لیکویید شدن'] }], note: '' });
  assert.equal(trade.emotionLog[0].emotionDetails.length, 1);
  assert.equal(trade.emotionLog[0].emotionDetails[0].intensity, 10, 'intensity is clamped to the 1-10 range');
  assert.deepEqual(trade.emotionLog[0].emotionDetails[0].tags, ['ترس از ضرر', 'ترس از لیکویید شدن'], 'multiple tags per emotion are preserved');
  trade = store.addEmotion(trade.id, { dominantEmotions: [], emotionDetails: [], note: '' });
  assert.deepEqual(trade.emotionLog[1].emotionDetails, [], 'entries without details default to an empty array, not an error');
  trade = store.addEmotion(trade.id, { dominantEmotions: ['calm'], emotionDetails: [{ emotion: 'calm', intensity: 4, tag: 'legacy single tag' }], note: '' });
  const migratedTags = trade.emotionLog[2].emotionDetails[0].tags;
  assert.equal(migratedTags.length, 1, 'a legacy single-string tag migrates into the tags array');
  assert.equal(migratedTags[0], 'legacy single tag');
});

// Phase 2 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global
// Data Sync section / the Phase 2 report) moved strategy-education-store.js off localStorage
// entirely, onto server-replica.js's in-memory replica - this helper now loads that module too,
// and a real fetch (defaulting to an empty-list GET so listSync() starts genuinely empty, exactly
// like every other domain since the migration) rather than one that always throws.
async function strategyStore(localStorage, fetchImpl) {
  const events = [];
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'test-user', user: { id: 'test-user' }, csrfToken: 'test-csrf' } }, localStorage,
    document: { documentElement: { lang: 'en' } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    FileReader: class {}, fetch: fetchImpl || (async () => ({ ok: true, json: async () => ({ strategies: [] }) })), URL
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent: event => events.push(event), fetch: sandbox.fetch,
    TradeJournalDevUserSwitcher: { currentUserId: () => 'test-user' },
    TradeJournalStrategyEducationTypes: { numericPaths: ['riskManagement.maxRiskPerTradePercent','riskManagement.dailyDrawdownLimitPercent','riskManagement.totalDrawdownLimitPercent','riskManagement.maxConcurrentTrades','riskManagement.maxProfitCapPerTrade'] }
  });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('strategy-education-store.js'), sandbox, { filename: 'strategy-education-store.js' });
  await new Promise((resolve) => setImmediate(resolve)); // let hydrate() settle before the caller reads/writes
  return { store: sandbox.window.TradeJournalStrategyEducationStore, events };
}

test('a legacy pre-migration singleton left in localStorage is never adopted any more - Phase 2 removed the local-first-to-v2 migration path entirely, since Section 7.18\'s original server migration already ran for every real account', async () => {
  const localStorage = memoryStorage();
  const legacy = { id: 'strategy-education-singleton', positionManagement: { entryRules: 'Wait for confirmation' } };
  localStorage.setItem('tradejournal:strategy-education:v1', JSON.stringify(legacy));
  const { store } = await strategyStore(localStorage);
  assert.equal(store.listSync().length, 0, 'the legacy singleton is inert data now - only the server\'s own real strategies (from hydrate()) ever populate the list');
  assert.equal(localStorage.getItem('tradejournal:strategies:v2'), null, 'nothing is ever written back to localStorage any more, migrated or not');
});

// Trade Store is ALSO migrated (Phase 2) - orphanLinkedTrades() was found and fixed to go through
// the real window.TradeJournalTradeStore public API instead of reading/writing
// tradejournal:trades:v1 directly, which no longer exists as a localStorage key (the old direct
// version would have silently become a no-op). The real, full cross-domain proof (both stores
// loaded together, a trade actually orphaned end to end, and pushed to the server) now lives in
// tests/trades-sync.test.mjs instead - this helper deliberately never loads trade-store.js, so
// what it CAN still usefully prove is the defensive half: strategy deletion must never throw or
// get skipped just because Trade Store happens not to be loaded on this page/in this sandbox.
test('deleting a strategy still succeeds even when window.TradeJournalTradeStore is unavailable - orphanLinkedTrades() must never block the strategy\'s own deletion', async () => {
  const localStorage = memoryStorage();
  const fetchImpl = async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ strategies: [] }) };
  const { store } = await strategyStore(localStorage, fetchImpl);
  const strategy = store.create({ name: 'London playbook' });
  await store.remove(strategy.id);
  assert.equal(store.find(strategy.id), null);
});

test('two active strategies keep risk, chat, and detection data isolated', async () => {
  const localStorage = memoryStorage();
  const fetchImpl = async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ strategies: [] }) };
  const { store } = await strategyStore(localStorage, fetchImpl);
  let first = store.create({ name: 'First', riskManagement: { maxRiskPerTradePercent: 0.5 } });
  let second = store.create({ name: 'Second', riskManagement: { maxRiskPerTradePercent: 1.25 } });
  first = store.addMessage(first, 'user', 'first only');
  store.addDetectionEvent(first.id, { predictedOutcome: 'up', status: 'confirmed' });
  second = store.addMessage(second, 'user', 'second only');
  assert.equal(store.listActive().length, 2);
  assert.equal(store.getRiskDefaults(first.id).maxRiskPerTradePercent, 0.5);
  assert.equal(store.getRiskDefaults(second.id).maxRiskPerTradePercent, 1.25);
  assert.equal(store.find(first.id).chatHistory.length, 1);
  assert.equal(store.find(second.id).chatHistory[0].content, 'second only');
  assert.equal(store.find(first.id).detectionEvents.length, 1);
  assert.equal(store.find(second.id).detectionEvents.length, 0);
});

class FakeNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; this.attributes = {}; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  replaceWith() {}
  setAttribute(name, value) { this.attributes[name] = value; }
}

function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }

test('reusable active-position module exposes lifecycle actions and registers two panels', async () => {
  const calls = [];
  const records = [{ id: 't-1', status: 'hunting', direction: 'long', session: 'london', createdAt: new Date().toISOString(), entryPrice: 100, stopLoss: 95, takeProfits: [{ price: 110 }], leverage: 10, rr: 2, emotionLog: [], source: { sessionId: 's-1' } }];
  const store = { listSync: () => records, updateStatus: (id, status) => calls.push(['status', id, status]) };
  const ui = { statusLabel: value => value, openEmotion: (...args) => calls.push(['emotion', ...args]), closeTrade: (...args) => calls.push(['close', ...args]), viewTrade: (...args) => calls.push(['details', ...args]) };
  const registrations = [];
  const sandbox = {
    window: { TradeJournalTradeStore: store, TradeJournalTradeUI: ui, TradeJournalTradeI18n: { t: key => key, number: value => value == null ? '\u2014' : String(value), date: () => 'date' }, TradeJournalPanelLayer: { register: (...args) => registrations.push(args) }, addEventListener() {} },
    document: { createElement: tag => new FakeNode(tag), documentElement: {}, querySelectorAll: () => [] },
    MutationObserver: class { observe() {} },
    setTimeout: fn => fn()
  };
  vm.runInNewContext(await source('trade-open-positions.js'), sandbox, { filename: 'trade-open-positions.js' });
  const module = sandbox.window.TradeJournalOpenPositionsModule;
  assert.equal(module.listActive({ sessionId: 's-1' }).length, 1);
  const rendered = module.render({ sessionId: 's-1' });
  const buttons = descendants(rendered).filter(node => node.tagName === 'button');
  const open = buttons.find(node => node.textContent === 'markOpen');
  assert.ok(open);
  open.onclick();
  assert.deepEqual(calls[0], ['status', 't-1', 'open']);
  assert.deepEqual(registrations.map(item => item[0]), ['dashboard', 'sessions']);
});

test('all character entry pages load the reusable module in the correct order', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    assert.equal((html.match(/trade-open-positions\.js/g) || []).length, 1, character);
    assert.ok(html.indexOf('trade-ui.js') < html.indexOf('trade-open-positions.js'), character);
    assert.ok(html.indexOf('trade-open-positions.js') < html.indexOf('trade-reports.js'), character);
    assert.ok(html.indexOf('strategy-education.types.js') < html.indexOf('strategy-education-store.js'), character);
    assert.ok(html.indexOf('strategy-education-store.js') < html.indexOf('strategy-education-i18n.js'), character);
    assert.ok(html.indexOf('strategy-education-i18n.js') < html.indexOf('strategy-education-ai.js'), character);
    assert.ok(html.indexOf('strategy-education-ai.js') < html.indexOf('strategy-education.js'), character);
  }
});

test('session integration uses sorted-row identity and keeps Log Trade available', async () => {
  const text = await source('trade-ui.js');
  const start = text.indexOf('function enhanceSessionPositionsV2');
  const end = text.indexOf('function settingsCard', start);
  const feature = text.slice(start, end);
  assert.match(feature, /row\.dataset\.scenarioId/);
  assert.match(feature, /launch\.disabled=session\.status==='closed'/);
  assert.doesNotMatch(feature, /launch\.disabled=locked/);
  assert.match(feature, /TradeJournalOpenPositionsModule\.render/);
  assert.match(feature, /openEmotion\(trade\.id,'mid_trade'\)/);
});

test('modal contract supports X, backdrop, Escape, and deterministic teardown', async () => {
  const text = await source('trade-ui.js');
  const modal = text.slice(text.indexOf('function modal('), text.indexOf('function toast('));
  assert.match(modal, /data.*tjClose|dataset\.tjClose/);
  assert.match(modal, /event\.key==='Escape'/);
  assert.match(modal, /event\.target===back/);
  assert.match(modal, /back\.remove=destroy/);
  assert.match(text, /\.pr-modal-close,.sw-modal-close,.swe-close/);
});

test('emotion editor drops the focus/commitment sliders and the would-take question, and captures per-emotion intensity and tags instead', async () => {
  const text = await source('trade-ui.js');
  const start = text.indexOf('function emotionEditor');
  const end = text.indexOf('function openEmotion');
  const editor = text.slice(start, end);
  assert.doesNotMatch(editor, /i18n\.t\('focusQuality'\)/, 'no visible focus-quality slider is rendered');
  assert.doesNotMatch(editor, /i18n\.t\('planCommitment'\)/, 'no visible plan-commitment slider is rendered');
  assert.doesNotMatch(editor, /i18n\.t\('wouldTake'\)/, 'the would-take-it-again question is no longer asked');
  assert.doesNotMatch(editor, /wouldTakeIfNotForced=JSON\.parse/, 'no yes/no control writes wouldTakeIfNotForced anymore');
  assert.match(editor, /state\.emotionDetails/);
  assert.match(editor, /tagPresets\[name\]/);
  assert.match(editor, /severityLabel\(entry\.intensity\)/);
});

test('emotion tags are multi-select and typed text becomes a removable tag chip, not a single overwritten string', async () => {
  const text = await source('trade-ui.js');
  const start = text.indexOf('function emotionEditor');
  const end = text.indexOf('function openEmotion');
  const editor = text.slice(start, end);
  assert.match(editor, /entry\.tags\.push\(text\)/, 'clicking a preset tag adds it to the list rather than replacing a single value');
  assert.match(editor, /entry\.tags\.push\(value\)/, 'typed custom text is pushed onto the tags list');
  assert.match(editor, /event\.key==='Enter'/, 'pressing Enter converts the typed text into a tag');
  assert.match(editor, /entry\.tags\.splice\(i,1\)/, 'each chosen tag can be individually removed');
});

test('trade module keys exist in every supported language', async () => {
  const sandbox = { window: {}, document: { documentElement: { lang: 'en' } }, Intl };
  vm.runInNewContext(await source('trade-i18n.js'), sandbox, { filename: 'trade-i18n.js' });
  const messages = sandbox.window.TradeJournalTradeI18n.messages;
  for (const lang of ['fa', 'ar', 'en', 'es']) {
    for (const key of ['tradeCalculator', 'potentialProfit', 'registerTrade', 'openTrades', 'markOpen', 'logEmotionAction', 'closePosition', 'viewDetails']) assert.ok(messages[lang][key], lang + ':' + key);
  }
});

test('session library is data-driven, clears legacy session data once, and never restores template cards', async () => {
  const library = await source('session-library.js');
  const css = await source('session-library.css');
  assert.match(library, /tradejournal:session-library-empty-reset:v1/);
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) assert.match(library, new RegExp("'" + character + "'"));
  assert.match(library, /localStorage\.removeItem\(storageKey\(character\)\)/);
  assert.match(library, /localStorage\.removeItem\('tradejournal:session-signatures:v1'\)/);
  assert.doesNotMatch(library, /classList\.remove\('sl-hidden-template'\)/);
  assert.match(css, /\.content > \.featured-card[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /\.sl-empty-state/);
});

test('session library toolbar exposes live filter, search, sort, grid, and list controls', async () => {
  const library = await source('session-library.js');
  for (const filter of ["['all', 'all']", "['open', 'activeOnly']", "['closed', 'closedOnly']", "['charts', 'withCharts']"]) assert.ok(library.includes(filter), filter);
  for (const sort of ["['newest', 'newest']", "['oldest', 'oldest']", "['market', 'market']", "['entries', 'mostEntries']"]) assert.ok(library.includes(sort), sort);
  assert.match(library, /addEventListener\('input'[\s\S]*state\.query/);
  assert.match(library, /state\.view = button\.dataset\.sessionView/);
  assert.match(library, /select\.replaceChildren\(\)/);
});

test('workspace and legacy session renderer suspend the library and restore it only on back', async () => {
  const workspace = await source('session-workspace-logic.js');
  const legacy = await source('session-system.js');
  assert.match(workspace, /TradeJournalSessionLibrary\.suspend\(\)/);
  assert.match(workspace, /function returnToLibrary\(\)[\s\S]*TradeJournalSessionLibrary\.resume\(\)/);
  assert.match(legacy, /TradeJournalSessionLibrary\.suspend\(\)/);
  assert.match(legacy, /back\.onclick=function\(\)\{if\(window\.TradeJournalSessionLibrary\)window\.TradeJournalSessionLibrary\.resume\(\)/);
});

test('all four character pages load one shared NAVRYA sessions app after the entry flow', async () => {
  // session-library.js/.css are retired - navrya-{character}-sessions-app.js (mounted into
  // #navryaSessionsRoot) is the one shared session list now, same load-after-entry-flow order.
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    // Matched as a real <script src> tag, not the doc-comment prose above it that also
    // mentions this bundle's filename by name.
    const tag = '<script src="../shared/navrya-' + character + '-sessions-app.js">';
    assert.equal((html.match(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1, character + ':js');
    assert.ok(html.indexOf('session-entry-flow.js') < html.indexOf(tag), character + ':order');
  }
});

test('A3: the old non-functional demo chat FAB/panel markup and handlers are gone from every character page', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const app = await readFile(path.join(root, 'public', 'pages', character, 'app.js'), 'utf8');
    const css = await readFile(path.join(root, 'public', 'pages', character, 'styles.css'), 'utf8');
    assert.doesNotMatch(html, /id="openChat"/, character + ':html openChat');
    assert.doesNotMatch(html, /id="chatPanel"/, character + ':html chatPanel');
    assert.doesNotMatch(app, /document\.querySelector\('#chatPanel'\)/, character + ':app.js chatPanel handler');
    assert.doesNotMatch(app, /document\.querySelector\('#openChat'\)/, character + ':app.js openChat handler');
    assert.doesNotMatch(css, /\.ai-chat-fab/, character + ':styles.css ai-chat-fab rule');
    assert.doesNotMatch(css, /\.ai-chat-panel/, character + ':styles.css ai-chat-panel rule');
  }
});

test('A3/A4: every character page loads the AI process registry before the flows that register against it, and the chat dock core last', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const registry = html.indexOf('ai-process-registry.js');
    assert.ok(registry > -1, character + ':registry present');
    assert.ok(registry < html.indexOf('trade-ui.js'), character + ':registry before trade-ui');
    assert.ok(registry < html.indexOf('mental-health-store.js'), character + ':registry before mental-health-store');
    assert.ok(html.indexOf('mental-health-ai.js') < html.indexOf('ai-settings-store.js'), character + ':settings-store after mental-health-ai');
    assert.ok(html.indexOf('ai-settings-store.js') < html.indexOf('ai-usage-store.js'), character + ':usage-store after settings-store');
    assert.ok(html.indexOf('strategy-education.js') < html.indexOf('chat-dock-core.js'), character + ':chat-dock-core after strategy-education');
    assert.ok(html.indexOf('ai-settings-ui.js') < html.indexOf('chat-dock-core.js'), character + ':chat-dock-core after settings-ui');
    assert.ok(html.indexOf('chat-dock-core.js') < html.lastIndexOf('navrya-' + character + '-sessions-app.js'), character + ':chat-dock-core before the NAVRYA bundle that mounts the ChatDock React tree into it');
    assert.match(html, /ai-settings\.css/, character + ':ai-settings.css linked');
    assert.match(html, /id="navryaChatDockRoot"/, character + ':navryaChatDockRoot mount point present');
    assert.doesNotMatch(html, /global-ai-dock/, character + ':the retired global-ai-dock UI must be fully gone');
  }
});

test('A7: openEmotion accepts a backward-compatible third seed argument that defaults to nothing for existing 2-arg callers', async () => {
  const text = await source('trade-ui.js');
  assert.match(text, /function openEmotion\(tradeId,stage,seed\)/, 'seed is an additive third parameter, not a breaking signature change');
  assert.match(text, /emotionEditor\(Object\.assign\(\{stage:stage\|\|'mid_trade'\},seed\|\|\{\}\)\)/, 'a missing seed must not throw - it defaults to an empty object merge');
  assert.match(text, /openEmotion\(trade\.id,'mid_trade'\)/, 'the existing 2-arg call site keeps working unchanged');
});

test('Community: the sidebar nav item routes to #community and has a translated label in every supported language', async () => {
  // The sidebar is a React root now (navrya-src/store.js's setActiveId + navrya-src/i18n.js's
  // navCommunity label), not static per-character HTML with a data-i18n attribute.
  const storeSource = await readFile(path.join(root, 'navrya-src', 'store.js'), 'utf8');
  assert.match(storeSource, /community:\s*'#community'/, 'store.js must route the community nav item to #community');
  const i18nSource = await readFile(path.join(root, 'navrya-src', 'i18n.js'), 'utf8');
  const matches = i18nSource.match(/navCommunity:\s*'[^']+'/g) || [];
  assert.equal(matches.length, 4, 'navCommunity must be translated in all four supported languages (en/fa/ar/es)');
});

test('Community: every new shared module is script/CSS-linked exactly once on all four character pages, in a dependency-safe order', async () => {
  const scripts = ['dev-user-switcher.js', 'community.types.js', 'community-i18n.js', 'community-store.js', 'marketplace-ui.js', 'messages-ui.js', 'community-ui.js'];
  const styles = ['dev-user-switcher.css', 'community.css', 'marketplace.css', 'messages.css'];
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    scripts.forEach((file) => assert.equal((html.match(new RegExp(file.replace('.', '\\.'), 'g')) || []).length, 1, character + ':' + file + ' linked exactly once'));
    styles.forEach((file) => assert.match(html, new RegExp(file.replace('.', '\\.')), character + ':' + file + ' css linked'));
    // marketplace-ui.js must load before pattern-registry.js/strategy-education.js, the only
    // two files that read window.TradeJournalMarketplace (both load much later in the
    // existing sequence, so this just confirms the ordering wasn't accidentally reversed).
    assert.ok(html.indexOf('marketplace-ui.js') < html.indexOf('pattern-registry.js'), character + ': marketplace-ui before pattern-registry');
    assert.ok(html.indexOf('marketplace-ui.js') < html.indexOf('strategy-education.js'), character + ': marketplace-ui before strategy-education');
    assert.ok(html.indexOf('community-store.js') < html.indexOf('community-ui.js'), character + ': store before the tab shell that uses it');
  }
});

test('the sidebar "AI" link routes to #ai-settings on every character page - it is a real settings route, not a chat-opening trigger', async () => {
  // The sidebar is a React root now (navrya-src/store.js's setActiveId) - #assistantNav's old
  // static href is gone along with the rest of the static sidebar markup, but the routing
  // behavior it used to provide is preserved here instead.
  const storeSource = await readFile(path.join(root, 'navrya-src', 'store.js'), 'utf8');
  assert.match(storeSource, /'ai-assistant':\s*'#ai-settings'/, "store.js must route the ai-assistant nav item to #ai-settings");
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /href="#assistant"/, character + ': the old placeholder #assistant href must be gone');
  }
});

test('the character chooser loads dev-user-switcher.js before its own app.js, so the login step can call the shared register()/login()/loginWithGoogle()', async () => {
  const html = await readFile(path.join(root, 'public', 'pages', 'select', 'index.html'), 'utf8');
  assert.ok(html.indexOf('../shared/dev-user-switcher.js') > -1, 'dev-user-switcher.js is loaded');
  assert.ok(html.indexOf('../shared/dev-user-switcher.js') < html.indexOf('<script src="app.js">'), 'it loads before app.js, which calls into it at click time');
  assert.match(html, /id="stepAccount"/);
  assert.match(html, /id="stepCharacter"/);
  assert.match(html, /id="emailInput"/);
  assert.match(html, /id="passwordInput"/);
  assert.match(html, /id="continueBtn"/);
});

test('Admin: src/release.js has a real "admin" shell route, since the admin page is a standalone top-level page like select/, not nested in a character iframe', async () => {
  const releaseJs = await readFile(path.join(root, 'src', 'release.js'), 'utf8');
  assert.match(releaseJs, /admin:\s*\{\s*title:[^,]+,\s*source:\s*pagePrefix \+ 'admin\/index\.html'/, 'the pages map must have an admin entry pointing at admin/index.html');
  assert.match(releaseJs, /window\.location\.hash === '#\/admin'/, 'pageFromHash() must recognize the literal #/admin route');
});

test('Admin: every character page loads admin-heartbeat.js immediately after dev-user-switcher.js, exactly once', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    assert.equal((html.match(/admin-heartbeat\.js/g) || []).length, 1, character + ': admin-heartbeat.js must be linked exactly once');
    const switcherIndex = html.indexOf('../shared/dev-user-switcher.js');
    const heartbeatIndex = html.indexOf('../shared/admin-heartbeat.js');
    assert.ok(switcherIndex > -1 && heartbeatIndex > switcherIndex, character + ': admin-heartbeat.js must load after dev-user-switcher.js, which it depends on for currentUserId()');
  }
});

test('Admin: the Settings-page admin link uses target="_top" to break out of the character iframe, since #/admin is an outer-shell route', async () => {
  const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'dev-user-switcher.js'), 'utf8');
  assert.match(source, /adminLink\.href = '#\/admin'/);
  assert.match(source, /adminLink\.target = '_top'/, 'a bare same-document href would only change the iframe\'s own internal hash, never navigate the outer shell');
});
