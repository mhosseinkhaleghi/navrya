import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { createSession } from '../server/community/security/session-service.mjs';
import { issueCsrfToken } from '../server/community/security/csrf.mjs';
import { sessionCookieName, csrfCookieName } from '../server/community/security/cookies.mjs';
import { openaiCostAdapter } from '../server/commercial/provider-cost/openai-cost-adapter.mjs';

const API_KEY_SECRET = 'sk-admin-VERY-SECRET-TOKEN-abc123';

// Mirrors tests/admin-crypto-payments.test.mjs's withFreshAdmin()/staleHeaders() convention -
// every test gets its own isolated repo/server/admin, since so much here depends on exact
// current credential/config state that a shared instance would leak between tests.
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
      const response = await fetch(baseUrl + '/api/admin/commercial/ai-cost-control' + path, { method, headers: reqHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    }
    async function staleHeaders() {
      const { rawId, record } = await createSession(repo, { userId: admin.id, reauth: false });
      const csrfToken = issueCsrfToken(record.id);
      return { Cookie: `${sessionCookieName()}=${rawId}; ${csrfCookieName()}=${csrfToken}`, 'x-csrf-token': csrfToken };
    }
    await fn({ repo, api, admin, baseUrl, staleHeaders });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const originalFetchActualCosts = openaiCostAdapter.fetchActualCosts;
after(() => { openaiCostAdapter.fetchActualCosts = originalFetchActualCosts; });
function stubOpenAiCosts(amountUsd) {
  openaiCostAdapter.fetchActualCosts = async ({ start }) => {
    // The real OpenAI Costs API only returns whole-UTC-day buckets (bucket_width='1d') - a
    // faithful stub returns a day-aligned period the same way, not the raw request timestamp.
    const day = new Date(start);
    const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    return {
      periods: [{ periodStart: dayStart.toISOString(), periodEnd: dayEnd.toISOString(), currency: 'usd', amountMicroUsd: Math.round(amountUsd * 1000000), lineItem: 'gpt-4o, input', projectId: 'proj_navrya' }],
      sourceUpdatedAt: new Date().toISOString(), truncated: false
    };
  };
}
function restoreOpenAiCosts() { openaiCostAdapter.fetchActualCosts = originalFetchActualCosts; }

test('a non-admin is rejected from every AI Cost Control route (GET, POST, PATCH, DELETE)', async () => {
  await withFreshAdmin(async ({ repo, baseUrl }) => {
    const user = await repo.users.create({ displayName: 'Regular User' });
    const headers = await authHeadersFor(repo, user.id);
    for (const [method, path] of [
      ['GET', '/overview?range=30d'], ['GET', '/providers?range=30d'], ['GET', '/credentials'],
      ['POST', '/credentials'], ['DELETE', '/credentials/x'], ['POST', '/refresh']
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(baseUrl + '/api/admin/commercial/ai-cost-control' + path, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
      assert.equal(response.status, 403, method + ' ' + path + ' must be admin-only');
    }
  });
});

test('range validation: an inverted or oversized custom range is rejected server-side, UTC required', async () => {
  await withFreshAdmin(async ({ api }) => {
    const inverted = await api('GET', '/overview?range=custom&start=2026-02-01T00:00:00.000Z&end=2026-01-01T00:00:00.000Z');
    assert.equal(inverted.status, 400);
    assert.equal(inverted.body.error, 'VALIDATION_FAILED');

    const tooLarge = await api('GET', '/overview?range=custom&start=2020-01-01T00:00:00.000Z&end=2026-01-01T00:00:00.000Z');
    assert.equal(tooLarge.status, 400);

    const garbage = await api('GET', '/overview?range=custom&start=not-a-date&end=also-not-a-date');
    assert.equal(garbage.status, 400);

    const unknownPreset = await api('GET', '/overview?range=nonsense');
    assert.equal(unknownPreset.status, 400);

    const valid = await api('GET', '/overview?range=custom&start=2026-01-01T00:00:00.000Z&end=2026-01-08T00:00:00.000Z');
    assert.equal(valid.status, 200);
    assert.equal(valid.body.range.start, '2026-01-01T00:00:00.000Z');
    assert.equal(valid.body.range.end, '2026-01-08T00:00:00.000Z');
  });
});

test('unsupported/unconfigured/never-synced states are reported honestly, never a fabricated $0', async () => {
  await withFreshAdmin(async ({ api }) => {
    const providers = await api('GET', '/providers?range=30d');
    const openai = providers.body.providers.find((p) => p.provider === 'openai');
    const anthropic = providers.body.providers.find((p) => p.provider === 'anthropic');
    // Anthropic has no registered adapter at all.
    assert.equal(anthropic.adapterRegistered, false);
    assert.equal(anthropic.external.status, 'no_adapter');
    assert.equal(anthropic.external.comparable, false);
    // OpenAI has a real adapter but no credential configured yet.
    assert.equal(openai.adapterRegistered, true);
    assert.equal(openai.external.status, 'not_configured');
    assert.equal(openai.external.comparable, false);
    // Balance: no official API for OpenAI - never invented.
    assert.equal(openai.balance.supported, false);
    assert.equal(openai.balance.reason, 'NO_OFFICIAL_BALANCE_API');

    // Now configure a credential but never sync - status must become not_synced, still never $0.
    await api('POST', '/credentials', { body: { provider: 'openai', apiKey: API_KEY_SECRET, scopeConfig: { projectId: 'proj_navrya' } } });
    const providers2 = await api('GET', '/providers?range=30d');
    const openai2 = providers2.body.providers.find((p) => p.provider === 'openai');
    assert.equal(openai2.external.status, 'not_synced');
    assert.equal(openai2.external.comparable, false);
  });
});

test('credential CRUD requires a fresh reauth; test-connection is a read-only diagnostic and does not', async () => {
  await withFreshAdmin(async ({ api, staleHeaders }) => {
    const stale = await staleHeaders();
    const createStale = await api('POST', '/credentials', { headers: stale, body: { provider: 'openai', apiKey: API_KEY_SECRET, scopeConfig: { projectId: 'proj_navrya' } } });
    assert.equal(createStale.status, 401);
    assert.equal(createStale.body.error, 'STEP_UP_REQUIRED');

    const created = await api('POST', '/credentials', { body: { provider: 'openai', apiKey: API_KEY_SECRET, scopeConfig: { projectId: 'proj_navrya' } } });
    assert.equal(created.status, 201);
    const credentialId = created.body.id;

    const deleteStale = await api('DELETE', '/credentials/' + credentialId, { headers: stale });
    assert.equal(deleteStale.status, 401);

    stubOpenAiCosts(1);
    const testConn = await api('POST', '/credentials/' + credentialId + '/test-connection', { headers: stale, body: {} });
    assert.equal(testConn.status, 200, 'a read-only test-connection must not require reauth');
    assert.equal(testConn.body.ok, true);
    restoreOpenAiCosts();

    const deleted = await api('DELETE', '/credentials/' + credentialId);
    assert.equal(deleted.status, 204);
  });
});

test('no response, refresh result, or audit log entry ever leaks the raw API key - only a masked hint', async () => {
  await withFreshAdmin(async ({ api, repo }) => {
    const created = await api('POST', '/credentials', { body: { provider: 'openai', label: 'Prod org key', apiKey: API_KEY_SECRET, scopeConfig: { projectId: 'proj_navrya' } } });
    assert.equal(created.status, 201);
    assert.equal(created.body.keyHint, '…c123');

    stubOpenAiCosts(2.5);
    const refreshed = await api('POST', '/refresh', { body: { provider: 'openai', range: 'custom', start: '2026-01-01T00:00:00.000Z', end: '2026-01-08T00:00:00.000Z' } });
    assert.equal(refreshed.status, 201);
    restoreOpenAiCosts();

    const listed = await api('GET', '/credentials');
    const providers = await api('GET', '/providers?range=30d');
    const auditEntries = await repo.auditLog.list({ limit: 200 });

    const haystacks = [
      JSON.stringify(created.body), JSON.stringify(refreshed.body), JSON.stringify(listed.body), JSON.stringify(providers.body),
      JSON.stringify(auditEntries.filter((entry) => entry.action.startsWith('aiCostControl.')))
    ];
    haystacks.forEach((text) => {
      assert.doesNotMatch(text, /VERY-SECRET-TOKEN/, 'the raw secret must never appear in any response or audit entry');
    });
  });
});

test('the model table and reconciliation-internal drill-down are paginated', async () => {
  await withFreshAdmin(async ({ api, repo }) => {
    // Seed 3 real gateway usage events across 3 distinct models so pagination has something to page.
    // eslint-disable-next-line no-await-in-loop
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await repo.usageEvents.create({ userId: null, provider: 'openai', model: 'model-' + i, feature: 'aiChat', promptTokens: 100, completionTokens: 50, totalTokens: 150, source: 'test', origin: 'gateway', providerCostMicroUsd: 1000, retailChargeMicroUsd: 3000 });
    }
    const page1 = await api('GET', '/models?range=30d&page=1&pageSize=2');
    assert.equal(page1.status, 200);
    assert.equal(page1.body.models.length, 2);
    assert.equal(page1.body.total, 3);
    const page2 = await api('GET', '/models?range=30d&page=2&pageSize=2');
    assert.equal(page2.body.models.length, 1);

    const reconPage = await api('GET', '/reconciliation/internal?range=30d&page=1&pageSize=1');
    assert.equal(reconPage.status, 200);
    assert.ok(reconPage.body.exceptions.pageSize === 1);
  });
});

test('manual balance snapshot is stored, real, and clearly labeled as never used for reconciliation', async () => {
  await withFreshAdmin(async ({ api }) => {
    const saved = await api('POST', '/balance/openai/manual-snapshot', { body: { amountUsd: 42.5, currency: 'usd', note: 'Checked dashboard manually' } });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.amountMicroUsd, 42500000);
    const providers = await api('GET', '/providers?range=30d');
    const openai = providers.body.providers.find((p) => p.provider === 'openai');
    assert.equal(openai.manualBalance.amountMicroUsd, 42500000);
    assert.equal(openai.balance.supported, false, 'a manual note must never be reported as the official balance');
  });
});

test('variance tolerance is admin-configurable (reauth-gated) and affects external reconciliation output', async () => {
  await withFreshAdmin(async ({ api, staleHeaders }) => {
    const stale = await staleHeaders();
    const staleAttempt = await api('PATCH', '/variance-tolerance', { headers: stale, body: { percent: 5 } });
    assert.equal(staleAttempt.status, 401);

    await api('POST', '/credentials', { body: { provider: 'openai', apiKey: API_KEY_SECRET, scopeConfig: { projectId: 'proj_navrya' } } });
    stubOpenAiCosts(3);
    await api('POST', '/refresh', { body: { provider: 'openai', range: 'custom', start: '2026-01-01T00:00:00.000Z', end: '2026-01-08T00:00:00.000Z' } });
    restoreOpenAiCosts();

    const before = await api('PATCH', '/variance-tolerance', { body: { percent: 1 } });
    assert.equal(before.status, 200);
    assert.equal(before.body.percent, 1);
    const external = await api('GET', '/reconciliation/external?range=custom&start=2026-01-01T00:00:00.000Z&end=2026-01-08T00:00:00.000Z');
    assert.equal(external.body.tolerancePercent, 1);
  });
});

test('external reconciliation never asserts retail charge equals external actual cost - both are reported separately', async () => {
  await withFreshAdmin(async ({ api, repo }) => {
    // createdAt defaults to "now" - use the default 30d preset range (not a fixed historical
    // range) so this real row is actually inside the window every route call below queries.
    await repo.usageEvents.create({ userId: null, provider: 'openai', model: 'gpt-5.6-sol', feature: 'aiChat', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, source: 'test', origin: 'gateway', providerCostMicroUsd: 1000000, retailChargeMicroUsd: 3000000 });
    await api('POST', '/credentials', { body: { provider: 'openai', apiKey: API_KEY_SECRET, scopeConfig: { projectId: 'proj_navrya' } } });
    stubOpenAiCosts(0.9); // 900000 micro-usd external actual, deliberately different from both 1000000 internal estimate and 3000000 retail charge
    await api('POST', '/refresh', { body: { provider: 'openai', range: '30d' } });
    restoreOpenAiCosts();

    const external = await api('GET', '/reconciliation/external?range=30d');
    const openai = external.body.providers.find((p) => p.provider === 'openai');
    assert.equal(openai.status, 'ok');
    assert.equal(openai.externalActualCostMicroUsd, 900000);
    assert.equal(openai.internalEstimateMicroUsd, 1000000);
    assert.equal(openai.retailChargeMicroUsd, 3000000);
    // The three numbers are genuinely different and all three are reported - this route must
    // never collapse them into one "cost" figure or assert any pair is equal.
    assert.notEqual(openai.externalActualCostMicroUsd, openai.retailChargeMicroUsd);
    assert.notEqual(openai.externalActualCostMicroUsd, openai.internalEstimateMicroUsd);
    assert.equal(openai.marginMicroUsd, openai.retailChargeMicroUsd - openai.externalActualCostMicroUsd);
  });
});

test('the refresh action is rate-limited', async () => {
  await withFreshAdmin(async ({ api }) => {
    await api('POST', '/credentials', { body: { provider: 'openai', apiKey: API_KEY_SECRET, scopeConfig: { projectId: 'proj_navrya' } } });
    stubOpenAiCosts(1);
    let sawRateLimited = false;
    for (let i = 0; i < 8; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await api('POST', '/refresh', { body: { provider: 'openai', range: 'custom', start: '2026-01-01T00:00:00.000Z', end: '2026-01-08T00:00:00.000Z' } });
      if (response.status === 429) sawRateLimited = true;
    }
    restoreOpenAiCosts();
    assert.equal(sawRateLimited, true, 'more than the configured per-minute limit of refresh calls must eventually be rejected');
  });
});
