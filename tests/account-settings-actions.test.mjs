import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Journey F, F33-F36: profile.edit, profile.role.update, settings.trading.update,
// settings.language.update, settings.ai.update. Same convention as
// tests/trade-lifecycle-actions.test.mjs / tests/community-marketplace-messaging-actions.test.mjs -
// navrya-src has no DOM test harness in this project, the real proof is real-browser verification
// (see the F33-F36 final report). These are static-source regression guards for the exclusion of
// password/API-key/admin/billing/deletion, and the entityAlreadyPersisted/submit design.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const accountProfileSrc = await readFile(path.join(root, 'navrya-src', 'accountProfileView.jsx'), 'utf8');
const settingsViewSrc = await readFile(path.join(root, 'navrya-src', 'settingsView.jsx'), 'utf8');
const aiAssistantSrc = await readFile(path.join(root, 'navrya-src', 'aiAssistantView.jsx'), 'utf8');
const chatDockCoreSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'chat-dock-core.js'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: [\\s\\S]*?\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

const NEW_ACTIONS = ['profile.edit', 'profile.role.update', 'settings.trading.update', 'settings.language.update', 'settings.ai.update'];

test('none of the five new F33-F36 actions declares a fillable field for password, API key, admin role, billing, or account deletion - only the requiredFields/optionalFields/allowlist declarations are checked, since the description text legitimately names these terms to instruct the model NOT to touch them', () => {
  for (const id of NEW_ACTIONS) {
    const block = actionBlock(id);
    const fieldsMatch = /requiredFields: \[([^\]]*)\], optionalFields: \[([^\]]*)\]/.exec(block);
    assert.ok(fieldsMatch, `${id} must declare requiredFields/optionalFields`);
    const declaredFields = fieldsMatch[1] + fieldsMatch[2];
    assert.doesNotMatch(declaredFields, /password|apiKey|api_key|admin|billing|subscription|delete/i, `${id} must never declare an excluded field as fillable`);
  }
});

test('profile.edit never fills avatarDataUrl - the model cannot supply a real picked file and must never fabricate one', () => {
  const block = actionBlock('profile.edit');
  assert.match(block, /optionalFields: \['displayName', 'email', 'phone'\]/);
  assert.doesNotMatch(block, /avatarDataUrl/);
});

// Slice W1 (field/gate contracts), audit finding: profile.edit itself never asks for
// avatarDataUrl (the test above), but the REAL registration's own allowlist/applyValue still had
// a live seam for it regardless of what any one action requests - a future action, or a bug in
// this one's own field schema, would otherwise reach straight through to a real, silent avatar
// change. This pins that the seam is gone at its actual source, not merely unreached today.
test('the real account-profile-identity registration has no avatarDataUrl seam at all - not just an unused one - so no caller (present or future) can ever silently change the avatar through it', () => {
  const registerBlock = accountProfileSrc.slice(accountProfileSrc.indexOf("registry.register('account-profile-identity'"), accountProfileSrc.indexOf('return () => { mountedRef.current = false; };'));
  assert.match(registerBlock, /allowlist: \['displayName', 'email', 'phone'\],/);
  const applyValueBlock = registerBlock.slice(registerBlock.indexOf('applyValue: (path, value) => {'), registerBlock.indexOf('submit: () => submitRef.current()'));
  assert.doesNotMatch(applyValueBlock, /avatarDataUrl/, 'no applyValue branch for avatarDataUrl - the manual file picker never goes through this registry at all');
});

test('profile.role.update requires role and delegates validation to the real registration - never accepts an authorization role', () => {
  const block = actionBlock('profile.role.update');
  assert.match(block, /requiredFields: \['role'\]/);
  assert.match(block, /never an authorization or admin permission/i);
  assert.match(accountProfileSrc, /REAL_ROLES\.some\(\(r\) => r\.id === value\)/);
});

test('settings.trading.update, settings.language.update, settings.ai.update, settings.alerts.update, and settings.companion.update are all entityAlreadyPersisted (their real UI applies and persists every field immediately, no separate Save step)', () => {
  for (const id of ['settings.trading.update', 'settings.language.update', 'settings.ai.update', 'settings.alerts.update', 'settings.companion.update']) {
    assert.match(actionBlock(id), /entityAlreadyPersisted: true/);
  }
});

// Slice U1-c (execution brief section 9 item 10, "alerts/cooldowns"): every one of the six real
// toggles in Settings' own Alerts & discipline section.
test('settings.alerts.update declares all six real toggles as optional, boolean-only fields - never inferred from unrelated conversation', () => {
  const block = actionBlock('settings.alerts.update');
  assert.match(block, /optionalFields: \['sessionOpen', 'position', 'emotionCheckIns', 'cooldown', 'community', 'sound'\]/);
  assert.match(block, /if \(text === 'on' \|\| text === 'true' \|\| text === 'enable' \|\| text === 'enabled'\) return true;/);
  assert.match(block, /if \(text === 'off' \|\| text === 'false' \|\| text === 'disable' \|\| text === 'disabled'\) return false;/);
});

test('the real settings-alerts registration now exists, covering the same six keys through each row\'s own real onToggle - the cool-down lock is now directional (takes the target value), never a blind flip', () => {
  const registration = /registry\.register\('settings-alerts', \{[\s\S]*?\n {4}\}\);/.exec(settingsViewSrc);
  assert.ok(registration);
  assert.match(registration[0], /allowlist: rows\.map\(\(row\) => row\.key\)/);
  assert.match(settingsViewSrc, /function setCooldown\(value\) \{/);
  assert.doesNotMatch(settingsViewSrc, /function toggleCooldown/, 'the old blind-flip toggle must be gone, replaced by the directional setCooldown()');
});

// Slice U1-c (execution brief section 9 item 10, "goal and companion initiative").
test('settings.companion.update validates initiative against the real low/normal/high set and goal against the real five domains (or the explicit "none" clear sentinel) - never an invented value', () => {
  const block = actionBlock('settings.companion.update');
  assert.match(block, /optionalFields: \['initiative', 'goal'\]/);
  assert.match(block, /\['low', 'normal', 'high'\]\.indexOf\(initiativeText\) !== -1 \? initiativeText : null;/);
  assert.match(block, /\['patterns', 'strategies', 'sessions', 'trades', 'psychology'\]\.indexOf\(goalText\) !== -1 \? goalText : null;/);
  // The clear sentinel must be a real, non-empty string ('none') - an empty string would be
  // silently treated as absent extraction by ai-workflow-engine.js's own applyKnownFields(),
  // exactly the "explicit clear vs. plain omission" gap Slice W1 addressed.
  assert.match(block, /if \(goalText === '' \|\| goalText === 'none' \|\| goalText === 'no goal' \|\| goalText === 'clear'\) return 'none';/);
});

test('the real settings-companion registration covers both initiative and goal through the exact same changeInitiative()/changeGoal() the real Select controls call, and correctly translates the \'none\' clear sentinel back to a real empty domain', () => {
  const registration = /registry\.register\('settings-companion', \{[\s\S]*?\n {4}\}\);/.exec(settingsViewSrc);
  assert.ok(registration);
  assert.match(registration[0], /allowlist: \['initiative', 'goal'\]/);
  assert.match(registration[0], /const domain = value === 'none' \? '' : value;/);
  assert.match(settingsViewSrc, /function changeGoal\(value\) \{/);
  assert.match(settingsViewSrc, /if \(orchestrator\) orchestrator\.setCurrentGoal\(domainOrNull\);/);
});

test('settings.trading.update\'s own description explicitly distinguishes the Settings default from a currently-open Trade\'s risk field or a Strategy\'s max-risk rule', () => {
  const block = actionBlock('settings.trading.update');
  assert.match(block, /Distinct from a currently open Trade|never place an order/i);
  assert.match(block, /Strategy/);
});

test('settings.language.update only sets language from an explicit app-language request, never merely because of the language spoken', () => {
  const block = actionBlock('settings.language.update');
  assert.match(block, /EXPLICIT request/i);
  assert.match(block, /never merely because the user is speaking/i);
});

test('settings.ai.update never wires an API key field into applyValue - not just missing from the allowlist, absent from the handler entirely', () => {
  const block = actionBlock('settings.ai.update');
  assert.match(block, /optionalFields: \['provider', 'model', 'voice'\]/);
  const registration = /registry\.register\('ai-assistant-engine', \{[\s\S]*?\n {4}\}\);/.exec(aiAssistantSrc);
  assert.ok(registration, 'could not find the real ai-assistant-engine registration');
  assert.doesNotMatch(registration[0], /setKey|persistApiKey|setBudget/);
  assert.match(registration[0], /allowlist: \['provider', 'model', 'voice'\]/);
});

test('ai-assistant-engine validates model against the real, current provider\'s own models catalog - never a fabricated model id', () => {
  const registration = /registry\.register\('ai-assistant-engine', \{[\s\S]*?\n {4}\}\);/.exec(aiAssistantSrc);
  assert.match(registration[0], /current\.models\.indexOf\(value\) > -1/);
});

test('account-profile-identity and account-profile-role now expose submit() through a ref kept current every render, avoiding the ScenarioEditor-class stale-closure bug', () => {
  const identityMatch = /registry\.register\('account-profile-identity', \{[\s\S]*?\n {4}\}\);/.exec(accountProfileSrc);
  assert.ok(identityMatch);
  assert.match(identityMatch[0], /submit: \(\) => submitRef\.current\(\)/);
  const roleMatch = /registry\.register\('account-profile-role', \{[\s\S]*?\n {4}\}\);/.exec(accountProfileSrc);
  assert.ok(roleMatch);
  assert.match(roleMatch[0], /submit: \(\) => submitRef\.current\(\)/);
  assert.match(accountProfileSrc, /submitRef\.current = save;/);
});

test('settings-region-language\'s allowlist now includes language, validated against the real languageOptions and applied through the real store.setLanguage()', () => {
  const registration = /registry\.register\('settings-region-language', \{[\s\S]*?\n {4}\}\);/.exec(settingsViewSrc);
  assert.ok(registration);
  // Slice U1-c (execution brief section 9 item 10, "clock format"): region.clock24 - the real,
  // pre-existing 24h/12h toggle - is now also in this same allowlist, with its own boolean check
  // (it has no options list to validate against the way every `rows` entry does).
  assert.match(registration[0], /allowlist: \['language', 'region\.clock24'\]\.concat/);
  assert.match(registration[0], /languageOptions\.some\(\(o\) => o\.value === value\)/);
  assert.match(registration[0], /store\.setLanguage\(value\)/);
  assert.match(registration[0], /if \(path === 'region\.clock24'\) \{ if \(value === true \|\| value === false\) patch\(\{ clock24: value \}\); return; \}/);
});

test('every new action resolves its real process id and navigates to the real page/tab in open(), never mutating anything before the field-level applyValue/submit steps', () => {
  assert.match(actionBlock('profile.edit'), /location\.hash = '#account\/profile\/identity'/);
  assert.match(actionBlock('profile.role.update'), /location\.hash = '#account\/profile\/role'/);
  assert.match(actionBlock('settings.trading.update'), /store\.setActiveId\('settings'\)/);
  assert.match(actionBlock('settings.language.update'), /store\.setActiveId\('settings'\)/);
  assert.match(actionBlock('settings.ai.update'), /location\.hash = '#ai-settings'/);
});

test('chat-dock-core.js excludes settings-ai-panel-builder/account-profile-identity/account-profile-role conditionally (unless a workflow is already genuinely continuing through them), and settings-trading-defaults/settings-region-language/ai-assistant-engine UNCONDITIONALLY (they need no entity resolution, so a fresh re-discovery is always at least as good as continuation - required since their entityAlreadyPersisted workflow never completes on its own)', () => {
  assert.match(chatDockCoreSrc, /settings-ai-panel-builder\|account-profile-identity\|account-profile-role/);
  assert.match(chatDockCoreSrc, /activeProcess\.id === 'settings-trading-defaults' \|\| activeProcess\.id === 'settings-region-language' \|\| activeProcess\.id === 'ai-assistant-engine'/);
});

// Slice U1-c: settings-alerts/settings-companion are the exact same entityAlreadyPersisted,
// never-self-completing shape as settings-trading-defaults/settings-region-language/
// ai-assistant-engine - missing this exclusion would reproduce the identical F33-F36 bug class
// (once started, EVERY later message, even something entirely unrelated, would silently return
// action:null for the rest of the page visit).
test('settings-alerts and settings-companion are added to BOTH the unconditional activeProcess exclusion and the workflowProcessExcluded check - the same F33-F36 fix, not just one half of it', () => {
  assert.match(chatDockCoreSrc, /activeProcess\.id === 'ai-assistant-engine' \|\| activeProcess\.id === 'settings-alerts' \|\| activeProcess\.id === 'settings-companion' \|\| activeProcess\.id === 'session-delete-confirm'/);
  assert.match(chatDockCoreSrc, /workflowProcessId === 'ai-assistant-engine' \|\| workflowProcessId === 'settings-alerts' \|\| workflowProcessId === 'settings-companion' \|\| workflowProcessId === 'session-delete-confirm'/);
});

test('the unconditional settings exclusion runs BEFORE currentWorkflow is even read, so it can never depend on / race with workflow state - mirrors live-session-entry-/live-session-scenario- above it', () => {
  const unconditionalIdx = chatDockCoreSrc.indexOf("activeProcess.id === 'settings-trading-defaults'");
  const currentWorkflowIdx = chatDockCoreSrc.indexOf('var currentWorkflow = workflowEngine');
  assert.ok(unconditionalIdx > -1 && currentWorkflowIdx > -1);
  assert.ok(unconditionalIdx < currentWorkflowIdx, 'the unconditional settings exclusion must run before currentWorkflow is read');
});
