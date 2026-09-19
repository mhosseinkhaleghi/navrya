import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { ModelGlyph } from '../public/pages/shared/navrya/components/assistant/ModelSwitcher.jsx';

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
    visualizeError: 'تولید تصویر ناموفق بود. دوباره تلاش کنید.',
    visualizeErrorBalance: 'موجودی کیف پول شما کافی نیست. از بخش کیف پول یا اشتراک شارژ کنید.',
    watchingTitle: 'در حال رصد', unknownsTitle: 'آنچه هنوز نمی‌دانم', changeViewTitle: 'چه چیزی نظرم را تغییر می‌دهد',
    confidenceTitle: 'میزان اطمینان تحلیل', deepAnalysis: 'تحلیل عمیق‌تر', collapse: 'بستن',
    noScenario: 'در حال حاضر سناریوی قابل‌اقدامی وجود ندارد.', tokenUsage: '{n} توکن',
    scenarioCheckTitle: 'ارزیابی سناریو', previousProbability: 'احتمال قبلی', currentProbability: 'احتمال فعلی', statusLabel: 'وضعیت',
    whatHappened: 'چه اتفاقی افتاد', confirmedBy: 'موارد تاییدکننده', contradictedBy: 'موارد نقض‌کننده', remainsUnresolved: 'موارد حل‌نشده',
    status_pending: 'در انتظار', status_strengthened: 'تقویت‌شده', status_weakened: 'تضعیف‌شده', status_partially_confirmed: 'تا حدی تایید‌شده', status_confirmed: 'تایید‌شده', status_invalidated: 'باطل‌شده',
    original: 'اصلی', scenarioMap: 'نقشه سناریو', regenerate: 'تحلیل مجدد',
    original_data_note: 'این تصویر یک روکش تصویری‌سازی‌شده است، نه داده واقعی بازار.',
    visualizeAnalysis: 'ترسیم کل تحلیل روی چارت', visualizingAnalysis: 'در حال ترسیم تحلیل…', visualizeAnalysisError: 'تولید تصویر تحلیل ناموفق بود. دوباره تلاش کنید.',
    visualizeAnalysisErrorBalance: 'موجودی کیف پول شما کافی نیست. از بخش کیف پول یا اشتراک شارژ کنید.',
    // Session / Analysis Desk AI upgrade
    requestResponseTitle: 'پاسخ به درخواست شما', requestedLabel: 'درخواست شما', answerLabel: 'پاسخ', limitationLabel: 'محدودیت',
    deferredScenariosTitle: 'در این نوبت ارزیابی نشد', deferredScenariosNote: 'برای ماندن در محدودیت یک فراخوانی، این سناریوهای فعال ارزیابی نشدند:',
    delta: 'تغییر',
    timeframeTitle: 'خوانش بر اساس تایم‌فریم', synthesisTitle: 'جمع‌بندی چند تایم‌فریم',
    trend_up: 'صعودی', trend_down: 'نزولی', trend_range: 'رنج', trend_unclear: 'نامشخص',
    momentum_accelerating: 'در حال شتاب‌گیری', momentum_decelerating: 'در حال کاهش شتاب', momentum_steady: 'ثابت', momentum_unclear: 'نامشخص',
    noteFeedbackTitle: 'بازخورد یادداشت‌های شما', noteEvidenceLabel: 'شواهد', noteCorrectionLabel: 'اصلاح', noteEncouragementLabel: 'نقطه قوت', noteWatchForLabel: 'در ادامه مراقب باشید',
    coverageTitle: 'پوشش مفاهیم اجباری', coverageSummary: '{applied} از {total} مفهوم اجباری اعمال شد', coverage_applied: 'اعمال شد', coverage_not_visible: 'روی چارت دیده نمی‌شود', coverage_not_applicable: 'مرتبط نیست', coverage_unaddressed: 'بررسی نشد', coverageUnaddressedHint: 'موتور این مفهوم را گزارش نکرد — به‌عنوان «بررسی نشد» ثبت شد، نه «اعمال شد».', coverageEvidence: 'شواهد',
    verdict_supported: 'تأیید شد', verdict_partially_supported: 'تا حدی تأیید شد', verdict_contradicted: 'نقض شد', verdict_insufficient_evidence: 'شواهد کافی نیست',
    unresolvedItemsTitle: 'موارد نامشخص و اقدام لازم', actionLabel: 'اقدام لازم', missingEvidenceLabel: 'شواهد ناقص',
    unresolvedStatus_open: 'باز', unresolvedStatus_partially_resolved: 'تا حدی حل‌شده', unresolvedStatus_resolved: 'حل‌شده', unresolvedStatus_superseded: 'جای خود را به مورد جدید داد',
    analyzedByLabel: 'تحلیل‌شده توسط'
  },
  ar: {
    header: 'تحليل الذكاء الاصطناعي للسوق', memoryChip: 'ذاكرة الجلسة · {n} حدث', depthAuto: 'تلقائي', depthEfficient: 'تحليل فعّال', depthDeep: 'تحليل عميق',
    thesisTitle: 'أطروحة السوق', whatChangedTitle: 'ما الذي تغيّر', tensionVs: 'مقابل',
    primaryScenario: 'السيناريو الأساسي', alternativeScenario: 'سيناريو بديل', tailRiskScenario: 'مخاطرة الذيل',
    triggerLabel: 'المحفز', invalidationLabel: 'نقطة الإبطال', confidenceLabel: 'الثقة',
    addToSession: 'إضافة سيناريو', added: 'تمت الإضافة', visualize: 'تصور السيناريو', visualizing: 'جارٍ الرسم…',
    visualizeError: 'فشل إنشاء الصورة. حاول مرة أخرى.',
    visualizeErrorBalance: 'رصيد محفظتك غير كافٍ. اشحن من قسم المحفظة أو الاشتراك.',
    watchingTitle: 'قيد المراقبة', unknownsTitle: 'ما لا أعرفه بعد', changeViewTitle: 'ما الذي قد يغيّر رأيي',
    confidenceTitle: 'مستوى ثقة التحليل', deepAnalysis: 'تحليل أعمق', collapse: 'إغلاق',
    noScenario: 'لا يوجد سيناريو قابل للتنفيذ حالياً.', tokenUsage: '{n} رمز',
    scenarioCheckTitle: 'تقييم السيناريو', previousProbability: 'الاحتمال السابق', currentProbability: 'الاحتمال الحالي', statusLabel: 'الحالة',
    whatHappened: 'ماذا حدث', confirmedBy: 'ما أكّد', contradictedBy: 'ما ناقض', remainsUnresolved: 'ما لم يُحسم',
    status_pending: 'قيد الانتظار', status_strengthened: 'تعزّز', status_weakened: 'ضعُف', status_partially_confirmed: 'تأكّد جزئياً', status_confirmed: 'تأكّد', status_invalidated: 'أُبطل',
    original: 'الأصلي', scenarioMap: 'خريطة السيناريو', regenerate: 'إعادة التحليل',
    original_data_note: 'هذه صورة توضيحية مولّدة، وليست بيانات سوق حقيقية.',
    visualizeAnalysis: 'رسم التحليل الكامل على الرسم البياني', visualizingAnalysis: 'جارٍ رسم التحليل…', visualizeAnalysisError: 'فشل إنشاء صورة التحليل. حاول مرة أخرى.',
    visualizeAnalysisErrorBalance: 'رصيد محفظتك غير كافٍ. اشحن من قسم المحفظة أو الاشتراك.',
    requestResponseTitle: 'الرد على طلبك', requestedLabel: 'طلبك', answerLabel: 'الإجابة', limitationLabel: 'القيود',
    deferredScenariosTitle: 'لم يتم تقييمها في هذه الجولة', deferredScenariosNote: 'للبقاء ضمن حد الاستدعاء الواحد، لم تُقيَّم هذه السيناريوهات النشطة:',
    delta: 'التغيّر',
    timeframeTitle: 'القراءة حسب الإطار الزمني', synthesisTitle: 'تجميع الأطر الزمنية',
    trend_up: 'صاعد', trend_down: 'نازل', trend_range: 'نطاق', trend_unclear: 'غير واضح',
    momentum_accelerating: 'يتسارع', momentum_decelerating: 'يتباطأ', momentum_steady: 'ثابت', momentum_unclear: 'غير واضح',
    noteFeedbackTitle: 'ملاحظات على يومياتك', noteEvidenceLabel: 'الدليل', noteCorrectionLabel: 'تصحيح', noteEncouragementLabel: 'نقطة قوة', noteWatchForLabel: 'راقب هذا لاحقاً',
    coverageTitle: 'تغطية المفاهيم الإلزامية', coverageSummary: 'تم تطبيق {applied} من {total} مفهوم إلزامي', coverage_applied: 'طُبّق', coverage_not_visible: 'غير ظاهر في الرسم', coverage_not_applicable: 'غير منطبق', coverage_unaddressed: 'لم يُفحص', coverageUnaddressedHint: 'لم يُبلغ المحرك عن هذا المفهوم — سُجّل كـ«لم يُفحص» وليس «طُبّق».', coverageEvidence: 'الدليل',
    verdict_supported: 'مؤكَّد', verdict_partially_supported: 'مؤكَّد جزئياً', verdict_contradicted: 'مخالِف', verdict_insufficient_evidence: 'دليل غير كافٍ',
    unresolvedItemsTitle: 'نقاط غير واضحة وإجراء مطلوب', actionLabel: 'الإجراء المطلوب', missingEvidenceLabel: 'الدليل الناقص',
    unresolvedStatus_open: 'مفتوح', unresolvedStatus_partially_resolved: 'حُلّ جزئياً', unresolvedStatus_resolved: 'محلول', unresolvedStatus_superseded: 'حلّ محله بند جديد',
    analyzedByLabel: 'تم التحليل بواسطة'
  },
  en: {
    header: 'AI Market Analysis', memoryChip: 'Session Memory · {n} events', depthAuto: 'Auto', depthEfficient: 'Efficient analysis', depthDeep: 'Deep analysis',
    thesisTitle: 'Market Thesis', whatChangedTitle: 'What Changed', tensionVs: 'VS',
    primaryScenario: 'Primary Scenario', alternativeScenario: 'Alternative Scenario', tailRiskScenario: 'Tail Risk',
    triggerLabel: 'Trigger', invalidationLabel: 'Invalidation', confidenceLabel: 'Confidence',
    addToSession: '+ Add Scenario', added: 'Added', visualize: 'Visualize Scenario', visualizing: 'Visualizing…',
    visualizeError: "Couldn't generate the image. Try again.",
    visualizeErrorBalance: 'Your wallet balance is too low. Top up from Wallet or Subscription.',
    watchingTitle: 'AI Is Watching', unknownsTitle: "What I Don't Know Yet", changeViewTitle: 'What Would Change My View?',
    confidenceTitle: 'Analysis Confidence', deepAnalysis: 'Deep analysis', collapse: 'Collapse',
    noScenario: 'No actionable scenario yet.', tokenUsage: '{n} tokens',
    scenarioCheckTitle: 'Scenario Check', previousProbability: 'Previous probability', currentProbability: 'Current probability', statusLabel: 'Status',
    whatHappened: 'What happened', confirmedBy: 'What confirmed', contradictedBy: 'What contradicted', remainsUnresolved: 'What remains',
    status_pending: 'Pending', status_strengthened: 'Strengthened', status_weakened: 'Weakened', status_partially_confirmed: 'Partially confirmed', status_confirmed: 'Confirmed', status_invalidated: 'Invalidated',
    original: 'Original', scenarioMap: 'Scenario Map', regenerate: 'Regenerate',
    original_data_note: 'This is an illustrative generated overlay, not real market data.',
    visualizeAnalysis: 'Draw full analysis on chart', visualizingAnalysis: 'Drawing analysis…', visualizeAnalysisError: "Couldn't generate the analysis image. Try again.",
    visualizeAnalysisErrorBalance: 'Your wallet balance is too low. Top up from Wallet or Subscription.',
    requestResponseTitle: 'Response to Your Request', requestedLabel: 'You asked', answerLabel: 'Answer', limitationLabel: 'Limitation',
    deferredScenariosTitle: 'Not evaluated this pass', deferredScenariosNote: 'To stay within one call, these active scenarios were not evaluated:',
    delta: 'Change',
    timeframeTitle: 'Per-Timeframe Read', synthesisTitle: 'Multi-Timeframe Synthesis',
    trend_up: 'Up', trend_down: 'Down', trend_range: 'Range', trend_unclear: 'Unclear',
    momentum_accelerating: 'Accelerating', momentum_decelerating: 'Decelerating', momentum_steady: 'Steady', momentum_unclear: 'Unclear',
    noteFeedbackTitle: 'Feedback on Your Notes', noteEvidenceLabel: 'Evidence', noteCorrectionLabel: 'Correction', noteEncouragementLabel: 'Strength', noteWatchForLabel: 'Watch for',
    coverageTitle: 'Mandatory concept coverage', coverageSummary: '{applied} of {total} mandatory concepts applied', coverage_applied: 'Applied', coverage_not_visible: 'Not visible on this chart', coverage_not_applicable: 'Not applicable', coverage_unaddressed: 'Not checked', coverageUnaddressedHint: 'The engine did not report on this concept - it is recorded as Not checked, never as Applied.', coverageEvidence: 'Evidence',
    verdict_supported: 'Supported', verdict_partially_supported: 'Partially supported', verdict_contradicted: 'Contradicted', verdict_insufficient_evidence: 'Insufficient evidence',
    unresolvedItemsTitle: 'Unresolved Points & Next Action', actionLabel: 'Action needed', missingEvidenceLabel: 'Missing evidence',
    unresolvedStatus_open: 'Open', unresolvedStatus_partially_resolved: 'Partially resolved', unresolvedStatus_resolved: 'Resolved', unresolvedStatus_superseded: 'Superseded',
    analyzedByLabel: 'Analyzed by'
  },
  es: {
    header: 'Análisis de IA del mercado', memoryChip: 'Memoria de sesión · {n} eventos', depthAuto: 'Automático', depthEfficient: 'Análisis eficiente', depthDeep: 'Análisis profundo',
    thesisTitle: 'Tesis de mercado', whatChangedTitle: 'Qué cambió', tensionVs: 'VS',
    primaryScenario: 'Escenario principal', alternativeScenario: 'Escenario alternativo', tailRiskScenario: 'Riesgo de cola',
    triggerLabel: 'Disparador', invalidationLabel: 'Invalidación', confidenceLabel: 'Confianza',
    addToSession: '+ Añadir escenario', added: 'Añadido', visualize: 'Visualizar escenario', visualizing: 'Generando…',
    visualizeError: 'No se pudo generar la imagen. Inténtalo de nuevo.',
    visualizeErrorBalance: 'Tu saldo de billetera es insuficiente. Recarga desde Billetera o Suscripción.',
    watchingTitle: 'La IA está observando', unknownsTitle: 'Lo que aún no sé', changeViewTitle: 'Qué cambiaría mi opinión',
    confidenceTitle: 'Confianza del análisis', deepAnalysis: 'Análisis profundo', collapse: 'Cerrar',
    noScenario: 'Todavía no hay un escenario accionable.', tokenUsage: '{n} tokens',
    scenarioCheckTitle: 'Verificación de escenario', previousProbability: 'Probabilidad anterior', currentProbability: 'Probabilidad actual', statusLabel: 'Estado',
    whatHappened: 'Qué ocurrió', confirmedBy: 'Qué lo confirmó', contradictedBy: 'Qué lo contradijo', remainsUnresolved: 'Qué queda sin resolver',
    status_pending: 'Pendiente', status_strengthened: 'Reforzado', status_weakened: 'Debilitado', status_partially_confirmed: 'Parcialmente confirmado', status_confirmed: 'Confirmado', status_invalidated: 'Invalidado',
    original: 'Original', scenarioMap: 'Mapa de escenario', regenerate: 'Regenerar',
    original_data_note: 'Esta es una superposición ilustrativa generada, no datos reales del mercado.',
    visualizeAnalysis: 'Dibujar el análisis completo en el gráfico', visualizingAnalysis: 'Dibujando el análisis…', visualizeAnalysisError: 'No se pudo generar la imagen del análisis. Inténtalo de nuevo.',
    visualizeAnalysisErrorBalance: 'Tu saldo de billetera es insuficiente. Recarga desde Billetera o Suscripción.',
    requestResponseTitle: 'Respuesta a tu solicitud', requestedLabel: 'Pediste', answerLabel: 'Respuesta', limitationLabel: 'Limitación',
    deferredScenariosTitle: 'No evaluados en esta pasada', deferredScenariosNote: 'Para mantenerse dentro de una sola llamada, estos escenarios activos no se evaluaron:',
    delta: 'Cambio',
    timeframeTitle: 'Lectura por temporalidad', synthesisTitle: 'Síntesis multi-temporalidad',
    trend_up: 'Alcista', trend_down: 'Bajista', trend_range: 'Rango', trend_unclear: 'Poco claro',
    momentum_accelerating: 'Acelerando', momentum_decelerating: 'Desacelerando', momentum_steady: 'Estable', momentum_unclear: 'Poco claro',
    noteFeedbackTitle: 'Comentarios sobre tus notas', noteEvidenceLabel: 'Evidencia', noteCorrectionLabel: 'Corrección', noteEncouragementLabel: 'Punto fuerte', noteWatchForLabel: 'Vigila esto',
    coverageTitle: 'Cobertura de conceptos obligatorios', coverageSummary: '{applied} de {total} conceptos obligatorios aplicados', coverage_applied: 'Aplicado', coverage_not_visible: 'No visible en este gráfico', coverage_not_applicable: 'No aplicable', coverage_unaddressed: 'No comprobado', coverageUnaddressedHint: 'El motor no informó sobre este concepto: se registra como No comprobado, nunca como Aplicado.', coverageEvidence: 'Evidencia',
    verdict_supported: 'Respaldado', verdict_partially_supported: 'Parcialmente respaldado', verdict_contradicted: 'Contradicho', verdict_insufficient_evidence: 'Evidencia insuficiente',
    unresolvedItemsTitle: 'Puntos sin resolver y próxima acción', actionLabel: 'Acción necesaria', missingEvidenceLabel: 'Evidencia faltante',
    unresolvedStatus_open: 'Abierto', unresolvedStatus_partially_resolved: 'Parcialmente resuelto', unresolvedStatus_resolved: 'Resuelto', unresolvedStatus_superseded: 'Reemplazado',
    analyzedByLabel: 'Analizado por'
  }
};
// Voice/Chat form-interview workflow upgrade: exported so session.analysis.read's narration
// builder (character-app.jsx) reuses these exact real labels - never a second, invented set of
// terms for the same concepts the visible card already names.
export function tr(lang, key, vars) {
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
      {/* Production feedback (2026-09-01): a failed generation previously left the button quietly
          reverting to its plain state with zero explanation - the trader reported this as "doesn't
          work" since nothing distinguished "failed" from "never tried". Now visibly surfaced. */}
      {vizStatus === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--danger)', background: 'rgba(255,56,48,.08)' }}>
          <Icon name="TriangleAlert" size={13} style={{ color: 'var(--danger)', flex: 'none' }} />
          <span dir="auto" style={{ fontSize: 10.5, color: 'var(--danger)' }}>{tr(lang, visualization.errorCode === 'WALLET_INSUFFICIENT_BALANCE' ? 'visualizeErrorBalance' : 'visualizeError')}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button data-nv-added={justAdded ? 'true' : undefined} variant={added ? 'ghost' : 'primary'} size="sm" icon={added ? 'check' : 'plus'} disabled={added} onClick={onAdd} fullWidth>
          {added ? tr(lang, 'added') : tr(lang, 'addToSession')}
        </Button>
        <Button variant="secondary" size="sm" icon="image" loading={vizStatus === 'loading'} onClick={onVisualize} fullWidth>
          {vizStatus === 'loading' ? tr(lang, 'visualizing') : tr(lang, 'visualize')}
        </Button>
      </div>
      {lightboxOpen && vizStatus === 'ready' && visualization.imageDataUrl && (
        <ImageLightbox src={visualization.imageDataUrl} onClose={() => setLightboxOpen(false)} />
      )}
    </Panel>
  );
}

// Section 2 - prior -> new probability plus the delta is now always shown, sourced from
// evaluation.previousProbability/delta when this same evaluation carries the enriched audit
// trail (session-analysis-schema.js's applyScenarioEvaluationPatch); falls back to hiding the
// prior-probability row for an evaluation object that predates this upgrade (still renders
// everything else safely).
function ScenarioEvaluationCard({ evaluation, scenarioTitle, lang }) {
  const hasPrior = typeof evaluation.previousProbability === 'number';
  const delta = typeof evaluation.delta === 'number' ? evaluation.delta : (hasPrior ? evaluation.newProbability - evaluation.previousProbability : null);
  return (
    <Panel variant="raised" ornament padding={14} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="Target" size={14} />
        <span dir="auto" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--parchment)' }}>{scenarioTitle || tr(lang, 'scenarioCheckTitle')}</span>
        <span style={{ marginInlineStart: 'auto' }} />
        <Chip tone={evaluation.status === 'invalidated' ? 'danger' : evaluation.status === 'confirmed' || evaluation.status === 'strengthened' ? 'success' : 'neutral'}>{tr(lang, 'status_' + evaluation.status)}</Chip>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {hasPrior && (
          <span style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: 9.5, color: 'var(--text-dim)' }}>{tr(lang, 'previousProbability')}</span>
            <span className="navrya-tabular" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>{evaluation.previousProbability}%</span>
          </span>
        )}
        {hasPrior && <Icon name="ArrowLeftRight" size={13} style={{ color: 'var(--text-dim)', flex: 'none' }} />}
        <span style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ display: 'block', fontSize: 9.5, color: 'var(--text-dim)' }}>{tr(lang, 'currentProbability')}</span>
          <span className="navrya-tabular" style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>{evaluation.newProbability}%</span>
        </span>
        {delta != null && (
          <Chip tone={delta > 0 ? 'success' : delta < 0 ? 'danger' : 'neutral'}>{(delta > 0 ? '+' : '') + delta + '% ' + tr(lang, 'delta')}</Chip>
        )}
      </div>
      <p dir="auto" style={{ margin: 0, fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.8 }}><b>{tr(lang, 'whatHappened')}:</b> {evaluation.whatHappened}</p>
      {!!evaluation.confirmedBy.length && <p dir="auto" style={{ margin: 0, fontSize: 11, color: 'var(--success)', lineHeight: 1.8 }}><b>{tr(lang, 'confirmedBy')}:</b> {evaluation.confirmedBy.join(' · ')}</p>}
      {!!evaluation.contradictedBy.length && <p dir="auto" style={{ margin: 0, fontSize: 11, color: 'var(--danger)', lineHeight: 1.8 }}><b>{tr(lang, 'contradictedBy')}:</b> {evaluation.contradictedBy.join(' · ')}</p>}
      {!!evaluation.remainsUnresolved.length && <p dir="auto" style={{ margin: 0, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.8 }}><b>{tr(lang, 'remainsUnresolved')}:</b> {evaluation.remainsUnresolved.join(' · ')}</p>}
    </Panel>
  );
}

// Section 1.B - "Your view and instruction" structured response. Hidden entirely when every field
// is empty (the trader wrote nothing this time), matching every other optional card section.
function RequestResponseBlock({ requestResponse, lang }) {
  if (!requestResponse || !(requestResponse.requested || requestResponse.answer)) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 10, border: '1px solid var(--border-gold)', background: 'rgba(214,175,107,.06)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>
        <Icon name="MessageCircleQuestion" size={12} />{tr(lang, 'requestResponseTitle')}
      </span>
      {requestResponse.requested && <p dir="auto" style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}><b>{tr(lang, 'requestedLabel')}:</b> {requestResponse.requested}</p>}
      {requestResponse.answer && <p dir="auto" style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.8 }}><b>{tr(lang, 'answerLabel')}:</b> {requestResponse.answer}</p>}
      {requestResponse.limitation && <p dir="auto" style={{ margin: 0, fontSize: 10.5, color: 'var(--text-dim)', lineHeight: 1.7 }}><b>{tr(lang, 'limitationLabel')}:</b> {requestResponse.limitation}</p>}
    </div>
  );
}

// Section 2 - real active scenarios excluded from this one-call bound, disclosed explicitly
// (id/title only) rather than silently dropped.
function DeferredScenariosNote({ deferredScenarios, lang }) {
  if (!deferredScenarios || !deferredScenarios.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)' }}>
      <Icon name="Clock" size={13} style={{ color: 'var(--text-dim)', flex: 'none', marginTop: 1 }} />
      <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>
        <b>{tr(lang, 'deferredScenariosTitle')}</b> — {tr(lang, 'deferredScenariosNote')} {deferredScenarios.map((d) => d.title || d.id).join(' · ')}
      </span>
    </div>
  );
}

// Section 3 - one labelled per-timeframe read plus a synthesis of how the supplied timeframes
// align/conflict. Hidden entirely for a plain single-image analysis (timeframeAnalyses empty).
function TimeframeBlock({ timeframeAnalyses, timeframeSynthesis, lang }) {
  if (!timeframeAnalyses || !timeframeAnalyses.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>{tr(lang, 'timeframeTitle')}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {timeframeAnalyses.map((t, i) => (
          <div key={t.imageId || i} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="navrya-tabular" dir="ltr" style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-warm)' }}>{t.timeframe}</span>
              <Icon name={t.trend === 'up' ? 'TrendingUp' : t.trend === 'down' ? 'TrendingDown' : 'Minus'} size={13} />
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{tr(lang, 'trend_' + t.trend)}</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>· {tr(lang, 'momentum_' + t.momentum)}</span>
            </span>
            {!!t.keyEvidence.length && <span dir="auto" style={{ fontSize: 10.5, color: 'var(--text-primary)' }}>{t.keyEvidence.join(' · ')}</span>}
            {t.uncertainty && <span dir="auto" style={{ fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>{t.uncertainty}</span>}
          </div>
        ))}
      </div>
      {timeframeSynthesis && (
        <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(214,175,107,.06)' }}>
          <span style={{ display: 'block', fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold-warm)', marginBottom: 3 }}>{tr(lang, 'synthesisTitle')}</span>
          <p dir="auto" style={{ margin: 0, fontSize: 11.5, color: 'var(--text-primary)', lineHeight: 1.8 }}>{timeframeSynthesis}</p>
        </div>
      )}
    </div>
  );
}

const NOTE_VERDICT_TONE = { supported: 'success', partially_supported: 'accent', contradicted: 'danger', insufficient_evidence: 'neutral' };
// Section 1.A - each item is keyed to a noteRef only (entryId/field/revision); noteLabelFor
// (optional) resolves it to a short human label ("Chart note", "Movement note on entry #3") - a
// caller that omits it still gets a safe, generic fallback.
function NoteFeedbackBlock({ noteFeedback, lang, noteLabelFor }) {
  if (!noteFeedback || !noteFeedback.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>{tr(lang, 'noteFeedbackTitle')}</span>
      {noteFeedback.map((item, i) => (
        <div key={item.noteRef.entryId + ':' + item.noteRef.field + ':' + i} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span dir="auto" style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>{noteLabelFor ? noteLabelFor(item.noteRef) : (item.noteRef.field === 'movementNote' ? tr(lang, 'noteLabel') : tr(lang, 'noteLabel'))}</span>
            <Chip tone={NOTE_VERDICT_TONE[item.verdict] || 'neutral'}>{tr(lang, 'verdict_' + item.verdict)}</Chip>
          </span>
          {item.evidence && <span dir="auto" style={{ fontSize: 10.5, color: 'var(--text-primary)' }}><b>{tr(lang, 'noteEvidenceLabel')}:</b> {item.evidence}</span>}
          {item.correction && <span dir="auto" style={{ fontSize: 10.5, color: 'var(--danger)' }}><b>{tr(lang, 'noteCorrectionLabel')}:</b> {item.correction}</span>}
          {item.encouragement && <span dir="auto" style={{ fontSize: 10.5, color: 'var(--success)' }}><b>{tr(lang, 'noteEncouragementLabel')}:</b> {item.encouragement}</span>}
          {item.watchFor && <span dir="auto" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}><b>{tr(lang, 'noteWatchForLabel')}:</b> {item.watchFor}</span>}
        </div>
      ))}
    </div>
  );
}

const COVERAGE_TONE = { applied: 'success', not_visible: 'neutral', not_applicable: 'neutral', unaddressed: 'danger' };
// Analysis Profile Phase 5 - verifiable mandatory-concept coverage. The server rebuilt this list so it holds exactly one row
// per mandatory concept of the profile the analysis ran under; a concept the model skipped is shown as "Not checked" in the
// danger tone - never dressed up as applied. Rendered only when there is coverage at all (a profile with no mandatory
// concepts, and every analysis that predates this, has none).
function ConceptCoverageBlock({ coverage, lang }) {
  if (!coverage || !coverage.length) return null;
  const applied = coverage.filter((row) => row.status === 'applied').length;
  const unaddressed = coverage.some((row) => row.status === 'unaddressed');
  return (
    <div data-concept-coverage style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 10, border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.05)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>{tr(lang, 'coverageTitle')}</span>
        <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'coverageSummary', { applied: String(applied), total: String(coverage.length) })}</span>
      </span>
      {coverage.map((row) => (
        <div key={row.conceptId || row.title} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span dir="auto" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{row.title}</span>
            <Chip tone={COVERAGE_TONE[row.status] || 'neutral'}>{tr(lang, 'coverage_' + row.status)}</Chip>
          </span>
          {row.evidence && <span dir="auto" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}><b>{tr(lang, 'coverageEvidence')}:</b> {row.evidence}</span>}
        </div>
      ))}
      {unaddressed && <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'coverageUnaddressedHint')}</span>}
    </div>
  );
}

const UNRESOLVED_STATUS_TONE = { open: 'neutral', partially_resolved: 'accent', resolved: 'success', superseded: 'neutral' };
// Section 1.C - structured unresolved-item lifecycle, replacing the old plain-string `unknowns`
// list. Reads `result.unresolvedItems` when present; a stored result from before this upgrade
// (no `unresolvedItems` field at all, only `unknowns`) degrades safely to a minimal open item per
// legacy string - see resolveUnresolvedItems() below, the one place both paths converge.
function UnresolvedItemsBlock({ items, lang }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
      <span style={{ display: 'block', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 6 }}>{tr(lang, 'unresolvedItemsTitle')}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item, i) => (
          <div key={item.id || i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span dir="auto" style={{ fontSize: 11.5, color: 'var(--text-primary)', flex: 1 }}>— {item.description}</span>
              <Chip tone={UNRESOLVED_STATUS_TONE[item.status] || 'neutral'}>{tr(lang, 'unresolvedStatus_' + item.status)}</Chip>
            </span>
            {item.whyItMatters && <span dir="auto" style={{ fontSize: 10, color: 'var(--text-dim)', paddingInlineStart: 12 }}>{item.whyItMatters}</span>}
            {item.action && <span dir="auto" style={{ fontSize: 10.5, color: 'var(--char-accent)', paddingInlineStart: 12 }}><b>{tr(lang, 'actionLabel')}:</b> {item.action}</span>}
            {item.resolutionEvidence && <span dir="auto" style={{ fontSize: 10, color: 'var(--success)', paddingInlineStart: 12 }}>{item.resolutionEvidence}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
// Exported so character-app.jsx's analysisSectionTexts() (voice narration) resolves the exact
// same legacy-fallback shape the card itself renders, never a second, divergent implementation.
export function resolveUnresolvedItems(result) {
  if (!result) return [];
  if (result.unresolvedItems && result.unresolvedItems.length) return result.unresolvedItems;
  return (result.unknowns || []).map((text) => ({ id: null, status: 'open', description: text, whyItMatters: '', missingEvidence: '', action: '', resolutionEvidence: '' }));
}

// Section 5 - provider/model attribution, always from the SAVED result's own provider/model
// (never the currently-selected settings) - reuses the existing provider catalog/ModelGlyph
// system rather than a second logo registry. Degrades to a plain text label when the catalog
// entry cannot be resolved (e.g. a provider later removed from the catalog).
function ProviderAttribution({ result, lang }) {
  if (!result || !result.provider) return null;
  const settings = window.TradeJournalAISettingsStore;
  const catalogEntry = settings ? (settings.providerCatalog() || []).find((p) => p.id === result.provider) : null;
  const modelLabel = (catalogEntry && catalogEntry.modelLabels && catalogEntry.modelLabels[result.model]) || result.model;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-dim)' }}>
      {catalogEntry && <ModelGlyph model={{ id: catalogEntry.id, trait: catalogEntry.trait, knockout: catalogEntry.knockout }} size={13} muted />}
      <span dir="ltr" className="navrya-tabular">{tr(lang, 'analyzedByLabel')} {(catalogEntry && catalogEntry.label) || result.provider}{modelLabel ? ' · ' + modelLabel : ''}</span>
    </span>
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
  const unresolvedItems = resolveUnresolvedItems(result);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {memoryReceipt && memoryReceipt.hasInitialAnalysis && <Chip tone="neutral" dot>{tr(activeLang, 'memoryChip', { n: memoryReceipt.eventCount })}</Chip>}
        <Chip tone="accent">{depth === 'deep' ? tr(activeLang, 'depthDeep') : depth === 'efficient' ? tr(activeLang, 'depthEfficient') : tr(activeLang, 'depthAuto')}</Chip>
        <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {!!totalTokens && <span title={JSON.stringify(result.usage)} style={{ fontSize: 10, color: 'var(--text-dim)' }}>{tr(activeLang, 'tokenUsage', { n: (totalTokens / 1000).toFixed(1) + 'k' })}</span>}
          <ProviderAttribution result={result} lang={activeLang} />
        </span>
      </div>

      <DeferredScenariosNote deferredScenarios={result.deferredScenarios} lang={activeLang} />

      <div>
        <span style={{ display: 'block', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-warm)', marginBottom: 4 }}>{tr(activeLang, 'thesisTitle')}</span>
        <p dir="auto" style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--parchment)', lineHeight: 1.7 }}>{result.thesis.headline}</p>
        {result.thesis.summary && <p dir="auto" style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.8 }}>{result.thesis.summary}</p>}
      </div>

      <RequestResponseBlock requestResponse={result.requestResponse} lang={activeLang} />

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
          {analysisVisualization && analysisVisualization.status === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--danger)', background: 'rgba(255,56,48,.08)' }}>
              <Icon name="TriangleAlert" size={13} style={{ color: 'var(--danger)', flex: 'none' }} />
              <span dir="auto" style={{ fontSize: 10.5, color: 'var(--danger)' }}>{tr(activeLang, analysisVisualization.errorCode === 'WALLET_INSUFFICIENT_BALANCE' ? 'visualizeAnalysisErrorBalance' : 'visualizeAnalysisError')}</span>
            </div>
          )}
          <Button variant="secondary" size="sm" icon="image" loading={!!(analysisVisualization && analysisVisualization.status === 'loading')} onClick={onVisualizeAnalysis}>
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

      <TimeframeBlock timeframeAnalyses={result.timeframeAnalyses} timeframeSynthesis={result.timeframeSynthesis} lang={activeLang} />

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

      <ConceptCoverageBlock coverage={result.conceptCoverage} lang={activeLang} />

      <NoteFeedbackBlock noteFeedback={result.noteFeedback} lang={activeLang} />

      {(otherBlocks.length > 0 || unresolvedItems.length > 0 || result.whatWouldChangeView) && (
        <div>
          <button type="button" onClick={() => setDeepOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: 36, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', font: 'var(--type-body)', fontSize: 11.5 }}>
            <Icon name={deepOpen ? 'ChevronUp' : 'ChevronDown'} size={14} />{deepOpen ? tr(activeLang, 'collapse') : tr(activeLang, 'deepAnalysis')}
          </button>
          {deepOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {otherBlocks.map((block) => <AnalysisBlock key={block.id} block={block} lang={activeLang} />)}
              <UnresolvedItemsBlock items={unresolvedItems} lang={activeLang} />
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
