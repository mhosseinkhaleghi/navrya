import React from 'react';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { AnalysisProfileOnboarding } from './analysisProfileOnboarding.jsx';

// Session AI Analysis - the popup behind the Session workspace's existing "AI Analysis"
// ("شروع تحلیل") button (liveSessionView.jsx's FateSummaryModal, wired at its own call site -
// this file owns none of that button's DOM, only what opens when it is clicked). Everything below
// is request-collection + a demo generating/placeholder sequence - no scenario mutation, pattern
// evaluation or real AI call happens here (see startAnalysis()'s own comment).
//
// Reuses, never re-implements: the shared Modal/Button/Select/Icon design system, the Analysis
// Profiles domain (window.TradeJournalAnalysisProfileStore + the style/focus registries, via
// window.TradeJournalAnalysisContext.getAnalysisContext - see ARCHITECTURE.md §7.25, whose own
// analysis-context.js header comment names "a future Session AI Analysis feature" as its intended
// caller, i.e. this file), and AnalysisProfileOnboarding.jsx's existing real two-step
// style→focus wizard for the "+" quick-create affordance (mode="create", the exact same call
// AnalysisProfilesView.jsx's own "New profile" button already makes) - never a second, parallel
// style/focus picker.

function profileStore() { return window.TradeJournalAnalysisProfileStore; }
function aiSettingsStore() { return window.TradeJournalAISettingsStore; }
function analysisContextApi() { return window.TradeJournalAnalysisContext; }

const ADHERENCE_LEVELS = ['open', 'balanced', 'strict'];
const GENERATION_STAGES = ['readingChart', 'recallingMemory', 'reviewingScenarios', 'reviewingPatterns', 'applyingStyle', 'preparing'];

const copy = {
  fa: {
    title: 'تحلیل هوش مصنوعی', eyebrowRight: 'سشن جاری',
    userViewLabel: 'دیدگاه شما',
    userViewHelper: 'اگر درباره وضعیت فعلی بازار، سناریوها یا حرکت قیمت دیدگاهی دارید، برای هوش مصنوعی بنویسید.',
    userViewNote: 'این یادداشت به‌عنوان زمینه در نظر گرفته می‌شود، نه یک واقعیت قطعی — هوش مصنوعی می‌تواند نظر متفاوتی داشته باشد.',
    userViewPlaceholder: 'مثلاً: به نظرم قیمت در حال جمع‌آوری نقدینگی قبل از یک حرکت بزرگ‌تر است…',
    modelLabel: 'مدل هوش مصنوعی',
    profileLabel: 'سبک تحلیل', profileNone: 'بدون پروفایل تحلیل', addProfile: 'افزودن پروفایل جدید',
    adherenceLabel: 'میزان وفاداری به سبک تحلیل',
    adherenceTitle: { open: 'باز', balanced: 'متعادل', strict: 'سخت‌گیرانه' },
    adherenceDesc: {
      open: 'مدل می‌تواند خارج از سبک انتخابی هم نکات مهم را مطرح کند.',
      balanced: 'سبک انتخابی لنز اصلی تحلیل است، ولی مدل برای مشاهدات مهم آزادی دارد.',
      strict: 'مدل تا حد ممکن فقط بر اساس سبک و Focusهای انتخاب‌شده تحلیل می‌کند.'
    },
    contextTitle: 'AI برای این تحلیل به این اطلاعات دسترسی خواهد داشت:',
    contextEmpty: 'هنوز داده‌ای در این سشن ثبت نشده که به تحلیل داده شود.',
    ctxLatestChart: 'آخرین چارت', ctxPreviousMovement: 'حرکت قبلی',
    ctxActiveScenarios: 'سناریوی فعال', ctxPatternStates: 'وضعیت الگو',
    ctxStrategy: 'استراتژی / تگ الگو', ctxPreviousAnalysis: 'تحلیل قبلی هوش مصنوعی',
    startAnalysis: 'شروع تحلیل', cancel: 'انصراف', close: 'بستن',
    stage_readingChart: 'در حال خواندن آخرین چارت', stage_recallingMemory: 'در حال بازیابی حافظه سشن',
    stage_reviewingScenarios: 'بررسی سناریوهای فعال', stage_reviewingPatterns: 'بررسی الگوها و استراتژی',
    stage_applyingStyle: 'اعمال سبک تحلیل', stage_preparing: 'آماده‌سازی تحلیل',
    resultTitle: 'تحلیل هوش مصنوعی', resultPlaceholder: 'ساختار نمایش تحلیل در مرحله بعد اضافه خواهد شد.'
  },
  ar: {
    title: 'تحليل الذكاء الاصطناعي', eyebrowRight: 'الجلسة الحالية',
    userViewLabel: 'وجهة نظرك',
    userViewHelper: 'إذا كان لديك رأي حول وضع السوق الحالي أو السيناريوهات أو حركة السعر، اكتبه للذكاء الاصطناعي.',
    userViewNote: 'تُعامل هذه الملاحظة كسياق، لا كحقيقة ثابتة - يمكن للذكاء الاصطناعي أن يخالفها لاحقاً.',
    userViewPlaceholder: 'مثال: أعتقد أن السعر يجمع السيولة قبل حركة أكبر…',
    modelLabel: 'نموذج الذكاء الاصطناعي',
    profileLabel: 'أسلوب التحليل', profileNone: 'بدون ملف تحليل', addProfile: 'إضافة ملف جديد',
    adherenceLabel: 'مدى الالتزام بأسلوب التحليل',
    adherenceTitle: { open: 'مفتوح', balanced: 'متوازن', strict: 'صارم' },
    adherenceDesc: {
      open: 'يمكن للنموذج طرح ملاحظات مهمة حتى خارج الأسلوب المختار.',
      balanced: 'الأسلوب المختار هو العدسة الأساسية للتحليل، لكن النموذج له حرية في الملاحظات المهمة.',
      strict: 'يحلل النموذج قدر الإمكان بناءً على الأسلوب ومجالات التركيز المختارة فقط.'
    },
    contextTitle: 'سيتمكن الذكاء الاصطناعي من الوصول إلى هذه المعلومات لهذا التحليل:',
    contextEmpty: 'لا توجد بيانات مسجلة بعد في هذه الجلسة لتغذية التحليل.',
    ctxLatestChart: 'آخر مخطط', ctxPreviousMovement: 'الحركة السابقة',
    ctxActiveScenarios: 'سيناريو نشط', ctxPatternStates: 'حالة النمط',
    ctxStrategy: 'استراتيجية / وسم النمط', ctxPreviousAnalysis: 'تحليل الذكاء الاصطناعي السابق',
    startAnalysis: 'بدء التحليل', cancel: 'إلغاء', close: 'إغلاق',
    stage_readingChart: 'جارٍ قراءة آخر مخطط', stage_recallingMemory: 'جارٍ استرجاع ذاكرة الجلسة',
    stage_reviewingScenarios: 'مراجعة السيناريوهات النشطة', stage_reviewingPatterns: 'مراجعة الأنماط والاستراتيجية',
    stage_applyingStyle: 'تطبيق أسلوب التحليل', stage_preparing: 'تجهيز التحليل',
    resultTitle: 'تحليل الذكاء الاصطناعي', resultPlaceholder: 'سيتم إضافة بنية عرض التحليل في المرحلة التالية.'
  },
  en: {
    title: 'AI Analysis', eyebrowRight: 'Current session',
    userViewLabel: 'Your view',
    userViewHelper: 'If you have a view on the current market state, scenarios or price movement, write it for the AI.',
    userViewNote: 'This note is taken as context, not established fact - the AI may reasonably disagree with it.',
    userViewPlaceholder: 'e.g. I think price is collecting liquidity before a bigger move…',
    modelLabel: 'AI model',
    profileLabel: 'Analysis style', profileNone: 'No analysis profile', addProfile: 'Add new profile',
    adherenceLabel: 'Adherence to analysis style',
    adherenceTitle: { open: 'Open', balanced: 'Balanced', strict: 'Strict' },
    adherenceDesc: {
      open: 'The model may raise important points outside the chosen style too.',
      balanced: 'The chosen style is the primary lens, but the model stays free to note important observations.',
      strict: 'The model analyzes as closely as possible only through the chosen style and focus areas.'
    },
    contextTitle: 'The AI will have access to this information for this analysis:',
    contextEmpty: 'No data has been logged in this session yet to feed the analysis.',
    ctxLatestChart: 'Latest chart', ctxPreviousMovement: 'Previous movement',
    ctxActiveScenarios: 'Active scenario', ctxPatternStates: 'Pattern state',
    ctxStrategy: 'Strategy / pattern tag', ctxPreviousAnalysis: 'Previous AI analysis',
    startAnalysis: 'Start analysis', cancel: 'Cancel', close: 'Close',
    stage_readingChart: 'Reading the latest chart', stage_recallingMemory: 'Retrieving session memory',
    stage_reviewingScenarios: 'Reviewing active scenarios', stage_reviewingPatterns: 'Reviewing patterns and strategy',
    stage_applyingStyle: 'Applying the analysis style', stage_preparing: 'Preparing the analysis',
    resultTitle: 'AI Analysis', resultPlaceholder: 'The analysis result layout will be added in the next phase.'
  },
  es: {
    title: 'Análisis de IA', eyebrowRight: 'Sesión actual',
    userViewLabel: 'Tu opinión',
    userViewHelper: 'Si tienes una opinión sobre el estado actual del mercado, los escenarios o el movimiento del precio, escríbela para la IA.',
    userViewNote: 'Esta nota se toma como contexto, no como un hecho establecido - la IA puede razonablemente no estar de acuerdo.',
    userViewPlaceholder: 'p. ej. creo que el precio está acumulando liquidez antes de un movimiento mayor…',
    modelLabel: 'Modelo de IA',
    profileLabel: 'Estilo de análisis', profileNone: 'Sin perfil de análisis', addProfile: 'Añadir nuevo perfil',
    adherenceLabel: 'Fidelidad al estilo de análisis',
    adherenceTitle: { open: 'Abierto', balanced: 'Equilibrado', strict: 'Estricto' },
    adherenceDesc: {
      open: 'El modelo puede señalar observaciones importantes incluso fuera del estilo elegido.',
      balanced: 'El estilo elegido es el lente principal, pero el modelo tiene libertad para observaciones importantes.',
      strict: 'El modelo analiza, en la medida de lo posible, solo según el estilo y los enfoques elegidos.'
    },
    contextTitle: 'La IA tendrá acceso a esta información para este análisis:',
    contextEmpty: 'Todavía no hay datos registrados en esta sesión para alimentar el análisis.',
    ctxLatestChart: 'Último gráfico', ctxPreviousMovement: 'Movimiento anterior',
    ctxActiveScenarios: 'Escenario activo', ctxPatternStates: 'Estado del patrón',
    ctxStrategy: 'Estrategia / etiqueta de patrón', ctxPreviousAnalysis: 'Análisis de IA anterior',
    startAnalysis: 'Iniciar análisis', cancel: 'Cancelar', close: 'Cerrar',
    stage_readingChart: 'Leyendo el último gráfico', stage_recallingMemory: 'Recuperando la memoria de la sesión',
    stage_reviewingScenarios: 'Revisando escenarios activos', stage_reviewingPatterns: 'Revisando patrones y estrategia',
    stage_applyingStyle: 'Aplicando el estilo de análisis', stage_preparing: 'Preparando el análisis',
    resultTitle: 'Análisis de IA', resultPlaceholder: 'La estructura de presentación del análisis se añadirá en la siguiente fase.'
  }
};
function tr(lang, key) { return (copy[lang] && copy[lang][key]) || copy.en[key] || key; }

// Same idempotent "inject once, keyframes only" convention as AiMagicFill.motion.js (this app's
// one established way to get a real CSS animation out of a pure-inline-style component) - kept
// inline here rather than its own .motion.js file since this animation has exactly one consumer,
// unlike AiMagicFill's shared-everywhere glow. Respects prefers-reduced-motion the same way.
const GENERATING_MOTION_CSS = `
@keyframes nv-ai-analysis-stage-pulse{
  0%{box-shadow:0 0 0 0 color-mix(in srgb, var(--char-accent) 45%, transparent)}
  70%{box-shadow:0 0 0 7px transparent}
  100%{box-shadow:0 0 0 0 transparent}
}
[data-nv-ai-stage="active"]{animation:nv-ai-analysis-stage-pulse 1500ms var(--ease-out,cubic-bezier(.22,.61,.36,1)) infinite}
@media (prefers-reduced-motion:reduce){
  [data-nv-ai-stage="active"]{animation:none!important}
}
`;
function useGeneratingMotion() {
  React.useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('nv-ai-analysis-motion')) return;
    const el = document.createElement('style');
    el.id = 'nv-ai-analysis-motion';
    el.textContent = GENERATING_MOTION_CSS;
    document.head.appendChild(el);
  }, []);
}

// Existence-checked, reference-only session context - never the raw chart/scenario/pattern data
// itself (this stays a light request payload, not a data dump). Mirrors analysis-context.js's own
// "pure data assembly, never invents a value" discipline: a context type is included only when the
// session genuinely has it, matching brief item 5's "only show context types that actually exist".
function buildSessionContextRefs(session) {
  const entries = session.entries || [];
  const scenarios = [];
  entries.forEach((entry) => (entry.scenarios || []).forEach((scenario) => scenarios.push(scenario)));
  const reversedEntries = entries.slice().reverse();
  const latestChart = reversedEntries.find((e) => e.type === 'chart' && (e.hasImage || e.preview || e.imageBlobId));
  const latestMovement = reversedEntries.find((e) => e.type === 'movement');
  const activeScenarios = scenarios.filter((s) => !s.occurred && !((s.confirmedInvalidationTagIds || []).length));
  const patternScenarios = scenarios.filter((s) => s.pattern && (s.pattern.stages || []).length);
  const strategyScenarios = scenarios.filter((s) => s.strategy || (s.pattern && s.pattern.name));
  return {
    latestChartEntryId: latestChart ? latestChart.id : null,
    previousMovementEntryId: latestMovement ? latestMovement.id : null,
    activeScenarioIds: activeScenarios.map((s) => s.id),
    patternScenarioIds: patternScenarios.map((s) => s.id),
    hasStrategyContext: strategyScenarios.length > 0,
    previousAiAnalysisAvailable: Boolean(session.aiSessionAnalysisResult)
  };
}

function ContextRow({ icon, label, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
      <span style={{ color: 'var(--char-accent)', flex: 'none', display: 'flex' }}><Icon name={icon} size={14} /></span>
      <span style={{ fontSize: 11.5, color: 'var(--text-primary)' }}>{label}</span>
      {count !== undefined && <span className="navrya-tabular" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>× {count}</span>}
    </div>
  );
}

function GeneratingStages({ lang, stageIndex }) {
  useGeneratingMotion();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0' }}>
      {GENERATION_STAGES.map((stage, i) => {
        const state = i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'pending';
        return (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, opacity: state === 'pending' ? 0.45 : 1 }}>
            <span
              data-nv-ai-stage={state === 'active' ? 'active' : undefined}
              style={{
                width: 20, height: 20, flex: 'none', borderRadius: '50%', display: 'grid', placeItems: 'center',
                border: '1px solid ' + (state === 'pending' ? 'var(--border-hairline)' : 'var(--char-accent)'),
                background: state === 'done' ? 'var(--char-active-surface)' : 'transparent', color: 'var(--char-accent)'
              }}
            >
              {state === 'done' ? <Icon name="check" size={12} /> : <Icon name="sparkle" size={11} />}
            </span>
            <span style={{ fontSize: 12, color: state === 'active' ? 'var(--text-primary)' : 'var(--text-muted)' }}>{tr(lang, 'stage_' + stage)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* The Session workspace's "AI Analysis" popup (brief: request collection → demo generating
   sequence → placeholder result). `session` is the real, normalized session record
   (window.TradeJournalWorkspace.find(sessionId)'s own return shape) - this component only ever
   reads it, never mutates a scenario/pattern/probability (that stays out of scope for this phase,
   per the brief). */
export function SessionAiAnalysisModal({ session, lang, onClose }) {
  const activeLang = lang || 'fa';
  const rtl = activeLang === 'fa' || activeLang === 'ar';

  const [userView, setUserView] = React.useState('');
  const [provider, setProvider] = React.useState(() => (aiSettingsStore() ? aiSettingsStore().activeProvider() : 'openai'));
  const [model, setModel] = React.useState(() => (aiSettingsStore() ? aiSettingsStore().activeModel() : ''));
  const [profileId, setProfileId] = React.useState(() => {
    const store = profileStore();
    const def = store ? store.getDefault() : null;
    return def ? def.id : '';
  });
  const [adherenceIndex, setAdherenceIndex] = React.useState(1); // 0 open · 1 balanced (default) · 2 strict
  const [quickCreateOpen, setQuickCreateOpen] = React.useState(false);
  const [phase, setPhase] = React.useState('form'); // 'form' | 'generating' | 'result'
  const [stageIndex, setStageIndex] = React.useState(0);
  const requestRef = React.useRef(null);

  // Re-read on every render (profiles/settings can change while this popup is open, e.g. a quick
  // profile just created) rather than snapshotting once at mount.
  const profiles = profileStore() ? profileStore().listSync().filter((p) => p.isActive) : [];
  const catalog = aiSettingsStore() ? aiSettingsStore().providerCatalog() : [];

  const modelOptions = React.useMemo(() => {
    const out = [];
    catalog.forEach((p) => {
      (p.models || []).forEach((m) => {
        const label = (p.modelLabels && p.modelLabels[m]) || m;
        out.push({ value: p.id + '::' + m, label: p.label + ' — ' + label });
      });
    });
    return out;
  }, [catalog]);
  const combinedModelValue = provider + '::' + model;
  function handleModelChange(value) {
    const sep = value.indexOf('::');
    if (sep === -1) return;
    setProvider(value.slice(0, sep));
    setModel(value.slice(sep + 2));
  }

  const profileOptions = [{ value: '', label: tr(activeLang, 'profileNone') }].concat(
    profiles.map((p) => ({ value: p.id, label: p.name || p.id }))
  );

  const contextRefs = React.useMemo(() => buildSessionContextRefs(session), [session]);
  const contextRows = [
    contextRefs.latestChartEntryId && { icon: 'image', label: tr(activeLang, 'ctxLatestChart') },
    contextRefs.previousMovementEntryId && { icon: 'activity', label: tr(activeLang, 'ctxPreviousMovement') },
    contextRefs.activeScenarioIds.length > 0 && { icon: 'scenarios', label: tr(activeLang, 'ctxActiveScenarios'), count: contextRefs.activeScenarioIds.length },
    contextRefs.patternScenarioIds.length > 0 && { icon: 'layers', label: tr(activeLang, 'ctxPatternStates'), count: contextRefs.patternScenarioIds.length },
    contextRefs.hasStrategyContext && { icon: 'strategies', label: tr(activeLang, 'ctxStrategy') },
    contextRefs.previousAiAnalysisAvailable && { icon: 'history', label: tr(activeLang, 'ctxPreviousAnalysis') }
  ].filter(Boolean);

  function handleQuickCreateComplete(draft) {
    const store = profileStore();
    if (!store) { setQuickCreateOpen(false); return; }
    const created = store.create(draft);
    if (created) setProfileId(created.id);
    setQuickCreateOpen(false);
  }

  // Builds the clean request object the next phase's real Session AI Analysis engine is meant to
  // consume (see this file's own header comment) - assembled once per submit, never mutated
  // afterwards. analysisContext/analysisStyle/focusAreas resolve through the exact same
  // window.TradeJournalAnalysisContext.getAnalysisContext() boundary analysis-context.js already
  // documents as this feature's intended caller, so nothing about the Analysis Profile domain is
  // re-read or re-derived by hand here.
  function buildAnalysisRequest() {
    const context = (profileId && analysisContextApi()) ? analysisContextApi().getAnalysisContext(profileId) : null;
    return {
      sessionId: session.id,
      requestedAt: new Date().toISOString(),
      userView: userView.trim(),
      provider, model,
      analysisProfile: profileId || null,
      analysisContext: context,
      analysisStyle: (context && context.primaryStyle && context.primaryStyle.id) || null,
      focusAreas: context ? context.focuses.map((f) => f.id) : [],
      adherence: ADHERENCE_LEVELS[adherenceIndex],
      sessionContext: contextRefs
    };
  }

  // PHASE-2 SEAM: startAnalysis() only ever builds the request object above and drives a fixed,
  // local, timer-based demo sequence - no network/model call happens here (brief: "do not
  // implement the final trading-analysis engine in this task"). The real integration point is
  // exactly this function body: replace the two setTimeout-driven effects below with a real async
  // call fed `requestRef.current`, and replace the fixed 'result' placeholder JSX (bottom of this
  // file) with the real rendered analysis - the request-collection UI above needs no changes for
  // that swap.
  function startAnalysis() {
    requestRef.current = buildAnalysisRequest();
    setStageIndex(0);
    setPhase('generating');
  }

  React.useEffect(() => {
    if (phase !== 'generating') return undefined;
    if (stageIndex >= GENERATION_STAGES.length - 1) {
      const done = window.setTimeout(() => setPhase('result'), 700);
      return () => window.clearTimeout(done);
    }
    const step = window.setTimeout(() => setStageIndex((i) => i + 1), 520);
    return () => window.clearTimeout(step);
  }, [phase, stageIndex]);

  const canGoBackToForm = phase !== 'generating';

  return (
    <React.Fragment>
      <Modal
        open={!quickCreateOpen} title={tr(activeLang, 'title')} icon="sparkle" onClose={canGoBackToForm ? onClose : undefined}
        eyebrow={{ left: 'NAVRYA · AI ANALYSIS', right: tr(activeLang, 'eyebrowRight') }}
        width={620}
        footer={
          phase === 'form' ? (
            <React.Fragment>
              <Button variant="ghost" onClick={onClose}>{tr(activeLang, 'cancel')}</Button>
              <span style={{ marginInlineStart: 'auto' }}>
                <Button variant="primary" icon="sparkle" onClick={startAnalysis}>{tr(activeLang, 'startAnalysis')}</Button>
              </span>
            </React.Fragment>
          ) : phase === 'result' ? (
            <span style={{ marginInlineStart: 'auto' }}>
              <Button variant="primary" onClick={onClose}>{tr(activeLang, 'close')}</Button>
            </span>
          ) : null
        }
      >
        <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {phase === 'form' && (
            <React.Fragment>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(activeLang, 'userViewLabel')}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr(activeLang, 'userViewHelper')}</span>
                <textarea
                  value={userView} onChange={(e) => setUserView(e.target.value)} dir="auto" rows={3}
                  placeholder={tr(activeLang, 'userViewPlaceholder')}
                  style={{
                    resize: 'vertical', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-gold)',
                    background: 'rgba(11,20,21,.72)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5
                  }}
                />
                <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(activeLang, 'userViewNote')}</span>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(activeLang, 'modelLabel')}</span>
                <Select value={combinedModelValue} onChange={handleModelChange} options={modelOptions} icon="sparkle" width="100%" />
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(activeLang, 'profileLabel')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1 }}><Select value={profileId} onChange={setProfileId} options={profileOptions} icon="strategies" width="100%" /></span>
                  <button
                    type="button" onClick={() => setQuickCreateOpen(true)} aria-label={tr(activeLang, 'addProfile')} title={tr(activeLang, 'addProfile')}
                    style={{
                      width: 44, height: 44, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center', cursor: 'pointer',
                      border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--char-accent)'
                    }}
                  ><Icon name="plus" size={16} /></button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(activeLang, 'adherenceLabel')}</span>
                <input
                  type="range" min="0" max="2" step="1" value={adherenceIndex}
                  onChange={(e) => setAdherenceIndex(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--char-accent)', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)' }}>
                  {ADHERENCE_LEVELS.map((level) => <span key={level}>{tr(activeLang, 'adherenceTitle')[level]}</span>)}
                </div>
                <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(3,8,7,.4)', border: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: 11.5, color: 'var(--text-primary)' }}>
                    <b>{tr(activeLang, 'adherenceTitle')[ADHERENCE_LEVELS[adherenceIndex]]}</b> — {tr(activeLang, 'adherenceDesc')[ADHERENCE_LEVELS[adherenceIndex]]}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 10, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.35)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr(activeLang, 'contextTitle')}</span>
                {contextRows.length ? contextRows.map((row) => <ContextRow key={row.icon + row.label} {...row} />) : (
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(activeLang, 'contextEmpty')}</span>
                )}
              </div>
            </React.Fragment>
          )}

          {phase === 'generating' && <GeneratingStages lang={activeLang} stageIndex={stageIndex} />}

          {phase === 'result' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '22px 10px', textAlign: 'center' }}>
              <span style={{ width: 44, height: 44, borderRadius: 999, display: 'grid', placeItems: 'center', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}>
                <Icon name="sparkle" size={20} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--parchment)' }}>{tr(activeLang, 'resultTitle')}</span>
              <p style={{ margin: 0, maxWidth: 380, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>{tr(activeLang, 'resultPlaceholder')}</p>
            </div>
          )}
        </div>
      </Modal>
      {quickCreateOpen && (
        <AnalysisProfileOnboarding mode="create" lang={activeLang} onComplete={handleQuickCreateComplete} onCancel={() => setQuickCreateOpen(false)} />
      )}
    </React.Fragment>
  );
}
