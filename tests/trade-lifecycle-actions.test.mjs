import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Journey F, F22/F23/F24: trade.open, trade.cancel, trade.close, trade.emotion.log. Same
// convention as tests/session-actions.test.mjs and tests/strategy-actions.test.mjs -
// navrya-src has no DOM test harness in this project, the real proof is real-browser
// verification (see the F22-F24 final report). These are static-source regression guards.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const closePositionSrc = await readFile(path.join(root, 'navrya-src', 'closePositionModal.jsx'), 'utf8');
const logEmotionSrc = await readFile(path.join(root, 'navrya-src', 'logEmotionModal.jsx'), 'utf8');
const contextEngineSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-context-engine.js'), 'utf8');
const chatDockCoreSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'chat-dock-core.js'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: [\\s\\S]*?\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

test('trade.open is a lifecycle transition of an existing Hunting Trade, distinct from trade.calculator (new Trade creation) - explicitly cross-referenced in both descriptions', () => {
  const openBlock = actionBlock('trade.open');
  assert.match(openBlock, /domain: 'trades'/);
  assert.match(openBlock, /a lifecycle status transition/i);
  assert.match(openBlock, /never the creation of a new Trade/i);
  const calcBlock = actionBlock('trade.calculator');
  // Journey H1: trade.calculator is no longer the ONLY action that creates a Trade -
  // trade.wizard (the real, separate multi-step "Log a trade" flow) does too. Both descriptions
  // now explicitly cross-reference each other so the model never treats them as interchangeable.
  assert.match(calcBlock, /the DEFAULT action for creating a Trade/);
  assert.match(calcBlock, /trade\.wizard/);
  assert.match(calcBlock, /trade\.open, a lifecycle status change/);
});

test('trade.wizard opens the real, separate "Log a trade" wizard, is deliberately distinct from trade.calculator (narrow, logging-specific aliases only), and submits through the now-real trade-wizard process', () => {
  const wizardBlock = actionBlock('trade.wizard');
  assert.match(wizardBlock, /domain: 'trades'/);
  assert.match(wizardBlock, /window\.TradeJournalNavryaTradeLog\.open\(/);
  assert.match(wizardBlock, /registry\.query\('trade-wizard'\)\.open/);
  assert.match(wizardBlock, /TradeJournalAIProcessRegistry\.submit\('trade-wizard'\)/);
  assert.match(wizardBlock, /requiredFields: \['direction', 'instrument'\]/);
  for (const alias of wizardBlock.match(/aliases: \[([^\]]*)\]/)[1].split(',')) {
    assert.match(alias, /log|wizard/i, `trade.wizard's own aliases must stay narrowly logging/wizard-specific: ${alias}`);
  }
});

test('trade.open only available for a resolved, real Hunting Trade, and its open() calls the exact same updateStatus() the real "Mark Open" button uses', () => {
  const block = actionBlock('trade.open');
  assert.match(block, /available: \(context\) => \{ var t = resolveActiveTrade\(context\); return !!\(t && t\.status === 'hunting'\); \}/);
  assert.match(block, /window\.TradeJournalTradeStore\.updateStatus\(trade\.id, 'open'\)/);
  assert.doesNotMatch(block, /entityAlreadyPersisted/);
});

test('trade.cancel is CONSEQUENTIAL: requiredFields includes a confirm field, and the actual cancellation only happens in submit() once confirm is explicitly true - open() never mutates', () => {
  const block = actionBlock('trade.cancel');
  assert.match(block, /riskLevel: 'high'/);
  assert.match(block, /requiredFields: \['confirm'\]/);
  assert.match(block, /Never infer confirm from the original cancel request alone/);
  const openFn = /open: \(context\) => new Promise\(\(resolve\) => \{([\s\S]*?)\}\),\s*submit:/.exec(block);
  assert.ok(openFn, 'could not find trade.cancel\'s open()');
  assert.doesNotMatch(openFn[1], /updateStatus/, 'open() must never mutate - only submit(), gated on confirm, may');
  assert.match(block, /if \(known\.confirm !== true && known\.confirm !== 'true'\) return undefined;/);
  assert.match(block, /window\.TradeJournalTradeStore\.updateStatus\(id, 'cancelled'\)/);
});

// Voice Mode hardening, section 19 (audit finding F8): trade.cancel used to re-resolve
// resolveActiveTrade(context) fresh at submit() time with no comparison against which Trade the
// confirmation was actually FOR - unlike trade.delete's own pendingTradeDeleteId (F37 section 6).
// Switched-target scenario: open Trade A, "cancel this trade" -> "are you sure?" -> navigate to
// Trade B before answering -> "yes" must never cancel B for a confirmation only ever given for A.
test('trade.cancel now pins the exact target Trade at open() time (pendingTradeCancelId) and refuses at submit() if the currently-active Trade has since changed - the same switched-target protection trade.delete already has', () => {
  const block = actionBlock('trade.cancel');
  assert.match(block, /pendingTradeCancelId = trade\.id;/, 'open() must pin the exact Trade id being confirmed');
  const submitFn = /submit: \(known, context\) => \{([\s\S]*?)\},\s*resultContext:/.exec(block);
  assert.ok(submitFn, 'could not find trade.cancel\'s submit()');
  const body = submitFn[1];
  assert.match(body, /var id = pendingTradeCancelId;/);
  assert.match(body, /pendingTradeCancelId = null;/);
  assert.match(body, /if \(!id\) return undefined;/);
  assert.match(body, /var currentActive = resolveActiveTrade\(context\);/);
  assert.match(body, /if \(currentActive && currentActive\.id !== id\) return undefined;/, 'must refuse when the active Trade has changed since this confirmation was staged, never blindly act on whatever is active now');
});

test('pendingTradeCancelId is declared locally to the trade-lifecycle block (its own `var`, matching pendingTradeDeleteId\'s own per-block redeclaration convention in the F37 destructive-actions block) - not a cross-block reference into a variable declared ~1700 lines later', () => {
  const src = characterAppSrc; // full source, not just the trade.cancel action block
  const declIdx = src.indexOf('var pendingTradeCancelId = null;');
  const cancelActionIdx = src.indexOf("id: 'trade.cancel'");
  assert.ok(declIdx > -1 && cancelActionIdx > -1 && declIdx < cancelActionIdx, 'the declaration must appear before trade.cancel\'s own registration, in the same block');
});

test('trade.close requires only exitPrice, is deliberately NOT entityAlreadyPersisted (auto-completes once known, unlike Pattern/Strategy), and its submit() drives the real trade-close-position registration', () => {
  const block = actionBlock('trade.close');
  assert.match(block, /requiredFields: \['exitPrice'\], optionalFields: \[\]/);
  assert.doesNotMatch(block, /entityAlreadyPersisted/);
  assert.match(block, /available: \(context\) => \{ var t = resolveActiveTrade\(context\); return !!\(t && t\.status === 'open'\); \}/);
  assert.match(block, /registry\.query\('trade-close-position'\)\.open/);
  assert.match(block, /TradeJournalAIProcessRegistry\.submit\('trade-close-position'\)/);
  assert.match(block, /NAVRYA itself computes P&L.*never the model/);
});

// Context-aware conversational operation layer, section 6: intentionally updated from the old
// note-only assertion - note, stressLevel, dominantEmotions, and per-emotion emotionIntensity.*/
// emotionTags.* are now real, AI-fillable fields, matching the real form's own controls exactly.
// The "never invent a score" safety guarantee is retained, narrowed to the three fields that still
// have NO real form control at all (focusQuality/planCommitment/wouldTakeIfNotForced - submit()
// itself still sends the same fixed 5/5/null it always did).
test('trade.emotion.log exposes note, stressLevel, dominantEmotions, and per-emotion emotionIntensity.*/emotionTags.* as real, AI-fillable fields, but never focusQuality/planCommitment/wouldTakeIfNotForced - those have no real form control at all', () => {
  const block = actionBlock('trade.emotion.log');
  assert.match(block, /optionalFields: \['note', 'stressLevel', 'dominantEmotions', 'pinnedTradeId'\]\.concat\(/);
  assert.doesNotMatch(block, /entityAlreadyPersisted/);
  assert.doesNotMatch(block, /'focusQuality'|'planCommitment'|'wouldTakeIfNotForced'/);
  assert.match(block, /registry\.query\('trade-emotion-log'\)\.open/);
});

test('trade.emotion.log\'s normalizeField rejects an out-of-range stressLevel/emotionIntensity or a non-canonical emotion id outright (F50) - never clamps, never guesses', () => {
  const block = actionBlock('trade.emotion.log');
  assert.match(block, /return \(Number\.isFinite\(stressN\) && stressN >= 1 && stressN <= 10\) \? Math\.round\(stressN\) : null;/);
  assert.match(block, /var valid = wanted\.filter\(function \(v\) \{ return emotions\.indexOf\(v\) > -1; \}\)\.slice\(0, 3\);/);
});

test('trade.emotion.log\'s pinnedTradeId is internal-only - never asked of the user, filtered out of the model-facing schema in chat-dock-core.js\'s own AI_INTERNAL_ONLY_FIELDS', () => {
  const block = actionBlock('trade.emotion.log');
  assert.match(block, /pinnedTradeId is internal-only \(never asked of the user\)/);
  assert.match(chatDockCoreSrc, /pinnedTradeId: true/);
});

test('trade.emotion.log\'s open() prefers an internal pinnedTradeId over resolveActiveTrade(context) - lets the section 5 clarification flow target a real open Trade with no visible Trade Details form', () => {
  const block = actionBlock('trade.emotion.log');
  assert.match(block, /var pinnedField = \(initialFields \|\| \[\]\)\.filter\(function \(f\) \{ return f && f\.path === 'pinnedTradeId'; \}\)\[0\];/);
  assert.match(block, /var trade = \(pinnedField && pinnedField\.value && window\.TradeJournalTradeStore\) \? window\.TradeJournalTradeStore\.find\(pinnedField\.value\) : resolveActiveTrade\(context\);/);
});

test('chat-dock-core.js filters internal-only fields (pinnedTradeId included) out of BOTH activeProcess.allowlist and every discovered action\'s own requiredFields/optionalFields before either ever reaches the model - not just the activeProcess half', () => {
  assert.match(chatDockCoreSrc, /availableActions = catalog\.map\(function \(action\) \{/);
  assert.match(chatDockCoreSrc, /requiredFields: modelFacingAllowlist\(action\.requiredFields\), optionalFields: modelFacingAllowlist\(action\.optionalFields\)/);
});

// --- logEmotionModal.jsx: the real form-side registration ---

test('the real trade-emotion-log registration allowlist includes note/stressLevel/dominantEmotions plus one emotionIntensity.<id>/emotionTags.<id> pair per real canonical emotion id - built from the SAME emotionList the manual UI itself renders, never a hand-typed, driftable copy', () => {
  assert.match(logEmotionSrc, /allowlist: \['note', 'stressLevel', 'dominantEmotions'\]\.concat\(EMOTION_FIELD_PATHS\)/);
  assert.match(logEmotionSrc, /const EMOTION_FIELD_PATHS = emotionList\.reduce\(function \(acc, emoId\) \{ return acc\.concat\(\['emotionIntensity\.' \+ emoId, 'emotionTags\.' \+ emoId\]\); \}, \[\]\);/);
});

test('the real registration\'s applyValue() rejects an out-of-range stressLevel (never clamps) and treats the form\'s own default of 5 as ONLY ever set by a genuine applyValue() call - the mount-time useState(5) itself is never treated as a user-supplied answer', () => {
  assert.match(logEmotionSrc, /if \(Number\.isFinite\(stressN\) && stressN >= 1 && stressN <= 10\) setStress\(Math\.round\(stressN\)\);/);
  assert.match(logEmotionSrc, /const \[stress, setStress\] = React\.useState\(\(seed && seed\.stressLevel\) \|\| 5\);/);
});

test('dominantEmotions and emotionIntensity.<id> never copy the overall stress value into a per-emotion intensity - each keeps its own independent real default (5) until its OWN applyValue() call sets it', () => {
  const dominantBlock = /if \(path === 'dominantEmotions'\) \{([\s\S]*?)\n {8}\}/.exec(logEmotionSrc);
  assert.ok(dominantBlock, 'could not find dominantEmotions applyValue branch');
  assert.doesNotMatch(dominantBlock[1], /stress\b/, 'dominantEmotions must never read the stress slider\'s own value');
  assert.match(dominantBlock[1], /\{ emotion: emoId, intensity: 5, tags: \[\], draft: '' \}/, 'a newly AI-selected emotion gets the same real default entry the manual toggle() already creates, never the current stress level');
});

test('emotionTags.<id> appends and de-duplicates, mirroring InvalidationTags\' own real semantics, never a bare replace of reasons already recorded', () => {
  const tagsBlock = /var tagsMatch = \/\^emotionTags\\\.\(\.\+\)\$\/\.exec\(path\);\s*\n\s*if \(tagsMatch\) \{([\s\S]*?)\n {8}\}/.exec(logEmotionSrc);
  assert.ok(tagsBlock, 'could not find emotionTags applyValue branch');
  assert.match(tagsBlock[1], /var newTags = currentTags\.concat\(additions\.filter\(function \(a\) \{ return currentTags\.indexOf\(a\) === -1; \}\)\);/);
});

test('logEmotionModal.jsx imports the shared AiMagicFill/useAiFieldFill architecture and wires it onto every new Voice-fillable control (stressLevel, dominantEmotions, and per-emotion intensity/tags) - not a second, parallel animation mechanism', () => {
  assert.match(logEmotionSrc, /import \{ AiMagicFill \} from '\.\.\/public\/pages\/shared\/navrya\/components\/feedback\/AiMagicFill\.jsx';/);
  assert.match(logEmotionSrc, /import \{ useAiFieldFill \} from '\.\.\/public\/pages\/shared\/navrya\/hooks\/useAiFieldFill\.js';/);
  assert.match(logEmotionSrc, /const stressFilled = useAiFieldFill\('trade-emotion-log', 'stressLevel'\);/);
  assert.match(logEmotionSrc, /const emotionsFilled = useAiFieldFill\('trade-emotion-log', 'dominantEmotions'\);/);
  assert.match(logEmotionSrc, /const intensityFilled = useAiFieldFill\('trade-emotion-log', 'emotionIntensity\.' \+ id\);/);
  assert.match(logEmotionSrc, /const tagsFilled = useAiFieldFill\('trade-emotion-log', 'emotionTags\.' \+ id\);/);
  assert.match(logEmotionSrc, /<AiMagicFill active=\{stressFilled\}>/);
  assert.match(logEmotionSrc, /<AiMagicFill active=\{emotionsFilled\}>/);
  assert.match(logEmotionSrc, /<AiMagicFill active=\{intensityFilled\}>/);
  assert.match(logEmotionSrc, /<AiMagicFill active=\{tagsFilled\}>/);
});

test('submit() is completely unchanged by this slice - focusQuality/planCommitment/wouldTakeIfNotForced still send the exact same fixed 5/5/null they always did, never fabricated from anything the AI applied', () => {
  assert.match(logEmotionSrc, /focusQuality: 5, planCommitment: 5,\s*\n\s*wouldTakeIfNotForced: null/);
});

test('trade.open/trade.cancel/trade.close/trade.emotion.log all resolve the active Trade the same way - only context.activeEntities.tradeId, never a guess among multiple visible Trades', () => {
  for (const id of ['trade.open', 'trade.cancel', 'trade.close', 'trade.emotion.log']) {
    const block = actionBlock(id);
    assert.match(block, /resolveActiveTrade\(context\)/, `${id} must resolve via the shared resolveActiveTrade() helper`);
  }
  const helperMatch = /function resolveActiveTrade\(context\) \{([\s\S]*?)\n      \}/.exec(characterAppSrc);
  assert.ok(helperMatch, 'could not find resolveActiveTrade()');
  assert.match(helperMatch[1], /context\.activeEntities\.tradeId/);
});

test('trade.open/trade.cancel/trade.close/trade.emotion.log never touch API keys, auth tokens, or admin credentials', () => {
  for (const id of ['trade.open', 'trade.cancel', 'trade.close', 'trade.emotion.log']) {
    assert.doesNotMatch(actionBlock(id), /apiKey|authToken|credential|admin/i);
  }
});

test('closePositionModal.jsx exposes submit() to the real trade-close-position registration through a ref kept current every render, avoiding the exact stale-closure bug already fixed for ScenarioEditor - submit() itself returns the saved Trade so resultContext receives it', () => {
  assert.match(closePositionSrc, /const submitRef = React\.useRef\(null\);/);
  assert.match(closePositionSrc, /submit: \(\) => submitRef\.current\(\)/);
  assert.match(closePositionSrc, /submitRef\.current = submit;/);
  assert.match(closePositionSrc, /return saved;\s*\}\s*submitRef\.current = submit;/);
});

test('logEmotionModal.jsx exposes submit() the same ref-guarded way, and its own submit() returns the saved Trade (or undefined when the Mental Health safety check blocks it)', () => {
  assert.match(logEmotionSrc, /const submitRef = React\.useRef\(null\);/);
  assert.match(logEmotionSrc, /submit: \(\) => submitRef\.current\(\)/);
  assert.match(logEmotionSrc, /submitRef\.current = submit;/);
  assert.match(logEmotionSrc, /mhSafety\.checkText\(note\)\.flagged/);
});

test('ai-context-engine.js resolves activeEntities.tradeId from the real trade-details-{id} registration, mirroring activeScenarioId()/activeEntryId(), with no active-Session requirement (a Trade can be viewed with no Session workspace open)', () => {
  assert.match(contextEngineSrc, /function activeTradeId\(\)/);
  assert.match(contextEngineSrc, /active\.id\.indexOf\('trade-details-'\) !== 0\) return null;/);
  assert.match(contextEngineSrc, /tradeId: activeTradeId\(\)/);
  // Unlike scenarioId/entryId, tradeId must NOT be gated behind `sessionId ?`.
  const snapshotBody = /function snapshot\(\) \{([\s\S]*?)\n  \}/.exec(contextEngineSrc);
  assert.ok(snapshotBody);
  assert.doesNotMatch(snapshotBody[1], /sessionId \? activeTradeId/);
});
