import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Admin-config task - every new comSubCryptoPayments/cryptoPay* key this task introduced in
// public/pages/admin/app.js must exist in all four language blocks (fa/ar/en/es), never silently
// falling back past `en` (t()'s own fallback would otherwise hide a missing translation). Mirrors
// subscription-i18n-completeness.test.mjs's identical convention/helpers exactly - this file's own
// second test already covers aiCost*/aiUsageByModel* keys in the same source file; this is the
// same pattern applied to the crypto-payments admin sub-tab's keys.
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

test('every comSubCryptoPayments/cryptoPayXxx admin key exists in all four language blocks in public/pages/admin/app.js', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  const markers = ['\n  fa: {', '\n  ar: {', '\n  es: {', '\n};'];
  const enStart = src.indexOf('const translations = {') + 'const translations = {'.length;
  const enBlock = src.slice(enStart, src.indexOf(markers[0]));
  const faBlock = extractLangBlock(src, markers[0], markers.slice(1));
  const arBlock = extractLangBlock(src, markers[1], markers.slice(2));
  const esBlock = extractLangBlock(src, markers[2], markers.slice(3));
  const enKeys = Array.from(keysDefinedIn(enBlock)).filter((k) => k === 'comSubCryptoPayments' || k.startsWith('cryptoPay'));
  assert.ok(enKeys.length >= 40, 'sanity check - this task added a large number of cryptoPay* keys');
  const faKeys = keysDefinedIn(faBlock), arKeys = keysDefinedIn(arBlock), esKeys = keysDefinedIn(esBlock);
  for (const key of enKeys) {
    assert.ok(faKeys.has(key), `fa is missing admin key "${key}"`);
    assert.ok(arKeys.has(key), `ar is missing admin key "${key}"`);
    assert.ok(esKeys.has(key), `es is missing admin key "${key}"`);
  }
});

test('the new Crypto payments sub-tab is registered in both the sub-nav and the builder dispatch table', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  assert.match(src, /\['cryptoPayments',\s*t\('comSubCryptoPayments'\)\]/);
  assert.match(src, /cryptoPayments:\s*commercialCryptoPaymentsSubTab/);
});
