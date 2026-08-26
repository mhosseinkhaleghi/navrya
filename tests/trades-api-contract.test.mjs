import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

let server, baseUrl, uploadsDir, repo;

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-'));
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(uploadsDir, { recursive: true, force: true });
});

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}
async function createUser(name) {
  return repo.users.create({ displayName: name });
}
// Instrument Catalog domain: a brand-new trade now requires a real, cataloged instrument.
async function seedInstrument(userId, code = 'XAUUSD') {
  return repo.instrumentCatalog.upsert(userId, { id: 'instr-' + userId + '-' + code, code });
}

function sampleTrade(id) {
  return {
    id, status: 'closed', direction: 'long', entryMode: 'full', instrument: 'XAUUSD', entryPrice: 100, stopLoss: 95,
    takeProfits: [{ price: 110, portionPercent: 100 }], slDistancePercent: 5, riskPercent: 1, riskAmount: 100,
    leverage: 10, positionSize: 2000, marginRequired: 200, liquidationPrice: 90.5, rr: 2, marginMode: 'isolated',
    commission: { feeType: 'taker', feePercent: 0.06, totalCommission: 1.2 }, breakevenPercent: 0.12,
    exitPrice: 110, outcome: 'win', pnl: 197.6, pnlPercent: 98.8, session: 'london', primaryTimeframe: '5m',
    timeframeTrends: [{ timeframe: '5m', direction: 'bullish', momentumStrength: 3, source: 'user' }],
    conceptTags: ['Liquidity', 'FVG'], linkedPatternIds: ['pattern-1'], linkedStrategyId: 'strategy-1',
    chartNote: 'clean breakout', statusHistory: [{ status: 'hunting', timestamp: '2026-01-01T00:00:00.000Z' }, { status: 'open', timestamp: '2026-01-01T00:05:00.000Z' }, { status: 'closed', timestamp: '2026-01-01T01:00:00.000Z' }],
    source: { character: 'hunter', sessionId: 'session-1', scenarioId: 'scenario-1' },
    aiPredictionLinks: [{ id: id + '-pred-1', patternId: 'pattern-1', correct: true }],
    aiInitialAnalysis: { summary: 'looks good', observations: ['clean structure'], warnings: [] },
    disciplineImpact: 1,
    screenshots: [{ id: id + '-shot-1', fileName: 'entry.png', blobId: 'blob-1', mimeType: 'image/png', uploadedAt: '2026-01-01T00:01:00.000Z' }],
    emotionLog: [{ id: id + '-emotion-1', timestamp: '2026-01-01T00:02:00.000Z', stage: 'entry', dominantEmotions: ['calm'], emotionDetails: [{ emotion: 'calm', intensity: 4, tags: [] }], stressLevel: 3, focusQuality: 8, planCommitment: 9, wouldTakeIfNotForced: true, note: 'felt good' }],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T01:00:00.000Z', openedAt: '2026-01-01T00:05:00.000Z', closedAt: '2026-01-01T01:00:00.000Z'
  };
}

test('a request with no x-dev-user-id is rejected with AUTH_SESSION_REQUIRED', async () => {
  const result = await api('GET', '/api/sync/trades');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_SESSION_REQUIRED');
});

test('POST upserts a full trade (screenshots + emotion log + status history + ai prediction links) and GET reassembles it identically', async () => {
  const user = await createUser('Hunter One');
  await seedInstrument(user.id);
  const created = await api('POST', '/api/sync/trades', { userId: user.id, body: sampleTrade('trade-a') });
  assert.equal(created.status, 200);
  assert.equal(created.body.entryPrice, 100);
  assert.equal(created.body.outcome, 'win');
  assert.equal(created.body.screenshots.length, 1);
  assert.equal(created.body.emotionLog.length, 1);
  assert.equal(created.body.emotionLog[0].timestamp, '2026-01-01T00:02:00.000Z', 'the emotion-log entry uses the timestamp field name, not at');
  assert.equal(created.body.statusHistory.length, 3);
  assert.equal(created.body.statusHistory[2].timestamp, '2026-01-01T01:00:00.000Z', 'statusHistory entries use the timestamp field name, not at');
  assert.equal(created.body.aiPredictionLinks[0].correct, true, 'aiPredictionLinks entries use the correct field name, not matched');
  assert.equal(created.body.source.sessionId, 'session-1');
  assert.equal(created.body.source.scenarioId, 'scenario-1');

  const fetched = await api('GET', '/api/sync/trades/trade-a', { userId: user.id });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.linkedStrategyId, 'strategy-1');

  const list = await api('GET', '/api/sync/trades', { userId: user.id });
  assert.equal(list.body.trades.length, 1);
});

test('re-POSTing the same trade id is an idempotent upsert, not a duplicate, and fully replaces screenshots/emotion log', async () => {
  const user = await createUser('Hunter Two');
  await seedInstrument(user.id);
  await api('POST', '/api/sync/trades', { userId: user.id, body: sampleTrade('trade-b') });

  const changed = sampleTrade('trade-b');
  changed.pnl = 250;
  changed.emotionLog.push({ id: 'trade-b-emotion-2', timestamp: '2026-01-01T00:30:00.000Z', stage: 'exit', dominantEmotions: ['confident'], emotionDetails: [], stressLevel: 2, focusQuality: 9, planCommitment: 9, wouldTakeIfNotForced: true, note: '' });
  const updated = await api('POST', '/api/sync/trades', { userId: user.id, body: changed });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.pnl, 250);
  assert.equal(updated.body.emotionLog.length, 2);

  const list = await api('GET', '/api/sync/trades', { userId: user.id });
  assert.equal(list.body.trades.length, 1, 're-upserting the same id must never create a second trade record');
});

test('a trade belonging to another user cannot be fetched, upserted, or deleted', async () => {
  const owner = await createUser('Owner');
  const stranger = await createUser('Stranger');
  await seedInstrument(owner.id);
  await api('POST', '/api/sync/trades', { userId: owner.id, body: sampleTrade('trade-c') });

  const strangerFetch = await api('GET', '/api/sync/trades/trade-c', { userId: stranger.id });
  assert.equal(strangerFetch.status, 404);

  const strangerOverwrite = await api('POST', '/api/sync/trades', { userId: stranger.id, body: sampleTrade('trade-c') });
  assert.equal(strangerOverwrite.status, 403);
  assert.equal(strangerOverwrite.body.error, 'NOT_TRADE_OWNER');

  const strangerDelete = await api('DELETE', '/api/sync/trades/trade-c', { userId: stranger.id });
  assert.equal(strangerDelete.status, 403);
});

test('DELETE removes the trade and its child rows', async () => {
  const user = await createUser('Hunter Three');
  await seedInstrument(user.id);
  await api('POST', '/api/sync/trades', { userId: user.id, body: sampleTrade('trade-d') });
  const deleted = await api('DELETE', '/api/sync/trades/trade-d', { userId: user.id });
  assert.equal(deleted.status, 204);
  const list = await api('GET', '/api/sync/trades', { userId: user.id });
  assert.equal(list.body.trades.length, 0);
});

test('POST /api/sync/trades/images uploads a base64 image screenshot under the trade category', async () => {
  const user = await createUser('Hunter Four');
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const result = await api('POST', '/api/sync/trades/images', { userId: user.id, body: { dataUrl: `data:image/png;base64,${tinyPng}` } });
  assert.equal(result.status, 201);
  assert.match(result.body.url, /^\/uploads\/trade\/img-.+\.png$/);
});
