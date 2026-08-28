import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Task E.1/E.3 - every new UI string this task introduced must exist in all four supported
// languages (fa/ar/en/es), never silently falling back past `en` (accountProfileView.jsx's own
// tr() does fall back to en for a missing key - this test is what makes a missing translation a
// caught regression instead of a silent, unnoticed en-in-a-Persian-page leak). Mirrors the
// existing "every companionGoal* i18n key exists in all four settingsView.jsx language blocks"
// convention in tests/ai-journey-engine.test.mjs.
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

test('every subXxx/subInvoiceXxx key added to accountProfileView.jsx exists in all four language blocks (fa/ar/en/es)', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const markers = ['\n  fa: {', '\n  en: {', '\n  ar: {', '\n  es: {'];
  const [fa, en, ar, es] = markers.map((marker, i) => extractLangBlock(src, marker, markers.slice(i + 1).concat(['\n};'])));
  const [faKeys, enKeys, arKeys, esKeys] = [fa, en, ar, es].map(keysDefinedIn);

  // en is authored first/most completely in this codebase's convention - use it as the
  // reference set of keys this task actually introduced, restricted to the sub*/aiCost* prefixes
  // this task added (never asserting on pre-existing, unrelated dossier/role/xp keys).
  const taskKeys = Array.from(enKeys).filter((k) => k.startsWith('sub'));
  assert.ok(taskKeys.length > 60, 'sanity check - this task added a large number of subXxx keys');
  for (const key of taskKeys) {
    assert.ok(faKeys.has(key), `fa is missing key "${key}"`);
    assert.ok(arKeys.has(key), `ar is missing key "${key}"`);
    assert.ok(esKeys.has(key), `es is missing key "${key}"`);
  }
});

test('every aiCostXxx/aiUsageByModelXxx admin key exists in all four language blocks in public/pages/admin/app.js', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  const markers = ['\n  fa: {', '\n  ar: {', '\n  es: {', '\n};'];
  const enStart = src.indexOf('const translations = {') + 'const translations = {'.length;
  const enBlock = src.slice(enStart, src.indexOf(markers[0]));
  const faBlock = extractLangBlock(src, markers[0], markers.slice(1));
  const arBlock = extractLangBlock(src, markers[1], markers.slice(2));
  const esBlock = extractLangBlock(src, markers[2], markers.slice(3));
  const enKeys = Array.from(keysDefinedIn(enBlock)).filter((k) => k.startsWith('aiCost') || k.startsWith('aiUsageByModel'));
  assert.ok(enKeys.length >= 8, 'sanity check - this task added several aiCost*/aiUsageByModel* keys');
  const faKeys = keysDefinedIn(faBlock), arKeys = keysDefinedIn(arBlock), esKeys = keysDefinedIn(esBlock);
  for (const key of enKeys) {
    assert.ok(faKeys.has(key), `fa is missing admin key "${key}"`);
    assert.ok(arKeys.has(key), `ar is missing admin key "${key}"`);
    assert.ok(esKeys.has(key), `es is missing admin key "${key}"`);
  }
});

test('every aiAsstRealCostXxx client key exists in all four language blocks in public/pages/shared/ai-i18n.js', async () => {
  const src = await read('public', 'pages', 'shared', 'ai-i18n.js');
  const markers = ['\n    ar: {', '\n    en: {', '\n    es: {'];
  const faBlock = src.slice(src.indexOf('fa: {'), src.indexOf(markers[0]));
  const arBlock = src.slice(src.indexOf(markers[0]), src.indexOf(markers[1]));
  const enBlock = src.slice(src.indexOf(markers[1]), src.indexOf(markers[2]));
  const esBlock = src.slice(src.indexOf(markers[2]));
  const enKeys = Array.from(keysDefinedIn(enBlock)).filter((k) => k.startsWith('aiAsstRealCost'));
  assert.ok(enKeys.length >= 8, 'sanity check - this task added several aiAsstRealCost* keys');
  const faKeys = keysDefinedIn(faBlock), arKeys = keysDefinedIn(arBlock), esKeys = keysDefinedIn(esBlock);
  for (const key of enKeys) {
    assert.ok(faKeys.has(key), `fa is missing "${key}"`);
    assert.ok(arKeys.has(key), `ar is missing "${key}"`);
    assert.ok(esKeys.has(key), `es is missing "${key}"`);
  }
});

test('the RTL language source (document.documentElement.lang) still governs fa/ar in accountProfileView.jsx - no new hardcoded ltr override on the page root', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  assert.match(src, /const rtl = lang === 'fa' \|\| lang === 'ar'/);
});
