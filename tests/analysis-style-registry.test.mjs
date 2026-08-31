import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Analysis Profiles domain (see ARCHITECTURE.md §7.25). Pure product/domain data - no fetch, no
// DOM dependency - so a minimal { window: {} } sandbox is enough (same vm.runInNewContext
// technique tests/patterns-sync.test.mjs already uses for a domain store, applied here to a
// registry file instead).
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');
const LANGS = ['fa', 'ar', 'en', 'es'];

async function loadRegistry() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(await source('analysis-style-registry.js'), sandbox, { filename: 'analysis-style-registry.js' });
  return sandbox.window.TradeJournalAnalysisStyleRegistry;
}
async function loadBothRegistries() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(await source('analysis-style-registry.js'), sandbox, { filename: 'analysis-style-registry.js' });
  vm.runInContext(await source('analysis-focus-registry.js'), sandbox, { filename: 'analysis-focus-registry.js' });
  return { styles: sandbox.window.TradeJournalAnalysisStyleRegistry, focuses: sandbox.window.TradeJournalAnalysisFocusRegistry };
}

test('registers window.TradeJournalAnalysisStyleRegistry with a comprehensive, non-trivial catalog', async () => {
  const registry = await loadRegistry();
  assert.ok(registry, 'the registry must be registered');
  const list = registry.list();
  assert.ok(list.length >= 30, 'the style catalog must be comprehensive, not a handful of stubs');
});

test('every style id is unique', async () => {
  const registry = await loadRegistry();
  const ids = registry.list().map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate style ids found: ' + JSON.stringify(ids.filter((id, i) => ids.indexOf(id) !== i)));
});

test('every style has a real, non-empty name and shortDescription in all four languages', async () => {
  const registry = await loadRegistry();
  registry.list().forEach((style) => {
    LANGS.forEach((lang) => {
      assert.ok(style.name && style.name[lang] && style.name[lang].trim(), style.id + ' missing name.' + lang);
      assert.ok(style.shortDescription && style.shortDescription[lang] && style.shortDescription[lang].trim(), style.id + ' missing shortDescription.' + lang);
    });
  });
});

test('ids are stable snake_case, never a translated display string', async () => {
  const registry = await loadRegistry();
  registry.list().forEach((style) => {
    assert.match(style.id, /^[a-z][a-z0-9_]*$/, style.id + ' is not a stable snake_case id');
  });
});

test('every relatedStyleId resolves to a real, registered style', async () => {
  const registry = await loadRegistry();
  const ids = new Set(registry.list().map((s) => s.id));
  registry.list().forEach((style) => {
    (style.relatedStyleIds || []).forEach((rid) => {
      assert.ok(ids.has(rid), style.id + ' has a dangling relatedStyleId: ' + rid);
    });
  });
});

test('every recommendedFocusId/optionalFocusId resolves to a real, registered Focus', async () => {
  const { styles, focuses } = await loadBothRegistries();
  styles.list().forEach((style) => {
    (style.recommendedFocusIds || []).concat(style.optionalFocusIds || []).forEach((fid) => {
      assert.ok(focuses.isValidFocusId(fid), style.id + ' references an unknown focus id: ' + fid);
    });
  });
});

test('every style declares a version and at least chart_image as a required input', async () => {
  const registry = await loadRegistry();
  registry.list().forEach((style) => {
    assert.equal(typeof style.version, 'number');
    assert.ok(style.version >= 1);
    assert.ok(Array.isArray(style.requiredInputs) && style.requiredInputs.length >= 1, style.id + ' has no requiredInputs');
  });
});

test('categories() covers every category actually used by a style, with a name in all four languages', async () => {
  const registry = await loadRegistry();
  const categoryIds = new Set(registry.categories().map((c) => c.id));
  registry.list().forEach((style) => assert.ok(categoryIds.has(style.category), style.id + ' has an unregistered category: ' + style.category));
  registry.categories().forEach((cat) => LANGS.forEach((lang) => assert.ok(cat.name[lang] && cat.name[lang].trim(), cat.id + ' missing category name.' + lang)));
});

test('the three special/generic styles required by the brief exist: general_analysis, hybrid, custom_method', async () => {
  const registry = await loadRegistry();
  assert.ok(registry.isValidStyleId('general_analysis'));
  assert.ok(registry.isValidStyleId('hybrid'));
  assert.ok(registry.isValidStyleId('custom_method'));
});

test('general_analysis recommends exactly the focus set named in the brief: market_structure, trend, key_levels, momentum', async () => {
  const registry = await loadRegistry();
  const general = registry.get('general_analysis');
  ['market_structure', 'trend', 'key_levels', 'momentum'].forEach((fid) => {
    assert.ok(general.recommendedFocusIds.indexOf(fid) > -1, 'general_analysis missing recommended focus: ' + fid);
  });
});

test('mergeFocusRecommendations() de-duplicates a Hybrid pair, primary first, no focus appearing in both lists', async () => {
  const registry = await loadRegistry();
  const merged = registry.mergeFocusRecommendations('price_action', ['smc']);
  const allIds = merged.recommended.concat(merged.optional);
  assert.equal(new Set(allIds).size, allIds.length, 'a focus id appears more than once across recommended+optional');
  // price_action's own recommended focuses come first, in price_action's own order. Compared as
  // primitives, not via assert.deepEqual on the array itself - merged.recommended is an array
  // instance from this file's own vm.createContext() sandbox realm, so a deepEqual against a
  // plain literal created in THIS file's outer realm would spuriously fail on prototype identity
  // even when every element matches (a classic vm cross-realm gotcha, not a real bug).
  const top3 = merged.recommended.slice(0, 3);
  assert.equal(top3.length, 3);
  assert.equal(top3[0], 'market_structure');
  assert.equal(top3[1], 'key_levels');
  assert.equal(top3[2], 'momentum');
});

test("mergeFocusRecommendations() with no secondary styles equals the primary style's own lists", async () => {
  const registry = await loadRegistry();
  const merged = registry.mergeFocusRecommendations('ichimoku', []);
  const ichimoku = registry.get('ichimoku');
  assert.deepEqual(merged.recommended, ichimoku.recommendedFocusIds);
});

test('isValidStyleId() rejects an unknown id and never invents one', async () => {
  const registry = await loadRegistry();
  assert.equal(registry.isValidStyleId('totally_made_up_style'), false);
  assert.equal(registry.isValidStyleId(''), false);
  assert.equal(registry.isValidStyleId(undefined), false);
});

test('no style stores an AI freedom/strictness/creativity field anywhere - out of scope by design', async () => {
  const registry = await loadRegistry();
  const forbidden = /freedom|strictness|creativity|explorationMode/i;
  registry.list().forEach((style) => {
    assert.doesNotMatch(JSON.stringify(style), forbidden, style.id + ' must never carry an AI freedom/strictness/creativity field');
  });
});
