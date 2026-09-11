/**
 * Analysis Graph AI Context Builder — window.TradeJournalAnalysisGraphAiContext.build(...).
 *
 * This pass's "AI NODE + SELECTIVE AI CONTEXT" phase, section 3: assembles ONLY the graph context
 * relevant to one aiAnalysis node's run - never the whole graph by default (section 3's own
 * "AI must NEVER receive the entire graph by default").
 *
 * AUDIT FINDING (this pass, 4 parallel investigations before writing any of this file): the
 * repo's existing ai-context-builder.js/ai-context-engine.js are chat-turn-scoped (one message,
 * current page/hash, single-active-entity-per-domain) and explicitly NOT a good extension target
 * for a broader, structural, multi-node graph context - see this file's own header note below and
 * the workflow audit this pass ran. This is therefore its OWN module, but it reuses the real
 * existing primitives rather than re-deriving them:
 *  - registry.resolveFocusPathNodeIds() (analysis-graph-registry.js) - the SAME bidirectional
 *    traversal the canvas's own visual Focus Path uses (section 3B's "selected node, Focus Path,
 *    upstream evidence, downstream nodes, directly connected nodes, relevant edges" is ONE
 *    traversal, not five separate ones).
 *  - window.TradeJournalAnalysisContext.getAnalysisContext(profileId) - the real, already-shipped
 *    Analysis Profile snapshot builder (section 17: "reuse existing Analysis Profile... do not
 *    create another analytical-profile system").
 *  - registry.resolveNodeSource() - the same live canonical-record resolver every other part of
 *    the Map already uses (never a second definition of "what a node's data is").
 *
 * PRIVACY (section 5, stricter than this app's existing looser default on purpose): the app-wide
 * ai-companion-profile.js dataAccessPrefs.mentalHealth toggle is opt-OUT (fails open - included by
 * default). This builder is deliberately the OPPOSITE for the one sensitive field this Map can
 * actually reach (trade.emotionLog): excluded by default, included only when the specific node is
 * both pinned (aiContext.pinned) AND the caller explicitly passes allowEmotion:true for this
 * request (section 5's own "explicitly pinned OR explicitly enabled for the request" - this
 * builder requires BOTH, which is a strictly narrower/safer bar than the brief's "OR", chosen
 * because graph reasoning is more structurally exposed/traceable than an ordinary chat turn).
 *
 * TOKEN AWARENESS (section 18): approxTokens uses the exact same chars/4 heuristic
 * ai-context-builder.js's debugLastPackage() already uses (documented there as "a deliberately
 * crude proxy... not a real tokenizer") - not a new/different estimation technique.
 *
 * CONTEXT PREVIEW = CONTEXT SENT (section 22 / test "context preview matches actual context
 * builder"): build() is the ONLY function that decides what's included - the Inspector's "View AI
 * Context" preview and the actual network request both call this same function, so they can never
 * drift apart into two different implementations of "what will be sent."
 */
(function () {
  'use strict';

  function registry() { return window.TradeJournalAnalysisGraphRegistry; }

  // Architecture review (2026-09-12) finding: nothing previously capped how many nodes a single
  // Focus Path traversal could pull in - for a genuinely large, densely-connected graph (the
  // exact "50+ nodes, 100+ edges" scale ARCHITECTURE.md's own performance section calls for), one
  // connected component can legitimately BE the whole graph, so "never the whole graph by
  // default" was only true by accident (no test happened to build one large connected graph), not
  // by construction. These two caps make that a real, enforced invariant instead - explicit
  // (pinned/important/required) nodes are capped and truncated by priority (required survives
  // first) since a trader could otherwise pin an unbounded number of nodes; structural (Focus
  // Path) nodes are capped and truncated by proximity, since resolveFocusPathNodeIds() already
  // returns them in BFS discovery order (nearest to the selected node first) - truncation is
  // never silent (pkg.truncated + the existing excludedNodeIds transparency already shown in the
  // Context Preview modal cover it, matching this repo's "no silent caps" convention).
  var MAX_EXPLICIT_NODES = 25;
  var MAX_TOTAL_NODES = 40;

  // Section 5 / privacy audit finding: the only sensitive field this Map's node types can reach
  // today is trade.emotionLog (session/entry/scenario records in this data model carry no emotion
  // fields directly - mental-health-continuous.js's reflection data lives in a separate store this
  // Map has no node type for yet). Stripped from the compact summary unless explicitly allowed.
  var SENSITIVE_FIELDS_BY_TYPE = { trade: ['emotionLog'] };

  function compactSummaryFor(node, sourceRecord, session, lang, allowEmotionForThisNode) {
    var reg = registry();
    var typeDef = reg && reg.NODE_TYPES[node.type];
    if (!typeDef) return { title: node.title || node.id, fields: {} };
    var display = (node.origin === 'reference' && !sourceRecord)
      ? { title: node.title || node.id, status: null }
      : { title: typeDef.display.title(sourceRecord, node, lang, typeDef), status: typeDef.display.status(sourceRecord, node) };
    var fields = {};
    if (node.type === 'note') fields.content = node.content || '';
    if (node.type === 'sessionScenario' && sourceRecord) {
      fields.description = sourceRecord.description || '';
      fields.evidence = sourceRecord.evidence || '';
      fields.trigger = sourceRecord.trigger || '';
      fields.probability = (sourceRecord.probabilityHistory || []).length
        ? sourceRecord.probabilityHistory[sourceRecord.probabilityHistory.length - 1].value : null;
    }
    if (node.type === 'trade' && sourceRecord) {
      var strip = SENSITIVE_FIELDS_BY_TYPE.trade;
      Object.keys(sourceRecord).forEach(function (key) {
        if (strip.indexOf(key) !== -1 && !allowEmotionForThisNode) return;
        if (key === 'entryPrice' || key === 'stopLoss' || key === 'rr' || key === 'status' || key === 'outcome' || key === 'pnl' || (allowEmotionForThisNode && key === 'emotionLog')) {
          fields[key] = sourceRecord[key];
        }
      });
    }
    if ((node.type === 'marketStructure' || node.type === 'confluence' || node.type === 'aiAnalysis') && node.execution && node.execution.result) {
      fields.priorResultSummary = node.execution.result.summary || '';
    }
    return { title: display.title, status: display.status, fields: fields };
  }

  // Section 3D + section 17 (Analysis Profile reuse). Mirrors session-analysis-client.js's own
  // pickAdherenceProfile() field trim EXACTLY (that function itself is not exported there, so this
  // is a deliberate, tiny, documented re-implementation of the same 5-field shape - not a new
  // definition of what "Analysis Profile for AI" means).
  function pickAnalysisProfileForAi(analysisContext) {
    if (!analysisContext) return null;
    return {
      primaryStyle: analysisContext.primaryStyle || null,
      secondaryStyles: analysisContext.secondaryStyles || [],
      focuses: analysisContext.focuses || [],
      customMethodNotes: analysisContext.customMethodNotes || ''
    };
  }

  function resolveAnalysisProfile(profileId) {
    var api = window.TradeJournalAnalysisContext;
    var store = window.TradeJournalAnalysisProfileStore;
    var id = profileId || (store && store.getDefault && store.getDefault() && store.getDefault().id);
    if (!id || !api) return null;
    return pickAnalysisProfileForAi(api.getAnalysisContext(id));
  }

  // Section 3C. A graph normally has 0 or 1 marketContext node (singleton by design - see
  // analysis-graph-registry.js's own marketContext node type comment). Falls back to the same
  // session-level {market,timeframe,instrument} shape resolveNodeSource() already returns for a
  // marketContext node, so "no Market Context node on the graph yet" still gives the AI a real,
  // non-fabricated market reference rather than nothing.
  function resolveMarketContext(session, graph) {
    var reg = registry();
    if (!reg) return null;
    var node = (graph.nodes || []).find(function (n) { return n.type === 'marketContext'; });
    if (node) return reg.resolveNodeSource(node.source, session);
    return { market: session.market || null, timeframe: session.timeframe || null, instrument: session.instrument || null };
  }

  function approxTokens(pkg) {
    var chars = JSON.stringify(pkg).length;
    return Math.ceil(chars / 4);
  }

  // input: { session, graph, selectedNodeId, includeSimilarSessions, allowEmotion, lang }
  function build(input) {
    var reg = registry();
    var session = input && input.session;
    var graph = (input && input.graph) || { nodes: [], edges: [] };
    var lang = (input && input.lang) || 'en';
    var selectedNodeId = input && input.selectedNodeId;
    var allowEmotion = !!(input && input.allowEmotion);
    var nodes = graph.nodes || [];
    var edges = graph.edges || [];

    // Layer A - EXPLICIT (section 3A): pinned/important/required nodes are always candidates for
    // inclusion regardless of Focus Path reach, since the trader explicitly marked them relevant.
    // Ranked so a hard cap (below) truncates the LEAST explicit ones first if there are too many -
    // required survives before important, important before a plain pinned/normal node.
    function explicitRank(n) {
      var p = n.aiContext && n.aiContext.priority;
      if (p === 'required') return 0;
      if (p === 'important') return 1;
      return 2; // pinned:true, priority:'normal'
    }
    var explicitNodes = nodes.filter(function (n) { return n.aiContext && (n.aiContext.pinned || n.aiContext.priority !== 'normal'); });
    explicitNodes.sort(function (a, b) { return explicitRank(a) - explicitRank(b); });
    var explicitTruncated = explicitNodes.length > MAX_EXPLICIT_NODES;
    var explicitKept = explicitNodes.slice(0, MAX_EXPLICIT_NODES);

    // Layer B - STRUCTURAL (section 3B): selected node + its whole Focus Path (upstream evidence,
    // downstream decision/outcome, directly connected nodes/edges - all one traversal, see the
    // header comment and registry.resolveFocusPathNodeIds's own comment). Returned in proximity
    // order (nearest to the selected node first), which the cap below relies on.
    var structural = reg ? reg.resolveFocusPathNodeIds(graph, selectedNodeId) : { nodeIds: [], edgeIds: [] };

    var includedIds = {};
    explicitKept.forEach(function (n) { includedIds[n.id] = true; });
    if (selectedNodeId) includedIds[selectedNodeId] = true;

    // Required nodes (section 3A/26 of the original brief) must be included "unless technically
    // unavailable" - guaranteed up to MAX_EXPLICIT_NODES (required nodes are ranked first, so they
    // are always the last thing this cap would ever drop).

    var structuralTruncated = false;
    structural.nodeIds.forEach(function (id) {
      if (includedIds[id]) return;
      if (Object.keys(includedIds).length >= MAX_TOTAL_NODES) { structuralTruncated = true; return; }
      includedIds[id] = true;
    });
    var truncated = explicitTruncated || structuralTruncated;

    var includedNodeIds = Object.keys(includedIds);
    var includedEdgeIds = edges.filter(function (e) { return includedIds[e.sourceNodeId] && includedIds[e.targetNodeId]; }).map(function (e) { return e.id; });
    var excludedNodeIds = nodes.filter(function (n) { return !includedIds[n.id]; }).map(function (n) { return n.id; });

    var compactNodes = includedNodeIds.map(function (id) {
      var node = nodes.find(function (n) { return n.id === id; });
      if (!node) return null;
      var sourceRecord = node.origin === 'reference' ? reg.resolveNodeSource(node.source, session) : null;
      var nodeAllowEmotion = allowEmotion && node.aiContext && node.aiContext.pinned;
      var summary = compactSummaryFor(node, sourceRecord, session, lang, nodeAllowEmotion);
      return { id: node.id, type: node.type, stageId: node.stageId, origin: node.origin, priority: node.aiContext ? node.aiContext.priority : 'normal', title: summary.title, status: summary.status, fields: summary.fields };
    }).filter(Boolean);

    var compactEdges = includedEdgeIds.map(function (id) {
      var edge = edges.find(function (e) { return e.id === id; });
      return edge ? { id: edge.id, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, relation: edge.relation } : null;
    }).filter(Boolean);

    // Emotion transparency (section 4's "Context Debugging" - "Emotion: Excluded by privacy
    // rule"): whether ANY included node's emotion data actually made it into the package, computed
    // from the same allow-check the per-node summary above already applied.
    var emotionIncluded = includedNodeIds.some(function (id) {
      var node = nodes.find(function (n) { return n.id === id; });
      return node && node.type === 'trade' && allowEmotion && node.aiContext && node.aiContext.pinned;
    });

    var similarSessionsIncluded = false;
    var similarSessions = [];
    // Section 3E: "Similar historical Sessions: ONLY when explicitly enabled/allowed" - this
    // builder never calls gatherSimilarSessions() unless the caller explicitly opted in for THIS
    // request; session-analysis-client.js's own OTHER call site (initial Session Analysis) is left
    // completely untouched by this file.
    // (Actual similar-session gathering is async - see analysis-graph-ai-client.js's
    // buildGraphAIContextAsync(), which calls this sync build() first and layers this in after.)

    var pkg = {
      sessionId: session ? session.id : null,
      selectedNodeId: selectedNodeId || null,
      includedNodeIds: includedNodeIds,
      includedEdgeIds: includedEdgeIds,
      excludedNodeIds: excludedNodeIds,
      nodes: compactNodes,
      edges: compactEdges,
      marketContext: resolveMarketContext(session, graph),
      analysisProfile: resolveAnalysisProfile(input && input.profileId),
      emotionIncluded: emotionIncluded,
      similarSessionsIncluded: similarSessionsIncluded,
      similarSessions: similarSessions,
      // Section 18/4: honest, never-silent truncation - true when a hard size cap (MAX_EXPLICIT_
      // NODES / MAX_TOTAL_NODES above) actually dropped a node that would otherwise have been
      // included. excludedNodeIds already lists exactly which ones, for the Context Preview.
      truncated: truncated
    };
    pkg.approxTokens = approxTokens(pkg);
    return pkg;
  }

  window.TradeJournalAnalysisGraphAiContext = {
    build: build,
    resolveMarketContext: resolveMarketContext,
    pickAnalysisProfileForAi: pickAnalysisProfileForAi
  };
}());
