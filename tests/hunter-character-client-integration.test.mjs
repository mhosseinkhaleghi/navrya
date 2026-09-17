import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Character Interaction Policy (Hunter gate): end-to-end integration through the REAL
// ai-i18n.js/character-interaction-policy.js, proving the Hunter-specific wording is actually
// selected at runtime - not just that character-interaction-policy.js resolves a gear in
// isolation (see tests/character-interaction-policy.test.mjs), and not the pre-existing mocked-i18n
// unit tests in tests/ai-companion-orchestrator.test.mjs (whose `{t:key=>key}` stub cannot exercise
// this at all, by design - see that file's own buildSandbox()).
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

async function loadOrchestrator(character, voiceOpeningContext) {
  const document = { documentElement: { lang: 'fa' } };
  const sandbox = {
    window: {}, document, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    Date
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage,
    addEventListener() {}, dispatchEvent() {},
    TradeJournalPanelLayer: character ? { character } : undefined,
    TradeJournalAIJourneyEngine: {
      nextBestStep: () => null, dedupeKeyFor: (id) => 'journey:' + id, executeStep: () => {},
      voiceOpeningContext: () => voiceOpeningContext
    },
    TradeJournalAICompanionProfile: { hasSeenWalkthrough: () => true, initiativePreference: () => 'normal', setWalkthroughSeen() {}, dismissStep() {}, skipOptionalStep() {}, setCurrentGoal() {} }
  });
  for (const file of ['ai-i18n.js', 'character-interaction-policy.js']) {
    vm.runInNewContext(await source(file), sandbox, { filename: file });
  }
  vm.runInNewContext(await source('ai-companion-orchestrator.js'), sandbox, { filename: 'ai-companion-orchestrator.js' });
  return sandbox.window.TradeJournalAICompanionOrchestrator;
}

const ACTIVE_SESSION_CTX = { blocked: false, openTradeId: null, reflectionDueTradeId: null, openSessionId: 's1', hasSeenWalkthrough: true };
const RETURNING_CTX = { blocked: false, openTradeId: null, reflectionDueTradeId: null, openSessionId: null, hasSeenWalkthrough: true };

test('Hunter (the app default character) gets the real Hunter-specific Persian voice-opening line, not the generic one', async () => {
  const orchestrator = await loadOrchestrator(undefined, ACTIVE_SESSION_CTX);
  const opening = orchestrator.voiceOpening();
  assert.equal(opening.kind, 'activeSession');
  assert.equal(opening.text, 'خب رفیق، سشن هنوز بازه. ادامه‌ش بدیم؟');
});

test('an explicitly non-Hunter character keeps the exact original, generic Persian greeting - unaffected by this gate', async () => {
  const orchestrator = await loadOrchestrator('commander', ACTIVE_SESSION_CTX);
  const opening = orchestrator.voiceOpening();
  assert.equal(opening.kind, 'activeSession');
  assert.equal(opening.text, 'سلام. سشن بازت هنوز فعاله. می‌خوای از همون‌جا ادامه بدیم؟');
});

test('Hunter\'s returning-neutral greeting also picks its own Hunter-specific line', async () => {
  const orchestrator = await loadOrchestrator('hunter', RETURNING_CTX);
  const opening = orchestrator.voiceOpening();
  assert.equal(opening.kind, 'returningNeutral');
  assert.equal(opening.text, 'خب رفیق، امروز دنبال چی‌ای؟');
});

test('a non-Hunter character still gets its own original generic greeting even when character-interaction-policy.js is not loaded on the page (best-effort, additive only - the inline fallback reads window.TradeJournalPanelLayer.character directly)', async () => {
  const document = { documentElement: { lang: 'fa' } };
  const sandbox = {
    window: {}, document, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    Date
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, addEventListener() {}, dispatchEvent() {},
    TradeJournalPanelLayer: { character: 'sage' },
    TradeJournalAIJourneyEngine: { nextBestStep: () => null, dedupeKeyFor: (id) => 'journey:' + id, executeStep: () => {}, voiceOpeningContext: () => ACTIVE_SESSION_CTX },
    TradeJournalAICompanionProfile: { hasSeenWalkthrough: () => true, initiativePreference: () => 'normal', setWalkthroughSeen() {}, dismissStep() {}, skipOptionalStep() {}, setCurrentGoal() {} }
  });
  // Deliberately NOT loading character-interaction-policy.js this time.
  vm.runInNewContext(await source('ai-i18n.js'), sandbox, { filename: 'ai-i18n.js' });
  vm.runInNewContext(await source('ai-companion-orchestrator.js'), sandbox, { filename: 'ai-companion-orchestrator.js' });
  const opening = sandbox.window.TradeJournalAICompanionOrchestrator.voiceOpening();
  assert.equal(opening.text, 'سلام. سشن بازت هنوز فعاله. می‌خوای از همون‌جا ادامه بدیم؟');
});

test('Hunter (the default when nothing selects a character) still gets its own variant even when character-interaction-policy.js is not loaded - the inline fallback defaults to hunter too, matching currentCharacter.js', async () => {
  const document = { documentElement: { lang: 'fa' } };
  const sandbox = {
    window: {}, document, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    Date
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, addEventListener() {}, dispatchEvent() {},
    TradeJournalAIJourneyEngine: { nextBestStep: () => null, dedupeKeyFor: (id) => 'journey:' + id, executeStep: () => {}, voiceOpeningContext: () => ACTIVE_SESSION_CTX },
    TradeJournalAICompanionProfile: { hasSeenWalkthrough: () => true, initiativePreference: () => 'normal', setWalkthroughSeen() {}, dismissStep() {}, skipOptionalStep() {}, setCurrentGoal() {} }
  });
  // Deliberately NOT loading character-interaction-policy.js this time, and no TradeJournalPanelLayer.
  vm.runInNewContext(await source('ai-i18n.js'), sandbox, { filename: 'ai-i18n.js' });
  vm.runInNewContext(await source('ai-companion-orchestrator.js'), sandbox, { filename: 'ai-companion-orchestrator.js' });
  const opening = sandbox.window.TradeJournalAICompanionOrchestrator.voiceOpening();
  assert.equal(opening.text, 'خب رفیق، سشن هنوز بازه. ادامه‌ش بدیم؟');
});
