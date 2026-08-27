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
  assert.match(block, /window\.TradeJournalTradeStore\.updateStatus\(trade\.id, 'cancelled'\)/);
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

test('trade.emotion.log\'s only AI-fillable field is note, matching the real form\'s own allowlist exactly - never invents stress/focus/commitment scores', () => {
  const block = actionBlock('trade.emotion.log');
  assert.match(block, /requiredFields: \[\], optionalFields: \['note'\]/);
  assert.doesNotMatch(block, /entityAlreadyPersisted/);
  assert.match(block, /never invent or infer a numeric value/);
  assert.match(block, /registry\.query\('trade-emotion-log'\)\.open/);
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
