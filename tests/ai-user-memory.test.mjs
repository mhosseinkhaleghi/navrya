import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

const clone = value => JSON.parse(JSON.stringify(value));

async function memorySandbox(overrides) {
  const sandbox = { window: {}, Date };
  sandbox.window = Object.assign(sandbox.window, {
    TradeJournalStrategyEducationStore: (overrides || {}).strategyStore,
    TradeJournalPatternStore: (overrides || {}).patternStore,
    TradeJournalWorkspace: (overrides || {}).workspace,
    TradeJournalTradeStore: (overrides || {}).tradeStore,
    TradeJournalMentalHealthStore: (overrides || {}).mentalHealthStore,
    TradeJournalAIProactiveEngine: (overrides || {}).proactiveEngine,
    TradeJournalAccountsStore: (overrides || {}).accountsStore,
    TradeJournalAccountsEngine: (overrides || {}).accountsEngine,
    TradeJournalAICompanionProfile: (overrides || {}).companionProfile
  });
  vm.runInNewContext(await source('ai-user-memory.js'), sandbox, { filename: 'ai-user-memory.js' });
  return sandbox.window.TradeJournalAIUserMemory;
}

// ---- Strategy memory ----

test('getRelevantStrategies() resolves the active linked strategy by id, never a different one', async () => {
  const strategyStore = { listActive: () => [{ id: 's1', name: 'Conservative Scalper' }, { id: 's2', name: 'Aggressive Breakout' }] };
  const memory = await memorySandbox({ strategyStore });
  const result = memory.getRelevantStrategies(null, { activeStrategyId: 's1' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 's1');
});

// ---- Account memory ----

function fakeAccountsEngine() {
  return {
    computeMetrics: (account) => ({ equity: account.startingBalance, hasTradesToday: false, todayPL: null, hasClosedTrades: false, totalPL: null }),
    evaluateRules: () => ({ groups: [{ title: 'Loss limits', items: [{ name: 'Daily loss limit', state: 'safe', current: '0 used today' }] }] })
  };
}

test('getRelevantAccounts() resolves the active account by id, returning a compact rules/risk summary only', async () => {
  const accountsStore = { listActive: () => [{ id: 'a1', firm: 'Atlas Funding', kind: 'prop', currency: 'USD', status: 'active', startingBalance: 100000 }, { id: 'a2', firm: 'Vertex Capital', kind: 'prop', currency: 'USD', status: 'active', startingBalance: 50000 }] };
  const memory = await memorySandbox({ accountsStore, accountsEngine: fakeAccountsEngine() });
  const result = memory.getRelevantAccounts(null, { activeAccountId: 'a1' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'a1');
  assert.equal(result[0].equity, 100000);
  assert.ok(Array.isArray(result[0].rulesSummary));
  assert.equal(result[0].rulesSummary[0].name, 'Daily loss limit');
  assert.equal(Object.prototype.hasOwnProperty.call(result[0], 'numberMasked'), false, 'never expose the masked account number in AI context');
});

test('getRelevantAccounts() falls back to a firm-name match when no active id is given', async () => {
  const accountsStore = { listActive: () => [{ id: 'a1', firm: 'Atlas Funding', kind: 'prop', currency: 'USD', status: 'active', startingBalance: 100000 }] };
  const memory = await memorySandbox({ accountsStore, accountsEngine: fakeAccountsEngine() });
  assert.equal(memory.getRelevantAccounts('atlas funding', {}).length, 1);
});

test('getRelevantAccounts() never implicitly substitutes a different account - no match means empty, not a guess', async () => {
  const accountsStore = { listActive: () => [{ id: 'a1', firm: 'Atlas Funding', kind: 'prop', currency: 'USD', status: 'active', startingBalance: 100000 }] };
  const memory = await memorySandbox({ accountsStore, accountsEngine: fakeAccountsEngine() });
  assert.deepEqual(clone(memory.getRelevantAccounts('quorum funded', {})), []);
});

test('getRelevantAccounts() returns [] safely with no store present', async () => {
  const memory = await memorySandbox({});
  assert.deepEqual(clone(memory.getRelevantAccounts('atlas', { activeAccountId: 'a1' })), []);
});

test('getRelevantStrategies() falls back to a name match when no active id is given', async () => {
  const strategyStore = { listActive: () => [{ id: 's1', name: 'Conservative Scalper' }] };
  const memory = await memorySandbox({ strategyStore });
  assert.equal(memory.getRelevantStrategies('conservative scalper', {}).length, 1);
});

test('getRelevantStrategies() never implicitly substitutes a different strategy - no match means empty, not a guess', async () => {
  const strategyStore = { listActive: () => [{ id: 's1', name: 'Conservative Scalper' }] };
  const memory = await memorySandbox({ strategyStore });
  assert.deepEqual(clone(memory.getRelevantStrategies('completely unrelated name', {})), []);
});

test('getRelevantStrategies() returns [] safely with no store present', async () => {
  const memory = await memorySandbox({});
  assert.deepEqual(clone(memory.getRelevantStrategies('anything', {})), []);
});

// ---- Pattern memory ----

test('getRelevantPatterns() resolves by active id or name, never returns every pattern', async () => {
  const patternStore = { listForScenarios: () => [{ id: 'p1', name: 'Double bottom' }, { id: 'p2', name: 'Head and shoulders' }] };
  const memory = await memorySandbox({ patternStore });
  const byId = memory.getRelevantPatterns(null, { activePatternId: 'p1' });
  assert.equal(byId.length, 1);
  assert.equal(byId[0].id, 'p1');
  const byName = memory.getRelevantPatterns('head and shoulders', {});
  assert.equal(byName[0].id, 'p2');
});

// ---- Session memory ----

test('getRelevantSessions() resolves the active session only, when given an active id', async () => {
  const workspace = { list: () => [{ id: 'sess1', name: 'A', market: 'NewYork' }, { id: 'sess2', name: 'B', market: 'Tokyo' }], find: (id) => ({ id: 'sess1', name: 'A', market: 'NewYork' }) };
  const memory = await memorySandbox({ workspace });
  const result = memory.getRelevantSessions(null, { activeSessionId: 'sess1' });
  assert.deepEqual(clone(result.map((s) => s.id)), ['sess1']);
});

test('getRelevantSessions() filters by market and returns only the most recent N', async () => {
  const workspace = {
    list: () => [
      { id: 's1', market: 'NewYork', date: '2026-08-10' },
      { id: 's2', market: 'NewYork', date: '2026-08-17' },
      { id: 's3', market: 'Tokyo', date: '2026-08-16' }
    ]
  };
  const memory = await memorySandbox({ workspace });
  const result = memory.getRelevantSessions(null, { market: 'NewYork', recentCount: 1 });
  assert.deepEqual(clone(result.map((s) => s.id)), ['s2'], 'the most recent New York session only');
});

// ---- Trade memory ----

test('getRelevantTrades() returns real, structured trade summaries, never fabricated analytics', async () => {
  const tradeStore = { listSync: () => [{ id: 't1', status: 'closed', outcome: 'loss', updatedAt: '2026-08-17T00:00:00Z' }, { id: 't2', status: 'open', updatedAt: '2026-08-18T00:00:00Z' }] };
  const memory = await memorySandbox({ tradeStore });
  const closed = memory.getRelevantTrades(null, { status: 'closed' });
  assert.deepEqual(clone(closed.map((t) => t.id)), ['t1']);
});

test('getRelevantTrades() resolves a single active trade by id when given one', async () => {
  const tradeStore = { listSync: () => [{ id: 't1', status: 'open', updatedAt: '2026-08-18T00:00:00Z' }] };
  const memory = await memorySandbox({ tradeStore });
  const result = memory.getRelevantTrades(null, { activeTradeId: 't1' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 't1');
});

// ---- Psychology memory: privacy minimization ----

test('getRelevantPsychologyContext() returns only the minimal validated shape, reusing the Proactive Engine\'s own logic', async () => {
  const proactiveEngine = { buildTradeContext: () => ({ psychology: { currentStress: 8, source: 'pre_session_checkin', recordedAt: '2026-08-18T00:00:00Z' } }) };
  const memory = await memorySandbox({ proactiveEngine });
  const result = memory.getRelevantPsychologyContext();
  assert.deepEqual(clone(result), [{ currentStress: 8, source: 'pre_session_checkin', recordedAt: '2026-08-18T00:00:00Z' }]);
});

test('getRelevantPsychologyContext() never exposes the full profile - only the minimal fields, even from its own fallback path', async () => {
  const recentIso = new Date().toISOString();
  const mentalHealthStore = {
    load: () => ({
      continuousTracking: { preSessionCheckIns: [{ createdAt: recentIso, currentStressLevel: 7 }] },
      intake: { financialContext: { borrowedMoneyForTrading: true } }, // must never leak out
      redFlags: { active: [{ type: 'borrowed_money' }] } // must never leak out
    })
  };
  const memory = await memorySandbox({ mentalHealthStore });
  const result = memory.getRelevantPsychologyContext();
  assert.deepEqual(clone(result), [{ currentStress: 7, source: 'pre_session_checkin', recordedAt: recentIso }]);
  const json = JSON.stringify(result);
  assert.ok(json.indexOf('borrowed_money') === -1 && json.indexOf('redFlags') === -1, 'no unrelated sensitive field must ever be included');
});

test('getRelevantPsychologyContext() returns [] when there is no real, validated data, never a guessed default', async () => {
  const memory = await memorySandbox({ mentalHealthStore: { load: () => ({ continuousTracking: { preSessionCheckIns: [] } }) } });
  assert.deepEqual(clone(memory.getRelevantPsychologyContext()), []);
});

// ---- Session analysis memory (Voice/Chat form-interview workflow upgrade, natural-interaction
// pass): the confirmed missing grounding for a follow-up question about an analysis that was
// spoken/shown once and never repeated verbatim into the transcript ----

function sessionWithAnalysis(overrides) {
  const result = Object.assign({
    thesis: { headline: 'Price is coiling under resistance.', summary: 'Liquidity above needs to be swept first.' },
    stateMetrics: [{ label: 'Trend', value: 'Bullish', importance: 'high' }],
    scenarios: [{ role: 'primary', title: 'Breakout continuation', probability: 65, summary: 'Price breaks and retests.', trigger: 'Close above 4230', invalidation: 'Close below 4180' }],
    watchItems: ['4200 resistance'],
    unknowns: ['Unclear whether the news release already priced in.'],
    confidence: { level: 'medium', reasons: ['Mixed higher-timeframe signal.'] }
  }, overrides || {});
  return {
    id: 'session-1',
    entries: [
      { id: 'entry-old', type: 'chart', aiAnalysisResult: { thesis: { headline: 'stale, must never be preferred over the newer one' } } },
      { id: 'entry-new', type: 'chart', aiAnalysisResult: result }
    ]
  };
}

test('getRelevantSessionAnalysis() returns a minimized real summary of the SESSION\'S most recently analyzed chart entry - never the stale earlier one', async () => {
  const session = sessionWithAnalysis();
  const workspace = { find: (id) => (id === 'session-1' ? session : null) };
  const memory = await memorySandbox({ workspace });
  const result = memory.getRelevantSessionAnalysis({ activeSessionId: 'session-1' });
  assert.equal(result.length, 1);
  assert.equal(result[0].entryId, 'entry-new');
  assert.equal(result[0].thesisHeadline, 'Price is coiling under resistance.');
  assert.equal(result[0].thesisSummary, 'Liquidity above needs to be swept first.');
  assert.deepEqual(clone(result[0].stateMetrics), [{ label: 'Trend', value: 'Bullish' }]);
  assert.equal(result[0].scenarios[0].title, 'Breakout continuation');
  assert.equal(result[0].scenarios[0].probability, 65);
  assert.deepEqual(clone(result[0].watchItems), ['4200 resistance']);
  assert.deepEqual(clone(result[0].unknowns), ['Unclear whether the news release already priced in.']);
  assert.deepEqual(clone(result[0].confidence), { level: 'medium', reasons: ['Mixed higher-timeframe signal.'] });
});

test('getRelevantSessionAnalysis() returns [] when no activeSessionId is given - never guesses which session', async () => {
  const memory = await memorySandbox({ workspace: { find: () => sessionWithAnalysis() } });
  assert.deepEqual(clone(memory.getRelevantSessionAnalysis({})), []);
  assert.deepEqual(clone(memory.getRelevantSessionAnalysis()), []);
});

test('getRelevantSessionAnalysis() returns [] when the real session has no chart entry with a persisted analysis yet - never fabricates one', async () => {
  const workspace = { find: () => ({ id: 'session-2', entries: [{ id: 'e1', type: 'chart' }, { id: 'e2', type: 'movement' }] }) };
  const memory = await memorySandbox({ workspace });
  assert.deepEqual(clone(memory.getRelevantSessionAnalysis({ activeSessionId: 'session-2' })), []);
});

test('getRelevantSessionAnalysis() returns [] when the session itself does not resolve', async () => {
  const memory = await memorySandbox({ workspace: { find: () => null } });
  assert.deepEqual(clone(memory.getRelevantSessionAnalysis({ activeSessionId: 'missing' })), []);
});

test('getRelevantSessionAnalysis() respects the same tradesSessions data-access privacy toggle every other session/trade memory function already respects', async () => {
  const workspace = { find: () => sessionWithAnalysis() };
  const companionProfile = { dataAccessPrefs: () => ({ tradesSessions: false }) };
  const memory = await memorySandbox({ workspace, companionProfile });
  assert.deepEqual(clone(memory.getRelevantSessionAnalysis({ activeSessionId: 'session-1' })), []);
});
