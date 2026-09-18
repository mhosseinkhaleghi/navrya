import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Commander Character Interaction Policy: end-to-end integration through the REAL
// ai-i18n.js/character-interaction-policy.js, mirroring
// tests/hunter-character-client-integration.test.mjs's own conventions.
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
const FRESH_CTX = { blocked: false, openTradeId: null, reflectionDueTradeId: null, openSessionId: null, hasSeenWalkthrough: false };

test('Commander gets its own real Persian voice-opening line for an active session', async () => {
  const orchestrator = await loadOrchestrator('commander', ACTIVE_SESSION_CTX);
  const opening = orchestrator.voiceOpening();
  assert.equal(opening.kind, 'activeSession');
  assert.equal(opening.text, 'قربان، سشن هنوز بازه. ادامه‌ش بدیم؟');
});

test('Commander\'s returning-neutral greeting picks its own line', async () => {
  const orchestrator = await loadOrchestrator('commander', RETURNING_CTX);
  const opening = orchestrator.voiceOpening();
  assert.equal(opening.kind, 'returningNeutral');
  assert.equal(opening.text, 'قربان، وضعیت آرومه. امروز روی چی کار کنیم؟');
});

test('Commander\'s fresh-welcome greeting picks its own line, distinct from Hunter\'s', async () => {
  const commander = await loadOrchestrator('commander', FRESH_CTX);
  const hunter = await loadOrchestrator('hunter', FRESH_CTX);
  const commanderOpening = commander.voiceOpening();
  const hunterOpening = hunter.voiceOpening();
  assert.equal(commanderOpening.text, 'خوش اومدید، قربان. وضعیت آماده‌ست. از کجا شروع کنیم؟');
  assert.notEqual(commanderOpening.text, hunterOpening.text);
});

test('Hunter is unaffected by the Commander gate - still gets its own line, not Commander\'s', async () => {
  const orchestrator = await loadOrchestrator('hunter', ACTIVE_SESSION_CTX);
  const opening = orchestrator.voiceOpening();
  assert.equal(opening.text, 'خب رفیق، سشن هنوز بازه. ادامه‌ش بدیم؟');
});

test('Sage (no Character Interaction Policy) keeps the exact original, generic Persian greeting', async () => {
  const orchestrator = await loadOrchestrator('sage', ACTIVE_SESSION_CTX);
  const opening = orchestrator.voiceOpening();
  assert.equal(opening.text, 'سلام. سشن بازت هنوز فعاله. می‌خوای از همون‌جا ادامه بدیم؟');
});
