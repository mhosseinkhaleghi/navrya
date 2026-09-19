import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { sanitizeCompletionAttribution } from '../server/db/analysis-profile-normalize.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Analysis Profile attribution on the AI Session Analysis completions ledger (075): the internal route
// re-verifies the profile and stamps the server-clock market session, and GET /api/sync/analysis-profiles/
// :id/usage serves one profile's runs (the Report's data source). Same harnesses as
// session-analysis-completions-internal-route.test.mjs and analysis-profile-events-api-contract.test.mjs.

process.env.INTERNAL_API_SECRET = 'test-internal-secret-please-ignore';
const SESSIONS = ['London', 'New York', 'Tokyo', 'Sydney'];

let repo, server, baseUrl;
before(async () => {
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const internalPost = (body) => fetch(`${baseUrl}/internal/session-analysis-completions`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET }, body: JSON.stringify(body)
});
async function api(method, route, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + route, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function trader(name) {
  const user = await repo.users.create({ displayName: name });
  await repo.instrumentCatalog.upsert(user.id, { id: 'instr-' + user.id, code: 'XAUUSD' });
  const session = await repo.tradingSessions.upsert(user.id, {
    id: 'sess-' + user.id, market: 'London', instrument: 'XAUUSD', timeframe: '15m', date: '2026-01-01',
    entries: [{ id: 'entry-1', type: 'chart', hasImage: true, note: 'setup', createdAt: '2026-01-01T00:00:00.000Z' }]
  });
  return { user, session };
}
async function profileFor(user, id) { await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: { id, name: 'PA', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [] } }); return id; }
const coverage = [{ conceptId: 'c1', status: 'applied' }, { conceptId: 'c2', status: 'unaddressed' }];

test('sanitizeCompletionAttribution: format-only checks - bad ids/statuses/sessions become null/empty, and a revision only survives alongside a profile id', () => {
  assert.deepEqual(sanitizeCompletionAttribution(undefined), { analysisProfileId: null, analysisProfileRevision: '', activeMarketSession: '', conceptCoverage: null });
  const ok = sanitizeCompletionAttribution({ analysisProfileId: 'ap-1', analysisProfileRevision: '3.0.abc123<script>', activeMarketSession: 'London', conceptCoverage: coverage });
  assert.deepEqual(ok, { analysisProfileId: 'ap-1', analysisProfileRevision: '3.0.abc123script', activeMarketSession: 'London', conceptCoverage: coverage });
  const bad = sanitizeCompletionAttribution({ analysisProfileId: 'has spaces!', analysisProfileRevision: 'r1', activeMarketSession: 'Mars', conceptCoverage: [{ conceptId: 'ok', status: 'bogus' }, null, { conceptId: 'bad id', status: 'applied' }] });
  assert.deepEqual(bad, { analysisProfileId: null, analysisProfileRevision: '', activeMarketSession: '', conceptCoverage: null });
  assert.equal(sanitizeCompletionAttribution({ analysisProfileId: 'ap', analysisProfileRevision: 'x'.repeat(200) }).analysisProfileRevision.length, 40);
  assert.equal(sanitizeCompletionAttribution({ analysisProfileId: 'ap', conceptCoverage: Array.from({ length: 90 }, (_, i) => ({ conceptId: 'c' + i, status: 'applied' })) }).conceptCoverage.length, 40);
});

test('a completion run under the user\'s OWN profile is recorded with the profile id, revision, coverage and the SERVER-clock market session', async () => {
  const { user, session } = await trader('Owner');
  await profileFor(user, 'ap-own');
  const response = await internalPost({ userId: user.id, sessionId: session.id, entryId: 'entry-1', analysisId: 'a-own-1', analysisType: 'initial', provider: 'openai', model: 'gpt',
    analysisProfileId: 'ap-own', analysisProfileRevision: '3.0.h4sh', conceptCoverage: coverage });
  assert.equal(response.status, 201);
  const row = await response.json();
  assert.equal(row.analysisProfileId, 'ap-own');
  assert.equal(row.analysisProfileRevision, '3.0.h4sh');
  assert.deepEqual(row.conceptCoverage, coverage);
  assert.ok(SESSIONS.includes(row.activeMarketSession), `activeMarketSession must be one of the real sessions, got "${row.activeMarketSession}"`);
});

test('the market session is the SERVER\'s clock - a client-supplied label is ignored', async () => {
  const { user, session } = await trader('ClockOwner');
  await profileFor(user, 'ap-clock');
  const row = await (await internalPost({ userId: user.id, sessionId: session.id, analysisId: 'a-clock-1', analysisProfileId: 'ap-clock', activeMarketSession: 'Mars' })).json();
  assert.ok(SESSIONS.includes(row.activeMarketSession));
  assert.notEqual(row.activeMarketSession, 'Mars');
});

test('a profile id that belongs to ANOTHER user, or does not exist, is stored as NULL - the browser\'s claim is never trusted (and its revision/coverage are dropped with it)', async () => {
  const { user, session } = await trader('Claimant');
  const { user: victim } = await trader('Victim');
  await profileFor(victim, 'ap-victim');
  const foreign = await (await internalPost({ userId: user.id, sessionId: session.id, analysisId: 'a-foreign', analysisProfileId: 'ap-victim', analysisProfileRevision: 'r9', conceptCoverage: coverage })).json();
  assert.equal(foreign.analysisProfileId, null);
  assert.equal(foreign.analysisProfileRevision, '');
  assert.equal(foreign.conceptCoverage, null);
  const missing = await (await internalPost({ userId: user.id, sessionId: session.id, analysisId: 'a-missing', analysisProfileId: 'ap-does-not-exist' })).json();
  assert.equal(missing.analysisProfileId, null);
  // ...and it never shows up in the victim's usage either.
  const usage = await api('GET', '/api/sync/analysis-profiles/ap-victim/usage', { userId: victim.id });
  assert.equal(usage.body.analyses.length, 0);
});

test('a completion with no profile (or run before attribution existed) is still recorded exactly as before, with null attribution - the discipline ledger is unaffected', async () => {
  const { user, session } = await trader('NoProfile');
  const response = await internalPost({ userId: user.id, sessionId: session.id, analysisId: 'a-none', analysisType: 'update', provider: 'openai', model: 'gpt' });
  assert.equal(response.status, 201);
  const row = await response.json();
  assert.equal(row.analysisProfileId, null);
  assert.equal(row.conceptCoverage, null);
  assert.equal(row.analysisType, 'update');
  assert.equal((await repo.sessionAiAnalysisCompletions.listForUser(user.id)).length, 1, 'still counted by the AI Analysis Discipline ledger');
});

test('a retried analysisId stays idempotent with attribution too (no duplicate row, first write wins)', async () => {
  const { user, session } = await trader('Idem');
  await profileFor(user, 'ap-idem');
  const first = await internalPost({ userId: user.id, sessionId: session.id, analysisId: 'a-idem', analysisProfileId: 'ap-idem' });
  const retry = await internalPost({ userId: user.id, sessionId: session.id, analysisId: 'a-idem', analysisProfileId: 'ap-idem' });
  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.equal((await api('GET', '/api/sync/analysis-profiles/ap-idem/usage', { userId: user.id })).body.analyses.length, 1);
});

test('GET /usage requires a session (401), and 404s a profile that does not exist or is not the caller\'s - a stranger cannot even learn the id exists', async () => {
  assert.equal((await api('GET', '/api/sync/analysis-profiles/any/usage')).status, 401);
  const { user } = await trader('UsageOwner');
  const stranger = await repo.users.create({ displayName: 'Stranger' });
  await profileFor(user, 'ap-usage-private');
  assert.equal((await api('GET', '/api/sync/analysis-profiles/nope/usage', { userId: user.id })).status, 404);
  const foreign = await api('GET', '/api/sync/analysis-profiles/ap-usage-private/usage', { userId: stranger.id });
  assert.equal(foreign.status, 404);
  assert.equal(foreign.body.error, 'ANALYSIS_PROFILE_NOT_FOUND');
});

test('GET /usage returns only THIS profile\'s runs, oldest first, with the attribution fields the Report needs', async () => {
  const { user, session } = await trader('Reporter');
  await profileFor(user, 'ap-rep-a');
  await profileFor(user, 'ap-rep-b');
  await internalPost({ userId: user.id, sessionId: session.id, analysisId: 'r1', analysisType: 'initial', analysisProfileId: 'ap-rep-a', analysisProfileRevision: 'v1', conceptCoverage: coverage });
  await internalPost({ userId: user.id, sessionId: session.id, analysisId: 'r2', analysisType: 'update', analysisProfileId: 'ap-rep-b' });
  await internalPost({ userId: user.id, sessionId: session.id, analysisId: 'r3', analysisType: 'update', analysisProfileId: 'ap-rep-a', analysisProfileRevision: 'v2' });
  await internalPost({ userId: user.id, sessionId: session.id, analysisId: 'r4', analysisType: 'initial' }); // unattributed
  const usage = await api('GET', '/api/sync/analysis-profiles/ap-rep-a/usage', { userId: user.id });
  assert.equal(usage.status, 200);
  assert.deepEqual(usage.body.analyses.map((a) => a.analysisId), ['r1', 'r3']);
  const [first] = usage.body.analyses;
  for (const key of ['analysisId', 'sessionId', 'entryId', 'analysisType', 'provider', 'model', 'occurredAt', 'analysisProfileId', 'analysisProfileRevision', 'activeMarketSession', 'conceptCoverage']) assert.ok(key in first, `usage rows must carry ${key}`);
  assert.deepEqual(first.conceptCoverage, coverage);
  assert.equal(usage.body.analyses[1].analysisProfileRevision, 'v2', 'the revision separates before/after training');
});

test('deleting a profile does NOT delete its completions (they also drive the AI Analysis Discipline streak); the loose id simply stops resolving', async () => {
  const { user, session } = await trader('Deleter');
  await profileFor(user, 'ap-del');
  await internalPost({ userId: user.id, sessionId: session.id, analysisId: 'd1', analysisProfileId: 'ap-del' });
  assert.equal((await api('DELETE', '/api/sync/analysis-profiles/ap-del', { userId: user.id })).status, 204);
  assert.equal((await repo.sessionAiAnalysisCompletions.listForUser(user.id)).length, 1, 'the completion - and the discipline credit - survive');
  assert.equal((await api('GET', '/api/sync/analysis-profiles/ap-del/usage', { userId: user.id })).status, 404);
});
