// Google Identity Services Client ID - not a secret (Google's own docs document it as safe to
// embed publicly), but its value isn't known until it's created in Google Cloud Console. This
// file is plain static JS (public/pages/select/, not processed by Vite), so it can't read the
// server's GOOGLE_CLIENT_ID env var at runtime - the same literal value must be set both here
// and in that env var. Until replaced, the Google button shows a clear "not configured" error
// instead of silently failing.
const GOOGLE_CLIENT_ID = 'REPLACE_WITH_GOOGLE_CLIENT_ID';

const translations = {
  en: {
    brandTagline:'Track. Analyze. Master.', welcomeTitle:'Welcome Back', welcomeDesc:'Sign in to continue your trading journey', google:'Continue with Google', or:'or', email:'Continue with Email', noAccount:'Don’t have an account?', signup:'Sign up', pageTitle:'Choose Your Character', pageDesc:'Every great trader has a path. Choose the role that represents your trading philosophy and begin your journey to mastery.', noteTitle:'This choice defines your journey', noteCopy:'You can change your character later, but your progress and XP will remain.', select:'Select', selected:'{character} is now selected.', rankTitle:'All characters follow the same 7 mastery ranks', rankCopy:'Your actions, discipline, and consistency will help you rise through the ranks and become a legend.', rank1:'Novice', rank2:'Seeker', rank3:'Analyst', rank4:'Strategist', rank5:'Specialist', rank6:'Master', rank7:'Legend',
    hunterName:'The Hunter', hunterRole:'Hunter', hunterMotto:'I wait for the perfect moment to act.', hunterBullet1:'Patience and precision', hunterBullet2:'Low-risk quality trades', hunterBullet3:'Focus before every entry', hunterBullet4:'Wait for the best setup', engineerName:'The Engineer', engineerRole:'Market Engineer', engineerMotto:'Every market move has a system.', engineerBullet1:'Systematic analysis', engineerBullet2:'Love structure and detail', engineerBullet3:'Document everything', engineerBullet4:'Read market logic', commanderName:'The Commander', commanderRole:'Commander', commanderMotto:'Emotion is my enemy; discipline is my law.', commanderBullet1:'Risk and capital command', commanderBullet2:'Discipline under pressure', commanderBullet3:'Fast strategic decisions', commanderBullet4:'Lead your trades', sageName:'The Sage', sageRole:'Market Sage', sageMotto:'The goal is not profit; it is understanding.', sageBullet1:'Continuous deep learning', sageBullet2:'Build patterns and laws', sageBullet3:'Focus on the market’s essence', sageBullet4:'Search for market wisdom',
    nameStepPlaceholder:'Display name', emailPlaceholder:'Email', passwordPlaceholder:'Password',
    loginTitle:'Log in', loginHint:'Enter your email and password.', loginSubmit:'Log in',
    signupTitle:'Create your account', signupHint:'A real account - your trades and sessions are saved to it.', signupSubmit:'Sign up', backToLogin:'Already have an account? Log in',
    authErrorOffline:'Could not reach the server. Is the community backend running? (npm run dev:community-api)',
    authSuccess:'You’re in — pick your character.', googleNotConfigured:'Google sign-in is not configured yet.', googleError:'Google sign-in failed.',
    err_INVALID_EMAIL:'Enter a valid email address.', err_PASSWORD_TOO_SHORT:'Password must be at least 4 characters.', err_VALIDATION_FAILED:'Please fill in every field.',
    err_EMAIL_TAKEN:'An account with this email already exists — log in instead.', err_INVALID_CREDENTIALS:'Incorrect email or password.', err_ACCOUNT_SUSPENDED:'This account has been suspended.',
    err_EMAIL_ALREADY_REGISTERED:'This email already has a password account — log in with email/password instead.'
  },
  fa: {
    brandTagline:'ثبت کن. تحلیل کن. استاد شو.', welcomeTitle:'خوش آمدید', welcomeDesc:'برای ادامهٔ مسیر معاملاتی‌ات وارد شو', google:'ادامه با گوگل', or:'یا', email:'ادامه با ایمیل', noAccount:'حساب کاربری نداری؟', signup:'ثبت‌نام', pageTitle:'شخصیت خود را انتخاب کنید', pageDesc:'هر معامله‌گر بزرگ مسیر خود را دارد. نقشی را انتخاب کن که فلسفهٔ معاملاتی‌ات را بازتاب می‌دهد و سفر خود را به‌سوی استادی آغاز کن.', noteTitle:'این انتخاب مسیر تو را تعریف می‌کند', noteCopy:'بعداً می‌توانی شخصیتت را تغییر بدهی، اما پیشرفت و XP تو باقی می‌ماند.', select:'انتخاب', selected:'{character} انتخاب شد.', rankTitle:'همهٔ شخصیت‌ها از ۷ رتبهٔ استادی مشترک عبور می‌کنند', rankCopy:'عملکرد، انضباط و استمرار تو را در رتبه‌ها بالا می‌برد تا به یک افسانه تبدیل شوی.', rank1:'تازه‌کار', rank2:'جوینده', rank3:'تحلیلگر', rank4:'استراتژیست', rank5:'متخصص', rank6:'استاد', rank7:'افسانه',
    hunterName:'شکارچی', hunterRole:'شکارچی بازار', hunterMotto:'منتظر بهترین لحظه برای عمل می‌مانم.', hunterBullet1:'صبر و انتخاب دقیق', hunterBullet2:'معامله‌های کم‌ریسک و باکیفیت', hunterBullet3:'تمرکز پیش از هر ورود', hunterBullet4:'انتظار برای بهترین ستاپ', engineerName:'مهندس', engineerRole:'مهندس بازار', engineerMotto:'هر حرکت بازار یک سیستم دارد.', engineerBullet1:'تحلیل منظم و سیستماتیک', engineerBullet2:'عاشق ساختار و جزئیات', engineerBullet3:'ثبت همهٔ جزئیات', engineerBullet4:'درک منطق بازار', commanderName:'فرمانده', commanderRole:'فرمانده بازار', commanderMotto:'احساسات دشمن من است؛ انضباط قانون من.', commanderBullet1:'مدیریت ریسک و سرمایه', commanderBullet2:'انضباط در فشار', commanderBullet3:'تصمیم‌های سریع و راهبردی', commanderBullet4:'رهبری مسیر معاملات', sageName:'استاد', sageRole:'استاد بازار', sageMotto:'هدف سود نیست؛ هدف فهم بازار است.', sageBullet1:'یادگیری عمیق و مداوم', sageBullet2:'ساخت الگوها و قوانین', sageBullet3:'تمرکز بر جوهر بازار', sageBullet4:'جست‌وجوی خرد بازار',
    nameStepPlaceholder:'نام نمایشی', emailPlaceholder:'ایمیل', passwordPlaceholder:'رمز عبور',
    loginTitle:'ورود', loginHint:'ایمیل و رمز عبورت را وارد کن.', loginSubmit:'ورود',
    signupTitle:'ساخت حساب کاربری', signupHint:'یک حساب واقعی - معاملات و جلسات تو در آن ذخیره می‌شود.', signupSubmit:'ثبت‌نام', backToLogin:'حساب داری؟ وارد شو',
    authErrorOffline:'اتصال به سرور برقرار نشد. سرور بخش انجمن اجرا شده؟ (npm run dev:community-api)',
    authSuccess:'آماده‌ای — شخصیتت را انتخاب کن.', googleNotConfigured:'ورود با گوگل هنوز تنظیم نشده است.', googleError:'ورود با گوگل ناموفق بود.',
    err_INVALID_EMAIL:'یک ایمیل معتبر وارد کن.', err_PASSWORD_TOO_SHORT:'رمز عبور باید حداقل ۴ کاراکتر باشد.', err_VALIDATION_FAILED:'همهٔ فیلدها را پر کن.',
    err_EMAIL_TAKEN:'حسابی با این ایمیل قبلاً ساخته شده — به‌جای آن وارد شو.', err_INVALID_CREDENTIALS:'ایمیل یا رمز عبور اشتباه است.', err_ACCOUNT_SUSPENDED:'این حساب مسدود شده است.',
    err_EMAIL_ALREADY_REGISTERED:'این ایمیل قبلاً با رمز عبور ثبت شده — با ایمیل/رمز وارد شو.'
  },
  ar: {
    brandTagline:'سجّل. حلّل. أتقن.', welcomeTitle:'مرحباً بعودتك', welcomeDesc:'سجّل الدخول لمتابعة رحلتك في التداول', google:'المتابعة مع Google', or:'أو', email:'المتابعة بالبريد الإلكتروني', noAccount:'ليس لديك حساب؟', signup:'إنشاء حساب', pageTitle:'اختر شخصيتك', pageDesc:'لكل متداول عظيم طريقه. اختر الدور الذي يمثل فلسفتك في التداول وابدأ رحلتك نحو الإتقان.', noteTitle:'هذا الاختيار يرسم رحلتك', noteCopy:'يمكنك تغيير شخصيتك لاحقاً، لكن تقدمك ونقاط XP ستبقى.', select:'اختيار', selected:'تم اختيار {character}.', rankTitle:'كل الشخصيات تتبع مراتب الإتقان السبع نفسها', rankCopy:'أفعالك وانضباطك واستمرارك سترفعك عبر المراتب لتصبح أسطورة.', rank1:'مبتدئ', rank2:'باحث', rank3:'محلل', rank4:'استراتيجي', rank5:'متخصص', rank6:'أستاذ', rank7:'أسطورة',
    hunterName:'الصياد', hunterRole:'صياد السوق', hunterMotto:'أنتظر اللحظة المثالية للتصرف.', hunterBullet1:'صبر ودقة', hunterBullet2:'صفقات عالية الجودة قليلة المخاطر', hunterBullet3:'تركيز قبل كل دخول', hunterBullet4:'انتظار أفضل إعداد', engineerName:'المهندس', engineerRole:'مهندس السوق', engineerMotto:'لكل حركة في السوق نظام.', engineerBullet1:'تحليل منهجي', engineerBullet2:'حب البنية والتفاصيل', engineerBullet3:'توثيق كل شيء', engineerBullet4:'قراءة منطق السوق', commanderName:'القائد', commanderRole:'قائد السوق', commanderMotto:'العاطفة عدوي والانضباط قانوني.', commanderBullet1:'إدارة المخاطر ورأس المال', commanderBullet2:'انضباط تحت الضغط', commanderBullet3:'قرارات استراتيجية سريعة', commanderBullet4:'قيادة مسار صفقاتك', sageName:'الحكيم', sageRole:'حكيم السوق', sageMotto:'الهدف ليس الربح بل الفهم.', sageBullet1:'تعلم عميق مستمر', sageBullet2:'بناء الأنماط والقوانين', sageBullet3:'التركيز على جوهر السوق', sageBullet4:'البحث عن حكمة السوق',
    nameStepPlaceholder:'الاسم المعروض', emailPlaceholder:'البريد الإلكتروني', passwordPlaceholder:'كلمة المرور',
    loginTitle:'تسجيل الدخول', loginHint:'أدخل بريدك الإلكتروني وكلمة المرور.', loginSubmit:'تسجيل الدخول',
    signupTitle:'إنشاء حسابك', signupHint:'حساب حقيقي - تُحفظ فيه صفقاتك وجلساتك.', signupSubmit:'إنشاء حساب', backToLogin:'لديك حساب؟ تسجيل الدخول',
    authErrorOffline:'تعذر الوصول إلى الخادم. هل خادم المجتمع يعمل؟ (npm run dev:community-api)',
    authSuccess:'أنت جاهز — اختر شخصيتك.', googleNotConfigured:'تسجيل الدخول عبر Google غير مُهيأ بعد.', googleError:'فشل تسجيل الدخول عبر Google.',
    err_INVALID_EMAIL:'أدخل بريدًا إلكترونيًا صالحًا.', err_PASSWORD_TOO_SHORT:'يجب أن تتكون كلمة المرور من 4 أحرف على الأقل.', err_VALIDATION_FAILED:'يرجى ملء كل الحقول.',
    err_EMAIL_TAKEN:'يوجد حساب بهذا البريد الإلكتروني بالفعل — سجّل الدخول بدلاً من ذلك.', err_INVALID_CREDENTIALS:'البريد الإلكتروني أو كلمة المرور غير صحيحة.', err_ACCOUNT_SUSPENDED:'هذا الحساب موقوف.',
    err_EMAIL_ALREADY_REGISTERED:'هذا البريد الإلكتروني مسجل بالفعل بكلمة مرور — سجّل الدخول بالبريد الإلكتروني وكلمة المرور بدلاً من ذلك.'
  },
  es: {
    brandTagline:'Registra. Analiza. Domina.', welcomeTitle:'Bienvenido de nuevo', welcomeDesc:'Inicia sesión para continuar tu viaje de trading', google:'Continuar con Google', or:'o', email:'Continuar con correo', noAccount:'¿No tienes una cuenta?', signup:'Regístrate', pageTitle:'Elige tu personaje', pageDesc:'Todo gran trader tiene un camino. Elige el rol que representa tu filosofía de trading y comienza tu viaje hacia la maestría.', noteTitle:'Esta elección define tu viaje', noteCopy:'Puedes cambiar tu personaje más adelante, pero tu progreso y XP se conservarán.', select:'Elegir', selected:'{character} ahora está seleccionado.', rankTitle:'Todos los personajes comparten las mismas 7 rangos de maestría', rankCopy:'Tus acciones, disciplina y constancia te elevarán hasta convertirte en una leyenda.', rank1:'Novato', rank2:'Buscador', rank3:'Analista', rank4:'Estratega', rank5:'Especialista', rank6:'Maestro', rank7:'Leyenda',
    hunterName:'El cazador', hunterRole:'Cazador', hunterMotto:'Espero el momento perfecto para actuar.', hunterBullet1:'Paciencia y precisión', hunterBullet2:'Operaciones de calidad y bajo riesgo', hunterBullet3:'Enfoque antes de cada entrada', hunterBullet4:'Espera la mejor configuración', engineerName:'El ingeniero', engineerRole:'Ingeniero de mercado', engineerMotto:'Cada movimiento del mercado tiene un sistema.', engineerBullet1:'Análisis sistemático', engineerBullet2:'Amor por la estructura y el detalle', engineerBullet3:'Documenta todo', engineerBullet4:'Lee la lógica del mercado', commanderName:'El comandante', commanderRole:'Comandante', commanderMotto:'La emoción es mi enemigo; la disciplina mi ley.', commanderBullet1:'Control de riesgo y capital', commanderBullet2:'Disciplina bajo presión', commanderBullet3:'Decisiones estratégicas rápidas', commanderBullet4:'Lidera tus operaciones', sageName:'El sabio', sageRole:'Sabio del mercado', sageMotto:'La meta no es el beneficio; es comprender.', sageBullet1:'Aprendizaje profundo continuo', sageBullet2:'Crea patrones y leyes', sageBullet3:'Enfoque en la esencia del mercado', sageBullet4:'Busca sabiduría de mercado',
    nameStepPlaceholder:'Nombre visible', emailPlaceholder:'Correo electrónico', passwordPlaceholder:'Contraseña',
    loginTitle:'Iniciar sesión', loginHint:'Introduce tu correo y contraseña.', loginSubmit:'Iniciar sesión',
    signupTitle:'Crea tu cuenta', signupHint:'Una cuenta real - tus operaciones y sesiones se guardan en ella.', signupSubmit:'Regístrate', backToLogin:'¿Ya tienes cuenta? Inicia sesión',
    authErrorOffline:'No se pudo conectar con el servidor. ¿Está corriendo el backend de comunidad? (npm run dev:community-api)',
    authSuccess:'Listo — elige tu personaje.', googleNotConfigured:'El inicio de sesión con Google aún no está configurado.', googleError:'Error al iniciar sesión con Google.',
    err_INVALID_EMAIL:'Introduce un correo electrónico válido.', err_PASSWORD_TOO_SHORT:'La contraseña debe tener al menos 4 caracteres.', err_VALIDATION_FAILED:'Completa todos los campos.',
    err_EMAIL_TAKEN:'Ya existe una cuenta con este correo — inicia sesión en su lugar.', err_INVALID_CREDENTIALS:'Correo o contraseña incorrectos.', err_ACCOUNT_SUSPENDED:'Esta cuenta ha sido suspendida.',
    err_EMAIL_ALREADY_REGISTERED:'Este correo ya tiene una cuenta con contraseña — inicia sesión con correo/contraseña en su lugar.'
  }
};

const languageNames = { en:'English', fa:'فارسی', ar:'العربية', es:'Español' };
let activeLanguage = localStorage.getItem('tradejournal-language') || 'en';
let toastTimer;

// Declared here (before applyLanguage's first call below) rather than down by the rest of the
// auth-modal logic, since applyLanguage() re-renders the open modal's copy on a language switch
// and therefore needs authOverlay to already be initialized the moment it first runs.
const authOverlay = document.querySelector('#authOverlay');
const authTitle = document.querySelector('#authTitle');
const authHint = document.querySelector('#authHint');
const authNameInput = document.querySelector('#authNameInput');
const authEmailInput = document.querySelector('#authEmailInput');
const authPasswordInput = document.querySelector('#authPasswordInput');
const authSubmit = document.querySelector('#authSubmit');
const authError = document.querySelector('#authError');
const authClose = document.querySelector('#authClose');
const authToggleBtn = document.querySelector('#authToggleBtn');
let pendingCharacterCard = null;
let authMode = 'login'; // 'login' | 'signup'

function applyLanguage(language) {
  const copy = translations[language] || translations.en;
  activeLanguage = language;
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'fa' || language === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = copy[node.dataset.i18n] || ''; });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => { node.placeholder = copy[node.dataset.i18nPlaceholder] || ''; });
  document.querySelector('#currentLanguage').textContent = languageNames[language];
  document.querySelectorAll('[data-language]').forEach((button) => button.classList.toggle('active', button.dataset.language === language));
  localStorage.setItem('tradejournal-language', language);
  if (authOverlay && !authOverlay.hidden) renderAuthMode();
}
function showToast(message) { const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); }
const languageButton = document.querySelector('#languageButton'); const languageMenu = document.querySelector('#languageMenu');
applyLanguage(activeLanguage);
languageButton.addEventListener('click', () => { const open = languageMenu.hidden; languageMenu.hidden = !open; languageButton.setAttribute('aria-expanded', String(open)); });
document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => { applyLanguage(button.dataset.language); languageMenu.hidden = true; languageButton.setAttribute('aria-expanded','false'); }));
document.addEventListener('click', (event) => { if (!event.target.closest('.language-picker')) { languageMenu.hidden = true; languageButton.setAttribute('aria-expanded','false'); } });

// Real-login gate: a browser with no valid session must authenticate BEFORE a character
// selection is allowed to complete - clicking a character card opens the login step instead of
// proceeding immediately, and the pending selection only completes once dev-user-switcher.js's
// register()/login()/loginWithGoogle() actually returns a session. A returning browser whose
// stored token the server still accepts is unaffected - the card completes exactly as it always
// has. isLoggedIn() asks dev-user-switcher.js's isStoredUserValid(), which checks the token
// against the server (once per page load, not per click) rather than trusting local storage.
function isLoggedIn() {
  const switcher = window.TradeJournalDevUserSwitcher;
  return switcher ? switcher.isStoredUserValid() : Promise.resolve(false);
}

function completeCharacterSelection(card) {
  const character = card.dataset.character;
  document.querySelectorAll('.character-card').forEach((item) => item.classList.toggle('selected', item === card));
  const key = `${character}Name`;
  showToast((translations[activeLanguage].selected || '').replace('{character}', translations[activeLanguage][key]));
  window.setTimeout(() => window.parent.postMessage({ type: 'tradejournal:character-selected', character }, '*'), 220);
}

document.querySelectorAll('.select-character').forEach((button) => button.addEventListener('click', async () => {
  const card = button.closest('.character-card');
  if (await isLoggedIn()) { completeCharacterSelection(card); return; }
  pendingCharacterCard = card;
  openAuth('login');
}));

function renderAuthMode() {
  const copy = translations[activeLanguage];
  const signup = authMode === 'signup';
  authTitle.textContent = signup ? copy.signupTitle : copy.loginTitle;
  authHint.textContent = signup ? copy.signupHint : copy.loginHint;
  authSubmit.textContent = signup ? copy.signupSubmit : copy.loginSubmit;
  authToggleBtn.textContent = signup ? copy.backToLogin : copy.signup;
  authNameInput.hidden = !signup;
  authPasswordInput.autocomplete = signup ? 'new-password' : 'current-password';
}

function openAuth(mode) {
  authMode = mode;
  authError.textContent = '';
  authNameInput.value = '';
  authEmailInput.value = '';
  authPasswordInput.value = '';
  renderAuthMode();
  authOverlay.hidden = false;
  window.setTimeout(() => (authMode === 'signup' ? authNameInput : authEmailInput).focus(), 0);
}
function closeAuth() { authOverlay.hidden = true; pendingCharacterCard = null; }

authToggleBtn.addEventListener('click', () => openAuth(authMode === 'signup' ? 'login' : 'signup'));
authClose.addEventListener('click', closeAuth);
authOverlay.addEventListener('click', (event) => { if (event.target === authOverlay) closeAuth(); });

// Distinguishes "the request never reached a server" (fetch itself rejects with a TypeError -
// almost always because the Community backend process isn't running) from "a server responded
// but rejected the request" (register()/login()'s Error carries the real server-side code as
// .code, e.g. EMAIL_TAKEN) - translated per-code where we have a friendly message, falling back
// to the raw code otherwise.
function describeAuthError(error) {
  const copy = translations[activeLanguage];
  if (error instanceof TypeError) return copy.authErrorOffline;
  const key = 'err_' + (error && error.code);
  if (error && error.code && copy[key]) return copy[key];
  return (error && error.message) || 'AUTH_FAILED';
}

async function afterAuthSuccess() {
  const card = pendingCharacterCard;
  closeAuth();
  if (card) completeCharacterSelection(card);
  else showToast(translations[activeLanguage].authSuccess);
}

async function submitAuth() {
  const switcher = window.TradeJournalDevUserSwitcher;
  authSubmit.disabled = true;
  authError.textContent = '';
  try {
    if (authMode === 'signup') {
      await switcher.register({ displayName: authNameInput.value.trim(), email: authEmailInput.value.trim(), password: authPasswordInput.value });
    } else {
      await switcher.login({ email: authEmailInput.value.trim(), password: authPasswordInput.value });
    }
    await afterAuthSuccess();
  } catch (error) {
    authError.textContent = describeAuthError(error);
  } finally {
    authSubmit.disabled = false;
  }
}
authSubmit.addEventListener('click', submitAuth);
[authEmailInput, authPasswordInput, authNameInput].forEach((input) => input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); submitAuth(); } }));

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
    await afterAuthSuccess();
  } catch (error) {
    showToast(describeAuthError(error) || translations[activeLanguage].googleError);
  }
}
document.querySelectorAll('[data-action="google"]').forEach((button) => button.addEventListener('click', () => {
  initGoogle();
  if (GOOGLE_CLIENT_ID === 'REPLACE_WITH_GOOGLE_CLIENT_ID' || !window.google || !window.google.accounts) {
    showToast(translations[activeLanguage].googleNotConfigured);
    return;
  }
  window.google.accounts.id.prompt();
}));
document.querySelectorAll('[data-action="email"]').forEach((button) => button.addEventListener('click', () => openAuth('login')));
document.querySelectorAll('[data-action="signup"]').forEach((button) => button.addEventListener('click', () => openAuth('signup')));
window.setTimeout(initGoogle, 0);
