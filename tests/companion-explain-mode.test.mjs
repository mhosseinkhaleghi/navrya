import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Journey G follow-up, Item 1: Companion "Explain" must reliably answer even while Dashboard/
// Strategies/Settings has a real, unrelated, legitimately-open inline registered process -
// without touching that process, without letting it hijack the turn, and without starting a
// workflow or applying a suggestion. Mirrors tests/ai-proactive-workflow.test.mjs's own real-
// module sandbox convention (chat-dock-core.js driven end to end, only fetch/DOM faked).
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

async function coreSandbox(overrides = {}) {
  const document = { documentElement: { lang: 'en' } };
  const fetchCalls = [];
  const fetchFn = overrides.fetch || (async (url, options) => {
    fetchCalls.push([url, options ? JSON.parse(options.body) : null]);
    // A deliberately "unsafe" server reply (carries suggestions/action even though the real
    // server's plain-Q&A schema never would) - proves the CLIENT itself never acts on either,
    // not merely that the server happens to omit them.
    return {
      ok: true,
      json: async () => ({
        reply: 'A Pattern is a repeatable market behavior you record.',
        suggestions: [{ path: 'name', value: 'should-never-apply' }],
        action: { id: 'session.create', fields: [{ path: 'city', value: 'New York' }] },
        provider: 'openai', model: 'gpt-test', usage: { totalTokens: 12 }
      })
    };
  });
  const sandbox = {
    window: {}, document, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: fetchFn,
    Set, Math, JSON, console, Date, Promise, setTimeout, clearTimeout,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, fetch: sandbox.fetch,
    TradeJournalAIUsage: { record() {} },
    TradeJournalAiChatHistoryStore: null,
    TradeJournalNavryaStore: null,
    TradeJournalNavryaLiveSession: null,
    TradeJournalTradeStore: { listSync: () => [] },
    TradeJournalStrategyEducationStore: { find: () => null },
    TradeJournalMentalHealthStore: null,
    TradeJournalMentalHealthSafety: null
  });
  const files = ['ai-i18n.js', 'ai-settings-store.js', 'ai-process-registry.js', 'ai-trade-actions.js', 'ai-proactive-engine.js', 'ai-signal-router.js', 'ai-deterministic-extraction.js', 'ai-context-engine.js', 'ai-action-registry.js', 'ai-workflow-engine.js'];
  for (const file of files) vm.runInNewContext(await source(file), sandbox, { filename: file });
  vm.runInNewContext(await source('chat-dock-core.js'), sandbox, { filename: 'chat-dock-core.js' });
  return { window: sandbox.window, fetchCalls };
}

// Registers a real inline form process (the same allowlist/applyValue shape every real
// registration in this codebase uses) and returns a spy recording every field it was ever asked
// to change - the thing that must stay untouched by an Explain turn.
function registerUnrelatedProcess(window, id, allowlist) {
  const applied = [];
  window.TradeJournalAIProcessRegistry.register(id, {
    allowlist,
    isOpen: () => true,
    applyValue: (path, value) => applied.push([path, value])
  });
  return applied;
}

async function runExplainScenario(t, { processId, allowlist }) {
  const { window, fetchCalls } = await coreSandbox();
  const applied = registerUnrelatedProcess(window, processId, allowlist);

  const result = await window.TradeJournalChatDockCore.sendChat({
    text: 'What is a Pattern?', companionIntent: 'explain', therapistMode: false, transcript: []
  });

  await t.test('the explanation succeeds (a real assistant reply, not an error/safety gate)', () => {
    assert.equal(result.kind, 'assistant');
    assert.match(result.reply, /repeatable market behavior/);
  });
  await t.test('the unrelated process\'s own fields were never touched', () => {
    assert.deepEqual(applied, []);
  });
  await t.test('no workflow started, despite the (deliberately unsafe) reply carrying an action', () => {
    assert.equal(window.TradeJournalAIWorkflowEngine.current(), null);
  });
  await t.test('exactly one AI call was made', () => {
    assert.equal(fetchCalls.length, 1);
  });
  await t.test('the request sent activeProcess:null and companionIntent:"explain", never the unrelated process id', () => {
    const [, body] = fetchCalls[0];
    assert.equal(body.activeProcess, null);
    assert.equal(body.availableActions, undefined);
    assert.equal(body.companionIntent, 'explain');
  });
  await t.test('the process is still open afterward, completely unaffected - ordinary ChatDock behavior can resume', () => {
    assert.equal(window.TradeJournalAIProcessRegistry.query(processId).open, true);
  });
}

test('Settings inline process (settings-trading-defaults) + Companion Explain', async (t) => {
  await runExplainScenario(t, { processId: 'settings-trading-defaults', allowlist: ['defaultRiskPercent', 'leverageCap', 'maxTradesPerSession'] });
});

test('Strategies inline process (strategy-editor-{id}) + Companion Explain', async (t) => {
  await runExplainScenario(t, { processId: 'strategy-editor-strat-1', allowlist: ['name', 'positionManagement.entryRules'] });
});

// No page currently named "Dashboard" registers a persistent inline AI process in this
// repository (confirmed by inspection - navrya-src/dashboardView.jsx and canvasApp.jsx register
// nothing; only Settings' three registrations and Strategies' Pattern/Strategy editors do,
// despite ARCHITECTURE.md's Known Constraints describing all three by name - a second, smaller
// doc-drift noted alongside the real-auth one). The fix here is fully id-agnostic (it suppresses
// activeProcess/availableActions for ANY open process, never special-cased by id), so this test
// proves the same guarantee against a representative Dashboard-shaped registration instead -
// it would hold identically for a real one if/when it exists.
test('a Dashboard-shaped inline process (representative - no real one exists in this repo today) + Companion Explain', async (t) => {
  await runExplainScenario(t, { processId: 'dashboard-panel-builder', allowlist: ['prompt'] });
});

test('an ordinary turn (no companionIntent) never sends companionIntent, and behaves exactly as before', async () => {
  const calls = [];
  const { window } = await coreSandbox({
    fetch: async (url, options) => { calls.push([url, JSON.parse(options.body)]); return { ok: true, json: async () => ({ reply: 'ok', usage: { totalTokens: 3 } }) }; }
  });
  await window.TradeJournalChatDockCore.sendChat({ text: 'hello', therapistMode: false, transcript: [] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].companionIntent, undefined);
});
