import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

// Objects built inside the vm sandbox carry that realm's own Object/Array.prototype, so
// assert.deepEqual (which node:assert/strict aliases to deepStrictEqual, prototype-sensitive)
// reports "same structure but not reference-equal" even when every field matches - the same
// caveat tests/ai-process-registry.test.mjs's own comments call out. Round-tripping through JSON
// rebuilds the value with this file's own realm's plain-object prototype before comparing.
const clone = value => JSON.parse(JSON.stringify(value));

async function registrySandbox() {
  const sandbox = { window: {} };
  vm.runInNewContext(await source('ai-action-registry.js'), sandbox, { filename: 'ai-action-registry.js' });
  return sandbox.window.TradeJournalAIActionRegistry;
}

test('registerAction() ignores a config with no id, rather than throwing', async () => {
  const registry = await registrySandbox();
  registry.registerAction({ description: 'no id here' });
  assert.deepEqual(clone(registry.catalogFor({})), []);
});

test('get() returns a registered action with every default filled in', async () => {
  const registry = await registrySandbox();
  registry.registerAction({ id: 'session.create' });
  const action = registry.get('session.create');
  assert.equal(action.id, 'session.create');
  assert.equal(action.riskLevel, 'low');
  assert.deepEqual(clone(action.requiredFields), []);
  assert.equal(typeof action.open, 'function');
  assert.equal(typeof action.submit, 'function');
  assert.equal(action.completionPolicy, 'auto-submit');
});

test('registerAction() normalizes lifecycle policy once, keeping entityAlreadyPersisted only as a legacy adapter', async () => {
  const registry = await registrySandbox();
  registry.registerAction({ id: 'legacy.persisted', entityAlreadyPersisted: true });
  registry.registerAction({ id: 'account.create', completionPolicy: 'explicit-confirm' });
  registry.registerAction({ id: 'session.analysis.run', entityAlreadyPersisted: true, completionPolicy: 'command' });

  assert.equal(registry.get('legacy.persisted').completionPolicy, 'persist-on-change');
  assert.equal(registry.get('account.create').completionPolicy, 'explicit-confirm');
  assert.equal(registry.get('session.analysis.run').completionPolicy, 'command', 'the explicit command policy must win over the legacy persisted flag');
});

test('resolveDeterministic() returns one high-confidence action only and catalogFor() supports explicit safe shortlists', async () => {
  const registry = await registrySandbox();
  registry.registerAction({
    id: 'session.create', domain: 'sessions',
    deterministicMatch: (text) => text === 'new session' ? { confidence: 'high', fields: [] } : null
  });
  registry.registerAction({ id: 'account.create', domain: 'accounts' });

  assert.deepEqual(clone(registry.catalogFor({}, { actionIds: ['account.create'] }).map((entry) => entry.id)), ['account.create']);
  assert.deepEqual(clone(registry.catalogFor({}, { domain: 'sessions' }).map((entry) => entry.id)), ['session.create']);
  assert.deepEqual(clone(registry.resolveDeterministic('new session', {})), {
    actionId: 'session.create', confidence: 'high', fields: []
  });

  registry.registerAction({
    id: 'session.reopen', domain: 'sessions',
    deterministicMatch: (text) => text === 'new session' ? { confidence: 'high', fields: [] } : null
  });
  assert.equal(registry.resolveDeterministic('new session', {}), null, 'two high-confidence matches are ambiguous and must fall back to the model');
});

test('get() returns null for an unknown action id', async () => {
  const registry = await registrySandbox();
  assert.equal(registry.get('nothing.here'), null);
});

test('catalogFor() only includes actions whose available(context) is truthy for the given context', async () => {
  const registry = await registrySandbox();
  registry.registerAction({ id: 'session.create', available: () => true });
  registry.registerAction({ id: 'trade.startPlan', available: (context) => context.navigation && context.navigation.activeId === 'trades' });
  const onSessions = registry.catalogFor({ navigation: { activeId: 'sessions' } });
  assert.deepEqual(clone(onSessions.map((a) => a.id)), ['session.create']);
  const onTrades = registry.catalogFor({ navigation: { activeId: 'trades' } });
  assert.deepEqual(clone(onTrades.map((a) => a.id)).sort(), ['session.create', 'trade.startPlan']);
});

test('catalogFor() treats a throwing available() as unavailable rather than crashing the whole catalog', async () => {
  const registry = await registrySandbox();
  registry.registerAction({ id: 'broken', available: () => { throw new Error('boom'); } });
  registry.registerAction({ id: 'fine', available: () => true });
  assert.deepEqual(clone(registry.catalogFor({}).map((a) => a.id)), ['fine']);
});

test('catalogFor() trims each entry to only the server-facing description fields, never the open/submit/resultContext functions', async () => {
  const registry = await registrySandbox();
  registry.registerAction({
    id: 'session.create', description: 'Create a new trading session',
    aliases: ['start session'], requiredFields: ['city', 'timeframe'], optionalFields: ['loop'],
    open: () => { throw new Error('open() must never be sent to the server'); }
  });
  const [entry] = registry.catalogFor({});
  assert.deepEqual(clone(entry), {
    id: 'session.create', description: 'Create a new trading session',
    aliases: ['start session'], requiredFields: ['city', 'timeframe'], optionalFields: ['loop']
  });
  assert.equal(entry.open, undefined);
});
