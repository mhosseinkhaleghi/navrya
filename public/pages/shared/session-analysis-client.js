/**
 * Session Analysis Client — Adaptive AI Session Analysis (brief, whole document).
 *
 * The one orchestration seam between the Session UI (navrya-src/sessionAiAnalysisModal.jsx,
 * sessionAnalysisCard.jsx, liveSessionView.jsx) and the server (server/pattern-ai-server.mjs's
 * POST /api/sessions/analyze and /api/sessions/visualize-scenario). Owns: compact context
 * gathering from the EXISTING stores (never a second parallel store - session-signature-store.js,
 * pattern-registry-store.js, analysis-context.js, ai-settings-store.js), the cache/fingerprint
 * check that skips a network call entirely on a hit, image preparation, and the deterministic
 * patches that get applied through liveSessionView.jsx's own real persist()/addScenario()/
 * updateScenario() functions - this file never writes to window.TradeJournalWorkspace directly,
 * it only computes what a caller should pass to the existing persistence path (brief §20: "Do not
 * write directly into storage from the Analysis Card if an existing store/adapter/action owns
 * [it]").
 */
(function () {
  'use strict';

  function schema() { return window.TradeJournalSessionAnalysisSchema; }
  function imagePrep() { return window.TradeJournalAnalysisImagePrep; }
  function aiSettings() { return window.TradeJournalAISettingsStore; }
  function aiUsage() { return window.TradeJournalAIUsage; }
  function patternStore() { return window.TradeJournalPatternStore; }
  function signatureStore() { return window.TradeJournalSessionSignatureStore; }
  function signatureEngine() { return window.TradeJournalSessionSignatureEngine; }
  function imageStore() { return window.TradeJournalImageStore; }

  // ------------------------------------------------------------------------------------------
  // Image resolution - reads whichever source a SessionEntry actually has (IndexedDB blob,
  // server-hosted URL, or an inline preview data URL - see liveSessionView.jsx's
  // submitChartEntry()/attachImage() for how those three get set) and produces ONE compact data
  // URL for AI transport via analysis-image-prep.js. Never mutates the entry or the original
  // image in any store.
  // ------------------------------------------------------------------------------------------
  async function resolveEntrySourceUrl(entry) {
    if (!entry) return null;
    if (entry.imageBlobId && imageStore()) {
      try {
        var blobUrl = await imageStore().loadImageUrl(entry.imageBlobId);
        if (blobUrl) return blobUrl;
      } catch (_) { /* fall through to other sources */ }
    }
    if (entry.imageUrl) return entry.imageUrl;
    if (entry.preview) return entry.preview;
    return null;
  }

  async function resolveEntryImageDataUrl(entry, options) {
    var sourceUrl = await resolveEntrySourceUrl(entry);
    if (!sourceUrl) return null;
    var prep = imagePrep();
    if (!prep) return null;
    try {
      return await prep.prepareForTransport(sourceUrl, options);
    } catch (_) {
      return null;
    }
  }

  // A stable-enough identity for the fingerprint (brief §4) - the blob/URL/preview reference
  // itself, not the (expensive to hash) pixel content. Two analyses of the exact same unedited
  // entry share this id; a re-uploaded image on the same entry gets a new blobId/url and so a new
  // identity, correctly invalidating the cache.
  function entryImageIdentity(entry) {
    if (!entry) return '';
    return String(entry.imageBlobId || entry.imageUrl || (entry.preview ? 'preview:' + entry.preview.length : '') || '');
  }

  // ------------------------------------------------------------------------------------------
  // Compact context gathering - brief §39 "never serialize entire stores into the prompt".
  // ------------------------------------------------------------------------------------------

  function flatScenarios(session) {
    var out = [];
    (session.entries || []).forEach(function (e) { (e.scenarios || []).forEach(function (s) { out.push({ entry: e, scenario: s }); }); });
    return out;
  }

  // Real invalidation check - session-analysis-modal's own pre-existing buildSessionContextRefs()
  // read `scenario.confirmedInvalidationTagIds`, a field that does not exist anywhere else in this
  // codebase (the real field, set by InvalidationTags, is `invalidationTagIds`) - so that check
  // always evaluated every scenario as "active" regardless of real invalidation state. Fixed here,
  // the one place "is this scenario still active" is now computed for the Session Analysis domain.
  function isScenarioActive(scenario) {
    return !scenario.occurred && !((scenario.invalidationTagIds || []).length);
  }

  function gatherActiveScenarios(session, limit) {
    return flatScenarios(session)
      .filter(function (x) { return isScenarioActive(x.scenario); })
      .slice(0, limit || 5)
      .map(function (x) {
        var s = x.scenario;
        var history = s.probabilityHistory || [];
        return {
          id: s.id,
          title: s.title || '',
          description: s.description || '',
          evidence: s.evidence || '',
          trigger: s.trigger || '',
          invalidationNote: s.invalidationNote || '',
          probability: history.length ? history[history.length - 1].value : 50,
          occurred: !!s.occurred,
          status: s.status || 'pending',
          patternName: (s.pattern && s.pattern.name) || null
        };
      });
  }

  // Deterministic completion tracking (brief §21: pattern completion/similarity is NAVRYA's own
  // deterministic concept, never something the model computes) - walks the session's own
  // scenario.pattern fields (never a second registry query per scenario) and only joins the full
  // Pattern record for a description, when the registry still has it.
  function gatherPatternContext(session, limit) {
    var store = patternStore();
    var seen = {};
    var out = [];
    flatScenarios(session).forEach(function (x) {
      var pattern = x.scenario.pattern;
      if (!pattern || !pattern.patternTagId) return;
      if (seen[pattern.patternTagId]) return;
      seen[pattern.patternTagId] = true;
      var stages = pattern.stages || [];
      var doneIds = pattern.completedStageIds || [];
      var done = doneIds.filter(function (id) { return stages.some(function (st) { return st.id === id; }); }).length;
      var full = store ? store.find(pattern.patternTagId) : null;
      out.push({
        patternTagId: pattern.patternTagId,
        name: pattern.name || (full && full.name) || '',
        completionThreshold: Number(pattern.completionThreshold || 70),
        stageCount: stages.length,
        completedStageCount: done,
        completionPercent: stages.length ? Math.round((done / stages.length) * 100) : 0,
        occurred: !!x.scenario.occurred,
        description: full ? full.description : ''
      });
    });
    return out.slice(0, limit || 6);
  }

  // "Top N similar sessions" - the exact existing pattern session-signature-ui.js already uses
  // (buildPartialFromSession + compareWithProvider + slice), reused rather than re-implemented -
  // this is a 100% local/deterministic computation (session-signature-engine.js), never an AI call.
  async function gatherSimilarSessions(session, character, limit) {
    var store = signatureStore();
    var engine = signatureEngine();
    if (!store || !engine) return [];
    try {
      var live = store.buildPartialFromSession(session, character);
      var matches = await engine.compareWithProvider(live, store.listSync());
      return matches.slice(0, limit || 3).map(function (m) {
        return { similarity: m.similarity, market: m.market, instrument: m.instrument, timeframe: m.timeframe, date: m.date, fateSummaryText: m.fateSummaryText || '', reasons: m.reasons || [] };
      });
    } catch (_) {
      return [];
    }
  }

  // Memory Receipt (brief §3) - pure counts/refs, deliberately not translated text (every
  // navrya-src/*.jsx file owns its own copy/tr() i18n; this stays domain data only).
  function buildMemoryReceipt(session) {
    var memory = session && session.aiSessionAnalysisResult && session.aiSessionAnalysisResult.memory;
    var entries = session ? (session.entries || []) : [];
    return {
      eventCount: memory ? (memory.eventCount || 0) : 0,
      hasInitialAnalysis: !!memory,
      chartUpdateCount: entries.filter(function (e) { return e.type === 'chart'; }).length,
      movementNoteCount: entries.filter(function (e) { return e.type === 'movement'; }).length,
      activeScenarioCount: gatherActiveScenarios(session || {}, 99).length,
      hasPreviousSession: !!(session && (session.previousSessionSummary || session.fateSummary)),
      watchItemCount: memory ? (memory.watchItems || []).length : 0
    };
  }

  // ------------------------------------------------------------------------------------------
  // Fingerprint / cache lookup (brief §4 "CACHE / REUSE", §41 "opening a stored analysis makes
  // zero AI calls"). Looks in exactly the two places a result is ever persisted (brief §34):
  // the target entry's own aiAnalysisResult, and the session's latest aiSessionAnalysisResult.
  // ------------------------------------------------------------------------------------------
  function findCachedAnalysis(session, entry, fingerprint) {
    if (entry && entry.aiAnalysisResult && entry.aiAnalysisResult.fingerprint === fingerprint) return entry.aiAnalysisResult;
    var latest = session && session.aiSessionAnalysisResult && session.aiSessionAnalysisResult.latestAnalysis;
    if (latest && latest.fingerprint === fingerprint) return latest;
    return null;
  }

  // ------------------------------------------------------------------------------------------
  // Request building + the one network call. ONE model call per invocation (brief §4's "ABSOLUTE
  // RULE") - this function never calls the endpoint more than once for a given analyze() call.
  // ------------------------------------------------------------------------------------------

  function pickAdherenceProfile(analysisContext, adherence) {
    if (!analysisContext) return null;
    return {
      primaryStyle: analysisContext.primaryStyle || null,
      secondaryStyles: analysisContext.secondaryStyles || [],
      focuses: analysisContext.focuses || [],
      customMethodNotes: analysisContext.customMethodNotes || '',
      adherence: adherence
    };
  }

  // options: { session, character, entry, analysisType, scenarioTargets, userView, provider,
  //            model, language, profileId, analysisContext, adherence, depth }
  // Returns { ok, cached, result, error, status }. Makes AT MOST one network call, and none at
  // all on a cache hit or a capability rejection (brief §41/§6).
  async function analyzeSession(options) {
    var opts = options || {};
    var session = opts.session;
    var entry = opts.entry;
    var s = schema();
    var settings = aiSettings();
    var analysisType = opts.analysisType || (s ? s.analysisTypeForSession(session) : 'initial');
    var capabilities = settings ? settings.capabilitiesFor(opts.provider) : { supportsVision: false };
    var imageIdentity = entryImageIdentity(entry);
    var hasImage = !!imageIdentity;

    if (hasImage && !capabilities.supportsVision) {
      return { ok: false, error: 'MODEL_VISION_UNSUPPORTED', status: 422 };
    }

    var depth = s ? s.resolveAnalysisDepth(opts.depth, opts.depthSignals) : (opts.depth || 'auto');
    var memory = session && session.aiSessionAnalysisResult && session.aiSessionAnalysisResult.memory;
    var fingerprint = s ? s.buildAnalysisFingerprint({
      sessionId: session && session.id, entryId: entry && entry.id, imageIdentity: imageIdentity,
      provider: opts.provider, model: opts.model, analysisType: analysisType,
      profileId: opts.profileId, profileVersion: (opts.analysisContext && opts.analysisContext.profile && opts.analysisContext.profile.registryVersion) || 0,
      memoryVersion: memory ? memory.eventCount : 0, depth: depth, scenarioTargets: opts.scenarioTargets
    }) : '';

    if (!opts.forceRegenerate) {
      var cached = findCachedAnalysis(session, entry, fingerprint);
      if (cached) return { ok: true, cached: true, result: cached };
    }

    var imageDataUrl = hasImage ? await resolveEntryImageDataUrl(entry) : null;
    var apiKey = settings ? settings.getKey(opts.provider) : '';

    var body = {
      provider: opts.provider, model: opts.model, apiKey: apiKey || undefined,
      language: opts.language || 'fa', analysisType: analysisType, depth: depth,
      analysisProfile: pickAdherenceProfile(opts.analysisContext, opts.adherence),
      adherence: opts.adherence || 'balanced',
      userView: opts.userView || '',
      sessionMemory: (analysisType !== 'initial' && memory) ? memory : null,
      marketContext: { market: session && session.market, timeframe: (entry && entry.timeframe) || (session && session.timeframe), instrument: session && session.instrument, date: entry && (entry.gregorianDate || entry.createdAt) },
      historicalContext: analysisType === 'initial' ? {
        previousSessionSummary: (session && session.previousSessionSummary && (session.previousSessionSummary.note || session.previousSessionSummary.fateSummaryText)) || '',
        similarSessions: await gatherSimilarSessions(session, opts.character, 3)
      } : null,
      patternContext: gatherPatternContext(session, 6),
      activeScenarios: gatherActiveScenarios(session, 5),
      scenarioTargets: analysisType === 'scenario_evaluation' ? (opts.scenarioTargets || []) : [],
      images: imageDataUrl ? [imageDataUrl] : []
    };

    var response;
    try {
      response = await fetch('/api/sessions/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (_) {
      return { ok: false, error: 'NETWORK_ERROR', status: 0 };
    }
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) return { ok: false, error: payload.error || 'ANALYSIS_FAILED', status: response.status };

    if (aiUsage()) aiUsage().record({ provider: payload.provider, usage: payload.usage, source: 'sessions.' + analysisType });

    var normalized = s.normalizeAnalysisResult(payload.data, {
      analysisId: (session && session.id ? session.id + ':' : '') + Date.now().toString(36),
      analysisType: analysisType, provider: payload.provider, model: payload.model,
      generatedAt: new Date().toISOString(), fingerprint: fingerprint, usage: payload.usage,
      entryId: entry && entry.id
    });
    return { ok: true, cached: false, result: normalized };
  }

  // ------------------------------------------------------------------------------------------
  // Deterministic persistence patches - the CALLER (liveSessionView.jsx) applies these through
  // the real persist()/addScenario()/updateScenario() functions; this file never touches
  // window.TradeJournalWorkspace itself (brief §20).
  // ------------------------------------------------------------------------------------------

  // brief §2: "store the analysis on the relevant Session Entry, derive/update compact Session
  // Memory deterministically, persist through the EXISTING Session persistence/sync path."
  function computeAnalysisPatches(session, normalizedResult) {
    var s = schema();
    var previousMemory = session.aiSessionAnalysisResult && session.aiSessionAnalysisResult.memory;
    var activeRefs = gatherActiveScenarios(session, 99).map(function (x) { return x.id; });
    var patternRefs = gatherPatternContext(session, 99).map(function (x) { return x.patternTagId; });
    var memory = s.buildSessionMemory(previousMemory, normalizedResult, { activeScenarioRefs: activeRefs, importantPatternRefs: patternRefs });
    return {
      entryPatch: normalizedResult.entryId ? { aiAnalysisResult: normalizedResult } : null,
      sessionPatch: {
        aiSessionAnalysisResult: { version: s.VERSION, memory: memory, latestAnalysis: normalizedResult, updatedAt: normalizedResult.generatedAt }
      }
    };
  }

  // ------------------------------------------------------------------------------------------
  // Scenario proposal -> real Session Scenario draft (brief §20). Maps the AI's richer proposal
  // shape onto the SAME Scenario fields liveSessionView.jsx's own addScenario()/ScenarioEditor
  // already use, so a trader can keep editing it with zero special-casing. Additive-only new
  // fields (aiSource, status, aiVisualization) - nothing existing is renamed or removed.
  // ------------------------------------------------------------------------------------------
  function scenarioAlreadyAdded(entry, analysisId, generatedScenarioKey) {
    return (entry.scenarios || []).some(function (sc) {
      return sc.aiSource && sc.aiSource.analysisId === analysisId && sc.aiSource.generatedScenarioKey === generatedScenarioKey;
    });
  }

  // Production feedback (2026-09-01): "fully filled" - problem and executionPlan.actionPlan were
  // silently left blank forever, since sessionAnalysisFormat's own scenario schema has no
  // dedicated "weakness"/"action plan" field to copy from directly. Both have a genuine source in
  // the SAME AI scenario object once you look past a literal field-name match: evidenceAgainst IS
  // exactly what problemLabel/problemPlaceholder ask for ("نقطه ضعف یا ریسک این سناریو چیست؟" -
  // what's the weakness/risk of this scenario), and confirmations (what to watch for as the trade
  // develops) is genuine execution guidance, not invented. Numeric executionPlan fields
  // (entryPrices/stopLoss/takeProfit) are deliberately still left null - the AI's own trigger/
  // invalidation are prose ("below 76000"), not clean numbers a parser could safely turn into a
  // real price without risking a wrong, silently-acted-on number.
  function buildScenarioDraftFromAi(aiScenario, context) {
    var evidenceText = (aiScenario.evidenceFor || []).map(function (line) { return '• ' + line; }).join('\n');
    var problemText = (aiScenario.evidenceAgainst || []).map(function (line) { return '• ' + line; }).join('\n');
    var actionPlanText = (aiScenario.confirmations || []).map(function (line) { return '• ' + line; }).join('\n');
    return {
      id: context.newId,
      entryId: context.entry.id,
      title: aiScenario.title || '',
      description: aiScenario.summary || '',
      evidence: evidenceText,
      invalidationTagIds: [],
      invalidationNote: aiScenario.invalidation || '',
      problem: problemText,
      trigger: aiScenario.trigger || '',
      probabilityHistory: [{ value: aiScenario.probability, loggedAt: new Date().toISOString() }],
      executionPlan: { actionPlan: actionPlanText, positionType: aiScenario.direction === 'long' ? 'Long' : aiScenario.direction === 'short' ? 'Short' : null, entryPrices: [], stopLoss: null, takeProfit: null, positionStatus: null },
      occurred: false,
      status: 'pending',
      pattern: null,
      aiVisualization: null,
      aiSource: {
        source: 'ai_analysis', analysisId: context.analysisId, sourceEntryId: context.entry.id,
        provider: context.provider, model: context.model, generatedScenarioKey: aiScenario.localKey,
        kind: aiScenario.kind, role: aiScenario.role, confidence: aiScenario.confidence,
        confirmations: aiScenario.confirmations, evidenceFor: aiScenario.evidenceFor, evidenceAgainst: aiScenario.evidenceAgainst,
        visualizationBrief: aiScenario.visualizationBrief
      }
    };
  }

  // brief §22/§19: append-only probability history, never overwritten; scenario.status/occurred
  // are the only fields a Scenario Evaluation is allowed to change (an Analysis Update never
  // calls this at all - see the brief's own "must NOT silently produce these persistent
  // evaluation changes").
  function applyScenarioEvaluationPatch(scenario, evaluation) {
    var history = (scenario.probabilityHistory || []).concat([{ value: evaluation.newProbability, loggedAt: new Date().toISOString() }]);
    return {
      probabilityHistory: history,
      status: evaluation.status,
      occurred: evaluation.status === 'confirmed' ? true : scenario.occurred,
      lastEvaluation: {
        whatHappened: evaluation.whatHappened, confirmedBy: evaluation.confirmedBy, contradictedBy: evaluation.contradictedBy,
        remainsUnresolved: evaluation.remainsUnresolved, triggerOccurred: evaluation.triggerOccurred, invalidationOccurred: evaluation.invalidationOccurred,
        evaluatedAt: new Date().toISOString()
      }
    };
  }

  // ------------------------------------------------------------------------------------------
  // Scenario Map (brief §25-27) - explicit, never automatic (see sessionAnalysisCard.jsx's own
  // "Visualize Scenario" button, the only caller). Caches on scenario.aiVisualization.
  // ------------------------------------------------------------------------------------------
  function visualizationFingerprint(entry, scenario, analysisId) {
    return ['viz', entry && entry.id, scenario && (scenario.id || scenario.localKey), analysisId, entryImageIdentity(entry)].join('|');
  }

  function findCachedVisualization(scenario, fingerprint) {
    var v = scenario && scenario.aiVisualization;
    return (v && v.fingerprint === fingerprint) ? v : null;
  }

  // Production bug (2026-09-01): a proposed AI scenario (result.scenarios[], keyed by its own
  // localKey - a real Scenario has no such field) still visually "loses" its generated image the
  // moment the popup/card that made the call is closed and reopened, EVEN THOUGH
  // runVisualizeAiScenario() already persists it correctly onto the real, added Scenario's own
  // aiVisualization. The gap was purely on the READ side: nothing displaying result.scenarios[]
  // ever cross-referenced the real, already-added Scenario a proposal might correspond to - it
  // only ever looked at ephemeral, per-popup-instance React state. This walks every proposal in
  // `result`, finds its real persisted Scenario (same aiSource.analysisId/generatedScenarioKey
  // match addAiScenario()/runVisualizeAiScenario() themselves already use for de-duplication), and
  // returns a { [localKey]: aiVisualization } map any caller can merge UNDER its own ephemeral
  // state (so a visualization generated THIS render still shows immediately, before the entry
  // itself has been re-read from storage).
  function hydrateScenarioVisualizations(entry, result) {
    var map = {};
    if (!entry || !result) return map;
    (result.scenarios || []).forEach(function (proposed) {
      var real = (entry.scenarios || []).find(function (sc) {
        return sc.aiSource && sc.aiSource.analysisId === result.analysisId && sc.aiSource.generatedScenarioKey === proposed.localKey;
      });
      if (real && real.aiVisualization) map[proposed.localKey] = real.aiVisualization;
    });
    return map;
  }

  // Production bug (2026-08-31): a generated image's raw base64 data URL is easily 1-3MB - storing
  // it directly on the visualization object meant the NEXT session save (server-replica.js's
  // upsert(), the same whole-session-record JSON PUT every other field change already uses) had to
  // push that multi-MB blob inline in the session JSON. Confirmed live: that save request fired but
  // never resolved (no response, no error, indefinitely) rather than failing cleanly. Uploaded here
  // through the SAME endpoint an entry's own original chart image already uses
  // (session-workspace-logic.js's own /api/sync/sessions/images) instead, so only a small
  // /uploads/... URL - not the pixels themselves - ever gets embedded in the session record. A
  // failed upload fails the whole visualize action outright (VISUALIZATION_SAVE_FAILED) rather than
  // silently keeping the huge inline blob, which would just reintroduce the same hang later.
  async function uploadGeneratedImage(dataUrl) {
    var response;
    try {
      response = await fetch('/api/sync/sessions/images', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl: dataUrl })
      });
    } catch (_) {
      return null;
    }
    if (!response.ok) return null;
    var body = await response.json().catch(function () { return {}; });
    return body.url || null;
  }

  // options: { entry, scenario, analysisId, visualizationBrief, language, apiKey }
  async function visualizeScenario(options) {
    var opts = options || {};
    var fingerprint = visualizationFingerprint(opts.entry, opts.scenario, opts.analysisId);
    if (!opts.forceRegenerate) {
      var cached = findCachedVisualization(opts.scenario, fingerprint);
      if (cached) return { ok: true, cached: true, visualization: cached };
    }
    var chartImage = await resolveEntryImageDataUrl(opts.entry, { maxDimension: 2048 });
    if (!chartImage) return { ok: false, error: 'CHART_IMAGE_REQUIRED', status: 400 };

    var settings = aiSettings();
    var apiKey = opts.apiKey || (settings ? settings.getKey('openai') : '');
    var response;
    try {
      response = await fetch('/api/sessions/visualize-scenario', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartImage: chartImage, visualizationBrief: opts.visualizationBrief, language: opts.language || 'fa', apiKey: apiKey || undefined })
      });
    } catch (_) {
      return { ok: false, error: 'NETWORK_ERROR', status: 0 };
    }
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) return { ok: false, error: payload.error || 'VISUALIZATION_FAILED', status: response.status };

    if (aiUsage()) aiUsage().record({ provider: payload.provider, usage: payload.usage, source: 'sessions.scenarioVisualization' });

    var uploadedUrl = await uploadGeneratedImage(payload.data && payload.data.imageDataUrl);
    if (!uploadedUrl) return { ok: false, error: 'VISUALIZATION_SAVE_FAILED', status: 0 };
    var visualization = { status: 'ready', imageDataUrl: uploadedUrl, fingerprint: fingerprint, generatedAt: new Date().toISOString() };
    return { ok: true, cached: false, visualization: visualization };
  }

  // ------------------------------------------------------------------------------------------
  // Analysis Map - the same illustrative-overlay tool as Scenario Map above, drawing the WHOLE
  // analysis (every key zone + the primary scenario's path) onto the chart in one image, instead
  // of one scenario at a time. Caches on entry.aiAnalysisResult.wholeVisualization (a sibling of
  // scenario.aiVisualization - see liveSessionView.jsx's updateAnalysisVisualization()).
  // ------------------------------------------------------------------------------------------
  function analysisVisualizationFingerprint(entry, analysisId) {
    return ['viz-analysis', entry && entry.id, analysisId, entryImageIdentity(entry)].join('|');
  }

  function findCachedAnalysisVisualization(entry, fingerprint) {
    var v = entry && entry.aiAnalysisResult && entry.aiAnalysisResult.wholeVisualization;
    return (v && v.fingerprint === fingerprint) ? v : null;
  }

  // Derives the small, already-known subset of a real, already-completed analysis result the
  // server-side prompt builder needs (server/pattern-ai-server.mjs's
  // buildAnalysisVisualizationPrompt()) - never a second analyzeSession() call, purely reshaping
  // data the trader is already looking at. Gathers zones from every key_zones-type block (not just
  // one) and the primary-role scenario's own visualizationBrief, when either exists.
  function buildAnalysisSnapshot(analysisResult) {
    var keyZones = [];
    (analysisResult.blocks || []).forEach(function (block) {
      if (block && block.type === 'key_zones' && Array.isArray(block.zones)) keyZones = keyZones.concat(block.zones);
    });
    var primaryScenario = (analysisResult.scenarios || []).find(function (s) { return s.role === 'primary'; }) || null;
    return {
      thesisHeadline: (analysisResult.thesis && analysisResult.thesis.headline) || '',
      keyZones: keyZones,
      primaryScenario: primaryScenario ? primaryScenario.visualizationBrief : null
    };
  }

  // options: { entry, analysisResult, language, apiKey, forceRegenerate }
  async function visualizeAnalysis(options) {
    var opts = options || {};
    var fingerprint = analysisVisualizationFingerprint(opts.entry, opts.analysisResult && opts.analysisResult.analysisId);
    if (!opts.forceRegenerate) {
      var cached = findCachedAnalysisVisualization(opts.entry, fingerprint);
      if (cached) return { ok: true, cached: true, visualization: cached };
    }
    var chartImage = await resolveEntryImageDataUrl(opts.entry, { maxDimension: 2048 });
    if (!chartImage) return { ok: false, error: 'CHART_IMAGE_REQUIRED', status: 400 };

    var settings = aiSettings();
    var apiKey = opts.apiKey || (settings ? settings.getKey('openai') : '');
    var response;
    try {
      response = await fetch('/api/sessions/visualize-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartImage: chartImage, analysisSnapshot: buildAnalysisSnapshot(opts.analysisResult || {}), language: opts.language || 'fa', apiKey: apiKey || undefined })
      });
    } catch (_) {
      return { ok: false, error: 'NETWORK_ERROR', status: 0 };
    }
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) return { ok: false, error: payload.error || 'VISUALIZATION_FAILED', status: response.status };

    if (aiUsage()) aiUsage().record({ provider: payload.provider, usage: payload.usage, source: 'sessions.analysisVisualization' });

    // Same reasoning as visualizeScenario()'s own uploadGeneratedImage() call above - only a small
    // /uploads/... URL, never the raw multi-MB base64 pixels, ever gets embedded in the session
    // record this then gets persisted onto (entry.aiAnalysisResult.wholeVisualization).
    var uploadedUrl = await uploadGeneratedImage(payload.data && payload.data.imageDataUrl);
    if (!uploadedUrl) return { ok: false, error: 'VISUALIZATION_SAVE_FAILED', status: 0 };
    var visualization = { status: 'ready', imageDataUrl: uploadedUrl, fingerprint: fingerprint, generatedAt: new Date().toISOString() };
    return { ok: true, cached: false, visualization: visualization };
  }

  window.TradeJournalSessionAnalysisClient = {
    resolveEntryImageDataUrl: resolveEntryImageDataUrl,
    entryImageIdentity: entryImageIdentity,
    isScenarioActive: isScenarioActive,
    gatherActiveScenarios: gatherActiveScenarios,
    gatherPatternContext: gatherPatternContext,
    gatherSimilarSessions: gatherSimilarSessions,
    buildMemoryReceipt: buildMemoryReceipt,
    findCachedAnalysis: findCachedAnalysis,
    analyzeSession: analyzeSession,
    computeAnalysisPatches: computeAnalysisPatches,
    scenarioAlreadyAdded: scenarioAlreadyAdded,
    buildScenarioDraftFromAi: buildScenarioDraftFromAi,
    applyScenarioEvaluationPatch: applyScenarioEvaluationPatch,
    visualizeScenario: visualizeScenario,
    findCachedVisualization: findCachedVisualization,
    hydrateScenarioVisualizations: hydrateScenarioVisualizations,
    visualizeAnalysis: visualizeAnalysis,
    buildAnalysisSnapshot: buildAnalysisSnapshot,
    findCachedAnalysisVisualization: findCachedAnalysisVisualization
  };
}());
