// Pure helpers for a create that the server can refuse with 403 PLAN_LIMIT_REACHED (see
// server/commercial/quota.mjs, whose error body carries { resource, limit, used, plan }). Shared by
// every quota-gated create surface so a rejection reads the same everywhere and is never mistaken for a
// generic "save failed": NewSessionDialog (sessions) and InstrumentPicker (analysisSymbols, the plan's
// instrument cap). No React, no window access apart from the language lookup, so it is unit-testable.
//
// The numbers always come from the server's own error body - the effective, admin-editable plan config -
// never from a constant here. `resource` picks the sentence; anything else falls back to a generic one.

const COPY = {
  en: {
    instruments: 'Your plan allows up to {limit} instruments and you already have {used} — remove one or upgrade your plan to add another.',
    sessions: 'Your plan allows up to {limit} sessions and you already have {used} — delete one or upgrade your plan to create more.',
    generic: 'You have reached your plan limit — remove an item or upgrade your plan to add more.',
    viewPlans: 'View plans',
    createFailed: 'The session could not be created and nothing was saved — please try again.'
  },
  fa: {
    instruments: 'طرح شما حداکثر {limit} نماد را مجاز می‌داند و اکنون {used} نماد دارید — برای افزودن نماد جدید، یکی را حذف کنید یا طرح خود را ارتقا دهید.',
    sessions: 'طرح شما حداکثر {limit} سشن را مجاز می‌داند و اکنون {used} سشن دارید — برای ساخت سشن جدید، یک سشن را حذف کنید یا طرح خود را ارتقا دهید.',
    generic: 'به سقف طرح خود رسیده‌اید — برای افزودن مورد جدید، یک مورد را حذف کنید یا طرح خود را ارتقا دهید.',
    viewPlans: 'مشاهده طرح‌ها',
    createFailed: 'سشن ایجاد نشد و چیزی ذخیره نشد — لطفاً دوباره تلاش کنید.'
  },
  ar: {
    instruments: 'تسمح خطتك بحد أقصى {limit} أداة وتملك حاليًا {used} — احذف واحدة أو قم بترقية خطتك لإضافة أداة جديدة.',
    sessions: 'تسمح خطتك بحد أقصى {limit} جلسة وتملك حاليًا {used} — احذف جلسة أو قم بترقية خطتك لإنشاء المزيد.',
    generic: 'لقد بلغت الحد الأقصى لخطتك — احذف عنصرًا أو قم بترقية خطتك للإضافة.',
    viewPlans: 'عرض الخطط',
    createFailed: 'تعذّر إنشاء الجلسة ولم يتم حفظ أي شيء — يرجى المحاولة مرة أخرى.'
  },
  es: {
    instruments: 'Tu plan permite hasta {limit} instrumentos y ya tienes {used} — elimina uno o mejora tu plan para añadir otro.',
    sessions: 'Tu plan permite hasta {limit} sesiones y ya tienes {used} — elimina una sesión o mejora tu plan para crear más.',
    generic: 'Has alcanzado el límite de tu plan — elimina un elemento o mejora tu plan para añadir más.',
    viewPlans: 'Ver planes',
    createFailed: 'No se pudo crear la sesión y no se guardó nada — inténtalo de nuevo.'
  }
};

const RESOURCE_COPY_KEY = { analysisSymbols: 'instruments', sessions: 'sessions' };

export function currentLanguage() {
  const lang = typeof document !== 'undefined' && document.documentElement ? String(document.documentElement.lang || 'en').toLowerCase() : 'en';
  return COPY[lang] ? lang : 'en';
}

// The server's quota rejection as { resource, limit, used, plan }, or null for any other error - a 403 for
// another reason (ownership, archived account, ...) must never be shown as a plan limit.
export function planLimitInfo(error) {
  if (!error || error.code !== 'PLAN_LIMIT_REACHED') return null;
  const details = error.details && typeof error.details === 'object' ? error.details : {};
  const number = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null);
  return { resource: typeof details.resource === 'string' ? details.resource : null, limit: number(details.limit), used: number(details.used), plan: typeof details.plan === 'string' ? details.plan : null };
}

function fill(template, info) {
  return String(template).replace('{limit}', info.limit === null ? '' : String(info.limit)).replace('{used}', info.used === null ? '' : String(info.used));
}

// Localized sentence for a plan-limit rejection. A resource without a specific sentence, or a response
// missing its numbers, gets the generic sentence rather than one with blanks in it.
export function planLimitMessage(info, lang = currentLanguage()) {
  const copy = COPY[lang] || COPY.en;
  const specific = info && RESOURCE_COPY_KEY[info.resource];
  const hasNumbers = info && info.limit !== null && info.used !== null;
  return fill(copy[specific && hasNumbers ? specific : 'generic'], info || { limit: null, used: null });
}

export function planLimitCopy(name, lang = currentLanguage()) {
  return (COPY[lang] || COPY.en)[name];
}
