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
  const sandbox = { window: {}, localStorage, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }, setTimeout: fn => fn(), Date, Set };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {} });
  vm.runInNewContext(await source('session-signature-store.js'), sandbox, { filename: 'session-signature-store.js' });
  const store = sandbox.window.TradeJournalSessionSignatureStore;
  assert.equal(store.listSync().length, 1);
  assert.equal(store.listSync()[0].sessionId, 'closed-1');
  assert.equal(store.backfill(), 0);
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
    const library = html.indexOf('session-library.js');
    assert.ok(types > -1 && types < store && store < engine && engine < ui && ui < workspace, character + ' signature script order');
    assert.ok(library > workspace, character + ' library script order');
  }
});

test('trade store preserves hunting to open to emotion to closed lifecycle', async () => {
  const localStorage = memoryStorage();
  const events = [];
  const sandbox = {
    window: {}, localStorage,
    document: { body: { dataset: {} } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    FileReader: class {}
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent: event => events.push(event), TradeJournalTradeTypes: { timeframes: ['1m', '5m'] }, TradeJournalPanelLayer: { character: 'engineer' } });
  vm.runInNewContext(await source('trade-store.js'), sandbox, { filename: 'trade-store.js' });
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

async function strategyStore(localStorage) {
  const events = [];
  const sandbox = {
    window: {}, localStorage,
    document: { documentElement: { lang: 'en' } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    FileReader: class {}, fetch: async () => { throw new Error('not used'); }, URL
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent: event => events.push(event), TradeJournalStrategyEducationTypes: { numericPaths: ['riskManagement.maxRiskPerTradePercent','riskManagement.dailyDrawdownLimitPercent','riskManagement.totalDrawdownLimitPercent','riskManagement.maxConcurrentTrades','riskManagement.maxProfitCapPerTrade'] } });
  vm.runInNewContext(await source('strategy-education-store.js'), sandbox, { filename: 'strategy-education-store.js' });
  return { store: sandbox.window.TradeJournalStrategyEducationStore, events };
}

test('strategy migration preserves the legacy singleton as an active generated strategy', async () => {
  const localStorage = memoryStorage();
  const legacy = { id: 'strategy-education-singleton', positionManagement: { entryRules: 'Wait for confirmation' }, riskManagement: { maxRiskPerTradePercent: 0.75 }, overallFramework: { description: 'Session framework' }, chatHistory: [{ id: 'old-chat', role: 'user', content: 'keep me' }] };
  localStorage.setItem('tradejournal:strategy-education:v1', JSON.stringify(legacy));
  const { store } = await strategyStore(localStorage);
  const values = store.listSync();
  assert.equal(values.length, 1);
  assert.notEqual(values[0].id, 'strategy-education-singleton');
  assert.equal(values[0].active, true);
  assert.equal(values[0].positionManagement.entryRules, 'Wait for confirmation');
  assert.equal(values[0].riskManagement.maxRiskPerTradePercent, 0.75);
  assert.equal(values[0].chatHistory[0].id, 'old-chat');
  assert.ok(localStorage.getItem('tradejournal:strategy-education:v1'));
  assert.ok(localStorage.getItem('tradejournal:strategies:v2'));
});

test('deleting a strategy orphans linked trades without deleting them', async () => {
  const localStorage = memoryStorage();
  const { store } = await strategyStore(localStorage);
  const strategy = store.create({ name: 'London playbook' });
  localStorage.setItem('tradejournal:trades:v1', JSON.stringify([{ id: 'trade-1', linkedStrategyId: strategy.id, status: 'open' }, { id: 'trade-2', linkedStrategyId: null, status: 'closed' }]));
  await store.remove(strategy.id);
  const trades = JSON.parse(localStorage.getItem('tradejournal:trades:v1'));
  assert.equal(trades.length, 2);
  assert.equal(trades[0].linkedStrategyId, null);
  assert.equal(store.find(strategy.id), null);
});

test('two active strategies keep risk, chat, and detection data isolated', async () => {
  const localStorage = memoryStorage();
  const { store } = await strategyStore(localStorage);
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

test('all four character pages load one shared session library after the entry flow', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    assert.equal((html.match(/session-library\.css/g) || []).length, 1, character + ':css');
    assert.equal((html.match(/session-library\.js/g) || []).length, 1, character + ':js');
    assert.ok(html.indexOf('session-entry-flow.js') < html.indexOf('session-library.js'), character + ':order');
  }
});
