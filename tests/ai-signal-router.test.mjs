import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

const clone = value => JSON.parse(JSON.stringify(value));

async function routerSandbox() {
  const sandbox = { window: {} };
  vm.runInNewContext(await source('ai-signal-router.js'), sandbox, { filename: 'ai-signal-router.js' });
  return sandbox.window.TradeJournalAISignalRouter;
}

// ---- explicit trading anger (the required core scenario's own phrasing) ----

test('classify() recognizes explicit trading anger with an active trade workflow and routes to TRADE_LOG', async () => {
  const router = await routerSandbox();
  const result = router.classify({ text: "I've had two losses, I'm angry, and I want to increase risk to 4%.", context: { hasActiveTradeWorkflow: true } });
  assert.equal(result.relevant, true);
  assert.equal(result.destination, 'TRADE_LOG');
  const emotion = result.secondarySignals.find((s) => s.type === 'emotion');
  assert.equal(emotion.value, 'anger');
  assert.equal(emotion.status, 'USER_STATED');
  const loss = result.secondarySignals.find((s) => s.type === 'behavioral_context');
  assert.equal(loss.value, 'recent_losses');
  assert.equal(loss.countHint, 2);
  assert.equal(loss.requiresVerification, true);
});

// ---- UI frustration (section 24's false-positive test) ----

test('classify() treats "this modal is making me angry" as UI frustration, never trading psychology, even with an active trade', async () => {
  const router = await routerSandbox();
  const result = router.classify({ text: 'This modal is making me angry.', context: { hasActiveTradeWorkflow: true } });
  assert.equal(result.relevant, false);
  assert.deepEqual(clone(result.secondarySignals), []);
  assert.equal(result.destination, 'CHAT_ONLY');
});

// ---- loss-related anger without an explicit active workflow, but with trading vocabulary ----

test('classify() recognizes loss-related anger as trading-relevant even with no active workflow, via explicit trading vocabulary', async () => {
  const router = await routerSandbox();
  const result = router.classify({ text: 'I lost my last two trades and I am furious about my risk management.', context: {} });
  assert.equal(result.relevant, true);
});

test('classify() does NOT treat a bare emotion word with no trading context and no active workflow as relevant', async () => {
  const router = await routerSandbox();
  const result = router.classify({ text: 'I am so angry today.', context: {} });
  assert.equal(result.relevant, false, 'no trading vocabulary, no loss reference, no active workflow - nothing ties this to trading');
});

// ---- active Session routing (no active trade workflow) ----

test('classify() routes to SESSION_CONTEXT when a Session is active but no trade workflow is', async () => {
  const router = await routerSandbox();
  const result = router.classify({ text: 'I am really anxious before New York opens.', context: { activeSessionId: 'session-1' } });
  assert.equal(result.relevant, true);
  assert.equal(result.destination, 'SESSION_CONTEXT');
});

// ---- generic chat / no context at all ----

test('classify() returns CHAT_ONLY/not relevant for a message with no emotion at all', async () => {
  const router = await routerSandbox();
  const result = router.classify({ text: 'What does this pattern mean?', context: { hasActiveTradeWorkflow: true } });
  assert.equal(result.relevant, false);
  assert.equal(result.destination, 'CHAT_ONLY');
});

test('classify() handles empty/missing text safely', async () => {
  const router = await routerSandbox();
  assert.deepEqual(clone(router.classify({ text: '', context: {} })), { relevant: false, secondarySignals: [], destination: 'CHAT_ONLY' });
  assert.deepEqual(clone(router.classify({})), { relevant: false, secondarySignals: [], destination: 'CHAT_ONLY' });
});

// ---- never fabricates numeric scores or emotion detail beyond what was said ----

test('classify() never invents stressLevel/focusQuality/planCommitment or any numeric score', async () => {
  const router = await routerSandbox();
  const result = router.classify({ text: "I've had two losses, I'm angry, and I want to increase risk to 4%.", context: { hasActiveTradeWorkflow: true } });
  const json = JSON.stringify(result);
  assert.ok(json.indexOf('stressLevel') === -1);
  assert.ok(json.indexOf('focusQuality') === -1);
  assert.ok(json.indexOf('planCommitment') === -1);
});

// ---- stress emotion, without a loss reference ----

test('classify() recognizes stress as its own emotion type, distinct from anger', async () => {
  const router = await routerSandbox();
  const result = router.classify({ text: 'I feel really stressed about my open position.', context: { hasActiveTradeWorkflow: true } });
  const emotion = result.secondarySignals.find((s) => s.type === 'emotion');
  assert.equal(emotion.value, 'stress');
});

// ---- Persian cases required by the spec ----

test('classify() (Persian) recognizes "دو تا ضرر کردم و خیلی عصبانی‌ام، ریسک رو بکن ۴ درصد." as trading-relevant anger + loss reference', async () => {
  const router = await routerSandbox();
  const result = router.classify({ text: 'دو تا ضرر کردم و خیلی عصبانی‌ام، ریسک رو بکن ۴ درصد.', context: {} });
  assert.equal(result.relevant, true);
  const emotion = result.secondarySignals.find((s) => s.type === 'emotion');
  assert.equal(emotion.value, 'anger');
  const loss = result.secondarySignals.find((s) => s.type === 'behavioral_context');
  assert.equal(loss.value, 'recent_losses');
  assert.equal(loss.countHint, 2);
});

test('classify() (Persian) treats "این پنجره اعصابمو خورد کرده." as UI frustration, not trading psychology', async () => {
  const router = await routerSandbox();
  const result = router.classify({ text: 'این پنجره اعصابمو خورد کرده.', context: { hasActiveTradeWorkflow: true } });
  assert.equal(result.relevant, false);
  assert.equal(result.destination, 'CHAT_ONLY');
});
