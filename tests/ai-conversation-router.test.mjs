import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildFixtureBundleRows, buildSurfaceHelpFixtureRow } from './helpers/conversation-scenario-fixtures.mjs';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Journey H2, Gate 2: ai-conversation-router.js is now a thin bundle-fetch/cache + resolver
// wrapper around the real matching engine (ai-conversation-matcher.js, tested independently in
// ai-conversation-matcher.test.mjs). These tests exercise the wrapper itself: cache-first
// synchronous reads from localStorage (the router's IIFE reads it at load time, matching a real
// browser's warm-reload behavior), the data-query resolvers, the "no response for this language"
// fallback rule (§19), and the two admission modes (generic vs. surface_help).
async function routerSandbox(overrides = {}) {
  const store = {};
  if (overrides.seedBundle) store['tradejournal:conversation-scenarios-bundle:v1'] = JSON.stringify({ scenarios: overrides.seedBundle, version: overrides.bundleVersion || 'v-test' });
  const localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; }
  };
  const document = { documentElement: { lang: overrides.lang || 'en' } };
  const fetchImpl = overrides.fetch || (async () => { throw new Error('fetch unavailable in this test'); });
  const sandbox = { window: {}, document, localStorage, fetch: fetchImpl, performance: { now: () => Date.now() }, setTimeout, JSON, Date, Math };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage, fetch: fetchImpl,
    TradeJournalTradeStore: overrides.tradeStore, TradeJournalAISurfaceContext: overrides.surfaceContext
  });
  vm.runInNewContext(await source('ai-i18n.js'), sandbox, { filename: 'ai-i18n.js' });
  vm.runInNewContext(await source('ai-conversation-matcher.js'), sandbox, { filename: 'ai-conversation-matcher.js' });
  vm.runInNewContext(await source('ai-conversation-router.js'), sandbox, { filename: 'ai-conversation-router.js' });
  return sandbox.window;
}

// ---- cache-first synchronous resolution ----

test('a HIGH-confidence FAQ resolves synchronously from a warm localStorage cache, no fetch needed', async () => {
  const window = await routerSandbox({ seedBundle: buildFixtureBundleRows(), fetch: async () => { throw new Error('must not be called - a fresh-enough cache exists'); } });
  const result = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(result.kind, 'faq');
  assert.equal(result.scenarioId, 'session.purpose');
  assert.ok(result.written.length > 0);
  assert.equal(result.voiceReply, result.written);
  assert.equal(result.ctaActionId, 'session.create');
});

test('no cached bundle and no fetch response yet: the scenario list is simply empty, never throws', async () => {
  const window = await routerSandbox({});
  const result = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(result, null);
});

test('an ambiguous or unmatched message returns null even with a full bundle cached', async () => {
  const window = await routerSandbox({ seedBundle: buildFixtureBundleRows() });
  assert.equal(window.TradeJournalAIConversationRouter.route('the quick brown fox jumps over the lazy dog'), null);
});

// ---- data queries: fresh, correct, never fabricated ----

test('trade.open_count_query renders the real, fresh count through renderTemplate', async () => {
  let trades = [{ status: 'open' }, { status: 'open' }, { status: 'closed' }];
  const store = { listSync: () => trades, settings: () => ({ defaultRiskPercent: 1 }) };
  const window = await routerSandbox({ seedBundle: buildFixtureBundleRows(), tradeStore: store });
  const first = window.TradeJournalAIConversationRouter.route('how many open trades do i have');
  assert.equal(first.kind, 'data_query');
  assert.equal(first.written, 'You currently have 2 open trades.');
  trades = [{ status: 'open' }];
  const second = window.TradeJournalAIConversationRouter.route('how many open trades do i have');
  assert.equal(second.written, 'You currently have 1 open trades.', 'must re-read the store, not cache the first answer');
});

test('trade.default_risk_query renders the real configured value', async () => {
  const store = { listSync: () => [], settings: () => ({ defaultRiskPercent: 2.5 }) };
  const window = await routerSandbox({ seedBundle: buildFixtureBundleRows(), tradeStore: store });
  const result = window.TradeJournalAIConversationRouter.route('what is my default risk');
  assert.equal(result.written, 'Your default risk is currently set to 2.5%.');
});

test('a data query never fabricates an answer when the store is unavailable, even at HIGH text-confidence', async () => {
  const window = await routerSandbox({ seedBundle: buildFixtureBundleRows(), tradeStore: undefined });
  assert.equal(window.TradeJournalAIConversationRouter.route('how many open trades do i have'), null);
});

// ---- §19: no response for the current language -> fall through, never another language ----

test('a scenario matched HIGH but missing a response for the current UI language falls through (never serves another language)', async () => {
  const rows = buildFixtureBundleRows();
  const sessionRow = rows.find((r) => r.scenarioKey === 'session.purpose');
  delete sessionRow.definition.responses.en; // triggers still match in English text; the EN response is simply absent
  const window = await routerSandbox({ seedBundle: rows, lang: 'en' });
  assert.equal(window.TradeJournalAIConversationRouter.route('what is a session'), null);
});

// ---- generic vs. surface_help admission (chat-dock-core.js decides the mode; the router only
// ever sees the mode it's told) ----

test('generic mode never resolves a surface_help-kind scenario', async () => {
  const rows = buildFixtureBundleRows().concat([buildSurfaceHelpFixtureRow()]);
  const window = await routerSandbox({ seedBundle: rows });
  const result = window.TradeJournalAIConversationRouter.route('what is risk management');
  assert.equal(result, null, 'surface_help scenarios must never resolve in generic mode, regardless of confidence');
});

test('surface_help mode resolves only when the active process matches an allowed prefix', async () => {
  const rows = buildFixtureBundleRows().concat([buildSurfaceHelpFixtureRow()]);
  const window = await routerSandbox({ seedBundle: rows });
  const router = window.TradeJournalAIConversationRouter;
  const matching = router.route('what is risk management', { mode: 'surface_help', activeProcessId: 'strategy-editor-abc123' });
  assert.equal(matching.kind, 'surface_help');
  assert.equal(matching.scenarioId, 'strategy.risk_management.field_help');

  const nonMatching = router.route('what is risk management', { mode: 'surface_help', activeProcessId: 'pattern-editor-xyz' });
  assert.equal(nonMatching, null, 'a process id outside allowedProcesses must never match');
});

test('surface_help mode never resolves a plain faq/data_query scenario, even at HIGH confidence', async () => {
  const rows = buildFixtureBundleRows().concat([buildSurfaceHelpFixtureRow()]);
  const window = await routerSandbox({ seedBundle: rows });
  const result = window.TradeJournalAIConversationRouter.route('what is a session', { mode: 'surface_help', activeProcessId: 'strategy-editor-abc123' });
  assert.equal(result, null);
});

// ---- debugLastMatch ----

test('debugLastMatch reports Gate 2 diagnostics (scenarioSource/bundleVersion) alongside the Gate 1 fields', async () => {
  const window = await routerSandbox({ seedBundle: buildFixtureBundleRows(), bundleVersion: 'v-42' });
  window.TradeJournalAIConversationRouter.route('what is a session');
  const debug = window.TradeJournalAIConversationRouter.debugLastMatch();
  assert.equal(debug.confidenceBand, 'HIGH');
  assert.equal(debug.winnerScenarioId, 'session.purpose');
  assert.equal(debug.resolution, 'faq');
  assert.equal(debug.scenarioSource, 'published_bundle');
  assert.equal(debug.bundleVersion, 'v-42');
  assert.equal(debug.mode, 'generic');
  assert.ok(typeof debug.evaluationMs === 'number');
});

// ---- background refresh: a stale/empty cache is topped up by a real fetch, in the background,
// without route() itself ever awaiting the network ----

test('an empty cache is filled in by a background fetch, and the next call sees the new bundle', async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls++;
    return { ok: true, json: async () => ({ version: 'v-fresh', scenarios: buildFixtureBundleRows() }) };
  };
  const window = await routerSandbox({ fetch: fetchImpl });
  const first = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(first, null, 'the very first call has nothing cached yet - must not block on the network');
  await sleep(20);
  const second = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(second.kind, 'faq');
  assert.equal(fetchCalls, 1);
});

test('a failed background refresh never throws and leaves a still-valid cache untouched', async () => {
  const window = await routerSandbox({ seedBundle: buildFixtureBundleRows(), fetch: async () => { throw new Error('network down'); } });
  // fetchedAt starts at 0 (a cache loaded from storage always forces a refresh attempt) - the
  // real assertion is that despite that failing fetch, the still-valid cached bundle keeps
  // resolving correctly, and nothing throws out of route() itself.
  const result = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(result.scenarioId, 'session.purpose');
  await sleep(10);
  const again = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(again.scenarioId, 'session.purpose');
});

// ---- Journey H2, Gate 3: pre-generated audio threading ----

function withAudio(rows, scenarioKey, lang, audio) {
  return rows.map((row) => (row.scenarioKey === scenarioKey ? Object.assign({}, row, { audio: { [lang]: { standard: audio } } }) : row));
}

test('a faq scenario with approved audio for the current language surfaces audioUrl/audioMimeType', async () => {
  const rows = withAudio(buildFixtureBundleRows(), 'session.purpose', 'en', { url: '/uploads/conversation-audio/x.mp3', mimeType: 'audio/mpeg', durationMs: 4200 });
  const window = await routerSandbox({ seedBundle: rows });
  const result = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(result.audioUrl, '/uploads/conversation-audio/x.mp3');
  assert.equal(result.audioMimeType, 'audio/mpeg');
});

test('a faq scenario with audio for a DIFFERENT language never surfaces it for the current one', async () => {
  const rows = withAudio(buildFixtureBundleRows(), 'session.purpose', 'fa', { url: '/uploads/conversation-audio/fa.mp3', mimeType: 'audio/mpeg' });
  const window = await routerSandbox({ seedBundle: rows, lang: 'en' });
  const result = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(result.audioUrl, null);
});

test('a scenario with no approved audio at all resolves with audioUrl: null, never throws', async () => {
  const window = await routerSandbox({ seedBundle: buildFixtureBundleRows() });
  const result = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(result.audioUrl, null);
  assert.equal(result.audioMimeType, null);
});

test('a data_query scenario never surfaces audioUrl, even if a bundle row incorrectly carried one (defense in depth - the server never sends this, but the client never trusts it for data_query either)', async () => {
  const rows = withAudio(buildFixtureBundleRows(), 'trade.open_count_query', 'en', { url: '/uploads/conversation-audio/should-never-play.mp3', mimeType: 'audio/mpeg' });
  const store = { listSync: () => [{ status: 'open' }], settings: () => ({ defaultRiskPercent: 1 }) };
  const window = await routerSandbox({ seedBundle: rows, tradeStore: store });
  const result = window.TradeJournalAIConversationRouter.route('how many open trades do i have');
  assert.equal(result.kind, 'data_query');
  assert.equal(result.audioUrl, null, 'data_query must never play pre-generated audio, regardless of what the bundle claims');
});
