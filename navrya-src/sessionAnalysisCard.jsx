import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';

// The Adaptive AI Session Analysis result card (brief §11-26, §33). Renders the fixed NAVRYA
// envelope (thesis/stateMetrics/scenarios/memoryUpdate/...) with a MODEL-CHOSEN, model-ordered set
// of `blocks` (brief §8/§9/§29 "model-native character") - this component never hardcodes a
// Trend/Support/Resistance/Conclusion template; it only ever renders whatever the model actually
// returned, defensively (session-analysis-schema.js's normalizeAnalysisResult() has already
// defaulted every field by the time this component ever sees a `result`).
//
// Progressive disclosure (brief §12): thesis + high-importance state + the highest-importance
// block(s) + scenarios + AI Is Watching render by default; everything else sits behind one "Deep
// analysis" toggle. Reuses the shared design system (Panel/Button/Chip/Icon) and character theme
// tokens exactly like sessionAiAnalysisModal.jsx - no foreign UI primitives introduced.

const copy = {
  fa: {
    header: 'تحلیل هوش مصنوعی بازار', memoryChip: 'حافظه سشن · {n} رویداد', depthAuto: 'خودکار', depthEfficient: 'تحلیل کارآمد', depthDeep: 'تحلیل عمیق',
    thesisTitle: 'تز بازار', whatChangedTitle: 'چه چیزی تغییر کرد', tensionVs: 'در برابر',
    primaryScenario: 'سناریوی اصلی', alternativeScenario: 'سناریوی جایگزین', tailRiskScenario: 'ریسک دنباله‌ای',
    triggerLabel: 'محرک', invalidationLabel: 'نقطه ابطال', confidenceLabel: 'اطمینان',
    addToSession: 'افزودن سناریو', added: 'افزوده شد', visualize: 'ترسیم سناریو', visualizing: 'در حال ترسیم…',
    watchingTitle: 'در حال رصد', unknownsTitle: 'آنچه هنوز نمی‌دانم', changeViewTitle: 'چه چیزی نظرم را تغییر می‌دهد',
    confidenceTitle: 'میزان اطمینان تحلیل', deepAnalysis: 'تحلیل عمیق‌تر', collapse: 'بستن',
    noScenario: 'در حال حاضر سناریوی قابل‌اقدامی وجود ندارد.', tokenUsage: '{n} توکن',
    scenarioCheckTitle: 'ارزیابی سناریو', previousProbability: 'احتمال قبلی', currentProbability: 'احتمال فعلی', statusLabel: 'وضعیت',
    whatHappened: 'چه اتفاقی افتاد', confirmedBy: 'موارد تاییدکننده', contradictedBy: 'موارد نقض‌کننده', remainsUnresolved: 'موارد حل‌نشده',
    status_pending: 'در انتظار', status_strengthened: 'تقویت‌شده', status_weakened: 'تضعیف‌شده', status_partially_confirmed: 'تا حدی تایید‌شده', status_confirmed: 'تایید‌شده', status_invalidated: 'باطل‌شده',
    original: 'اصلی', scenarioMap: 'نقشه سناریو', regenerate: 'تحلیل مجدد',
    original_data_note: 'این تصویر یک روکش تصویری‌سازی‌شده است، نه داده واقعی بازار.',
    visualizeAnalysis: 'ترسیم کل تحلیل روی چارت', visualizingAnalysis: 'در حال ترسیم تحلیل…'
  },
  ar: {
    header: 'تحليل الذكاء الاصطناعي للسوق', memoryChip: 'ذاكرة الجلسة · {n} حدث', depthAuto: 'تلقائي', depthEfficient: 'تحليل فعّال', depthDeep: 'تحليل عميق',
    thesisTitle: 'أطروحة السوق', whatChangedTitle: 'ما الذي تغيّر', tensionVs: 'مقابل',
    primaryScenario: 'السيناريو الأساسي', alternativeScenario: 'سيناريو بديل', tailRiskScenario: 'مخاطرة الذيل',
    triggerLabel: 'المحفز', invalidationLabel: 'نقطة الإبطال', confidenceLabel: 'الثقة',
    addToSession: 'إضافة سيناريو', added: 'تمت الإضافة', visualize: 'تصور السيناريو', visualizing: 'جارٍ الرسم…',
    watchingTitle: 'قيد المراقبة', unknownsTitle: 'ما لا أعرفه بعد', changeViewTitle: 'ما الذي قد يغيّر رأيي',
    confidenceTitle: 'مستوى ثقة التحليل', deepAnalysis: 'تحليل أعمق', collapse: 'إغلاق',
    noScenario: 'لا يوجد سيناريو قابل للتنفيذ حالياً.', tokenUsage: '{n} رمز',
    scenarioCheckTitle: 'تقييم السيناريو', previousProbability: 'الاحتمال السابق', currentProbability: 'الاحتمال الحالي', statusLabel: 'الحالة',
    whatHappened: 'ماذا حدث', confirmedBy: 'ما أكّد', contradictedBy: 'ما ناقض', remainsUnresolved: 'ما لم يُحسم',
    status_pending: 'قيد الانتظار', status_strengthened: 'تعزّز', status_weakened: 'ضعُف', status_partially_confirmed: 'تأكّد جزئياً', status_confirmed: 'تأكّد', status_invalidated: 'أُبطل',
    original: 'الأصلي', scenarioMap: 'خريطة السيناريو', regenerate: 'إعادة التحليل',
    original_data_note: 'هذه صورة توضيحية مولّدة، وليست بيانات سوق حقيقية.',
    visualizeAnalysis: 'رسم التحليل الكامل على الرسم البياني', visualizingAnalysis: 'جارٍ رسم التحليل…'
  },
  en: {
    header: 'AI Market Analysis', memoryChip: 'Session Memory · {n} events', depthAuto: 'Auto', depthEfficient: 'Efficient analysis', depthDeep: 'Deep analysis',
    thesisTitle: 'Market Thesis', whatChangedTitle: 'What Changed', tensionVs: 'VS',
    primaryScenario: 'Primary Scenario', alternativeScenario: 'Alternative Scenario', tailRiskScenario: 'Tail Risk',
    triggerLabel: 'Trigger', invalidationLabel: 'Invalidation', confidenceLabel: 'Confidence',
    addToSession: '+ Add Scenario', added: 'Added', visualize: 'Visualize Scenario', visualizing: 'Visualizing…',
    watchingTitle: 'AI Is Watching', unknownsTitle: "What I Don't Know Yet", changeViewTitle: 'What Would Change My View?',
    confidenceTitle: 'Analysis Confidence', deepAnalysis: 'Deep analysis', collapse: 'Collapse',
    noScenario: 'No actionable scenario yet.', tokenUsage: '{n} tokens',
    scenarioCheckTitle: 'Scenario Check', previousProbability: 'Previous probability', currentProbability: 'Current probability', statusLabel: 'Status',
    whatHappened: 'What happened', confirmedBy: 'What confirmed', contradictedBy: 'What contradicted', remainsUnresolved: 'What remains',
    status_pending: 'Pending', status_strengthened: 'Strengthened', status_weakened: 'Weakened', status_partially_confirmed: 'Partially confirmed', status_confirmed: 'Confirmed', status_invalidated: 'Invalidated',
    original: 'Original', scenarioMap: 'Scenario Map', regenerate: 'Regenerate',
    original_data_note: 'This is an illustrative generated overlay, not real market data.',
    visualizeAnalysis: 'Draw full analysis on chart', visualizingAnalysis: 'Drawing analysis…'
  },
  es: {
    header: 'Análisis de IA del mercado', memoryChip: 'Memoria de sesión · {n} eventos', depthAuto: 'Automático', depthEfficient: 'Análisis eficiente', depthDeep: 'Análisis profundo',
    thesisTitle: 'Tesis de mercado', whatChangedTitle: 'Qué cambió', tensionVs: 'VS',
    primaryScenario: 'Escenario principal', alternativeScenario: 'Escenario alternativo', tailRiskScenario: 'Riesgo de cola',
    triggerLabel: 'Disparador', invalidationLabel: 'Invalidación', confidenceLabel: 'Confianza',
    addToSession: '+ Añadir escenario', added: 'Añadido', visualize: 'Visualizar escenario', visualizing: 'Generando…',
    watchingTitle: 'La IA está observando', unknownsTitle: 'Lo que aún no sé', changeViewTitle: 'Qué cambiaría mi opinión',
    confidenceTitle: 'Confianza del análisis', deepAnalysis: 'Análisis profundo', collapse: 'Cerrar',
    noScenario: 'Todavía no hay un escenario accionable.', tokenUsage: '{n} tokens',
    scenarioCheckTitle: 'Verificación de escenario', previousProbability: 'Probabilidad anterior', currentProbability: 'Probabilidad actual', statusLabel: 'Estado',
    whatHappened: 'Qué ocurrió', confirmedBy: 'Qué lo confirmó', contradictedBy: 'Qué lo contradijo', remainsUnresolved: 'Qué queda sin resolver',
    status_pending: 'Pendiente', status_strengthened: 'Reforzado', status_weakened: 'Debilitado', status_partially_confirmed: 'Parcialmente confirmado', status_confirmed: 'Confirmado', status_invalidated: 'Invalidado',
    original: 'Original', scenarioMap: 'Mapa de escenario', regenerate: 'Regenerar',
    original_data_note: 'Esta es una superposición ilustrativa generada, no datos reales del mercado.',
    visualizeAnalysis: 'Dibujar el análisis completo en el gráfico', visualizingAnalysis: 'Dibujando el análisis…'
  }
};
function tr(lang, key, vars) {
  var value = (copy[lang] && copy[lang][key]) || copy.en[key] || key;
  if (vars) Object.keys(vars).forEach((name) => { value = value.replace('{' + name + '}', vars[name]); });
  return value;
}

// Same idempotent "inject once, keyframes only" convention as sessionAiAnalysisModal.jsx's own
// GENERATING_MOTION_CSS (this app's one established way to get a real CSS animation out of a
// pure-inline-style component). A one-shot confirm pop for "Add Scenario" -> "Added" (2026-09
// follow-up: was an instant, un-animated label swap) - ScenarioCard below triggers it only on the
// render where `added` actually just became true, never on mount already-added.
const ADD_CONFIRM_MOTION_CSS = `
@keyframes nv-scenario-added-pop{
  0%{transform:scale(1)}
  40%{transform:scale(1.06)}
  100%{transform:scale(1)}
}
[data-nv-added="true"]{animation:nv-scenario-added-pop 480ms var(--ease-out,cubic-bezier(.22,.61,.36,1))}
@media (prefers-reduced-motion:reduce){
  [data-nv-added="true"]{animation:none!important}
}
`;
function useAddConfirmMotion() {
  React.useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('nv-scenario-added-motion')) return;
    const el = document.createElement('style');
    el.id = 'nv-scenario-added-motion';
    el.textContent = ADD_CONFIRM_MOTION_CSS;
    document.head.appendChild(el);
  }, []);
}

const TREND_ICON = { up: 'TrendingUp', down: 'TrendingDown', improving: 'TrendingUp', weakening: 'TrendingDown', flat: 'Minus', unknown: 'Minus' };
const IMPORTANCE_COLOR = { high: 'var(--warning)', medium: 'var(--char-accent)', low: 'var(--text-dim)' };
const BLOCK_ICON = {
  observation: 'Eye', interpretation: 'Brain', change: 'RefreshCw', market_structure: 'Waypoints', momentum: 'Zap',
  key_zones: 'Layers', market_tension: 'Swords', historical_context: 'History', pattern_context: 'Map',
  invalidation: 'ShieldAlert', warning: 'TriangleAlert', uncertainty: 'HelpCircle', watchlist: 'Radar', model_insight: 'Sparkles', custom: 'Sparkles'
};

function MetricChip({ metric }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)', flex: 'none', minWidth: 84 }}>
      <span style={{ fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{metric.label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, color: IMPORTANCE_COLOR[metric.importance] || 'var(--text-primary)' }}>
        {metric.value}
        {metric.trend && metric.trend !== 'unknown' && <Icon name={TREND_ICON[metric.trend] || 'Minus'} size={12} />}
      </span>
    </span>
  );
}

function GenericBlock({ block, lang }) {
  return (
    <div>
      {block.summary && <p dir="auto" style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.8 }}>{block.summary}</p>}
      {!!block.items.length && (
        <ul dir="auto" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {block.items.map((item, i) => (
            <li key={i} style={{ display: 'flex', gap: 7, fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              <span style={{ color: 'var(--char-accent)', flex: 'none' }}>—</span><span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TensionBlock({ block, lang }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span dir="auto" style={{ flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.4)' }}>{block.tensionA}</span>
      <span style={{ flex: 'none', fontSize: 10, letterSpacing: '.1em', color: 'var(--warning)', fontWeight: 700 }}>{tr(lang, 'tensionVs')}</span>
      <span dir="auto" style={{ flex: 1, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.4)' }}>{block.tensionB}</span>
    </div>
  );
}

function ZonesBlock({ block }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {block.zones.map((zone, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="navrya-tabular" dir="ltr" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold-warm)' }}>{zone.range}</span>
            <span dir="auto" style={{ fontSize: 11.5, color: 'var(--text-primary)' }}>{zone.label}</span>
          </span>
          {zone.whyItMatters && <span dir="auto" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{zone.whyItMatters}</span>}
        </div>
      ))}
    </div>
  );
}

function AnalysisBlock({ block, lang }) {
  return (
    <Panel variant="quiet" padding={12} style={{ border: '1px solid var(--border-hairline)', borderRadius: 10, background: 'rgba(3,8,7,.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <span style={{ color: IMPORTANCE_COLOR[block.importance] || 'var(--char-accent)', flex: 'none', display: 'flex' }}><Icon name={BLOCK_ICON[block.type] || 'Sparkles'} size={14} /></span>
        <span dir="auto" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{block.title}</span>
        {block.importance === 'high' && <Chip tone="danger">!</Chip>}
      </div>
      {block.type === 'market_tension' ? <TensionBlock block={block} lang={lang} />
        : block.type === 'key_zones' && block.zones.length ? <ZonesBlock block={block} />
        : <GenericBlock block={block} lang={lang} />}
    </Panel>
  );
}

// Shared full-bleed image lightbox (2026-09 follow-up: clicking a generated image did nothing;
// the only "enlarge" affordance anywhere was EntryDetailPanel's own fullscreen button, which
// opened a new browser tab instead of staying in-app). Same fixed/scrim/Escape/backdrop-click
// pattern liveSessionView.jsx's own SessionModalShell already established for every other overlay
// in this app - just framing an image instead of a card, and exported so liveSessionView.jsx's
// own EntryImageViewer (the entry's chart image, with its own raw/AI-overlay mode switcher) can
// reuse the exact same component rather than a second implementation.
export function ImageLightbox({ src, onClose }) {
  React.useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'grid', placeItems: 'center', padding: 24, background: 'var(--scrim)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, border: '1px solid var(--border-gold)', boxShadow: '0 12px 30px rgba(0,0,0,.5)', display: 'block' }} />
      <button type="button" onClick={onClose} aria-label="close" style={{ position: 'absolute', top: 24, insetInlineEnd: 24, width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

function ScenarioCard({ scenario, lang, added, onAdd, onVisualize, visualization }) {
  const roleLabel = scenario.role === 'alternative' ? tr(lang, 'alternativeScenario') : scenario.role === 'tail_risk' ? tr(lang, 'tailRiskScenario') : tr(lang, 'primaryScenario');
  const vizStatus = visualization ? visualization.status : null;
  useAddConfirmMotion();
  const [justAdded, setJustAdded] = React.useState(false);
  const wasAddedRef = React.useRef(added);
  React.useEffect(() => {
    if (added && !wasAddedRef.current) {
      setJustAdded(true);
      const t = window.setTimeout(() => setJustAdded(false), 480);
      wasAddedRef.current = added;
      return () => window.clearTimeout(t);
    }
    wasAddedRef.current = added;
  }, [added]);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  return (
    <Panel variant="raised" ornament padding={14} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Chip tone={scenario.role === 'tail_risk' ? 'danger' : 'accent'}>{roleLabel}</Chip>
        <Chip tone="neutral">{scenario.kind}</Chip>
        <span style={{ marginInlineStart: 'auto' }} />
        <span className="navrya-tabular" style={{ fontSize: 15, fontWeight: 700, color: 'var(--success)' }}>{scenario.probability}%</span>
      </div>
      <span dir="auto" style={{ fontSize: 13, fontWeight: 700, color: 'var(--parchment)' }}>{scenario.title}</span>
      <p dir="auto" style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.8 }}>{scenario.summary}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {scenario.trigger && (
          <div><span style={{ display: 'block', fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 2 }}>{tr(lang, 'triggerLabel')}</span><span dir="auto" style={{ fontSize: 11, color: 'var(--text-primary)' }}>{scenario.trigger}</span></div>
        )}
        {scenario.invalidation && (
          <div><span style={{ display: 'block', fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 2 }}>{tr(lang, 'invalidationLabel')}</span><span dir="auto" style={{ fontSize: 11, color: 'var(--danger)' }}>{scenario.invalidation}</span></div>
        )}
      </div>
      <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'confidenceLabel')}: {scenario.confidence}</span>

      {vizStatus === 'ready' && visualization.imageDataUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <img src={visualization.imageDataUrl} alt="" onClick={() => setLightboxOpen(true)} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-gold)', display: 'block', cursor: 'zoom-in' }} />
          <span style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>{tr(lang, 'original_data_note')}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button data-nv-added={justAdded ? 'true' : undefined} variant={added ? 'ghost' : 'primary'} size="sm" icon={added ? 'check' : 'plus'} disabled={added} onClick={onAdd} fullWidth>
          {added ? tr(lang, 'added') : tr(lang, 'addToSession')}
        </Button>
        <Button variant="secondary" size="sm" icon="image" disabled={vizStatus === 'loading'} onClick={onVisualize} fullWidth>
          {vizStatus === 'loading' ? tr(lang, 'visualizing') : tr(lang, 'visualize')}
        </Button>
      </div>
      {lightboxOpen && vizStatus === 'ready' && visualization.imageDataUrl && (
        <ImageLightbox src={visualization.imageDataUrl} onClose={() => setLightboxOpen(false)} />
      )}
    </Panel>
  );
}

function ScenarioEvaluationCard({ evaluation, scenarioTitle, lang }) {
  return (
    <Panel variant="raised" ornament padding={14} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="Target" size={14} />
        <span dir="auto" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--parchment)' }}>{scenarioTitle || tr(lang, 'scenarioCheckTitle')}</span>
        <span style={{ marginInlineStart: 'auto' }} />
        <Chip tone={evaluation.status === 'invalidated' ? 'danger' : evaluation.status === 'confirmed' || evaluation.status === 'strengthened' ? 'success' : 'neutral'}>{tr(lang, 'status_' + evaluation.status)}</Chip>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ display: 'block', fontSize: 9.5, color: 'var(--text-dim)' }}>{tr(lang, 'currentProbability')}</span>
          <span className="navrya-tabular" style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>{evaluation.newProbability}%</span>
        </span>
      </div>
      <p dir="auto" style={{ margin: 0, fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.8 }}><b>{tr(lang, 'whatHappened')}:</b> {evaluation.whatHappened}</p>
      {!!evaluation.confirmedBy.length && <p dir="auto" style={{ margin: 0, fontSize: 11, color: 'var(--success)', lineHeight: 1.8 }}><b>{tr(lang, 'confirmedBy')}:</b> {evaluation.confirmedBy.join(' · ')}</p>}
      {!!evaluation.contradictedBy.length && <p dir="auto" style={{ margin: 0, fontSize: 11, color: 'var(--danger)', lineHeight: 1.8 }}><b>{tr(lang, 'contradictedBy')}:</b> {evaluation.contradictedBy.join(' · ')}</p>}
      {!!evaluation.remainsUnresolved.length && <p dir="auto" style={{ margin: 0, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.8 }}><b>{tr(lang, 'remainsUnresolved')}:</b> {evaluation.remainsUnresolved.join(' · ')}</p>}
    </Panel>
  );
}

// result: normalized AnalysisResult (session-analysis-schema.js's own shape). scenarioTitleFor:
// (scenarioId) => string, so evaluations can show the real persisted scenario's own title (the
// model only ever sees/returns the id, never re-states a title NAVRYA already owns).
export function SessionAnalysisCard({
  result, lang, memoryReceipt, depth, addedScenarioKeys, scenarioVisualizations,
  onAddScenario, onVisualizeScenario, onVisualizeAnalysis, analysisVisualization, scenarioTitleFor, meta
}) {
  const activeLang = lang || 'fa';
  const rtl = activeLang === 'fa' || activeLang === 'ar';
  const [deepOpen, setDeepOpen] = React.useState(false);
  const [analysisLightboxOpen, setAnalysisLightboxOpen] = React.useState(false);

  const highBlocks = result.blocks.filter((b) => b.importance === 'high');
  const otherBlocks = result.blocks.filter((b) => b.importance !== 'high');
  const totalTokens = result.usage && (result.usage.totalTokens || (result.usage.promptTokens || 0) + (result.usage.completionTokens || 0));

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {memoryReceipt && memoryReceipt.hasInitialAnalysis && <Chip tone="neutral" dot>{tr(activeLang, 'memoryChip', { n: memoryReceipt.eventCount })}</Chip>}
        <Chip tone="accent">{depth === 'deep' ? tr(activeLang, 'depthDeep') : depth === 'efficient' ? tr(activeLang, 'depthEfficient') : tr(activeLang, 'depthAuto')}</Chip>
        {!!totalTokens && <span title={JSON.stringify(result.usage)} style={{ marginInlineStart: 'auto', fontSize: 10, color: 'var(--text-dim)' }}>{tr(activeLang, 'tokenUsage', { n: (totalTokens / 1000).toFixed(1) + 'k' })}</span>}
      </div>

      <div>
        <span style={{ display: 'block', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-warm)', marginBottom: 4 }}>{tr(activeLang, 'thesisTitle')}</span>
        <p dir="auto" style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--parchment)', lineHeight: 1.7 }}>{result.thesis.headline}</p>
        {result.thesis.summary && <p dir="auto" style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.8 }}>{result.thesis.summary}</p>}
      </div>

      {/* Analysis Map (brief follow-up, 2026-08-31): the whole analysis (every key zone + the
          primary scenario's path) drawn onto the actual chart in one image, rather than per
          scenario one at a time - onVisualizeAnalysis is only ever supplied once a real entry is
          known (the modal/caller withholds it otherwise), so this never renders for a flow with
          nowhere to source a chart image from. */}
      {onVisualizeAnalysis && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {analysisVisualization && analysisVisualization.status === 'ready' && analysisVisualization.imageDataUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <img src={analysisVisualization.imageDataUrl} alt="" onClick={() => setAnalysisLightboxOpen(true)} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-gold)', display: 'block', cursor: 'zoom-in' }} />
              <span style={{ fontSize: 9.5, color: 'var(--text-dim)' }}>{tr(activeLang, 'original_data_note')}</span>
            </div>
          )}
          <Button variant="secondary" size="sm" icon="image" disabled={analysisVisualization && analysisVisualization.status === 'loading'} onClick={onVisualizeAnalysis}>
            {analysisVisualization && analysisVisualization.status === 'loading' ? tr(activeLang, 'visualizingAnalysis') : tr(activeLang, 'visualizeAnalysis')}
          </Button>
          {analysisLightboxOpen && analysisVisualization && analysisVisualization.imageDataUrl && (
            <ImageLightbox src={analysisVisualization.imageDataUrl} onClose={() => setAnalysisLightboxOpen(false)} />
          )}
        </div>
      )}

      {!!result.stateMetrics.length && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          {result.stateMetrics.map((m, i) => <MetricChip key={i} metric={m} />)}
        </div>
      )}

      {result.analysisType === 'update' && !!result.whatChanged.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 10, border: '1px solid var(--border-gold)', background: 'rgba(214,175,107,.06)' }}>
          <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>{tr(activeLang, 'whatChangedTitle')}</span>
          {result.whatChanged.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
              <span dir="auto" style={{ color: 'var(--text-dim)', flex: 'none', width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
              <span dir="auto" style={{ color: 'var(--text-muted)' }}>{c.from}</span>
              <Icon name="ArrowLeftRight" size={11} />
              <span dir="auto" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{c.to}</span>
            </div>
          ))}
        </div>
      )}

      {!!highBlocks.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {highBlocks.map((block) => <AnalysisBlock key={block.id} block={block} lang={activeLang} />)}
        </div>
      )}

      {!!result.scenarioEvaluations.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {result.scenarioEvaluations.map((evaluation) => (
            <ScenarioEvaluationCard key={evaluation.scenarioId} evaluation={evaluation} scenarioTitle={scenarioTitleFor ? scenarioTitleFor(evaluation.scenarioId) : ''} lang={activeLang} />
          ))}
        </div>
      )}

      {result.scenarios.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {result.scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.localKey} scenario={scenario} lang={activeLang}
              added={addedScenarioKeys ? addedScenarioKeys.has(scenario.localKey) : false}
              onAdd={() => onAddScenario && onAddScenario(scenario)}
              onVisualize={() => onVisualizeScenario && onVisualizeScenario(scenario)}
              visualization={scenarioVisualizations ? scenarioVisualizations[scenario.localKey] : null}
            />
          ))}
        </div>
      ) : result.analysisType !== 'scenario_evaluation' && (
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>{tr(activeLang, 'noScenario')}</span>
      )}

      {!!result.watchItems.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: 12, borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--char-accent)' }}><Icon name="Radar" size={12} />{tr(activeLang, 'watchingTitle')}</span>
          <span dir="auto" style={{ fontSize: 11.5, color: 'var(--text-primary)' }}>{result.watchItems.join(' · ')}</span>
        </div>
      )}

      {(otherBlocks.length > 0 || result.unknowns.length > 0 || result.whatWouldChangeView) && (
        <div>
          <button type="button" onClick={() => setDeepOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: 36, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', font: 'var(--type-body)', fontSize: 11.5 }}>
            <Icon name={deepOpen ? 'ChevronUp' : 'ChevronDown'} size={14} />{deepOpen ? tr(activeLang, 'collapse') : tr(activeLang, 'deepAnalysis')}
          </button>
          {deepOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {otherBlocks.map((block) => <AnalysisBlock key={block.id} block={block} lang={activeLang} />)}
              {!!result.unknowns.length && (
                <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
                  <span style={{ display: 'block', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 4 }}>{tr(activeLang, 'unknownsTitle')}</span>
                  <ul dir="auto" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {result.unknowns.map((u, i) => <li key={i} style={{ fontSize: 11, color: 'var(--text-muted)' }}>— {u}</li>)}
                  </ul>
                </div>
              )}
              {result.whatWouldChangeView && (
                <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
                  <span style={{ display: 'block', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 4 }}>{tr(activeLang, 'changeViewTitle')}</span>
                  <p dir="auto" style={{ margin: 0, fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.8 }}>{result.whatWouldChangeView}</p>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border-hairline)' }}>
                <span style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{tr(activeLang, 'confidenceTitle')}</span>
                <Chip tone={result.confidence.level === 'high' ? 'success' : result.confidence.level === 'low' ? 'danger' : 'neutral'}>{result.confidence.level}</Chip>
                {!!result.confidence.reasons.length && <span dir="auto" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{result.confidence.reasons.join(' · ')}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
