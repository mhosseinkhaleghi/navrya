(function () {
  'use strict';
  // Journey D, LAYER B: user-specific historical memory, retrieved on demand via structured
  // filters against the real stores - never a bulk dump of a store, never embeddings. Structured
  // queries (explicit id, active entity, name match, recency) are preferred over anything
  // semantic, per section 16: "Use explicit IDs, active entity, link relationships, date/recent
  // filters, name matching, structured filters before semantic methods." There is no semantic
  // fallback implemented here at all today - NAVRYA's own data is structured enough that these
  // cover every real case exercised by Journey D's own required scenarios.
  //
  // Every function is read-only and privacy-aware by construction: getRelevantPsychologyContext()
  // below is the ONLY one that ever touches window.TradeJournalMentalHealthStore, and it returns
  // the same minimal {currentStress,source,recordedAt} shape ai-proactive-engine.js's own
  // buildTradeContext() already established in Journey C - never the full profile.

  function byId(list, id) { return (list || []).find(function (x) { return x.id === id; }) || null; }
  function byNameLike(list, name) {
    var needle = String(name || '').trim().toLowerCase();
    if (!needle) return null;
    var exact = (list || []).find(function (x) { return String(x.name || '').trim().toLowerCase() === needle; });
    return exact || (list || []).find(function (x) { return String(x.name || '').trim().toLowerCase().indexOf(needle) > -1; }) || null;
  }

  // context: {activeStrategyId?, query?}. Returns at most one Strategy's own summary (never
  // implicitly substitutes a different one - section 18's own "never implicitly use another
  // Strategy") - the linked-strategy id, then a name match, in that order; null if neither
  // resolves rather than a guess.
  function getRelevantStrategies(query, context) {
    var store = window.TradeJournalStrategyEducationStore;
    if (!store || typeof store.listActive !== 'function') return [];
    var list = store.listActive();
    var ctx = context || {};
    var found = (ctx.activeStrategyId && byId(list, ctx.activeStrategyId)) || byNameLike(list, query || ctx.query);
    if (!found) return [];
    return [{
      id: found.id, name: found.name,
      positionManagement: found.positionManagement, riskManagement: found.riskManagement,
      overallFramework: found.overallFramework, aiUnderstandingSummary: found.aiUnderstandingSummary
    }];
  }

  function getRelevantPatterns(query, context) {
    var store = window.TradeJournalPatternStore;
    if (!store || typeof store.listForScenarios !== 'function') return [];
    var list = store.listForScenarios();
    var ctx = context || {};
    var found = (ctx.activePatternId && byId(list, ctx.activePatternId)) || byNameLike(list, query || ctx.query);
    if (!found) return [];
    return [{ id: found.id, name: found.name, description: found.description, completionThreshold: found.completionThreshold, stages: found.stages }];
  }

  // context: {activeSessionId?, market?, recentCount?}. "Show me my last New York session" ->
  // pass {market:'NewYork'}; a bare "recent sessions" question -> just recentCount. Structured
  // filtering only - never asks an embedding system to answer what the store can answer directly
  // (section 19).
  function getRelevantSessions(query, context) {
    // window.TradeJournalWorkspace (session-workspace-logic.js) - the real, classic-script,
    // character-scoped Session store every live-session UI already reads/writes through; the
    // real navrya-src/sessionsAdapter.js is a plain ES module with no window export of its own.
    var workspace = window.TradeJournalWorkspace;
    if (!workspace || typeof workspace.list !== 'function') return [];
    var ctx = context || {};
    if (ctx.activeSessionId) {
      var active = typeof workspace.find === 'function' ? workspace.find(ctx.activeSessionId) : byId(workspace.list(), ctx.activeSessionId);
      return active ? [{ id: active.id, name: active.name, market: active.market, timeframe: active.timeframe, status: active.status }] : [];
    }
    var list = workspace.list();
    var filtered = ctx.market ? list.filter(function (s) { return s.market === ctx.market; }) : list;
    filtered = filtered.slice().sort(function (a, b) { return new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt); });
    return filtered.slice(0, ctx.recentCount || 3).map(function (s) { return { id: s.id, name: s.name, market: s.market, timeframe: s.timeframe, status: s.status, date: s.date }; });
  }

  // context: {activeTradeId?, status?, recentCount?}. Deterministic structured Trade analytics -
  // "how many losing trades this week" must be answered from real store data, never from the LLM
  // counting raw chat context (section 20 - "The LLM explains. NAVRYA computes.").
  function getRelevantTrades(query, context) {
    var store = window.TradeJournalTradeStore;
    if (!store || typeof store.listSync !== 'function') return [];
    var ctx = context || {};
    var list = store.listSync();
    if (ctx.activeTradeId) {
      var active = byId(list, ctx.activeTradeId);
      return active ? [tradeSummary(active)] : [];
    }
    var filtered = ctx.status ? list.filter(function (t) { return t.status === ctx.status; }) : list;
    filtered = filtered.slice().sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
    return filtered.slice(0, ctx.recentCount || 5).map(tradeSummary);
  }
  function tradeSummary(t) {
    return { id: t.id, status: t.status, direction: t.direction, entryPrice: t.entryPrice, stopLoss: t.stopLoss, riskPercent: t.riskPercent, outcome: t.outcome, linkedStrategyId: t.linkedStrategyId };
  }

  // Privacy minimization (section 21): the ONLY function here that reads Psychology data, and it
  // returns exactly the same minimal, validated shape ai-proactive-engine.js's own
  // buildTradeContext() already uses - never the full profile, never unrelated intake answers.
  // Reused, not duplicated: both call through the real Proactive Engine when present so there is
  // exactly one real implementation of "what counts as a validated, current stress reading."
  var STRESS_RECENCY_MS = 24 * 60 * 60 * 1000;
  function getRelevantPsychologyContext() {
    var proactiveEngine = window.TradeJournalAIProactiveEngine;
    if (proactiveEngine && typeof proactiveEngine.buildTradeContext === 'function') {
      var ctx = proactiveEngine.buildTradeContext({ proposedFields: {} });
      return ctx.psychology ? [ctx.psychology] : [];
    }
    var mentalHealthStore = window.TradeJournalMentalHealthStore;
    if (!mentalHealthStore || typeof mentalHealthStore.load !== 'function') return [];
    var profile = mentalHealthStore.load();
    var checkIns = (profile.continuousTracking && profile.continuousTracking.preSessionCheckIns) || [];
    if (!checkIns.length) return [];
    var latest = checkIns.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })[0];
    var age = Date.now() - new Date(latest.createdAt).getTime();
    if (!(Number.isFinite(age) && age >= 0 && age <= STRESS_RECENCY_MS)) return [];
    return [{ currentStress: latest.currentStressLevel, source: 'pre_session_checkin', recordedAt: latest.createdAt }];
  }

  window.TradeJournalAIUserMemory = {
    getRelevantStrategies: getRelevantStrategies,
    getRelevantPatterns: getRelevantPatterns,
    getRelevantSessions: getRelevantSessions,
    getRelevantTrades: getRelevantTrades,
    getRelevantPsychologyContext: getRelevantPsychologyContext
  };
}());
