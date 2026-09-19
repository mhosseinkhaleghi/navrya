/**
 * Session Analysis Client — Adaptive AI Session Analysis (brief, whole document), extended by the
 * Session / Analysis Desk AI upgrade.
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

  // One-call safety bound (brief section 2: "do not silently slice ... make deferred scenarios
  // explicit and visible; never silently omit them") - raised from the original 5, and every
  // scenario beyond it is reported back as `deferredScenarios`, never dropped without a trace.
  var MAX_SCENARIOS_PER_ANALYSIS = 12;
  // Section 3 - at most 4 labelled timeframe images per analysis call.
  var MAX_TIMEFRAME_IMAGES = 4;

  // ------------------------------------------------------------------------------------------
  // Image resolution - reads whichever source a SessionEntry (or one canonical image within its
  // ordered `images[]`, section 3) actually has (IndexedDB blob, server-hosted URL, or an inline
  // preview data URL - see liveSessionView.jsx's submitChartEntry()/attachImage() for how those
  // three get set) and produces ONE compact data URL for AI transport via analysis-image-prep.js.
  // Never mutates the entry or the original image in any store. Works identically whether handed
  // the entry itself (legacy single-image path) or one of its canonical image records, since both
  // shapes use the exact same imageBlobId/imageUrl/preview field names.
  // ------------------------------------------------------------------------------------------
  async function resolveEntrySourceUrl(imageLike) {
    if (!imageLike) return null;
    if (imageLike.imageBlobId && imageStore()) {
      try {
        var blobUrl = await imageStore().loadImageUrl(imageLike.imageBlobId);
        if (blobUrl) return blobUrl;
      } catch (_) { /* fall through to other sources */ }
    }
    if (imageLike.imageUrl) return imageLike.imageUrl;
    if (imageLike.preview) return imageLike.preview;
    return null;
  }

  async function resolveEntryImageDataUrl(imageLike, options) {
    var sourceUrl = await resolveEntrySourceUrl(imageLike);
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
  function entryImageIdentity(imageLike) {
    if (!imageLike) return '';
    return String(imageLike.imageBlobId || imageLike.imageUrl || (imageLike.preview ? 'preview:' + imageLike.preview.length : '') || '');
  }

  // ------------------------------------------------------------------------------------------
  // Canonical ordered multi-image representation (section 3). A SessionEntry with a real
  // `images[]` array (the new canonical shape - see liveSessionView.jsx's ChartEntryModal) is used
  // as-is, capped at MAX_TIMEFRAME_IMAGES; a legacy entry with only its own single imageBlobId/
  // imageUrl/preview normalizes into a one-item array so every downstream reader only ever has to
  // handle the array shape (brief section 3: "preserve legacy single-image entries through
  // normalization/read fallback").
  // ------------------------------------------------------------------------------------------
  function canonicalEntryImages(entry) {
    if (!entry) return [];
    if (Array.isArray(entry.images) && entry.images.length) {
      return entry.images.slice(0, MAX_TIMEFRAME_IMAGES).map(function (img, i) {
        return {
          id: (img && img.id) || (entry.id + ':' + i),
          imageBlobId: img && img.imageBlobId, imageUrl: img && img.imageUrl, preview: img && img.preview,
          mediaAssetId: img && img.mediaAssetId, timeframe: (img && img.timeframe) || '',
          detectedTimeframe: (img && img.detectedTimeframe) || ''
        };
      });
    }
    if (entry.hasImage || entry.imageBlobId || entry.imageUrl || entry.preview) {
      return [{
        id: entry.id + ':primary', imageBlobId: entry.imageBlobId, imageUrl: entry.imageUrl, preview: entry.preview,
        mediaAssetId: entry.mediaAssetId, timeframe: entry.timeframe || '', detectedTimeframe: ''
      }];
    }
    return [];
  }

  // The identity list used by the fingerprint (section 6: "ordered multi-image identities/
  // timeframes") - only meaningful once an entry genuinely has more than the legacy single image;
  // see analyzeSession()'s own comment on why a plain legacy entry never passes this array through
  // (keeps the pre-existing single-image fingerprint shape byte-for-byte unchanged).
  function entryImagesIdentity(entry) {
    return canonicalEntryImages(entry).map(function (img) { return entryImageIdentity(img) + ':' + (img.timeframe || ''); });
  }

  // Resolves every canonical image to a compact transport-ready {id, timeframe, dataUrl} - the
  // shape server/pattern-ai-server.mjs's analyzeSession() labels before each image's own content
  // block (brief section 3: "explicitly labelled with their image ID and timeframe"). An image that
  // fails to resolve (a broken blob reference) is dropped rather than sent as a hole in the array -
  // "analyze exactly the supplied images" only ever refers to ones that genuinely made it through.
  async function resolveEntryImagesForTransport(entry, options) {
    var images = canonicalEntryImages(entry);
    var out = [];
    for (var i = 0; i < images.length; i++) {
      var dataUrl = await resolveEntryImageDataUrl(images[i], options);
      if (dataUrl) out.push({ id: images[i].id, timeframe: images[i].timeframe || '', dataUrl: dataUrl });
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------
  // Compact context gathering - brief §39 "never serialize entire stores into the prompt".
  // ------------------------------------------------------------------------------------------

  function flatScenarios(session) {
    var out = [];
    (session.entries || []).forEach(function (e) { (e.scenarios || []).forEach(function (s) { out.push({ entry: e, scenario: s }); }); });
    return out;
  }

  // Delegates to the one canonical predicate (session-analysis-schema.js's isScenarioActiveState) -
  // fixes the pre-existing confirmedInvalidationTagIds typo (the real, canonical field is
  // invalidationTagIds - session-analysis-modal's own buildSessionContextRefs() had the same typo,
  // fixed alongside this) and additionally treats status==='invalidated' or a latest logged
  // probability of 0 as inactive (this upgrade's section 2 requirement), so every "is this scenario
  // still active" check in this domain agrees.
  function isScenarioActive(scenario) {
    var s = schema();
    return s ? s.isScenarioActiveState(scenario) : (!scenario.occurred && !((scenario.invalidationTagIds || []).length));
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

  // The real, full eligible-active list (no cap) minus whatever gatherActiveScenarios() above
  // already included - the honest "what did not fit in this one call" list (brief section 2:
  // "make deferred scenarios explicit and visible"). id/title only - a deferred scenario is not
  // analyzed this pass, so nothing more should be implied about it.
  function gatherDeferredScenarios(session, includedIds) {
    var included = new Set(includedIds || []);
    return flatScenarios(session)
      .filter(function (x) { return isScenarioActive(x.scenario) && !included.has(x.scenario.id); })
      .map(function (x) { return { id: x.scenario.id, title: x.scenario.title || '' }; });
  }

  // A compact 'id:status:probability' signature per active scenario (this upgrade's section 6
  // fingerprint requirement: "active scenario state/probability history") - changes the instant a
  // scenario's status or latest probability changes, so a cached analysis is never reused across a
  // real state change even when nothing else about the request differs.
  function activeScenarioStateSignature(activeScenarios) {
    return (activeScenarios || []).map(function (s) { return s.id + ':' + s.status + ':' + s.probability; });
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

  // ------------------------------------------------------------------------------------------
  // Timeline note feedback (brief 1.A). Only notes NOT already reviewed (per the session's own
  // compact noteReceipts) are gathered - an edited note's changed content fingerprint makes it
  // eligible again automatically, since the comparison is by revision, not by entryId/field alone.
  // ------------------------------------------------------------------------------------------
  function gatherPendingNotes(session, memory) {
    var s = schema();
    if (!s) return [];
    var reviewed = {};
    ((memory && memory.noteReceipts) || []).forEach(function (r) { reviewed[r.entryId + ':' + r.field] = r.revision; });
    var out = [];
    (session.entries || []).forEach(function (entry) {
      ['note', 'movementNote'].forEach(function (field) {
        var text = entry[field];
        if (!text || !String(text).trim()) return;
        var trimmed = String(text).trim();
        var revision = s.noteRevision(trimmed);
        if (reviewed[entry.id + ':' + field] === revision) return;
        out.push({ entryId: entry.id, field: field, revision: revision, text: trimmed.slice(0, 600) });
      });
    });
    return out.slice(0, 20);
  }

  // ------------------------------------------------------------------------------------------
  // Unresolved-item lifecycle (brief 1.C) - the compact open/partially-resolved items from the
  // session's own memory, sent as context so a later analysis can compare new evidence against
  // them; a legacy string-shaped stored item degrades to a plain description with no id continuity
  // (there is nothing more specific to carry forward for one written before this upgrade).
  // ------------------------------------------------------------------------------------------
  function gatherOpenUnresolvedItems(memory) {
    var items = (memory && memory.unresolvedItems) || [];
    return items.filter(function (item) { return item.status === 'open' || item.status === 'partially_resolved'; });
  }
  function unresolvedRevisionSignature(items) {
    return (items || []).map(function (item) { return item.id + ':' + item.status; }).sort().join(',');
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
      activeScenarioCount: gatherActiveScenarios(session || {}, 999).length,
      hasPreviousSession: !!(session && (session.previousSessionSummary || session.fateSummary)),
      watchItemCount: memory ? (memory.watchItems || []).length : 0,
      pendingNoteCount: gatherPendingNotes(session || {}, memory).length,
      openUnresolvedCount: gatherOpenUnresolvedItems(memory).length
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

  // '<registryVersion>.<contentRevision>' (or just the registry version for a context that predates
  // the revision hash, or 0 for no profile at all).
  function profileVersionFor(analysisContext) {
    var profile = analysisContext && analysisContext.profile;
    if (!profile) return 0;
    var registryVersion = profile.registryVersion || 0;
    return profile.revision ? registryVersion + '.' + profile.revision : registryVersion;
  }

  function pickAdherenceProfile(analysisContext, adherence) {
    if (!analysisContext) return null;
    return {
      primaryStyle: analysisContext.primaryStyle || null,
      secondaryStyles: analysisContext.secondaryStyles || [],
      focuses: analysisContext.focuses || [],
      customFocuses: analysisContext.customFocuses || [],
      customMethodNotes: analysisContext.customMethodNotes || '',
      // Engine memory (Phase 2) - the trader's taught concepts/understanding, data the server
      // weaves into the prompt (never an instruction to follow blindly - see the system prompt's
      // own framing).
      concepts: analysisContext.concepts || [],
      understanding: analysisContext.understanding || '',
      adherence: adherence,
      // Section 4 - the union of every involved style/focus's declared requiredInputs, echoed to
      // the server so the prompt can ask the model to honestly report unavailable evidence instead
      // of inventing an indicator value it cannot actually see.
      requiredInputs: analysisContext.requiredInputs || []
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
    // A canonical multi-image entry (section 3) only ever changes fingerprint/transport shape once
    // it genuinely carries more than the legacy single image - see entryImagesIdentity()'s own
    // comment for why a plain legacy entry keeps the exact pre-existing fingerprint string.
    var hasMultiImages = Array.isArray(entry && entry.images) && entry.images.length > 0;
    var hasImage = hasMultiImages || !!imageIdentity;

    if (hasImage && !capabilities.supportsVision) {
      return { ok: false, error: 'MODEL_VISION_UNSUPPORTED', status: 422 };
    }

    var depth = s ? s.resolveAnalysisDepth(opts.depth, opts.depthSignals) : (opts.depth || 'auto');
    var memory = session && session.aiSessionAnalysisResult && session.aiSessionAnalysisResult.memory;
    var pendingNotes = gatherPendingNotes(session, memory);
    var openUnresolved = gatherOpenUnresolvedItems(memory);
    var activeScenarios = gatherActiveScenarios(session, MAX_SCENARIOS_PER_ANALYSIS);
    var deferredScenarios = gatherDeferredScenarios(session, activeScenarios.map(function (a) { return a.id; }));
    var userInstruction = (opts.userView || '').trim();

    var fingerprint = s ? s.buildAnalysisFingerprint({
      sessionId: session && session.id, entryId: entry && entry.id, imageIdentity: imageIdentity,
      imageIdentities: hasMultiImages ? entryImagesIdentity(entry) : undefined,
      provider: opts.provider, model: opts.model, analysisType: analysisType,
      // registryVersion alone never moves when a trader edits their profile - the content revision
      // (analysis-context.js) does, so an edited profile can never be answered from a stale cache.
      profileId: opts.profileId, profileVersion: profileVersionFor(opts.analysisContext),
      memoryVersion: memory ? memory.eventCount : 0, depth: depth, scenarioTargets: opts.scenarioTargets,
      userInstruction: userInstruction,
      pendingNoteRevisions: pendingNotes.map(function (n) { return n.entryId + ':' + n.field + ':' + n.revision; }),
      activeScenarioState: activeScenarioStateSignature(activeScenarios),
      unresolvedRevision: unresolvedRevisionSignature(openUnresolved)
    }) : '';

    if (!opts.forceRegenerate) {
      var cached = findCachedAnalysis(session, entry, fingerprint);
      if (cached) return { ok: true, cached: true, result: cached };
    }

    var transportImages = hasImage ? await resolveEntryImagesForTransport(entry) : [];
    var apiKey = settings ? settings.getKey(opts.provider) : '';

    var body = {
      provider: opts.provider, model: opts.model, apiKey: apiKey || undefined,
      language: opts.language || 'fa', analysisType: analysisType, depth: depth,
      // AI Analysis Discipline (server/community/ai-discipline.mjs) - identity only, so the
      // gateway can record a completion receipt against the SAME Session/entry once its own
      // provider call actually succeeds (server/pattern-ai-server.mjs). Never itself sufficient
      // evidence of anything: the server re-verifies session/entry ownership before recording.
      sessionId: session && session.id, entryId: entry && entry.id,
      analysisProfile: pickAdherenceProfile(opts.analysisContext, opts.adherence),
      adherence: opts.adherence || 'balanced',
      // "Your view and instruction" (brief 1.B) - the wire field name (userView) is kept for
      // backward compatibility with the server's own existing body.userView reader; only the
      // modal-facing label/help text changed.
      userView: userInstruction,
      sessionMemory: (analysisType !== 'initial' && memory) ? memory : null,
      marketContext: { market: session && session.market, timeframe: (entry && entry.timeframe) || (session && session.timeframe), instrument: session && session.instrument, date: entry && (entry.gregorianDate || entry.createdAt) },
      historicalContext: analysisType === 'initial' ? {
        previousSessionSummary: (session && session.previousSessionSummary && (session.previousSessionSummary.note || session.previousSessionSummary.fateSummaryText)) || '',
        similarSessions: await gatherSimilarSessions(session, opts.character, 3)
      } : null,
      patternContext: gatherPatternContext(session, 6),
      activeScenarios: activeScenarios,
      deferredScenarios: deferredScenarios,
      scenarioTargets: analysisType === 'scenario_evaluation' ? (opts.scenarioTargets || []) : [],
      images: transportImages,
      // Section 1.A - untrusted DATA the model must analyze, never an instruction; server-side
      // validation drops any returned noteFeedback item whose noteRef does not exactly match one
      // of these (never let a hallucinated id mark a real note as reviewed).
      pendingNoteRefs: pendingNotes.map(function (n) { return { entryId: n.entryId, field: n.field, revision: n.revision, text: n.text }; }),
      // Section 1.C - the trader's own previously-open unresolved items, so the model can compare
      // new evidence against them and report open/partially_resolved/resolved/superseded.
      openUnresolvedItems: openUnresolved.map(function (item) { return { id: item.id, description: item.description, whyItMatters: item.whyItMatters, missingEvidence: item.missingEvidence }; })
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
      entryId: entry && entry.id,
      requiredInputsFlagged: (opts.analysisContext && opts.analysisContext.requiredInputs) || []
    });
    // Deferred scenarios are NAVRYA's own computed list (brief: "never silently omit them"), not
    // model output - attached after normalization so a malformed/partial provider response can
    // never suppress this honest disclosure.
    normalized.deferredScenarios = deferredScenarios;
    return { ok: true, cached: false, result: normalized };
  }

  // ------------------------------------------------------------------------------------------
  // Deterministic persistence patches - the CALLER (liveSessionView.jsx) applies these through
  // the real persist()/addScenario()/updateScenario() functions; this file never touches
  // window.TradeJournalWorkspace itself (brief §20).
  // ------------------------------------------------------------------------------------------

  // brief §2: "store the analysis on the relevant Session Entry, derive/update compact Session
  // Memory deterministically, persist through the EXISTING Session persistence/sync path."
  //
  // Extended by this upgrade (section 2): a normal initial/update analysis now also evaluates
  // every eligible active scenario in the SAME response (brief: "reuse the same deterministic
  // patch function and persistence path" as the explicit Evaluate-with-AI action) - `scenarioPatches`
  // below is that set, computed with the exact same applyScenarioEvaluationPatch() the manual route
  // already uses, ready for the caller to Object.assign() onto each real scenario inside the SAME
  // persist() mutator as entryPatch/sessionPatch (one save() call, one activity-log entry).
  //
  // Note-receipt validation (brief 1.A, defense in depth on top of the server's own authoritative
  // check): re-derives the exact set of note refs THIS analysis call would have sent, straight from
  // (session, previousMemory) via gatherPendingNotes() - the same deterministic function
  // analyzeSession() itself used to build the request - rather than trusting a caller-supplied
  // list, so a hallucinated noteRef can never mark a real note "reviewed" even if it somehow
  // slipped past the server.
  function computeAnalysisPatches(session, normalizedResult) {
    var s = schema();
    var previousMemory = session.aiSessionAnalysisResult && session.aiSessionAnalysisResult.memory;
    var activeRefs = gatherActiveScenarios(session, 999).map(function (x) { return x.id; });
    var patternRefs = gatherPatternContext(session, 999).map(function (x) { return x.patternTagId; });

    var knownNoteRefs = gatherPendingNotes(session, previousMemory);
    var validNoteFeedback = (normalizedResult.noteFeedback || []).filter(function (item) {
      return knownNoteRefs.some(function (ref) { return ref.entryId === item.noteRef.entryId && ref.field === item.noteRef.field && ref.revision === item.noteRef.revision; });
    });
    var priorReceipts = (previousMemory && previousMemory.noteReceipts) || [];
    var receiptKey = function (r) { return r.entryId + ':' + r.field; };
    var receiptMap = {};
    priorReceipts.forEach(function (r) { receiptMap[receiptKey(r)] = r; });
    validNoteFeedback.forEach(function (item) { receiptMap[receiptKey(item.noteRef)] = { entryId: item.noteRef.entryId, field: item.noteRef.field, revision: item.noteRef.revision }; });
    var noteReceipts = Object.keys(receiptMap).map(function (k) { return receiptMap[k]; }).slice(-60);

    // Fold this analysis's own returned unresolvedItems into the compact open/resolved memory -
    // an item continuing a previously-known id (matched exactly) replaces it; a genuinely new one
    // is appended. Anything the model dropped entirely (no longer mentioned) is left as-is rather
    // than assumed resolved - only an explicit status change counts.
    var priorUnresolved = (previousMemory && previousMemory.unresolvedItems) || [];
    var unresolvedMap = {};
    priorUnresolved.forEach(function (item) { unresolvedMap[item.id] = item; });
    (normalizedResult.unresolvedItems || []).forEach(function (item) {
      unresolvedMap[item.id] = { id: item.id, status: item.status, description: item.description, whyItMatters: item.whyItMatters, missingEvidence: item.missingEvidence, action: item.action };
    });
    var unresolvedItemsForMemory = Object.keys(unresolvedMap).map(function (k) { return unresolvedMap[k]; }).slice(0, 8);

    var memory = s.buildSessionMemory(previousMemory, normalizedResult, {
      activeScenarioRefs: activeRefs, importantPatternRefs: patternRefs, noteReceipts: noteReceipts, unresolvedItems: unresolvedItemsForMemory
    });

    // Section 2: fold every returned scenario evaluation into a real patch against its own real,
    // currently-persisted Scenario - found by id across the whole session (an evaluation may
    // legitimately target a scenario that lives on a different Entry than the one analyzed).
    // Never applied for a cache hit (the caller only calls computeAnalysisPatches for a FRESH
    // result - see liveSessionView.jsx's applyAnalysisResult, which is never invoked merely to
    // redisplay a cached one).
    var scenarioPatches = [];
    (normalizedResult.scenarioEvaluations || []).forEach(function (evaluation) {
      var match = flatScenarios(session).find(function (x) { return x.scenario.id === evaluation.scenarioId; });
      if (!match) return;
      var patch = s.applyScenarioEvaluationPatch(match.scenario, evaluation, {
        sourceEntryId: normalizedResult.entryId, analysisId: normalizedResult.analysisId, provider: normalizedResult.provider, model: normalizedResult.model
      });
      scenarioPatches.push({ entryId: match.entry.id, scenarioId: match.scenario.id, patch: patch });
    });

    return {
      entryPatch: normalizedResult.entryId ? { aiAnalysisResult: normalizedResult } : null,
      sessionPatch: {
        aiSessionAnalysisResult: { version: s.VERSION, memory: memory, latestAnalysis: normalizedResult, updatedAt: normalizedResult.generatedAt }
      },
      scenarioPatches: scenarioPatches
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

  // brief §22/§19 (section 2 of this upgrade removes the old UPDATE-time prohibition, but the
  // deterministic mechanics are unchanged): append-only probability history, never overwritten.
  // Delegates to session-analysis-schema.js's own applyScenarioEvaluationPatch so the normal-
  // analysis path (computeAnalysisPatches above) and this explicit manual-evaluation path share
  // the exact one implementation, never two.
  function applyScenarioEvaluationPatch(scenario, evaluation, ctx) {
    var s = schema();
    return s.applyScenarioEvaluationPatch(scenario, evaluation, ctx);
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
    canonicalEntryImages: canonicalEntryImages,
    entryImagesIdentity: entryImagesIdentity,
    resolveEntryImagesForTransport: resolveEntryImagesForTransport,
    isScenarioActive: isScenarioActive,
    gatherActiveScenarios: gatherActiveScenarios,
    gatherDeferredScenarios: gatherDeferredScenarios,
    gatherPatternContext: gatherPatternContext,
    gatherSimilarSessions: gatherSimilarSessions,
    gatherPendingNotes: gatherPendingNotes,
    gatherOpenUnresolvedItems: gatherOpenUnresolvedItems,
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
    findCachedAnalysisVisualization: findCachedAnalysisVisualization,
    MAX_SCENARIOS_PER_ANALYSIS: MAX_SCENARIOS_PER_ANALYSIS,
    MAX_TIMEFRAME_IMAGES: MAX_TIMEFRAME_IMAGES
  };
}());
