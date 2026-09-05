import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { createMemoryRateLimitStore, __setRateLimitStoreForTests, __resetRateLimitStoreForTests } from '../server/community/security/rate-limit.mjs';

// Launch-readiness audit fix (P1-3): before this, POST /api/community/posts, /comments, /likes,
// /reports, /api/messages/threads, /threads/:id/messages, /api/marketplace/listings, /purchase,
// and /ratings had NO rate limit at all - only requireAuth()+csrfProtection() gated them, and
// registration is cheap/self-serve, so "authenticated" was never a real throttle. This proves
// each limiter actually fires, in the real app, over real HTTP.
//
// Every call below targets a NONEXISTENT resource id deliberately - the limiter middleware is
// mounted BEFORE the route handler, so it must reject the (max+1)th request with 429 regardless
// of whether the request would otherwise have succeeded. This lets one test per route avoid
// creating real posts/listings/threads just to reach the handler - only the status code (429 or
// not) is ever asserted, never the underlying business outcome.

let server, baseUrl, repo, headers;

before(async () => {
  __setRateLimitStoreForTests(createMemoryRateLimitStore());
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const user = await repo.users.create({ displayName: 'Rate Limit Prober' });
  headers = { 'Content-Type': 'application/json', ...(await authHeadersFor(repo, user.id)) };
});
after(async () => {
  __resetRateLimitStoreForTests();
  await new Promise((resolve) => server.close(resolve));
});

async function hammer(method, path, max, body = {}) {
  const statuses = [];
  for (let i = 0; i < max + 1; i += 1) {
    const response = await fetch(baseUrl + path, { method, headers, body: JSON.stringify(body) });
    statuses.push(response.status);
    if (i === max) {
      assert.equal(response.status, 429, `request #${i + 1} (over the declared max of ${max}) must be rate-limited`);
      assert.ok(response.headers.get('retry-after'), 'a 429 must carry Retry-After');
      const parsed = await response.json();
      assert.equal(parsed.error, 'RATE_LIMITED');
    }
  }
  assert.ok(statuses.slice(0, max).every((s) => s !== 429), `the first ${max} requests must never themselves be rate-limited`);
}

test('POST /api/community/posts is rate-limited (max 10 / 15min)', () => hammer('POST', '/api/community/posts', 10, { content: 'x' }));
test('POST /api/community/posts/:id/comments is rate-limited (max 30 / 15min)', () => hammer('POST', '/api/community/posts/nonexistent/comments', 30, { content: 'x' }));
test('POST /api/community/posts/:id/likes is rate-limited (max 60 / 15min)', () => hammer('POST', '/api/community/posts/nonexistent/likes', 60));
test('POST /api/community/reports is rate-limited (max 10 / 1h)', () => hammer('POST', '/api/community/reports', 10, { targetType: 'post', targetId: 'x', reason: 'x' }));

test('POST /api/messages/threads is rate-limited (max 20 / 1h)', () => hammer('POST', '/api/messages/threads', 20, { counterpartyId: 'nonexistent-user' }));
test('POST /api/messages/threads/:id/messages is rate-limited (max 60 / 15min)', () => hammer('POST', '/api/messages/threads/nonexistent/messages', 60, { content: 'x' }));

test('POST /api/marketplace/listings is rate-limited (max 10 / 1h)', () => hammer('POST', '/api/marketplace/listings', 10));
test('POST /api/marketplace/listings/:id/purchase is rate-limited (max 20 / 1h)', () => hammer('POST', '/api/marketplace/listings/nonexistent/purchase', 20));
test('POST /api/marketplace/listings/:id/ratings is rate-limited (max 20 / 1h)', () => hammer('POST', '/api/marketplace/listings/nonexistent/ratings', 20, { rating: 5 }));
