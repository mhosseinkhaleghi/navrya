import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

// Objects/arrays built inside the vm sandbox (workflow state, `known`, `missing`) carry that
// realm's own Object/Array.prototype, so assert.deepEqual (node:assert/strict's
// deepStrictEqual, prototype-sensitive) reports "same structure but not reference-equal" even
// when every field matches - the same caveat tests/ai-process-registry.test.mjs's own comments
// call out. Round-tripping through JSON rebuilds the value with this file's own realm's plain
// prototypes before comparing.
const clone = value => JSON.parse(JSON.stringify(value));

async function engineSandbox(overrides) {
  const sandbox = { window: {}, Promise, Set, Date, setTimeout, clearTimeout };
  sandbox.window = Object.assign(sandbox.window, {
    TradeJournalAIActionRegistry: overrides.actionRegistry,
    TradeJournalAIProcessRegistry: overrides.processRegistry,
    TradeJournalAIUiRevisionGuard: overrides.uiRevisionGuard
  });
  vm.runInNewContext(await source('ai-workflow-engine.js'), sandbox, { filename: 'ai-workflow-engine.js' });
  return sandbox.window.TradeJournalAIWorkflowEngine;
}

function fakeActionRegistry(action) {
  return { get: (id) => (id === action.id ? action : null) };
}

test('start() looks up the action, calls its open(context), and seeds missing from requiredFields', async () => {
  const openCalls = [];
  const action = { id: 'session.create', requiredFields: ['city', 'timeframe'], open: (context) => openCalls.push(context) };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action) });
  const context = { navigation: { activeId: 'dashboard' } };
  const workflow = engine.start('session.create', context);
  assert.deepEqual(openCalls, [context]);
  assert.equal(workflow.actionId, 'session.create');
  assert.equal(workflow.processId, 'session-create');
  assert.equal(workflow.status, 'collecting');
  assert.deepEqual(clone(workflow.missing), ['city', 'timeframe']);
  assert.deepEqual(clone(workflow.known), {});
});

test('start() returns null and sets no workflow for an unknown actionId', async () => {
  const engine = await engineSandbox({ actionRegistry: { get: () => null } });
  assert.equal(engine.start('nothing.here', {}), null);
  assert.equal(engine.current(), null);
});

test('start() survives (and still returns a usable workflow) even if open() itself throws', async () => {
  const action = { id: 'session.create', requiredFields: ['city'], open: () => { throw new Error('navigation failed'); } };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action) });
  const workflow = engine.start('session.create', {});
  assert.equal(workflow.status, 'collecting');
});

// Journey F: pattern.create/strategy.create-shaped actions target a process id that only exists
// after open() creates a brand-new entity (PatternStore.create() -> 'pattern-editor-' + realId) -
// processIdFor(actionId) alone can never express that. open() may return (or resolve to) an
// object with a `processId` field to override the default; start() itself stays synchronous
// (existing callers rely on that), the override is resolved lazily on the first
// applyKnownFields() call instead.
test('start() stays synchronous even when open() is async - the workflow is usable immediately, before open() has resolved', async () => {
  let resolveOpen;
  const action = {
    id: 'pattern.create', requiredFields: ['name'],
    open: () => new Promise((resolve) => { resolveOpen = resolve; })
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action) });
  const workflow = engine.start('pattern.create', {}); // NOT awaited - open() has not resolved yet
  assert.equal(workflow.actionId, 'pattern.create');
  assert.equal(workflow.processId, 'pattern-create', 'the default mapping, until open() resolves with an override');
  resolveOpen({ processId: 'pattern-editor-p1' });
});

// Journey F, second slice: pattern.edit-shaped actions must RESOLVE which real entity to open
// (by name) before open() can do anything - and that name is only ever known via this turn's own
// extraction, never via `known` (which applyKnownFields() alone still owns). start() now passes
// this turn's fields straight through to open() as a second argument for exactly this reason.
test('start() passes initialFields straight through to open() as a second argument, without writing them into workflow.known itself', async () => {
  const openCalls = [];
  const action = { id: 'pattern.edit', requiredFields: ['patternName'], open: (context, initialFields) => openCalls.push(initialFields) };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action) });
  const fields = [{ path: 'patternName', value: 'Liquidity Sweep' }];
  const workflow = engine.start('pattern.edit', {}, fields);
  assert.deepEqual(openCalls, [fields]);
  assert.deepEqual(clone(workflow.known), {}, 'known is still applyKnownFields()\'s own job - start() must not pre-populate it itself');
});

test('start() called the old two-argument way (no initialFields) still passes undefined through to open() - every pre-existing action ignores the extra argument', async () => {
  const openCalls = [];
  const action = { id: 'session.create', requiredFields: ['city'], open: (context, initialFields) => openCalls.push(initialFields) };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action) });
  engine.start('session.create', {});
  assert.deepEqual(openCalls, [undefined]);
});

// Found via real F15 (Strategy) browser testing: pattern.create/pattern.edit/strategy.create/
// strategy.edit all declare entityAlreadyPersisted (their submit() is already a no-op - the real
// entity persists the instant open() creates/resolves it). Before this fix, the moment the sole
// required field (often just 'name') became known, the SAME grace-window-then-clear machinery
// session.create's own real "time to persist now" moment uses fired here too - purely a leftover
// workflow.status bookkeeping formality for these actions, but clearing `current` to null meant a
// slower follow-up turn ("Set max risk to 1%." arriving a beat after the ~3s grace window) found
// no workflow left to continue, fell back to fresh action-discovery, and lost the field.
test('an action declaring entityAlreadyPersisted never schedules a submit once required fields complete - it just stays collecting so later turns keep landing on the same live workflow', async () => {
  const submitCalls = [];
  const action = {
    id: 'pattern.create', requiredFields: ['name'], entityAlreadyPersisted: true,
    submit: async (known) => { submitCalls.push(known); return { id: 'should-not-happen' }; }
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.setSubmitGraceMs(10);
  engine.start('pattern.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'name', value: 'Sweep' }], {});
  assert.equal(workflow.status, 'collecting', 'never transitions to pending-submit');
  await new Promise((resolve) => setTimeout(resolve, 40)); // well past the grace window
  assert.equal(submitCalls.length, 0, 'submit() must never be called - the real entity already persisted via open()');
  assert.ok(engine.current(), 'the workflow must still be live for a later turn to continue');
  assert.deepEqual(clone(engine.current().known), { name: 'Sweep' });
});

test('a later turn on an entityAlreadyPersisted workflow still applies a genuinely new field, arriving well after what would have been the old grace window', async () => {
  const applyCalls = [];
  const action = { id: 'strategy.create', requiredFields: ['name'], entityAlreadyPersisted: true, optionalFields: ['riskManagement.maxRiskPerTradePercent'] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: (...args) => applyCalls.push(args) } });
  engine.setSubmitGraceMs(10);
  engine.start('strategy.create', {});
  await engine.applyKnownFields([{ path: 'name', value: 'NY Reversal' }], {});
  await new Promise((resolve) => setTimeout(resolve, 40)); // well past the old grace window
  const workflow = await engine.applyKnownFields([{ path: 'riskManagement.maxRiskPerTradePercent', value: '1' }], {});
  assert.deepEqual(clone(workflow.known), { name: 'NY Reversal', 'riskManagement.maxRiskPerTradePercent': '1' });
  assert.deepEqual(clone(applyCalls), [
    ['strategy-create', 'name', 'NY Reversal', 'replace'],
    ['strategy-create', 'riskManagement.maxRiskPerTradePercent', '1', 'replace']
  ]);
});

test('an action that does NOT declare entityAlreadyPersisted keeps the existing auto-submit-then-clear behavior unchanged - only an explicit opt-in changes anything', async () => {
  const submitCalls = [];
  const action = {
    id: 'session.create', requiredFields: ['city'],
    submit: async (known) => { submitCalls.push(known); return { id: 'session-1' }; }
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.setSubmitGraceMs(10);
  engine.start('session.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.equal(workflow.status, 'pending-submit');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(clone(submitCalls), [{ city: 'New York' }]);
  assert.equal(engine.current(), null, 'still clears exactly as before for an action that never opted in');
});

test('applyKnownFields() resolves open()\'s returned {processId} and uses it (not the default actionId mapping) for the real UI sync', async () => {
  const applyCalls = [];
  const action = {
    id: 'pattern.create', requiredFields: ['name'],
    open: async () => ({ processId: 'pattern-editor-p1' })
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: (...args) => applyCalls.push(args) } });
  engine.start('pattern.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'name', value: 'Liquidity Sweep' }], {});
  assert.equal(workflow.processId, 'pattern-editor-p1');
  assert.deepEqual(clone(applyCalls), [['pattern-editor-p1', 'name', 'Liquidity Sweep', 'replace']]);
});

test('an action whose open() returns nothing (every pre-Journey-F action) keeps the default processId mapping unchanged', async () => {
  const applyCalls = [];
  const action = { id: 'session.create', requiredFields: ['city'], open: () => undefined };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: (...args) => applyCalls.push(args) } });
  engine.start('session.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.equal(workflow.processId, 'session-create');
  assert.deepEqual(clone(applyCalls), [['session-create', 'city', 'New York', 'replace']]);
});

test('open()\'s processId override is only ever resolved once - a second applyKnownFields() call does not re-await it or overwrite an already-resolved processId', async () => {
  let openCallCount = 0;
  const action = {
    id: 'pattern.create', requiredFields: ['name', 'description'],
    open: async () => { openCallCount += 1; return { processId: 'pattern-editor-p1' }; }
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.start('pattern.create', {});
  await engine.applyKnownFields([{ path: 'name', value: 'Sweep' }], {});
  const workflow = await engine.applyKnownFields([{ path: 'description', value: 'A liquidity sweep pattern' }], {});
  assert.equal(openCallCount, 1, 'open() must only ever be called once per workflow, by start() itself');
  assert.equal(workflow.processId, 'pattern-editor-p1');
});

test('applyKnownFields() tolerates open() rejecting asynchronously (a real navigation/mount failure) - the workflow keeps the default processId rather than throwing', async () => {
  const applyCalls = [];
  const action = {
    id: 'pattern.create', requiredFields: ['name'],
    open: async () => { throw new Error('Strategies Hub never mounted'); }
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: (...args) => applyCalls.push(args) } });
  engine.start('pattern.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'name', value: 'Sweep' }], {});
  assert.equal(workflow.processId, 'pattern-create', 'falls back to the default mapping, matching start()\'s own synchronous-throw handling');
  assert.deepEqual(clone(applyCalls), [['pattern-create', 'name', 'Sweep', 'replace']]);
});

test('applyKnownFields() merges known fields and calls TradeJournalAIProcessRegistry.applyValue for each - the live UI sync contract', async () => {
  const applyCalls = [];
  const action = { id: 'session.create', requiredFields: ['city', 'timeframe'], submit: async () => ({ id: 'session-1' }), resultContext: () => {} };
  const engine = await engineSandbox({
    actionRegistry: fakeActionRegistry(action),
    processRegistry: { applyValue: (...args) => applyCalls.push(args) }
  });
  engine.start('session.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.deepEqual(clone(applyCalls), [['session-create', 'city', 'New York', 'replace']]);
  assert.deepEqual(clone(workflow.known), { city: 'New York' });
  assert.deepEqual(clone(workflow.missing), ['timeframe'], 'timeframe is still missing, city no longer is');
});

// Found via real end-to-end browser testing: the model can just as reasonably extract "15
// minutes" as "15m" for a field a real dropdown only accepts one exact spelling for. Without
// this, a non-empty-but-invalid value still counted as "known", live-applied verbatim, and could
// even complete the required set and auto-submit a session with a value the real UI never
// actually offers.
test('applyKnownFields() runs each value through action.normalizeField() before treating it as known', async () => {
  const applyCalls = [];
  const action = {
    id: 'session.create', requiredFields: ['city', 'timeframe'],
    normalizeField: (path, value) => (path === 'timeframe' && value === '15 minutes' ? '15m' : value)
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: (...args) => applyCalls.push(args) } });
  engine.start('session.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'timeframe', value: '15 minutes' }], {});
  assert.deepEqual(clone(applyCalls), [['session-create', 'timeframe', '15m', 'replace']], 'the real UI must receive the normalized value, not the raw one');
  assert.deepEqual(clone(workflow.known), { timeframe: '15m' });
});

test('applyKnownFields() leaves a field missing (never applies it, never submits) when normalizeField rejects the value as invalid', async () => {
  const applyCalls = [];
  const submitCalls = [];
  const action = {
    id: 'session.create', requiredFields: ['city', 'timeframe'],
    normalizeField: (path, value) => (path === 'timeframe' ? null : value),
    submit: async (known) => { submitCalls.push(known); return { id: 'should-not-happen' }; }
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: (...args) => applyCalls.push(args) } });
  engine.start('session.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'city', value: 'New York' }, { path: 'timeframe', value: 'garbled' }], {});
  assert.deepEqual(clone(applyCalls), [['session-create', 'city', 'New York', 'replace']], 'the rejected field must never reach the real UI');
  assert.deepEqual(clone(workflow.missing), ['timeframe'], 'a rejected value leaves the field missing, not "known but wrong"');
  assert.equal(submitCalls.length, 0, 'submit must not fire while a required field was rejected by normalization');
});

test('applyKnownFields() skips re-applying a field whose value is unchanged from what is already known - protects a manual edit from being silently clobbered by a re-echoed value', async () => {
  const applyCalls = [];
  const action = { id: 'session.create', requiredFields: ['city', 'timeframe'] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: (...args) => applyCalls.push(args) } });
  // This turn completes the required set, scheduling a submit - shrunk so it fires (harmlessly,
  // via the default noop submit) well before the test process would otherwise exit, rather than
  // leaving a 3s production-default timer pending in the background.
  engine.setSubmitGraceMs(10);
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  // The user now manually edits the real, still-open UI's city field to something else (out of
  // band - the workflow's own `known.city` is untouched by that). A later turn that only actually
  // supplied timeframe, but whose model response re-echoes the ORIGINAL city value, must not
  // reapply it and stomp the user's manual choice.
  const workflow = await engine.applyKnownFields([{ path: 'city', value: 'New York' }, { path: 'timeframe', value: '5m' }], {});
  assert.deepEqual(clone(applyCalls), [
    ['session-create', 'city', 'New York', 'replace'],
    ['session-create', 'timeframe', '5m', 'replace']
  ], 'city is only ever pushed to the real UI once - the second, identical value is suppressed');
  assert.deepEqual(clone(workflow.missing), []);
});

// Found while building Journey B: normalizeField() can return a compound value (an object/array),
// not just a scalar string - e.g. wrapping a single extracted target price into
// [{price,portionPercent}] for a takeProfits-shaped field. String() collapses any two
// plain-object arrays to the identical text "[object Object]", so a genuine correction (a new
// target price) would have been silently treated as an unchanged re-echo and dropped.
test('applyKnownFields() detects a genuine change in a compound (array/object) normalized value, not just a scalar one', async () => {
  const applyCalls = [];
  const action = {
    id: 'trade.startPlan', requiredFields: ['takeProfits'],
    normalizeField: (path, value) => (path === 'takeProfits' ? [{ price: Number(value), portionPercent: 100 }] : value)
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: (...args) => applyCalls.push(args) } });
  engine.start('trade.startPlan', {});
  await engine.applyKnownFields([{ path: 'takeProfits', value: '66000' }], {});
  await engine.applyKnownFields([{ path: 'takeProfits', value: '70000' }], {});
  assert.deepEqual(clone(applyCalls), [
    ['trade-startPlan', 'takeProfits', [{ price: 66000, portionPercent: 100 }], 'replace'],
    ['trade-startPlan', 'takeProfits', [{ price: 70000, portionPercent: 100 }], 'replace']
  ], 'a genuinely different target price must reach the real UI both times, not be swallowed as a false re-echo');
});

test('applyKnownFields() still applies a field whose value genuinely changes (a correction), even though the path was already known', async () => {
  const applyCalls = [];
  const action = { id: 'session.create', requiredFields: ['city', 'timeframe'] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: (...args) => applyCalls.push(args) } });
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'timeframe', value: '15m' }], {});
  await engine.applyKnownFields([{ path: 'timeframe', value: '5m' }], {});
  assert.deepEqual(clone(applyCalls), [
    ['session-create', 'timeframe', '15m', 'replace'],
    ['session-create', 'timeframe', '5m', 'replace']
  ], 'a genuine correction (a different value for an already-known path) must still reach the real UI');
});

test('applyKnownFields() ignores an empty/null value rather than treating a field as known', async () => {
  const action = { id: 'session.create', requiredFields: ['city'] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.start('session.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'city', value: '' }], {});
  assert.deepEqual(clone(workflow.missing), ['city']);
});

test('applyKnownFields() does not submit the instant the required set completes - it schedules a short, cancelable grace window first', async () => {
  const submitCalls = [];
  const action = {
    id: 'session.create', requiredFields: ['city', 'timeframe'],
    submit: async (known) => { submitCalls.push(known); return { id: 'session-1' }; }
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.setSubmitGraceMs(50);
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  const workflow = await engine.applyKnownFields([{ path: 'timeframe', value: '5m' }], {});
  assert.equal(workflow.status, 'pending-submit', 'the required set is complete, but submit must not have run yet');
  assert.equal(submitCalls.length, 0);
  assert.ok(engine.current(), 'the workflow is still live during the grace window');
});

test('applyKnownFields() auto-submits through action.submit() then action.resultContext() once the grace window elapses, and clears the workflow', async () => {
  const submitCalls = [];
  const resultContextCalls = [];
  const action = {
    id: 'session.create', requiredFields: ['city', 'timeframe'],
    submit: async (known) => { submitCalls.push(known); return { id: 'session-1' }; },
    resultContext: (result) => resultContextCalls.push(result)
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.setSubmitGraceMs(20);
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  await engine.applyKnownFields([{ path: 'timeframe', value: '5m' }], {});
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(clone(submitCalls), [{ city: 'New York', timeframe: '5m' }]);
  assert.deepEqual(clone(resultContextCalls), [{ id: 'session-1' }]);
  assert.equal(engine.current(), null, 'a completed workflow clears back to null once the scheduled submit actually runs');
});

// The exact scenario this grace window exists for: "15 minutes" immediately followed by "no,
// make that 5 minutes" - both turns complete the required set, but only the corrected value may
// ever reach submit(), and only once.
test('a correction that arrives during the grace window cancels the pending submit, re-arms a fresh one, and only the corrected value is ever submitted', async () => {
  const submitCalls = [];
  const action = {
    id: 'session.create', requiredFields: ['city', 'timeframe'],
    submit: async (known) => { submitCalls.push(known); return { id: 'session-1' }; }
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.setSubmitGraceMs(60);
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  await engine.applyKnownFields([{ path: 'timeframe', value: '15m' }], {});
  // Well inside the 60ms window - the correction lands before the first scheduled submit fires.
  await new Promise((resolve) => setTimeout(resolve, 20));
  await engine.applyKnownFields([{ path: 'timeframe', value: '5m' }], {});
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(clone(submitCalls), [{ city: 'New York', timeframe: '5m' }], 'exactly one submit, carrying only the corrected value');
});

// Found via real end-to-end testing: closing/cancelling the real dialog (its own X/Cancel button)
// was never routed through this engine's own cancel() - a workflow scheduled to submit during
// its grace window would still silently create the record a few seconds later, even though the
// user had visibly dismissed the UI in the meantime.
test('a scheduled submit checks TradeJournalAIProcessRegistry.query() right before firing, and treats "no longer open" (the user closed the real dialog) as an implicit cancel', async () => {
  const submitCalls = [];
  let processOpen = true;
  const action = {
    id: 'session.create', requiredFields: ['city'],
    submit: async (known) => { submitCalls.push(known); return { id: 'should-not-happen' }; }
  };
  const engine = await engineSandbox({
    actionRegistry: fakeActionRegistry(action),
    processRegistry: { applyValue: () => {}, query: () => ({ open: processOpen, step: null }) }
  });
  engine.setSubmitGraceMs(20);
  engine.start('session.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.equal(workflow.status, 'pending-submit');
  processOpen = false; // the user closed the real dialog during the grace window
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(submitCalls.length, 0, 'submit must never fire once the real UI it would act on is no longer open');
  assert.equal(engine.current(), null, 'the workflow clears rather than staying stuck pending-submit forever');
});

test('a scheduled submit still fires normally when the process reports itself open (the common case) or when no process registry is present to check', async () => {
  const submitCalls = [];
  const action = {
    id: 'session.create', requiredFields: ['city'],
    submit: async (known) => { submitCalls.push(known); return { id: 'session-1' }; }
  };
  const engine = await engineSandbox({
    actionRegistry: fakeActionRegistry(action),
    processRegistry: { applyValue: () => {}, query: () => ({ open: true, step: null }) }
  });
  engine.setSubmitGraceMs(20);
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(clone(submitCalls), [{ city: 'New York' }]);
});

test('a failing submit() leaves the workflow collecting (still holding every value already applied live) instead of losing state', async () => {
  const action = {
    id: 'session.create', requiredFields: ['city'],
    submit: async () => { throw new Error('server unreachable'); },
    resultContext: () => { throw new Error('must not be called when submit failed'); }
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.setSubmitGraceMs(10);
  engine.start('session.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.equal(workflow.status, 'pending-submit');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(engine.current().status, 'collecting', 'the failed submit attempt falls back to collecting, not lost');
  assert.deepEqual(clone(engine.current().known), { city: 'New York' });
});

// Found while building Journey B: tradeCalculatorModal.jsx's own real submit() is a plain,
// synchronous function (unlike session.create's, which always happens to return a promise) -
// scheduleSubmit() must recover from a submit() that throws synchronously exactly the same way
// it already recovers from a rejected async one, not leave the workflow stuck in 'submitting'.
test('a submit() that throws SYNCHRONOUSLY (not an async rejection) still falls back to collecting rather than leaving the workflow stuck', async () => {
  const action = {
    id: 'trade.calculator', requiredFields: ['direction'],
    submit: () => { throw new Error('tradeStore.save() blew up synchronously'); },
    resultContext: () => { throw new Error('must not be called when submit failed'); }
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.setSubmitGraceMs(10);
  engine.start('trade.calculator', {});
  const workflow = await engine.applyKnownFields([{ path: 'direction', value: 'long' }], {});
  assert.equal(workflow.status, 'pending-submit');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(engine.current().status, 'collecting', 'a synchronous throw must recover exactly like a rejected promise does');
  assert.deepEqual(clone(engine.current().known), { direction: 'long' });
});

test('applyKnownFields() is a no-op when no workflow is currently in progress', async () => {
  const engine = await engineSandbox({ actionRegistry: { get: () => { throw new Error('must not be looked up with no active workflow'); } } });
  assert.equal(await engine.applyKnownFields([{ path: 'city', value: 'x' }], {}), null);
});

// Found via real end-to-end testing: closing the real dialog (X/Cancel) BEFORE the required set
// ever completes leaves the workflow sitting in 'collecting' forever - no submit was ever
// scheduled, so scheduleSubmit()'s own isOpen() check (a separate, narrower fix) never runs
// either. A user who cancels once and later tries an entirely new, unrelated request would find
// it never recognized as a fresh intent without this.
test('pruneIfAbandoned() clears a "collecting" workflow whose target process has since closed', async () => {
  let processOpen = true;
  const action = { id: 'session.create', requiredFields: ['city', 'timeframe'] };
  const engine = await engineSandbox({
    actionRegistry: fakeActionRegistry(action),
    processRegistry: { applyValue: () => {}, query: () => ({ open: processOpen, step: null }) }
  });
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {}); // still missing timeframe
  assert.ok(engine.current(), 'the workflow is still collecting');
  processOpen = false; // the user closed the dialog by hand, without ever finishing it
  engine.pruneIfAbandoned();
  assert.equal(engine.current(), null);
});

test('pruneIfAbandoned() leaves an actively-collecting workflow alone while its target process is still open', async () => {
  const action = { id: 'session.create', requiredFields: ['city', 'timeframe'] };
  const engine = await engineSandbox({
    actionRegistry: fakeActionRegistry(action),
    processRegistry: { applyValue: () => {}, query: () => ({ open: true, step: null }) }
  });
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  engine.pruneIfAbandoned();
  assert.ok(engine.current(), 'still open, still legitimately mid-conversation - must not be pruned');
});

test('pruneIfAbandoned() never touches a pending-submit workflow - that is scheduleSubmit()\'s own isOpen() check to make, right before it actually fires', async () => {
  let processOpen = true;
  const action = { id: 'session.create', requiredFields: ['city'], submit: async () => ({ id: 'session-1' }) };
  const engine = await engineSandbox({
    actionRegistry: fakeActionRegistry(action),
    processRegistry: { applyValue: () => {}, query: () => ({ open: processOpen, step: null }) }
  });
  engine.setSubmitGraceMs(5000); // long enough that this test's own assertions run well before it fires
  engine.start('session.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.equal(workflow.status, 'pending-submit');
  processOpen = false;
  engine.pruneIfAbandoned();
  assert.equal(workflow.status, 'pending-submit', 'pruneIfAbandoned leaves it for scheduleSubmit\'s own check instead of racing it');
  engine.cancel(); // clean up the still-pending timer rather than letting this test's process wait on it
});

test('cancel() clears the current workflow', async () => {
  const action = { id: 'session.create', requiredFields: ['city'] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action) });
  engine.start('session.create', {});
  assert.ok(engine.current());
  engine.cancel();
  assert.equal(engine.current(), null);
});

test('cancel() during the grace window prevents the pending submit from ever firing', async () => {
  const submitCalls = [];
  const action = {
    id: 'session.create', requiredFields: ['city'],
    submit: async (known) => { submitCalls.push(known); return { id: 'session-1' }; }
  };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.setSubmitGraceMs(20);
  engine.start('session.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.equal(workflow.status, 'pending-submit');
  engine.cancel();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(submitCalls.length, 0, 'the cancelled workflow\'s scheduled submit must never run');
});

// --- Journey H1: stale-action protection (TradeJournalAIUiRevisionGuard integration) ---

// diverged.value is false (no divergence) or one of the real guard's own return values -
// 'closed' | 'surface' | 'step' - never a bare true, matching ai-ui-revision-guard.js's actual
// contract (see that file's own hasDiverged() comment on why 'step' is handled differently).
function fakeUiRevisionGuard(diverged) {
  const captureCalls = [];
  return {
    capture: (processId) => { captureCalls.push(processId); return { processId: processId, layer: 'foreground', step: 1 }; },
    hasDiverged: () => diverged.value,
    captureCalls
  };
}

test('a workflow with no TradeJournalAIUiRevisionGuard present behaves exactly as before (feature-detected, not a hard dependency)', async () => {
  const applyCalls = [];
  const action = { id: 'session.create', requiredFields: ['city'] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: (...args) => applyCalls.push(args) } });
  engine.start('session.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.deepEqual(clone(workflow.known), { city: 'New York' });
  assert.deepEqual(clone(applyCalls), [['session-create', 'city', 'New York', 'replace']]);
});

test('applyKnownFields() captures a uiSnapshot via the guard against the real, already-resolved processId', async () => {
  const diverged = { value: false };
  const guard = fakeUiRevisionGuard(diverged);
  const action = { id: 'session.create', requiredFields: ['city'] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} }, uiRevisionGuard: guard });
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  // Captured once because no snapshot existed yet, and re-captured (a fresh baseline) once more
  // right after this same turn's own field application settled - every call carries the real,
  // already-resolved processId, never the pre-open() placeholder.
  assert.deepEqual(guard.captureCalls, ['session-create', 'session-create']);
});

test('applyKnownFields() discards the workflow without applying any field once the guard reports "closed"/"surface" divergence', async () => {
  const diverged = { value: false };
  const guard = fakeUiRevisionGuard(diverged);
  const applyCalls = [];
  const action = { id: 'session.create', requiredFields: ['city', 'timeframe'] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: (...args) => applyCalls.push(args) }, uiRevisionGuard: guard });
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {}); // first call: captures, applies normally
  assert.ok(engine.current(), 'still a live workflow after the first, non-diverged turn');

  // Between turns, the real UI this workflow was driving is genuinely gone - closed, or a
  // different foreground surface now topmost (simulated here by flipping the guard's answer).
  diverged.value = 'closed';
  const result = await engine.applyKnownFields([{ path: 'timeframe', value: '5m' }], {});
  assert.equal(result, null, 'a "closed"/"surface" turn must return null, exactly like "no workflow in progress"');
  assert.equal(engine.current(), null, 'the stale workflow is cleared rather than silently continuing');
  assert.deepEqual(clone(applyCalls), [['session-create', 'city', 'New York', 'replace']], 'the diverged turn\'s own field (timeframe) must never reach the real UI');
});

test('a workflow discarded by "closed"/"surface" divergence never schedules or fires a submit for the stale remaining field', async () => {
  const diverged = { value: false };
  const guard = fakeUiRevisionGuard(diverged);
  const submitCalls = [];
  const action = { id: 'session.create', requiredFields: ['city', 'timeframe'], submit: async (known) => { submitCalls.push(known); return { id: 'should-not-happen' }; } };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} }, uiRevisionGuard: guard });
  engine.setSubmitGraceMs(10);
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {}); // first call: captures a baseline, applies normally, one field still missing

  diverged.value = 'surface'; // a different foreground surface is now topmost, before the next turn
  const result = await engine.applyKnownFields([{ path: 'timeframe', value: '5m' }], {});
  assert.equal(result, null);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(submitCalls.length, 0, 'a discarded-as-stale workflow must never complete its required set through submit()');
});

// Real production bug (2026-08-28): a "step" divergence - the SAME wizard moved forward or back
// under the user's own real Next/Back/Skip click - must NOT abandon the workflow the way
// "closed"/"surface" do. Before this fix, the very first manual step change during Psychology
// Intake or the Trade Wizard permanently ended live voice-fill for the rest of that session
// (chat-dock-core.js has no fallback that auto-applies fields into an open process no live
// workflow owns - only dead-ended, click-to-apply suggestions). The correct behavior: re-baseline
// to the new real step and keep collecting, so a LATER field still lands live.
test('applyKnownFields() re-baselines and keeps the workflow alive - never discards it - on a "step" divergence', async () => {
  const diverged = { value: false };
  const guard = fakeUiRevisionGuard(diverged);
  const applyCalls = [];
  const action = { id: 'session.create', requiredFields: ['city', 'timeframe'] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: (...args) => applyCalls.push(args) }, uiRevisionGuard: guard });
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {}); // first call: captures a baseline
  assert.equal(guard.captureCalls.length, 2, 'captured once (no snapshot yet) and re-captured once after this turn\'s own field application settled');

  diverged.value = 'step'; // the user manually clicked Next/Back on the SAME real wizard
  const result = await engine.applyKnownFields([{ path: 'timeframe', value: '5m' }], {});
  assert.notEqual(result, null, 'a "step" divergence must never be treated like "no workflow in progress"');
  assert.ok(engine.current(), 'the workflow survives a manual step change - Voice follows, it does not give up');
  assert.deepEqual(clone(applyCalls), [
    ['session-create', 'city', 'New York', 'replace'],
    ['session-create', 'timeframe', '5m', 'replace']
  ], 'the field on the turn AFTER a "step" divergence must still reach the real UI, not be silently dropped');
  assert.equal(guard.captureCalls.length, 4, 're-baselined once for the "step" divergence itself, then again after this turn\'s own field application settled');
});

// --- 2026-08-28 bug report: retargetOrStart() / restorePreviousProcessId() ---
// (Pre-Session Check-In popup - real, app-opened, never through an action's own open())

test('retargetOrStart() points an already-in-flight workflow at a new real processId, pushing the old one onto a stack, and clears its uiSnapshot', async () => {
  const action = { id: 'session.movementEntry.create', requiredFields: [] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.start('session.movementEntry.create', {});
  await engine.applyKnownFields([], {}); // establishes the default processId
  assert.equal(engine.current().processId, 'session-movementEntry-create');

  const retargeted = engine.retargetOrStart('mh-pre-session-checkin', 'session.preSessionCheckIn.fill', {}, []);
  assert.equal(retargeted.processId, 'mh-pre-session-checkin', 'the SAME workflow now targets the popup');
  assert.equal(engine.current().workflowId, retargeted.workflowId, 'no new workflow was started - the original is preserved');
  assert.equal(retargeted.uiSnapshot, null, 'forces a fresh capture against the new real surface');
});

test('restorePreviousProcessId() hands a retargeted workflow back to its original processId', async () => {
  const action = { id: 'session.movementEntry.create', requiredFields: [] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.start('session.movementEntry.create', {});
  await engine.applyKnownFields([], {});
  const originalWorkflowId = engine.current().workflowId;

  engine.retargetOrStart('mh-pre-session-checkin', 'session.preSessionCheckIn.fill', {}, []);
  const restored = engine.restorePreviousProcessId();
  assert.equal(restored.processId, 'session-movementEntry-create', 'back to the original real target - the interrupted request resumes exactly where it left off');
  assert.equal(restored.workflowId, originalWorkflowId, 'still the SAME workflow throughout - never abandoned');
});

test('retargetOrStart() nests correctly through two interruptions and restores in the right order', async () => {
  const action = { id: 'session.movementEntry.create', requiredFields: [] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.start('session.movementEntry.create', {});
  await engine.applyKnownFields([], {});

  engine.retargetOrStart('mh-pre-session-checkin', 'session.preSessionCheckIn.fill', {}, []);
  engine.retargetOrStart('some-other-interrupt', 'some.other.action', {}, []);
  assert.equal(engine.current().processId, 'some-other-interrupt');
  assert.equal(engine.restorePreviousProcessId().processId, 'mh-pre-session-checkin');
  assert.equal(engine.restorePreviousProcessId().processId, 'session-movementEntry-create');
});

test('retargetOrStart() is a no-op (returns the same workflow, does not push the stack) when already targeting the requested processId', async () => {
  const action = { id: 'session.movementEntry.create', requiredFields: [] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.start('session.movementEntry.create', {});
  await engine.applyKnownFields([], {});
  const before = engine.current().processId;
  const result = engine.retargetOrStart(before, 'session.preSessionCheckIn.fill', {}, []);
  assert.equal(result.processId, before);
  assert.equal(engine.restorePreviousProcessId().processId, before, 'nothing was pushed - restoring is a harmless no-op');
});

test('retargetOrStart() starts a fresh, standalone workflow when nothing was already in flight (a human\'s own manual click opened the popup)', async () => {
  const action = { id: 'session.preSessionCheckIn.fill', requiredFields: [], entityAlreadyPersisted: true };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  assert.equal(engine.current(), null, 'nothing in flight to begin with');
  const result = engine.retargetOrStart('mh-pre-session-checkin', 'session.preSessionCheckIn.fill', {}, []);
  assert.equal(result.actionId, 'session.preSessionCheckIn.fill');
  assert.equal(result.processId, 'session-preSessionCheckIn-fill', 'start()\'s own default processId mapping, before applyKnownFields() ever resolves open()\'s override');
});

test('restorePreviousProcessId() is a harmless no-op when nothing was ever retargeted', async () => {
  const action = { id: 'session.movementEntry.create', requiredFields: [] };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: { applyValue: () => {} } });
  engine.start('session.movementEntry.create', {});
  await engine.applyKnownFields([], {});
  const before = engine.current().processId;
  assert.equal(engine.restorePreviousProcessId().processId, before);
});
