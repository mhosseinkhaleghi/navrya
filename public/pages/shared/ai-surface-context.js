(function () {
  'use strict';
  // Journey H1: the single "what real UI surface is the user looking at right now" resolver.
  // Additive to, not a replacement for, ai-context-engine.js's own protected snapshot() (Journey A
  // boundary - see that file's own header) - this module only composes already-live signals:
  // TradeJournalAIProcessRegistry's now layer-aware activeOpenProcess() (the actual "topmost
  // surface" answer, see that file's own comment on the foreground/background rule),
  // ai-context-engine.js's own entity resolvers, and - only when nothing is open at all -
  // ai-journey-engine.js's existing, already-deterministic nextBestStep() as the Dashboard
  // "what deserves attention" fallback (section 8 of the brief). Zero model/network calls: every
  // one of these is a synchronous, local read of state that already exists for other reasons.
  //
  // Same hash-prefix mapping ai-context-builder.js's own HASH_DOMAINS already uses (kept in sync
  // deliberately, not re-derived): Journey Engine's navigation.activeId only distinguishes the
  // three React canvas views (dashboard/strategies/settings) plus 'sessions' - psychology/
  // ai-assistant/community/account are location.hash routes instead.
  var HASH_PAGES = [
    [/^#mindset/, 'psychology'],
    [/^#ai-settings/, 'ai-assistant'],
    [/^#community/, 'community'],
    [/^#account/, 'account']
  ];
  function pageForHash(hash) {
    for (var i = 0; i < HASH_PAGES.length; i++) {
      if (HASH_PAGES[i][0].test(hash || '')) return HASH_PAGES[i][1];
    }
    return null;
  }

  function snapshot() {
    var processRegistry = window.TradeJournalAIProcessRegistry;
    var contextEngine = window.TradeJournalAIContextEngine;
    var journeyEngine = window.TradeJournalAIJourneyEngine;
    var ctx = contextEngine && typeof contextEngine.snapshot === 'function'
      ? contextEngine.snapshot()
      : { navigation: { activeId: null }, activeEntities: {}, workflow: null };

    var active = processRegistry && typeof processRegistry.activeOpenProcess === 'function' ? processRegistry.activeOpenProcess() : null;
    var processId = active ? active.id : null;
    var procSnap = processId && processRegistry && typeof processRegistry.snapshot === 'function' ? processRegistry.snapshot(processId) : null;

    var hash = (typeof window !== 'undefined' && window.location && window.location.hash) || '';
    var page = pageForHash(hash) || (ctx.navigation && ctx.navigation.activeId) || null;

    // Dashboard "what deserves attention" fallback (section 8): only consulted when no real
    // surface/workflow is open at all - a genuinely open modal/wizard/editor always wins, matching
    // the brief's own "topmost surface wins" rule extended one level further (foreground surface >
    // background page > a suggested next step).
    var fallbackNextStep = (!processId && journeyEngine && typeof journeyEngine.nextBestStep === 'function')
      ? journeyEngine.nextBestStep()
      : null;

    return {
      processId: processId,
      layer: procSnap ? procSnap.layer : null,
      step: active ? active.step : null,
      page: page,
      entities: ctx.activeEntities || {},
      fallbackNextStep: fallbackNextStep
    };
  }

  window.TradeJournalAISurfaceContext = { snapshot: snapshot };
}());
