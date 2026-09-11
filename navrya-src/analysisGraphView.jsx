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
    modeList: 'فهرست', modeCanvas: 'نقشه تصویری'
  },
  ar: {
    onMapTitle: 'على الخريطة', onMapEmpty: 'لم تتم إضافة أي عقدة إلى الخريطة بعد.',
    onMapEmptyHint: 'من القائمة أدناه، أضف إدخالًا أو سيناريو إلى الخريطة.',
    addTitle: 'إضافة إلى الخريطة', addButton: 'إضافة', alreadyAdded: 'على الخريطة',
    openSource: 'فتح المصدر', removeFromMap: 'إزالة من الخريطة',
    entriesGroup: 'إدخالات الجلسة', scenariosGroup: 'السيناريوهات', noEntries: 'لا توجد إدخالات في هذه الجلسة بعد.',
    sourceUnavailable: 'مصدر هذه العقدة لم يعد متاحًا.',
    entryTypeChart: 'مخطط', entryTypeMovement: 'حركة', entryTypeFate: 'المصير',
    modeList: 'القائمة', modeCanvas: 'الخريطة المرئية'
  },
  en: {
    onMapTitle: 'On the map', onMapEmpty: 'No node has been added to the map yet.',
    onMapEmptyHint: 'From the list below, add an entry or scenario to the map.',
    addTitle: 'Add to map', addButton: 'Add', alreadyAdded: 'On map',
    openSource: 'Open source', removeFromMap: 'Remove from map',
    entriesGroup: 'Session entries', scenariosGroup: 'Scenarios', noEntries: 'This session has no entries yet.',
    sourceUnavailable: "This node's source is no longer available.",
    entryTypeChart: 'Chart', entryTypeMovement: 'Movement', entryTypeFate: 'Fate',
    modeList: 'List', modeCanvas: 'Canvas'
  },
  es: {
    onMapTitle: 'En el mapa', onMapEmpty: 'Todavía no se agregó ningún nodo al mapa.',
    onMapEmptyHint: 'Desde la lista de abajo, agrega una entrada o un escenario al mapa.',
    addTitle: 'Agregar al mapa', addButton: 'Agregar', alreadyAdded: 'En el mapa',
    openSource: 'Abrir origen', removeFromMap: 'Quitar del mapa',
    entriesGroup: 'Entradas de la sesión', scenariosGroup: 'Escenarios', noEntries: 'Esta sesión todavía no tiene entradas.',
    sourceUnavailable: 'El origen de este nodo ya no está disponible.',
    entryTypeChart: 'Gráfico', entryTypeMovement: 'Movimiento', entryTypeFate: 'Destino',
    modeList: 'Lista', modeCanvas: 'Mapa visual'
  }
};
function tr(lang, key) { return (copy[lang] && copy[lang][key]) || copy.en[key] || key; }

const ENTRY_TYPE_ICON = { chart: 'Image', movement: 'Activity', fate: 'Flag' };
const ENTRY_TYPE_KEY = { chart: 'entryTypeChart', movement: 'entryTypeMovement', fate: 'entryTypeFate' };

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
function NodeRow({ node, session, lang, onOpenSource, onRemoveNode }) {
  const registry = window.TradeJournalAnalysisGraphRegistry;
  if (!registry) return null;
  const typeDef = registry.NODE_TYPES[node.type];
  const sourceRecord = node.origin === 'reference' ? registry.resolveNodeSource(node.source, session) : null;
  const unavailable = node.origin === 'reference' && !sourceRecord;
  const display = typeDef ? { title: typeDef.display.title(sourceRecord, node, lang, typeDef), status: typeDef.display.status(sourceRecord, node) } : { title: node.title || node.id, status: null };
  const icon = (typeDef && typeDef.icon) || 'Box';
  const canOpenSource = typeDef && typeDef.capabilities.canOpenSource && sourceRecord;
  return (
    <Panel variant="raised" radius={10} padding="10px 12px" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon name={icon} size={16} style={{ color: unavailable ? 'var(--text-dim)' : 'var(--char-accent)', flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, color: unavailable ? 'var(--text-dim)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="auto">{display.title}</span>
        {unavailable && <span style={{ fontSize: 10.5, color: 'var(--danger)' }}>{tr(lang, 'sourceUnavailable')}</span>}
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
  onRunAiNode, onApplyAiSuggestion, onClearAiResult
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

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
              <NodeRow key={node.id} node={node} session={session} lang={lang} onOpenSource={onOpenSource} onRemoveNode={onRemoveNode} />
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
