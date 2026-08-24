import { resolveRedisClient } from './rate-limit.mjs';

// Binds a minted OpenAI Realtime ephemeral credential (`ek_...`) to the NAVRYA user who minted
// it, so the same-origin SDP relay (server/pattern-ai-server.mjs's handleRealtimeCallRelay) can
// verify "this exact bearer was minted, for this exact user, and has not already been used"
// before ever forwarding a browser's SDP offer to OpenAI. Only a SHA-256 hash of the token is
// ever stored - never the raw ek_ value - mirroring auth_sessions/crypto-util.mjs's existing
// "never store a bearer value verbatim" convention (server/community/security/session-service.mjs).
//
// Single-use by construction: consumeIfValid() is an atomic get-and-delete, never a plain get. A
// legitimate reconnect never needs to reuse a lease - aiVoiceRealtime.js already mints a fresh
// ephemeral secret on every connect()/reconnect (see that file's own header comment) - so treating
// the lease as consumed the instant it is checked closes the replay window without costing any
// real functionality.
//
// Two implementations, same shape as rate-limit.mjs's own createMemoryRateLimitStore/
// createRedisRateLimitStore split: a real Redis-backed store (shared across every horizontally-
// scaled pattern-ai instance, reusing the exact same client resolveRateLimitStore() already
// connects for AI-quota counting - no second Redis connection for this process) in production,
// an in-memory Map for local/test only.

const KEY_PREFIX = 'voice-lease:';

export function createMemoryRealtimeLeaseStore() {
  const leases = new Map();
  function prune() {
    const now = Date.now();
    for (const [key, entry] of leases) {
      if (entry.expiresAt <= now) leases.delete(key);
    }
  }
  return {
    kind: 'memory',
    async set(tokenHash, userId, ttlMs) {
      prune();
      leases.set(KEY_PREFIX + tokenHash, { userId, expiresAt: Date.now() + ttlMs });
    },
    async consumeIfValid(tokenHash) {
      prune();
      const key = KEY_PREFIX + tokenHash;
      const entry = leases.get(key);
      if (!entry) return null;
      leases.delete(key); // single-use regardless of outcome below
      if (entry.expiresAt <= Date.now()) return null;
      return entry.userId;
    },
    async close() {}
  };
}

// Lua script for an atomic "read then delete" (Redis GETDEL, available since 7.0 - this project
// targets redis:7-alpine per docker-compose.production.yml, but the script form works on any
// Redis version and matches the atomic-INCR-via-eval pattern rate-limit.mjs's own
// createRedisRateLimitStore already established, so both stores share one well-understood
// mechanism rather than mixing raw commands and eval scripts).
const CONSUME_SCRIPT = `
local v = redis.call("GET", KEYS[1])
if v then redis.call("DEL", KEYS[1]) end
return v
`;

export function createRedisRealtimeLeaseStore(redisClient) {
  return {
    kind: 'redis',
    async set(tokenHash, userId, ttlMs) {
      await redisClient.set(KEY_PREFIX + tokenHash, userId, 'PX', Math.max(1, Math.floor(ttlMs)));
    },
    async consumeIfValid(tokenHash) {
      const value = await redisClient.eval(CONSUME_SCRIPT, 1, KEY_PREFIX + tokenHash);
      return value || null;
    },
    async close() {}
  };
}

// Resolved once per process, same lazy/cached-on-first-use shape as resolveRateLimitStore().
// Deliberately reuses resolveRedisClient() rather than opening a second ioredis connection - one
// shared client per process, same production posture (REDIS_URL required, checked at pattern-ai
// startup) rate-limit.mjs already enforces.
let cachedLeaseStore = null;
export function resolveRealtimeLeaseStore() {
  if (cachedLeaseStore) return cachedLeaseStore;
  const client = resolveRedisClient();
  cachedLeaseStore = client ? createRedisRealtimeLeaseStore(client) : createMemoryRealtimeLeaseStore();
  return cachedLeaseStore;
}

export function __setRealtimeLeaseStoreForTests(store) { cachedLeaseStore = store; }
export function __resetRealtimeLeaseStoreForTests() { cachedLeaseStore = null; }
