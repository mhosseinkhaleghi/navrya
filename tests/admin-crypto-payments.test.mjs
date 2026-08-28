import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { createSession } from '../server/community/security/session-service.mjs';
import { issueCsrfToken } from '../server/community/security/csrf.mjs';
import { sessionCookieName, csrfCookieName } from '../server/community/security/cookies.mjs';

// Admin-config task (D) - contract-level coverage for the new
// /api/admin/commercial/crypto-payments/* routes: admin/reauth enforcement, zero secret leakage
// (GET responses, audit log details), deposit-address-change-only-affects-new-invoices, live RPC
// test success/mismatch/unreachable, and BSC-cannot-enable-with-incomplete-config. Mirrors
// commercial-admin-api-contract.test.mjs's own createApp()/repo.memory.mjs/staleReauthAdminHeaders
// convention.
//
// Every test gets its OWN fresh repo/server/admin (withFreshAdmin() below) rather than one shared
// instance across the whole file - deliberately, since so many assertions here depend on the
// EXACT current enabled/config state (which real admin actions in one test would otherwise leak
// into the next test's expectations).
const DEPOSIT_ADDRESS_A = '0x' + '1'.repeat(39) + 'a';
const DEPOSIT_ADDRESS_B = '0x' + '5'.repeat(39) + 'e';
const TOKEN_CONTRACT = '0x' + '2'.repeat(39) + 'b';
const RPC_URL_SENTINEL = 'http://mock-rpc.invalid';

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

function mockRpc({ chainId = 56, unreachable = false } = {}) {
  globalThis.fetch = async (url, options) => {
    if (String(url) !== RPC_URL_SENTINEL) return originalFetch(url, options);
    if (unreachable) throw new Error('ECONNREFUSED');
    const body = JSON.parse(options.body);
    if (body.method === 'eth_chainId') return { ok: true, json: async () => ({ result: '0x' + chainId.toString(16) }) };
    throw new Error('unexpected RPC method in test: ' + body.method);
  };
}

// Spins up an isolated repo + Express server + one real admin user, hands the caller a small
// `api()` bound to that admin's fresh (reauth-valid) session by default, and tears the server
// down afterward. `asUser` lets a test act as a different (non-admin, or stale-reauth) identity.
async function withFreshAdmin(fn) {
  const repo = createMemoryRepo();
  const server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const adminUser = await repo.users.create({ displayName: 'Admin' });
    const admin = await repo.users.update(adminUser.id, { role: 'admin' });
    async function api(method, path, { body, headers } = {}) {
      const reqHeaders = { 'Content-Type': 'application/json' };
      if (!headers) Object.assign(reqHeaders, await authHeadersFor(repo, admin.id));
      Object.assign(reqHeaders, headers || {});
      const response = await fetch(baseUrl + path, { method, headers: reqHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    }
    // authHeadersFor's cached session is always reauth-fresh by construction (mirrors
    // commercial-admin-api-contract.test.mjs's identical helper) - this is the only way to
    // exercise a real admin whose step-up has gone stale.
    async function staleHeaders() {
      const { rawId, record } = await createSession(repo, { userId: admin.id, reauth: false });
      const csrfToken = issueCsrfToken(record.id);
      return { Cookie: `${sessionCookieName()}=${rawId}; ${csrfCookieName()}=${csrfToken}`, 'x-csrf-token': csrfToken };
    }
    async function publishCompletePublicConfig() {
      await api('PATCH', '/api/admin/commercial/crypto-payments/public-settings', {
        body: { chainId: 56, tokenSymbol: 'USDT', tokenContract: TOKEN_CONTRACT, tokenDecimals: 18, exchangeRateUsdPerToken: 1, confirmationsRequired: 15, invoiceExpiryMinutes: 30 }
      });
      await api('PATCH', '/api/admin/commercial/crypto-payments/public-settings', { body: { depositAddress: DEPOSIT_ADDRESS_A } });
    }
    await fn({ repo, api, admin, baseUrl, staleHeaders, publishCompletePublicConfig });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('a non-admin cannot read or change crypto payments config', async () => {
  await withFreshAdmin(async ({ repo, baseUrl }) => {
    const user = await repo.users.create({ displayName: 'Regular User' });
    const headers = await authHeadersFor(repo, user.id);
    const getResp = await fetch(`${baseUrl}/api/admin/commercial/crypto-payments/status`, { headers });
    assert.equal(getResp.status, 403);
    const patchResp = await fetch(`${baseUrl}/api/admin/commercial/crypto-payments/status`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
    assert.equal(patchResp.status, 403);
  });
});

test('BSC is disabled by default and Manual is the reported mode', async () => {
  await withFreshAdmin(async ({ api }) => {
    const result = await api('GET', '/api/admin/commercial/crypto-payments/status');
    assert.equal(result.status, 200);
    assert.equal(result.body.enabled, false);
    assert.equal(result.body.mode, 'manual');
    assert.equal(result.body.configComplete, false);
  });
});

test('saving public settings WITHOUT touching depositAddress does not require a fresh reauth', async () => {
  await withFreshAdmin(async ({ api, staleHeaders }) => {
    const result = await api('PATCH', '/api/admin/commercial/crypto-payments/public-settings', { headers: await staleHeaders(), body: { tokenSymbol: 'USDC' } });
    assert.equal(result.status, 200);
    assert.equal(result.body.tokenSymbol, 'USDC');
  });
});

test('changing the deposit address specifically requires a fresh reauth', async () => {
  await withFreshAdmin(async ({ api, staleHeaders }) => {
    const staleResult = await api('PATCH', '/api/admin/commercial/crypto-payments/public-settings', { headers: await staleHeaders(), body: { depositAddress: DEPOSIT_ADDRESS_A } });
    assert.equal(staleResult.status, 401);
    assert.equal(staleResult.body.error, 'STEP_UP_REQUIRED');
    const freshResult = await api('PATCH', '/api/admin/commercial/crypto-payments/public-settings', { body: { depositAddress: DEPOSIT_ADDRESS_A } });
    assert.equal(freshResult.status, 200);
    assert.equal(freshResult.body.depositAddress, DEPOSIT_ADDRESS_A);
  });
});

test('an invalid deposit address / token contract is rejected', async () => {
  await withFreshAdmin(async ({ api }) => {
    const result = await api('PATCH', '/api/admin/commercial/crypto-payments/public-settings', { body: { depositAddress: 'not-an-address' } });
    assert.equal(result.status, 400);
  });
});

test('rotating the RPC secret and rotating the webhook secret both require a fresh reauth', async () => {
  await withFreshAdmin(async ({ api, staleHeaders }) => {
    const headers = await staleHeaders();
    const rpcResult = await api('POST', '/api/admin/commercial/crypto-payments/rpc-secret', { headers, body: { rpcUrl: RPC_URL_SENTINEL } });
    assert.equal(rpcResult.status, 401);
    const webhookResult = await api('POST', '/api/admin/commercial/crypto-payments/webhook-secret', { headers });
    assert.equal(webhookResult.status, 401);
  });
});

test('the webhook secret is generated server-side, returned exactly once, and never re-returned by GET', async () => {
  await withFreshAdmin(async ({ api }) => {
    const genResult = await api('POST', '/api/admin/commercial/crypto-payments/webhook-secret');
    assert.equal(genResult.status, 200);
    assert.ok(genResult.body.webhookSecret && genResult.body.webhookSecret.length > 20);
    const status = await api('GET', '/api/admin/commercial/crypto-payments/status');
    assert.equal(status.body.webhookConfigured, true);
    assert.equal(status.body.webhookSecret, undefined);
    assert.doesNotMatch(JSON.stringify(status.body), new RegExp(genResult.body.webhookSecret));
  });
});

test('no GET response, PATCH/POST response, or audit log entry ever contains the raw RPC URL or webhook secret value', async () => {
  await withFreshAdmin(async ({ api, repo, admin, publishCompletePublicConfig }) => {
    const secretRpcUrl = 'http://leak-check-rpc.invalid/super-secret-path-token-abc123';
    const secretWebhook = 'leak-check-webhook-secret-should-never-appear';
    await api('POST', '/api/admin/commercial/crypto-payments/rpc-secret', { body: { rpcUrl: secretRpcUrl } });
    await repo.bscPaymentSecrets.setWebhookSecret(secretWebhook, { updatedBy: admin.id }); // seed directly, bypass the one-time-reveal response
    await publishCompletePublicConfig();

    const status = await api('GET', '/api/admin/commercial/crypto-payments/status');
    const serializedStatus = JSON.stringify(status.body);
    assert.doesNotMatch(serializedStatus, /leak-check-rpc\.invalid/);
    assert.doesNotMatch(serializedStatus, /super-secret-path-token/);
    assert.doesNotMatch(serializedStatus, /leak-check-webhook-secret/);

    const publicSave = await api('PATCH', '/api/admin/commercial/crypto-payments/public-settings', { body: { tokenSymbol: 'USDT' } });
    assert.doesNotMatch(JSON.stringify(publicSave.body), /leak-check-rpc\.invalid|leak-check-webhook-secret/);

    const auditEntries = await repo.auditLog.list({ limit: 200 });
    const cryptoPayEntries = auditEntries.filter((entry) => entry.action.startsWith('commercial.cryptoPayments.'));
    assert.ok(cryptoPayEntries.length > 0, 'at least one crypto-payments audit entry must exist to check');
    const serializedAudit = JSON.stringify(cryptoPayEntries);
    assert.doesNotMatch(serializedAudit, /leak-check-rpc\.invalid/);
    assert.doesNotMatch(serializedAudit, /super-secret-path-token/);
    assert.doesNotMatch(serializedAudit, /leak-check-webhook-secret/);
  });
});

test('changing the deposit address only affects invoices created afterward - an already-created invoice keeps its original frozen address', async () => {
  await withFreshAdmin(async ({ api, repo, publishCompletePublicConfig, baseUrl }) => {
    mockRpc({ chainId: 56 });
    await api('POST', '/api/admin/commercial/crypto-payments/rpc-secret', { body: { rpcUrl: RPC_URL_SENTINEL } });
    await publishCompletePublicConfig(); // depositAddress = DEPOSIT_ADDRESS_A
    const enableResult = await api('PATCH', '/api/admin/commercial/crypto-payments/status', { body: { enabled: true } });
    assert.equal(enableResult.status, 200, JSON.stringify(enableResult.body));

    const buyer = await repo.users.create({ displayName: 'Buyer' });
    const buyerHeaders = await authHeadersFor(repo, buyer.id);
    const firstInvoiceResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...buyerHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
    const firstInvoiceBody = await firstInvoiceResp.json();
    const firstInvoice = await repo.cryptoInvoices.get(firstInvoiceBody.invoiceId);
    assert.equal(firstInvoice.recipientAddress, DEPOSIT_ADDRESS_A);

    const addressChange = await api('PATCH', '/api/admin/commercial/crypto-payments/public-settings', { body: { depositAddress: DEPOSIT_ADDRESS_B } });
    assert.equal(addressChange.status, 200);
    assert.equal(addressChange.body.depositAddress, DEPOSIT_ADDRESS_B);

    const secondInvoiceResp = await fetch(`${baseUrl}/api/sync/wallet/topup-request`, { method: 'POST', headers: { ...buyerHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: 10 }) });
    const secondInvoiceBody = await secondInvoiceResp.json();
    const secondInvoice = await repo.cryptoInvoices.get(secondInvoiceBody.invoiceId);
    assert.equal(secondInvoice.recipientAddress, DEPOSIT_ADDRESS_B);

    const firstInvoiceAfter = await repo.cryptoInvoices.get(firstInvoice.id);
    assert.equal(firstInvoiceAfter.recipientAddress, DEPOSIT_ADDRESS_A, 'an already-created invoice must never be retroactively changed by a later admin edit');
  });
});

test('enabling BSC fails with an incomplete configuration (BSC_CONFIG_INCOMPLETE)', async () => {
  await withFreshAdmin(async ({ api }) => {
    // Deliberately configure nothing.
    const result = await api('PATCH', '/api/admin/commercial/crypto-payments/status', { body: { enabled: true } });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'BSC_CONFIG_INCOMPLETE');
    assert.ok(Array.isArray(result.body.missing) && result.body.missing.length > 0);
  });
});

test('enabling BSC fails when the live RPC reports a different chain than configured (BSC_RPC_VALIDATION_FAILED)', async () => {
  await withFreshAdmin(async ({ api, publishCompletePublicConfig }) => {
    mockRpc({ chainId: 97 }); // testnet, but chainId configured below is 56 (mainnet)
    await api('POST', '/api/admin/commercial/crypto-payments/rpc-secret', { body: { rpcUrl: RPC_URL_SENTINEL } });
    await publishCompletePublicConfig();
    const result = await api('PATCH', '/api/admin/commercial/crypto-payments/status', { body: { enabled: true } });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'BSC_RPC_VALIDATION_FAILED');
    const status = await api('GET', '/api/admin/commercial/crypto-payments/status');
    assert.equal(status.body.enabled, false, 'a failed enable attempt must never actually enable BSC');
  });
});

test('enabling BSC fails when the RPC endpoint is unreachable', async () => {
  await withFreshAdmin(async ({ api, publishCompletePublicConfig }) => {
    mockRpc({ unreachable: true });
    await api('POST', '/api/admin/commercial/crypto-payments/rpc-secret', { body: { rpcUrl: RPC_URL_SENTINEL } });
    await publishCompletePublicConfig();
    const result = await api('PATCH', '/api/admin/commercial/crypto-payments/status', { body: { enabled: true } });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'BSC_RPC_VALIDATION_FAILED');
  });
});

test('enabling BSC succeeds when the configuration is complete and the live RPC chain matches, and disabling always succeeds', async () => {
  await withFreshAdmin(async ({ api, publishCompletePublicConfig }) => {
    mockRpc({ chainId: 56 });
    await api('POST', '/api/admin/commercial/crypto-payments/rpc-secret', { body: { rpcUrl: RPC_URL_SENTINEL } });
    await publishCompletePublicConfig();
    const enableResult = await api('PATCH', '/api/admin/commercial/crypto-payments/status', { body: { enabled: true } });
    assert.equal(enableResult.status, 200);
    assert.equal(enableResult.body.enabled, true);
    assert.equal(enableResult.body.mode, 'bsc_crypto');

    const disableResult = await api('PATCH', '/api/admin/commercial/crypto-payments/status', { body: { enabled: false } });
    assert.equal(disableResult.status, 200);
    assert.equal(disableResult.body.enabled, false);
  });
});

test('test-connection reports success with the detected chain id, and mismatch when it differs from configured', async () => {
  await withFreshAdmin(async ({ api, publishCompletePublicConfig }) => {
    await publishCompletePublicConfig(); // chainId 56
    mockRpc({ chainId: 56 });
    await api('POST', '/api/admin/commercial/crypto-payments/rpc-secret', { body: { rpcUrl: RPC_URL_SENTINEL } });
    const okResult = await api('POST', '/api/admin/commercial/crypto-payments/test-connection');
    assert.equal(okResult.status, 200);
    assert.equal(okResult.body.ok, true);
    assert.equal(okResult.body.detectedChainId, 56);
    assert.equal(okResult.body.matches, true);

    mockRpc({ chainId: 97 });
    const mismatchResult = await api('POST', '/api/admin/commercial/crypto-payments/test-connection');
    assert.equal(mismatchResult.body.ok, true);
    assert.equal(mismatchResult.body.matches, false);
    assert.equal(mismatchResult.body.detectedChainId, 97);
  });
});

test('test-connection reports a safe failure (never the raw error or URL) when the RPC is unreachable', async () => {
  await withFreshAdmin(async ({ api }) => {
    await api('POST', '/api/admin/commercial/crypto-payments/rpc-secret', { body: { rpcUrl: RPC_URL_SENTINEL } });
    mockRpc({ unreachable: true });
    const result = await api('POST', '/api/admin/commercial/crypto-payments/test-connection');
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.reason, 'UNREACHABLE');
    assert.doesNotMatch(JSON.stringify(result.body), /mock-rpc\.invalid/);
  });
});

test('clearing the RPC secret while BSC is enabled automatically disables it (never leaves "enabled" silently meaning "misconfigured")', async () => {
  await withFreshAdmin(async ({ api, publishCompletePublicConfig }) => {
    mockRpc({ chainId: 56 });
    await api('POST', '/api/admin/commercial/crypto-payments/rpc-secret', { body: { rpcUrl: RPC_URL_SENTINEL } });
    await publishCompletePublicConfig();
    await api('PATCH', '/api/admin/commercial/crypto-payments/status', { body: { enabled: true } });

    const clearResult = await api('DELETE', '/api/admin/commercial/crypto-payments/rpc-secret');
    assert.equal(clearResult.status, 200);
    assert.equal(clearResult.body.rpcConfigured, false);
    assert.equal(clearResult.body.autoDisabled, true);

    const status = await api('GET', '/api/admin/commercial/crypto-payments/status');
    assert.equal(status.body.enabled, false);
  });
});
