// Referral program orchestration shared by the customer routes, the attribution claim, the payout service and the admin
// routes: effective-terms resolution (Disabled / Standard / Influencer for a user, right now), admin-unit DTOs, and the
// profitability preview. The repositories own persistence and locking; the pure numbers live in referral-rules.mjs.
import { ApiError } from '../community/errors.mjs';
import { getEffectiveCommercialConfig } from './commercial-config.mjs';
import { MICRO, BPS_MAX, computeCommission, applyMarginGuard, resolveEffectiveMode, buildRulesSnapshot, commissionEndsAtFor, parseProgramVersionInput } from './referral-rules.mjs';

// The user's effective referral relationship RIGHT NOW. A user never chooses this - it is derived from the admin-owned
// assignment (or the implicit STANDARD default when the platform default program auto-enrols unassigned users).
//   mode        'disabled' | 'standard' | 'influencer'
//   version     the program version whose rules apply (null when there is none, e.g. no published default yet)
//   rules       buildRulesSnapshot() of that version + the assignment overrides (what a NEW attribution would freeze)
//   canAttribute  true only when a NEW referral could be attributed to this user right now (mode enabled, program active, version published)
export async function resolveReferralTerms(repo, userId) {
  const assignment = await repo.referralPrograms.getActiveAssignment(userId);
  const platformDefault = await repo.referralPrograms.getPlatformDefault();
  const defaultProgram = platformDefault ? { ...platformDefault.program, publishedVersion: platformDefault.publishedVersion } : null;
  const mode = resolveEffectiveMode({ assignment, defaultProgram });
  let program = null;
  let version = null;
  if (mode === 'influencer' && assignment) {
    version = await repo.referralPrograms.getVersion(assignment.programVersionId);
    program = version ? await repo.referralPrograms.getProgram(version.programId) : null;
  } else if (mode === 'standard' && platformDefault) {
    program = platformDefault.program;
    version = platformDefault.publishedVersion;
  }
  const versionUsable = Boolean(version) && (mode === 'influencer' ? true : version.status === 'published');
  const canAttribute = mode !== 'disabled' && Boolean(program) && program.status === 'active' && versionUsable;
  const rules = version && mode !== 'disabled' ? buildRulesSnapshot({ version, assignment, mode }) : null;
  return { mode, assignment, program, version, rules, canAttribute };
}

// Everything a NEW attribution freezes (the claim never re-derives it later).
export function attributionSnapshotFor(terms, { attributedAt }) {
  return {
    mode: terms.mode, programId: terms.program.id, programVersionId: terms.version.id, assignmentId: terms.assignment ? terms.assignment.id : null,
    commissionBps: terms.rules.commissionBps, rulesSnapshot: terms.rules,
    assignmentSnapshot: terms.assignment ? { id: terms.assignment.id, mode: terms.assignment.mode, rateBpsOverride: terms.assignment.rateBpsOverride, notes: null } : null,
    commissionEndsAt: commissionEndsAtFor(attributedAt, terms.rules.commissionTermDays)
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Admin-unit DTOs (USD / percent for humans; the stored units stay integers)
// ---------------------------------------------------------------------------------------------------------------------
const usd = (micro) => (micro == null ? null : micro / MICRO);
const percent = (bps) => (bps == null ? null : bps / 100);

export function toAdminVersionDto(version) {
  return {
    id: version.id, programId: version.programId, versionNo: version.versionNo, status: version.status,
    commissionBps: version.commissionBps, commissionPercent: percent(version.commissionBps),
    eligibleSources: version.eligibleSources, eligiblePlans: version.eligiblePlans, eligibleProducts: version.eligibleProducts,
    attributionWindowDays: version.attributionWindowDays, holdDays: version.holdDays, commissionTermDays: version.commissionTermDays,
    cashOutMinimumUsd: usd(version.cashOutMinimumMicroUsd), programBudgetCapUsd: usd(version.programBudgetCapMicroUsd),
    perUserCapUsd: usd(version.perUserCapMicroUsd), perCustomerCapUsd: usd(version.perCustomerCapMicroUsd), campaignCapUsd: usd(version.campaignCapMicroUsd),
    maxReferredCustomers: version.maxReferredCustomers, minMarginUsd: usd(version.minMarginMicroUsd), minMarginPercent: percent(version.minMarginBps),
    paymentFeePercent: percent(version.paymentFeeBps), serviceCostPercent: percent(version.serviceCostBps), payoutAssetPolicy: version.payoutAssetPolicy,
    effectiveFrom: version.effectiveFrom, effectiveTo: version.effectiveTo, rulesHash: version.rulesHash, publishedAt: version.publishedAt,
    publishedBy: version.publishedBy, createdBy: version.createdBy, createdAt: version.createdAt, updatedAt: version.updatedAt
  };
}
export function toAdminProgramDto(program, { versions = [], budgetUsedMicroUsd = 0 } = {}) {
  const published = versions.find((v) => v.status === 'published') || null;
  return {
    id: program.id, kind: program.kind, name: program.name, status: program.status, isPlatformDefault: program.isPlatformDefault,
    autoEnrollUnassigned: program.autoEnrollUnassigned, createdBy: program.createdBy, createdAt: program.createdAt, updatedAt: program.updatedAt,
    publishedVersionId: published ? published.id : null, versionCount: versions.length, budgetUsedUsd: usd(budgetUsedMicroUsd),
    budgetCapUsd: published ? usd(published.programBudgetCapMicroUsd) : null,
    budgetRemainingUsd: published && published.programBudgetCapMicroUsd != null ? usd(Math.max(0, published.programBudgetCapMicroUsd - budgetUsedMicroUsd)) : null,
    versions: versions.map(toAdminVersionDto)
  };
}
export function toAdminAssignmentDto(assignment) {
  return {
    id: assignment.id, userId: assignment.userId, mode: assignment.mode, programVersionId: assignment.programVersionId, rateBpsOverride: assignment.rateBpsOverride,
    ratePercentOverride: percent(assignment.rateBpsOverride), effectiveFrom: assignment.effectiveFrom, effectiveTo: assignment.effectiveTo,
    commissionTermDays: assignment.commissionTermDays, partnershipCapUsd: usd(assignment.partnershipCapMicroUsd), perCustomerCapUsd: usd(assignment.perCustomerCapMicroUsd),
    maxReferredCustomers: assignment.maxReferredCustomers, allowedSources: assignment.allowedSources, notes: assignment.notes, status: assignment.status,
    createdBy: assignment.createdBy, supersededAt: assignment.supersededAt, createdAt: assignment.createdAt
  };
}

// The ONLY program facts a customer may see: the rate they earn, how long earnings are held, what counts, the cash-out
// minimum and the term - never caps, budgets, margin parameters, other programs or program/version ids.
export function toCustomerTermsDto(terms) {
  if (!terms.rules) return { mode: terms.mode, active: false };
  return {
    mode: terms.mode, active: terms.canAttribute, commissionBps: terms.rules.commissionBps, commissionPercent: percent(terms.rules.commissionBps),
    holdDays: terms.rules.holdDays, commissionTermDays: terms.rules.commissionTermDays, attributionWindowDays: terms.rules.attributionWindowDays,
    eligibleSources: terms.rules.eligibleSources, cashOutMinimumMicroUsd: terms.rules.cashOutMinimumMicroUsd
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Profitability preview: what a draft's rules would pay on each real paid plan and where the margin lands. Pure arithmetic
// over the catalog - never persists anything.
// ---------------------------------------------------------------------------------------------------------------------
export function previewProfitability(rules, samples) {
  return samples.map((sample) => {
    const base = sample.priceMicroUsd;
    const formula = computeCommission({ commissionableBaseMicroUsd: base, commissionBps: rules.commissionBps });
    const guard = applyMarginGuard({
      commissionMicroUsd: formula, netRevenueMicroUsd: base, extraCostMicroUsd: sample.walletBonusMicroUsd || 0,
      paymentFeeBps: rules.paymentFeeBps, serviceCostBps: rules.serviceCostBps, minMarginMicroUsd: rules.minMarginMicroUsd, minMarginBps: rules.minMarginBps
    });
    const commission = guard.grantedMicroUsd;
    const contributionMarginMicroUsd = base - guard.paymentFeeMicroUsd - guard.serviceCostMicroUsd - commission;
    return {
      label: sample.label, priceUsd: usd(base), walletBonusUsd: usd(sample.walletBonusMicroUsd || 0), formulaCommissionUsd: usd(formula), commissionUsd: usd(commission),
      outcome: guard.outcome, paymentFeeUsd: usd(guard.paymentFeeMicroUsd), serviceCostUsd: usd(guard.serviceCostMicroUsd), minMarginUsd: usd(guard.minMarginMicroUsd),
      contributionMarginUsd: usd(contributionMarginMicroUsd), contributionMarginPercent: base > 0 ? Math.round((contributionMarginMicroUsd / base) * 10000) / 100 : 0
    };
  });
}
export async function previewForInput(repo, body) {
  const parsed = parseProgramVersionInput(body || {});
  const config = await getEffectiveCommercialConfig(repo);
  const samples = [];
  for (const [plan, entry] of Object.entries(config.plans)) {
    const priceUsd = entry.price && entry.price.amountUsd;
    if (!(priceUsd > 0)) continue;
    samples.push({ label: entry.displayName || plan, priceMicroUsd: Math.round(priceUsd * MICRO), walletBonusMicroUsd: Math.round((entry.walletBonusUsd || 0) * MICRO) });
  }
  const custom = body && body.customPriceUsd;
  if (custom !== undefined) {
    if (typeof custom !== 'number' || !Number.isFinite(custom) || custom <= 0 || custom > 1000000) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'customPriceUsd' });
    samples.push({ label: 'Custom', priceMicroUsd: Math.round(custom * MICRO), walletBonusMicroUsd: 0 });
  }
  return { rules: toAdminVersionDto({ ...parsed, id: null, programId: null, versionNo: null, status: 'preview', eligiblePlans: parsed.eligiblePlans ?? null, eligibleProducts: parsed.eligibleProducts ?? null }), samples: previewProfitability(parsed, samples) };
}
export { BPS_MAX };
