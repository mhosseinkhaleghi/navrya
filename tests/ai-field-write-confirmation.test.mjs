import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Voice/Chat form-interview workflow upgrade: the field-write confirmation preference
// ('direct' default / opt-in 'ask_each') is enforced deterministically inside
// ai-workflow-engine.js's applyKnownFields()/resolvePendingFieldWrite() - never by trusting model
// text alone. These tests exercise that engine directly, the same vm-sandbox convention
// tests/ai-workflow-engine.test.mjs already established for this exact file.

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

async function engineSandbox(overrides) {
  const sandbox = { window: {}, Promise, Set, Date, setTimeout, clearTimeout };
  sandbox.window = Object.assign(sandbox.window, {
    TradeJournalAIActionRegistry: overrides.actionRegistry,
    TradeJournalAIProcessRegistry: overrides.processRegistry,
    TradeJournalAIUiRevisionGuard: overrides.uiRevisionGuard,
    TradeJournalAICompanionProfile: overrides.companionProfile
  });
  vm.runInNewContext(await source('ai-workflow-engine.js'), sandbox, { filename: 'ai-workflow-engine.js' });
  return sandbox.window.TradeJournalAIWorkflowEngine;
}

function fakeActionRegistry(action) {
  return { get: (id) => (id === action.id ? action : null) };
}

function fakeProcessRegistry({ applyValue, isFieldWritable, interviewFieldMeta } = {}) {
  const calls = [];
  return {
    calls,
    applyValue: (...args) => { calls.push(args); if (applyValue) applyValue(...args); },
    isFieldWritable: isFieldWritable || (() => true),
    interviewFieldMeta: interviewFieldMeta || (() => null)
  };
}

function directProfile() { return { formWriteConfirmation: () => 'direct' }; }
function askEachProfile() { return { formWriteConfirmation: () => 'ask_each' }; }

test('direct mode (default): a valid field value applies immediately, exactly once, with no pending candidate', async () => {
  const action = { id: 'session.create', requiredFields: ['city', 'timeframe'], open: () => {} };
  const processRegistry = fakeProcessRegistry();
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry, companionProfile: directProfile() });
  engine.start('session.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.equal(processRegistry.calls.length, 1, 'applied exactly once');
  assert.deepEqual(processRegistry.calls[0], ['session-create', 'city', 'New York', 'replace']);
  assert.equal(clone(workflow.known).city, 'New York');
  assert.equal(engine.pendingFieldWrite(), null);
});

test('ask_each mode: an ordinary field is staged as a pending candidate instead of applied - never written, never counted as known', async () => {
  const action = { id: 'session.create', requiredFields: ['city', 'timeframe'], open: () => {} };
  const processRegistry = fakeProcessRegistry();
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry, companionProfile: askEachProfile() });
  engine.start('session.create', {});
  const workflow = await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.equal(processRegistry.calls.length, 0, 'never reaches the real setter until confirmed');
  assert.equal(clone(workflow.known).city, undefined, 'stays genuinely missing, not silently known');
  assert.deepEqual(clone(workflow.missing), ['city', 'timeframe']);
  const pending = engine.pendingFieldWrite();
  assert.ok(pending);
  assert.equal(pending.path, 'city');
  assert.equal(pending.value, 'New York');
  assert.equal(pending.processId, 'session-create');
});

test('ask_each mode: resolvePendingFieldWrite(\'confirm\') applies through the real setter exactly once and clears the candidate', async () => {
  const action = { id: 'session.create', requiredFields: ['city'], open: () => {} };
  const processRegistry = fakeProcessRegistry();
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry, companionProfile: askEachProfile() });
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  const outcome = await engine.resolvePendingFieldWrite('confirm', {});
  assert.equal(outcome.applied, true);
  assert.equal(processRegistry.calls.length, 1);
  assert.deepEqual(processRegistry.calls[0], ['session-create', 'city', 'New York', 'replace']);
  assert.equal(engine.pendingFieldWrite(), null);
  assert.equal(clone(engine.current().known).city, 'New York');
});

test('ask_each mode: resolvePendingFieldWrite(\'reject\') discards the candidate - never applies, never counts as known', async () => {
  const action = { id: 'session.create', requiredFields: ['city'], open: () => {} };
  const processRegistry = fakeProcessRegistry();
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry, companionProfile: askEachProfile() });
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  const outcome = await engine.resolvePendingFieldWrite('reject', {});
  assert.equal(outcome.applied, false);
  assert.equal(outcome.reason, 'rejected');
  assert.equal(processRegistry.calls.length, 0);
  assert.equal(engine.pendingFieldWrite(), null);
  assert.equal(clone(engine.current().known).city, undefined);
});

test('resolvePendingFieldWrite() with no pending candidate is a safe no-op', async () => {
  const action = { id: 'session.create', requiredFields: ['city'], open: () => {} };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: fakeProcessRegistry(), companionProfile: askEachProfile() });
  engine.start('session.create', {});
  const outcome = await engine.resolvePendingFieldWrite('confirm', {});
  assert.equal(outcome.applied, false);
  assert.equal(outcome.reason, 'none');
});

test('ask_each mode never gates the action\'s own gateField - a destructive/save/seal confirmation keeps its real, separate policy', async () => {
  const action = { id: 'account.create', requiredFields: ['save'], gateField: 'save', open: () => {} };
  const processRegistry = fakeProcessRegistry();
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry, companionProfile: askEachProfile() });
  engine.start('account.create', {});
  await engine.applyKnownFields([{ path: 'save', value: true }], {});
  assert.equal(engine.pendingFieldWrite(), null, 'the gate field is never staged as a pending field-write candidate');
});

test('ask_each mode never stages a resolution-only field (isFieldWritable() false) - it is not a real form write, so live-sync proceeds as normal', async () => {
  const action = { id: 'account.edit', requiredFields: ['accountName', 'save'], gateField: 'save', open: () => {} };
  const processRegistry = fakeProcessRegistry({ isFieldWritable: (processId, p) => p !== 'accountName' });
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry, companionProfile: askEachProfile() });
  engine.start('account.edit', {});
  await engine.applyKnownFields([{ path: 'accountName', value: 'FTMO 100k' }], {});
  assert.equal(engine.pendingFieldWrite(), null);
  assert.equal(processRegistry.calls.length, 1, 'accountName still applies through the ordinary path (isFieldWritable() false means nothing to gate)');
});

test('ask_each mode never stages a field whose interview metadata declares a non-editable role', async () => {
  const action = { id: 'pattern.edit', requiredFields: ['patternName'], open: () => {} };
  const processRegistry = fakeProcessRegistry({ interviewFieldMeta: (processId, p) => (p === 'patternName' ? { role: 'resolution' } : null) });
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry, companionProfile: askEachProfile() });
  engine.start('pattern.edit', {});
  await engine.applyKnownFields([{ path: 'patternName', value: 'Liquidity Sweep' }], {});
  assert.equal(engine.pendingFieldWrite(), null);
});

test('a pending candidate self-invalidates once the real UI has diverged (closed/a different surface now topmost)', async () => {
  const action = { id: 'session.create', requiredFields: ['city'], open: () => {} };
  const engine = await engineSandbox({
    actionRegistry: fakeActionRegistry(action), processRegistry: fakeProcessRegistry(), companionProfile: askEachProfile(),
    uiRevisionGuard: { capture: () => ({ processId: 'session-create' }), hasDiverged: () => 'closed' }
  });
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.equal(engine.pendingFieldWrite(), null, 'diverged - discarded on read, never confirmable');
});

test('a pending candidate expires after its own TTL - a much later confirmation cannot apply a stale, out-of-context value', async () => {
  const action = { id: 'session.create', requiredFields: ['city'], open: () => {} };
  const processRegistry = fakeProcessRegistry();
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry, companionProfile: askEachProfile() });
  engine.setPendingFieldWriteTtlMs(-1); // already expired the instant it is staged
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.equal(engine.pendingFieldWrite(), null);
  const outcome = await engine.resolvePendingFieldWrite('confirm', {});
  assert.equal(outcome.applied, false);
  assert.equal(processRegistry.calls.length, 0);
});

test('starting a brand-new workflow invalidates a candidate staged under the previous one', async () => {
  const actionA = { id: 'session.create', requiredFields: ['city'], open: () => {} };
  const actionB = { id: 'trade.calculator', requiredFields: ['direction'], open: () => {} };
  const registry = { get: (id) => (id === 'session.create' ? actionA : id === 'trade.calculator' ? actionB : null) };
  const engine = await engineSandbox({ actionRegistry: registry, processRegistry: fakeProcessRegistry(), companionProfile: askEachProfile() });
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.ok(engine.pendingFieldWrite());
  engine.start('trade.calculator', {});
  assert.equal(engine.pendingFieldWrite(), null);
});

test('cancel() clears any pending field-write candidate', async () => {
  const action = { id: 'session.create', requiredFields: ['city'], open: () => {} };
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry: fakeProcessRegistry(), companionProfile: askEachProfile() });
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.ok(engine.pendingFieldWrite());
  engine.cancel();
  assert.equal(engine.pendingFieldWrite(), null);
});

test('when the companion profile global is absent, the engine falls back to direct mode (no pending candidates) - existing behavior for every pre-existing test/page is unaffected', async () => {
  const action = { id: 'session.create', requiredFields: ['city'], open: () => {} };
  const processRegistry = fakeProcessRegistry();
  const engine = await engineSandbox({ actionRegistry: fakeActionRegistry(action), processRegistry }); // no companionProfile override at all
  engine.start('session.create', {});
  await engine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  assert.equal(processRegistry.calls.length, 1);
  assert.equal(engine.pendingFieldWrite(), null);
});
