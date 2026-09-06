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

// Slice U1-a (execution brief section 9 item 1): the historical manual-save-only policy was
// intentionally changed - account.create/account.edit now declare a real `save` gate field (the
// same normalizeGateField()/gateField pattern established for every other confirm/send/publish
// action) and a submit() that actually persists, but ONLY once that field is explicitly true - an
// ordinary field-filling turn (save never mentioned) still never persists anything, exactly as
// before. No funds/order execution or autosave is introduced by this change.
test('account.create/account.edit only persist through an explicit save gate - never as a side effect of ordinary field-filling', async () => {
  const character = await read('navrya-src', 'character-app.jsx');
  const view = await read('navrya-src', 'accountsView.jsx');
  const createBlock = character.slice(character.indexOf("id: 'account.create'"), character.indexOf("id: 'account.edit'"));
  const editBlock = character.slice(character.indexOf("id: 'account.edit'"), character.indexOf("id: 'account.open'"));
  for (const block of [createBlock, editBlock]) {
    assert.match(block, /gateField: 'save', normalizeField: normalizeGateField\('save'\),/);
    assert.match(block, /submit: \(known\) => \{\s*\n\s*if \(known\.save !== true && known\.save !== 'true'\) return undefined;\s*\n\s*return window\.TradeJournalAIProcessRegistry && window\.TradeJournalAIProcessRegistry\.submit\('account-manual-form'\);/);
  }
  assert.match(createBlock, /requiredFields: \['save'\], optionalFields: ACCOUNT_FIELDS,/);
  assert.match(editBlock, /requiredFields: \['accountName', 'save'\], optionalFields: ACCOUNT_FIELDS,/);
  // The real process registration itself now declares a real submit (accountsView.jsx's own
  // save(), read fresh every render via submitRef - never a stale closure) - reached only through
  // the gate above, never bundled into ordinary applyValue() field-filling.
  assert.match(view, /registry\.register\('account-manual-form'/);
  const formBlock = view.slice(view.indexOf("registry.register('account-manual-form'"), view.indexOf("registry.register('account-manual-form'") + 900);
  assert.match(formBlock, /submit: \(\) => submitRef\.current\(\)/);
});

// The original F15-class bug this test used to pin entityAlreadyPersisted for is now prevented a
// different, more correct way: `save` is a REQUIRED field (never empty requiredFields), so
// missingFields() can never reach zero - and ai-workflow-engine.js's own scheduleSubmit() never
// fires - until a genuine, explicit save is confirmed. entityAlreadyPersisted is gone entirely;
// there is no autosave window this policy change could reopen.
test('account.create and account.edit no longer declare entityAlreadyPersisted - the required save gate field itself is what now prevents premature auto-completion', async () => {
  const character = await read('navrya-src', 'character-app.jsx');
  const createBlock = character.slice(character.indexOf("id: 'account.create'"), character.indexOf("id: 'account.edit'"));
  const editBlock = character.slice(character.indexOf("id: 'account.edit'"), character.indexOf("id: 'account.open'"));
  assert.doesNotMatch(createBlock, /entityAlreadyPersisted/);
  assert.doesNotMatch(editBlock, /entityAlreadyPersisted/);
});

// Slice U1-a: account.open can now jump straight to a specific real detail tab, and (once
// already open) a later turn can switch tabs live - the exact same real setTab() control the
// human-facing tab bar already uses, never a fabricated second navigation mechanism.
test('account.open validates tab against the exact real tab ids account-detail-{id} accepts, both at initial open and for a later live switch', async () => {
  const character = await read('navrya-src', 'character-app.jsx');
  const view = await read('navrya-src', 'accountsView.jsx');
  const openBlock = character.slice(character.indexOf("id: 'account.open'"), character.indexOf("id: 'account.open'") + 3500);
  assert.match(openBlock, /optionalFields: \['tab'\]/);
  assert.match(openBlock, /var valid = \['overview', 'rules', 'pretrade', 'performance', 'behaviour'\];/);
  assert.match(openBlock, /hub\.open\(targetId, initialTab\);/);
  const registrationBlock = view.slice(view.indexOf("registry.register('account-detail-'"), view.indexOf("registry.register('account-detail-'") + 900);
  assert.match(registrationBlock, /allowlist: \['tab'\],/);
  assert.match(registrationBlock, /if \(validTabs\.indexOf\(requested\) !== -1\) setTab\(requested\);/);
});
