import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

// A value returned from inside the vm-sandboxed guard carries that realm's own Object prototype,
// so assert.deepEqual reports "same structure but not reference-equal" even when every field
// matches - same caveat this repo's other vm-sandboxed tests already document.
const clone = value => JSON.parse(JSON.stringify(value));

async function guardSandbox(processRegistry) {
  const sandbox = { window: { TradeJournalAIProcessRegistry: processRegistry } };
  vm.runInNewContext(await source('ai-ui-revision-guard.js'), sandbox, { filename: 'ai-ui-revision-guard.js' });
  return sandbox.window.TradeJournalAIUiRevisionGuard;
}

// A tiny hand-written fake standing in for the real ai-process-registry.js - this file's own
// contract is exactly {snapshot(id), query(id), activeOpenProcess()}, so exercising the guard
// against a controllable fake (rather than the real registry) keeps each test focused on one
// divergence rule at a time.
function fakeRegistry(state) {
  return {
    snapshot: (id) => (state.processes[id] || { open: false, step: null, layer: null }),
    query: (id) => { const s = state.processes[id] || { open: false, step: null }; return { open: s.open, step: s.step }; },
    activeOpenProcess: () => (state.topmostId ? { id: state.topmostId } : null)
  };
}

test('capture() returns null for a process that is not open (nothing to guard)', async () => {
  const state = { processes: { 'trade-wizard': { open: false, step: null, layer: 'foreground' } } };
  const guard = await guardSandbox(fakeRegistry(state));
  assert.equal(guard.capture('trade-wizard'), null);
});

test('capture() snapshots {processId, layer, step} for an open process', async () => {
  const state = { processes: { 'trade-wizard': { open: true, step: 2, layer: 'foreground' } } };
  const guard = await guardSandbox(fakeRegistry(state));
  const snap = guard.capture('trade-wizard');
  assert.deepEqual(clone(snap), { processId: 'trade-wizard', layer: 'foreground', step: 2 });
});

test('hasDiverged() is false for a null/undefined capture (nothing was ever captured)', async () => {
  const guard = await guardSandbox(fakeRegistry({ processes: {} }));
  assert.equal(guard.hasDiverged(null), false);
  assert.equal(guard.hasDiverged(undefined), false);
});

test('hasDiverged() is false when nothing about the captured surface has changed', async () => {
  const state = { processes: { 'trade-wizard': { open: true, step: 2, layer: 'foreground' } }, topmostId: 'trade-wizard' };
  const guard = await guardSandbox(fakeRegistry(state));
  const captured = guard.capture('trade-wizard');
  assert.equal(guard.hasDiverged(captured), false);
});

test('hasDiverged() is true once the captured process has closed', async () => {
  const state = { processes: { 'trade-wizard': { open: true, step: 2, layer: 'foreground' } }, topmostId: 'trade-wizard' };
  const guard = await guardSandbox(fakeRegistry(state));
  const captured = guard.capture('trade-wizard');
  state.processes['trade-wizard'] = { open: false, step: null };
  assert.equal(guard.hasDiverged(captured), true, 'the real UI this workflow was driving no longer exists');
});

test('hasDiverged() is true when the step changed without this engine\'s own doing (a manual Back/Next/Skip)', async () => {
  const state = { processes: { 'trade-wizard': { open: true, step: 2, layer: 'foreground' } }, topmostId: 'trade-wizard' };
  const guard = await guardSandbox(fakeRegistry(state));
  const captured = guard.capture('trade-wizard');
  state.processes['trade-wizard'] = { open: true, step: 1, layer: 'foreground' }; // human clicked Back
  assert.equal(guard.hasDiverged(captured), true);
});

test('hasDiverged() is true for a foreground surface once a different registration becomes topmost', async () => {
  const state = {
    processes: { 'pattern-editor-p1': { open: true, step: null, layer: 'foreground' } },
    topmostId: 'pattern-editor-p1'
  };
  const guard = await guardSandbox(fakeRegistry(state));
  const captured = guard.capture('pattern-editor-p1');
  // The user opened a different foreground surface (e.g. the Trade wizard) on top of it.
  state.processes['trade-wizard'] = { open: true, step: 1, layer: 'foreground' };
  state.topmostId = 'trade-wizard';
  assert.equal(guard.hasDiverged(captured), true);
});

test('hasDiverged() is false for a background-layer capture even when a foreground surface becomes topmost elsewhere', async () => {
  // A persistent inline surface (e.g. Settings Trading Defaults) legitimately coexists with a
  // foreground modal opened elsewhere - it never competes for "topmost", so a different process
  // becoming topmost must not, by itself, count as divergence for a background-layer workflow.
  const state = {
    processes: { 'settings-trading-defaults': { open: true, step: null, layer: 'background' } },
    topmostId: 'settings-trading-defaults'
  };
  const guard = await guardSandbox(fakeRegistry(state));
  const captured = guard.capture('settings-trading-defaults');
  state.processes['trade-wizard'] = { open: true, step: 1, layer: 'foreground' };
  state.topmostId = 'trade-wizard';
  assert.equal(guard.hasDiverged(captured), false);
});

test('hasDiverged() is false when this engine\'s own step-follow (goToStep) is what moved the step, as long as the caller re-captures afterward', async () => {
  const state = { processes: { 'trade-wizard': { open: true, step: 1, layer: 'foreground' } }, topmostId: 'trade-wizard' };
  const guard = await guardSandbox(fakeRegistry(state));
  const first = guard.capture('trade-wizard');
  assert.equal(guard.hasDiverged(first), false);
  // Simulate ai-process-registry.js's own stepForPath/goToStep lockstep advancing the step as
  // part of applying a field - the caller (ai-workflow-engine.js) re-captures right after this.
  state.processes['trade-wizard'] = { open: true, step: 2, layer: 'foreground' };
  const reCaptured = guard.capture('trade-wizard');
  assert.equal(guard.hasDiverged(reCaptured), false, 're-capturing immediately after a legitimate, engine-driven step change must reset the baseline');
});
