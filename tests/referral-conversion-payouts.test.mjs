import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { MICRO } from '../server/commercial/referral-rules.mjs';
import { convertReferralToAiCredit } from '../server/commercial/referral-conversion.mjs';
import {
  requestPayout, cancelPayout, startReview, approve, reject, submitHash, verify, markPaid, markFailed, revealRecipient, toCustomerPayoutDto, toAdminPayoutDto, parseRecipientAddress
} from '../server/commercial/referral-payouts.mjs';
import { decryptSecret } from '../server/community/security/crypto-util.mjs';
import { encryptionKeyHex } from '../server/community/security/secrets.mjs';
import { RECIPIENT, SENDER, TOKEN, OTHER, TX_HASH, transferLog, receiptOf, atomic, mockRpc, restoreFetch, payoutWorld, requestBody, publishPayoutSettings } from './helpers/referral-payout-fixtures.mjs';

afterEach(() => restoreFetch());

const code = async (promise) => { try { await promise; return null; } catch (error) { return error.code || error.message; } };
const ask = (world, body = requestBody(), overrides = {}) => requestPayout(world.repo, { user: 'user' in overrides ? overrides.user : world.user, sessionRecord: 'session' in overrides ? overrides.session : world.session, body });
const totals = async (world) => (await world.repo.referralEarnings.summaryForUser(world.ctx.referrer.id)).totals;
const goodReceipt = () => receiptOf({ blockNumber: 100, logs: [transferLog({ amount: atomic(10) })] });

// --- threshold & conversion ------------------------------------------------------------------------------------------
test('below the $10 cash-out threshold, payout is refused but a voluntary conversion to AI credit is allowed - nothing auto-converts', async () => {
  const world = await payoutWorld({ availableUsd: 6 });
  assert.equal(await code(ask(world, requestBody({ amountMicroUsd: 6 * MICRO }))), 'REFERRAL_BELOW_MINIMUM');
  assert.equal((await totals(world)).availableCashMicroUsd, 6 * MICRO, 'the balance is left accumulating, never auto-converted');
  const converted = await convertReferralToAiCredit(world.repo, { userId: world.ctx.referrer.id, amountMicroUsd: 2 * MICRO, idempotencyKey: 'convert-key-1' });
  assert.equal(converted.amountMicroUsd, 2 * MICRO);
  assert.equal((await totals(world)).aiConvertedMicroUsd, 2 * MICRO);
  assert.equal((await totals(world)).availableCashMicroUsd, 4 * MICRO);
});
test('at or above the threshold both a partial conversion and a payout are possible from the same balance', async () => {
  const world = await payoutWorld({ availableUsd: 40 });
  await convertReferralToAiCredit(world.repo, { userId: world.ctx.referrer.id, amountMicroUsd: 15 * MICRO, idempotencyKey: 'convert-key-2' });
  const { request } = await ask(world, requestBody({ amountMicroUsd: 25 * MICRO }));
  assert.equal(request.status, 'requested');
  const t = await totals(world);
  assert.deepEqual([t.aiConvertedMicroUsd, t.payoutReservedMicroUsd, t.availableCashMicroUsd], [15 * MICRO, 25 * MICRO, 0]);
});
test('the effective threshold is the LARGER of the payout config minimum and the program version minimum', async () => {
  const world = await payoutWorld({ availableUsd: 40 });
  await publishPayoutSettings(world.repo, { minPayoutMicroUsd: 20 * MICRO });
  assert.equal(await code(ask(world, requestBody({ amountMicroUsd: 15 * MICRO }))), 'REFERRAL_BELOW_MINIMUM');
  assert.equal((await ask(world, requestBody({ amountMicroUsd: 20 * MICRO }))).request.amountMicroUsd, 20 * MICRO);
});
test('AI conversion: dust, non-integers and a missing idempotency key are refused; insufficient balance is a 409; replays are safe', async () => {
  const world = await payoutWorld({ availableUsd: 5 });
  const userId = world.ctx.referrer.id;
  assert.equal(await code(convertReferralToAiCredit(world.repo, { userId, amountMicroUsd: 5, idempotencyKey: 'convert-key-3' })), 'VALIDATION_FAILED');
  assert.equal(await code(convertReferralToAiCredit(world.repo, { userId, amountMicroUsd: 1.5 * MICRO + 0.5, idempotencyKey: 'convert-key-3' })), 'VALIDATION_FAILED');
  assert.equal(await code(convertReferralToAiCredit(world.repo, { userId, amountMicroUsd: MICRO, idempotencyKey: 'x' })), 'VALIDATION_FAILED');
  assert.equal(await code(convertReferralToAiCredit(world.repo, { userId, amountMicroUsd: 50 * MICRO, idempotencyKey: 'convert-key-4' })), 'REFERRAL_INSUFFICIENT_BALANCE');
  const first = await convertReferralToAiCredit(world.repo, { userId, amountMicroUsd: 3 * MICRO, idempotencyKey: 'convert-key-5' });
  const replay = await convertReferralToAiCredit(world.repo, { userId, amountMicroUsd: 3 * MICRO, idempotencyKey: 'convert-key-5' });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.conversionId, first.conversionId);
  assert.equal(replay.walletPromoBalanceMicroUsd, first.walletPromoBalanceMicroUsd, 'no second credit');
});
test('converted value is a PROMO credit that stays non-withdrawable: it is never in the paid balance and can never re-enter the payout pool', async () => {
  const world = await payoutWorld({ availableUsd: 20 });
  const before = await world.repo.wallet.getAccount(world.ctx.referrer.id);
  await convertReferralToAiCredit(world.repo, { userId: world.ctx.referrer.id, amountMicroUsd: 20 * MICRO, idempotencyKey: 'convert-key-6' });
  const after = await world.repo.wallet.getAccount(world.ctx.referrer.id);
  assert.equal(after.paidBalanceMicroUsd, before.paidBalanceMicroUsd);
  assert.equal(after.promoBalanceMicroUsd - before.promoBalanceMicroUsd, 20 * MICRO);
  assert.equal(await code(ask(world)), 'REFERRAL_INSUFFICIENT_BALANCE', 'nothing is left to cash out; the converted value cannot be paid out');
  assert.equal(await code(world.repo.referralEarnings.convertToAi({ userId: world.ctx.referrer.id, amountMicroUsd: MICRO, idempotencyKey: 'again-1' }).then((r) => { if (!r.ok) throw new Error('REFERRAL_INSUFFICIENT_BALANCE'); })), 'REFERRAL_INSUFFICIENT_BALANCE');
  assert.equal(typeof world.repo.referralEarnings.reverseConversion, 'undefined', 'there is no reverse-conversion operation at all');
});

// --- request gates ---------------------------------------------------------------------------------------------------
test('payout is refused when disabled or not fully configured', async () => {
  const world = await payoutWorld();
  await publishPayoutSettings(world.repo, { enabled: false });
  assert.equal(await code(ask(world)), 'REFERRAL_PAYOUT_DISABLED');
  await publishPayoutSettings(world.repo, { enabled: true, treasurySender: '' });
  assert.equal(await code(ask(world)), 'REFERRAL_PAYOUT_DISABLED', 'an enabled flag can never survive an incomplete configuration');
});
test('a verified email is always required', async () => {
  const world = await payoutWorld();
  const unverified = await world.repo.users.create({ displayName: 'Unverified', email: 'unv@example.test' });
  assert.equal(await code(ask(world, requestBody(), { user: { ...unverified, kycStatus: 'verified' } })), 'EMAIL_NOT_VERIFIED');
});
test('KYC is required when configured, and skippable only by explicit configuration', async () => {
  const world = await payoutWorld();
  const notKyc = { ...world.user, kycStatus: 'pending' };
  assert.equal(await code(ask(world, requestBody(), { user: notKyc })), 'KYC_REQUIRED');
  await publishPayoutSettings(world.repo, { requiredKycStatus: 'none' });
  assert.equal((await ask(world, requestBody(), { user: notKyc })).request.status, 'requested');
});
test('a recent reauthentication is required: a stale or missing reauth is refused with REAUTH_REQUIRED', async () => {
  const world = await payoutWorld();
  const stale = { reauthAt: new Date(Date.now() - 11 * 60 * 1000).toISOString() };
  assert.equal(await code(ask(world, requestBody(), { session: stale })), 'REAUTH_REQUIRED');
  assert.equal(await code(ask(world, requestBody(), { session: { reauthAt: null } })), 'REAUTH_REQUIRED');
  assert.equal(await code(ask(world, requestBody(), { session: null })), 'REAUTH_REQUIRED');
  assert.equal((await ask(world, requestBody(), { session: { reauthAt: new Date(Date.now() - 9 * 60 * 1000).toISOString() } })).request.status, 'requested');
});
test('the payout terms and both irreversible-transfer acknowledgements must be given', async () => {
  const world = await payoutWorld();
  assert.equal(await code(ask(world, requestBody({ acceptedTermsVersion: 'old-version' }))), 'TERMS_NOT_ACCEPTED');
  assert.equal(await code(ask(world, requestBody({ acknowledgeIrreversible: false }))), 'ACKNOWLEDGEMENT_REQUIRED');
  assert.equal(await code(ask(world, requestBody({ acknowledgeNetwork: undefined }))), 'ACKNOWLEDGEMENT_REQUIRED');
});
test('address entered twice: must be valid, equal after normalisation, and never the zero address / token contract / treasury sender', async () => {
  const world = await payoutWorld();
  assert.equal(await code(ask(world, requestBody({ address: 'nope', confirmAddress: 'nope' }))), 'INVALID_ADDRESS');
  assert.equal(await code(ask(world, requestBody({ confirmAddress: OTHER }))), 'ADDRESS_MISMATCH');
  assert.equal(await code(ask(world, requestBody({ confirmAddress: undefined }))), 'INVALID_ADDRESS');
  const zero = '0x' + '0'.repeat(40);
  assert.equal(await code(ask(world, requestBody({ address: zero, confirmAddress: zero }))), 'ADDRESS_NOT_ALLOWED');
  assert.equal(await code(ask(world, requestBody({ address: TOKEN, confirmAddress: TOKEN }))), 'ADDRESS_NOT_ALLOWED');
  assert.equal(await code(ask(world, requestBody({ address: SENDER, confirmAddress: SENDER }))), 'ADDRESS_NOT_ALLOWED');
  // a wrong-checksum mixed-case address is a typo, not an address
  const typo = RECIPIENT.slice(0, -1) + (RECIPIENT.endsWith('9') ? 'A' : '9');
  assert.equal(await code(ask(world, requestBody({ address: typo, confirmAddress: typo }))), 'INVALID_ADDRESS');
  // lowercase and checksum forms are the SAME address
  assert.equal((await ask(world, requestBody({ address: RECIPIENT.toLowerCase(), confirmAddress: RECIPIENT }))).request.status, 'requested');
});
test('parseRecipientAddress returns the canonical checksum address', () => {
  assert.equal(parseRecipientAddress(RECIPIENT.toLowerCase(), RECIPIENT, { tokenContract: TOKEN, treasurySender: SENDER }), RECIPIENT);
});
test('amount and idempotency key are validated; an over-balance request is refused without reserving anything', async () => {
  const world = await payoutWorld({ availableUsd: 12 });
  assert.equal(await code(ask(world, requestBody({ amountMicroUsd: 10.5 * MICRO + 0.5 }))), 'VALIDATION_FAILED');
  assert.equal(await code(ask(world, requestBody({ amountMicroUsd: -5 }))), 'VALIDATION_FAILED');
  assert.equal(await code(ask(world, requestBody({ idempotencyKey: 'short' }))), 'VALIDATION_FAILED');
  assert.equal(await code(ask(world, requestBody({ amountMicroUsd: 13 * MICRO }))), 'REFERRAL_INSUFFICIENT_BALANCE');
  assert.equal((await totals(world)).payoutReservedMicroUsd, 0);
});
test('an account flagged payout_blocked, or with open debt, cannot request a payout', async () => {
  const world = await payoutWorld();
  await world.repo.referral.setPayoutBlocked(world.ctx.referrer.id, { blocked: true, reason: 'review' });
  assert.equal(await code(ask(world)), 'REFERRAL_PAYOUT_BLOCKED');
});

// --- the recipient address: encrypted at rest, masked in responses, immutable -----------------------------------------
test('the recipient is stored ENCRYPTED, its lookup hash is not the address, and every response only carries the masked value', async () => {
  const world = await payoutWorld();
  const { request } = await ask(world);
  assert.ok(request.recipientAddressEnc.startsWith('v1:'), 'AES-GCM envelope');
  assert.doesNotMatch(request.recipientAddressEnc, new RegExp(RECIPIENT.slice(2), 'i'));
  assert.doesNotMatch(request.recipientAddressHash, new RegExp(RECIPIENT.slice(2), 'i'));
  assert.equal(decryptSecret(request.recipientAddressEnc, encryptionKeyHex()), RECIPIENT);
  assert.equal(request.recipientMasked, RECIPIENT.slice(0, 6) + '…' + RECIPIENT.slice(-4));
  const customer = JSON.stringify(toCustomerPayoutDto(request));
  const admin = JSON.stringify(toAdminPayoutDto(request));
  for (const body of [customer, admin]) {
    assert.doesNotMatch(body, new RegExp(RECIPIENT.slice(2), 'i'), 'no full address in an ordinary response');
    assert.doesNotMatch(body, /recipientAddressEnc|recipientAddressHash|v1:/);
  }
  assert.equal((await revealRecipient(world.repo, { id: request.id })).address, RECIPIENT, 'only the dedicated reveal returns it');
});
test('amount and address are immutable once submitted: a state transition can never change them', async () => {
  const world = await payoutWorld();
  const { request } = await ask(world);
  await world.repo.referralPayouts.transition(request.id, {
    expectedFrom: 'requested', to: 'under_review', actor: { type: 'admin', id: world.admin1.id },
    fields: { reviewedBy: world.admin1.id, amountMicroUsd: 1, recipientMasked: 'evil', recipientAddressEnc: 'evil', atomicAmount: '1', txHash: TX_HASH }
  });
  const after = await world.repo.referralPayouts.getRequest(request.id);
  assert.deepEqual([after.amountMicroUsd, after.recipientMasked, after.recipientAddressEnc, after.atomicAmount, after.txHash], [request.amountMicroUsd, request.recipientMasked, request.recipientAddressEnc, request.atomicAmount, null]);
});
test('idempotency: the same key returns the same request and reserves once', async () => {
  const world = await payoutWorld();
  const body = requestBody();
  const first = await ask(world, body);
  const again = await ask(world, body);
  assert.equal(again.duplicate, true);
  assert.equal(again.request.id, first.request.id);
  assert.equal((await totals(world)).payoutReservedMicroUsd, 10 * MICRO);
});
test('the request snapshots the payout policy, terms version, acknowledgements and KYC/email state', async () => {
  const world = await payoutWorld();
  const { request } = await ask(world);
  assert.equal(request.chainId, 56);
  assert.equal(request.tokenContract, TOKEN);
  assert.equal(request.treasurySender, SENDER);
  assert.equal(request.atomicAmount, atomic(10).toString());
  assert.equal(request.policySnapshot.minConfirmations, 15);
  assert.equal(request.termsVersion, 'referral-payout-v1');
  assert.equal(request.acknowledgements.irreversible, true);
  assert.deepEqual([request.kycStatusSnapshot, request.emailVerifiedSnapshot], ['verified', true]);
  assert.equal((await world.repo.referral.getAccount(world.ctx.referrer.id)).termsAcceptedVersion, 'referral-payout-v1');
});

// --- cancel -----------------------------------------------------------------------------------------------------------
test('a user may cancel only before review; cancelling releases the reservation; someone else\'s request is 404', async () => {
  const world = await payoutWorld();
  const { request } = await ask(world);
  const stranger = await world.repo.users.create({ displayName: 'Stranger' });
  assert.equal(await code(cancelPayout(world.repo, { userId: stranger.id, requestId: request.id })), 'REFERRAL_PAYOUT_NOT_FOUND');
  const cancelled = await cancelPayout(world.repo, { userId: world.ctx.referrer.id, requestId: request.id });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal((await totals(world)).payoutReservedMicroUsd, 0);
  assert.equal(await code(cancelPayout(world.repo, { userId: world.ctx.referrer.id, requestId: request.id })), 'REFERRAL_PAYOUT_NOT_CANCELLABLE');
  const second = (await ask(world)).request;
  await startReview(world.repo, { id: second.id, adminId: world.admin1.id });
  assert.equal(await code(cancelPayout(world.repo, { userId: world.ctx.referrer.id, requestId: second.id })), 'REFERRAL_PAYOUT_NOT_CANCELLABLE', 'once review started');
});

// --- admin workflow ---------------------------------------------------------------------------------------------------
async function approvedRequest(world, amount = 10) {
  const { request } = await ask(world, requestBody({ amountMicroUsd: amount * MICRO }));
  await startReview(world.repo, { id: request.id, adminId: world.admin1.id });
  return approve(world.repo, { id: request.id, adminId: world.admin1.id });
}
test('the full happy path: requested -> under_review -> approved -> submitted -> confirmed -> paid, ending with the lots marked paid', async () => {
  const world = await payoutWorld();
  const approved = await approvedRequest(world);
  assert.equal(approved.status, 'approved');
  const submitted = await submitHash(world.repo, { id: approved.id, adminId: world.admin1.id, txHash: TX_HASH });
  assert.equal(submitted.status, 'submitted');
  mockRpc({ receipt: goodReceipt(), blockNumber: 114 });
  const confirmed = await verify(world.repo, { id: approved.id, adminId: world.admin1.id });
  assert.equal(confirmed.request.status, 'confirmed');
  assert.equal(confirmed.verification.ok, true);
  const paid = await markPaid(world.repo, { id: approved.id, adminId: world.admin2.id });
  assert.equal(paid.status, 'paid');
  assert.equal(paid.finalizedBy, world.admin2.id);
  const t = await totals(world);
  assert.deepEqual([t.paidMicroUsd, t.payoutReservedMicroUsd, t.availableCashMicroUsd], [10 * MICRO, 0, 30 * MICRO]);
  const events = await world.repo.referralPayouts.eventsFor(approved.id);
  assert.deepEqual(events.map((e) => e.toStatus), ['requested', 'under_review', 'approved', 'submitted', 'confirmed', 'paid']);
});
test('NEVER paid because an admin typed a hash: a submitted hash cannot be finalised, and a failed verification keeps it submitted', async () => {
  const world = await payoutWorld();
  const approved = await approvedRequest(world);
  await submitHash(world.repo, { id: approved.id, adminId: world.admin1.id, txHash: TX_HASH });
  assert.equal(await code(markPaid(world.repo, { id: approved.id, adminId: world.admin2.id })), 'REFERRAL_PAYOUT_STATE_CONFLICT', 'submitted -> paid is impossible');
  mockRpc({ receipt: receiptOf({ blockNumber: 100, logs: [transferLog({ amount: atomic(9) })] }), blockNumber: 200 });
  const wrongAmount = await verify(world.repo, { id: approved.id, adminId: world.admin1.id });
  assert.equal(wrongAmount.verification.reason, 'AMOUNT_MISMATCH');
  assert.equal(wrongAmount.request.status, 'submitted');
  assert.equal((await totals(world)).paidMicroUsd, 0);
  // the operator fixes the hash; a different transaction verifies and the request advances
  const other = '0x' + 'cd'.repeat(32);
  await submitHash(world.repo, { id: approved.id, adminId: world.admin1.id, txHash: other });
  mockRpc({ receipt: goodReceipt(), blockNumber: 114 });
  assert.equal((await verify(world.repo, { id: approved.id, adminId: world.admin1.id })).request.status, 'confirmed');
});
test('each verification failure keeps the request submitted and is recorded: chain, token, sender, recipient, confirmations', async () => {
  const world = await payoutWorld();
  const approved = await approvedRequest(world);
  await submitHash(world.repo, { id: approved.id, adminId: world.admin1.id, txHash: TX_HASH });
  const cases = [
    [{ chainId: 1, receipt: goodReceipt() }, 'CHAIN_MISMATCH'],
    [{ receipt: receiptOf({ blockNumber: 100, logs: [transferLog({ address: OTHER, amount: atomic(10) })] }) }, 'TOKEN_MISMATCH'],
    [{ receipt: receiptOf({ blockNumber: 100, logs: [transferLog({ from: OTHER, amount: atomic(10) })] }) }, 'SENDER_MISMATCH'],
    [{ receipt: receiptOf({ blockNumber: 100, logs: [transferLog({ to: OTHER, amount: atomic(10) })] }) }, 'RECIPIENT_MISMATCH'],
    [{ receipt: goodReceipt(), blockNumber: 103 }, 'INSUFFICIENT_CONFIRMATIONS'],
    [{ receipt: null }, 'TRANSACTION_NOT_FOUND']
  ];
  for (const [rpc, reason] of cases) {
    mockRpc({ blockNumber: 200, ...rpc });
    const result = await verify(world.repo, { id: approved.id, adminId: world.admin1.id });
    assert.equal(result.verification.reason, reason);
    assert.equal(result.request.status, 'submitted', reason);
    assert.equal((await world.repo.referralPayouts.getRequest(approved.id)).verification.reason, reason, 'the outcome is recorded');
  }
});
test('a duplicate transaction hash is refused - one hash can back only one payout', async () => {
  const world = await payoutWorld();
  const first = await approvedRequest(world);
  await submitHash(world.repo, { id: first.id, adminId: world.admin1.id, txHash: TX_HASH });
  const second = await approvedRequest(world);
  assert.equal(await code(submitHash(world.repo, { id: second.id, adminId: world.admin1.id, txHash: TX_HASH.toUpperCase().replace('0X', '0x') })), 'TX_HASH_ALREADY_USED');
  assert.equal(await code(submitHash(world.repo, { id: second.id, adminId: world.admin1.id, txHash: '0x123' })), 'INVALID_TX_HASH');
});
test('a verified hash cannot be silently replaced', async () => {
  const world = await payoutWorld();
  const approved = await approvedRequest(world);
  await submitHash(world.repo, { id: approved.id, adminId: world.admin1.id, txHash: TX_HASH });
  mockRpc({ receipt: goodReceipt(), blockNumber: 114 });
  await verify(world.repo, { id: approved.id, adminId: world.admin1.id });
  assert.equal(await code(submitHash(world.repo, { id: approved.id, adminId: world.admin1.id, txHash: '0x' + 'ef'.repeat(32) })), 'REFERRAL_PAYOUT_STATE_CONFLICT');
});
test('maker-checker: the approver and the requester can never finalise; a different admin can; it can be relaxed only by explicit configuration', async () => {
  const world = await payoutWorld();
  const approved = await approvedRequest(world);
  await submitHash(world.repo, { id: approved.id, adminId: world.admin1.id, txHash: TX_HASH });
  mockRpc({ receipt: goodReceipt(), blockNumber: 114 });
  await verify(world.repo, { id: approved.id, adminId: world.admin1.id });
  assert.equal(await code(markPaid(world.repo, { id: approved.id, adminId: world.admin1.id })), 'REFERRAL_MAKER_CHECKER', 'the approver cannot finalise');
  assert.equal(await code(markPaid(world.repo, { id: approved.id, adminId: world.ctx.referrer.id })), 'REFERRAL_MAKER_CHECKER', 'the requester cannot finalise');
  assert.equal((await markPaid(world.repo, { id: approved.id, adminId: world.admin2.id })).status, 'paid');

  const relaxed = await payoutWorld({ settings: { makerCheckerRequired: false } });
  const req = await approvedRequest(relaxed);
  await submitHash(relaxed.repo, { id: req.id, adminId: relaxed.admin1.id, txHash: TX_HASH });
  mockRpc({ receipt: goodReceipt(), blockNumber: 114 });
  await verify(relaxed.repo, { id: req.id, adminId: relaxed.admin1.id });
  assert.equal((await markPaid(relaxed.repo, { id: req.id, adminId: relaxed.admin1.id })).status, 'paid');
});
test('finalisation re-verifies on-chain: if the transfer no longer verifies (reorg, wrong data), it is NOT marked paid', async () => {
  const world = await payoutWorld();
  const approved = await approvedRequest(world);
  await submitHash(world.repo, { id: approved.id, adminId: world.admin1.id, txHash: TX_HASH });
  mockRpc({ receipt: goodReceipt(), blockNumber: 114 });
  await verify(world.repo, { id: approved.id, adminId: world.admin1.id });
  mockRpc({ receipt: null, blockNumber: 300 }); // the transaction vanished
  assert.equal(await code(markPaid(world.repo, { id: approved.id, adminId: world.admin2.id })), 'REFERRAL_VERIFICATION_FAILED');
  assert.equal((await world.repo.referralPayouts.getRequest(approved.id)).status, 'confirmed');
  assert.equal((await totals(world)).paidMicroUsd, 0);
});
test('an admin cannot approve their own payout request, and a flagged-risk attribution blocks approval until cleared', async () => {
  const world = await payoutWorld();
  const { request } = await ask(world);
  await startReview(world.repo, { id: request.id, adminId: world.admin1.id });
  assert.equal(await code(approve(world.repo, { id: request.id, adminId: world.ctx.referrer.id })), 'REFERRAL_SELF_APPROVAL');
  const attribution = (await world.repo.referral.listAttributions({ referrerUserId: world.ctx.referrer.id }))[0];
  await world.repo.referral.setRiskReview(attribution.id, { status: 'flagged' });
  assert.equal(await code(approve(world.repo, { id: request.id, adminId: world.admin1.id })), 'REFERRAL_RISK_REVIEW_REQUIRED');
  await world.repo.referral.setRiskReview(attribution.id, { status: 'cleared' });
  assert.equal((await approve(world.repo, { id: request.id, adminId: world.admin1.id })).status, 'approved');
});
test('rejecting releases the reservation and needs a reason; state conflicts are 409', async () => {
  const world = await payoutWorld();
  const { request } = await ask(world);
  assert.equal(await code(reject(world.repo, { id: request.id, adminId: world.admin1.id, reason: '' })), 'VALIDATION_FAILED');
  const rejected = await reject(world.repo, { id: request.id, adminId: world.admin1.id, reason: 'Recipient not confirmed' });
  assert.equal(rejected.status, 'rejected');
  assert.equal((await totals(world)).payoutReservedMicroUsd, 0);
  assert.equal(await code(approve(world.repo, { id: request.id, adminId: world.admin1.id })), 'REFERRAL_PAYOUT_STATE_CONFLICT');
  assert.equal(toCustomerPayoutDto(rejected).statusNote, 'Recipient not confirmed');
});
test('markFailed releases the reservation, but never after the chain verified the transfer', async () => {
  const world = await payoutWorld();
  const a = await approvedRequest(world);
  await submitHash(world.repo, { id: a.id, adminId: world.admin1.id, txHash: TX_HASH });
  const failed = await markFailed(world.repo, { id: a.id, adminId: world.admin1.id, reason: 'Operator sent from the wrong wallet' });
  assert.equal(failed.status, 'failed');
  assert.equal((await totals(world)).payoutReservedMicroUsd, 0);
  const b = await approvedRequest(world);
  await submitHash(world.repo, { id: b.id, adminId: world.admin1.id, txHash: '0x' + '12'.repeat(32) });
  mockRpc({ receipt: goodReceipt(), blockNumber: 114 });
  await verify(world.repo, { id: b.id, adminId: world.admin1.id });
  assert.equal(await code(markFailed(world.repo, { id: b.id, adminId: world.admin1.id, reason: 'oops' })), 'REFERRAL_ALREADY_VERIFIED');
});
test('the customer DTO shows the transaction hash and explorer link only once the server has verified the transfer', async () => {
  const world = await payoutWorld();
  const approved = await approvedRequest(world);
  const submitted = await submitHash(world.repo, { id: approved.id, adminId: world.admin1.id, txHash: TX_HASH });
  assert.deepEqual([toCustomerPayoutDto(submitted).txHash, toCustomerPayoutDto(submitted).explorerUrl], [null, null]);
  mockRpc({ receipt: goodReceipt(), blockNumber: 114 });
  const { request } = await verify(world.repo, { id: approved.id, adminId: world.admin1.id });
  const dto = toCustomerPayoutDto(request);
  assert.equal(dto.txHash, TX_HASH);
  assert.equal(dto.explorerUrl, 'https://bscscan.com/tx/' + TX_HASH);
  assert.equal(dto.chainName, 'BNB Smart Chain (BSC)');
});
