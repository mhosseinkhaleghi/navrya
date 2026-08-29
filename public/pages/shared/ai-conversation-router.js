(function () {
  'use strict';
  // ai-conversation-router.js — Journey H2, Gate 2: production Conversation Router.
  //
  // Gate 1 shipped this file with a hardcoded 7-scenario array and its own inline normalize/
  // scoring logic. Gate 2 moved scenario authoring entirely into Conversation Studio (admin-only,
  // Postgres-backed, versioned/publishable - see docs/ai/conversation-studio.md) and extracted the
  // matching engine into ai-conversation-matcher.js so there is exactly one implementation shared
  // by this file, the admin Trigger Lab, and server-side publish validation. This file is now a
  // thin wrapper: fetch/cache the published scenario bundle, resolve the two code-owned
  // data-query resolvers, and render the winning scenario's stored response text - the actual
  // normalize()/matchScenarios() logic lives in ai-conversation-matcher.js.
  //
  // No hardcoded scenario library remains here - a fetch failure with no prior cache simply means
  // an empty scenario list, and every turn safely falls through to the ordinary AI path (see
  // docs/ai/conversation-router.md's "explicitly deferred"/fallback sections). This is the next
  // deterministic fast path in chat-dock-core.js's own chain (safety preflight -> Journey C
  // pending confirmation -> Companion opening reply -> F37 gate yes/no -> single-missing-field
  // slot fill -> [this router, generic mode] -> the ordinary LLM path), plus a second,
  // narrower admission mode (surface-help) that runs even while a real form is open - see
  // chat-dock-core.js's own integration comment for the exact two-mode admission rule.

  var BUNDLE_STORAGE_KEY = 'tradejournal:conversation-scenarios-bundle:v1';
  var REFRESH_INTERVAL_MS = 5 * 60 * 1000; // lazy, checked at call time - never a polling timer

  var bundleState = { scenarios: [], version: null, fetchedAt: 0 };

  // Synchronous, instant - route() must never block on a network round trip. A missing/corrupt
  // cache is not an error: bundleState just stays empty, which is always the safe default
  // (everything falls through to the LLM until a real fetch succeeds).
  (function loadCachedBundleFromStorage() {
    try {
      var raw = localStorage.getItem(BUNDLE_STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.scenarios)) bundleState = { scenarios: parsed.scenarios, version: parsed.version || null, fetchedAt: 0 };
    } catch (_e) { /* corrupt/unavailable cache - start empty, safe default */ }
  }());

  var refreshInFlight = null;
  function refreshBundle() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = fetch('/api/sync/conversation-scenarios').then(function (response) {
      if (!response.ok) throw new Error('BUNDLE_FETCH_FAILED');
      return response.json();
    }).then(function (body) {
      if (body && Array.isArray(body.scenarios)) {
        bundleState = { scenarios: body.scenarios, version: body.version || null, fetchedAt: Date.now() };
        try { localStorage.setItem(BUNDLE_STORAGE_KEY, JSON.stringify({ scenarios: body.scenarios, version: body.version || null })); } catch (_e) { /* storage unavailable - in-memory cache still updated for this page load */ }
      }
    }).catch(function () { /* best-effort - a failed refresh keeps whatever bundle is already cached, never throws, never clears a still-valid cache */ });
    refreshInFlight.then(function () { refreshInFlight = null; }, function () { refreshInFlight = null; });
    return refreshInFlight;
  }
  // Fire-and-forget, called from route() itself - no separate boot-time call needed, and no
  // dependency on character-app.jsx's own boot gate (this bundle is public, non-user-owned
  // content; coupling it to that gate would risk delaying first paint for a feature that must
  // degrade to "just fall through to the LLM" on any failure, per docs/ai/conversation-router.md).
  function ensureBundleFresh() {
    if ((Date.now() - bundleState.fetchedAt) > REFRESH_INTERVAL_MS) refreshBundle();
  }

  // --- Data-query resolvers (code-owned; Studio only ever authors trigger wording + the response
  // template that renders their output - see docs/ai/conversation-studio.md's responsibility
  // boundary). Unchanged from Gate 1, now looked up by the bundle's own dataQueryRef string. ---
  function resolveOpenTradeCount() {
    var store = window.TradeJournalTradeStore;
    if (!store || typeof store.listSync !== 'function') return null;
    var trades;
    try { trades = store.listSync() || []; } catch (_e) { return null; }
    return { count: trades.filter(function (t) { return t && t.status === 'open'; }).length };
  }
  function resolveDefaultRisk() {
    var store = window.TradeJournalTradeStore;
    if (!store || typeof store.settings !== 'function') return null;
    var settings;
    try { settings = store.settings() || {}; } catch (_e) { return null; }
    var value = Number(settings.defaultRiskPercent);
    return isFinite(value) ? { value: value } : null;
  }
  var DATA_QUERY_RESOLVERS = { 'trade.open_count': resolveOpenTradeCount, 'trade.default_risk': resolveDefaultRisk };

  var lastMatch = null;
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  function surfaceSnapshot() {
    try {
      var surfaceCtx = window.TradeJournalAISurfaceContext;
      if (!surfaceCtx || typeof surfaceCtx.snapshot !== 'function') return {};
      var snap = surfaceCtx.snapshot() || {};
      return { page: snap.page ? String(snap.page).toLowerCase() : null, step: snap.step || null };
    } catch (_e) { return {}; }
  }

  function currentLanguage() {
    var i18n = window.TradeJournalAII18n;
    return (i18n && typeof i18n.language === 'function' && i18n.language()) || 'en';
  }

  // Selects which bundle scenarios are even eligible for THIS turn, before scoring - the real
  // admission boundary lives here, not in the matcher (which has no notion of activeProcess/
  // workflow state). mode:'generic' is Gate 1's exact original rule (FAQ/data-query only, never
  // while any process/workflow is genuinely occupying the turn); mode:'surface_help' is Gate 2's
  // new narrow exception (chat-dock-core.js's own comment documents exactly when each mode runs).
  function eligibleScenarios(matcher, mode, context) {
    var flattened = bundleState.scenarios.map(matcher.scenarioFromBundleRow);
    if (mode === 'surface_help') {
      var processId = (context && context.activeProcessId) || '';
      var step = (context && context.step) || null;
      return flattened.filter(function (s) {
        if (s.kind !== 'surface_help') return false;
        if (!s.allowedProcesses || !s.allowedProcesses.length) return false;
        var processMatch = s.allowedProcesses.some(function (prefix) { return processId.indexOf(prefix) === 0; });
        if (!processMatch) return false;
        if (s.allowedSteps && s.allowedSteps.length) return step !== null && s.allowedSteps.indexOf(step) !== -1;
        return true;
      });
    }
    return flattened.filter(function (s) { return s.kind !== 'surface_help'; });
  }

  // The single entry point. `context.mode` is 'generic' (default) or 'surface_help';
  // `context.activeProcessId` is required for surface_help mode. Returns null (no safe local
  // match - caller falls through to the existing AI path unchanged) or
  // {kind, scenarioId, ctaActionId, written, voiceReply}.
  function route(text, context) {
    var t0 = now();
    ensureBundleFresh();
    var matcher = window.TradeJournalAIConversationMatcher;
    if (!matcher) return null;
    var mode = (context && context.mode) === 'surface_help' ? 'surface_help' : 'generic';
    var surface = surfaceSnapshot();
    var candidateScenarios = eligibleScenarios(matcher, mode, context);
    var result = matcher.matchScenarios(text, candidateScenarios, surface);

    var resolution = null;
    if (result.winner && result.confidenceBand === 'HIGH') {
      var scenario = result.winner.scenario;
      var lang = currentLanguage();
      // Spec section 19: a scenario matched, but with no published response for the CURRENT
      // language - never serve a different language, never runtime-translate. Fall through.
      var responseSet = scenario.responses && scenario.responses[lang];
      if (responseSet && responseSet.written) {
        if (scenario.kind === 'data_query') {
          var resolver = DATA_QUERY_RESOLVERS[scenario.dataQueryRef];
          var data = resolver ? resolver() : null;
          if (data) {
            resolution = {
              kind: 'data_query', scenarioId: scenario.scenarioKey, ctaActionId: scenario.ctaActionId,
              written: matcher.renderTemplate(responseSet.written, data),
              voiceReply: matcher.renderTemplate(responseSet.voiceReply || responseSet.written, data),
              // Never eligible for pre-generated audio (spec section 3/4) - a data_query's text is
              // rendered from a live per-user value, so it can never be one shared static clip.
              audioUrl: null, audioMimeType: null
            };
          }
        } else {
          // Journey H2, Gate 3: pre-generated audio is only ever eligible for faq/surface_help
          // kinds (never data_query, whose text is rendered from a live per-user template value -
          // enforced structurally server-side at generation time, never trusted client-side
          // either). Computed unconditionally here, exactly like voiceReply already is - the
          // CALLER (chat-dock-core.js/chatDockView.jsx) decides whether to actually use it, based
          // on whether this turn came from Voice (see docs/ai/conversation-voice-assets.md).
          var audioSlot = scenario.audio && scenario.audio[lang] && scenario.audio[lang].standard;
          resolution = {
            kind: scenario.kind, scenarioId: scenario.scenarioKey, ctaActionId: scenario.ctaActionId,
            written: responseSet.written, voiceReply: responseSet.voiceReply || responseSet.written,
            audioUrl: audioSlot ? audioSlot.url : null, audioMimeType: audioSlot ? audioSlot.mimeType : null
          };
        }
      }
    }

    lastMatch = {
      normalizedText: result.normalizedText, surfacePage: surface.page, mode: mode,
      candidates: result.candidates.map(function (c) { return { scenarioId: c.scenario.scenarioKey, score: c.score, reasons: c.reasons }; }),
      winnerScenarioId: result.winner ? result.winner.scenario.scenarioKey : null,
      confidenceBand: result.confidenceBand, scoreMargin: result.scoreMargin,
      resolution: resolution ? resolution.kind : 'none',
      // Gate 2 diagnostics (spec section 71) - never the admin authoring prompt or draft content,
      // which never leave the server in the first place (the bundle is the published-only shape).
      scenarioSource: 'published_bundle', bundleVersion: bundleState.version,
      evaluationMs: Math.round((now() - t0) * 100) / 100
    };

    return resolution;
  }

  function debugLastMatch() { return lastMatch; }

  window.TradeJournalAIConversationRouter = { route: route, debugLastMatch: debugLastMatch };
}());
