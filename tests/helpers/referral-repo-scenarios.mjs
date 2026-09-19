// One set of behavioural scenarios for the referral repository domains, run against BOTH backends:
// tests/referral-repo-memory.test.mjs (createMemoryRepo) and tests/referral-postgres-integration.test.mjs
// (real pg, DATABASE_URL-gated). Identical assertions on two implementations is the parity guarantee: the
// memory repo (what every route test injects) can only be trusted if a real database behaves the same way.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { MICRO, parseProgramVersionInput, parseAssignmentInput, buildRulesSnapshot, commissionEndsAtFor } from '../../server/commercial/referral-rules.mjs';

const DAY = 24 * 60 * 60 * 1000;
const isoAgo = (days) => new Date(Date.now() - days * DAY).toISOString();
let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter += 1)}`;

export async function createUser(repo, name) {
  return repo.users.create({ displayName: name, email: `${name.toLowerCase()}.${uniq()}@example.test` });
}

// A published STANDARD platform-default program (holdDays 0 unless overridden), plus a referrer with a code.
export async function setupProgram(repo, { holdDays = 0, commissionBps = 1000, extra = {}, autoEnroll = true } = {}) {
  const admin = await createUser(repo, 'Admin');
  const referrer = await createUser(repo, 'Referrer');
  const program = await repo.referralPrograms.createProgram({ kind: 'standard', name: 'Standard ' + uniq(), isPlatformDefault: true, autoEnrollUnassigned: autoEnroll, createdBy: admin.id });
  const rules = parseProgramVersionInput({ commissionBps, eligibleSources: ['subscription'], attributionWindowDays: 30, holdDays, cashOutMinimumUsd: 10, ...extra });
  const draft = await repo.referralPrograms.createDraftVersion(program.id, rules, { createdBy: admin.id });
  const version = await repo.referralPrograms.publishVersion(draft.id, { publishedBy: admin.id });
  const code = await repo.referral.ensureCode(referrer.id);
  return { admin, referrer, program, version, code };
}

export async function attribute(repo, ctx, name = 'Referred') {
  const referred = await createUser(repo, name);
  const snapshot = buildRulesSnapshot({ version: ctx.version, assignment: null, mode: 'standard' });
  const claim = await repo.referral.claimAttribution({
    referredUserId: referred.id, referrerUserId: ctx.referrer.id, codeId: ctx.code.id, assignmentId: null, programId: ctx.program.id,
    programVersionId: ctx.version.id, mode: 'standard', commissionBps: snapshot.commissionBps, rulesSnapshot: snapshot,
    commissionEndsAt: commissionEndsAtFor(new Date().toISOString(), snapshot.commissionTermDays), riskFlags: [], riskReviewStatus: 'none', signupIpHash: null, signupUaHash: null
  });
  assert.equal(claim.ok, true);
  return { referred, attribution: claim.attribution };
}

// A confirmed real payment by `referred` and the earning it produces. `confirmedDaysAgo` lets a test mature a lot.
export async function pay(repo, referred, amountUsd, { type = 'subscription', planId = 'pro', confirmedDaysAgo = 0, walletBonusMicroUsd = 0 } = {}) {
  const tx = await repo.paymentTransactions.create({
    userId: referred.id, type, provider: 'manual', amountMicroUsd: Math.round(amountUsd * MICRO), currency: 'USD', productId: planId, metadata: { planId }
  });
  const confirmedAt = isoAgo(confirmedDaysAgo);
  await repo.paymentTransactions.setStatus(tx.id, 'confirmed', { confirmedAt });
  const result = await repo.referralEarnings.recordEarning({
    source: type, sourceEventId: tx.id, paymentTransactionId: tx.id, referredUserId: referred.id, planId,
    finalAmountMicroUsd: Math.round(amountUsd * MICRO), taxMicroUsd: 0, excludedMicroUsd: 0, walletBonusMicroUsd, confirmedAt
  });
  return { tx, result };
}

const ASSET = {
  symbol: 'USDT', chainId: 56, tokenContract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18,
  treasurySender: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
};
export function payoutArgs(userId, amountMicroUsd, key, overrides = {}) {
  return {
    userId, idempotencyKey: key, amountMicroUsd, minPayoutMicroUsd: 10 * MICRO,
    asset: { ...ASSET, atomicAmount: String(BigInt(amountMicroUsd) * 10n ** 12n) },
    recipient: { enc: 'v1:enc', hash: 'h' + key, masked: '0x1234…abcd' },
    policySnapshot: { minConfirmations: 15 }, termsVersion: 'v1', acknowledgements: { irreversible: true }, kycStatusSnapshot: 'verified',
    emailVerifiedSnapshot: true, reauthAt: new Date().toISOString(), ...overrides
  };
}
const hash = (c) => '0x' + c.repeat(64);

export function registerReferralRepoScenarios({ test, makeRepo, label }) {
  const t = (name, fn) => test(`[${label}] ${name}`, async () => fn(await makeRepo()));

  // --- programs & versions -------------------------------------------------------------------------
  t('program versions: draft is editable, publish freezes it, a new version supersedes the old one', async (repo) => {
    const ctx = await setupProgram(repo, { commissionBps: 1000 });
    assert.equal(ctx.version.status, 'published');
    assert.equal((await repo.referralPrograms.getProgram(ctx.program.id)).status, 'active', 'first publish activates a draft program');
    await assert.rejects(() => repo.referralPrograms.updateDraftVersion(ctx.version.id, { commissionBps: 5000 }), /REFERRAL_VERSION_NOT_DRAFT/);
    const draft2 = await repo.referralPrograms.createDraftVersion(ctx.program.id, parseProgramVersionInput({ commissionBps: 1500, eligibleSources: ['subscription'], attributionWindowDays: 30, holdDays: 0, cashOutMinimumUsd: 10 }), { createdBy: ctx.admin.id });
    assert.equal(draft2.versionNo, 2);
    const edited = await repo.referralPrograms.updateDraftVersion(draft2.id, { commissionBps: 1600 });
    assert.equal(edited.commissionBps, 1600);
    assert.notEqual(edited.rulesHash, draft2.rulesHash, 'editing a draft recomputes the rules hash');
    const v2 = await repo.referralPrograms.publishVersion(draft2.id, { publishedBy: ctx.admin.id });
    const v1After = await repo.referralPrograms.getVersion(ctx.version.id);
    assert.equal(v1After.status, 'superseded');
    assert.equal(v1After.commissionBps, 1000, 'the superseded version keeps its original rules forever');
    assert.equal((await repo.referralPrograms.getPublishedVersion(ctx.program.id)).id, v2.id);
    const platformDefault = await repo.referralPrograms.getPlatformDefault();
    assert.equal(platformDefault.publishedVersion.id, v2.id);
  });
  t('only one platform-default program can exist and an influencer program can never be the default', async (repo) => {
    const ctx = await setupProgram(repo);
    await assert.rejects(() => repo.referralPrograms.createProgram({ kind: 'standard', name: 'Second default', isPlatformDefault: true, createdBy: ctx.admin.id }), /REFERRAL_DEFAULT_PROGRAM_EXISTS/);
    await assert.rejects(() => repo.referralPrograms.createProgram({ kind: 'influencer', name: 'Bad', isPlatformDefault: true, createdBy: ctx.admin.id }), /VALIDATION_FAILED/);
  });
  t('archiving the platform default relinquishes the default flag so a replacement default can be created', async (repo) => {
    const ctx = await setupProgram(repo);
    await repo.referralPrograms.updateProgram(ctx.program.id, { status: 'archived' });
    assert.equal((await repo.referralPrograms.getProgram(ctx.program.id)).isPlatformDefault, false);
    assert.equal(await repo.referralPrograms.getPlatformDefault(), null);
    const replacement = await repo.referralPrograms.createProgram({ kind: 'standard', name: 'Replacement ' + uniq(), isPlatformDefault: true, createdBy: ctx.admin.id });
    assert.equal((await repo.referralPrograms.getPlatformDefault()).program.id, replacement.id);
  });
  t('program status: pause/resume/archive, archived is terminal and blocks new versions', async (repo) => {
    const ctx = await setupProgram(repo);
    assert.equal((await repo.referralPrograms.updateProgram(ctx.program.id, { status: 'paused' })).status, 'paused');
    assert.equal((await repo.referralPrograms.updateProgram(ctx.program.id, { status: 'active' })).status, 'active');
    await repo.referralPrograms.updateProgram(ctx.program.id, { status: 'archived' });
    await assert.rejects(() => repo.referralPrograms.updateProgram(ctx.program.id, { status: 'active' }), /REFERRAL_PROGRAM_ARCHIVED/);
    await assert.rejects(() => repo.referralPrograms.createDraftVersion(ctx.program.id, parseProgramVersionInput({ commissionBps: 1, eligibleSources: ['subscription'], attributionWindowDays: 30, holdDays: 0, cashOutMinimumUsd: 10 }), { createdBy: ctx.admin.id }), /REFERRAL_PROGRAM_ARCHIVED/);
  });

  // --- assignments ---------------------------------------------------------------------------------
  t('assignments: edit supersedes, one active per user, history is kept, influencer needs a published influencer version', async (repo) => {
    const ctx = await setupProgram(repo);
    const user = await createUser(repo, 'Partner');
    const first = await repo.referralPrograms.assign(user.id, parseAssignmentInput({ mode: 'disabled' }), { createdBy: ctx.admin.id });
    assert.equal(first.mode, 'disabled');
    await assert.rejects(() => repo.referralPrograms.assign(user.id, parseAssignmentInput({ mode: 'influencer', programVersionId: ctx.version.id }), { createdBy: ctx.admin.id }), /VALIDATION_FAILED/, 'a standard-kind version cannot back an influencer assignment');
    const inf = await repo.referralPrograms.createProgram({ kind: 'influencer', name: 'Creators ' + uniq(), createdBy: ctx.admin.id });
    const draft = await repo.referralPrograms.createDraftVersion(inf.id, parseProgramVersionInput({ commissionBps: 2000, eligibleSources: ['subscription', 'storage_purchase'], attributionWindowDays: 60, holdDays: 7, cashOutMinimumUsd: 10 }), { createdBy: ctx.admin.id });
    await assert.rejects(() => repo.referralPrograms.assign(user.id, parseAssignmentInput({ mode: 'influencer', programVersionId: draft.id }), { createdBy: ctx.admin.id }), /VALIDATION_FAILED/, 'an unpublished draft cannot be pinned');
    const infVersion = await repo.referralPrograms.publishVersion(draft.id, { publishedBy: ctx.admin.id });
    const second = await repo.referralPrograms.assign(user.id, parseAssignmentInput({ mode: 'influencer', programVersionId: infVersion.id, rateBpsOverride: 2500, allowedSources: ['subscription'], partnershipCapUsd: 500, commissionTermDays: 365, notes: 'negotiated' }), { createdBy: ctx.admin.id });
    assert.equal(second.rateBpsOverride, 2500);
    assert.equal(second.partnershipCapMicroUsd, 500 * MICRO);
    assert.equal((await repo.referralPrograms.getActiveAssignment(user.id)).id, second.id);
    const history = await repo.referralPrograms.listAssignments(user.id);
    assert.equal(history.length, 2);
    assert.equal(history.find((a) => a.id === first.id).status, 'superseded');
    await assert.rejects(() => repo.referralPrograms.assign(user.id, parseAssignmentInput({ mode: 'influencer', programVersionId: infVersion.id, allowedSources: ['ai_margin'] }), { createdBy: ctx.admin.id }), /VALIDATION_FAILED/, 'a source restriction can only be a subset of the version');
    assert.equal((await repo.referralPrograms.revokeAssignment(user.id)).revoked, true);
    assert.equal(await repo.referralPrograms.getActiveAssignment(user.id), null);
  });

  // --- codes, clicks, attribution ----------------------------------------------------------------
  t('codes are unique per user, stable, and clicks aggregate without identities', async (repo) => {
    const ctx = await setupProgram(repo);
    assert.equal((await repo.referral.ensureCode(ctx.referrer.id)).id, ctx.code.id);
    assert.match(ctx.code.publicCode, /^[A-Z2-9]{6,10}$/);
    assert.equal((await repo.referral.getCodeByPublicCode(ctx.code.publicCode)).userId, ctx.referrer.id);
    await repo.referral.recordClick({ codeId: ctx.code.id, visitorHash: 'v1' });
    await repo.referral.recordClick({ codeId: ctx.code.id, visitorHash: 'v1' });
    await repo.referral.recordClick({ codeId: ctx.code.id, visitorHash: 'v2' });
    assert.deepEqual(await repo.referral.clickStats(ctx.code.id), { clicks: 3, uniqueVisitors: 2 });
    const funnel = await repo.referral.funnelForReferrer(ctx.referrer.id);
    assert.deepEqual(funnel, { clicks: 3, uniqueVisitors: 2, signups: 0, qualifiedCustomers: 0 });
    assert.deepEqual(Object.keys(funnel).sort(), ['clicks', 'qualifiedCustomers', 'signups', 'uniqueVisitors']);
  });
  t('attribution: one per referred user, self-referral refused, rules are snapshotted', async (repo) => {
    const ctx = await setupProgram(repo, { commissionBps: 1234 });
    const { referred, attribution } = await attribute(repo, ctx);
    assert.equal(attribution.commissionBps, 1234);
    assert.equal(attribution.rulesSnapshot.commissionBps, 1234);
    assert.equal(attribution.rulesSnapshot.versionId, ctx.version.id);
    const again = await repo.referral.claimAttribution({
      referredUserId: referred.id, referrerUserId: ctx.referrer.id, codeId: ctx.code.id, programId: ctx.program.id, programVersionId: ctx.version.id, mode: 'standard',
      commissionBps: 1, rulesSnapshot: attribution.rulesSnapshot
    });
    assert.deepEqual([again.ok, again.reason], [false, 'ALREADY_ATTRIBUTED']);
    const self = await repo.referral.claimAttribution({
      referredUserId: ctx.referrer.id, referrerUserId: ctx.referrer.id, codeId: ctx.code.id, programId: ctx.program.id, programVersionId: ctx.version.id, mode: 'standard',
      commissionBps: 1, rulesSnapshot: attribution.rulesSnapshot
    });
    assert.deepEqual([self.ok, self.reason], [false, 'SELF_REFERRAL']);
    // Editing rules later never touches the snapshot already stored.
    const draft = await repo.referralPrograms.createDraftVersion(ctx.program.id, parseProgramVersionInput({ commissionBps: 9000, eligibleSources: ['subscription'], attributionWindowDays: 30, holdDays: 0, cashOutMinimumUsd: 10 }), { createdBy: ctx.admin.id });
    await repo.referralPrograms.publishVersion(draft.id, { publishedBy: ctx.admin.id });
    assert.equal((await repo.referral.getAttributionByReferred(referred.id)).rulesSnapshot.commissionBps, 1234);
  });
  t('userHasConfirmedPayment ignores pending, refund and zero-amount rows', async (repo) => {
    const ctx = await setupProgram(repo);
    const user = await createUser(repo, 'Buyer');
    assert.equal(await repo.referral.userHasConfirmedPayment(user.id), false);
    const pending = await repo.paymentTransactions.create({ userId: user.id, type: 'subscription', provider: 'manual', amountMicroUsd: 5 * MICRO, currency: 'USD', productId: 'pro', metadata: {} });
    assert.equal(await repo.referral.userHasConfirmedPayment(user.id), false);
    const zero = await repo.paymentTransactions.create({ userId: user.id, type: 'subscription', provider: 'manual', amountMicroUsd: 0, currency: 'USD', productId: 'pro', metadata: {} });
    await repo.paymentTransactions.setStatus(zero.id, 'confirmed', { confirmedAt: new Date().toISOString() });
    assert.equal(await repo.referral.userHasConfirmedPayment(user.id), false);
    await repo.paymentTransactions.setStatus(pending.id, 'confirmed', { confirmedAt: new Date().toISOString() });
    assert.equal(await repo.referral.userHasConfirmedPayment(user.id), true);
    void ctx;
  });

  // --- earnings ------------------------------------------------------------------------------------
  t('earning: a confirmed subscription payment creates one lot + one EARN ledger entry, idempotently', async (repo) => {
    const ctx = await setupProgram(repo, { commissionBps: 1000 });
    const { referred } = await attribute(repo, ctx);
    const { tx, result } = await pay(repo, referred, 20);
    assert.equal(result.outcome, 'earned');
    assert.equal(result.lot.originalMicroUsd, 2 * MICRO);
    assert.equal(result.lot.status, 'available_cash', 'holdDays 0 -> matured immediately');
    const replay = await repo.referralEarnings.recordEarning({ source: 'subscription', sourceEventId: tx.id, paymentTransactionId: tx.id, referredUserId: referred.id, planId: 'pro', finalAmountMicroUsd: 20 * MICRO, confirmedAt: new Date().toISOString() });
    assert.equal(replay.duplicate, true);
    const lots = await repo.referralEarnings.lotsForUser(ctx.referrer.id);
    assert.equal(lots.length, 1);
    const ledger = await repo.referralEarnings.ledgerForUser(ctx.referrer.id);
    assert.deepEqual(ledger.map((e) => [e.entryType, e.state, e.amountMicroUsd]), [['EARN', 'available_cash', 2 * MICRO]]);
    assert.equal((await repo.referral.funnelForReferrer(ctx.referrer.id)).qualifiedCustomers, 1);
  });
  t('earning: a wallet top-up, a zero amount and a non-attributed payer never create a lot', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    const topUp = await pay(repo, referred, 50, { type: 'wallet_topup' });
    assert.equal(topUp.result.outcome, 'skipped');
    assert.equal(topUp.result.reason, 'SOURCE_NOT_ELIGIBLE');
    const zero = await pay(repo, referred, 0);
    assert.equal(zero.result.outcome, 'skipped');
    assert.equal(zero.result.reason, 'ZERO_AMOUNT');
    const stranger = await createUser(repo, 'Stranger');
    assert.equal((await pay(repo, stranger, 30)).result.outcome, 'none');
    assert.equal((await repo.referralEarnings.lotsForUser(ctx.referrer.id)).length, 0);
    assert.equal((await repo.referralEarnings.getOutcome('wallet_topup', topUp.tx.id)).outcome, 'skipped');
  });
  t('earning: storage purchases only earn when the program lists them', async (repo) => {
    const ctx = await setupProgram(repo, { extra: { eligibleSources: ['subscription', 'storage_purchase'] } });
    const { referred } = await attribute(repo, ctx);
    const storage = await pay(repo, referred, 10, { type: 'storage_purchase', planId: 's100' });
    assert.equal(storage.result.outcome, 'earned');
    // A later version without storage: a NEW attribution snapshots it, and storage no longer earns for that customer
    // (while the first customer keeps the terms snapshotted under v1).
    const draft = await repo.referralPrograms.createDraftVersion(ctx.program.id, parseProgramVersionInput({ commissionBps: 1000, eligibleSources: ['subscription'], attributionWindowDays: 30, holdDays: 0, cashOutMinimumUsd: 10 }), { createdBy: ctx.admin.id });
    const v2 = await repo.referralPrograms.publishVersion(draft.id, { publishedBy: ctx.admin.id });
    const other = await attribute(repo, { ...ctx, version: v2 }, 'Later');
    assert.equal((await pay(repo, other.referred, 10, { type: 'storage_purchase', planId: 's100' })).result.reason, 'SOURCE_NOT_ELIGIBLE');
    assert.equal((await pay(repo, referred, 10, { type: 'storage_purchase', planId: 's100' })).result.outcome, 'earned', 'the earlier customer keeps the snapshotted terms');
  });
  t('earning: the hold period keeps a lot pending until it matures', async (repo) => {
    const ctx = await setupProgram(repo, { holdDays: 14 });
    const { referred } = await attribute(repo, ctx);
    const fresh = await pay(repo, referred, 20);
    assert.equal(fresh.result.lot.status, 'pending');
    const summary = await repo.referralEarnings.summaryForUser(ctx.referrer.id);
    assert.equal(summary.totals.pendingMicroUsd, 2 * MICRO);
    assert.equal(summary.totals.availableCashMicroUsd, 0);
    const old = await pay(repo, referred, 20, { confirmedDaysAgo: 30 });
    assert.equal(old.result.lot.status, 'available_cash');
    assert.equal((await repo.referralEarnings.summaryForUser(ctx.referrer.id)).totals.spendableMicroUsd, 2 * MICRO);
  });
  t('earning: caps clamp the commission and the budget is released by a reversal', async (repo) => {
    const ctx = await setupProgram(repo, { extra: { programBudgetCapUsd: 3 } });
    const { referred } = await attribute(repo, ctx);
    const first = await pay(repo, referred, 20); // 2.00
    const second = await pay(repo, referred, 20); // would be 2.00, only 1.00 of budget left
    assert.equal(second.result.outcome, 'clamped');
    assert.equal(second.result.lot.originalMicroUsd, 1 * MICRO);
    const third = await pay(repo, referred, 20);
    assert.equal(third.result.outcome, 'skipped');
    assert.equal(third.result.reason, 'CAP_REACHED');
    await repo.referralEarnings.reverseEarning({ source: 'subscription', sourceEventId: first.tx.id, trigger: 'refund', triggerRef: 'r1', commissionAfterMicroUsd: 0 });
    assert.equal(await repo.referralReports.programBudgetUsed(ctx.program.id), 1 * MICRO, 'a reversal releases its budget');
  });
  t('earning: an explicitly disabled referrer earns nothing new, an existing balance is untouched', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    await pay(repo, referred, 20);
    await repo.referralPrograms.assign(ctx.referrer.id, parseAssignmentInput({ mode: 'disabled' }), { createdBy: ctx.admin.id });
    const blocked = await pay(repo, referred, 20);
    assert.equal(blocked.result.reason, 'REFERRER_DISABLED');
    assert.equal((await repo.referralEarnings.summaryForUser(ctx.referrer.id)).totals.availableCashMicroUsd, 2 * MICRO);
  });
  t('earning: a paused program keeps earning for an existing attribution, an archived one stops', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    await repo.referralPrograms.updateProgram(ctx.program.id, { status: 'paused' });
    assert.equal((await pay(repo, referred, 20)).result.outcome, 'earned');
    await repo.referralPrograms.updateProgram(ctx.program.id, { status: 'archived' });
    assert.equal((await pay(repo, referred, 20)).result.reason, 'PROGRAM_ARCHIVED');
  });
  t('findUnprocessedQualifyingPayments lists attributed confirmed payments with no recorded outcome', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    const tx = await repo.paymentTransactions.create({ userId: referred.id, type: 'subscription', provider: 'manual', amountMicroUsd: 9 * MICRO, currency: 'USD', productId: 'pro', metadata: {} });
    await repo.paymentTransactions.setStatus(tx.id, 'confirmed', { confirmedAt: new Date().toISOString() });
    assert.deepEqual((await repo.referralEarnings.findUnprocessedQualifyingPayments()).map((r) => r.transactionId), [tx.id]);
    await repo.referralEarnings.recordEarning({ source: 'subscription', sourceEventId: tx.id, paymentTransactionId: tx.id, referredUserId: referred.id, planId: 'pro', finalAmountMicroUsd: 9 * MICRO, confirmedAt: new Date().toISOString() });
    assert.deepEqual(await repo.referralEarnings.findUnprocessedQualifyingPayments(), []);
  });

  // --- AI conversion ---------------------------------------------------------------------------------
  t('conversion: FIFO across lots, credits the PROMO balance through REFERRAL_AI_CONVERSION, replays idempotently', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    const a = await pay(repo, referred, 30, { confirmedDaysAgo: 3 }); // 3.00 oldest
    const b = await pay(repo, referred, 20, { confirmedDaysAgo: 2 }); // 2.00
    void b;
    const before = await repo.wallet.getAccount(ctx.referrer.id);
    const done = await repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 4 * MICRO, idempotencyKey: 'c1' });
    assert.equal(done.ok, true);
    assert.deepEqual(done.allocations.map((x) => x.amountMicroUsd), [3 * MICRO, 1 * MICRO], 'oldest lot is drained first');
    assert.equal(done.allocations[0].lotId, a.result.lot.id);
    const after = await repo.wallet.getAccount(ctx.referrer.id);
    assert.equal(after.promoBalanceMicroUsd - before.promoBalanceMicroUsd, 4 * MICRO, 'credited to the promo balance');
    assert.equal(after.paidBalanceMicroUsd, before.paidBalanceMicroUsd, 'never the paid balance');
    const walletLedger = await repo.wallet.ledgerForUser(ctx.referrer.id, { limit: 20 });
    assert.ok(walletLedger.some((e) => e.type === 'REFERRAL_AI_CONVERSION' && e.promoDeltaMicroUsd === 4 * MICRO && e.cashDeltaMicroUsd === 0));
    const replay = await repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 4 * MICRO, idempotencyKey: 'c1' });
    assert.equal(replay.duplicate, true);
    assert.equal((await repo.wallet.getAccount(ctx.referrer.id)).promoBalanceMicroUsd, after.promoBalanceMicroUsd, 'a replay never credits twice');
    const summary = await repo.referralEarnings.summaryForUser(ctx.referrer.id);
    assert.equal(summary.totals.aiConvertedMicroUsd, 4 * MICRO);
    assert.equal(summary.totals.availableCashMicroUsd, 1 * MICRO);
    const tooMuch = await repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 2 * MICRO, idempotencyKey: 'c2' });
    assert.deepEqual([tooMuch.ok, tooMuch.reason, tooMuch.spendableMicroUsd], [false, 'INSUFFICIENT_SPENDABLE', 1 * MICRO]);
  });
  t('conversion: a still-pending lot cannot be converted', async (repo) => {
    const ctx = await setupProgram(repo, { holdDays: 14 });
    const { referred } = await attribute(repo, ctx);
    await pay(repo, referred, 20);
    const result = await repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 1, idempotencyKey: 'p' });
    assert.equal(result.ok, false);
    assert.equal(result.spendableMicroUsd, 0);
  });
  t('conversion vs payout reservation: they draw on the same pool, so only one of two competing requests can win', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    await pay(repo, referred, 120, { confirmedDaysAgo: 1 }); // 12.00 available
    const [conversion, payout] = await Promise.all([
      repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 12 * MICRO, idempotencyKey: 'race-c' }),
      repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 12 * MICRO, 'race-p'))
    ]);
    assert.equal([conversion.ok, payout.ok].filter(Boolean).length, 1, 'exactly one of the two wins');
    const totals = (await repo.referralEarnings.summaryForUser(ctx.referrer.id)).totals;
    assert.equal(totals.aiConvertedMicroUsd + totals.payoutReservedMicroUsd, 12 * MICRO, 'the 12.00 is spent exactly once');
    assert.equal(totals.availableCashMicroUsd, 0);
  });

  // --- payouts ---------------------------------------------------------------------------------------
  t('payout: the threshold, block flag and open debt are enforced under the lock', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    await pay(repo, referred, 200, { confirmedDaysAgo: 1 }); // 20.00
    const below = await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 5 * MICRO, 'k-below'));
    assert.deepEqual([below.ok, below.reason], [false, 'BELOW_MINIMUM']);
    const over = await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 25 * MICRO, 'k-over'));
    assert.deepEqual([over.ok, over.reason], [false, 'INSUFFICIENT_SPENDABLE']);
    await repo.referral.setPayoutBlocked(ctx.referrer.id, { blocked: true, reason: 'review' });
    assert.equal((await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'k-blocked'))).reason, 'PAYOUT_BLOCKED');
    await repo.referral.setPayoutBlocked(ctx.referrer.id, { blocked: false });
    const ok = await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'k-ok'));
    assert.equal(ok.ok, true);
    assert.equal(ok.request.status, 'requested');
    assert.equal(ok.request.atomicAmount, '10000000000000000000');
    assert.equal((await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'k-ok'))).duplicate, true, 'the idempotency key replays the same request');
    const totals = (await repo.referralEarnings.summaryForUser(ctx.referrer.id)).totals;
    assert.equal(totals.payoutReservedMicroUsd, 10 * MICRO);
    assert.equal(totals.availableCashMicroUsd, 10 * MICRO);
  });
  t('payout: the state machine, tx-hash uniqueness, and reservation release on reject/cancel', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    await pay(repo, referred, 400, { confirmedDaysAgo: 1 }); // 40.00
    const cancel = (await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'k1'))).request;
    const done = await repo.referralPayouts.transition(cancel.id, { expectedFrom: 'requested', to: 'cancelled', actor: { type: 'user', id: ctx.referrer.id }, fields: { cancelledAt: new Date().toISOString() } });
    assert.equal(done.request.status, 'cancelled');
    assert.equal((await repo.referralEarnings.summaryForUser(ctx.referrer.id)).totals.payoutReservedMicroUsd, 0, 'cancel releases the reservation');
    const stale = await repo.referralPayouts.transition(cancel.id, { expectedFrom: 'requested', to: 'under_review', actor: { type: 'admin', id: ctx.admin.id } });
    assert.deepEqual([stale.ok, stale.reason], [false, 'STATE_CONFLICT']);

    const req = (await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'k2'))).request;
    await assert.rejects(() => repo.referralPayouts.transition(req.id, { expectedFrom: 'requested', to: 'approved', actor: { type: 'admin', id: ctx.admin.id } }), /PAYOUT_ILLEGAL_TRANSITION/);
    await repo.referralPayouts.transition(req.id, { expectedFrom: 'requested', to: 'under_review', actor: { type: 'admin', id: ctx.admin.id }, fields: { reviewedBy: ctx.admin.id, reviewedAt: new Date().toISOString() } });
    await repo.referralPayouts.transition(req.id, { expectedFrom: 'under_review', to: 'approved', actor: { type: 'admin', id: ctx.admin.id }, fields: { approvedBy: ctx.admin.id, approvedAt: new Date().toISOString() } });
    const submitted = await repo.referralPayouts.setTxHash(req.id, { txHash: hash('a').toUpperCase().replace('0X', '0x'), actorId: ctx.admin.id, expectedFrom: 'approved' });
    assert.equal(submitted.request.status, 'submitted');
    assert.equal(submitted.request.txHash, hash('a'), 'the hash is stored lower-cased');

    const other = (await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'k3'))).request;
    await repo.referralPayouts.transition(other.id, { expectedFrom: 'requested', to: 'under_review', actor: { type: 'admin', id: ctx.admin.id } });
    await repo.referralPayouts.transition(other.id, { expectedFrom: 'under_review', to: 'approved', actor: { type: 'admin', id: ctx.admin.id } });
    const clash = await repo.referralPayouts.setTxHash(other.id, { txHash: hash('a'), actorId: ctx.admin.id, expectedFrom: 'approved' });
    assert.deepEqual([clash.ok, clash.reason], [false, 'TX_HASH_ALREADY_USED']);
    const rejected = await repo.referralPayouts.transition(other.id, { expectedFrom: 'approved', to: 'rejected', actor: { type: 'admin', id: ctx.admin.id }, fields: { rejectionReason: 'no' } });
    assert.equal(rejected.request.status, 'rejected');

    await repo.referralPayouts.recordVerification(req.id, { verification: { ok: true, confirmations: 20 }, confirmations: 20 });
    assert.deepEqual([(await repo.referralPayouts.setTxHash(req.id, { txHash: hash('b'), actorId: ctx.admin.id, expectedFrom: 'submitted' })).reason], ['HASH_ALREADY_VERIFIED']);
    await repo.referralPayouts.transition(req.id, { expectedFrom: 'submitted', to: 'confirmed', actor: { type: 'admin', id: ctx.admin.id }, fields: { confirmedAt: new Date().toISOString(), confirmedBy: ctx.admin.id, confirmations: 20 } });
    const paid = await repo.referralPayouts.transition(req.id, { expectedFrom: 'confirmed', to: 'paid', actor: { type: 'admin', id: ctx.admin.id }, fields: { paidAt: new Date().toISOString(), finalizedBy: ctx.admin.id } });
    assert.equal(paid.request.status, 'paid');
    const totals = (await repo.referralEarnings.summaryForUser(ctx.referrer.id)).totals;
    assert.equal(totals.paidMicroUsd, 10 * MICRO);
    assert.equal(totals.payoutReservedMicroUsd, 0);
    assert.equal(totals.availableCashMicroUsd, 30 * MICRO, 'rejected/cancelled reservations returned to available');
    await assert.rejects(() => repo.referralPayouts.transition(req.id, { expectedFrom: 'paid', to: 'failed', actor: { type: 'admin', id: ctx.admin.id } }), /PAYOUT_ILLEGAL_TRANSITION/);
    const events = await repo.referralPayouts.eventsFor(req.id);
    assert.deepEqual(events.map((e) => e.toStatus), ['requested', 'under_review', 'approved', 'submitted', 'confirmed', 'paid']);
  });
  t('payout: a tx hash already used by an inbound crypto invoice is refused', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    await pay(repo, referred, 200, { confirmedDaysAgo: 1 });
    const purchase = await repo.paymentTransactions.create({ userId: referred.id, type: 'wallet_topup', provider: 'bsc-crypto', amountMicroUsd: 5 * MICRO, currency: 'USD', productId: null, metadata: {} });
    const invoice = await repo.cryptoInvoices.create({
      transactionId: purchase.id, chainId: 56, assetSymbol: 'USDT', tokenContract: ASSET.tokenContract, tokenDecimals: 18, recipientAddress: ASSET.treasurySender,
      atomicAmount: '5000000000000000000', usdAmountMicroUsd: 5 * MICRO, exchangeRateSnapshot: 1, expiresAt: new Date(Date.now() + DAY).toISOString(), gatewayInvoiceId: null
    });
    // A fresh random hash per run: crypto_invoices is not truncated between runs on a shared test database.
    const inboundHash = '0x' + randomBytes(32).toString('hex');
    await repo.cryptoInvoices.claimTxHash(invoice.id, inboundHash);
    const req = (await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'kc'))).request;
    await repo.referralPayouts.transition(req.id, { expectedFrom: 'requested', to: 'under_review', actor: { type: 'admin', id: ctx.admin.id } });
    await repo.referralPayouts.transition(req.id, { expectedFrom: 'under_review', to: 'approved', actor: { type: 'admin', id: ctx.admin.id } });
    const clash = await repo.referralPayouts.setTxHash(req.id, { txHash: inboundHash.toUpperCase().replace('0X', '0x'), actorId: ctx.admin.id, expectedFrom: 'approved' });
    assert.deepEqual([clash.ok, clash.reason], [false, 'TX_HASH_ALREADY_USED'], 'compared case-insensitively');
  });

  // --- reversals -------------------------------------------------------------------------------------
  t('reversal: a pending lot is cancelled outright (no debt)', async (repo) => {
    const ctx = await setupProgram(repo, { holdDays: 14 });
    const { referred } = await attribute(repo, ctx);
    const { tx } = await pay(repo, referred, 20);
    const result = await repo.referralEarnings.reverseEarning({ source: 'subscription', sourceEventId: tx.id, trigger: 'refund', triggerRef: 'refund-1', commissionAfterMicroUsd: 0 });
    assert.equal(result.reversed, true);
    assert.deepEqual(result.plan, { totalMicroUsd: 2 * MICRO, fromRemaining: 2 * MICRO, fromReserved: 0, debt: 0 });
    const totals = (await repo.referralEarnings.summaryForUser(ctx.referrer.id)).totals;
    assert.equal(totals.pendingMicroUsd, 0);
    assert.equal(totals.reversedMicroUsd, 2 * MICRO);
    const ledger = await repo.referralEarnings.ledgerForUser(ctx.referrer.id);
    assert.ok(ledger.some((e) => e.entryType === 'REVERSE_PENDING' && e.state === 'reversed'));
    const replay = await repo.referralEarnings.reverseEarning({ source: 'subscription', sourceEventId: tx.id, trigger: 'refund', triggerRef: 'refund-1', commissionAfterMicroUsd: 0 });
    assert.equal(replay.duplicate, true);
    assert.equal((await repo.referralEarnings.summaryForUser(ctx.referrer.id)).totals.reversedMicroUsd, 2 * MICRO, 'a replayed refund never reverses twice');
  });
  t('reversal: available money is reversed, converted money becomes debt that blocks payouts and limits conversion', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    const big = await pay(repo, referred, 300, { confirmedDaysAgo: 2 }); // 30.00
    await pay(repo, referred, 100, { confirmedDaysAgo: 1 }); // 10.00, separate lot
    await repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 30 * MICRO, idempotencyKey: 'c-all-first' }); // drains the first lot entirely
    const result = await repo.referralEarnings.reverseEarning({ source: 'subscription', sourceEventId: big.tx.id, trigger: 'chargeback', triggerRef: 'cb-1', commissionAfterMicroUsd: 0 });
    assert.equal(result.plan.debt, 30 * MICRO, 'value already converted to AI credit is never clawed back, it becomes debt');
    assert.equal(result.plan.fromRemaining, 0);
    const summary = await repo.referralEarnings.summaryForUser(ctx.referrer.id);
    assert.equal(summary.openDebtMicroUsd, 30 * MICRO);
    assert.equal(summary.totals.spendableMicroUsd, 0, 'available (10.00) is fully held back by 30.00 of debt');
    const blocked = await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'kd'));
    assert.deepEqual([blocked.ok, blocked.reason], [false, 'DEBT_OPEN']);
    const stillLimited = await repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 1 * MICRO, idempotencyKey: 'c-debt' });
    assert.equal(stillLimited.ok, false);
    const cases = await repo.referralEarnings.listDebtCases({ userId: ctx.referrer.id });
    assert.equal(cases.length, 1);
    assert.equal(cases[0].status, 'open');
    assert.equal((await repo.referralEarnings.getLot(big.result.lot.id)).status, 'debt');
    await repo.referralEarnings.resolveDebtCase(cases[0].id, { status: 'written_off', note: 'accepted', resolvedBy: ctx.admin.id });
    assert.equal((await repo.referralEarnings.summaryForUser(ctx.referrer.id)).openDebtMicroUsd, 0);
    assert.equal((await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'kd2'))).ok, true, 'resolving the debt lifts the block');
  });
  t('reversal: a pre-send payout reservation is auto-rejected and its other lots are released', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    const first = await pay(repo, referred, 60, { confirmedDaysAgo: 3 }); // 6.00
    await pay(repo, referred, 80, { confirmedDaysAgo: 2 }); // 8.00
    const req = (await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 14 * MICRO, 'kr', { minPayoutMicroUsd: 1 }))).request;
    const result = await repo.referralEarnings.reverseEarning({ source: 'subscription', sourceEventId: first.tx.id, trigger: 'refund', triggerRef: 'r-res', commissionAfterMicroUsd: 0 });
    assert.deepEqual(result.autoRejectedPayoutIds, [req.id]);
    assert.equal(result.plan.fromReserved, 6 * MICRO);
    assert.equal((await repo.referralPayouts.getRequest(req.id)).status, 'rejected');
    const totals = (await repo.referralEarnings.summaryForUser(ctx.referrer.id)).totals;
    assert.equal(totals.payoutReservedMicroUsd, 0);
    assert.equal(totals.reversedMicroUsd, 6 * MICRO);
    assert.equal(totals.availableCashMicroUsd, 8 * MICRO, 'the unaffected lot is spendable again');
  });
  t('reversal: paid-out value becomes debt (never an auto-reject of a sent payout)', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    const { tx } = await pay(repo, referred, 200, { confirmedDaysAgo: 1 }); // 20.00
    const req = (await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'kp'))).request;
    for (const [from, to] of [['requested', 'under_review'], ['under_review', 'approved']]) await repo.referralPayouts.transition(req.id, { expectedFrom: from, to, actor: { type: 'admin', id: ctx.admin.id } });
    await repo.referralPayouts.setTxHash(req.id, { txHash: hash('d'), actorId: ctx.admin.id, expectedFrom: 'approved' });
    const result = await repo.referralEarnings.reverseEarning({ source: 'subscription', sourceEventId: tx.id, trigger: 'refund', triggerRef: 'r-sent', commissionAfterMicroUsd: 0 });
    assert.deepEqual(result.autoRejectedPayoutIds, []);
    assert.equal(result.plan.fromRemaining, 10 * MICRO);
    assert.equal(result.plan.debt, 10 * MICRO, 'the reservation of a submitted request may already have been sent');
    assert.equal((await repo.referralPayouts.getRequest(req.id)).status, 'submitted');
  });
  t('reversal: a partial refund reverses only the increment and a second one only the additional amount', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    const { tx } = await pay(repo, referred, 100, { confirmedDaysAgo: 1 }); // 10.00
    const one = await repo.referralEarnings.reverseEarning({ source: 'subscription', sourceEventId: tx.id, trigger: 'refund', triggerRef: 'p1', commissionAfterMicroUsd: 6 * MICRO });
    assert.equal(one.plan.totalMicroUsd, 4 * MICRO);
    const two = await repo.referralEarnings.reverseEarning({ source: 'subscription', sourceEventId: tx.id, trigger: 'refund', triggerRef: 'p2', commissionAfterMicroUsd: 4 * MICRO });
    assert.equal(two.plan.totalMicroUsd, 2 * MICRO);
    assert.equal((await repo.referralEarnings.summaryForUser(ctx.referrer.id)).totals.reversedMicroUsd, 6 * MICRO);
  });
  t('reversal: a payment with no lot is a harmless no-op', async (repo) => {
    const ctx = await setupProgram(repo);
    const result = await repo.referralEarnings.reverseEarning({ source: 'subscription', sourceEventId: 'unknown', trigger: 'refund', triggerRef: 'x', commissionAfterMicroUsd: 0 });
    assert.deepEqual([result.ok, result.reversed, result.reason], [true, false, 'NO_LOT']);
    void ctx;
  });

  // --- risk, account, ledger integrity ----------------------------------------------------------------
  t('risk: overlap signals are reported, a flagged attribution is visible to the payout review, never auto-banned', async (repo) => {
    const ctx = await setupProgram(repo);
    const first = await attribute(repo, ctx, 'One');
    await repo.referral.setRiskReview(first.attribution.id, { status: 'flagged' });
    assert.equal((await repo.referral.listAttributions({ riskReviewStatus: 'flagged' })).length, 1);
    await pay(repo, first.referred, 200, { confirmedDaysAgo: 1 });
    const req = (await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'kf'))).request;
    assert.equal(await repo.referralPayouts.hasFlaggedRisk(req.id), true, 'the earnings still accrued, the payout review is told');
    await repo.referral.setRiskReview(first.attribution.id, { status: 'cleared' });
    assert.equal(await repo.referralPayouts.hasFlaggedRisk(req.id), false);
    const signals = await repo.referral.signalsForClaim({ referrerUserId: ctx.referrer.id, ipHash: 'nobody', uaHash: 'x' });
    assert.deepEqual(signals, { referrerIpMatch: false, duplicateFingerprintCount: 0 });
  });
  t('the append-only ledger reconciles with the lot buckets', async (repo) => {
    const ctx = await setupProgram(repo);
    const { referred } = await attribute(repo, ctx);
    await pay(repo, referred, 300, { confirmedDaysAgo: 5 });
    await pay(repo, referred, 200, { confirmedDaysAgo: 4 });
    await repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 7 * MICRO, idempotencyKey: 'rec' });
    const req = (await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 10 * MICRO, 'rec-p', { minPayoutMicroUsd: 1 }))).request;
    await repo.referralPayouts.transition(req.id, { expectedFrom: 'requested', to: 'rejected', actor: { type: 'admin', id: ctx.admin.id }, fields: { rejectionReason: 'x' } });
    const ledger = await repo.referralEarnings.ledgerForUser(ctx.referrer.id, { limit: 200 });
    const sumBy = (type) => ledger.filter((e) => e.entryType === type).reduce((s, e) => s + e.amountMicroUsd, 0);
    const totals = (await repo.referralEarnings.summaryForUser(ctx.referrer.id)).totals;
    assert.equal(sumBy('EARN'), totals.lifetimeEarnedMicroUsd);
    assert.equal(sumBy('CONVERT_AI'), totals.aiConvertedMicroUsd);
    assert.equal(sumBy('RESERVE_PAYOUT') - sumBy('RELEASE_PAYOUT'), totals.payoutReservedMicroUsd);
    assert.equal(totals.lifetimeEarnedMicroUsd, totals.aiConvertedMicroUsd + totals.payoutReservedMicroUsd + totals.paidMicroUsd + totals.availableCashMicroUsd + totals.pendingMicroUsd);
  });
  t('terms acceptance and the account row are per user', async (repo) => {
    const ctx = await setupProgram(repo);
    const account = await repo.referral.acceptTerms(ctx.referrer.id, 'terms-v1');
    assert.equal(account.termsAcceptedVersion, 'terms-v1');
    assert.equal((await repo.referral.getAccount(ctx.referrer.id)).payoutBlocked, false);
  });
}
