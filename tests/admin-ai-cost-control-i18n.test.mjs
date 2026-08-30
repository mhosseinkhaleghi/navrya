import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// AI Cost Control admin sub-tab - every new comSubAiCostControl/aiccXxx/aiCostReconXxx/
// aiCostSettlementsTitle/aiCostCashDebit/aiCostPromoDebit key introduced in
// public/pages/admin/app.js must exist in all four language blocks (fa/ar/en/es), never silently
// falling back past `en` (t()'s own fallback would otherwise hide a missing translation). Mirrors
// tests/admin-crypto-payments-i18n.test.mjs's identical convention/helpers exactly.
const root = process.cwd();
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');

function extractLangBlock(src, langMarker, nextMarkers) {
  const start = src.indexOf(langMarker);
  assert.ok(start > -1, `language block "${langMarker}" must exist`);
  let end = src.length;
  for (const marker of nextMarkers) {
    const idx = src.indexOf(marker, start + langMarker.length);
    if (idx > -1 && idx < end) end = idx;
  }
  return src.slice(start, end);
}

function keysDefinedIn(block) {
  const keys = new Set();
  const re = /(\w+):\s*'/g;
  let match;
  while ((match = re.exec(block))) keys.add(match[1]);
  return keys;
}

test('every comSubAiCostControl/aiccXxx/aiCostRecon* admin key exists in all four language blocks in public/pages/admin/app.js', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  const markers = ['\n  fa: {', '\n  ar: {', '\n  es: {', '\n};'];
  const enStart = src.indexOf('const translations = {') + 'const translations = {'.length;
  const enBlock = src.slice(enStart, src.indexOf(markers[0]));
  const faBlock = extractLangBlock(src, markers[0], markers.slice(1));
  const arBlock = extractLangBlock(src, markers[1], markers.slice(2));
  const esBlock = extractLangBlock(src, markers[2], markers.slice(3));
  const enKeys = Array.from(keysDefinedIn(enBlock)).filter((k) =>
    k === 'comSubAiCostControl' || k.startsWith('aicc') || k.startsWith('aiCostRecon') ||
    k === 'aiCostSettlementsTitle' || k === 'aiCostCashDebit' || k === 'aiCostPromoDebit'
  );
  assert.ok(enKeys.length >= 85, 'sanity check - this feature added a large number of aicc*/aiCostRecon* keys');
  const faKeys = keysDefinedIn(faBlock), arKeys = keysDefinedIn(arBlock), esKeys = keysDefinedIn(esBlock);
  for (const key of enKeys) {
    assert.ok(faKeys.has(key), `fa is missing admin key "${key}"`);
    assert.ok(arKeys.has(key), `ar is missing admin key "${key}"`);
    assert.ok(esKeys.has(key), `es is missing admin key "${key}"`);
  }
});

test('the new AI Cost Control sub-tab is registered in both the sub-nav and the builder dispatch table', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  assert.match(src, /\['aiCostControl',\s*t\('comSubAiCostControl'\)\]/);
  assert.match(src, /aiCostControl:\s*commercialAiCostControlSubTab/);
});
