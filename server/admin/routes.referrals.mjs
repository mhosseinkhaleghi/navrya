import express from 'express';
import { ApiError, asyncHandler } from '../community/errors.mjs';
import { rateLimit } from '../community/security/rate-limit.mjs';
import { requireRecentReauth } from './auth-admin.mjs';
import { getEffectiveCommercialConfig, getReferralPayoutConfig, invalidateCommercialConfigCache } from '../commercial/commercial-config.mjs';
import { resolveBscRuntimeConfig } from '../commercial/bsc-config.mjs';
import { parseProgramVersionInput, parseAssignmentInput, MICRO } from '../commercial/referral-rules.mjs';
import { resolveReferralTerms, toAdminProgramDto, toAdminVersionDto, toAdminAssignmentDto, previewForInput } from '../commercial/referral-programs.mjs';
import { buildAdminReport } from '../commercial/referral-reports.mjs';
import { reprocessReferralForTransaction, reverseReferralForTransaction } from '../commercial/referral-earnings.mjs';
import * as payouts from '../commercial/referral-payouts.mjs';
import {
  parseReferralPayoutSettingsInput, assertPayoutSettingsCoherent, storedFormOf, toAdminSettingsDto, mergeReferralPayoutSettings
} from '../commercial/referral-payout-settings.mjs';

// Admin Referral management (Commercial -> Referral Programs). Mounted at /api/admin/commercial/referrals from
// server/admin/routes.commercial.mjs, so it inherits requireAuth + csrfProtection + requireAdmin from the /api/admin mount.
//
// Reads need admin authorization only. EVERY mutation - program / version / assignment / risk / debt / payout action / payout
// settings - requires a RECENT admin re-authentication (requireRecentReauth) and is written to the admin audit log with the
// before/after values, under the action names `referral.<entity>.<verb>`. Financial rules are never edited in place: a published
// version is immutable (a new draft is created, then published), which is what keeps every past attribution and earning
// exactly as it was.
export function router(repo) {
  const app = express.Router();
  const reauth = requireRecentReauth();

  async function audit(req, action, targetType, targetId, details) {
    await repo.auditLog.create({ adminUserId: req.currentUser.id, action, targetType, targetId, details: details || {} });
  }
  const adminId = (req) => req.currentUser.id;
  async function programDto(program) {
    const [versions, used] = await Promise.all([repo.referralPrograms.listVersions(program.id), repo.referralReports.programBudgetUsed(program.id)]);
    return toAdminProgramDto(program, { versions, budgetUsedMicroUsd: used });
  }
  async function requireProgram(id) {
    const program = await repo.referralPrograms.getProgram(id);
    if (!program) throw new ApiError(404, 'REFERRAL_PROGRAM_NOT_FOUND');
    return program;
  }
  async function requireVersionOf(programId, versionId) {
    const version = await repo.referralPrograms.getVersion(versionId);
    if (!version || version.programId !== programId) throw new ApiError(404, 'REFERRAL_VERSION_NOT_FOUND');
    return version;
  }
  const verifyLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, keyFn: (req) => 'referral-admin-verify:' + req.currentUser.id });

  // ------------------------------------------------------------------------------------------------ programs & versions
  app.get('/programs', asyncHandler(async (req, res) => {
    const programs = await repo.referralPrograms.listPrograms();
    res.json({ programs: await Promise.all(programs.map(programDto)) });
  }));
  app.get('/programs/:id', asyncHandler(async (req, res) => {
    res.json(await programDto(await requireProgram(req.params.id)));
  }));

  // Creates the program and, when `rules` is supplied, its first DRAFT version. A program starts as `draft`; publishing its first
  // version activates it. A platform default is always a STANDARD program (validated by the repository and a database CHECK).
  app.post('/programs', reauth, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const program = await repo.referralPrograms.createProgram({
      kind: body.kind, name: body.name, autoEnrollUnassigned: body.autoEnrollUnassigned === true, isPlatformDefault: body.isPlatformDefault === true, createdBy: adminId(req)
    });
    let version = null;
    if (body.rules) version = await repo.referralPrograms.createDraftVersion(program.id, parseProgramVersionInput(body.rules), { createdBy: adminId(req) });
    const dto = await programDto(program);
    await audit(req, 'referral.program.create', 'referralProgram', program.id, { after: { kind: program.kind, name: program.name, isPlatformDefault: program.isPlatformDefault, autoEnrollUnassigned: program.autoEnrollUnassigned }, draftVersionId: version && version.id });
    res.status(201).json(dto);
  }));
  app.patch('/programs/:id', reauth, asyncHandler(async (req, res) => {
    const before = await requireProgram(req.params.id);
    const body = req.body || {};
    const patch = {};
    if ('name' in body) patch.name = body.name;
    if ('autoEnrollUnassigned' in body) patch.autoEnrollUnassigned = body.autoEnrollUnassigned;
    if (!Object.keys(patch).length) throw new ApiError(400, 'VALIDATION_FAILED');
    const after = await repo.referralPrograms.updateProgram(before.id, patch);
    await audit(req, 'referral.program.update', 'referralProgram', before.id, { before: { name: before.name, autoEnrollUnassigned: before.autoEnrollUnassigned }, after: { name: after.name, autoEnrollUnassigned: after.autoEnrollUnassigned } });
    res.json(await programDto(after));
  }));
  for (const [verb, status] of [['pause', 'paused'], ['resume', 'active'], ['archive', 'archived']]) {
    app.post(`/programs/:id/${verb}`, reauth, asyncHandler(async (req, res) => {
      const before = await requireProgram(req.params.id);
      const after = await repo.referralPrograms.updateProgram(before.id, { status });
      await audit(req, `referral.program.${verb}`, 'referralProgram', before.id, { before: { status: before.status }, after: { status: after.status } });
      res.json(await programDto(after));
    }));
  }

  // A new DRAFT version - optionally cloned from an existing version (`cloneFromVersionId`) then overlaid with `rules`.
  app.post('/programs/:id/versions', reauth, asyncHandler(async (req, res) => {
    const program = await requireProgram(req.params.id);
    const body = req.body || {};
    let base = {};
    if (body.cloneFromVersionId) {
      const source = await requireVersionOf(program.id, body.cloneFromVersionId);
      base = {
        commissionBps: source.commissionBps, eligibleSources: source.eligibleSources, eligiblePlans: source.eligiblePlans, eligibleProducts: source.eligibleProducts,
        attributionWindowDays: source.attributionWindowDays, holdDays: source.holdDays, commissionTermDays: source.commissionTermDays,
        cashOutMinimumMicroUsd: source.cashOutMinimumMicroUsd, programBudgetCapMicroUsd: source.programBudgetCapMicroUsd, perUserCapMicroUsd: source.perUserCapMicroUsd,
        perCustomerCapMicroUsd: source.perCustomerCapMicroUsd, campaignCapMicroUsd: source.campaignCapMicroUsd, maxReferredCustomers: source.maxReferredCustomers,
        minMarginMicroUsd: source.minMarginMicroUsd, minMarginBps: source.minMarginBps, paymentFeeBps: source.paymentFeeBps, serviceCostBps: source.serviceCostBps,
        payoutAssetPolicy: source.payoutAssetPolicy
      };
    }
    const overlay = body.rules ? parseProgramVersionInput(body.rules, { partial: Boolean(body.cloneFromVersionId) }) : {};
    const version = await repo.referralPrograms.createDraftVersion(program.id, { ...base, ...overlay }, { createdBy: adminId(req) });
    await audit(req, 'referral.version.create', 'referralProgramVersion', version.id, { programId: program.id, versionNo: version.versionNo, cloneFromVersionId: body.cloneFromVersionId || null });
    res.status(201).json(toAdminVersionDto(version));
  }));
  app.patch('/programs/:id/versions/:versionId', reauth, asyncHandler(async (req, res) => {
    const version = await requireVersionOf(req.params.id, req.params.versionId);
    const patch = parseProgramVersionInput(req.body || {}, { partial: true, existing: version });
    if (!Object.keys(patch).length) throw new ApiError(400, 'VALIDATION_FAILED');
    const updated = await repo.referralPrograms.updateDraftVersion(version.id, patch);
    await audit(req, 'referral.version.update', 'referralProgramVersion', version.id, { before: toAdminVersionDto(version), after: toAdminVersionDto(updated) });
    res.json(toAdminVersionDto(updated));
  }));
  app.post('/programs/:id/versions/:versionId/publish', reauth, asyncHandler(async (req, res) => {
    const version = await requireVersionOf(req.params.id, req.params.versionId);
    const published = await repo.referralPrograms.publishVersion(version.id, { publishedBy: adminId(req) });
    await audit(req, 'referral.version.publish', 'referralProgramVersion', version.id, { programId: version.programId, versionNo: version.versionNo, rulesHash: published.rulesHash, rules: toAdminVersionDto(published) });
    res.json(toAdminVersionDto(published));
  }));
  app.post('/programs/:id/versions/:versionId/archive', reauth, asyncHandler(async (req, res) => {
    const version = await requireVersionOf(req.params.id, req.params.versionId);
    const archived = await repo.referralPrograms.archiveVersion(version.id);
    await audit(req, 'referral.version.archive', 'referralProgramVersion', version.id, { programId: version.programId, versionNo: version.versionNo });
    res.json(toAdminVersionDto(archived));
  }));

  // Profitability preview: pure arithmetic over the plan catalog for a set of rules - persists nothing, so no reauth.
  app.post('/preview', asyncHandler(async (req, res) => { res.json(await previewForInput(repo, req.body)); }));

  // ------------------------------------------------------------------------------------ partner assignments (user detail)
  app.get('/partners/:userId', asyncHandler(async (req, res) => {
    const user = await repo.users.get(req.params.userId);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
    const [active, history, terms, summary, code, account] = await Promise.all([
      repo.referralPrograms.getActiveAssignment(user.id), repo.referralPrograms.listAssignments(user.id), resolveReferralTerms(repo, user.id),
      repo.referralEarnings.summaryForUser(user.id), repo.referral.getCodeByUser(user.id), repo.referral.getAccount(user.id)
    ]);
    const entries = (await repo.auditLog.list({ limit: 500 })).filter((e) => e.targetType === 'referralPartner' && e.targetId === user.id).slice(0, 50);
    res.json({
      userId: user.id, active: active ? toAdminAssignmentDto(active) : null, history: history.map(toAdminAssignmentDto),
      effective: { mode: terms.mode, canAttribute: terms.canAttribute, programId: terms.program ? terms.program.id : null, programName: terms.program ? terms.program.name : null, version: terms.version ? toAdminVersionDto(terms.version) : null, commissionBps: terms.rules ? terms.rules.commissionBps : null },
      code: code ? { publicCode: code.publicCode, status: code.status } : null,
      balances: summary.totals, openDebtMicroUsd: summary.openDebtMicroUsd,
      payoutBlocked: account.payoutBlocked, payoutBlockedReason: account.payoutBlockedReason, audit: entries
    });
  }));
  // Disabled / Standard / Influencer is ONLY ever set here (never by the user). An edit supersedes the previous assignment.
  app.put('/partners/:userId', reauth, asyncHandler(async (req, res) => {
    const user = await repo.users.get(req.params.userId);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
    const parsed = parseAssignmentInput(req.body || {});
    const before = await repo.referralPrograms.getActiveAssignment(user.id);
    const assignment = await repo.referralPrograms.assign(user.id, parsed, { createdBy: adminId(req) });
    await audit(req, 'referral.assignment.set', 'referralPartner', user.id, { before: before ? toAdminAssignmentDto(before) : null, after: toAdminAssignmentDto(assignment) });
    res.json({ assignment: toAdminAssignmentDto(assignment), effective: { mode: (await resolveReferralTerms(repo, user.id)).mode } });
  }));
  app.delete('/partners/:userId', reauth, asyncHandler(async (req, res) => {
    const before = await repo.referralPrograms.getActiveAssignment(req.params.userId);
    const result = await repo.referralPrograms.revokeAssignment(req.params.userId);
    await audit(req, 'referral.assignment.revoke', 'referralPartner', req.params.userId, { before: before ? toAdminAssignmentDto(before) : null });
    res.json(result);
  }));
  app.post('/accounts/:userId/payout-block', reauth, asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (typeof body.blocked !== 'boolean') throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'blocked' });
    const account = await repo.referral.setPayoutBlocked(req.params.userId, { blocked: body.blocked, reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null });
    await audit(req, body.blocked ? 'referral.account.block' : 'referral.account.unblock', 'referralPartner', req.params.userId, { reason: account.payoutBlockedReason });
    res.json(account);
  }));

  // ---------------------------------------------------------------------------------------------- report / risk / recovery
  app.get('/report', asyncHandler(async (req, res) => {
    const iso = (value) => (typeof value === 'string' && value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined);
    res.json(await buildAdminReport(repo, { from: iso(req.query.from), to: iso(req.query.to), programId: typeof req.query.programId === 'string' ? req.query.programId : undefined }));
  }));
  app.get('/attributions', asyncHandler(async (req, res) => {
    const rows = await repo.referral.listAttributions({
      referrerUserId: req.query.referrerUserId || undefined, status: req.query.status || undefined, riskReviewStatus: req.query.riskReviewStatus || undefined, limit: Math.min(200, Number(req.query.limit) || 100)
    });
    // Admin-only view: this is where the IP/device risk flags live. The hashes themselves are never returned.
    res.json({ attributions: rows.map((a) => ({ id: a.id, referrerUserId: a.referrerUserId, referredUserId: a.referredUserId, mode: a.mode, programId: a.programId, commissionBps: a.commissionBps, status: a.status, voidReason: a.voidReason, riskFlags: a.riskFlags, riskReviewStatus: a.riskReviewStatus, attributedAt: a.attributedAt, commissionEndsAt: a.commissionEndsAt })) });
  }));
  app.post('/attributions/:id/void', reauth, asyncHandler(async (req, res) => {
    const reason = typeof (req.body || {}).reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    if (!reason) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'reason' });
    const before = await repo.referral.getAttribution(req.params.id);
    if (!before) throw new ApiError(404, 'REFERRAL_ATTRIBUTION_NOT_FOUND');
    const after = await repo.referral.voidAttribution(before.id, { reason });
    await audit(req, 'referral.attribution.void', 'referralAttribution', before.id, { before: { status: before.status }, after: { status: after.status }, reason });
    res.json({ id: after.id, status: after.status });
  }));
  app.post('/attributions/:id/risk', reauth, asyncHandler(async (req, res) => {
    const status = (req.body || {}).status;
    if (!['cleared', 'confirmed_abuse', 'flagged', 'none'].includes(status)) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'status' });
    const before = await repo.referral.getAttribution(req.params.id);
    if (!before) throw new ApiError(404, 'REFERRAL_ATTRIBUTION_NOT_FOUND');
    const after = await repo.referral.setRiskReview(before.id, { status });
    await audit(req, 'referral.attribution.risk', 'referralAttribution', before.id, { before: { riskReviewStatus: before.riskReviewStatus }, after: { riskReviewStatus: after.riskReviewStatus }, flags: before.riskFlags });
    res.json({ id: after.id, riskReviewStatus: after.riskReviewStatus });
  }));

  app.get('/unprocessed', asyncHandler(async (req, res) => { res.json({ payments: await repo.referralEarnings.findUnprocessedQualifyingPayments({ limit: 200 }) }); }));
  // Recovery for an earning that did not get created when the payment confirmed (idempotent by transaction id).
  app.post('/transactions/:id/reprocess', reauth, asyncHandler(async (req, res) => {
    const result = await reprocessReferralForTransaction(repo, req.params.id);
    if (result.ok === false) throw new ApiError(result.reason === 'PAYMENT_TRANSACTION_NOT_FOUND' ? 404 : 409, result.reason);
    await audit(req, 'referral.earning.reprocess', 'paymentTransaction', req.params.id, { outcome: result.outcome, duplicate: Boolean(result.duplicate) });
    res.json({ outcome: result.outcome, reason: result.reason || null, duplicate: Boolean(result.duplicate) });
  }));
  // A chargeback / cancellation / admin void has no payment-processor webhook today, so an admin records it here; the SAME reversal
  // logic as a refund runs (cancel pending, reverse available, release reserved, debt for converted/paid). Idempotent per reference.
  app.post('/reversals', reauth, asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!['chargeback', 'cancellation', 'admin_void'].includes(body.reason)) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'reason' });
    const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, 120) : '';
    if (!reference) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'reference' });
    const original = await repo.paymentTransactions.get(body.transactionId);
    if (!original) throw new ApiError(404, 'PAYMENT_TRANSACTION_NOT_FOUND');
    const result = await reverseReferralForTransaction(repo, original, { reason: body.reason, triggerRef: reference });
    await audit(req, 'referral.earning.reverse', 'paymentTransaction', original.id, { reason: body.reason, reference, plan: result.plan || null, duplicate: Boolean(result.duplicate) });
    res.json({ reversed: Boolean(result.reversed), duplicate: Boolean(result.duplicate), reason: result.reason || null, plan: result.plan || null, autoRejectedPayoutIds: result.autoRejectedPayoutIds || [] });
  }));
  app.get('/debts', asyncHandler(async (req, res) => { res.json({ debts: await repo.referralEarnings.listDebtCases({ status: req.query.status || undefined, limit: 200 }) }); }));
  app.post('/debts/:id/resolve', reauth, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const before = await repo.referralEarnings.getDebtCase(req.params.id);
    if (!before) throw new ApiError(404, 'REFERRAL_DEBT_NOT_FOUND');
    let recoveredMicroUsd = 0;
    if (body.recoveredUsd !== undefined) {
      if (typeof body.recoveredUsd !== 'number' || !(body.recoveredUsd > 0) || !Number.isFinite(body.recoveredUsd)) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'recoveredUsd' });
      recoveredMicroUsd = Math.round(body.recoveredUsd * MICRO);
    }
    const after = await repo.referralEarnings.resolveDebtCase(before.id, { status: body.status, note: body.note, resolvedBy: adminId(req), recoveredMicroUsd });
    await audit(req, 'referral.debt.resolve', 'referralDebt', before.id, { before: { status: before.status, recoveredMicroUsd: before.recoveredMicroUsd }, after: { status: after.status, recoveredMicroUsd: after.recoveredMicroUsd }, note: body.note || null });
    res.json(after);
  }));

  // -------------------------------------------------------------------------------------------------- payout queue & actions
  async function payoutDetail(id) {
    const request = await repo.referralPayouts.getRequest(id);
    if (!request) throw new ApiError(404, 'REFERRAL_PAYOUT_NOT_FOUND');
    const [events, allocations, flagged] = await Promise.all([repo.referralPayouts.eventsFor(id), repo.referralPayouts.allocationsFor(id), repo.referralPayouts.hasFlaggedRisk(id)]);
    return payouts.toAdminPayoutDto(request, { events, lotCount: allocations.length, hasFlaggedRisk: flagged });
  }
  app.get('/payouts', asyncHandler(async (req, res) => {
    const rows = await repo.referralPayouts.listAll({ status: req.query.status || undefined, limit: Math.min(200, Number(req.query.limit) || 100) });
    res.json({ payouts: rows.map((request) => payouts.toAdminPayoutDto(request)) });
  }));
  app.get('/payouts/:id', asyncHandler(async (req, res) => { res.json(await payoutDetail(req.params.id)); }));
  const step = (path, action, run, extra) => {
    app.post(`/payouts/:id/${path}`, reauth, ...(extra || []), asyncHandler(async (req, res) => {
      const before = await repo.referralPayouts.getRequest(req.params.id);
      if (!before) throw new ApiError(404, 'REFERRAL_PAYOUT_NOT_FOUND');
      const result = await run({ id: before.id, adminId: adminId(req), body: req.body || {} });
      const after = result.request || result;
      await audit(req, `referral.payout.${action}`, 'referralPayout', before.id, { from: before.status, to: after.status, userId: before.userId, amountMicroUsd: before.amountMicroUsd, ...(result.verification ? { verification: { ok: result.verification.ok, reason: result.verification.reason || null, confirmations: result.verification.confirmations ?? null } } : {}) });
      res.json({ ...(await payoutDetail(before.id)), ...(result.verification ? { lastVerification: result.verification } : {}) });
    }));
  };
  step('start-review', 'startReview', ({ id, adminId: by }) => payouts.startReview(repo, { id, adminId: by }));
  step('approve', 'approve', ({ id, adminId: by }) => payouts.approve(repo, { id, adminId: by }));
  step('reject', 'reject', ({ id, adminId: by, body }) => payouts.reject(repo, { id, adminId: by, reason: body.reason }));
  step('submit-hash', 'submitHash', ({ id, adminId: by, body }) => payouts.submitHash(repo, { id, adminId: by, txHash: body.txHash }));
  step('verify', 'verify', ({ id, adminId: by }) => payouts.verify(repo, { id, adminId: by }), [verifyLimiter]);
  step('mark-paid', 'markPaid', ({ id, adminId: by }) => payouts.markPaid(repo, { id, adminId: by }), [verifyLimiter]);
  step('fail', 'markFailed', ({ id, adminId: by, body }) => payouts.markFailed(repo, { id, adminId: by, reason: body.reason }));
  // The only endpoint that ever returns a full recipient address: it needs a recent reauthentication and the READ itself is audited.
  app.post('/payouts/:id/reveal-recipient', reauth, asyncHandler(async (req, res) => {
    const before = await repo.referralPayouts.getRequest(req.params.id);
    if (!before) throw new ApiError(404, 'REFERRAL_PAYOUT_NOT_FOUND');
    await audit(req, 'referral.payout.revealRecipient', 'referralPayout', before.id, { userId: before.userId, status: before.status });
    res.set('Cache-Control', 'no-store').json(await payouts.revealRecipient(repo, { id: before.id }));
  }));

  // ------------------------------------------------------------------------------------------------------ payout settings
  async function settingsDto() {
    const [settings, bsc] = await Promise.all([getReferralPayoutConfig(repo), resolveBscRuntimeConfig(repo)]);
    return toAdminSettingsDto(settings, { rpcConfigured: bsc.rpcConfigured });
  }
  app.get('/payout-config', asyncHandler(async (req, res) => { res.json(await settingsDto()); }));
  app.patch('/payout-config', reauth, asyncHandler(async (req, res) => {
    const before = await getReferralPayoutConfig(repo);
    const patch = parseReferralPayoutSettingsInput(req.body || {}, { partial: true });
    if (!Object.keys(patch).length) throw new ApiError(400, 'VALIDATION_FAILED');
    const merged = { ...before, ...patch };
    assertPayoutSettingsCoherent(merged);
    if (merged.enabled && !(await resolveBscRuntimeConfig(repo)).rpcConfigured) throw new ApiError(409, 'BSC_PROVIDER_NOT_CONFIGURED');
    // Re-validated through the same merge every read uses, then stored as ONE versioned override.
    const stored = storedFormOf(mergeReferralPayoutSettings(storedFormOf(merged)));
    await repo.commercialConfig.publish('referralPayout:settings', stored, { updatedBy: adminId(req), changeSummary: 'Updated referral payout settings' });
    invalidateCommercialConfigCache();
    await getEffectiveCommercialConfig(repo);
    const after = await settingsDto();
    await audit(req, 'referral.payoutConfig.update', 'referralPayoutConfig', 'settings', { before: toAdminSettingsDto(before, { rpcConfigured: after.rpcConfigured }), after });
    res.json(after);
  }));

  return app;
}
