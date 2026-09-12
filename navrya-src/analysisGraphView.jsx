import React from 'react';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { AnalysisGraphCanvas } from './analysisGraphCanvas.jsx';

// "نقشه تحلیل" (Analysis Map) - Session tab beside the Analysis Desk ("میز تحلیل",
// AnalysisWorkspaceBoard in liveSessionView.jsx). See public/pages/shared/analysis-graph-
// registry.js's header comment for the full scope note and the "Analysis Map" name-collision
// context (an unrelated existing chart-overlay feature already uses that English phrase
// internally - this tab's own internal ids all say "graph", matching the registry).
//
// Two representations of the exact same session.analysisGraph (spec section 54: "Canvas is an
// interface, not the only representation of the data"):
//  - List mode (this file's own JSX below): the accessible baseline. Also the only place a node
//    can be CREATED - a plain "add to map" pick list (section 50) over the session's real
//    entries/scenarios, never a canvas drag.
//  - Canvas mode (analysisGraphCanvas.jsx): free positioning, pan/zoom, drag-to-connect edges,
//    an Inspector. Positions/edges only exist once a node has been added from List mode first.
// Every node is origin:'reference': it points at a real session.entries[]/[].scenarios[] record
// and is never a copy of it (resolved live via resolveNodeSource() every render - the "no
// duplicate canonical data" rule).
//
// Like every other view file in navrya-src, this owns its own local copy/tr() i18n pair rather
// than importing a shared one - see liveSessionView.jsx's own copy{} for the identical pattern.
const copy = {
  fa: {
    onMapTitle: 'روی نقشه', onMapEmpty: 'هنوز گرهی به نقشه اضافه نشده.',
    onMapEmptyHint: 'از فهرست پایین، ورودی یا سناریویی را به نقشه اضافه کنید.',
    addTitle: 'افزودن به نقشه', addButton: 'افزودن', alreadyAdded: 'روی نقشه است',
    openSource: 'باز کردن منبع', removeFromMap: 'حذف از نقشه',
    entriesGroup: 'ورودی‌های سشن', scenariosGroup: 'سناریوها', noEntries: 'این سشن هنوز ورودی‌ای ندارد.',
    sourceUnavailable: 'منبع این گره دیگر در دسترس نیست.',
    entryTypeChart: 'چارت', entryTypeMovement: 'حرکت', entryTypeFate: 'سرنوشت',
    modeList: 'فهرست', modeCanvas: 'نقشه تصویری',
    guideButton: 'راهنما', guideTitle: 'راهنمای نقشه تحلیل', guideClose: 'بستن',
    guideIntro: 'نقشه تحلیل به شما کمک می‌کند مسیر استدلال معامله‌تان را به‌صورت تصویری بسازید: شواهد بازار را وارد کنید، آن‌ها را با فلش‌های معنادار به هم وصل کنید، سناریو و تصمیم بسازید و در پایان نتیجه را ثبت کنید. هر گره روی نقشه یا به داده واقعی همین سشن اشاره می‌کند یا خودتان آن را دستی نوشته‌اید؛ هیچ‌چیز کپی یا جعلی نیست.',
    guideNodeTypesTitle: 'انواع گره', guideStagesTitle: 'مراحل تحلیل',
    guideStagesIntro: 'هر گره در یکی از این ۸ مرحله قرار می‌گیرد؛ نوار رنگی سمت گره نشان‌دهنده مرحله آن است.'
  },
  ar: {
    onMapTitle: 'على الخريطة', onMapEmpty: 'لم تتم إضافة أي عقدة إلى الخريطة بعد.',
    onMapEmptyHint: 'من القائمة أدناه، أضف إدخالًا أو سيناريو إلى الخريطة.',
    addTitle: 'إضافة إلى الخريطة', addButton: 'إضافة', alreadyAdded: 'على الخريطة',
    openSource: 'فتح المصدر', removeFromMap: 'إزالة من الخريطة',
    entriesGroup: 'إدخالات الجلسة', scenariosGroup: 'السيناريوهات', noEntries: 'لا توجد إدخالات في هذه الجلسة بعد.',
    sourceUnavailable: 'مصدر هذه العقدة لم يعد متاحًا.',
    entryTypeChart: 'مخطط', entryTypeMovement: 'حركة', entryTypeFate: 'المصير',
    modeList: 'القائمة', modeCanvas: 'الخريطة المرئية',
    guideButton: 'دليل', guideTitle: 'دليل خريطة التحليل', guideClose: 'إغلاق',
    guideIntro: 'تساعدك خريطة التحليل على بناء مسار تفكيرك في الصفقة بشكل مرئي: أضف أدلة السوق، اربطها بأسهم ذات معنى، ابنِ سيناريو وقرارًا، وسجّل النتيجة في النهاية. كل عقدة على الخريطة إما تشير إلى بيانات حقيقية من هذه الجلسة أو كتبتها أنت يدويًا؛ لا شيء منسوخ أو ملفّق.',
    guideNodeTypesTitle: 'أنواع العقد', guideStagesTitle: 'مراحل التحليل',
    guideStagesIntro: 'تقع كل عقدة في إحدى هذه المراحل الثماني؛ الشريط الملوّن بجانب العقدة يوضّح مرحلتها.'
  },
  en: {
    onMapTitle: 'On the map', onMapEmpty: 'No node has been added to the map yet.',
    onMapEmptyHint: 'From the list below, add an entry or scenario to the map.',
    addTitle: 'Add to map', addButton: 'Add', alreadyAdded: 'On map',
    openSource: 'Open source', removeFromMap: 'Remove from map',
    entriesGroup: 'Session entries', scenariosGroup: 'Scenarios', noEntries: 'This session has no entries yet.',
    sourceUnavailable: "This node's source is no longer available.",
    entryTypeChart: 'Chart', entryTypeMovement: 'Movement', entryTypeFate: 'Fate',
    modeList: 'List', modeCanvas: 'Canvas',
    guideButton: 'Guide', guideTitle: 'Analysis Map guide', guideClose: 'Close',
    guideIntro: 'The Analysis Map helps you build your trade reasoning visually: bring in real market evidence, connect it with meaningful arrows, build a scenario and a decision, then log the outcome. Every node on the map either points at real data from this session or is something you wrote yourself - nothing is copied or fabricated.',
    guideNodeTypesTitle: 'Node types', guideStagesTitle: 'Analysis stages',
    guideStagesIntro: 'Every node lives in one of these 8 stages; the colored strip on the side of a node shows which one.'
  },
  es: {
    onMapTitle: 'En el mapa', onMapEmpty: 'Todavía no se agregó ningún nodo al mapa.',
    onMapEmptyHint: 'Desde la lista de abajo, agrega una entrada o un escenario al mapa.',
    addTitle: 'Agregar al mapa', addButton: 'Agregar', alreadyAdded: 'En el mapa',
    openSource: 'Abrir origen', removeFromMap: 'Quitar del mapa',
    entriesGroup: 'Entradas de la sesión', scenariosGroup: 'Escenarios', noEntries: 'Esta sesión todavía no tiene entradas.',
    sourceUnavailable: 'El origen de este nodo ya no está disponible.',
    entryTypeChart: 'Gráfico', entryTypeMovement: 'Movimiento', entryTypeFate: 'Destino',
    modeList: 'Lista', modeCanvas: 'Mapa visual',
    guideButton: 'Guía', guideTitle: 'Guía del mapa de análisis', guideClose: 'Cerrar',
    guideIntro: 'El Mapa de análisis te ayuda a construir el razonamiento de tu operación de forma visual: agrega evidencia real del mercado, conéctala con flechas con significado, construye un escenario y una decisión, y al final registra el resultado. Cada nodo del mapa apunta a datos reales de esta sesión o es algo que tú mismo escribiste; nada se copia ni se inventa.',
    guideNodeTypesTitle: 'Tipos de nodo', guideStagesTitle: 'Etapas del análisis',
    guideStagesIntro: 'Cada nodo pertenece a una de estas 8 etapas; la franja de color al costado del nodo indica cuál.'
  }
};
function tr(lang, key) { return (copy[lang] && copy[lang][key]) || copy.en[key] || key; }

const ENTRY_TYPE_ICON = { chart: 'Image', movement: 'Activity', fate: 'Flag' };
const ENTRY_TYPE_KEY = { chart: 'entryTypeChart', movement: 'entryTypeMovement', fate: 'entryTypeFate' };

// Trader feedback (2026-09-12): a real educational Guide, not a new data source - node type
// names/descriptions come straight from analysis-graph-registry.js's own real NODE_TYPES/
// CATEGORIES (already localized in all 4 languages, since the node-creation menu already needs
// them), so this component only ever ADDS the short stage descriptions below, never a second
// definition of what a node type is or does.
const STAGE_DESCRIPTIONS = {
  preparation: { fa: 'حالت ذهنی و آمادگی شما پیش از شروع تحلیل.', ar: 'حالتك الذهنية واستعدادك قبل بدء التحليل.', en: 'Your mindset and readiness before you start analyzing.', es: 'Tu estado mental y preparación antes de empezar a analizar.' },
  evidence: { fa: 'چارت‌ها، حرکت‌های قیمت و الگوهایی که مشاهده کرده‌اید.', ar: 'المخططات وحركات السعر والأنماط التي لاحظتها.', en: 'Charts, price movements and patterns you observed.', es: 'Gráficos, movimientos de precio y patrones que observaste.' },
  observation: { fa: 'برداشت و تحلیل شما از شواهد بالا.', ar: 'استنتاجك وتحليلك من الأدلة أعلاه.', en: 'Your reading and analysis of the evidence above.', es: 'Tu lectura y análisis de la evidencia anterior.' },
  thesis: { fa: 'ایده اصلی شما درباره جهت احتمالی بازار.', ar: 'فكرتك الرئيسية حول الاتجاه المحتمل للسوق.', en: 'Your main idea about where the market is likely headed.', es: 'Tu idea principal sobre hacia dónde se dirige probablemente el mercado.' },
  scenarios: { fa: 'سناریوهای واقعی این سشن - همان‌هایی که در میز تحلیل می‌سازید.', ar: 'السيناريوهات الحقيقية لهذه الجلسة - نفسها التي تبنيها في مكتب التحليل.', en: 'The real Scenarios for this session - the same ones you build on the Analysis Desk.', es: 'Los escenarios reales de esta sesión, los mismos que creas en el Escritorio de análisis.' },
  risk: { fa: 'نقطه ورود، ابطال سناریو و میزان ریسک قابل قبول.', ar: 'نقطة الدخول وإبطال السيناريو ومستوى المخاطرة المقبول.', en: 'Your trigger to enter, what would invalidate the scenario, and how much risk is acceptable.', es: 'Tu disparador de entrada, qué invalidaría el escenario y cuánto riesgo es aceptable.' },
  decision: { fa: 'تصمیم نهایی و معامله واقعی ثبت‌شده.', ar: 'قرارك النهائي والصفقة الحقيقية المسجّلة.', en: 'Your final decision and the real logged Trade.', es: 'Tu decisión final y la operación real registrada.' },
  outcome: { fa: 'نتیجه واقعی و درسی که از این تحلیل گرفتید.', ar: 'النتيجة الحقيقية والدرس الذي استفدته من هذا التحليل.', en: 'The real outcome and the lesson you took from this analysis.', es: 'El resultado real y la lección que sacaste de este análisis.' }
};

// Categorized exactly like the canvas's own NodeCreationMenu (registry.CATEGORIES order, only
// categories with at least one registered type) - never a second/different grouping.
function GuideModal({ lang, rtl, onClose }) {
  const registry = window.TradeJournalAnalysisGraphRegistry;
  if (!registry) return null;
  const byCategory = {};
  Object.keys(registry.NODE_TYPES).forEach((id) => {
    const def = registry.NODE_TYPES[id];
    byCategory[def.category] = (byCategory[def.category] || []).concat([id]);
  });
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ position: 'fixed', inset: 0, background: 'rgba(3,8,7,.65)', display: 'grid', placeItems: 'center', zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: '92vw', maxHeight: '82vh', overflowY: 'auto', borderRadius: 14, padding: 18, border: '1px solid var(--border-gold)', background: 'var(--ink-950)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{tr(lang, 'guideTitle')}</span>
          <button type="button" onClick={onClose} style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)' }}><Icon name="X" size={14} /></button>
        </div>
        <p dir="auto" style={{ margin: 0, fontSize: 13, lineHeight: '22px', color: 'var(--text-primary)' }}>{tr(lang, 'guideIntro')}</p>

        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--char-accent)', letterSpacing: '.03em' }}>{tr(lang, 'guideNodeTypesTitle')}</span>
        {Object.keys(registry.CATEGORIES).filter((c) => byCategory[c]).map((categoryId) => (
          <div key={categoryId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '.05em' }}>{registry.categoryLabel(categoryId, lang)}</span>
            {byCategory[categoryId].map((typeId) => {
              const def = registry.NODE_TYPES[typeId];
              return (
                <div key={typeId} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, flex: 'none', background: 'rgba(244,234,215,.06)', color: 'var(--char-accent)' }}>
                    <Icon name={def.icon} size={15} />
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span dir="auto" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{registry.nodeTypeTitle(typeId, lang)}</span>
                    <span dir="auto" style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: '17px' }}>{def.description[lang] || def.description.en}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ))}

        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--char-accent)', letterSpacing: '.03em' }}>{tr(lang, 'guideStagesTitle')}</span>
        <p dir="auto" style={{ margin: 0, fontSize: 11.5, color: 'var(--text-muted)' }}>{tr(lang, 'guideStagesIntro')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {registry.DEFAULT_STAGES.map((stage, index) => (
            <div key={stage.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', marginTop: 5, flex: 'none', background: ['#8b7fd6', '#5aa9e6', '#4fb0a5', '#7cb342', '#d6b34f', '#e08a4f', '#d65f6b', '#a06bd6'][index % 8] }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span dir="auto" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{stage.name[lang] || stage.name.en}</span>
                <span dir="auto" style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: '17px' }}>{(STAGE_DESCRIPTIONS[stage.id] && (STAGE_DESCRIPTIONS[stage.id][lang] || STAGE_DESCRIPTIONS[stage.id].en)) || ''}</span>
              </span>
            </div>
          ))}
        </div>

        <button type="button" onClick={onClose} style={{ height: 34, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12.5 }}>{tr(lang, 'guideClose')}</button>
      </div>
    </div>
  );
}

// REAL BUG FOUND VIA LIVE BROWSER VERIFICATION (RTL/Persian pass), FIXED: this used to treat
// EVERY node with no resolvable source as "unavailable" - including manual (Note) and derived
// (processing) nodes, which never had a source to resolve in the first place, so a freshly
// created Note showed a false "این گره دیگر در دسترس نیست" / "source no longer available"
// warning immediately. "Unavailable" is only meaningful for origin:'reference' nodes. Now shares
// the exact same registry-driven typeDef.display.title/status() functions
// analysisGraphCanvas.jsx's nodeDisplay() uses, instead of its own separate (and buggy)
// scenario/entry-only logic - List and Canvas can never drift apart on what a node's title/
// status actually is. "Open source" is also now gated on capabilities.canOpenSource (a resolved
// Pattern node, which has no safe existing editor, must never show a working-looking button that
// does nothing).
function NodeRow({ node, session, lang, onOpenSource, onRemoveNode, imageUrls }) {
  const registry = window.TradeJournalAnalysisGraphRegistry;
  if (!registry) return null;
  const typeDef = registry.NODE_TYPES[node.type];
  const sourceRecord = node.origin === 'reference' ? registry.resolveNodeSource(node.source, session) : null;
  const unavailable = node.origin === 'reference' && !sourceRecord;
  const display = typeDef ? { title: typeDef.display.title(sourceRecord, node, lang, typeDef), status: typeDef.display.status(sourceRecord, node) } : { title: node.title || node.id, status: null };
  const icon = (typeDef && typeDef.icon) || 'Box';
  const canOpenSource = typeDef && typeDef.capabilities.canOpenSource && sourceRecord;
  // Same registry seam the canvas card uses (analysis-graph-registry.js's DISPLAY.sessionEntry.
  // imageEntryId) - List mode gets the real chart thumbnail too, never a second implementation.
  const imageEntryId = typeDef && typeDef.display.imageEntryId ? typeDef.display.imageEntryId(sourceRecord, node) : null;
  const thumbnailUrl = imageEntryId && imageUrls ? imageUrls[imageEntryId] : null;
  return (
    <Panel variant="raised" radius={10} padding="10px 12px" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" style={{ width: 40, height: 40, borderRadius: 7, objectFit: 'cover', flex: 'none', border: '1px solid var(--border-hairline)' }} />
      ) : (
        <Icon name={icon} size={16} style={{ color: unavailable ? 'var(--text-dim)' : 'var(--char-accent)', flex: 'none' }} />
      )}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, color: unavailable ? 'var(--text-dim)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="auto">{display.title}</span>
        {unavailable && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{tr(lang, 'sourceUnavailable')}</span>}
        {!unavailable && display.status && <Chip tone={node.origin === 'derived' ? 'warning' : 'neutral'}>{display.status}</Chip>}
      </span>
      {canOpenSource && (
        <button type="button" title={tr(lang, 'openSource')} onClick={() => onOpenSource(node)} style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', flex: 'none' }}>
          <Icon name="ExternalLink" size={14} />
        </button>
      )}
      <button type="button" title={tr(lang, 'removeFromMap')} onClick={() => onRemoveNode(node.id)} style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', flex: 'none' }}>
        <Icon name="X" size={14} />
      </button>
    </Panel>
  );
}

function AddRow({ label, icon, added, onAdd, lang }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px' }}>
      <Icon name={icon} size={15} style={{ color: 'var(--text-muted)', flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="auto">{label}</span>
      {added ? (
        <Chip tone="accent" dot>{tr(lang, 'alreadyAdded')}</Chip>
      ) : (
        <Button variant="ghost" size="sm" icon="Plus" onClick={onAdd}>{tr(lang, 'addButton')}</Button>
      )}
    </div>
  );
}

export function AnalysisGraphView({
  session, lang, rtl, onAddNode, onRemoveNode, onOpenSource,
  onMoveNode, onMoveNodes, onSetViewport, onAddEdge, onRemoveEdge,
  onChangeNodeStage, onToggleStageCollapsed, onUpdateScenario, onUpdateNoteContent, onUpdateProcessingConfig,
  onCreateScenario, onCreateEntry, onCreateTrade, onCreatePatternRef, onCreateNote, onCreateProcessing,
  onCreateMarketContext, marketChartComponent, resolveMarketSymbol, resolveMarketInterval,
  onRunAiNode, onApplyAiSuggestion, onClearAiResult, imageUrls
}) {
  const registry = window.TradeJournalAnalysisGraphRegistry;
  const graph = registry ? registry.normalizeAnalysisGraph(session.analysisGraph) : { nodes: [], edges: [] };
  const nodes = graph.nodes || [];
  const isOnMap = (type, id) => nodes.some((n) => n.source && n.source.type === type && n.source.id === id);
  const entries = session.entries || [];
  // Local UI-only preference, not persisted (position/viewport are the only Map-only state that
  // gets saved - see analysis-graph-registry.js's scope note) - defaults to List so the graph is
  // always readable even before any node has been placed on the canvas.
  const [mode, setMode] = React.useState('list');
  // Trader feedback (2026-09-12): a real educational Guide, reachable regardless of List/Canvas
  // mode - see GuideModal's own comment on why its content is sourced from the registry.
  const [guideOpen, setGuideOpen] = React.useState(false);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.6)', width: 'fit-content' }}>
          {[['list', tr(lang, 'modeList')], ['canvas', tr(lang, 'modeCanvas')]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setMode(id)} aria-pressed={mode === id} style={{
              height: 30, padding: '0 14px', borderRadius: 6, cursor: 'pointer', font: 'var(--type-body)', fontSize: 12,
              border: '1px solid ' + (mode === id ? 'var(--char-accent)' : 'transparent'),
              background: mode === id ? 'var(--char-active-surface)' : 'transparent',
              color: mode === id ? 'var(--char-accent)' : 'var(--text-muted)'
            }}>{label}</button>
          ))}
        </div>
        <button
          type="button" onClick={() => setGuideOpen(true)}
          style={{ height: 30, padding: '0 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12 }}
        >
          <Icon name="BookOpen" size={14} />{tr(lang, 'guideButton')}
        </button>
      </div>
      {guideOpen && <GuideModal lang={lang} rtl={rtl} onClose={() => setGuideOpen(false)} />}

      {mode === 'canvas' && (
        <AnalysisGraphCanvas
          session={session} lang={lang} rtl={rtl} graph={graph}
          onOpenSource={onOpenSource} onRemoveNode={onRemoveNode}
          onMoveNode={onMoveNode} onMoveNodes={onMoveNodes} onSetViewport={onSetViewport}
          onAddEdge={onAddEdge} onRemoveEdge={onRemoveEdge}
          onChangeNodeStage={onChangeNodeStage} onToggleStageCollapsed={onToggleStageCollapsed}
          onUpdateScenario={onUpdateScenario} onUpdateNoteContent={onUpdateNoteContent} onUpdateProcessingConfig={onUpdateProcessingConfig}
          onCreateScenario={onCreateScenario} onCreateEntry={onCreateEntry} onCreateTrade={onCreateTrade}
          onCreatePatternRef={onCreatePatternRef} onCreateNote={onCreateNote} onCreateProcessing={onCreateProcessing}
          onCreateMarketContext={onCreateMarketContext}
          marketChartComponent={marketChartComponent} resolveMarketSymbol={resolveMarketSymbol} resolveMarketInterval={resolveMarketInterval}
          onRunAiNode={onRunAiNode} onApplyAiSuggestion={onApplyAiSuggestion} onClearAiResult={onClearAiResult}
          imageUrls={imageUrls}
          onSwitchToList={() => setMode('list')}
        />
      )}

      {mode === 'list' && (
      <Panel variant="base" radius={12} padding={14} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'onMapTitle')} ({nodes.length})</span>
        {nodes.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'onMapEmpty')} {tr(lang, 'onMapEmptyHint')}</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nodes.map((node) => (
              <NodeRow key={node.id} node={node} session={session} lang={lang} onOpenSource={onOpenSource} onRemoveNode={onRemoveNode} imageUrls={imageUrls} />
            ))}
          </div>
        )}
      </Panel>
      )}

      {mode === 'list' && (
      <Panel variant="raised" radius={12} padding={14} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'addTitle')}</span>
        {entries.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'noEntries')}</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '.04em', marginTop: 4 }}>{tr(lang, 'entriesGroup')}</span>
            {entries.map((entry) => (
              <AddRow
                key={entry.id} lang={lang} icon={ENTRY_TYPE_ICON[entry.type] || 'Image'}
                label={tr(lang, ENTRY_TYPE_KEY[entry.type] || 'entryTypeChart') + (entry.timeframe ? ' · ' + entry.timeframe : '')}
                added={isOnMap('sessionEntry', entry.id)}
                onAdd={() => onAddNode('sessionEntry', entry.id, tr(lang, ENTRY_TYPE_KEY[entry.type] || 'entryTypeChart'))}
              />
            ))}
            {entries.some((e) => (e.scenarios || []).length > 0) && (
              <>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '.04em', marginTop: 10 }}>{tr(lang, 'scenariosGroup')}</span>
                {entries.flatMap((entry) => (entry.scenarios || []).map((scenario) => (
                  <AddRow
                    key={scenario.id} lang={lang} icon="GitBranch"
                    label={scenario.title || tr(lang, 'scenariosGroup')}
                    added={isOnMap('sessionScenario', scenario.id)}
                    onAdd={() => onAddNode('sessionScenario', scenario.id, scenario.title || '')}
                  />
                )))}
              </>
            )}
          </div>
        )}
      </Panel>
      )}
    </div>
  );
}
