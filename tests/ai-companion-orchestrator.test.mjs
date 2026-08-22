import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Journey G (AI Companion & Journey Orchestration) - ai-companion-orchestrator.js's own thin,
// deterministic glue: currentCard()/welcome, Continue/Later/Skip routing into the real engine/
// profile store, and event-driven (never polling) republish. The real engine/profile are faked
// here (already covered in tests/ai-journey-engine.test.mjs and
// tests/companion-profile-sync.test.mjs) so this file only asserts the orchestrator's own wiring.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

// A minimal, controllable clock - ai-companion-orchestrator.js only ever calls Date.now(), never
// `new Date(...)`, so a bare { now } object is a complete, safe substitute inside the sandbox.
function fakeClock(startMs) {
  let current = startMs || 1000000000000;
  return { Date: { now: () => current }, advance: (ms) => { current += ms; } };
}

function buildSandbox(overrides = {}) {
  const listeners = {};
  const dispatched = [];
  const clock = overrides.clock || fakeClock();
  const sandbox = {
    window: {}, Date: clock.Date, Math, JSON, console,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, {
    addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); },
    dispatchEvent: (event) => { dispatched.push(event.type); (listeners[event.type] || []).forEach((fn) => fn(event)); },
    TradeJournalAII18n: { t: (key) => key },
    TradeJournalAIJourneyEngine: overrides.journeyEngine || { nextBestStep: () => null, dedupeKeyFor: (id) => 'journey:' + id, executeStep: () => {} },
    TradeJournalAICompanionProfile: overrides.profileStore || { hasSeenWalkthrough: () => true, initiativePreference: () => 'normal', setWalkthroughSeen() {}, dismissStep() {}, skipOptionalStep() {}, setCurrentGoal() {} }
  });
  return { sandbox, listeners, dispatched, clock };
}

async function loadOrchestrator(overrides) {
  const { sandbox, listeners, dispatched, clock } = buildSandbox(overrides);
  vm.runInNewContext(await source('ai-companion-orchestrator.js'), sandbox, { filename: 'ai-companion-orchestrator.js' });
  return { orchestrator: sandbox.window.TradeJournalAICompanionOrchestrator, listeners, dispatched, window: sandbox.window, clock };
}

test('currentCard() shows the one-time welcome card before the walkthrough has ever been seen, and nothing else', async () => {
  const { orchestrator } = await loadOrchestrator({ profileStore: { hasSeenWalkthrough: () => false } });
  const card = orchestrator.currentCard();
  assert.equal(card.kind, 'welcome');
});

test('currentCard() falls through to the real Journey Engine step once the walkthrough has been seen', async () => {
  const { orchestrator } = await loadOrchestrator({
    profileStore: { hasSeenWalkthrough: () => true },
    journeyEngine: { nextBestStep: () => ({ id: 'pattern_create', dedupeKey: 'journey:pattern_create', optional: false, title: 'T', why: 'W', explainPrompt: 'E' }) }
  });
  const card = orchestrator.currentCard();
  assert.equal(card.kind, 'step');
  assert.equal(card.id, 'pattern_create');
});

test('currentCard() is null (a legitimate quiet outcome) when the walkthrough is seen and nothing is next', async () => {
  const { orchestrator } = await loadOrchestrator({ profileStore: { hasSeenWalkthrough: () => true } });
  assert.equal(orchestrator.currentCard(), null);
});

test('startWalkthrough() marks it seen and republishes tradejournal:companion-updated', async () => {
  const calls = [];
  const { orchestrator, dispatched } = await loadOrchestrator({
    profileStore: { hasSeenWalkthrough: () => false, setWalkthroughSeen: () => calls.push('seen') }
  });
  orchestrator.startWalkthrough();
  assert.deepEqual(calls, ['seen']);
  assert.ok(dispatched.includes('tradejournal:companion-updated'));
});

test('continueStep() calls straight into the engine\'s executeStep() with the real stepId - fully deterministic, no chat turn', async () => {
  const calls = [];
  const { orchestrator } = await loadOrchestrator({
    journeyEngine: { nextBestStep: () => null, dedupeKeyFor: (id) => 'journey:' + id, executeStep: (id, ctx) => calls.push([id, ctx]) }
  });
  orchestrator.continueStep('pattern_create', { some: 'context' });
  assert.deepEqual(calls, [['pattern_create', { some: 'context' }]]);
});

test('laterStep() dismisses the step by its real dedupe key from the engine, never a bare id', async () => {
  const calls = [];
  const { orchestrator } = await loadOrchestrator({
    journeyEngine: { nextBestStep: () => null, dedupeKeyFor: (id) => 'journey:' + id + ':v2', executeStep: () => {} },
    profileStore: { hasSeenWalkthrough: () => true, dismissStep: (key) => calls.push(key) }
  });
  orchestrator.laterStep('pattern_report');
  assert.deepEqual(calls, ['journey:pattern_report:v2']);
});

test('skipStep() marks the step skipped via the profile store', async () => {
  const calls = [];
  const { orchestrator } = await loadOrchestrator({ profileStore: { hasSeenWalkthrough: () => true, skipOptionalStep: (id) => calls.push(id) } });
  orchestrator.skipStep('intake');
  assert.deepEqual(calls, ['intake']);
});

test('init() wires exactly one listener per real product-state event, and is idempotent when called twice', async () => {
  const { listeners } = await loadOrchestrator({});
  const watched = ['tradejournal:trades-changed', 'tradejournal:sessions-changed', 'tradejournal:patterns-changed', 'tradejournal:strategy-education-changed', 'tradejournal:mental-health-changed', 'tradejournal:companion-state-changed'];
  watched.forEach((name) => assert.equal((listeners[name] || []).length, 1, name + ' must have exactly one listener after module load (init() runs once automatically)'));
});

test('a real product-state event (e.g. trades-changed) republishes tradejournal:companion-updated exactly once per firing', async () => {
  const { dispatched, listeners } = await loadOrchestrator({});
  const before = dispatched.filter((t) => t === 'tradejournal:companion-updated').length;
  listeners['tradejournal:trades-changed'].forEach((fn) => fn());
  const after = dispatched.filter((t) => t === 'tradejournal:companion-updated').length;
  assert.equal(after - before, 1);
});

// --- Item 2 of the Journey G follow-up: the cooldown half of Low/Normal/High (the tier gating
// itself lives in, and is tested by, ai-journey-engine.js/ai-journey-engine.test.mjs) ---

function mutableStepEngine(initial) {
  let current = initial;
  return { set: (step) => { current = step; }, engine: { nextBestStep: () => current, dedupeKeyFor: (id) => 'journey:' + id, executeStep: () => {} } };
}
const STEP_A = { id: 'pattern_create', dedupeKey: 'journey:pattern_create', optional: false, title: 'A', why: 'A', explainPrompt: 'A' };
const STEP_B = { id: 'strategy_create', dedupeKey: 'journey:strategy_create', optional: false, title: 'B', why: 'B', explainPrompt: 'B' };
const OPEN_TRADE_STEP = { id: 'open_trade_attention', dedupeKey: 'journey:open_trade_attention:t1', optional: true, title: 'Open Trade', why: 'W', explainPrompt: 'E' };

test('Normal initiative: a background switch to a genuinely different step is held back until its 15-minute cooldown elapses', async () => {
  const mutable = mutableStepEngine(STEP_A);
  const { orchestrator, clock } = await loadOrchestrator({ journeyEngine: mutable.engine, profileStore: { hasSeenWalkthrough: () => true, initiativePreference: () => 'normal' } });
  assert.equal(orchestrator.currentCard().id, 'pattern_create', 'the very first card of a session shows immediately, never cooldown-blocked');
  mutable.set(STEP_B);
  clock.advance(5 * 60 * 1000); // 5 minutes - well under Normal's 15-minute cooldown
  assert.equal(orchestrator.currentCard(), null, 'a different, non-contextual step must stay quiet within the cooldown window');
  clock.advance(11 * 60 * 1000); // total 16 minutes - past the cooldown
  assert.equal(orchestrator.currentCard().id, 'strategy_create');
});

test('High initiative uses a real, shorter cooldown than Normal - not zero, and not the same as Normal', async () => {
  const mutable = mutableStepEngine(STEP_A);
  const { orchestrator, clock } = await loadOrchestrator({ journeyEngine: mutable.engine, profileStore: { hasSeenWalkthrough: () => true, initiativePreference: () => 'high' } });
  orchestrator.currentCard();
  mutable.set(STEP_B);
  clock.advance(1 * 60 * 1000); // 1 minute - under High's shorter cooldown
  assert.equal(orchestrator.currentCard(), null, 'High still has a real cooldown, not zero/instant');
  clock.advance(3 * 60 * 1000); // total 4 minutes - past High's cooldown, still under Normal's
  assert.equal(orchestrator.currentCard().id, 'strategy_create', 'High\'s cooldown is genuinely shorter than Normal\'s 15 minutes');
});

test('a contextual step (an open Trade) always bypasses cooldown, even zero seconds after a different card was shown', async () => {
  const mutable = mutableStepEngine(STEP_A);
  const { orchestrator, clock } = await loadOrchestrator({ journeyEngine: mutable.engine });
  orchestrator.currentCard();
  mutable.set(OPEN_TRADE_STEP);
  clock.advance(1); // effectively no time has passed
  assert.equal(orchestrator.currentCard().id, 'open_trade_attention', 'a real lifecycle moment must never wait behind a cooldown');
});

test('a user-driven interaction (Continue/Later/Skip) resets the cooldown so the very next card shows immediately', async () => {
  const mutable = mutableStepEngine(STEP_A);
  const { orchestrator } = await loadOrchestrator({ journeyEngine: mutable.engine });
  orchestrator.currentCard();
  mutable.set(STEP_B);
  orchestrator.continueStep('pattern_create'); // the user just acted on the Companion
  assert.equal(orchestrator.currentCard().id, 'strategy_create', 'a user-driven transition must never be throttled by the same cooldown meant for unprompted background changes');
});

test('showing the SAME step again (nothing changed) is never cooldown-blocked, at any initiative', async () => {
  const mutable = mutableStepEngine(STEP_A);
  const { orchestrator } = await loadOrchestrator({ journeyEngine: mutable.engine, profileStore: { hasSeenWalkthrough: () => true, initiativePreference: () => 'normal' } });
  assert.equal(orchestrator.currentCard().id, 'pattern_create');
  assert.equal(orchestrator.currentCard().id, 'pattern_create', 'the identical step must keep showing regardless of elapsed time');
});

// ===============================================================================================
// Journey G UX correction: the Voice Companion opening. voiceOpening()/interpretVoiceOpeningReply()
// /resolveVoiceOpeningChoice() - see docs/ai/companion-orchestration.md's "Voice Companion opening"
// section. journeyEngine here additionally fakes voiceOpeningContext(), the one small real-fact
// snapshot these functions read - never a second, parallel derivation.
// ===============================================================================================
function voiceEngine(overrides) {
  return Object.assign({
    nextBestStep: () => null, dedupeKeyFor: (id) => 'journey:' + id, executeStep: () => {},
    voiceOpeningContext: () => ({ blocked: false, openTradeId: null, reflectionDueTradeId: null, openSessionId: null, hasSeenWalkthrough: true })
  }, overrides || {});
}

test('voiceOpening(): a genuinely fresh user (walkthrough not seen) gets the onboarding welcome, and it is marked seen immediately (not waiting for a reply)', async () => {
  const seenCalls = [];
  const { orchestrator } = await loadOrchestrator({
    journeyEngine: voiceEngine({ voiceOpeningContext: () => ({ blocked: false, openTradeId: null, reflectionDueTradeId: null, openSessionId: null, hasSeenWalkthrough: false }) }),
    profileStore: { hasSeenWalkthrough: () => false, setWalkthroughSeen: () => seenCalls.push(true) }
  });
  const opening = orchestrator.voiceOpening();
  assert.equal(opening.kind, 'freshWelcome');
  assert.equal(opening.text, 'voiceOpeningFreshWelcome');
  assert.deepEqual(seenCalls, [true], 'marked seen the moment NAVRYA decides to speak it, before any reply');
});

test('voiceOpening(): an active open Trade outranks everything else, including a fresh/unseen walkthrough', async () => {
  const { orchestrator } = await loadOrchestrator({
    journeyEngine: voiceEngine({ voiceOpeningContext: () => ({ blocked: false, openTradeId: 't1', reflectionDueTradeId: null, openSessionId: null, hasSeenWalkthrough: false }) })
  });
  const opening = orchestrator.voiceOpening();
  assert.equal(opening.kind, 'activeTrade');
  assert.equal(opening.text, 'voiceOpeningActiveTrade');
});

test('voiceOpening(): a due Reflection outranks an open Session and the returning-neutral greeting', async () => {
  const { orchestrator } = await loadOrchestrator({
    journeyEngine: voiceEngine({ voiceOpeningContext: () => ({ blocked: false, openTradeId: null, reflectionDueTradeId: 't2', openSessionId: 's1', hasSeenWalkthrough: true }) })
  });
  assert.equal(orchestrator.voiceOpening().kind, 'dueReflection');
});

test('voiceOpening(): an open Session (no Trade/Reflection due) gets the contextual session greeting', async () => {
  const { orchestrator } = await loadOrchestrator({
    journeyEngine: voiceEngine({ voiceOpeningContext: () => ({ blocked: false, openTradeId: null, reflectionDueTradeId: null, openSessionId: 's1', hasSeenWalkthrough: true }) })
  });
  assert.equal(orchestrator.voiceOpening().kind, 'activeSession');
});

test('voiceOpening(): a returning user with no urgent context gets the short neutral greeting - never the onboarding welcome again', async () => {
  const { orchestrator } = await loadOrchestrator({ journeyEngine: voiceEngine() });
  const opening = orchestrator.voiceOpening();
  assert.equal(opening.kind, 'returningNeutral');
  assert.equal(opening.text, 'voiceOpeningReturningNeutral');
});

test('voiceOpening(): returns null (stays silent) when the underlying Journey context is blocked - a pending confirmation/active workflow, mirroring nextBestStep()\'s own safety gate', async () => {
  const { orchestrator } = await loadOrchestrator({ journeyEngine: voiceEngine({ voiceOpeningContext: () => ({ blocked: true }) }) });
  assert.equal(orchestrator.voiceOpening(), null);
});

test('voiceOpening(): calling it a second time for what was a fresh user never repeats the onboarding greeting - it already marked itself seen on the first call', async () => {
  let seen = false;
  const { orchestrator } = await loadOrchestrator({
    journeyEngine: voiceEngine({ voiceOpeningContext: () => ({ blocked: false, openTradeId: null, reflectionDueTradeId: null, openSessionId: null, hasSeenWalkthrough: !seen ? false : true }) }),
    profileStore: { hasSeenWalkthrough: () => seen, setWalkthroughSeen: () => { seen = true; } }
  });
  assert.equal(orchestrator.voiceOpening().kind, 'freshWelcome');
  assert.equal(orchestrator.voiceOpening().kind, 'returningNeutral', 'a second Voice activation must never repeat the same onboarding greeting');
});

test('interpretVoiceOpeningReply(): EN/FA Start/Later/Explain are classified deterministically; AR/ES and anything ambiguous return null', async () => {
  const { orchestrator } = await loadOrchestrator({});
  assert.equal(orchestrator.interpretVoiceOpeningReply('Yes, let\'s start'), 'start');
  assert.equal(orchestrator.interpretVoiceOpeningReply('sure'), 'start');
  assert.equal(orchestrator.interpretVoiceOpeningReply('شروع کنیم'), 'start');
  assert.equal(orchestrator.interpretVoiceOpeningReply('بله'), 'start');
  assert.equal(orchestrator.interpretVoiceOpeningReply('not now'), 'later');
  assert.equal(orchestrator.interpretVoiceOpeningReply('بعداً'), 'later');
  assert.equal(orchestrator.interpretVoiceOpeningReply('what is NAVRYA?'), 'explain');
  assert.equal(orchestrator.interpretVoiceOpeningReply('NAVRYA چیه؟'), 'explain');
  assert.equal(orchestrator.interpretVoiceOpeningReply('¿qué es NAVRYA?'), null, 'Spanish falls through to the one ordinary AI turn, not a false deterministic match');
  assert.equal(orchestrator.interpretVoiceOpeningReply('ما هو نافريا؟'), null, 'Arabic falls through the same way');
  assert.equal(orchestrator.interpretVoiceOpeningReply('tell me about my last trade'), null, 'genuinely ambiguous EN text must not be forced into start/later');
});

test('resolveVoiceOpeningChoice("start") re-reads nextBestStep() fresh and calls continueStep() with whatever it currently is - never a hardcoded target', async () => {
  const calls = [];
  const mutable = mutableStepEngine(STEP_A);
  const { orchestrator } = await loadOrchestrator({ journeyEngine: Object.assign(mutable.engine, { executeStep: (id) => calls.push(id) }) });
  const result = orchestrator.resolveVoiceOpeningChoice('start');
  assert.deepEqual(calls, ['pattern_create']);
  assert.equal(result.text, 'voiceOpeningStartAck');

  calls.length = 0;
  mutable.set(STEP_B);
  orchestrator.resolveVoiceOpeningChoice('start');
  assert.deepEqual(calls, ['strategy_create'], 'a later "start" call must reflect the CURRENT real next step, not a value cached from the first call');
});

test('resolveVoiceOpeningChoice("start") acknowledges gracefully with no real step to continue into (fully caught up)', async () => {
  const { orchestrator } = await loadOrchestrator({ journeyEngine: voiceEngine() });
  const result = orchestrator.resolveVoiceOpeningChoice('start');
  assert.equal(result.text, 'voiceOpeningStartAck');
});

test('resolveVoiceOpeningChoice("later") dismisses whatever step card is currently showing via the real dedupe key, and acknowledges', async () => {
  const calls = [];
  const mutable = mutableStepEngine(STEP_A);
  const { orchestrator } = await loadOrchestrator({
    journeyEngine: Object.assign(mutable.engine, { dedupeKeyFor: (id) => 'journey:' + id + ':v1' }),
    profileStore: { hasSeenWalkthrough: () => true, initiativePreference: () => 'normal', dismissStep: (key) => calls.push(key) }
  });
  const result = orchestrator.resolveVoiceOpeningChoice('later');
  assert.deepEqual(calls, ['journey:pattern_create:v1']);
  assert.equal(result.text, 'voiceOpeningLaterAck');
});
