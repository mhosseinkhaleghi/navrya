import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

// A value returned from inside the vm-sandboxed registry carries that realm's own Array/Object
// prototype, so assert.deepEqual (deepStrictEqual, prototype-sensitive) reports "same structure
// but not reference-equal" even when every element matches - the same caveat this file's own
// neighbors (chat-dock-core.test.mjs, ai-context-builder.test.mjs) already document.
const clone = value => JSON.parse(JSON.stringify(value));

async function registrySandbox() {
  const sandbox = { window: {} };
  vm.runInNewContext(await source('ai-process-registry.js'), sandbox, { filename: 'ai-process-registry.js' });
  return sandbox.window.TradeJournalAIProcessRegistry;
}

test('query() reports { open: false, step: null } for a processId that was never registered', async () => {
  const registry = await registrySandbox();
  // registry.query() returns an object built inside the vm sandbox realm, which has a
  // different Object.prototype than this file's - assert.deepEqual would fail on
  // [[Prototype]] alone even though the content matches, so compare fields directly.
  const result = registry.query('nothing-registered');
  assert.equal(result.open, false);
  assert.equal(result.step, null);
});

test('query() reflects a registration\'s live isOpen()/activeStep(), not a snapshot taken at register time', async () => {
  const registry = await registrySandbox();
  let open = false, step = 'one';
  registry.register('trade-wizard', { isOpen: () => open, activeStep: () => step });
  assert.equal(registry.query('trade-wizard').open, false);
  open = true; step = 'two';
  const result = registry.query('trade-wizard');
  assert.equal(result.open, true, 'isOpen/activeStep are re-invoked on every query, not cached');
  assert.equal(result.step, 'two');
});

test('activeOpenProcess() returns the first open registration with its allowlist and step, or null when nothing is open', async () => {
  const registry = await registrySandbox();
  const wizardAllowlist = ['entryPrice', 'stopLoss'];
  registry.register('mh-intake', { allowlist: ['intake.demographics.age'], isOpen: () => false, activeStep: () => null });
  registry.register('trade-wizard', { allowlist: wizardAllowlist, isOpen: () => true, activeStep: () => 3 });
  const active = registry.activeOpenProcess();
  assert.equal(active.id, 'trade-wizard');
  assert.equal(active.step, 3);
  assert.deepEqual(active.allowlist, ['entryPrice', 'stopLoss']);
  assert.ok(active.allowlist !== wizardAllowlist, 'allowlist is copied out, not the live array reference');
});

test('activeOpenProcess() is null when every registered process reports itself closed', async () => {
  const registry = await registrySandbox();
  registry.register('a', { isOpen: () => false });
  registry.register('b', { isOpen: () => false });
  assert.equal(registry.activeOpenProcess(), null);
});

test('activeOpenProcess() passes through the winner\'s own stepForPath as a plain function reference (Journey H1 closure) - null for a registration that never declared one', async () => {
  const registry = await registrySandbox();
  const stepForPath = (path) => (path === 'primaryTimeframe' ? 2 : null);
  registry.register('trade-wizard', { allowlist: ['primaryTimeframe'], isOpen: () => true, activeStep: () => 1, stepForPath: stepForPath });
  const active = registry.activeOpenProcess();
  assert.equal(active.stepForPath, stepForPath, 'the exact same function reference applyValue() itself uses internally - never a re-derived copy');
  assert.equal(active.stepForPath('primaryTimeframe'), 2);

  registry.register('session-create', { allowlist: ['city'], isOpen: () => true, activeStep: () => null }); // no stepForPath declared
  assert.equal(registry.activeOpenProcess().stepForPath, null);
});

test('applyValue() rejects a path outside the registered allowlist and never invokes the flow\'s own applyValue', async () => {
  const registry = await registrySandbox();
  let called = null;
  registry.register('trade-emotion-log', { allowlist: ['note'], applyValue: (path, value) => { called = [path, value]; } });
  const result = registry.applyValue('trade-emotion-log', 'dominantEmotions', ['calm'], 'append');
  assert.deepEqual(clone(result), { applied: false, reason: 'not-allowed' });
  assert.equal(registry.applyValueLegacy('trade-emotion-log', 'dominantEmotions', ['calm'], 'append'), false);
  assert.equal(called, null, 'an out-of-allowlist path must never reach the underlying mutation function');
});

test('applyValue() returns a structured rejection for unregistered, not-allowed, invalid, and handler-rejected writes', async () => {
  const registry = await registrySandbox();
  assert.deepEqual(clone(registry.applyValue('missing', 'city', 'London')), { applied: false, reason: 'unregistered' });

  registry.register('session-create', {
    allowlist: ['city', 'timeframe'],
    validateValue: (path, value) => path !== 'timeframe' || value === '15m',
    applyValue: (path) => path === 'city' ? false : undefined
  });
  assert.deepEqual(clone(registry.applyValue('session-create', 'instrument', 'XAUUSD')), { applied: false, reason: 'not-allowed' });
  assert.deepEqual(clone(registry.applyValue('session-create', 'timeframe', 'fifteen-ish')), { applied: false, reason: 'invalid' });
  assert.deepEqual(clone(registry.applyValue('session-create', 'city', 'London')), { applied: false, reason: 'rejected' });
});

test('adoptActiveProcess() only adopts the exact topmost active registration and rejects a stale revision', async () => {
  const registry = await registrySandbox();
  registry.register('background-form', { actionId: 'settings.update', allowlist: ['value'], isOpen: () => true });
  registry.register('account-manual-form', { actionId: 'account.create', layer: 'foreground', allowlist: ['firm'], isOpen: () => true });
  const active = registry.activeOpenProcess();

  assert.equal(typeof active.revision, 'number');
  assert.deepEqual(clone(registry.adoptActiveProcess('background-form')), { adopted: false, reason: 'not-active' });
  assert.deepEqual(clone(registry.adoptActiveProcess('account-manual-form', active.revision - 1)), { adopted: false, reason: 'stale' });
  assert.deepEqual(clone(registry.adoptActiveProcess('account-manual-form', active.revision)), {
    adopted: true,
    process: {
      id: 'account-manual-form', actionId: 'account.create', allowlist: ['firm'],
      step: null, layer: 'foreground', revision: active.revision
    }
  });
});

test('readValues()/getValue() expose only allowlisted committed values through the registration public adapter', async () => {
  const registry = await registrySandbox();
  const committed = { firm: 'Apex', currency: 'USD', secret: 'never expose' };
  registry.register('account-manual-form', {
    allowlist: ['firm', 'currency'],
    readValues: (paths) => Object.fromEntries(paths.map((path) => [path, committed[path]]))
  });

  assert.deepEqual(clone(registry.readValues('account-manual-form', ['firm', 'currency'])), {
    read: true, values: { firm: 'Apex', currency: 'USD' }
  });
  assert.deepEqual(clone(registry.getValue('account-manual-form', 'firm')), { read: true, value: 'Apex' });
  assert.deepEqual(clone(registry.getValue('account-manual-form', 'secret')), { read: false, reason: 'not-allowed' });
});

test('applyValue() for an in-allowlist path invokes the flow\'s own applyValue and reports success', async () => {
  const registry = await registrySandbox();
  let called = null;
  registry.register('trade-emotion-log', { allowlist: ['note'], applyValue: (path, value, mode) => { called = [path, value, mode]; } });
  const result = registry.applyValue('trade-emotion-log', 'note', 'felt calm at entry', 'replace');
  assert.deepEqual(clone(result), { applied: true, value: 'felt calm at entry' });
  assert.equal(registry.applyValueLegacy('trade-emotion-log', 'note', 'felt calm at entry', 'replace'), true);
  assert.deepEqual(called, ['note', 'felt calm at entry', 'replace']);
});

test('a persisted-style flow (intake/pattern/strategy pattern) routes an approved suggestion through that store\'s real applySuggestion, not a shortcut', async () => {
  const registry = await registrySandbox();
  const applySuggestionCalls = [];
  const fakeStore = {
    addMessage: (profile, role, content, suggestions) => { profile.chatHistory = (profile.chatHistory || []).concat([{ role, content, suggestions }]); return profile; },
    applySuggestion: (profile, suggestion, status) => { applySuggestionCalls.push([suggestion.id, status]); return profile; }
  };
  let profile = { chatHistory: [] };
  registry.register('mh-intake', {
    allowlist: ['intake.demographics.age'],
    applyValue: (path, value) => {
      const suggestionId = 'sug-1';
      profile = fakeStore.addMessage(profile, 'assistant', '', [{ id: suggestionId, path, value, status: 'pending' }]);
      profile = fakeStore.applySuggestion(profile, { id: suggestionId }, 'applied');
    }
  });
  const ok = registry.applyValue('mh-intake', 'intake.demographics.age', 29, 'replace');
  assert.deepEqual(clone(ok), { applied: true, value: 29 });
  assert.deepEqual(applySuggestionCalls, [['sug-1', 'applied']], 'the dock never mutates profile data itself - it must always go through the store\'s own applySuggestion');
});

test('registrations default isOpen/activeStep/allowlist/applyValue so a minimal register() call never throws', async () => {
  const registry = await registrySandbox();
  registry.register('bare-process', {});
  const result = registry.query('bare-process');
  assert.equal(result.open, false);
  assert.equal(result.step, null);
  assert.deepEqual(clone(registry.applyValue('bare-process', 'anything', 1)), { applied: false, reason: 'not-allowed' });
});

test('activeOpenProcess() prefers the most recently (re-)registered process when more than one is open at once', async () => {
  const registry = await registrySandbox();
  // Two session-scenario-style registrations, both legitimately open at the same time (e.g. two
  // expanded scenario cards) - registration order alone must decide the winner.
  registry.register('session-scenario-a', { allowlist: ['title'], isOpen: () => true, activeStep: () => 'a' });
  registry.register('session-scenario-b', { allowlist: ['title'], isOpen: () => true, activeStep: () => 'b' });
  assert.equal(registry.activeOpenProcess().id, 'session-scenario-b', 'the later of two simultaneously-open registrations must win');

  // Re-registering "a" (e.g. its component re-rendered after the user touched it) must bump it
  // back to the front, without needing "b" to unregister or close.
  registry.register('session-scenario-a', { allowlist: ['title'], isOpen: () => true, activeStep: () => 'a2' });
  const active = registry.activeOpenProcess();
  assert.equal(active.id, 'session-scenario-a');
  assert.equal(active.step, 'a2');
});

test('activeOpenProcess() ordering never changes behavior for a single-open-at-a-time flow (the original singleton-modal contract)', async () => {
  const registry = await registrySandbox();
  registry.register('trade-wizard', { allowlist: ['entryPrice'], isOpen: () => false, activeStep: () => null });
  registry.register('mh-intake', { allowlist: ['intake.demographics.age'], isOpen: () => true, activeStep: () => 1 });
  assert.equal(registry.activeOpenProcess().id, 'mh-intake', 'only one process is open, order must not matter');
});

test('submit() calls a registration\'s own submit() and returns whatever it returns', async () => {
  const registry = await registrySandbox();
  let called = 0;
  registry.register('session-create', { allowlist: ['city'], submit: () => { called += 1; return { id: 'session-123' }; } });
  const result = registry.submit('session-create');
  assert.equal(called, 1);
  assert.equal(result.id, 'session-123');
});

test('submit() returns undefined and never throws for an unregistered processId', async () => {
  const registry = await registrySandbox();
  assert.equal(registry.submit('nothing-registered'), undefined);
});

test('submit() returns undefined and never throws for a registration that never declared submit', async () => {
  const registry = await registrySandbox();
  registry.register('trade-wizard', { allowlist: ['entryPrice'] });
  assert.equal(registry.submit('trade-wizard'), undefined);
});

test('submit() propagates a Promise a registration\'s submit() returns, unresolved, rather than awaiting it itself', async () => {
  const registry = await registrySandbox();
  registry.register('session-create', { allowlist: ['city'], submit: () => Promise.resolve({ id: 'session-async' }) });
  const result = registry.submit('session-create');
  assert.ok(result && typeof result.then === 'function', 'submit() must hand back the Promise itself, not resolve it internally');
  assert.deepEqual(await result, { id: 'session-async' });
});

// --- openIdsWithPrefix() (Journey D checkpoint: active-entity resolution) ---

test('openIdsWithPrefix() returns every currently-open registration matching the prefix, most recently touched first', async () => {
  const registry = await registrySandbox();
  registry.register('trade-details-t1', { isOpen: () => true });
  registry.register('trade-details-t2', { isOpen: () => true });
  registry.register('strategy-editor-s1', { isOpen: () => true });
  assert.deepEqual(clone(registry.openIdsWithPrefix('trade-details-')), ['trade-details-t2', 'trade-details-t1']);
});

test('openIdsWithPrefix() excludes a matching-prefix registration that is not actually open', async () => {
  const registry = await registrySandbox();
  registry.register('trade-details-t1', { isOpen: () => false });
  registry.register('trade-details-t2', { isOpen: () => true });
  assert.deepEqual(clone(registry.openIdsWithPrefix('trade-details-')), ['trade-details-t2']);
});

test('openIdsWithPrefix() returns [] when nothing matches, never a guess', async () => {
  const registry = await registrySandbox();
  registry.register('strategy-editor-s1', { isOpen: () => true });
  assert.deepEqual(clone(registry.openIdsWithPrefix('trade-details-')), []);
});

test('openIdsWithPrefix() re-registering the same id bumps it back to the front, same rule as activeOpenProcess()', async () => {
  const registry = await registrySandbox();
  registry.register('pattern-editor-p1', { isOpen: () => true });
  registry.register('pattern-editor-p2', { isOpen: () => true });
  registry.register('pattern-editor-p1', { isOpen: () => true }); // re-touched
  assert.deepEqual(clone(registry.openIdsWithPrefix('pattern-editor-')), ['pattern-editor-p1', 'pattern-editor-p2']);
});

// --- Journey H1: layer ('topmost surface'), wizard step lockstep, field-fill bus, snapshot() ---

test('activeOpenProcess() prefers an open foreground registration over an open background one, regardless of registration order', async () => {
  const registry = await registrySandbox();
  // Background registered AFTER foreground - pure recency would have picked it; layer must win.
  registry.register('settings-trading-defaults', { layer: 'background', isOpen: () => true, activeStep: () => null });
  registry.register('trade-wizard', { layer: 'foreground', isOpen: () => true, activeStep: () => 1 });
  registry.register('some-later-background-thing', { layer: 'background', isOpen: () => true, activeStep: () => null });
  assert.equal(registry.activeOpenProcess().id, 'trade-wizard', 'an open foreground surface always outranks an open background one');
});

test('activeOpenProcess() still applies the existing recency rule within the same layer', async () => {
  const registry = await registrySandbox();
  registry.register('pattern-editor-p1', { layer: 'foreground', isOpen: () => true, activeStep: () => null });
  registry.register('strategy-editor-s1', { layer: 'foreground', isOpen: () => true, activeStep: () => null });
  assert.equal(registry.activeOpenProcess().id, 'strategy-editor-s1', 'same layer: most recently (re-)registered still wins');
});

test('a registration that omits layer defaults to background, unaffected unless something foreground is also open', async () => {
  const registry = await registrySandbox();
  registry.register('settings-trading-defaults', {}); // no layer key at all - every pre-Journey-H1 call site
  assert.equal(registry.activeOpenProcess(), null, 'not open yet');
});

test('snapshot(processId) returns { open, step, layer, revision } for one registration, and a safe default for an unknown id', async () => {
  const registry = await registrySandbox();
  registry.register('trade-wizard', { layer: 'foreground', isOpen: () => true, activeStep: () => 2 });
  assert.deepEqual(clone(registry.snapshot('trade-wizard')), { open: true, step: 2, layer: 'foreground', revision: 1 });
  assert.deepEqual(clone(registry.snapshot('never-registered')), { open: false, step: null, layer: null, revision: null });
});

test('applyValue() drives goToStep() before applyValue() when stepForPath resolves a step other than the current one', async () => {
  const registry = await registrySandbox();
  const calls = [];
  let step = 1;
  registry.register('trade-wizard', {
    allowlist: ['entryPrice'],
    activeStep: () => step,
    stepForPath: (path) => (path === 'entryPrice' ? 2 : null),
    goToStep: (n) => { calls.push(['goToStep', n]); step = n; },
    applyValue: (path, value) => { calls.push(['applyValue', path, value, step]); }
  });
  registry.applyValue('trade-wizard', 'entryPrice', '1950', 'replace');
  assert.deepEqual(calls, [['goToStep', 2], ['applyValue', 'entryPrice', '1950', 2]], 'goToStep must run BEFORE applyValue, and applyValue must see the already-advanced step');
});

test('applyValue() never calls goToStep when stepForPath has no opinion (returns null) about this field', async () => {
  const registry = await registrySandbox();
  const calls = [];
  registry.register('trade-wizard', {
    allowlist: ['chartNote'],
    activeStep: () => 1,
    stepForPath: () => null,
    goToStep: (n) => calls.push(['goToStep', n]),
    applyValue: (path, value) => calls.push(['applyValue', path, value])
  });
  registry.applyValue('trade-wizard', 'chartNote', 'looks clean', 'replace');
  assert.deepEqual(calls, [['applyValue', 'chartNote', 'looks clean']]);
});

test('applyValue() never calls goToStep when the field\'s step already matches the current step', async () => {
  const registry = await registrySandbox();
  const calls = [];
  registry.register('trade-wizard', {
    allowlist: ['entryPrice'],
    activeStep: () => 2,
    stepForPath: () => 2,
    goToStep: (n) => calls.push(['goToStep', n]),
    applyValue: (path, value) => calls.push(['applyValue', path, value])
  });
  registry.applyValue('trade-wizard', 'entryPrice', '1950', 'replace');
  assert.deepEqual(calls, [['applyValue', 'entryPrice', '1950']]);
});

test('applyValue() emits on TradeJournalAIFieldFillBus (when present) with the process id, path, and {value, mode} - AFTER the real value already landed', async () => {
  const sandbox = { window: {} };
  const order = [];
  sandbox.window.TradeJournalAIFieldFillBus = { emit: (processId, path, meta) => order.push(['bus-emit', processId, path, meta.value, meta.mode]) };
  vm.runInNewContext(await source('ai-process-registry.js'), sandbox, { filename: 'ai-process-registry.js' });
  const registry = sandbox.window.TradeJournalAIProcessRegistry;
  registry.register('session-create', { allowlist: ['city'], applyValue: (path, value) => order.push(['real-applyValue', path, value]) });
  registry.applyValue('session-create', 'city', 'newYork', 'replace');
  assert.deepEqual(order, [
    ['real-applyValue', 'city', 'newYork'],
    ['bus-emit', 'session-create', 'city', 'newYork', 'replace']
  ], 'the bus is a presentation signal only - it must fire strictly after the real write, never before or instead of it');
});

test('applyValue() never throws when TradeJournalAIFieldFillBus is absent (every character page loads it, but the write path must not hard-depend on it)', async () => {
  const registry = await registrySandbox();
  registry.register('session-create', { allowlist: ['city'], applyValue: () => {} });
  assert.deepEqual(clone(registry.applyValue('session-create', 'city', 'newYork', 'replace')), { applied: true, value: 'newYork' });
});

test('applyValue() never throws when TradeJournalAIFieldFillBus.emit itself throws - the real write must already be committed either way', async () => {
  const sandbox = { window: {} };
  sandbox.window.TradeJournalAIFieldFillBus = { emit: () => { throw new Error('presentation layer blew up'); } };
  vm.runInNewContext(await source('ai-process-registry.js'), sandbox, { filename: 'ai-process-registry.js' });
  const registry = sandbox.window.TradeJournalAIProcessRegistry;
  let applied = null;
  registry.register('session-create', { allowlist: ['city'], applyValue: (path, value) => { applied = [path, value]; } });
  assert.deepEqual(clone(registry.applyValue('session-create', 'city', 'newYork', 'replace')), { applied: true, value: 'newYork' });
  assert.deepEqual(applied, ['city', 'newYork']);
});
