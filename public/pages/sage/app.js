const toast = document.querySelector('.toast');
let toastTimer;

const translations = {
  fa: {
    brandTitle: 'دفتر سناریوهای استاد بازار', brandSub: 'Market Sage Journal', hunterTitle: 'استاد بازار', hunterSub: 'The Market Sage', hunterMotto: 'هدف، سود نیست؛ فهم بازار است.', hunterLevel: 'سطح حکمت استاد', hunterQuote: 'هر معامله یک معلم است؛\nهر اشتباه یک درس،\nو هر جلسه یک قدم به سوی درک عمیق‌تر بازار.',
    huntMarks: 'نشان حکمت', scenarios: 'سناریوها', huntSetups: 'الگوهای ساخته‌شده', streakDays: 'روزهای توالی',
    sessions: 'سشن‌ها', dashboard: 'داشبورد', myScenarios: 'سناریوهای من', strategies: 'استراتژی‌ها', saved: 'ذخیره شده', reports: 'گزارش‌ها', timer: 'تایمر و تمرکز', notes: 'یادداشت‌ها',
    libraryTitle: 'کتابخانه سشن', libraryDesc: 'معاملاتت را ثبت کن، ریسک‌هایت را دنبال کن، و بهترین شکارهایت را پیدا کن.', newSession: 'سشن جدید', allSessions: 'همه سشن‌ها', search: 'جستجو در سشن‌ها...', newest: 'جدیدترین'
  },
  ar: {
    brandTitle: 'دفتر سيناريوهات حكيم السوق', brandSub: 'Market Sage Journal', hunterTitle: 'حكيم السوق', hunterSub: 'The Market Sage', hunterMotto: 'الهدف ليس الربح؛ بل فهم السوق.', hunterLevel: 'مستوى حكمة المعلّم', hunterQuote: 'كل صفقة معلّم؛\nوكل خطأ درس،\nوكل جلسة خطوة نحو فهم أعمق للسوق.',
    huntMarks: 'وسام الحكمة', scenarios: 'السيناريوهات', huntSetups: 'أنماط متقنة', streakDays: 'أيام الاستمرارية',
    sessions: 'الجلسات', dashboard: 'لوحة التحكم', myScenarios: 'سيناريوهاتي', strategies: 'الاستراتيجيات', saved: 'المحفوظات', reports: 'التقارير', timer: 'المؤقت والتركيز', notes: 'الملاحظات',
    libraryTitle: 'مكتبة الجلسات', libraryDesc: 'سجّل صفقاتك، وتتبّع مخاطرك، واعثر على أفضل فرصك.', newSession: 'جلسة جديدة', allSessions: 'كل الجلسات', search: 'ابحث في الجلسات...', newest: 'الأحدث'
  },
  en: {
    brandTitle: 'Market Sage Journal', brandSub: 'Market Sage Journal', hunterTitle: 'Market Sage', hunterSub: 'The Market Sage', hunterMotto: 'The goal is not profit; it is understanding the market.', hunterLevel: 'Master Wisdom Level', hunterQuote: 'Every trade is a teacher;\nevery mistake, a lesson;\nevery session, deeper market understanding.',
    huntMarks: 'Wisdom marks', scenarios: 'Scenarios', huntSetups: 'Mastered patterns', streakDays: 'Streak days',
    sessions: 'Sessions', dashboard: 'Dashboard', myScenarios: 'My scenarios', strategies: 'Strategies', saved: 'Saved', reports: 'Reports', timer: 'Timer & focus', notes: 'Notes',
    libraryTitle: 'Session Library', libraryDesc: 'Log your trades, follow your risk, and find your best hunts.', newSession: 'New session', allSessions: 'All sessions', search: 'Search sessions...', newest: 'Newest'
  },
  es: {
    brandTitle: 'Diario del sabio del mercado', brandSub: 'Market Sage Journal', hunterTitle: 'Sabio del mercado', hunterSub: 'The Market Sage', hunterMotto: 'La meta no es el beneficio; es comprender el mercado.', hunterLevel: 'Nivel de sabiduría maestra', hunterQuote: 'Cada operación es un maestro;\ncada error, una lección;\ncada sesión, más comprensión del mercado.',
    huntMarks: 'Marcas de sabiduría', scenarios: 'Escenarios', huntSetups: 'Patrones dominados', streakDays: 'Días de racha',
    sessions: 'Sesiones', dashboard: 'Panel', myScenarios: 'Mis escenarios', strategies: 'Estrategias', saved: 'Guardados', reports: 'Informes', timer: 'Temporizador y enfoque', notes: 'Notas',
    libraryTitle: 'Biblioteca de sesiones', libraryDesc: 'Registra tus operaciones, sigue tu riesgo y encuentra tus mejores oportunidades.', newSession: 'Nueva sesión', allSessions: 'Todas las sesiones', search: 'Buscar sesiones...', newest: 'Más recientes'
  }
};

const cardTranslations = {
  fa: {
    mainTitle: 'لندن — 2026-07-27', london: 'لندن', mainDate: '۵ تیر ۱۴۰۵ · دوشنبه', mainTime: '09:00 – 17:00 (UTC)', mainScenarios: '۴ سناریو', mainEntries: '۲ ورود', mainResult: 'نتیجه: ۴/۰',
    newYorkTitle: 'نیویورک — 2026-07-26', newYork: 'نیویورک', smallDate: '۴ تیر ۱۴۰۵ · یکشنبه', newYorkTime: '17:00 – 01:00 (UTC)', newYorkScenarios: '۲۸ سناریو', newYorkEntries: '۷ ورود', newYorkResult: 'نتیجه: ۷/۳۸',
    londonTitle: 'لندن — 2026-07-26', londonTime: '09:00 – 17:00 (UTC)', londonScenarios: '۴۳ سناریو', londonEntries: '۱۰ ورود', londonResult: 'نتیجه: ۱۰/۴۳',
    sydneyTitle: 'سیدنی — 2026-07-26', sydney: 'سیدنی', sydneyTime: '22:00 – 06:00 (UTC)', sydneyScenarios: '۳۹ سناریو', sydneyEntries: '۶ ورود', sydneyResult: 'نتیجه: ۸/۹'
  },
  ar: {
    mainTitle: 'لندن — 2026-07-27', london: 'لندن', mainDate: 'الإثنين · 27 يوليو 2026', mainTime: '09:00 – 17:00 (UTC)', mainScenarios: '4 سيناريوهات', mainEntries: '2 دخول', mainResult: 'النتيجة: 4/0',
    newYorkTitle: 'نيويورك — 2026-07-26', newYork: 'نيويورك', smallDate: 'الأحد · 26 يوليو 2026', newYorkTime: '17:00 – 01:00 (UTC)', newYorkScenarios: '28 سيناريو', newYorkEntries: '7 دخول', newYorkResult: 'النتيجة: 7/38',
    londonTitle: 'لندن — 2026-07-26', londonTime: '09:00 – 17:00 (UTC)', londonScenarios: '43 سيناريو', londonEntries: '10 دخول', londonResult: 'النتيجة: 10/43',
    sydneyTitle: 'سيدني — 2026-07-26', sydney: 'سيدني', sydneyTime: '22:00 – 06:00 (UTC)', sydneyScenarios: '39 سيناريو', sydneyEntries: '6 دخول', sydneyResult: 'النتيجة: 8/9'
  },
  en: {
    mainTitle: 'London — 2026-07-27', london: 'London', mainDate: 'Mon · Jul 27, 2026', mainTime: '09:00 – 17:00 (UTC)', mainScenarios: '4 scenarios', mainEntries: '2 entries', mainResult: 'Result: 4/0',
    newYorkTitle: 'New York — 2026-07-26', newYork: 'New York', smallDate: 'Sun · Jul 26, 2026', newYorkTime: '17:00 – 01:00 (UTC)', newYorkScenarios: '28 scenarios', newYorkEntries: '7 entries', newYorkResult: 'Result: 7/38',
    londonTitle: 'London — 2026-07-26', londonTime: '09:00 – 17:00 (UTC)', londonScenarios: '43 scenarios', londonEntries: '10 entries', londonResult: 'Result: 10/43',
    sydneyTitle: 'Sydney — 2026-07-26', sydney: 'Sydney', sydneyTime: '22:00 – 06:00 (UTC)', sydneyScenarios: '39 scenarios', sydneyEntries: '6 entries', sydneyResult: 'Result: 8/9'
  },
  es: {
    mainTitle: 'Londres — 2026-07-27', london: 'Londres', mainDate: 'lun · 27 jul 2026', mainTime: '09:00 – 17:00 (UTC)', mainScenarios: '4 escenarios', mainEntries: '2 entradas', mainResult: 'Resultado: 4/0',
    newYorkTitle: 'Nueva York — 2026-07-26', newYork: 'Nueva York', smallDate: 'dom · 26 jul 2026', newYorkTime: '17:00 – 01:00 (UTC)', newYorkScenarios: '28 escenarios', newYorkEntries: '7 entradas', newYorkResult: 'Resultado: 7/38',
    londonTitle: 'Londres — 2026-07-26', londonTime: '09:00 – 17:00 (UTC)', londonScenarios: '43 escenarios', londonEntries: '10 entradas', londonResult: 'Resultado: 10/43',
    sydneyTitle: 'Sídney — 2026-07-26', sydney: 'Sídney', sydneyTime: '22:00 – 06:00 (UTC)', sydneyScenarios: '39 escenarios', sydneyEntries: '6 entradas', sydneyResult: 'Resultado: 8/9'
  }
};

const interfaceTranslations = {
  fa: { psychology: 'روانشناسی', subscription: 'اشتراک', ai: 'هوش مصنوعی', forum: 'تالار گفتگو', chatWithAI: 'گفتگو با هوش مصنوعی', aiAssistant: 'دستیار خرد بازار', frontendOnly: 'نسخهٔ نمایشی · بدون اتصال زنده', chatWelcome: 'درود استاد؛ برای مرور عمیق‌تر سشن بعدی آماده‌ام.', chatPlaceholder: 'پیامت را بنویس...' },
  ar: { psychology: 'علم النفس', subscription: 'الاشتراك', ai: 'الذكاء الاصطناعي', forum: 'منتدى النقاش', chatWithAI: 'تحدث مع الذكاء الاصطناعي', aiAssistant: 'مساعد حكمة السوق', frontendOnly: 'واجهة تجريبية · دون اتصال مباشر', chatWelcome: 'مرحباً أيها الحكيم؛ أنا جاهز لمراجعة الجلسة التالية بعمق.', chatPlaceholder: 'اكتب رسالتك...' },
  en: { psychology: 'Psychology', subscription: 'Subscription', ai: 'AI Assistant', forum: 'Community', chatWithAI: 'Chat with AI', aiAssistant: 'Market Wisdom Guide', frontendOnly: 'Demo interface · no live connection', chatWelcome: 'Greetings, Sage — I am ready to reflect on your next session.', chatPlaceholder: 'Write a message...' },
  es: { psychology: 'Psicología', subscription: 'Suscripción', ai: 'Asistente IA', forum: 'Comunidad', chatWithAI: 'Hablar con IA', aiAssistant: 'Guía de sabiduría de mercado', frontendOnly: 'Interfaz de demostración · sin conexión en vivo', chatWelcome: 'Saludos, sabio. Estoy listo para revisar tu próxima sesión.', chatPlaceholder: 'Escribe un mensaje...' }
};

const languageNames = { fa: 'فارسی', ar: 'العربية', en: 'English', es: 'Español' };
const marketCityNames = {
  fa: { newYork: 'نیویورک', london: 'لندن', tokyo: 'توکیو', sydney: 'سیدنی' },
  ar: { newYork: 'نيويورك', london: 'لندن', tokyo: 'طوكيو', sydney: 'سيدني' },
  en: { newYork: 'New York', london: 'London', tokyo: 'Tokyo', sydney: 'Sydney' },
  es: { newYork: 'Nueva York', london: 'Londres', tokyo: 'Tokio', sydney: 'Sídney' }
};
const numeralLocales = { fa: 'fa-IR', ar: 'ar-EG', en: 'en-US', es: 'es-ES' };
const quoteVariants = {
  fa: ['هر معامله یک معلم است؛\nهر اشتباه یک درس،\nو هر جلسه یک قدم به سوی درک عمیق‌تر بازار.', 'استاد بازار به جای\nپیش‌بینی، مشاهده می‌کند؛\nبه جای عجله، می‌آموزد.', 'حکمت در پیدا کردن\nفرصت نیست؛ در شناختن\nبهترین لحظهٔ عمل است.'],
  ar: ['كل صفقة معلّم؛\nوكل خطأ درس،\nوكل جلسة خطوة نحو فهم أعمق للسوق.', 'حكيم السوق يراقب\nبدلاً من التنبؤ،\nويتعلم بدلاً من التسرع.', 'الحكمة ليست في إيجاد\nالفرصة؛ بل في معرفة\nأفضل وقت للعمل.'],
  en: ['Every trade is a teacher;\nevery mistake, a lesson;\nevery session, deeper market understanding.', 'A market sage observes\ninstead of predicting,\nand learns instead of rushing.', 'Wisdom is not finding\nan opportunity; it is knowing\nwhen to act.'],
  es: ['Cada operación es un maestro;\ncada error, una lección;\ncada sesión, más comprensión del mercado.', 'El sabio observa\nen vez de predecir\ny aprende antes de actuar.', 'La sabiduría no es hallar\nuna oportunidad; es saber\ncuándo actuar.']
};
let activeLanguage = 'fa';
let quoteIndex = 0;

function localizeMarketClocks(language) {
  const cityCopy = marketCityNames[language] || marketCityNames.fa;
  const formatter = new Intl.NumberFormat(numeralLocales[language] || numeralLocales.fa, { useGrouping: false });
  document.querySelectorAll('[data-market-city]').forEach((element) => {
    element.textContent = cityCopy[element.dataset.marketCity];
  });
  document.querySelectorAll('[data-market-time]').forEach((element) => {
    element.textContent = element.dataset.marketTime.replace(/\d+/g, (value) => formatter.format(Number(value)));
  });
}

function updateQuote(animate = false) {
  const quote = document.querySelector('[data-i18n="hunterQuote"]');
  const variants = quoteVariants[activeLanguage] || quoteVariants.fa;
  if (animate) quote.classList.add('is-updating');
  window.setTimeout(() => {
    quote.textContent = variants[quoteIndex % variants.length];
    quote.classList.remove('is-updating');
  }, animate ? 150 : 0);
}

function applyLanguage(language) {
  const copy = { ...(translations[language] || translations.fa), ...(cardTranslations[language] || cardTranslations.fa), ...(interfaceTranslations[language] || interfaceTranslations.fa) };
  activeLanguage = language;
  quoteIndex = 0;
  const root = document.documentElement;
  root.lang = language;
  root.dir = language === 'fa' || language === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = copy[element.dataset.i18n];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = copy[element.dataset.i18nPlaceholder];
  });
  document.querySelector('.settings').setAttribute('aria-label', language === 'en' ? 'Settings' : language === 'es' ? 'Ajustes' : language === 'ar' ? 'الإعدادات' : 'تنظیمات');
  document.querySelector('#currentLanguage').textContent = languageNames[language];
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.classList.toggle('active', button.dataset.language === language);
  });
  localizeMarketClocks(language);
  updateQuote();
  localStorage.setItem('sage-language', language);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

document.querySelector('#newSession').addEventListener('click', () => {
  showToast('سشن جدید آمادهٔ ثبت است.');
});

const languageButton = document.querySelector('#languageButton');
const languageMenu = document.querySelector('#languageMenu');
const savedLanguage = localStorage.getItem('sage-language') || 'fa';
applyLanguage(savedLanguage);
languageButton.addEventListener('click', () => {
  const willOpen = languageMenu.hidden;
  languageMenu.hidden = !willOpen;
  languageButton.setAttribute('aria-expanded', String(willOpen));
});
document.querySelectorAll('[data-language]').forEach((button) => {
  button.addEventListener('click', () => {
    applyLanguage(button.dataset.language);
    languageMenu.hidden = true;
    languageButton.setAttribute('aria-expanded', 'false');
  });
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.language-picker')) {
    languageMenu.hidden = true;
    languageButton.setAttribute('aria-expanded', 'false');
  }
});

const chatPanel = document.querySelector('#chatPanel');
const openChat = document.querySelector('#openChat');
const closeChat = document.querySelector('#closeChat');
const assistantNav = document.querySelector('#assistantNav');
const chatForm = document.querySelector('#chatForm');
const chatInput = document.querySelector('#chatInput');
const chatMessages = document.querySelector('#chatMessages');

function setChatOpen(isOpen) {
  chatPanel.hidden = !isOpen;
  if (isOpen) chatInput.focus();
}

openChat.addEventListener('click', () => setChatOpen(true));
closeChat.addEventListener('click', () => setChatOpen(false));
assistantNav.addEventListener('click', (event) => {
  event.preventDefault();
  setChatOpen(true);
});
chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.textContent = message;
  chatMessages.append(userBubble);
  chatInput.value = '';
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

window.setInterval(() => {
  quoteIndex += 1;
  updateQuote(true);
}, 7000);

document.querySelectorAll('.star').forEach((button) => {
  button.addEventListener('click', () => {
    button.classList.toggle('is-starred');
    showToast(button.classList.contains('is-starred') ? 'به علاقه‌مندی‌ها اضافه شد.' : 'از علاقه‌مندی‌ها حذف شد.');
  });
});

document.querySelectorAll('.view-toggle button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelector('.view-toggle .selected').classList.remove('selected');
    button.classList.add('selected');
    showToast(button.getAttribute('aria-label'));
  });
});

document.querySelector('.search-box input').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll('.small-card').forEach((card) => {
    card.hidden = query && !card.textContent.toLowerCase().includes(query);
  });
});

window.TradeJournalPanelCharacter = 'sage';
