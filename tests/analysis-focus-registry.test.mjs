import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Analysis Profiles domain (see ARCHITECTURE.md §7.25). See analysis-style-registry.test.mjs's
// own header comment for why this uses a minimal vm sandbox and avoids assert.deepEqual against
// plain outer-realm literals.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');
const LANGS = ['fa', 'ar', 'en', 'es'];

async function loadRegistries() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(await source('analysis-style-registry.js'), sandbox, { filename: 'analysis-style-registry.js' });
  vm.runInContext(await source('analysis-focus-registry.js'), sandbox, { filename: 'analysis-focus-registry.js' });
  return { styles: sandbox.window.TradeJournalAnalysisStyleRegistry, focuses: sandbox.window.TradeJournalAnalysisFocusRegistry };
}
async function loadFocusOnly() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(await source('analysis-focus-registry.js'), sandbox, { filename: 'analysis-focus-registry.js' });
  return sandbox.window.TradeJournalAnalysisFocusRegistry;
}

test('registers window.TradeJournalAnalysisFocusRegistry with a comprehensive, reusable catalog', async () => {
  const { focuses } = await loadRegistries();
  assert.ok(focuses);
  assert.ok(focuses.list().length >= 40, 'the focus catalog must be comprehensive, not a handful of stubs');
});

test('every focus id is unique', async () => {
  const { focuses } = await loadRegistries();
  const ids = focuses.list().map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every focus has a real, non-empty name and shortDescription in all four languages', async () => {
  const { focuses } = await loadRegistries();
  focuses.list().forEach((focus) => {
    LANGS.forEach((lang) => {
      assert.ok(focus.name && focus.name[lang] && focus.name[lang].trim(), focus.id + ' missing name.' + lang);
      assert.ok(focus.shortDescription && focus.shortDescription[lang] && focus.shortDescription[lang].trim(), focus.id + ' missing shortDescription.' + lang);
    });
  });
});

test('get()/isValidFocusId() look up by stable id, never a translated string', async () => {
  const { focuses } = await loadRegistries();
  assert.ok(focuses.isValidFocusId('market_structure'));
  assert.equal(focuses.get('market_structure').id, 'market_structure');
  assert.equal(focuses.isValidFocusId('ساختار بازار'), false, 'a Persian display string must never resolve as a valid id');
  assert.equal(focuses.isValidFocusId('not_a_real_focus'), false);
});

test('categories() covers every category actually used by a focus, with a name in all four languages', async () => {
  const { focuses } = await loadRegistries();
  const categoryIds = new Set(focuses.categories().map((c) => c.id));
  focuses.list().forEach((focus) => assert.ok(categoryIds.has(focus.category), focus.id + ' has an unregistered category: ' + focus.category));
  focuses.categories().forEach((cat) => LANGS.forEach((lang) => assert.ok(cat.name[lang] && cat.name[lang].trim())));
});

test('forStyle() resolves a style\'s recommended/optional focus ids to real Focus definitions, in order', async () => {
  const { focuses } = await loadRegistries();
  const resolved = focuses.forStyle('price_action');
  assert.ok(resolved.recommended.length > 0);
  assert.equal(resolved.recommended[0].id, 'market_structure');
  resolved.recommended.forEach((f) => assert.equal(typeof f.name, 'object'));
});

test('forStyle() returns empty arrays for an unknown style rather than throwing', async () => {
  const { focuses } = await loadRegistries();
  const resolved = focuses.forStyle('not_a_real_style');
  assert.equal(resolved.recommended.length, 0);
  assert.equal(resolved.optional.length, 0);
});

test('compatibleStyles() is computed live from the Style Registry, never a hand-duplicated reverse list', async () => {
  const { focuses } = await loadRegistries();
  const compatible = focuses.compatibleStyles('momentum');
  assert.ok(compatible.indexOf('price_action') > -1);
  assert.ok(compatible.indexOf('momentum_analysis') > -1);
});

test('compatibleStyles() degrades to an empty array when the Style Registry has not loaded yet, never throws', async () => {
  const focuses = await loadFocusOnly();
  const result = focuses.compatibleStyles('momentum');
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('required-input metadata is present without being AI-executable: a volume-profile-only focus declares structured_volume_profile, not an empty/default requirement', async () => {
  const { focuses } = await loadRegistries();
  const poc = focuses.get('poc');
  assert.ok(poc.requiredInputs.indexOf('structured_volume_profile') > -1);
  const delta = focuses.get('delta');
  assert.ok(delta.requiredInputs.indexOf('visible_orderflow_chart') > -1);
});

test('no focus stores an AI freedom/strictness/creativity field anywhere - out of scope by design', async () => {
  const { focuses } = await loadRegistries();
  const forbidden = /freedom|strictness|creativity|explorationMode/i;
  focuses.list().forEach((focus) => assert.doesNotMatch(JSON.stringify(focus), forbidden));
});
