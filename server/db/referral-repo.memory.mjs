// In-memory implementation of the Referral & Affiliate repository domains (068-070). Mirrors
// server/db/referral-repo.pg.mjs method-for-method - same names, same arguments, same result shapes -
// and imports the SAME pure rules (server/commercial/referral-rules.mjs) for every number (earning
// decision, reversal plan, FIFO allocation, balances), so the two backends can only differ in HOW they
// lock and persist, never in what the money is. tests/referral-migration-contract.test.mjs asserts the
// method surfaces stay identical.
//
// Atomicity: repo.pg.mjs serialises with row locks (see the LOCK ORDER in 069_referral_attribution_
// earnings.sql). JavaScript is single-threaded here, so the equivalent guarantee is that every
// read-check-write below is ONE synchronous block with no `await` between the check and the write -
// the same convention repo.memory.mjs already uses for wallet.settle() and subscriptionBonus.
//
// Wired in from createMemoryRepo() (one line): it shares the repo's own `state` so cross-domain reads
// (users, payment transactions, crypto invoices, auth sessions) and the wallet credit for an AI
// conversion touch the same maps every other domain uses.
import { randomBytes } from 'node:crypto';
import { newId } from './id.mjs';
import { ApiError } from '../community/errors.mjs';
import {
  PROGRAM_KINDS, rulesHashOf, decideEarning, summarizeLots, planReversal, lotRemainingMicroUsd, lotIsMatured,
  allocateFifo, resolveEffectiveMode, isReferrerExplicitlyDisabled, generateReferralCode, assertLegalPayoutTransition,
  PAYOUT_FUNDS_MAY_HAVE_LEFT, PAYOUT_RESERVING_STATES, PAYOUT_PRE_SEND_STATES, deriveLotStatus
} from '../commercial/referral-rules.mjs';

const VERSION_RULE_FIELDS = [
  'commissionBps', 'eligibleSources', 'eligiblePlans', 'eligibleProducts', 'attributionWindowDays', 'holdDays', 'commissionTermDays',
  'cashOutMinimumMicroUsd', 'programBudgetCapMicroUsd', 'perUserCapMicroUsd', 'perCustomerCapMicroUsd', 'campaignCapMicroUsd',
  'maxReferredCustomers', 'minMarginMicroUsd', 'minMarginBps', 'paymentFeeBps', 'serviceCostBps', 'payoutAssetPolicy'
];
const VERSION_DEFAULTS = {
  commissionBps: 0, eligibleSources: ['subscription'], eligiblePlans: null, eligibleProducts: null, attributionWindowDays: 30, holdDays: 14,
  commissionTermDays: null, cashOutMinimumMicroUsd: 10000000, programBudgetCapMicroUsd: null, perUserCapMicroUsd: null,
  perCustomerCapMicroUsd: null, campaignCapMicroUsd: null, maxReferredCustomers: null, minMarginMicroUsd: 0, minMarginBps: 0,
  paymentFeeBps: 0, serviceCostBps: 0, payoutAssetPolicy: 'bep20_usdt'
};
// The only payout-request columns a state transition may set (everything else is immutable, as in the 070 trigger).
const PAYOUT_STAGE_FIELDS = [
  'reviewedBy', 'reviewedAt', 'approvedBy', 'approvedAt', 'submittedBy', 'submittedAt', 'confirmations', 'verification',
  'confirmedAt', 'confirmedBy', 'finalizedBy', 'paidAt', 'rejectionReason', 'failureReason', 'cancelledAt'
];

function invalid(field) { return new ApiError(400, 'VALIDATION_FAILED', null, { field }); }

export function createReferralMemoryDomains({ state, clone, now, wallet }) {
  const store = {
    programs: new Map(), versions: new Map(), assignments: new Map(), codes: new Map(), clicks: new Map(), accounts: new Map(),
    attributions: new Map(), attempts: [], lots: new Map(), outcomes: new Map(), ledger: new Map(), reversals: new Map(),
    debts: new Map(), conversions: new Map(), payouts: new Map(), payoutEvents: [], allocations: []
  };
  let lotSeq = 0;
  let ledgerSeq = 0;
  const ledgerKeys = new Set();
  const all = (map) => Array.from(map.values());

  function requireUser(userId) { if (!state.users.has(userId)) throw new ApiError(404, 'USER_NOT_FOUND'); }
  function activeAssignmentOf(userId) { return all(store.assignments).find((a) => a.userId === userId && a.status === 'active') || null; }
  function publishedVersionOf(programId) { return all(store.versions).find((v) => v.programId === programId && v.status === 'published') || null; }
  function defaultProgramView() {
    const program = all(store.programs).find((p) => p.isPlatformDefault);
    return program ? { ...program, publishedVersion: publishedVersionOf(program.id) } : null;
  }
  function lotsOfUser(userId) { return all(store.lots).filter((lot) => lot.referrerUserId === userId); }
  function outstandingDebt(debt) { return debt.status === 'open' || debt.status === 'recovering' ? debt.amountMicroUsd - debt.recoveredMicroUsd : 0; }
  function openDebtOf(userId) { return all(store.debts).filter((d) => d.userId === userId).reduce((sum, d) => sum + outstandingDebt(d), 0); }
  function accountOf(userId) {
    let account = store.accounts.get(userId);
    if (!account) {
      account = {
        userId, payoutBlocked: false, payoutBlockedReason: null, debtMicroUsd: 0, termsAcceptedVersion: null, termsAcceptedAt: null,
        createdAt: now(), updatedAt: now()
      };
      store.accounts.set(userId, account);
    }
    return account;
  }
  function pushLedger({ userId, lotId, entryType, state: entryState, amountMicroUsd, idempotencyKey, refType, refId, metadata }) {
    if (!(amountMicroUsd > 0)) return null;
    if (ledgerKeys.has(idempotencyKey)) return null;
    ledgerKeys.add(idempotencyKey);
    ledgerSeq += 1;
    const entry = {
      id: newId('refLedger'), seq: ledgerSeq, userId, lotId: lotId || null, entryType, state: entryState, amountMicroUsd,
      idempotencyKey, refType: refType || null, refId: refId || null, metadata: metadata || {}, createdAt: now()
    };
    store.ledger.set(entry.id, entry);
    return entry;
  }
  function publicLot(lot, nowMs = Date.now()) {
    const copy = clone(lot);
    copy.remainingMicroUsd = lotRemainingMicroUsd(lot);
    copy.matured = lotIsMatured(lot, nowMs);
    copy.status = deriveLotStatus(lot, { hasOpenDebt: all(store.debts).some((d) => d.lotId === lot.id && outstandingDebt(d) > 0), now: nowMs });
    return copy;
  }
  // FIFO source list: MATURED lots with free remainder, oldest maturity first, ties by insertion order.
  function fifoLots(userId, nowMs) {
    return lotsOfUser(userId)
      .filter((lot) => lotIsMatured(lot, nowMs) && lotRemainingMicroUsd(lot) > 0)
      .sort((a, b) => Date.parse(a.maturesAt) - Date.parse(b.maturesAt) || a.seq - b.seq)
      .map((lot) => ({ id: lot.id, availableMicroUsd: lotRemainingMicroUsd(lot) }));
  }
  function usageFor(attribution, sourceLotsExcluded) {
    const lots = all(store.lots);
    const net = (lot) => lot.originalMicroUsd - lot.reversedMicroUsd;
    const sum = (predicate) => lots.filter(predicate).reduce((total, lot) => total + net(lot), 0);
    const ofReferrerProgram = lots.filter((lot) => lot.referrerUserId === attribution.referrerUserId && lot.programId === attribution.programId);
    const customersWithEarnings = new Set(ofReferrerProgram.map((lot) => lot.attributionId));
    return {
      programUsedMicroUsd: sum((lot) => lot.programId === attribution.programId),
      campaignUsedMicroUsd: sum((lot) => lot.programVersionId === attribution.programVersionId),
      perUserUsedMicroUsd: sum((lot) => lot.referrerUserId === attribution.referrerUserId && lot.programId === attribution.programId),
      perCustomerUsedMicroUsd: sum((lot) => lot.attributionId === attribution.id),
      partnershipUsedMicroUsd: attribution.assignmentId
        ? sum((lot) => { const a = store.attributions.get(lot.attributionId); return a && a.assignmentId === attribution.assignmentId; })
        : 0,
      qualifiedCustomerCount: customersWithEarnings.size,
      attributionHasEarning: customersWithEarnings.has(attribution.id)
    };
  }

  // ------------------------------------------------------------------------------------------------
  // Programs, immutable versions, partner assignments
  // ------------------------------------------------------------------------------------------------
  const referralPrograms = {
    async createProgram({ kind, name, autoEnrollUnassigned = false, isPlatformDefault = false, createdBy }) {
      if (!PROGRAM_KINDS.includes(kind)) throw invalid('kind');
      const trimmed = String(name || '').trim();
      if (!trimmed || trimmed.length > 80) throw invalid('name');
      if (isPlatformDefault) {
        if (kind !== 'standard') throw invalid('isPlatformDefault');
        if (all(store.programs).some((p) => p.isPlatformDefault)) throw new ApiError(409, 'REFERRAL_DEFAULT_PROGRAM_EXISTS');
      }
      const stamp = now();
      const program = {
        id: newId('refProgram'), kind, name: trimmed, status: 'draft', isPlatformDefault: Boolean(isPlatformDefault),
        autoEnrollUnassigned: Boolean(autoEnrollUnassigned), createdBy: createdBy || null, createdAt: stamp, updatedAt: stamp
      };
      store.programs.set(program.id, program);
      return clone(program);
    },
    async getProgram(id) { const program = store.programs.get(id); return program ? clone(program) : null; },
    async listPrograms() { return all(store.programs).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(clone); },
    // name / autoEnrollUnassigned / status. draft -> active happens ONLY through publishVersion(); archived is terminal.
    async updateProgram(id, patch) {
      const program = store.programs.get(id);
      if (!program) throw new ApiError(404, 'REFERRAL_PROGRAM_NOT_FOUND');
      if (program.status === 'archived') throw new ApiError(409, 'REFERRAL_PROGRAM_ARCHIVED');
      if ('name' in patch) {
        const trimmed = String(patch.name || '').trim();
        if (!trimmed || trimmed.length > 80) throw invalid('name');
        program.name = trimmed;
      }
      if ('autoEnrollUnassigned' in patch) {
        if (typeof patch.autoEnrollUnassigned !== 'boolean') throw invalid('autoEnrollUnassigned');
        program.autoEnrollUnassigned = patch.autoEnrollUnassigned;
      }
      if ('status' in patch) {
        const from = program.status;
        const to = patch.status;
        const legal = (from === 'active' && to === 'paused') || (from === 'paused' && to === 'active') || to === 'archived';
        if (!legal) throw new ApiError(409, 'REFERRAL_PROGRAM_ILLEGAL_TRANSITION', null, { from, to });
        program.status = to;
      }
      program.updatedAt = now();
      return clone(program);
    },
    async listVersions(programId) {
      return all(store.versions).filter((v) => v.programId === programId).sort((a, b) => b.versionNo - a.versionNo).map(clone);
    },
    async getVersion(id) { const version = store.versions.get(id); return version ? clone(version) : null; },
    async getPublishedVersion(programId) { const version = publishedVersionOf(programId); return version ? clone(version) : null; },
    async createDraftVersion(programId, rules, { createdBy } = {}) {
      const program = store.programs.get(programId);
      if (!program) throw new ApiError(404, 'REFERRAL_PROGRAM_NOT_FOUND');
      if (program.status === 'archived') throw new ApiError(409, 'REFERRAL_PROGRAM_ARCHIVED');
      const merged = { ...VERSION_DEFAULTS };
      for (const key of VERSION_RULE_FIELDS) if (rules[key] !== undefined) merged[key] = clone(rules[key]);
      const stamp = now();
      const versionNo = all(store.versions).filter((v) => v.programId === programId).reduce((max, v) => Math.max(max, v.versionNo), 0) + 1;
      const version = {
        id: newId('refVersion'), programId, versionNo, status: 'draft', ...merged,
        effectiveFrom: rules.effectiveFrom || stamp, effectiveTo: rules.effectiveTo || null, rulesHash: rulesHashOf(merged),
        createdBy: createdBy || null, publishedAt: null, publishedBy: null, archivedAt: null, createdAt: stamp, updatedAt: stamp
      };
      store.versions.set(version.id, version);
      return clone(version);
    },
    async updateDraftVersion(versionId, patch) {
      const version = store.versions.get(versionId);
      if (!version) throw new ApiError(404, 'REFERRAL_VERSION_NOT_FOUND');
      if (version.status !== 'draft') throw new ApiError(409, 'REFERRAL_VERSION_NOT_DRAFT');
      const next = { ...version };
      for (const key of [...VERSION_RULE_FIELDS, 'effectiveFrom', 'effectiveTo']) if (patch[key] !== undefined) next[key] = clone(patch[key]);
      if (next.effectiveTo && Date.parse(next.effectiveTo) <= Date.parse(next.effectiveFrom)) throw invalid('effectiveTo');
      next.rulesHash = rulesHashOf(next);
      next.updatedAt = now();
      store.versions.set(versionId, next);
      return clone(next);
    },
    // Atomically supersedes the program's current published version and publishes this draft.
    async publishVersion(versionId, { publishedBy }) {
      const version = store.versions.get(versionId);
      if (!version) throw new ApiError(404, 'REFERRAL_VERSION_NOT_FOUND');
      if (version.status !== 'draft') throw new ApiError(409, 'REFERRAL_VERSION_NOT_DRAFT');
      const program = store.programs.get(version.programId);
      if (program.status === 'archived') throw new ApiError(409, 'REFERRAL_PROGRAM_ARCHIVED');
      const stamp = now();
      const current = publishedVersionOf(version.programId);
      if (current) {
        current.status = 'superseded';
        if (!current.effectiveTo || Date.parse(current.effectiveTo) > Date.parse(stamp)) current.effectiveTo = stamp;
        current.updatedAt = stamp;
      }
      version.status = 'published';
      version.publishedAt = stamp;
      version.publishedBy = publishedBy;
      version.updatedAt = stamp;
      if (program.status === 'draft') { program.status = 'active'; program.updatedAt = stamp; }
      return clone(version);
    },
    async archiveVersion(versionId) {
      const version = store.versions.get(versionId);
      if (!version) throw new ApiError(404, 'REFERRAL_VERSION_NOT_FOUND');
      if (version.status === 'archived') return clone(version);
      if (version.status === 'published') throw new ApiError(409, 'REFERRAL_VERSION_PUBLISHED');
      version.status = 'archived';
      version.archivedAt = now();
      version.updatedAt = now();
      return clone(version);
    },
    async getPlatformDefault() {
      const view = defaultProgramView();
      if (!view) return null;
      const { publishedVersion, ...program } = view;
      return { program: clone(program), publishedVersion: publishedVersion ? clone(publishedVersion) : null };
    },
    async getActiveAssignment(userId) { const a = activeAssignmentOf(userId); return a ? clone(a) : null; },
    async listAssignments(userId) {
      return all(store.assignments).filter((a) => a.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(clone);
    },
    // Edit = supersede + insert. `parsed` is parseAssignmentInput()'s output (stored units).
    async assign(userId, parsed, { createdBy }) {
      requireUser(userId);
      if (parsed.mode === 'influencer') {
        const version = store.versions.get(parsed.programVersionId);
        if (!version || version.status !== 'published') throw invalid('programVersionId');
        const program = store.programs.get(version.programId);
        if (!program || program.kind !== 'influencer' || program.status === 'archived') throw invalid('programVersionId');
        if (parsed.allowedSources && !parsed.allowedSources.every((source) => version.eligibleSources.includes(source))) throw invalid('allowedSources');
      }
      const stamp = now();
      const previous = activeAssignmentOf(userId);
      const id = newId('refAssign');
      if (previous) { previous.status = 'superseded'; previous.supersededAt = stamp; previous.supersededByAssignmentId = id; previous.updatedAt = stamp; }
      const row = {
        id, userId, mode: parsed.mode, programVersionId: parsed.programVersionId || null, rateBpsOverride: parsed.rateBpsOverride ?? null,
        effectiveFrom: parsed.effectiveFrom || stamp, effectiveTo: parsed.effectiveTo || null,
        commissionTermDays: parsed.commissionTermDays ?? null, partnershipCapMicroUsd: parsed.partnershipCapMicroUsd ?? null,
        perCustomerCapMicroUsd: parsed.perCustomerCapMicroUsd ?? null, maxReferredCustomers: parsed.maxReferredCustomers ?? null,
        allowedSources: parsed.allowedSources || null, notes: parsed.notes || null, status: 'active', createdBy,
        supersededAt: null, supersededByAssignmentId: null, createdAt: stamp, updatedAt: stamp
      };
      store.assignments.set(id, row);
      return clone(row);
    },
    async revokeAssignment(userId) {
      const previous = activeAssignmentOf(userId);
      if (!previous) return { ok: true, revoked: false };
      previous.status = 'revoked';
      previous.supersededAt = now();
      previous.updatedAt = now();
      return { ok: true, revoked: true };
    }
  };

  // ------------------------------------------------------------------------------------------------
  // Codes, clicks, attribution, account row
  // ------------------------------------------------------------------------------------------------
  const referral = {
    async ensureCode(userId) {
      requireUser(userId);
      const existing = all(store.codes).find((c) => c.userId === userId);
      if (existing) return clone(existing);
      for (let attempt = 0; attempt < 10; attempt++) {
        const publicCode = generateReferralCode(randomBytes);
        if (all(store.codes).some((c) => c.publicCode === publicCode)) continue;
        const row = { id: newId('refCode'), userId, publicCode, status: 'active', createdAt: now() };
        store.codes.set(row.id, row);
        return clone(row);
      }
      throw new ApiError(503, 'REFERRAL_CODE_GENERATION_FAILED');
    },
    async getCodeByUser(userId) { const c = all(store.codes).find((code) => code.userId === userId); return c ? clone(c) : null; },
    async getCodeByPublicCode(publicCode) { const c = all(store.codes).find((code) => code.publicCode === publicCode); return c ? clone(c) : null; },
    async getCode(id) { const c = store.codes.get(id); return c ? clone(c) : null; },
    async setCodeStatus(userId, status) {
      const code = all(store.codes).find((c) => c.userId === userId);
      if (!code) return null;
      code.status = status;
      return clone(code);
    },
    async recordClick({ codeId, visitorHash }) {
      const day = now().slice(0, 10);
      const key = codeId + '|' + day + '|' + visitorHash;
      const existing = store.clicks.get(key);
      if (existing) existing.clickCount += 1;
      else store.clicks.set(key, { codeId, day, visitorHash, clickCount: 1, firstSeenAt: now() });
      return { ok: true };
    },
    async clickStats(codeId) {
      const rows = all(store.clicks).filter((c) => c.codeId === codeId);
      return { clicks: rows.reduce((sum, r) => sum + r.clickCount, 0), uniqueVisitors: new Set(rows.map((r) => r.visitorHash)).size };
    },
    // Aggregates only - never an identity (the customer-facing "anonymized funnel").
    async funnelForReferrer(referrerUserId) {
      const code = all(store.codes).find((c) => c.userId === referrerUserId);
      const stats = code ? await referral.clickStats(code.id) : { clicks: 0, uniqueVisitors: 0 };
      const attributions = all(store.attributions).filter((a) => a.referrerUserId === referrerUserId);
      const qualified = attributions.filter((a) => all(store.lots).some((lot) => lot.attributionId === a.id && lot.reversedMicroUsd < lot.originalMicroUsd)).length;
      return { clicks: stats.clicks, uniqueVisitors: stats.uniqueVisitors, signups: attributions.length, qualifiedCustomers: qualified };
    },
    async claimAttribution(data) {
      if (data.referrerUserId === data.referredUserId) return { ok: false, reason: 'SELF_REFERRAL' };
      if (all(store.attributions).some((a) => a.referredUserId === data.referredUserId)) return { ok: false, reason: 'ALREADY_ATTRIBUTED' };
      const stamp = now();
      const row = {
        id: newId('refAttr'), referredUserId: data.referredUserId, referrerUserId: data.referrerUserId, codeId: data.codeId,
        assignmentId: data.assignmentId || null, programId: data.programId, programVersionId: data.programVersionId, mode: data.mode,
        commissionBps: data.commissionBps, rulesSnapshot: clone(data.rulesSnapshot), assignmentSnapshot: data.assignmentSnapshot ? clone(data.assignmentSnapshot) : null,
        attributedAt: stamp, commissionEndsAt: data.commissionEndsAt || null, status: 'active', voidReason: null, voidedAt: null,
        riskFlags: clone(data.riskFlags || []), riskReviewStatus: data.riskReviewStatus || 'none',
        signupIpHash: data.signupIpHash || null, signupUaHash: data.signupUaHash || null, createdAt: stamp
      };
      store.attributions.set(row.id, row);
      return { ok: true, attribution: clone(row) };
    },
    async logAttempt({ referredUserId, codeId, outcome, reason }) {
      store.attempts.push({ id: newId('refAttempt'), referredUserId, codeId: codeId || null, outcome, reason: reason || null, createdAt: now() });
      return { ok: true };
    },
    async listAttempts({ codeId, limit = 200 } = {}) {
      return store.attempts.filter((a) => !codeId || a.codeId === codeId).slice(-limit).reverse().map(clone);
    },
    async getAttributionByReferred(userId) { const a = all(store.attributions).find((row) => row.referredUserId === userId); return a ? clone(a) : null; },
    async getAttribution(id) { const a = store.attributions.get(id); return a ? clone(a) : null; },
    async listAttributions({ referrerUserId, status, riskReviewStatus, limit = 200, offset = 0 } = {}) {
      return all(store.attributions)
        .filter((a) => (!referrerUserId || a.referrerUserId === referrerUserId) && (!status || a.status === status) && (!riskReviewStatus || a.riskReviewStatus === riskReviewStatus))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(offset, offset + limit).map(clone);
    },
    async voidAttribution(id, { reason }) {
      const attribution = store.attributions.get(id);
      if (!attribution) throw new ApiError(404, 'REFERRAL_ATTRIBUTION_NOT_FOUND');
      if (attribution.status === 'void') return clone(attribution);
      attribution.status = 'void';
      attribution.voidReason = reason || null;
      attribution.voidedAt = now();
      return clone(attribution);
    },
    async setRiskReview(id, { status }) {
      const attribution = store.attributions.get(id);
      if (!attribution) throw new ApiError(404, 'REFERRAL_ATTRIBUTION_NOT_FOUND');
      attribution.riskReviewStatus = status;
      return clone(attribution);
    },
    // Risk SIGNALS only (never a ban): does the new account share a network fingerprint with its referrer, or with
    // other signups of the same referrer?
    async signalsForClaim({ referrerUserId, ipHash, uaHash }) {
      const referrerIpMatch = Boolean(ipHash) && all(state.authSessions).some((s) => s.userId === referrerUserId && s.ipHash === ipHash);
      const duplicateFingerprintCount = ipHash
        ? all(store.attributions).filter((a) => a.referrerUserId === referrerUserId && a.signupIpHash === ipHash && a.signupUaHash === (uaHash || null)).length
        : 0;
      return { referrerIpMatch, duplicateFingerprintCount };
    },
    // "Existing commercial customer": any confirmed, real-money purchase (a refund row or a $0 checkout is not one).
    async userHasConfirmedPayment(userId) {
      return all(state.paymentTransactions).some((t) => t.userId === userId && t.status === 'confirmed' && t.type !== 'refund' && t.amountMicroUsd > 0);
    },
    async getAccount(userId) { requireUser(userId); return clone(accountOf(userId)); },
    async setPayoutBlocked(userId, { blocked, reason }) {
      requireUser(userId);
      const account = accountOf(userId);
      account.payoutBlocked = Boolean(blocked);
      account.payoutBlockedReason = blocked ? (reason || null) : null;
      account.updatedAt = now();
      return clone(account);
    },
    async acceptTerms(userId, version) {
      requireUser(userId);
      const account = accountOf(userId);
      account.termsAcceptedVersion = version;
      account.termsAcceptedAt = now();
      account.updatedAt = now();
      return clone(account);
    }
  };

  // ------------------------------------------------------------------------------------------------
  // Earning lots, append-only ledger, reversals, debt, irreversible AI conversion
  // ------------------------------------------------------------------------------------------------
  // Releases every reservation a payout request holds (reserved -> back to the free remainder), recording the ledger.
  // `reversedLotId`/`reverseBudget` lets a reversal divert part of the reserved amount of ONE lot into `reversed`.
  function releaseRequestReservations(request, { reason, reversedLotId, reverseBudget = 0 }) {
    let toReverse = reverseBudget;
    for (const allocation of store.allocations.filter((a) => a.payoutRequestId === request.id)) {
      const lot = store.lots.get(allocation.lotId);
      const held = allocation.amountMicroUsd;
      lot.payoutReservedMicroUsd -= held;
      let released = held;
      if (lot.id === reversedLotId && toReverse > 0) {
        const take = Math.min(toReverse, held);
        lot.reversedMicroUsd += take;
        toReverse -= take;
        released -= take;
        pushLedger({
          userId: lot.referrerUserId, lotId: lot.id, entryType: 'REVERSE_RESERVED', state: 'reversed', amountMicroUsd: take,
          idempotencyKey: 'reverse-reserved:' + request.id + ':' + lot.id, refType: 'payout_request', refId: request.id, metadata: { reason }
        });
      }
      lot.updatedAt = now();
      pushLedger({
        userId: lot.referrerUserId, lotId: lot.id, entryType: 'RELEASE_PAYOUT', state: 'available_cash', amountMicroUsd: released,
        idempotencyKey: 'release:' + request.id + ':' + lot.id, refType: 'payout_request', refId: request.id, metadata: { reason }
      });
    }
    return toReverse;
  }
  function payoutEvent(request, fromStatus, toStatus, actor, note, metadata) {
    store.payoutEvents.push({
      id: newId('refPayoutEvent'), requestId: request.id, fromStatus: fromStatus || null, toStatus, actorType: actor.type, actorId: actor.id || null,
      note: note || null, metadata: metadata || {}, createdAt: now()
    });
  }

  const referralEarnings = {
    // Idempotent per (source, sourceEventId). The decision (and every cap it reads) happens in ONE synchronous block.
    async recordEarning({ source, sourceEventId, paymentTransactionId, referredUserId, planId, productId, finalAmountMicroUsd, taxMicroUsd, excludedMicroUsd, walletBonusMicroUsd, confirmedAt }) {
      const attributionRow = all(store.attributions).find((a) => a.referredUserId === referredUserId);
      if (!attributionRow) return { ok: true, outcome: 'none', reason: 'NO_ATTRIBUTION' };
      const key = source + '|' + sourceEventId;
      const existing = store.outcomes.get(key);
      if (existing) return { ok: true, duplicate: true, outcome: existing.outcome, reason: existing.reason, lot: existing.lotId ? publicLot(store.lots.get(existing.lotId)) : null };
      const program = store.programs.get(attributionRow.programId);
      const decision = decideEarning({
        source, attribution: attributionRow, referrerMode: isReferrerExplicitlyDisabled(activeAssignmentOf(attributionRow.referrerUserId)) ? 'disabled' : 'enabled',
        programStatus: program ? program.status : 'active', planId, productId, finalAmountMicroUsd, taxMicroUsd, excludedMicroUsd, walletBonusMicroUsd,
        usage: usageFor(attributionRow), confirmedAt: confirmedAt || now()
      });
      const stamp = now();
      let lot = null;
      if (decision.outcome !== 'skipped') {
        lotSeq += 1;
        lot = {
          id: newId('refLot'), seq: lotSeq, referrerUserId: attributionRow.referrerUserId, attributionId: attributionRow.id, programId: attributionRow.programId,
          programVersionId: attributionRow.programVersionId, source, sourceEventId, paymentTransactionId: paymentTransactionId || null,
          commissionableBaseMicroUsd: decision.commissionableBaseMicroUsd, commissionBps: decision.commissionBps, originalMicroUsd: decision.commissionMicroUsd,
          aiConvertedMicroUsd: 0, payoutReservedMicroUsd: 0, paidMicroUsd: 0, reversedMicroUsd: 0, maturesAt: decision.maturesAt,
          snapshot: { rules: clone(attributionRow.rulesSnapshot), math: decision.math, outcome: decision.outcome, reason: decision.reason }, createdAt: stamp, updatedAt: stamp
        };
        store.lots.set(lot.id, lot);
        pushLedger({
          userId: lot.referrerUserId, lotId: lot.id, entryType: 'EARN', state: lotIsMatured(lot, Date.parse(stamp)) ? 'available_cash' : 'pending',
          amountMicroUsd: lot.originalMicroUsd, idempotencyKey: 'earn:' + lot.id, refType: source, refId: sourceEventId, metadata: { outcome: decision.outcome, reason: decision.reason }
        });
      }
      store.outcomes.set(key, {
        id: newId('refOutcome'), source, sourceEventId, attributionId: attributionRow.id, lotId: lot ? lot.id : null,
        outcome: decision.outcome, reason: decision.reason || null, math: clone(decision.math || {}), createdAt: stamp
      });
      return { ok: true, outcome: decision.outcome, reason: decision.reason || null, lot: lot ? publicLot(lot) : null };
    },

    // Refund / chargeback / cancellation. Idempotent per (lot, trigger, triggerRef).
    async reverseEarning({ source, sourceEventId, trigger, triggerRef, commissionAfterMicroUsd }) {
      const lot = all(store.lots).find((l) => l.source === source && l.sourceEventId === sourceEventId);
      if (!lot) return { ok: true, reversed: false, reason: 'NO_LOT' };
      const reversalKey = lot.id + '|' + trigger + '|' + triggerRef;
      if (store.reversals.has(reversalKey)) return { ok: true, reversed: false, duplicate: true, reason: 'ALREADY_REVERSED' };
      const priorRows = all(store.reversals).filter((r) => r.lotId === lot.id);
      const alreadyClawedMicroUsd = priorRows.reduce((sum, r) => sum + r.fromRemainingMicroUsd + r.fromReservedMicroUsd + r.debtMicroUsd, 0);
      // Reserved money is only reversible while its payout request is still pre-send; a reservation held by a
      // submitted/confirmed request may already have left the treasury, so it is left to become debt below.
      const preSendRequests = store.allocations
        .filter((a) => a.lotId === lot.id)
        .map((a) => ({ allocation: a, request: store.payouts.get(a.payoutRequestId) }))
        .filter((x) => x.request && PAYOUT_PRE_SEND_STATES.includes(x.request.status));
      const preSendReserved = preSendRequests.reduce((sum, x) => sum + x.allocation.amountMicroUsd, 0);
      const plan = planReversal({
        originalMicroUsd: lot.originalMicroUsd, remainingMicroUsd: lotRemainingMicroUsd(lot), reservedMicroUsd: Math.min(preSendReserved, lot.payoutReservedMicroUsd),
        alreadyClawedMicroUsd, commissionAfterMicroUsd
      });
      const stamp = now();
      const matured = lotIsMatured(lot, Date.parse(stamp));
      if (plan.fromRemaining > 0) {
        lot.reversedMicroUsd += plan.fromRemaining;
        pushLedger({
          userId: lot.referrerUserId, lotId: lot.id, entryType: matured ? 'REVERSE_AVAILABLE' : 'REVERSE_PENDING', state: 'reversed', amountMicroUsd: plan.fromRemaining,
          idempotencyKey: 'reverse:' + reversalKey + ':remaining', refType: trigger, refId: triggerRef, metadata: {}
        });
      }
      const autoRejectedPayoutIds = [];
      if (plan.fromReserved > 0) {
        let toReverse = plan.fromReserved;
        // Newest request first: reject it (pre-send only), releasing its reservations everywhere; the reversed part goes to `reversed`.
        for (const { request } of [...preSendRequests].sort((a, b) => (a.request.requestedAt < b.request.requestedAt ? 1 : -1))) {
          if (toReverse <= 0) break;
          toReverse = releaseRequestReservations(request, { reason: 'EARNING_REVERSED', reversedLotId: lot.id, reverseBudget: toReverse });
          const from = request.status;
          request.status = 'rejected';
          request.rejectionReason = 'EARNING_REVERSED';
          request.updatedAt = stamp;
          payoutEvent(request, from, 'rejected', { type: 'system' }, 'Auto-rejected: an underlying earning was reversed', { trigger, triggerRef });
          autoRejectedPayoutIds.push(request.id);
        }
      }
      let debtCase = null;
      if (plan.debt > 0) {
        debtCase = {
          id: newId('refDebt'), userId: lot.referrerUserId, lotId: lot.id, trigger, triggerRef, amountMicroUsd: plan.debt, recoveredMicroUsd: 0,
          status: 'open', resolutionNote: null, resolvedBy: null, createdAt: stamp, resolvedAt: null
        };
        store.debts.set(debtCase.id, debtCase);
        const account = accountOf(lot.referrerUserId);
        account.debtMicroUsd += plan.debt;
        account.updatedAt = stamp;
        pushLedger({
          userId: lot.referrerUserId, lotId: lot.id, entryType: 'DEBT_OPENED', state: 'debt', amountMicroUsd: plan.debt,
          idempotencyKey: 'debt:' + reversalKey, refType: trigger, refId: triggerRef, metadata: { debtCaseId: debtCase.id }
        });
      }
      lot.updatedAt = stamp;
      store.reversals.set(reversalKey, {
        id: newId('refReversal'), lotId: lot.id, trigger, triggerRef, commissionAfterMicroUsd, fromRemainingMicroUsd: plan.fromRemaining,
        fromReservedMicroUsd: plan.fromReserved, debtMicroUsd: plan.debt, createdAt: stamp
      });
      return { ok: true, reversed: true, plan, autoRejectedPayoutIds, debtCase: debtCase ? clone(debtCase) : null, lot: publicLot(lot) };
    },

    async lotsForUser(userId) {
      const nowMs = Date.now();
      return lotsOfUser(userId).sort((a, b) => b.seq - a.seq).map((lot) => publicLot(lot, nowMs));
    },
    async getLot(id) { const lot = store.lots.get(id); return lot ? publicLot(lot) : null; },
    async getLotBySource(source, sourceEventId) {
      const lot = all(store.lots).find((l) => l.source === source && l.sourceEventId === sourceEventId);
      return lot ? publicLot(lot) : null;
    },
    async summaryForUser(userId) {
      const openDebtMicroUsd = openDebtOf(userId);
      return { totals: summarizeLots(lotsOfUser(userId), { openDebtMicroUsd, now: Date.now() }), openDebtMicroUsd };
    },
    async ledgerForUser(userId, { limit = 50 } = {}) {
      return all(store.ledger).filter((e) => e.userId === userId).sort((a, b) => b.seq - a.seq).slice(0, limit).map(clone);
    },

    // The wallet credit, the lot allocation, the referral ledger and the conversion record are ONE atomic step. The
    // wallet mutation mirrors wallet.grant() / subscriptionBonus.grant() (repo.memory.mjs) - same maps, same shape.
    async convertToAi({ userId, amountMicroUsd, idempotencyKey }) {
      requireUser(userId);
      if (!Number.isSafeInteger(amountMicroUsd) || amountMicroUsd <= 0) throw invalid('amountMicroUsd');
      await wallet.getAccount(userId); // ensures the account exists; no await after this line
      const prior = all(store.conversions).find((c) => c.userId === userId && c.idempotencyKey === idempotencyKey);
      if (prior) return { ok: true, duplicate: true, conversion: clone(prior), allocations: store.allocations.filter((a) => a.conversionId === prior.id).map(clone) };
      const nowMs = Date.now();
      const spendable = summarizeLots(lotsOfUser(userId), { openDebtMicroUsd: openDebtOf(userId), now: nowMs }).spendableMicroUsd;
      if (amountMicroUsd > spendable) return { ok: false, reason: 'INSUFFICIENT_SPENDABLE', spendableMicroUsd: spendable };
      const { allocations, unallocatedMicroUsd } = allocateFifo(fifoLots(userId, nowMs), amountMicroUsd);
      if (unallocatedMicroUsd > 0) return { ok: false, reason: 'INSUFFICIENT_SPENDABLE', spendableMicroUsd: spendable - unallocatedMicroUsd };
      const conversionId = newId('refConversion');
      const walletKey = 'referral-ai-conversion:' + userId + ':' + idempotencyKey;
      const account = state.walletAccounts.get(userId);
      account.promoBalanceMicroUsd += amountMicroUsd;
      account.updatedAt = now();
      const walletEntry = {
        id: newId('walletLedger'), userId, type: 'REFERRAL_AI_CONVERSION', cashDeltaMicroUsd: 0, promoDeltaMicroUsd: amountMicroUsd,
        providerCostMicroUsd: null, retailChargeMicroUsd: null, markupPercent: null, retailMultiplier: null, provider: null, model: null, feature: null,
        sourceAction: 'referral-ai-conversion', adminUserId: null, idempotencyKey: walletKey, metadata: { conversionId }, createdAt: now()
      };
      state.walletLedger.set(walletEntry.id, walletEntry);
      const conversion = { id: conversionId, userId, amountMicroUsd, idempotencyKey, walletLedgerId: walletEntry.id, createdAt: now() };
      store.conversions.set(conversionId, conversion);
      for (const allocation of allocations) {
        const lot = store.lots.get(allocation.lotId);
        lot.aiConvertedMicroUsd += allocation.amountMicroUsd;
        lot.updatedAt = now();
        store.allocations.push({ id: newId('refAlloc'), lotId: lot.id, userId, kind: 'ai_conversion', conversionId, payoutRequestId: null, amountMicroUsd: allocation.amountMicroUsd, createdAt: now() });
        pushLedger({
          userId, lotId: lot.id, entryType: 'CONVERT_AI', state: 'ai_converted', amountMicroUsd: allocation.amountMicroUsd,
          idempotencyKey: 'convert:' + conversionId + ':' + lot.id, refType: 'ai_conversion', refId: conversionId, metadata: {}
        });
      }
      return { ok: true, conversion: clone(conversion), allocations: allocations.map(clone), walletLedgerEntry: clone(walletEntry) };
    },

    async listDebtCases({ userId, status, limit = 200 } = {}) {
      return all(store.debts).filter((d) => (!userId || d.userId === userId) && (!status || d.status === status))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit).map(clone);
    },
    async getDebtCase(id) { const d = store.debts.get(id); return d ? clone(d) : null; },
    // 'recovering' records a partial recovery; 'resolved' (recovered in full / accepted) and 'written_off' both clear
    // the outstanding obligation. All audited by the caller (admin route).
    async resolveDebtCase(id, { status, note, resolvedBy, recoveredMicroUsd = 0 }) {
      const debt = store.debts.get(id);
      if (!debt) throw new ApiError(404, 'REFERRAL_DEBT_NOT_FOUND');
      if (debt.status === 'resolved' || debt.status === 'written_off') return clone(debt);
      const outstanding = debt.amountMicroUsd - debt.recoveredMicroUsd;
      const account = accountOf(debt.userId);
      if (status === 'recovering') {
        if (!Number.isSafeInteger(recoveredMicroUsd) || recoveredMicroUsd <= 0 || recoveredMicroUsd >= outstanding) throw invalid('recoveredMicroUsd');
        debt.recoveredMicroUsd += recoveredMicroUsd;
        debt.status = 'recovering';
        account.debtMicroUsd -= recoveredMicroUsd;
      } else if (status === 'resolved' || status === 'written_off') {
        if (status === 'resolved') debt.recoveredMicroUsd = debt.amountMicroUsd;
        debt.status = status;
        debt.resolvedAt = now();
        debt.resolvedBy = resolvedBy || null;
        account.debtMicroUsd -= outstanding;
        pushLedger({
          userId: debt.userId, lotId: debt.lotId, entryType: 'DEBT_RESOLVED', state: 'debt', amountMicroUsd: outstanding,
          idempotencyKey: 'debt-resolved:' + debt.id, refType: 'debt_case', refId: debt.id, metadata: { status }
        });
      } else throw invalid('status');
      if (note !== undefined) debt.resolutionNote = String(note || '').slice(0, 1000) || null;
      account.updatedAt = now();
      return clone(debt);
    },
    async getOutcome(source, sourceEventId) { const o = store.outcomes.get(source + '|' + sourceEventId); return o ? clone(o) : null; },
    async listOutcomes({ limit = 200 } = {}) { return all(store.outcomes).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit).map(clone); },
    // Confirmed real purchases by attributed users that produced NO outcome - the recovery list for the admin reprocess action.
    async findUnprocessedQualifyingPayments({ limit = 100 } = {}) {
      const attributed = new Set(all(store.attributions).map((a) => a.referredUserId));
      const sourceOf = { subscription: 'subscription', storage_purchase: 'storage_purchase' };
      const refunded = new Set(all(state.paymentTransactions).filter((t) => t.type === 'refund' && t.status === 'confirmed' && t.metadata && t.metadata.originalTransactionId).map((t) => t.metadata.originalTransactionId));
      return all(state.paymentTransactions)
        .filter((t) => t.status === 'confirmed' && sourceOf[t.type] && t.amountMicroUsd > 0 && attributed.has(t.userId) && !refunded.has(t.id) && !store.outcomes.has(sourceOf[t.type] + '|' + t.id))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).slice(0, limit).map((t) => ({ transactionId: t.id, type: t.type, userId: t.userId, amountMicroUsd: t.amountMicroUsd, confirmedAt: t.confirmedAt }));
    }
  };

  // ------------------------------------------------------------------------------------------------
  // Payout requests (manual, audited BSC workflow)
  // ------------------------------------------------------------------------------------------------
  const referralPayouts = {
    // Atomic: idempotency, block/debt/threshold re-checks under the lock, FIFO reservation, request + allocations + ledger + event.
    async createRequest(args) {
      requireUser(args.userId);
      const prior = all(store.payouts).find((p) => p.userId === args.userId && p.idempotencyKey === args.idempotencyKey);
      if (prior) return { ok: true, duplicate: true, request: clone(prior), allocations: store.allocations.filter((a) => a.payoutRequestId === prior.id).map(clone) };
      const account = accountOf(args.userId);
      if (account.payoutBlocked) return { ok: false, reason: 'PAYOUT_BLOCKED' };
      if (openDebtOf(args.userId) > 0) return { ok: false, reason: 'DEBT_OPEN' };
      if (args.amountMicroUsd < args.minPayoutMicroUsd) return { ok: false, reason: 'BELOW_MINIMUM', minPayoutMicroUsd: args.minPayoutMicroUsd };
      const nowMs = Date.now();
      const spendable = summarizeLots(lotsOfUser(args.userId), { openDebtMicroUsd: 0, now: nowMs }).spendableMicroUsd;
      if (args.amountMicroUsd > spendable) return { ok: false, reason: 'INSUFFICIENT_SPENDABLE', spendableMicroUsd: spendable };
      const { allocations, unallocatedMicroUsd } = allocateFifo(fifoLots(args.userId, nowMs), args.amountMicroUsd);
      if (unallocatedMicroUsd > 0) return { ok: false, reason: 'INSUFFICIENT_SPENDABLE', spendableMicroUsd: spendable - unallocatedMicroUsd };
      const stamp = now();
      const request = {
        id: newId('refPayout'), userId: args.userId, idempotencyKey: args.idempotencyKey, amountMicroUsd: args.amountMicroUsd,
        assetSymbol: args.asset.symbol, chainId: args.asset.chainId, tokenContract: args.asset.tokenContract, tokenDecimals: args.asset.decimals,
        atomicAmount: args.asset.atomicAmount, treasurySender: args.asset.treasurySender,
        recipientAddressEnc: args.recipient.enc, recipientAddressHash: args.recipient.hash, recipientMasked: args.recipient.masked,
        status: 'requested', policySnapshot: clone(args.policySnapshot), termsVersion: args.termsVersion, acknowledgements: clone(args.acknowledgements),
        kycStatusSnapshot: args.kycStatusSnapshot, emailVerifiedSnapshot: Boolean(args.emailVerifiedSnapshot), reauthAt: args.reauthAt || null,
        requestedAt: stamp, reviewedBy: null, reviewedAt: null, approvedBy: null, approvedAt: null, submittedBy: null, submittedAt: null,
        txHash: null, verification: null, confirmations: null, confirmedAt: null, confirmedBy: null, finalizedBy: null, paidAt: null,
        rejectionReason: null, failureReason: null, cancelledAt: null, createdAt: stamp, updatedAt: stamp
      };
      store.payouts.set(request.id, request);
      for (const allocation of allocations) {
        const lot = store.lots.get(allocation.lotId);
        lot.payoutReservedMicroUsd += allocation.amountMicroUsd;
        lot.updatedAt = stamp;
        store.allocations.push({ id: newId('refAlloc'), lotId: lot.id, userId: args.userId, kind: 'payout_reservation', conversionId: null, payoutRequestId: request.id, amountMicroUsd: allocation.amountMicroUsd, createdAt: stamp });
        pushLedger({
          userId: args.userId, lotId: lot.id, entryType: 'RESERVE_PAYOUT', state: 'payout_reserved', amountMicroUsd: allocation.amountMicroUsd,
          idempotencyKey: 'reserve:' + request.id + ':' + lot.id, refType: 'payout_request', refId: request.id, metadata: {}
        });
      }
      payoutEvent(request, null, 'requested', { type: 'user', id: args.userId }, null, {});
      return { ok: true, request: clone(request), allocations: store.allocations.filter((a) => a.payoutRequestId === request.id).map(clone) };
    },
    async getRequest(id) { const r = store.payouts.get(id); return r ? clone(r) : null; },
    async listForUser(userId, { limit = 50 } = {}) {
      return all(store.payouts).filter((p) => p.userId === userId).sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1)).slice(0, limit).map(clone);
    },
    async listAll({ status, limit = 200, offset = 0 } = {}) {
      return all(store.payouts).filter((p) => !status || p.status === status).sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1)).slice(offset, offset + limit).map(clone);
    },
    async eventsFor(requestId) { return store.payoutEvents.filter((e) => e.requestId === requestId).map(clone); },
    async allocationsFor(requestId) { return store.allocations.filter((a) => a.payoutRequestId === requestId).map(clone); },
    // True when any lot reserved by this request belongs to an attribution still under unresolved risk review.
    async hasFlaggedRisk(requestId) {
      return store.allocations.filter((a) => a.payoutRequestId === requestId).some((a) => {
        const lot = store.lots.get(a.lotId);
        const attribution = lot && store.attributions.get(lot.attributionId);
        return attribution && attribution.riskReviewStatus === 'flagged';
      });
    },
    // The single state-change primitive. The caller (referral-payouts.mjs) has already checked policy (maker-checker,
    // verification); here we re-check the expected state under the lock, the legal-transition table, and apply the
    // reservation side effects (release on rejected/cancelled/failed, reserved -> paid on paid) atomically.
    async transition(id, { expectedFrom, to, actor, note, fields = {} }) {
      const request = store.payouts.get(id);
      if (!request) throw new ApiError(404, 'REFERRAL_PAYOUT_NOT_FOUND');
      if (request.status !== expectedFrom) return { ok: false, reason: 'STATE_CONFLICT', status: request.status };
      assertLegalPayoutTransition(request.status, to);
      const stamp = now();
      if (to === 'rejected' || to === 'cancelled' || to === 'failed') releaseRequestReservations(request, { reason: to });
      if (to === 'paid') {
        for (const allocation of store.allocations.filter((a) => a.payoutRequestId === id)) {
          const lot = store.lots.get(allocation.lotId);
          lot.payoutReservedMicroUsd -= allocation.amountMicroUsd;
          lot.paidMicroUsd += allocation.amountMicroUsd;
          lot.updatedAt = stamp;
          pushLedger({
            userId: lot.referrerUserId, lotId: lot.id, entryType: 'PAYOUT_PAID', state: 'paid', amountMicroUsd: allocation.amountMicroUsd,
            idempotencyKey: 'paid:' + id + ':' + lot.id, refType: 'payout_request', refId: id, metadata: {}
          });
        }
      }
      const from = request.status;
      request.status = to;
      for (const key of PAYOUT_STAGE_FIELDS) if (fields[key] !== undefined) request[key] = clone(fields[key]);
      request.updatedAt = stamp;
      payoutEvent(request, from, to, actor, note, {});
      return { ok: true, request: clone(request) };
    },
    // Enters (approved -> submitted) or replaces (still submitted, not yet verified) the transaction hash. The hash may
    // back at most ONE payout request and can never equal an inbound crypto invoice's hash.
    async setTxHash(id, { txHash, actorId, expectedFrom }) {
      const request = store.payouts.get(id);
      if (!request) throw new ApiError(404, 'REFERRAL_PAYOUT_NOT_FOUND');
      if (request.status !== expectedFrom) return { ok: false, reason: 'STATE_CONFLICT', status: request.status };
      const hash = String(txHash).toLowerCase();
      if (all(store.payouts).some((p) => p.id !== id && p.txHash === hash)) return { ok: false, reason: 'TX_HASH_ALREADY_USED' };
      if (all(state.cryptoInvoices).some((invoice) => invoice.txHash && String(invoice.txHash).toLowerCase() === hash)) return { ok: false, reason: 'TX_HASH_ALREADY_USED' };
      const stamp = now();
      if (request.status === 'approved') {
        request.status = 'submitted';
        request.submittedBy = actorId;
        request.submittedAt = stamp;
        payoutEvent(request, 'approved', 'submitted', { type: 'admin', id: actorId }, 'Transaction hash entered', { txHash: hash });
      } else {
        if (request.verification && request.verification.ok === true) return { ok: false, reason: 'HASH_ALREADY_VERIFIED' };
        payoutEvent(request, 'submitted', 'submitted', { type: 'admin', id: actorId }, 'Transaction hash replaced', { previous: request.txHash, txHash: hash });
        request.verification = null;
        request.confirmations = null;
      }
      request.txHash = hash;
      request.updatedAt = stamp;
      return { ok: true, request: clone(request) };
    },
    async recordVerification(id, { verification, confirmations }) {
      const request = store.payouts.get(id);
      if (!request) throw new ApiError(404, 'REFERRAL_PAYOUT_NOT_FOUND');
      if (!['submitted', 'confirmed'].includes(request.status)) return { ok: false, reason: 'STATE_CONFLICT', status: request.status };
      request.verification = clone(verification);
      request.confirmations = confirmations ?? null;
      request.updatedAt = now();
      return { ok: true, request: clone(request) };
    }
  };

  // ------------------------------------------------------------------------------------------------
  // Reporting inputs - raw rows only; the aggregation itself is the shared pure buildAdminReport().
  // ------------------------------------------------------------------------------------------------
  const referralReports = {
    async rawForReport({ from, to, programId } = {}) {
      const inRange = (iso) => (!from || iso >= from) && (!to || iso < to);
      return {
        programs: all(store.programs).map(clone),
        clicks: all(store.clicks).filter((c) => (!from || c.day >= from.slice(0, 10)) && (!to || c.day <= to.slice(0, 10))).map(clone),
        attributions: all(store.attributions).filter((a) => inRange(a.attributedAt) && (!programId || a.programId === programId)).map(clone),
        lots: all(store.lots).filter((l) => inRange(l.createdAt) && (!programId || l.programId === programId)).map((l) => publicLot(l)),
        outcomes: all(store.outcomes).filter((o) => inRange(o.createdAt)).map(clone),
        debts: all(store.debts).map(clone),
        payouts: all(store.payouts).filter((p) => inRange(p.requestedAt)).map(clone),
        conversions: all(store.conversions).filter((c) => inRange(c.createdAt)).map(clone),
        codes: all(store.codes).map(clone)
      };
    },
    // Program-wide net commission accrued (budget consumed) - shared with the admin program view.
    async programBudgetUsed(programId) {
      return all(store.lots).filter((lot) => lot.programId === programId).reduce((sum, lot) => sum + lot.originalMicroUsd - lot.reversedMicroUsd, 0);
    }
  };

  return { referralPrograms, referral, referralEarnings, referralPayouts, referralReports };
}
