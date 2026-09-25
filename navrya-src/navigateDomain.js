// The one place navigate.to's `domainId` is resolved (character-app.jsx's navigate.to action uses it
// as its normalizeField). The ids are exactly the real ai-knowledge-registry.js domain ids that have
// ONE real, single navigable page (see character-app.jsx's NAVIGATE_TARGETS, which must have exactly
// these keys - tests/navigate-domain.test.mjs checks it).
//
// Found via a real user report ("go to the accounts section" answered with "I cannot move"): the
// model sometimes returns the page the way the user said it - «بخش حساب‌ها», "the accounts page",
// "Cuentas" - instead of the id. The old English-only alias table resolved none of those, the
// navigate.to workflow then waited forever for a domainId, and its own open 'navigate-to' process
// put every later turn into "fill this form" mode with no actions offered at all (chat-dock-core.js
// now also drops such a stuck navigation - this is the other half: resolve the page in the first
// place). Pure and dependency-free, so it is unit-tested as plain data.

export const NAVIGATE_DOMAIN_IDS = [
  'dashboard', 'sessions', 'accounts', 'strategies', 'patterns', 'settings', 'psychology',
  'ai-assistant', 'community', 'support', 'account'
];

// English variants (kept from the original table) plus the sidebar's own labels and the everyday
// words for each page in Persian, Arabic and Spanish. Keys are compared after the same folding the
// input gets (lower case, no zero-width non-joiner, no spaces).
const ALIASES = {
  home: 'dashboard', main: 'dashboard', board: 'dashboard',
  session: 'sessions', trading: 'sessions', tradingsessions: 'sessions',
  'prop-firm': 'accounts', propfirm: 'accounts', wallet: 'accounts', propfirmaccounts: 'accounts', tradingaccounts: 'accounts',
  strategy: 'strategies', pattern: 'patterns', patternregistry: 'patterns',
  setting: 'settings', preferences: 'settings',
  mindset: 'psychology', mental: 'psychology', mentalhealth: 'psychology',
  assistant: 'ai-assistant', aisettings: 'ai-assistant', ai: 'ai-assistant', aiassistant: 'ai-assistant',
  profile: 'account', subscription: 'account', subscriptions: 'account', myaccount: 'account',
  ticket: 'support', tickets: 'support', helpdesk: 'support', help: 'support',
  forum: 'community', chatroom: 'community',
  // Persian
  'داشبورد': 'dashboard', 'پیشخوان': 'dashboard', 'صفحهاصلی': 'dashboard', 'خانه': 'dashboard',
  'سشن': 'sessions', 'سشنها': 'sessions', 'سشنهای': 'sessions', 'جلسه': 'sessions', 'جلسات': 'sessions', 'جلسههای': 'sessions',
  'حساب': 'accounts', 'حسابها': 'accounts', 'حسابهای': 'accounts', 'حسابهایم': 'accounts', 'حسابهام': 'accounts', 'حسابفرم': 'accounts', 'پراپ': 'accounts', 'پراپفرم': 'accounts',
  'استراتژی': 'strategies', 'استراتژیها': 'strategies', 'استراتژیهای': 'strategies',
  'الگو': 'patterns', 'الگوها': 'patterns', 'الگوهای': 'patterns',
  'تنظیمات': 'settings',
  'روانشناسی': 'psychology', 'پرونده': 'psychology', 'پروندهروانشناسی': 'psychology',
  'هوشمصنوعی': 'ai-assistant', 'دستیار': 'ai-assistant', 'دستیارهوشمصنوعی': 'ai-assistant',
  'تالارگفتگو': 'community', 'انجمن': 'community', 'کامیونیتی': 'community',
  'پشتیبانی': 'support', 'تیکت': 'support', 'تیکتها': 'support',
  'پروفایل': 'account', 'اشتراک': 'account', 'حسابکاربری': 'account',
  // Arabic
  'لوحةالتحكم': 'dashboard', 'الرئيسية': 'dashboard',
  'الجلسات': 'sessions', 'جلسة': 'sessions',
  'الحسابات': 'accounts', 'حسابات': 'accounts',
  'الاستراتيجيات': 'strategies', 'استراتيجيات': 'strategies',
  'الأنماط': 'patterns', 'أنماط': 'patterns',
  'الإعدادات': 'settings', 'إعدادات': 'settings',
  'علمالنفس': 'psychology',
  'الذكاءالاصطناعي': 'ai-assistant', 'المساعد': 'ai-assistant',
  'المجتمع': 'community',
  'الدعم': 'support',
  'الملفالشخصي': 'account', 'الاشتراك': 'account',
  // Spanish
  'panel': 'dashboard', 'inicio': 'dashboard', 'tablero': 'dashboard',
  'sesiones': 'sessions', 'sesion': 'sessions', 'sesión': 'sessions',
  'cuentas': 'accounts', 'cuenta': 'accounts',
  'estrategias': 'strategies', 'estrategia': 'strategies',
  'patrones': 'patterns', 'patron': 'patterns', 'patrón': 'patterns',
  'ajustes': 'settings', 'configuracion': 'settings', 'configuración': 'settings',
  'psicologia': 'psychology', 'psicología': 'psychology',
  'asistente': 'ai-assistant', 'asistenteia': 'ai-assistant',
  'comunidad': 'community',
  'soporte': 'support', 'ayuda': 'support',
  'perfil': 'account', 'suscripcion': 'account', 'suscripción': 'account'
};

// Words around a page name that never change which page is meant ("the accounts page",
// «بخش حساب‌ها», «صفحهٔ تنظیمات», «قسم الحسابات», "la sección de cuentas").
const FILLER = new Set([
  'the', 'a', 'my', 'page', 'section', 'tab', 'screen', 'view', 'area', 'to', 'of',
  'بخش', 'قسمت', 'صفحه', 'صفحهٔ', 'صفحهی', 'منو', 'منوی', 'تب', 'به', 'ی',
  'قسم', 'صفحة', 'تبويب', 'إلى',
  'la', 'el', 'los', 'las', 'de', 'del', 'página', 'pagina', 'sección', 'seccion', 'pestaña'
]);

function fold(text) {
  return String(text || '').toLowerCase().replace(/‌/g, '').replace(/[.,!?؟،:;"'«»()]/g, ' ').trim();
}

export function normalizeNavigateDomainId(raw) {
  const words = fold(raw).split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !FILLER.has(w));
  for (const candidate of [kept.join(''), words.join('')]) {
    if (!candidate) continue;
    if (NAVIGATE_DOMAIN_IDS.indexOf(candidate) > -1) return candidate;
    if (Object.prototype.hasOwnProperty.call(ALIASES, candidate)) return ALIASES[candidate];
  }
  return null;
}
