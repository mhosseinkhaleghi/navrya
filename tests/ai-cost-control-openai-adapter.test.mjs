import assert from 'node:assert/strict';
import test from 'node:test';
import { openaiCostAdapter } from '../server/commercial/provider-cost/openai-cost-adapter.mjs';
import { ProviderCostAdapterError } from '../server/commercial/provider-cost/registry.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { refreshProviderCosts, latestExternalCostForRange } from '../server/commercial/provider-cost/cost-sync-service.mjs';
import { registerAdapter, listAdapters } from '../server/commercial/provider-cost/registry.mjs';

// Mocked shape verified against OpenAI's own official API reference/cookbook example
// (developers.openai.com) before this adapter was written: GET /v1/organization/costs returns
// {object:'page', data:[{object:'bucket', start_time, end_time, results:[{object:'organization.
// costs.result', amount:{value,currency}, line_item, project_id}]}], has_more, next_page}.
function mockBucket(startSec, endSec, results) {
  return { object: 'bucket', start_time: startSec, end_time: endSec, results };
}
function mockCostsPage(data, { hasMore = false, nextPage = null } = {}) {
  return { object: 'page', data, has_more: hasMore, next_page: nextPage };
}

test('fetchActualCosts sends the configured UTC start/end and requires an admin key + project scope', async () => {
  let capturedUrl;
  let capturedHeaders;
  const fetchImpl = (url, options) => {
    capturedUrl = new URL(url);
    capturedHeaders = options.headers;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockCostsPage([
        mockBucket(1735689600, 1735776000, [{ object: 'organization.costs.result', amount: { value: 1.23, currency: 'usd' }, line_item: 'gpt-4o, input', project_id: 'proj_navrya' }])
      ]))
    });
  };
  const start = '2025-01-01T00:00:00.000Z';
  const end = '2025-01-02T00:00:00.000Z';
  const result = await openaiCostAdapter.fetchActualCosts({ apiKey: 'sk-admin-test', scopeConfig: { projectId: 'proj_navrya' }, start, end, fetchImpl });

  assert.equal(capturedHeaders.Authorization, 'Bearer sk-admin-test');
  assert.equal(capturedUrl.searchParams.get('start_time'), String(Math.floor(new Date(start).getTime() / 1000)));
  assert.equal(capturedUrl.searchParams.get('end_time'), String(Math.floor(new Date(end).getTime() / 1000)));
  assert.equal(capturedUrl.searchParams.get('bucket_width'), '1d');
  assert.equal(capturedUrl.searchParams.get('group_by'), 'project_id');

  assert.equal(result.periods.length, 1);
  assert.equal(result.periods[0].amountMicroUsd, 1230000);
  assert.equal(result.periods[0].currency, 'usd');
  assert.equal(result.periods[0].lineItem, 'gpt-4o, input');
  assert.equal(result.periods[0].projectId, 'proj_navrya');
});

test('missing admin key or missing project scope fails closed without ever calling the network', async () => {
  let called = false;
  const fetchImpl = () => { called = true; return Promise.reject(new Error('should not be called')); };
  await assert.rejects(
    () => openaiCostAdapter.fetchActualCosts({ apiKey: '', scopeConfig: { projectId: 'proj_navrya' }, start: '2025-01-01T00:00:00.000Z', end: '2025-01-02T00:00:00.000Z', fetchImpl }),
    (error) => error instanceof ProviderCostAdapterError && error.code === 'OPENAI_CREDENTIAL_NOT_CONFIGURED'
  );
  await assert.rejects(
    () => openaiCostAdapter.fetchActualCosts({ apiKey: 'sk-admin-test', scopeConfig: {}, start: '2025-01-01T00:00:00.000Z', end: '2025-01-02T00:00:00.000Z', fetchImpl }),
    (error) => error instanceof ProviderCostAdapterError && error.code === 'OPENAI_PROJECT_SCOPE_NOT_CONFIGURED'
  );
  assert.equal(called, false);
});

test('client-side project scoping discards every other project\'s rows, never counting unrelated organization spend', async () => {
  const fetchImpl = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(mockCostsPage([
      mockBucket(1735689600, 1735776000, [
        { object: 'organization.costs.result', amount: { value: 5, currency: 'usd' }, line_item: 'gpt-4o, input', project_id: 'proj_navrya' },
        { object: 'organization.costs.result', amount: { value: 99, currency: 'usd' }, line_item: 'gpt-4o, input', project_id: 'proj_unrelated' },
        { object: 'organization.costs.result', amount: { value: 3, currency: 'usd' }, line_item: null, project_id: null }
      ])
    ]))
  });
  const result = await openaiCostAdapter.fetchActualCosts({ apiKey: 'sk-admin-test', scopeConfig: { projectId: 'proj_navrya' }, start: '2025-01-01T00:00:00.000Z', end: '2025-01-02T00:00:00.000Z', fetchImpl });
  assert.equal(result.periods.length, 1);
  assert.equal(result.periods[0].amountMicroUsd, 5000000);
});

test('pagination follows next_page across multiple buckets/pages and aggregates every matching result', async () => {
  let calls = 0;
  const fetchImpl = (url) => {
    calls += 1;
    const u = new URL(url);
    if (!u.searchParams.get('page')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockCostsPage([
          mockBucket(1735689600, 1735776000, [{ object: 'organization.costs.result', amount: { value: 1, currency: 'usd' }, line_item: 'a', project_id: 'proj_navrya' }])
        ], { hasMore: true, nextPage: 'cursor-2' }))
      });
    }
    assert.equal(u.searchParams.get('page'), 'cursor-2');
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockCostsPage([
        mockBucket(1735776000, 1735862400, [{ object: 'organization.costs.result', amount: { value: 2, currency: 'usd' }, line_item: 'b', project_id: 'proj_navrya' }])
      ], { hasMore: false, nextPage: null }))
    });
  };
  const result = await openaiCostAdapter.fetchActualCosts({ apiKey: 'sk-admin-test', scopeConfig: { projectId: 'proj_navrya' }, start: '2025-01-01T00:00:00.000Z', end: '2025-01-03T00:00:00.000Z', fetchImpl });
  assert.equal(calls, 2);
  assert.equal(result.periods.length, 2);
  assert.equal(result.periods[0].amountMicroUsd + result.periods[1].amountMicroUsd, 3000000);
  assert.equal(result.truncated, false);
});

test('an unauthorized/forbidden upstream response maps to a real error code, never a fabricated cost', async () => {
  const fetchImpl = () => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: { message: 'Invalid Authorization' } }) });
  await assert.rejects(
    () => openaiCostAdapter.fetchActualCosts({ apiKey: 'sk-bad', scopeConfig: { projectId: 'proj_navrya' }, start: '2025-01-01T00:00:00.000Z', end: '2025-01-02T00:00:00.000Z', fetchImpl }),
    (error) => error instanceof ProviderCostAdapterError && error.code === 'OPENAI_COSTS_UNAUTHORIZED'
  );
});

test('fetchBalance always reports unsupported - no official OpenAI balance API exists', async () => {
  const result = await openaiCostAdapter.fetchBalance();
  assert.equal(result.supported, false);
  assert.equal(result.reason, 'NO_OFFICIAL_BALANCE_API');
});

test('the registry reports openai as adapterRegistered/supportsActualCosts, and Anthropic/Kimi/DeepSeek honestly as no adapter (never invented data)', async () => {
  registerAdapter(openaiCostAdapter);
  const catalog = listAdapters();
  const openai = catalog.find((p) => p.id === 'openai');
  assert.equal(openai.adapterRegistered, true);
  assert.equal(openai.supportsActualCosts, true);
  assert.equal(openai.supportsBalance, false);
  ['anthropic', 'kimi', 'deepseek'].forEach((id) => {
    const entry = catalog.find((p) => p.id === id);
    assert.equal(entry.adapterRegistered, false);
    assert.equal(entry.supportsActualCosts, false);
  });
});

test('refreshProviderCosts stores a deterministic snapshot per sync run, and latestExternalCostForRange picks the latest successful run covering the requested range', async () => {
  registerAdapter(openaiCostAdapter);
  const repo = createMemoryRepo();
  const fetchImpl = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(mockCostsPage([
      mockBucket(1735689600, 1735776000, [{ object: 'organization.costs.result', amount: { value: 4.5, currency: 'usd' }, line_item: 'gpt-4o, input', project_id: 'proj_navrya' }])
    ]))
  });
  const originalFetch = openaiCostAdapter.fetchActualCosts;
  openaiCostAdapter.fetchActualCosts = (args) => originalFetch({ ...args, fetchImpl });
  try {
    const start = '2025-01-01T00:00:00.000Z';
    const end = '2025-01-02T00:00:00.000Z';
    const result = await refreshProviderCosts(repo, { provider: 'openai', credentialId: 'cred-1', apiKey: 'sk-admin-test', scopeConfig: { projectId: 'proj_navrya' }, start, end, triggeredBy: 'admin-1' });
    assert.equal(result.ok, true);
    assert.equal(result.run.status, 'success');
    assert.equal(result.periodCount, 1);

    const read = await latestExternalCostForRange(repo, { provider: 'openai', scopeKey: 'proj_navrya', start, end });
    assert.equal(read.status, 'ok');
    assert.equal(read.amountMicroUsd, 4500000);

    // A range NOT covered by the run's own requested window must never silently reuse this
    // snapshot - that would be exactly the double-counting/overlap bug 043_ai_cost_control.sql's
    // own comment warns against.
    const outsideRange = await latestExternalCostForRange(repo, { provider: 'openai', scopeKey: 'proj_navrya', start: '2025-02-01T00:00:00.000Z', end: '2025-02-02T00:00:00.000Z' });
    assert.equal(outsideRange.status, 'not_synced');
  } finally {
    openaiCostAdapter.fetchActualCosts = originalFetch;
  }
});

test('a failed refresh records the sync run as error with a real error code, never a fabricated success', async () => {
  const repo = createMemoryRepo();
  const originalFetch = openaiCostAdapter.fetchActualCosts;
  openaiCostAdapter.fetchActualCosts = () => Promise.reject(new ProviderCostAdapterError('OPENAI_COSTS_FORBIDDEN', 'forbidden'));
  try {
    const result = await refreshProviderCosts(repo, { provider: 'openai', credentialId: 'cred-1', apiKey: 'sk-admin-test', scopeConfig: { projectId: 'proj_navrya' }, start: '2025-01-01T00:00:00.000Z', end: '2025-01-02T00:00:00.000Z', triggeredBy: 'admin-1' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'OPENAI_COSTS_FORBIDDEN');
    const runs = await repo.providerCostSync.recentRuns({ provider: 'openai' });
    assert.equal(runs[0].status, 'error');
    assert.equal(runs[0].errorCode, 'OPENAI_COSTS_FORBIDDEN');
  } finally {
    openaiCostAdapter.fetchActualCosts = originalFetch;
  }
});
