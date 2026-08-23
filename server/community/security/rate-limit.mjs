import { createHash } from 'node:crypto';

// Pluggable rate-limit store: a real `ioredis` client in production (shared across every API
// replica, so an attacker cannot evade a limit by hitting a different instance or by forging a
// different apparent client), an in-memory Map in test/local dev ONLY. Never the reverse -
// server/community-api-server.mjs's production startup check refuses to boot on a memory store.
//
// A single atomic INCR+PEXPIRE (via one Lua script, avoiding a check-then-act race across two
// replicas incrementing the same key concurrently) backs a fixed-window counter. Fixed-window is
// intentionally simple (not a sliding-log/token-bucket) - correct enough for abuse throttling at
// this app's scale, and trivial to reason about/test.
export function createMemoryRateLimitStore() {
  const buckets = new Map();
  return {
    kind: 'memory',
    async incr(key, windowMs) {
      const now = Date.now();
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= now) {
        const resetAt = now + windowMs;
        buckets.set(key, { count: 1, resetAt });
        return { count: 1, resetAt };
      }
      existing.count += 1;
      return { count: existing.count, resetAt: existing.resetAt };
    },
    async reset(key) { buckets.delete(key); },
    async close() {}
  };
}

const INCR_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then ttl = tonumber(ARGV[1]) end
return {current, ttl}
`;

export function createRedisRateLimitStore(redisClient) {
  return {
    kind: 'redis',
    async incr(key, windowMs) {
      const [count, ttl] = await redisClient.eval(INCR_SCRIPT, 1, key, String(windowMs));
      return { count: Number(count), resetAt: Date.now() + Number(ttl) };
    },
    async reset(key) { await redisClient.del(key); },
    async close() { await redisClient.quit().catch(() => {}); }
  };
}

// Resolved once per process, reused by every rate-limited route. Production (NODE_ENV=production)
// refuses to fall back to memory - see the instruction's completion criterion: "production
// starts with ... missing Redis" must never happen silently. Local/test explicitly gets memory,
// logged once so it's never mistaken for the production posture.
let cachedStore = null;
export function resolveRateLimitStore() {
  if (cachedStore) return cachedStore;
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    // Lazy import: keeps `ioredis` out of the module graph entirely for pure in-memory dev/test
    // runs (this is a top-level await-free lazy require pattern already used elsewhere in this
    // codebase, e.g. passwords.mjs's argon2 loader).
    const IORedis = requireIoRedisSync();
    const client = new IORedis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
    client.on('error', (error) => console.error('[rate-limit] Redis connection error:', error.message)); // eslint-disable-line no-console
    cachedStore = createRedisRateLimitStore(client);
    return cachedStore;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: REDIS_URL is required in production for distributed rate limiting. Set REDIS_URL (see .env.production.example).');
  }
  console.warn('[rate-limit] REDIS_URL not set - using an in-memory rate-limit store. This is only correct for a single local process; it does NOT share state across replicas and MUST NOT be used in production.'); // eslint-disable-line no-console
  cachedStore = createMemoryRateLimitStore();
  return cachedStore;
}

// eslint-disable-next-line global-require
function requireIoRedisSync() {
  // createRequire keeps this file a normal ESM module while still allowing a synchronous
  // require() for the one call site that needs it (resolveRateLimitStore() is called from
  // synchronous middleware-setup code, not from an async context).
  // Using a static top-level import would make `ioredis` a hard dependency of every process
  // that imports this file, even a pure in-memory test run - the whole point of lazy-loading it.
  return globalThis.__NAVRYA_IOREDIS_CTOR__ || loadIoRedisCtor();
}
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function loadIoRedisCtor() {
  const mod = require('ioredis');
  const ctor = mod.default || mod;
  globalThis.__NAVRYA_IOREDIS_CTOR__ = ctor;
  return ctor;
}

export function __setRateLimitStoreForTests(store) { cachedStore = store; }
export function __resetRateLimitStoreForTests() { cachedStore = null; }

function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

// Never the raw IP as the Redis/memory key material verbatim (defense in depth against key-space
// enumeration if the store were ever inspectable) - hashed the same way security_events.ip_hash
// is, using a fixed non-secret domain-separation prefix (this is a rate-limit KEY, not a security
// boundary by itself, so a keyed HMAC isn't required here the way it is for ip_hash at rest).
function clientIp(req) {
  // trust proxy is configured explicitly in app.mjs to exactly one hop (the reverse proxy) -
  // req.ip already reflects that trusted resolution, never a raw client-forgeable header read
  // directly here.
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
function keyFor(parts) {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

// Two stacked windows per limiter (burst + sustained) is deliberately NOT a permanent lockout:
// once a window's TTL elapses the counter resets on its own. This is the instructed
// "throttling/progressive delay instead of permanent lockout that becomes attacker-controlled
// denial of service" - an attacker who wanted to lock a real user out permanently by
// deliberately failing their login cannot, since the block always self-expires.
export function rateLimit({ windowMs, max, keyFn, message = 'RATE_LIMITED' }) {
  return async function (req, res, next) {
    try {
      const store = resolveRateLimitStore();
      const key = `rl:${keyFn(req)}`;
      const { count, resetAt } = await store.incr(key, windowMs);
      if (count > max) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
        return res.status(429).json({ error: message });
      }
      next();
    } catch (error) {
      // A rate-limit store outage must never itself take down the auth path in a way indistinguishable
      // from a real block, but it also must never be silently bypassed in production - see
      // resolveRateLimitStore()'s own fail-closed startup check for why REDIS_URL is mandatory
      // there. In dev/test a transient store error simply lets the request through.
      if (process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'RATE_LIMIT_STORE_UNAVAILABLE' });
      next();
    }
  };
}

export function ipKey(prefix) {
  return (req) => keyFor([prefix, 'ip', clientIp(req)]);
}
export function ipAndIdentifierKey(prefix, identifierFrom) {
  return (req) => keyFor([prefix, 'ip', clientIp(req), 'id', normalizeIdentifier(identifierFrom(req))]);
}
export function sessionKey(prefix) {
  return (req) => keyFor([prefix, 'session', req.sessionId || 'anon']);
}
