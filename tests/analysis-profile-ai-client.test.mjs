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
