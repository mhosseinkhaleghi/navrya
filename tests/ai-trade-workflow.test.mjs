import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

// Objects that transited through the vm-sandboxed engine modules carry that realm's own
// Object/Array.prototype, so assert.deepEqual (node:assert/strict's deepStrictEqual,
// prototype-sensitive) reports "same structure but not reference-equal" even when every field
// matches - the same caveat every other AI Copilot test file in this suite already calls out.
const clone = value => JSON.parse(JSON.stringify(value));

// Journey B ("I want to take BTC long") integration tests, at the same level as
// tests/chat-dock-core.test.mjs's own Journey A section - real ai-context-engine.js,
// ai-action-registry.js, ai-workflow-engine.js, ai-process-registry.js and, critically, the real
// ai-trade-actions.js normalization module (not a fake stand-in), driven through the real
// chat-dock-core.js turn-by-turn routing. Only the target UI (tradeCalculatorModal.jsx's own
// React component and TradeJournalTradeStore/TradeJournalTradeUI) is faked, exactly the same way
// registerFakeSessionCreate() fakes NewSessionDialog.jsx in the Journey A tests - chat-dock-core.js
// only ever talks to the two window-hook registries, never to the components themselves.
async function coreSandbox(overrides) {
  const document = { documentElement: { lang: 'en' } };
  const sandbox = {
    window: {}, document, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: overrides.fetch || (async () => { throw new Error('fetch must not be called in this test'); }),
    Set, Math, JSON, console, Date, Promise, setTimeout, clearTimeout,
    CustomEvent: overrides.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, fetch: sandbox.fetch,
    TradeJournalAIUsage: overrides.aiUsage || { record() {} },
    TradeJournalAiChatHistoryStore: overrides.historyStore,
    TradeJournalNavryaStore: overrides.navryaStore,
    TradeJournalNavryaLiveSession: overrides.liveSession
  });
  const files = ['ai-i18n.js', 'ai-settings-store.js', 'ai-process-registry.js', 'ai-trade-actions.js', 'ai-context-engine.js', 'ai-action-registry.js', 'ai-workflow-engine.js'];
  for (const file of files) {
    vm.runInNewContext(await source(file), sandbox, { filename: file });
  }
  vm.runInNewContext(await source('chat-dock-core.js'), sandbox, { filename: 'chat-dock-core.js' });
  return sandbox.window;
}

// Mirrors the real client-side wiring exactly: navrya-src/tradeCalculatorModal.jsx's own
// registry.register('trade-calculator', {...allowlist, applyValue, submit}) and
// navrya-src/character-app.jsx's own registerAction({id:'trade.calculator', ...}), including its
// real open(context) sourceSessionId/sourceScenarioId threading and its normalizeField() delegating
// to the real, already-loaded window.TradeJournalAITradeActions module - nothing here reimplements
// normalization; it only stands in for the React component and TradeJournalTradeStore.
function registerFakeTradeCalculator(window, spies) {
  let processOpen = false;
  const state = {};
  window.TradeJournalAIProcessRegistry.register('trade-calculator', {
    allowlist: ['direction', 'entryPrice', 'stopLoss', 'riskPercent', 'leverage', 'marginMode', 'takeProfits', 'linkedStrategyId', 'linkedPatternIds', 'sourceSessionId', 'sourceScenarioId'],
    isOpen: () => processOpen,
    applyValue: (path, value) => { spies.applied.push([path, value]); state[path] = value; },
    submit: () => {
      spies.submitCalls += 1;
      if (spies.submitShouldFail) throw new Error('tradeStore.save() failed');
      const trade = Object.assign({ id: 'trade-' + spies.submitCalls }, state);
      spies.savedTrades.push(trade);
      return trade;
    }
  });
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'trade.calculator', domain: 'trades',
    requiredFields: ['direction', 'entryPrice', 'stopLoss', 'riskPercent', 'takeProfits'],
    optionalFields: ['leverage', 'marginMode', 'linkedStrategyId', 'linkedPatternIds'],
    available: () => true,
    open: (context) => {
      spies.opened += 1;
      processOpen = true;
      const registry = window.TradeJournalAIProcessRegistry;
      const entities = context && context.activeEntities;
      if (registry && entities) {
        if (entities.sessionId) registry.applyValue('trade-calculator', 'sourceSessionId', entities.sessionId, 'replace');
        if (entities.scenarioId) registry.applyValue('trade-calculator', 'sourceScenarioId', entities.scenarioId, 'replace');
      }
    },
    normalizeField: (path, value) => window.TradeJournalAITradeActions.normalizeField(path, value, {}),
    submit: () => window.TradeJournalAIProcessRegistry.submit('trade-calculator'),
    resultContext: (trade) => { spies.resultContext = trade; }
  });
  return { open: () => { processOpen = true; }, close: () => { processOpen = false; } };
}

function newSpies() {
  return { applied: [], opened: 0, savedTrades: [], submitCalls: 0, submitShouldFail: false, resultContext: null };
}

test('trade.calculator is discoverable in availableActions even when nothing is open', async () => {
  const spies = newSpies();
  let fetchCall = null;
  const window = await coreSandbox({
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'plain answer', action: null, provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  registerFakeTradeCalculator(window, spies);
  await window.TradeJournalChatDockCore.sendChat({ text: 'what is my win rate?', therapistMode: false, transcript: [] });
  assert.ok(Array.isArray(fetchCall.body.availableActions) && fetchCall.body.availableActions.some((a) => a.id === 'trade.calculator'));
});

test('a single message carrying every required field ("take BTC long, entry 66000, stop 65000, target 70000, risk 1%") live-fills everything in one turn and asks nothing further', async () => {
  const spies = newSpies();
  const window = await coreSandbox({
    fetch: async () => ({
      ok: true,
      json: async () => ({
        reply: 'Sizing a long from 66000 to 65000, targeting 70000 at 1% risk.',
        action: {
          id: 'trade.calculator',
          fields: [
            { path: 'direction', value: 'long' },
            { path: 'entryPrice', value: '66000' },
            { path: 'stopLoss', value: '65000' },
            { path: 'riskPercent', value: '1%' },
            { path: 'takeProfits', value: '70000' }
          ]
        },
        provider: 'openai', usage: { totalTokens: 5 }
      })
    })
  });
  registerFakeTradeCalculator(window, spies);

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'I want to take BTC long, entry 66000, stop 65000, target 70000, risk 1%', therapistMode: false, transcript: [] });

  assert.equal(spies.opened, 1);
  assert.deepEqual(clone(spies.applied), [
    ['direction', 'long'],
    ['entryPrice', 66000],
    ['stopLoss', 65000],
    ['riskPercent', 1],
    ['takeProfits', [{ price: 70000, portionPercent: 100 }]]
  ], 'every field must reach the real UI already normalized (real ai-trade-actions.js rules), not the raw extracted text');
  assert.equal(result.kind, 'workflow');
  assert.deepEqual(clone(result.workflow.missing), [], 'nothing left to ask - no duplicate follow-up question for a field already supplied');
  assert.equal(result.workflow.status, 'pending-submit');
});

test('a guided flow (one field at a time) never re-asks for a field already known, and only asks about what is genuinely still missing', async () => {
  const spies = newSpies();
  let turn = 0;
  const window = await coreSandbox({
    fetch: async () => {
      turn += 1;
      if (turn === 1) return { ok: true, json: async () => ({ reply: 'Long it is - what is your entry?', action: { id: 'trade.calculator', fields: [{ path: 'direction', value: 'long' }] }, provider: 'openai', usage: { totalTokens: 5 } }) };
      if (turn === 2) return { ok: true, json: async () => ({ reply: 'And your stop?', suggestions: [{ path: 'entryPrice', value: '66000', mode: 'replace' }], provider: 'openai', usage: { totalTokens: 5 } }) };
      return { ok: true, json: async () => ({ reply: 'Got it.', suggestions: [{ path: 'stopLoss', value: '65000', mode: 'replace' }], provider: 'openai', usage: { totalTokens: 5 } }) };
    }
  });
  registerFakeTradeCalculator(window, spies);
  const core = window.TradeJournalChatDockCore;

  const first = await core.sendChat({ text: 'I want to take BTC long', therapistMode: false, transcript: [] });
  assert.deepEqual(clone(first.workflow.known), { direction: 'long' });

  const second = await core.sendChat({ text: '66000', therapistMode: false, transcript: [] });
  assert.deepEqual(clone(second.workflow.known), { direction: 'long', entryPrice: 66000 });
  assert.ok(second.workflow.missing.indexOf('direction') === -1, 'direction is already known - must never be re-asked');

  const third = await core.sendChat({ text: '65000', therapistMode: false, transcript: [] });
  assert.deepEqual(clone(third.workflow.known), { direction: 'long', entryPrice: 66000, stopLoss: 65000 });
  assert.ok(third.workflow.missing.indexOf('entryPrice') === -1 && third.workflow.missing.indexOf('direction') === -1);
});

test('submit() delegates to TradeJournalAIProcessRegistry.submit(\'trade-calculator\') - the real Trade Store save path, never a parallel one - and resultContext receives the real saved trade', async () => {
  const spies = newSpies();
  const window = await coreSandbox({
    fetch: async () => ({
      ok: true,
      json: async () => ({
        reply: 'Opening a long.',
        action: { id: 'trade.calculator', fields: [
          { path: 'direction', value: 'long' }, { path: 'entryPrice', value: '66000' }, { path: 'stopLoss', value: '65000' },
          { path: 'riskPercent', value: '1' }, { path: 'takeProfits', value: '70000' }
        ] },
        provider: 'openai', usage: { totalTokens: 5 }
      })
    })
  });
  registerFakeTradeCalculator(window, spies);
  window.TradeJournalAIWorkflowEngine.setSubmitGraceMs(20);

  await window.TradeJournalChatDockCore.sendChat({ text: 'take BTC long, entry 66000, stop 65000, target 70000, risk 1%', therapistMode: false, transcript: [] });
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(spies.submitCalls, 1, 'exactly one save through the real registered submit()');
  assert.equal(spies.savedTrades.length, 1);
  assert.equal(spies.savedTrades[0].direction, 'long');
  assert.equal(spies.resultContext.id, spies.savedTrades[0].id, 'resultContext() must receive the real saved record, not a fabricated one');
  assert.equal(window.TradeJournalAIWorkflowEngine.current(), null);
});

test('a correction to takeProfits during the grace window (66000 -> 70000) results in exactly one saved trade, carrying only the corrected target', async () => {
  const spies = newSpies();
  let turn = 0;
  const window = await coreSandbox({
    fetch: async () => {
      turn += 1;
      if (turn === 1) return { ok: true, json: async () => ({ reply: '...', action: { id: 'trade.calculator', fields: [
        { path: 'direction', value: 'long' }, { path: 'entryPrice', value: '66000' }, { path: 'stopLoss', value: '65000' },
        { path: 'riskPercent', value: '1' }, { path: 'takeProfits', value: '66000' }
      ] }, provider: 'openai', usage: { totalTokens: 5 } }) };
      return { ok: true, json: async () => ({ reply: 'Corrected.', suggestions: [{ path: 'takeProfits', value: '70000', mode: 'replace' }], provider: 'openai', usage: { totalTokens: 5 } }) };
    }
  });
  registerFakeTradeCalculator(window, spies);
  window.TradeJournalAIWorkflowEngine.setSubmitGraceMs(60);

  await window.TradeJournalChatDockCore.sendChat({ text: 'take BTC long, entry 66000, stop 65000, target 66000, risk 1%', therapistMode: false, transcript: [] });
  await new Promise((resolve) => setTimeout(resolve, 20)); // well inside the 60ms grace window
  await window.TradeJournalChatDockCore.sendChat({ text: 'no, make that 70000', therapistMode: false, transcript: [] });
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(spies.submitCalls, 1, 'exactly one submit - the correction re-armed the same grace window rather than adding a second');
  assert.deepEqual(clone(spies.savedTrades[0].takeProfits), [{ price: 70000, portionPercent: 100 }], 'only the corrected target price is ever saved');
});

test('an active Session is inherited automatically (sourceSessionId applied on open, never asked as a chat field)', async () => {
  const spies = newSpies();
  const window = await coreSandbox({
    navryaStore: { getState: () => ({ activeId: 'sessions' }) },
    liveSession: { getActiveSessionId: () => 'session-abc' },
    fetch: async () => ({ ok: true, json: async () => ({ reply: '...', action: { id: 'trade.calculator', fields: [{ path: 'direction', value: 'long' }] }, provider: 'openai', usage: { totalTokens: 5 } }) })
  });
  registerFakeTradeCalculator(window, spies);

  await window.TradeJournalChatDockCore.sendChat({ text: 'I want to take BTC long', therapistMode: false, transcript: [] });

  assert.ok(spies.applied.some((entry) => entry[0] === 'sourceSessionId' && entry[1] === 'session-abc'), 'the real active session must be threaded through automatically');
});

test('a Scenario is only ever inherited alongside its own active Session, never guessed on its own', async () => {
  const spies = newSpies();
  const window = await coreSandbox({
    navryaStore: { getState: () => ({ activeId: 'sessions' }) },
    liveSession: { getActiveSessionId: () => 'session-abc' },
    fetch: async () => ({ ok: true, json: async () => ({ reply: '...', action: { id: 'trade.calculator', fields: [{ path: 'direction', value: 'long' }] }, provider: 'openai', usage: { totalTokens: 5 } }) })
  });
  // The real ai-context-engine.js resolves scenarioId from whichever AI process is currently
  // open, prefixed 'live-session-scenario-' - simulate a scenario card already expanded, exactly
  // as liveSessionView.jsx registers one.
  window.TradeJournalAIProcessRegistry.register('live-session-scenario-scenario-xyz', { allowlist: [], isOpen: () => true });
  registerFakeTradeCalculator(window, spies);

  await window.TradeJournalChatDockCore.sendChat({ text: 'take BTC long on this scenario', therapistMode: false, transcript: [] });

  assert.ok(spies.applied.some((entry) => entry[0] === 'sourceSessionId' && entry[1] === 'session-abc'));
  assert.ok(spies.applied.some((entry) => entry[0] === 'sourceScenarioId' && entry[1] === 'scenario-xyz'));
});

test('with no active Session, sourceSessionId/sourceScenarioId are never applied - no guessed linkage', async () => {
  const spies = newSpies();
  const window = await coreSandbox({
    fetch: async () => ({ ok: true, json: async () => ({ reply: '...', action: { id: 'trade.calculator', fields: [{ path: 'direction', value: 'long' }] }, provider: 'openai', usage: { totalTokens: 5 } }) })
  });
  registerFakeTradeCalculator(window, spies);

  await window.TradeJournalChatDockCore.sendChat({ text: 'I want to take BTC long', therapistMode: false, transcript: [] });

  assert.equal(spies.applied.some((entry) => entry[0] === 'sourceSessionId'), false);
  assert.equal(spies.applied.some((entry) => entry[0] === 'sourceScenarioId'), false);
});

test('AI/save failure recovery: a submit() that fails leaves every already-applied field intact, and a later retry still results in exactly one saved trade', async () => {
  const spies = newSpies();
  spies.submitShouldFail = true;
  let turn = 0;
  const window = await coreSandbox({
    fetch: async () => {
      turn += 1;
      if (turn === 1) return { ok: true, json: async () => ({ reply: '...', action: { id: 'trade.calculator', fields: [
        { path: 'direction', value: 'long' }, { path: 'entryPrice', value: '66000' }, { path: 'stopLoss', value: '65000' },
        { path: 'riskPercent', value: '1' }, { path: 'takeProfits', value: '70000' }
      ] }, provider: 'openai', usage: { totalTokens: 5 } }) };
      // A retry turn that adds nothing new (re-echoes nothing) - the workflow is still complete
      // from before, so it must simply re-arm the grace window and try submit() again.
      return { ok: true, json: async () => ({ reply: 'Retrying.', suggestions: [], provider: 'openai', usage: { totalTokens: 5 } }) };
    }
  });
  registerFakeTradeCalculator(window, spies);
  window.TradeJournalAIWorkflowEngine.setSubmitGraceMs(20);

  await window.TradeJournalChatDockCore.sendChat({ text: 'take BTC long, entry 66000, stop 65000, target 70000, risk 1%', therapistMode: false, transcript: [] });
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(spies.submitCalls, 1, 'the first attempt was made and failed');
  assert.equal(spies.savedTrades.length, 0, 'nothing was actually persisted by the failed attempt');
  assert.equal(window.TradeJournalAIWorkflowEngine.current().status, 'collecting', 'falls back to collecting, not lost');
  assert.deepEqual(clone(window.TradeJournalAIWorkflowEngine.current().known).direction, 'long', 'every value already applied survives the failed attempt');

  spies.submitShouldFail = false;
  await window.TradeJournalChatDockCore.sendChat({ text: 'try again', therapistMode: false, transcript: [] });
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(spies.submitCalls, 2, 'exactly one retry attempt');
  assert.equal(spies.savedTrades.length, 1, 'exactly one eventual trade, never a duplicate from the earlier failed attempt');
});

test('cancellation (the user closes the real calculator by hand before finishing) leaves zero saved trades and does not block a later, genuinely new request', async () => {
  const spies = newSpies();
  const window = await coreSandbox({
    fetch: async () => ({ ok: true, json: async () => ({ reply: '...', action: { id: 'trade.calculator', fields: [{ path: 'direction', value: 'long' }] }, provider: 'openai', usage: { totalTokens: 5 } }) })
  });
  const dialog = registerFakeTradeCalculator(window, spies);
  const core = window.TradeJournalChatDockCore;

  const first = await core.sendChat({ text: 'I want to take BTC long', therapistMode: false, transcript: [] });
  assert.deepEqual(clone(first.workflow.known), { direction: 'long' });
  assert.ok(first.workflow.missing.length > 0, 'still mid-conversation, never completed');

  dialog.close(); // the user closes the calculator by hand, abandoning the workflow unfinished

  const second = await core.sendChat({ text: 'I want to take BTC long', therapistMode: false, transcript: [] });
  assert.equal(second.kind, 'workflow');
  assert.equal(spies.opened, 2, 'a real, second attempt - the abandoned one never blocks a fresh request');
  assert.equal(spies.savedTrades.length, 0, 'nothing was ever persisted from the abandoned attempt');
});

test('an unmatched request (action: null) is treated as a plain answer - no trade workflow starts, nothing is opened or saved', async () => {
  const spies = newSpies();
  const window = await coreSandbox({
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'Your win rate is 62%.', action: null, provider: 'openai', usage: { totalTokens: 2 } }) })
  });
  registerFakeTradeCalculator(window, spies);

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'what is my win rate?', therapistMode: false, transcript: [] });

  assert.equal(result.kind, 'assistant');
  assert.equal(spies.opened, 0);
  assert.equal(spies.savedTrades.length, 0);
});
