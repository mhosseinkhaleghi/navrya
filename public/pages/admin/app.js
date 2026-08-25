const translations = {
  en: {
    brand: 'Admin',
    loginHint: 'Sign in with your admin account.', emailLabel: 'Email', passwordLabel: 'Password', loginSubmit: 'Log in',
    gateErrorNotAdmin: 'This account does not have admin access.', gateErrorInvalidCredentials: 'Incorrect email or password.',
    enforcementWarning: 'Warning: ADMIN_AUTH_ENFORCED is not set on the server - every account currently has admin access. Set ADMIN_AUTH_ENFORCED=true.',
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
    xpStatTypes: 'XP types', xpStatOverridden: 'Overridden values', xpNoRows: 'Nothing to show.',
    xpColDefault: 'Default', xpColCurrent: 'Current', xpColEdit: 'Edit', xpColType: 'Type', xpColDomain: 'Domain',
    xpColAchievement: 'Achievement', xpColLevel: 'Level', xpColRequirement: 'Requirement',
    xpResetDefault: 'Reset to default', xpPeriodDay: 'per day', xpPeriodWeek: 'per week',
    xpSectionPoints: 'XP points by type', xpSectionDomainCaps: 'Domain daily caps',
    xpSectionRecurringCap: 'Recurring daily cap (all domains combined)', xpRecurringCapLabel: 'Daily cap',
    xpSectionSourceCaps: 'Per-source max count (e.g. max chart entries per Session)',
    xpSectionSourceTotalCaps: 'Per-source total point ceiling (e.g. max total XP per Trade)',
    xpSectionPeriodCaps: 'Per-type period caps', xpSectionAchievements: 'Achievement points',
    xpSectionMastery: 'Mastery-gate requirements by level',
    marketplaceColTitle: 'Title', marketplaceColSeller: 'Seller', marketplaceColPrice: 'Price', marketplaceColEvidence: 'Evidence', marketplaceColStatus: 'Status', marketplaceColFeatured: 'Featured',
    delistAction: 'Delist', publishAction: 'Publish', featureAction: 'Feature', unfeatureAction: 'Unfeature',
    statusFilterAll: 'All', statusFilterDraft: 'Draft', statusFilterPublished: 'Published', statusFilterDelisted: 'Delisted',
    financeMockRevenueTitle: 'Mock marketplace revenue', financeMockRevenueNote: 'Mock — no real payment processor connected.',
    financeAiCostTitle: 'AI cost estimate (this month)', financeBudgetTitle: 'Remaining budget (this month)',
    noPricingSet: 'No pricing set', noBudgetSet: 'No budget set', tokensUsedLabel: 'tokens used', remainingLabel: 'remaining', budgetOfLabel: 'of {budget}',
    gateError: 'Could not continue.', gateErrorOffline: 'Could not reach the server. Is the community backend running? (npm run dev:community-api)',
    backToApp: 'Back to app', sidebarToggleLabel: 'Toggle menu',
    statTotalUsers: 'Total users', statOnlineNow: 'Online now', statProvidersConfigured: 'Providers configured', statTotalListings: 'Total listings', statPublishedListings: 'Published', statFeaturedListings: 'Featured',
    detailLoadFailed: 'Could not load user details.', noEmail: 'No email on file', noPhone: 'No phone on file',
    kycStatusLabel: 'Verification (KYC) status', kycNotStarted: 'Not started', kycPending: 'Pending review', kycVerified: 'Verified', kycRejected: 'Rejected', saveKyc: 'Save status',
    profileRoleLabel: 'Product role', profileRoleTrader: 'Trader', profileRoleMentor: 'Mentor', profileRoleTeacher: 'Teacher',
    levelXpLabel: 'Level {level} · {xp} XP', achievementsLabel: 'Achievements', noAchievements: 'No achievements unlocked yet.',
    subscriptionsLabel: 'Subscriptions', noSubscriptions: 'No subscriptions.', mockBadge: 'mock', purchasedOnLabel: 'Purchased {date}',
    aiHealthLabel: 'Health', statusHealthy: 'Healthy', statusDegraded: 'Degraded', statusIdle: 'Idle', statusDisconnected: 'Disconnected', statusUnconfigured: 'Not configured', statusUnknown: 'Not tested yet',
    aiTestNow: 'Test now', aiTestingNow: 'Testing…', aiTestOk: 'Connection OK.', aiLastChecked: 'Last checked {date}', aiLastErrorLabel: 'Last error: {error}',
voiceProvidersTitle: 'Voice Providers (ElevenLabs)', voiceProvidersHint: 'Admin-managed ElevenLabs credentials and per-language voice routing for the live Voice Mode. Changes apply immediately - no redeploy needed.',
    vpCredentialsTitle: 'Credential profiles', vpAddCredential: 'Add credential profile', vpLabelPlaceholder: 'Profile name (e.g. Primary ElevenLabs Account)', vpKeyPlaceholder: 'Paste the ElevenLabs API key', vpReplaceKeyHint: 'Leave blank to keep the current key', vpSaveCredential: 'Save profile', vpNoCredentials: 'No credential profiles yet.',
    vpKeyHint: 'Key ends in {hint}', vpValidate: 'Validate', vpValidating: 'Validating…', vpDelete: 'Delete', vpDeleteConfirm: 'Delete this credential profile? Any language using it will fall back until a new one is selected.', vpDeleted: 'Credential deleted.',
    vpEnabled: 'Enabled', vpDisabled: 'Disabled', vpValidationUnknown: 'Not validated yet', vpValidationValid: 'Valid', vpValidationInvalid: 'Invalid', vpValidationRestricted: 'Restricted (scope/IP)', vpLastValidated: 'Last validated {date}', vpNeverValidated: 'Never validated',
    vpLanguagesTitle: 'Language routing', vpLanguageEnable: 'Use ElevenLabs for this language', vpCredentialSelect: 'Credential profile', vpNoCredentialSelected: 'No credential selected',
    vpVoiceSearch: 'Search voices…', vpVoiceId: 'Voice ID', vpLoadVoices: 'Load voices', vpModelSelect: 'Model', vpLoadModels: 'Load models', vpFallback: 'OpenAI fallback', vpSaveLanguage: 'Save', vpSaved: 'Saved.',
    vpTestSample: 'Generate test sample', vpTestGenerating: 'Generating…', vpTestCreditsWarning: 'This generates real audio and consumes ElevenLabs credits.', vpTestTextPlaceholder: 'Short sample text',
    vpHealthTitle: 'Health & usage', vpStatusReady: 'Ready', vpStatusDisabled: 'Disabled', vpStatusUnconfigured: 'Not configured', vpStatusInvalidCredential: 'Invalid credential', vpStatusDegraded: 'Degraded',
    vpRequests24h: 'Requests (24h)', vpSuccessRate: 'Success rate', vpAvgLatency: 'Avg latency', vpLastSuccess: 'Last success', vpLastError: 'Last error', vpNoUsageYet: 'No usage yet', vpValidateFirst: 'Select and validate a credential first',
    vpQuotaRefresh: 'Refresh quota', vpQuotaTier: 'Tier {tier}', vpQuotaCharacters: '{used} / {limit} characters used', vpQuotaRemaining: '{count} remaining (nominal)', vpQuotaNextReset: 'Resets {date}', vpQuotaOverage: 'Overage allowed', vpQuotaUnavailable: 'Quota unavailable', vpAnalyticsUnavailable: 'Usage permission unavailable',
    aiTodayTokensLabel: 'Today', aiMonthTokensLabel: 'This month', aiEstCostLabel: 'Est. cost',
    aiTrendTitle: 'Daily usage (last 14 days)', aiTrendEmpty: 'No usage in this window yet.',
    aiRecentEventsTitle: 'Recent AI events', aiRecentEventsEmpty: 'No AI calls recorded yet.',
    aiRecentColTime: 'Time', aiRecentColProvider: 'Provider', aiRecentColSource: 'Source', aiRecentColStatus: 'Status', aiRecentColLatency: 'Latency',
    aiTopUsersTitle: 'Top users by token usage', aiTopUsersEmpty: 'No usage recorded yet.', aiTopUsersColUser: 'User', aiTopUsersColTokens: 'Tokens',
    usageByProviderLabel: 'Token usage by provider', noProviderUsage: 'No AI usage recorded for this user yet.'
  },
  fa: {
    brand: 'پنل مدیریت',
    loginHint: 'با حساب مدیریتی خود وارد شوید.', emailLabel: 'ایمیل', passwordLabel: 'رمز عبور', loginSubmit: 'ورود',
    gateErrorNotAdmin: 'این حساب دسترسی مدیریت ندارد.', gateErrorInvalidCredentials: 'ایمیل یا رمز عبور اشتباه است.',
    enforcementWarning: 'هشدار: ADMIN_AUTH_ENFORCED روی سرور تنظیم نشده — فعلاً هر حسابی دسترسی مدیریت داره. مقدار ADMIN_AUTH_ENFORCED=true رو تنظیم کنید.',
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
    xpStatTypes: 'نوع رویداد XP', xpStatOverridden: 'مقادیر تغییریافته', xpNoRows: 'چیزی برای نمایش نیست.',
    xpColDefault: 'پیش‌فرض', xpColCurrent: 'فعلی', xpColEdit: 'ویرایش', xpColType: 'نوع', xpColDomain: 'حوزه',
    xpColAchievement: 'دستاورد', xpColLevel: 'سطح', xpColRequirement: 'شرط',
    xpResetDefault: 'بازگشت به پیش‌فرض', xpPeriodDay: 'در روز', xpPeriodWeek: 'در هفته',
    xpSectionPoints: 'امتیاز هر نوع رویداد', xpSectionDomainCaps: 'سقف روزانه هر حوزه',
    xpSectionRecurringCap: 'سقف روزانه کل فعالیت‌های تکرارشونده', xpRecurringCapLabel: 'سقف روزانه',
    xpSectionSourceCaps: 'حداکثر تعداد در هر منبع (مثلاً حداکثر Chart Entry در هر Session)',
    xpSectionSourceTotalCaps: 'سقف کل امتیاز هر منبع (مثلاً حداکثر امتیاز هر Trade)',
    xpSectionPeriodCaps: 'سقف دوره‌ای هر نوع', xpSectionAchievements: 'امتیاز دستاوردها',
    xpSectionMastery: 'شرایط عبور از هر سطح (Mastery Gate)',
    marketplaceColTitle: 'عنوان', marketplaceColSeller: 'فروشنده', marketplaceColPrice: 'قیمت', marketplaceColEvidence: 'شواهد', marketplaceColStatus: 'وضعیت', marketplaceColFeatured: 'ویژه',
    delistAction: 'حذف از بازار', publishAction: 'انتشار', featureAction: 'ویژه کردن', unfeatureAction: 'برداشتن ویژه',
    statusFilterAll: 'همه', statusFilterDraft: 'پیش‌نویس', statusFilterPublished: 'منتشرشده', statusFilterDelisted: 'حذف‌شده',
    financeMockRevenueTitle: 'درآمد آزمایشی بازار', financeMockRevenueNote: 'آزمایشی — به هیچ درگاه پرداخت واقعی متصل نیست.',
    financeAiCostTitle: 'برآورد هزینهٔ هوش مصنوعی (این ماه)', financeBudgetTitle: 'باقی‌ماندهٔ بودجه (این ماه)',
    noPricingSet: 'قیمتی تنظیم نشده', noBudgetSet: 'بودجه‌ای تنظیم نشده', tokensUsedLabel: 'توکن مصرف‌شده', remainingLabel: 'باقی‌مانده', budgetOfLabel: 'از {budget}',
    gateError: 'ادامه ممکن نشد.', gateErrorOffline: 'اتصال به سرور برقرار نشد. سرور بخش انجمن اجرا شده؟ (npm run dev:community-api)',
    backToApp: 'بازگشت به برنامه', sidebarToggleLabel: 'باز/بسته کردن منو',
    statTotalUsers: 'مجموع کاربران', statOnlineNow: 'آنلاین الان', statProvidersConfigured: 'سرویس‌دهنده‌های تنظیم‌شده', statTotalListings: 'مجموع آگهی‌ها', statPublishedListings: 'منتشرشده', statFeaturedListings: 'ویژه',
    detailLoadFailed: 'جزئیات کاربر بارگذاری نشد.', noEmail: 'ایمیلی ثبت نشده', noPhone: 'شماره‌ای ثبت نشده',
    kycStatusLabel: 'وضعیت احراز هویت (KYC)', kycNotStarted: 'شروع نشده', kycPending: 'در حال بررسی', kycVerified: 'تأیید شده', kycRejected: 'رد شده', saveKyc: 'ذخیرهٔ وضعیت',
    profileRoleLabel: 'نقش محصولی', profileRoleTrader: 'معامله‌گر', profileRoleMentor: 'منتور', profileRoleTeacher: 'مدرس',
    levelXpLabel: 'سطح {level} · {xp} امتیاز', achievementsLabel: 'دستاوردها', noAchievements: 'هنوز دستاوردی باز نشده است.',
    subscriptionsLabel: 'اشتراک‌ها', noSubscriptions: 'اشتراکی وجود ندارد.', mockBadge: 'آزمایشی', purchasedOnLabel: 'خریداری‌شده در {date}',
    aiHealthLabel: 'سلامت', statusHealthy: 'سالم', statusDegraded: 'ناپایدار', statusIdle: 'بی‌فعالیت', statusDisconnected: 'قطع شده', statusUnconfigured: 'پیکربندی نشده', statusUnknown: 'هنوز تست نشده',
    aiTestNow: 'تست همین حالا', aiTestingNow: 'در حال تست…', aiTestOk: 'اتصال برقرار است.', aiLastChecked: 'آخرین بررسی {date}', aiLastErrorLabel: 'آخرین خطا: {error}',
    voiceProvidersTitle: 'ارائه‌دهنده‌های صدا (ElevenLabs)', voiceProvidersHint: 'کلیدهای ElevenLabs و مسیردهی صدا به‌ازای هر زبان، مدیریت‌شده توسط ادمین - برای حالت صوتی زنده. تغییرات بلافاصله اعمال می‌شوند، بدون نیاز به دیپلوی دوباره.',
    vpCredentialsTitle: 'پروفایل‌های کلید', vpAddCredential: 'افزودن پروفایل کلید', vpLabelPlaceholder: 'نام پروفایل (مثلاً حساب اصلی ElevenLabs)', vpKeyPlaceholder: 'کلید API ElevenLabs را وارد کن', vpReplaceKeyHint: 'برای نگه‌داشتن کلید فعلی، خالی بگذار', vpSaveCredential: 'ذخیرهٔ پروفایل', vpNoCredentials: 'هنوز پروفایل کلیدی ثبت نشده است.',
    vpKeyHint: 'کلید با {hint} تمام می‌شود', vpValidate: 'اعتبارسنجی', vpValidating: 'در حال اعتبارسنجی…', vpDelete: 'حذف', vpDeleteConfirm: 'این پروفایل کلید حذف شود؟ هر زبانی که از آن استفاده می‌کند، تا انتخاب یک پروفایل جدید به حالت پیش‌فرض برمی‌گردد.', vpDeleted: 'کلید حذف شد.',
    vpEnabled: 'فعال', vpDisabled: 'غیرفعال', vpValidationUnknown: 'هنوز اعتبارسنجی نشده', vpValidationValid: 'معتبر', vpValidationInvalid: 'نامعتبر', vpValidationRestricted: 'محدودشده (دسترسی/IP)', vpLastValidated: 'آخرین اعتبارسنجی {date}', vpNeverValidated: 'هرگز اعتبارسنجی نشده',
    vpLanguagesTitle: 'مسیردهی زبان‌ها', vpLanguageEnable: 'استفاده از ElevenLabs برای این زبان', vpCredentialSelect: 'پروفایل کلید', vpNoCredentialSelected: 'کلیدی انتخاب نشده',
    vpVoiceSearch: 'جست‌وجوی صداها…', vpVoiceId: 'شناسهٔ صدا', vpLoadVoices: 'بارگذاری صداها', vpModelSelect: 'مدل', vpLoadModels: 'بارگذاری مدل‌ها', vpFallback: 'پشتیبان OpenAI', vpSaveLanguage: 'ذخیره', vpSaved: 'ذخیره شد.',
    vpTestSample: 'ساخت نمونهٔ آزمایشی', vpTestGenerating: 'در حال ساخت…', vpTestCreditsWarning: 'این کار صدای واقعی می‌سازد و از اعتبار ElevenLabs کم می‌کند.', vpTestTextPlaceholder: 'متن کوتاه نمونه',
    vpHealthTitle: 'سلامت و مصرف', vpStatusReady: 'آماده', vpStatusDisabled: 'غیرفعال', vpStatusUnconfigured: 'تنظیم نشده', vpStatusInvalidCredential: 'کلید نامعتبر', vpStatusDegraded: 'افت کیفیت',
    vpRequests24h: 'درخواست‌ها (۲۴ ساعت)', vpSuccessRate: 'نرخ موفقیت', vpAvgLatency: 'میانگین تأخیر', vpLastSuccess: 'آخرین موفقیت', vpLastError: 'آخرین خطا', vpNoUsageYet: 'هنوز مصرفی ثبت نشده', vpValidateFirst: 'ابتدا یک کلید را انتخاب و اعتبارسنجی کن',
    vpQuotaRefresh: 'به‌روزرسانی سهمیه', vpQuotaTier: 'سطح {tier}', vpQuotaCharacters: '{used} از {limit} کاراکتر مصرف شده', vpQuotaRemaining: '{count} باقی‌مانده (تخمینی)', vpQuotaNextReset: 'بازنشانی در {date}', vpQuotaOverage: 'مصرف اضافه مجاز است', vpQuotaUnavailable: 'سهمیه در دسترس نیست', vpAnalyticsUnavailable: 'دسترسی به آمار مصرف موجود نیست',
    aiTodayTokensLabel: 'امروز', aiMonthTokensLabel: 'این ماه', aiEstCostLabel: 'هزینهٔ تخمینی',
    aiTrendTitle: 'مصرف روزانه (۱۴ روز اخیر)', aiTrendEmpty: 'در این بازه مصرفی ثبت نشده است.',
    aiRecentEventsTitle: 'رویدادهای اخیر هوش مصنوعی', aiRecentEventsEmpty: 'هنوز هیچ فراخوانی هوش مصنوعی ثبت نشده است.',
    aiRecentColTime: 'زمان', aiRecentColProvider: 'سرویس‌دهنده', aiRecentColSource: 'منبع', aiRecentColStatus: 'وضعیت', aiRecentColLatency: 'تأخیر',
    aiTopUsersTitle: 'پرمصرف‌ترین کاربران (توکن)', aiTopUsersEmpty: 'هنوز مصرفی ثبت نشده است.', aiTopUsersColUser: 'کاربر', aiTopUsersColTokens: 'توکن',
    usageByProviderLabel: 'مصرف توکن به تفکیک سرویس‌دهنده', noProviderUsage: 'هنوز مصرف هوش مصنوعی برای این کاربر ثبت نشده است.'
  },
  ar: {
    brand: 'لوحة الإدارة',
    loginHint: 'سجّل الدخول بحساب المدير الخاص بك.', emailLabel: 'البريد الإلكتروني', passwordLabel: 'كلمة المرور', loginSubmit: 'تسجيل الدخول',
    gateErrorNotAdmin: 'هذا الحساب لا يملك صلاحية الإدارة.', gateErrorInvalidCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    enforcementWarning: 'تحذير: ADMIN_AUTH_ENFORCED غير مضبوط على الخادم - كل حساب لديه صلاحية الإدارة حاليًا. اضبط ADMIN_AUTH_ENFORCED=true.',
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
    xpStatTypes: 'أنواع نقاط الخبرة', xpStatOverridden: 'قيم مخصّصة', xpNoRows: 'لا يوجد شيء لعرضه.',
    xpColDefault: 'افتراضي', xpColCurrent: 'الحالي', xpColEdit: 'تعديل', xpColType: 'النوع', xpColDomain: 'المجال',
    xpColAchievement: 'الإنجاز', xpColLevel: 'المستوى', xpColRequirement: 'الشرط',
    xpResetDefault: 'إعادة إلى الافتراضي', xpPeriodDay: 'يوميًا', xpPeriodWeek: 'أسبوعيًا',
    xpSectionPoints: 'نقاط الخبرة حسب النوع', xpSectionDomainCaps: 'السقف اليومي لكل مجال',
    xpSectionRecurringCap: 'السقف اليومي الكلي لكل الأنشطة المتكررة', xpRecurringCapLabel: 'السقف اليومي',
    xpSectionSourceCaps: 'الحد الأقصى لكل مصدر (مثلاً أقصى عدد إدخالات رسم بياني لكل جلسة)',
    xpSectionSourceTotalCaps: 'السقف الكلي للنقاط لكل مصدر (مثلاً أقصى نقاط لكل صفقة)',
    xpSectionPeriodCaps: 'السقف الدوري لكل نوع', xpSectionAchievements: 'نقاط الإنجازات',
    xpSectionMastery: 'شروط اجتياز كل مستوى',
    marketplaceColTitle: 'العنوان', marketplaceColSeller: 'البائع', marketplaceColPrice: 'السعر', marketplaceColEvidence: 'الأدلة', marketplaceColStatus: 'الحالة', marketplaceColFeatured: 'مميّز',
    delistAction: 'إزالة من السوق', publishAction: 'نشر', featureAction: 'تمييز', unfeatureAction: 'إلغاء التمييز',
    statusFilterAll: 'الكل', statusFilterDraft: 'مسودة', statusFilterPublished: 'منشور', statusFilterDelisted: 'مُزال',
    financeMockRevenueTitle: 'إيراد السوق التجريبي', financeMockRevenueNote: 'تجريبي — غير متصل بأي معالج دفع حقيقي.',
    financeAiCostTitle: 'تقدير تكلفة الذكاء الاصطناعي (هذا الشهر)', financeBudgetTitle: 'الميزانية المتبقية (هذا الشهر)',
    noPricingSet: 'لا يوجد تسعير', noBudgetSet: 'لا توجد ميزانية', tokensUsedLabel: 'رمز مستخدم', remainingLabel: 'المتبقي', budgetOfLabel: 'من {budget}',
    gateError: 'تعذرت المتابعة.', gateErrorOffline: 'تعذر الوصول إلى الخادم. هل خادم المجتمع يعمل؟ (npm run dev:community-api)',
    backToApp: 'العودة إلى التطبيق', sidebarToggleLabel: 'فتح/إغلاق القائمة',
    statTotalUsers: 'إجمالي المستخدمين', statOnlineNow: 'متصل الآن', statProvidersConfigured: 'مزوّدون مُهيّؤون', statTotalListings: 'إجمالي الإعلانات', statPublishedListings: 'منشور', statFeaturedListings: 'مميّز',
    detailLoadFailed: 'تعذر تحميل تفاصيل المستخدم.', noEmail: 'لا يوجد بريد إلكتروني', noPhone: 'لا يوجد هاتف',
    kycStatusLabel: 'حالة التحقق (KYC)', kycNotStarted: 'لم تبدأ', kycPending: 'قيد المراجعة', kycVerified: 'موثّق', kycRejected: 'مرفوض', saveKyc: 'حفظ الحالة',
    profileRoleLabel: 'الدور المنتجي', profileRoleTrader: 'متداول', profileRoleMentor: 'موجّه', profileRoleTeacher: 'مدرّس',
    levelXpLabel: 'المستوى {level} · {xp} نقطة', achievementsLabel: 'الإنجازات', noAchievements: 'لا توجد إنجازات مفتوحة بعد.',
    subscriptionsLabel: 'الاشتراكات', noSubscriptions: 'لا توجد اشتراكات.', mockBadge: 'تجريبي', purchasedOnLabel: 'تم الشراء في {date}',
    aiHealthLabel: 'الحالة', statusHealthy: 'سليم', statusDegraded: 'غير مستقر', statusIdle: 'خامل', statusDisconnected: 'منقطع', statusUnconfigured: 'غير مهيّأ', statusUnknown: 'لم يُختبر بعد',
    aiTestNow: 'اختبار الآن', aiTestingNow: 'جارٍ الاختبار…', aiTestOk: 'الاتصال يعمل.', aiLastChecked: 'آخر فحص {date}', aiLastErrorLabel: 'آخر خطأ: {error}',
    voiceProvidersTitle: 'مزوّدو الصوت (ElevenLabs)', voiceProvidersHint: 'مفاتيح ElevenLabs وتوجيه الصوت لكل لغة، تديرها الإدارة - لوضع الصوت المباشر. تُطبَّق التغييرات فورًا دون الحاجة لإعادة النشر.',
    vpCredentialsTitle: 'ملفات المفاتيح', vpAddCredential: 'إضافة ملف مفتاح', vpLabelPlaceholder: 'اسم الملف (مثال: حساب ElevenLabs الرئيسي)', vpKeyPlaceholder: 'أدخل مفتاح API الخاص بـ ElevenLabs', vpReplaceKeyHint: 'اتركه فارغًا للاحتفاظ بالمفتاح الحالي', vpSaveCredential: 'حفظ الملف', vpNoCredentials: 'لا توجد ملفات مفاتيح بعد.',
    vpKeyHint: 'المفتاح ينتهي بـ {hint}', vpValidate: 'تحقّق', vpValidating: 'جارٍ التحقّق…', vpDelete: 'حذف', vpDeleteConfirm: 'هل تريد حذف ملف المفتاح هذا؟ أي لغة تستخدمه ستعود إلى الوضع الافتراضي حتى يتم اختيار ملف جديد.', vpDeleted: 'تم حذف المفتاح.',
    vpEnabled: 'مفعّل', vpDisabled: 'معطّل', vpValidationUnknown: 'لم يتم التحقّق بعد', vpValidationValid: 'صالح', vpValidationInvalid: 'غير صالح', vpValidationRestricted: 'مقيّد (صلاحيات/IP)', vpLastValidated: 'آخر تحقّق {date}', vpNeverValidated: 'لم يتم التحقّق مطلقًا',
    vpLanguagesTitle: 'توجيه اللغات', vpLanguageEnable: 'استخدام ElevenLabs لهذه اللغة', vpCredentialSelect: 'ملف المفتاح', vpNoCredentialSelected: 'لم يتم اختيار مفتاح',
    vpVoiceSearch: 'البحث عن الأصوات…', vpVoiceId: 'معرّف الصوت', vpLoadVoices: 'تحميل الأصوات', vpModelSelect: 'النموذج', vpLoadModels: 'تحميل النماذج', vpFallback: 'الاحتياطي من OpenAI', vpSaveLanguage: 'حفظ', vpSaved: 'تم الحفظ.',
    vpTestSample: 'إنشاء عيّنة اختبار', vpTestGenerating: 'جارٍ الإنشاء…', vpTestCreditsWarning: 'هذا سينشئ صوتًا حقيقيًا ويستهلك من رصيد ElevenLabs.', vpTestTextPlaceholder: 'نص عيّنة قصير',
    vpHealthTitle: 'الحالة والاستخدام', vpStatusReady: 'جاهز', vpStatusDisabled: 'معطّل', vpStatusUnconfigured: 'غير مُهيّأ', vpStatusInvalidCredential: 'مفتاح غير صالح', vpStatusDegraded: 'أداء متدهور',
    vpRequests24h: 'الطلبات (٢٤ ساعة)', vpSuccessRate: 'معدّل النجاح', vpAvgLatency: 'متوسط زمن الاستجابة', vpLastSuccess: 'آخر نجاح', vpLastError: 'آخر خطأ', vpNoUsageYet: 'لا يوجد استخدام بعد', vpValidateFirst: 'اختر مفتاحًا وتحقّق منه أولاً',
    vpQuotaRefresh: 'تحديث الحصة', vpQuotaTier: 'المستوى {tier}', vpQuotaCharacters: 'تم استخدام {used} من {limit} حرفًا', vpQuotaRemaining: '{count} متبقٍ (تقديري)', vpQuotaNextReset: 'إعادة الضبط في {date}', vpQuotaOverage: 'الاستخدام الزائد مسموح', vpQuotaUnavailable: 'الحصة غير متاحة', vpAnalyticsUnavailable: 'صلاحية عرض الاستخدام غير متاحة',
    aiTodayTokensLabel: 'اليوم', aiMonthTokensLabel: 'هذا الشهر', aiEstCostLabel: 'التكلفة التقديرية',
    aiTrendTitle: 'الاستخدام اليومي (آخر 14 يومًا)', aiTrendEmpty: 'لا يوجد استخدام في هذه الفترة بعد.',
    aiRecentEventsTitle: 'أحداث الذكاء الاصطناعي الأخيرة', aiRecentEventsEmpty: 'لا توجد استدعاءات مسجّلة بعد.',
    aiRecentColTime: 'الوقت', aiRecentColProvider: 'المزوّد', aiRecentColSource: 'المصدر', aiRecentColStatus: 'الحالة', aiRecentColLatency: 'زمن الاستجابة',
    aiTopUsersTitle: 'أكثر المستخدمين استهلاكًا للرموز', aiTopUsersEmpty: 'لا يوجد استخدام مسجل بعد.', aiTopUsersColUser: 'المستخدم', aiTopUsersColTokens: 'الرموز',
    usageByProviderLabel: 'استخدام الرموز حسب المزوّد', noProviderUsage: 'لا يوجد استخدام ذكاء اصطناعي مسجّل لهذا المستخدم بعد.'
  },
  es: {
    brand: 'Administración',
    loginHint: 'Inicia sesión con tu cuenta de administrador.', emailLabel: 'Correo electrónico', passwordLabel: 'Contraseña', loginSubmit: 'Iniciar sesión',
    gateErrorNotAdmin: 'Esta cuenta no tiene acceso de administrador.', gateErrorInvalidCredentials: 'Correo o contraseña incorrectos.',
    enforcementWarning: 'Advertencia: ADMIN_AUTH_ENFORCED no está configurado en el servidor - toda cuenta tiene acceso de administrador por ahora. Configura ADMIN_AUTH_ENFORCED=true.',
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
    xpStatTypes: 'Tipos de XP', xpStatOverridden: 'Valores personalizados', xpNoRows: 'Nada que mostrar.',
    xpColDefault: 'Predeterminado', xpColCurrent: 'Actual', xpColEdit: 'Editar', xpColType: 'Tipo', xpColDomain: 'Dominio',
    xpColAchievement: 'Logro', xpColLevel: 'Nivel', xpColRequirement: 'Requisito',
    xpResetDefault: 'Restablecer predeterminado', xpPeriodDay: 'por día', xpPeriodWeek: 'por semana',
    xpSectionPoints: 'Puntos de XP por tipo', xpSectionDomainCaps: 'Tope diario por dominio',
    xpSectionRecurringCap: 'Tope diario total de actividades recurrentes', xpRecurringCapLabel: 'Tope diario',
    xpSectionSourceCaps: 'Máximo por fuente (p. ej. máx. entradas de gráfico por sesión)',
    xpSectionSourceTotalCaps: 'Tope total de puntos por fuente (p. ej. máx. XP por operación)',
    xpSectionPeriodCaps: 'Tope periódico por tipo', xpSectionAchievements: 'Puntos de logros',
    xpSectionMastery: 'Requisitos de dominio (mastery) por nivel',
    marketplaceColTitle: 'Título', marketplaceColSeller: 'Vendedor', marketplaceColPrice: 'Precio', marketplaceColEvidence: 'Evidencia', marketplaceColStatus: 'Estado', marketplaceColFeatured: 'Destacado',
    delistAction: 'Retirar', publishAction: 'Publicar', featureAction: 'Destacar', unfeatureAction: 'Quitar destacado',
    statusFilterAll: 'Todos', statusFilterDraft: 'Borrador', statusFilterPublished: 'Publicado', statusFilterDelisted: 'Retirado',
    financeMockRevenueTitle: 'Ingresos simulados del mercado', financeMockRevenueNote: 'Simulado — sin procesador de pagos real conectado.',
    financeAiCostTitle: 'Costo estimado de IA (este mes)', financeBudgetTitle: 'Presupuesto restante (este mes)',
    noPricingSet: 'Sin tarifas configuradas', noBudgetSet: 'Sin presupuesto configurado', tokensUsedLabel: 'tokens usados', remainingLabel: 'restante', budgetOfLabel: 'de {budget}',
    gateError: 'No se pudo continuar.', gateErrorOffline: 'No se pudo conectar con el servidor. ¿Está corriendo el backend de comunidad? (npm run dev:community-api)',
    backToApp: 'Volver a la app', sidebarToggleLabel: 'Mostrar/ocultar menú',
    statTotalUsers: 'Usuarios totales', statOnlineNow: 'En línea ahora', statProvidersConfigured: 'Proveedores configurados', statTotalListings: 'Anuncios totales', statPublishedListings: 'Publicados', statFeaturedListings: 'Destacados',
    detailLoadFailed: 'No se pudieron cargar los detalles del usuario.', noEmail: 'Sin correo registrado', noPhone: 'Sin teléfono registrado',
    kycStatusLabel: 'Estado de verificación (KYC)', kycNotStarted: 'No iniciado', kycPending: 'En revisión', kycVerified: 'Verificado', kycRejected: 'Rechazado', saveKyc: 'Guardar estado',
    profileRoleLabel: 'Rol de producto', profileRoleTrader: 'Trader', profileRoleMentor: 'Mentor', profileRoleTeacher: 'Profesor',
    levelXpLabel: 'Nivel {level} · {xp} XP', achievementsLabel: 'Logros', noAchievements: 'Aún no hay logros desbloqueados.',
    subscriptionsLabel: 'Suscripciones', noSubscriptions: 'Sin suscripciones.', mockBadge: 'simulado', purchasedOnLabel: 'Comprado el {date}',
    aiHealthLabel: 'Estado', statusHealthy: 'Saludable', statusDegraded: 'Inestable', statusIdle: 'Inactivo', statusDisconnected: 'Desconectado', statusUnconfigured: 'No configurado', statusUnknown: 'Aún no probado',
    aiTestNow: 'Probar ahora', aiTestingNow: 'Probando…', aiTestOk: 'Conexión correcta.', aiLastChecked: 'Última verificación {date}', aiLastErrorLabel: 'Último error: {error}',
    voiceProvidersTitle: 'Proveedores de voz (ElevenLabs)', voiceProvidersHint: 'Credenciales de ElevenLabs y enrutamiento de voz por idioma, gestionados por el administrador, para el Modo de Voz en vivo. Los cambios se aplican de inmediato, sin necesidad de reimplementar.',
    vpCredentialsTitle: 'Perfiles de credenciales', vpAddCredential: 'Añadir perfil de credencial', vpLabelPlaceholder: 'Nombre del perfil (p. ej., Cuenta principal de ElevenLabs)', vpKeyPlaceholder: 'Introduce la clave API de ElevenLabs', vpReplaceKeyHint: 'Déjalo vacío para conservar la clave actual', vpSaveCredential: 'Guardar perfil', vpNoCredentials: 'Aún no hay perfiles de credenciales.',
    vpKeyHint: 'La clave termina en {hint}', vpValidate: 'Validar', vpValidating: 'Validando…', vpDelete: 'Eliminar', vpDeleteConfirm: '¿Eliminar este perfil de credencial? Cualquier idioma que lo use volverá al estado predeterminado hasta que se seleccione un nuevo perfil.', vpDeleted: 'Clave eliminada.',
    vpEnabled: 'Habilitado', vpDisabled: 'Deshabilitado', vpValidationUnknown: 'Aún no validado', vpValidationValid: 'Válido', vpValidationInvalid: 'No válido', vpValidationRestricted: 'Restringido (permisos/IP)', vpLastValidated: 'Última validación {date}', vpNeverValidated: 'Nunca validado',
    vpLanguagesTitle: 'Enrutamiento de idiomas', vpLanguageEnable: 'Usar ElevenLabs para este idioma', vpCredentialSelect: 'Perfil de credencial', vpNoCredentialSelected: 'Ninguna credencial seleccionada',
    vpVoiceSearch: 'Buscar voces…', vpVoiceId: 'ID de voz', vpLoadVoices: 'Cargar voces', vpModelSelect: 'Modelo', vpLoadModels: 'Cargar modelos', vpFallback: 'Alternativa de OpenAI', vpSaveLanguage: 'Guardar', vpSaved: 'Guardado.',
    vpTestSample: 'Generar muestra de prueba', vpTestGenerating: 'Generando…', vpTestCreditsWarning: 'Esto generará audio real y consumirá créditos de ElevenLabs.', vpTestTextPlaceholder: 'Texto corto de muestra',
    vpHealthTitle: 'Estado y uso', vpStatusReady: 'Listo', vpStatusDisabled: 'Deshabilitado', vpStatusUnconfigured: 'Sin configurar', vpStatusInvalidCredential: 'Credencial no válida', vpStatusDegraded: 'Degradado',
    vpRequests24h: 'Solicitudes (24 h)', vpSuccessRate: 'Tasa de éxito', vpAvgLatency: 'Latencia media', vpLastSuccess: 'Último éxito', vpLastError: 'Último error', vpNoUsageYet: 'Aún no hay uso registrado', vpValidateFirst: 'Primero selecciona y valida una credencial',
    vpQuotaRefresh: 'Actualizar cuota', vpQuotaTier: 'Nivel {tier}', vpQuotaCharacters: '{used} / {limit} caracteres usados', vpQuotaRemaining: '{count} restantes (nominal)', vpQuotaNextReset: 'Se reinicia el {date}', vpQuotaOverage: 'Excedente permitido', vpQuotaUnavailable: 'Cuota no disponible', vpAnalyticsUnavailable: 'Permiso de uso no disponible',
    aiTodayTokensLabel: 'Hoy', aiMonthTokensLabel: 'Este mes', aiEstCostLabel: 'Costo estimado',
    aiTrendTitle: 'Uso diario (últimos 14 días)', aiTrendEmpty: 'Aún no hay uso en este período.',
    aiRecentEventsTitle: 'Eventos recientes de IA', aiRecentEventsEmpty: 'Aún no hay llamadas registradas.',
    aiRecentColTime: 'Hora', aiRecentColProvider: 'Proveedor', aiRecentColSource: 'Origen', aiRecentColStatus: 'Estado', aiRecentColLatency: 'Latencia',
    aiTopUsersTitle: 'Usuarios con mayor uso de tokens', aiTopUsersEmpty: 'Aún no hay uso registrado.', aiTopUsersColUser: 'Usuario', aiTopUsersColTokens: 'Tokens',
    usageByProviderLabel: 'Uso de tokens por proveedor', noProviderUsage: 'Aún no hay uso de IA registrado para este usuario.'
  }
};

const languageNames = { en: 'English', fa: 'فارسی', ar: 'العربية', es: 'Español' };
// Phase 8e of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section): this page authenticates separately from the character pages (its own
// admin-role check, Section 7.16) and a language choice here was never meaningfully tied to a
// specific trader's own preference either way - hardcoded to the same default this page already
// used ('en', confirmed from the removed localStorage fallback and from
// <html lang="en" dir="ltr">'s own first-paint default) rather than migrated. The language picker
// still works for the rest of this one page load, it just never persists across a reload any
// more (nothing replaces the old tradejournal-language key on this page).
let activeLanguage = 'en';

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
  const toggle = document.querySelector('#sidebarToggle');
  if (toggle) toggle.setAttribute('aria-label', t('sidebarToggleLabel'));
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
function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
// Gentelella-style "tile" stat cards - every value passed in must already be real, computed
// from the same response the table/cards below it render from. Never call this with an
// invented number.
function statCard(iconName, value, label) {
  const card = el('div', 'admin-stat-card');
  const iconWrap = el('div', 'admin-stat-icon');
  if (window.TradeJournalIcons) iconWrap.append(window.TradeJournalIcons.icon(iconName));
  const text = el('div');
  text.append(el('p', 'admin-stat-value', String(value)), el('p', 'admin-stat-label', label));
  card.append(iconWrap, text);
  return card;
}
function statRow(cards) { const row = el('div', 'admin-stat-row'); row.append(...cards); return row; }
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
    // The list row is a lightweight shape (server/admin/routes.mjs's GET /users) - it has no
    // kyc/profileRole/level/achievements/subscriptions. The expanded detail row needs the fully
    // enriched GET /users/:id response instead, fetched once here rather than per-row.
    const detailPromise = usersState.expanded ? api('/users/' + usersState.expanded).catch(() => null) : Promise.resolve(null);
    return detailPromise.then((detail) => buildUsersTabBody(data, detail));
  });
}
function buildUsersTabBody(data, detail) {
    const wrap = el('div');
    wrap.append(statRow([
      statCard('users', fmtNumber(data.total), t('statTotalUsers')),
      statCard('wifi', fmtNumber(data.onlineCount || 0), t('statOnlineNow'))
    ]));
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
      if (usersState.expanded === user.id) tbody.append(userDetailRow(detail, columns.length));
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
}
function cell(text) { const td = document.createElement('td'); td.textContent = text; return td; }
function onlineCell(isOnline) {
  const td = document.createElement('td');
  const dot = el('span', 'online-dot' + (isOnline ? ' online' : ''));
  td.append(dot, document.createTextNode(' ' + (isOnline ? t('online') : t('offline'))));
  return td;
}
function humanizeAchievementKey(key) { return String(key || '').split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '); }
// `user` here is the fully-enriched GET /api/admin/users/:id response (identity, kyc,
// profileRole, xpTotal, level, achievements, subscriptions) - null if that fetch failed.
function userDetailRow(user, colSpan) {
  const row = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = colSpan;
  if (!user) {
    td.append(el('p', 'error-text', t('detailLoadFailed')));
    row.append(td);
    return row;
  }
  const box = el('div', 'admin-card admin-user-detail');

  const identity = el('div', 'admin-user-identity');
  if (user.avatarDataUrl) { const img = document.createElement('img'); img.className = 'admin-user-avatar'; img.src = user.avatarDataUrl; img.alt = ''; identity.append(img); }
  identity.append(el('p', '', user.email || t('noEmail')), el('p', 'hint', user.phone || t('noPhone')));
  box.append(identity);

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

  box.append(el('p', 'hint', t('profileRoleLabel') + ': ' + t('profileRole' + user.profileRole.charAt(0).toUpperCase() + user.profileRole.slice(1))));

  const kycField = el('label', 'field');
  kycField.append(el('span', '', t('kycStatusLabel')));
  const kycSelect = document.createElement('select');
  ['not_started', 'pending', 'verified', 'rejected'].forEach((status) => kycSelect.append(new Option(t('kyc' + status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')), status, false, user.kycStatus === status)));
  kycField.append(kycSelect);
  const saveKycBtn = el('button', 'btn btn-secondary', t('saveKyc'));
  saveKycBtn.type = 'button';
  saveKycBtn.onclick = () => {
    api('/users/' + user.id + '/kyc', { method: 'PATCH', body: JSON.stringify({ kycStatus: kycSelect.value }) })
      .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
  };
  box.append(kycField, saveKycBtn);

  const rules = window.TradeJournalProfileXPRules;
  const levelLine = el('p', '', t('levelXpLabel', { level: rules ? rules.levelForXp(user.xpTotal) : user.level, xp: fmtNumber(user.xpTotal) }));
  box.append(levelLine);

  // Section 7.16 follow-up: this user's AI token usage, broken down by provider - the list row
  // above only ever showed the one lifetime total (colTokensUsed).
  box.append(el('h3', '', t('usageByProviderLabel')));
  if (!user.usageByProvider || !user.usageByProvider.length) {
    box.append(el('p', 'hint', t('noProviderUsage')));
  } else {
    const usageList = document.createElement('ul');
    user.usageByProvider.forEach((row) => { const li = document.createElement('li'); li.textContent = row.provider + ': ' + fmtNumber(row.totalTokens) + ' ' + t('tokensUsedLabel'); usageList.append(li); });
    box.append(usageList);
  }

  box.append(el('h3', '', t('achievementsLabel')));
  if (!user.achievements || !user.achievements.length) {
    box.append(el('p', 'hint', t('noAchievements')));
  } else {
    const achList = document.createElement('ul');
    user.achievements.forEach((achievement) => { const li = document.createElement('li'); li.textContent = humanizeAchievementKey(achievement.achievementKey) + ' — ' + fmtDate(achievement.unlockedAt); achList.append(li); });
    box.append(achList);
  }

  box.append(el('h3', '', t('subscriptionsLabel')));
  if (!user.subscriptions || !user.subscriptions.length) {
    box.append(el('p', 'hint', t('noSubscriptions')));
  } else {
    const subList = document.createElement('ul');
    user.subscriptions.forEach((sub) => {
      const li = document.createElement('li');
      li.textContent = (sub.listing ? sub.listing.title : sub.listingId) + ' — ' + t('purchasedOnLabel', { date: fmtDate(sub.purchasedAt) }) + ' (' + t('mockBadge') + ')';
      subList.append(li);
    });
    box.append(subList);
  }

  td.append(box);
  row.append(td);
  return row;
}

// --- AI tab ---

const KNOWN_PROVIDERS = ['openai', 'anthropic', 'kimi', 'deepseek'];

// Section 7.16 follow-up: the AI tab now also surfaces per-provider health (is it actually
// working right now, or did it just disconnect - GET /ai/health, Part 1), this-month cost
// (reusing /finance/overview's real cost math instead of duplicating it), a 14-day usage trend,
// a recent-events feed, and a top-users-by-tokens table (GET /users sorted server-side, the
// exact same endpoint/sort the Users tab already offers - no new join logic needed here).
function aiTab() {
  // Keys/pricing are the tab's original, load-bearing functionality - a failure there still
  // shows the generic error card (errorNode()), same as before. The four newer sections
  // (usage/health/finance/topUsers) are each independently allowed to fail - e.g. the DB
  // migration for ai_provider_health_events not having run yet on this environment - without
  // taking down key/pricing management, which an operator may urgently need regardless.
  return Promise.all([
    api('/ai/keys'), api('/ai/pricing'),
    api('/ai/usage?days=14').catch(() => ({ byProviderAndDay: [], byUser: {}, days: 14 })),
    api('/ai/health').catch(() => ({ providers: [], recent: [] })),
    api('/finance/overview').catch(() => ({ mockRevenue: { total: 0, mock: true }, aiCostByProvider: [], remainingBudgetByProvider: [] })),
    api('/users?sort=totalTokensUsed&dir=desc&pageSize=10&page=1').catch(() => ({ users: [] })),
    // Voice Providers (ElevenLabs) - independently allowed to fail, same posture as the four
    // sections above: an operator managing LLM keys must not be blocked by a voice-provider
    // migration not having run yet on this environment.
    api('/voice-providers/credentials').catch(() => []),
    api('/voice-providers/languages').catch(() => []),
    api('/voice-providers/health').catch(() => ({ languages: [] }))
  ]).then(([keys, pricing, usage, health, finance, topUsers, vpCredentials, vpLanguages, vpHealth]) => {
    const wrap = el('div');
    wrap.append(statRow([statCard('key-round', keys.filter((k) => k.isSet).length + ' / ' + KNOWN_PROVIDERS.length, t('statProvidersConfigured'))]));
    const grid = el('div', 'admin-grid');
    const keyByProvider = {}; keys.forEach((k) => { keyByProvider[k.provider] = k; });
    const pricingByProvider = {}; pricing.forEach((p) => { pricingByProvider[p.provider] = p; });
    const healthByProvider = {}; (health.providers || []).forEach((p) => { healthByProvider[p.provider] = p; });
    const costByProvider = {}; (finance.aiCostByProvider || []).forEach((p) => { costByProvider[p.provider] = p; });
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayTokensByProvider = {};
    (usage.byProviderAndDay || []).forEach((row) => {
      const dayKey = new Date(row.day).toISOString().slice(0, 10);
      todayTokensByProvider[row.provider] = (todayTokensByProvider[row.provider] || 0) + (dayKey === todayKey ? row.totalTokens : 0);
    });

    KNOWN_PROVIDERS.forEach((provider) => {
      const card = el('div', 'admin-card');
      const headRow = el('div', 'admin-ai-card-head');
      headRow.append(el('h3', '', provider));
      const healthRow = healthByProvider[provider] || { status: 'unconfigured', lastEventAt: null, lastErrorCode: null };
      const statusKey = 'status' + healthRow.status.charAt(0).toUpperCase() + healthRow.status.slice(1);
      headRow.append(el('span', 'badge status-' + healthRow.status, t(statusKey)));
      card.append(headRow);

      if (healthRow.lastEventAt) card.append(el('p', 'hint', t('aiLastChecked', { date: fmtDate(healthRow.lastEventAt) })));
      if (healthRow.status === 'disconnected' && healthRow.lastErrorCode) card.append(el('p', 'error-text', t('aiLastErrorLabel', { error: healthRow.lastErrorCode })));

      const testBtn = el('button', 'btn btn-secondary btn-sm', t('aiTestNow'));
      testBtn.type = 'button';
      testBtn.onclick = () => {
        testBtn.disabled = true; testBtn.textContent = t('aiTestingNow');
        // No apiKey override sent - resolves through the same admin-configured/env tier a real
        // trader call would use, so this is a genuine end-to-end check, not just a UI ping.
        fetch('/api/ai/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, apiKey: '', model: '' }) })
          .then((response) => response.json().catch(() => ({})).then((body) => { if (!response.ok || !body.ok) throw new Error(body.error || 'FAILED'); }))
          .then(() => showToast(t('aiTestOk')))
          .catch((error) => showToast(error.message, 'danger'))
          .finally(() => renderTab());
      };
      card.append(testBtn);

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

      const costRow = costByProvider[provider] || { tokensUsed: 0, cost: null };
      const usageLine = el('p', 'hint');
      usageLine.textContent = t('aiTodayTokensLabel') + ': ' + fmtNumber(todayTokensByProvider[provider] || 0)
        + ' · ' + t('aiMonthTokensLabel') + ': ' + fmtNumber(costRow.tokensUsed)
        + ' · ' + t('aiEstCostLabel') + ': ' + (costRow.cost === null ? t('noPricingSet') : fmtNumber(costRow.cost));
      card.append(usageLine);

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

    wrap.append(voiceProvidersSection({ credentials: vpCredentials, languages: vpLanguages, health: vpHealth }));

    const chartCard = el('div', 'admin-card');
    chartCard.append(el('h3', '', t('aiTrendTitle')));
    // One bar per day (last 14 days), summed across every provider - a single trend line the
    // reader can scan for "did usage fall off a cliff", not a per-provider breakdown (that's
    // already the all-time-by-provider chart below).
    const totalsByDay = {};
    (usage.byProviderAndDay || []).forEach((row) => {
      const dayKey = new Date(row.day).toISOString().slice(0, 10);
      totalsByDay[dayKey] = (totalsByDay[dayKey] || 0) + row.totalTokens;
    });
    const trendBars = Object.keys(totalsByDay).sort().map((day) => ({ label: day.slice(5), value: totalsByDay[day] }));
    if (!trendBars.length) {
      chartCard.append(el('p', 'hint', t('aiTrendEmpty')));
    } else {
      const trendCanvas = document.createElement('canvas');
      trendCanvas.width = 720; trendCanvas.height = 260;
      chartCard.append(trendCanvas);
      setTimeout(() => drawBarChart(trendCanvas, trendBars), 0);
    }
    wrap.append(chartCard);

    const allTimeCard = el('div', 'admin-card');
    allTimeCard.append(el('h3', '', t('usageChartTitle')));
    const totalsByProvider = {};
    (usage.byProviderAndDay || []).forEach((row) => { totalsByProvider[row.provider] = (totalsByProvider[row.provider] || 0) + row.totalTokens; });
    const bars = KNOWN_PROVIDERS.map((provider) => ({ label: provider, value: totalsByProvider[provider] || 0 }));
    if (!bars.some((b) => b.value > 0)) {
      allTimeCard.append(el('p', 'hint', t('usageChartEmpty')));
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = 720; canvas.height = 260;
      allTimeCard.append(canvas);
      setTimeout(() => drawBarChart(canvas, bars), 0);
    }
    wrap.append(allTimeCard);

    const recentCard = el('div', 'admin-card');
    recentCard.append(el('h3', '', t('aiRecentEventsTitle')));
    if (!health.recent || !health.recent.length) {
      recentCard.append(el('p', 'hint', t('aiRecentEventsEmpty')));
    } else {
      const table = document.createElement('table');
      table.className = 'admin-table';
      const thead = document.createElement('tr');
      [t('aiRecentColTime'), t('aiRecentColProvider'), t('aiRecentColSource'), t('aiRecentColStatus'), t('aiRecentColLatency')]
        .forEach((label) => thead.append(el('th', '', label)));
      const theadWrap = document.createElement('thead'); theadWrap.append(thead); table.append(theadWrap);
      const tbody = document.createElement('tbody');
      health.recent.forEach((event) => {
        const row = document.createElement('tr');
        row.append(cell(fmtDate(event.createdAt)), cell(event.provider), cell(event.source || '—'));
        const statusTd = document.createElement('td');
        statusTd.append(el('span', 'badge status-' + (event.ok ? 'healthy' : 'disconnected'), event.ok ? t('statusHealthy') : (event.errorCode || t('statusDisconnected'))));
        row.append(statusTd);
        row.append(cell(event.latencyMs == null ? '—' : fmtNumber(event.latencyMs) + ' ms'));
        tbody.append(row);
      });
      table.append(tbody);
      const tableWrap = el('div', 'admin-table-wrap');
      tableWrap.append(table);
      recentCard.append(tableWrap);
    }
    wrap.append(recentCard);

    const topUsersCard = el('div', 'admin-card');
    topUsersCard.append(el('h3', '', t('aiTopUsersTitle')));
    const topUserRows = (topUsers.users || []).filter((row) => row.totalTokensUsed > 0);
    if (!topUserRows.length) {
      topUsersCard.append(el('p', 'hint', t('aiTopUsersEmpty')));
    } else {
      const table = document.createElement('table');
      table.className = 'admin-table';
      const thead = document.createElement('tr');
      [t('aiTopUsersColUser'), t('aiTopUsersColTokens')].forEach((label) => thead.append(el('th', '', label)));
      const theadWrap = document.createElement('thead'); theadWrap.append(thead); table.append(theadWrap);
      const tbody = document.createElement('tbody');
      topUserRows.forEach((row) => { const tr = document.createElement('tr'); tr.append(cell(row.displayName), cell(fmtNumber(row.totalTokensUsed))); tbody.append(tr); });
      table.append(tbody);
      const tableWrap = el('div', 'admin-table-wrap');
      tableWrap.append(table);
      topUsersCard.append(tableWrap);
    }
    wrap.append(topUsersCard);

    return wrap;
  });
}

// --- Voice Providers (ElevenLabs) admin section ---
// Admin-managed credentials + per-language voice routing for the live Voice Mode (see
// server/admin/routes.voice-providers.mjs). Every save here takes effect in the live Voice Mode
// without a redeploy - server/community/routes.internal.mjs's /internal/voice-provider-config
// bridge picks up the change via a Redis-backed version bump on every write. This section is
// independent of KNOWN_PROVIDERS (never one of the LLM token/pricing providers above) and never
// re-displays a stored key - only a masked last-4-characters hint (keyHint) ever comes back.
function voiceProvidersSection(data) {
  const credentials = data.credentials || [];
  const languages = data.languages || [];
  const healthByLanguage = {};
  (data.health.languages || []).forEach((row) => { healthByLanguage[row.languageCode] = row; });

  const section = el('div');
  section.append(el('h3', '', t('voiceProvidersTitle')));
  section.append(el('p', 'hint', t('voiceProvidersHint')));

  const credCard = el('div', 'admin-card');
  credCard.append(el('h3', '', t('vpCredentialsTitle')));
  if (!credentials.length) credCard.append(el('p', 'hint', t('vpNoCredentials')));
  const credGrid = el('div', 'admin-grid');
  credentials.forEach((cred) => credGrid.append(voiceCredentialCard(cred)));
  credCard.append(credGrid);

  const labelField = field(t('vpLabelPlaceholder'), 'text', '');
  const keyField = field(t('vpKeyPlaceholder'), 'password', '');
  const saveCredBtn = el('button', 'btn btn-primary btn-sm', t('vpSaveCredential'));
  saveCredBtn.type = 'button';
  saveCredBtn.onclick = () => {
    const label = labelField.input.value.trim();
    const apiKey = keyField.input.value.trim();
    if (!label || !apiKey) return;
    keyField.input.value = ''; // clear immediately - never let the raw key linger in the DOM
    saveCredBtn.disabled = true;
    api('/voice-providers/credentials', { method: 'POST', body: JSON.stringify({ label, apiKey }) })
      .then(() => renderTab())
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { saveCredBtn.disabled = false; });
  };
  credCard.append(labelField.wrap, keyField.wrap, el('p', 'hint', t('vpReplaceKeyHint')), saveCredBtn);
  section.append(credCard);

  const langCard = el('div', 'admin-card');
  langCard.append(el('h3', '', t('vpLanguagesTitle')));
  const langGrid = el('div', 'admin-grid');
  languages.forEach((config) => langGrid.append(voiceLanguageCard(config, credentials, healthByLanguage[config.languageCode])));
  langCard.append(langGrid);
  section.append(langCard);

  return section;
}

function voiceCredentialCard(cred) {
  const card = el('div', 'admin-card');
  const head = el('div', 'admin-ai-card-head');
  head.append(el('h3', '', cred.label));
  const validationKey = 'vpValidation' + cred.validationStatus.charAt(0).toUpperCase() + cred.validationStatus.slice(1);
  head.append(el('span', 'badge status-' + cred.validationStatus, t(validationKey)));
  card.append(head);
  card.append(el('p', 'hint', t('vpKeyHint', { hint: cred.keyHint })));
  card.append(el('p', 'hint', cred.validatedAt ? t('vpLastValidated', { date: fmtDate(cred.validatedAt) }) : t('vpNeverValidated')));

  const quotaLine = el('p', 'hint');
  quotaLine.hidden = true;
  card.append(quotaLine);

  const btnRow = el('div', 'admin-btn-row');
  const validateBtn = el('button', 'btn btn-secondary btn-sm', t('vpValidate'));
  validateBtn.type = 'button';
  validateBtn.onclick = () => {
    validateBtn.disabled = true; validateBtn.textContent = t('vpValidating');
    api('/voice-providers/credentials/' + cred.id + '/validate', { method: 'POST' })
      .then(() => renderTab())
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { validateBtn.disabled = false; validateBtn.textContent = t('vpValidate'); });
  };
  // Lazy, click-triggered only - never fetched eagerly for every credential on tab load, since
  // that would spend an upstream call the admin never asked for on every page view.
  const quotaBtn = el('button', 'btn btn-secondary btn-sm', t('vpQuotaRefresh'));
  quotaBtn.type = 'button';
  quotaBtn.onclick = () => {
    quotaBtn.disabled = true;
    api('/voice-providers/credentials/' + cred.id + '/subscription')
      .then((sub) => {
        quotaLine.hidden = false;
        quotaLine.textContent = [
          sub.tier ? t('vpQuotaTier', { tier: sub.tier }) : null,
          sub.characterLimit != null ? t('vpQuotaCharacters', { used: fmtNumber(sub.characterCount), limit: fmtNumber(sub.characterLimit) }) : null,
          sub.nominalRemainingAllowance != null ? t('vpQuotaRemaining', { count: fmtNumber(sub.nominalRemainingAllowance) }) : null,
          sub.nextResetUnix ? t('vpQuotaNextReset', { date: fmtDate(new Date(sub.nextResetUnix * 1000).toISOString()) }) : null,
          sub.overageEnabled ? t('vpQuotaOverage') : null
        ].filter(Boolean).join(' · ') || t('vpQuotaUnavailable');
      })
      .catch((error) => {
        quotaLine.hidden = false;
        quotaLine.textContent = error && error.message === 'RESTRICTED_SCOPE' ? t('vpAnalyticsUnavailable') : t('vpQuotaUnavailable');
      })
      .finally(() => { quotaBtn.disabled = false; });
  };
  const deleteBtn = el('button', 'btn btn-danger btn-sm', t('vpDelete'));
  deleteBtn.type = 'button';
  deleteBtn.onclick = () => {
    if (!window.confirm(t('vpDeleteConfirm'))) return;
    api('/voice-providers/credentials/' + cred.id, { method: 'DELETE' })
      .then(() => { showToast(t('vpDeleted')); renderTab(); })
      .catch((error) => showToast(error.message, 'danger'));
  };
  btnRow.append(validateBtn, quotaBtn, deleteBtn);
  card.append(btnRow);
  return card;
}

function voiceLanguageCard(config, credentials, healthRow) {
  const card = el('div', 'admin-card');
  const head = el('div', 'admin-ai-card-head');
  head.append(el('h3', '', languageNames[config.languageCode] || config.languageCode));
  const status = (healthRow && healthRow.status) || (config.enabled ? 'unconfigured' : 'disabled');
  const statusKey = 'vpStatus' + status.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  head.append(el('span', 'badge status-' + status, t(statusKey)));
  card.append(head);

  const enableLabel = el('label', 'field-check');
  const enableCheckbox = document.createElement('input');
  enableCheckbox.type = 'checkbox'; enableCheckbox.checked = Boolean(config.enabled);
  enableLabel.append(enableCheckbox, document.createTextNode(t('vpLanguageEnable')));
  card.append(enableLabel);

  const credentialSelect = selectField(t('vpCredentialSelect'),
    [{ value: '', text: t('vpNoCredentialSelected') }].concat(credentials.map((c) => ({ value: c.id, text: c.label }))),
    config.credentialId || '');
  card.append(credentialSelect.wrap);

  const voiceIdField = field(t('vpVoiceId'), 'text', config.voiceId || '');
  const voiceDatalist = document.createElement('datalist');
  const voiceDatalistId = 'vp-voices-' + config.languageCode;
  voiceDatalist.id = voiceDatalistId;
  voiceIdField.input.setAttribute('list', voiceDatalistId);
  voiceIdField.input.placeholder = t('vpVoiceSearch');
  voiceIdField.wrap.append(voiceDatalist);
  // Search-and-select via the native datalist (populated below) that still allows free-text
  // manual entry in the same input - satisfies both "searchable voice selector" and "manual
  // voice ID entry" without two fields that could drift out of sync with each other.
  const loadVoicesBtn = el('button', 'btn btn-secondary btn-sm', t('vpLoadVoices'));
  loadVoicesBtn.type = 'button';
  loadVoicesBtn.onclick = () => {
    if (!credentialSelect.select.value) { showToast(t('vpNoCredentialSelected'), 'danger'); return; }
    loadVoicesBtn.disabled = true;
    api('/voice-providers/voices?credentialId=' + encodeURIComponent(credentialSelect.select.value))
      .then((voices) => {
        voiceDatalist.innerHTML = '';
        voices.forEach((voice) => {
          const opt = document.createElement('option');
          opt.value = voice.voiceId; opt.label = voice.name;
          voiceDatalist.append(opt);
        });
      })
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { loadVoicesBtn.disabled = false; });
  };
  card.append(voiceIdField.wrap, loadVoicesBtn);

  const modelSelect = selectField(t('vpModelSelect'),
    config.modelId ? [{ value: config.modelId, text: config.modelId }] : [{ value: '', text: '—' }], config.modelId || '');
  const loadModelsBtn = el('button', 'btn btn-secondary btn-sm', t('vpLoadModels'));
  loadModelsBtn.type = 'button';
  loadModelsBtn.onclick = () => {
    if (!credentialSelect.select.value) { showToast(t('vpNoCredentialSelected'), 'danger'); return; }
    loadModelsBtn.disabled = true;
    api('/voice-providers/models?credentialId=' + encodeURIComponent(credentialSelect.select.value))
      .then((models) => {
        const current = modelSelect.select.value;
        modelSelect.select.innerHTML = '';
        models.forEach((model) => {
          const opt = document.createElement('option');
          opt.value = model.modelId; opt.textContent = model.name;
          modelSelect.select.append(opt);
        });
        if (models.some((m) => m.modelId === current)) modelSelect.select.value = current;
      })
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { loadModelsBtn.disabled = false; });
  };
  card.append(modelSelect.wrap, loadModelsBtn);

  card.append(el('p', 'hint', t('vpFallback') + ': ' + (config.fallbackProvider || 'openai') + (config.fallbackVoice ? ' (' + config.fallbackVoice + ')' : '')));

  const saveBtn = el('button', 'btn btn-primary btn-sm', t('vpSaveLanguage'));
  saveBtn.type = 'button';
  saveBtn.onclick = () => {
    saveBtn.disabled = true;
    api('/voice-providers/languages/' + config.languageCode, { method: 'PUT', body: JSON.stringify({
      enabled: enableCheckbox.checked,
      credentialId: credentialSelect.select.value || null,
      voiceId: voiceIdField.input.value.trim() || null,
      modelId: modelSelect.select.value || null
    }) })
      .then(() => { showToast(t('vpSaved')); renderTab(); })
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { saveBtn.disabled = false; });
  };
  card.append(saveBtn);

  // Short paid test sample - a fresh explicit click every time, never triggered just by loading
  // this card or by saving the config above (mission: never spend credits without an explicit
  // admin action, and always show the credits warning right next to the trigger).
  const testTextField = field(t('vpTestTextPlaceholder'), 'text', '');
  if (config.languageCode === 'fa' || config.languageCode === 'ar') testTextField.input.dir = 'rtl';
  card.append(el('p', 'hint', t('vpTestCreditsWarning')), testTextField.wrap);
  const testBtn = el('button', 'btn btn-secondary btn-sm', t('vpTestSample'));
  testBtn.type = 'button';
  const testAudio = document.createElement('audio');
  testAudio.controls = true; testAudio.className = 'admin-voice-test-audio'; testAudio.hidden = true;
  testBtn.onclick = () => {
    const text = testTextField.input.value.trim();
    const credentialId = credentialSelect.select.value;
    const voiceId = voiceIdField.input.value.trim();
    const modelId = modelSelect.select.value;
    if (!text || !credentialId || !voiceId || !modelId) { showToast(t('vpValidateFirst'), 'danger'); return; }
    testBtn.disabled = true; testBtn.textContent = t('vpTestGenerating');
    api('/voice-providers/test-sample', { method: 'POST', body: JSON.stringify({ languageCode: config.languageCode, credentialId, voiceId, modelId, text }) })
      .then((body) => {
        testAudio.src = 'data:' + body.mimeType + ';base64,' + body.audioBase64;
        testAudio.hidden = false;
        if (typeof testAudio.play === 'function') testAudio.play().catch(() => {});
      })
      .catch((error) => showToast(error.message, 'danger'))
      .finally(() => { testBtn.disabled = false; testBtn.textContent = t('vpTestSample'); });
  };
  card.append(testBtn, testAudio);

  if (healthRow) {
    const requestCount = healthRow.last24h.requestCount;
    card.append(el('p', 'hint',
      t('vpRequests24h') + ': ' + fmtNumber(requestCount)
      + (requestCount > 0
        ? ' · ' + t('vpSuccessRate') + ': ' + (healthRow.last24h.successRatePercent == null ? '—' : healthRow.last24h.successRatePercent + '%')
          + ' · ' + t('vpAvgLatency') + ': ' + fmtNumber(Math.round(healthRow.last24h.avgLatencyMs)) + ' ms'
        : ' (' + t('vpNoUsageYet') + ')')));
    if (healthRow.last24h.lastSuccessAt) card.append(el('p', 'hint', t('vpLastSuccess') + ': ' + fmtDate(healthRow.last24h.lastSuccessAt)));
    if (healthRow.last24h.lastErrorCode) card.append(el('p', 'hint', t('vpLastError') + ': ' + healthRow.last24h.lastErrorCode));
  }

  return card;
}

function selectField(label, options, value) {
  const wrap = el('label', 'field');
  wrap.append(el('span', '', label));
  const select = document.createElement('select');
  options.forEach((opt) => {
    const node = document.createElement('option');
    node.value = opt.value; node.textContent = opt.text;
    select.append(node);
  });
  select.value = value || '';
  wrap.append(select);
  return { wrap, select };
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

// --- XP & Segmentation tab ---
// Real, DB-backed rule editing (Section 11's XP engine) - every number the engine reads
// (POST /me/xp-events, GET /me/mastery, achievement unlock) is listed here alongside its code
// default and whether it's currently overridden. Only the NUMBER is ever editable per row - the
// verification logic behind each type/achievement/requirement stays in code (see
// server/community/xp-config.mjs's header comment on that boundary), so this tab can never let
// an admin invent a brand-new, unverified XP source.

// Builds one editable table: `leadColumns` render the identifying cells (type/domain, etc.),
// then Default | Current | an editable input (+ a period selector when isPeriod) | Save | Reset.
// Reset is disabled once a row is no longer overridden - nothing to reset back to.
function xpConfigTable(title, rows, leadColumns, category, keyFor, opts) {
  opts = opts || {};
  const card = el('div', 'admin-card admin-xp-section');
  card.append(el('h3', '', title));
  if (!rows.length) { card.append(el('p', 'hint', t('xpNoRows'))); return card; }
  const table = document.createElement('table');
  table.className = 'admin-table';
  const thead = document.createElement('tr');
  leadColumns.forEach((col) => thead.append(el('th', '', col.label)));
  [t('xpColDefault'), t('xpColCurrent'), t('xpColEdit'), ''].forEach((label) => thead.append(el('th', '', label)));
  const theadWrap = document.createElement('thead'); theadWrap.append(thead);
  table.append(theadWrap);
  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.overridden) tr.className = 'admin-xp-overridden';
    leadColumns.forEach((col) => tr.append(el('td', '', col.render(row))));
    tr.append(el('td', 'navrya-tabular', opts.formatValue ? opts.formatValue(row.default) : fmtNumber(row.default)));
    tr.append(el('td', 'navrya-tabular', opts.formatValue ? opts.formatValue(row.current) : fmtNumber(row.current)));

    const editTd = document.createElement('td');
    const controls = el('div', 'admin-xp-controls');
    const numberInput = document.createElement('input');
    numberInput.type = 'number'; numberInput.min = '0'; numberInput.step = '1';
    numberInput.value = opts.isPeriod ? (row.current && row.current.max) : row.current;
    numberInput.className = 'admin-xp-input';
    controls.append(numberInput);
    let periodSelect = null;
    if (opts.isPeriod) {
      periodSelect = document.createElement('select');
      ['day', 'week'].forEach((p) => periodSelect.append(new Option(t(p === 'day' ? 'xpPeriodDay' : 'xpPeriodWeek'), p, false, row.current && row.current.period === p)));
      controls.append(periodSelect);
    }
    editTd.append(controls);
    tr.append(editTd);

    const actionsTd = document.createElement('td');
    const actions = el('div', 'admin-xp-controls');
    const saveBtn = el('button', 'btn btn-primary btn-sm', t('save'));
    saveBtn.type = 'button';
    saveBtn.onclick = () => {
      const value = opts.isPeriod ? { maxCount: numberInput.value, period: periodSelect.value } : numberInput.value;
      api('/xp/config', { method: 'POST', body: JSON.stringify({ category, key: keyFor(row), value }) })
        .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
    };
    const resetBtn = el('button', 'btn btn-secondary btn-sm', t('xpResetDefault'));
    resetBtn.type = 'button';
    resetBtn.disabled = !row.overridden;
    resetBtn.onclick = () => {
      api('/xp/config?category=' + encodeURIComponent(category) + '&key=' + encodeURIComponent(keyFor(row)), { method: 'DELETE' })
        .then(() => { showToast(t('saved')); renderTab(); }).catch((error) => showToast(error.message, 'danger'));
    };
    actions.append(saveBtn, resetBtn);
    actionsTd.append(actions);
    tr.append(actionsTd);
    tbody.append(tr);
  });
  table.append(tbody);
  const tableWrap = el('div', 'admin-table-wrap');
  tableWrap.append(table);
  card.append(tableWrap);
  return card;
}

function xpTab() {
  return api('/xp/config').then((cfg) => {
    const wrap = el('div');
    const overriddenCount = ['points', 'domainCaps', 'sourceCaps', 'periodCaps', 'sourceTotalCaps', 'achievementPoints', 'masteryRequirements']
      .reduce((sum, key) => sum + cfg[key].filter((r) => r.overridden).length, 0) + (cfg.recurringCap.overridden ? 1 : 0);
    wrap.append(statRow([statCard('award', String(cfg.points.length), t('xpStatTypes')), statCard('sliders-horizontal', String(overriddenCount), t('xpStatOverridden'))]));

    wrap.append(xpConfigTable(t('xpSectionPoints'), cfg.points,
      [{ label: t('xpColType'), render: (r) => r.type }, { label: t('xpColDomain'), render: (r) => r.domain || '—' }],
      'points', (r) => r.type));

    wrap.append(xpConfigTable(t('xpSectionDomainCaps'), cfg.domainCaps,
      [{ label: t('xpColDomain'), render: (r) => r.domain }], 'domainCap', (r) => r.domain));

    wrap.append(xpConfigTable(t('xpSectionRecurringCap'), [Object.assign({ label: t('xpRecurringCapLabel') }, cfg.recurringCap)],
      [{ label: '', render: (r) => r.label }], 'recurringCap', () => ''));

    wrap.append(xpConfigTable(t('xpSectionSourceCaps'), cfg.sourceCaps,
      [{ label: t('xpColType'), render: (r) => r.type }], 'sourceCap', (r) => r.type));

    wrap.append(xpConfigTable(t('xpSectionSourceTotalCaps'), cfg.sourceTotalCaps,
      [{ label: t('xpColDomain'), render: (r) => r.sourceType }], 'sourceTotalCap', (r) => r.sourceType));

    wrap.append(xpConfigTable(t('xpSectionPeriodCaps'), cfg.periodCaps,
      [{ label: t('xpColType'), render: (r) => r.type }], 'periodCap', (r) => r.type,
      { isPeriod: true, formatValue: (v) => (v ? v.max + ' / ' + t(v.period === 'week' ? 'xpPeriodWeek' : 'xpPeriodDay') : '—') }));

    wrap.append(xpConfigTable(t('xpSectionAchievements'), cfg.achievementPoints,
      [{ label: t('xpColAchievement'), render: (r) => r.key }], 'achievementPoints', (r) => r.key));

    wrap.append(xpConfigTable(t('xpSectionMastery'), cfg.masteryRequirements,
      [{ label: t('xpColLevel'), render: (r) => String(r.level) }, { label: t('xpColRequirement'), render: (r) => r.requirementKey }],
      'mastery', (r) => r.level + ':' + r.requirementKey));

    return wrap;
  });
}

// --- Marketplace tab ---

let marketplaceStatusFilter = 'all';

function marketplaceTab() {
  return api('/marketplace/listings?status=' + marketplaceStatusFilter).then((listings) => {
    const wrap = el('div');
    wrap.append(statRow([
      statCard('store', fmtNumber(listings.length), t('statTotalListings')),
      statCard('badge-check', fmtNumber(listings.filter((l) => l.status === 'published').length), t('statPublishedListings')),
      statCard('star', fmtNumber(listings.filter((l) => l.featured).length), t('statFeaturedListings'))
    ]));
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
  document.querySelector('#pageTitle').textContent = t('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
  const body = document.querySelector('#adminBody');
  body.replaceChildren(el('p', 'hint', t('loading')));
  tabBuilders[tab]().then((node) => { body.replaceChildren(node); icons(body); }).catch((error) => { body.replaceChildren(errorNode(error, renderTab)); });
}
function rerenderCurrentTab() { if (!document.querySelector('#adminLayout').hidden) renderTab(); }

document.querySelectorAll('#adminTabs button').forEach((button) => button.addEventListener('click', () => {
  location.hash = '#/admin/' + button.dataset.tab;
  // On the mobile overlay drawer, picking a tab should close the sidebar back down.
  document.querySelector('#adminLayout').classList.remove('sidebar-open');
}));
window.addEventListener('hashchange', () => { if (location.hash.indexOf('#/admin') === 0) renderTab(); });

const SIDEBAR_COLLAPSE_KEY = 'tradejournal:admin-sidebar-collapsed';
const sidebarToggle = document.querySelector('#sidebarToggle');
sidebarToggle.addEventListener('click', () => {
  const layout = document.querySelector('#adminLayout');
  if (window.innerWidth <= 880) { layout.classList.toggle('sidebar-open'); return; }
  const collapsed = layout.classList.toggle('collapsed');
  try { localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0'); } catch (_) { /* no-op if storage is unavailable */ }
});
document.addEventListener('click', (event) => {
  const layout = document.querySelector('#adminLayout');
  if (window.innerWidth <= 880 && layout.classList.contains('sidebar-open') && !event.target.closest('#adminSidebar') && !event.target.closest('#sidebarToggle')) layout.classList.remove('sidebar-open');
});

function loadCurrentUserLabel() {
  fetch('/api/users/me', { headers: switcher && switcher.currentUserId() ? { 'x-dev-user-id': switcher.currentUserId() } : {} })
    .then((r) => (r.ok ? r.json() : null))
    .then((user) => {
      if (!user) return;
      const label = document.querySelector('#currentUserLabel');
      document.querySelector('#currentUserName').textContent = user.displayName;
      label.hidden = false;
    })
    .catch(() => {}); // best-effort - the topbar label is a courtesy, never blocks the panel
}

function startApp() {
  document.querySelector('#adminGate').hidden = true;
  const layout = document.querySelector('#adminLayout');
  layout.hidden = false;
  try { if (localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1') layout.classList.add('collapsed'); } catch (_) { /* no-op */ }
  loadCurrentUserLabel();
  icons(document);
  if (!/^#\/admin\/(users|ai|technical|xp|marketplace|financial)$/.test(location.hash)) location.hash = '#/admin/users';
  else renderTab();
}

// Real email/password login only - the old "TEST MODE: continue as any dev-user" bypass is
// gone entirely, not just hidden behind a flag. Every visitor must authenticate with real
// credentials, and only an account with role='admin' is let past the gate; the server's own
// requireAdmin (server/admin/auth-admin.mjs) is the actual security boundary this defends
// nothing without - see the ADMIN_AUTH_ENFORCED warning below, which exists specifically to
// catch the case where this client-side check is the only thing stopping a non-admin, because
// the server hasn't been told to enforce roles yet.
let adminAuthEnforced = null;

function gateElements() {
  return {
    email: document.querySelector('#gateEmail'), password: document.querySelector('#gatePassword'),
    error: document.querySelector('#gateError'), submit: document.querySelector('#gateSubmit')
  };
}

function submitGateLogin() {
  const { email, password, error, submit } = gateElements();
  error.hidden = true;
  submit.disabled = true;
  (switcher ? switcher.login({ email: email.value.trim(), password: password.value }) : Promise.reject(new Error('NO_SWITCHER')))
    .then((user) => {
      if (user.role !== 'admin') {
        switcher.logout();
        const notAdmin = new Error('NOT_ADMIN'); notAdmin.code = 'NOT_ADMIN';
        throw notAdmin;
      }
      startApp();
      if (adminAuthEnforced === false) showToast(t('enforcementWarning'), 'danger');
    })
    .catch((err) => { error.textContent = describeGateError(err); error.hidden = false; })
    .finally(() => { submit.disabled = false; });
}

function boot() {
  applyLanguage(activeLanguage);
  icons(document);
  const gate = document.querySelector('#adminGate');
  gate.hidden = false;

  fetch('/api/admin/config').then((r) => r.json()).then((config) => { adminAuthEnforced = !!config.authEnforced; }).catch(() => { adminAuthEnforced = null; });

  const { email, password, submit } = gateElements();
  submit.addEventListener('click', submitGateLogin);
  [email, password].forEach((input) => input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); submitGateLogin(); } }));

  // A returning admin whose browser already holds a valid session token skips straight past
  // the form, same as the main app's own isLoggedIn() check - only fast-forwards if that token
  // really does belong to an admin account, never just "any known token".
  if (switcher && switcher.currentUserId()) {
    fetch('/api/users/me', { headers: { 'x-dev-user-id': switcher.currentUserId() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((user) => { if (user && user.role === 'admin') startApp(); })
      .catch(() => {});
  }
}

function describeGateError(error) {
  if (error instanceof TypeError) return t('gateErrorOffline');
  if (error && error.code === 'NOT_ADMIN') return t('gateErrorNotAdmin');
  if (error && (error.code === 'INVALID_CREDENTIALS' || error.status === 401)) return t('gateErrorInvalidCredentials');
  const base = t('gateError');
  return error && error.message ? base + ' (' + error.message + ')' : base;
}

// Minimal testability surface (this page otherwise has no window export, matching
// select/app.js's own standalone-script style) - route() and the XP placeholder tab are pure
// enough to unit-test directly rather than only indirectly through hash/DOM interaction.
window.TradeJournalAdminApp = { route: route, xpTab: xpTab, usersTab: usersTab, aiTab: aiTab };

boot();
