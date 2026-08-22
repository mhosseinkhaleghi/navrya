import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Phase 8c of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section): ai-usage-store.js's read side (today()/thisMonth()/lifetime()/
// remaining()) is reconciled onto the real ai_usage_events table instead of its own
// localStorage-persisted running totals - GET /api/users/me/usage hydrates a real baseline (via
// server-replica.js's registerDocumentDomain, never .set()), and record() layers this tab's own
// not-yet-reconciled increments on top in memory only. The write side (record()'s own
// reportToServer() POST to /api/users/usage-report) is completely unchanged.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), key: index => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}
function flush() { return new Promise((resolve) => setImmediate(resolve)); }

function emptyBucket() { return { promptTokens: 0, completionTokens: 0, totalTokens: 0, byProvider: {} }; }
function todayKey() { return new Date().toISOString().slice(0, 10); }
function monthKey() { return new Date().toISOString().slice(0, 7); }

async function usageSandbox({ localStorage, aiClients, usageSummary, fetchImpl } = {}) {
  localStorage = localStorage || memoryStorage();
  if (!localStorage.getItem('tradejournal:auth-token')) localStorage.setItem('tradejournal:auth-token', 'test-user');
  const postedReports = [];
  const defaultUsageSummary = { todayKey: todayKey(), today: emptyBucket(), monthKey: monthKey(), thisMonth: emptyBucket(), lifetime: emptyBucket() };
  const fetchCalls = [];
  const fetchFn = fetchImpl || (async (url, options) => {
    if (url === '/api/users/me/usage') return { ok: true, json: async () => usageSummary || defaultUsageSummary };
    if (url === '/api/sync/preferences' && (!options || !options.method || options.method === 'GET')) return { ok: true, json: async () => ({ preferences: [] }) };
    if (url === '/api/sync/preferences' && options.method === 'POST') return { ok: true, json: async () => JSON.parse(options.body) };
    if (url === '/api/users/usage-report') { postedReports.push(JSON.parse(options.body)); return { ok: true, status: 201, json: async () => ({ ok: true }) }; }
    throw new Error('unexpected fetch in ai-usage-store test: ' + url);
  });
  const sandbox = {
    window: {}, localStorage, Promise,
    fetch: (url, options) => { fetchCalls.push([url, options]); return fetchFn(url, options); },
    document: { documentElement: { lang: 'en' } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent() {}, addEventListener() {}, fetch: sandbox.fetch, document: sandbox.document,
    TradeJournalDevUserSwitcher: { currentUserId: () => localStorage.getItem('tradejournal:auth-token') }
  }, aiClients || {});
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('user-preferences.js'), sandbox, { filename: 'user-preferences.js' });
  vm.runInNewContext(await source('ai-settings-store.js'), sandbox, { filename: 'ai-settings-store.js' });
  vm.runInNewContext(await source('ai-usage-store.js'), sandbox, { filename: 'ai-usage-store.js' });
  await flush(); // let hydrate() settle before the caller reads/writes
  return { window: sandbox.window, postedReports, fetchCalls };
}

test('registers an ai-usage document domain with server-replica.js and hydrates it at load time via GET /api/users/me/usage', async () => {
  const { window, fetchCalls } = await usageSandbox();
  assert.ok(window.TradeJournalServerReplica.domain('ai-usage'));
  assert.ok(fetchCalls.some((call) => call[0] === '/api/users/me/usage'));
  assert.equal(window.TradeJournalAIUsage.isHydrated(), true);
});

test('a brand-new account starts at real zero, hydrated from the server, not a fabricated number', async () => {
  const { window } = await usageSandbox();
  const today = window.TradeJournalAIUsage.today();
  assert.equal(today.totalTokens, 0);
  assert.equal(Object.keys(today.byProvider).length, 0);
});

test('hydrate() populates today()/thisMonth()/lifetime() from the real server aggregate', async () => {
  const summary = {
    todayKey: todayKey(), today: { promptTokens: 10, completionTokens: 5, totalTokens: 15, byProvider: { openai: { promptTokens: 10, completionTokens: 5, totalTokens: 15, calls: 1 } } },
    monthKey: monthKey(), thisMonth: { promptTokens: 50, completionTokens: 25, totalTokens: 75, byProvider: { openai: { promptTokens: 50, completionTokens: 25, totalTokens: 75, calls: 5 } } },
    lifetime: { promptTokens: 500, completionTokens: 250, totalTokens: 750, byProvider: { openai: { promptTokens: 500, completionTokens: 250, totalTokens: 750, calls: 50 } } }
  };
  const { window } = await usageSandbox({ usageSummary: summary });
  assert.equal(window.TradeJournalAIUsage.today().totalTokens, 15);
  assert.equal(window.TradeJournalAIUsage.thisMonth().totalTokens, 75);
  assert.equal(window.TradeJournalAIUsage.lifetime().totalTokens, 750);
});

test('record() applies its increment optimistically and synchronously on top of the hydrated baseline, and accumulates across multiple calls', async () => {
  const { window } = await usageSandbox();
  window.TradeJournalAIUsage.record({ provider: 'openai', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });
  window.TradeJournalAIUsage.record({ provider: 'openai', usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 } });
  const today = window.TradeJournalAIUsage.today();
  assert.equal(today.promptTokens, 14);
  assert.equal(today.completionTokens, 7);
  assert.equal(today.totalTokens, 21);
  assert.equal(today.byProvider.openai.calls, 2);
  assert.equal(today.byProvider.openai.totalTokens, 21);
  const month = window.TradeJournalAIUsage.thisMonth();
  assert.equal(month.totalTokens, 21, 'the same calls also accumulate into the monthly bucket');
});

test('record() also POSTs the real usage-report event to the server, unchanged from before this migration', async () => {
  const { window, postedReports } = await usageSandbox();
  window.TradeJournalAIUsage.record({ provider: 'openai', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, source: 'chatDock.chat' });
  assert.equal(postedReports.length, 1);
  assert.equal(postedReports[0].provider, 'openai');
  assert.equal(postedReports[0].totalTokens, 15);
  assert.equal(postedReports[0].source, 'chatDock.chat');
});

test('a hydrated baseline for a day/month that has since rolled over is treated as real zero, never silently misattributed to the new period - a fresh record() still counts correctly', async () => {
  const summary = {
    todayKey: '2000-01-01', today: { promptTokens: 100, completionTokens: 100, totalTokens: 200, byProvider: {} },
    monthKey: '2000-01', thisMonth: { promptTokens: 100, completionTokens: 100, totalTokens: 200, byProvider: {} },
    lifetime: { promptTokens: 100, completionTokens: 100, totalTokens: 200, byProvider: {} }
  };
  const { window } = await usageSandbox({ usageSummary: summary });
  assert.equal(window.TradeJournalAIUsage.today().totalTokens, 0, "yesterday's baseline must never be reported as today's total");
  assert.equal(window.TradeJournalAIUsage.thisMonth().totalTokens, 0, "last month's baseline must never be reported as this month's total");
  assert.equal(window.TradeJournalAIUsage.lifetime().totalTokens, 200, 'lifetime has no key to go stale - it always includes the real baseline');

  window.TradeJournalAIUsage.record({ provider: 'anthropic', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } });
  assert.equal(window.TradeJournalAIUsage.today().totalTokens, 2, "today's own fresh record still counts, on top of the correctly-zeroed stale baseline");
});

test("remaining(provider) is null with no budget set for that provider, and budget minus that provider's month-to-date once one is saved - other providers are unaffected", async () => {
  const { window } = await usageSandbox();
  assert.equal(window.TradeJournalAIUsage.remaining('openai'), null);
  window.TradeJournalAISettingsStore.saveSettings({ budgetByProvider: { openai: 1000 } });
  window.TradeJournalAIUsage.record({ provider: 'openai', usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 } });
  window.TradeJournalAIUsage.record({ provider: 'anthropic', usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 } });
  assert.equal(window.TradeJournalAIUsage.remaining('openai'), 800);
  assert.equal(window.TradeJournalAIUsage.remaining('anthropic'), null, 'anthropic never had a budget set');
});

test('lifetime() accumulates across record() calls the same way today()/thisMonth() do', async () => {
  const { window } = await usageSandbox();
  window.TradeJournalAIUsage.record({ provider: 'openai', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });
  window.TradeJournalAIUsage.record({ provider: 'openai', usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 } });
  const lifetime = window.TradeJournalAIUsage.lifetime();
  assert.equal(lifetime.totalTokens, 21);
  assert.equal(lifetime.byProvider.openai.totalTokens, 21);
});

test('local-fallback responses (no usage field, or a usage-less object) are never recorded, and never reported to the server', async () => {
  const { window, postedReports } = await usageSandbox();
  window.TradeJournalAIUsage.record({ provider: 'local-fallback' });
  window.TradeJournalAIUsage.record(null);
  window.TradeJournalAIUsage.record({ provider: 'openai', usage: null });
  assert.equal(window.TradeJournalAIUsage.today().totalTokens, 0);
  assert.equal(Object.keys(window.TradeJournalAIUsage.today().byProvider).length, 0, 'byProvider is built inside the sandbox realm - compare its keys, not the object itself, to avoid a cross-realm deepEqual mismatch');
  assert.equal(postedReports.length, 0);
});

test('decorating the three existing AI clients observes usage without changing their resolved return values', async () => {
  const patternResult = { stages: ['a', 'b'], provider: 'openai', model: 'gpt-5.6', usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 } };
  const strategyResult = { reply: 'ok', suggestions: [], provider: 'anthropic', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
  const mhResult = { flagged: false, reply: 'noted', suggestions: [], provider: 'openai', usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 } };
  const aiClients = {
    TradeJournalPatternAI: { generateStages: async () => patternResult, chat: async () => patternResult },
    TradeJournalStrategyEducationAI: { chat: async () => strategyResult, summarize: async () => strategyResult, proposeFromEvent: async () => strategyResult },
    TradeJournalMentalHealthAI: { chat: async () => mhResult, educationCard: async () => mhResult }
  };
  const { window } = await usageSandbox({ aiClients });

  const resolvedPattern = await window.TradeJournalPatternAI.chat();
  assert.deepEqual(resolvedPattern, patternResult, 'the decorator must resolve to the byte-identical value the original function produced');
  const resolvedStrategy = await window.TradeJournalStrategyEducationAI.summarize();
  assert.deepEqual(resolvedStrategy, strategyResult);
  const resolvedMh = await window.TradeJournalMentalHealthAI.chat();
  assert.deepEqual(resolvedMh, mhResult);

  const today = window.TradeJournalAIUsage.today();
  assert.equal(today.totalTokens, 7 + 2 + 10, 'usage from all three decorated calls was observed in transit');
  assert.equal(today.byProvider.openai.calls, 2, 'one from the pattern client, one from the mental-health client');
  assert.equal(today.byProvider.anthropic.calls, 1);
});

test('no localStorage key is ever written for AI usage any more - Phase 8c removed the write-through cache entirely', async () => {
  const localStorage = memoryStorage();
  const { window } = await usageSandbox({ localStorage });
  window.TradeJournalAIUsage.record({ provider: 'openai', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } });
  assert.equal(localStorage.getItem('tradejournal:ai-usage:v1'), null, "Phase 1's guard key may still exist defensively for pre-migration browsers, but nothing writes it any more");
});

test('all four character pages load server-replica.js before ai-usage-store.js', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const replicaIndex = html.indexOf('<script src="../shared/server-replica.js">');
    const storeIndex = html.indexOf('<script src="../shared/ai-usage-store.js">');
    assert.ok(replicaIndex > -1 && storeIndex > -1, character + ': both scripts present');
    assert.ok(replicaIndex < storeIndex, character + ': server-replica.js loads before ai-usage-store.js');
  }
});
