import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), key: index => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}

// Phase 8b of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section) moved psychology-store.js's own settings()/saveSettings() off localStorage
// onto window.TradeJournalUserPreferences (Phase 8a's shared preferences primitive), so this
// helper now needs server-replica.js + user-preferences.js loaded, a real auth token, and a
// minimal fetch mock answering /api/sync/preferences - same convention as every other migrated
// domain's own regression-test sandbox fix (see tests/mental-health-regression.test.mjs).
async function psychologyStore(localStorage, fetchImpl) {
  localStorage = localStorage || memoryStorage();
  // Cookie-based sessions (ADR-0001): server-replica.js's hasCurrentUser() gate now reads
  // window.__NAVRYA_AUTH__ instead of a localStorage credential.
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'test-user', user: { id: 'test-user' }, csrfToken: 'test-csrf' } },
    localStorage, fetch: fetchImpl || (async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ preferences: [] }) }),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {}, addEventListener() {}, fetch: sandbox.fetch });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('user-preferences.js'), sandbox, { filename: 'user-preferences.js' });
  vm.runInNewContext(await source('psychology-store.js'), sandbox, { filename: 'psychology-store.js' });
  await new Promise((resolve) => setImmediate(resolve)); // let hydrate() settle before the caller reads/writes
  return sandbox.window.TradeJournalPsychologyStore;
}

function closedTrade(overrides) {
  return Object.assign({
    id: 'trade-' + Math.random().toString(36).slice(2), status: 'closed', outcome: 'win', pnl: 10, rr: 2,
    entryMode: 'full', createdAt: new Date().toISOString(), closedAt: new Date().toISOString(), emotionLog: []
  }, overrides || {});
}

test('emotional mirror reports insufficient data below the sample threshold, not a fabricated rate', async () => {
  const psych = await psychologyStore();
  const trades = [
    closedTrade({ outcome: 'win', emotionLog: [{ dominantEmotions: ['calm'], stressLevel: 3 }] }),
    closedTrade({ outcome: 'loss', emotionLog: [{ dominantEmotions: ['calm'], stressLevel: 3 }] })
  ];
  const rows = psych.emotionalMirror(trades, 3);
  const calm = rows.find(row => row.emotion === 'calm');
  assert.equal(calm.insufficient, true);
  assert.equal(calm.winRate, null);
  assert.equal(calm.sampleSize, 2);
});

test('tag mirror groups closed trades by self-written emotion tags and reports insufficient data below the threshold', async () => {
  const psych = await psychologyStore();
  const win1 = closedTrade({ outcome: 'win', emotionLog: [{ dominantEmotions: ['afraid'], emotionDetails: [{ emotion: 'afraid', intensity: 8, tags: ['ترس از ضرر'] }] }] });
  const win2 = closedTrade({ outcome: 'win', emotionLog: [{ dominantEmotions: ['afraid'], emotionDetails: [{ emotion: 'afraid', intensity: 7, tags: ['ترس از ضرر'] }] }] });
  const loss1 = closedTrade({ outcome: 'loss', emotionLog: [{ dominantEmotions: ['afraid'], emotionDetails: [{ emotion: 'afraid', intensity: 9, tags: ['ترس از ضرر'] }] }] });
  const rare = closedTrade({ outcome: 'win', emotionLog: [{ dominantEmotions: ['calm'], emotionDetails: [{ emotion: 'calm', intensity: 3, tags: ['طبق پلن پیش می‌رم'] }] }] });

  const belowThreshold = psych.tagMirror([rare], 3);
  assert.equal(belowThreshold[0].insufficient, true);
  assert.equal(belowThreshold[0].winRate, null);

  const rows = psych.tagMirror([win1, win2, loss1], 3);
  const fearOfLoss = rows.find(r => r.tag === 'ترس از ضرر');
  assert.ok(fearOfLoss, 'the tag surfaces once it has enough evidence');
  assert.equal(fearOfLoss.insufficient, false);
  assert.equal(Math.round(fearOfLoss.winRate), 67);
});

test('tag mirror only counts a repeated tag once per trade, even if logged on multiple emotion entries', async () => {
  const psych = await psychologyStore();
  const trades = [1, 2, 3].map(() => closedTrade({
    outcome: 'win',
    emotionLog: [
      { dominantEmotions: ['afraid'], emotionDetails: [{ emotion: 'afraid', intensity: 6, tags: ['نگران استاپ'] }] },
      { dominantEmotions: ['afraid'], emotionDetails: [{ emotion: 'afraid', intensity: 8, tags: ['نگران استاپ'] }] }
    ]
  }));
  const rows = psych.tagMirror(trades, 3);
  const stopWorry = rows.find(r => r.tag === 'نگران استاپ');
  assert.equal(stopWorry.sampleSize, 3, 'three trades, not six, even though the tag appears twice on each');
});

test('discipline streak returns 0 without throwing when there are no trades today', async () => {
  const psych = await psychologyStore();
  assert.equal(psych.disciplineStreak([]), 0);
  const yesterday = new Date(Date.now() - 86400000);
  assert.equal(psych.disciplineStreak([closedTrade({ createdAt: yesterday.toISOString(), entryMode: 'full' })]), 0);
});

test('discipline streak counts only consecutive full-mode days back from today', async () => {
  const psych = await psychologyStore();
  const now = new Date();
  const day = offset => new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 10).toISOString();
  const trades = [
    closedTrade({ createdAt: day(0), entryMode: 'full' }),
    closedTrade({ createdAt: day(1), entryMode: 'full' }),
    closedTrade({ createdAt: day(2), entryMode: 'quick' })
  ];
  assert.equal(psych.disciplineStreak(trades, now), 2);
});

test('the standalone revenge-warning and cool-down heuristics are retired from TradeJournalPsychologyStore (unified into post-trade reflection)', async () => {
  const psych = await psychologyStore();
  assert.equal(typeof psych.checkRevengeWarning, 'undefined');
  assert.equal(typeof psych.coolDownState, 'undefined');
  assert.equal(typeof psych.isCooldownDismissed, 'undefined');
  assert.equal(typeof psych.dismissCooldown, 'undefined');
});

test('psychology settings persist and merge on save, with one reconciled postTradeReflection toggle replacing the old revenge/cooldown pair', async () => {
  const psych = await psychologyStore();
  const defaults = psych.settings();
  assert.equal(defaults.breathing.stressThreshold, 8);
  assert.equal(defaults.postTradeReflection.enabled, true);
  assert.equal(defaults.postTradeReflection.cooldownMinutes, 15);
  assert.equal(typeof defaults.revenge, 'undefined');
  assert.equal(typeof defaults.cooldown, 'undefined');
  psych.saveSettings({ breathing: { enabled: false, stressThreshold: 6 } });
  const next = psych.settings();
  assert.equal(next.breathing.enabled, false);
  assert.equal(next.breathing.stressThreshold, 6);
  assert.equal(next.postTradeReflection.cooldownMinutes, 15, 'untouched sections keep their defaults');
});

test('trigger cards fall back to the old correlations-only response shape without throwing', async () => {
  const sandbox = {
    window: {
      TradeJournalTradeStore: { listSync: () => [], psychologyDataset: () => [] },
      TradeJournalTradeI18n: { t: key => key, language: () => 'en', locale: () => 'en-US', number: value => String(value), date: () => '', money: value => String(value), direction: () => 'ltr' },
      TradeJournalPanelLayer: { show() {}, register() {} },
      TradeJournalTradeReports: { canvasCard: () => ({ append() {} }), draw() {}, rangeDates: () => ({ from: '', to: '' }) }
    },
    document: {
      createElement: tag => ({ tagName: tag, className: '', textContent: '', dataset: {}, style: {}, children: [], append() {}, prepend() {}, replaceChildren() {}, setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }),
      documentElement: {}, body: { append() {} },
      querySelectorAll: () => [], querySelector: () => null, addEventListener() {}
    },
    MutationObserver: class { observe() {} },
    setTimeout() {},
    location: { hash: '' },
    history: { replaceState() {} },
    getComputedStyle: () => ({ getPropertyValue: () => '' })
  };
  sandbox.window = Object.assign(sandbox.window, { addEventListener() {}, location: sandbox.location, history: sandbox.history, document: sandbox.document, setTimeout: sandbox.setTimeout });
  vm.runInNewContext(await source('psychology-store.js'), sandbox, { filename: 'psychology-store.js' });
  sandbox.window.TradeJournalPsychologyStore = Object.assign(sandbox.window.TradeJournalPsychologyStore, {});
  vm.runInNewContext(await source('psychology-ui.js'), sandbox, { filename: 'psychology-ui.js' });
  const psychology = sandbox.window.TradeJournalPsychology;
  assert.ok(psychology, 'module loads and exposes its public API');

  const oldShapedResponse = { summary: 'ok', insights: [], correlations: [{ factor: 'high stress', outcome: 'loss', observation: 'stress above 8 often precedes a loss' }], sampleSize: 5, provider: 'openai', model: 'gpt' };
  const fromCorrelations = psychology.buildTriggerCards(oldShapedResponse);
  assert.equal(fromCorrelations.length, 1);
  assert.match(fromCorrelations[0].title, /high stress/);

  const emptyResponse = { summary: 'ok', insights: [], correlations: [], sampleSize: 1, provider: 'openai', model: 'gpt' };
  assert.equal(psychology.buildTriggerCards(emptyResponse).length, 0);

  const newShapedResponse = { summary: 'ok', insights: [], correlations: [], triggers: [{ type: 'time_of_day', condition: 'after 22:00', observation: 'late trades lose more often', confidence: 0.6 }], sampleSize: 8 };
  const fromTriggers = psychology.buildTriggerCards(newShapedResponse);
  assert.equal(fromTriggers.length, 1);
  assert.equal(fromTriggers[0].title, 'after 22:00');
});

test('the wizard no longer shows a standalone revenge-trade modal while logging a new trade - that check now lives only in the unified post-trade reflection popup, fired from closeTrade()', async () => {
  const text = await source('trade-ui.js');
  const start = text.indexOf('function proceed()');
  const end = text.indexOf('actions.append(cancel,next)');
  const block = text.slice(start, end);
  assert.doesNotMatch(block, /checkRevengeWarning/, 'the wizard step-4 transition no longer calls the retired revenge-warning heuristic');
  assert.doesNotMatch(block, /psyRevengeTitle/, 'the old standalone revenge modal copy is not built here anymore');
  const closeTradeStart = text.indexOf('function closeTrade(');
  const closeTradeBlock = text.slice(closeTradeStart, closeTradeStart + 1600);
  assert.match(closeTradeBlock, /TradeJournalMentalHealthContinuous\)window\.TradeJournalMentalHealthContinuous\.onTradeClosed\(trade\)/, 'closing a trade hands off to the unified post-trade reflection popup');
});

test('breathing card never blocks the emotion slider or prevents default', async () => {
  const text = await source('trade-ui.js');
  const start = text.indexOf('function emotionEditor');
  const end = text.indexOf('function openEmotion');
  const block = text.slice(start, end);
  assert.match(block, /tj-breathing-card/);
  assert.match(block, /breathClose\.onclick=function\(\)\{dismissed=true;breathing\.hidden=true;\};/);
  const breathingBlock = block.slice(block.indexOf('var breathing=el'), block.indexOf('input.oninput=function(){state.stressLevel'));
  assert.doesNotMatch(breathingBlock, /preventDefault/, 'the breathing card itself never intercepts input, even though the unrelated tag-entry Enter handler now uses preventDefault elsewhere in this function');
});

test('all four character pages load psychology-store after trade-store and psychology-ui after trade-reports', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const tradeStore = html.indexOf('trade-store.js');
    const psychStore = html.indexOf('psychology-store.js');
    const calculator = html.indexOf('trade-calculator.js');
    const tradeReports = html.indexOf('trade-reports.js');
    const psychUi = html.indexOf('psychology-ui.js');
    const patternRegistry = html.indexOf('pattern-registry.js');
    assert.ok(tradeStore > -1 && tradeStore < psychStore && psychStore < calculator, character + ' psychology-store order');
    assert.ok(tradeReports > -1 && tradeReports < psychUi && psychUi < patternRegistry, character + ' psychology-ui order');
    assert.ok(html.indexOf('psychology.css') > html.indexOf('trade-system.css'), character + ' psychology.css order');
  }
});

// --- tiltReading(): the live read behind the OVERVIEW tilt meter ---

const AGO = minutes => new Date(Date.now() - minutes * 60000).toISOString();

test('tiltReading reports calm when the most recent closed trade was a win', async () => {
  const psych = await psychologyStore();
  const reading = psych.tiltReading([
    closedTrade({ outcome: 'win', closedAt: AGO(10) }),
    closedTrade({ outcome: 'loss', closedAt: AGO(400) })
  ]);
  assert.equal(reading.level, 'calm');
  assert.equal(reading.lossStreak, 0);
});

test('tiltReading escalates to high on two consecutive losses, however long ago', async () => {
  const psych = await psychologyStore();
  const reading = psych.tiltReading([
    closedTrade({ outcome: 'loss', closedAt: AGO(600) }),
    closedTrade({ outcome: 'loss', closedAt: AGO(700) })
  ]);
  assert.equal(reading.level, 'high');
  assert.equal(reading.lossStreak, 2);
});

test('tiltReading escalates to high on a single loss inside the last half hour, and only watches an older one', async () => {
  const psych = await psychologyStore();
  const fresh = psych.tiltReading([closedTrade({ outcome: 'loss', closedAt: AGO(5) })]);
  assert.equal(fresh.level, 'high');

  const stale = psych.tiltReading([closedTrade({ outcome: 'loss', closedAt: AGO(180) })]);
  assert.equal(stale.level, 'watch');
  assert.equal(stale.lossStreak, 1);
});

test('tiltReading counts open and hunting positions, and reports no last loss as null rather than zero', async () => {
  const psych = await psychologyStore();
  const reading = psych.tiltReading([
    closedTrade({ outcome: 'win', closedAt: AGO(60) }),
    { id: 'a', status: 'open' }, { id: 'b', status: 'hunting' }, { id: 'c', status: 'closed' }
  ]);
  assert.equal(reading.openCount, 2);
  assert.equal(reading.minutesSinceLoss, null);
});

// --- selfRatings(): the three numbers behind the OVERVIEW gauges ---

test('selfRatings averages the three logged numbers over the window', async () => {
  const psych = await psychologyStore();
  const at = iso => ({ timestamp: iso, stressLevel: 6, focusQuality: 8, planCommitment: 4 });
  const ratings = psych.selfRatings([
    closedTrade({ emotionLog: [at(AGO(60)), at(AGO(120))] })
  ], 30);
  assert.equal(ratings.stress, 6);
  assert.equal(ratings.focus, 8);
  assert.equal(ratings.planCommitment, 4);
  assert.equal(ratings.sampleSize, 2);
});

test('selfRatings returns null for a metric with nothing logged, never a default of five', async () => {
  const psych = await psychologyStore();
  const ratings = psych.selfRatings([
    closedTrade({ emotionLog: [{ timestamp: AGO(60), stressLevel: 7 }] })
  ], 30);
  assert.equal(ratings.stress, 7);
  assert.equal(ratings.focus, null);
  assert.equal(ratings.planCommitment, null);
});

test('selfRatings ignores logs older than the window', async () => {
  const psych = await psychologyStore();
  const ratings = psych.selfRatings([
    closedTrade({ emotionLog: [{ timestamp: AGO(60 * 24 * 60), stressLevel: 9, focusQuality: 1, planCommitment: 1 }] })
  ], 30);
  assert.equal(ratings.stress, null);
  assert.equal(ratings.sampleSize, 0);
});

// --- worstRevengeTrade(): the calm room's deterrent card ---

test('worstRevengeTrade finds the single worst pnl among losses that followed a loss within 30 minutes', async () => {
  const psych = await psychologyStore();
  const base = new Date('2026-08-24T10:00:00Z');
  const at = (min) => new Date(base.getTime() + min * 60000).toISOString();
  const trades = [
    closedTrade({ outcome: 'loss', pnl: -40, closedAt: at(0) }),
    closedTrade({ outcome: 'loss', pnl: -312, closedAt: at(4) }), // 4 min after a loss -> candidate, worst
    closedTrade({ outcome: 'loss', pnl: -20, closedAt: at(25) })  // 21 min after the previous loss -> also a candidate, not worst
  ];
  const worst = psych.worstRevengeTrade(trades);
  assert.equal(worst.pnl, -312);
  assert.equal(worst.minutesSinceLoss, 4);
});

test('worstRevengeTrade returns null when no loss ever followed another loss within 30 minutes', async () => {
  const psych = await psychologyStore();
  const base = new Date('2026-08-24T10:00:00Z');
  const at = (min) => new Date(base.getTime() + min * 60000).toISOString();
  const trades = [
    closedTrade({ outcome: 'win', pnl: 40, closedAt: at(0) }),
    closedTrade({ outcome: 'loss', pnl: -50, closedAt: at(10) }),
    closedTrade({ outcome: 'loss', pnl: -60, closedAt: at(120) }) // 110 min later - too far apart
  ];
  assert.equal(psych.worstRevengeTrade(trades), null);
});

test('worstRevengeTrade computes a real sizeRatio from riskPercent, and leaves it null without enough samples', async () => {
  const psych = await psychologyStore();
  const base = new Date('2026-08-24T10:00:00Z');
  const at = (min) => new Date(base.getTime() + min * 60000).toISOString();

  const withRisk = psych.worstRevengeTrade([
    closedTrade({ outcome: 'loss', pnl: -10, closedAt: at(0), riskPercent: 1 }),
    closedTrade({ outcome: 'loss', pnl: -10, closedAt: at(1), riskPercent: 1 }),
    closedTrade({ outcome: 'loss', pnl: -300, closedAt: at(5), riskPercent: 3.5 })
  ]);
  assert.equal(withRisk.sizeRatio, 3.5);

  const withoutRisk = psych.worstRevengeTrade([
    closedTrade({ outcome: 'loss', pnl: -10, closedAt: at(0) }),
    closedTrade({ outcome: 'loss', pnl: -300, closedAt: at(5) })
  ]);
  assert.equal(withoutRisk.sizeRatio, null);
});

// --- journeyArcShapes() / holdTimeByExitTone() / openPositionMoods(): the JourneysTab panels ---

function logEntry(stress, dominant, overrides) {
  return Object.assign({ stage: 'entry', stressLevel: stress, dominantEmotions: dominant ? [dominant] : [], emotionDetails: [], timestamp: new Date().toISOString() }, overrides || {});
}

test('journeyArcShapes classifies a clean rise and a clean fall correctly', async () => {
  const psych = await psychologyStore();
  const trades = [
    closedTrade({ emotionLog: [logEntry(3), logEntry(9)] }), // rising
    closedTrade({ emotionLog: [logEntry(8), logEntry(2)] }), // falling
    closedTrade({ emotionLog: [logEntry(4), logEntry(4)] })  // steady
  ];
  const shapes = psych.journeyArcShapes(trades, 1);
  const by = Object.fromEntries(shapes.map((s) => [s.shape, s]));
  assert.equal(by.rising.sampleSize, 1);
  assert.equal(by.falling.sampleSize, 1);
  assert.equal(by.steady.sampleSize, 1);
});

test('journeyArcShapes detects a bowl shape (peak strictly in the middle)', async () => {
  const psych = await psychologyStore();
  const trades = [closedTrade({ emotionLog: [logEntry(3), logEntry(9), logEntry(3)] })];
  const shapes = psych.journeyArcShapes(trades, 1);
  assert.equal(shapes.find((s) => s.shape === 'bowl').sampleSize, 1);
});

test('journeyArcShapes ignores trades with fewer than two stress readings', async () => {
  const psych = await psychologyStore();
  const trades = [closedTrade({ emotionLog: [logEntry(5)] }), closedTrade({ emotionLog: [] })];
  const shapes = psych.journeyArcShapes(trades, 1);
  assert.ok(shapes.every((s) => s.sampleSize === 0));
});

test('holdTimeByExitTone computes real minutes from real timestamps, skipping trades without an exit log', async () => {
  const psych = await psychologyStore();
  const created = new Date('2026-08-24T10:00:00Z').toISOString();
  const closedAt = new Date('2026-08-24T10:30:00Z').toISOString();
  const rows = psych.holdTimeByExitTone([
    closedTrade({ outcome: 'win', createdAt: created, closedAt, emotionLog: [logEntry(3, 'calm')] }),
    closedTrade({ outcome: 'loss', createdAt: created, closedAt, emotionLog: [] }) // no exit log -> skipped
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].avgMinutes, 30);
  assert.equal(rows[0].tone, 'positive');
  assert.equal(rows[0].sampleSize, 1);
});

test('openPositionMoods returns only open/hunting trades that carry a real emotion log, with no fabricated P&L', async () => {
  const psych = await psychologyStore();
  const rows = psych.openPositionMoods([
    { id: 't1', status: 'open', direction: 'long', instrument: 'XAUUSD', emotionLog: [logEntry(6, 'anxious', { emotionDetails: [{ tags: ['news'] }] })] },
    { id: 't2', status: 'open', direction: 'short', emotionLog: [] }, // no log -> excluded
    { id: 't3', status: 'closed', direction: 'long', emotionLog: [logEntry(4, 'calm')] } // closed -> excluded
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tradeId, 't1');
  assert.equal(rows[0].stressLevel, 6);
  assert.deepEqual([...rows[0].dominantEmotions], ['anxious']);
  assert.deepEqual([...rows[0].tags], ['news']);
  assert.ok(!('pnl' in rows[0]));
});

// ---------------------------------------------------------------------------
// aiInsightCards - local, computed-not-generated pattern search (Insights tab)
// ---------------------------------------------------------------------------
function many(n, build) { return Array.from({ length: n }, (_, i) => build(i)); }

test('aiInsightCards headline emotion-spread card names the real best/worst emotion by avg P&L, gated by sample size', async () => {
  const psych = await psychologyStore();
  const trades = [
    ...many(10, () => closedTrade({ outcome: 'win', pnl: 50, emotionLog: [logEntry(3, 'calm')] })),
    ...many(10, () => closedTrade({ outcome: 'loss', pnl: -40, emotionLog: [logEntry(9, 'revenge')] }))
  ];
  const { cards } = psych.aiInsightCards(trades, [], {}, 8);
  const headline = cards.find((c) => c.kind === 'emotionSpread');
  assert.ok(headline);
  assert.equal(headline.best.emotion, 'calm');
  assert.equal(headline.worst.emotion, 'revenge');
  assert.equal(headline.best.sampleSize, 10);
});

test('aiInsightCards drops the emotion-spread card when neither side clears the sample threshold', async () => {
  const psych = await psychologyStore();
  const trades = [
    closedTrade({ outcome: 'win', pnl: 50, emotionLog: [logEntry(3, 'calm')] }),
    closedTrade({ outcome: 'loss', pnl: -40, emotionLog: [logEntry(9, 'revenge')] })
  ];
  const { cards } = psych.aiInsightCards(trades, [], {}, 8);
  assert.ok(!cards.find((c) => c.kind === 'emotionSpread'));
});

test('aiInsightCards hour-window card only fires when the worst 2-hour window AND the rest of the day both clear the sample threshold', async () => {
  const psych = await psychologyStore();
  const day = (h, m) => new Date(2026, 0, 1, h, m || 0).toISOString();
  const trades = [
    // 16:00-17:59 window: mostly losses (real losing window)
    ...many(10, (i) => closedTrade({ outcome: i < 2 ? 'win' : 'loss', closedAt: day(16, i) })),
    // rest of the day, spread across non-adjacent hours: mostly wins
    ...many(10, (i) => closedTrade({ outcome: i < 8 ? 'win' : 'loss', closedAt: day((i % 5) * 4, i) }))
  ];
  const { cards } = psych.aiInsightCards(trades, [], {}, 8);
  const window = cards.find((c) => c.kind === 'hourWindow');
  assert.ok(window);
  assert.equal(window.startHour, 16);
  assert.ok(window.winRate < window.restWinRate);
});

test('aiInsightCards symbol-stress card names the real highest-stress instrument versus the rest', async () => {
  const psych = await psychologyStore();
  const trades = [
    ...many(9, () => closedTrade({ instrument: 'XAUUSD', emotionLog: [logEntry(9, 'anxious')] })),
    ...many(9, () => closedTrade({ instrument: 'EURUSD', emotionLog: [logEntry(3, 'calm')] }))
  ];
  const { cards } = psych.aiInsightCards(trades, [], {}, 8);
  const symbol = cards.find((c) => c.kind === 'symbolStress');
  assert.ok(symbol);
  assert.equal(symbol.instrument, 'XAUUSD');
  assert.ok(symbol.avgStress > symbol.restAvgStress);
});

test('aiInsightCards sleep-quality correlation reads real PreSessionCheckIn.sleepQuality against the NEXT calendar day\'s real win rate', async () => {
  const psych = await psychologyStore();
  const lowDay = new Date(2026, 0, 5), lowNext = new Date(2026, 0, 6);
  const highDay = new Date(2026, 0, 10), highNext = new Date(2026, 0, 11);
  const checkins = [
    { createdAt: lowDay.toISOString(), sleepQuality: 3 },
    { createdAt: highDay.toISOString(), sleepQuality: 9 }
  ];
  const trades = [
    ...many(8, () => closedTrade({ outcome: 'loss', closedAt: lowNext.toISOString() })),
    ...many(8, () => closedTrade({ outcome: 'win', closedAt: highNext.toISOString() }))
  ];
  const { correlations } = psych.aiInsightCards(trades, checkins, {}, 8);
  const sleep = correlations.find((c) => c.kind === 'sleepNextDay');
  assert.ok(sleep);
  assert.equal(sleep.lowWinRate, 0);
  assert.equal(sleep.highWinRate, 100);
});

test('aiInsightCards skips a next-day bucket that received both a low- and a high-sleep checkin (ambiguous), never guessing', async () => {
  const psych = await psychologyStore();
  const day = new Date(2026, 0, 5);
  const checkins = [{ createdAt: day.toISOString(), sleepQuality: 3 }, { createdAt: day.toISOString(), sleepQuality: 9 }];
  const trades = many(10, () => closedTrade({ outcome: 'win', closedAt: new Date(2026, 0, 6).toISOString() }));
  const { correlations } = psych.aiInsightCards(trades, checkins, {}, 8);
  assert.ok(!correlations.find((c) => c.kind === 'sleepNextDay'));
});

test('aiInsightCards "something to prove" correlation reads real somethingToProveToday against the SAME day\'s real avg P&L', async () => {
  const psych = await psychologyStore();
  const yesDay = new Date(2026, 0, 5), noDay = new Date(2026, 0, 6);
  const checkins = [{ createdAt: yesDay.toISOString(), somethingToProveToday: true }, { createdAt: noDay.toISOString(), somethingToProveToday: false }];
  const trades = [
    ...many(8, () => closedTrade({ pnl: -20, closedAt: yesDay.toISOString() })),
    ...many(8, () => closedTrade({ pnl: 30, closedAt: noDay.toISOString() }))
  ];
  const { correlations } = psych.aiInsightCards(trades, checkins, {}, 8);
  const prove = correlations.find((c) => c.kind === 'proveToday');
  assert.ok(prove);
  assert.equal(prove.yesAvgPnl, -20);
  assert.equal(prove.noAvgPnl, 30);
});

test('aiInsightCards personal-event correlation reads real significantPersonalEvent against real trade.emotionLog.planCommitment', async () => {
  const psych = await psychologyStore();
  const withDay = new Date(2026, 0, 5), withoutDay = new Date(2026, 0, 6);
  const checkins = [
    { createdAt: withDay.toISOString(), significantPersonalEvent: 'خبر بد از خانواده' },
    { createdAt: withoutDay.toISOString(), significantPersonalEvent: null }
  ];
  const trades = [
    ...many(8, () => closedTrade({ closedAt: withDay.toISOString(), emotionLog: [logEntry(6, 'anxious', { planCommitment: 3 })] })),
    ...many(8, () => closedTrade({ closedAt: withoutDay.toISOString(), emotionLog: [logEntry(4, 'calm', { planCommitment: 8 })] }))
  ];
  const { correlations } = psych.aiInsightCards(trades, checkins, {}, 8);
  const event = correlations.find((c) => c.kind === 'personalEvent');
  assert.ok(event);
  assert.equal(event.withAvgCommitment, 3);
  assert.equal(event.withoutAvgCommitment, 8);
});

test('aiInsightCards routine-completion correlation reads a real per-day routine-store progress map against real avg stress that day', async () => {
  const psych = await psychologyStore();
  const fullDay = '2026-1-5', partialDay = '2026-1-6';
  const routineDays = { [fullDay]: { total: 6, complete: true }, [partialDay]: { total: 6, complete: false } };
  const trades = [
    ...many(8, () => closedTrade({ closedAt: new Date(2026, 0, 5, 12).toISOString(), emotionLog: [logEntry(3, 'calm')] })),
    ...many(8, () => closedTrade({ closedAt: new Date(2026, 0, 6, 12).toISOString(), emotionLog: [logEntry(8, 'anxious')] }))
  ];
  const { correlations } = psych.aiInsightCards(trades, [], routineDays, 8);
  const routine = correlations.find((c) => c.kind === 'routineCompletion');
  assert.ok(routine);
  assert.equal(routine.fullAvgStress, 3);
  assert.equal(routine.partialAvgStress, 8);
});

// ---------------------------------------------------------------------------
// cooldownHistory / cooldownHistorySummary (Protective tab)
// ---------------------------------------------------------------------------
function reflection(overrides) {
  return Object.assign({ id: 'refl-' + Math.random().toString(36).slice(2), tradeId: 't1', revengeCheck: null }, overrides || {});
}

test('cooldownHistory only counts a real fired cooldown - revengeCheck.choice "recover" with a real cooldownTimerStartedAt', async () => {
  const psych = await psychologyStore();
  const reflections = [
    reflection({ tradeId: 't1', revengeCheck: { shown: true, choice: 'recover', cooldownTimerStartedAt: new Date(2026, 0, 1, 10, 0).toISOString() } }),
    reflection({ tradeId: 't2', revengeCheck: { shown: true, choice: 'rest', cooldownTimerStartedAt: null } }), // declined to reopen - no cooldown fired
    reflection({ tradeId: 't3', revengeCheck: { shown: true, choice: 'saw_setup', cooldownTimerStartedAt: null } }) // claimed a real setup - no cooldown fired
  ];
  const rows = psych.cooldownHistory([{ id: 't1' }, { id: 't2' }, { id: 't3' }], reflections, 15);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tradeId, 't1');
});

test('cooldownHistory objectively reads whether the trader held the cooldown, from real trade timestamps - not self-reported', async () => {
  const psych = await psychologyStore();
  // Two separate, non-overlapping 15-minute cooldown windows, so a trade opened inside one
  // never also counts as breaking the other.
  const heldStart = new Date(2026, 0, 1, 10, 0);
  const brokeStart = new Date(2026, 0, 1, 11, 0);
  const reflections = [
    reflection({ tradeId: 'held-source', revengeCheck: { shown: true, choice: 'recover', cooldownTimerStartedAt: heldStart.toISOString() } }),
    reflection({ tradeId: 'broke-source', revengeCheck: { shown: true, choice: 'recover', cooldownTimerStartedAt: brokeStart.toISOString() } })
  ];
  const trades = [
    { id: 'held-source', createdAt: new Date(2026, 0, 1, 9, 0).toISOString() },
    { id: 'broke-source', createdAt: new Date(2026, 0, 1, 10, 45).toISOString() },
    // opened 10 minutes into broke-source's 15-minute cooldown - a real break
    { id: 'broke-into', createdAt: new Date(2026, 0, 1, 11, 10).toISOString() }
  ];
  const rows = psych.cooldownHistory(trades, reflections, 15);
  const held = rows.find((r) => r.tradeId === 'held-source');
  const broke = rows.find((r) => r.tradeId === 'broke-source');
  assert.equal(held.held, true);
  assert.equal(broke.held, false);
});

test('cooldownHistorySummary reports real held/broke counts, never a fabricated compliance rate', async () => {
  const psych = await psychologyStore();
  const rows = [{ held: true }, { held: true }, { held: false }];
  const summary = psych.cooldownHistorySummary(rows);
  // Spread out of the vm sandbox's realm before comparing - see the file's other cross-realm notes.
  assert.deepEqual({ ...summary }, { total: 3, held: 2, broke: 1 });
});

// ---------------------------------------------------------------------------
// Overview tab additions: moodInsight, ratingDeltas, readinessScore, disciplineHealthyStreak
// ---------------------------------------------------------------------------
function checkin(overrides) {
  return Object.assign({ mood: null, sleepQuality: 5, currentStressLevel: 5, somethingToProveToday: false, significantPersonalEvent: null }, overrides || {});
}

test('moodInsight reads a real win rate only from days that logged the given mood, gated by sample size', async () => {
  const psych = await psychologyStore();
  const day1 = new Date(2026, 0, 5), day2 = new Date(2026, 0, 6);
  const checkins = [checkin({ mood: 'calm', createdAt: day1.toISOString() }), checkin({ mood: 'angry', createdAt: day2.toISOString() })];
  const trades = [
    ...many(6, () => closedTrade({ outcome: 'win', closedAt: day1.toISOString() })),
    ...many(6, () => closedTrade({ outcome: 'loss', closedAt: day2.toISOString() }))
  ];
  const calm = psych.moodInsight(trades, checkins, 'calm', 5);
  const angry = psych.moodInsight(trades, checkins, 'angry', 5);
  assert.ok(calm);
  assert.equal(calm.winRate, 100);
  assert.ok(angry);
  assert.equal(angry.winRate, 0);
});

test('moodInsight returns null when a mood has been logged but not enough trades back it', async () => {
  const psych = await psychologyStore();
  const day = new Date(2026, 0, 5);
  const checkins = [checkin({ mood: 'calm', createdAt: day.toISOString() })];
  const trades = [closedTrade({ outcome: 'win', closedAt: day.toISOString() })];
  assert.equal(psych.moodInsight(trades, checkins, 'calm', 5), null);
});

test('ratingDeltas compares two adjacent, non-overlapping windows - never double-counting the recent window into the prior one', async () => {
  const psych = await psychologyStore();
  const now = new Date(2026, 2, 1);
  const recentDay = new Date(2026, 1, 15), priorDay = new Date(2026, 0, 15); // ~15 days ago, ~45 days ago
  const trades = [
    closedTrade({ emotionLog: [logEntry(8, 'anxious', { timestamp: recentDay.toISOString() })] }),
    closedTrade({ emotionLog: [logEntry(4, 'calm', { timestamp: priorDay.toISOString() })] })
  ];
  const deltas = psych.ratingDeltas(trades, 30, now);
  assert.equal(deltas.stress.value, 8);
  assert.equal(deltas.stress.delta, 4);
});

test('readinessScore reports hasData:false and a null score when none of the three real factors have anything logged', async () => {
  const psych = await psychologyStore();
  const result = psych.readinessScore([], [], new Date(2026, 0, 10));
  assert.equal(result.hasData, false);
  assert.equal(result.score, null);
  assert.equal(result.ready, null);
});

test('readinessScore deducts for poor sleep logged today and a real loss streak, never inventing a factor with no data', async () => {
  const psych = await psychologyStore();
  const now = new Date(2026, 0, 10, 9, 0);
  const checkins = [checkin({ sleepQuality: 3, createdAt: now.toISOString() })];
  const trades = [
    closedTrade({ outcome: 'loss', closedAt: new Date(2026, 0, 10, 8, 0).toISOString() }),
    closedTrade({ outcome: 'loss', closedAt: new Date(2026, 0, 10, 8, 20).toISOString() })
  ];
  const result = psych.readinessScore(trades, checkins, now);
  assert.equal(result.hasData, true);
  assert.ok(result.score < 100);
  assert.ok(result.factors.some((f) => f.key === 'sleep' && f.tone === 'warning'));
  assert.ok(result.factors.some((f) => f.key === 'lossStreak' && f.tone === 'danger'));
});

test('disciplineHealthyStreak counts only the trailing run inside the healthy band, and flags it a record only when it is the longest run in the window', async () => {
  const psych = await psychologyStore();
  const weeks = [{ score: 40 }, { score: 95 }, { score: 75 }, { score: 80 }, { score: 85 }];
  const result = psych.disciplineHealthyStreak(weeks, 70, 90);
  assert.equal(result.streak, 3);
  assert.equal(result.isRecord, true);
});

test('disciplineHealthyStreak is not a record when an earlier run in the window was longer', async () => {
  const psych = await psychologyStore();
  const weeks = [{ score: 75 }, { score: 80 }, { score: 85 }, { score: 90 }, { score: 40 }, { score: 75 }];
  const result = psych.disciplineHealthyStreak(weeks, 70, 90);
  assert.equal(result.streak, 1);
  assert.equal(result.isRecord, false);
});
