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

test('accountProfileView.jsx: WalletCard offers a $5 top-up chip alongside the existing amounts', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  assert.match(src, /\[5, 10, 25, 50\]\.map\(\(v\) =>/);
});

test('accountProfileView.jsx: WalletActivityCard computes and renders a running total of real AI settlement spend', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const idx = src.indexOf('function WalletActivityCard(');
  const fn = src.slice(idx, idx + 4200);
  assert.match(fn, /aiUsageTotalMicroUsd/);
  assert.match(fn, /e\.type === 'AI_SETTLEMENT'/);
  assert.match(fn, /subAiUsageTotal/);
});

test('accountProfileView.jsx: a PaymentMethodModal exists, offers crypto/Visa/Iran-gateway, gates the Iran option to fa only, and only crypto actually proceeds', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const idx = src.indexOf('function PaymentMethodModal(');
  assert.ok(idx > -1, 'PaymentMethodModal must exist');
  const fn = src.slice(idx, idx + 1400);
  assert.match(fn, /id: 'crypto'.*implemented: true/);
  assert.match(fn, /id: 'visa'.*implemented: false/);
  assert.match(fn, /lang === 'fa'.*id: 'iran-gateway'/s, 'the Iran gateway option must only be offered for lang===fa');
  assert.match(fn, /if \(method\.implemented\) onProceed\(method\.id\); else setNotAdded\(true\)/, 'only an implemented method may actually proceed; an unimplemented one must show the honest "not added" notice instead');
});

test('accountProfileView.jsx: both WalletCard\'s top-up and SubscriptionTab\'s upgrade flow route through the shared PaymentMethodModal before actually submitting', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  assert.match(src, /<PaymentMethodModal lang=\{lang\} onProceed=\{requestTopUp\} onClose=\{\(\) => setShowPaymentMethod\(false\)\} \/>/, 'WalletCard must gate requestTopUp behind the picker');
  assert.match(src, /onConfirm=\{\(\) => setUpgradeAwaitingPayment\(true\)\}/, 'confirming the upgrade price must show the payment picker next, not call requestUpgrade directly');
  assert.match(src, /onProceed=\{\(\) => requestUpgrade\(upgradeTarget\)\}/, 'the upgrade only actually submits once a payment method is chosen');
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
