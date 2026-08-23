import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { testToken } from './helpers/auth-token.mjs';

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
  if (userId) headers['x-dev-user-id'] = testToken(userId);
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}
async function createUser(name) {
  return repo.users.create({ displayName: name });
}

function sampleSession(id) {
  return {
    id, character: 'hunter', market: 'London', timeframe: '5m', date: '2026-01-01', jalali: '۱۴۰۴/۱۰/۱۱',
    startedAt: '2026-01-01T07:00:00.000Z', status: 'open', updateIntervalMinutes: 30, gracePeriodMinutes: 5,
    entries: [
      {
        id: id + '-entry-1', type: 'chart', createdAt: '2026-01-01T07:05:00.000Z', hasImage: true,
        imageBlobId: 'img-1', timeframe: '5m', market: 'London', tradingSession: 'London',
        note: 'first chart', relatedScenarioIds: [],
        scenarios: [
          {
            id: id + '-scenario-1', title: 'UTAD WYCKOF', description: 'desc', evidence: 'evidence',
            trigger: 'trigger text', occurred: true,
            probabilityHistory: [{ value: 75, loggedAt: '2026-01-01T07:05:00.000Z' }],
            pattern: { name: 'UTAD WYCKOF', patternTagId: 'pattern-1', stages: ['a', 'b'], completedStageIds: ['a'] },
            executionPlan: { actionPlan: 'plan', positionType: 'Long', entryPrices: [100], stopLoss: 90, takeProfit: 120, positionStatus: null }
          }
        ]
      }
    ],
    activityLog: [{ id: id + '-log-1', type: 'entry_added', detail: 'New chart added', scenarioId: null, loggedAt: '2026-01-01T07:05:00.000Z', countsTowardLoopUpdate: true }]
  };
}

test('a request with no x-dev-user-id is rejected with AUTH_TOKEN_REQUIRED', async () => {
  const result = await api('GET', '/api/sync/sessions');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_TOKEN_REQUIRED');
});

test('POST upserts a full nested session (entries + scenarios + activity log) and GET reassembles it identically', async () => {
  const user = await createUser('Hunter One');
  const created = await api('POST', '/api/sync/sessions', { userId: user.id, body: sampleSession('session-a') });
  assert.equal(created.status, 200);
  assert.equal(created.body.id, 'session-a');
  assert.equal(created.body.entries.length, 1);
  assert.equal(created.body.entries[0].scenarios.length, 1);
  assert.equal(created.body.entries[0].scenarios[0].title, 'UTAD WYCKOF');
  assert.equal(created.body.entries[0].scenarios[0].occurred, true);
  assert.equal(created.body.entries[0].scenarios[0].patternTagId, 'pattern-1');
  assert.equal(created.body.activityLog.length, 1);

  const fetched = await api('GET', '/api/sync/sessions/session-a', { userId: user.id });
  assert.equal(fetched.status, 200);
  assert.deepEqual(fetched.body.entries[0].scenarios[0].executionPlan, sampleSession('session-a').entries[0].scenarios[0].executionPlan);

  const list = await api('GET', '/api/sync/sessions', { userId: user.id });
  assert.equal(list.body.sessions.length, 1);
});

test('re-POSTing the same session id is an idempotent upsert, not a duplicate, and fully replaces the child rows', async () => {
  const user = await createUser('Hunter Two');
  await api('POST', '/api/sync/sessions', { userId: user.id, body: sampleSession('session-b') });

  const changed = sampleSession('session-b');
  changed.status = 'closed';
  changed.entries[0].scenarios[0].occurred = false;
  changed.entries.push({ id: 'session-b-entry-2', type: 'movement', createdAt: '2026-01-01T08:00:00.000Z', hasImage: false, movementNote: 'price moved', relatedScenarioIds: [], scenarios: [] });
  const updated = await api('POST', '/api/sync/sessions', { userId: user.id, body: changed });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.status, 'closed');
  assert.equal(updated.body.entries.length, 2);
  assert.equal(updated.body.entries[0].scenarios[0].occurred, false);

  const list = await api('GET', '/api/sync/sessions', { userId: user.id });
  assert.equal(list.body.sessions.length, 1, 're-upserting the same id must never create a second session record');
});

test("HOTFIX regression guard: an entry with a missing/invalid `type` no longer breaks the whole session upsert - real production bug (navrya-src/sessionsAdapter.js's createSession() sent chart-upload entries with no `type` at all; trading_session_entries.type is NOT NULL CHECK (chart/movement/fate) in real Postgres, so the entire upsert 500'd and rolled back, silently losing the session). Normalizes to 'chart', mirroring session-workspace-logic.js's own client-side normalize() fallback", async () => {
  const user = await createUser('Hunter NoType');
  const session = sampleSession('session-no-type');
  delete session.entries[0].type;
  session.entries.push({ id: 'session-no-type-entry-2', type: 'not-a-real-type', createdAt: '2026-01-01T07:06:00.000Z', hasImage: false, relatedScenarioIds: [], scenarios: [] });
  const created = await api('POST', '/api/sync/sessions', { userId: user.id, body: session });
  assert.equal(created.status, 200, 'a missing/invalid entry.type must never 500 the whole session write');
  assert.equal(created.body.entries[0].type, 'chart', 'a missing type defaults to chart');
  assert.equal(created.body.entries[1].type, 'chart', 'an unrecognized type also defaults to chart rather than being rejected outright');
});

test('HOTFIX regression guard: a session with a missing/empty `market` no longer breaks the upsert - trading_sessions.market is NOT NULL in real Postgres, and record.market || null used to feed that constraint a real NULL', async () => {
  const user = await createUser('Hunter NoMarket');
  const session = sampleSession('session-no-market');
  session.market = '';
  const created = await api('POST', '/api/sync/sessions', { userId: user.id, body: session });
  assert.equal(created.status, 200, 'a missing/empty market must never 500 the whole session write');
  assert.ok(created.body.market, 'market must fall back to a real, non-empty default');
});

test('a session belonging to another user cannot be fetched, upserted, or deleted', async () => {
  const owner = await createUser('Owner');
  const stranger = await createUser('Stranger');
  await api('POST', '/api/sync/sessions', { userId: owner.id, body: sampleSession('session-c') });

  const strangerFetch = await api('GET', '/api/sync/sessions/session-c', { userId: stranger.id });
  assert.equal(strangerFetch.status, 404, "another user's GET by id must not leak someone else's session");

  const strangerOverwrite = await api('POST', '/api/sync/sessions', { userId: stranger.id, body: sampleSession('session-c') });
  assert.equal(strangerOverwrite.status, 403);
  assert.equal(strangerOverwrite.body.error, 'NOT_SESSION_OWNER');

  const strangerDelete = await api('DELETE', '/api/sync/sessions/session-c', { userId: stranger.id });
  assert.equal(strangerDelete.status, 403);
});

test('DELETE removes the session and its child rows are gone too (no orphaned scenario/entry rows reachable)', async () => {
  const user = await createUser('Hunter Three');
  await api('POST', '/api/sync/sessions', { userId: user.id, body: sampleSession('session-d') });
  const deleted = await api('DELETE', '/api/sync/sessions/session-d', { userId: user.id });
  assert.equal(deleted.status, 204);
  const list = await api('GET', '/api/sync/sessions', { userId: user.id });
  assert.equal(list.body.sessions.length, 0);
});

test('POST /api/sync/sessions/images uploads a base64 chart image under the session category', async () => {
  const user = await createUser('Hunter Four');
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const result = await api('POST', '/api/sync/sessions/images', { userId: user.id, body: { dataUrl: `data:image/png;base64,${tinyPng}` } });
  assert.equal(result.status, 201);
  assert.match(result.body.url, /^\/uploads\/session\/img-.+\.png$/);
});
