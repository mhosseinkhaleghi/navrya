import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { verifyBscTransfer, matchPayoutTransfer } from '../server/commercial/bsc-chain-client.mjs';
import { verifyPayoutOnChain } from '../server/commercial/referral-payout-verifier.mjs';
import {
  RPC_URL, TOKEN, SENDER, RECIPIENT, OTHER, TX_HASH, transferLog, receiptOf, atomic, mockRpc, restoreFetch, payoutWorld, requestBody
} from './helpers/referral-payout-fixtures.mjs';
import { requestPayout } from '../server/commercial/referral-payouts.mjs';

afterEach(() => restoreFetch());

const expected = (overrides = {}) => ({ chainId: 56, tokenContract: TOKEN, sender: SENDER, recipient: RECIPIENT, atomicAmount: atomic(10).toString(), ...overrides });
const verify = (overrides = {}, confirmationsRequired = 15) => verifyBscTransfer({ rpcUrl: RPC_URL, txHash: TX_HASH, expected: expected(overrides), confirmationsRequired });
const goodReceipt = (logs) => receiptOf({ blockNumber: 100, logs: logs || [transferLog({ amount: atomic(10) })] });

// --- the payout verdict, one failure per required check --------------------------------------------------------------
test('a transfer of the configured token, from the configured sender, to the recipient, for the exact amount, with enough confirmations, verifies', async () => {
  mockRpc({ chainId: 56, receipt: goodReceipt(), blockNumber: 114 }); // 15 confirmations
  const result = await verify();
  assert.deepEqual([result.ok, result.confirmations], [true, 15]);
});
test('WRONG CHAIN: an RPC that reports another chain never verifies', async () => {
  mockRpc({ chainId: 1, receipt: goodReceipt(), blockNumber: 200 });
  assert.deepEqual(await verify(), { ok: false, reason: 'CHAIN_MISMATCH' });
});
test('an unknown transaction is TRANSACTION_NOT_FOUND and a reverted one TRANSACTION_FAILED', async () => {
  mockRpc({ receipt: null });
  assert.equal((await verify()).reason, 'TRANSACTION_NOT_FOUND');
  mockRpc({ receipt: receiptOf({ status: '0x0', logs: [transferLog({ amount: atomic(10) })] }) });
  assert.equal((await verify()).reason, 'TRANSACTION_FAILED');
});
test('WRONG TOKEN: a Transfer event emitted by a different contract can never satisfy the payout', async () => {
  mockRpc({ receipt: goodReceipt([transferLog({ address: OTHER, amount: atomic(10) })]) });
  assert.equal((await verify()).reason, 'TOKEN_MISMATCH');
  mockRpc({ receipt: goodReceipt([]) });
  assert.equal((await verify()).reason, 'TOKEN_MISMATCH');
});
test('WRONG SENDER: the right token moved to the right recipient but NOT from the treasury sender', async () => {
  mockRpc({ receipt: goodReceipt([transferLog({ from: OTHER, amount: atomic(10) })]) });
  assert.equal((await verify()).reason, 'SENDER_MISMATCH');
});
test('WRONG RECIPIENT: the treasury sent the right amount somewhere else', async () => {
  mockRpc({ receipt: goodReceipt([transferLog({ to: OTHER, amount: atomic(10) })]) });
  assert.equal((await verify()).reason, 'RECIPIENT_MISMATCH');
});
test('WRONG AMOUNT: both a short and an over-payment are refused - the amount must be EXACT', async () => {
  mockRpc({ receipt: goodReceipt([transferLog({ amount: atomic(10) - 1n })]) });
  const short = await verify();
  assert.equal(short.reason, 'AMOUNT_MISMATCH');
  assert.equal(short.actualAtomicAmount, (atomic(10) - 1n).toString());
  mockRpc({ receipt: goodReceipt([transferLog({ amount: atomic(10) + 1n })]) });
  assert.equal((await verify()).reason, 'AMOUNT_MISMATCH');
});
test('two pieces that add up to the amount are AMBIGUOUS, never accepted as one payout', async () => {
  mockRpc({ receipt: goodReceipt([transferLog({ amount: atomic(4) }), transferLog({ amount: atomic(6) })]) });
  assert.equal((await verify()).reason, 'AMBIGUOUS_TRANSFERS');
});
test('INSUFFICIENT CONFIRMATIONS: a correct transfer that is not deep enough yet is not verified, and reports how deep it is', async () => {
  mockRpc({ receipt: goodReceipt(), blockNumber: 105 }); // block 100 -> 6 confirmations
  const result = await verify();
  assert.deepEqual([result.ok, result.reason, result.confirmations], [false, 'INSUFFICIENT_CONFIRMATIONS', 6]);
});
test('the address comparison is case-insensitive (checksum vs lowercase) but exact on the bytes', async () => {
  mockRpc({ receipt: goodReceipt(), blockNumber: 114 });
  assert.equal((await verify({ recipient: RECIPIENT.toLowerCase(), sender: SENDER.toUpperCase().replace('0X', '0x') })).ok, true);
});
test('matchPayoutTransfer is total: an empty log list is TOKEN_MISMATCH, never a crash', () => {
  assert.equal(matchPayoutTransfer([], expected()).reason, 'TOKEN_MISMATCH');
});

// --- backward compatibility: the inbound invoice verifier is unchanged ------------------------------------------------
test('INBOUND invoice verification (no expected.sender) still accepts a transfer from ANY payer and is unchanged', async () => {
  mockRpc({ receipt: goodReceipt([transferLog({ from: OTHER, amount: atomic(10) })]), blockNumber: 114 });
  const result = await verifyBscTransfer({ rpcUrl: RPC_URL, txHash: TX_HASH, expected: { chainId: 56, tokenContract: TOKEN, recipient: RECIPIENT, atomicAmount: atomic(10).toString() }, confirmationsRequired: 15 });
  assert.equal(result.ok, true);
  mockRpc({ receipt: goodReceipt([transferLog({ from: OTHER, amount: atomic(9) })]), blockNumber: 114 });
  const under = await verifyBscTransfer({ rpcUrl: RPC_URL, txHash: TX_HASH, expected: { chainId: 56, tokenContract: TOKEN, recipient: RECIPIENT, atomicAmount: atomic(10).toString() }, confirmationsRequired: 15 });
  assert.equal(under.reason, 'AMOUNT_MISMATCH', 'the existing under/over-payment handling still applies to invoices');
});

// --- the service wrapper verifies against the request's SNAPSHOT and never leaks the recipient -----------------------------
test('verifyPayoutOnChain uses the request snapshot (chain, token, sender, atomic amount, confirmations) and stores no address', async () => {
  const world = await payoutWorld();
  const { request } = await requestPayout(world.repo, { user: world.user, sessionRecord: world.session, body: requestBody() });
  const submitted = { ...request, txHash: TX_HASH, status: 'submitted' };
  mockRpc({ receipt: goodReceipt(), blockNumber: 114 });
  const ok = await verifyPayoutOnChain(world.repo, submitted);
  assert.equal(ok.ok, true);
  assert.equal(ok.requiredConfirmations, 15);
  assert.doesNotMatch(JSON.stringify(ok), new RegExp(RECIPIENT.slice(2), 'i'), 'the verification record never contains the recipient address');
  // A later settings edit (a different token / sender) does not change what THIS request is verified against.
  await world.repo.commercialConfig.publish('referralPayout:settings', { enabled: true, tokenContract: OTHER, treasurySender: OTHER, tokenDecimals: 18, tokenSymbol: 'USDT' }, {});
  mockRpc({ receipt: goodReceipt(), blockNumber: 114 });
  assert.equal((await verifyPayoutOnChain(world.repo, submitted)).ok, true);
});
test('verifyPayoutOnChain fails closed with 503 when no RPC endpoint is configured, and needs a hash', async () => {
  const world = await payoutWorld();
  const { request } = await requestPayout(world.repo, { user: world.user, sessionRecord: world.session, body: requestBody() });
  assert.equal((await verifyPayoutOnChain(world.repo, request)).reason, 'TX_HASH_REQUIRED');
  await world.repo.bscPaymentSecrets.clear?.();
  const bare = { ...request, txHash: TX_HASH };
  // Simulate "no RPC configured" by pointing the stored secret at nothing.
  world.repo.bscPaymentSecrets.setRpcUrl && await world.repo.bscPaymentSecrets.setRpcUrl('');
  const previous = process.env.BSC_RPC_URL;
  delete process.env.BSC_RPC_URL;
  try {
    await assert.rejects(() => verifyPayoutOnChain(world.repo, bare), /BSC_PROVIDER_NOT_CONFIGURED/);
  } finally { if (previous) process.env.BSC_RPC_URL = previous; }
});
