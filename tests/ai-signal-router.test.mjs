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

// Context-aware conversational operation layer, section 5: a real sandbox exposing
// window.TradeJournalAIUserMemory.getRelevantTrades() - the exact same public, privacy-scoped
// adapter ai-signal-router.js itself calls (never window.TradeJournalTradeStore directly - "do not
// read private store internals from the router"). `openTrades` is the full real Trade Store
// content the fake store would return for status:'open'; `recentCount` truncation is honored so
// the truncated-flag tests below exercise the real behavior, not a shortcut.
async function routerSandboxWithOpenTrades(openTrades) {
  const sandbox = { window: {} };
  sandbox.window.TradeJournalAIUserMemory = {
    getRelevantTrades(query, ctx) {
      const filtered = (ctx && ctx.status) ? openTrades.filter((t) => t.status === ctx.status) : openTrades.slice();
      return filtered.slice(0, (ctx && ctx.recentCount) || 5);
    }
  };
  vm.runInNewContext(await source('ai-signal-router.js'), sandbox, { filename: 'ai-signal-router.js' });
  return sandbox.window.TradeJournalAISignalRouter;
}
function trade(id, instrument) { return { id, status: 'open', direction: 'long', instrument, entryPrice: 100, stopLoss: 90, riskPercent: 1, outcome: null, linkedStrategyId: null }; }

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

// ---- Context-aware conversational operation layer, section 5: contextual trade-emotion routing ----

test('classify() with ZERO open trades and no other trading evidence stays CHAT_ONLY/not relevant, exactly as before this feature - a real store existing changes nothing when it has nothing open', async () => {
  const router = await routerSandboxWithOpenTrades([]);
  const result = router.classify({ text: 'I feel stressed.', context: {} });
  assert.equal(result.relevant, false);
  assert.equal(result.destination, 'CHAT_ONLY');
});

test('classify() with exactly ONE open trade and a bare "I feel stressed" (no trading vocabulary at all) routes to TRADE_EMOTION_CANDIDATE with that one trade as the sole candidate, unresolved (a consent question, never an assumption)', async () => {
  const router = await routerSandboxWithOpenTrades([trade('t1', 'XAUUSD')]);
  const result = router.classify({ text: 'I feel stressed.', context: {} });
  assert.equal(result.relevant, true);
  assert.equal(result.destination, 'TRADE_EMOTION_CANDIDATE');
  assert.equal(result.resolvedTradeId, null, 'the trade was not named - this must ask, never assume');
  assert.equal(result.openTradeCandidates.length, 1);
  assert.equal(result.openTradeCandidates[0].id, 't1');
  assert.equal(result.openTradeCandidatesTruncated, false);
});

test('classify() with MULTIPLE open trades and no explicit mention returns every candidate for the caller to ask "which trade" - never guesses one', async () => {
  const router = await routerSandboxWithOpenTrades([trade('t1', 'XAUUSD'), trade('t2', 'EURUSD')]);
  const result = router.classify({ text: 'I feel stressed.', context: {} });
  assert.equal(result.relevant, true);
  assert.equal(result.destination, 'TRADE_EMOTION_CANDIDATE');
  assert.equal(result.resolvedTradeId, null);
  assert.equal(result.openTradeCandidates.length, 2);
});

test('classify() resolves the exact trade directly (resolvedTradeId set, no clarification needed) when the message explicitly names that trade\'s own real instrument - "skip redundant questions when the entity and requested operation are unambiguous"', async () => {
  const router = await routerSandboxWithOpenTrades([trade('t1', 'XAUUSD'), trade('t2', 'EURUSD')]);
  const result = router.classify({ text: 'Log stress seven and fear of hitting my stop for my open XAUUSD trade.', context: {} });
  assert.equal(result.relevant, true);
  assert.equal(result.destination, 'TRADE_EMOTION_CANDIDATE');
  assert.equal(result.resolvedTradeId, 't1');
});

test('classify() never resolves an instrument mention shared by two open trades - ambiguous stays unresolved, never guessed (F53)', async () => {
  const router = await routerSandboxWithOpenTrades([trade('t1', 'XAUUSD'), trade('t2', 'XAUUSD')]);
  const result = router.classify({ text: 'Stressed about my XAUUSD trade.', context: {} });
  assert.equal(result.resolvedTradeId, null);
  assert.equal(result.openTradeCandidates.length, 2);
});

test('classify() flags openTradeCandidatesTruncated when the store returns exactly the request limit - a one-item truncated result is not proof only one trade exists', async () => {
  const many = Array.from({ length: 6 }, (_, i) => trade('t' + i, 'XAUUSD'));
  const router = await routerSandboxWithOpenTrades(many);
  const result = router.classify({ text: 'I feel stressed.', context: {} });
  assert.equal(result.openTradeCandidatesTruncated, true);
});

test('classify() never invents a candidate when window.TradeJournalAIUserMemory is unavailable - fails safe to the pre-existing CHAT_ONLY behavior, never throws', async () => {
  const router = await routerSandbox(); // no TradeJournalAIUserMemory in this sandbox at all
  const result = router.classify({ text: 'I feel stressed.', context: {} });
  assert.equal(result.relevant, false);
  assert.equal(result.destination, 'CHAT_ONLY');
});

test('classify() still routes an active trade workflow to TRADE_LOG even when open trades also exist - the in-flight workflow takes precedence, unchanged', async () => {
  const router = await routerSandboxWithOpenTrades([trade('t1', 'XAUUSD')]);
  const result = router.classify({ text: 'I feel stressed.', context: { hasActiveTradeWorkflow: true } });
  assert.equal(result.destination, 'TRADE_LOG');
  assert.equal(result.openTradeCandidates, undefined, 'TRADE_LOG results never carry the candidate-list shape');
});

test('classify() still routes an active Session to SESSION_CONTEXT even when open trades also exist - the active Session takes precedence, unchanged', async () => {
  const router = await routerSandboxWithOpenTrades([trade('t1', 'XAUUSD')]);
  const result = router.classify({ text: 'I feel stressed.', context: { activeSessionId: 'session-1' } });
  assert.equal(result.destination, 'SESSION_CONTEXT');
});

test('classify() preserves the UI-frustration false-positive rule even with a real open trade available - "this app is stressing me out" must never become a trading emotion log', async () => {
  const router = await routerSandboxWithOpenTrades([trade('t1', 'XAUUSD')]);
  const result = router.classify({ text: 'This app is stressing me out.', context: {} });
  assert.equal(result.relevant, false);
  assert.equal(result.destination, 'CHAT_ONLY');
});
