// Orchestrates a BSC crypto invoice's lifecycle from the "check payment" trigger through to a
// real, idempotent credit (task A.6/A.7). No cron/background job is added (this codebase has none
// anywhere, by explicit existing convention - see subscription-service.mjs's own header comment) -
// the client's invoice modal polls a route that calls checkInvoicePayment() while the invoice is
// open, exactly the same "check opportunistically at request time" shape subscription expiry
// already uses.
import { ApiError } from '../community/errors.mjs';
import { verifyBscTransfer, findRecentTransfersToAddress } from './bsc-chain-client.mjs';
import { confirmTransaction } from './payment-service.mjs';

const DEFAULT_LOOKBACK_BLOCKS = 6000; // ~5 hours at BSC's ~3s block time - bounds the log scan

// The ONLY thing the browser ever receives about an invoice - no RPC URL, no webhook secret, no
// credential of any kind (task A.4/A.9). paymentUri is a real, standards-based EIP-681 request
// URI (`ethereum:{contract}@{chainId}/transfer?address={recipient}&uint256={amount}`) real
// wallets can parse to pre-fill a transfer, which is also what gets QR-encoded.
export function buildInvoiceDto(invoice) {
  const confirmationsRequired = Number(process.env.BSC_CONFIRMATIONS_REQUIRED || 15);
  const paymentUri = `ethereum:${invoice.tokenContract}@${invoice.chainId}/transfer?address=${invoice.recipientAddress}&uint256=${invoice.atomicAmount}`;
  return {
    invoiceId: invoice.id, transactionId: invoice.transactionId, chainId: invoice.chainId, chainName: 'BNB Smart Chain (BSC)',
    assetSymbol: invoice.assetSymbol, recipientAddress: invoice.recipientAddress, atomicAmount: invoice.atomicAmount,
    tokenDecimals: invoice.tokenDecimals, usdAmountMicroUsd: invoice.usdAmountMicroUsd, expiresAt: invoice.expiresAt,
    status: invoice.status, paymentUri, confirmationsRequired, confirmationCount: invoice.confirmationCount
  };
}

// Verified confirmation only - never trusts a browser "mark as paid" signal (task A.6). Runs the
// SAME verifyBscTransfer() check the optional webhook path also runs; on success, calls the
// existing idempotent confirmTransaction() choke point, so a re-poll or a webhook replay for the
// same invoice is always a safe no-op (payment_events guards it exactly as it guards an admin's
// duplicate confirm click).
export async function checkInvoicePayment(repo, invoiceId, { txHash } = {}) {
  const invoice = await repo.cryptoInvoices.get(invoiceId);
  if (!invoice) throw new ApiError(404, 'CRYPTO_INVOICE_NOT_FOUND');
  if (invoice.status === 'confirmed') return { status: 'confirmed', invoice };
  if (invoice.status === 'expired' || invoice.status === 'failed') return { status: invoice.status, invoice };

  if (new Date(invoice.expiresAt).getTime() <= Date.now()) {
    const expired = await repo.cryptoInvoices.updateStatus(invoiceId, 'expired');
    return { status: 'expired', invoice: expired };
  }

  const expected = { chainId: invoice.chainId, tokenContract: invoice.tokenContract, recipient: invoice.recipientAddress, atomicAmount: invoice.atomicAmount };
  const confirmationsRequired = Number(process.env.BSC_CONFIRMATIONS_REQUIRED || 15);

  let candidateHash = txHash || invoice.txHash;
  if (!candidateHash) {
    // No hash yet on this invoice and none supplied this call - scan for one instead of just
    // waiting; a real payer's wallet broadcast the transfer, this is just discovering its hash.
    const lookbackBlocks = Number(process.env.BSC_LOOKBACK_BLOCKS || DEFAULT_LOOKBACK_BLOCKS);
    const candidates = await findRecentTransfersToAddress({ tokenContract: invoice.tokenContract, recipient: invoice.recipientAddress, lookbackBlocks });
    const expectedAtomic = BigInt(invoice.atomicAmount);
    const match = candidates.find((c) => c.value >= expectedAtomic);
    if (!match) return { status: 'pending', invoice, reason: 'NO_MATCHING_TRANSFER_FOUND' };
    candidateHash = match.txHash;
  }

  // Atomic claim BEFORE verification - the same on-chain tx can never be used to pay two
  // different invoices, even under a race between two "check now" calls (task A.6's
  // transaction-hash-uniqueness requirement, enforced at the database level).
  const claim = await repo.cryptoInvoices.claimTxHash(invoiceId, candidateHash);
  if (!claim.ok) {
    return { status: 'pending', invoice, reason: claim.claimedByOtherInvoice ? 'TX_HASH_ALREADY_CLAIMED' : 'CLAIM_FAILED' };
  }

  const verification = await verifyBscTransfer({ txHash: candidateHash, expected, confirmationsRequired });
  if (!verification.ok) {
    // Never marks the invoice failed just because it isn't confirmed YET (e.g. insufficient
    // confirmations still accumulating) - only a genuine mismatch or expiry changes status;
    // "not yet" stays pending so the next poll can succeed once enough confirmations land.
    return { status: 'pending', invoice: claim.invoice, reason: verification.reason, confirmations: verification.confirmations };
  }

  await repo.cryptoInvoices.updateStatus(invoiceId, 'confirmed', { confirmationCount: verification.confirmations, confirmedAt: new Date().toISOString() });
  const confirmResult = await confirmTransaction(repo, invoice.transactionId, { adminUserId: null });
  const finalInvoice = await repo.cryptoInvoices.get(invoiceId);
  return { status: 'confirmed', invoice: finalInvoice, alreadyProcessed: confirmResult.alreadyProcessed };
}
