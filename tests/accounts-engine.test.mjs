import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Pure deterministic risk/compliance engine for the Accounts domain - no server, no store, no
// window globals other than what it exports itself. Loaded the same way tests/trades-sync.test.mjs
// loads trade-store.js: run the real source file in a fresh sandbox and exercise the exported API.
const root = process.cwd();
async function loadEngine() {
  const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'accounts-engine.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: 'accounts-engine.js' });
  return sandbox.window.TradeJournalAccountsEngine;
}

function propAccount(overrides) {
  return Object.assign({
    id: 'acc-1', kind: 'prop', startingBalance: 100000, currency: 'USD',
    rules: { kind: 'prop', profitTargetPercent: 10, dailyLossLimitPercent: 5, maxDrawdownPercent: 10, drawdownType: 'static', minTradingDays: 5, consistencyCapPercent: 40, maxOpenPositions: null, maxRiskPerTradePercent: null, maxLotSize: null }
  }, overrides || {});
}
function personalAccount(overrides) {
  return Object.assign({
    id: 'acc-2', kind: 'personal', startingBalance: 15000, currency: 'USD',
    rules: { kind: 'personal', dailyLossCap: 400, maxRiskPerTradePercent: 1, monthlyGoalPercent: 8, maxOpenPositions: 3, hardFloor: null }
  }, overrides || {});
}
function closedTrade(accountId, pnl, closedAt, extra) {
  return Object.assign({ id: 'trade-' + Math.random().toString(36).slice(2), accountId, status: 'closed', pnl, closedAt, updatedAt: closedAt }, extra || {});
}

test('a brand-new account with no trades reports honest nulls, never a fake $0', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const metrics = engine.computeMetrics(account, []);
  assert.equal(metrics.hasAnyTrades, false);
  assert.equal(metrics.totalPL, null, 'no closed trades means totalPL is unknown, not 0');
  assert.equal(metrics.todayPL, null);
  assert.equal(metrics.equity, 100000, 'equity is real - it is exactly the starting balance until a trade closes');
  assert.equal(metrics.dailyLossUsed, 0, 'zero loss used today is a real fact (no trades happened), not a fabricated figure');
});

test('equity/totalPL/todayPL are derived only from this account’s own closed trades', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const today = new Date().toISOString();
  const trades = [
    closedTrade('acc-1', 500, today),
    closedTrade('acc-1', -200, today),
    closedTrade('other-account', 99999, today), // must never leak into this account's numbers
    { id: 'open-1', accountId: 'acc-1', status: 'open', riskAmount: 300 }
  ];
  const metrics = engine.computeMetrics(account, trades);
  assert.equal(metrics.totalPL, 300);
  assert.equal(metrics.todayPL, 300);
  assert.equal(metrics.equity, 100300);
  assert.equal(metrics.openRisk, 300);
  assert.equal(metrics.openPositionsCount, 1);
});

test('an open trade with no recorded riskAmount makes openRisk unknown (null), not an undercount', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const trades = [{ id: 'open-1', accountId: 'acc-1', status: 'hunting' }];
  const metrics = engine.computeMetrics(account, trades);
  assert.equal(metrics.openRisk, null);
  assert.equal(metrics.openRiskUnknownCount, 1);
});

test('static drawdown floor is fixed to the starting balance; trailing follows the real peak', async () => {
  const engine = await loadEngine();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const trades = [closedTrade('acc-1', 5000, yesterday), closedTrade('acc-1', -1000, new Date().toISOString())];

  const staticAcct = propAccount({ rules: Object.assign(propAccount().rules, { drawdownType: 'static', maxDrawdownPercent: 10 }) });
  const staticMetrics = engine.computeMetrics(staticAcct, trades);
  assert.equal(staticMetrics.drawdownFloor, 90000, 'static floor = 10% below the 100,000 starting balance, unaffected by the peak');

  const trailingAcct = propAccount({ rules: Object.assign(propAccount().rules, { drawdownType: 'trailing', maxDrawdownPercent: 10 }) });
  const trailingMetrics = engine.computeMetrics(trailingAcct, trades);
  assert.equal(trailingMetrics.peakEquity, 105000);
  assert.equal(trailingMetrics.drawdownFloor, 94500, 'trailing floor = 10% below the real peak of 105,000, not the starting balance');
});

test('evaluateRules omits a rule row entirely when that rule is not configured on the account', async () => {
  const engine = await loadEngine();
  const account = propAccount({ rules: { kind: 'prop', profitTargetPercent: null, dailyLossLimitPercent: null, maxDrawdownPercent: null, drawdownType: 'static', minTradingDays: null, consistencyCapPercent: null, maxOpenPositions: null, maxRiskPerTradePercent: null, maxLotSize: null } });
  const metrics = engine.computeMetrics(account, []);
  const result = engine.evaluateRules(account, metrics);
  assert.equal(result.groups.length, 0, 'no rules configured means no groups - never a fabricated rule row');
  assert.equal(result.hasAnyRuleConfigured, false);
});

test('daily loss limit state crosses safe -> watch -> danger -> violated at the documented 50/80/100% thresholds', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const today = new Date().toISOString();
  function dailyState(lossAmount) {
    const trades = lossAmount ? [closedTrade('acc-1', -lossAmount, today)] : [];
    const metrics = engine.computeMetrics(account, trades);
    const result = engine.evaluateRules(account, metrics);
    const lossLimits = result.groups.find((g) => g.title === 'Loss limits');
    return lossLimits.items.find((i) => i.name === 'Daily loss limit').state;
  }
  // 5% of 100,000 = 5,000 allowance.
  assert.equal(dailyState(0), 'safe');
  assert.equal(dailyState(2000), 'safe', '40% used stays safe');
  assert.equal(dailyState(2600), 'watch', '52% used crosses into watch');
  assert.equal(dailyState(4200), 'danger', '84% used crosses into danger');
  assert.equal(dailyState(5000), 'violated', '100% used is violated');
  assert.equal(dailyState(6000), 'violated', 'exceeding the limit is still violated, not some higher/undefined state');
});

test('a personal account’s consistency-style rules use its own field names, never the prop shape', async () => {
  const engine = await loadEngine();
  const account = personalAccount();
  const metrics = engine.computeMetrics(account, []);
  const result = engine.evaluateRules(account, metrics);
  const names = result.groups.reduce((acc, g) => acc.concat(g.items.map((i) => i.name)), []);
  assert.ok(names.includes('Daily loss cap'));
  assert.ok(names.includes('Maximum risk per trade'));
  assert.ok(!names.includes('Profit target'), 'a personal account must never show a prop-only rule');
});

test('pretrade verdict is "unknown" (never a false green "ok") when the account has no risk rule configured at all', async () => {
  const engine = await loadEngine();
  const account = propAccount({ rules: { kind: 'prop', profitTargetPercent: null, dailyLossLimitPercent: null, maxDrawdownPercent: null, drawdownType: 'static', minTradingDays: null, consistencyCapPercent: null, maxOpenPositions: null, maxRiskPerTradePercent: null, maxLotSize: null } });
  const metrics = engine.computeMetrics(account, []);
  const verdict = engine.evaluatePretrade(account, metrics, { riskAmount: 500 });
  assert.equal(verdict.tone, 'unknown');
});

test('pretrade verdict is "bad" once the risk amount would meet or exceed what is left of the daily allowance', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const metrics = engine.computeMetrics(account, []); // 5,000 allowance, nothing used yet
  const justUnder = engine.evaluatePretrade(account, metrics, { riskAmount: 4999 });
  assert.equal(justUnder.tone, 'warn', '99.98% of the allowance is still a warn, not yet a hard block');
  const exact = engine.evaluatePretrade(account, metrics, { riskAmount: 5000 });
  assert.equal(exact.tone, 'bad', 'risk equal to the full remaining allowance is a hard breach');
  const over = engine.evaluatePretrade(account, metrics, { riskAmount: 6000 });
  assert.equal(over.tone, 'bad');
});

test('pretrade verdict warns once a trade would use 60% or more of what is left today, even with allowance to spare', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const metrics = engine.computeMetrics(account, []); // 5,000 allowance
  const under = engine.evaluatePretrade(account, metrics, { riskAmount: 2900 }); // 58%
  assert.equal(under.tone, 'ok');
  const at = engine.evaluatePretrade(account, metrics, { riskAmount: 3000 }); // 60%
  assert.equal(at.tone, 'warn');
});

test('survives/toFloor are real floor-divisions of real numbers, and null (not 0 or Infinity) when an input is missing', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const metrics = engine.computeMetrics(account, []);
  const verdict = engine.evaluatePretrade(account, metrics, { riskAmount: 1000 });
  assert.equal(verdict.survives, 5, '5,000 allowance / 1,000 risk = 5 trades');
  assert.equal(verdict.toFloor, 10, '10,000 distance to the 90,000 floor / 1,000 risk = 10 trades');

  const noRisk = engine.evaluatePretrade(account, metrics, {});
  assert.equal(noRisk.survives, null);
  assert.equal(noRisk.toFloor, null);
  assert.equal(noRisk.tone, 'unknown');
});

test('the runway bar’s three segments always sum to 100 and reflect real used/trade/left amounts', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const today = new Date().toISOString();
  const metrics = engine.computeMetrics(account, [closedTrade('acc-1', -1000, today)]); // 1,000 of 5,000 used
  const verdict = engine.evaluatePretrade(account, metrics, { riskAmount: 1500 });
  assert.ok(Math.abs(verdict.runway.usedPct - 20) < 0.01);
  assert.ok(Math.abs(verdict.runway.tradePct - 30) < 0.01);
  assert.ok(Math.abs(verdict.runway.usedPct + verdict.runway.tradePct + verdict.runway.leftPct - 100) < 0.01);
});

// ---- Defect #4: timezone/reset-hour-aware trading-day boundaries, injected `now`, honest
// insufficient-data when a rule needs floating P/L NAVRYA cannot verify ----

test('computeMetrics is deterministic given an injected `now` - never reads the real clock when opts.now is supplied', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const fixedNow = '2026-03-15T12:00:00.000Z';
  const m1 = engine.computeMetrics(account, [], { now: fixedNow });
  const m2 = engine.computeMetrics(account, [], { now: fixedNow });
  assert.equal(m1.todayKey, m2.todayKey);
  assert.equal(m1.todayKey, '2026-03-15');
});

test('a trade one minute before vs. one minute after a configured reset hour lands in different trading days, in the account\'s own timezone', async () => {
  const engine = await loadEngine();
  // America/New_York, reset at 17:00 local (a common real prop-firm/forex daily reset time).
  // A trading day is keyed by the calendar date on which it STARTS at the reset hour - so the
  // 16:59 instant (reset hasn't fired yet on Jul 10) still belongs to the session that started
  // the day before, and 17:01 (reset just fired) begins the new Jul-10 session.
  const account = propAccount({ rules: Object.assign(propAccount().rules, { dailyResetTimezone: 'America/New_York', dailyResetHour: 17 }) });
  // Use 2026-07-10 (EDT, UTC-4) to avoid any DST-transition ambiguity in this test.
  const beforeReset = '2026-07-10T20:59:00.000Z'; // 16:59 EDT
  const afterReset = '2026-07-10T21:01:00.000Z'; // 17:01 EDT
  const keyBefore = engine.tradingDayKey(beforeReset, 'America/New_York', 17);
  const keyAfter = engine.tradingDayKey(afterReset, 'America/New_York', 17);
  assert.equal(keyBefore, '2026-07-09', 'before the 17:00 reset fires, the instant still belongs to the trading day that started the prior evening');
  assert.equal(keyAfter, '2026-07-10', 'once the 17:00 reset fires, a new trading day keyed to the current calendar date begins');
  assert.notEqual(keyBefore, keyAfter);
});

test('the same instant buckets into a different trading day under a different configured timezone (never a silent UTC assumption)', async () => {
  const engine = await loadEngine();
  const instant = '2026-06-01T23:30:00.000Z'; // 23:30 UTC
  const utcKey = engine.tradingDayKey(instant, 'UTC', 0);
  const tokyoKey = engine.tradingDayKey(instant, 'Asia/Tokyo', 0); // 08:30 JST the next calendar day
  assert.equal(utcKey, '2026-06-01');
  assert.equal(tokyoKey, '2026-06-02');
});

test('an invalid/unsupported IANA timezone string falls back to UTC rather than throwing', async () => {
  const engine = await loadEngine();
  const key = engine.tradingDayKey('2026-01-01T00:00:00.000Z', 'Not/ARealZone', 0);
  assert.equal(key, engine.tradingDayKey('2026-01-01T00:00:00.000Z', 'UTC', 0));
});

test('an account with no dailyResetTimezone/dailyResetHour configured defaults to UTC/midnight - identical to the pre-timezone-aware behavior', async () => {
  const engine = await loadEngine();
  const account = propAccount({ rules: Object.assign(propAccount().rules, { dailyResetTimezone: null, dailyResetHour: null }) });
  const metrics = engine.computeMetrics(account, [], { now: '2026-05-05T10:00:00.000Z' });
  assert.equal(metrics.todayKey, '2026-05-05');
});

test('a daily-loss rule configured to include floating P/L reports insufficient data (never a false SAFE) while a real position is open', async () => {
  const engine = await loadEngine();
  const account = propAccount({ rules: Object.assign(propAccount().rules, { dailyLossBasis: 'realized_and_open' }) });
  const now = '2026-04-01T12:00:00.000Z';
  const openTrade = { id: 'open-1', accountId: 'acc-1', status: 'open', createdAt: now, riskAmount: 100 };
  const metrics = engine.computeMetrics(account, [openTrade], { now });
  assert.equal(metrics.dailyLossBasisInsufficient, true);
  const rules = engine.evaluateRules(account, metrics);
  const lossLimits = rules.groups.find((g) => g.title === 'Loss limits');
  const dailyRow = lossLimits.items.find((i) => i.name === 'Daily loss limit');
  assert.equal(dailyRow.state, 'insufficient', 'must never fall back to a computed SAFE percentage when the configured basis cannot be verified');
  const verdict = engine.evaluatePretrade(account, metrics, { riskAmount: 500 });
  assert.equal(verdict.tone, 'unknown');
  assert.equal(verdict.basisInsufficient, true);
});

test('the same realized_and_open basis reports a real, verifiable number once there is NO open position - it is not permanently stuck as insufficient', async () => {
  const engine = await loadEngine();
  const account = propAccount({ rules: Object.assign(propAccount().rules, { dailyLossBasis: 'realized_and_open' }) });
  const metrics = engine.computeMetrics(account, [], { now: '2026-04-01T12:00:00.000Z' }); // no trades at all, nothing open
  assert.equal(metrics.dailyLossBasisInsufficient, false);
  const rules = engine.evaluateRules(account, metrics);
  const dailyRow = rules.groups.find((g) => g.title === 'Loss limits').items.find((i) => i.name === 'Daily loss limit');
  assert.equal(dailyRow.state, 'safe');
});

// ---- dailyPLSeries: real trading-day aggregation, never one point per trade ----

test('dailyPLSeries aggregates multiple same-trading-day trades into one entry, not one entry per trade', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const day = new Date().toISOString().slice(0, 10) + 'T10:00:00.000Z';
  const trades = [closedTrade('acc-1', 100, day), closedTrade('acc-1', -40, day)];
  const series = engine.dailyPLSeries(account, trades);
  assert.equal(series.length, 1);
  assert.equal(series[0].pl, 60);
  assert.equal(series[0].tradesCount, 2);
});

test('dailyPLSeries marks a trading day with real open exposure, even with zero closed trades that day', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const now = new Date().toISOString();
  const trades = [{ id: 'open-x', accountId: 'acc-1', status: 'hunting', createdAt: now }];
  const series = engine.dailyPLSeries(account, trades);
  assert.equal(series.length, 1);
  assert.equal(series[0].hasOpenExposure, true);
  assert.equal(series[0].tradesCount, 0);
});

// ---- computeDiscipline: never derived from profitability ----

function emotionEntry(overrides) { return Object.assign({ planCommitment: 8, focusQuality: 8, stressLevel: 3 }, overrides || {}); }

test('computeDiscipline returns insufficient data (null score) below the minimum real emotion-log sample size', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const trades = [{ id: 't1', accountId: 'acc-1', status: 'closed', pnl: 100, emotionLog: [emotionEntry(), emotionEntry()] }];
  const result = engine.computeDiscipline(account, trades);
  assert.equal(result.score, null);
  assert.equal(result.sampleSize, 2);
});

test('computeDiscipline scores two accounts with IDENTICAL profitability differently based on real behaviour evidence alone', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const goodBehaviour = [
    { id: 'g1', accountId: 'acc-1', status: 'closed', pnl: 500, riskPercent: 0.5, emotionLog: [emotionEntry(), emotionEntry(), emotionEntry()] },
    { id: 'g2', accountId: 'acc-1', status: 'closed', pnl: 500, riskPercent: 0.5, emotionLog: [emotionEntry(), emotionEntry(), emotionEntry()] }
  ];
  const badBehaviour = [
    { id: 'b1', accountId: 'acc-1', status: 'closed', pnl: 500, riskPercent: 5, emotionLog: [emotionEntry({ stressLevel: 9, planCommitment: 2, focusQuality: 2 }), emotionEntry({ stressLevel: 9, planCommitment: 2, focusQuality: 2 }), emotionEntry({ stressLevel: 9, planCommitment: 2, focusQuality: 2 })] },
    { id: 'b2', accountId: 'acc-1', status: 'closed', pnl: 500, riskPercent: 5, emotionLog: [emotionEntry({ stressLevel: 9, planCommitment: 2, focusQuality: 2 }), emotionEntry({ stressLevel: 9, planCommitment: 2, focusQuality: 2 })] }
  ];
  const propWithRiskRule = propAccount({ rules: Object.assign(propAccount().rules, { maxRiskPerTradePercent: 1 }) });
  const goodScore = engine.computeDiscipline(propWithRiskRule, goodBehaviour);
  const badScore = engine.computeDiscipline(propWithRiskRule, badBehaviour);
  assert.ok(goodScore.score > badScore.score, 'identical P&L (+500 each) must not produce identical or inverted discipline scores - only the real behaviour evidence differs here');
});

test('computeDiscipline never reads trade.pnl at all - a losing trade with excellent behaviour scores exactly the same as an identical winning trade', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const emo = [emotionEntry(), emotionEntry(), emotionEntry(), emotionEntry(), emotionEntry()];
  const winning = [{ id: 'w1', accountId: 'acc-1', status: 'closed', pnl: 1000, emotionLog: emo }];
  const losing = [{ id: 'l1', accountId: 'acc-1', status: 'closed', pnl: -1000, emotionLog: emo }];
  const winScore = engine.computeDiscipline(account, winning);
  const loseScore = engine.computeDiscipline(account, losing);
  assert.equal(winScore.score, loseScore.score);
});

test('the "if it wins" panel stays empty until a real reward amount is supplied - no assumed 2R', async () => {
  const engine = await loadEngine();
  const account = propAccount();
  const metrics = engine.computeMetrics(account, []);
  const withoutReward = engine.evaluatePretrade(account, metrics, { riskAmount: 500 });
  assert.equal(withoutReward.winRows.length, 0);
  const withReward = engine.evaluatePretrade(account, metrics, { riskAmount: 500, rewardAmount: 1000 });
  assert.ok(withReward.winRows.length > 0);
});
