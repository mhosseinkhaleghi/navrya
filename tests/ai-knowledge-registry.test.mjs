import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

const clone = value => JSON.parse(JSON.stringify(value));

async function knowledgeSandbox(overrides) {
  const sandbox = { window: {} };
  sandbox.window = Object.assign(sandbox.window, { TradeJournalAIActionRegistry: (overrides || {}).actionRegistry });
  vm.runInNewContext(await source('ai-knowledge-registry.js'), sandbox, { filename: 'ai-knowledge-registry.js' });
  return sandbox.window.TradeJournalAIKnowledgeRegistry;
}

const REQUIRED_DOMAIN_IDS = ['dashboard', 'sessions', 'trade-planning', 'strategies', 'patterns', 'reports', 'psychology', 'ai-assistant', 'community', 'account', 'settings', 'character'];

test('every required real NAVRYA domain is registered', async () => {
  const registry = await knowledgeSandbox();
  const ids = registry.listDomains().map((d) => d.id);
  REQUIRED_DOMAIN_IDS.forEach((id) => assert.ok(ids.indexOf(id) > -1, 'missing domain: ' + id));
});

test('getDomain() returns a full entry with every field defaulted', async () => {
  const registry = await knowledgeSandbox();
  const dashboard = registry.getDomain('dashboard');
  assert.equal(dashboard.id, 'dashboard');
  assert.ok(dashboard.title.length > 0);
  assert.ok(Array.isArray(dashboard.entities));
  assert.ok(Array.isArray(dashboard.relatedDomains));
});

test('getDomain() returns null for an unknown id, never a guessed/fabricated entry', async () => {
  const registry = await knowledgeSandbox();
  assert.equal(registry.getDomain('does-not-exist'), null);
});

test('registerKnowledgeDomain() rejects a duplicate id rather than silently overwriting it', async () => {
  const registry = await knowledgeSandbox();
  const before = registry.getDomain('dashboard').title;
  const result = registry.registerKnowledgeDomain({ id: 'dashboard', title: 'Fake Overwrite' });
  assert.equal(result, null);
  assert.equal(registry.getDomain('dashboard').title, before);
});

test('registerKnowledgeDomain() rejects malformed input (no id) without throwing', async () => {
  const registry = await knowledgeSandbox();
  assert.equal(registry.registerKnowledgeDomain({ title: 'no id here' }), null);
  assert.equal(registry.registerKnowledgeDomain(null), null);
});

test('a future, fake domain can register without touching any existing core logic', async () => {
  const registry = await knowledgeSandbox();
  const before = registry.listDomains().length;
  const registered = registry.registerKnowledgeDomain({ id: 'future-voice', title: 'Voice', description: 'A future voice input domain.' });
  assert.ok(registered);
  assert.equal(registry.listDomains().length, before + 1);
  assert.equal(registry.getDomain('future-voice').title, 'Voice');
});

// ---- real relationships only reference domains/entities that actually exist ----

test('every relatedDomains reference points at a real, registered domain id', async () => {
  const registry = await knowledgeSandbox();
  const ids = registry.listDomains().map((d) => d.id);
  registry.listDomains().forEach((domain) => {
    (domain.relatedDomains || []).forEach((relatedId) => {
      assert.ok(ids.indexOf(relatedId) > -1, domain.id + ' references unknown related domain: ' + relatedId);
    });
  });
});

// ---- actions knowledge generated live from the real Action Registry, never hand-duplicated ----

test('actionsKnowledge() reflects whatever the real Action Registry currently reports, live', async () => {
  const actionRegistry = { catalogFor: () => [{ id: 'trade.calculator', description: 'Plan a trade', aliases: [], requiredFields: ['riskPercent'], optionalFields: [] }] };
  const registry = await knowledgeSandbox({ actionRegistry });
  assert.deepEqual(clone(registry.actionsKnowledge()), [{ id: 'trade.calculator', description: 'Plan a trade', aliases: [], requiredFields: ['riskPercent'], optionalFields: [] }]);
});

test('actionsKnowledge() never fabricates an action when no Action Registry is present', async () => {
  const registry = await knowledgeSandbox({});
  assert.deepEqual(clone(registry.actionsKnowledge()), []);
});

test('actionsKnowledge() never throws if the real registry itself throws', async () => {
  const registry = await knowledgeSandbox({ actionRegistry: { catalogFor: () => { throw new Error('boom'); } } });
  assert.deepEqual(clone(registry.actionsKnowledge()), []);
});

// ---- deterministic lexical search ----

test('search() finds the Sessions domain for a query mentioning "scenario"', async () => {
  const registry = await knowledgeSandbox();
  const results = registry.search('what is a scenario');
  assert.ok(results.some((d) => d.id === 'sessions'));
});

test('search() finds the Strategies domain for a query mentioning "max risk"', async () => {
  const registry = await knowledgeSandbox();
  const results = registry.search('what does strategy max risk affect');
  assert.ok(results.some((d) => d.id === 'strategies'));
});

test('search() finds the Psychology domain for a mental-health-adjacent query', async () => {
  const registry = await knowledgeSandbox();
  const results = registry.search('where can I review my psychology profile');
  assert.ok(results.some((d) => d.id === 'psychology'));
});

test('search() returns an empty array for an empty/unrelated query rather than guessing a domain', async () => {
  const registry = await knowledgeSandbox();
  assert.deepEqual(clone(registry.search('')), []);
  assert.deepEqual(clone(registry.search('zzzzz qqqqq')), []);
});

test('search() respects a limit option', async () => {
  const registry = await knowledgeSandbox();
  const results = registry.search('trade session strategy pattern', { limit: 2 });
  assert.ok(results.length <= 2);
});

// ---- honest, non-hallucinated coverage of known real gaps ----

test('the reports domain honestly documents that it is legacy/unreachable, never presented as live navigation', async () => {
  const registry = await knowledgeSandbox();
  const reports = registry.getDomain('reports');
  assert.ok(reports.notes && reports.notes.toLowerCase().indexOf('legacy') > -1);
});

test('the community domain documents marketplace purchases as an explicit mock, not real billing', async () => {
  const registry = await knowledgeSandbox();
  const community = registry.getDomain('community');
  assert.ok(community.notes && community.notes.toLowerCase().indexOf('mock') > -1);
});
