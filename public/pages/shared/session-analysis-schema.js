/**
 * Session Analysis Schema — Adaptive AI Session Analysis (brief §8/§9/§2/§4), extended by the
 * Session / Analysis Desk AI upgrade (note feedback, "your view and instruction" request/response,
 * structured unresolved-item lifecycle, scenario-evaluation audit trail, multi-timeframe per-image
 * output).
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
 *
 * VERSION bumped 1 -> 2 for this upgrade. buildSessionMemory() always builds a fresh memory object
 * field-by-field from (previousMemory, normalizedResult, liveState) rather than spreading
 * previousMemory verbatim, so a v1 memory (missing noteReceipts/unresolvedItems) upgrades safely
 * the very next time an analysis runs - no separate migration step is needed.
 */
(function () {
  'use strict';

  var VERSION = 2;
  var BLOCK_TYPES = ['observation', 'interpretation', 'change', 'market_structure', 'momentum', 'key_zones', 'market_tension', 'historical_context', 'pattern_context', 'invalidation', 'warning', 'uncertainty', 'watchlist', 'model_insight', 'custom'];
  var SCENARIO_KINDS = ['continuation', 'reversal', 'range', 'breakout', 'failed_breakout', 'liquidity_event', 'volatility_expansion', 'wait', 'custom'];
  var SCENARIO_ROLES = ['primary', 'alternative', 'tail_risk'];
  var SCENARIO_STATUSES = ['pending', 'strengthened', 'weakened', 'partially_confirmed', 'confirmed', 'invalidated'];
  var ANALYSIS_TYPES = ['initial', 'update', 'scenario_evaluation'];
  var LEVELS = ['low', 'medium', 'high'];
  // Note feedback verdicts (brief 1.A) - keyed to a supplied note reference only, never free text.
  var NOTE_VERDICTS = ['supported', 'partially_supported', 'contradicted', 'insufficient_evidence'];
  // Structured unresolved-item lifecycle (brief 1.C) - replaces the old string-only `unknowns`.
  var UNRESOLVED_STATUSES = ['open', 'partially_resolved', 'resolved', 'superseded'];
  // Section 3 - a labelled per-timeframe read; trend/momentum use a small closed vocabulary so the
  // card can render a consistent icon/color, same convention as stateMetrics.trend above.
  var TIMEFRAME_TRENDS = ['up', 'down', 'range', 'unclear'];
  var TIMEFRAME_MOMENTUM = ['accelerating', 'decelerating', 'steady', 'unclear'];

  function str(v) { return typeof v === 'string' ? v : ''; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, fallback) { return typeof v === 'number' && isFinite(v) ? v : fallback; }
  function bool(v) { return !!v; }
  function oneOf(list, v, fallback) { return list.indexOf(v) > -1 ? v : fallback; }
  function randomId(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // Deterministic content fingerprint for one note revision (brief 1.A: "deterministic content
  // fingerprint/revision"). A plain djb2-style hash is enough here - this is an equality check
  // (has this exact text already been reviewed?), never a security boundary, and must stay
  // identical across a browser/Node boundary without a hashing dependency, same reasoning
  // buildAnalysisFingerprint's own header comment already gives.
  function noteRevision(text) {
    var s = String(text == null ? '' : text);
    var hash = 5381;
    for (var i = 0; i < s.length; i++) { hash = ((hash * 33) ^ s.charCodeAt(i)) >>> 0; }
    return hash.toString(36) + ':' + s.length;
  }

  // Calibrated probability policy (brief §2 item 2 / brief item under "Do not use zero for a still-
  // viable scenario..."): a still-active/proposed scenario is never a meaningless single-digit
  // percentage (2%, 4%...) - floored at 10. This never rounds to a multiple of 5 (the model is
  // instructed toward that scale in the system prompt; forcing it here would silently rewrite an
  // otherwise-legitimate, more precise model estimate like 78%). Only invalidation forces exactly 0
  // - callers needing that branch (applyScenarioEvaluationPatch below) apply it explicitly, never
  // through this function, so a genuinely-still-viable value is never accidentally zeroed here.
  function calibratedActiveProbability(raw) {
    var n = Math.max(0, Math.min(100, num(raw, 50)));
    return n < 10 ? 10 : Math.round(n);
  }

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
      // A freshly-PROPOSED scenario is, by definition, still viable - calibrated (never a
      // meaningless 2%/4%, floored at 10), matching the same policy scenario evaluations use.
      probability: calibratedActiveProbability(raw && raw.probability),
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

  // Brief 1.A - feedback keyed ONLY to a supplied note reference (entryId/field/revision), never
  // free text the client has to match by content. Server-side validateSessionAnalysisResult (and
  // this same shape's client-side counterpart, computeAnalysisPatches' noteFeedback pass below)
  // both drop any item whose noteRef was not part of what was actually sent - see that function's
  // own comment for why this is the one place hallucinated identity must never be trusted.
  // Analysis Profile (Phase 5). The ref records WHICH profile - and which content revision of it - an analysis was
  // run under, stamped by the client from the very context it sent (never model output); it is what lets a later
  // Report attribute a run and separate "before" from "after" a piece of training. Null when the analysis was run
  // with no profile (or before this field existed).
  function normalizeProfileRef(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    var id = str(source.id);
    return id ? { id: id.slice(0, 64), name: str(source.name).slice(0, 100), revision: str(source.revision).slice(0, 40) } : null;
  }

  var COVERAGE_STATUSES = ['applied', 'not_visible', 'not_applicable', 'unaddressed'];
  // The server's rebuilt mandatory-concept coverage (server/ai/analysis-profile-coverage.mjs): one row per mandatory
  // concept of the profile the analysis was run under. Re-normalized here defensively (a stored or cached result may
  // come from any version): an unknown status is 'unaddressed' - never silently promoted to applied. Absent -> [].
  function normalizeConceptCoverage(raw) {
    return arr(raw).map(function (row) {
      var source = row && typeof row === 'object' ? row : {};
      // Trimmed BEFORE the blank-title filter below: a whitespace-only title is truthy and would otherwise survive as an empty-looking row.
      return { conceptId: str(source.conceptId).trim().slice(0, 64), title: str(source.title).trim().slice(0, 100), status: oneOf(COVERAGE_STATUSES, source.status, 'unaddressed'), evidence: str(source.evidence).trim().slice(0, 400) };
    }).filter(function (row) { return row.title; }).slice(0, 40);
  }

  function normalizeNoteFeedback(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    var ref = source.noteRef && typeof source.noteRef === 'object' ? source.noteRef : {};
    return {
      noteRef: { entryId: str(ref.entryId), field: oneOf(['note', 'movementNote'], ref.field, 'note'), revision: str(ref.revision) },
      verdict: oneOf(NOTE_VERDICTS, source.verdict, 'insufficient_evidence'),
      evidence: str(source.evidence),
      correction: str(source.correction),
      encouragement: str(source.encouragement),
      watchFor: str(source.watchFor)
    };
  }

  // Brief 1.B - "Your view and instruction" structured response: what was asked, what was actually
  // analyzed for it, the direct answer, and any limitation. Always present (possibly all-empty)
  // like every other envelope field - the card only renders this section when non-empty.
  function normalizeRequestResponse(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    return { requested: str(source.requested), analyzed: str(source.analyzed), answer: str(source.answer), limitation: str(source.limitation) };
  }

  // Brief 1.C - a stable-identity unresolved item: why it matters, what evidence is missing, and a
  // concrete trader action (never just "unclear" prose). `resolutionEvidence` explains a non-'open'
  // status. legacyText carries a pre-upgrade plain-string `unknowns` entry through unmodified so a
  // stored analysis from before this upgrade still renders (never crashes, never loses the text).
  function normalizeUnresolvedItem(raw) {
    if (typeof raw === 'string') {
      return { id: randomId('unresolved'), status: 'open', description: raw, whyItMatters: '', missingEvidence: '', action: '', resolutionEvidence: '', legacy: true };
    }
    var source = raw && typeof raw === 'object' ? raw : {};
    return {
      id: str(source.id) || randomId('unresolved'),
      status: oneOf(UNRESOLVED_STATUSES, source.status, 'open'),
      description: str(source.description),
      whyItMatters: str(source.whyItMatters),
      missingEvidence: str(source.missingEvidence),
      action: str(source.action),
      resolutionEvidence: str(source.resolutionEvidence),
      legacy: false
    };
  }

  // Section 3 - one labelled timeframe's own read, keyed to the real submitted image id (never a
  // fabricated one - server/client both validate this id against what was actually sent, see
  // pattern-ai-server.mjs's validateSessionAnalysisResult and this file's own header comment).
  function normalizeTimeframeAnalysis(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    return {
      imageId: str(source.imageId), timeframe: str(source.timeframe),
      trend: oneOf(TIMEFRAME_TRENDS, source.trend, 'unclear'),
      momentum: oneOf(TIMEFRAME_MOMENTUM, source.momentum, 'unclear'),
      keyEvidence: arr(source.keyEvidence).map(str).slice(0, 5),
      uncertainty: str(source.uncertainty)
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
    // Backward compatibility (brief 1.C "continue to support legacy stored string unknowns
    // safely"): a stored pre-upgrade result has `unknowns` (plain strings) and no
    // `unresolvedItems` at all. A fresh response is expected to supply `unresolvedItems` directly.
    // Reading normalizes BOTH into the one new structured shape so every renderer only ever has to
    // handle `result.unresolvedItems`.
    var unresolvedSource = arr(source.unresolvedItems).length ? source.unresolvedItems : arr(source.unknowns);
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
      // Deferred scenarios (brief §2: "never silently omit them") - real, eligible active scenario
      // ids/titles that this call's own one-request bound could not fit, so the UI can say so
      // explicitly instead of quietly dropping them. Populated by the client from its own gathered
      // active-scenario list (see session-analysis-client.js's gatherActiveScenarios), not by the
      // model - defaulted empty here for a bare raw provider response.
      deferredScenarios: arr(source.deferredScenarios).map(function (x) { return { id: str(x && x.id), title: str(x && x.title) }; }).slice(0, 20),
      scenarioEvaluations: arr(source.scenarioEvaluations).map(normalizeScenarioEvaluation).slice(0, 8),
      watchItems: arr(source.watchItems).map(str).slice(0, 5),
      // Legacy field, kept only so an old cached result still round-trips untouched; every renderer
      // should prefer `unresolvedItems` (see the merge above).
      unknowns: arr(source.unknowns).map(str).slice(0, 5),
      unresolvedItems: unresolvedSource.map(normalizeUnresolvedItem).slice(0, 8),
      whatWouldChangeView: str(source.whatWouldChangeView),
      confidence: { level: oneOf(LEVELS, source.confidence && source.confidence.level, 'medium'), reasons: arr(source.confidence && source.confidence.reasons).map(str).slice(0, 4) },
      memoryUpdate: normalizeMemory(source.memoryUpdate),
      // Brief 1.B
      requestResponse: normalizeRequestResponse(source.requestResponse),
      // Brief 1.A - validated against the real supplied note refs server-side before this function
      // ever sees the response (pattern-ai-server.mjs's validateSessionAnalysisResult); normalized
      // defensively here too for a non-strict provider.
      noteFeedback: arr(source.noteFeedback).map(normalizeNoteFeedback).slice(0, 10),
      // Section 3 - validated against the real supplied image ids server-side the same way.
      timeframeAnalyses: arr(source.timeframeAnalyses).map(normalizeTimeframeAnalysis).slice(0, 4),
      timeframeSynthesis: str(source.timeframeSynthesis),
      // Section 4 - style/focus-declared required inputs this analysis was warned about (echoed
      // back from the request, not model-controlled) so the card can show what was flagged even
      // after later reopening a saved result.
      requiredInputsFlagged: arr(m.requiredInputsFlagged).map(str).slice(0, 10),
      // Analysis Profile attribution + verifiable mandatory-concept coverage (Phase 5) - additive, both empty for any
      // analysis that predates them or ran without a profile.
      analysisProfileRef: normalizeProfileRef(m.analysisProfileRef),
      conceptCoverage: normalizeConceptCoverage(source.conceptCoverage)
    };
  }

  // Deterministic Session Analysis Memory compaction (brief §2, §40 test 4) - a pure function of
  // (previousMemory, normalizedResult, liveState); same inputs always produce the same memory.
  // NEVER makes a second model call to summarize - the content comes straight from THIS SAME
  // response's own memoryUpdate field (brief: a second summarization call "defeats the cost
  // architecture"). `liveState.activeScenarioRefs`/`importantPatternRefs` are supplied by the
  // caller from the real, current session record (NAVRYA's own source of truth), never inferred
  // from the model's own text - the model does not get to decide which scenarios are "active".
  //
  // `liveState.noteReceipts`/`unresolvedItems` (this upgrade): compact acknowledgement state only -
  // never duplicate raw note text (brief 1.A) - persisted so the NEXT analysis knows which note
  // revisions were already reviewed and which unresolved items are still open.
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
      compactNarrative: mu.compactNarrative,
      // Compact receipts only: {entryId, field, revision} - never the note's own text (brief 1.A).
      noteReceipts: arr(live.noteReceipts).slice(0, 60),
      // Compact open/resolved unresolved-item state (brief 1.C) - {id, status, description} kept
      // small enough to resend as context next time without re-sending the whole prior analysis.
      unresolvedItems: arr(live.unresolvedItems).slice(0, 8)
    };
  }

  // Deterministic cache/reuse fingerprint (brief §4 "CACHE / REUSE", §40 tests 6-9) - two calls
  // with the exact same relevant immutable inputs produce the exact same string; changing any one
  // of them (model, Analysis Profile version, memory version, analysis type...) changes it. A
  // plain delimited string is enough here (this is an equality check, not a security boundary) -
  // no hashing dependency needed to stay deterministic across a browser/Node boundary.
  //
  // Extended for this upgrade (brief section 6): the fingerprint must also change when the user's
  // own instruction text changes, when a pending (unreviewed) note revision changes, when active
  // scenario state (status/latest probability) changes, when the open-unresolved-item revision
  // changes, or when the ordered set of multi-timeframe image identities/timeframes changes. Every
  // new field defaults to an empty array/string when the caller omits it, so a caller that never
  // knew about these fields (a plain single-image, no-notes, no-scenarios request) computes the
  // exact same fingerprint string as before this upgrade.
  function buildAnalysisFingerprint(parts) {
    var p = parts || {};
    var imageIdentities = arr(p.imageIdentities).length ? p.imageIdentities.slice() : (p.imageIdentity ? [p.imageIdentity] : []);
    return [
      'v' + VERSION,
      'session:' + (p.sessionId || ''),
      'entry:' + (p.entryId || ''),
      'image:' + (p.imageIdentity || ''),
      'images:' + imageIdentities.join(','),
      'provider:' + (p.provider || ''),
      'model:' + (p.model || ''),
      'type:' + (p.analysisType || ''),
      'profile:' + (p.profileId || 'none'),
      'profileVersion:' + (p.profileVersion || 0),
      'memoryVersion:' + (p.memoryVersion || 0),
      'depth:' + (p.depth || 'auto'),
      'scenarioTargets:' + (arr(p.scenarioTargets).slice().sort().join(',') || ''),
      'instruction:' + (p.userInstruction || ''),
      'notes:' + (arr(p.pendingNoteRevisions).slice().sort().join(',')),
      'scenarioState:' + (arr(p.activeScenarioState).slice().sort().join(',')),
      'unresolved:' + (p.unresolvedRevision || '')
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

  // Deterministic append-only scenario-evaluation patch (brief §22, and this upgrade's section 2).
  // NEVER overwrites probabilityHistory - only appends. Invalidation (explicit status or
  // invalidationOccurred) deterministically forces probability to exactly 0 and status to
  // 'invalidated', regardless of what numeric value the model itself returned - "a scenario that is
  // invalidated ... must deterministically become 0%" is enforced HERE, once, for every caller
  // (the normal-analysis path and the explicit "Evaluate with AI" path both call this same
  // function - brief: "reuse the same deterministic patch function"). A still-viable scenario is
  // calibrated (never a meaningless single-digit %, floored at 10) but never rounded off the
  // model's own more precise estimate. `ctx` (optional) carries the audit trail this upgrade adds:
  // sourceEntryId/analysisId/provider/model - purely additive, so a caller that omits it (existing
  // callers/tests) still gets the exact pre-existing probabilityHistory/status/occurred fields.
  function applyScenarioEvaluationPatch(scenario, evaluation, ctx) {
    var c = ctx || {};
    var history = arr(scenario.probabilityHistory);
    var previousProbability = history.length ? num(history[history.length - 1].value, 50) : 50;
    var invalidated = evaluation.status === 'invalidated' || bool(evaluation.invalidationOccurred);
    var newProbability = invalidated ? 0 : calibratedActiveProbability(evaluation.newProbability);
    var status = invalidated ? 'invalidated' : evaluation.status;
    var now = new Date().toISOString();
    var newHistory = history.concat([{ value: newProbability, loggedAt: now }]);
    var auditEntry = {
      previousProbability: previousProbability, newProbability: newProbability, delta: newProbability - previousProbability,
      status: status, confirmedEvidence: arr(evaluation.confirmedBy).map(str), contradictoryEvidence: arr(evaluation.contradictedBy).map(str),
      unresolvedEvidence: arr(evaluation.remainsUnresolved).map(str), rationale: str(evaluation.whatHappened),
      sourceEntryId: str(c.sourceEntryId) || null, analysisId: str(c.analysisId) || null, provider: str(c.provider) || null, model: str(c.model) || null,
      evaluatedAt: now
    };
    return {
      probabilityHistory: newHistory,
      status: status,
      occurred: status === 'confirmed' ? true : (invalidated ? false : scenario.occurred),
      // Append-only audit trail (brief §2: "persist ... source entry, analysis ID, provider/model,
      // and timestamp"), never overwritten - mirrors probabilityHistory's own append discipline.
      evaluationHistory: arr(scenario.evaluationHistory).concat([auditEntry]),
      lastEvaluation: {
        whatHappened: evaluation.whatHappened, confirmedBy: evaluation.confirmedBy, contradictedBy: evaluation.contradictedBy,
        remainsUnresolved: evaluation.remainsUnresolved, triggerOccurred: evaluation.triggerOccurred, invalidationOccurred: evaluation.invalidationOccurred,
        evaluatedAt: now, previousProbability: previousProbability, newProbability: newProbability, delta: newProbability - previousProbability,
        sourceEntryId: auditEntry.sourceEntryId, analysisId: auditEntry.analysisId, provider: auditEntry.provider, model: auditEntry.model
      }
    };
  }

  // Active/invalidation/dashboard predicate (brief section 2, last bullet): a scenario counts as
  // active only when it has not occurred, was never tagged for invalidation, its own status is not
  // 'invalidated', and its latest logged probability is greater than 0. Every "is this scenario
  // still active" check in this domain should call this ONE function rather than re-deriving its
  // own partial version (session-analysis-client.js's isScenarioActive delegates here).
  function isScenarioActiveState(scenario) {
    if (!scenario) return false;
    if (scenario.occurred) return false;
    if ((scenario.invalidationTagIds || []).length) return false;
    if (scenario.status === 'invalidated') return false;
    var history = arr(scenario.probabilityHistory);
    var latest = history.length ? num(history[history.length - 1].value, 50) : 50;
    if (latest <= 0) return false;
    return true;
  }

  window.TradeJournalSessionAnalysisSchema = {
    VERSION: VERSION,
    BLOCK_TYPES: BLOCK_TYPES,
    SCENARIO_KINDS: SCENARIO_KINDS,
    SCENARIO_STATUSES: SCENARIO_STATUSES,
    ANALYSIS_TYPES: ANALYSIS_TYPES,
    NOTE_VERDICTS: NOTE_VERDICTS,
    UNRESOLVED_STATUSES: UNRESOLVED_STATUSES,
    noteRevision: noteRevision,
    calibratedActiveProbability: calibratedActiveProbability,
    normalizeAnalysisResult: normalizeAnalysisResult,
    normalizeMemory: normalizeMemory,
    normalizeUnresolvedItem: normalizeUnresolvedItem,
    normalizeNoteFeedback: normalizeNoteFeedback,
    normalizeRequestResponse: normalizeRequestResponse,
    normalizeTimeframeAnalysis: normalizeTimeframeAnalysis,
    buildSessionMemory: buildSessionMemory,
    buildAnalysisFingerprint: buildAnalysisFingerprint,
    resolveAnalysisDepth: resolveAnalysisDepth,
    analysisTypeForSession: analysisTypeForSession,
    applyScenarioEvaluationPatch: applyScenarioEvaluationPatch,
    isScenarioActiveState: isScenarioActiveState
  };
}());
