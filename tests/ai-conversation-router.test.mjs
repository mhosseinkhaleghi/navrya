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
  // Journey H2 expressive/context follow-up: seeds the exposure-count cache exactly like a warm
  // localStorage cache from a real prior page load - {scenarioKey: {count, ...}}.
  if (overrides.seedExposures) store['tradejournal:conversation-scenario-exposures:v1'] = JSON.stringify({ byScenarioKey: overrides.seedExposures });
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
  // route() also lazily refreshes the exposure-count cache (Journey H2 follow-up) via a SEPARATE
  // endpoint - a real fetch mock has to discriminate by URL, exactly like a real browser's two
  // independent background refreshes would each hit their own endpoint exactly once.
  let bundleFetchCalls = 0;
  let exposuresFetchCalls = 0;
  const fetchImpl = async (url) => {
    if (String(url).indexOf('conversation-scenario-exposures') !== -1) {
      exposuresFetchCalls++;
      return { ok: true, json: async () => ({ exposures: {} }) };
    }
    bundleFetchCalls++;
    return { ok: true, json: async () => ({ version: 'v-fresh', scenarios: buildFixtureBundleRows() }) };
  };
  const window = await routerSandbox({ fetch: fetchImpl });
  const first = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(first, null, 'the very first call has nothing cached yet - must not block on the network');
  await sleep(20);
  const second = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(second.kind, 'faq');
  assert.equal(bundleFetchCalls, 1);
  assert.equal(exposuresFetchCalls, 1);
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

// ---- Journey H2 expressive/context follow-up: context-variant selection in route() ----

function withVariants(rows, scenarioKey, lang, variants) {
  return rows.map((row) => (row.scenarioKey === scenarioKey
    ? Object.assign({}, row, { definition: Object.assign({}, row.definition, { variants: Object.assign({}, row.definition.variants, { [lang]: variants }) }) })
    : row));
}

const SESSION_PURPOSE_VARIANTS_EN = [
  { key: 'FIRST_TIME', context: { exposure: { type: 'FIRST_TIME' } }, written: 'Welcome! A Session is the full walkthrough.', voiceReply: 'Welcome! A Session is the full walkthrough.' },
  { key: 'THIRD_TIME_PLUS', context: { exposure: { type: 'NTH_OR_LATER', threshold: 3 } }, written: 'A Session, as you know.', voiceReply: 'A Session, as you know.' }
];

test('route() with no exposure history selects FIRST_TIME - the acceptance example\'s exact first turn', async () => {
  const rows = withVariants(buildFixtureBundleRows(), 'session.purpose', 'en', SESSION_PURPOSE_VARIANTS_EN);
  const window = await routerSandbox({ seedBundle: rows });
  const result = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(result.written, 'Welcome! A Session is the full walkthrough.');
  assert.equal(result.variantKey, 'FIRST_TIME');
});

test('route() acceptance example: exposure count 1 -> STANDARD, count 2 -> THIRD_TIME_PLUS, count 3+ -> THIRD_TIME_PLUS', async () => {
  const rows = withVariants(buildFixtureBundleRows(), 'session.purpose', 'en', SESSION_PURPOSE_VARIANTS_EN);

  const second = await routerSandbox({ seedBundle: rows, seedExposures: { 'session.purpose': { count: 1 } } });
  const secondResult = second.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(secondResult.variantKey, 'standard', 'the 2nd real exposure falls through to STANDARD - no forced second-time variant exists for this scenario');
  assert.match(secondResult.written, /instead of jumping straight into a position/, 'STANDARD is the exact same flat responses[lang] text as every scenario published before this gate');

  const third = await routerSandbox({ seedBundle: rows, seedExposures: { 'session.purpose': { count: 2 } } });
  const thirdResult = third.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(thirdResult.variantKey, 'THIRD_TIME_PLUS');
  assert.equal(thirdResult.written, 'A Session, as you know.');

  const fourth = await routerSandbox({ seedBundle: rows, seedExposures: { 'session.purpose': { count: 6 } } });
  const fourthResult = fourth.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(fourthResult.variantKey, 'THIRD_TIME_PLUS');
});

test('a scenario with no authored variants for the current language is completely unaffected - variantKey is always "standard", identical to pre-gate behavior', async () => {
  const window = await routerSandbox({ seedBundle: buildFixtureBundleRows(), seedExposures: { 'session.purpose': { count: 50 } } });
  const result = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(result.variantKey, 'standard');
  assert.match(result.written, /instead of jumping straight into a position/);
});

test('published audio is looked up under the SELECTED variant key, never always "standard" - a FIRST_TIME dialogue plays its own approved audio, not STANDARD\'s', async () => {
  let rows = withVariants(buildFixtureBundleRows(), 'session.purpose', 'en', SESSION_PURPOSE_VARIANTS_EN);
  rows = rows.map((row) => (row.scenarioKey === 'session.purpose'
    ? Object.assign({}, row, { audio: { en: { standard: { url: '/uploads/standard.mp3', mimeType: 'audio/mpeg' }, FIRST_TIME: { url: '/uploads/first-time.mp3', mimeType: 'audio/mpeg' } } } })
    : row));
  const window = await routerSandbox({ seedBundle: rows });
  const result = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(result.variantKey, 'FIRST_TIME');
  assert.equal(result.audioUrl, '/uploads/first-time.mp3', 'must play the FIRST_TIME asset, never fall back to STANDARD\'s audio just because it exists');
});

test('a matched surface_help/data_query scenario is unaffected by variant selection when it has none authored - variantKey is "standard" for data_query too', async () => {
  const store = { listSync: () => [{ status: 'open' }], settings: () => ({ defaultRiskPercent: 1 }) };
  const window = await routerSandbox({ seedBundle: buildFixtureBundleRows(), tradeStore: store });
  const result = window.TradeJournalAIConversationRouter.route('how many open trades do i have');
  assert.equal(result.kind, 'data_query');
  assert.equal(result.variantKey, 'standard');
});

test('recordExposure is exported and optimistically increments the local cache immediately - three real questions asked back-to-back in one sitting see counts 0/1/2, never all reading the same stale value', async () => {
  const rows = withVariants(buildFixtureBundleRows(), 'session.purpose', 'en', SESSION_PURPOSE_VARIANTS_EN);
  // A fetch stub that never resolves for the record POST (simulating "no response yet") - the
  // optimistic local increment must still be immediately visible to the very next route() call,
  // never waiting on the network.
  const window = await routerSandbox({ seedBundle: rows, fetch: async () => new Promise(() => {}) });
  const router = window.TradeJournalAIConversationRouter;

  const first = router.route('what is a session');
  assert.equal(first.variantKey, 'FIRST_TIME');
  router.recordExposure(first.scenarioId, first.variantKey);

  const second = router.route('what is a session');
  assert.equal(second.variantKey, 'standard', 'the optimistic increment from the first call must already be visible here, without any network round trip completing');
  router.recordExposure(second.scenarioId, second.variantKey);

  const third = router.route('what is a session');
  assert.equal(third.variantKey, 'THIRD_TIME_PLUS');
});

test('performanceText never appears in the written field of a resolution, even when a variant carries one - it is Voice-authoring data only, never shown in text UI', async () => {
  const rows = withVariants(buildFixtureBundleRows(), 'session.purpose', 'en', [
    { key: 'FIRST_TIME', context: { exposure: { type: 'FIRST_TIME' } }, written: 'Plain written text.', voiceReply: 'Plain spoken text.', performanceText: '[curious] Plain spoken text.' }
  ]);
  const window = await routerSandbox({ seedBundle: rows });
  const result = window.TradeJournalAIConversationRouter.route('what is a session');
  assert.equal(result.written, 'Plain written text.');
  assert.doesNotMatch(result.written, /\[curious\]/);
  assert.doesNotMatch(JSON.stringify(result), /\[curious\]/, 'performanceText must not leak into any field of the resolution at all');
});
