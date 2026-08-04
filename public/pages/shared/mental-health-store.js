(function () {
  'use strict';
  var KEY = 'tradejournal:mental-health-profile:v2';
  var LEGACY_KEY = 'tradejournal:mental-health-profile:v1';
  var USER_ID = 'local-trader';

  function uid(prefix) { return (prefix || 'mh') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }
  function now() { return new Date().toISOString(); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function types() { return window.TradeJournalMentalHealthTypes || { numericPaths: [], booleanPaths: [], arrayAppendPaths: [], mandatoryReferralRedFlags: [], scenarioIds: [] }; }

  function empty() {
    var stamp = now();
    return {
      userId: USER_ID, createdAt: stamp, lastUpdatedAt: stamp, version: 2,
      baseline: { initialStressLevel: 5, initialEmotionalRegulation: 5, tradingExperienceYears: 0, selfReportedWeaknesses: [], assessmentDate: stamp, completed: false },
      emotionalProfile: { dominantNegativeEmotions: [], dominantPositiveEmotions: [], emotionalVolatilityScore: 0, averageStressLevel: 0, stressTrend: 'stable' },
      triggerProfile: { triggers: [], autoDetectedTriggers: [], draftTrigger: { description: '', triggerType: 'custom', recommendedAction: '' } },
      behavioralPatterns: { revengeTradingFrequency: 0, overTradingEpisodes: 0, planDeviationRate: 0, cooldownComplianceRate: 0, preChecklistCompletionRate: 0 },
      cognitiveProfile: { identifiedBiases: [], biasStrengthScores: {}, lastCognitiveRestructuringDate: null, thoughtRecords: [], draftThoughtRecord: { automaticThought: '', emotion: '', evidenceFor: '', evidenceAgainst: '', balancedThought: '' } },
      progressTracking: { weeklySnapshots: [], milestones: [], currentPhase: 'assessment', overallProgressScore: 0 },
      activeInterventions: { cooldownTimerEnabled: true, cooldownDurationMinutes: 5, preTradeChecklistEnabled: false, checklistItems: [], alertThresholds: [] },
      healthReportCache: { lastGeneratedAt: null, weeklyScore: 0, monthlyScore: 0, winRateByStressLevel: {}, emotionOutcomeCorrelations: [] },
      chatHistory: [], educationCards: {},
      intake: {
        completed: false, completedAt: null, filledVia: 'form',
        demographics: { age: null, gender: null, maritalStatus: null, primaryOccupation: null, isFullTimeTrader: null },
        financialContext: { capitalType: null, capitalAllocationPercent: null, borrowedMoneyForTrading: null },
        tradingHistory: { yearsTrading: null, marketsTraded: [], largestWin: { amount: null, percent: null }, largestLoss: { amount: null, percent: null }, marginCallOrZeroedCount: null },
        motivationForTrading: null, firstBigLossReaction: null,
        transparencyMatrix: { profitKnownToFamily: null, lossKnownToFamily: null, capitalKnownToFamily: null, tradingActivityKnownToFamily: null },
        legacyBaselineV1: null
      },
      psychologicalProfile: {
        standardizedTests: { bigFive: null, riskToleranceScale: null, bis11Impulsivity: null, sogsGamblingScreen: null },
        scenarioAssessment: { completedAt: null, responses: [], draftResponse: { choice: '', sliderValue: null, freeText: '' } },
        biasChecklist: { lastAssessedAt: null, biases: [] }
      },
      continuousTracking: { preSessionCheckIns: [], preTradeContext: [], postTradeReflections: [], monthlyCorrelationReports: [] },
      redFlags: { active: [], resolved: [] }
    };
  }

  function normalizeBias(bias) {
    var base = { type: 'fomo', firstDetectedAt: now(), evidenceTradeIds: [], status: 'active', cyclePhase: 'assessment', phaseHistory: [] };
    return Object.assign(base, bias || {}, { evidenceTradeIds: array((bias || {}).evidenceTradeIds), phaseHistory: array((bias || {}).phaseHistory) });
  }

  function normalize(value) {
    var src = value && typeof value === 'object' ? value : {};
    var base = empty();
    var record = Object.assign({}, base, src);
    ['baseline', 'emotionalProfile', 'triggerProfile', 'behavioralPatterns', 'cognitiveProfile', 'progressTracking', 'activeInterventions', 'healthReportCache', 'intake', 'psychologicalProfile', 'continuousTracking', 'redFlags'].forEach(function (key) {
      record[key] = Object.assign({}, base[key], src[key] || {});
    });
    record.baseline.selfReportedWeaknesses = array(record.baseline.selfReportedWeaknesses);
    record.triggerProfile.triggers = array(record.triggerProfile.triggers);
    record.triggerProfile.autoDetectedTriggers = array(record.triggerProfile.autoDetectedTriggers);
    record.triggerProfile.draftTrigger = Object.assign({}, base.triggerProfile.draftTrigger, (src.triggerProfile || {}).draftTrigger || {});
    record.cognitiveProfile.identifiedBiases = array(record.cognitiveProfile.identifiedBiases).map(normalizeBias);
    record.cognitiveProfile.thoughtRecords = array(record.cognitiveProfile.thoughtRecords);
    record.cognitiveProfile.draftThoughtRecord = Object.assign({}, base.cognitiveProfile.draftThoughtRecord, (src.cognitiveProfile || {}).draftThoughtRecord || {});
    record.progressTracking.weeklySnapshots = array(record.progressTracking.weeklySnapshots);
    record.progressTracking.milestones = array(record.progressTracking.milestones);
    record.activeInterventions.checklistItems = array(record.activeInterventions.checklistItems);
    record.activeInterventions.alertThresholds = array(record.activeInterventions.alertThresholds);
    record.healthReportCache.emotionOutcomeCorrelations = array(record.healthReportCache.emotionOutcomeCorrelations);
    record.chatHistory = array(record.chatHistory);
    record.educationCards = src.educationCards && typeof src.educationCards === 'object' ? src.educationCards : {};

    // --- v2 nested defaults ---
    var srcIntake = src.intake || {};
    record.intake.demographics = Object.assign({}, base.intake.demographics, srcIntake.demographics || {});
    record.intake.financialContext = Object.assign({}, base.intake.financialContext, srcIntake.financialContext || {});
    record.intake.tradingHistory = Object.assign({}, base.intake.tradingHistory, srcIntake.tradingHistory || {});
    record.intake.tradingHistory.largestWin = Object.assign({}, base.intake.tradingHistory.largestWin, (srcIntake.tradingHistory || {}).largestWin || {});
    record.intake.tradingHistory.largestLoss = Object.assign({}, base.intake.tradingHistory.largestLoss, (srcIntake.tradingHistory || {}).largestLoss || {});
    record.intake.tradingHistory.marketsTraded = array(record.intake.tradingHistory.marketsTraded);
    record.intake.transparencyMatrix = Object.assign({}, base.intake.transparencyMatrix, srcIntake.transparencyMatrix || {});

    // v1 -> v2 migration: additive only, runs once (when a stored profile has no `intake` yet).
    // `baseline` itself is never modified - existing charts and the 7-phase cycle engine keep reading it.
    if (!src.intake && src.baseline) {
      if (record.intake.tradingHistory.yearsTrading == null) record.intake.tradingHistory.yearsTrading = src.baseline.tradingExperienceYears || null;
      record.intake.completed = !!src.baseline.completed;
      record.intake.completedAt = src.baseline.completed ? (src.baseline.assessmentDate || null) : null;
      record.intake.legacyBaselineV1 = src.baseline;
    }

    record.psychologicalProfile.standardizedTests = Object.assign({}, base.psychologicalProfile.standardizedTests, (src.psychologicalProfile || {}).standardizedTests || {});
    record.psychologicalProfile.scenarioAssessment = Object.assign({}, base.psychologicalProfile.scenarioAssessment, (src.psychologicalProfile || {}).scenarioAssessment || {});
    record.psychologicalProfile.scenarioAssessment.responses = array(record.psychologicalProfile.scenarioAssessment.responses);
    record.psychologicalProfile.scenarioAssessment.draftResponse = Object.assign({}, base.psychologicalProfile.scenarioAssessment.draftResponse, ((src.psychologicalProfile || {}).scenarioAssessment || {}).draftResponse || {});
    record.psychologicalProfile.biasChecklist = Object.assign({}, base.psychologicalProfile.biasChecklist, (src.psychologicalProfile || {}).biasChecklist || {});
    record.psychologicalProfile.biasChecklist.biases = array(record.psychologicalProfile.biasChecklist.biases);

    record.continuousTracking.preSessionCheckIns = array(record.continuousTracking.preSessionCheckIns);
    record.continuousTracking.preTradeContext = array(record.continuousTracking.preTradeContext);
    record.continuousTracking.postTradeReflections = array(record.continuousTracking.postTradeReflections);
    record.continuousTracking.monthlyCorrelationReports = array(record.continuousTracking.monthlyCorrelationReports);
    record.redFlags.active = array(record.redFlags.active);
    record.redFlags.resolved = array(record.redFlags.resolved);

    record.version = 2;
    record.userId = USER_ID;
    return record;
  }

  function write(profile) {
    profile.lastUpdatedAt = now();
    localStorage.setItem(KEY, JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent('tradejournal:mental-health-changed'));
    if (window.TradeJournalSyncQueue) window.TradeJournalSyncQueue.enqueue('mental-health', 'profile', profile);
    return profile;
  }
  function save(profile) { return write(normalize(profile)); }

  // --- Server sync (Module 5, final module, of the local-first-to-server migration; see
  // ARCHITECTURE.md's Global Data Sync section, 7.18). Same shape as the other four synced
  // stores' sync blocks, adapted for a single-document store: every mutation in this file
  // funnels through write() above (there is no separate create()/remove() the way the list-
  // shaped modules have), so that one call site is the only enqueue hook this module needs.
  // TradeJournalDevUserSwitcher is looked up live (never cached), for the same consistency
  // reason as trade-store.js's identical comment.
  (function () {
    var queue = window.TradeJournalSyncQueue;
    if (!queue) return;
    function devUser() { return window.TradeJournalDevUserSwitcher; }

    queue.registerModule('mental-health', function (entry) {
      var switcher = devUser(); var uid = switcher && switcher.currentUserId();
      if (!uid) throw new Error('NO_CURRENT_USER');
      return fetch('/api/sync/mental-health', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user-id': uid },
        body: JSON.stringify(entry.payload)
      }).then(function (response) { if (!response.ok) throw new Error('SYNC_FAILED'); });
    });

    // Written straight to localStorage, bypassing write() above - going through write() here
    // would re-enqueue the exact data that just arrived FROM the server, a pointless round trip
    // (harmless, since it's idempotent, but wasteful on every single reconcile/migrate call).
    function storeLocally(profile) {
      var normalized = normalize(profile);
      localStorage.setItem(KEY, JSON.stringify(normalized));
      window.dispatchEvent(new CustomEvent('tradejournal:mental-health-changed'));
      return normalized;
    }

    // There is no per-record id to merge by (unlike the four list-shaped modules) - this is one
    // document, so "server wins on conflict" becomes "whichever copy's lastUpdatedAt is newer
    // wins," which also protects a just-made offline edit from being clobbered by a reconcile
    // that runs moments later.
    function mergeServerProfile(serverProfile) {
      if (!serverProfile) return;
      var raw = localStorage.getItem(KEY);
      var local = raw ? JSON.parse(raw) : null;
      if (!local || !local.lastUpdatedAt || new Date(serverProfile.lastUpdatedAt || 0) > new Date(local.lastUpdatedAt)) storeLocally(serverProfile);
    }

    function reconcileFromServer() {
      var switcher = devUser(); var uid = switcher && switcher.currentUserId();
      if (!uid) return;
      fetch('/api/sync/mental-health', { headers: { 'x-dev-user-id': uid } })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (result) { if (result) mergeServerProfile(result.profile); })
        .catch(function () { /* offline - the local cache stands as-is until the next reconnect */ });
    }

    // Checks the server BEFORE deciding whether to push local data up - same "adopt vs. push"
    // sequencing as the other four modules' migrateOrAdopt(). If there is no local profile yet
    // either (a genuinely fresh browser that has never called save()), there is nothing to push;
    // the flag is still set so this check doesn't repeat every page load.
    function migrateOrAdopt() {
      var switcher = devUser(); var uid = switcher && switcher.currentUserId();
      if (!uid) return;
      var flagKey = 'tradejournal:mental-health-migrated:v1:' + uid;
      if (localStorage.getItem(flagKey)) { reconcileFromServer(); return; }
      fetch('/api/sync/mental-health', { headers: { 'x-dev-user-id': uid } })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (result) {
          if (result && result.profile) {
            storeLocally(result.profile);
          } else {
            var raw = localStorage.getItem(KEY);
            if (raw) queue.enqueue('mental-health', 'profile', JSON.parse(raw));
          }
          localStorage.setItem(flagKey, new Date().toISOString());
        })
        .catch(function () { /* offline - try again next time this runs (flag not yet set) */ });
    }

    // Deferred to the next tick anyway (see trade-store.js's identical comment), for consistency
    // with the other four synced stores, even though dev-user-switcher.js already loads before
    // this file in the existing script order.
    window.setTimeout(migrateOrAdopt, 0);
    window.addEventListener('online', reconcileFromServer);
  }());
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
      var legacy = localStorage.getItem(LEGACY_KEY);
      return normalize(legacy ? JSON.parse(legacy) : {});
    } catch (_) { return normalize({}); }
  }

  function getPath(profile, path) { return path.split('.').reduce(function (value, key) { return value && value[key]; }, profile); }
  function setPath(profile, path, value) {
    var keys = path.split('.'), target = profile;
    keys.slice(0, -1).forEach(function (key) { target = target[key]; });
    var leaf = keys[keys.length - 1], t = types();
    target[leaf] = t.numericPaths.indexOf(path) > -1 ? Number(value) : t.booleanPaths.indexOf(path) > -1 ? (value === true || value === 'true') : String(value == null ? '' : value);
    return profile;
  }
  function setArrayPath(profile, path, values) {
    var keys = path.split('.'), target = profile;
    keys.slice(0, -1).forEach(function (key) { target = target[key]; });
    target[keys[keys.length - 1]] = values;
    return profile;
  }

  function addMessage(profile, role, content, suggestions) {
    var record = normalize(profile);
    record.chatHistory.push({ id: uid('mh-chat'), role: role, content: String(content || ''), createdAt: now(), suggestions: suggestions || [] });
    return save(record);
  }

  function applySuggestion(profile, suggestion, status) {
    var record = normalize(profile), target = null;
    (record.chatHistory || []).some(function (message) {
      return (message.suggestions || []).some(function (item) { if (item.id === suggestion.id) { target = item; return true; } return false; });
    });
    if (!target) return record;
    target.status = status;
    if (status === 'applied') {
      if (types().arrayAppendPaths.indexOf(target.path) > -1) {
        var current = array(getPath(record, target.path)), next = String(target.value == null ? '' : target.value);
        setArrayPath(record, target.path, target.mode === 'replace' ? [next] : current.concat([next]));
      } else {
        setPath(record, target.path, target.value);
      }
    }
    return save(record);
  }

  function commitDraftThoughtRecord(profile, tradeId, relatedBiasType) {
    var record = normalize(profile), draft = record.cognitiveProfile.draftThoughtRecord;
    if (!draft.automaticThought && !draft.balancedThought) return record;
    record.cognitiveProfile.thoughtRecords.push({
      id: uid('thought'), tradeId: tradeId || null, timestamp: now(),
      automaticThought: draft.automaticThought || '', emotion: draft.emotion || '',
      evidenceFor: draft.evidenceFor || '', evidenceAgainst: draft.evidenceAgainst || '',
      balancedThought: draft.balancedThought || '', source: 'form', relatedBiasType: relatedBiasType || null
    });
    record.cognitiveProfile.lastCognitiveRestructuringDate = now();
    record.cognitiveProfile.draftThoughtRecord = { automaticThought: '', emotion: '', evidenceFor: '', evidenceAgainst: '', balancedThought: '' };
    return save(record);
  }

  function commitDraftTrigger(profile) {
    var record = normalize(profile), draft = record.triggerProfile.draftTrigger;
    if (!draft.description) return record;
    record.triggerProfile.triggers.push({
      id: uid('trigger'), description: draft.description, triggerType: draft.triggerType || 'custom',
      detectedCount: 0, lastTriggeredAt: now(), recommendedAction: draft.recommendedAction || '', source: 'user'
    });
    record.triggerProfile.draftTrigger = { description: '', triggerType: 'custom', recommendedAction: '' };
    return save(record);
  }

  function addMilestone(profile, title, relatedBiasType) {
    var record = normalize(profile);
    record.progressTracking.milestones.push({ id: uid('milestone'), title: title, achievedAt: now(), relatedBiasType: relatedBiasType || null });
    return save(record);
  }

  function recordPhaseTransition(profile, biasType, phase, reason) {
    var record = normalize(profile), bias = record.cognitiveProfile.identifiedBiases.find(function (b) { return b.type === biasType; });
    if (!bias) return record;
    bias.cyclePhase = phase;
    bias.phaseHistory.push({ phase: phase, enteredAt: now(), reason: String(reason || '') });
    return save(record);
  }

  function ensureBias(profile, biasType, evidenceTradeIds) {
    var record = normalize(profile), bias = record.cognitiveProfile.identifiedBiases.find(function (b) { return b.type === biasType; });
    if (!bias) {
      bias = { type: biasType, firstDetectedAt: now(), evidenceTradeIds: [], status: 'active', cyclePhase: 'assessment', phaseHistory: [{ phase: 'assessment', enteredAt: now(), reason: 'first detected' }] };
      record.cognitiveProfile.identifiedBiases.push(bias);
    }
    (evidenceTradeIds || []).forEach(function (id) { if (bias.evidenceTradeIds.indexOf(id) === -1) bias.evidenceTradeIds.push(id); });
    return save(record);
  }

  // --- v2: continuous tracking ---
  function addPreSessionCheckIn(profile, sessionId, data) {
    var record = normalize(profile);
    record.continuousTracking.preSessionCheckIns.push(Object.assign({
      id: uid('checkin'), sessionId: sessionId, sleepQuality: 5, currentStressLevel: 5, somethingToProveToday: false, significantPersonalEvent: null
    }, data || {}, { createdAt: now() }));
    return save(record);
  }

  function addPreTradeContext(profile, tradeId, data) {
    var record = normalize(profile);
    record.continuousTracking.preTradeContext.push(Object.assign({
      id: uid('pretrade'), tradeId: tradeId, sleepQuality: 5, significantPersonalEvent: null
    }, data || {}, { createdAt: now() }));
    return save(record);
  }

  function addPostTradeReflection(profile, tradeId, data) {
    var record = normalize(profile);
    record.continuousTracking.postTradeReflections.push(Object.assign({
      id: uid('posttrade'), tradeId: tradeId, emotionThermometer: [], setupQualityRating: 5, planAdherenceRating: 5, emotionManagementRating: 5,
      deviatedFromPlan: 'none', deviationReason: null, wouldTakeAgain: 'unsure', revengeCheck: null, sentenceOfTheDay: null
    }, data || {}, { createdAt: now() }));
    return save(record);
  }

  function activeCooldownTimer(profile, settings, atTime) {
    atTime = atTime || new Date();
    var minutes = (settings && settings.cooldownMinutes) || 15;
    var reflections = profile.continuousTracking.postTradeReflections || [];
    var last = reflections[reflections.length - 1];
    if (!last || !last.revengeCheck || !last.revengeCheck.cooldownTimerStartedAt) return { active: false };
    var elapsed = atTime.getTime() - new Date(last.revengeCheck.cooldownTimerStartedAt).getTime();
    var totalMs = minutes * 60000;
    if (elapsed < 0 || elapsed >= totalMs) return { active: false };
    return { active: true, tradeId: last.tradeId, remainingMs: totalMs - elapsed };
  }

  function dismissCooldownTimer(profile) {
    var record = normalize(profile);
    var last = record.continuousTracking.postTradeReflections[record.continuousTracking.postTradeReflections.length - 1];
    if (last && last.revengeCheck) last.revengeCheck.cooldownTimerStartedAt = null;
    return save(record);
  }

  // --- v2: scenario assessment ---
  function commitDraftScenarioResponse(profile, scenarioId, measuresConstruct) {
    var record = normalize(profile), draft = record.psychologicalProfile.scenarioAssessment.draftResponse;
    if (!draft.choice && draft.sliderValue == null && !draft.freeText) return record;
    var responses = record.psychologicalProfile.scenarioAssessment.responses;
    var existingIndex = responses.findIndex(function (r) { return r.scenarioId === scenarioId; });
    var response = {
      scenarioId: scenarioId, choice: draft.choice || '', sliderValue: draft.sliderValue == null ? null : Number(draft.sliderValue),
      freeText: draft.freeText || null, measuresConstruct: measuresConstruct || '', respondedAt: now()
    };
    if (existingIndex > -1) responses[existingIndex] = response; else responses.push(response);
    record.psychologicalProfile.scenarioAssessment.draftResponse = { choice: '', sliderValue: null, freeText: '' };
    if (responses.length >= types().scenarioIds.length) record.psychologicalProfile.scenarioAssessment.completedAt = now();
    return save(record);
  }

  // --- v2: bias checklist ---
  function saveBiasChecklist(profile, biases) {
    var record = normalize(profile);
    record.psychologicalProfile.biasChecklist = { lastAssessedAt: now(), biases: biases || [] };
    return save(record);
  }

  // --- v2: red flags ---
  function addRedFlag(profile, type, evidence) {
    var record = normalize(profile);
    var already = record.redFlags.active.some(function (f) { return f.type === type && f.evidence === evidence; });
    if (already) return record;
    record.redFlags.active.push({ id: uid('flag'), type: type, detectedAt: now(), evidence: String(evidence || ''), status: 'active', professionalReferralShown: types().mandatoryReferralRedFlags.indexOf(type) > -1 });
    return save(record);
  }

  function resolveRedFlag(profile, flagId) {
    var record = normalize(profile);
    var idx = record.redFlags.active.findIndex(function (f) { return f.id === flagId; });
    if (idx === -1) return record;
    var flag = record.redFlags.active.splice(idx, 1)[0];
    flag.status = 'resolved';
    record.redFlags.resolved.push(flag);
    return save(record);
  }

  window.TradeJournalMentalHealthStore = {
    key: KEY, uid: uid, now: now, load: load, save: save, normalize: normalize,
    getPath: getPath, setPath: setPath,
    addMessage: addMessage, applySuggestion: applySuggestion,
    commitDraftThoughtRecord: commitDraftThoughtRecord, commitDraftTrigger: commitDraftTrigger,
    addMilestone: addMilestone, recordPhaseTransition: recordPhaseTransition, ensureBias: ensureBias,
    addPreSessionCheckIn: addPreSessionCheckIn, addPreTradeContext: addPreTradeContext, addPostTradeReflection: addPostTradeReflection,
    activeCooldownTimer: activeCooldownTimer, dismissCooldownTimer: dismissCooldownTimer,
    commitDraftScenarioResponse: commitDraftScenarioResponse, saveBiasChecklist: saveBiasChecklist,
    addRedFlag: addRedFlag, resolveRedFlag: resolveRedFlag
  };
}());
