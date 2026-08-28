// Orchestrates a BSC crypto invoice's lifecycle from the "check payment" trigger through to a
// real, idempotent credit (task A.6/A.7). No cron/background job is added (this codebase has none
// anywhere, by explicit existing convention - see subscription-service.mjs's own header comment) -
// the client's invoice modal polls a route that calls checkInvoicePayment() while the invoice is
// open, exactly the same "check opportunistically at request time" shape subscription expiry
// already uses.
import QRCode from 'qrcode';
import { ApiError } from '../community/errors.mjs';
import { verifyBscTransfer } from './bsc-chain-client.mjs';
import { confirmTransaction } from './payment-service.mjs';
import { resolveBscRuntimeConfig } from './bsc-config.mjs';

// The ONLY thing the browser ever receives about an invoice - no RPC URL, no webhook secret, no
// credential of any kind (task A.4/A.9). paymentUri is a real, standards-based EIP-681 request
// URI (`ethereum:{contract}@{chainId}/transfer?address={recipient}&uint256={amount}`) real
// wallets can parse to pre-fill a transfer; qrCodeDataUri is that same URI rendered to a PNG data
// URI server-side (the `qrcode` package - task A.5) so the client never needs its own QR library
// or ever handles anything more sensitive than a string to display.
export async function buildInvoiceDto(invoice, repo) {
  const config = await resolveBscRuntimeConfig(repo);
  const confirmationsRequired = config.confirmationsRequired;
  const paymentUri = `ethereum:${invoice.tokenContract}@${invoice.chainId}/transfer?address=${invoice.recipientAddress}&uint256=${invoice.atomicAmount}`;
  const qrCodeDataUri = await QRCode.toDataURL(paymentUri, { margin: 1, width: 240 });
  return {
    invoiceId: invoice.id, transactionId: invoice.transactionId, chainId: invoice.chainId, chainName: 'BNB Smart Chain (BSC)',
    assetSymbol: invoice.assetSymbol, recipientAddress: invoice.recipientAddress, atomicAmount: invoice.atomicAmount,
    tokenDecimals: invoice.tokenDecimals, usdAmountMicroUsd: invoice.usdAmountMicroUsd, expiresAt: invoice.expiresAt,
    status: invoice.status, paymentUri, qrCodeDataUri, confirmationsRequired, confirmationCount: invoice.confirmationCount
  };
}

// Verified confirmation only - never trusts a browser "mark as paid" signal (task A.6). Runs the
// SAME verifyBscTransfer() check the optional webhook path also runs; on success, calls the
// existing idempotent confirmTransaction() choke point, so a re-poll or a webhook replay for the
// same invoice is always a safe no-op (payment_events guards it exactly as it guards an admin's
// duplicate confirm click).
//
// SECURITY: `txHash` is now REQUIRED (task C's mandatory fix). This used to fall back to
// findRecentTransfersToAddress() - a scan of the shared deposit address for any recent transfer
// of the right amount - whenever the caller didn't supply one. With one shared address, that scan
// could match the WRONG payer's transfer whenever two invoices for the same amount were open at
// once (there is no way to attribute a bare on-chain transfer to a specific invoice without either
// a unique per-invoice address - not implemented - or the payer's own transaction hash). That
// fallback has been removed entirely (see bsc-chain-client.mjs's own note) - a payer must supply
// the transaction hash of their own transfer before this can ever check/claim a payment. Resuming
// a hash THIS invoice already claimed on an earlier call (e.g. "insufficient confirmations, check
// again later") stays supported - that hash was already legitimately attributed to this invoice
// via claimTxHash()'s own uniqueness guard, so re-using it here is not a re-introduction of the
// ambiguity being fixed.
export async function checkInvoicePayment(repo, invoiceId, { txHash } = {}) {
  const invoice = await repo.cryptoInvoices.get(invoiceId);
  if (!invoice) throw new ApiError(404, 'CRYPTO_INVOICE_NOT_FOUND');
  if (invoice.status === 'confirmed') return { status: 'confirmed', invoice };
  if (invoice.status === 'expired' || invoice.status === 'failed') return { status: invoice.status, invoice };

  if (new Date(invoice.expiresAt).getTime() <= Date.now()) {
    const expired = await repo.cryptoInvoices.updateStatus(invoiceId, 'expired');
    return { status: 'expired', invoice: expired };
  }

  const candidateHash = txHash || invoice.txHash;
  if (!candidateHash) throw new ApiError(400, 'TX_HASH_REQUIRED');

  const expected = { chainId: invoice.chainId, tokenContract: invoice.tokenContract, recipient: invoice.recipientAddress, atomicAmount: invoice.atomicAmount };
  const config = await resolveBscRuntimeConfig(repo);
  const confirmationsRequired = config.confirmationsRequired;

  // Atomic claim BEFORE verification - the same on-chain tx can never be used to pay two
  // different invoices, even under a race between two "check now" calls (task A.6's
  // transaction-hash-uniqueness requirement, enforced at the database level).
  const claim = await repo.cryptoInvoices.claimTxHash(invoiceId, candidateHash);
  if (!claim.ok) {
    return { status: 'pending', invoice, reason: claim.claimedByOtherInvoice ? 'TX_HASH_ALREADY_CLAIMED' : 'CLAIM_FAILED' };
  }

  const verification = await verifyBscTransfer({ rpcUrl: config.rpcUrl, txHash: candidateHash, expected, confirmationsRequired });
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
