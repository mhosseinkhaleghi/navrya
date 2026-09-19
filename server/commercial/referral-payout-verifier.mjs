// Independent, server-side on-chain verification of a referral payout. An admin typing a transaction hash proves NOTHING: this is
// the only thing that can move a payout to `confirmed` (and it is re-run, fresh, before `paid`). It verifies against the values
// SNAPSHOTTED on the request when it was made - never today's config - so a later settings edit can neither rescue nor sink an
// existing request:
//   * chain: the RPC's own eth_chainId must equal the request's pinned chain (BSC mainnet, 56)
//   * token: only Transfer logs emitted BY the request's token contract count (a forged event from another contract cannot match)
//   * sender: the Transfer's `from` must be the request's configured treasury sender
//   * recipient: the Transfer's `to` must be the (decrypted) recipient the customer entered twice
//   * amount: EXACTLY the request's atomic amount, exactly one such transfer (never >=, never a sum of pieces)
//   * confirmations: at least the request's snapshotted minimum
// Transaction uniqueness is enforced by the repository (unique tx hash across payout requests AND inbound invoices). No key, no
// signing, no broadcast exists anywhere in this flow - it only READS the chain.
import { ApiError } from '../community/errors.mjs';
import { decryptSecret } from '../community/security/crypto-util.mjs';
import { encryptionKeyHex } from '../community/security/secrets.mjs';
import { verifyBscTransfer } from './bsc-chain-client.mjs';
import { resolveBscRuntimeConfig } from './bsc-config.mjs';

// Reasons that are final for THIS hash (wrong data on the chain); everything else may simply need more time.
export const PERMANENT_FAILURE_REASONS = ['TRANSACTION_FAILED', 'CHAIN_MISMATCH', 'TOKEN_MISMATCH', 'SENDER_MISMATCH', 'RECIPIENT_MISMATCH', 'AMOUNT_MISMATCH', 'AMBIGUOUS_TRANSFERS'];

export async function verifyPayoutOnChain(repo, request) {
  if (!request.txHash) return { ok: false, reason: 'TX_HASH_REQUIRED', checkedAt: new Date().toISOString() };
  const bsc = await resolveBscRuntimeConfig(repo);
  if (!bsc.rpcConfigured) throw new ApiError(503, 'BSC_PROVIDER_NOT_CONFIGURED');
  // Decrypted only here, in memory, for the comparison - it never appears in the stored verification or any response.
  const recipient = decryptSecret(request.recipientAddressEnc, encryptionKeyHex());
  const requiredConfirmations = request.policySnapshot && request.policySnapshot.minConfirmations;
  const result = await verifyBscTransfer({
    rpcUrl: bsc.rpcUrl, txHash: request.txHash,
    expected: { chainId: request.chainId, tokenContract: request.tokenContract, sender: request.treasurySender, recipient, atomicAmount: request.atomicAmount },
    confirmationsRequired: requiredConfirmations
  });
  return { ...result, requiredConfirmations, checkedAt: new Date().toISOString() };
}
