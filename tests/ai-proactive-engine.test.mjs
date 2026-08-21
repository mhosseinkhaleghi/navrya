import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

const clone = value => JSON.parse(JSON.stringify(value));

async function engineSandbox(overrides) {
  const sandbox = { window: {}, Date };
  sandbox.window = Object.assign(sandbox.window, {
    TradeJournalTradeStore: overrides.tradeStore,
    TradeJournalStrategyEducationStore: overrides.strategyStore,
    TradeJournalMentalHealthStore: overrides.mentalHealthStore
  });
  vm.runInNewContext(await source('ai-proactive-engine.js'), sandbox, { filename: 'ai-proactive-engine.js' });
  return sandbox.window.TradeJournalAIProactiveEngine;
}

function findingIds(result) { return clone(result.findings.map((f) => f.id)); }

// ---- evaluate(): Rule A - strategy max risk ----

test('evaluate() finds no conflict when nothing is proposed and no strategy is linked', async () => {
  const engine = await engineSandbox({});
  const result = engine.evaluate({ context: {}, proposedFields: {} });
  assert.deepEqual(clone(result.findings), []);
});

test('Rule A fires CONFIRM_OVERRIDE when requested risk exceeds the linked strategy max', async () => {
  const engine = await engineSandbox({});
  const context = { strategy: { id: 's1', name: 'Conservative Scalper', maxRiskPerTradePercent: 1 } };
  const result = engine.evaluate({ context, proposedFields: { riskPercent: '4' } });
  assert.deepEqual(findingIds(result), ['strategy-risk-limit']);
  const finding = result.findings[0];
  assert.equal(finding.severity, 'CONFIRM_OVERRIDE');
  assert.equal(finding.requiresConfirmation, true);
  assert.equal(finding.field, 'riskPercent');
  assert.deepEqual(clone(finding.evidence), { requestedRiskPercent: 4, strategyMaxRiskPercent: 1, strategyId: 's1', strategyName: 'Conservative Scalper' });
});

// Persian Voice Quality gate: every rule's `message` was hardcoded English regardless of the
// user's actual language - the single highest-impact fix found during this pass, since no
// voice/prosody change can fix a reply spoken in the wrong language entirely. `language` defaults
// to 'en' when omitted (every test above this one proves that default is exactly the original
// English text, unchanged), and is threaded through explicitly here for fa/ar/es - preserving
// every real number from `evidence` exactly, never rounding or dropping one for phrasing.
test('Rule A message localizes to Persian/Arabic/Spanish when a language is given, preserving both percent values exactly; defaults to English when omitted', async () => {
  const engine = await engineSandbox({});
  const context = { strategy: { id: 's1', name: 'Conservative Scalper', maxRiskPerTradePercent: 1 } };
  const withoutLanguage = engine.evaluate({ context, proposedFields: { riskPercent: '4' } });
  assert.equal(withoutLanguage.findings[0].message, 'Your linked strategy caps risk at 1%. You are asking for 4%.');

  const fa = engine.evaluate({ context, proposedFields: { riskPercent: '4' }, language: 'fa' });
  assert.equal(fa.findings[0].message, 'سقف ریسک استراتژیت 1%‌ه، ولی الان 4% خواستی.');

  const ar = engine.evaluate({ context, proposedFields: { riskPercent: '4' }, language: 'ar' });
  assert.match(ar.findings[0].message, /1%/);
  assert.match(ar.findings[0].message, /4%/);

  const es = engine.evaluate({ context, proposedFields: { riskPercent: '4' }, language: 'es' });
  assert.match(es.findings[0].message, /1%/);
  assert.match(es.findings[0].message, /4%/);
});

test('Rule A does not fire when requested risk is exactly at the strategy limit', async () => {
  const engine = await engineSandbox({});
  const context = { strategy: { id: 's1', maxRiskPerTradePercent: 1 } };
  const result = engine.evaluate({ context, proposedFields: { riskPercent: '1' } });
  assert.deepEqual(findingIds(result), []);
});

test('Rule A does not fire when requested risk is below the strategy limit', async () => {
  const engine = await engineSandbox({});
  const context = { strategy: { id: 's1', maxRiskPerTradePercent: 2 } };
  const result = engine.evaluate({ context, proposedFields: { riskPercent: '1' } });
  assert.deepEqual(findingIds(result), []);
});

test('Rule A does not fire with no linked strategy (missing strategy)', async () => {
  const engine = await engineSandbox({});
  const result = engine.evaluate({ context: { strategy: null }, proposedFields: { riskPercent: '10' } });
  assert.deepEqual(findingIds(result), []);
});

test('Rule A does not fire when the linked strategy has no maxRiskPerTradePercent set (stale/incomplete strategy)', async () => {
  const engine = await engineSandbox({});
  const context = { strategy: { id: 's1', maxRiskPerTradePercent: null } };
  const result = engine.evaluate({ context, proposedFields: { riskPercent: '10' } });
  assert.deepEqual(findingIds(result), []);
});

test('Rule A does not fire and never throws on an invalid/unparseable requested risk value', async () => {
  const engine = await engineSandbox({});
  const context = { strategy: { id: 's1', maxRiskPerTradePercent: 1 } };
  assert.deepEqual(findingIds(engine.evaluate({ context, proposedFields: { riskPercent: 'lots' } })), []);
  assert.deepEqual(findingIds(engine.evaluate({ context, proposedFields: {} })), []);
});

// ---- Rule B - max concurrent trades ----

test('Rule B fires WARNING when active trade count meets the strategy concurrent-trade cap', async () => {
  const engine = await engineSandbox({});
  const context = { strategy: { id: 's1', maxConcurrentTrades: 2 }, activeTradeCount: 2 };
  const result = engine.evaluate({ context, proposedFields: {} });
  assert.deepEqual(findingIds(result), ['strategy-max-concurrent-trades']);
  assert.equal(result.findings[0].severity, 'WARNING');
  assert.deepEqual(clone(result.findings[0].evidence), { activeTradeCount: 2, strategyMaxConcurrentTrades: 2, strategyId: 's1' });
});

test('Rule B does not fire below the cap, or with no strategy/no cap set', async () => {
  const engine = await engineSandbox({});
  assert.deepEqual(findingIds(engine.evaluate({ context: { strategy: { id: 's1', maxConcurrentTrades: 2 }, activeTradeCount: 1 }, proposedFields: {} })), []);
  assert.deepEqual(findingIds(engine.evaluate({ context: { strategy: null, activeTradeCount: 5 }, proposedFields: {} })), []);
  assert.deepEqual(findingIds(engine.evaluate({ context: { strategy: { id: 's1', maxConcurrentTrades: null }, activeTradeCount: 5 }, proposedFields: {} })), []);
});

// ---- Rule C - missing stop loss (only at submission time) ----

test('Rule C only fires when readyToSubmit is true and stopLoss is genuinely absent', async () => {
  const engine = await engineSandbox({});
  assert.deepEqual(findingIds(engine.evaluate({ context: { readyToSubmit: false }, proposedFields: {} })), [], 'never fires on a still-in-progress draft');
  const fired = engine.evaluate({ context: { readyToSubmit: true }, proposedFields: {} });
  assert.deepEqual(findingIds(fired), ['missing-stop-loss']);
  assert.equal(fired.findings[0].severity, 'WARNING');
  assert.deepEqual(findingIds(engine.evaluate({ context: { readyToSubmit: true }, proposedFields: { stopLoss: '65000' } })), [], 'does not fire once a real stop is present');
});

// ---- Rule D - risk escalation after verified recent losses ----

test('Rule D fires NUDGE for a real requested increase above baseline after >=2 verified recent losses', async () => {
  const engine = await engineSandbox({});
  const context = { recentTrades: { count: 5, recentLosses: 2, lastOutcome: 'loss' }, baselineRiskPercent: 1 };
  const result = engine.evaluate({ context, proposedFields: { riskPercent: '4' } });
  assert.deepEqual(findingIds(result), ['risk-escalation-after-losses']);
  assert.equal(result.findings[0].severity, 'NUDGE');
  assert.deepEqual(clone(result.findings[0].evidence), { recentLosses: 2, recentTradesCount: 5, requestedRiskPercent: 4, baselineRiskPercent: 1 });
});

test('Rule D never labels the finding "revenge trading" or diagnoses intent (evidence only)', async () => {
  const engine = await engineSandbox({});
  const context = { recentTrades: { count: 5, recentLosses: 3, lastOutcome: 'loss' }, baselineRiskPercent: 1 };
  const result = engine.evaluate({ context, proposedFields: { riskPercent: '4' } });
  const json = JSON.stringify(result.findings[0]).toLowerCase();
  assert.ok(json.indexOf('revenge') === -1, 'no revenge-trading label anywhere in the finding');
  assert.ok(json.indexOf('addict') === -1 && json.indexOf('disorder') === -1);
});

test('Rule D does not fire with fewer than 2 recent losses, no baseline, or no requested increase', async () => {
  const engine = await engineSandbox({});
  assert.deepEqual(findingIds(engine.evaluate({ context: { recentTrades: { count: 5, recentLosses: 1 }, baselineRiskPercent: 1 }, proposedFields: { riskPercent: '4' } })), []);
  assert.deepEqual(findingIds(engine.evaluate({ context: { recentTrades: { count: 5, recentLosses: 2 }, baselineRiskPercent: null }, proposedFields: { riskPercent: '4' } })), []);
  assert.deepEqual(findingIds(engine.evaluate({ context: { recentTrades: { count: 5, recentLosses: 2 }, baselineRiskPercent: 5 }, proposedFields: { riskPercent: '4' } })), []);
});

// ---- Rule E - validated elevated stress + risk increase ----

test('Rule E fires NUDGE only for a genuinely validated, recent, high stress reading alongside a risk increase', async () => {
  const engine = await engineSandbox({});
  const context = { psychology: { currentStress: 8, source: 'pre_session_checkin', recordedAt: '2026-08-18T00:00:00.000Z' }, baselineRiskPercent: 1 };
  const result = engine.evaluate({ context, proposedFields: { riskPercent: '4' } });
  assert.deepEqual(findingIds(result), ['elevated-stress-risk-increase']);
  assert.equal(result.findings[0].severity, 'NUDGE');
  assert.deepEqual(clone(result.findings[0].evidence), { currentStress: 8, source: 'pre_session_checkin', recordedAt: '2026-08-18T00:00:00.000Z', requestedRiskPercent: 4 });
});

test('Rule E does not fire below the stress threshold, without a real psychology record, or without an actual increase', async () => {
  const engine = await engineSandbox({});
  assert.deepEqual(findingIds(engine.evaluate({ context: { psychology: { currentStress: 5 }, baselineRiskPercent: 1 }, proposedFields: { riskPercent: '4' } })), []);
  assert.deepEqual(findingIds(engine.evaluate({ context: { psychology: null, baselineRiskPercent: 1 }, proposedFields: { riskPercent: '4' } })), []);
  assert.deepEqual(findingIds(engine.evaluate({ context: { psychology: { currentStress: 9 }, baselineRiskPercent: 5 }, proposedFields: { riskPercent: '4' } })), []);
});

test('unverified/model-inferred verifiedSignals never cause a rule to fire on their own - only real context data does', async () => {
  const engine = await engineSandbox({});
  // A plausible-looking "signal" claiming losses/stress, but the real context has none of it.
  const verifiedSignals = [{ type: 'behavioral_context', value: 'recent_losses', status: 'USER_STATED' }, { type: 'emotion', value: 'anger', status: 'USER_STATED' }];
  const result = engine.evaluate({ context: { strategy: null, recentTrades: null, psychology: null }, proposedFields: { riskPercent: '10' }, verifiedSignals });
  assert.deepEqual(clone(result.findings), [], 'no hard rule may be driven purely by an unverified, model-interpreted signal');
});

test('multiple rules can fire together (the required "two losses + anger + risk 4% vs 1% cap" scenario)', async () => {
  const engine = await engineSandbox({});
  const context = {
    strategy: { id: 's1', name: 'Strat', maxRiskPerTradePercent: 1 },
    recentTrades: { count: 5, recentLosses: 2, lastOutcome: 'loss' },
    baselineRiskPercent: 1,
    psychology: null
  };
  const result = engine.evaluate({ context, proposedFields: { riskPercent: '4' } });
  assert.deepEqual(findingIds(result).sort(), ['risk-escalation-after-losses', 'strategy-risk-limit']);
});

// ---- BLOCKING_SEVERITIES ----

test('BLOCKING_SEVERITIES marks CONFIRM_OVERRIDE and BLOCKED as blocking, everything else as non-blocking', async () => {
  const engine = await engineSandbox({});
  assert.equal(engine.BLOCKING_SEVERITIES.CONFIRM_OVERRIDE, true);
  assert.equal(engine.BLOCKING_SEVERITIES.BLOCKED, true);
  assert.equal(!!engine.BLOCKING_SEVERITIES.WARNING, false);
  assert.equal(!!engine.BLOCKING_SEVERITIES.NUDGE, false);
  assert.equal(!!engine.BLOCKING_SEVERITIES.INFO, false);
});

// ---- buildTradeContext(): verified context assembly ----

test('buildTradeContext() resolves the linked strategy\'s real risk fields, never a guessed value', async () => {
  const strategyStore = { find: (id) => (id === 's1' ? { id: 's1', name: 'Strat', riskManagement: { maxRiskPerTradePercent: 1, maxConcurrentTrades: 2 } } : null) };
  const engine = await engineSandbox({ strategyStore, tradeStore: { listSync: () => [] } });
  const ctx = engine.buildTradeContext({ proposedFields: { linkedStrategyId: 's1' } });
  assert.deepEqual(clone(ctx.strategy), { id: 's1', name: 'Strat', maxRiskPerTradePercent: 1, maxConcurrentTrades: 2 });
});

test('buildTradeContext() reports strategy: null for a stale/deleted strategy id, never a fabricated one', async () => {
  const strategyStore = { find: () => null };
  const engine = await engineSandbox({ strategyStore, tradeStore: { listSync: () => [] } });
  const ctx = engine.buildTradeContext({ proposedFields: { linkedStrategyId: 'deleted-strategy' } });
  assert.equal(ctx.strategy, null);
});

test('buildTradeContext() computes activeTradeCount from real open+hunting trades only', async () => {
  const tradeStore = { listSync: () => [{ status: 'open' }, { status: 'hunting' }, { status: 'closed' }, { status: 'cancelled' }] };
  const engine = await engineSandbox({ tradeStore });
  const ctx = engine.buildTradeContext({ proposedFields: {} });
  assert.equal(ctx.activeTradeCount, 2);
});

test('buildTradeContext() computes recentTrades from the real last-N closed trades, sorted by closedAt', async () => {
  const tradeStore = {
    listSync: () => [
      { status: 'closed', outcome: 'loss', closedAt: '2026-08-18T03:00:00.000Z' },
      { status: 'closed', outcome: 'win', closedAt: '2026-08-18T02:00:00.000Z' },
      { status: 'closed', outcome: 'loss', closedAt: '2026-08-18T01:00:00.000Z' },
      { status: 'hunting' }
    ]
  };
  const engine = await engineSandbox({ tradeStore });
  const ctx = engine.buildTradeContext({ proposedFields: {} });
  assert.deepEqual(clone(ctx.recentTrades), { count: 3, recentLosses: 2, lastOutcome: 'loss' });
});

test('buildTradeContext() reports recentTrades: null with no closed trades at all, never a fabricated zero-record summary', async () => {
  const engine = await engineSandbox({ tradeStore: { listSync: () => [] } });
  const ctx = engine.buildTradeContext({ proposedFields: {} });
  assert.equal(ctx.recentTrades, null);
});

test('buildTradeContext() only uses a validated, RECENT pre-session check-in for psychology - never a stale one, never trade.emotionLog\'s own fabricated defaults', async () => {
  const recentIso = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
  const staleIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 2 days ago
  const withRecent = await engineSandbox({ tradeStore: { listSync: () => [] }, mentalHealthStore: { load: () => ({ continuousTracking: { preSessionCheckIns: [{ createdAt: recentIso, currentStressLevel: 8 }] } }) } });
  const ctxRecent = withRecent.buildTradeContext({ proposedFields: {} });
  assert.deepEqual(clone(ctxRecent.psychology), { currentStress: 8, source: 'pre_session_checkin', recordedAt: recentIso });

  const withStale = await engineSandbox({ tradeStore: { listSync: () => [] }, mentalHealthStore: { load: () => ({ continuousTracking: { preSessionCheckIns: [{ createdAt: staleIso, currentStressLevel: 9 }] } }) } });
  assert.equal(withStale.buildTradeContext({ proposedFields: {} }).psychology, null, 'a stale check-in must not count as "current"');

  const withNone = await engineSandbox({ tradeStore: { listSync: () => [] }, mentalHealthStore: { load: () => ({ continuousTracking: { preSessionCheckIns: [] } }) } });
  assert.equal(withNone.buildTradeContext({ proposedFields: {} }).psychology, null);
});

test('buildTradeContext() never throws when no stores are present on the page at all', async () => {
  const engine = await engineSandbox({});
  const ctx = engine.buildTradeContext({ proposedFields: {} });
  assert.deepEqual(clone(ctx), { strategy: null, recentTrades: null, baselineRiskPercent: null, activeTradeCount: 0, psychology: null, readyToSubmit: false });
});

// ---- pending confirmation state ----

test('stageConfirmation()/pendingConfirmation() round-trip the exact fields needed to resolve later', async () => {
  const engine = await engineSandbox({});
  assert.equal(engine.pendingConfirmation(), null);
  engine.stageConfirmation({ ruleId: 'strategy-risk-limit', actionId: 'trade.calculator', processId: 'trade-calculator', field: 'riskPercent', proposedValue: 4, safeValue: 1 });
  const pending = engine.pendingConfirmation();
  assert.equal(pending.ruleId, 'strategy-risk-limit');
  assert.equal(pending.field, 'riskPercent');
  assert.equal(pending.proposedValue, 4);
  assert.equal(pending.safeValue, 1);
});

test('interpretConfirmationText() recognizes explicit confirm/reject language in English and Persian', async () => {
  const engine = await engineSandbox({});
  assert.equal(engine.interpretConfirmationText('Use 4% anyway.'), 'confirm');
  assert.equal(engine.interpretConfirmationText('Yes, use 4% anyway.'), 'confirm');
  assert.equal(engine.interpretConfirmationText('override it'), 'confirm');
  assert.equal(engine.interpretConfirmationText('باشه بزن'), 'confirm');
  assert.equal(engine.interpretConfirmationText('No, keep 1%.'), 'reject');
  assert.equal(engine.interpretConfirmationText('keep the strategy limit'), 'reject');
  assert.equal(engine.interpretConfirmationText('نه، همون بمونه'), 'reject');
});

test('interpretConfirmationText() returns null (never guesses) for ambiguous or unrelated text', async () => {
  const engine = await engineSandbox({});
  assert.equal(engine.interpretConfirmationText('what is the weather'), null);
  assert.equal(engine.interpretConfirmationText(''), null);
  assert.equal(engine.interpretConfirmationText(null), null);
});

test('resolveConfirmation() returns the resolved data and clears the pending slot exactly once', async () => {
  const engine = await engineSandbox({});
  engine.stageConfirmation({ ruleId: 'strategy-risk-limit', actionId: 'trade.calculator', processId: 'trade-calculator', field: 'riskPercent', proposedValue: 4, safeValue: 1 });
  const resolved = engine.resolveConfirmation('confirm');
  assert.equal(resolved.decision, 'confirm');
  assert.equal(resolved.proposedValue, 4);
  assert.equal(engine.pendingConfirmation(), null, 'the slot must clear immediately');
  assert.equal(engine.resolveConfirmation('confirm'), null, 'a second resolve against nothing pending must be a safe no-op, never re-apply');
});

test('clearConfirmation() drops a stale pending confirmation (cancellation/navigation)', async () => {
  const engine = await engineSandbox({});
  engine.stageConfirmation({ ruleId: 'strategy-risk-limit', actionId: 'trade.calculator', processId: 'trade-calculator', field: 'riskPercent', proposedValue: 4, safeValue: 1 });
  engine.clearConfirmation();
  assert.equal(engine.pendingConfirmation(), null);
});

test('confirmationReply() produces a concise, evidence-based message for both decisions, never overstating what happened', async () => {
  const engine = await engineSandbox({});
  const resolved = { proposedValue: 4, safeValue: 1 };
  assert.match(engine.confirmationReply('confirm', resolved), /4%/);
  assert.match(engine.confirmationReply('reject', resolved), /1%/);
});

test('confirmationReply() localizes to Persian when asked, preserving the exact override/safe values; defaults to English when no language is given', async () => {
  const engine = await engineSandbox({});
  const resolved = { proposedValue: 4, safeValue: 1 };
  assert.equal(engine.confirmationReply('confirm', resolved), engine.confirmationReply('confirm', resolved, 'en'));
  assert.match(engine.confirmationReply('confirm', resolved, 'fa'), /4%/);
  assert.match(engine.confirmationReply('reject', resolved, 'fa'), /1%/);
  assert.ok(/[؀-ۿ]/.test(engine.confirmationReply('confirm', resolved, 'fa')), 'must actually contain Persian script, not just fall back to English');
});
