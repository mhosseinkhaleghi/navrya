import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// "نقشه تحلیل" (Analysis Map) - see public/pages/shared/analysis-graph-registry.js's header
// comment for the full scope note. Mirrors tests/analysis-workspace-panel.test.mjs's/
// tests/analysis-focus-registry.test.mjs's own conventions: a vm sandbox for the window-global
// registry file (real Node has no `window`), a real repo.memory.mjs round-trip for the
// server-side field wiring, and plain-text/regex assertions against navrya-src/*.jsx (this
// runner has no JSX transform, so source-text assertions are the established pattern here too -
// see analysis-workspace-panel.test.mjs:310-321's own comment on the same convention).

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const src = (...parts) => path.join(root, 'navrya-src', ...parts);

async function loadRegistry() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  const source = await readFile(shared('analysis-graph-registry.js'), 'utf8');
  vm.runInContext(source, sandbox, { filename: 'analysis-graph-registry.js' });
  return sandbox.window.TradeJournalAnalysisGraphRegistry;
}

// The registry runs in a separate vm realm - its arrays/objects are NOT the same Array/Object
// constructors as this file's, so assert.deepStrictEqual (what node:assert/strict's deepEqual
// really is) fails with "same structure but are not reference-equal" even when the content is
// identical (the same reason analysis-focus-registry.test.mjs's own header comment gives for
// avoiding deepEqual against sandboxed values). Round-tripping through JSON strips the foreign
// realm's prototypes so plain-literal comparisons work normally.
const plain = (value) => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------------------
// Registry: normalization must never throw and must produce a safe default.
// ---------------------------------------------------------------------------

test('registers window.TradeJournalAnalysisGraphRegistry with the documented shape', async () => {
  const registry = await loadRegistry();
  assert.ok(registry);
  assert.equal(registry.GRAPH_VERSION, 1);
  assert.deepEqual(plain(registry.NODE_ORIGINS), ['reference', 'derived', 'manual']);
  assert.ok(registry.RELATION_IDS.includes('supports'));
  assert.ok(registry.RELATION_IDS.includes('contradicts'));
  assert.ok(registry.NODE_TYPES.sessionEntry);
  assert.ok(registry.NODE_TYPES.sessionScenario);
});

test('a session with no analysisGraph at all normalizes to a valid empty graph with the default 8-stage template snapshot, not a crash', async () => {
  const registry = await loadRegistry();
  [undefined, null, '', 42, 'not-an-object'].forEach((raw) => {
    const graph = plain(registry.normalizeAnalysisGraph(raw));
    assert.equal(graph.version, 1);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(graph.edges, []);
    assert.deepEqual(graph.groups, []);
    assert.deepEqual(graph.viewport, { x: 0, y: 0, zoom: 1 });
    // Section 27: a brand-new graph gets a real 8-stage template snapshot, not an empty array -
    // stages exist before any node does, so the legend/Inspector "Change Stage" dropdown is never
    // empty for a fresh session.
    assert.equal(graph.stages.length, 8);
    assert.deepEqual(graph.stages.map((s) => s.id), ['preparation', 'evidence', 'observation', 'thesis', 'scenarios', 'risk', 'decision', 'outcome']);
    assert.equal(graph.template.templateId, 'default-v1');
    assert.deepEqual(graph.template.snapshot, graph.stages);
  });
});

test('a session that already has an older/edited stages array keeps it verbatim - the template snapshot is never silently reshuffled on read', async () => {
  const registry = await loadRegistry();
  const customStages = [{ id: 'only-stage', order: 1, name: { fa: 'x', ar: 'x', en: 'x', es: 'x' } }];
  const graph = plain(registry.normalizeAnalysisGraph({ stages: customStages, template: { templateId: 'default-v1', snapshot: customStages } }));
  assert.deepEqual(graph.stages, customStages);
});

test('a malformed graph (wrong types for arrays/viewport) normalizes safely instead of throwing', async () => {
  const registry = await loadRegistry();
  const graph = plain(registry.normalizeAnalysisGraph({ nodes: 'not-an-array', viewport: 'nope', edges: null, version: 'x' }));
  assert.deepEqual(graph.nodes, []);
  assert.deepEqual(graph.edges, []);
  assert.deepEqual(graph.viewport, { x: 0, y: 0, zoom: 1 });
  assert.equal(graph.version, 1, 'an invalid version falls back to the current GRAPH_VERSION rather than staying garbage');
});

test('a real node round-trips through normalizeAnalysisGraph unchanged', async () => {
  const registry = await loadRegistry();
  const node = {
    id: 'n1', type: 'sessionScenario', typeVersion: 1, origin: 'reference',
    source: { type: 'sessionScenario', id: 'scenario-1' }, title: 'Bearish thesis', status: 'active',
    stageId: 'scenarios', position: { x: 10, y: 20 }, content: '', config: {}, execution: null,
    // aiContext is the one field normalizeNode always adds even to an input that didn't declare it
    // (AI Node pass addition) - included here explicitly so this "round-trips unchanged" test
    // stays a genuine byte-for-byte proof rather than silently passing due to a loose comparison.
    aiContext: { pinned: false, priority: 'normal' },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  };
  const graph = plain(registry.normalizeAnalysisGraph({ nodes: [node] }));
  assert.equal(graph.nodes.length, 1);
  assert.deepEqual(graph.nodes[0], node);
});

test('a node with no stageId gets the real type-appropriate default stage, not the first stage blindly', async () => {
  const registry = await loadRegistry();
  const graph = plain(registry.normalizeAnalysisGraph({
    nodes: [
      { id: 'n1', type: 'sessionEntry', source: { type: 'sessionEntry', id: 'e1' } },
      { id: 'n2', type: 'sessionScenario', source: { type: 'sessionScenario', id: 's1' } },
      { id: 'n3', type: 'trade', source: { type: 'trade', id: 't1' } },
      { id: 'n4', type: 'note' }
    ]
  }));
  const byId = {}; graph.nodes.forEach((n) => { byId[n.id] = n; });
  assert.equal(byId.n1.stageId, 'evidence');
  assert.equal(byId.n2.stageId, 'scenarios');
  assert.equal(byId.n3.stageId, 'decision');
  assert.equal(byId.n4.stageId, 'observation');
});

test('a node whose stored stageId no longer exists in the (possibly edited) stage list falls back to a real default stage, never an invalid one', async () => {
  const registry = await loadRegistry();
  const graph = plain(registry.normalizeAnalysisGraph({ nodes: [{ id: 'n1', type: 'note', stageId: 'deleted-stage-id' }] }));
  assert.notEqual(graph.nodes[0].stageId, 'deleted-stage-id');
  assert.ok(graph.stages.some((s) => s.id === graph.nodes[0].stageId));
});

test('a processing (derived) node carries a real execution object forced to "unavailable" (no processor implemented) even if malicious/malformed input claims otherwise; a reference/manual node carries none at all', async () => {
  const registry = await loadRegistry();
  const graph = plain(registry.normalizeAnalysisGraph({
    nodes: [
      { id: 'n1', type: 'marketStructure', execution: { state: 'completed' } }, // lying input
      { id: 'n2', type: 'sessionEntry', source: { type: 'sessionEntry', id: 'e1' } },
      { id: 'n3', type: 'note' }
    ]
  }));
  const byId = {}; graph.nodes.forEach((n) => { byId[n.id] = n; });
  assert.equal(byId.n1.execution.state, 'unavailable', 'no real processor exists yet - execution state can never be faked into completed/running');
  assert.equal(byId.n2.execution, null);
  assert.equal(byId.n3.execution, null);
});

test('a node of an unknown/future type is preserved, not dropped, and flagged unavailable', async () => {
  const registry = await loadRegistry();
  const graph = registry.normalizeAnalysisGraph({ nodes: [{ id: 'n2', type: 'orderFlowDelta', source: { type: 'x', id: 'y' } }] });
  assert.equal(graph.nodes.length, 1, 'an unrecognized node type must not be silently dropped (section 36)');
  assert.equal(graph.nodes[0].status, 'unavailable');
  assert.equal(graph.nodes[0].type, 'orderFlowDelta', 'the original type string is preserved for a future version that understands it');
});

test('a node missing its id is dropped (it can never be addressed/removed), everything else survives', async () => {
  const registry = await loadRegistry();
  const graph = registry.normalizeAnalysisGraph({ nodes: [{ type: 'sessionEntry' }, { id: 'ok', type: 'sessionEntry', source: { type: 'sessionEntry', id: 'e1' } }] });
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0].id, 'ok');
});

// ---------------------------------------------------------------------------
// Source resolution: section 19 - a pointer, never a cache; "unavailable", never a crash.
// ---------------------------------------------------------------------------

const SESSION = {
  id: 's1',
  entries: [
    { id: 'e1', type: 'chart', timeframe: '15m', scenarios: [{ id: 'sc1', title: 'Bearish thesis', status: 'active' }] },
    { id: 'e2', type: 'movement', movementNote: 'swept liquidity', scenarios: [] }
  ]
};

test('resolveNodeSource finds a real sessionEntry and sessionScenario', async () => {
  const registry = await loadRegistry();
  assert.equal(registry.resolveNodeSource({ type: 'sessionEntry', id: 'e1' }, SESSION).id, 'e1');
  assert.equal(registry.resolveNodeSource({ type: 'sessionScenario', id: 'sc1' }, SESSION).title, 'Bearish thesis');
});

test('resolveNodeSource returns null (never throws) for a deleted/unknown source', async () => {
  const registry = await loadRegistry();
  assert.equal(registry.resolveNodeSource({ type: 'sessionEntry', id: 'does-not-exist' }, SESSION), null);
  assert.equal(registry.resolveNodeSource({ type: 'sessionScenario', id: 'does-not-exist' }, SESSION), null);
  assert.equal(registry.resolveNodeSource(null, SESSION), null);
  assert.equal(registry.resolveNodeSource({ type: 'sessionEntry', id: 'e1' }, null), null);
});

test('findScenarioOwnerEntryId resolves the real owning entry, or null if the scenario is gone', async () => {
  const registry = await loadRegistry();
  assert.equal(registry.findScenarioOwnerEntryId('sc1', SESSION), 'e1');
  assert.equal(registry.findScenarioOwnerEntryId('does-not-exist', SESSION), null);
});

// ---------------------------------------------------------------------------
// Edges (section 8): the graph engine's connection model, added alongside the canvas.
// ---------------------------------------------------------------------------

test('a real edge round-trips through normalizeAnalysisGraph unchanged', async () => {
  const registry = await loadRegistry();
  const edge = { id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2', sourcePort: null, targetPort: null, relation: 'supports', createdAt: '2026-01-01T00:00:00.000Z' };
  const graph = plain(registry.normalizeAnalysisGraph({ edges: [edge] }));
  assert.equal(graph.edges.length, 1);
  assert.deepEqual(graph.edges[0], edge);
});

test('an edge missing an id or either endpoint is dropped; an unknown relation id is preserved verbatim, not rejected', async () => {
  const registry = await loadRegistry();
  const graph = plain(registry.normalizeAnalysisGraph({
    edges: [
      { sourceNodeId: 'n1', targetNodeId: 'n2' }, // no id
      { id: 'e2', sourceNodeId: 'n1' }, // no targetNodeId
      { id: 'e3', sourceNodeId: 'n1', targetNodeId: 'n2', relation: 'some_future_relation' }
    ]
  }));
  assert.equal(graph.edges.length, 1, 'only the structurally valid edge survives');
  assert.equal(graph.edges[0].id, 'e3');
  assert.equal(graph.edges[0].relation, 'some_future_relation', 'section 36: an unrecognized relation is preserved, never silently rewritten/dropped');
});

test('an edge with no relation defaults to "references", never a blank/undefined value', async () => {
  const registry = await loadRegistry();
  const graph = plain(registry.normalizeAnalysisGraph({ edges: [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' }] }));
  assert.equal(graph.edges[0].relation, 'references');
});

test('relationLabel returns a real, distinct label per language for every stable relation id, and falls back to the raw id for an unknown one', async () => {
  const registry = await loadRegistry();
  registry.RELATION_IDS.forEach((relationId) => {
    const labels = ['fa', 'ar', 'en', 'es'].map((lang) => registry.relationLabel(relationId, lang));
    labels.forEach((label) => assert.ok(label && label.length > 0, `${relationId} missing a label`));
    assert.equal(new Set(labels).size, labels.length, `${relationId}'s four language labels must be distinct translations, not copies`);
  });
  assert.equal(registry.relationLabel('totally_unknown_relation', 'en'), 'totally_unknown_relation');
});

// ---------------------------------------------------------------------------
// Node Definition Registry (section 10) + typed ports (section 7/16): every node type is real,
// consistently shaped, and port compatibility does real work - "do not allow arbitrary
// connections" is a testable, not just documented, guarantee.
// ---------------------------------------------------------------------------

test('every NODE_TYPES entry declares a real category, icon, i18n title in all 4 languages, ports, and capabilities', async () => {
  const registry = await loadRegistry();
  Object.keys(registry.NODE_TYPES).forEach((typeId) => {
    const def = registry.NODE_TYPES[typeId];
    assert.ok(registry.CATEGORIES[def.category], `${typeId} has an unknown category "${def.category}"`);
    assert.ok(def.icon, `${typeId} missing an icon`);
    ['fa', 'ar', 'en', 'es'].forEach((lang) => assert.ok(def.title[lang], `${typeId} missing a ${lang} title`));
    assert.ok(Array.isArray(def.ports.inputs) && Array.isArray(def.ports.outputs), `${typeId} missing ports.inputs/outputs`);
    assert.ok(def.capabilities && typeof def.capabilities.canCreateCanonicalEntity === 'boolean', `${typeId} missing capabilities.canCreateCanonicalEntity`);
  });
});

test('marketStructure/confluence stay honestly non-executable in V1 - section 6.2\'s "do not pretend a processor exists" rule; aiAnalysis is the ONE deliberate exception (AI Node pass) and is marked privacyGated:true since it is the one node type that can reach sensitive data under the explicit allowEmotion flow', async () => {
  const registry = await loadRegistry();
  registry.PROCESSING_TYPE_IDS.forEach((typeId) => {
    const def = registry.NODE_TYPES[typeId];
    assert.equal(def.origin, 'derived');
    if (typeId === 'aiAnalysis') {
      assert.equal(def.capabilities.executable, true, 'aiAnalysis must be executable now that a real AI node execution path exists');
      assert.equal(def.capabilities.privacyGated, true);
    } else {
      assert.equal(def.capabilities.executable, false, `${typeId} claims to be executable - no real processor exists yet`);
    }
  });
  assert.ok(registry.PROCESSING_TYPE_IDS.length >= 2, 'expected at least a couple of real processing node type definitions (section 6.2\'s extension seam)');
});

test('compatiblePortPair: a reference node can always connect to another reference/manual node via the universal port (ordinary reasoning edges)', async () => {
  const registry = await loadRegistry();
  assert.ok(registry.compatiblePortPair('sessionScenario', 'sessionEntry'));
  assert.ok(registry.compatiblePortPair('sessionEntry', 'trade'));
  assert.ok(registry.compatiblePortPair('note', 'sessionScenario'));
  assert.ok(registry.compatiblePortPair('sessionScenario', 'note'));
});

test('compatiblePortPair: a manual Note has no evidence/chart output, so it CANNOT feed a processing node\'s strict data input - the concrete "do not allow arbitrary connections" case', async () => {
  const registry = await loadRegistry();
  assert.equal(registry.compatiblePortPair('note', 'marketStructure'), null);
  assert.equal(registry.compatiblePortPair('note', 'confluence'), null);
  assert.equal(registry.compatiblePortPair('note', 'aiAnalysis'), null);
});

test('compatiblePortPair: a Session Entry (evidence+chart output) CAN feed Market Structure/Confluence/AI Analysis\'s typed inputs', async () => {
  const registry = await loadRegistry();
  assert.ok(registry.compatiblePortPair('sessionEntry', 'marketStructure'));
  assert.ok(registry.compatiblePortPair('sessionEntry', 'confluence'));
  assert.ok(registry.compatiblePortPair('sessionScenario', 'confluence'), 'a Scenario counts as evidence too');
  assert.ok(registry.compatiblePortPair('trade', 'aiAnalysis'));
  assert.ok(registry.compatiblePortPair('pattern', 'confluence'));
});

test('compatiblePortPair: a processing node\'s observation output CAN feed another processing node or point back at a reference/manual node (pipeline chaining)', async () => {
  const registry = await loadRegistry();
  assert.ok(registry.compatiblePortPair('marketStructure', 'confluence'), 'Structure -> Confluence, matching the brief\'s own pipeline diagram');
  assert.ok(registry.compatiblePortPair('confluence', 'aiAnalysis'));
  assert.ok(registry.compatiblePortPair('marketStructure', 'sessionScenario'), 'an observation can support/annotate a Scenario');
  assert.ok(registry.compatiblePortPair('aiAnalysis', 'note'), 'an AI observation can point at a Note');
});

test('compatiblePortPair returns null (never throws) for an unknown node type on either side', async () => {
  const registry = await loadRegistry();
  assert.equal(registry.compatiblePortPair('totally-unknown', 'note'), null);
  assert.equal(registry.compatiblePortPair('note', 'totally-unknown'), null);
});

test('defaultStageIdForType maps every real node type to one of the 8 default stage ids', async () => {
  const registry = await loadRegistry();
  const stageIds = registry.DEFAULT_STAGES.map((s) => s.id);
  Object.keys(registry.NODE_TYPES).forEach((typeId) => {
    assert.ok(stageIds.includes(registry.defaultStageIdForType(typeId, stageIds)), `${typeId}'s default stage is not a real stage id`);
  });
});

// ---------------------------------------------------------------------------
// Node Registry hardening (this pass): the full extension contract - capabilities.canOpenSource/
// canQuickEdit (the canonical-editing action contract), execute:null (the future execution-
// handler seam), display.title/status (render metadata canvas core reads instead of branching
// on node.type itself), and resolveNodePorts (the isolated Port Definition API).
// ---------------------------------------------------------------------------

test('every NODE_TYPES entry declares the full extension contract: capabilities.canOpenSource/canQuickEdit (booleans), execute (null in V1), and display.title/status (functions)', async () => {
  const registry = await loadRegistry();
  Object.keys(registry.NODE_TYPES).forEach((typeId) => {
    const def = registry.NODE_TYPES[typeId];
    assert.equal(typeof def.capabilities.canOpenSource, 'boolean', `${typeId} missing capabilities.canOpenSource`);
    assert.equal(typeof def.capabilities.canQuickEdit, 'boolean', `${typeId} missing capabilities.canQuickEdit`);
    assert.equal(def.execute, null, `${typeId}.execute must be null in V1 - no real execution engine exists yet`);
    assert.equal(typeof def.display.title, 'function', `${typeId} missing display.title()`);
    assert.equal(typeof def.display.status, 'function', `${typeId} missing display.status()`);
  });
});

test('capabilities audit results: Scenario/Entry/Trade can open a real existing editor; Pattern honestly cannot (no safe integration exists); Note/processing nodes quick-edit instead', async () => {
  const registry = await loadRegistry();
  assert.equal(registry.NODE_TYPES.sessionEntry.capabilities.canOpenSource, true);
  assert.equal(registry.NODE_TYPES.sessionScenario.capabilities.canOpenSource, true);
  assert.equal(registry.NODE_TYPES.sessionScenario.capabilities.canQuickEdit, true);
  assert.equal(registry.NODE_TYPES.trade.capabilities.canOpenSource, true, 'Trade has a real self-contained opener (tradeDetailsModal.jsx\'s openTradeDetails) - must not be read-only by default assumption');
  assert.equal(registry.NODE_TYPES.pattern.capabilities.canOpenSource, false, 'Pattern genuinely has no safe existing-editor integration (audited)');
  assert.equal(registry.NODE_TYPES.pattern.capabilities.canQuickEdit, false);
  assert.equal(registry.NODE_TYPES.note.capabilities.canQuickEdit, true, 'Note has no canonical form to jump to - inline editing is its only real editor');
  assert.equal(registry.NODE_TYPES.note.capabilities.canOpenSource, false);
  registry.PROCESSING_TYPE_IDS.forEach((typeId) => {
    assert.equal(registry.NODE_TYPES[typeId].capabilities.canQuickEdit, true, `${typeId} should offer config quick-edit`);
    assert.equal(registry.NODE_TYPES[typeId].capabilities.canOpenSource, false);
  });
});

test('display.title/status produce real, distinguishable output for every type given a plausible source record, and degrade honestly with no record', async () => {
  const registry = await loadRegistry();
  const cases = {
    sessionEntry: { type: 'chart', timeframe: '15m' },
    sessionScenario: { title: 'Bearish thesis', status: 'confirmed' },
    trade: { instrument: 'XAUUSD', direction: 'short', status: 'open' },
    pattern: { name: 'Wyckoff Spring' }
  };
  Object.keys(cases).forEach((typeId) => {
    const def = registry.NODE_TYPES[typeId];
    const node = { id: 'n1', type: typeId, title: 'fallback' };
    const title = def.display.title(cases[typeId], node, 'en', def);
    assert.ok(title && title.length > 0, `${typeId} display.title produced an empty title`);
  });
  // Processing nodes: title falls back to the registry's own localized type title.
  const marketStructureDef = registry.NODE_TYPES.marketStructure;
  assert.equal(marketStructureDef.display.title(null, { id: 'n1' }, 'en', marketStructureDef), 'Market Structure');
  assert.equal(marketStructureDef.display.status(null, { execution: { state: 'unavailable' } }), 'unavailable');
  // Note: title comes from its own content when present, the registry title otherwise.
  const noteDef = registry.NODE_TYPES.note;
  assert.equal(noteDef.display.title(null, { content: 'Liquidity sweep noted here' }, 'en', noteDef), 'Liquidity sweep noted here');
  assert.equal(noteDef.display.title(null, { content: '' }, 'en', noteDef), 'Note');
});

test('resolveNodePorts (the isolated Port Definition API) is the sole source compatiblePortPair reads from - every declared port also appears via this function', async () => {
  const registry = await loadRegistry();
  Object.keys(registry.NODE_TYPES).forEach((typeId) => {
    const ports = registry.resolveNodePorts(typeId);
    assert.deepEqual(plain(ports), plain(registry.NODE_TYPES[typeId].ports));
  });
  assert.deepEqual(plain(registry.resolveNodePorts('totally-unknown-type')), { inputs: [], outputs: [] });
});

test('the Group data foundation (section 7): normalizeGroup keeps only id/title/nodeIds/collapsed/position/size - never a copy of member node data - and is safe against malformed input', async () => {
  const registry = await loadRegistry();
  const group = { id: 'g1', title: 'London Liquidity Workflow', nodeIds: ['n1', 'n2'], collapsed: false, position: { x: 10, y: 20 }, size: { width: 300, height: 200 }, createdAt: '2026-01-01T00:00:00.000Z' };
  const graph = plain(registry.normalizeAnalysisGraph({ groups: [group] }));
  assert.equal(graph.groups.length, 1);
  assert.deepEqual(graph.groups[0], group);
  // Malformed input never throws, drops only the truly invalid entries.
  const graph2 = plain(registry.normalizeAnalysisGraph({ groups: [{ title: 'no id' }, { id: 'g2' }] }));
  assert.equal(graph2.groups.length, 1);
  assert.deepEqual(graph2.groups[0].nodeIds, []);
  assert.equal(graph2.groups[0].collapsed, false);
});

test('the Graph History foundation (section 6): a real command vocabulary that excludes any canonical-data-mutating command type, and createCommand() rejects unknown types', async () => {
  const registry = await loadRegistry();
  assert.deepEqual(plain(registry.COMMAND_TYPES).sort(), ['connect', 'create_node', 'disconnect', 'group', 'move_node', 'remove_node', 'stage_change', 'ungroup'].sort());
  const command = registry.createCommand('move_node', { nodeId: 'n1', position: { x: 5, y: 5 } });
  assert.equal(command.type, 'move_node');
  assert.deepEqual(plain(command.payload), { nodeId: 'n1', position: { x: 5, y: 5 } });
  assert.ok(command.at);
  assert.equal(registry.createCommand('delete_canonical_scenario', {}), null, 'an unknown/canonical command type must be rejected, not silently accepted');
});

test('the command vocabulary is actually wired into liveSessionView.jsx (not dead/unused code) - every graph-only mutator logs a real command via the ephemeral, capped, never-persisted graphHistoryRef', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  assert.match(liveSessionSrc, /const graphHistoryRef = React\.useRef\(\[\]\);/);
  assert.match(liveSessionSrc, /function logGraphCommand\(type, payload\)/);
  assert.match(liveSessionSrc, /graphHistoryRef\.current = graphHistoryRef\.current\.concat\(\[command\]\)\.slice\(-50\);/, 'history must be capped, not allowed to grow unboundedly for a long editing session');
  const expectedLogCalls = {
    'create_node': 3, // addGraphNode, addManualGraphNode, addProcessingGraphNode
    'remove_node': 1, 'move_node': 1, 'connect': 1, 'disconnect': 1, 'stage_change': 1, 'group': 1, 'ungroup': 1
  };
  Object.keys(expectedLogCalls).forEach((type) => {
    const occurrences = [...liveSessionSrc.matchAll(new RegExp("logGraphCommand\\('" + type + "'", 'g'))];
    assert.equal(occurrences.length, expectedLogCalls[type], `expected ${expectedLogCalls[type]} logGraphCommand('${type}', ...) call site(s), found ${occurrences.length}`);
  });
  // The history ref must never be written into session.analysisGraph or sent to persist() - it
  // is explicitly ephemeral groundwork, not a persisted undo stack yet.
  assert.doesNotMatch(liveSessionSrc, /analysisGraph\.history/);
  assert.doesNotMatch(liveSessionSrc, /s\.analysisGraph[\s\S]{0,40}graphHistoryRef/);
});

test('createGraphGroup/removeGraphGroup/toggleGraphGroupCollapsed (item 7\'s Group foundation) exist, persist through session.analysisGraph.groups, and a group never stores a copy of its member nodes\' data - only their ids', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const createMatch = /function createGraphGroup\(nodeIds, title\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(createMatch, 'could not find createGraphGroup()');
  assert.match(createMatch[0], /nodeIds: nodeIds\.slice\(\)/, 'must copy the id array, not the node objects themselves');
  assert.match(createMatch[0], /g\.groups = g\.groups\.concat\(\[group\]\);/);
  const removeMatch = /function removeGraphGroup\(groupId\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(removeMatch, 'could not find removeGraphGroup()');
  assert.match(removeMatch[0], /g\.groups = g\.groups\.filter\(\(group\) => group\.id !== groupId\);/);
  assert.match(liveSessionSrc, /function toggleGraphGroupCollapsed\(groupId\) \{/);
});

test('a real group round-trips through repo.memory.mjs alongside nodes/edges/stages, proving the item 7 foundation is genuinely end-to-end, not registry-only', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.instrumentCatalog.upsert(user.id, { id: 'instr-' + user.id, code: 'XAUUSD' });
  const group = { id: 'g1', title: 'London Liquidity Workflow', nodeIds: ['n1', 'n2'], collapsed: false, position: null, size: null, createdAt: '2026-01-01T00:00:00.000Z' };
  await repo.tradingSessions.upsert(user.id, {
    id: 's1', market: 'London', instrument: 'XAUUSD', timeframe: '15m', date: '2026-01-01', entries: [],
    analysisGraph: { version: 1, nodes: [], edges: [], groups: [group], stages: [], viewport: { x: 0, y: 0, zoom: 1 }, workflowMeta: {}, template: null, updatedAt: null }
  });
  const stored = await repo.tradingSessions.get(user.id, 's1');
  assert.deepEqual(stored.analysisGraph.groups, [group]);
});

// ---------------------------------------------------------------------------
// liveSessionView.jsx: canvas-driven node creation for canonical types must reuse the EXISTING
// creation pipeline (section 1's flagship requirement), never a second/parallel one. Source-text
// assertions, matching this file's established navrya-src/*.jsx convention (no JSX transform in
// this runner).
// ---------------------------------------------------------------------------

test('createScenarioFromMap reuses the real addScenario(entry) function - not a second scenario-creation path', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function createScenarioFromMap\(entryId, stageId\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(fnMatch, 'could not find createScenarioFromMap()');
  assert.match(fnMatch[0], /const scenario = addScenario\(entry\);/);
  assert.match(fnMatch[0], /addGraphNode\('sessionScenario', scenario\.id/);
  // And addScenario() itself must still be the one real function every non-Map path already uses
  // (still defined exactly once in the whole file).
  const addScenarioDefs = [...liveSessionSrc.matchAll(/function addScenario\(entry\)/g)];
  assert.equal(addScenarioDefs.length, 1, 'addScenario must be defined exactly once - a second definition would mean a duplicated creation path');
});

test('createEntryFromMap reuses the real addEntry()/ChartEntryModal pipeline - not a second entry-creation path', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function createEntryFromMap\(kind, stageId\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(fnMatch, 'could not find createEntryFromMap()');
  assert.match(fnMatch[0], /const entry = addEntry\('movement'\);/);
  assert.match(fnMatch[0], /setChartModalOpen\(true\)/);
  // submitChartEntry (the Desk's own ChartEntryModal onSubmit) must be the one place a chart
  // entry actually gets created either way, and only additively touched for the Map handoff.
  const submitChartEntryDefs = [...liveSessionSrc.matchAll(/async function submitChartEntry\(/g)];
  assert.equal(submitChartEntryDefs.length, 1);
  assert.match(liveSessionSrc, /graphPendingEntryStageRef\.current\)/, 'submitChartEntry must check the Map handoff ref after creating the entry');
});

test('createTradeFromMap reuses the real openLogWizard() pipeline with the same seed shape logTrade() uses - not a second trade-creation path', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function createTradeFromMap\(scenario, stageId\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(fnMatch, 'could not find createTradeFromMap()');
  assert.match(fnMatch[0], /openLogWizard\(\{/);
  assert.match(fnMatch[0], /source: \{ character, sessionId: session\.id, scenarioId: scenario\.id \}/);
  assert.match(fnMatch[0], /onSave: \(value\) => \{ addGraphNode\('trade', value\.id/);
});

test('createPatternReferenceFromMap only ever references an EXISTING pattern from the real Pattern Registry store - never creates one', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function createPatternReferenceFromMap\(patternId, stageId\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(fnMatch, 'could not find createPatternReferenceFromMap()');
  assert.match(fnMatch[0], /window\.TradeJournalPatternStore/);
  assert.match(fnMatch[0], /patternStore\.find\(patternId\)/);
  assert.doesNotMatch(fnMatch[0], /\.create\(/, 'must never call the Pattern Registry\'s create() - reference only');
});

test('addManualGraphNode/addProcessingGraphNode/updateGraphNodeStage/toggleGraphStageCollapsed exist and mutate only session.analysisGraph, never session.entries or any other canonical field', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  ['addManualGraphNode', 'addProcessingGraphNode', 'updateGraphNodeStage', 'toggleGraphStageCollapsed'].forEach((fnName) => {
    const fnMatch = new RegExp('function ' + fnName + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}').exec(liveSessionSrc);
    assert.ok(fnMatch, `could not find ${fnName}()`);
    assert.match(fnMatch[0], /s\.analysisGraph = g;/, `${fnName} must persist through session.analysisGraph`);
    assert.doesNotMatch(fnMatch[0], /s\.entries\s*=/, `${fnName} must never touch session.entries`);
  });
});

test('addGraphEdge validates port compatibility via registry.compatiblePortPair BEFORE creating an edge, and rejects (returns null) when no compatible pair exists', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function addGraphEdge\(sourceNodeId, targetNodeId, relation\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(fnMatch, 'could not find addGraphEdge()');
  assert.match(fnMatch[0], /registry\.compatiblePortPair\(sourceNode\.type, targetNode\.type\)/);
  assert.match(fnMatch[0], /if \(!pair\) return null;/);
  assert.match(fnMatch[0], /sourcePort: pair\.sourcePort, targetPort: pair\.targetPort/, 'the resolved port pair must actually be stored on the edge, not discarded');
});

test('the Inspector edits Scenario status through the real updateScenario() mutator (the same one the Desk\'s ScenarioEditor uses) - not a cloned form/second persistence path', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /actions\.onUpdateScenario\(entry, sourceRecord, \{ status: e\.target\.value \}\)/);
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  assert.match(liveSessionSrc, /onUpdateScenario=\{updateScenario\}/, 'liveSessionView.jsx must pass its own real updateScenario function, not a wrapper that duplicates it');
});

// ---------------------------------------------------------------------------
// Canonical editing action-registry / adapter pattern (this pass's item 3): Inspector must be
// generic over node type - no `node.type === '...'` branch inside Inspector() itself - with
// per-type behavior routed through QUICK_EDIT_ADAPTERS (a real key->component map) and the
// registry's own capabilities.canOpenSource/canQuickEdit flags.
// ---------------------------------------------------------------------------

test('Inspector() itself contains zero node.type equality branches - every per-type decision reads capabilities off the registry or looks up QUICK_EDIT_ADAPTERS[node.type]', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnStart = canvasSrc.indexOf('function Inspector(');
  assert.ok(fnStart > -1, 'could not find Inspector()');
  const fnEnd = canvasSrc.indexOf('function BulkInspector(', fnStart);
  assert.ok(fnEnd > -1, 'could not find the end of Inspector()');
  const body = canvasSrc.slice(fnStart, fnEnd);
  assert.doesNotMatch(body, /node\.type === '/, 'Inspector() must never branch on a specific node.type string directly');
  assert.match(body, /typeDef\.capabilities\.canOpenSource/);
  assert.match(body, /typeDef\.capabilities\.canQuickEdit/);
  assert.match(body, /QUICK_EDIT_ADAPTERS\[node\.type\]/);
});

test('QUICK_EDIT_ADAPTERS is a real type->component registry covering every canQuickEdit:true type, and each adapter is a distinct component (no accidental sharing beyond the intentional Processing one)', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /const QUICK_EDIT_ADAPTERS = \{/);
  assert.match(canvasSrc, /sessionScenario: ScenarioQuickEdit/);
  assert.match(canvasSrc, /note: NoteQuickEdit/);
  assert.match(canvasSrc, /marketStructure: ProcessingQuickEdit, confluence: ProcessingQuickEdit, aiAnalysis: ProcessingQuickEdit/);
  ['ScenarioQuickEdit', 'NoteQuickEdit', 'ProcessingQuickEdit'].forEach((name) => {
    assert.match(canvasSrc, new RegExp('function ' + name + '\\('), `${name} must be a real, defined component`);
  });
});

test('nodeDisplay() (canvas core) has zero per-type knowledge - it only calls typeDef.display.title/status, verified by the absence of any node.type/sourceRecord field-name branch inside it', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function nodeDisplay\(node, sourceRecord, lang, registry\) \{[\s\S]*?\n\}/.exec(canvasSrc);
  assert.ok(fnMatch, 'could not find nodeDisplay()');
  assert.doesNotMatch(fnMatch[0], /node\.type === '/, 'nodeDisplay() must not branch on a specific node.type');
  assert.doesNotMatch(fnMatch[0], /sourceRecord\.(title|status|instrument|direction|name|outcome)\b/, 'nodeDisplay() must not read a source record\'s own field names directly - that belongs to the type\'s own display.title/status functions');
  assert.match(fnMatch[0], /typeDef\.display\.title\(/);
  assert.match(fnMatch[0], /typeDef\.display\.status\(/);
});

test('Trade\'s "Open source" opens the real tradeDetailsModal.jsx via its self-contained openTradeDetails(), imported (not re-implemented) in liveSessionView.jsx', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  assert.match(liveSessionSrc, /import \{ openTradeDetails \} from '\.\/tradeDetailsModal\.jsx';/);
  const fnMatch = /const graphSourceOpeners = \{[\s\S]*?\n  \};/.exec(liveSessionSrc);
  assert.ok(fnMatch, 'could not find graphSourceOpeners');
  assert.match(fnMatch[0], /trade: \(sourceId\) => \{ openTradeDetails\(sourceId\); \}/);
  assert.match(fnMatch[0], /sessionEntry: \(sourceId\) =>/);
  assert.match(fnMatch[0], /sessionScenario: \(sourceId\) =>/);
});

test('updateGraphNodeContent/updateGraphNodeConfig (the Note/processing quick-edit mutators) exist, persist through session.analysisGraph, and are wired to the Inspector', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  ['updateGraphNodeContent', 'updateGraphNodeConfig'].forEach((fnName) => {
    const fnMatch = new RegExp('function ' + fnName + '\\(nodeId, (content|config)\\) \\{[\\s\\S]*?\\n  \\}').exec(liveSessionSrc);
    assert.ok(fnMatch, `could not find ${fnName}()`);
    assert.match(fnMatch[0], /s\.analysisGraph = g;/);
  });
  assert.match(liveSessionSrc, /onUpdateNoteContent=\{updateGraphNodeContent\}/);
  assert.match(liveSessionSrc, /onUpdateProcessingConfig=\{updateGraphNodeConfig\}/);
});

test('ConfigFieldsForm is shared verbatim between node creation (ProcessingForm) and post-creation editing (ProcessingQuickEdit) - one field-rendering implementation, not two', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const configFieldsFormDefs = [...canvasSrc.matchAll(/function ConfigFieldsForm\(/g)];
  assert.equal(configFieldsFormDefs.length, 1, 'ConfigFieldsForm must be defined exactly once');
  const usages = [...canvasSrc.matchAll(/<ConfigFieldsForm/g)];
  assert.equal(usages.length, 2, 'ConfigFieldsForm should be used by both ProcessingForm (create) and ProcessingQuickEdit (edit)');
});

test('the node-creation menu exposes click-to-add (toolbar), right-click context menu, and drag-from-picker, all routing through the same NodeCreationMenu', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /onClick=\{\(\) => setCreationMenu\(\{ mode: 'toolbar'/, 'toolbar click-to-add missing');
  assert.match(canvasSrc, /onContextMenu=\{onBackgroundContextMenu\}/, 'right-click context menu missing');
  assert.match(canvasSrc, /onBackgroundContextMenu[\s\S]{0,200}mode: 'context'/, 'context menu must open the creation menu');
  assert.match(canvasSrc, /draggable/, 'drag-from-picker items must be draggable');
  assert.match(canvasSrc, /onDragStart=\{\(e\) => e\.dataTransfer\.setData\('text\/analysis-graph-node-type', id\)\}/);
  assert.match(canvasSrc, /onDrop=\{onBackgroundDrop\}/, 'canvas background must accept the drop');
  assert.match(canvasSrc, /getData\('text\/analysis-graph-node-type'\)/, 'drop handler must read the dragged type back out');
});

// ---------------------------------------------------------------------------
// Item 8 (after hardening): minimap, multi-select, box selection, Focus Path, search/filter,
// deterministic auto-layout. Source-text assertions, matching this file's established
// navrya-src/*.jsx convention.
// ---------------------------------------------------------------------------

test('selection is Set-based (multi-select), not the old single {kind,id} shape - shift-click toggles node/edge membership, plain click replaces the selection', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /const \[selectedNodeIds, setSelectedNodeIds\] = React\.useState\(\(\) => new Set\(\)\);/);
  assert.match(canvasSrc, /const \[selectedEdgeIds, setSelectedEdgeIds\] = React\.useState\(\(\) => new Set\(\)\);/);
  assert.match(canvasSrc, /function toggleNodeSelected\(nodeId\)/);
  assert.match(canvasSrc, /if \(e\.shiftKey\) \{ toggleNodeSelected\(node\.id\); return; \}/, 'shift-click on a node must toggle, not replace, the selection');
  assert.doesNotMatch(canvasSrc, /\[selected, setSelected\]/, 'the old singular selection state must be fully removed, not left dangling alongside the new one');
});

test('box selection: Shift+drag on empty background starts a selection rectangle (not a pan), and pointerup adds every intersecting node to the existing selection', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function onBackgroundPointerDown\(e\) \{[\s\S]*?\n  \}/.exec(canvasSrc);
  assert.ok(fnMatch, 'could not find onBackgroundPointerDown');
  assert.match(fnMatch[0], /if \(e\.shiftKey\) \{/, 'shift must branch away from the plain-pan path');
  assert.match(fnMatch[0], /setBoxSelect\(/);
  const upMatch = /function onBackgroundPointerUp\(e\) \{[\s\S]*?\n  \}/.exec(canvasSrc);
  assert.ok(upMatch, 'could not find onBackgroundPointerUp');
  assert.match(upMatch[0], /visibleNodes\.filter\(/, 'box-select must test against real node positions');
  assert.match(upMatch[0], /setSelectedNodeIds\(\(prev\) => \{ const next = new Set\(prev\); hits\.forEach/, 'hits must be ADDED to the existing selection (shift semantics), never replace it');
});

test('Focus Path (section 40): the canvas delegates to registry.resolveFocusPathNodeIds() (AI Node pass refactor - single source of truth shared with the Graph AI Context Builder), and everything outside it is dimmed - both nodes and edges', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /const focusPath = React\.useMemo\(\(\) => \{[\s\S]*?\n  \}, \[selectedNode && selectedNode\.id, graph\.edges\]\);/.exec(canvasSrc);
  assert.ok(fnMatch, 'could not find the focusPath useMemo');
  assert.match(fnMatch[0], /registry\.resolveFocusPathNodeIds\(graph, selectedNode\.id\)/);
  assert.match(fnMatch[0], /new Set\(resolved\.nodeIds\)/);
  assert.match(fnMatch[0], /new Set\(resolved\.edgeIds\)/);
  assert.match(canvasSrc, /opacity=\{dimmed \? 0\.22 : 1\}/, 'edges outside the focus path/search match must be visually dimmed');
  assert.match(canvasSrc, /opacity: dimmed \? 0\.22 : \(unavailable \? 0\.55 : 1\)/, 'nodes outside the focus path/search match must be visually dimmed');
});

test('resolveFocusPathNodeIds (registry): computes the full connected component via bidirectional edge traversal - proves the actual traversal correctness now that the canvas only delegates to it', async () => {
  const registry = await loadRegistry();
  const graph = {
    edges: [
      { id: 'e1', sourceNodeId: 'a', targetNodeId: 'b' },
      { id: 'e2', sourceNodeId: 'c', targetNodeId: 'b' }, // reverse direction into b - must still be reached
      { id: 'e3', sourceNodeId: 'x', targetNodeId: 'y' }  // disconnected component - must NOT be reached
    ]
  };
  const result = plain(registry.resolveFocusPathNodeIds(graph, 'a'));
  assert.deepEqual(result.nodeIds.slice().sort(), ['a', 'b', 'c'].sort());
  assert.deepEqual(result.edgeIds.slice().sort(), ['e1', 'e2'].sort());
  assert.deepEqual(plain(registry.resolveFocusPathNodeIds(graph, null)), { nodeIds: [], edgeIds: [] });
  assert.deepEqual(plain(registry.resolveFocusPathNodeIds(null, 'a')), { nodeIds: [], edgeIds: [] });
});

test('search/filter (section 39): matches are highlighted via the SAME dim-others mechanism as Focus Path, never a hide-outright filter, and search takes precedence over an active Focus Path while typing', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /const searchMatchIds = React\.useMemo\(/);
  assert.match(canvasSrc, /const highlightNodeIds = searchMatchIds \|\| \(focusPath && focusPath\.nodeIds\) \|\| null;/);
  assert.doesNotMatch(canvasSrc, /visibleNodes\.filter\(\(node\) => .*searchMatchIds/, 'search must never remove non-matching nodes from the rendered set (that would be section 39\'s forbidden hide-outright behavior)');
});

test('deterministic auto-layout (section 8) is only ever invoked from an explicit button click, never automatically on a graph/selection change, and produces the same layout for the same graph every time (stage order x sorted node id, not creation-time-dependent)', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function autoLayout\(\) \{[\s\S]*?\n  \}/.exec(canvasSrc);
  assert.ok(fnMatch, 'could not find autoLayout()');
  assert.match(fnMatch[0], /graph\.stages\.forEach\(\(stage, rowIndex\)/);
  assert.match(fnMatch[0], /\.sort\(\(a, b\) => \(a\.id < b\.id \? -1 : 1\)\)/, 'column order must be a stable, deterministic sort (node id), not array/creation order');
  assert.match(canvasSrc, /onClick=\{autoLayout\}/);
  assert.doesNotMatch(canvasSrc, /React\.useEffect\([^)]*autoLayout/, 'autoLayout must never be wired into a useEffect (that would make it automatic, which section 8 explicitly forbids)');
});

test('REGRESSION (found via live browser verification): autoLayout() commits every node\'s new position through ONE onMoveNodes() call, never N separate onMoveNode() calls in a loop - N concurrent fire-and-forget upserts to the same session record raced in the real browser, and a stale response\'s reconciliation silently reverted the layout on the next page load', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function autoLayout\(\) \{[\s\S]*?\n  \}/.exec(canvasSrc);
  assert.ok(fnMatch, 'could not find autoLayout()');
  assert.doesNotMatch(fnMatch[0], /onMoveNode\(/, 'must never call the single-node mutator inside the layout loop');
  assert.match(fnMatch[0], /positions\[node\.id\] = \{/, 'must build one position map first');
  assert.match(fnMatch[0], /onMoveNodes\(positions\);/, 'must commit the whole map in exactly one call');

  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const mutatorMatch = /function updateGraphNodePositions\(positionsByNodeId\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(mutatorMatch, 'could not find updateGraphNodePositions()');
  assert.match(mutatorMatch[0], /persist\(\(s\) => \{/, 'must be exactly one persist() call...');
  const persistCalls = [...mutatorMatch[0].matchAll(/persist\(/g)];
  assert.equal(persistCalls.length, 1, '...never one persist() per node');
  assert.match(mutatorMatch[0], /g\.nodes\.forEach\(\(node\) => \{/, 'must update every affected node inside the SAME mutation');

  assert.match(liveSessionSrc, /onMoveNodes=\{updateGraphNodePositions\}/);
  assert.match(await readFile(src('analysisGraphView.jsx'), 'utf8'), /onMoveNodes=\{onMoveNodes\}/);
});

test('the minimap renders every visible node as a dot scaled into a fixed-size overview, shows the current viewport as a rectangle, and clicking it pans - it never mutates node positions', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function Minimap\(\{ nodes, positionOf, viewport, containerRef, onPan \}\) \{[\s\S]*?\n\}/.exec(canvasSrc);
  assert.ok(fnMatch, 'could not find Minimap()');
  assert.match(fnMatch[0], /nodes\.map\(\(node\) => \{/, 'must render one dot per visible node');
  assert.match(fnMatch[0], /onClick=\{onClick\}/);
  assert.doesNotMatch(fnMatch[0], /onMoveNode/, 'the minimap must only pan (onPan), never reposition a node');
  assert.match(canvasSrc, /<Minimap nodes=\{visibleNodes\}/, 'must be fed the same collapsed-stage-filtered node list the canvas itself renders');
});

test('bulk multi-select actions (BulkInspector) exist, only apply to what is actually selected, and reuse the real onRemoveNode/onRemoveEdge/onChangeNodeStage mutators - not a new bulk-specific persistence path', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /function BulkInspector\(/);
  assert.match(canvasSrc, /\{bulkSelection && \(/);
  assert.match(canvasSrc, /selectedNodeIds\.forEach\(\(id\) => onRemoveNode\(id\)\); selectedEdgeIds\.forEach\(\(id\) => onRemoveEdge\(id\)\); clearSelection\(\);/);
  assert.match(canvasSrc, /selectedNodeIds\.forEach\(\(id\) => onChangeNodeStage\(id, stageId\)\);/);
  assert.match(canvasSrc, /const bulkSelection = \(selectedNodeIds\.size \+ selectedEdgeIds\.size\) > 1;/);
});

test('stage collapse actually hides that stage\'s nodes (and any edge touching one) from the canvas, computed from graph.workflowMeta.collapsedStages', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /const collapsedStages = \(graph\.workflowMeta && graph\.workflowMeta\.collapsedStages\) \|\| \{\};/);
  assert.match(canvasSrc, /const visibleNodes = graph\.nodes\.filter\(\(n\) => !collapsedStages\[n\.stageId\]\);/);
  assert.match(canvasSrc, /const visibleEdges = graph\.edges\.filter\(\(e\) => visibleNodeIds\.has\(e\.sourceNodeId\) && visibleNodeIds\.has\(e\.targetNodeId\)\);/);
});

test('toggleGraphStageCollapsed stores collapse state as real persisted Map-only metadata (workflowMeta), not component-local-only state', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function toggleGraphStageCollapsed\(stageId\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(fnMatch, 'could not find toggleGraphStageCollapsed()');
  assert.match(fnMatch[0], /collapsedStages/);
  assert.match(fnMatch[0], /persist\(/, 'must go through the same persist() pipeline as every other graph mutation');
});

// ---------------------------------------------------------------------------
// Server round-trip: analysisGraph must survive a real repo.memory.mjs upsert/get cycle, and an
// old session (created before this field existed) must load without it.
// ---------------------------------------------------------------------------

test('analysisGraph round-trips through repo.memory.mjs tradingSessions.upsert/get', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.instrumentCatalog.upsert(user.id, { id: 'instr-' + user.id, code: 'XAUUSD' });
  const analysisGraph = { version: 1, nodes: [{ id: 'n1', type: 'sessionEntry', source: { type: 'sessionEntry', id: 'e1' }, status: 'active' }], edges: [], groups: [], stages: [], viewport: { x: 0, y: 0, zoom: 1 }, workflowMeta: {}, template: null, updatedAt: null };
  await repo.tradingSessions.upsert(user.id, {
    id: 's1', market: 'London', instrument: 'XAUUSD', timeframe: '15m', date: '2026-01-01',
    entries: [{ id: 'e1', type: 'chart' }], analysisGraph
  });
  const stored = await repo.tradingSessions.get(user.id, 's1');
  assert.deepEqual(stored.analysisGraph.nodes, analysisGraph.nodes);
});

test('a session saved with no analysisGraph at all stores/returns null (never fabricated), and a later normalize() default is a client-side concern', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.instrumentCatalog.upsert(user.id, { id: 'instr-' + user.id, code: 'XAUUSD' });
  await repo.tradingSessions.upsert(user.id, { id: 's2', market: 'London', instrument: 'XAUUSD', timeframe: '15m', date: '2026-01-01', entries: [] });
  const stored = await repo.tradingSessions.get(user.id, 's2');
  assert.equal(stored.analysisGraph, null);
});

// ---------------------------------------------------------------------------
// Migration/repo consistency guard - modeled directly on the real 039/045 incident class this
// codebase has already hit twice: a field wired into repo.memory.mjs (so tests pass) but never
// added to repo.pg.mjs's real INSERT column list/mapper, so it silently vanishes in production.
// ---------------------------------------------------------------------------

test('analysis_graph is wired into every required server-side layer (migration, repo.pg.mjs mapper+upsert, repo.memory.mjs)', async () => {
  const migrationFiles = await import('node:fs/promises').then((fs) => fs.readdir(path.join(root, 'server', 'db', 'migrations')));
  assert.ok(migrationFiles.some((f) => /analysis_graph/.test(f)), 'expected a 0NN_analysis_graph.sql migration file');

  const pgSrc = await readFile(path.join(root, 'server', 'db', 'repo.pg.mjs'), 'utf8');
  assert.match(pgSrc, /analysisGraph: row\.analysis_graph/, 'mapTradingSession() must map analysis_graph -> analysisGraph');
  assert.match(pgSrc, /,\s*analysis_graph,\s*updated_at\)/, 'the trading_sessions INSERT column list must include analysis_graph');
  assert.match(pgSrc, /analysis_graph=\$\d+/, 'the ON CONFLICT UPDATE SET clause must include analysis_graph');
  assert.match(pgSrc, /JSON\.stringify\(record\.analysisGraph/, 'the INSERT params must serialize record.analysisGraph');

  const memSrc = await readFile(path.join(root, 'server', 'db', 'repo.memory.mjs'), 'utf8');
  assert.match(memSrc, /analysisGraph: record\.analysisGraph/, 'repo.memory.mjs must carry analysisGraph through the same as repo.pg.mjs');
});

// ---------------------------------------------------------------------------
// Tab registration + i18n: the three hand-edited spots liveSessionView.jsx's own tab system
// requires (see that file's CommandBar array / copy{} blocks / render-switch chain).
// ---------------------------------------------------------------------------

test('the Analysis Map tab is registered in the CommandBar, the render switch, and all four languages', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  assert.match(liveSessionSrc, /\['graph', tr\(lang, 'viewGraph'\)\]/, 'the graph tab must be in the CommandBar tab array');
  assert.match(liveSessionSrc, /view === 'graph' \? \(/, 'the render-switch chain must have a graph branch');
  assert.match(liveSessionSrc, /<AnalysisGraphView/, 'the graph branch must render AnalysisGraphView');
  assert.match(liveSessionSrc, /import \{ AnalysisGraphView \} from '\.\/analysisGraphView\.jsx';/);

  ['fa', 'ar', 'en', 'es'].forEach(() => {}); // languages asserted individually below for a clearer failure message
  assert.match(liveSessionSrc, /viewGraph: 'نقشه تحلیل'/, 'fa viewGraph label missing/changed');
  assert.match(liveSessionSrc, /viewGraph: 'خريطة التحليل'/, 'ar viewGraph label missing/changed');
  assert.match(liveSessionSrc, /viewGraph: 'Analysis Map'/, 'en viewGraph label missing/changed');
  assert.match(liveSessionSrc, /viewGraph: 'Mapa de análisis'/, 'es viewGraph label missing/changed');
});

test('the graph tab id never reuses an existing view id (timeline/chart/report), which would silently collide', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const tabArrayMatch = /\[\['timeline'.*?\]\]\.map/s.exec(liveSessionSrc);
  assert.ok(tabArrayMatch, 'could not find the CommandBar tab array');
  const ids = [...tabArrayMatch[0].matchAll(/\['([a-z]+)',/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['timeline', 'graph', 'chart', 'report']);
  assert.equal(new Set(ids).size, ids.length, 'every view id must be unique');
});

test('AnalysisGraphView has its own local copy/tr() i18n pair covering all four languages (matches every sibling view file\'s convention)', async () => {
  const graphViewSrc = await readFile(src('analysisGraphView.jsx'), 'utf8');
  assert.match(graphViewSrc, /const copy = \{/);
  ['fa:', 'ar:', 'en:', 'es:'].forEach((lang) => assert.match(graphViewSrc, new RegExp(lang.replace(':', '\\s*:'))));
  assert.match(graphViewSrc, /function tr\(lang, key\)/);
});

// ---------------------------------------------------------------------------
// Canvas mode: analysisGraphView.jsx hosts a List/Canvas toggle and wires every graph mutator
// through to analysisGraphCanvas.jsx; liveSessionView.jsx defines the mutators themselves.
// ---------------------------------------------------------------------------

test('AnalysisGraphView imports and renders AnalysisGraphCanvas behind a List/Canvas mode toggle', async () => {
  const graphViewSrc = await readFile(src('analysisGraphView.jsx'), 'utf8');
  assert.match(graphViewSrc, /import \{ AnalysisGraphCanvas \} from '\.\/analysisGraphCanvas\.jsx';/);
  assert.match(graphViewSrc, /<AnalysisGraphCanvas/);
  assert.match(graphViewSrc, /\[\['list', tr\(lang, 'modeList'\)\], \['canvas', tr\(lang, 'modeCanvas'\)\]\]/);
});

test('liveSessionView.jsx defines and wires every graph canvas mutator (position, viewport, edges) through the same persist() pipeline as every other Desk mutation', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  ['updateGraphNodePosition', 'updateGraphViewport', 'addGraphEdge', 'removeGraphEdge'].forEach((fn) => {
    assert.match(liveSessionSrc, new RegExp('function ' + fn + '\\('), `${fn} is not defined`);
    assert.match(liveSessionSrc, new RegExp('persist\\('), `${fn}'s neighborhood should still use persist()`);
  });
  assert.match(liveSessionSrc, /onMoveNode=\{updateGraphNodePosition\}/);
  assert.match(liveSessionSrc, /onSetViewport=\{updateGraphViewport\}/);
  assert.match(liveSessionSrc, /onAddEdge=\{addGraphEdge\}/);
  assert.match(liveSessionSrc, /onRemoveEdge=\{removeGraphEdge\}/);
});

test('liveSessionView.jsx wires every node-creation and stage function through to AnalysisGraphView', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  [
    'onChangeNodeStage={updateGraphNodeStage}', 'onToggleStageCollapsed={toggleGraphStageCollapsed}',
    'onUpdateScenario={updateScenario}', 'onCreateScenario={createScenarioFromMap}',
    'onCreateEntry={createEntryFromMap}', 'onCreateTrade={createTradeFromMap}',
    'onCreatePatternRef={createPatternReferenceFromMap}', 'onCreateNote={addManualGraphNode}',
    'onCreateProcessing={addProcessingGraphNode}'
  ].forEach((propText) => assert.ok(liveSessionSrc.includes(propText), `missing prop wiring: ${propText}`));
});

test('analysisGraphView.jsx forwards every one of those props through to AnalysisGraphCanvas unchanged (no silent prop drop between the two)', async () => {
  const graphViewSrc = await readFile(src('analysisGraphView.jsx'), 'utf8');
  [
    'onChangeNodeStage', 'onToggleStageCollapsed', 'onUpdateScenario', 'onCreateScenario',
    'onCreateEntry', 'onCreateTrade', 'onCreatePatternRef', 'onCreateNote', 'onCreateProcessing'
  ].forEach((propName) => {
    // Must appear both in the destructured props AND passed down to <AnalysisGraphCanvas ...>.
    const occurrences = [...graphViewSrc.matchAll(new RegExp(propName, 'g'))];
    assert.ok(occurrences.length >= 2, `${propName} should appear at least twice (received + forwarded) in analysisGraphView.jsx`);
  });
});

test('removing a graph node also drops any edge touching it, so the graph never accumulates dangling edges from normal use', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function removeGraphNode\(nodeId\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(fnMatch, 'could not find removeGraphNode()');
  assert.match(fnMatch[0], /g\.edges = g\.edges\.filter\(\(e\) => e\.sourceNodeId !== nodeId && e\.targetNodeId !== nodeId\)/);
});

test('the canvas never persists on every pointer move - node-drag and pan/zoom only call the commit function once per drag/gesture', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  // The local, non-persisting position/viewport setters exist...
  assert.match(canvasSrc, /setDragPositions/);
  assert.match(canvasSrc, /function commitViewportLocal\(next\) \{ setViewport\(next\); \}/);
  // ...and within onNodePointerDown's own pair of pointermove/pointerup closures specifically,
  // onMoveNode (the persisting prop) is called from onUp only, never from onMove - sliced by
  // real function boundaries (indexOf/lastIndexOf), not just a global text count, since
  // onMoveNode(...) legitimately appears again elsewhere now (placeIfDropped(), the drag-and-
  // drop node-creation commit path - see the next test).
  const start = canvasSrc.indexOf('function onNodePointerDown(node, e) {');
  assert.ok(start > -1, 'could not find onNodePointerDown');
  const end = canvasSrc.indexOf('function nodeAtWorldPoint(', start);
  assert.ok(end > -1, 'could not find the end of onNodePointerDown');
  const fnBody = canvasSrc.slice(start, end);
  const onMoveBody = fnBody.slice(fnBody.indexOf('function onMove('), fnBody.indexOf('function onUp('));
  const onUpBody = fnBody.slice(fnBody.indexOf('function onUp('));
  assert.doesNotMatch(onMoveBody, /onMoveNode\(/, 'onMove (pointermove) must never call onMoveNode - only local setDragPositions');
  assert.match(onUpBody, /onMoveNode\(/, 'onUp (pointerup) must call onMoveNode exactly once to commit the final position');
});

test('a node created by dropping it from the creation picker is placed at the exact drop position via a single onMoveNode() follow-up, never a raw pointermove', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function placeIfDropped\(node\) \{[\s\S]*?\n  \}/.exec(canvasSrc);
  assert.ok(fnMatch, 'could not find placeIfDropped()');
  assert.match(fnMatch[0], /creationMenu\.mode === 'drop'/);
  assert.match(fnMatch[0], /onMoveNode\(node\.id, creationMenu\.worldPos\)/);
});

// ---------------------------------------------------------------------------
// session-workspace-logic.js: the legacy vanilla-JS normalize() must default analysisGraph the
// same defensive way it already defaults `instrument` (see that function's real source).
// ---------------------------------------------------------------------------

test('session-workspace-logic.js normalize() defaults session.analysisGraph via the registry', async () => {
  const workspaceLogicSrc = await readFile(shared('session-workspace-logic.js'), 'utf8');
  assert.match(workspaceLogicSrc, /window\.TradeJournalAnalysisGraphRegistry/);
  assert.match(workspaceLogicSrc, /session\.analysisGraph\s*=/);
});

test('every character page loads analysis-graph-registry.js as a script (window-global, same convention as analysis-focus-registry.js)', async () => {
  for (const character of ['hunter', 'commander', 'engineer', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    assert.match(html, /<script defer src="\.\.\/shared\/analysis-graph-registry\.js"><\/script>/, `${character}/index.html is missing the analysis-graph-registry.js script tag`);
  }
});

// ---------------------------------------------------------------------------
// ARCHITECTURE.md Phase 7 (Market Context): a real, honest Market Context data node reusing the
// exact same {market, timeframe, instrument} shape session-analysis-client.js already sends to
// AI, and a Market Context Workspace dock reusing the exact same real TradingView widget the
// Desk's own Market chart tab already renders - never a second definition of either.
// ---------------------------------------------------------------------------

test('marketContext is a real registered node type: reference origin, evidence category, singleton-safe ports, honest capabilities', async () => {
  const registry = await loadRegistry();
  const def = registry.NODE_TYPES.marketContext;
  assert.ok(def, 'marketContext must be registered in NODE_TYPES');
  assert.equal(def.origin, 'reference');
  assert.equal(def.category, 'evidence');
  assert.equal(def.creationMode, 'market-context');
  assert.equal(def.execute, null);
  // canOpenSource:true (real Market chart tab) but canQuickEdit:false (instrument/timeframe are
  // edited via the Session's own instrument chip, never a clone of that control here).
  assert.deepEqual(plain(def.capabilities), { canCreateCanonicalEntity: false, executable: false, privacyGated: false, canOpenSource: true, canQuickEdit: false });
  const outputTypes = plain(def.ports.outputs).map((p) => p.type).sort();
  assert.deepEqual(outputTypes, ['chart', 'marketContext', 'node'].sort());
  assert.equal(registry.defaultStageIdForType('marketContext', registry.DEFAULT_STAGES.map((s) => s.id)), 'evidence');
});

test('a Market Context node can feed Market Structure and AI Analysis (section 7\'s literal port list) but NOT Confluence (not listed there) or a manual Note (no marketContext input anywhere)', async () => {
  const registry = await loadRegistry();
  assert.ok(registry.compatiblePortPair('marketContext', 'marketStructure'), 'marketContext -> marketStructure must be a valid connection');
  assert.ok(registry.compatiblePortPair('marketContext', 'aiAnalysis'), 'marketContext -> aiAnalysis must be a valid connection');
  // Confluence has no UNIVERSAL_IN and no marketContext-typed input in its section-7 port list
  // (structure/liquidity/volume/otherEvidence only) - this is an intentional scope decision, not
  // a bug, and this test locks it in so it isn't silently "fixed" into something broader later.
  assert.equal(registry.compatiblePortPair('marketContext', 'confluence'), null);
  // A manual Note, however, DOES declare the universal 'node' port (every reference/manual type
  // does) so marketContext -> note is still a valid ordinary reasoning edge.
  assert.ok(registry.compatiblePortPair('marketContext', 'note'));
});

test('resolveNodeSource for marketContext returns the exact real {market, timeframe, instrument} the Session already carries - the same shape session-analysis-client.js already sends to AI, never a second/fabricated definition - and is never null while the Session exists', async () => {
  const registry = await loadRegistry();
  const session = { id: 's1', market: 'London', instrument: 'XAUUSD', timeframe: '15m' };
  const resolved = plain(registry.resolveNodeSource({ type: 'marketContext', id: session.id }, session));
  assert.deepEqual(resolved, { market: 'London', timeframe: '15m', instrument: 'XAUUSD' });
  // Missing fields degrade to null, never a fabricated placeholder value.
  const bare = plain(registry.resolveNodeSource({ type: 'marketContext', id: 's2' }, { id: 's2' }));
  assert.deepEqual(bare, { market: null, timeframe: null, instrument: null });
});

test('display.title for marketContext shows the real instrument/timeframe pair, never a placeholder/fabricated symbol', async () => {
  const registry = await loadRegistry();
  const def = registry.NODE_TYPES.marketContext;
  assert.equal(def.display.title({ instrument: 'BTCUSDT', timeframe: '1h' }, {}, 'en', def), 'BTCUSDT · 1h');
  assert.equal(def.display.title(null, {}, 'en', def), '');
});

test('createMarketContextFromMap reuses the real addGraphNode() dedup-by-source path - source.id is always session.id, so calling it twice re-selects the one existing node (section 51) rather than creating a duplicate, exactly like every other reference-node creator', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const fnMatch = /function createMarketContextFromMap\(stageId\) \{[\s\S]*?\n  \}/.exec(liveSessionSrc);
  assert.ok(fnMatch, 'could not find createMarketContextFromMap()');
  assert.match(fnMatch[0], /addGraphNode\('marketContext', session\.id/);
});

test('graphSourceOpeners.marketContext opens the real existing Market chart tab (setView(\'chart\')) - never a second/duplicate chart viewer', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const openersMatch = /const graphSourceOpeners = \{[\s\S]*?\n  \};/.exec(liveSessionSrc);
  assert.ok(openersMatch, 'could not find graphSourceOpeners');
  assert.match(openersMatch[0], /marketContext: \(\) => \{ setView\('chart'\); \}/);
});

test('TradingViewAdvancedChart/tradingViewSymbolFor/tradingViewIntervalFor are exported via a trailing `export {}` statement, not inline `export function`/`export const` - so every existing live-session-market-chart.test.mjs source-slice (including a raw new Function() eval of tradingViewSymbolFor) still matches the exact original declaration text', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  assert.match(liveSessionSrc, /export \{ tradingViewSymbolFor, tradingViewIntervalFor, TradingViewAdvancedChart \};/);
  assert.doesNotMatch(liveSessionSrc, /export function tradingViewSymbolFor/);
  assert.doesNotMatch(liveSessionSrc, /export function TradingViewAdvancedChart/);
});

test('LiveSessionView passes the real chart widget/symbol/interval resolvers and the Market Context creator down into AnalysisGraphView - never a second chart implementation', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  // Anchored on the actual render call, not the file's own earlier prose comment mentioning
  // "<AnalysisGraphView>" - the real call is the occurrence whose slice up to the next `/>`
  // actually contains onAddNode= (a prop that only exists on the real usage).
  const callStart = [...liveSessionSrc.matchAll(/<AnalysisGraphView/g)].map((m) => m.index).find((i) => liveSessionSrc.slice(i, liveSessionSrc.indexOf('/>', i)).includes('onAddNode='));
  assert.ok(callStart > -1, 'could not find the real <AnalysisGraphView> render call');
  const graphViewCall = liveSessionSrc.slice(callStart, liveSessionSrc.indexOf('/>', callStart));
  assert.match(graphViewCall, /onCreateMarketContext=\{createMarketContextFromMap\}/);
  assert.match(graphViewCall, /marketChartComponent=\{TradingViewAdvancedChart\}/);
  assert.match(graphViewCall, /resolveMarketSymbol=\{tradingViewSymbolFor\}/);
  assert.match(graphViewCall, /resolveMarketInterval=\{tradingViewIntervalFor\}/);
});

test('analysisGraphView.jsx forwards the Market Context props through to AnalysisGraphCanvas unchanged', async () => {
  const viewSrc = await readFile(src('analysisGraphView.jsx'), 'utf8');
  assert.match(viewSrc, /onCreateMarketContext, marketChartComponent, resolveMarketSymbol, resolveMarketInterval/);
  const canvasCall = viewSrc.slice(viewSrc.indexOf('<AnalysisGraphCanvas'), viewSrc.indexOf('/>', viewSrc.indexOf('<AnalysisGraphCanvas')));
  assert.match(canvasCall, /onCreateMarketContext=\{onCreateMarketContext\}/);
  assert.match(canvasCall, /marketChartComponent=\{marketChartComponent\}/);
});

test('the Market Context dock defaults to "off" (never automatically consumes canvas space - section 12), and NEVER passes `fill` to the reused chart widget (fill is the Desk\'s own true-fullscreen sizing; inside a non-fullscreen dock it would overflow/crop)', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /const \[marketMode, setMarketMode\] = React\.useState\('off'\);/);
  const dockMatch = /function MarketContextDock\(\{[\s\S]*?\n\}/.exec(canvasSrc);
  assert.ok(dockMatch, 'could not find MarketContextDock()');
  assert.match(dockMatch[0], /if \(mode === 'off'\) return null;/);
  assert.doesNotMatch(dockMatch[0], /fill=/, 'MarketContextDock must never pass a fill prop to the reused chart component');
  assert.match(dockMatch[0], /<ChartComponent symbol=\{symbol\} interval=\{interval\} lang=\{lang\} \/>/);
});

test('MarketContextDock never fabricates OHLC/price/volume data - only the real chart widget, symbol, and timeframe are ever rendered, alongside an explicit honest-unavailable note', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const dockMatch = /function MarketContextDock\(\{[\s\S]*?\n\}/.exec(canvasSrc);
  assert.match(dockMatch[0], /tr\(lang, 'honestNote'\)/);
  assert.doesNotMatch(canvasSrc, /\bOHLC\b\s*[:=]/, 'no OHLC field is ever assigned a value anywhere in the canvas - section 11/46\'s anti-fabrication rule');
  assert.doesNotMatch(canvasSrc, /\b(open|high|low|close|volume)\s*:\s*[\d.]/i, 'no hardcoded numeric price/volume literal anywhere in the canvas');
});

test('section 13 (node-driven Market Context): resolveContextInstrumentTimeframe follows a selected sessionEntry\'s own timeframe or a selected trade\'s own instrument/timeframe when present, and honestly falls back to the Session default for every other node (including no selection at all) - never a fabricated value', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function resolveContextInstrumentTimeframe\(node, session, registry\) \{[\s\S]*?\n\}/.exec(canvasSrc);
  assert.ok(fnMatch, 'could not find resolveContextInstrumentTimeframe()');
  assert.match(fnMatch[0], /entry && entry\.timeframe/);
  assert.match(fnMatch[0], /trade && trade\.instrument/);
  assert.match(fnMatch[0], /trade && trade\.primaryTimeframe/);
  // Evaluate it directly (plain function, no JSX) against a fake registry/session to prove the
  // real fallback behavior, not just that the right substrings exist.
  const fn = new Function(`${fnMatch[0]}\nreturn resolveContextInstrumentTimeframe;`)();
  const session = { instrument: 'XAUUSD', timeframe: '1h' };
  const registryStub = { resolveNodeSource: (source) => (source && source.id === 'entry-1' ? { timeframe: '5m' } : source && source.id === 'trade-1' ? { instrument: 'BTCUSDT', primaryTimeframe: '15m' } : null) };
  assert.deepEqual(fn(null, session, registryStub), { instrument: 'XAUUSD', timeframe: '1h' }, 'no selection -> session default');
  assert.deepEqual(fn({ type: 'sessionEntry', source: { id: 'entry-1' } }, session, registryStub), { instrument: 'XAUUSD', timeframe: '5m' }, 'a selected entry overrides only the timeframe, never the instrument');
  assert.deepEqual(fn({ type: 'trade', source: { id: 'trade-1' } }, session, registryStub), { instrument: 'BTCUSDT', timeframe: '15m' }, 'a selected trade with its own instrument/timeframe overrides both');
  assert.deepEqual(fn({ type: 'sessionScenario', source: { id: 'x' } }, session, registryStub), { instrument: 'XAUUSD', timeframe: '1h' }, 'every other node type falls back to the session default, never a guess');
});

test('REAL BUG FOUND VIA LIVE BROWSER VERIFICATION, FIXED: the canvas toolbar wrapped onto several lines when Focus mode narrowed the canvas to a nav strip - the delete-hint text is now hidden and the search box/switch-to-list button shrink in that mode', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /\{marketMode !== 'focus' && <span[\s\S]{0,80}tr\(lang, 'deleteHint'\)\}<\/span>\}/);
  assert.match(canvasSrc, /width: marketMode === 'focus' \? 90 : 150/);
  assert.match(canvasSrc, /\{marketMode === 'focus' \? <Icon name="List" size=\{14\} \/> : tr\(lang, 'switchToList'\)\}/);
});

test('the node-creation menu offers marketContext with a confirm step showing the real session instrument/timeframe (read-only, no invented fields) and wires it to onCreateMarketContext', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /typeId === 'marketContext' &&/);
  assert.match(canvasSrc, /onCreateMarketContext\(stageId\); onClose\(\);/);
  assert.match(canvasSrc, /\[session\.instrument, session\.timeframe\]\.filter\(Boolean\)\.join\(' · '\)/);
});

// ---------------------------------------------------------------------------
// Trader feedback (2026-09-12): chart thumbnails, canonical Scenario title/description editing
// from the canvas, canvas fullscreen, and a real registry-sourced educational Guide.
// ---------------------------------------------------------------------------

test('DISPLAY.sessionEntry declares imageEntryId (the one extension seam a chart thumbnail is resolved through) - it returns the real entry id, never an image URL itself, and every other type omits it', async () => {
  const registry = await loadRegistry();
  const def = registry.NODE_TYPES.sessionEntry;
  assert.equal(typeof def.display.imageEntryId, 'function');
  assert.equal(def.display.imageEntryId({ id: 'entry-1' }), 'entry-1');
  assert.equal(def.display.imageEntryId(null), null);
  ['sessionScenario', 'trade', 'pattern', 'note', 'marketContext'].forEach((typeId) => {
    assert.equal(registry.NODE_TYPES[typeId].display.imageEntryId, undefined, `${typeId} must not declare an imageEntryId - it has no image field`);
  });
});

test('the canvas node card resolves a chart thumbnail through the registry seam and the SAME imageUrls map the Desk\'s own EntryCard already uses - never a second image-loading path', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /typeDef && typeDef\.display\.imageEntryId \? typeDef\.display\.imageEntryId\(sourceRecord, node\) : null/);
  assert.match(canvasSrc, /imageEntryId && imageUrls \? imageUrls\[imageEntryId\] : null/);
  assert.match(canvasSrc, /<img src=\{thumbnailUrl\}/);
});

test('List mode\'s NodeRow renders the same real chart thumbnail via the same registry seam (no drift between List and Canvas on what a node shows)', async () => {
  const viewSrc = await readFile(src('analysisGraphView.jsx'), 'utf8');
  assert.match(viewSrc, /typeDef && typeDef\.display\.imageEntryId \? typeDef\.display\.imageEntryId\(sourceRecord, node\) : null/);
  assert.match(viewSrc, /<img src=\{thumbnailUrl\}/);
});

test('imageUrls is threaded from liveSessionView.jsx (the same state Desk EntryCards already resolve via window.TradeJournalImageStore) through AnalysisGraphView into AnalysisGraphCanvas, with no silent prop drop', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const callStart = [...liveSessionSrc.matchAll(/<AnalysisGraphView/g)].map((m) => m.index).find((i) => liveSessionSrc.slice(i, liveSessionSrc.indexOf('/>', i)).includes('onAddNode='));
  assert.ok(callStart > -1);
  assert.match(liveSessionSrc.slice(callStart, liveSessionSrc.indexOf('/>', callStart)), /imageUrls=\{imageUrls\}/);
  const viewSrc = await readFile(src('analysisGraphView.jsx'), 'utf8');
  assert.match(viewSrc, /onRunAiNode, onApplyAiSuggestion, onClearAiResult, imageUrls/);
  const canvasCall = viewSrc.slice(viewSrc.indexOf('<AnalysisGraphCanvas'), viewSrc.indexOf('/>', viewSrc.indexOf('<AnalysisGraphCanvas')));
  assert.match(canvasCall, /imageUrls=\{imageUrls\}/);
});

test('ScenarioQuickEdit now edits title and description too (trader feedback: previously only status could be changed from the canvas, so there was nothing for a canvas edit to sync to the Desk) - through the exact same real onUpdateScenario mutator the Desk\'s own ScenarioEditor and the status dropdown already use', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  const fnMatch = /function ScenarioQuickEdit\(\{[\s\S]*?\n\}/.exec(canvasSrc);
  assert.ok(fnMatch, 'could not find ScenarioQuickEdit()');
  assert.match(fnMatch[0], /actions\.onUpdateScenario\(entry, sourceRecord, \{ title, description \}\)/);
  assert.match(fnMatch[0], /actions\.onUpdateScenario\(entry, sourceRecord, \{ status: e\.target\.value \}\)/);
  // Buffered with local state (never persists on every keystroke - section 52's own performance
  // rule), matching NoteQuickEdit's own established convention.
  assert.match(fnMatch[0], /React\.useState\(sourceRecord \? sourceRecord\.title \|\| '' : ''\)/);
});

test('the canvas has a real fullscreen toggle using the standard Fullscreen API, mirroring liveSessionView.jsx\'s own MarketChartView pattern exactly (wrapRef + fullscreenchange listener) - never a second/different fullscreen mechanism', async () => {
  const canvasSrc = await readFile(src('analysisGraphCanvas.jsx'), 'utf8');
  assert.match(canvasSrc, /const wrapRef = React\.useRef\(null\);/);
  assert.match(canvasSrc, /const \[isFullscreen, setIsFullscreen\] = React\.useState\(false\);/);
  assert.match(canvasSrc, /document\.addEventListener\('fullscreenchange', onChange\);/);
  assert.match(canvasSrc, /if \(document\.fullscreenElement\) \{ document\.exitFullscreen\(\); return; \}/);
  assert.match(canvasSrc, /el\.requestFullscreen\(\)/);
  assert.match(canvasSrc, /<div ref=\{wrapRef\}/);
});

test('GuideModal (the new educational Guide) sources every node-type name/description from the real registry (registry.NODE_TYPES/CATEGORIES/DEFAULT_STAGES) - it never hardcodes a second, duplicated definition of what a node type is', async () => {
  const viewSrc = await readFile(src('analysisGraphView.jsx'), 'utf8');
  const fnMatch = /function GuideModal\(\{[\s\S]*?\n\}/.exec(viewSrc);
  assert.ok(fnMatch, 'could not find GuideModal()');
  assert.match(fnMatch[0], /registry\.NODE_TYPES/);
  assert.match(fnMatch[0], /registry\.CATEGORIES/);
  assert.match(fnMatch[0], /registry\.DEFAULT_STAGES/);
  assert.match(fnMatch[0], /def\.description\[lang\] \|\| def\.description\.en/);
  assert.match(fnMatch[0], /registry\.nodeTypeTitle\(typeId, lang\)/);
});

test('the Guide button is reachable regardless of List/Canvas mode, and all four languages declare the real Guide i18n keys', async () => {
  const viewSrc = await readFile(src('analysisGraphView.jsx'), 'utf8');
  assert.match(viewSrc, /const \[guideOpen, setGuideOpen\] = React\.useState\(false\);/);
  assert.match(viewSrc, /\{guideOpen && <GuideModal lang=\{lang\} rtl=\{rtl\} onClose=\{\(\) => setGuideOpen\(false\)\} \/>\}/);
  const keys = ['guideButton', 'guideTitle', 'guideIntro', 'guideNodeTypesTitle', 'guideStagesTitle'];
  ['fa:', 'ar:', 'en:', 'es:'].forEach((langTag) => {
    const idx = viewSrc.indexOf('\n  ' + langTag);
    assert.ok(idx > -1, `could not find the ${langTag} copy block`);
    const nextIdx = viewSrc.indexOf('\n  }', idx);
    const langBlock = viewSrc.slice(idx, nextIdx);
    keys.forEach((key) => assert.match(langBlock, new RegExp(key + ':'), `${langTag} copy block is missing ${key}`));
  });
});

test('STAGE_DESCRIPTIONS covers all 8 default stages in all 4 languages (the Guide must never show a blank description for a real stage)', async () => {
  const viewSrc = await readFile(src('analysisGraphView.jsx'), 'utf8');
  const fnMatch = /const STAGE_DESCRIPTIONS = \{[\s\S]*?\n\};/.exec(viewSrc);
  assert.ok(fnMatch, 'could not find STAGE_DESCRIPTIONS');
  ['preparation', 'evidence', 'observation', 'thesis', 'scenarios', 'risk', 'decision', 'outcome'].forEach((stageId) => {
    assert.match(fnMatch[0], new RegExp(stageId + ':'), `STAGE_DESCRIPTIONS is missing ${stageId}`);
  });
  ['fa:', 'ar:', 'en:', 'es:'].forEach((langTag) => {
    const occurrences = (fnMatch[0].match(new RegExp(langTag, 'g')) || []).length;
    assert.equal(occurrences, 8, `expected all 8 stages to declare a ${langTag} description`);
  });
});
