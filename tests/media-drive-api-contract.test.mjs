import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// NAVRYA Media Drive - server-canonical domain contract (server/community/routes.media.mjs,
// server/db/repo.memory.mjs's mediaAssets/mediaAssetLinks). Covers: user-scoped Recent/My Drive
// listing and ordering, ownership enforcement, quota accounting (no second charge on reuse), safe
// deletion with linked assets, the explicit guarded retry-analysis endpoint, and session-derived
// (never client-supplied) active market session. The AI extraction pipeline itself
// (server/pattern-ai-server.mjs's analyzeMediaChart + the internal persist bridge) is covered
// separately in tests/media-chart-analysis.test.mjs, which does not need a live Postgres/AI
// provider either (same memory-repo precedent as every other domain test in this suite).

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

let server, baseUrl, uploadsDir, repo;

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-media-uploads-'));
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(uploadsDir, { recursive: true, force: true });
});

async function api(method, urlPath, { body, userId, headers } = {}) {
  const reqHeaders = { 'Content-Type': 'application/json', ...(headers || {}) };
  if (userId) Object.assign(reqHeaders, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + urlPath, { method, headers: reqHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function createUser(name) { return repo.users.create({ displayName: name }); }

test('a request with no session is rejected with AUTH_SESSION_REQUIRED', async () => {
  const list = await api('GET', '/api/sync/media/assets');
  assert.equal(list.status, 401);
  assert.equal(list.body.error, 'AUTH_SESSION_REQUIRED');
});

test('uploading a chart starts extraction as processing; an ordinary image is not_applicable and never analyzed', async () => {
  const user = await createUser('Uploader1');
  const chart = await api('POST', '/api/sync/media/assets', { userId: user.id, body: { dataUrl: PNG_DATA_URL, filename: 'chart.png', mimeType: 'image/png', kind: 'chart', source: 'capture' } });
  assert.equal(chart.status, 201);
  assert.equal(chart.body.kind, 'chart');
  assert.equal(chart.body.metadataStatus, 'processing');
  assert.equal(chart.body.symbol, null);

  const image = await api('POST', '/api/sync/media/assets', { userId: user.id, body: { dataUrl: PNG_DATA_URL, filename: 'photo.png', mimeType: 'image/png', kind: 'image', source: 'upload' } });
  assert.equal(image.status, 201);
  assert.equal(image.body.kind, 'image');
  assert.equal(image.body.metadataStatus, 'not_applicable');
});

test('Recent lists newest first and scopes to the caller; My Drive supports a text search', async () => {
  const owner = await createUser('Owner1');
  const stranger = await createUser('Stranger1');
  const first = await api('POST', '/api/sync/media/assets', { userId: owner.id, body: { dataUrl: PNG_DATA_URL, filename: 'a.png', kind: 'image', source: 'upload' } });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await api('POST', '/api/sync/media/assets', { userId: owner.id, body: { dataUrl: PNG_DATA_URL, filename: 'b.png', kind: 'image', source: 'upload' } });
  await api('POST', '/api/sync/media/assets', { userId: stranger.id, body: { dataUrl: PNG_DATA_URL, filename: 'c.png', kind: 'image', source: 'upload' } });

  const recent = await api('GET', '/api/sync/media/assets?scope=recent', { userId: owner.id });
  assert.equal(recent.status, 200);
  assert.equal(recent.body.assets.length, 2, 'never includes another user\'s asset');
  assert.equal(recent.body.assets[0].id, second.body.id, 'newest first');
  assert.equal(recent.body.assets[1].id, first.body.id);

  const search = await api('GET', '/api/sync/media/assets?scope=mine&q=a.png', { userId: owner.id });
  assert.equal(search.status, 200);
  assert.equal(search.body.assets.length, 1);
  assert.equal(search.body.assets[0].id, first.body.id);
});

test('ownership is enforced on read/retry/link/delete - a stranger gets a safe 403/404', async () => {
  const owner = await createUser('Owner2');
  const stranger = await createUser('Stranger2');
  const asset = await api('POST', '/api/sync/media/assets', { userId: owner.id, body: { dataUrl: PNG_DATA_URL, kind: 'chart', source: 'capture' } });

  const read = await api('GET', `/api/sync/media/assets/${asset.body.id}`, { userId: stranger.id });
  assert.equal(read.status, 403);
  assert.equal(read.body.error, 'NOT_MEDIA_ASSET_OWNER');

  const retry = await api('POST', `/api/sync/media/assets/${asset.body.id}/retry-analysis`, { userId: stranger.id });
  assert.equal(retry.status, 403);

  const link = await api('POST', `/api/sync/media/assets/${asset.body.id}/links`, { userId: stranger.id, body: { domain: 'trade', recordId: 'trade-1' } });
  assert.equal(link.status, 403);

  const del = await api('DELETE', `/api/sync/media/assets/${asset.body.id}`, { userId: stranger.id });
  assert.equal(del.status, 403);

  const missing = await api('GET', '/api/sync/media/assets/does-not-exist', { userId: owner.id });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'MEDIA_ASSET_NOT_FOUND');
});

test('reusing an existing asset via /links never re-uploads bytes or charges storage quota again', async () => {
  const user = await createUser('Reuser1');
  const asset = await api('POST', '/api/sync/media/assets', { userId: user.id, body: { dataUrl: PNG_DATA_URL, kind: 'image', source: 'upload' } });
  const usageAfterUpload = await api('GET', '/api/sync/storage', { userId: user.id });
  assert.ok(usageAfterUpload.body.usedBytes > 0);

  const link1 = await api('POST', `/api/sync/media/assets/${asset.body.id}/links`, { userId: user.id, body: { domain: 'trade', recordId: 'trade-a' } });
  assert.equal(link1.status, 201);
  const link2 = await api('POST', `/api/sync/media/assets/${asset.body.id}/links`, { userId: user.id, body: { domain: 'pattern', recordId: 'pattern-a' } });
  assert.equal(link2.status, 201);

  const usageAfterLinks = await api('GET', '/api/sync/storage', { userId: user.id });
  assert.equal(usageAfterLinks.body.usedBytes, usageAfterUpload.body.usedBytes, 'linking an existing asset must never charge storage quota again');

  // Idempotent: linking the exact same (asset, domain, recordId) triple twice is a no-op, not a duplicate.
  const link1Again = await api('POST', `/api/sync/media/assets/${asset.body.id}/links`, { userId: user.id, body: { domain: 'trade', recordId: 'trade-a' } });
  assert.equal(link1Again.status, 201);
  assert.equal(link1Again.body.id, link1.body.id);
});

test('deletion is blocked while an asset is linked, and detach=true performs a safe transactional delete', async () => {
  const user = await createUser('Deleter1');
  const asset = await api('POST', '/api/sync/media/assets', { userId: user.id, body: { dataUrl: PNG_DATA_URL, kind: 'image', source: 'upload' } });
  await api('POST', `/api/sync/media/assets/${asset.body.id}/links`, { userId: user.id, body: { domain: 'trade', recordId: 'trade-x' } });

  const blocked = await api('DELETE', `/api/sync/media/assets/${asset.body.id}`, { userId: user.id });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error, 'MEDIA_ASSET_LINKED');
  assert.equal(blocked.body.linkCount, 1);

  const usedBefore = (await api('GET', '/api/sync/storage', { userId: user.id })).body.usedBytes;
  const detached = await api('DELETE', `/api/sync/media/assets/${asset.body.id}?detach=true`, { userId: user.id });
  assert.equal(detached.status, 204);

  const usedAfter = await api('GET', '/api/sync/storage', { userId: user.id });
  assert.ok(usedAfter.body.usedBytes < usedBefore, 'a real detach+delete must actually free the storage quota');

  const goneRead = await api('GET', `/api/sync/media/assets/${asset.body.id}`, { userId: user.id });
  assert.equal(goneRead.status, 404);
});

test('retry-analysis: refused while still processing, refused for a non-chart asset, allowed once terminal', async () => {
  const user = await createUser('Retrier1');
  const image = await api('POST', '/api/sync/media/assets', { userId: user.id, body: { dataUrl: PNG_DATA_URL, kind: 'image', source: 'upload' } });
  const notChart = await api('POST', `/api/sync/media/assets/${image.body.id}/retry-analysis`, { userId: user.id });
  assert.equal(notChart.status, 400);
  assert.equal(notChart.body.error, 'NOT_A_CHART_ASSET');

  const chart = await api('POST', '/api/sync/media/assets', { userId: user.id, body: { dataUrl: PNG_DATA_URL, kind: 'chart', source: 'capture' } });
  assert.equal(chart.body.metadataStatus, 'processing');
  const whileProcessing = await api('POST', `/api/sync/media/assets/${chart.body.id}/retry-analysis`, { userId: user.id });
  assert.equal(whileProcessing.status, 409);
  assert.equal(whileProcessing.body.error, 'ANALYSIS_ALREADY_IN_PROGRESS');

  // Simulate a terminal 'failed' extraction the way the AI gateway's internal bridge would.
  await repo.mediaAssets.updateAnalysis(chart.body.id, { status: 'failed', errorCode: 'EXTRACTION_FAILED' });
  const retried = await api('POST', `/api/sync/media/assets/${chart.body.id}/retry-analysis`, { userId: user.id });
  assert.equal(retried.status, 200);
  assert.equal(retried.body.metadataStatus, 'processing');
});

test('active market session is derived from a real, owned trading session - never trusted from the client, and silently ignored when foreign/invalid', async () => {
  const owner = await createUser('SessionOwner1');
  const stranger = await createUser('SessionStranger1');
  await repo.instrumentCatalog.upsert(owner.id, { id: 'instr-1', code: 'BTCUSDT' });
  await repo.tradingSessions.upsert(owner.id, { id: 'sess-1', instrument: 'BTCUSDT', timeframe: '5m', market: 'London', date: '2026-01-01', status: 'open', entries: [] });

  const withRealSession = await api('POST', '/api/sync/media/assets', { userId: owner.id, body: { dataUrl: PNG_DATA_URL, kind: 'chart', source: 'capture', sessionId: 'sess-1' } });
  assert.equal(withRealSession.body.activeMarketSession, 'London');
  assert.equal(withRealSession.body.sessionId, 'sess-1');

  // A foreign session id (owned by someone else) must never leak that user's session context, and
  // must never fail the otherwise-valid upload.
  const withForeignSession = await api('POST', '/api/sync/media/assets', { userId: stranger.id, body: { dataUrl: PNG_DATA_URL, kind: 'chart', source: 'capture', sessionId: 'sess-1' } });
  assert.equal(withForeignSession.status, 201);
  assert.equal(withForeignSession.body.activeMarketSession, null);
  assert.equal(withForeignSession.body.sessionId, null);
});

test('internal analysis bridge: normalizes symbol/timeframe with the real Instrument Catalog/TIMEFRAMES rules, never trusts a raw string, and guards against a stale/duplicate write', async () => {
  const user = await createUser('InternalBridge1');
  const chart = await api('POST', '/api/sync/media/assets', { userId: user.id, body: { dataUrl: PNG_DATA_URL, kind: 'chart', source: 'capture' } });
  assert.equal(chart.body.metadataStatus, 'processing');

  // An unrecognized symbol/timeframe must be stored as null/unknown, never as the raw text.
  const invalid = await fetch(`${baseUrl}/internal/media/assets/${chart.body.id}/analysis`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ready', isTradingChart: true, symbol: 'not a real symbol!!', timeframe: '17m', confidence: 0.8, provider: 'openai', model: 'gpt-5.6-luna' })
  });
  assert.equal(invalid.status, 200);
  const invalidBody = await invalid.json();
  assert.equal(invalidBody.ok, true);
  assert.equal(invalidBody.asset.symbol, null);
  assert.equal(invalidBody.asset.timeframe, null);

  const read = await api('GET', `/api/sync/media/assets/${chart.body.id}`, { userId: user.id });
  assert.equal(read.body.metadataStatus, 'ready');

  // Concurrency guard: the asset is no longer 'processing', so a second (stale/duplicate) result
  // must never silently overwrite the first one.
  const stale = await fetch(`${baseUrl}/internal/media/assets/${chart.body.id}/analysis`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ready', isTradingChart: true, symbol: 'ETHUSDT', timeframe: '1h', confidence: 0.9 })
  });
  assert.equal(stale.status, 200);
  const staleBody = await stale.json();
  assert.equal(staleBody.ok, false, 'a result for an asset that is no longer processing must be refused, never silently applied');

  const stillFirstResult = await api('GET', `/api/sync/media/assets/${chart.body.id}`, { userId: user.id });
  assert.equal(stillFirstResult.body.symbol, null, 'the stale write must not have overwritten anything');
});

test('private upload ownership: the raw /uploads/media/... file itself requires a real session AND the real owner - a stranger and an anonymous caller are both denied', async () => {
  const owner = await createUser('UploadOwner1');
  const stranger = await createUser('UploadStranger1');
  const asset = await api('POST', '/api/sync/media/assets', { userId: owner.id, body: { dataUrl: PNG_DATA_URL, kind: 'image', source: 'upload' } });
  assert.ok(asset.body.url.startsWith('/uploads/media/'), 'a Media Drive upload must be saved under the private "media" category');

  const anonymous = await fetch(baseUrl + asset.body.url);
  assert.equal(anonymous.status, 401);

  const strangerHeaders = await authHeadersFor(repo, stranger.id);
  const strangerRead = await fetch(baseUrl + asset.body.url, { headers: strangerHeaders });
  assert.equal(strangerRead.status, 404, 'ownership is denied uniformly as 404, never a 403 that would leak existence');

  const ownerHeaders = await authHeadersFor(repo, owner.id);
  const ownerRead = await fetch(baseUrl + asset.body.url, { headers: ownerHeaders });
  assert.equal(ownerRead.status, 200);
});

test('legacy compatibility: an asset created before this domain existed (a plain storage_objects upload) is unaffected - Media Drive is purely additive', async () => {
  const user = await createUser('LegacyUser1');
  // The pre-existing session-image endpoint (routes.trading-sessions.mjs) - unrelated to Media
  // Drive, still returns just { url }, never a Media Asset, and must keep working unchanged.
  const legacy = await api('POST', '/api/sync/sessions/images', { userId: user.id, body: { dataUrl: PNG_DATA_URL } });
  assert.equal(legacy.status, 201);
  assert.ok(legacy.body.url);
  assert.equal(legacy.body.id, undefined, 'the legacy endpoint\'s response shape is untouched by this feature');
});
