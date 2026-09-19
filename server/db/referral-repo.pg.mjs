// PostgreSQL implementation of the Referral & Affiliate repository domains (068-070). Mirrors
// server/db/referral-repo.memory.mjs method-for-method (same names, arguments and result shapes) and imports
// the SAME pure rules (server/commercial/referral-rules.mjs) for every number, so the two backends differ only
// in how they lock and persist. tests/helpers/referral-repo-scenarios.mjs runs identical assertions on both.
//
// LOCK ORDER (documented in 069_referral_attribution_earnings.sql - every path below follows it and never the
// reverse, so the flows serialise per user and cannot deadlock):
//   wallet_accounts -> referral_programs -> referral_accounts -> referral_earning_lots (by seq) -> referral_payout_requests
// referral_accounts is the per-user serialisation row: AI conversion and payout reservation both lock it BEFORE
// reading any lot, so two competing spends of the same lot can never both succeed.
//
// Wired in from createPgRepo() (one line) with the pool and the few helpers it shares.
import { randomBytes } from 'node:crypto';
import { ApiError } from '../community/errors.mjs';
import {
  PROGRAM_KINDS, rulesHashOf, decideEarning, summarizeLots, planReversal, lotRemainingMicroUsd, lotIsMatured, allocateFifo,
  isReferrerExplicitlyDisabled, generateReferralCode, assertLegalPayoutTransition, PAYOUT_PRE_SEND_STATES, deriveLotStatus
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
// camelCase -> snake_case column for the version rule fields (also used to build dynamic UPDATEs).
const VERSION_COLUMNS = {
  commissionBps: 'commission_bps', eligibleSources: 'eligible_sources', eligiblePlans: 'eligible_plans', eligibleProducts: 'eligible_products',
  attributionWindowDays: 'attribution_window_days', holdDays: 'hold_days', commissionTermDays: 'commission_term_days',
  cashOutMinimumMicroUsd: 'cash_out_minimum_micro_usd', programBudgetCapMicroUsd: 'program_budget_cap_micro_usd', perUserCapMicroUsd: 'per_user_cap_micro_usd',
  perCustomerCapMicroUsd: 'per_customer_cap_micro_usd', campaignCapMicroUsd: 'campaign_cap_micro_usd', maxReferredCustomers: 'max_referred_customers',
  minMarginMicroUsd: 'min_margin_micro_usd', minMarginBps: 'min_margin_bps', paymentFeeBps: 'payment_fee_bps', serviceCostBps: 'service_cost_bps',
  payoutAssetPolicy: 'payout_asset_policy', effectiveFrom: 'effective_from', effectiveTo: 'effective_to'
};
// The only payout-request columns a state transition may set (everything else is immutable, enforced by the 070 trigger too).
const PAYOUT_STAGE_COLUMNS = {
  reviewedBy: 'reviewed_by', reviewedAt: 'reviewed_at', approvedBy: 'approved_by', approvedAt: 'approved_at', submittedBy: 'submitted_by',
  submittedAt: 'submitted_at', confirmations: 'confirmations', verification: 'verification', confirmedAt: 'confirmed_at', confirmedBy: 'confirmed_by',
  finalizedBy: 'finalized_by', paidAt: 'paid_at', rejectionReason: 'rejection_reason', failureReason: 'failure_reason', cancelledAt: 'cancelled_at'
};

function invalid(field) { return new ApiError(400, 'VALIDATION_FAILED', null, { field }); }
const iso = (value) => (value ? new Date(value).toISOString() : null);
const num = (value) => (value == null ? null : Number(value));

export function createReferralPgDomains({ pool, newId, mapWalletLedgerEntry }) {
  async function withTx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) { /* connection already gone */ }
      throw error;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Row mappers
  // ---------------------------------------------------------------------------------------------------
  const mapProgram = (r) => ({
    id: r.id, kind: r.kind, name: r.name, status: r.status, isPlatformDefault: r.is_platform_default, autoEnrollUnassigned: r.auto_enroll_unassigned,
    createdBy: r.created_by, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at)
  });
  const mapVersion = (r) => ({
    id: r.id, programId: r.program_id, versionNo: r.version_no, status: r.status, commissionBps: r.commission_bps, eligibleSources: r.eligible_sources,
    eligiblePlans: r.eligible_plans, eligibleProducts: r.eligible_products, attributionWindowDays: r.attribution_window_days, holdDays: r.hold_days,
    commissionTermDays: r.commission_term_days, cashOutMinimumMicroUsd: num(r.cash_out_minimum_micro_usd), programBudgetCapMicroUsd: num(r.program_budget_cap_micro_usd),
    perUserCapMicroUsd: num(r.per_user_cap_micro_usd), perCustomerCapMicroUsd: num(r.per_customer_cap_micro_usd), campaignCapMicroUsd: num(r.campaign_cap_micro_usd),
    maxReferredCustomers: r.max_referred_customers, minMarginMicroUsd: num(r.min_margin_micro_usd), minMarginBps: r.min_margin_bps, paymentFeeBps: r.payment_fee_bps,
    serviceCostBps: r.service_cost_bps, payoutAssetPolicy: r.payout_asset_policy, effectiveFrom: iso(r.effective_from), effectiveTo: iso(r.effective_to),
    rulesHash: r.rules_hash, createdBy: r.created_by, publishedAt: iso(r.published_at), publishedBy: r.published_by, archivedAt: iso(r.archived_at),
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at)
  });
  const mapAssignment = (r) => ({
    id: r.id, userId: r.user_id, mode: r.mode, programVersionId: r.program_version_id, rateBpsOverride: r.rate_bps_override, effectiveFrom: iso(r.effective_from),
    effectiveTo: iso(r.effective_to), commissionTermDays: r.commission_term_days, partnershipCapMicroUsd: num(r.partnership_cap_micro_usd),
    perCustomerCapMicroUsd: num(r.per_customer_cap_micro_usd), maxReferredCustomers: r.max_referred_customers, allowedSources: r.allowed_sources, notes: r.notes,
    status: r.status, createdBy: r.created_by, supersededAt: iso(r.superseded_at), supersededByAssignmentId: r.superseded_by_assignment_id,
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at)
  });
  const mapCode = (r) => ({ id: r.id, userId: r.user_id, publicCode: r.public_code, status: r.status, createdAt: iso(r.created_at) });
  const mapAccount = (r) => ({
    userId: r.user_id, payoutBlocked: r.payout_blocked, payoutBlockedReason: r.payout_blocked_reason, debtMicroUsd: num(r.debt_micro_usd),
    termsAcceptedVersion: r.terms_accepted_version, termsAcceptedAt: iso(r.terms_accepted_at), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at)
  });
  const mapAttribution = (r) => ({
    id: r.id, referredUserId: r.referred_user_id, referrerUserId: r.referrer_user_id, codeId: r.code_id, assignmentId: r.assignment_id, programId: r.program_id,
    programVersionId: r.program_version_id, mode: r.mode, commissionBps: r.commission_bps, rulesSnapshot: r.rules_snapshot, assignmentSnapshot: r.assignment_snapshot,
    attributedAt: iso(r.attributed_at), commissionEndsAt: iso(r.commission_ends_at), status: r.status, voidReason: r.void_reason, voidedAt: iso(r.voided_at),
    riskFlags: r.risk_flags, riskReviewStatus: r.risk_review_status, signupIpHash: r.signup_ip_hash, signupUaHash: r.signup_ua_hash, createdAt: iso(r.created_at)
  });
  const mapLotRaw = (r) => ({
    id: r.id, seq: num(r.seq), referrerUserId: r.referrer_user_id, attributionId: r.attribution_id, programId: r.program_id, programVersionId: r.program_version_id,
    source: r.source, sourceEventId: r.source_event_id, paymentTransactionId: r.payment_transaction_id, commissionableBaseMicroUsd: num(r.commissionable_base_micro_usd),
    commissionBps: r.commission_bps, originalMicroUsd: num(r.original_micro_usd), aiConvertedMicroUsd: num(r.ai_converted_micro_usd),
    payoutReservedMicroUsd: num(r.payout_reserved_micro_usd), paidMicroUsd: num(r.paid_micro_usd), reversedMicroUsd: num(r.reversed_micro_usd),
    maturesAt: iso(r.matures_at), snapshot: r.snapshot, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at)
  });
  const mapLot = (r, nowMs = Date.now()) => {
    const lot = mapLotRaw(r);
    lot.remainingMicroUsd = lotRemainingMicroUsd(lot);
    lot.matured = lotIsMatured(lot, nowMs);
    lot.status = deriveLotStatus(lot, { hasOpenDebt: Boolean(r.has_open_debt), now: nowMs });
    return lot;
  };
  const mapLedger = (r) => ({
    id: r.id, seq: num(r.seq), userId: r.user_id, lotId: r.lot_id, entryType: r.entry_type, state: r.state, amountMicroUsd: num(r.amount_micro_usd),
    idempotencyKey: r.idempotency_key, refType: r.ref_type, refId: r.ref_id, metadata: r.metadata, createdAt: iso(r.created_at)
  });
  const mapDebt = (r) => ({
    id: r.id, userId: r.user_id, lotId: r.lot_id, trigger: r.trigger, triggerRef: r.trigger_ref, amountMicroUsd: num(r.amount_micro_usd),
    recoveredMicroUsd: num(r.recovered_micro_usd), status: r.status, resolutionNote: r.resolution_note, resolvedBy: r.resolved_by,
    createdAt: iso(r.created_at), resolvedAt: iso(r.resolved_at)
  });
  const mapOutcome = (r) => ({
    id: r.id, source: r.source, sourceEventId: r.source_event_id, attributionId: r.attribution_id, lotId: r.lot_id, outcome: r.outcome, reason: r.reason,
    math: r.math, createdAt: iso(r.created_at)
  });
  const mapConversion = (r) => ({ id: r.id, userId: r.user_id, amountMicroUsd: num(r.amount_micro_usd), idempotencyKey: r.idempotency_key, walletLedgerId: r.wallet_ledger_id, createdAt: iso(r.created_at) });
  const mapAllocation = (r) => ({
    id: r.id, lotId: r.lot_id, userId: r.user_id, kind: r.kind, conversionId: r.conversion_id, payoutRequestId: r.payout_request_id,
    amountMicroUsd: num(r.amount_micro_usd), createdAt: iso(r.created_at)
  });
  const mapPayout = (r) => ({
    id: r.id, userId: r.user_id, idempotencyKey: r.idempotency_key, amountMicroUsd: num(r.amount_micro_usd), assetSymbol: r.asset_symbol, chainId: r.chain_id,
    tokenContract: r.token_contract, tokenDecimals: r.token_decimals, atomicAmount: r.atomic_amount, treasurySender: r.treasury_sender,
    recipientAddressEnc: r.recipient_address_enc, recipientAddressHash: r.recipient_address_hash, recipientMasked: r.recipient_masked, status: r.status,
    policySnapshot: r.policy_snapshot, termsVersion: r.terms_version, acknowledgements: r.acknowledgements, kycStatusSnapshot: r.kyc_status_snapshot,
    emailVerifiedSnapshot: r.email_verified_snapshot, reauthAt: iso(r.reauth_at), requestedAt: iso(r.requested_at), reviewedBy: r.reviewed_by, reviewedAt: iso(r.reviewed_at),
    approvedBy: r.approved_by, approvedAt: iso(r.approved_at), submittedBy: r.submitted_by, submittedAt: iso(r.submitted_at), txHash: r.tx_hash,
    verification: r.verification, confirmations: r.confirmations, confirmedAt: iso(r.confirmed_at), confirmedBy: r.confirmed_by, finalizedBy: r.finalized_by,
    paidAt: iso(r.paid_at), rejectionReason: r.rejection_reason, failureReason: r.failure_reason, cancelledAt: iso(r.cancelled_at),
    createdAt: iso(r.created_at), updatedAt: iso(r.updated_at)
  });
  const mapPayoutEvent = (r) => ({
    id: r.id, requestId: r.request_id, fromStatus: r.from_status, toStatus: r.to_status, actorType: r.actor_type, actorId: r.actor_id, note: r.note,
    metadata: r.metadata, createdAt: iso(r.created_at)
  });

  const LOT_SELECT = `SELECT l.*, EXISTS (SELECT 1 FROM referral_debt_cases d WHERE d.lot_id = l.id AND d.status IN ('open','recovering')) AS has_open_debt FROM referral_earning_lots l`;

  // ---------------------------------------------------------------------------------------------------
  // Shared transactional helpers (all take a `client` already inside BEGIN)
  // ---------------------------------------------------------------------------------------------------
  async function lockAccount(client, userId) {
    await client.query('INSERT INTO referral_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    const { rows } = await client.query('SELECT * FROM referral_accounts WHERE user_id=$1 FOR UPDATE', [userId]);
    return rows[0];
  }
  async function lockUserLots(client, userId) {
    const { rows } = await client.query(`SELECT l.*, false AS has_open_debt FROM referral_earning_lots l WHERE l.referrer_user_id=$1 ORDER BY l.seq FOR UPDATE`, [userId]);
    return rows.map((r) => mapLot(r));
  }
  async function openDebtOf(client, userId) {
    const { rows } = await client.query(
      `SELECT COALESCE(SUM(amount_micro_usd - recovered_micro_usd),0) AS outstanding FROM referral_debt_cases WHERE user_id=$1 AND status IN ('open','recovering')`, [userId]
    );
    return Number(rows[0].outstanding);
  }
  async function pushLedger(client, { userId, lotId, entryType, state, amountMicroUsd, idempotencyKey, refType, refId, metadata }) {
    if (!(amountMicroUsd > 0)) return null;
    const { rows } = await client.query(
      `INSERT INTO referral_ledger_entries (id, user_id, lot_id, entry_type, state, amount_micro_usd, idempotency_key, ref_type, ref_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
      [newId('refLedger'), userId, lotId || null, entryType, state, amountMicroUsd, idempotencyKey, refType || null, refId || null, JSON.stringify(metadata || {})]
    );
    return rows[0] ? mapLedger(rows[0]) : null;
  }
  async function payoutEvent(client, request, fromStatus, toStatus, actor, note, metadata) {
    await client.query(
      `INSERT INTO referral_payout_events (id, request_id, from_status, to_status, actor_type, actor_id, note, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [newId('refPayoutEvent'), request.id, fromStatus || null, toStatus, actor.type, actor.id || null, note || null, JSON.stringify(metadata || {})]
    );
  }
  // Releases every reservation a payout request holds (reserved -> back to the free remainder). `reverseBudget` lets a
  // reversal divert part of ONE lot's reserved amount into `reversed`. Lots are already locked by the caller.
  async function releaseRequestReservations(client, request, { reason, reversedLotId, reverseBudget = 0 }) {
    let toReverse = reverseBudget;
    const { rows: allocations } = await client.query('SELECT * FROM referral_lot_allocations WHERE payout_request_id=$1 ORDER BY created_at, id', [request.id]);
    for (const allocation of allocations) {
      const held = Number(allocation.amount_micro_usd);
      let released = held;
      let reversedTake = 0;
      if (allocation.lot_id === reversedLotId && toReverse > 0) {
        reversedTake = Math.min(toReverse, held);
        toReverse -= reversedTake;
        released -= reversedTake;
      }
      await client.query(
        'UPDATE referral_earning_lots SET payout_reserved_micro_usd = payout_reserved_micro_usd - $2, reversed_micro_usd = reversed_micro_usd + $3, updated_at=now() WHERE id=$1',
        [allocation.lot_id, held, reversedTake]
      );
      if (reversedTake > 0) {
        await pushLedger(client, {
          userId: allocation.user_id, lotId: allocation.lot_id, entryType: 'REVERSE_RESERVED', state: 'reversed', amountMicroUsd: reversedTake,
          idempotencyKey: 'reverse-reserved:' + request.id + ':' + allocation.lot_id, refType: 'payout_request', refId: request.id, metadata: { reason }
        });
      }
      await pushLedger(client, {
        userId: allocation.user_id, lotId: allocation.lot_id, entryType: 'RELEASE_PAYOUT', state: 'available_cash', amountMicroUsd: released,
        idempotencyKey: 'release:' + request.id + ':' + allocation.lot_id, refType: 'payout_request', refId: request.id, metadata: { reason }
      });
    }
    return toReverse;
  }
  async function activeAssignmentOf(client, userId) {
    const { rows } = await client.query(`SELECT * FROM referral_partner_assignments WHERE user_id=$1 AND status='active'`, [userId]);
    return rows[0] ? mapAssignment(rows[0]) : null;
  }
  async function fifoLots(client, userId, nowMs) {
    const { rows } = await client.query(
      `SELECT id, original_micro_usd - ai_converted_micro_usd - payout_reserved_micro_usd - paid_micro_usd - reversed_micro_usd AS remaining
       FROM referral_earning_lots WHERE referrer_user_id=$1 AND matures_at <= $2 AND
         original_micro_usd - ai_converted_micro_usd - payout_reserved_micro_usd - paid_micro_usd - reversed_micro_usd > 0
       ORDER BY matures_at, seq`, [userId, new Date(nowMs).toISOString()]
    );
    return rows.map((r) => ({ id: r.id, availableMicroUsd: Number(r.remaining) }));
  }

  // ---------------------------------------------------------------------------------------------------
  // Programs, immutable versions, partner assignments
  // ---------------------------------------------------------------------------------------------------
  const referralPrograms = {
    async createProgram({ kind, name, autoEnrollUnassigned = false, isPlatformDefault = false, createdBy }) {
      if (!PROGRAM_KINDS.includes(kind)) throw invalid('kind');
      const trimmed = String(name || '').trim();
      if (!trimmed || trimmed.length > 80) throw invalid('name');
      if (isPlatformDefault && kind !== 'standard') throw invalid('isPlatformDefault');
      try {
        const { rows } = await pool.query(
          `INSERT INTO referral_programs (id, kind, name, is_platform_default, auto_enroll_unassigned, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [newId('refProgram'), kind, trimmed, Boolean(isPlatformDefault), Boolean(autoEnrollUnassigned), createdBy || null]
        );
        return mapProgram(rows[0]);
      } catch (error) {
        if (error && error.code === '23505') throw new ApiError(409, 'REFERRAL_DEFAULT_PROGRAM_EXISTS');
        throw error;
      }
    },
    async getProgram(id) {
      const { rows } = await pool.query('SELECT * FROM referral_programs WHERE id=$1', [id]);
      return rows[0] ? mapProgram(rows[0]) : null;
    },
    async listPrograms() {
      const { rows } = await pool.query('SELECT * FROM referral_programs ORDER BY created_at DESC, id');
      return rows.map(mapProgram);
    },
    async updateProgram(id, patch) {
      return withTx(async (client) => {
        const { rows } = await client.query('SELECT * FROM referral_programs WHERE id=$1 FOR UPDATE', [id]);
        if (!rows[0]) throw new ApiError(404, 'REFERRAL_PROGRAM_NOT_FOUND');
        const program = mapProgram(rows[0]);
        if (program.status === 'archived') throw new ApiError(409, 'REFERRAL_PROGRAM_ARCHIVED');
        let { name, autoEnrollUnassigned, status } = program;
        if ('name' in patch) {
          const trimmed = String(patch.name || '').trim();
          if (!trimmed || trimmed.length > 80) throw invalid('name');
          name = trimmed;
        }
        if ('autoEnrollUnassigned' in patch) {
          if (typeof patch.autoEnrollUnassigned !== 'boolean') throw invalid('autoEnrollUnassigned');
          autoEnrollUnassigned = patch.autoEnrollUnassigned;
        }
        if ('status' in patch) {
          const legal = (status === 'active' && patch.status === 'paused') || (status === 'paused' && patch.status === 'active') || patch.status === 'archived';
          if (!legal) throw new ApiError(409, 'REFERRAL_PROGRAM_ILLEGAL_TRANSITION', null, { from: status, to: patch.status });
          status = patch.status;
        }
        // An archived program gives up the platform-default flag, so a replacement default can be created.
        const { rows: updated } = await client.query(
          `UPDATE referral_programs SET name=$2, auto_enroll_unassigned=$3, status=$4, is_platform_default = CASE WHEN $4 = 'archived' THEN false ELSE is_platform_default END, updated_at=now() WHERE id=$1 RETURNING *`, [id, name, autoEnrollUnassigned, status]
        );
        return mapProgram(updated[0]);
      });
    },
    async listVersions(programId) {
      const { rows } = await pool.query('SELECT * FROM referral_program_versions WHERE program_id=$1 ORDER BY version_no DESC', [programId]);
      return rows.map(mapVersion);
    },
    async getVersion(id) {
      const { rows } = await pool.query('SELECT * FROM referral_program_versions WHERE id=$1', [id]);
      return rows[0] ? mapVersion(rows[0]) : null;
    },
    async getPublishedVersion(programId) {
      const { rows } = await pool.query(`SELECT * FROM referral_program_versions WHERE program_id=$1 AND status='published'`, [programId]);
      return rows[0] ? mapVersion(rows[0]) : null;
    },
    async createDraftVersion(programId, rules, { createdBy } = {}) {
      return withTx(async (client) => {
        const { rows: programRows } = await client.query('SELECT * FROM referral_programs WHERE id=$1 FOR UPDATE', [programId]);
        if (!programRows[0]) throw new ApiError(404, 'REFERRAL_PROGRAM_NOT_FOUND');
        if (programRows[0].status === 'archived') throw new ApiError(409, 'REFERRAL_PROGRAM_ARCHIVED');
        const merged = { ...VERSION_DEFAULTS };
        for (const key of VERSION_RULE_FIELDS) if (rules[key] !== undefined) merged[key] = rules[key];
        const { rows: next } = await client.query('SELECT COALESCE(MAX(version_no),0)+1 AS n FROM referral_program_versions WHERE program_id=$1', [programId]);
        const { rows } = await client.query(
          `INSERT INTO referral_program_versions (id, program_id, version_no, commission_bps, eligible_sources, eligible_plans, eligible_products, attribution_window_days,
             hold_days, commission_term_days, cash_out_minimum_micro_usd, program_budget_cap_micro_usd, per_user_cap_micro_usd, per_customer_cap_micro_usd,
             campaign_cap_micro_usd, max_referred_customers, min_margin_micro_usd, min_margin_bps, payment_fee_bps, service_cost_bps, payout_asset_policy,
             effective_from, effective_to, rules_hash, created_by)
           VALUES ($1,$2,$3,$4,$5::text[],$6::text[],$7::text[],$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,COALESCE($22::timestamptz, now()),$23,$24,$25) RETURNING *`,
          [newId('refVersion'), programId, next[0].n, merged.commissionBps, merged.eligibleSources, merged.eligiblePlans, merged.eligibleProducts, merged.attributionWindowDays,
            merged.holdDays, merged.commissionTermDays, merged.cashOutMinimumMicroUsd, merged.programBudgetCapMicroUsd, merged.perUserCapMicroUsd, merged.perCustomerCapMicroUsd,
            merged.campaignCapMicroUsd, merged.maxReferredCustomers, merged.minMarginMicroUsd, merged.minMarginBps, merged.paymentFeeBps, merged.serviceCostBps, merged.payoutAssetPolicy,
            rules.effectiveFrom || null, rules.effectiveTo || null, rulesHashOf(merged), createdBy || null]
        );
        return mapVersion(rows[0]);
      });
    },
    async updateDraftVersion(versionId, patch) {
      return withTx(async (client) => {
        const { rows } = await client.query('SELECT * FROM referral_program_versions WHERE id=$1 FOR UPDATE', [versionId]);
        if (!rows[0]) throw new ApiError(404, 'REFERRAL_VERSION_NOT_FOUND');
        const version = mapVersion(rows[0]);
        if (version.status !== 'draft') throw new ApiError(409, 'REFERRAL_VERSION_NOT_DRAFT');
        const next = { ...version };
        for (const key of Object.keys(VERSION_COLUMNS)) if (patch[key] !== undefined) next[key] = patch[key];
        if (next.effectiveTo && Date.parse(next.effectiveTo) <= Date.parse(next.effectiveFrom)) throw invalid('effectiveTo');
        next.rulesHash = rulesHashOf(next);
        const keys = Object.keys(VERSION_COLUMNS);
        const sets = keys.map((key, i) => `${VERSION_COLUMNS[key]}=$${i + 2}${['eligibleSources', 'eligiblePlans', 'eligibleProducts'].includes(key) ? '::text[]' : ''}`);
        const { rows: updated } = await client.query(
          `UPDATE referral_program_versions SET ${sets.join(', ')}, rules_hash=$${keys.length + 2}, updated_at=now() WHERE id=$1 RETURNING *`,
          [versionId, ...keys.map((key) => next[key]), next.rulesHash]
        );
        return mapVersion(updated[0]);
      });
    },
    async publishVersion(versionId, { publishedBy }) {
      return withTx(async (client) => {
        const { rows: vrows } = await client.query('SELECT * FROM referral_program_versions WHERE id=$1', [versionId]);
        if (!vrows[0]) throw new ApiError(404, 'REFERRAL_VERSION_NOT_FOUND');
        // Program row first (lock order), then the versions.
        const { rows: prows } = await client.query('SELECT * FROM referral_programs WHERE id=$1 FOR UPDATE', [vrows[0].program_id]);
        const { rows: locked } = await client.query('SELECT * FROM referral_program_versions WHERE id=$1 FOR UPDATE', [versionId]);
        if (locked[0].status !== 'draft') throw new ApiError(409, 'REFERRAL_VERSION_NOT_DRAFT');
        if (prows[0].status === 'archived') throw new ApiError(409, 'REFERRAL_PROGRAM_ARCHIVED');
        // Supersede the current published version FIRST (the partial unique index allows only one published per program).
        await client.query(
          `UPDATE referral_program_versions SET status='superseded', effective_to = LEAST(COALESCE(effective_to, now()), now()), updated_at=now()
           WHERE program_id=$1 AND status='published'`, [locked[0].program_id]
        );
        const { rows } = await client.query(
          `UPDATE referral_program_versions SET status='published', published_at=now(), published_by=$2, updated_at=now() WHERE id=$1 RETURNING *`, [versionId, publishedBy]
        );
        if (prows[0].status === 'draft') await client.query(`UPDATE referral_programs SET status='active', updated_at=now() WHERE id=$1`, [locked[0].program_id]);
        return mapVersion(rows[0]);
      });
    },
    async archiveVersion(versionId) {
      return withTx(async (client) => {
        const { rows } = await client.query('SELECT * FROM referral_program_versions WHERE id=$1 FOR UPDATE', [versionId]);
        if (!rows[0]) throw new ApiError(404, 'REFERRAL_VERSION_NOT_FOUND');
        if (rows[0].status === 'archived') return mapVersion(rows[0]);
        if (rows[0].status === 'published') throw new ApiError(409, 'REFERRAL_VERSION_PUBLISHED');
        const { rows: updated } = await client.query(`UPDATE referral_program_versions SET status='archived', archived_at=now(), updated_at=now() WHERE id=$1 RETURNING *`, [versionId]);
        return mapVersion(updated[0]);
      });
    },
    async getPlatformDefault() {
      const { rows } = await pool.query('SELECT * FROM referral_programs WHERE is_platform_default=true');
      if (!rows[0]) return null;
      const program = mapProgram(rows[0]);
      const published = await referralPrograms.getPublishedVersion(program.id);
      return { program, publishedVersion: published };
    },
    async getActiveAssignment(userId) {
      const { rows } = await pool.query(`SELECT * FROM referral_partner_assignments WHERE user_id=$1 AND status='active'`, [userId]);
      return rows[0] ? mapAssignment(rows[0]) : null;
    },
    async listAssignments(userId) {
      const { rows } = await pool.query('SELECT * FROM referral_partner_assignments WHERE user_id=$1 ORDER BY created_at DESC, id', [userId]);
      return rows.map(mapAssignment);
    },
    async assign(userId, parsed, { createdBy }) {
      return withTx(async (client) => {
        const { rows: users } = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
        if (!users[0]) throw new ApiError(404, 'USER_NOT_FOUND');
        if (parsed.mode === 'influencer') {
          const { rows: versions } = await client.query('SELECT * FROM referral_program_versions WHERE id=$1', [parsed.programVersionId]);
          if (!versions[0] || versions[0].status !== 'published') throw invalid('programVersionId');
          const { rows: programs } = await client.query('SELECT * FROM referral_programs WHERE id=$1', [versions[0].program_id]);
          if (!programs[0] || programs[0].kind !== 'influencer' || programs[0].status === 'archived') throw invalid('programVersionId');
          if (parsed.allowedSources && !parsed.allowedSources.every((source) => versions[0].eligible_sources.includes(source))) throw invalid('allowedSources');
        }
        // Supersede first (the partial unique index allows only one active row), insert the new row, then link the old one.
        const { rows: previous } = await client.query(
          `UPDATE referral_partner_assignments SET status='superseded', superseded_at=now(), updated_at=now() WHERE user_id=$1 AND status='active' RETURNING id`, [userId]
        );
        const id = newId('refAssign');
        const { rows } = await client.query(
          `INSERT INTO referral_partner_assignments (id, user_id, mode, program_version_id, rate_bps_override, effective_from, effective_to, commission_term_days,
             partnership_cap_micro_usd, per_customer_cap_micro_usd, max_referred_customers, allowed_sources, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz, now()),$7,$8,$9,$10,$11,$12::text[],$13,$14) RETURNING *`,
          [id, userId, parsed.mode, parsed.programVersionId || null, parsed.rateBpsOverride ?? null, parsed.effectiveFrom || null, parsed.effectiveTo || null,
            parsed.commissionTermDays ?? null, parsed.partnershipCapMicroUsd ?? null, parsed.perCustomerCapMicroUsd ?? null, parsed.maxReferredCustomers ?? null,
            parsed.allowedSources || null, parsed.notes || null, createdBy]
        );
        if (previous[0]) await client.query('UPDATE referral_partner_assignments SET superseded_by_assignment_id=$2, updated_at=now() WHERE id=$1', [previous[0].id, id]);
        return mapAssignment(rows[0]);
      });
    },
    async revokeAssignment(userId) {
      const { rowCount } = await pool.query(`UPDATE referral_partner_assignments SET status='revoked', superseded_at=now(), updated_at=now() WHERE user_id=$1 AND status='active'`, [userId]);
      return { ok: true, revoked: rowCount > 0 };
    }
  };

  // ---------------------------------------------------------------------------------------------------
  // Codes, clicks, attribution, account row
  // ---------------------------------------------------------------------------------------------------
  const referral = {
    async ensureCode(userId) {
      const existing = await pool.query('SELECT * FROM referral_codes WHERE user_id=$1', [userId]);
      if (existing.rows[0]) return mapCode(existing.rows[0]);
      const { rows: users } = await pool.query('SELECT id FROM users WHERE id=$1', [userId]);
      if (!users[0]) throw new ApiError(404, 'USER_NOT_FOUND');
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const { rows } = await pool.query(
            'INSERT INTO referral_codes (id, user_id, public_code) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING RETURNING *', [newId('refCode'), userId, generateReferralCode(randomBytes)]
          );
          if (rows[0]) return mapCode(rows[0]);
          const raced = await pool.query('SELECT * FROM referral_codes WHERE user_id=$1', [userId]);
          if (raced.rows[0]) return mapCode(raced.rows[0]);
        } catch (error) {
          if (!(error && error.code === '23505')) throw error; // a public_code collision: try another code
        }
      }
      throw new ApiError(503, 'REFERRAL_CODE_GENERATION_FAILED');
    },
    async getCodeByUser(userId) { const { rows } = await pool.query('SELECT * FROM referral_codes WHERE user_id=$1', [userId]); return rows[0] ? mapCode(rows[0]) : null; },
    async getCodeByPublicCode(publicCode) { const { rows } = await pool.query('SELECT * FROM referral_codes WHERE public_code=$1', [publicCode]); return rows[0] ? mapCode(rows[0]) : null; },
    async getCode(id) { const { rows } = await pool.query('SELECT * FROM referral_codes WHERE id=$1', [id]); return rows[0] ? mapCode(rows[0]) : null; },
    async setCodeStatus(userId, status) {
      const { rows } = await pool.query('UPDATE referral_codes SET status=$2 WHERE user_id=$1 RETURNING *', [userId, status]);
      return rows[0] ? mapCode(rows[0]) : null;
    },
    async recordClick({ codeId, visitorHash }) {
      await pool.query(
        `INSERT INTO referral_click_stats (code_id, day, visitor_hash) VALUES ($1, (now() AT TIME ZONE 'UTC')::date, $2)
         ON CONFLICT (code_id, day, visitor_hash) DO UPDATE SET click_count = referral_click_stats.click_count + 1`, [codeId, visitorHash]
      );
      return { ok: true };
    },
    async clickStats(codeId) {
      const { rows } = await pool.query('SELECT COALESCE(SUM(click_count),0) AS clicks, COUNT(DISTINCT visitor_hash) AS visitors FROM referral_click_stats WHERE code_id=$1', [codeId]);
      return { clicks: Number(rows[0].clicks), uniqueVisitors: Number(rows[0].visitors) };
    },
    async funnelForReferrer(referrerUserId) {
      const { rows: codes } = await pool.query('SELECT id FROM referral_codes WHERE user_id=$1', [referrerUserId]);
      const stats = codes[0] ? await referral.clickStats(codes[0].id) : { clicks: 0, uniqueVisitors: 0 };
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS signups,
                COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM referral_earning_lots l WHERE l.attribution_id = a.id AND l.reversed_micro_usd < l.original_micro_usd)) AS qualified
         FROM referral_attributions a WHERE a.referrer_user_id=$1`, [referrerUserId]
      );
      return { clicks: stats.clicks, uniqueVisitors: stats.uniqueVisitors, signups: Number(rows[0].signups), qualifiedCustomers: Number(rows[0].qualified) };
    },
    async claimAttribution(data) {
      if (data.referrerUserId === data.referredUserId) return { ok: false, reason: 'SELF_REFERRAL' };
      try {
        const { rows } = await pool.query(
          `INSERT INTO referral_attributions (id, referred_user_id, referrer_user_id, code_id, assignment_id, program_id, program_version_id, mode, commission_bps,
             rules_snapshot, assignment_snapshot, commission_ends_at, risk_flags, risk_review_status, signup_ip_hash, signup_ua_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [newId('refAttr'), data.referredUserId, data.referrerUserId, data.codeId, data.assignmentId || null, data.programId, data.programVersionId, data.mode, data.commissionBps,
            JSON.stringify(data.rulesSnapshot), data.assignmentSnapshot ? JSON.stringify(data.assignmentSnapshot) : null, data.commissionEndsAt || null,
            JSON.stringify(data.riskFlags || []), data.riskReviewStatus || 'none', data.signupIpHash || null, data.signupUaHash || null]
        );
        return { ok: true, attribution: mapAttribution(rows[0]) };
      } catch (error) {
        if (error && error.code === '23505') return { ok: false, reason: 'ALREADY_ATTRIBUTED' };
        if (error && error.code === '23514') return { ok: false, reason: 'SELF_REFERRAL' };
        throw error;
      }
    },
    async logAttempt({ referredUserId, codeId, outcome, reason }) {
      await pool.query('INSERT INTO referral_attribution_attempts (id, referred_user_id, code_id, outcome, reason) VALUES ($1,$2,$3,$4,$5)', [newId('refAttempt'), referredUserId, codeId || null, outcome, reason || null]);
      return { ok: true };
    },
    async listAttempts({ codeId, limit = 200 } = {}) {
      const { rows } = await pool.query('SELECT * FROM referral_attribution_attempts WHERE ($1::text IS NULL OR code_id=$1) ORDER BY created_at DESC LIMIT $2', [codeId || null, limit]);
      return rows.map((r) => ({ id: r.id, referredUserId: r.referred_user_id, codeId: r.code_id, outcome: r.outcome, reason: r.reason, createdAt: iso(r.created_at) }));
    },
    async getAttributionByReferred(userId) { const { rows } = await pool.query('SELECT * FROM referral_attributions WHERE referred_user_id=$1', [userId]); return rows[0] ? mapAttribution(rows[0]) : null; },
    async getAttribution(id) { const { rows } = await pool.query('SELECT * FROM referral_attributions WHERE id=$1', [id]); return rows[0] ? mapAttribution(rows[0]) : null; },
    async listAttributions({ referrerUserId, status, riskReviewStatus, limit = 200, offset = 0 } = {}) {
      const { rows } = await pool.query(
        `SELECT * FROM referral_attributions WHERE ($1::text IS NULL OR referrer_user_id=$1) AND ($2::text IS NULL OR status=$2) AND ($3::text IS NULL OR risk_review_status=$3)
         ORDER BY created_at DESC, id LIMIT $4 OFFSET $5`, [referrerUserId || null, status || null, riskReviewStatus || null, limit, offset]
      );
      return rows.map(mapAttribution);
    },
    async voidAttribution(id, { reason }) {
      const { rows } = await pool.query(
        `UPDATE referral_attributions SET status='void', void_reason=COALESCE(void_reason,$2), voided_at=COALESCE(voided_at, now()) WHERE id=$1 RETURNING *`, [id, reason || null]
      );
      if (!rows[0]) throw new ApiError(404, 'REFERRAL_ATTRIBUTION_NOT_FOUND');
      return mapAttribution(rows[0]);
    },
    async setRiskReview(id, { status }) {
      const { rows } = await pool.query('UPDATE referral_attributions SET risk_review_status=$2 WHERE id=$1 RETURNING *', [id, status]);
      if (!rows[0]) throw new ApiError(404, 'REFERRAL_ATTRIBUTION_NOT_FOUND');
      return mapAttribution(rows[0]);
    },
    async signalsForClaim({ referrerUserId, ipHash, uaHash }) {
      if (!ipHash) return { referrerIpMatch: false, duplicateFingerprintCount: 0 };
      const match = await pool.query('SELECT 1 FROM auth_sessions WHERE user_id=$1 AND ip_hash=$2 LIMIT 1', [referrerUserId, ipHash]);
      const dup = await pool.query(
        'SELECT COUNT(*) AS n FROM referral_attributions WHERE referrer_user_id=$1 AND signup_ip_hash=$2 AND signup_ua_hash IS NOT DISTINCT FROM $3', [referrerUserId, ipHash, uaHash || null]
      );
      return { referrerIpMatch: match.rowCount > 0, duplicateFingerprintCount: Number(dup.rows[0].n) };
    },
    async userHasConfirmedPayment(userId) {
      const { rowCount } = await pool.query(`SELECT 1 FROM payment_transactions WHERE user_id=$1 AND status='confirmed' AND type<>'refund' AND amount_micro_usd>0 LIMIT 1`, [userId]);
      return rowCount > 0;
    },
    async getAccount(userId) {
      const { rows: users } = await pool.query('SELECT id FROM users WHERE id=$1', [userId]);
      if (!users[0]) throw new ApiError(404, 'USER_NOT_FOUND');
      await pool.query('INSERT INTO referral_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
      const { rows } = await pool.query('SELECT * FROM referral_accounts WHERE user_id=$1', [userId]);
      return mapAccount(rows[0]);
    },
    async setPayoutBlocked(userId, { blocked, reason }) {
      return withTx(async (client) => {
        await lockAccount(client, userId);
        const { rows } = await client.query(
          'UPDATE referral_accounts SET payout_blocked=$2, payout_blocked_reason=$3, updated_at=now() WHERE user_id=$1 RETURNING *', [userId, Boolean(blocked), blocked ? (reason || null) : null]
        );
        return mapAccount(rows[0]);
      });
    },
    async acceptTerms(userId, version) {
      return withTx(async (client) => {
        await lockAccount(client, userId);
        const { rows } = await client.query('UPDATE referral_accounts SET terms_accepted_version=$2, terms_accepted_at=now(), updated_at=now() WHERE user_id=$1 RETURNING *', [userId, version]);
        return mapAccount(rows[0]);
      });
    }
  };

  // ---------------------------------------------------------------------------------------------------
  // Earning lots, append-only ledger, reversals, debt, irreversible AI conversion
  // ---------------------------------------------------------------------------------------------------
  async function usageFor(client, attribution) {
    const net = 'COALESCE(SUM(l.original_micro_usd - l.reversed_micro_usd),0)';
    const one = async (sql, params) => Number((await client.query(sql, params)).rows[0].v);
    const programUsedMicroUsd = await one(`SELECT ${net} AS v FROM referral_earning_lots l WHERE l.program_id=$1`, [attribution.programId]);
    const campaignUsedMicroUsd = await one(`SELECT ${net} AS v FROM referral_earning_lots l WHERE l.program_version_id=$1`, [attribution.programVersionId]);
    const perUserUsedMicroUsd = await one(`SELECT ${net} AS v FROM referral_earning_lots l WHERE l.referrer_user_id=$1 AND l.program_id=$2`, [attribution.referrerUserId, attribution.programId]);
    const perCustomerUsedMicroUsd = await one(`SELECT ${net} AS v FROM referral_earning_lots l WHERE l.attribution_id=$1`, [attribution.id]);
    const partnershipUsedMicroUsd = attribution.assignmentId
      ? await one(`SELECT ${net} AS v FROM referral_earning_lots l JOIN referral_attributions a ON a.id = l.attribution_id WHERE a.assignment_id=$1`, [attribution.assignmentId])
      : 0;
    const customers = await client.query('SELECT DISTINCT attribution_id FROM referral_earning_lots WHERE referrer_user_id=$1 AND program_id=$2', [attribution.referrerUserId, attribution.programId]);
    return {
      programUsedMicroUsd, campaignUsedMicroUsd, perUserUsedMicroUsd, perCustomerUsedMicroUsd, partnershipUsedMicroUsd,
      qualifiedCustomerCount: customers.rowCount, attributionHasEarning: customers.rows.some((r) => r.attribution_id === attribution.id)
    };
  }

  const referralEarnings = {
    async recordEarning({ source, sourceEventId, paymentTransactionId, referredUserId, planId, productId, finalAmountMicroUsd, taxMicroUsd, excludedMicroUsd, walletBonusMicroUsd, confirmedAt }) {
      return withTx(async (client) => {
        const { rows: attrRows } = await client.query('SELECT * FROM referral_attributions WHERE referred_user_id=$1', [referredUserId]);
        if (!attrRows[0]) return { ok: true, outcome: 'none', reason: 'NO_ATTRIBUTION' };
        const attribution = mapAttribution(attrRows[0]);
        const readOutcome = async () => {
          const { rows } = await client.query('SELECT * FROM referral_earning_outcomes WHERE source=$1 AND source_event_id=$2', [source, sourceEventId]);
          return rows[0] ? mapOutcome(rows[0]) : null;
        };
        // Lock order: program row (serialises the budget check), then the referrer's account row.
        const { rows: programRows } = await client.query('SELECT * FROM referral_programs WHERE id=$1 FOR UPDATE', [attribution.programId]);
        await lockAccount(client, attribution.referrerUserId);
        const existing = await readOutcome();
        if (existing) {
          const lot = existing.lotId ? (await client.query(`${LOT_SELECT} WHERE l.id=$1`, [existing.lotId])).rows[0] : null;
          return { ok: true, duplicate: true, outcome: existing.outcome, reason: existing.reason, lot: lot ? mapLot(lot) : null };
        }
        const assignment = await activeAssignmentOf(client, attribution.referrerUserId);
        const decision = decideEarning({
          source, attribution, referrerMode: isReferrerExplicitlyDisabled(assignment) ? 'disabled' : 'enabled',
          programStatus: programRows[0] ? programRows[0].status : 'active', planId, productId, finalAmountMicroUsd, taxMicroUsd, excludedMicroUsd, walletBonusMicroUsd,
          usage: await usageFor(client, attribution), confirmedAt: confirmedAt || new Date().toISOString()
        });
        let lotRow = null;
        if (decision.outcome !== 'skipped') {
          const snapshot = { rules: attribution.rulesSnapshot, math: decision.math, outcome: decision.outcome, reason: decision.reason };
          ({ rows: [lotRow] } = await client.query(
            `INSERT INTO referral_earning_lots (id, referrer_user_id, attribution_id, program_id, program_version_id, source, source_event_id, payment_transaction_id,
               commissionable_base_micro_usd, commission_bps, original_micro_usd, matures_at, snapshot)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
            [newId('refLot'), attribution.referrerUserId, attribution.id, attribution.programId, attribution.programVersionId, source, sourceEventId, paymentTransactionId || null,
              decision.commissionableBaseMicroUsd, decision.commissionBps, decision.commissionMicroUsd, decision.maturesAt, JSON.stringify(snapshot)]
          ));
          await pushLedger(client, {
            userId: attribution.referrerUserId, lotId: lotRow.id, entryType: 'EARN', state: new Date(decision.maturesAt).getTime() <= Date.now() ? 'available_cash' : 'pending',
            amountMicroUsd: decision.commissionMicroUsd, idempotencyKey: 'earn:' + lotRow.id, refType: source, refId: sourceEventId, metadata: { outcome: decision.outcome, reason: decision.reason }
          });
        }
        await client.query(
          `INSERT INTO referral_earning_outcomes (id, source, source_event_id, attribution_id, lot_id, outcome, reason, math) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [newId('refOutcome'), source, sourceEventId, attribution.id, lotRow ? lotRow.id : null, decision.outcome, decision.reason || null, JSON.stringify(decision.math || {})]
        );
        return { ok: true, outcome: decision.outcome, reason: decision.reason || null, lot: lotRow ? mapLot({ ...lotRow, has_open_debt: false }) : null };
      });
    },

    async reverseEarning({ source, sourceEventId, trigger, triggerRef, commissionAfterMicroUsd }) {
      return withTx(async (client) => {
        const { rows: lotPeek } = await client.query('SELECT id, referrer_user_id FROM referral_earning_lots WHERE source=$1 AND source_event_id=$2', [source, sourceEventId]);
        if (!lotPeek[0]) return { ok: true, reversed: false, reason: 'NO_LOT' };
        const referrerUserId = lotPeek[0].referrer_user_id;
        // account -> ALL of the referrer's lots (by seq) -> affected payout requests (by id).
        await lockAccount(client, referrerUserId);
        const lots = await lockUserLots(client, referrerUserId);
        const lot = lots.find((l) => l.id === lotPeek[0].id);
        const { rows: dupe } = await client.query('SELECT 1 FROM referral_reversals WHERE lot_id=$1 AND trigger=$2 AND trigger_ref=$3', [lot.id, trigger, triggerRef]);
        if (dupe[0]) return { ok: true, reversed: false, duplicate: true, reason: 'ALREADY_REVERSED' };
        const { rows: prior } = await client.query(
          'SELECT COALESCE(SUM(from_remaining_micro_usd + from_reserved_micro_usd + debt_micro_usd),0) AS clawed FROM referral_reversals WHERE lot_id=$1', [lot.id]
        );
        const { rows: reqRows } = await client.query(
          `SELECT r.*, a.amount_micro_usd AS alloc_amount FROM referral_lot_allocations a JOIN referral_payout_requests r ON r.id = a.payout_request_id
           WHERE a.lot_id=$1 AND a.kind='payout_reservation' AND r.status = ANY($2::text[]) ORDER BY r.id FOR UPDATE OF r`, [lot.id, PAYOUT_PRE_SEND_STATES]
        );
        const preSendReserved = reqRows.reduce((sum, r) => sum + Number(r.alloc_amount), 0);
        const plan = planReversal({
          originalMicroUsd: lot.originalMicroUsd, remainingMicroUsd: lot.remainingMicroUsd, reservedMicroUsd: Math.min(preSendReserved, lot.payoutReservedMicroUsd),
          alreadyClawedMicroUsd: Number(prior[0].clawed), commissionAfterMicroUsd
        });
        const reversalKey = lot.id + '|' + trigger + '|' + triggerRef;
        if (plan.fromRemaining > 0) {
          await client.query('UPDATE referral_earning_lots SET reversed_micro_usd = reversed_micro_usd + $2, updated_at=now() WHERE id=$1', [lot.id, plan.fromRemaining]);
          await pushLedger(client, {
            userId: referrerUserId, lotId: lot.id, entryType: lot.matured ? 'REVERSE_AVAILABLE' : 'REVERSE_PENDING', state: 'reversed', amountMicroUsd: plan.fromRemaining,
            idempotencyKey: 'reverse:' + reversalKey + ':remaining', refType: trigger, refId: triggerRef, metadata: {}
          });
        }
        const autoRejectedPayoutIds = [];
        if (plan.fromReserved > 0) {
          let toReverse = plan.fromReserved;
          for (const request of [...reqRows].sort((a, b) => (new Date(a.requested_at) < new Date(b.requested_at) ? 1 : -1))) {
            if (toReverse <= 0) break;
            toReverse = await releaseRequestReservations(client, mapPayout(request), { reason: 'EARNING_REVERSED', reversedLotId: lot.id, reverseBudget: toReverse });
            await client.query(`UPDATE referral_payout_requests SET status='rejected', rejection_reason='EARNING_REVERSED' WHERE id=$1`, [request.id]);
            await payoutEvent(client, request, request.status, 'rejected', { type: 'system' }, 'Auto-rejected: an underlying earning was reversed', { trigger, triggerRef });
            autoRejectedPayoutIds.push(request.id);
          }
        }
        let debtCase = null;
        if (plan.debt > 0) {
          const { rows } = await client.query(
            `INSERT INTO referral_debt_cases (id, user_id, lot_id, trigger, trigger_ref, amount_micro_usd) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [newId('refDebt'), referrerUserId, lot.id, trigger, triggerRef, plan.debt]
          );
          debtCase = mapDebt(rows[0]);
          await client.query('UPDATE referral_accounts SET debt_micro_usd = debt_micro_usd + $2, updated_at=now() WHERE user_id=$1', [referrerUserId, plan.debt]);
          await pushLedger(client, {
            userId: referrerUserId, lotId: lot.id, entryType: 'DEBT_OPENED', state: 'debt', amountMicroUsd: plan.debt, idempotencyKey: 'debt:' + reversalKey,
            refType: trigger, refId: triggerRef, metadata: { debtCaseId: debtCase.id }
          });
        }
        await client.query(
          `INSERT INTO referral_reversals (id, lot_id, trigger, trigger_ref, commission_after_micro_usd, from_remaining_micro_usd, from_reserved_micro_usd, debt_micro_usd)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [newId('refReversal'), lot.id, trigger, triggerRef, commissionAfterMicroUsd, plan.fromRemaining, plan.fromReserved, plan.debt]
        );
        const { rows: after } = await client.query(`${LOT_SELECT} WHERE l.id=$1`, [lot.id]);
        return { ok: true, reversed: true, plan, autoRejectedPayoutIds, debtCase, lot: mapLot(after[0]) };
      });
    },

    async lotsForUser(userId) {
      const { rows } = await pool.query(`${LOT_SELECT} WHERE l.referrer_user_id=$1 ORDER BY l.seq DESC`, [userId]);
      const nowMs = Date.now();
      return rows.map((r) => mapLot(r, nowMs));
    },
    async getLot(id) { const { rows } = await pool.query(`${LOT_SELECT} WHERE l.id=$1`, [id]); return rows[0] ? mapLot(rows[0]) : null; },
    async getLotBySource(source, sourceEventId) {
      const { rows } = await pool.query(`${LOT_SELECT} WHERE l.source=$1 AND l.source_event_id=$2`, [source, sourceEventId]);
      return rows[0] ? mapLot(rows[0]) : null;
    },
    async summaryForUser(userId) {
      const { rows } = await pool.query('SELECT l.*, false AS has_open_debt FROM referral_earning_lots l WHERE l.referrer_user_id=$1', [userId]);
      const lots = rows.map((r) => mapLotRaw(r));
      const openDebtMicroUsd = await openDebtOf(pool, userId);
      return { totals: summarizeLots(lots, { openDebtMicroUsd, now: Date.now() }), openDebtMicroUsd };
    },
    async ledgerForUser(userId, { limit = 50 } = {}) {
      const { rows } = await pool.query('SELECT * FROM referral_ledger_entries WHERE user_id=$1 ORDER BY seq DESC LIMIT $2', [userId, limit]);
      return rows.map(mapLedger);
    },

    // wallet_accounts -> referral_accounts -> lots: the wallet credit, allocations, referral ledger and conversion record are ONE transaction.
    async convertToAi({ userId, amountMicroUsd, idempotencyKey }) {
      if (!Number.isSafeInteger(amountMicroUsd) || amountMicroUsd <= 0) throw invalid('amountMicroUsd');
      return withTx(async (client) => {
        const { rows: users } = await client.query('SELECT id FROM users WHERE id=$1', [userId]);
        if (!users[0]) throw new ApiError(404, 'USER_NOT_FOUND');
        await client.query('INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
        await client.query('SELECT * FROM wallet_accounts WHERE user_id=$1 FOR UPDATE', [userId]);
        await lockAccount(client, userId);
        const { rows: prior } = await client.query('SELECT * FROM referral_ai_conversions WHERE user_id=$1 AND idempotency_key=$2', [userId, idempotencyKey]);
        if (prior[0]) {
          const { rows: allocs } = await client.query('SELECT * FROM referral_lot_allocations WHERE conversion_id=$1', [prior[0].id]);
          return { ok: true, duplicate: true, conversion: mapConversion(prior[0]), allocations: allocs.map(mapAllocation) };
        }
        const lots = await lockUserLots(client, userId);
        const nowMs = Date.now();
        const spendable = summarizeLots(lots, { openDebtMicroUsd: await openDebtOf(client, userId), now: nowMs }).spendableMicroUsd;
        if (amountMicroUsd > spendable) return { ok: false, reason: 'INSUFFICIENT_SPENDABLE', spendableMicroUsd: spendable };
        const { allocations, unallocatedMicroUsd } = allocateFifo(await fifoLots(client, userId, nowMs), amountMicroUsd);
        if (unallocatedMicroUsd > 0) return { ok: false, reason: 'INSUFFICIENT_SPENDABLE', spendableMicroUsd: spendable - unallocatedMicroUsd };
        const conversionId = newId('refConversion');
        await client.query('UPDATE wallet_accounts SET promo_balance_micro_usd = promo_balance_micro_usd + $2, updated_at=now() WHERE user_id=$1', [userId, amountMicroUsd]);
        const { rows: walletRows } = await client.query(
          `INSERT INTO wallet_ledger (id, user_id, type, cash_delta_micro_usd, promo_delta_micro_usd, source_action, idempotency_key, metadata)
           VALUES ($1,$2,'REFERRAL_AI_CONVERSION',0,$3,'referral-ai-conversion',$4,$5) RETURNING *`,
          [newId('walletLedger'), userId, amountMicroUsd, 'referral-ai-conversion:' + userId + ':' + idempotencyKey, JSON.stringify({ conversionId })]
        );
        const { rows: convRows } = await client.query(
          'INSERT INTO referral_ai_conversions (id, user_id, amount_micro_usd, idempotency_key, wallet_ledger_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          [conversionId, userId, amountMicroUsd, idempotencyKey, walletRows[0].id]
        );
        const saved = [];
        for (const allocation of allocations) {
          await client.query('UPDATE referral_earning_lots SET ai_converted_micro_usd = ai_converted_micro_usd + $2, updated_at=now() WHERE id=$1', [allocation.lotId, allocation.amountMicroUsd]);
          const { rows } = await client.query(
            `INSERT INTO referral_lot_allocations (id, lot_id, user_id, kind, conversion_id, amount_micro_usd) VALUES ($1,$2,$3,'ai_conversion',$4,$5) RETURNING *`,
            [newId('refAlloc'), allocation.lotId, userId, conversionId, allocation.amountMicroUsd]
          );
          saved.push(mapAllocation(rows[0]));
          await pushLedger(client, {
            userId, lotId: allocation.lotId, entryType: 'CONVERT_AI', state: 'ai_converted', amountMicroUsd: allocation.amountMicroUsd,
            idempotencyKey: 'convert:' + conversionId + ':' + allocation.lotId, refType: 'ai_conversion', refId: conversionId, metadata: {}
          });
        }
        return { ok: true, conversion: mapConversion(convRows[0]), allocations: saved, walletLedgerEntry: mapWalletLedgerEntry(walletRows[0]) };
      });
    },

    async listDebtCases({ userId, status, limit = 200 } = {}) {
      const { rows } = await pool.query(
        'SELECT * FROM referral_debt_cases WHERE ($1::text IS NULL OR user_id=$1) AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC, id LIMIT $3', [userId || null, status || null, limit]
      );
      return rows.map(mapDebt);
    },
    async getDebtCase(id) { const { rows } = await pool.query('SELECT * FROM referral_debt_cases WHERE id=$1', [id]); return rows[0] ? mapDebt(rows[0]) : null; },
    async resolveDebtCase(id, { status, note, resolvedBy, recoveredMicroUsd = 0 }) {
      return withTx(async (client) => {
        const { rows: peek } = await client.query('SELECT user_id FROM referral_debt_cases WHERE id=$1', [id]);
        if (!peek[0]) throw new ApiError(404, 'REFERRAL_DEBT_NOT_FOUND');
        await lockAccount(client, peek[0].user_id);
        const { rows } = await client.query('SELECT * FROM referral_debt_cases WHERE id=$1 FOR UPDATE', [id]);
        const debt = mapDebt(rows[0]);
        if (debt.status === 'resolved' || debt.status === 'written_off') return debt;
        const outstanding = debt.amountMicroUsd - debt.recoveredMicroUsd;
        let updated;
        if (status === 'recovering') {
          if (!Number.isSafeInteger(recoveredMicroUsd) || recoveredMicroUsd <= 0 || recoveredMicroUsd >= outstanding) throw invalid('recoveredMicroUsd');
          ({ rows: [updated] } = await client.query(
            `UPDATE referral_debt_cases SET recovered_micro_usd = recovered_micro_usd + $2, status='recovering', resolution_note=COALESCE($3, resolution_note) WHERE id=$1 RETURNING *`, [id, recoveredMicroUsd, note === undefined ? null : (String(note || '').slice(0, 1000) || null)]
          ));
          await client.query('UPDATE referral_accounts SET debt_micro_usd = debt_micro_usd - $2, updated_at=now() WHERE user_id=$1', [debt.userId, recoveredMicroUsd]);
        } else if (status === 'resolved' || status === 'written_off') {
          ({ rows: [updated] } = await client.query(
            `UPDATE referral_debt_cases SET status=$2, recovered_micro_usd = CASE WHEN $2='resolved' THEN amount_micro_usd ELSE recovered_micro_usd END,
               resolved_at=now(), resolved_by=$3, resolution_note=COALESCE($4, resolution_note) WHERE id=$1 RETURNING *`,
            [id, status, resolvedBy || null, note === undefined ? null : (String(note || '').slice(0, 1000) || null)]
          ));
          await client.query('UPDATE referral_accounts SET debt_micro_usd = debt_micro_usd - $2, updated_at=now() WHERE user_id=$1', [debt.userId, outstanding]);
          await pushLedger(client, {
            userId: debt.userId, lotId: debt.lotId, entryType: 'DEBT_RESOLVED', state: 'debt', amountMicroUsd: outstanding, idempotencyKey: 'debt-resolved:' + id,
            refType: 'debt_case', refId: id, metadata: { status }
          });
        } else throw invalid('status');
        return mapDebt(updated);
      });
    },
    async getOutcome(source, sourceEventId) {
      const { rows } = await pool.query('SELECT * FROM referral_earning_outcomes WHERE source=$1 AND source_event_id=$2', [source, sourceEventId]);
      return rows[0] ? mapOutcome(rows[0]) : null;
    },
    async listOutcomes({ limit = 200 } = {}) {
      const { rows } = await pool.query('SELECT * FROM referral_earning_outcomes ORDER BY created_at DESC, id LIMIT $1', [limit]);
      return rows.map(mapOutcome);
    },
    async findUnprocessedQualifyingPayments({ limit = 100 } = {}) {
      const { rows } = await pool.query(
        `SELECT t.id, t.type, t.user_id, t.amount_micro_usd, t.confirmed_at FROM payment_transactions t
         JOIN referral_attributions a ON a.referred_user_id = t.user_id
         WHERE t.status='confirmed' AND t.type IN ('subscription','storage_purchase') AND t.amount_micro_usd > 0
           AND NOT EXISTS (SELECT 1 FROM referral_earning_outcomes o WHERE o.source = t.type AND o.source_event_id = t.id)
           AND NOT EXISTS (SELECT 1 FROM payment_transactions r WHERE r.type='refund' AND r.status='confirmed' AND r.metadata->>'originalTransactionId' = t.id)
         ORDER BY t.created_at LIMIT $1`, [limit]
      );
      return rows.map((r) => ({ transactionId: r.id, type: r.type, userId: r.user_id, amountMicroUsd: Number(r.amount_micro_usd), confirmedAt: iso(r.confirmed_at) }));
    }
  };

  // ---------------------------------------------------------------------------------------------------
  // Payout requests (manual, audited BSC workflow)
  // ---------------------------------------------------------------------------------------------------
  const referralPayouts = {
    async createRequest(args) {
      return withTx(async (client) => {
        const { rows: users } = await client.query('SELECT id FROM users WHERE id=$1', [args.userId]);
        if (!users[0]) throw new ApiError(404, 'USER_NOT_FOUND');
        const account = await lockAccount(client, args.userId);
        const { rows: prior } = await client.query('SELECT * FROM referral_payout_requests WHERE user_id=$1 AND idempotency_key=$2', [args.userId, args.idempotencyKey]);
        if (prior[0]) {
          const { rows: allocs } = await client.query('SELECT * FROM referral_lot_allocations WHERE payout_request_id=$1', [prior[0].id]);
          return { ok: true, duplicate: true, request: mapPayout(prior[0]), allocations: allocs.map(mapAllocation) };
        }
        if (account.payout_blocked) return { ok: false, reason: 'PAYOUT_BLOCKED' };
        if ((await openDebtOf(client, args.userId)) > 0) return { ok: false, reason: 'DEBT_OPEN' };
        if (args.amountMicroUsd < args.minPayoutMicroUsd) return { ok: false, reason: 'BELOW_MINIMUM', minPayoutMicroUsd: args.minPayoutMicroUsd };
        const lots = await lockUserLots(client, args.userId);
        const nowMs = Date.now();
        const spendable = summarizeLots(lots, { openDebtMicroUsd: 0, now: nowMs }).spendableMicroUsd;
        if (args.amountMicroUsd > spendable) return { ok: false, reason: 'INSUFFICIENT_SPENDABLE', spendableMicroUsd: spendable };
        const { allocations, unallocatedMicroUsd } = allocateFifo(await fifoLots(client, args.userId, nowMs), args.amountMicroUsd);
        if (unallocatedMicroUsd > 0) return { ok: false, reason: 'INSUFFICIENT_SPENDABLE', spendableMicroUsd: spendable - unallocatedMicroUsd };
        const { rows } = await client.query(
          `INSERT INTO referral_payout_requests (id, user_id, idempotency_key, amount_micro_usd, asset_symbol, chain_id, token_contract, token_decimals, atomic_amount, treasury_sender,
             recipient_address_enc, recipient_address_hash, recipient_masked, policy_snapshot, terms_version, acknowledgements, kyc_status_snapshot, email_verified_snapshot, reauth_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
          [newId('refPayout'), args.userId, args.idempotencyKey, args.amountMicroUsd, args.asset.symbol, args.asset.chainId, args.asset.tokenContract, args.asset.decimals, args.asset.atomicAmount,
            args.asset.treasurySender, args.recipient.enc, args.recipient.hash, args.recipient.masked, JSON.stringify(args.policySnapshot), args.termsVersion, JSON.stringify(args.acknowledgements),
            args.kycStatusSnapshot, Boolean(args.emailVerifiedSnapshot), args.reauthAt || null]
        );
        const request = mapPayout(rows[0]);
        const saved = [];
        for (const allocation of allocations) {
          await client.query('UPDATE referral_earning_lots SET payout_reserved_micro_usd = payout_reserved_micro_usd + $2, updated_at=now() WHERE id=$1', [allocation.lotId, allocation.amountMicroUsd]);
          const { rows: allocRows } = await client.query(
            `INSERT INTO referral_lot_allocations (id, lot_id, user_id, kind, payout_request_id, amount_micro_usd) VALUES ($1,$2,$3,'payout_reservation',$4,$5) RETURNING *`,
            [newId('refAlloc'), allocation.lotId, args.userId, request.id, allocation.amountMicroUsd]
          );
          saved.push(mapAllocation(allocRows[0]));
          await pushLedger(client, {
            userId: args.userId, lotId: allocation.lotId, entryType: 'RESERVE_PAYOUT', state: 'payout_reserved', amountMicroUsd: allocation.amountMicroUsd,
            idempotencyKey: 'reserve:' + request.id + ':' + allocation.lotId, refType: 'payout_request', refId: request.id, metadata: {}
          });
        }
        await payoutEvent(client, request, null, 'requested', { type: 'user', id: args.userId }, null, {});
        return { ok: true, request, allocations: saved };
      });
    },
    async getRequest(id) { const { rows } = await pool.query('SELECT * FROM referral_payout_requests WHERE id=$1', [id]); return rows[0] ? mapPayout(rows[0]) : null; },
    async listForUser(userId, { limit = 50 } = {}) {
      const { rows } = await pool.query('SELECT * FROM referral_payout_requests WHERE user_id=$1 ORDER BY requested_at DESC, id LIMIT $2', [userId, limit]);
      return rows.map(mapPayout);
    },
    async listAll({ status, limit = 200, offset = 0 } = {}) {
      const { rows } = await pool.query('SELECT * FROM referral_payout_requests WHERE ($1::text IS NULL OR status=$1) ORDER BY requested_at DESC, id LIMIT $2 OFFSET $3', [status || null, limit, offset]);
      return rows.map(mapPayout);
    },
    async eventsFor(requestId) {
      const { rows } = await pool.query('SELECT * FROM referral_payout_events WHERE request_id=$1 ORDER BY created_at, id', [requestId]);
      return rows.map(mapPayoutEvent);
    },
    async allocationsFor(requestId) {
      const { rows } = await pool.query('SELECT * FROM referral_lot_allocations WHERE payout_request_id=$1 ORDER BY created_at, id', [requestId]);
      return rows.map(mapAllocation);
    },
    async hasFlaggedRisk(requestId) {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM referral_lot_allocations al JOIN referral_earning_lots l ON l.id = al.lot_id JOIN referral_attributions a ON a.id = l.attribution_id
         WHERE al.payout_request_id=$1 AND a.risk_review_status='flagged' LIMIT 1`, [requestId]
      );
      return rowCount > 0;
    },
    // account -> the request's lots (by seq) -> the request row. The expected state is re-checked under the lock; the 070
    // trigger independently refuses an illegal transition or a change to an immutable column.
    async transition(id, { expectedFrom, to, actor, note, fields = {} }) {
      return withTx(async (client) => {
        const { rows: peek } = await client.query('SELECT user_id FROM referral_payout_requests WHERE id=$1', [id]);
        if (!peek[0]) throw new ApiError(404, 'REFERRAL_PAYOUT_NOT_FOUND');
        await lockAccount(client, peek[0].user_id);
        await client.query(
          `SELECT l.id FROM referral_earning_lots l JOIN referral_lot_allocations a ON a.lot_id = l.id WHERE a.payout_request_id=$1 ORDER BY l.seq FOR UPDATE OF l`, [id]
        );
        const { rows } = await client.query('SELECT * FROM referral_payout_requests WHERE id=$1 FOR UPDATE', [id]);
        const request = mapPayout(rows[0]);
        if (request.status !== expectedFrom) return { ok: false, reason: 'STATE_CONFLICT', status: request.status };
        assertLegalPayoutTransition(request.status, to);
        if (to === 'rejected' || to === 'cancelled' || to === 'failed') await releaseRequestReservations(client, request, { reason: to });
        if (to === 'paid') {
          const { rows: allocations } = await client.query('SELECT * FROM referral_lot_allocations WHERE payout_request_id=$1', [id]);
          for (const allocation of allocations) {
            await client.query(
              'UPDATE referral_earning_lots SET payout_reserved_micro_usd = payout_reserved_micro_usd - $2, paid_micro_usd = paid_micro_usd + $2, updated_at=now() WHERE id=$1', [allocation.lot_id, Number(allocation.amount_micro_usd)]
            );
            await pushLedger(client, {
              userId: allocation.user_id, lotId: allocation.lot_id, entryType: 'PAYOUT_PAID', state: 'paid', amountMicroUsd: Number(allocation.amount_micro_usd),
              idempotencyKey: 'paid:' + id + ':' + allocation.lot_id, refType: 'payout_request', refId: id, metadata: {}
            });
          }
        }
        const sets = ['status=$2'];
        const params = [id, to];
        for (const [key, column] of Object.entries(PAYOUT_STAGE_COLUMNS)) {
          if (fields[key] === undefined) continue;
          params.push(key === 'verification' ? JSON.stringify(fields[key]) : fields[key]);
          sets.push(`${column}=$${params.length}`);
        }
        const { rows: updated } = await client.query(`UPDATE referral_payout_requests SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, params);
        await payoutEvent(client, request, request.status, to, actor, note, {});
        return { ok: true, request: mapPayout(updated[0]) };
      });
    },
    async setTxHash(id, { txHash, actorId, expectedFrom }) {
      return withTx(async (client) => {
        const { rows } = await client.query('SELECT * FROM referral_payout_requests WHERE id=$1 FOR UPDATE', [id]);
        if (!rows[0]) throw new ApiError(404, 'REFERRAL_PAYOUT_NOT_FOUND');
        const request = mapPayout(rows[0]);
        if (request.status !== expectedFrom) return { ok: false, reason: 'STATE_CONFLICT', status: request.status };
        const hash = String(txHash).toLowerCase();
        const clash = await client.query('SELECT 1 FROM referral_payout_requests WHERE tx_hash=$1 AND id<>$2 LIMIT 1', [hash, id]);
        if (clash.rowCount) return { ok: false, reason: 'TX_HASH_ALREADY_USED' };
        const invoiceClash = await client.query('SELECT 1 FROM crypto_invoices WHERE lower(tx_hash)=$1 LIMIT 1', [hash]);
        if (invoiceClash.rowCount) return { ok: false, reason: 'TX_HASH_ALREADY_USED' };
        let updated;
        try {
          if (request.status === 'approved') {
            ({ rows: [updated] } = await client.query(
              `UPDATE referral_payout_requests SET status='submitted', tx_hash=$2, submitted_by=$3, submitted_at=now() WHERE id=$1 RETURNING *`, [id, hash, actorId]
            ));
            await payoutEvent(client, request, 'approved', 'submitted', { type: 'admin', id: actorId }, 'Transaction hash entered', { txHash: hash });
          } else {
            if (request.verification && request.verification.ok === true) return { ok: false, reason: 'HASH_ALREADY_VERIFIED' };
            ({ rows: [updated] } = await client.query(`UPDATE referral_payout_requests SET tx_hash=$2, verification=NULL, confirmations=NULL WHERE id=$1 RETURNING *`, [id, hash]));
            await payoutEvent(client, request, 'submitted', 'submitted', { type: 'admin', id: actorId }, 'Transaction hash replaced', { previous: request.txHash, txHash: hash });
          }
        } catch (error) {
          if (error && error.code === '23505') return { ok: false, reason: 'TX_HASH_ALREADY_USED' };
          throw error;
        }
        return { ok: true, request: mapPayout(updated) };
      });
    },
    async recordVerification(id, { verification, confirmations }) {
      return withTx(async (client) => {
        const { rows } = await client.query('SELECT * FROM referral_payout_requests WHERE id=$1 FOR UPDATE', [id]);
        if (!rows[0]) throw new ApiError(404, 'REFERRAL_PAYOUT_NOT_FOUND');
        if (!['submitted', 'confirmed'].includes(rows[0].status)) return { ok: false, reason: 'STATE_CONFLICT', status: rows[0].status };
        const { rows: updated } = await client.query('UPDATE referral_payout_requests SET verification=$2, confirmations=$3 WHERE id=$1 RETURNING *', [id, JSON.stringify(verification), confirmations ?? null]);
        return { ok: true, request: mapPayout(updated[0]) };
      });
    }
  };

  // ---------------------------------------------------------------------------------------------------
  // Reporting inputs - raw rows only; the aggregation itself is the shared pure buildAdminReport().
  // ---------------------------------------------------------------------------------------------------
  const referralReports = {
    async rawForReport({ from, to, programId } = {}) {
      const range = (column) => `($1::timestamptz IS NULL OR ${column} >= $1) AND ($2::timestamptz IS NULL OR ${column} < $2)`;
      const params = [from || null, to || null];
      const withProgram = [...params, programId || null];
      const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
      const [programs, clicks, attributions, lots, outcomes, debts, payouts, conversions, codes] = await Promise.all([
        q('SELECT * FROM referral_programs ORDER BY created_at DESC', []),
        q(`SELECT code_id, to_char(day, 'YYYY-MM-DD') AS day, visitor_hash, click_count, first_seen_at FROM referral_click_stats WHERE ($1::timestamptz IS NULL OR day >= $1::date) AND ($2::timestamptz IS NULL OR day <= $2::date)`, params),
        q(`SELECT * FROM referral_attributions WHERE ${range('attributed_at')} AND ($3::text IS NULL OR program_id=$3)`, withProgram),
        q(`${LOT_SELECT} WHERE ${range('l.created_at')} AND ($3::text IS NULL OR l.program_id=$3)`, withProgram),
        q(`SELECT * FROM referral_earning_outcomes WHERE ${range('created_at')}`, params),
        q('SELECT * FROM referral_debt_cases', []),
        q(`SELECT * FROM referral_payout_requests WHERE ${range('requested_at')}`, params),
        q(`SELECT * FROM referral_ai_conversions WHERE ${range('created_at')}`, params),
        q('SELECT * FROM referral_codes', [])
      ]);
      return {
        programs: programs.map(mapProgram),
        clicks: clicks.map((c) => ({ codeId: c.code_id, day: c.day, visitorHash: c.visitor_hash, clickCount: c.click_count, firstSeenAt: iso(c.first_seen_at) })),
        attributions: attributions.map(mapAttribution), lots: lots.map((r) => mapLot(r)), outcomes: outcomes.map(mapOutcome), debts: debts.map(mapDebt),
        payouts: payouts.map(mapPayout), conversions: conversions.map(mapConversion), codes: codes.map(mapCode)
      };
    },
    async programBudgetUsed(programId) {
      const { rows } = await pool.query('SELECT COALESCE(SUM(original_micro_usd - reversed_micro_usd),0) AS v FROM referral_earning_lots WHERE program_id=$1', [programId]);
      return Number(rows[0].v);
    }
  };

  return { referralPrograms, referral, referralEarnings, referralPayouts, referralReports };
}
