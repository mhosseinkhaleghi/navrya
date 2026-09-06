import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Journey F, F37: pattern.delete, strategy.delete, session.delete, scenario.delete, entry.delete,
// trade.delete. Same convention as tests/trade-lifecycle-actions.test.mjs /
// tests/community-marketplace-messaging-actions.test.mjs / tests/account-settings-actions.test.mjs -
// navrya-src has no DOM test harness in this project, the real proof is real-browser verification
// (see the F37 final report). These are static-source regression guards for the confirmation gate,
// exact-target resolution, switched-target safety, and the exclusion of every workflow with no
// real, reachable delete UI (Community post/comment, message, Marketplace listing, account).

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const liveSessionSrc = await readFile(path.join(root, 'navrya-src', 'liveSessionView.jsx'), 'utf8');
const strategiesHubSrc = await readFile(path.join(root, 'navrya-src', 'strategiesHubView.jsx'), 'utf8');
const chatDockCoreSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'chat-dock-core.js'), 'utf8');
const aiI18nSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-i18n.js'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: [\\s\\S]*?\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

const DESTRUCTIVE_ACTIONS = [
  ['pattern.delete', 'confirm'], ['strategy.delete', 'confirm'], ['session.delete', 'confirm'],
  ['scenario.delete', 'confirmDelete'], ['entry.delete', 'confirmDelete'], ['trade.delete', 'confirm']
];

test('every destructive action requires its own confirmation-gate field, high riskLevel, and never mutates inside open() - only submit(), gated on confirm, may', () => {
  for (const [id, field] of DESTRUCTIVE_ACTIONS) {
    const block = actionBlock(id);
    assert.match(block, new RegExp(`requiredFields: \\['${field}'\\]`), `${id} must require '${field}'`);
    assert.match(block, /riskLevel: 'high'/, `${id} must be riskLevel high`);
    const openFn = /open: \([^)]*\) => new Promise\(\(resolve\) => \{([\s\S]*?)\n {8}\}\),/.exec(block);
    assert.ok(openFn, `could not find ${id}'s open()`);
    assert.doesNotMatch(openFn[1], /\.remove\(|\.delete\(/, `${id}'s open() must never mutate/delete - only submit() may`);
  }
});

test('every destructive action\'s submit() checks the gate field strictly (=== true or the string "true") before calling any real delete method', () => {
  for (const [id, field] of DESTRUCTIVE_ACTIONS) {
    const block = actionBlock(id);
    const re = new RegExp(`if \\(known\\.${field} !== true && known\\.${field} !== 'true'\\) return undefined;`);
    assert.match(block, re, `${id}'s submit() must gate strictly on known.${field}`);
  }
});

test('every destructive action re-verifies the CURRENT active entity still matches the originally resolved target before deleting (F37 section 6: switched-target safety) - never blindly trusts a remembered id or a single registration\'s own isOpen() in isolation', () => {
  for (const [id] of DESTRUCTIVE_ACTIONS) {
    const block = actionBlock(id);
    if (id === 'session.delete') {
      // Sessions have no per-entity process registration to re-resolve against - the real
      // "is this still the active one" signal is getActiveSessionId() itself, re-read fresh.
      assert.match(block, /live\.getActiveSessionId\(\) !== id/, `${id} must re-verify against the real getActiveSessionId()`);
      continue;
    }
    assert.match(block, /currentActive/, `${id}'s submit() must re-verify against a freshly-resolved current target`);
    assert.match(block, /if \(currentActive && currentActive(\.id)? !== id\) return undefined;/, `${id} must refuse when the current target does not match the remembered one`);
  }
});

test('pattern.delete and strategy.delete resolve the exact target either from the one currently open OR by exact name - zero/ambiguous name matches resolve nothing, never guessed (F53)', () => {
  for (const [id, nameField] of [['pattern.delete', 'patternName'], ['strategy.delete', 'strategyName']]) {
    const block = actionBlock(id);
    assert.match(block, new RegExp(`optionalFields: \\['${nameField}'\\]`));
    assert.match(block, /if \(matches\.length !== 1\) \{ resolve\(null\); return; \}/);
  }
});

test('session.delete, scenario.delete, and entry.delete are only available while a real active Session/Scenario/Entry is resolved - never guessed among several', () => {
  assert.match(actionBlock('session.delete'), /available: \(context\) => !!\(context && context\.activeEntities && context\.activeEntities\.sessionId\)/);
  assert.match(actionBlock('scenario.delete'), /available: \(context\) => !!\(context && context\.activeEntities && context\.activeEntities\.scenarioId\)/);
  assert.match(actionBlock('entry.delete'), /available: \(context\) => !!\(context && context\.activeEntities && context\.activeEntities\.entryId\)/);
});

test('trade.delete is explicitly distinguished from trade.cancel (status change) and trade.close (real exit) in its own description, and maps "delete"/"remove" regardless of the Trade\'s current status', () => {
  const block = actionBlock('trade.delete');
  assert.match(block, /never for "cancel"\/"abandon"/i);
  assert.match(block, /regardless of the Trade/i);
  assert.match(block, /current status \(Hunting, Open, Closed, or Cancelled\)/i);
});

test('scenario.delete and entry.delete extend the real, previously-unconfirmed deleteScenario()/deleteEntry() with a submit() gated on confirmDelete - the real delete icon had no window.confirm() of its own (found via repository audit)', () => {
  assert.match(liveSessionSrc, /allowlist: \['title', 'description', 'evidence', 'problem', 'trigger', 'positionType', 'entryPrices', 'stopLoss', 'takeProfit', 'patternName', 'probability', 'invalidationNote', 'invalidationTags', 'confirmDelete'\]/);
  assert.match(liveSessionSrc, /submit: \(\) => onDeleteRef\.current\(\)/);
  assert.match(liveSessionSrc, /allowlist: \['note', 'confirmDelete'\]/);
  assert.match(liveSessionSrc, /submit: \(\) => onDeleteEntryRef\.current\(entry\)/);
});

test('ScenarioEditor\'s live-session-scenario-{id} registration guards isOpen() with a real mountedRef, not just the live `open` prop - found via real browser testing: without it, deleting a Scenario left a permanently-stale, already-deleted registration reporting isOpen()=true forever (the same closure-never-replaced bug already fixed for pattern-editor-{id}/strategy-editor-{id}\'s switched-target safety), which made ai-context-engine.js\'s activeOpenProcess()-based activeEntryId() silently prefer the deleted Scenario over its own still-open parent Entry, permanently blocking entry.delete\'s available() gate for the rest of the page load', () => {
  assert.match(liveSessionSrc, /const mountedRef = React\.useRef\(true\);\s*\n\s*React\.useEffect\(\(\) => \{\s*\n\s*mountedRef\.current = true;\s*\n\s*return \(\) => \{ mountedRef\.current = false; \};\s*\n\s*\}, \[scenario\.id\]\);/);
  assert.match(liveSessionSrc, /isOpen: \(\) => mountedRef\.current && open,/);
});

test('every destructive action calls the exact real store/workspace remove method the human-facing (window.confirm-gated) delete button also reaches - never a hidden/reimplemented delete path', () => {
  assert.match(actionBlock('pattern.delete'), /window\.TradeJournalPatternStore\.remove\(id\)/);
  assert.match(actionBlock('strategy.delete'), /window\.TradeJournalStrategyEducationStore\.remove\(id\)/);
  assert.match(actionBlock('session.delete'), /window\.TradeJournalWorkspace && window\.TradeJournalWorkspace\.remove\(id\)/);
  assert.match(actionBlock('trade.delete'), /window\.TradeJournalTradeStore\.remove\(id\)/);
});

test('no delete/unpublish action exists for Community post, comment, message, or Marketplace listing - none has a real, reachable delete UI in the product (verified by repository audit)', () => {
  assert.doesNotMatch(characterAppSrc, /id: 'community\.post\.delete'/);
  assert.doesNotMatch(characterAppSrc, /id: 'community\.comment\.delete'/);
  assert.doesNotMatch(characterAppSrc, /id: 'message\.delete'/);
  assert.doesNotMatch(characterAppSrc, /id: 'marketplace\.unpublish'/);
  assert.doesNotMatch(characterAppSrc, /id: 'marketplace\.listing\.delete'/);
});

test('no account deletion action exists anywhere - intentionally excluded, no such flow exists in the product at all', () => {
  assert.doesNotMatch(characterAppSrc, /id: 'account\.delete'/);
  assert.doesNotMatch(characterAppSrc, /id: 'profile\.delete'/);
});

test('none of the six destructive actions ever declares a fillable field for password, API key, admin role, or billing', () => {
  for (const [id] of DESTRUCTIVE_ACTIONS) {
    const block = actionBlock(id);
    const fieldsMatch = /requiredFields: \[([^\]]*)\], optionalFields: \[([^\]]*)\]/.exec(block);
    assert.ok(fieldsMatch, `${id} must declare requiredFields/optionalFields`);
    assert.doesNotMatch(fieldsMatch[1] + fieldsMatch[2], /password|apiKey|admin|billing/i, `${id} must never declare an excluded field as fillable`);
  }
});

test('chat-dock-core.js resolves an explicit REJECTION or CONFIRMATION of a pending single-gate-field workflow deterministically and client-side, never left to the model\'s own free-form JSON extraction', () => {
  // Slice W1 (field/gate contracts): the old /^(confirm|send|publish)/i prefix-match guess is
  // gone - detection now reads the action's own explicit gateField declaration (character-app.jsx),
  // which cannot be fooled by a real, ordinary field merely NAMED like a gate, and works for any
  // gate field name, not only ones matching that specific prefix pattern.
  assert.match(chatDockCoreSrc, /var gateAction = gateWorkflow && actionRegistry \? actionRegistry\.get\(gateWorkflow\.actionId\) : null;/);
  assert.match(chatDockCoreSrc, /gateAction && gateAction\.gateField && Array\.isArray\(gateWorkflow\.missing\) && gateWorkflow\.missing\.length === 1 && gateWorkflow\.missing\[0\] === gateAction\.gateField/);
  assert.match(chatDockCoreSrc, /gateDecision === 'reject'/);
  assert.match(chatDockCoreSrc, /gateDecision === 'confirm'/);
  assert.match(chatDockCoreSrc, /workflowEngine\.cancel\(\)/);
  assert.match(chatDockCoreSrc, /workflowEngine\.applyKnownFields\(\[\{ path: gateField, value: true \}\], gateContext\)/);
});

// Slice W1: every one of the 13 original gate actions (F37's own table) now declares gateField
// explicitly - the SAME field name normalizeGateField() already enforced, just made introspectable
// instead of only implicit in which normalizeField function happens to be assigned.
test('every one of the 13 original gate actions declares gateField explicitly, matching the exact field name its own normalizeGateField() call already uses', () => {
  const GATE_ACTIONS = [
    ['trade.cancel', 'confirm'], ['pattern.delete', 'confirm'], ['strategy.delete', 'confirm'],
    ['session.delete', 'confirm'], ['trade.delete', 'confirm'],
    ['scenario.delete', 'confirmDelete'], ['entry.delete', 'confirmDelete'],
    ['community.post.create', 'publish'],
    ['community.comment.create', 'send'], ['marketplace.messageSeller', 'send'],
    ['message.compose', 'send'], ['message.reply', 'send'],
    ['marketplace.publish', 'confirmPublish']
  ];
  assert.equal(GATE_ACTIONS.length, 13);
  for (const [id, field] of GATE_ACTIONS) {
    const block = actionBlock(id);
    assert.match(block, new RegExp(`normalizeField: normalizeGateField\\('${field}'\\),`), `${id} must call normalizeGateField('${field}')`);
    assert.match(block, new RegExp(`gateField: '${field}',`), `${id} must declare gateField: '${field}'`);
  }
});

test('an explicit false on a gate field is normalized to null (never applied) rather than counting as "known" - ai-workflow-engine.js\'s own missingFields() treats any non-undefined/null/empty value as resolved, which would otherwise silently auto-complete-and-clear a confirmation workflow with nothing actually confirmed', () => {
  const helperMatch = /function normalizeGateField\(gateFieldName\) \{([\s\S]*?)\n {6}\}/.exec(characterAppSrc);
  assert.ok(helperMatch, 'could not find normalizeGateField helper');
  assert.match(helperMatch[1], /value === false \|\| value === 'false'/);
  assert.match(helperMatch[1], /return null;/);
  // Every gate-field action (destructive and F26-32 external-effect) must wire it in.
  for (const [id] of DESTRUCTIVE_ACTIONS) {
    assert.match(actionBlock(id), /normalizeField: normalizeGateField\(/, `${id} must use normalizeGateField`);
  }
  for (const id of ['trade.cancel', 'community.post.create', 'community.comment.create', 'marketplace.publish', 'marketplace.messageSeller', 'message.compose', 'message.reply']) {
    assert.match(actionBlock(id), /normalizeField: normalizeGateField\(/, `${id} must also use normalizeGateField`);
  }
});

test('the localized cancellation/confirmation replies exist in all four languages (fa/ar/en/es)', () => {
  for (const key of ['aiDockConfirmationCancelled', 'aiDockConfirmationAccepted']) {
    const count = (aiI18nSrc.match(new RegExp(key + ':', 'g')) || []).length;
    assert.equal(count, 4, `${key} must be defined in exactly 4 languages`);
  }
});

test('session.delete registers a real, always-open synthetic process (\'session-delete-confirm\') so ai-workflow-engine.js\'s own scheduleSubmit() stillOpen check has something real to find - an unregistered processId silently discards the workflow without ever calling submit()', () => {
  const block = actionBlock('session.delete');
  assert.match(block, /registry\.register\('session-delete-confirm', \{ allowlist: \['confirm'\], isOpen: \(\) => true \}\)/);
});

test('the synthetic \'session-delete-confirm\' registration is permanently open (isOpen always true, non-empty allowlist) and must therefore be unconditionally excluded from activeProcess resolution in chat-dock-core.js, the same way settings-trading-defaults/settings-region-language/ai-assistant-engine already are - otherwise, once registered, it would silently block ALL later action discovery for the rest of the page load (F27-31/F33-36\'s own documented bug class)', () => {
  assert.match(chatDockCoreSrc, /activeProcess\.id === 'session-delete-confirm'/);
});

test('pattern-editor-{id} and strategy-editor-{id}\'s own real registrations both extend their allowlist with a synthetic \'confirm\' field (F26-32\'s own documented "missing synthetic gate field" bug class, never applied to F37\'s new confirm field) - without it, pattern.delete/strategy.delete\'s confirm turn continues through activeProcess.allowlist (these two ids are only CONDITIONALLY excluded, preserved for pattern.edit/strategy.edit\'s own legitimate continuation), and the model has no schema path to ever express confirm:true - confirmed via real browser testing: every EN confirm phrase happened to be intercepted by the deterministic gate fast-path before reaching the network, masking this for English, but FA/AR/ES (and any EN phrasing the fast-path\'s regex does not cover) fell through to a network turn with no way to confirm at all until this fix', () => {
  assert.match(strategiesHubSrc, /const allowlist = \(patternTypes\.patternStagePaths \|\| \[\]\)\.slice\(\)\.concat\(\['confirm'\]\);/);
  assert.match(strategiesHubSrc, /\.concat\(\['name', 'confirm'\]\);/);
  // strategy-editor's applyValue forwards ANY allowlisted path straight to the real store's
  // setPath() - 'confirm' must be explicitly excluded so it can never be written onto the record.
  assert.match(strategiesHubSrc, /applyValue: \(path, value\) => \{ if \(path !== 'confirm' && allowlist\.indexOf\(path\) > -1\) set\(path, value\); \}/);
});
