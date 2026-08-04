import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

let server, baseUrl, uploadsDir;

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-'));
  server = createApp({ repo: createMemoryRepo(), uploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(uploadsDir, { recursive: true, force: true });
});

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) headers['x-dev-user-id'] = userId;
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}
async function createUser(name) {
  const { body } = await api('POST', '/api/users', { body: { displayName: name } });
  return body;
}

function sampleStrategy(id) {
  return {
    id, name: 'Breakout Strategy', active: true, isPublic: false, origin: 'manual',
    positionManagement: {
      entryRules: 'Enter on breakout retest', stopLossRules: 'Below structure', exitTargetRules: '2R minimum',
      positionSizingRules: '1% risk', freeNotes: 'notes here',
      attachments: [{ id: id + '-att-1', fileName: 'plan.png', blobId: 'blob-1', mimeType: 'image/png', size: 1024, note: 'entry diagram', uploadedAt: '2026-01-01T00:00:00.000Z' }]
    },
    riskManagement: {
      maxRiskPerTradePercent: 1, dailyDrawdownLimitPercent: 3, totalDrawdownLimitPercent: 10,
      maxConcurrentTrades: 2, maxProfitCapPerTrade: 5, freeNotes: 'risk notes',
      attachments: []
    },
    overallFramework: { description: 'Overall framework text', attachments: [] },
    chatHistory: [{ id: id + '-msg-1', role: 'user', content: 'question', createdAt: '2026-01-01T00:01:00.000Z', suggestions: [{ id: 'sug-1', path: 'positionManagement.entryRules', section: 'positionManagement', value: 'x', mode: 'append', status: 'pending', createdAt: '2026-01-01T00:01:00.000Z' }] }],
    aiUnderstandingSummary: { positionManagement: 'summary', riskManagement: 'summary', overallFramework: 'summary', updatedAt: '2026-01-01T00:02:00.000Z' },
    detectionEvents: [{ id: id + '-event-1', strategyId: id, detectedAt: '2026-01-01T00:03:00.000Z', source: { type: 'trade', tradeId: 'trade-1' }, predictedOutcome: 'win', status: 'pending', resolvedAt: null, note: '' }]
  };
}

test('a request with no x-dev-user-id is rejected with DEV_USER_ID_REQUIRED', async () => {
  const result = await api('GET', '/api/sync/strategies');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'DEV_USER_ID_REQUIRED');
});

test('POST upserts a full strategy (three sections + attachments + chat + detection events) and GET reassembles it identically', async () => {
  const user = await createUser('Hunter One');
  const created = await api('POST', '/api/sync/strategies', { userId: user.id, body: sampleStrategy('strategy-a') });
  assert.equal(created.status, 200);
  assert.equal(created.body.positionManagement.entryRules, 'Enter on breakout retest');
  assert.equal(created.body.positionManagement.attachments.length, 1);
  assert.equal(created.body.riskManagement.maxRiskPerTradePercent, 1);
  assert.equal(created.body.chatHistory.length, 1);
  assert.deepEqual(created.body.chatHistory[0].suggestions[0].path, 'positionManagement.entryRules');
  assert.equal(created.body.detectionEvents.length, 1);
  assert.equal(created.body.detectionEvents[0].source.tradeId, 'trade-1');

  const fetched = await api('GET', '/api/sync/strategies/strategy-a', { userId: user.id });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.overallFramework.description, 'Overall framework text');

  const list = await api('GET', '/api/sync/strategies', { userId: user.id });
  assert.equal(list.body.strategies.length, 1);
});

test('re-POSTing the same strategy id is an idempotent upsert, not a duplicate, and fully replaces attachments/chat/detection events', async () => {
  const user = await createUser('Hunter Two');
  await api('POST', '/api/sync/strategies', { userId: user.id, body: sampleStrategy('strategy-b') });

  const changed = sampleStrategy('strategy-b');
  changed.riskManagement.maxRiskPerTradePercent = 2;
  changed.detectionEvents.push({ id: 'strategy-b-event-2', strategyId: 'strategy-b', detectedAt: '2026-01-02T00:00:00.000Z', source: { type: 'manual' }, predictedOutcome: 'loss', status: 'confirmed', resolvedAt: '2026-01-02T00:01:00.000Z', note: '' });
  const updated = await api('POST', '/api/sync/strategies', { userId: user.id, body: changed });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.riskManagement.maxRiskPerTradePercent, 2);
  assert.equal(updated.body.detectionEvents.length, 2);

  const list = await api('GET', '/api/sync/strategies', { userId: user.id });
  assert.equal(list.body.strategies.length, 1, 're-upserting the same id must never create a second strategy record');
});

test('a strategy belonging to another user cannot be fetched, upserted, or deleted', async () => {
  const owner = await createUser('Owner');
  const stranger = await createUser('Stranger');
  await api('POST', '/api/sync/strategies', { userId: owner.id, body: sampleStrategy('strategy-c') });

  const strangerFetch = await api('GET', '/api/sync/strategies/strategy-c', { userId: stranger.id });
  assert.equal(strangerFetch.status, 404);

  const strangerOverwrite = await api('POST', '/api/sync/strategies', { userId: stranger.id, body: sampleStrategy('strategy-c') });
  assert.equal(strangerOverwrite.status, 403);
  assert.equal(strangerOverwrite.body.error, 'NOT_STRATEGY_OWNER');

  const strangerDelete = await api('DELETE', '/api/sync/strategies/strategy-c', { userId: stranger.id });
  assert.equal(strangerDelete.status, 403);
});

test('DELETE removes the strategy and its child rows', async () => {
  const user = await createUser('Hunter Three');
  await api('POST', '/api/sync/strategies', { userId: user.id, body: sampleStrategy('strategy-d') });
  const deleted = await api('DELETE', '/api/sync/strategies/strategy-d', { userId: user.id });
  assert.equal(deleted.status, 204);
  const list = await api('GET', '/api/sync/strategies', { userId: user.id });
  assert.equal(list.body.strategies.length, 0);
});

test('POST /api/sync/strategies/images uploads a base64 image attachment under the strategy category', async () => {
  const user = await createUser('Hunter Four');
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const result = await api('POST', '/api/sync/strategies/images', { userId: user.id, body: { dataUrl: `data:image/png;base64,${tinyPng}` } });
  assert.equal(result.status, 201);
  assert.match(result.body.url, /^\/uploads\/strategy\/img-.+\.png$/);
});
