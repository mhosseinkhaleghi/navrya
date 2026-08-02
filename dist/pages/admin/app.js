const translations = {
  en: {
    brand: 'Admin',
    testModeBanner: 'TEST MODE — admin authentication is disabled. Every request is treated as admin.',
    enforcedBanner: 'Admin authentication is enforced. A real admin session is required.',
    continueTestMode: 'Continue in test mode',
    tabUsers: 'Users', tabAI: 'AI', tabTechnical: 'Technical', tabXP: 'XP & Segmentation', tabMarketplace: 'Marketplace', tabFinancial: 'Financial',
    loading: 'Loading…', errorGeneric: 'Something went wrong.', retry: 'Retry',
    usersSearchPlaceholder: 'Search by name…',
    colDisplayName: 'Display name', colJoined: 'Joined', colLastLogin: 'Last login', colOnline: 'Online', colHoursOnline: 'Hours online', colPurchases: 'Purchases', colTokensUsed: 'Tokens used', colRole: 'Role', colActions: 'Actions',
    yes: 'Yes', no: 'No', online: 'Online', offline: 'Offline',
    pageOf: 'Page {page} of {total}', prev: 'Previous', next: 'Next',
    close: 'Close', save: 'Save', cancel: 'Cancel', saved: 'Saved.',
    roleUser: 'User', roleModerator: 'Moderator', roleAdmin: 'Admin', suspend: 'Suspend', unsuspend: 'Unsuspend', suspended: 'Suspended',
    aiKeyStatusSet: 'Key set', aiKeyStatusNotSet: 'No key set', aiKeyInputPlaceholder: 'New API key', saveKey: 'Save key', aiKeyUpdatedAt: 'Updated {date}',
    pricingPromptLabel: 'Prompt price / 1K tokens', pricingCompletionLabel: 'Completion price / 1K tokens', budgetLabel: 'Monthly token budget', savePricing: 'Save pricing',
    usageChartTitle: 'Token usage by provider', usageChartEmpty: 'No usage recorded yet.',
    dbConnectivity: 'Database connectivity', dbOk: 'Connected', dbFail: 'Unreachable', migrationsApplied: 'Migrations applied', migrationsNone: 'None recorded (in-memory backend)', communityApiHealth: 'Community API', aiGatewayHealth: 'AI gateway', errorTrackingLabel: 'Error tracking', errorTrackingValue: 'Not implemented yet',
    xpPlaceholderTitle: 'XP control and user segmentation', xpPlaceholderBody: 'Coming in the next phase.',
    marketplaceColTitle: 'Title', marketplaceColSeller: 'Seller', marketplaceColPrice: 'Price', marketplaceColEvidence: 'Evidence', marketplaceColStatus: 'Status', marketplaceColFeatured: 'Featured',
    delistAction: 'Delist', publishAction: 'Publish', featureAction: 'Feature', unfeatureAction: 'Unfeature',
    statusFilterAll: 'All', statusFilterDraft: 'Draft', statusFilterPublished: 'Published', statusFilterDelisted: 'Delisted',
    financeMockRevenueTitle: 'Mock marketplace revenue', financeMockRevenueNote: 'Mock — no real payment processor connected.',
    financeAiCostTitle: 'AI cost estimate (this month)', financeBudgetTitle: 'Remaining budget (this month)',
    noPricingSet: 'No pricing set', noBudgetSet: 'No budget set', tokensUsedLabel: 'tokens used', remainingLabel: 'remaining', budgetOfLabel: 'of {budget}'
  },
  fa: {
    brand: 'پنل مدیریت',
    testModeBanner: 'حالت آزمایشی — احراز هویت مدیریت غیرفعال است. هر درخواستی مدیر در نظر گرفته می‌شود.',
    enforcedBanner: 'احراز هویت مدیریت فعال است. نیاز به یک نشست واقعی مدیر دارید.',
    continueTestMode: 'ادامه در حالت آزمایشی',
    tabUsers: 'کاربران', tabAI: 'هوش مصنوعی', tabTechnical: 'فنی', tabXP: 'XP و بخش‌بندی', tabMarketplace: 'بازار', tabFinancial: 'مالی',
    loading: 'در حال بارگذاری…', errorGeneric: 'خطایی رخ داد.', retry: 'تلاش دوباره',
    usersSearchPlaceholder: 'جست‌وجو بر اساس نام…',
    colDisplayName: 'نام نمایشی', colJoined: 'تاریخ عضویت', colLastLogin: 'آخرین ورود', colOnline: 'وضعیت', colHoursOnline: 'ساعات آنلاین', colPurchases: 'خریدها', colTokensUsed: 'توکن مصرفی', colRole: 'نقش', colActions: 'عملیات',
    yes: 'بله', no: 'خیر', online: 'آنلاین', offline: 'آفلاین',
    pageOf: 'صفحهٔ {page} از {total}', prev: 'قبلی', next: 'بعدی',
    close: 'بستن', save: 'ذخیره', cancel: 'انصراف', saved: 'ذخیره شد.',
    roleUser: 'کاربر', roleModerator: 'ناظر', roleAdmin: 'مدیر', suspend: 'مسدود کردن', unsuspend: 'رفع مسدودی', suspended: 'مسدود',
    aiKeyStatusSet: 'کلید تنظیم شده', aiKeyStatusNotSet: 'کلیدی تنظیم نشده', aiKeyInputPlaceholder: 'کلید API جدید', saveKey: 'ذخیرهٔ کلید', aiKeyUpdatedAt: 'به‌روزرسانی {date}',
    pricingPromptLabel: 'قیمت هر ۱۰۰۰ توکن پرامپت', pricingCompletionLabel: 'قیمت هر ۱۰۰۰ توکن پاسخ', budgetLabel: 'سقف توکن ماهانه', savePricing: 'ذخیرهٔ قیمت‌گذاری',
    usageChartTitle: 'مصرف توکن به تفکیک سرویس‌دهنده', usageChartEmpty: 'هنوز مصرفی ثبت نشده است.',
    dbConnectivity: 'اتصال پایگاه‌داده', dbOk: 'متصل', dbFail: 'در دسترس نیست', migrationsApplied: 'مهاجرت‌های اعمال‌شده', migrationsNone: 'ثبت نشده (بک‌اند حافظه‌ای)', communityApiHealth: 'سرور بخش انجمن', aiGatewayHealth: 'دروازهٔ هوش مصنوعی', errorTrackingLabel: 'ثبت خطا', errorTrackingValue: 'هنوز پیاده‌سازی نشده',
    xpPlaceholderTitle: 'کنترل XP و بخش‌بندی کاربران', xpPlaceholderBody: 'در فاز بعدی اضافه می‌شود.',
    marketplaceColTitle: 'عنوان', marketplaceColSeller: 'فروشنده', marketplaceColPrice: 'قیمت', marketplaceColEvidence: 'شواهد', marketplaceColStatus: 'وضعیت', marketplaceColFeatured: 'ویژه',
    delistAction: 'حذف از بازار', publishAction: 'انتشار', featureAction: 'ویژه کردن', unfeatureAction: 'برداشتن ویژه',
    statusFilterAll: 'همه', statusFilterDraft: 'پیش‌نویس', statusFilterPublished: 'منتشرشده', statusFilterDelisted: 'حذف‌شده',
    financeMockRevenueTitle: 'درآمد آزمایشی بازار', financeMockRevenueNote: 'آزمایشی — به هیچ درگاه پرداخت واقعی متصل نیست.',
    financeAiCostTitle: 'برآورد هزینهٔ هوش مصنوعی (این ماه)', financeBudgetTitle: 'باقی‌ماندهٔ بودجه (این ماه)',
    noPricingSet: 'قیمتی تنظیم نشده', noBudgetSet: 'بودجه‌ای تنظیم نشده', tokensUsedLabel: 'توکن مصرف‌شده', remainingLabel: 'باقی‌مانده', budgetOfLabel: 'از {budget}'
  },
  ar: {
    brand: 'لوحة الإدارة',
    testModeBanner: 'وضع الاختبار — مصادقة المدير معطّلة. تُعامل كل الطلبات كمدير.',
    enforcedBanner: 'مصادقة المدير مفعّلة. مطلوب جلسة مدير حقيقية.',
    continueTestMode: 'المتابعة في وضع الاختبار',
    tabUsers: 'المستخدمون', tabAI: 'الذكاء الاصطناعي', tabTechnical: 'تقني', tabXP: 'نقاط الخبرة والتصنيف', tabMarketplace: 'السوق', tabFinancial: 'مالي',
    loading: 'جارٍ التحميل…', errorGeneric: 'حدث خطأ ما.', retry: 'إعادة المحاولة',
    usersSearchPlaceholder: 'البحث بالاسم…',
    colDisplayName: 'الاسم المعروض', colJoined: 'تاريخ الانضمام', colLastLogin: 'آخر دخول', colOnline: 'الحالة', colHoursOnline: 'ساعات الاتصال', colPurchases: 'المشتريات', colTokensUsed: 'الرموز المستخدمة', colRole: 'الدور', colActions: 'إجراءات',
    yes: 'نعم', no: 'لا', online: 'متصل', offline: 'غير متصل',
    pageOf: 'صفحة {page} من {total}', prev: 'السابق', next: 'التالي',
    close: 'إغلاق', save: 'حفظ', cancel: 'إلغاء', saved: 'تم الحفظ.',
    roleUser: 'مستخدم', roleModerator: 'مشرف', roleAdmin: 'مدير', suspend: 'إيقاف', unsuspend: 'إلغاء الإيقاف', suspended: 'موقوف',
    aiKeyStatusSet: 'المفتاح مضبوط', aiKeyStatusNotSet: 'لا يوجد مفتاح', aiKeyInputPlaceholder: 'مفتاح API جديد', saveKey: 'حفظ المفتاح', aiKeyUpdatedAt: 'تحديث {date}',
    pricingPromptLabel: 'سعر كل 1000 رمز إدخال', pricingCompletionLabel: 'سعر كل 1000 رمز إخراج', budgetLabel: 'الميزانية الشهرية للرموز', savePricing: 'حفظ التسعير',
    usageChartTitle: 'استخدام الرموز حسب المزوّد', usageChartEmpty: 'لا يوجد استخدام مسجل بعد.',
    dbConnectivity: 'اتصال قاعدة البيانات', dbOk: 'متصلة', dbFail: 'غير متاحة', migrationsApplied: 'الترحيلات المطبّقة', migrationsNone: 'لا يوجد سجل (خلفية في الذاكرة)', communityApiHealth: 'خادم المجتمع', aiGatewayHealth: 'بوابة الذكاء الاصطناعي', errorTrackingLabel: 'تتبع الأخطاء', errorTrackingValue: 'غير مطبَّق بعد',
    xpPlaceholderTitle: 'التحكم بنقاط الخبرة وتصنيف المستخدمين', xpPlaceholderBody: 'قادم في المرحلة القادمة.',
    marketplaceColTitle: 'العنوان', marketplaceColSeller: 'البائع', marketplaceColPrice: 'السعر', marketplaceColEvidence: 'الأدلة', marketplaceColStatus: 'الحالة', marketplaceColFeatured: 'مميّز',
    delistAction: 'إزالة من السوق', publishAction: 'نشر', featureAction: 'تمييز', unfeatureAction: 'إلغاء التمييز',
    statusFilterAll: 'الكل', statusFilterDraft: 'مسودة', statusFilterPublished: 'منشور', statusFilterDelisted: 'مُزال',
    financeMockRevenueTitle: 'إيراد السوق التجريبي', financeMockRevenueNote: 'تجريبي — غير متصل بأي معالج دفع حقيقي.',
    financeAiCostTitle: 'تقدير تكلفة الذكاء الاصطناعي (هذا الشهر)', financeBudgetTitle: 'الميزانية المتبقية (هذا الشهر)',
    noPricingSet: 'لا يوجد تسعير', noBudgetSet: 'لا توجد ميزانية', tokensUsedLabel: 'رمز مستخدم', remainingLabel: 'المتبقي', budgetOfLabel: 'من {budget}'
  },
  es: {
    brand: 'Administración',
    testModeBanner: 'MODO DE PRUEBA — la autenticación de administrador está desactivada. Toda solicitud se trata como administrador.',
    enforcedBanner: 'La autenticación de administrador está activada. Se requiere una sesión de administrador real.',
    continueTestMode: 'Continuar en modo de prueba',
    tabUsers: 'Usuarios', tabAI: 'IA', tabTechnical: 'Técnico', tabXP: 'XP y segmentación', tabMarketplace: 'Mercado', tabFinancial: 'Finanzas',
    loading: 'Cargando…', errorGeneric: 'Algo salió mal.', retry: 'Reintentar',
    usersSearchPlaceholder: 'Buscar por nombre…',
    colDisplayName: 'Nombre visible', colJoined: 'Fecha de registro', colLastLogin: 'Último acceso', colOnline: 'Estado', colHoursOnline: 'Horas en línea', colPurchases: 'Compras', colTokensUsed: 'Tokens usados', colRole: 'Rol', colActions: 'Acciones',
    yes: 'Sí', no: 'No', online: 'En línea', offline: 'Desconectado',
    pageOf: 'Página {page} de {total}', prev: 'Anterior', next: 'Siguiente',
    close: 'Cerrar', save: 'Guardar', cancel: 'Cancelar', saved: 'Guardado.',
    roleUser: 'Usuario', roleModerator: 'Moderador', roleAdmin: 'Administrador', suspend: 'Suspender', unsuspend: 'Reactivar', suspended: 'Suspendido',
    aiKeyStatusSet: 'Clave configurada', aiKeyStatusNotSet: 'Sin clave', aiKeyInputPlaceholder: 'Nueva clave de API', saveKey: 'Guardar clave', aiKeyUpdatedAt: 'Actualizado {date}',
    pricingPromptLabel: 'Precio por 1K tokens de entrada', pricingCompletionLabel: 'Precio por 1K tokens de salida', budgetLabel: 'Presupuesto mensual de tokens', savePricing: 'Guardar tarifas',
    usageChartTitle: 'Uso de tokens por proveedor', usageChartEmpty: 'Aún no hay uso registrado.',
    dbConnectivity: 'Conectividad de la base de datos', dbOk: 'Conectada', dbFail: 'No disponible', migrationsApplied: 'Migraciones aplicadas', migrationsNone: 'Sin registro (backend en memoria)', communityApiHealth: 'API de comunidad', aiGatewayHealth: 'Pasarela de IA', errorTrackingLabel: 'Seguimiento de errores', errorTrackingValue: 'Aún no implementado',
    xpPlaceholderTitle: 'Control de XP y segmentación de usuarios', xpPlaceholderBody: 'Disponible en la próxima fase.',
    marketplaceColTitle: 'Título', marketplaceColSeller: 'Vendedor', marketplaceColPrice: 'Precio', marketplaceColEvidence: 'Evidencia', marketplaceColStatus: 'Estado', marketplaceColFeatured: 'Destacado',
    delistAction: 'Retirar', publishAction: 'Publicar', featureAction: 'Destacar', unfeatureAction: 'Quitar destacado',
    statusFilterAll: 'Todos', statusFilterDraft: 'Borrador', statusFilterPublished: 'Publicado', statusFilterDelisted: 'Retirado',
    financeMockRevenueTitle: 'Ingresos simulados del mercado', financeMockRevenueNote: 'Simulado — sin procesador de pagos real conectado.',
    financeAiCostTitle: 'Costo estimado de IA (este mes)', financeBudgetTitle: 'Presupuesto restante (este mes)',
    noPricingSet: 'Sin tarifas configuradas', noBudgetSet: 'Sin presupuesto configurado', tokensUsedLabel: 'tokens usados', remainingLabel: 'restante', budgetOfLabel: 'de {budget}'
  }
};

const languageNames = { en: 'English', fa: 'فارسی', ar: 'العربية', es: 'Español' };
let activeLanguage = localStorage.getItem('tradejournal-language') || 'en';

function t(key, vars) {
  let value = (translations[activeLanguage] && translations[activeLanguage][key]) || translations.en[key] || key;
  Object.keys(vars || {}).forEach((name) => { value = value.replaceAll('{' + name + '}', vars[name]); });
  return value;
}

function applyLanguage(language) {
  activeLanguage = translations[language] ? language : 'en';
  document.documentElement.lang = activeLanguage;
  document.documentElement.dir = activeLanguage === 'fa' || activeLanguage === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelector('#currentLanguage').textContent = languageNames[activeLanguage];
  document.querySelectorAll('[data-language]').forEach((button) => button.classList.toggle('active', button.dataset.language === activeLanguage));
  localStorage.setItem('tradejournal-language', activeLanguage);
}

let toastTimer;
function showToast(message, tone) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.className = 'toast show' + (tone ? ' ' + tone : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 2600);
}

const languageButton = document.querySelector('#languageButton');
const languageMenu = document.querySelector('#languageMenu');
languageButton.addEventListener('click', () => { const open = languageMenu.hidden; languageMenu.hidden = !open; languageButton.setAttribute('aria-expanded', String(open)); });
document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => { applyLanguage(button.dataset.language); languageMenu.hidden = true; languageButton.setAttribute('aria-expanded', 'false'); rerenderCurrentTab(); }));
document.addEventListener('click', (event) => { if (!event.target.closest('.language-picker')) { languageMenu.hidden = true; languageButton.setAttribute('aria-expanded', 'false'); } });

const switcher = window.TradeJournalDevUserSwitcher;
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
function fmtNumber(value) { return value === null || value === undefined || Number.isNaN(Number(value)) ? '—' : numberFormat.format(Number(value)); }
function fmtDate(value) { if (!value) return '—'; try { return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); } catch (_) { return '—'; } }

// Every fetch below attaches x-dev-user-id (bootstrapped once via switcher.ensureUser() in
// boot()) since /api/admin/* sits behind the same devUserAuth as the rest of Community -
// requireAdmin only adds a role check on top, it does not replace this identity step.
function api(path, options) {
  options = options || {};
  const id = switcher && switcher.currentUserId();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, id ? { 'x-dev-user-id': id } : {}, options.headers || {});
  return fetch('/api/admin' + path, Object.assign({}, options, { headers })).then((response) => response.json().catch(() => ({})).then((body) => {
    if (!response.ok) { const error = new Error((body && body.error) || 'REQUEST_FAILED'); error.status = response.status; throw error; }
    return body;
  }));
}

function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function errorNode(error, onRetry) {
  const wrap = el('div', 'admin-card');
  wrap.append(el('p', 'error-text', t('errorGeneric') + (error && error.code ? ' (' + error.code + ')' : '')));
  const retry = el('button', 'btn btn-secondary', t('retry'));
  retry.type = 'button';
  retry.onclick = onRetry;
  wrap.append(retry);
  return wrap;
}

// --- Users tab ---

let usersState = { search: '', sort: 'createdAt', dir: 'desc', page: 1, expanded: null };

function usersTab() {
  return api('/users?search=' + encodeURIComponent(usersState.search) + '&sort=' + usersState.sort + '&dir=' + usersState.dir + '&page=' + usersState.page).then((data) => {
    const wrap = el('div');
    const toolbar = el('div', 'admin-toolbar');
    const search = document.createElement('input');
    search.type = 'text'; search.placeholder = t('usersSearchPlaceholder'); search.value = usersState.search;
    search.oninput = () => { usersState.search = search.value; usersState.page = 1; renderTab(); };
    toolbar.append(search);
    wrap.append(toolbar);

    const tableWrap = el('div', 'admin-table-wrap');
    const table = document.createElement('table');
    table.className = 'admin-table';
    const columns = [
      ['displayName', 'colDisplayName'], ['createdAt', 'colJoined'], ['lastLoginAt', 'colLastLogin'],
      ['isOnline', 'colOnline'], ['hoursOnline', 'colHoursOnline'], ['purchaseCount', 'colPurchases'],
      ['totalTokensUsed', 'colTokensUsed'], [null, 'colRole'], [null, 'colActions']
    ];
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    columns.forEach(([sortKey, labelKey]) => {
      const th = document.createElement('th');
      th.textContent = t(labelKey);
      if (sortKey) {
        th.classList.toggle('sorted', usersState.sort === sortKey);
        th.onclick = () => { usersState.dir = usersState.sort === sortKey && usersState.dir === 'desc' ? 'asc' : 'desc'; usersState.sort = sortKey; renderTab(); };
      }
      headRow.append(th);
    });
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement('tbody');
    data.users.forEach((user) => {
      const row = document.createElement('tr');
      row.append(
        cell(user.displayName), cell(fmtDate(user.createdAt)), cell(fmtDate(user.lastLoginAt)),
        onlineCell(user.isOnline), cell(fmtNumber(user.hoursOnline)),
        cell(user.purchaseCount + ' · ' + fmtNumber(user.totalMockSpent)), cell(fmtNumber(user.totalTokensUsed)),
        cell(t('role' + user.role.charAt(0).toUpperCase() + user.role.slice(1)))
      );
      const actionsCell = document.createElement('td');
      const detailBtn = el('button', 'btn btn-secondary', usersState.expanded === user.id ? t('close') : t('colActions'));
      detailBtn.type = 'button';
      detailBtn.onclick = () => { usersState.expanded = usersState.expanded === user.id ? null : user.id; renderTab(); };
      actionsCell.append(detailBtn);
      row.append(actionsCell);
      tbody.append(row);
      if (usersState.expanded === user.id) tbody.append(userDetailRow(user, columns.length));
    });
    table.append(tbody);
    tableWrap.append(table);
    wrap.append(tableWrap);

    const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
    const pagination = el('div', 'admin-pagination');
    const prev = el('button', 'btn btn-secondary', t('prev'));
    prev.type = 'button'; prev.disabled = usersState.page <= 1;
    prev.onclick = () => { usersState.page -= 1; renderTab(); };
    const next = el('button', 'btn btn-secondary', t('next'));
    next.type = 'button'; next.disabled = usersState.page >= totalPages;
    next.onclick = () => { usersState.page += 1; renderTab(); };
    pagination.append(prev, el('span', '', t('pageOf', { page: usersState.page, total: totalPages })), next);
    wrap.append(pagination);
    return wrap;
  });
}
function cell(text) { const td = document.createElement('td'); td.textContent = text; return td; }
function onlineCell(isOnline) {
  const td = document.createElement('td');
  const dot = el('span', 'online-dot' + (isOnline ? ' online' : ''));
  td.append(dot, document.createTextNode(' ' + (isOnline ? t('online') : t('offline'))));
  return td;
}
function userDetailRow(user, colSpan) {
  const row = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = colSpan;
  const box = el('div', 'admin-card');
  const roleField = el('label', 'field');
  roleField.append(el('span', '', t('colRole')));
  const roleSelect = document.createElement('select');
  ['user', 'moderator', 'admin'].forEach((role) => roleSelect.append(new Option(t('role' + role.charAt(0).toUpperCase() + role.slice(1)), role, false, user.role === role)));
  roleSelect.onchange = () => {
    api('/users/' + user.id, { method: 'PATCH', body: JSON.stringify({ role: roleSelect.value }) })
      .then(() => showToast(t('saved'))).catch((error) => showToast(error.message, 'danger'));
  };
  roleField.append(roleSelect);
  const suspendBtn = el('button', 'btn ' + (user.suspendedAt ? 'btn-secondary' : 'btn-danger'), user.suspendedAt ? t('unsuspend') : t('suspend'));
  suspendBtn.type = 'button';
  suspendBtn.onclick = () => {
    api('/users/' + user.id, { method: 'PATCH', body: JSON.stringify({ suspendedAt: user.suspendedAt ? null : new Date().toISOString() }) })
      .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
  };
  box.append(roleField, suspendBtn);
  td.append(box);
  row.append(td);
  return row;
}

// --- AI tab ---

const KNOWN_PROVIDERS = ['openai', 'anthropic', 'kimi', 'deepseek'];

function aiTab() {
  return Promise.all([api('/ai/keys'), api('/ai/pricing'), api('/ai/usage')]).then(([keys, pricing, usage]) => {
    const wrap = el('div');
    const grid = el('div', 'admin-grid');
    const keyByProvider = {}; keys.forEach((k) => { keyByProvider[k.provider] = k; });
    const pricingByProvider = {}; pricing.forEach((p) => { pricingByProvider[p.provider] = p; });

    KNOWN_PROVIDERS.forEach((provider) => {
      const card = el('div', 'admin-card');
      card.append(el('h3', '', provider));
      const keyInfo = keyByProvider[provider];
      card.append(el('p', 'hint', keyInfo && keyInfo.isSet ? t('aiKeyStatusSet') + (keyInfo.updatedAt ? ' · ' + t('aiKeyUpdatedAt', { date: fmtDate(keyInfo.updatedAt) }) : '') : t('aiKeyStatusNotSet')));
      const keyField = el('label', 'field');
      const keyInput = document.createElement('input');
      keyInput.type = 'password'; keyInput.placeholder = t('aiKeyInputPlaceholder');
      keyField.append(keyInput);
      const saveKeyBtn = el('button', 'btn btn-primary', t('saveKey'));
      saveKeyBtn.type = 'button';
      saveKeyBtn.onclick = () => {
        if (!keyInput.value.trim()) return;
        api('/ai/keys', { method: 'POST', body: JSON.stringify({ provider, apiKey: keyInput.value.trim() }) })
          .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
      };
      card.append(keyField, saveKeyBtn);

      const pricingRow = pricingByProvider[provider] || {};
      const promptField = field(t('pricingPromptLabel'), 'number', pricingRow.promptPricePer1k);
      const completionField = field(t('pricingCompletionLabel'), 'number', pricingRow.completionPricePer1k);
      const budgetField = field(t('budgetLabel'), 'number', pricingRow.monthlyTokenBudget);
      const savePricingBtn = el('button', 'btn btn-secondary', t('savePricing'));
      savePricingBtn.type = 'button';
      savePricingBtn.onclick = () => {
        api('/ai/pricing', { method: 'POST', body: JSON.stringify({
          provider, promptPricePer1k: promptField.input.value, completionPricePer1k: completionField.input.value, monthlyTokenBudget: budgetField.input.value
        }) }).then(() => showToast(t('saved'))).catch((error) => showToast(error.message, 'danger'));
      };
      card.append(promptField.wrap, completionField.wrap, budgetField.wrap, savePricingBtn);
      grid.append(card);
    });
    wrap.append(grid);

    const chartCard = el('div', 'admin-card');
    chartCard.append(el('h3', '', t('usageChartTitle')));
    const totalsByProvider = {};
    (usage.byProviderAndDay || []).forEach((row) => { totalsByProvider[row.provider] = (totalsByProvider[row.provider] || 0) + row.totalTokens; });
    const bars = KNOWN_PROVIDERS.map((provider) => ({ label: provider, value: totalsByProvider[provider] || 0 }));
    if (!bars.some((b) => b.value > 0)) {
      chartCard.append(el('p', 'hint', t('usageChartEmpty')));
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = 720; canvas.height = 260;
      chartCard.append(canvas);
      setTimeout(() => drawBarChart(canvas, bars), 0);
    }
    wrap.append(chartCard);
    return wrap;
  });
}
function field(label, type, value) {
  const wrap = el('label', 'field');
  wrap.append(el('span', '', label));
  const input = document.createElement('input');
  input.type = type; input.step = 'any';
  if (value !== null && value !== undefined) input.value = value;
  wrap.append(input);
  return { wrap, input };
}
// Mirrors trade-reports.js's raw-canvas bar-chart style (no charting library), but reads this
// page's own --violet token instead of --ps-accent, which does not exist on a non-character page.
function drawBarChart(canvas, data) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--violet').trim() || '#a566ff';
  const track = 'rgba(148,163,184,.25)', text = 'rgba(226,232,240,.72)';
  ctx.clearRect(0, 0, w, h);
  ctx.font = '12px sans-serif';
  const max = Math.max(1, ...data.map((d) => d.value));
  data.forEach((d, i) => {
    const y = 18 + i * (h - 28) / data.length, bh = Math.max(14, (h - 40) / data.length - 10);
    ctx.fillStyle = track; ctx.fillRect(112, y, w - 150, bh);
    ctx.fillStyle = accent; ctx.fillRect(112, y, (w - 150) * (d.value / max), bh);
    ctx.fillStyle = text;
    ctx.textAlign = 'end'; ctx.fillText(d.label, 104, y + bh - 3);
    ctx.textAlign = 'start'; ctx.fillText(fmtNumber(d.value), 120 + (w - 150) * (d.value / max), y + bh - 3);
  });
}

// --- Technical tab ---

function technicalTab() {
  return api('/technical').then((data) => {
    const wrap = el('div', 'admin-grid');
    const dbCard = el('div', 'admin-card');
    dbCard.append(el('h3', '', t('dbConnectivity')), el('p', '', (data.db.ok ? t('dbOk') : t('dbFail')) + ' (' + data.db.backend + ')'));
    const migrations = el('div', 'admin-card');
    migrations.append(el('h3', '', t('migrationsApplied')));
    if (!data.migrations || !data.migrations.length) migrations.append(el('p', 'hint', t('migrationsNone')));
    else { const list = document.createElement('ul'); data.migrations.forEach((m) => { const li = document.createElement('li'); li.textContent = m.id; list.append(li); }); migrations.append(list); }
    const communityCard = el('div', 'admin-card');
    communityCard.append(el('h3', '', t('communityApiHealth')), el('p', '', data.communityApi.ok ? t('dbOk') : t('dbFail')));
    const gatewayCard = el('div', 'admin-card');
    gatewayCard.append(el('h3', '', t('aiGatewayHealth')), el('p', '', data.aiGateway.ok ? t('dbOk') : t('dbFail')));
    const errorCard = el('div', 'admin-card');
    errorCard.append(el('h3', '', t('errorTrackingLabel')), el('p', 'hint', t('errorTrackingValue')));
    wrap.append(dbCard, migrations, communityCard, gatewayCard, errorCard);
    return wrap;
  });
}

// --- XP & Segmentation tab (deliberate placeholder - issues zero fetch calls) ---

function xpTab() {
  const wrap = el('div', 'admin-card');
  wrap.append(el('h3', '', t('xpPlaceholderTitle')), el('p', 'hint', t('xpPlaceholderBody')));
  return Promise.resolve(wrap);
}

// --- Marketplace tab ---

let marketplaceStatusFilter = 'all';

function marketplaceTab() {
  return api('/marketplace/listings?status=' + marketplaceStatusFilter).then((listings) => {
    const wrap = el('div');
    const toolbar = el('div', 'admin-toolbar');
    const select = document.createElement('select');
    [['all', 'statusFilterAll'], ['draft', 'statusFilterDraft'], ['published', 'statusFilterPublished'], ['delisted', 'statusFilterDelisted']]
      .forEach(([value, labelKey]) => select.append(new Option(t(labelKey), value, false, marketplaceStatusFilter === value)));
    select.onchange = () => { marketplaceStatusFilter = select.value; renderTab(); };
    toolbar.append(select);
    wrap.append(toolbar);

    const tableWrap = el('div', 'admin-table-wrap');
    const table = document.createElement('table');
    table.className = 'admin-table';
    const thead = document.createElement('tr');
    ['marketplaceColTitle', 'marketplaceColSeller', 'marketplaceColPrice', 'marketplaceColEvidence', 'marketplaceColStatus', 'marketplaceColFeatured', 'colActions']
      .forEach((key) => { const th = document.createElement('th'); th.textContent = t(key); thead.append(th); });
    const theadWrap = document.createElement('thead'); theadWrap.append(thead); table.append(theadWrap);
    const tbody = document.createElement('tbody');
    listings.forEach((listing) => {
      const row = document.createElement('tr');
      row.append(cell(listing.title), cell(listing.sellerName || '—'), cell(fmtNumber(listing.priceAmount) + ' ' + listing.priceCurrency));
      row.append(cell(listing.sampleSize > 0 && listing.successRatePercent != null ? fmtNumber(listing.successRatePercent) + '% · ' + fmtNumber(listing.sampleSize) : '—'));
      const statusTd = document.createElement('td');
      statusTd.append(el('span', 'badge status-' + listing.status, t('statusFilter' + listing.status.charAt(0).toUpperCase() + listing.status.slice(1))));
      row.append(statusTd);
      const featuredTd = document.createElement('td');
      featuredTd.textContent = listing.featured ? t('yes') : t('no');
      row.append(featuredTd);

      const actionsTd = document.createElement('td');
      const featureBtn = el('button', 'btn btn-secondary', listing.featured ? t('unfeatureAction') : t('featureAction'));
      featureBtn.type = 'button';
      featureBtn.onclick = () => api('/marketplace/listings/' + listing.id, { method: 'PATCH', body: JSON.stringify({ featured: !listing.featured }) })
        .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
      actionsTd.append(featureBtn);
      if (listing.status !== 'delisted') {
        const delistBtn = el('button', 'btn btn-danger', t('delistAction'));
        delistBtn.type = 'button';
        delistBtn.onclick = () => api('/marketplace/listings/' + listing.id, { method: 'PATCH', body: JSON.stringify({ status: 'delisted' }) })
          .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
        actionsTd.append(delistBtn);
      }
      row.append(actionsTd);
      tbody.append(row);
    });
    table.append(tbody);
    tableWrap.append(table);
    wrap.append(tableWrap);
    return wrap;
  });
}

// --- Financial tab ---

function financialTab() {
  return api('/finance/overview').then((data) => {
    const wrap = el('div', 'admin-grid');

    const revenueCard = el('div', 'admin-card');
    revenueCard.append(el('h3', '', t('financeMockRevenueTitle')));
    revenueCard.append(el('p', '', fmtNumber(data.mockRevenue.total)));
    revenueCard.append(el('p', 'hint', t('financeMockRevenueNote')));
    wrap.append(revenueCard);

    const costCard = el('div', 'admin-card');
    costCard.append(el('h3', '', t('financeAiCostTitle')));
    data.aiCostByProvider.forEach((row) => {
      const line = el('p', '');
      line.textContent = row.provider + ': ' + (row.cost === null ? t('noPricingSet') : fmtNumber(row.cost)) + ' (' + fmtNumber(row.tokensUsed) + ' ' + t('tokensUsedLabel') + ')';
      costCard.append(line);
    });
    wrap.append(costCard);

    const budgetCard = el('div', 'admin-card');
    budgetCard.append(el('h3', '', t('financeBudgetTitle')));
    data.remainingBudgetByProvider.forEach((row) => {
      const line = el('p', '');
      line.textContent = row.provider + ': ' + (row.remaining === null ? t('noBudgetSet') : fmtNumber(row.remaining) + ' ' + t('remainingLabel') + ' (' + t('budgetOfLabel', { budget: fmtNumber(row.budget) }) + ')');
      budgetCard.append(line);
    });
    wrap.append(budgetCard);
    return wrap;
  });
}

// --- Routing / boot ---

const tabBuilders = { users: usersTab, ai: aiTab, technical: technicalTab, xp: xpTab, marketplace: marketplaceTab, financial: financialTab };

function route() {
  const match = location.hash.match(/^#\/admin\/(users|ai|technical|xp|marketplace|financial)$/);
  return match ? match[1] : 'users';
}

function renderTab() {
  const tab = route();
  document.querySelectorAll('#adminTabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const body = document.querySelector('#adminBody');
  body.replaceChildren(el('p', 'hint', t('loading')));
  tabBuilders[tab]().then((node) => { body.replaceChildren(node); }).catch((error) => { body.replaceChildren(errorNode(error, renderTab)); });
}
function rerenderCurrentTab() { if (!document.querySelector('#adminShell').hidden) renderTab(); }

document.querySelectorAll('#adminTabs button').forEach((button) => button.addEventListener('click', () => { location.hash = '#/admin/' + button.dataset.tab; }));
window.addEventListener('hashchange', () => { if (location.hash.indexOf('#/admin') === 0) renderTab(); });

function startApp() {
  document.querySelector('#adminGate').hidden = true;
  document.querySelector('#adminShell').hidden = false;
  if (!/^#\/admin\/(users|ai|technical|xp|marketplace|financial)$/.test(location.hash)) location.hash = '#/admin/users';
  else renderTab();
}

function boot() {
  applyLanguage(activeLanguage);
  fetch('/api/admin/config').then((r) => r.json()).catch(() => ({ authEnforced: false })).then((config) => {
    const gate = document.querySelector('#adminGate');
    gate.hidden = false;
    if (config.authEnforced) {
      document.querySelector('#enforcedBadge').hidden = false;
    } else {
      const testBadge = document.querySelector('#testModeBadge');
      const continueBtn = document.querySelector('#continueTestMode');
      testBadge.hidden = false;
      continueBtn.hidden = false;
      continueBtn.onclick = () => { (switcher ? switcher.ensureUser() : Promise.resolve()).then(startApp); };
    }
  });
}

// Minimal testability surface (this page otherwise has no window export, matching
// select/app.js's own standalone-script style) - route() and the XP placeholder tab are pure
// enough to unit-test directly rather than only indirectly through hash/DOM interaction.
window.TradeJournalAdminApp = { route: route, xpTab: xpTab };

boot();
