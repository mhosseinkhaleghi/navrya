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

  function snapshot() {
    var store = window.TradeJournalNavryaStore;
    var state = store && typeof store.getState === 'function' ? store.getState() : null;
    var workflowEngine = window.TradeJournalAIWorkflowEngine;
    var liveSession = window.TradeJournalNavryaLiveSession;
    var sessionId = liveSession && typeof liveSession.getActiveSessionId === 'function' ? liveSession.getActiveSessionId() : null;
    return {
      navigation: { activeId: state ? state.activeId : null },
      activeEntities: { sessionId: sessionId || null, scenarioId: sessionId ? activeScenarioId() : null, entryId: sessionId ? activeEntryId() : null },
      workflow: workflowEngine ? workflowEngine.current() : null
    };
  }

  window.TradeJournalAIContextEngine = { snapshot: snapshot };
}());
