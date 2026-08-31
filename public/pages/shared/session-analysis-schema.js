/**
 * Session Analysis Schema — Adaptive AI Session Analysis (brief §8/§9/§2/§4).
 *
 * Pure, deterministic, DOM-free logic shared by sessionAiAnalysisModal.jsx, liveSessionView.jsx
 * and sessionAnalysisCard.jsx: normalizing a raw provider response into a safe-to-render shape,
 * deterministically compacting it into Session Memory, building a cache fingerprint, and resolving
 * AUTO depth. Nothing in this file makes a network call or reads a React/DOM API - kept
 * unit-testable in plain Node (see tests/session-analysis-schema.test.mjs) the same way
 * session-signature-engine.js's own pure compare() is.
 *
 * "NAVRYA controls the analytical contract, the model controls the analytical expression" (brief
 * header principle) is enforced here concretely: every field below is defensively defaulted so a
 * malformed/partial response (most likely from Kimi/DeepSeek, this app's two non-strict-JSON-
 * schema providers - server/pattern-ai-server.mjs only asserts top-level required keys for those,
 * not the full nested shape) can never crash the card - an unrecognized `block.type` renders
 * through the safe 'custom' fallback rather than being silently dropped (brief §40 test 15).
 */
(function () {
  'use strict';

  var VERSION = 1;
  var BLOCK_TYPES = ['observation', 'interpretation', 'change', 'market_structure', 'momentum', 'key_zones', 'market_tension', 'historical_context', 'pattern_context', 'invalidation', 'warning', 'uncertainty', 'watchlist', 'model_insight', 'custom'];
  var SCENARIO_KINDS = ['continuation', 'reversal', 'range', 'breakout', 'failed_breakout', 'liquidity_event', 'volatility_expansion', 'wait', 'custom'];
  var SCENARIO_ROLES = ['primary', 'alternative', 'tail_risk'];
  var SCENARIO_STATUSES = ['pending', 'strengthened', 'weakened', 'partially_confirmed', 'confirmed', 'invalidated'];
  var ANALYSIS_TYPES = ['initial', 'update', 'scenario_evaluation'];
  var LEVELS = ['low', 'medium', 'high'];

  function str(v) { return typeof v === 'string' ? v : ''; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, fallback) { return typeof v === 'number' && isFinite(v) ? v : fallback; }
  function bool(v) { return !!v; }
  function oneOf(list, v, fallback) { return list.indexOf(v) > -1 ? v : fallback; }
  function randomId(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function normalizeZone(raw) {
    return { range: str(raw && raw.range), label: str(raw && raw.label), whyItMatters: str(raw && raw.whyItMatters) };
  }

  function normalizeBlock(raw) {
    return {
      id: str(raw && raw.id) || randomId('block'),
      type: oneOf(BLOCK_TYPES, raw && raw.type, 'custom'),
      title: str(raw && raw.title),
      importance: oneOf(LEVELS, raw && raw.importance, 'medium'),
      summary: str(raw && raw.summary),
      items: arr(raw && raw.items).map(str).slice(0, 8),
      tensionA: str(raw && raw.tensionA),
      tensionB: str(raw && raw.tensionB),
      zones: arr(raw && raw.zones).map(normalizeZone).slice(0, 6)
    };
  }

  function normalizeVisualizationBrief(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    return {
      primaryPath: arr(source.primaryPath).map(str).slice(0, 6),
      alternativePath: arr(source.alternativePath).map(str).slice(0, 6),
      triggerZone: str(source.triggerZone),
      invalidationZone: str(source.invalidationZone),
      targetZones: arr(source.targetZones).map(str).slice(0, 4),
      narrative: str(source.narrative)
    };
  }

  function normalizeScenario(raw) {
    return {
      localKey: str(raw && raw.localKey) || randomId('scenario'),
      title: str(raw && raw.title),
      role: oneOf(SCENARIO_ROLES, raw && raw.role, 'primary'),
      kind: oneOf(SCENARIO_KINDS, raw && raw.kind, 'custom'),
      direction: oneOf(['long', 'short', 'neutral'], raw && raw.direction, 'neutral'),
      summary: str(raw && raw.summary),
      probability: Math.max(0, Math.min(100, num(raw && raw.probability, 50))),
      confidence: oneOf(LEVELS, raw && raw.confidence, 'medium'),
      trigger: str(raw && raw.trigger),
      invalidation: str(raw && raw.invalidation),
      confirmations: arr(raw && raw.confirmations).map(str).slice(0, 5),
      evidenceFor: arr(raw && raw.evidenceFor).map(str).slice(0, 5),
      evidenceAgainst: arr(raw && raw.evidenceAgainst).map(str).slice(0, 5),
      visualizationBrief: normalizeVisualizationBrief(raw && raw.visualizationBrief)
    };
  }

  function normalizeScenarioEvaluation(raw) {
    return {
      scenarioId: str(raw && raw.scenarioId),
      status: oneOf(SCENARIO_STATUSES, raw && raw.status, 'pending'),
      newProbability: Math.max(0, Math.min(100, num(raw && raw.newProbability, 50))),
      whatHappened: str(raw && raw.whatHappened),
      confirmedBy: arr(raw && raw.confirmedBy).map(str).slice(0, 5),
      contradictedBy: arr(raw && raw.contradictedBy).map(str).slice(0, 5),
      remainsUnresolved: arr(raw && raw.remainsUnresolved).map(str).slice(0, 5),
      triggerOccurred: bool(raw && raw.triggerOccurred),
      invalidationOccurred: bool(raw && raw.invalidationOccurred)
    };
  }

  function normalizeMemory(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    return {
      currentThesis: str(source.currentThesis),
      marketState: str(source.marketState),
      keyZones: arr(source.keyZones).map(function (z) { return { range: str(z && z.range), label: str(z && z.label) }; }).slice(0, 6),
      importantObservations: arr(source.importantObservations).map(str).slice(0, 6),
      recentChanges: arr(source.recentChanges).map(str).slice(0, 6),
      watchItems: arr(source.watchItems).map(str).slice(0, 5),
      unresolvedQuestions: arr(source.unresolvedQuestions).map(str).slice(0, 5),
      compactNarrative: str(source.compactNarrative)
    };
  }

  // Normalizes one raw provider response (server/pattern-ai-server.mjs's `data`) into the safe,
  // fully-defaulted shape every renderer can trust. `meta` carries the NAVRYA-owned envelope
  // fields the model never controls (brief §8: "the model interprets, NAVRYA decides") -
  // analysisId, provider/model actually used, fingerprint, usage.
  function normalizeAnalysisResult(raw, meta) {
    var m = meta || {};
    var source = raw && typeof raw === 'object' ? raw : {};
    return {
      version: VERSION,
      analysisId: str(m.analysisId) || randomId('analysis'),
      analysisType: oneOf(ANALYSIS_TYPES, m.analysisType, 'initial'),
      provider: str(m.provider),
      model: str(m.model),
      generatedAt: m.generatedAt || new Date().toISOString(),
      fingerprint: str(m.fingerprint),
      usage: (m.usage && typeof m.usage === 'object') ? m.usage : null,
      entryId: str(m.entryId) || null,
      thesis: { headline: str(source.thesis && source.thesis.headline), summary: str(source.thesis && source.thesis.summary) },
      stateMetrics: arr(source.stateMetrics).map(function (x) {
        return { label: str(x && x.label), value: str(x && x.value), trend: str(x && x.trend) || 'unknown', importance: oneOf(LEVELS, x && x.importance, 'medium') };
      }).slice(0, 6),
      whatChanged: arr(source.whatChanged).map(function (x) { return { label: str(x && x.label), from: str(x && x.from), to: str(x && x.to) }; }).slice(0, 6),
      blocks: arr(source.blocks).map(normalizeBlock).slice(0, 8),
      scenarios: arr(source.scenarios).map(normalizeScenario).slice(0, 3),
      scenarioEvaluations: arr(source.scenarioEvaluations).map(normalizeScenarioEvaluation).slice(0, 3),
      watchItems: arr(source.watchItems).map(str).slice(0, 5),
      unknowns: arr(source.unknowns).map(str).slice(0, 5),
      whatWouldChangeView: str(source.whatWouldChangeView),
      confidence: { level: oneOf(LEVELS, source.confidence && source.confidence.level, 'medium'), reasons: arr(source.confidence && source.confidence.reasons).map(str).slice(0, 4) },
      memoryUpdate: normalizeMemory(source.memoryUpdate)
    };
  }

  // Deterministic Session Analysis Memory compaction (brief §2, §40 test 4) - a pure function of
  // (previousMemory, normalizedResult, liveState); same inputs always produce the same memory.
  // NEVER makes a second model call to summarize - the content comes straight from THIS SAME
  // response's own memoryUpdate field (brief: a second summarization call "defeats the cost
  // architecture"). `liveState.activeScenarioRefs`/`importantPatternRefs` are supplied by the
  // caller from the real, current session record (NAVRYA's own source of truth), never inferred
  // from the model's own text - the model does not get to decide which scenarios are "active".
  function buildSessionMemory(previousMemory, normalizedResult, liveState) {
    var mu = normalizedResult.memoryUpdate;
    var live = liveState || {};
    var prevEventCount = (previousMemory && typeof previousMemory.eventCount === 'number') ? previousMemory.eventCount : 0;
    return {
      version: VERSION,
      updatedAt: normalizedResult.generatedAt,
      lastAnalysisId: normalizedResult.analysisId,
      lastAnalysisEntryId: normalizedResult.entryId || (previousMemory && previousMemory.lastAnalysisEntryId) || null,
      lastAnalysisType: normalizedResult.analysisType,
      eventCount: prevEventCount + 1,
      currentThesis: mu.currentThesis || normalizedResult.thesis.headline,
      marketState: mu.marketState,
      keyZones: mu.keyZones,
      importantObservations: mu.importantObservations,
      recentChanges: mu.recentChanges,
      watchItems: mu.watchItems,
      unresolvedQuestions: mu.unresolvedQuestions,
      activeScenarioRefs: arr(live.activeScenarioRefs),
      importantPatternRefs: arr(live.importantPatternRefs),
      compactNarrative: mu.compactNarrative
    };
  }

  // Deterministic cache/reuse fingerprint (brief §4 "CACHE / REUSE", §40 tests 6-9) - two calls
  // with the exact same relevant immutable inputs produce the exact same string; changing any one
  // of them (model, Analysis Profile version, memory version, analysis type...) changes it. A
  // plain delimited string is enough here (this is an equality check, not a security boundary) -
  // no hashing dependency needed to stay deterministic across a browser/Node boundary.
  function buildAnalysisFingerprint(parts) {
    var p = parts || {};
    return [
      'v' + VERSION,
      'session:' + (p.sessionId || ''),
      'entry:' + (p.entryId || ''),
      'image:' + (p.imageIdentity || ''),
      'provider:' + (p.provider || ''),
      'model:' + (p.model || ''),
      'type:' + (p.analysisType || ''),
      'profile:' + (p.profileId || 'none'),
      'profileVersion:' + (p.profileVersion || 0),
      'memoryVersion:' + (p.memoryVersion || 0),
      'depth:' + (p.depth || 'auto'),
      'scenarioTargets:' + (arr(p.scenarioTargets).slice().sort().join(',') || '')
    ].join('|');
  }

  // AUTO depth policy (brief §4 "AUTO DEPTH") - deterministic, makes no extra model call. Honest
  // about what this codebase actually tracks: Phase 1 investigation of this repo found NO real
  // monthly token-budget enforcement anywhere (ai-usage-store.js's own remaining() is explicitly
  // display-only, never gates a call - see that file's header comment) - so this does not pretend
  // to read a budget ceiling that doesn't exist. It DOES use that same real (if soft) remaining()
  // number as an honest "Efficient analysis" signal when the caller supplies it, since that IS a
  // real, already-tracked value, just not an enforced one. An explicit user choice ('deep' /
  // 'efficient') always wins outright.
  var EFFICIENT_REMAINING_THRESHOLD = 20000;
  function resolveAnalysisDepth(explicitDepth, signals) {
    if (explicitDepth === 'deep' || explicitDepth === 'efficient') return explicitDepth;
    var s = signals || {};
    if (typeof s.remainingBudget === 'number' && s.remainingBudget >= 0 && s.remainingBudget < EFFICIENT_REMAINING_THRESHOLD) return 'efficient';
    return 'auto';
  }

  function analysisTypeForSession(session) {
    var memory = session && session.aiSessionAnalysisResult && session.aiSessionAnalysisResult.memory;
    return (memory && memory.eventCount > 0) ? 'update' : 'initial';
  }

  window.TradeJournalSessionAnalysisSchema = {
    VERSION: VERSION,
    BLOCK_TYPES: BLOCK_TYPES,
    SCENARIO_KINDS: SCENARIO_KINDS,
    SCENARIO_STATUSES: SCENARIO_STATUSES,
    ANALYSIS_TYPES: ANALYSIS_TYPES,
    normalizeAnalysisResult: normalizeAnalysisResult,
    normalizeMemory: normalizeMemory,
    buildSessionMemory: buildSessionMemory,
    buildAnalysisFingerprint: buildAnalysisFingerprint,
    resolveAnalysisDepth: resolveAnalysisDepth,
    analysisTypeForSession: analysisTypeForSession
  };
}());
