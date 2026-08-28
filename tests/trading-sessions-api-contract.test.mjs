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
// Instrument Catalog domain: a brand-new session now requires a real, cataloged instrument.
async function seedInstrument(userId, code = 'XAUUSD') {
  return repo.instrumentCatalog.upsert(userId, { id: 'instr-' + userId + '-' + code, code });
}
function propAccount(id, overrides) {
  return Object.assign({
    id, kind: 'prop', firm: 'Atlas Funding', status: 'active', currency: 'USD',
    startDate: '2026-08-01', startingBalance: 100000,
    rules: { profitTargetPercent: 10, dailyLossLimitPercent: 5, maxDrawdownPercent: 10, drawdownType: 'static' }
  }, overrides || {});
}

function sampleSession(id) {
  return {
    id, character: 'hunter', market: 'London', instrument: 'XAUUSD', timeframe: '5m', date: '2026-01-01', jalali: '۱۴۰۴/۱۰/۱۱',
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
            executionPlan: { actionPlan: 'plan', positionType: 'Long', entryPrices: [100], stopLoss: 90, takeProfit: 120, positionStatus: null },
            // 2026-08-28 bug report: real production testing found these 3 real, pre-existing
            // Scenario fields silently lost on every server round-trip (039_trading_session_
            // scenario_gaps.sql adds the missing columns) - a plain DOM edit (not just AI/voice)
            // reproduced it identically. Covered in this exact round-trip test so a future
            // regression here is caught by npm test, not only by live production testing.
            problem: 'weak volume', invalidationNote: 'closes below 1.2000', invalidationTagIds: ['support break', 'volume dries up']
          }
        ]
      }
    ],
    activityLog: [{ id: id + '-log-1', type: 'entry_added', detail: 'New chart added', scenarioId: null, loggedAt: '2026-01-01T07:05:00.000Z', countsTowardLoopUpdate: true }]
  };
}

test('a request with no x-dev-user-id is rejected with AUTH_SESSION_REQUIRED', async () => {
  const result = await api('GET', '/api/sync/sessions');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_SESSION_REQUIRED');
});

test('POST upserts a full nested session (entries + scenarios + activity log) and GET reassembles it identically', async () => {
  const user = await createUser('Hunter One');
  await seedInstrument(user.id);
  const created = await api('POST', '/api/sync/sessions', { userId: user.id, body: sampleSession('session-a') });
  assert.equal(created.status, 200);
  assert.equal(created.body.id, 'session-a');
  assert.equal(created.body.entries.length, 1);
  assert.equal(created.body.entries[0].scenarios.length, 1);
  assert.equal(created.body.entries[0].scenarios[0].title, 'UTAD WYCKOF');
  assert.equal(created.body.entries[0].scenarios[0].occurred, true);
  assert.equal(created.body.entries[0].scenarios[0].patternTagId, 'pattern-1');
  assert.equal(created.body.entries[0].scenarios[0].problem, 'weak volume');
  assert.equal(created.body.entries[0].scenarios[0].invalidationNote, 'closes below 1.2000');
  assert.deepEqual(created.body.entries[0].scenarios[0].invalidationTagIds, ['support break', 'volume dries up']);
  assert.equal(created.body.activityLog.length, 1);

  const fetched = await api('GET', '/api/sync/sessions/session-a', { userId: user.id });
  assert.equal(fetched.status, 200);
  assert.deepEqual(fetched.body.entries[0].scenarios[0].executionPlan, sampleSession('session-a').entries[0].scenarios[0].executionPlan);
  assert.equal(fetched.body.entries[0].scenarios[0].problem, 'weak volume');
  assert.equal(fetched.body.entries[0].scenarios[0].invalidationNote, 'closes below 1.2000');
  assert.deepEqual(fetched.body.entries[0].scenarios[0].invalidationTagIds, ['support break', 'volume dries up']);

  const list = await api('GET', '/api/sync/sessions', { userId: user.id });
  assert.equal(list.body.sessions.length, 1);
});

test('re-POSTing the same session id is an idempotent upsert, not a duplicate, and fully replaces the child rows', async () => {
  const user = await createUser('Hunter Two');
  await seedInstrument(user.id);
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
  await seedInstrument(user.id);
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
  await seedInstrument(user.id);
  const session = sampleSession('session-no-market');
  session.market = '';
  const created = await api('POST', '/api/sync/sessions', { userId: user.id, body: session });
  assert.equal(created.status, 200, 'a missing/empty market must never 500 the whole session write');
  assert.ok(created.body.market, 'market must fall back to a real, non-empty default');
});

test('a session belonging to another user cannot be fetched, upserted, or deleted', async () => {
  const owner = await createUser('Owner');
  const stranger = await createUser('Stranger');
  await seedInstrument(owner.id);
  await api('POST', '/api/sync/sessions', { userId: owner.id, body: sampleSession('session-c') });

  const strangerFetch = await api('GET', '/api/sync/sessions/session-c', { userId: stranger.id });
  assert.equal(strangerFetch.status, 404, "another user's GET by id must not leak someone else's session");

  const strangerOverwrite = await api('POST', '/api/sync/sessions', { userId: stranger.id, body: sampleSession('session-c') });
  assert.equal(strangerOverwrite.status, 403);
  assert.equal(strangerOverwrite.body.error, 'NOT_SESSION_OWNER');

  const strangerDelete = await api('DELETE', '/api/sync/sessions/session-c', { userId: stranger.id });
  assert.equal(strangerDelete.status, 403);
});

// ---- Instrument Catalog domain ----

test('a brand-new session with no instrument is rejected with INSTRUMENT_REQUIRED', async () => {
  const user = await createUser('No Instrument Session');
  await seedInstrument(user.id);
  const session = sampleSession('session-no-instrument');
  delete session.instrument;
  const result = await api('POST', '/api/sync/sessions', { userId: user.id, body: session });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'INSTRUMENT_REQUIRED');
});

test('a brand-new session whose instrument is not in the user\'s own catalog is rejected with INSTRUMENT_NOT_IN_CATALOG', async () => {
  const user = await createUser('Uncataloged Instrument Session');
  // Deliberately no seedInstrument() call.
  const result = await api('POST', '/api/sync/sessions', { userId: user.id, body: sampleSession('session-uncataloged') });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'INSTRUMENT_NOT_IN_CATALOG');
});

test('editing an already-existing session never gets retroactively forced to pick an instrument', async () => {
  const user = await createUser('Legacy Session Editor');
  await seedInstrument(user.id);
  const created = await api('POST', '/api/sync/sessions', { userId: user.id, body: sampleSession('session-legacy-instrument') });
  assert.equal(created.status, 200);
  const legacy = sampleSession('session-legacy-instrument');
  delete legacy.instrument;
  legacy.status = 'closed';
  const edited = await api('POST', '/api/sync/sessions', { userId: user.id, body: legacy });
  assert.equal(edited.status, 200, 'omitting instrument on an edit of a pre-existing session must never be rejected');
});

test('DELETE removes the session and its child rows are gone too (no orphaned scenario/entry rows reachable)', async () => {
  const user = await createUser('Hunter Three');
  await seedInstrument(user.id);
  await api('POST', '/api/sync/sessions', { userId: user.id, body: sampleSession('session-d') });
  const deleted = await api('DELETE', '/api/sync/sessions/session-d', { userId: user.id });
  assert.equal(deleted.status, 204);
  const list = await api('GET', '/api/sync/sessions', { userId: user.id });
  assert.equal(list.body.sessions.length, 0);
});

// ---- Defect #5: sessions are optionally, but verifiably, account-scoped ----

test('a session can be created with a real accountId, and it round-trips through GET', async () => {
  const user = await createUser('Hunter AccountA');
  await seedInstrument(user.id);
  await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('sess-acct-a') });
  const session = sampleSession('session-acct-1');
  session.accountId = 'sess-acct-a';
  const created = await api('POST', '/api/sync/sessions', { userId: user.id, body: session });
  assert.equal(created.status, 200);
  assert.equal(created.body.accountId, 'sess-acct-a');
  const fetched = await api('GET', '/api/sync/sessions/session-acct-1', { userId: user.id });
  assert.equal(fetched.body.accountId, 'sess-acct-a');
});

test('a session with no accountId at all stays honestly unscoped - never mandatory the way a trade is', async () => {
  const user = await createUser('Hunter NoAccount');
  await seedInstrument(user.id);
  const created = await api('POST', '/api/sync/sessions', { userId: user.id, body: sampleSession('session-acct-2') });
  assert.equal(created.status, 200, 'unlike a trade, a session is never rejected for missing accountId');
  assert.equal(created.body.accountId, null);
});

test("a session cannot be created pointing at another user's account - NOT_ACCOUNT_OWNER", async () => {
  const owner = await createUser('Account Owner');
  const stranger = await createUser('Session Stranger');
  await api('POST', '/api/sync/accounts', { userId: owner.id, body: propAccount('sess-acct-owner') });
  const session = sampleSession('session-acct-3');
  session.accountId = 'sess-acct-owner';
  const result = await api('POST', '/api/sync/sessions', { userId: stranger.id, body: session });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'NOT_ACCOUNT_OWNER');
});

test('a session can never be freshly assigned to an archived account - ACCOUNT_ARCHIVED (defect #3, mirrored for sessions)', async () => {
  const user = await createUser('Hunter Archived');
  await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('sess-acct-arch', { status: 'archived' }) });
  const session = sampleSession('session-acct-4');
  session.accountId = 'sess-acct-arch';
  const result = await api('POST', '/api/sync/sessions', { userId: user.id, body: session });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'ACCOUNT_ARCHIVED');
});

test('a session already pointing at an account that is later archived stays fully editable (re-saving unrelated fields does not re-trigger ACCOUNT_ARCHIVED)', async () => {
  const user = await createUser('Hunter Grandfathered');
  await seedInstrument(user.id);
  await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('sess-acct-gf') });
  const session = sampleSession('session-acct-5');
  session.accountId = 'sess-acct-gf';
  await api('POST', '/api/sync/sessions', { userId: user.id, body: session });

  await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('sess-acct-gf', { status: 'archived' }) });

  const resaved = { ...session, status: 'closed' };
  const result = await api('POST', '/api/sync/sessions', { userId: user.id, body: resaved });
  assert.equal(result.status, 200, 'a trade/session that already carried this exact accountId before archiving must stay editable');
  assert.equal(result.body.status, 'closed');
  assert.equal(result.body.accountId, 'sess-acct-gf');
});

test('POST /api/sync/sessions/images uploads a base64 chart image under the session category', async () => {
  const user = await createUser('Hunter Four');
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const result = await api('POST', '/api/sync/sessions/images', { userId: user.id, body: { dataUrl: `data:image/png;base64,${tinyPng}` } });
  assert.equal(result.status, 201);
  assert.match(result.body.url, /^\/uploads\/session\/img-.+\.png$/);
});
