import React from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { Toggle } from '../public/pages/shared/navrya/components/forms/Toggle.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { CharacterPortrait } from '../public/pages/shared/navrya/components/identity/CharacterPortrait.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';
import { CHARACTERS } from './characters.js';
import { SPANS, loadBoard, saveBoard, catalogForLang, resolveCustomEntry, addCustomPanel } from './dashboardView.jsx';
import { createStore } from './store.js';

// ============================================================================
// Redesign of Settings against the design handoff code-codex/setting/NavryaSettings.dc.html.
// Per the request, "Account & data" (billing/export/sign-out/delete-account - already served by
// the real, separate Subscriptions and Account Profile screens) is intentionally NOT rebuilt
// here. Every other section below is wired to a real store:
//  - AI panel builder -> the same /api/ai/chat call the floating assistant uses
//    (chat-dock-core.js's sendChat), drafting real panels onto the real Dashboard board.
//  - Manage panels -> the exact board record navrya-src/dashboardView.jsx itself reads/writes.
//  - Character -> the same postMessage character switch the app already uses elsewhere.
//  - Region & language -> Language calls the app's one real language store (navrya-src/store.js);
//    country/timezone/currency/week-start/clock-format are new, genuinely persisted fields (see
//    public/pages/shared/app-settings-store.js) - not yet consumed elsewhere in the app, same as
//    several of MentalHealthStore's own fields were before their first UI.
//  - Alerts & discipline -> cool-down lock is MentalHealthStore's own real, previously
//    UI-less activeInterventions.cooldownTimerEnabled; the other five are the same new
//    app-settings-store, ready for a future notification-delivery layer
//    (window.TradeJournalNotificationProvider already documents this exact seam).
//  - Trading defaults -> trade-store.js's own real settings()/saveSettings(), the identical
//    object the Calculator and Trade Log already read defaultRiskPercent from.
// ============================================================================

const CHARS = [
  { id: 'hunter', navryaId: 'hunter', swatch: '#66C94E' },
  { id: 'commander', navryaId: 'commander', swatch: '#F04432' },
  { id: 'engineer', navryaId: 'engineer', swatch: '#3A9AF8' },
  { id: 'sage', navryaId: 'master', swatch: '#A965D8' }
];

const copy = {
  fa: {
    title: 'تنظیمات', subtitle: 'با دستیار پنل بساز، هر صفحه را بچین، و شخصیت، منطقه و قواعدی که اپ با آن کار می‌کند را تعیین کن.',
    aiBuilderTitle: 'سازنده پنل با هوش مصنوعی', aiBuilderSubtitle: 'یک پنل را با کلمات ساده توصیف کن — دستیار آن را برای داشبورد پیش‌نویس می‌کند.',
    aiReady: 'دستیار آماده است', aiNotConfigured: 'هوش مصنوعی پیکربندی نشده', goToAiSettings: 'رفتن به تنظیمات هوش مصنوعی',
    promptPlaceholder: 'مثلاً: پنلی که تعداد معاملات انتقامی هر سشن را کنار نرخ برد نشان بدهد.',
    generatePanel: 'ساخت پنل', hintEmpty: 'یک پنل را در هر بار توصیف کن.', hintTyped: 'پیش‌نویس‌ها زیر ظاهر می‌شوند — تا تأیید نکنی چیزی اضافه نمی‌شود.', hintBusy: 'دستیار در حال نوشتن…',
    aiErrorGeneric: 'درخواست ناموفق بود. دوباره امتحان کن.',
    quickPrompts: ['تعداد معاملات انتقامی هر سشن', 'ریسک استفاده‌شده در برابر ریسک برنامه‌ریزی‌شده', 'نقشه حرارتی احساس در برابر نتیجه', 'الگوهایی که مدام از دست می‌دهم'],
    draftsLabel: 'پیش‌نویس‌های دستیار', addToBoard: 'افزودن به تخته', discardDraft: 'رد کردن پیش‌نویس', draftedNote: 'پیش‌نویس‌شده از توصیف تو',
    characterTitle: 'شخصیت', characterHint: 'فقط پوسته — هرگز داده‌هایت', selected: 'انتخاب‌شده', preview: 'پیش‌نمایش',
    switcherLabel: 'در سوییچر سریع در دسترس', hunterName: 'شکارچی', commanderName: 'فرمانده', engineerName: 'مهندس بازار', sageName: 'حکیم بازار',
    hunterTrait: 'صبر · کمین', commanderTrait: 'فرماندهی · اراده', engineerTrait: 'سیستم · اثبات', sageTrait: 'دوراندیشی · آرامش',
    managePanelsTitle: 'مدیریت پنل‌ها', shownOfTotal: '{shown}/{total} نمایش داده می‌شود · برای جابه‌جایی بکش', dragToReorder: 'برای جابه‌جایی بکش',
    narrowPanel: 'باریک‌تر', widenPanel: 'عریض‌تر', toggleShowHide: 'نمایش یا پنهان', removePanel: 'حذف پنل', noPanelsYet: 'داشبورد پنلی ندارد — از خود داشبورد یکی اضافه کن.',
    regionTitle: 'منطقه و زبان', countryLabel: 'کشور', countryHint: 'تعطیلات، سشن‌ها و سال مالیاتی را تعیین می‌کند',
    languageLabel: 'زبان', languageHint: 'زبان رابط کاربری', timezoneLabel: 'منطقه زمانی', timezoneHint: 'ساعت‌ها و مرزهای سشن',
    currencyLabel: 'واحد پول حساب', currencyHint: 'ریسک و سود/زیان با این واحد نمایش داده می‌شود', weekLabel: 'شروع هفته', weekHint: 'شبکه ژورنال و تقویم',
    clockLabel: 'قالب ساعت', clockHint: 'زمان سشن‌ها در کل اپ', h24: '۲۴ ساعته', h12: '۱۲ ساعته',
    alertsTitle: 'هشدارها و انضباط',
    sessionOpenLabel: 'هشدار باز شدن سشن', sessionOpenHint: 'وقتی لندن، نیویورک، توکیو یا سیدنی باز می‌شود اطلاع بده',
    positionLabel: 'هشدارهای پوزیشن', positionHint: 'اطلاع‌رسانی حد ضرر، هدف و نقطه سربه‌سر',
    emotionLabel: 'چک‌این احساسی', emotionHint: 'در حین باز بودن معامله ثبت وضعیت ذهنی بخواه',
    cooldownLabel: 'قفل استراحت اجباری', cooldownHint: 'بعد از دو ضرر پیاپی، ورود جدید را ۱۵ دقیقه ببند',
    communityLabel: 'پاسخ‌های تالار گفتگو', communityHint: 'پاسخ به پست‌ها و پیام‌های مستقیم',
    soundLabel: 'صدا', soundHint: 'نشانه شنیداری همراه با هر هشدار',
    tradingDefaultsTitle: 'پیش‌فرض‌های معاملاتی', riskPerTradeLabel: 'ریسک هر معامله', leverageCapLabel: 'سقف اهرم', tradesPerSessionLabel: 'معامله در هر سشن',
    defaultsNote: 'پیش‌فرض‌ها ماشین‌حساب و ثبت معامله را از پیش پر می‌کنند. هرگز سفارشی ثبت نمی‌کنند.',
    decrease: 'کاهش', increase: 'افزایش',
    companionTitle: 'همراه هوش مصنوعی', companionInitiativeLabel: 'میزان پیش‌قدمی', companionInitiativeHint: 'مشخص می‌کند همراه هوش مصنوعی چقدر خودش قدم بعدی را پیشنهاد بدهد.',
    companionInitiativeLow: 'کم', companionInitiativeNormal: 'معمولی', companionInitiativeHigh: 'زیاد',
    voiceGenderTitle: 'صدای شخصیت‌ها', voiceGenderHint: 'وقتی حالت صوتی فعال است، هر شخصیت با صدای زن یا مرد صحبت می‌کند؟', voiceGenderMale: 'مرد', voiceGenderFemale: 'زن',
    companionGoalLabel: 'هدف فعلی', companionGoalHint: 'روی کدام بخش می‌خواهی بیشتر تمرکز کنی؟ فقط اولویت پیشنهادها را بالا می‌برد؛ هیچ‌چیزی را کامل یا نادیده نمی‌کند.',
    companionGoalNone: 'بدون هدف مشخص', companionGoalPatterns: 'ساختن دانش پترن', companionGoalStrategies: 'ساختن استراتژی',
    companionGoalSessions: 'بهبود برنامه‌ریزی سشن', companionGoalTrades: 'بهبود برنامه‌ریزی معامله', companionGoalPsychology: 'بهبود عادت‌های جمع‌بندی و روان‌شناسی'
  },
  ar: {
    title: 'الإعدادات', subtitle: 'ابنِ لوحات مع المساعد، رتّب كل شاشة، وحدّد الشخصية والمنطقة والقواعد التي يعمل بها التطبيق.',
    aiBuilderTitle: 'أداة إنشاء اللوحات بالذكاء الاصطناعي', aiBuilderSubtitle: 'صف لوحة بكلمات بسيطة — يصوغها المساعد للوحة التحكم.',
    aiReady: 'المساعد جاهز', aiNotConfigured: 'الذكاء الاصطناعي غير مُهيَّأ', goToAiSettings: 'الذهاب إلى إعدادات الذكاء الاصطناعي',
    promptPlaceholder: 'مثال: لوحة تعرض عدد صفقات الانتقام لكل جلسة بجانب نسبة الفوز.',
    generatePanel: 'إنشاء لوحة', hintEmpty: 'صف لوحة واحدة في كل مرة.', hintTyped: 'تظهر المسودات أدناه — لن يُضاف شيء حتى توافق.', hintBusy: 'المساعد يكتب…',
    aiErrorGeneric: 'فشل الطلب. حاول مرة أخرى.',
    quickPrompts: ['عدد صفقات الانتقام لكل جلسة', 'المخاطرة المستخدمة مقابل المخطط لها', 'خريطة حرارية للمشاعر مقابل النتيجة', 'الأنماط التي أفوّتها باستمرار'],
    draftsLabel: 'مسودات المساعد', addToBoard: 'إضافة إلى اللوحة', discardDraft: 'تجاهل المسودة', draftedNote: 'مصاغة من وصفك',
    characterTitle: 'الشخصية', characterHint: 'مظهر فقط — أبداً بياناتك', selected: 'محدَّدة', preview: 'معاينة',
    switcherLabel: 'متاحة في المبدّل السريع', hunterName: 'الصياد', commanderName: 'القائد', engineerName: 'مهندس السوق', sageName: 'حكيم السوق',
    hunterTrait: 'الصبر · الكمين', commanderTrait: 'القيادة · العزم', engineerTrait: 'الأنظمة · الإثبات', sageTrait: 'التبصر · الهدوء',
    managePanelsTitle: 'إدارة اللوحات', shownOfTotal: '{shown}/{total} ظاهرة · اسحب لإعادة الترتيب', dragToReorder: 'اسحب لإعادة الترتيب',
    narrowPanel: 'أضيق', widenPanel: 'أوسع', toggleShowHide: 'إظهار أو إخفاء', removePanel: 'إزالة اللوحة', noPanelsYet: 'لوحة التحكم فارغة — أضف لوحة من هناك.',
    regionTitle: 'المنطقة واللغة', countryLabel: 'الدولة', countryHint: 'يحدد العطلات والجلسات والسنة الضريبية',
    languageLabel: 'اللغة', languageHint: 'لغة الواجهة', timezoneLabel: 'المنطقة الزمنية', timezoneHint: 'الساعات وحدود الجلسات',
    currencyLabel: 'عملة الحساب', currencyHint: 'تُعرض المخاطرة والأرباح/الخسائر بهذه العملة', weekLabel: 'بداية الأسبوع', weekHint: 'شبكة السجل والتقويم',
    clockLabel: 'تنسيق الساعة', clockHint: 'أوقات الجلسات في كل التطبيق', h24: '٢٤ ساعة', h12: '١٢ ساعة',
    alertsTitle: 'التنبيهات والانضباط',
    sessionOpenLabel: 'تنبيه فتح الجلسة', sessionOpenHint: 'نبّهني عند فتح لندن أو نيويورك أو طوكيو أو سيدني',
    positionLabel: 'تنبيهات الصفقات', positionHint: 'إشعارات الوقف والهدف ونقطة التعادل',
    emotionLabel: 'تسجيل الحالة الشعورية', emotionHint: 'اطلب تسجيل الحالة الذهنية أثناء فتح الصفقة',
    cooldownLabel: 'قفل التهدئة الإجباري', cooldownHint: 'امنع الدخول الجديد لمدة ١٥ دقيقة بعد خسارتين متتاليتين',
    communityLabel: 'ردود المجتمع', communityHint: 'الردود على منشوراتك ورسائلك المباشرة',
    soundLabel: 'الصوت', soundHint: 'تنبيه صوتي مع كل تنبيه',
    tradingDefaultsTitle: 'الإعدادات الافتراضية للتداول', riskPerTradeLabel: 'المخاطرة لكل صفقة', leverageCapLabel: 'سقف الرافعة', tradesPerSessionLabel: 'الصفقات لكل جلسة',
    defaultsNote: 'تملأ الإعدادات الافتراضية الحاسبة وسجل الصفقات مسبقاً. لا تُنفّذ أي أمر أبداً.',
    decrease: 'إنقاص', increase: 'زيادة',
    companionTitle: 'رفيق الذكاء الاصطناعي', companionInitiativeLabel: 'مستوى المبادرة', companionInitiativeHint: 'يحدد مدى مبادرة الرفيق باقتراح الخطوة التالية من تلقاء نفسه.',
    companionInitiativeLow: 'منخفضة', companionInitiativeNormal: 'عادية', companionInitiativeHigh: 'عالية',
    voiceGenderTitle: 'صوت الشخصيات', voiceGenderHint: 'عند تفعيل الوضع الصوتي، هل تتحدث كل شخصية بصوت رجل أم امرأة؟', voiceGenderMale: 'رجل', voiceGenderFemale: 'امرأة',
    companionGoalLabel: 'الهدف الحالي', companionGoalHint: 'على أي جزء تريد التركيز أكثر؟ يرفع فقط أولوية الاقتراحات؛ لا يُكمل أو يتجاهل أي شيء.',
    companionGoalNone: 'بلا هدف محدد', companionGoalPatterns: 'بناء معرفة الأنماط', companionGoalStrategies: 'بناء الاستراتيجية',
    companionGoalSessions: 'تحسين تخطيط الجلسات', companionGoalTrades: 'تحسين تخطيط الصفقات', companionGoalPsychology: 'تحسين عادات التأمل والصحة النفسية'
  },
  en: {
    title: 'Settings', subtitle: 'Build panels with the assistant, arrange every screen, and set the character, region and rules the app runs by.',
    aiBuilderTitle: 'AI panel builder', aiBuilderSubtitle: 'Describe a panel in plain words — the assistant drafts it for the dashboard.',
    aiReady: 'Assistant ready', aiNotConfigured: 'AI Assistant not configured', goToAiSettings: 'Go to AI Assistant settings',
    promptPlaceholder: 'e.g. A panel that shows my revenge-trade count per session next to my win rate.',
    generatePanel: 'Generate panel', hintEmpty: 'Describe one panel at a time.', hintTyped: 'Drafts appear below — nothing is added until you approve it.', hintBusy: 'The assistant is drafting…',
    aiErrorGeneric: 'The request failed. Try again.',
    quickPrompts: ['Revenge trades per session', 'Risk used vs planned', 'Emotion vs outcome heatmap', 'Patterns I keep missing'],
    draftsLabel: 'Drafts from the assistant', addToBoard: 'Add to board', discardDraft: 'Discard draft', draftedNote: 'Drafted from your description',
    characterTitle: 'Character', characterHint: 'Skin only — never your data', selected: 'Selected', preview: 'Preview',
    switcherLabel: 'Available in the quick switcher', hunterName: 'The Hunter', commanderName: 'The Commander', engineerName: 'Market Engineer', sageName: 'Market Sage',
    hunterTrait: 'Patience · ambush', commanderTrait: 'Command · intent', engineerTrait: 'Systems · proof', sageTrait: 'Foresight · calm',
    managePanelsTitle: 'Manage panels', shownOfTotal: '{shown}/{total} shown · drag to reorder', dragToReorder: 'Drag to reorder',
    narrowPanel: 'Narrow', widenPanel: 'Widen', toggleShowHide: 'Show or hide', removePanel: 'Remove panel', noPanelsYet: 'The dashboard has no panels yet — add one from the dashboard itself.',
    regionTitle: 'Region & language', countryLabel: 'Country', countryHint: 'Sets holidays, sessions and tax year',
    languageLabel: 'Language', languageHint: 'Interface language', timezoneLabel: 'Time zone', timezoneHint: 'Clocks and session boundaries',
    currencyLabel: 'Account currency', currencyHint: 'Risk and P&L are shown in this currency', weekLabel: 'Week starts on', weekHint: 'Journal and calendar grids',
    clockLabel: 'Clock format', clockHint: 'Session times across the app', h24: '24 h', h12: '12 h',
    alertsTitle: 'Alerts & discipline',
    sessionOpenLabel: 'Session open alert', sessionOpenHint: 'Ping when London, New York, Tokyo or Sydney opens',
    positionLabel: 'Position alerts', positionHint: 'Stop, target and break-even notifications',
    emotionLabel: 'Emotion check-ins', emotionHint: 'Ask for a mental-state log while a trade is open',
    cooldownLabel: 'Cool-down lock', cooldownHint: 'Block new entries for 15 minutes after two losses',
    communityLabel: 'Community replies', communityHint: 'Answers to your posts and direct messages',
    soundLabel: 'Sound', soundHint: 'Audible cue with every alert',
    tradingDefaultsTitle: 'Trading defaults', riskPerTradeLabel: 'Risk per trade', leverageCapLabel: 'Leverage cap', tradesPerSessionLabel: 'Trades per session',
    defaultsNote: 'Defaults pre-fill the calculator and the trade log. They never place an order.',
    decrease: 'Decrease', increase: 'Increase',
    companionTitle: 'AI companion', companionInitiativeLabel: 'Companion initiative', companionInitiativeHint: 'Controls how often the companion suggests a next step on its own.',
    companionInitiativeLow: 'Low', companionInitiativeNormal: 'Normal', companionInitiativeHigh: 'High',
    voiceGenderTitle: 'Character voices', voiceGenderHint: 'When Voice Mode is on, does each character speak with a male or female voice?', voiceGenderMale: 'Male', voiceGenderFemale: 'Female',
    companionGoalLabel: 'Current goal', companionGoalHint: 'Which area do you want to focus on? Only raises that area\'s suggestion priority - it never completes or overrides anything.',
    companionGoalNone: 'No specific goal', companionGoalPatterns: 'Build my Pattern knowledge', companionGoalStrategies: 'Build my Strategy',
    companionGoalSessions: 'Improve Session planning', companionGoalTrades: 'Improve trade planning', companionGoalPsychology: 'Improve reflection / psychology habits'
  },
  es: {
    title: 'Ajustes', subtitle: 'Crea paneles con el asistente, organiza cada pantalla y define el personaje, la región y las reglas con las que funciona la app.',
    aiBuilderTitle: 'Creador de paneles con IA', aiBuilderSubtitle: 'Describe un panel con palabras simples — el asistente lo redacta para el panel principal.',
    aiReady: 'Asistente listo', aiNotConfigured: 'IA no configurada', goToAiSettings: 'Ir a ajustes de IA',
    promptPlaceholder: 'ej. Un panel que muestre mis operaciones de venganza por sesión junto a mi win rate.',
    generatePanel: 'Generar panel', hintEmpty: 'Describe un panel a la vez.', hintTyped: 'Los borradores aparecen abajo — no se añade nada hasta que lo apruebes.', hintBusy: 'El asistente está redactando…',
    aiErrorGeneric: 'La solicitud falló. Inténtalo de nuevo.',
    quickPrompts: ['Operaciones de venganza por sesión', 'Riesgo usado vs planeado', 'Mapa de calor de emoción vs resultado', 'Patrones que sigo perdiendo'],
    draftsLabel: 'Borradores del asistente', addToBoard: 'Añadir al tablero', discardDraft: 'Descartar borrador', draftedNote: 'Redactado a partir de tu descripción',
    characterTitle: 'Personaje', characterHint: 'Solo apariencia — nunca tus datos', selected: 'Seleccionado', preview: 'Vista previa',
    switcherLabel: 'Disponible en el selector rápido', hunterName: 'El Cazador', commanderName: 'El Comandante', engineerName: 'Ingeniero de mercado', sageName: 'Sabio del mercado',
    hunterTrait: 'Paciencia · emboscada', commanderTrait: 'Mando · determinación', engineerTrait: 'Sistemas · prueba', sageTrait: 'Previsión · calma',
    managePanelsTitle: 'Gestionar paneles', shownOfTotal: '{shown}/{total} visibles · arrastra para reordenar', dragToReorder: 'Arrastra para reordenar',
    narrowPanel: 'Estrechar', widenPanel: 'Ampliar', toggleShowHide: 'Mostrar u ocultar', removePanel: 'Quitar panel', noPanelsYet: 'El panel principal aún no tiene paneles — añade uno desde allí.',
    regionTitle: 'Región e idioma', countryLabel: 'País', countryHint: 'Define festivos, sesiones y año fiscal',
    languageLabel: 'Idioma', languageHint: 'Idioma de la interfaz', timezoneLabel: 'Zona horaria', timezoneHint: 'Relojes y límites de sesión',
    currencyLabel: 'Moneda de la cuenta', currencyHint: 'El riesgo y el P&L se muestran en esta moneda', weekLabel: 'La semana empieza en', weekHint: 'Cuadrículas del diario y calendario',
    clockLabel: 'Formato de hora', clockHint: 'Horarios de sesión en toda la app', h24: '24 h', h12: '12 h',
    alertsTitle: 'Alertas y disciplina',
    sessionOpenLabel: 'Alerta de apertura de sesión', sessionOpenHint: 'Avisa cuando abra Londres, Nueva York, Tokio o Sídney',
    positionLabel: 'Alertas de posición', positionHint: 'Notificaciones de stop, objetivo y punto de equilibrio',
    emotionLabel: 'Chequeos emocionales', emotionHint: 'Pide un registro del estado mental mientras hay una operación abierta',
    cooldownLabel: 'Bloqueo de enfriamiento', cooldownHint: 'Bloquea nuevas entradas 15 minutos tras dos pérdidas',
    communityLabel: 'Respuestas de la comunidad', communityHint: 'Respuestas a tus publicaciones y mensajes directos',
    soundLabel: 'Sonido', soundHint: 'Aviso audible con cada alerta',
    tradingDefaultsTitle: 'Valores predeterminados de trading', riskPerTradeLabel: 'Riesgo por operación', leverageCapLabel: 'Tope de apalancamiento', tradesPerSessionLabel: 'Operaciones por sesión',
    defaultsNote: 'Los valores predeterminados prellenan la calculadora y el registro. Nunca ejecutan una orden.',
    decrease: 'Disminuir', increase: 'Aumentar',
    companionTitle: 'Compañero de IA', companionInitiativeLabel: 'Iniciativa del compañero', companionInitiativeHint: 'Controla con qué frecuencia el compañero sugiere un siguiente paso por su cuenta.',
    companionInitiativeLow: 'Baja', companionInitiativeNormal: 'Normal', companionInitiativeHigh: 'Alta',
    voiceGenderTitle: 'Voces de los personajes', voiceGenderHint: 'Cuando el Modo de Voz está activo, ¿cada personaje habla con voz masculina o femenina?', voiceGenderMale: 'Masculina', voiceGenderFemale: 'Femenina',
    companionGoalLabel: 'Objetivo actual', companionGoalHint: '¿En qué área quieres enfocarte más? Solo aumenta la prioridad de esas sugerencias; nunca completa ni anula nada.',
    companionGoalNone: 'Sin objetivo específico', companionGoalPatterns: 'Desarrollar mi conocimiento de Patrones', companionGoalStrategies: 'Desarrollar mi Estrategia',
    companionGoalSessions: 'Mejorar la planificación de Sesiones', companionGoalTrades: 'Mejorar la planificación de operaciones', companionGoalPsychology: 'Mejorar hábitos de reflexión / psicología'
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

function SectionShell({ icon, title, right, children }) {
  return (
    <Panel variant="prestige" radius={12} padding={0}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
        <span style={{ display: 'flex', color: 'var(--char-accent)' }}><Icon name={icon} size={18} /></span>
        <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{title}</span>
        <span style={{ flex: 1 }} />
        {right}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </Panel>
  );
}

// ============================================================================
// AI panel builder - real /api/ai/chat call (chat-dock-core.js's sendChat), drafting real
// panels onto the real Dashboard board via dashboardView.jsx's own addCustomPanel().
// ============================================================================
function AiPanelBuilderSection({ t, lang, character }) {
  const [prompt, setPrompt] = React.useState('');
  const [drafts, setDrafts] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const aiSettings = window.TradeJournalAISettingsStore;
  const configured = aiSettings ? !!aiSettings.getKey(aiSettings.activeProvider()) : false;

  // AI process registry (A4) - mountedRef template. This section is always present while the
  // Settings page is open (no separate show/hide toggle), so mounted === "on this settings tab".
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('settings-ai-panel-builder', {
      allowlist: ['prompt'],
      isOpen: () => mountedRef.current,
      applyValue: (path, value) => { if (path === 'prompt') setPrompt(String(value ?? '')); }
    });
    return () => { mountedRef.current = false; };
  }, []);

  async function generate() {
    const text = prompt.trim();
    if (!text || busy) return;
    setError('');
    if (!window.TradeJournalChatDockCore || !configured) { setError(t('aiNotConfigured')); return; }
    setBusy(true);
    try {
      const result = await window.TradeJournalChatDockCore.sendChat({
        text: 'Draft one dashboard panel idea for a trading journal app from this request, in ' + lang + '. Reply with 1-2 plain sentences describing what the panel would show - no markdown, no preamble. Request: ' + text
      });
      const desc = result && result.reply ? result.reply.trim() : t('draftedNote');
      setDrafts((list) => list.concat([{ id: 'draft-' + Date.now(), title: text.slice(0, 42), desc }]));
      setPrompt('');
    } catch (_) {
      setError(t('aiErrorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionShell icon="sparkle" title={t('aiBuilderTitle')} right={<Chip tone={configured ? 'accent' : 'neutral'} dot>{configured ? t('aiReady') : t('aiNotConfigured')}</Chip>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('aiBuilderSubtitle')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(copy[lang] || copy.en).quickPrompts.map((label) => (
            <button key={label} type="button" onClick={() => setPrompt(label)} style={{ padding: '7px 12px', borderRadius: 6, cursor: 'pointer', border: '1px dashed var(--divider-gold)', background: 'rgba(3,8,7,.5)', color: 'var(--text-muted)', font: 'var(--type-caption)' }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 10, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', overflow: 'hidden' }}>
          <textarea
            rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('promptPlaceholder')}
            style={{ resize: 'vertical', boxSizing: 'border-box', padding: 14, border: 0, background: 'transparent', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderTop: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.5)' }}>
            <span style={{ font: 'var(--type-caption)', color: error ? 'var(--danger)' : 'var(--text-muted)' }}>{error || (busy ? t('hintBusy') : prompt ? t('hintTyped') : t('hintEmpty'))}</span>
            <span style={{ flex: 1 }} />
            {!configured && (
              <button type="button" onClick={() => { location.hash = '#ai-settings'; }} style={{ height: 36, padding: '0 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'transparent', color: 'var(--text-muted)', font: 'var(--type-caption)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{t('goToAiSettings')}</button>
            )}
            <Button variant="primary" icon="sparkle" size="sm" disabled={!prompt.trim() || busy} onClick={generate}>{t('generatePanel')}</Button>
          </div>
        </div>
        {!!drafts.length && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('draftsLabel')}</span>
            {drafts.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
                <span style={{ width: 34, height: 34, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 6, border: '1px solid var(--divider-gold)', color: 'var(--gold-warm)' }}><Icon name="dashboard" size={17} /></span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                  <span dir="auto" style={{ font: 'var(--type-username)', letterSpacing: '.04em', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                  <span dir="auto" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.desc}</span>
                </div>
                <button type="button" onClick={() => { addCustomPanel(character, d.title, d.desc); setDrafts((list) => list.filter((x) => x.id !== d.id)); }} style={{ height: 36, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--text-primary)', font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                  <Icon name="plus" size={14} />{t('addToBoard')}
                </button>
                <button type="button" onClick={() => setDrafts((list) => list.filter((x) => x.id !== d.id))} aria-label={t('discardDraft')} style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-muted)' }}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionShell>
  );
}

// ============================================================================
// Character - real active-character switch (the same postMessage the app's login/select flow
// listens for) plus a real, persisted quick-switcher preference (app-settings-store.js).
// ============================================================================
function CharacterSection({ t, lang, character }) {
  const appSettings = window.TradeJournalAppSettingsStore;
  const [prefs, setPrefs] = React.useState(() => (appSettings ? appSettings.settings() : { quickSwitcher: CHARS.map((c) => c.id) }));
  const nameKey = { hunter: 'hunterName', commander: 'commanderName', engineer: 'engineerName', sage: 'sageName' };
  const traitKey = { hunter: 'hunterTrait', commander: 'commanderTrait', engineer: 'engineerTrait', sage: 'sageTrait' };
  return (
    <SectionShell icon="psychology" title={t('characterTitle')} right={<span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('characterHint')}</span>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
          {CHARS.map((c) => {
            const on = c.id === character;
            return (
              <button
                key={c.id} type="button" disabled={on}
                onClick={() => { if (!on) window.parent.postMessage({ type: 'tradejournal:character-selected', character: c.id }, '*'); }}
                style={{
                  position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 8,
                  cursor: on ? 'default' : 'pointer', textAlign: 'start',
                  border: on ? '2px solid var(--char-accent)' : '1px solid var(--divider-gold)',
                  background: on ? 'var(--char-active-surface)' : 'rgba(11,20,21,.55)'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CharacterPortrait character={c.navryaId} size={48} editable={false} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ font: 'var(--type-username)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(nameKey[c.id])}</span>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t(traitKey[c.id])}</span>
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: c.swatch }} />
                  <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: on ? 'var(--char-accent)' : 'var(--text-muted)' }}>{on ? t('selected') : t('preview')}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('switcherLabel')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CHARS.map((c) => {
              const on = prefs.quickSwitcher.indexOf(c.id) > -1;
              return (
                <button
                  key={c.id} type="button"
                  onClick={() => { if (appSettings) setPrefs(appSettings.setQuickSwitcher(c.id, !on)); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, cursor: 'pointer', border: on ? '2px solid var(--char-accent)' : '1px solid var(--divider-gold)', background: on ? 'var(--char-active-surface)' : 'rgba(11,20,21,.55)', color: on ? 'var(--text-primary)' : 'var(--text-muted)', font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase' }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: c.swatch }} />
                  {t(nameKey[c.id])}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

// ============================================================================
// Voice gender per character - one male/female pick per character (CHARS' own app id, e.g.
// 'sage'), applied globally across every language, read by the live Voice Mode via
// chatDockView.jsx's own voiceGenderPreference(). Persisted through the shared user-preferences.js
// primitive (public/pages/shared/user-preferences.js), the same server-synced store every other
// Phase 8 preference already uses - never a client-only/localStorage-only value. Purely a
// personalization pick: which admin-configured voice (if any) actually gets used is still decided
// server-side by resolveElevenLabsForRequest() - a character with no voice configured for the
// chosen gender simply falls back to the existing OpenAI voice, exactly like a disabled language
// already does.
// ============================================================================
function VoiceGenderSection({ t }) {
  const store = window.TradeJournalUserPreferences;
  const [prefs, setPrefs] = React.useState(() => (store ? store.getPref('voiceGenderPreference', {}) : {}));
  const nameKey = { hunter: 'hunterName', commander: 'commanderName', engineer: 'engineerName', sage: 'sageName' };
  const options = [
    { value: 'male', label: t('voiceGenderMale') },
    { value: 'female', label: t('voiceGenderFemale') }
  ];
  function change(characterId, value) {
    const next = { ...prefs, [characterId]: value };
    setPrefs(next);
    if (store) store.setPref('voiceGenderPreference', next);
  }
  return (
    <SectionShell icon="assistant" title={t('voiceGenderTitle')} right={<span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('voiceGenderHint')}</span>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CHARS.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: c.swatch }} />
              <span style={{ font: 'var(--type-username)', letterSpacing: '.04em', color: 'var(--text-primary)' }}>{t(nameKey[c.id])}</span>
            </div>
            <Select value={prefs[c.id] || 'male'} options={options} onChange={(v) => change(c.id, v)} width={140} />
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

// ============================================================================
// Manage panels - reads/writes the exact record dashboardView.jsx's DashboardView renders,
// via the same loadBoard()/saveBoard(). Hidden panels stay on the board (position/span kept)
// but are skipped by the real Dashboard's own visibleBoard filter.
// ============================================================================
function ManagePanelsSection({ t, lang, character }) {
  const [state, setState] = React.useState(() => loadBoard(character));
  const [dragId, setDragId] = React.useState(null);
  const CAT = React.useMemo(() => catalogForLang(lang), [lang]);
  React.useEffect(() => { saveBoard(character, state); }, [character, state]);

  function entryOf(id) { return CAT[id] || resolveCustomEntry(id, state.custom); }
  function setSpan(id, dir) {
    const cur = state.spans[id] || (entryOf(id) ? entryOf(id).span : 4);
    const i = SPANS.indexOf(cur);
    const next = SPANS[Math.min(SPANS.length - 1, Math.max(0, i + dir))];
    setState((s) => ({ ...s, spans: { ...s.spans, [id]: next } }));
  }
  function toggleHidden(id) { setState((s) => ({ ...s, hidden: { ...s.hidden, [id]: !s.hidden[id] } })); }
  function removePanel(id) { setState((s) => ({ ...s, board: s.board.filter((x) => x !== id) })); }
  function reorder(targetId) {
    if (!dragId || dragId === targetId) return;
    setState((s) => {
      const board = s.board.filter((x) => x !== dragId);
      board.splice(board.indexOf(targetId), 0, dragId);
      return { ...s, board };
    });
    setDragId(null);
  }

  const shown = state.board.filter((id) => !state.hidden[id]).length;
  return (
    <SectionShell icon="dashboard" title={t('managePanelsTitle')} right={<span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('shownOfTotal', { shown: digits(lang, shown), total: digits(lang, state.board.length) })}</span>}>
      {!state.board.length ? (
        <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{t('noPanelsYet')}</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.board.map((id) => {
            const entry = entryOf(id);
            if (!entry) return null;
            const on = !state.hidden[id];
            const span = state.spans[id] || entry.span;
            return (
              <div
                key={id} draggable onDragStart={() => setDragId(id)} onDragOver={(e) => e.preventDefault()} onDrop={() => reorder(id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 8, border: '1px solid ' + (on ? 'var(--border-hairline)' : 'var(--divider-gold)'), background: 'rgba(3,8,7,.45)' }}
              >
                <span style={{ display: 'flex', color: 'var(--text-muted)', cursor: 'grab' }} title={t('dragToReorder')}><Icon name="grip-vertical" size={16} /></span>
                <span style={{ display: 'flex', color: 'var(--char-accent)' }}><Icon name={entry.icon} size={17} /></span>
                <span dir="auto" style={{ font: 'var(--type-username)', letterSpacing: '.04em', color: on ? 'var(--text-primary)' : 'var(--text-disabled)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.title}</span>
                <button type="button" onClick={() => setSpan(id, -1)} aria-label={t('narrowPanel')} disabled={span <= SPANS[0]} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.6)', color: 'var(--text-muted)', opacity: span <= SPANS[0] ? .4 : 1 }}><Icon name="minus" size={14} /></button>
                <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', minWidth: 36, textAlign: 'center' }}>{span + '/12'}</span>
                <button type="button" onClick={() => setSpan(id, 1)} aria-label={t('widenPanel')} disabled={span >= 12} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.6)', color: 'var(--text-muted)', opacity: span >= 12 ? .4 : 1 }}><Icon name="plus" size={14} /></button>
                <Toggle checked={on} onChange={() => toggleHidden(id)} aria-label={t('toggleShowHide')} />
                <button type="button" onClick={() => removePanel(id)} aria-label={t('removePanel')} title={t('removePanel')} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.6)', color: 'var(--text-muted)' }}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </SectionShell>
  );
}

// ============================================================================
// Region & language - Language calls store.js's real setLanguage(); every other field is
// app-settings-store.js's own real, persisted record.
// ============================================================================
function RegionLanguageSection({ t, lang, store }) {
  const appSettings = window.TradeJournalAppSettingsStore;
  const [prefs, setPrefs] = React.useState(() => (appSettings ? appSettings.settings() : { region: {} }));
  function patch(region) { if (appSettings) setPrefs(appSettings.saveSettings({ region })); }
  const languageOptions = [
    { value: 'fa', label: 'فارسی' }, { value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Español' }
  ];
  const rows = [
    { key: 'country', label: t('countryLabel'), hint: t('countryHint'), options: ['Iran', 'United Arab Emirates', 'Türkiye', 'Germany', 'United Kingdom', 'United States'] },
    { key: 'timezone', label: t('timezoneLabel'), hint: t('timezoneHint'), options: ['Asia/Tehran (UTC+3:30)', 'Asia/Dubai (UTC+4)', 'Europe/London (UTC+1)', 'America/New_York (UTC-4)'] },
    { key: 'currency', label: t('currencyLabel'), hint: t('currencyHint'), options: ['USD', 'EUR', 'AED', 'IRR', 'GBP'] },
    { key: 'weekStart', label: t('weekLabel'), hint: t('weekHint'), options: ['Saturday', 'Sunday', 'Monday'] }
  ];

  // AI process registry (A4) - mountedRef template. Every field here is a validated <Select>, so
  // applyValue only ever applies a suggested value when it's one of that field's own real
  // options - never lets AI-fill push region prefs into an invalid state.
  // Journey F, F35: 'language' extends the original region.* allowlist - the real interface
  // language select (store.setLanguage(), the app's one real language store) sat right next to
  // these fields but was never itself AI-fillable. Validated the same way, against the real
  // languageOptions list, never an invented locale.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('settings-region-language', {
      allowlist: ['language'].concat(rows.map((row) => 'region.' + row.key)),
      isOpen: () => mountedRef.current,
      applyValue: (path, value) => {
        if (path === 'language') { if (languageOptions.some((o) => o.value === value)) store.setLanguage(value); return; }
        const row = rows.find((r) => 'region.' + r.key === path);
        if (row && row.options.indexOf(value) > -1) { const p = {}; p[row.key] = value; patch(p); }
      }
    });
    return () => { mountedRef.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SectionShell icon="globe" title={t('regionTitle')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <span style={{ font: 'var(--type-username)', letterSpacing: '.04em', color: 'var(--text-primary)' }}>{t('languageLabel')}</span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('languageHint')}</span>
          </div>
          <Select value={lang} options={languageOptions} onChange={(v) => store.setLanguage(v)} width={220} />
        </div>
        {rows.map((row) => (
          <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ font: 'var(--type-username)', letterSpacing: '.04em', color: 'var(--text-primary)' }}>{row.label}</span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{row.hint}</span>
            </div>
            <Select value={prefs.region[row.key]} options={row.options} onChange={(v) => { const p = {}; p[row.key] = v; patch(p); }} width={220} />
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <span style={{ font: 'var(--type-username)', letterSpacing: '.04em', color: 'var(--text-primary)' }}>{t('clockLabel')}</span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('clockHint')}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.5)' }}>
            {[{ v: true, label: t('h24') }, { v: false, label: t('h12') }].map((m) => {
              const on = prefs.region.clock24 === m.v;
              return (
                <button key={String(m.v)} type="button" onClick={() => patch({ clock24: m.v })} style={{ height: 34, padding: '0 14px', borderRadius: 6, cursor: 'pointer', border: on ? '2px solid var(--char-accent)' : '1px solid var(--divider-gold)', background: on ? 'var(--char-active-surface)' : 'rgba(11,20,21,.55)', color: on ? 'var(--text-primary)' : 'var(--text-muted)', font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase' }}>{m.label}</button>
              );
            })}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

// ============================================================================
// Alerts & discipline - cool-down lock is MentalHealthStore's own real field; the rest are
// app-settings-store.js's real, persisted preferences.
// ============================================================================
function AlertsSection({ t }) {
  const appSettings = window.TradeJournalAppSettingsStore;
  const mh = window.TradeJournalMentalHealthStore;
  const [prefs, setPrefs] = React.useState(() => (appSettings ? appSettings.settings() : { alerts: {} }));
  const [cooldownOn, setCooldownOn] = React.useState(() => (mh ? mh.load().activeInterventions.cooldownTimerEnabled : false));
  function patchAlert(key, value) { if (appSettings) setPrefs(appSettings.saveSettings({ alerts: { [key]: value } })); }
  function toggleCooldown() {
    if (!mh) return;
    const profile = mh.load();
    profile.activeInterventions.cooldownTimerEnabled = !profile.activeInterventions.cooldownTimerEnabled;
    mh.save(profile);
    setCooldownOn(profile.activeInterventions.cooldownTimerEnabled);
  }
  const rows = [
    { key: 'sessionOpen', label: t('sessionOpenLabel'), hint: t('sessionOpenHint'), on: prefs.alerts.sessionOpen, onToggle: (v) => patchAlert('sessionOpen', v) },
    { key: 'position', label: t('positionLabel'), hint: t('positionHint'), on: prefs.alerts.position, onToggle: (v) => patchAlert('position', v) },
    { key: 'emotion', label: t('emotionLabel'), hint: t('emotionHint'), on: prefs.alerts.emotionCheckIns, onToggle: (v) => patchAlert('emotionCheckIns', v) },
    { key: 'cooldown', label: t('cooldownLabel'), hint: t('cooldownHint'), on: cooldownOn, onToggle: toggleCooldown },
    { key: 'community', label: t('communityLabel'), hint: t('communityHint'), on: prefs.alerts.communityReplies, onToggle: (v) => patchAlert('communityReplies', v) },
    { key: 'sound', label: t('soundLabel'), hint: t('soundHint'), on: prefs.alerts.sound, onToggle: (v) => patchAlert('sound', v) }
  ];
  return (
    <SectionShell icon="bell" title={t('alertsTitle')}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((row, i) => (
          <Toggle
            key={row.key} checked={!!row.on} onChange={row.key === 'cooldown' ? toggleCooldown : (v) => row.onToggle(v)}
            label={row.label} hint={row.hint}
            style={{ padding: '11px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--border-hairline)' : 'none' }}
          />
        ))}
      </div>
    </SectionShell>
  );
}

// ============================================================================
// Trading defaults - trade-store.js's own real settings()/saveSettings(), the same object the
// Calculator and Trade Log already read defaultRiskPercent from.
// ============================================================================
function TradingDefaultsSection({ t, lang }) {
  const tradeStore = window.TradeJournalTradeStore;
  const [settings, setSettings] = React.useState(() => (tradeStore ? tradeStore.settings() : { defaultRiskPercent: 1, leverageCap: 10, maxTradesPerSession: 5 }));
  function patch(field, value) { if (tradeStore) setSettings(tradeStore.saveSettings({ [field]: value })); }
  const rows = [
    { key: 'defaultRiskPercent', label: t('riskPerTradeLabel'), value: settings.defaultRiskPercent.toFixed(1) + '%', step: .5, min: .5, max: 5 },
    { key: 'leverageCap', label: t('leverageCapLabel'), value: settings.leverageCap + '×', step: 5, min: 1, max: 100 },
    { key: 'maxTradesPerSession', label: t('tradesPerSessionLabel'), value: String(settings.maxTradesPerSession), step: 1, min: 1, max: 20 }
  ];

  // AI process registry (A4) - mountedRef template. A suggested value is clamped into that row's
  // own real [min,max] before being applied, same discipline every +/- stepper button already has.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('settings-trading-defaults', {
      allowlist: rows.map((row) => row.key),
      isOpen: () => mountedRef.current,
      applyValue: (path, value) => {
        const row = rows.find((r) => r.key === path);
        const n = Number(value);
        if (row && Number.isFinite(n)) patch(row.key, Math.min(row.max, Math.max(row.min, n)));
      }
    });
    return () => { mountedRef.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SectionShell icon="execution" title={t('tradingDefaultsTitle')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
          {rows.map((row) => (
            <div key={row.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{row.label}</span>
              <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-metric-value)', color: 'var(--text-primary)' }}>{digits(lang, row.value)}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => patch(row.key, Math.max(row.min, Math.round((settings[row.key] - row.step) * 10) / 10))} aria-label={t('decrease')} style={{ flex: 1, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.6)', color: 'var(--text-muted)' }}><Icon name="minus" size={14} /></button>
                <button type="button" onClick={() => patch(row.key, Math.min(row.max, Math.round((settings[row.key] + row.step) * 10) / 10))} aria-label={t('increase')} style={{ flex: 1, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.6)', color: 'var(--text-muted)' }}><Icon name="plus" size={14} /></button>
              </div>
            </div>
          ))}
        </div>
        <Notice icon="honour">{t('defaultsNote')}</Notice>
      </div>
    </SectionShell>
  );
}

// ============================================================================
// Journey G (AI Companion & Journey Orchestration) - the one user-facing preference this gate
// adds: how proactive the Companion card in the ChatDock is (§54 of the brief - "not a nagging
// coach"). Reads/writes the real ai-companion-profile.js document; Low/Normal/High never bypasses
// the safety/cooldown gating in ai-companion-orchestrator.js, only how often a NEW nudge appears.
// ============================================================================
// Item 3 (Journey G follow-up): a real set/change/clear surface for the currentGoal
// ai-journey-engine.js already persists and prioritizes. Every option maps to a domain a real
// step in ai-journey-steps.js actually uses ('patterns'/'strategies'/'sessions'/'trades'/
// 'psychology') - never a capability that doesn't exist. Goes through
// TradeJournalAICompanionOrchestrator.setCurrentGoal() (not the profile store directly) so the
// same cooldown-reset + republish every other Companion interaction gets also applies here -
// the Companion card reflects a freshly-set goal immediately, not after a cooldown window.
function CompanionGoalSelect({ t }) {
  const profileStore = window.TradeJournalAICompanionProfile;
  const orchestrator = window.TradeJournalAICompanionOrchestrator;
  const [goal, setGoal] = React.useState(() => (profileStore ? profileStore.currentGoal() : null));
  const options = [
    { value: '', label: t('companionGoalNone') },
    { value: 'patterns', label: t('companionGoalPatterns') },
    { value: 'strategies', label: t('companionGoalStrategies') },
    { value: 'sessions', label: t('companionGoalSessions') },
    { value: 'trades', label: t('companionGoalTrades') },
    { value: 'psychology', label: t('companionGoalPsychology') }
  ];
  function change(value) {
    const domainOrNull = value || null;
    setGoal(domainOrNull);
    if (orchestrator) orchestrator.setCurrentGoal(domainOrNull);
    else if (profileStore) profileStore.setCurrentGoal(domainOrNull); // orchestrator not loaded yet (defensive fallback) - still persists/prioritizes correctly
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ font: 'var(--type-username)', letterSpacing: '.04em', color: 'var(--text-primary)' }}>{t('companionGoalLabel')}</span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('companionGoalHint')}</span>
      </div>
      <Select value={goal || ''} options={options} onChange={change} width={220} />
    </div>
  );
}

function CompanionSection({ t }) {
  const profileStore = window.TradeJournalAICompanionProfile;
  const [initiative, setInitiative] = React.useState(() => (profileStore ? profileStore.initiativePreference() : 'normal'));
  const options = [
    { value: 'low', label: t('companionInitiativeLow') },
    { value: 'normal', label: t('companionInitiativeNormal') },
    { value: 'high', label: t('companionInitiativeHigh') }
  ];
  function change(value) {
    setInitiative(value);
    if (profileStore) profileStore.setPreference('initiativePreference', value);
  }
  return (
    <SectionShell icon="assistant" title={t('companionTitle')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <span style={{ font: 'var(--type-username)', letterSpacing: '.04em', color: 'var(--text-primary)' }}>{t('companionInitiativeLabel')}</span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('companionInitiativeHint')}</span>
          </div>
          <Select value={initiative} options={options} onChange={change} width={160} />
        </div>
        <CompanionGoalSelect t={t} />
      </div>
    </SectionShell>
  );
}

export function SettingsView({ character, store }) {
  const lang = document.documentElement.lang || 'fa';
  const rtl = lang === 'fa' || lang === 'ar';
  const t = (key, vars) => tr(lang, key, vars);
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, font: 'var(--type-display-lg)', letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase', color: 'var(--parchment)' }}>{t('title')}</h1>
        <p style={{ margin: '6px 0 0', font: 'var(--type-body)', color: 'var(--text-muted)', maxWidth: 680 }}>{t('subtitle')}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <AiPanelBuilderSection t={t} lang={lang} character={character} />
          <ManagePanelsSection t={t} lang={lang} character={character} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <CharacterSection t={t} lang={lang} character={character} />
          <VoiceGenderSection t={t} />
          <RegionLanguageSection t={t} lang={lang} store={store} />
          <AlertsSection t={t} lang={lang} />
          <TradingDefaultsSection t={t} lang={lang} />
          <CompanionSection t={t} />
        </div>
      </div>
    </div>
  );
}

class SettingsBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <pre style={{ color: '#fbb', background: '#200', padding: 16, whiteSpace: 'pre-wrap' }}>{'[settings] ' + (this.state.error.stack || this.state.error.message)}</pre>;
    return this.props.children;
  }
}

export function renderSettings(character) {
  const container = document.createElement('div');
  container.className = 'panel-page';
  container.dataset.character = currentNavryaCharacter();
  const lang = document.documentElement.lang || 'fa';
  const rtl = lang === 'fa' || lang === 'ar';
  container.dir = rtl ? 'rtl' : 'ltr';
  container.style.direction = rtl ? 'rtl' : 'ltr';
  // A store instance purely for setLanguage() (Region & language's real language switch) - this
  // screen otherwise has no shared state with Sidebar/Header's own store.js instance, so a
  // throwaway one (matching store.js's own "one instance per mount" contract) is enough; it does
  // not call init()/subscribe, since nothing here reads sessions/profile from it.
  const store = createStore(character);
  // Stashed on the container so panel-system.js's own render(view) can call root.unmount()
  // before detaching this node on a later view switch - see that file's own comment on why
  // Element.remove() alone never runs a React 18 root's unmount lifecycle/cleanup effects (the
  // real, concrete impact found via testing: TradingDefaultsSection's own AI process registration
  // below never actually closed, permanently blocking chat-based action discovery app-wide after
  // the first Settings visit).
  const root = createRoot(container);
  container._reactRoot = root;
  root.render(<SettingsBoundary><SettingsView character={character} store={store} /></SettingsBoundary>);
  return container;
}
