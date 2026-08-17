import React from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

// React rewrite of session-card-updates.js's TimelineEntryCard + ScenarioCard rendering (the
// "Chart register & timeline" cards session-workspace-logic.js's entryCard() delegates to via
// window.TradeJournalSessionCards.renderEntry when present). UI ONLY - every data shape, field,
// mutation, save()/log()/open() call, and computed value below is the same logic as the file it
// replaces; only how it is drawn changed, from manual DOM building to JSX + NAVRYA components.
// openInvalidationModal()/openScenarioModal() still hand off to the shared api.modal() builder
// (session-workspace-logic.js) unchanged - that overlay is common to every session flow, not
// specific to this card, so it stays out of scope here.

const patternCatalog = [
  { id: 'utad-wyckoff', name: 'UTAD WYCKOFF', positionThreshold: 70, stages: [
    { id: 'utad-1', index: 1, label: 'حرکت اسپایک قوی' },
    { id: 'utad-2', index: 2, label: 'حرکت تجمعی و خلاف جهت' },
    { id: 'utad-3', index: 3, label: 'رسیدن به نقطه شروع حرکت اسپایکی' },
    { id: 'utad-4', index: 4, label: 'توزیع در جهت روند اسپایک اولیه' }
  ] },
  { id: 'acc-higher-timeframe', name: 'ACC روند تایم بزرگ', positionThreshold: 70, stages: [
    { id: 'acc-1', index: 1, label: 'حرکت اسپایکی' },
    { id: 'acc-2', index: 2, label: 'ایجاد یک کف یا سقف جدید' },
    { id: 'acc-3', index: 3, label: 'ACC / Consolidation اولیه' },
    { id: 'acc-4', index: 4, label: 'ACC / Consolidation میانی' },
    { id: 'acc-5', index: 5, label: 'ACC / Consolidation نهایی' },
    { id: 'acc-6', index: 6, label: 'خروج قوی و تأیید ساختار' }
  ] },
  { id: 'breakout-retest', name: 'Breakout / Retest', positionThreshold: 70, stages: [
    { id: 'br-1', index: 1, label: 'شکست سطح' },
    { id: 'br-2', index: 2, label: 'بازگشت به سطح' },
    { id: 'br-3', index: 3, label: 'تأیید جهت' }
  ] }
];
const markets = {
  London: { zone: 'Europe/London', icon: 'building-2' },
  NewYork: { zone: 'America/New_York', icon: 'landmark' },
  Sydney: { zone: 'Australia/Sydney', icon: 'sailboat' },
  Tokyo: { zone: 'Asia/Tokyo', icon: 'castle' }
};
const copy = {
  fa: {
    chart: 'چارت', movement: 'حرکت', fate: 'سرنوشت سشن', addChartAction: 'افزودن چارت جدید', logMovementAction: 'ثبت حرکت جدید', sessionFateAction: 'سرنوشت سشن', prevEntry: 'ورودی قبلی', nextEntry: 'ورودی بعدی', ai: 'تحلیل AI', raw: 'چارت خام', annotated: 'تحلیل AI', zoom: 'بزرگ‌نمایی', note: 'یادداشت', notePlaceholder: 'یادداشت اختیاری برای این چارت...', marketTime: 'سشن', tehran: 'تهران', related: 'سناریوهای مرتبط', addScenario: 'افزودن سناریو', aiTitle: 'تحلیل هوش مصنوعی این ورودی', view: 'مشاهده', close: 'بستن', matchedPatterns: 'الگوهای منطبق', assessments: 'ارزیابی سناریوهای قبلی', suggestions: 'سناریوهای پیشنهادی', valid: 'معتبر', violated: 'نقض شده', noDescription: 'بدون شرح', complete: 'تکمیل', pattern: 'الگو', occurred: 'اتفاق افتاد', laterRefs: 'ارجاع بعدی', title: 'عنوان', description: 'شرح سناریو', evidence: 'شواهد سناریو', patternTag: 'تگ الگو', noPattern: 'بدون الگو', patternStages: 'مراحل الگو', patternCompletion: 'درصد تکمیل الگو', protocolOpen: 'پروتکل پوزیشن باز شد', protocolLocked: 'پروتکل پوزیشن قفل است', protocolNeed: '۷۰٪ تکمیل الگو لازم است', invalidation: 'بی‌اعتباری سناریو', invalidationPlaceholder: 'دلایل را با کاما جدا کنید', invalidationNote: 'یادداشت اختیاری در مورد ابطال...', problem: 'مشکل سناریو', trigger: 'تریگر سناریو', probability: 'درصد احتمال', history: 'تاریخچه احتمال', invalidated: 'دلیل ابطال تأیید شده', execution: 'نقشه اجرا', actionPlan: 'اکشن پلن', actionPlaceholder: 'نحوه اجرای پوزیشن...', positionType: 'نوع پوزیشن', long: 'خرید (لانگ)', short: 'فروش (شورت)', entries: 'قیمت ورود (با کاما جدا کنید)', stop: 'حد ضرر', target: 'حد سود', optional: 'اختیاری', occurredAction: 'این سناریو اتفاق افتاد', autoFill: 'پر کردن خودکار از متن', autoFillPlaceholder: 'متن را اینجا پیست کنید تا فیلدها خودکار پر شوند', parse: 'تجزیه و پر کردن خودکار', deleteConfirm: 'این سناریو حذف شود؟', entryDeleteConfirm: 'این ورودی تایم‌لاین حذف شود؟', invalidationTitle: 'انتخاب دلیل بی‌اعتباری', invalidationBody: 'احتمال این سناریو به صفر رسیده است. دلیل‌های بی‌اعتباری را مشخص کنید.', confirmInvalidation: 'تأیید دلیل ابطال', cancel: 'انصراف', newScenario: 'افزودن سناریو', save: 'ذخیره سناریو', scenarioTitle: 'سناریو جدید', carried: 'منتقل‌شده از', aiDemo: 'تحلیل محلی: ساختار چارت با سناریوهای فعال مقایسه شد. پیش از ورود، تریگر، سطح ابطال و تکمیل الگو را بررسی کنید.', suggested: 'سناریوی ادامه حرکت', localProvider: 'تحلیل محلی نمایشی', noImage: 'تصویری برای این ورودی ثبت نشده است'
  },
  ar: {
    chart: 'الرسم البياني', movement: 'الحركة', fate: 'مصير الجلسة', addChartAction: 'إضافة مخطط', logMovementAction: 'تسجيل حركة', sessionFateAction: 'مصير الجلسة', prevEntry: 'الإدخال السابق', nextEntry: 'الإدخال التالي', ai: 'تحليل AI', raw: 'الرسم الخام', annotated: 'تحليل AI', zoom: 'تكبير', note: 'ملاحظة', notePlaceholder: 'ملاحظة اختيارية لهذا الرسم...', marketTime: 'الجلسة', tehran: 'طهران', related: 'السيناريوهات المرتبطة', addScenario: 'إضافة سيناريو', aiTitle: 'تحليل الذكاء الاصطناعي لهذا الإدخال', view: 'عرض', close: 'إغلاق', matchedPatterns: 'الأنماط المتطابقة', assessments: 'تقييم السيناريوهات السابقة', suggestions: 'سيناريوهات مقترحة', valid: 'صالح', violated: 'منقوض', noDescription: 'بدون وصف', complete: 'مكتمل', pattern: 'النمط', occurred: 'حدث', laterRefs: 'مراجع لاحقة', title: 'العنوان', description: 'وصف السيناريو', evidence: 'أدلة السيناريو', patternTag: 'وسم النمط', noPattern: 'بدون نمط', patternStages: 'مراحل النمط', patternCompletion: 'اكتمال النمط', protocolOpen: 'بروتوكول الصفقة مفتوح', protocolLocked: 'بروتوكول الصفقة مقفل', protocolNeed: 'يلزم اكتمال 70٪', invalidation: 'إبطال السيناريو', invalidationPlaceholder: 'افصل الأسباب بفواصل', invalidationNote: 'ملاحظة اختيارية عن الإبطال...', problem: 'مشكلة السيناريو', trigger: 'محفز السيناريو', probability: 'نسبة الاحتمال', history: 'سجل الاحتمال', invalidated: 'تم تأكيد سبب الإبطال', execution: 'خطة التنفيذ', actionPlan: 'خطة العمل', actionPlaceholder: 'كيفية تنفيذ الصفقة...', positionType: 'نوع الصفقة', long: 'شراء (Long)', short: 'بيع (Short)', entries: 'أسعار الدخول', stop: 'وقف الخسارة', target: 'هدف الربح', optional: 'اختياري', occurredAction: 'هذا السيناريو حدث', autoFill: 'الملء التلقائي من النص', autoFillPlaceholder: 'الصق النص هنا لملء الحقول تلقائياً', parse: 'تحليل وملء تلقائي', deleteConfirm: 'حذف هذا السيناريو؟', entryDeleteConfirm: 'حذف إدخال الخط الزمني؟', invalidationTitle: 'اختيار سبب الإبطال', invalidationBody: 'وصل احتمال هذا السيناريو إلى صفر. حدد أسباب الإبطال.', confirmInvalidation: 'تأكيد الإبطال', cancel: 'إلغاء', newScenario: 'إضافة سيناريو', save: 'حفظ السيناريو', scenarioTitle: 'سيناريو جديد', carried: 'منقول من', aiDemo: 'تحليل محلي: تمت مقارنة بنية الرسم بالسيناريوهات النشطة. تحقق من المحفز والإبطال واكتمال النمط قبل الدخول.', suggested: 'سيناريو استمرار الحركة', localProvider: 'تحليل محلي تجريبي', noImage: 'لا توجد صورة لهذا الإدخال'
  },
  en: {
    chart: 'Chart', movement: 'Movement', fate: 'Session fate', addChartAction: 'Add chart', logMovementAction: 'Log movement', sessionFateAction: 'Session fate', prevEntry: 'Previous entry', nextEntry: 'Next entry', ai: 'AI analysis', raw: 'Raw chart', annotated: 'AI analysis', zoom: 'Zoom', note: 'Note', notePlaceholder: 'Optional note for this chart...', marketTime: 'Session', tehran: 'Tehran', related: 'Related scenarios', addScenario: 'Add scenario', aiTitle: 'AI analysis for this entry', view: 'View', close: 'Close', matchedPatterns: 'Matched patterns', assessments: 'Previous scenario assessments', suggestions: 'Suggested scenarios', valid: 'Valid', violated: 'Violated', noDescription: 'No description', complete: 'Complete', pattern: 'Pattern', occurred: 'Occurred', laterRefs: 'later references', title: 'Title', description: 'Scenario description', evidence: 'Scenario evidence', patternTag: 'Pattern tag', noPattern: 'No pattern', patternStages: 'Pattern stages', patternCompletion: 'Pattern completion', protocolOpen: 'Position protocol unlocked', protocolLocked: 'Position protocol locked', protocolNeed: '70% pattern completion required', invalidation: 'Scenario invalidation', invalidationPlaceholder: 'Separate reasons with commas', invalidationNote: 'Optional invalidation note...', problem: 'Scenario weakness', trigger: 'Scenario trigger', probability: 'Probability', history: 'Probability history', invalidated: 'Invalidation reason confirmed', execution: 'Execution plan', actionPlan: 'Action plan', actionPlaceholder: 'How the position should be executed...', positionType: 'Position type', long: 'Buy (Long)', short: 'Sell (Short)', entries: 'Entry prices (comma separated)', stop: 'Stop loss', target: 'Take profit', optional: 'Optional', occurredAction: 'This scenario occurred', autoFill: 'Auto-fill from text', autoFillPlaceholder: 'Paste text here to fill the fields automatically', parse: 'Parse and auto-fill', deleteConfirm: 'Delete this scenario?', entryDeleteConfirm: 'Delete this timeline entry?', invalidationTitle: 'Choose invalidation reason', invalidationBody: 'This scenario probability reached zero. Confirm its invalidation reasons.', confirmInvalidation: 'Confirm invalidation', cancel: 'Cancel', newScenario: 'Add scenario', save: 'Save scenario', scenarioTitle: 'New scenario', carried: 'Carried from', aiDemo: 'Local analysis: the chart structure was compared with active scenarios. Verify the trigger, invalidation and pattern completion before entry.', suggested: 'Continuation scenario', localProvider: 'Local demo analysis', noImage: 'No image is attached to this entry'
  },
  es: {
    chart: 'Gráfico', movement: 'Movimiento', fate: 'Destino de la sesión', addChartAction: 'Añadir gráfico', logMovementAction: 'Registrar movimiento', sessionFateAction: 'Destino de la sesión', prevEntry: 'Entrada anterior', nextEntry: 'Entrada siguiente', ai: 'Análisis IA', raw: 'Gráfico original', annotated: 'Análisis IA', zoom: 'Ampliar', note: 'Nota', notePlaceholder: 'Nota opcional para este gráfico...', marketTime: 'Sesión', tehran: 'Teherán', related: 'Escenarios relacionados', addScenario: 'Añadir escenario', aiTitle: 'Análisis de IA de esta entrada', view: 'Ver', close: 'Cerrar', matchedPatterns: 'Patrones coincidentes', assessments: 'Evaluación de escenarios previos', suggestions: 'Escenarios sugeridos', valid: 'Válido', violated: 'Invalidado', noDescription: 'Sin descripción', complete: 'Completo', pattern: 'Patrón', occurred: 'Ocurrió', laterRefs: 'referencias posteriores', title: 'Título', description: 'Descripción del escenario', evidence: 'Evidencias', patternTag: 'Etiqueta de patrón', noPattern: 'Sin patrón', patternStages: 'Etapas del patrón', patternCompletion: 'Progreso del patrón', protocolOpen: 'Protocolo de posición abierto', protocolLocked: 'Protocolo de posición bloqueado', protocolNeed: 'Se requiere 70% del patrón', invalidation: 'Invalidación del escenario', invalidationPlaceholder: 'Separa las razones con comas', invalidationNote: 'Nota opcional de invalidación...', problem: 'Debilidad del escenario', trigger: 'Activador del escenario', probability: 'Probabilidad', history: 'Historial de probabilidad', invalidated: 'Razón de invalidación confirmada', execution: 'Plan de ejecución', actionPlan: 'Plan de acción', actionPlaceholder: 'Cómo ejecutar la posición...', positionType: 'Tipo de posición', long: 'Compra (Long)', short: 'Venta (Short)', entries: 'Precios de entrada', stop: 'Stop loss', target: 'Take profit', optional: 'Opcional', occurredAction: 'Este escenario ocurrió', autoFill: 'Autocompletar desde texto', autoFillPlaceholder: 'Pega texto aquí para completar los campos', parse: 'Analizar y autocompletar', deleteConfirm: '¿Eliminar este escenario?', entryDeleteConfirm: '¿Eliminar esta entrada?', invalidationTitle: 'Elegir razón de invalidación', invalidationBody: 'La probabilidad llegó a cero. Confirma las razones de invalidación.', confirmInvalidation: 'Confirmar invalidación', cancel: 'Cancelar', newScenario: 'Añadir escenario', save: 'Guardar escenario', scenarioTitle: 'Nuevo escenario', carried: 'Transferido desde', aiDemo: 'Análisis local: la estructura se comparó con los escenarios activos. Verifica el activador, la invalidación y el patrón antes de entrar.', suggested: 'Escenario de continuación', localProvider: 'Análisis local de demostración', noImage: 'No hay imagen adjunta a esta entrada'
  }
};

function language() {
  const value = (document.documentElement.lang || 'fa').toLowerCase();
  return copy[value] ? value : (value.indexOf('ar') === 0 ? 'ar' : value.indexOf('es') === 0 ? 'es' : value.indexOf('fa') === 0 ? 'fa' : 'en');
}
function tr(key) { return copy[language()][key] || copy.en[key] || key; }
function uid(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
function availablePatterns() {
  const registry = window.TradeJournalPatternStore;
  if (registry && typeof registry.listForScenarios === 'function') {
    const values = registry.listForScenarios();
    if (values && values.length) return values;
  }
  return patternCatalog;
}
function recordPatternUsage(patternId, delta) {
  const registry = window.TradeJournalPatternStore;
  if (registry && typeof registry.recordUsage === 'function') registry.recordUsage(patternId, delta || 1);
}
function educationCopy(key) {
  const values = {
    positionGuide: { fa: 'راهنمای مدیریت پوزیشن', ar: 'دليل إدارة الصفقة', en: 'Position management guide', es: 'Guía de gestión de posición' }, riskDefaults: { fa: 'پیش‌فرض‌های ریسک', ar: 'قيم المخاطر الافتراضية', en: 'Risk defaults', es: 'Valores de riesgo' },
    entry: { fa: 'ورود', ar: 'الدخول', en: 'Entry', es: 'Entrada' }, stop: { fa: 'حد ضرر', ar: 'وقف الخسارة', en: 'Stop loss', es: 'Stop loss' }, exit: { fa: 'خروج', ar: 'الخروج', en: 'Exit', es: 'Salida' }, sizing: { fa: 'حجم', ar: 'الحجم', en: 'Sizing', es: 'Tamaño' }, noGuide: { fa: 'هنوز قانون اجرایی ثبت نشده است.', ar: 'لم تُسجل قواعد تنفيذ بعد.', en: 'No execution rules have been recorded yet.', es: 'Aún no hay reglas de ejecución.' },
    maxRisk: { fa: 'ریسک/معامله', ar: 'مخاطرة/صفقة', en: 'Risk/trade', es: 'Riesgo/op.' }, daily: { fa: 'افت روزانه', ar: 'تراجع يومي', en: 'Daily DD', es: 'DD diario' }, total: { fa: 'افت کل', ar: 'تراجع كلي', en: 'Total DD', es: 'DD total' }, trades: { fa: 'حد معاملات', ar: 'حد الصفقات', en: 'Max trades', es: 'Máx. operaciones' }, profit: { fa: 'سقف سود', ar: 'سقف الربح', en: 'Profit cap', es: 'Tope beneficio' }
  };
  return (values[key] && values[key][language()]) || key;
}
function educationReferenceData(strategyId) {
  const education = window.TradeJournalStrategyEducationStore;
  if (!education || !strategyId || !education.find(strategyId)) return null;
  const guide = education.getPositionGuide(strategyId), risk = education.getRiskDefaults(strategyId);
  const values = [[educationCopy('entry'), guide.entryRules], [educationCopy('stop'), guide.stopLossRules], [educationCopy('exit'), guide.exitTargetRules], [educationCopy('sizing'), guide.positionSizingRules]].filter(function (item) { return String(item[1] || '').trim(); });
  const chips = [[educationCopy('maxRisk'), risk.maxRiskPerTradePercent, '%'], [educationCopy('daily'), risk.dailyDrawdownLimitPercent, '%'], [educationCopy('total'), risk.totalDrawdownLimitPercent, '%'], [educationCopy('trades'), risk.maxConcurrentTrades, ''], [educationCopy('profit'), risk.maxProfitCapPerTrade, '%']].filter(function (item) { return item[1] !== null && item[1] !== undefined; });
  return { values: values, chips: chips };
}
function patternRequirement(threshold) {
  const value = new Intl.NumberFormat(localeCode()).format(Number(threshold || 0)) + '%';
  return ({ fa: value + ' تکمیل الگو لازم است', ar: 'يلزم اكتمال النمط بنسبة ' + value, es: 'Se requiere ' + value + ' del patrón', en: value + ' pattern completion required' })[language()];
}
function marketName(entry, session) { return entry.tradingSession || entry.market || session.tradingSession || session.market || 'London'; }
function currentProbability(scenario) { const h = scenario.probabilityHistory || []; return Number(h.length ? h[h.length - 1].value : 0); }
function patternFor(scenario) {
  if (!scenario.pattern) return null;
  const match = availablePatterns().find(function (item) { return item.id === scenario.pattern.patternTagId || item.name === scenario.pattern.name; });
  if (match) return match;
  const snapshot = scenario.pattern.stages || [];
  return {
    id: scenario.pattern.patternTagId,
    name: scenario.pattern.name || '',
    positionThreshold: Number(scenario.pattern.completionThreshold || 70),
    stages: snapshot.map(function (item, index) { return typeof item === 'string' ? { id: 'snapshot-' + index, index: index + 1, label: item } : { id: item.id || 'snapshot-' + index, index: item.index || index + 1, label: item.label || item.text || '' }; })
  };
}
function patternCompletion(scenario) {
  const tag = patternFor(scenario);
  const stages = tag ? tag.stages : ((scenario.pattern && scenario.pattern.stages) || []);
  if (!stages.length) return 0;
  return Math.round((((scenario.pattern && scenario.pattern.completedStageIds) || []).length / stages.length) * 100);
}
function formCompletion(scenario) {
  const plan = scenario.executionPlan || {};
  let filled = 0;
  if ((scenario.description || '').trim()) filled++;
  if ((scenario.evidence || '').trim()) filled++;
  if ((scenario.invalidationTagIds || []).length) filled++;
  if ((scenario.problem || '').trim()) filled++;
  if ((scenario.trigger || '').trim()) filled++;
  if ((scenario.probabilityHistory || []).length) filled++;
  if ((plan.actionPlan || '').trim()) filled++;
  if (plan.positionType) filled++;
  if ((plan.entryPrices || []).length) filled++;
  return Math.round((filled / 8) * 100);
}
function localeCode() { return { fa: 'fa-IR', ar: 'ar-EG', en: 'en-GB', es: 'es-ES' }[language()]; }
function clockInZone(value, zone) {
  try { return new Intl.DateTimeFormat(localeCode(), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }).format(new Date(value)); }
  catch (_) { return '--:--'; }
}
function normalizeScenario(scenario, entry, index) {
  scenario.id = scenario.id || uid('scenario');
  scenario.entryId = scenario.entryId || entry.id;
  scenario.index = Number.isFinite(scenario.index) ? scenario.index : index + 1;
  scenario.title = scenario.title || tr('scenarioTitle');
  scenario.description = scenario.description || '';
  scenario.evidence = scenario.evidence || '';
  scenario.invalidationTagIds = scenario.invalidationTagIds || [];
  scenario.invalidationNote = scenario.invalidationNote || '';
  scenario.problem = scenario.problem || '';
  scenario.trigger = scenario.trigger || '';
  scenario.probabilityHistory = scenario.probabilityHistory || [{ value: Number(scenario.probability || 50), loggedAt: new Date(entry.createdAt || Date.now()).toISOString() }];
  scenario.executionPlan = scenario.executionPlan || { actionPlan: '', positionType: null, entryPrices: [] };
  scenario.executionPlan.entryPrices = scenario.executionPlan.entryPrices || [];
  scenario.occurred = Boolean(scenario.occurred);
  if (scenario.pattern) {
    const match = patternFor(scenario) || availablePatterns()[0];
    scenario.pattern.patternTagId = scenario.pattern.patternTagId || match.id;
    scenario.pattern.name = scenario.pattern.name || match.name;
    scenario.pattern.stages = scenario.pattern.stages || match.stages.map(function (stage) { return stage.label; });
    scenario.pattern.completionThreshold = Number(scenario.pattern.completionThreshold || match.positionThreshold || 70);
    scenario.pattern.completedStageIds = scenario.pattern.completedStageIds || [];
    scenario.pattern.completedStageIds = scenario.pattern.completedStageIds.map(function (value) {
      const byId = match.stages.find(function (stage) { return stage.id === value; });
      if (byId) return byId.id;
      const byLabel = match.stages.find(function (stage) { return stage.label === value; });
      return byLabel ? byLabel.id : value;
    });
  }
  scenario.formCompletionPercent = formCompletion(scenario);
  return scenario;
}
export function normalizeSession(session) {
  session.tradingSession = session.tradingSession || session.market || 'London';
  session.entries = session.entries || [];
  session.entries.forEach(function (entry) {
    entry.sessionId = entry.sessionId || session.id;
    entry.createdAt = entry.createdAt || Date.now();
    entry.type = entry.type || 'chart';
    entry.tradingSession = entry.tradingSession || entry.market || session.tradingSession;
    entry.market = entry.market || entry.tradingSession;
    entry.hasImage = entry.hasImage !== undefined ? entry.hasImage : Boolean(entry.preview || entry.imageBlobId);
    entry.relatedScenarioIds = entry.relatedScenarioIds || [];
    entry.scenarios = entry.scenarios || [];
    entry.scenarios.forEach(function (scenario, index) { normalizeScenario(scenario, entry, index); });
  });
  return session;
}
function allScenarios(session) {
  return session.entries.reduce(function (items, entry) { return items.concat((entry.scenarios || []).map(function (scenario, index) { return normalizeScenario(scenario, entry, index); })); }, []);
}
function laterReferences(session, scenarioId) { return session.entries.filter(function (entry) { return (entry.relatedScenarioIds || []).indexOf(scenarioId) > -1; }).length; }
function saveAndOpen(api, session, type, detail, scenarioId, counts) {
  if (type) api.log(session, type, detail, scenarioId || null, counts !== false);
  api.save(session);
  api.open(session.id);
}
function probabilityClass(value) { return value === 0 ? 'danger' : value < 40 ? 'warning' : 'success'; }
function addProbability(api, session, scenario, next) {
  const previous = currentProbability(scenario);
  const value = Math.max(0, Math.min(100, Math.round(Number(next) || 0)));
  if (previous === value) return;
  scenario.probabilityHistory.push({ value: value, loggedAt: new Date().toISOString() });
  if (value === 0 && previous > 0 && scenario.pattern) scenario.pattern.completedStageIds = [];
  api.log(session, 'probability_changed', previous + '% → ' + value + '%', scenario.id, true);
  api.save(session);
  if (value === 0 && previous > 0 && !(scenario.confirmedInvalidationTagIds || []).length) openInvalidationModal(api, session, scenario);
  else api.open(session.id);
}
function openInvalidationModal(api, session, scenario) {
  api.modal(tr('invalidationTitle'), function (body) {
    body.append(Object.assign(document.createElement('p'), { className: 'swc-modal-copy', textContent: tr('invalidationBody') }));
    const field = api.field(tr('invalidation'), 'text', (scenario.invalidationTagIds || []).join(', '), true);
    field.wrap.classList.add('swc-invalidation-picker');
    field.input.placeholder = tr('invalidationPlaceholder');
    body.append(field.wrap);
  }, function (body, overlay) {
    const input = body.querySelector('.swc-invalidation-picker input, .swc-invalidation-picker textarea');
    const values = String(input.value || '').split(/[,،]/).map(function (item) { return item.trim(); }).filter(Boolean);
    scenario.confirmedInvalidationTagIds = values.length ? values : (scenario.invalidationTagIds || []).slice();
    api.log(session, 'invalidation_confirmed', tr('confirmInvalidation'), scenario.id, true);
    api.save(session);
    overlay.remove();
    api.open(session.id);
  }, tr('confirmInvalidation'));
}
function openScenarioModal(api, session, entry) {
  const fields = {};
  api.modal(tr('newScenario'), function (body) {
    const grid = Object.assign(document.createElement('div'), { className: 'sw-modal-grid swc-new-scenario' });
    function add(name, label, type, value, wide) { const item = api.field(label, type, value, wide); fields[name] = item; grid.append(item.wrap); }
    add('title', tr('title'), 'text', tr('scenarioTitle'), true); add('description', tr('description'), 'textarea', '', true); add('evidence', tr('evidence'), 'textarea', '', true); add('problem', tr('problem'), 'textarea', '', true); add('trigger', tr('trigger'), 'textarea', '', true); add('invalidation', tr('invalidation'), 'text', '', true);
    fields.pattern = api.field(tr('patternTag'), 'select'); fields.pattern.input.append(new Option(tr('noPattern'), '')); availablePatterns().forEach(function (item) { fields.pattern.input.append(new Option(item.name, item.id)); }); grid.append(fields.pattern.wrap);
    add('probability', tr('probability'), 'range', '50'); fields.probability.input.min = '0'; fields.probability.input.max = '100'; add('plan', tr('actionPlan'), 'textarea', '', true);
    fields.position = api.field(tr('positionType'), 'select'); fields.position.input.append(new Option('—', ''), new Option('Long', 'Long'), new Option('Short', 'Short')); grid.append(fields.position.wrap);
    add('entries', tr('entries'), 'text', ''); add('stop', tr('stop'), 'number', ''); add('target', tr('target'), 'number', ''); body.append(grid);
  }, function (_, overlay) {
    const selected = availablePatterns().find(function (item) { return item.id === fields.pattern.input.value; });
    const scenario = normalizeScenario({ id: uid('scenario'), entryId: entry.id, index: entry.scenarios.length + 1, title: fields.title.input.value || tr('scenarioTitle'), description: fields.description.input.value, evidence: fields.evidence.input.value, invalidationTagIds: fields.invalidation.input.value.split(/[,،]/).map(function (item) { return item.trim(); }).filter(Boolean), invalidationNote: '', problem: fields.problem.input.value, trigger: fields.trigger.input.value, probabilityHistory: [{ value: Number(fields.probability.input.value), loggedAt: new Date().toISOString() }], executionPlan: { actionPlan: fields.plan.input.value, positionType: fields.position.input.value || null, entryPrices: fields.entries.input.value.split(',').map(function (item) { return Number(item.trim()); }).filter(function (value) { return !Number.isNaN(value); }), stopLoss: fields.stop.input.value ? Number(fields.stop.input.value) : null, takeProfit: fields.target.input.value ? Number(fields.target.input.value) : null, positionStatus: null }, occurred: false, pattern: selected ? { patternTagId: selected.id, name: selected.name, completionThreshold: Number(selected.positionThreshold || selected.completionThreshold || 70), stages: selected.stages.map(function (stage) { return { id: stage.id, index: stage.index, label: stage.label }; }), completedStageIds: [] } : undefined }, entry, entry.scenarios.length);
    if (selected) recordPatternUsage(selected.id, 1);
    entry.scenarios.push(scenario); api.log(session, 'scenario_added', tr('newScenario'), scenario.id, true); api.save(session); overlay.remove(); expandedScenarios[scenario.id] = true; api.open(session.id);
  }, tr('save'));
}
function makeAiResult(session, entry) {
  const scenarios = allScenarios(session);
  const patterns = [];
  scenarios.forEach(function (scenario) {
    const pattern = patternFor(scenario);
    if (pattern && !patterns.some(function (item) { return item.patternName === pattern.name; })) patterns.push({ patternName: pattern.name, confidence: Math.max(40, patternCompletion(scenario)) });
  });
  return {
    provider: 'local-demo',
    chartSummary: tr('aiDemo'),
    patterns: patterns,
    newScenarios: [{ title: tr('suggested'), probability: 55 }],
    scenarioAssessments: scenarios.slice(0, 3).map(function (scenario) { return { scenarioTitle: scenario.title, stillValid: currentProbability(scenario) > 0, note: scenario.trigger || '' }; }),
    annotations: entry.hasImage ? [
      { label: 'Trigger', x: 63, y: 38, color: '#34d399', type: 'point' },
      { label: 'Invalidation', x: 37, y: 68, color: '#fb7185', type: 'zone', w: 22, h: 13 }
    ] : []
  };
}

// UI-only state that must survive session-workspace-logic.js's full-page rebuild-on-every-action
// pattern (every save() ends in api.open(), which tears down and rebuilds .sw-workspace from
// scratch, so a fresh React root/component tree is created on every interaction) - kept as plain
// module state exactly like the file this replaces, not React state, for the same reason.
const expandedScenarios = Object.create(null);
const entryUi = Object.create(null);

const PROB_COLOR = { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)' };

function Pill({ tone, color, children, style }) {
  const c = color || PROB_COLOR[tone] || 'var(--text-muted)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px', borderRadius: 999,
      font: 'var(--type-caption)', fontSize: 10, whiteSpace: 'nowrap', color: c,
      border: '1px solid ' + (tone || color ? 'color-mix(in srgb, ' + c + ' 40%, transparent)' : 'var(--border-hairline)'),
      background: tone || color ? 'color-mix(in srgb, ' + c + ' 10%, transparent)' : 'rgba(11,20,21,.6)',
      ...style
    }}>{children}</span>
  );
}

function Field({ label, value, type, onCommit, readOnly, placeholder, wide }) {
  const shared = {
    defaultValue: value === null || value === undefined ? '' : value, disabled: readOnly, placeholder: placeholder,
    onBlur: (e) => { if (!readOnly) onCommit(e.target.value); },
    dir: 'auto',
    style: {
      boxSizing: 'border-box', width: '100%', padding: type === 'textarea' ? '9px 11px' : '0 11px',
      height: type === 'textarea' ? undefined : 38, minHeight: type === 'textarea' ? 66 : undefined,
      borderRadius: 7, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.5)',
      color: 'var(--text-primary)', font: 'var(--type-body)', fontSize: 12, outline: 'none',
      resize: type === 'textarea' ? 'vertical' : undefined, opacity: readOnly ? .65 : 1
    }
  };
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: wide ? '1 / -1' : undefined, minWidth: 0 }}>
      <span style={{ font: 'var(--type-caption)', fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      {type === 'textarea' ? <textarea rows={3} {...shared} /> : <input type={type || 'text'} {...shared} />}
    </label>
  );
}

function ProbabilityRange({ value, readOnly, onCommit }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const handler = () => onCommit(node.value);
    node.addEventListener('change', handler);
    return () => node.removeEventListener('change', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCommit]);
  return (
    <input
      ref={ref} type="range" min="0" max="100" defaultValue={value} disabled={readOnly}
      style={{ width: '100%', accentColor: PROB_COLOR[probabilityClass(value)] }}
    />
  );
}

function EducationGuide({ strategyId }) {
  const data = educationReferenceData(strategyId);
  if (!data || (!data.values.length && !data.chips.length)) return null;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 10, borderRadius: 9, border: '1px solid var(--border-gold)', background: 'linear-gradient(145deg, var(--char-active-surface), rgba(3,8,7,.45))' }}>
      <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', fontSize: 11, color: 'var(--text-muted)' }}><Icon name="compass" size={13} />{educationCopy('positionGuide')}</h4>
      {!data.values.length ? (
        <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{educationCopy('noGuide')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.values.map(([label, value]) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: 'minmax(54px,.28fr) minmax(0,1fr)', gap: 8, padding: '6px 7px', borderRadius: 6, background: 'rgba(3,8,7,.5)' }}>
              <b style={{ color: 'var(--char-accent)', fontSize: 9 }}>{label}</b>
              <span dir="auto" style={{ color: 'var(--text-primary)', font: 'var(--type-caption)', fontSize: 11, whiteSpace: 'pre-wrap' }}>{value}</span>
            </div>
          ))}
        </div>
      )}
      {!!data.chips.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {data.chips.map(([label, value, suffix]) => (
            <Pill key={label} tone="accent" color="var(--char-accent)">{label}: {new Intl.NumberFormat(localeCode(), { maximumFractionDigits: 2 }).format(Number(value)) + suffix}</Pill>
          ))}
        </div>
      )}
    </section>
  );
}

function AiSummaryBlock({ api, session, entry }) {
  const result = entry.aiAnalysisResult;
  const state = entryUi[entry.id] || (entryUi[entry.id] = {});
  const [, tick] = React.useReducer((x) => x + 1, 0);
  if (!result) return null;
  function toggle() { state.aiOpen = !state.aiOpen; tick(); }
  return (
    <section style={{ borderTop: '1px solid var(--border-hairline)', background: 'var(--char-active-surface)' }}>
      <button type="button" onClick={toggle} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '9px 11px', border: 0, background: 'transparent', color: 'var(--char-accent)', cursor: 'pointer', font: 'var(--type-caption)', fontWeight: 700, fontSize: 11, textAlign: 'start' }}>
        <Icon name="sparkles" size={14} /> {tr('aiTitle')}
        <span style={{ marginInlineStart: 'auto', color: 'var(--text-muted)', fontWeight: 600 }}>{state.aiOpen ? tr('close') : tr('view')}</span>
      </button>
      {state.aiOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '2px 11px 11px', color: 'var(--text-primary)', font: 'var(--type-caption)', fontSize: 11, lineHeight: 1.8 }}>
          {result.chartSummary && <p style={{ margin: 0 }} dir="auto">{result.chartSummary}</p>}
          {!!(result.patterns && result.patterns.length) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <b style={{ color: 'var(--text-muted)', fontSize: 10 }}>{tr('matchedPatterns')}</b>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{result.patterns.map((p, i) => <Pill key={i} tone="accent" color="var(--char-accent)">{p.patternName} · {p.confidence}%</Pill>)}</div>
            </div>
          )}
          {!!(result.scenarioAssessments && result.scenarioAssessments.length) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <b style={{ color: 'var(--text-muted)', fontSize: 10 }}>{tr('assessments')}</b>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {result.scenarioAssessments.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, width: '100%' }}>
                    <i style={{ width: 6, height: 6, marginTop: 5, borderRadius: '50%', background: item.stillValid ? 'var(--success)' : 'var(--danger)', flex: 'none' }} />
                    <span dir="auto">{item.scenarioTitle} — {item.stillValid ? tr('valid') : tr('violated')}{item.note ? ' · ' + item.note : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!!(result.newScenarios && result.newScenarios.length) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <b style={{ color: 'var(--text-muted)', fontSize: 10 }}>{tr('suggestions')}</b>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{result.newScenarios.map((s, i) => <span key={i} dir="auto">{s.title} · {s.probability}%</span>)}</div>
            </div>
          )}
          <small style={{ color: 'var(--text-muted)' }}>{tr('localProvider')}</small>
        </div>
      )}
    </section>
  );
}

function ScenarioCard({ api, session, entry, scenario }) {
  normalizeScenario(scenario, entry, entry.scenarios.indexOf(scenario));
  const readOnly = session.status === 'closed';
  const [, tick] = React.useReducer((x) => x + 1, 0);
  const open = Boolean(expandedScenarios[scenario.id]);
  const probability = currentProbability(scenario);
  const completion = formCompletion(scenario);
  const pattern = patternFor(scenario);
  const patternPercent = patternCompletion(scenario);
  const threshold = Number((pattern && pattern.positionThreshold) || (scenario.pattern && scenario.pattern.completionThreshold) || 70);
  const unlocked = patternPercent >= threshold;
  const plan = scenario.executionPlan;
  const linkedTrade = window.TradeJournalTradeStore && window.TradeJournalTradeStore.findBySource ? window.TradeJournalTradeStore.findBySource(session.id, scenario.id) : null;
  const linkedStrategyId = (linkedTrade && linkedTrade.linkedStrategyId) || (scenario.executionPlan && scenario.executionPlan.linkedStrategyId) || scenario.linkedStrategyId || null;
  const references = laterReferences(session, scenario.id);

  function update(patch, logType, detail) { Object.assign(scenario, patch); scenario.formCompletionPercent = formCompletion(scenario); saveAndOpen(api, session, logType || null, detail || '', scenario.id, logType ? true : false); }
  function toggleOpen() { expandedScenarios[scenario.id] = !open; tick(); }
  function remove(event) { event.stopPropagation(); if (!window.confirm(tr('deleteConfirm'))) return; entry.scenarios = entry.scenarios.filter((item) => item.id !== scenario.id); saveAndOpen(api, session, 'scenario_deleted', tr('deleteConfirm'), scenario.id, false); }
  function selectPattern(value) {
    const selected = availablePatterns().find((item) => item.id === value);
    const previousId = scenario.pattern && scenario.pattern.patternTagId;
    scenario.pattern = selected ? { patternTagId: selected.id, name: selected.name, completionThreshold: Number(selected.positionThreshold || selected.completionThreshold || 70), stages: selected.stages.map((stage) => ({ id: stage.id, index: stage.index, label: stage.label })), completedStageIds: [] } : undefined;
    if (selected && selected.id !== previousId) recordPatternUsage(selected.id, 1);
    saveAndOpen(api, session, 'pattern_attached', selected ? selected.name : tr('noPattern'), scenario.id, true);
  }
  function toggleStage(stageId, label) {
    const ids = scenario.pattern.completedStageIds;
    const at = ids.indexOf(stageId);
    if (at > -1) ids.splice(at, 1); else ids.push(stageId);
    saveAndOpen(api, session, 'pattern_stage_toggled', label, scenario.id, true);
  }
  function setPositionType(value) { plan.positionType = value; saveAndOpen(api, session, 'position_edited', tr('positionType'), scenario.id, true); }
  function toggleOccurred() { scenario.occurred = !scenario.occurred; session.finalOutcomeScenarioId = scenario.occurred ? scenario.id : (session.finalOutcomeScenarioId === scenario.id ? null : session.finalOutcomeScenarioId); saveAndOpen(api, session, 'occurred_toggled', tr('occurredAction'), scenario.id, true); }
  function runAutofill(value) {
    if (!value.trim()) return;
    const lines = value.split(/\n+/);
    const lookup = (pattern) => { const line = lines.find((item) => pattern.test(item)); return line ? line.replace(/^.*?[:：]/, '').trim() : ''; };
    scenario.description = lookup(/شرح|description|descripci[oó]n|الوصف/i) || scenario.description || value;
    scenario.evidence = lookup(/شواهد|evidence|evidencia|أدلة/i) || scenario.evidence;
    scenario.problem = lookup(/مشکل|problem|problema|مشكلة/i) || scenario.problem;
    scenario.trigger = lookup(/تریگر|trigger|activador|محفز/i) || scenario.trigger;
    const probMatch = value.match(/(?:احتمال|probability|probabilidad|احتمال)\D{0,8}(\d{1,3})/i);
    if (probMatch) scenario.probabilityHistory.push({ value: Math.max(0, Math.min(100, Number(probMatch[1]))), loggedAt: new Date().toISOString() });
    scenario.rawPastedText = value;
    saveAndOpen(api, session, 'scenario_autofilled', tr('autoFill'), scenario.id, true);
  }

  // AI process registry (A4) - per-scenario id, since several scenario cards can legitimately be
  // expanded at once (this is exactly the multi-instance case ai-process-registry.js's
  // most-recently-registered tiebreak was added for). mountedRef template - this component
  // genuinely mounts/unmounts on every saveAndOpen()-triggered rebuild, so a fresh effect run
  // (and a fresh registration) happens on every one of those, same as a real navigation would.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('session-scenario-' + scenario.id, {
      allowlist: ['title', 'description', 'evidence', 'problem', 'trigger', 'invalidationNote', 'positionType', 'entryPrices', 'stopLoss', 'takeProfit'],
      isOpen: () => mountedRef.current && open,
      applyValue: (path, value) => {
        if (['title', 'description', 'evidence', 'problem', 'trigger', 'invalidationNote'].indexOf(path) > -1) { update({ [path]: String(value ?? '') }, 'note_edited', tr(path) || path); return; }
        if (path === 'positionType') { setPositionType(String(value ?? '')); return; }
        if (path === 'entryPrices') {
          plan.entryPrices = (Array.isArray(value) ? value : String(value).split(',')).map((item) => Number(String(item).trim())).filter((n) => !Number.isNaN(n));
          saveAndOpen(api, session, 'position_edited', tr('entries'), scenario.id, true);
          return;
        }
        if (path === 'stopLoss') { plan.stopLoss = value === '' || value == null ? null : Number(value); saveAndOpen(api, session, 'position_edited', tr('stop'), scenario.id, true); return; }
        if (path === 'takeProfit') { plan.takeProfit = value === '' || value == null ? null : Number(value); saveAndOpen(api, session, 'position_edited', tr('target'), scenario.id, true); }
      }
    });
    return () => { mountedRef.current = false; };
  }, [scenario.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel variant={open ? 'active' : 'base'} radius={10} style={{ overflow: 'hidden' }}>
      <header
        onClick={(e) => { if (!e.target.closest('.swc-delete')) toggleOpen(); }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42, padding: '8px 10px', cursor: 'pointer', flexWrap: 'wrap' }}
      >
        <span style={{ color: 'var(--text-muted)', flex: 'none', display: 'flex' }}><Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} /></span>
        <strong dir="auto" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--parchment)', font: 'var(--type-body)', fontSize: 13 }}>{scenario.title}</strong>
        <Pill tone={probabilityClass(probability)}>{probability}%</Pill>
        {pattern && <Pill tone={unlocked ? 'success' : undefined}><Icon name={unlocked ? 'shield-check' : 'lock-keyhole'} size={11} />{patternPercent}% {tr('pattern')}</Pill>}
        <Pill>{completion}% {tr('complete')}</Pill>
        {scenario.occurred && <Pill tone="success"><Icon name="circle-check-big" size={11} />{tr('occurred')}</Pill>}
        {scenario.carriedOverFrom && <Pill tone="warning">{tr('carried')} {scenario.carriedOverFrom.tradingSession}</Pill>}
        {!!references && <small style={{ color: 'var(--text-muted)', font: 'var(--type-caption)', fontSize: 9 }}>{references} {tr('laterRefs')}</small>}
        {!readOnly && (
          <button type="button" className="swc-delete" onClick={remove} title={tr('deleteConfirm')} style={{ marginInlineStart: 'auto', width: 24, height: 24, display: 'grid', placeItems: 'center', border: 0, borderRadius: 6, background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}>
            <Icon name="trash-2" size={14} />
          </button>
        )}
      </header>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, borderTop: '1px solid var(--border-hairline)' }}>
          <Field label={tr('title')} value={scenario.title} onCommit={(v) => update({ title: v })} readOnly={readOnly} />
          <Field label={tr('description')} type="textarea" value={scenario.description} onCommit={(v) => update({ description: v })} readOnly={readOnly} />
          <Field label={tr('evidence')} type="textarea" value={scenario.evidence} onCommit={(v) => update({ evidence: v })} readOnly={readOnly} />

          <section style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 10, borderRadius: 9, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.4)' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', fontSize: 11, color: 'var(--text-muted)' }}><Icon name="layers-3" size={13} />{tr('patternTag')}</h4>
            <select
              disabled={readOnly} value={(pattern && pattern.id) || ''} onChange={(e) => selectPattern(e.target.value)}
              style={{ height: 38, boxSizing: 'border-box', padding: '0 10px', borderRadius: 7, border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-primary)', font: 'var(--type-body)', fontSize: 12 }}
            >
              <option value="">{tr('noPattern')}</option>
              {availablePatterns().map((item) => <option key={item.id} value={item.id}>{item.name} ({item.stages.length})</option>)}
            </select>
            {pattern && (
              <React.Fragment>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, color: 'var(--text-muted)', font: 'var(--type-caption)', fontSize: 10 }}>
                  <span>{tr('patternStages')}</span><b style={{ color: 'var(--char-accent)' }}>{tr('patternCompletion')}: {patternPercent}%</b>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {pattern.stages.map((stage) => {
                    const done = scenario.pattern.completedStageIds.indexOf(stage.id) > -1;
                    return (
                      <button
                        key={stage.id} type="button" disabled={readOnly} onClick={() => toggleStage(stage.id, stage.label)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '6px 9px', borderRadius: 7, textAlign: 'start',
                          border: '1px solid ' + (done ? 'var(--char-accent)' : 'var(--border-hairline)'),
                          background: done ? 'var(--char-active-surface)' : 'var(--surface-800)',
                          color: done ? 'var(--char-accent)' : 'var(--text-muted)', font: 'var(--type-caption)', fontSize: 11, cursor: readOnly ? 'not-allowed' : 'pointer'
                        }}
                      ><Icon name={done ? 'circle-check-big' : 'circle'} size={13} />{stage.index} · {stage.label}</button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px', borderRadius: 7, border: '1px solid ' + (unlocked ? 'rgba(46,204,113,.35)' : 'var(--border-hairline)'), background: unlocked ? 'rgba(46,204,113,.1)' : 'transparent', color: unlocked ? 'var(--success)' : 'var(--text-muted)', font: 'var(--type-caption)', fontSize: 11 }}>
                  <Icon name={unlocked ? 'shield-check' : 'lock-keyhole'} size={14} />
                  <b>{unlocked ? tr('protocolOpen') : tr('protocolLocked')}</b>
                  <small style={{ marginInlineStart: 'auto' }}>{patternRequirement(threshold)}</small>
                </div>
              </React.Fragment>
            )}
          </section>

          <EducationGuide strategyId={linkedStrategyId} />

          <section style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 10, borderRadius: 9, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.4)' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', fontSize: 11, color: 'var(--text-muted)' }}><Icon name="triangle-alert" size={13} />{tr('invalidation')}</h4>
            <Field label={tr('invalidation')} value={(scenario.invalidationTagIds || []).join(', ')} placeholder={tr('invalidationPlaceholder')} onCommit={(v) => update({ invalidationTagIds: v.split(/[,،]/).map((item) => item.trim()).filter(Boolean) })} readOnly={readOnly} />
            <Field label="" type="textarea" value={scenario.invalidationNote || ''} placeholder={tr('invalidationNote')} onCommit={(v) => update({ invalidationNote: v }, 'note_edited', tr('invalidationNote'))} readOnly={readOnly} />
          </section>

          <Field label={tr('problem')} type="textarea" value={scenario.problem} onCommit={(v) => update({ problem: v })} readOnly={readOnly} />
          <Field label={tr('trigger')} type="textarea" value={scenario.trigger} onCommit={(v) => update({ trigger: v })} readOnly={readOnly} />

          <section style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 10, borderRadius: 9, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ font: 'var(--type-caption)', fontSize: 11, color: 'var(--text-muted)' }}>% {tr('probability')}</span>
              <b style={{ color: PROB_COLOR[probabilityClass(probability)], font: 'var(--type-body)' }}>{probability}%</b>
            </div>
            <ProbabilityRange value={probability} readOnly={readOnly} onCommit={(v) => addProbability(api, session, scenario, v)} />
            {scenario.probabilityHistory.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, color: 'var(--text-muted)', font: 'var(--type-caption)', fontSize: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="history" size={12} />{tr('history')}</span>
                {scenario.probabilityHistory.slice(-6).map((item, index, sliced) => {
                  const previous = index ? Number(sliced[index - 1].value) : Number(item.value);
                  const trend = Number(item.value) - previous;
                  return <Pill key={index}>{item.value}% {trend > 0 ? '↑' : trend < 0 ? '↓' : '•'} {clockInZone(item.loggedAt, 'Asia/Tehran')}</Pill>;
                })}
              </div>
            )}
            {!!(scenario.confirmedInvalidationTagIds || []).length && (
              <div style={{ padding: 7, borderRadius: 7, border: '1px solid rgba(255,56,48,.28)', color: 'var(--danger)', background: 'rgba(255,56,48,.08)', font: 'var(--type-caption)', fontSize: 11 }}>
                ⚠ {tr('invalidated')}: {scenario.confirmedInvalidationTagIds.join('، ')}
              </div>
            )}
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 10, borderRadius: 9, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0, font: 'var(--type-caption)', fontSize: 11, color: 'var(--text-muted)' }}>{tr('execution')}</h4>
              {unlocked && <Pill tone="success"><Icon name="shield-check" size={11} />{tr('protocolOpen')}</Pill>}
            </div>
            <Field label={tr('actionPlan')} type="textarea" value={plan.actionPlan || ''} placeholder={tr('actionPlaceholder')} onCommit={(v) => { plan.actionPlan = v; saveAndOpen(api, session, null); }} readOnly={readOnly} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ font: 'var(--type-caption)', fontSize: 11, color: 'var(--text-muted)' }}>{tr('positionType')}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['Long', 'Short'].map((value) => {
                  const active = plan.positionType === value;
                  const tone = value === 'Long' ? 'var(--success)' : 'var(--danger)';
                  return (
                    <button
                      key={value} type="button" disabled={readOnly} onClick={() => setPositionType(value)}
                      style={{ flex: 1, minHeight: 36, borderRadius: 7, border: '1px solid ' + (active ? tone : 'var(--border-gold)'), background: active ? 'color-mix(in srgb, ' + tone + ' 14%, transparent)' : 'rgba(11,20,21,.72)', color: active ? tone : 'var(--text-muted)', font: 'var(--type-caption)', fontWeight: 700, fontSize: 11, cursor: readOnly ? 'not-allowed' : 'pointer' }}
                    >{value === 'Long' ? tr('long') : tr('short')}</button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 7 }}>
              <Field label={tr('entries')} value={(plan.entryPrices || []).join(', ')} onCommit={(v) => { plan.entryPrices = v.split(',').map((item) => Number(item.trim())).filter((n) => !Number.isNaN(n)); saveAndOpen(api, session, 'position_edited', tr('entries'), scenario.id, true); }} readOnly={readOnly} />
              <Field label={tr('stop')} type="number" value={plan.stopLoss} placeholder={tr('optional')} onCommit={(v) => { plan.stopLoss = v ? Number(v) : null; saveAndOpen(api, session, 'position_edited', tr('stop'), scenario.id, true); }} readOnly={readOnly} />
              <Field label={tr('target')} type="number" value={plan.takeProfit} placeholder={tr('optional')} onCommit={(v) => { plan.takeProfit = v ? Number(v) : null; saveAndOpen(api, session, 'position_edited', tr('target'), scenario.id, true); }} readOnly={readOnly} />
            </div>
          </section>

          <button
            type="button" disabled={readOnly} onClick={toggleOccurred}
            style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '0 12px', borderRadius: 8, textAlign: 'start', border: '1px solid ' + (scenario.occurred ? 'var(--success)' : 'var(--border-gold)'), background: scenario.occurred ? 'rgba(46,204,113,.1)' : 'rgba(11,20,21,.72)', color: scenario.occurred ? 'var(--success)' : 'var(--text-muted)', font: 'var(--type-caption)', fontWeight: 700, fontSize: 12, cursor: readOnly ? 'not-allowed' : 'pointer' }}
          ><Icon name={scenario.occurred ? 'circle-check-big' : 'circle'} size={15} />{tr('occurredAction')}</button>

          {!readOnly && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 9, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.4)' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', fontSize: 11, color: 'var(--text-muted)' }}><Icon name="wand-sparkles" size={13} />{tr('autoFill')}</h4>
              <AutofillBox onParse={runAutofill} />
            </section>
          )}
        </div>
      )}
    </Panel>
  );
}

function AutofillBox({ onParse }) {
  const ref = React.useRef(null);
  return (
    <React.Fragment>
      <textarea
        ref={ref} rows={3} dir="auto" placeholder={tr('autoFillPlaceholder')}
        style={{ boxSizing: 'border-box', width: '100%', padding: '9px 11px', borderRadius: 7, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.5)', color: 'var(--text-primary)', font: 'var(--type-body)', fontSize: 12, resize: 'vertical' }}
      />
      <Button variant="primary" size="sm" icon="wand-sparkles" style={{ alignSelf: 'flex-start' }} onClick={() => onParse(ref.current ? ref.current.value : '')}>{tr('parse')}</Button>
    </React.Fragment>
  );
}

function Annotations({ annotations }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {annotations.map((a, i) => (
        <span
          key={i}
          style={{
            position: 'absolute', left: (a.x || 0) + '%', top: (a.y || 0) + '%', translate: a.type === 'zone' ? '0 0' : '-50% -50%',
            minWidth: 10, minHeight: 10, width: a.w ? a.w + '%' : undefined, height: a.h ? a.h + '%' : undefined,
            padding: a.type === 'zone' ? undefined : '2px 5px', borderRadius: a.type === 'zone' ? 6 : 999,
            border: '1px solid ' + (a.color || '#60a5fa'),
            color: a.type === 'zone' ? (a.color || '#60a5fa') : '#fff',
            background: a.type === 'zone' ? 'color-mix(in srgb, ' + (a.color || '#60a5fa') + ' 15%, transparent)' : 'color-mix(in srgb, ' + (a.color || '#60a5fa') + ' 72%, #07101c)',
            boxShadow: a.type === 'zone' ? 'inset 0 0 0 1px color-mix(in srgb, ' + (a.color || '#60a5fa') + ' 15%, transparent)' : '0 0 0 3px color-mix(in srgb, ' + (a.color || '#60a5fa') + ' 15%, transparent)',
            font: '800 7px Arial,sans-serif'
          }}
        >{a.label || ''}</span>
      ))}
    </div>
  );
}

function openLightbox(src, result, showAnnotations) {
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'fixed', inset: 0, zIndex: 200, display: 'grid', placeItems: 'center', padding: 24, background: 'var(--scrim, rgba(3,8,7,.86))', backdropFilter: 'blur(6px)' });
  const root = createRoot(box);
  function close() { root.unmount(); box.remove(); }
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  root.render(
    <div style={{ position: 'relative', maxWidth: 'min(1200px,94vw)', maxHeight: '88vh' }}>
      <button type="button" onClick={close} style={{ position: 'absolute', top: -44, insetInlineStart: 0, width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--border-gold)', background: 'var(--surface-800)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="x" size={18} /></button>
      <img src={src} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: '88vh', borderRadius: 12, border: '1px solid var(--border-gold)', boxShadow: '0 25px 80px rgba(0,0,0,.65)', objectFit: 'contain' }} />
      {showAnnotations && result && result.annotations && result.annotations.length > 0 && <Annotations annotations={result.annotations} />}
    </div>
  );
  document.body.append(box);
}

function TimelineEntryCard({ session: rawSession, entry, api }) {
  const session = normalizeSession(rawSession);
  const readOnly = session.status === 'closed';
  const state = entryUi[entry.id] || (entryUi[entry.id] = { showAnnotated: true });
  const [, tick] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    if (entry.imageBlobId && !state.imageLoadDone && !state.loadingImage && window.TradeJournalImageStore) {
      state.loadingImage = true;
      window.TradeJournalImageStore.loadImageUrl(entry.imageBlobId).then((url) => {
        state.loadingImage = false; state.imageLoadDone = true; state.loadedUrl = url || ''; api.open(session.id);
      }).catch(() => { state.loadingImage = false; state.imageLoadDone = true; state.loadedUrl = ''; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.imageBlobId]);

  const market = marketName(entry, session), marketData = markets[market] || markets.London;
  const typeIcon = entry.type === 'movement' ? 'activity' : entry.type === 'fate' ? 'flag' : 'chart-candlestick';
  const typeLabel = entry.type === 'movement' ? tr('movement') : entry.type === 'fate' ? tr('fate') : tr('chart');
  const src = entry.preview || entry.imageUrl || state.loadedUrl || null;
  const related = (entry.relatedScenarioIds || []).map((id) => allScenarios(session).find((s) => s.id === id)).filter(Boolean);
  const scenarios = entry.scenarios.slice().sort((a, b) => currentProbability(b) - currentProbability(a));

  function runAi() { entry.aiAnalysisResult = makeAiResult(session, entry); api.log(session, 'ai_analysis', tr('aiTitle'), null, false); api.save(session); api.open(session.id); }
  function removeEntry() {
    if (!window.confirm(tr('entryDeleteConfirm'))) return;
    if (entry.imageBlobId && window.TradeJournalImageStore) window.TradeJournalImageStore.deleteImage(entry.imageBlobId);
    session.entries = session.entries.filter((item) => item.id !== entry.id);
    saveAndOpen(api, session, 'entry_deleted', tr('entryDeleteConfirm'), null, false);
  }
  function commitNote(value) { entry.note = value; saveAndOpen(api, session, 'note_edited', tr('note'), null, false); }
  function commitMovement(value) { entry.movementNote = value; saveAndOpen(api, session, 'note_edited', tr('note'), null, false); }

  // AI process registry (A4) - per-entry id, same multi-instance/mountedRef reasoning as
  // ScenarioCard above (several timeline entry cards can be visible on screen at once).
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('session-entry-' + entry.id, {
      allowlist: ['note', 'movementNote'],
      isOpen: () => mountedRef.current,
      applyValue: (path, value) => {
        if (path === 'note') commitNote(String(value ?? ''));
        else if (path === 'movementNote') commitMovement(String(value ?? ''));
      }
    });
    return () => { mountedRef.current = false; };
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps
  function setAnnotated(value) { state.showAnnotated = value; tick(); }

  return (
    <Panel variant="prestige" radius={12} ornament style={{ display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 46, padding: '6px 10px', flexWrap: 'wrap', background: 'rgba(3,8,7,.55)' }}>
        <span style={{ color: 'var(--char-accent)', flex: 'none', display: 'flex' }}><Icon name={typeIcon} size={18} /></span>
        <b dir="auto" style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--parchment)' }}>{typeLabel}</b>
        <Pill><Icon name={marketData.icon} size={11} /> {market}</Pill>
        <Pill>{entry.timeframe || session.timeframe || '5m'}</Pill>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginInlineStart: 'auto' }}>
          {(entry.hasImage || entry.preview) && (
            <Button variant="secondary" size="sm" icon="sparkles" onClick={runAi}>{tr('ai')}</Button>
          )}
          {!readOnly && (
            <button type="button" onClick={removeEntry} title={tr('entryDeleteConfirm')} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: '1px solid var(--border-hairline)', borderRadius: 7, background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}>
              <Icon name="trash-2" size={15} />
            </button>
          )}
        </div>
      </header>

      {src ? (
        <div style={{ position: 'relative', isolation: 'isolate', maxHeight: 280, background: 'var(--ink-950)', cursor: 'zoom-in' }} onClick={() => openLightbox(src, entry.aiAnalysisResult, state.showAnnotated)}>
          <img src={src} alt={tr('chart')} style={{ display: 'block', width: '100%', maxHeight: 280, objectFit: 'contain' }} />
          {state.showAnnotated && entry.aiAnalysisResult && entry.aiAnalysisResult.annotations && <Annotations annotations={entry.aiAnalysisResult.annotations} />}
          {entry.aiAnalysisResult && entry.aiAnalysisResult.annotations && entry.aiAnalysisResult.annotations.length > 0 && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', zIndex: 4, top: 8, insetInlineEnd: 8, display: 'flex', gap: 2, padding: 2, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.9)', backdropFilter: 'blur(8px)' }}>
              <button type="button" onClick={() => setAnnotated(false)} style={{ minHeight: 24, padding: '0 7px', border: 0, borderRadius: 6, font: 'var(--type-caption)', fontSize: 8, cursor: 'pointer', color: !state.showAnnotated ? 'var(--char-accent)' : 'var(--text-muted)', background: !state.showAnnotated ? 'var(--char-active-surface)' : 'transparent' }}>{tr('raw')}</button>
              <button type="button" onClick={() => setAnnotated(true)} style={{ minHeight: 24, padding: '0 7px', border: 0, borderRadius: 6, font: 'var(--type-caption)', fontSize: 8, cursor: 'pointer', color: state.showAnnotated ? 'var(--char-accent)' : 'var(--text-muted)', background: state.showAnnotated ? 'var(--char-active-surface)' : 'transparent' }}>✦ {tr('annotated')}</button>
            </div>
          )}
          <span style={{ position: 'absolute', zIndex: 4, top: '50%', insetInlineStart: '50%', translate: '-50% -50%', padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border-gold)', color: '#fff', background: 'rgba(3,8,7,.82)', font: 'var(--type-caption)', fontSize: 9, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="zoom-in" size={12} />{tr('zoom')}</span>
        </div>
      ) : entry.type === 'movement' ? (
        <div style={{ padding: 12 }}>
          <textarea
            defaultValue={entry.movementNote || entry.note || ''} disabled={readOnly} dir="auto"
            onBlur={(e) => { if (!readOnly) commitMovement(e.target.value); }}
            style={{ boxSizing: 'border-box', width: '100%', minHeight: 60, padding: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--text-primary)', resize: 'vertical', font: 'var(--type-body)', fontSize: 12, lineHeight: 1.8 }}
          />
        </div>
      ) : (
        <div style={{ minHeight: 92, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', background: 'var(--ink-950)', font: 'var(--type-caption)', fontSize: 11 }}>{tr('noImage')}</div>
      )}

      {(entry.type === 'chart' || src) && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderBottom: '1px solid var(--border-hairline)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', font: 'var(--type-caption)', fontSize: 9 }}><Icon name="message-square-text" size={12} />{tr('note')}</span>
          <textarea
            defaultValue={entry.note || ''} placeholder={tr('notePlaceholder')} disabled={readOnly} dir="auto"
            onBlur={(e) => { if (!readOnly) commitNote(e.target.value); }}
            style={{ boxSizing: 'border-box', width: '100%', minHeight: 40, padding: '6px 0', border: 0, outline: 'none', background: 'transparent', color: 'var(--text-primary)', resize: 'vertical', font: 'var(--type-body)', fontSize: 11, lineHeight: 1.8 }}
          />
        </label>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '7px 10px', borderBottom: '1px solid var(--border-hairline)', color: 'var(--text-muted)', font: 'var(--type-caption)', fontSize: 9, fontWeight: 600 }}>
        <span style={{ color: 'var(--char-accent)' }}>● {tr('marketTime')}: {clockInZone(entry.createdAt, marketData.zone)}</span>
        <span className="navrya-tabular">{tr('tehran')}: {clockInZone(entry.createdAt, 'Asia/Tehran')}</span>
      </div>

      <AiSummaryBlock api={api} session={session} entry={entry} />

      {related.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--border-hairline)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)', font: 'var(--type-caption)', fontSize: 9 }}><Icon name="link-2" size={12} />{tr('related')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {related.map((scenario) => <Pill key={scenario.id} tone="accent" color="var(--char-accent)">{scenario.title} · {currentProbability(scenario)}%</Pill>)}
          </div>
        </section>
      )}

      {scenarios.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 9 }}>
          {scenarios.map((scenario) => <ScenarioCard key={scenario.id} api={api} session={session} entry={entry} scenario={scenario} />)}
        </div>
      )}

      {!readOnly && (
        <button
          type="button" onClick={() => openScenarioModal(api, session, entry)}
          style={{ width: 'calc(100% - 18px)', margin: '0 9px 9px', minHeight: 36, borderRadius: 8, border: '1px dashed var(--border-gold)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', font: 'var(--type-caption)', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        ><Icon name="plus" size={14} />{tr('addScenario')}</button>
      )}
    </Panel>
  );
}

// session-workspace-logic.js's entryCard() defers to this hook when present - same real
// session/entry objects, save()/log()/open()/modal()/field() callbacks passed through unchanged.
export function renderEntry(payload) {
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(<TimelineEntryCard session={payload.session} entry={payload.entry} api={payload.api} />);
  return container;
}

function ActionsRow({ readOnly, onAddChart, onLogMovement, onSessionFate }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Button variant="secondary" icon="image-plus" disabled={readOnly} onClick={onAddChart}>{tr('addChartAction')}</Button>
      <Button variant="secondary" icon="activity" disabled={readOnly} onClick={onLogMovement}>{tr('logMovementAction')}</Button>
      <Button variant="primary" icon="flag" disabled={readOnly} onClick={onSessionFate}>{tr('sessionFateAction')}</Button>
    </div>
  );
}

// session-workspace-logic.js's actions() defers to this hook when present - same
// entryModal()/fateModal() calls (passed through as onAddChart/onLogMovement/onSessionFate),
// only the 3 buttons' markup changed from manual DOM building to a real NAVRYA Button row.
export function renderActions(payload) {
  const container = document.createElement('div');
  container.className = 'session-actions sw-actions';
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(
    <ActionsRow readOnly={payload.readOnly} onAddChart={payload.onAddChart} onLogMovement={payload.onLogMovement} onSessionFate={payload.onSessionFate} />
  );
  return container;
}

function NavIconButton({ icon, size = 36, onClick, title }) {
  return (
    <button
      type="button" onClick={onClick} title={title} aria-label={title}
      style={{ width: size, height: size, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)', cursor: 'pointer' }}
    ><Icon name={icon} size={16} /></button>
  );
}

function TimelineNavRow({ mode, canNavigate, onModeChange, onPrev, onNext }) {
  const segments = [['compact', 'panels-top-left'], ['expanded', 'maximize-2']];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
      <div role="group" style={{ height: 36, boxSizing: 'border-box', display: 'inline-flex', padding: 3, gap: 3, borderRadius: 8, background: 'rgba(11,20,21,.72)', border: '1px solid var(--border-gold)' }}>
        {segments.map(([value, icon]) => {
          const on = value === mode;
          return (
            <button
              key={value} type="button" aria-pressed={on} onClick={() => onModeChange(value)}
              style={{ width: 30, borderRadius: 6, border: 0, cursor: 'pointer', display: 'grid', placeItems: 'center', background: on ? 'var(--char-accent)' : 'transparent', color: on ? 'var(--ink-950)' : 'var(--text-muted)' }}
            ><Icon name={icon} size={15} /></button>
          );
        })}
      </div>
      {canNavigate && (
        <React.Fragment>
          <NavIconButton icon="chevron-left" onClick={onPrev} title={tr('prevEntry')} />
          <NavIconButton icon="chevron-right" onClick={onNext} title={tr('nextEntry')} />
        </React.Fragment>
      )}
    </div>
  );
}

// session-workspace-logic.js's timeline() defers to this hook when present for just the
// compact/expand + prev/next nav row above the entry cards - same onModeChange()/open() cycle
// and the same timelineEl.scrollBy() handlers passed through as onPrev/onNext, only the markup
// changed from 4 unstyled DOM buttons (with no active-state indicator at all) to a real
// segmented control + icon buttons.
export function renderTimelineNav(payload) {
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(
    <TimelineNavRow mode={payload.mode} canNavigate={payload.canNavigate} onModeChange={payload.onModeChange} onPrev={payload.onPrev} onNext={payload.onNext} />
  );
  return container;
}

export { patternCatalog, availablePatterns };
