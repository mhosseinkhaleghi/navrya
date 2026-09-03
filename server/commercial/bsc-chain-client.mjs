// Minimal, dependency-free BSC (BNB Smart Chain) JSON-RPC client and on-chain BEP-20 transfer
// verifier (task A.6, hardened per the admin-config task's mandatory security fix). BSC exposes
// the standard Ethereum JSON-RPC over plain HTTP, and a BEP-20 token's Transfer event is the
// standard ERC-20 Transfer(address,address,uint256) log shape - so this needs no ethers/web3
// dependency, only `fetch` (built into Node 22+, already this repository's minimum) and one
// well-known, documented constant (the Transfer event's topic0, which is simply
// keccak256("Transfer(address,address,uint256)") - the same value every block explorer and
// indexer for every ERC-20/BEP-20 token uses; not something invented here).
//
// Every function here takes `rpcUrl` as an explicit parameter rather than reading
// process.env.BSC_RPC_URL internally - the caller resolves it via
// server/commercial/bsc-config.mjs's resolveBscRuntimeConfig(repo) (DB-managed, admin-configured,
// with an .env fallback only for local development), never this module.
import { ApiError } from '../community/errors.mjs';

const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

let rpcIdCounter = 0;
async function rpcCall(rpcUrl, method, params) {
  if (!rpcUrl) throw new ApiError(503, 'BSC_PROVIDER_NOT_CONFIGURED', null, { missing: 'rpcUrl' });
  rpcIdCounter += 1;
  const response = await fetch(rpcUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcIdCounter, method, params }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new ApiError(503, 'BSC_RPC_UNAVAILABLE');
  const body = await response.json();
  if (body.error) throw new ApiError(503, 'BSC_RPC_ERROR', null, { message: body.error.message });
  return body.result;
}

function topicToAddress(topic) { return '0x' + topic.slice(-40); }

// A real, well-formed EVM/BSC address - used both to validate admin-submitted deposit
// address/token contract values and, historically, to build a padded topic filter for the
// removed scan-based discovery path (see this file's own history/comment below).
export function isValidEvmAddress(value) { return /^0x[0-9a-fA-F]{40}$/.test(String(value || '')); }

export async function getChainId(rpcUrl) {
  const hex = await rpcCall(rpcUrl, 'eth_chainId', []);
  return parseInt(hex, 16);
}

export async function getBlockNumber(rpcUrl) {
  const hex = await rpcCall(rpcUrl, 'eth_blockNumber', []);
  return parseInt(hex, 16);
}

export async function getTransactionReceipt(rpcUrl, txHash) {
  return rpcCall(rpcUrl, 'eth_getTransactionReceipt', [txHash]);
}

// Decodes every Transfer(address,address,uint256) log in a receipt that was emitted BY the given
// token contract - never trusts a log from any other contract address, which is exactly how a
// forged/irrelevant event from a different contract in the same transaction is excluded.
export function decodeTransferLogs(receipt, tokenContract) {
  const contractLower = tokenContract.toLowerCase();
  return (receipt.logs || [])
    .filter((log) => log.address && log.address.toLowerCase() === contractLower && log.topics && log.topics[0] === TRANSFER_EVENT_TOPIC && log.topics.length === 3)
    .map((log) => ({ from: topicToAddress(log.topics[1]), to: topicToAddress(log.topics[2]), value: BigInt(log.data) }));
}

// The single place every BSC payment confirmation path (the client's own "check now" poll, or the
// optional webhook) runs its validation - checked in this exact order: chain id, receipt
// existence/success, a genuine Transfer log from the configured token contract to the configured
// recipient for EXACTLY the expected amount, then the confirmation threshold.
//
// SECURITY: this used to accept `t.value >= expectedAtomic` (over-payment tolerated). With a
// single shared deposit address, that let a completely unrelated transfer of >= the right amount
// wrongly satisfy an invoice it was never meant for - especially dangerous combined with the
// now-removed auto-scan fallback (see crypto-invoice-service.mjs's history). The match is now
// EXACT (`===`) - no audited overpayment policy is implemented in this pass, so an over- or
// under-payment is simply not a match and never confirms anything.
//
// Returns a plain result object - never throws for a "this transaction doesn't qualify yet/at
// all" outcome, only for real configuration/connectivity failures (ApiError, handled by the
// caller's own error middleware).
export async function verifyBscTransfer({ rpcUrl, txHash, expected, confirmationsRequired }) {
  const actualChainId = await getChainId(rpcUrl);
  if (actualChainId !== expected.chainId) return { ok: false, reason: 'CHAIN_MISMATCH' };

  const receipt = await getTransactionReceipt(rpcUrl, txHash);
  if (!receipt) return { ok: false, reason: 'TRANSACTION_NOT_FOUND' };
  if (receipt.status !== '0x1') return { ok: false, reason: 'TRANSACTION_FAILED' };

  const transfers = decodeTransferLogs(receipt, expected.tokenContract);
  const expectedAtomic = BigInt(expected.atomicAmount);
  const recipientLower = expected.recipient.toLowerCase();
  const toRecipient = transfers.filter((t) => t.to.toLowerCase() === recipientLower);
  const matching = toRecipient.find((t) => t.value === expectedAtomic);
  // A real transfer of the right token, on the right chain, TO THE RIGHT RECIPIENT, just not for
  // the invoiced amount. Never silently activate the invoiced purchase at the wrong price - the
  // caller (crypto-invoice-service.mjs) instead credits the payer's wallet for what was actually,
  // verifiably sent, but ONLY once it clears the SAME confirmation threshold as an exact match
  // (checked below) - a reorg must never be able to un-send a credit already made.
  const mismatched = !matching && toRecipient[0];
  if (!matching && !mismatched) return { ok: false, reason: 'NO_MATCHING_TRANSFER' };

  const currentBlock = await getBlockNumber(rpcUrl);
  const receiptBlock = parseInt(receipt.blockNumber, 16);
  const confirmations = Math.max(0, currentBlock - receiptBlock + 1);
  if (confirmations < confirmationsRequired) {
    return { ok: false, reason: 'INSUFFICIENT_CONFIRMATIONS', confirmations, mismatched: !matching };
  }

  if (!matching) return { ok: false, reason: 'AMOUNT_MISMATCH', actualAtomicAmount: mismatched.value.toString(), confirmations };
  return { ok: true, confirmations };
}

// NOTE ON A REMOVED FUNCTION: an earlier version of this file exported
// findRecentTransfersToAddress({tokenContract, recipient, lookbackBlocks}) - a bounded eth_getLogs
// scan of the shared deposit address, used by crypto-invoice-service.mjs whenever a payer hadn't
// supplied a transaction hash yet. It was removed entirely (not just unused) as part of the
// mandatory security fix: with one shared deposit address, "find any recent transfer of the right
// amount" can match the WRONG payer's transfer whenever two invoices for the same amount are open
// at once - there is no way to attribute a bare on-chain transfer to a specific invoice without
// either a unique per-invoice address (not implemented) or requiring the payer's own transaction
// hash (the option this codebase now takes - see checkInvoicePayment()'s TX_HASH_REQUIRED check).
// Keeping the scan function around unused was itself a footgun (a future caller could easily
// reintroduce the same ambiguity), so it - and its only helper, the address-to-topic padder - are
// gone rather than merely dead code.
