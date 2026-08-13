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

async function loadInto(sandbox, files) {
  for (const file of files) vm.runInNewContext(await source(file), sandbox, { filename: file });
  return sandbox.window;
}

function baseSandbox(localStorage) {
  const sandbox = {
    window: {}, localStorage,
    document: { body: { dataset: {} }, documentElement: { lang: 'en' } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    FileReader: class {},
    fetch: async () => { throw new Error('not used'); }, AbortController, setTimeout, clearTimeout
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent() {}, addEventListener() {},
    document: sandbox.document,
    TradeJournalTradeTypes: { timeframes: ['1m', '5m'], emotions: ['excited', 'anxious', 'calm', 'revenge', 'angry', 'afraid', 'confident', 'fatigued', 'restless', 'overconfident'] },
    TradeJournalPanelLayer: { character: 'hunter' }
  });
  return sandbox;
}

async function mentalHealthOnly(localStorage) {
  const sandbox = baseSandbox(localStorage || memoryStorage());
  return loadInto(sandbox, ['mental-health.types.js', 'mental-health-i18n.js', 'mental-health-safety.js', 'mental-health-store.js', 'mental-health-ai.js', 'mental-health-cards.js', 'mental-health-scheduler.js', 'mental-health-report.js']);
}

async function withTrades(localStorage) {
  const sandbox = baseSandbox(localStorage || memoryStorage());
  return loadInto(sandbox, ['trade-store.js', 'mental-health.types.js', 'mental-health-i18n.js', 'mental-health-safety.js', 'mental-health-store.js', 'mental-health-collector.js', 'mental-health-cycle.js']);
}

function closedTrade(overrides) {
  return Object.assign({
    status: 'closed', outcome: 'loss', direction: 'long', entryMode: 'full',
    emotionLog: []
  }, overrides || {});
}

test('mental health profile store fields match the documented shape (no schema drift)', async () => {
  const window = await mentalHealthOnly();
  const profile = window.TradeJournalMentalHealthStore.load();
  for (const key of ['userId', 'createdAt', 'lastUpdatedAt', 'version', 'baseline', 'emotionalProfile', 'triggerProfile', 'behavioralPatterns', 'cognitiveProfile', 'progressTracking', 'activeInterventions', 'healthReportCache', 'chatHistory', 'educationCards']) {
    assert.ok(key in profile, 'missing top-level field: ' + key);
  }
  assert.equal(profile.userId, 'local-trader');
  assert.equal(profile.baseline.completed, false);
  assert.ok(Array.isArray(profile.cognitiveProfile.thoughtRecords));
  assert.ok(Array.isArray(profile.chatHistory));
});

test('applying a suggestion only mutates the profile after explicit approval', async () => {
  const window = await mentalHealthOnly();
  const store = window.TradeJournalMentalHealthStore;
  let profile = store.load();
  profile = store.addMessage(profile, 'assistant', 'Suggested update', [{ id: 'sugg-1', path: 'baseline.initialStressLevel', section: 'baseline', value: '7', mode: 'replace', status: 'pending', createdAt: store.now() }]);
  assert.equal(profile.baseline.initialStressLevel, 5, 'value must not change while the suggestion is still pending');

  const rejected = store.applySuggestion(profile, { id: 'sugg-1' }, 'rejected');
  assert.equal(rejected.baseline.initialStressLevel, 5);
  assert.equal(rejected.chatHistory[0].suggestions[0].status, 'rejected');

  profile = store.addMessage(store.load(), 'assistant', 'Another one', [{ id: 'sugg-2', path: 'baseline.initialStressLevel', section: 'baseline', value: '8', mode: 'replace', status: 'pending', createdAt: store.now() }]);
  const applied = store.applySuggestion(profile, { id: 'sugg-2' }, 'applied');
  assert.equal(applied.baseline.initialStressLevel, 8);
});

test('array-append suggestions push onto self-reported weaknesses without clobbering existing entries', async () => {
  const window = await mentalHealthOnly();
  const store = window.TradeJournalMentalHealthStore;
  let profile = store.load();
  profile.baseline.selfReportedWeaknesses = ['enters too early'];
  profile = store.save(profile);
  profile = store.addMessage(profile, 'assistant', '', [{ id: 'w1', path: 'baseline.selfReportedWeaknesses', section: 'baseline', value: 'chases losses', mode: 'append', status: 'pending', createdAt: store.now() }]);
  profile = store.applySuggestion(profile, { id: 'w1' }, 'applied');
  assert.deepEqual(profile.baseline.selfReportedWeaknesses, ['enters too early', 'chases losses']);
});

test('safety gate flags known distress phrases across all four languages and lets neutral text through', async () => {
  const window = await mentalHealthOnly();
  const safety = window.TradeJournalMentalHealthSafety;
  assert.equal(safety.checkText("I can't cope anymore, it's hopeless").flagged, true);
  assert.equal(safety.checkText('دیگه نمی‌تونم تحمل کنم').flagged, true);
  assert.equal(safety.checkText('لا أستطيع التحمل بعد الآن').flagged, true);
  assert.equal(safety.checkText('no puedo más, he perdido la esperanza').flagged, true);
  assert.equal(safety.checkText('I lost a small trade today, need to review my stop placement').flagged, false);
  assert.equal(safety.checkText('').flagged, false);
});

test('education card falls back to the CSS/SVG visual when no image provider is configured', async () => {
  const window = await mentalHealthOnly();
  const store = window.TradeJournalMentalHealthStore;
  let profile = store.load();
  profile = store.ensureBias(profile, 'fomo', ['trade-1', 'trade-2', 'trade-3']);
  const result = await window.TradeJournalMentalHealthCards.ensureCard(profile, 'fomo', false);
  assert.ok(result.card, 'a card is produced even though the AI server is unreachable in this test');
  assert.equal(result.card.imageUrl, null, 'default image provider returns null');
  assert.equal(result.card.local, true, 'network is unavailable in this sandbox, so the local fallback text is used');
  const fallback = window.TradeJournalMentalHealthCards.fallbackVisual('fomo');
  assert.match(fallback, /^data:image\/svg\+xml/);
});

test('scheduler reports due items as a pure function and never touches the notification provider', async () => {
  const window = await mentalHealthOnly();
  let notified = false;
  window.TradeJournalNotificationProvider.notify = () => { notified = true; };
  const profile = window.TradeJournalMentalHealthStore.load();
  const items = window.TradeJournalMentalHealthScheduler.dueItems(profile, new Date());
  assert.ok(Array.isArray(items));
  assert.ok(items.some(item => item.type === 'baseline_assessment'), 'a fresh, incomplete profile is due for its baseline assessment');
  assert.equal(notified, false, 'the scheduler only computes what is due; it never calls the notification provider itself');
});

test('phase transitions require their stated evidence and regressions are recorded in phaseHistory', async () => {
  const window = await withTrades();
  const store = window.TradeJournalMentalHealthStore;
  const cycle = window.TradeJournalMentalHealthCycle;
  let profile = store.load();
  profile = store.ensureBias(profile, 'fomo', ['t1', 't2']);

  let bias = profile.cognitiveProfile.identifiedBiases[0];
  assert.equal(cycle.evaluate(profile, bias, new Date()), null, 'intake incomplete and too little evidence: no transition yet');

  profile.intake.completed = true;
  profile = store.save(profile);
  profile = store.ensureBias(profile, 'fomo', ['t3']);
  bias = profile.cognitiveProfile.identifiedBiases[0];
  const forward = cycle.evaluate(profile, bias, new Date());
  assert.equal(forward.nextPhase, 'formulation');

  const advanced = cycle.advanceAll(profile);
  bias = advanced.profile.cognitiveProfile.identifiedBiases[0];
  assert.equal(bias.cyclePhase, 'formulation');
  assert.equal(bias.phaseHistory[bias.phaseHistory.length - 1].reason, 'evidence_threshold_met');

  // Force the bias into a later phase directly (as if it progressed over real weeks) to test regression.
  let record = store.load();
  const target = record.cognitiveProfile.identifiedBiases.find(b => b.type === 'fomo');
  target.cyclePhase = 'behavioral';
  target.phaseHistory.push({ phase: 'behavioral', enteredAt: new Date().toISOString(), reason: 'test-setup', evidenceCountAtEntry: target.evidenceTradeIds.length });
  record = store.save(record);
  record = store.ensureBias(record, 'fomo', ['t4', 't5']);
  const evaluated = cycle.evaluate(record, record.cognitiveProfile.identifiedBiases.find(b => b.type === 'fomo'), new Date());
  assert.equal(evaluated.nextPhase, 'cognitive', 'renewed frequency regresses the pattern exactly one phase');
  assert.equal(evaluated.reasonCode, 'frequency_increased');
});

test('derived behavioral metrics recompute from source trades and drop back to zero once the evidence trade is removed', async () => {
  const window = await withTrades();
  const tradeStore = window.TradeJournalTradeStore;
  const collector = window.TradeJournalMentalHealthCollector;
  const base = Date.now() - 3600000;

  let loss = tradeStore.save(tradeStore.createDraft({ status: 'closed', outcome: 'loss' }));
  loss = tradeStore.find(loss.id);
  loss.closedAt = new Date(base).toISOString();
  loss = tradeStore.save(loss);

  let revengeTrade = tradeStore.save(tradeStore.createDraft({ status: 'closed', outcome: 'loss' }));
  revengeTrade = tradeStore.find(revengeTrade.id);
  revengeTrade.createdAt = new Date(base + 5 * 60000).toISOString();
  revengeTrade.closedAt = new Date(base + 6 * 60000).toISOString();
  revengeTrade.emotionLog = [{ id: 'e1', timestamp: revengeTrade.createdAt, stage: 'exit', dominantEmotions: ['revenge'], stressLevel: 9, focusQuality: 3, planCommitment: 2, wouldTakeIfNotForced: false, note: '' }];
  revengeTrade = tradeStore.save(revengeTrade);

  const result = collector.recompute();
  assert.ok(result.profile.behavioralPatterns.revengeTradingFrequency >= 1, 'a loss followed a few minutes later by a revenge-flavored trade is counted');

  tradeStore.remove(revengeTrade.id);
  const after = collector.recompute();
  assert.equal(after.profile.behavioralPatterns.revengeTradingFrequency, 0, 'removing the evidencing trade brings the metric back down - nothing is accumulated incrementally');
});

test('auto-detected triggers require real supporting evidence and are never surfaced below the run-length threshold', async () => {
  const window = await withTrades();
  const tradeStore = window.TradeJournalTradeStore;
  const collector = window.TradeJournalMentalHealthCollector;
  const base = Date.now() - 5 * 3600000;

  function makeClosed(offsetMinutes, outcome) {
    let trade = tradeStore.save(tradeStore.createDraft({ status: 'closed' }));
    trade = tradeStore.find(trade.id);
    trade.outcome = outcome;
    trade.closedAt = new Date(base + offsetMinutes * 60000).toISOString();
    return tradeStore.save(trade);
  }

  makeClosed(0, 'loss');
  makeClosed(10, 'loss');
  let result = collector.recompute();
  assert.ok(!result.profile.triggerProfile.autoDetectedTriggers.some(t => t.pattern === 'loss_streak'), 'two losses is below the 3-in-a-row threshold');

  makeClosed(20, 'loss');
  result = collector.recompute();
  const streak = result.profile.triggerProfile.autoDetectedTriggers.find(t => t.pattern === 'loss_streak');
  assert.ok(streak, 'three consecutive losses is enough evidence to surface a trigger');
  assert.ok(streak.supportingTradeIds.length > 0, 'every surfaced trigger carries the trades that justify it');
  assert.ok(streak.confidence > 0 && streak.confidence <= 0.95);
});

test('high-stress entries surface a trigger once they repeat, always with supporting trades', async () => {
  const window = await withTrades();
  const tradeStore = window.TradeJournalTradeStore;
  const collector = window.TradeJournalMentalHealthCollector;

  function makeStressed() {
    let trade = tradeStore.save(tradeStore.createDraft({ status: 'open' }));
    return tradeStore.addEmotion(trade.id, { dominantEmotions: [], stressLevel: 9, note: '' });
  }

  makeStressed(); makeStressed();
  let result = collector.recompute();
  assert.ok(!result.profile.triggerProfile.autoDetectedTriggers.some(t => t.pattern === 'high_stress'), 'two high-stress entries is below the threshold');

  makeStressed();
  result = collector.recompute();
  const highStress = result.profile.triggerProfile.autoDetectedTriggers.find(t => t.pattern === 'high_stress');
  assert.ok(highStress, 'three or more high-stress emotion log entries surface a trigger');
  assert.ok(highStress.supportingTradeIds.length > 0, 'every surfaced trigger carries the trades that justify it');
});

test('the activity log merges emotion, thought-record, and phase-transition events in chronological order', async () => {
  const window = await mentalHealthOnly();
  const store = window.TradeJournalMentalHealthStore;
  let profile = store.load();
  profile = store.ensureBias(profile, 'fomo', ['t1']);
  profile.cognitiveProfile.draftThoughtRecord = { automaticThought: 'I must win this back', emotion: 'anxious', evidenceFor: '', evidenceAgainst: '', balancedThought: 'One trade does not define me' };
  profile = store.save(profile);
  profile = store.commitDraftThoughtRecord(profile, 't1', 'fomo');
  const trades = [{ id: 't1', emotionLog: [{ timestamp: new Date().toISOString(), dominantEmotions: ['anxious'], stressLevel: 6 }] }];
  const items = window.TradeJournalMentalHealthReport.buildActivityLog(profile, trades);
  assert.ok(items.some(i => i.type === 'emotion'));
  assert.ok(items.some(i => i.type === 'thought'));
  assert.ok(items.some(i => i.type === 'phase'));
  for (let i = 1; i < items.length; i++) assert.ok(new Date(items[i - 1].timestamp).getTime() >= new Date(items[i].timestamp).getTime(), 'newest first');
});

test('all four character pages load the mental-health module set after psychology-ui.js and before pattern-registry.js', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const psychUi = html.indexOf('psychology-ui.js');
    const types = html.indexOf('mental-health.types.js');
    const uiFile = html.indexOf('mental-health-ui.js');
    const registry = html.indexOf('pattern-registry.js');
    assert.ok(psychUi > -1 && psychUi < types, character + ' mental-health block starts after psychology-ui.js');
    assert.ok(types < uiFile && uiFile < registry, character + ' mental-health block order');
    assert.ok(html.indexOf('mental-health-cards.js') < html.indexOf('mental-health-report.js') && html.indexOf('mental-health-report.js') < html.indexOf('mental-health-scheduler.js'), character + ' mental-health-report.js order');
    assert.ok(html.indexOf('mental-health.css') > html.indexOf('psychology.css'), character + ' mental-health.css order');
    // mental-health-intake.js/.css were retired when the Trading Intake wizard moved to React
    // (navrya-src/mentalHealthIntakeModal.jsx, wired into character-app.jsx's mountCharacterApp);
    // window.TradeJournalMentalHealthIntake now comes from the navrya-{character}-sessions-app.js
    // bundle instead of a page-local <script> tag.
    assert.ok(uiFile < html.indexOf('mental-health-continuous.js') && html.indexOf('mental-health-continuous.js') < html.indexOf('mental-health-profile-page.js') && html.indexOf('mental-health-profile-page.js') < registry, character + ' v2 (continuous/profile-page) script order');
    assert.ok(!html.includes('mental-health-intake.js') && !html.includes('mental-health-intake.css'), character + ' no longer references the retired vanilla intake wizard files');
  }
});

test('a v1 profile (no intake yet) migrates additively to v2: baseline is untouched, tradingExperienceYears/completed map into intake, and the rest is preserved under legacyBaselineV1', async () => {
  const localStorage = memoryStorage();
  const v1Profile = {
    userId: 'local-trader', createdAt: '2025-01-01T00:00:00.000Z', lastUpdatedAt: '2025-01-01T00:00:00.000Z', version: 1,
    baseline: { initialStressLevel: 7, initialEmotionalRegulation: 4, tradingExperienceYears: 3, selfReportedWeaknesses: ['enters too early'], assessmentDate: '2025-01-01T00:00:00.000Z', completed: true },
    emotionalProfile: {}, triggerProfile: { triggers: [], autoDetectedTriggers: [] }, behavioralPatterns: {}, cognitiveProfile: { identifiedBiases: [], thoughtRecords: [] }, progressTracking: {}, activeInterventions: {}, healthReportCache: {}, chatHistory: [], educationCards: {}
  };
  localStorage.setItem('tradejournal:mental-health-profile:v1', JSON.stringify(v1Profile));
  const window = await mentalHealthOnly(localStorage);
  const profile = window.TradeJournalMentalHealthStore.load();
  assert.equal(profile.version, 2);
  assert.equal(profile.baseline.initialStressLevel, 7, 'the original v1 baseline is left exactly as it was - existing charts and the cycle engine still read it');
  assert.equal(profile.baseline.completed, true);
  assert.equal(profile.intake.tradingHistory.yearsTrading, 3, 'a reasonable v1 field maps into its new v2 home');
  assert.equal(profile.intake.completed, true);
  assert.equal(profile.intake.legacyBaselineV1.initialStressLevel, 7, 'anything without a clean v2 home is preserved verbatim, not dropped');
  assert.equal(profile.intake.legacyBaselineV1.selfReportedWeaknesses.length, 1);
  assert.equal(profile.intake.legacyBaselineV1.selfReportedWeaknesses[0], 'enters too early');
});

test('loading with no profile at all (missing v1 and v2) never throws and returns full v2 defaults', async () => {
  const window = await mentalHealthOnly();
  const profile = window.TradeJournalMentalHealthStore.load();
  assert.equal(profile.version, 2);
  assert.equal(profile.intake.completed, false);
  assert.equal(profile.intake.legacyBaselineV1, null);
  assert.equal(profile.psychologicalProfile.biasChecklist.biases.length, 0);
  assert.equal(profile.redFlags.active.length, 0);
});

test('intake suggestions never mutate a field before explicit approval, whether applied via chat or written directly from the profile page', async () => {
  const window = await mentalHealthOnly();
  const store = window.TradeJournalMentalHealthStore;
  let profile = store.load();
  profile = store.addMessage(profile, 'assistant', 'Suggested update', [{ id: 'intake-1', path: 'intake.demographics.age', section: 'intake', value: '29', mode: 'replace', status: 'pending', createdAt: store.now() }]);
  assert.equal(profile.intake.demographics.age, null, 'still pending, so nothing changed yet');
  profile = store.applySuggestion(profile, { id: 'intake-1' }, 'applied');
  assert.equal(profile.intake.demographics.age, 29, 'approving the chat suggestion writes the field');

  // Direct profile-page edit writes through the exact same setPath mechanism, producing the same shape.
  const direct = store.load();
  store.setPath(direct, 'intake.demographics.age', '31');
  const saved = store.save(direct);
  assert.equal(saved.intake.demographics.age, 31);
  assert.equal(typeof saved.intake.demographics.age, typeof profile.intake.demographics.age, 'both paths produce a real number, not a string');
});

test('boolean intake paths (e.g. borrowed money, transparency matrix) are coerced to real booleans, not the strings "true"/"false"', async () => {
  const window = await mentalHealthOnly();
  const store = window.TradeJournalMentalHealthStore;
  let profile = store.load();
  store.setPath(profile, 'intake.financialContext.borrowedMoneyForTrading', 'true');
  assert.equal(profile.intake.financialContext.borrowedMoneyForTrading, true);
  assert.notEqual(profile.intake.financialContext.borrowedMoneyForTrading, 'true');
});

test('B6: intake.demographics.gender round-trips through setPath/save/load, defaults to null on a fresh profile, and is a registered intake path', async () => {
  const window = await mentalHealthOnly();
  const store = window.TradeJournalMentalHealthStore;
  const types = window.TradeJournalMentalHealthTypes;

  const fresh = store.load();
  assert.equal(fresh.intake.demographics.gender, null, 'a brand-new profile has no gender set by default');

  let profile = store.load();
  store.setPath(profile, 'intake.demographics.gender', 'female');
  profile = store.save(profile);
  const reloaded = store.load();
  assert.equal(reloaded.intake.demographics.gender, 'female', 'the value must persist across a save/load round-trip');

  assert.ok(types.intakePaths.indexOf('intake.demographics.gender') > -1, 'gender must be a known suggestion-allowlist path, like the other demographics fields');
});

test('scenario responses are committed through the same draft-then-approve staging object used by thought records and triggers', async () => {
  const window = await mentalHealthOnly();
  const store = window.TradeJournalMentalHealthStore;
  let profile = store.load();
  profile.psychologicalProfile.scenarioAssessment.draftResponse = { choice: 'wait_it_hits', sliderValue: null, freeText: null };
  profile = store.save(profile);
  profile = store.commitDraftScenarioResponse(profile, 'A_stop_loss', 'loss_aversion_discipline');
  assert.equal(profile.psychologicalProfile.scenarioAssessment.responses.length, 1);
  assert.equal(profile.psychologicalProfile.scenarioAssessment.responses[0].choice, 'wait_it_hits');
  const clearedDraft = profile.psychologicalProfile.scenarioAssessment.draftResponse;
  assert.equal(clearedDraft.choice, '', 'the draft is cleared once committed');
  assert.equal(clearedDraft.sliderValue, null);
  assert.equal(clearedDraft.freeText, '');
  // Re-answering the same scenario updates it in place rather than appending a duplicate.
  profile.psychologicalProfile.scenarioAssessment.draftResponse = { choice: 'move_stop_back', sliderValue: null, freeText: null };
  profile = store.save(profile);
  profile = store.commitDraftScenarioResponse(profile, 'A_stop_loss', 'loss_aversion_discipline');
  assert.equal(profile.psychologicalProfile.scenarioAssessment.responses.length, 1);
  assert.equal(profile.psychologicalProfile.scenarioAssessment.responses[0].choice, 'move_stop_back');
});

test('the post-trade cool-down timer is unified: it is derived only from continuousTracking.postTradeReflections and can be dismissed, with no separate heuristic left in the app', async () => {
  const window = await mentalHealthOnly();
  const store = window.TradeJournalMentalHealthStore;
  let profile = store.load();
  const now = new Date();
  profile = store.addPostTradeReflection(profile, 'trade-1', { revengeCheck: { shown: true, choice: 'recover', cooldownTimerStartedAt: new Date(now.getTime() - 60000).toISOString() } });
  const settings = { enabled: true, cooldownMinutes: 15 };
  const active = store.activeCooldownTimer(profile, settings, now);
  assert.equal(active.active, true);
  assert.equal(active.tradeId, 'trade-1');
  profile = store.dismissCooldownTimer(profile);
  assert.equal(store.activeCooldownTimer(profile, settings, now).active, false);

  // Choosing "rest" or "saw a real setup" never starts a timer at all.
  let restProfile = store.load();
  restProfile = store.addPostTradeReflection(restProfile, 'trade-2', { revengeCheck: { shown: true, choice: 'rest', cooldownTimerStartedAt: null } });
  assert.equal(store.activeCooldownTimer(restProfile, settings, now).active, false);
});

test('red flags: borrowed money, escalating revenge trading, and pervasive distress signs always set professionalReferralShown, and addRedFlag never duplicates the same evidence twice', async () => {
  const window = await mentalHealthOnly();
  const store = window.TradeJournalMentalHealthStore;
  let profile = store.load();
  ['borrowed_money', 'escalating_revenge_trading', 'pervasive_distress_signs'].forEach((type) => {
    profile = store.addRedFlag(profile, type, 'evidence:' + type);
  });
  profile.redFlags.active.forEach((flag) => assert.equal(flag.professionalReferralShown, true, flag.type));
  profile = store.addRedFlag(profile, 'borrowed_money', 'evidence:borrowed_money');
  assert.equal(profile.redFlags.active.filter((f) => f.type === 'borrowed_money').length, 1, 'the same evidence is not logged twice');

  profile = store.addRedFlag(profile, 'hiding_losses', 'evidence:hiding_losses');
  const hiding = profile.redFlags.active.find((f) => f.type === 'hiding_losses');
  assert.equal(hiding.professionalReferralShown, false, 'not one of the three mandatory-referral types');
});

test('collector.detectRedFlags surfaces borrowed money and escalating revenge trading straight from real profile data', async () => {
  const window = await withTrades();
  const store = window.TradeJournalMentalHealthStore;
  const collector = window.TradeJournalMentalHealthCollector;
  let profile = store.load();
  profile.intake.financialContext.borrowedMoneyForTrading = true;
  profile.behavioralPatterns.revengeTradingFrequency = 4;
  profile = store.save(profile);
  const flags = collector.detectRedFlags(profile);
  assert.ok(flags.some((f) => f.type === 'borrowed_money'));
  assert.ok(flags.some((f) => f.type === 'escalating_revenge_trading'));
  assert.ok(!flags.some((f) => f.type === 'hiding_losses'), 'transparency answer was never set to false, so this should not fire');
});

test('a flagged (distress) chat/thought-record/intake input records a pervasive_distress_signs red flag automatically, backing the mandatory referral card with real data', async () => {
  const window = await mentalHealthOnly();
  const safety = window.TradeJournalMentalHealthSafety;
  const store = window.TradeJournalMentalHealthStore;
  safety.checkText("I can't cope anymore, it's hopeless");
  const profile = store.load();
  assert.ok(profile.redFlags.active.some((f) => f.type === 'pervasive_distress_signs'));
});

class FakeNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; this.style = {}; }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  addEventListener() {}
  remove() {}
}

test('pre-session check-in fires once per session by wrapping TradeJournalEntryFlow.openEntry, regardless of whether the session already has chart-upload-derived entries; only a recorded check-in stops it firing again', async () => {
  const localStorage = memoryStorage();
  const sandbox = baseSandbox(localStorage);
  Object.assign(sandbox, {
    document: { createElement: tag => new FakeNode(tag), createTextNode: text => { const node = new FakeNode('#text'); node.textContent = text; return node; }, documentElement: { lang: 'en' }, body: new FakeNode('body'), addEventListener() {} },
    MutationObserver: class { observe() {} }
  });
  sandbox.window = Object.assign(sandbox.window, { document: sandbox.document, TradeJournalPsychologyStore: undefined });
  await loadInto(sandbox, ['mental-health.types.js', 'mental-health-i18n.js', 'mental-health-safety.js', 'mental-health-store.js']);

  const calls = [];
  sandbox.window.TradeJournalEntryFlow = { openEntry: (api, session, type) => calls.push([session.id, type]) };
  vm.runInNewContext(await source('mental-health-continuous.js'), sandbox, { filename: 'mental-health-continuous.js' });

  // Created with no upload at session-creation time: entries starts empty.
  const emptySession = { id: 'session-1', entries: [] };
  sandbox.window.TradeJournalEntryFlow.openEntry(null, emptySession, 'chart');
  assert.deepEqual(calls, [], 'a brand-new session with no entries yet is intercepted by the check-in popup instead of going straight through');

  // Created WITH an at-creation chart upload: session-workspace-logic.js's normalize()
  // already turned session.charts into a stub entries[] item before openEntry is ever
  // manually triggered. entries.length is an implementation artifact, not evidence a
  // check-in happened - this exact case was the original bug, so it must still intercept.
  const sessionWithChartStub = { id: 'session-2', entries: [{ id: 'entry-from-chart-upload', type: 'chart' }] };
  sandbox.window.TradeJournalEntryFlow.openEntry(null, sessionWithChartStub, 'chart');
  assert.deepEqual(calls, [], 'a session whose entries were pre-populated from an at-creation chart upload must still be intercepted');

  const profile = sandbox.window.TradeJournalMentalHealthStore.load();
  profile.continuousTracking.preSessionCheckIns.push(
    { id: 'c1', sessionId: 'session-1', sleepQuality: 5, currentStressLevel: 5, somethingToProveToday: false, significantPersonalEvent: null, createdAt: new Date().toISOString() },
    { id: 'c2', sessionId: 'session-2', sleepQuality: 5, currentStressLevel: 5, somethingToProveToday: false, significantPersonalEvent: null, createdAt: new Date().toISOString() }
  );
  sandbox.window.TradeJournalMentalHealthStore.save(profile);
  sandbox.window.TradeJournalEntryFlow.openEntry(null, emptySession, 'chart');
  sandbox.window.TradeJournalEntryFlow.openEntry(null, sessionWithChartStub, 'chart');
  assert.deepEqual(calls, [['session-1', 'chart'], ['session-2', 'chart']], 'once a check-in is recorded for a session, later opens for that session pass straight through - exactly once per session');
});
