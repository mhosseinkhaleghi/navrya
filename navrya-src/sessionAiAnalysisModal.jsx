import React from 'react';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { AiThinkingOrb } from '../public/pages/shared/navrya/components/feedback/AiThinkingOrb.jsx';
import { AnalysisProfileOnboarding } from './analysisProfileOnboarding.jsx';
import { SessionAnalysisCard } from './sessionAnalysisCard.jsx';

// Session AI Analysis - the popup behind the Session workspace's existing "AI Analysis"
// ("شروع تحلیل") button (liveSessionView.jsx's FateSummaryModal, wired at its own call site -
// this file owns none of that button's DOM, only what opens when it is clicked). Request-
// collection UI below is unchanged from the original PHASE-2 scaffold; startAnalysis() now makes
// the real call through window.TradeJournalSessionAnalysisClient (server/pattern-ai-server.mjs's
// POST /api/sessions/analyze) instead of the old fixed setTimeout demo sequence.
//
// Reuses, never re-implements: the shared Modal/Button/Select/Icon design system, the Analysis
// Profiles domain (window.TradeJournalAnalysisProfileStore + the style/focus registries, via
// window.TradeJournalAnalysisContext.getAnalysisContext - see ARCHITECTURE.md §7.25), and
// AnalysisProfileOnboarding.jsx's existing real two-step style→focus wizard for the "+" quick-
// create affordance - never a second, parallel style/focus picker. Scenario add/visualize/
// evaluate persistence stays owned entirely by liveSessionView.jsx, reached only through the
// onAddScenario/onVisualizeScenario/onResult callback props below - this file never writes to
// window.TradeJournalWorkspace itself.

function analysisClient() { return window.TradeJournalSessionAnalysisClient; }

function profileStore() { return window.TradeJournalAnalysisProfileStore; }
function aiSettingsStore() { return window.TradeJournalAISettingsStore; }
function analysisContextApi() { return window.TradeJournalAnalysisContext; }

const ADHERENCE_LEVELS = ['open', 'balanced', 'strict'];

// Honest, ever-varying "what the AI is doing" feed (brief §27 loading experience, revised
// 2026-09-01): a real analysis call has no observable intermediate progress this client can
// report - previously this cycled a FIXED list of 6 generic phrases every 1.4s, which visibly
// looped 5-15+ times over a real 30-120s request (confirmed live: the trader reported it read as
// obviously fake). Replaced with a much larger, shuffled, non-immediately-repeating pool, each
// phrase tied to a real field this analysis call's structured JSON schema actually asks the model
// to fill (thesis/stateMetrics/blocks/scenarios/scenarioEvaluations/watchItems/unknowns/
// confidence/memoryUpdate) - see GeneratingView below, which shows only a small stacked handful at
// a time, never the whole pool at once. `evaluation` phrases are appended only for a
// SCENARIO_EVALUATION request (isEvaluation), matching that analysisType's own narrower system
// prompt above.
const AI_THINKING_PHRASES = {
  fa: {
    base: [
      'در حال بررسی کندل‌های اخیر چارت…', 'در حال تشخیص محدوده‌های قیمتی کلیدی…', 'در حال بررسی حجم و شتاب حرکت…',
      'در حال مرور حافظه سشن…', 'در حال بررسی خلاصه تحلیل قبلی…', 'در حال بررسی سناریوهای فعال…',
      'در حال سنجش نقاط ابطال…', 'در حال تطبیق با الگوهای ثبت‌شده…', 'در حال بررسی استراتژی انتخابی…',
      'در حال اعمال سبک تحلیل…', 'در حال شکل‌دادن به فرضیه اصلی بازار…', 'در حال یادداشت‌برداری از نواحی حمایت و مقاومت…',
      'در حال بررسی تناقض‌های احتمالی در شواهد…', 'در حال تخمین احتمال سناریوهای جدید…', 'در حال سنجش سطح اطمینان تحلیل…',
      'در حال نوشتن نکات قابل پایش…', 'در حال جمع‌بندی موارد نامشخص…', 'در حال آماده‌سازی خروجی نهایی…'
    ],
    evaluation: ['در حال ارزیابی وضعیت سناریوی انتخابی…', 'در حال بررسی محرک‌ها و شواهد تأییدکننده…']
  },
  ar: {
    base: [
      'جارٍ مراجعة الشموع الأخيرة للرسم البياني…', 'جارٍ تحديد المستويات السعرية الرئيسية…', 'جارٍ فحص الحجم وزخم الحركة…',
      'جارٍ استرجاع ذاكرة الجلسة…', 'جارٍ مراجعة ملخص التحليل السابق…', 'جارٍ مراجعة السيناريوهات النشطة…',
      'جارٍ تقييم نقاط الإبطال…', 'جارٍ المطابقة مع الأنماط المسجلة…', 'جارٍ مراجعة الاستراتيجية المختارة…',
      'جارٍ تطبيق أسلوب التحليل…', 'جارٍ صياغة الفرضية الأساسية للسوق…', 'جارٍ تدوين مناطق الدعم والمقاومة…',
      'جارٍ فحص التناقضات المحتملة في الأدلة…', 'جارٍ تقدير احتمالية سيناريوهات جديدة…', 'جارٍ تقييم مستوى الثقة في التحليل…',
      'جارٍ كتابة النقاط الجديرة بالمتابعة…', 'جارٍ تجميع النقاط غير الواضحة…', 'جارٍ تجهيز المخرجات النهائية…'
    ],
    evaluation: ['جارٍ تقييم حالة السيناريو المحدد…', 'جارٍ مراجعة المحفزات والأدلة المؤكدة…']
  },
  en: {
    base: [
      'Reading the recent candles…', 'Mapping key price levels…', 'Checking volume and momentum…',
      'Recalling session memory…', 'Reviewing the previous analysis summary…', 'Reviewing active scenarios…',
      'Weighing invalidation points…', 'Matching against registered patterns…', 'Reviewing the selected strategy…',
      'Applying the analysis style…', 'Shaping the primary market thesis…', 'Noting support and resistance zones…',
      'Checking evidence for contradictions…', 'Estimating new scenario probabilities…', 'Weighing the overall confidence level…',
      'Writing down watch items…', 'Gathering remaining unknowns…', 'Preparing the final structured output…'
    ],
    evaluation: ['Evaluating the targeted scenario…', 'Reviewing triggers and confirming evidence…']
  },
  es: {
    base: [
      'Leyendo las velas recientes…', 'Mapeando niveles de precio clave…', 'Revisando volumen y momentum…',
      'Recuperando la memoria de la sesión…', 'Revisando el resumen del análisis anterior…', 'Revisando escenarios activos…',
      'Evaluando puntos de invalidación…', 'Comparando con patrones registrados…', 'Revisando la estrategia seleccionada…',
      'Aplicando el estilo de análisis…', 'Formulando la tesis principal del mercado…', 'Anotando zonas de soporte y resistencia…',
      'Buscando contradicciones en la evidencia…', 'Estimando la probabilidad de nuevos escenarios…', 'Evaluando el nivel de confianza…',
      'Redactando puntos a vigilar…', 'Reuniendo lo que aún no está claro…', 'Preparando el resultado final…'
    ],
    evaluation: ['Evaluando el escenario indicado…', 'Revisando disparadores y evidencia de confirmación…']
  }
};

function shuffled(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

// Drives the stacked status feed: draws phrases from a shuffled queue (never the same phrase
// twice in a row, and never the same order twice), reshuffling only once the queue is exhausted -
// so a long real request (observed live: 30-120s+ on some models) shows genuinely varied text
// rather than a short fixed loop. Keeps only the last 4 emitted items in state; GeneratingView
// below renders the last 3 of those, fading older ones rather than showing every phrase at once.
function useAiThinkingFeed(active, phrases, intervalMs) {
  const [items, setItems] = React.useState([]);
  const queueRef = React.useRef([]);
  const idRef = React.useRef(0);
  const phrasesRef = React.useRef(phrases);
  phrasesRef.current = phrases;
  function nextPhrase() {
    if (queueRef.current.length === 0) queueRef.current = shuffled(phrasesRef.current);
    return queueRef.current.pop();
  }
  React.useEffect(() => {
    if (!active) { setItems([]); queueRef.current = []; return undefined; }
    setItems([{ id: idRef.current++, text: nextPhrase() }]);
    const timer = window.setInterval(() => {
      setItems((prev) => prev.concat([{ id: idRef.current++, text: nextPhrase() }]).slice(-4));
    }, intervalMs);
    return () => window.clearInterval(timer);
    // Deliberately keyed only on `active` - a new phrase pool (e.g. isEvaluation toggling) simply
    // takes effect on the NEXT draw rather than restarting the whole feed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return items;
}

const THINKING_FEED_CSS = `
@keyframes nv-thinking-line-enter{
  0%{opacity:0;transform:translateY(6px)}
  100%{opacity:1;transform:translateY(0)}
}
[data-nv-thinking-line]{animation:nv-thinking-line-enter 380ms var(--ease-out,cubic-bezier(.22,.61,.36,1)) both}
@media (prefers-reduced-motion:reduce){
  [data-nv-thinking-line]{animation:none!important}
}
`;
function useThinkingFeedMotion() {
  React.useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('nv-thinking-feed-motion')) return;
    const el = document.createElement('style');
    el.id = 'nv-thinking-feed-motion';
    el.textContent = THINKING_FEED_CSS;
    document.head.appendChild(el);
  }, []);
}

// The modal's 'generating' body: AiThinkingOrb (design-system loading motion, see that
// component's own header comment) above a small stack of the live status feed - newest line at
// the bottom, brightest; older lines fade upward and drop out once a 4th arrives. Replaces the
// old fixed 6-item checklist entirely.
function GeneratingView({ lang, active, isEvaluation }) {
  useThinkingFeedMotion();
  const pool = AI_THINKING_PHRASES[lang] || AI_THINKING_PHRASES.en;
  const phrases = React.useMemo(() => pool.base.concat(isEvaluation ? pool.evaluation : []), [pool, isEvaluation]);
  const items = useAiThinkingFeed(active, phrases, 1900);
  const visible = items.slice(-3);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '20px 6px 8px' }}>
      <AiThinkingOrb size={64} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 78, width: '100%', maxWidth: 380 }}>
        {visible.map((item, idx) => {
          const fromBottom = visible.length - 1 - idx;
          return (
            <div
              key={item.id} data-nv-thinking-line dir="auto"
              style={{
                textAlign: 'center', fontSize: fromBottom === 0 ? 12.5 : 11,
                color: fromBottom === 0 ? 'var(--text-primary)' : 'var(--text-dim)',
                opacity: fromBottom === 0 ? 1 : fromBottom === 1 ? 0.55 : 0.25,
                transition: 'opacity 420ms var(--ease-out,ease), font-size 420ms var(--ease-out,ease)'
              }}
            >
              {item.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
    startAnalysis: 'شروع تحلیل', cancel: 'انصراف', close: 'بستن', retry: 'تلاش دوباره', regenerate: 'تحلیل مجدد',
    errorTitle: 'تحلیل انجام نشد', switchModel: 'تغییر مدل',
    err_MODEL_VISION_UNSUPPORTED: 'مدل انتخاب‌شده نمی‌تواند تصویر چارت را تحلیل کند.',
    err_NETWORK_ERROR: 'ارتباط با سرور تحلیل برقرار نشد.',
    err_ANALYSIS_FAILED: 'تحلیل با خطا مواجه شد. لطفاً دوباره تلاش کنید.',
    err_ANALYSIS_OUTPUT_TRUNCATED: 'پاسخ هوش مصنوعی خیلی طولانی شد و ناتمام ماند. لطفاً دوباره تلاش کنید.',
    err_PROVIDER_TIMEOUT: 'این مدل بیش از حد معمول طول کشید. لطفاً دوباره تلاش کنید یا مدل دیگری انتخاب کنید.',
    unsupportedVisionInline: 'مدل انتخاب‌شده نمی‌تواند چارت را ببیند — مدل دیگری انتخاب کنید.'
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
    startAnalysis: 'بدء التحليل', cancel: 'إلغاء', close: 'إغلاق', retry: 'إعادة المحاولة', regenerate: 'إعادة التحليل',
    errorTitle: 'تعذّر إجراء التحليل', switchModel: 'تغيير النموذج',
    err_MODEL_VISION_UNSUPPORTED: 'النموذج المختار لا يمكنه تحليل صورة المخطط.',
    err_NETWORK_ERROR: 'تعذّر الاتصال بخادم التحليل.',
    err_ANALYSIS_FAILED: 'فشل التحليل. حاول مرة أخرى.',
    err_ANALYSIS_OUTPUT_TRUNCATED: 'استجابة الذكاء الاصطناعي كانت طويلة جداً وتوقفت قبل الاكتمال. حاول مرة أخرى.',
    err_PROVIDER_TIMEOUT: 'استغرق هذا النموذج وقتاً أطول من المعتاد. حاول مرة أخرى أو اختر نموذجاً آخر.',
    unsupportedVisionInline: 'النموذج المختار لا يمكنه رؤية المخطط — اختر نموذجاً آخر.'
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
    startAnalysis: 'Start analysis', cancel: 'Cancel', close: 'Close', retry: 'Retry', regenerate: 'Regenerate',
    errorTitle: 'Analysis failed', switchModel: 'Switch model',
    err_MODEL_VISION_UNSUPPORTED: 'The selected model cannot analyze chart images.',
    err_NETWORK_ERROR: "Couldn't reach the analysis server.",
    err_ANALYSIS_FAILED: 'The analysis failed. Please try again.',
    err_ANALYSIS_OUTPUT_TRUNCATED: "The AI's response was too long and got cut off. Please try again.",
    err_PROVIDER_TIMEOUT: 'This model took longer than usual. Please try again or pick a different model.',
    unsupportedVisionInline: "This model can't see the chart — choose a different model."
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
    startAnalysis: 'Iniciar análisis', cancel: 'Cancelar', close: 'Cerrar', retry: 'Reintentar', regenerate: 'Regenerar',
    errorTitle: 'El análisis falló', switchModel: 'Cambiar modelo',
    err_MODEL_VISION_UNSUPPORTED: 'El modelo elegido no puede analizar imágenes de gráficos.',
    err_NETWORK_ERROR: 'No se pudo conectar con el servidor de análisis.',
    err_ANALYSIS_FAILED: 'El análisis falló. Inténtalo de nuevo.',
    err_ANALYSIS_OUTPUT_TRUNCATED: 'La respuesta de la IA fue demasiado larga y se cortó. Inténtalo de nuevo.',
    err_PROVIDER_TIMEOUT: 'Este modelo tardó más de lo habitual. Inténtalo de nuevo o elige otro modelo.',
    unsupportedVisionInline: 'Este modelo no puede ver el gráfico — elige otro modelo.'
  }
};
function tr(lang, key) { return (copy[lang] && copy[lang][key]) || copy.en[key] || key; }

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

/* The Session workspace's "AI Analysis" popup (request collection → real analysis call → the
   Adaptive Analysis Card). `session` is the real, normalized session record
   (window.TradeJournalWorkspace.find(sessionId)'s own return shape) - this component never
   mutates it directly; a successful analysis is reported upward via onResult(patches) and a
   scenario add/visualize action via onAddScenario/onVisualizeScenario, all applied by
   liveSessionView.jsx through its own existing persist()/addScenario() functions (brief §20).
   `entry` (optional) pins "the current chart" this analysis targets - defaults to the session's
   own latest chart entry (buildSessionContextRefs().latestChartEntryId) when omitted, e.g. when
   opened from the whole-session Fate flow. `scenarioTargets` (optional, scenario ids) switches
   this into a SCENARIO_EVALUATION request instead of INITIAL/UPDATE. */
export function SessionAiAnalysisModal({ session, entry: pinnedEntry, lang, character, onClose, onResult, onAddScenario, onVisualizeScenario, onVisualizeAnalysis, addedScenarioKeys, scenarioVisualizations, analysisVisualization, scenarioTitleFor, scenarioTargets }) {
  const activeLang = lang || 'fa';
  const rtl = activeLang === 'fa' || activeLang === 'ar';

  // "View analysis again" (not just "start a new one"): a plain evaluation-mode-aware, cheap
  // per-render derivation (not a hook) - when this popup is opened for an entry that already has a
  // saved real analysis, show that saved result immediately rather than always restarting at the
  // empty form. Evaluation requests (scenarioTargets set) never have their own saved result to show
  // this way - they always start fresh.
  const hasSavedResult = !(Array.isArray(scenarioTargets) && scenarioTargets.length > 0) && !!(pinnedEntry && pinnedEntry.aiAnalysisResult);

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
  const [phase, setPhase] = React.useState(hasSavedResult ? 'result' : 'form'); // 'form' | 'generating' | 'result' | 'error'
  const [analysisResult, setAnalysisResult] = React.useState(hasSavedResult ? pinnedEntry.aiAnalysisResult : null);
  const [analysisMeta, setAnalysisMeta] = React.useState(hasSavedResult ? { cached: true, entry: pinnedEntry } : null);
  const [errorCode, setErrorCode] = React.useState(null);
  // Self-contained "Visualize Scenario" loading/result state for THIS popup's own result card -
  // independent of whatever a caller separately tracks for its own inline card elsewhere (e.g.
  // FateSummaryModal's own persisted-result view), so this modal renders a real loading/ready
  // state regardless of which parent opened it (brief §27 loading experience).
  const [localVisualizations, setLocalVisualizations] = React.useState({});
  // Same self-contained reasoning as localVisualizations above, for the whole-analysis overlay -
  // seeded from the entry's own persisted entry.aiAnalysisResult.wholeVisualization when reopening
  // an existing analysis (hasSavedResult), so "view analysis again" also shows a previously
  // generated overlay without regenerating it.
  const [localAnalysisVisualization, setLocalAnalysisVisualization] = React.useState(
    hasSavedResult && pinnedEntry.aiAnalysisResult.wholeVisualization ? pinnedEntry.aiAnalysisResult.wholeVisualization : null
  );
  const requestRef = React.useRef(null);

  const isEvaluation = Array.isArray(scenarioTargets) && scenarioTargets.length > 0;
  const targetEntry = pinnedEntry || (function () {
    const entries = (session.entries || []).slice().reverse();
    return entries.find((e) => e.type === 'chart' && (e.hasImage || e.preview || e.imageBlobId)) || null;
  }());
  const hasChartImage = !!(targetEntry && (targetEntry.hasImage || targetEntry.preview || targetEntry.imageBlobId));
  const capabilities = aiSettingsStore() ? aiSettingsStore().capabilitiesFor(provider) : { supportsVision: false };
  const visionBlocked = hasChartImage && !capabilities.supportsVision;

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

  // The one real network call this component ever makes (brief §4 "ABSOLUTE RULE: one analysis =
  // one model call") - routed entirely through window.TradeJournalSessionAnalysisClient
  // (analysis-context.js's getAnalysisContext() is still the sole source for style/focus data;
  // this function only resolves it once and hands the bundle to the client, never re-derives it).
  // A cache hit (session-analysis-client.js's own fingerprint check) resolves with zero network
  // call at all - see that file's findCachedAnalysis().
  async function startAnalysis(forceRegenerate) {
    if (visionBlocked) return;
    const client = analysisClient();
    if (!client) { setErrorCode('ANALYSIS_FAILED'); setPhase('error'); return; }
    const context = (profileId && analysisContextApi()) ? analysisContextApi().getAnalysisContext(profileId) : null;
    const request = {
      session, character, entry: targetEntry,
      analysisType: isEvaluation ? 'scenario_evaluation' : undefined,
      scenarioTargets: isEvaluation ? scenarioTargets : undefined,
      userView: userView.trim(), provider, model, language: activeLang,
      profileId: profileId || null, analysisContext: context, adherence: ADHERENCE_LEVELS[adherenceIndex],
      forceRegenerate: !!forceRegenerate
    };
    requestRef.current = request;
    setPhase('generating');
    const outcome = await client.analyzeSession(request);
    if (!outcome.ok) {
      setErrorCode(outcome.error || 'ANALYSIS_FAILED');
      setPhase('error');
      return;
    }
    setAnalysisResult(outcome.result);
    setAnalysisMeta({ cached: outcome.cached, entry: targetEntry });
    // A cache hit legitimately reuses (and should keep showing) the entry's own persisted
    // wholeVisualization; a genuinely NEW analysis has no visualization of its own yet.
    setLocalAnalysisVisualization(outcome.cached ? outcome.result.wholeVisualization || null : null);
    setPhase('result');
    if (onResult) onResult(outcome.result, { entry: targetEntry });
  }

  const canGoBackToForm = phase !== 'generating';

  // Self-computed from the real, persisted entry (not from whatever a caller happens to track),
  // so the "Added" button state is correct for every caller of this modal without extra plumbing -
  // a caller-supplied addedScenarioKeys prop (e.g. FateSummaryModal's own inline card) is still
  // honored, merged in.
  const computedAddedScenarioKeys = React.useMemo(() => {
    const keys = new Set(addedScenarioKeys || []);
    const targetForResult = (analysisMeta && analysisMeta.entry) || null;
    if (targetForResult && analysisResult) {
      (targetForResult.scenarios || []).forEach((sc) => {
        if (sc.aiSource && sc.aiSource.analysisId === analysisResult.analysisId) keys.add(sc.aiSource.generatedScenarioKey);
      });
    }
    return keys;
  }, [addedScenarioKeys, analysisMeta, analysisResult]);
  // Production bug (2026-09-01): a scenario's own generated image "disappeared again" the moment
  // this popup was closed and reopened - see session-analysis-client.js's own
  // hydrateScenarioVisualizations() comment for the real cause (only ephemeral, per-mount React
  // state was ever consulted, never the real, already-persisted Scenario's own aiVisualization).
  // Lowest precedence here on purpose: a caller-supplied prop or a freshly-generated-this-session
  // local result must still win over what was merely true when this popup first mounted.
  const hydratedVisualizations = React.useMemo(() => {
    const client = analysisClient();
    const entryForHydration = analysisMeta && analysisMeta.entry;
    return client && entryForHydration && analysisResult ? client.hydrateScenarioVisualizations(entryForHydration, analysisResult) : {};
  }, [analysisMeta, analysisResult]);
  const mergedVisualizations = React.useMemo(() => ({ ...hydratedVisualizations, ...(scenarioVisualizations || {}), ...localVisualizations }), [hydratedVisualizations, scenarioVisualizations, localVisualizations]);
  async function handleVisualizeLocal(scenario) {
    setLocalVisualizations((prev) => ({ ...prev, [scenario.localKey]: { status: 'loading' } }));
    const ctx = { entry: analysisMeta && analysisMeta.entry, analysisId: analysisResult.analysisId };
    const outcome = onVisualizeScenario ? await onVisualizeScenario(scenario, ctx) : { ok: false };
    setLocalVisualizations((prev) => ({ ...prev, [scenario.localKey]: outcome.ok ? outcome.visualization : { status: 'error' } }));
  }
  // A caller-supplied analysisVisualization (e.g. FateSummaryModal's own inline card, kept in sync
  // with the same persisted state) wins once set - same "caller state wins, local state is the
  // in-this-popup-session fallback" precedence as mergedVisualizations above.
  const mergedAnalysisVisualization = analysisVisualization || localAnalysisVisualization;
  async function handleVisualizeAnalysisLocal() {
    setLocalAnalysisVisualization({ status: 'loading' });
    const outcome = onVisualizeAnalysis ? await onVisualizeAnalysis(analysisResult, { entry: analysisMeta && analysisMeta.entry }) : { ok: false };
    setLocalAnalysisVisualization(outcome.ok ? outcome.visualization : { status: 'error' });
  }

  return (
    <React.Fragment>
      <Modal
        open={!quickCreateOpen} title={tr(activeLang, 'title')} icon="sparkle" onClose={canGoBackToForm ? onClose : undefined}
        eyebrow={{ left: 'NAVRYA · AI ANALYSIS', right: tr(activeLang, 'eyebrowRight') }}
        width={phase === 'result' ? 760 : 620}
        footer={
          phase === 'form' ? (
            <React.Fragment>
              <Button variant="ghost" onClick={onClose}>{tr(activeLang, 'cancel')}</Button>
              <span style={{ marginInlineStart: 'auto' }}>
                <Button variant="primary" icon="sparkle" disabled={visionBlocked} onClick={() => startAnalysis(false)}>{tr(activeLang, 'startAnalysis')}</Button>
              </span>
            </React.Fragment>
          ) : phase === 'result' ? (
            <React.Fragment>
              <Button variant="ghost" icon="sparkle" onClick={() => startAnalysis(true)}>{tr(activeLang, 'regenerate')}</Button>
              <span style={{ marginInlineStart: 'auto' }}>
                <Button variant="primary" onClick={onClose}>{tr(activeLang, 'close')}</Button>
              </span>
            </React.Fragment>
          ) : phase === 'error' ? (
            <React.Fragment>
              <Button variant="ghost" onClick={onClose}>{tr(activeLang, 'cancel')}</Button>
              <span style={{ marginInlineStart: 'auto' }}>
                <Button variant="primary" icon="sparkle" onClick={() => startAnalysis(false)}>{tr(activeLang, 'retry')}</Button>
              </span>
            </React.Fragment>
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

              {visionBlocked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, border: '1px solid var(--danger)', background: 'rgba(255,56,48,.08)' }}>
                  <Icon name="TriangleAlert" size={14} style={{ color: 'var(--danger)', flex: 'none' }} />
                  <span style={{ fontSize: 11, color: 'var(--danger)' }}>{tr(activeLang, 'unsupportedVisionInline')}</span>
                </div>
              )}
            </React.Fragment>
          )}

          {phase === 'generating' && <GeneratingView lang={activeLang} active={phase === 'generating'} isEvaluation={isEvaluation} />}

          {phase === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '22px 10px', textAlign: 'center' }}>
              <span style={{ width: 44, height: 44, borderRadius: 999, display: 'grid', placeItems: 'center', border: '1px solid var(--danger)', background: 'rgba(255,56,48,.1)', color: 'var(--danger)' }}>
                <Icon name="TriangleAlert" size={20} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--parchment)' }}>{tr(activeLang, 'errorTitle')}</span>
              <p style={{ margin: 0, maxWidth: 380, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>{tr(activeLang, 'err_' + errorCode) !== 'err_' + errorCode ? tr(activeLang, 'err_' + errorCode) : tr(activeLang, 'err_ANALYSIS_FAILED')}</p>
              {errorCode === 'MODEL_VISION_UNSUPPORTED' && (
                <Button variant="secondary" size="sm" onClick={() => setPhase('form')}>{tr(activeLang, 'switchModel')}</Button>
              )}
            </div>
          )}

          {phase === 'result' && analysisResult && (
            <SessionAnalysisCard
              result={analysisResult} lang={activeLang}
              memoryReceipt={window.TradeJournalSessionAnalysisClient ? window.TradeJournalSessionAnalysisClient.buildMemoryReceipt(session) : null}
              depth={requestRef.current ? requestRef.current.depth : 'auto'}
              addedScenarioKeys={computedAddedScenarioKeys}
              scenarioVisualizations={mergedVisualizations}
              scenarioTitleFor={scenarioTitleFor}
              onAddScenario={(scenario) => onAddScenario && onAddScenario(scenario, { entry: analysisMeta && analysisMeta.entry, analysisId: analysisResult.analysisId, provider: analysisResult.provider, model: analysisResult.model })}
              onVisualizeScenario={handleVisualizeLocal}
              onVisualizeAnalysis={analysisMeta && analysisMeta.entry ? handleVisualizeAnalysisLocal : null}
              analysisVisualization={mergedAnalysisVisualization}
            />
          )}
        </div>
      </Modal>
      {quickCreateOpen && (
        <AnalysisProfileOnboarding mode="create" lang={activeLang} onComplete={handleQuickCreateComplete} onCancel={() => setQuickCreateOpen(false)} />
      )}
    </React.Fragment>
  );
}
