import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Source-level contract for the customer checkout UI (navrya-src/accountProfileView.jsx - the
// canonical source; the generated navrya-*-sessions-app.js bundles are never read here) and the
// admin panel (public/pages/admin/app.js - hand-authored). This codebase's node:test harness does not
// render JSX, so these are structural assertions, matching commercial-plans-v3-static.test.mjs and the
// other *-static tests. Sources are normalized to LF first: the working tree is CRLF (autocrlf).

const root = process.cwd();
const read = async (...parts) => (await readFile(path.join(root, ...parts), 'utf8')).replace(/\r\n/g, '\n');

function functionSource(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'function ' + name + ' must exist');
  const end = src.indexOf('\n}\n', start);
  assert.ok(end > start, 'function ' + name + ' must be a top-level function');
  return src.slice(start, end + 3);
}

// A function declared INSIDE a component (2-space indent): ends at the next sibling nested function.
function nestedFunctionSource(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'nested function ' + name + ' must exist');
  const end = src.indexOf('\n  function ', start + 10);
  return src.slice(start, end > start ? end : start + 2500);
}

// Every <PaymentSheet ... /> element in the file.
function paymentSheetElements(src) {
  const elements = [];
  let index = src.indexOf('<PaymentSheet');
  while (index > -1) {
    elements.push(src.slice(index, src.indexOf('/>', index) + 2));
    index = src.indexOf('<PaymentSheet', index + 1);
  }
  return elements;
}

const SERVER_DISCOUNT_ERRORS = [
  ['DISCOUNT_CODE_INVALID', 'subDiscountErrInvalid'],
  ['DISCOUNT_CODE_NOT_STARTED', 'subDiscountErrNotStarted'],
  ['DISCOUNT_CODE_EXPIRED', 'subDiscountErrExpired'],
  ['DISCOUNT_CODE_EXHAUSTED', 'subDiscountErrExhausted'],
  ['DISCOUNT_CODE_ALREADY_USED', 'subDiscountErrAlreadyUsed'],
  ['DISCOUNT_CODE_RESERVATION_PENDING', 'subDiscountErrReservationPending'],
  ['RATE_LIMITED', 'subDiscountErrRateLimited']
];

const CUSTOMER_KEYS = [
  'subPayDiscountApply', 'subPayDiscountApplying', 'subPayDiscountClear', 'subPayDiscountApplied', 'subPayDiscountSubscriptionOnly',
  'subPayOriginalPrice', 'subPayDiscountLine', 'subPayBonusLine', 'subPayNoCostNote',
  ...SERVER_DISCOUNT_ERRORS.map(([, key]) => key),
  'subPlanWalletBonusLabel',
  'subLedgerSubscriptionBonus', 'subLedgerBonusReversal', 'subLedgerBonusReversalSubtitle',
  'subBillingOriginalPrice', 'subBillingDiscountCode', 'subBillingBonusCredited', 'subBillingBonusPending', 'subBillingBonusReversed', 'subBillingDiscountLost',
  'subUpgradeNoCostActive'
];

const ADMIN_KEYS = [
  'comSubDiscountCodes', 'comDiscountCreate', 'comDiscountCode', 'comDiscountCampaign', 'comDiscountType', 'comDiscountTypePercent', 'comDiscountTypeFixed',
  'comDiscountValue', 'comDiscountStartsAt', 'comDiscountExpiresAt', 'comDiscountMaxRedemptions', 'comDiscountStatus', 'comDiscountConfirmed',
  'comDiscountPending', 'comDiscountRemaining', 'comDiscountActivate', 'comDiscountDeactivate', 'comDiscountEdit', 'comDiscountHistory',
  'comDiscountNoCodes', 'comDiscountUnlimited', 'comStepUpRequired',
  'comPlanWalletBonus', 'comColOriginal', 'comColDiscount', 'comColFinal', 'comColBonus',
  'comRepairBonus', 'comBonusStatusPending', 'comBonusStatusCredited', 'comBonusStatusReversed', 'comBonusStatusMissing', 'comDiscountOutcomeLost'
];

function langBlock(src, marker, nextMarkers) {
  const start = src.indexOf(marker);
  assert.ok(start > -1, 'language block "' + marker.trim() + '" must exist');
  let end = src.length;
  nextMarkers.forEach((next) => { const idx = src.indexOf(next, start + marker.length); if (idx > -1 && idx < end) end = idx; });
  return src.slice(start, end);
}
// Accepts single- or double-quoted values (a Spanish/French apostrophe may force double quotes).
function valueOf(block, key) {
  const match = new RegExp('\\b' + key + ':\\s*(?:\'((?:[^\'\\\\]|\\\\.)*)\'|"((?:[^"\\\\]|\\\\.)*)")').exec(block);
  return match ? (match[1] !== undefined ? match[1] : match[2]) : null;
}
const ARABIC_SCRIPT = /[؀-ۿ]/;

// ---- customer checkout ------------------------------------------------------------------------------

test('PaymentSheet accepts a discountEnabled prop and ONLY the subscription checkout enables it; wallet top-up never does', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const sheetSource = functionSource(src, 'PaymentSheet');
  assert.match(sheetSource.slice(0, sheetSource.indexOf(') {')), /\bdiscountEnabled\b/, 'PaymentSheet must declare discountEnabled in its props');

  const elements = paymentSheetElements(src);
  assert.equal(elements.length, 2, 'exactly the wallet top-up sheet and the subscription sheet exist');
  const walletSheet = elements.find((element) => /onProceed=\{requestTopUp\}/.test(element));
  const subscriptionSheet = elements.find((element) => /requestUpgrade\(/.test(element));
  assert.ok(walletSheet && subscriptionSheet, 'both sheets must be identifiable');
  assert.doesNotMatch(walletSheet, /discountEnabled/, 'wallet top-ups must not accept codes');
  assert.match(subscriptionSheet, /\bdiscountEnabled\b/, 'the subscription checkout enables codes');
  assert.match(subscriptionSheet, /walletBonusUsd=/, 'the subscription sheet is told the plan\'s wallet bonus so checkout can show it');
  assert.doesNotMatch(functionSource(src, 'StorageCard'), /discountEnabled|discountCode/, 'storage purchases must not accept codes');
  assert.doesNotMatch(functionSource(src, 'WalletCard'), /discountEnabled|discountCode/, 'wallet top-ups must not accept codes');
});

test('the disabled "not added yet" placeholder is gone: a real code input replaces it for subscriptions, and other purchases say codes are subscription-only', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const sheet = functionSource(src, 'PaymentSheet');
  assert.doesNotMatch(src, /subPayDiscountUnavailable/, 'the "have not been added yet" key is no longer true and must be removed from every dictionary');
  assert.doesNotMatch(sheet, /<TextField value="" onChange=\{\(\) => \{\}\} disabled/, 'no inert disabled input for the subscription flow');
  assert.match(sheet, /subPayDiscountSubscriptionOnly/, 'wallet top-ups keep an honest non-interactive row');
  assert.match(sheet, /subPayDiscountApply/);
  assert.match(sheet, /subPayDiscountClear/);
  assert.match(sheet, /subPayDiscountApplied/);
});

test('the sheet shows a provisional original / discount / final total from the SERVER quote, and the wallet bonus, without doing money math', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const sheet = functionSource(src, 'PaymentSheet');
  assert.match(sheet, /originalAmountMicroUsd/);
  assert.match(sheet, /discountAmountMicroUsd/);
  assert.match(sheet, /finalAmountMicroUsd/, 'the total shown is the server-computed final amount');
  assert.match(sheet, /subPayOriginalPrice/);
  assert.match(sheet, /subPayDiscountLine/);
  assert.match(sheet, /subPayBonusLine/);
  assert.doesNotMatch(sheet, /(discountValue|percentOff)\s*[*/]/, 'the client never multiplies a discount itself');
  assert.doesNotMatch(sheet, /marginLeft|marginRight|paddingLeft|paddingRight|textAlign: '(left|right)'/, 'logical CSS only, so RTL/LTR keep working');
});

test('the client sends ONLY planId and the code text: the quote body is { planId, code } and checkout sends { planId, discountCode }', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  assert.match(src, /\/api\/sync\/subscriptions\/quote[\s\S]{0,500}JSON\.stringify\(\{[^}]*\bplanId\b[^}]*\bcode\b[^}]*\}\)/, 'the quote request carries planId and code');
  const upgrade = nestedFunctionSource(src, 'requestUpgrade');
  assert.match(upgrade, /upgrade-request/);
  assert.match(upgrade, /\bdiscountCode\b/);
  assert.match(upgrade, /\bplanId\b/);
  assert.doesNotMatch(upgrade, /\b(amountUsd|amountMicroUsd|originalAmountMicroUsd|discountAmountMicroUsd|finalAmountMicroUsd|walletBonusMicroUsd|walletBonusUsd|priceAmountUsd)\b/,
    'no calculated money value may be sent to the server');
});

test('authoritative server errors are shown clearly: every discount error code maps to a localized message, and a failed checkout clears the stale quote', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  assert.match(src, /const DISCOUNT_ERROR_KEYS = \{/, 'one map from server error code to i18n key');
  SERVER_DISCOUNT_ERRORS.forEach(([code, key]) => {
    assert.match(src, new RegExp(code + "['\"]?\\s*:\\s*'" + key + "'"), code + ' must map to ' + key);
  });
  const upgrade = nestedFunctionSource(src, 'requestUpgrade');
  assert.match(upgrade, /DISCOUNT_ERROR_KEYS|discountError\w*\(/, 'the checkout error path uses the map instead of showing a raw error code');
});

test('a zero-price result is handled honestly: the sheet finishes without an invoice and confirms the plan is active (never a client-side fake)', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const sheet = functionSource(src, 'PaymentSheet');
  assert.match(sheet, /\.noCost\b/, 'submit() branches on the server\'s noCost answer');
  assert.match(sheet, /subPayNoCostNote/, 'the review step explains a free result');
  assert.match(src, /subUpgradeNoCostActive/);
  assert.match(sheet, /onConfirmed\(/, 'the page refreshes its subscription state through the normal confirmed callback');
});

test('the plan comparison shows the configured wallet bonus in a fixed-height strip so the four cards still line up', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const grid = functionSource(src, 'PlanComparisonGrid');
  assert.match(grid, /walletBonusUsd/, 'read from the catalog, never hard-coded');
  assert.match(grid, /subPlanWalletBonusLabel/);
  assert.ok((grid.match(/height: 36/g) || []).length >= 2, 'the bonus strip is 36px like the token-discount strip');
});

test('the wallet ledger and billing history make subscription bonuses, discounts and lost-code outcomes auditable', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const ledger = functionSource(src, 'ledgerEntryDisplay');
  assert.match(ledger, /SUBSCRIPTION_BONUS_REVERSAL/);
  assert.match(ledger, /SUBSCRIPTION_BONUS['"]/);
  assert.match(ledger, /subLedgerSubscriptionBonus/);
  assert.match(ledger, /subLedgerBonusReversal/);

  const history = functionSource(src, 'BillingHistoryCard');
  assert.match(history, /\.pricing\b/);
  assert.match(history, /\.bonus\b/);
  assert.match(history, /\.discountOutcome\b/, 'a payment credited to the wallet because the code slot was lost is shown, not hidden');
  ['subBillingOriginalPrice', 'subBillingDiscountCode', 'subBillingBonusCredited', 'subBillingBonusPending', 'subBillingBonusReversed', 'subBillingDiscountLost']
    .forEach((key) => assert.match(history, new RegExp(key), 'BillingHistoryCard must use ' + key));
});

test('every new customer string exists in fa, en, ar and es, and fa/ar carry real Arabic-script text (no English left behind)', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const markers = ['\n  fa: {', '\n  en: {', '\n  ar: {', '\n  es: {'];
  const [fa, en, ar, es] = markers.map((marker, i) => langBlock(src, marker, markers.slice(i + 1).concat(['\n};'])));
  CUSTOMER_KEYS.forEach((key) => {
    for (const [label, block] of [['fa', fa], ['en', en], ['ar', ar], ['es', es]]) {
      const value = valueOf(block, key);
      assert.ok(value && value.trim(), label + ' is missing "' + key + '"');
    }
    assert.match(valueOf(fa, key), ARABIC_SCRIPT, 'fa "' + key + '" must be Persian text');
    assert.match(valueOf(ar, key), ARABIC_SCRIPT, 'ar "' + key + '" must be Arabic text');
  });
  ['subPayDiscountLine', 'subPayBonusLine', 'subPayOriginalPrice'].forEach((key) => {
    // placeholders must survive translation, or the amount silently disappears
    const placeholders = (valueOf(en, key).match(/\{\w+\}/g) || []).sort();
    for (const [label, block] of [['fa', fa], ['ar', ar], ['es', es]]) {
      assert.deepEqual((valueOf(block, key).match(/\{\w+\}/g) || []).sort(), placeholders, label + ' "' + key + '" must keep the same placeholders as en');
    }
  });
});

// ---- admin panel -----------------------------------------------------------------------------------

test('admin: a Discount codes sub-tab is registered in the Commercial nav and dispatcher, with create / edit / activate / deactivate / history', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  assert.match(src, /\['discountCodes', t\('comSubDiscountCodes'\)\]/, 'nav entry');
  assert.match(src, /discountCodes: commercialDiscountCodesSubTab/, 'dispatcher entry');
  const tab = functionSource(src, 'commercialDiscountCodesSubTab');
  assert.match(tab, /\/commercial\/discount-codes/);
  assert.match(tab, /method: 'POST'/, 'create');
  assert.match(tab, /method: 'PATCH'/, 'edit / activate / deactivate');
  ['comDiscountActivate', 'comDiscountDeactivate', 'comDiscountEdit', 'comDiscountCreate', 'comDiscountHistory'].forEach((key) => assert.match(tab, new RegExp(key), key));
  // capacity + audit visibility
  assert.match(tab, /\.stats\.confirmed|stats\.confirmed/);
  assert.match(tab, /pendingReservations/);
  assert.match(tab, /\.remaining\b/);
  assert.match(tab, /\.redemptions\b/);
  assert.match(tab, /STEP_UP_REQUIRED/, 'a stale session gets a clear localized "re-authenticate" message, not a raw error code');
  assert.match(tab, /comStepUpRequired/);
});

test('admin: the plan editor exposes walletBonusUsd for paid plans only and posts it with the other plan fields', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  const editor = functionSource(src, 'commercialPlansSubTab');
  assert.match(editor, /comPlanWalletBonus/);
  assert.match(editor, /plan !== 'free'[^\n]*comPlanWalletBonus|comPlanWalletBonus[^\n]*plan !== 'free'/, 'Free has no bonus field');
  assert.match(editor, /payload\.walletBonusUsd|walletBonusUsd:/, 'the value is posted in the plan PATCH');
});

test('admin: the transactions table shows original price, discount/code, final price and bonus status, and offers a repair action ONLY for a missing bonus', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  const table = functionSource(src, 'commercialTransactionsSubTab');
  ['comColOriginal', 'comColDiscount', 'comColFinal', 'comColBonus'].forEach((key) => assert.match(table, new RegExp(key), 'column ' + key));
  assert.match(table, /\.pricing\b/);
  assert.match(table, /\.bonusStatus\b/);
  assert.match(table, /\.discountOutcome\b/, 'the lost-code outcome is visible to the admin');
  assert.match(table, /bonusStatus === 'missing'/, 'the repair button appears only for a missing bonus');
  assert.match(table, /\/repair-bonus/);
  assert.match(table, /comRepairBonus/);
  assert.match(table, /method: 'POST'/);
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
