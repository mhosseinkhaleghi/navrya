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

  // Journey H1 closure: same exclusion set chat-dock-core.js's own modelFacingAllowlist() already
  // filters activeProcess.allowlist through, kept here as its own small copy (this module has no
  // shared import mechanism with chat-dock-core.js - both are independent window-global IIFEs) -
  // these are fields ONLY this app's own orchestration code ever writes directly
  // (sourceSessionId/sourceScenarioId, pendingEmotionSignal, riskOverride), never something a real
  // form field or a model-facing "what can I fill/ask about" list should ever name.
  var SURFACE_INTERNAL_ONLY_FIELDS = { sourceSessionId: true, sourceScenarioId: true, pendingEmotionSignal: true, riskOverride: true };

  // Journey H1 closure (brief section 1, "current-form question awareness"): the smallest
  // sufficient descriptor of what real surface/step is on screen right now, for a question like
  // "what does this mean?" to be answered correctly - domain/page, processId, step, and the
  // CURRENT STEP's own field PATHS only (never values, never the whole record). Reuses
  // TradeJournalAISurfaceContext (page-aware-voice.md) for page/processId/step/layer, and
  // activeOpenProcess()'s own (now-exposed) stepForPath to narrow the process's full allowlist
  // down to just the fields actually visible on the current step - a non-stepped process (no
  // stepForPath declared) simply keeps its whole allowlist, exactly as activeProcess.allowlist
  // already sends today for an ordinary continuing turn. Field paths (never values) were already
  // an accepted-safe wire shape before this change (see activeProcess.allowlist, sent on every
  // ordinary continuing turn) - the two things this adds are (1) step-scoping instead of the
  // whole allowlist, and (2) availability even on an explicit Explain turn, when
  // chat-dock-core.js deliberately nulls its own local activeProcess/availableActions view (never
  // the real registry) so the model doesn't mistake a question for a field-extraction turn.
  function currentSurfaceFor() {
    var surfaceContext = window.TradeJournalAISurfaceContext;
    var procRegistry = window.TradeJournalAIProcessRegistry;
    if (!surfaceContext || !procRegistry) return null;
    var snap;
    try { snap = surfaceContext.snapshot(); } catch (_) { return null; }
    if (!snap || !snap.processId) return null;
    var topmost;
    try { topmost = procRegistry.activeOpenProcess(); } catch (_) { topmost = null; }
    // Defensive identity check - surfaceContext.snapshot() derives processId from this exact same
    // activeOpenProcess() call, so these already agree by construction; re-checking costs nothing
    // and means a future refactor of either module fails safe (no fields) rather than silently
    // attaching one process's field list to a different process's id.
    if (!topmost || topmost.id !== snap.processId) return null;
    var rawFields = (topmost.allowlist || []).filter(function (p) { return !SURFACE_INTERNAL_ONLY_FIELDS[p]; });
    var fields = typeof topmost.stepForPath === 'function'
      ? rawFields.filter(function (p) { var s = topmost.stepForPath(p); return s === null || s === undefined || s === snap.step; })
      : rawFields;
    return { page: snap.page || null, processId: snap.processId, layer: snap.layer || null, step: snap.step === undefined ? null : snap.step, visibleFields: fields };
  }

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
    if (activeId === 'accounts') return ['trading-accounts', 'trade-planning'];
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
    var resolvedAccountId = opts.activeAccountId || resolveActiveIdByPrefix('account-detail-');

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

    // Journey H1 closure: a Psychology-domain workflow's own `known` accumulates real intake
    // answers (age, financial context, first-big-loss-reaction, family-transparency answers, ...)
    // exactly as the user actually states them - ai-workflow-engine.js's applyKnownFields() is
    // completely generic across every domain, so `psychology.intake.start` (Journey H1) making
    // Intake action-startable/continuable means its workflow accumulates real answers in `known`
    // the identical way trade.calculator's own workflow accumulates entryPrice/stopLoss. Every
    // OTHER domain's workflow.known is already treated as safe to summarize into this generic,
    // wire-sent liveContext - Psychology answers are a materially different sensitivity class, and
    // this app's own hard invariant (ai-user-memory.js's header comment) is that
    // getRelevantPsychologyContext() is the ONLY function ever allowed to surface Mental Health
    // data, and only in its own minimized {currentStress,source,recordedAt} shape. Strip `known`
    // (and, defensively, `missing`) from a Psychology-domain workflow before it ever reaches
    // liveContext - the model still knows Intake is open (processId/actionId/status), never a
    // single actual answer. Found and fixed while verifying this exact guarantee for this closure
    // pass - see tests/ai-context-builder.test.mjs's own "psychology workflow.known never reaches
    // the wire" coverage.
    var rawWorkflow = currentContext.workflow || null;
    var workflow = rawWorkflow;
    if (rawWorkflow && (String(rawWorkflow.processId || '').indexOf('mh-') === 0 || String(rawWorkflow.actionId || '').indexOf('psychology.') === 0)) {
      workflow = { workflowId: rawWorkflow.workflowId || null, actionId: rawWorkflow.actionId || null, processId: rawWorkflow.processId || null, status: rawWorkflow.status || null };
    }

    var liveContext = {
      activeId: activeId || null,
      hash: hash || null,
      sessionId: (currentContext.activeEntities && currentContext.activeEntities.sessionId) || null,
      scenarioId: (currentContext.activeEntities && currentContext.activeEntities.scenarioId) || null,
      tradeId: resolvedTradeId || null,
      strategyId: resolvedStrategyId || null,
      patternId: resolvedPatternId || null,
      accountId: resolvedAccountId || null,
      workflow: workflow,
      // Journey H1 closure: see currentSurfaceFor()'s own header comment - null when nothing is
      // open (the common case for most turns), never padding a turn that doesn't need it.
      currentSurface: currentSurfaceFor()
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
      if (domainIdSet['trading-accounts'] && resolvedAccountId) {
        memory.getRelevantAccounts(message, { activeAccountId: resolvedAccountId }).forEach(function (a) { userMemory.push({ type: 'account', data: a }); });
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
