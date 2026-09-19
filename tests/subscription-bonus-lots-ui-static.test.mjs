import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Source-level contract for how the lot accounting reaches people: the customer billing history and wallet activity
// (navrya-src/accountProfileView.jsx - the canonical source; the generated navrya-*-sessions-app.js bundles are
// never read here) and the admin Commercial transactions / ledger tables (public/pages/admin/app.js - hand-authored).
// This codebase's node:test harness does not render JSX, so these are structural assertions, like the other *-static
// tests. Sources are normalized to LF first: the working tree is CRLF (autocrlf).
//
// The UI only DISPLAYS the server's figures (original / used on AI / remaining / reversed). It never derives a
// balance or a reversal amount itself.

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
// Accepts single- or double-quoted values (a Spanish/French apostrophe may force double quotes).
function valueOf(block, key) {
  const match = new RegExp('\\b' + key + ':\\s*(?:\'((?:[^\'\\\\]|\\\\.)*)\'|"((?:[^"\\\\]|\\\\.)*)")').exec(block);
  return match ? (match[1] !== undefined ? match[1] : match[2]) : null;
}
const ARABIC_SCRIPT = /[؀-ۿ]/;

const CUSTOMER_KEYS = [
  'subBillingBonusUsed', 'subBillingBonusRemaining', 'subBillingBonusReversedPart', 'subBillingBonusFullyUsed',
  'subLedgerBonusUsedPart', 'subLedgerBonusReversalPartial', 'subLedgerBonusReversalNone'
];
const ADMIN_KEYS = ['comBonusUsedAi', 'comBonusRemaining', 'comBonusReversedAmount', 'comBonusFullyConsumed', 'comColBonusLot', 'comBonusFromLot'];

// ---- customer -------------------------------------------------------------------------------------------------------

test('billing history shows, per purchase, what the bonus was, how much AI used, what remains, and what a refund reversed - from the server\'s numbers', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const history = functionSource(src, 'BillingHistoryCard');
  ['consumedMicroUsd', 'remainingMicroUsd', 'reversedMicroUsd', 'originalMicroUsd'].forEach((field) => assert.match(history, new RegExp('bonus\\.' + field), 'BillingHistoryCard must read tx.bonus.' + field));
  ['subBillingBonusUsed', 'subBillingBonusRemaining', 'subBillingBonusReversedPart', 'subBillingBonusFullyUsed'].forEach((key) => assert.match(history, new RegExp(key), 'BillingHistoryCard must use ' + key));
  assert.doesNotMatch(history, /bonus\.\w+MicroUsd\s*[-+*/]/, 'the client never does bonus arithmetic - it shows what the server computed');
  assert.doesNotMatch(history, /[-+*/]\s*(tx\.)?bonus\.\w+MicroUsd/, 'no arithmetic on the right-hand side either');
});

test('wallet activity explains a bonus reversal that took back only the unused part, and an AI charge that was covered by the bonus', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const ledger = functionSource(src, 'ledgerEntryDisplay');
  assert.match(ledger, /entry\.subscriptionBonusUsedMicroUsd/, 'an AI charge shows how much of it the subscription bonus covered');
  assert.match(ledger, /subLedgerBonusUsedPart/);
  assert.match(ledger, /entry\.bonusLot/, 'a reversal reads its lot state from the server');
  assert.match(ledger, /subLedgerBonusReversalPartial/);
  assert.match(ledger, /subLedgerBonusReversalNone/);
  assert.match(ledger, /bonusNote/, 'the explanation is returned as its own field');
  assert.doesNotMatch(ledger, /bonusLot\.\w+MicroUsd\s*[-+*/]|[-+*/]\s*bonusLot\.\w+MicroUsd/, 'no client-side derivation of reversed / remaining amounts');

  const card = functionSource(src, 'WalletActivityCard');
  assert.match(card, /\{d\.bonusNote\}/, 'the note is actually rendered');
});

test('every new customer string exists in fa, en, ar and es, fa/ar carry real Arabic-script text, and amount placeholders survive translation', async () => {
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
    const placeholders = (valueOf(en, key).match(/\{\w+\}/g) || []).sort();
    for (const [label, block] of [['fa', fa], ['ar', ar], ['es', es]]) {
      assert.deepEqual((valueOf(block, key).match(/\{\w+\}/g) || []).sort(), placeholders, label + ' "' + key + '" must keep the same placeholders as en');
    }
  });
  assert.deepEqual((valueOf(en, 'subLedgerBonusReversalPartial').match(/\{\w+\}/g) || []).sort(), ['{amount}', '{used}'], 'the partial-reversal note names both the reversed and the already-used amount');
  ['subBillingBonusUsed', 'subBillingBonusRemaining', 'subBillingBonusReversedPart', 'subLedgerBonusUsedPart'].forEach((key) => {
    assert.match(valueOf(en, key), /\{amount\}/, key + ' carries the amount');
  });
});

// ---- admin ----------------------------------------------------------------------------------------------------------

test('admin transactions show original / used on AI / remaining / reversed bonus next to the status', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  const table = functionSource(src, 'commercialTransactionsSubTab');
  ['consumedMicroUsd', 'remainingMicroUsd', 'reversedMicroUsd'].forEach((field) => assert.match(table, new RegExp('bonus\\.' + field), 'the table must read transaction.bonus.' + field));
  ['comBonusUsedAi', 'comBonusRemaining', 'comBonusReversedAmount', 'comBonusFullyConsumed'].forEach((key) => assert.match(table, new RegExp(key), 'the table must use ' + key));
  assert.match(table, /\.bonusStatus\b/, 'the existing status column is kept');
  assert.match(table, /bonusStatus === 'missing'/, 'and so is the repair button rule');
  assert.doesNotMatch(table, /bonus\.\w+MicroUsd\s*[-+*/]|[-+*/]\s*bonus\.\w+MicroUsd/, 'the admin panel shows the server\'s figures, it does not recompute them');
});

test('admin ledger view shows the bonus each AI settlement consumed and the lot state on bonus / reversal entries', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  const wallet = functionSource(src, 'commercialWalletSubTab');
  assert.match(wallet, /comColBonusLot/, 'a dedicated column');
  assert.match(wallet, /entry\.subscriptionBonusUsedMicroUsd/);
  assert.match(wallet, /entry\.bonusLot/);
  assert.match(wallet, /comBonusFromLot/);
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
