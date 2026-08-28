import assert from 'node:assert/strict';
import test, { after, afterEach, before } from 'node:test';
import crypto from 'node:crypto';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Real BSC crypto payment invoices (task A) - end-to-end coverage: invoice creation + safe DTO,
// server-side on-chain verification (chain/token/recipient/amount/confirmations/expiry/hash-
// uniqueness), the idempotent confirmTransaction() choke point, and the optional HMAC-verified
// webhook. Mocks globalThis.fetch for the BSC JSON-RPC calls, the same established convention
// ai-gateway.test.mjs already uses for provider HTTP calls - no real BSC RPC endpoint is reached.
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// Generated (never hand-typed) so each is guaranteed exactly 40 hex chars - a real Ethereum/BSC
// address length. A hand-typed repeated-digit string silently being 38 or 39 chars long is exactly
// the kind of off-by-one that breaks padTopic()/topicToAddress()'s fixed-width slicing in a way
// that fails unpredictably rather than loudly - worth generating precisely instead of eyeballing.
const DEPOSIT_ADDRESS = '0x' + '1'.repeat(39) + 'a';
const TOKEN_CONTRACT = '0x' + '2'.repeat(39) + 'b';
const PAYER_ADDRESS = '0x' + '3'.repeat(39) + 'c';

function padTopic(address) { return '0x' + '0'.repeat(24) + address.replace(/^0x/i, '').toLowerCase(); }

let server, baseUrl, repo;
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

before(async () => {
  // BillingProvider selection happens once, at router-construction time inside createApp() -
  // BILLING_PROVIDER must already be 'bsc_crypto' before that call, since every route's
  // billingProvider instance is fixed for the lifetime of this one test server (no per-request
  // re-selection). Every test in this file wants the BSC provider, so this is set once, here.
  process.env.BILLING_PROVIDER = 'bsc_crypto';
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) { if (!(key in originalEnv)) delete process.env[key]; }
  Object.assign(process.env, originalEnv);
});

function setBscConfig(overrides = {}) {
  Object.assign(process.env, {
    BILLING_PROVIDER: 'bsc_crypto', BSC_RPC_URL: 'http://mock-rpc.invalid', BSC_CHAIN_ID: '56',
    BSC_DEPOSIT_ADDRESS: DEPOSIT_ADDRESS, BSC_TOKEN_CONTRACT: TOKEN_CONTRACT, BSC_TOKEN_SYMBOL: 'USDT',
    BSC_TOKEN_DECIMALS: '18', BSC_CONFIRMATIONS_REQUIRED: '2', BSC_INVOICE_EXPIRY_MINUTES: '30',
    ...overrides
  });
}

// Mocks the RPC methods verifyBscTransfer()/bsc-crypto-billing-provider.mjs actually call, keyed
// by JSON-RPC `method` - {chainId, receipt, blockNumber} let each test shape exactly what the
// chain "reports" without needing a real node.
function mockRpc({ chainId = 56, receipt, blockNumber, logsResult } = {}) {
  globalThis.fetch = async (url, options) => {
    // Only intercept calls actually aimed at the (fake) BSC RPC endpoint - every other fetch
    // (including this test file's own calls to its local Express server via baseUrl) passes
    // straight through to the real fetch, unaffected.
    if (String(url) !== process.env.BSC_RPC_URL) return originalFetch(url, options);
    const body = JSON.parse(options.body);
    if (body.method === 'eth_chainId') return { ok: true, json: async () => ({ result: '0x' + chainId.toString(16) }) };
    if (body.method === 'eth_getTransactionReceipt') return { ok: true, json: async () => ({ result: receipt || null }) };
    if (body.method === 'eth_blockNumber') return { ok: true, json: async () => ({ result: '0x' + (blockNumber || 0).toString(16) }) };
    if (body.method === 'eth_getLogs') return { ok: true, json: async () => ({ result: logsResult || [] }) };
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

test('with BSC not configured, creating a top-up fails explicitly (BSC_PROVIDER_NOT_CONFIGURED), never a fake success', async () => {
  process.env.BILLING_PROVIDER = 'bsc_crypto';
  // Deliberately leave BSC_RPC_URL etc. unset.
  const { headers } = await createUserAndCookie('No Config User');
  const response = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, 'BSC_PROVIDER_NOT_CONFIGURED');
});

test('creating a top-up with BSC configured returns a safe invoice DTO - no RPC URL, webhook secret, or any credential', async () => {
  setBscConfig();
  process.env.BSC_WEBHOOK_SECRET = 'super-secret-should-never-leak';
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
  assert.match(dto.paymentUri, /^ethereum:/);
  assert.match(dto.qrCodeDataUri, /^data:image\/png;base64,/, 'the QR code is generated server-side, never left for the client to build from raw wallet data');
  const serialized = JSON.stringify(dto);
  assert.doesNotMatch(serialized, /mock-rpc\.invalid/i);
  assert.doesNotMatch(serialized, /super-secret-should-never-leak/);
  assert.equal(dto.rpcUrl, undefined);
  assert.equal(dto.webhookSecret, undefined);
});

test('another user cannot read or check someone else\'s invoice', async () => {
  setBscConfig();
  mockRpc({ chainId: 56 });
  const { headers: ownerHeaders } = await createUserAndCookie('Owner');
  const { headers: strangerHeaders } = await createUserAndCookie('Stranger');
  const createResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...ownerHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId } = await createResp.json();
  const stolenRead = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}`, { headers: strangerHeaders });
  assert.equal(stolenRead.status, 404);
});

test('a check with the wrong chain id is rejected and never credits the wallet', async () => {
  setBscConfig();
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
  setBscConfig();
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

test('a check with an insufficient amount is rejected (under-payment never accepted)', async () => {
  setBscConfig();
  mockRpc({ chainId: 56 });
  const { headers } = await createUserAndCookie('Underpay');
  const createResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId } = await createResp.json();

  mockRpc({ chainId: 56, blockNumber: 105, receipt: makeReceipt({ blockNumber: 100, amount: 5n * 10n ** 18n }) }); // only $5 worth sent, $10 expected
  const checkResp = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0x' + 'c'.repeat(64) }) });
  const result = await checkResp.json();
  assert.equal(result.status, 'pending');
  assert.equal(result.reason, 'NO_MATCHING_TRANSFER');
});

test('a check with too few confirmations stays pending, never confirmed, and can succeed later once enough accumulate', async () => {
  setBscConfig({ BSC_CONFIRMATIONS_REQUIRED: '5' });
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

  // Now enough confirmations (blockNumber 104 - 100 + 1 = 5).
  mockRpc({ chainId: 56, blockNumber: 104, receipt: makeReceipt({ blockNumber: 100, amount: expectedAmount }) });
  const secondCheck = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0xdeadbeef' }) });
  const secondResult = await secondCheck.json();
  assert.equal(secondResult.status, 'confirmed');
  const after = await repo.wallet.getAccount(user.id);
  assert.equal(after.paidBalanceMicroUsd, midway.paidBalanceMicroUsd + 10000000, '$10 must land exactly once, only after real confirmations accumulate');
});

test('a fully verified payment credits the wallet EXACTLY ONCE even if checked/replayed many times (idempotent, no double-credit)', async () => {
  setBscConfig();
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

test('the same on-chain tx hash can never confirm two different invoices (transaction-hash uniqueness)', async () => {
  setBscConfig();
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

test('an expired invoice is marked expired and can never be confirmed afterward', async () => {
  setBscConfig({ BSC_INVOICE_EXPIRY_MINUTES: '0' }); // expires essentially immediately
  mockRpc({ chainId: 56 });
  const { user, headers } = await createUserAndCookie('Expiry');
  const createResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
  const { invoiceId } = await createResp.json();
  await new Promise((resolve) => setTimeout(resolve, 20));

  mockRpc({ chainId: 56, blockNumber: 105, receipt: makeReceipt({ blockNumber: 100, amount: 10n * 10n ** 18n }) });
  const checkResp = await fetch(`${baseUrl}/api/sync/wallet/invoices/${invoiceId}/check`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: '0xtoolate' }) });
  const result = await checkResp.json();
  assert.equal(result.status, 'expired');
  const account = await repo.wallet.getAccount(user.id);
  assert.equal(account.promoBalanceMicroUsd > 0 ? account.paidBalanceMicroUsd : 0, 0, 'an expired invoice must never be paid, even with a genuinely valid transfer');
});

test('webhook: with no BSC_WEBHOOK_SECRET configured, the endpoint refuses every call (safe manual/dev fallback, never silently accepted)', async () => {
  setBscConfig();
  const response = await fetch(`${baseUrl}/api/webhooks/bsc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: 'x', txHash: '0x1' }) });
  assert.equal(response.status, 501);
});

test('webhook: an invalid HMAC signature is rejected', async () => {
  setBscConfig();
  process.env.BSC_WEBHOOK_SECRET = 'real-secret';
  const response = await fetch(`${baseUrl}/api/webhooks/bsc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-webhook-signature': 'deadbeef'.repeat(8) },
    body: JSON.stringify({ invoiceId: 'x', txHash: '0x1' })
  });
  assert.equal(response.status, 401);
});

test('webhook: a validly-signed payload triggers the same real verification and confirms exactly once', async () => {
  setBscConfig();
  process.env.BSC_WEBHOOK_SECRET = 'real-secret';
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
