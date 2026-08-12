import React from 'react';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import * as sessionsAdapter from './sessionsAdapter.js';

// React rewrite of the "open session" workspace (session-workspace-logic.js's vanilla-DOM
// open()/meta()/dashboard()/timeline()/report()) per the "Live Session" design handoff. UI only
// where the old screen already had real data: session/entry/scenario shapes, save()/log()/id()
// (exposed on window.TradeJournalWorkspace for this file - see session-workspace-logic.js),
// pattern completion + the real per-pattern completion threshold (session-workspace-logic.js's
// patternState(), already resolved onto scenario.pattern by find()'s normalize() pass), real
// Trade linkage (trade.source.sessionId/scenarioId) and the real session-similarity engine
// (session-signature-store.js/session-signature-engine.js). Two things the DC prototype only
// simulated are wired to real behaviour here per the handoff's own README: entry timestamps are
// each entry's real createdAt (not a fake 09:00 anchor) and "attach image" is a real file picker
// through window.TradeJournalImageStore, not a boolean flip.
//
// The DC prototype's Fate button/"سرنوشت سشن" only ever switches the view to the Report tab
// (`onFate: () => patchLive({ view: 'report' })`) - it never closes a session or opens a fate
// form anywhere in the handoff. Matched verbatim: no closing action is added here.

const SPAN_MIN = 180; // decorative pacing window shared by both pulse rings and the ruler - real
// sessions are open-ended (no stored "planned length"), this only gives the sweep/ruler the same
// fixed visual scale the design uses; the digital clock text next to it is always real elapsed time.

const copy = {
  fa: {
    back: 'بازگشت', settingsTitle: 'تنظیمات سشن', sessionOpen: 'باز', sessionClosed: 'بسته',
    viewTimeline: 'تایم‌لاین', viewReport: 'گزارش سشن', ringSessionLabel: 'زمان سشن', ringLoopLabel: 'تایمر لوپ',
    pulseEntries: 'ورودی‌ها', pulseEntriesUnit: 'چارت و حرکت', pulseScenarios: 'سناریوها', pulseScenariosUnit: 'ثبت‌شده',
    pulsePatterns: 'الگوها', pulsePatternsUnit: 'تگ‌شده', pulsePositions: 'پوزیشن‌ها', pulsePositionsUnit: 'باز',
    fateButton: 'سرنوشت سشن', focusHigh: 'تمرکز بالا', focusMedium: 'تمرکز متوسط', focusLow: 'تمرکز پایین',
    cockpitTitle: 'ثبت چارت و تایم‌لاین', filterAll: 'همه', filterChart: 'چارت', filterMove: 'حرکت', filterScen: 'سناریو‌دار',
    searchPlaceholder: 'جست‌وجو در ورودی‌ها', addMove: 'ثبت حرکت', addChart: 'افزودن چارت',
    prevEntry: 'ورودی قبلی', nextEntry: 'ورودی بعدی', newEntryTile: 'ورودی جدید',
    scenCountSuffix: 'سناریو', noScenarios: 'بدون سناریو', aiBadge: 'AI', startShort: 'شروع', endShort: 'پایان',
    counterOf: 'از', counterEntryWord: 'ورودی', counterNone: '۰ ورودی', keyboardHint: 'جابه‌جایی با کلیدهای ← →',
    kindChart: 'چارت', kindMove: 'حرکت', kindFate: 'سرنوشت',
    aiAnalyzeButton: 'تحلیل AI', deleteEntryTitle: 'حذف ورودی', fullscreenTitle: 'نمایش تمام‌صفحه',
    noImageText: 'تصویری برای این ورودی ثبت نشده است', uploadImage: 'بارگذاری تصویر',
    noteLabel: 'یادداشت این ورودی', notePlaceholder: 'چه چیزی در این لحظه دیدید؟',
    aiStripTitle: 'تحلیل هوش مصنوعی این ورودی', aiReady: 'تحلیل آماده است', aiNotReady: 'هنوز تحلیل نشده',
    viewAction: 'مشاهده', closeAction: 'بستن', aiDemoSummary: 'تحلیل محلی: ساختار چارت با سناریوهای فعال این سشن مقایسه شد.',
    scenariosOfEntry: 'سناریوهای این ورودی', scenarioTitleLabel: 'عنوان سناریو', scenarioDescLabel: 'شرح و شواهد',
    scenarioDescPlaceholder: 'چرا این سناریو معتبر است؟', noPatternTag: 'بدون تگ الگو', noPatternChip: 'بدون الگو',
    patternChipPrefix: 'الگو', lockedNoticeTemplate: 'پروتکل پوزیشن قفل است · {threshold}% تکمیل الگو لازم است',
    probabilityLabel: 'درصد احتمال', planTitle: 'نقشه اجرا', sideLong: 'خرید (لانگ)', sideShort: 'فروش (شورت)',
    entryPriceLabel: 'قیمت ورود', stopLabel: 'حد ضرر', targetLabel: 'حد سود',
    invalidationLabel: 'بی‌اعتباری سناریو', invalidationPlaceholder: 'دلایل را با کاما جدا کنید', occurredYes: 'این سناریو اتفاق افتاد',
    addScenario: 'افزودن سناریو', newScenarioTitle: 'سناریو جدید', deleteScenarioTitle: 'حذف سناریو',
    filteredEmptyText: 'با این فیلتر ورودی‌ای پیدا نشد', clearFilter: 'پاک کردن فیلتر',
    dashboardTitle: 'داشبورد سشن', dashPatterns: 'الگوها', dashScenarios: 'سناریوها', dashPositions: 'پوزیشن‌ها',
    dashEmptyPatterns: 'هنوز الگویی به سناریوها تگ نشده است.', dashEmptyScenarios: 'هنوز سناریویی ثبت نشده است.',
    dashEmptyPositions: 'هنوز پوزیشنی از سناریوها باز نشده است.', dashEntryPrefix: 'ورودی',
    occurredYesShort: 'اتفاق افتاد', pendingShort: 'در انتظار',
    tradeStatusHunting: 'شکار', tradeStatusOpen: 'باز', tradeStatusClosed: 'بسته', tradeStatusCancelled: 'لغو شده',
    prevSummaryTitle: 'خلاصه سشن قبلی', prevSummaryEmpty: 'هنوز خلاصه‌ای از سشن قبلی ندارید. پس از بستن سشن، نتیجه و درس‌ها به سشن بعدی منتقل می‌شود.',
    similarTitle: 'سشن‌های مشابه', similarThreshold: 'آستانه هشدار', similarEmpty: 'هنوز سشن مشابه قابل‌اعتمادی پیدا نشد.', similarSummary: 'خلاصه',
    reportTitle: 'گزارش سشن', intervalChip: 'بازه {n}m'
  },
  ar: {
    back: 'رجوع', settingsTitle: 'إعدادات الجلسة', sessionOpen: 'مفتوحة', sessionClosed: 'مغلقة',
    viewTimeline: 'الخط الزمني', viewReport: 'تقرير الجلسة', ringSessionLabel: 'وقت الجلسة', ringLoopLabel: 'مؤقت الحلقة',
    pulseEntries: 'الإدخالات', pulseEntriesUnit: 'رسم وحركة', pulseScenarios: 'السيناريوهات', pulseScenariosUnit: 'مسجّلة',
    pulsePatterns: 'الأنماط', pulsePatternsUnit: 'موسومة', pulsePositions: 'الصفقات', pulsePositionsUnit: 'مفتوحة',
    fateButton: 'مصير الجلسة', focusHigh: 'تركيز عالٍ', focusMedium: 'تركيز متوسط', focusLow: 'تركيز منخفض',
    cockpitTitle: 'تسجيل الرسم والخط الزمني', filterAll: 'الكل', filterChart: 'رسم', filterMove: 'حركة', filterScen: 'بسيناريو',
    searchPlaceholder: 'ابحث في الإدخالات', addMove: 'تسجيل حركة', addChart: 'إضافة رسم',
    prevEntry: 'الإدخال السابق', nextEntry: 'الإدخال التالي', newEntryTile: 'إدخال جديد',
    scenCountSuffix: 'سيناريو', noScenarios: 'بدون سيناريو', aiBadge: 'AI', startShort: 'البداية', endShort: 'النهاية',
    counterOf: 'من', counterEntryWord: 'إدخال', counterNone: '0 إدخال', keyboardHint: 'التنقل بمفاتيح ← →',
    kindChart: 'رسم', kindMove: 'حركة', kindFate: 'مصير',
    aiAnalyzeButton: 'تحليل AI', deleteEntryTitle: 'حذف الإدخال', fullscreenTitle: 'عرض بملء الشاشة',
    noImageText: 'لا توجد صورة لهذا الإدخال', uploadImage: 'رفع صورة',
    noteLabel: 'ملاحظة هذا الإدخال', notePlaceholder: 'ماذا رأيت في هذه اللحظة؟',
    aiStripTitle: 'تحليل الذكاء الاصطناعي لهذا الإدخال', aiReady: 'التحليل جاهز', aiNotReady: 'لم يُحلَّل بعد',
    viewAction: 'عرض', closeAction: 'إغلاق', aiDemoSummary: 'تحليل محلي: تمت مقارنة بنية الرسم بالسيناريوهات النشطة لهذه الجلسة.',
    scenariosOfEntry: 'سيناريوهات هذا الإدخال', scenarioTitleLabel: 'عنوان السيناريو', scenarioDescLabel: 'الشرح والأدلة',
    scenarioDescPlaceholder: 'لماذا هذا السيناريو صالح؟', noPatternTag: 'بدون وسم نمط', noPatternChip: 'بدون نمط',
    patternChipPrefix: 'نمط', lockedNoticeTemplate: 'بروتوكول الصفقة مقفل · يلزم اكتمال {threshold}% من النمط',
    probabilityLabel: 'نسبة الاحتمال', planTitle: 'خطة التنفيذ', sideLong: 'شراء (Long)', sideShort: 'بيع (Short)',
    entryPriceLabel: 'سعر الدخول', stopLabel: 'وقف الخسارة', targetLabel: 'هدف الربح',
    invalidationLabel: 'إبطال السيناريو', invalidationPlaceholder: 'افصل الأسباب بفواصل', occurredYes: 'هذا السيناريو حدث',
    addScenario: 'إضافة سيناريو', newScenarioTitle: 'سيناريو جديد', deleteScenarioTitle: 'حذف السيناريو',
    filteredEmptyText: 'لا يوجد إدخال بهذا الفلتر', clearFilter: 'مسح الفلتر',
    dashboardTitle: 'لوحة الجلسة', dashPatterns: 'الأنماط', dashScenarios: 'السيناريوهات', dashPositions: 'الصفقات',
    dashEmptyPatterns: 'لم يتم وسم أي نمط بعد.', dashEmptyScenarios: 'لم يتم تسجيل أي سيناريو بعد.',
    dashEmptyPositions: 'لا توجد صفقة مفتوحة من السيناريوهات بعد.', dashEntryPrefix: 'إدخال',
    occurredYesShort: 'حدث', pendingShort: 'قيد الانتظار',
    tradeStatusHunting: 'بحث', tradeStatusOpen: 'مفتوحة', tradeStatusClosed: 'مغلقة', tradeStatusCancelled: 'ملغاة',
    prevSummaryTitle: 'ملخص الجلسة السابقة', prevSummaryEmpty: 'لا يوجد ملخص للجلسة السابقة بعد. بعد إغلاق الجلسة تُنقل النتيجة والدروس إلى الجلسة التالية.',
    similarTitle: 'جلسات مشابهة', similarThreshold: 'حد التنبيه', similarEmpty: 'لم يتم العثور على جلسة مشابهة موثوقة بعد.', similarSummary: 'ملخص',
    reportTitle: 'تقرير الجلسة', intervalChip: 'فترة {n} د'
  },
  en: {
    back: 'Back', settingsTitle: 'Session settings', sessionOpen: 'Open', sessionClosed: 'Closed',
    viewTimeline: 'Timeline', viewReport: 'Session report', ringSessionLabel: 'Session time', ringLoopLabel: 'Loop timer',
    pulseEntries: 'Entries', pulseEntriesUnit: 'chart & move', pulseScenarios: 'Scenarios', pulseScenariosUnit: 'logged',
    pulsePatterns: 'Patterns', pulsePatternsUnit: 'tagged', pulsePositions: 'Positions', pulsePositionsUnit: 'open',
    fateButton: 'Session fate', focusHigh: 'High focus', focusMedium: 'Medium focus', focusLow: 'Low focus',
    cockpitTitle: 'Chart & timeline register', filterAll: 'All', filterChart: 'Chart', filterMove: 'Move', filterScen: 'Has scenario',
    searchPlaceholder: 'Search entries', addMove: 'Log movement', addChart: 'Add chart',
    prevEntry: 'Previous entry', nextEntry: 'Next entry', newEntryTile: 'New entry',
    scenCountSuffix: 'scenarios', noScenarios: 'No scenarios', aiBadge: 'AI', startShort: 'Start', endShort: 'End',
    counterOf: 'of', counterEntryWord: 'Entry', counterNone: '0 entries', keyboardHint: 'Navigate with ← → keys',
    kindChart: 'Chart', kindMove: 'Move', kindFate: 'Fate',
    aiAnalyzeButton: 'AI analysis', deleteEntryTitle: 'Delete entry', fullscreenTitle: 'Show fullscreen',
    noImageText: 'No image is attached to this entry', uploadImage: 'Upload image',
    noteLabel: 'Note for this entry', notePlaceholder: 'What did you see at this moment?',
    aiStripTitle: 'AI analysis of this entry', aiReady: 'Analysis ready', aiNotReady: 'Not analyzed yet',
    viewAction: 'View', closeAction: 'Close', aiDemoSummary: 'Local analysis: the chart structure was compared with this session’s active scenarios.',
    scenariosOfEntry: 'Scenarios for this entry', scenarioTitleLabel: 'Scenario title', scenarioDescLabel: 'Description & evidence',
    scenarioDescPlaceholder: 'Why is this scenario valid?', noPatternTag: 'No pattern tag', noPatternChip: 'No pattern',
    patternChipPrefix: 'Pattern', lockedNoticeTemplate: 'Position protocol locked · {threshold}% pattern completion required',
    probabilityLabel: 'Probability', planTitle: 'Execution plan', sideLong: 'Buy (Long)', sideShort: 'Sell (Short)',
    entryPriceLabel: 'Entry price', stopLabel: 'Stop loss', targetLabel: 'Take profit',
    invalidationLabel: 'Scenario invalidation', invalidationPlaceholder: 'Separate reasons with commas', occurredYes: 'This scenario occurred',
    addScenario: 'Add scenario', newScenarioTitle: 'New scenario', deleteScenarioTitle: 'Delete scenario',
    filteredEmptyText: 'No entry matches this filter', clearFilter: 'Clear filter',
    dashboardTitle: 'Session dashboard', dashPatterns: 'Patterns', dashScenarios: 'Scenarios', dashPositions: 'Positions',
    dashEmptyPatterns: 'No pattern is tagged on a scenario yet.', dashEmptyScenarios: 'No scenario is logged yet.',
    dashEmptyPositions: 'No position is open from a scenario yet.', dashEntryPrefix: 'Entry',
    occurredYesShort: 'Occurred', pendingShort: 'Pending',
    tradeStatusHunting: 'Hunting', tradeStatusOpen: 'Open', tradeStatusClosed: 'Closed', tradeStatusCancelled: 'Cancelled',
    prevSummaryTitle: 'Previous session summary', prevSummaryEmpty: 'No previous session summary yet. Closing a session carries its outcome and lessons into the next one.',
    similarTitle: 'Similar sessions', similarThreshold: 'Alert threshold', similarEmpty: 'No trustworthy similar session found yet.', similarSummary: 'Summary',
    reportTitle: 'Session report', intervalChip: '{n}m loop'
  },
  es: {
    back: 'Volver', settingsTitle: 'Ajustes de la sesión', sessionOpen: 'Abierta', sessionClosed: 'Cerrada',
    viewTimeline: 'Línea temporal', viewReport: 'Informe de sesión', ringSessionLabel: 'Tiempo de sesión', ringLoopLabel: 'Temporizador de bucle',
    pulseEntries: 'Entradas', pulseEntriesUnit: 'gráfico y movimiento', pulseScenarios: 'Escenarios', pulseScenariosUnit: 'registrados',
    pulsePatterns: 'Patrones', pulsePatternsUnit: 'etiquetados', pulsePositions: 'Posiciones', pulsePositionsUnit: 'abiertas',
    fateButton: 'Destino de la sesión', focusHigh: 'Enfoque alto', focusMedium: 'Enfoque medio', focusLow: 'Enfoque bajo',
    cockpitTitle: 'Registro de gráfico y línea temporal', filterAll: 'Todo', filterChart: 'Gráfico', filterMove: 'Movimiento', filterScen: 'Con escenario',
    searchPlaceholder: 'Buscar en las entradas', addMove: 'Registrar movimiento', addChart: 'Añadir gráfico',
    prevEntry: 'Entrada anterior', nextEntry: 'Entrada siguiente', newEntryTile: 'Nueva entrada',
    scenCountSuffix: 'escenarios', noScenarios: 'Sin escenarios', aiBadge: 'AI', startShort: 'Inicio', endShort: 'Fin',
    counterOf: 'de', counterEntryWord: 'Entrada', counterNone: '0 entradas', keyboardHint: 'Navega con las teclas ← →',
    kindChart: 'Gráfico', kindMove: 'Movimiento', kindFate: 'Destino',
    aiAnalyzeButton: 'Análisis IA', deleteEntryTitle: 'Eliminar entrada', fullscreenTitle: 'Ver en pantalla completa',
    noImageText: 'No hay imagen adjunta a esta entrada', uploadImage: 'Subir imagen',
    noteLabel: 'Nota de esta entrada', notePlaceholder: '¿Qué viste en este momento?',
    aiStripTitle: 'Análisis de IA de esta entrada', aiReady: 'Análisis listo', aiNotReady: 'Aún sin analizar',
    viewAction: 'Ver', closeAction: 'Cerrar', aiDemoSummary: 'Análisis local: la estructura del gráfico se comparó con los escenarios activos de esta sesión.',
    scenariosOfEntry: 'Escenarios de esta entrada', scenarioTitleLabel: 'Título del escenario', scenarioDescLabel: 'Descripción y evidencias',
    scenarioDescPlaceholder: '¿Por qué es válido este escenario?', noPatternTag: 'Sin etiqueta de patrón', noPatternChip: 'Sin patrón',
    patternChipPrefix: 'Patrón', lockedNoticeTemplate: 'Protocolo de posición bloqueado · se requiere {threshold}% del patrón',
    probabilityLabel: 'Probabilidad', planTitle: 'Plan de ejecución', sideLong: 'Compra (Long)', sideShort: 'Venta (Short)',
    entryPriceLabel: 'Precio de entrada', stopLabel: 'Stop loss', targetLabel: 'Take profit',
    invalidationLabel: 'Invalidación del escenario', invalidationPlaceholder: 'Separa las razones con comas', occurredYes: 'Este escenario ocurrió',
    addScenario: 'Añadir escenario', newScenarioTitle: 'Nuevo escenario', deleteScenarioTitle: 'Eliminar escenario',
    filteredEmptyText: 'Ninguna entrada coincide con este filtro', clearFilter: 'Limpiar filtro',
    dashboardTitle: 'Panel de la sesión', dashPatterns: 'Patrones', dashScenarios: 'Escenarios', dashPositions: 'Posiciones',
    dashEmptyPatterns: 'Aún no hay un patrón etiquetado en un escenario.', dashEmptyScenarios: 'Aún no hay ningún escenario registrado.',
    dashEmptyPositions: 'Aún no hay ninguna posición abierta desde un escenario.', dashEntryPrefix: 'Entrada',
    occurredYesShort: 'Ocurrió', pendingShort: 'Pendiente',
    tradeStatusHunting: 'Buscando', tradeStatusOpen: 'Abierta', tradeStatusClosed: 'Cerrada', tradeStatusCancelled: 'Cancelada',
    prevSummaryTitle: 'Resumen de la sesión anterior', prevSummaryEmpty: 'Aún no hay un resumen de la sesión anterior. Al cerrar una sesión, su resultado y lecciones pasan a la siguiente.',
    similarTitle: 'Sesiones similares', similarThreshold: 'Umbral de alerta', similarEmpty: 'Aún no se encontró una sesión similar fiable.', similarSummary: 'Resumen',
    reportTitle: 'Informe de sesión', intervalChip: 'Bucle {n}m'
  }
};

function tr(lang, key, vars) {
  let value = (copy[lang] && copy[lang][key]) || copy.en[key] || key;
  if (vars) Object.keys(vars).forEach((name) => { value = value.replace('{' + name + '}', vars[name]); });
  return value;
}
function localeCode(lang) { return { fa: 'fa-IR', ar: 'ar-EG', en: 'en-GB', es: 'es-ES' }[lang] || 'en-GB'; }

function kindInfo(lang) {
  return {
    chart: { label: tr(lang, 'kindChart'), icon: 'CandlestickChart' },
    movement: { label: tr(lang, 'kindMove'), icon: 'Activity' },
    fate: { label: tr(lang, 'kindFate'), icon: 'Flag' }
  };
}

function elapsedSince(session) {
  const started = Number(session.startedAt);
  return Date.now() - (Number.isFinite(started) ? started : Date.now());
}
function intervalMs(session) {
  const n = Number(session.updateIntervalMinutes);
  return (Number.isFinite(n) && n > 0 ? n : 30) * 60000;
}
function clockStr(ms) {
  const v = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return p(Math.floor(v / 3600)) + ':' + p(Math.floor((v % 3600) / 60)) + ':' + p(v % 60);
}
function entryTimeLabel(entry, lang) {
  const t = new Date(entry.createdAt);
  if (Number.isNaN(t.getTime())) return '--:--';
  try { return new Intl.DateTimeFormat(localeCode(lang), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t); }
  catch (_) { return '--:--'; }
}
function sortedEntries(session) {
  return (session.entries || []).slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}
function visibleEntries(entries, filter, q, lang) {
  const query = (q || '').trim().toLowerCase();
  return entries.filter((e) => {
    if (filter === 'chart' && e.type !== 'chart') return false;
    if (filter === 'move' && e.type !== 'movement') return false;
    if (filter === 'scen' && !((e.scenarios || []).length)) return false;
    if (query) {
      const noteText = e.type === 'movement' ? (e.movementNote || '') : (e.note || '');
      const hay = (noteText + ' ' + entryTimeLabel(e, lang) + ' ' + (e.scenarios || []).map((s) => s.title || '').join(' ')).toLowerCase();
      if (hay.indexOf(query) === -1) return false;
    }
    return true;
  });
}
function minutesFromStart(session, atMs) {
  const started = Number(session.startedAt);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, (atMs - started) / 60000);
}
function probabilityOf(scenario) {
  const h = scenario.probabilityHistory || [];
  return Number(h.length ? h[h.length - 1].value : 50);
}
function patternInfo(scenario) {
  const pattern = scenario.pattern;
  if (!pattern) return { pattern: null, done: 0, total: 0, pct: 0, threshold: 70, locked: false };
  const stages = pattern.stages || [];
  const doneIds = pattern.completedStageIds || [];
  const total = stages.length;
  const done = doneIds.filter((id) => stages.some((st) => st.id === id)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const threshold = Number(pattern.completionThreshold || 70);
  return { pattern, done, total, pct, threshold, locked: pct < threshold };
}
function flatScenarios(session) {
  const out = [];
  (session.entries || []).forEach((e) => (e.scenarios || []).forEach((s) => out.push({ entry: e, scenario: s })));
  return out;
}
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function makeAiResult(session, entry, lang) {
  const patterns = [];
  flatScenarios(session).forEach(({ scenario }) => {
    if (scenario.pattern && scenario.pattern.name && !patterns.some((p) => p.patternName === scenario.pattern.name)) {
      patterns.push({ patternName: scenario.pattern.name, confidence: Math.max(40, patternInfo(scenario).pct) });
    }
  });
  return {
    provider: 'local-demo',
    chartSummary: tr(lang, 'aiDemoSummary'),
    patterns,
    scenarioAssessments: (entry.scenarios || []).slice(0, 3).map((s) => ({ scenarioTitle: s.title, stillValid: probabilityOf(s) > 0 }))
  };
}
function statusLabel(status, lang) {
  const key = { hunting: 'tradeStatusHunting', open: 'tradeStatusOpen', closed: 'tradeStatusClosed', cancelled: 'tradeStatusCancelled' }[status];
  return key ? tr(lang, key) : status;
}

const inputStyle = { boxSizing: 'border-box', height: 36, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.6)', color: 'var(--text-primary)', font: 'var(--type-body)', fontSize: 12, outline: 'none', width: '100%' };
const textareaStyle = { boxSizing: 'border-box', width: '100%', minHeight: 58, resize: 'vertical', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.6)', color: 'var(--text-primary)', font: 'var(--type-body)', fontSize: 12, lineHeight: 1.7, outline: 'none' };
const fieldLabelStyle = { fontSize: 10, color: 'var(--text-dim)' };

function TextField({ label, value, onCommit, placeholder, dir }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={fieldLabelStyle}>{label}</span>
      <input type="text" defaultValue={value || ''} placeholder={placeholder} dir={dir || 'auto'} style={inputStyle}
        onBlur={(e) => { if (e.target.value !== (value || '')) onCommit(e.target.value); }} />
    </label>
  );
}
function TextAreaField({ label, value, onCommit, placeholder }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={fieldLabelStyle}>{label}</span>
      <textarea defaultValue={value || ''} placeholder={placeholder} dir="auto" style={textareaStyle}
        onBlur={(e) => { if (e.target.value !== (value || '')) onCommit(e.target.value); }} />
    </label>
  );
}

function Ring({ pct, color, value, label }) {
  return (
    <div style={{ position: 'relative', width: 96, height: 96, borderRadius: '50%', background: 'conic-gradient(from -90deg, ' + color + ' ' + pct + '%, rgba(244,234,215,.07) 0)', display: 'grid', placeItems: 'center', flex: 'none' }}>
      <span style={{ position: 'absolute', inset: 7, borderRadius: '50%', background: 'var(--ink-950)', border: '1px solid var(--border-hairline)' }}></span>
      <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <span className="navrya-tabular" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '.02em' }}>{value}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
      </span>
    </div>
  );
}

function CommandBar({ session, lang, view, onBack, onSetView }) {
  const isOpen = session.status !== 'closed';
  return (
    <div style={{ position: 'sticky', top: 8, zIndex: 40, display: 'flex', alignItems: 'center', gap: 14, padding: '9px 14px', border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.88)', backdropFilter: 'blur(6px)', boxShadow: 'var(--shadow-panel)' }}>
      <button type="button" onClick={onBack} title={tr(lang, 'back')} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', font: 'var(--type-body)', fontSize: 12 }}>
        <Icon name="ArrowRight" size={16} />{tr(lang, 'back')}
      </button>
      <span style={{ width: 1, height: 26, background: 'var(--border-hairline)', flex: 'none' }}></span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOpen ? 'var(--success)' : 'var(--text-dim)', boxShadow: isOpen ? '0 0 10px rgba(46,204,113,.5)' : 'none', flex: 'none' }}></span>
        <span style={{ font: 'var(--type-display-md)', fontFamily: 'var(--font-display)', fontSize: 19, letterSpacing: '.1em', color: 'var(--text-primary)' }}>{sessionsAdapter.displayCity(session.market).toUpperCase()}</span>
        <span className="navrya-tabular" style={{ fontSize: 11, letterSpacing: '.04em', color: 'var(--text-dim)' }}>
          {[sessionsAdapter.displayCity(session.market), session.timeframe, session.jalali].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
        <Chip tone={isOpen ? 'success' : 'neutral'} dot>{isOpen ? tr(lang, 'sessionOpen') : tr(lang, 'sessionClosed')}</Chip>
        <Chip tone="neutral">{session.timeframe || '—'}</Chip>
        <Chip tone="neutral">{tr(lang, 'intervalChip', { n: session.updateIntervalMinutes })}</Chip>
      </span>
      <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        <span style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.6)' }}>
          {[['timeline', tr(lang, 'viewTimeline')], ['report', tr(lang, 'viewReport')]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => onSetView(id)} style={{
              height: 30, padding: '0 14px', borderRadius: 6, cursor: 'pointer', font: 'var(--type-body)', fontSize: 12,
              border: '1px solid ' + (view === id ? 'var(--char-accent)' : 'transparent'),
              background: view === id ? 'var(--char-active-surface)' : 'transparent',
              color: view === id ? 'var(--char-accent)' : 'var(--text-muted)'
            }}>{label}</button>
          ))}
        </span>
        <button type="button" title={tr(lang, 'settingsTitle')} style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)' }}>
          <Icon name="settings" size={18} />
        </button>
      </span>
    </div>
  );
}

function PulseBand({ session, lang, positionsOpen, onFate }) {
  const elapsed = elapsedSince(session);
  const interval = intervalMs(session);
  const remaining = session.status === 'closed' ? 0 : interval - (elapsed % interval);
  const sessionArc = Math.min(100, (elapsed / (SPAN_MIN * 60000)) * 100);
  const loopArc = (remaining / interval) * 100;
  const required = Math.max(1, Math.ceil(elapsed / interval));
  const actual = (session.activityLog || []).filter((x) => x.countsTowardLoopUpdate !== false).length;
  const ratio = actual / required;
  const focusLabel = ratio >= 0.8 ? tr(lang, 'focusHigh') : ratio >= 0.5 ? tr(lang, 'focusMedium') : tr(lang, 'focusLow');
  const flat = flatScenarios(session);
  const pulse = [
    { icon: 'Film', label: tr(lang, 'pulseEntries'), value: String((session.entries || []).length), unit: tr(lang, 'pulseEntriesUnit') },
    { icon: 'scenarios', label: tr(lang, 'pulseScenarios'), value: String(flat.length), unit: tr(lang, 'pulseScenariosUnit') },
    { icon: 'Layers', label: tr(lang, 'pulsePatterns'), value: String(flat.filter((x) => x.scenario.pattern).length), unit: tr(lang, 'pulsePatternsUnit') },
    { icon: 'execution', label: tr(lang, 'pulsePositions'), value: String(positionsOpen), unit: tr(lang, 'pulsePositionsUnit') }
  ];
  return (
    <Panel variant="prestige" texture textureOpacity={0.05} ornament ornamentSize={16} padding="16px 20px">
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 'none' }}>
          <Ring pct={sessionArc} color="var(--char-accent)" value={clockStr(elapsed)} label={tr(lang, 'ringSessionLabel')} />
          <Ring pct={loopArc} color="var(--info)" value={clockStr(remaining)} label={tr(lang, 'ringLoopLabel') + ' · ' + actual + '/' + required} />
        </div>
        <span style={{ width: 1, height: 76, background: 'var(--border-gold)', opacity: 0.5, flex: 'none' }}></span>
        <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0 }}>
          {pulse.map((p) => (
            <div key={p.label} style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', height: 76, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-dim)' }}>
                <Icon name={p.icon} size={14} /><span style={{ fontSize: 10, letterSpacing: '.04em' }}>{p.label}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className="navrya-tabular" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>{p.value}</span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{p.unit}</span>
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
          <Button variant="primary" icon="Flag" onClick={onFate} style={{ height: 38 }}>{tr(lang, 'fateButton')}</Button>
          <Chip tone="accent">{focusLabel} · {actual}/{required}</Chip>
        </div>
      </div>
    </Panel>
  );
}

function EntryCard({ entry, index, selected, kindMeta, lang, imageUrl, onClick }) {
  return (
    <button type="button" data-eid={entry.id} onClick={onClick} style={{
      position: 'relative', flex: 'none', width: 152, boxSizing: 'border-box', padding: 8, borderRadius: 10, cursor: 'pointer',
      textAlign: 'left', font: 'var(--type-body)', display: 'flex', flexDirection: 'column', gap: 7,
      border: selected ? '2px solid var(--char-accent)' : '1px solid var(--border-hairline)',
      background: selected ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)',
      boxShadow: selected ? 'var(--glow-active)' : 'none'
    }}>
      {selected && <span style={{ position: 'absolute', top: 0, left: 12, right: 12, height: 2, borderRadius: '0 0 3px 3px', background: 'var(--char-accent)' }}></span>}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="navrya-tabular" style={{ display: 'grid', placeItems: 'center', minWidth: 20, height: 20, padding: '0 5px', borderRadius: 5, background: selected ? 'var(--char-accent)' : 'rgba(244,234,215,.08)', color: selected ? 'var(--ink-950)' : 'var(--text-muted)', fontSize: 11, fontWeight: 700 }}>{index}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: selected ? 'var(--char-accent)' : 'var(--text-dim)' }}>
          <Icon name={kindMeta.icon} size={14} /><span style={{ fontSize: 10 }}>{kindMeta.label}</span>
        </span>
        <span className="navrya-tabular" style={{ marginLeft: 'auto', fontSize: 10, color: selected ? 'var(--text-muted)' : 'var(--text-dim)' }}>{entryTimeLabel(entry, lang)}</span>
      </span>
      <span style={{ display: 'block', height: 56, borderRadius: 6, overflow: 'hidden', background: '#000', border: '1px solid var(--border-hairline)', position: 'relative' }}>
        {entry.hasImage && imageUrl ? (
          <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: selected ? 0.9 : 0.55 }} />
        ) : (
          <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: selected ? 'var(--text-dim)' : 'rgba(244,234,215,.14)' }}><Icon name="image" size={18} /></span>
        )}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: selected ? 'var(--char-accent)' : 'var(--text-dim)' }}>
          {(entry.scenarios || []).length ? entry.scenarios.length + ' ' + tr(lang, 'scenCountSuffix') : tr(lang, 'noScenarios')}
        </span>
        {entry.aiAnalysisResult && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, letterSpacing: '.06em', color: selected ? 'var(--info)' : 'rgba(77,163,255,.7)' }}>
            <Icon name="sparkle" size={12} />{tr(lang, 'aiBadge')}
          </span>
        )}
      </span>
    </button>
  );
}

function ScenarioEditor({ session, entry, scenario, lang, open, onToggle, onUpdate, onDelete, onToggleStage, onSetSide }) {
  const readOnly = session.status === 'closed';
  const prob = probabilityOf(scenario);
  const info = patternInfo(scenario);
  const plan = scenario.executionPlan || {};
  return (
    <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 10, background: 'rgba(11,20,21,.55)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <button type="button" onClick={onToggle} style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', flex: 'none' }}>
          <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={14} />
        </button>
        <span dir="auto" style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scenario.title || tr(lang, 'newScenarioTitle')}</span>
        <Chip tone="success">{prob}%</Chip>
        <Chip tone="neutral">{info.pattern ? tr(lang, 'patternChipPrefix') + ' ' + info.pct + '%' : tr(lang, 'noPatternChip')}</Chip>
        {!readOnly && (
          <button type="button" onClick={onDelete} title={tr(lang, 'deleteScenarioTitle')} style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: 'var(--danger)', flex: 'none' }}>
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>
      {open && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-hairline)', paddingTop: 12 }}>
          <TextField label={tr(lang, 'scenarioTitleLabel')} value={scenario.title} onCommit={(v) => onUpdate({ title: v })} />
          <TextAreaField label={tr(lang, 'scenarioDescLabel')} value={scenario.description} placeholder={tr(lang, 'scenarioDescPlaceholder')} onCommit={(v) => onUpdate({ description: v })} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 10, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Icon name="Layers" size={14} /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{info.pattern ? info.pattern.name : tr(lang, 'noPatternTag')}</span>
              <span style={{ marginInlineStart: 'auto', fontSize: 10, color: 'var(--char-accent)' }}>{info.pct}%</span>
            </span>
            <span style={{ display: 'block', height: 6, borderRadius: 3, background: 'rgba(244,234,215,.08)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', borderRadius: 3, background: 'var(--char-accent)', transition: 'width var(--dur-progress) var(--ease-out)', width: info.pct + '%' }}></span>
            </span>
            {info.pattern && (
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingTop: 2 }}>
                {info.pattern.stages.map((stage) => {
                  const done = (info.pattern.completedStageIds || []).indexOf(stage.id) > -1;
                  return (
                    <button key={stage.id} type="button" disabled={readOnly} onClick={() => onToggleStage(stage)} style={{
                      display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 8px', borderRadius: 6, cursor: readOnly ? 'not-allowed' : 'pointer',
                      font: 'var(--type-caption)', fontSize: 10,
                      border: '1px solid ' + (done ? 'color-mix(in srgb, var(--success) 55%, transparent)' : 'var(--border-hairline)'),
                      background: done ? 'rgba(46,204,113,.1)' : 'transparent', color: done ? 'var(--success)' : 'var(--text-dim)'
                    }}>
                      {done ? <Icon name="check" size={12} /> : <span style={{ width: 9, height: 9, borderRadius: '50%', border: '1px solid currentColor', display: 'block' }}></span>}
                      {stage.index} · {stage.label}
                    </button>
                  );
                })}
              </span>
            )}
            {info.locked && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--warning)' }}>
                <Icon name="Lock" size={12} />{tr(lang, 'lockedNoticeTemplate', { threshold: info.threshold })}
              </span>
            )}
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={fieldLabelStyle}>{tr(lang, 'probabilityLabel')}</span>
              <span className="navrya-tabular" style={{ marginInlineStart: 'auto', fontSize: 12, color: 'var(--success)' }}>{prob}%</span>
            </span>
            <input type="range" min="0" max="100" step="5" value={prob} disabled={readOnly} onChange={(e) => onUpdate({ probabilityHistory: (scenario.probabilityHistory || []).concat([{ value: Number(e.target.value), loggedAt: new Date().toISOString() }]) }, 'probability_changed')} style={{ width: '100%', accentColor: 'var(--success)', cursor: readOnly ? 'not-allowed' : 'pointer' }} />
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 10, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
            <span style={fieldLabelStyle}>{tr(lang, 'planTitle')}</span>
            <span style={{ display: 'flex', gap: 6 }}>
              {[['Long', tr(lang, 'sideLong')], ['Short', tr(lang, 'sideShort')]].map(([id, label]) => (
                <button key={id} type="button" disabled={readOnly} onClick={() => onSetSide(id)} style={{
                  flex: 1, height: 32, borderRadius: 6, cursor: readOnly ? 'not-allowed' : 'pointer', font: 'var(--type-body)', fontSize: 11,
                  border: '1px solid ' + (plan.positionType === id ? 'var(--char-accent)' : 'var(--border-hairline)'),
                  background: plan.positionType === id ? 'var(--char-active-surface)' : 'transparent',
                  color: plan.positionType === id ? 'var(--char-accent)' : 'var(--text-muted)'
                }}>{label}</button>
              ))}
            </span>
            <span style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{tr(lang, 'entryPriceLabel')}</span>
                <input type="text" className="navrya-tabular" defaultValue={(plan.entryPrices || []).join(', ')} style={{ ...inputStyle, height: 32, fontSize: 11 }}
                  onBlur={(e) => onUpdate({ executionPlan: { ...plan, entryPrices: e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n)) } })} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 9, color: 'var(--danger)' }}>{tr(lang, 'stopLabel')}</span>
                <input type="text" className="navrya-tabular" defaultValue={plan.stopLoss ?? ''} style={{ ...inputStyle, height: 32, fontSize: 11 }}
                  onBlur={(e) => onUpdate({ executionPlan: { ...plan, stopLoss: e.target.value ? Number(e.target.value) : null } })} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 9, color: 'var(--success)' }}>{tr(lang, 'targetLabel')}</span>
                <input type="text" className="navrya-tabular" defaultValue={plan.takeProfit ?? ''} style={{ ...inputStyle, height: 32, fontSize: 11 }}
                  onBlur={(e) => onUpdate({ executionPlan: { ...plan, takeProfit: e.target.value ? Number(e.target.value) : null } })} />
              </label>
            </span>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--warning)' }}><Icon name="TriangleAlert" size={12} />{tr(lang, 'invalidationLabel')}</span>
            <input type="text" defaultValue={(scenario.invalidationTagIds || []).join(', ')} placeholder={tr(lang, 'invalidationPlaceholder')} style={inputStyle}
              onBlur={(e) => onUpdate({ invalidationTagIds: e.target.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean) })} />
          </label>

          <button type="button" onClick={() => onUpdate({ occurred: !scenario.occurred })} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', font: 'var(--type-body)', fontSize: 12,
            border: '1px solid ' + (scenario.occurred ? 'color-mix(in srgb, var(--success) 55%, transparent)' : 'var(--border-hairline)'),
            background: scenario.occurred ? 'rgba(46,204,113,.1)' : 'transparent', color: scenario.occurred ? 'var(--success)' : 'var(--text-muted)'
          }}>
            {scenario.occurred ? <Icon name="CircleCheck" size={16} /> : <span style={{ width: 14, height: 14, borderRadius: '50%', border: '1px solid currentColor', display: 'block' }}></span>}
            {tr(lang, 'occurredYes')}
          </button>
        </div>
      )}
    </div>
  );
}

function AiStrip({ session, entry, lang, onAnalyze }) {
  const [expanded, setExpanded] = React.useState(false);
  const result = entry.aiAnalysisResult;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--char-accent) 40%, transparent)', background: 'var(--char-active-surface)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--char-accent)' }}><Icon name="sparkle" size={16} /><span style={{ fontSize: 12 }}>{tr(lang, 'aiStripTitle')}</span></span>
        <span style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{result ? tr(lang, 'aiReady') : tr(lang, 'aiNotReady')}</span>
        <button type="button" onClick={() => (result ? setExpanded((v) => !v) : onAnalyze())} style={{ height: 30, padding: '0 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--char-accent)', background: 'transparent', color: 'var(--char-accent)', font: 'var(--type-body)', fontSize: 11 }}>
          {result ? (expanded ? tr(lang, 'closeAction') : tr(lang, 'viewAction')) : tr(lang, 'aiAnalyzeButton')}
        </button>
      </div>
      {expanded && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', color: 'var(--text-primary)', font: 'var(--type-caption)', fontSize: 11, lineHeight: 1.8 }}>
          <p dir="auto" style={{ margin: 0 }}>{result.chartSummary}</p>
          {!!result.patterns.length && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {result.patterns.map((p, i) => <Chip key={i} tone="accent">{p.patternName} · {p.confidence}%</Chip>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EntryDetailPanel({ session, entry, index, lang, imageUrl, openScenarios, onNote, onDeleteEntry, onAttachImage, onAnalyze, onScenarioToggle, onScenarioUpdate, onScenarioDelete, onScenarioStage, onScenarioSide, onAddScenario }) {
  const kindMeta = kindInfo(lang)[entry.type] || kindInfo(lang).chart;
  const fileRef = React.useRef(null);
  const note = entry.type === 'movement' ? entry.movementNote : entry.note;
  return (
    <Panel variant="base" ornament padding={0}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
        <span className="navrya-tabular" style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 6, background: 'var(--char-active-surface)', border: '1px solid var(--char-accent)', color: 'var(--char-accent)', fontSize: 12, fontWeight: 700, flex: 'none' }}>{index}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-primary)', flex: 'none' }}><Icon name={kindMeta.icon} size={16} /><span style={{ fontSize: 13, fontWeight: 600 }}>{kindMeta.label}</span></span>
        <Chip tone="neutral">{entryTimeLabel(entry, lang)}</Chip>
        <Chip tone="neutral">{[sessionsAdapter.displayCity(entry.market || entry.tradingSession || session.market), entry.timeframe || session.timeframe].filter(Boolean).join(' · ')}</Chip>
        <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <Button variant="secondary" size="sm" icon="sparkle" onClick={() => onAnalyze(entry)}>{tr(lang, 'aiAnalyzeButton')}</Button>
          <button type="button" onClick={() => onDeleteEntry(entry)} title={tr(lang, 'deleteEntryTitle')} style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(255,56,48,.35)', background: 'rgba(255,56,48,.08)', color: 'var(--danger)' }}>
            <Icon name="trash" size={16} />
          </button>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        <div style={{ flex: 1, minWidth: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entry.hasImage && imageUrl ? (
            <span style={{ position: 'relative', display: 'block', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-gold)', background: '#000' }}>
              <img src={imageUrl} alt="" style={{ display: 'block', width: '100%', height: 300, objectFit: 'cover' }} />
              <span style={{ position: 'absolute', inset: 'auto 0 0 0', height: 64, background: 'linear-gradient(to top, rgba(3,8,7,.85), transparent)' }}></span>
              <span style={{ position: 'absolute', bottom: 10, insetInlineStart: 12, display: 'flex', gap: 6 }}>
                <Chip tone="accent">{entryTimeLabel(entry, lang)}</Chip>
                <Chip tone="neutral">{sessionsAdapter.displayCity(entry.market || entry.tradingSession || session.market)}</Chip>
              </span>
              <button type="button" title={tr(lang, 'fullscreenTitle')} onClick={() => window.open(imageUrl, '_blank', 'noopener')} style={{ position: 'absolute', top: 10, insetInlineEnd: 10, display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.7)', color: 'var(--text-muted)' }}>
                <Icon name="Maximize2" size={16} />
              </button>
            </span>
          ) : (
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, height: 300, borderRadius: 10, border: '1px dashed var(--border-gold)', background: 'rgba(3,8,7,.5)' }}>
              <span style={{ color: 'rgba(244,234,215,.2)' }}><Icon name="image" size={30} /></span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'noImageText')}</span>
              <Button variant="secondary" size="sm" icon="upload" onClick={() => fileRef.current && fileRef.current.click()}>{tr(lang, 'uploadImage')}</Button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onAttachImage(entry, f); e.target.value = ''; }} />
            </span>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-muted)' }}><Icon name="edit" size={14} />{tr(lang, 'noteLabel')}</span>
            <textarea defaultValue={note || ''} placeholder={tr(lang, 'notePlaceholder')} dir="auto" style={{ ...textareaStyle, minHeight: 74, padding: '10px 12px' }}
              onBlur={(e) => { if (e.target.value !== (note || '')) onNote(entry, e.target.value); }} />
          </label>
          <AiStrip session={session} entry={entry} lang={lang} onAnalyze={() => onAnalyze(entry)} />
        </div>
        <div style={{ width: 400, flex: 'none', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(3,8,7,.35)', borderInlineStart: '1px solid var(--border-hairline)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="scenarios" size={16} /><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'scenariosOfEntry')}</span>
            <span style={{ marginInlineStart: 'auto' }}><Chip tone="neutral">{(entry.scenarios || []).length}</Chip></span>
          </div>
          {(entry.scenarios || []).map((scenario) => (
            <ScenarioEditor
              key={scenario.id} session={session} entry={entry} scenario={scenario} lang={lang}
              open={openScenarios.has(scenario.id)}
              onToggle={() => onScenarioToggle(scenario.id)}
              onUpdate={(patch, logType) => onScenarioUpdate(entry, scenario, patch, logType)}
              onDelete={() => onScenarioDelete(entry, scenario)}
              onToggleStage={(stage) => onScenarioStage(entry, scenario, stage)}
              onSetSide={(side) => onScenarioSide(entry, scenario, side)}
            />
          ))}
          {session.status !== 'closed' && (
            <button type="button" onClick={() => onAddScenario(entry)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, borderRadius: 8, cursor: 'pointer', border: '1px dashed var(--border-gold)', background: 'transparent', color: 'var(--text-muted)', font: 'var(--type-body)', fontSize: 12 }}>
              <Icon name="plus" size={16} />{tr(lang, 'addScenario')}
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}

function DashboardPanel({ session, lang, dash, onSetDash, indexById, onSelectEntry }) {
  const flat = flatScenarios(session);
  let rows = [];
  if (dash === 'patterns') {
    rows = flat.filter((x) => x.scenario.pattern).map((x) => {
      const info = patternInfo(x.scenario);
      return { key: x.scenario.id, title: x.scenario.pattern.name || tr(lang, 'noPatternTag'), value: info.pct, meta: x.scenario.title || tr(lang, 'newScenarioTitle'), entryN: indexById[x.entry.id], onClick: () => onSelectEntry(x.entry.id) };
    });
  } else if (dash === 'scenarios') {
    rows = flat.map((x) => ({ key: x.scenario.id, title: x.scenario.title || tr(lang, 'newScenarioTitle'), value: probabilityOf(x.scenario), meta: x.scenario.occurred ? tr(lang, 'occurredYesShort') : tr(lang, 'pendingShort'), entryN: indexById[x.entry.id], onClick: () => onSelectEntry(x.entry.id) }));
  } else {
    const tradeStore = window.TradeJournalTradeStore;
    rows = flat.filter((x) => tradeStore && tradeStore.findBySource(session.id, x.scenario.id)).map((x) => {
      const trade = tradeStore.findBySource(session.id, x.scenario.id);
      return { key: x.scenario.id, title: x.scenario.title || tr(lang, 'newScenarioTitle'), value: probabilityOf(x.scenario), meta: statusLabel(trade.status, lang), entryN: indexById[x.entry.id], onClick: () => onSelectEntry(x.entry.id) };
    });
  }
  const emptyText = { patterns: tr(lang, 'dashEmptyPatterns'), scenarios: tr(lang, 'dashEmptyScenarios'), positions: tr(lang, 'dashEmptyPositions') }[dash];
  return (
    <Panel variant="base" padding="14px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="dashboard" size={16} /><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'dashboardTitle')}</span></div>
        <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)' }}>
          {[['patterns', tr(lang, 'dashPatterns')], ['scenarios', tr(lang, 'dashScenarios')], ['positions', tr(lang, 'dashPositions')]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => onSetDash(id)} style={{ flex: 1, height: 30, borderRadius: 6, cursor: 'pointer', font: 'var(--type-body)', fontSize: 11, border: '1px solid ' + (dash === id ? 'var(--char-accent)' : 'transparent'), background: dash === id ? 'var(--char-active-surface)' : 'transparent', color: dash === id ? 'var(--char-accent)' : 'var(--text-dim)' }}>{label}</button>
          ))}
        </div>
        {rows.length === 0 ? (
          <span style={{ padding: '14px 10px', textAlign: 'center', fontSize: 11, color: 'var(--text-dim)' }}>{emptyText}</span>
        ) : rows.map((r) => (
          <button key={r.key} type="button" onClick={r.onClick} style={{ textAlign: 'start', display: 'flex', flexDirection: 'column', gap: 7, padding: 10, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)', font: 'inherit' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <span dir="auto" style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
              <span className="navrya-tabular" style={{ fontSize: 11, color: 'var(--char-accent)' }}>{r.value}%</span>
            </span>
            <span style={{ display: 'block', width: '100%', height: 5, borderRadius: 3, background: 'rgba(244,234,215,.08)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', borderRadius: 3, background: 'var(--char-accent)', width: r.value + '%' }}></span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <span dir="auto" style={{ fontSize: 10, color: 'var(--text-dim)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.meta}</span>
              <span className="navrya-tabular" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{tr(lang, 'dashEntryPrefix')} {r.entryN}</span>
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function PrevSummaryPanel({ session, lang }) {
  const others = (window.TradeJournalWorkspace ? window.TradeJournalWorkspace.list() : []).filter((s) => s.id !== session.id);
  const prev = others.length ? others[0] : null;
  const summary = prev && (prev.fateSummary || prev.previousSessionSummary);
  return (
    <Panel variant="base" padding="14px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="Flag" size={16} /><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'prevSummaryTitle')}</span></div>
        <p dir="auto" style={{ margin: 0, fontSize: 11, lineHeight: 1.8, color: 'var(--text-dim)' }}>{(summary && summary.note) || tr(lang, 'prevSummaryEmpty')}</p>
      </div>
    </Panel>
  );
}

function SimilarSessionsPanel({ session, character, lang }) {
  const [threshold, setThreshold] = React.useState(() => {
    const raw = localStorage.getItem('tradejournal:session-similarity-threshold:v1');
    const n = Number(raw);
    return Number.isFinite(n) && raw !== null && raw !== '' ? n : 70;
  });
  const [matches, setMatches] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    const store = window.TradeJournalSessionSignatureStore;
    const engine = window.TradeJournalSessionSignatureEngine;
    if (!store || !engine) { setMatches([]); return undefined; }
    const live = store.buildPartialFromSession(session, character);
    engine.compareWithProvider(live, store.listSync()).then((result) => { if (!cancelled) setMatches((result || []).slice(0, 3)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.entries.length]);
  return (
    <Panel variant="base" padding="14px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="Copy" size={16} /><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'similarTitle')}</span></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1 }}>{tr(lang, 'similarThreshold')}</span>
          <input type="number" className="navrya-tabular" value={threshold} onChange={(e) => {
            const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
            setThreshold(v);
            localStorage.setItem('tradejournal:session-similarity-threshold:v1', String(v));
          }} style={{ boxSizing: 'border-box', width: 64, height: 32, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.6)', color: 'var(--text-primary)', font: 'var(--type-body)', fontSize: 12, textAlign: 'center', outline: 'none' }} />
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>%</span>
        </label>
        {!matches || !matches.length ? (
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.8, color: 'var(--text-dim)' }}>{tr(lang, 'similarEmpty')}</p>
        ) : matches.map((m) => (
          <div key={m.sessionId} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1, minWidth: 0 }}>{[m.market, m.date].filter(Boolean).join(' · ')}</strong>
              <span className="navrya-tabular" style={{ fontSize: 11, color: m.similarity >= threshold ? 'var(--success)' : 'var(--text-muted)' }}>{m.similarity}%</span>
            </span>
            {m.fateSummaryText && <span dir="auto" style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6 }}>{m.fateSummaryText}</span>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ReportView({ session, lang, indexById }) {
  const entries = sortedEntries(session);
  const kinds = kindInfo(lang);
  return (
    <Panel variant="base" ornament padding="20px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="report" size={18} /><span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'reportTitle')}</span>
          <span style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>{[sessionsAdapter.displayCity(session.market), session.timeframe, session.jalali].filter(Boolean).join(' · ')}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((e) => {
            const kindMeta = kinds[e.type] || kinds.chart;
            const note = e.type === 'movement' ? e.movementNote : e.note;
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.5)' }}>
                <span className="navrya-tabular" style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 6, background: 'rgba(244,234,215,.06)', color: 'var(--text-muted)', fontSize: 11, flex: 'none' }}>{indexById[e.id]}</span>
                <span className="navrya-tabular" style={{ fontSize: 12, color: 'var(--text-primary)', width: 52, flex: 'none' }}>{entryTimeLabel(e, lang)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', width: 78, flex: 'none' }}><Icon name={kindMeta.icon} size={14} /><span style={{ fontSize: 11 }}>{kindMeta.label}</span></span>
                <span dir="auto" style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note || '—'}</span>
                <span style={{ fontSize: 11, color: 'var(--char-accent)', flex: 'none' }}>{(e.scenarios || []).length ? e.scenarios.length + ' ' + tr(lang, 'scenCountSuffix') : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

export function LiveSessionView({ character, sessionId, navActiveId, language, initialView, onBack }) {
  const lang = language || 'fa';
  const [, setTick] = React.useState(0);
  const rerender = React.useCallback(() => setTick((t) => t + 1), []);
  React.useEffect(() => {
    const iv = setInterval(rerender, 1000);
    window.addEventListener('tradejournal:sessions-changed', rerender);
    return () => { clearInterval(iv); window.removeEventListener('tradejournal:sessions-changed', rerender); };
  }, [rerender]);

  const [view, setView] = React.useState(initialView === 'report' ? 'report' : 'timeline');
  const [sel, setSel] = React.useState(null);
  const [filter, setFilter] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [dash, setDash] = React.useState('patterns');
  const [openScenarios, setOpenScenarios] = React.useState(() => new Set());
  const [imageUrls, setImageUrls] = React.useState({});
  const railRef = React.useRef(null);

  const session = window.TradeJournalWorkspace ? window.TradeJournalWorkspace.find(sessionId) : null;

  const entries = session ? sortedEntries(session) : [];
  const indexById = {};
  entries.forEach((e, i) => { indexById[e.id] = i + 1; });
  const list = session ? visibleEntries(entries, filter, q, lang) : [];
  const selId = sel && list.some((e) => e.id === sel) ? sel : (list[0] ? list[0].id : null);

  React.useEffect(() => {
    if (!session) return;
    const missing = entries.filter((e) => e.hasImage && !imageUrls[e.id]);
    if (!missing.length) return;
    let cancelled = false;
    missing.forEach(async (e) => {
      let url = null;
      if (e.imageBlobId && window.TradeJournalImageStore) {
        try { url = await window.TradeJournalImageStore.loadImageUrl(e.imageBlobId); } catch (_) { /* fall through */ }
      }
      if (!url) url = e.preview || e.imageUrl || null;
      if (url && !cancelled) setImageUrls((prev) => ({ ...prev, [e.id]: url }));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session && entries.map((e) => e.id + ':' + (e.hasImage ? 1 : 0)).join(',')]);

  function scrollRail(id) {
    const rail = railRef.current;
    if (!rail) return;
    const el = rail.querySelector('[data-eid="' + id + '"]');
    if (!el) return;
    rail.scrollLeft = Math.max(0, el.offsetLeft - (rail.clientWidth - el.offsetWidth) / 2);
  }
  function selectEntry(id) {
    setSel(id);
    requestAnimationFrame(() => scrollRail(id));
  }
  function stepEntry(dir) {
    if (!list.length) return;
    const i = list.findIndex((e) => e.id === selId);
    const next = list[Math.min(list.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
    if (next) selectEntry(next.id);
  }

  React.useEffect(() => {
    function onKey(ev) {
      if (navActiveId !== 'sessions' || view !== 'timeline') return;
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (ev.key === 'ArrowRight') { ev.preventDefault(); stepEntry(1); }
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); stepEntry(-1); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navActiveId, view, selId, filter, q, session && session.entries.length]);

  // Runs after every render (no deps array) rather than being called conditionally, since hooks
  // must fire in the same order every time - the session itself is re-read fresh from storage
  // each render (see `session` above) so there is no stable reference to depend on anyway.
  React.useEffect(() => { if (!session) onBack(); });

  if (!session) return null;

  function persist(mutator, logType, detail, scenarioId, counts) {
    mutator(session);
    if (logType) window.TradeJournalWorkspace.log(session, logType, detail || '', scenarioId || null, counts !== false);
    window.TradeJournalWorkspace.save(session);
    rerender();
  }

  function addEntry(kind) {
    const entry = {
      id: window.TradeJournalWorkspace.id('entry'), sessionId: session.id, type: kind, createdAt: new Date().toISOString(),
      hasImage: false, timeframe: session.timeframe || '5m', tradingSession: session.market || 'London', market: session.market || 'London',
      note: kind === 'chart' ? '' : undefined, movementNote: kind === 'movement' ? '' : undefined, relatedScenarioIds: [], scenarios: []
    };
    persist((s) => { s.entries = (s.entries || []).concat([entry]); }, 'entry_added', kind === 'chart' ? tr(lang, 'addChart') : tr(lang, 'addMove'));
    setFilter('all'); setQ('');
    selectEntry(entry.id);
  }
  function deleteEntry(entry) {
    persist((s) => { s.entries = (s.entries || []).filter((e) => e.id !== entry.id); });
  }
  async function attachImage(entry, file) {
    let blobId; let preview;
    if (window.TradeJournalImageStore) {
      blobId = window.TradeJournalWorkspace.id('img');
      try { await window.TradeJournalImageStore.saveImage(blobId, file, 'session'); }
      catch (_) { blobId = undefined; preview = await readAsDataUrl(file); }
    } else { preview = await readAsDataUrl(file); }
    persist((s) => {
      const target = (s.entries || []).find((e) => e.id === entry.id);
      if (!target) return;
      target.hasImage = true;
      if (blobId) target.imageBlobId = blobId; else target.preview = preview;
    }, 'image_attached', tr(lang, 'uploadImage'), null, true);
  }
  function updateNote(entry, value) {
    persist((s) => {
      const target = (s.entries || []).find((e) => e.id === entry.id);
      if (!target) return;
      if (target.type === 'movement') target.movementNote = value; else target.note = value;
    }, 'note_edited', tr(lang, 'noteLabel'), null, true);
  }
  function analyzeEntry(entry) {
    persist((s) => {
      const target = (s.entries || []).find((e) => e.id === entry.id);
      if (target) target.aiAnalysisResult = makeAiResult(s, target, lang);
    }, 'entry_ai_analyzed', tr(lang, 'aiAnalyzeButton'), null, false);
  }
  function addScenario(entry) {
    const scenario = {
      id: window.TradeJournalWorkspace.id('scenario'), entryId: entry.id, title: tr(lang, 'newScenarioTitle'), description: '', evidence: '',
      invalidationTagIds: [], invalidationNote: '', problem: '', trigger: '',
      probabilityHistory: [{ value: 50, loggedAt: new Date().toISOString() }],
      executionPlan: { actionPlan: '', positionType: null, entryPrices: [], stopLoss: null, takeProfit: null, positionStatus: null },
      occurred: false
    };
    persist((s) => {
      const target = (s.entries || []).find((e) => e.id === entry.id);
      if (target) target.scenarios = (target.scenarios || []).concat([scenario]);
    }, 'scenario_added', tr(lang, 'addScenario'), scenario.id, true);
    setOpenScenarios((prev) => new Set(prev).add(scenario.id));
  }
  function updateScenario(entry, scenario, patch, logType) {
    persist((s) => {
      const targetEntry = (s.entries || []).find((e) => e.id === entry.id);
      const target = targetEntry && (targetEntry.scenarios || []).find((sc) => sc.id === scenario.id);
      if (target) Object.assign(target, patch);
    }, logType || null, '', scenario.id, !!logType);
  }
  function deleteScenario(entry, scenario) {
    persist((s) => {
      const target = (s.entries || []).find((e) => e.id === entry.id);
      if (target) target.scenarios = (target.scenarios || []).filter((sc) => sc.id !== scenario.id);
    }, 'scenario_deleted', tr(lang, 'deleteScenarioTitle'), scenario.id, false);
  }
  function toggleStage(entry, scenario, stage) {
    persist((s) => {
      const targetEntry = (s.entries || []).find((e) => e.id === entry.id);
      const target = targetEntry && (targetEntry.scenarios || []).find((sc) => sc.id === scenario.id);
      if (!target || !target.pattern) return;
      const ids = (target.pattern.completedStageIds || []).slice();
      const at = ids.indexOf(stage.id);
      if (at > -1) ids.splice(at, 1); else ids.push(stage.id);
      target.pattern.completedStageIds = ids;
    }, 'pattern_stage_toggled', stage.label, scenario.id, true);
  }
  function setScenarioSide(entry, scenario, side) {
    updateScenario(entry, scenario, { executionPlan: { ...(scenario.executionPlan || {}), positionType: side } }, 'position_edited');
  }

  const selEntry = list.find((e) => e.id === selId) || null;
  const positionsOpen = ((window.TradeJournalTradeStore ? window.TradeJournalTradeStore.listSync() : []))
    .filter((t) => t.source && t.source.sessionId === session.id && t.status === 'open').length;

  return (
    <div dir="rtl" style={{ fontFamily: 'var(--font-ui)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <CommandBar session={session} lang={lang} view={view} onBack={onBack} onSetView={setView} />
      <PulseBand session={session} lang={lang} positionsOpen={positionsOpen} onFate={() => setView('report')} />

      {view === 'timeline' ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ position: 'sticky', top: 64, zIndex: 30, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(6,12,12,.96)', backdropFilter: 'blur(8px)', boxShadow: 'var(--shadow-panel)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border-hairline)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--char-accent)', flex: 'none' }}><Icon name="Film" size={18} /><span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.02em' }}>{tr(lang, 'cockpitTitle')}</span></span>
                <span style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.55)', flex: 'none' }}>
                  {[['all', tr(lang, 'filterAll'), entries.length], ['chart', tr(lang, 'filterChart'), entries.filter((e) => e.type === 'chart').length], ['move', tr(lang, 'filterMove'), entries.filter((e) => e.type === 'movement').length], ['scen', tr(lang, 'filterScen'), entries.filter((e) => (e.scenarios || []).length).length]].map(([id, label, n]) => (
                    <button key={id} type="button" onClick={() => setFilter(id)} style={{ height: 28, padding: '0 11px', borderRadius: 6, cursor: 'pointer', font: 'var(--type-body)', fontSize: 11, border: '1px solid ' + (filter === id ? 'var(--char-accent)' : 'transparent'), background: filter === id ? 'var(--char-active-surface)' : 'transparent', color: filter === id ? 'var(--char-accent)' : 'var(--text-dim)' }}>{label} {n}</button>
                  ))}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.55)', color: 'var(--text-dim)', flex: 'none', width: 190 }}>
                  <Icon name="search" size={14} />
                  <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(lang, 'searchPlaceholder')} style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--text-primary)', font: 'inherit', fontSize: 11 }} />
                </label>
                <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                  <Button variant="secondary" size="sm" icon="Activity" onClick={() => addEntry('movement')}>{tr(lang, 'addMove')}</Button>
                  <Button variant="primary" size="sm" icon="ImagePlus" onClick={() => addEntry('chart')}>{tr(lang, 'addChart')}</Button>
                </span>
              </div>

              <div dir="ltr" style={{ display: 'flex', alignItems: 'stretch', gap: 8, padding: '10px 10px 4px' }}>
                <button type="button" onClick={() => stepEntry(-1)} title={tr(lang, 'prevEntry')} style={{ display: 'grid', placeItems: 'center', width: 34, flex: 'none', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.55)', color: 'var(--text-muted)' }}><Icon name="ChevronLeft" size={18} /></button>
                <div ref={railRef} className="navrya-scroll" style={{ flex: 1, minWidth: 0, display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', padding: '3px 2px 8px', scrollBehavior: 'smooth' }}>
                  {list.map((e) => (
                    <EntryCard key={e.id} entry={e} index={indexById[e.id]} selected={e.id === selId} kindMeta={kindInfo(lang)[e.type] || kindInfo(lang).chart} lang={lang} imageUrl={imageUrls[e.id]} onClick={() => selectEntry(e.id)} />
                  ))}
                  <button type="button" onClick={() => addEntry('chart')} style={{ flex: 'none', width: 112, borderRadius: 10, cursor: 'pointer', border: '1px dashed var(--border-gold)', background: 'transparent', color: 'var(--text-dim)', font: 'var(--type-body)', fontSize: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Icon name="plus" size={18} />{tr(lang, 'newEntryTile')}
                  </button>
                </div>
                <button type="button" onClick={() => stepEntry(1)} title={tr(lang, 'nextEntry')} style={{ display: 'grid', placeItems: 'center', width: 34, flex: 'none', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.55)', color: 'var(--text-muted)' }}><Icon name="ChevronRight" size={18} /></button>
              </div>

              <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px 10px' }}>
                <span className="navrya-tabular" style={{ fontSize: 10, color: 'var(--text-dim)', flex: 'none', width: 64 }}>{tr(lang, 'startShort')} {session.startedAt ? entryTimeLabel({ createdAt: session.startedAt }, lang) : ''}</span>
                <span style={{ position: 'relative', flex: 1, minWidth: 0, height: 26, display: 'block' }}>
                  <span style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 2, borderRadius: 2, background: 'rgba(244,234,215,.1)' }}></span>
                  <span style={{ position: 'absolute', left: 0, top: 12, height: 2, background: 'var(--char-accent)', width: Math.min(100, (minutesFromStart(session, Date.now()) / SPAN_MIN) * 100) + '%' }}></span>
                  {entries.map((e) => {
                    const pos = Math.min(100, (minutesFromStart(session, new Date(e.createdAt).getTime()) / SPAN_MIN) * 100);
                    const kindMeta = kindInfo(lang)[e.type] || kindInfo(lang).chart;
                    const isSel = e.id === selId;
                    return isSel ? (
                      <button key={e.id} type="button" onClick={() => selectEntry(e.id)} title={kindMeta.label + ' · ' + entryTimeLabel(e, lang)} style={{ position: 'absolute', top: 2, width: 22, height: 22, marginLeft: -11, borderRadius: '50%', cursor: 'pointer', border: '2px solid var(--char-accent)', background: 'var(--ink-950)', boxShadow: 'var(--glow-active)', display: 'grid', placeItems: 'center', left: pos + '%' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--char-accent)', display: 'block' }}></span>
                      </button>
                    ) : (
                      <button key={e.id} type="button" onClick={() => selectEntry(e.id)} title={kindMeta.label + ' · ' + entryTimeLabel(e, lang)} style={{ position: 'absolute', top: 7, width: 12, height: 12, marginLeft: -6, borderRadius: '50%', cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'var(--ink-900)', padding: 0, left: pos + '%' }}></button>
                    );
                  })}
                </span>
                <span className="navrya-tabular" style={{ fontSize: 10, color: 'var(--text-dim)', flex: 'none', width: 56, textAlign: 'right' }}>{tr(lang, 'endShort')} {session.startedAt ? entryTimeLabel({ createdAt: Number(session.startedAt) + SPAN_MIN * 60000 }, lang) : ''}</span>
                <span style={{ width: 1, height: 18, background: 'var(--border-hairline)', flex: 'none' }}></span>
                <span dir="rtl" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                  <span className="navrya-tabular" style={{ fontSize: 11, color: 'var(--text-primary)' }}>
                    {list.length ? tr(lang, 'counterEntryWord') + ' ' + (list.findIndex((e) => e.id === selId) < 0 ? 1 : list.findIndex((e) => e.id === selId) + 1) + ' ' + tr(lang, 'counterOf') + ' ' + list.length : tr(lang, 'counterNone')}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{tr(lang, 'keyboardHint')}</span>
                </span>
              </div>
            </div>

            {selEntry ? (
              <EntryDetailPanel
                session={session} entry={selEntry} index={indexById[selEntry.id]} lang={lang} imageUrl={imageUrls[selEntry.id]}
                openScenarios={openScenarios}
                onNote={updateNote} onDeleteEntry={deleteEntry} onAttachImage={attachImage} onAnalyze={analyzeEntry}
                onScenarioToggle={(id) => setOpenScenarios((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
                onScenarioUpdate={updateScenario} onScenarioDelete={deleteScenario} onScenarioStage={toggleStage} onScenarioSide={setScenarioSide}
                onAddScenario={addScenario}
              />
            ) : (
              <Panel variant="base" ornament padding="48px">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'rgba(244,234,215,.18)' }}><Icon name="Film" size={30} /></span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{tr(lang, 'filteredEmptyText')}</span>
                  <Button variant="secondary" size="sm" onClick={() => { setFilter('all'); setQ(''); }}>{tr(lang, 'clearFilter')}</Button>
                </div>
              </Panel>
            )}
          </div>

          <div style={{ width: 326, flex: 'none', position: 'sticky', top: 64, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <DashboardPanel session={session} lang={lang} dash={dash} onSetDash={setDash} indexById={indexById} onSelectEntry={selectEntry} />
            <PrevSummaryPanel session={session} lang={lang} />
            <SimilarSessionsPanel session={session} character={character} lang={lang} />
          </div>
        </div>
      ) : (
        <ReportView session={session} lang={lang} indexById={indexById} />
      )}
    </div>
  );
}
