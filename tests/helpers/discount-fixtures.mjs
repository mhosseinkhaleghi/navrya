import assert from 'node:assert/strict';
import { createApp } from '../../server/community/app.mjs';
import { createMemoryRepo } from '../../server/db/repo.memory.mjs';
import { invalidateCommercialConfigCache } from '../../server/commercial/commercial-config.mjs';
import { authHeadersFor } from './auth-token.mjs';
import { createSession } from '../../server/community/security/session-service.mjs';
import { issueCsrfToken } from '../../server/community/security/csrf.mjs';
import { sessionCookieName, csrfCookieName } from '../../server/community/security/cookies.mjs';

// Shared fixtures for the discount-code / subscription-wallet-bonus test files (Phase 2 of the
// approved plan). Nothing here reaches production code that does not exist yet except through the
// repo/route surface the tests themselves define - see requireDiscountDomains().

export const ORIGINAL_FETCH = globalThis.fetch;
export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;

// Catalog prices from server/commercial/commercial-defaults.mjs, in integer micro-USD.
export const PLUS_MICRO = 4_990_000;
export const PRO_MICRO = 14_990_000;
// 15% (1500 basis points) of those prices, half-up in exact integer math (cross-checked with BigInt).
export const PRO_15_DISCOUNT = 2_248_500;
export const PRO_15_FINAL = 12_741_500;
export const PLUS_15_DISCOUNT = 748_500;
export const PLUS_15_FINAL = 4_241_500;

export const iso = (ms) => new Date(ms).toISOString();

// commercial-config.mjs's effective-config cache is process-wide, not per-repo - every fresh repo
// must start with it invalidated (same reasoning as payment-transactions.test.mjs's beforeEach).
export function newRepo() {
  invalidateCommercialConfigCache();
  return createMemoryRepo();
}

export async function makeUser(repo, name) {
  return repo.users.create({ displayName: name });
}
export async function makeAdmin(repo, name) {
  const user = await repo.users.create({ displayName: name });
  return repo.users.update(user.id, { role: 'admin' });
}

// authHeadersFor()'s cached session is always reauth-fresh by construction, so a real admin whose
// step-up has gone stale can only be exercised by minting a session with reauth:false (the same
// approach commercial-admin-api-contract.test.mjs uses).
export async function staleReauthHeaders(repo, userId) {
  const { rawId, record } = await createSession(repo, { userId, reauth: false });
  const csrfToken = issueCsrfToken(record.id);
  return { Cookie: `${sessionCookieName()}=${rawId}; ${csrfCookieName()}=${csrfToken}`, 'x-csrf-token': csrfToken };
}

// The dedicated domains do not exist until Phase 3. Asserting their presence up front turns
// "TypeError: Cannot read properties of undefined" into a message that names the missing behavior.
export function requireDiscountDomains(repo) {
  assert.ok(repo.discountCodes && typeof repo.discountCodes.create === 'function',
    'repo.discountCodes is missing - the dedicated discount-code domain does not exist yet');
  assert.ok(repo.discountRedemptions && typeof repo.discountRedemptions.reserve === 'function',
    'repo.discountRedemptions is missing - the dedicated redemption/reservation domain does not exist yet');
}

let codeCounter = 0;
// Creates a code straight through the repo, in its STORED form: discountValue is basis points for a
// percent code (1500 = 15%) and integer micro-USD for a fixed code.
export async function makeCode(repo, overrides = {}) {
  requireDiscountDomains(repo);
  codeCounter += 1;
  return repo.discountCodes.create({
    code: 'PROMO' + codeCounter, campaignName: 'Campaign ' + codeCounter, discountType: 'percent', discountValue: 1500,
    startsAt: null, expiresAt: null, maxRedemptions: null, active: true, createdBy: null, ...overrides
  });
}

export async function assertApiError(promise, { status, code, details }) {
  await assert.rejects(promise, (error) => {
    assert.equal(error && error.code, code, 'expected ApiError code ' + code + ' but got ' + (error && error.code) + ' (' + (error && error.message) + ')');
    if (status !== undefined) assert.equal(error.status, status, 'wrong HTTP status for ' + code);
    if (details) {
      Object.entries(details).forEach(([key, value]) => assert.equal(error.details && error.details[key], value, 'wrong details.' + key + ' for ' + code));
    }
    return true;
  });
}

export function assertStats(stats, { confirmed, pendingReservations, remaining }) {
  assert.ok(stats, 'stats must be returned');
  assert.equal(stats.confirmed, confirmed, 'confirmed');
  assert.equal(stats.pendingReservations, pendingReservations, 'pendingReservations');
  assert.equal(stats.remaining, remaining, 'remaining');
}

export async function setPlanBonus(repo, planId, amountUsd) {
  await repo.commercialConfig.publish('plan:' + planId + ':walletBonusUsd', { amountUsd }, {});
  invalidateCommercialConfigCache();
}
export async function setPlanPrice(repo, planId, amountUsd) {
  await repo.commercialConfig.publish('plan:' + planId + ':price', { amountUsd, billingInterval: 'month' }, {});
  invalidateCommercialConfigCache();
}

export async function ledgerEntries(repo, userId, type) {
  const entries = await repo.wallet.ledgerForUser(userId, { limit: 500 });
  return type ? entries.filter((entry) => entry.type === type) : entries;
}

// Starts the real Express app over the given (or a fresh) memory repo. Mirrors the
// createApp()/listen(0) topology every commercial contract test already uses.
export async function startApp({ repo = newRepo() } = {}) {
  delete process.env.ADMIN_AUTH_ENFORCED;
  const server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function api(method, path, { body, userId, headers } = {}) {
    const requestHeaders = { 'Content-Type': 'application/json' };
    if (userId) Object.assign(requestHeaders, await authHeadersFor(repo, userId));
    Object.assign(requestHeaders, headers || {});
    const response = await ORIGINAL_FETCH(baseUrl + path, { method, headers: requestHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
  }
  async function close() {
    globalThis.fetch = ORIGINAL_FETCH;
    await new Promise((resolve) => server.close(resolve));
  }
  return { repo, api, baseUrl, close };
}

export async function withApp(fn, options) {
  const app = await startApp(options);
  try {
    return await fn(app);
  } finally {
    await app.close();
  }
}

// ---- BSC (BNB Smart Chain) RPC mocking - same convention as bsc-crypto-payments.test.mjs --------
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const DEPOSIT_ADDRESS = '0x' + '1'.repeat(39) + 'a';
export const TOKEN_CONTRACT = '0x' + '2'.repeat(39) + 'b';
export const PAYER_ADDRESS = '0x' + '3'.repeat(39) + 'c';
export const RPC_URL_SENTINEL = 'http://mock-rpc.invalid';

function padTopic(address) { return '0x' + '0'.repeat(24) + address.replace(/^0x/i, '').toLowerCase(); }

export async function setBscConfig(repo, overrides = {}) {
  const fields = {
    enabled: true, chainId: 56, depositAddress: DEPOSIT_ADDRESS, tokenContract: TOKEN_CONTRACT, tokenSymbol: 'USDT',
    tokenDecimals: 18, confirmationsRequired: 2, invoiceExpiryMinutes: 30, exchangeRateUsdPerToken: 1, ...overrides
  };
  await repo.commercialConfig.publish('bsc:chainId', { chainId: fields.chainId });
  await repo.commercialConfig.publish('bsc:depositAddress', { address: fields.depositAddress });
  await repo.commercialConfig.publish('bsc:tokenContract', { address: fields.tokenContract });
  await repo.commercialConfig.publish('bsc:tokenSymbol', { symbol: fields.tokenSymbol });
  await repo.commercialConfig.publish('bsc:tokenDecimals', { decimals: fields.tokenDecimals });
  await repo.commercialConfig.publish('bsc:confirmationsRequired', { count: fields.confirmationsRequired });
  await repo.commercialConfig.publish('bsc:invoiceExpiryMinutes', { minutes: fields.invoiceExpiryMinutes });
  await repo.commercialConfig.publish('bsc:exchangeRateUsdPerToken', { rate: fields.exchangeRateUsdPerToken });
  await repo.bscPaymentSecrets.setRpcUrl(RPC_URL_SENTINEL);
  await repo.commercialConfig.publish('bsc:enabled', { enabled: fields.enabled });
  invalidateCommercialConfigCache();
}

export function mockRpc({ chainId = 56, receipt, blockNumber } = {}) {
  globalThis.fetch = async (url, options) => {
    if (String(url) !== RPC_URL_SENTINEL) return ORIGINAL_FETCH(url, options);
    const body = JSON.parse(options.body);
    if (body.method === 'eth_chainId') return { ok: true, json: async () => ({ result: '0x' + chainId.toString(16) }) };
    if (body.method === 'eth_getTransactionReceipt') return { ok: true, json: async () => ({ result: receipt || null }) };
    if (body.method === 'eth_blockNumber') return { ok: true, json: async () => ({ result: '0x' + (blockNumber || 0).toString(16) }) };
    throw new Error('unexpected RPC method in test: ' + body.method);
  };
}

// Any contact with the (fake) RPC endpoint is recorded and then fails - proves a code path never
// needed the chain (e.g. a zero-price checkout has nothing to invoice).
export function rpcCallCounter() {
  const counter = { calls: 0 };
  globalThis.fetch = async (url, options) => {
    if (String(url) !== RPC_URL_SENTINEL) return ORIGINAL_FETCH(url, options);
    counter.calls += 1;
    throw new Error('the BSC RPC must not be contacted on this path');
  };
  return counter;
}

export function makeReceipt({ blockNumber, status = '0x1', logAddress = TOKEN_CONTRACT, to = DEPOSIT_ADDRESS, amount }) {
  return {
    status, blockNumber: '0x' + blockNumber.toString(16),
    logs: [{ address: logAddress, topics: [TRANSFER_EVENT_TOPIC, padTopic(PAYER_ADDRESS), padTopic(to)], data: '0x' + amount.toString(16) }]
  };
}

export const TX_HASH_A = '0x' + 'a'.repeat(64);
