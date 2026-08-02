import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

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

test('applyValue() rejects a path outside the registered allowlist and never invokes the flow\'s own applyValue', async () => {
  const registry = await registrySandbox();
  let called = null;
  registry.register('trade-emotion-log', { allowlist: ['note'], applyValue: (path, value) => { called = [path, value]; } });
  const result = registry.applyValue('trade-emotion-log', 'dominantEmotions', ['calm'], 'append');
  assert.equal(result, false);
  assert.equal(called, null, 'an out-of-allowlist path must never reach the underlying mutation function');
});

test('applyValue() for an in-allowlist path invokes the flow\'s own applyValue and reports success', async () => {
  const registry = await registrySandbox();
  let called = null;
  registry.register('trade-emotion-log', { allowlist: ['note'], applyValue: (path, value, mode) => { called = [path, value, mode]; } });
  const result = registry.applyValue('trade-emotion-log', 'note', 'felt calm at entry', 'replace');
  assert.equal(result, true);
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
  assert.equal(ok, true);
  assert.deepEqual(applySuggestionCalls, [['sug-1', 'applied']], 'the dock never mutates profile data itself - it must always go through the store\'s own applySuggestion');
});

test('registrations default isOpen/activeStep/allowlist/applyValue so a minimal register() call never throws', async () => {
  const registry = await registrySandbox();
  registry.register('bare-process', {});
  const result = registry.query('bare-process');
  assert.equal(result.open, false);
  assert.equal(result.step, null);
  assert.equal(registry.applyValue('bare-process', 'anything', 1), false);
});
