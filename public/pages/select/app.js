// Google Identity Services Client ID - not a secret (Google's own docs document it as safe to
// embed publicly), but its value isn't known until it's created in Google Cloud Console. This
// file is plain static JS (public/pages/select/, not processed by Vite), so it can't read the
// server's GOOGLE_CLIENT_ID env var at runtime - the same literal value must be set both here
// and in that env var. Until replaced, the Google button shows a clear "not configured" error
// instead of silently failing.
const GOOGLE_CLIENT_ID = 'REPLACE_WITH_GOOGLE_CLIENT_ID';

// The design system's fourth character accent is keyed "master" (see characters.css), but this
// app's routing/postMessage contract (src/release.js, App.jsx) has always called that character
// "sage" - CHAR_META below is the one place that maps between the two: id is the app-wide key,
// portrait/crest paths point at the design system's "master"-named assets.
const CHAR_META = [
  { id: 'hunter', nameKey: 'hunterName', roleKey: 'hunterRole', rankKey: 'hunterRank', mottoKey: 'hunterMotto', bulletKeys: ['hunterBullet1', 'hunterBullet2', 'hunterBullet3', 'hunterBullet4'], hero: 'assets/characters/hunter.jpg', portrait: '../shared/navrya/assets/portraits/portrait-hunter.webp', crest: '../shared/navrya/assets/crests/crest-hunter.webp' },
  { id: 'engineer', nameKey: 'engineerName', roleKey: 'engineerRole', rankKey: 'engineerRank', mottoKey: 'engineerMotto', bulletKeys: ['engineerBullet1', 'engineerBullet2', 'engineerBullet3', 'engineerBullet4'], hero: 'assets/characters/engineer.jpg', portrait: '../shared/navrya/assets/portraits/portrait-engineer.webp', crest: '../shared/navrya/assets/crests/crest-engineer.webp' },
  { id: 'commander', nameKey: 'commanderName', roleKey: 'commanderRole', rankKey: 'commanderRank', mottoKey: 'commanderMotto', bulletKeys: ['commanderBullet1', 'commanderBullet2', 'commanderBullet3', 'commanderBullet4'], hero: 'assets/characters/commander.jpg', portrait: '../shared/navrya/assets/portraits/portrait-commander.webp', crest: '../shared/navrya/assets/crests/crest-commander.webp' },
  { id: 'sage', nameKey: 'sageName', roleKey: 'sageRole', rankKey: 'sageRank', mottoKey: 'sageMotto', bulletKeys: ['sageBullet1', 'sageBullet2', 'sageBullet3', 'sageBullet4'], hero: 'assets/characters/sage.jpg', portrait: '../shared/navrya/assets/portraits/portrait-master.webp', crest: '../shared/navrya/assets/crests/crest-master.webp' }
];

const translations = {
  en: {
    brandTagline: 'Track. Analyze. Master.',
    stepAccountLabel: 'Account', stepCharacterLabel: 'Character',
    showcaseEyebrow: 'Four paths · one discipline', howThisPathTrades: 'How this path trades',
    tabSignin: 'Sign in', tabSignup: 'Sign up',
    authTitleSignin: 'Welcome back', authTitleSignup: 'Create account',
    authSubSignin: 'Sign in to continue your trading journey.', authSubSignup: 'Open a ledger and begin the discipline.',
    googleSigninLabel: 'Continue with Google', googleSignupLabel: 'Sign up with Google', or: 'or',
    traderNameLabel: 'Trader name', traderNamePlaceholder: 'Rayan Land',
    emailLabel: 'Email', emailFieldPlaceholder: 'trader@navrya.app',
    passwordLabel: 'Password', forgotPassword: 'Forgot?',
    continueLabelSignin: 'Continue', continueLabelSignup: 'Create account',
    switchPromptSignin: 'No account yet?', switchPromptSignup: 'Already trading with NAVRYA?',
    switchActionSignin: 'Sign up', switchActionSignup: 'Sign in',
    secureEntryTag: 'NAVRYA v1.0 · Secure entry',
    step2Eyebrow: 'Step 02 · The path', pageTitle: 'Choose Your Character', pageDesc: 'Every great trader has a path. Choose the role that represents your trading philosophy and begin your journey to mastery.',
    noteTitle: 'This choice defines your journey', noteCopy: 'You can change your character later, but your progress and XP will remain.',
    select: 'Select', chosenBadge: 'Chosen',
    selectPathPlaceholder: 'Select a character to continue.', selectedPathLabel: 'Selected path',
    enterNavrya: 'Enter NAVRYA', backButton: 'Back',
    rankTitle: 'All characters follow the same 7 mastery ranks', rankCopy: 'Your actions, discipline, and consistency will help you rise through the ranks and become a legend.',
    rank1: 'Novice', rank2: 'Seeker', rank3: 'Analyst', rank4: 'Strategist', rank5: 'Specialist', rank6: 'Master', rank7: 'Legend',
    hunterShort: 'Hunter', engineerShort: 'Engineer', commanderShort: 'Commander', sageShort: 'Sage',
    hunterName: 'The Hunter', hunterRole: 'Hunter', hunterRank: 'Emerald Hunter · III', hunterMotto: 'I wait for the perfect moment to act.', hunterBullet1: 'Patience and precision', hunterBullet2: 'Low-risk quality trades', hunterBullet3: 'Focus before every entry', hunterBullet4: 'Wait for the best setup',
    engineerName: 'The Engineer', engineerRole: 'Market Engineer', engineerRank: 'Systems Engineer · II', engineerMotto: 'Every market move has a system.', engineerBullet1: 'Systematic analysis', engineerBullet2: 'Love structure and detail', engineerBullet3: 'Document everything', engineerBullet4: 'Read market logic',
    commanderName: 'The Commander', commanderRole: 'Commander', commanderRank: 'Field Commander · III', commanderMotto: 'Emotion is my enemy; discipline is my law.', commanderBullet1: 'Risk and capital command', commanderBullet2: 'Discipline under pressure', commanderBullet3: 'Fast strategic decisions', commanderBullet4: 'Lead your trades',
    sageName: 'The Sage', sageRole: 'Market Sage', sageRank: 'Grand Market Sage · IV', sageMotto: 'The goal is not profit; it is understanding.', sageBullet1: 'Continuous deep learning', sageBullet2: 'Build patterns and laws', sageBullet3: 'Focus on the market’s essence', sageBullet4: 'Search for market wisdom',
    authErrorOffline: 'Could not reach the server. Is the community backend running? (npm run dev:community-api)',
    authSuccess: 'You’re in — pick your character.', googleNotConfigured: 'Google sign-in is not configured yet.', googleError: 'Google sign-in failed.',
    err_INVALID_EMAIL: 'Enter a valid email address.', err_PASSWORD_TOO_SHORT: 'Password must be at least 4 characters.', err_VALIDATION_FAILED: 'Please fill in every field.',
    err_EMAIL_TAKEN: 'An account with this email already exists — log in instead.', err_INVALID_CREDENTIALS: 'Incorrect email or password.', err_ACCOUNT_SUSPENDED: 'This account has been suspended.',
    err_EMAIL_ALREADY_REGISTERED: 'This email already has a password account — log in with email/password instead.'
  },
  fa: {
    brandTagline: 'ثبت کن. تحلیل کن. استاد شو.',
    stepAccountLabel: 'حساب', stepCharacterLabel: 'شخصیت',
    showcaseEyebrow: 'چهار مسیر · یک انضباط', howThisPathTrades: 'این مسیر چطور معامله می‌کند',
    tabSignin: 'ورود', tabSignup: 'ثبت‌نام',
    authTitleSignin: 'خوش آمدید', authTitleSignup: 'ساخت حساب کاربری',
    authSubSignin: 'برای ادامهٔ مسیر معاملاتی‌ات وارد شو.', authSubSignup: 'یک دفتر باز کن و انضباط را آغاز کن.',
    googleSigninLabel: 'ادامه با گوگل', googleSignupLabel: 'ثبت‌نام با گوگل', or: 'یا',
    traderNameLabel: 'نام معامله‌گر', traderNamePlaceholder: 'رایان لند',
    emailLabel: 'ایمیل', emailFieldPlaceholder: 'trader@navrya.app',
    passwordLabel: 'رمز عبور', forgotPassword: 'فراموشی رمز؟',
    continueLabelSignin: 'ادامه', continueLabelSignup: 'ساخت حساب',
    switchPromptSignin: 'حساب کاربری نداری؟', switchPromptSignup: 'قبلاً با NAVRYA معامله می‌کنی؟',
    switchActionSignin: 'ثبت‌نام', switchActionSignup: 'ورود',
    secureEntryTag: 'NAVRYA نسخهٔ ۱.۰ · ورود امن',
    step2Eyebrow: 'گام ۰۲ · مسیر', pageTitle: 'شخصیت خود را انتخاب کنید', pageDesc: 'هر معامله‌گر بزرگ مسیر خود را دارد. نقشی را انتخاب کن که فلسفهٔ معاملاتی‌ات را بازتاب می‌دهد و سفر خود را به‌سوی استادی آغاز کن.',
    noteTitle: 'این انتخاب مسیر تو را تعریف می‌کند', noteCopy: 'بعداً می‌توانی شخصیتت را تغییر بدهی، اما پیشرفت و XP تو باقی می‌ماند.',
    select: 'انتخاب', chosenBadge: 'انتخاب‌شده',
    selectPathPlaceholder: 'برای ادامه یک شخصیت انتخاب کن.', selectedPathLabel: 'مسیر انتخاب‌شده',
    enterNavrya: 'ورود به NAVRYA', backButton: 'بازگشت',
    rankTitle: 'همهٔ شخصیت‌ها از ۷ رتبهٔ استادی مشترک عبور می‌کنند', rankCopy: 'عملکرد، انضباط و استمرار تو را در رتبه‌ها بالا می‌برد تا به یک افسانه تبدیل شوی.',
    rank1: 'تازه‌کار', rank2: 'جوینده', rank3: 'تحلیلگر', rank4: 'استراتژیست', rank5: 'متخصص', rank6: 'استاد', rank7: 'افسانه',
    hunterShort: 'شکارچی', engineerShort: 'مهندس', commanderShort: 'فرمانده', sageShort: 'استاد',
    hunterName: 'شکارچی', hunterRole: 'شکارچی بازار', hunterRank: 'شکارچی زمردی · III', hunterMotto: 'منتظر بهترین لحظه برای عمل می‌مانم.', hunterBullet1: 'صبر و انتخاب دقیق', hunterBullet2: 'معامله‌های کم‌ریسک و باکیفیت', hunterBullet3: 'تمرکز پیش از هر ورود', hunterBullet4: 'انتظار برای بهترین ستاپ',
    engineerName: 'مهندس', engineerRole: 'مهندس بازار', engineerRank: 'مهندس سیستم‌ها · II', engineerMotto: 'هر حرکت بازار یک سیستم دارد.', engineerBullet1: 'تحلیل منظم و سیستماتیک', engineerBullet2: 'عاشق ساختار و جزئیات', engineerBullet3: 'ثبت همهٔ جزئیات', engineerBullet4: 'درک منطق بازار',
    commanderName: 'فرمانده', commanderRole: 'فرمانده بازار', commanderRank: 'فرماندهٔ میدان · III', commanderMotto: 'احساسات دشمن من است؛ انضباط قانون من.', commanderBullet1: 'مدیریت ریسک و سرمایه', commanderBullet2: 'انضباط در فشار', commanderBullet3: 'تصمیم‌های سریع و راهبردی', commanderBullet4: 'رهبری مسیر معاملات',
    sageName: 'استاد', sageRole: 'استاد بازار', sageRank: 'استاد بزرگ بازار · IV', sageMotto: 'هدف سود نیست؛ هدف فهم بازار است.', sageBullet1: 'یادگیری عمیق و مداوم', sageBullet2: 'ساخت الگوها و قوانین', sageBullet3: 'تمرکز بر جوهر بازار', sageBullet4: 'جست‌وجوی خرد بازار',
    authErrorOffline: 'اتصال به سرور برقرار نشد. سرور بخش انجمن اجرا شده؟ (npm run dev:community-api)',
    authSuccess: 'آماده‌ای — شخصیتت را انتخاب کن.', googleNotConfigured: 'ورود با گوگل هنوز تنظیم نشده است.', googleError: 'ورود با گوگل ناموفق بود.',
    err_INVALID_EMAIL: 'یک ایمیل معتبر وارد کن.', err_PASSWORD_TOO_SHORT: 'رمز عبور باید حداقل ۴ کاراکتر باشد.', err_VALIDATION_FAILED: 'همهٔ فیلدها را پر کن.',
    err_EMAIL_TAKEN: 'حسابی با این ایمیل قبلاً ساخته شده — به‌جای آن وارد شو.', err_INVALID_CREDENTIALS: 'ایمیل یا رمز عبور اشتباه است.', err_ACCOUNT_SUSPENDED: 'این حساب مسدود شده است.',
    err_EMAIL_ALREADY_REGISTERED: 'این ایمیل قبلاً با رمز عبور ثبت شده — با ایمیل/رمز وارد شو.'
  },
  ar: {
    brandTagline: 'سجّل. حلّل. أتقن.',
    stepAccountLabel: 'الحساب', stepCharacterLabel: 'الشخصية',
    showcaseEyebrow: 'أربعة مسارات · انضباط واحد', howThisPathTrades: 'كيف يتداول هذا المسار',
    tabSignin: 'تسجيل الدخول', tabSignup: 'إنشاء حساب',
    authTitleSignin: 'مرحباً بعودتك', authTitleSignup: 'إنشاء حسابك',
    authSubSignin: 'سجّل الدخول لمتابعة رحلتك في التداول.', authSubSignup: 'افتح دفترًا وابدأ الانضباط.',
    googleSigninLabel: 'المتابعة مع Google', googleSignupLabel: 'إنشاء حساب عبر Google', or: 'أو',
    traderNameLabel: 'اسم المتداول', traderNamePlaceholder: 'رايان لاند',
    emailLabel: 'البريد الإلكتروني', emailFieldPlaceholder: 'trader@navrya.app',
    passwordLabel: 'كلمة المرور', forgotPassword: 'نسيت كلمة المرور؟',
    continueLabelSignin: 'متابعة', continueLabelSignup: 'إنشاء الحساب',
    switchPromptSignin: 'ليس لديك حساب؟', switchPromptSignup: 'تتداول بالفعل مع NAVRYA؟',
    switchActionSignin: 'إنشاء حساب', switchActionSignup: 'تسجيل الدخول',
    secureEntryTag: 'NAVRYA الإصدار 1.0 · دخول آمن',
    step2Eyebrow: 'الخطوة 02 · المسار', pageTitle: 'اختر شخصيتك', pageDesc: 'لكل متداول عظيم طريقه. اختر الدور الذي يمثل فلسفتك في التداول وابدأ رحلتك نحو الإتقان.',
    noteTitle: 'هذا الاختيار يرسم رحلتك', noteCopy: 'يمكنك تغيير شخصيتك لاحقاً، لكن تقدمك ونقاط XP ستبقى.',
    select: 'اختيار', chosenBadge: 'مُختار',
    selectPathPlaceholder: 'اختر شخصية للمتابعة.', selectedPathLabel: 'المسار المختار',
    enterNavrya: 'الدخول إلى NAVRYA', backButton: 'رجوع',
    rankTitle: 'كل الشخصيات تتبع مراتب الإتقان السبع نفسها', rankCopy: 'أفعالك وانضباطك واستمرارك سترفعك عبر المراتب لتصبح أسطورة.',
    rank1: 'مبتدئ', rank2: 'باحث', rank3: 'محلل', rank4: 'استراتيجي', rank5: 'متخصص', rank6: 'أستاذ', rank7: 'أسطورة',
    hunterShort: 'الصياد', engineerShort: 'المهندس', commanderShort: 'القائد', sageShort: 'الحكيم',
    hunterName: 'الصياد', hunterRole: 'صياد السوق', hunterRank: 'الصياد الزمردي · III', hunterMotto: 'أنتظر اللحظة المثالية للتصرف.', hunterBullet1: 'صبر ودقة', hunterBullet2: 'صفقات عالية الجودة قليلة المخاطر', hunterBullet3: 'تركيز قبل كل دخول', hunterBullet4: 'انتظار أفضل إعداد',
    engineerName: 'المهندس', engineerRole: 'مهندس السوق', engineerRank: 'مهندس الأنظمة · II', engineerMotto: 'لكل حركة في السوق نظام.', engineerBullet1: 'تحليل منهجي', engineerBullet2: 'حب البنية والتفاصيل', engineerBullet3: 'توثيق كل شيء', engineerBullet4: 'قراءة منطق السوق',
    commanderName: 'القائد', commanderRole: 'قائد السوق', commanderRank: 'قائد الميدان · III', commanderMotto: 'العاطفة عدوي والانضباط قانوني.', commanderBullet1: 'إدارة المخاطر ورأس المال', commanderBullet2: 'انضباط تحت الضغط', commanderBullet3: 'قرارات استراتيجية سريعة', commanderBullet4: 'قيادة مسار صفقاتك',
    sageName: 'الحكيم', sageRole: 'حكيم السوق', sageRank: 'الحكيم الأعظم للسوق · IV', sageMotto: 'الهدف ليس الربح بل الفهم.', sageBullet1: 'تعلم عميق مستمر', sageBullet2: 'بناء الأنماط والقوانين', sageBullet3: 'التركيز على جوهر السوق', sageBullet4: 'البحث عن حكمة السوق',
    authErrorOffline: 'تعذر الوصول إلى الخادم. هل خادم المجتمع يعمل؟ (npm run dev:community-api)',
    authSuccess: 'أنت جاهز — اختر شخصيتك.', googleNotConfigured: 'تسجيل الدخول عبر Google غير مُهيأ بعد.', googleError: 'فشل تسجيل الدخول عبر Google.',
    err_INVALID_EMAIL: 'أدخل بريدًا إلكترونيًا صالحًا.', err_PASSWORD_TOO_SHORT: 'يجب أن تتكون كلمة المرور من 4 أحرف على الأقل.', err_VALIDATION_FAILED: 'يرجى ملء كل الحقول.',
    err_EMAIL_TAKEN: 'يوجد حساب بهذا البريد الإلكتروني بالفعل — سجّل الدخول بدلاً من ذلك.', err_INVALID_CREDENTIALS: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.', err_ACCOUNT_SUSPENDED: 'هذا الحساب موقوف.',
    err_EMAIL_ALREADY_REGISTERED: 'هذا البريد الإلكتروني مسجل بالفعل بكلمة مرور — سجّل الدخول بالبريد الإلكتروني وكلمة المرور بدلاً من ذلك.'
  },
  es: {
    brandTagline: 'Registra. Analiza. Domina.',
    stepAccountLabel: 'Cuenta', stepCharacterLabel: 'Personaje',
    showcaseEyebrow: 'Cuatro caminos · una disciplina', howThisPathTrades: 'Cómo opera este camino',
    tabSignin: 'Iniciar sesión', tabSignup: 'Regístrate',
    authTitleSignin: 'Bienvenido de nuevo', authTitleSignup: 'Crea tu cuenta',
    authSubSignin: 'Inicia sesión para continuar tu viaje de trading.', authSubSignup: 'Abre un libro y comienza la disciplina.',
    googleSigninLabel: 'Continuar con Google', googleSignupLabel: 'Regístrate con Google', or: 'o',
    traderNameLabel: 'Nombre de trader', traderNamePlaceholder: 'Rayan Land',
    emailLabel: 'Correo electrónico', emailFieldPlaceholder: 'trader@navrya.app',
    passwordLabel: 'Contraseña', forgotPassword: '¿Olvidaste?',
    continueLabelSignin: 'Continuar', continueLabelSignup: 'Crear cuenta',
    switchPromptSignin: '¿No tienes una cuenta?', switchPromptSignup: '¿Ya operas con NAVRYA?',
    switchActionSignin: 'Regístrate', switchActionSignup: 'Iniciar sesión',
    secureEntryTag: 'NAVRYA v1.0 · Acceso seguro',
    step2Eyebrow: 'Paso 02 · El camino', pageTitle: 'Elige tu personaje', pageDesc: 'Todo gran trader tiene un camino. Elige el rol que representa tu filosofía de trading y comienza tu viaje hacia la maestría.',
    noteTitle: 'Esta elección define tu viaje', noteCopy: 'Puedes cambiar tu personaje más adelante, pero tu progreso y XP se conservarán.',
    select: 'Elegir', chosenBadge: 'Elegido',
    selectPathPlaceholder: 'Elige un personaje para continuar.', selectedPathLabel: 'Camino elegido',
    enterNavrya: 'Entrar a NAVRYA', backButton: 'Atrás',
    rankTitle: 'Todos los personajes comparten los mismos 7 rangos de maestría', rankCopy: 'Tus acciones, disciplina y constancia te elevarán hasta convertirte en una leyenda.',
    rank1: 'Novato', rank2: 'Buscador', rank3: 'Analista', rank4: 'Estratega', rank5: 'Especialista', rank6: 'Maestro', rank7: 'Leyenda',
    hunterShort: 'Cazador', engineerShort: 'Ingeniero', commanderShort: 'Comandante', sageShort: 'Sabio',
    hunterName: 'El cazador', hunterRole: 'Cazador', hunterRank: 'Cazador Esmeralda · III', hunterMotto: 'Espero el momento perfecto para actuar.', hunterBullet1: 'Paciencia y precisión', hunterBullet2: 'Operaciones de calidad y bajo riesgo', hunterBullet3: 'Enfoque antes de cada entrada', hunterBullet4: 'Espera la mejor configuración',
    engineerName: 'El ingeniero', engineerRole: 'Ingeniero de mercado', engineerRank: 'Ingeniero de Sistemas · II', engineerMotto: 'Cada movimiento del mercado tiene un sistema.', engineerBullet1: 'Análisis sistemático', engineerBullet2: 'Amor por la estructura y el detalle', engineerBullet3: 'Documenta todo', engineerBullet4: 'Lee la lógica del mercado',
    commanderName: 'El comandante', commanderRole: 'Comandante', commanderRank: 'Comandante de Campo · III', commanderMotto: 'La emoción es mi enemigo; la disciplina mi ley.', commanderBullet1: 'Control de riesgo y capital', commanderBullet2: 'Disciplina bajo presión', commanderBullet3: 'Decisiones estratégicas rápidas', commanderBullet4: 'Lidera tus operaciones',
    sageName: 'El sabio', sageRole: 'Sabio del mercado', sageRank: 'Gran Sabio del Mercado · IV', sageMotto: 'La meta no es el beneficio; es comprender.', sageBullet1: 'Aprendizaje profundo continuo', sageBullet2: 'Crea patrones y leyes', sageBullet3: 'Enfoque en la esencia del mercado', sageBullet4: 'Busca sabiduría de mercado',
    authErrorOffline: 'No se pudo conectar con el servidor. ¿Está corriendo el backend de comunidad? (npm run dev:community-api)',
    authSuccess: 'Listo — elige tu personaje.', googleNotConfigured: 'El inicio de sesión con Google aún no está configurado.', googleError: 'Error al iniciar sesión con Google.',
    err_INVALID_EMAIL: 'Introduce un correo electrónico válido.', err_PASSWORD_TOO_SHORT: 'La contraseña debe tener al menos 4 caracteres.', err_VALIDATION_FAILED: 'Completa todos los campos.',
    err_EMAIL_TAKEN: 'Ya existe una cuenta con este correo — inicia sesión en su lugar.', err_INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.', err_ACCOUNT_SUSPENDED: 'Esta cuenta ha sido suspendida.',
    err_EMAIL_ALREADY_REGISTERED: 'Este correo ya tiene una cuenta con contraseña — inicia sesión con correo/contraseña en su lugar.'
  }
};

const languageNames = { en: 'English', fa: 'فارسی', ar: 'العربية', es: 'Español' };
const CHARACTER_STORAGE_KEY = 'tradejournal:character';
const SLIDE_INTERVAL_MS = 5000;

let activeLanguage = localStorage.getItem('tradejournal-language') || 'en';
let toastTimer;
let mode = 'signin'; // 'signin' | 'signup'
let slide = 0; // index into CHAR_META, drives the account-step showcase
let slideTimer = null;
let selectedCharacter = null; // character id chosen on step 2

const el = (id) => document.querySelector('#' + id);

const stepChipAccount = el('stepChipAccount');
const stepChipCharacter = el('stepChipCharacter');
const stepAccount = el('stepAccount');
const stepCharacter = el('stepCharacter');
const showcaseMedia = el('showcaseMedia');
const showcaseCount = el('showcaseCount');
const showcaseBody = el('showcaseBody');
const showcaseRole = el('showcaseRole');
const showcaseTitle = el('showcaseTitle');
const showcaseQuote = el('showcaseQuote');
const showcaseTraitEls = [el('showcaseTrait0'), el('showcaseTrait1'), el('showcaseTrait2'), el('showcaseTrait3')];
const authCardTitle = el('authCardTitle');
const authCardSub = el('authCardSub');
const tabSignin = el('tabSignin');
const tabSignup = el('tabSignup');
const googleBtn = el('googleBtn');
const googleLabel = el('googleLabel');
const nameField = el('nameField');
const nameInput = el('nameInput');
const emailInput = el('emailInput');
const passwordInput = el('passwordInput');
const authError = el('authError');
const continueBtn = el('continueBtn');
const continueLabel = el('continueLabel');
const switchPrompt = el('switchPrompt');
const switchAction = el('switchAction');
const pickedBar = el('pickedBar');
const pickedCrest = el('pickedCrest');
const pickedTitle = el('pickedTitle');
const pickedPlaceholder = el('pickedPlaceholder');
const backBtn = el('backBtn');
const enterBtn = el('enterBtn');

function copy() { return translations[activeLanguage] || translations.en; }

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

// ---------- i18n ----------
function applyLanguage(language) {
  const t = translations[language] || translations.en;
  activeLanguage = language;
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'fa' || language === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t[node.dataset.i18n] || ''; });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => { node.placeholder = t[node.dataset.i18nPlaceholder] || ''; });
  document.querySelector('#currentLanguage').textContent = languageNames[language];
  document.querySelectorAll('[data-language]').forEach((button) => button.classList.toggle('active', button.dataset.language === language));
  localStorage.setItem('tradejournal-language', language);
  renderMode();
  renderSlide();
}

// ---------- Language picker ----------
const languageButton = el('languageButton');
const languageMenu = el('languageMenu');
languageButton.addEventListener('click', () => {
  const open = languageMenu.hidden;
  languageMenu.hidden = !open;
  languageButton.setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => {
  applyLanguage(button.dataset.language);
  languageMenu.hidden = true;
  languageButton.setAttribute('aria-expanded', 'false');
}));
document.addEventListener('click', (event) => {
  if (!event.target.closest('.language-picker')) { languageMenu.hidden = true; languageButton.setAttribute('aria-expanded', 'false'); }
});

// ---------- Step routing ----------
function goToStep(step) {
  const onAccount = step === 'account';
  stepAccount.hidden = !onAccount;
  stepCharacter.hidden = onAccount;
  stepChipAccount.classList.toggle('is-on', onAccount);
  stepChipCharacter.classList.toggle('is-on', !onAccount);
  if (onAccount) { startSlideTimer(); } else { stopSlideTimer(); prefillPreviousCharacter(); }
}

// ---------- Account step: showcase carousel ----------
function renderSlide() {
  const meta = CHAR_META[slide];
  const t = copy();
  // Instant swap + fade-in (matches the mock's mount-triggered `navrya-slide-in` keyframe)
  // rather than a cross-fade: drop opacity with transitions off, swap the image, force a
  // reflow so the drop actually applies, then re-enable the transition and animate back up.
  showcaseMedia.style.transition = 'none';
  showcaseMedia.style.opacity = '0';
  showcaseMedia.style.backgroundImage = 'url(' + meta.hero + ')';
  void showcaseMedia.offsetWidth;
  showcaseMedia.style.transition = '';
  window.requestAnimationFrame(() => { showcaseMedia.style.opacity = '1'; });
  showcaseBody.dataset.character = meta.id;
  showcaseRole.textContent = t[meta.roleKey];
  showcaseTitle.textContent = t[meta.nameKey];
  showcaseQuote.textContent = '“' + t[meta.mottoKey] + '”';
  meta.bulletKeys.forEach((key, i) => { showcaseTraitEls[i].textContent = t[key]; });
  showcaseCount.textContent = '0' + (slide + 1) + ' / 0' + CHAR_META.length;
  document.querySelectorAll('.slide-btn').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.character === meta.id);
  });
}
document.querySelectorAll('.slide-btn').forEach((button) => button.addEventListener('click', () => {
  const index = CHAR_META.findIndex((c) => c.id === button.dataset.character);
  if (index === -1) return;
  slide = index;
  renderSlide();
  startSlideTimer();
}));
function startSlideTimer() {
  stopSlideTimer();
  slideTimer = window.setInterval(() => { slide = (slide + 1) % CHAR_META.length; renderSlide(); }, SLIDE_INTERVAL_MS);
}
function stopSlideTimer() { window.clearInterval(slideTimer); slideTimer = null; }

// ---------- Account step: sign in / sign up form ----------
function renderMode() {
  const t = copy();
  const signup = mode === 'signup';
  tabSignin.classList.toggle('is-active', !signup);
  tabSignup.classList.toggle('is-active', signup);
  authCardTitle.textContent = signup ? t.authTitleSignup : t.authTitleSignin;
  authCardSub.textContent = signup ? t.authSubSignup : t.authSubSignin;
  googleLabel.textContent = signup ? t.googleSignupLabel : t.googleSigninLabel;
  nameField.hidden = !signup;
  passwordInput.autocomplete = signup ? 'new-password' : 'current-password';
  continueLabel.textContent = signup ? t.continueLabelSignup : t.continueLabelSignin;
  switchPrompt.textContent = signup ? t.switchPromptSignup : t.switchPromptSignin;
  switchAction.textContent = signup ? t.switchActionSignup : t.switchActionSignin;
}
function setMode(next) {
  mode = next;
  authError.textContent = '';
  renderMode();
}
tabSignin.addEventListener('click', () => setMode('signin'));
tabSignup.addEventListener('click', () => setMode('signup'));
switchAction.addEventListener('click', () => setMode(mode === 'signup' ? 'signin' : 'signup'));

// Distinguishes "the request never reached a server" (fetch itself rejects with a TypeError -
// almost always because the Community backend process isn't running) from "a server responded
// but rejected the request" (register()/login()'s Error carries the real server-side code as
// .code, e.g. EMAIL_TAKEN) - translated per-code where we have a friendly message, falling back
// to the raw code otherwise.
function describeAuthError(error) {
  const t = copy();
  if (error instanceof TypeError) return t.authErrorOffline;
  const key = 'err_' + (error && error.code);
  if (error && error.code && t[key]) return t[key];
  return (error && error.message) || 'AUTH_FAILED';
}

async function submitAuth() {
  const switcher = window.TradeJournalDevUserSwitcher;
  continueBtn.disabled = true;
  authError.textContent = '';
  try {
    if (mode === 'signup') {
      await switcher.register({ displayName: nameInput.value.trim(), email: emailInput.value.trim(), password: passwordInput.value });
    } else {
      await switcher.login({ email: emailInput.value.trim(), password: passwordInput.value });
    }
    showToast(copy().authSuccess);
    goToStep('character');
  } catch (error) {
    authError.textContent = describeAuthError(error);
  } finally {
    continueBtn.disabled = false;
  }
}
continueBtn.addEventListener('click', submitAuth);
[emailInput, passwordInput, nameInput].forEach((input) => input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); submitAuth(); }
}));

// Google Identity Services - "Sign in with Google" ID-token flow (no redirect, no client
// secret). initialize() is safe to call even with a placeholder client_id; the failure only
// surfaces when the button is actually clicked and prompt()/the credential POST rejects.
let googleReady = false;
function initGoogle() {
  if (googleReady || !window.google || !window.google.accounts) return;
  window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
  googleReady = true;
}
async function handleGoogleCredential(response) {
  try {
    await window.TradeJournalDevUserSwitcher.loginWithGoogle(response.credential);
    showToast(copy().authSuccess);
    goToStep('character');
  } catch (error) {
    showToast(describeAuthError(error) || copy().googleError);
  }
}
googleBtn.addEventListener('click', () => {
  initGoogle();
  if (GOOGLE_CLIENT_ID === 'REPLACE_WITH_GOOGLE_CLIENT_ID' || !window.google || !window.google.accounts) {
    showToast(copy().googleNotConfigured);
    return;
  }
  window.google.accounts.id.prompt();
});
window.setTimeout(initGoogle, 0);

// ---------- Character step ----------
function selectCharacter(id) {
  const meta = CHAR_META.filter((c) => c.id === id)[0];
  if (!meta) return;
  selectedCharacter = id;
  const t = copy();
  document.querySelectorAll('.character-card').forEach((card) => card.classList.toggle('selected', card.dataset.character === id));
  pickedBar.dataset.character = id;
  pickedCrest.src = meta.crest;
  pickedCrest.hidden = false;
  pickedTitle.textContent = t[meta.nameKey] + ' · ' + t[meta.rankKey];
  pickedTitle.hidden = false;
  pickedPlaceholder.hidden = true;
  enterBtn.disabled = false;
}
document.querySelectorAll('.select-character').forEach((button) => button.addEventListener('click', () => {
  const card = button.closest('.character-card');
  if (card) selectCharacter(card.dataset.character);
}));

// A returning browser that skipped straight to the character step (see isLoggedIn() below)
// starts with its last pick already highlighted - a fresh browser, or one that just registered,
// starts with nothing selected and the Enter button disabled.
function prefillPreviousCharacter() {
  if (selectedCharacter) return;
  let stored = null;
  try { stored = localStorage.getItem(CHARACTER_STORAGE_KEY); } catch (_) { /* storage blocked */ }
  if (stored && CHAR_META.some((c) => c.id === stored)) selectCharacter(stored);
}

backBtn.addEventListener('click', () => goToStep('account'));
enterBtn.addEventListener('click', () => {
  if (!selectedCharacter) return;
  try { localStorage.setItem(CHARACTER_STORAGE_KEY, selectedCharacter); } catch (_) { /* storage blocked */ }
  window.parent.postMessage({ type: 'tradejournal:character-selected', character: selectedCharacter }, '*');
});

// ---------- Boot ----------
// Real-login gate: a browser with no valid session lands on the account step. A returning
// browser whose stored token the server still accepts skips straight to the character step -
// isLoggedIn() asks dev-user-switcher.js's isStoredUserValid(), which checks the token against
// the server (once per page load) rather than trusting local storage.
function isLoggedIn() {
  const switcher = window.TradeJournalDevUserSwitcher;
  return switcher ? switcher.isStoredUserValid() : Promise.resolve(false);
}

applyLanguage(activeLanguage);
goToStep('account');
isLoggedIn().then((valid) => { if (valid) goToStep('character'); });
