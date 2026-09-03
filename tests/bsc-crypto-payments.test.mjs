import assert from 'node:assert/strict';
import test, { after, afterEach, before } from 'node:test';
import crypto from 'node:crypto';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Real BSC crypto payment invoices (task A, hardened by the admin-config task's mandatory
// security fix - task C) - end-to-end coverage: invoice creation + safe DTO, server-side on-chain
// verification (chain/token/recipient/EXACT amount/confirmations/expiry/hash-uniqueness/required
// tx hash), the idempotent confirmTransaction() choke point, and the optional HMAC-verified
// webhook. Mocks globalThis.fetch for the BSC JSON-RPC calls, the same established convention
// ai-gateway.test.mjs already uses for provider HTTP calls - no real BSC RPC endpoint is reached.
//
// Configuration is now admin-managed (DB-backed), not env-driven - setBscConfig() below writes
// through the exact same repo.commercialConfig.publish()/repo.bscPaymentSecrets.setRpcUrl() paths
// the real Admin UI uses, rather than setting process.env.BSC_*.
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// Generated (never hand-typed) so each is guaranteed exactly 40 hex chars - a real Ethereum/BSC
// address length. A hand-typed repeated-digit string silently being 38 or 39 chars long is exactly
// the kind of off-by-one that breaks padTopic()/topicToAddress()'s fixed-width slicing in a way
// that fails unpredictably rather than loudly - worth generating precisely instead of eyeballing.
const DEPOSIT_ADDRESS = '0x' + '1'.repeat(39) + 'a';
const TOKEN_CONTRACT = '0x' + '2'.repeat(39) + 'b';
const PAYER_ADDRESS = '0x' + '3'.repeat(39) + 'c';
const RPC_URL_SENTINEL = 'http://mock-rpc.invalid';

function padTopic(address) { return '0x' + '0'.repeat(24) + address.replace(/^0x/i, '').toLowerCase(); }

let server, baseUrl, repo;
const originalFetch = globalThis.fetch;

before(async () => {
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => { globalThis.fetch = originalFetch; });

// Idempotently (re-)publishes every public bsc:* field plus the encrypted RPC URL secret - always
// the FULL set, never a partial diff - so no test can be affected by whatever a previous test in
// this shared-repo file left behind. This mirrors the real Admin UI's write paths exactly
// (repo.commercialConfig.publish() + repo.bscPaymentSecrets.setRpcUrl()), never process.env.
async function setBscConfig(targetRepo, overrides = {}) {
  const fields = {
    enabled: true, chainId: 56, depositAddress: DEPOSIT_ADDRESS, tokenContract: TOKEN_CONTRACT, tokenSymbol: 'USDT',
    tokenDecimals: 18, confirmationsRequired: 2, invoiceExpiryMinutes: 30, exchangeRateUsdPerToken: 1,
    ...overrides
  };
  await targetRepo.commercialConfig.publish('bsc:chainId', { chainId: fields.chainId });
  await targetRepo.commercialConfig.publish('bsc:depositAddress', { address: fields.depositAddress });
  await targetRepo.commercialConfig.publish('bsc:tokenContract', { address: fields.tokenContract });
  await targetRepo.commercialConfig.publish('bsc:tokenSymbol', { symbol: fields.tokenSymbol });
  await targetRepo.commercialConfig.publish('bsc:tokenDecimals', { decimals: fields.tokenDecimals });
  await targetRepo.commercialConfig.publish('bsc:confirmationsRequired', { count: fields.confirmationsRequired });
  await targetRepo.commercialConfig.publish('bsc:invoiceExpiryMinutes', { minutes: fields.invoiceExpiryMinutes });
  await targetRepo.commercialConfig.publish('bsc:exchangeRateUsdPerToken', { rate: fields.exchangeRateUsdPerToken });
  await targetRepo.bscPaymentSecrets.setRpcUrl(RPC_URL_SENTINEL);
  // enabled is published LAST and separately - mirrors the real enable route's own ordering
  // (config must be complete before/at the moment enabled flips true).
  await targetRepo.commercialConfig.publish('bsc:enabled', { enabled: fields.enabled });
  invalidateCommercialConfigCache();
}

// Mocks the RPC methods verifyBscTransfer()/bsc-crypto-billing-provider.mjs actually call, keyed
// by JSON-RPC `method` - {chainId, receipt, blockNumber} let each test shape exactly what the
// chain "reports" without needing a real node.
function mockRpc({ chainId = 56, receipt, blockNumber } = {}) {
  globalThis.fetch = async (url, options) => {
    // Only intercept calls actually aimed at the (fake) BSC RPC endpoint - every other fetch
    // (including this test file's own calls to its local Express server via baseUrl) passes
    // straight through to the real fetch, unaffected.
    if (String(url) !== RPC_URL_SENTINEL) return originalFetch(url, options);
    const body = JSON.parse(options.body);
    if (body.method === 'eth_chainId') return { ok: true, json: async () => ({ result: '0x' + chainId.toString(16) }) };
    if (body.method === 'eth_getTransactionReceipt') return { ok: true, json: async () => ({ result: receipt || null }) };
    if (body.method === 'eth_blockNumber') return { ok: true, json: async () => ({ result: '0x' + (blockNumber || 0).toString(16) }) };
    throw new Error('unexpected RPC method in test: ' + body.method);
  };
}

function makeReceipt({ blockNumber, status = '0x1', logAddress = TOKEN_CONTRACT, to = DEPOSIT_ADDRESS, amount }) {
  return {
    status, blockNumber: '0x' + blockNumber.toString(16),
    logs: [{ address: logAddress, topics: [TRANSFER_EVENT_TOPIC, padTopic(PAYER_ADDRESS), padTopic(to)], data: '0x' + amount.toString(16) }]
  };
}

async function createUserAndCookie(name) {
  const user = await repo.users.create({ displayName: name });
  const headers = await authHeadersFor(repo, user.id);
  return { user, headers };
}

test('with BSC not enabled (fresh repo, nothing configured), Manual stays the default - top-up succeeds as a pending manual transaction, never BSC', async () => {
  const freshRepo = createMemoryRepo();
  const freshServer = createApp({ repo: freshRepo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => freshServer.once('listening', resolve));
  const freshBaseUrl = `http://127.0.0.1:${freshServer.address().port}`;
  try {
    const user = await freshRepo.users.create({ displayName: 'Default Provider User' });
    const headers = await authHeadersFor(freshRepo, user.id);
    const response = await fetch(`${freshBaseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.status, 'pending');
    assert.equal(body.invoiceId, undefined, 'Manual top-ups never create a crypto invoice');
    const invoice = await freshRepo.cryptoInvoices.getByTransactionId(body.transactionId);
    assert.equal(invoice, null);
  } finally {
    await new Promise((resolve) => freshServer.close(resolve));
  }
});

test('with BSC enabled but an incomplete configuration (no RPC secret, no deposit address), creating a top-up fails explicitly (BSC_PROVIDER_NOT_CONFIGURED), never a fake success', async () => {
  const freshRepo = createMemoryRepo();
  const freshServer = createApp({ repo: freshRepo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => freshServer.once('listening', resolve));
  const freshBaseUrl = `http://127.0.0.1:${freshServer.address().port}`;
  try {
    await freshRepo.commercialConfig.publish('bsc:enabled', { enabled: true });
    invalidateCommercialConfigCache();
    // Deliberately leave depositAddress/tokenContract/rpcUrl unset.
    const user = await freshRepo.users.create({ displayName: 'No Config User' });
    const headers = await authHeadersFor(freshRepo, user.id);
    const response = await fetch(`${freshBaseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, 'BSC_PROVIDER_NOT_CONFIGURED');
  } finally {
    await new Promise((resolve) => freshServer.close(resolve));
  }
});

test('creating a top-up with BSC configured returns a safe invoice DTO - no RPC URL, webhook secret, or any credential', async () => {
  await setBscConfig(repo);
  await repo.bscPaymentSecrets.setWebhookSecret('super-secret-should-never-leak');
  mockRpc({ chainId: 56 });
  const { headers } = await createUserAndCookie('DTO User');
  const createResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  assert.equal(createResp.status, 201);
  const { invoiceId } = await createResp.json();
  assert.ok(invoiceId);
  const dtoResp = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}`, { headers });
  assert.equal(dtoResp.status, 200);
  const dto = await dtoResp.json();
  assert.equal(dto.chainName, 'BNB Smart Chain (BSC)');
  assert.equal(dto.assetSymbol, 'USDT');
  assert.equal(dto.recipientAddress, DEPOSIT_ADDRESS);
  assert.equal(dto.status, 'pending');
  // paymentUri/the QR are the PLAIN recipient address - never an EIP-681 `ethereum:{contract}@...`
  // request URI. That richer format is real and spec-correct, but a wallet that only reads the
  // address right after `ethereum:` would read the TOKEN CONTRACT, not the recipient, and could
  // send straight to it - a plain address is what every wallet's basic "scan an address" flow
  // already handles correctly.
  assert.equal(dto.paymentUri, DEPOSIT_ADDRESS);
  assert.doesNotMatch(dto.paymentUri, /^ethereum:/);
  assert.match(dto.qrCodeDataUri, /^data:image\/png;base64,/, 'the QR code is generated server-side, never left for the client to build from raw wallet data');
  const serialized = JSON.stringify(dto);
  assert.doesNotMatch(serialized, /mock-rpc\.invalid/i);
  assert.doesNotMatch(serialized, /super-secret-should-never-leak/);
  assert.equal(dto.rpcUrl, undefined);
  assert.equal(dto.webhookSecret, undefined);
});

test('another user cannot read or check someone else\'s invoice', async () => {
  await setBscConfig(repo);
  mockRpc({ chainId: 56 });
  const { headers: ownerHeaders } = await createUserAndCookie('Owner');
  const { headers: strangerHeaders } = await createUserAndCookie('Stranger');
  const createResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...ownerHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId } = await createResp.json();
  const stolenRead = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}`, { headers: strangerHeaders });
  assert.equal(stolenRead.status, 404);
});

// SECURITY (task C): a check with no txHash supplied must be rejected outright - this used to
// fall back to scanning the shared deposit address for any recent transfer of the right amount,
// which could wrongly match a different payer's transfer. That fallback is gone entirely.
test('checking an invoice without supplying a transaction hash is rejected (TX_HASH_REQUIRED), never auto-scans the shared deposit address', async () => {
  await setBscConfig(repo);
  mockRpc({ chainId: 56 });
  const { user, headers } = await createUserAndCookie('No Hash User');
  const createResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId } = await createResp.json();
  const before = await repo.wallet.getAccount(user.id);

  // Even though a genuinely matching transfer exists on-chain (per the mock), omitting txHash
  // must still be rejected - there is no discovery/scan path left to find it automatically.
  mockRpc({ chainId: 56, blockNumber: 105, receipt: makeReceipt({ blockNumber: 100, amount: 10n * 10n ** 18n }) });
  const checkResp = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  assert.equal(checkResp.status, 400);
  const body = await checkResp.json();
  assert.equal(body.error, 'TX_HASH_REQUIRED');
  const after = await repo.wallet.getAccount(user.id);
  assert.deepEqual(after, before, 'omitting the tx hash must never credit anything');
});

test('a check with the wrong chain id is rejected and never credits the wallet', async () => {
  await setBscConfig(repo);
  mockRpc({ chainId: 56 });
  const { user, headers } = await createUserAndCookie('Chain Mismatch');
  const createResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId } = await createResp.json();
  const before = await repo.wallet.getAccount(user.id);

  mockRpc({ chainId: 97, blockNumber: 100, receipt: makeReceipt({ blockNumber: 99, amount: 10n * 10n ** 18n }) }); // wrong chain (testnet, not 56)
  const checkResp = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0x' + 'a'.repeat(64) }) });
  const result = await checkResp.json();
  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'CHAIN_MISMATCH');
  const after = await repo.wallet.getAccount(user.id);
  assert.deepEqual(after, before, 'a chain mismatch must never credit anything');
});

test('a check with the wrong recipient address is rejected', async () => {
  await setBscConfig(repo);
  mockRpc({ chainId: 56 });
  const { headers } = await createUserAndCookie('Wrong Recipient');
  const createResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId } = await createResp.json();

  mockRpc({ chainId: 56, blockNumber: 105, receipt: makeReceipt({ blockNumber: 100, to: '0x' + '9'.repeat(39) + 'd', amount: 10n * 10n ** 18n }) });
  const checkResp = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0x' + 'b'.repeat(64) }) });
  const result = await checkResp.json();
  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'NO_MATCHING_TRANSFER');
});

// The amount match for the ORIGINAL invoiced purchase is still EXACT - an under-payment can never
// silently activate it at a partial price. But a real, sufficiently-confirmed transfer to the
// right recipient/token/chain is real money received, never simply discarded: it is credited
// directly to the payer's wallet instead, for exactly what they verifiably sent.
test('a check with an insufficient amount never activates the invoiced purchase, but credits the wallet for exactly what was sent', async () => {
  await setBscConfig(repo);
  mockRpc({ chainId: 56 });
  const { user, headers } = await createUserAndCookie('Underpay');
  const createResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId, transactionId } = await createResp.json();
  const before = await repo.wallet.getAccount(user.id);

  mockRpc({ chainId: 56, blockNumber: 105, receipt: makeReceipt({ blockNumber: 100, amount: 5n * 10n ** 18n }) }); // only $5 worth sent, $10 expected
  const checkResp = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0x' + 'c'.repeat(64) }) });
  const result = await checkResp.json();
  assert.equal(result.status, 'mismatched_credited');
  assert.equal(result.creditedMicroUsd, 5000000);
  assert.equal(result.invoice.status, 'failed', 'the invoiced $10 top-up itself must never be treated as fulfilled by a $5 payment');
  assert.equal(result.invoice.mismatchCreditedMicroUsd, 5000000);
  const after = await repo.wallet.getAccount(user.id);
  assert.equal(after.paidBalanceMicroUsd - before.paidBalanceMicroUsd, 5000000, 'the wallet must be credited for exactly the $5 actually received, never the invoiced $10');
  const transaction = await repo.paymentTransactions.get(transactionId);
  assert.equal(transaction.status, 'failed');

  // Idempotent: re-checking (a re-poll, a retried click) must never credit a second time.
  const secondCheck = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  const secondResult = await secondCheck.json();
  assert.equal(secondResult.status, 'mismatched_credited');
  const afterSecond = await repo.wallet.getAccount(user.id);
  assert.deepEqual(afterSecond, after, 'a second check must never credit the mismatch a second time');
});

// An over-payment still completes the invoiced purchase at the INVOICED price (never re-priced
// upward just because more arrived) - only the EXCESS beyond the invoice is credited to the
// wallet as its own separate credit.
test('a check with an amount GREATER than expected (over-payment) still completes the purchase at the invoiced price, crediting only the excess', async () => {
  await setBscConfig(repo);
  mockRpc({ chainId: 56 });
  const { user, headers } = await createUserAndCookie('Overpay');
  const createResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId, transactionId } = await createResp.json();
  const before = await repo.wallet.getAccount(user.id);

  mockRpc({ chainId: 56, blockNumber: 105, receipt: makeReceipt({ blockNumber: 100, amount: 15n * 10n ** 18n }) }); // $15 sent, $10 expected
  const checkResp = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0x' + 'f'.repeat(64) }) });
  const result = await checkResp.json();
  assert.equal(result.status, 'confirmed');
  assert.equal(result.overpaidCreditedMicroUsd, 5000000, 'only the $5 excess over the $10 invoice is its own credit');
  assert.equal(result.invoice.mismatchCreditedMicroUsd, 5000000);
  const after = await repo.wallet.getAccount(user.id);
  // The invoiced $10 top-up itself lands via confirmTransaction()'s normal wallet.grant(), plus
  // the separate $5 excess credit - $15 total, matching exactly what was actually sent.
  assert.equal(after.paidBalanceMicroUsd - before.paidBalanceMicroUsd, 15000000);
  const transaction = await repo.paymentTransactions.get(transactionId);
  assert.equal(transaction.status, 'confirmed');

  const secondCheck = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  const secondResult = await secondCheck.json();
  assert.equal(secondResult.status, 'confirmed');
  const afterSecond = await repo.wallet.getAccount(user.id);
  assert.deepEqual(afterSecond, after, 'a second check must never credit the overpayment excess a second time');
});

test('a check with too few confirmations stays pending, never confirmed, and can succeed later once enough accumulate', async () => {
  await setBscConfig(repo, { confirmationsRequired: 5 });
  mockRpc({ chainId: 56 });
  const { user, headers } = await createUserAndCookie('Confirmations');
  const createResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId } = await createResp.json();
  const expectedAmount = 10n * 10n ** 18n;

  // Only 2 confirmations so far (blockNumber 101 - receiptBlock 100 + 1 = 2), needs 5.
  mockRpc({ chainId: 56, blockNumber: 101, receipt: makeReceipt({ blockNumber: 100, amount: expectedAmount }) });
  const firstCheck = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0xdeadbeef' }) });
  const firstResult = await firstCheck.json();
  assert.equal(firstResult.status, 'pending');
  assert.equal(firstResult.reason, 'INSUFFICIENT_CONFIRMATIONS');
  const midway = await repo.wallet.getAccount(user.id);

  // Now enough confirmations (blockNumber 104 - 100 + 1 = 5). Omitting txHash this time still
  // works - it resumes the hash already claimed by THIS invoice on the first call.
  mockRpc({ chainId: 56, blockNumber: 104, receipt: makeReceipt({ blockNumber: 100, amount: expectedAmount }) });
  const secondCheck = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  const secondResult = await secondCheck.json();
  assert.equal(secondResult.status, 'confirmed');
  const after = await repo.wallet.getAccount(user.id);
  assert.equal(after.paidBalanceMicroUsd, midway.paidBalanceMicroUsd + 10000000, '$10 must land exactly once, only after real confirmations accumulate');
});

test('a fully verified payment credits the wallet EXACTLY ONCE even if checked/replayed many times (idempotent, no double-credit)', async () => {
  await setBscConfig(repo);
  // Invoice CREATION itself cross-checks the chain id (BscCryptoBillingProvider._createInvoiceFor())
  // - the mock must already be active before the create call, not only before the later check.
  mockRpc({ chainId: 56 });
  const { user, headers } = await createUserAndCookie('Idempotent');
  const createResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 25 }) });
  const { invoiceId } = await createResp.json();
  const before = await repo.wallet.getAccount(user.id);

  mockRpc({ chainId: 56, blockNumber: 105, receipt: makeReceipt({ blockNumber: 100, amount: 25n * 10n ** 18n }) });
  for (let i = 0; i < 3; i += 1) {
    const checkResp = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0xsamehash' }) });
    const result = await checkResp.json();
    assert.equal(result.status, 'confirmed');
  }
  const after = await repo.wallet.getAccount(user.id);
  assert.equal(after.paidBalanceMicroUsd, before.paidBalanceMicroUsd + 25000000, 'exactly one $25 credit, no matter how many times the same confirmed tx is re-checked');
});

test('the same on-chain tx hash can never confirm two different invoices (transaction-hash uniqueness) - the concurrent-same-amount-invoice scenario task C describes', async () => {
  await setBscConfig(repo);
  mockRpc({ chainId: 56 }); // active before BOTH create calls below, each of which cross-checks chain id
  const { user, headers } = await createUserAndCookie('Hash Reuse');
  const createFirst = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId: firstInvoiceId } = await createFirst.json();
  const createSecond = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId: secondInvoiceId } = await createSecond.json();

  mockRpc({ chainId: 56, blockNumber: 105, receipt: makeReceipt({ blockNumber: 100, amount: 10n * 10n ** 18n }) });
  const firstCheck = await fetch(`${baseUrl}/api/sync/wallet/invoices/${firstInvoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0xreused' }) });
  assert.equal((await firstCheck.json()).status, 'confirmed');
  const afterFirst = await repo.wallet.getAccount(user.id);

  const secondCheck = await fetch(`${baseUrl}/api/sync/wallet/invoices/${secondInvoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0xreused' }) });
  const secondResult = await secondCheck.json();
  assert.equal(secondResult.status, 'pending', 'the second invoice must never be confirmed by a hash already claimed by another invoice');
  assert.equal(secondResult.reason, 'TX_HASH_ALREADY_CLAIMED');
  const afterSecond = await repo.wallet.getAccount(user.id);
  assert.deepEqual(afterSecond, afterFirst, 'no second credit from the reused hash');
});

// Sanity check that the fix does not break the LEGITIMATE version of this scenario: two distinct
// invoices for the same amount, each paid by its own genuinely distinct on-chain transaction, must
// both still confirm independently and correctly.
test('two invoices for the same amount, each with their own distinct real transaction hash, both confirm correctly and independently', async () => {
  await setBscConfig(repo);
  mockRpc({ chainId: 56 });
  const { user, headers } = await createUserAndCookie('Legitimate Concurrent');
  const createFirst = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId: firstInvoiceId } = await createFirst.json();
  const createSecond = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId: secondInvoiceId } = await createSecond.json();
  const before = await repo.wallet.getAccount(user.id);

  mockRpc({ chainId: 56, blockNumber: 105, receipt: makeReceipt({ blockNumber: 100, amount: 10n * 10n ** 18n }) });
  const firstCheck = await fetch(`${baseUrl}/api/sync/wallet/invoices/${firstInvoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0xfirsttx' }) });
  assert.equal((await firstCheck.json()).status, 'confirmed');
  const secondCheck = await fetch(`${baseUrl}/api/sync/wallet/invoices/${secondInvoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0xsecondtx' }) });
  assert.equal((await secondCheck.json()).status, 'confirmed');
  const after = await repo.wallet.getAccount(user.id);
  assert.equal(after.paidBalanceMicroUsd, before.paidBalanceMicroUsd + 20000000, 'both distinct payments must land - $10 + $10');
});

test('an expired invoice is marked expired and can never be confirmed afterward', async () => {
  await setBscConfig(repo);
  mockRpc({ chainId: 56 });
  const { user, headers } = await createUserAndCookie('Expiry');
  // Constructed directly against the repo (bypassing the real create flow) with an already-past
  // expiresAt - the real invoiceExpiryMinutes admin setting enforces a sane >= 1 minute minimum
  // (buildEffective()'s own validation), so this deterministically exercises "already expired"
  // rather than waiting on a real 60+ second clock.
  const transaction = await repo.paymentTransactions.create({
    userId: user.id, type: 'wallet_topup', provider: 'bsc_crypto', externalTransactionId: 'expiry-test-tx',
    amountMicroUsd: 10000000, currency: 'USD', metadata: {}
  });
  const invoice = await repo.cryptoInvoices.create({
    transactionId: transaction.id, provider: 'bsc_crypto', chainId: 56, assetSymbol: 'USDT', tokenContract: TOKEN_CONTRACT,
    tokenDecimals: 18, recipientAddress: DEPOSIT_ADDRESS, atomicAmount: (10n * 10n ** 18n).toString(), usdAmountMicroUsd: 10000000,
    exchangeRateSnapshot: 1, expiresAt: new Date(Date.now() - 1000).toISOString()
  });

  mockRpc({ chainId: 56, blockNumber: 105, receipt: makeReceipt({ blockNumber: 100, amount: 10n * 10n ** 18n }) });
  const checkResp = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoice.id}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0xtoolate' }) });
  const result = await checkResp.json();
  assert.equal(result.status, 'expired');
  const account = await repo.wallet.getAccount(user.id);
  assert.equal(account.paidBalanceMicroUsd, 0, 'an expired invoice must never be paid, even with a genuinely valid transfer');
});

test('webhook: with no BSC webhook secret configured, the endpoint refuses every call (safe manual/dev fallback, never silently accepted)', async () => {
  await setBscConfig(repo);
  await repo.bscPaymentSecrets.clearWebhookSecret();
  const response = await fetch(`${baseUrl}/api/webhooks/bsc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: 'x', txHash: '0x1' }) });
  assert.equal(response.status, 501);
});

test('webhook: an invalid HMAC signature is rejected', async () => {
  await setBscConfig(repo);
  await repo.bscPaymentSecrets.setWebhookSecret('real-secret');
  const response = await fetch(`${baseUrl}/api/webhooks/bsc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-webhook-signature': 'deadbeef'.repeat(8) },
    body: JSON.stringify({ invoiceId: 'x', txHash: '0x1' })
  });
  assert.equal(response.status, 401);
});

test('webhook: a validly-signed payload triggers the same real verification and confirms exactly once', async () => {
  await setBscConfig(repo);
  await repo.bscPaymentSecrets.setWebhookSecret('real-secret');
  mockRpc({ chainId: 56 }); // active before the create call, which cross-checks chain id
  const { user, headers } = await createUserAndCookie('Webhook User');
  const createResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId } = await createResp.json();

  mockRpc({ chainId: 56, blockNumber: 105, receipt: makeReceipt({ blockNumber: 100, amount: 10n * 10n ** 18n }) });
  const payload = JSON.stringify({ invoiceId, txHash: '0xwebhookhash' });
  const signature = crypto.createHmac('sha256', 'real-secret').update(payload).digest('hex');
  const response = await fetch(`${baseUrl}/api/webhooks/bsc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-webhook-signature': signature }, body: payload
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, 'confirmed');
  const account = await repo.wallet.getAccount(user.id);
  assert.ok(account.paidBalanceMicroUsd >= 10000000);
});

// Regression guard for the removed scan function itself (task C.1) - static source inspection,
// this codebase's established convention for asserting a dangerous code path is truly gone, not
// just unused (see e.g. header-wallet-balance-static.test.mjs).
test('the removed auto-scan discovery function no longer exists anywhere in the BSC chain client', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../server/commercial/bsc-chain-client.mjs', import.meta.url), 'utf8');
  // Narrowly matches an actual function declaration/export, not this file's own explanatory
  // comment documenting the removal (which legitimately names the removed function).
  assert.doesNotMatch(src, /function\s+findRecentTransfersToAddress\s*\(/, 'the shared-address scan-and-match-by-amount function must be removed entirely, not merely unused');
});
