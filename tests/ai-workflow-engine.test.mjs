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
    TradeJournalAIProcessRegistry: overrides.processRegistry
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
