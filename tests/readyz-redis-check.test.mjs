import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { __resetRedisClientForTests } from '../server/community/security/rate-limit.mjs';

// Launch-readiness audit fix (P2): rate limiting and AI quota both depend on Redis in production,
// but GET /readyz never reflected that - an operator had no way to see "Redis is down" via the
// readiness probe alone. This proves the new check, over real HTTP, without ever connecting to a
// real Redis server: `globalThis.__NAVRYA_IOREDIS_CTOR__` is the exact same test-injection seam
// rate-limit.mjs already exposes for its own lazy ioredis import.

let server, baseUrl, repo;
const originalRedisUrl = process.env.REDIS_URL;

before(async () => {
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  __resetRedisClientForTests();
  delete globalThis.__NAVRYA_IOREDIS_CTOR__;
});
after(async () => {
  __resetRedisClientForTests();
  delete globalThis.__NAVRYA_IOREDIS_CTOR__;
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = originalRedisUrl;
  await new Promise((resolve) => server.close(resolve));
});

test('with no REDIS_URL configured (local/test), readiness is never blocked on Redis', async () => {
  delete process.env.REDIS_URL;
  const response = await fetch(`${baseUrl}/readyz`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.checks.redis, true);
});

test('with REDIS_URL configured and a reachable Redis, readiness reports redis:true', async () => {
  process.env.REDIS_URL = 'redis://fake-host:6379';
  globalThis.__NAVRYA_IOREDIS_CTOR__ = function FakeRedis() {
    return { on() {}, async ping() { return 'PONG'; } };
  };
  const response = await fetch(`${baseUrl}/readyz`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.checks.redis, true);
});

test('with REDIS_URL configured but unreachable, readiness fails closed with 503 and redis:false - the exact P2 gap this closes', async () => {
  process.env.REDIS_URL = 'redis://fake-host:6379';
  globalThis.__NAVRYA_IOREDIS_CTOR__ = function FakeRedis() {
    return { on() {}, async ping() { throw new Error('ECONNREFUSED'); } };
  };
  const response = await fetch(`${baseUrl}/readyz`);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.checks.redis, false);
  assert.equal(body.ready, false);
});
