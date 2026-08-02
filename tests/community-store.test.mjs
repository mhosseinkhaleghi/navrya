import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

async function storeSandbox(fetchImpl, switcherOverrides) {
  const sandbox = { window: {}, fetch: fetchImpl, encodeURIComponent, JSON };
  sandbox.window = Object.assign(sandbox.window, {
    fetch: fetchImpl,
    TradeJournalDevUserSwitcher: Object.assign({ currentUserId: () => 'user-1', ensureUser: () => Promise.resolve('user-1') }, switcherOverrides || {})
  });
  vm.runInNewContext(await source('community-store.js'), sandbox, { filename: 'community-store.js' });
  return sandbox.window.TradeJournalCommunityStore;
}

test('every request calls ensureUser() first and attaches x-dev-user-id from the switcher', async () => {
  const calls = [];
  let ensureCalled = false;
  const store = await storeSandbox(
    async (url, options) => { calls.push({ url, headers: options.headers }); return { ok: true, json: async () => ({ posts: [], nextBefore: null }) }; },
    { currentUserId: () => 'user-42', ensureUser: () => { ensureCalled = true; return Promise.resolve('user-42'); } }
  );
  await store.listPosts({ limit: 10 });
  assert.ok(ensureCalled, 'ensureUser() must be awaited before the request fires');
  assert.equal(calls[0].headers['x-dev-user-id'], 'user-42');
  assert.equal(calls[0].url, '/api/community/posts?limit=10');
});

test('a non-ok response with an {error} body surfaces as a thrown Error carrying .status and .code', async () => {
  const store = await storeSandbox(async () => ({ ok: false, status: 409, json: async () => ({ error: 'ALREADY_PURCHASED' }) }));
  await assert.rejects(
    () => store.purchaseListing('listing-1'),
    (error) => error.message === 'ALREADY_PURCHASED' && error.status === 409 && error.code === 'ALREADY_PURCHASED'
  );
});

test('a non-ok response with no parseable JSON body still throws a usable error rather than crashing', async () => {
  const store = await storeSandbox(async () => ({ ok: false, status: 500, json: async () => { throw new Error('not json'); } }));
  await assert.rejects(() => store.getListing('listing-1'), (error) => error.message === 'COMMUNITY_REQUEST_FAILED');
});

test('findListingBySource treats a 404 as "not listed yet" (null), not an error', async () => {
  const store = await storeSandbox(async () => ({ ok: false, status: 404, json: async () => ({ error: 'LISTING_NOT_FOUND' }) }));
  const result = await store.findListingBySource('pattern-1');
  assert.equal(result, null);
});

test('query params are only appended for defined, non-empty values', async () => {
  let seenUrl = null;
  const store = await storeSandbox(async (url) => { seenUrl = url; return { ok: true, json: async () => ([]) }; });
  await store.listListings({ type: undefined, limit: null, before: '' });
  assert.equal(seenUrl, '/api/marketplace/listings');
  await store.listListings({ type: 'pattern' });
  assert.equal(seenUrl, '/api/marketplace/listings?type=pattern');
});
