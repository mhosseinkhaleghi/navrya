import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import sharp from 'sharp';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { terminateOcrWorker } from '../server/community/media-chart-ocr.mjs';

// NAVRYA Media Drive - server-canonical domain contract (server/community/routes.media.mjs,
// server/db/repo.memory.mjs's mediaAssets/mediaAssetLinks). Covers: user-scoped Recent/My Drive
// listing and ordering, ownership enforcement, quota accounting (no second charge on reuse), safe
// deletion with linked assets, the explicit guarded retry-analysis endpoint, and session-derived
// (never client-supplied) active market session. Chart-metadata detection itself is fully local
// OCR now (server/community/media-chart-ocr.mjs, 2026-09-15 - replaced the earlier AI-vision
// call/internal persist bridge) and runs synchronously inside these same routes - its own
// symbol/timeframe accuracy against real chart images is covered separately, with real synthetic
// chart fixtures, in tests/media-chart-ocr.test.mjs. The tiny 1x1 PNG_DATA_URL fixture used
// throughout this file has no readable legend at all, so every chart asset created here honestly
// resolves to metadataStatus 'ready' with a null symbol/timeframe - that null-safety, not
// detection accuracy, is what this file is testing.

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
  await terminateOcrWorker();
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

test('uploading a chart runs local OCR synchronously and returns a final status directly (never left stuck "processing"); an ordinary image is not_applicable and never analyzed at all', async () => {
  const user = await createUser('Uploader1');
  const chart = await api('POST', '/api/sync/media/assets', { userId: user.id, body: { dataUrl: PNG_DATA_URL, filename: 'chart.png', mimeType: 'image/png', kind: 'chart', source: 'capture' } });
  assert.equal(chart.status, 201);
  assert.equal(chart.body.kind, 'chart');
  // The fixture PNG has no readable legend, so this is an honest "nothing recognized" result -
  // 'ready' (not 'processing'/'failed') is exactly the point: local OCR completes inside this
  // same request, so the response already carries the real, final outcome.
  assert.equal(chart.body.metadataStatus, 'ready');
  assert.equal(chart.body.symbol, null);
  assert.equal(chart.body.analysisProvider, 'local-ocr');

  const image = await api('POST', '/api/sync/media/assets', { userId: user.id, body: { dataUrl: PNG_DATA_URL, filename: 'photo.png', mimeType: 'image/png', kind: 'image', source: 'upload' } });
  assert.equal(image.status, 201);
  assert.equal(image.body.kind, 'image');
  assert.equal(image.body.metadataStatus, 'not_applicable');
  assert.equal(image.body.analysisProvider, null, 'an ordinary image is never run through OCR at all');
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

test('retry-analysis: refused while genuinely in flight, refused for a non-chart asset, and re-runs local OCR end to end once terminal - returning the real final result directly, no separate follow-up call needed', async () => {
  const user = await createUser('Retrier1');
  const image = await api('POST', '/api/sync/media/assets', { userId: user.id, body: { dataUrl: PNG_DATA_URL, kind: 'image', source: 'upload' } });
  const notChart = await api('POST', `/api/sync/media/assets/${image.body.id}/retry-analysis`, { userId: user.id });
  assert.equal(notChart.status, 400);
  assert.equal(notChart.body.error, 'NOT_A_CHART_ASSET');

  const chart = await api('POST', '/api/sync/media/assets', { userId: user.id, body: { dataUrl: PNG_DATA_URL, kind: 'chart', source: 'capture' } });
  // Local OCR already completed synchronously inside the create call above (see the earlier
  // test), so this simulates the one real way a chart asset can still be mid-extraction when a
  // retry is attempted: a concurrent/overlapping request. repo.mediaAssets.markProcessing() is
  // the same guarded transition the route itself uses.
  await repo.mediaAssets.markProcessing(chart.body.id);
  const whileProcessing = await api('POST', `/api/sync/media/assets/${chart.body.id}/retry-analysis`, { userId: user.id });
  assert.equal(whileProcessing.status, 409);
  assert.equal(whileProcessing.body.error, 'ANALYSIS_ALREADY_IN_PROGRESS');

  // Back to a real terminal state (the concurrent job the simulated 'processing' above stood in
  // for has now genuinely finished) before proving retry is allowed once terminal.
  await repo.mediaAssets.updateAnalysis(chart.body.id, { status: 'failed', errorCode: 'EXTRACTION_FAILED' });
  const retried = await api('POST', `/api/sync/media/assets/${chart.body.id}/retry-analysis`, { userId: user.id });
  assert.equal(retried.status, 200);
  // Re-reads the real stored file off disk and re-runs OCR synchronously - a terminal status
  // comes back directly, never left at 'processing' for the client to poll.
  assert.equal(retried.body.metadataStatus, 'ready');
  assert.equal(retried.body.analysisProvider, 'local-ocr');
});

test('the retired AI-gateway internal analysis bridge no longer exists - detection is fully local now, with no server-to-server hop for it at all', async () => {
  // No handler in the /internal router matches this path any more, so Express falls through to
  // the app's next mounted middleware - requireAuth() - which rejects the unauthenticated request
  // before any route-matching for it could even happen. That fallthrough (never a real response
  // from a still-live handler) is exactly what proves this internal route is genuinely gone.
  const response = await fetch(`${baseUrl}/internal/media/assets/some-id/analysis`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ready' })
  });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error, 'AUTH_SESSION_REQUIRED');
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

test('end to end through the real HTTP endpoint: a real synthetic chart image is stored, OCR\'d, and normalized in one request - the exact real-world path, not just the OCR module in isolation', async () => {
  const user = await createUser('EndToEnd1');
  const width = 1200, height = 700;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect width="100%" height="100%" fill="#0b0e11"/><rect x="0" y="0" width="100%" height="40" fill="#131722"/>`
    + `<text x="20" y="26" font-family="Arial" font-size="16" fill="#d1d4dc">1m  5m  15m  1h  4h  1D</text>`
    + `<text x="14" y="70" font-family="Arial" font-size="22" font-weight="bold" fill="#d1d4dc">BINANCE:BTCUSDT, 15</text>`
    + `</svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const chartDataUrl = 'data:image/png;base64,' + buffer.toString('base64');

  const chart = await api('POST', '/api/sync/media/assets', { userId: user.id, body: { dataUrl: chartDataUrl, kind: 'chart', source: 'capture' } });
  assert.equal(chart.status, 201);
  assert.equal(chart.body.metadataStatus, 'ready');
  assert.equal(chart.body.symbol, 'BTCUSDT');
  assert.equal(chart.body.timeframe, '15m');
  assert.equal(chart.body.isTradingChart, true);
  assert.ok(chart.body.confidence > 0.5);
  assert.equal(chart.body.analysisProvider, 'local-ocr');

  const read = await api('GET', `/api/sync/media/assets/${chart.body.id}`, { userId: user.id });
  assert.equal(read.body.symbol, 'BTCUSDT', 'the real, persisted row must carry the same result, not just the create response');
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
