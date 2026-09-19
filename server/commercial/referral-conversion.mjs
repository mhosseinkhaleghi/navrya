// The PUBLIC ADAPTER between the referral earnings domain and the AI wallet. Converting referral earnings to AI credit is the
// only way referral value ever touches the wallet, and it goes exclusively through here:
//   * the credit is a distinct wallet ledger source - type REFERRAL_AI_CONVERSION, sourceAction 'referral-ai-conversion' -
//     never a TOP_UP, never a promo/bonus grant, so it is separately reportable and can never be mistaken for purchased credit;
//   * it lands in the PROMO balance: the wallet has no withdrawal path, promo is never refundable, and AI settlement spends it
//     first - so converted value is non-withdrawable forever, even if never used;
//   * the conversion is IRREVERSIBLE (the append-only record has no undo, and a later refund of the underlying payment becomes
//     recoverable debt on the referrer instead of clawing the credit back);
//   * it is atomic (repo.referralEarnings.convertToAi: lot allocation, referral ledger, wallet credit and the conversion record
//     commit or roll back together under the documented lock order) and idempotent by the client's idempotency key.
// Wallet code never reads a referral table and referral code never writes wallet SQL outside that single repository step.
import { ApiError } from '../community/errors.mjs';

export const MIN_CONVERSION_MICRO_USD = 10000; // $0.01 - no dust conversions
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,80}$/;

export function parseIdempotencyKey(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'idempotencyKey' });
  return value;
}

export async function convertReferralToAiCredit(repo, { userId, amountMicroUsd, idempotencyKey }) {
  if (!Number.isSafeInteger(amountMicroUsd) || amountMicroUsd < MIN_CONVERSION_MICRO_USD) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'amountMicroUsd' });
  const key = parseIdempotencyKey(idempotencyKey);
  const result = await repo.referralEarnings.convertToAi({ userId, amountMicroUsd, idempotencyKey: key });
  if (!result.ok) throw new ApiError(409, 'REFERRAL_INSUFFICIENT_BALANCE', null, { spendableMicroUsd: result.spendableMicroUsd });
  const account = await repo.wallet.getAccount(userId);
  return {
    conversionId: result.conversion.id, amountMicroUsd: result.conversion.amountMicroUsd, duplicate: Boolean(result.duplicate), createdAt: result.conversion.createdAt,
    walletPromoBalanceMicroUsd: account.promoBalanceMicroUsd, walletTotalBalanceMicroUsd: account.promoBalanceMicroUsd + account.paidBalanceMicroUsd
  };
}
