import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import * as serverNormalize from '../server/db/analysis-profile-normalize.mjs';
import { CUSTOM_METHOD_LINKS_CASES, CUSTOM_FOCUS_CASES } from './helpers/analysis-profile-authoring-fixtures.mjs';

// Analysis Profile authoring fields (customMethodLinks / customFocuses, 068_analysis_profile_
// authoring.sql). Two independent implementations exist by necessity - server/db/analysis-profile-
// normalize.mjs (real ESM, imported by both repo.pg.mjs and repo.memory.mjs) and a classic-script
// twin inside public/pages/shared/analysis-profile-store.js (the browser store, no ESM in that
// convention) - so this file runs the SAME fixtures against both, the only thing that actually
// proves they cannot drift apart.

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

// A vm-sandboxed implementation returns objects from a DIFFERENT realm - deepStrictEqual (what
// node:assert/strict's deepEqual is) also compares prototypes, so a cross-realm plain object never
// passes it even with identical own properties. Re-serializing through JSON strips the realm.
const plain = (value) => JSON.parse(JSON.stringify(value));

function describeImpl(name, normalizeCustomMethodLinks, normalizeCustomFocuses) {
  test(`[${name}] normalizeCustomMethodLinks fixtures`, () => {
    for (const testCase of CUSTOM_METHOD_LINKS_CASES) {
      assert.deepEqual(plain(normalizeCustomMethodLinks(testCase.input)), testCase.expected, testCase.name);
    }
  });

  test(`[${name}] normalizeCustomFocuses fixtures`, () => {
    for (const testCase of CUSTOM_FOCUS_CASES) {
      const result = normalizeCustomFocuses(testCase.input);
      assert.equal(result.length, testCase.expectLength, testCase.name + ' (length)');
      if (testCase.expectFirst) {
        for (const key of Object.keys(testCase.expectFirst)) {
          assert.equal(result[0][key], testCase.expectFirst[key], `${testCase.name} (${key})`);
        }
      }
      if (testCase.expectLengths) {
        assert.equal(result[0].name.length, testCase.expectLengths.name, testCase.name + ' (name length cap)');
        assert.equal(result[0].description.length, testCase.expectLengths.description, testCase.name + ' (description length cap)');
      }
    }
  });

  test(`[${name}] normalizeCustomFocuses never throws on malformed input`, () => {
    const malformed = [null, undefined, 42, 'x', {}, [null, undefined, 42, 'x', {}]];
    for (const value of malformed) assert.doesNotThrow(() => normalizeCustomFocuses(value));
  });
}

describeImpl('server', serverNormalize.normalizeCustomMethodLinks, serverNormalize.normalizeCustomFocuses);

test('client and server agree on the exact same fixtures', async () => {
  const client = await loadClientHelpers();
  describeImpl('client', client.normalizeCustomMethodLinks, client.normalizeCustomFocuses);
});

test('server normalizeHttpUrl/isYoutubeUrl agree with the client twin on a spot-check of tricky URLs', async () => {
  const client = await loadClientHelpers();
  const cases = [
    'https://www.youtube.com/watch?v=abc', 'https://music.youtube.com/watch?v=abc', 'https://youtu.be/abc',
    'https://vimeo.com/123', 'not a url at all', 'https://user:pw@host.example/', ''
  ];
  for (const value of cases) {
    assert.equal(serverNormalize.normalizeHttpUrl(value), client.normalizeHttpUrl(value), `normalizeHttpUrl mismatch for ${JSON.stringify(value)}`);
    assert.equal(serverNormalize.isYoutubeUrl(value), client.isYoutubeUrl(value), `isYoutubeUrl mismatch for ${JSON.stringify(value)}`);
  }
});

test('server makeCustomFocus-equivalent (client only) creates a fresh, unique, valid custom focus from a name/description pair', async () => {
  const client = await loadClientHelpers();
  const made = client.makeCustomFocus({ name: '  Liquidity pools  ', description: 'Where resting orders sit' });
  assert.ok(made);
  assert.equal(made.name, 'Liquidity pools');
  assert.equal(made.origin, 'user');
  assert.match(made.id, /^cf-/);
  assert.equal(client.makeCustomFocus({ name: '   ' }), null, 'an empty name must never create a focus');
});

test('foldFocusName agrees between server and client on Arabic/Persian keyboard forms and whitespace', async () => {
  const client = await loadClientHelpers();
  const cases = ['شمارش ایلیوت', '  Extra   Spaces  ', 'MixedCase'];
  for (const value of cases) assert.equal(serverNormalize.foldFocusName(value), client.foldFocusName(value));
});
