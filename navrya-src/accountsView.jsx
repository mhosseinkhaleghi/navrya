import React from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Toggle } from '../public/pages/shared/navrya/components/forms/Toggle.jsx';
import { ViewToggle } from '../public/pages/shared/navrya/components/forms/ViewToggle.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';
import { openCalculator } from './tradeCalculatorModal.jsx';

// ============================================================================
// NAVRYA "Accounts" domain - the React screen for code-codex/prop and personal account's
// NavryaAccounts.dc.html handoff. Recreated against this repo's real NAVRYA components/tokens
// (Panel/Button/Chip/Select/TextField/Toggle/Modal/Notice), never the prototype's own inline
// markup. Every number on this screen comes from a real, persisted Account (accounts-store.js)
// and that account's own real trades (window.TradeJournalTradeStore, filtered by accountId) via
// the pure accounts-engine.js risk/compliance engine - nothing here is seeded/random/demo data.
//
// Deliberately NOT built, and why (see ACCOUNTS_HANDOFF.md section 9 for the design's own
// version of this list):
//  - No "Connect account" broker/prop-firm wizard. This app has no real broker/prop API
//    integration; a fake multi-step "detecting your rule sheet..." flow would be exactly the
//    fabricated-connection-status the product brief forbids. Only "Create account manually" is
//    offered - every account in this app is honestly MANUAL.
//  - No pass-likelihood probability gauge. There is no documented, evidence-backed predictive
//    model behind one; the Overview tab shows "insufficient data" there instead of a number,
//    exactly as the brief allows.
//  - No fabricated per-symbol pip/contract-value table. The Pre-trade check tab takes a real
//    dollar risk amount (typed directly, or handed off to the real Trade Calculator via "Open
///   calculator" with this account attached) rather than inventing XAUUSD=$100/point-style
//    constants this codebase has no real source for.
// ============================================================================

const copy = {
  en: {
    title: 'Accounts', subtitle: 'Every prop-firm seat and personal book in one ledger. Every account here is manual - Navrya has no live broker feed, so it enforces exactly the rules you enter.',
    createManual: 'Create account manually',
    filterAll: 'All', filterProp: 'Prop', filterPersonal: 'Personal', filterAttention: 'Attention', filterArchived: 'Archived',
    gridView: 'Grid view', listView: 'Ledger view',
    groupProp: 'Prop firm accounts', groupPersonal: 'Personal accounts',
    emptyTitle: 'No accounts yet', emptyBody: 'Create a prop-firm or personal account by hand and Navrya enforces the rules you enter - a pre-trade check, a rule sheet, and account-scoped performance, from day one.', emptyCta: 'Create account manually',
    noBrokerNote: 'Broker / prop-firm auto-sync is not available yet in this build - every account is added and kept up to date by hand.',
    sumEquity: 'Total equity', sumToday: 'Today', sumOpenRisk: 'Open risk', sumProp: 'Prop accounts', sumPersonal: 'Personal accounts', sumAtRisk: 'Rules at risk',
    attentionHeading: 'accounts need attention', attentionHeadingOne: 'account needs attention',
    unassigned: 'Unassigned', insufficientData: 'insufficient data', none: '—', na: '—',
    accEquity: 'Equity', accToday: 'Today', accTotal: 'Total P/L',
    healthAwaiting: 'AWAITING TRADES', healthOk: 'ON TRACK', healthWatch: 'NEEDS ATTENTION', healthDanger: 'AT RISK', healthArchived: 'ARCHIVED',
    ctaOpen: 'Open account', ctaEdit: 'Edit rules',
    dailyLossUsedLabel: 'Daily loss used', toPass: '{amount} to pass', leftToday: '{amount} left today', targetReached: 'Target reached',
    cardNoRuleNote: 'No rules configured on this account yet.', cardInsufficientNote: 'Cannot verify against this rule right now - see Rules & compliance.',
    ledgerAccount: 'Account', ledgerStatus: 'Status', ledgerEquity: 'Equity', ledgerToday: 'Today', ledgerTotal: 'Total P/L', ledgerTarget: 'Target', ledgerRisk: 'Risk used', ledgerHealth: 'Health',
    back: 'Back to accounts', pretradeBtn: 'Pre-trade check', editAccountBtn: 'Edit account', archivedChip: 'ARCHIVED', manualChip: 'MANUAL',
    tabOverview: 'Overview', tabRulesProp: 'Rules & compliance', tabRulesPersonal: 'Goals & limits', tabPretrade: 'Pre-trade check', tabPerformance: 'Performance', tabBehaviour: 'Behaviour',
    metricEquity: 'Equity', metricToday: 'Today', metricTotal: 'Total P/L', metricDrawdown: 'Current drawdown', metricAge: 'Account age', metricOpenRisk: 'Open risk',
    dayN: 'Day {n}', ageUnknown: 'insufficient data',
    whatTodayAllows: 'What today allows', leftOf: 'left of {allowance}', resetsIn: 'Allowance resets in',
    pathToPassing: 'The path to passing', noTargetGate: 'no target configured',
    probabilityTitle: 'Pass likelihood', probabilityNote: 'No documented predictive model backs a number here yet - shown as insufficient data rather than a guess.',
    archivedNote: 'This account is archived and read-only. History is kept, never deleted.',
    ruleGroupLossLimits: 'Loss limits', ruleGroupTargets: 'Targets and duration', ruleGroupPosition: 'Position constraints', ruleGroupSelfLimits: 'Limits you set yourself', ruleGroupGoals: 'Goals',
    stateSafe: 'SAFE', stateProgress: 'IN PROGRESS', stateWatch: 'WATCH', stateDanger: 'DANGER', stateViolated: 'VIOLATED', stateInsufficient: 'CANNOT VERIFY',
    noRulesConfigured: 'No rules configured on this account yet - edit the account to add them.',
    riskAmountLabel: 'Risk amount', riskAmountHint: 'The real dollar risk on the trade you are about to take.',
    rewardAmountLabel: 'Reward amount (optional)', rewardAmountHint: 'Fill this in to see the "if it wins" outcome too.',
    stopAttachedLabel: 'Stop attached', openCalcBtn: 'Open calculator with this account',
    runwayTitle: "Today's risk runway", runwayUsed: 'used', runwayTrade: 'this trade', runwayLeft: 'left',
    ifLose: 'If it loses', ifWin: 'If it wins', ruleCheck: 'Rule check', survivesLabel: 'trades like this before the daily limit',
    dailyPL: 'Daily profit and loss', dailyPLNote: 'one bar per account reset day, not per trade — a filled dot marks a day with real open exposure', tradingCalendar: 'Trading calendar', statistics: 'Statistics', performanceBy: 'Performance by', openExposure: 'Open exposure', openExposureNote: 'counted against today’s allowance while it floats',
    statWinRate: 'Win rate', statProfitFactor: 'Profit factor', statExpectancy: 'Expectancy', statAvgWin: 'Average win', statAvgLoss: 'Average loss', statMaxDD: 'Largest drawdown', statTrades: 'Trades', statRR: 'Average R:R',
    dimSession: 'Session', dimWeekday: 'Weekday', dimDirection: 'Direction', dimSetup: 'Setup', dimInstrument: 'Instrument',
    expSymbol: 'Symbol', expSide: 'Side', expEntry: 'Entry', expStop: 'Stop', expRisk: 'Risk', expSession: 'Session',
    disciplineScore: 'Discipline score', signalsTitle: 'Signals from your own trades on this account',
    disciplineInsufficientNote: 'Only {n} recorded emotion logs on this account — needs at least {min}.', disciplineFormulaNote: 'Built only from plan commitment, focus, stress, risk-rule violations, revenge timing and documented overrides — never from whether a trade made money.',
    checkInHistory: 'Check-in history', stressOf10: 'stress {n}/10',
    signalRevenge: 'Revenge trading', signalRevengeEvidence: '{n} re-entries within 10 minutes of a loss, of {total} closed trades on this account.', signalRevengeImpactWarn: 'Re-entering fast after a loss on this account raises the odds of a second loss.', signalRevengeImpactOk: 'No fast re-entries recorded on this account.',
    signalStress: 'Elevated stress', signalStressEvidence: '{n} of {total} recorded emotion logs on this account show stress ≥8/10.', signalStressImpactWarn: '{n} of those high-stress trades ended in a loss on this account.', signalStressImpactOk: 'No high-stress trades recorded on this account yet.',
    signalRiskViolation: 'Risk-rule violations', signalRiskViolationEvidence: '{n} of {total} trades on this account exceeded its own {rule}% max-risk-per-trade rule.', signalRiskViolationImpactWarn: 'Trades over the rule increase this account’s real drawdown exposure.', signalRiskViolationImpactOk: 'Every recorded trade on this account stayed inside its own risk rule.',
    signalWatch: 'WATCH', signalClear: 'CLEAR', documentedOverridesNote: '{n} trade(s) on this account carry a documented, explicitly confirmed risk override.',
    insufficientSignal: 'insufficient data - not enough recorded observations on this account yet',
    manCreateTitle: 'Create an account by hand', manEditTitle: 'Edit account rules',
    manSubProp: 'No API, no investor password - type the firm sheet and Navrya enforces it exactly as if it had imported it.',
    manSubPersonal: 'Your own book, your own limits. Navrya holds you to them the same way it holds a prop sheet.',
    manKindLabel: 'Account type', manKindProp: 'Prop firm account', manKindPropDesc: 'Firm rules: target, daily loss, drawdown, trading days, consistency.',
    manKindPersonal: 'Personal account', manKindPersonalDesc: 'Your own caps and goals - nothing can breach the account.',
    manIdentity: 'Identity', manFirm: 'Firm name', manFirmPersonal: 'Broker or label', manProgram: 'Programme', manProgramPersonal: 'Account label',
    manPlatform: 'Platform / broker', manNumber: 'Account number (optional)', manStart: 'Start date', manBalance: 'Starting balance', manCurrency: 'Currency',
    manRulesProp: "The firm's rule sheet", manRulesPersonal: 'Limits you set yourself',
    manTarget: 'Profit target', manDaily: 'Daily loss limit', manMaxDD: 'Maximum drawdown', manMinDays: 'Minimum trading days', manConsistency: 'Consistency cap',
    manDailyCap: 'Daily loss cap', manMaxRisk: 'Maximum risk per trade', manGoal: 'Monthly return goal', manMaxOpen: 'Maximum open positions',
    manDDType: 'Drawdown type', manDDStatic: 'Static', manDDStaticNote: 'floor fixed on day one', manDDTrailing: 'Trailing', manDDTrailingNote: 'floor follows your equity high',
    manOptional: 'optional', manResetConfig: 'Daily reset', manResetTimezone: 'Reset timezone', manResetHour: 'Reset hour (local)', manLossBasis: 'Daily loss basis',
    manBasisRealized: 'Realized only (what NAVRYA can always verify)', manBasisRealizedOpen: 'Realized + open positions (floating P/L)',
    manResetConfigNote: 'Sets exactly when "today" rolls over for this account\'s daily-loss rule. If your firm also counts floating P/L on open positions, choose that basis — NAVRYA will honestly show "cannot verify" instead of a false SAFE whenever a position is actually open, since it has no live price feed.',
    manNotice: 'A manual account has no live feed, so Navrya cannot stop a breach in real time. It uses these numbers for the pre-trade check and the rule sheet, and marks the account MANUAL everywhere so no figure is mistaken for a live one.',
    manPreviewTitle: 'How it will appear', manPreviewNote: 'This card updates as you type. Once created it behaves like any other account.',
    manCancel: 'Cancel', manSave: 'Create account', manSaveEdit: 'Save changes', manRemove: 'Remove account',
    manFirmRequired: 'Firm name is required.',
    verdictUnknownHead: 'Enter a position to see a verdict', verdictNoRuleHead: 'No risk rule configured',
    stopPresent: 'present', stopMissing: 'missing'
  },
  fa: {
    title: 'حساب‌ها', subtitle: 'همه‌ی حساب‌های فرم و شخصی در یک دفتر. همه‌ی حساب‌ها دستی‌اند - نوریا فید زنده‌ای از بروکر ندارد، پس دقیقاً همان قوانینی را اجرا می‌کند که خودت وارد می‌کنی.',
    createManual: 'ایجاد دستی حساب',
    filterAll: 'همه', filterProp: 'فرم', filterPersonal: 'شخصی', filterAttention: 'نیازمند توجه', filterArchived: 'بایگانی',
    gridView: 'نمای شبکه', listView: 'نمای دفتر',
    groupProp: 'حساب‌های فرم', groupPersonal: 'حساب‌های شخصی',
    emptyTitle: 'هنوز حسابی نیست', emptyBody: 'یک حساب فرم یا شخصی را دستی بساز؛ نوریا از همان ابتدا قوانینت را اجرا می‌کند - چک پیش از معامله، برگه‌ی قوانین و عملکرد مخصوص همان حساب.', emptyCta: 'ایجاد دستی حساب',
    noBrokerNote: 'همگام‌سازی خودکار با بروکر یا فرم فعلاً در دسترس نیست - هر حساب دستی اضافه و به‌روز می‌شود.',
    sumEquity: 'کل اکوییتی', sumToday: 'امروز', sumOpenRisk: 'ریسک باز', sumProp: 'حساب‌های فرم', sumPersonal: 'حساب‌های شخصی', sumAtRisk: 'قوانین در خطر',
    attentionHeading: 'حساب نیاز به توجه دارند', attentionHeadingOne: 'حساب نیاز به توجه دارد',
    unassigned: 'بدون حساب', insufficientData: 'داده‌ی کافی نیست', none: '—', na: '—',
    accEquity: 'اکوییتی', accToday: 'امروز', accTotal: 'سود/زیان کل',
    healthAwaiting: 'در انتظار معامله', healthOk: 'روی مسیر', healthWatch: 'نیازمند توجه', healthDanger: 'در خطر', healthArchived: 'بایگانی‌شده',
    ctaOpen: 'باز کردن حساب', ctaEdit: 'ویرایش قوانین',
    dailyLossUsedLabel: 'ضرر روزانه مصرف‌شده', toPass: '{amount} تا قبولی', leftToday: '{amount} باقی‌مانده امروز', targetReached: 'هدف محقق شد',
    cardNoRuleNote: 'هنوز قانونی روی این حساب تنظیم نشده.', cardInsufficientNote: 'الان نمی‌شه این قانون رو تأیید کرد - به تب قوانین و تطابق سر بزن.',
    ledgerAccount: 'حساب', ledgerStatus: 'وضعیت', ledgerEquity: 'اکوییتی', ledgerToday: 'امروز', ledgerTotal: 'سود/زیان کل', ledgerTarget: 'هدف', ledgerRisk: 'ریسک مصرف‌شده', ledgerHealth: 'سلامت',
    back: 'بازگشت به حساب‌ها', pretradeBtn: 'چک پیش از معامله', editAccountBtn: 'ویرایش حساب', archivedChip: 'بایگانی', manualChip: 'دستی',
    tabOverview: 'نمای کلی', tabRulesProp: 'قوانین و انطباق', tabRulesPersonal: 'اهداف و محدودیت‌ها', tabPretrade: 'چک پیش از معامله', tabPerformance: 'عملکرد', tabBehaviour: 'رفتار',
    metricEquity: 'اکوییتی', metricToday: 'امروز', metricTotal: 'سود/زیان کل', metricDrawdown: 'افت فعلی', metricAge: 'سن حساب', metricOpenRisk: 'ریسک باز',
    dayN: 'روز {n}', ageUnknown: 'داده‌ی کافی نیست',
    whatTodayAllows: 'امروز چقدر جا دارم', leftOf: 'از {allowance} باقی‌مانده', resetsIn: 'ریست سهمیه تا',
    pathToPassing: 'مسیر عبور', noTargetGate: 'هدفی تنظیم نشده',
    probabilityTitle: 'احتمال قبولی', probabilityNote: 'هنوز مدل پیش‌بینی مستند و مبتنی‌بر شواهدی پشت این عدد نیست - به‌جای حدس، «داده‌ی کافی نیست» نشان داده می‌شود.',
    archivedNote: 'این حساب بایگانی و فقط‌خواندنی است. تاریخچه نگه داشته می‌شود، هرگز حذف نمی‌شود.',
    ruleGroupLossLimits: 'محدودیت‌های ضرر', ruleGroupTargets: 'اهداف و مدت زمان', ruleGroupPosition: 'محدودیت‌های پوزیشن', ruleGroupSelfLimits: 'محدودیت‌های خودت', ruleGroupGoals: 'اهداف',
    stateSafe: 'ایمن', stateProgress: 'در حال پیشرفت', stateWatch: 'مراقب باش', stateDanger: 'خطر', stateViolated: 'نقض‌شده', stateInsufficient: 'قابل تأیید نیست',
    noRulesConfigured: 'هنوز قانونی روی این حساب تنظیم نشده - برای افزودن، حساب را ویرایش کن.',
    riskAmountLabel: 'مبلغ ریسک', riskAmountHint: 'ریسک واقعی به دلار برای معامله‌ای که می‌خواهی انجام دهی.',
    rewardAmountLabel: 'مبلغ سود هدف (اختیاری)', rewardAmountHint: 'برای دیدن نتیجه‌ی «در صورت برد» این را هم پر کن.',
    stopAttachedLabel: 'حد ضرر ثبت شده', openCalcBtn: 'باز کردن ماشین‌حساب با این حساب',
    runwayTitle: 'سهمیه‌ی ریسک امروز', runwayUsed: 'مصرف‌شده', runwayTrade: 'این معامله', runwayLeft: 'باقی‌مانده',
    ifLose: 'در صورت باخت', ifWin: 'در صورت برد', ruleCheck: 'بررسی قوانین', survivesLabel: 'معامله‌ی مشابه تا سقف روزانه',
    dailyPL: 'سود و زیان روزانه', dailyPLNote: 'یک ستون برای هر روز ریست حساب، نه هر معامله — نقطه‌ی آبی یعنی آن روز پوزیشن باز واقعی وجود دارد', tradingCalendar: 'تقویم معاملاتی', statistics: 'آمار', performanceBy: 'عملکرد بر اساس', openExposure: 'ریسک باز فعلی', openExposureNote: 'تا زمانی که شناور است روی سهمیه‌ی امروز حساب می‌شود',
    statWinRate: 'نرخ برد', statProfitFactor: 'ضریب سود', statExpectancy: 'انتظار ریاضی', statAvgWin: 'میانگین برد', statAvgLoss: 'میانگین باخت', statMaxDD: 'بیشترین افت', statTrades: 'معاملات', statRR: 'میانگین ریسک به ریوارد',
    dimSession: 'سشن', dimWeekday: 'روز هفته', dimDirection: 'جهت', dimSetup: 'استراتژی', dimInstrument: 'نماد',
    expSymbol: 'نماد', expSide: 'جهت', expEntry: 'ورود', expStop: 'حد ضرر', expRisk: 'ریسک', expSession: 'سشن',
    disciplineScore: 'امتیاز انضباط', signalsTitle: 'سیگنال‌های واقعی از معاملات این حساب',
    disciplineInsufficientNote: 'فقط {n} گزارش احساسی روی این حساب ثبت شده - حداقل {min} مورد لازم است.', disciplineFormulaNote: 'فقط از تعهد به پلن، تمرکز، استرس، نقض قوانین ریسک، سرعت واکنش پس از ضرر و بازنویسی‌های مستند ساخته شده - هرگز از سودآوری.',
    checkInHistory: 'تاریخچه‌ی چک‌این', stressOf10: 'استرس {n}/۱۰',
    signalRevenge: 'معامله‌ی انتقامی', signalRevengeEvidence: '{n} ورود مجدد در کمتر از ۱۰ دقیقه پس از ضرر، از {total} معامله‌ی بسته‌شده روی این حساب.', signalRevengeImpactWarn: 'ورود سریع پس از ضرر روی این حساب احتمال ضرر دوم را بالا می‌برد.', signalRevengeImpactOk: 'هیچ ورود سریعی روی این حساب ثبت نشده.',
    signalStress: 'استرس بالا', signalStressEvidence: '{n} از {total} گزارش احساسی ثبت‌شده روی این حساب استرس ≥۸/۱۰ نشان می‌دهند.', signalStressImpactWarn: '{n} مورد از آن معاملات پراسترس روی این حساب به ضرر ختم شده‌اند.', signalStressImpactOk: 'هنوز معامله‌ی پراسترسی روی این حساب ثبت نشده.',
    signalRiskViolation: 'نقض قانون ریسک', signalRiskViolationEvidence: '{n} از {total} معامله‌ی این حساب از قانون حداکثر ریسک {rule}٪ خودش فراتر رفته‌اند.', signalRiskViolationImpactWarn: 'معاملات فراتر از قانون، ریسک افت واقعی این حساب را بالا می‌برند.', signalRiskViolationImpactOk: 'همه‌ی معاملات ثبت‌شده‌ی این حساب داخل قانون ریسک خودش مانده‌اند.',
    signalWatch: 'مراقب باش', signalClear: 'پاک', documentedOverridesNote: '{n} معامله‌ی این حساب دارای یک بازنویسی ریسک مستند و تاییدشده است.',
    insufficientSignal: 'داده‌ی کافی نیست - هنوز مشاهدات ثبت‌شده‌ی کافی روی این حساب نیست',
    manCreateTitle: 'ایجاد دستی حساب', manEditTitle: 'ویرایش قوانین حساب',
    manSubProp: 'بدون API و رمز سرمایه‌گذار - برگه‌ی قوانین فرم را وارد کن، نوریا دقیقاً مثل حالت وارد‌شده اجرایش می‌کند.',
    manSubPersonal: 'دفتر خودت، محدودیت‌های خودت. نوریا دقیقاً مثل یک برگه‌ی قوانین فرم پایبندت نگه می‌دارد.',
    manKindLabel: 'نوع حساب', manKindProp: 'حساب فرم', manKindPropDesc: 'قوانین فرم: هدف، ضرر روزانه، افت، روزهای معاملاتی، ثبات.',
    manKindPersonal: 'حساب شخصی', manKindPersonalDesc: 'سقف‌ها و اهداف خودت - چیزی نمی‌تواند حساب را بشکند.',
    manIdentity: 'هویت', manFirm: 'نام فرم', manFirmPersonal: 'بروکر یا برچسب', manProgram: 'برنامه', manProgramPersonal: 'برچسب حساب',
    manPlatform: 'پلتفرم / بروکر', manNumber: 'شماره حساب (اختیاری)', manStart: 'تاریخ شروع', manBalance: 'موجودی اولیه', manCurrency: 'واحد پول',
    manRulesProp: 'برگه‌ی قوانین فرم', manRulesPersonal: 'محدودیت‌های خودت',
    manTarget: 'هدف سود', manDaily: 'سقف ضرر روزانه', manMaxDD: 'حداکثر افت', manMinDays: 'حداقل روزهای معاملاتی', manConsistency: 'سقف ثبات',
    manDailyCap: 'سقف ضرر روزانه', manMaxRisk: 'حداکثر ریسک هر معامله', manGoal: 'هدف بازدهی ماهانه', manMaxOpen: 'حداکثر پوزیشن باز',
    manDDType: 'نوع افت سرمایه', manDDStatic: 'ثابت', manDDStaticNote: 'کف در روز اول ثابت می‌شود', manDDTrailing: 'دنباله‌دار', manDDTrailingNote: 'کف با اوج اکوییتی حرکت می‌کند',
    manOptional: 'اختیاری', manResetConfig: 'ریست روزانه', manResetTimezone: 'منطقه‌ی زمانی ریست', manResetHour: 'ساعت ریست (محلی)', manLossBasis: 'مبنای ضرر روزانه',
    manBasisRealized: 'فقط تحقق‌یافته (چیزی که نوریا همیشه می‌تواند تایید کند)', manBasisRealizedOpen: 'تحقق‌یافته + پوزیشن‌های باز (سود/زیان شناور)',
    manResetConfigNote: 'دقیقاً مشخص می‌کند «امروز» برای قانون ضرر روزانه‌ی این حساب کِی ریست می‌شود. اگر فرم سود/زیان شناور پوزیشن‌های باز را هم حساب می‌کند، همین مبنا را انتخاب کن - نوریا به‌جای «ایمن» جعلی، صادقانه «قابل تأیید نیست» نشان می‌دهد چون فید قیمت زنده ندارد.',
    manNotice: 'حساب دستی فید زنده ندارد، پس نوریا نمی‌تواند نقض قانون را همان لحظه متوقف کند. این اعداد برای چک پیش از معامله و برگه‌ی قوانین استفاده می‌شوند و همه‌جا برچسب «دستی» می‌خورد.',
    manPreviewTitle: 'پیش‌نمایش', manPreviewNote: 'این کارت با هر تایپ به‌روز می‌شود. پس از ساخت، دقیقاً مثل هر حساب دیگری عمل می‌کند.',
    manCancel: 'انصراف', manSave: 'ایجاد حساب', manSaveEdit: 'ذخیره‌ی تغییرات', manRemove: 'حذف حساب',
    manFirmRequired: 'نام فرم الزامی است.',
    verdictUnknownHead: 'برای دیدن حکم، پوزیشن را وارد کن', verdictNoRuleHead: 'هیچ قانون ریسکی تنظیم نشده',
    stopPresent: 'ثبت شده', stopMissing: 'ثبت نشده'
  },
  ar: {
    title: 'الحسابات', subtitle: 'كل حسابات شركات التمويل والحسابات الشخصية في سجل واحد. كل حساب هنا يدوي - نافريا لا تملك اتصالاً مباشراً بالوسيط، فتُطبّق فقط القواعد التي تُدخلها.',
    createManual: 'إنشاء حساب يدويًا',
    filterAll: 'الكل', filterProp: 'تمويل', filterPersonal: 'شخصي', filterAttention: 'يحتاج انتباه', filterArchived: 'مؤرشف',
    gridView: 'عرض الشبكة', listView: 'عرض السجل',
    groupProp: 'حسابات شركات التمويل', groupPersonal: 'الحسابات الشخصية',
    emptyTitle: 'لا توجد حسابات بعد', emptyBody: 'أنشئ حساب تمويل أو حساباً شخصياً يدويًا وستُطبّق نافريا القواعد التي أدخلتها من اليوم الأول.', emptyCta: 'إنشاء حساب يدويًا',
    noBrokerNote: 'المزامنة التلقائية مع الوسيط أو شركة التمويل غير متاحة بعد - كل حساب يُضاف ويُحدَّث يدويًا.',
    sumEquity: 'إجمالي الحقوق', sumToday: 'اليوم', sumOpenRisk: 'المخاطرة المفتوحة', sumProp: 'حسابات التمويل', sumPersonal: 'الحسابات الشخصية', sumAtRisk: 'قواعد في خطر',
    attentionHeading: 'حسابات تحتاج انتباه', attentionHeadingOne: 'حساب يحتاج انتباه',
    unassigned: 'غير مرتبط', insufficientData: 'بيانات غير كافية', none: '—', na: '—',
    accEquity: 'الحقوق', accToday: 'اليوم', accTotal: 'إجمالي الربح/الخسارة',
    healthAwaiting: 'بانتظار الصفقات', healthOk: 'على المسار', healthWatch: 'يحتاج متابعة', healthDanger: 'في خطر', healthArchived: 'مؤرشف',
    ctaOpen: 'فتح الحساب', ctaEdit: 'تعديل القواعد',
    dailyLossUsedLabel: 'الخسارة اليومية المستخدمة', toPass: '{amount} للنجاح', leftToday: '{amount} متبقٍ اليوم', targetReached: 'تم تحقيق الهدف',
    cardNoRuleNote: 'لا توجد قواعد مُعدّة على هذا الحساب بعد.', cardInsufficientNote: 'لا يمكن التحقق من هذه القاعدة الآن - راجع تبويب القواعد والامتثال.',
    ledgerAccount: 'الحساب', ledgerStatus: 'الحالة', ledgerEquity: 'الحقوق', ledgerToday: 'اليوم', ledgerTotal: 'إجمالي الربح/الخسارة', ledgerTarget: 'الهدف', ledgerRisk: 'المخاطرة المستخدمة', ledgerHealth: 'السلامة',
    back: 'العودة للحسابات', pretradeBtn: 'فحص ما قبل الصفقة', editAccountBtn: 'تعديل الحساب', archivedChip: 'مؤرشف', manualChip: 'يدوي',
    tabOverview: 'نظرة عامة', tabRulesProp: 'القواعد والامتثال', tabRulesPersonal: 'الأهداف والحدود', tabPretrade: 'فحص ما قبل الصفقة', tabPerformance: 'الأداء', tabBehaviour: 'السلوك',
    metricEquity: 'الحقوق', metricToday: 'اليوم', metricTotal: 'إجمالي الربح/الخسارة', metricDrawdown: 'التراجع الحالي', metricAge: 'عمر الحساب', metricOpenRisk: 'المخاطرة المفتوحة',
    dayN: 'اليوم {n}', ageUnknown: 'بيانات غير كافية',
    whatTodayAllows: 'ما يسمح به اليوم', leftOf: 'متبقٍ من {allowance}', resetsIn: 'إعادة تعيين المسموح خلال',
    pathToPassing: 'مسار اجتياز التقييم', noTargetGate: 'لا يوجد هدف محدد',
    probabilityTitle: 'احتمال النجاح', probabilityNote: 'لا يوجد نموذج تنبؤي موثّق يدعم رقماً هنا بعد - يُعرض كبيانات غير كافية بدل تخمين.',
    archivedNote: 'هذا الحساب مؤرشف وللقراءة فقط. يُحفظ السجل ولا يُحذف أبداً.',
    ruleGroupLossLimits: 'حدود الخسارة', ruleGroupTargets: 'الأهداف والمدة', ruleGroupPosition: 'قيود المراكز', ruleGroupSelfLimits: 'حدودك الخاصة', ruleGroupGoals: 'الأهداف',
    stateSafe: 'آمن', stateProgress: 'قيد التقدّم', stateWatch: 'مراقبة', stateDanger: 'خطر', stateViolated: 'مخالفة', stateInsufficient: 'يتعذر التحقق',
    noRulesConfigured: 'لا توجد قواعد على هذا الحساب بعد - عدّل الحساب لإضافتها.',
    riskAmountLabel: 'مبلغ المخاطرة', riskAmountHint: 'المخاطرة الحقيقية بالدولار على الصفقة التي توشك أن تدخلها.',
    rewardAmountLabel: 'مبلغ العائد (اختياري)', rewardAmountHint: 'أدخله لرؤية نتيجة "في حال الربح" أيضاً.',
    stopAttachedLabel: 'وقف الخسارة مضبوط', openCalcBtn: 'فتح الحاسبة مع هذا الحساب',
    runwayTitle: 'مسار المخاطرة اليوم', runwayUsed: 'مستخدم', runwayTrade: 'هذه الصفقة', runwayLeft: 'متبقٍ',
    ifLose: 'في حال الخسارة', ifWin: 'في حال الربح', ruleCheck: 'فحص القواعد', survivesLabel: 'صفقة مماثلة قبل بلوغ الحد اليومي',
    dailyPL: 'الربح والخسارة اليومية', dailyPLNote: 'عمود واحد لكل يوم إعادة تعيين للحساب، وليس لكل صفقة — نقطة زرقاء تعني وجود تعرض مفتوح حقيقي ذلك اليوم', tradingCalendar: 'تقويم التداول', statistics: 'الإحصائيات', performanceBy: 'الأداء حسب', openExposure: 'التعرض المفتوح', openExposureNote: 'يُحتسب ضمن مسموح اليوم طالما هو عائم',
    statWinRate: 'معدل الفوز', statProfitFactor: 'عامل الربح', statExpectancy: 'التوقع', statAvgWin: 'متوسط الربح', statAvgLoss: 'متوسط الخسارة', statMaxDD: 'أكبر تراجع', statTrades: 'الصفقات', statRR: 'متوسط المخاطرة/العائد',
    dimSession: 'الجلسة', dimWeekday: 'يوم الأسبوع', dimDirection: 'الاتجاه', dimSetup: 'الإعداد', dimInstrument: 'الأداة',
    expSymbol: 'الرمز', expSide: 'الاتجاه', expEntry: 'الدخول', expStop: 'الوقف', expRisk: 'المخاطرة', expSession: 'الجلسة',
    disciplineScore: 'درجة الانضباط', signalsTitle: 'إشارات حقيقية من صفقات هذا الحساب',
    disciplineInsufficientNote: 'يوجد فقط {n} سجل عاطفي مسجّل على هذا الحساب - يلزم {min} على الأقل.', disciplineFormulaNote: 'يُبنى فقط من الالتزام بالخطة والتركيز والتوتر ومخالفات قواعد المخاطرة وتوقيت التداول الانتقامي والاستثناءات الموثّقة - أبداً من ربحية الصفقة.',
    checkInHistory: 'سجل تسجيل الوصول', stressOf10: 'توتر {n}/10',
    signalRevenge: 'التداول الانتقامي', signalRevengeEvidence: '{n} عمليات دخول متكررة خلال 10 دقائق من خسارة، من أصل {total} صفقة مغلقة على هذا الحساب.', signalRevengeImpactWarn: 'الدخول السريع بعد خسارة على هذا الحساب يرفع احتمال خسارة ثانية.', signalRevengeImpactOk: 'لا يوجد دخول سريع مسجّل على هذا الحساب.',
    signalStress: 'توتر مرتفع', signalStressEvidence: '{n} من أصل {total} سجل عاطفي مسجّل على هذا الحساب يُظهر توترًا ≥8/10.', signalStressImpactWarn: 'انتهت {n} من تلك الصفقات عالية التوتر بخسارة على هذا الحساب.', signalStressImpactOk: 'لا توجد صفقات عالية التوتر مسجّلة بعد على هذا الحساب.',
    signalRiskViolation: 'مخالفات قاعدة المخاطرة', signalRiskViolationEvidence: '{n} من أصل {total} صفقة على هذا الحساب تجاوزت قاعدته الخاصة لأقصى مخاطرة {rule}%.', signalRiskViolationImpactWarn: 'الصفقات التي تتجاوز القاعدة ترفع التعرض الحقيقي لتراجع هذا الحساب.', signalRiskViolationImpactOk: 'بقيت كل صفقة مسجّلة على هذا الحساب ضمن قاعدة مخاطرته الخاصة.',
    signalWatch: 'مراقبة', signalClear: 'واضح', documentedOverridesNote: '{n} صفقة على هذا الحساب تحمل استثناء مخاطرة موثّقًا ومؤكدًا صراحةً.',
    insufficientSignal: 'بيانات غير كافية - لا توجد ملاحظات مسجلة كافية على هذا الحساب بعد',
    manCreateTitle: 'إنشاء حساب يدويًا', manEditTitle: 'تعديل قواعد الحساب',
    manSubProp: 'بلا واجهة برمجية ولا كلمة مرور مستثمر - أدخل ورقة قواعد الشركة وستُطبّقها نافريا كما لو استوردتها.',
    manSubPersonal: 'دفترك الخاص، حدودك الخاصة. تُلزمك نافريا بها تماماً كما تلتزم بورقة قواعد شركة تمويل.',
    manKindLabel: 'نوع الحساب', manKindProp: 'حساب شركة تمويل', manKindPropDesc: 'قواعد الشركة: الهدف، الخسارة اليومية، التراجع، أيام التداول، الاتساق.',
    manKindPersonal: 'حساب شخصي', manKindPersonalDesc: 'حدودك وأهدافك الخاصة - لا شيء يمكن أن يخالف الحساب.',
    manIdentity: 'الهوية', manFirm: 'اسم الشركة', manFirmPersonal: 'الوسيط أو التسمية', manProgram: 'البرنامج', manProgramPersonal: 'تسمية الحساب',
    manPlatform: 'المنصة / الوسيط', manNumber: 'رقم الحساب (اختياري)', manStart: 'تاريخ البدء', manBalance: 'الرصيد الابتدائي', manCurrency: 'العملة',
    manRulesProp: 'ورقة قواعد الشركة', manRulesPersonal: 'الحدود التي تضعها بنفسك',
    manTarget: 'هدف الربح', manDaily: 'حد الخسارة اليومي', manMaxDD: 'أقصى تراجع', manMinDays: 'أدنى أيام تداول', manConsistency: 'سقف الاتساق',
    manDailyCap: 'سقف الخسارة اليومي', manMaxRisk: 'أقصى مخاطرة لكل صفقة', manGoal: 'هدف العائد الشهري', manMaxOpen: 'أقصى عدد مراكز مفتوحة',
    manDDType: 'نوع التراجع', manDDStatic: 'ثابت', manDDStaticNote: 'الحد الأدنى يثبت من اليوم الأول', manDDTrailing: 'متحرك', manDDTrailingNote: 'الحد الأدنى يتبع أعلى قيمة للحقوق',
    manOptional: 'اختياري', manResetConfig: 'إعادة التعيين اليومية', manResetTimezone: 'المنطقة الزمنية لإعادة التعيين', manResetHour: 'ساعة إعادة التعيين (محلية)', manLossBasis: 'أساس الخسارة اليومية',
    manBasisRealized: 'المحقق فقط (ما يمكن لنافريا التحقق منه دائمًا)', manBasisRealizedOpen: 'المحقق + المراكز المفتوحة (الربح/الخسارة العائمة)',
    manResetConfigNote: 'يحدد بالضبط متى تُعاد تعيين "اليوم" لقاعدة الخسارة اليومية لهذا الحساب. إذا كانت شركتك تحتسب أيضًا الربح/الخسارة العائمة على المراكز المفتوحة، اختر هذا الأساس - ستُظهر نافريا بصدق "يتعذر التحقق" بدلاً من "آمن" زائف كلما كان هناك مركز مفتوح فعليًا، لأنها لا تملك تغذية أسعار مباشرة.',
    manNotice: 'الحساب اليدوي بلا تغذية مباشرة، لذا لا يمكن لنافريا إيقاف مخالفة فورًا. تُستخدم هذه الأرقام لفحص ما قبل الصفقة وورقة القواعد، ويُوسَم الحساب بـ"يدوي" في كل مكان.',
    manPreviewTitle: 'كيف سيظهر', manPreviewNote: 'تتحدّث هذه البطاقة أثناء الكتابة. بعد الإنشاء يعمل كأي حساب آخر تمامًا.',
    manCancel: 'إلغاء', manSave: 'إنشاء الحساب', manSaveEdit: 'حفظ التغييرات', manRemove: 'إزالة الحساب',
    manFirmRequired: 'اسم الشركة مطلوب.',
    verdictUnknownHead: 'أدخل مركزاً لرؤية الحكم', verdictNoRuleHead: 'لا توجد قاعدة مخاطرة مُعدّة',
    stopPresent: 'مضبوط', stopMissing: 'غير مضبوط'
  },
  es: {
    title: 'Cuentas', subtitle: 'Cada cuenta de firma prop y cuenta personal en un solo libro. Toda cuenta aquí es manual - Navrya no tiene una conexión en vivo con el bróker, así que aplica exactamente las reglas que introduces.',
    createManual: 'Crear cuenta manualmente',
    filterAll: 'Todas', filterProp: 'Prop', filterPersonal: 'Personal', filterAttention: 'Atención', filterArchived: 'Archivadas',
    gridView: 'Vista de cuadrícula', listView: 'Vista de libro',
    groupProp: 'Cuentas de firma prop', groupPersonal: 'Cuentas personales',
    emptyTitle: 'Aún no hay cuentas', emptyBody: 'Crea una cuenta prop o personal a mano y Navrya aplicará las reglas que introduzcas desde el primer día.', emptyCta: 'Crear cuenta manualmente',
    noBrokerNote: 'La sincronización automática con bróker/firma prop no está disponible aún - cada cuenta se añade y actualiza a mano.',
    sumEquity: 'Patrimonio total', sumToday: 'Hoy', sumOpenRisk: 'Riesgo abierto', sumProp: 'Cuentas prop', sumPersonal: 'Cuentas personales', sumAtRisk: 'Reglas en riesgo',
    attentionHeading: 'cuentas necesitan atención', attentionHeadingOne: 'cuenta necesita atención',
    unassigned: 'Sin asignar', insufficientData: 'datos insuficientes', none: '—', na: '—',
    accEquity: 'Patrimonio', accToday: 'Hoy', accTotal: 'P/L total',
    healthAwaiting: 'ESPERANDO OPERACIONES', healthOk: 'EN CAMINO', healthWatch: 'REQUIERE ATENCIÓN', healthDanger: 'EN RIESGO', healthArchived: 'ARCHIVADA',
    ctaOpen: 'Abrir cuenta', ctaEdit: 'Editar reglas',
    dailyLossUsedLabel: 'Pérdida diaria usada', toPass: '{amount} para aprobar', leftToday: '{amount} restante hoy', targetReached: 'Meta alcanzada',
    cardNoRuleNote: 'Aún no hay reglas configuradas en esta cuenta.', cardInsufficientNote: 'No se puede verificar esta regla ahora - revisa Reglas y cumplimiento.',
    ledgerAccount: 'Cuenta', ledgerStatus: 'Estado', ledgerEquity: 'Patrimonio', ledgerToday: 'Hoy', ledgerTotal: 'P/L total', ledgerTarget: 'Objetivo', ledgerRisk: 'Riesgo usado', ledgerHealth: 'Salud',
    back: 'Volver a cuentas', pretradeBtn: 'Verificación previa', editAccountBtn: 'Editar cuenta', archivedChip: 'ARCHIVADA', manualChip: 'MANUAL',
    tabOverview: 'Resumen', tabRulesProp: 'Reglas y cumplimiento', tabRulesPersonal: 'Metas y límites', tabPretrade: 'Verificación previa', tabPerformance: 'Rendimiento', tabBehaviour: 'Comportamiento',
    metricEquity: 'Patrimonio', metricToday: 'Hoy', metricTotal: 'P/L total', metricDrawdown: 'Drawdown actual', metricAge: 'Antigüedad', metricOpenRisk: 'Riesgo abierto',
    dayN: 'Día {n}', ageUnknown: 'datos insuficientes',
    whatTodayAllows: 'Lo que permite hoy', leftOf: 'restante de {allowance}', resetsIn: 'El límite se reinicia en',
    pathToPassing: 'El camino para aprobar', noTargetGate: 'sin objetivo configurado',
    probabilityTitle: 'Probabilidad de aprobar', probabilityNote: 'Aún no hay un modelo predictivo documentado detrás de un número aquí - se muestra como datos insuficientes en vez de una suposición.',
    archivedNote: 'Esta cuenta está archivada y es de solo lectura. El historial se conserva, nunca se elimina.',
    ruleGroupLossLimits: 'Límites de pérdida', ruleGroupTargets: 'Objetivos y duración', ruleGroupPosition: 'Restricciones de posición', ruleGroupSelfLimits: 'Tus propios límites', ruleGroupGoals: 'Metas',
    stateSafe: 'SEGURO', stateProgress: 'EN PROGRESO', stateWatch: 'VIGILAR', stateDanger: 'PELIGRO', stateViolated: 'INCUMPLIDA', stateInsufficient: 'NO VERIFICABLE',
    noRulesConfigured: 'Aún no hay reglas configuradas en esta cuenta - edita la cuenta para añadirlas.',
    riskAmountLabel: 'Monto de riesgo', riskAmountHint: 'El riesgo real en dólares de la operación que estás por tomar.',
    rewardAmountLabel: 'Monto de recompensa (opcional)', rewardAmountHint: 'Complétalo para ver también el resultado "si gana".',
    stopAttachedLabel: 'Stop colocado', openCalcBtn: 'Abrir calculadora con esta cuenta',
    runwayTitle: 'Margen de riesgo de hoy', runwayUsed: 'usado', runwayTrade: 'esta operación', runwayLeft: 'restante',
    ifLose: 'Si pierde', ifWin: 'Si gana', ruleCheck: 'Verificación de reglas', survivesLabel: 'operaciones así antes del límite diario',
    dailyPL: 'Ganancia y pérdida diaria', dailyPLNote: 'una barra por día de reinicio de la cuenta, no por operación — un punto azul marca un día con exposición abierta real', tradingCalendar: 'Calendario de trading', statistics: 'Estadísticas', performanceBy: 'Rendimiento por', openExposure: 'Exposición abierta', openExposureNote: 'cuenta contra el límite de hoy mientras esté flotando',
    statWinRate: 'Tasa de acierto', statProfitFactor: 'Factor de beneficio', statExpectancy: 'Expectativa', statAvgWin: 'Ganancia media', statAvgLoss: 'Pérdida media', statMaxDD: 'Mayor drawdown', statTrades: 'Operaciones', statRR: 'R:R medio',
    dimSession: 'Sesión', dimWeekday: 'Día de la semana', dimDirection: 'Dirección', dimSetup: 'Configuración', dimInstrument: 'Instrumento',
    expSymbol: 'Símbolo', expSide: 'Lado', expEntry: 'Entrada', expStop: 'Stop', expRisk: 'Riesgo', expSession: 'Sesión',
    disciplineScore: 'Puntaje de disciplina', signalsTitle: 'Señales reales de las operaciones de esta cuenta',
    disciplineInsufficientNote: 'Solo hay {n} registros emocionales en esta cuenta — se necesitan al menos {min}.', disciplineFormulaNote: 'Se calcula solo con compromiso con el plan, enfoque, estrés, infracciones de la regla de riesgo, operaciones de revancha y excepciones documentadas — nunca con la rentabilidad.',
    checkInHistory: 'Historial de check-in', stressOf10: 'estrés {n}/10',
    signalRevenge: 'Operativa de revancha', signalRevengeEvidence: '{n} reingresos en los 10 minutos posteriores a una pérdida, de {total} operaciones cerradas en esta cuenta.', signalRevengeImpactWarn: 'Reingresar rápido tras una pérdida en esta cuenta aumenta la probabilidad de una segunda pérdida.', signalRevengeImpactOk: 'No se registraron reingresos rápidos en esta cuenta.',
    signalStress: 'Estrés elevado', signalStressEvidence: '{n} de {total} registros emocionales de esta cuenta muestran estrés ≥8/10.', signalStressImpactWarn: '{n} de esas operaciones de alto estrés terminaron en pérdida en esta cuenta.', signalStressImpactOk: 'Aún no hay operaciones de alto estrés registradas en esta cuenta.',
    signalRiskViolation: 'Infracciones de la regla de riesgo', signalRiskViolationEvidence: '{n} de {total} operaciones de esta cuenta superaron su propia regla de riesgo máximo del {rule}%.', signalRiskViolationImpactWarn: 'Las operaciones que superan la regla aumentan la exposición real al drawdown de esta cuenta.', signalRiskViolationImpactOk: 'Todas las operaciones registradas en esta cuenta se mantuvieron dentro de su propia regla de riesgo.',
    signalWatch: 'VIGILAR', signalClear: 'DESPEJADO', documentedOverridesNote: '{n} operación(es) en esta cuenta llevan una excepción de riesgo documentada y confirmada explícitamente.',
    insufficientSignal: 'datos insuficientes - aún no hay suficientes observaciones registradas en esta cuenta',
    manCreateTitle: 'Crear una cuenta a mano', manEditTitle: 'Editar reglas de la cuenta',
    manSubProp: 'Sin API, sin contraseña de inversor - escribe la hoja de reglas de la firma y Navrya la aplicará como si la hubiera importado.',
    manSubPersonal: 'Tu propio libro, tus propios límites. Navrya te los exige igual que a una hoja de reglas prop.',
    manKindLabel: 'Tipo de cuenta', manKindProp: 'Cuenta de firma prop', manKindPropDesc: 'Reglas de la firma: objetivo, pérdida diaria, drawdown, días de trading, consistencia.',
    manKindPersonal: 'Cuenta personal', manKindPersonalDesc: 'Tus propios topes y metas - nada puede incumplir la cuenta.',
    manIdentity: 'Identidad', manFirm: 'Nombre de la firma', manFirmPersonal: 'Bróker o etiqueta', manProgram: 'Programa', manProgramPersonal: 'Etiqueta de la cuenta',
    manPlatform: 'Plataforma / bróker', manNumber: 'Número de cuenta (opcional)', manStart: 'Fecha de inicio', manBalance: 'Balance inicial', manCurrency: 'Moneda',
    manRulesProp: 'La hoja de reglas de la firma', manRulesPersonal: 'Límites que tú mismo defines',
    manTarget: 'Objetivo de beneficio', manDaily: 'Límite de pérdida diaria', manMaxDD: 'Drawdown máximo', manMinDays: 'Días mínimos de trading', manConsistency: 'Tope de consistencia',
    manDailyCap: 'Tope de pérdida diaria', manMaxRisk: 'Riesgo máximo por operación', manGoal: 'Meta de retorno mensual', manMaxOpen: 'Máximo de posiciones abiertas',
    manDDType: 'Tipo de drawdown', manDDStatic: 'Estático', manDDStaticNote: 'el suelo se fija el primer día', manDDTrailing: 'Trailing', manDDTrailingNote: 'el suelo sigue tu máximo de patrimonio',
    manOptional: 'opcional', manResetConfig: 'Reinicio diario', manResetTimezone: 'Zona horaria de reinicio', manResetHour: 'Hora de reinicio (local)', manLossBasis: 'Base de la pérdida diaria',
    manBasisRealized: 'Solo realizado (lo que Navrya siempre puede verificar)', manBasisRealizedOpen: 'Realizado + posiciones abiertas (P/L flotante)',
    manResetConfigNote: 'Define exactamente cuándo se reinicia "hoy" para la regla de pérdida diaria de esta cuenta. Si tu firma también cuenta el P/L flotante de posiciones abiertas, elige esa base — Navrya mostrará honestamente "no verificable" en lugar de un SEGURO falso mientras haya una posición abierta, ya que no tiene fuente de precios en vivo.',
    manNotice: 'Una cuenta manual no tiene feed en vivo, así que Navrya no puede detener un incumplimiento en tiempo real. Usa estos números para la verificación previa y la hoja de reglas, y marca la cuenta como MANUAL en todas partes.',
    manPreviewTitle: 'Cómo se verá', manPreviewNote: 'Esta tarjeta se actualiza mientras escribes. Una vez creada, se comporta como cualquier otra cuenta.',
    manCancel: 'Cancelar', manSave: 'Crear cuenta', manSaveEdit: 'Guardar cambios', manRemove: 'Eliminar cuenta',
    manFirmRequired: 'El nombre de la firma es obligatorio.',
    verdictUnknownHead: 'Introduce una posición para ver un veredicto', verdictNoRuleHead: 'No hay ninguna regla de riesgo configurada',
    stopPresent: 'colocado', stopMissing: 'faltante'
  }
};

function tr(lang, key, vars) {
  let value = (copy[lang] && copy[lang][key]) || copy.en[key] || key;
  if (vars) Object.keys(vars).forEach((name) => { value = value.replace('{' + name + '}', String(vars[name])); });
  return value;
}
function localeCode(lang) { return { fa: 'fa-IR', ar: 'ar-EG', en: 'en-GB', es: 'es-ES' }[lang] || 'en-GB'; }
function digits(lang, value) {
  const s = String(value);
  if (lang !== 'fa') return s;
  return s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}
function money(lang, currency, n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  return (v < 0 ? '−' : '') + digits(lang, Math.abs(v).toLocaleString(localeCode(lang), { minimumFractionDigits: 0, maximumFractionDigits: 0 })) + ' ' + (currency || 'USD');
}
function pctText(lang, n, decimals) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return digits(lang, Number(n).toFixed(decimals === undefined ? 1 : decimals)) + '%';
}

const RULE_GROUP_KEY = {
  'Loss limits': 'ruleGroupLossLimits', 'Targets and duration': 'ruleGroupTargets', 'Position constraints': 'ruleGroupPosition',
  'Limits you set yourself': 'ruleGroupSelfLimits', 'Goals': 'ruleGroupGoals'
};
const STATE_META = {
  safe: { key: 'stateSafe', icon: 'check', color: 'var(--success)', frame: 'var(--border-hairline)' },
  progress: { key: 'stateProgress', icon: 'progress', color: 'var(--char-accent)', frame: 'var(--border-hairline)' },
  watch: { key: 'stateWatch', icon: 'honour', color: 'var(--warning)', frame: 'rgba(255,176,32,.42)' },
  danger: { key: 'stateDanger', icon: 'honour', color: 'var(--danger)', frame: 'rgba(255,56,48,.42)' },
  violated: { key: 'stateViolated', icon: 'close', color: 'var(--danger)', frame: 'rgba(255,56,48,.42)' },
  // "Cannot verify" (defect #4) - distinct from 'safe': NAVRYA is explicitly refusing to claim
  // compliance, not reporting a clean bill of health. Info-blue, never green/red, so it can
  // never be mistaken for either a real pass or a real breach.
  insufficient: { key: 'stateInsufficient', icon: 'status', color: 'var(--info)', frame: 'rgba(77,163,255,.4)' }
};
function worstState(groups) {
  const order = ['violated', 'danger', 'insufficient', 'watch', 'progress', 'safe'];
  let worst = null;
  (groups || []).forEach((g) => g.items.forEach((i) => {
    if (worst === null || order.indexOf(i.state) < order.indexOf(worst)) worst = i.state;
  }));
  return worst;
}

function accountAgeDays(account) {
  if (!account.startDate) return null;
  const start = new Date(account.startDate).getTime();
  if (!Number.isFinite(start)) return null;
  return Math.max(0, Math.round((Date.now() - start) / 86400000));
}

function useAllTrades() {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    function onChange() { setTick((t) => t + 1); }
    window.addEventListener('tradejournal:replica-trades-changed', onChange);
    return () => window.removeEventListener('tradejournal:replica-trades-changed', onChange);
  }, []);
  const store = window.TradeJournalTradeStore;
  return React.useMemo(() => (store ? store.listSync() : []), [tick, store]); // eslint-disable-line react-hooks/exhaustive-deps
}
export function useAccounts() {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    function onChange() { setTick((t) => t + 1); }
    window.addEventListener('tradejournal:replica-accounts-changed', onChange);
    return () => window.removeEventListener('tradejournal:replica-accounts-changed', onChange);
  }, []);
  const store = window.TradeJournalAccountsStore;
  return React.useMemo(() => (store ? store.listSync() : []), [tick, store]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ---- Account card - the single component used both in the Portfolio grid AND the manual
// create/edit modal's live preview, per ACCOUNTS_HANDOFF.md section 5b's "same component, not a
// separate mock" rule. ----
function AccountCard({ lang, account, metrics, ruleResult, onOpen }) {
  const worst = worstState(ruleResult.groups);
  const meta = worst ? STATE_META[worst] : null;
  const archived = account.status === 'archived';
  const health = !metrics.hasAnyTrades ? { key: 'healthAwaiting', color: 'var(--info)', icon: 'edit' }
    : archived ? { key: 'healthArchived', color: 'var(--text-muted)', icon: 'archive' }
    : worst === 'violated' || worst === 'danger' ? { key: 'healthDanger', color: 'var(--danger)', icon: 'honour' }
    : worst === 'watch' ? { key: 'healthWatch', color: 'var(--warning)', icon: 'honour' }
    : { key: 'healthOk', color: 'var(--success)', icon: 'shield' };
  const mark = String(account.firm || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'NA';

  // Bar 1: real progress toward the account's own configured target/goal - never a fabricated
  // percentage. Bar 2: real daily-loss allowance used, honestly marked when NAVRYA cannot verify
  // it (defect #4's dailyLossBasisInsufficient). Phrasing ("X% · $Y to pass" / "X% · $Y left
  // today") matches the design handoff's card language, computed only from real metrics.
  const targetPct = account.kind === 'prop' ? metrics.profitProgressPercent : null;
  const targetAmount = account.kind === 'prop' && account.rules.profitTargetPercent !== null ? metrics.profitTargetAmount : null;
  const goalAmount = account.kind === 'personal' && account.rules.monthlyGoalPercent !== null ? metrics.monthStartEquity * (account.rules.monthlyGoalPercent / 100) : null;
  const primaryBar = account.kind === 'prop'
    ? (targetAmount ? (function () {
        const pct = Math.max(0, Math.min(100, targetPct || 0));
        const remaining = targetAmount - (metrics.profitAmount || 0);
        return { label: tr(lang, 'manTarget'), pct, right: pctText(lang, pct, 0) + ' · ' + (remaining > 0 ? tr(lang, 'toPass', { amount: money(lang, account.currency, remaining) }) : tr(lang, 'targetReached')) };
      }()) : null)
    : (goalAmount ? (function () {
        const booked = metrics.monthPL || 0;
        const pct = goalAmount > 0 ? Math.max(0, Math.min(100, (booked / goalAmount) * 100)) : 0;
        const remaining = goalAmount - booked;
        return { label: tr(lang, 'manGoal'), pct, right: pctText(lang, pct, 0) + ' · ' + (remaining > 0 ? tr(lang, 'toPass', { amount: money(lang, account.currency, remaining) }) : tr(lang, 'targetReached')) };
      }()) : null);
  const dailyRuleConfigured = (account.kind === 'prop' ? account.rules.dailyLossLimitPercent : account.rules.dailyLossCap) !== null;
  const riskBar = dailyRuleConfigured
    ? (metrics.dailyLossBasisInsufficient
      ? { label: tr(lang, 'dailyLossUsedLabel'), pct: null, right: tr(lang, 'insufficientData'), insufficient: true }
      : (function () {
        const allowance = account.kind === 'prop' ? metrics.dayStartEquity * (account.rules.dailyLossLimitPercent / 100) : account.rules.dailyLossCap;
        const pct = allowance > 0 ? Math.max(0, Math.min(100, (metrics.dailyLossUsed / allowance) * 100)) : 0;
        const remaining = Math.max(0, allowance - metrics.dailyLossUsed);
        return { label: tr(lang, 'dailyLossUsedLabel'), pct, right: pctText(lang, pct, 0) + ' · ' + tr(lang, 'leftToday', { amount: money(lang, account.currency, remaining) }) };
      }()))
    : null;
  const bars = [primaryBar, riskBar].filter(Boolean);

  // Footer note: the real note attached to this account's own worst-state rule row (evidence,
  // not a generic sentence) - falls back to an honest "no rules configured"/"cannot verify"
  // message rather than inventing a status the underlying data doesn't support.
  let footerNote = null;
  if (worst) {
    ruleResult.groups.some((g) => {
      const row = g.items.find((i) => i.state === worst && i.note);
      if (row) { footerNote = row.note; return true; }
      return false;
    });
    if (!footerNote && worst === 'insufficient') footerNote = tr(lang, 'cardInsufficientNote');
  } else if (!ruleResult.hasAnyRuleConfigured) {
    footerNote = tr(lang, 'cardNoRuleNote');
  }

  return (
    <Panel variant={archived ? 'quiet' : meta && (worst === 'danger' || worst === 'violated') ? 'raised' : 'base'} ornament texture textureOpacity={0.04} padding={0}
      style={{ borderColor: meta && !archived ? meta.frame : undefined, background: archived ? 'rgba(28,10,10,.35)' : undefined }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 16px 12px' }}>
        <span style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.6)', font: 'var(--type-display-md)', letterSpacing: '.06em', color: 'var(--char-accent)' }}>{mark}</span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ font: 'var(--type-username)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.firm || tr(lang, 'unassigned')}</span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{account.program || tr(lang, account.kind === 'personal' ? 'manKindPersonal' : 'manKindProp')}</span>
        </div>
        {/* Real worst-rule-state chip, colored/labeled from STATE_META (never a fabricated
            "CHALLENGE"/"FUNDED" broker-phase badge - this app has no live broker feed to know
            that). Archived and no-rules-configured both stay their own honest neutral chips. */}
        <Chip tone={archived ? 'neutral' : meta ? undefined : 'accent'} dot
          style={meta && !archived ? { borderColor: meta.frame, background: 'color-mix(in srgb, ' + meta.color + ' 12%, transparent)', color: meta.color } : undefined}>
          {archived ? tr(lang, 'archivedChip') : meta ? tr(lang, meta.key) : tr(lang, 'manualChip')}
        </Chip>
      </header>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px 12px', font: 'var(--type-caption)', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
        <span>{account.platform || '—'}</span><span aria-hidden="true">·</span><span className="navrya-tabular">{account.numberMasked || '—'}</span><span aria-hidden="true">·</span><span>{account.currency}</span>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)' }}>
        {[
          { label: tr(lang, 'accEquity'), value: money(lang, account.currency, metrics.equity) },
          { label: tr(lang, 'accToday'), value: metrics.hasTradesToday ? money(lang, account.currency, metrics.todayPL) : tr(lang, 'none'), color: metrics.hasTradesToday ? (metrics.todayPL >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--text-dim)' },
          { label: tr(lang, 'accTotal'), value: metrics.hasClosedTrades ? money(lang, account.currency, metrics.totalPL) : tr(lang, 'none'), color: metrics.hasClosedTrades ? (metrics.totalPL >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--text-dim)' }
        ].map((m, i) => (
          <div key={m.label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 14px', borderLeft: i ? '1px solid var(--divider-gold)' : 'none' }}>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{m.label}</span>
            <span className="navrya-tabular" style={{ font: 'var(--type-metric-value)', fontSize: 17, color: m.color || 'var(--text-primary)' }}>{m.value}</span>
          </div>
        ))}
      </div>
      {bars.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px' }}>
          {bars.map((b) => (
            <div key={b.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{b.label}</span>
                <span style={{ flex: 1 }} />
                <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: b.insufficient ? 'var(--info)' : 'var(--text-primary)' }}>{b.right}</span>
              </div>
              <div style={{ position: 'relative', height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(244,234,215,.06)', border: '1px solid ' + (archived ? 'var(--border-hairline)' : 'transparent'), borderStyle: archived ? 'dashed' : 'solid' }}>
                {b.pct !== null && <span style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, borderRadius: 4, width: b.pct + '%', background: 'var(--char-accent)' }} />}
              </div>
            </div>
          ))}
        </div>
      )}
      <footer style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: health.color }}>
            <Icon name={health.icon} size={14} />{tr(lang, health.key)}
          </span>
          {footerNote && <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{footerNote}</span>}
        </div>
        {onOpen && <Button size="sm" variant="secondary" iconAfter="chevron-right" onClick={onOpen}>{tr(lang, account.status === 'active' && !metrics.hasAnyTrades ? 'ctaEdit' : 'ctaOpen')}</Button>}
      </footer>
    </Panel>
  );
}

// ---- Portfolio ----
function PortfolioView({ lang, accounts, allTrades, onOpenAccount, onCreateManual, onOpenPreTrade }) {
  const engine = window.TradeJournalAccountsEngine;
  const [filter, setFilter] = React.useState('all');
  const [mode, setMode] = React.useState('grid');
  const computed = accounts.map((a) => {
    const metrics = engine.computeMetrics(a, allTrades);
    const ruleResult = engine.evaluateRules(a, metrics);
    const worst = worstState(ruleResult.groups);
    return { account: a, metrics, ruleResult, attention: a.status === 'active' && (worst === 'danger' || worst === 'violated') };
  });
  const active = computed.filter((c) => c.account.status !== 'archived');
  const archived = computed.filter((c) => c.account.status === 'archived');
  const attention = active.filter((c) => c.attention);

  const filtered = filter === 'prop' ? active.filter((c) => c.account.kind === 'prop')
    : filter === 'personal' ? active.filter((c) => c.account.kind === 'personal')
    : filter === 'attention' ? attention
    : filter === 'archived' ? archived
    : active;

  const totalEquity = active.reduce((sum, c) => sum + c.metrics.equity, 0);
  const anyTodayKnown = active.some((c) => c.metrics.hasTradesToday);
  const totalToday = active.reduce((sum, c) => sum + (c.metrics.todayPL || 0), 0);
  const openRiskUnknown = active.some((c) => c.metrics.openRisk === null && c.metrics.openPositionsCount > 0);
  const totalOpenRisk = active.reduce((sum, c) => sum + (c.metrics.openRisk || 0), 0);

  const totals = [
    { icon: 'wallet', label: tr(lang, 'sumEquity'), value: money(lang, 'USD', totalEquity), note: digits(lang, active.length) },
    { icon: 'trending-up', label: tr(lang, 'sumToday'), value: anyTodayKnown ? money(lang, 'USD', totalToday) : tr(lang, 'none'), color: anyTodayKnown ? (totalToday >= 0 ? 'var(--success)' : 'var(--danger)') : undefined },
    { icon: 'execution', label: tr(lang, 'sumOpenRisk'), value: openRiskUnknown ? tr(lang, 'insufficientData') : money(lang, 'USD', totalOpenRisk) },
    { icon: 'honour', label: tr(lang, 'sumProp'), value: digits(lang, active.filter((c) => c.account.kind === 'prop').length) },
    { icon: 'wallet', label: tr(lang, 'sumPersonal'), value: digits(lang, active.filter((c) => c.account.kind === 'personal').length) },
    { icon: 'honour', label: tr(lang, 'sumAtRisk'), value: digits(lang, attention.length), color: attention.length ? 'var(--warning)' : undefined }
  ];

  const filters = [
    { id: 'all', label: tr(lang, 'filterAll'), count: active.length },
    { id: 'prop', label: tr(lang, 'filterProp'), count: active.filter((c) => c.account.kind === 'prop').length },
    { id: 'personal', label: tr(lang, 'filterPersonal'), count: active.filter((c) => c.account.kind === 'personal').length },
    { id: 'attention', label: tr(lang, 'filterAttention'), count: attention.length },
    { id: 'archived', label: tr(lang, 'filterArchived'), count: archived.length }
  ];

  if (!accounts.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PageHeader lang={lang} onCreateManual={onCreateManual} />
        <Panel variant="base" ornament padding="56px 40px" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, textAlign: 'center' }}>
          <span style={{ width: 64, height: 64, display: 'grid', placeItems: 'center', borderRadius: 12, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.6)', color: 'var(--char-accent)' }}><Icon name="wallet" size={30} /></span>
          <h2 style={{ margin: 0, font: 'var(--type-display-lg)', letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase', color: 'var(--parchment)' }}>{tr(lang, 'emptyTitle')}</h2>
          <p style={{ margin: 0, maxWidth: 560, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{tr(lang, 'emptyBody')}</p>
          <Button variant="primary" icon="plus" onClick={onCreateManual}>{tr(lang, 'emptyCta')}</Button>
          <Notice tone="info" icon="status" style={{ maxWidth: 560 }}>{tr(lang, 'noBrokerNote')}</Notice>
        </Panel>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader lang={lang} onCreateManual={onCreateManual} />

      <Panel variant="raised" style={{ display: 'flex', overflow: 'hidden' }} padding={0}>
        {totals.map((t, i) => (
          <div key={t.label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 18px', borderLeft: i ? '1px solid var(--divider-gold)' : 'none' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}><Icon name={t.icon} size={14} />{t.label}</span>
            <span className="navrya-tabular" style={{ font: 'var(--type-metric-value)', color: t.color || 'var(--text-primary)' }}>{t.value}</span>
          </div>
        ))}
      </Panel>

      {attention.length > 0 && (
        <Panel variant="base" style={{ position: 'relative', borderColor: 'rgba(255,176,32,.45)', background: 'rgba(255,176,32,.06)', overflow: 'hidden' }} padding="14px 16px">
          <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: 14, height: 14, margin: 4, borderLeft: '1px solid var(--warning)', borderTop: '1px solid var(--warning)' }} />
          <span aria-hidden="true" style={{ position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, margin: 4, borderRight: '1px solid var(--warning)', borderBottom: '1px solid var(--warning)' }} />
          <div style={{ display: 'flex', gap: 14 }}>
            <span style={{ color: 'var(--warning)', paddingTop: 2 }}><Icon name="honour" size={20} /></span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--warning)' }}>
                {digits(lang, attention.length)} {tr(lang, attention.length === 1 ? 'attentionHeadingOne' : 'attentionHeading')}
              </span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {attention.map((c) => {
                  const worst = worstState(c.ruleResult.groups);
                  let evidence = null;
                  c.ruleResult.groups.some((g) => {
                    const row = g.items.find((i) => i.state === worst && i.note);
                    if (row) { evidence = row.note; return true; }
                    return false;
                  });
                  return (
                    <button key={c.account.id} type="button" onClick={() => onOpenAccount(c.account.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', textAlign: 'start' }}>
                      <span className="navrya-tabular" style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--danger)' }}>{c.account.firm}</span>
                      {evidence && <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{evidence}</span>}
                      <Icon name="chevron-right" size={15} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Panel>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 3, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.5)' }}>
          {filters.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)}
              style={{ height: 34, display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', font: 'var(--type-caption)', letterSpacing: '.08em', textTransform: 'uppercase', background: filter === f.id ? 'var(--char-active-surface)' : 'transparent', color: filter === f.id ? 'var(--char-accent)' : 'var(--text-muted)', borderColor: filter === f.id ? 'var(--char-accent)' : 'transparent' }}>
              {f.label}<span className="navrya-tabular" style={{ opacity: .72 }}>{digits(lang, f.count)}</span>
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <ViewToggle value={mode} onChange={setMode} options={[{ value: 'grid', icon: 'grid' }, { value: 'list', icon: 'list' }]} />
      </div>

      {mode === 'grid' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[['prop', tr(lang, 'groupProp'), 'honour'], ['personal', tr(lang, 'groupPersonal'), 'wallet']].map(([kind, title, icon]) => {
            const items = filtered.filter((c) => c.account.kind === kind);
            if (!items.length) return null;
            return (
              <section key={kind} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: 'var(--char-accent)', display: 'flex' }}><Icon name={icon} size={16} /></span>
                  <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{title}</span>
                  <span style={{ flex: 1, height: 1, background: 'var(--border-hairline)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
                  {items.map((c) => (
                    <AccountCard key={c.account.id} lang={lang} account={c.account} metrics={c.metrics} ruleResult={c.ruleResult} onOpen={() => onOpenAccount(c.account.id)} />
                  ))}
                </div>
              </section>
            );
          })}
          {!filtered.length && (
            <Panel variant="quiet" padding="34px 20px" style={{ textAlign: 'center', color: 'var(--text-dim)' }}>{tr(lang, 'insufficientData')}</Panel>
          )}
        </div>
      ) : (
        <Panel variant="base" padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 1fr 1fr 1fr 1.1fr 1.1fr 1fr', minWidth: 960 }}>
              {[tr(lang, 'ledgerAccount'), tr(lang, 'ledgerStatus'), tr(lang, 'ledgerEquity'), tr(lang, 'ledgerToday'), tr(lang, 'ledgerTotal'), tr(lang, 'ledgerTarget'), tr(lang, 'ledgerRisk'), tr(lang, 'ledgerHealth')].map((h, i) => (
                <span key={h} style={{ padding: '10px 14px', font: 'var(--type-section-label)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.5)', textAlign: i >= 2 ? 'end' : 'start' }}>{h}</span>
              ))}
              {filtered.map((c) => {
                const worst = worstState(c.ruleResult.groups);
                const meta = worst ? STATE_META[worst] : STATE_META.safe;
                const archived = c.account.status === 'archived';
                const health = !c.metrics.hasAnyTrades ? { key: 'healthAwaiting', color: 'var(--info)' }
                  : archived ? { key: 'healthArchived', color: 'var(--text-muted)' }
                  : worst === 'violated' || worst === 'danger' ? { key: 'healthDanger', color: 'var(--danger)' }
                  : worst === 'watch' ? { key: 'healthWatch', color: 'var(--warning)' }
                  : { key: 'healthOk', color: 'var(--success)' };
                const mark = String(c.account.firm || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'NA';
                const targetPct = c.account.kind === 'prop' ? c.metrics.profitProgressPercent : null;
                const riskAllowance = (c.account.kind === 'prop' ? c.account.rules.dailyLossLimitPercent : c.account.rules.dailyLossCap) !== null
                  ? (c.account.kind === 'prop' ? c.metrics.dayStartEquity * (c.account.rules.dailyLossLimitPercent / 100) : c.account.rules.dailyLossCap) : null;
                const riskPct = riskAllowance !== null ? Math.max(0, Math.min(100, (c.metrics.dailyLossUsed / (riskAllowance || 1)) * 100)) : null;
                return (
                  <button key={c.account.id} type="button" onClick={() => onOpenAccount(c.account.id)}
                    style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '2.4fr 1fr 1fr 1fr 1fr 1.1fr 1.1fr 1fr', alignItems: 'center', padding: '13px 16px', cursor: 'pointer', textAlign: 'start', border: 'none', borderTop: '1px solid var(--border-hairline)', background: 'transparent', color: 'inherit', font: 'inherit' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ width: 30, height: 30, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 6, border: '1px solid var(--divider-gold)', font: 'var(--type-caption)', letterSpacing: '.06em', color: meta ? meta.color : 'var(--char-accent)', borderColor: meta ? meta.frame : 'var(--divider-gold)' }}>{mark}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.account.firm}</span>
                        <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{c.account.program || tr(lang, c.account.kind === 'personal' ? 'manKindPersonal' : 'manKindProp')}</span>
                      </span>
                    </span>
                    <span style={{ font: 'var(--type-caption)', letterSpacing: '.08em', textTransform: 'uppercase', color: archived ? 'var(--text-muted)' : meta ? meta.color : 'var(--text-muted)' }}>{archived ? tr(lang, 'archivedChip') : meta ? tr(lang, meta.key) : tr(lang, 'manualChip')}</span>
                    <span className="navrya-tabular" style={{ textAlign: 'end' }}>{money(lang, c.account.currency, c.metrics.equity)}</span>
                    <span className="navrya-tabular" style={{ textAlign: 'end', color: c.metrics.hasTradesToday ? (c.metrics.todayPL >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--text-dim)' }}>{c.metrics.hasTradesToday ? money(lang, c.account.currency, c.metrics.todayPL) : tr(lang, 'none')}</span>
                    <span className="navrya-tabular" style={{ textAlign: 'end', color: c.metrics.hasClosedTrades ? (c.metrics.totalPL >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--text-dim)' }}>{c.metrics.hasClosedTrades ? money(lang, c.account.currency, c.metrics.totalPL) : tr(lang, 'none')}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingInlineStart: 16 }}>
                      <span style={{ position: 'relative', flex: 1, height: 6, borderRadius: 3, background: 'rgba(244,234,215,.06)', overflow: 'hidden' }}>
                        {targetPct !== null && <span style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: Math.max(0, Math.min(100, targetPct)) + '%', background: 'var(--char-accent)' }} />}
                      </span>
                      <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', minWidth: 34, textAlign: 'end' }}>{targetPct === null ? tr(lang, 'none') : pctText(lang, targetPct, 0)}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingInlineStart: 16 }}>
                      <span style={{ position: 'relative', flex: 1, height: 6, borderRadius: 3, background: 'rgba(244,234,215,.06)', overflow: 'hidden' }}>
                        {riskPct !== null && <span style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: riskPct + '%', background: engine.limitState(riskPct) === 'safe' ? 'var(--char-accent)' : engine.limitState(riskPct) === 'watch' ? 'var(--warning)' : 'var(--danger)' }} />}
                      </span>
                      <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', minWidth: 34, textAlign: 'end' }}>{riskPct === null ? tr(lang, 'none') : pctText(lang, riskPct, 0)}</span>
                    </span>
                    <span style={{ font: 'var(--type-caption)', letterSpacing: '.08em', textTransform: 'uppercase', textAlign: 'end', color: health.color }}>{tr(lang, health.key)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

function PageHeader({ lang, onCreateManual }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 280 }}>
        <h1 style={{ margin: 0, font: 'var(--type-display-lg)', letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase', color: 'var(--parchment)' }}>{tr(lang, 'title')}</h1>
        <p style={{ margin: '6px 0 0', maxWidth: 720, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{tr(lang, 'subtitle')}</p>
      </div>
      <Button variant="primary" icon="plus" onClick={onCreateManual}>{tr(lang, 'createManual')}</Button>
    </div>
  );
}

// ---- Account detail: header + 5 tabs ----
function EquityChart({ lang, account, allTrades, metrics }) {
  const trades = allTrades.filter((t) => t.accountId === account.id && t.status === 'closed' && typeof t.pnl === 'number')
    .slice().sort((a, b) => new Date(a.closedAt || a.updatedAt) - new Date(b.closedAt || b.updatedAt));
  const points = [account.startingBalance];
  let running = account.startingBalance;
  trades.forEach((t) => { running += t.pnl; points.push(running); });
  if (points.length < 2) return null;
  const floor = metrics.drawdownFloor;
  const marks = points.concat(floor !== null ? [floor] : []);
  const hi = Math.max.apply(null, marks), lo = Math.min.apply(null, marks);
  const pad = (hi - lo) * 0.1 || 1, top = hi + pad, bot = lo - pad;
  const w = 1000, h = 200;
  const X = (i) => i * (w / (points.length - 1));
  const Y = (v) => h - ((v - bot) / (top - bot)) * h;
  const line = points.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  const floorY = floor !== null ? Y(floor).toFixed(1) : null;
  const startY = Y(account.startingBalance).toFixed(1);
  return (
    <section>
      <svg viewBox={'0 0 ' + w + ' ' + h} preserveAspectRatio="none" width="100%" height={h} style={{ display: 'block' }}>
        {floorY !== null && <line x1="0" y1={floorY} x2={w} y2={floorY} stroke="var(--danger)" strokeWidth="1.5" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />}
        <line x1="0" y1={startY} x2={w} y2={startY} stroke="rgba(244,234,215,.22)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <path d={line} fill="none" stroke="var(--char-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', gap: 18, paddingTop: 10, flexWrap: 'wrap', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>
        {floorY !== null && <span style={{ color: 'var(--danger)' }}>{money(lang, account.currency, floor)} floor</span>}
        <span>{money(lang, account.currency, account.startingBalance)} start</span>
        <span style={{ color: 'var(--char-accent)' }}>{digits(lang, points.length - 1)} closed trades</span>
      </div>
    </section>
  );
}

function OverviewTab({ lang, account, metrics, ruleResult, allTrades }) {
  const worst = worstState(ruleResult.groups);
  const meta = worst ? STATE_META[worst] : STATE_META.safe;
  const age = accountAgeDays(account);
  const allowance = account.kind === 'prop' && account.rules.dailyLossLimitPercent !== null ? metrics.dayStartEquity * (account.rules.dailyLossLimitPercent / 100)
    : account.kind === 'personal' && account.rules.dailyLossCap !== null ? account.rules.dailyLossCap : null;
  const left = allowance !== null ? Math.max(0, allowance - metrics.dailyLossUsed) : null;
  const usedPct = allowance ? Math.min(100, (metrics.dailyLossUsed / allowance) * 100) : 0;

  const metricsRow = [
    { label: tr(lang, 'metricEquity'), value: money(lang, account.currency, metrics.equity) },
    { label: tr(lang, 'metricToday'), value: metrics.hasTradesToday ? money(lang, account.currency, metrics.todayPL) : tr(lang, 'none'), color: metrics.hasTradesToday ? (metrics.todayPL >= 0 ? 'var(--success)' : 'var(--danger)') : undefined },
    { label: tr(lang, 'metricTotal'), value: metrics.hasClosedTrades ? money(lang, account.currency, metrics.totalPL) : tr(lang, 'none'), color: metrics.hasClosedTrades ? (metrics.totalPL >= 0 ? 'var(--success)' : 'var(--danger)') : undefined },
    { label: tr(lang, 'metricDrawdown'), value: metrics.drawdownFloor !== null ? money(lang, account.currency, metrics.drawdownUsedAmount) : tr(lang, 'none') },
    { label: tr(lang, 'metricAge'), value: age === null ? tr(lang, 'ageUnknown') : tr(lang, 'dayN', { n: digits(lang, age) }) },
    { label: tr(lang, 'metricOpenRisk'), value: metrics.openRisk === null ? (metrics.openPositionsCount ? tr(lang, 'insufficientData') : tr(lang, 'none')) : money(lang, account.currency, metrics.openRisk) }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel variant="base" ornament padding="20px 22px" style={{ borderColor: meta.frame }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9, font: 'var(--type-section-label)', letterSpacing: '.14em', textTransform: 'uppercase', color: meta.color }}>
          <Icon name="honour" size={16} />{tr(lang, meta.key)}
        </span>
        <p style={{ margin: '8px 0 0', font: 'var(--type-display-md)', color: 'var(--parchment)' }}>
          {!ruleResult.hasAnyRuleConfigured ? tr(lang, 'noRulesConfigured') : (allowance !== null ? tr(lang, 'leftOf', { allowance: money(lang, account.currency, allowance) }) + ' · ' + money(lang, account.currency, left) : tr(lang, 'insufficientData'))}
        </p>
      </Panel>

      <div style={{ display: 'flex', borderRadius: 12, border: '1px solid var(--border-gold)', background: 'var(--surface-card)', overflow: 'hidden' }}>
        {metricsRow.map((m, i) => (
          <div key={m.label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5, padding: '15px 18px', borderLeft: i ? '1px solid var(--divider-gold)' : 'none' }}>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{m.label}</span>
            <span className="navrya-tabular" style={{ font: 'var(--type-metric-value)', color: m.color || 'var(--text-primary)' }}>{m.value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 16 }}>
        <Panel variant="base" padding={0}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
            <Icon name="report" size={17} /><span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{tr(lang, 'probabilityTitle')}</span>
          </header>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Notice tone="info">{tr(lang, 'probabilityNote')}</Notice>
            <EquityChart lang={lang} account={account} allTrades={allTrades} metrics={metrics} />
          </div>
        </Panel>
        <Panel variant="base" padding={16}>
          <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{tr(lang, 'whatTodayAllows')}</span>
          {allowance === null ? (
            <p style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{tr(lang, 'insufficientData')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="navrya-tabular" style={{ font: 'var(--type-level)', fontSize: 30, color: usedPct >= 80 ? 'var(--danger)' : usedPct >= 50 ? 'var(--warning)' : 'var(--success)' }}>{money(lang, account.currency, left)}</span>
                <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, 'leftOf', { allowance: money(lang, account.currency, allowance) })}</span>
              </div>
              <div style={{ position: 'relative', height: 10, borderRadius: 5, overflow: 'hidden', background: 'rgba(244,234,215,.06)' }}>
                <span style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: usedPct + '%', background: usedPct >= 80 ? 'var(--danger)' : usedPct >= 50 ? 'var(--warning)' : 'var(--success)' }} />
              </div>
            </div>
          )}
        </Panel>
      </div>

      {account.kind === 'prop' && (
        <Panel variant="base" padding={0}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
            <Icon name="scenarios" size={17} /><span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{tr(lang, 'pathToPassing')}</span>
          </header>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))' }}>
            {[
              ['manTarget', account.rules.profitTargetPercent, metrics.profitProgressPercent],
              ['manMinDays', account.rules.minTradingDays, account.rules.minTradingDays ? (metrics.tradingDaysCount / account.rules.minTradingDays) * 100 : null],
              ['manConsistency', account.rules.consistencyCapPercent, metrics.bestDayShare !== null && account.rules.consistencyCapPercent ? (metrics.bestDayShare / account.rules.consistencyCapPercent) * 100 : null],
              ['manMaxDD', account.rules.maxDrawdownPercent, metrics.drawdownFloor !== null ? (metrics.drawdownUsedAmount / Math.max(1, (account.kind === 'prop' && account.rules.drawdownType === 'trailing' ? metrics.peakEquity : metrics.startingBalance) - metrics.drawdownFloor)) * 100 : null]
            ].map(([key, configured, pct]) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '16px 18px', borderInlineStart: '1px solid var(--border-hairline)' }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, key)}</span>
                <span className="navrya-tabular" style={{ font: 'var(--type-metric-value)', fontSize: 17, color: 'var(--text-primary)' }}>{configured === null ? tr(lang, 'noTargetGate') : pctText(lang, pct, 0)}</span>
                <div style={{ position: 'relative', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(244,234,215,.06)' }}>
                  <span style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: Math.max(0, Math.min(100, pct || 0)) + '%', background: 'var(--char-accent)' }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function RulesTab({ lang, account, ruleResult }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!ruleResult.groups.length && <Notice tone="info">{tr(lang, 'noRulesConfigured')}</Notice>}
      {ruleResult.groups.map((g) => (
        <section key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{tr(lang, RULE_GROUP_KEY[g.title] || g.title)}</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border-hairline)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
            {g.items.map((r) => {
              const meta = STATE_META[r.state] || STATE_META.safe;
              return (
                <Panel key={r.name} variant="base" padding={16} style={{ borderColor: meta.frame, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ color: meta.color, paddingTop: 1 }}><Icon name={meta.icon} size={16} /></span>
                    <span style={{ flex: 1, minWidth: 0, font: 'var(--type-username)', color: 'var(--text-primary)' }}>{r.name}</span>
                    <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: meta.color }}>{tr(lang, meta.key)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span className="navrya-tabular" style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{r.requirement}</span>
                    <span style={{ flex: 1 }} />
                    <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: meta.color }}>{r.current}</span>
                  </div>
                  <div style={{ position: 'relative', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(244,234,215,.06)' }}>
                    <span style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: r.pct + '%', background: meta.color }} />
                  </div>
                  {r.note && <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{r.note}</span>}
                </Panel>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function PretradeTab({ lang, account, metrics, onOpenCalculator }) {
  const engine = window.TradeJournalAccountsEngine;
  const [riskInput, setRiskInput] = React.useState('');
  const [rewardInput, setRewardInput] = React.useState('');
  const [hasStop, setHasStop] = React.useState(true);
  const riskAmount = riskInput === '' ? null : Number(riskInput);
  const rewardAmount = rewardInput === '' ? null : Number(rewardInput);
  const verdict = engine.evaluatePretrade(account, metrics, { riskAmount: Number.isFinite(riskAmount) ? riskAmount : null, rewardAmount: Number.isFinite(rewardAmount) ? rewardAmount : null, hasStopAttached: hasStop });
  const toneColor = { bad: 'var(--danger)', warn: 'var(--warning)', ok: 'var(--success)', unknown: 'var(--info)' }[verdict.tone];
  const toneFrame = { bad: 'rgba(255,56,48,.45)', warn: 'rgba(255,176,32,.45)', ok: 'rgba(46,204,113,.45)', unknown: 'rgba(77,163,255,.4)' }[verdict.tone];
  const toneBg = { bad: 'rgba(255,56,48,.08)', warn: 'rgba(255,176,32,.07)', ok: 'rgba(46,204,113,.07)', unknown: 'rgba(77,163,255,.06)' }[verdict.tone];
  const stateColor = { ok: 'var(--success)', warn: 'var(--warning)', bad: 'var(--danger)', unknown: 'var(--text-muted)' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
      <Panel variant="base" padding={16} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TextField label={tr(lang, 'riskAmountLabel')} type="number" value={riskInput} onChange={setRiskInput} placeholder="0" hint={tr(lang, 'riskAmountHint')} />
        <TextField label={tr(lang, 'rewardAmountLabel')} type="number" value={rewardInput} onChange={setRewardInput} placeholder="0" hint={tr(lang, 'rewardAmountHint')} />
        <Toggle checked={hasStop} onChange={setHasStop} label={tr(lang, 'stopAttachedLabel')} />
        <Button variant="secondary" icon="execution" onClick={() => onOpenCalculator(account.id)}>{tr(lang, 'openCalcBtn')}</Button>
      </Panel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Panel variant="base" padding={18} style={{ borderColor: toneFrame, background: toneBg, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span style={{ color: toneColor, paddingTop: 2 }}><Icon name={verdict.tone === 'bad' ? 'close' : verdict.tone === 'warn' ? 'honour' : verdict.tone === 'ok' ? 'check' : 'status'} size={22} /></span>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ font: 'var(--type-display-md)', textTransform: 'uppercase', color: toneColor }}>{verdict.head}</span>
            <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{verdict.line}</span>
          </div>
          {verdict.survives !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '0 8px' }}>
              <span className="navrya-tabular" style={{ font: 'var(--type-level)', fontSize: 30, color: toneColor }}>{digits(lang, verdict.survives)}</span>
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center' }}>{tr(lang, 'survivesLabel')}</span>
            </div>
          )}
        </Panel>

        {verdict.runway && (
          <Panel variant="base" padding={16} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, 'runwayTitle')}</span>
            <div style={{ display: 'flex', height: 26, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-hairline)', background: 'rgba(244,234,215,.05)' }}>
              <span style={{ width: verdict.runway.usedPct + '%', background: 'rgba(255,56,48,.55)' }} />
              <span style={{ width: verdict.runway.tradePct + '%', background: toneColor, opacity: .75 }} />
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>
              <span>{tr(lang, 'runwayUsed')}: {pctText(lang, verdict.runway.usedPct, 0)}</span>
              <span>{tr(lang, 'runwayTrade')}: {pctText(lang, verdict.runway.tradePct, 0)}</span>
              <span>{tr(lang, 'runwayLeft')}: {pctText(lang, verdict.runway.leftPct, 0)}</span>
            </div>
          </Panel>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 }}>
          {[['ifLose', verdict.loseRows], ['ifWin', verdict.winRows]].map(([key, rows]) => (
            <Panel key={key} variant="base" padding={0}>
              <header style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-hairline)', font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{tr(lang, key)}</header>
              <div style={{ padding: '4px 16px 12px' }}>
                {!rows.length ? <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)', display: 'block', padding: '10px 0' }}>{tr(lang, 'insufficientData')}</span>
                  : rows.map((r) => (
                    <div key={r.label} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-hairline)' }}>
                      <span style={{ flex: 1, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{r.label}</span>
                      <span className="navrya-tabular" style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{r.value}</span>
                    </div>
                  ))}
              </div>
            </Panel>
          ))}
        </div>

        <Panel variant="base" padding={16}>
          <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, 'ruleCheck')}</span>
          {verdict.checks.map((c) => (
            <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border-hairline)' }}>
              <span style={{ color: stateColor[c.state] || 'var(--text-muted)' }}><Icon name={c.state === 'ok' ? 'check' : c.state === 'bad' ? 'close' : c.state === 'warn' ? 'honour' : 'status'} size={15} /></span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--text-primary)', minWidth: 200 }}>{c.label}</span>
              <span style={{ flex: 1, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{c.value}</span>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

// Real calendar grid for the current month, keyed by the account's own trading-day boundary
// (accounts-engine.js's dailyPLSeries already computed the honest tz/reset-hour-aware key for
// every entry - this component only lays those real entries into a month grid, it invents
// nothing). A day with real open exposure but no closed trade yet shows "?" (defect #4's
// insufficient-data-over-false-number rule), never a fabricated $0.
function TradingCalendar({ lang, account, series }) {
  const map = {};
  series.forEach((d) => { map[d.date] = d; });
  const now = new Date();
  const year = now.getUTCFullYear(), month = now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const startWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday-first
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10);
    cells.push({ day: d, entry: map[key] || null });
  }
  const maxAbs = Math.max.apply(null, series.map((d) => Math.abs(d.pl)).concat([1]));
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <Panel variant="base" padding={0}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
        <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{tr(lang, 'tradingCalendar')}</span>
        <span style={{ flex: 1 }} />
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{now.toLocaleDateString(localeCode(lang), { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
      </header>
      <div style={{ padding: '12px 16px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 5, paddingBottom: 6 }}>
          {dow.map((w) => <span key={w} style={{ font: 'var(--type-caption)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-disabled)', textAlign: 'center' }}>{w}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 5 }}>
          {cells.map((c, i) => {
            if (!c) return <div key={'empty' + i} />;
            const e = c.entry;
            const win = e && e.pl > 0, has = !!e;
            const showUnknown = e && e.hasOpenExposure && e.pl === 0 && e.tradesCount === 0;
            const bg = !has ? 'transparent' : showUnknown ? 'rgba(77,163,255,.10)' : win ? 'rgba(46,204,113,' + (0.06 + Math.min(0.34, Math.abs(e.pl) / maxAbs * 0.34)) + ')' : e.pl < 0 ? 'rgba(255,56,48,' + (0.06 + Math.min(0.34, Math.abs(e.pl) / maxAbs * 0.34)) + ')' : 'transparent';
            const bd = !has ? 'var(--border-hairline)' : showUnknown ? 'rgba(77,163,255,.35)' : win ? 'rgba(46,204,113,.35)' : e.pl < 0 ? 'rgba(255,56,48,.35)' : 'var(--border-hairline)';
            const fg = !has ? 'var(--text-disabled)' : showUnknown ? 'var(--info)' : win ? 'var(--success)' : e.pl < 0 ? 'var(--danger)' : 'var(--text-dim)';
            return (
              <div key={c.day} style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '5px 6px', borderRadius: 6, border: '1px solid ' + bd, background: bg }}>
                <span className="navrya-tabular" style={{ font: 'var(--type-caption)', fontSize: 10, color: 'var(--text-disabled)' }}>{String(c.day).padStart(2, '0')}</span>
                <span className="navrya-tabular" style={{ font: 'var(--type-caption)', fontSize: 9, color: fg }}>{showUnknown ? '?' : e ? money(lang, account.currency, e.pl) : '—'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function PerformanceTab({ lang, account, allTrades }) {
  const engine = window.TradeJournalAccountsEngine;
  const dailySeries = engine.dailyPLSeries(account, allTrades);
  const trades = allTrades.filter((t) => t.accountId === account.id);
  const closed = trades.filter((t) => t.status === 'closed' && typeof t.pnl === 'number');
  const open = trades.filter((t) => t.status === 'open' || t.status === 'hunting');
  const wins = closed.filter((t) => t.pnl > 0), losses = closed.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0), grossLoss = losses.reduce((s, t) => s + t.pnl, 0);
  const profitFactor = grossLoss < 0 ? Math.abs(grossWin / grossLoss) : null;
  const expectancy = closed.length ? closed.reduce((s, t) => s + t.pnl, 0) / closed.length : null;
  const avgRR = closed.filter((t) => typeof t.rr === 'number').length
    ? closed.filter((t) => typeof t.rr === 'number').reduce((s, t) => s + t.rr, 0) / closed.filter((t) => typeof t.rr === 'number').length : null;
  let running = account.startingBalance, peak = account.startingBalance, maxDD = 0;
  closed.slice().sort((a, b) => new Date(a.closedAt || a.updatedAt) - new Date(b.closedAt || b.updatedAt)).forEach((t) => {
    running += t.pnl; if (running > peak) peak = running; if (peak - running > maxDD) maxDD = peak - running;
  });

  const stats = [
    [tr(lang, 'statWinRate'), closed.length ? pctText(lang, (wins.length / closed.length) * 100, 0) : tr(lang, 'none')],
    [tr(lang, 'statProfitFactor'), profitFactor === null ? tr(lang, 'none') : digits(lang, profitFactor.toFixed(2))],
    [tr(lang, 'statExpectancy'), expectancy === null ? tr(lang, 'none') : money(lang, account.currency, expectancy)],
    [tr(lang, 'statRR'), avgRR === null ? tr(lang, 'none') : '1:' + digits(lang, avgRR.toFixed(1))],
    [tr(lang, 'statAvgWin'), wins.length ? money(lang, account.currency, grossWin / wins.length) : tr(lang, 'none')],
    [tr(lang, 'statAvgLoss'), losses.length ? money(lang, account.currency, grossLoss / losses.length) : tr(lang, 'none')],
    [tr(lang, 'statMaxDD'), closed.length ? money(lang, account.currency, -maxDD) : tr(lang, 'none')],
    [tr(lang, 'statTrades'), digits(lang, closed.length)]
  ];

  const [dim, setDim] = React.useState('session');
  const dims = [['session', 'dimSession'], ['weekday', 'dimWeekday'], ['direction', 'dimDirection'], ['setup', 'dimSetup'], ['instrument', 'dimInstrument']];
  const strategyStore = window.TradeJournalStrategyEducationStore;
  function bucketOf(t) {
    if (dim === 'session') return t.session || tr(lang, 'unassigned');
    if (dim === 'weekday') return new Date(t.closedAt || t.createdAt).toLocaleDateString(localeCode(lang), { weekday: 'long' });
    if (dim === 'direction') return t.direction;
    if (dim === 'instrument') return t.instrument || tr(lang, 'unassigned');
    if (dim === 'setup') { const s = strategyStore && t.linkedStrategyId ? strategyStore.find(t.linkedStrategyId) : null; return s ? s.name : tr(lang, 'unassigned'); }
    return tr(lang, 'unassigned');
  }
  const buckets = {};
  closed.forEach((t) => { const key = bucketOf(t); if (!buckets[key]) buckets[key] = { trades: 0, net: 0, wins: 0 }; buckets[key].trades += 1; buckets[key].net += t.pnl; if (t.pnl > 0) buckets[key].wins += 1; });
  const rows = Object.keys(buckets).map((k) => ({ name: k, ...buckets[k] })).sort((a, b) => b.trades - a.trades);
  const maxTrades = Math.max.apply(null, rows.map((r) => r.trades).concat([1]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16 }}>
        <Panel variant="base" padding={16}>
          <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{tr(lang, 'dailyPL')}</span>
          <span style={{ display: 'block', paddingTop: 2, font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{tr(lang, 'dailyPLNote')}</span>
          {!dailySeries.length ? <p style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{tr(lang, 'insufficientData')}</p> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90, paddingTop: 12 }}>
              {dailySeries.slice(-30).map((d) => {
                const maxAbs = Math.max.apply(null, dailySeries.map((x) => Math.abs(x.pl)).concat([1]));
                const h2 = Math.min(60, (Math.abs(d.pl) / maxAbs) * 60);
                const title = d.date + ' · ' + digits(lang, d.tradesCount) + ' trades · ' + money(lang, account.currency, d.pl) + (d.hasOpenExposure ? ' (+ open exposure)' : '');
                return (
                  <span key={d.date} title={title} style={{ flex: 1, minWidth: 2, height: Math.max(2, h2), background: d.pl >= 0 ? 'var(--success)' : 'var(--danger)', borderRadius: '2px 2px 0 0', position: 'relative' }}>
                    {d.hasOpenExposure && <span aria-hidden="true" style={{ position: 'absolute', top: -6, insetInlineStart: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: 'var(--info)' }} />}
                  </span>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel variant="base" padding={0}>
          <header style={{ padding: '13px 16px', borderBottom: '1px solid var(--border-hairline)', font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{tr(lang, 'statistics')}</header>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            {stats.map(([label, value]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '13px 16px', borderTop: '1px solid var(--border-hairline)' }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{label}</span>
                <span className="navrya-tabular" style={{ font: 'var(--type-metric-value)', fontSize: 16, color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel variant="base" padding={0}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
          <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)', paddingInlineEnd: 6 }}>{tr(lang, 'performanceBy')}</span>
          {dims.map(([id, key]) => (
            <button key={id} type="button" onClick={() => setDim(id)} style={{ height: 32, padding: '0 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (dim === id ? 'var(--char-accent)' : 'var(--divider-gold)'), background: dim === id ? 'var(--char-active-surface)' : 'transparent', color: dim === id ? 'var(--char-accent)' : 'var(--text-muted)', font: 'var(--type-caption)', letterSpacing: '.08em', textTransform: 'uppercase' }}>{tr(lang, key)}</button>
          ))}
        </header>
        <div style={{ padding: '6px 16px 14px' }}>
          {!rows.length ? <p style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{tr(lang, 'insufficientData')}</p> : rows.map((r) => (
            <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderBottom: '1px solid var(--border-hairline)' }}>
              <span style={{ width: 150, flex: 'none', font: 'var(--type-body)', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{r.name}</span>
              <span style={{ position: 'relative', flex: 1, height: 8, borderRadius: 4, background: 'rgba(244,234,215,.06)', overflow: 'hidden' }}>
                <span style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: (r.trades / maxTrades) * 100 + '%', background: r.net >= 0 ? 'var(--success)' : 'var(--danger)', opacity: .8 }} />
              </span>
              <span className="navrya-tabular" style={{ width: 70, textAlign: 'end', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{digits(lang, r.trades)}</span>
              <span className="navrya-tabular" style={{ width: 60, textAlign: 'end', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{pctText(lang, (r.wins / r.trades) * 100, 0)}</span>
              <span className="navrya-tabular" style={{ width: 90, textAlign: 'end', font: 'var(--type-body)', color: r.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>{money(lang, account.currency, r.net)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <TradingCalendar lang={lang} account={account} series={dailySeries} />

      <Panel variant="base" padding={0}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
          <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{tr(lang, 'openExposure')}</span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{tr(lang, 'openExposureNote')}</span>
        </header>
        {!open.length ? <p style={{ padding: 16, margin: 0, font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{tr(lang, 'none')}</p> : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr .8fr 1fr 1fr 1fr 1fr', minWidth: 640 }}>
              {[tr(lang, 'expSymbol'), tr(lang, 'expSide'), tr(lang, 'expEntry'), tr(lang, 'expStop'), tr(lang, 'expRisk'), tr(lang, 'expSession')].map((h) => (
                <span key={h} style={{ padding: '10px 14px', font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-dim)', borderBottom: '1px solid var(--border-hairline)' }}>{h}</span>
              ))}
              {open.map((t) => (
                <React.Fragment key={t.id}>
                  <span className="navrya-tabular" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-hairline)', color: 'var(--text-primary)' }}>{t.instrument || '—'}</span>
                  <span style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-hairline)', color: t.direction === 'short' ? 'var(--danger)' : 'var(--success)' }}>{t.direction}</span>
                  <span className="navrya-tabular" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-hairline)', color: 'var(--text-muted)' }}>{t.entryPrice ?? '—'}</span>
                  <span className="navrya-tabular" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-hairline)', color: 'var(--text-muted)' }}>{t.stopLoss ?? '—'}</span>
                  <span className="navrya-tabular" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-hairline)', color: 'var(--danger)' }}>{t.riskAmount ? money(lang, account.currency, t.riskAmount) : tr(lang, 'insufficientData')}</span>
                  <span style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-hairline)', color: 'var(--text-muted)' }}>{t.session}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function BehaviourTab({ lang, account, allTrades }) {
  const engine = window.TradeJournalAccountsEngine;
  const trades = allTrades.filter((t) => t.accountId === account.id);
  const emotions = [];
  trades.forEach((t) => (t.emotionLog || []).forEach((e) => emotions.push(e)));
  const closed = trades.filter((t) => t.status === 'closed' && typeof t.pnl === 'number');
  const MIN_OBS = 5;

  // Real, non-profitability-based discipline (defect #6) - see accounts-engine.js's own
  // computeDiscipline() for the full formula (plan commitment/focus/stress + risk-rule
  // violations + revenge timing + documented overrides, never whether a trade made money).
  const discipline = engine.computeDiscipline(account, allTrades);

  const revengeSample = closed.slice().sort((a, b) => new Date(a.closedAt) - new Date(b.closedAt));
  let revengeCount = 0;
  for (let i = 1; i < revengeSample.length; i++) {
    const prev = revengeSample[i - 1], cur = revengeSample[i];
    if (prev.pnl < 0 && new Date(cur.createdAt) - new Date(prev.closedAt) < 10 * 60000) revengeCount += 1;
  }
  const highStress = emotions.filter((e) => typeof e.stressLevel === 'number' && e.stressLevel >= 8);
  const highStressLosses = highStress.filter((e) => {
    const trade = trades.find((t) => (t.emotionLog || []).indexOf(e) > -1);
    return trade && typeof trade.pnl === 'number' && trade.pnl < 0;
  });
  const riskRule = account.rules && account.rules.maxRiskPerTradePercent;
  const withRisk = trades.filter((t) => typeof t.riskPercent === 'number');
  const violations = riskRule != null ? withRisk.filter((t) => t.riskPercent > riskRule) : [];

  const signals = [
    closed.length >= MIN_OBS ? { name: tr(lang, 'signalRevenge'), evidence: tr(lang, 'signalRevengeEvidence', { n: digits(lang, revengeCount), total: digits(lang, closed.length) }), impact: tr(lang, revengeCount > 0 ? 'signalRevengeImpactWarn' : 'signalRevengeImpactOk'), level: revengeCount > 0 ? 'warn' : 'ok' } : null,
    emotions.length >= MIN_OBS ? { name: tr(lang, 'signalStress'), evidence: tr(lang, 'signalStressEvidence', { n: digits(lang, highStress.length), total: digits(lang, emotions.length) }), impact: tr(lang, highStressLosses.length ? 'signalStressImpactWarn' : 'signalStressImpactOk', { n: digits(lang, highStressLosses.length) }), level: highStress.length > 0 ? 'warn' : 'ok' } : null,
    riskRule != null && withRisk.length >= MIN_OBS ? { name: tr(lang, 'signalRiskViolation'), evidence: tr(lang, 'signalRiskViolationEvidence', { n: digits(lang, violations.length), total: digits(lang, withRisk.length), rule: riskRule }), impact: tr(lang, violations.length > 0 ? 'signalRiskViolationImpactWarn' : 'signalRiskViolationImpactOk'), level: violations.length > 0 ? 'warn' : 'ok' } : null
  ].filter(Boolean);

  const accountsMH = window.TradeJournalMentalHealthStore;
  const profile = accountsMH && typeof accountsMH.load === 'function' ? accountsMH.load() : null;
  const allCheckIns = (profile && profile.continuousTracking && profile.continuousTracking.preSessionCheckIns) || [];
  const scopedCheckIns = allCheckIns.filter((c) => c.accountId === account.id).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Panel variant="base" padding={18}>
          <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, 'disciplineScore')}</span>
          <div style={{ paddingTop: 8 }}>
            <span className="navrya-tabular" style={{ font: 'var(--type-level)', color: 'var(--char-accent)' }}>{discipline.score === null ? tr(lang, 'insufficientData') : discipline.score}</span>
          </div>
          {discipline.score === null && <p style={{ margin: '8px 0 0', font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{tr(lang, 'disciplineInsufficientNote', { n: digits(lang, discipline.sampleSize), min: digits(lang, discipline.minRequired) })}</p>}
          <p style={{ margin: '8px 0 0', font: 'var(--type-caption)', color: 'var(--text-dim)', lineHeight: '16px' }}>{tr(lang, 'disciplineFormulaNote')}</p>
        </Panel>
        <Panel variant="base" padding={0}>
          <header style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-hairline)', font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{tr(lang, 'checkInHistory')}</header>
          {!scopedCheckIns.length ? (
            <p style={{ padding: 16, margin: 0, font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{tr(lang, 'insufficientData')}</p>
          ) : scopedCheckIns.slice(0, 8).map((c) => (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 16px', borderTop: '1px solid var(--border-hairline)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-primary)' }}>{new Date(c.createdAt).toLocaleDateString(localeCode(lang))}</span>
                <span style={{ flex: 1 }} />
                <span style={{ font: 'var(--type-caption)', color: c.currentStressLevel >= 7 ? 'var(--danger)' : c.currentStressLevel >= 4 ? 'var(--warning)' : 'var(--success)' }}>{tr(lang, 'stressOf10', { n: digits(lang, c.currentStressLevel) })}</span>
              </div>
            </div>
          ))}
        </Panel>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
        {!signals.length ? (
          <Panel variant="quiet" padding={16}><span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{tr(lang, 'insufficientSignal')}</span></Panel>
        ) : signals.map((s) => (
          <Panel key={s.name} variant="base" padding={16} style={{ borderColor: s.level === 'warn' ? 'rgba(255,176,32,.42)' : 'var(--border-hairline)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, font: 'var(--type-username)', color: 'var(--text-primary)' }}>{s.name}</span>
              <Chip tone={s.level === 'warn' ? 'danger' : 'success'}>{tr(lang, s.level === 'warn' ? 'signalWatch' : 'signalClear')}</Chip>
            </div>
            <p style={{ margin: '8px 0 0', font: 'var(--type-body)', color: 'var(--text-primary)' }}>{s.evidence}</p>
            <p style={{ margin: '6px 0 0', font: 'var(--type-caption)', color: 'var(--text-muted)', lineHeight: '16px' }}>{s.impact}</p>
          </Panel>
        ))}
        {discipline.documentedOverrides > 0 && (
          <Panel variant="quiet" padding={16}>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{tr(lang, 'documentedOverridesNote', { n: digits(lang, discipline.documentedOverrides) })}</span>
          </Panel>
        )}
      </div>
      <p style={{ gridColumn: '1 / -1', margin: 0, font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{tr(lang, 'signalsTitle')}</p>
    </div>
  );
}

function AccountDetail({ lang, account, allTrades, tab, setTab, onBack, onEdit }) {
  const engine = window.TradeJournalAccountsEngine;
  const metrics = engine.computeMetrics(account, allTrades);
  const ruleResult = engine.evaluateRules(account, metrics);

  // Empty-allowlist "this entity is on screen" registration - same convention
  // tradeDetailsModal.jsx uses for 'trade-details-{id}' - lets ai-context-builder.js resolve
  // "this account" via resolveActiveIdByPrefix('account-detail-').
  const mountedRef = React.useRef(true);
  React.useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, [account.id]);
  React.useLayoutEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('account-detail-' + account.id, { allowlist: [], isOpen: () => mountedRef.current });
  }, [account.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const mark = String(account.firm || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'NA';
  const archived = account.status === 'archived';
  // Defect #3: an archived account is read-only - Pre-trade check (the one tab that exists
  // purely to plan a NEW trade against this account) is not offered at all, not just disabled.
  const tabs = [
    ['overview', tr(lang, 'tabOverview'), 'dashboard'],
    ['rules', tr(lang, account.kind === 'prop' ? 'tabRulesProp' : 'tabRulesPersonal'), 'honour'],
    !archived && ['pretrade', tr(lang, 'tabPretrade'), 'execution'],
    ['performance', tr(lang, 'tabPerformance'), 'report'],
    ['behaviour', tr(lang, 'tabBehaviour'), 'psychology']
  ].filter(Boolean);
  const activeTab = archived && tab === 'pretrade' ? 'overview' : tab;
  React.useEffect(() => { if (archived && tab === 'pretrade') setTab('overview'); }, [archived, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <button type="button" onClick={onBack} aria-label={tr(lang, 'back')} style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}>
          <Icon name="arrow-left" size={18} />
        </button>
        <span style={{ width: 52, height: 52, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 10, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.6)', font: 'var(--type-display-lg)', letterSpacing: '.06em', color: 'var(--char-accent)' }}>{mark}</span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, font: 'var(--type-display-lg)', letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase', color: 'var(--parchment)' }}>{account.firm}</h1>
            <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{account.program}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Chip tone="neutral" dot>{tr(lang, 'manualChip')}</Chip>
            {account.status === 'archived' && <Chip tone="danger" dot>{tr(lang, 'archivedChip')}</Chip>}
            <Chip tone="neutral">{account.currency}</Chip>
          </div>
        </div>
        {/* BUG FIX, found via real browser verification: there was no human-clickable way to edit
            or archive an account anywhere in this screen - only the AI's account.edit action
            (window.TradeJournalNavryaAccountsHub.editExisting()) could reach ManualAccountModal's
            edit mode (whose own footer already has the real "Remove account" archive action). This
            button opens the exact same modal, same editing state, same save/archive path - never a
            second, parallel edit flow. Visible even when archived: metadata edits and reversing an
            accidental archive are both legitimate here - defect #3's "read-only" guarantee is about
            never being NEWLY selectable for a trade/session/calculator, not about the account's own
            settings being frozen forever. */}
        {onEdit && <Button variant="secondary" icon="edit" onClick={onEdit}>{tr(lang, 'editAccountBtn')}</Button>}
        {!archived && <Button variant="primary" icon="execution" onClick={() => setTab('pretrade')}>{tr(lang, 'pretradeBtn')}</Button>}
      </div>

      {archived && (
        <Notice tone="danger" icon="report">{tr(lang, 'archivedNote')}</Notice>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 5, borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)' }}>
        {tabs.map(([id, label, icon]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            style={{ height: 40, display: 'flex', alignItems: 'center', gap: 9, padding: '0 16px', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent', font: 'var(--type-section-label)', letterSpacing: '.1em', textTransform: 'uppercase', background: activeTab === id ? 'var(--char-active-surface)' : 'transparent', color: activeTab === id ? 'var(--char-accent)' : 'var(--text-muted)', borderColor: activeTab === id ? 'var(--char-accent)' : 'transparent' }}>
            <Icon name={icon} size={16} />{label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab lang={lang} account={account} metrics={metrics} ruleResult={ruleResult} allTrades={allTrades} />}
      {activeTab === 'rules' && <RulesTab lang={lang} account={account} ruleResult={ruleResult} />}
      {activeTab === 'pretrade' && !archived && <PretradeTab lang={lang} account={account} metrics={metrics} onOpenCalculator={(id) => openCalculator({ accountId: id })} />}
      {activeTab === 'performance' && <PerformanceTab lang={lang} account={account} allTrades={allTrades} />}
      {activeTab === 'behaviour' && <BehaviourTab lang={lang} account={account} allTrades={allTrades} />}
    </div>
  );
}

// ---- Manual create/edit modal ----
function defaultManState() {
  const types = window.TradeJournalAccountsTypes || {};
  return {
    kind: 'prop', firm: '', program: '', platform: 'MetaTrader 5', number: '', start: new Date().toISOString().slice(0, 10),
    currency: 'USD', balance: '100000',
    prop: types.defaultPropRules ? types.defaultPropRules() : {}, personal: types.defaultPersonalRules ? types.defaultPersonalRules() : {}
  };
}
function manFromAccount(account) {
  return {
    kind: account.kind, firm: account.firm, program: account.program || '', platform: account.platform || '', number: '',
    start: account.startDate, currency: account.currency, balance: String(account.startingBalance),
    prop: account.kind === 'prop' ? account.rules : (window.TradeJournalAccountsTypes ? window.TradeJournalAccountsTypes.defaultPropRules() : {}),
    personal: account.kind === 'personal' ? account.rules : (window.TradeJournalAccountsTypes ? window.TradeJournalAccountsTypes.defaultPersonalRules() : {})
  };
}
function manToAccount(man, existing) {
  const store = window.TradeJournalAccountsStore;
  const rules = man.kind === 'prop' ? man.prop : man.personal;
  // `id` must be OMITTED (not set to `id: undefined`) for a new account - an explicit
  // `undefined`-valued own property still survives accounts-store.js's normalize()
  // (Object.assign(base, src) copies it, clobbering the fresh id empty() already generated),
  // and JSON.stringify() then silently drops that key from the POST body, so the server
  // rejects the create with 400 VALIDATION_FAILED (found via real browser testing - the
  // "Create account" button did nothing but show a rolled-back-save toast).
  const seed = {
    kind: man.kind, firm: man.firm, program: man.program || null, platform: man.platform || null,
    numberMasked: man.number || null, currency: man.currency, startDate: man.start, startingBalance: Number(man.balance) || 0,
    rules, status: existing ? existing.status : 'active'
  };
  if (existing) seed.id = existing.id;
  return store.createDraft(seed);
}

// Exported (not just used internally) so Calculator/Trade Log can mount the exact same real
// create-account form inline for their own "you have zero active accounts" onboarding CTA
// (defect #1) - never a second, parallel form, and never a fake broker connection.
export function ManualAccountModal({ lang, editing, onClose, onSaved }) {
  const engine = window.TradeJournalAccountsEngine;
  const [man, setMan] = React.useState(() => (editing ? manFromAccount(editing) : defaultManState()));
  const setRule = (bucket, key) => (value) => setMan((m) => ({ ...m, [bucket]: { ...m[bucket], [key]: value } }));
  const valid = String(man.firm || '').trim().length > 0;

  // AI can fill this visible form field-by-field (Journey/A4 process-registry contract, same
  // mechanism tradeCalculatorModal.jsx uses) but this registration deliberately declares no
  // `submit` - only the human clicking "Create account"/"Save changes" below ever calls
  // window.TradeJournalAccountsStore.save(). Per the product brief: "AI can fill a visible form
  // but cannot silently save, archive, delete, bypass risk controls, or claim a rule is
  // satisfied." registry.submit('account-manual-form') is therefore always a safe no-op.
  const mountedRef = React.useRef(true);
  React.useEffect(() => () => { mountedRef.current = false; }, []);
  React.useLayoutEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    const types = window.TradeJournalAccountsTypes || {};
    if (!registry) return undefined;
    registry.register('account-manual-form', {
      allowlist: types.manualAccountPaths || [],
      isOpen: () => mountedRef.current,
      applyValue: (path, value) => {
        if (path === 'kind') { setMan((m) => ({ ...m, kind: value === 'personal' ? 'personal' : 'prop' })); return; }
        if (path.indexOf('rules.') === 0) {
          const key = path.slice('rules.'.length);
          setMan((m) => ({ ...m, [m.kind]: { ...m[m.kind], [key]: value } }));
          return;
        }
        const fieldMap = { firm: 'firm', program: 'program', platform: 'platform', numberMasked: 'number', currency: 'currency', startDate: 'start', startingBalance: 'balance' };
        const field = fieldMap[path];
        if (field) setMan((m) => ({ ...m, [field]: value }));
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = manToAccount(man, editing);
  const previewMetrics = engine.computeMetrics(preview, []);
  const previewRules = engine.evaluateRules(preview, previewMetrics);

  function save() {
    if (!valid) return;
    const store = window.TradeJournalAccountsStore;
    const saved = store.save(manToAccount(man, editing));
    onSaved(saved.id);
  }
  function removeAccount() {
    if (!editing) return;
    window.TradeJournalAccountsStore.remove(editing.id);
    onClose();
  }

  const identityFields = man.kind === 'prop'
    ? [['firm', tr(lang, 'manFirm')], ['program', tr(lang, 'manProgram')], ['platform', tr(lang, 'manPlatform')], ['number', tr(lang, 'manNumber')]]
    : [['firm', tr(lang, 'manFirmPersonal')], ['program', tr(lang, 'manProgramPersonal')], ['platform', tr(lang, 'manPlatform')], ['number', tr(lang, 'manNumber')]];

  const propRuleFields = [['profitTargetPercent', tr(lang, 'manTarget'), '%'], ['dailyLossLimitPercent', tr(lang, 'manDaily'), '%'], ['maxDrawdownPercent', tr(lang, 'manMaxDD'), '%'], ['minTradingDays', tr(lang, 'manMinDays'), 'days'], ['consistencyCapPercent', tr(lang, 'manConsistency'), '%'], ['maxRiskPerTradePercent', tr(lang, 'manMaxRisk') + ' (' + tr(lang, 'manOptional') + ')', '%'], ['maxOpenPositions', tr(lang, 'manMaxOpen') + ' (' + tr(lang, 'manOptional') + ')', '']];
  const personalRuleFields = [['dailyLossCap', tr(lang, 'manDailyCap'), man.currency], ['maxRiskPerTradePercent', tr(lang, 'manMaxRisk'), '%'], ['monthlyGoalPercent', tr(lang, 'manGoal'), '%'], ['maxOpenPositions', tr(lang, 'manMaxOpen'), '']];
  const types = window.TradeJournalAccountsTypes || {};
  const tzOptions = (types.commonTimezones || ['UTC']).map((z) => ({ value: z, label: z }));
  const basisOptions = [{ value: 'realized', label: tr(lang, 'manBasisRealized') }, { value: 'realized_and_open', label: tr(lang, 'manBasisRealizedOpen') }];

  return (
    <Modal open title={editing ? tr(lang, 'manEditTitle') : tr(lang, 'manCreateTitle')} icon="edit" onClose={onClose} width={1080}
      footer={(
        <>
          <span style={{ flex: 1 }} />
          {editing && <Button variant="danger" onClick={removeAccount}>{tr(lang, 'manRemove')}</Button>}
          <Button variant="secondary" onClick={onClose}>{tr(lang, 'manCancel')}</Button>
          <Button variant="primary" icon="check" onClick={save} disabled={!valid}>{tr(lang, editing ? 'manSaveEdit' : 'manSave')}</Button>
        </>
      )}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, 'manKindLabel')}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
              {[['prop', 'manKindProp', 'manKindPropDesc', 'honour'], ['personal', 'manKindPersonal', 'manKindPersonalDesc', 'wallet']].map(([id, label, desc, icon]) => (
                <button key={id} type="button" onClick={() => setMan((m) => ({ ...m, kind: id }))}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: 14, borderRadius: 10, cursor: 'pointer', textAlign: 'start', border: '1px solid ' + (man.kind === id ? 'var(--char-accent)' : 'var(--divider-gold)'), background: man.kind === id ? 'var(--char-active-surface)' : 'rgba(3,8,7,.5)' }}>
                  <span style={{ color: man.kind === id ? 'var(--char-accent)' : 'var(--text-muted)' }}><Icon name={icon} size={18} /></span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ font: 'var(--type-username)', color: man.kind === id ? 'var(--char-accent)' : 'var(--text-primary)' }}>{tr(lang, label)}</span>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{tr(lang, desc)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, 'manIdentity')}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
              {identityFields.map(([key, label]) => (
                <TextField key={key} label={label} value={man[key]} onChange={(v) => setMan((m) => ({ ...m, [key]: v }))} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
              <TextField label={tr(lang, 'manStart')} type="date" value={man.start} onChange={(v) => setMan((m) => ({ ...m, start: v }))} />
              <TextField label={tr(lang, 'manBalance')} type="number" value={man.balance} onChange={(v) => setMan((m) => ({ ...m, balance: v }))} placeholder="100000" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{tr(lang, 'manCurrency')}</span>
                <Select value={man.currency} onChange={(v) => setMan((m) => ({ ...m, currency: v }))} options={['USD', 'EUR', 'GBP', 'AUD']} />
              </div>
            </div>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, man.kind === 'prop' ? 'manRulesProp' : 'manRulesPersonal')}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
              {(man.kind === 'prop' ? propRuleFields : personalRuleFields).map(([key, label, unit]) => (
                <TextField key={key} label={label + (unit ? ' (' + unit + ')' : '')} type="number" value={man[man.kind][key] === null || man[man.kind][key] === undefined ? '' : String(man[man.kind][key])} onChange={setRule(man.kind, key)} />
              ))}
            </div>
            {man.kind === 'prop' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, 'manDDType')}</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                  {[['static', 'manDDStatic', 'manDDStaticNote'], ['trailing', 'manDDTrailing', 'manDDTrailingNote']].map(([id, label, note]) => (
                    <button key={id} type="button" onClick={() => setRule('prop', 'drawdownType')(id)}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, padding: '11px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'start', border: '1px solid ' + (man.prop.drawdownType === id ? 'var(--char-accent)' : 'var(--divider-gold)'), background: man.prop.drawdownType === id ? 'var(--char-active-surface)' : 'transparent' }}>
                      <span style={{ font: 'var(--type-body)', color: man.prop.drawdownType === id ? 'var(--char-accent)' : 'var(--text-primary)' }}>{tr(lang, label)}</span>
                      <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{tr(lang, note)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Defect #4: explicit, per-account daily-reset configuration - the engine never
                silently assumes UTC/midnight without this being a real, visible, editable
                choice (default UTC/00:00/realized-only, all three overridable). */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, 'manResetConfig')}</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{tr(lang, 'manResetTimezone')}</span>
                  <Select value={man[man.kind].dailyResetTimezone || 'UTC'} onChange={setRule(man.kind, 'dailyResetTimezone')} options={tzOptions} />
                </div>
                <TextField label={tr(lang, 'manResetHour')} type="number" value={man[man.kind].dailyResetHour === null || man[man.kind].dailyResetHour === undefined ? '0' : String(man[man.kind].dailyResetHour)} onChange={setRule(man.kind, 'dailyResetHour')} hint="0–23" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{tr(lang, 'manLossBasis')}</span>
                  <Select value={man[man.kind].dailyLossBasis || 'realized'} onChange={setRule(man.kind, 'dailyLossBasis')} options={basisOptions} />
                </div>
              </div>
              <span style={{ font: 'var(--type-caption)', color: 'var(--text-disabled)', lineHeight: '16px' }}>{tr(lang, 'manResetConfigNote')}</span>
            </div>

            <Notice tone="info" icon="honour">{tr(lang, 'manNotice')}</Notice>
            {!valid && <Notice tone="danger" icon="close">{tr(lang, 'manFirmRequired')}</Notice>}
          </section>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, 'manPreviewTitle')}</span>
          <AccountCard lang={lang} account={preview} metrics={previewMetrics} ruleResult={previewRules} />
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-disabled)' }}>{tr(lang, 'manPreviewNote')}</span>
        </aside>
      </div>
    </Modal>
  );
}

// ---- Root ----
function AccountsRoot({ character }) {
  const lang = document.documentElement.lang || 'fa';
  const accounts = useAccounts();
  const allTrades = useAllTrades();
  const [view, setView] = React.useState('portfolio');
  const [accountId, setAccountId] = React.useState(null);
  const [tab, setTab] = React.useState('overview');
  const [manualOpen, setManualOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState(null);

  function openAccount(id, initialTab) {
    setAccountId(id); setTab(initialTab || 'overview'); setView('account');
  }
  function openManual(editId) { setEditingId(editId || null); setManualOpen(true); }

  React.useEffect(() => {
    window.TradeJournalNavryaAccountsHub = {
      open: (id, initialTab) => openAccount(id, initialTab),
      createNew: () => { openManual(null); return true; },
      editExisting: (id) => { openManual(id); return true; }
    };
    return () => { delete window.TradeJournalNavryaAccountsHub; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const account = accountId ? accounts.find((a) => a.id === accountId) : null;
  const showAccount = view === 'account' && !!account;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!showAccount ? (
        <PortfolioView lang={lang} accounts={accounts} allTrades={allTrades} onOpenAccount={(id) => openAccount(id)} onCreateManual={() => openManual(null)} />
      ) : (
        <AccountDetail lang={lang} account={account} allTrades={allTrades} tab={tab} setTab={setTab} onBack={() => setView('portfolio')} onEdit={() => openManual(account.id)} />
      )}
      {manualOpen && (
        <ManualAccountModal lang={lang} editing={editingId ? accounts.find((a) => a.id === editingId) : null}
          onClose={() => setManualOpen(false)}
          onSaved={(id) => { setManualOpen(false); openAccount(id); }} />
      )}
    </div>
  );
}

class AccountsBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <pre style={{ color: '#fbb', background: '#200', padding: 16, whiteSpace: 'pre-wrap' }}>{'[accounts] ' + (this.state.error.stack || this.state.error.message)}</pre>;
    return this.props.children;
  }
}

export function renderAccounts(character) {
  const container = document.createElement('div');
  container.className = 'panel-page';
  container.dataset.character = currentNavryaCharacter();
  const lang = document.documentElement.lang || 'fa';
  const rtl = lang === 'fa' || lang === 'ar';
  container.dir = rtl ? 'rtl' : 'ltr';
  container.style.direction = rtl ? 'rtl' : 'ltr';
  const root = createRoot(container);
  container._reactRoot = root;
  root.render(<AccountsBoundary><AccountsRoot character={character} /></AccountsBoundary>);
  return container;
}
