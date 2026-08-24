import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Same server-replica-backed pattern as tests/trades-sync.test.mjs and tests/patterns-sync.test.mjs.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function flush() { return new Promise((resolve) => setImmediate(resolve)); }

async function loadAccountsStore({ fetchImpl, currentUserId }) {
  const fetchCalls = [];
  const fetchFn = async (url, options) => { fetchCalls.push([url, options]); return fetchImpl ? fetchImpl(url, options) : { ok: false, status: 500 }; };
  const authState = currentUserId
    ? { authenticated: true, userId: currentUserId, user: { id: currentUserId }, csrfToken: 'test-csrf' }
    : { authenticated: false, userId: null, user: null, csrfToken: null };
  const sandbox = { window: { __NAVRYA_AUTH__: authState }, fetch: fetchFn };
  sandbox.window = Object.assign(sandbox.window, { dispatchEvent() {}, addEventListener() {} });
  vm.runInNewContext(await source('accounts.types.js'), sandbox, { filename: 'accounts.types.js' });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('accounts-store.js'), sandbox, { filename: 'accounts-store.js' });
  return { store: sandbox.window.TradeJournalAccountsStore, replica: sandbox.window.TradeJournalServerReplica, fetchCalls };
}

test('registers an accounts list domain with server-replica.js and hydrates it at load time', async () => {
  const { replica, fetchCalls } = await loadAccountsStore({ currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ accounts: [] }) }) });
  assert.ok(replica.domain('accounts'));
  await flush();
  assert.ok(fetchCalls.some((call) => call[0] === '/api/sync/accounts' && (!call[1] || !call[1].method)));
});

test('a brand-new account with nothing on the server starts genuinely empty', async () => {
  const { store } = await loadAccountsStore({ currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ accounts: [] }) }) });
  await flush();
  assert.equal(store.listSync().length, 0);
});

test('save() applies optimistically and returns synchronously, then POSTs the record in the background', async () => {
  const { store, fetchCalls } = await loadAccountsStore({
    currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ accounts: [] }) }
  });
  await flush();
  const draft = store.createDraft({ kind: 'prop', firm: 'Atlas Funding', startingBalance: 100000 });
  const saved = store.save(draft);
  assert.equal(saved.id, draft.id);
  assert.equal(store.listSync().length, 1, 'the optimistic write already applied before the network call resolves');
  await flush();
  const post = fetchCalls.find((call) => call[1] && call[1].method === 'POST');
  assert.equal(post[0], '/api/sync/accounts');
  assert.equal(JSON.parse(post[1].body).firm, 'Atlas Funding');
});

test('a failed save() rolls back the optimistic write', async () => {
  const { store } = await loadAccountsStore({
    currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ accounts: [] }) }
  });
  await flush();
  store.save(store.createDraft({ kind: 'prop', firm: 'Atlas Funding' }));
  await flush();
  assert.equal(store.listSync().length, 0);
});

test('remove() DELETEs the real record', async () => {
  const { store } = await loadAccountsStore({
    currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (options && options.method === 'DELETE') return { ok: true, status: 204 };
      return { ok: true, json: async () => ({ accounts: [{ id: 'acc-1', kind: 'prop', firm: 'Atlas' }] }) };
    }
  });
  await flush();
  assert.equal(store.listSync().length, 1);
  store.remove('acc-1');
  await flush();
  assert.equal(store.listSync().length, 0);
});

test('listActive() excludes archived accounts; listSync() still includes them (history is never hidden entirely)', async () => {
  const { store } = await loadAccountsStore({
    currentUserId: 'user-1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ accounts: [{ id: 'acc-1', kind: 'prop', firm: 'Live', status: 'active' }, { id: 'acc-2', kind: 'prop', firm: 'Breached', status: 'archived' }] }) })
  });
  await flush();
  assert.equal(store.listSync().length, 2);
  assert.equal(store.listActive().length, 1);
  assert.equal(store.listActive()[0].id, 'acc-1');
});

test('a new account\'s rules normalize by kind - a prop account never carries personal-only fields and vice versa', async () => {
  const { store } = await loadAccountsStore({ currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ accounts: [] }) }) });
  await flush();
  const prop = store.createDraft({ kind: 'prop' });
  assert.equal(prop.rules.kind, 'prop');
  assert.ok('profitTargetPercent' in prop.rules);
  assert.ok(!('dailyLossCap' in prop.rules));

  const personal = store.createDraft({ kind: 'personal' });
  assert.equal(personal.rules.kind, 'personal');
  assert.ok('dailyLossCap' in personal.rules);
  assert.ok(!('profitTargetPercent' in personal.rules));
});

// Regression test for a real bug caught via browser testing: accountsView.jsx's manToAccount()
// used to build `{ id: existing ? existing.id : undefined, ... }` for a brand-new account. That
// explicit `id: undefined` own property survives normalize()'s Object.assign(base, src) - it
// clobbers the fresh id empty() already generated - and JSON.stringify() then silently drops the
// now-undefined `id` key from the POST body entirely, so /api/sync/accounts rejected every create
// with 400 VALIDATION_FAILED. The UI showed "Saving to the server failed" and no account was ever
// created. Fixed two ways: the actual caller no longer emits `id: undefined` at all, and
// normalize() itself now re-checks `base.id` after the Object.assign as a defense-in-depth net.
test('createDraft()/normalize() always produce a real id, even if the seed carries an explicit id:undefined own property', async () => {
  const { store } = await loadAccountsStore({ currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ accounts: [] }) }) });
  await flush();
  const draft = store.createDraft({ id: undefined, kind: 'prop', firm: 'Atlas Test Funding' });
  assert.equal(typeof draft.id, 'string');
  assert.ok(draft.id.length > 0);
  assert.notEqual(draft.id, 'undefined');
});

test('a brand-new account created with no id key at all (the real UI\'s own seed shape) POSTs a real id and succeeds', async () => {
  const posted = [];
  const { store } = await loadAccountsStore({
    currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (options && options.method === 'POST') { posted.push(JSON.parse(options.body)); return { ok: true, json: async () => JSON.parse(options.body) }; }
      return { ok: true, json: async () => ({ accounts: [] }) };
    }
  });
  await flush();
  const draft = store.createDraft({ kind: 'prop', firm: 'Atlas Test Funding', startingBalance: 100000 });
  const saved = store.save(draft);
  assert.equal(typeof saved.id, 'string');
  await flush();
  assert.equal(posted.length, 1, 'the account must actually be POSTed, not silently dropped');
  assert.equal(typeof posted[0].id, 'string', 'the POST body must carry a real id, never an omitted/undefined one');
  assert.equal(store.listSync().length, 1);
});

test('maskNumber() only ever keeps the last 4 digits - the full account number never round-trips', async () => {
  const { store } = await loadAccountsStore({ currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ accounts: [] }) }) });
  await flush();
  const draft = store.createDraft({ kind: 'prop', firm: 'Atlas', numberMasked: '40024172' });
  assert.equal(draft.numberMasked, '••••4172');
});

test('accounts-store.js loads before the final per-character bundle on all four character pages, and after server-replica.js', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const replicaIndex = html.indexOf('<script src="../shared/server-replica.js">');
    const storeIndex = html.indexOf('<script src="../shared/accounts-store.js">');
    assert.ok(replicaIndex > -1, character + ': server-replica.js present');
    assert.ok(storeIndex > -1, character + ': accounts-store.js present');
    assert.ok(replicaIndex < storeIndex, character + ': server-replica.js loads before accounts-store.js');
  }
});
