(function () {
  'use strict';
  // Journey D: assembles the smallest context sufficient for one turn, from the three knowledge
  // layers (docs/ai/knowledge-base.md) - LAYER A (ai-knowledge-registry.js, shared product
  // knowledge), LAYER B (ai-user-memory.js, structured per-user retrieval), LAYER C (live runtime
  // state, read fresh from ai-context-engine.js's own snapshot() every call, never cached here).
  // Deterministic narrowing happens BEFORE any lexical search: the page/hash the user is
  // currently on always seeds the relevant domain set, exactly like section 12's own pipeline
  // ("Current UI domain -> Active entity -> Active workflow -> Intent hints -> Candidate
  // knowledge domains"); ai-knowledge-registry.js's own deterministic/lexical search() only ever
  // ADDS domains a message's own wording clearly references (e.g. a cross-domain question), it
  // never REPLACES the current-page domain.

  var HASH_DOMAINS = [
    [/^#mindset/, ['psychology']],
    [/^#ai-settings/, ['ai-assistant']],
    [/^#community/, ['community']],
    [/^#account/, ['account']]
  ];
  function domainsForHash(hash) {
    for (var i = 0; i < HASH_DOMAINS.length; i++) {
      if (HASH_DOMAINS[i][0].test(hash || '')) return HASH_DOMAINS[i][1];
    }
    return [];
  }
  // Journey Engine's own navigation.activeId only ever distinguishes the three React "canvas"
  // views (dashboard/strategies/settings) - psychology/ai-assistant/community/account are
  // location.hash routes instead (see docs/ai/domain-registry.md's own notes on this real,
  // current split). Reading window.location.hash directly here - a live global, never cached -
  // is additive context this module gathers on its own; it does not require (and must never
  // require) any change to the protected ai-context-engine.js itself.
  function domainsForActiveId(activeId) {
    if (activeId === 'dashboard') return ['dashboard'];
    if (activeId === 'sessions') return ['sessions', 'trade-planning'];
    if (activeId === 'strategies') return ['strategies', 'patterns', 'trade-planning'];
    if (activeId === 'settings') return ['settings'];
    return [];
  }

  // Checkpoint (post-Journey-D): resolves "this trade"/"this strategy"/"that pattern" from real,
  // live UI state - never a guess, and never a change to the protected Context Engine. Mirrors
  // ai-context-engine.js's own activeScenarioId() exactly: a real detail view registers itself
  // with TradeJournalAIProcessRegistry under 'trade-details-{id}'/'strategy-editor-{id}'/
  // 'pattern-editor-{id}' purely so this can read it back (tradeDetailsModal.jsx's own
  // registration exists for exactly this - it has no fillable fields of its own, matching the
  // same "registered purely for context, not for field-filling" precedent liveSessionView.jsx's
  // scenario cards already set). openIdsWithPrefix() (not activeOpenProcess()) is used
  // specifically because the relevant detail view might not be the single most-recently-touched
  // process system-wide - only whether ITS OWN registration is currently open matters here.
  function resolveActiveIdByPrefix(prefix) {
    var registry = window.TradeJournalAIProcessRegistry;
    if (!registry || typeof registry.openIdsWithPrefix !== 'function') return null;
    var ids = registry.openIdsWithPrefix(prefix);
    return ids.length ? ids[0].slice(prefix.length) : null;
  }

  var lastPackage = null;

  // input: {message, currentContext (an ai-context-engine.js snapshot), activeStrategyId?,
  // activePatternId?, activeTradeId?}. The three active-entity ids are resolved from real, live
  // TradeJournalAIProcessRegistry state (resolveActiveIdByPrefix() above) by default - "this
  // trade"/"this strategy"/"that pattern" only ever resolves to a detail view genuinely open right
  // now, never a guess. An explicit opts.activeXxxId still wins when supplied (a future page-level
  // integration, or a test, that already knows the id with certainty has no reason to pay for the
  // registry lookup) - this is additive, not a change to Journey A/B/C's own protected Context
  // Engine, which still has no concept of "active entity" of its own (see section 0's own "do not
  // redesign" boundary; this resolution lives entirely inside this module, exactly like the
  // window.location.hash read above).
  function build(input) {
    var opts = input || {};
    var message = String(opts.message || '');
    var currentContext = opts.currentContext || {};
    var activeId = currentContext.navigation && currentContext.navigation.activeId;
    var hash = (typeof window !== 'undefined' && window.location && window.location.hash) || '';

    var resolvedTradeId = opts.activeTradeId || resolveActiveIdByPrefix('trade-details-');
    var resolvedStrategyId = opts.activeStrategyId || resolveActiveIdByPrefix('strategy-editor-');
    var resolvedPatternId = opts.activePatternId || resolveActiveIdByPrefix('pattern-editor-');

    var registry = window.TradeJournalAIKnowledgeRegistry;
    var pageDomainIds = domainsForActiveId(activeId).concat(domainsForHash(hash));
    var searchResults = registry ? registry.search(message) : [];

    var domainIdSet = {};
    var productKnowledge = [];
    pageDomainIds.concat(searchResults.map(function (d) { return d.id; })).forEach(function (id) {
      if (domainIdSet[id]) return;
      var domain = registry && registry.getDomain(id);
      if (!domain) return;
      domainIdSet[id] = true;
      productKnowledge.push(domain);
    });

    var liveContext = {
      activeId: activeId || null,
      hash: hash || null,
      sessionId: (currentContext.activeEntities && currentContext.activeEntities.sessionId) || null,
      scenarioId: (currentContext.activeEntities && currentContext.activeEntities.scenarioId) || null,
      tradeId: resolvedTradeId || null,
      strategyId: resolvedStrategyId || null,
      patternId: resolvedPatternId || null,
      workflow: currentContext.workflow || null
    };

    // Structured, on-demand user memory (LAYER B) - only ever pulled for a domain that is
    // actually selected above, and only ever the ONE active entity relevant to it (section 16-20:
    // explicit id / active entity, never a bulk dump). Psychology is the one deliberately
    // cross-cutting exception (section 21/29): included for trade-planning too, since that is
    // exactly the real evidence ai-proactive-engine.js's own risk-escalation/stress rules need -
    // never for community/account/settings/etc, regardless of what the message says.
    var userMemory = [];
    var memory = window.TradeJournalAIUserMemory;
    if (memory) {
      if (domainIdSet.sessions && liveContext.sessionId) {
        memory.getRelevantSessions(message, { activeSessionId: liveContext.sessionId }).forEach(function (s) { userMemory.push({ type: 'session', data: s }); });
      }
      if (domainIdSet.strategies && resolvedStrategyId) {
        memory.getRelevantStrategies(message, { activeStrategyId: resolvedStrategyId }).forEach(function (s) { userMemory.push({ type: 'strategy', data: s }); });
      }
      if (domainIdSet.patterns && resolvedPatternId) {
        memory.getRelevantPatterns(message, { activePatternId: resolvedPatternId }).forEach(function (p) { userMemory.push({ type: 'pattern', data: p }); });
      }
      if (domainIdSet['trade-planning'] && resolvedTradeId) {
        memory.getRelevantTrades(message, { activeTradeId: resolvedTradeId }).forEach(function (t) { userMemory.push({ type: 'trade', data: t }); });
      }
      if (domainIdSet.psychology || domainIdSet['trade-planning']) {
        memory.getRelevantPsychologyContext().forEach(function (p) { userMemory.push({ type: 'psychology', data: p }); });
      }
    }

    var availableActions = [];
    var actionRegistry = window.TradeJournalAIActionRegistry;
    if (actionRegistry && typeof actionRegistry.catalogFor === 'function') {
      try { availableActions = actionRegistry.catalogFor(currentContext); } catch (_) { availableActions = []; }
    }

    var proactiveContext = null;
    var proactiveEngine = window.TradeJournalAIProactiveEngine;
    if (proactiveEngine && typeof proactiveEngine.pendingConfirmation === 'function') {
      proactiveContext = proactiveEngine.pendingConfirmation();
    }

    var pkg = {
      intentContext: { activeDomains: Object.keys(domainIdSet), messageDomains: searchResults.map(function (d) { return d.id; }) },
      liveContext: liveContext,
      productKnowledge: productKnowledge,
      userMemory: userMemory,
      availableActions: availableActions,
      proactiveContext: proactiveContext
    };
    lastPackage = pkg;
    return pkg;
  }

  // Development-only diagnostic (section 36) - sanitized metadata only, never full Psychology
  // content or any secret. Returns null before build() has ever run once.
  //
  // approxTokens is a deliberately crude proxy (chars/4, the same rule of thumb OpenAI's own
  // tokenizer docs use for a rough English-text estimate) - not a real tokenizer, and said so
  // plainly rather than implying more precision than this actually has. Its only real job is
  // catching an accidental regression back toward "send everything every turn" (section 33): a
  // context package that balloons into the thousands of estimated tokens for an ordinary,
  // narrowly-scoped question is a real signal something stopped narrowing correctly, long before
  // it would ever show up as a slow/expensive request in production.
  function debugLastPackage() {
    if (!lastPackage) return null;
    var approxChars = JSON.stringify({
      productKnowledge: lastPackage.productKnowledge, userMemory: lastPackage.userMemory, liveContext: lastPackage.liveContext
    }).length;
    return {
      domains: lastPackage.intentContext.activeDomains,
      knowledgeEntries: lastPackage.productKnowledge.length,
      userMemorySources: lastPackage.userMemory.map(function (m) { return m.type + (m.data && m.data.id ? ':' + m.data.id : ''); }),
      liveContextSources: [lastPackage.liveContext.activeId, lastPackage.liveContext.hash].filter(Boolean),
      actions: lastPackage.availableActions.map(function (a) { return a.id; }),
      approxChars: approxChars,
      approxTokens: Math.ceil(approxChars / 4)
    };
  }

  window.TradeJournalAIContextBuilder = { build: build, debugLastPackage: debugLastPackage };
}());
