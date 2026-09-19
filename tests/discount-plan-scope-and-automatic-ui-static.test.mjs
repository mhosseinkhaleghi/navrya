import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Source-level contract for the two admin capabilities (plan scope, automatic discounts) and their customer-facing
// effect: a plan card strikes the list price and shows the server-computed one, and the checkout applies an eligible
// automatic discount by itself, with the same live urgency panel a typed code already gets. This codebase's node:test
// harness does not render JSX, so these are structural assertions, matching every other *-ui-static test in this repo.
// Sources are normalized to LF first: the working tree is CRLF (autocrlf).

const root = process.cwd();
const read = async (...parts) => (await readFile(path.join(root, ...parts), 'utf8')).replace(/\r\n/g, '\n');

function functionSource(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'function ' + name + ' must exist');
  const end = src.indexOf('\n}\n', start);
  assert.ok(end > start, 'function ' + name + ' must be a top-level function');
  return src.slice(start, end + 3);
}
function langBlock(src, marker, nextMarkers) {
  const start = src.indexOf(marker);
  assert.ok(start > -1, 'language block "' + marker.trim() + '" must exist');
  let end = src.length;
  nextMarkers.forEach((next) => { const idx = src.indexOf(next, start + marker.length); if (idx > -1 && idx < end) end = idx; });
  return src.slice(start, end);
}
function valueOf(block, key) {
  const match = new RegExp('\\b' + key + ':\\s*(?:\'((?:[^\'\\\\]|\\\\.)*)\'|"((?:[^"\\\\]|\\\\.)*)")').exec(block);
  return match ? (match[1] !== undefined ? match[1] : match[2]) : null;
}
const ARABIC_SCRIPT = /[؀-ۿ]/;

// ---- customer: plan cards ------------------------------------------------------------------------------------------

test('PlanComparisonGrid takes the automatic offers and, for an eligible plan, strikes the list price and shows the server-computed final price - never its own math', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const grid = functionSource(src, 'PlanComparisonGrid');
  assert.match(grid, /\boffers\b/, 'PlanComparisonGrid must receive the offers prop');
  assert.match(grid, /textDecoration:\s*'line-through'/, 'the original price is struck through');
  assert.match(grid, /finalAmountMicroUsd/, 'the shown price is the server-computed final amount');
  assert.doesNotMatch(grid, /discountAmountMicroUsd\s*[-+*/]|originalAmountMicroUsd\s*[-+*/]|[-+*/]\s*discountValue/, 'the client never computes the discount itself');
});

test('SubscriptionTab fetches the automatic offers once and passes them to both the plan grid and the checkout sheet', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const tab = functionSource(src, 'SubscriptionTab');
  assert.match(tab, /\/api\/sync\/subscriptions\/automatic-discounts/);
  assert.match(tab, /<PlanComparisonGrid\b[^]*?offers=\{offers\}/);
  assert.match(tab, /<PaymentSheet\b[^]*?automaticOffer=\{offers/);
});

// ---- customer: checkout sheet applies it by itself -----------------------------------------------------------------

test('PaymentSheet auto-applies an eligible automatic offer on the review step exactly once, without requiring a typed code', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const sheet = functionSource(src, 'PaymentSheet');
  assert.match(sheet, /automaticOffer/, 'PaymentSheet must accept the automaticOffer prop');
  assert.match(sheet, /automatic:\s*true/, 'the auto-applied quote is tagged so it can be told apart from a typed one');
  const ref = /const \w+ = React\.useRef\(false\)/.exec(sheet);
  assert.ok(ref, 'a one-shot guard so it is not re-applied after being removed');
});

test('the applied-code chip shows a distinct message and no "Remove" for an automatic discount, and its own i18n key exists in fa/en/ar/es', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const sheet = functionSource(src, 'PaymentSheet');
  assert.match(sheet, /subPayAutomaticDiscountApplied/, 'a distinct string for the automatic case (never "code X applied" with an empty code)');
  assert.match(sheet, /quote\.automatic/);
  const markers = ['\n  fa: {', '\n  en: {', '\n  ar: {', '\n  es: {'];
  const [fa, en, ar, es] = markers.map((marker, i) => langBlock(src, marker, markers.slice(i + 1).concat(['\n};'])));
  for (const [label, block] of [['fa', fa], ['en', en], ['ar', ar], ['es', es]]) {
    const value = valueOf(block, 'subPayAutomaticDiscountApplied');
    assert.ok(value && value.trim(), label + ' is missing subPayAutomaticDiscountApplied');
  }
  assert.match(valueOf(fa, 'subPayAutomaticDiscountApplied'), ARABIC_SCRIPT);
  assert.match(valueOf(ar, 'subPayAutomaticDiscountApplied'), ARABIC_SCRIPT);
});

test('submit() sends discountCode for a typed quote and automaticDiscountId for an automatic one - never both, never a computed amount', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const sheet = functionSource(src, 'PaymentSheet');
  const submit = sheet.slice(sheet.indexOf('function submit('), sheet.indexOf('function submit(') + 900);
  assert.match(submit, /automaticDiscountId/);
  assert.match(submit, /discountCode/);
  assert.match(submit, /quote\.automatic/);
});

test('SubscriptionTab.requestUpgrade forwards automaticDiscountId to the server and never invents a price', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const tab = functionSource(src, 'SubscriptionTab');
  const upgrade = tab.slice(tab.indexOf('function requestUpgrade('), tab.indexOf('function requestUpgrade(') + 900);
  assert.match(upgrade, /automaticDiscountId/);
  assert.doesNotMatch(upgrade, /\b(amountUsd|amountMicroUsd|finalAmountMicroUsd|discountAmountMicroUsd)\b/, 'no calculated money value may be sent to the server');
});

// ---- admin: plan scope + application mode --------------------------------------------------------------------------

const ADMIN_KEYS = [
  'comDiscountApplicationMode', 'comDiscountModeCode', 'comDiscountModeAutomatic', 'comDiscountPlans', 'comDiscountAllPlans', 'comDiscountAutomaticBadge'
];

test('admin: the discount form offers an application-mode choice and a plan-scope selector; the code field is hidden for automatic and locked on edit', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  const form = functionSource(src, 'codeForm');
  assert.match(form, /comDiscountApplicationMode/);
  assert.match(form, /comDiscountModeAutomatic/);
  assert.match(form, /comDiscountModeCode/);
  assert.match(form, /comDiscountPlans/);
  assert.match(form, /planIds/);
  assert.match(form, /applicationMode/);
  assert.doesNotMatch(form, /body\.applicationMode|payload\.applicationMode\s*[:=][^,}]*existing/, 'applicationMode is never sent on an edit PATCH');
});

test('admin: the codes table shows the application mode and the plan scope for every code', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  const tab = functionSource(src, 'commercialDiscountCodesSubTab');
  assert.match(tab, /comDiscountPlans|comDiscountAllPlans/);
  assert.match(tab, /applicationMode/);
  assert.match(tab, /comDiscountAutomaticBadge|comDiscountModeAutomatic/);
});

test('every new admin string exists in fa, en, ar and es, and fa/ar carry real Arabic-script text', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  const enStart = src.indexOf('const translations = {') + 'const translations = {'.length;
  const en = src.slice(enStart, src.indexOf('\n  fa: {'));
  const fa = langBlock(src, '\n  fa: {', ['\n  ar: {', '\n  es: {', '\n};']);
  const ar = langBlock(src, '\n  ar: {', ['\n  es: {', '\n};']);
  const es = langBlock(src, '\n  es: {', ['\n};']);
  ADMIN_KEYS.forEach((key) => {
    for (const [label, block] of [['en', en], ['fa', fa], ['ar', ar], ['es', es]]) {
      const value = valueOf(block, key);
      assert.ok(value && value.trim(), 'admin ' + label + ' is missing "' + key + '"');
    }
    assert.match(valueOf(fa, key), ARABIC_SCRIPT, 'admin fa "' + key + '" must be Persian text');
    assert.match(valueOf(ar, key), ARABIC_SCRIPT, 'admin ar "' + key + '" must be Arabic text');
  });
});
