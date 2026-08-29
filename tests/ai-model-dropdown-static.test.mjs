import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// GPT-5.6 family (2026-08-29): static/structural regression coverage for the AI Assistant
// screen's model dropdown - mirroring the existing "static source inspection" convention (see
// header-wallet-balance-static.test.mjs) since this codebase's node:test harness does not render
// navrya-src React components in a DOM.
const root = process.cwd();
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');

test('the model Select composes a localized tier label (entry.modelLabels/modelTiers) instead of showing only the raw model id', async () => {
  const src = await read('navrya-src', 'aiAssistantView.jsx');
  const optIdx = src.indexOf('options={(entry ? entry.models : []).map((m) => {');
  assert.ok(optIdx > -1, 'the model Select options mapping must exist');
  const block = src.slice(optIdx, optIdx + 1300);
  assert.match(block, /entry\.modelLabels\s*&&\s*entry\.modelLabels\[m\]/, 'must read the label from the canonical catalog entry, not a second hardcoded list');
  assert.match(block, /entry\.modelTiers\s*&&\s*entry\.modelTiers\[m\]/, 'must read the tier from the canonical catalog entry');
  assert.match(block, /i18n\.t\(tierKey\)/, 'the tier descriptor text must come from the localized ai-i18n.js dictionary, not a hardcoded English string');
  assert.match(block, /\|\|\s*m\b/, 'a model with no metadata (every legacy id) must fall back to the raw id exactly as before');
});

test('the model Select never hardcodes a retail dollar amount - only the localized tier phrase is composed into the label', async () => {
  const src = await read('navrya-src', 'aiAssistantView.jsx');
  const optIdx = src.indexOf('options={(entry ? entry.models : []).map((m) => {');
  const block = src.slice(optIdx, optIdx + 1300);
  assert.doesNotMatch(block, /\$\d/, 'retail pricing/markup stays admin-controlled - the client dropdown must never hardcode a dollar figure');
});

test('the OpenAI catalog entry (ai-settings-store.js) - the single canonical model list - carries the exact Sol/Terra/Luna ids and the exact required tier phrases, in all 4 required languages', async () => {
  const store = await read('public', 'pages', 'shared', 'ai-settings-store.js');
  assert.match(store, /models:\s*\[\s*'gpt-5\.6-sol',\s*'gpt-5\.6-terra',\s*'gpt-5\.6-luna'/, 'Sol/Terra/Luna must lead the one canonical openai models array (new default)');
  assert.match(store, /'gpt-5\.6-sol':\s*'GPT-5\.6 Sol'/);
  assert.match(store, /'gpt-5\.6-terra':\s*'GPT-5\.6 Terra'/);
  assert.match(store, /'gpt-5\.6-luna':\s*'GPT-5\.6 Luna'/);
  // Only ONE PROVIDER_CATALOG declaration must exist anywhere in this file - proves no second
  // hardcoded model list was introduced alongside the canonical one.
  const catalogDeclarations = (store.match(/var PROVIDER_CATALOG\s*=/g) || []).length;
  assert.equal(catalogDeclarations, 1, 'exactly one canonical PROVIDER_CATALOG must exist');

  const i18n = await read('public', 'pages', 'shared', 'ai-i18n.js');
  const blocks = { fa: /fa:\s*\{/, ar: /ar:\s*\{/, en: /en:\s*\{/, es: /es:\s*\{/ };
  for (const lang of Object.keys(blocks)) {
    const start = i18n.search(blocks[lang]);
    assert.ok(start > -1, lang + ' language block must exist');
  }
  // en block carries the exact required English tier phrases verbatim.
  assert.match(i18n, /aiAsstModelTierFrontier:\s*'Frontier \/ Professional'/);
  assert.match(i18n, /aiAsstModelTierBalanced:\s*'Balanced'/);
  assert.match(i18n, /aiAsstModelTierEconomical:\s*'Economical · 80% lower cost'/);
  // All 4 languages define all 3 new keys (a missing key would silently fall back to English via
  // ai-i18n.js's own t() fallback chain, which is acceptable in general but not for a brand-new
  // key this task explicitly requires to be localized in fa/ar/en/es).
  ['aiAsstModelTierFrontier', 'aiAsstModelTierBalanced', 'aiAsstModelTierEconomical'].forEach((key) => {
    const occurrences = (i18n.match(new RegExp(key + ':', 'g')) || []).length;
    assert.equal(occurrences, 4, key + ' must be defined in exactly the 4 required language blocks (fa/ar/en/es)');
  });
});

test('the AI action-registry model allowlist check still uses a plain string-array .indexOf(value) - the metadata addition never changed that contract', async () => {
  const src = await read('navrya-src', 'aiAssistantView.jsx');
  assert.match(src, /current\.models\.indexOf\(value\)\s*>\s*-1/, 'models must remain a plain array of id strings for this voice/chat allowlist check to keep working');
});
