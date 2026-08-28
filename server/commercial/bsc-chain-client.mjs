// Minimal, dependency-free BSC (BNB Smart Chain) JSON-RPC client and on-chain BEP-20 transfer
// verifier (task A.6). BSC exposes the standard Ethereum JSON-RPC over plain HTTP, and a BEP-20
// token's Transfer event is the standard ERC-20 Transfer(address,address,uint256) log shape - so
// this needs no ethers/web3 dependency, only `fetch` (built into Node 22+, already this
// repository's minimum) and one well-known, documented constant (the Transfer event's topic0,
// which is simply keccak256("Transfer(address,address,uint256)") - the same value every block
// explorer and indexer for every ERC-20/BEP-20 token uses; not something invented here).
import { ApiError } from '../community/errors.mjs';

const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function requireConfig() {
  const rpcUrl = process.env.BSC_RPC_URL;
  if (!rpcUrl) throw new ApiError(503, 'BSC_PROVIDER_NOT_CONFIGURED', null, { missing: 'BSC_RPC_URL' });
  return rpcUrl;
}

let rpcIdCounter = 0;
async function rpcCall(method, params) {
  const rpcUrl = requireConfig();
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

function padAddressTopic(address) {
  return '0x' + '0'.repeat(24) + address.replace(/^0x/i, '').toLowerCase();
}
function topicToAddress(topic) { return '0x' + topic.slice(-40); }

export async function getChainId() {
  const hex = await rpcCall('eth_chainId', []);
  return parseInt(hex, 16);
}

export async function getBlockNumber() {
  const hex = await rpcCall('eth_blockNumber', []);
  return parseInt(hex, 16);
}

export async function getTransactionReceipt(txHash) {
  return rpcCall('eth_getTransactionReceipt', [txHash]);
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

// The single place every BSC payment confirmation path (server-triggered "check now" poll, or
// the optional webhook) runs its validation - task A.6's full list, checked in this exact order:
// chain id, receipt existence/success, a genuine Transfer log from the configured token contract
// to the configured recipient for at least the expected amount (over-payment tolerated, under-
// payment rejected), then the confirmation threshold. Returns a plain result object - never
// throws for a "this transaction doesn't qualify yet/at all" outcome, only for real configuration/
// connectivity failures (ApiError, handled by the caller's own error middleware).
export async function verifyBscTransfer({ txHash, expected, confirmationsRequired }) {
  const actualChainId = await getChainId();
  if (actualChainId !== expected.chainId) return { ok: false, reason: 'CHAIN_MISMATCH' };

  const receipt = await getTransactionReceipt(txHash);
  if (!receipt) return { ok: false, reason: 'TRANSACTION_NOT_FOUND' };
  if (receipt.status !== '0x1') return { ok: false, reason: 'TRANSACTION_FAILED' };

  const transfers = decodeTransferLogs(receipt, expected.tokenContract);
  const expectedAtomic = BigInt(expected.atomicAmount);
  const recipientLower = expected.recipient.toLowerCase();
  const matching = transfers.find((t) => t.to.toLowerCase() === recipientLower && t.value >= expectedAtomic);
  if (!matching) return { ok: false, reason: 'NO_MATCHING_TRANSFER' };

  const currentBlock = await getBlockNumber();
  const receiptBlock = parseInt(receipt.blockNumber, 16);
  const confirmations = Math.max(0, currentBlock - receiptBlock + 1);
  if (confirmations < confirmationsRequired) return { ok: false, reason: 'INSUFFICIENT_CONFIRMATIONS', confirmations };

  return { ok: true, confirmations };
}

// Fallback discovery path (task A.5's "no client-supplied hash" case) - scans the token
// contract's own Transfer logs for one landing at the deposit address, bounded to a recent
// lookback window so this never becomes an unbounded full-chain scan. Returns candidate tx
// hashes only; each candidate must still pass the SAME verifyBscTransfer() check above before
// anything is ever confirmed - this function only narrows down what to check, it never confirms
// a payment by itself.
export async function findRecentTransfersToAddress({ tokenContract, recipient, lookbackBlocks }) {
  const currentBlock = await getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - lookbackBlocks);
  const logs = await rpcCall('eth_getLogs', [{
    fromBlock: '0x' + fromBlock.toString(16), toBlock: 'latest', address: tokenContract,
    topics: [TRANSFER_EVENT_TOPIC, null, padAddressTopic(recipient)]
  }]);
  return (logs || []).map((log) => ({ txHash: log.transactionHash, blockNumber: parseInt(log.blockNumber, 16), value: BigInt(log.data) }));
}
