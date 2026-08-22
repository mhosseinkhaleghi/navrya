import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Phase 2 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global
// Data Sync section / the Phase 2 report). server-replica.js is the generic in-memory replica
// every migrated domain builds on - these tests cover the module itself, independent of any one
// domain (see tests/patterns-sync.test.mjs for a real domain's own integration coverage).
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}
function flush() { return new Promise((resolve) => setImmediate(resolve)); }

// registerListDomain()'s writeUrl/deleteUrlFor/hydrateUrl are just strings the module fetch()es -
// each test below supplies its own fetch implementation via a fresh sandbox instead of mutating
// a shared one, so tests never interfere with each other's in-flight per-record queues.
async function loadDomainWithFetch({ localStorage, token, fetchImpl, kind }) {
  if (token) localStorage.setItem('tradejournal:auth-token', token);
  const fetchCalls = [];
  const fetchFn = async (url, options) => { fetchCalls.push([url, options]); return fetchImpl(url, options); };
  const sandbox = {
    window: {}, localStorage, fetch: fetchFn,
    document: { body: { appendChild() {} }, documentElement: { lang: 'en' }, createElement: () => ({ setAttribute() {} }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {}, addEventListener() {} });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  const replica = sandbox.window.TradeJournalServerReplica;
  const domain = kind === 'document'
    ? replica.registerDocumentDomain('doc', { hydrateUrl: '/api/x', writeUrl: '/api/x', extractDoc: (body) => body.doc || null })
    : replica.registerListDomain('list', { hydrateUrl: '/api/y', writeUrl: '/api/y', deleteUrlFor: (id) => '/api/y/' + id, extractList: (body) => body.items || [] });
  return { replica, domain, fetchCalls, localStorage };
}

test('hydrate() with no auth token resolves without hydrating and without marking hydrated - never treated as "empty"', async () => {
  const { domain } = await loadDomainWithFetch({ localStorage: memoryStorage(), fetchImpl: async () => ({ ok: true, json: async () => ({ items: [] }) }) });
  await domain.hydrate();
  assert.equal(domain.isHydrated(), false, 'a boot gate must keep waiting, not treat this as a genuinely empty account');
});

test('hydrate() is idempotent - a second call does not fetch again', async () => {
  const { domain, fetchCalls } = await loadDomainWithFetch({ localStorage: memoryStorage(), token: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ items: [] }) }) });
  await domain.hydrate();
  await domain.hydrate();
  assert.equal(fetchCalls.length, 1);
});

test('a failed hydrate() marks hydrated (settled) with a real error, never a silent empty list', async () => {
  const { domain } = await loadDomainWithFetch({ localStorage: memoryStorage(), token: 'user-1', fetchImpl: async () => { throw new Error('network down'); } });
  await domain.hydrate();
  assert.equal(domain.isHydrated(), true);
  assert.ok(domain.hydrationError() instanceof Error);
  assert.equal(domain.list().length, 0);
});

test('two concurrent writes to DIFFERENT records never interfere with each other\'s state', async () => {
  const { domain } = await loadDomainWithFetch({
    localStorage: memoryStorage(), token: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ items: [] }) }
  });
  domain.upsert({ id: 'a', name: 'A' });
  domain.upsert({ id: 'b', name: 'B' });
  assert.equal(domain.list().length, 2, 'both optimistic applies land immediately');
  await flush();
  assert.equal(domain.list().length, 2);
  assert.ok(domain.find('a') && domain.find('b'));
});

test('create-then-immediately-save on the SAME record, both requests failing, correctly rolls all the way back to nothing - not to an intermediate unconfirmed state (the real bug this module\'s per-record write queue fixes)', async () => {
  const { domain } = await loadDomainWithFetch({ localStorage: memoryStorage(), token: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ items: [] }) } });
  domain.upsert({ id: 'x', name: '' });
  domain.upsert({ id: 'x', name: 'renamed' });
  assert.equal(domain.list().length, 1, 'both optimistic applies collapse to one record, as expected');
  await flush();
  assert.equal(domain.list().length, 0, 'neither write ever actually reached the server, so nothing should remain');
});

test('create-then-immediately-save on the SAME record, only the SECOND (real, final) write succeeding, ends up exactly at the second write\'s value', async () => {
  let call = 0;
  const { domain } = await loadDomainWithFetch({
    localStorage: memoryStorage(), token: 'user-1',
    fetchImpl: async (url, options) => {
      if (options && options.method === 'POST') { call += 1; return call === 1 ? { ok: false, status: 500 } : { ok: true, json: async () => JSON.parse(options.body) }; }
      return { ok: true, json: async () => ({ items: [] }) };
    }
  });
  domain.upsert({ id: 'x', name: 'first (will fail)' });
  domain.upsert({ id: 'x', name: 'second (will succeed)' });
  await flush();
  assert.equal(domain.list().length, 1);
  assert.equal(domain.find('x').name, 'second (will succeed)', 'the first write\'s failure must never clobber the second write\'s success');
});

test('a rolled-back write cannot resurrect a record a LATER write has already removed', async () => {
  const { domain } = await loadDomainWithFetch({
    localStorage: memoryStorage(), token: 'user-1',
    fetchImpl: async (url, options) => {
      if (options && options.method === 'POST') return { ok: false, status: 500 }; // the upsert always fails
      if (options && options.method === 'DELETE') return { ok: true, status: 204 }; // the remove always succeeds
      return { ok: true, json: async () => ({ items: [{ id: 'x', name: 'existing' }] }) };
    }
  });
  await domain.hydrate();
  domain.upsert({ id: 'x', name: 'edited (will fail)' });
  domain.remove('x'); // queued after the upsert for the same id - runs once the upsert has settled
  await flush();
  assert.equal(domain.find('x'), null, 'the later, successful remove must win - the earlier failed upsert\'s rollback must not bring the record back');
});

test('mutating a record object AFTER passing it to upsert() does not corrupt the replica\'s own stored copy or its rollback snapshot (deep clone, not a shared reference)', async () => {
  const { domain } = await loadDomainWithFetch({ localStorage: memoryStorage(), token: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ items: [] }) } });
  const record = { id: 'x', name: 'original', tags: ['a'] };
  domain.upsert(record);
  record.name = 'mutated after the call'; // simulates a domain store's own normalize() mutating its input in place
  record.tags.push('b');
  const stored = domain.find('x');
  assert.equal(stored.name, 'original', 'the replica must hold its own copy, unaffected by the caller mutating the original object afterward');
  // Objects/arrays built inside the vm sandbox belong to a different realm than this outer test
  // file's own [] literal, so a strict deepEqual fails on prototype identity alone even when the
  // content matches (the same cross-realm caveat tests/ai-settings-store.test.mjs already
  // documents) - compare via JSON instead.
  assert.equal(JSON.stringify(stored.tags), JSON.stringify(['a']));
});

test('list()/find() never return a live reference into the replica\'s own internal state - a caller mutating the returned object cannot corrupt it', async () => {
  const { domain } = await loadDomainWithFetch({ localStorage: memoryStorage(), token: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ items: [] }) } });
  domain.upsert({ id: 'x', name: 'original' });
  const got = domain.find('x');
  got.name = 'corrupted from outside';
  assert.equal(domain.find('x').name, 'original');
});

test('upsert() rejects and does not retain the change when there is no authenticated user, and rolls back the optimistic apply', async () => {
  const { domain } = await loadDomainWithFetch({ localStorage: memoryStorage(), fetchImpl: async () => { throw new Error('must never be called'); } }); // no token
  await assert.rejects(domain.upsert({ id: 'x', name: 'x' }));
  assert.equal(domain.list().length, 0);
});

test('a 404 on remove() is treated as success (already gone server-side), not rolled back', async () => {
  const { domain } = await loadDomainWithFetch({
    localStorage: memoryStorage(), token: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'DELETE') ? { ok: false, status: 404 } : { ok: true, json: async () => ({ items: [{ id: 'x', name: 'x' }] }) }
  });
  await domain.hydrate();
  await domain.remove('x'); // must not reject
  assert.equal(domain.find('x'), null);
});

// --- Document domain (Mental Health Profile's own shape) --------------------------------------

test('document domain: set() applies optimistically, rolls back on failure, and never persists to localStorage', async () => {
  const { domain, localStorage } = await loadDomainWithFetch({ localStorage: memoryStorage(), token: 'user-1', kind: 'document', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ doc: null }) } });
  await domain.hydrate();
  domain.set({ intake: { completed: true } }).catch(() => {});
  assert.equal(JSON.stringify(domain.get()), JSON.stringify({ intake: { completed: true } }));
  await flush();
  assert.equal(domain.get(), null, 'a failed write must roll back to the last known-good document');
  assert.equal(localStorage.length, 1, 'only the auth-token seed exists - the document itself is never written to localStorage');
});

test('document domain: mutating the object after set() does not retroactively change what was stored', async () => {
  const { domain } = await loadDomainWithFetch({ localStorage: memoryStorage(), token: 'user-1', kind: 'document', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ doc: null }) } });
  const doc = { intake: { completed: false } };
  domain.set(doc);
  doc.intake.completed = true;
  assert.equal(domain.get().intake.completed, false);
});

test('no localStorage key is ever written by this module for any domain, in any scenario', async () => {
  const localStorage = memoryStorage();
  const { domain } = await loadDomainWithFetch({ localStorage, token: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ items: [{ id: 'x' }] }) } });
  await domain.hydrate();
  domain.upsert({ id: 'y', name: 'y' });
  await flush();
  assert.equal(localStorage.length, 1, 'only the auth-token seed this test itself planted exists - server-replica.js never calls localStorage.setItem');
});
