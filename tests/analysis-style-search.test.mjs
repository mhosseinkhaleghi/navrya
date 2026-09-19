import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Analysis Profile wizard, Step 1 search box (and the list search): the style registry owns one
// search()/normalizeSearchText() pair so every surface matches identically. Pure data - a bare
// { window: {} } sandbox is enough, same technique as tests/analysis-style-registry.test.mjs.
const root = process.cwd();
async function loadRegistry() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  const file = path.join(root, 'public', 'pages', 'shared', 'analysis-style-registry.js');
  vm.runInContext(await readFile(file, 'utf8'), sandbox, { filename: 'analysis-style-registry.js' });
  return sandbox.window.TradeJournalAnalysisStyleRegistry;
}

test('an empty (or whitespace-only) query returns the whole catalog in catalog order', async () => {
  const registry = await loadRegistry();
  assert.deepEqual(registry.search('').map((s) => s.id), registry.list().map((s) => s.id));
  assert.deepEqual(registry.search('   ').map((s) => s.id), registry.list().map((s) => s.id));
});

test('normalizeSearchText folds the Arabic/Persian keyboard forms, ZWNJ, diacritics, digits and case to one canonical form', async () => {
  const { normalizeSearchText } = await loadRegistry();
  assert.equal(normalizeSearchText('ايچيموكو'), normalizeSearchText('ایچیموکو'), 'Arabic yeh/kaf must fold to the Persian forms');
  assert.equal(normalizeSearchText('پرایس‌اکشن'), 'پرایساکشن', 'ZWNJ is dropped');
  assert.equal(normalizeSearchText('Ichimoku  KINKO-hyo'), 'ichimoku kinko hyo');
  assert.equal(normalizeSearchText('۱۲۳ ١٢٣'), '123 123', 'Persian and Arabic-Indic digits fold to ASCII');
  assert.equal(normalizeSearchText(null), '');
  assert.equal(normalizeSearchText('Café'), 'cafe');
});

test('finds a style by its English name, in any case', async () => {
  const registry = await loadRegistry();
  const results = registry.search('ELLIOTT');
  assert.ok(results.length > 0);
  assert.equal(results[0].id, 'elliott_wave');
});

test('finds a style by its Persian name, with and without the space or ZWNJ typed in a compound', async () => {
  const registry = await loadRegistry();
  const price = registry.get('price_action');
  assert.equal(registry.search(price.name.fa)[0].id, 'price_action');
  assert.ok(registry.search(price.name.fa.replace(/\s+/g, '')).some((s) => s.id === 'price_action'), 'an unspaced query must still find it');
  assert.ok(registry.search(price.name.fa.replace(/\s+/g, '‌')).some((s) => s.id === 'price_action'), 'a ZWNJ-joined query must still find it');
});

test('a query typed on an Arabic keyboard (ي/ك) still finds the Persian-spelled style', async () => {
  const registry = await loadRegistry();
  const persian = registry.get('ichimoku').name.fa;
  const arabicKeyboard = persian.replace(/ی/g, 'ي').replace(/ک/g, 'ك');
  assert.notEqual(arabicKeyboard, persian, 'the fixture must actually differ from the stored spelling');
  assert.equal(registry.search(arabicKeyboard)[0].id, 'ichimoku');
});

test('finds a style by its stable id and by a core-concept or category word', async () => {
  const registry = await loadRegistry();
  assert.ok(registry.search('smc').some((s) => s.id === 'smc'));
  assert.ok(registry.search('liquidity').length > 1, 'a concept word should match several styles');
  const category = registry.categories()[1];
  assert.ok(registry.search(category.name.en).length > 0, 'a category label is searchable');
});

test('every whitespace-separated token must match (AND), so a nonsense extra word yields nothing', async () => {
  const registry = await loadRegistry();
  assert.ok(registry.search('price action').length > 0);
  assert.equal(registry.search('price action zzqxj').length, 0);
});

test('a name match outranks a description-only match', async () => {
  const registry = await loadRegistry();
  const results = registry.search('liquidity');
  const firstWithNameHit = results.findIndex((s) => Object.values(s.name).some((n) => /liquidity|نقدینگی/i.test(n)));
  const firstDescriptionOnly = results.findIndex((s) => !Object.values(s.name).some((n) => /liquidity|نقدینگی/i.test(n)));
  assert.equal(firstWithNameHit, 0, 'a style whose own name says liquidity must lead the results');
  assert.ok(firstDescriptionOnly === -1 || firstDescriptionOnly > firstWithNameHit);
});

test('every catalog style can be found again by typing its own name in every language', async () => {
  const registry = await loadRegistry();
  for (const style of registry.list()) {
    for (const lang of ['fa', 'ar', 'en', 'es']) {
      assert.ok(registry.search(style.name[lang]).some((s) => s.id === style.id), `${style.id} must be findable by its ${lang} name "${style.name[lang]}"`);
    }
  }
});

test('search results are deterministic and never mutate the catalog', async () => {
  const registry = await loadRegistry();
  const before = registry.list().map((s) => s.id).join(',');
  const a = registry.search('trend').map((s) => s.id).join(',');
  const b = registry.search('trend').map((s) => s.id).join(',');
  assert.equal(a, b);
  assert.equal(registry.list().map((s) => s.id).join(','), before);
});
