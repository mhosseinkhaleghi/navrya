import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Context-aware conversational operation layer, section 8: settings.persona.update - the real
// Persona tab (aiAssistantView.jsx's PersonaTab). Same static-source-regression convention as
// tests/account-settings-actions.test.mjs / tests/trade-lifecycle-actions.test.mjs - navrya-src
// has no DOM test harness in this project; real-browser verification stays a reported UNKNOWN.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const aiAssistantSrc = await readFile(path.join(root, 'navrya-src', 'aiAssistantView.jsx'), 'utf8');
const chatDockCoreSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'chat-dock-core.js'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: [\\s\\S]*?\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

test('settings.persona.update is registered with the real gate-field shape (F37) - never entityAlreadyPersisted, since PersonaTab is a local-draft-then-explicit-Save form, not an immediate-apply one', () => {
  const block = actionBlock('settings.persona.update');
  assert.match(block, /domain: 'settings', riskLevel: 'low',/);
  assert.doesNotMatch(block, /entityAlreadyPersisted/);
  assert.match(block, /requiredFields: \['save'\],/);
  assert.match(block, /optionalFields: \['preset', 'explicitness', 'detail', 'warmth', 'humor', 'jargon', 'strictness', 'initiative', 'customInstructionOp', 'customInstructions'\],/);
  assert.match(block, /gateField: 'save',/);
  assert.match(block, /if \(path === 'save'\) return normalizeGateField\('save'\)\(path, value\);/);
});

test('settings.persona.update validates preset against the exact four real PERSONA_PRESETS ids, case-insensitively, never inventing one', () => {
  const block = actionBlock('settings.persona.update');
  assert.match(block, /\['coach', 'analyst', 'calm', 'prof'\]\.indexOf\(presetText\) !== -1 \? presetText : null;/);
});

test('settings.persona.update rejects an out-of-range or non-numeric tone dimension outright (F50) - never clamps it into 0-100 - strictness included alongside the original five', () => {
  const block = actionBlock('settings.persona.update');
  assert.match(block, /\['explicitness', 'detail', 'warmth', 'humor', 'jargon', 'strictness'\]\.indexOf\(path\) !== -1/);
  assert.match(block, /Number\.isFinite\(n\) && n >= 0 && n <= 100/);
  assert.doesNotMatch(block, /Math\.min\(100, ?Math\.max\(0/, 'must reject out-of-range, never clamp');
});

test('settings.persona.update validates customInstructionOp against the exact four real operations, otherwise leaves it unextracted (defaults to replace)', () => {
  const block = actionBlock('settings.persona.update');
  assert.match(block, /\['append', 'replace', 'reset', 'remove'\]\.indexOf\(opText\) !== -1 \? opText : null;/);
});

test('settings.persona.update validates initiative against the exact real low/normal/high set, same values settings.companion.update already writes', () => {
  const block = actionBlock('settings.persona.update');
  assert.match(block, /\['low', 'normal', 'high'\]\.indexOf\(initText\) !== -1 \? initText : null;/);
});

test("settings.persona.update's customInstructions rejects anything over the real 600-char store limit outright - never silently truncates - and supports an explicit 'none'/'clear' sentinel exactly like settings.companion.update's own goal field, never a bare empty string", () => {
  const block = actionBlock('settings.persona.update');
  assert.match(block, /if \(lowered === 'none' \|\| lowered === 'clear'\) return 'none';/);
  assert.match(block, /if \(raw\.length > 600\) return null;/);
  assert.doesNotMatch(block, /\.slice\(0, ?600\)/, 'the ACTION itself must reject an over-limit value, never silently truncate it before persistence');
  // preserved verbatim - never trimmed away internal whitespace/newlines
  assert.match(block, /return raw; \/\/ preserved verbatim/);
});

test('settings.persona.update never declares displayName or any other public-profile field as fillable - persona tone is a completely separate concern from the account profile', () => {
  const block = actionBlock('settings.persona.update');
  assert.doesNotMatch(block, /displayName|avatarDataUrl/);
  assert.match(block, /own public profile display name/);
  assert.match(block, /Never touches/);
});

test('section 11 audit: preferredName (Voice Command Learning Profile addendum) is stored on ai-companion-profile.js\'s own document under a distinctly-named field, never anywhere near account.create/account.edit\'s real displayName field - a form of address, not the account\'s public display name', async () => {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const companionProfileSrc = await readFile(path.join(process.cwd(), 'public', 'pages', 'shared', 'ai-companion-profile.js'), 'utf8');
  assert.match(companionProfileSrc, /preferredName: null, \/\/ free text, short - how the user wants to be addressed/);
  // profile.edit is the one real action that writes the account's own public displayName - it
  // never references preferredName at all, confirming the two fields never collide.
  const profileEditBlock = actionBlock('profile.edit');
  assert.match(profileEditBlock, /optionalFields: \['displayName', 'email', 'phone'\],/);
  assert.doesNotMatch(profileEditBlock, /preferredName/);
});

test("settings.persona.update's description explicitly tells the model a one-off, this-conversation-only styling request must NOT call this action at all - no ephemeral/temporary persona pipeline exists, by design", () => {
  const block = actionBlock('settings.persona.update');
  assert.match(block, /PERSISTENT change only/);
  assert.match(block, /should NOT call this action at all/i);
});

test("settings.persona.update maps a 'ruthless'/blunt-style request only to explicitness/directness, never to unsafe or reckless guidance", () => {
  const block = actionBlock('settings.persona.update');
  assert.match(block, /ruthless\/blunt\/no-nonsense/);
  assert.match(block, /NEVER to unsafe, reckless, or harmful trading advice/);
});

test("settings.persona.update's description tells the model customInstructionOp/customInstructions must be sent together in the same reply, and explains all four operations (append/remove/reset/replace) rather than asking the model to reconstruct the combined text itself", () => {
  const block = actionBlock('settings.persona.update');
  assert.match(block, /customInstructionOp and its matching customInstructions value must be sent together in the SAME reply/);
  assert.match(block, /\\'append\\' adds the given text onto whatever is already saved/);
  assert.match(block, /\\'remove\\' deletes the given exact phrase/);
  assert.match(block, /\\'reset\\' clears all custom instructions entirely/);
  assert.match(block, /the default when customInstructionOp is omitted, preserving old behavior\) overwrites the whole saved text/);
});

test("settings.persona.update's open() navigates to the AI Assistant screen, drives the real topTab through TradeJournalNavryaAiAssistantHub, and polls the real settings-persona registration - never mutating anything before the field-level applyValue/submit steps", () => {
  const block = actionBlock('settings.persona.update');
  assert.match(block, /location\.hash = '#ai-settings';/);
  assert.match(block, /window\.TradeJournalNavryaAiAssistantHub/);
  assert.match(block, /hub\.goToTab\('persona'\);/);
  assert.match(block, /registry\.query\('settings-persona'\)\.open/);
});

test("settings.persona.update's submit() only ever runs once save is explicitly true, delegating to PersonaTab's own real save() through registry.submit('settings-persona') - never a second persistence path", () => {
  const block = actionBlock('settings.persona.update');
  assert.match(block, /if \(known\.save !== true && known\.save !== 'true'\) return undefined;/);
  assert.match(block, /window\.TradeJournalAIProcessRegistry\.submit\('settings-persona'\)/);
});

test('aiAssistantView.jsx exposes TradeJournalNavryaAiAssistantHub.goToTab, the same real setTopTab the tab strip itself calls, mounted/torn down with AiAssistantView - mirrors communityView.jsx\'s own TradeJournalNavryaCommunityShell hub exactly', () => {
  assert.match(aiAssistantSrc, /window\.TradeJournalNavryaAiAssistantHub = \{ goToTab: setTopTab \};/);
  assert.match(aiAssistantSrc, /delete window\.TradeJournalNavryaAiAssistantHub;/);
});

test('the real settings-persona registration fills the SAME local draft state (presetId/tone/customText) the visible presets/sliders/textarea already read, and exposes submit() through a ref kept current every render (the same stale-closure fix as accountsView.jsx/accountProfileView.jsx) since save() itself reads presetId/tone/customText fresh', () => {
  const registration = /registry\.register\('settings-persona', \{[\s\S]*?\n {4}\}\);/.exec(aiAssistantSrc);
  assert.ok(registration, 'could not find the real settings-persona registration');
  const block = registration[0];
  assert.match(block, /allowlist: \['preset', 'explicitness', 'detail', 'warmth', 'humor', 'jargon', 'strictness', 'initiative', 'customInstructionOp', 'customInstructions'\],/);
  assert.match(block, /isOpen: \(\) => mountedRef\.current,/);
  assert.match(block, /if \(preset\) applyPreset\(preset\);/);
  assert.match(block, /setTone\(\(prev\) => Object\.assign\(\{\}, prev, \{ initiative: initiativeFromBucket\(value\) \}\)\)/);
  assert.match(block, /updateDim\(path, value\);/);
  assert.match(block, /customInstructionOpRef\.current = value; scheduleCustomInstructionsCombine\(\); return;/);
  assert.match(block, /customInstructionDeltaRef\.current = value;\s*\n\s*scheduleCustomInstructionsCombine\(\);/);
  assert.match(block, /submit: \(\) => submitRef\.current\(\)/);
  assert.match(aiAssistantSrc, /const submitRef = React\.useRef\(save\);\s*\n\s*submitRef\.current = save;/);
});

// combineCustomInstructions() is a pure, dependency-free helper (no JSX/React) inside
// aiAssistantView.jsx - navrya-src has no DOM harness for the surrounding component, but this one
// function can genuinely run: extracted by source range and evaluated in a vm sandbox, exactly the
// way tests/*.test.mjs already vm-sandbox the shared/*.js pure-logic modules.
function loadCombineCustomInstructions() {
  const start = aiAssistantSrc.indexOf('function combineCustomInstructions(base, op, delta) {');
  assert.ok(start > -1, 'could not find combineCustomInstructions() in aiAssistantView.jsx');
  const end = aiAssistantSrc.indexOf('\n  function scheduleCustomInstructionsCombine', start);
  assert.ok(end > start, 'could not find the end of combineCustomInstructions()');
  const source = aiAssistantSrc.slice(start, end);
  const sandbox = {};
  vm.runInNewContext(source + '\nthis.combineCustomInstructions = combineCustomInstructions;', sandbox);
  return sandbox.combineCustomInstructions;
}

test('combineCustomInstructions(): append preserves the existing text and adds the new text after it - never silently drops prior wording', () => {
  const combine = loadCombineCustomInstructions();
  assert.equal(combine('Always give me the number first.', 'append', 'Call me Ali.'), 'Always give me the number first.\nCall me Ali.');
  assert.equal(combine('', 'append', 'Call me Ali.'), 'Call me Ali.');
});

test("combineCustomInstructions(): remove deletes only the given phrase, leaves the rest untouched, and is a no-op when the phrase is not found verbatim", () => {
  const combine = loadCombineCustomInstructions();
  assert.equal(combine('Call me Ali.\nBe concise.', 'remove', 'Call me Ali.'), 'Be concise.');
  assert.equal(combine('Be concise.', 'remove', 'not present anywhere'), 'Be concise.');
});

test('combineCustomInstructions(): reset always clears to empty regardless of any delta text', () => {
  const combine = loadCombineCustomInstructions();
  assert.equal(combine('Be concise.', 'reset', null), '');
  assert.equal(combine('Be concise.', 'reset', 'ignored'), '');
});

test("combineCustomInstructions(): replace (explicit, or the default when op is omitted) overwrites the whole text, and the 'none' sentinel still clears it - the exact pre-existing behavior, unchanged for a model that never sends customInstructionOp", () => {
  const combine = loadCombineCustomInstructions();
  assert.equal(combine('Old text.', 'replace', 'New text.'), 'New text.');
  assert.equal(combine('Old text.', undefined, 'New text.'), 'New text.', 'omitted op defaults to replace, matching pre-existing behavior');
  assert.equal(combine('Old text.', 'replace', 'none'), '');
});

test('customInstructionOp/customInstructions combine deterministically via combineCustomInstructions() - append/remove/reset/replace, order-independent within one turn via a settled-ref macrotask, never asking the model to resend existing wording', () => {
  assert.match(aiAssistantSrc, /function combineCustomInstructions\(base, op, delta\) \{/);
  assert.match(aiAssistantSrc, /if \(op === 'reset'\) return '';/);
  assert.match(aiAssistantSrc, /if \(op === 'remove'\) \{/);
  assert.match(aiAssistantSrc, /if \(op === 'append'\) \{/);
  assert.match(aiAssistantSrc, /function scheduleCustomInstructionsCombine\(\) \{/);
  assert.match(aiAssistantSrc, /setCustomText\(\(prevText\) => combineCustomInstructions\(prevText, op \|\| 'replace', delta\)\);/);
});

// The same shape as account.create/account-manual-form (a real, required gate field) - and
// account-manual-form itself never needs either chat-dock-core.js exclusion, because a genuine
// required field lets ai-workflow-engine.js's own applyKnownFields() actually schedule a submit
// and clear the workflow normally once `save` resolves true. settings-alerts/settings-companion/
// settings-voice-gender need the exclusion ONLY because they are entityAlreadyPersisted with an
// EMPTY requiredFields, so their workflow can never transition past 'collecting' on its own.
// settings-persona must stay out of both lists for the identical reason account-manual-form is -
// adding it would be treating a self-completing gated workflow as if it were the never-completing
// entityAlreadyPersisted kind, which it structurally is not.
test('settings-persona is deliberately absent from both chat-dock-core.js exclusion lists, the same as account-manual-form - its own required `save` field lets the workflow complete and clear normally, so no special-case exclusion is needed', () => {
  assert.doesNotMatch(chatDockCoreSrc, /settings-persona/);
});
