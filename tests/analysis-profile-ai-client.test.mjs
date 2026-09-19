import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Analysis Profile AI client (public/pages/shared/analysis-profile-ai.js) - the onboarding
// wizard's "Suggest more with AI" (regenerate) call. Same vm.runInContext convention every other
// public/pages/shared browser-global file is tested with in this repo.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

test('every character page loads analysis-profile-ai.js as a script, right after analysis-context.js (window-global, same convention as analysis-graph-registry.js)', async () => {
  for (const character of ['hunter', 'commander', 'engineer', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    assert.match(html, /<script defer src="\.\.\/shared\/analysis-profile-ai\.js"><\/script>/, `${character}/index.html is missing the analysis-profile-ai.js script tag`);
  }
});

async function loadClient({ fetchImpl } = {}) {
  // The real client calls window.setTimeout/window.clearTimeout (same convention as
  // pattern-registry-ai.js), not the bare globals - both must live on window here too.
  const sandbox = {
    window: { setTimeout: (fn) => fn(), clearTimeout: () => {} }, AbortController, console,
    fetch: fetchImpl || (async () => ({ ok: false, status: 500, json: async () => ({}) }))
  };
  vm.createContext(sandbox);
  vm.runInContext(await source('analysis-style-registry.js'), sandbox, { filename: 'analysis-style-registry.js' });
  vm.runInContext(await source('analysis-focus-registry.js'), sandbox, { filename: 'analysis-focus-registry.js' });
  vm.runInContext(await source('analysis-profile-ai.js'), sandbox, { filename: 'analysis-profile-ai.js' });
  return { client: sandbox.window.TradeJournalAnalysisProfileAI, window: sandbox.window };
}

test('registers window.TradeJournalAnalysisProfileAI', async () => {
  const { client } = await loadClient();
  assert.ok(client);
  assert.equal(typeof client.suggestFocuses, 'function');
});

test('suggestFocuses resolves the primary/secondary style objects from the real registry (never a second, invented style shape) and posts them', async () => {
  let capturedBody = null;
  const { client } = await loadClient({
    fetchImpl: async (url, options) => { capturedBody = JSON.parse(options.body); return { ok: true, json: async () => ({ suggestions: [{ name: 'x', description: 'y' }], provider: 'openai', usage: null }) }; }
  });
  await client.suggestFocuses({ primaryStyleId: 'price_action', secondaryStyleIds: ['wyckoff'], language: 'en' });
  assert.equal(capturedBody.kind, 'focuses');
  assert.equal(capturedBody.primaryStyle.id, 'price_action');
  assert.equal(capturedBody.secondaryStyles[0].id, 'wyckoff');
});

test('suggestFocuses tolerates an unknown/missing primaryStyleId (resolves to null, never throws)', async () => {
  const { client } = await loadClient({ fetchImpl: async () => ({ ok: true, json: async () => ({ suggestions: [], provider: 'openai', usage: null }) }) });
  const result = await client.suggestFocuses({});
  assert.deepEqual(result.suggestions, []);
});

test('a non-ok response rejects with a typed AnalysisProfileAIError carrying the real server error code - never a silently faked local suggestion', async () => {
  const { client } = await loadClient({ fetchImpl: async () => ({ ok: false, status: 402, json: async () => ({ error: 'WALLET_INSUFFICIENT_BALANCE' }) }) });
  await assert.rejects(
    () => client.suggestFocuses({ primaryStyleId: 'price_action' }),
    (error) => error.name === 'AnalysisProfileAIError' && error.code === 'WALLET_INSUFFICIENT_BALANCE'
  );
});

test('a network failure rejects with a typed error, never a fabricated suggestion list', async () => {
  const { client } = await loadClient({ fetchImpl: async () => { throw new Error('boom'); } });
  await assert.rejects(() => client.suggestFocuses({ primaryStyleId: 'price_action' }), (error) => error.name === 'AnalysisProfileAIError' && error.code === 'ANALYSIS_PROFILE_AI_NETWORK_ERROR');
});

test('a successful call records the real server-reported usage against window.TradeJournalAIUsage, best-effort', async () => {
  const recorded = [];
  const { client, window: sandboxWindow } = await loadClient({ fetchImpl: async () => ({ ok: true, json: async () => ({ suggestions: [], provider: 'openai', usage: { promptTokens: 10 } }) }) });
  sandboxWindow.TradeJournalAIUsage = { record: (entry) => recorded.push(entry) };
  await client.suggestFocuses({ primaryStyleId: 'price_action' });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].source, 'analysisProfiles.suggestFocuses');
});

test('a missing window.TradeJournalAIUsage never breaks the call (best-effort recording)', async () => {
  const { client } = await loadClient({ fetchImpl: async () => ({ ok: true, json: async () => ({ suggestions: [{ name: 'a', description: 'b' }], provider: 'openai', usage: null }) }) });
  const result = await client.suggestFocuses({ primaryStyleId: 'price_action' });
  assert.equal(result.suggestions.length, 1);
});

// ---- suggestConcepts / ingestLearning (Phase 2) ----------------------------------------------------

test('suggestConcepts posts kind "concepts" to the SAME real suggest route, with the resolved style objects, and records usage under its own source label', async () => {
  let captured = null;
  const recorded = [];
  const { client, window: sandboxWindow } = await loadClient({
    fetchImpl: async (url, options) => { captured = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ suggestions: [{ name: 'Breaker block', description: 'd', priority: 'reference' }], provider: 'openai', usage: { promptTokens: 5 } }) }; }
  });
  sandboxWindow.TradeJournalAIUsage = { record: (entry) => recorded.push(entry) };
  const result = await client.suggestConcepts({ primaryStyleId: 'smc', alreadySelected: ['Order block mitigation'], language: 'fa' });
  assert.match(captured.url, /\/api\/analysis-profiles\/suggest$/);
  assert.equal(captured.body.kind, 'concepts');
  assert.equal(captured.body.primaryStyle.id, 'smc');
  assert.equal(captured.body.language, 'fa');
  assert.equal(result.suggestions[0].priority, 'reference');
  assert.equal(recorded[0].source, 'analysisProfiles.suggestConcepts');
});

test('ingestLearning posts the trimmed teaching text, current understanding and existing concept titles to the real ingest route, and returns only a PROPOSAL', async () => {
  let captured = null;
  const { client } = await loadClient({
    fetchImpl: async (url, options) => { captured = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ updatedUnderstanding: 'Checks swept liquidity first.', conceptsProposed: [{ title: 'Swept liquidity levels', description: 'd', priority: 'mandatory' }], provider: 'openai', usage: { promptTokens: 200, completionTokens: 60 } }) }; }
  });
  const result = await client.ingestLearning({
    kind: 'correction', text: '   I never trade before checking swept liquidity.  ', primaryStyleId: 'smc',
    currentUnderstanding: 'Reads structure first.', existingConceptTitles: ['Order block mitigation'], language: 'en'
  });
  assert.match(captured.url, /\/api\/analysis-profiles\/ingest$/);
  assert.equal(captured.body.kind, 'correction');
  assert.equal(captured.body.text, 'I never trade before checking swept liquidity.', 'the text must be trimmed');
  assert.equal(captured.body.currentUnderstanding, 'Reads structure first.');
  assert.equal(captured.body.existingConcepts[0].title, 'Order block mitigation');
  assert.equal(captured.body.primaryStyle.id, 'smc');
  assert.equal(result.updatedUnderstanding, 'Checks swept liquidity first.');
  assert.equal(result.conceptsProposed[0].title, 'Swept liquidity levels');
  assert.equal(result.usage.promptTokens, 200);
});

test('ingestLearning refuses empty / whitespace-only text locally, BEFORE any network call - a click on an empty box can never bill', async () => {
  let calls = 0;
  const { client } = await loadClient({ fetchImpl: async () => { calls += 1; return { ok: true, json: async () => ({}) }; } });
  for (const text of ['', '   \n ', undefined, null]) {
    await assert.rejects(() => client.ingestLearning({ kind: 'note', text }), (error) => error.name === 'AnalysisProfileAIError' && error.code === 'ANALYSIS_PROFILE_INGEST_TEXT_REQUIRED');
  }
  assert.equal(calls, 0);
});

test('ingestLearning surfaces the real server error code (e.g. an insufficient wallet balance) - never a faked proposal', async () => {
  const { client } = await loadClient({ fetchImpl: async () => ({ ok: false, status: 402, json: async () => ({ error: 'WALLET_INSUFFICIENT_BALANCE' }) }) });
  await assert.rejects(() => client.ingestLearning({ kind: 'note', text: 'hello' }), (error) => error.code === 'WALLET_INSUFFICIENT_BALANCE');
});

test('ingestLearning records the real server-reported usage under the analysisProfiles.ingest source label', async () => {
  const recorded = [];
  const { client, window: sandboxWindow } = await loadClient({ fetchImpl: async () => ({ ok: true, json: async () => ({ updatedUnderstanding: '', conceptsProposed: [], provider: 'openai', usage: { promptTokens: 9 } }) }) });
  sandboxWindow.TradeJournalAIUsage = { record: (entry) => recorded.push(entry) };
  await client.ingestLearning({ kind: 'note', text: 'x' });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].source, 'analysisProfiles.ingest');
});

// ---- bring-your-own-key ------------------------------------------------------------------------------

test('with a personal provider key configured, EVERY request carries provider/model/apiKey (so the gateway treats it as BYOK and never bills the wallet)', async () => {
  const bodies = [];
  const { client, window: sandboxWindow } = await loadClient({
    fetchImpl: async (url, options) => { bodies.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ suggestions: [], updatedUnderstanding: '', conceptsProposed: [], provider: 'anthropic', usage: null }) }; }
  });
  sandboxWindow.TradeJournalAISettingsStore = { activeProvider: () => 'anthropic', activeModel: () => 'claude-sonnet-4-5', getKey: (provider) => (provider === 'anthropic' ? 'sk-user-own-key' : '') };
  await client.suggestFocuses({ primaryStyleId: 'price_action' });
  await client.suggestConcepts({ primaryStyleId: 'price_action' });
  await client.ingestLearning({ kind: 'note', text: 'hello' });
  assert.equal(bodies.length, 3);
  for (const body of bodies) {
    assert.equal(body.apiKey, 'sk-user-own-key');
    assert.equal(body.provider, 'anthropic');
    assert.equal(body.model, 'claude-sonnet-4-5');
  }
});

test('with NO personal key, no apiKey/provider/model is sent at all - the platform default serves the call and it is billed per the token policy', async () => {
  let body = null;
  const { client, window: sandboxWindow } = await loadClient({ fetchImpl: async (url, options) => { body = JSON.parse(options.body); return { ok: true, json: async () => ({ suggestions: [], provider: 'openai', usage: null }) }; } });
  sandboxWindow.TradeJournalAISettingsStore = { activeProvider: () => 'openai', activeModel: () => 'gpt-5.6', getKey: () => '' };
  await client.suggestFocuses({ primaryStyleId: 'price_action' });
  assert.equal('apiKey' in body, false);
  assert.equal('provider' in body, false);
  assert.equal('model' in body, false);
});

test('a missing or throwing settings store never breaks the call - it simply falls back to the platform default', async () => {
  let body = null;
  const { client, window: sandboxWindow } = await loadClient({ fetchImpl: async (url, options) => { body = JSON.parse(options.body); return { ok: true, json: async () => ({ suggestions: [], provider: 'openai', usage: null }) }; } });
  sandboxWindow.TradeJournalAISettingsStore = { activeProvider: () => { throw new Error('settings exploded'); }, getKey: () => 'x' };
  const result = await client.suggestFocuses({ primaryStyleId: 'price_action' });
  assert.equal(result.suggestions.length, 0);
  assert.equal('apiKey' in body, false);
});
