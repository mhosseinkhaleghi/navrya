import React from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { RankCrest, RANK_TITLE } from '../public/pages/shared/navrya/components/identity/RankCrest.jsx';
import { CharacterPortrait } from '../public/pages/shared/navrya/components/identity/CharacterPortrait.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';
import { CryptoInvoiceModal, CryptoInvoicePanel } from './cryptoInvoiceModal.jsx';

// React rewrite of the Account Profile destination (sidebar "اشتراک", #account/profile[/tab])
// per the design handoff: a persistent "dossier band" (rank/level/XP/next-reward) above a tab
// bar (Identity / Level & Progress / Achievements / Role / Subscription). Subscription originally
// shipped as a stub (no real billing existed yet); it now renders the real Commercial System
// Plan/Wallet/Storage panels (Validation Gate fix - see SubscriptionTab's own comment).
//
// Every store call is the exact same real API account-profile-ui.js already used
// (window.TradeJournalAccountProfileStore, ProfileXPRules, ProfileAchievements) - only the
// presentation is new. Several design elements have NO real backing anywhere in this codebase
// (confirmed by extensive research before writing this file) and are deliberately NOT faked:
// - "EMERALD HUNTER III"-style rank/tier is real but fixed PER CHARACTER SKIN (RankCrest's own
//   RANK_TITLE), not level-derived - used as-is, not invented.
// - Only 7 real levels exist (LEVEL_THRESHOLDS has 7 entries) - the ladder shows 7 nodes, not 8.
// - The mastery gate shows however many real blockers a level actually has (3-5), not a fixed 3,
//   and drops the design's "+XP per quest" chip since gate requirements carry no XP reward of
//   their own in the real data model.
// - A calendar "presence streak" (14-day strip) has no backing endpoint anywhere (confirmed by
//   research) - omitted rather than mislabeling the unrelated real "trading discipline streak"
//   already shown elsewhere in the header.
// - Achievement "rarity" (% of traders who have it) has no real aggregate - omitted from the
//   detail dialog.
// - The Role tab's real enum is trader|mentor|teacher (not the design's 4-option mock) - shown as
//   3 real cards so every option actually saves.

const copy = {
  fa: {
    dossierEyebrow: 'NAVRYA · DOSSIER', dossierTitle: 'پرونده، پیشرفت و اشتراک',
    dossierSubtitle: 'هویت، سطح، دستاوردها و پاس فعال شما در یک پرونده. هر امتیاز از یک کار واقعی در محصول می‌آید — نه از ورود روزانه.',
    statLevel: 'سطح', statXp: 'کل امتیاز', statAch: 'نشان‌ها',
    rankLabel: 'رتبهٔ کنونی', levelWord: 'LEVEL', pathToLevel: 'مسیر تا سطح {n}',
    xpOf: '{xp} از {max} امتیاز', xpToNext: '{xp} امتیاز تا سطح بعد', maxLevelLine: 'به بالاترین سطح رسیدید',
    pendingSync: '{n} امتیاز در انتظار همگام‌سازی', nextRewardLabel: 'پاداش بعدی',
    tabIdentity: 'هویت', tabLevel: 'سطح و پیشرفت', tabAch: 'دستاوردها', tabSub: 'اشتراک', tabRole: 'نقش', logoutBtn: 'خروج از حساب',

    pathTitle: 'مسیر پیشرفت', pathHint: 'هر سطح یک توانایی تازه در محصول باز می‌کند', pathOfLine: 'سطح {cur} از {max}',
    gateTitle: 'دروازهٔ سطح {n}', gateSub: 'امتیاز تنها بخشی از ماجراست؛ برای عبور باید این کارها را هم تمام کنید.',
    gateSummary: '{xp} امتیاز و {n} شرط باقی', gateFooter: 'پس از تکمیل شرط‌ها، سطح در همگام‌سازی بعدی باز می‌شود.',
    gateNoneTitle: 'دروازه‌ای در انتظار نیست', gateNoneBody: 'سطح فعلی شما با امتیاز واقعی هم‌سو است؛ شرط دیگری برای عبور باقی نمانده.',
    ledgerTitle: 'امتیازهای اخیر', ledgerTotal30: 'مجموع ۳۰ روز: {n} امتیاز', ledgerEmpty: 'هنوز امتیازی کسب نشده است.',
    showAll: 'نمایش همهٔ رویدادها', showLess: 'نمایش کمتر',

    reqClosedSessions: 'سشن‌های بسته‌شده', reqReviewedTrades: 'معاملات بازبینی‌شده', reqReflections: 'بازتاب‌های ثبت‌شده',
    reqTradePlans: 'پلن معاملهٔ ثبت‌شده', reqPatternsWithThreeStages: 'الگوی سه‌مرحله‌ای', reqCompleteStrategies: 'استراتژی کامل‌شده',
    reqValidPatternsWithTwoResolutions: 'الگوی دو-نتیجه‌ای معتبر', reqPatternResolutions: 'نتیجهٔ الگوی ثبت‌شده',
    reqDomainXpMin: 'حداقل امتیاز {domain}', reqDomainMaxPercent: 'سقف سهم {domain}', reqDomainMinPercent: 'حداقل سهم {domain}',
    domainSession: 'سشن', domainTrade: 'معامله', domainPattern: 'الگو', domainStrategy: 'استراتژی', domainPsychology: 'روان‌شناسی', domainCommunity: 'انجمن',

    achHallTitle: 'تالار دستاوردها', achOf: 'از {n}', achXpLine: '{xp} امتیاز از نشان‌ها · {pct}٪ کامل',
    achHallBody: 'دستاوردها با کار واقعی باز می‌شوند: بستن معامله، تمام کردن سشن، ثبت درس. باز شدن هر نشان امتیاز می‌دهد.',
    closestBadge: 'نزدیک‌ترین نشان', filterAll: 'همه', filterOpen: 'باز شده', filterLocked: 'قفل',
    achResultLine: '{n} نشان نمایش داده می‌شود', unlockedOn: 'بازشده در {date}', locked: 'قفل', achEmpty: 'هنوز دستاوردی باز نشده است.',
    tierBronze: 'BRONZE · برنز', tierSilver: 'SILVER · نقره', tierGold: 'GOLD · طلا', tierLegend: 'LEGEND · افسانه', badgeCountSuffix: 'نشان',
    reqSectionLabel: 'شرط باز شدن', close: 'بستن',

    identityPortraitHint: 'تصویر نمایه در سربرگ کاراکتر و بازارچه دیده می‌شود. PNG یا JPG، حداقل ۴۰۰×۴۰۰ پیکسل.',
    changeImage: 'تغییر تصویر', removeImage: 'حذف', selectedCharacter: 'کاراکتر انتخابی',
    identityFieldsTitle: 'اطلاعات هویتی', nameLabel: 'نام نمایشی', handleLabel: 'نام کاربری', handleHint: 'این نام‌کاربری از شناسهٔ حساب شما ساخته می‌شود و قابل ویرایش نیست.',
    emailLabel: 'ایمیل', phoneLabel: 'موبایل', phonePlaceholder: '۰۹۱۲ ۰۰۰ ۰۰۰۰',
    kycTitle: 'تأیید هویت', kycOfLine: '{n} از ۳ مرحله', kycEmail: 'ایمیل', kycPhone: 'موبایل', kycDoc: 'مدرک هویت',
    kycDone: 'تأیید شده', kycPending: 'در انتظار', kycTodo: 'شروع نشده',
    kycNotice: 'وضعیت تأیید هویت فقط با پشتیبانی تغییر می‌کند. برای به‌روزرسانی، از بخش پشتیبانی درخواست بفرستید.',
    saveChanges: 'ذخیرهٔ تغییرات', resetChanges: 'بازگرداندن', lastSaved: 'آخرین ذخیره: {date}', neverSaved: 'هنوز ذخیره نشده',
    saved: 'ذخیره شد.', emailTaken: 'این ایمیل قبلاً استفاده شده است.', validationFailed: 'لطفاً فیلدها را بررسی و دوباره تلاش کنید.',

    subComingTitle: 'این بخش هنوز آماده نیست', subComingBody: 'صفحهٔ اشتراک و پرداخت هنوز به سیستم صورتحساب واقعی وصل نشده است؛ به‌محض آماده شدن، همین‌جا نمایش داده می‌شود.',
    subRealTitle: 'اشتراک‌های شما', subEmpty: 'هنوز اشتراکی نداری.', mockBadge: 'آزمایشی', purchasedOn: 'خریداری‌شده در {date}',

    roleTitle: 'نقش شما در محصول', roleSub: 'نقش، چیدمان پیشنهادی داشبورد و لحن دستیار را تغییر می‌دهد. این یک برچسب محصولی است، نه یک مدرک تأییدشده.',
    roleTrader: 'معامله‌گر', roleTraderDesc: 'اجرای معامله، سشن روزانه و مدیریت ریسک شخصی.',
    roleMentor: 'منتور', roleMentorDesc: 'مرور سشن دیگران، بازخورد و انتشار آموزش.',
    roleTeacher: 'مدرس', roleTeacherDesc: 'تولید محتوای آموزشی و مرور ساختاریافتهٔ استراتژی‌ها.',
    saveRole: 'ذخیرهٔ نقش', roleCurrentLine: 'نقش فعلی: {role}', roleSaved: 'نقش به‌روزرسانی شد.',

    xpTypeAchievement: 'باز شدن دستاورد', xpTypeStreak: 'پاداش استمرار: {detail}',

    subActiveStatus: 'فعال', subPlanSuffix: 'پلن {plan}', subPerMonth: '/ ماه',
    subPlanFree: 'رایگان', subPlanPlus: 'پلاس', subPlanPro: 'پرو', subPlanPersonalized: 'اختصاصی',
    subRenews: 'تمدید در {date}', subCancelsNote: 'لغو در {date} · هر زمان قبل از آن می‌توانی تمدید کنی',
    subReactivate: 'فعال‌سازی مجدد', subCancelAtPeriodEnd: 'لغو در پایان دوره', subFreeNoBilling: 'پلن رایگان — صورتحسابی ثبت نشده است.',
    subStorageUsed: 'فضای ذخیره‌سازی مصرف‌شده', subWalletBalance: 'موجودی کیف پول', subPlanLimits: 'محدودیت‌های پلن',
    subUnlimited: 'نامحدود', subFreeTierCaps: 'محدودیت‌های پلن رایگان',
    subRecommended: 'پیشنهاد ما', subUpgradeModalTitle: 'ارتقا به {plan}', subCancel: 'انصراف', subConfirmRequest: 'تأیید درخواست',
    subUpgradeBilledNote: 'به‌محض تأیید این درخواست توسط مدیر، مبلغ {price} / {interval} از تو دریافت می‌شود. پلن فعلی‌ات تا آن زمان فعال می‌ماند.',
    subIntervalMonth: 'ماه', subIntervalYear: 'سال',
    subChooseYourPlan: 'انتخاب پلن', subUpgradesEffectNote: 'ارتقا فقط پس از تأیید مدیر اعمال می‌شود.',
    subCurrentPlan: 'پلن فعلی', subActivePlan: 'پلن فعال', subPreviousPlan: 'پلن قبلی شما', subUpgradeTo: 'ارتقا به {plan}',
    subFeatCloudStorage: '{size} فضای ابری', subFeatPatternsOne: '{n} الگوی ذخیره‌شده', subFeatPatternsMany: '{n} الگوی ذخیره‌شده',
    subFeatUnlimitedPatterns: 'الگوهای ذخیره‌شدهٔ نامحدود', subFeatStrategiesOne: '{n} استراتژی', subFeatStrategiesMany: '{n} استراتژی',
    subFeatUnlimitedStrategies: 'استراتژی‌های نامحدود', subFeatAccountsOne: '{n} حساب معاملاتی', subFeatAccountsMany: '{n} حساب معاملاتی',
    subFeatUnlimitedAccounts: 'حساب‌های معاملاتی نامحدود', subFeatSessionsOne: '{n} سشن معاملاتی', subFeatSessionsMany: '{n} سشن معاملاتی',
    subFeatUnlimitedSessions: 'سشن‌های معاملاتی نامحدود', subFeatSymbolsOne: '{n} نماد تحلیل', subFeatSymbolsMany: '{n} نماد تحلیل',
    subFeatUnlimitedSymbols: 'نمادهای تحلیل نامحدود', subFeatAiPanelBuilder: 'دسترسی به سازندهٔ پنل هوش مصنوعی',
    subFeatPremiumModels: 'دسترسی به مدل‌های پیشرفتهٔ هوش مصنوعی', subFeatByok: 'استفاده از کلید شخصی', subFeatTokenDiscount: '{percent}٪ تخفیف مصرف توکن',
    subAiWallet: 'کیف پول هوش مصنوعی', subPromoPaid: 'هدیه {promo} · پرداختی {paid}',
    subWalletHint: 'هر پاسخ هوش مصنوعی — گفتگو، تحلیل الگو، مرور سشن — همان لحظه از این موجودی کسر می‌شود. دقیقاً ببین برای چی خرج شده، در «فعالیت کیف پول» پایین همین صفحه.',
    subAmountUsd: 'مبلغ (دلار)', subRequestTopUp: 'درخواست شارژ',
    subPayMethodTitle: 'روش پرداخت', subPayMethodCrypto: 'ارز دیجیتال', subPayMethodVisa: 'کارت ویزا',
    subPayMethodIranGateway: 'درگاه پرداخت ایران', subPayMethodComingSoon: 'به‌زودی',
    subPayMethodNotAdded: 'این روش پرداخت هنوز اضافه نشده است.',
    subPayMethodCryptoDesc: 'USDT روی شبکهٔ BNB Smart Chain', subPayMethodVisaDesc: 'پرداخت ارزی با کارت بین‌المللی',
    subPayMethodIranGatewayDesc: 'درگاه بانکی داخلی', subPayMethodActive: 'فعال',
    subPayStepMethod: 'گام ۱ از ۲ · روش پرداخت', subPayStepReview: 'گام ۲ از ۲ · بررسی و پرداخت',
    subPayChooseMethod: 'روش پرداخت را انتخاب کنید', subPayChange: 'تغییر',
    subPayInvoice: 'فاکتور', subPayTotal: 'جمع کل',
    subPayLineItemTopUp: 'شارژ کیف پول هوش مصنوعی', subPayLineItemPlan: 'اشتراک {plan}',
    subPayDiscountCode: 'کد تخفیف', subPayDiscountPlaceholder: 'کد تخفیف',
    subPayDiscountUnavailable: 'کد تخفیف هنوز اضافه نشده است.',
    subPayCurrencyNote: 'مبلغ به دلار آمریکا محاسبه و در لحظهٔ پرداخت تبدیل می‌شود.',
    subPayBack: 'بازگشت', subPayConfirm: 'پرداخت {amount}',
    subTopUpMinHint: 'حداقل مبلغ شارژ {amount} است', subTopUpAmountValid: 'مبلغ معتبر است',
    subPayStepInvoice: 'گام ۳ از ۳ · پرداخت',
    subSpecStorage: 'فضای ابری', subSpecPatterns: 'الگوهای ذخیره‌شده', subSpecStrategies: 'استراتژی‌ها',
    subSpecAccounts: 'حساب‌های معاملاتی', subSpecSessions: 'سشن‌های معاملاتی', subSpecSymbols: 'نمادهای تحلیل',
    subSpecUnlimited: 'نامحدود', subTokenDiscountLabel: 'تخفیف مصرف توکن',
    subWalletAddCredit: 'افزودن اعتبار', subWalletMinimumIs: 'حداقل مبلغ شارژ: {amount}',
    subWalletCustomAmount: 'مبلغ دلخواه (دلار)', subWalletContinueToPay: 'ادامه به پرداخت',
    subWalletLowBalance: 'موجودی کم', subWalletPromoLabel: 'هدیه', subWalletPaidLabel: 'پرداختی',
    subWalletMethodsLabel: 'روش‌های پرداخت:',
    subTopUpNotice: 'درخواست شارژ به مبلغ {amount} ثبت شد — در انتظار تأیید مدیر (صورتحساب دستی/آزمایشی).',
    subTopUpError: 'ثبت درخواست شارژ ممکن نشد: {error}',
    subTopUpMinTitle: 'مبلغ خیلی کم است',
    subTopUpMinBody: 'حداقل مبلغ شارژ کیف پول {amount} است. لطفاً مبلغی برابر یا بیشتر از آن وارد کنید.',
    subTopUpMinOk: 'متوجه شدم',
    subWalletActivityTitle: 'فعالیت کیف پول — دلیل تغییر موجودی',
    subFilterAll: 'همه', subFilterUsage: 'مصرف هوش مصنوعی', subFilterCredit: 'شارژ و اعتبار', subNoActivity: 'هنوز فعالیتی ثبت نشده است.',
    subAiUsageTotal: 'جمع مصرف هوش مصنوعی: {amount}',
    subLedgerAiUsage: 'مصرف هوش مصنوعی · {feature}', subLedgerAssistant: 'دستیار', subLedgerTopUp: 'شارژ کیف پول', subLedgerManualBilling: 'صورتحساب دستی',
    subLedgerSignupBonus: 'هدیهٔ ثبت‌نام', subLedgerPromoCredit: 'اعتبار هدیه', subLedgerAdminCredit: 'اعتبار مدیر', subLedgerManualAdjustment: 'تعدیل دستی',
    subLedgerRefundReversal: 'بازگشت وجه', subLedgerAdminDebit: 'کسر مدیر', subLedgerTopUpRefunded: 'شارژ بازگردانده شد',
    subImpactPromo: '(از هدیه)', subImpactPaid: '(از پرداختی)', subImpactBoth: '(هدیه + پرداختی)',
    subCloudStorage: 'فضای ذخیره‌سازی ابری', subOfQuotaUsed: ' از {quota} مصرف‌شده', subStorageAddOn: 'افزونهٔ فضای ذخیره‌سازی', subExpiresOn: 'انقضا در {date}',
    subAddMoreStorage: 'افزودن فضای بیشتر', subCapacityValidity: '+{capacity} · {days} روز', subPurchase: 'خرید',
    subStorageNotice: 'درخواست خرید {name} ثبت شد — در انتظار تأیید مدیر (صورتحساب دستی/آزمایشی).',
    subStorageError: 'ثبت درخواست خرید ممکن نشد: {error}',
    subBillingHistory: 'تاریخچهٔ صورتحساب', subNoBillingActivity: 'هنوز فعالیت صورتحسابی ثبت نشده است.',
    subColDate: 'تاریخ', subColDescription: 'شرح', subColAmount: 'مبلغ', subColStatus: 'وضعیت',
    subTxWalletTopUp: 'شارژ کیف پول', subTxSubscription: 'پلن · اشتراک ماهانه', subTxStoragePurchase: 'افزونهٔ فضای ذخیره‌سازی', subTxRefund: 'بازگشت وجه',
    subStatusPaid: 'پرداخت‌شده', subStatusPending: 'در انتظار', subStatusFailed: 'ناموفق', subStatusRefunded: 'بازگردانده‌شده',
    subUpgradeNotice: 'درخواست ارتقا به {plan} ثبت شد — در انتظار تأیید مدیر (صورتحساب دستی/آزمایشی).',
    subUpgradeError: 'ثبت درخواست ارتقا ممکن نشد: {error}',
    subInvoiceTitle: 'پرداخت با ارز دیجیتال', subInvoiceNetwork: 'شبکه', subInvoiceAsset: 'دارایی', subInvoiceAmount: 'مبلغ',
    subInvoiceRecipient: 'آدرس مقصد', subInvoiceCopy: 'کپی', subInvoiceCopied: 'کپی شد',
    subInvoiceExpiresIn: 'انقضا تا {time}', subInvoiceExpired: 'این فاکتور منقضی شده است.',
    subInvoiceStatusPending: 'در انتظار پرداخت…', subInvoiceStatusConfirmed: 'پرداخت تأیید شد!', subInvoiceStatusExpired: 'این فاکتور منقضی شده است.',
    subInvoiceHint: 'دقیقاً همین مبلغ را روی شبکه BNB Smart Chain به آدرس بالا ارسال کن. پرداخت تو به‌صورت خودکار شناسایی می‌شود.',
    subInvoiceClose: 'بستن', subInvoiceCheckNow: 'بررسی الان',
    subInvoiceTxHashLabel: 'شناسه تراکنش', subInvoiceTxHashPlaceholder: 'شناسهٔ تراکنش را اینجا وارد کن',
    subInvoiceTxHashRequired: 'برای بررسی، شناسهٔ تراکنش را وارد کن.',
    subInvoiceMismatchNote: 'اگر مبلغ واریزی شما با مبلغ فاکتور تفاوت داشته باشد — چه کمتر و چه بیشتر — این خرید انجام نمی‌شود، اما مبلغ واقعی واریزی‌تان مستقیماً به کیف پول هوش مصنوعی‌تان اضافه خواهد شد.',
    subInvoiceMismatchCredited: 'مبلغ واریزی شما با مبلغ این فاکتور مطابقت نداشت. به‌جای این خرید، {amount} مستقیماً به کیف پول شما اضافه شد.',
    subInvoiceOverpaidCredited: 'شما بیشتر از مبلغ فاکتور واریز کردید. این خرید انجام شد و مابه‌التفاوت، {amount}، به کیف پول شما اضافه شد.',
    subInvoiceCheckError: 'بررسی پرداخت ممکن نشد: {error}',
    subInvoiceReasonNotFound: 'این تراکنش هنوز روی شبکه دیده نشده است. کمی صبر کن و دوباره بررسی کن.',
    subInvoiceReasonFailed: 'این تراکنش روی شبکه ناموفق بوده است.',
    subInvoiceReasonNoTransfer: 'هیچ واریزی مطابق با این آدرس و توکن پیدا نشد. آدرس، شبکه (BNB Smart Chain) و نوع توکن (USDT) را دوباره بررسی کن.',
    subInvoiceReasonChainMismatch: 'این تراکنش روی شبکهٔ اشتباهی ثبت شده است.',
    subInvoiceReasonConfirming: 'تراکنش شما دیده شد و در انتظار تأیید شبکه است — کمی بعد دوباره بررسی کن.',
    subInvoiceReasonAlreadyClaimed: 'این شناسهٔ تراکنش قبلاً برای فاکتور دیگری استفاده شده است.'
  },
  en: {
    dossierEyebrow: 'NAVRYA · DOSSIER', dossierTitle: 'Dossier, progress & subscription',
    dossierSubtitle: 'Your identity, level, achievements and active pass in one dossier. Every XP comes from a real product action - never from a daily login.',
    statLevel: 'Level', statXp: 'Total XP', statAch: 'Badges',
    rankLabel: 'Current rank', levelWord: 'LEVEL', pathToLevel: 'Path to level {n}',
    xpOf: '{xp} of {max} XP', xpToNext: '{xp} XP to next level', maxLevelLine: 'Maximum level reached',
    pendingSync: '{n} XP pending sync', nextRewardLabel: 'Next reward',
    tabIdentity: 'Identity', tabLevel: 'Level & progress', tabAch: 'Achievements', tabSub: 'Subscription', tabRole: 'Role', logoutBtn: 'Log out',

    pathTitle: 'Progression path', pathHint: 'Every level unlocks a new product ability', pathOfLine: 'Level {cur} of {max}',
    gateTitle: 'Level {n} gate', gateSub: 'XP is only part of it - you also need to finish these to pass.',
    gateSummary: '{xp} XP and {n} condition(s) left', gateFooter: 'Once these are met, the level unlocks on the next sync.',
    gateNoneTitle: 'No gate pending', gateNoneBody: 'Your current level matches your real XP - nothing else is blocking you.',
    ledgerTitle: 'Recent XP', ledgerTotal30: '30-day total: {n} XP', ledgerEmpty: 'No XP earned yet.',
    showAll: 'Show all events', showLess: 'Show less',

    reqClosedSessions: 'Closed sessions', reqReviewedTrades: 'Reviewed trades', reqReflections: 'Logged reflections',
    reqTradePlans: 'Recorded trade plans', reqPatternsWithThreeStages: 'Patterns with 3 stages', reqCompleteStrategies: 'Completed strategies',
    reqValidPatternsWithTwoResolutions: 'Patterns with 2 resolutions', reqPatternResolutions: 'Pattern resolutions',
    reqDomainXpMin: 'Minimum {domain} XP', reqDomainMaxPercent: 'Max {domain} share', reqDomainMinPercent: 'Min {domain} share',
    domainSession: 'session', domainTrade: 'trade', domainPattern: 'pattern', domainStrategy: 'strategy', domainPsychology: 'psychology', domainCommunity: 'community',

    achHallTitle: 'Hall of achievements', achOf: 'of {n}', achXpLine: '{xp} XP from badges · {pct}% complete',
    achHallBody: 'Achievements unlock through real work: closing a trade, finishing a session, logging a lesson. Each one pays XP.',
    closestBadge: 'Closest badge', filterAll: 'All', filterOpen: 'Unlocked', filterLocked: 'Locked',
    achResultLine: '{n} badges shown', unlockedOn: 'Unlocked {date}', locked: 'Locked', achEmpty: 'No achievements unlocked yet.',
    tierBronze: 'BRONZE', tierSilver: 'SILVER', tierGold: 'GOLD', tierLegend: 'LEGEND', badgeCountSuffix: 'badges',
    reqSectionLabel: 'Unlock condition', close: 'Close',

    identityPortraitHint: 'Your portrait shows in the character header and marketplace. PNG or JPG, at least 400×400px.',
    changeImage: 'Change image', removeImage: 'Remove', selectedCharacter: 'Selected character',
    identityFieldsTitle: 'Identity information', nameLabel: 'Display name', handleLabel: 'Username', handleHint: 'Generated from your account id - not editable.',
    emailLabel: 'Email', phoneLabel: 'Phone', phonePlaceholder: '+1 000 000 0000',
    kycTitle: 'Identity verification', kycOfLine: '{n} of 3 steps', kycEmail: 'Email', kycPhone: 'Phone', kycDoc: 'ID document',
    kycDone: 'Verified', kycPending: 'Pending', kycTodo: 'Not started',
    kycNotice: 'Verification status can only be changed by support - contact support to update it.',
    saveChanges: 'Save changes', resetChanges: 'Reset', lastSaved: 'Last saved: {date}', neverSaved: 'Never saved',
    saved: 'Saved.', emailTaken: 'That email is already in use.', validationFailed: 'Please check the fields and try again.',

    subComingTitle: 'Not ready yet', subComingBody: 'The subscription/billing page isn’t connected to a real billing system yet - it will show up here once it is.',
    subRealTitle: 'Your subscriptions', subEmpty: 'No subscriptions yet.', mockBadge: 'mock', purchasedOn: 'Purchased {date}',

    roleTitle: 'Your product role', roleSub: 'Role changes the suggested dashboard layout and the assistant’s tone. It is a product label, not a verified credential.',
    roleTrader: 'Trader', roleTraderDesc: 'Trade execution, daily sessions and personal risk management.',
    roleMentor: 'Mentor', roleMentorDesc: 'Reviewing others’ sessions, feedback and publishing lessons.',
    roleTeacher: 'Teacher', roleTeacherDesc: 'Producing educational content and structured strategy reviews.',
    saveRole: 'Save role', roleCurrentLine: 'Current role: {role}', roleSaved: 'Role updated.',

    xpTypeAchievement: 'Achievement unlocked', xpTypeStreak: 'Streak bonus: {detail}',

    subActiveStatus: 'Active', subPlanSuffix: '{plan} Plan', subPerMonth: '/ month',
    subPlanFree: 'Free', subPlanPlus: 'Plus', subPlanPro: 'Pro', subPlanPersonalized: 'Personalized',
    subRenews: 'Renews {date}', subCancelsNote: 'Cancels {date} · renew anytime before then',
    subReactivate: 'Reactivate', subCancelAtPeriodEnd: 'Cancel at Period End', subFreeNoBilling: 'Free plan — no billing on file.',
    subStorageUsed: 'Storage Used', subWalletBalance: 'Wallet Balance', subPlanLimits: 'Plan Limits',
    subUnlimited: 'Unlimited', subFreeTierCaps: 'Free tier caps',
    subRecommended: 'Recommended', subUpgradeModalTitle: 'Upgrade to {plan}', subCancel: 'Cancel', subConfirmRequest: 'Confirm Request',
    subUpgradeBilledNote: "You'll be billed {price} / {interval} once an admin confirms this request. Your current plan stays active until then.",
    subIntervalMonth: 'month', subIntervalYear: 'year',
    subChooseYourPlan: 'Choose Your Plan', subUpgradesEffectNote: 'Upgrades take effect once an admin confirms the request.',
    subCurrentPlan: 'Current Plan', subActivePlan: 'Active Plan', subPreviousPlan: 'Your previous plan', subUpgradeTo: 'Upgrade to {plan}',
    subFeatCloudStorage: '{size} cloud storage', subFeatPatternsOne: '{n} saved pattern', subFeatPatternsMany: '{n} saved patterns',
    subFeatUnlimitedPatterns: 'Unlimited saved patterns', subFeatStrategiesOne: '{n} strategy', subFeatStrategiesMany: '{n} strategies',
    subFeatUnlimitedStrategies: 'Unlimited strategies', subFeatAccountsOne: '{n} trading account', subFeatAccountsMany: '{n} trading accounts',
    subFeatUnlimitedAccounts: 'Unlimited trading accounts', subFeatSessionsOne: '{n} trading session', subFeatSessionsMany: '{n} trading sessions',
    subFeatUnlimitedSessions: 'Unlimited trading sessions', subFeatSymbolsOne: '{n} analysis symbol', subFeatSymbolsMany: '{n} analysis symbols',
    subFeatUnlimitedSymbols: 'Unlimited analysis symbols', subFeatAiPanelBuilder: 'AI Panel Builder access',
    subFeatPremiumModels: 'Access to premium AI models', subFeatByok: 'Bring your own API key', subFeatTokenDiscount: '{percent}% off AI usage',
    subAiWallet: 'AI Wallet', subPromoPaid: 'Promo {promo} · Paid {paid}',
    subWalletHint: "Every AI response — chat, pattern analysis, session review — draws from this balance the moment it's generated. See exactly what it was spent on in Wallet Activity below.",
    subAmountUsd: 'Amount (USD)', subRequestTopUp: 'Request Top-Up',
    subPayMethodTitle: 'Payment method', subPayMethodCrypto: 'Crypto', subPayMethodVisa: 'Visa card',
    subPayMethodIranGateway: 'Iran payment gateway', subPayMethodComingSoon: 'Coming soon',
    subPayMethodNotAdded: 'This payment method has not been added yet.',
    subPayMethodCryptoDesc: 'USDT on BNB Smart Chain', subPayMethodVisaDesc: 'International card payment',
    subPayMethodIranGatewayDesc: 'Domestic bank gateway', subPayMethodActive: 'Active',
    subPayStepMethod: 'Step 1 of 2 · Payment method', subPayStepReview: 'Step 2 of 2 · Review & pay',
    subPayChooseMethod: 'Choose a payment method', subPayChange: 'Change',
    subPayInvoice: 'Invoice', subPayTotal: 'Total',
    subPayLineItemTopUp: 'AI wallet top-up', subPayLineItemPlan: '{plan} subscription',
    subPayDiscountCode: 'Discount code', subPayDiscountPlaceholder: 'Discount code',
    subPayDiscountUnavailable: 'Discount codes have not been added yet.',
    subPayCurrencyNote: 'Charged in US dollars and converted at payment time.',
    subPayBack: 'Back', subPayConfirm: 'Pay {amount}',
    subTopUpMinHint: 'Minimum top-up is {amount}', subTopUpAmountValid: 'Amount is valid',
    subPayStepInvoice: 'Step 3 of 3 · Payment',
    subSpecStorage: 'Cloud storage', subSpecPatterns: 'Saved patterns', subSpecStrategies: 'Strategies',
    subSpecAccounts: 'Trading accounts', subSpecSessions: 'Trading sessions', subSpecSymbols: 'Analysis symbols',
    subSpecUnlimited: 'Unlimited', subTokenDiscountLabel: 'Token discount',
    subWalletAddCredit: 'Add credit', subWalletMinimumIs: 'Minimum top-up: {amount}',
    subWalletCustomAmount: 'Custom amount (USD)', subWalletContinueToPay: 'Continue to payment',
    subWalletLowBalance: 'Low balance', subWalletPromoLabel: 'Promo', subWalletPaidLabel: 'Paid',
    subWalletMethodsLabel: 'Payment methods:',
    subTopUpNotice: 'Top-up of {amount} requested — pending Admin confirmation (manual/test billing).',
    subTopUpError: 'Could not submit the top-up request: {error}',
    subTopUpMinTitle: 'Amount too low',
    subTopUpMinBody: 'The minimum wallet top-up is {amount}. Please enter that amount or more.',
    subTopUpMinOk: 'Got it',
    subWalletActivityTitle: 'Wallet Activity — why your balance moved',
    subFilterAll: 'All', subFilterUsage: 'AI Usage', subFilterCredit: 'Top-Ups & Credits', subNoActivity: 'No activity yet.',
    subAiUsageTotal: 'Total AI usage: {amount}',
    subLedgerAiUsage: 'AI Usage · {feature}', subLedgerAssistant: 'Assistant', subLedgerTopUp: 'Wallet Top-Up', subLedgerManualBilling: 'Manual billing',
    subLedgerSignupBonus: 'Signup Bonus', subLedgerPromoCredit: 'Promo credit', subLedgerAdminCredit: 'Admin Credit', subLedgerManualAdjustment: 'Manual adjustment',
    subLedgerRefundReversal: 'Refund Reversal', subLedgerAdminDebit: 'Admin Debit', subLedgerTopUpRefunded: 'Top-up refunded',
    subImpactPromo: '(promo)', subImpactPaid: '(paid)', subImpactBoth: '(promo + paid)',
    subCloudStorage: 'Cloud Storage', subOfQuotaUsed: ' of {quota} used', subStorageAddOn: 'Storage add-on', subExpiresOn: 'expires {date}',
    subAddMoreStorage: 'Add More Storage', subCapacityValidity: '+{capacity} · {days} days', subPurchase: 'Purchase',
    subStorageNotice: '{name} purchase requested — pending Admin confirmation (manual/test billing).',
    subStorageError: 'Could not submit the purchase request: {error}',
    subBillingHistory: 'Billing History', subNoBillingActivity: 'No billing activity yet.',
    subColDate: 'Date', subColDescription: 'Description', subColAmount: 'Amount', subColStatus: 'Status',
    subTxWalletTopUp: 'Wallet Top-Up', subTxSubscription: 'Plan · Monthly Subscription', subTxStoragePurchase: 'Storage Add-on', subTxRefund: 'Refund',
    subStatusPaid: 'Paid', subStatusPending: 'Pending', subStatusFailed: 'Failed', subStatusRefunded: 'Refunded',
    subUpgradeNotice: 'Upgrade to {plan} requested — pending Admin confirmation (manual/test billing).',
    subUpgradeError: 'Could not submit the upgrade request: {error}',
    subInvoiceTitle: 'Pay with Crypto', subInvoiceNetwork: 'Network', subInvoiceAsset: 'Asset', subInvoiceAmount: 'Amount',
    subInvoiceRecipient: 'Recipient Address', subInvoiceCopy: 'Copy', subInvoiceCopied: 'Copied',
    subInvoiceExpiresIn: 'Expires in {time}', subInvoiceExpired: 'This invoice has expired.',
    subInvoiceStatusPending: 'Waiting for payment…', subInvoiceStatusConfirmed: 'Payment confirmed!', subInvoiceStatusExpired: 'This invoice has expired.',
    subInvoiceHint: 'Send exactly this amount on BNB Smart Chain to the address above. Your payment is detected automatically.',
    subInvoiceClose: 'Close', subInvoiceCheckNow: 'Check Now',
    subInvoiceTxHashLabel: 'Transaction hash', subInvoiceTxHashPlaceholder: 'Paste your transaction hash here',
    subInvoiceTxHashRequired: 'Enter the transaction hash to check.',
    subInvoiceMismatchNote: 'If the amount you send differs from this invoice - lower or higher - this purchase will not go through, but the real amount you sent will be credited directly to your AI wallet.',
    subInvoiceMismatchCredited: 'Your deposit did not match this invoice. Instead of this purchase, {amount} was credited directly to your wallet.',
    subInvoiceOverpaidCredited: 'You sent more than this invoice. The purchase went through, and the difference, {amount}, was credited to your wallet.',
    subInvoiceCheckError: 'Could not check the payment: {error}',
    subInvoiceReasonNotFound: 'This transaction has not been seen on the network yet. Wait a bit and check again.',
    subInvoiceReasonFailed: 'This transaction failed on the network.',
    subInvoiceReasonNoTransfer: 'No transfer matching this address and token was found. Double-check the address, the network (BNB Smart Chain) and the token (USDT).',
    subInvoiceReasonChainMismatch: 'This transaction was recorded on the wrong network.',
    subInvoiceReasonConfirming: 'Your transaction was seen and is waiting on network confirmations - check again shortly.',
    subInvoiceReasonAlreadyClaimed: 'This transaction hash was already used for a different invoice.'
  },
  ar: {
    dossierEyebrow: 'NAVRYA · الملف', dossierTitle: 'الملف والتقدم والاشتراك',
    dossierSubtitle: 'هويتك ومستواك وإنجازاتك واشتراكك النشط في ملف واحد. كل نقطة تأتي من عمل حقيقي في المنتج - وليس من الدخول اليومي.',
    statLevel: 'المستوى', statXp: 'إجمالي النقاط', statAch: 'الأوسمة',
    rankLabel: 'الرتبة الحالية', levelWord: 'LEVEL', pathToLevel: 'المسار إلى المستوى {n}',
    xpOf: '{xp} من {max} نقطة', xpToNext: '{xp} نقطة للمستوى التالي', maxLevelLine: 'تم بلوغ أعلى مستوى',
    pendingSync: '{n} نقطة بانتظار المزامنة', nextRewardLabel: 'المكافأة التالية',
    tabIdentity: 'الهوية', tabLevel: 'المستوى والتقدم', tabAch: 'الإنجازات', tabSub: 'الاشتراك', tabRole: 'الدور', logoutBtn: 'تسجيل الخروج',

    pathTitle: 'مسار التقدم', pathHint: 'كل مستوى يفتح قدرة جديدة في المنتج', pathOfLine: 'المستوى {cur} من {max}',
    gateTitle: 'بوابة المستوى {n}', gateSub: 'النقاط جزء فقط من القصة - يجب إكمال هذه أيضاً للعبور.',
    gateSummary: '{xp} نقطة و{n} شرط متبقٍ', gateFooter: 'بعد إكمال الشروط، يُفتح المستوى في المزامنة القادمة.',
    gateNoneTitle: 'لا توجد بوابة قيد الانتظار', gateNoneBody: 'مستواك الحالي متوافق مع نقاطك الفعلية - لا يوجد شرط آخر يعيقك.',
    ledgerTitle: 'النقاط الأخيرة', ledgerTotal30: 'إجمالي 30 يوماً: {n} نقطة', ledgerEmpty: 'لم تكسب أي نقاط بعد.',
    showAll: 'عرض كل الأحداث', showLess: 'عرض أقل',

    reqClosedSessions: 'جلسات مغلقة', reqReviewedTrades: 'صفقات تمت مراجعتها', reqReflections: 'انطباعات مسجلة',
    reqTradePlans: 'خطط صفقات مسجلة', reqPatternsWithThreeStages: 'أنماط بثلاث مراحل', reqCompleteStrategies: 'استراتيجيات مكتملة',
    reqValidPatternsWithTwoResolutions: 'أنماط بنتيجتين صالحتين', reqPatternResolutions: 'نتائج أنماط مسجلة',
    reqDomainXpMin: 'حد أدنى لنقاط {domain}', reqDomainMaxPercent: 'حد أقصى لحصة {domain}', reqDomainMinPercent: 'حد أدنى لحصة {domain}',
    domainSession: 'الجلسة', domainTrade: 'الصفقة', domainPattern: 'النمط', domainStrategy: 'الاستراتيجية', domainPsychology: 'علم النفس', domainCommunity: 'المجتمع',

    achHallTitle: 'قاعة الإنجازات', achOf: 'من {n}', achXpLine: '{xp} نقطة من الأوسمة · {pct}٪ مكتمل',
    achHallBody: 'الإنجازات تُفتح بعمل حقيقي: إغلاق صفقة، إنهاء جلسة، تسجيل درس. كل وسام يمنح نقاطاً.',
    closestBadge: 'أقرب وسام', filterAll: 'الكل', filterOpen: 'مفتوح', filterLocked: 'مقفل',
    achResultLine: 'عرض {n} وسام', unlockedOn: 'فُتح في {date}', locked: 'مقفل', achEmpty: 'لا توجد إنجازات مفتوحة بعد.',
    tierBronze: 'BRONZE', tierSilver: 'SILVER', tierGold: 'GOLD', tierLegend: 'LEGEND', badgeCountSuffix: 'وسام',
    reqSectionLabel: 'شرط الفتح', close: 'إغلاق',

    identityPortraitHint: 'تظهر صورتك في رأس الشخصية والسوق. PNG أو JPG بحد أدنى 400×400 بكسل.',
    changeImage: 'تغيير الصورة', removeImage: 'حذف', selectedCharacter: 'الشخصية المختارة',
    identityFieldsTitle: 'معلومات الهوية', nameLabel: 'الاسم المعروض', handleLabel: 'اسم المستخدم', handleHint: 'يُولَّد من معرّف حسابك - غير قابل للتعديل.',
    emailLabel: 'البريد الإلكتروني', phoneLabel: 'الهاتف', phonePlaceholder: '٠٩١٢ ٠٠٠ ٠٠٠٠',
    kycTitle: 'التحقق من الهوية', kycOfLine: '{n} من 3 خطوات', kycEmail: 'البريد الإلكتروني', kycPhone: 'الهاتف', kycDoc: 'مستند الهوية',
    kycDone: 'موثّق', kycPending: 'قيد الانتظار', kycTodo: 'لم يبدأ',
    kycNotice: 'حالة التحقق يغيّرها الدعم فقط — تواصل مع الدعم لتحديثها.',
    saveChanges: 'حفظ التغييرات', resetChanges: 'استعادة', lastSaved: 'آخر حفظ: {date}', neverSaved: 'لم يُحفظ بعد',
    saved: 'تم الحفظ.', emailTaken: 'هذا البريد الإلكتروني مستخدم بالفعل.', validationFailed: 'يرجى مراجعة الحقول والمحاولة مرة أخرى.',

    subComingTitle: 'هذا القسم غير جاهز بعد', subComingBody: 'صفحة الاشتراك والدفع غير متصلة بعد بنظام فوترة حقيقي؛ ستظهر هنا فور جاهزيتها.',
    subRealTitle: 'اشتراكاتك', subEmpty: 'لا توجد اشتراكات بعد.', mockBadge: 'تجريبي', purchasedOn: 'تم الشراء في {date}',

    roleTitle: 'دورك في المنتج', roleSub: 'يغيّر الدور تخطيط لوحة التحكم المقترح ونبرة المساعد. هذه تسمية منتج، وليست شهادة موثّقة.',
    roleTrader: 'متداول', roleTraderDesc: 'تنفيذ الصفقات والجلسات اليومية وإدارة المخاطر الشخصية.',
    roleMentor: 'موجّه', roleMentorDesc: 'مراجعة جلسات الآخرين والتغذية الراجعة ونشر الدروس.',
    roleTeacher: 'مدرّس', roleTeacherDesc: 'إنتاج محتوى تعليمي ومراجعات استراتيجية منظمة.',
    saveRole: 'حفظ الدور', roleCurrentLine: 'الدور الحالي: {role}', roleSaved: 'تم تحديث الدور.',

    xpTypeAchievement: 'فتح إنجاز', xpTypeStreak: 'مكافأة الاستمرارية: {detail}',

    subActiveStatus: 'نشط', subPlanSuffix: 'خطة {plan}', subPerMonth: '/ شهر',
    subPlanFree: 'مجانية', subPlanPlus: 'بلس', subPlanPro: 'برو', subPlanPersonalized: 'مخصّصة',
    subRenews: 'التجديد في {date}', subCancelsNote: 'الإلغاء في {date} · يمكنك التجديد في أي وقت قبل ذلك',
    subReactivate: 'إعادة التفعيل', subCancelAtPeriodEnd: 'الإلغاء في نهاية الفترة', subFreeNoBilling: 'خطة مجانية — لا توجد فوترة مسجّلة.',
    subStorageUsed: 'المساحة المستخدَمة', subWalletBalance: 'رصيد المحفظة', subPlanLimits: 'حدود الخطة',
    subUnlimited: 'غير محدود', subFreeTierCaps: 'حدود الخطة المجانية',
    subRecommended: 'موصى به', subUpgradeModalTitle: 'الترقية إلى {plan}', subCancel: 'إلغاء', subConfirmRequest: 'تأكيد الطلب',
    subUpgradeBilledNote: 'سيتم خصم {price} / {interval} بمجرد تأكيد المسؤول لهذا الطلب. تبقى خطتك الحالية فعّالة حتى ذلك الحين.',
    subIntervalMonth: 'شهر', subIntervalYear: 'سنة',
    subChooseYourPlan: 'اختر خطتك', subUpgradesEffectNote: 'تُفعَّل الترقيات فقط بعد تأكيد المسؤول للطلب.',
    subCurrentPlan: 'الخطة الحالية', subActivePlan: 'خطة فعّالة', subPreviousPlan: 'خطتك السابقة', subUpgradeTo: 'الترقية إلى {plan}',
    subFeatCloudStorage: '{size} مساحة سحابية', subFeatPatternsOne: '{n} نمط محفوظ', subFeatPatternsMany: '{n} أنماط محفوظة',
    subFeatUnlimitedPatterns: 'أنماط محفوظة غير محدودة', subFeatStrategiesOne: '{n} استراتيجية', subFeatStrategiesMany: '{n} استراتيجيات',
    subFeatUnlimitedStrategies: 'استراتيجيات غير محدودة', subFeatAccountsOne: '{n} حساب تداول', subFeatAccountsMany: '{n} حسابات تداول',
    subFeatUnlimitedAccounts: 'حسابات تداول غير محدودة', subFeatSessionsOne: '{n} جلسة تداول', subFeatSessionsMany: '{n} جلسات تداول',
    subFeatUnlimitedSessions: 'جلسات تداول غير محدودة', subFeatSymbolsOne: '{n} رمز تحليل', subFeatSymbolsMany: '{n} رموز تحليل',
    subFeatUnlimitedSymbols: 'رموز تحليل غير محدودة', subFeatAiPanelBuilder: 'الوصول إلى منشئ لوحة الذكاء الاصطناعي',
    subFeatPremiumModels: 'الوصول إلى نماذج الذكاء الاصطناعي المتقدمة', subFeatByok: 'استخدام مفتاح API الخاص بك', subFeatTokenDiscount: 'خصم {percent}٪ على استخدام الذكاء الاصطناعي',
    subAiWallet: 'محفظة الذكاء الاصطناعي', subPromoPaid: 'هدية {promo} · مدفوع {paid}',
    subWalletHint: 'كل استجابة من الذكاء الاصطناعي — محادثة، تحليل نمط، مراجعة جلسة — تُخصم من هذا الرصيد فور توليدها. اطّلع بالضبط على ما أُنفق عليه في «نشاط المحفظة» أدناه.',
    subAmountUsd: 'المبلغ (دولار)', subRequestTopUp: 'طلب شحن الرصيد',
    subPayMethodTitle: 'طريقة الدفع', subPayMethodCrypto: 'عملة رقمية', subPayMethodVisa: 'بطاقة فيزا',
    subPayMethodIranGateway: 'بوابة الدفع الإيرانية', subPayMethodComingSoon: 'قريبًا',
    subPayMethodNotAdded: 'لم تتم إضافة طريقة الدفع هذه بعد.',
    subPayMethodCryptoDesc: 'USDT على شبكة BNB Smart Chain', subPayMethodVisaDesc: 'دفع ببطاقة دولية',
    subPayMethodIranGatewayDesc: 'بوابة مصرفية محلية', subPayMethodActive: 'مفعّل',
    subPayStepMethod: 'الخطوة ١ من ٢ · طريقة الدفع', subPayStepReview: 'الخطوة ٢ من ٢ · المراجعة والدفع',
    subPayChooseMethod: 'اختر طريقة الدفع', subPayChange: 'تغيير',
    subPayInvoice: 'الفاتورة', subPayTotal: 'الإجمالي',
    subPayLineItemTopUp: 'شحن محفظة الذكاء الاصطناعي', subPayLineItemPlan: 'اشتراك {plan}',
    subPayDiscountCode: 'رمز الخصم', subPayDiscountPlaceholder: 'رمز الخصم',
    subPayDiscountUnavailable: 'لم تتم إضافة رموز الخصم بعد.',
    subPayCurrencyNote: 'يُحتسب المبلغ بالدولار الأمريكي ويُحوَّل عند الدفع.',
    subPayBack: 'رجوع', subPayConfirm: 'ادفع {amount}',
    subTopUpMinHint: 'الحد الأدنى للشحن هو {amount}', subTopUpAmountValid: 'المبلغ صالح',
    subPayStepInvoice: 'الخطوة ٣ من ٣ · الدفع',
    subSpecStorage: 'مساحة سحابية', subSpecPatterns: 'الأنماط المحفوظة', subSpecStrategies: 'الاستراتيجيات',
    subSpecAccounts: 'حسابات التداول', subSpecSessions: 'جلسات التداول', subSpecSymbols: 'رموز التحليل',
    subSpecUnlimited: 'غير محدود', subTokenDiscountLabel: 'خصم استهلاك التوكن',
    subWalletAddCredit: 'إضافة رصيد', subWalletMinimumIs: 'الحد الأدنى للشحن: {amount}',
    subWalletCustomAmount: 'مبلغ مخصص (دولار)', subWalletContinueToPay: 'متابعة إلى الدفع',
    subWalletLowBalance: 'رصيد منخفض', subWalletPromoLabel: 'هدية', subWalletPaidLabel: 'مدفوع',
    subWalletMethodsLabel: 'طرق الدفع:',
    subTopUpNotice: 'تم إرسال طلب شحن بقيمة {amount} — في انتظار تأكيد المسؤول (فوترة يدوية/تجريبية).',
    subTopUpError: 'تعذّر إرسال طلب الشحن: {error}',
    subTopUpMinTitle: 'المبلغ منخفض جدًا',
    subTopUpMinBody: 'الحد الأدنى لشحن المحفظة هو {amount}. الرجاء إدخال هذا المبلغ أو أكثر.',
    subTopUpMinOk: 'فهمت',
    subWalletActivityTitle: 'نشاط المحفظة — سبب تغيّر الرصيد',
    subFilterAll: 'الكل', subFilterUsage: 'استخدام الذكاء الاصطناعي', subFilterCredit: 'الشحن والاعتمادات', subNoActivity: 'لا يوجد نشاط بعد.',
    subAiUsageTotal: 'إجمالي استخدام الذكاء الاصطناعي: {amount}',
    subLedgerAiUsage: 'استخدام الذكاء الاصطناعي · {feature}', subLedgerAssistant: 'المساعد', subLedgerTopUp: 'شحن المحفظة', subLedgerManualBilling: 'فوترة يدوية',
    subLedgerSignupBonus: 'مكافأة التسجيل', subLedgerPromoCredit: 'رصيد هدية', subLedgerAdminCredit: 'رصيد من المسؤول', subLedgerManualAdjustment: 'تعديل يدوي',
    subLedgerRefundReversal: 'استرداد المبلغ', subLedgerAdminDebit: 'خصم من المسؤول', subLedgerTopUpRefunded: 'تم استرداد الشحن',
    subImpactPromo: '(من الهدية)', subImpactPaid: '(من المدفوع)', subImpactBoth: '(هدية + مدفوع)',
    subCloudStorage: 'المساحة السحابية', subOfQuotaUsed: ' من {quota} مستخدَم', subStorageAddOn: 'إضافة مساحة', subExpiresOn: 'تنتهي في {date}',
    subAddMoreStorage: 'إضافة المزيد من المساحة', subCapacityValidity: '+{capacity} · {days} يومًا', subPurchase: 'شراء',
    subStorageNotice: 'تم إرسال طلب شراء {name} — في انتظار تأكيد المسؤول (فوترة يدوية/تجريبية).',
    subStorageError: 'تعذّر إرسال طلب الشراء: {error}',
    subBillingHistory: 'سجلّ الفوترة', subNoBillingActivity: 'لا يوجد نشاط فوترة بعد.',
    subColDate: 'التاريخ', subColDescription: 'الوصف', subColAmount: 'المبلغ', subColStatus: 'الحالة',
    subTxWalletTopUp: 'شحن المحفظة', subTxSubscription: 'خطة · اشتراك شهري', subTxStoragePurchase: 'إضافة مساحة تخزين', subTxRefund: 'استرداد',
    subStatusPaid: 'مدفوع', subStatusPending: 'قيد الانتظار', subStatusFailed: 'فشل', subStatusRefunded: 'مسترَدّ',
    subUpgradeNotice: 'تم إرسال طلب الترقية إلى {plan} — في انتظار تأكيد المسؤول (فوترة يدوية/تجريبية).',
    subUpgradeError: 'تعذّر إرسال طلب الترقية: {error}',
    subInvoiceTitle: 'الدفع بالعملات الرقمية', subInvoiceNetwork: 'الشبكة', subInvoiceAsset: 'الأصل', subInvoiceAmount: 'المبلغ',
    subInvoiceRecipient: 'عنوان الاستلام', subInvoiceCopy: 'نسخ', subInvoiceCopied: 'تم النسخ',
    subInvoiceExpiresIn: 'تنتهي خلال {time}', subInvoiceExpired: 'انتهت صلاحية هذه الفاتورة.',
    subInvoiceStatusPending: 'في انتظار الدفع…', subInvoiceStatusConfirmed: 'تم تأكيد الدفع!', subInvoiceStatusExpired: 'انتهت صلاحية هذه الفاتورة.',
    subInvoiceHint: 'أرسل هذا المبلغ بالضبط على شبكة BNB Smart Chain إلى العنوان أعلاه. سيتم اكتشاف دفعتك تلقائيًا.',
    subInvoiceClose: 'إغلاق', subInvoiceCheckNow: 'تحقّق الآن',
    subInvoiceTxHashLabel: 'رقم المعاملة', subInvoiceTxHashPlaceholder: 'الصق رقم المعاملة هنا',
    subInvoiceTxHashRequired: 'أدخل رقم المعاملة للتحقّق.',
    subInvoiceMismatchNote: 'إذا كان المبلغ المُرسَل مختلفًا عن مبلغ هذه الفاتورة - أقل أو أكثر - فلن تكتمل عملية الشراء هذه، لكن المبلغ الفعلي المُرسَل سيُضاف مباشرةً إلى محفظة الذكاء الاصطناعي الخاصة بك.',
    subInvoiceMismatchCredited: 'المبلغ المُرسَل لا يطابق هذه الفاتورة. بدلاً من هذا الشراء، تمت إضافة {amount} مباشرةً إلى محفظتك.',
    subInvoiceOverpaidCredited: 'لقد أرسلت أكثر من مبلغ هذه الفاتورة. تم إتمام الشراء، وأُضيف الفرق، {amount}، إلى محفظتك.',
    subInvoiceCheckError: 'تعذّر التحقق من الدفع: {error}',
    subInvoiceReasonNotFound: 'لم تُشاهَد هذه المعاملة على الشبكة بعد. انتظر قليلاً وتحقّق مجددًا.',
    subInvoiceReasonFailed: 'فشلت هذه المعاملة على الشبكة.',
    subInvoiceReasonNoTransfer: 'لم يُعثر على تحويل مطابق لهذا العنوان والعملة. تحقّق من العنوان والشبكة (BNB Smart Chain) ونوع العملة (USDT).',
    subInvoiceReasonChainMismatch: 'سُجِّلت هذه المعاملة على شبكة خاطئة.',
    subInvoiceReasonConfirming: 'شُوهِدَت معاملتك وهي بانتظار تأكيدات الشبكة - تحقّق مجددًا بعد قليل.',
    subInvoiceReasonAlreadyClaimed: 'رقم المعاملة هذا استُخدم بالفعل لفاتورة أخرى.'
  },
  es: {
    dossierEyebrow: 'NAVRYA · EXPEDIENTE', dossierTitle: 'Expediente, progreso y suscripción',
    dossierSubtitle: 'Tu identidad, nivel, logros y pase activo en un solo expediente. Cada XP viene de una acción real del producto, nunca de iniciar sesión a diario.',
    statLevel: 'Nivel', statXp: 'XP total', statAch: 'Insignias',
    rankLabel: 'Rango actual', levelWord: 'NIVEL', pathToLevel: 'Camino al nivel {n}',
    xpOf: '{xp} de {max} XP', xpToNext: '{xp} XP para el siguiente nivel', maxLevelLine: 'Nivel máximo alcanzado',
    pendingSync: '{n} XP pendiente de sincronización', nextRewardLabel: 'Próxima recompensa',
    tabIdentity: 'Identidad', tabLevel: 'Nivel y progreso', tabAch: 'Logros', tabSub: 'Suscripción', tabRole: 'Rol', logoutBtn: 'Cerrar sesión',

    pathTitle: 'Camino de progresión', pathHint: 'Cada nivel desbloquea una nueva capacidad del producto', pathOfLine: 'Nivel {cur} de {max}',
    gateTitle: 'Puerta del nivel {n}', gateSub: 'El XP es solo una parte - también debes completar esto para avanzar.',
    gateSummary: '{xp} XP y {n} condición(es) restante(s)', gateFooter: 'Al completar los requisitos, el nivel se desbloquea en la próxima sincronización.',
    gateNoneTitle: 'No hay puerta pendiente', gateNoneBody: 'Tu nivel actual coincide con tu XP real; no queda ninguna condición.',
    ledgerTitle: 'XP reciente', ledgerTotal30: 'Total de 30 días: {n} XP', ledgerEmpty: 'Aún no has ganado XP.',
    showAll: 'Mostrar todos los eventos', showLess: 'Mostrar menos',

    reqClosedSessions: 'Sesiones cerradas', reqReviewedTrades: 'Operaciones revisadas', reqReflections: 'Reflexiones registradas',
    reqTradePlans: 'Planes de operación registrados', reqPatternsWithThreeStages: 'Patrones con 3 etapas', reqCompleteStrategies: 'Estrategias completas',
    reqValidPatternsWithTwoResolutions: 'Patrones con 2 resoluciones', reqPatternResolutions: 'Resoluciones de patrón',
    reqDomainXpMin: 'XP mínimo de {domain}', reqDomainMaxPercent: 'Cuota máxima de {domain}', reqDomainMinPercent: 'Cuota mínima de {domain}',
    domainSession: 'sesión', domainTrade: 'operación', domainPattern: 'patrón', domainStrategy: 'estrategia', domainPsychology: 'psicología', domainCommunity: 'comunidad',

    achHallTitle: 'Salón de logros', achOf: 'de {n}', achXpLine: '{xp} XP de insignias · {pct}% completo',
    achHallBody: 'Los logros se desbloquean con trabajo real: cerrar una operación, terminar una sesión, registrar una lección. Cada uno paga XP.',
    closestBadge: 'Insignia más cercana', filterAll: 'Todos', filterOpen: 'Desbloqueados', filterLocked: 'Bloqueados',
    achResultLine: 'Mostrando {n} insignias', unlockedOn: 'Desbloqueado el {date}', locked: 'Bloqueado', achEmpty: 'Aún no hay logros desbloqueados.',
    tierBronze: 'BRONZE', tierSilver: 'SILVER', tierGold: 'GOLD', tierLegend: 'LEGEND', badgeCountSuffix: 'insignias',
    reqSectionLabel: 'Condición de desbloqueo', close: 'Cerrar',

    identityPortraitHint: 'Tu retrato se muestra en el encabezado del personaje y en el mercado. PNG o JPG, mínimo 400×400px.',
    changeImage: 'Cambiar imagen', removeImage: 'Quitar', selectedCharacter: 'Personaje seleccionado',
    identityFieldsTitle: 'Información de identidad', nameLabel: 'Nombre visible', handleLabel: 'Nombre de usuario', handleHint: 'Se genera desde el id de tu cuenta - no editable.',
    emailLabel: 'Correo electrónico', phoneLabel: 'Teléfono', phonePlaceholder: '+34 000 000 000',
    kycTitle: 'Verificación de identidad', kycOfLine: '{n} de 3 pasos', kycEmail: 'Correo', kycPhone: 'Teléfono', kycDoc: 'Documento de identidad',
    kycDone: 'Verificado', kycPending: 'Pendiente', kycTodo: 'No iniciado',
    kycNotice: 'El estado de verificación solo puede cambiarlo soporte - contacta a soporte para actualizarlo.',
    saveChanges: 'Guardar cambios', resetChanges: 'Restablecer', lastSaved: 'Último guardado: {date}', neverSaved: 'Nunca guardado',
    saved: 'Guardado.', emailTaken: 'Ese correo ya está en uso.', validationFailed: 'Revisa los campos e intenta de nuevo.',

    subComingTitle: 'Aún no está listo', subComingBody: 'La página de suscripción y facturación todavía no está conectada a un sistema de facturación real; aparecerá aquí en cuanto lo esté.',
    subRealTitle: 'Tus suscripciones', subEmpty: 'Aún no tienes suscripciones.', mockBadge: 'simulado', purchasedOn: 'Comprado el {date}',

    roleTitle: 'Tu rol en el producto', roleSub: 'El rol cambia el diseño sugerido del panel y el tono del asistente. Es una etiqueta de producto, no una credencial verificada.',
    roleTrader: 'Trader', roleTraderDesc: 'Ejecución de operaciones, sesiones diarias y gestión de riesgo personal.',
    roleMentor: 'Mentor', roleMentorDesc: 'Revisar sesiones de otros, dar feedback y publicar lecciones.',
    roleTeacher: 'Profesor', roleTeacherDesc: 'Producir contenido educativo y revisiones estructuradas de estrategias.',
    saveRole: 'Guardar rol', roleCurrentLine: 'Rol actual: {role}', roleSaved: 'Rol actualizado.',

    xpTypeAchievement: 'Logro desbloqueado', xpTypeStreak: 'Bono de racha: {detail}',

    subActiveStatus: 'Activo', subPlanSuffix: 'Plan {plan}', subPerMonth: '/ mes',
    subPlanFree: 'Gratis', subPlanPlus: 'Plus', subPlanPro: 'Pro', subPlanPersonalized: 'Personalizado',
    subRenews: 'Se renueva el {date}', subCancelsNote: 'Se cancela el {date} · puedes renovar en cualquier momento antes de eso',
    subReactivate: 'Reactivar', subCancelAtPeriodEnd: 'Cancelar al final del período', subFreeNoBilling: 'Plan gratuito — sin facturación registrada.',
    subStorageUsed: 'Almacenamiento usado', subWalletBalance: 'Saldo de la cartera', subPlanLimits: 'Límites del plan',
    subUnlimited: 'Ilimitado', subFreeTierCaps: 'Límites del plan gratuito',
    subRecommended: 'Recomendado', subUpgradeModalTitle: 'Actualizar a {plan}', subCancel: 'Cancelar', subConfirmRequest: 'Confirmar solicitud',
    subUpgradeBilledNote: 'Se te cobrará {price} / {interval} en cuanto un administrador confirme esta solicitud. Tu plan actual sigue activo hasta entonces.',
    subIntervalMonth: 'mes', subIntervalYear: 'año',
    subChooseYourPlan: 'Elige tu plan', subUpgradesEffectNote: 'Las actualizaciones surten efecto solo cuando un administrador confirma la solicitud.',
    subCurrentPlan: 'Plan actual', subActivePlan: 'Plan activo', subPreviousPlan: 'Tu plan anterior', subUpgradeTo: 'Actualizar a {plan}',
    subFeatCloudStorage: '{size} de almacenamiento en la nube', subFeatPatternsOne: '{n} patrón guardado', subFeatPatternsMany: '{n} patrones guardados',
    subFeatUnlimitedPatterns: 'Patrones guardados ilimitados', subFeatStrategiesOne: '{n} estrategia', subFeatStrategiesMany: '{n} estrategias',
    subFeatUnlimitedStrategies: 'Estrategias ilimitadas', subFeatAccountsOne: '{n} cuenta de trading', subFeatAccountsMany: '{n} cuentas de trading',
    subFeatUnlimitedAccounts: 'Cuentas de trading ilimitadas', subFeatSessionsOne: '{n} sesión de trading', subFeatSessionsMany: '{n} sesiones de trading',
    subFeatUnlimitedSessions: 'Sesiones de trading ilimitadas', subFeatSymbolsOne: '{n} símbolo de análisis', subFeatSymbolsMany: '{n} símbolos de análisis',
    subFeatUnlimitedSymbols: 'Símbolos de análisis ilimitados', subFeatAiPanelBuilder: 'Acceso al creador de paneles de IA',
    subFeatPremiumModels: 'Acceso a modelos de IA premium', subFeatByok: 'Usa tu propia clave de API', subFeatTokenDiscount: '{percent}% de descuento en el uso de IA',
    subAiWallet: 'Cartera de IA', subPromoPaid: 'Promo {promo} · Pagado {paid}',
    subWalletHint: 'Cada respuesta de IA — chat, análisis de patrones, revisión de sesión — se descuenta de este saldo en el momento en que se genera. Consulta exactamente en qué se gastó en Actividad de la cartera, abajo.',
    subAmountUsd: 'Monto (USD)', subRequestTopUp: 'Solicitar recarga',
    subPayMethodTitle: 'Método de pago', subPayMethodCrypto: 'Cripto', subPayMethodVisa: 'Tarjeta Visa',
    subPayMethodIranGateway: 'Pasarela de pago de Irán', subPayMethodComingSoon: 'Próximamente',
    subPayMethodNotAdded: 'Este método de pago aún no se ha agregado.',
    subPayMethodCryptoDesc: 'USDT en BNB Smart Chain', subPayMethodVisaDesc: 'Pago con tarjeta internacional',
    subPayMethodIranGatewayDesc: 'Pasarela bancaria nacional', subPayMethodActive: 'Activo',
    subPayStepMethod: 'Paso 1 de 2 · Método de pago', subPayStepReview: 'Paso 2 de 2 · Revisar y pagar',
    subPayChooseMethod: 'Elige un método de pago', subPayChange: 'Cambiar',
    subPayInvoice: 'Factura', subPayTotal: 'Total',
    subPayLineItemTopUp: 'Recarga de la billetera de IA', subPayLineItemPlan: 'Suscripción {plan}',
    subPayDiscountCode: 'Código de descuento', subPayDiscountPlaceholder: 'Código de descuento',
    subPayDiscountUnavailable: 'Los códigos de descuento aún no se han agregado.',
    subPayCurrencyNote: 'Se cobra en dólares estadounidenses y se convierte al momento del pago.',
    subPayBack: 'Atrás', subPayConfirm: 'Pagar {amount}',
    subTopUpMinHint: 'La recarga mínima es {amount}', subTopUpAmountValid: 'El importe es válido',
    subPayStepInvoice: 'Paso 3 de 3 · Pago',
    subSpecStorage: 'Almacenamiento', subSpecPatterns: 'Patrones guardados', subSpecStrategies: 'Estrategias',
    subSpecAccounts: 'Cuentas de trading', subSpecSessions: 'Sesiones de trading', subSpecSymbols: 'Símbolos de análisis',
    subSpecUnlimited: 'Ilimitado', subTokenDiscountLabel: 'Descuento de tokens',
    subWalletAddCredit: 'Añadir saldo', subWalletMinimumIs: 'Recarga mínima: {amount}',
    subWalletCustomAmount: 'Importe personalizado (USD)', subWalletContinueToPay: 'Continuar al pago',
    subWalletLowBalance: 'Saldo bajo', subWalletPromoLabel: 'Promo', subWalletPaidLabel: 'Pagado',
    subWalletMethodsLabel: 'Métodos de pago:',
    subTopUpNotice: 'Se solicitó una recarga de {amount} — pendiente de confirmación del administrador (facturación manual/de prueba).',
    subTopUpError: 'No se pudo enviar la solicitud de recarga: {error}',
    subTopUpMinTitle: 'Monto demasiado bajo',
    subTopUpMinBody: 'La recarga mínima de la billetera es {amount}. Introduce ese monto o uno mayor.',
    subTopUpMinOk: 'Entendido',
    subWalletActivityTitle: 'Actividad de la cartera — por qué cambió tu saldo',
    subFilterAll: 'Todo', subFilterUsage: 'Uso de IA', subFilterCredit: 'Recargas y créditos', subNoActivity: 'Aún no hay actividad.',
    subAiUsageTotal: 'Uso total de IA: {amount}',
    subLedgerAiUsage: 'Uso de IA · {feature}', subLedgerAssistant: 'Asistente', subLedgerTopUp: 'Recarga de cartera', subLedgerManualBilling: 'Facturación manual',
    subLedgerSignupBonus: 'Bono de registro', subLedgerPromoCredit: 'Crédito promocional', subLedgerAdminCredit: 'Crédito del administrador', subLedgerManualAdjustment: 'Ajuste manual',
    subLedgerRefundReversal: 'Reversión de reembolso', subLedgerAdminDebit: 'Débito del administrador', subLedgerTopUpRefunded: 'Recarga reembolsada',
    subImpactPromo: '(promo)', subImpactPaid: '(pagado)', subImpactBoth: '(promo + pagado)',
    subCloudStorage: 'Almacenamiento en la nube', subOfQuotaUsed: ' de {quota} usado', subStorageAddOn: 'Complemento de almacenamiento', subExpiresOn: 'vence el {date}',
    subAddMoreStorage: 'Añadir más almacenamiento', subCapacityValidity: '+{capacity} · {days} días', subPurchase: 'Comprar',
    subStorageNotice: 'Se solicitó la compra de {name} — pendiente de confirmación del administrador (facturación manual/de prueba).',
    subStorageError: 'No se pudo enviar la solicitud de compra: {error}',
    subBillingHistory: 'Historial de facturación', subNoBillingActivity: 'Aún no hay actividad de facturación.',
    subColDate: 'Fecha', subColDescription: 'Descripción', subColAmount: 'Monto', subColStatus: 'Estado',
    subTxWalletTopUp: 'Recarga de cartera', subTxSubscription: 'Plan · Suscripción mensual', subTxStoragePurchase: 'Complemento de almacenamiento', subTxRefund: 'Reembolso',
    subStatusPaid: 'Pagado', subStatusPending: 'Pendiente', subStatusFailed: 'Fallido', subStatusRefunded: 'Reembolsado',
    subUpgradeNotice: 'Se solicitó la actualización a {plan} — pendiente de confirmación del administrador (facturación manual/de prueba).',
    subUpgradeError: 'No se pudo enviar la solicitud de actualización: {error}',
    subInvoiceTitle: 'Pagar con criptomonedas', subInvoiceNetwork: 'Red', subInvoiceAsset: 'Activo', subInvoiceAmount: 'Monto',
    subInvoiceRecipient: 'Dirección de destino', subInvoiceCopy: 'Copiar', subInvoiceCopied: 'Copiado',
    subInvoiceExpiresIn: 'Vence en {time}', subInvoiceExpired: 'Esta factura ha vencido.',
    subInvoiceStatusPending: 'Esperando el pago…', subInvoiceStatusConfirmed: '¡Pago confirmado!', subInvoiceStatusExpired: 'Esta factura ha vencido.',
    subInvoiceHint: 'Envía exactamente este monto en BNB Smart Chain a la dirección de arriba. Tu pago se detecta automáticamente.',
    subInvoiceClose: 'Cerrar', subInvoiceCheckNow: 'Verificar ahora',
    subInvoiceTxHashLabel: 'Hash de la transacción', subInvoiceTxHashPlaceholder: 'Pega aquí el hash de tu transacción',
    subInvoiceTxHashRequired: 'Ingresa el hash de la transacción para verificar.',
    subInvoiceMismatchNote: 'Si el monto que envías difiere del de esta factura — menor o mayor —, esta compra no se completará, pero el monto real enviado se acreditará directamente en tu billetera de IA.',
    subInvoiceMismatchCredited: 'Tu depósito no coincidió con esta factura. En lugar de esta compra, se acreditaron {amount} directamente en tu billetera.',
    subInvoiceOverpaidCredited: 'Enviaste más del monto de esta factura. La compra se completó y la diferencia, {amount}, se acreditó en tu billetera.',
    subInvoiceCheckError: 'No se pudo verificar el pago: {error}',
    subInvoiceReasonNotFound: 'Esta transacción aún no se ha visto en la red. Espera un momento y vuelve a verificar.',
    subInvoiceReasonFailed: 'Esta transacción falló en la red.',
    subInvoiceReasonNoTransfer: 'No se encontró ninguna transferencia que coincida con esta dirección y token. Verifica la dirección, la red (BNB Smart Chain) y el token (USDT).',
    subInvoiceReasonChainMismatch: 'Esta transacción se registró en la red equivocada.',
    subInvoiceReasonConfirming: 'Tu transacción fue detectada y espera confirmaciones de la red — vuelve a verificar en breve.',
    subInvoiceReasonAlreadyClaimed: 'Este hash de transacción ya se usó para otra factura.'
  }
};

function tr(lang, key, vars) {
  let value = (copy[lang] && copy[lang][key]) || copy.en[key] || key;
  if (vars) Object.keys(vars).forEach((name) => { value = value.replace('{' + name + '}', String(vars[name])); });
  return value;
}
function digits(lang, value) {
  const s = String(value);
  if (lang !== 'fa') return s;
  return s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}
// A bare "cur / total" breaks in RTL text (the design's own README calls this out explicitly:
// Latin-led ratios need either dir="ltr" or, for plain number pairs, the localized "of" word
// instead of "/" - same fix the app's own xpOf/pathOfLine/kycOfLine strings already use).
function ratioOfWord(lang) { return { fa: 'از', ar: 'من', en: 'of', es: 'de' }[lang] || 'of'; }
function ratio(lang, cur, total) { return digits(lang, cur) + ' ' + ratioOfWord(lang) + ' ' + digits(lang, total); }
function romanToInt(s) {
  const map = { I: 1, V: 5, X: 10 };
  let total = 0;
  const str = String(s || '').toUpperCase();
  for (let i = 0; i < str.length; i++) {
    const v = map[str[i]] || 0;
    const next = map[str[i + 1]] || 0;
    total += v < next ? -v : v;
  }
  return Math.max(0, Math.min(5, total || 0));
}

// ---- real data helpers (port of account-profile-store.js's private buildSnapshot()/
// achievementProgress() - not exported on window.TradeJournalAccountProfileStore, so this reads
// the exact same real sources those private functions do, rather than reimplementing them
// differently) ----
// Same real source session-workspace-logic.js/sessionsAdapter.js write to - migrated onto
// server-replica.js in Phase 3 (see ARCHITECTURE.md's Global Data Sync section), so this reads
// window.TradeJournalWorkspace's own public list() rather than localStorage (nothing local left
// to read).
function allSessions() {
  const workspace = window.TradeJournalWorkspace;
  const list = workspace && typeof workspace.list === 'function' ? workspace.list() : [];
  return Array.isArray(list) ? list.filter((s) => s && s.id) : [];
}
function sentSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch (_) { return new Set(); }
}
function buildSnapshot() {
  const tradeStore = window.TradeJournalTradeStore;
  const mhStore = window.TradeJournalMentalHealthStore;
  const mhProfile = mhStore ? mhStore.load() : null;
  const sessions = allSessions();
  const checklist = mhProfile && mhProfile.psychologicalProfile && mhProfile.psychologicalProfile.biasChecklist;
  return {
    closedTrades: tradeStore && tradeStore.psychologyDataset ? tradeStore.psychologyDataset() : [],
    completedSessionIds: sessions.filter((s) => s.fateSummary).map((s) => s.id),
    sessionIdsWithLesson: sessions.filter((s) => s.fateSummary && s.fateSummary.note).map((s) => s.id),
    ownedListingIds: Array.from(sentSet('tradejournal:account-profile-listing-ids:v1')),
    intakeCompleted: Boolean(mhProfile && mhProfile.intake && mhProfile.intake.completed),
    biasChecklistCompletedCount: checklist && checklist.lastAssessedAt ? 1 : 0,
    purchaseIds: Array.from(sentSet('tradejournal:account-profile-purchase-ids:v1'))
  };
}
function achievementProgress(key, snapshot, xpTotal) {
  const targets = {
    first_trade_closed: [(snapshot.closedTrades || []).length, 1], ten_trades_closed: [(snapshot.closedTrades || []).length, 10],
    fifty_trades_closed: [(snapshot.closedTrades || []).length, 50], first_session_completed: [(snapshot.completedSessionIds || []).length, 1],
    first_listing_published: [(snapshot.ownedListingIds || []).length, 1], first_purchase: [(snapshot.purchaseIds || []).length, 1],
    ten_sessions_closed: [(snapshot.completedSessionIds || []).length, 10], twenty_five_sessions_closed: [(snapshot.completedSessionIds || []).length, 25],
    fifty_sessions_closed: [(snapshot.completedSessionIds || []).length, 50], ten_sessions_with_lesson: [(snapshot.sessionIdsWithLesson || []).length, 10],
    intake_completed: [snapshot.intakeCompleted ? 1 : 0, 1], bias_checklist_completed: [snapshot.biasChecklistCompletedCount || 0, 1],
    // Not in the store's own private map (level is trivially derivable client-side, unlike the
    // login-streak count below which the server never exposes to any endpoint).
    level_5_reached: xpTotal != null && window.TradeJournalProfileXPRules ? [window.TradeJournalProfileXPRules.levelForXp(xpTotal), 5] : null
  };
  const pair = targets[key];
  if (!pair) return null; // honestly unknown (e.g. five_day_login_streak - server-only, never exposed)
  return { cur: pair[0], total: pair[1], pct: Math.max(0, Math.min(100, Math.round((pair[0] / pair[1]) * 100))) };
}

// Presentational-only grouping over the real, fixed 14 achievement keys - matches the design's
// own tier assignment; no hidden data field is invented, only a display bucket.
const ACH_TIER = {
  first_trade_closed: 'bronze', intake_completed: 'bronze', first_session_completed: 'bronze', first_purchase: 'bronze',
  ten_trades_closed: 'silver', first_listing_published: 'silver', bias_checklist_completed: 'silver', ten_sessions_closed: 'silver',
  level_5_reached: 'silver', five_day_login_streak: 'silver',
  fifty_trades_closed: 'gold', twenty_five_sessions_closed: 'gold', ten_sessions_with_lesson: 'gold',
  fifty_sessions_closed: 'legend'
};
const ACH_ICON = {
  first_trade_closed: 'target', intake_completed: 'brain', first_session_completed: 'clock', first_purchase: 'coins',
  ten_trades_closed: 'activity', first_listing_published: 'shopping-bag', bias_checklist_completed: 'list-checks', ten_sessions_closed: 'calendar',
  level_5_reached: 'trending-up', five_day_login_streak: 'flame',
  fifty_trades_closed: 'swords', twenty_five_sessions_closed: 'layers', ten_sessions_with_lesson: 'book-open', fifty_sessions_closed: 'hourglass'
};
const TIER_META = {
  bronze: { metal: 'var(--bronze)', icon: 'medal', order: 0 }, silver: { metal: '#BFC3D4', icon: 'award', order: 1 },
  gold: { metal: 'var(--gold-warm)', icon: 'trophy', order: 2 }, legend: { metal: 'var(--char-accent)', icon: 'gem', order: 3 }
};

const REQ_ICON = {
  closedSessions: 'clock', reviewedTrades: 'circle-check', reflections: 'brain', tradePlans: 'target',
  patternsWithThreeStages: 'layers', completeStrategies: 'waypoints', validPatternsWithTwoResolutions: 'layers',
  patternResolutions: 'layers', domainXpMin: 'zap', domainMaxPercent: 'scale', domainMinPercent: 'scale'
};
function requirementLabel(lang, requirement) {
  const [key, domain] = String(requirement).split(':');
  const reqKey = 'req' + key.charAt(0).toUpperCase() + key.slice(1);
  if (domain) return tr(lang, reqKey, { domain: tr(lang, 'domain' + domain.charAt(0).toUpperCase() + domain.slice(1)) });
  return tr(lang, reqKey);
}
function requirementIcon(requirement) {
  const key = String(requirement).split(':')[0];
  return REQ_ICON[key] || 'circle-dashed';
}

// Real per-language labels for the full XP type catalog (profile-xp-rules.js's POINTS_BY_TYPE) -
// account-profile-i18n.js only ever translated 4 of these ("a follow-up" per its own comment),
// so xpEventLabel() below fell back to humanized English mid-Persian-sentence. Same real event
// types, just properly labeled in every language this screen already supports.
const XP_TYPE_LABELS = {
  fa: {
    intake_completed: 'تکمیل ارزیابی اولیه', profile_completed: 'تکمیل پروفایل', walkthrough_completed: 'تکمیل آموزش شروع کار',
    first_session_bonus: 'اولین سشن', first_trade_bonus: 'اولین معامله', first_pattern_bonus: 'اولین الگو', first_strategy_bonus: 'اولین استراتژی',
    session_created: 'ایجاد سشن', session_chart_entry_added: 'افزودن چارت به سشن', session_movement_entry_added: 'ثبت حرکت در سشن',
    session_scenario_created: 'ثبت سناریو', session_probability_updated: 'به‌روزرسانی درصد احتمال', session_pattern_linked: 'اتصال الگو به سناریو',
    session_execution_plan_recorded: 'ثبت نقشهٔ اجرا', session_fate_recorded: 'ثبت سرنوشت سشن', session_closed_with_summary: 'بستن سشن با خلاصه', session_closed: 'بستن سشن',
    pattern_created: 'ساخت الگو', pattern_screenshot_added: 'افزودن اسکرین‌شات به الگو', pattern_used_in_scenario: 'استفادهٔ الگو در سناریو',
    pattern_outcome_recorded: 'ثبت نتیجهٔ الگو', pattern_report_generated: 'تولید گزارش الگو', pattern_revised_after_report: 'اصلاح الگو پس از گزارش',
    pattern_published: 'انتشار الگو در بازارچه', pattern_evidence_refreshed: 'به‌روزرسانی شواهد الگو',
    strategy_created: 'ساخت استراتژی', strategy_position_management_completed: 'تکمیل مدیریت پوزیشن', strategy_risk_management_completed: 'تکمیل مدیریت ریسک',
    strategy_overall_framework_completed: 'تکمیل چارچوب کلی استراتژی', strategy_attachment_added: 'افزودن پیوست به استراتژی', strategy_linked_to_trade: 'اتصال استراتژی به معامله',
    strategy_detection_recorded: 'ثبت تشخیص استراتژی', strategy_detection_resolved: 'نتیجه‌گیری تشخیص استراتژی', strategy_revisited_after_trades: 'بازبینی استراتژی پس از معاملات',
    strategy_rules_revised: 'اصلاح قواعد استراتژی', strategy_published: 'انتشار استراتژی در بازارچه',
    trade_plan_created: 'ثبت پلن معامله', trade_calculation_valid: 'محاسبهٔ معتبر معامله', trade_linked: 'اتصال معامله به الگو یا استراتژی',
    trade_opened_from_hunting: 'باز کردن معامله از شکار', trade_mid_emotion_logged: 'ثبت احساس میان‌معامله', trade_screenshot_added: 'افزودن اسکرین‌شات معامله',
    trade_closed_with_pnl: 'بستن معامله با سود/زیان', trade_post_review_completed: 'تکمیل بازبینی پس از معامله', trade_closed: 'بستن معامله',
    psych_checkin: 'چک-این روانی', psych_post_trade_reflection: 'بازتاب پس از معامله', psych_weekly_checkin: 'چک-این هفتگی',
    psych_monthly_bias_checklist: 'چک‌لیست ماهانهٔ سوگیری', psych_thought_or_trigger: 'ثبت فکر یا محرک', psych_education_card_response: 'پاسخ به کارت آموزشی',
    community_post_published: 'انتشار پست در انجمن', listing_rated_with_review: 'دریافت امتیاز با نقد', seller_rating_received: 'دریافت امتیاز فروشنده', listing_published: 'انتشار آگهی در بازارچه'
  },
  en: {
    intake_completed: 'Completed intake', profile_completed: 'Completed profile', walkthrough_completed: 'Completed walkthrough',
    first_session_bonus: 'First session', first_trade_bonus: 'First trade', first_pattern_bonus: 'First pattern', first_strategy_bonus: 'First strategy',
    session_created: 'Session created', session_chart_entry_added: 'Chart added to session', session_movement_entry_added: 'Movement logged in session',
    session_scenario_created: 'Scenario logged', session_probability_updated: 'Probability updated', session_pattern_linked: 'Pattern linked to scenario',
    session_execution_plan_recorded: 'Execution plan recorded', session_fate_recorded: 'Session fate recorded', session_closed_with_summary: 'Session closed with summary', session_closed: 'Session closed',
    pattern_created: 'Pattern created', pattern_screenshot_added: 'Screenshot added to pattern', pattern_used_in_scenario: 'Pattern used in scenario',
    pattern_outcome_recorded: 'Pattern outcome recorded', pattern_report_generated: 'Pattern report generated', pattern_revised_after_report: 'Pattern revised after report',
    pattern_published: 'Pattern published to marketplace', pattern_evidence_refreshed: 'Pattern evidence refreshed',
    strategy_created: 'Strategy created', strategy_position_management_completed: 'Position management completed', strategy_risk_management_completed: 'Risk management completed',
    strategy_overall_framework_completed: 'Overall framework completed', strategy_attachment_added: 'Attachment added to strategy', strategy_linked_to_trade: 'Strategy linked to trade',
    strategy_detection_recorded: 'Strategy detection recorded', strategy_detection_resolved: 'Strategy detection resolved', strategy_revisited_after_trades: 'Strategy revisited after trades',
    strategy_rules_revised: 'Strategy rules revised', strategy_published: 'Strategy published to marketplace',
    trade_plan_created: 'Trade plan created', trade_calculation_valid: 'Valid trade calculation', trade_linked: 'Trade linked to a pattern or strategy',
    trade_opened_from_hunting: 'Trade opened from hunting', trade_mid_emotion_logged: 'Mid-trade emotion logged', trade_screenshot_added: 'Trade screenshot added',
    trade_closed_with_pnl: 'Trade closed with P&L', trade_post_review_completed: 'Post-trade review completed', trade_closed: 'Trade closed',
    psych_checkin: 'Psychology check-in', psych_post_trade_reflection: 'Post-trade reflection', psych_weekly_checkin: 'Weekly check-in',
    psych_monthly_bias_checklist: 'Monthly bias checklist', psych_thought_or_trigger: 'Thought or trigger logged', psych_education_card_response: 'Education card response',
    community_post_published: 'Community post published', listing_rated_with_review: 'Received a rating with review', seller_rating_received: 'Received a seller rating', listing_published: 'Listing published to marketplace'
  },
  ar: {
    intake_completed: 'إكمال التقييم الأولي', profile_completed: 'إكمال الملف الشخصي', walkthrough_completed: 'إكمال جولة البدء',
    first_session_bonus: 'أول جلسة', first_trade_bonus: 'أول صفقة', first_pattern_bonus: 'أول نمط', first_strategy_bonus: 'أول استراتيجية',
    session_created: 'إنشاء جلسة', session_chart_entry_added: 'إضافة رسم إلى الجلسة', session_movement_entry_added: 'تسجيل حركة في الجلسة',
    session_scenario_created: 'تسجيل سيناريو', session_probability_updated: 'تحديث نسبة الاحتمال', session_pattern_linked: 'ربط نمط بسيناريو',
    session_execution_plan_recorded: 'تسجيل خطة التنفيذ', session_fate_recorded: 'تسجيل مصير الجلسة', session_closed_with_summary: 'إغلاق الجلسة بملخص', session_closed: 'إغلاق الجلسة',
    pattern_created: 'إنشاء نمط', pattern_screenshot_added: 'إضافة لقطة إلى النمط', pattern_used_in_scenario: 'استخدام النمط في سيناريو',
    pattern_outcome_recorded: 'تسجيل نتيجة النمط', pattern_report_generated: 'توليد تقرير النمط', pattern_revised_after_report: 'تعديل النمط بعد التقرير',
    pattern_published: 'نشر النمط في السوق', pattern_evidence_refreshed: 'تحديث أدلة النمط',
    strategy_created: 'إنشاء استراتيجية', strategy_position_management_completed: 'إكمال إدارة الصفقة', strategy_risk_management_completed: 'إكمال إدارة المخاطر',
    strategy_overall_framework_completed: 'إكمال الإطار العام', strategy_attachment_added: 'إضافة مرفق للاستراتيجية', strategy_linked_to_trade: 'ربط الاستراتيجية بصفقة',
    strategy_detection_recorded: 'تسجيل اكتشاف الاستراتيجية', strategy_detection_resolved: 'حسم اكتشاف الاستراتيجية', strategy_revisited_after_trades: 'مراجعة الاستراتيجية بعد الصفقات',
    strategy_rules_revised: 'تعديل قواعد الاستراتيجية', strategy_published: 'نشر الاستراتيجية في السوق',
    trade_plan_created: 'تسجيل خطة الصفقة', trade_calculation_valid: 'حساب صفقة صالح', trade_linked: 'ربط الصفقة بنمط أو استراتيجية',
    trade_opened_from_hunting: 'فتح صفقة من الصيد', trade_mid_emotion_logged: 'تسجيل شعور أثناء الصفقة', trade_screenshot_added: 'إضافة لقطة للصفقة',
    trade_closed_with_pnl: 'إغلاق صفقة بربح/خسارة', trade_post_review_completed: 'إكمال مراجعة ما بعد الصفقة', trade_closed: 'إغلاق الصفقة',
    psych_checkin: 'تسجيل حالة نفسية', psych_post_trade_reflection: 'انطباع ما بعد الصفقة', psych_weekly_checkin: 'تسجيل أسبوعي',
    psych_monthly_bias_checklist: 'قائمة التحيزات الشهرية', psych_thought_or_trigger: 'تسجيل فكرة أو محفز', psych_education_card_response: 'الرد على بطاقة تعليمية',
    community_post_published: 'نشر منشور في المجتمع', listing_rated_with_review: 'الحصول على تقييم مع مراجعة', seller_rating_received: 'الحصول على تقييم بائع', listing_published: 'نشر إعلان في السوق'
  },
  es: {
    intake_completed: 'Evaluación inicial completada', profile_completed: 'Perfil completado', walkthrough_completed: 'Tutorial completado',
    first_session_bonus: 'Primera sesión', first_trade_bonus: 'Primera operación', first_pattern_bonus: 'Primer patrón', first_strategy_bonus: 'Primera estrategia',
    session_created: 'Sesión creada', session_chart_entry_added: 'Gráfico añadido a la sesión', session_movement_entry_added: 'Movimiento registrado en la sesión',
    session_scenario_created: 'Escenario registrado', session_probability_updated: 'Probabilidad actualizada', session_pattern_linked: 'Patrón vinculado a un escenario',
    session_execution_plan_recorded: 'Plan de ejecución registrado', session_fate_recorded: 'Destino de sesión registrado', session_closed_with_summary: 'Sesión cerrada con resumen', session_closed: 'Sesión cerrada',
    pattern_created: 'Patrón creado', pattern_screenshot_added: 'Captura añadida al patrón', pattern_used_in_scenario: 'Patrón usado en un escenario',
    pattern_outcome_recorded: 'Resultado del patrón registrado', pattern_report_generated: 'Informe del patrón generado', pattern_revised_after_report: 'Patrón revisado tras el informe',
    pattern_published: 'Patrón publicado en el mercado', pattern_evidence_refreshed: 'Evidencia del patrón actualizada',
    strategy_created: 'Estrategia creada', strategy_position_management_completed: 'Gestión de posición completada', strategy_risk_management_completed: 'Gestión de riesgo completada',
    strategy_overall_framework_completed: 'Marco general completado', strategy_attachment_added: 'Adjunto añadido a la estrategia', strategy_linked_to_trade: 'Estrategia vinculada a una operación',
    strategy_detection_recorded: 'Detección de estrategia registrada', strategy_detection_resolved: 'Detección de estrategia resuelta', strategy_revisited_after_trades: 'Estrategia revisada tras operaciones',
    strategy_rules_revised: 'Reglas de la estrategia revisadas', strategy_published: 'Estrategia publicada en el mercado',
    trade_plan_created: 'Plan de operación creado', trade_calculation_valid: 'Cálculo de operación válido', trade_linked: 'Operación vinculada a un patrón o estrategia',
    trade_opened_from_hunting: 'Operación abierta desde caza', trade_mid_emotion_logged: 'Emoción registrada durante la operación', trade_screenshot_added: 'Captura añadida a la operación',
    trade_closed_with_pnl: 'Operación cerrada con P&L', trade_post_review_completed: 'Revisión posterior completada', trade_closed: 'Operación cerrada',
    psych_checkin: 'Registro psicológico', psych_post_trade_reflection: 'Reflexión posterior a la operación', psych_weekly_checkin: 'Registro semanal',
    psych_monthly_bias_checklist: 'Lista mensual de sesgos', psych_thought_or_trigger: 'Pensamiento o disparador registrado', psych_education_card_response: 'Respuesta a tarjeta educativa',
    community_post_published: 'Publicación en la comunidad', listing_rated_with_review: 'Valoración recibida con reseña', seller_rating_received: 'Valoración de vendedor recibida', listing_published: 'Anuncio publicado en el mercado'
  }
};

function xpEventIcon(type) {
  if (type.indexOf('achievement:') === 0) return 'trophy';
  if (type.indexOf('streak_') === 0) return 'flame';
  if (type.indexOf('session_') === 0 || type === 'first_session_bonus') return 'clock';
  if (type.indexOf('pattern_') === 0 || type === 'first_pattern_bonus') return 'layers';
  if (type.indexOf('strategy_') === 0 || type === 'first_strategy_bonus') return 'waypoints';
  if (type.indexOf('trade_') === 0 || type === 'first_trade_bonus') return 'target';
  if (type.indexOf('psych_') === 0) return 'brain';
  if (type.indexOf('community') === 0 || type.indexOf('listing_') === 0 || type === 'seller_rating_received') return 'users';
  if (type === 'intake_completed' || type === 'profile_completed' || type === 'walkthrough_completed') return 'user-round';
  return 'zap';
}
function xpEventLabel(lang, i18n, type) {
  if (type.indexOf('achievement:') === 0) return tr(lang, 'xpTypeAchievement');
  if (type.indexOf('streak_') === 0) return tr(lang, 'xpTypeStreak', { detail: type.replace(/_/g, ' ') });
  const known = i18n.t('xpType' + type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(''));
  if (known && known.indexOf('xpType') !== 0) return known;
  return type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function PipRow({ count, filled, pendingIndex, height }) {
  return (
    <span style={{ display: 'flex', gap: 3, height: height || 16 }}>
      {Array.from({ length: count }, (_, i) => {
        if (i < filled) return <span key={i} style={{ flex: 1, borderRadius: 3, background: 'var(--char-accent)', boxShadow: '0 0 10px var(--char-glow)' }}></span>;
        if (i === pendingIndex) return <span key={i} style={{ flex: 1, borderRadius: 3, border: '1px dashed var(--char-accent)', background: 'var(--char-active-surface)', boxSizing: 'border-box' }}></span>;
        return <span key={i} style={{ flex: 1, borderRadius: 3, background: 'rgba(244,234,215,.06)', border: '1px solid var(--border-hairline)', boxSizing: 'border-box' }}></span>;
      })}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Dossier band
// ---------------------------------------------------------------------------------------------

function DossierBand({ lang, character, profile, pendingXp, nextGoal }) {
  const rules = window.TradeJournalProfileXPRules;
  const level = rules.levelForXp(profile.xpTotal);
  const nextThreshold = rules.xpForNextLevel(profile.xpTotal);
  const currentThreshold = rules.LEVEL_THRESHOLDS[level - 1];
  const span = nextThreshold != null ? nextThreshold - currentThreshold : 1;
  const pct = nextThreshold != null ? Math.min(100, Math.max(0, ((profile.xpTotal - currentThreshold) / span) * 100)) : 100;
  const PIPS = 24;
  const filled = Math.max(profile.xpTotal > 0 ? 1 : 0, Math.round((pct / 100) * PIPS));
  const rankInfo = RANK_TITLE[character] || RANK_TITLE.hunter;
  const tierFill = romanToInt(rankInfo.tier);

  return (
    <Panel variant="prestige" ornament texture textureOpacity={0.06} padding={0}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div style={{ flex: 'none', width: 298, boxSizing: 'border-box', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16, borderInlineEnd: '1px solid var(--divider-gold)' }}>
          <RankCrest character={character} size={86} layout="column" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
            <span style={{ fontSize: 10.5, letterSpacing: '.12em', color: 'var(--text-dim)' }}>{tr(lang, 'rankLabel')}</span>
            <span style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} style={{ width: 16, height: 5, borderRadius: 2, background: i < tierFill ? 'var(--char-accent)' : 'rgba(244,234,215,.1)', boxShadow: i < tierFill ? '0 0 8px var(--char-glow)' : 'none' }}></span>
              ))}
            </span>
            <span dir="ltr" className="navrya-tabular" style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{'@' + profile.id}</span>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, borderInlineEnd: '1px solid var(--divider-gold)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
              <span style={{ fontSize: 10.5, lineHeight: 1, letterSpacing: '.12em', color: 'var(--text-dim)' }}>{tr(lang, 'levelWord')}</span>
              <span className="navrya-tabular" style={{ fontFamily: 'var(--font-display)', fontSize: 56, lineHeight: .9, fontWeight: 700, color: 'var(--char-accent)', textShadow: '0 0 24px var(--char-glow)' }}>{digits(lang, String(level).padStart(2, '0'))}</span>
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7, paddingBottom: 6 }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'pathToLevel', { n: digits(lang, nextThreshold != null ? level + 1 : level) })}</span>
                <span className="navrya-tabular" style={{ marginInlineStart: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{tr(lang, 'xpOf', { xp: digits(lang, profile.xpTotal), max: digits(lang, nextThreshold ?? profile.xpTotal) })}</span>
              </span>
              <PipRow count={PIPS} filled={filled} pendingIndex={pendingXp > 0 ? filled : -1} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: 'var(--text-dim)' }}>
                <span className="navrya-tabular">{nextThreshold != null ? tr(lang, 'xpToNext', { xp: digits(lang, nextThreshold - profile.xpTotal) }) : tr(lang, 'maxLevelLine')}</span>
                {pendingXp > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--gold-warm)' }}>
                    <Icon name="hourglass" size={14} /><span className="navrya-tabular">{tr(lang, 'pendingSync', { n: digits(lang, pendingXp) })}</span>
                  </span>
                )}
              </span>
            </span>
          </div>
        </div>

        <div style={{ flex: 'none', width: 352, boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '.1em', color: 'var(--text-dim)' }}>{tr(lang, 'nextRewardLabel')}</span>
          {nextGoal ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--parchment)' }}>{nextGoal.title}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Chip tone="accent">{nextGoal.xpLabel}</Chip>
                <span style={{ marginInlineStart: 'auto' }}><Icon name="gift" size={18} /></span>
              </span>
              <span style={{ height: 6, borderRadius: 3, background: 'rgba(244,234,215,.08)', overflow: 'hidden', display: 'block' }}>
                <span style={{ display: 'block', height: '100%', borderRadius: 3, background: 'var(--char-accent)', width: nextGoal.progress + '%' }}></span>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------
// Level tab
// ---------------------------------------------------------------------------------------------

function LevelTab({ lang, i18n, profile, mastery, xpEvents }) {
  const rules = window.TradeJournalProfileXPRules;
  const level = rules.levelForXp(profile.xpTotal);
  const THRESHOLDS = rules.LEVEL_THRESHOLDS; // 7 real levels
  const LABELS = ['آغاز مسیر', 'کتابخانهٔ سشن', 'انتشار در بازارچه', 'گزارش پیشرفته', 'دستیار نامحدود', 'نشان زمردین II', 'الگوهای اشتراکی'];
  const LABELS_EN = ['Start of the path', 'Session library', 'Marketplace publishing', 'Advanced report', 'Unlimited assistant', 'Emerald badge II', 'Shared patterns'];
  const labelSet = lang === 'fa' ? LABELS : LABELS_EN;

  const [showAll, setShowAll] = React.useState(false);
  const events = showAll ? xpEvents : xpEvents.slice(0, 7);
  const total30 = xpEvents.filter((e) => Date.now() - new Date(e.occurredAt).getTime() <= 30 * 86400000).reduce((sum, e) => sum + e.points, 0);

  const gated = mastery && mastery.gatedLevel < mastery.xpLevel && mastery.blockers.length ? mastery : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel variant="base" ornament padding={0}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'var(--char-accent)', display: 'flex' }}><Icon name="waypoints" size={20} /></span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'pathTitle')}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'pathHint')}</span>
            <span className="navrya-tabular" style={{ marginInlineStart: 'auto', fontSize: 11, letterSpacing: '.08em', color: 'var(--text-muted)' }}>{tr(lang, 'pathOfLine', { cur: digits(lang, level), max: digits(lang, THRESHOLDS.length) })}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
            {THRESHOLDS.map((threshold, i) => {
              const n = i + 1;
              const done = n < level, current = n === level, locked = n > level;
              return (
                <React.Fragment key={n}>
                  {i > 0 && <span style={{ flex: 1, height: 2, marginTop: 33, background: n <= level ? 'var(--char-accent)' : 'rgba(244,234,215,.1)', opacity: n <= level ? .7 : 1 }}></span>}
                  <span style={{ flex: 'none', width: 126, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                    {done && (
                      <span style={{ width: 68, height: 68, borderRadius: '50%', boxSizing: 'border-box', border: '2px solid var(--char-accent)', background: 'var(--char-active-surface)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}><Icon name="check" size={26} /></span>
                    )}
                    {current && (
                      <span style={{ position: 'relative', width: 68, height: 68, borderRadius: '50%', boxSizing: 'border-box', border: '2px solid var(--char-accent)', background: 'var(--char-active-surface)', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 6px var(--char-glow), 0 0 22px var(--char-glow)' }}>
                        <span className="navrya-tabular" style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--char-accent)' }}>{digits(lang, n)}</span>
                      </span>
                    )}
                    {locked && (
                      <span style={{ width: 68, height: 68, borderRadius: '50%', boxSizing: 'border-box', border: '1px dashed var(--steel)', background: 'rgba(3,8,7,.45)', display: 'grid', placeItems: 'center', color: 'var(--text-dim)' }}><Icon name="lock" size={20} /></span>
                    )}
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className="navrya-tabular" style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--text-muted)' }}>{tr(lang, 'statLevel') + ' ' + digits(lang, n)}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--parchment)', lineHeight: 1.6 }}>{labelSet[i]}</span>
                      <span dir="ltr" className="navrya-tabular" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{digits(lang, threshold) + ' XP'}</span>
                    </span>
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 16, alignItems: 'start' }}>
        <Panel variant="active" ornament padding={0}>
          <div style={{ display: 'flex', flexDirection: 'column', padding: '20px 22px', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 8, display: 'grid', placeItems: 'center', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}><Icon name="key-round" size={20} /></span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'gateTitle', { n: digits(lang, level + 1) })}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>{tr(lang, 'gateSub')}</span>
              </span>
              {gated && (
                <span className="navrya-tabular" style={{ marginInlineStart: 'auto', flex: 'none', fontSize: 11, padding: '5px 9px', borderRadius: 6, border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.1)', color: 'var(--gold-warm)' }}>
                  {tr(lang, 'gateSummary', { xp: digits(lang, Math.max(0, (rules.xpForNextLevel(profile.xpTotal) ?? profile.xpTotal) - profile.xpTotal)), n: digits(lang, gated.blockers.length) })}
                </span>
              )}
            </div>
            {gated ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {gated.blockers.map((b) => {
                    const pct2 = Math.max(0, Math.min(100, Math.round((b.have / b.need) * 100)));
                    return (
                      <div key={b.requirement} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 13px', borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)' }}>
                        <span style={{ flex: 'none', width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', border: '1px dashed var(--steel)', background: 'rgba(3,8,7,.4)', color: 'var(--text-dim)' }}><Icon name={requirementIcon(b.requirement)} size={14} /></span>
                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--parchment)' }}>{requirementLabel(lang, b.requirement)}</span>
                            <span className="navrya-tabular" style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{ratio(lang, b.have, b.need)}</span>
                          </span>
                          <span style={{ height: 5, borderRadius: 3, background: 'rgba(244,234,215,.07)', overflow: 'hidden', display: 'block' }}>
                            <span style={{ display: 'block', height: '100%', borderRadius: 3, background: 'var(--char-accent)', width: pct2 + '%' }}></span>
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.8 }}>{tr(lang, 'gateFooter')}</span>
              </>
            ) : (
              <Notice tone="accent" icon="circle-check">{tr(lang, 'gateNoneBody')}</Notice>
            )}
          </div>
        </Panel>

        <Panel variant="base" ornament padding={0}>
          <div style={{ display: 'flex', flexDirection: 'column', padding: '20px 22px', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--char-accent)', display: 'flex' }}><Icon name="zap" size={20} /></span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'ledgerTitle')}</span>
              <span className="navrya-tabular" style={{ marginInlineStart: 'auto', fontSize: 11.5, color: 'var(--text-muted)' }}>{tr(lang, 'ledgerTotal30', { n: digits(lang, total30) })}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {!events.length && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'ledgerEmpty')}</span>}
              {events.map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
                  <span style={{ flex: 'none', color: 'var(--text-muted)', display: 'flex' }}><Icon name={xpEventIcon(e.type)} size={16} /></span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-primary)' }}>{xpEventLabel(lang, i18n, e.type)}</span>
                  <span dir="ltr" className="navrya-tabular" style={{ flex: 'none', fontSize: 12, fontWeight: 700, color: 'var(--char-accent)', padding: '3px 8px', borderRadius: 5, background: 'var(--char-active-surface)' }}>{'+' + digits(lang, e.points)}</span>
                  <span className="navrya-tabular" style={{ flex: 'none', fontSize: 10.5, color: 'var(--text-dim)', minWidth: 74, textAlign: 'left' }}>{i18n.date(e.occurredAt)}</span>
                </div>
              ))}
            </div>
            {xpEvents.length > 7 && (
              <button type="button" onClick={() => setShowAll((v) => !v)} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 13px', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontSize: 12, border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)' }}>
                <Icon name="chevron-down" size={14} />{showAll ? tr(lang, 'showLess') : tr(lang, 'showAll')}
              </button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Achievements tab
// ---------------------------------------------------------------------------------------------

function AchievementsTab({ lang, i18n, profile, unlockedByKey, openId, setOpenId }) {
  const [filter, setFilter] = React.useState('all');
  const defs = (window.TradeJournalProfileAchievements && window.TradeJournalProfileAchievements.definitions) || [];
  const snapshot = buildSnapshot();

  const items = defs.map((def) => {
    const earned = unlockedByKey[def.key];
    const progress = achievementProgress(def.key, snapshot, profile.xpTotal);
    return {
      key: def.key, title: i18n.t('ach' + def.labelKey + 'Title'), desc: i18n.t('ach' + def.labelKey + 'Desc'),
      icon: ACH_ICON[def.key] || 'trophy', tier: ACH_TIER[def.key] || 'bronze', xp: def.points,
      unlocked: !!earned, unlockedAt: earned ? earned.unlockedAt : null,
      cur: progress ? progress.cur : null, total: progress ? progress.total : def.key === 'five_day_login_streak' ? 5 : 1,
      pct: progress ? progress.pct : 0
    };
  });
  const done = items.filter((i) => i.unlocked).length;
  const shown = items.filter((i) => filter === 'all' || (filter === 'open' ? i.unlocked : !i.unlocked));
  const grouped = ['bronze', 'silver', 'gold', 'legend'].map((tier) => ({ tier, items: shown.filter((i) => i.tier === tier) })).filter((g) => g.items.length);

  const closest = items.filter((i) => !i.unlocked).sort((a, b) => (b.pct || 0) - (a.pct || 0))[0];
  const detail = items.find((i) => i.key === openId);
  const xpFromBadges = items.filter((i) => i.unlocked).reduce((s, i) => s + i.xp, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 16, alignItems: 'stretch' }}>
        <Panel variant="prestige" ornament texture textureOpacity={0.06} padding="20px 22px">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ position: 'relative', flex: 'none', width: 112, height: 112, borderRadius: '50%', boxSizing: 'border-box', border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', display: 'grid', placeItems: 'center' }}>
              <span style={{ position: 'absolute', inset: 7, borderRadius: '50%', border: '2px solid var(--char-accent)', opacity: .55 }}></span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span className="navrya-tabular" style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, color: 'var(--char-accent)', lineHeight: 1 }}>{digits(lang, done)}</span>
                <span className="navrya-tabular" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(lang, 'achOf', { n: digits(lang, defs.length) })}</span>
              </span>
            </span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'achHallTitle')}</span>
                <span className="navrya-tabular" style={{ marginInlineStart: 'auto', fontSize: 11.5, color: 'var(--text-muted)' }}>{tr(lang, 'achXpLine', { xp: digits(lang, xpFromBadges), pct: digits(lang, Math.round((done / defs.length) * 100)) })}</span>
              </span>
              <PipRow count={defs.length} filled={done} pendingIndex={-1} height={14} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>{tr(lang, 'achHallBody')}</span>
            </div>
          </div>
        </Panel>
        <Panel variant="active" ornament padding="20px 22px">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ position: 'relative', flex: 'none', width: 84, height: 84, borderRadius: '50%', boxSizing: 'border-box', border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.5)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}>
              <span style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '1px dashed var(--char-accent)', opacity: .5 }}></span>
              <Icon name={closest ? closest.icon : 'trophy'} size={30} />
            </span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 10.5, letterSpacing: '.12em', color: 'var(--char-accent)' }}>{tr(lang, 'closestBadge')}</span>
              {closest ? (
                <>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--parchment)' }}>{closest.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>{closest.desc}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span dir="ltr" className="navrya-tabular" style={{ fontSize: 11, color: 'var(--char-accent)', padding: '3px 8px', borderRadius: 5, background: 'var(--char-active-surface)' }}>{'+' + digits(lang, closest.xp) + ' XP'}</span>
                    <span className="navrya-tabular" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{closest.cur == null ? '—' : ratio(lang, closest.cur, closest.total)}</span>
                  </span>
                </>
              ) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr(lang, 'achEmpty')}</span>}
            </div>
          </div>
        </Panel>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {[['all', tr(lang, 'filterAll'), items.length], ['open', tr(lang, 'filterOpen'), done], ['locked', tr(lang, 'filterLocked'), items.length - done]].map(([id, label, count]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 15px', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontSize: 12.5, fontWeight: filter === id ? 600 : 400, border: '1px solid ' + (filter === id ? 'var(--char-accent)' : 'var(--border-hairline)'), background: filter === id ? 'var(--char-active-surface)' : 'transparent', color: filter === id ? 'var(--char-accent)' : 'var(--text-muted)' }}>
            {label}<span className="navrya-tabular" style={{ fontSize: 11, padding: '1px 7px', borderRadius: 5, border: '1px solid currentColor', background: 'rgba(3,8,7,.4)' }}>{digits(lang, count)}</span>
          </button>
        ))}
        <span style={{ marginInlineStart: 'auto', fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'achResultLine', { n: digits(lang, shown.length) })}</span>
      </div>

      {grouped.map((g) => {
        const meta = TIER_META[g.tier];
        return (
          <div key={g.tier} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.5)', color: meta.metal }}><Icon name={meta.icon} size={14} /></span>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: meta.metal }}>{tr(lang, 'tier' + g.tier.charAt(0).toUpperCase() + g.tier.slice(1))}</span>
              <span className="navrya-tabular" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{digits(lang, g.items.length) + ' ' + tr(lang, 'badgeCountSuffix')}</span>
              <span style={{ flex: 1, height: 1, background: 'var(--border-hairline)' }}></span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(244px,1fr))', gap: 12, alignItems: 'start' }}>
              {g.items.map((a) => a.unlocked ? (
                <button key={a.key} type="button" onClick={() => setOpenId(a.key)} style={{ position: 'relative', boxSizing: 'border-box', textAlign: 'start', cursor: 'pointer', font: 'inherit', padding: '16px 16px 14px', borderRadius: 12, border: '2px solid var(--char-accent)', background: 'var(--char-active-surface)', boxShadow: '0 0 18px var(--char-glow), var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 11 }}>
                  <span aria-hidden="true" style={{ position: 'absolute', top: 5, insetInlineStart: 5, width: 14, height: 14, borderTop: '1px solid var(--char-accent)', borderInlineStart: '1px solid var(--char-accent)' }}></span>
                  <span aria-hidden="true" style={{ position: 'absolute', bottom: 5, insetInlineEnd: 5, width: 14, height: 14, borderBottom: '1px solid var(--char-accent)', borderInlineEnd: '1px solid var(--char-accent)' }}></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ position: 'relative', flex: 'none', width: 60, height: 60, borderRadius: '50%', boxSizing: 'border-box', border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}>
                      <span style={{ position: 'absolute', inset: 5, borderRadius: '50%', border: '2px solid ' + meta.metal }}></span>
                      <Icon name={a.icon} size={24} />
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', color: meta.metal }}>{tr(lang, 'tier' + g.tier.charAt(0).toUpperCase() + g.tier.slice(1))}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--parchment)', lineHeight: 1.5 }}>{a.title}</span>
                    </span>
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.75, minHeight: 34 }}>{a.desc}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10, borderTop: '1px solid var(--divider-gold)' }}>
                    <span dir="ltr" className="navrya-tabular" style={{ fontSize: 11, fontWeight: 700, color: 'var(--char-accent)' }}>{'+' + digits(lang, a.xp) + ' XP'}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginInlineStart: 'auto', fontSize: 10.5, color: 'var(--char-accent)' }}>
                      <Icon name="badge-check" size={14} /><span className="navrya-tabular">{i18n.date(a.unlockedAt)}</span>
                    </span>
                  </span>
                </button>
              ) : (
                <button key={a.key} type="button" onClick={() => setOpenId(a.key)} style={{ boxSizing: 'border-box', textAlign: 'start', cursor: 'pointer', font: 'inherit', padding: '16px 16px 14px', borderRadius: 12, border: '1px solid var(--border-hairline)', background: 'var(--surface-card)', display: 'flex', flexDirection: 'column', gap: 11 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ position: 'relative', flex: 'none', width: 60, height: 60, borderRadius: '50%', boxSizing: 'border-box', border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)', display: 'grid', placeItems: 'center', color: 'var(--text-dim)' }}>
                      <span style={{ position: 'absolute', inset: 5, borderRadius: '50%', border: '1px dashed ' + meta.metal, opacity: .45 }}></span>
                      <Icon name="lock" size={20} />
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', color: meta.metal, opacity: .75 }}>{tr(lang, 'tier' + g.tier.charAt(0).toUpperCase() + g.tier.slice(1))}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5 }}>{a.title}</span>
                    </span>
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.75, minHeight: 34 }}>{a.desc}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 10, borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span dir="ltr" className="navrya-tabular" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{'+' + digits(lang, a.xp) + ' XP'}</span>
                      <span className="navrya-tabular" style={{ marginInlineStart: 'auto', fontSize: 10.5, color: 'var(--text-dim)' }}>{a.cur == null ? '—' : ratio(lang, a.cur, a.total)}</span>
                    </span>
                    <span style={{ height: 4, borderRadius: 2, background: 'rgba(244,234,215,.07)', display: 'block', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', borderRadius: 2, background: 'var(--char-accent)', opacity: .8, width: a.pct + '%' }}></span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {detail && (
        <Modal open title={detail.title} icon={detail.icon} width={520} onClose={() => setOpenId(null)}>
          <div dir="auto" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ position: 'relative', flex: 'none', width: 88, height: 88, borderRadius: '50%', boxSizing: 'border-box', border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}>
                <span style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '2px solid var(--gold-warm)', opacity: .6 }}></span>
                <Icon name={detail.icon} size={34} />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: 'var(--gold-warm)' }}>{tr(lang, 'tier' + detail.tier.charAt(0).toUpperCase() + detail.tier.slice(1))}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8 }}>{detail.desc}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span dir="ltr" className="navrya-tabular" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--char-accent)', padding: '3px 9px', borderRadius: 5, background: 'var(--char-active-surface)' }}>{'+' + digits(lang, detail.xp) + ' XP'}</span>
                  <span className="navrya-tabular" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{detail.unlocked ? tr(lang, 'unlockedOn', { date: i18n.date(detail.unlockedAt) }) : tr(lang, 'locked')}</span>
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 14, borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)' }}>
              <span style={{ fontSize: 11, letterSpacing: '.08em', color: 'var(--text-dim)' }}>{tr(lang, 'reqSectionLabel')}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.8 }}>{detail.desc}</span>
              {!detail.unlocked && (
                <>
                  <span style={{ height: 5, borderRadius: 3, background: 'rgba(244,234,215,.07)', display: 'block', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', borderRadius: 3, background: 'var(--char-accent)', width: Math.min(100, detail.pct) + '%' }}></span>
                  </span>
                  <span className="navrya-tabular" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{detail.cur == null ? '—' : ratio(lang, detail.cur, detail.total)}</span>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Identity tab
// ---------------------------------------------------------------------------------------------

function IdentityTab({ lang, i18n, character, profile, onSaved }) {
  const [name, setName] = React.useState(profile.displayName || '');
  const [email, setEmail] = React.useState(profile.email || '');
  const [phone, setPhone] = React.useState(profile.phone || '');
  const [avatarDataUrl, setAvatarDataUrl] = React.useState(profile.avatarDataUrl || null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [savedAt, setSavedAt] = React.useState(null);
  const fileRef = React.useRef(null);

  function reset() {
    setName(profile.displayName || ''); setEmail(profile.email || ''); setPhone(profile.phone || '');
    setAvatarDataUrl(profile.avatarDataUrl || null); setError('');
  }

  // AI process registry (A4) - mountedRef template. Only mounted while tab === 'identity'
  // (the parent switches tabs via a plain conditional render, no key), so mount/unmount already
  // is the tab-switch signal.
  // Journey F, F33: submitRef read from inside the once-only registration effect - same
  // stale-closure bug class already fixed elsewhere this project: save() closes over
  // name/email/phone/avatarDataUrl, all of which change after this effect (deps []) first runs.
  const mountedRef = React.useRef(true);
  const submitRef = React.useRef(null);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('account-profile-identity', {
      // avatarDataUrl deliberately stays out of the AI-fillable allowlist here (F33 section 8):
      // there is no way for the model to supply a real picked file, and it must never fabricate
      // one or claim an upload succeeded. The real field/applyValue path stays for any future
      // human-triggered flow; profile.edit (character-app.jsx) simply never targets it.
      allowlist: ['displayName', 'email', 'phone', 'avatarDataUrl'],
      isOpen: () => mountedRef.current,
      applyValue: (path, value) => {
        if (path === 'displayName') setName(String(value ?? ''));
        else if (path === 'email') setEmail(String(value ?? ''));
        else if (path === 'phone') setPhone(String(value ?? ''));
        else if (path === 'avatarDataUrl') setAvatarDataUrl(value || null);
      },
      submit: () => submitRef.current()
    });
    return () => { mountedRef.current = false; };
  }, []);

  function pickFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    const reader = new FileReader();
    reader.onload = () => setAvatarDataUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  }
  function save() {
    setBusy(true); setError('');
    return window.TradeJournalAccountProfileStore.updateProfile({ displayName: name.trim(), email: email.trim() || null, phone: phone.trim() || null, avatarDataUrl })
      .then((updated) => { setSavedAt(new Date()); onSaved(updated); return updated; })
      .catch((err) => { setError(err && err.code === 'EMAIL_TAKEN' ? tr(lang, 'emailTaken') : tr(lang, 'validationFailed')); return undefined; })
      .finally(() => setBusy(false));
  }
  submitRef.current = save;

  const kycSteps = [
    { key: 'email', label: tr(lang, 'kycEmail'), icon: 'mail', state: profile.emailVerified ? 'done' : 'todo' },
    { key: 'phone', label: tr(lang, 'kycPhone'), icon: 'phone', state: profile.phoneVerified ? 'done' : 'todo' },
    { key: 'doc', label: tr(lang, 'kycDoc'), icon: 'file-check', state: profile.kycStatus === 'verified' ? 'done' : profile.kycStatus === 'pending' ? 'pending' : 'todo' }
  ];
  const kycDoneCount = kycSteps.filter((s) => s.state === 'done').length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
      <Panel variant="prestige" ornament texture textureOpacity={0.06} padding="22px">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <CharacterPortrait character={character} size={188} src={avatarDataUrl || undefined} editable onEdit={() => fileRef.current && fileRef.current.click()} />
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { pickFile(e.target.files && e.target.files[0]); e.target.value = ''; }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--parchment)' }}>{name || profile.displayName}</span>
          <span dir="ltr" className="navrya-tabular" style={{ fontSize: 12, color: 'var(--char-accent)' }}>{'@' + profile.id}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.8 }}>{tr(lang, 'identityPortraitHint')}</span>
          <span style={{ display: 'flex', gap: 9 }}>
            <Button variant="secondary" size="sm" icon="upload" onClick={() => fileRef.current && fileRef.current.click()}>{tr(lang, 'changeImage')}</Button>
            <Button variant="ghost" size="sm" icon="trash" onClick={() => setAvatarDataUrl(null)}>{tr(lang, 'removeImage')}</Button>
          </span>
          <span style={{ width: '100%', height: 1, background: 'var(--divider-gold)' }}></span>
          <span style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{tr(lang, 'selectedCharacter')}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--char-accent)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--char-accent)' }}></span>{character}
            </span>
          </span>
        </div>
      </Panel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Panel variant="base" ornament padding="20px 22px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--char-accent)', display: 'flex' }}><Icon name="user-round" size={20} /></span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'identityFieldsTitle')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <TextField label={tr(lang, 'nameLabel')} value={name} onChange={setName} dir="rtl" />
              <TextField label={tr(lang, 'handleLabel')} value={'@' + profile.id} dir="ltr" disabled hint={tr(lang, 'handleHint')} />
              <TextField label={tr(lang, 'emailLabel')} value={email} onChange={setEmail} type="email" />
              <TextField label={tr(lang, 'phoneLabel')} value={phone} onChange={setPhone} placeholder={tr(lang, 'phonePlaceholder')} />
            </div>
          </div>
        </Panel>

        <Panel variant="base" ornament padding="20px 22px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--gold-warm)', display: 'flex' }}><Icon name="shield-check" size={20} /></span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'kycTitle')}</span>
              <span className="navrya-tabular" style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{tr(lang, 'kycOfLine', { n: digits(lang, kycDoneCount) })}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
              {kycSteps.map((s, i) => (
                <React.Fragment key={s.key}>
                  {i > 0 && <span style={{ flex: 1, height: 2, marginTop: 23, background: 'rgba(244,234,215,.1)' }}></span>}
                  <span style={{ flex: 'none', width: 190, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, textAlign: 'center' }}>
                    {s.state === 'done' && <span style={{ width: 48, height: 48, borderRadius: '50%', boxSizing: 'border-box', border: '2px solid var(--success)', background: 'rgba(46,204,113,.1)', display: 'grid', placeItems: 'center', color: 'var(--success)' }}><Icon name="check" size={20} /></span>}
                    {s.state === 'pending' && <span style={{ width: 48, height: 48, borderRadius: '50%', boxSizing: 'border-box', border: '2px solid var(--warning)', background: 'rgba(255,176,32,.08)', display: 'grid', placeItems: 'center', color: 'var(--warning)' }}><Icon name="hourglass" size={18} /></span>}
                    {s.state === 'todo' && <span style={{ width: 48, height: 48, borderRadius: '50%', boxSizing: 'border-box', border: '1px dashed var(--steel)', background: 'rgba(3,8,7,.45)', display: 'grid', placeItems: 'center', color: 'var(--text-dim)' }}><Icon name={s.icon} size={18} /></span>}
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--parchment)' }}>{s.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.state === 'done' ? tr(lang, 'kycDone') : s.state === 'pending' ? tr(lang, 'kycPending') : tr(lang, 'kycTodo')}</span>
                    </span>
                  </span>
                </React.Fragment>
              ))}
            </div>
            <Notice tone="info">{tr(lang, 'kycNotice')}</Notice>
          </div>
        </Panel>

        {error && <Notice tone="danger">{error}</Notice>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="primary" size="md" icon="save" disabled={busy} onClick={save}>{tr(lang, 'saveChanges')}</Button>
          <Button variant="ghost" size="md" onClick={reset}>{tr(lang, 'resetChanges')}</Button>
          <span style={{ marginInlineStart: 'auto', fontSize: 11.5, color: 'var(--text-dim)' }}>{savedAt ? tr(lang, 'lastSaved', { date: i18n.date(savedAt.toISOString()) }) : tr(lang, 'neverSaved')}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Role tab
// ---------------------------------------------------------------------------------------------

const REAL_ROLES = [
  { id: 'trader', icon: 'target', labelKey: 'roleTrader', descKey: 'roleTraderDesc' },
  { id: 'mentor', icon: 'users', labelKey: 'roleMentor', descKey: 'roleMentorDesc' },
  { id: 'teacher', icon: 'book-open', labelKey: 'roleTeacher', descKey: 'roleTeacherDesc' }
];

function RoleTab({ lang, profile, onSaved }) {
  const [role, setRole] = React.useState(profile.profileRole || 'trader');
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');

  // AI process registry (A4) - mountedRef template, same tab-switch-is-mount-signal shape as
  // IdentityTab above.
  // Journey F, F33: submitRef, same stale-closure fix as IdentityTab - save() closes over role.
  const mountedRef = React.useRef(true);
  const submitRef = React.useRef(null);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('account-profile-role', {
      // F33 section 7: only the three real, user-facing role values ever apply - 'admin' or any
      // other string is silently rejected here, never a model decision to honour.
      allowlist: ['role'],
      isOpen: () => mountedRef.current,
      applyValue: (path, value) => { if (path === 'role' && REAL_ROLES.some((r) => r.id === value)) setRole(value); },
      submit: () => submitRef.current()
    });
    return () => { mountedRef.current = false; };
  }, []);

  function save() {
    setBusy(true);
    return window.TradeJournalAccountProfileStore.updateProfile({ profileRole: role })
      .then((updated) => { setNotice(tr(lang, 'roleSaved')); onSaved(updated); return updated; })
      .catch(() => { setNotice(tr(lang, 'validationFailed')); return undefined; })
      .finally(() => setBusy(false));
  }
  submitRef.current = save;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'roleTitle')}</span>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.8 }}>{tr(lang, 'roleSub')}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {REAL_ROLES.map((r) => {
          const selected = role === r.id;
          return (
            <button key={r.id} type="button" onClick={() => setRole(r.id)} style={{
              position: 'relative', boxSizing: 'border-box', textAlign: 'start', cursor: 'pointer', font: 'inherit', padding: 20, borderRadius: 12,
              border: selected ? '2px solid var(--char-accent)' : '1px solid var(--border-hairline)',
              background: selected ? 'var(--char-active-surface)' : 'var(--surface-card)',
              boxShadow: selected ? '0 0 18px var(--char-glow), var(--shadow-panel)' : 'none',
              display: 'flex', flexDirection: 'column', gap: 12
            }}>
              {selected && <span aria-hidden="true" style={{ position: 'absolute', top: 6, insetInlineStart: 6, width: 16, height: 16, borderTop: '1px solid var(--char-accent)', borderInlineStart: '1px solid var(--char-accent)' }}></span>}
              <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ flex: 'none', width: 44, height: 44, borderRadius: 9, display: 'grid', placeItems: 'center', border: '1px solid ' + (selected ? 'var(--char-accent)' : 'var(--border-hairline)'), background: 'rgba(3,8,7,.45)', color: selected ? 'var(--char-accent)' : 'var(--text-muted)' }}><Icon name={r.icon} size={22} /></span>
                <span style={{ marginInlineStart: 'auto', width: 20, height: 20, borderRadius: '50%', boxSizing: 'border-box', border: '2px solid ' + (selected ? 'var(--char-accent)' : 'var(--steel)'), display: 'grid', placeItems: 'center' }}>
                  {selected && <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--char-accent)' }}></span>}
                </span>
              </span>
              <span style={{ fontSize: 15, fontWeight: selected ? 700 : 600, color: selected ? 'var(--parchment)' : 'var(--text-primary)' }}>{tr(lang, r.labelKey)}</span>
              <span style={{ fontSize: 12, color: selected ? 'var(--text-muted)' : 'var(--text-dim)', lineHeight: 1.75 }}>{tr(lang, r.descKey)}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button variant="primary" size="md" icon="save" disabled={busy} onClick={save}>{tr(lang, 'saveRole')}</Button>
        <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{notice || tr(lang, 'roleCurrentLine', { role: tr(lang, REAL_ROLES.find((r) => r.id === profile.profileRole)?.labelKey || 'roleTrader') })}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Subscription tab - Commercial System Validation Gate finding: this tab was still showing the
// pre-Slice-1 "not connected to a real billing system yet" stub even after Slices 1/2 built a
// real Wallet/Subscription/Storage backend, because a SEPARATE, no-longer-mounted file
// (navrya-src/subscriptionsView.jsx, written during Slice 1/2 without first confirming which
// component tree the live app actually renders) was updated instead of this one - the real one.
// Fixed here, in place, against the live component. subscriptionsView.jsx's own additions are
// now dead code and should be removed in a follow-up cleanup pass rather than silently left to
// confuse the next reader into thinking IT is what's live.
// ---------------------------------------------------------------------------------------------

function fmtMicroUsd(microUsd) { return '$' + (microUsd / 1000000).toFixed(2); }
function fmtBytesGb(bytes) { return (bytes / 1073741824).toFixed(bytes % 1073741824 === 0 ? 0 : 1) + ' GB'; }
function fmtDate(iso) { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
function fmtDateTime(iso) { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function humanizeSlug(slug) {
  return String(slug || '').split(/[-_]/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
const labelRow = { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' };
const PLAN_LABEL_KEY = { free: 'subPlanFree', plus: 'subPlanPlus', pro: 'subPlanPro', personalized: 'subPlanPersonalized' };
// An admin-set displayName (real-money subscription rollout - PATCH /api/admin/commercial/
// plans/:plan) always wins over the localized default when present; `catalog` is the SAME
// GET /api/sync/subscriptions/catalog response every caller here already fetches, never a second
// name source. Falls back to the pre-existing localized label exactly as before when `catalog` is
// omitted (a call site not yet passing it) or carries no override for this plan - fully backward
// compatible.
function planLabel(lang, planId, catalog) {
  if (!planId) return '';
  const override = catalog && catalog[planId] && catalog[planId].displayName;
  return override || tr(lang, PLAN_LABEL_KEY[planId] || planId);
}

// Wallet-affecting actions in this tab dispatch this so the header's own HONOUR metric
// (navrya-src/character-app.jsx's useWalletBalance()) refetches without a full page reload -
// same balance-changed convention used app-wide for other CustomEvent-driven refreshes.
function notifyWalletChanged() { window.dispatchEvent(new CustomEvent('navrya:wallet-changed')); }

// Wallet Activity's "why did my balance move" line - composed from the ledger row's own
// type/sourceAction/provider/model/feature (server/db/repo.*.mjs's wallet.grant()/settle()/
// release() are the only writers of these fields - see repo.memory.mjs's wallet object). There is
// no free-text reason column anywhere in this schema, so this is a client-side presentation
// mapping, not a lossy summary of a richer field that already existed.
function ledgerEntryDisplay(lang, entry) {
  const netMicroUsd = (entry.cashDeltaMicroUsd || 0) + (entry.promoDeltaMicroUsd || 0);
  const isCredit = netMicroUsd > 0;
  let title, subtitle;
  if (entry.type === 'AI_SETTLEMENT') {
    title = tr(lang, 'subLedgerAiUsage', { feature: entry.feature ? humanizeSlug(entry.feature) : tr(lang, 'subLedgerAssistant') });
    subtitle = [entry.provider, entry.model].filter(Boolean).join(' · ');
  } else if (entry.type === 'TOP_UP') {
    title = tr(lang, 'subLedgerTopUp'); subtitle = tr(lang, 'subLedgerManualBilling');
  } else if (entry.type === 'PROMO_CREDIT') {
    title = tr(lang, 'subLedgerSignupBonus'); subtitle = tr(lang, 'subLedgerPromoCredit');
  } else if (entry.type === 'ADMIN_CREDIT') {
    title = tr(lang, 'subLedgerAdminCredit');
    subtitle = entry.sourceAction && entry.sourceAction !== 'admin-credit' ? entry.sourceAction : tr(lang, 'subLedgerManualAdjustment');
  } else if (entry.type === 'ADMIN_DEBIT') {
    const isRefund = entry.sourceAction === 'refund';
    title = isRefund ? tr(lang, 'subLedgerRefundReversal') : tr(lang, 'subLedgerAdminDebit');
    subtitle = isRefund ? tr(lang, 'subLedgerTopUpRefunded') : (entry.sourceAction && entry.sourceAction !== 'admin-debit' ? entry.sourceAction : tr(lang, 'subLedgerManualAdjustment'));
  } else {
    title = humanizeSlug(entry.type); subtitle = entry.sourceAction || '';
  }
  // Paid-vs-promo impact (task B.3) - only worth a qualifier when the entry actually touched
  // both buckets, or when it's worth distinguishing which one moved; a pure single-bucket entry
  // (the overwhelmingly common case) stays unqualified to avoid clutter.
  let impact = '';
  if (entry.cashDeltaMicroUsd && entry.promoDeltaMicroUsd) impact = tr(lang, 'subImpactBoth');
  else if (entry.promoDeltaMicroUsd) impact = tr(lang, 'subImpactPromo');
  else if (entry.cashDeltaMicroUsd) impact = tr(lang, 'subImpactPaid');
  return { isCredit, title, subtitle, impact, amountLabel: (isCredit ? '+' : '-') + fmtMicroUsd(Math.abs(netMicroUsd)) };
}

const PLAN_ORDER = ['free', 'plus', 'pro', 'personalized'];
// The preset top-up amounts, filtered at render time against the server's REAL minimumTopUpUsd
// (GET /api/sync/wallet) so the wallet can never again offer an amount the server then rejects
// with 400 WALLET_TOPUP_BELOW_MINIMUM - the reported "$5 still errors" bug. An admin floor above
// every preset still needs something clickable, hence the derived fallback.
const TOPUP_PRESET_AMOUNTS = [5, 10, 25, 50, 100];
function topUpChoices(minimumUsd) {
  const min = Number(minimumUsd) > 0 ? Number(minimumUsd) : 0;
  const usable = TOPUP_PRESET_AMOUNTS.filter((v) => v >= min);
  return usable.length ? usable : [min, min * 2, min * 5].map((v) => Math.round(v));
}
// [pluralKey, singularKey, unlimitedKey] per limit - matches this app's existing One/Many
// pluralization convention (e.g. public/pages/shared/ai-i18n.js's aiAsstConversationsOne/Many).
const LIMIT_KEYS = {
  patterns: ['subFeatPatternsMany', 'subFeatPatternsOne', 'subFeatUnlimitedPatterns'],
  strategies: ['subFeatStrategiesMany', 'subFeatStrategiesOne', 'subFeatUnlimitedStrategies'],
  accounts: ['subFeatAccountsMany', 'subFeatAccountsOne', 'subFeatUnlimitedAccounts'],
  sessions: ['subFeatSessionsMany', 'subFeatSessionsOne', 'subFeatUnlimitedSessions'],
  analysisSymbols: ['subFeatSymbolsMany', 'subFeatSymbolsOne', 'subFeatUnlimitedSymbols']
};
// Every line is derived from the SAME effective config the entitlement resolver enforces
// server-side (GET /api/sync/subscriptions/catalog) - nothing here is a hard-coded plan number,
// so an admin-edited price/limit shows up correctly with no client change.
function planFeatureLines(lang, planConfig) {
  const lines = [tr(lang, 'subFeatCloudStorage', { size: fmtBytesGb(planConfig.storageBytes) })];
  Object.keys(LIMIT_KEYS).forEach((key) => {
    const val = planConfig.limits ? planConfig.limits[key] : null;
    const [manyKey, oneKey, unlimitedKey] = LIMIT_KEYS[key];
    lines.push(val === null || val === undefined ? tr(lang, unlimitedKey) : tr(lang, val === 1 ? oneKey : manyKey, { n: val }));
  });
  if (planConfig.features && planConfig.features.aiPanelBuilder) lines.push(tr(lang, 'subFeatAiPanelBuilder'));
  if (planConfig.features && planConfig.features.premiumModels) lines.push(tr(lang, 'subFeatPremiumModels'));
  if (planConfig.features && planConfig.features.byok) lines.push(tr(lang, 'subFeatByok'));
  // Real-money subscription rollout - shown only when the plan actually carries a discount, so
  // Free (fixed at 0, never admin-editable) never gets a hollow "0% off" line.
  if (planConfig.tokenDiscountPercent) lines.push(tr(lang, 'subFeatTokenDiscount', { percent: planConfig.tokenDiscountPercent }));
  return lines;
}

function PlanHero({ lang, plan, subscription, catalog, onToggleCancel }) {
  const [wallet, setWallet] = React.useState(null);
  const [storage, setStorage] = React.useState(null);
  React.useEffect(() => {
    fetch('/api/sync/wallet').then((r) => r.json()).then(setWallet).catch(() => {});
    fetch('/api/sync/storage').then((r) => r.json()).then(setStorage).catch(() => {});
  }, []);
  const isUnlimitedPlan = plan !== 'free';
  const storagePct = storage ? Math.min(100, (storage.usedBytes / Math.max(1, storage.quotaBytes)) * 100) : 0;
  return (
    <Panel variant="prestige" ornament ornamentSize={18} texture textureOpacity={0.05} padding="28px 30px">
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--char-active-surface)', border: '1px solid var(--border-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--char-accent)', flex: 'none' }}>
              <Icon name="subscription" size={28} />
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px rgba(46,204,113,.6)' }}></span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--success)' }}>{tr(lang, 'subActiveStatus')}</span>
              </div>
              <h2 style={{ margin: '3px 0 0', fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'subPlanSuffix', { plan: planLabel(lang, plan, catalog) })}</h2>
            </div>
          </div>
          {subscription ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--gold-warm)' }}>{fmtMicroUsd(subscription.priceAmountMicroUsd)}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr(lang, 'subPerMonth')}</span>
              </div>
              <div dir="ltr" style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
                {subscription.cancelAtPeriodEnd ? tr(lang, 'subCancelsNote', { date: fmtDate(subscription.currentPeriodEnd) }) : tr(lang, 'subRenews', { date: fmtDate(subscription.currentPeriodEnd) })}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="secondary" size="sm" onClick={onToggleCancel}>{subscription.cancelAtPeriodEnd ? tr(lang, 'subReactivate') : tr(lang, 'subCancelAtPeriodEnd')}</Button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{tr(lang, 'subFreeNoBilling')}</div>
          )}
        </div>

        <div style={{ width: 1, background: 'var(--divider-gold)', alignSelf: 'stretch' }}></div>

        <div style={{ flex: '1 1 300px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center' }}>
          {storage && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                <span style={labelRow}>{tr(lang, 'subStorageUsed')}</span>
                <span dir="ltr" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtBytesGb(storage.usedBytes)}{tr(lang, 'subOfQuotaUsed', { quota: fmtBytesGb(storage.quotaBytes) })}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'rgba(244,234,215,.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: storagePct + '%', borderRadius: 999, background: 'linear-gradient(90deg, var(--char-accent-strong), var(--char-accent))' }}></div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ flex: 1, padding: '13px 15px', borderRadius: 10, border: '1px solid var(--border-gold)', background: 'var(--surface-card)' }}>
              <div style={{ ...labelRow, marginBottom: 6 }}>{tr(lang, 'subWalletBalance')}</div>
              <div className="navrya-tabular" style={{ fontSize: 20, fontWeight: 700, color: 'var(--parchment)' }}>{wallet ? fmtMicroUsd(wallet.totalBalanceMicroUsd) : '—'}</div>
            </div>
            <div style={{ flex: 1, padding: '13px 15px', borderRadius: 10, border: '1px solid var(--border-gold)', background: 'var(--surface-card)' }}>
              <div style={{ ...labelRow, marginBottom: 6 }}>{tr(lang, 'subPlanLimits')}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: isUnlimitedPlan ? 'var(--char-accent)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 7 }}>
                {isUnlimitedPlan ? <><Icon name="Infinity" size={15} />{tr(lang, 'subUnlimited')}</> : tr(lang, 'subFreeTierCaps')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// The plan the comparison grid highlights. Purely presentational - it changes no price, no
// entitlement and no server behaviour, and if an admin ever renames or removes this plan the grid
// simply highlights nothing.
const RECOMMENDED_PLAN = 'pro';
// The three boolean plan features, rendered as the SAME three rows in every card (a check when the
// plan has it, a lock when it does not) rather than only listing the ones a plan happens to
// include - that is what lets the rows line up across columns.
const PERK_ROWS = [
  { key: 'premiumModels', label: 'subFeatPremiumModels' },
  { key: 'byok', label: 'subFeatByok' },
  { key: 'aiPanelBuilder', label: 'subFeatAiPanelBuilder' }
];
// Every band below has a FIXED height, so the four cards line up row-for-row and their CTAs sit on
// one line - the alignment is structural, not a coincidence of how long each plan's text happens
// to be. planFeatureLines()' first six entries are storage + the five limits, which every plan
// always has; the optional feature/discount lines it appends after those are rendered separately
// as the fixed perk rows and discount strip instead.
const PLAN_SPEC_ROW_COUNT = 6;
// The six spec rows, rendered as label + value in two columns (matching the design file) rather
// than one sentence per bullet. Every plan has all six, which is what keeps the rows lined up.
const SPEC_ROWS = [
  { key: 'storage', label: 'subSpecStorage' },
  { key: 'patterns', label: 'subSpecPatterns' },
  { key: 'strategies', label: 'subSpecStrategies' },
  { key: 'accounts', label: 'subSpecAccounts' },
  { key: 'sessions', label: 'subSpecSessions' },
  { key: 'analysisSymbols', label: 'subSpecSymbols' }
];
function specValue(lang, cfg, key) {
  if (key === 'storage') return fmtBytesGb(cfg.storageBytes);
  const limit = cfg.limits ? cfg.limits[key] : null;
  return limit === null || limit === undefined ? tr(lang, 'subSpecUnlimited') : digits(lang, limit);
}

function PlanComparisonGrid({ lang, plan, catalog, onUpgrade }) {
  if (!catalog) return null;
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...labelRow, marginBottom: 4 }}>{tr(lang, 'subChooseYourPlan')}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{tr(lang, 'subUpgradesEffectNote')}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(238px, 1fr))', gap: 18 }}>
        {PLAN_ORDER.map((planId) => {
          const cfg = catalog[planId];
          if (!cfg) return null;
          const isCurrent = planId === plan;
          const isPast = PLAN_ORDER.indexOf(planId) < PLAN_ORDER.indexOf(plan);
          const isRecommended = planId === RECOMMENDED_PLAN && !isCurrent && !isPast;
          const specs = planFeatureLines(lang, cfg).slice(0, PLAN_SPEC_ROW_COUNT);
          const features = cfg.features || {};
          return (
            <Panel key={planId} variant={isCurrent ? 'active' : 'base'} ornament={isCurrent} ornamentSize={18} glow={isCurrent || isRecommended}
              padding="22px 20px"
              style={{
                minWidth: 0, display: 'flex', flexDirection: 'column',
                ...(isRecommended ? { border: '1px solid color-mix(in srgb, var(--char-accent) 90%, transparent)' } : null)
              }}
            >
              {/* badge band - 26px whether or not this card has a badge. Every band below is
                  start-aligned (right in RTL), matching the design file: centring the name and
                  price is what made them read as sitting on top of each other. */}
              <div style={{ height: 26, display: 'flex', alignItems: 'center', flex: 'none' }}>
                {(isCurrent || isRecommended) && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 6, background: 'var(--char-accent)', color: 'var(--ink-950)', fontSize: 11, fontWeight: 700, letterSpacing: '.06em' }}>
                    {tr(lang, isCurrent ? 'subCurrentPlan' : 'subRecommended')}
                  </span>
                )}
              </div>

              <div style={{ height: 26, marginTop: 14, display: 'flex', alignItems: 'center', flex: 'none' }}>
                <span style={{ fontSize: 13, lineHeight: '20px', fontWeight: 700, letterSpacing: '.08em', color: isCurrent || isRecommended ? 'var(--char-accent)' : 'var(--text-muted)' }}>{planLabel(lang, planId, catalog)}</span>
              </div>

              {/* an explicit lineHeight keeps the 34px figure inside its own 46px band - without it
                  the glyph box overflowed upward into the name band above */}
              <div style={{ height: 46, display: 'flex', alignItems: 'baseline', gap: 8, flex: 'none' }}>
                <span dir="ltr" className="navrya-tabular" style={{ fontSize: 34, lineHeight: '42px', fontWeight: 800, color: 'var(--parchment)' }}>{cfg.price.amountUsd > 0 ? '$' + cfg.price.amountUsd.toFixed(2).replace(/\.00$/, '') : '$0'}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/ {tr(lang, cfg.price.billingInterval === 'year' ? 'subIntervalYear' : 'subIntervalMonth')}</span>
              </div>

              <div style={{ height: 1, background: 'var(--divider-gold)', margin: '14px 0', flex: 'none' }} />

              <div style={{ flex: 'none' }}>
                {SPEC_ROWS.map((row, i) => (
                  <div key={row.key} style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minWidth: 0, borderBottom: i === SPEC_ROWS.length - 1 ? 'none' : '1px solid rgba(244,234,215,.055)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr(lang, row.label)}</span>
                    <span dir="ltr" className="navrya-tabular" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', flex: 'none' }}>{specValue(lang, cfg, row.key)}</span>
                  </div>
                ))}
              </div>

              <div style={{ height: 1, background: 'var(--divider-gold)', margin: '14px 0', flex: 'none' }} />

              <div style={{ flex: 'none' }}>
                {PERK_ROWS.map((perk) => {
                  const on = !!features[perk.key];
                  return (
                    <div key={perk.key} style={{ height: 26, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <Icon name={on ? 'check' : 'lock'} size={14} strokeWidth={on ? 2.4 : 2} style={{ flex: 'none', color: on ? 'var(--char-accent)' : 'var(--text-disabled)' }} />
                      <span style={{ fontSize: 12, color: on ? 'var(--text-primary)' : 'var(--text-disabled)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr(lang, perk.label)}</span>
                    </div>
                  );
                })}
              </div>

              {/* token-discount strip - label at the start, figure at the end (never centred), and
                  always 36px so a plan without a discount does not shorten its card */}
              <div style={{
                height: 36, marginTop: 14, flex: 'none', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 12px',
                background: cfg.tokenDiscountPercent ? 'var(--char-active-surface)' : 'rgba(3,8,7,.35)',
                border: cfg.tokenDiscountPercent ? '1px solid color-mix(in srgb, var(--char-accent) 55%, transparent)' : '1px dashed rgba(244,234,215,.14)'
              }}>
                <span style={{ fontSize: 11.5, fontWeight: cfg.tokenDiscountPercent ? 600 : 500, color: cfg.tokenDiscountPercent ? 'var(--char-accent)' : 'var(--text-disabled)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr(lang, 'subTokenDiscountLabel')}</span>
                <span dir="ltr" className="navrya-tabular" style={{ fontSize: 13, fontWeight: 700, flex: 'none', color: cfg.tokenDiscountPercent ? 'var(--char-accent)' : 'var(--text-disabled)' }}>{cfg.tokenDiscountPercent ? digits(lang, cfg.tokenDiscountPercent) + '٪' : '—'}</span>
              </div>

              <div style={{ height: 44, marginTop: 16, flex: 'none', display: 'flex', alignItems: 'center' }}>
                {isCurrent ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--char-accent)' }}>
                    <Icon name="check" size={14} />{tr(lang, 'subActivePlan')}
                  </span>
                ) : isPast ? (
                  <span style={{ fontSize: 11.5, color: 'var(--text-disabled)' }}>{tr(lang, 'subPreviousPlan')}</span>
                ) : (
                  <Button variant={isRecommended ? 'primary' : 'secondary'} size="sm" fullWidth style={{ justifyContent: 'center' }} onClick={() => onUpgrade(planId)}>{tr(lang, 'subUpgradeTo', { plan: planLabel(lang, planId, catalog) })}</Button>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

// A dedicated popup (not just the inline Notice banner every other wallet/storage/subscription
// error uses) for the one error a shopper is most likely to trigger by simply mistyping an amount
// - shown clearly enough that they don't need to re-read a small inline error string to understand
// why their request was refused. minimumTopUpUsd always comes from the server's own response
// (server/commercial/commercial-defaults.mjs's WALLET_DEFAULTS, admin-editable via Admin >
// Commercial > Wallet), never hardcoded here, so this stays correct if that value ever changes.
function TopUpMinimumModal({ lang, minimumTopUpUsd, onClose }) {
  return (
    <Modal open title={tr(lang, 'subTopUpMinTitle')} icon="circle-alert" onClose={onClose} width={380}
      footer={(<><span style={{ flex: 1 }} /><Button variant="primary" onClick={onClose}>{tr(lang, 'subTopUpMinOk')}</Button></>)}
    >
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.6 }}>
        {tr(lang, 'subTopUpMinBody', { amount: fmtMicroUsd(Math.round(Number(minimumTopUpUsd) * 1000000)) })}
      </p>
    </Modal>
  );
}

// Checkout sheet, shared by WalletCard's top-up flow and SubscriptionTab's upgrade flow - never
// two separate pickers, and never a second popup stacked on the first: both steps live in THIS
// modal and slide horizontally, the way a normal checkout behaves.
//
// Step 1 picks the rail. Only "crypto" actually proceeds (into the existing, already-real BSC
// invoice flow via `onProceed`) - Visa and the Iran gateway have no implementation yet, so picking
// either shows an honest "not added yet" notice in place and does NOT advance, exactly per the
// explicit instruction to never claim an unbuilt path works. The Iran gateway option itself is
// only ever rendered for `lang === 'fa'` (never shown to a non-Persian user, not merely disabled).
//
// Step 2 shows the real invoice for this exact purchase. `amountUsd` is the SAME number the
// server will charge (the wallet amount the user typed, or catalog[plan].price.amountUsd straight
// from GET /subscriptions/catalog) - never a separate client-side price calculation.
//
// The discount-code row is rendered DISABLED with an honest "not added yet" line: there is no
// coupon/discount-code implementation anywhere on the server (no table, no route, no validation),
// so an input that appeared to accept a code would be inventing a feature. It is placed here, in
// its designed position, so wiring a real one later is a drop-in.
const PAY_SHEET_STEPS = 3;

function PaymentSheet({ lang, title, lineItem, amountUsd, onProceed, onClose, onConfirmed }) {
  const [step, setStep] = React.useState(0);
  const [method, setMethod] = React.useState(null);
  const [notAdded, setNotAdded] = React.useState(false);
  // Set once the request has actually been created server-side; moving to step 2 shows that real
  // invoice INSIDE this same sheet rather than closing and opening a second popup over the page.
  const [invoiceId, setInvoiceId] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [failure, setFailure] = React.useState('');
  const methodPanel = React.useRef(null);
  const reviewPanel = React.useRef(null);
  const invoicePanel = React.useRef(null);
  // The invoice panel's own imperative Check Now action, plus its reported checking/canCheck
  // state - the footer button lives HERE (next to Close), never floating inside the panel itself.
  const invoiceApiRef = React.useRef(null);
  const [invoiceStatus, setInvoiceStatus] = React.useState({ checking: false, canCheck: false });
  const [bodyHeight, setBodyHeight] = React.useState(null);

  const methods = [
    { id: 'crypto', icon: 'wallet', label: tr(lang, 'subPayMethodCrypto'), desc: tr(lang, 'subPayMethodCryptoDesc'), implemented: true },
    { id: 'visa', icon: 'credit-card', label: tr(lang, 'subPayMethodVisa'), desc: tr(lang, 'subPayMethodVisaDesc'), implemented: false },
    ...(lang === 'fa' ? [{ id: 'iran-gateway', icon: 'landmark', label: tr(lang, 'subPayMethodIranGateway'), desc: tr(lang, 'subPayMethodIranGatewayDesc'), implemented: false }] : [])
  ];
  const amountLabel = fmtMicroUsd(Math.round(Number(amountUsd || 0) * 1000000));

  // The sheet's height follows whichever panel is showing, measured rather than hardcoded - a
  // fixed height would clip the taller step in a language whose strings wrap differently.
  React.useLayoutEffect(() => {
    const el = [methodPanel, reviewPanel, invoicePanel][step].current;
    if (el) setBodyHeight(el.scrollHeight);
  });

  function pick(chosen) {
    if (!chosen.implemented) { setNotAdded(true); return; }
    setNotAdded(false);
    setMethod(chosen);
    setStep(1);
  }

  // onProceed resolves with the created request. A crypto rail answers with a real invoiceId, so
  // the sheet advances to its own invoice step; anything else (the manual provider) is finished
  // server-side already and the sheet hands back to the page.
  function submit() {
    setSubmitting(true);
    setFailure('');
    Promise.resolve(onProceed(method.id))
      .then((result) => {
        if (result && result.invoiceId) { setInvoiceId(result.invoiceId); setStep(2); }
        else onClose();
      })
      .catch((error) => setFailure(error && error.message ? error.message : String(error)))
      .finally(() => setSubmitting(false));
  }

  const footer = step === 0
    ? (<><span style={{ flex: 1 }} /><Button variant="secondary" onClick={onClose}>{tr(lang, 'subCancel')}</Button></>)
    : step === 1 ? (
      <>
        <Button variant="ghost" onClick={() => setStep(0)}>{tr(lang, 'subPayBack')}</Button>
        <span style={{ flex: 1 }} />
        <Button variant="primary" disabled={submitting} onClick={submit}>{tr(lang, 'subPayConfirm', { amount: amountLabel })}</Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={onClose}>{tr(lang, 'subInvoiceClose')}</Button>
        <span style={{ flex: 1 }} />
        {invoiceStatus.canCheck && (
          <Button variant="primary" loading={invoiceStatus.checking} onClick={() => invoiceApiRef.current && invoiceApiRef.current.checkNow()}>{tr(lang, 'subInvoiceCheckNow')}</Button>
        )}
      </>
    );

  return (
    <Modal open title={title} icon="wallet" onClose={onClose} width={460} footer={footer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {Array.from({ length: PAY_SHEET_STEPS }).map((unused, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <span style={{ flex: 1, height: 2, borderRadius: 2, background: 'rgba(244,234,215,.10)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: step >= i ? '100%' : '0%', background: 'var(--char-accent)', transition: 'width var(--dur-expand, 220ms) var(--ease-out)' }} />
                </span>
              )}
              <span style={{ width: 7, height: 7, borderRadius: '50%', flex: 'none', background: step >= i ? 'var(--char-accent)' : 'var(--text-disabled)', transform: step === i ? 'scale(1.35)' : 'none', transition: 'background var(--dur-expand, 220ms) var(--ease-out), transform var(--dur-expand, 220ms) var(--ease-out)' }} />
            </React.Fragment>
          ))}
          <span style={{ marginInlineStart: 6, fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {tr(lang, ['subPayStepMethod', 'subPayStepReview', 'subPayStepInvoice'][step])}
          </span>
        </div>

        {/* dir="ltr" is load-bearing: in an RTL container an overflow:hidden box starts scrolled
            to its RIGHT edge, which would show the LAST panel instead of the first. */}
        <div dir="ltr" style={{ overflow: 'hidden', height: bodyHeight == null ? 'auto' : bodyHeight, transition: 'height var(--dur-expand, 220ms) var(--ease-out)' }}>
          <div style={{ display: 'flex', width: '300%', alignItems: 'flex-start', transform: 'translateX(-' + (step * (100 / PAY_SHEET_STEPS)) + '%)', transition: 'transform 320ms var(--ease-out)' }}>

            <div ref={methodPanel} dir={lang === 'en' || lang === 'es' ? 'ltr' : 'rtl'} style={{ width: (100 / PAY_SHEET_STEPS) + '%', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr(lang, 'subPayChooseMethod')}</span>
              {methods.map((entry) => (
                <button
                  key={entry.id} type="button" onClick={() => pick(entry)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, minHeight: 62, padding: '10px 14px', borderRadius: 9,
                    cursor: entry.implemented ? 'pointer' : 'not-allowed', opacity: entry.implemented ? 1 : 0.6,
                    border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.45)', color: 'var(--text-primary)',
                    font: 'var(--type-body)', textAlign: 'start', width: '100%'
                  }}
                >
                  <Icon name={entry.icon} size={18} />
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{entry.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{entry.desc}</span>
                  </span>
                  <span style={{ fontSize: 10.5, color: entry.implemented ? 'var(--char-accent)' : 'var(--text-dim)', flex: 'none' }}>
                    {tr(lang, entry.implemented ? 'subPayMethodActive' : 'subPayMethodComingSoon')}
                  </span>
                </button>
              ))}
              {notAdded && <Notice tone="accent" icon="status">{tr(lang, 'subPayMethodNotAdded')}</Notice>}
            </div>

            <div ref={reviewPanel} dir={lang === 'en' || lang === 'es' ? 'ltr' : 'rtl'} style={{ width: (100 / PAY_SHEET_STEPS) + '%', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.45)' }}>
                <Icon name={method ? method.icon : 'wallet'} size={16} />
                <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-primary)' }}>{method ? method.label : ''}</span>
                <Button variant="ghost" size="sm" onClick={() => setStep(0)}>{tr(lang, 'subPayChange')}</Button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{tr(lang, 'subPayDiscountCode')}</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}><TextField value="" onChange={() => {}} disabled placeholder={tr(lang, 'subPayDiscountPlaceholder')} /></div>
                  <span style={{ fontSize: 10.5, color: 'var(--text-dim)', flex: 'none' }}>{tr(lang, 'subPayMethodComingSoon')}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(lang, 'subPayDiscountUnavailable')}</span>
              </div>

              <div style={{ borderRadius: 9, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.45)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', height: 32, padding: '0 14px', borderBottom: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-muted)' }}>{tr(lang, 'subPayInvoice')}</span>
                </div>
                <div style={{ padding: '10px 14px 12px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 26 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lineItem}</span>
                    <span dir="ltr" className="navrya-tabular" style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{amountLabel}</span>
                  </div>
                  <div style={{ height: 1, background: 'var(--divider-gold)', margin: '8px 0' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 30 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'subPayTotal')}</span>
                    <span dir="ltr" className="navrya-tabular" style={{ fontSize: 19, fontWeight: 700, color: 'var(--char-accent)' }}>{amountLabel}</span>
                  </div>
                  <span style={{ fontSize: 10.5, color: 'var(--text-dim)', lineHeight: 1.5, marginTop: 2 }}>{tr(lang, 'subPayCurrencyNote')}</span>
                </div>
              </div>

              {!!failure && <Notice tone="danger" icon="status">{failure}</Notice>}
            </div>

            <div ref={invoicePanel} dir={lang === 'en' || lang === 'es' ? 'ltr' : 'rtl'} style={{ width: (100 / PAY_SHEET_STEPS) + '%', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {invoiceId && <CryptoInvoicePanel ref={invoiceApiRef} lang={lang} tr={tr} invoiceId={invoiceId} onConfirmed={onConfirmed} onStatus={setInvoiceStatus} />}
            </div>

          </div>
        </div>
      </div>
    </Modal>
  );
}

function WalletCard({ lang, onNotice, onBelowMinimum }) {
  const [wallet, setWallet] = React.useState(null);
  // Starts EMPTY on purpose: the first sensible default is the smallest amount the server actually
  // accepts, which is only known once GET /api/sync/wallet answers with its minimumTopUpUsd.
  const [amount, setAmount] = React.useState('');
  const [showCheckout, setShowCheckout] = React.useState(false);

  function reload() {
    fetch('/api/sync/wallet').then((r) => r.json()).then((data) => {
      setWallet(data);
      setAmount((current) => (current === '' ? String(topUpChoices(data.minimumTopUpUsd)[0]) : current));
    }).catch(() => {});
  }
  React.useEffect(reload, []);

  // Returns the created request so the checkout sheet can slide its own invoice step in. A
  // below-minimum rejection still gets the dedicated popup and closes the sheet; every other
  // failure is thrown so the sheet shows it in place rather than vanishing.
  function requestTopUp() {
    const amountUsd = Number(amount) || 0;
    return fetch('/api/sync/wallet/topup-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd }) })
      .then((r) => r.json().then((body) => {
        if (!r.ok) { const error = new Error(body.error); error.details = body; throw error; }
        return body;
      }))
      .then((result) => {
        reload(); notifyWalletChanged();
        if (!result.invoiceId) onNotice(tr(lang, 'subTopUpNotice', { amount: fmtMicroUsd(amountUsd * 1000000) }));
        return result;
      })
      .catch((error) => {
        if (error.details && error.details.error === 'WALLET_TOPUP_BELOW_MINIMUM') {
          onBelowMinimum(error.details.minimumTopUpUsd);
          return {};
        }
        throw new Error(tr(lang, 'subTopUpError', { error: error.message }));
      });
  }

  if (!wallet) return null;
  // Both come from the server's own answer, never a client-side constant.
  const minTopUpUsd = Number(wallet.minimumTopUpUsd) > 0 ? Number(wallet.minimumTopUpUsd) : 0;
  const amountUsd = Number(amount) || 0;
  const belowMinimum = !(amountUsd >= minTopUpUsd);
  const lowBalance = wallet.totalBalanceMicroUsd < 1000000;
  const boxed = { padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' };
  const railChip = {
    display: 'inline-flex', alignItems: 'center', gap: 7, height: 26, padding: '0 10px', borderRadius: 6,
    fontSize: 11, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)'
  };

  return (
    <Panel variant="base" ornament padding="22px 24px">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 1px minmax(280px, 1.15fr)', gap: 24, alignItems: 'stretch' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--text-muted)' }}>{tr(lang, 'subAiWallet')}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span dir="ltr" className="navrya-tabular" style={{ fontSize: 38, lineHeight: '44px', fontWeight: 800, color: 'var(--parchment)' }}>{fmtMicroUsd(wallet.totalBalanceMicroUsd)}</span>
            {lowBalance && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 8px', borderRadius: 6, fontSize: 10.5, color: 'var(--warning)', background: 'rgba(255,176,32,.10)', border: '1px solid rgba(255,176,32,.38)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                {tr(lang, 'subWalletLowBalance')}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <div style={boxed}>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 4 }}>{tr(lang, 'subWalletPromoLabel')}</div>
              <div dir="ltr" className="navrya-tabular" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtMicroUsd(wallet.promoBalanceMicroUsd)}</div>
            </div>
            <div style={boxed}>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 4 }}>{tr(lang, 'subWalletPaidLabel')}</div>
              <div dir="ltr" className="navrya-tabular" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{fmtMicroUsd(wallet.paidBalanceMicroUsd)}</div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.65, color: 'var(--text-dim)' }}>{tr(lang, 'subWalletHint')}</p>
        </div>

        <div style={{ background: 'var(--divider-gold)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'subWalletAddCredit')}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              {tr(lang, 'subWalletMinimumIs', { amount: '' })}
              <span dir="ltr" className="navrya-tabular" style={{ color: 'var(--char-accent)', fontWeight: 700 }}>{fmtMicroUsd(Math.round(minTopUpUsd * 1000000))}</span>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {topUpChoices(wallet.minimumTopUpUsd).map((v) => {
              const on = amountUsd === v;
              return (
                <button
                  key={v} type="button" onClick={() => setAmount(String(v))}
                  style={{
                    height: 34, minWidth: 62, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    color: on ? 'var(--char-accent)' : 'var(--text-muted)',
                    background: on ? 'var(--char-active-surface)' : 'rgba(3,8,7,.45)',
                    border: '1px solid ' + (on ? 'var(--char-accent)' : 'var(--border-gold)'),
                    transition: 'background 160ms var(--ease-out), border-color 160ms var(--ease-out), color 160ms var(--ease-out)'
                  }}
                >${v}</button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: '1 1 170px', minWidth: 0 }}>
              <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{tr(lang, 'subWalletCustomAmount')}</span>
              <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span dir="ltr" style={{ position: 'absolute', insetInlineStart: 14, fontSize: 13, color: 'var(--text-muted)', pointerEvents: 'none' }}>$</span>
                <input
                  dir="ltr" type="number" min={minTopUpUsd} step="1" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="navrya-tabular"
                  style={{
                    height: 44, width: '100%', boxSizing: 'border-box', padding: '0 14px 0 30px', borderRadius: 8,
                    background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', fontFamily: 'inherit',
                    fontSize: 13, fontWeight: 600, border: '1px solid ' + (belowMinimum ? 'var(--warning)' : 'var(--border-gold)'),
                    outline: 'none', textAlign: 'start'
                  }}
                />
              </span>
            </label>
            <Button variant="primary" icon="wallet" disabled={belowMinimum} onClick={() => setShowCheckout(true)} style={{ flex: 'none' }}>
              {tr(lang, 'subWalletContinueToPay')} · <span dir="ltr" className="navrya-tabular">{fmtMicroUsd(Math.round(amountUsd * 1000000))}</span>
            </Button>
          </div>

          {/* Live, up-front validation against the server's own floor - the shopper learns the
              rule while typing instead of by being rejected after choosing a payment method. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 16 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', flex: 'none', background: belowMinimum ? 'var(--warning)' : 'var(--char-accent)' }} />
            <span style={{ fontSize: 11, color: belowMinimum ? 'var(--warning)' : 'var(--char-accent)' }}>
              {belowMinimum
                ? tr(lang, 'subTopUpMinHint', { amount: fmtMicroUsd(Math.round(minTopUpUsd * 1000000)) })
                : tr(lang, 'subTopUpAmountValid')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(lang, 'subWalletMethodsLabel')}</span>
            <span style={{ ...railChip, color: 'var(--text-muted)' }}><Icon name="wallet" size={13} style={{ color: 'var(--char-accent)' }} />{tr(lang, 'subPayMethodCrypto')}</span>
            <span style={{ ...railChip, color: 'var(--text-muted)' }}><Icon name="credit-card" size={13} />{tr(lang, 'subPayMethodVisa')}</span>
            {lang === 'fa' && (
              <span style={{ ...railChip, color: 'var(--text-disabled)' }}><Icon name="landmark" size={13} />{tr(lang, 'subPayMethodIranGateway')} · {tr(lang, 'subPayMethodComingSoon')}</span>
            )}
          </div>
        </div>
      </div>

      {showCheckout && (
        <PaymentSheet
          lang={lang}
          title={tr(lang, 'subPayMethodTitle')}
          lineItem={tr(lang, 'subPayLineItemTopUp')}
          amountUsd={amountUsd}
          onProceed={requestTopUp}
          onConfirmed={() => { reload(); notifyWalletChanged(); }}
          onClose={() => setShowCheckout(false)}
        />
      )}
    </Panel>
  );
}

function ledgerFilters(lang) {
  return [
    { id: 'all', label: tr(lang, 'subFilterAll') },
    { id: 'usage', label: tr(lang, 'subFilterUsage') },
    { id: 'credit', label: tr(lang, 'subFilterCredit') }
  ];
}

function WalletActivityCard({ lang }) {
  const [entries, setEntries] = React.useState(null);
  const [filter, setFilter] = React.useState('all');
  React.useEffect(() => {
    fetch('/api/sync/wallet/ledger').then((r) => r.json())
      // AI_RELEASE rows are a held-reservation release, always net $0 - not a meaningful "why did
      // my balance move" event, so they're filtered out here rather than shown as a $0.00 row.
      .then((d) => setEntries((d.entries || []).filter((e) => e.type !== 'AI_RELEASE')))
      .catch(() => setEntries([]));
  }, []);
  if (!entries) return null;
  const filtered = entries.filter((e) => {
    if (filter === 'all') return true;
    const net = (e.cashDeltaMicroUsd || 0) + (e.promoDeltaMicroUsd || 0);
    return filter === 'usage' ? net < 0 : net > 0;
  });
  // Running total of AI consumption (task requirement) - every AI_SETTLEMENT row's real,
  // already-discounted net spend, summed lifetime over whatever this ledger fetch returned. Never
  // recomputed from provider cost/markup - this is the exact same number each row already shows,
  // just added up, so it can never drift from what the rows themselves display.
  const aiUsageTotalMicroUsd = entries
    .filter((e) => e.type === 'AI_SETTLEMENT')
    .reduce((sum, e) => sum + Math.abs((e.cashDeltaMicroUsd || 0) + (e.promoDeltaMicroUsd || 0)), 0);
  return (
    <Panel variant="base" ornament padding="22px 24px">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 4 }}>
        <div style={labelRow}>{tr(lang, 'subWalletActivityTitle')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {ledgerFilters(lang).map((f) => (
            <Chip key={f.id} tone={filter === f.id ? 'accent' : 'neutral'} style={{ cursor: 'pointer' }} onClick={() => setFilter(f.id)}>{f.label}</Chip>
          ))}
        </div>
      </div>
      {aiUsageTotalMicroUsd > 0 && (
        <div dir="ltr" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          {tr(lang, 'subAiUsageTotal', { amount: fmtMicroUsd(aiUsageTotalMicroUsd) })}
        </div>
      )}
      {filtered.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', padding: '12px 4px' }}>{tr(lang, 'subNoActivity')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filtered.map((entry) => {
            const d = ledgerEntryDisplay(lang, entry);
            return (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 4px', borderBottom: '1px solid rgba(244,234,215,.06)' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, flex: 'none', background: d.isCredit ? 'rgba(46,204,113,.12)' : 'rgba(255,56,48,.12)', color: d.isCredit ? 'var(--success)' : 'var(--danger)' }}>
                  <Icon name={d.isCredit ? 'ArrowUpRight' : 'ArrowDownLeft'} size={16} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{d.title}</div>
                  <div dir="ltr" style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2 }}>{d.subtitle}{d.subtitle ? ' · ' : ''}{fmtDateTime(entry.createdAt)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <div dir="ltr" className="navrya-tabular" style={{ fontSize: 14, fontWeight: 700, color: d.isCredit ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}>{d.amountLabel}</div>
                  {!!d.impact && <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{d.impact}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function StorageCard({ lang, onNotice, onInvoice }) {
  const [storage, setStorage] = React.useState(null);
  const [products, setProducts] = React.useState([]);
  function reload() {
    fetch('/api/sync/storage').then((r) => r.json()).then(setStorage).catch(() => {});
    fetch('/api/sync/storage/products').then((r) => r.json()).then((d) => setProducts(d.products || [])).catch(() => {});
  }
  React.useEffect(reload, []);
  function requestPurchase(product) {
    fetch('/api/sync/storage/purchase-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: product.id }) })
      .then((r) => r.json().then((body) => { if (!r.ok) throw new Error(body.error); return body; }))
      .then((result) => {
        if (result.invoiceId) onInvoice(result.invoiceId);
        else onNotice(tr(lang, 'subStorageNotice', { name: product.name }));
        reload(); notifyWalletChanged();
      })
      .catch((error) => onNotice(tr(lang, 'subStorageError', { error: error.message })));
  }
  if (!storage) return null;
  const pct = Math.min(100, (storage.usedBytes / Math.max(1, storage.quotaBytes)) * 100);
  const activeEntitlements = (storage.entitlements || []).filter((e) => new Date(e.expiresAt).getTime() > Date.now());
  return (
    <Panel variant="base" ornament padding="22px 24px">
      <div style={{ ...labelRow, marginBottom: 10 }}>{tr(lang, 'subCloudStorage')}</div>
      <div dir="ltr" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--parchment)' }}>{fmtBytesGb(storage.usedBytes)}</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>{tr(lang, 'subOfQuotaUsed', { quota: fmtBytesGb(storage.quotaBytes) })}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'rgba(244,234,215,.08)', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ height: '100%', width: pct + '%', borderRadius: 999, background: 'linear-gradient(90deg, var(--char-accent-strong), var(--char-accent))' }}></div>
      </div>
      {!!activeEntitlements.length && (
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 22 }}>
          {activeEntitlements.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '9px 2px', borderBottom: '1px solid rgba(244,234,215,.06)' }}>
              <span style={{ color: 'var(--text-primary)' }}>{tr(lang, 'subStorageAddOn')}</span>
              <span dir="ltr" style={{ color: 'var(--text-muted)' }}>{fmtBytesGb(e.capacityBytesSnapshot)} · {tr(lang, 'subExpiresOn', { date: fmtDate(e.expiresAt) })}</span>
            </div>
          ))}
        </div>
      )}
      {!!products.length && (
        <>
          <div style={{ ...labelRow, marginBottom: 12 }}>{tr(lang, 'subAddMoreStorage')}</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {products.map((p) => (
              <div key={p.id} style={{ flex: '1 1 200px', minWidth: 180, borderRadius: 10, border: '1px solid var(--border-gold)', background: 'var(--surface-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                <div dir="ltr" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{tr(lang, 'subCapacityValidity', { capacity: fmtBytesGb(p.capacityBytes), days: p.validityDays })}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold-warm)' }}>{fmtMicroUsd(p.priceAmountMicroUsd)}</div>
                <Button variant="secondary" size="sm" style={{ justifyContent: 'center', marginTop: 'auto' }} onClick={() => requestPurchase(p)}>{tr(lang, 'subPurchase')}</Button>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

const TX_STATUS_KEY = {
  confirmed: { color: 'var(--success)', border: 'rgba(46,204,113,.4)', background: 'rgba(46,204,113,.08)', key: 'subStatusPaid' },
  pending: { color: 'var(--warning)', border: 'rgba(255,176,32,.4)', background: 'rgba(255,176,32,.08)', key: 'subStatusPending' },
  failed: { color: 'var(--danger)', border: 'rgba(255,56,48,.4)', background: 'rgba(255,56,48,.08)', key: 'subStatusFailed' },
  refunded: { color: 'var(--info)', border: 'rgba(77,163,255,.4)', background: 'rgba(77,163,255,.08)', key: 'subStatusRefunded' }
};
const TX_TYPE_KEY = { wallet_topup: 'subTxWalletTopUp', subscription: 'subTxSubscription', storage_purchase: 'subTxStoragePurchase', refund: 'subTxRefund' };

function BillingHistoryCard({ lang }) {
  const [transactions, setTransactions] = React.useState(null);
  React.useEffect(() => {
    fetch('/api/sync/wallet/transactions').then((r) => r.json()).then((d) => setTransactions(d.transactions || [])).catch(() => setTransactions([]));
  }, []);
  if (!transactions) return null;
  return (
    <Panel variant="base" ornament padding="22px 24px">
      <div style={{ ...labelRow, marginBottom: 18 }}>{tr(lang, 'subBillingHistory')}</div>
      {transactions.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{tr(lang, 'subNoBillingActivity')}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 100px 90px', gap: 12, padding: '0 6px 11px', borderBottom: '1px solid var(--divider-gold)', fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            <span>{tr(lang, 'subColDate')}</span><span>{tr(lang, 'subColDescription')}</span><span>{tr(lang, 'subColAmount')}</span><span>{tr(lang, 'subColStatus')}</span>
          </div>
          {transactions.map((tx) => {
            const st = TX_STATUS_KEY[tx.status] || TX_STATUS_KEY.pending;
            return (
              <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 100px 90px', gap: 12, padding: '14px 6px', borderBottom: '1px solid rgba(244,234,215,.06)', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{fmtDate(tx.confirmedAt || tx.createdAt)}</span>
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{tx.type && TX_TYPE_KEY[tx.type] ? tr(lang, TX_TYPE_KEY[tx.type]) : humanizeSlug(tx.type)}</span>
                <span className="navrya-tabular" style={{ fontSize: 13, fontWeight: 600, color: 'var(--parchment)' }}>{fmtMicroUsd(tx.amountMicroUsd)}</span>
                <Chip style={{ color: st.color, borderColor: st.border, background: st.background }}>{tr(lang, st.key)}</Chip>
              </div>
            );
          })}
        </>
      )}
    </Panel>
  );
}

// Real Subscription tab (task B.4/B.5) - Billing History (above) already sources exclusively
// from GET /api/sync/wallet/transactions -> repo.paymentTransactions.listForUser(), never
// marketplace data. The legacy Marketplace "your subscriptions" mock-purchase panel that used to
// render here (window.TradeJournalAccountProfileStore.getSubscriptions(), tagged "mock") has been
// removed per explicit instruction - marketplace purchases remain their own separate domain and
// must not be presented as payment history on this real commercial screen.
function SubscriptionTab({ lang }) {
  const [subData, setSubData] = React.useState(null);
  const [catalog, setCatalog] = React.useState(null);
  const [notice, setNotice] = React.useState('');
  // Picking a plan opens the checkout sheet directly - there is no separate "confirm the request"
  // step any more (explicitly removed): the price the user is agreeing to is the invoice inside
  // that sheet, and the request only submits from its own final button.
  const [upgradeTarget, setUpgradeTarget] = React.useState(null);
  // Real BSC crypto invoice (task A) - set whenever a create-request response carries an
  // invoiceId (BILLING_PROVIDER=bsc_crypto is active); stays null under the Manual provider,
  // where the plain pending-admin-confirmation notice above is exactly correct as-is.
  const [invoiceId, setInvoiceId] = React.useState(null);
  // Holds the server's real minimumTopUpUsd while the below-minimum popup is open; null means
  // closed. Kept separate from `notice` since this is a dedicated, harder-to-miss modal, not the
  // inline Notice banner.
  const [belowMinimumUsd, setBelowMinimumUsd] = React.useState(null);

  const reloadSub = React.useCallback(() => {
    fetch('/api/sync/subscriptions').then((r) => r.json()).then(setSubData).catch(() => setSubData({ plan: 'free', subscription: null }));
  }, []);
  React.useEffect(reloadSub, [reloadSub]);
  React.useEffect(() => {
    fetch('/api/sync/subscriptions/catalog').then((r) => r.json()).then((d) => setCatalog(d.plans)).catch(() => setCatalog(null));
  }, []);

  // Returns the created request so the checkout sheet can slide its own invoice step in rather
  // than closing and reopening a second popup over the page.
  function requestUpgrade(planId) {
    return fetch('/api/sync/subscriptions/upgrade-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId }) })
      .then((r) => r.json().then((body) => { if (!r.ok) throw new Error(body.error); return body; }))
      .then((result) => {
        notifyWalletChanged();
        if (!result.invoiceId) setNotice(tr(lang, 'subUpgradeNotice', { plan: planLabel(lang, planId, catalog) }));
        return result;
      })
      .catch((error) => { throw new Error(tr(lang, 'subUpgradeError', { error: error.message })); });
  }
  function toggleCancel() {
    const sub = subData && subData.subscription;
    if (!sub) return;
    const url = '/api/sync/subscriptions/' + sub.id + '/' + (sub.cancelAtPeriodEnd ? 'reactivate' : 'cancel');
    fetch(url, { method: 'POST' }).then(reloadSub);
  }

  if (!subData) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {!!notice && <Notice tone="accent" icon="status">{notice}</Notice>}
      <PlanHero lang={lang} plan={subData.plan} subscription={subData.subscription} catalog={catalog} onToggleCancel={toggleCancel} />
      <PlanComparisonGrid lang={lang} plan={subData.plan} catalog={catalog} onUpgrade={setUpgradeTarget} />
      <WalletCard lang={lang} onNotice={setNotice} onBelowMinimum={setBelowMinimumUsd} />
      <WalletActivityCard lang={lang} />
      <StorageCard lang={lang} onNotice={setNotice} onInvoice={setInvoiceId} />
      <BillingHistoryCard lang={lang} />
      {upgradeTarget && (
        <PaymentSheet
          lang={lang}
          title={tr(lang, 'subUpgradeModalTitle', { plan: planLabel(lang, upgradeTarget, catalog) })}
          lineItem={tr(lang, 'subPayLineItemPlan', { plan: planLabel(lang, upgradeTarget, catalog) })}
          amountUsd={(catalog && catalog[upgradeTarget] && catalog[upgradeTarget].price && catalog[upgradeTarget].price.amountUsd) || 0}
          onProceed={() => requestUpgrade(upgradeTarget)}
          onConfirmed={() => { reloadSub(); notifyWalletChanged(); }}
          onClose={() => { setUpgradeTarget(null); reloadSub(); }}
        />
      )}
      {invoiceId && (
        <CryptoInvoiceModal
          lang={lang} tr={tr} invoiceId={invoiceId}
          onClose={() => setInvoiceId(null)}
          onConfirmed={() => { reloadSub(); notifyWalletChanged(); }}
        />
      )}
      {belowMinimumUsd != null && (
        <TopUpMinimumModal lang={lang} minimumTopUpUsd={belowMinimumUsd} onClose={() => setBelowMinimumUsd(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Top-level view
// ---------------------------------------------------------------------------------------------

function AccountProfileView({ initialTab, character }) {
  const lang = document.documentElement.lang || 'fa';
  const rtl = lang === 'fa' || lang === 'ar';
  const i18n = window.TradeJournalAccountProfileI18n;
  const [tab, setTab] = React.useState(['identity', 'level', 'ach', 'sub', 'role'].includes(initialTab) ? initialTab
    : { identity: 'identity', level: 'level', achievements: 'ach', subscriptions: 'sub', role: 'role' }[initialTab] || 'level');
  const [profile, setProfile] = React.useState(null);
  const [mastery, setMastery] = React.useState(null);
  const [xpEvents, setXpEvents] = React.useState([]);
  const [unlockedByKey, setUnlockedByKey] = React.useState({});
  const [nextGoal, setNextGoal] = React.useState(null);
  const [openAch, setOpenAch] = React.useState(null);
  const [, setTick] = React.useState(0);

  const load = React.useCallback(() => {
    const store = window.TradeJournalAccountProfileStore;
    if (!store) return;
    store.getProfile().then(setProfile).catch(() => {});
    store.getMastery().then(setMastery).catch(() => setMastery(null));
    store.getXpEvents().then(setXpEvents).catch(() => setXpEvents([]));
    store.getAchievements().then((rows) => {
      const map = {}; rows.forEach((a) => { map[a.achievementKey] = a; }); setUnlockedByKey(map);
    }).catch(() => {});
    store.nextGoal().then((goal) => {
      if (!goal) { setNextGoal(null); return; }
      if (goal.kind === 'achievement') {
        setNextGoal({ title: i18n.t('ach' + goal.labelKey + 'Title'), xpLabel: '+' + digits(lang, goal.points) + ' XP', progress: goal.progress });
      } else if (goal.kind === 'level') {
        setNextGoal({ title: tr(lang, 'statLevel'), xpLabel: tr(lang, 'xpToNext', { xp: digits(lang, goal.xpToGo) }), progress: goal.progress });
      } else {
        setNextGoal({ title: tr(lang, 'maxLevelLine'), xpLabel: '', progress: 100 });
      }
    }).catch(() => setNextGoal(null));
  }, [i18n, lang]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    const rerender = () => setTick((t) => t + 1);
    const queue = window.TradeJournalSyncQueue;
    const id = queue ? setInterval(rerender, 2000) : null; // pendingCount('xp-events') has no change event - poll lightly
    return () => { if (id) clearInterval(id); };
  }, []);

  if (!profile || !i18n) return null;

  const pendingXp = window.TradeJournalSyncQueue ? window.TradeJournalSyncQueue.pendingCount('xp-events') : 0;
  const rules = window.TradeJournalProfileXPRules;
  const level = rules.levelForXp(profile.xpTotal);
  const achTotal = (window.TradeJournalProfileAchievements && window.TradeJournalProfileAchievements.definitions.length) || 0;
  const achDone = Object.keys(unlockedByKey).length;

  const TABS = [
    { id: 'identity', label: tr(lang, 'tabIdentity'), icon: 'user-round' },
    { id: 'level', label: tr(lang, 'tabLevel'), icon: 'trending-up' },
    { id: 'ach', label: tr(lang, 'tabAch'), icon: 'trophy' },
    { id: 'sub', label: tr(lang, 'tabSub'), icon: 'crown' },
    { id: 'role', label: tr(lang, 'tabRole'), icon: 'user-cog' }
  ];

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap', paddingTop: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 660 }}>
          <span style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--char-accent)' }}>{tr(lang, 'dossierEyebrow')}</span>
          <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.25, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'dossierTitle')}</h1>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.9, color: 'var(--text-muted)' }}>{tr(lang, 'dossierSubtitle')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SummaryTile icon="trending-up" label={tr(lang, 'statLevel')} value={digits(lang, level)} />
          <SummaryTile icon="zap" label={tr(lang, 'statXp')} value={digits(lang, profile.xpTotal)} />
          <SummaryTile icon="trophy" label={tr(lang, 'statAch')} value={ratio(lang, achDone, achTotal)} />
          <Button variant="ghost" size="md" icon="logout" onClick={() => window.TradeJournalDevUserSwitcher.logout()}>{tr(lang, 'logoutBtn')}</Button>
        </div>
      </div>

      <DossierBand lang={lang} character={character} profile={profile} pendingXp={pendingXp} nextGoal={nextGoal} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 7, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'var(--surface-card)', boxShadow: 'var(--shadow-panel)', alignSelf: 'flex-start' }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} style={{
            boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 20px', borderRadius: 8, cursor: 'pointer',
            border: tab === t.id ? '2px solid var(--char-accent)' : '1px solid transparent', background: tab === t.id ? 'var(--char-active-surface)' : 'transparent',
            color: tab === t.id ? 'var(--char-accent)' : 'var(--text-muted)', font: 'inherit', fontSize: 14, fontWeight: tab === t.id ? 600 : 500,
            boxShadow: tab === t.id ? '0 0 16px var(--char-glow)' : 'none'
          }}>
            <Icon name={t.icon} size={18} />{t.label}
          </button>
        ))}
      </div>

      {tab === 'identity' && <IdentityTab lang={lang} i18n={i18n} character={character} profile={profile} onSaved={setProfile} />}
      {tab === 'level' && <LevelTab lang={lang} i18n={i18n} profile={profile} mastery={mastery} xpEvents={xpEvents} />}
      {tab === 'ach' && <AchievementsTab lang={lang} i18n={i18n} profile={profile} unlockedByKey={unlockedByKey} openId={openAch} setOpenId={setOpenAch} />}
      {tab === 'sub' && <SubscriptionTab lang={lang} />}
      {tab === 'role' && <RoleTab lang={lang} profile={profile} onSaved={setProfile} />}
    </div>
  );
}

function SummaryTile({ icon, label, value }) {
  return (
    <div style={{ boxSizing: 'border-box', width: 150, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-gold)', background: 'var(--surface-card)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-muted)', fontSize: 10.5, letterSpacing: '.08em' }}><Icon name={icon} size={14} />{label}</span>
      <span className="navrya-tabular" style={{ fontSize: 24, fontWeight: 700, color: 'var(--parchment)', lineHeight: 1 }}>{value}</span>
    </div>
  );
}

class ProfileBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <pre style={{ color: '#fbb', background: '#200', padding: 16, whiteSpace: 'pre-wrap' }}>{'[account profile] ' + (this.state.error.stack || this.state.error.message)}</pre>;
    return this.props.children;
  }
}

export function renderAccountProfile(initialTab) {
  const character = currentNavryaCharacter();
  const container = document.createElement('div');
  container.className = 'panel-page account-profile-page';
  container.dataset.character = character;
  createRoot(container).render(<ProfileBoundary><AccountProfileView initialTab={initialTab} character={character} /></ProfileBoundary>);
  return container;
}
