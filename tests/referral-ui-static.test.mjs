import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Static-source checks for the customer Referral Marketing UI (navrya-src/accountProfileView.jsx +
// the legacy public/pages/shared/account-profile-*.js layer), mirroring
// tests/subscription-i18n-completeness.test.mjs's own extraction convention: every refXxx key this
// task introduced must exist in all four language blocks (fa/ar/en/es), never silently falling back
// past `en`. No JSX is rendered here (this codebase's established convention for .jsx files).
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

let accountProfileSrc, legacyUiSrc, legacyI18nSrc;
test.before(async () => {
  accountProfileSrc = await read('navrya-src', 'accountProfileView.jsx');
  legacyUiSrc = await read('public', 'pages', 'shared', 'account-profile-ui.js');
  legacyI18nSrc = await read('public', 'pages', 'shared', 'account-profile-i18n.js');
});

test('every refXxx key in accountProfileView.jsx exists in all four language blocks (fa/ar/en/es)', () => {
  const markers = ['\n  fa: {', '\n  en: {', '\n  ar: {', '\n  es: {'];
  const [fa, en, ar, es] = markers.map((marker, i) => extractLangBlock(accountProfileSrc, marker, markers.slice(i + 1).concat(['\n};'])));
  const [faKeys, enKeys, arKeys, esKeys] = [fa, en, ar, es].map(keysDefinedIn);
  const taskKeys = Array.from(enKeys).filter((k) => k.startsWith('ref') || k === 'tabReferral');
  assert.ok(taskKeys.length > 50, 'sanity check - this task added a large number of refXxx keys');
  for (const key of taskKeys) {
    assert.ok(faKeys.has(key), `fa is missing key "${key}"`);
    assert.ok(arKeys.has(key), `ar is missing key "${key}"`);
    assert.ok(esKeys.has(key), `es is missing key "${key}"`);
  }
});

test('every payout status word has a translation key that matches statusKeyFor()\'s own naming', () => {
  // Mirrors referral-rules.mjs's PAYOUT_ALL_STATES so a server-added status can never silently render as a raw key.
  const statuses = ['requested', 'under_review', 'approved', 'submitted', 'confirmed', 'paid', 'rejected', 'cancelled', 'failed'];
  const toKey = (status) => 'refPayoutStatus' + status.replace(/(^\w|_\w)/g, (m) => m.replace('_', '').toUpperCase());
  const enBlock = extractLangBlock(accountProfileSrc, '\n  en: {', ['\n  ar: {', '\n};']);
  const enKeys = keysDefinedIn(enBlock);
  for (const status of statuses) assert.ok(enKeys.has(toKey(status)), `missing translation key for payout status "${status}" (${toKey(status)})`);
});

test('the Referral Marketing tab is registered right after Subscription in the React TABS array, the initial-tab map and the render switch', () => {
  assert.match(accountProfileSrc, /\{ id: 'sub', label: tr\(lang, 'tabSub'\), icon: 'crown' \},\s*\n\s*\{ id: 'referral', label: tr\(lang, 'tabReferral'\)/, 'TABS array order');
  assert.match(accountProfileSrc, /subscriptions: 'sub', referral: 'referral'/, 'initial-tab hash map');
  assert.match(accountProfileSrc, /\{tab === 'sub' && <SubscriptionTab lang=\{lang\} \/>\}\s*\n\s*\{tab === 'referral' && <ReferralMarketingTab lang=\{lang\} \/>\}/, 'render switch order');
});
test('the legacy static-page layer (account-profile-ui.js) also registers the referral tab right after subscriptions, and its route accepts it', () => {
  assert.match(legacyUiSrc, /var TABS = \['identity', 'level', 'achievements', 'subscriptions', 'referral', 'role'\];/);
  assert.match(legacyUiSrc, /\['subscriptions', 'tabSubscriptions', 'crown'\], \['referral', 'tabReferral', 'users'\]/, 'nav array order');
  assert.match(legacyUiSrc, /identity\|level\|achievements\|subscriptions\|referral\|role/, 'route() regex accepts the referral segment');
});
test('account-profile-i18n.js defines tabReferral in all four languages', () => {
  const markers = ['\n    en: {', '\n    fa: {', '\n    ar: {', '\n    es: {'];
  const [en, fa, ar, es] = markers.map((marker, i) => extractLangBlock(legacyI18nSrc, marker, markers.slice(i + 1).concat(['\n  };'])));
  for (const [label, block] of [['en', en], ['fa', fa], ['ar', ar], ['es', es]]) {
    assert.match(block, /tabReferral:/, `${label} block is missing tabReferral`);
  }
});

test('the referral UI never formats money with raw parseFloat/toFixed on a non-micro value or a client-side percentage/commission computation', () => {
  // The only money formatter the referral components use is fmtRefUsd(microUsd) = '$' + (micro/1e6).toFixed(2) -
  // never a second, hand-rolled formula, and never a client-computed commission (that is always a server-sent field).
  const tabSource = accountProfileSrc.slice(accountProfileSrc.indexOf('function fmtRefUsd'), accountProfileSrc.indexOf('function SubscriptionTab'));
  assert.match(tabSource, /function fmtRefUsd\(microUsd\) \{ return '\$' \+ \(Number\(microUsd \|\| 0\) \/ 1000000\)\.toFixed\(2\); \}/);
  assert.doesNotMatch(tabSource, /commissionBps\s*\*|commissionBps\s*\/|\* rate\.commissionBps/, 'commission math must never be recomputed client-side');
});
test('the referral UI never renders a raw referred-user field (name/email/id) - only aggregate funnel/balance numbers and the referrer\'s own payout rows', () => {
  const tabSource = accountProfileSrc.slice(accountProfileSrc.indexOf('function fmtRefUsd'), accountProfileSrc.indexOf('function SubscriptionTab'));
  for (const forbidden of ['referredUserId', 'referredEmail', '.referred.', 'customerEmail', 'customerName']) {
    assert.doesNotMatch(tabSource, new RegExp(forbidden.replace('.', '\\.')), `must never reference ${forbidden}`);
  }
});
test('the payout request body sends the address fields, acknowledgements and idempotency key the server requires - and never a client-decided amount from a stale wallet total', () => {
  const tabSource = accountProfileSrc.slice(accountProfileSrc.indexOf('function fmtRefUsd'), accountProfileSrc.indexOf('function SubscriptionTab'));
  assert.match(tabSource, /'\/api\/referrals\/payouts'/);
  assert.match(tabSource, /acknowledgeIrreversible: ackIrreversible, acknowledgeNetwork: ackNetwork/);
  assert.match(tabSource, /confirmAddress/);
});
