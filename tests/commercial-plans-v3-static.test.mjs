import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Static/structural regression coverage for the 2026-09-01 real-money subscription rollout
// (4th plan + rename + token discount + premium-model/BYOK locks + payment-method picker +
// low-balance popup + the reported Subscription-tab black-screen bug) - this codebase's node:test
// harness does not render JSX, so these are source-level assertions, matching the established
// convention (see header-wallet-balance-static.test.mjs/wallet-activity-rendering-static.test.mjs).
const root = process.cwd();
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');
const PLAN_SPEC_ROW_COUNT_EXPECTED = 6;

test('ai-settings-store.js gates the exact real premium model ids (GPT-5.6 Sol, Claude Opus 4.1) - never a made-up model name', async () => {
  const src = await read('public', 'pages', 'shared', 'ai-settings-store.js');
  assert.match(src, /premiumModels:\s*\['gpt-5\.6-sol'\]/, 'the openai entry must gate exactly gpt-5.6-sol');
  assert.match(src, /premiumModels:\s*\['claude-opus-4-1'\]/, 'the anthropic entry must gate exactly claude-opus-4-1');
  assert.doesNotMatch(src, /sora|fable/i, 'no made-up model name (Sora/Fable) may ever be added to the real catalog');
});

test('aiAssistantView.jsx composes a "needs a subscription" suffix for a premium-locked model, and intercepts selecting it instead of saving', async () => {
  const src = await read('navrya-src', 'aiAssistantView.jsx');
  const idx = src.indexOf('options={(entry ? entry.models : []).map((m) => {');
  assert.ok(idx > -1);
  const block = src.slice(idx, idx + 1400);
  assert.match(block, /entry\.premiumModels\.indexOf\(m\) > -1 && !planFeatures\.premiumModels/);
  assert.match(block, /aiAsstModelNeedsSubscription/);
  const onChangeIdx = src.indexOf('onChange={(v) => {', idx);
  const onChangeBlock = src.slice(onChangeIdx, onChangeIdx + 400);
  assert.match(onChangeBlock, /setUpgradeNotice\('model'\)/, 'picking a locked model must show the upgrade notice, never silently save it');
  assert.doesNotMatch(onChangeBlock, /settingsStore\.saveSettings.*\n.*isPremiumLocked/, 'a locked pick must never reach saveSettings');
});

test('aiAssistantView.jsx locks the BYOK ("keys") tab entirely (not just a disabled input) when the plan lacks byok, and shows an upgrade CTA', async () => {
  const src = await read('navrya-src', 'aiAssistantView.jsx');
  assert.match(src, /aiTab === 'keys' && !planFeatures\.byok/, 'a locked-out state must render instead of the real key form');
  assert.match(src, /aiAsstByokLockedTitle/);
  assert.match(src, /aiTab === 'keys' && planFeatures\.byok/, 'the real BYOK form must still exist, gated the other way');
});

test('aiAssistantView.jsx fetches plan features from the same two endpoints SubscriptionTab already uses - never a third/parallel entitlements source', async () => {
  const src = await read('navrya-src', 'aiAssistantView.jsx');
  assert.match(src, /fetch\('\/api\/sync\/subscriptions'\)/);
  assert.match(src, /fetch\('\/api\/sync\/subscriptions\/catalog'\)/);
  assert.match(src, /React\.useState\(\{ byok: false, premiumModels: false \}\)/, 'the default state must fail CLOSED (locked), never open, while loading or on a fetch error');
});

test('accountProfileView.jsx: PLAN_ORDER includes the new pro plan, between plus and personalized', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  assert.match(src, /const PLAN_ORDER = \['free', 'plus', 'pro', 'personalized'\];/);
});

test('accountProfileView.jsx: planLabel() prefers an admin-set displayName over the localized default when present', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const idx = src.indexOf('function planLabel(lang, planId, catalog)');
  assert.ok(idx > -1, 'planLabel must accept a catalog parameter');
  const fn = src.slice(idx, idx + 300);
  assert.match(fn, /catalog\[planId\]\.displayName/);
  assert.match(fn, /return override \|\| tr\(lang, PLAN_LABEL_KEY\[planId\] \|\| planId\)/, 'must still fall back to the existing localized label when no override exists');
});

// $5 is now the FLOOR, not just one chip among several: the presets are filtered against the
// server's real minimumTopUpUsd so the wallet can never offer an amount the server then rejects.
// wallet-topup-minimum.test.mjs owns the detail; this keeps the plans-v3 surface covered too.
test('accountProfileView.jsx: WalletCard offers a $5 top-up amount, derived from the server minimum', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  assert.match(src, /const TOPUP_PRESET_AMOUNTS = \[5, 10, 25, 50, 100\];/);
  assert.match(src, /topUpChoices\(wallet\.minimumTopUpUsd\)\.map/);
});

test('accountProfileView.jsx: WalletActivityCard computes and renders a running total of real AI settlement spend', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const idx = src.indexOf('function WalletActivityCard(');
  const fn = src.slice(idx, idx + 4200);
  assert.match(fn, /aiUsageTotalMicroUsd/);
  assert.match(fn, /e\.type === 'AI_SETTLEMENT'/);
  assert.match(fn, /subAiUsageTotal/);
});

test('accountProfileView.jsx: a PaymentSheet exists, offers crypto/Visa/Iran-gateway, gates the Iran option to fa only, and only crypto actually proceeds', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const idx = src.indexOf('function PaymentSheet(');
  assert.ok(idx > -1, 'PaymentSheet must exist');
  const fn = src.slice(idx, idx + 2600);
  assert.match(fn, /id: 'crypto'.*implemented: true/);
  assert.match(fn, /id: 'visa'.*implemented: false/);
  assert.match(fn, /lang === 'fa'.*id: 'iran-gateway'/s, 'the Iran gateway option must only be offered for lang===fa');
  assert.match(fn, /if \(!chosen\.implemented\) \{ setNotAdded\(true\); return; \}/, 'an unimplemented method must show the honest "not added" notice and must NOT advance to the invoice step');
});

// The payment flow is ONE popup with three sliding steps - method, invoice, then the real crypto
// invoice itself - not a stack of separate modals, and the upgrade no longer has a "confirm the
// request" step in front of it (explicitly removed).
test('accountProfileView.jsx: PaymentSheet slides between its three steps inside one modal, ending on the real invoice', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const idx = src.indexOf('function PaymentSheet(');
  const fn = src.slice(idx, idx + 12000);
  assert.match(src, /const PAY_SHEET_STEPS = 3;/, 'the sheet must carry a third step for the invoice');
  assert.match(fn, /transform: 'translateX\(-' \+ \(step \* \(100 \/ PAY_SHEET_STEPS\)\) \+ '%\)'/, 'all three steps must slide within one sheet');
  assert.match(fn, /<CryptoInvoicePanel ref=\{invoiceApiRef\}[^>]*invoiceId=\{invoiceId\}/, 'the invoice must render INSIDE the sheet, never as a second popup');
  assert.match(fn, /dir="ltr"[^>]*overflow: 'hidden'/, 'the clipping box must be LTR - in RTL it starts scrolled to the right and would show the last panel first');
  // Check Now must live in the sheet's OWN footer, next to Close - never floating inside the
  // invoice panel's own content (which used to sit below the fold, half-hidden).
  assert.match(fn, /subInvoiceClose'\)\}<\/Button>\s*<span style=\{\{ flex: 1 \}\} \/>\s*\{invoiceStatus\.canCheck/, 'Close and Check Now must be siblings in the same footer branch');
  assert.match(fn, /invoiceApiRef\.current && invoiceApiRef\.current\.checkNow\(\)/, 'the footer button must call the panel\'s own imperative Check Now action');
  assert.match(fn, /subPayInvoice/);
  assert.match(fn, /subPayTotal/);
  assert.match(fn, /subPayDiscountUnavailable/, 'the discount-code row must be honestly marked unavailable - there is no coupon backend');
  assert.match(fn, /disabled placeholder=\{tr\(lang, 'subPayDiscountPlaceholder'\)\}/, 'the discount input must be disabled, never appear to accept a code');
});

test('accountProfileView.jsx: both WalletCard\'s top-up and SubscriptionTab\'s upgrade flow route through the shared PaymentSheet before actually submitting', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  assert.match(src, /<PaymentSheet[\s\S]{0,400}onProceed=\{requestTopUp\}/, 'WalletCard must gate requestTopUp behind the sheet');
  assert.match(src, /<PaymentSheet[\s\S]{0,500}onProceed=\{\(\) => requestUpgrade\(upgradeTarget\)\}/, 'the upgrade only actually submits from the sheet');
  assert.doesNotMatch(src, /function UpgradeModal\(/, 'the separate upgrade-confirmation modal must be gone');
  assert.doesNotMatch(src, /upgradeAwaitingPayment/, 'the two-popup handshake state must be gone with it');
});

// Both billing providers carried their own hardcoded ['plus', 'personalized'] list, so the 4th
// plan was rejected with VALIDATION_FAILED at purchase time - the "Upgrade to Pro" button could
// never have worked. Both now derive from PLAN_NAMES.
test('both billing providers accept every paid plan, derived from PLAN_NAMES rather than a second hardcoded list', async () => {
  const defaults = await read('server', 'commercial', 'commercial-defaults.mjs');
  assert.match(defaults, /export const PAID_PLAN_NAMES = PLAN_NAMES\.filter\(\(name\) => name !== 'free'\);/);
  for (const file of ['manual-billing-provider.mjs', 'bsc-crypto-billing-provider.mjs']) {
    const src = await read('server', 'commercial', file);
    assert.match(src, /import \{ PAID_PLAN_NAMES \} from '\.\/commercial-defaults\.mjs'/, file + ' must import the shared list');
    assert.match(src, /if \(!PAID_PLAN_NAMES\.includes\(planId\)\) throw new ApiError\(400, 'VALIDATION_FAILED'\);/, file + ' must validate against it');
    assert.doesNotMatch(src, /\['plus', 'personalized'\]/, file + ' must not keep its own plan list');
  }
});

test('accountProfileView.jsx: every plan card band has a fixed height so the four cards line up row-for-row', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const idx = src.indexOf('function PlanComparisonGrid(');
  const fn = src.slice(idx, idx + 6500);
  assert.match(src, /const PLAN_SPEC_ROW_COUNT = 6;/);
  assert.match(src, /const SPEC_ROWS = \[/, 'every card must render the SAME six spec rows');
  assert.equal(src.match(/\{ key: '[a-zA-Z]+', label: 'subSpec/g).length, PLAN_SPEC_ROW_COUNT_EXPECTED, 'there must be exactly six spec rows');
  assert.match(fn, /height: 26, display: 'flex'/, 'the badge band must reserve its height even with no badge');
  assert.match(fn, /height: 46, display: 'flex', alignItems: 'baseline'/, 'the price band must be fixed height');
  assert.match(fn, /fontSize: 34, lineHeight: '42px'/, 'the price needs an explicit line-height or its glyph box overflows into the name band above');
  assert.match(fn, /height: 30, display: 'flex'/, 'spec rows must be fixed height');
  assert.match(fn, /height: 26, display: 'flex', alignItems: 'center', gap: 8/, 'perk rows must be fixed height');
  assert.match(fn, /height: 44, marginTop: 16/, 'the CTA band must be fixed height so the buttons land on one line');
  assert.match(src, /const PERK_ROWS = \[/, 'the three feature rows must render in every card, locked or checked');
});

test('account-profile-ui.js: the React-mount call is wrapped in a try/catch that shows a real error instead of a silent black screen (the reported bug)', async () => {
  const src = await read('public', 'pages', 'shared', 'account-profile-ui.js');
  const idx = src.indexOf('if (window.TradeJournalNavryaAccountProfile && window.TradeJournalNavryaAccountProfile.render) {');
  assert.ok(idx > -1);
  const block = src.slice(idx, idx + 700);
  assert.match(block, /try\s*\{/);
  assert.match(block, /catch \(error\)/);
  assert.match(block, /layer\.show\(errorPage, 'account-profile'\)/, 'a caught failure must still show SOMETHING via layer.show(), never leave the previous panel silently blank');
});

test('character-app.jsx: a WalletLowBalanceGate is defined and mounted, checking real wallet balance and subscription status (never a fabricated signal)', async () => {
  const src = await read('navrya-src', 'character-app.jsx');
  assert.match(src, /function WalletLowBalanceGate\(/);
  assert.match(src, /wallet\.totalBalanceMicroUsd <= 0/);
  assert.match(src, /sub\.subscription\.status === 'past_due'/);
  assert.match(src, /createRoot\(walletGateRoot\)\.render\(<WalletLowBalanceGate/, 'the gate must actually be mounted, not just defined');
});

test('character-app.jsx: the low-balance gate snoozes itself in localStorage after dismissal, so it never nags on every navigation', async () => {
  const src = await read('navrya-src', 'character-app.jsx');
  assert.match(src, /WALLET_GATE_SNOOZE_KEY/);
  assert.match(src, /localStorage\.setItem\(WALLET_GATE_SNOOZE_KEY/);
});

test('admin/app.js: the plan editor covers all 4 plans (including the new pro), and posts displayName/tokenDiscountPercent alongside the existing fields', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  assert.match(src, /\['free', 'plus', 'pro', 'personalized'\]\.forEach/);
  assert.match(src, /PLAN_FEATURE_KEYS = \['wallet', 'ai', 'voice', 'aiPanelBuilder', 'byok', 'premiumModels'\]/);
  const idx = src.indexOf('const saveBtn = el(\'button\', \'btn btn-primary\', t(\'comSavePlan\'));');
  const block = src.slice(idx, idx + 900);
  assert.match(block, /displayName: displayNameField\.input\.value/);
  assert.match(block, /if \(discountField\) payload\.tokenDiscountPercent = Number\(discountField\.input\.value\)/);
});

test('admin/app.js: subscription admin stats include an Active Pro count alongside the existing Plus/Personalized ones', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  assert.match(src, /statCard\('star', fmtNumber\(s\.activePro\), t\('comStatActivePro'\)\)/);
});

test('repo.memory.mjs and repo.pg.mjs both expose wallet.getReservation() and count activePro in adminStats() - kept in sync', async () => {
  const memSrc = await read('server', 'db', 'repo.memory.mjs');
  const pgSrc = await read('server', 'db', 'repo.pg.mjs');
  for (const src of [memSrc, pgSrc]) {
    assert.match(src, /async getReservation\(reservationId\)/);
    assert.match(src, /activePro/);
  }
});
