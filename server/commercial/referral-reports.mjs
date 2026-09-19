// Referral read models: the PRIVACY-SAFE customer summary and the admin report. Pure assembly over repository reads - no
// money is decided here.
//
// Privacy contract for everything a referrer can ever read (buildCustomerSummary / toCustomerLedgerDto): counts and the
// referrer's OWN balances only. Never a referred user's id, name, email, purchases, payments, wallet, trades or trading data,
// never an attribution / lot / payment-transaction id, never per-referral rows or timestamps, never program internals (caps,
// budgets, margin parameters, other programs). tests/referral-customer-privacy.test.mjs scans every customer response for that.
import { getReferralPayoutConfig } from './commercial-config.mjs';
import { isPayoutConfigComplete } from './referral-payout-settings.mjs';
import { summarizeLots } from './referral-rules.mjs';
import { resolveReferralTerms, toCustomerTermsDto } from './referral-programs.mjs';
import { effectiveCashOutMinimum, toCustomerPayoutDto } from './referral-payouts.mjs';
import { MIN_CONVERSION_MICRO_USD } from './referral-conversion.mjs';

export const SHARE_PATH_PREFIX = '/api/referrals/c/';

// Why cash-out is disabled right now (empty = it can be requested). Ordered so the UI can show the first actionable one.
function cashOutBlockers({ config, user, account, totals, minimumMicroUsd }) {
  const blockers = [];
  if (!config.enabled || !isPayoutConfigComplete(config)) blockers.push('PAYOUT_DISABLED');
  if (!user.emailVerified) blockers.push('EMAIL_NOT_VERIFIED');
  if (config.requiredKycStatus === 'verified' && user.kycStatus !== 'verified') blockers.push('KYC_REQUIRED');
  if (account.payoutBlocked) blockers.push('PAYOUT_BLOCKED');
  if (totals.debtMicroUsd > 0) blockers.push('DEBT_OPEN');
  if (totals.spendableMicroUsd < minimumMicroUsd) blockers.push('BELOW_MINIMUM');
  return blockers;
}

export async function buildCustomerSummary(repo, user) {
  const [config, terms] = await Promise.all([getReferralPayoutConfig(repo), resolveReferralTerms(repo, user.id)]);
  // A code exists for anyone the program applies to (or who already had one); a Disabled user simply has no code to share.
  const existingCode = await repo.referral.getCodeByUser(user.id);
  const code = existingCode || (terms.mode !== 'disabled' ? await repo.referral.ensureCode(user.id) : null);
  const [funnel, summary, account, payouts] = await Promise.all([
    repo.referral.funnelForReferrer(user.id), repo.referralEarnings.summaryForUser(user.id), repo.referral.getAccount(user.id), repo.referralPayouts.listForUser(user.id, { limit: 20 })
  ]);
  const minimumMicroUsd = await effectiveCashOutMinimum(repo, user.id, config);
  const { totals } = summary;
  const blockers = cashOutBlockers({ config, user, account, totals, minimumMicroUsd });
  return {
    enrolled: terms.mode !== 'disabled',
    program: toCustomerTermsDto(terms),
    influencerDisclosure: terms.mode === 'influencer',
    code: code ? { publicCode: code.publicCode, sharePath: SHARE_PATH_PREFIX + code.publicCode, active: code.status === 'active' } : null,
    funnel: { clicks: funnel.clicks, uniqueVisitors: funnel.uniqueVisitors, signups: funnel.signups, qualifiedCustomers: funnel.qualifiedCustomers },
    balances: {
      pendingMicroUsd: totals.pendingMicroUsd, availableCashMicroUsd: totals.availableCashMicroUsd, aiConvertedMicroUsd: totals.aiConvertedMicroUsd,
      payoutReservedMicroUsd: totals.payoutReservedMicroUsd, paidMicroUsd: totals.paidMicroUsd, reversedMicroUsd: totals.reversedMicroUsd,
      debtMicroUsd: totals.debtMicroUsd, spendableMicroUsd: totals.spendableMicroUsd, lifetimeEarnedMicroUsd: totals.lifetimeEarnedMicroUsd
    },
    aiConversion: { minimumMicroUsd: MIN_CONVERSION_MICRO_USD, availableMicroUsd: totals.spendableMicroUsd },
    cashOut: {
      enabled: blockers.length === 0, blockers, minimumMicroUsd, requiredKycStatus: config.requiredKycStatus, kycStatus: user.kycStatus, emailVerified: Boolean(user.emailVerified),
      termsVersion: config.termsVersion, reauthMaxAgeMinutes: config.reauthMaxAgeMinutes
    },
    payouts: payouts.map(toCustomerPayoutDto)
  };
}

export function toCustomerLedgerDto(entries) {
  return entries.map((entry) => ({ id: entry.id, type: entry.entryType, state: entry.state, amountMicroUsd: entry.amountMicroUsd, createdAt: entry.createdAt }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Admin report
// ---------------------------------------------------------------------------------------------------------------------
const outstanding = (debt) => (debt.status === 'open' || debt.status === 'recovering' ? debt.amountMicroUsd - debt.recoveredMicroUsd : 0);
const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);

// clicks, signups, qualified customers, pending / available liability, converted AI credit, reserved payout value, paid value,
// reversals, budget remaining, net revenue, expected costs, actual costs where available, and the post-commission
// contribution margin. `actualCostsMicroUsd` is the subscription wallet bonus users actually CONSUMED on AI (real cost) for the
// referred payments in range - "where available": there is no per-payment gateway/service cost ledger to read.
export async function buildAdminReport(repo, { from, to, programId } = {}) {
  const raw = await repo.referralReports.rawForReport({ from, to, programId });
  const totals = summarizeLots(raw.lots, { openDebtMicroUsd: sum(raw.debts, outstanding), now: Date.now() });
  const activeLots = raw.lots.filter((lot) => lot.reversedMicroUsd < lot.originalMicroUsd);
  const netRevenueMicroUsd = sum(activeLots, (lot) => lot.commissionableBaseMicroUsd);
  const expectedCostsMicroUsd = sum(activeLots, (lot) => {
    const guard = (lot.snapshot && lot.snapshot.math && lot.snapshot.math.guard) || {};
    return (guard.paymentFeeMicroUsd || 0) + (guard.serviceCostMicroUsd || 0);
  });
  const commissionsNetMicroUsd = sum(raw.lots, (lot) => lot.originalMicroUsd - lot.reversedMicroUsd);
  const transactionIds = raw.lots.map((lot) => lot.paymentTransactionId).filter(Boolean);
  const bonusLots = transactionIds.length && repo.subscriptionBonus ? await repo.subscriptionBonus.listByTransactionIds(transactionIds) : [];
  const actualCostsMicroUsd = sum(bonusLots, (lot) => lot.consumedMicroUsd);

  const byProgram = [];
  for (const program of raw.programs.filter((p) => !programId || p.id === programId)) {
    const [used, published] = await Promise.all([repo.referralReports.programBudgetUsed(program.id), repo.referralPrograms.getPublishedVersion(program.id)]);
    const cap = published ? published.programBudgetCapMicroUsd : null;
    const programLots = raw.lots.filter((lot) => lot.programId === program.id);
    byProgram.push({
      programId: program.id, name: program.name, kind: program.kind, status: program.status, signups: raw.attributions.filter((a) => a.programId === program.id).length,
      commissionsNetMicroUsd: sum(programLots, (lot) => lot.originalMicroUsd - lot.reversedMicroUsd), budgetUsedMicroUsd: used, budgetCapMicroUsd: cap,
      budgetRemainingMicroUsd: cap == null ? null : Math.max(0, cap - used)
    });
  }
  const skipped = raw.outcomes.filter((o) => o.outcome === 'skipped');
  const skippedByReason = {};
  for (const outcome of skipped) skippedByReason[outcome.reason || 'UNKNOWN'] = (skippedByReason[outcome.reason || 'UNKNOWN'] || 0) + 1;
  return {
    range: { from: from || null, to: to || null, programId: programId || null },
    funnel: {
      clicks: sum(raw.clicks, (c) => c.clickCount), uniqueVisitors: new Set(raw.clicks.map((c) => c.visitorHash)).size, signups: raw.attributions.length,
      flaggedSignups: raw.attributions.filter((a) => a.riskReviewStatus === 'flagged').length,
      qualifiedCustomers: new Set(activeLots.map((lot) => lot.attributionId)).size
    },
    liability: {
      pendingMicroUsd: totals.pendingMicroUsd, availableMicroUsd: totals.availableCashMicroUsd, convertedAiCreditMicroUsd: totals.aiConvertedMicroUsd,
      reservedPayoutMicroUsd: totals.payoutReservedMicroUsd, paidMicroUsd: totals.paidMicroUsd, reversedMicroUsd: totals.reversedMicroUsd, openDebtMicroUsd: totals.debtMicroUsd
    },
    economics: {
      netRevenueMicroUsd, expectedCostsMicroUsd, actualCostsMicroUsd, commissionsNetMicroUsd,
      postCommissionContributionMarginMicroUsd: netRevenueMicroUsd - expectedCostsMicroUsd - commissionsNetMicroUsd,
      actualCostsNote: 'Actual cost = subscription wallet bonus consumed by AI usage for the referred payments in range; no per-payment gateway or service cost ledger exists.'
    },
    payouts: {
      requested: raw.payouts.filter((p) => p.status === 'requested').length, inReview: raw.payouts.filter((p) => ['under_review', 'approved', 'submitted', 'confirmed'].includes(p.status)).length,
      paid: raw.payouts.filter((p) => p.status === 'paid').length, rejectedOrCancelled: raw.payouts.filter((p) => ['rejected', 'cancelled', 'failed'].includes(p.status)).length
    },
    skippedEarnings: { total: skipped.length, byReason: skippedByReason },
    byProgram,
    conversions: { count: raw.conversions.length, amountMicroUsd: sum(raw.conversions, (c) => c.amountMicroUsd) }
  };
}
