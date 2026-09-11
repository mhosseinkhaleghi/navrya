import React from 'react';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';

// "نقشه تحلیل" (Analysis Map) - the pan/zoom node canvas, a second representation of the exact
// same session.analysisGraph data analysisGraphView.jsx's list mode also renders (section 54:
// "Canvas is an interface, not the only representation of the data"). No graph/canvas library
// exists anywhere in this repo (confirmed by the feat/analysis-map audit), so this is hand-rolled
// SVG+DOM, matching the codebase's own two other hand-rolled drag-and-drop implementations.
//
// V1+ SCOPE: free node positioning, pan/zoom, drag-to-connect with TYPED PORT validation + a
// relation picker, node/edge selection + delete, a compact Inspector (with real canonical
// editing for Scenario, and a "Change Stage" action for every node), stage lanes (a legend rail +
// a per-node color accent, not spatial bands - see the "why not spatial bands" comment below),
// and full node CREATION from the canvas itself (click-to-add, right-click context menu, and
// drag-from-picker) - canonical node types route through the real existing creation pipeline
// (liveSessionView.jsx's addScenario/addEntry/openLogWizard), never a second persistence path.
// NOT built yet: minimap, node grouping/collapse, multi-select/box-select, auto-layout, undo/
// redo, keyboard shortcuts beyond Delete/Escape, Focus Path, search/filter.
//
// Canvas coordinates are always LTR internally (x grows rightward) regardless of `rtl` - the
// same convention every hand-rolled canvas/graph tool uses even inside an RTL app. Only text and
// the toolbar/inspector/menu chrome respect `dir`.
//
// STAGES ARE LOGICAL, NOT SPATIAL (a deliberate simplification): node.position is fully free
// (x,y), and node.stageId is independent metadata, shown via a small color-coded accent strip on
// each node card plus a stage legend rail (counts + collapse toggle) - NOT a rigid horizontal
// lane a node's Y coordinate is constrained into. A spatial-lane model was considered and
// rejected: with free positioning, two nodes from different stages routinely share the same Y
// range, so a Y-range-derived band would overlap incoherently; the color+legend model stays
// correct and unambiguous regardless of where the trader actually drags a node. Reassigning a
// node's stage is therefore an explicit Inspector action ("Change Stage"), which is also exactly
// what ARCHITECTURE.md section 18 itself lists as an Inspector action, not a drag gesture.

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.2;
const NODE_WIDTH = 200;

// Section 42: the real SCENARIO_STATUSES value set (public/pages/shared/session-analysis-schema.js
// - deliberately no DB CHECK enum there either, "the value set may still grow") - duplicated here
// as a plain local list rather than a cross-module registry lookup, matching this file's existing
// low-dependency convention (the port-type vocabulary above is local too).
const SCENARIO_STATUSES = ['pending', 'strengthened', 'weakened', 'partially_confirmed', 'confirmed', 'invalidated'];

// One subtle accent color per default stage (order-indexed, not stage-id-keyed, so a future
// renamed/reordered template still gets a color). Deliberately desaturated - the character accent
// stays the dominant color on the canvas; this is a small left-edge strip + legend dot only.
const STAGE_COLORS = ['#8b7fd6', '#5aa9e6', '#4fb0a5', '#7cb342', '#d6b34f', '#e08a4f', '#d65f6b', '#a06bd6'];
function stageColor(stages, stageId) {
  const index = (stages || []).findIndex((s) => s.id === stageId);
  return STAGE_COLORS[index >= 0 ? index % STAGE_COLORS.length : 0];
}

const copy = {
  fa: {
    empty: 'برای شروع، یک گره اضافه کنید.', switchToList: 'رفتن به فهرست', addNode: 'افزودن گره',
    zoomIn: 'بزرگ‌نمایی', zoomOut: 'کوچک‌نمایی', resetView: 'بازنشانی نما', deleteHint: 'Delete برای حذف گره یا یال انتخاب‌شده',
    inspectorTitle: 'جزئیات گره', inspectorType: 'نوع', inspectorStatus: 'وضعیت', inspectorStage: 'مرحله',
    openSource: 'باز کردن منبع', removeFromMap: 'حذف از نقشه', close: 'بستن', sourceUnavailable: 'منبع این گره دیگر در دسترس نیست.',
    pickRelation: 'نوع رابطه را انتخاب کنید', cancel: 'انصراف', connectHint: 'برای اتصال، از نقطهٔ کنار گره به گره دیگر بکشید.',
    edgeInspectorTitle: 'رابطه', removeEdge: 'حذف رابطه', incompatiblePorts: 'این دو گره را نمی‌توان به هم وصل کرد (نوع پورت سازگار نیست).',
    stagesTitle: 'مراحل', changeStage: 'تغییر مرحله', scenarioStatus: 'وضعیت سناریو', executionUnavailable: 'اجرا هنوز پیاده‌سازی نشده',
    pickCategory: 'دسته را انتخاب کنید', pickType: 'نوع گره را انتخاب کنید', back: 'بازگشت', create: 'ایجاد',
    pickEntryForScenario: 'این سناریو به کدام ورودی متصل شود؟', noEntries: 'ابتدا یک ورودی چارت یا حرکت اضافه کنید.',
    pickScenarioForTrade: 'این معامله از کدام سناریو شروع می‌شود؟', noScenarios: 'ابتدا یک سناریو اضافه کنید.',
    pickPattern: 'الگویی را انتخاب کنید', noPatterns: 'هنوز الگویی در رجیستری الگوها ثبت نشده است.',
    chartEntry: 'ورودی چارت', movementEntry: 'ورودی حرکت', notePlaceholder: 'متن یادداشت…',
    targetStage: 'مرحله مقصد', dropToCreate: 'رها کنید تا ایجاد شود', save: 'ذخیره', processingConfig: 'تنظیمات پردازش',
    autoLayout: 'چیدمان خودکار', searchPlaceholder: 'جست‌وجو…', bulkTitle: 'انتخاب چندگانه', bulkChangeStage: 'تغییر مرحله همه', bulkRemove: 'حذف همه از نقشه'
  },
  ar: {
    empty: 'أضف عقدة للبدء.', switchToList: 'الانتقال إلى القائمة', addNode: 'إضافة عقدة',
    zoomIn: 'تكبير', zoomOut: 'تصغير', resetView: 'إعادة ضبط العرض', deleteHint: 'Delete لحذف العقدة أو الرابط المحدد',
    inspectorTitle: 'تفاصيل العقدة', inspectorType: 'النوع', inspectorStatus: 'الحالة', inspectorStage: 'المرحلة',
    openSource: 'فتح المصدر', removeFromMap: 'إزالة من الخريطة', close: 'إغلاق', sourceUnavailable: 'مصدر هذه العقدة لم يعد متاحًا.',
    pickRelation: 'اختر نوع العلاقة', cancel: 'إلغاء', connectHint: 'للاتصال، اسحب من نقطة جانب العقدة إلى عقدة أخرى.',
    edgeInspectorTitle: 'العلاقة', removeEdge: 'إزالة العلاقة', incompatiblePorts: 'لا يمكن توصيل هاتين العقدتين (نوع المنفذ غير متوافق).',
    stagesTitle: 'المراحل', changeStage: 'تغيير المرحلة', scenarioStatus: 'حالة السيناريو', executionUnavailable: 'التنفيذ غير مطبّق بعد',
    pickCategory: 'اختر الفئة', pickType: 'اختر نوع العقدة', back: 'رجوع', create: 'إنشاء',
    pickEntryForScenario: 'بأي إدخال يرتبط هذا السيناريو؟', noEntries: 'أضف أولًا إدخال مخطط أو حركة.',
    pickScenarioForTrade: 'من أي سيناريو تبدأ هذه الصفقة؟', noScenarios: 'أضف أولًا سيناريو.',
    pickPattern: 'اختر نمطًا', noPatterns: 'لا يوجد نمط مسجّل بعد في سجل الأنماط.',
    chartEntry: 'إدخال مخطط', movementEntry: 'إدخال حركة', notePlaceholder: 'نص الملاحظة…',
    targetStage: 'المرحلة الهدف', dropToCreate: 'أفلت للإنشاء', save: 'حفظ', processingConfig: 'إعدادات المعالجة',
    autoLayout: 'تخطيط تلقائي', searchPlaceholder: 'بحث…', bulkTitle: 'تحديد متعدد', bulkChangeStage: 'تغيير مرحلة الكل', bulkRemove: 'إزالة الكل من الخريطة'
  },
  en: {
    empty: 'Add a node to get started.', switchToList: 'Switch to list', addNode: 'Add node',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', resetView: 'Reset view', deleteHint: 'Delete removes the selected node or edge',
    inspectorTitle: 'Node details', inspectorType: 'Type', inspectorStatus: 'Status', inspectorStage: 'Stage',
    openSource: 'Open source', removeFromMap: 'Remove from map', close: 'Close', sourceUnavailable: "This node's source is no longer available.",
    pickRelation: 'Choose the relation', cancel: 'Cancel', connectHint: 'To connect, drag from a node’s side handle to another node.',
    edgeInspectorTitle: 'Relation', removeEdge: 'Remove relation', incompatiblePorts: "These two nodes can't be connected (incompatible port type).",
    stagesTitle: 'Stages', changeStage: 'Change stage', scenarioStatus: 'Scenario status', executionUnavailable: 'Execution not implemented yet',
    pickCategory: 'Choose a category', pickType: 'Choose a node type', back: 'Back', create: 'Create',
    pickEntryForScenario: 'Which entry should this scenario attach to?', noEntries: 'Add a chart or movement entry first.',
    pickScenarioForTrade: 'Which scenario does this trade come from?', noScenarios: 'Add a scenario first.',
    pickPattern: 'Choose a pattern', noPatterns: 'No pattern registered in the Pattern Registry yet.',
    chartEntry: 'Chart entry', movementEntry: 'Movement entry', notePlaceholder: 'Note text…',
    targetStage: 'Target stage', dropToCreate: 'Drop to create', save: 'Save', processingConfig: 'Processing config',
    autoLayout: 'Auto-layout', searchPlaceholder: 'Search…', bulkTitle: 'Multi-select', bulkChangeStage: 'Change stage for all', bulkRemove: 'Remove all from map'
  },
  es: {
    empty: 'Agrega un nodo para empezar.', switchToList: 'Ir a la lista', addNode: 'Agregar nodo',
    zoomIn: 'Acercar', zoomOut: 'Alejar', resetView: 'Restablecer vista', deleteHint: 'Supr elimina el nodo o la relación seleccionada',
    inspectorTitle: 'Detalles del nodo', inspectorType: 'Tipo', inspectorStatus: 'Estado', inspectorStage: 'Etapa',
    openSource: 'Abrir origen', removeFromMap: 'Quitar del mapa', close: 'Cerrar', sourceUnavailable: 'El origen de este nodo ya no está disponible.',
    pickRelation: 'Elige la relación', cancel: 'Cancelar', connectHint: 'Para conectar, arrastra desde el punto lateral de un nodo hacia otro.',
    edgeInspectorTitle: 'Relación', removeEdge: 'Quitar relación', incompatiblePorts: 'Estos dos nodos no se pueden conectar (tipo de puerto incompatible).',
    stagesTitle: 'Etapas', changeStage: 'Cambiar etapa', scenarioStatus: 'Estado del escenario', executionUnavailable: 'La ejecución aún no está implementada',
    pickCategory: 'Elige una categoría', pickType: 'Elige un tipo de nodo', back: 'Atrás', create: 'Crear',
    pickEntryForScenario: '¿A qué entrada se debe vincular este escenario?', noEntries: 'Agrega primero una entrada de gráfico o movimiento.',
    pickScenarioForTrade: '¿De qué escenario proviene esta operación?', noScenarios: 'Agrega primero un escenario.',
    pickPattern: 'Elige un patrón', noPatterns: 'Todavía no hay patrones en el registro de patrones.',
    chartEntry: 'Entrada de gráfico', movementEntry: 'Entrada de movimiento', notePlaceholder: 'Texto de la nota…',
    targetStage: 'Etapa destino', dropToCreate: 'Suelta para crear', save: 'Guardar', processingConfig: 'Configuración de procesamiento',
    autoLayout: 'Diseño automático', searchPlaceholder: 'Buscar…', bulkTitle: 'Selección múltiple', bulkChangeStage: 'Cambiar etapa de todos', bulkRemove: 'Quitar todos del mapa'
  }
};
function tr(lang, key) { return (copy[lang] && copy[lang][key]) || copy.en[key] || key; }

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function nodeCenter(node) { return { x: node.position.x + NODE_WIDTH / 2, y: node.position.y + 22 }; }
function nodeHandle(node) { return { x: node.position.x + NODE_WIDTH, y: node.position.y + 22 }; }

function edgePath(a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

// Canvas core has NO per-node-type knowledge (this pass's "Node Registry hardening" requirement)
// - title/status come entirely from registry.NODE_TYPES[node.type].display, a pair of pure
// functions the TYPE DEFINITION owns (see analysis-graph-registry.js's DISPLAY map). If a
// resolved source record is missing (deleted canonical entity), display falls back to the raw
// node title without ever calling into a type's display function, which may assume a real record.
function nodeDisplay(node, sourceRecord, lang, registry) {
  const typeDef = registry.NODE_TYPES[node.type];
  if (!typeDef) return { title: node.title || node.id, status: null }; // unknown/future type - honest fallback, no crash
  if (node.origin === 'reference' && !sourceRecord) return { title: node.title || node.id, status: null };
  return { title: typeDef.display.title(sourceRecord, node, lang, typeDef), status: typeDef.display.status(sourceRecord, node) };
}

export function AnalysisGraphCanvas({
  session, lang, rtl, graph, onOpenSource, onRemoveNode, onMoveNode, onMoveNodes, onSetViewport,
  onAddEdge, onRemoveEdge, onSwitchToList, onChangeNodeStage, onToggleStageCollapsed,
  onUpdateScenario, onUpdateNoteContent, onUpdateProcessingConfig,
  onCreateScenario, onCreateEntry, onCreateTrade, onCreatePatternRef, onCreateNote, onCreateProcessing
}) {
  // Bundled once per render for the Inspector's QUICK_EDIT_ADAPTERS (section 3's action
  // registry/adapter pattern) - a future adapter only needs its own key added here, never a new
  // prop threaded through Inspector's own signature.
  const inspectorActions = { onUpdateScenario, onUpdateNoteContent, onUpdateProcessingConfig };
  const registry = window.TradeJournalAnalysisGraphRegistry;
  const containerRef = React.useRef(null);
  const viewportCommitRef = React.useRef(null);

  const [viewport, setViewport] = React.useState(graph.viewport || { x: 0, y: 0, zoom: 1 });
  const [dragPositions, setDragPositions] = React.useState({}); // nodeId -> {x,y} while dragging, local only
  const [panning, setPanning] = React.useState(null); // {startClientX, startClientY, startX, startY}
  const [draggingNodeId, setDraggingNodeId] = React.useState(null);
  const [connecting, setConnecting] = React.useState(null); // {sourceNodeId, x, y}
  const [pendingEdge, setPendingEdge] = React.useState(null); // {sourceNodeId, targetNodeId}
  const [connectError, setConnectError] = React.useState(false);
  // Multi-select (section 8): both are Sets so 0/1/many nodes or edges can be selected at once.
  // A single selected node (and nothing else) drives both the single-node Inspector AND Focus
  // Path (below); 2+ selected nodes drive a bulk-actions Inspector instead.
  const [selectedNodeIds, setSelectedNodeIds] = React.useState(() => new Set());
  const [selectedEdgeIds, setSelectedEdgeIds] = React.useState(() => new Set());
  const [boxSelect, setBoxSelect] = React.useState(null); // {startWorld, currentWorld} while shift-dragging the background
  const [searchQuery, setSearchQuery] = React.useState('');
  const [creationMenu, setCreationMenu] = React.useState(null); // {mode:'toolbar'|'context'|'drop', worldPos}

  function clearSelection() { setSelectedNodeIds(new Set()); setSelectedEdgeIds(new Set()); }
  function selectNodeOnly(nodeId) { setSelectedNodeIds(new Set([nodeId])); setSelectedEdgeIds(new Set()); }
  function toggleNodeSelected(nodeId) {
    setSelectedEdgeIds(new Set());
    setSelectedNodeIds((prev) => { const next = new Set(prev); if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId); return next; });
  }
  function selectEdgeOnly(edgeId) { setSelectedEdgeIds(new Set([edgeId])); setSelectedNodeIds(new Set()); }

  const collapsedStages = (graph.workflowMeta && graph.workflowMeta.collapsedStages) || {};
  const visibleNodes = graph.nodes.filter((n) => !collapsedStages[n.stageId]);
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = graph.edges.filter((e) => visibleNodeIds.has(e.sourceNodeId) && visibleNodeIds.has(e.targetNodeId));

  // Session data changed under us (Desk edit, another tab, a save completing) - graph.viewport is
  // authoritative on every fresh normalize(), but never stomp mid-pan/mid-drag local state.
  React.useEffect(() => {
    if (!panning && !draggingNodeId) setViewport(graph.viewport || { x: 0, y: 0, zoom: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.updatedAt]);

  function commitViewport(next) {
    setViewport(next);
    if (viewportCommitRef.current) clearTimeout(viewportCommitRef.current);
    viewportCommitRef.current = setTimeout(() => onSetViewport(next), 400);
  }

  function toWorld(clientX, clientY) {
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom
    };
  }

  // Section 8's box selection: Shift+drag on empty background selects every node whose box
  // intersects the dragged rectangle, ADDED to whatever was already selected (shift = additive,
  // the same convention click-to-toggle uses below) - a plain drag (no Shift) keeps panning, so
  // the two gestures never conflict on the same background surface.
  function onBackgroundPointerDown(e) {
    if (e.target !== e.currentTarget) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.shiftKey) {
      const world = toWorld(e.clientX, e.clientY);
      setBoxSelect({ startWorld: world, currentWorld: world });
      return;
    }
    clearSelection();
    setPanning({ startClientX: e.clientX, startClientY: e.clientY, startX: viewport.x, startY: viewport.y });
  }
  function onBackgroundPointerMove(e) {
    if (boxSelect) { setBoxSelect((prev) => prev && { ...prev, currentWorld: toWorld(e.clientX, e.clientY) }); return; }
    if (!panning) return;
    commitViewportLocal({ ...viewport, x: panning.startX + (e.clientX - panning.startClientX), y: panning.startY + (e.clientY - panning.startClientY) });
  }
  // Visual-only update during an active pan/zoom drag - the debounced commitViewport() above
  // (used on drag-end / wheel) is what actually calls onSetViewport(); this keeps the drag itself
  // from persisting on every pointermove (section 52).
  function commitViewportLocal(next) { setViewport(next); }

  function onBackgroundPointerUp(e) {
    if (boxSelect) {
      const x0 = Math.min(boxSelect.startWorld.x, boxSelect.currentWorld.x), x1 = Math.max(boxSelect.startWorld.x, boxSelect.currentWorld.x);
      const y0 = Math.min(boxSelect.startWorld.y, boxSelect.currentWorld.y), y1 = Math.max(boxSelect.startWorld.y, boxSelect.currentWorld.y);
      const hits = visibleNodes.filter((node) => { const pos = positionOf(node); return pos.x < x1 && pos.x + NODE_WIDTH > x0 && pos.y < y1 && pos.y + 44 > y0; });
      if (hits.length) setSelectedNodeIds((prev) => { const next = new Set(prev); hits.forEach((n) => next.add(n.id)); return next; });
      setBoxSelect(null);
    }
    if (panning) { commitViewport(viewport); setPanning(null); }
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
  }
  function onBackgroundContextMenu(e) {
    e.preventDefault();
    clearSelection();
    setCreationMenu({ mode: 'context', worldPos: toWorld(e.clientX, e.clientY), screenPos: { x: e.clientX, y: e.clientY } });
  }
  function onBackgroundDragOver(e) { e.preventDefault(); }
  function onBackgroundDrop(e) {
    e.preventDefault();
    const typeId = e.dataTransfer.getData('text/analysis-graph-node-type');
    if (!typeId) return;
    setCreationMenu({ mode: 'drop', worldPos: toWorld(e.clientX, e.clientY), presetType: typeId });
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left, cursorY = e.clientY - rect.top;
    const worldX = (cursorX - viewport.x) / viewport.zoom, worldY = (cursorY - viewport.y) / viewport.zoom;
    const nextZoom = clamp(viewport.zoom * (e.deltaY < 0 ? 1.12 : 0.9), ZOOM_MIN, ZOOM_MAX);
    const next = { x: cursorX - worldX * nextZoom, y: cursorY - worldY * nextZoom, zoom: nextZoom };
    commitViewportLocal(next);
    commitViewport(next);
  }

  function zoomBy(factor) {
    const rect = containerRef.current.getBoundingClientRect();
    const cursorX = rect.width / 2, cursorY = rect.height / 2;
    const worldX = (cursorX - viewport.x) / viewport.zoom, worldY = (cursorY - viewport.y) / viewport.zoom;
    const nextZoom = clamp(viewport.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    const next = { x: cursorX - worldX * nextZoom, y: cursorY - worldY * nextZoom, zoom: nextZoom };
    commitViewportLocal(next);
    commitViewport(next);
  }
  function resetView() {
    const next = { x: 40, y: 40, zoom: 1 };
    commitViewportLocal(next);
    commitViewport(next);
  }

  // Section 8's deterministic auto-layout: EXPLICIT user-triggered only (this button), never run
  // automatically or on a timer/change ("do not continuously rearrange the graph"). Grid by
  // stage order (rows, in graph.stages' own order) x node id (columns, stable/deterministic -
  // never creation-order-dependent, so the exact same graph always lays out identically no
  // matter when this is clicked).
  //
  // REAL BUG FOUND VIA LIVE BROWSER VERIFICATION, FIXED: this used to call onMoveNode() once per
  // node in a loop - N independent async persist()/upsert() calls against the SAME session
  // record, with no guarantee their server responses come back in the order they were sent.
  // Confirmed live: the layout looked correct immediately, then reverted to overlapping
  // positions after a reload, because a stale earlier response's reconciliation overwrote the
  // later (correct) optimistic state. Fixed by computing every node's new position first and
  // committing them all through ONE onMoveNodes() call - a single mutation, a single persist().
  function autoLayout() {
    const columnGap = 240, rowGap = 120;
    const positions = {};
    graph.stages.forEach((stage, rowIndex) => {
      const stageNodes = graph.nodes.filter((n) => n.stageId === stage.id).slice().sort((a, b) => (a.id < b.id ? -1 : 1));
      stageNodes.forEach((node, colIndex) => { positions[node.id] = { x: 40 + colIndex * columnGap, y: 40 + rowIndex * rowGap }; });
    });
    onMoveNodes(positions);
  }

  function positionOf(node) { return dragPositions[node.id] || node.position; }

  function onNodePointerDown(node, e) {
    e.stopPropagation();
    if (e.shiftKey) { toggleNodeSelected(node.id); return; } // shift-click: pure selection toggle, no drag (section 8 multi-select)
    selectNodeOnly(node.id);
    // Captured into a plain variable rather than read off `e` inside the later async
    // onMove/onUp closures - React does not guarantee a SyntheticEvent's currentTarget stays
    // readable once the handler that received it has returned.
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = { clientX: e.clientX, clientY: e.clientY, x: node.position.x, y: node.position.y };
    setDraggingNodeId(node.id);
    function onMove(ev) {
      const dx = (ev.clientX - start.clientX) / viewport.zoom, dy = (ev.clientY - start.clientY) / viewport.zoom;
      setDragPositions((prev) => ({ ...prev, [node.id]: { x: start.x + dx, y: start.y + dy } }));
    }
    function onUp(ev) {
      const dx = (ev.clientX - start.clientX) / viewport.zoom, dy = (ev.clientY - start.clientY) / viewport.zoom;
      const finalPos = { x: start.x + dx, y: start.y + dy };
      onMoveNode(node.id, finalPos);
      setDragPositions((prev) => { const next = { ...prev }; delete next[node.id]; return next; });
      setDraggingNodeId(null);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    }
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }

  // Which node (if any) contains this world point - a plain point-in-rect test over the real
  // node positions/NODE_WIDTH, deliberately NOT DOM hit-testing (elementFromPoint): pointer
  // capture (set below, so the drag keeps tracking even once the cursor leaves the handle)
  // redirects every subsequent pointermove/pointerup back to the CAPTURING element, so the
  // element visually under the cursor never actually receives its own pointerup - a real,
  // well-known pointer-capture gotcha, not a hypothetical one.
  function nodeAtWorldPoint(x, y, excludeId) {
    for (const node of visibleNodes) {
      if (node.id === excludeId) continue;
      const pos = positionOf(node);
      if (x >= pos.x && x <= pos.x + NODE_WIDTH && y >= pos.y - 4 && y <= pos.y + 44) return node;
    }
    return null;
  }

  function onHandlePointerDown(node, e) {
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startWorld = toWorld(e.clientX, e.clientY);
    setConnecting({ sourceNodeId: node.id, x: startWorld.x, y: startWorld.y });
    function onMove(ev) {
      const world = toWorld(ev.clientX, ev.clientY);
      setConnecting((prev) => prev && { ...prev, x: world.x, y: world.y });
    }
    function onUp(ev) {
      const world = toWorld(ev.clientX, ev.clientY);
      const target = nodeAtWorldPoint(world.x, world.y, node.id);
      if (target) {
        // Section 7/16: real typed-port validation BEFORE ever opening the relation picker - an
        // incompatible pair (e.g. a Note dropped onto Market Structure) is rejected outright with
        // a message, never silently allowed.
        const pair = registry.compatiblePortPair(node.type, target.type);
        if (pair) setPendingEdge({ sourceNodeId: node.id, targetNodeId: target.id });
        else { setConnectError(true); setTimeout(() => setConnectError(false), 2200); }
      }
      setConnecting(null);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    }
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }

  function finalizePendingEdge(relation) {
    if (pendingEdge) onAddEdge(pendingEdge.sourceNodeId, pendingEdge.targetNodeId, relation);
    setPendingEdge(null);
  }

  React.useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') { if (e.key === 'Escape') { clearSelection(); setPendingEdge(null); setCreationMenu(null); } return; }
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Bulk delete (section 8 multi-select): every selected node and edge, not just one.
      selectedNodeIds.forEach((id) => onRemoveNode(id));
      selectedEdgeIds.forEach((id) => onRemoveEdge(id));
      if (selectedNodeIds.size || selectedEdgeIds.size) clearSelection();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNodeIds, selectedEdgeIds, onRemoveNode, onRemoveEdge]);

  const nodeById = {};
  graph.nodes.forEach((n) => { nodeById[n.id] = n; });
  const selectedNode = selectedNodeIds.size === 1 && selectedEdgeIds.size === 0 ? nodeById[[...selectedNodeIds][0]] : null;
  const selectedEdge = selectedEdgeIds.size === 1 && selectedNodeIds.size === 0 ? graph.edges.find((e) => selectedEdgeIds.has(e.id)) : null;
  const bulkSelection = (selectedNodeIds.size + selectedEdgeIds.size) > 1;

  // Section 40's Focus Path: selecting exactly one node highlights its whole connected
  // component (every node/edge reachable by following edges in either direction) and dims
  // everything else - "everything outside the selected reasoning path becomes visually
  // subdued." Recomputed only when the single-selected node or the edge set changes.
  const focusPath = React.useMemo(() => {
    if (!selectedNode) return null;
    const nodeIds = new Set([selectedNode.id]);
    const edgeIds = new Set();
    let frontier = [selectedNode.id];
    while (frontier.length) {
      const next = [];
      frontier.forEach((id) => {
        graph.edges.forEach((edge) => {
          if (edge.sourceNodeId === id && !nodeIds.has(edge.targetNodeId)) { nodeIds.add(edge.targetNodeId); next.push(edge.targetNodeId); edgeIds.add(edge.id); }
          if (edge.targetNodeId === id && !nodeIds.has(edge.sourceNodeId)) { nodeIds.add(edge.sourceNodeId); next.push(edge.sourceNodeId); edgeIds.add(edge.id); }
          if ((edge.sourceNodeId === id || edge.targetNodeId === id)) edgeIds.add(edge.id);
        });
      });
      frontier = next;
    }
    return { nodeIds, edgeIds };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode && selectedNode.id, graph.edges]);

  // Section 39's search/filter: matches node title, manual content, or (for reference nodes) the
  // resolved canonical record's own title/name - reuses the SAME highlight/dim mechanism as
  // Focus Path (below) rather than hiding non-matches outright, per section 39's "search must
  // focus/highlight real graph paths."
  const searchMatchIds = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const ids = new Set();
    visibleNodes.forEach((node) => {
      const sourceRecord = node.origin === 'reference' ? registry.resolveNodeSource(node.source, session) : null;
      const display = nodeDisplay(node, sourceRecord, lang, registry);
      const haystack = [display.title, node.content, node.title].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(q)) ids.add(node.id);
    });
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, graph.nodes, session]);

  // Whichever of the two is active (search takes precedence while typing) - null means "no
  // dimming, show everything at full opacity" (the default, no-selection state).
  const highlightNodeIds = searchMatchIds || (focusPath && focusPath.nodeIds) || null;
  const highlightEdgeIds = searchMatchIds ? null : (focusPath && focusPath.edgeIds) || null;

  // If the creation was triggered by an actual drag-and-drop onto the canvas, place the new node
  // exactly where it was dropped (a plain follow-up onMoveNode() - see liveSessionView.jsx's own
  // comment on why position isn't threaded through every creation function signature). Toolbar/
  // context-menu creation keeps the default stacked position.
  function placeIfDropped(node) {
    if (node && creationMenu && creationMenu.mode === 'drop') onMoveNode(node.id, creationMenu.worldPos);
  }

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', gap: 10, height: 600 }}>
      <StageLegend lang={lang} rtl={rtl} stages={graph.stages} nodes={graph.nodes} collapsed={collapsedStages} onToggle={onToggleStageCollapsed} />

      <div
        ref={containerRef}
        onPointerDown={onBackgroundPointerDown} onPointerMove={onBackgroundPointerMove}
        onPointerUp={onBackgroundPointerUp} onWheel={onWheel} onContextMenu={onBackgroundContextMenu}
        onDragOver={onBackgroundDragOver} onDrop={onBackgroundDrop}
        style={{
          position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden', borderRadius: 12,
          border: '1px solid var(--border-hairline)', background: 'radial-gradient(circle, rgba(244,234,215,.06) 1px, transparent 1px) 0 0/22px 22px, var(--ink-950)',
          cursor: panning ? 'grabbing' : 'grab', touchAction: 'none'
        }}
      >
        {visibleNodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 20, textAlign: 'center' }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-dim)', maxWidth: 260 }}>{tr(lang, 'empty')}</span>
          </div>
        )}

        <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
          <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
            {visibleEdges.map((edge) => {
              const a = nodeById[edge.sourceNodeId], b = nodeById[edge.targetNodeId];
              if (!a || !b) return null; // dangling edge (endpoint removed) - never drawn, never crashes
              const from = nodeHandle({ ...a, position: positionOf(a) });
              const to = nodeCenter({ ...b, position: positionOf(b) });
              const isSelected = selectedEdgeIds.has(edge.id);
              const dimmed = highlightEdgeIds && !highlightEdgeIds.has(edge.id);
              const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
              return (
                <g key={edge.id} opacity={dimmed ? 0.22 : 1} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); if (e.shiftKey) { setSelectedNodeIds(new Set()); setSelectedEdgeIds((prev) => { const next = new Set(prev); if (next.has(edge.id)) next.delete(edge.id); else next.add(edge.id); return next; }); } else selectEdgeOnly(edge.id); }}>
                  <path d={edgePath(from, to)} fill="none" stroke={isSelected ? 'var(--char-accent)' : 'rgba(244,234,215,.34)'} strokeWidth={isSelected ? 2.5 : 1.5} />
                  <rect x={mid.x - 46} y={mid.y - 9} width={92} height={18} rx={9} fill="var(--ink-950)" stroke={isSelected ? 'var(--char-accent)' : 'var(--border-hairline)'} strokeWidth={1} />
                  <text x={mid.x} y={mid.y + 4} textAnchor="middle" fontSize={9.5} fill={isSelected ? 'var(--char-accent)' : 'var(--text-muted)'}>{registry.relationLabel(edge.relation, lang)}</text>
                </g>
              );
            })}
            {connecting && nodeById[connecting.sourceNodeId] && (
              <path d={edgePath(nodeHandle({ ...nodeById[connecting.sourceNodeId], position: positionOf(nodeById[connecting.sourceNodeId]) }), { x: connecting.x, y: connecting.y })}
                fill="none" stroke="var(--char-accent)" strokeWidth={1.5} strokeDasharray="4 4" />
            )}
            {boxSelect && (
              <rect
                x={Math.min(boxSelect.startWorld.x, boxSelect.currentWorld.x)} y={Math.min(boxSelect.startWorld.y, boxSelect.currentWorld.y)}
                width={Math.abs(boxSelect.currentWorld.x - boxSelect.startWorld.x)} height={Math.abs(boxSelect.currentWorld.y - boxSelect.startWorld.y)}
                fill="rgba(214,175,107,.10)" stroke="var(--char-accent)" strokeDasharray="4 4"
              />
            )}
          </g>
        </svg>

        <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: '0 0' }}>
          {visibleNodes.map((node) => {
            const pos = positionOf(node);
            const sourceRecord = node.origin === 'reference' ? registry.resolveNodeSource(node.source, session) : null;
            const unavailable = node.origin === 'reference' && !sourceRecord;
            const display = nodeDisplay(node, sourceRecord, lang, registry);
            const isSelected = selectedNodeIds.has(node.id);
            const dimmed = highlightNodeIds && !highlightNodeIds.has(node.id);
            const typeDef = registry.NODE_TYPES[node.type];
            return (
              <div
                key={node.id}
                onPointerDown={(e) => onNodePointerDown(node, e)}
                style={{
                  position: 'absolute', left: pos.x, top: pos.y, width: NODE_WIDTH, borderRadius: 10, padding: '8px 10px 8px 12px',
                  background: 'color-mix(in srgb, var(--char-atmosphere) 30%, var(--ink-900))',
                  border: '1px solid ' + (isSelected ? 'var(--char-accent)' : 'var(--border-hairline)'),
                  borderInlineStart: '4px solid ' + stageColor(graph.stages, node.stageId),
                  boxShadow: isSelected ? 'var(--glow-active)' : 'none', cursor: draggingNodeId === node.id ? 'grabbing' : 'grab',
                  userSelect: 'none', opacity: dimmed ? 0.22 : (unavailable ? 0.55 : 1)
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={(typeDef && typeDef.icon) || 'Box'} size={13} style={{ color: 'var(--char-accent)', flex: 'none' }} />
                  <span style={{ fontSize: 11.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="auto">{display.title}</span>
                </div>
                {display.status && <Chip tone={node.origin === 'derived' ? 'warning' : 'neutral'} style={{ marginTop: 6, height: 18, fontSize: 9.5 }}>{display.status}</Chip>}
                <div
                  onPointerDown={(e) => onHandlePointerDown(node, e)}
                  title={tr(lang, 'connectHint')}
                  style={{ position: 'absolute', insetInlineEnd: -6, top: 22 - 6, width: 12, height: 12, borderRadius: '50%', background: 'var(--char-accent)', border: '2px solid var(--ink-950)', cursor: 'crosshair' }}
                />
              </div>
            );
          })}
        </div>

        <div style={{ position: 'absolute', insetInlineStart: 10, bottom: 10, display: 'flex', gap: 6 }}>
          <button type="button" title={tr(lang, 'zoomOut')} onClick={() => zoomBy(0.85)} style={miniBtnStyle}><Icon name="Minus" size={14} /></button>
          <button type="button" title={tr(lang, 'resetView')} onClick={resetView} style={miniBtnStyle}><Icon name="Maximize" size={13} /></button>
          <button type="button" title={tr(lang, 'zoomIn')} onClick={() => zoomBy(1.18)} style={miniBtnStyle}><Icon name="Plus" size={14} /></button>
          <button type="button" title={tr(lang, 'autoLayout')} onClick={autoLayout} style={miniBtnStyle}><Icon name="LayoutGrid" size={14} /></button>
          <button type="button" onClick={() => setCreationMenu({ mode: 'toolbar', worldPos: toWorld(200, 200) })} style={{ ...miniBtnStyle, width: 'auto', padding: '0 10px', fontSize: 11, gap: 6, display: 'flex', alignItems: 'center' }}>
            <Icon name="Plus" size={13} />{tr(lang, 'addNode')}
          </button>
        </div>
        <div style={{ position: 'absolute', insetInlineEnd: 10, top: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Icon name="Search" size={13} style={{ position: 'absolute', insetInlineStart: 8, top: 8, color: 'var(--text-dim)', pointerEvents: 'none' }} />
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={tr(lang, 'searchPlaceholder')} dir="auto"
              style={{ height: 30, width: 150, borderRadius: 7, border: '1px solid var(--border-hairline)', background: 'var(--ink-950)', color: 'var(--text-primary)', fontSize: 11.5, paddingInlineStart: 26, paddingInlineEnd: 8 }}
            />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{tr(lang, 'deleteHint')}</span>
          <button type="button" onClick={onSwitchToList} style={{ ...miniBtnStyle, width: 'auto', padding: '0 10px', fontSize: 11 }}>{tr(lang, 'switchToList')}</button>
        </div>
        {connectError && (
          <div style={{ position: 'absolute', insetInlineStart: '50%', transform: 'translateX(-50%)', top: 10, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,56,48,.45)', background: 'rgba(3,8,7,.92)', color: 'var(--danger)', fontSize: 11.5, maxWidth: 320, textAlign: 'center' }}>
            {tr(lang, 'incompatiblePorts')}
          </div>
        )}
        <Minimap nodes={visibleNodes} positionOf={positionOf} viewport={viewport} containerRef={containerRef} onPan={(next) => { commitViewportLocal(next); commitViewport(next); }} />
      </div>

      {bulkSelection && (
        <BulkInspector
          lang={lang} rtl={rtl} graph={graph}
          nodeCount={selectedNodeIds.size} edgeCount={selectedEdgeIds.size}
          onClose={clearSelection}
          onRemove={() => { selectedNodeIds.forEach((id) => onRemoveNode(id)); selectedEdgeIds.forEach((id) => onRemoveEdge(id)); clearSelection(); }}
          onChangeStage={(stageId) => { selectedNodeIds.forEach((id) => onChangeNodeStage(id, stageId)); }}
        />
      )}
      {!bulkSelection && (selectedNode || selectedEdge) && (
        <Inspector
          lang={lang} rtl={rtl} registry={registry} session={session} graph={graph}
          node={selectedNode} edge={selectedEdge}
          onClose={clearSelection} onOpenSource={onOpenSource} onRemoveNode={onRemoveNode}
          onRemoveEdge={onRemoveEdge} onChangeNodeStage={onChangeNodeStage} actions={inspectorActions}
        />
      )}

      {pendingEdge && (
        <RelationPicker lang={lang} rtl={rtl} onPick={finalizePendingEdge} onCancel={() => setPendingEdge(null)} registry={registry} />
      )}
      {creationMenu && (
        <NodeCreationMenu
          lang={lang} rtl={rtl} registry={registry} session={session} graph={graph} menu={creationMenu}
          onClose={() => setCreationMenu(null)}
          onCreateScenario={(entryId, stageId) => { const n = onCreateScenario(entryId, stageId); placeIfDropped(n); }}
          onCreateEntry={(kind, stageId) => { const n = onCreateEntry(kind, stageId); placeIfDropped(n); }}
          onCreateTrade={(scenario, stageId) => onCreateTrade(scenario, stageId)}
          onCreatePatternRef={(patternId, stageId) => { const n = onCreatePatternRef(patternId, stageId); placeIfDropped(n); }}
          onCreateNote={(content, stageId) => { const n = onCreateNote(content, stageId); placeIfDropped(n); }}
          onCreateProcessing={(typeId, config, stageId) => { const n = onCreateProcessing(typeId, config, stageId); placeIfDropped(n); }}
        />
      )}
    </div>
  );
}

const miniBtnStyle = {
  display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, cursor: 'pointer',
  border: '1px solid var(--border-hairline)', background: 'var(--ink-950)', color: 'var(--text-muted)'
};
const secondaryBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', height: 32, borderRadius: 8, cursor: 'pointer',
  border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-primary)', fontSize: 11.5
};
const dangerBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', height: 32, borderRadius: 8, cursor: 'pointer',
  border: '1px solid rgba(255,56,48,.45)', background: 'rgba(255,56,48,.08)', color: 'var(--danger)', fontSize: 11.5
};
const selectStyle = {
  height: 30, borderRadius: 7, border: '1px solid var(--border-hairline)', background: 'var(--ink-950)',
  color: 'var(--text-primary)', fontSize: 11.5, padding: '0 8px'
};

// Section 27/28: stage legend rail - real, persisted collapse state (workflowMeta.collapsedStages),
// per-stage node counts ("see stage status"), color dot matching each node card's accent strip.
function StageLegend({ lang, rtl, stages, nodes, collapsed, onToggle }) {
  const counts = {};
  nodes.forEach((n) => { counts[n.stageId] = (counts[n.stageId] || 0) + 1; });
  return (
    <div style={{ width: 168, flex: 'none', display: 'flex', flexDirection: 'column', gap: 4, padding: 10, borderRadius: 12, border: '1px solid var(--border-hairline)', background: 'color-mix(in srgb, var(--char-atmosphere) 22%, var(--ink-900))', overflowY: 'auto' }}>
      <span style={{ fontSize: 10.5, color: 'var(--text-dim)', letterSpacing: '.05em', marginBottom: 4 }}>{tr(lang, 'stagesTitle')}</span>
      {stages.map((stage) => (
        <button
          key={stage.id} type="button" onClick={() => onToggle(stage.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '5px 6px', borderRadius: 7, cursor: 'pointer',
            border: '1px solid transparent', background: 'transparent', textAlign: rtl ? 'right' : 'left', opacity: collapsed[stage.id] ? 0.5 : 1
          }}
        >
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: stageColor(stages, stage.id), flex: 'none' }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="auto">{stage.name[lang] || stage.name.en}</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{counts[stage.id] || 0}</span>
          <Icon name={collapsed[stage.id] ? 'ChevronRight' : 'ChevronDown'} size={12} style={{ color: 'var(--text-dim)', flex: 'none' }} />
        </button>
      ))}
    </div>
  );
}

// Section 16's "relation chooser" - a small modal, not a canvas tooltip, so it works the same
// regardless of where on the canvas the connection was dropped.
function RelationPicker({ lang, rtl, onPick, onCancel, registry }) {
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ position: 'fixed', inset: 0, background: 'rgba(3,8,7,.6)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 280, maxHeight: '70vh', overflowY: 'auto', borderRadius: 12, padding: 14, border: '1px solid var(--border-gold)', background: 'var(--ink-950)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'pickRelation')}</span>
        {registry.RELATION_IDS.map((relationId) => (
          <button key={relationId} type="button" onClick={() => onPick(relationId)} style={{ textAlign: rtl ? 'right' : 'left', height: 32, padding: '0 10px', borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'rgba(244,234,215,.04)', color: 'var(--text-primary)', fontSize: 12 }}>
            {registry.relationLabel(relationId, lang)}
          </button>
        ))}
        <button type="button" onClick={onCancel} style={{ height: 32, borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12 }}>{tr(lang, 'cancel')}</button>
      </div>
    </div>
  );
}

// Canonical-editing action contract (this pass's "canonical editing audit"): a node type's
// capabilities.canOpenSource / canQuickEdit (declared in analysis-graph-registry.js, NOT here)
// decide what the Inspector offers - it never branches on node.type itself for this. canQuickEdit
// routes through QUICK_EDIT_ADAPTERS below, keyed by type id: adding a future canonical editor
// means registering one more entry there, never touching Inspector's own rendering logic.
// - Scenario: real quick-edit (status) through the EXISTING updateScenario() mutator, plus
//   "Open source" into the Desk's full ScenarioEditor for deeper edits - one canonical mutation
//   path, not two.
// - Trade: "Open source" opens the real navrya-src/tradeDetailsModal.jsx via its own
//   self-contained openTradeDetails(id) (already reused across character-app.jsx) - audited this
//   pass; not read-only by default assumption.
// - Note: quick-edit is the ONLY editor (a Note has no canonical form to jump to - the Map itself
//   owns its content).
// - Processing nodes: quick-edit their config (the same schema-driven form node CREATION uses).
// - Pattern: neither - audited and confirmed no safe existing-editor integration exists
//   (PatternDetailsTab lives inside strategiesHubView.jsx's own tab state, not a self-contained
//   opener; wrapping it would mean building a new editor, which section 3 explicitly forbids).
function ScenarioQuickEdit({ session, registry, lang, sourceRecord, actions }) {
  if (!sourceRecord) return null;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'scenarioStatus')}</span>
      <select
        value={sourceRecord.status || 'pending'} style={selectStyle}
        onChange={(e) => {
          const ownerEntryId = registry.findScenarioOwnerEntryId(sourceRecord.id, session);
          const entry = (session.entries || []).find((en) => en.id === ownerEntryId);
          if (entry) actions.onUpdateScenario(entry, sourceRecord, { status: e.target.value });
        }}
      >
        {SCENARIO_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
    </label>
  );
}
function NoteQuickEdit({ node, lang, actions }) {
  const [value, setValue] = React.useState(node.content || '');
  React.useEffect(() => setValue(node.content || ''), [node.id, node.content]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <textarea
        value={value} onChange={(e) => setValue(e.target.value)} rows={3} dir="auto"
        style={{ borderRadius: 7, border: '1px solid var(--border-hairline)', background: 'var(--ink-950)', color: 'var(--text-primary)', fontSize: 12, padding: 8, resize: 'vertical' }}
      />
      <button type="button" onClick={() => actions.onUpdateNoteContent(node.id, value)} disabled={value === node.content} style={{ ...secondaryBtnStyle, opacity: value === node.content ? 0.5 : 1 }}>{tr(lang, 'save')}</button>
    </div>
  );
}
function ProcessingQuickEdit({ node, registry, lang, actions }) {
  const typeDef = registry.NODE_TYPES[node.type];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'processingConfig')}</span>
      <ConfigFieldsForm schema={typeDef.configSchema || { fields: [] }} lang={lang} initial={node.config} onSave={(config) => actions.onUpdateProcessingConfig(node.id, config)} saveLabel={tr(lang, 'save')} />
    </div>
  );
}
const QUICK_EDIT_ADAPTERS = {
  sessionScenario: ScenarioQuickEdit, note: NoteQuickEdit,
  marketStructure: ProcessingQuickEdit, confluence: ProcessingQuickEdit, aiAnalysis: ProcessingQuickEdit
};

// Section 18's Inspector - generic over node type, reading only capabilities.canOpenSource/
// canQuickEdit off the registry and QUICK_EDIT_ADAPTERS above. No `if (node.type === ...)`
// branch exists in this component itself (verified by a source-text test).
function Inspector({ lang, rtl, registry, session, graph, node, edge, onClose, onOpenSource, onRemoveNode, onRemoveEdge, onChangeNodeStage, actions }) {
  const sourceRecord = node && node.origin === 'reference' ? registry.resolveNodeSource(node.source, session) : null;
  const typeDef = node && registry.NODE_TYPES[node.type];
  const QuickEdit = typeDef && QUICK_EDIT_ADAPTERS[node.type];
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ width: 230, flex: 'none', display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, border: '1px solid var(--border-hairline)', background: 'color-mix(in srgb, var(--char-atmosphere) 30%, var(--ink-900))', overflowY: 'auto' }}>
      {node && typeDef && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'inspectorTitle')}</span>
            <button type="button" onClick={onClose} style={{ ...miniBtnStyle, width: 24, height: 24 }}><Icon name="X" size={12} /></button>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(lang, 'inspectorType')}: {registry.nodeTypeTitle(node.type, lang)}</span>

          {node.origin === 'reference' && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(lang, 'inspectorStatus')}: {sourceRecord ? (sourceRecord.status || node.status) : tr(lang, 'sourceUnavailable')}</span>
          )}
          {node.origin === 'derived' && (
            <span style={{ fontSize: 11, color: 'var(--warning)' }}>{tr(lang, 'inspectorStatus')}: {tr(lang, 'executionUnavailable')}</span>
          )}

          {typeDef.capabilities.canQuickEdit && QuickEdit && (
            <QuickEdit node={node} session={session} registry={registry} lang={lang} sourceRecord={sourceRecord} actions={actions} />
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'inspectorStage')}</span>
            <select value={node.stageId} style={selectStyle} onChange={(e) => onChangeNodeStage(node.id, e.target.value)}>
              {graph.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name[lang] || stage.name.en}</option>)}
            </select>
          </label>

          {typeDef.capabilities.canOpenSource && sourceRecord && (
            <button type="button" onClick={() => onOpenSource(node)} style={secondaryBtnStyle}><Icon name="ExternalLink" size={13} />{tr(lang, 'openSource')}</button>
          )}
          <button type="button" onClick={() => { onRemoveNode(node.id); onClose(); }} style={dangerBtnStyle}><Icon name="Trash2" size={13} />{tr(lang, 'removeFromMap')}</button>
        </>
      )}
      {edge && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'edgeInspectorTitle')}</span>
            <button type="button" onClick={onClose} style={{ ...miniBtnStyle, width: 24, height: 24 }}><Icon name="X" size={12} /></button>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{registry.relationLabel(edge.relation, lang)}</span>
          <button type="button" onClick={() => { onRemoveEdge(edge.id); onClose(); }} style={dangerBtnStyle}><Icon name="Trash2" size={13} />{tr(lang, 'removeEdge')}</button>
        </>
      )}
    </div>
  );
}

// Section 8's multi-select bulk actions - shown instead of the single-node Inspector whenever
// 2+ nodes/edges are selected (box-select or shift-click). Deliberately minimal: bulk remove and
// bulk "move every selected node to this stage" - no per-node detail, that's what selecting one
// node alone (collapsing back out of bulk mode) is for.
function BulkInspector({ lang, rtl, graph, nodeCount, edgeCount, onClose, onRemove, onChangeStage }) {
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ width: 230, flex: 'none', display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, border: '1px solid var(--border-hairline)', background: 'color-mix(in srgb, var(--char-atmosphere) 30%, var(--ink-900))' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'bulkTitle')} ({nodeCount + edgeCount})</span>
        <button type="button" onClick={onClose} style={{ ...miniBtnStyle, width: 24, height: 24 }}><Icon name="X" size={12} /></button>
      </div>
      {nodeCount > 0 && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'bulkChangeStage')}</span>
          <select defaultValue="" style={selectStyle} onChange={(e) => { if (e.target.value) onChangeStage(e.target.value); }}>
            <option value="" disabled>{tr(lang, 'inspectorStage')}</option>
            {graph.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name[lang] || stage.name.en}</option>)}
          </select>
        </label>
      )}
      <button type="button" onClick={onRemove} style={dangerBtnStyle}><Icon name="Trash2" size={13} />{tr(lang, 'bulkRemove')}</button>
    </div>
  );
}

// Section 8's minimap: a small fixed overview of every visible node's position within the
// graph's own bounding box, plus the current viewport as a rectangle - click anywhere on it to
// pan there. Purely derived from node positions/viewport already in scope; no separate state.
const MINIMAP_SIZE = 128;
function Minimap({ nodes, positionOf, viewport, containerRef, onPan }) {
  if (nodes.length === 0) return null;
  const positions = nodes.map(positionOf);
  const minX = Math.min(...positions.map((p) => p.x)) - 40, maxX = Math.max(...positions.map((p) => p.x)) + NODE_WIDTH + 40;
  const minY = Math.min(...positions.map((p) => p.y)) - 40, maxY = Math.max(...positions.map((p) => p.y)) + 80;
  const worldW = Math.max(1, maxX - minX), worldH = Math.max(1, maxY - minY);
  const scale = Math.min(MINIMAP_SIZE / worldW, MINIMAP_SIZE / worldH);
  const toMini = (x, y) => ({ x: (x - minX) * scale, y: (y - minY) * scale });

  const rect = containerRef.current ? containerRef.current.getBoundingClientRect() : { width: 0, height: 0 };
  const viewTopLeft = toMini((0 - viewport.x) / viewport.zoom, (0 - viewport.y) / viewport.zoom);
  const viewBottomRight = toMini((rect.width - viewport.x) / viewport.zoom, (rect.height - viewport.y) / viewport.zoom);

  function onClick(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const miniX = e.clientX - box.left, miniY = e.clientY - box.top;
    const worldX = minX + miniX / scale, worldY = minY + miniY / scale;
    onPan({ x: rect.width / 2 - worldX * viewport.zoom, y: rect.height / 2 - worldY * viewport.zoom, zoom: viewport.zoom });
  }

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute', insetInlineEnd: 10, bottom: 10, width: MINIMAP_SIZE, height: MINIMAP_SIZE, borderRadius: 8, overflow: 'hidden',
        border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.85)', cursor: 'pointer'
      }}
    >
      {nodes.map((node) => {
        const pos = toMini(positionOf(node).x, positionOf(node).y);
        return <span key={node.id} style={{ position: 'absolute', left: pos.x, top: pos.y, width: 4, height: 4, borderRadius: '50%', background: 'var(--char-accent)' }} />;
      })}
      <div style={{
        position: 'absolute', left: Math.max(0, viewTopLeft.x), top: Math.max(0, viewTopLeft.y),
        width: Math.max(2, Math.min(MINIMAP_SIZE, viewBottomRight.x) - Math.max(0, viewTopLeft.x)),
        height: Math.max(2, Math.min(MINIMAP_SIZE, viewBottomRight.y) - Math.max(0, viewTopLeft.y)),
        border: '1px solid var(--char-accent)', background: 'rgba(214,175,107,.10)', pointerEvents: 'none'
      }} />
    </div>
  );
}

// Section 1/48: the categorized node-creation picker - click-to-add (toolbar), context-menu
// (right-click canvas), and drag-from-picker (items below are draggable; dropping on the canvas
// re-opens this same menu anchored at the drop point via the 'drop' mode/presetType, skipping
// straight to the chosen type's sub-step). Canonical types route through the real existing
// creation pipeline passed in as props (never a second persistence path); Pattern/Trade need an
// existing record to attach to/reference, shown as their own picker sub-step.
function NodeCreationMenu({
  lang, rtl, registry, session, graph, menu, onClose,
  onCreateScenario, onCreateEntry, onCreateTrade, onCreatePatternRef, onCreateNote, onCreateProcessing
}) {
  const [typeId, setTypeId] = React.useState(menu.presetType || null);
  const stageIds = graph.stages.map((s) => s.id);
  const [stageId, setStageId] = React.useState(typeId ? registry.defaultStageIdForType(typeId, stageIds) : null);

  function chooseType(id) { setTypeId(id); setStageId(registry.defaultStageIdForType(id, stageIds)); }

  const byCategory = {};
  Object.keys(registry.NODE_TYPES).forEach((id) => {
    const def = registry.NODE_TYPES[id];
    byCategory[def.category] = (byCategory[def.category] || []).concat([id]);
  });

  const stageSelect = typeId && (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'targetStage')}</span>
      <select value={stageId} style={selectStyle} onChange={(e) => setStageId(e.target.value)}>
        {graph.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name[lang] || stage.name.en}</option>)}
      </select>
    </label>
  );

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ position: 'fixed', inset: 0, background: 'rgba(3,8,7,.6)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 320, maxHeight: '78vh', overflowY: 'auto', borderRadius: 12, padding: 14, border: '1px solid var(--border-gold)', background: 'var(--ink-950)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!typeId && (
          <>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'pickType')}</span>
            {Object.keys(registry.CATEGORIES).filter((c) => byCategory[c]).map((categoryId) => (
              <div key={categoryId} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '.05em' }}>{registry.categoryLabel(categoryId, lang)}</span>
                {byCategory[categoryId].map((id) => (
                  <button
                    key={id} type="button" draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/analysis-graph-node-type', id)}
                    onClick={() => chooseType(id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 10px', borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'rgba(244,234,215,.04)', color: 'var(--text-primary)', fontSize: 12, textAlign: rtl ? 'right' : 'left' }}
                  >
                    <Icon name={registry.NODE_TYPES[id].icon} size={14} style={{ color: 'var(--char-accent)', flex: 'none' }} />
                    {registry.nodeTypeTitle(id, lang)}
                  </button>
                ))}
              </div>
            ))}
          </>
        )}

        {typeId === 'sessionScenario' && (
          <ScenarioEntryPicker lang={lang} rtl={rtl} session={session} stageSelect={stageSelect}
            onBack={() => setTypeId(null)} onPick={(entryId) => { onCreateScenario(entryId, stageId); onClose(); }} />
        )}
        {typeId === 'sessionEntry' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stageSelect}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { onCreateEntry('chart', stageId); onClose(); }} style={secondaryBtnStyle}>{tr(lang, 'chartEntry')}</button>
              <button type="button" onClick={() => { onCreateEntry('movement', stageId); onClose(); }} style={secondaryBtnStyle}>{tr(lang, 'movementEntry')}</button>
            </div>
            <button type="button" onClick={() => setTypeId(null)} style={{ ...miniBtnStyle, width: 'auto', padding: '0 10px' }}>{tr(lang, 'back')}</button>
          </div>
        )}
        {typeId === 'trade' && (
          <TradeScenarioPicker lang={lang} rtl={rtl} session={session} stageSelect={stageSelect}
            onBack={() => setTypeId(null)} onPick={(scenario) => { onCreateTrade(scenario, stageId); onClose(); }} />
        )}
        {typeId === 'pattern' && (
          <PatternPicker lang={lang} rtl={rtl} stageSelect={stageSelect}
            onBack={() => setTypeId(null)} onPick={(patternId) => { onCreatePatternRef(patternId, stageId); onClose(); }} />
        )}
        {typeId === 'note' && (
          <NoteForm lang={lang} rtl={rtl} stageSelect={stageSelect}
            onBack={() => setTypeId(null)} onCreate={(content) => { onCreateNote(content, stageId); onClose(); }} />
        )}
        {typeId && registry.NODE_TYPES[typeId].origin === 'derived' && (
          <ProcessingForm lang={lang} rtl={rtl} typeId={typeId} registry={registry} stageSelect={stageSelect}
            onBack={() => setTypeId(null)} onCreate={(config) => { onCreateProcessing(typeId, config, stageId); onClose(); }} />
        )}

        {!typeId && <button type="button" onClick={onClose} style={{ height: 32, borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12 }}>{tr(lang, 'cancel')}</button>}
      </div>
    </div>
  );
}

function ScenarioEntryPicker({ lang, rtl, session, stageSelect, onBack, onPick }) {
  const entries = session.entries || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stageSelect}
      <span style={{ fontSize: 11.5, color: 'var(--text-primary)' }}>{tr(lang, 'pickEntryForScenario')}</span>
      {entries.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(lang, 'noEntries')}</span>}
      {entries.map((entry) => (
        <button key={entry.id} type="button" onClick={() => onPick(entry.id)} style={{ textAlign: rtl ? 'right' : 'left', height: 32, padding: '0 10px', borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'rgba(244,234,215,.04)', color: 'var(--text-primary)', fontSize: 12 }}>
          {entry.type}{entry.timeframe ? ' · ' + entry.timeframe : ''}
        </button>
      ))}
      <button type="button" onClick={onBack} style={{ ...miniBtnStyle, width: 'auto', padding: '0 10px' }}>{tr(lang, 'back')}</button>
    </div>
  );
}

function TradeScenarioPicker({ lang, rtl, session, stageSelect, onBack, onPick }) {
  const scenarios = (session.entries || []).flatMap((entry) => (entry.scenarios || []).map((scenario) => ({ scenario, entry })));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stageSelect}
      <span style={{ fontSize: 11.5, color: 'var(--text-primary)' }}>{tr(lang, 'pickScenarioForTrade')}</span>
      {scenarios.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(lang, 'noScenarios')}</span>}
      {scenarios.map(({ scenario }) => (
        <button key={scenario.id} type="button" onClick={() => onPick(scenario)} style={{ textAlign: rtl ? 'right' : 'left', height: 32, padding: '0 10px', borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'rgba(244,234,215,.04)', color: 'var(--text-primary)', fontSize: 12 }}>
          {scenario.title || scenario.id}
        </button>
      ))}
      <button type="button" onClick={onBack} style={{ ...miniBtnStyle, width: 'auto', padding: '0 10px' }}>{tr(lang, 'back')}</button>
    </div>
  );
}

function PatternPicker({ lang, rtl, stageSelect, onBack, onPick }) {
  const patternStore = window.TradeJournalPatternStore;
  const patterns = (patternStore && patternStore.listSync()) || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stageSelect}
      <span style={{ fontSize: 11.5, color: 'var(--text-primary)' }}>{tr(lang, 'pickPattern')}</span>
      {patterns.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(lang, 'noPatterns')}</span>}
      {patterns.map((pattern) => (
        <button key={pattern.id} type="button" onClick={() => onPick(pattern.id)} style={{ textAlign: rtl ? 'right' : 'left', height: 32, padding: '0 10px', borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'rgba(244,234,215,.04)', color: 'var(--text-primary)', fontSize: 12 }}>
          {pattern.name}
        </button>
      ))}
      <button type="button" onClick={onBack} style={{ ...miniBtnStyle, width: 'auto', padding: '0 10px' }}>{tr(lang, 'back')}</button>
    </div>
  );
}

function NoteForm({ lang, rtl, stageSelect, onBack, onCreate }) {
  const [content, setContent] = React.useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stageSelect}
      <textarea
        value={content} onChange={(e) => setContent(e.target.value)} placeholder={tr(lang, 'notePlaceholder')} rows={3} dir="auto"
        style={{ borderRadius: 7, border: '1px solid var(--border-hairline)', background: 'var(--ink-950)', color: 'var(--text-primary)', fontSize: 12, padding: 8, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => onCreate(content)} disabled={!content.trim()} style={{ ...secondaryBtnStyle, flex: 1, opacity: content.trim() ? 1 : 0.5 }}>{tr(lang, 'create')}</button>
        <button type="button" onClick={onBack} style={{ ...miniBtnStyle, width: 'auto', padding: '0 10px' }}>{tr(lang, 'back')}</button>
      </div>
    </div>
  );
}

// Section 32: a processing node's configuration form, driven entirely by a NODE_TYPES
// configSchema.fields - no per-type special-casing, so a future processing type only needs a
// registry entry. Shared verbatim between node CREATION (ProcessingForm below) and the
// Inspector's post-creation quick-edit (ProcessingQuickEdit, above) - one field-rendering
// implementation, not two.
function ConfigFieldsForm({ schema, lang, initial, onSave, saveLabel }) {
  const [config, setConfig] = React.useState(initial || {});
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(schema.fields || []).map((field) => (
        <label key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{field.label[lang] || field.label.en}</span>
          {field.type === 'select' ? (
            <select style={selectStyle} value={config[field.key] || ''} onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}>
              <option value="" />
              {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : (
            <input type="text" dir="auto" style={{ ...selectStyle }} value={config[field.key] || ''} onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))} />
          )}
        </label>
      ))}
      <button type="button" onClick={() => onSave(config)} style={secondaryBtnStyle}>{saveLabel}</button>
    </div>
  );
}
function ProcessingForm({ lang, rtl, typeId, registry, stageSelect, onBack, onCreate }) {
  const schema = registry.NODE_TYPES[typeId].configSchema || { fields: [] };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stageSelect}
      <ConfigFieldsForm schema={schema} lang={lang} initial={{}} onSave={onCreate} saveLabel={tr(lang, 'create')} />
      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{tr(lang, 'executionUnavailable')}</span>
      <button type="button" onClick={onBack} style={{ ...miniBtnStyle, width: 'auto', padding: '0 10px' }}>{tr(lang, 'back')}</button>
    </div>
  );
}
