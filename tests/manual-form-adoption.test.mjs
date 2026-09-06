import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Slice U2-d: execution brief section 9 item 12, "manual form adoption and suggestion review" -
// verification only, no behavior changed. This mechanism (activeProcess -> model-proposed
// suggestions[] -> explicit Apply/Discard) substantially predates this whole voice-agentification
// effort - dockChatFormatFor()'s schema shape and "Explain never adopts" already had coverage
// (tests/ai-dock-chat-actions.test.mjs, tests/companion-explain-mode.test.mjs). What had NO
// coverage anywhere: chat-dock-core.js's own client-side half of the loop - that a MANUALLY-opened
// form (registered, but never started via any ai-workflow) never has a field silently applied,
// that its suggestions instead pass through untouched for the popover's own explicit Apply/
// Discard (chatDockView.jsx's applySuggestion()/discardSuggestion()), and that this is a real,
// deliberate DIFFERENCE from an AI-STARTED workflow's own later turns (which DO auto-apply -
// Section 9's own "live sync, not wait until the end of the conversation" requirement - the user
// already explicitly asked AI to fill that one). Same real-module VM sandbox convention as
// tests/companion-explain-mode.test.mjs: only fetch/DOM faked, chat-dock-core.js and its real
// dependencies run unmodified.

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

async function coreSandbox(overrides = {}) {
  const document = { documentElement: { lang: 'en' } };
  const fetchCalls = [];
  const fetchFn = overrides.fetch || (async (url, options) => {
    fetchCalls.push([url, options ? JSON.parse(options.body) : null]);
    return {
      ok: true,
      json: async () => (overrides.response || { reply: 'ok', suggestions: [], provider: 'openai', model: 'gpt-test', usage: { totalTokens: 8 } })
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
// to change.
function registerForm(window, id, allowlist) {
  const applied = [];
  window.TradeJournalAIProcessRegistry.register(id, {
    allowlist,
    isOpen: () => true,
    applyValue: (path, value, mode) => applied.push([path, value, mode])
  });
  return applied;
}

// 'trade-wizard' (the exact same real, non-excluded id ai-dock-chat-actions.test.mjs's own first
// test already uses for "an already-open form") - a genuinely eligible "the user took a
// deliberate fill-this-out gesture" surface, distinct from the passive/ambient Pattern/Strategy-
// editor-shaped ids excluded below.
test('a MANUALLY-opened, genuinely eligible form (registered, never started via any ai-workflow) is sent as activeProcess with its own real allowlist, and availableActions is never offered alongside it - never a second, competing discovery path', async () => {
  const { window, fetchCalls } = await coreSandbox();
  registerForm(window, 'trade-wizard', ['entryPrice', 'stopLoss']);

  await window.TradeJournalChatDockCore.sendChat({ text: 'set the entry price to 100', therapistMode: false, transcript: [] });

  const [, body] = fetchCalls[0];
  assert.deepEqual(body.activeProcess, { id: 'trade-wizard', allowlist: ['entryPrice', 'stopLoss'] });
  assert.equal(body.availableActions, undefined);
});

test('when the model proposes suggestions for that manually-opened form, sendChat() returns them untouched for the popover to review - it never calls the form\'s own applyValue() itself, "manual form adoption" only ever seeds a review, it does not silently write', async () => {
  const suggestion = { path: 'entryPrice', value: '100' };
  const { window } = await coreSandbox({
    response: { reply: 'Want me to set the entry price to 100?', suggestions: [suggestion], provider: 'openai', model: 'gpt-test', usage: { totalTokens: 10 } }
  });
  const applied = registerForm(window, 'trade-wizard', ['entryPrice', 'stopLoss']);

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'entry price 100', therapistMode: false, transcript: [] });

  assert.equal(result.kind, 'assistant', 'a manually-opened form with no ai-workflow behind it is never treated as a workflow turn');
  assert.deepEqual(result.suggestions, [suggestion]);
  assert.deepEqual(applied, [], 'the real form\'s applyValue() must not be called until the user explicitly approves the suggestion');
  assert.equal(window.TradeJournalAIWorkflowEngine.current(), null, 'no ai-workflow is fabricated just because a form happens to be open');
});

// A real, deliberate finding from this verification pass, not assumed: pattern-editor-{id}/
// strategy-editor-{id} (and message/comment/rating/settings/account-profile ids - see
// chat-dock-core.js's own regex) are NEVER adopted as activeProcess merely for being manually
// open (F27-31/F46, found via real browser testing that a Pattern simply being open otherwise
// permanently blocked marketplace.publish/message.reply/etc. from ever being discovered) - unless
// an ai-STARTED workflow is genuinely continuing through that exact same process. "Manual form
// adoption" for these specific surfaces is therefore INTENTIONALLY narrower than the execution
// brief's own wording could suggest read in isolation: fresh action discovery wins over adopting
// a passively-open editor, by design, with real regression coverage of its own already.
test('a MANUALLY-opened Pattern/Strategy editor (or thread/comment/rating/settings/account-profile surface) is deliberately NEVER adopted as activeProcess merely for being open - fresh action discovery must still win, so e.g. marketplace.publish/pattern.create remain discoverable while one is simply showing', async () => {
  const { window, fetchCalls } = await coreSandbox();
  registerForm(window, 'strategy-editor-just-open', ['name', 'description']);

  await window.TradeJournalChatDockCore.sendChat({ text: 'set the name to Breakout', therapistMode: false, transcript: [] });

  const [, body] = fetchCalls[0];
  assert.equal(body.activeProcess, null, 'a merely-open Pattern/Strategy editor must not be adopted - it is a passive/ambient signal, not a deliberate fill-this-out gesture');
});

test('contrast: once the SAME pattern/strategy-editor-shaped process was actually opened by an ai-STARTED workflow (not manually), a later turn\'s suggestions DO auto-apply directly through that continuing workflow - the real, deliberate difference between native AI continuation and a passively-open editor, not an inconsistency', async () => {
  const { window } = await coreSandbox({
    response: { reply: 'Setting the risk to 1%.', suggestions: [{ path: 'riskManagement.maxRiskPerTradePercent', value: '1' }], provider: 'openai', model: 'gpt-test', usage: { totalTokens: 10 } }
  });
  const applied = registerForm(window, 'strategy-editor-ai-started', ['name', 'riskManagement.maxRiskPerTradePercent']);
  // Simulate the action having genuinely been started by AI on an earlier turn (the same real
  // ai-workflow-engine.js start() every action's open() flows through - see character-app.jsx's
  // strategy.create) - including letting its own pendingOpen resolve, exactly as sendChat()'s own
  // first-turn applyKnownFields() call already does for a brand-new action (see that function's
  // own comment on why processId is a placeholder until then).
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'strategy.create', domain: 'strategies', riskLevel: 'low', entityAlreadyPersisted: true,
    requiredFields: ['name'], optionalFields: ['riskManagement.maxRiskPerTradePercent'],
    available: () => true,
    open: () => Promise.resolve({ processId: 'strategy-editor-ai-started' }),
    submit: () => undefined, resultContext: () => {}
  });
  window.TradeJournalAIWorkflowEngine.start('strategy.create', {}, [{ path: 'name', value: 'Breakout' }]);
  await window.TradeJournalAIWorkflowEngine.applyKnownFields([{ path: 'name', value: 'Breakout' }], {});
  applied.length = 0; // clear this setup call's own applyValue record - only the turn under test matters below

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'set max risk to 1 percent', therapistMode: false, transcript: [] });

  assert.equal(result.kind, 'workflow', 'a continuing AI-started workflow IS a workflow turn, unlike a purely manually-opened editor');
  assert.deepEqual(applied.map((a) => [a[0], a[1]]), [['riskManagement.maxRiskPerTradePercent', '1']], 'the AI-started workflow\'s own later-turn fields auto-apply directly - the user already explicitly asked AI to fill this one');
});

test('core.applySuggestion(processId, path, value, mode) - the popover\'s own explicit Apply button - binds to the EXACT process instance and calls its real applyValue() with the EXACT suggestion, never a different one', async () => {
  const { window } = await coreSandbox();
  const applied = registerForm(window, 'strategy-editor-manual-3', ['name']);
  const other = registerForm(window, 'strategy-editor-manual-4', ['name']);

  window.TradeJournalChatDockCore.applySuggestion('strategy-editor-manual-3', 'name', 'Breakout Retest', 'replace');

  assert.deepEqual(applied, [['name', 'Breakout Retest', 'replace']]);
  assert.deepEqual(other, [], 'a suggestion bound to one process instance must never leak onto a different one, even with the same allowlist shape');
});
