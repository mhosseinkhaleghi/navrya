/**
 * Analysis Graph AI Client — window.TradeJournalAnalysisGraphAiClient.
 *
 * This pass's AI NODE phase, sections 2/7/9/10: the ONE network-calling orchestrator for the
 * Graph's aiAnalysis node. Mirrors public/pages/shared/session-analysis-client.js's own real,
 * shipped conventions exactly (audited before writing this file) rather than inventing new ones:
 *  - same request envelope shape client callers already expect: { ok, result?/error?, status? }
 *  - same one-model-call-per-invocation discipline
 *  - goes through the SAME central gateway (server/pattern-ai-server.mjs's callProvider()) via a
 *    new, narrow route - never a second generic AI client/fetch wrapper (section 2).
 */
(function () {
  'use strict';

  function contextBuilder() { return window.TradeJournalAnalysisGraphAiContext; }
  function sessionAnalysisClient() { return window.TradeJournalSessionAnalysisClient; }

  // Deterministic, dependency-free string hash (djb2) - a stable "input signature" for stale
  // detection (section 7). Not cryptographic, not required to be: it only needs to change when the
  // context that WOULD be built now differs from what was actually sent on the last completed run,
  // and to stay identical when it doesn't (e.g. an unrelated Note edited elsewhere on the graph
  // must NOT flip this, matching section 7's explicit "unrelated changes do not stale AI" rule -
  // enforced by this hashing only the fields build() actually includes, never the whole graph).
  function hashString(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) { hash = ((hash << 5) + hash) + str.charCodeAt(i); hash |= 0; }
    return (hash >>> 0).toString(36);
  }

  // Section 7: the signature is built from exactly the fields that determine what got sent -
  // included node/edge ids + each included node's own compact summary + market context + analysis
  // profile - so it changes when (and only when) something that actually reached the model
  // changes, never on an excluded/irrelevant node's own unrelated edit.
  function computeInputSignature(contextPackage) {
    var stable = {
      includedNodeIds: contextPackage.includedNodeIds.slice().sort(),
      includedEdgeIds: contextPackage.includedEdgeIds.slice().sort(),
      nodes: contextPackage.nodes.map(function (n) { return { id: n.id, title: n.title, status: n.status, fields: n.fields }; }),
      marketContext: contextPackage.marketContext,
      analysisProfile: contextPackage.analysisProfile,
      emotionIncluded: contextPackage.emotionIncluded
    };
    return hashString(JSON.stringify(stable));
  }

  // Section 3E: layers "similar sessions" onto the synchronous build() result, but ONLY when the
  // caller explicitly opts in for this request - session-analysis-client.js's own gatherSimilarSessions()
  // is reused verbatim (never re-implemented), never called automatically here the way its OTHER
  // caller (initial Session Analysis) already does unconditionally.
  async function buildContext(input) {
    var builder = contextBuilder();
    var pkg = builder.build(input);
    if (input && input.includeSimilarSessions) {
      var client = sessionAnalysisClient();
      if (client && input.session) {
        try {
          var similar = await client.gatherSimilarSessions(input.session, input.character, 3);
          pkg.similarSessions = similar || [];
          pkg.similarSessionsIncluded = true;
          pkg.approxTokens = Math.ceil(JSON.stringify(pkg).length / 4);
        } catch (_) { /* honest degrade - similar sessions stay empty/not-included, never fabricated */ }
      }
    }
    return pkg;
  }

  // Section 10/25: a suggestion referencing a node/edge id absent from the graph is a hallucinated
  // reference and must never reach storage or the approval UI. Strips (not just flags) any such
  // suggestion - defense in depth alongside the server's own stripping (pattern-ai-server.mjs).
  function validateAiReferences(suggestions, graph) {
    var nodeIds = {}; (graph.nodes || []).forEach(function (n) { nodeIds[n.id] = true; });
    var edgeIds = {}; (graph.edges || []).forEach(function (e) { edgeIds[e.id] = true; });
    return (suggestions || []).filter(function (s) {
      var okNodes = (s.sourceNodeIds || []).every(function (id) { return nodeIds[id]; });
      var okEdges = (s.sourceEdgeIds || []).every(function (id) { return edgeIds[id]; });
      // target.nodeId (for updateNode/updateScenario/updateProbability) must also be real.
      var okTarget = !s.target || !s.target.nodeId || nodeIds[s.target.nodeId];
      return okNodes && okEdges && okTarget;
    });
  }

  function validateReferences(references, graph) {
    var nodeIds = {}; (graph.nodes || []).forEach(function (n) { nodeIds[n.id] = true; });
    return (references || []).filter(function (r) { return r && r.nodeId && nodeIds[r.nodeId]; });
  }

  // Section 8: explicit user-triggered execution only - this function is the ONE network call an
  // aiAnalysis node run ever makes. Never invoked automatically by drag/pan/zoom/selection/typing
  // (enforced by liveSessionView.jsx's runAiAnalysisNode only ever being called from a real
  // [Run Analysis] button click - see that file's own comment).
  async function runGraphAiAnalysis(opts) {
    var contextPackage = await buildContext(opts);
    var inputSignature = computeInputSignature(contextPackage);
    var body = {
      provider: opts.provider, model: opts.model, apiKey: opts.apiKey,
      nodeId: opts.nodeId, nodeType: opts.nodeType, config: opts.config || {},
      context: contextPackage,
      allNodeIds: (opts.graph.nodes || []).map(function (n) { return n.id; }),
      allEdgeIds: (opts.graph.edges || []).map(function (e) { return e.id; }),
      language: opts.lang || 'en'
    };
    var response;
    try {
      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, opts.timeoutMs || 90000);
      response = await fetch('/api/sessions/graph-ai-analysis', {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(body), signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (_) {
      return { ok: false, error: 'NETWORK_ERROR', status: 0, contextPackage: contextPackage, inputSignature: inputSignature };
    }
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) return { ok: false, error: payload.error || 'GRAPH_AI_ANALYSIS_FAILED', status: response.status, contextPackage: contextPackage, inputSignature: inputSignature };
    // Matches the established server envelope every other AI route already returns -
    // session-analysis-client.js's analyzeSession() reads payload.data the same way (audited).
    var result = payload.data || {};
    // Client-side re-validation (belt-and-suspenders alongside the server's own stripping) -
    // section 9's "Do not allow hallucinated node IDs" is enforced twice, never trusted once.
    result.scenarioSuggestions = validateAiReferences(result.scenarioSuggestions, opts.graph);
    result.edgeSuggestions = validateAiReferences(result.edgeSuggestions, opts.graph);
    result.marketContextSuggestions = validateAiReferences(result.marketContextSuggestions, opts.graph);
    result.references = validateReferences(result.references, opts.graph);
    return {
      ok: true, result: result, contextPackage: contextPackage, inputSignature: inputSignature,
      provider: payload.provider, model: payload.model, usage: payload.usage || null
    };
  }

  window.TradeJournalAnalysisGraphAiClient = {
    buildContext: buildContext,
    computeInputSignature: computeInputSignature,
    validateAiReferences: validateAiReferences,
    validateReferences: validateReferences,
    runGraphAiAnalysis: runGraphAiAnalysis
  };
}());
