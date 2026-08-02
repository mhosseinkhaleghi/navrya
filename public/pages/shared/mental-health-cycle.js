(function () {
  'use strict';
  var mhStore = window.TradeJournalMentalHealthStore;
  var types = window.TradeJournalMentalHealthTypes;
  if (!mhStore || !types) return;

  var THRESHOLDS = { formulationMinEvidence: 3, cognitiveMinThoughtRecords: 2, behavioralMinDays: 7, monitoringMinImprovingSnapshots: 2, regressionMinNewEvidence: 2 };
  var DAY_MS = 86400000;

  function lastEntry(bias) { return bias.phaseHistory.length ? bias.phaseHistory[bias.phaseHistory.length - 1] : null; }
  function thoughtRecordsFor(profile, biasType) { return (profile.cognitiveProfile.thoughtRecords || []).filter(function (r) { return r.relatedBiasType === biasType; }); }

  /**
   * Local, deterministic, explainable phase evaluation - the default (and only shipped) implementation
   * of the TradeJournalMentalHealthCycleProvider seam. Every branch returns a reasonCode, not raw prose,
   * so the UI localizes the "why" instead of storing English sentences in data.
   */
  function localEvaluate(profile, bias, now) {
    now = now || new Date();
    var entry = lastEntry(bias);
    var enteredAt = entry ? new Date(entry.enteredAt) : new Date(bias.firstDetectedAt);
    var order = types.supportPhases, idx = order.indexOf(bias.cyclePhase);

    var evidenceAtEntry = entry && typeof entry.evidenceCountAtEntry === 'number' ? entry.evidenceCountAtEntry : bias.evidenceTradeIds.length;
    if (idx > order.indexOf('cognitive') && bias.evidenceTradeIds.length - evidenceAtEntry >= THRESHOLDS.regressionMinNewEvidence) {
      return { nextPhase: order[idx - 1], reasonCode: 'frequency_increased' };
    }

    if (bias.cyclePhase === 'assessment') {
      if (profile.intake.completed && bias.evidenceTradeIds.length >= THRESHOLDS.formulationMinEvidence) return { nextPhase: 'formulation', reasonCode: 'evidence_threshold_met' };
      return null;
    }
    if (bias.cyclePhase === 'formulation') {
      if (profile.educationCards && profile.educationCards[bias.type]) return { nextPhase: 'psychoeducation', reasonCode: 'card_generated' };
      return null;
    }
    if (bias.cyclePhase === 'psychoeducation') {
      var card = profile.educationCards && profile.educationCards[bias.type];
      if (card && card.viewedAt) return { nextPhase: 'cognitive', reasonCode: 'card_viewed' };
      return null;
    }
    if (bias.cyclePhase === 'cognitive') {
      if (thoughtRecordsFor(profile, bias.type).length >= THRESHOLDS.cognitiveMinThoughtRecords) return { nextPhase: 'behavioral', reasonCode: 'thought_records_logged' };
      return null;
    }
    if (bias.cyclePhase === 'behavioral') {
      if (now.getTime() - enteredAt.getTime() >= THRESHOLDS.behavioralMinDays * DAY_MS) return { nextPhase: 'monitoring', reasonCode: 'behavioral_duration_met' };
      return null;
    }
    if (bias.cyclePhase === 'monitoring') {
      var scoreAtEntry = entry && typeof entry.progressScoreAtEntry === 'number' ? entry.progressScoreAtEntry : 0;
      var snapshots = profile.progressTracking.weeklySnapshots.slice(-THRESHOLDS.monitoringMinImprovingSnapshots);
      if (snapshots.length >= THRESHOLDS.monitoringMinImprovingSnapshots && snapshots.every(function (s) { return s.progressScore >= scoreAtEntry; })) {
        return { nextPhase: 'relapse_prevention', reasonCode: 'snapshots_improving' };
      }
      return null;
    }
    return null;
  }

  window.TradeJournalMentalHealthCycleProvider = window.TradeJournalMentalHealthCycleProvider || { evaluate: localEvaluate };

  function evaluate(profile, bias, now) { return window.TradeJournalMentalHealthCycleProvider.evaluate(profile, bias, now); }

  function advanceAll(profile, now) {
    now = now || new Date();
    var transitions = [];
    (profile.cognitiveProfile.identifiedBiases || []).forEach(function (bias) {
      var result = evaluate(profile, bias, now);
      if (!result || result.nextPhase === bias.cyclePhase) return;
      transitions.push({ biasType: bias.type, from: bias.cyclePhase, to: result.nextPhase, reasonCode: result.reasonCode });
      profile = mhStore.recordPhaseTransition(profile, bias.type, result.nextPhase, result.reasonCode);
      var updatedBias = profile.cognitiveProfile.identifiedBiases.find(function (b) { return b.type === bias.type; });
      if (updatedBias) {
        var entry = lastEntry(updatedBias);
        entry.evidenceCountAtEntry = updatedBias.evidenceTradeIds.length;
        entry.progressScoreAtEntry = profile.progressTracking.overallProgressScore || 0;
        profile = mhStore.save(profile);
      }
    });
    return { profile: profile, transitions: transitions };
  }

  window.TradeJournalMentalHealthCycle = { evaluate: evaluate, advanceAll: advanceAll, thresholds: THRESHOLDS, phaseOrder: types.supportPhases };
}());
