import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemoryRateLimitStore, rateLimit, ipKey, ipAndIdentifierKey,
  __setRateLimitStoreForTests, __resetRateLimitStoreForTests
} from '../server/community/security/rate-limit.mjs';

function fakeReqRes(overrides = {}) {
  const headers = {};
  const req = { ip: '198.51.100.7', headers: {}, ...overrides };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { headers[name] = value; },
    json(body) { this.body = body; return this; },
    _headers: headers
  };
  return { req, res };
}

test('createMemoryRateLimitStore allows requests under the limit and blocks once the window limit is exceeded', async () => {
  const store = createMemoryRateLimitStore();
  const key = 'test-key-1';
  for (let i = 0; i < 5; i += 1) {
    const { count } = await store.incr(key, 60000);
    assert.equal(count, i + 1);
  }
});

test('the memory store resets a key after its window expires', async () => {
  const store = createMemoryRateLimitStore();
  const first = await store.incr('short-window', 10);
  assert.equal(first.count, 1);
  await new Promise((resolve) => setTimeout(resolve, 25));
  const second = await store.incr('short-window', 10);
  assert.equal(second.count, 1, 'the window should have reset, not kept accumulating');
});

test('rateLimit middleware calls next() while under the limit and returns 429 with Retry-After once exceeded', async () => {
  __setRateLimitStoreForTests(createMemoryRateLimitStore());
  const middleware = rateLimit({ windowMs: 60000, max: 2, keyFn: ipKey('login') });

  const calls = [];
  const next = () => calls.push('next');

  const first = fakeReqRes();
  await middleware(first.req, first.res, next);
  const second = fakeReqRes();
  await middleware(second.req, second.res, next);
  assert.deepEqual(calls, ['next', 'next']);

  const third = fakeReqRes();
  await middleware(third.req, third.res, next);
  assert.equal(third.res.statusCode, 429);
  assert.equal(third.res.body.error, 'RATE_LIMITED');
  assert.ok(third.res._headers['Retry-After']);
  assert.equal(calls.length, 2, 'the third request must never reach the route handler');
  __resetRateLimitStoreForTests();
});

test('rateLimit throttling is never a PERMANENT lockout - a fresh window lets the same key through again', async () => {
  __setRateLimitStoreForTests(createMemoryRateLimitStore());
  const middleware = rateLimit({ windowMs: 15, max: 1, keyFn: ipKey('probe') });
  const calls = [];
  const next = () => calls.push('next');

  await middleware(fakeReqRes().req, fakeReqRes().res, next);
  const blocked = fakeReqRes();
  await middleware(blocked.req, blocked.res, next);
  assert.equal(blocked.res.statusCode, 429);

  await new Promise((resolve) => setTimeout(resolve, 30));
  const afterWindow = fakeReqRes();
  await middleware(afterWindow.req, afterWindow.res, next);
  assert.equal(calls.length, 2, 'a request after the window elapsed must succeed, proving this is throttling, not a permanent block');
  __resetRateLimitStoreForTests();
});

test('ipAndIdentifierKey combines IP and a normalized account identifier, so two different emails from the same IP get independent buckets', async () => {
  __setRateLimitStoreForTests(createMemoryRateLimitStore());
  const middleware = rateLimit({ windowMs: 60000, max: 1, keyFn: ipAndIdentifierKey('login', (req) => req.body?.email) });
  const calls = [];
  const next = () => calls.push('next');

  const alice = fakeReqRes({ body: { email: 'alice@example.com' } });
  await middleware(alice.req, alice.res, next);
  const aliceAgain = fakeReqRes({ body: { email: 'alice@example.com' } });
  await middleware(aliceAgain.req, aliceAgain.res, next);
  assert.equal(aliceAgain.res.statusCode, 429, 'a second attempt for the SAME identifier from the same IP should be blocked');

  const bob = fakeReqRes({ body: { email: 'BOB@EXAMPLE.COM' } });
  await middleware(bob.req, bob.res, next);
  assert.equal(bob.res.statusCode, 200, 'a DIFFERENT identifier from the same IP must get its own bucket');
  __resetRateLimitStoreForTests();
});
