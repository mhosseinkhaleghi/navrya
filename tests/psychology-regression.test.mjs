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
