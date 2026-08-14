import React from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import * as marketAdapter from './marketAdapter.js';
import * as sessionsAdapter from './sessionsAdapter.js';
import { openLogWizard } from './tradeLogModal.jsx';
import { openCalculator } from './tradeCalculatorModal.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

// ============================================================================
// Redesign of the Dashboard (Session tools' home screen) against the design handoff
// code-codex/dashboard/NavryaDashboard.dc.html: a customizable 12-column panel board (drag to
// reorder, resize 3/4/6/8/12, add from a library, remove), converted to React. Sidebar/
// CharacterHeader are NOT reimplemented here - they are already persistent, separately-mounted
// roots in character-app.jsx (SidebarApp/HeaderApp), so this component is deliberately just the
// board content, the same scoping strategiesHubView.jsx already used for its own screen.
//
// Every panel body below reads a REAL store - nothing here is the design mock's seeded/fixed
// numbers. Three panel types (Academy video, admin campaign banner, market watchlist) have no
// backing store anywhere in this app yet; rather than fabricate lesson titles, a marketing image
// or live prices, they render an honest "not connected yet" card and are left out of the
// default board (still addable from the panel library for anyone curious), matching this app's
// standing rule of insufficient-data-over-fabricated-numbers.
// ============================================================================

const SPANS = [3, 4, 6, 8, 12];
const DEFAULT_BOARD = ['session', 'psych', 'weather', 'positions', 'chart', 'sessions', 'strategies', 'patterns', 'reward'];
const CITIES = [
  { market: 'london', city: 'LONDON', off: 0, from: 7, to: 16 },
  { market: 'new-york', city: 'NEW YORK', off: -5, from: 13, to: 22 },
  { market: 'tokyo', city: 'TOKYO', off: 9, from: 0, to: 9 },
  { market: 'sydney', city: 'SYDNEY', off: 10, from: 0, to: 24 }
];

function boardKey(character) { return 'tradejournal:navrya-dashboard-board:v1:' + character; }
function loadBoard(character) {
  try {
    const saved = JSON.parse(localStorage.getItem(boardKey(character)));
    if (saved && Array.isArray(saved.board)) return { board: saved.board, spans: saved.spans || {} };
  } catch (_) { /* fall through to default */ }
  return { board: DEFAULT_BOARD.slice(), spans: {} };
}
function saveBoard(character, value) { localStorage.setItem(boardKey(character), JSON.stringify(value)); }

// ---- self-contained i18n, same pattern as strategiesHubView.jsx's own copy/tr/digits ----
const copy = {
  fa: {
    title: 'داشبورد', subtitle: 'سشن‌ها، استراتژی‌ها، الگوها و حال‌وهوای پشت هر پوزیشن.',
    startSession: 'شروع سشن', logTrade: 'ثبت معامله', calculator: 'ماشین‌حساب',
    panelsOnBoard: '{n} پنل روی تخته · {m} در کتابخانه', addPanel: 'افزودن پنل', arrangePanels: 'چیدمان پنل‌ها', doneArranging: 'پایان چیدمان',
    panelLibrary: 'کتابخانه پنل‌ها', closeLibrary: 'بستن کتابخانه', dragToReorder: 'برای جابه‌جایی بکش',
    narrowPanel: 'باریک‌تر', widenPanel: 'عریض‌تر', removePanel: 'حذف این پنل',
    catPsychTitle: 'پرونده روان‌شناسی', catPsychMeta: 'پروفایل', catPsychDesc: 'چقدر از پروفایل روان‌شناسی پر شده است.',
    catWeatherTitle: 'حال‌وهوای احساسی', catWeatherMeta: 'امروز', catWeatherDesc: 'شاخص حال‌وهوا، روند ۷ سشن اخیر و احساسات غالب.',
    catSessionTitle: 'سشن باز', catSessionMeta: 'در حال اجرا', catSessionDesc: 'سشنی که الان در جریان است — زمان سپری‌شده، معاملات و انضباط.',
    catSessionsTitle: 'سشن‌های بازار', catSessionsMeta: 'زنده', catSessionsDesc: 'روز معاملاتی به‌صورت یک نوار زمانی، با ساعت زنده هر شهر.',
    catPositionsTitle: 'پوزیشن‌های باز', catPositionsMeta: '{n} باز', catPositionsDesc: 'معاملات زنده با امکان ثبت احساس و بستن پوزیشن.',
    catChartTitle: 'عملکرد', catChartMeta: 'آخرین روزهای فعال', catChartDesc: 'R هر روز به همراه نرخ برد و میانگین R.',
    catStrategiesTitle: 'استراتژی‌های فعال', catStrategiesMeta: '{n} در حال اجرا', catStrategiesDesc: 'استراتژی‌های فعال با نرخ تحقق و تعداد معامله.',
    catPatternsTitle: 'الگوها', catPatternsMeta: 'تشخیص', catPatternsDesc: 'الگوهای ثبت‌شده و دقت تشخیصشان.',
    catRewardTitle: 'جایزه بعدی', catRewardMeta: 'پیشرفت', catRewardDesc: 'پیشرفت تا باز شدن مرحله بعد و XP باقی‌مانده.',
    catVideoTitle: 'آکادمی', catVideoMeta: 'به‌زودی', catVideoDesc: 'یک اسلات ویدیوی آموزشی — هنوز به بک‌اندی وصل نیست.',
    catBannerTitle: 'بنر کمپین', catBannerMeta: 'اسلات ادمین', catBannerDesc: 'تصویر تبلیغاتی مدیریت‌شده از پنل ادمین — هنوز پیکربندی نشده.',
    catWatchlistTitle: 'واچ‌لیست بازار', catWatchlistMeta: 'قیمت زنده', catWatchlistDesc: 'نمادهایی که دنبال می‌کنی — هنوز به منبع قیمت زنده وصل نیست.',
    complete: 'کامل', identityGoals: 'هویت و اهداف', riskTemperament: 'خلق‌وخوی ریسک', emotionalTriggers: 'محرک‌های احساسی', patternLibrary: 'کتابخانه الگو', dailyRoutine: 'روتین روزانه',
    continueDossier: 'ادامه پرونده', index: 'شاخص', last7Sessions: '۷ سشن اخیر', noWeatherData: 'هنوز داده‌ی کافی از ثبت احساس نیست.',
    noOpenSession: 'الان سشن بازی در جریان نیست', startOneNote: 'یک سشن شروع کن تا اینجا زنده دنبالش کنی.',
    sessionOpenSince: 'سشن باز · {window}', elapsed: 'سپری‌شده', trades: 'معاملات', booked: 'ثبت‌شده', discipline: 'انضباط', endSession: 'پایان سشن',
    next: 'بعدی', open: 'باز', closed: 'بسته',
    noOpenPositions: 'الان پوزیشن بازی نیست', noOpenPositionsNote: 'معاملات باز یا در حال شکار اینجا نشان داده می‌شوند.',
    entry: 'ورود', stop: 'حد ضرر', target: 'هدف', rrLev: 'RR · اهرم', logEmotion: 'ثبت احساس', closePosition: 'بستن پوزیشن', emotionLogsCount: '{n} ثبت احساس', tradeDetails: 'جزئیات معامله',
    winRate: 'نرخ برد', avgR: 'میانگین R', tradeCount: 'معاملات', noPerfData: 'هنوز معامله‌ی بسته‌شده‌ای برای نمودار نیست.',
    noStrategies: 'استراتژی فعالی وجود ندارد', noStrategiesNote: 'از بخش استراتژی‌ها یکی را فعال کن.', confirmed: 'تأییدشده', detections: 'تشخیص',
    noPatterns: 'هنوز الگویی ثبت نشده', noPatternsNote: 'از بخش استراتژی‌ها یک الگو بساز.', seen: 'دیده‌شده',
    notConnectedYet: 'هنوز به بک‌اندی وصل نشده', goToStrategies: 'رفتن به الگوها', noRewardYet: 'هنوز هدف بعدی مشخص نشده',
    level: 'سطح', maxLevel: 'به سقف سطح رسیدی', xpToGo: '{xp} XP تا مرحله بعد', loadingReward: 'در حال محاسبه…'
  },
  ar: {
    title: 'لوحة التحكم', subtitle: 'الجلسات والاستراتيجيات والأنماط والحالة النفسية خلف كل صفقة.',
    startSession: 'بدء جلسة', logTrade: 'تسجيل صفقة', calculator: 'الحاسبة',
    panelsOnBoard: '{n} لوحة على السبورة · {m} في المكتبة', addPanel: 'إضافة لوحة', arrangePanels: 'ترتيب اللوحات', doneArranging: 'إنهاء الترتيب',
    panelLibrary: 'مكتبة اللوحات', closeLibrary: 'إغلاق المكتبة', dragToReorder: 'اسحب لإعادة الترتيب',
    narrowPanel: 'أضيق', widenPanel: 'أوسع', removePanel: 'إزالة هذه اللوحة',
    catPsychTitle: 'ملف علم النفس', catPsychMeta: 'الملف', catPsychDesc: 'مدى اكتمال ملفك النفسي.',
    catWeatherTitle: 'الحالة المزاجية', catWeatherMeta: 'اليوم', catWeatherDesc: 'مؤشر المزاج، اتجاه آخر ٧ جلسات والمشاعر الغالبة.',
    catSessionTitle: 'جلسة مفتوحة', catSessionMeta: 'قيد التنفيذ', catSessionDesc: 'الجلسة الجارية الآن — الوقت المنقضي والصفقات والانضباط.',
    catSessionsTitle: 'جلسات السوق', catSessionsMeta: 'مباشر', catSessionsDesc: 'يوم التداول كخط زمني واحد، مع ساعة مباشرة لكل مدينة.',
    catPositionsTitle: 'الصفقات المفتوحة', catPositionsMeta: '{n} مفتوحة', catPositionsDesc: 'صفقات مباشرة مع تسجيل المشاعر وإغلاق الصفقة.',
    catChartTitle: 'الأداء', catChartMeta: 'آخر الأيام النشطة', catChartDesc: 'R لكل يوم مع نسبة الفوز ومتوسط R.',
    catStrategiesTitle: 'الاستراتيجيات النشطة', catStrategiesMeta: '{n} تعمل', catStrategiesDesc: 'الاستراتيجيات النشطة بنسبة التحقق وعدد الصفقات.',
    catPatternsTitle: 'الأنماط', catPatternsMeta: 'التعرف', catPatternsDesc: 'الأنماط المسجلة ودقة التعرف عليها.',
    catRewardTitle: 'المكافأة التالية', catRewardMeta: 'التقدم', catRewardDesc: 'التقدم نحو فتح المرحلة التالية وXP المتبقية.',
    catVideoTitle: 'الأكاديمية', catVideoMeta: 'قريباً', catVideoDesc: 'فتحة درس فيديو — غير متصلة بأي بيانات بعد.',
    catBannerTitle: 'بانر الحملة', catBannerMeta: 'فتحة الإدارة', catBannerDesc: 'صورة ترويجية تديرها لوحة الإدارة — لم تُهيَّأ بعد.',
    catWatchlistTitle: 'قائمة المراقبة', catWatchlistMeta: 'سعر مباشر', catWatchlistDesc: 'الرموز التي تتابعها — غير متصلة بمصدر أسعار مباشر بعد.',
    complete: 'مكتمل', identityGoals: 'الهوية والأهداف', riskTemperament: 'مزاج المخاطرة', emotionalTriggers: 'المحفزات العاطفية', patternLibrary: 'مكتبة الأنماط', dailyRoutine: 'الروتين اليومي',
    continueDossier: 'متابعة الملف', index: 'المؤشر', last7Sessions: 'آخر ٧ جلسات', noWeatherData: 'لا توجد بيانات كافية من سجلات المشاعر بعد.',
    noOpenSession: 'لا توجد جلسة سوق مفتوحة الآن', startOneNote: 'ابدأ جلسة لمتابعتها هنا مباشرة.',
    sessionOpenSince: 'جلسة مفتوحة · {window}', elapsed: 'الوقت المنقضي', trades: 'الصفقات', booked: 'مُحقَّق', discipline: 'الانضباط', endSession: 'إنهاء الجلسة',
    next: 'التالي', open: 'مفتوحة', closed: 'مغلقة',
    noOpenPositions: 'لا توجد صفقات مفتوحة الآن', noOpenPositionsNote: 'الصفقات المفتوحة أو قيد المراقبة تظهر هنا.',
    entry: 'الدخول', stop: 'وقف الخسارة', target: 'الهدف', rrLev: 'RR · الرافعة', logEmotion: 'تسجيل شعور', closePosition: 'إغلاق الصفقة', emotionLogsCount: '{n} سجل شعور', tradeDetails: 'تفاصيل الصفقة',
    winRate: 'نسبة الفوز', avgR: 'متوسط R', tradeCount: 'الصفقات', noPerfData: 'لا توجد صفقة مغلقة بعد لعرض الرسم.',
    noStrategies: 'لا توجد استراتيجية نشطة', noStrategiesNote: 'فعّل واحدة من قسم الاستراتيجيات.', confirmed: 'مؤكَّد', detections: 'اكتشاف',
    noPatterns: 'لم يُسجَّل أي نمط بعد', noPatternsNote: 'أنشئ نمطاً من قسم الاستراتيجيات.', seen: 'شوهد',
    notConnectedYet: 'غير متصل بأي بيانات بعد', goToStrategies: 'الذهاب إلى الأنماط', noRewardYet: 'لم يتحدد الهدف التالي بعد',
    level: 'المستوى', maxLevel: 'وصلت لأعلى مستوى', xpToGo: '{xp} XP للمرحلة التالية', loadingReward: 'جارٍ الحساب…'
  },
  en: {
    title: 'Dashboard', subtitle: 'Sessions, strategies, patterns and the state of mind behind every position.',
    startSession: 'Start session', logTrade: 'Log a trade', calculator: 'Calculator',
    panelsOnBoard: '{n} panels on the board · {m} in the library', addPanel: 'Add panel', arrangePanels: 'Arrange panels', doneArranging: 'Done arranging',
    panelLibrary: 'Panel library', closeLibrary: 'Close panel library', dragToReorder: 'Drag to reorder',
    narrowPanel: 'Narrow panel', widenPanel: 'Widen panel', removePanel: 'Remove this panel',
    catPsychTitle: 'Psychology dossier', catPsychMeta: 'profile', catPsychDesc: 'How much of the psychological profile is filled in.',
    catWeatherTitle: 'Emotional weather', catWeatherMeta: 'today', catWeatherDesc: 'Mood index, 7-session trend and dominant emotions.',
    catSessionTitle: 'Open session', catSessionMeta: 'in progress', catSessionDesc: 'The session in progress — elapsed time, trades taken, discipline.',
    catSessionsTitle: 'Market sessions', catSessionsMeta: 'live', catSessionsDesc: 'The trading day as one track, with live city clocks.',
    catPositionsTitle: 'Open positions', catPositionsMeta: '{n} open', catPositionsDesc: 'Live trades with emotion logging and close controls.',
    catChartTitle: 'Performance', catChartMeta: 'recent active days', catChartDesc: 'R-multiple per day with win rate and average R.',
    catStrategiesTitle: 'Active strategies', catStrategiesMeta: '{n} running', catStrategiesDesc: 'Running strategies with realization rate and trade count.',
    catPatternsTitle: 'Patterns', catPatternsMeta: 'recognition', catPatternsDesc: 'Recorded patterns and how accurately they were read.',
    catRewardTitle: 'Next reward', catRewardMeta: 'progression', catRewardDesc: 'Progress toward the next unlock and XP remaining.',
    catVideoTitle: 'Academy', catVideoMeta: 'coming soon', catVideoDesc: 'A video lesson slot — not wired to any data yet.',
    catBannerTitle: 'Campaign banner', catBannerMeta: 'admin slot', catBannerDesc: 'Full-width promotional image managed by the admin — not configured yet.',
    catWatchlistTitle: 'Market watchlist', catWatchlistMeta: 'live price', catWatchlistDesc: 'Instruments you follow — not wired to a live price source yet.',
    complete: 'complete', identityGoals: 'Identity & goals', riskTemperament: 'Risk temperament', emotionalTriggers: 'Emotional triggers', patternLibrary: 'Pattern library', dailyRoutine: 'Daily routine',
    continueDossier: 'Continue the dossier', index: 'index', last7Sessions: 'Last 7 sessions', noWeatherData: 'Not enough emotion-log data yet.',
    noOpenSession: 'No market session is open right now', startOneNote: 'Start a session to follow it live here.',
    sessionOpenSince: 'Session open · {window}', elapsed: 'elapsed', trades: 'Trades', booked: 'Booked', discipline: 'Discipline', endSession: 'End session',
    next: 'Next', open: 'Open', closed: 'Closed',
    noOpenPositions: 'No open positions right now', noOpenPositionsNote: 'Open or hunting trades appear here.',
    entry: 'Entry', stop: 'Stop', target: 'Target', rrLev: 'RR · Lev', logEmotion: 'Log emotion', closePosition: 'Close position', emotionLogsCount: '{n} emotion logs', tradeDetails: 'Trade details',
    winRate: 'Win rate', avgR: 'Avg R', tradeCount: 'Trades', noPerfData: 'No closed trades yet to chart.',
    noStrategies: 'No active strategy', noStrategiesNote: 'Activate one from Strategies.', confirmed: 'Confirmed', detections: 'detections',
    noPatterns: 'No patterns logged yet', noPatternsNote: 'Build a pattern from Strategies.', seen: 'seen',
    notConnectedYet: 'Not connected to any data yet', goToStrategies: 'Go to patterns', noRewardYet: 'No next goal available yet',
    level: 'Level', maxLevel: 'You have reached the top level', xpToGo: '{xp} XP to next level', loadingReward: 'Calculating…'
  },
  es: {
    title: 'Panel', subtitle: 'Sesiones, estrategias, patrones y el estado mental detrás de cada posición.',
    startSession: 'Iniciar sesión', logTrade: 'Registrar operación', calculator: 'Calculadora',
    panelsOnBoard: '{n} paneles en el tablero · {m} en la biblioteca', addPanel: 'Añadir panel', arrangePanels: 'Organizar paneles', doneArranging: 'Terminar de organizar',
    panelLibrary: 'Biblioteca de paneles', closeLibrary: 'Cerrar biblioteca', dragToReorder: 'Arrastra para reordenar',
    narrowPanel: 'Estrechar panel', widenPanel: 'Ampliar panel', removePanel: 'Quitar este panel',
    catPsychTitle: 'Expediente psicológico', catPsychMeta: 'perfil', catPsychDesc: 'Cuánto del perfil psicológico está completo.',
    catWeatherTitle: 'Clima emocional', catWeatherMeta: 'hoy', catWeatherDesc: 'Índice de ánimo, tendencia de 7 sesiones y emociones dominantes.',
    catSessionTitle: 'Sesión abierta', catSessionMeta: 'en curso', catSessionDesc: 'La sesión en curso — tiempo transcurrido, operaciones y disciplina.',
    catSessionsTitle: 'Sesiones de mercado', catSessionsMeta: 'en vivo', catSessionsDesc: 'El día de trading como una línea de tiempo, con relojes en vivo por ciudad.',
    catPositionsTitle: 'Posiciones abiertas', catPositionsMeta: '{n} abiertas', catPositionsDesc: 'Operaciones en vivo con registro de emociones y cierre.',
    catChartTitle: 'Rendimiento', catChartMeta: 'últimos días activos', catChartDesc: 'R por día con win rate y R promedio.',
    catStrategiesTitle: 'Estrategias activas', catStrategiesMeta: '{n} activas', catStrategiesDesc: 'Estrategias activas con tasa de realización y operaciones.',
    catPatternsTitle: 'Patrones', catPatternsMeta: 'reconocimiento', catPatternsDesc: 'Patrones registrados y su precisión de reconocimiento.',
    catRewardTitle: 'Próxima recompensa', catRewardMeta: 'progreso', catRewardDesc: 'Progreso hacia el próximo desbloqueo y XP restante.',
    catVideoTitle: 'Academia', catVideoMeta: 'próximamente', catVideoDesc: 'Un espacio de lección en vídeo — aún sin datos conectados.',
    catBannerTitle: 'Banner de campaña', catBannerMeta: 'espacio admin', catBannerDesc: 'Imagen promocional gestionada por el panel admin — aún sin configurar.',
    catWatchlistTitle: 'Lista de seguimiento', catWatchlistMeta: 'precio en vivo', catWatchlistDesc: 'Instrumentos que sigues — aún sin fuente de precios en vivo.',
    complete: 'completo', identityGoals: 'Identidad y metas', riskTemperament: 'Temperamento de riesgo', emotionalTriggers: 'Detonantes emocionales', patternLibrary: 'Biblioteca de patrones', dailyRoutine: 'Rutina diaria',
    continueDossier: 'Continuar el expediente', index: 'índice', last7Sessions: 'Últimas 7 sesiones', noWeatherData: 'Aún no hay suficientes datos de emociones.',
    noOpenSession: 'No hay ninguna sesión de mercado abierta', startOneNote: 'Inicia una sesión para seguirla aquí en vivo.',
    sessionOpenSince: 'Sesión abierta · {window}', elapsed: 'transcurrido', trades: 'Operaciones', booked: 'Realizado', discipline: 'Disciplina', endSession: 'Terminar sesión',
    next: 'Siguiente', open: 'Abierta', closed: 'Cerrada',
    noOpenPositions: 'No hay posiciones abiertas ahora', noOpenPositionsNote: 'Las operaciones abiertas o en espera aparecen aquí.',
    entry: 'Entrada', stop: 'Stop', target: 'Objetivo', rrLev: 'RR · Apalanc.', logEmotion: 'Registrar emoción', closePosition: 'Cerrar posición', emotionLogsCount: '{n} registros emocionales', tradeDetails: 'Detalles de la operación',
    winRate: 'Win rate', avgR: 'R promedio', tradeCount: 'Operaciones', noPerfData: 'Aún no hay operaciones cerradas para graficar.',
    noStrategies: 'No hay ninguna estrategia activa', noStrategiesNote: 'Activa una desde Estrategias.', confirmed: 'Confirmado', detections: 'detecciones',
    noPatterns: 'Aún no hay patrones registrados', noPatternsNote: 'Crea un patrón desde Estrategias.', seen: 'visto',
    notConnectedYet: 'Aún sin datos conectados', goToStrategies: 'Ir a patrones', noRewardYet: 'Aún no hay una próxima meta disponible',
    level: 'Nivel', maxLevel: 'Has alcanzado el nivel máximo', xpToGo: '{xp} XP para el siguiente nivel', loadingReward: 'Calculando…'
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
function pad(n) { return String(n).padStart(2, '0'); }
function round1(n) { return Math.round(n * 10) / 10; }
// trade.session holds trade-store.js's detectSession() output ('london'/'newyork'/'tokyo'/
// 'sydney', lowercase) - a different shape from sessionsAdapter.js's displayCity() (built for
// session.market's own Title-Case convention), so it needs its own label map rather than reusing
// displayCity() and rendering half-lowercase city names.
const SESSION_CITY_LABEL = { london: 'London', newyork: 'New York', tokyo: 'Tokyo', sydney: 'Sydney' };
function sessionCityLabel(session) { return SESSION_CITY_LABEL[session] || session || '—'; }

// ============================================================================
// Panel catalog - meta is computed per-render from real data (below), never a static count.
// ============================================================================
function catalog(t) {
  return {
    psych: { title: t('catPsychTitle'), icon: 'psychology', span: 4, desc: t('catPsychDesc') },
    weather: { title: t('catWeatherTitle'), icon: 'streak', span: 4, desc: t('catWeatherDesc') },
    session: { title: t('catSessionTitle'), icon: 'status', span: 4, desc: t('catSessionDesc') },
    sessions: { title: t('catSessionsTitle'), icon: 'sessions', span: 4, desc: t('catSessionsDesc') },
    positions: { title: t('catPositionsTitle'), icon: 'execution', span: 6, desc: t('catPositionsDesc') },
    chart: { title: t('catChartTitle'), icon: 'report', span: 6, desc: t('catChartDesc') },
    strategies: { title: t('catStrategiesTitle'), icon: 'strategies', span: 4, desc: t('catStrategiesDesc') },
    patterns: { title: t('catPatternsTitle'), icon: 'scenarios', span: 4, desc: t('catPatternsDesc') },
    reward: { title: t('catRewardTitle'), icon: 'reward', span: 4, desc: t('catRewardDesc') },
    video: { title: t('catVideoTitle'), icon: 'ai-assistant', span: 4, desc: t('catVideoDesc') },
    banner: { title: t('catBannerTitle'), icon: 'subscription', span: 12, desc: t('catBannerDesc') },
    watchlist: { title: t('catWatchlistTitle'), icon: 'globe', span: 4, desc: t('catWatchlistDesc') }
  };
}

// ============================================================================
// Small shared primitives
// ============================================================================
function ProgressBar({ pct, color }) {
  return (
    <span style={{ display: 'block', height: 6, borderRadius: 4, background: 'rgba(244,234,215,.08)', overflow: 'hidden' }}>
      <span style={{ display: 'block', height: '100%', borderRadius: 4, background: color || 'var(--char-accent)', width: Math.max(0, Math.min(100, pct)) + '%' }} />
    </span>
  );
}
function EmptyPanelNote({ title, note, icon }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 120, textAlign: 'center', padding: '12px 4px' }}>
      {icon && <span style={{ color: 'var(--text-disabled)' }}><Icon name={icon} size={22} /></span>}
      <span style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
      {note && <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{note}</span>}
    </div>
  );
}
function NotConnectedNote({ t }) {
  return <EmptyPanelNote icon="shield-alert" title={t('notConnectedYet')} />;
}

// ============================================================================
// Panel bodies - each is a pure function of real store data.
// ============================================================================

// Psychology dossier: five real completion signals from the mental-health profile (intake +
// psychological-profile fields) plus the real Pattern Registry count for "pattern library" -
// not a fabricated 68%, an honest average of five concrete field-fill ratios.
function pctFilled(fields) {
  const total = fields.length;
  if (!total) return 0;
  const filled = fields.filter((v) => v !== null && v !== undefined && v !== '').length;
  return Math.round((filled / total) * 100);
}
function PsychPanel({ t, lang }) {
  const mh = window.TradeJournalMentalHealthStore;
  if (!mh) return <NotConnectedNote t={t} />;
  const profile = mh.load();
  const intake = profile.intake, fin = intake.financialContext, dem = intake.demographics;
  const patternStore = window.TradeJournalPatternStore;
  const patternCount = patternStore ? patternStore.listSync().length : 0;
  const rows = [
    [t('identityGoals'), pctFilled([dem.age, dem.gender, dem.maritalStatus, dem.primaryOccupation, dem.isFullTimeTrader, intake.motivationForTrading])],
    [t('riskTemperament'), pctFilled([fin.capitalType, fin.capitalAllocationPercent, fin.borrowedMoneyForTrading, profile.psychologicalProfile.standardizedTests.riskToleranceScale])],
    [t('emotionalTriggers'), pctFilled([intake.firstBigLossReaction, profile.triggerProfile.triggers.length ? 'x' : null])],
    // 5 registered patterns reads as "a working library" - the same kind of defined, documented
    // threshold this app already uses elsewhere (e.g. the 12-week trend window), not a magic number.
    [t('patternLibrary'), Math.min(100, Math.round((patternCount / 5) * 100))],
    [t('dailyRoutine'), pctFilled([profile.activeInterventions.preTradeChecklistEnabled ? 'x' : null, profile.continuousTracking.preSessionCheckIns.length ? 'x' : null])]
  ];
  const overall = Math.round(rows.reduce((s, r) => s + r[1], 0) / rows.length);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ position: 'relative', width: 108, height: 108, flex: 'none', borderRadius: '50%', background: 'conic-gradient(var(--char-accent) ' + (overall * 3.6).toFixed(1) + 'deg, rgba(244,234,215,.09) 0)' }}>
          <span aria-hidden="true" style={{ position: 'absolute', inset: 8, borderRadius: '50%', background: 'var(--ink-950)', border: '1px solid var(--divider-gold)' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <span className="navrya-tabular" dir="ltr" style={{ font: '600 26px/28px var(--font-num)', color: 'var(--char-accent)' }}>{digits(lang, overall) + '%'}</span>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('complete')}</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {rows.map(([label, pct]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: '.06em', color: 'var(--text-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-caption)', color: 'var(--gold-warm)' }}>{digits(lang, pct) + '%'}</span>
              </div>
              <ProgressBar pct={pct} />
            </div>
          ))}
        </div>
      </div>
      <Button variant="secondary" icon="psychology" fullWidth onClick={() => { if (window.TradeJournalMentalHealthIntake) window.TradeJournalMentalHealthIntake.open(); }}>{t('continueDossier')}</Button>
    </div>
  );
}

// Emotional weather: TradeJournalPsychologyStore.emotionalWeatherDaily() (real per-day avg
// stress from actual emotion logs) inverted into a 0-100 "mood index" (low stress -> high mood),
// plus emotionFrequency() for the dominant-emotion chips. Days with no logged stress render as an
// honest gap, not an invented bar.
function WeatherPanel({ t, lang }) {
  const psy = window.TradeJournalPsychologyStore;
  const tradeStore = window.TradeJournalTradeStore;
  const tradeI18n = window.TradeJournalTradeI18n;
  if (!psy || !tradeStore) return <NotConnectedNote t={t} />;
  const trades = tradeStore.listSync();
  const daily = psy.emotionalWeatherDaily(trades, 7);
  const freq = psy.emotionFrequency(trades, 14).slice(0, 3);
  const days = daily.map((d) => d.date.toLocaleDateString(lang === 'fa' ? 'fa-IR' : lang === 'ar' ? 'ar-EG' : lang, { weekday: 'narrow' }));
  const latest = daily[daily.length - 1];
  const moodIndex = latest && latest.avgStress !== null ? Math.round(100 - latest.avgStress * 10) : null;
  const moodTone = (idx) => (idx === null ? 'var(--text-disabled)' : idx >= 65 ? 'var(--char-accent)' : idx >= 45 ? 'var(--warning)' : 'var(--danger)');
  const hasAny = daily.some((d) => d.avgStress !== null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.5)' }}>
        <span style={{ width: 48, height: 48, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.6)', color: moodTone(moodIndex) }}>
          <Icon name={moodIndex === null ? 'circle-dashed' : moodIndex >= 65 ? 'sun' : moodIndex >= 45 ? 'cloud' : 'cloud-lightning'} size={24} />
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-display-md)', fontFamily: 'var(--font-num)', color: 'var(--text-primary)' }}>{moodIndex === null ? '—' : digits(lang, moodIndex)}</span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{hasAny ? t('index') : t('noWeatherData')}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('last7Sessions')}</span>
        <div style={{ direction: 'ltr', display: 'flex', alignItems: 'flex-end', gap: 8, height: 60 }}>
          {daily.map((d, i) => {
            const idx = d.avgStress === null ? null : Math.round(100 - d.avgStress * 10);
            const h = idx === null ? 6 : Math.round((idx / 100) * 46) + 8;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <span style={{ display: 'block', width: '100%', borderRadius: '4px 4px 0 0', background: idx === null ? 'rgba(244,234,215,.08)' : moodTone(idx), height: h + 'px' }} />
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{days[i]}</span>
              </div>
            );
          })}
        </div>
      </div>
      {!!freq.length && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {freq.map((f) => (
            <Chip key={f.emotion} tone="accent">{(tradeI18n ? tradeI18n.t(f.emotion) : f.emotion) + ' · ' + digits(lang, Math.round(f.pct)) + '%'}</Chip>
          ))}
        </div>
      )}
    </div>
  );
}

// Open session: the most recent non-closed real session record (sessionsAdapter), with elapsed
// time, the trade count actually linked to it (source.sessionId) and a discipline % using the
// exact same entryMode==='full' ratio TradeJournalPsychologyStore.disciplineWeekly() already uses,
// just scoped to this one session instead of a calendar week.
function OpenSessionPanel({ t, lang, character, now }) {
  const tradeStore = window.TradeJournalTradeStore;
  let sessions = [];
  try { sessions = sessionsAdapter.readSessions(character) || []; } catch (_) { sessions = []; }
  const open = sessions.filter((s) => s.status !== 'closed' && (s.startedAt || s.createdAt)).sort((a, b) => (Number(b.startedAt || b.createdAt) || 0) - (Number(a.startedAt || a.createdAt) || 0))[0];
  if (!open) {
    return <EmptyPanelNote icon="status" title={t('noOpenSession')} note={t('startOneNote')} />;
  }
  // open.startedAt/createdAt are ISO strings (sessionsAdapter.js's own sessionTimestamp() reads
  // them the same way) - Number(isoString) is NaN, so this must go through Date, not Number.
  const startedAtParsed = new Date(open.startedAt || open.createdAt).getTime();
  const startedAt = Number.isFinite(startedAtParsed) ? startedAtParsed : Date.now();
  const elapsedMs = Math.max(0, now.getTime() - startedAt);
  const linked = tradeStore ? tradeStore.listSync().filter((tr) => tr.source && tr.source.sessionId === open.id) : [];
  const closedLinked = linked.filter((tr) => tr.status === 'closed');
  const fullCount = linked.filter((tr) => tr.entryMode === 'full').length;
  const disciplinePct = linked.length ? Math.round((fullCount / linked.length) * 100) : null;
  const bookedR = closedLinked.length ? closedLinked.reduce((sum, tr) => sum + (Number.isFinite(Number(tr.rr)) ? Number(tr.rr) * (tr.outcome === 'loss' ? -1 : 1) : 0), 0) : null;
  const city = sessionsAdapter.displayCity(open.market);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 13, borderRadius: 8, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', boxShadow: '0 0 16px var(--char-glow)' }}>
        <span style={{ width: 8, height: 8, flex: 'none', borderRadius: '50%', background: 'var(--success)' }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span dir="auto" style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{city}</span>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('sessionOpenSince', { window: (open.timeframe || open.date || '—') })}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-countdown)', color: 'var(--gold-warm)' }}>{marketAdapter.elapsedClock(elapsedMs)}</span>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('elapsed')}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 10px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('trades')}</span>
          <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-metric-value)', color: 'var(--text-primary)' }}>{digits(lang, linked.length)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 10px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('booked')}</span>
          <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-metric-value)', color: 'var(--char-accent)' }}>{bookedR === null ? '—' : (bookedR >= 0 ? '+' : '') + digits(lang, round1(bookedR)) + 'R'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 10px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('discipline')}</span>
          <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-metric-value)', color: 'var(--gold-warm)' }}>{disciplinePct === null ? '—' : digits(lang, disciplinePct) + '%'}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="primary" icon="edit" style={{ flex: 1 }} onClick={() => { if (window.TradeJournalNavryaTradeLog) window.TradeJournalNavryaTradeLog.open({ source: { character, sessionId: open.id } }); else if (window.TradeJournalTradeUI) window.TradeJournalTradeUI.openWizard({ source: { character, sessionId: open.id } }); }}>{t('logTrade')}</Button>
      </div>
    </div>
  );
}

// Market sessions: the same real UTC-window math marketAdapter.js already gives HeaderApp's
// market cards - just laid out as a 24h track here instead of a card row.
function MarketSessionsPanel({ t, lang, now }) {
  const states = marketAdapter.marketStates(now);
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const bands = CITIES.map((c) => {
    const start = ((c.from - c.off) * 60 + 1440) % 1440;
    const dur = ((c.to - c.from + 24) % 24 || 24) * 60;
    const open = states.find((s) => s.market === c.market);
    return { left: (start / 1440 * 100).toFixed(2) + '%', width: (Math.min(dur, 1440) / 1440 * 100).toFixed(2) + '%', open: open && open.state === 'open' };
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ direction: 'ltr', position: 'relative', height: 30, borderRadius: 6, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.5)', overflow: 'hidden' }}>
        {bands.map((b, i) => (
          <span key={i} style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 4, background: b.open ? 'var(--char-active-surface)' : 'rgba(244,234,215,.05)', left: b.left, width: b.width }} />
        ))}
        <span aria-hidden="true" style={{ position: 'absolute', top: -2, bottom: -2, width: 2, background: 'var(--gold-warm)', left: (utcMin / 1440 * 100).toFixed(2) + '%' }} />
      </div>
      <div style={{ direction: 'ltr', display: 'flex', justifyContent: 'space-between', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>
        <span>00:00</span><span>08:00</span><span>16:00</span><span>24:00</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {CITIES.map((c) => {
          const s = states.find((x) => x.market === c.market);
          const open = s && s.state === 'open';
          return (
            <div key={c.market} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
              <span style={{ width: 8, height: 8, flex: 'none', borderRadius: '50%', background: open ? 'var(--success)' : 'var(--steel, var(--text-disabled))' }} />
              <span style={{ font: 'var(--type-username)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-primary)', flex: 1 }}>{c.city}</span>
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{open ? t('open') : t('closed')}</span>
              <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-countdown)', fontSize: 15, color: 'var(--gold-warm)' }}>{s ? s.countdown : '—'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Open positions: real hunting/open trades from TradeJournalTradeStore, same fields the redesigned
// Log Trade wizard/Calculator wrote (entryPrice/stopLoss/takeProfits[0]/rr/leverage), same real
// actions (openEmotion/closeTrade/viewTrade) trade-ui.js already exposes - no new trade data model.
function PositionsPanel({ t, lang }) {
  const tradeStore = window.TradeJournalTradeStore;
  const tradeUi = window.TradeJournalTradeUI;
  const tradeI18n = window.TradeJournalTradeI18n;
  if (!tradeStore) return <NotConnectedNote t={t} />;
  const trades = tradeStore.listSync().filter((tr) => tr.status === 'hunting' || tr.status === 'open');
  if (!trades.length) return <EmptyPanelNote icon="execution" title={t('noOpenPositions')} note={t('noOpenPositionsNote')} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {trades.map((trade) => {
        const tp = trade.takeProfits && trade.takeProfits[0] ? trade.takeProfits[0].price : null;
        return (
          <div key={trade.id} style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: 13, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.45)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                <span style={{ font: 'var(--type-username)', letterSpacing: '.06em', color: 'var(--text-primary)' }}>{sessionCityLabel(trade.session)}</span>
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{tradeI18n ? tradeI18n.date(trade.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
              <Chip tone={trade.direction === 'short' ? 'danger' : 'accent'}>{tradeI18n ? tradeI18n.t(trade.direction) : trade.direction}</Chip>
              <Chip tone={trade.status === 'open' ? 'success' : 'accent'} dot>{tradeUi ? tradeUi.statusLabel(trade.status) : trade.status}</Chip>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)' }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('entry')}</span>
                <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-username)', color: 'var(--text-primary)' }}>{trade.entryPrice ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)' }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('stop')}</span>
                <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-username)', color: 'var(--danger)' }}>{trade.stopLoss ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)' }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('target')}</span>
                <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-username)', color: 'var(--success)' }}>{tp ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)' }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('rrLev')}</span>
                <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-username)', color: 'var(--gold-warm)' }}>{(trade.rr ? '1:' + round1(trade.rr) : '—') + ' · ' + (trade.leverage ? trade.leverage + '×' : '—')}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" onClick={() => { if (tradeUi) tradeUi.openEmotion(trade.id, 'mid_trade'); }} style={{ height: 38, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(214,175,107,.1)', color: 'var(--gold-warm)', font: 'var(--type-section-label)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                <Icon name="psychology" size={16} />{t('logEmotion')}
              </button>
              <button type="button" onClick={() => { if (tradeUi) tradeUi.closeTrade(trade.id); }} style={{ height: 38, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--text-primary)', font: 'var(--type-section-label)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                <Icon name="execution" size={16} />{t('closePosition')}
              </button>
              <span style={{ flex: 1 }} />
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('emotionLogsCount', { n: digits(lang, (trade.emotionLog || []).length) })}</span>
              <button type="button" onClick={() => { if (tradeUi) tradeUi.viewTrade(trade.id); }} aria-label={t('tradeDetails')} title={t('tradeDetails')} style={{ width: 38, height: 38, boxSizing: 'border-box', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-muted)' }}>
                <Icon name="eye" size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Performance: TradeJournalTradeStore.analytics() for the real win-rate/trade-count headline
// figures, plus a real realized-R-per-day series (pnl / riskAmount per closed trade, grouped by
// close day) for the trailing 10 active days - not the design mock's seeded 10-value array.
function ChartPanel({ t, lang }) {
  const tradeStore = window.TradeJournalTradeStore;
  if (!tradeStore) return <NotConnectedNote t={t} />;
  const trades = tradeStore.listSync();
  const stats = tradeStore.analytics(trades);
  const closed = trades.filter((tr) => tr.status === 'closed' && tr.closedAt);
  const byDay = {};
  closed.forEach((tr) => {
    const key = String(tr.closedAt).slice(0, 10);
    const r = Number.isFinite(Number(tr.rr)) ? Number(tr.rr) * (tr.outcome === 'loss' ? -1 : tr.outcome === 'breakeven' ? 0 : 1) : (Number.isFinite(Number(tr.pnl)) && Number.isFinite(Number(tr.riskAmount)) && tr.riskAmount ? tr.pnl / tr.riskAmount : 0);
    byDay[key] = (byDay[key] || 0) + r;
  });
  const dayKeys = Object.keys(byDay).sort().slice(-10);
  const maxAbs = Math.max(1, ...dayKeys.map((k) => Math.abs(byDay[k])));
  const winRate = stats.funnel.closed ? Math.round((stats.funnel.wins / stats.funnel.closed) * 100) : null;
  const rrValues = closed.filter((tr) => Number.isFinite(Number(tr.rr))).map((tr) => Number(tr.rr) * (tr.outcome === 'loss' ? -1 : 1));
  const avgR = rrValues.length ? round1(rrValues.reduce((s, v) => s + v, 0) / rrValues.length) : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('winRate')}</span>
          <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-metric-value)', color: 'var(--char-accent)' }}>{winRate === null ? '—' : digits(lang, winRate) + '%'}</span>
        </div>
        <span style={{ width: 1, height: 34, background: 'var(--divider-gold)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('avgR')}</span>
          <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-metric-value)', color: 'var(--gold-warm)' }}>{avgR === null ? '—' : digits(lang, avgR) + 'R'}</span>
        </div>
        <span style={{ width: 1, height: 34, background: 'var(--divider-gold)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('tradeCount')}</span>
          <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-metric-value)', color: 'var(--text-primary)' }}>{digits(lang, stats.total)}</span>
        </div>
      </div>
      {!dayKeys.length ? (
        <EmptyPanelNote icon="report" title={t('noPerfData')} />
      ) : (
        <div style={{ direction: 'ltr', display: 'flex', alignItems: 'stretch', gap: 9, height: 150, padding: '12px 4px 0', borderTop: '1px solid var(--border-hairline)' }}>
          {dayKeys.map((k) => {
            const v = byDay[k];
            const h = Math.round((Math.abs(v) / maxAbs) * 96) + 10;
            return (
              <div key={k} title={(v >= 0 ? '+' : '') + round1(v) + 'R'} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6 }}>
                <span style={{ display: 'block', width: '100%', borderRadius: '4px 4px 0 0', background: v >= 0 ? 'var(--char-accent)' : 'var(--danger)', height: h + 'px' }} />
                <span style={{ height: 1, background: 'var(--divider-gold)', display: 'block' }} />
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', textAlign: 'center' }}>{k.slice(5)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Active strategies: TradeJournalStrategyEducationStore.listActive() + its own detectionStats(),
// the exact pair navrya-src/panelsAdapter.js's useActiveStrategies() already calls.
function StrategiesPanel({ t, lang }) {
  const store = window.TradeJournalStrategyEducationStore;
  if (!store) return <NotConnectedNote t={t} />;
  const rows = store.listActive().map((s) => ({ id: s.id, name: s.name, stats: store.detectionStats(s) }));
  if (!rows.length) return <EmptyPanelNote icon="strategies" title={t('noStrategies')} note={t('noStrategiesNote')} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.slice(0, 5).map((s) => (
        <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span dir="auto" style={{ font: 'var(--type-username)', letterSpacing: '.04em', color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            <Chip tone="accent">{t('confirmed')}</Chip>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1 }}><ProgressBar pct={s.stats.confirmationRate || 0} /></span>
            <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-caption)', color: 'var(--gold-warm)' }}>{(s.stats.confirmationRate === null ? '—' : digits(lang, Math.round(s.stats.confirmationRate)) + '%') + ' · ' + digits(lang, s.stats.total) + ' ' + t('detections')}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Patterns: TradeJournalPatternStore.listSync() + its own scenarioReport(id) (occurred/not-
// occurred rows across every real session) for a real recognition-accuracy percent.
function PatternsPanel({ t, lang }) {
  const store = window.TradeJournalPatternStore;
  if (!store) return <NotConnectedNote t={t} />;
  const patterns = store.listSync().filter((p) => p.name);
  if (!patterns.length) return <EmptyPanelNote icon="scenarios" title={t('noPatterns')} note={t('noPatternsNote')} />;
  const rows = patterns.slice(0, 6).map((p) => {
    const report = store.scenarioReport(p.id);
    return { id: p.id, name: p.name, acc: report.hasData ? Math.round(report.occurrenceRate) : null, count: report.detectionCount || 0 };
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((q) => (
        <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span dir="auto" style={{ font: 'var(--type-username)', letterSpacing: '.04em', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.name}</span>
            <ProgressBar pct={q.acc || 0} color="var(--gold-warm)" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flex: 'none' }}>
            <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-username)', color: 'var(--char-accent)' }}>{q.acc === null ? '—' : digits(lang, q.acc) + '%'}</span>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{digits(lang, q.count) + ' ' + t('seen')}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Next reward: ports character-app.jsx's own rewardPropsFor()/nextGoal logic (same real
// TradeJournalAccountProfileStore.nextGoal() + TradeJournalProfileXPRules the Sidebar's
// RewardCard already uses) so the number here can never drift from what the sidebar shows.
function RewardPanel({ t, lang }) {
  const [goal, setGoal] = React.useState(undefined);
  React.useEffect(() => {
    const profileStore = window.TradeJournalAccountProfileStore;
    if (!profileStore || !profileStore.nextGoal) { setGoal(null); return; }
    let cancelled = false;
    profileStore.nextGoal().then((g) => { if (!cancelled) setGoal(g || null); }).catch(() => { if (!cancelled) setGoal(null); });
    return () => { cancelled = true; };
  }, []);
  if (goal === undefined) return <EmptyPanelNote title={t('loadingReward')} />;
  // A store that legitimately answers "no goal right now" (e.g. achievement definitions not yet
  // loaded in this tab, or every achievement already unlocked with no rules engine present) is a
  // real "nothing to show" case, not a missing backend - matches the Sidebar's own reward widget,
  // which the same window.TradeJournalAccountProfileStore.nextGoal() already feeds.
  if (!goal) return <EmptyPanelNote icon="reward" title={t('noRewardYet')} />;
  const profileI18n = window.TradeJournalAccountProfileI18n;
  let title = t('level'), sub = '', pct = goal.progress || 0;
  if (goal.kind === 'achievement') {
    title = profileI18n ? profileI18n.t('ach' + goal.labelKey + 'Title') : goal.key;
    sub = digits(lang, goal.points) + ' XP';
  } else if (goal.kind === 'level') {
    sub = t('xpToGo', { xp: digits(lang, goal.xpToGo) });
  } else if (goal.kind === 'maxLevel') {
    title = t('maxLevel'); sub = ''; pct = 100;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--gold-warm)' }}>
          <Icon name="reward" size={22} />
        </span>
        <div dir="auto" style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('catRewardTitle')}</span>
          <span style={{ font: 'var(--type-username)', letterSpacing: '.06em', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        </div>
        <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-metric-value)', color: 'var(--char-accent)' }}>{digits(lang, Math.round(pct)) + '%'}</span>
      </div>
      <ProgressBar pct={pct} />
      {sub && <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  );
}

function NoBackendPanel({ t, cta }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <NotConnectedNote t={t} />
      {cta}
    </div>
  );
}

function panelBody(id, ctx) {
  const { t, lang, character, now } = ctx;
  switch (id) {
    case 'psych': return <PsychPanel t={t} lang={lang} />;
    case 'weather': return <WeatherPanel t={t} lang={lang} />;
    case 'session': return <OpenSessionPanel t={t} lang={lang} character={character} now={now} />;
    case 'sessions': return <MarketSessionsPanel t={t} lang={lang} now={now} />;
    case 'positions': return <PositionsPanel t={t} lang={lang} />;
    case 'chart': return <ChartPanel t={t} lang={lang} />;
    case 'strategies': return <StrategiesPanel t={t} lang={lang} />;
    case 'patterns': return <PatternsPanel t={t} lang={lang} />;
    case 'reward': return <RewardPanel t={t} lang={lang} />;
    case 'video': return <NoBackendPanel t={t} />;
    case 'banner': return <NoBackendPanel t={t} />;
    case 'watchlist': return <NoBackendPanel t={t} />;
    default: return null;
  }
}

// Live meta strings (position count, running-strategy count, ...) computed fresh per render -
// never the design mock's static "3 open"/"4 running".
function panelMeta(id, t, lang) {
  const tradeStore = window.TradeJournalTradeStore;
  const stratStore = window.TradeJournalStrategyEducationStore;
  if (id === 'positions' && tradeStore) return t('catPositionsMeta', { n: digits(lang, tradeStore.listSync().filter((tr) => tr.status === 'hunting' || tr.status === 'open').length) });
  if (id === 'strategies' && stratStore) return t('catStrategiesMeta', { n: digits(lang, stratStore.listActive().length) });
  return t('cat' + id.charAt(0).toUpperCase() + id.slice(1) + 'Meta');
}

// ============================================================================
// Board chrome: title row, toolbar, panel library, the 12-column drag/resize grid.
// ============================================================================
export function DashboardView({ character }) {
  const lang = document.documentElement.lang || 'fa';
  const rtl = lang === 'fa' || lang === 'ar';
  const t = (key, vars) => tr(lang, key, vars);
  const CAT = React.useMemo(() => catalog(t), [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const [state, setState] = React.useState(() => loadBoard(character));
  const [editing, setEditing] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [dragId, setDragId] = React.useState(null);
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  React.useEffect(() => { saveBoard(character, state); }, [character, state]);
  React.useEffect(() => {
    const onChange = () => setState((s) => ({ ...s }));
    window.addEventListener('tradejournal:trades-changed', onChange);
    return () => window.removeEventListener('tradejournal:trades-changed', onChange);
  }, []);

  function spanOf(id) { return state.spans[id] || CAT[id].span; }
  function setSpan(id, dir) {
    const i = SPANS.indexOf(spanOf(id));
    const next = SPANS[Math.min(SPANS.length - 1, Math.max(0, i + dir))];
    setState((s) => ({ ...s, spans: { ...s.spans, [id]: next } }));
  }
  function remove(id) { setState((s) => ({ ...s, board: s.board.filter((x) => x !== id) })); }
  function add(id) { setState((s) => ({ ...s, board: s.board.concat([id]) })); setAdding(false); }
  function drop(targetId) {
    if (!dragId || dragId === targetId) return;
    setState((s) => {
      const board = s.board.filter((x) => x !== dragId);
      board.splice(board.indexOf(targetId), 0, dragId);
      return { ...s, board };
    });
    setDragId(null);
  }

  const tray = Object.keys(CAT).filter((id) => state.board.indexOf(id) < 0);
  const ctx = { t, lang, character, now };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <h1 style={{ margin: 0, font: 'var(--type-display-lg)', letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase', color: 'var(--parchment)' }}>{t('title')}</h1>
          <p style={{ margin: '6px 0 0', font: 'var(--type-body)', color: 'var(--text-muted)', maxWidth: 640 }}>{t('subtitle')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="primary" icon="new-session" onClick={() => { if (window.TradeJournalPanelLayer) window.TradeJournalPanelLayer.render('library'); }}>{t('startSession')}</Button>
          <Button variant="secondary" icon="edit" onClick={() => openLogWizard()}>{t('logTrade')}</Button>
          <Button variant="secondary" icon="execution" onClick={() => openCalculator()}>{t('calculator')}</Button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--gold-warm)', display: 'flex' }}><Icon name="dashboard" size={16} /></span>
        <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('panelsOnBoard', { n: digits(lang, state.board.length), m: digits(lang, tray.length) })}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setAdding((v) => !v)} style={{ height: 38, display: 'flex', alignItems: 'center', gap: 9, padding: '0 14px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'var(--surface-800)', color: 'var(--text-primary)', font: 'var(--type-section-label)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
          <Icon name="plus" size={16} />{t('addPanel')}
        </button>
        <button
          type="button" onClick={() => setEditing((v) => !v)}
          style={{
            height: 38, display: 'flex', alignItems: 'center', gap: 9, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
            border: editing ? '2px solid var(--char-accent)' : '1px solid var(--divider-gold)', background: editing ? 'var(--char-active-surface)' : 'transparent',
            color: editing ? 'var(--text-primary)' : 'var(--text-muted)', font: 'var(--type-section-label)', letterSpacing: '.1em', textTransform: 'uppercase',
            boxShadow: editing ? '0 0 16px var(--char-glow)' : 'none'
          }}
        >
          <Icon name={editing ? 'check' : 'settings'} size={16} />{editing ? t('doneArranging') : t('arrangePanels')}
        </button>
      </div>

      {adding && (
        <Panel variant="prestige" radius={12} padding={0}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
            <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('panelLibrary')}</span>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => setAdding(false)} aria-label={t('closeLibrary')} style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}>
              <Icon name="close" size={16} />
            </button>
          </div>
          {!tray.length ? (
            <div style={{ padding: 16 }}><span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>—</span></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, padding: 16 }}>
              {tray.map((id) => (
                <button key={id} type="button" onClick={() => add(id)} style={{ textAlign: 'start', display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 8, cursor: 'pointer', border: '1px dashed var(--divider-gold)', background: 'rgba(11,20,21,.5)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--char-accent)' }}>
                    <Icon name={CAT[id].icon} size={18} />
                    <span style={{ font: 'var(--type-username)', letterSpacing: '.06em', color: 'var(--text-primary)' }}>{CAT[id].title}</span>
                  </span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{CAT[id].desc}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      )}

      {!state.board.length ? (
        <Panel variant="quiet" padding="34px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <span style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--parchment)' }}>{t('addPanel')}</span>
          </div>
        </Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,minmax(0,1fr))', gap: 16 }}>
          {state.board.map((id) => {
            const cat = CAT[id];
            if (!cat) return null;
            const span = spanOf(id);
            return (
              <section
                key={id}
                draggable={editing}
                onDragStart={() => setDragId(id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(id)}
                style={{ gridColumn: 'span ' + span, position: 'relative', display: 'flex', flexDirection: 'column', borderRadius: 12, border: '1px solid var(--border-gold)', background: 'var(--surface-800)', boxShadow: 'var(--shadow-panel)', overflow: 'hidden' }}
              >
                <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'var(--char-texture)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: .05 }} />
                <header style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderBottom: '1px solid var(--border-hairline)' }}>
                  <span style={{ display: 'flex', color: 'var(--char-accent)' }}><Icon name={cat.icon} size={17} /></span>
                  <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{cat.title}</span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{panelMeta(id, t, lang)}</span>
                  <span style={{ flex: 1 }} />
                  {editing && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ display: 'flex', color: 'var(--text-muted)', cursor: 'grab', padding: '0 2px' }} title={t('dragToReorder')}><Icon name="grip-vertical" size={16} /></span>
                      <button type="button" onClick={() => setSpan(id, -1)} aria-label={t('narrowPanel')} disabled={span <= SPANS[0]} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-muted)', opacity: span <= SPANS[0] ? .4 : 1 }}><Icon name="minus" size={14} /></button>
                      <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', minWidth: 32, textAlign: 'center' }}>{span + '/12'}</span>
                      <button type="button" onClick={() => setSpan(id, 1)} aria-label={t('widenPanel')} disabled={span >= 12} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-muted)', opacity: span >= 12 ? .4 : 1 }}><Icon name="plus" size={14} /></button>
                    </div>
                  )}
                  <button type="button" onClick={() => remove(id)} aria-label={t('removePanel')} title={t('removePanel')} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-muted)' }}>
                    <Icon name="close" size={14} />
                  </button>
                </header>
                <div style={{ position: 'relative', flex: 1, padding: 16 }}>
                  {panelBody(id, ctx)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

class DashboardBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <pre style={{ color: '#fbb', background: '#200', padding: 16, whiteSpace: 'pre-wrap' }}>{'[dashboard] ' + (this.state.error.stack || this.state.error.message)}</pre>;
    return this.props.children;
  }
}

export function renderDashboard(character) {
  const container = document.createElement('div');
  container.className = 'panel-page';
  container.dataset.character = currentNavryaCharacter();
  const lang = document.documentElement.lang || 'fa';
  const rtl = lang === 'fa' || lang === 'ar';
  container.dir = rtl ? 'rtl' : 'ltr';
  container.style.direction = rtl ? 'rtl' : 'ltr';
  createRoot(container).render(<DashboardBoundary><DashboardView character={character} /></DashboardBoundary>);
  return container;
}
