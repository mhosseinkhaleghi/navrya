/**
 * Analysis Graph Registry — data model + Node Definition Registry + relation/port catalog for the
 * "نقشه تحلیل" (Analysis Map) Session view, beside the Analysis Desk ("میز تحلیل" -
 * analysisWorkspaceBoard.js).
 *
 * NAME COLLISION NOTE (feat/analysis-map audit, 2026-09-11): this repo already has an unrelated,
 * shipped feature internally called "Analysis Map" - the AI chart-overlay image drawn by
 * visualizeAnalysis()/runVisualizeAiAnalysis() (session-analysis-client.js, liveSessionView.jsx),
 * stored at entry.aiAnalysisResult.wholeVisualization. That feature's trader-facing button says
 * "ترسیم کل تحلیل روی چارت" / "Draw full analysis on chart", never "Analysis Map", so there is no
 * UI-string collision - but the internal English name is taken, hence every identifier in this
 * file says "graph", not "map" (analysisGraph, not analysisMap), exactly the way the Analysis
 * Workspace tab kept the internal id `timeline` while its visible label became "میز تحلیل".
 *
 * NODE DATA MODEL: three origins (section 20).
 *  - 'reference' nodes (sessionEntry/sessionScenario/trade/pattern/marketContext) store ONLY
 *    {type, id} pointing at a real canonical record (marketContext's "record" is the Session
 *    itself - see resolveNodeSource()). resolveNodeSource() always re-reads the live record -
 *    a node can never drift out of sync with (or duplicate) canonical data. Canvas node CREATION
 *    for these routes through the real existing creation pipeline (liveSessionView.jsx's
 *    addScenario/addEntry/openLogWizard, or a picker over an already-existing record for
 *    pattern) - see that file's addGraphNode-family functions.
 *  - 'manual' nodes (note) carry their own `content` - never canonical data.
 *  - 'derived' nodes (processing: marketStructure/confluence/aiAnalysis) carry a `config` object
 *    and an `execution` state. V1 has NO real execution engine (ARCHITECTURE.md section 9/31/58 -
 *    explicitly a future phase) - these nodes are created with `execution.state:'unavailable'`
 *    and stay that way; they exist so the node/port/config seam is real and testable now, without
 *    fabricating results a real processor would produce.
 */
(function () {
  'use strict';

  var GRAPH_VERSION = 1;

  var NODE_ORIGINS = ['reference', 'derived', 'manual'];

  // Section 41 (forensic review): a node's lifecycle/review state.
  var NODE_STATUSES = ['active', 'confirmed', 'invalidated', 'rejected', 'expired', 'archived', 'unavailable'];

  // Section 9 (execution model). marketStructure/confluence stay 'unavailable' forever in V1 (no
  // processor implemented - section 6.2's "do not pretend a processor exists"). aiAnalysis is the
  // one type that now actually executes (this pass's AI Node phase) via
  // liveSessionView.jsx's runAiAnalysisNode() - 'idle' -> 'running' -> 'completed'/'failed'.
  // 'stale' is deliberately never STORED (see isAiNodeStale below) - it is a live, computed
  // display state, not a persisted one, so "stale" always reflects the CURRENT graph, never a
  // snapshot that itself could go stale.
  var EXECUTION_STATES = ['idle', 'ready', 'running', 'completed', 'warning', 'failed', 'stale', 'unavailable'];

  // Section 8's stable relation-id vocabulary (semantic edges - "Chart supports Thesis").
  var RELATION_IDS = [
    'supports', 'contradicts', 'derived_from', 'references', 'leads_to', 'triggered_by',
    'confirmed_by', 'invalidated_by', 'resulted_in', 'depends_on', 'compares_with', 'informs',
    'requires', 'produces'
  ];

  // Section 48's toolbar categories, trimmed to what V1 actually registers node types under.
  var CATEGORIES = {
    evidence: { id: 'evidence', title: { fa: 'شواهد', ar: 'الأدلة', en: 'Evidence', es: 'Evidencia' } },
    planning: { id: 'planning', title: { fa: 'برنامه‌ریزی', ar: 'التخطيط', en: 'Planning', es: 'Planificación' } },
    action: { id: 'action', title: { fa: 'اقدام', ar: 'الإجراء', en: 'Action', es: 'Acción' } },
    analysis: { id: 'analysis', title: { fa: 'تحلیل', ar: 'التحليل', en: 'Analysis', es: 'Análisis' } },
    utility: { id: 'utility', title: { fa: 'ابزار', ar: 'أدوات', en: 'Utility', es: 'Utilidad' } }
  };

  // Section 27's default 8-stage template. Stable English ids; localized names only. A Session
  // stores a SNAPSHOT of this (captured once, into graph.template/graph.stages, the first time a
  // graph is normalized for that session - see normalizeAnalysisGraph) so a later change to this
  // constant never silently reshuffles an existing Session's already-placed nodes (section 27's
  // "historical Sessions must not change when the user later modifies their template" rule).
  var STAGE_TEMPLATE_ID = 'default-v1';
  var DEFAULT_STAGES = [
    { id: 'preparation', order: 1, name: { fa: 'آمادگی و حالت ذهنی', ar: 'الاستعداد والحالة الذهنية', en: 'Mindset / Preparation', es: 'Mentalidad / preparación' } },
    { id: 'evidence', order: 2, name: { fa: 'شواهد بازار', ar: 'أدلة السوق', en: 'Market Evidence', es: 'Evidencia de mercado' } },
    { id: 'observation', order: 3, name: { fa: 'مشاهده و تحلیل', ar: 'الملاحظة والتحليل', en: 'Observation / Analysis', es: 'Observación / análisis' } },
    { id: 'thesis', order: 4, name: { fa: 'تز اصلی', ar: 'الأطروحة الرئيسية', en: 'Thesis', es: 'Tesis' } },
    { id: 'scenarios', order: 5, name: { fa: 'سناریوها', ar: 'السيناريوهات', en: 'Scenarios', es: 'Escenarios' } },
    { id: 'risk', order: 6, name: { fa: 'تریگر / ابطال / ریسک', ar: 'المحفز / الإبطال / المخاطرة', en: 'Trigger / Invalidation / Risk', es: 'Disparador / invalidación / riesgo' } },
    { id: 'decision', order: 7, name: { fa: 'تصمیم و اجرا', ar: 'القرار والتنفيذ', en: 'Decision / Execution', es: 'Decisión / ejecución' } },
    { id: 'outcome', order: 8, name: { fa: 'نتیجه و درس', ar: 'النتيجة والدرس', en: 'Outcome / Lesson', es: 'Resultado / lección' } }
  ];
  // Which stage a freshly created node of a given type lands in by default - the user can always
  // move it afterward via the Inspector's "Change Stage" action (section 18).
  var DEFAULT_STAGE_BY_TYPE = {
    sessionEntry: 'evidence', pattern: 'evidence', sessionScenario: 'scenarios', trade: 'decision',
    note: 'observation', marketStructure: 'observation', confluence: 'observation', aiAnalysis: 'observation',
    marketContext: 'evidence'
  };

  // Port "types" are plain strings matched for exact equality (compatiblePortPair below) - no
  // subtyping/inheritance, deliberately simple for V1:
  //  'node'        - the universal semantic-graph port every reference/manual node exposes, so
  //                  ordinary reasoning edges (Chart supports Thesis, Scenario leads_to Decision)
  //                  are always possible between any two everyday nodes.
  //  'evidence'    - what a canonical reference node (entry/scenario/trade/pattern) offers a real
  //                  processing node as raw input. A manual Note deliberately has NO evidenceOut -
  //                  see the test asserting Note -> Market Structure is rejected.
  //  'chart'       - narrower than 'evidence': only a Session Entry offers this (any entry type,
  //                  V1 does not distinguish chart/movement/fate at the port level - documented
  //                  simplification below).
  //  'observation' - what a processing node produces, and what every node (reference/manual/
  //                  processing) can receive - lets an upstream processor's result point at/
  //                  support a downstream Scenario, another processor, or a Note.
  //  'marketContext' - section 7/12: the bundled {instrument, timeframe, market} output of the
  //                  Market Context node (below). Only Market Structure and AI Analysis declare a
  //                  matching input, per section 7's literal port list for those two types -
  //                  Confluence's own section-7 input list (structure/liquidity/volume/
  //                  otherEvidence) does not include marketContext, so it stays unchanged.
  function ports(inputs, outputs) { return { inputs: inputs || [], outputs: outputs || [] }; }
  var UNIVERSAL_OUT = { id: 'out', type: 'node' };
  var UNIVERSAL_IN = { id: 'in', type: 'node' };
  var OBSERVATION_IN = { id: 'observationIn', type: 'observation' };

  // Pure, dependency-free display-string helpers, one per shape of underlying data - shared
  // across node types whose source records look alike, so NODE_TYPES entries below stay short.
  // These are the "render metadata" half of section 10's contract: analysisGraphCanvas.jsx calls
  // typeDef.display.title()/status() and never inspects a source record's own field names
  // itself - it has NO per-type knowledge at all (verified by
  // tests/analysis-graph.test.mjs's "canvas core never branches on node.type" test).
  function fallbackTitle(sourceRecord, node, lang, typeDef) { return (typeDef.title[lang] || typeDef.title.en); }
  var DISPLAY = {
    sessionEntry: {
      title: function (sourceRecord) { return (sourceRecord.type || '') + (sourceRecord.timeframe ? ' · ' + sourceRecord.timeframe : ''); },
      status: function () { return null; }
    },
    sessionScenario: {
      title: function (sourceRecord, node) { return sourceRecord.title || node.title; },
      status: function (sourceRecord) { return sourceRecord.status || 'active'; }
    },
    trade: {
      title: function (sourceRecord, node) { return [sourceRecord.instrument, sourceRecord.direction].filter(Boolean).join(' · ') || node.title; },
      status: function (sourceRecord) { return sourceRecord.status || sourceRecord.outcome || null; }
    },
    pattern: {
      title: function (sourceRecord, node) { return sourceRecord.name || node.title; },
      status: function () { return null; }
    },
    note: {
      title: function (sourceRecord, node, lang, typeDef) { return node.content ? node.content.slice(0, 60) : fallbackTitle(sourceRecord, node, lang, typeDef); },
      status: function () { return null; }
    },
    processing: { // shared by every 'derived' type below - registered per-id further down
      title: fallbackTitle,
      status: function (sourceRecord, node) { return node.execution ? node.execution.state : null; }
    },
    // Section 12: title is the real (instrument, timeframe) pair the trader's Session actually
    // has - never a fabricated symbol/price (section 11/46's "do not fabricate market data").
    marketContext: {
      title: function (sourceRecord) {
        if (!sourceRecord) return '';
        return [sourceRecord.instrument, sourceRecord.timeframe].filter(Boolean).join(' · ');
      },
      status: function () { return null; }
    }
  };

  // Section 10's Node Definition Registry. Canvas core (analysisGraphCanvas.jsx) never branches
  // on `node.type` for anything this object already declares - icon/title/ports/category/
  // config/capabilities/display all come from here (ARCHITECTURE.md §10's "Canvas should not
  // know how to create a Trade" rule). Adding a future node type means adding one entry here.
  //
  // capabilities.canOpenSource / canQuickEdit are the Inspector's action contract (section
  // "canonical editing audit"): canOpenSource means a REAL existing editor can be opened (either
  // an in-Desk jump, or - like Trade's openTradeDetails() - a self-contained imperative opener
  // that mounts its own root, exactly like this Map's own openLogWizard() reuse); canQuickEdit
  // means the Inspector offers a real inline field editor, registered in
  // analysisGraphCanvas.jsx's QUICK_EDIT_ADAPTERS map (keyed by type id, never an if/type===
  // chain - see that file). Both false is a deliberate, audited "no safe integration exists yet"
  // (Pattern: its only editor, PatternDetailsTab, lives inside strategiesHubView.jsx's own tab
  // state, not a self-contained opener - wrapping it in one would be building a new editor, not
  // reusing one, so it stays read-only honestly rather than being force-fit).
  var NODE_TYPES = {
    sessionEntry: {
      id: 'sessionEntry', version: 1, category: 'evidence', icon: 'Image', origin: 'reference',
      title: { fa: 'ورودی سشن', ar: 'إدخال الجلسة', en: 'Session Entry', es: 'Entrada de sesión' },
      description: { fa: 'چارت، حرکت یا سرنوشت واقعی این سشن', ar: 'مخطط أو حركة أو مصير حقيقي لهذه الجلسة', en: 'A real chart, movement or fate entry from this session', es: 'Una entrada real de gráfico, movimiento o destino de esta sesión' },
      // Simplification (documented, not a bug): ports are declared once per TYPE, not per
      // instance - every sessionEntry gets a chartOut port regardless of whether the underlying
      // entry is chart/movement/fate. A movement/fate entry dragged onto a chart-only processor
      // is a loose match, not a semantic guarantee; still meaningfully tighter than Note (below),
      // which has no evidenceOut/chartOut at all.
      ports: ports([UNIVERSAL_IN, OBSERVATION_IN], [UNIVERSAL_OUT, { id: 'evidenceOut', type: 'evidence' }, { id: 'chartOut', type: 'chart' }]),
      capabilities: { canCreateCanonicalEntity: true, executable: false, privacyGated: false, canOpenSource: true, canQuickEdit: false },
      creationMode: 'canonical-entry', configSchema: null, execute: null, display: DISPLAY.sessionEntry
    },
    sessionScenario: {
      id: 'sessionScenario', version: 1, category: 'planning', icon: 'GitBranch', origin: 'reference',
      title: { fa: 'سناریو', ar: 'سيناريو', en: 'Scenario', es: 'Escenario' },
      description: { fa: 'سناریوی واقعی این سشن', ar: 'سيناريو حقيقي لهذه الجلسة', en: 'A real Scenario from this session', es: 'Un escenario real de esta sesión' },
      ports: ports([UNIVERSAL_IN, OBSERVATION_IN], [UNIVERSAL_OUT, { id: 'evidenceOut', type: 'evidence' }]),
      capabilities: { canCreateCanonicalEntity: true, executable: false, privacyGated: false, canOpenSource: true, canQuickEdit: true },
      creationMode: 'canonical-scenario', configSchema: null, execute: null, display: DISPLAY.sessionScenario
    },
    trade: {
      id: 'trade', version: 1, category: 'action', icon: 'ArrowUpDown', origin: 'reference',
      title: { fa: 'معامله', ar: 'صفقة', en: 'Trade', es: 'Operación' },
      description: { fa: 'معامله واقعی ثبت‌شده', ar: 'صفقة حقيقية مسجّلة', en: 'A real, logged Trade', es: 'Una operación real registrada' },
      ports: ports([UNIVERSAL_IN, OBSERVATION_IN], [UNIVERSAL_OUT, { id: 'evidenceOut', type: 'evidence' }]),
      // canOpenSource:true - navrya-src/tradeDetailsModal.jsx exports a self-contained
      // openTradeDetails(id) (mounts its own root, already reused across character-app.jsx) -
      // the real Trade editor, not a clone.
      capabilities: { canCreateCanonicalEntity: true, executable: false, privacyGated: false, canOpenSource: true, canQuickEdit: false },
      creationMode: 'canonical-trade', configSchema: null, execute: null, display: DISPLAY.trade
    },
    pattern: {
      id: 'pattern', version: 1, category: 'evidence', icon: 'Fingerprint', origin: 'reference',
      title: { fa: 'الگو', ar: 'نمط', en: 'Pattern', es: 'Patrón' },
      description: { fa: 'الگوی موجود از رجیستری الگوها', ar: 'نمط موجود من سجل الأنماط', en: 'An existing Pattern from the Pattern Registry', es: 'Un patrón existente del registro de patrones' },
      ports: ports([UNIVERSAL_IN, OBSERVATION_IN], [UNIVERSAL_OUT, { id: 'evidenceOut', type: 'evidence' }]),
      // Referenced only - Patterns are managed in the Strategies Hub's Pattern Registry, never
      // created inline from the Map. canOpenSource:false is audited, not lazy: see this file's
      // header comment above NODE_TYPES for why Pattern has no safe existing-editor integration.
      capabilities: { canCreateCanonicalEntity: false, executable: false, privacyGated: false, canOpenSource: false, canQuickEdit: false },
      creationMode: 'canonical-picker', configSchema: null, execute: null, display: DISPLAY.pattern
    },
    note: {
      id: 'note', version: 1, category: 'utility', icon: 'StickyNote', origin: 'manual',
      title: { fa: 'یادداشت', ar: 'ملاحظة', en: 'Note', es: 'Nota' },
      description: { fa: 'یادداشت آزاد، بدون داده کانونیکال', ar: 'ملاحظة حرة، دون بيانات أساسية', en: 'A free-form note, no canonical data', es: 'Una nota libre, sin datos canónicos' },
      // No evidenceOut/chartOut on purpose - see the file header and the port-type comment above:
      // this is the concrete case "do not allow arbitrary connections" actually blocks.
      ports: ports([UNIVERSAL_IN, OBSERVATION_IN], [UNIVERSAL_OUT]),
      // canQuickEdit:true - a Note has no canonical form to jump to; the Map itself is the only
      // place its content lives, so inline Inspector editing is the real (only) editor, not a
      // clone of anything.
      capabilities: { canCreateCanonicalEntity: false, executable: false, privacyGated: false, canOpenSource: false, canQuickEdit: true },
      creationMode: 'manual', configSchema: null, execute: null, display: DISPLAY.note
    },
    marketContext: {
      id: 'marketContext', version: 1, category: 'evidence', icon: 'CandlestickChart', origin: 'reference',
      title: { fa: 'بافت بازار', ar: 'سياق السوق', en: 'Market Context', es: 'Contexto de mercado' },
      description: {
        fa: 'نماد/تایم‌فریم واقعی این سشن (بافت بازار)', ar: 'رمز/إطار زمني حقيقي لهذه الجلسة (سياق السوق)',
        en: 'This session’s real instrument/timeframe (market context)', es: 'El instrumento/marco temporal real de esta sesión (contexto de mercado)'
      },
      // Section 6.1/11: a singleton data node - source is always the Session itself (id ===
      // session.id, never a second sub-record), so addGraphNode()'s existing dup-by-source check
      // (liveSessionView.jsx) already gives this "one Market Context node per graph, re-select
      // the existing one rather than duplicate" for free - see section 51.
      ports: ports([UNIVERSAL_IN, OBSERVATION_IN], [UNIVERSAL_OUT, { id: 'marketContextOut', type: 'marketContext' }, { id: 'chartOut', type: 'chart' }]),
      // canOpenSource:true - "Open source" switches the Live Session to the real existing Market
      // chart tab (MarketChartView/TradingViewAdvancedChart in liveSessionView.jsx), never a
      // second chart viewer. canQuickEdit:false - the instrument/timeframe this node reflects are
      // edited via the Session's own command-bar instrument chip / timeframe control, not here.
      capabilities: { canCreateCanonicalEntity: false, executable: false, privacyGated: false, canOpenSource: true, canQuickEdit: false },
      creationMode: 'market-context', configSchema: null, execute: null, display: DISPLAY.marketContext
    },
    marketStructure: {
      id: 'marketStructure', version: 1, category: 'analysis', icon: 'Layers', origin: 'derived',
      title: { fa: 'ساختار بازار', ar: 'هيكل السوق', en: 'Market Structure', es: 'Estructura de mercado' },
      description: { fa: 'پردازشگر تحلیل ساختار (هنوز اجرا نمی‌شود)', ar: 'معالج تحليل الهيكل (لا يعمل بعد)', en: 'Structure-analysis processor (not executable yet)', es: 'Procesador de análisis de estructura (aún no ejecutable)' },
      // Section 7's literal port list for Market Structure: "inputs: chart, timeframe,
      // marketContext" (timeframe is covered by configSchema below, not a separate port).
      ports: ports([{ id: 'chartIn', type: 'chart' }, { id: 'evidenceIn', type: 'evidence' }, { id: 'marketContextIn', type: 'marketContext' }, OBSERVATION_IN], [{ id: 'structureOut', type: 'observation' }]),
      // execute:null - section 6.2/31: the seam a real future execution engine fills in per
      // processing type (e.g. execute: async (inputs, config) => {...}); capabilities.executable
      // stays false until a real one is registered here, so execution.state can never honestly
      // become anything but 'unavailable' (see normalizeNode) no matter what a future UI wires up.
      capabilities: { canCreateCanonicalEntity: false, executable: false, privacyGated: false, canOpenSource: false, canQuickEdit: true },
      creationMode: 'processing', execute: null, display: DISPLAY.processing,
      configSchema: { fields: [{ key: 'timeframe', type: 'select', options: ['1m', '5m', '15m', '1h', '4h', '1D'], label: { fa: 'تایم‌فریم', ar: 'الإطار الزمني', en: 'Timeframe', es: 'Marco temporal' } }] }
    },
    confluence: {
      id: 'confluence', version: 1, category: 'analysis', icon: 'Combine', origin: 'derived',
      title: { fa: 'همگرایی', ar: 'التقارب', en: 'Confluence', es: 'Confluencia' },
      description: { fa: 'ترکیب چند شاهد/مشاهده (هنوز اجرا نمی‌شود)', ar: 'دمج عدة أدلة/ملاحظات (لا يعمل بعد)', en: 'Combines multiple evidence/observations (not executable yet)', es: 'Combina varias evidencias/observaciones (aún no ejecutable)' },
      ports: ports([{ id: 'evidenceIn', type: 'evidence', multiple: true }, { id: 'observationIn2', type: 'observation', multiple: true }], [{ id: 'confluenceOut', type: 'observation' }]),
      capabilities: { canCreateCanonicalEntity: false, executable: false, privacyGated: false, canOpenSource: false, canQuickEdit: true },
      creationMode: 'processing', configSchema: { fields: [] }, execute: null, display: DISPLAY.processing
    },
    aiAnalysis: {
      id: 'aiAnalysis', version: 1, category: 'analysis', icon: 'Sparkles', origin: 'derived',
      title: { fa: 'تحلیل هوش مصنوعی', ar: 'تحليل الذكاء الاصطناعي', en: 'AI Analysis', es: 'Análisis de IA' },
      description: { fa: 'گره پردازش هوش مصنوعی (بخش ۱۰ - هنوز اجرا نمی‌شود)', ar: 'عقدة معالجة الذكاء الاصطناعي (القسم ١٠ - لا تعمل بعد)', en: 'AI processing node (section 10 - not executable yet)', es: 'Nodo de procesamiento de IA (sección 10 - aún no ejecutable)' },
      // Section 7's literal port list for AI Analysis includes marketContext directly.
      ports: ports([{ id: 'evidenceIn', type: 'evidence', multiple: true }, { id: 'observationIn2', type: 'observation', multiple: true }, { id: 'marketContextIn', type: 'marketContext' }], [{ id: 'aiOut', type: 'observation' }]),
      // AI Node phase (this pass): the ONE processing type that actually executes now, via
      // liveSessionView.jsx's runAiAnalysisNode() -> analysis-graph-ai-client.js ->
      // server/pattern-ai-server.mjs's graphAiAnalysis() -> the real, existing callProvider()
      // gateway. marketStructure/confluence stay executable:false (honestly no processor exists
      // for those yet) - this flip is deliberately scoped to aiAnalysis alone.
      capabilities: { canCreateCanonicalEntity: false, executable: true, privacyGated: true, canOpenSource: false, canQuickEdit: true },
      creationMode: 'processing', execute: null, display: DISPLAY.processing,
      configSchema: { fields: [{ key: 'focus', type: 'text', label: { fa: 'تمرکز', ar: 'التركيز', en: 'Focus', es: 'Enfoque' } }] }
    }
  };
  var PROCESSING_TYPE_IDS = Object.keys(NODE_TYPES).filter(function (id) { return NODE_TYPES[id].origin === 'derived'; });

  function nowIso() { return new Date().toISOString(); }

  function emptyGraph() {
    return {
      version: GRAPH_VERSION, template: { templateId: STAGE_TEMPLATE_ID, snapshot: DEFAULT_STAGES },
      viewport: { x: 0, y: 0, zoom: 1 },
      stages: DEFAULT_STAGES, nodes: [], edges: [], groups: [], workflowMeta: {}, updatedAt: null
    };
  }

  // Section 36 (migration/backward compatibility): never throw, never crash on missing/malformed
  // data. Section 27: a Session stores a SNAPSHOT of the stage template it used, captured the
  // first time this runs for that session (raw.template missing) and preserved verbatim on every
  // later normalize even if DEFAULT_STAGES is edited in a future release - existing Sessions'
  // stage lanes never silently reshuffle.
  function normalizeAnalysisGraph(raw) {
    if (!raw || typeof raw !== 'object') return emptyGraph();
    var template = (raw.template && raw.template.templateId && Array.isArray(raw.template.snapshot))
      ? raw.template : { templateId: STAGE_TEMPLATE_ID, snapshot: DEFAULT_STAGES };
    var stages = Array.isArray(raw.stages) && raw.stages.length ? raw.stages : template.snapshot;
    var stageIds = stages.map(function (s) { return s.id; });
    var nodes = Array.isArray(raw.nodes) ? raw.nodes.map(function (n) { return normalizeNode(n, stageIds); }).filter(Boolean) : [];
    var edges = Array.isArray(raw.edges) ? raw.edges.map(normalizeEdge).filter(Boolean) : [];
    var groups = Array.isArray(raw.groups) ? raw.groups.map(normalizeGroup).filter(Boolean) : [];
    return {
      version: Number(raw.version) || GRAPH_VERSION,
      template: template,
      viewport: (raw.viewport && typeof raw.viewport === 'object')
        ? { x: Number(raw.viewport.x) || 0, y: Number(raw.viewport.y) || 0, zoom: Number(raw.viewport.zoom) || 1 }
        : { x: 0, y: 0, zoom: 1 },
      stages: stages,
      nodes: nodes,
      edges: edges,
      groups: groups,
      workflowMeta: (raw.workflowMeta && typeof raw.workflowMeta === 'object') ? raw.workflowMeta : {},
      updatedAt: raw.updatedAt || null
    };
  }

  // Section 29's Group data foundation (this pass's "group model foundation" - UI comes later,
  // never a generic whiteboard group/shape system, just node-id membership + a title + collapse
  // state, matching section 29's own "primarily organizational" V1 scope). A group never stores
  // a copy of its member nodes - only their ids, resolved live against graph.nodes the same way
  // an edge's endpoints are, so a group can never itself duplicate canonical or graph data.
  function normalizeGroup(raw) {
    if (!raw || typeof raw !== 'object' || !raw.id) return null;
    return {
      id: raw.id, title: raw.title || '',
      nodeIds: Array.isArray(raw.nodeIds) ? raw.nodeIds : [],
      collapsed: !!raw.collapsed,
      position: (raw.position && typeof raw.position === 'object') ? { x: Number(raw.position.x) || 0, y: Number(raw.position.y) || 0 } : null,
      size: (raw.size && typeof raw.size === 'object') ? { width: Number(raw.size.width) || 0, height: Number(raw.size.height) || 0 } : null,
      createdAt: raw.createdAt || nowIso()
    };
  }

  function defaultStageIdForType(typeId, stageIds) {
    var preferred = DEFAULT_STAGE_BY_TYPE[typeId];
    if (preferred && stageIds.indexOf(preferred) !== -1) return preferred;
    return stageIds[0] || DEFAULT_STAGES[0].id;
  }

  // Section 26's Pin to AI (of the original 72-section brief) - applies to ANY node (not just
  // aiAnalysis inputs), so a trader can mark a Scenario/Entry/Note as important/required context
  // before ever running an AI node. 'normal' (the default) means "included when directly
  // relevant" (e.g. on the resolved Focus Path); 'important' means "prefer inclusion" even one hop
  // further out; 'required' means "must be included unless technically unavailable" (this AI
  // phase's section 3A - EXPLICIT layer). Never auto-set by AI itself - only the trader pins.
  var AI_PRIORITIES = ['normal', 'important', 'required'];
  function normalizeAiContext(raw) {
    return {
      pinned: !!(raw && raw.pinned),
      priority: (raw && AI_PRIORITIES.indexOf(raw.priority) !== -1) ? raw.priority : 'normal'
    };
  }

  function normalizeNode(raw, stageIds) {
    if (!raw || typeof raw !== 'object' || !raw.id) return null;
    var ids = stageIds || DEFAULT_STAGES.map(function (s) { return s.id; });
    // Unknown/future node type: kept, never dropped (section 36), just flagged 'unavailable' so
    // the canvas/list can show an honest "unsupported node type" card instead of guessing.
    var known = !!NODE_TYPES[raw.type];
    var typeDef = NODE_TYPES[raw.type];
    var node = {
      id: raw.id, type: raw.type || 'unknown', typeVersion: Number(raw.typeVersion) || 1,
      origin: NODE_ORIGINS.indexOf(raw.origin) !== -1 ? raw.origin : (typeDef ? typeDef.origin : 'reference'),
      source: (raw.source && raw.source.type && raw.source.id) ? { type: raw.source.type, id: raw.source.id } : null,
      title: raw.title || '',
      status: known ? (NODE_STATUSES.indexOf(raw.status) !== -1 ? raw.status : 'active') : 'unavailable',
      stageId: (raw.stageId && ids.indexOf(raw.stageId) !== -1) ? raw.stageId : defaultStageIdForType(raw.type, ids),
      position: (raw.position && typeof raw.position === 'object')
        ? { x: Number(raw.position.x) || 0, y: Number(raw.position.y) || 0 } : { x: 0, y: 0 },
      // Manual (note) content - '' for every other origin, never used.
      content: typeof raw.content === 'string' ? raw.content : '',
      // Processing-node parameters (section 32) - stored separately from canonical Session data,
      // '{}' for every other origin.
      config: (raw.config && typeof raw.config === 'object') ? raw.config : {},
      aiContext: normalizeAiContext(raw.aiContext),
      createdAt: raw.createdAt || nowIso(), updatedAt: raw.updatedAt || raw.createdAt || nowIso()
    };
    // Section 9: only a real processing-type node carries execution metadata at all - a
    // reference/manual node has nothing to execute, so it stays `execution: null` rather than a
    // meaningless 'idle'.
    if (known && typeDef.origin === 'derived') {
      var validState = raw.execution && EXECUTION_STATES.indexOf(raw.execution.state) !== -1;
      var rawExec = raw.execution || {};
      node.execution = {
        state: typeDef.capabilities.executable ? (validState ? rawExec.state : 'idle') : 'unavailable',
        lastRunAt: rawExec.lastRunAt || null,
        // AI Node phase additions (this pass) - '{}'-safe defaults so a marketStructure/confluence
        // node (capabilities.executable:false forever in V1) round-trips these as empty/null with
        // zero behavioral change; only aiAnalysis's runAiAnalysisNode() ever populates them.
        // provenance answers "what information produced this result?" (section 6); result is the
        // structured AI response (section 9), never opaque text; suggestions is the array of
        // pending/applied/rejected AI Suggestion objects (section 11) this run produced; error is
        // the last run's stable error code (section 19), cleared on the next successful run.
        provenance: (rawExec.provenance && typeof rawExec.provenance === 'object') ? rawExec.provenance : null,
        result: normalizeAiResult(rawExec.result),
        suggestions: Array.isArray(rawExec.suggestions) ? rawExec.suggestions.map(normalizeAiSuggestion).filter(Boolean) : [],
        error: typeof rawExec.error === 'string' ? rawExec.error : null
      };
    } else {
      node.execution = null;
    }
    return node;
  }

  // Architecture review (2026-09-12) finding: node.execution.result was previously stored
  // verbatim behind only a loose `typeof === 'object'` check - a malformed/corrupted/future-
  // incompatible result (bad persisted JSON, a server schema change, a hand-edited Postgres row)
  // could crash the Inspector outright (analysisGraphCanvas.jsx's AiNodePanel calls
  // .map()/.length on result.observations/contradictions/missingEvidence/references with no
  // Array.isArray guard). Every array field is now deep-normalized here, the one place
  // "what does a stored AI result actually look like" is decided - AiNodePanel never needs its
  // own defensive checks. Matches this file's own established discipline (every other stored
  // shape - nodes, edges, groups, suggestions - is already normalized on read this way).
  function normalizeAiResult(raw) {
    if (!raw || typeof raw !== 'object') return null;
    function arr(x) { return Array.isArray(x) ? x : []; }
    function str(x) { return typeof x === 'string' ? x : ''; }
    return {
      summary: str(raw.summary),
      observations: arr(raw.observations).map(function (o) { return { text: str(o && o.text), nodeIds: arr(o && o.nodeIds) }; }),
      contradictions: arr(raw.contradictions).map(function (o) { return { text: str(o && o.text), nodeIds: arr(o && o.nodeIds) }; }),
      missingEvidence: arr(raw.missingEvidence).map(function (o) { return { text: str(o && o.text), relatedNodeIds: arr(o && o.relatedNodeIds) }; }),
      scenarioSuggestions: arr(raw.scenarioSuggestions),
      edgeSuggestions: arr(raw.edgeSuggestions),
      marketContextSuggestions: arr(raw.marketContextSuggestions),
      references: arr(raw.references).filter(function (r) { return r && typeof r.nodeId === 'string'; }).map(function (r) { return { nodeId: r.nodeId, label: str(r.label) }; })
    };
  }

  // ===== AI Suggestion model (this pass's section 11) =====
  // Matches the REAL, already-shipped app-wide convention discovered by this pass's audit
  // (strategiesHubView.jsx's ChatTab suggestion cards, mental-health-ui.js's suggestionCard,
  // mental-health-store.js's applySuggestion) rather than inventing new status wording: 'applied'
  // (not the generic 'approved') is the real string this codebase already uses everywhere a
  // suggestion gets accepted.
  var AI_SUGGESTION_TYPES = ['createNode', 'updateNode', 'createEdge', 'updateRelation', 'suggestMarketContext', 'updateScenario', 'updateProbability'];
  var AI_SUGGESTION_STATUSES = ['pending', 'applied', 'rejected'];
  function normalizeAiSuggestion(raw) {
    if (!raw || typeof raw !== 'object' || !raw.id || AI_SUGGESTION_TYPES.indexOf(raw.type) === -1) return null;
    return {
      id: raw.id, type: raw.type,
      target: raw.target || null,
      payload: (raw.payload && typeof raw.payload === 'object') ? raw.payload : {},
      // Section 10/25: every reference here MUST resolve to a real node/edge id - see
      // analysis-graph-ai-client.js's validateAiReferences(), which strips any suggestion whose
      // sourceNodeIds/sourceEdgeIds contain an id absent from the graph BEFORE it ever reaches
      // normalizeAiSuggestion, so a hallucinated id can never even round-trip through storage.
      sourceNodeIds: Array.isArray(raw.sourceNodeIds) ? raw.sourceNodeIds.slice() : [],
      sourceEdgeIds: Array.isArray(raw.sourceEdgeIds) ? raw.sourceEdgeIds.slice() : [],
      explanation: typeof raw.explanation === 'string' ? raw.explanation : '',
      confidence: (raw.confidence === 'low' || raw.confidence === 'medium' || raw.confidence === 'high') ? raw.confidence : null,
      status: AI_SUGGESTION_STATUSES.indexOf(raw.status) !== -1 ? raw.status : 'pending',
      createdAt: raw.createdAt || nowIso()
    };
  }

  // Structural validation only (id + both endpoints present) - relation/ports preserved verbatim
  // even if not in RELATION_IDS/unknown (section 36). Whether the endpoints still resolve to real
  // nodes is a render-time concern (analysisGraphCanvas.jsx skips a dangling edge, never crashes).
  function normalizeEdge(raw) {
    if (!raw || typeof raw !== 'object' || !raw.id || !raw.sourceNodeId || !raw.targetNodeId) return null;
    return {
      id: raw.id, sourceNodeId: raw.sourceNodeId, targetNodeId: raw.targetNodeId,
      sourcePort: raw.sourcePort || null, targetPort: raw.targetPort || null,
      relation: raw.relation || 'references',
      createdAt: raw.createdAt || nowIso()
    };
  }

  // ===== Port Definition API (section 5 of this pass's hardening brief) =====
  // resolveNodePorts() is the ONE seam a future "instance-level dynamic ports" system (a
  // processing node whose config changes its declared ports, or ports that depend on the
  // resolved source record rather than the static type) would change. V1's implementation is
  // intentionally the simplest possible - ports are static per TYPE (NODE_TYPES[id].ports),
  // never per instance. Every consumer (compatiblePortPair below; analysisGraphCanvas.jsx never
  // reads NODE_TYPES[...].ports directly either) goes through this function, so upgrading to a
  // dynamic model later means changing this one function's body, not every call site or
  // rewriting connection logic (do NOT redesign this into a bigger system now - see the brief).
  function resolveNodePorts(typeId) {
    var def = NODE_TYPES[typeId];
    return def ? def.ports : { inputs: [], outputs: [] };
  }

  // Section 7/16: the FIRST compatible (output,input) port-type pair between two node TYPES, or
  // null if none exists - the real "do not allow arbitrary connections" gate. See the port-type
  // comment above the NODE_TYPES declaration for the worked Note-vs-Chart-Entry example.
  function compatiblePortPair(sourceTypeId, targetTypeId) {
    if (!NODE_TYPES[sourceTypeId] || !NODE_TYPES[targetTypeId]) return null;
    var outputs = resolveNodePorts(sourceTypeId).outputs, inputs = resolveNodePorts(targetTypeId).inputs;
    for (var i = 0; i < outputs.length; i++) {
      for (var j = 0; j < inputs.length; j++) {
        if (outputs[i].type === inputs[j].type) return { sourcePort: outputs[i].id, targetPort: inputs[j].id };
      }
    }
    return null;
  }

  // Section 19 (Data Node Resolution). Always re-reads the live data - a node is a pointer, never
  // a cache - and returns null (never throws/guesses) once the thing it points to is gone
  // (section 9's "Source unavailable"). Trade/Pattern resolve through their own global stores
  // (window.TradeJournalTradeStore / window.TradeJournalPatternStore) rather than session.entries
  // - they are NOT part of the Session's own child records.
  function resolveNodeSource(source, session) {
    if (!source || !session) return null;
    if (source.type === 'sessionEntry') {
      return (session.entries || []).find(function (e) { return e.id === source.id; }) || null;
    }
    if (source.type === 'sessionScenario') {
      var entries = session.entries || [];
      for (var i = 0; i < entries.length; i++) {
        var found = (entries[i].scenarios || []).find(function (s) { return s.id === source.id; });
        if (found) return found;
      }
      return null;
    }
    if (source.type === 'trade') {
      var tradeStore = window.TradeJournalTradeStore;
      return (tradeStore && tradeStore.find(source.id)) || null;
    }
    if (source.type === 'pattern') {
      var patternStore = window.TradeJournalPatternStore;
      return (patternStore && patternStore.find(source.id)) || null;
    }
    // Section 12/15: the exact same plain {market, timeframe, instrument} shape already sent to
    // AI as marketContext (session-analysis-client.js's real, existing analyze() request body) -
    // not a new/second definition of what "market context" means. Always resolves (never null)
    // while the session itself exists, since it reads session fields directly rather than a
    // separate sub-record - a Market Context node can never show "source unavailable" as long as
    // its Session does.
    if (source.type === 'marketContext') {
      return { market: session.market || null, timeframe: session.timeframe || null, instrument: session.instrument || null };
    }
    return null;
  }

  // Section 40's Focus Path, extracted as a pure function (this pass) so analysisGraphCanvas.jsx's
  // own visual Focus Path AND the new Graph AI Context Builder's structural inclusion layer
  // (section 3B: "selected node, Focus Path, upstream evidence, downstream decision/outcome,
  // directly connected nodes, relevant edges") use the EXACT SAME traversal - one bidirectional
  // BFS covers all of those bullets at once, since it reaches every upstream/downstream/directly-
  // connected node and edge by construction. Two independent implementations could silently drift
  // (the canvas dimming one set of nodes while the AI context includes a different set) - this
  // function is the one place that logic lives now.
  function resolveFocusPathNodeIds(graph, nodeId) {
    if (!nodeId || !graph) return { nodeIds: [], edgeIds: [] };
    var edges = graph.edges || [];
    var nodeIds = {}; nodeIds[nodeId] = true;
    var edgeIds = {};
    var frontier = [nodeId];
    while (frontier.length) {
      var next = [];
      frontier.forEach(function (id) {
        edges.forEach(function (edge) {
          if (edge.sourceNodeId === id && !nodeIds[edge.targetNodeId]) { nodeIds[edge.targetNodeId] = true; next.push(edge.targetNodeId); edgeIds[edge.id] = true; }
          if (edge.targetNodeId === id && !nodeIds[edge.sourceNodeId]) { nodeIds[edge.sourceNodeId] = true; next.push(edge.sourceNodeId); edgeIds[edge.id] = true; }
          if ((edge.sourceNodeId === id || edge.targetNodeId === id)) edgeIds[edge.id] = true;
        });
      });
      frontier = next;
    }
    return { nodeIds: Object.keys(nodeIds), edgeIds: Object.keys(edgeIds) };
  }

  // Section 7 (AI Node phase) - stale detection is a LIVE, computed comparison, never a stored
  // flag (see the EXECUTION_STATES comment above): an aiAnalysis node is stale exactly when its
  // last completed run's recorded inputSignature no longer matches the CURRENT one the same
  // context-building rules would produce. A node that never ran, is still running, or has no
  // provenance is honestly "not stale" (there is nothing to compare against) - callers that care
  // about that distinction check node.execution.state themselves.
  function isAiNodeStale(node, currentInputSignature) {
    if (!node || !node.execution || node.execution.state !== 'completed') return false;
    if (!node.execution.provenance || !node.execution.provenance.inputSignature) return false;
    return node.execution.provenance.inputSignature !== currentInputSignature;
  }

  // Given a scenario id, which entry currently nests it - needed to select the right entry in the
  // Desk before expanding the scenario there. Returns null rather than guessing if moved/deleted.
  function findScenarioOwnerEntryId(scenarioId, session) {
    var entries = (session && session.entries) || [];
    for (var i = 0; i < entries.length; i++) {
      if ((entries[i].scenarios || []).some(function (s) { return s.id === scenarioId; })) return entries[i].id;
    }
    return null;
  }

  // Localized labels for RELATION_IDS (section 8). An id outside RELATION_IDS falls back to the
  // raw id string rather than a blank label.
  var RELATION_LABELS = {
    supports: { fa: 'تأیید می‌کند', ar: 'يدعم', en: 'supports', es: 'respalda' },
    contradicts: { fa: 'نقض می‌کند', ar: 'يتناقض مع', en: 'contradicts', es: 'contradice' },
    derived_from: { fa: 'برگرفته از', ar: 'مشتق من', en: 'derived from', es: 'derivado de' },
    references: { fa: 'ارجاع به', ar: 'يشير إلى', en: 'references', es: 'hace referencia a' },
    leads_to: { fa: 'منجر می‌شود به', ar: 'يؤدي إلى', en: 'leads to', es: 'conduce a' },
    triggered_by: { fa: 'ماشه‌خورده توسط', ar: 'محفز بواسطة', en: 'triggered by', es: 'activado por' },
    confirmed_by: { fa: 'تأییدشده توسط', ar: 'مؤكد بواسطة', en: 'confirmed by', es: 'confirmado por' },
    invalidated_by: { fa: 'ابطال‌شده توسط', ar: 'أبطل بواسطة', en: 'invalidated by', es: 'invalidado por' },
    resulted_in: { fa: 'منجر شد به', ar: 'أدى إلى', en: 'resulted in', es: 'resultó en' },
    depends_on: { fa: 'وابسته به', ar: 'يعتمد على', en: 'depends on', es: 'depende de' },
    compares_with: { fa: 'مقایسه با', ar: 'يقارن مع', en: 'compares with', es: 'se compara con' },
    informs: { fa: 'اطلاع می‌دهد به', ar: 'يُعلم', en: 'informs', es: 'informa a' },
    requires: { fa: 'نیازمند', ar: 'يتطلب', en: 'requires', es: 'requiere' },
    produces: { fa: 'تولید می‌کند', ar: 'ينتج', en: 'produces', es: 'produce' }
  };
  function relationLabel(relationId, lang) {
    var entry = RELATION_LABELS[relationId];
    if (!entry) return relationId;
    return entry[lang] || entry.en;
  }
  function stageLabel(stageId, stages, lang) {
    var stage = (stages || DEFAULT_STAGES).find(function (s) { return s.id === stageId; });
    if (!stage) return stageId;
    return stage.name[lang] || stage.name.en;
  }
  function categoryLabel(categoryId, lang) {
    var category = CATEGORIES[categoryId];
    if (!category) return categoryId;
    return category.title[lang] || category.title.en;
  }
  function nodeTypeTitle(typeId, lang) {
    var def = NODE_TYPES[typeId];
    if (!def) return typeId;
    return def.title[lang] || def.title.en;
  }

  // ===== Graph History foundation (this pass's "graph history foundation" brief item) =====
  // A small command-oriented vocabulary for Map-ONLY changes - groundwork for a future real
  // undo/redo stack, NOT undo/redo itself (nothing here applies or inverts a command yet).
  // Deliberately excludes anything that mutates canonical business data: creating a REFERENCE
  // node only ever adds a pointer (never canonical data - see addGraphNode's own "duplicate node
  // semantics" comment), so it's graph-only and safe to log; the canonical entity a picker-driven
  // creation flow may ALSO create (createScenarioFromMap et al. in liveSessionView.jsx) is
  // intentionally NOT represented as an invertible command here - undoing "add scenario node"
  // must never silently delete a real Scenario, matching this pass's own explicit instruction.
  var COMMAND_TYPES = ['move_node', 'create_node', 'remove_node', 'connect', 'disconnect', 'group', 'ungroup', 'stage_change'];
  function createCommand(type, payload) {
    if (COMMAND_TYPES.indexOf(type) === -1) return null;
    return { type: type, payload: payload || {}, at: nowIso() };
  }

  window.TradeJournalAnalysisGraphRegistry = {
    GRAPH_VERSION: GRAPH_VERSION,
    NODE_ORIGINS: NODE_ORIGINS,
    NODE_STATUSES: NODE_STATUSES,
    EXECUTION_STATES: EXECUTION_STATES,
    RELATION_IDS: RELATION_IDS,
    NODE_TYPES: NODE_TYPES,
    PROCESSING_TYPE_IDS: PROCESSING_TYPE_IDS,
    CATEGORIES: CATEGORIES,
    DEFAULT_STAGES: DEFAULT_STAGES,
    STAGE_TEMPLATE_ID: STAGE_TEMPLATE_ID,
    emptyGraph: emptyGraph,
    normalizeAnalysisGraph: normalizeAnalysisGraph,
    resolveNodeSource: resolveNodeSource,
    findScenarioOwnerEntryId: findScenarioOwnerEntryId,
    relationLabel: relationLabel,
    stageLabel: stageLabel,
    categoryLabel: categoryLabel,
    nodeTypeTitle: nodeTypeTitle,
    resolveNodePorts: resolveNodePorts,
    compatiblePortPair: compatiblePortPair,
    defaultStageIdForType: defaultStageIdForType,
    normalizeGroup: normalizeGroup,
    COMMAND_TYPES: COMMAND_TYPES,
    createCommand: createCommand,
    AI_PRIORITIES: AI_PRIORITIES,
    AI_SUGGESTION_TYPES: AI_SUGGESTION_TYPES,
    AI_SUGGESTION_STATUSES: AI_SUGGESTION_STATUSES,
    normalizeAiSuggestion: normalizeAiSuggestion,
    normalizeAiResult: normalizeAiResult,
    resolveFocusPathNodeIds: resolveFocusPathNodeIds,
    isAiNodeStale: isAiNodeStale
  };
}());
