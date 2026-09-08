import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Voice Command Learning Profile addendum, sections 6/8/9: chat-dock-core.js's own deterministic,
// zero-model-judgment fast paths - resolution-time learned-command matching (Phase G) and
// teach/reinforce/correct feedback wiring (Phase F). Same real-module VM sandbox convention as
// tests/workflow-finish-intent.test.mjs - only fetch/DOM/localStorage are faked; chat-dock-core.js
// and its real dependencies run unmodified.

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

// routes: array of { test: (url, opts) => boolean, respond: (url, opts) => response }, tried in
// order - lets one sandbox express "the /match call returns X, a POST to /api/sync/learned-
// commands returns Y, everything else (the real /api/ai/chat call) returns Z" without depending on
// call ORDER, which the real code's own try/catch best-effort branches do not guarantee.
function routedFetch(routes, calls) {
  return async (url, opts) => {
    calls.push([url, opts && opts.body ? JSON.parse(opts.body) : null, opts && opts.method]);
    for (const route of routes) {
      if (route.test(url, opts)) return route.respond(url, opts);
    }
    throw new Error('unrouted fetch: ' + url);
  };
}

async function coreSandbox({ routes, localStorageSeed, lang = 'en' } = {}) {
  const calls = [];
  const document = { documentElement: { lang } };
  const sandbox = {
    window: {}, document, localStorage: memoryStorage(localStorageSeed),
    fetch: routedFetch(routes || [], calls),
    Set, Math, JSON, console, Date, Promise, setTimeout, clearTimeout,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, fetch: sandbox.fetch,
    TradeJournalAIUsage: { record() {} },
    TradeJournalAiChatHistoryStore: null, TradeJournalNavryaStore: null, TradeJournalNavryaLiveSession: null,
    TradeJournalTradeStore: null, TradeJournalStrategyEducationStore: null, TradeJournalMentalHealthStore: null,
    TradeJournalMentalHealthSafety: null, TradeJournalAIUserMemory: null
  });
  const files = ['ai-i18n.js', 'ai-settings-store.js', 'ai-process-registry.js', 'ai-deterministic-extraction.js', 'ai-context-engine.js', 'ai-action-registry.js', 'ai-action-receipts.js', 'ai-workflow-engine.js', 'ai-command-feedback.js'];
  for (const file of files) vm.runInNewContext(await source(file), sandbox, { filename: file });
  vm.runInNewContext(await source('chat-dock-core.js'), sandbox, { filename: 'chat-dock-core.js' });
  sandbox.window.document.documentElement.lang = lang;
  return { window: sandbox.window, calls };
}

function registerDemoAction(window, { requiredFields = ['name'], riskLevel = 'low', gateField } = {}) {
  let opened = false;
  const registration = {
    id: 'demo.learn.create', domain: 'demo', riskLevel,
    requiredFields, optionalFields: [],
    aliases: [],
    available: () => true,
    open: () => { opened = true; return { processId: 'demo-learn' }; },
    submit: async (known) => ({ id: 'demo-learn-1', known }),
    resultContext: () => {}
  };
  if (gateField) registration.gateField = gateField;
  window.TradeJournalAIActionRegistry.registerAction(registration);
  window.TradeJournalAIProcessRegistry.register('demo-learn', { allowlist: requiredFields, isOpen: () => opened });
  window.TradeJournalAIWorkflowEngine.setSubmitGraceMs(0);
}

function noModelCallRoute() {
  return { test: (url) => url === '/api/ai/chat', respond: async () => { throw new Error('the model must never be called on this turn'); } };
}
function modelChatFallbackRoute(response) {
  return { test: (url) => url === '/api/ai/chat', respond: async () => ({ ok: true, json: async () => (response || { reply: 'ok', suggestions: [], provider: 'openai', model: 'gpt-test', usage: { totalTokens: 5 }, action: { id: null }, nextFieldPath: null }) }) };
}

// --- Phase G: resolution-time learned-command matching ---

test('a learned-command match (flag set, fully covering the action\'s required fields) auto-applies the action deterministically - zero model calls', async () => {
  const routes = [
    { test: (url) => url.startsWith('/api/sync/learned-commands/match'), respond: async () => ({ ok: true, json: async () => ({ match: { id: 'lc-1', actionId: 'demo.learn.create', fieldMappings: { name: 'Demo A' } } }) }) },
    noModelCallRoute()
  ];
  const { window, calls } = await coreSandbox({ routes, localStorageSeed: { 'tradejournal:hasLearnedCommands': 'true' } });
  registerDemoAction(window);
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'log this trade' });
  assert.equal(result.reply, window.TradeJournalAII18n.t('aiLearnedCommandApplied'));
  assert.ok(calls.some((c) => c[0].startsWith('/api/sync/learned-commands/match')));
  assert.ok(!calls.some((c) => c[0] === '/api/ai/chat'), 'the model must never be called once a learned match fully applies');
  // The completed field set schedules a real submit via scheduleSubmit()'s own setTimeout(0) (a
  // macrotask) - sendChat() itself resolves as soon as applyKnownFields() does, one tick before
  // that timer actually fires, so give it one turn of the event loop before reading the receipt.
  await new Promise((resolve) => setTimeout(resolve, 20));
  const receipt = window.TradeJournalAIActionReceipts.rawLast();
  assert.equal(receipt.learnedCommandId, 'lc-1', 'the resulting receipt is tagged with the learned command that triggered it');
  assert.equal(clone(receipt.known).name, 'Demo A');
});

test('with the flag unset (no learned commands ever taught), the resolution lookup is never attempted - falls straight through to the ordinary model turn, byte-for-byte today\'s behavior', async () => {
  const routes = [
    { test: (url) => url.startsWith('/api/sync/learned-commands/match'), respond: async () => { throw new Error('must never be called when hasAnyLearnedCommands() is false'); } },
    modelChatFallbackRoute({ reply: 'Starting the demo - what name?', action: { id: 'demo.learn.create', fields: [] }, provider: 'openai', usage: { totalTokens: 5 }, nextFieldPath: null })
  ];
  const { window, calls } = await coreSandbox({ routes }); // no localStorageSeed - flag is unset
  registerDemoAction(window);
  await window.TradeJournalChatDockCore.sendChat({ text: 'log this trade' });
  assert.ok(!calls.some((c) => c[0].startsWith('/api/sync/learned-commands/match')));
  assert.ok(calls.some((c) => c[0] === '/api/ai/chat'), 'the ordinary model call must still happen');
});

test('a learned match whose fieldMappings do NOT cover every required field is not auto-applied - falls through to the ordinary model turn instead of guessing', async () => {
  const routes = [
    { test: (url) => url.startsWith('/api/sync/learned-commands/match'), respond: async () => ({ ok: true, json: async () => ({ match: { id: 'lc-2', actionId: 'demo.learn.create', fieldMappings: {} } }) }) },
    modelChatFallbackRoute({ reply: 'What name?', action: { id: 'demo.learn.create', fields: [] }, provider: 'openai', usage: { totalTokens: 5 }, nextFieldPath: null })
  ];
  const { window, calls } = await coreSandbox({ routes, localStorageSeed: { 'tradejournal:hasLearnedCommands': 'true' } });
  registerDemoAction(window);
  await window.TradeJournalChatDockCore.sendChat({ text: 'log this trade' });
  assert.ok(calls.some((c) => c[0] === '/api/ai/chat'), 'an incomplete mapping must never half-apply - the ordinary turn still runs');
});

test('a gateField action can never auto-complete through a learned mapping, even if the mapping happens to include a value for the gate field - "never bypass a destructive confirmation"', async () => {
  const routes = [
    { test: (url) => url.startsWith('/api/sync/learned-commands/match'), respond: async () => ({ ok: true, json: async () => ({ match: { id: 'lc-3', actionId: 'demo.learn.create', fieldMappings: { name: 'Demo B', confirm: true } } }) }) },
    modelChatFallbackRoute({ reply: 'What name?', action: { id: 'demo.learn.create', fields: [] }, provider: 'openai', usage: { totalTokens: 5 }, nextFieldPath: null })
  ];
  const { window, calls } = await coreSandbox({ routes, localStorageSeed: { 'tradejournal:hasLearnedCommands': 'true' } });
  registerDemoAction(window, { requiredFields: ['name', 'confirm'], gateField: 'confirm' });
  await window.TradeJournalChatDockCore.sendChat({ text: 'log this trade' });
  assert.ok(calls.some((c) => c[0] === '/api/ai/chat'), 'a gated action must always fall through to ordinary handling, never auto-complete');
});

// --- Phase F: teach / reinforce / correct ---

async function primeEligibleReceipt(window, { triggerText = 'log this trade', learnedCommandId = null, riskLevel = 'low' } = {}) {
  registerDemoAction(window, { riskLevel });
  const workflow = window.TradeJournalAIWorkflowEngine.start('demo.learn.create', {}, []);
  workflow.triggerText = triggerText;
  if (learnedCommandId) workflow.learnedCommandId = learnedCommandId;
  await window.TradeJournalAIWorkflowEngine.applyKnownFields([{ path: 'name', value: 'Demo A' }], {});
  await new Promise((resolve) => setTimeout(resolve, 20));
}

test('"remember this" after an eligible receipt teaches a new learned command from the receipt\'s own triggerText/actionId/known fields, and marks the local flag so future turns can match it', async () => {
  const routes = [
    { test: (url, opts) => url === '/api/sync/learned-commands' && opts.method === 'POST', respond: async (url, opts) => ({ ok: true, json: async () => Object.assign({ id: JSON.parse(opts.body).id }, JSON.parse(opts.body)) }) },
    noModelCallRoute()
  ];
  const { window, calls } = await coreSandbox({ routes });
  await primeEligibleReceipt(window);
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'remember this' });
  assert.equal(result.reply, window.TradeJournalAII18n.t('aiLearnedCommandTaught'));
  const teachCall = calls.find((c) => c[0] === '/api/sync/learned-commands');
  assert.ok(teachCall);
  assert.equal(teachCall[1].normalizedPhrase, 'log this trade');
  assert.equal(teachCall[1].actionId, 'demo.learn.create');
  assert.equal(clone(teachCall[1].fieldMappings).name, 'Demo A');
  assert.equal(window.localStorage.getItem('tradejournal:hasLearnedCommands'), 'true');
  assert.equal(window.TradeJournalAIActionReceipts.rawLast().learnedCommandId, teachCall[1].id, 'the existing receipt is tagged with the newly-taught command');
});

test('"remember this" with no eligible receipt at all is a complete no-op - falls straight through to the ordinary model turn', async () => {
  const routes = [modelChatFallbackRoute()];
  const { window, calls } = await coreSandbox({ routes });
  await window.TradeJournalChatDockCore.sendChat({ text: 'remember this' });
  assert.ok(!calls.some((c) => c[0] === '/api/sync/learned-commands'));
  assert.ok(calls.some((c) => c[0] === '/api/ai/chat'));
});

test('a bare "yes" never teaches anything, even with an eligible receipt present - only the explicit approval vocabulary resolves here', async () => {
  const routes = [modelChatFallbackRoute()];
  const { window, calls } = await coreSandbox({ routes });
  await primeEligibleReceipt(window);
  await window.TradeJournalChatDockCore.sendChat({ text: 'yes' });
  assert.ok(!calls.some((c) => c[0] === '/api/sync/learned-commands'));
});

test('"that\'s right" on a receipt that came from an existing learned command reinforces it via POST .../outcome {outcome:"success"}', async () => {
  const routes = [
    { test: (url) => /\/api\/sync\/learned-commands\/lc-9\/outcome$/.test(url), respond: async () => ({ ok: true, json: async () => ({}) }) },
    noModelCallRoute()
  ];
  const { window, calls } = await coreSandbox({ routes });
  await primeEligibleReceipt(window, { learnedCommandId: 'lc-9' });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: "that's right" });
  assert.equal(result.reply, window.TradeJournalAII18n.t('aiLearnedCommandReinforced'));
  const outcomeCall = calls.find((c) => /outcome$/.test(c[0]));
  assert.equal(outcomeCall[1].outcome, 'success');
});

test('"forget that" deletes the learned command outright (DELETE), "never do this automatically again" disables it (POST .../enabled {enabled:false}), and a plain wrong-value correction posts outcome:"correction"', async () => {
  const deleteRoutes = [{ test: (url, opts) => /\/api\/sync\/learned-commands\/lc-10$/.test(url) && opts.method === 'DELETE', respond: async () => ({ ok: true, json: async () => null }) }, noModelCallRoute()];
  const { window: w1, calls: c1 } = await coreSandbox({ routes: deleteRoutes });
  await primeEligibleReceipt(w1, { learnedCommandId: 'lc-10' });
  const r1 = await w1.TradeJournalChatDockCore.sendChat({ text: 'forget that' });
  assert.equal(r1.reply, w1.TradeJournalAII18n.t('aiLearnedCommandForgotten'));
  assert.ok(c1.some((c) => c[2] === 'DELETE'));

  const disableRoutes = [{ test: (url) => /\/api\/sync\/learned-commands\/lc-11\/enabled$/.test(url), respond: async () => ({ ok: true, json: async () => ({}) }) }, noModelCallRoute()];
  const { window: w2, calls: c2 } = await coreSandbox({ routes: disableRoutes });
  await primeEligibleReceipt(w2, { learnedCommandId: 'lc-11' });
  const r2 = await w2.TradeJournalChatDockCore.sendChat({ text: 'never do this automatically again' });
  assert.equal(r2.reply, w2.TradeJournalAII18n.t('aiLearnedCommandDisabled'));
  const enabledCall = c2.find((c) => /enabled$/.test(c[0]));
  assert.equal(enabledCall[1].enabled, false);

  const correctionRoutes = [{ test: (url) => /\/api\/sync\/learned-commands\/lc-12\/outcome$/.test(url), respond: async () => ({ ok: true, json: async () => ({}) }) }, noModelCallRoute()];
  const { window: w3, calls: c3 } = await coreSandbox({ routes: correctionRoutes });
  await primeEligibleReceipt(w3, { learnedCommandId: 'lc-12' });
  const r3 = await w3.TradeJournalChatDockCore.sendChat({ text: 'wrong value' });
  assert.equal(r3.reply, w3.TradeJournalAII18n.t('aiLearnedCommandCorrectionNoted'));
  const correctionCall = c3.find((c) => /outcome$/.test(c[0]));
  assert.equal(correctionCall[1].outcome, 'correction');
});

test('a correction phrase with no learnedCommandId on the receipt (an ordinary, never-learned action) is a no-op - nothing to correct, falls through to the model', async () => {
  const routes = [modelChatFallbackRoute()];
  const { window, calls } = await coreSandbox({ routes });
  await primeEligibleReceipt(window);
  await window.TradeJournalChatDockCore.sendChat({ text: 'wrong action' });
  assert.ok(!calls.some((c) => /learned-commands/.test(c[0])));
  assert.ok(calls.some((c) => c[0] === '/api/ai/chat'));
});

// --- Section 6: safe "do that again" ---

test('"do that again" on an eligible receipt whose known fields cover every required field replays the action fully, deterministically, with zero model calls', async () => {
  const routes = [noModelCallRoute()];
  const { window, calls } = await coreSandbox({ routes });
  await primeEligibleReceipt(window); // registers demo.learn.create with requiredFields:['name'], applies name:'Demo A'
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'do that again' });
  assert.equal(result.reply, window.TradeJournalAII18n.t('aiRepeatActionApplied'));
  assert.ok(!calls.some((c) => c[0] === '/api/ai/chat'), 'a full, safe repeat must never call the model');
  await new Promise((resolve) => setTimeout(resolve, 20));
  const receipt = window.TradeJournalAIActionReceipts.rawLast();
  assert.equal(clone(receipt.known).name, 'Demo A', 'the repeated run reused the same known field value');
});

test('"do that again" on a receipt whose known fields only PARTIALLY cover the required set still opens/starts the real workflow (routes into it) rather than guessing the rest or doing nothing', async () => {
  const routes = [noModelCallRoute()];
  const { window, calls } = await coreSandbox({ routes });
  registerDemoAction(window, { requiredFields: ['name', 'amount'] });
  const workflow = window.TradeJournalAIWorkflowEngine.start('demo.learn.create', {}, []);
  workflow.triggerText = 'log this trade';
  // Only 'name' is ever applied - 'amount' is deliberately left missing, so this run never
  // actually submits (schedule/apply cannot complete) and the fake submit() below is never even
  // registered as eligible in the first place - build the receipt directly instead, matching what
  // a genuinely-partial-known real receipt would look like.
  window.TradeJournalAIActionReceipts.record({ actionId: 'demo.learn.create', processId: 'demo-learn', known: { name: 'Demo A' }, triggerText: 'log this trade', riskLevel: 'low', hasGate: false, result: 'success' });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'do that again' });
  assert.equal(result.reply, window.TradeJournalAII18n.t('aiRepeatActionStarted'));
  assert.ok(!calls.some((c) => c[0] === '/api/ai/chat'));
  assert.equal(window.TradeJournalAIWorkflowEngine.current().actionId, 'demo.learn.create', 'the real workflow is genuinely open, pre-filled with what is known, ready for the next turn to supply amount');
});

test('"do that again" re-verifies availability RIGHT NOW - an action that has since become unavailable is never blindly repeated, even with an otherwise-eligible receipt', async () => {
  const routes = [modelChatFallbackRoute()];
  const { window, calls } = await coreSandbox({ routes });
  await primeEligibleReceipt(window);
  window.TradeJournalAIActionRegistry.get('demo.learn.create').available = () => false;
  await window.TradeJournalChatDockCore.sendChat({ text: 'do that again' });
  assert.ok(calls.some((c) => c[0] === '/api/ai/chat'), 'an action that is no longer available must fall through to ordinary handling, never be force-repeated');
});

test('"do that again" with no eligible receipt at all is a complete no-op - falls straight through to the ordinary model turn', async () => {
  const routes = [modelChatFallbackRoute()];
  const { window, calls } = await coreSandbox({ routes });
  await window.TradeJournalChatDockCore.sendChat({ text: 'do that again' });
  assert.ok(calls.some((c) => c[0] === '/api/ai/chat'));
});
