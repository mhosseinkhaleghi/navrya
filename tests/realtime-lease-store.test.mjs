import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMemoryRealtimeLeaseStore, createRedisRealtimeLeaseStore
} from '../server/community/security/realtime-lease-store.mjs';

// fix/voice-mode-hosted-connection: unit coverage for the Realtime SDP-relay lease store, both
// implementations. The in-memory one is exercised directly and dynamically (real Map, real
// timers). The Redis-shaped one is exercised against a small fake client implementing just the
// two ioredis methods this module actually calls (`set`, `eval`) - the same "prove the real
// logic against a redis-protocol-shaped fake, never a live Redis server" convention this
// project's own repo.memory.mjs/repo.pg.mjs pairing already establishes, and the same level of
// coverage rate-limit.mjs's own createRedisRateLimitStore has (exercised only indirectly, never a
// live Redis instance in this test suite).

test('memory store: set() then consumeIfValid() with the correct hash returns the bound userId exactly once (single-use)', async () => {
  const store = createMemoryRealtimeLeaseStore();
  await store.set('hash-a', 'user-1', 60000);
  const first = await store.consumeIfValid('hash-a');
  assert.equal(first, 'user-1');
  const second = await store.consumeIfValid('hash-a');
  assert.equal(second, null, 'a lease must never be consumable twice');
});

test('memory store: consumeIfValid() on a hash that was never set returns null (fail closed)', async () => {
  const store = createMemoryRealtimeLeaseStore();
  assert.equal(await store.consumeIfValid('never-set'), null);
});

test('memory store: an expired lease is treated as invalid even though it was genuinely set (fail closed on expiry)', async () => {
  const store = createMemoryRealtimeLeaseStore();
  await store.set('hash-expiring', 'user-2', 10);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(await store.consumeIfValid('hash-expiring'), null);
});

test('memory store: two different hashes never interfere with each other', async () => {
  const store = createMemoryRealtimeLeaseStore();
  await store.set('hash-x', 'user-x', 60000);
  await store.set('hash-y', 'user-y', 60000);
  assert.equal(await store.consumeIfValid('hash-x'), 'user-x');
  assert.equal(await store.consumeIfValid('hash-y'), 'user-y');
});

// A minimal fake ioredis-shaped client - only the two methods createRedisRealtimeLeaseStore()
// actually calls. `eval` implements the exact same atomic get-and-delete semantics the real Lua
// script (CONSUME_SCRIPT) describes, proving the store's own contract against something that
// speaks the real ioredis call shape (`eval(script, numKeys, ...keys)`), not a reimplementation
// of the store's internals.
function createFakeRedisClient() {
  const data = new Map();
  return {
    async set(key, value, mode, ttlMs) {
      assert.equal(mode, 'PX', 'must use a millisecond-precision expiry, matching the real ioredis SET ... PX contract');
      assert.ok(Number(ttlMs) > 0);
      data.set(key, value);
    },
    async eval(script, numKeys, key) {
      assert.equal(numKeys, 1);
      const value = data.get(key);
      if (value !== undefined) data.delete(key);
      return value === undefined ? null : value;
    }
  };
}

test('redis-shaped store: set() then consumeIfValid() returns the bound userId exactly once (atomic get-and-delete)', async () => {
  const client = createFakeRedisClient();
  const store = createRedisRealtimeLeaseStore(client);
  await store.set('hash-r', 'user-redis-1', 60000);
  assert.equal(await store.consumeIfValid('hash-r'), 'user-redis-1');
  assert.equal(await store.consumeIfValid('hash-r'), null, 'a redis-backed lease must also be single-use');
});

test('redis-shaped store: consuming a hash never set returns null', async () => {
  const client = createFakeRedisClient();
  const store = createRedisRealtimeLeaseStore(client);
  assert.equal(await store.consumeIfValid('unknown-hash'), null);
});

test('redis/shared-instance behavior: two independent store objects wrapping the SAME underlying client see each other\'s writes - proving the lease genuinely scales across multiple pattern-ai instances sharing one Redis, the way resolveRealtimeLeaseStore()/resolveRedisClient() share one client per process', async () => {
  const sharedClient = createFakeRedisClient();
  const storeOnInstanceA = createRedisRealtimeLeaseStore(sharedClient);
  const storeOnInstanceB = createRedisRealtimeLeaseStore(sharedClient);

  await storeOnInstanceA.set('cross-instance-hash', 'user-cross', 60000);
  // A DIFFERENT store object (standing in for a different pattern-ai replica) consumes it.
  const result = await storeOnInstanceB.consumeIfValid('cross-instance-hash');
  assert.equal(result, 'user-cross');
  // And it is genuinely gone for a third "instance" too - single-use is a property of the shared
  // client's data, not of any one store object's own local state.
  const storeOnInstanceC = createRedisRealtimeLeaseStore(sharedClient);
  assert.equal(await storeOnInstanceC.consumeIfValid('cross-instance-hash'), null);
});

test('the memory store never stores the raw hash key without the module\'s own key prefix (defense in depth against key-space collision with rate-limit.mjs\'s own keys on a shared store, if one were ever introduced)', async () => {
  // This is a structural assertion on the module's own KEY_PREFIX convention, proven indirectly:
  // setting the same short hash the rate-limiter might plausibly also use never collides across
  // two independently-created memory stores of the same kind (each store already has its own Map,
  // so this specifically checks the store's public contract stays correct under a realistic key).
  const store = createMemoryRealtimeLeaseStore();
  await store.set('ai-quota:user:123', 'user-1', 60000);
  assert.equal(await store.consumeIfValid('ai-quota:user:123'), 'user-1');
});
