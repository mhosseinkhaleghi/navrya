// The manual, audited referral payout workflow: customer request/cancel and the admin review -> approve -> record hash ->
// (server verifies on-chain) -> confirm -> a DIFFERENT admin finalises -> paid path. There is NO hot wallet, treasury key,
// mnemonic, signer or broadcast anywhere - a treasury operator sends the USDT by hand; this code only records and verifies.
//
// Policy is enforced HERE (repo.referralPayouts.* enforces atomicity, the reservation, the state re-check under the lock, and
// migration 070 enforces the state machine and immutability once more in the database):
//   request : payout enabled + fully configured, verified email, required KYC, a recent reauthentication, accepted payout terms,
//             the irreversible BSC/BEP-20 acknowledgements, the address entered TWICE and equal after normalisation (EIP-55),
//             amount >= the effective cash-out threshold, an idempotency key. The address is encrypted at rest and masked everywhere.
//   admin   : review -> approve (never your own request; never while a flagged attribution is unresolved) -> enter hash ->
//             server verification -> confirmed -> paid by an admin who is neither the approver nor the requester
//             (config.makerCheckerRequired, default on), after a fresh re-verification - never because a hash was typed.
import { ApiError } from '../community/errors.mjs';
import { encryptSecret, decryptSecret, hmacHex } from '../community/security/crypto-util.mjs';
import { encryptionKeyHex } from '../community/security/secrets.mjs';
import { isStepUpFresh } from '../community/security/session-service.mjs';
import { getReferralPayoutConfig } from './commercial-config.mjs';
import { isPayoutConfigComplete, PAYOUT_CHAIN_ID, PAYOUT_CHAIN_NAME, explorerUrlFor } from './referral-payout-settings.mjs';
import { normalizeEvmAddress, isZeroAddress, addressesEqual, maskAddress } from './evm-address.mjs';
import { atomicAmountFor } from './referral-rules.mjs';
import { resolveReferralTerms } from './referral-programs.mjs';
import { parseIdempotencyKey } from './referral-conversion.mjs';
import { verifyPayoutOnChain } from './referral-payout-verifier.mjs';

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const state = (status) => new ApiError(409, 'REFERRAL_PAYOUT_STATE_CONFLICT', null, { status });

function payoutFailure(result) {
  switch (result.reason) {
    case 'PAYOUT_BLOCKED': return new ApiError(403, 'REFERRAL_PAYOUT_BLOCKED');
    case 'DEBT_OPEN': return new ApiError(409, 'REFERRAL_DEBT_OPEN');
    case 'BELOW_MINIMUM': return new ApiError(400, 'REFERRAL_BELOW_MINIMUM', null, { minimumMicroUsd: result.minPayoutMicroUsd });
    default: return new ApiError(409, 'REFERRAL_INSUFFICIENT_BALANCE', null, { spendableMicroUsd: result.spendableMicroUsd });
  }
}

// max(the global payout minimum, the minimum of the user's CURRENT program terms) - snapshotted on the request.
export async function effectiveCashOutMinimum(repo, userId, config) {
  const terms = await resolveReferralTerms(repo, userId);
  return Math.max(config.minPayoutMicroUsd, terms.rules ? terms.rules.cashOutMinimumMicroUsd : 0);
}

function recipientHash(normalizedAddress) { return hmacHex('referral-payout-recipient:' + normalizedAddress.toLowerCase(), encryptionKeyHex()); }

// Validates the address entered twice and returns the canonical (EIP-55) form. Never the zero address, the token contract or the
// treasury sender (a payout to those would burn or loop funds).
export function parseRecipientAddress(address, confirmAddress, config) {
  const first = normalizeEvmAddress(address);
  const second = normalizeEvmAddress(confirmAddress);
  if (!first) throw new ApiError(400, 'INVALID_ADDRESS', null, { field: 'address' });
  if (!second) throw new ApiError(400, 'INVALID_ADDRESS', null, { field: 'confirmAddress' });
  if (first !== second) throw new ApiError(400, 'ADDRESS_MISMATCH');
  if (isZeroAddress(first) || addressesEqual(first, config.tokenContract) || addressesEqual(first, config.treasurySender)) throw new ApiError(400, 'ADDRESS_NOT_ALLOWED');
  return first;
}

export async function requestPayout(repo, { user, sessionRecord, body }) {
  const input = body && typeof body === 'object' ? body : {};
  const config = await getReferralPayoutConfig(repo);
  if (!config.enabled || !isPayoutConfigComplete(config)) throw new ApiError(409, 'REFERRAL_PAYOUT_DISABLED');
  if (!user.emailVerified) throw new ApiError(403, 'EMAIL_NOT_VERIFIED');
  if (config.requiredKycStatus === 'verified' && user.kycStatus !== 'verified') throw new ApiError(403, 'KYC_REQUIRED', null, { kycStatus: user.kycStatus });
  // A customer-safe recent-reauthentication gate (POST /api/auth/reauth, or a fresh login) - a stolen idle session cannot cash out.
  if (!isStepUpFresh(sessionRecord, config.reauthMaxAgeMinutes * 60 * 1000)) throw new ApiError(401, 'REAUTH_REQUIRED', null, { maxAgeMinutes: config.reauthMaxAgeMinutes });
  if (input.acceptedTermsVersion !== config.termsVersion) throw new ApiError(400, 'TERMS_NOT_ACCEPTED', null, { termsVersion: config.termsVersion });
  if (input.acknowledgeIrreversible !== true || input.acknowledgeNetwork !== true) throw new ApiError(400, 'ACKNOWLEDGEMENT_REQUIRED');
  const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
  const address = parseRecipientAddress(input.address, input.confirmAddress, config);
  const amountMicroUsd = input.amountMicroUsd;
  if (!Number.isSafeInteger(amountMicroUsd) || amountMicroUsd <= 0) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'amountMicroUsd' });
  const minPayoutMicroUsd = await effectiveCashOutMinimum(repo, user.id, config);
  if (amountMicroUsd < minPayoutMicroUsd) throw new ApiError(400, 'REFERRAL_BELOW_MINIMUM', null, { minimumMicroUsd: minPayoutMicroUsd });

  const result = await repo.referralPayouts.createRequest({
    userId: user.id, idempotencyKey, amountMicroUsd, minPayoutMicroUsd,
    asset: { symbol: config.tokenSymbol, chainId: PAYOUT_CHAIN_ID, tokenContract: config.tokenContract, decimals: config.tokenDecimals, atomicAmount: atomicAmountFor(amountMicroUsd, config.tokenDecimals), treasurySender: config.treasurySender },
    recipient: { enc: encryptSecret(address, encryptionKeyHex()), hash: recipientHash(address), masked: maskAddress(address) },
    policySnapshot: {
      chainId: PAYOUT_CHAIN_ID, tokenSymbol: config.tokenSymbol, minConfirmations: config.minConfirmations, minPayoutMicroUsd, requiredKycStatus: config.requiredKycStatus,
      makerCheckerRequired: config.makerCheckerRequired, reauthMaxAgeMinutes: config.reauthMaxAgeMinutes, explorerTxUrlTemplate: config.explorerTxUrlTemplate
    },
    termsVersion: config.termsVersion, acknowledgements: { irreversible: true, network: true, acceptedAt: new Date().toISOString() },
    kycStatusSnapshot: user.kycStatus, emailVerifiedSnapshot: true, reauthAt: sessionRecord && sessionRecord.reauthAt ? new Date(sessionRecord.reauthAt).toISOString() : null
  });
  if (!result.ok) throw payoutFailure(result);
  if (!result.duplicate) await repo.referral.acceptTerms(user.id, config.termsVersion);
  return { request: result.request, duplicate: Boolean(result.duplicate) };
}

// A user may cancel ONLY before an admin has started review.
export async function cancelPayout(repo, { userId, requestId }) {
  const request = await repo.referralPayouts.getRequest(requestId);
  if (!request || request.userId !== userId) throw new ApiError(404, 'REFERRAL_PAYOUT_NOT_FOUND');
  if (request.status !== 'requested') throw new ApiError(409, 'REFERRAL_PAYOUT_NOT_CANCELLABLE', null, { status: request.status });
  const result = await repo.referralPayouts.transition(requestId, { expectedFrom: 'requested', to: 'cancelled', actor: { type: 'user', id: userId }, fields: { cancelledAt: new Date().toISOString() } });
  if (!result.ok) throw new ApiError(409, 'REFERRAL_PAYOUT_NOT_CANCELLABLE', null, { status: result.status });
  return result.request;
}

// ---------------------------------------------------------------------------------------------------------------------
// Admin workflow
// ---------------------------------------------------------------------------------------------------------------------
async function requireRequest(repo, id) {
  const request = await repo.referralPayouts.getRequest(id);
  if (!request) throw new ApiError(404, 'REFERRAL_PAYOUT_NOT_FOUND');
  return request;
}
async function move(repo, request, { to, adminId, note, fields }) {
  const result = await repo.referralPayouts.transition(request.id, { expectedFrom: request.status, to, actor: { type: 'admin', id: adminId }, note, fields });
  if (!result.ok) throw state(result.status);
  return result.request;
}

export async function startReview(repo, { id, adminId }) {
  const request = await requireRequest(repo, id);
  if (request.status !== 'requested') throw state(request.status);
  return move(repo, request, { to: 'under_review', adminId, fields: { reviewedBy: adminId, reviewedAt: new Date().toISOString() } });
}

export async function approve(repo, { id, adminId }) {
  const request = await requireRequest(repo, id);
  if (request.status !== 'under_review') throw state(request.status);
  if (request.userId === adminId) throw new ApiError(403, 'REFERRAL_SELF_APPROVAL');
  // An unresolved risk flag (IP/device overlap etc.) must be cleared or voided by a human first - a review gate, not a ban.
  if (await repo.referralPayouts.hasFlaggedRisk(id)) throw new ApiError(409, 'REFERRAL_RISK_REVIEW_REQUIRED');
  return move(repo, request, { to: 'approved', adminId, fields: { approvedBy: adminId, approvedAt: new Date().toISOString() } });
}

export async function reject(repo, { id, adminId, reason }) {
  const request = await requireRequest(repo, id);
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text || text.length > 500) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'reason' });
  if (!['requested', 'under_review', 'approved'].includes(request.status)) throw state(request.status);
  return move(repo, request, { to: 'rejected', adminId, note: text, fields: { rejectionReason: text } });
}

// The treasury operator has sent the transfer by hand; the admin records its hash. This ONLY moves approved -> submitted (or
// replaces an unverified hash) - it proves nothing until verify() has checked the chain.
export async function submitHash(repo, { id, adminId, txHash }) {
  if (typeof txHash !== 'string' || !TX_HASH.test(txHash.trim())) throw new ApiError(400, 'INVALID_TX_HASH');
  const request = await requireRequest(repo, id);
  if (!['approved', 'submitted'].includes(request.status)) throw state(request.status);
  const result = await repo.referralPayouts.setTxHash(id, { txHash: txHash.trim(), actorId: adminId, expectedFrom: request.status });
  if (!result.ok) {
    if (result.reason === 'TX_HASH_ALREADY_USED') throw new ApiError(409, 'TX_HASH_ALREADY_USED');
    if (result.reason === 'HASH_ALREADY_VERIFIED') throw new ApiError(409, 'REFERRAL_HASH_ALREADY_VERIFIED');
    throw state(result.status);
  }
  return result.request;
}

// Runs the independent on-chain verification, records the outcome, and ONLY on success advances submitted -> confirmed.
export async function verify(repo, { id, adminId }) {
  const request = await requireRequest(repo, id);
  if (request.status !== 'submitted') throw state(request.status);
  const verification = await verifyPayoutOnChain(repo, request);
  const recorded = await repo.referralPayouts.recordVerification(id, { verification, confirmations: verification.confirmations ?? null });
  if (!recorded.ok) throw state(recorded.status);
  if (!verification.ok) return { verification, request: recorded.request };
  const confirmed = await move(repo, recorded.request, {
    to: 'confirmed', adminId, fields: { confirmedAt: new Date().toISOString(), confirmedBy: adminId, confirmations: verification.confirmations }
  });
  return { verification, request: confirmed };
}

// Final settlement. The approver and the requester can never be the finaliser (config.makerCheckerRequired, default on), the chain is
// re-verified NOW (a reorg or a wrong hash between `confirmed` and here must not slip through), and only then do the reserved lots
// move to `paid`. There is no path to `paid` that skips the verifier.
export async function markPaid(repo, { id, adminId }) {
  const request = await requireRequest(repo, id);
  if (request.status !== 'confirmed') throw state(request.status);
  const config = await getReferralPayoutConfig(repo);
  const makerChecker = request.policySnapshot && request.policySnapshot.makerCheckerRequired !== undefined ? request.policySnapshot.makerCheckerRequired : config.makerCheckerRequired;
  if (makerChecker && (adminId === request.approvedBy || adminId === request.userId)) throw new ApiError(403, 'REFERRAL_MAKER_CHECKER');
  const verification = await verifyPayoutOnChain(repo, request);
  await repo.referralPayouts.recordVerification(id, { verification, confirmations: verification.confirmations ?? null });
  if (!verification.ok) throw new ApiError(409, 'REFERRAL_VERIFICATION_FAILED', null, { reason: verification.reason });
  return move(repo, request, { to: 'paid', adminId, fields: { paidAt: new Date().toISOString(), finalizedBy: adminId, confirmations: verification.confirmations } });
}

// The transfer demonstrably did not happen as recorded (reverted, wrong chain...). Only allowed while the chain has NOT verified it -
// once a payout verified, funds left and it can only proceed to `paid`.
export async function markFailed(repo, { id, adminId, reason }) {
  const request = await requireRequest(repo, id);
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text || text.length > 500) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'reason' });
  if (!['submitted', 'confirmed'].includes(request.status)) throw state(request.status);
  if (request.verification && request.verification.ok === true) throw new ApiError(409, 'REFERRAL_ALREADY_VERIFIED');
  return move(repo, request, { to: 'failed', adminId, note: text, fields: { failureReason: text } });
}

// The only place the full recipient address is ever returned (the route requires a recent admin reauth and audits the read).
export async function revealRecipient(repo, { id }) {
  const request = await requireRequest(repo, id);
  return { address: decryptSecret(request.recipientAddressEnc, encryptionKeyHex()), masked: request.recipientMasked };
}

// ---------------------------------------------------------------------------------------------------------------------
// DTOs - the encrypted address, its hash and the raw policy internals never leave the server
// ---------------------------------------------------------------------------------------------------------------------
export function toCustomerPayoutDto(request) {
  const settled = request.status === 'confirmed' || request.status === 'paid';
  const template = request.policySnapshot && request.policySnapshot.explorerTxUrlTemplate;
  return {
    id: request.id, status: request.status, amountMicroUsd: request.amountMicroUsd, assetSymbol: request.assetSymbol, chainId: request.chainId, chainName: PAYOUT_CHAIN_NAME,
    recipientMasked: request.recipientMasked, requestedAt: request.requestedAt, cancellable: request.status === 'requested',
    // The transaction hash and explorer link appear only once the SERVER has verified the transfer on-chain.
    txHash: settled ? request.txHash : null, explorerUrl: settled ? explorerUrlFor(template, request.txHash) : null,
    confirmations: settled ? request.confirmations : null, paidAt: request.paidAt, statusNote: request.status === 'rejected' ? request.rejectionReason : null
  };
}
export function toAdminPayoutDto(request, extras = {}) {
  const template = request.policySnapshot && request.policySnapshot.explorerTxUrlTemplate;
  return {
    id: request.id, userId: request.userId, status: request.status, amountMicroUsd: request.amountMicroUsd, assetSymbol: request.assetSymbol, chainId: request.chainId,
    tokenContract: request.tokenContract, treasurySender: request.treasurySender, atomicAmount: request.atomicAmount, recipientMasked: request.recipientMasked,
    kycStatusSnapshot: request.kycStatusSnapshot, emailVerifiedSnapshot: request.emailVerifiedSnapshot, termsVersion: request.termsVersion, acknowledgements: request.acknowledgements,
    policy: request.policySnapshot, requestedAt: request.requestedAt, reviewedBy: request.reviewedBy, reviewedAt: request.reviewedAt, approvedBy: request.approvedBy,
    approvedAt: request.approvedAt, submittedBy: request.submittedBy, submittedAt: request.submittedAt, txHash: request.txHash, explorerUrl: explorerUrlFor(template, request.txHash),
    verification: request.verification, confirmations: request.confirmations, confirmedBy: request.confirmedBy, confirmedAt: request.confirmedAt, finalizedBy: request.finalizedBy,
    paidAt: request.paidAt, rejectionReason: request.rejectionReason, failureReason: request.failureReason, cancelledAt: request.cancelledAt, ...extras
  };
}
