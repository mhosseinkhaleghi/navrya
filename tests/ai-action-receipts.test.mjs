import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Voice Command Learning Profile addendum, section 7: the deliberately small "last eligible
// action receipt" this app's current submit()/resultContext() contract can honestly support (see
// ai-workflow-engine.js's own recordReceipt() comment for why the full canonical shape is not
// attempted). Same real-module VM sandbox convention as tests/ai-dock-control-intent.test.mjs.

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const clone = (value) => JSON.parse(JSON.stringify(value));

async function receiptsSandbox() {
  const sandbox = { window: {}, Date, Math };
  vm.runInNewContext(await readFile(shared('ai-action-receipts.js'), 'utf8'), sandbox, { filename: 'ai-action-receipts.js' });
  return sandbox.window.TradeJournalAIActionReceipts;
}

// Section 8's own "the row appears once a receipt genuinely lands" design needs a real DOM event -
// a separate sandbox (real addEventListener/dispatchEvent/CustomEvent) just for that one test,
// rather than changing receiptsSandbox()'s own return shape and touching every other call site.
async function receiptsSandboxWithEvents() {
  const listeners = [];
  const window = {
    addEventListener: (type, fn) => listeners.push([type, fn]),
    dispatchEvent: (event) => listeners.filter(([type]) => type === event.type).forEach(([, fn]) => fn(event))
  };
  const sandbox = { window, Date, Math, CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } } };
  vm.runInNewContext(await readFile(shared('ai-action-receipts.js'), 'utf8'), sandbox, { filename: 'ai-action-receipts.js' });
  return { receipts: sandbox.window.TradeJournalAIActionReceipts, window };
}

test('record() stamps a fresh receiptId every time and stores the given fields, defaulting learnedCommandId to null', async () => {
  const receipts = await receiptsSandbox();
  const r1 = receipts.record({ actionId: 'trade.create', processId: 'trade-create', known: { instrument: 'XAUUSD' }, triggerText: 'log this trade', riskLevel: 'low', hasGate: false, result: 'success' });
  const r2 = receipts.record({ actionId: 'trade.create', known: {}, riskLevel: 'low', hasGate: false, result: 'success' });
  assert.notEqual(r1.receiptId, r2.receiptId);
  assert.equal(clone(r1.known).instrument, 'XAUUSD');
  assert.equal(r1.learnedCommandId, null);
  assert.equal(r1.triggerText, 'log this trade');
});

test('lastEligibleReceipt(): a successful, low-risk, non-gated, recent receipt is eligible', async () => {
  const receipts = await receiptsSandbox();
  receipts.record({ actionId: 'trade.create', known: {}, riskLevel: 'low', hasGate: false, result: 'success' });
  const eligible = receipts.lastEligibleReceipt();
  assert.ok(eligible);
  assert.equal(eligible.actionId, 'trade.create');
});

test('lastEligibleReceipt(): a failed or cancelled receipt is never eligible - nothing to reinforce or repeat', async () => {
  const receipts = await receiptsSandbox();
  receipts.record({ actionId: 'trade.create', known: {}, riskLevel: 'low', hasGate: false, result: 'failed' });
  assert.equal(receipts.lastEligibleReceipt(), null);
  receipts.record({ actionId: 'trade.create', known: {}, riskLevel: 'low', hasGate: false, result: 'cancelled' });
  assert.equal(receipts.lastEligibleReceipt(), null);
});

test('lastEligibleReceipt(): a high-riskLevel action is never eligible, even on success - the destructive/consequential exclusion', async () => {
  const receipts = await receiptsSandbox();
  receipts.record({ actionId: 'trade.delete', known: {}, riskLevel: 'high', hasGate: false, result: 'success' });
  assert.equal(receipts.lastEligibleReceipt(), null);
});

test('lastEligibleReceipt(): a gated (confirmation-required) action is never eligible, even on success and even at low riskLevel', async () => {
  const receipts = await receiptsSandbox();
  receipts.record({ actionId: 'settings.persona.update', known: {}, riskLevel: 'low', hasGate: true, result: 'success' });
  assert.equal(receipts.lastEligibleReceipt(), null);
});

test('tagLearnedCommandId() attaches to the matching receiptId only - a stale id from a since-superseded receipt is silently ignored', async () => {
  const receipts = await receiptsSandbox();
  const r1 = receipts.record({ actionId: 'trade.create', known: {}, riskLevel: 'low', hasGate: false, result: 'success' });
  receipts.tagLearnedCommandId(r1.receiptId, 'lc-123');
  assert.equal(receipts.lastEligibleReceipt().learnedCommandId, 'lc-123');
  receipts.tagLearnedCommandId('receipt-stale-id', 'lc-999');
  assert.equal(receipts.lastEligibleReceipt().learnedCommandId, 'lc-123', 'a stale receiptId must never overwrite the current receipt');
});

test('clear() removes the receipt entirely - rawLast()/lastEligibleReceipt() both report nothing', async () => {
  const receipts = await receiptsSandbox();
  receipts.record({ actionId: 'trade.create', known: {}, riskLevel: 'low', hasGate: false, result: 'success' });
  receipts.clear();
  assert.equal(receipts.rawLast(), null);
  assert.equal(receipts.lastEligibleReceipt(), null);
});

test('a second record() replaces the first - only ever the single most recent receipt is kept', async () => {
  const receipts = await receiptsSandbox();
  receipts.record({ actionId: 'trade.create', known: {}, riskLevel: 'low', hasGate: false, result: 'success' });
  receipts.record({ actionId: 'session.create', known: {}, riskLevel: 'low', hasGate: false, result: 'success' });
  assert.equal(receipts.lastEligibleReceipt().actionId, 'session.create');
});

test('record() dispatches tradejournal:action-receipt-recorded with the new receiptId - the real signal section 8\'s chat feedback row listens for, since the underlying submit typically finishes seconds after the reply is already shown', async () => {
  const { receipts, window } = await receiptsSandboxWithEvents();
  const seen = [];
  window.addEventListener('tradejournal:action-receipt-recorded', (e) => seen.push(e.detail.receiptId));
  const r1 = receipts.record({ actionId: 'trade.create', known: {}, riskLevel: 'low', hasGate: false, result: 'success' });
  assert.deepEqual(seen, [r1.receiptId]);
});

// --- Integration: ai-workflow-engine.js's own runSubmit() actually records through this module ---

async function workflowSandbox() {
  const sandbox = { window: {}, Set, Math, JSON, console, Date, Promise, setTimeout, clearTimeout };
  const files = ['ai-i18n.js', 'ai-process-registry.js', 'ai-action-registry.js', 'ai-action-receipts.js', 'ai-workflow-engine.js'];
  for (const file of files) vm.runInNewContext(await readFile(shared(file), 'utf8'), sandbox, { filename: file });
  // A plain (non-explicitSubmitOnly, non-entityAlreadyPersisted) action submits through
  // scheduleSubmit()'s own real grace-window timer, not immediately - shrink it to 0 so these
  // tests only need one short real wait rather than sleeping SUBMIT_GRACE_MS (3000ms) each.
  sandbox.window.TradeJournalAIWorkflowEngine.setSubmitGraceMs(0);
  return sandbox.window;
}
function flush(ms = 20) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function registerDemoAction(window, { riskLevel = 'low', gateField, submitResult = { id: 'demo-1' }, submitResultIsUndefined = false, shouldFail = false, entityAlreadyPersisted = false, submitResolvesUndefinedOnSuccess = false } = {}) {
  let opened = false;
  // submitResult: undefined (as an object literal key) is indistinguishable from omitting the key
  // at all under destructuring-default semantics (both fall back to the default { id: 'demo-1' })
  // - submitResultIsUndefined is the explicit way a test forces a genuinely undefined resolution.
  const resolvedSubmitResult = submitResultIsUndefined ? undefined : submitResult;
  const registration = {
    id: 'demo.receipt.create', domain: 'demo', riskLevel,
    requiredFields: ['name'], optionalFields: [],
    available: () => true,
    open: () => { opened = true; return { processId: 'demo-receipt' }; },
    submit: async () => { if (shouldFail) throw new Error('boom'); return resolvedSubmitResult; },
    resultContext: () => {}
  };
  if (gateField) registration.gateField = gateField;
  if (entityAlreadyPersisted) registration.entityAlreadyPersisted = true;
  if (submitResolvesUndefinedOnSuccess) registration.submitResolvesUndefinedOnSuccess = true;
  window.TradeJournalAIActionRegistry.registerAction(registration);
  window.TradeJournalAIProcessRegistry.register('demo-receipt', { allowlist: ['name'], isOpen: () => opened });
}

test('integration: a successful submit through ai-workflow-engine.js records an eligible receipt with the real actionId and known fields', async () => {
  const window = await workflowSandbox();
  registerDemoAction(window);
  const engine = window.TradeJournalAIWorkflowEngine;
  const workflow = engine.start('demo.receipt.create', {}, []);
  workflow.triggerText = 'create a demo thing';
  await engine.applyKnownFields([{ path: 'name', value: 'Demo A' }], {});
  await flush();
  const receipt = window.TradeJournalAIActionReceipts.lastEligibleReceipt();
  assert.ok(receipt, 'a completed, low-risk, non-gated submit must produce an eligible receipt');
  assert.equal(receipt.actionId, 'demo.receipt.create');
  assert.equal(clone(receipt.known).name, 'Demo A');
  assert.equal(receipt.triggerText, 'create a demo thing');
  assert.equal(receipt.result, 'success');
});

test('integration: a gateField action never produces an eligible receipt, even after a real successful submit', async () => {
  const window = await workflowSandbox();
  registerDemoAction(window, { gateField: 'confirm' });
  const engine = window.TradeJournalAIWorkflowEngine;
  window.TradeJournalAIActionRegistry.get('demo.receipt.create').requiredFields = ['name', 'confirm'];
  engine.start('demo.receipt.create', {}, []);
  await engine.applyKnownFields([{ path: 'name', value: 'Demo B' }, { path: 'confirm', value: true }], {});
  await flush();
  assert.equal(window.TradeJournalAIActionReceipts.lastEligibleReceipt(), null, 'a gated action must never be reinforcement/repeat-eligible');
});

test('integration: a failed submit records a non-eligible receipt with result "failed"', async () => {
  const window = await workflowSandbox();
  registerDemoAction(window, { shouldFail: true });
  const engine = window.TradeJournalAIWorkflowEngine;
  engine.start('demo.receipt.create', {}, []);
  await engine.applyKnownFields([{ path: 'name', value: 'Demo C' }], {});
  await flush();
  const raw = window.TradeJournalAIActionReceipts.rawLast();
  assert.ok(raw);
  assert.equal(raw.result, 'failed');
  assert.equal(window.TradeJournalAIActionReceipts.lastEligibleReceipt(), null);
});

test('integration (audit fix, section 5): an ordinary action whose submit() resolves undefined is recorded as "unknown_outcome", never "success" - a bare resolved Promise is not proof of success', async () => {
  const window = await workflowSandbox();
  registerDemoAction(window, { submitResultIsUndefined: true });
  const engine = window.TradeJournalAIWorkflowEngine;
  engine.start('demo.receipt.create', {}, []);
  await engine.applyKnownFields([{ path: 'name', value: 'Demo D' }], {});
  await flush();
  const raw = window.TradeJournalAIActionReceipts.rawLast();
  assert.equal(raw.result, 'unknown_outcome');
  assert.equal(window.TradeJournalAIActionReceipts.lastEligibleReceipt(), null, 'an ambiguous outcome must never be learning/reinforcement-eligible');
});

test('integration (audit fix, section 5): an action explicitly opting in via submitResolvesUndefinedOnSuccess is trusted as success on undefined', async () => {
  const window = await workflowSandbox();
  registerDemoAction(window, { submitResultIsUndefined: true, submitResolvesUndefinedOnSuccess: true });
  const engine = window.TradeJournalAIWorkflowEngine;
  engine.start('demo.receipt.create', {}, []);
  await engine.applyKnownFields([{ path: 'name', value: 'Demo F' }], {});
  await flush();
  const receipt = window.TradeJournalAIActionReceipts.lastEligibleReceipt();
  assert.ok(receipt, 'an explicit compatibility opt-in must be trusted');
  assert.equal(receipt.result, 'success');
});

test('a real, discovered limitation: an entityAlreadyPersisted action never reaches runSubmit() at all (its own persistence already happened inside open()), so it never produces a receipt through this automatic path - "remember this" has nothing to work from for this action shape today', async () => {
  const window = await workflowSandbox();
  registerDemoAction(window, { entityAlreadyPersisted: true });
  const engine = window.TradeJournalAIWorkflowEngine;
  engine.start('demo.receipt.create', {}, []);
  await engine.applyKnownFields([{ path: 'name', value: 'Demo E' }], {});
  await flush();
  assert.equal(window.TradeJournalAIActionReceipts.rawLast(), null, 'entityAlreadyPersisted never calls scheduleSubmit()/runSubmit(), so recordReceipt() is never reached');
});
