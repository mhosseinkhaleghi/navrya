import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// server/community/routes.internal.mjs's POST /internal/session-analysis-completions - the
// authoritative write path for the AI Analysis Discipline ledger. Mirrors
// tests/ai-usage-authoritative.test.mjs's single-server internal-route test style exactly.

process.env.INTERNAL_API_SECRET = 'test-internal-secret-please-ignore';

let repo, server, baseUrl;

before(async () => {
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

function internalPost(body) {
  return fetch(`${baseUrl}/internal/session-analysis-completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
    body: JSON.stringify(body)
  });
}

async function makeUserWithSession({ instrument = 'XAUUSD', entryId = 'entry-1' } = {}) {
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.instrumentCatalog.upsert(user.id, { id: 'instrument-' + user.id, code: instrument });
  const session = await repo.tradingSessions.upsert(user.id, {
    id: 'sess-' + user.id, market: 'London', instrument, timeframe: '15m', date: '2026-01-01',
    entries: [{ id: entryId, type: 'chart', hasImage: true, note: 'setup', createdAt: '2026-01-01T00:00:00.000Z' }]
  });
  return { user, session };
}

test('a request without the internal secret is rejected', async () => {
  const response = await fetch(`${baseUrl}/internal/session-analysis-completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'x', sessionId: 'y', analysisId: 'z' })
  });
  assert.equal(response.status, 403);
});

test('missing required fields are rejected with 400', async () => {
  const response = await internalPost({});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'VALIDATION_FAILED');
});

test('an unknown userId is rejected with 404 rather than silently minting an orphaned completion', async () => {
  const response = await internalPost({ userId: 'not-a-real-user', sessionId: 'x', analysisId: 'a1' });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'USER_NOT_FOUND');
});

test('a real, owned session/entry records a completion (201) and is idempotent on a retried analysisId (200, no duplicate row)', async () => {
  const { user, session } = await makeUserWithSession();
  const first = await internalPost({ userId: user.id, sessionId: session.id, entryId: 'entry-1', analysisId: 'analysis-1', analysisType: 'initial', provider: 'openai', model: 'gpt' });
  assert.equal(first.status, 201);
  const body = await first.json();
  assert.equal(body.sessionId, session.id);
  assert.equal(body.entryId, 'entry-1');

  const retry = await internalPost({ userId: user.id, sessionId: session.id, entryId: 'entry-1', analysisId: 'analysis-1' });
  assert.equal(retry.status, 200, 'a retried analysisId must never create a second row');

  const rows = await repo.sessionAiAnalysisCompletions.listForUser(user.id);
  assert.equal(rows.length, 1, 'the retry must not duplicate the completion');
});

test('a sessionId owned by a DIFFERENT user is rejected - a browser can never forge a completion against a session it does not own', async () => {
  const { session } = await makeUserWithSession();
  const attacker = await repo.users.create({ displayName: 'Attacker' });
  const response = await internalPost({ userId: attacker.id, sessionId: session.id, analysisId: 'forged-1' });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'SESSION_NOT_FOUND');
  assert.deepEqual(await repo.sessionAiAnalysisCompletions.listForUser(attacker.id), []);
});

test('a sessionId that does not exist at all is rejected the same way as one owned by someone else', async () => {
  const user = await repo.users.create({ displayName: 'Trader2' });
  const response = await internalPost({ userId: user.id, sessionId: 'does-not-exist', analysisId: 'analysis-x' });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'SESSION_NOT_FOUND');
});

test('an entryId that does not belong to the named session is silently dropped (nulled), never trusted, and the completion is still recorded against the real session', async () => {
  const { user, session } = await makeUserWithSession();
  const response = await internalPost({ userId: user.id, sessionId: session.id, entryId: 'not-a-real-entry', analysisId: 'analysis-tampered' });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.entryId, null, 'a forged entryId must never be trusted onto the ledger');
  assert.equal(body.sessionId, session.id);
});
