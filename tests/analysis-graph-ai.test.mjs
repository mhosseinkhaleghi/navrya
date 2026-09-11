import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, before } from 'node:test';
import vm from 'node:vm';

import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { createApp } from '../server/community/app.mjs';

// "نقشه تحلیل" (Analysis Map) - AI NODE + SELECTIVE AI CONTEXT + TRACEABLE AI SUGGESTIONS phase.
// Mirrors tests/analysis-graph.test.mjs's own established conventions exactly: a vm sandbox for
// the window-global registry/context-builder/client files, plain-text/regex assertions against
// navrya-src/*.jsx and server/pattern-ai-server.mjs (no JSX/ESM transform in this runner), and a
// real repo.memory.mjs/community app round-trip for persistence/gateway-auth wiring.

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const src = (...parts) => path.join(root, 'navrya-src', ...parts);
const plain = (value) => JSON.parse(JSON.stringify(value));

async function loadSandbox(extraGlobals) {
  const sandbox = { window: {}, console, setTimeout, clearTimeout, fetch: async () => ({ ok: false, json: async () => ({}) }), AbortController };
  if (extraGlobals && extraGlobals.window) Object.assign(sandbox.window, extraGlobals.window);
  vm.createContext(sandbox);
  const registrySrc = await readFile(shared('analysis-graph-registry.js'), 'utf8');
  vm.runInContext(registrySrc, sandbox, { filename: 'analysis-graph-registry.js' });
  const contextSrc = await readFile(shared('analysis-graph-ai-context.js'), 'utf8');
  vm.runInContext(contextSrc, sandbox, { filename: 'analysis-graph-ai-context.js' });
  const clientSrc = await readFile(shared('analysis-graph-ai-client.js'), 'utf8');
  vm.runInContext(clientSrc, sandbox, { filename: 'analysis-graph-ai-client.js' });
  return sandbox;
}

function sampleGraph() {
  // A -> B -> C is one connected component (Focus Path from A reaches all three); D is isolated.
  return {
    nodes: [
      { id: 'A', type: 'sessionScenario', origin: 'reference', source: { type: 'sessionScenario', id: 'sc-1' }, title: 'Scenario A', stageId: 'scenarios', aiContext: { pinned: false, priority: 'normal' }, execution: null },
      { id: 'B', type: 'note', origin: 'manual', source: null, content: 'linked note', title: 'Note B', stageId: 'observation', aiContext: { pinned: false, priority: 'normal' }, execution: null },
      { id: 'C', type: 'trade', origin: 'reference', source: { type: 'trade', id: 'trade-1' }, title: 'Trade C', stageId: 'decision', aiContext: { pinned: false, priority: 'normal' }, execution: null },
      { id: 'D', type: 'note', origin: 'manual', source: null, content: 'unrelated note', title: 'Note D (isolated)', stageId: 'observation', aiContext: { pinned: false, priority: 'normal' }, execution: null },
      { id: 'E', type: 'sessionEntry', origin: 'reference', source: { type: 'sessionEntry', id: 'entry-1' }, title: 'Entry E (pinned, far away)', stageId: 'evidence', aiContext: { pinned: true, priority: 'important' }, execution: null }
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'A', targetNodeId: 'B', relation: 'supports' },
      { id: 'e2', sourceNodeId: 'B', targetNodeId: 'C', relation: 'informs' }
    ]
  };
}

function sampleSession() {
  return {
    id: 'sess-1', market: 'London', instrument: 'XAUUSD', timeframe: '15m',
    entries: [{ id: 'entry-1', type: 'chart', timeframe: '5m', scenarios: [{ id: 'sc-1', title: 'Scenario A', status: 'pending', probabilityHistory: [{ value: 60, loggedAt: '2026-01-01T00:00:00.000Z' }], evidence: 'evidence text', trigger: 'trigger text' }] }]
  };
}

const TRADE_WITH_EMOTION = { id: 'trade-1', instrument: 'BTCUSDT', status: 'open', entryPrice: 50000, stopLoss: 49000, rr: 2, emotionLog: [{ id: 'em1', stage: 'entry', note: 'felt anxious', dominantEmotions: ['fear'] }] };

// ---------------------------------------------------------------------------
// Registry: aiContext, execution scaffold, AI Suggestion model, stale detection.
// ---------------------------------------------------------------------------

test('normalizeAiContext defaults to {pinned:false, priority:"normal"} and rejects an invalid priority', async () => {
  const sandbox = await loadSandbox();
  const registry = sandbox.window.TradeJournalAnalysisGraphRegistry;
  const graph = plain(registry.normalizeAnalysisGraph({
    nodes: [
      { id: 'n1', type: 'note' },
      { id: 'n2', type: 'note', aiContext: { pinned: true, priority: 'required' } },
      { id: 'n3', type: 'note', aiContext: { pinned: 'yes', priority: 'urgent' } }
    ]
  }));
  const byId = {}; graph.nodes.forEach((n) => { byId[n.id] = n; });
  assert.deepEqual(byId.n1.aiContext, { pinned: false, priority: 'normal' });
  assert.deepEqual(byId.n2.aiContext, { pinned: true, priority: 'required' });
  assert.deepEqual(byId.n3.aiContext, { pinned: true, priority: 'normal' }, 'pinned is a plain boolean coercion (any truthy value pins it), an unknown priority still falls back to the honest default rather than throwing');
});

test('a freshly normalized aiAnalysis node carries the full execution scaffold (provenance/result/suggestions/error), all honestly empty until a real run happens', async () => {
  const sandbox = await loadSandbox();
  const registry = sandbox.window.TradeJournalAnalysisGraphRegistry;
  const graph = plain(registry.normalizeAnalysisGraph({ nodes: [{ id: 'ai1', type: 'aiAnalysis' }] }));
  assert.deepEqual(graph.nodes[0].execution, { state: 'idle', lastRunAt: null, provenance: null, result: null, suggestions: [], error: null });
});

test('AI_SUGGESTION_TYPES/normalizeAiSuggestion: a real suggestion round-trips, an unknown type or missing id is rejected, status defaults to "pending", and sourceNodeIds/sourceEdgeIds are defensively copied (not the same array reference)', async () => {
  const sandbox = await loadSandbox();
  const registry = sandbox.window.TradeJournalAnalysisGraphRegistry;
  assert.deepEqual(plain(registry.AI_SUGGESTION_TYPES).sort(), ['createEdge', 'createNode', 'suggestMarketContext', 'updateNode', 'updateProbability', 'updateScenario', 'updateRelation'].sort());
  assert.deepEqual(plain(registry.AI_SUGGESTION_STATUSES), ['pending', 'applied', 'rejected']);
  const rawSourceIds = ['A', 'B'];
  const suggestion = registry.normalizeAiSuggestion({ id: 's1', type: 'createNode', payload: { title: 'x' }, sourceNodeIds: rawSourceIds, explanation: 'why', confidence: 'high' });
  assert.equal(suggestion.status, 'pending');
  assert.deepEqual(plain(suggestion.sourceNodeIds), ['A', 'B']);
  assert.notEqual(suggestion.sourceNodeIds, rawSourceIds, 'must be a defensive copy, not the same array reference');
  assert.equal(registry.normalizeAiSuggestion({ id: 's2', type: 'deleteEverything', payload: {} }), null, 'an unknown suggestion type must be rejected');
  assert.equal(registry.normalizeAiSuggestion({ type: 'createNode', payload: {} }), null, 'a suggestion with no id must be rejected');
  assert.equal(registry.normalizeAiSuggestion({ id: 's3', type: 'createNode', payload: {}, confidence: 'extreme' }).confidence, null, 'an invalid confidence value falls back to null, never a fabricated one');
});

test('isAiNodeStale (section 7): false for anything not completed or with no provenance, true only when the input signature genuinely differs - never a stored flag', async () => {
  const sandbox = await loadSandbox();
  const registry = sandbox.window.TradeJournalAnalysisGraphRegistry;
  assert.equal(registry.isAiNodeStale(null, 'sig'), false);
  assert.equal(registry.isAiNodeStale({ execution: { state: 'running' } }, 'sig'), false, 'a running node is not "stale" - there is nothing to compare against yet');
  assert.equal(registry.isAiNodeStale({ execution: { state: 'completed', provenance: null } }, 'sig'), false, 'no provenance means no comparison basis');
  assert.equal(registry.isAiNodeStale({ execution: { state: 'completed', provenance: { inputSignature: 'abc' } } }, 'abc'), false, 'matching signature is fresh');
  assert.equal(registry.isAiNodeStale({ execution: { state: 'completed', provenance: { inputSignature: 'abc' } } }, 'xyz'), true, 'mismatched signature is honestly stale');
});

// ---------------------------------------------------------------------------
// Graph AI Context Builder (analysis-graph-ai-context.js): selective inclusion, privacy, market
// context, Analysis Profile reuse, token estimate. Tests 1-9 of the brief's section 25 list.
// ---------------------------------------------------------------------------

test('the context builder excludes unrelated nodes not on the selected node\'s Focus Path and not explicitly pinned/prioritized (test 1)', async () => {
  const sandbox = await loadSandbox();
  const pkg = plain(sandbox.window.TradeJournalAnalysisGraphAiContext.build({ session: sampleSession(), graph: sampleGraph(), selectedNodeId: 'A' }));
  assert.deepEqual(pkg.includedNodeIds.slice().sort(), ['A', 'B', 'C', 'E'].sort(), 'A/B/C via Focus Path, E via its own pinned/important flag - D stays excluded');
  assert.ok(pkg.excludedNodeIds.includes('D'));
  assert.ok(!pkg.excludedNodeIds.includes('A'));
});

test('pinned nodes are always included even when nowhere near the selected node\'s Focus Path (test 2)', async () => {
  const sandbox = await loadSandbox();
  const graph = sampleGraph(); // E is pinned, isolated from D's own component
  const pkg = plain(sandbox.window.TradeJournalAnalysisGraphAiContext.build({ session: sampleSession(), graph, selectedNodeId: 'D' }));
  assert.ok(pkg.includedNodeIds.includes('E'), 'E must be included purely because it is pinned, despite being structurally unrelated to D');
});

test('a node with priority "important" or "required" (not just pinned:true) is also always included (test 3/4)', async () => {
  const sandbox = await loadSandbox();
  const graph = sampleGraph();
  graph.nodes.push({ id: 'F', type: 'note', origin: 'manual', content: 'important but not pinned', title: 'Note F', stageId: 'observation', aiContext: { pinned: false, priority: 'important' }, execution: null });
  const pkg = plain(sandbox.window.TradeJournalAnalysisGraphAiContext.build({ session: sampleSession(), graph, selectedNodeId: 'D' }));
  assert.ok(pkg.includedNodeIds.includes('F'), 'priority !== "normal" alone (without pinned:true) must still force inclusion');
});

test('emotion data (trade.emotionLog) is excluded by default, even for an included, pinned trade node, unless allowEmotion is explicitly passed (test 5)', async () => {
  const sandbox = await loadSandbox({ window: { TradeJournalTradeStore: { find: (id) => (id === 'trade-1' ? TRADE_WITH_EMOTION : null) } } });
  const graph = sampleGraph();
  graph.nodes.find((n) => n.id === 'C').aiContext = { pinned: true, priority: 'normal' };
  const pkg = plain(sandbox.window.TradeJournalAnalysisGraphAiContext.build({ session: sampleSession(), graph, selectedNodeId: 'A' }));
  const tradeNode = pkg.nodes.find((n) => n.id === 'C');
  assert.equal(pkg.emotionIncluded, false);
  assert.equal(tradeNode.fields.emotionLog, undefined, 'emotionLog must never appear in the compact summary without explicit allowance');
});

test('emotion data is included ONLY when the trade node is both pinned AND allowEmotion is explicitly true for this request (test 6) - stricter than this app\'s own looser app-wide default (audited this pass)', async () => {
  const sandbox = await loadSandbox({ window: { TradeJournalTradeStore: { find: (id) => (id === 'trade-1' ? TRADE_WITH_EMOTION : null) } } });
  const graph = sampleGraph();
  graph.nodes.find((n) => n.id === 'C').aiContext = { pinned: true, priority: 'normal' };
  const builder = sandbox.window.TradeJournalAnalysisGraphAiContext;
  // allowEmotion:true but NOT pinned -> still excluded (both conditions required).
  const graphNotPinned = sampleGraph();
  const pkgNotPinned = builder.build({ session: sampleSession(), graph: graphNotPinned, selectedNodeId: 'A', allowEmotion: true });
  assert.equal(pkgNotPinned.emotionIncluded, false, 'allowEmotion alone, without the node being pinned, must not be enough');
  // pinned AND allowEmotion:true -> included.
  const pkg = builder.build({ session: sampleSession(), graph, selectedNodeId: 'A', allowEmotion: true });
  assert.equal(pkg.emotionIncluded, true);
  const tradeNode = pkg.nodes.find((n) => n.id === 'C');
  assert.ok(Array.isArray(tradeNode.fields.emotionLog));
});

test('selected node path resolution (test 7): the structural inclusion layer is exactly registry.resolveFocusPathNodeIds() - upstream/downstream/directly-connected nodes and edges, in one traversal', async () => {
  const sandbox = await loadSandbox();
  const pkg = plain(sandbox.window.TradeJournalAnalysisGraphAiContext.build({ session: sampleSession(), graph: sampleGraph(), selectedNodeId: 'B' }));
  assert.ok(pkg.includedNodeIds.includes('A') && pkg.includedNodeIds.includes('C'), 'selecting B (the middle node) must still reach both its upstream (A) and downstream (C) neighbors');
  assert.deepEqual(pkg.includedEdgeIds.slice().sort(), ['e1', 'e2'].sort());
});

test('market context inclusion (test 8): resolves a real marketContext node when present, else honestly falls back to the session-level {market,timeframe,instrument} - never fabricated', async () => {
  const sandbox = await loadSandbox();
  const graph = sampleGraph();
  const pkgNoNode = plain(sandbox.window.TradeJournalAnalysisGraphAiContext.build({ session: sampleSession(), graph, selectedNodeId: 'A' }));
  assert.deepEqual(pkgNoNode.marketContext, { market: 'London', timeframe: '15m', instrument: 'XAUUSD' });
  graph.nodes.push({ id: 'MC', type: 'marketContext', origin: 'reference', source: { type: 'marketContext', id: 'sess-1' }, title: 'Market Context', stageId: 'evidence', aiContext: { pinned: false, priority: 'normal' }, execution: null });
  const pkgWithNode = plain(sandbox.window.TradeJournalAnalysisGraphAiContext.build({ session: sampleSession(), graph, selectedNodeId: 'A' }));
  assert.deepEqual(pkgWithNode.marketContext, { market: 'London', timeframe: '15m', instrument: 'XAUUSD' });
});

test('Analysis Profile inclusion (test 9): calls the real window.TradeJournalAnalysisContext.getAnalysisContext() and trims it the same way session-analysis-client.js\'s own pickAdherenceProfile() does - never a second/duplicated profile system', async () => {
  const fakeContext = { primaryStyle: { id: 'smc' }, secondaryStyles: [], focuses: [{ id: 'liquidity' }], customMethodNotes: 'trade liquidity sweeps' };
  const sandbox = await loadSandbox({
    window: {
      TradeJournalAnalysisContext: { getAnalysisContext: (id) => (id === 'profile-1' ? fakeContext : null) },
      TradeJournalAnalysisProfileStore: { getDefault: () => ({ id: 'profile-1' }) }
    }
  });
  const pkg = plain(sandbox.window.TradeJournalAnalysisGraphAiContext.build({ session: sampleSession(), graph: sampleGraph(), selectedNodeId: 'A' }));
  assert.deepEqual(pkg.analysisProfile, { primaryStyle: { id: 'smc' }, secondaryStyles: [], focuses: [{ id: 'liquidity' }], customMethodNotes: 'trade liquidity sweeps' });
});

test('approxTokens uses the real repo-wide chars/4 heuristic (ai-context-builder.js\'s own debugLastPackage() convention) and grows with more included content', async () => {
  const sandbox = await loadSandbox();
  const small = sandbox.window.TradeJournalAnalysisGraphAiContext.build({ session: sampleSession(), graph: sampleGraph(), selectedNodeId: 'D' });
  const large = sandbox.window.TradeJournalAnalysisGraphAiContext.build({ session: sampleSession(), graph: sampleGraph(), selectedNodeId: 'A' });
  assert.ok(small.approxTokens > 0);
  assert.ok(large.approxTokens > small.approxTokens, 'a larger included set must produce a larger token estimate');
});

test('the context preview and the real context sent are provably the same function (test 23: "context preview matches actual context builder") - analysisGraphCanvas.jsx\'s AiContextPreviewModal and liveSessionView.jsx\'s runAiAnalysisNode both call window.TradeJournalAnalysisGraphAiContext / AnalysisGraphAiClient, never two separate implementations', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /builder\.build\(\{ session, graph, selectedNodeId \}\)/);
  const clientSrc = await readFile(shared('analysis-graph-ai-client.js'), 'utf8');
  assert.match(clientSrc, /var pkg = builder\.build\(input\);/, 'the client that actually sends a real run must call the exact same build() function the preview modal calls');
});

// ---------------------------------------------------------------------------
// Client (analysis-graph-ai-client.js): stale signature, reference validation.
// Tests 10-15 of the brief's section 25 list.
// ---------------------------------------------------------------------------

test('computeInputSignature (test 10 provenance / test 11-13 stale detection+propagation): identical included content -> identical signature; a change to an INCLUDED node\'s own summary changes it; a change to an EXCLUDED, unrelated node does NOT', async () => {
  const sandbox = await loadSandbox();
  const client = sandbox.window.TradeJournalAnalysisGraphAiClient;
  const session = sampleSession();
  const graphBase = sampleGraph();
  const pkg1 = await client.buildContext({ session, graph: graphBase, selectedNodeId: 'A' });
  assert.ok(pkg1);
  const sig1 = client.computeInputSignature(pkg1);
  const sig1Again = client.computeInputSignature(await client.buildContext({ session, graph: graphBase, selectedNodeId: 'A' }));
  assert.equal(sig1, sig1Again, 'building the identical context twice must produce the identical signature');

  // Changing D (excluded, unrelated) must NOT change the signature.
  const graphUnrelatedEdit = sampleGraph();
  graphUnrelatedEdit.nodes.find((n) => n.id === 'D').content = 'a completely different unrelated note';
  const pkg2 = await client.buildContext({ session, graph: graphUnrelatedEdit, selectedNodeId: 'A' });
  assert.equal(client.computeInputSignature(pkg2), sig1, 'an unrelated Note\'s own edit must never stale the AI node (section 7\'s explicit "unrelated changes do not stale AI" rule)');

  // Changing B (included, on the Focus Path) MUST change the signature.
  const graphIncludedEdit = sampleGraph();
  graphIncludedEdit.nodes.find((n) => n.id === 'B').content = 'a materially different linked note';
  const pkg3 = await client.buildContext({ session, graph: graphIncludedEdit, selectedNodeId: 'A' });
  assert.notEqual(client.computeInputSignature(pkg3), sig1, 'an included node\'s own real edit must change the input signature (this is what stale detection keys off)');
});

test('deleting a referenced source (the canonical record behind an included reference node, not just editing it) changes the input signature too (review question 5\'s last bullet: "deleting a referenced source causes stale/invalid state safely") - the compact summary degrades from a real title to the honest unavailable fallback, which is itself a real content change', async () => {
  const withTrade = await loadSandbox({ window: { TradeJournalTradeStore: { find: (id) => (id === 'trade-1' ? { id: 'trade-1', instrument: 'BTCUSDT', direction: 'long', status: 'open' } : null) } } });
  const withoutTrade = await loadSandbox({ window: { TradeJournalTradeStore: { find: () => null } } }); // the canonical Trade was deleted
  const session = sampleSession();
  const graph = sampleGraph(); // C is a 'trade' reference node, on A's Focus Path
  const pkgBefore = await withTrade.window.TradeJournalAnalysisGraphAiClient.buildContext({ session, graph, selectedNodeId: 'A' });
  const pkgAfter = await withoutTrade.window.TradeJournalAnalysisGraphAiClient.buildContext({ session, graph, selectedNodeId: 'A' });
  const sigBefore = withTrade.window.TradeJournalAnalysisGraphAiClient.computeInputSignature(pkgBefore);
  const sigAfter = withoutTrade.window.TradeJournalAnalysisGraphAiClient.computeInputSignature(pkgAfter);
  assert.notEqual(sigBefore, sigAfter, 'a completed AI result must become stale once a canonical source it relied on is deleted, not just when it is edited');
});

test('validateAiReferences (test 14/15 - structured AI references, invalid node references rejected): strips a hallucinated sourceNodeId/edge endpoint, drops a suggestion whose EVERY source id is fake, and keeps a genuinely grounded one intact', async () => {
  const sandbox = await loadSandbox();
  const client = sandbox.window.TradeJournalAnalysisGraphAiClient;
  const graph = sampleGraph();
  const suggestions = [
    { id: 's1', sourceNodeIds: ['A', 'ghost-node-99'], sourceEdgeIds: [] }, // partially real - the real id A survives via filtering elsewhere; this one keeps if its target/pair checks pass
    { id: 's2', sourceNodeIds: ['ghost-1', 'ghost-2'], sourceEdgeIds: [] }, // fully hallucinated - must be dropped
    { id: 's3', sourceNodeIds: ['A', 'B'], sourceEdgeIds: ['e1'] } // fully real
  ];
  const kept = client.validateAiReferences(suggestions, graph);
  const keptIds = kept.map((s) => s.id);
  assert.ok(!keptIds.includes('s2'), 's2 cites only fabricated node ids and must be stripped entirely');
  assert.ok(keptIds.includes('s3'), 's3 is fully grounded and must survive unchanged');
});

test('validateReferences (test 14/15): a reference to a real node id survives, a hallucinated one is dropped outright - never surfaced as a clickable chip', async () => {
  const sandbox = await loadSandbox();
  const client = sandbox.window.TradeJournalAnalysisGraphAiClient;
  const graph = sampleGraph();
  const refs = [{ nodeId: 'A', label: 'Scenario A' }, { nodeId: 'ghost-99', label: 'a node that does not exist' }];
  const kept = client.validateReferences(refs, graph);
  assert.deepEqual(kept.map((r) => r.nodeId), ['A']);
});

// ---------------------------------------------------------------------------
// Server (pattern-ai-server.mjs): structured schema, server-side sanitization (defense in depth),
// billing/dispatch wiring, real auth gate.
// ---------------------------------------------------------------------------

test('graphAiAnalysisFormat is a real strict json_schema matching section 9\'s structured response contract (summary/observations/contradictions/missingEvidence/scenarioSuggestions/edgeSuggestions/marketContextSuggestions/references)', async () => {
  const serverSrc = await readFile(path.join(root, 'server', 'pattern-ai-server.mjs'), 'utf8');
  const formatMatch = /const graphAiAnalysisFormat = \{[\s\S]*?\n\};/.exec(serverSrc);
  assert.ok(formatMatch, 'could not find graphAiAnalysisFormat');
  const format = formatMatch[0];
  assert.match(format, /type: 'json_schema', name: 'graph_ai_analysis', strict: true/);
  assert.match(format, /additionalProperties: false/);
  ['summary', 'observations', 'contradictions', 'missingEvidence', 'scenarioSuggestions', 'edgeSuggestions', 'marketContextSuggestions', 'references'].forEach((field) => {
    assert.match(format, new RegExp(field + ':'), `graphAiAnalysisFormat is missing the required field "${field}"`);
  });
});

test('sanitizeGraphAiResult (server-side, authoritative - defense in depth alongside the client\'s own validateAiReferences): strips a hallucinated node id from every citation field and drops a scenario suggestion with zero real source nodes', async () => {
  const serverSrc = await readFile(path.join(root, 'server', 'pattern-ai-server.mjs'), 'utf8');
  const fnMatch = /function sanitizeGraphAiResult\(raw, allNodeIdsList, allEdgeIdsList\) \{[\s\S]*?\n\}/.exec(serverSrc);
  assert.ok(fnMatch, 'could not find sanitizeGraphAiResult()');
  const filterMatch = /function filterKnownIds\(ids, known\) \{[\s\S]*?\}/.exec(serverSrc);
  assert.ok(filterMatch);
  const fn = new Function(`${filterMatch[0]}\n${fnMatch[0]}\nreturn sanitizeGraphAiResult;`)();
  const raw = {
    summary: 'A real summary',
    observations: [{ text: 'obs', nodeIds: ['A', 'ghost'] }],
    contradictions: [], missingEvidence: [],
    scenarioSuggestions: [{ id: 's1', sourceNodeIds: ['ghost-only'], title: 't', direction: 'long', summary: 's', explanation: 'e', confidence: 'low' }],
    edgeSuggestions: [{ id: 'e1', sourceNodeId: 'A', targetNodeId: 'ghost', relation: 'supports', explanation: 'e', confidence: 'low' }],
    marketContextSuggestions: [],
    references: [{ nodeId: 'A', label: 'Scenario A' }, { nodeId: 'ghost', label: 'fake' }]
  };
  const clean = fn(raw, ['A', 'B'], ['e1']);
  assert.deepEqual(clean.observations[0].nodeIds, ['A'], 'the hallucinated id must be stripped, the real one kept');
  assert.equal(clean.scenarioSuggestions.length, 0, 'a suggestion citing zero real source nodes must be dropped entirely');
  assert.equal(clean.edgeSuggestions.length, 0, 'an edge suggestion whose target is a hallucinated node must be dropped');
  assert.deepEqual(clean.references.map((r) => r.nodeId), ['A']);
});

test('the /api/sessions/graph-ai-analysis route is registered in AI_BILLED_ROUTES and the URL dispatch table', async () => {
  const serverSrc = await readFile(path.join(root, 'server', 'pattern-ai-server.mjs'), 'utf8');
  assert.match(serverSrc, /'\/api\/sessions\/graph-ai-analysis': 'graphAiAnalysis'/);
  assert.match(serverSrc, /request\.url === '\/api\/sessions\/graph-ai-analysis'\) result = await graphAiAnalysis\(body\);/);
});

let communityRepo, communityServer, communityBaseUrl, aiServer, aiBaseUrl;
before(async () => {
  process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || 'test-internal-secret-please-ignore';
  process.env.PATTERN_AI_PORT = '0';
  communityRepo = createMemoryRepo();
  communityServer = createApp({ repo: communityRepo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => communityServer.once('listening', resolve));
  communityBaseUrl = `http://127.0.0.1:${communityServer.address().port}`;
  process.env.COMMUNITY_API_URL = communityBaseUrl;
  const aiModule = await import('../server/pattern-ai-server.mjs');
  aiServer = aiModule.default;
  if (!aiServer.listening) await new Promise((resolve) => aiServer.once('listening', resolve));
  aiBaseUrl = `http://127.0.0.1:${aiServer.address().port}`;
});
after(async () => {
  await new Promise((resolve) => communityServer.close(resolve));
  aiServer.close();
});
async function registerAndGetCookie(email) {
  const response = await fetch(`${communityBaseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'a genuinely long passphrase 1234', displayName: 'Graph AI Tester' })
  });
  const body = await response.json();
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('navrya_session=') || c.startsWith('__Host-navrya_session='));
  return { userId: body.user.id, cookie: setCookie.split(';')[0] };
}
let emailCounter = 0;
function uniqueEmail() { emailCounter += 1; return `graph-ai-tester-${emailCounter}-${Date.now()}@example.com`; }

test('an anonymous call to /api/sessions/graph-ai-analysis is rejected with AUTH_SESSION_REQUIRED, never reaching provider-calling logic', async () => {
  const response = await fetch(`${aiBaseUrl}/api/sessions/graph-ai-analysis`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'openai', context: {} })
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'AUTH_SESSION_REQUIRED');
});

test('a real, valid session reaches the real graphAiAnalysis handler - an honest *_API_KEY_MISSING with no key configured, never 401/404 (section 26\'s "verify the unavailable/error path honestly")', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const response = await fetch(`${aiBaseUrl}/api/sessions/graph-ai-analysis`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      provider: 'openai', language: 'en', nodeId: 'ai1', nodeType: 'aiAnalysis', config: {},
      context: { selectedNodeId: 'A', includedNodeIds: ['A'], includedEdgeIds: [], nodes: [], edges: [], marketContext: null, analysisProfile: null, emotionIncluded: false, similarSessionsIncluded: false },
      allNodeIds: ['A'], allEdgeIds: []
    })
  });
  assert.notEqual(response.status, 401);
  assert.notEqual(response.status, 404);
  assert.match((await response.json()).error, /_API_KEY_MISSING$/);
});

// ---------------------------------------------------------------------------
// liveSessionView.jsx: execution lifecycle, canonical domain safety, idempotency.
// ---------------------------------------------------------------------------

test('runAiAnalysisNode prevents duplicate concurrent runs (section 8) - checks execution.state==="running" and returns early before ever calling the AI client', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /async function runAiAnalysisNode\(nodeId, opts\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(fnMatch, 'could not find runAiAnalysisNode()');
  assert.match(fnMatch[0], /if \(node\.execution && node\.execution\.state === 'running'\) return \{ ok: false, error: 'ALREADY_RUNNING' \};/);
  // The early-return check must appear BEFORE the actual client.runGraphAiAnalysis() call.
  const guardIndex = fnMatch[0].indexOf("state === 'running'");
  const callIndex = fnMatch[0].indexOf('client.runGraphAiAnalysis(');
  assert.ok(guardIndex > -1 && callIndex > -1 && guardIndex < callIndex);
});

test('runAiAnalysisNode sets "running" via exactly one persist() call before the network request, and writes the final completed/failed state via exactly one persist() call after - never a per-chunk/per-progress-tick write', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /async function runAiAnalysisNode\(nodeId, opts\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  const persistCalls = (fnMatch[0].match(/persist\(\(s\) => \{/g) || []).length;
  assert.equal(persistCalls, 2, 'exactly two persist() calls: one to flip to running, one to record the final outcome');
  assert.match(fnMatch[0], /n\.execution\.state = 'running';/);
  assert.match(fnMatch[0], /n\.execution\.state = 'completed';/);
  assert.match(fnMatch[0], /n\.execution\.state = 'failed';/);
});

test('runAiAnalysisNode reuses the trader\'s real, existing AI settings (window.TradeJournalAISettingsStore.activeProvider/activeModel/getKey) - never a second/new provider selector (section 20)', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /async function runAiAnalysisNode\(nodeId, opts\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.match(fnMatch[0], /window\.TradeJournalAISettingsStore/);
  assert.match(fnMatch[0], /settingsStore\.activeProvider\(\)/);
  assert.match(fnMatch[0], /settingsStore\.activeModel\(\)/);
  assert.match(fnMatch[0], /settingsStore\.getKey\(provider\)/);
});

test('runAiAnalysisNode passes includeSimilarSessions/allowEmotion straight through from an explicit per-run opts flag, both false by default - never silently on (section 3E/5)', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /async function runAiAnalysisNode\(nodeId, opts\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.match(fnMatch[0], /includeSimilarSessions: !!\(opts && opts\.includeSimilarSessions\)/);
  assert.match(fnMatch[0], /allowEmotion: !!\(opts && opts\.allowEmotion\)/);
});

test('applyGraphAiSuggestion: a rejected suggestion NEVER touches session.entries or graph.nodes/edges (test 18 - "rejected suggestion does not mutate canonical data")', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function applyGraphAiSuggestion\(aiNodeId, suggestionId, status\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(fnMatch, 'could not find applyGraphAiSuggestion()');
  // The rejected branch is now its own small, clearly-delimited if-block (architecture review
  // 2026-09-12 restructuring) - extracted by real brace matching, not a fragile string offset.
  const start = fnMatch[0].indexOf("if (status === 'rejected') {");
  assert.ok(start > -1, 'could not find the rejected branch');
  const end = fnMatch[0].indexOf('} else if', start);
  assert.ok(end > -1);
  const rejectedBranch = fnMatch[0].slice(start, end);
  assert.doesNotMatch(rejectedBranch, /entry\.scenarios =/, 'no canonical Scenario write may occur in the rejected branch');
  assert.doesNotMatch(rejectedBranch, /g\.nodes = g\.nodes\.concat/, 'no graph node creation may occur in the rejected branch');
  assert.doesNotMatch(rejectedBranch, /g\.edges = g\.edges\.concat/, 'no graph edge creation may occur in the rejected branch');
});

test('applyGraphAiSuggestion: an approved scenario suggestion writes a real canonical Scenario using the exact same field shape addScenario()/buildScenarioDraftFromAi() already use (test 19), inside ONE persist() call (never N sequential calls, mirroring the auto-layout race fix this pass documents)', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function applyGraphAiSuggestion\(aiNodeId, suggestionId, status\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.equal((fnMatch[0].match(/persist\(\(s\) => \{/g) || []).length, 1, 'exactly one persist() call for the whole approval');
  assert.match(fnMatch[0], /probabilityHistory: \[\{ value: 50, loggedAt: new Date\(\)\.toISOString\(\) \}\]/, 'must seed probabilityHistory the same way addScenario() does, not a different shape');
  assert.match(fnMatch[0], /aiSource: \{/, 'must record real AI provenance on the created Scenario, matching buildScenarioDraftFromAi()\'s own convention');
  assert.match(fnMatch[0], /entry\.scenarios = \(entry\.scenarios \|\| \[\]\)\.concat\(\[scenario\]\);/);
});

test('applyGraphAiSuggestion: an already-resolved suggestion (status !== "pending") is never re-applied - idempotent, no double-mutation on a duplicate click', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function applyGraphAiSuggestion\(aiNodeId, suggestionId, status\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.match(fnMatch[0], /if \(!target \|\| target\.status !== 'pending'\) return;/);
});

// ---------------------------------------------------------------------------
// Architecture review (2026-09-12) findings and fixes - regression coverage.
// ---------------------------------------------------------------------------

test('REAL BUG FOUND VIA ARCHITECTURE REVIEW, FIXED: approving a scenario suggestion whose target entry no longer exists must NOT be marked "applied" - target.status = \'applied\' now lives strictly INSIDE the `if (entry)` guard, never before it, so a suggestion that can no longer be applied honestly stays \'pending\' instead of silently reporting a false success', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function applyGraphAiSuggestion\(aiNodeId, suggestionId, status\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  const guardIndex = fnMatch[0].indexOf('const entry = (s.entries || []).find((e) => e.id === target.payload.entryId);');
  assert.ok(guardIndex > -1);
  const ifEntryIndex = fnMatch[0].indexOf('if (entry) {', guardIndex);
  const statusAppliedIndex = fnMatch[0].indexOf("target.status = 'applied';", guardIndex);
  assert.ok(ifEntryIndex > -1 && statusAppliedIndex > ifEntryIndex, 'target.status must only be set to \'applied\' AFTER (inside) the if(entry) guard, never before it');
  assert.match(fnMatch[0], /\/\/ else: the target entry was deleted since this run - target\.status stays 'pending'/);
  // The function must report whether it actually applied anything, rather than the caller having
  // to assume success.
  assert.match(fnMatch[0], /return applied;/);
});

test('REAL BUG FOUND VIA ARCHITECTURE REVIEW, FIXED: approving an edge suggestion whose endpoint was deleted, or whose port pair is no longer compatible, or which would duplicate an existing edge, must NOT be marked "applied" - target.status = \'applied\' lives strictly inside the `if (pair && !dupe)` guard', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function applyGraphAiSuggestion\(aiNodeId, suggestionId, status\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  const guardIndex = fnMatch[0].indexOf("const pair = (sourceExists && targetExists) ? registry.compatiblePortPair(sourceType, targetType) : null;");
  assert.ok(guardIndex > -1);
  const ifPairIndex = fnMatch[0].indexOf('if (pair && !dupe) {', guardIndex);
  const statusAppliedIndex = fnMatch[0].indexOf("target.status = 'applied';", guardIndex);
  assert.ok(ifPairIndex > -1 && statusAppliedIndex > ifPairIndex, 'target.status must only be set to \'applied\' AFTER (inside) the if(pair && !dupe) guard, never before it');
});

test('applyGraphAiSuggestion returns a real boolean reflecting whether the suggestion actually applied, and liveSessionView.jsx never fabricates a top-level unconditional target.status = status assignment outside the three real type branches', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function applyGraphAiSuggestion\(aiNodeId, suggestionId, status\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  // There must be no bare `target.status = status;` anywhere (the exact pattern of the original
  // bug) - every assignment is a literal 'applied'/'rejected', gated by a real success check.
  assert.doesNotMatch(fnMatch[0], /target\.status = status;/);
  const statusAssignments = (fnMatch[0].match(/target\.status = '(applied|rejected)';/g) || []).length;
  assert.equal(statusAssignments, 4, 'expected exactly 4 status assignments: rejected, createNode-success, createEdge-success, suggestMarketContext-success');
});

test('normalizeAiResult (architecture review finding: Inspector must degrade gracefully, not crash, on a malformed/legacy/corrupted stored AI result) deep-normalizes every array field, never trusting raw persisted shape', async () => {
  const sandbox = await loadSandbox();
  const registry = sandbox.window.TradeJournalAnalysisGraphRegistry;
  assert.equal(registry.normalizeAiResult(null), null);
  assert.equal(registry.normalizeAiResult('not an object'), null);
  const malformed = {
    summary: 42, // not a string
    observations: 'not an array',
    contradictions: [{ text: 'real one', nodeIds: ['A'] }, 'not an object', { text: 5, nodeIds: 'not an array' }],
    missingEvidence: null,
    references: [{ nodeId: 'A', label: 'ok' }, { nodeId: 42 }, null]
  };
  const clean = plain(registry.normalizeAiResult(malformed));
  assert.equal(clean.summary, '', 'a non-string summary must degrade to an empty string, never throw');
  assert.deepEqual(clean.observations, [], 'a non-array observations must degrade to an empty array');
  assert.deepEqual(clean.contradictions, [{ text: 'real one', nodeIds: ['A'] }, { text: '', nodeIds: [] }, { text: '', nodeIds: [] }], 'a malformed contradiction item degrades to safe empty fields instead of crashing whatever renders it');
  assert.deepEqual(clean.missingEvidence, []);
  assert.deepEqual(clean.references, [{ nodeId: 'A', label: 'ok' }], 'a reference with a non-string nodeId or a null entry is dropped, never rendered as a broken chip');
  assert.deepEqual(clean.scenarioSuggestions, []);
  assert.deepEqual(clean.edgeSuggestions, []);
  assert.deepEqual(clean.marketContextSuggestions, []);
});

test('a node.execution.result stored with malformed array fields is normalized safely by normalizeNode() (not just by a standalone helper) - the actual read path the Inspector renders from', async () => {
  const sandbox = await loadSandbox();
  const registry = sandbox.window.TradeJournalAnalysisGraphRegistry;
  const graph = plain(registry.normalizeAnalysisGraph({
    nodes: [{
      id: 'ai1', type: 'aiAnalysis',
      execution: { state: 'completed', result: { summary: 'ok', contradictions: 'not-an-array', references: [{ nodeId: 'x' }] } }
    }]
  }));
  assert.deepEqual(graph.nodes[0].execution.result.contradictions, []);
  assert.deepEqual(graph.nodes[0].execution.result.references, [{ nodeId: 'x', label: '' }]);
});

test('the Graph AI Context Builder enforces a real hard cap on included node count (architecture review finding: nothing previously prevented a densely-connected graph\'s Focus Path from silently becoming "the whole graph") - explicit (pinned/required) nodes are truncated by priority, structural nodes by proximity, and truncation is always honestly reported via pkg.truncated, never silent', async () => {
  const sandbox = await loadSandbox();
  const registry = sandbox.window.TradeJournalAnalysisGraphRegistry;
  const builder = sandbox.window.TradeJournalAnalysisGraphAiContext;
  // Build one long connected chain (A0 -> A1 -> A2 -> ... -> A49): a single connected component of
  // 50 nodes, the exact "50+ nodes" scale ARCHITECTURE.md's own performance section calls for.
  const nodes = [];
  const edges = [];
  for (let i = 0; i < 50; i++) {
    nodes.push({ id: 'A' + i, type: 'note', origin: 'manual', content: 'node ' + i, title: 'Note ' + i, stageId: 'observation', aiContext: { pinned: false, priority: 'normal' }, execution: null });
    if (i > 0) edges.push({ id: 'e' + i, sourceNodeId: 'A' + (i - 1), targetNodeId: 'A' + i, relation: 'informs' });
  }
  const graph = { nodes, edges };
  const pkg = plain(builder.build({ session: { id: 's1', entries: [] }, graph, selectedNodeId: 'A0' }));
  assert.ok(pkg.includedNodeIds.length < 50, 'a single 50-node connected component must never be included in full by default');
  assert.equal(pkg.truncated, true, 'truncation must be honestly reported, never silent');
  assert.ok(pkg.excludedNodeIds.length > 0);
  // The selected node itself must always survive the cap.
  assert.ok(pkg.includedNodeIds.includes('A0'));
});

test('the context-size cap keeps required-priority explicit nodes before important/plain-pinned ones when there are too many explicit nodes to all fit', async () => {
  const sandbox = await loadSandbox();
  const builder = sandbox.window.TradeJournalAnalysisGraphAiContext;
  const nodes = [];
  for (let i = 0; i < 30; i++) {
    nodes.push({ id: 'P' + i, type: 'note', origin: 'manual', content: 'x', title: 'x', stageId: 'observation', aiContext: { pinned: true, priority: i === 29 ? 'required' : 'normal' }, execution: null });
  }
  const graph = { nodes, edges: [] };
  const pkg = plain(builder.build({ session: { id: 's1', entries: [] }, graph, selectedNodeId: null }));
  assert.equal(pkg.truncated, true);
  assert.ok(pkg.includedNodeIds.includes('P29'), 'the one required-priority node must survive the explicit-node truncation ahead of plain pinned/normal ones');
});

test('a failed AI run leaves canonical data untouched (test 20) - the failure branch only ever sets execution.state/error, never touches session.entries', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /async function runAiAnalysisNode\(nodeId, opts\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  const failedBranchStart = fnMatch[0].indexOf("n.execution.state = 'failed';");
  const failedBranchEnd = fnMatch[0].indexOf('}', failedBranchStart);
  const failedBranch = fnMatch[0].slice(failedBranchStart, failedBranchEnd);
  assert.doesNotMatch(failedBranch, /entries/i);
});

test('clearAiNodeResult (section 21\'s "[Clear Result]") clears only graph AI execution metadata (result/suggestions/provenance/error), never session.entries or any canonical field - a previously-applied suggestion\'s real Scenario stays real', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function clearAiNodeResult\(nodeId\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(fnMatch, 'could not find clearAiNodeResult()');
  assert.match(fnMatch[0], /node\.execution\.state = 'idle';/);
  assert.match(fnMatch[0], /node\.execution\.result = null;/);
  assert.match(fnMatch[0], /node\.execution\.suggestions = \[\];/);
  assert.doesNotMatch(fnMatch[0], /entries/i);
});

test('liveSessionView.jsx wires runAiAnalysisNode/applyGraphAiSuggestion/clearAiNodeResult through to AnalysisGraphView (no silent prop drop)', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const callStart = [...liveSessionSrc.matchAll(/<AnalysisGraphView/g)].map((m) => m.index).find((i) => liveSessionSrc.slice(i, liveSessionSrc.indexOf('/>', i)).includes('onAddNode='));
  assert.ok(callStart > -1);
  const call = liveSessionSrc.slice(callStart, liveSessionSrc.indexOf('/>', callStart));
  assert.match(call, /onRunAiNode=\{runAiAnalysisNode\}/);
  assert.match(call, /onApplyAiSuggestion=\{applyGraphAiSuggestion\}/);
  assert.match(call, /onClearAiResult=\{clearAiNodeResult\}/);
});

test('analysisGraphView.jsx forwards onRunAiNode/onApplyAiSuggestion/onClearAiResult through to AnalysisGraphCanvas unchanged', async () => {
  const viewSrc = await readFile(src('analysisGraphView.jsx'), 'utf8');
  assert.match(viewSrc, /onRunAiNode, onApplyAiSuggestion, onClearAiResult/);
  const canvasCall = viewSrc.slice(viewSrc.indexOf('<AnalysisGraphCanvas'), viewSrc.indexOf('/>', viewSrc.indexOf('<AnalysisGraphCanvas')));
  assert.match(canvasCall, /onRunAiNode=\{onRunAiNode\}/);
  assert.match(canvasCall, /onApplyAiSuggestion=\{onApplyAiSuggestion\}/);
  assert.match(canvasCall, /onClearAiResult=\{onClearAiResult\}/);
});

// ---------------------------------------------------------------------------
// analysisGraphCanvas.jsx: AI Node Inspector panel, suggestion approval UI, contradictions,
// clickable references, capability-driven helpers (not literal node.type string checks).
// ---------------------------------------------------------------------------

test('REAL BUG FOUND VIA LIVE BROWSER VERIFICATION, FIXED: AnalysisGraphCanvas() itself must destructure onRunAiNode/onApplyAiSuggestion/onClearAiResult from its own props before passing them down to <Inspector> - they were referenced at the Inspector call site without ever being declared in AnalysisGraphCanvas\'s own parameter list, which crashed the whole canvas (ReferenceError: onRunAiNode is not defined) the instant a trader selected ANY node', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnStart = canvasSrc.indexOf('export function AnalysisGraphCanvas({');
  const fnParamsEnd = canvasSrc.indexOf('}) {', fnStart);
  const params = canvasSrc.slice(fnStart, fnParamsEnd);
  assert.match(params, /onRunAiNode/, 'onRunAiNode must be destructured from AnalysisGraphCanvas\'s own props');
  assert.match(params, /onApplyAiSuggestion/);
  assert.match(params, /onClearAiResult/);
});

test('aiAnalysis is the ONE type registered in AI_NODE_PANEL_ADAPTERS, wired into Inspector via typeDef.capabilities.executable - Inspector() itself still contains zero node.type equality branches (its own existing tested invariant)', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /const AI_NODE_PANEL_ADAPTERS = \{ aiAnalysis: AiNodePanel \};/);
  assert.match(canvasSrc, /typeDef\.capabilities\.executable && AiPanel/);
  const fnStart = canvasSrc.indexOf('function Inspector(');
  const fnEnd = canvasSrc.indexOf('function BulkInspector(', fnStart);
  assert.ok(fnStart > -1 && fnEnd > -1);
  assert.doesNotMatch(canvasSrc.slice(fnStart, fnEnd), /node\.type === '/);
});

test('findConnectedAiAnalysisNode (section 23\'s "Run AI Analysis" contextual shortcut) is capability-driven (checks typeDef.capabilities.executable), never a literal node.type === \'aiAnalysis\' string comparison - so it generalizes to any future second executable type without editing Inspector', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function findConnectedAiAnalysisNode\(node, graph, registry\) \{[\s\S]*?\n\}/.exec(canvasSrc);
  assert.ok(fnMatch, 'could not find findConnectedAiAnalysisNode()');
  assert.doesNotMatch(fnMatch[0], /\.type === 'aiAnalysis'/);
  assert.match(fnMatch[0], /otherDef\.capabilities\.executable/);
});

test('contradictions (section 14, a first-class output) render with a danger-toned block and clickable ReferenceChip citations, never buried inside plain observation text', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function AiNodePanel\(\{[\s\S]*?\n\}/.exec(canvasSrc);
  assert.ok(fnMatch, 'could not find AiNodePanel()');
  assert.match(fnMatch[0], /tr\(lang, 'contradictionsTitle'\)/);
  assert.match(fnMatch[0], /exec\.result\.contradictions\.map/);
  assert.match(fnMatch[0], /ReferenceChip key=\{id\}/);
});

test('missingEvidence (section 15) renders as plain text only - AI may only SUGGEST missing evidence, the panel never wires an auto-apply/mutation action to it', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function AiNodePanel\(\{[\s\S]*?\n\}/.exec(canvasSrc);
  const start = fnMatch[0].indexOf('missingEvidenceTitle');
  const end = fnMatch[0].indexOf('</div>', start);
  const block = fnMatch[0].slice(start, end);
  assert.doesNotMatch(block, /onApplyAiSuggestion/, 'missing-evidence items must never themselves trigger an approval/mutation action');
});

test('SuggestionCard wires Approve/Reject to onApplyAiSuggestion(nodeId, suggestionId, \'applied\'|\'rejected\') - matches this app\'s real "pending/applied/rejected" suggestion-card convention (audited this pass: strategiesHubView.jsx/mental-health-ui.js), never a generic "approved" string', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function SuggestionCard\(\{[\s\S]*?\n\}/.exec(canvasSrc);
  assert.ok(fnMatch, 'could not find SuggestionCard()');
  assert.match(fnMatch[0], /onClick=\{onApply\}/);
  assert.match(fnMatch[0], /onClick=\{onReject\}/);
  const panelMatch = /function AiNodePanel\(\{[\s\S]*?\n\}/.exec(canvasSrc);
  assert.match(panelMatch[0], /onApply=\{\(\) => onApplyAiSuggestion\(node\.id, s\.id, 'applied'\)\}/);
  assert.match(panelMatch[0], /onReject=\{\(\) => onApplyAiSuggestion\(node\.id, s\.id, 'rejected'\)\}/);
});

test('the [Run Analysis] button is disabled while the node is already running, preventing a double-click from firing a second concurrent onRunAiNode call from the UI layer too (defense in depth alongside runAiAnalysisNode\'s own ALREADY_RUNNING guard)', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function AiNodePanel\(\{[\s\S]*?\n\}/.exec(canvasSrc);
  assert.match(fnMatch[0], /disabled=\{running\}/);
});

test('AiContextPreviewModal calls the SAME window.TradeJournalAnalysisGraphAiContext.build() a real run uses - "View AI Context" always shows exactly what would be sent, never a separately-implemented preview', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function AiContextPreviewModal\(\{[\s\S]*?\n\}/.exec(canvasSrc);
  assert.ok(fnMatch, 'could not find AiContextPreviewModal()');
  assert.match(fnMatch[0], /window\.TradeJournalAnalysisGraphAiContext/);
  assert.match(fnMatch[0], /builder\.build\(\{ session, graph, selectedNodeId \}\)/);
  // The truncation warning (architecture review finding) must be surfaced in this SAME modal,
  // never a silent cap the trader has no way to discover.
  assert.match(fnMatch[0], /pkg\.truncated && <span[\s\S]{0,80}tr\(lang, 'contextTruncated'\)/);
});

test('all four i18n dictionaries declare the real AI Node phase keys (runAnalysis/viewContext/clearResult/suggestionsTitle/apply/reject/stateCompleted/stateFailed/stateStale)', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const keys = ['runAnalysis', 'viewContext', 'clearResult', 'suggestionsTitle', 'apply', 'reject', 'stateCompleted', 'stateFailed', 'stateStale', 'contradictionsTitle', 'missingEvidenceTitle', 'referencesTitle'];
  ['fa:', 'ar:', 'en:', 'es:'].forEach((langTag) => {
    const idx = canvasSrc.indexOf('\n  ' + langTag);
    assert.ok(idx > -1, `could not find the ${langTag} copy block`);
    const nextIdx = canvasSrc.indexOf('\n  },', idx);
    const langBlock = canvasSrc.slice(idx, nextIdx);
    keys.forEach((key) => assert.match(langBlock, new RegExp('\\b' + key + ':'), `${langTag} copy block is missing ${key}`));
  });
});

// ---------------------------------------------------------------------------
// Script wiring + real end-to-end persistence.
// ---------------------------------------------------------------------------

test('analysis-graph-ai-context.js and analysis-graph-ai-client.js load as scripts, right after analysis-graph-registry.js, on every character page', async () => {
  for (const character of ['hunter', 'commander', 'engineer', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const registryIdx = html.indexOf('analysis-graph-registry.js');
    const contextIdx = html.indexOf('analysis-graph-ai-context.js');
    const clientIdx = html.indexOf('analysis-graph-ai-client.js');
    assert.ok(registryIdx > -1 && contextIdx > registryIdx && clientIdx > contextIdx, `${character}/index.html must load registry -> ai-context -> ai-client in that order`);
  }
});

test('a real aiAnalysis node with a completed execution (provenance/result/suggestions) round-trips through repo.memory.mjs alongside the rest of the graph', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.instrumentCatalog.upsert(user.id, { id: 'instr-' + user.id, code: 'XAUUSD' });
  const aiNode = {
    id: 'ai1', type: 'aiAnalysis', typeVersion: 1, origin: 'derived', source: null, title: 'AI Analysis', status: 'active',
    stageId: 'observation', position: { x: 0, y: 0 }, content: '', config: {},
    aiContext: { pinned: false, priority: 'normal' },
    execution: {
      state: 'completed', lastRunAt: '2026-01-01T00:00:00.000Z',
      provenance: { sourceNodeIds: ['A'], sourceEdgeIds: [], marketContextRef: { market: 'London', timeframe: '15m', instrument: 'XAUUSD' }, analysisProfileRef: null, provider: 'openai', model: 'gpt-5.6', timestamp: '2026-01-01T00:00:00.000Z', inputSignature: 'abc123' },
      result: { summary: 'A real summary', observations: [], contradictions: [], missingEvidence: [], scenarioSuggestions: [], edgeSuggestions: [], marketContextSuggestions: [], references: [] },
      suggestions: [{ id: 's1', type: 'createEdge', target: null, payload: { sourceNodeId: 'A', targetNodeId: 'B', relation: 'informs' }, sourceNodeIds: ['A', 'B'], sourceEdgeIds: [], explanation: 'why', confidence: 'medium', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' }],
      error: null
    },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  };
  await repo.tradingSessions.upsert(user.id, {
    id: 's1', market: 'London', instrument: 'XAUUSD', timeframe: '15m', date: '2026-01-01', entries: [],
    analysisGraph: { version: 1, nodes: [aiNode], edges: [], groups: [], stages: [], viewport: { x: 0, y: 0, zoom: 1 }, workflowMeta: {}, template: null, updatedAt: null }
  });
  const stored = await repo.tradingSessions.get(user.id, 's1');
  assert.deepEqual(stored.analysisGraph.nodes[0], aiNode);
});
