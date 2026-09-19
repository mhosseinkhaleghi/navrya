import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import * as serverNormalize from '../server/db/analysis-profile-normalize.mjs';
import { CONCEPT_CASES, UNDERSTANDING_CASES, oversizedUnderstandingSummary } from './helpers/analysis-profile-memory-fixtures.mjs';

// Analysis Profile engine-memory fields (concepts / understanding, 069_analysis_profile_memory
// .sql). Two independent implementations exist by necessity - server/db/analysis-profile-
// normalize.mjs (real ESM, imported by both repo.pg.mjs and repo.memory.mjs) and a classic-script
// twin inside public/pages/shared/analysis-profile-store.js (the browser store) - this file runs
// the SAME fixtures against both, the only thing that actually proves they cannot drift apart.
// Same harness/convention as tests/analysis-profile-authoring-fields.test.mjs.

const root = process.cwd();
async function loadClientHelpers() {
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: false, userId: null, user: null, csrfToken: null } },
    document: { body: { appendChild() {} }, documentElement: { lang: 'en' }, createElement: () => ({ setAttribute() {} }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    fetch: async () => ({ ok: false, status: 500 }),
    setTimeout: (fn) => fn(),
    URL
  };
  sandbox.window = Object.assign(sandbox.window, { dispatchEvent() {}, addEventListener() {} });
  vm.createContext(sandbox);
  const shared = (file) => readFile(path.join(root, 'public', 'pages', 'shared', file), 'utf8');
  vm.runInContext(await shared('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInContext(await shared('analysis-style-registry.js'), sandbox, { filename: 'analysis-style-registry.js' });
  vm.runInContext(await shared('analysis-focus-registry.js'), sandbox, { filename: 'analysis-focus-registry.js' });
  vm.runInContext(await shared('analysis-profile-store.js'), sandbox, { filename: 'analysis-profile-store.js' });
  return sandbox.window.TradeJournalAnalysisProfileStore.helpers;
}

// vm-sandboxed objects/arrays are cross-realm - deepStrictEqual (node:assert/strict's deepEqual)
// also compares prototypes, so re-serialize through JSON before comparing, same fix
// tests/analysis-profile-authoring-fields.test.mjs already applies.
const plain = (value) => JSON.parse(JSON.stringify(value));

function describeImpl(name, normalizeConcepts, normalizeUnderstanding) {
  test(`[${name}] normalizeConcepts fixtures`, () => {
    for (const testCase of CONCEPT_CASES) {
      const result = normalizeConcepts(testCase.input);
      assert.equal(result.length, testCase.expectLength, testCase.name + ' (length)');
      if (testCase.expectFirst) {
        for (const key of Object.keys(testCase.expectFirst)) {
          assert.equal(result[0][key], testCase.expectFirst[key], `${testCase.name} (${key})`);
        }
      }
      if (testCase.expectLengths) {
        assert.equal(result[0].title.length, testCase.expectLengths.title, testCase.name + ' (title length cap)');
        assert.equal(result[0].description.length, testCase.expectLengths.description, testCase.name + ' (description length cap)');
      }
    }
  });

  test(`[${name}] normalizeConcepts never throws on malformed input`, () => {
    const malformed = [null, undefined, 42, 'x', {}, [null, undefined, 42, 'x', {}]];
    for (const value of malformed) assert.doesNotThrow(() => normalizeConcepts(value));
  });

  test(`[${name}] normalizeUnderstanding fixtures`, () => {
    for (const testCase of UNDERSTANDING_CASES) {
      assert.deepEqual(plain(normalizeUnderstanding(testCase.input)), testCase.expected, testCase.name);
    }
  });

  test(`[${name}] normalizeUnderstanding caps an oversized summary and never throws on malformed input`, () => {
    const result = normalizeUnderstanding({ summary: oversizedUnderstandingSummary(), version: 1 });
    assert.equal(result.summary.length, 4000);
    for (const value of [null, undefined, 42, 'x', []]) assert.doesNotThrow(() => normalizeUnderstanding(value));
  });
}

describeImpl('server', serverNormalize.normalizeConcepts, serverNormalize.normalizeUnderstanding);

test('client and server agree on the exact same fixtures', async () => {
  const client = await loadClientHelpers();
  describeImpl('client', client.normalizeConcepts, client.normalizeUnderstanding);
});

test('server makeConcept-equivalent (client only) creates a fresh, unique, valid concept from a title/description/priority triple', async () => {
  const client = await loadClientHelpers();
  const made = client.makeConcept({ title: '  Swept liquidity levels  ', description: 'stop hunts', priority: 'mandatory' });
  assert.ok(made);
  assert.equal(made.title, 'Swept liquidity levels');
  assert.equal(made.priority, 'mandatory');
  assert.equal(made.enabled, true);
  assert.match(made.id, /^cpt-/);
  assert.equal(client.makeConcept({ title: '   ' }), null, 'an empty title must never create a concept');
});

test('concepts and custom focuses use the same folded-title dedup key (foldFocusName), so both fixture sets stay consistent with each other', async () => {
  const client = await loadClientHelpers();
  assert.equal(serverNormalize.foldFocusName('Order Block Mitigation'), client.foldFocusName('Order Block Mitigation'));
});
