(function () {
  'use strict';
  // Minimal, provider-independent snapshot of "where the user is right now" - the seed of the
  // fuller multi-domain Context Engine the NAVRYA AI Copilot architecture describes (navigation,
  // active entities, active workflow, available actions). Journey A's MVP scope was navigation
  // only; Journey B (trade planning) needs real entity resolution too - a Trade started from an
  // active Session/Scenario must inherit that real source relationship (ARCHITECTURE.md's
  // liveSessionView.jsx already threads source.sessionId/scenarioId through openLogWizard() the
  // same way for a manual "Start Trade" click) - so activeEntities is no longer always empty.
  //
  // sessionId: window.TradeJournalNavryaLiveSession.getActiveSessionId() (character-app.jsx
  // exposes navrya-src/liveSessionSignal.js's getLiveSessionId() there, alongside the .open()
  // hook Journey A already used) - null when no session workspace is open.
  //
  // scenarioId: resolved from the currently active AI process, not a new state channel of its
  // own. liveSessionView.jsx already registers each expanded scenario card as its own process,
  // 'live-session-scenario-' + scenario.id (see ARCHITECTURE.md 7.14) - activeOpenProcess()
  // already picks whichever one the user most recently touched. "This scenario" resolves to that
  // one and only that one; two simultaneously-expanded cards are not disambiguated here (the
  // registry's own "most recently touched wins" rule already makes that choice), and no scenario
  // expanded at all correctly yields no scenario context, never a guess.
  function activeScenarioId() {
    var registry = window.TradeJournalAIProcessRegistry;
    var active = registry && registry.activeOpenProcess();
    if (!active || active.id.indexOf('live-session-scenario-') !== 0) return null;
    return active.id.slice('live-session-scenario-'.length);
  }

  // Journey F, F19/F20: liveSessionView.jsx's own EntryDetailPanel comment already documents that
  // only one is ever mounted/registered at a time ("the parent renders this with key={entry.id}...
  // React genuinely remounts a fresh instance per selected entry") - the exact same
  // "activeOpenProcess() already picks whichever one is open" reasoning activeScenarioId() above
  // already established, just applied to 'live-session-entry-' instead. Needed because a Scenario
  // belongs to an Entry, not directly to a Session (addScenario(entry) in liveSessionView.jsx) -
  // session.scenario.create resolves which real Entry to attach to from this, never a guess.
  function activeEntryId() {
    var registry = window.TradeJournalAIProcessRegistry;
    var active = registry && registry.activeOpenProcess();
    if (!active || active.id.indexOf('live-session-entry-') !== 0) return null;
    return active.id.slice('live-session-entry-'.length);
  }

  // Journey F, F22: tradeDetailsModal.jsx's own 'trade-details-' + trade.id registration
  // (allowlist: [], purely so this file can resolve "this trade" - the exact same reason
  // 'trade-details-{id}' was already excluded from activeProcess in chat-dock-core.js's own
  // empty-allowlist rule) is the real, existing "which Trade is the user currently looking at"
  // signal - trade.calculator's own resultContext already opens it the instant a new Trade is
  // created, and the dashboard's own "eye" button opens it for an existing one. Same
  // activeOpenProcess() pattern as activeScenarioId()/activeEntryId() above - never a guess.
  function activeTradeId() {
    var registry = window.TradeJournalAIProcessRegistry;
    var active = registry && registry.activeOpenProcess();
    if (!active || active.id.indexOf('trade-details-') !== 0) return null;
    return active.id.slice('trade-details-'.length);
  }

  // Journey F, F27-31: patternRegistryView.jsx's/strategyEducationView.jsx's own real
  // 'pattern-editor-{id}'/'strategy-editor-{id}' registrations (non-empty allowlists - name,
  // description, etc. - already AI-fillable today) are the real "which Pattern/Strategy is
  // currently open" signal. marketplace.publish resolves from these directly - never a guess
  // among several Patterns/Strategies, and never reconstructed from chat history.
  function activePatternId() {
    var registry = window.TradeJournalAIProcessRegistry;
    var active = registry && registry.activeOpenProcess();
    if (!active || active.id.indexOf('pattern-editor-') !== 0) return null;
    return active.id.slice('pattern-editor-'.length);
  }
  function activeStrategyId() {
    var registry = window.TradeJournalAIProcessRegistry;
    var active = registry && registry.activeOpenProcess();
    if (!active || active.id.indexOf('strategy-editor-') !== 0) return null;
    return active.id.slice('strategy-editor-'.length);
  }

  // Journey F, F26: communityView.jsx's own 'community-comment-' + post.id registration (already
  // real, per-post, exactly like Scenario cards) is the "which post's comments are open" signal.
  function activePostId() {
    var registry = window.TradeJournalAIProcessRegistry;
    var active = registry && registry.activeOpenProcess();
    if (!active || active.id.indexOf('community-comment-') !== 0) return null;
    return active.id.slice('community-comment-'.length);
  }

  // Journey F, F27-31: 'marketplace-listing-' + listing.id (new - see marketplaceView.jsx) is
  // deliberately separate from the pre-existing 'marketplace-rate-' + listing.id (RatingsPanel's
  // own registration, whose isOpen() reflects real rating eligibility, not "is this listing
  // being viewed at all" - a seller viewing their own listing, or the market itself unlocked,
  // would otherwise never resolve as "this listing" for marketplace.publish/messageSeller, which
  // have nothing to do with rating eligibility).
  function activeListingId() {
    var registry = window.TradeJournalAIProcessRegistry;
    var active = registry && registry.activeOpenProcess();
    if (!active || active.id.indexOf('marketplace-listing-') !== 0) return null;
    return active.id.slice('marketplace-listing-'.length);
  }

  function snapshot() {
    var store = window.TradeJournalNavryaStore;
    var state = store && typeof store.getState === 'function' ? store.getState() : null;
    var workflowEngine = window.TradeJournalAIWorkflowEngine;
    var liveSession = window.TradeJournalNavryaLiveSession;
    var sessionId = liveSession && typeof liveSession.getActiveSessionId === 'function' ? liveSession.getActiveSessionId() : null;
    return {
      navigation: { activeId: state ? state.activeId : null },
      activeEntities: {
        sessionId: sessionId || null, scenarioId: sessionId ? activeScenarioId() : null, entryId: sessionId ? activeEntryId() : null,
        tradeId: activeTradeId(), patternId: activePatternId(), strategyId: activeStrategyId(),
        postId: activePostId(), listingId: activeListingId()
      },
      workflow: workflowEngine ? workflowEngine.current() : null
    };
  }

  window.TradeJournalAIContextEngine = { snapshot: snapshot };
}());
