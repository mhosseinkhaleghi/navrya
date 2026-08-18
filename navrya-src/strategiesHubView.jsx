import React from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

// React rewrite of the "Strategies" screen per the design handoff: a single index (Patterns /
// Strategies tabs, card grid) + a 4-tab detail view (Details / Chat with AI / Report / Share).
// UI ONLY where real data/logic already existed - every store call below
// (window.TradeJournalPatternStore, window.TradeJournalStrategyEducationStore, their *AI
// wrappers, window.TradeJournalTradeStore, window.TradeJournalCommunityStore) is the exact same
// real store the pre-existing patternRegistryView.jsx/strategyEducationView.jsx already used;
// only the presentation and the single unified entry point are new. Two things the DC prototype
// only simulated are computed for real here instead: the 12-week trend and the session×weekday
// heatmap are honest aggregations over real timestamps (session dates, trade createdAt), not the
// prototype's seeded-random demo series - see weeklyBuckets()/sessionWeekdayHeat() below.
//
// Data-model asymmetry, called out once here rather than at every call site: Patterns carry a
// per-detection boolean (`occurred`) and per-stage completion; Strategies carry a 3-way detection
// status (pending/confirmed/invalidated) but no stage/step concept at all. The report tab's
// "quality" donut and "step completion" chart are real for each type using each type's own real
// buckets, not forced into one fabricated shared shape.

const copy = {
  fa: {
    eyebrow: 'NAVRYA · WORKSHOP', title: 'استراتژی‌ها و الگوها',
    subtitle: 'قواعد اجرا، ریسک و الگوهای تشخیص در یک جا. هر الگو و هر استراتژی گزارش، گفتگوی هوش مصنوعی و صفحهٔ بازارچهٔ خودش را دارد.',
    summaryPatterns: 'الگوی ثبت‌شده', summaryDetections: 'کل تشخیص‌ها', summaryAvgRealization: 'میانگین تحقق',
    tabPatterns: 'ثبت الگوها', tabStrategies: 'استراتژی‌ها',
    fromEvent: 'ساخت از یک رویداد', newPattern: 'الگوی جدید', newStrategy: 'استراتژی جدید',
    searchPlaceholder: 'جستجو در نام یا توضیحات…', sortRecent: 'اخیر', sortRealization: 'بیشترین تحقق', sortUsage: 'بیشترین استفاده',
    resultLine: '{n} مورد · مرتب‌سازی: {sort}', statusLive: 'فعال', statusDraft: 'پیش‌نویس', marketplaceBadge: 'بازارچه',
    statStages: 'مراحل', statDetections: 'تشخیص', statLinkedTrades: 'معاملهٔ لینک‌شده', trendLabel: 'روند تحقق · ۱۲ هفته',
    openBtn: 'باز کردن', reportBtn: 'گزارش', shareBtn: 'اشتراک‌گذاری', deleteBtn: 'حذف',
    emptyIndexTitle: 'هنوز چیزی ثبت نشده است', emptyIndexBody: 'برای شروع یک الگو یا استراتژی جدید بسازید.',
    deleteConfirm: 'این مورد حذف شود؟',
    backToList: 'بازگشت به فهرست', saveChanges: 'ذخیره تغییرات', changesSaved: 'تغییرات ذخیره شد',
    activeLabel: 'فعال', inactiveLabel: 'غیرفعال', activeToggleHelp: 'می‌توانید این مورد را بدون حذف کردن غیرفعال کنید.',
    strategyNameLabel: 'نام استراتژی', strategyNamePlaceholder: 'نام استراتژی را وارد کنید…',
    eyebrowPattern: 'ثبت الگو · REGISTRY', eyebrowStrategy: 'استراتژی · PLAYBOOK',
    chipSteps: '{n} مرحله', chipUsage: '{n} بار استفاده', chipUpdated: 'آخرین بروزرسانی {date}',
    tabDetails: 'جزئیات', tabChat: 'گفتگو با هوش مصنوعی', tabReport: 'گزارش', tabShare: 'اشتراک‌گذاری',
    defTitle: 'تعریف الگو', nameLabel: 'نام الگو', descLabel: 'توضیحات الگو (برای هوش مصنوعی)',
    descHelp: 'این توضیح همراه با تصاویر مرجع به هوش مصنوعی ارسال می‌شود. جهت حرکت و نحوهٔ شکل‌گیری مراحل را شرح دهید.',
    thresholdTitle: 'حد مجاز تکمیل مراحل برای باز کردن پوزیشن',
    thresholdHelp: 'وقتی درصد تکمیل مراحل به این مقدار برسد، باز کردن پوزیشن سناریو آزاد می‌شود. این حد برای هر الگو مستقل است.',
    stepsTitle: 'مراحل الگو', stepsHelp: 'برای حذف یا افزودن مرحله از دکمه‌های کنار هر ردیف استفاده کنید.',
    deleteStep: 'حذف مرحله', newStepPlaceholder: 'نام مرحله جدید…', addStep: 'افزودن مرحله',
    shotsTitle: 'اسکرین‌شات‌های مرجع', uploadShot: 'کلیک کنید یا تصاویر را اینجا رها کنید', uploadHint: 'PNG، JPG یا WebP',
    removeShot: 'حذف تصویر',
    groupPositionTitle: 'مدیریت پوزیشن', groupPositionSub: 'ورود، حد ضرر، خروج و حجم',
    entryRulesLabel: 'قواعد ورود', stopRulesLabel: 'قواعد حد ضرر', exitRulesLabel: 'قواعد خروج و هدف', sizingRulesLabel: 'قواعد حجم',
    groupRiskTitle: 'مدیریت ریسک و سرمایه', groupRiskSub: 'سقف ریسک، افت سرمایه و محدودیت معاملات',
    maxRiskLabel: 'حداکثر ریسک هر معامله', dailyDDLabel: 'سقف افت روزانه', totalDDLabel: 'سقف افت کل',
    maxConcurrentLabel: 'حداکثر معاملهٔ هم‌زمان', profitCapLabel: 'سقف سود هر معامله', percentUnit: 'درصد', tradeUnit: 'معامله',
    groupFrameworkTitle: 'چارچوب کلی استراتژی', groupFrameworkSub: 'منطق روایی و فلسفهٔ سیستم',
    freeNoteLabel: 'یادداشت آزاد', freeNotePlaceholder: 'هرچه در فیلدهای بالا نگنجید…',
    aiWriteSteps: 'نوشتن مراحل با هوش مصنوعی', aiGoChat: 'گفتگو با هوش مصنوعی',
    contextUnderstanding: 'درک فعلی هوش مصنوعی', contextSteps: 'مراحل تشخیص', contextRisk: 'قواعد ریسک',
    contextStepsMeta: '{n} مرحله ثبت شده', contextRiskBody: 'حداکثر {risk}٪ ریسک در هر معامله؛ سقف افت روزانه {dd}٪.',
    contextRiskBodyEmpty: 'هنوز قواعد ریسک برای این استراتژی ثبت نشده است.',
    chatNotice: 'تغییرات پیشنهادی فقط پس از تأیید شما اعمال می‌شوند.',
    suggestionTitle: 'تغییر پیشنهادی هوش مصنوعی', suggestionApply: 'اعمال تغییر', suggestionDismiss: 'رد کردن',
    composerPlaceholder: 'یک قاعده یا نکته دربارهٔ این {kind} بنویسید…', send: 'ارسال', sending: 'در حال ارسال…',
    kindPattern: 'الگو', kindStrategy: 'استراتژی', chatEmpty: 'هنوز گفتگویی ثبت نشده است. اولین پیام را بفرستید.',
    kpiDetections: 'تعداد تشخیص', kpiAvgStepCompletion: 'میانگین تکمیل مراحل', kpiRealization: 'نرخ تحقق',
    kpiLinkedTrades: 'معاملات لینک‌شده', kpiWinRate: 'نرخ برد', kpiAvgRR: 'میانگین RR', last90Days: 'در ۹۰ روز',
    funnelTitle: 'قیف تشخیص تا تحقق', funnelDetected: 'تشخیص‌شده', funnelStagesDone: 'مراحل تکمیل',
    funnelConfirmed: 'تأیید شده', funnelLinked: 'معاملهٔ لینک‌شده', funnelStart: 'شروع قیف', funnelDrop: '−{n}٪ ریزش',
    funnelNote: '{det} تشخیص · {linked} معاملهٔ لینک‌شده',
    trendTitle: 'روند تحقق در ۱۲ هفتهٔ گذشته', realizationRateLegend: 'نرخ تحقق', movingAvgLegend: 'میانگین متحرک',
    qualityTitle: 'کیفیت اجرا', qualityOccurred: 'تحقق‌یافته', qualityNotOccurred: 'هنوز اتفاق نیفتاده',
    qualityConfirmed: 'تأییدشده', qualityInvalidated: 'رد شده', qualityPending: 'در انتظار',
    stepsChartTitle: 'نرخ تکمیل هر مرحله', notApplicableSteps: 'این نمودار فقط برای الگوها معنا دارد.',
    rDistTitle: 'توزیع نتیجهٔ معاملات (R)', rNote: 'میانگین {rr}R · {n} معامله', rNoteEmpty: 'هنوز نتیجهٔ R ثبت‌شده‌ای موجود نیست.',
    heatmapTitle: 'تشخیص بر حسب سشن و روز', heatLow: 'کم', heatHigh: 'زیاد',
    dayLabels: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'],
    sessionLabels: ['سیدنی', 'توکیو', 'لندن', 'نیویورک'],
    linkedTradesTitle: 'معاملات لینک‌شده', linkedNote: '{n} معامله · ۹۰ روز',
    tradeHeadTrade: 'معامله', tradeHeadDate: 'تاریخ', tradeHeadSession: 'سشن', tradeHeadResult: 'نتیجه', tradeHeadSteps: 'مراحل',
    noLinkedTrades: 'هنوز معامله‌ای به این مورد لینک نشده است.', insufficientData: 'داده کافی نیست.',
    directionLong: 'خرید', directionShort: 'فروش',
    publicToggleLabel: 'این {kind} را عمومی نمایش بده',
    listedState: 'در بازارچه منتشر شده است.', notListedState: 'هنوز در بازارچه ثبت نشده است.',
    editListing: 'ویرایش آگهی بازارچه', ratingLabel: 'امتیاز', ratingNone: 'بدون امتیاز',
    notListedTitle: 'هنوز در بازارچه ثبت نشده است',
    notListedBody: 'آگهی خود را بسازید، چند مرحله را رایگان به نمایش بگذارید و بقیه را بفروشید.',
    registerListing: 'ثبت در بازارچه',
    publishHeader: 'بازارچهٔ ناوریا · انتشار', publishModalTitle: 'ثبت در بازارچه', editModalTitle: 'ویرایش آگهی',
    listingTitleLabel: 'عنوان آگهی', listingDescLabel: 'توضیحات فروش', listingDescPlaceholder: 'خریدار با این مورد چه چیزی به دست می‌آورد؟',
    priceLabel: 'قیمت', currencyLabel: 'واحد پول',
    freePreviewLabel: 'چند مرحله در پیش‌نمایش رایگان باشد',
    freePreviewHelp: 'مرحله‌های رایگان در کارت فروشگاهی نمایش داده می‌شوند؛ بقیه پس از خرید باز می‌شوند.',
    previewSectionLabel: 'پیش‌نمایش در بازارچه', cancel: 'انصراف', publishAction: 'انتشار در بازارچه', saveAction: 'ذخیره',
    freeBadge: '{n} مرحله رایگان در پیش‌نمایش', noFreeBadge: 'بدون پیش‌نمایش رایگان',
    addToCart: 'افزودن به سبد', oneTimePayment: 'پرداخت یک‌باره', publishFooterNote: 'با انتشار، قواعد بازارچهٔ ناوریا را می‌پذیرید.',
    saving: 'در حال ذخیره…',
    tabPositions: 'پوزیشن‌ها', positionsTitle: 'پوزیشن‌ها', positionsSubtitle: 'فهرست کامل معاملات، با فیلتر و جستجو روی همه‌ی وضعیت‌ها.',
    positionsSearchPlaceholder: 'جستجو در معاملات…', positionsAllStatuses: 'همه وضعیت‌ها', positionsAllDirections: 'همه جهت‌ها', positionsAllPatterns: 'همه الگوها',
    positionsFrom: 'از تاریخ', positionsTo: 'تا تاریخ',
    positionsHeadDate: 'تاریخ', positionsHeadDirection: 'جهت', positionsHeadPattern: 'الگو', positionsHeadStatus: 'وضعیت', positionsHeadRR: 'RR',
    positionsHeadOutcome: 'نتیجه', positionsHeadPnl: 'سود و زیان', positionsHeadMood: 'حال‌وهوا', positionsHeadActions: 'عملیات',
    positionsEmptyTitle: 'هنوز معامله‌ای ثبت نشده است', positionsEmptyBody: 'معاملات از ماشین‌حساب یا ثبت معامله اینجا ظاهر می‌شوند.',
    positionsResultLine: '{n} معامله', positionsEdit: 'ویرایش', positionsDetails: 'جزئیات', positionsNoPattern: '—', positionsNoMood: '—'
  },
  ar: {
    eyebrow: 'NAVRYA · ورشة العمل', title: 'الاستراتيجيات والأنماط',
    subtitle: 'قواعد التنفيذ والمخاطرة وأنماط الاكتشاف في مكان واحد. لكل نمط واستراتيجية تقرير ومحادثة ذكاء اصطناعي وصفحة سوق خاصة به.',
    summaryPatterns: 'نمط مسجّل', summaryDetections: 'إجمالي الاكتشافات', summaryAvgRealization: 'متوسط التحقق',
    tabPatterns: 'سجل الأنماط', tabStrategies: 'الاستراتيجيات',
    fromEvent: 'إنشاء من حدث', newPattern: 'نمط جديد', newStrategy: 'استراتيجية جديدة',
    searchPlaceholder: 'ابحث بالاسم أو الوصف…', sortRecent: 'الأحدث', sortRealization: 'الأعلى تحققاً', sortUsage: 'الأكثر استخداماً',
    resultLine: '{n} عنصر · الترتيب: {sort}', statusLive: 'نشط', statusDraft: 'مسودة', marketplaceBadge: 'السوق',
    statStages: 'المراحل', statDetections: 'الاكتشافات', statLinkedTrades: 'صفقة مرتبطة', trendLabel: 'اتجاه التحقق · ١٢ أسبوع',
    openBtn: 'فتح', reportBtn: 'تقرير', shareBtn: 'مشاركة', deleteBtn: 'حذف',
    emptyIndexTitle: 'لا يوجد شيء مسجل بعد', emptyIndexBody: 'أنشئ نمطاً أو استراتيجية جديدة للبدء.',
    deleteConfirm: 'حذف هذا العنصر؟',
    backToList: 'العودة إلى القائمة', saveChanges: 'حفظ التغييرات', changesSaved: 'تم حفظ التغييرات',
    activeLabel: 'نشط', inactiveLabel: 'غير نشط', activeToggleHelp: 'يمكنك تعطيل هذا العنصر دون حذفه.',
    strategyNameLabel: 'اسم الاستراتيجية', strategyNamePlaceholder: 'أدخل اسم الاستراتيجية…',
    eyebrowPattern: 'سجل الأنماط · REGISTRY', eyebrowStrategy: 'استراتيجية · PLAYBOOK',
    chipSteps: '{n} مرحلة', chipUsage: 'استُخدم {n} مرة', chipUpdated: 'آخر تحديث {date}',
    tabDetails: 'التفاصيل', tabChat: 'محادثة مع الذكاء الاصطناعي', tabReport: 'التقرير', tabShare: 'المشاركة',
    defTitle: 'تعريف النمط', nameLabel: 'اسم النمط', descLabel: 'وصف النمط (للذكاء الاصطناعي)',
    descHelp: 'يُرسل هذا الوصف مع الصور المرجعية إلى الذكاء الاصطناعي. اشرح اتجاه الحركة وكيفية تشكّل المراحل.',
    thresholdTitle: 'الحد المسموح لاكتمال المراحل لفتح الصفقة',
    thresholdHelp: 'عند وصول نسبة اكتمال المراحل لهذا الحد، يُفتح بروتوكول الصفقة. هذا الحد مستقل لكل نمط.',
    stepsTitle: 'مراحل النمط', stepsHelp: 'استخدم الأزرار بجانب كل صف لحذف أو إضافة مرحلة.',
    deleteStep: 'حذف المرحلة', newStepPlaceholder: 'اسم مرحلة جديدة…', addStep: 'إضافة مرحلة',
    shotsTitle: 'لقطات مرجعية', uploadShot: 'انقر أو اسحب الصور هنا', uploadHint: 'PNG أو JPG أو WebP',
    removeShot: 'حذف الصورة',
    groupPositionTitle: 'إدارة الصفقة', groupPositionSub: 'الدخول ووقف الخسارة والخروج والحجم',
    entryRulesLabel: 'قواعد الدخول', stopRulesLabel: 'قواعد وقف الخسارة', exitRulesLabel: 'قواعد الخروج والهدف', sizingRulesLabel: 'قواعد الحجم',
    groupRiskTitle: 'إدارة المخاطر ورأس المال', groupRiskSub: 'سقف المخاطرة والتراجع وحد الصفقات',
    maxRiskLabel: 'أقصى مخاطرة لكل صفقة', dailyDDLabel: 'سقف التراجع اليومي', totalDDLabel: 'سقف التراجع الكلي',
    maxConcurrentLabel: 'أقصى عدد صفقات متزامنة', profitCapLabel: 'سقف الربح لكل صفقة', percentUnit: '%', tradeUnit: 'صفقة',
    groupFrameworkTitle: 'الإطار العام للاستراتيجية', groupFrameworkSub: 'المنطق السردي وفلسفة النظام',
    freeNoteLabel: 'ملاحظة حرة', freeNotePlaceholder: 'أي شيء لا يتسع في الحقول أعلاه…',
    aiWriteSteps: 'كتابة المراحل بالذكاء الاصطناعي', aiGoChat: 'محادثة مع الذكاء الاصطناعي',
    contextUnderstanding: 'الفهم الحالي للذكاء الاصطناعي', contextSteps: 'مراحل الاكتشاف', contextRisk: 'قواعد المخاطرة',
    contextStepsMeta: 'تم تسجيل {n} مرحلة', contextRiskBody: 'أقصى مخاطرة {risk}٪ لكل صفقة؛ سقف تراجع يومي {dd}٪.',
    contextRiskBodyEmpty: 'لم تُسجَّل قواعد مخاطرة لهذه الاستراتيجية بعد.',
    chatNotice: 'التغييرات المقترحة تُطبَّق فقط بعد موافقتك.',
    suggestionTitle: 'تغيير مقترح من الذكاء الاصطناعي', suggestionApply: 'تطبيق التغيير', suggestionDismiss: 'رفض',
    composerPlaceholder: 'اكتب قاعدة أو ملاحظة حول هذا ال{kind}…', send: 'إرسال', sending: 'جارٍ الإرسال…',
    kindPattern: 'نمط', kindStrategy: 'استراتيجية', chatEmpty: 'لا توجد محادثة بعد. أرسل أول رسالة.',
    kpiDetections: 'عدد الاكتشافات', kpiAvgStepCompletion: 'متوسط اكتمال المراحل', kpiRealization: 'نسبة التحقق',
    kpiLinkedTrades: 'الصفقات المرتبطة', kpiWinRate: 'نسبة الفوز', kpiAvgRR: 'متوسط RR', last90Days: 'خلال ٩٠ يوماً',
    funnelTitle: 'قمع الاكتشاف حتى التحقق', funnelDetected: 'تم اكتشافه', funnelStagesDone: 'مراحل مكتملة',
    funnelConfirmed: 'مؤكَّد', funnelLinked: 'صفقة مرتبطة', funnelStart: 'بداية القمع', funnelDrop: '−{n}٪ انخفاض',
    funnelNote: '{det} اكتشاف · {linked} صفقة مرتبطة',
    trendTitle: 'اتجاه التحقق خلال ١٢ أسبوعاً الماضية', realizationRateLegend: 'نسبة التحقق', movingAvgLegend: 'المتوسط المتحرك',
    qualityTitle: 'جودة التنفيذ', qualityOccurred: 'تحقق', qualityNotOccurred: 'لم يتحقق بعد',
    qualityConfirmed: 'مؤكَّد', qualityInvalidated: 'مرفوض', qualityPending: 'قيد الانتظار',
    stepsChartTitle: 'نسبة اكتمال كل مرحلة', notApplicableSteps: 'هذا الرسم يخص الأنماط فقط.',
    rDistTitle: 'توزيع نتائج الصفقات (R)', rNote: 'متوسط {rr}R · {n} صفقة', rNoteEmpty: 'لا توجد نتائج R مسجلة بعد.',
    heatmapTitle: 'الاكتشاف حسب الجلسة واليوم', heatLow: 'منخفض', heatHigh: 'مرتفع',
    dayLabels: ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
    sessionLabels: ['سيدني', 'طوكيو', 'لندن', 'نيويورك'],
    linkedTradesTitle: 'الصفقات المرتبطة', linkedNote: '{n} صفقة · ٩٠ يوماً',
    tradeHeadTrade: 'الصفقة', tradeHeadDate: 'التاريخ', tradeHeadSession: 'الجلسة', tradeHeadResult: 'النتيجة', tradeHeadSteps: 'المراحل',
    noLinkedTrades: 'لا توجد صفقة مرتبطة بهذا العنصر بعد.', insufficientData: 'بيانات غير كافية.',
    directionLong: 'شراء', directionShort: 'بيع',
    publicToggleLabel: 'عرض هذا ال{kind} للعامة',
    listedState: 'منشور في السوق.', notListedState: 'لم يُنشر في السوق بعد.',
    editListing: 'تعديل إعلان السوق', ratingLabel: 'التقييم', ratingNone: 'بدون تقييم',
    notListedTitle: 'لم يُنشر في السوق بعد',
    notListedBody: 'أنشئ إعلانك، اعرض بعض المراحل مجاناً وبِع الباقي.',
    registerListing: 'التسجيل في السوق',
    publishHeader: 'سوق ناوريا · نشر', publishModalTitle: 'التسجيل في السوق', editModalTitle: 'تعديل الإعلان',
    listingTitleLabel: 'عنوان الإعلان', listingDescLabel: 'وصف البيع', listingDescPlaceholder: 'ماذا سيحصل عليه المشتري من هذا العنصر؟',
    priceLabel: 'السعر', currencyLabel: 'العملة',
    freePreviewLabel: 'كم مرحلة تُعرض مجاناً',
    freePreviewHelp: 'المراحل المجانية تظهر في بطاقة المتجر؛ الباقي يُفتح بعد الشراء.',
    previewSectionLabel: 'معاينة السوق', cancel: 'إلغاء', publishAction: 'نشر في السوق', saveAction: 'حفظ',
    freeBadge: '{n} مرحلة مجانية في المعاينة', noFreeBadge: 'بدون معاينة مجانية',
    addToCart: 'أضف إلى السلة', oneTimePayment: 'دفعة واحدة', publishFooterNote: 'بالنشر، أنت توافق على قواعد سوق ناوريا.',
    saving: 'جارٍ الحفظ…',
    tabPositions: 'الصفقات', positionsTitle: 'الصفقات', positionsSubtitle: 'قائمة كاملة بالصفقات، مع فلترة وبحث عبر كل الحالات.',
    positionsSearchPlaceholder: 'البحث في الصفقات…', positionsAllStatuses: 'كل الحالات', positionsAllDirections: 'كل الاتجاهات', positionsAllPatterns: 'كل الأنماط',
    positionsFrom: 'من تاريخ', positionsTo: 'إلى تاريخ',
    positionsHeadDate: 'التاريخ', positionsHeadDirection: 'الاتجاه', positionsHeadPattern: 'النمط', positionsHeadStatus: 'الحالة', positionsHeadRR: 'RR',
    positionsHeadOutcome: 'النتيجة', positionsHeadPnl: 'الربح والخسارة', positionsHeadMood: 'الحالة المزاجية', positionsHeadActions: 'الإجراءات',
    positionsEmptyTitle: 'لم تُسجَّل أي صفقة بعد', positionsEmptyBody: 'تظهر الصفقات هنا من حاسبة الصفقة أو تسجيل صفقة.',
    positionsResultLine: '{n} صفقة', positionsEdit: 'تعديل', positionsDetails: 'التفاصيل', positionsNoPattern: '—', positionsNoMood: '—'
  },
  en: {
    eyebrow: 'NAVRYA · WORKSHOP', title: 'Strategies & Patterns',
    subtitle: 'Execution rules, risk and detection patterns in one place. Every pattern and strategy has its own report, AI chat and marketplace page.',
    summaryPatterns: 'Registered patterns', summaryDetections: 'Total detections', summaryAvgRealization: 'Avg. realization',
    tabPatterns: 'Pattern registry', tabStrategies: 'Strategies',
    fromEvent: 'Build from an event', newPattern: 'New pattern', newStrategy: 'New strategy',
    searchPlaceholder: 'Search by name or description…', sortRecent: 'Recent', sortRealization: 'Highest realization', sortUsage: 'Most used',
    resultLine: '{n} items · Sorted by: {sort}', statusLive: 'Live', statusDraft: 'Draft', marketplaceBadge: 'Marketplace',
    statStages: 'Stages', statDetections: 'Detections', statLinkedTrades: 'Linked trades', trendLabel: 'Realization trend · 12 weeks',
    openBtn: 'Open', reportBtn: 'Report', shareBtn: 'Share', deleteBtn: 'Delete',
    emptyIndexTitle: 'Nothing registered yet', emptyIndexBody: 'Create a new pattern or strategy to get started.',
    deleteConfirm: 'Delete this item?',
    backToList: 'Back to list', saveChanges: 'Save changes', changesSaved: 'Changes saved',
    activeLabel: 'Active', inactiveLabel: 'Inactive', activeToggleHelp: 'You can deactivate this item without deleting it.',
    strategyNameLabel: 'Strategy name', strategyNamePlaceholder: 'Enter a strategy name…',
    eyebrowPattern: 'Pattern · REGISTRY', eyebrowStrategy: 'Strategy · PLAYBOOK',
    chipSteps: '{n} steps', chipUsage: 'used {n} times', chipUpdated: 'Last updated {date}',
    tabDetails: 'Details', tabChat: 'Chat with AI', tabReport: 'Report', tabShare: 'Share',
    defTitle: 'Pattern definition', nameLabel: 'Pattern name', descLabel: 'Pattern description (for AI)',
    descHelp: 'This description is sent to the AI along with reference images. Describe the direction of the move and how the stages form.',
    thresholdTitle: 'Stage-completion threshold to unlock a position',
    thresholdHelp: 'Once stage completion reaches this value, opening a position on the scenario is unlocked. This threshold is independent per pattern.',
    stepsTitle: 'Pattern stages', stepsHelp: 'Use the buttons next to each row to add or remove a stage.',
    deleteStep: 'Delete stage', newStepPlaceholder: 'New stage name…', addStep: 'Add stage',
    shotsTitle: 'Reference screenshots', uploadShot: 'Click or drop images here', uploadHint: 'PNG, JPG or WebP',
    removeShot: 'Remove image',
    groupPositionTitle: 'Position management', groupPositionSub: 'Entry, stop loss, exit and sizing',
    entryRulesLabel: 'Entry rules', stopRulesLabel: 'Stop-loss rules', exitRulesLabel: 'Exit & target rules', sizingRulesLabel: 'Sizing rules',
    groupRiskTitle: 'Risk & capital management', groupRiskSub: 'Risk cap, drawdown and trade limits',
    maxRiskLabel: 'Max risk per trade', dailyDDLabel: 'Daily drawdown cap', totalDDLabel: 'Total drawdown cap',
    maxConcurrentLabel: 'Max concurrent trades', profitCapLabel: 'Profit cap per trade', percentUnit: '%', tradeUnit: 'trades',
    groupFrameworkTitle: 'Overall strategy framework', groupFrameworkSub: 'Narrative logic and system philosophy',
    freeNoteLabel: 'Free note', freeNotePlaceholder: 'Anything that doesn’t fit the fields above…',
    aiWriteSteps: 'Write stages with AI', aiGoChat: 'Chat with AI',
    contextUnderstanding: 'AI’s current understanding', contextSteps: 'Detection stages', contextRisk: 'Risk rules',
    contextStepsMeta: '{n} stages recorded', contextRiskBody: 'Max {risk}% risk per trade; daily drawdown cap {dd}%.',
    contextRiskBodyEmpty: 'No risk rules recorded for this strategy yet.',
    chatNotice: 'Suggested changes are only applied after your approval.',
    suggestionTitle: 'AI-suggested change', suggestionApply: 'Apply change', suggestionDismiss: 'Dismiss',
    composerPlaceholder: 'Write a rule or note about this {kind}…', send: 'Send', sending: 'Sending…',
    kindPattern: 'pattern', kindStrategy: 'strategy', chatEmpty: 'No conversation yet. Send the first message.',
    kpiDetections: 'Detection count', kpiAvgStepCompletion: 'Avg. stage completion', kpiRealization: 'Realization rate',
    kpiLinkedTrades: 'Linked trades', kpiWinRate: 'Win rate', kpiAvgRR: 'Average RR', last90Days: 'in 90 days',
    funnelTitle: 'Detection-to-realization funnel', funnelDetected: 'Detected', funnelStagesDone: 'Stages completed',
    funnelConfirmed: 'Confirmed', funnelLinked: 'Linked to a trade', funnelStart: 'Funnel start', funnelDrop: '−{n}% drop',
    funnelNote: '{det} detections · {linked} linked trades',
    trendTitle: 'Realization trend, last 12 weeks', realizationRateLegend: 'Realization rate', movingAvgLegend: 'Moving average',
    qualityTitle: 'Execution quality', qualityOccurred: 'Occurred', qualityNotOccurred: 'Not occurred yet',
    qualityConfirmed: 'Confirmed', qualityInvalidated: 'Invalidated', qualityPending: 'Pending',
    stepsChartTitle: 'Per-stage completion rate', notApplicableSteps: 'This chart only applies to patterns.',
    rDistTitle: 'Trade outcome distribution (R)', rNote: 'Average {rr}R · {n} trades', rNoteEmpty: 'No R-multiple results recorded yet.',
    heatmapTitle: 'Detections by session and day', heatLow: 'Low', heatHigh: 'High',
    dayLabels: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    sessionLabels: ['Sydney', 'Tokyo', 'London', 'New York'],
    linkedTradesTitle: 'Linked trades', linkedNote: '{n} trades · 90 days',
    tradeHeadTrade: 'Trade', tradeHeadDate: 'Date', tradeHeadSession: 'Session', tradeHeadResult: 'Result', tradeHeadSteps: 'Stages',
    noLinkedTrades: 'No trade is linked to this item yet.', insufficientData: 'Insufficient data.',
    directionLong: 'Long', directionShort: 'Short',
    publicToggleLabel: 'Show this {kind} publicly',
    listedState: 'Published to the marketplace.', notListedState: 'Not listed on the marketplace yet.',
    editListing: 'Edit marketplace listing', ratingLabel: 'Rating', ratingNone: 'No ratings',
    notListedTitle: 'Not listed on the marketplace yet',
    notListedBody: 'Build your listing, show a few stages free and sell the rest.',
    registerListing: 'List on marketplace',
    publishHeader: 'NAVRYA Marketplace · Publish', publishModalTitle: 'List on marketplace', editModalTitle: 'Edit listing',
    listingTitleLabel: 'Listing title', listingDescLabel: 'Sales description', listingDescPlaceholder: 'What does the buyer get from this item?',
    priceLabel: 'Price', currencyLabel: 'Currency',
    freePreviewLabel: 'Free-preview stage count',
    freePreviewHelp: 'Free stages show on the shop card; the rest unlock after purchase.',
    previewSectionLabel: 'Marketplace preview', cancel: 'Cancel', publishAction: 'Publish to marketplace', saveAction: 'Save',
    freeBadge: '{n} free preview stages', noFreeBadge: 'No free preview',
    addToCart: 'Add to cart', oneTimePayment: 'One-time payment', publishFooterNote: 'Publishing means you accept the NAVRYA marketplace rules.',
    saving: 'Saving…',
    tabPositions: 'Positions', positionsTitle: 'Positions', positionsSubtitle: 'The full trade list, filterable and searchable across every status.',
    positionsSearchPlaceholder: 'Search trades…', positionsAllStatuses: 'All statuses', positionsAllDirections: 'All directions', positionsAllPatterns: 'All patterns',
    positionsFrom: 'From', positionsTo: 'To',
    positionsHeadDate: 'Date', positionsHeadDirection: 'Direction', positionsHeadPattern: 'Pattern', positionsHeadStatus: 'Status', positionsHeadRR: 'RR',
    positionsHeadOutcome: 'Outcome', positionsHeadPnl: 'P&L', positionsHeadMood: 'Mood', positionsHeadActions: 'Actions',
    positionsEmptyTitle: 'No trades logged yet', positionsEmptyBody: 'Trades from the calculator or Log Trade appear here.',
    positionsResultLine: '{n} trades', positionsEdit: 'Edit', positionsDetails: 'Details', positionsNoPattern: '—', positionsNoMood: '—'
  },
  es: {
    eyebrow: 'NAVRYA · TALLER', title: 'Estrategias y patrones',
    subtitle: 'Reglas de ejecución, riesgo y patrones de detección en un solo lugar. Cada patrón y estrategia tiene su propio informe, chat de IA y página de mercado.',
    summaryPatterns: 'Patrones registrados', summaryDetections: 'Detecciones totales', summaryAvgRealization: 'Realización media',
    tabPatterns: 'Registro de patrones', tabStrategies: 'Estrategias',
    fromEvent: 'Crear desde un evento', newPattern: 'Nuevo patrón', newStrategy: 'Nueva estrategia',
    searchPlaceholder: 'Buscar por nombre o descripción…', sortRecent: 'Reciente', sortRealization: 'Mayor realización', sortUsage: 'Más usados',
    resultLine: '{n} elementos · Orden: {sort}', statusLive: 'Activo', statusDraft: 'Borrador', marketplaceBadge: 'Mercado',
    statStages: 'Etapas', statDetections: 'Detecciones', statLinkedTrades: 'Operación vinculada', trendLabel: 'Tendencia de realización · 12 semanas',
    openBtn: 'Abrir', reportBtn: 'Informe', shareBtn: 'Compartir', deleteBtn: 'Eliminar',
    emptyIndexTitle: 'Aún no hay nada registrado', emptyIndexBody: 'Crea un nuevo patrón o estrategia para empezar.',
    deleteConfirm: '¿Eliminar este elemento?',
    backToList: 'Volver a la lista', saveChanges: 'Guardar cambios', changesSaved: 'Cambios guardados',
    activeLabel: 'Activo', inactiveLabel: 'Inactivo', activeToggleHelp: 'Puedes desactivar este elemento sin eliminarlo.',
    strategyNameLabel: 'Nombre de la estrategia', strategyNamePlaceholder: 'Introduce un nombre de estrategia…',
    eyebrowPattern: 'Patrón · REGISTRO', eyebrowStrategy: 'Estrategia · PLAYBOOK',
    chipSteps: '{n} etapas', chipUsage: 'usado {n} veces', chipUpdated: 'Última actualización {date}',
    tabDetails: 'Detalles', tabChat: 'Chat con IA', tabReport: 'Informe', tabShare: 'Compartir',
    defTitle: 'Definición del patrón', nameLabel: 'Nombre del patrón', descLabel: 'Descripción del patrón (para la IA)',
    descHelp: 'Esta descripción se envía a la IA junto con las imágenes de referencia. Describe la dirección del movimiento y cómo se forman las etapas.',
    thresholdTitle: 'Umbral de finalización para desbloquear una posición',
    thresholdHelp: 'Cuando la finalización de etapas alcance este valor, se desbloquea abrir una posición en el escenario. Este umbral es independiente por patrón.',
    stepsTitle: 'Etapas del patrón', stepsHelp: 'Usa los botones junto a cada fila para añadir o eliminar una etapa.',
    deleteStep: 'Eliminar etapa', newStepPlaceholder: 'Nombre de la nueva etapa…', addStep: 'Añadir etapa',
    shotsTitle: 'Capturas de referencia', uploadShot: 'Haz clic o arrastra imágenes aquí', uploadHint: 'PNG, JPG o WebP',
    removeShot: 'Eliminar imagen',
    groupPositionTitle: 'Gestión de la posición', groupPositionSub: 'Entrada, stop loss, salida y tamaño',
    entryRulesLabel: 'Reglas de entrada', stopRulesLabel: 'Reglas de stop loss', exitRulesLabel: 'Reglas de salida y objetivo', sizingRulesLabel: 'Reglas de tamaño',
    groupRiskTitle: 'Gestión de riesgo y capital', groupRiskSub: 'Límite de riesgo, drawdown y operaciones',
    maxRiskLabel: 'Riesgo máx. por operación', dailyDDLabel: 'Límite de drawdown diario', totalDDLabel: 'Límite de drawdown total',
    maxConcurrentLabel: 'Máx. operaciones simultáneas', profitCapLabel: 'Tope de ganancia por operación', percentUnit: '%', tradeUnit: 'operaciones',
    groupFrameworkTitle: 'Marco general de la estrategia', groupFrameworkSub: 'Lógica narrativa y filosofía del sistema',
    freeNoteLabel: 'Nota libre', freeNotePlaceholder: 'Cualquier cosa que no encaje arriba…',
    aiWriteSteps: 'Escribir etapas con IA', aiGoChat: 'Chat con IA',
    contextUnderstanding: 'Comprensión actual de la IA', contextSteps: 'Etapas de detección', contextRisk: 'Reglas de riesgo',
    contextStepsMeta: '{n} etapas registradas', contextRiskBody: 'Riesgo máx. {risk}% por operación; drawdown diario máx. {dd}%.',
    contextRiskBodyEmpty: 'Aún no hay reglas de riesgo registradas para esta estrategia.',
    chatNotice: 'Los cambios sugeridos solo se aplican tras tu aprobación.',
    suggestionTitle: 'Cambio sugerido por la IA', suggestionApply: 'Aplicar cambio', suggestionDismiss: 'Descartar',
    composerPlaceholder: 'Escribe una regla o nota sobre esta {kind}…', send: 'Enviar', sending: 'Enviando…',
    kindPattern: 'patrón', kindStrategy: 'estrategia', chatEmpty: 'Aún no hay conversación. Envía el primer mensaje.',
    kpiDetections: 'Número de detecciones', kpiAvgStepCompletion: 'Finalización media de etapas', kpiRealization: 'Tasa de realización',
    kpiLinkedTrades: 'Operaciones vinculadas', kpiWinRate: 'Tasa de acierto', kpiAvgRR: 'RR medio', last90Days: 'en 90 días',
    funnelTitle: 'Embudo de detección a realización', funnelDetected: 'Detectado', funnelStagesDone: 'Etapas completadas',
    funnelConfirmed: 'Confirmado', funnelLinked: 'Vinculado a una operación', funnelStart: 'Inicio del embudo', funnelDrop: '−{n}% caída',
    funnelNote: '{det} detecciones · {linked} operaciones vinculadas',
    trendTitle: 'Tendencia de realización, últimas 12 semanas', realizationRateLegend: 'Tasa de realización', movingAvgLegend: 'Media móvil',
    qualityTitle: 'Calidad de ejecución', qualityOccurred: 'Ocurrió', qualityNotOccurred: 'Aún no ocurrió',
    qualityConfirmed: 'Confirmado', qualityInvalidated: 'Invalidado', qualityPending: 'Pendiente',
    stepsChartTitle: 'Tasa de finalización por etapa', notApplicableSteps: 'Este gráfico solo aplica a patrones.',
    rDistTitle: 'Distribución de resultados (R)', rNote: 'Media {rr}R · {n} operaciones', rNoteEmpty: 'Aún no hay resultados R registrados.',
    heatmapTitle: 'Detecciones por sesión y día', heatLow: 'Bajo', heatHigh: 'Alto',
    dayLabels: ['Sáb', 'Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie'],
    sessionLabels: ['Sídney', 'Tokio', 'Londres', 'Nueva York'],
    linkedTradesTitle: 'Operaciones vinculadas', linkedNote: '{n} operaciones · 90 días',
    tradeHeadTrade: 'Operación', tradeHeadDate: 'Fecha', tradeHeadSession: 'Sesión', tradeHeadResult: 'Resultado', tradeHeadSteps: 'Etapas',
    noLinkedTrades: 'Aún no hay ninguna operación vinculada a este elemento.', insufficientData: 'Datos insuficientes.',
    directionLong: 'Compra', directionShort: 'Venta',
    publicToggleLabel: 'Mostrar esta {kind} públicamente',
    listedState: 'Publicado en el mercado.', notListedState: 'Aún no está publicado en el mercado.',
    editListing: 'Editar anuncio del mercado', ratingLabel: 'Valoración', ratingNone: 'Sin valoraciones',
    notListedTitle: 'Aún no está publicado en el mercado',
    notListedBody: 'Crea tu anuncio, muestra algunas etapas gratis y vende el resto.',
    registerListing: 'Publicar en el mercado',
    publishHeader: 'Mercado NAVRYA · Publicar', publishModalTitle: 'Publicar en el mercado', editModalTitle: 'Editar anuncio',
    listingTitleLabel: 'Título del anuncio', listingDescLabel: 'Descripción de venta', listingDescPlaceholder: '¿Qué obtiene el comprador con esto?',
    priceLabel: 'Precio', currencyLabel: 'Moneda',
    freePreviewLabel: 'Etapas gratis en la vista previa',
    freePreviewHelp: 'Las etapas gratis se muestran en la tarjeta de la tienda; el resto se desbloquea tras la compra.',
    previewSectionLabel: 'Vista previa del mercado', cancel: 'Cancelar', publishAction: 'Publicar en el mercado', saveAction: 'Guardar',
    freeBadge: '{n} etapas gratis en la vista previa', noFreeBadge: 'Sin vista previa gratis',
    addToCart: 'Añadir al carrito', oneTimePayment: 'Pago único', publishFooterNote: 'Al publicar, aceptas las reglas del mercado NAVRYA.',
    saving: 'Guardando…',
    tabPositions: 'Posiciones', positionsTitle: 'Posiciones', positionsSubtitle: 'La lista completa de operaciones, con filtro y búsqueda en todos los estados.',
    positionsSearchPlaceholder: 'Buscar operaciones…', positionsAllStatuses: 'Todos los estados', positionsAllDirections: 'Todas las direcciones', positionsAllPatterns: 'Todos los patrones',
    positionsFrom: 'Desde', positionsTo: 'Hasta',
    positionsHeadDate: 'Fecha', positionsHeadDirection: 'Dirección', positionsHeadPattern: 'Patrón', positionsHeadStatus: 'Estado', positionsHeadRR: 'RR',
    positionsHeadOutcome: 'Resultado', positionsHeadPnl: 'P&L', positionsHeadMood: 'Estado de ánimo', positionsHeadActions: 'Acciones',
    positionsEmptyTitle: 'Aún no hay operaciones registradas', positionsEmptyBody: 'Las operaciones de la calculadora o de Registrar operación aparecen aquí.',
    positionsResultLine: '{n} operaciones', positionsEdit: 'Editar', positionsDetails: 'Detalles', positionsNoPattern: '—', positionsNoMood: '—'
  }
};

function tr(lang, key, vars) {
  let value = (copy[lang] && copy[lang][key]) || copy.en[key] || key;
  if (vars) Object.keys(vars).forEach((name) => { value = value.replace('{' + name + '}', vars[name]); });
  return value;
}
function digits(lang, value) {
  const s = String(value);
  if (lang !== 'fa') return s;
  return s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}
function localeCode(lang) { return { fa: 'fa-IR', ar: 'ar-EG', en: 'en-GB', es: 'es-ES' }[lang] || 'en-GB'; }
function round1(n) { return Math.round(n * 10) / 10; }

// ---- pure chart primitives (draw whatever real numbers are handed in; no data of their own) ----

function h(tag, props, ...children) { return React.createElement(tag, props, ...children); }

function sparkChart(vals, key, color) {
  const W = 260, H = 46;
  const max = Math.max(...vals), min = Math.min(...vals), span = Math.max(1, max - min);
  const pts = vals.map((v, i) => [(i / Math.max(1, vals.length - 1)) * W, H - 4 - ((v - min) / span) * (H - 12)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z';
  const gid = 'nsp-' + key;
  const last = pts[pts.length - 1];
  return h('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, preserveAspectRatio: 'none', style: { display: 'block', overflow: 'visible' } },
    h('defs', null, h('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' },
      h('stop', { offset: '0%', style: { stopColor: color, stopOpacity: 0.36 } }),
      h('stop', { offset: '100%', style: { stopColor: color, stopOpacity: 0 } }))),
    h('path', { d: area, fill: 'url(#' + gid + ')' }),
    h('path', { d: line, fill: 'none', strokeWidth: 1.8, strokeLinejoin: 'round', strokeLinecap: 'round', style: { stroke: color } }),
    h('circle', { cx: last[0], cy: last[1], r: 2.6, style: { fill: color } })
  );
}

// Decorative avatar glyph only (no data meaning) - deterministically derived from the item's real
// id so each card reads visually distinct without inventing a "shape" field that doesn't exist.
function glyphPath(id) {
  let seed = 0; for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let x = 4, y = 20, d = 'M' + x + ' ' + y;
  for (let i = 0; i < 6; i++) { x += 8 + rnd() * 8; y = 6 + rnd() * 28; d += ' L' + x.toFixed(0) + ' ' + y.toFixed(0); }
  return d;
}
function glyphChart(id, size) {
  const s = size || 56;
  return h('svg', { viewBox: '0 0 56 38', width: s, height: Math.round(s * 0.68), style: { display: 'block' } },
    h('path', { d: 'M0 36 H56', strokeWidth: 1, style: { stroke: 'rgba(244,234,215,.12)' }, fill: 'none' }),
    h('path', { d: glyphPath(id), fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { stroke: 'var(--char-accent)' } })
  );
}

function donutChart(pct, size, label, lang) {
  const s = size || 56, r = (s - 7) / 2, c = 2 * Math.PI * r, value = pct == null ? 0 : pct;
  return h('div', { style: { position: 'relative', width: s, height: s, flex: 'none' } },
    h('svg', { width: s, height: s, viewBox: '0 0 ' + s + ' ' + s, style: { display: 'block', transform: 'rotate(-90deg)' } },
      h('circle', { cx: s / 2, cy: s / 2, r, fill: 'none', strokeWidth: 5, style: { stroke: 'rgba(244,234,215,.08)' } }),
      h('circle', { cx: s / 2, cy: s / 2, r, fill: 'none', strokeWidth: 5, strokeLinecap: 'round', strokeDasharray: c, strokeDashoffset: c * (1 - value / 100), style: { stroke: 'var(--char-accent)' } })),
    h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 } },
      h('span', { style: { fontSize: s > 90 ? 26 : 13, fontWeight: 700, color: 'var(--parchment)', lineHeight: 1 } }, pct == null ? '—' : digits(lang, pct) + '٪'),
      label ? h('span', { style: { fontSize: s > 90 ? 11 : 8.5, color: 'var(--text-dim)' } }, label) : null)
  );
}

function trendSvg(vals, avg, key) {
  const W = 720, H = 210, pad = 14, max = 100, min = 0;
  const px = (i) => pad + (i / Math.max(1, vals.length - 1)) * (W - pad * 2);
  const py = (v) => pad + (1 - (v - min) / (max - min)) * (H - pad * 2 - 8);
  const path = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1)).join(' ');
  const line = path(vals);
  const area = line + ' L' + px(vals.length - 1).toFixed(1) + ' ' + (H - pad) + ' L' + px(0).toFixed(1) + ' ' + (H - pad) + ' Z';
  const gid = 'ntr-' + key;
  const grid = [25, 50, 75, 100].map((g, i) => h('line', { key: 'g' + i, x1: pad, y1: py(g), x2: W - pad, y2: py(g), strokeWidth: 1, strokeDasharray: '3 5', style: { stroke: 'rgba(244,234,215,.1)' } }));
  const dots = vals.map((v, i) => h('circle', { key: 'd' + i, cx: px(i), cy: py(v), r: 2.4, style: { fill: 'var(--char-accent)' } }));
  return h('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: '100%', preserveAspectRatio: 'none', style: { display: 'block' } },
    h('defs', null, h('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' },
      h('stop', { offset: '0%', style: { stopColor: 'var(--char-accent)', stopOpacity: 0.3 } }),
      h('stop', { offset: '100%', style: { stopColor: 'var(--char-accent)', stopOpacity: 0 } }))),
    grid, h('path', { d: area, fill: 'url(#' + gid + ')' }),
    h('path', { d: path(avg), fill: 'none', strokeWidth: 1.6, strokeDasharray: '5 4', style: { stroke: 'var(--gold-antique)' } }),
    h('path', { d: line, fill: 'none', strokeWidth: 2.2, strokeLinejoin: 'round', strokeLinecap: 'round', style: { stroke: 'var(--char-accent)' } }),
    dots
  );
}

function funnelSvg(stages, key) {
  const W = 960, H = 190, n = stages.length, colW = W / n, barW = colW * 0.44, mid = H / 2;
  const top = stages[0].v || 1;
  const hh = stages.map((s) => Math.max(16, (s.v / top) * (H - 34)));
  const cx = stages.map((s, i) => W - (colW * (i + 0.5)));
  const gid = 'nfn-' + key;
  const poly = [];
  for (let i = n - 1; i >= 0; i--) poly.push([cx[i], mid - hh[i] / 2]);
  for (let i = 0; i < n; i++) poly.push([cx[i], mid + hh[i] / 2]);
  const pts = poly.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const bars = stages.map((s, i) => h('g', { key: 'b' + i },
    h('rect', { x: cx[i] - barW / 2, y: mid - hh[i] / 2, width: barW, height: hh[i], rx: 6, style: { fill: 'var(--char-accent)', fillOpacity: 0.9 - i * 0.16 } }),
    h('rect', { x: cx[i] - barW / 2, y: mid - hh[i] / 2, width: barW, height: hh[i], rx: 6, fill: 'none', strokeWidth: 1, style: { stroke: 'var(--border-gold)' } })
  ));
  return h('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: 190, preserveAspectRatio: 'none', style: { display: 'block' } },
    h('defs', null, h('linearGradient', { id: gid, x1: '1', y1: '0', x2: '0', y2: '0' },
      h('stop', { offset: '0%', style: { stopColor: 'var(--char-accent)', stopOpacity: 0.24 } }),
      h('stop', { offset: '100%', style: { stopColor: 'var(--char-accent)', stopOpacity: 0.04 } }))),
    h('polygon', { points: pts, fill: 'url(#' + gid + ')' }), bars
  );
}

function rDistSvg(buckets) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const cells = buckets.map((b, i) => {
    const neg = b.r < 0, hgt = Math.max(3, (b.count / max) * 66);
    return h('div', { key: 'r' + i, style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 } },
      h('div', { style: { height: 70, display: 'flex', alignItems: 'flex-end', width: '100%' } },
        neg ? null : h('div', { style: { width: '76%', margin: '0 auto', height: hgt, borderRadius: '4px 4px 0 0', background: 'var(--char-accent)', opacity: 0.35 + (b.count / max) * 0.6 } })),
      h('div', { style: { height: 1, width: '100%', background: 'rgba(244,234,215,.14)' } }),
      h('div', { style: { height: 70, display: 'flex', alignItems: 'flex-start', width: '100%' } },
        neg ? h('div', { style: { width: '76%', margin: '0 auto', height: hgt, borderRadius: '0 0 4px 4px', background: 'var(--danger)', opacity: 0.3 + (b.count / max) * 0.55 } }) : null)
    );
  });
  return h('div', { style: { display: 'flex', gap: 3, direction: 'ltr', alignItems: 'stretch' } }, cells);
}

function heatCellEl(v, lang) {
  return h('div', {
    title: v ? digits(lang, v) : '',
    style: { height: 30, borderRadius: 5, background: 'color-mix(in srgb, var(--char-accent) ' + Math.round(8 + v * 15) + '%, transparent)', border: '1px solid rgba(244,234,215,.06)', display: 'grid', placeItems: 'center', fontSize: 10.5, color: v > 3 ? 'var(--ink-950)' : 'var(--text-primary)', fontWeight: 600 }
  }, v ? digits(lang, v) : '');
}
function barFillEl(pct, tone) {
  return h('span', { style: { display: 'block', height: '100%', width: Math.max(0, Math.min(100, pct)) + '%', borderRadius: 5, background: tone === 'gold' ? 'var(--gold-antique)' : 'var(--char-accent)', boxShadow: '0 0 12px var(--char-glow)' } });
}

// ---- real data helpers ----

function statusOf(item) { return item.active !== false ? 'live' : 'draft'; }
function isPatternKind(kind) { return kind === 'pattern'; }

function allSessions() {
  try { return JSON.parse(localStorage.getItem('tradejournal:sessions:v1:shared')) || []; } catch (_) { return []; }
}

// Same real source pattern-registry-store.js's own scenarioReport() reads, extended with the
// per-scenario stage-id membership and the owning session's real date, since the store's own
// aggregate function doesn't expose either (needed for the trend chart and per-step bars below).
function patternDetectionRows(patternId) {
  const rows = [];
  allSessions().forEach((session) => {
    const sessionDate = session.startedAt || session.createdAt;
    (session.entries || []).forEach((entry) => {
      (entry.scenarios || []).forEach((scenario) => {
        if (!scenario.pattern || scenario.pattern.patternTagId !== patternId) return;
        const stages = scenario.pattern.stages || [];
        const completed = scenario.pattern.completedStageIds || [];
        rows.push({ sessionDate, occurred: scenario.occurred === true, stages, completedStageIds: completed });
      });
    });
  });
  return rows;
}

function weeklyBuckets(dates, weeks) {
  const now = Date.now(), weekMs = 7 * 86400000;
  const buckets = Array.from({ length: weeks }, () => 0);
  dates.forEach((d) => {
    const t = new Date(d).getTime();
    if (!Number.isFinite(t)) return;
    const weeksAgo = Math.floor((now - t) / weekMs);
    if (weeksAgo >= 0 && weeksAgo < weeks) buckets[weeks - 1 - weeksAgo] += 1;
  });
  return buckets;
}

// Honest 12-week realization-rate trend: for each of the last 12 weeks, % of that week's
// detections which occurred/were confirmed. Weeks with zero detections carry forward the
// previous week's rate (avoids a misleading drop to 0 on a quiet week) or 0 for the first week.
function realizationTrend(items, weeks) {
  const now = Date.now(), weekMs = 7 * 86400000;
  const buckets = Array.from({ length: weeks }, () => ({ total: 0, ok: 0 }));
  items.forEach(({ date, ok }) => {
    const t = new Date(date).getTime();
    if (!Number.isFinite(t)) return;
    const weeksAgo = Math.floor((now - t) / weekMs);
    if (weeksAgo >= 0 && weeksAgo < weeks) { const b = buckets[weeks - 1 - weeksAgo]; b.total += 1; if (ok) b.ok += 1; }
  });
  const rates = []; let last = 0;
  buckets.forEach((b) => { if (b.total) last = Math.round((b.ok / b.total) * 100); rates.push(last); });
  return rates;
}
function movingAverage(vals, k) {
  return vals.map((_, i) => { const a = Math.max(0, i - k); const slice = vals.slice(a, i + 1); return Math.round(slice.reduce((x, y) => x + y, 0) / slice.length); });
}

function linkedTradesFor(kind, id) {
  const store = window.TradeJournalTradeStore;
  if (!store) return [];
  return store.filter(null, isPatternKind(kind) ? { patternId: id } : { strategyId: id });
}

function rDistribution(trades) {
  const buckets = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4].map((r) => ({ r, count: 0 }));
  let counted = 0;
  trades.forEach((t) => {
    if (t.rr === null || t.rr === undefined || !Number.isFinite(Number(t.rr))) return;
    counted += 1;
    const rr = Number(t.rr);
    let nearest = buckets[0], best = Infinity;
    buckets.forEach((b) => { const d = Math.abs(b.r - rr); if (d < best) { best = d; nearest = b; } });
    nearest.count += 1;
  });
  return { buckets, counted };
}

function sessionWeekdayHeat(trades, lang) {
  const sessions = ['sydney', 'tokyo', 'london', 'newyork'];
  const table = sessions.map(() => [0, 0, 0, 0, 0, 0, 0]);
  trades.forEach((t) => {
    const si = sessions.indexOf(t.session);
    if (si < 0) return;
    const day = new Date(t.createdAt).getDay(); // 0=Sun..6=Sat, design order is Sat..Fri
    const col = (day + 1) % 7;
    table[si][col] += 1;
  });
  return table;
}

function patternGroupLabelFor(field) {
  const map = { entryRules: 'entryRulesLabel', stopLossRules: 'stopRulesLabel', exitTargetRules: 'exitRulesLabel', positionSizingRules: 'sizingRulesLabel' };
  return map[field];
}

const inputStyle = { boxSizing: 'border-box', height: 44, padding: '0 13px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'inherit', fontSize: 13.5, outline: 'none', width: '100%' };
const textareaStyle = { boxSizing: 'border-box', padding: '11px 13px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'inherit', fontSize: 13, lineHeight: 1.9, resize: 'vertical', outline: 'none', width: '100%' };

function TextField_({ label, value, onCommit, placeholder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</label>
      <input type="text" defaultValue={value || ''} placeholder={placeholder} dir="auto" style={inputStyle}
        onBlur={(e) => { if (e.target.value !== (value || '')) onCommit(e.target.value); }} />
    </div>
  );
}
function TextAreaField_({ label, value, onCommit, placeholder, rows, help }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</label>
      <textarea defaultValue={value || ''} placeholder={placeholder} rows={rows || 3} dir="auto" style={textareaStyle}
        onBlur={(e) => { if (e.target.value !== (value || '')) onCommit(e.target.value); }} />
      {help && <span style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.8 }}>{help}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Index view
// ---------------------------------------------------------------------------------------------

function SummaryTile({ icon, label, value }) {
  return (
    <div style={{ boxSizing: 'border-box', width: 148, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-gold)', background: 'var(--surface-card)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-muted)', fontSize: 10.5, letterSpacing: '.08em' }}><Icon name={icon} size={14} />{label}</span>
      <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--parchment)', lineHeight: 1 }}>{value}</span>
    </div>
  );
}

function ItemCard({ item, kind, lang, onOpen, onReport, onShare, onDelete }) {
  const stages = item.stages || [];
  let detCount = 0, realization = null, trendVals = [10, 20, 15, 25, 20, 30, 25, 35, 30, 40, 35, 45];
  if (isPatternKind(kind)) {
    const rows = patternDetectionRows(item.id);
    detCount = rows.length;
    realization = rows.length ? Math.round((rows.filter((r) => r.occurred).length / rows.length) * 100) : null;
    if (rows.length) {
      const weeks = weeklyBuckets(rows.map((r) => r.sessionDate), 12);
      const cum = []; let running = 0; weeks.forEach((w) => { running += w; cum.push(running); });
      trendVals = cum.some((v) => v > 0) ? cum : trendVals;
    }
  } else {
    const stats = window.TradeJournalStrategyEducationStore ? window.TradeJournalStrategyEducationStore.detectionStats(item) : { total: 0, confirmationRate: null };
    detCount = stats.total; realization = stats.confirmationRate;
    if (item.detectionEvents && item.detectionEvents.length) {
      const weeks = weeklyBuckets(item.detectionEvents.map((e) => e.detectedAt), 12);
      const cum = []; let running = 0; weeks.forEach((w) => { running += w; cum.push(running); });
      trendVals = cum.some((v) => v > 0) ? cum : trendVals;
    }
  }
  const linked = linkedTradesFor(kind, item.id).length;
  const delta = trendVals[trendVals.length - 1] - trendVals[0];
  const listed = !!item.isPublic;
  const status = statusOf(item);
  const desc = isPatternKind(kind) ? item.description : (item.overallFramework && item.overallFramework.description) || '';

  return (
    <Panel variant="base" ornament padding={0}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '16px 17px 13px' }}>
          <span style={{ position: 'relative', flex: 'none', width: 64, height: 64, borderRadius: 10, border: '1px solid var(--border-gold)', background: 'linear-gradient(160deg,rgba(183,138,74,.1),rgba(3,8,7,.7))', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            {glyphChart(item.id, 46)}
          </span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span dir="auto" style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--parchment)', letterSpacing: '.01em' }}>{item.name || '—'}</span>
              {listed && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: '0 7px', borderRadius: 5, fontSize: 10, color: 'var(--gold-warm)', border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.1)' }}>{tr(lang, 'marketplaceBadge')}</span>}
            </span>
            <span dir="auto" style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{desc}</span>
          </div>
          <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 9px', borderRadius: 6, fontSize: 10.5, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)', color: 'var(--text-muted)' }}>
            {/* Was a fixed var(--success) green regardless of character - on every non-hunter
                theme this dot read as an off-brand green fixed in the middle of the card (the
                one --success is close enough to hunter's own #66C94E accent that it looked
                native there, and only stood out as "wrong" everywhere else). "Live" here means
                "part of my active set," an identity concept, not a win/loss outcome - so it
                follows the character accent like the rest of the card chrome instead. */}
            <span style={{ width: 7, height: 7, borderRadius: '50%', display: 'block', background: status === 'live' ? 'var(--char-accent)' : 'var(--warning)' }}></span>
            {status === 'live' ? tr(lang, 'statusLive') : tr(lang, 'statusDraft')}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'var(--border-hairline)', borderTop: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)' }}>
          {[[tr(lang, 'statStages'), digits(lang, stages.length)], [tr(lang, 'statDetections'), digits(lang, detCount)], [tr(lang, 'statLinkedTrades'), digits(lang, linked)]].map(([label, value]) => (
            <span key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '11px 14px', background: 'rgba(3,8,7,.34)' }}>
              <span style={{ fontSize: 10, letterSpacing: '.07em', color: 'var(--text-dim)' }}>{label}</span>
              <span className="navrya-tabular" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 17px 6px' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10.5, letterSpacing: '.07em', color: 'var(--text-dim)' }}>{tr(lang, 'trendLabel')}</span>
              <span style={{ fontSize: 11, color: 'var(--char-accent)' }}>{(delta >= 0 ? '+' : '−') + digits(lang, Math.abs(delta)) + ' واحد'}</span>
            </span>
            <span style={{ display: 'block', height: 46 }}>{sparkChart(trendVals, item.id, 'var(--char-accent)')}</span>
          </div>
          <span style={{ flex: 'none' }}>{donutChart(realization, 62, tr(lang, 'kpiRealization').split(' ')[0], lang)}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 14px' }}>
          <Button variant="primary" size="sm" icon="open" onClick={onOpen}>{tr(lang, 'openBtn')}</Button>
          <Button variant="secondary" size="sm" icon="report" onClick={onReport}>{tr(lang, 'reportBtn')}</Button>
          <Button variant="secondary" size="sm" icon="Share2" onClick={onShare}>{tr(lang, 'shareBtn')}</Button>
          <span style={{ marginInlineStart: 'auto' }}>
            <Button variant="ghost" size="sm" icon="trash" onClick={onDelete}> </Button>
          </span>
        </div>
      </div>
    </Panel>
  );
}

// Shared top pill bar (Patterns / Strategies / Positions) - both IndexView and PositionsView
// render it identically so switching between the three feels like one continuous screen, not
// three unrelated pages. `rightSlot` carries whatever page-specific actions sit to its right
// (the "+ New pattern/strategy" buttons for the first two, nothing for Positions).
function TopTabBar({ lang, tab, setTab, patternsCount, strategiesCount, tradesCount, rightSlot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 7, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'var(--surface-card)', boxShadow: 'var(--shadow-panel)' }}>
        {[['patterns', tr(lang, 'tabPatterns'), 'execution', patternsCount], ['strategies', tr(lang, 'tabStrategies'), 'strategies', strategiesCount], ['positions', tr(lang, 'tabPositions'), 'list-checks', tradesCount]].map(([id, label, icon, count]) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{
            boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 20px', borderRadius: 8, cursor: 'pointer',
            border: tab === id ? '2px solid var(--char-accent)' : '1px solid transparent', background: tab === id ? 'var(--char-active-surface)' : 'transparent',
            color: tab === id ? 'var(--char-accent)' : 'var(--text-muted)', font: 'inherit', fontSize: 14, fontWeight: tab === id ? 600 : 500,
            boxShadow: tab === id ? '0 0 16px var(--char-glow)' : 'none'
          }}>
            <Icon name={icon} size={18} />{label}
            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 5, background: 'rgba(3,8,7,.45)', border: '1px solid currentColor' }}>{digits(lang, count)}</span>
          </button>
        ))}
      </div>
      {rightSlot && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{rightSlot}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Positions: the full trade list (date/direction/pattern/status/RR/outcome/P&L/mood/actions,
// searchable and filterable across every status) - trade-reports.js's legacy renderTrades()
// had this exact feature set on its own "All Trades" tab, but that vanilla module renders into
// the old panel-system DOM (layer.show()) this hub replaced, so it never had anywhere to mount
// once Strategies moved to this unified React hub. Same real TradeJournalTradeStore.filter()
// data, same TradeJournalTradeUI.editTrade()/viewTrade() actions, just resurfaced as a real tab
// here instead of a dangling, unreachable module.
// ---------------------------------------------------------------------------------------------

function money(lang, n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  return (v < 0 ? '−' : '') + digits(lang, Math.abs(v).toLocaleString(localeCode(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' USD';
}

function PositionsView({ lang, tab, setTab, patternsCount, strategiesCount }) {
  const tradeStore = window.TradeJournalTradeStore;
  const tradeUi = window.TradeJournalTradeUI;
  const tradeI18n = window.TradeJournalTradeI18n;
  const patternStore = window.TradeJournalPatternStore;
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [direction, setDirection] = React.useState('');
  const [patternId, setPatternId] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');

  const allPatterns = patternStore ? patternStore.listSync() : [];
  const trades = tradeStore ? tradeStore.filter(tradeStore.listSync(), { query, status, direction, patternId, from, to }) : [];
  const patternName = (id) => { const p = allPatterns.find((x) => x.id === id); return p ? p.name : id; };
  const statusLabel = (value) => (tradeUi && tradeUi.statusLabel ? tradeUi.statusLabel(value) : value);
  const outcomeLabel = (value) => (tradeUi && tradeUi.outcomeLabel ? tradeUi.outcomeLabel(value) : (value || '—'));
  const directionLabel = (value) => tr(lang, value === 'short' ? 'directionShort' : 'directionLong');

  const selectStyle = { height: 40, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5, outline: 'none' };
  const columns = '1fr .8fr 1.1fr .9fr .6fr .8fr .9fr 1fr .8fr';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 640, paddingTop: 6 }}>
        <span style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--char-accent)' }}>{tr(lang, 'eyebrow')}</span>
        <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.25, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'positionsTitle')}</h1>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.9, color: 'var(--text-muted)' }}>{tr(lang, 'positionsSubtitle')}</p>
      </div>

      <TopTabBar lang={lang} tab={tab} setTab={setTab} patternsCount={patternsCount} strategiesCount={strategiesCount} tradesCount={tradeStore ? tradeStore.listSync().length : 0} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, height: 40, padding: '0 13px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)', flex: 1, minWidth: 240, maxWidth: 360, color: 'var(--text-dim)' }}>
          <Icon name="search" size={16} />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr(lang, 'positionsSearchPlaceholder')} style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5 }} />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          <option value="">{tr(lang, 'positionsAllStatuses')}</option>
          {['hunting', 'open', 'closed', 'cancelled'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        <select value={direction} onChange={(e) => setDirection(e.target.value)} style={selectStyle}>
          <option value="">{tr(lang, 'positionsAllDirections')}</option>
          <option value="long">{tr(lang, 'directionLong')}</option>
          <option value="short">{tr(lang, 'directionShort')}</option>
        </select>
        <select value={patternId} onChange={(e) => setPatternId(e.target.value)} style={selectStyle}>
          <option value="">{tr(lang, 'positionsAllPatterns')}</option>
          {allPatterns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" value={from} title={tr(lang, 'positionsFrom')} onChange={(e) => setFrom(e.target.value)} style={selectStyle} />
        <input type="date" value={to} title={tr(lang, 'positionsTo')} onChange={(e) => setTo(e.target.value)} style={selectStyle} />
        <span style={{ marginInlineStart: 'auto', fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'positionsResultLine', { n: digits(lang, trades.length) })}</span>
      </div>

      {!trades.length ? (
        <Panel variant="quiet" padding="34px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'positionsEmptyTitle')}</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{tr(lang, 'positionsEmptyBody')}</span>
          </div>
        </Panel>
      ) : (
        <Panel variant="base" padding={0}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: columns, gap: 0, minWidth: 920 }}>
              {[tr(lang, 'positionsHeadDate'), tr(lang, 'positionsHeadDirection'), tr(lang, 'positionsHeadPattern'), tr(lang, 'positionsHeadStatus'), tr(lang, 'positionsHeadRR'), tr(lang, 'positionsHeadOutcome'), tr(lang, 'positionsHeadPnl'), tr(lang, 'positionsHeadMood'), tr(lang, 'positionsHeadActions')].map((th) => (
                <span key={th} style={{ padding: '9px 14px', fontSize: 10.5, letterSpacing: '.07em', color: 'var(--text-dim)', borderBottom: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)' }}>{th}</span>
              ))}
              {trades.map((trade) => {
                const rr = trade.rr === null || trade.rr === undefined ? null : Number(trade.rr);
                const rColor = rr === null ? 'var(--text-dim)' : rr >= 0 ? 'var(--success)' : 'var(--danger)';
                const names = allPatterns.filter((p) => trade.linkedPatternIds.indexOf(p.id) > -1).map((p) => p.name).join(', ') || tr(lang, 'positionsNoPattern');
                const lastEmotion = (trade.emotionLog || []).length ? trade.emotionLog[trade.emotionLog.length - 1] : null;
                const mood = lastEmotion && lastEmotion.dominantEmotions && lastEmotion.dominantEmotions.length
                  ? lastEmotion.dominantEmotions.slice(0, 2).map((id) => (tradeI18n ? tradeI18n.t(id) : id)).join(' · ')
                  : tr(lang, 'positionsNoMood');
                const pnlColor = trade.pnl > 0 ? 'var(--success)' : trade.pnl < 0 ? 'var(--danger)' : 'var(--text-primary)';
                return (
                  <React.Fragment key={trade.id}>
                    <span className="navrya-tabular" dir="ltr" style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-hairline)', textAlign: 'right' }}>{new Date(trade.createdAt).toLocaleDateString(localeCode(lang))}</span>
                    <span style={{ padding: '11px 14px', fontSize: 12.5, color: trade.direction === 'short' ? 'var(--danger)' : 'var(--success)', borderBottom: '1px solid var(--border-hairline)' }}>{directionLabel(trade.direction)}</span>
                    <span dir="auto" style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-hairline)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{names}</span>
                    <span style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-hairline)' }}>{statusLabel(trade.status)}</span>
                    <span className="navrya-tabular" dir="ltr" style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 600, color: rColor, borderBottom: '1px solid var(--border-hairline)' }}>{rr === null ? '—' : '1:' + digits(lang, round1(rr))}</span>
                    <span style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-hairline)' }}>{outcomeLabel(trade.outcome)}</span>
                    <span className="navrya-tabular" dir="ltr" style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 600, color: pnlColor, borderBottom: '1px solid var(--border-hairline)' }}>{money(lang, trade.pnl)}</span>
                    <span dir="auto" style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-hairline)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mood}</span>
                    <span style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--border-hairline)' }}>
                      <button type="button" title={tr(lang, 'positionsEdit')} onClick={() => tradeUi && tradeUi.editTrade(trade.id)} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)' }}><Icon name="edit" size={14} /></button>
                      <button type="button" title={tr(lang, 'positionsDetails')} onClick={() => tradeUi && tradeUi.viewTrade(trade.id)} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)' }}><Icon name="eye" size={14} /></button>
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

function IndexView({ lang, tab, setTab, query, setQuery, sort, setSort, patterns, strategies, onOpen, onReport, onShare, onDelete, onNew, onFromEvent }) {
  const list = tab === 'patterns' ? patterns : strategies;
  const sortLabels = [tr(lang, 'sortRecent'), tr(lang, 'sortRealization'), tr(lang, 'sortUsage')];
  const q = query.trim().toLowerCase();
  const filtered = list.filter((it) => {
    if (!q) return true;
    const hay = (it.name + ' ' + (isPatternKind(tab === 'patterns' ? 'pattern' : 'strategy') ? it.description || '' : (it.overallFramework && it.overallFramework.description) || '')).toLowerCase();
    return hay.indexOf(q) > -1;
  });
  const withMetrics = filtered.map((it) => {
    let realization = 0, usage = 0;
    if (tab === 'patterns') { const r = patternDetectionRows(it.id); realization = r.length ? (r.filter((x) => x.occurred).length / r.length) * 100 : 0; usage = it.usageCount || 0; }
    else { const stats = window.TradeJournalStrategyEducationStore ? window.TradeJournalStrategyEducationStore.detectionStats(it) : { confirmationRate: 0, total: 0 }; realization = stats.confirmationRate || 0; usage = stats.total; }
    return { it, realization, usage };
  });
  if (sort === sortLabels[1]) withMetrics.sort((a, b) => b.realization - a.realization);
  else if (sort === sortLabels[2]) withMetrics.sort((a, b) => b.usage - a.usage);
  else withMetrics.sort((a, b) => new Date(b.it.updatedAt) - new Date(a.it.updatedAt));
  const sorted = withMetrics.map((x) => x.it);

  const totalDet = patterns.reduce((a, p) => a + patternDetectionRows(p.id).length, 0)
    + strategies.reduce((a, s) => a + ((s.detectionEvents || []).length), 0);
  const patternRealRates = patterns.map((p) => { const r = patternDetectionRows(p.id); return r.length ? (r.filter((x) => x.occurred).length / r.length) * 100 : null; }).filter((v) => v !== null);
  const avgRealization = patternRealRates.length ? Math.round(patternRealRates.reduce((a, b) => a + b, 0) / patternRealRates.length) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap', paddingTop: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 640 }}>
          <span style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--char-accent)' }}>{tr(lang, 'eyebrow')}</span>
          <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.25, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'title')}</h1>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.9, color: 'var(--text-muted)' }}>{tr(lang, 'subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <SummaryTile icon="execution" label={tr(lang, 'summaryPatterns')} value={digits(lang, patterns.length)} />
          <SummaryTile icon="ScanSearch" label={tr(lang, 'summaryDetections')} value={digits(lang, totalDet)} />
          <SummaryTile icon="CircleCheck" label={tr(lang, 'summaryAvgRealization')} value={avgRealization === null ? '—' : digits(lang, avgRealization) + '٪'} />
        </div>
      </div>

      <TopTabBar
        lang={lang} tab={tab} setTab={setTab} patternsCount={patterns.length} strategiesCount={strategies.length}
        tradesCount={window.TradeJournalTradeStore ? window.TradeJournalTradeStore.listSync().length : 0}
        rightSlot={<>
          {tab === 'strategies' && <Button variant="secondary" icon="sparkle" onClick={onFromEvent}>{tr(lang, 'fromEvent')}</Button>}
          <Button variant="primary" icon="plus" onClick={onNew}>{tab === 'patterns' ? tr(lang, 'newPattern') : tr(lang, 'newStrategy')}</Button>
        </>}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, height: 40, padding: '0 13px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)', flex: 1, minWidth: 240, maxWidth: 360, color: 'var(--text-dim)' }}>
          <Icon name="search" size={16} />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr(lang, 'searchPlaceholder')} style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5 }} />
        </label>
        <span style={{ display: 'flex', gap: 6 }}>
          {sortLabels.map((s) => (
            <button key={s} type="button" onClick={() => setSort(s)} style={{ height: 40, padding: '0 14px', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontSize: 12, border: '1px solid ' + (sort === s ? 'var(--char-accent)' : 'var(--border-hairline)'), background: sort === s ? 'var(--char-active-surface)' : 'transparent', color: sort === s ? 'var(--char-accent)' : 'var(--text-muted)' }}>{s}</button>
          ))}
        </span>
        <span style={{ marginInlineStart: 'auto', fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'resultLine', { n: digits(lang, sorted.length), sort })}</span>
      </div>

      {!sorted.length ? (
        <Panel variant="quiet" padding="34px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'emptyIndexTitle')}</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{tr(lang, 'emptyIndexBody')}</span>
          </div>
        </Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(392px,1fr))', gap: 16, alignItems: 'start' }}>
          {sorted.map((it) => (
            <ItemCard key={it.id} item={it} kind={tab === 'patterns' ? 'pattern' : 'strategy'} lang={lang}
              onOpen={() => onOpen(tab === 'patterns' ? 'pattern' : 'strategy', it.id, 'details')}
              onReport={() => onOpen(tab === 'patterns' ? 'pattern' : 'strategy', it.id, 'report')}
              onShare={() => onOpen(tab === 'patterns' ? 'pattern' : 'strategy', it.id, 'share')}
              onDelete={() => onDelete(tab === 'patterns' ? 'pattern' : 'strategy', it.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Detail: Details tab
// ---------------------------------------------------------------------------------------------

function PatternDetailsTab({ lang, pattern, onSave, onAiSteps }) {
  const [, tick] = React.useReducer((x) => x + 1, 0);
  const fileRef = React.useRef(null);
  const [newStep, setNewStep] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [shotUrls, setShotUrls] = React.useState({});
  const [savedAt, setSavedAt] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (pattern.referenceScreenshots || []).forEach(async (shot) => {
      if (shotUrls[shot.id]) return;
      const url = await window.TradeJournalPatternStore.screenshotUrl(shot);
      if (url && !cancelled) setShotUrls((prev) => ({ ...prev, [shot.id]: url }));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern.referenceScreenshots.map((s) => s.id).join(',')]);

  function patch(fields) { Object.assign(pattern, fields); onSave(pattern); setSavedAt(Date.now()); }

  // AI process registry (A4) - reuses the SAME process id pattern-registry.js's legacy editor()
  // already registers ('pattern-editor-' + pattern.id), with the exact same allowlist
  // (patternTypes.patternStagePaths - name/description only), so AI-fill works identically
  // regardless of which surface is mounted, mirroring StrategyDetailsTab's reasoning above.
  // Mounted only while dtab === 'details' (DetailView, above).
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry, patternTypes = window.TradeJournalPatternTypes;
    if (!registry || !patternTypes) return undefined;
    const allowlist = (patternTypes.patternStagePaths || []).slice();
    registry.register('pattern-editor-' + pattern.id, {
      allowlist,
      isOpen: () => mountedRef.current,
      applyValue: (path, value) => { if (path === 'name' && allowlist.indexOf('name') > -1) patch({ name: String(value ?? '') }); else if (path === 'description' && allowlist.indexOf('description') > -1) patch({ description: String(value ?? '') }); }
    });
    return () => { mountedRef.current = false; };
  }, [pattern.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function patchStage(index, text) { const stages = pattern.stages.slice(); stages[index] = { ...stages[index], text }; patch({ stages }); }
  function deleteStage(index) { patch({ stages: pattern.stages.filter((_, i) => i !== index) }); }
  function addStage() { if (!newStep.trim()) return; patch({ stages: pattern.stages.concat([{ id: window.TradeJournalPatternStore.createStage(newStep.trim(), pattern.stages.length + 1).id, order: pattern.stages.length + 1, text: newStep.trim() }]) }); setNewStep(''); }
  async function upload(files) {
    if (!files || !files.length) return;
    setBusy(true);
    try { await window.TradeJournalPatternStore.addScreenshots(pattern.id, Array.from(files)); onSave(window.TradeJournalPatternStore.find(pattern.id)); }
    catch (_) { /* validation error (type/size) - screenshots simply stay unchanged */ }
    setBusy(false);
  }
  async function removeShot(id) { await window.TradeJournalPatternStore.removeScreenshot(pattern.id, id); onSave(window.TradeJournalPatternStore.find(pattern.id)); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Panel variant="base" padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--char-accent)' }}>{tr(lang, 'defTitle')}</span>
            {savedAt && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--success)' }}><Icon name="check" size={13} />{tr(lang, 'changesSaved')}</span>}
          </span>
          <TextField_ label={tr(lang, 'nameLabel')} value={pattern.name} onCommit={(v) => patch({ name: v })} />
          <TextAreaField_ label={tr(lang, 'descLabel')} value={pattern.description} rows={3} onCommit={(v) => patch({ description: v })} help={tr(lang, 'descHelp')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 14, borderRadius: 10, border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.05)' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'thresholdTitle')}</span>
              <span className="navrya-tabular" style={{ fontSize: 20, fontWeight: 700, color: 'var(--char-accent)' }}>{digits(lang, pattern.completionThreshold) + '٪'}</span>
            </span>
            <input type="range" min="0" max="100" step="5" value={pattern.completionThreshold} onChange={(e) => patch({ completionThreshold: Number(e.target.value) })} style={{ width: '100%', accentColor: 'var(--char-accent)', cursor: 'pointer' }} />
            <span style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.8 }}>{tr(lang, 'thresholdHelp')}</span>
          </div>
        </div>
      </Panel>

      <Panel variant="base" padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--char-accent)' }}>{tr(lang, 'stepsTitle')}</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(lang, 'stepsHelp')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pattern.stages.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
                <span className="navrya-tabular" style={{ flex: 'none', width: 26, height: 26, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, color: 'var(--char-accent)', border: '1px solid color-mix(in srgb, var(--char-accent) 45%, transparent)', background: 'var(--char-active-surface)' }}>{digits(lang, i + 1)}</span>
                <input type="text" defaultValue={s.text} dir="auto" onBlur={(e) => { if (e.target.value !== s.text) patchStage(i, e.target.value); }} style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', height: 38, padding: '0 11px', borderRadius: 7, border: '1px solid transparent', background: 'rgba(3,8,7,.5)', color: 'var(--text-primary)', font: 'inherit', fontSize: 13, outline: 'none' }} />
                <button type="button" onClick={() => deleteStage(i)} aria-label={tr(lang, 'deleteStep')} style={{ flex: 'none', width: 34, height: 34, borderRadius: 7, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-dim)' }}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="text" value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder={tr(lang, 'newStepPlaceholder')} dir="auto" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', height: 42, padding: '0 13px', borderRadius: 8, border: '1px dashed var(--divider-gold)', background: 'rgba(3,8,7,.4)', color: 'var(--text-primary)', font: 'inherit', fontSize: 13, outline: 'none' }} onKeyDown={(e) => { if (e.key === 'Enter') addStage(); }} />
            <Button variant="secondary" icon="plus" onClick={addStage}>{tr(lang, 'addStep')}</Button>
          </div>
          <div>
            <Button variant="secondary" icon="sparkle" disabled={busy} onClick={async () => { setBusy(true); await onAiSteps(); setBusy(false); }}>{tr(lang, 'aiWriteSteps')}</Button>
          </div>
        </div>
      </Panel>

      <Panel variant="base" padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <span style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--char-accent)' }}>{tr(lang, 'shotsTitle')}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 12 }}>
            {(pattern.referenceScreenshots || []).map((shot) => (
              <span key={shot.id} style={{ position: 'relative', display: 'block', borderRadius: 9, overflow: 'hidden', border: '1px solid var(--border-gold)', background: '#000', aspectRatio: '16/10' }}>
                {shotUrls[shot.id] && <img src={shotUrls[shot.id]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: .92 }} />}
                <span style={{ position: 'absolute', insetInlineStart: 0, insetBlockEnd: 0, width: '100%', padding: '20px 10px 8px', boxSizing: 'border-box', background: 'linear-gradient(to top,rgba(3,8,7,.9),transparent)', fontSize: 11, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <span dir="auto">{shot.fileName}</span>
                  <button type="button" onClick={() => removeShot(shot.id)} title={tr(lang, 'removeShot')} style={{ border: 0, background: 'rgba(0,0,0,.5)', color: 'var(--danger)', borderRadius: 5, width: 22, height: 22, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon name="trash" size={12} /></button>
                </span>
              </span>
            ))}
            <button type="button" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, aspectRatio: '16/10', borderRadius: 9, cursor: 'pointer', border: '1px dashed var(--divider-gold)', background: 'rgba(183,138,74,.04)', color: 'var(--text-muted)', font: 'inherit' }}>
              <Icon name="upload" size={22} /><span style={{ fontSize: 12 }}>{tr(lang, 'uploadShot')}</span><span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'uploadHint')}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function StrategyDetailsTab({ lang, strategy, onSave, onAiSteps, onGoChat }) {
  const [savedAt, setSavedAt] = React.useState(null);
  function set(path, value) { window.TradeJournalStrategyEducationStore.setPath(strategy, path, value); onSave(strategy); setSavedAt(Date.now()); }

  // AI process registry (A4) - reuses the SAME process id strategy-education.js's legacy
  // renderDetail() already registers ('strategy-editor-' + strategy.id), with the exact same
  // allowlist (strategyTypes.textPaths+numericPaths), so AI-fill works identically regardless of
  // which of the two surfaces (this NAVRYA hub, or the legacy DOM detail page) is actually
  // mounted - closing the gap where routing (panel-system.js -> TradeJournalNavryaCanvas ->
  // this file) may mean the legacy registration never fires in normal navigation. Mounted only
  // while dtab === 'details' (DetailView, above), so mount === open.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry, strategyTypes = window.TradeJournalStrategyEducationTypes;
    if (!registry || !strategyTypes) return undefined;
    const allowlist = (strategyTypes.textPaths || []).concat(strategyTypes.numericPaths || []);
    registry.register('strategy-editor-' + strategy.id, {
      allowlist,
      isOpen: () => mountedRef.current,
      applyValue: (path, value) => { if (allowlist.indexOf(path) > -1) set(path, value); }
    });
    return () => { mountedRef.current = false; };
  }, [strategy.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = strategy.positionManagement, r = strategy.riskManagement, o = strategy.overallFramework;
  const groups = [
    { icon: 'execution', title: tr(lang, 'groupPositionTitle'), sub: tr(lang, 'groupPositionSub'),
      fields: [
        { key: 'positionManagement.entryRules', label: tr(lang, 'entryRulesLabel'), value: p.entryRules },
        { key: 'positionManagement.stopLossRules', label: tr(lang, 'stopRulesLabel'), value: p.stopLossRules },
        { key: 'positionManagement.exitTargetRules', label: tr(lang, 'exitRulesLabel'), value: p.exitTargetRules },
        { key: 'positionManagement.positionSizingRules', label: tr(lang, 'sizingRulesLabel'), value: p.positionSizingRules }
      ], note: p.freeNotes, noteKey: 'positionManagement.freeNotes' },
    { icon: 'honour', title: tr(lang, 'groupRiskTitle'), sub: tr(lang, 'groupRiskSub'),
      fields: [
        { key: 'riskManagement.maxRiskPerTradePercent', label: tr(lang, 'maxRiskLabel'), value: r.maxRiskPerTradePercent, unit: tr(lang, 'percentUnit') },
        { key: 'riskManagement.dailyDrawdownLimitPercent', label: tr(lang, 'dailyDDLabel'), value: r.dailyDrawdownLimitPercent, unit: tr(lang, 'percentUnit') },
        { key: 'riskManagement.totalDrawdownLimitPercent', label: tr(lang, 'totalDDLabel'), value: r.totalDrawdownLimitPercent, unit: tr(lang, 'percentUnit') },
        { key: 'riskManagement.maxConcurrentTrades', label: tr(lang, 'maxConcurrentLabel'), value: r.maxConcurrentTrades, unit: tr(lang, 'tradeUnit') },
        { key: 'riskManagement.maxProfitCapPerTrade', label: tr(lang, 'profitCapLabel'), value: r.maxProfitCapPerTrade, unit: tr(lang, 'percentUnit') }
      ], note: r.freeNotes, noteKey: 'riskManagement.freeNotes' },
    { icon: 'quote', title: tr(lang, 'groupFrameworkTitle'), sub: tr(lang, 'groupFrameworkSub'),
      fields: [], note: o.description, noteKey: 'overallFramework.description', frameworkOnly: true }
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Panel variant="base" padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {savedAt && <span style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-end', fontSize: 11, color: 'var(--success)' }}><Icon name="check" size={13} />{tr(lang, 'changesSaved')}</span>}
          <TextField_ label={tr(lang, 'strategyNameLabel')} value={strategy.name} placeholder={tr(lang, 'strategyNamePlaceholder')} onCommit={(v) => set('name', v)} />
        </div>
      </Panel>
      {groups.map((g) => (
        <Panel key={g.title} variant="base" padding="18px 20px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ flex: 'none', width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--char-accent)', border: '1px solid color-mix(in srgb, var(--char-accent) 55%, transparent)', background: 'rgba(3,8,7,.6)' }}><Icon name={g.icon} size={18} /></span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{g.title}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{g.sub}</span>
              </span>
            </div>
            {!g.frameworkOnly && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
                {g.fields.map((f) => (
                  <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{f.label}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="text" dir="auto" defaultValue={f.value == null ? '' : f.value} onBlur={(e) => { const v = e.target.value; if (String(f.value == null ? '' : f.value) !== v) set(f.key, v); }} style={inputStyle} />
                      {f.unit && <span style={{ flex: 'none', fontSize: 11.5, color: 'var(--text-dim)' }}>{f.unit}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{tr(lang, 'freeNoteLabel')}</span>
              <textarea defaultValue={g.note || ''} dir="auto" rows={2} placeholder={tr(lang, 'freeNotePlaceholder')} onBlur={(e) => { if (e.target.value !== (g.note || '')) set(g.noteKey, e.target.value); }} style={textareaStyle} />
            </label>
          </div>
        </Panel>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="secondary" icon="sparkle" onClick={onAiSteps}>{tr(lang, 'aiWriteSteps')}</Button>
        <Button variant="secondary" icon="community" onClick={onGoChat}>{tr(lang, 'aiGoChat')}</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Detail: Chat tab
// ---------------------------------------------------------------------------------------------

function ChatTab({ lang, kind, item, onSave }) {
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [pendingStages, setPendingStages] = React.useState(null);
  const listRef = React.useRef(null);
  React.useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [item.chatHistory.length, pendingStages]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft(''); setSending(true);
    if (isPatternKind(kind)) {
      const store = window.TradeJournalPatternStore;
      const pattern = store.find(item.id);
      pattern.chatHistory = pattern.chatHistory.concat([{ id: store.createStage('', 0).id, role: 'user', content: text, createdAt: new Date().toISOString() }]);
      store.save(pattern);
      onSave(pattern);
      const result = await window.TradeJournalPatternAI.chat(pattern, text);
      const fresh = store.find(item.id);
      fresh.chatHistory = fresh.chatHistory.concat([{ id: store.createStage('', 0).id, role: 'assistant', content: result.reply, createdAt: new Date().toISOString() }]);
      store.save(fresh);
      onSave(fresh);
      setPendingStages(result.suggestedStages && result.suggestedStages.length ? result.suggestedStages : null);
    } else {
      const store = window.TradeJournalStrategyEducationStore;
      let strategy = store.find(item.id);
      strategy = store.addMessage(strategy, 'user', text);
      onSave(strategy);
      const result = await window.TradeJournalStrategyEducationAI.chat(strategy, text);
      strategy = store.addMessage(store.find(item.id), 'assistant', result.reply, result.suggestions || []);
      onSave(strategy);
    }
    setSending(false);
  }

  function applyPatternStages() {
    const store = window.TradeJournalPatternStore;
    const pattern = store.find(item.id);
    pattern.stages = pendingStages;
    store.save(pattern);
    onSave(pattern);
    setPendingStages(null);
  }

  function applyStrategySuggestion(message, suggestion, status) {
    const store = window.TradeJournalStrategyEducationStore;
    const strategy = store.applySuggestion(store.find(item.id), suggestion, status);
    onSave(strategy);
  }

  const kindWord = isPatternKind(kind) ? tr(lang, 'kindPattern') : tr(lang, 'kindStrategy');
  const contextCards = isPatternKind(kind)
    ? [
      { icon: 'sparkle', title: tr(lang, 'contextUnderstanding'), body: item.description || '—', meta: '' },
      { icon: 'execution', title: tr(lang, 'contextSteps'), body: item.stages.slice(0, 3).map((s) => s.text).join(' · ') + (item.stages.length > 3 ? ' · …' : ''), meta: tr(lang, 'contextStepsMeta', { n: digits(lang, item.stages.length) }) }
    ]
    : [
      { icon: 'sparkle', title: tr(lang, 'contextUnderstanding'), body: item.overallFramework.description || item.aiUnderstandingSummary.overallFramework || '—', meta: '' },
      { icon: 'honour', title: tr(lang, 'contextRisk'), body: item.riskManagement.maxRiskPerTradePercent != null ? tr(lang, 'contextRiskBody', { risk: digits(lang, item.riskManagement.maxRiskPerTradePercent), dd: digits(lang, item.riskManagement.dailyDrawdownLimitPercent ?? '—') }) : tr(lang, 'contextRiskBodyEmpty'), meta: '' }
    ];

  const lastAssistant = item.chatHistory.length ? item.chatHistory[item.chatHistory.length - 1] : null;
  const strategySuggestions = !isPatternKind(kind) && lastAssistant && lastAssistant.role === 'assistant' ? (lastAssistant.suggestions || []).filter((s) => s.status === 'pending') : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
        {contextCards.map((c) => (
          <div key={c.title} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}><Icon name={c.icon} size={16} />{c.title}</span>
            <span dir="auto" style={{ fontSize: 11.5, lineHeight: 1.9, color: 'var(--text-dim)' }}>{c.body}</span>
            {c.meta && <span style={{ fontSize: 10.5, color: 'var(--char-accent)' }}>{c.meta}</span>}
          </div>
        ))}
      </div>

      <Panel variant="base" padding={0}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'block' }}></span>
            <span style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{tr(lang, 'chatNotice').split('.')[0]}</span>
            <span style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>{tr(lang, 'chatNotice')}</span>
          </div>
          <div ref={listRef} className="navrya-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, maxHeight: 440, overflowY: 'auto' }}>
            {!item.chatHistory.length && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'chatEmpty')}</span>}
            {item.chatHistory.map((m) => m.role === 'assistant' ? (
              <div key={m.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', maxWidth: '82%' }}>
                <span style={{ flex: 'none', width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--char-accent)', border: '1px solid color-mix(in srgb, var(--char-accent) 50%, transparent)', background: 'rgba(3,8,7,.6)' }}><Icon name="sparkle" size={16} /></span>
                <span dir="auto" style={{ display: 'block', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)', fontSize: 13, lineHeight: 2, color: 'var(--text-primary)' }}>{m.content}</span>
              </div>
            ) : (
              <div key={m.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', maxWidth: '82%', marginInlineStart: 'auto', flexDirection: 'row-reverse' }}>
                <span dir="auto" style={{ display: 'block', padding: '12px 14px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--char-accent) 40%, transparent)', background: 'var(--char-active-surface)', fontSize: 13, lineHeight: 2, color: 'var(--text-primary)' }}>{m.content}</span>
              </div>
            ))}
            {sending && <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'sending')}</span>}

            {isPatternKind(kind) && pendingStages && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: 14, borderRadius: 10, border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.06)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--gold-warm)' }}><Icon name="edit" size={16} />{tr(lang, 'suggestionTitle')}</span>
                <span style={{ fontSize: 13, lineHeight: 2, color: 'var(--text-primary)' }} dir="auto">{pendingStages.map((s, i) => digits(lang, i + 1) + '. ' + s.text).join('\n')}</span>
                <span style={{ display: 'flex', gap: 9 }}>
                  <Button variant="primary" size="sm" icon="check" onClick={applyPatternStages}>{tr(lang, 'suggestionApply')}</Button>
                  <Button variant="ghost" size="sm" icon="close" onClick={() => setPendingStages(null)}>{tr(lang, 'suggestionDismiss')}</Button>
                </span>
              </div>
            )}
            {!isPatternKind(kind) && strategySuggestions.map((s) => (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: 14, borderRadius: 10, border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.06)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--gold-warm)' }}><Icon name="edit" size={16} />{tr(lang, 'suggestionTitle')}</span>
                <span style={{ fontSize: 13, lineHeight: 2, color: 'var(--text-primary)' }} dir="auto">{s.value}</span>
                <span style={{ display: 'flex', gap: 9 }}>
                  <Button variant="primary" size="sm" icon="check" onClick={() => applyStrategySuggestion(lastAssistant, s, 'applied')}>{tr(lang, 'suggestionApply')}</Button>
                  <Button variant="ghost" size="sm" icon="close" onClick={() => applyStrategySuggestion(lastAssistant, s, 'rejected')}>{tr(lang, 'suggestionDismiss')}</Button>
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder={tr(lang, 'composerPlaceholder', { kind: kindWord })}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '11px 13px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.6)', color: 'var(--text-primary)', font: 'inherit', fontSize: 13, lineHeight: 1.9, resize: 'none', outline: 'none' }} />
              <Button variant="primary" icon="arrow-up" disabled={sending} onClick={send}>{tr(lang, 'send')}</Button>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Detail: Report tab
// ---------------------------------------------------------------------------------------------

function KpiTile({ icon, label, value, note }) {
  return (
    <Panel variant="base" padding="14px 15px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, letterSpacing: '.07em', color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--char-accent)', display: 'grid', placeItems: 'center' }}><Icon name={icon} size={16} /></span>{label}
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span className="navrya-tabular" style={{ fontSize: 26, fontWeight: 700, color: 'var(--parchment)', lineHeight: 1 }}>{value}</span>
          {note && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{note}</span>}
        </span>
      </div>
    </Panel>
  );
}

function ReportTab({ lang, kind, item }) {
  const isP = isPatternKind(kind);
  const trades = linkedTradesFor(kind, item.id);
  const closedTrades = trades.filter((t) => t.status === 'closed');
  const wins = closedTrades.filter((t) => t.outcome === 'win').length;
  const winRate = closedTrades.length ? Math.round((wins / closedTrades.length) * 100) : null;
  const rrValues = trades.map((t) => t.rr).filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
  const avgRR = rrValues.length ? round1(rrValues.reduce((a, b) => a + b, 0) / rrValues.length) : null;

  let detCount, stagesCompletedCount, confirmedCount, avgStepCompletion, realizationRate, trendVals, qualityBuckets;
  if (isP) {
    const rows = patternDetectionRows(item.id);
    detCount = rows.length;
    stagesCompletedCount = rows.filter((r) => r.stages.length && r.completedStageIds.length >= r.stages.length).length;
    confirmedCount = rows.filter((r) => r.occurred).length;
    const completionRows = rows.filter((r) => r.stages.length);
    avgStepCompletion = completionRows.length ? Math.round(completionRows.reduce((a, r) => a + (r.completedStageIds.length / r.stages.length) * 100, 0) / completionRows.length) : null;
    realizationRate = rows.length ? Math.round((confirmedCount / rows.length) * 100) : null;
    trendVals = movingAverage(realizationTrend(rows.map((r) => ({ date: r.sessionDate, ok: r.occurred })), 12), 0);
    const notOccurred = rows.length - confirmedCount;
    qualityBuckets = [
      { label: tr(lang, 'qualityOccurred'), value: confirmedCount, color: 'var(--char-accent)' },
      { label: tr(lang, 'qualityNotOccurred'), value: notOccurred, color: 'var(--text-disabled)' }
    ];
  } else {
    const events = item.detectionEvents || [];
    detCount = events.length;
    const stats = window.TradeJournalStrategyEducationStore.detectionStats(item);
    confirmedCount = stats.confirmed;
    avgStepCompletion = null;
    realizationRate = stats.confirmationRate;
    trendVals = movingAverage(realizationTrend(events.map((e) => ({ date: e.detectedAt, ok: e.status === 'confirmed' })), 12), 0);
    const invalidated = events.filter((e) => e.status === 'invalidated').length;
    const pendingStale = events.length - confirmedCount - invalidated;
    qualityBuckets = [
      { label: tr(lang, 'qualityConfirmed'), value: confirmedCount, color: 'var(--char-accent)' },
      { label: tr(lang, 'qualityPending'), value: Math.max(0, pendingStale), color: 'var(--warning)' },
      { label: tr(lang, 'qualityInvalidated'), value: invalidated, color: 'var(--danger)' }
    ];
  }
  const avgLine = movingAverage(trendVals, 3);
  const linkedCount = trades.length;
  const funnelStages = [
    { label: tr(lang, 'funnelDetected'), v: Math.max(1, detCount) },
    { label: tr(lang, isP ? 'funnelStagesDone' : 'funnelConfirmed'), v: isP ? stagesCompletedCount : confirmedCount },
    { label: tr(lang, isP ? 'funnelConfirmed' : 'qualityConfirmed'), v: confirmedCount },
    { label: tr(lang, 'funnelLinked'), v: Math.min(confirmedCount || linkedCount, linkedCount) }
  ];
  const qualityTotal = qualityBuckets.reduce((a, b) => a + b.value, 0) || 1;

  const stepBars = isP ? item.stages.map((stage) => {
    const rows = patternDetectionRows(item.id).filter((r) => r.stages.some((s) => s.id === stage.id));
    const done = rows.filter((r) => r.completedStageIds.indexOf(stage.id) > -1).length;
    const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;
    return { label: stage.text, pct };
  }) : [];

  const rDist = rDistribution(trades);
  const heat = sessionWeekdayHeat(trades, lang);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(178px,1fr))', gap: 12 }}>
        <KpiTile icon="ScanSearch" label={tr(lang, 'kpiDetections')} value={digits(lang, detCount)} note={tr(lang, 'last90Days')} />
        <KpiTile icon="ListChecks" label={tr(lang, 'kpiAvgStepCompletion')} value={avgStepCompletion === null ? '—' : digits(lang, avgStepCompletion) + '٪'} />
        <KpiTile icon="CircleCheck" label={tr(lang, 'kpiRealization')} value={realizationRate === null ? '—' : digits(lang, realizationRate) + '٪'} />
        <KpiTile icon="Link2" label={tr(lang, 'kpiLinkedTrades')} value={digits(lang, linkedCount)} />
        <KpiTile icon="Trophy" label={tr(lang, 'kpiWinRate')} value={winRate === null ? '—' : digits(lang, winRate) + '٪'} />
        <KpiTile icon="Scale" label={tr(lang, 'kpiAvgRR')} value={avgRR === null ? '—' : digits(lang, avgRR)} />
      </div>

      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'funnelTitle')}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'funnelNote', { det: digits(lang, detCount), linked: digits(lang, linkedCount) })}</span>
          </div>
          <div style={{ width: '100%' }}>{funnelSvg(funnelStages, item.id)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {funnelStages.map((f, i) => (
              <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', textAlign: 'center', paddingTop: 12, borderTop: '1px solid var(--border-hairline)' }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{f.label}</span>
                <span className="navrya-tabular" style={{ fontSize: 22, fontWeight: 700, color: 'var(--parchment)' }}>{digits(lang, f.v)}</span>
                <span style={{ fontSize: 11, color: i === 0 ? 'var(--text-dim)' : 'var(--warning)' }}>{i === 0 ? tr(lang, 'funnelStart') : tr(lang, 'funnelDrop', { n: digits(lang, Math.max(0, Math.round((1 - f.v / funnelStages[i - 1].v) * 100))) })}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.1fr) minmax(0,1fr)', gap: 14, alignItems: 'stretch' }}>
        <Panel variant="base" padding="18px 20px 16px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'trendTitle')}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--text-dim)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 2, background: 'var(--char-accent)', display: 'block' }}></span>{tr(lang, 'realizationRateLegend')}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 2, background: 'var(--gold-antique)', display: 'block' }}></span>{tr(lang, 'movingAvgLegend')}</span>
              </span>
            </div>
            <div style={{ position: 'relative', height: 210 }}>
              <div style={{ position: 'absolute', inset: 0 }}>{trendSvg(trendVals, avgLine, item.id)}</div>
            </div>
          </div>
        </Panel>
        <Panel variant="base" padding="18px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--parchment)', alignSelf: 'flex-start' }}>{tr(lang, 'qualityTitle')}</span>
            <span style={{ display: 'block' }}>{donutChart(Math.round((qualityBuckets[0].value / qualityTotal) * 100), 132, tr(lang, 'kpiRealization').split(' ')[0], lang)}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
              {qualityBuckets.map((q) => (
                <span key={q.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: q.color, display: 'block' }}></span>{q.label}</span>
                  <span className="navrya-tabular" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{digits(lang, q.value)}</span>
                </span>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(420px,1fr))', gap: 14 }}>
        <Panel variant="base" padding="18px 20px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'stepsChartTitle')}</span>
            {isP ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stepBars.length ? stepBars.map((b) => (
                  <div key={b.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span dir="auto" style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</span>
                      <span className="navrya-tabular" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{digits(lang, b.pct) + '٪'}</span>
                    </span>
                    <span style={{ display: 'block', height: 9, borderRadius: 5, background: 'rgba(244,234,215,.06)', overflow: 'hidden' }}>{barFillEl(b.pct, 'accent')}</span>
                  </div>
                )) : <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'insufficientData')}</span>}
              </div>
            ) : <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'notApplicableSteps')}</span>}
          </div>
        </Panel>
        <Panel variant="base" padding="18px 20px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'rDistTitle')}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{rDist.counted ? tr(lang, 'rNote', { rr: digits(lang, avgRR ?? 0), n: digits(lang, rDist.counted) }) : tr(lang, 'rNoteEmpty')}</span>
            </div>
            <div style={{ width: '100%' }}>{rDistSvg(rDist.buckets)}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-disabled)', direction: 'ltr' }}>
              <span>-2R</span><span>-1R</span><span>0</span><span>+1R</span><span>+2R</span><span>+3R</span><span>+4R</span>
            </div>
          </div>
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.35fr)', gap: 14, alignItems: 'start' }}>
        <Panel variant="base" padding="18px 20px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'heatmapTitle')}</span>
            <div style={{ display: 'grid', gridTemplateColumns: '88px repeat(7,1fr)', gap: 6, alignItems: 'center' }}>
              <span></span>
              {tr(lang, 'dayLabels').map((d) => <span key={d} style={{ fontSize: 10.5, color: 'var(--text-dim)', textAlign: 'center' }}>{d}</span>)}
              {tr(lang, 'sessionLabels').map((label, ri) => (
                <React.Fragment key={label}>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{label}</span>
                  {heat[ri].map((v, ci) => <span key={ci} style={{ display: 'block' }}>{heatCellEl(v, lang)}</span>)}
                </React.Fragment>
              ))}
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 10.5, color: 'var(--text-dim)' }}>
              {tr(lang, 'heatLow')}<span style={{ flex: 1, height: 6, borderRadius: 3, background: 'linear-gradient(to left,rgba(244,234,215,.06),var(--char-accent))', display: 'block' }}></span>{tr(lang, 'heatHigh')}
            </span>
          </div>
        </Panel>
        <Panel variant="base" padding={0}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', borderBottom: '1px solid var(--border-hairline)' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'linkedTradesTitle')}</span>
              <span style={{ marginInlineStart: 'auto', fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'linkedNote', { n: digits(lang, trades.length) })}</span>
            </div>
            {!trades.length ? (
              <div style={{ padding: '20px' }}><span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'noLinkedTrades')}</span></div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .9fr .8fr .7fr .7fr', gap: 0 }}>
                {[tr(lang, 'tradeHeadTrade'), tr(lang, 'tradeHeadDate'), tr(lang, 'tradeHeadSession'), tr(lang, 'tradeHeadResult'), tr(lang, 'tradeHeadSteps')].map((th) => (
                  <span key={th} style={{ padding: '9px 14px', fontSize: 10.5, letterSpacing: '.07em', color: 'var(--text-dim)', borderBottom: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)' }}>{th}</span>
                ))}
                {trades.slice(0, 12).map((t) => {
                  const rr = t.rr === null || t.rr === undefined ? null : Number(t.rr);
                  const rColor = rr === null ? 'var(--text-dim)' : rr >= 0 ? 'var(--success)' : 'var(--danger)';
                  let stepsLabel = '—';
                  if (isP && t.source && t.source.scenarioId) {
                    for (const session of allSessions()) {
                      for (const entry of session.entries || []) {
                        const scenario = (entry.scenarios || []).find((s) => s.id === t.source.scenarioId);
                        if (scenario && scenario.pattern) { stepsLabel = digits(lang, (scenario.pattern.completedStageIds || []).length) + ' / ' + digits(lang, (scenario.pattern.stages || []).length); }
                      }
                    }
                  }
                  return (
                    <React.Fragment key={t.id}>
                      <span style={{ padding: '11px 14px', fontSize: 12.5, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-hairline)' }}>{(t.direction === 'long' ? tr(lang, 'directionLong') : tr(lang, 'directionShort')) + ' · ' + (t.session || '—')}</span>
                      <span className="navrya-tabular" style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-hairline)' }}>{new Date(t.createdAt).toLocaleDateString(localeCode(lang))}</span>
                      <span style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-hairline)' }}>{t.session || '—'}</span>
                      <span className="navrya-tabular" style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 600, color: rColor, borderBottom: '1px solid var(--border-hairline)' }}>{rr === null ? (t.outcome || '—') : (rr >= 0 ? '+' : '') + digits(lang, rr) + 'R'}</span>
                      <span style={{ padding: '11px 14px', fontSize: 11.5, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-hairline)' }}>{stepsLabel}</span>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Detail: Share tab
// ---------------------------------------------------------------------------------------------

function PublishForm({ lang, kind, item, listing, onClose, onSaved }) {
  const [title, setTitle] = React.useState((listing && listing.title) || item.name || '');
  const [description, setDescription] = React.useState((listing && listing.description) || '');
  const [price, setPrice] = React.useState(String((listing && listing.priceAmount) || 0));
  const currencies = window.TradeJournalCommunityTypes ? window.TradeJournalCommunityTypes.priceCurrencies : ['USD', 'EUR'];
  const [currency, setCurrency] = React.useState((listing && listing.priceCurrency) || currencies[0]);
  const maxFree = isPatternKind(kind) ? item.stages.length : 1;
  const [free, setFree] = React.useState(listing && listing.previewContent && listing.previewContent.freeCount != null ? listing.previewContent.freeCount : Math.min(2, maxFree));
  const [submitting, setSubmitting] = React.useState(false);

  function buildContent(freeCount) {
    if (isPatternKind(kind)) {
      return { previewContent: { freeCount, stages: item.stages.slice(0, freeCount).map((s) => s.text) }, fullContent: { stages: item.stages.map((s) => s.text), completionThreshold: item.completionThreshold } };
    }
    return { previewContent: { freeCount, framework: (item.overallFramework.description || '').slice(0, 240) }, fullContent: { positionManagement: item.positionManagement, riskManagement: item.riskManagement, overallFramework: item.overallFramework } };
  }

  async function submit() {
    const t = title.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    const content = buildContent(Number(free) || 0);
    const payload = {
      type: kind, sourceId: item.id, title: t, description: description.trim(),
      priceAmount: Number(price) || 0, priceCurrency: currency,
      successRatePercent: null, sampleSize: 0, evidenceAsOf: new Date().toISOString(),
      previewContent: content.previewContent, fullContent: content.fullContent, status: 'published'
    };
    try {
      const saved = listing ? await window.TradeJournalCommunityStore.updateListing(listing.id, payload) : await window.TradeJournalCommunityStore.createListing(payload);
      onSaved(saved);
      onClose();
    } catch (_) { setSubmitting(false); }
  }

  const priceTag = currency === 'USD' ? '$' + price : digits(lang, price) + ' ' + currency;
  return (
    <div dir={lang === 'fa' || lang === 'ar' ? 'rtl' : 'ltr'} style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', padding: 24, background: 'var(--scrim)', backdropFilter: 'blur(3px)' }}>
      <div role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: 1020, maxHeight: 'calc(100vh - 48px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 14, border: '1px solid var(--border-gold)', background: 'var(--ink-900)', boxShadow: '0 18px 38px rgba(0,0,0,.34)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 20px', borderBottom: '1px solid var(--border-hairline)', fontSize: 11, letterSpacing: '.1em' }}>
          <span style={{ color: 'var(--char-accent)' }}>{tr(lang, 'publishHeader')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 20px', borderBottom: '1px solid var(--border-hairline)' }}>
          <span style={{ width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', flex: 'none', color: 'var(--char-accent)', background: 'rgba(3,8,7,.7)', border: '1px solid color-mix(in srgb, var(--char-accent) 60%, transparent)' }}><Icon name="reward" size={18} /></span>
          <span style={{ flex: 1, fontSize: 17, fontWeight: 600, color: 'var(--parchment)' }}>{listing ? tr(lang, 'editModalTitle') : tr(lang, 'publishModalTitle')}</span>
          <button type="button" onClick={onClose} aria-label={tr(lang, 'cancel')} style={{ width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><Icon name="close" size={18} /></button>
        </div>
        <div className="navrya-scroll" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: 20, padding: 20, overflowY: 'auto', overflowX: 'hidden', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15, minWidth: 0 }}>
            <TextField_ label={tr(lang, 'listingTitleLabel')} value={title} onCommit={setTitle} />
            <TextAreaField_ label={tr(lang, 'listingDescLabel')} value={description} onCommit={setDescription} placeholder={tr(lang, 'listingDescPlaceholder')} />
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr(lang, 'priceLabel')}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, height: 44, padding: '0 13px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.55)' }}>
                  <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--text-primary)', font: 'inherit', fontSize: 14 }} />
                </span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr(lang, 'currencyLabel')}</span>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...inputStyle, height: 44 }}>
                  {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 14, borderRadius: 10, border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.05)' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{tr(lang, 'freePreviewLabel')}</span>
                <span className="navrya-tabular" style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold-warm)' }}>{digits(lang, free) + ' / ' + digits(lang, maxFree)}</span>
              </span>
              <input type="range" min="0" max={maxFree} step="1" value={free} onChange={(e) => setFree(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--gold-warm)', cursor: 'pointer' }} />
              <span style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.8 }}>{tr(lang, 'freePreviewHelp')}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <span style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--text-dim)' }}>{tr(lang, 'previewSectionLabel')}</span>
            <div style={{ borderRadius: 12, border: '1px solid var(--border-gold)', background: 'var(--surface-card)', overflow: 'hidden', boxShadow: 'var(--shadow-panel)' }}>
              <div style={{ position: 'relative', height: 96, background: 'linear-gradient(160deg,rgba(183,138,74,.14),rgba(3,8,7,.85))', display: 'flex', alignItems: 'flex-end' }}>
                <span style={{ position: 'absolute', insetBlockStart: 12, insetInlineEnd: 12, display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--ink-950)', background: 'var(--gold-warm)' }}>{priceTag}</span>
                <span style={{ padding: '0 14px 12px', fontSize: 15.5, fontWeight: 700, color: 'var(--parchment)' }} dir="auto">{title || item.name}</span>
              </div>
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span dir="auto" style={{ fontSize: 11.5, lineHeight: 2, color: 'var(--text-dim)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{description || (isPatternKind(kind) ? item.description : item.overallFramework.description) || '—'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{free > 0 ? tr(lang, 'freeBadge', { n: digits(lang, free) }) : tr(lang, 'noFreeBadge')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border-hairline)' }}>
                  <span className="navrya-tabular" style={{ fontSize: 18, fontWeight: 700, color: 'var(--parchment)' }}>{priceTag}</span>
                  <span style={{ marginInlineStart: 'auto' }}><Button variant="primary" size="sm" icon="reward">{tr(lang, 'addToCart')}</Button></span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 20px', borderTop: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)' }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'publishFooterNote')}</span>
          <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={onClose}>{tr(lang, 'cancel')}</Button>
            <Button variant="primary" icon="upload" disabled={submitting} onClick={submit}>{submitting ? tr(lang, 'saving') : (listing ? tr(lang, 'saveAction') : tr(lang, 'publishAction'))}</Button>
          </span>
        </div>
      </div>
    </div>
  );
}

function ShareTab({ lang, kind, item, onSave }) {
  const [listing, setListing] = React.useState(undefined); // undefined = loading, null = none
  const [ratings, setRatings] = React.useState(null);
  const [formOpen, setFormOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    window.TradeJournalCommunityStore.findListingBySource(item.id).then((result) => { if (!cancelled) setListing(result); }).catch(() => { if (!cancelled) setListing(null); });
    return () => { cancelled = true; };
  }, [item.id]);

  React.useEffect(() => {
    if (!listing) { setRatings(null); return; }
    let cancelled = false;
    window.TradeJournalCommunityStore.listRatings(listing.id).then((rows) => { if (!cancelled) setRatings(rows || []); }).catch(() => { if (!cancelled) setRatings([]); });
  }, [listing]);

  const kindWord = isPatternKind(kind) ? tr(lang, 'kindPattern') : tr(lang, 'kindStrategy');
  const publicOn = !!item.isPublic;

  function togglePublic() {
    const next = !publicOn;
    Object.assign(item, { isPublic: next });
    if (isPatternKind(kind)) window.TradeJournalPatternStore.save(item); else window.TradeJournalStrategyEducationStore.save(item);
    onSave(item);
  }

  const avgRating = ratings && ratings.length ? round1(ratings.reduce((a, r) => a + Number(r.rating || 0), 0) / ratings.length) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 900 }}>
      <Panel variant="base" padding="18px 20px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'publicToggleLabel', { kind: kindWord })}</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{publicOn ? tr(lang, 'listedState') : tr(lang, 'notListedState')}</span>
          </span>
          <button type="button" onClick={togglePublic} aria-pressed={publicOn} style={{ flex: 'none', width: 52, height: 29, boxSizing: 'border-box', borderRadius: 999, cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', border: '1px solid ' + (publicOn ? 'color-mix(in srgb, var(--char-accent) 60%, transparent)' : 'var(--border-hairline)'), background: publicOn ? 'var(--char-active-surface)' : 'rgba(3,8,7,.6)', justifyContent: publicOn ? 'flex-start' : 'flex-end' }}>
            <span style={{ width: 23, height: 23, borderRadius: 999, display: 'block', background: publicOn ? 'var(--char-accent)' : 'var(--text-disabled)' }}></span>
          </button>
        </div>
      </Panel>

      {publicOn && listing && (
        <Panel variant="base" ornament texture padding={0}>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 300, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={{ fontSize: 11, letterSpacing: '.12em', color: 'var(--gold-warm)' }}>{tr(lang, 'marketplaceBadge').toUpperCase()}</span>
              <span dir="auto" style={{ fontSize: 19, fontWeight: 700, color: 'var(--parchment)' }}>{listing.title}</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '11px 13px', borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)' }}>
                  <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'priceLabel')}</span>
                  <span className="navrya-tabular" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{(listing.priceCurrency === 'USD' ? '$' : '') + digits(lang, listing.priceAmount) + (listing.priceCurrency !== 'USD' ? ' ' + listing.priceCurrency : '')}</span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '11px 13px', borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)' }}>
                  <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'ratingLabel')}</span>
                  <span className="navrya-tabular" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{avgRating === null ? '—' : digits(lang, avgRating) + ' (' + digits(lang, ratings.length) + ')'}</span>
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
                <Button variant="primary" icon="upload" onClick={() => setFormOpen(true)}>{tr(lang, 'editListing')}</Button>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {!publicOn && (
        <Panel variant="quiet" padding="26px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13, textAlign: 'center' }}>
            <span style={{ width: 46, height: 46, borderRadius: 10, display: 'grid', placeItems: 'center', color: 'var(--gold-warm)', border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.08)' }}><Icon name="reward" size={22} /></span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'notListedTitle')}</span>
            <span style={{ fontSize: 12.5, lineHeight: 2, color: 'var(--text-dim)', maxWidth: '52ch' }}>{tr(lang, 'notListedBody')}</span>
            <Button variant="primary" icon="upload" onClick={() => setFormOpen(true)}>{tr(lang, 'registerListing')}</Button>
          </div>
        </Panel>
      )}

      {formOpen && (
        <PublishForm lang={lang} kind={kind} item={item} listing={listing || null} onClose={() => setFormOpen(false)}
          onSaved={(saved) => { setListing(saved); if (!item.isPublic) togglePublic(); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Detail shell
// ---------------------------------------------------------------------------------------------

function DetailView({ lang, kind, item, dtab, setDtab, onBack, onSave, onAiSteps, onGoChat, onFromEventAi, onDelete, onToggleActive }) {
  const isP = isPatternKind(kind);
  const active = item.active !== false;
  const chips = [
    tr(lang, 'chipSteps', { n: digits(lang, (item.stages || []).length) }),
    tr(lang, 'chipUpdated', { date: new Date(item.updatedAt).toLocaleDateString(localeCode(lang)) })
  ];
  if (isP) chips.splice(1, 0, tr(lang, 'chipUsage', { n: digits(lang, item.usageCount || 0) }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span style={{ position: 'relative', flex: 'none', width: 58, height: 58, borderRadius: 10, border: '1px solid var(--border-gold)', background: 'linear-gradient(160deg,rgba(183,138,74,.12),rgba(3,8,7,.7))', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>{glyphChart(item.id, 42)}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 11, letterSpacing: '.12em', color: 'var(--char-accent)' }}>{isP ? tr(lang, 'eyebrowPattern') : tr(lang, 'eyebrowStrategy')}</span>
            <h1 dir="auto" style={{ margin: 0, fontSize: 27, lineHeight: 1.3, fontWeight: 700, color: 'var(--parchment)' }}>{item.name || '—'}</h1>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              {chips.map((c) => <span key={c} style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 9px', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)', border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)' }}>{c}</span>)}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label title={tr(lang, 'activeToggleHelp')} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 13px', borderRadius: 8, cursor: 'pointer', border: '1px solid ' + (active ? 'var(--char-accent)' : 'var(--border-hairline)'), background: active ? 'var(--char-active-surface)' : 'transparent', color: active ? 'var(--char-accent)' : 'var(--text-dim)', fontSize: 12.5, fontWeight: 600 }}>
            <input type="checkbox" checked={active} onChange={() => onToggleActive()} style={{ accentColor: 'var(--char-accent)', cursor: 'pointer' }} />
            {active ? tr(lang, 'activeLabel') : tr(lang, 'inactiveLabel')}
          </label>
          <Button variant="ghost" icon="trash" onClick={onDelete}>{tr(lang, 'deleteBtn')}</Button>
          <Button variant="secondary" icon="ArrowRight" onClick={onBack}>{tr(lang, 'backToList')}</Button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'var(--surface-card)', boxShadow: 'var(--shadow-panel)', alignSelf: 'flex-start' }}>
        {[['details', tr(lang, 'tabDetails'), 'settings'], ['chat', tr(lang, 'tabChat'), 'community'], ['report', tr(lang, 'tabReport'), 'report'], ['share', tr(lang, 'tabShare'), 'Share2']].map(([id, label, icon]) => (
          <button key={id} type="button" onClick={() => setDtab(id)} style={{ boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 9, height: 46, padding: '0 17px', borderRadius: 8, cursor: 'pointer', border: dtab === id ? '2px solid var(--char-accent)' : '1px solid transparent', background: dtab === id ? 'var(--char-active-surface)' : 'transparent', color: dtab === id ? 'var(--char-accent)' : 'var(--text-muted)', font: 'inherit', fontSize: 13, fontWeight: dtab === id ? 600 : 500 }}>
            <Icon name={icon} size={18} />{label}
          </button>
        ))}
      </div>

      {dtab === 'details' && (isP
        ? <PatternDetailsTab lang={lang} pattern={item} onSave={onSave} onAiSteps={onAiSteps} />
        : <StrategyDetailsTab lang={lang} strategy={item} onSave={onSave} onAiSteps={onFromEventAi} onGoChat={onGoChat} />)}
      {dtab === 'chat' && <ChatTab lang={lang} kind={kind} item={item} onSave={onSave} />}
      {dtab === 'report' && <ReportTab lang={lang} kind={kind} item={item} />}
      {dtab === 'share' && <ShareTab lang={lang} kind={kind} item={item} onSave={onSave} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Top-level hub
// ---------------------------------------------------------------------------------------------

function StrategiesHub({ character }) {
  const lang = document.documentElement.lang || 'fa';
  const [, setTick] = React.useState(0);
  const rerender = React.useCallback(() => setTick((t) => t + 1), []);
  React.useEffect(() => {
    function onChange() { rerender(); }
    window.addEventListener('tradejournal:patterns-changed', onChange);
    window.addEventListener('tradejournal:strategies-changed', onChange);
    window.addEventListener('tradejournal:trades-changed', onChange);
    return () => {
      window.removeEventListener('tradejournal:patterns-changed', onChange);
      window.removeEventListener('tradejournal:strategies-changed', onChange);
      window.removeEventListener('tradejournal:trades-changed', onChange);
    };
  }, [rerender]);

  const [tab, setTab] = React.useState('patterns');
  const [openKind, setOpenKind] = React.useState(null);
  const [openId, setOpenId] = React.useState(null);
  const [dtab, setDtab] = React.useState('details');
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState(tr(lang, 'sortRecent'));

  const patterns = window.TradeJournalPatternStore ? window.TradeJournalPatternStore.listSync() : [];
  const strategies = window.TradeJournalStrategyEducationStore ? window.TradeJournalStrategyEducationStore.listSync() : [];
  const item = openId ? (openKind === 'pattern' ? patterns.find((p) => p.id === openId) : strategies.find((s) => s.id === openId)) : null;

  React.useEffect(() => { if (openId && !item) { setOpenId(null); setOpenKind(null); } }, [openId, item]);

  function openItem(kind, id, tabId) { setOpenKind(kind); setOpenId(id); setDtab(tabId || 'details'); }
  function back() { setOpenId(null); setOpenKind(null); }
  // Every Details-tab field edit (threshold, stage add/edit/delete, name, description, risk
  // fields, ...) flows through this single handler - it must actually persist, not just
  // re-render, or every edit is silently lost the moment this component next re-renders (its
  // `pattern`/`strategy` prop is re-derived fresh from the store on every render). Callers that
  // already saved internally (chat send, screenshot upload, suggestion apply) just redundantly
  // re-save the same already-current record here, which is harmless (save() is an idempotent
  // upsert).
  function onSave(updated) {
    if (!updated) { rerender(); return; }
    if (openKind === 'pattern') window.TradeJournalPatternStore.save(updated);
    else if (openKind === 'strategy') window.TradeJournalStrategyEducationStore.save(updated);
    rerender();
  }

  function createNew() {
    if (tab === 'patterns') { const p = window.TradeJournalPatternStore.create(); openItem('pattern', p.id, 'details'); }
    else { const s = window.TradeJournalStrategyEducationStore.create(); openItem('strategy', s.id, 'details'); }
  }
  function removeItem(kind, id) {
    if (!window.confirm(tr(lang, 'deleteConfirm'))) return;
    if (kind === 'pattern') window.TradeJournalPatternStore.remove(id); else window.TradeJournalStrategyEducationStore.remove(id);
    rerender();
  }
  // Patterns and strategies both carry a real `active` flag (strategy-education-store.js already
  // had setActive()/listActive(); patterns gained the same field so the two stay symmetric) - this
  // lets a user retire an item without deleting it, distinct from isPublic (marketplace listing).
  function toggleActive() {
    if (!item) return;
    const next = !(item.active !== false);
    if (openKind === 'pattern') window.TradeJournalPatternStore.save({ ...item, active: next });
    else if (openKind === 'strategy') window.TradeJournalStrategyEducationStore.setActive(item.id, next);
    rerender();
  }
  async function aiWriteSteps() {
    if (!item) return;
    if (openKind === 'pattern') {
      const result = await window.TradeJournalPatternAI.generateStages(item);
      const fresh = window.TradeJournalPatternStore.find(item.id);
      fresh.stages = result.stages;
      window.TradeJournalPatternStore.save(fresh);
      rerender();
    } else {
      setDtab('chat');
    }
  }
  async function fromEvent() {
    // Real, existing capability: propose a new strategy from a session/scenario/trade event via
    // window.TradeJournalStrategyEducationAI.proposeFromEvent - the design's own mock leaves
    // onFromEvent as a no-op, so this is the honest real action to wire it to. No source event is
    // picked here (would need a session/scenario picker outside this screen's scope), so it opens
    // a fresh draft to chat into, mirroring the "new strategy" flow.
    if (tab !== 'strategies') return;
    const s = window.TradeJournalStrategyEducationStore.create({ origin: 'ai_from_event' });
    openItem('strategy', s.id, 'chat');
  }

  const container = { display: 'flex', flexDirection: 'column', gap: 16 };
  if (tab === 'positions') {
    return (
      <div style={container}>
        <PositionsView lang={lang} tab={tab} setTab={setTab} patternsCount={patterns.length} strategiesCount={strategies.length} />
      </div>
    );
  }
  if (!item) {
    return (
      <div style={container}>
        <IndexView lang={lang} tab={tab} setTab={setTab} query={query} setQuery={setQuery} sort={sort} setSort={setSort}
          patterns={patterns} strategies={strategies} onOpen={openItem} onDelete={removeItem} onNew={createNew} onFromEvent={fromEvent} />
      </div>
    );
  }
  return (
    <div style={container}>
      <DetailView lang={lang} kind={openKind} item={item} dtab={dtab} setDtab={setDtab} onBack={back} onSave={onSave}
        onAiSteps={aiWriteSteps} onGoChat={() => setDtab('chat')} onFromEventAi={aiWriteSteps}
        onDelete={() => removeItem(openKind, item.id)} onToggleActive={toggleActive} />
    </div>
  );
}

class HubBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <pre style={{ color: '#fbb', background: '#200', padding: 16, whiteSpace: 'pre-wrap' }}>{'[strategies hub] ' + (this.state.error.stack || this.state.error.message)}</pre>;
    return this.props.children;
  }
}

export function renderStrategiesHub(character) {
  const container = document.createElement('div');
  container.className = 'panel-page';
  container.dataset.character = currentNavryaCharacter();
  const lang = document.documentElement.lang || 'fa';
  const rtl = lang === 'fa' || lang === 'ar';
  container.dir = rtl ? 'rtl' : 'ltr';
  container.style.direction = rtl ? 'rtl' : 'ltr';
  // Stashed on the container so panel-system.js's own render(view) can call root.unmount()
  // before detaching this node on a later view switch - see that file's own comment on why
  // Element.remove() alone never runs a React 18 root's unmount lifecycle/cleanup effects.
  const root = createRoot(container);
  container._reactRoot = root;
  root.render(<HubBoundary><StrategiesHub character={character} /></HubBoundary>);
  return container;
}
