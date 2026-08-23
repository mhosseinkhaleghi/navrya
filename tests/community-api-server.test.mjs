import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

// Importing the server module has a real side effect: it builds a real pg.Pool and calls
// server.listen(...) at module scope (mirrors server/pattern-ai-server.mjs and
// tests/ai-gateway.test.mjs exactly). pg.Pool never opens a connection at construction time
// (lazy per-query), so this import is safe with zero Postgres reachable - as long as this
// test only exercises routes that never touch the DB. A DATABASE_URL must be set before
// import so the entrypoint takes its pg-backed branch rather than its zero-setup in-memory
// fallback (used when a developer runs the server with no DATABASE_URL configured at all) -
// this test is specifically about the pg wiring, not the fallback.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://tradejournal:tradejournal@127.0.0.1:5432/tradejournal';
const serverModule = await import('../server/community-api-server.mjs');
const server = serverModule.default;

let baseUrl;
before(async () => {
  if (!server.listening) await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); });

test('the real (pg-backed) server responds to /health without ever querying the database', async () => {
  const response = await fetch(baseUrl + '/health');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
});

test('OPTIONS is handled by the CORS middleware alone, before any route or auth check', async () => {
  const response = await fetch(baseUrl + '/api/community/posts', { method: 'OPTIONS' });
  assert.equal(response.status, 204);
});

test('an unauthenticated request to an unknown route gets AUTH_SESSION_REQUIRED, not a 404 - requireAuth is mounted globally with no path exceptions, so unknown paths never leak which routes exist to an unauthenticated caller. (Reaching notFoundMiddleware genuinely requires a valid user, so that specific case is covered by the memory-repo-backed tests/community-api-contract.test.mjs instead - the real pg-backed server in this file has no DB to authenticate against.)', async () => {
  const response = await fetch(baseUrl + '/this-route-does-not-exist');
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error, 'AUTH_SESSION_REQUIRED');
});
