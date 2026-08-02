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

async function usageSandbox(localStorage, aiClients) {
  const sandbox = { window: {}, localStorage: localStorage || memoryStorage(), Promise };
  sandbox.window = Object.assign(sandbox.window, { localStorage: sandbox.localStorage }, aiClients || {});
  vm.runInNewContext(await source('ai-settings-store.js'), sandbox, { filename: 'ai-settings-store.js' });
  vm.runInNewContext(await source('ai-usage-store.js'), sandbox, { filename: 'ai-usage-store.js' });
  return sandbox.window;
}

test('accumulates prompt/completion/total tokens and per-provider call counts across multiple record() calls', async () => {
  const window = await usageSandbox();
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

test('day/month rollover creates fresh buckets keyed by the current date rather than mutating a stale one', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:ai-usage:v1', JSON.stringify({
    daily: { '2000-01-01': { promptTokens: 100, completionTokens: 100, totalTokens: 200, byProvider: {} } },
    monthly: { '2000-01': { promptTokens: 100, completionTokens: 100, totalTokens: 200, byProvider: {} } }
  }));
  const window = await usageSandbox(localStorage);
  window.TradeJournalAIUsage.record({ provider: 'anthropic', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } });
  const raw = JSON.parse(localStorage.getItem('tradejournal:ai-usage:v1'));
  assert.deepEqual(raw.daily['2000-01-01'], { promptTokens: 100, completionTokens: 100, totalTokens: 200, byProvider: {} }, 'a stale day bucket must be left untouched, not merged into');
  assert.deepEqual(raw.monthly['2000-01'], { promptTokens: 100, completionTokens: 100, totalTokens: 200, byProvider: {} });
  assert.equal(window.TradeJournalAIUsage.today().totalTokens, 2, 'today gets its own fresh bucket');
});

test('remaining() is null with no budget set, and budget minus month-to-date once one is saved', async () => {
  const window = await usageSandbox();
  assert.equal(window.TradeJournalAIUsage.remaining(), null);
  window.TradeJournalAISettingsStore.saveSettings({ monthlyTokenBudget: 1000 });
  window.TradeJournalAIUsage.record({ provider: 'openai', usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 } });
  assert.equal(window.TradeJournalAIUsage.remaining(), 800);
});

test('local-fallback responses (no usage field, or a usage-less object) are never recorded', async () => {
  const window = await usageSandbox();
  window.TradeJournalAIUsage.record({ provider: 'local-fallback' });
  window.TradeJournalAIUsage.record(null);
  window.TradeJournalAIUsage.record({ provider: 'openai', usage: null });
  assert.equal(window.TradeJournalAIUsage.today().totalTokens, 0);
  assert.equal(Object.keys(window.TradeJournalAIUsage.today().byProvider).length, 0, 'byProvider is built inside the sandbox realm - compare its keys, not the object itself, to avoid a cross-realm deepEqual mismatch');
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
  const window = await usageSandbox(null, aiClients);

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
