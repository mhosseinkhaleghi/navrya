import React from 'react';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { InstrumentPicker } from '../public/pages/shared/navrya/components/forms/InstrumentPicker.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { AiMagicFill } from '../public/pages/shared/navrya/components/feedback/AiMagicFill.jsx';
import { useAiFieldFill } from '../public/pages/shared/navrya/hooks/useAiFieldFill.js';
import * as sessionsAdapter from './sessionsAdapter.js';
import { openLogWizard } from './tradeLogModal.jsx';
import { SessionAiAnalysisModal } from './sessionAiAnalysisModal.jsx';

const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1D', '1W'];
const MARKET_NAMES = ['Sydney', 'Tokyo', 'London', 'NewYork'];

// Market chart view (TradingView free hosted Advanced Chart widget) - session.market is a
// city/session-timezone concept (see MARKET_NAMES above), never a financial symbol - it must
// never be read here as a fallback. The instrument itself always drives the chart, though.
//
// Curated, exchange-precise mappings for this app's flagship instruments plus the short ticker
// forms a trader is likely to actually type into the Instrument Catalog's free-text picker (e.g.
// "BTC", not just "BTCUSDT") - these guarantee the right exchange/quote-currency rather than
// leaving it to TradingView's own guess. Real product feedback (2026-08-30): blocking the chart
// behind an exact-map-or-nothing gate left the panel showing an error for any instrument outside
// this literal list, when the actual goal is "always open some chart, then let the trader fix the
// symbol themselves" - see tradingViewSymbolFor()'s fallback below, and the widget's own
// allow_symbol_change:true.
const TV_SYMBOL_BY_INSTRUMENT = {
  XAUUSD: 'OANDA:XAUUSD', XAU: 'OANDA:XAUUSD', GOLD: 'OANDA:XAUUSD',
  BTCUSDT: 'BINANCE:BTCUSDT', BTCUSD: 'BINANCE:BTCUSDT', BTC: 'BINANCE:BTCUSDT',
  ETHUSDT: 'BINANCE:ETHUSDT', ETHUSD: 'BINANCE:ETHUSDT', ETH: 'BINANCE:ETHUSDT',
  EURUSD: 'OANDA:EURUSD', EUR: 'OANDA:EURUSD',
  GBPUSD: 'OANDA:GBPUSD', GBP: 'OANDA:GBPUSD'
};
// Resolves a real, non-empty session.instrument to a starting TradingView symbol - a curated
// match above when one exists, otherwise the trader's own typed code passed straight through as
// a plain symbol query (no invented EXCHANGE: prefix), which TradingView's own resolver treats
// exactly like typing it into the widget's own symbol search. Only returns null when there is
// truly no instrument to chart at all - never for an instrument this map simply doesn't cover -
// so the panel always opens a real, changeable chart instead of a blocking notice.
function tradingViewSymbolFor(instrument) {
  const code = instrument ? String(instrument).trim().toUpperCase() : '';
  if (!code) return null;
  return TV_SYMBOL_BY_INSTRUMENT[code] || code;
}

// Session timeframe -> TradingView "interval" widget parameter. TV_INTERVAL_DEFAULT is the
// documented safe default for a timeframe this map does not recognize.
const TV_INTERVAL_BY_TIMEFRAME = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D' };
const TV_INTERVAL_DEFAULT = '15';
function tradingViewIntervalFor(timeframe) {
  return TV_INTERVAL_BY_TIMEFRAME[timeframe] || TV_INTERVAL_DEFAULT;
}
function tradingViewLocaleFor(lang) {
  return { fa: 'fa_IR', ar: 'ar_AE', en: 'en', es: 'es' }[lang] || 'en';
}

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
// The DC prototype's Fate button/"سرنوشت سشن" only ever switched the view to the Report tab -
// it never closed a session or opened a fate form anywhere in the handoff, which was a real
// regression against the legacy vanilla-DOM flow (session-workspace-logic.js's fateModal() +
// session-entry-flow.js's openEntry(...,'fate')/openFateSummary()): a final chart/note entry
// that closes the session, followed by a real whole-session summary (key movements, pattern
// progression, real scenario outcomes, lessons, a carry-forward note) saved as session.fateSummary
// so the next session's "Previous session summary" panel has something real to show. Restored
// below as FateEntryModal/FateSummaryModal, same real session shape and TradeJournalWorkspace
// save()/log() calls, redesigned against the NAVRYA dialog system.

const SPAN_MIN = 180; // decorative pacing window shared by both pulse rings and the ruler - real
// sessions are open-ended (no stored "planned length"), this only gives the sweep/ruler the same
// fixed visual scale the design uses; the digital clock text next to it is always real elapsed time.

const copy = {
  fa: {
    back: 'بازگشت', settingsTitle: 'تنظیمات سشن', sessionOpen: 'باز', sessionClosed: 'بسته', instrumentUnassigned: 'نماد مشخص نشده', instrumentUnassignedHint: 'برای مشخص کردن نماد این سشن کلیک کنید',
    viewTimeline: 'تایم‌لاین', viewChart: 'چارت بازار', viewReport: 'گزارش سشن', ringSessionLabel: 'زمان سشن', ringLoopLabel: 'تایمر لوپ',
    pulseEntries: 'ورودی‌ها', pulseEntriesUnit: 'چارت و حرکت', pulseScenarios: 'سناریوها', pulseScenariosUnit: 'ثبت‌شده',
    pulsePatterns: 'الگوها', pulsePatternsUnit: 'تگ‌شده', pulsePositions: 'پوزیشن‌ها', pulsePositionsUnit: 'باز',
    fateButton: 'سرنوشت سشن', focusHigh: 'تمرکز بالا', focusMedium: 'تمرکز متوسط', focusLow: 'تمرکز پایین',
    cockpitTitle: 'ثبت چارت و تایم‌لاین', filterAll: 'همه', filterChart: 'چارت', filterMove: 'حرکت',
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
    scenariosOfEntry: 'سناریوهای این ورودی', scenarioTitleLabel: 'عنوان سناریو', scenarioDescLabel: 'شرح سناریو',
    scenarioDescPlaceholder: 'چرا این سناریو معتبر است؟', noPatternTag: 'بدون تگ الگو', noPatternChip: 'بدون الگو',
    patternChipPrefix: 'الگو', lockedNoticeTemplate: 'پروتکل پوزیشن قفل است · {threshold}% تکمیل الگو لازم است',
    probabilityLabel: 'درصد احتمال', planTitle: 'نقشه اجرا', sideLong: 'خرید (لانگ)', sideShort: 'فروش (شورت)',
    entryPriceLabel: 'قیمت ورود', stopLabel: 'حد ضرر', targetLabel: 'حد سود',
    invalidationLabel: 'بی‌اعتباری سناریو', invalidationPlaceholder: 'دلایل را با کاما جدا کنید', occurredYes: 'این سناریو اتفاق افتاد',
    evidenceLabel: 'شواهد سناریو', evidencePlaceholder: 'چه چیزی این سناریو را معتبر می‌کند؟',
    problemLabel: 'مشکل سناریو', problemPlaceholder: 'نقطه ضعف یا ریسک این سناریو چیست؟',
    triggerLabel: 'تریگر سناریو', triggerPlaceholder: 'چه اتفاقی باید بیفتد تا وارد شوید؟',
    patternTagLabel: 'تگ الگو', noPatternOption: 'بدون الگو', completionLabel: 'تکمیل',
    invalidationNoteLabel: 'یادداشت اختیاری در مورد ابطال', invalidationNotePlaceholder: 'یادداشت اختیاری…',
    addTagPlaceholder: 'دلیلی بنویسید و افزودن را بزنید…', addTagButton: 'افزودن', removeTagAria: 'حذف برچسب',
    addScenario: 'افزودن سناریو', newScenarioTitle: 'سناریو جدید', deleteScenarioTitle: 'حذف سناریو',
    filteredEmptyText: 'با این فیلتر ورودی‌ای پیدا نشد', clearFilter: 'پاک کردن فیلتر',
    dashboardTitle: 'داشبورد سشن', dashPatterns: 'الگوها', dashScenarios: 'سناریوها', dashPositions: 'پوزیشن‌ها', dashLog: 'لاگ',
    dashEmptyPatterns: 'هنوز الگویی به سناریوها تگ نشده است.', dashEmptyScenarios: 'هنوز سناریویی ثبت نشده است.',
    dashEmptyPositions: 'هنوز پوزیشنی از سناریوها باز نشده است.', dashEmptyLog: 'هنوز فعالیتی در این سشن ثبت نشده است.', dashEntryPrefix: 'ورودی',
    occurredYesShort: 'اتفاق افتاد', pendingShort: 'در انتظار',
    tradeStatusHunting: 'شکار', tradeStatusOpen: 'باز', tradeStatusClosed: 'بسته', tradeStatusCancelled: 'لغو شده',
    prevSummaryTitle: 'خلاصه سشن قبلی', prevSummaryEmpty: 'هنوز خلاصه‌ای از سشن قبلی ندارید. پس از بستن سشن، نتیجه و درس‌ها به سشن بعدی منتقل می‌شود.',
    similarTitle: 'سشن‌های مشابه', similarThreshold: 'آستانه هشدار', similarEmpty: 'هنوز سشن مشابه قابل‌اعتمادی پیدا نشد.', similarSummary: 'خلاصه',
    reportTitle: 'گزارش سشن', intervalChip: 'بازه {n}m',
    chartEntryTitle: 'ثبت چارت جدید', uploadFinalTitle: 'آپلود چارت نهایی سشن', uploadChartTitle: 'آپلود تصویر چارت',
    timeframeLabel: 'تایم‌فریم', timeframeRequired: 'لطفاً تایم‌فریم این چارت را مشخص کنید', marketLabel: 'سشن معاملاتی',
    dateLabel: 'تاریخ میلادی', noteOptionalLabel: 'یادداشت (اختیاری)', relatedScenariosLabel: 'سناریوهای مرتبط',
    relatedScenariosHint: 'کدام سناریوها با این ورودی تأیید یا مرتبط هستند؟', submitLabel: 'ثبت', cancel: 'انصراف', uploadPrompt: 'کلیک کنید یا تصویر را اینجا رها کنید',
    uploadRequired: 'لطفاً تصویر چارت را آپلود کنید', timeframeFilterLabel: 'تایم‌فریم', allTimeframesLabel: 'همه تایم‌فریم‌ها',
    fateStep1Title: 'سرنوشت سشن · چارت نهایی', fateSubmit: 'ثبت سرنوشت سشن',
    fateStep2Title: 'خلاصه سرنوشت سشن', summaryIntro: 'خلاصه‌ای از نتیجه سشن ثبت کنید تا در سشن بعدی نمایش داده شود.',
    moveStrengthLabel: 'جهت قدرت حرکت', spikeLabel: 'جهت حرکت اسپایکی', dirUp: 'صعودی', dirDown: 'نزولی', dirFlat: 'خنثی',
    lessonsNoteLabel: 'یادداشت (اختیاری)', lessonsPlaceholder: 'هر نکته‌ای که ارزش انتقال به سشن بعدی را دارد...',
    sessionAiTitle: 'تحلیل هوش مصنوعی کل سشن', aiIntro: 'تمام ورودی‌های تایم‌لاین، سناریوها و الگوها بررسی می‌شوند.',
    startAnalysis: 'شروع تحلیل', reanalyzeLabel: 'تحلیل مجدد', overviewLabel: 'نمای کلی', keyMovementsLabel: 'حرکت‌های کلیدی',
    significanceLabel: 'اهمیت', patternProgressionLabel: 'سیر الگوها', scenarioOutcomesLabel: 'نتیجه سناریوها',
    occurredLabel: 'اتفاق افتاد', notOccurredLabel: 'اتفاق نیفتاد', lessonsLabel: 'درس‌ها', carryForwardLabel: 'منتقل‌شده به سشن بعدی',
    saveFateLabel: 'ذخیره سرنوشت', localProviderLabel: 'تحلیل محلی',
    defaultOverview: 'سشن بر اساس ورودی‌های تایم‌لاین، تغییر احتمال سناریوها و پیشرفت الگوها جمع‌بندی شد.',
    defaultLesson: 'پیش از هر ورود، تریگر و سطح ابطال را دوباره تأیید کنید.',
    defaultCarry: 'سناریوهای معتبر، مراحل ناتمام الگو و نکته‌های مدیریت ریسک را در سشن بعدی مرور کنید.',
    logTradeAction: 'ثبت معامله', allOpenPositions: 'همه پوزیشن‌های باز', rrShort: 'RR', leverageShort: 'اهرم',
    noOpenPositions: 'هیچ پوزیشن بازی نیست', closeAction2: 'بستن پوزیشن', logEmotionShort: 'ثبت احساس', analyzing: 'در حال تحلیل کامل سشن...',
    chartLoadingText: 'در حال بارگذاری چارت TradingView…', chartLoadErrorTitle: 'بارگذاری چارت ناموفق بود',
    chartLoadErrorBody: 'اسکریپت چارت TradingView بارگذاری نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.',
    chartUnmappedTitle: 'برای این سشن نمادی مشخص نشده است',
    chartUnmappedBodyNoInstrument: 'برای این سشن نمادی مشخص نشده است، بنابراین چارتی برای نمایش وجود ندارد.',
    chartUnmappedHint: 'برای تعیین نماد سشن، روی چیپ نماد در نوار فرمان بالا کلیک کنید؛ پس از تعیین نماد، TradingView چارت متناظر را باز می‌کند و شما می‌توانید از داخل خود چارت، بازار دیگری را نیز انتخاب کنید.',
    tvAttribution: 'رصد تمام بازارها در TradingView', enterFullscreenChart: 'تمام‌صفحه', exitFullscreenChart: 'خروج از تمام‌صفحه',
    chartCaptureHint: 'یک اسکرین‌شات از این چارت می‌گیرد. ممکن است مرورگر یک‌بار از شما بخواهد اشتراک‌گذاری همین تب را تأیید کنید.',
    chartCapturePermissionDenied: 'اجازه‌ی اسکرین‌شات داده نشد. همچنان می‌توانید تصویر را دستی از پایین اضافه کنید.',
    chartCaptureUnsupported: 'گرفتن اسکرین‌شات در این مرورگر پشتیبانی نمی‌شود. همچنان می‌توانید تصویر را دستی از پایین اضافه کنید.',
    chartCaptureFailed: 'گرفتن اسکرین‌شات از چارت ممکن نشد. همچنان می‌توانید تصویر را دستی از پایین اضافه کنید.'
  },
  ar: {
    back: 'رجوع', settingsTitle: 'إعدادات الجلسة', sessionOpen: 'مفتوحة', sessionClosed: 'مغلقة', instrumentUnassigned: 'الأداة غير محددة', instrumentUnassignedHint: 'انقر لتحديد أداة هذه الجلسة',
    viewTimeline: 'الخط الزمني', viewChart: 'مخطط السوق', viewReport: 'تقرير الجلسة', ringSessionLabel: 'وقت الجلسة', ringLoopLabel: 'مؤقت الحلقة',
    pulseEntries: 'الإدخالات', pulseEntriesUnit: 'رسم وحركة', pulseScenarios: 'السيناريوهات', pulseScenariosUnit: 'مسجّلة',
    pulsePatterns: 'الأنماط', pulsePatternsUnit: 'موسومة', pulsePositions: 'الصفقات', pulsePositionsUnit: 'مفتوحة',
    fateButton: 'مصير الجلسة', focusHigh: 'تركيز عالٍ', focusMedium: 'تركيز متوسط', focusLow: 'تركيز منخفض',
    cockpitTitle: 'تسجيل الرسم والخط الزمني', filterAll: 'الكل', filterChart: 'رسم', filterMove: 'حركة',
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
    scenariosOfEntry: 'سيناريوهات هذا الإدخال', scenarioTitleLabel: 'عنوان السيناريو', scenarioDescLabel: 'وصف السيناريو',
    scenarioDescPlaceholder: 'لماذا هذا السيناريو صالح؟', noPatternTag: 'بدون وسم نمط', noPatternChip: 'بدون نمط',
    patternChipPrefix: 'نمط', lockedNoticeTemplate: 'بروتوكول الصفقة مقفل · يلزم اكتمال {threshold}% من النمط',
    probabilityLabel: 'نسبة الاحتمال', planTitle: 'خطة التنفيذ', sideLong: 'شراء (Long)', sideShort: 'بيع (Short)',
    entryPriceLabel: 'سعر الدخول', stopLabel: 'وقف الخسارة', targetLabel: 'هدف الربح',
    invalidationLabel: 'إبطال السيناريو', invalidationPlaceholder: 'افصل الأسباب بفواصل', occurredYes: 'هذا السيناريو حدث',
    evidenceLabel: 'أدلة السيناريو', evidencePlaceholder: 'ما الذي يجعل هذا السيناريو صالحاً؟',
    problemLabel: 'مشكلة السيناريو', problemPlaceholder: 'ما نقطة الضعف أو المخاطرة في هذا السيناريو؟',
    triggerLabel: 'محفّز السيناريو', triggerPlaceholder: 'ما الذي يجب أن يحدث لتدخل الصفقة؟',
    patternTagLabel: 'وسم النمط', noPatternOption: 'بدون نمط', completionLabel: 'اكتمال',
    invalidationNoteLabel: 'ملاحظة اختيارية حول الإبطال', invalidationNotePlaceholder: 'ملاحظة اختيارية…',
    addTagPlaceholder: 'اكتب سبباً واضغط إضافة…', addTagButton: 'إضافة', removeTagAria: 'حذف الوسم',
    addScenario: 'إضافة سيناريو', newScenarioTitle: 'سيناريو جديد', deleteScenarioTitle: 'حذف السيناريو',
    filteredEmptyText: 'لا يوجد إدخال بهذا الفلتر', clearFilter: 'مسح الفلتر',
    dashboardTitle: 'لوحة الجلسة', dashPatterns: 'الأنماط', dashScenarios: 'السيناريوهات', dashPositions: 'الصفقات', dashLog: 'السجل',
    dashEmptyPatterns: 'لم يتم وسم أي نمط بعد.', dashEmptyScenarios: 'لم يتم تسجيل أي سيناريو بعد.',
    dashEmptyPositions: 'لا توجد صفقة مفتوحة من السيناريوهات بعد.', dashEmptyLog: 'لا يوجد أي نشاط مسجل في هذه الجلسة بعد.', dashEntryPrefix: 'إدخال',
    occurredYesShort: 'حدث', pendingShort: 'قيد الانتظار',
    tradeStatusHunting: 'بحث', tradeStatusOpen: 'مفتوحة', tradeStatusClosed: 'مغلقة', tradeStatusCancelled: 'ملغاة',
    prevSummaryTitle: 'ملخص الجلسة السابقة', prevSummaryEmpty: 'لا يوجد ملخص للجلسة السابقة بعد. بعد إغلاق الجلسة تُنقل النتيجة والدروس إلى الجلسة التالية.',
    similarTitle: 'جلسات مشابهة', similarThreshold: 'حد التنبيه', similarEmpty: 'لم يتم العثور على جلسة مشابهة موثوقة بعد.', similarSummary: 'ملخص',
    reportTitle: 'تقرير الجلسة', intervalChip: 'فترة {n} د',
    chartEntryTitle: 'تسجيل رسم جديد', uploadFinalTitle: 'رفع الرسم النهائي للجلسة', uploadChartTitle: 'رفع صورة الرسم',
    timeframeLabel: 'الإطار الزمني', timeframeRequired: 'يرجى تحديد الإطار الزمني لهذا الرسم', marketLabel: 'جلسة التداول',
    dateLabel: 'التاريخ الميلادي', noteOptionalLabel: 'ملاحظة (اختياري)', relatedScenariosLabel: 'السيناريوهات المرتبطة',
    relatedScenariosHint: 'ما السيناريوهات التي يؤكدها هذا الإدخال؟', submitLabel: 'تسجيل', cancel: 'إلغاء', uploadPrompt: 'انقر أو اسحب الصورة إلى هنا',
    uploadRequired: 'يرجى رفع صورة الرسم', timeframeFilterLabel: 'الإطار الزمني', allTimeframesLabel: 'كل الأطر الزمنية',
    fateStep1Title: 'مصير الجلسة · الرسم النهائي', fateSubmit: 'تسجيل مصير الجلسة',
    fateStep2Title: 'ملخص مصير الجلسة', summaryIntro: 'سجل خلاصة الجلسة لتظهر في الجلسة التالية.',
    moveStrengthLabel: 'اتجاه قوة الحركة', spikeLabel: 'اتجاه الحركة السريعة', dirUp: 'صاعد', dirDown: 'هابط', dirFlat: 'محايد',
    lessonsNoteLabel: 'ملاحظة (اختياري)', lessonsPlaceholder: 'أي درس يستحق نقله إلى الجلسة التالية...',
    sessionAiTitle: 'تحليل الذكاء الاصطناعي للجلسة', aiIntro: 'سيتم فحص جميع إدخالات الخط الزمني والسيناريوهات والأنماط.',
    startAnalysis: 'بدء التحليل', reanalyzeLabel: 'إعادة التحليل', overviewLabel: 'نظرة عامة', keyMovementsLabel: 'الحركات الرئيسية',
    significanceLabel: 'الأهمية', patternProgressionLabel: 'تطور الأنماط', scenarioOutcomesLabel: 'نتائج السيناريوهات',
    occurredLabel: 'حدث', notOccurredLabel: 'لم يحدث', lessonsLabel: 'الدروس', carryForwardLabel: 'للجلسة التالية',
    saveFateLabel: 'حفظ المصير', localProviderLabel: 'تحليل محلي',
    defaultOverview: 'تم تلخيص الجلسة وفق الخط الزمني والسيناريوهات وتقدم الأنماط.',
    defaultLesson: 'أكد المحفز ومستوى الإبطال قبل أي دخول.',
    defaultCarry: 'راجع السيناريوهات الصالحة ومراحل الأنماط غير المكتملة في الجلسة التالية.',
    logTradeAction: 'تسجيل صفقة', allOpenPositions: 'كل الصفقات المفتوحة', rrShort: 'RR', leverageShort: 'الرافعة',
    noOpenPositions: 'لا توجد صفقة مفتوحة', closeAction2: 'إغلاق الصفقة', logEmotionShort: 'تسجيل شعور', analyzing: 'جارٍ تحليل الجلسة بالكامل...',
    chartLoadingText: 'جارٍ تحميل مخطط TradingView…', chartLoadErrorTitle: 'تعذّر تحميل المخطط',
    chartLoadErrorBody: 'تعذّر تحميل سكربت مخطط TradingView. تحقق من اتصال الإنترنت وحاول مرة أخرى.',
    chartUnmappedTitle: 'لم يتم تحديد أداة لهذه الجلسة',
    chartUnmappedBodyNoInstrument: 'لم يتم تحديد أداة لهذه الجلسة، لذا لا يوجد مخطط لعرضه.',
    chartUnmappedHint: 'لتحديد أداة الجلسة، انقر على شارة الأداة في شريط الأوامر أعلاه - بمجرد التحديد، سيفتح TradingView مخططاً مطابقاً، ويمكنك اختيار سوق آخر بنفسك من داخل المخطط نفسه.',
    tvAttribution: 'تتبع جميع الأسواق على TradingView', enterFullscreenChart: 'ملء الشاشة', exitFullscreenChart: 'الخروج من وضع ملء الشاشة',
    chartCaptureHint: 'يلتقط لقطة شاشة لهذا المخطط. قد يطلب المتصفح مرة واحدة الموافقة على مشاركة هذا التبويب.',
    chartCapturePermissionDenied: 'لم يتم منح إذن التقاط الشاشة. لا يزال بإمكانك إرفاق صورة يدوياً أدناه.',
    chartCaptureUnsupported: 'التقاط لقطة الشاشة غير مدعوم في هذا المتصفح. لا يزال بإمكانك إرفاق صورة يدوياً أدناه.',
    chartCaptureFailed: 'تعذّر التقاط لقطة شاشة للمخطط. لا يزال بإمكانك إرفاق صورة يدوياً أدناه.'
  },
  en: {
    back: 'Back', settingsTitle: 'Session settings', sessionOpen: 'Open', sessionClosed: 'Closed', instrumentUnassigned: 'Instrument not set', instrumentUnassignedHint: 'Click to classify this session\'s instrument',
    viewTimeline: 'Timeline', viewChart: 'Market chart', viewReport: 'Session report', ringSessionLabel: 'Session time', ringLoopLabel: 'Loop timer',
    pulseEntries: 'Entries', pulseEntriesUnit: 'chart & move', pulseScenarios: 'Scenarios', pulseScenariosUnit: 'logged',
    pulsePatterns: 'Patterns', pulsePatternsUnit: 'tagged', pulsePositions: 'Positions', pulsePositionsUnit: 'open',
    fateButton: 'Session fate', focusHigh: 'High focus', focusMedium: 'Medium focus', focusLow: 'Low focus',
    cockpitTitle: 'Chart & timeline register', filterAll: 'All', filterChart: 'Chart', filterMove: 'Move',
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
    scenariosOfEntry: 'Scenarios for this entry', scenarioTitleLabel: 'Scenario title', scenarioDescLabel: 'Scenario description',
    scenarioDescPlaceholder: 'Why is this scenario valid?', noPatternTag: 'No pattern tag', noPatternChip: 'No pattern',
    patternChipPrefix: 'Pattern', lockedNoticeTemplate: 'Position protocol locked · {threshold}% pattern completion required',
    probabilityLabel: 'Probability', planTitle: 'Execution plan', sideLong: 'Buy (Long)', sideShort: 'Sell (Short)',
    entryPriceLabel: 'Entry price', stopLabel: 'Stop loss', targetLabel: 'Take profit',
    invalidationLabel: 'Scenario invalidation', invalidationPlaceholder: 'Separate reasons with commas', occurredYes: 'This scenario occurred',
    evidenceLabel: 'Scenario evidence', evidencePlaceholder: 'What makes this scenario valid?',
    problemLabel: 'Scenario issue', problemPlaceholder: 'What is the weak point or risk in this scenario?',
    triggerLabel: 'Scenario trigger', triggerPlaceholder: 'What has to happen for you to enter?',
    patternTagLabel: 'Pattern tag', noPatternOption: 'No pattern', completionLabel: 'Complete',
    invalidationNoteLabel: 'Optional note about the invalidation', invalidationNotePlaceholder: 'Optional note…',
    addTagPlaceholder: 'Write a reason and press Add…', addTagButton: 'Add', removeTagAria: 'Remove tag',
    addScenario: 'Add scenario', newScenarioTitle: 'New scenario', deleteScenarioTitle: 'Delete scenario',
    filteredEmptyText: 'No entry matches this filter', clearFilter: 'Clear filter',
    dashboardTitle: 'Session dashboard', dashPatterns: 'Patterns', dashScenarios: 'Scenarios', dashPositions: 'Positions', dashLog: 'Log',
    dashEmptyPatterns: 'No pattern is tagged on a scenario yet.', dashEmptyScenarios: 'No scenario is logged yet.',
    dashEmptyPositions: 'No position is open from a scenario yet.', dashEmptyLog: 'No activity logged in this session yet.', dashEntryPrefix: 'Entry',
    occurredYesShort: 'Occurred', pendingShort: 'Pending',
    tradeStatusHunting: 'Hunting', tradeStatusOpen: 'Open', tradeStatusClosed: 'Closed', tradeStatusCancelled: 'Cancelled',
    prevSummaryTitle: 'Previous session summary', prevSummaryEmpty: 'No previous session summary yet. Closing a session carries its outcome and lessons into the next one.',
    similarTitle: 'Similar sessions', similarThreshold: 'Alert threshold', similarEmpty: 'No trustworthy similar session found yet.', similarSummary: 'Summary',
    reportTitle: 'Session report', intervalChip: '{n}m loop',
    chartEntryTitle: 'Log new chart', uploadFinalTitle: 'Upload final session chart', uploadChartTitle: 'Upload chart image',
    timeframeLabel: 'Timeframe', timeframeRequired: 'Please pick this chart’s timeframe', marketLabel: 'Trading session',
    dateLabel: 'Gregorian date', noteOptionalLabel: 'Note (optional)', relatedScenariosLabel: 'Related scenarios',
    relatedScenariosHint: 'Which scenarios does this entry confirm or relate to?', submitLabel: 'Submit', cancel: 'Cancel', uploadPrompt: 'Click or drop an image here',
    uploadRequired: 'Please upload a chart image', timeframeFilterLabel: 'Timeframe', allTimeframesLabel: 'All timeframes',
    fateStep1Title: 'Session fate · final chart', fateSubmit: 'Submit session fate',
    fateStep2Title: 'Session fate summary', summaryIntro: 'Record a session outcome so it can be shown in the next session.',
    moveStrengthLabel: 'Move-strength direction', spikeLabel: 'Spike direction', dirUp: 'Bullish', dirDown: 'Bearish', dirFlat: 'Neutral',
    lessonsNoteLabel: 'Note (optional)', lessonsPlaceholder: 'Anything worth carrying into the next session...',
    sessionAiTitle: 'Whole-session AI analysis', aiIntro: 'All timeline entries, scenarios and patterns will be reviewed.',
    startAnalysis: 'Start analysis', reanalyzeLabel: 'Analyze again', overviewLabel: 'Overview', keyMovementsLabel: 'Key movements',
    significanceLabel: 'Significance', patternProgressionLabel: 'Pattern progression', scenarioOutcomesLabel: 'Scenario outcomes',
    occurredLabel: 'Occurred', notOccurredLabel: 'Did not occur', lessonsLabel: 'Lessons', carryForwardLabel: 'Carry forward to next session',
    saveFateLabel: 'Save fate', localProviderLabel: 'Local analysis',
    defaultOverview: 'The session was summarized from timeline entries, scenario probability changes and pattern progress.',
    defaultLesson: 'Confirm the trigger and invalidation level before every entry.',
    defaultCarry: 'Review valid scenarios, unfinished pattern stages and risk notes in the next session.',
    logTradeAction: 'Log trade', allOpenPositions: 'All open positions', rrShort: 'RR', leverageShort: 'Leverage',
    noOpenPositions: 'No open positions', closeAction2: 'Close position', logEmotionShort: 'Log emotion', analyzing: 'Analyzing the complete session...',
    chartLoadingText: 'Loading the TradingView chart…', chartLoadErrorTitle: 'The chart failed to load',
    chartLoadErrorBody: 'The TradingView chart script could not be loaded. Check your connection and try again.',
    chartUnmappedTitle: 'No instrument set for this session',
    chartUnmappedBodyNoInstrument: 'No instrument is set for this session, so there is no chart to show.',
    chartUnmappedHint: 'Click the instrument chip in the command bar above to set the session instrument - once set, TradingView opens a matching chart, and you can pick a different market yourself from inside the chart.',
    tvAttribution: 'Track all markets on TradingView', enterFullscreenChart: 'Fullscreen', exitFullscreenChart: 'Exit fullscreen',
    chartCaptureHint: 'Captures a screenshot of this chart. Your browser may ask you to share this tab once.',
    chartCapturePermissionDenied: 'Screenshot permission was not granted. You can still attach an image manually below.',
    chartCaptureUnsupported: 'Screenshot capture is not supported in this browser. You can still attach an image manually below.',
    chartCaptureFailed: 'Could not capture a screenshot of the chart. You can still attach an image manually below.'
  },
  es: {
    back: 'Volver', settingsTitle: 'Ajustes de la sesión', sessionOpen: 'Abierta', sessionClosed: 'Cerrada', instrumentUnassigned: 'Instrumento sin definir', instrumentUnassignedHint: 'Haz clic para clasificar el instrumento de esta sesión',
    viewTimeline: 'Línea temporal', viewChart: 'Gráfico de mercado', viewReport: 'Informe de sesión', ringSessionLabel: 'Tiempo de sesión', ringLoopLabel: 'Temporizador de bucle',
    pulseEntries: 'Entradas', pulseEntriesUnit: 'gráfico y movimiento', pulseScenarios: 'Escenarios', pulseScenariosUnit: 'registrados',
    pulsePatterns: 'Patrones', pulsePatternsUnit: 'etiquetados', pulsePositions: 'Posiciones', pulsePositionsUnit: 'abiertas',
    fateButton: 'Destino de la sesión', focusHigh: 'Enfoque alto', focusMedium: 'Enfoque medio', focusLow: 'Enfoque bajo',
    cockpitTitle: 'Registro de gráfico y línea temporal', filterAll: 'Todo', filterChart: 'Gráfico', filterMove: 'Movimiento',
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
    scenariosOfEntry: 'Escenarios de esta entrada', scenarioTitleLabel: 'Título del escenario', scenarioDescLabel: 'Descripción del escenario',
    scenarioDescPlaceholder: '¿Por qué es válido este escenario?', noPatternTag: 'Sin etiqueta de patrón', noPatternChip: 'Sin patrón',
    patternChipPrefix: 'Patrón', lockedNoticeTemplate: 'Protocolo de posición bloqueado · se requiere {threshold}% del patrón',
    probabilityLabel: 'Probabilidad', planTitle: 'Plan de ejecución', sideLong: 'Compra (Long)', sideShort: 'Venta (Short)',
    entryPriceLabel: 'Precio de entrada', stopLabel: 'Stop loss', targetLabel: 'Take profit',
    invalidationLabel: 'Invalidación del escenario', invalidationPlaceholder: 'Separa las razones con comas', occurredYes: 'Este escenario ocurrió',
    evidenceLabel: 'Evidencia del escenario', evidencePlaceholder: '¿Qué hace válido este escenario?',
    problemLabel: 'Problema del escenario', problemPlaceholder: '¿Cuál es el punto débil o riesgo de este escenario?',
    triggerLabel: 'Disparador del escenario', triggerPlaceholder: '¿Qué debe ocurrir para entrar?',
    patternTagLabel: 'Etiqueta de patrón', noPatternOption: 'Sin patrón', completionLabel: 'Completado',
    invalidationNoteLabel: 'Nota opcional sobre la invalidación', invalidationNotePlaceholder: 'Nota opcional…',
    addTagPlaceholder: 'Escribe un motivo y pulsa Añadir…', addTagButton: 'Añadir', removeTagAria: 'Eliminar etiqueta',
    addScenario: 'Añadir escenario', newScenarioTitle: 'Nuevo escenario', deleteScenarioTitle: 'Eliminar escenario',
    filteredEmptyText: 'Ninguna entrada coincide con este filtro', clearFilter: 'Limpiar filtro',
    dashboardTitle: 'Panel de la sesión', dashPatterns: 'Patrones', dashScenarios: 'Escenarios', dashPositions: 'Posiciones', dashLog: 'Registro',
    dashEmptyPatterns: 'Aún no hay un patrón etiquetado en un escenario.', dashEmptyScenarios: 'Aún no hay ningún escenario registrado.',
    dashEmptyPositions: 'Aún no hay ninguna posición abierta desde un escenario.', dashEmptyLog: 'Aún no hay actividad registrada en esta sesión.', dashEntryPrefix: 'Entrada',
    occurredYesShort: 'Ocurrió', pendingShort: 'Pendiente',
    tradeStatusHunting: 'Buscando', tradeStatusOpen: 'Abierta', tradeStatusClosed: 'Cerrada', tradeStatusCancelled: 'Cancelada',
    prevSummaryTitle: 'Resumen de la sesión anterior', prevSummaryEmpty: 'Aún no hay un resumen de la sesión anterior. Al cerrar una sesión, su resultado y lecciones pasan a la siguiente.',
    similarTitle: 'Sesiones similares', similarThreshold: 'Umbral de alerta', similarEmpty: 'Aún no se encontró una sesión similar fiable.', similarSummary: 'Resumen',
    reportTitle: 'Informe de sesión', intervalChip: 'Bucle {n}m',
    chartEntryTitle: 'Registrar nuevo gráfico', uploadFinalTitle: 'Subir gráfico final de la sesión', uploadChartTitle: 'Subir imagen del gráfico',
    timeframeLabel: 'Temporalidad', timeframeRequired: 'Elige la temporalidad de este gráfico', marketLabel: 'Sesión de mercado',
    dateLabel: 'Fecha gregoriana', noteOptionalLabel: 'Nota (opcional)', relatedScenariosLabel: 'Escenarios relacionados',
    relatedScenariosHint: '¿Qué escenarios confirma esta entrada?', submitLabel: 'Registrar', cancel: 'Cancelar', uploadPrompt: 'Haz clic o suelta una imagen aquí',
    uploadRequired: 'Sube una imagen del gráfico', timeframeFilterLabel: 'Temporalidad', allTimeframesLabel: 'Todas las temporalidades',
    fateStep1Title: 'Destino de la sesión · gráfico final', fateSubmit: 'Registrar destino de la sesión',
    fateStep2Title: 'Resumen del destino de la sesión', summaryIntro: 'Registra el resultado para mostrarlo en la siguiente sesión.',
    moveStrengthLabel: 'Dirección de la fuerza', spikeLabel: 'Dirección del impulso', dirUp: 'Alcista', dirDown: 'Bajista', dirFlat: 'Neutral',
    lessonsNoteLabel: 'Nota (opcional)', lessonsPlaceholder: 'Algo que valga la pena llevar a la próxima sesión...',
    sessionAiTitle: 'Análisis IA de toda la sesión', aiIntro: 'Se revisarán todas las entradas, escenarios y patrones.',
    startAnalysis: 'Iniciar análisis', reanalyzeLabel: 'Analizar otra vez', overviewLabel: 'Resumen', keyMovementsLabel: 'Movimientos clave',
    significanceLabel: 'Importancia', patternProgressionLabel: 'Evolución de patrones', scenarioOutcomesLabel: 'Resultados de escenarios',
    occurredLabel: 'Ocurrió', notOccurredLabel: 'No ocurrió', lessonsLabel: 'Lecciones', carryForwardLabel: 'Para la próxima sesión',
    saveFateLabel: 'Guardar destino', localProviderLabel: 'Análisis local',
    defaultOverview: 'La sesión se resumió según la línea temporal, los escenarios y el progreso de patrones.',
    defaultLesson: 'Confirma el activador y la invalidación antes de cada entrada.',
    defaultCarry: 'Revisa los escenarios válidos y las etapas pendientes en la próxima sesión.',
    logTradeAction: 'Registrar operación', allOpenPositions: 'Todas las posiciones abiertas', rrShort: 'RR', leverageShort: 'Apalanc.',
    noOpenPositions: 'No hay posiciones abiertas', closeAction2: 'Cerrar posición', logEmotionShort: 'Registrar emoción', analyzing: 'Analizando la sesión completa...',
    chartLoadingText: 'Cargando el gráfico de TradingView…', chartLoadErrorTitle: 'No se pudo cargar el gráfico',
    chartLoadErrorBody: 'No se pudo cargar el script del gráfico de TradingView. Comprueba tu conexión e inténtalo de nuevo.',
    chartUnmappedTitle: 'Esta sesión no tiene un instrumento definido',
    chartUnmappedBodyNoInstrument: 'Esta sesión no tiene un instrumento definido, por lo que no hay ningún gráfico que mostrar.',
    chartUnmappedHint: 'Haz clic en la etiqueta del instrumento en la barra de comandos superior para definirlo - una vez definido, TradingView abrirá un gráfico correspondiente, y podrás elegir otro mercado tú mismo desde dentro del propio gráfico.',
    tvAttribution: 'Sigue todos los mercados en TradingView', enterFullscreenChart: 'Pantalla completa', exitFullscreenChart: 'Salir de pantalla completa',
    chartCaptureHint: 'Captura una imagen de este gráfico. Es posible que el navegador te pida una vez compartir esta pestaña.',
    chartCapturePermissionDenied: 'No se concedió permiso para la captura. Aún puedes adjuntar una imagen manualmente abajo.',
    chartCaptureUnsupported: 'La captura de pantalla no es compatible con este navegador. Aún puedes adjuntar una imagen manualmente abajo.',
    chartCaptureFailed: 'No se pudo capturar una imagen del gráfico. Aún puedes adjuntar una imagen manualmente abajo.'
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
function visibleEntries(entries, filter, q, lang, tf) {
  const query = (q || '').trim().toLowerCase();
  return entries.filter((e) => {
    if (filter === 'chart' && e.type !== 'chart') return false;
    if (filter === 'move' && e.type !== 'movement') return false;
    if (tf && tf !== 'all' && e.timeframe !== tf) return false;
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
// Ported from session-workspace-logic.js's completion(s) (the old vanilla workspace) - counts how
// many of a scenario's real fields are filled in, out of the same 10 tracked there.
function scenarioCompletion(scenario) {
  const ep = scenario.executionPlan || {};
  const fields = [scenario.title, scenario.description, scenario.evidence, scenario.trigger, probabilityOf(scenario) > 0, ep.actionPlan, ep.positionType, (ep.entryPrices || []).length, ep.stopLoss, ep.takeProfit];
  return Math.round(fields.filter(Boolean).length / fields.length * 100);
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
// Ported from session-entry-flow.js's own makeSessionAnalysis() - a real "local-demo" summary
// computed from this session's actual entries/scenarios/patterns, not a fabricated one: overview
// count, the last 5 real timeline entries, real pattern-completion progress, real scenario
// occurred/probability outcomes. No external AI call - same as the legacy flow's own provider.
function patternPercent(scenario) {
  const stages = (scenario.pattern && scenario.pattern.stages) || [];
  const done = (scenario.pattern && scenario.pattern.completedStageIds) || [];
  return stages.length ? Math.round((done.length / stages.length) * 100) : 0;
}
function makeSessionAnalysis(session, lang) {
  const entries = sortedEntries(session);
  const scenarios = flatScenarios(session).map((x) => x.scenario);
  const patterns = [];
  scenarios.forEach((scenario) => {
    const name = (scenario.pattern && (scenario.pattern.name || scenario.pattern.patternTagId)) || scenario.strategy;
    if (name && !patterns.some((p) => p.patternName === name)) patterns.push({ patternName: name, outcome: patternPercent(scenario) + '% · ' + scenario.title });
  });
  return {
    provider: 'local-demo',
    overview: tr(lang, 'defaultOverview') + ' ' + entries.length + ' ' + tr(lang, 'counterEntryWord') + '.',
    keyMovements: entries.slice(-5).map((entry) => ({
      time: entryTimeLabel(entry, lang),
      description: entry.movementNote || entry.note || (kindInfo(lang)[entry.type] || kindInfo(lang).chart).label,
      significance: entry.type === 'fate' ? tr(lang, 'carryForwardLabel') : tr(lang, 'relatedScenariosLabel')
    })),
    patternProgression: patterns,
    scenarioOutcomes: scenarios.map((scenario) => ({ title: scenario.title || tr(lang, 'newScenarioTitle'), occurred: Boolean(scenario.occurred), note: probabilityOf(scenario) + '%' })),
    lessonsLearned: [tr(lang, 'defaultLesson')],
    carryForwardToNextSession: tr(lang, 'defaultCarry')
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

// Generic full-bleed dialog shell shared by the three custom modals below (chart entry, fate
// entry, fate summary) - same fixed/backdrop/Escape-to-close pattern the redesigned trade modals
// (closePositionModal.jsx etc.) use, sized for this file's own denser two-column content.
function SessionModalShell({ title, icon, eyebrow, onClose, footer, width = 640, children }) {
  React.useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', padding: 24, background: 'var(--scrim)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'relative', width: '100%', maxWidth: width, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', border: '1px solid var(--border-gold)', borderRadius: 12, background: 'var(--ink-900)', boxShadow: '0 12px 30px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
          {icon && (
            <span style={{ width: 40, height: 40, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}>
              <Icon name={icon} size={20} />
            </span>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
            {eyebrow && <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{eyebrow}</span>}
            <span style={{ font: 'var(--type-display-md)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-primary)' }}>{title}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="close" style={{ width: 40, height: 40, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
        {footer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: '1px solid var(--border-hairline)', background: 'var(--ink-900)' }}>{footer}</div>
        )}
      </div>
    </div>
  );
}

// Real chart-entry creation - replaces the bare file input the DC prototype used with the fields
// the legacy session-entry-flow.js's openEntry('chart') always asked for: a required image,
// a required timeframe (the DC prototype silently defaulted this and never asked), market, date,
// an optional note and scenario linking. Same real entry shape TradeJournalWorkspace saves.
// initialFile (optional) pre-fills the upload with an already-captured image - e.g. the Market
// chart panel's own screenshot-capture button (see MarketChartView) - so the trader lands on a
// populated preview instead of an empty dropzone; every other field/behavior is unchanged, and a
// plain manual "Add chart" (Timeline's own buttons) never passes this prop.
function ChartEntryModal({ session, lang, onClose, onSubmit, initialFile }) {
  const rtl = lang === 'fa' || lang === 'ar';
  const [file, setFile] = React.useState(initialFile || null);
  const [previewUrl, setPreviewUrl] = React.useState(() => (initialFile ? URL.createObjectURL(initialFile) : ''));
  const [timeframe, setTimeframe] = React.useState(session.timeframe || '5m');
  const [market, setMarket] = React.useState(sessionsAdapter.displayCity(session.market) === 'New York' ? 'NewYork' : (session.market || 'London'));
  // HOTFIX: session.date used to come out of NewSessionDialog's own hardcoded, non-ISO default
  // ('08/01/2026', fixed alongside this) for any session whose creator never touched the date
  // field - fed straight into the real <input type="date"> below, which requires exactly
  // 'yyyy-MM-dd' and silently rejects anything else (a real browser console warning, and the
  // field visibly failing to show the date it was given). Validating the format here, not just
  // fixing the default going forward, means an existing session created before this fix still
  // opens this modal correctly instead of carrying the bug forward.
  const isIsoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const [date, setDate] = React.useState(isIsoDate(session.date) ? session.date : new Date().toISOString().slice(0, 10));
  const [note, setNote] = React.useState('');
  const [related, setRelated] = React.useState([]);
  const [error, setError] = React.useState('');
  const fileRef = React.useRef(null);
  const scenarios = flatScenarios(session);

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setError('');
  }
  function toggleRelated(id) {
    setRelated((list) => (list.indexOf(id) > -1 ? list.filter((x) => x !== id) : list.concat([id])));
  }
  function submit() {
    if (!file) { setError(tr(lang, 'uploadRequired')); return; }
    if (!timeframe) { setError(tr(lang, 'timeframeRequired')); return; }
    onSubmit({ file, timeframe, market, date, note, relatedScenarioIds: related });
  }

  // AI process registry (A4) - mountedRef template. Only mounted while chartModalOpen is true
  // (LiveSessionView, below).
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('live-session-chart-entry', {
      allowlist: ['note', 'timeframe', 'market', 'date'],
      isOpen: () => mountedRef.current,
      applyValue: (path, value) => {
        if (path === 'note') setNote(String(value ?? ''));
        else if (path === 'timeframe' && TIMEFRAMES.indexOf(value) > -1) setTimeframe(value);
        else if (path === 'market' && MARKET_NAMES.indexOf(value) > -1) setMarket(value);
        else if (path === 'date') setDate(String(value ?? ''));
      }
    });
    return () => { mountedRef.current = false; };
  }, []);

  return (
    <SessionModalShell title={tr(lang, 'chartEntryTitle')} icon="ImagePlus" onClose={onClose} width={640} footer={(
      <>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" onClick={onClose}>{tr(lang, 'cancel')}</Button>
        <Button variant="primary" icon="check" onClick={submit}>{tr(lang, 'submitLabel')}</Button>
      </>
    )}>
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {previewUrl ? (
          <span style={{ position: 'relative', display: 'block', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-gold)', background: '#000' }}>
            <img src={previewUrl} alt="" style={{ display: 'block', width: '100%', height: 240, objectFit: 'cover' }} />
            <button type="button" onClick={() => fileRef.current && fileRef.current.click()} style={{ position: 'absolute', bottom: 10, insetInlineEnd: 10, height: 32, padding: '0 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.75)', color: 'var(--text-primary)', font: 'var(--type-caption)', fontSize: 11 }}>{tr(lang, 'uploadChartTitle')}</button>
          </span>
        ) : (
          <button
            type="button" onClick={() => fileRef.current && fileRef.current.click()}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, height: 200, borderRadius: 10, cursor: 'pointer', border: '1px dashed ' + (error && !file ? 'var(--danger)' : 'var(--border-gold)'), background: 'rgba(3,8,7,.5)' }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
          >
            <span style={{ color: 'rgba(244,234,215,.2)' }}><Icon name="image" size={28} /></span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'uploadPrompt')}</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { handleFile(e.target.files && e.target.files[0]); e.target.value = ''; }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={fieldLabelStyle}>{tr(lang, 'timeframeLabel')} <span style={{ color: 'var(--danger)' }}>*</span></span>
            <select value={timeframe} onChange={(e) => { setTimeframe(e.target.value); setError(''); }} style={{ ...inputStyle, borderColor: error && !timeframe ? 'var(--danger)' : 'var(--border-hairline)' }}>
              {TIMEFRAMES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={fieldLabelStyle}>{tr(lang, 'marketLabel')}</span>
            <select value={market} onChange={(e) => setMarket(e.target.value)} style={inputStyle}>
              {MARKET_NAMES.map((v) => <option key={v} value={v}>{sessionsAdapter.displayCity(v)}</option>)}
            </select>
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={fieldLabelStyle}>{tr(lang, 'dateLabel')}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </label>
        <TextAreaField label={tr(lang, 'noteOptionalLabel')} value={note} onCommit={setNote} />

        {!!scenarios.length && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={fieldLabelStyle}>{tr(lang, 'relatedScenariosLabel')}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{tr(lang, 'relatedScenariosHint')}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {scenarios.map(({ scenario }) => {
                const on = related.indexOf(scenario.id) > -1;
                return (
                  <button key={scenario.id} type="button" onClick={() => toggleRelated(scenario.id)} dir="auto" style={{ height: 30, padding: '0 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--char-accent)' : 'var(--border-hairline)'), background: on ? 'var(--char-active-surface)' : 'transparent', color: on ? 'var(--char-accent)' : 'var(--text-muted)', font: 'var(--type-caption)', fontSize: 11 }}>
                    {scenario.title || tr(lang, 'newScenarioTitle')}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>}
      </div>
    </SessionModalShell>
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

function CommandBar({ session, lang, view, onBack, onSetView, onSetInstrument }) {
  const isOpen = session.status !== 'closed';
  const [editingInstrument, setEditingInstrument] = React.useState(false);
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
        {/* Instrument Catalog domain: the real financial symbol, distinct from market/city above -
            an unclassified legacy session shows an honest placeholder, never a guessed value, but
            stays clickable so it can actually be classified (the task's own "clear edit path" for
            legacy data) rather than staying stuck unassigned forever. */}
        {editingInstrument ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <InstrumentPicker
              value={session.instrument || null}
              onChange={(code) => { setEditingInstrument(false); if (code && onSetInstrument) onSetInstrument(code); }}
              width={160}
            />
            <button type="button" onClick={() => setEditingInstrument(false)} title={tr(lang, 'cancel')} style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)' }}>
              <Icon name="close" size={14} />
            </button>
          </span>
        ) : (
          <button
            type="button" onClick={() => setEditingInstrument(true)}
            title={session.instrument ? undefined : tr(lang, 'instrumentUnassignedHint')}
            style={{ border: 0, padding: 0, background: 'transparent', cursor: 'pointer' }}
          >
            <Chip tone={session.instrument ? 'accent' : 'neutral'}>{session.instrument || tr(lang, 'instrumentUnassigned')}</Chip>
          </button>
        )}
        <Chip tone="neutral">{session.timeframe || '—'}</Chip>
        <Chip tone="neutral">{tr(lang, 'intervalChip', { n: session.updateIntervalMinutes })}</Chip>
      </span>
      <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        <span style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.6)' }}>
          {[['timeline', tr(lang, 'viewTimeline')], ['chart', tr(lang, 'viewChart')], ['report', tr(lang, 'viewReport')]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => onSetView(id)} aria-pressed={view === id} aria-label={label} title={label} style={{
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

function InvalidationTags({ lang, tags, readOnly, onChange }) {
  const [draft, setDraft] = React.useState('');
  function addTag() {
    const value = draft.trim();
    if (!value) return;
    if ((tags || []).indexOf(value) === -1) onChange((tags || []).concat([value]));
    setDraft('');
  }
  function removeTag(value) { onChange((tags || []).filter((t) => t !== value)); }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {!!(tags || []).length && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tags.map((tagValue) => (
            <span key={tagValue} dir="auto" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 6px 0 10px', borderRadius: 6, fontSize: 11, border: '1px solid color-mix(in srgb, var(--warning) 45%, transparent)', background: 'rgba(255,180,0,.08)', color: 'var(--warning)' }}>
              {tagValue}
              {!readOnly && (
                <button type="button" onClick={() => removeTag(tagValue)} aria-label={tr(lang, 'removeTagAria')} style={{ display: 'grid', placeItems: 'center', width: 16, height: 16, borderRadius: '50%', border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
                  <Icon name="close" size={10} />
                </button>
              )}
            </span>
          ))}
        </span>
      )}
      {!readOnly && (
        <span style={{ display: 'flex', gap: 6 }}>
          <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={tr(lang, 'addTagPlaceholder')} dir="auto"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            style={{ ...inputStyle, flex: 1, height: 32, fontSize: 11 }} />
          <button type="button" onClick={addTag} style={{ height: 32, padding: '0 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', font: 'var(--type-body)', fontSize: 11 }}>{tr(lang, 'addTagButton')}</button>
        </span>
      )}
    </div>
  );
}

function ScenarioEditor({ session, entry, scenario, lang, open, onToggle, onUpdate, onDelete, onToggleStage, onSetSide, character }) {
  const readOnly = session.status === 'closed';
  const prob = probabilityOf(scenario);
  const info = patternInfo(scenario);
  const plan = scenario.executionPlan || {};
  const completionPct = scenarioCompletion(scenario);
  // Instrument Catalog domain: scoped to this session's own instrument via listForInstrument() -
  // a pattern never valid for this instrument must never be offered here. No instrument known
  // yet (a legacy/unclassified session) offers nothing until it is classified.
  const registeredPatterns = window.TradeJournalPatternStore && session.instrument ? window.TradeJournalPatternStore.listForInstrument(session.instrument) : [];
  const tradeStore = window.TradeJournalTradeStore;
  const tradeUi = window.TradeJournalTradeUI;
  // Same trade this scenario's "Log Trade" button would have registered (or that a earlier
  // dashboard-side registration already linked) - mirrors the legacy enhanceSessionPositionsV2's
  // own store.findBySource(session.id, scenario.id) lookup.
  const linkedTrade = tradeStore ? tradeStore.findBySource(session.id, scenario.id) : null;
  function applyTradeUpdate(value, logType) {
    onUpdate({
      executionPlan: {
        ...plan, tradeId: value.id, positionStatus: value.status,
        entryPrices: value.entryPrice != null ? [value.entryPrice] : (plan.entryPrices || []),
        stopLoss: value.stopLoss != null ? value.stopLoss : plan.stopLoss,
        takeProfit: value.takeProfits && value.takeProfits[0] ? value.takeProfits[0].price : plan.takeProfit
      }
    }, logType || 'trade_' + value.status);
  }
  // Exact seed shape as trade-ui.js's enhanceSessionPositionsV2 launch.onclick (registerTrade):
  // direction/entry/stop/target come straight from the scenario's own action plan, linked pattern
  // carries over, and source.scenarioId is what makes findBySource(session.id, scenario.id) work.
  function logTrade() {
    const patternId = scenario.pattern && scenario.pattern.patternTagId;
    openLogWizard({
      status: 'hunting',
      direction: String(plan.positionType || 'long').toLowerCase() === 'short' ? 'short' : 'long',
      entryPrice: (plan.entryPrices || [])[0] || null,
      stopLoss: plan.stopLoss || null,
      takeProfits: plan.takeProfit ? [{ price: plan.takeProfit, portionPercent: 100 }] : [],
      linkedPatternIds: patternId ? [patternId] : [],
      // Defect #5: a trade started from this session prefills the session's own accountId (still
      // just a starting point - TradeLogModal's own Select lets the trader change it before
      // saving, same as every other AI/prefilled field in this app).
      accountId: session.accountId || null,
      // Instrument Catalog domain: a Trade sourced from this Session must carry that session's
      // own instrument - prefilled here, then locked read-only in tradeLogModal.jsx (a legacy
      // instrument-less session leaves this null; the trader must classify it before logging).
      instrument: session.instrument || null,
      source: { character, sessionId: session.id, scenarioId: scenario.id }
    }, { onSave: (value) => applyTradeUpdate(value) });
  }
  // F21-close: refs kept current every render, read from inside the useEffect-registered
  // applyValue() below instead of closing directly over onUpdate/onSetSide/scenario/
  // registeredPatterns. Found via real browser testing (manual-edit-precedence, real UI
  // interaction, not code reading): the registration effect's own deps ([scenario.id, open])
  // never change once a Scenario is created and expanded, so applyValue() stayed permanently
  // bound to whichever onUpdate/session closure existed at the FIRST render - itself ultimately
  // closing over liveSessionView's own `session` variable at that moment (persist()'s own
  // `mutator(session)` mutates that exact captured object, not a fresh read of current storage).
  // A human manually editing the description in between, then a LATER AI field edit routed
  // through this same stale applyValue(), silently reverted the manual edit: the AI's own patch
  // WAS correctly a single-key object ({evidence: ...}), but persist() saved it merged onto the
  // stale, pre-manual-edit `session` snapshot, discarding everything that changed in between.
  // Same fix pattern as StrategyDetailsTab/PatternDetailsTab's own strategyRef/patternRef - not a
  // new mechanism, the same one generalized to a component that never got it.
  const onUpdateRef = React.useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onSetSideRef = React.useRef(onSetSide);
  onSetSideRef.current = onSetSide;
  const scenarioRef = React.useRef(scenario);
  scenarioRef.current = scenario;
  const registeredPatternsRef = React.useRef(registeredPatterns);
  registeredPatternsRef.current = registeredPatterns;
  // Journey F, F37: same ref pattern as onUpdateRef above - onDelete is read from inside the
  // registration effect (deps [scenario.id, open]) via submit(), so it must never be a stale
  // mount-time closure.
  const onDeleteRef = React.useRef(onDelete);
  onDeleteRef.current = onDelete;

  // Journey H1 closure: magic-fill animation for this Scenario's own AI-fillable fields - the
  // real, existing controlled state (onUpdate/onSetSide) stays fully authoritative; this only
  // subscribes to the same shared TradeJournalAIFieldFillBus every other Journey H1 domain
  // already uses. `confirmDelete` is deliberately NOT wired here - it is a synthetic, AI-only gate
  // field with no corresponding visible control at all (the real delete icon has no confirmation
  // UI of its own to animate - see this component's own allowlist comment above), so there is
  // nothing to attach the shared effect to without inventing a new UI element, which this pass
  // deliberately does not do.
  const titleFilled = useAiFieldFill('live-session-scenario-' + scenario.id, 'title');
  const descriptionFilled = useAiFieldFill('live-session-scenario-' + scenario.id, 'description');
  const evidenceFilled = useAiFieldFill('live-session-scenario-' + scenario.id, 'evidence');
  const problemFilled = useAiFieldFill('live-session-scenario-' + scenario.id, 'problem');
  const triggerFilled = useAiFieldFill('live-session-scenario-' + scenario.id, 'trigger');
  const positionTypeFilled = useAiFieldFill('live-session-scenario-' + scenario.id, 'positionType');
  const entryPricesFilled = useAiFieldFill('live-session-scenario-' + scenario.id, 'entryPrices');
  const stopLossFilled = useAiFieldFill('live-session-scenario-' + scenario.id, 'stopLoss');
  const takeProfitFilled = useAiFieldFill('live-session-scenario-' + scenario.id, 'takeProfit');
  // patternName itself has no visible field (it's resolution-only, see the allowlist comment
  // above) - the real, visible effect of a successful resolution is the Pattern <select> below
  // changing, so the animation is attached there instead of to a non-existent "patternName" field.
  const patternNameFilled = useAiFieldFill('live-session-scenario-' + scenario.id, 'patternName');
  // 2026-08-28 bug report: probability/invalidation were never AI-fillable at all - added now,
  // same shared architecture as every other field in this component.
  const probabilityFilled = useAiFieldFill('live-session-scenario-' + scenario.id, 'probability');
  const invalidationNoteFilled = useAiFieldFill('live-session-scenario-' + scenario.id, 'invalidationNote');
  const invalidationTagsFilled = useAiFieldFill('live-session-scenario-' + scenario.id, 'invalidationTags');

  function handlePatternChange(patternId) {
    if (!patternId) { onUpdateRef.current({ pattern: null }); return; }
    const picked = registeredPatternsRef.current.find((p) => p.id === patternId);
    if (!picked) return;
    const currentScenario = scenarioRef.current;
    const keepDone = currentScenario.pattern && currentScenario.pattern.patternTagId === picked.id ? (currentScenario.pattern.completedStageIds || []) : [];
    onUpdateRef.current({ pattern: { patternTagId: picked.id, name: picked.name, stages: picked.stages, completedStageIds: keepDone, completionThreshold: picked.completionThreshold } });
  }

  // AI process registry (A4) - per-scenario id, same multi-instance reasoning as
  // sessionEntryCardsView.jsx's ScenarioCard (several ScenarioEditors can be expanded at once).
  // isOpen tracks the live `open` prop, so the effect re-registers whenever `open` changes, the
  // same "refresh on relevant prop change" shape marketplaceView.jsx's RatingsPanel already uses.
  // F37: also needs a real mountedRef, unlike this comment's own original F19/F20 reasoning
  // ("this component itself stays mounted while collapsed") - true when this was written, but
  // scenario.delete now makes deletion (hence a real unmount, once this Scenario id no longer
  // exists in entry.scenarios for the parent's own .map() to render) possible. Found via real
  // browser testing: without mountedRef, `isOpen: () => open` bakes the LAST live `open` value
  // (true, since a Scenario is normally expanded right before it's deleted) into a closure that
  // is never replaced once the component actually unmounts - registry.activeOpenProcess() then
  // treats this permanently-stale, already-deleted Scenario as the "most recently open" winner
  // forever, silently blocking activeEntryId() (hence entry.delete's own available() gate) from
  // ever resolving the parent Entry again for the rest of the page load. Same bug class already
  // found and fixed for pattern-editor-{id}/strategy-editor-{id} (switched-target safety).
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, [scenario.id]);
  React.useEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('live-session-scenario-' + scenario.id, {
      // Journey F, F20: patternName is resolution-only (never itself written - it drives
      // handlePatternChange, which already writes the real snapshot shape). Exact, case-
      // insensitive match against the same registeredPatterns list the manual Pattern picker UI
      // itself offers - zero or ambiguous matches silently do not apply, the same "never guess"
      // (F53) behavior pattern.edit/strategy.edit already established, rather than a UI-visible
      // rejection this fire-and-forget applyValue() has no channel to surface.
      // F37: 'confirmDelete' is a synthetic, AI-only field, same reasoning as trade.cancel's own
      // 'confirm' - the real delete icon here has NO window.confirm() of its own (found via
      // audit), so this gate IS the only confirmation ceremony that exists at all.
      // 2026-08-28 bug report: probability/invalidationNote/invalidationTags were never
      // AI-fillable at all - not a write bug, simply never added to the allowlist the model is
      // even told exists. Added now, same shape as every other real field here.
      allowlist: ['title', 'description', 'evidence', 'problem', 'trigger', 'positionType', 'entryPrices', 'stopLoss', 'takeProfit', 'patternName', 'probability', 'invalidationNote', 'invalidationTags', 'confirmDelete'],
      isOpen: () => mountedRef.current && open,
      submit: () => onDeleteRef.current(),
      applyValue: (path, value) => {
        if (['title', 'description', 'evidence', 'problem', 'trigger'].indexOf(path) > -1) { onUpdateRef.current({ [path]: String(value ?? '') }); return; }
        if (path === 'positionType') { onSetSideRef.current(value === 'Short' ? 'Short' : 'Long'); return; }
        if (path === 'entryPrices') {
          const freshPlan = scenarioRef.current.executionPlan || {};
          const prices = (Array.isArray(value) ? value : String(value).split(',')).map((item) => Number(String(item).trim())).filter((n) => !Number.isNaN(n));
          onUpdateRef.current({ executionPlan: { ...freshPlan, entryPrices: prices } });
          return;
        }
        if (path === 'stopLoss') { onUpdateRef.current({ executionPlan: { ...(scenarioRef.current.executionPlan || {}), stopLoss: value === '' || value == null ? null : Number(value) } }); return; }
        if (path === 'takeProfit') { onUpdateRef.current({ executionPlan: { ...(scenarioRef.current.executionPlan || {}), takeProfit: value === '' || value == null ? null : Number(value) } }); return; }
        if (path === 'patternName') {
          const wanted = String(value ?? '').trim().toLowerCase();
          if (!wanted) return;
          const matches = registeredPatternsRef.current.filter((p) => String(p.name || '').trim().toLowerCase() === wanted);
          if (matches.length === 1) handlePatternChange(matches[0].id);
          return;
        }
        // 2026-08-28 bug report: same real write the manual slider's own onChange already does
        // (probabilityHistory is an append-only log, never a bare current value - see
        // probabilityOf()'s own comment) - a later AI-set value is a genuine edit, exactly like a
        // human dragging the slider again, never blocked from changing an already-set value.
        if (path === 'probability') {
          const n = Number(value);
          if (Number.isNaN(n)) return;
          const clamped = Math.max(0, Math.min(100, n));
          onUpdateRef.current({ probabilityHistory: (scenarioRef.current.probabilityHistory || []).concat([{ value: clamped, loggedAt: new Date().toISOString() }]) }, 'probability_changed');
          return;
        }
        if (path === 'invalidationNote') { onUpdateRef.current({ invalidationNote: String(value ?? '') }); return; }
        // invalidationTags mirrors InvalidationTags' own addTag() (append, dedup by exact string,
        // never a bare replace of the whole list) - a spoken value listing more than one reason
        // ("سطح 1.2000 یا شکست حمایت") is split on commas so each becomes its own real tag, the
        // same shape a human adding them one at a time would produce, not one long unreadable tag.
        if (path === 'invalidationTags') {
          const existing = scenarioRef.current.invalidationTagIds || [];
          const additions = String(value ?? '').split(',').map((part) => part.trim()).filter((part) => part && existing.indexOf(part) === -1);
          if (!additions.length) return;
          onUpdateRef.current({ invalidationTagIds: existing.concat(additions) });
        }
      }
    });
    return undefined;
  }, [scenario.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 10, background: 'rgba(11,20,21,.55)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <button type="button" onClick={onToggle} style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', flex: 'none' }}>
          <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={14} />
        </button>
        <span dir="auto" style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scenario.title || tr(lang, 'newScenarioTitle')}</span>
        <Chip tone="neutral">{tr(lang, 'completionLabel')} {completionPct}%</Chip>
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
          <AiMagicFill active={titleFilled}><TextField label={tr(lang, 'scenarioTitleLabel')} value={scenario.title} onCommit={(v) => onUpdate({ title: v })} /></AiMagicFill>
          <AiMagicFill active={descriptionFilled}><TextAreaField label={tr(lang, 'scenarioDescLabel')} value={scenario.description} placeholder={tr(lang, 'scenarioDescPlaceholder')} onCommit={(v) => onUpdate({ description: v })} /></AiMagicFill>
          <AiMagicFill active={evidenceFilled}><TextAreaField label={tr(lang, 'evidenceLabel')} value={scenario.evidence} placeholder={tr(lang, 'evidencePlaceholder')} onCommit={(v) => onUpdate({ evidence: v })} /></AiMagicFill>

          <AiMagicFill active={patternNameFilled}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={fieldLabelStyle}>{tr(lang, 'patternTagLabel')}</span>
              <select disabled={readOnly} value={(scenario.pattern && scenario.pattern.patternTagId) || ''} onChange={(e) => handlePatternChange(e.target.value)} style={inputStyle}>
                <option value="">{tr(lang, 'noPatternOption')}</option>
                {registeredPatterns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </AiMagicFill>

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

          <AiMagicFill active={problemFilled}><TextAreaField label={tr(lang, 'problemLabel')} value={scenario.problem} placeholder={tr(lang, 'problemPlaceholder')} onCommit={(v) => onUpdate({ problem: v })} /></AiMagicFill>
          <AiMagicFill active={triggerFilled}><TextAreaField label={tr(lang, 'triggerLabel')} value={scenario.trigger} placeholder={tr(lang, 'triggerPlaceholder')} onCommit={(v) => onUpdate({ trigger: v })} /></AiMagicFill>

          <AiMagicFill active={probabilityFilled}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={fieldLabelStyle}>{tr(lang, 'probabilityLabel')}</span>
                <span className="navrya-tabular" style={{ marginInlineStart: 'auto', fontSize: 12, color: 'var(--success)' }}>{prob}%</span>
              </span>
              <input type="range" min="0" max="100" step="5" value={prob} disabled={readOnly} onChange={(e) => onUpdate({ probabilityHistory: (scenario.probabilityHistory || []).concat([{ value: Number(e.target.value), loggedAt: new Date().toISOString() }]) }, 'probability_changed')} style={{ width: '100%', accentColor: 'var(--success)', cursor: readOnly ? 'not-allowed' : 'pointer' }} />
            </label>
          </AiMagicFill>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 10, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
            <span style={fieldLabelStyle}>{tr(lang, 'planTitle')}</span>
            <AiMagicFill active={positionTypeFilled}>
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
            </AiMagicFill>
            <span style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <AiMagicFill active={entryPricesFilled}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{tr(lang, 'entryPriceLabel')}</span>
                  <input type="text" className="navrya-tabular" defaultValue={(plan.entryPrices || []).join(', ')} style={{ ...inputStyle, height: 32, fontSize: 11 }}
                    onBlur={(e) => onUpdate({ executionPlan: { ...plan, entryPrices: e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n)) } })} />
                </label>
              </AiMagicFill>
              <AiMagicFill active={stopLossFilled}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 9, color: 'var(--danger)' }}>{tr(lang, 'stopLabel')}</span>
                  <input type="text" className="navrya-tabular" defaultValue={plan.stopLoss ?? ''} style={{ ...inputStyle, height: 32, fontSize: 11 }}
                    onBlur={(e) => onUpdate({ executionPlan: { ...plan, stopLoss: e.target.value ? Number(e.target.value) : null } })} />
                </label>
              </AiMagicFill>
              <AiMagicFill active={takeProfitFilled}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 9, color: 'var(--success)' }}>{tr(lang, 'targetLabel')}</span>
                  <input type="text" className="navrya-tabular" defaultValue={plan.takeProfit ?? ''} style={{ ...inputStyle, height: 32, fontSize: 11 }}
                    onBlur={(e) => onUpdate({ executionPlan: { ...plan, takeProfit: e.target.value ? Number(e.target.value) : null } })} />
                </label>
              </AiMagicFill>
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
            {!linkedTrade ? (
              <button type="button" disabled={readOnly} onClick={logTrade} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 36, borderRadius: 8,
                cursor: readOnly ? 'not-allowed' : 'pointer', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)',
                color: 'var(--text-primary)', font: 'var(--type-body)', fontSize: 12
              }}>
                <Icon name="edit" size={14} />{tr(lang, 'logTradeAction')}
              </button>
            ) : (
              <>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Chip tone={linkedTrade.status === 'open' ? 'success' : linkedTrade.status === 'hunting' ? 'accent' : 'neutral'} dot>{statusLabel(linkedTrade.status, lang)}</Chip>
                  <span className="navrya-tabular" dir="ltr" style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>{linkedTrade.entryPrice ?? '—'}</span>
                </span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {linkedTrade.status === 'hunting' && (
                    <>
                      <button type="button" onClick={() => applyTradeUpdate(tradeStore.updateStatus(linkedTrade.id, 'open'))} style={{ height: 30, padding: '0 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--text-primary)', font: 'var(--type-caption)', fontSize: 10 }}>{window.TradeJournalTradeI18n.t('markOpen')}</button>
                      <button type="button" onClick={() => applyTradeUpdate(tradeStore.updateStatus(linkedTrade.id, 'cancelled'))} style={{ height: 30, padding: '0 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', font: 'var(--type-caption)', fontSize: 10 }}>{window.TradeJournalTradeI18n.t('cancelTrade')}</button>
                    </>
                  )}
                  {linkedTrade.status === 'open' && (
                    <>
                      <button type="button" onClick={() => tradeUi && tradeUi.openEmotion(linkedTrade.id, 'mid_trade')} style={{ height: 30, padding: '0 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(214,175,107,.08)', color: 'var(--gold-warm)', font: 'var(--type-caption)', fontSize: 10 }}>{tr(lang, 'logEmotionShort')}</button>
                      <button type="button" onClick={() => tradeUi && tradeUi.closeTrade(linkedTrade.id, (saved) => applyTradeUpdate(saved))} style={{ height: 30, padding: '0 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--text-primary)', font: 'var(--type-caption)', fontSize: 10 }}>{tr(lang, 'closeAction2')}</button>
                    </>
                  )}
                  <button type="button" onClick={() => tradeUi && tradeUi.viewTrade(linkedTrade.id)} style={{ height: 30, padding: '0 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'transparent', color: 'var(--text-dim)', font: 'var(--type-caption)', fontSize: 10 }}>{tr(lang, 'viewAction')}</button>
                </span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--warning)' }}><Icon name="TriangleAlert" size={12} />{tr(lang, 'invalidationLabel')}</span>
            <AiMagicFill active={invalidationTagsFilled}>
              <InvalidationTags lang={lang} tags={scenario.invalidationTagIds} readOnly={readOnly} onChange={(tags) => onUpdate({ invalidationTagIds: tags })} />
            </AiMagicFill>
            <AiMagicFill active={invalidationNoteFilled}>
              <TextAreaField label={tr(lang, 'invalidationNoteLabel')} value={scenario.invalidationNote} placeholder={tr(lang, 'invalidationNotePlaceholder')} onCommit={(v) => onUpdate({ invalidationNote: v })} />
            </AiMagicFill>
          </div>

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

function EntryDetailPanel({ session, entry, index, lang, imageUrl, openScenarios, onNote, onDeleteEntry, onAttachImage, onAnalyze, onOpenSessionAnalysis, onScenarioToggle, onScenarioUpdate, onScenarioDelete, onScenarioStage, onScenarioSide, onAddScenario, character }) {
  const kindMeta = kindInfo(lang)[entry.type] || kindInfo(lang).chart;
  const fileRef = React.useRef(null);
  const note = entry.type === 'movement' ? entry.movementNote : entry.note;

  // AI process registry (A4) - mountedRef template. The parent renders this with key={entry.id}
  // (LiveSessionView, above), so React genuinely remounts a fresh instance per selected entry -
  // only one is ever shown at a time here, unlike ScenarioEditor above.
  const mountedRef = React.useRef(true);
  // Journey F, F37: 'confirmDelete' - same synthetic-gate reasoning as ScenarioEditor above; the
  // real delete button here also has no window.confirm() of its own.
  const onDeleteEntryRef = React.useRef(onDeleteEntry);
  onDeleteEntryRef.current = onDeleteEntry;
  // Journey H1 closure: magic-fill animation for this Entry's own AI-fillable field. Same
  // 'confirmDelete' exception as ScenarioEditor above - no visible confirmation control exists to
  // attach the shared effect to.
  const noteFilled = useAiFieldFill('live-session-entry-' + entry.id, 'note');
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('live-session-entry-' + entry.id, {
      allowlist: ['note', 'confirmDelete'],
      isOpen: () => mountedRef.current,
      submit: () => onDeleteEntryRef.current(entry),
      applyValue: (path, value) => { if (path === 'note') onNote(entry, String(value ?? '')); }
    });
    return () => { mountedRef.current = false; };
  }, [entry.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel variant="base" ornament padding={0}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
        <span className="navrya-tabular" style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 6, background: 'var(--char-active-surface)', border: '1px solid var(--char-accent)', color: 'var(--char-accent)', fontSize: 12, fontWeight: 700, flex: 'none' }}>{index}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-primary)', flex: 'none' }}><Icon name={kindMeta.icon} size={16} /><span style={{ fontSize: 13, fontWeight: 600 }}>{kindMeta.label}</span></span>
        <Chip tone="neutral">{entryTimeLabel(entry, lang)}</Chip>
        <Chip tone="neutral">{[sessionsAdapter.displayCity(entry.market || entry.tradingSession || session.market), entry.timeframe || session.timeframe].filter(Boolean).join(' · ')}</Chip>
        <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <Button variant="secondary" size="sm" icon="sparkle" onClick={onOpenSessionAnalysis}>{tr(lang, 'aiAnalyzeButton')}</Button>
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
          <AiMagicFill active={noteFilled}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-muted)' }}><Icon name="edit" size={14} />{tr(lang, 'noteLabel')}</span>
              <textarea defaultValue={note || ''} placeholder={tr(lang, 'notePlaceholder')} dir="auto" style={{ ...textareaStyle, minHeight: 74, padding: '10px 12px' }}
                onBlur={(e) => { if (e.target.value !== (note || '')) onNote(entry, e.target.value); }} />
            </label>
          </AiMagicFill>
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
              character={character}
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

function DashboardPatternRow({ lang, x, entryN, readOnly, onSelectEntry, onToggleStage }) {
  const info = patternInfo(x.scenario);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 10, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
      <button type="button" onClick={() => onSelectEntry(x.entry.id)} style={{ textAlign: 'start', display: 'flex', flexDirection: 'column', gap: 7, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', width: '100%' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <span dir="auto" style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.scenario.pattern.name || tr(lang, 'noPatternTag')}</span>
          <span className="navrya-tabular" style={{ fontSize: 11, color: 'var(--char-accent)' }}>{info.pct}%</span>
        </span>
        <span style={{ display: 'block', width: '100%', height: 5, borderRadius: 3, background: 'rgba(244,234,215,.08)', overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', borderRadius: 3, background: 'var(--char-accent)', width: info.pct + '%' }}></span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
          <span dir="auto" style={{ fontSize: 10, color: 'var(--text-dim)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.scenario.title || tr(lang, 'newScenarioTitle')}</span>
          <span className="navrya-tabular" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{tr(lang, 'dashEntryPrefix')} {entryN}</span>
        </span>
      </button>
      {info.pattern && !!info.pattern.stages.length && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {info.pattern.stages.map((stage) => {
            const done = (info.pattern.completedStageIds || []).indexOf(stage.id) > -1;
            return (
              <button key={stage.id} type="button" disabled={readOnly} onClick={() => onToggleStage(x.entry, x.scenario, stage)} style={{
                display: 'flex', alignItems: 'center', gap: 5, height: 24, padding: '0 7px', borderRadius: 6, cursor: readOnly ? 'not-allowed' : 'pointer',
                font: 'var(--type-caption)', fontSize: 10,
                border: '1px solid ' + (done ? 'color-mix(in srgb, var(--success) 55%, transparent)' : 'var(--border-hairline)'),
                background: done ? 'rgba(46,204,113,.1)' : 'transparent', color: done ? 'var(--success)' : 'var(--text-dim)'
              }}>
                {done ? <Icon name="check" size={11} /> : <span style={{ width: 8, height: 8, borderRadius: '50%', border: '1px solid currentColor', display: 'block' }}></span>}
                {stage.index} · {stage.label}
              </button>
            );
          })}
        </span>
      )}
    </div>
  );
}

function DashboardScenarioRow({ lang, x, entryN, readOnly, onSelectEntry, onProbabilityChange }) {
  const prob = probabilityOf(x.scenario);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 10, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
      <button type="button" onClick={() => onSelectEntry(x.entry.id)} style={{ textAlign: 'start', display: 'flex', flexDirection: 'column', gap: 6, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', width: '100%' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <span dir="auto" style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.scenario.title || tr(lang, 'newScenarioTitle')}</span>
          <span className="navrya-tabular" style={{ fontSize: 11, color: 'var(--char-accent)' }}>{prob}%</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
          <span dir="auto" style={{ fontSize: 10, color: 'var(--text-dim)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.scenario.occurred ? tr(lang, 'occurredYesShort') : tr(lang, 'pendingShort')}</span>
          <span className="navrya-tabular" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{tr(lang, 'dashEntryPrefix')} {entryN}</span>
        </span>
      </button>
      <input type="range" min="0" max="100" step="5" value={prob} disabled={readOnly}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onProbabilityChange(x.entry, x.scenario, Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--success)', cursor: readOnly ? 'not-allowed' : 'pointer' }} />
    </div>
  );
}

function PositionRow({ trade, lang }) {
  const tradeUi = window.TradeJournalTradeUI;
  const tradeStore = window.TradeJournalTradeStore;
  const ti = window.TradeJournalTradeI18n;
  const tp = trade.takeProfits && trade.takeProfits[0] ? trade.takeProfits[0].price : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: 10, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: trade.direction === 'short' ? 'var(--danger)' : 'var(--char-accent)', flex: 1, minWidth: 0 }}>{ti ? ti.t(trade.direction) : trade.direction}</span>
        <Chip tone={trade.status === 'open' ? 'success' : 'accent'} dot>{statusLabel(trade.status, lang)}</Chip>
      </div>
      <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{tr(lang, 'entryPriceLabel')}</span>
          <span className="navrya-tabular" style={{ fontSize: 11, color: 'var(--text-primary)' }}>{trade.entryPrice ?? '—'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{tr(lang, 'stopLabel')}</span>
          <span className="navrya-tabular" style={{ fontSize: 11, color: 'var(--danger)' }}>{trade.stopLoss ?? '—'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>{tr(lang, 'targetLabel')}</span>
          <span className="navrya-tabular" style={{ fontSize: 11, color: 'var(--success)' }}>{tp ?? '—'}</span>
        </div>
      </div>
      <span className="navrya-tabular" dir="ltr" style={{ fontSize: 10, color: 'var(--gold-warm)' }}>{(trade.rr ? '1:' + trade.rr : '—') + ' ' + tr(lang, 'rrShort') + ' · ' + (trade.leverage ? trade.leverage + '×' : '—') + ' ' + tr(lang, 'leverageShort')}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {/* A hunting trade was never actually opened - it has no entry fill to close, only a
            plan to either activate (open) or abandon (cancel). Mirrors the same branching
            ScenarioEditor's own linked-trade card already uses (see applyTradeUpdate above). */}
        {trade.status === 'hunting' ? (
          <>
            <button type="button" onClick={() => tradeStore && tradeStore.updateStatus(trade.id, 'open')} style={{ flex: 1, height: 28, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--text-primary)', font: 'var(--type-caption)', fontSize: 10 }}>{ti ? ti.t('markOpen') : ''}</button>
            <button type="button" onClick={() => tradeStore && tradeStore.updateStatus(trade.id, 'cancelled')} style={{ flex: 1, height: 28, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', font: 'var(--type-caption)', fontSize: 10 }}>{ti ? ti.t('cancelTrade') : ''}</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => tradeUi && tradeUi.openEmotion(trade.id, 'mid_trade')} style={{ flex: 1, height: 28, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(214,175,107,.08)', color: 'var(--gold-warm)', font: 'var(--type-caption)', fontSize: 10 }}>{tr(lang, 'logEmotionShort')}</button>
            <button type="button" onClick={() => tradeUi && tradeUi.closeTrade(trade.id)} style={{ flex: 1, height: 28, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--text-primary)', font: 'var(--type-caption)', fontSize: 10 }}>{tr(lang, 'closeAction2')}</button>
          </>
        )}
        <button type="button" onClick={() => tradeUi && tradeUi.viewTrade(trade.id)} aria-label={tr(lang, 'viewAction')} style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'transparent', color: 'var(--text-dim)' }}><Icon name="eye" size={13} /></button>
      </div>
    </div>
  );
}

function DashboardPanel({ session, lang, dash, onSetDash, indexById, onSelectEntry, onToggleStage, onProbabilityChange, openPositions, onLogTrade }) {
  const readOnly = session.status === 'closed';
  const flat = flatScenarios(session);
  const patternRows = dash === 'patterns' ? flat.filter((x) => x.scenario.pattern) : [];
  const scenarioRows = dash === 'scenarios' ? flat : [];
  // Every real open/hunting trade for this character (see LiveSessionView's own openPositions -
  // "all open trades should be visible in the session dashboard", including ones carried over
  // from an earlier session), not only trades that trace back to a scenario in this one.
  const positionRows = dash === 'positions' ? (openPositions || []) : [];
  // Log tab shows the session's real activityLog (session-workspace-logic.js's log()) - every
  // scenario/stage/note/position edit already writes an entry here; this just surfaces it.
  const logRows = dash === 'log' ? (session.activityLog || []).slice().reverse().slice(0, 60) : [];
  const emptyText = { patterns: tr(lang, 'dashEmptyPatterns'), scenarios: tr(lang, 'dashEmptyScenarios'), positions: tr(lang, 'noOpenPositions'), log: tr(lang, 'dashEmptyLog') }[dash];
  const isEmpty = dash === 'log' ? logRows.length === 0 : dash === 'patterns' ? patternRows.length === 0 : dash === 'scenarios' ? scenarioRows.length === 0 : positionRows.length === 0;
  return (
    <Panel variant="base" padding="14px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="dashboard" size={16} /><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'dashboardTitle')}</span>
          {dash === 'positions' && (
            <button type="button" onClick={onLogTrade} style={{ marginInlineStart: 'auto', height: 26, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--text-primary)', font: 'var(--type-caption)', fontSize: 10 }}>
              <Icon name="edit" size={12} />{tr(lang, 'logTradeAction')}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)' }}>
          {[['patterns', tr(lang, 'dashPatterns')], ['scenarios', tr(lang, 'dashScenarios')], ['positions', tr(lang, 'dashPositions')], ['log', tr(lang, 'dashLog')]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => onSetDash(id)} style={{ flex: 1, height: 30, borderRadius: 6, cursor: 'pointer', font: 'var(--type-body)', fontSize: 11, border: '1px solid ' + (dash === id ? 'var(--char-accent)' : 'transparent'), background: dash === id ? 'var(--char-active-surface)' : 'transparent', color: dash === id ? 'var(--char-accent)' : 'var(--text-dim)' }}>{label}</button>
          ))}
        </div>
        {isEmpty ? (
          <span style={{ padding: '14px 10px', textAlign: 'center', fontSize: 11, color: 'var(--text-dim)' }}>{emptyText}</span>
        ) : dash === 'log' ? (
          logRows.map((entry) => (
            <div key={entry.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
              <span dir="auto" style={{ fontSize: 11, color: 'var(--text-primary)' }}>{entry.detail || entry.type}</span>
              <span className="navrya-tabular" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{new Date(entry.loggedAt).toLocaleTimeString(localeCode(lang), { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))
        ) : dash === 'patterns' ? (
          patternRows.map((x) => <DashboardPatternRow key={x.scenario.id} lang={lang} x={x} entryN={indexById[x.entry.id]} readOnly={readOnly} onSelectEntry={onSelectEntry} onToggleStage={onToggleStage} />)
        ) : dash === 'scenarios' ? (
          scenarioRows.map((x) => <DashboardScenarioRow key={x.scenario.id} lang={lang} x={x} entryN={indexById[x.entry.id]} readOnly={readOnly} onSelectEntry={onSelectEntry} onProbabilityChange={onProbabilityChange} />)
        ) : positionRows.map((trade) => <PositionRow key={trade.id} trade={trade} lang={lang} />)}
      </div>
    </Panel>
  );
}

function PrevSummaryPanel({ session, lang }) {
  const all = window.TradeJournalWorkspace ? window.TradeJournalWorkspace.list() : [];
  // Instrument Catalog domain: "previous session" means the true chronological previous session
  // with the EXACT SAME instrument - fail closed to no candidate (never another session just
  // because it happens to be next in the list) whenever this session has no instrument yet, or
  // no earlier session shares it. This is the concrete "never show a BTC summary while viewing an
  // XAU session" guarantee.
  const currentTime = sessionsAdapter.sessionTimestamp(session);
  const candidates = session.instrument
    ? all.filter((s) => s.id !== session.id && s.instrument === session.instrument && sessionsAdapter.sessionTimestamp(s) < currentTime)
      .sort((a, b) => sessionsAdapter.sessionTimestamp(b) - sessionsAdapter.sessionTimestamp(a))
    : [];
  const prev = candidates[0] || null;
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

// Phase 8a of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section) - reads/writes through window.TradeJournalUserPreferences (the generic
// {user_id, pref_key -> value} replica-backed store), not localStorage. Synchronous read is safe
// here the same way it was for the raw localStorage read this replaces: this panel only ever
// mounts once a Live Session is opened, well after the app's own boot gate
// (TradeJournalServerReplica.allReady()) has already resolved.
function SimilarSessionsPanel({ session, character, lang }) {
  const [threshold, setThreshold] = React.useState(() => {
    const prefs = window.TradeJournalUserPreferences;
    const value = prefs ? prefs.getPref('similarityThreshold', 70) : 70;
    return typeof value === 'number' && Number.isFinite(value) ? value : 70;
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
            if (window.TradeJournalUserPreferences) window.TradeJournalUserPreferences.setPref('similarityThreshold', v);
          }} style={{ boxSizing: 'border-box', width: 64, height: 32, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.6)', color: 'var(--text-primary)', font: 'var(--type-body)', fontSize: 12, textAlign: 'center', outline: 'none' }} />
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>%</span>
        </label>
        {!matches || !matches.length ? (
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.8, color: 'var(--text-dim)' }}>{tr(lang, 'similarEmpty')}</p>
        ) : matches.map((m) => (
          <div key={m.sessionId} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1, minWidth: 0 }}>{[m.instrument, m.market, m.date].filter(Boolean).join(' · ')}</strong>
              <span className="navrya-tabular" style={{ fontSize: 11, color: m.similarity >= threshold ? 'var(--success)' : 'var(--text-muted)' }}>{m.similarity}%</span>
            </span>
            {m.fateSummaryText && <span dir="auto" style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6 }}>{m.fateSummaryText}</span>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

// TradingView's free hosted "Advanced Chart" widget script. Self-hosted by TradingView, no API
// key/npm package/backend endpoint required (documented by TradingView as the free "Advanced
// Chart" widget).
const TV_ADVANCED_CHART_SCRIPT_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

// Renders the official Advanced Chart widget for one resolved TradingView symbol/interval pair.
// Built entirely with DOM APIs inside useEffect (no dangerouslySetInnerHTML) so the container is
// always torn down and rebuilt from scratch on every symbol/interval/lang change or unmount -
// the widget script only ever knows how to build a fresh chart against its own script tag, it has
// no "update in place" API, so leaving a stale container behind would duplicate widgets/scripts.
function TradingViewAdvancedChart({ symbol, interval, lang, fill }) {
  const hostRef = React.useRef(null);
  const [status, setStatus] = React.useState('loading'); // 'loading' | 'loaded' | 'error'

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setStatus('loading');
    while (host.firstChild) host.removeChild(host.firstChild);

    const container = document.createElement('div');
    container.className = 'tradingview-widget-container';
    container.style.height = '100%';
    container.style.width = '100%';

    const widgetHost = document.createElement('div');
    widgetHost.className = 'tradingview-widget-container__widget';
    widgetHost.style.height = 'calc(100% - 28px)';
    widgetHost.style.width = '100%';
    container.appendChild(widgetHost);

    // Explicit, always-visible TradingView attribution link - required by TradingView's own
    // embed terms and never to be hidden/removed/obscured. Additive to whatever attribution the
    // widget itself renders inside the chart it builds.
    const copyright = document.createElement('div');
    copyright.className = 'tradingview-widget-copyright';
    copyright.style.cssText = 'padding:6px 2px 0;text-align:center;';
    const copyrightLink = document.createElement('a');
    copyrightLink.href = 'https://www.tradingview.com/';
    copyrightLink.rel = 'noopener nofollow';
    copyrightLink.target = '_blank';
    copyrightLink.style.cssText = 'color:var(--text-dim);font-size:11px;text-decoration:none;';
    copyrightLink.textContent = tr(lang, 'tvAttribution');
    copyright.appendChild(copyrightLink);
    container.appendChild(copyright);

    host.appendChild(container);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: tradingViewLocaleFor(lang),
      allow_symbol_change: true,
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      withdateranges: true,
      save_image: false,
      support_host: 'https://www.tradingview.com'
    });
    script.onload = () => setStatus('loaded');
    script.onerror = () => setStatus('error');
    // src is set last so onload/onerror (attached above) can never race the browser's own load
    // event for a script inserted with a src already present.
    script.src = TV_ADVANCED_CHART_SCRIPT_SRC;
    container.appendChild(script);

    return () => { while (host.firstChild) host.removeChild(host.firstChild); };
  }, [symbol, interval, lang]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div ref={hostRef} dir="ltr" style={{ width: '100%', height: fill ? 'calc(100vh - 84px)' : 'clamp(360px, 64vh, 680px)' }} />
      {status === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-dim)', fontSize: 12, background: 'rgba(3,8,7,.5)', pointerEvents: 'none' }}>
          <Icon name="LoaderCircle" size={16} />{tr(lang, 'chartLoadingText')}
        </div>
      )}
      {status === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 16, background: 'rgba(3,8,7,.85)' }}>
          <Icon name="AlertTriangle" size={20} />
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'chartLoadErrorTitle')}</span>
          <span>{tr(lang, 'chartLoadErrorBody')}</span>
        </div>
      )}
    </div>
  );
}

// Polished localized empty state for a session with no instrument set at all - the only case
// tradingViewSymbolFor() can't resolve into some real chart. A real, unmapped instrument now
// still opens a real chart (see tradingViewSymbolFor()'s fallback above), so this never fires for
// an instrument that merely isn't in the curated map any more.
function ChartUnmappedNotice({ lang }) {
  return (
    <Panel variant="base" ornament padding="40px 24px">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <span style={{ color: 'rgba(244,234,215,.18)' }}><Icon name="CandlestickChart" size={30} /></span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'chartUnmappedTitle')}</span>
        <span dir="auto" style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 420 }}>{tr(lang, 'chartUnmappedBodyNoInstrument')}</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 420 }}>{tr(lang, 'chartUnmappedHint')}</span>
      </div>
    </Panel>
  );
}

// Grabs one current frame from a live MediaStream as a CanvasImageSource (an ImageBitmap where
// the ImageCapture API exists - Chromium - otherwise a <video>-element fallback for broader
// engine support). Used only by MarketChartView's screenshot capture below.
function grabStreamFrame(stream) {
  if (typeof ImageCapture !== 'undefined') {
    const track = stream.getVideoTracks()[0];
    return new ImageCapture(track).grabFrame();
  }
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play().then(() => {
        requestAnimationFrame(() => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext('2d').drawImage(video, 0, 0);
          resolve(canvas);
        });
      }).catch(reject);
    };
    video.onerror = () => reject(new Error('video capture element failed'));
  });
}

// Third CommandBar view, beside Timeline and Session report - a full TradingView chart for this
// Session's real instrument/timeframe. session.instrument is the only source read for the symbol
// (never session.market/city); session.market/city is only ever a city/session-timezone concept.
// The starting symbol is a best-effort resolution (tradingViewSymbolFor()) - the trader can
// always pick a different market themselves from inside the chart via allow_symbol_change.
//
// onAddChart/onLogMove mirror the exact same Timeline-cockpit actions (real product feedback:
// the trader wants to log a chart/movement entry without leaving the chart they are looking at).
// Fullscreen uses the standard Fullscreen API on wrapRef - only this panel goes fullscreen, never
// the whole page - so the header row (title/buttons) stays visible above the enlarged chart.
//
// Screenshot capture (user's explicit choice over TradingView's own native export, see
// docs/HANDOFF.md): the free widget renders in a cross-origin iframe with no way for this page's
// own JS to read its pixels directly, so both "Add chart" and "Log movement" instead use the
// browser's own tab-capture API (navigator.mediaDevices.getDisplayMedia) - real product feedback:
// whichever button the trader presses from this panel should attach the exact chart it is
// currently showing. The permission is requested once (a real, unavoidable browser dialog - the
// trader should keep "This Tab" selected) and the resulting MediaStream is kept alive in
// captureStreamRef for the rest of this Live Session visit, so every later click (either button)
// grabs a fresh frame silently, with no further prompts, until the trader stops sharing (the
// track's own 'ended' event) or leaves the session. A denied/unsupported/failed capture never
// blocks logging an entry - onAddChart(null)/onLogMove(null) still complete the same action
// (the modal's normal empty, manually-uploadable dropzone; a movement entry with no image) that
// clicking either button already did before this capture existed.
function MarketChartView({ session, lang, onAddChart, onLogMove }) {
  const symbol = tradingViewSymbolFor(session.instrument);
  const wrapRef = React.useRef(null);
  const chartElRef = React.useRef(null);
  const captureStreamRef = React.useRef(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [capturing, setCapturing] = React.useState(false);
  const [captureError, setCaptureError] = React.useState('');

  React.useEffect(() => {
    function onChange() { setIsFullscreen(!!document.fullscreenElement && document.fullscreenElement === wrapRef.current); }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Release the OS-level "sharing this tab" indicator when the trader finally leaves the whole
  // Live Session (this component only ever unmounts then, per the persistence fix above).
  React.useEffect(() => () => {
    const stream = captureStreamRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    const el = wrapRef.current;
    if (el && el.requestFullscreen) el.requestFullscreen();
  }

  async function ensureCaptureStream() {
    const existing = captureStreamRef.current;
    if (existing && existing.getVideoTracks()[0] && existing.getVideoTracks()[0].readyState === 'live') return existing;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return null;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' }, preferCurrentTab: true, selfBrowserSurface: 'include', audio: false
    });
    const track = stream.getVideoTracks()[0];
    if (track) track.addEventListener('ended', () => { if (captureStreamRef.current === stream) captureStreamRef.current = null; });
    captureStreamRef.current = stream;
    return stream;
  }

  // Shared by both "Add chart" and "Log movement" (real product request: whichever one is
  // pressed from the Market chart panel should attach the chart image it is currently showing) -
  // returns a File on success or null on any failure/denial, never throwing.
  async function captureChartScreenshot() {
    setCaptureError('');
    setCapturing(true);
    let file = null;
    try {
      const stream = await ensureCaptureStream();
      if (!stream) {
        setCaptureError(tr(lang, 'chartCaptureUnsupported'));
      } else {
        // getDisplayMedia only ever captures what is currently painted on screen - a chart
        // panel taller than the visible viewport (a real, observed case: CommandBar/PulseBand
        // push it far enough down that the panel's own bottom can be scrolled out of view) would
        // otherwise have its off-screen portion silently missing from the captured frame. Scroll
        // it fully into view first (a no-op if it's already visible), then wait one frame
        // interval for the resulting repaint to actually reach the capture stream.
        if (chartElRef.current && chartElRef.current.scrollIntoView) {
          chartElRef.current.scrollIntoView({ block: 'nearest' });
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        const frame = await grabStreamFrame(stream);
        const el = chartElRef.current;
        const rect = el ? el.getBoundingClientRect() : null;
        // Clamp to the real, currently-visible viewport too - a safety net for the rare case the
        // chart is still taller than the viewport even after scrollIntoView (e.g. a very short
        // browser window), so the crop can never request pixels the stream never actually
        // captured, which would otherwise leave blank space in the result.
        const visLeft = rect ? Math.max(0, rect.left) : 0;
        const visTop = rect ? Math.max(0, rect.top) : 0;
        const visWidth = rect ? Math.min(window.innerWidth, rect.left + rect.width) - visLeft : 0;
        const visHeight = rect ? Math.min(window.innerHeight, rect.top + rect.height) - visTop : 0;
        if (visWidth > 0 && visHeight > 0) {
          const scaleX = frame.width / window.innerWidth;
          const scaleY = frame.height / window.innerHeight;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(visWidth * scaleX));
          canvas.height = Math.max(1, Math.round(visHeight * scaleY));
          canvas.getContext('2d').drawImage(
            frame, visLeft * scaleX, visTop * scaleY, visWidth * scaleX, visHeight * scaleY,
            0, 0, canvas.width, canvas.height
          );
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
          if (blob) file = new File([blob], 'market-chart-' + Date.now() + '.png', { type: 'image/png' });
        }
        if (!file) setCaptureError(tr(lang, 'chartCaptureFailed'));
      }
    } catch (_) {
      // Includes the trader cancelling/denying the browser's own share-tab prompt.
      setCaptureError(tr(lang, 'chartCapturePermissionDenied'));
    }
    setCapturing(false);
    return file;
  }

  async function handleAddChartClick() {
    const file = await captureChartScreenshot();
    onAddChart(file);
  }

  async function handleLogMoveClick() {
    const file = await captureChartScreenshot();
    onLogMove(file);
  }

  if (!symbol) return <ChartUnmappedNotice lang={lang} />;
  const interval = tradingViewIntervalFor(session.timeframe);
  return (
    <div ref={wrapRef} style={isFullscreen ? { height: '100vh', background: 'var(--ink-950)' } : undefined}>
      <Panel variant="base" ornament padding="16px" style={isFullscreen ? { borderRadius: 0, height: '100%' } : undefined}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="CandlestickChart" size={18} /><span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'viewChart')}</span>
            <span className="navrya-tabular" dir="ltr" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{symbol} · {session.timeframe || interval}</span>
            {captureError && <span dir="auto" style={{ fontSize: 11, color: 'var(--danger)' }}>{captureError}</span>}
            <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button variant="secondary" size="sm" icon={capturing ? 'LoaderCircle' : 'Activity'} disabled={capturing} title={tr(lang, 'chartCaptureHint')} onClick={handleLogMoveClick}>{tr(lang, 'addMove')}</Button>
              <Button variant="primary" size="sm" icon={capturing ? 'LoaderCircle' : 'ImagePlus'} disabled={capturing} title={tr(lang, 'chartCaptureHint')} onClick={handleAddChartClick}>{tr(lang, 'addChart')}</Button>
              <button
                type="button" onClick={toggleFullscreen}
                title={tr(lang, isFullscreen ? 'exitFullscreenChart' : 'enterFullscreenChart')}
                aria-label={tr(lang, isFullscreen ? 'exitFullscreenChart' : 'enterFullscreenChart')}
                style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)' }}
              >
                <Icon name={isFullscreen ? 'Minimize2' : 'Maximize2'} size={16} />
              </button>
            </span>
          </div>
          <div ref={chartElRef}>
            <TradingViewAdvancedChart symbol={symbol} interval={interval} lang={lang} fill={isFullscreen} />
          </div>
        </div>
      </Panel>
    </div>
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

// Session fate, step 1 - the final chart entry that closes the session. Ported from
// session-entry-flow.js's openEntry(api, session, 'fate'): same real required-image rule
// (required=type!=='movement', so fate needs one too), same fields, same close-on-submit
// behaviour (status/closedAt/finalEntryId) before handing off to the real summary step.
function FateEntryModal({ session, lang, onClose, onSubmit }) {
  const rtl = lang === 'fa' || lang === 'ar';
  const [file, setFile] = React.useState(null);
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [timeframe, setTimeframe] = React.useState(session.timeframe || '5m');
  const [market, setMarket] = React.useState(session.market || 'London');
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState('');
  const fileRef = React.useRef(null);

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f); setPreviewUrl(URL.createObjectURL(f)); setError('');
  }
  function submit() {
    if (!file) { setError(tr(lang, 'uploadRequired')); return; }
    onSubmit({ file, timeframe, market, note });
  }

  // AI process registry (A4) - mountedRef template. Only mounted while fateStep === 'entry'
  // (LiveSessionView, below).
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('live-session-fate-entry', {
      allowlist: ['note', 'timeframe', 'market'],
      isOpen: () => mountedRef.current,
      applyValue: (path, value) => {
        if (path === 'note') setNote(String(value ?? ''));
        else if (path === 'timeframe' && TIMEFRAMES.indexOf(value) > -1) setTimeframe(value);
        else if (path === 'market' && MARKET_NAMES.indexOf(value) > -1) setMarket(value);
      }
    });
    return () => { mountedRef.current = false; };
  }, []);

  return (
    <SessionModalShell title={tr(lang, 'fateStep1Title')} icon="Flag" onClose={onClose} width={600} footer={(
      <>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" onClick={onClose}>{tr(lang, 'cancel')}</Button>
        <Button variant="primary" icon="Flag" onClick={submit}>{tr(lang, 'fateSubmit')}</Button>
      </>
    )}>
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {previewUrl ? (
          <span style={{ position: 'relative', display: 'block', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-gold)', background: '#000' }}>
            <img src={previewUrl} alt="" style={{ display: 'block', width: '100%', height: 220, objectFit: 'cover' }} />
            <button type="button" onClick={() => fileRef.current && fileRef.current.click()} style={{ position: 'absolute', bottom: 10, insetInlineEnd: 10, height: 32, padding: '0 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.75)', color: 'var(--text-primary)', font: 'var(--type-caption)', fontSize: 11 }}>{tr(lang, 'uploadChartTitle')}</button>
          </span>
        ) : (
          <button
            type="button" onClick={() => fileRef.current && fileRef.current.click()}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, height: 190, borderRadius: 10, cursor: 'pointer', border: '1px dashed ' + (error ? 'var(--danger)' : 'var(--border-gold)'), background: 'rgba(3,8,7,.5)' }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
          >
            <span style={{ color: 'rgba(244,234,215,.2)' }}><Icon name="image" size={26} /></span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'uploadFinalTitle')}</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { handleFile(e.target.files && e.target.files[0]); e.target.value = ''; }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={fieldLabelStyle}>{tr(lang, 'timeframeLabel')}</span>
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={inputStyle}>{TIMEFRAMES.map((v) => <option key={v} value={v}>{v}</option>)}</select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={fieldLabelStyle}>{tr(lang, 'marketLabel')}</span>
            <select value={market} onChange={(e) => setMarket(e.target.value)} style={inputStyle}>{MARKET_NAMES.map((v) => <option key={v} value={v}>{sessionsAdapter.displayCity(v)}</option>)}</select>
          </label>
        </div>
        <TextAreaField label={tr(lang, 'noteOptionalLabel')} value={note} onCommit={setNote} />
        {error && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>}
      </div>
    </SessionModalShell>
  );
}

function DirectionPicker({ label, value, onChange, lang }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={fieldLabelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {[['up', tr(lang, 'dirUp'), 'var(--success)'], ['down', tr(lang, 'dirDown'), 'var(--danger)'], ['flat', tr(lang, 'dirFlat'), 'var(--text-muted)']].map(([id, text, color]) => (
          <button key={id} type="button" onClick={() => onChange(id)} style={{ flex: 1, height: 36, borderRadius: 6, cursor: 'pointer', font: 'var(--type-body)', fontSize: 12, border: '1px solid ' + (value === id ? color : 'var(--border-hairline)'), background: value === id ? 'color-mix(in srgb, ' + color + ' 14%, transparent)' : 'transparent', color: value === id ? color : 'var(--text-muted)' }}>{text}</button>
        ))}
      </div>
    </div>
  );
}

// Session fate, step 2 - the real whole-session summary. Ported from session-entry-flow.js's
// openFateSummary(): move-strength/spike direction, an optional note, and the real
// makeSessionAnalysis() computed from this session's own entries/scenarios/patterns - not an
// external AI call, matching the legacy flow's own "local-demo" provider exactly. Saves
// session.fateSummary (+ previousSessionSummary, so the NEXT session's own "previous session"
// panel picks it up for real).
function FateSummaryModal({ session, lang, onClose, onSave }) {
  const rtl = lang === 'fa' || lang === 'ar';
  const [moveStrength, setMoveStrength] = React.useState('');
  const [spike, setSpike] = React.useState('');
  const [note, setNote] = React.useState('');
  const [analysis, setAnalysis] = React.useState(session.aiSessionAnalysisResult || null);
  // The one-shot inline "AI Analysis" card below used to generate a local demo analysis directly
  // (setLoading/setAnalysis via a fake 250ms timer) - both its entry points now open the real
  // Session AI Analysis popup instead (sessionAiAnalysisModal.jsx: user view, model/profile
  // selection, adherence, a real generating sequence). `analysis` itself is kept, unchanged, as
  // save()'s own fallback below and as the seed for a session reopened with a prior result -
  // only the old immediate-generate path is retired.
  const [aiPopupOpen, setAiPopupOpen] = React.useState(false);
  function save() {
    onSave({ moveStrength, spike, note, analysis: analysis || makeSessionAnalysis(session, lang) });
  }

  // AI process registry (A4) - mountedRef template. Only mounted while fateStep === 'summary'
  // (LiveSessionView, below).
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('live-session-fate-summary', {
      allowlist: ['moveStrength', 'spike', 'note'],
      isOpen: () => mountedRef.current,
      applyValue: (path, value) => {
        if (path === 'moveStrength' && ['up', 'down', 'flat'].indexOf(value) > -1) setMoveStrength(value);
        else if (path === 'spike' && ['up', 'down', 'flat'].indexOf(value) > -1) setSpike(value);
        else if (path === 'note') setNote(String(value ?? ''));
      }
    });
    return () => { mountedRef.current = false; };
  }, []);

  return (
    <>
    <SessionModalShell title={tr(lang, 'fateStep2Title')} icon="Flag" onClose={onClose} width={640} footer={(
      <>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" onClick={onClose}>{tr(lang, 'cancel')}</Button>
        <Button variant="primary" icon="check" onClick={save}>{tr(lang, 'saveFateLabel')}</Button>
      </>
    )}>
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.8 }}>{tr(lang, 'summaryIntro')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <DirectionPicker label={tr(lang, 'moveStrengthLabel')} value={moveStrength} onChange={setMoveStrength} lang={lang} />
          <DirectionPicker label={tr(lang, 'spikeLabel')} value={spike} onChange={setSpike} lang={lang} />
        </div>
        <TextAreaField label={tr(lang, 'lessonsNoteLabel')} value={note} placeholder={tr(lang, 'lessonsPlaceholder')} onCommit={setNote} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 10, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.45)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="sparkle" size={16} /><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'sessionAiTitle')}</span>
            {analysis && (
              <>
                <span style={{ marginInlineStart: 'auto' }} />
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{tr(lang, 'localProviderLabel')}</span>
                <button type="button" onClick={() => setAiPopupOpen(true)} style={{ height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', font: 'var(--type-caption)', fontSize: 11 }}>{tr(lang, 'reanalyzeLabel')}</button>
              </>
            )}
          </div>
          {!analysis && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '10px 0' }}>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>{tr(lang, 'aiIntro')}</p>
              <Button variant="primary" icon="sparkle" size="sm" onClick={() => setAiPopupOpen(true)}>{tr(lang, 'startAnalysis')}</Button>
            </div>
          )}
          {analysis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11, lineHeight: 1.8 }}>
              <div>
                <span style={{ display: 'block', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-warm)', marginBottom: 3 }}>{tr(lang, 'overviewLabel')}</span>
                <p dir="auto" style={{ margin: 0, color: 'var(--text-primary)' }}>{analysis.overview}</p>
              </div>
              {!!analysis.keyMovements.length && (
                <div>
                  <span style={{ display: 'block', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-warm)', marginBottom: 3 }}>{tr(lang, 'keyMovementsLabel')}</span>
                  {analysis.keyMovements.map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0' }}>
                      <span className="navrya-tabular" style={{ color: 'var(--text-dim)', flex: 'none' }}>{m.time}</span>
                      <span dir="auto" style={{ flex: 1, color: 'var(--text-primary)' }}>{m.description}</span>
                    </div>
                  ))}
                </div>
              )}
              {!!analysis.patternProgression.length && (
                <div>
                  <span style={{ display: 'block', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-warm)', marginBottom: 3 }}>{tr(lang, 'patternProgressionLabel')}</span>
                  {analysis.patternProgression.map((p, i) => (
                    <div key={i} dir="auto" style={{ padding: '4px 0', color: 'var(--text-primary)' }}><b>{p.patternName}</b> — <span style={{ color: 'var(--text-dim)' }}>{p.outcome}</span></div>
                  ))}
                </div>
              )}
              {!!analysis.scenarioOutcomes.length && (
                <div>
                  <span style={{ display: 'block', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-warm)', marginBottom: 3 }}>{tr(lang, 'scenarioOutcomesLabel')}</span>
                  {analysis.scenarioOutcomes.map((s, i) => (
                    <div key={i} dir="auto" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', color: s.occurred ? 'var(--success)' : 'var(--text-dim)' }}>
                      <Icon name={s.occurred ? 'CircleCheck' : 'Circle'} size={12} />
                      <span style={{ flex: 1 }}>{s.title}</span>
                      <span>{s.occurred ? tr(lang, 'occurredLabel') : tr(lang, 'notOccurredLabel')} · {s.note}</span>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <span style={{ display: 'block', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-warm)', marginBottom: 3 }}>{tr(lang, 'lessonsLabel')}</span>
                {analysis.lessonsLearned.map((l, i) => <p key={i} dir="auto" style={{ margin: '2px 0', color: 'var(--text-primary)' }}>{l}</p>)}
              </div>
              <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(214,175,107,.06)' }}>
                <span style={{ display: 'block', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold-warm)', marginBottom: 3 }}>{tr(lang, 'carryForwardLabel')}</span>
                <p dir="auto" style={{ margin: 0, color: 'var(--text-primary)' }}>{analysis.carryForwardToNextSession}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </SessionModalShell>
    {aiPopupOpen && <SessionAiAnalysisModal session={session} lang={lang} onClose={() => setAiPopupOpen(false)} />}
    </>
  );
}

export function LiveSessionView({ character, sessionId, navActiveId, language, initialView, onBack }) {
  const lang = language || 'fa';
  const rtl = lang === 'fa' || lang === 'ar';
  const [, setTick] = React.useState(0);
  const rerender = React.useCallback(() => setTick((t) => t + 1), []);
  React.useEffect(() => {
    const iv = setInterval(rerender, 1000);
    window.addEventListener('tradejournal:sessions-changed', rerender);
    // openPositions (below) is recomputed fresh from TradeJournalTradeStore on every render, so
    // this is enough to reflect a status change (e.g. PositionRow's Mark Open/Cancel/Close
    // buttons) immediately instead of waiting for the 1s poll above to catch up.
    window.addEventListener('tradejournal:trades-changed', rerender);
    return () => {
      clearInterval(iv);
      window.removeEventListener('tradejournal:sessions-changed', rerender);
      window.removeEventListener('tradejournal:trades-changed', rerender);
    };
  }, [rerender]);

  const [view, setView] = React.useState(initialView === 'report' ? 'report' : 'timeline');
  // Real product feedback: the trader's TradingView drawings were being erased every time they
  // switched away from Market chart, because that view was mounted/unmounted with the rest of
  // the ternary below - the widget's own iframe (and everything drawn on it) has no save/restore
  // API on the free embed, so destroying it destroys the drawings too. Once opened, the chart
  // stays mounted in the DOM for the rest of this Live Session visit (see the render below,
  // toggled with CSS display rather than a remount) so the same iframe instance survives
  // Timeline/Report switches; it is still lazy on first load (never mounted before the trader
  // actually opens Market chart) and still torn down/rebuilt on a real symbol/interval/lang
  // change (TradingViewAdvancedChart's own effect) or when the whole Live Session is left.
  const chartEverOpenedRef = React.useRef(false);
  if (view === 'chart') chartEverOpenedRef.current = true;
  const [sel, setSel] = React.useState(null);
  const [filter, setFilter] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [dash, setDash] = React.useState('patterns');
  const [tfFilter, setTfFilter] = React.useState('all');
  const [openScenarios, setOpenScenarios] = React.useState(() => new Set());
  const [imageUrls, setImageUrls] = React.useState({});
  const [chartModalOpen, setChartModalOpen] = React.useState(false);
  // Set only by the Market chart panel's own screenshot-capture "Add chart" button
  // (MarketChartView's onAddChart(file)) - Timeline's plain "Add chart" buttons never touch this,
  // so the modal keeps opening with an empty dropzone for that unchanged path.
  const [chartModalInitialFile, setChartModalInitialFile] = React.useState(null);
  const [fateStep, setFateStep] = React.useState(null); // null | 'entry' | 'summary'
  const [sessionAiPopupOpen, setSessionAiPopupOpen] = React.useState(false);
  const railRef = React.useRef(null);

  const session = window.TradeJournalWorkspace ? window.TradeJournalWorkspace.find(sessionId) : null;

  const entries = session ? sortedEntries(session) : [];
  const indexById = {};
  entries.forEach((e, i) => { indexById[e.id] = i + 1; });
  const list = session ? visibleEntries(entries, filter, q, lang, tfFilter) : [];
  const presentTimeframes = Array.from(new Set(entries.map((e) => e.timeframe).filter(Boolean)));
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

  // Replaces mental-health-continuous.js's legacy wrapEntryFlow(), which monkey-patched
  // TradeJournalEntryFlow.openEntry to show a "before you start" popup once per session - this
  // screen builds entries directly against TradeJournalWorkspace and never calls that legacy
  // function, so the wrap silently stopped firing once the session UI moved here. Every action
  // that opens an add-entry UI (chart/movement/fate) goes through this gate instead, checking
  // the same continuousTracking.preSessionCheckIns record the legacy wrap checked, so the popup
  // still shows at most once per session and never blocks anything once already answered.
  function withPreSessionCheckIn(action) {
    const continuous = window.TradeJournalMentalHealthContinuous;
    const mh = window.TradeJournalMentalHealthStore;
    if (!continuous || !mh) { action(); return; }
    const already = mh.load().continuousTracking.preSessionCheckIns.some((c) => c.sessionId === session.id);
    if (already) { action(); return; }
    continuous.openPreSessionCheckIn(session, action);
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
    return entry;
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
  // Shared by the chart-entry and fate-entry modals - same real IndexedDB-then-dataURL fallback
  // attachImage() above already uses.
  async function storeImage(file) {
    if (window.TradeJournalImageStore) {
      const blobId = window.TradeJournalWorkspace.id('img');
      try { await window.TradeJournalImageStore.saveImage(blobId, file, 'session'); return { blobId }; }
      catch (_) { /* fall through to dataURL */ }
    }
    return { preview: await readAsDataUrl(file) };
  }
  async function submitChartEntry({ file, timeframe, market, date, note, relatedScenarioIds }) {
    const { blobId, preview } = await storeImage(file);
    const entry = {
      id: window.TradeJournalWorkspace.id('entry'), sessionId: session.id, type: 'chart', createdAt: new Date().toISOString(),
      hasImage: true, imageBlobId: blobId, preview, timeframe, tradingSession: market, market, gregorianDate: date,
      note: note || '', relatedScenarioIds: relatedScenarioIds || [], scenarios: []
    };
    persist((s) => { s.entries = (s.entries || []).concat([entry]); }, 'entry_added', tr(lang, 'addChart'));
    setChartModalOpen(false); setChartModalInitialFile(null); setFilter('all'); setQ('');
    selectEntry(entry.id);
  }
  async function submitFateEntry({ file, timeframe, market, note }) {
    const { blobId, preview } = await storeImage(file);
    const entryId = window.TradeJournalWorkspace.id('entry');
    const now = new Date().toISOString();
    const entry = {
      id: entryId, sessionId: session.id, type: 'fate', createdAt: now,
      hasImage: true, imageBlobId: blobId, preview, timeframe, tradingSession: market, market,
      note: note || '', relatedScenarioIds: [], scenarios: []
    };
    persist((s) => {
      s.entries = (s.entries || []).concat([entry]);
      s.status = 'closed'; s.closedAt = now; s.finalEntryId = entryId;
    }, 'entry_added', tr(lang, 'fateStep1Title'));
    setFateStep('summary');
  }
  function saveFateSummary({ moveStrength, spike, note, analysis }) {
    persist((s) => {
      s.fateSummary = {
        moveStrengthDirection: moveStrength || undefined, spikeDirection: spike || undefined,
        moveStrength: moveStrength || undefined, spike: spike || undefined, note: note || undefined,
        relatedScenarioIds: flatScenarios(s).map((x) => x.scenario.id), finalEntryId: s.finalEntryId || undefined,
        savedAt: new Date().toISOString()
      };
      s.previousSessionSummary = s.fateSummary;
      s.aiSessionAnalysisResult = analysis;
      s.aiSessionAnalysis = analysis.overview + ' ' + analysis.carryForwardToNextSession;
    }, 'fate_summary_saved', tr(lang, 'saveFateLabel'), null, false);
    setFateStep(null);
    setView('report');
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
    return scenario;
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

  // Journey F, F19/F20: real window-hook handoff, same convention as
  // TradeJournalNavryaPatternHub/StrategyHub - session.chartEntry.create/movementEntry.create/
  // scenario.create all drive the exact real functions the "Add chart"/"Add movement"/"Add
  // scenario" buttons already call (addEntry/addScenario/setChartModalOpen/withPreSessionCheckIn),
  // never a second creation path. Every one of those closes over this render's own
  // session/selId/list, which are freshly recomputed every render (Journey F's own stale-closure
  // lesson from Pattern/Strategy - see strategiesHubView.jsx's patternRef/strategyRef) - a ref kept
  // current every render decouples what the hook actually calls from which render's own effect
  // closure happens to still be registered.
  const liveSessionHubRef = React.useRef(null);
  liveSessionHubRef.current = { session, addEntry, addScenario, setChartModalOpen, withPreSessionCheckIn, selectEntry, setOpenScenarios };
  React.useEffect(() => {
    window.TradeJournalNavryaLiveSessionHub = {
      addChartEntry: () => { liveSessionHubRef.current.withPreSessionCheckIn(() => liveSessionHubRef.current.setChartModalOpen(true)); },
      // Returns the real created entry (or null if the pre-session check-in gate deferred it - a
      // known, rare edge case: the caller's own poll-for-registration simply times out gracefully
      // in that case, same fallback as every other "the real UI never mounted" path).
      addMovementEntry: () => {
        var created = null;
        liveSessionHubRef.current.withPreSessionCheckIn(() => { created = liveSessionHubRef.current.addEntry('movement'); });
        return created;
      },
      addScenarioToEntry: (entryId) => {
        var entry = (liveSessionHubRef.current.session.entries || []).find((e) => e.id === entryId);
        if (!entry) return null;
        return liveSessionHubRef.current.addScenario(entry);
      },
      // session.scenario.edit (F20): a Scenario's own card only ever mounts/registers while its
      // parent Entry is the one currently selected AND its own card is expanded (ScenarioEditor's
      // own isOpen tracks the openScenarios Set) - opening an EXISTING Scenario found by title
      // therefore has to do both, not just resolve an id, or the real registration this then polls
      // for would never actually appear.
      openScenario: (scenarioId) => {
        var entries = liveSessionHubRef.current.session.entries || [];
        var owner = entries.find((e) => (e.scenarios || []).some((sc) => sc.id === scenarioId));
        if (!owner) return false;
        liveSessionHubRef.current.selectEntry(owner.id);
        liveSessionHubRef.current.setOpenScenarios((prev) => new Set(prev).add(scenarioId));
        return true;
      }
    };
    return () => { delete window.TradeJournalNavryaLiveSessionHub; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Broadened from "trades whose source.sessionId is this exact session" to every real open/
  // hunting trade for this character - a position opened in an earlier session (say, London)
  // that is still running when the next session (New York) starts is still a live position of
  // that next session too, not just the one it happened to originate in.
  const allTrades = window.TradeJournalTradeStore ? window.TradeJournalTradeStore.listSync() : [];
  const openPositions = allTrades.filter((t) => (t.status === 'open' || t.status === 'hunting') && t.source && t.source.character === character);
  const positionsOpen = openPositions.filter((t) => t.status === 'open').length;

  // Was hardcoded dir="rtl" regardless of the actual selected language - in English/Spanish
  // (LTR) this flipped every marginInlineStart:'auto'/flex-order in the toolbar below, which is
  // exactly why "Add chart"/"Log movement" rendered pushed to the wrong (left) edge, overlapping
  // the filter-chip row instead of trailing after it.
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: 'var(--font-ui)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <CommandBar
        session={session} lang={lang} view={view} onBack={onBack} onSetView={setView}
        onSetInstrument={(code) => persist((s) => { s.instrument = code; }, 'instrument_classified', code)}
      />
      <PulseBand session={session} lang={lang} positionsOpen={positionsOpen} onFate={() => withPreSessionCheckIn(() => setFateStep('entry'))} />

      {view === 'timeline' ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ position: 'sticky', top: 64, zIndex: 30, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(6,12,12,.96)', backdropFilter: 'blur(8px)', boxShadow: 'var(--shadow-panel)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border-hairline)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--char-accent)', flex: 'none' }}><Icon name="Film" size={18} /><span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.02em' }}>{tr(lang, 'cockpitTitle')}</span></span>
                <span style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.55)', flex: 'none' }}>
                  {[['all', tr(lang, 'filterAll'), entries.length], ['chart', tr(lang, 'filterChart'), entries.filter((e) => e.type === 'chart').length], ['move', tr(lang, 'filterMove'), entries.filter((e) => e.type === 'movement').length]].map(([id, label, n]) => (
                    <button key={id} type="button" onClick={() => setFilter(id)} style={{ height: 28, padding: '0 11px', borderRadius: 6, cursor: 'pointer', font: 'var(--type-body)', fontSize: 11, border: '1px solid ' + (filter === id ? 'var(--char-accent)' : 'transparent'), background: filter === id ? 'var(--char-active-surface)' : 'transparent', color: filter === id ? 'var(--char-accent)' : 'var(--text-dim)' }}>{label} {n}</button>
                  ))}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.55)', color: 'var(--text-dim)', flex: 'none', width: 190 }}>
                  <Icon name="search" size={14} />
                  <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(lang, 'searchPlaceholder')} style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--text-primary)', font: 'inherit', fontSize: 11 }} />
                </label>
                {!!presentTimeframes.length && (
                  <select value={tfFilter} onChange={(e) => setTfFilter(e.target.value)} title={tr(lang, 'timeframeFilterLabel')} style={{ height: 30, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.55)', color: tfFilter === 'all' ? 'var(--text-dim)' : 'var(--char-accent)', font: 'var(--type-body)', fontSize: 11, flex: 'none' }}>
                    <option value="all">{tr(lang, 'allTimeframesLabel')}</option>
                    {presentTimeframes.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                  <Button variant="secondary" size="sm" icon="Activity" onClick={() => withPreSessionCheckIn(() => addEntry('movement'))}>{tr(lang, 'addMove')}</Button>
                  <Button variant="primary" size="sm" icon="ImagePlus" onClick={() => withPreSessionCheckIn(() => setChartModalOpen(true))}>{tr(lang, 'addChart')}</Button>
                </span>
              </div>

              <div dir="ltr" style={{ display: 'flex', alignItems: 'stretch', gap: 8, padding: '10px 10px 4px' }}>
                <button type="button" onClick={() => stepEntry(-1)} title={tr(lang, 'prevEntry')} style={{ display: 'grid', placeItems: 'center', width: 34, flex: 'none', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.55)', color: 'var(--text-muted)' }}><Icon name="ChevronLeft" size={18} /></button>
                <div ref={railRef} className="navrya-scroll" style={{ flex: 1, minWidth: 0, display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', padding: '3px 2px 8px', scrollBehavior: 'smooth' }}>
                  {list.map((e) => (
                    <EntryCard key={e.id} entry={e} index={indexById[e.id]} selected={e.id === selId} kindMeta={kindInfo(lang)[e.type] || kindInfo(lang).chart} lang={lang} imageUrl={imageUrls[e.id]} onClick={() => selectEntry(e.id)} />
                  ))}
                  <button type="button" onClick={() => withPreSessionCheckIn(() => setChartModalOpen(true))} style={{ flex: 'none', width: 112, borderRadius: 10, cursor: 'pointer', border: '1px dashed var(--border-gold)', background: 'transparent', color: 'var(--text-dim)', font: 'var(--type-body)', fontSize: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
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
                <span dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                  <span className="navrya-tabular" style={{ fontSize: 11, color: 'var(--text-primary)' }}>
                    {list.length ? tr(lang, 'counterEntryWord') + ' ' + (list.findIndex((e) => e.id === selId) < 0 ? 1 : list.findIndex((e) => e.id === selId) + 1) + ' ' + tr(lang, 'counterOf') + ' ' + list.length : tr(lang, 'counterNone')}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{tr(lang, 'keyboardHint')}</span>
                </span>
              </div>
            </div>

            {selEntry ? (
              <EntryDetailPanel
                key={selEntry.id}
                session={session} entry={selEntry} index={indexById[selEntry.id]} lang={lang} imageUrl={imageUrls[selEntry.id]}
                openScenarios={openScenarios}
                onNote={updateNote} onDeleteEntry={deleteEntry} onAttachImage={attachImage} onAnalyze={analyzeEntry}
                onOpenSessionAnalysis={() => setSessionAiPopupOpen(true)}
                onScenarioToggle={(id) => setOpenScenarios((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
                onScenarioUpdate={updateScenario} onScenarioDelete={deleteScenario} onScenarioStage={toggleStage} onScenarioSide={setScenarioSide}
                onAddScenario={addScenario} character={character}
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
            <DashboardPanel session={session} lang={lang} dash={dash} onSetDash={setDash} indexById={indexById} onSelectEntry={selectEntry}
              onToggleStage={toggleStage} onProbabilityChange={(entry, scenario, value) => updateScenario(entry, scenario, { probabilityHistory: (scenario.probabilityHistory || []).concat([{ value, loggedAt: new Date().toISOString() }]) }, 'probability_changed')}
              openPositions={openPositions} onLogTrade={() => openLogWizard({ accountId: session.accountId || null, instrument: session.instrument || null, source: { character, sessionId: session.id } }, { onSave: rerender })} />
            <PrevSummaryPanel session={session} lang={lang} />
            <SimilarSessionsPanel session={session} character={character} lang={lang} />
          </div>
        </div>
      ) : view === 'chart' ? null : (
        <ReportView session={session} lang={lang} indexById={indexById} />
      )}

      {/* Rendered outside the ternary above, and only once ever mounted (see chartEverOpenedRef),
          so the TradingView widget - and everything the trader has drawn on it - survives
          switching to Timeline/Report and back, instead of being torn down and rebuilt every
          time the view changes. */}
      {chartEverOpenedRef.current && (
        <div style={{ display: view === 'chart' ? 'block' : 'none' }}>
          <MarketChartView
            session={session} lang={lang}
            onAddChart={(file) => withPreSessionCheckIn(() => { setChartModalInitialFile(file); setChartModalOpen(true); })}
            onLogMove={(file) => withPreSessionCheckIn(() => { const entry = addEntry('movement'); if (file) attachImage(entry, file); })}
          />
        </div>
      )}

      {chartModalOpen && (
        <ChartEntryModal
          session={session} lang={lang} initialFile={chartModalInitialFile}
          onClose={() => { setChartModalOpen(false); setChartModalInitialFile(null); }}
          onSubmit={submitChartEntry}
        />
      )}
      {fateStep === 'entry' && <FateEntryModal session={session} lang={lang} onClose={() => setFateStep(null)} onSubmit={submitFateEntry} />}
      {fateStep === 'summary' && <FateSummaryModal session={session} lang={lang} onClose={() => setFateStep(null)} onSave={saveFateSummary} />}
      {sessionAiPopupOpen && <SessionAiAnalysisModal session={session} lang={lang} onClose={() => setSessionAiPopupOpen(false)} />}
    </div>
  );
}
