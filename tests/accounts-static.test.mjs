import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Static/structural regression coverage for the Accounts domain - navigation wiring,
// translations, and "no duplicate Chat Dock/Voice surface" - mirroring the existing
// "Community: the sidebar nav item routes to #community..." style checks in trade-regression.test.mjs.
const root = process.cwd();
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');

test('accounts sits between dashboard and strategies in the sidebar nav, using the wallet icon', async () => {
  const src = await read('navrya-src', 'character-app.jsx');
  const navFn = src.slice(src.indexOf('function navItems('), src.indexOf('function navItems(') + 700);
  const dashboardIdx = navFn.indexOf("id: 'dashboard'");
  const accountsIdx = navFn.indexOf("id: 'accounts'");
  const strategiesIdx = navFn.indexOf("id: 'strategies'");
  assert.ok(dashboardIdx > -1 && accountsIdx > -1 && strategiesIdx > -1, 'all three nav entries must be present');
  assert.ok(dashboardIdx < accountsIdx && accountsIdx < strategiesIdx, 'accounts must sit between dashboard and strategies');
  assert.match(navFn.slice(accountsIdx, accountsIdx + 60), /icon:\s*'wallet'/);
});

test('the wallet icon slug maps to the real Lucide "Wallet" icon', async () => {
  const src = await read('public', 'pages', 'shared', 'navrya', 'components', 'core', 'Icon.jsx');
  assert.match(src, /wallet:\s*'Wallet'/);
});

test('navAccounts is translated in every supported language (en/fa/ar/es), each paired with navDashboard', async () => {
  const src = await read('navrya-src', 'i18n.js');
  const blocks = src.match(/nav\w+: '[^']*'(?:, nav\w+: '[^']*')*/g) || [];
  const withAccounts = (src.match(/navDashboard: '[^']*', navAccounts: '[^']*'/g) || []).length;
  assert.equal(withAccounts, 4, 'navDashboard must be immediately followed by a translated navAccounts in all 4 language blocks');
});

test('canvasApp.jsx routes the "accounts" view to renderAccounts, alongside dashboard/strategies/settings', async () => {
  const src = await read('navrya-src', 'canvasApp.jsx');
  assert.match(src, /import\s*\{\s*renderAccounts\s*\}\s*from\s*'\.\/accountsView\.jsx'/);
  assert.match(src, /if\s*\(view === 'accounts'\)\s*return renderAccounts\(character\)/);
});

test("store.js's setActiveId() routes 'accounts' through the same real panel-layer render() path as dashboard/strategies/settings, not the hash-routing fallback", async () => {
  const src = await read('navrya-src', 'store.js');
  assert.match(src, /id === 'dashboard' \|\| id === 'strategies' \|\| id === 'settings' \|\| id === 'accounts'/);
});

test('accountsView.jsx never mounts its own ChatDock/Voice surface - the existing global dock is reused, not duplicated', async () => {
  const src = await read('navrya-src', 'accountsView.jsx');
  assert.doesNotMatch(src, /ChatDock/);
  assert.doesNotMatch(src, /VoiceConsole/);
});

test('accountsView.jsx never renders a fabricated broker/prop-firm "connect" wizard - only the honest manual create/edit flow', async () => {
  const src = await read('navrya-src', 'accountsView.jsx');
  assert.doesNotMatch(src, /account detected/i, 'the prototype\'s fabricated "Account detected · ..." wizard confirmation string must never appear');
  assert.doesNotMatch(src, /history import runs in the background/i, 'the prototype\'s fabricated import-progress copy must never appear');
  assert.doesNotMatch(src, /41 firms/i, 'the prototype\'s fabricated "41 firms supported" claim must never appear');
});

test('ai-knowledge-registry.js registers the trading-accounts domain under a distinct id from the profile "account" domain', async () => {
  const src = await read('public', 'pages', 'shared', 'ai-knowledge-registry.js');
  assert.match(src, /id:\s*'trading-accounts'/);
  assert.match(src, /id:\s*'account'/);
});

test('character-app.jsx registers account.create, account.edit, and account.open AI actions', async () => {
  const src = await read('navrya-src', 'character-app.jsx');
  ['account.create', 'account.edit', 'account.open'].forEach((id) => {
    assert.match(src, new RegExp("id: '" + id.replace('.', '\\.') + "'"));
  });
});

test('account.create/account.edit never declare a submit that persists - only the human-facing form save button ever calls AccountsStore.save()', async () => {
  const character = await read('navrya-src', 'character-app.jsx');
  const view = await read('navrya-src', 'accountsView.jsx');
  const createBlock = character.slice(character.indexOf("id: 'account.create'"), character.indexOf("id: 'account.edit'"));
  assert.match(createBlock, /submit: \(\) => undefined/);
  assert.match(view, /registry\.register\('account-manual-form'/);
  const formBlock = view.slice(view.indexOf("registry.register('account-manual-form'"), view.indexOf("registry.register('account-manual-form'") + 800);
  assert.doesNotMatch(formBlock, /submit:/, 'the account-manual-form process registration must not declare a submit function');
});

// Real production bug (2026-09-06): account.create has an empty requiredFields (every one of its
// ~23 fields is optional) and account.edit's only required field (accountName) resolves on turn
// one, while ~23 optional rule fields may still need several more turns to fill. Without
// entityAlreadyPersisted, ai-workflow-engine.js's own "!missing.length -> scheduleSubmit()" rule
// (the same F15 class already fixed for pattern.create/strategy.create/routine.edit/
// therapist.review/profile.analysis.*) called this action's own no-op submit() and cleared the
// workflow within one SUBMIT_GRACE_MS window (~3s) of opening/resolving - found via a real user
// report ("I said personal, the form never changed"): by the time the answer arrived, the
// workflow had already silently self-completed, so the next turn fell through to the
// disconnected suggestions[]/Apply-Discard popover path instead of live-applying to the still-open
// real form.
test('account.create and account.edit declare entityAlreadyPersisted:true, so their own multi-turn optional-field fill outlives the submit grace window instead of self-completing the instant requiredFields is satisfied', async () => {
  const character = await read('navrya-src', 'character-app.jsx');
  const createBlock = character.slice(character.indexOf("id: 'account.create'"), character.indexOf("id: 'account.edit'"));
  const editBlock = character.slice(character.indexOf("id: 'account.edit'"), character.indexOf("id: 'account.open'"));
  assert.match(createBlock, /id: 'account\.create'.*entityAlreadyPersisted: true/s);
  assert.match(editBlock, /id: 'account\.edit'.*entityAlreadyPersisted: true/s);
});
