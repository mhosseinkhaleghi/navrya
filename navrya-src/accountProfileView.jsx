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

// React rewrite of the Account Profile destination (sidebar "اشتراک", #account/profile[/tab])
// per the design handoff: a persistent "dossier band" (rank/level/XP/next-reward) above a tab
// bar (Identity / Level & Progress / Achievements / Role - Subscription is intentionally left as
// a stub for now, per instruction, since no real billing system exists to back it).
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
    tabIdentity: 'هویت', tabLevel: 'سطح و پیشرفت', tabAch: 'دستاوردها', tabSub: 'اشتراک', tabRole: 'نقش',

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

    xpTypeAchievement: 'باز شدن دستاورد', xpTypeStreak: 'پاداش استمرار: {detail}'
  },
  en: {
    dossierEyebrow: 'NAVRYA · DOSSIER', dossierTitle: 'Dossier, progress & subscription',
    dossierSubtitle: 'Your identity, level, achievements and active pass in one dossier. Every XP comes from a real product action - never from a daily login.',
    statLevel: 'Level', statXp: 'Total XP', statAch: 'Badges',
    rankLabel: 'Current rank', levelWord: 'LEVEL', pathToLevel: 'Path to level {n}',
    xpOf: '{xp} of {max} XP', xpToNext: '{xp} XP to next level', maxLevelLine: 'Maximum level reached',
    pendingSync: '{n} XP pending sync', nextRewardLabel: 'Next reward',
    tabIdentity: 'Identity', tabLevel: 'Level & progress', tabAch: 'Achievements', tabSub: 'Subscription', tabRole: 'Role',

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

    xpTypeAchievement: 'Achievement unlocked', xpTypeStreak: 'Streak bonus: {detail}'
  },
  ar: {
    dossierEyebrow: 'NAVRYA · الملف', dossierTitle: 'الملف والتقدم والاشتراك',
    dossierSubtitle: 'هويتك ومستواك وإنجازاتك واشتراكك النشط في ملف واحد. كل نقطة تأتي من عمل حقيقي في المنتج - وليس من الدخول اليومي.',
    statLevel: 'المستوى', statXp: 'إجمالي النقاط', statAch: 'الأوسمة',
    rankLabel: 'الرتبة الحالية', levelWord: 'LEVEL', pathToLevel: 'المسار إلى المستوى {n}',
    xpOf: '{xp} من {max} نقطة', xpToNext: '{xp} نقطة للمستوى التالي', maxLevelLine: 'تم بلوغ أعلى مستوى',
    pendingSync: '{n} نقطة بانتظار المزامنة', nextRewardLabel: 'المكافأة التالية',
    tabIdentity: 'الهوية', tabLevel: 'المستوى والتقدم', tabAch: 'الإنجازات', tabSub: 'الاشتراك', tabRole: 'الدور',

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

    xpTypeAchievement: 'فتح إنجاز', xpTypeStreak: 'مكافأة الاستمرارية: {detail}'
  },
  es: {
    dossierEyebrow: 'NAVRYA · EXPEDIENTE', dossierTitle: 'Expediente, progreso y suscripción',
    dossierSubtitle: 'Tu identidad, nivel, logros y pase activo en un solo expediente. Cada XP viene de una acción real del producto, nunca de iniciar sesión a diario.',
    statLevel: 'Nivel', statXp: 'XP total', statAch: 'Insignias',
    rankLabel: 'Rango actual', levelWord: 'NIVEL', pathToLevel: 'Camino al nivel {n}',
    xpOf: '{xp} de {max} XP', xpToNext: '{xp} XP para el siguiente nivel', maxLevelLine: 'Nivel máximo alcanzado',
    pendingSync: '{n} XP pendiente de sincronización', nextRewardLabel: 'Próxima recompensa',
    tabIdentity: 'Identidad', tabLevel: 'Nivel y progreso', tabAch: 'Logros', tabSub: 'Suscripción', tabRole: 'Rol',

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

    xpTypeAchievement: 'Logro desbloqueado', xpTypeStreak: 'Bono de racha: {detail}'
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
function allSessions() {
  try {
    const raw = localStorage.getItem('tradejournal:sessions:v1:shared');
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s) => s && s.id) : [];
  } catch (_) { return []; }
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
// Subscription tab (stub - no real billing system exists yet, per instruction)
// ---------------------------------------------------------------------------------------------

function SubscriptionTab({ lang, i18n }) {
  const [subs, setSubs] = React.useState(null);
  React.useEffect(() => {
    const store = window.TradeJournalAccountProfileStore;
    if (store) store.getSubscriptions().then(setSubs).catch(() => setSubs([]));
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel variant="quiet" padding="26px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
          <span style={{ width: 46, height: 46, borderRadius: 10, display: 'grid', placeItems: 'center', color: 'var(--gold-warm)', border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.08)' }}><Icon name="crown" size={22} /></span>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'subComingTitle')}</span>
          <span style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.9, maxWidth: '52ch' }}>{tr(lang, 'subComingBody')}</span>
        </div>
      </Panel>
      {subs && subs.length > 0 && (
        <Panel variant="base" ornament padding="20px 22px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'subRealTitle')}</span>
            {subs.map((sub) => (
              <div key={sub.id || sub.purchasedAt} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <strong style={{ fontSize: 13, color: 'var(--parchment)' }}>{sub.listing.title}</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr(lang, 'purchasedOn', { date: i18n.date(sub.purchasedAt) })}</span>
                </div>
                <Chip tone="neutral">{tr(lang, 'mockBadge')}</Chip>
              </div>
            ))}
          </div>
        </Panel>
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
        <div style={{ display: 'flex', gap: 10 }}>
          <SummaryTile icon="trending-up" label={tr(lang, 'statLevel')} value={digits(lang, level)} />
          <SummaryTile icon="zap" label={tr(lang, 'statXp')} value={digits(lang, profile.xpTotal)} />
          <SummaryTile icon="trophy" label={tr(lang, 'statAch')} value={ratio(lang, achDone, achTotal)} />
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
      {tab === 'sub' && <SubscriptionTab lang={lang} i18n={i18n} />}
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
