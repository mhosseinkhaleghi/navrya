// Orchestrates a BSC crypto invoice's lifecycle from the "check payment" trigger through to a
// real, idempotent credit (task A.6/A.7). No cron/background job is added (this codebase has none
// anywhere, by explicit existing convention - see subscription-service.mjs's own header comment) -
// the client's invoice modal polls a route that calls checkInvoicePayment() while the invoice is
// open, exactly the same "check opportunistically at request time" shape subscription expiry
// already uses.
import QRCode from 'qrcode';
import { ApiError } from '../community/errors.mjs';
import { verifyBscTransfer } from './bsc-chain-client.mjs';
import { confirmTransaction, failTransaction } from './payment-service.mjs';
import { resolveBscRuntimeConfig } from './bsc-config.mjs';
import { atomicAmountToMicroUsd } from './bsc-crypto-billing-provider.mjs';

// The ONLY thing the browser ever receives about an invoice - no RPC URL, no webhook secret, no
// credential of any kind (task A.4/A.9). qrCodeDataUri encodes the PLAIN recipient address alone
// (the `qrcode` package - task A.5) - deliberately NOT an EIP-681 `ethereum:{contract}@{chainId}/
// transfer?...` request URI. That richer format is real and spec-correct, but a wallet that does
// not fully support it reads only the address right after `ethereum:` - which in that format is
// the TOKEN CONTRACT, not the recipient - and could send straight to the contract address,
// silently misdirecting real funds. A plain address string is what every wallet's basic
// "scan an address" flow already handles correctly; network and amount are shown as their own
// text fields alongside the QR (never relied on to be read out of it).
export async function buildInvoiceDto(invoice, repo) {
  const config = await resolveBscRuntimeConfig(repo);
  const confirmationsRequired = config.confirmationsRequired;
  const paymentUri = invoice.recipientAddress;
  const qrCodeDataUri = await QRCode.toDataURL(paymentUri, { margin: 1, width: 240 });
  return {
    invoiceId: invoice.id, transactionId: invoice.transactionId, chainId: invoice.chainId, chainName: 'BNB Smart Chain (BSC)',
    assetSymbol: invoice.assetSymbol, recipientAddress: invoice.recipientAddress, atomicAmount: invoice.atomicAmount,
    tokenDecimals: invoice.tokenDecimals, usdAmountMicroUsd: invoice.usdAmountMicroUsd, expiresAt: invoice.expiresAt,
    status: invoice.status, paymentUri, qrCodeDataUri, confirmationsRequired, confirmationCount: invoice.confirmationCount,
    mismatchCreditedMicroUsd: invoice.mismatchCreditedMicroUsd ?? null,
    // Not sensitive (it is only ever the hash the SAME user already submitted for this invoice) -
    // exposed so the client can tell "a hash is already on file, Check Now can run with no new
    // input" apart from "nothing submitted yet, the field is required first".
    txHash: invoice.txHash || null
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
  if (invoice.status === 'expired') return { status: 'expired', invoice };
  // A 'failed' invoice this function itself moved to that status (the under-payment path below)
  // already told the caller the real outcome once, at the moment it happened; report it the same
  // way on every later poll instead of the generic status a plain failure would get.
  if (invoice.status === 'failed') {
    return { status: invoice.mismatchCreditedMicroUsd != null ? 'mismatched_credited' : 'failed', invoice, creditedMicroUsd: invoice.mismatchCreditedMicroUsd };
  }

  if (new Date(invoice.expiresAt).getTime() <= Date.now()) {
    const expired = await repo.cryptoInvoices.updateStatus(invoiceId, 'expired');
    return { status: 'expired', invoice: expired };
  }

  // .trim() before anything else - a hash copy-pasted from a wallet app or block explorer very
  // commonly carries a trailing newline/space, which would otherwise reach the RPC call below as
  // part of the parameter and could get a malformed-request response from the provider.
  const candidateHash = (txHash || invoice.txHash || '').trim() || null;
  if (!candidateHash) throw new ApiError(400, 'TX_HASH_REQUIRED');
  // A real 32-byte transaction hash is always exactly `0x` + 64 hex chars. Rejecting anything
  // else HERE - before it ever reaches the network - is what actually fixes the reported bug: an
  // invalid hash sent straight to a real RPC endpoint could get back a non-JSON-RPC response (an
  // HTML error page from a WAF/gateway in front of it), which used to throw an uncaught exception
  // and surface as the opaque 500 COMMUNITY_API_FAILED instead of a clear, specific answer.
  if (!/^0x[0-9a-fA-F]{64}$/.test(candidateHash)) {
    return { status: 'pending', invoice, reason: 'INVALID_TX_HASH' };
  }

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
    // A real, sufficiently-confirmed transfer reached OUR recipient address, on the right chain/
    // token - just for a different amount than invoiced. Split by direction:
    //   - UNDER-payment: never silently activate the invoiced purchase at a partial price. The
    //     purchase fails; the payer's wallet is credited for the actual amount they verifiably
    //     sent instead (never left stranded).
    //   - OVER-payment: the purchase still completes at the INVOICED price (never re-priced
    //     upward just because more arrived) - only the EXCESS beyond the invoice is credited to
    //     the wallet as its own separate credit.
    // Both are idempotent via the wallet ledger's own idempotencyKey - re-polling (or a webhook
    // replay) for the same invoice can never double-credit either one.
    if (verification.reason === 'AMOUNT_MISMATCH') {
      const transaction = await repo.paymentTransactions.get(invoice.transactionId);
      const actualAtomic = BigInt(verification.actualAtomicAmount);
      const invoicedAtomic = BigInt(invoice.atomicAmount);
      const baseMetadata = {
        invoiceId, txHash: candidateHash,
        invoicedAtomicAmount: invoice.atomicAmount, actualAtomicAmount: verification.actualAtomicAmount
      };

      if (actualAtomic > invoicedAtomic) {
        const excessMicroUsd = atomicAmountToMicroUsd((actualAtomic - invoicedAtomic).toString(), invoice.tokenDecimals, invoice.exchangeRateSnapshot);
        await repo.cryptoInvoices.updateStatus(invoiceId, 'confirmed', {
          confirmationCount: verification.confirmations, confirmedAt: new Date().toISOString(), mismatchCreditedMicroUsd: excessMicroUsd
        });
        const confirmResult = await confirmTransaction(repo, invoice.transactionId, { adminUserId: null });
        if (excessMicroUsd > 0) {
          await repo.wallet.grant(transaction.userId, {
            type: 'TOP_UP', cashDeltaMicroUsd: excessMicroUsd, sourceAction: 'crypto-invoice-overpayment',
            idempotencyKey: 'crypto-overpay:' + invoiceId, metadata: baseMetadata
          });
        }
        const finalInvoice = await repo.cryptoInvoices.get(invoiceId);
        return { status: 'confirmed', invoice: finalInvoice, alreadyProcessed: confirmResult.alreadyProcessed, overpaidCreditedMicroUsd: excessMicroUsd };
      }

      const creditedMicroUsd = atomicAmountToMicroUsd(verification.actualAtomicAmount, invoice.tokenDecimals, invoice.exchangeRateSnapshot);
      await repo.wallet.grant(transaction.userId, {
        type: 'TOP_UP', cashDeltaMicroUsd: creditedMicroUsd, sourceAction: 'crypto-invoice-underpayment',
        idempotencyKey: 'crypto-mismatch:' + invoiceId, metadata: baseMetadata
      });
      await failTransaction(repo, invoice.transactionId).catch(() => {});
      const failedInvoice = await repo.cryptoInvoices.updateStatus(invoiceId, 'failed', {
        confirmationCount: verification.confirmations, confirmedAt: new Date().toISOString(), mismatchCreditedMicroUsd: creditedMicroUsd
      });
      return { status: 'mismatched_credited', invoice: failedInvoice, creditedMicroUsd };
    }
    // Never marks the invoice failed just because it isn't confirmed YET (e.g. insufficient
    // confirmations still accumulating) - only a genuine mismatch-with-enough-confirmations or
    // expiry changes status; "not yet" stays pending so the next poll can succeed once enough
    // confirmations land, or once the right transfer actually appears.
    return { status: 'pending', invoice: claim.invoice, reason: verification.reason, confirmations: verification.confirmations };
  }

  await repo.cryptoInvoices.updateStatus(invoiceId, 'confirmed', { confirmationCount: verification.confirmations, confirmedAt: new Date().toISOString() });
  const confirmResult = await confirmTransaction(repo, invoice.transactionId, { adminUserId: null });
  const finalInvoice = await repo.cryptoInvoices.get(invoiceId);
  return { status: 'confirmed', invoice: finalInvoice, alreadyProcessed: confirmResult.alreadyProcessed };
}
