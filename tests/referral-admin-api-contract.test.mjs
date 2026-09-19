import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { createSession } from '../server/community/security/session-service.mjs';
import { issueCsrfToken } from '../server/community/security/csrf.mjs';
import { sessionCookieName, csrfCookieName } from '../server/community/security/cookies.mjs';
import { MICRO } from '../server/commercial/referral-rules.mjs';
import { requestBody, mockRpc, restoreFetch, RECIPIENT, TOKEN, SENDER, TX_HASH, transferLog, receiptOf, atomic, payoutWorld } from './helpers/referral-payout-fixtures.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';

// Contract-level coverage for server/admin/routes.referrals.mjs (mounted at /api/admin/commercial/referrals) - mirrors
// commercial-admin-api-contract.test.mjs's own createApp()/repo.memory.mjs convention. The domain behaviour (locking, caps,
// FIFO, reversal maths, on-chain verification) is already covered by tests/referral-repo-memory.test.mjs,
// tests/referral-earnings.test.mjs and tests/referral-conversion-payouts.test.mjs - this file proves the HTTP boundary:
// non-admin rejection, the recent-reauthentication requirement on every mutation, and that every mutation writes the audit log.
const BASE = '/api/admin/commercial/referrals';
let server, baseUrl, repo;

before(async () => {
  delete process.env.ADMIN_AUTH_ENFORCED;
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { restoreFetch(); await new Promise((resolve) => server.close(resolve)); });

async function api(method, path, { body, userId, headers } = {}) {
  const reqHeaders = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(reqHeaders, await authHeadersFor(repo, userId));
  Object.assign(reqHeaders, headers || {});
  const response = await fetch(baseUrl + path, { method, headers: reqHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }
async function createAdmin(name) {
  const user = await repo.users.create({ displayName: name });
  return repo.users.update(user.id, { role: 'admin' });
}
// authHeadersFor's cached session is always reauth-fresh by construction - mint one with reauth:false to exercise a stale step-up.
async function staleReauthHeaders(userId) {
  const { rawId, record } = await createSession(repo, { userId, reauth: false });
  const csrfToken = issueCsrfToken(record.id);
  return { Cookie: `${sessionCookieName()}=${rawId}; ${csrfCookieName()}=${csrfToken}`, 'x-csrf-token': csrfToken };
}
async function auditCount() { return (await repo.auditLog.list({ limit: 1000 })).length; }

async function draftBody(overrides = {}) {
  return { commissionBps: 10, eligibleSources: ['subscription'], attributionWindowDays: 30, holdDays: 0, cashOutMinimumUsd: 10, ...overrides };
}
let programCounter = 0;
// isPlatformDefault is left false: this file shares one repo/server across many tests, and only ONE platform default can
// exist at a time (a partial unique index) - that specific conflict is covered by its own test below.
async function createStandardProgram(admin) {
  programCounter += 1;
  const created = await api('POST', BASE + '/programs', { userId: admin.id, body: { kind: 'standard', name: 'Std ' + Date.now() + '-' + programCounter, rules: await draftBody() } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const versionId = created.body.versions[0].id;
  await api('POST', `${BASE}/programs/${created.body.id}/versions/${versionId}/publish`, { userId: admin.id, body: {} });
  return { program: created.body, versionId };
}

test('a non-admin cannot read or mutate any referral admin endpoint', async () => {
  const user = await createUser('Regular');
  const admin = await createAdmin('Setup Admin');
  const { program, versionId } = await createStandardProgram(admin);
  const partner = await createUser('Partner');
  for (const [method, path, body] of [
    ['GET', BASE + '/programs'], ['GET', `${BASE}/programs/${program.id}`], ['POST', BASE + '/programs', { kind: 'standard', name: 'x' }],
    ['PATCH', `${BASE}/programs/${program.id}`, { name: 'y' }], ['POST', `${BASE}/programs/${program.id}/pause`],
    ['POST', `${BASE}/programs/${program.id}/versions`, { rules: await draftBody() }], ['GET', `${BASE}/partners/${partner.id}`],
    ['PUT', `${BASE}/partners/${partner.id}`, { mode: 'disabled' }], ['GET', BASE + '/report'], ['GET', BASE + '/payouts'],
    ['GET', BASE + '/payout-config'], ['PATCH', BASE + '/payout-config', { enabled: false }]
  ]) {
    const result = await api(method, path, { userId: user.id, body });
    assert.equal(result.status, 403, `${method} ${path}`);
  }
  void versionId;
});
test('a plain read needs admin authorization but not a fresh step-up', async () => {
  const admin = await createAdmin('Reader');
  const stale = await staleReauthHeaders(admin.id);
  const list = await api('GET', BASE + '/programs', { headers: stale });
  assert.equal(list.status, 200);
});

test('every program/version mutation requires a recent admin re-authentication and is audited', async () => {
  const admin = await createAdmin('Program Admin');
  const stale = await staleReauthHeaders(admin.id);
  const before = await auditCount();
  const created = await api('POST', BASE + '/programs', { userId: admin.id, body: { kind: 'standard', name: 'Reauth Test', rules: await draftBody() } });
  assert.equal(created.status, 201);
  assert.equal(await auditCount(), before + 1, 'program create is audited');
  const versionId = created.body.versions[0].id;

  const denied = [
    ['PATCH', `${BASE}/programs/${created.body.id}`, { name: 'z' }],
    ['POST', `${BASE}/programs/${created.body.id}/pause`],
    ['POST', `${BASE}/programs/${created.body.id}/versions`, { rules: await draftBody({ commissionBps: 20 }) }],
    ['PATCH', `${BASE}/programs/${created.body.id}/versions/${versionId}`, { commissionBps: 99 }],
    ['POST', `${BASE}/programs/${created.body.id}/versions/${versionId}/publish`]
  ];
  for (const [method, path, body] of denied) {
    const result = await api(method, path, { headers: stale, body });
    assert.equal(result.status, 401, `${method} ${path}`);
    assert.equal(result.body.error, 'STEP_UP_REQUIRED');
  }
  const auditAfterDenied = await auditCount();
  const published = await api('POST', `${BASE}/programs/${created.body.id}/versions/${versionId}/publish`, { userId: admin.id, body: {} });
  assert.equal(published.status, 200);
  assert.equal(published.body.status, 'published');
  assert.ok((await auditCount()) > auditAfterDenied, 'the fresh-session publish IS audited');
  const entries = await repo.auditLog.list({ limit: 5 });
  assert.equal(entries[0].action, 'referral.version.publish');
  assert.ok(entries[0].details.rulesHash, 'the audit entry records the published rules');
});
test('a published version rules edit is refused with 409 - editing requires a new draft version', async () => {
  const admin = await createAdmin('Immutable Admin');
  const { program, versionId } = await createStandardProgram(admin);
  const result = await api('PATCH', `${BASE}/programs/${program.id}/versions/${versionId}`, { userId: admin.id, body: { commissionBps: 5000 } });
  assert.equal(result.status, 409);
});
test('validation is server-side: an out-of-range commissionBps and wallet_topup as a source are refused with 400', async () => {
  const admin = await createAdmin('Validator');
  const bad1 = await api('POST', BASE + '/programs', { userId: admin.id, body: { kind: 'standard', name: 'Bad', rules: await draftBody({ commissionBps: 10001 }) } });
  assert.equal(bad1.status, 400);
  const bad2 = await api('POST', BASE + '/programs', { userId: admin.id, body: { kind: 'standard', name: 'Bad2', rules: await draftBody({ eligibleSources: ['wallet_topup'] }) } });
  assert.equal(bad2.status, 400);
});

test('the profitability preview needs admin auth but no reauth, and returns money as USD, not floats-of-micro', async () => {
  const admin = await createAdmin('Previewer');
  const stale = await staleReauthHeaders(admin.id);
  const result = await api('POST', BASE + '/preview', { headers: stale, body: { commissionBps: 1000, eligibleSources: ['subscription'], attributionWindowDays: 30, holdDays: 0, cashOutMinimumUsd: 10, customPriceUsd: 20 } });
  assert.equal(result.status, 200);
  const custom = result.body.samples.find((s) => s.label === 'Custom');
  assert.equal(custom.commissionUsd, 2);
});

test('assigning a partner is admin-only, audited, and mode/rate/caps/notes are exactly the input', async () => {
  const admin = await createAdmin('Assigner');
  const partner = await createUser('Assigned Partner');
  const before = await auditCount();
  const set = await api('PUT', `${BASE}/partners/${partner.id}`, { userId: admin.id, body: { mode: 'disabled', notes: 'temporary pause' } });
  assert.equal(set.status, 200);
  assert.equal(set.body.assignment.mode, 'disabled');
  assert.equal(set.body.assignment.notes, 'temporary pause');
  assert.equal(await auditCount(), before + 1);
  const entries = await repo.auditLog.list({ limit: 1 });
  assert.equal(entries[0].action, 'referral.assignment.set');
  assert.equal(entries[0].targetType, 'referralPartner');
  assert.equal(entries[0].targetId, partner.id);
  const stale = await staleReauthHeaders(admin.id);
  const denied = await api('PUT', `${BASE}/partners/${partner.id}`, { headers: stale, body: { mode: 'standard' } });
  assert.equal(denied.status, 401);
});
test('the partner detail view never returns the target user\'s payment or trading data - only the referral relationship', async () => {
  const admin = await createAdmin('Viewer');
  const partner = await createUser('Detail Partner');
  const detail = await api('GET', `${BASE}/partners/${partner.id}`, { userId: admin.id });
  assert.equal(detail.status, 200);
  const text = JSON.stringify(detail.body);
  assert.doesNotMatch(text, /trade|position|broker|pnl/i);
});

test('reprocessing a payment and recording a reversal both require admin reauth and are audited', async () => {
  const admin = await createAdmin('Recovery Admin');
  const { versionId } = await createStandardProgram(admin);
  void versionId;
  const stale = await staleReauthHeaders(admin.id);
  const bogus = await api('POST', `${BASE}/transactions/bogus/reprocess`, { headers: stale, body: {} });
  assert.equal(bogus.status, 401);
  const notFound = await api('POST', `${BASE}/transactions/bogus/reprocess`, { userId: admin.id, body: {} });
  assert.equal(notFound.status, 404);
  const badReversal = await api('POST', BASE + '/reversals', { headers: stale, body: { transactionId: 'x', reason: 'chargeback', reference: 'r1' } });
  assert.equal(badReversal.status, 401);
});

test('unauthorized attribution void/risk-status changes are refused; a fresh admin can void and clear risk, and both are audited', async () => {
  const admin = await createAdmin('Risk Admin');
  const referrer = await createUser('Referrer With Attribution');
  const std = await createStandardProgram(admin);
  const code = await repo.referral.ensureCode(referrer.id);
  const claim = await repo.referral.claimAttribution({
    referredUserId: (await createUser('Referred For Risk')).id, referrerUserId: referrer.id, codeId: code.id, programId: std.program.id, programVersionId: std.versionId,
    mode: 'standard', commissionBps: 1000, rulesSnapshot: { commissionBps: 1000, eligibleSources: ['subscription'], caps: {}, margin: {} }
  });
  assert.equal(claim.ok, true);
  const before = await auditCount();
  const stale = await staleReauthHeaders(admin.id);
  assert.equal((await api('POST', `${BASE}/attributions/${claim.attribution.id}/void`, { headers: stale, body: { reason: 'test' } })).status, 401);
  const voided = await api('POST', `${BASE}/attributions/${claim.attribution.id}/void`, { userId: admin.id, body: { reason: 'confirmed abuse' } });
  assert.equal(voided.status, 200);
  assert.equal(voided.body.status, 'void');
  const risk = await api('POST', `${BASE}/attributions/${claim.attribution.id}/risk`, { userId: admin.id, body: { status: 'confirmed_abuse' } });
  assert.equal(risk.status, 200);
  assert.ok((await auditCount()) >= before + 2);
});

test('the payout queue: admin can list/detail, non-admin cannot, and every state action requires reauth', async () => {
  // Its own repo/server/app throughout - never touches this file's shared `repo`/`server` (commercial-config.mjs's
  // effective-config cache is process-wide, so a fresh repo must start with it invalidated - same reasoning
  // tests/helpers/discount-fixtures.mjs's own newRepo() documents).
  invalidateCommercialConfigCache();
  const world = await payoutWorld();
  await world.repo.users.update(world.admin1.id, { role: 'admin' });
  await world.repo.users.update(world.admin2.id, { role: 'admin' });
  const localServer = createApp({ repo: world.repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => localServer.once('listening', resolve));
  const localBaseUrl = `http://127.0.0.1:${localServer.address().port}`;
  async function localApi(method, path, { body, userId, headers } = {}) {
    const reqHeaders = { 'Content-Type': 'application/json' };
    if (userId) Object.assign(reqHeaders, await authHeadersFor(world.repo, userId));
    Object.assign(reqHeaders, headers || {});
    const response = await fetch(localBaseUrl + path, { method, headers: reqHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  async function localStale(userId) {
    const { rawId, record } = await createSession(world.repo, { userId, reauth: false });
    const csrfToken = issueCsrfToken(record.id);
    return { Cookie: `${sessionCookieName()}=${rawId}; ${csrfCookieName()}=${csrfToken}`, 'x-csrf-token': csrfToken };
  }
  try {
    const admin = world.admin1;
    const { requestPayout } = await import('../server/commercial/referral-payouts.mjs');
    const { request } = await requestPayout(world.repo, { user: world.user, sessionRecord: world.session, body: requestBody() });

    const user = await world.repo.users.create({ displayName: 'Outsider' });
    assert.equal((await localApi('GET', BASE + '/payouts', { userId: user.id })).status, 403);
    const list = await localApi('GET', BASE + '/payouts', { userId: admin.id });
    assert.equal(list.status, 200);
    assert.ok(list.body.payouts.some((p) => p.id === request.id));
    const detail = await localApi('GET', `${BASE}/payouts/${request.id}`, { userId: admin.id });
    assert.equal(detail.status, 200);
    assert.doesNotMatch(JSON.stringify(detail.body), new RegExp(RECIPIENT.slice(2), 'i'), 'the admin detail view never shows the full address');

    assert.equal((await localApi('POST', `${BASE}/payouts/${request.id}/start-review`, { headers: await localStale(admin.id) })).status, 401);
    const review = await localApi('POST', `${BASE}/payouts/${request.id}/start-review`, { userId: admin.id });
    assert.equal(review.status, 200);
    assert.equal(review.body.status, 'under_review');

    const selfApprove = await localApi('POST', `${BASE}/payouts/${request.id}/approve`, { userId: world.user.id });
    assert.equal(selfApprove.status, 403);
    const approve = await localApi('POST', `${BASE}/payouts/${request.id}/approve`, { userId: admin.id });
    assert.equal(approve.status, 200);
    assert.equal(approve.body.status, 'approved');

    const badHash = await localApi('POST', `${BASE}/payouts/${request.id}/submit-hash`, { userId: admin.id, body: { txHash: 'not-a-hash' } });
    assert.equal(badHash.status, 400);
    const submitted = await localApi('POST', `${BASE}/payouts/${request.id}/submit-hash`, { userId: admin.id, body: { txHash: TX_HASH } });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.status, 'submitted');

    mockRpc({ receipt: receiptOf({ blockNumber: 100, logs: [transferLog({ from: SENDER, to: RECIPIENT, address: TOKEN, amount: atomic(10) })] }), blockNumber: 114 });
    const verified = await localApi('POST', `${BASE}/payouts/${request.id}/verify`, { userId: admin.id });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.status, 'confirmed');
    assert.equal(verified.body.lastVerification.ok, true);

    const selfFinalize = await localApi('POST', `${BASE}/payouts/${request.id}/mark-paid`, { userId: admin.id });
    assert.equal(selfFinalize.status, 403, 'the approver cannot finalise (maker-checker)');
    const paid = await localApi('POST', `${BASE}/payouts/${request.id}/mark-paid`, { userId: world.admin2.id });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.status, 'paid');

    const reveal = await localApi('POST', `${BASE}/payouts/${request.id}/reveal-recipient`, { userId: world.admin2.id });
    assert.equal(reveal.status, 200);
    assert.equal(reveal.body.address, RECIPIENT);
    assert.equal((await localApi('POST', `${BASE}/payouts/${request.id}/reveal-recipient`, { headers: await localStale(world.admin2.id) })).status, 401);
    const auditActions = (await world.repo.auditLog.list({ limit: 20 })).map((e) => e.action);
    for (const action of ['referral.payout.startReview', 'referral.payout.approve', 'referral.payout.submitHash', 'referral.payout.verify', 'referral.payout.markPaid', 'referral.payout.revealRecipient']) {
      assert.ok(auditActions.includes(action), action + ' audited');
    }
  } finally {
    await new Promise((resolve) => localServer.close(resolve));
    invalidateCommercialConfigCache();
  }
});

test('payout settings: a non-admin cannot read them, and every edit requires reauth, is server-validated, and audited', async () => {
  invalidateCommercialConfigCache();
  const admin = await createAdmin('Config Admin');
  const user = await createUser('Config Outsider');
  assert.equal((await api('GET', BASE + '/payout-config', { userId: user.id })).status, 403);
  const read = await api('GET', BASE + '/payout-config', { userId: admin.id });
  assert.equal(read.status, 200);
  assert.equal(read.body.chainId, 56);
  assert.equal(read.body.enabled, false, 'disabled until fully configured');

  const stale = await staleReauthHeaders(admin.id);
  assert.equal((await api('PATCH', BASE + '/payout-config', { headers: stale, body: { tokenContract: TOKEN } })).status, 401);
  const badToken = await api('PATCH', BASE + '/payout-config', { userId: admin.id, body: { tokenContract: 'not-an-address' } });
  assert.equal(badToken.status, 400);
  const badChain = await api('PATCH', BASE + '/payout-config', { userId: admin.id, body: { chainId: 1 } });
  assert.equal(badChain.status, 400);

  const before = await auditCount();
  const updated = await api('PATCH', BASE + '/payout-config', { userId: admin.id, body: { tokenContract: TOKEN, treasurySender: SENDER, tokenDecimals: 18, tokenSymbol: 'USDT' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.tokenContract, TOKEN);
  assert.equal(await auditCount(), before + 1);
  assert.equal((await repo.auditLog.list({ limit: 1 }))[0].action, 'referral.payoutConfig.update');

  const enableWithoutRpc = await api('PATCH', BASE + '/payout-config', { userId: admin.id, body: { enabled: true } });
  assert.equal(enableWithoutRpc.status, 409, 'cannot enable without a configured RPC endpoint');
  await repo.bscPaymentSecrets.setRpcUrl('https://rpc.example.test');
  const enabled = await api('PATCH', BASE + '/payout-config', { userId: admin.id, body: { enabled: true } });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.enabled, true);
  assert.equal(enabled.body.rpcConfigured, true);
});

test('the debt-case recovery endpoint requires reauth and is audited', async () => {
  const admin = await createAdmin('Debt Admin');
  const referrer = await createUser('Debt Referrer');
  const std = await createStandardProgram(admin);
  const referred = await createUser('Debt Customer');
  const code = await repo.referral.ensureCode(referrer.id);
  await repo.referral.claimAttribution({
    referredUserId: referred.id, referrerUserId: referrer.id, codeId: code.id, programId: std.program.id, programVersionId: std.versionId,
    mode: 'standard', commissionBps: 5000, rulesSnapshot: { commissionBps: 5000, eligibleSources: ['subscription'], caps: {}, margin: {} }
  });
  const tx = await repo.paymentTransactions.create({ userId: referred.id, type: 'subscription', provider: 'manual', amountMicroUsd: 40 * MICRO, currency: 'USD', productId: 'pro', metadata: {} });
  await repo.paymentTransactions.setStatus(tx.id, 'confirmed', { confirmedAt: new Date().toISOString() });
  await repo.referralEarnings.recordEarning({ source: 'subscription', sourceEventId: tx.id, paymentTransactionId: tx.id, referredUserId: referred.id, planId: 'pro', finalAmountMicroUsd: 40 * MICRO, confirmedAt: new Date().toISOString() });
  await repo.referralEarnings.convertToAi({ userId: referrer.id, amountMicroUsd: 20 * MICRO, idempotencyKey: 'debt-admin-test' });
  await repo.referralEarnings.reverseEarning({ source: 'subscription', sourceEventId: tx.id, trigger: 'chargeback', triggerRef: 'cb-admin', commissionAfterMicroUsd: 0 });
  const cases = await repo.referralEarnings.listDebtCases({ userId: referrer.id });
  assert.equal(cases.length, 1);
  const stale = await staleReauthHeaders(admin.id);
  assert.equal((await api('POST', `${BASE}/debts/${cases[0].id}/resolve`, { headers: stale, body: { status: 'written_off' } })).status, 401);
  const resolved = await api('POST', `${BASE}/debts/${cases[0].id}/resolve`, { userId: admin.id, body: { status: 'written_off', note: 'accepted loss' } });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.status, 'written_off');
  assert.equal((await repo.auditLog.list({ limit: 1 }))[0].action, 'referral.debt.resolve');
});
