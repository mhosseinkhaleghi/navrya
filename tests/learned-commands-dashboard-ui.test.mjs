import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Voice Command Learning Profile addendum, section 10: the AI Dashboard's "Learned Commands"
// section. Same static-source-regression convention as tests/settings-persona-action.test.mjs -
// navrya-src has no DOM test harness in this project; real-browser verification stays a reported
// UNKNOWN.

const root = process.cwd();
const aiAssistantSrc = await readFile(path.join(root, 'navrya-src', 'aiAssistantView.jsx'), 'utf8');
const storeSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'learned-commands-store.js'), 'utf8');

test('TOP_TABS declares the new "learned" tab, right after persona, and the render switch mounts LearnedCommandsTab for it', () => {
  assert.match(aiAssistantSrc, /\{ id: 'persona', icon: 'sparkle', key: 'aiTabPersona' \},\s*\n\s*\{ id: 'learned', icon: 'mic', key: 'aiTabLearnedCommands' \},/);
  assert.match(aiAssistantSrc, /\{topTab === 'learned' && <LearnedCommandsTab i18n=\{i18n\} \/>\}/);
});

test('LearnedCommandsTab reads through window.TradeJournalLearnedCommandsStore only - never a direct fetch of its own, and shows a loading/empty/list state', () => {
  const match = /function LearnedCommandsTab\(\{ i18n \}\) \{[\s\S]*?\nfunction PanelBuilderTab/.exec(aiAssistantSrc);
  assert.ok(match, 'could not find the real LearnedCommandsTab component');
  const block = match[0];
  assert.match(block, /window\.TradeJournalLearnedCommandsStore/);
  assert.doesNotMatch(block, /fetch\(/, 'the component itself must never fetch directly - all network access goes through the store');
  assert.match(block, /store\.listSync\(\)/);
  assert.match(block, /store\.isHydrated\(\)/);
  assert.match(block, /store\.setEnabled\(/);
  assert.match(block, /store\.remove\(/);
  assert.match(block, /aiLearnedCommandsLoading/);
  assert.match(block, /aiLearnedCommandsEmpty/);
});

test('the toggle calls store.setEnabled() (the narrow enable/disable route) - never store.upsert(), which would reset the mapping\'s own trust counters', () => {
  const match = /function LearnedCommandsTab\(\{ i18n \}\) \{[\s\S]*?\nfunction PanelBuilderTab/.exec(aiAssistantSrc);
  const block = match[0];
  assert.doesNotMatch(block, /store\.upsert\(/);
});

test('learned-commands-store.js registers the real list domain against /api/sync/learned-commands, and exposes setEnabled() as a narrow route separate from the generic upsert/remove', () => {
  assert.match(storeSrc, /registerListDomain\(DOMAIN, \{/);
  assert.match(storeSrc, /hydrateUrl: '\/api\/sync\/learned-commands',/);
  assert.match(storeSrc, /deleteUrlFor: function \(id\) \{ return '\/api\/sync\/learned-commands\/' \+ encodeURIComponent\(id\); \}/);
  assert.match(storeSrc, /function setEnabled\(id, enabled\) \{/);
  assert.match(storeSrc, /'\/api\/sync\/learned-commands\/' \+ encodeURIComponent\(id\) \+ '\/enabled'/);
});

test('learned-commands-store.js\'s update() redefines a mapping through the generic upsert() (so the server resets trust counters, matching a genuine redefinition) - never the narrow setEnabled() route', () => {
  assert.match(storeSrc, /function update\(id, patch\) \{/);
  assert.match(storeSrc, /domain\.upsert\(merged\)/);
});

test('learned-commands-store.js exposes fetchLearnableActions() (GET /actions) and resetAll() (DELETE /) as the two new Section 7 dashboard capabilities, and a mechanical, dependency-free friendlyActionName()', () => {
  assert.match(storeSrc, /function fetchLearnableActions\(\) \{/);
  assert.match(storeSrc, /fetch\('\/api\/sync\/learned-commands\/actions'\)/);
  assert.match(storeSrc, /function resetAll\(\) \{/);
  assert.match(storeSrc, /fetch\('\/api\/sync\/learned-commands', \{ method: 'DELETE' \}\)/);
  assert.match(storeSrc, /function friendlyActionName\(actionId\) \{/);
});

test('the Learned Commands tab renders a "Reset all" button that requires window.confirm() before calling store.resetAll() - a human-driven destructive action always confirms first, matching this app\'s own established convention', () => {
  const match = /function LearnedCommandsTab\(\{ i18n \}\) \{[\s\S]*?\nfunction PanelBuilderTab/.exec(aiAssistantSrc);
  const block = match[0];
  assert.match(block, /window\.confirm\(i18n\.t\('aiLearnedCommandsResetAllConfirm'\)\)/);
  assert.match(block, /store\.resetAll\(\)/);
});

test('LearnedCommandEditRow lets the user change the phrase, the action (from the real, server-fetched learnable-actions catalog only), and the target strategy, and saves through the store\'s own update()', () => {
  const match = /function LearnedCommandEditRow\(\{[\s\S]*?\nfunction LearnedCommandsTab/.exec(aiAssistantSrc);
  assert.ok(match, 'could not find the real LearnedCommandEditRow component');
  const block = match[0];
  assert.match(block, /onSave\(\{ normalizedPhrase: phrase, actionId: actionId, targetStrategy: targetStrategy \|\| null \}\)/);
  assert.match(block, /learnableActions\.map\(/, 'the action selector must be built from the real fetched catalog, never a hardcoded list');
});

test('all four character pages load learned-commands-store.js after server-replica.js', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const replicaIndex = html.indexOf('<script defer src="../shared/server-replica.js">');
    const storeIndex = html.indexOf('<script defer src="../shared/learned-commands-store.js">');
    assert.ok(replicaIndex > -1 && storeIndex > -1 && replicaIndex < storeIndex, character + ': server-replica.js loads before learned-commands-store.js');
  }
});
