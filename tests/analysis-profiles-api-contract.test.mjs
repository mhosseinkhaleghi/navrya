import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Analysis Profiles domain (see ARCHITECTURE.md §7.25). Mirrors
// tests/session-signatures-api-contract.test.mjs's own harness exactly (no uploads dir needed -
// this domain has no images route, same as session-signatures).
let server, baseUrl, repo;

before(async () => {
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: process.cwd() }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }

function sampleProfile(id, overrides) {
  return Object.assign({
    id, name: 'Price Action — Structure & Momentum', description: 'How I usually read a chart.',
    primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: ['market_structure', 'momentum'],
    customMethodNotes: '', isDefault: false, isActive: true, registryVersion: 1
  }, overrides || {});
}

test('a request with no authenticated session is rejected with AUTH_SESSION_REQUIRED', async () => {
  const result = await api('GET', '/api/sync/analysis-profiles');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_SESSION_REQUIRED');
});

test('POST upserts a full profile and GET lists it back identically', async () => {
  const user = await createUser('Trader One');
  const created = await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile('ap-a') });
  assert.equal(created.status, 200);
  assert.equal(created.body.id, 'ap-a');
  assert.equal(created.body.primaryStyleId, 'price_action');
  assert.deepEqual(created.body.focusIds, ['market_structure', 'momentum']);

  const list = await api('GET', '/api/sync/analysis-profiles', { userId: user.id });
  assert.equal(list.status, 200);
  assert.equal(list.body.analysisProfiles.length, 1);
  assert.equal(list.body.analysisProfiles[0].name, 'Price Action — Structure & Momentum');
});

test('re-POSTing the same id is an idempotent upsert, not a duplicate', async () => {
  const user = await createUser('Trader Two');
  await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile('ap-b') });
  const changed = sampleProfile('ap-b', { description: 'Updated description.' });
  await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: changed });

  const list = await api('GET', '/api/sync/analysis-profiles', { userId: user.id });
  assert.equal(list.body.analysisProfiles.length, 1);
  assert.equal(list.body.analysisProfiles[0].description, 'Updated description.');
});

test('GET /:id returns a single profile, 404s for an unknown id', async () => {
  const user = await createUser('Trader Three');
  await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile('ap-c') });
  const found = await api('GET', '/api/sync/analysis-profiles/ap-c', { userId: user.id });
  assert.equal(found.status, 200);
  assert.equal(found.body.id, 'ap-c');
  const missing = await api('GET', '/api/sync/analysis-profiles/not-real', { userId: user.id });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'ANALYSIS_PROFILE_NOT_FOUND');
});

test('DELETE removes a profile; a second DELETE of the same id is a safe no-op (204), never an error', async () => {
  const user = await createUser('Trader Four');
  await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile('ap-d') });
  const first = await api('DELETE', '/api/sync/analysis-profiles/ap-d', { userId: user.id });
  assert.equal(first.status, 204);
  const list = await api('GET', '/api/sync/analysis-profiles', { userId: user.id });
  assert.equal(list.body.analysisProfiles.length, 0);
  const second = await api('DELETE', '/api/sync/analysis-profiles/ap-d', { userId: user.id });
  assert.equal(second.status, 204);
});

test('a record belonging to another user cannot be fetched, upserted, or deleted - cross-user isolation', async () => {
  const owner = await createUser('Owner');
  const stranger = await createUser('Stranger');
  await api('POST', '/api/sync/analysis-profiles', { userId: owner.id, body: sampleProfile('ap-owned') });

  const strangerGet = await api('GET', '/api/sync/analysis-profiles/ap-owned', { userId: stranger.id });
  assert.equal(strangerGet.status, 404, 'a stranger must not be able to read another user\'s profile');

  const strangerUpsert = await api('POST', '/api/sync/analysis-profiles', { userId: stranger.id, body: sampleProfile('ap-owned', { name: 'Hijacked' }) });
  assert.equal(strangerUpsert.status, 403);
  assert.equal(strangerUpsert.body.error, 'NOT_ANALYSIS_PROFILE_OWNER');

  const strangerDelete = await api('DELETE', '/api/sync/analysis-profiles/ap-owned', { userId: stranger.id });
  assert.equal(strangerDelete.status, 403);

  const ownerList = await api('GET', '/api/sync/analysis-profiles', { userId: owner.id });
  assert.equal(ownerList.body.analysisProfiles.length, 1, 'the real owner\'s record must be completely unaffected');
  assert.equal(ownerList.body.analysisProfiles[0].name, 'Price Action — Structure & Momentum');

  const strangerList = await api('GET', '/api/sync/analysis-profiles', { userId: stranger.id });
  assert.equal(strangerList.body.analysisProfiles.length, 0, 'a stranger\'s own list must never leak another user\'s data');
});

test('POST without an id is rejected with VALIDATION_FAILED', async () => {
  const user = await createUser('Trader Five');
  const result = await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: { name: 'No id' } });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'VALIDATION_FAILED');
});

test('setting isDefault:true clears any other profile that was previously the default for the same user, server-side', async () => {
  const user = await createUser('Trader Six');
  await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile('ap-e', { isDefault: true }) });
  await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile('ap-f', { isDefault: true }) });

  const list = await api('GET', '/api/sync/analysis-profiles', { userId: user.id });
  const defaults = list.body.analysisProfiles.filter((p) => p.isDefault);
  assert.equal(defaults.length, 1, 'exactly one profile must be flagged default, enforced server-side even if the client sends two');
  assert.equal(defaults[0].id, 'ap-f');
});

test('a different user setting their own default never affects another user\'s default profile', async () => {
  const alice = await createUser('Alice');
  const bob = await createUser('Bob');
  await api('POST', '/api/sync/analysis-profiles', { userId: alice.id, body: sampleProfile('alice-default', { isDefault: true }) });
  await api('POST', '/api/sync/analysis-profiles', { userId: bob.id, body: sampleProfile('bob-default', { isDefault: true }) });

  const aliceList = await api('GET', '/api/sync/analysis-profiles', { userId: alice.id });
  assert.equal(aliceList.body.analysisProfiles.filter((p) => p.isDefault).length, 1);
  assert.equal(aliceList.body.analysisProfiles[0].id, 'alice-default');
});

// customMethodLinks / customFocuses (066_analysis_profile_authoring.sql) - real HTTP round trip
// over the memory repo, server-side re-normalization on every write (never trusts the client
// alone), matching server/db/analysis-profile-normalize.mjs's own fixture tests.
test('customMethodLinks/customFocuses round-trip through POST/GET, and the server re-normalizes them - never trusts the client alone', async () => {
  const user = await createUser('Trader Seven');
  const created = await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile('ap-g', {
    customMethodLinks: { youtubeUrl: 'https://youtu.be/abc123', websiteUrl: 'javascript:alert(1)', referenceUrl: 'https://user:pw@example.com/' },
    customFocuses: [
      { id: 'cf-1', name: '  Swept liquidity levels  ', description: 'stop hunts', origin: 'user' },
      { id: 'cf-1', name: 'Duplicate id, must be dropped' },
      { id: 'not valid!', name: 'Invalid id, must be dropped' }
    ]
  }) });
  assert.equal(created.status, 200);
  assert.equal(created.body.customMethodLinks.youtubeUrl, 'https://youtu.be/abc123');
  assert.equal(created.body.customMethodLinks.websiteUrl, '', 'a javascript: URL must never be stored');
  assert.equal(created.body.customMethodLinks.referenceUrl, '', 'a URL with embedded credentials must never be stored');
  assert.equal(created.body.customFocuses.length, 1, 'the duplicate id and the invalid id must both be dropped server-side');
  assert.equal(created.body.customFocuses[0].name, 'Swept liquidity levels');

  const fetched = await api('GET', '/api/sync/analysis-profiles/ap-g', { userId: user.id });
  assert.deepEqual(fetched.body.customMethodLinks, created.body.customMethodLinks);
  assert.deepEqual(fetched.body.customFocuses, created.body.customFocuses);
});

test('omitting customMethodLinks/customFocuses on POST defaults them to the empty shape, never null/undefined - a pre-authoring-fields client keeps working unchanged', async () => {
  const user = await createUser('Trader Eight');
  const created = await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile('ap-h') });
  assert.deepEqual(created.body.customMethodLinks, { youtubeUrl: '', websiteUrl: '', referenceUrl: '' });
  assert.deepEqual(created.body.customFocuses, []);
});

// concepts / understanding (067_analysis_profile_memory.sql) - real HTTP round trip, server-side
// re-normalization on every write, matching the authoring-fields contract test above.
test('concepts/understanding round-trip through POST/GET, and the server re-normalizes them - never trusts the client alone', async () => {
  const user = await createUser('Trader Nine');
  const created = await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile('ap-i', {
    concepts: [
      { id: 'cpt-1', title: '  Swept liquidity levels  ', description: 'stop hunts', priority: 'mandatory', origin: 'user' },
      { id: 'cpt-1', title: 'Duplicate id, must be dropped' },
      { id: 'not valid!', title: 'Invalid id, must be dropped' },
      { id: 'cpt-2', title: 'Unknown priority', priority: 'urgent' }
    ],
    understanding: { summary: 'Reads price action first.', version: 2 }
  }) });
  assert.equal(created.status, 200);
  assert.equal(created.body.concepts.length, 2, 'the duplicate id and the invalid id must both be dropped server-side');
  assert.equal(created.body.concepts[0].title, 'Swept liquidity levels');
  assert.equal(created.body.concepts[0].priority, 'mandatory');
  assert.equal(created.body.concepts[1].priority, 'preferred', 'an unrecognized priority must fall back to preferred, never be stored as-is');
  assert.equal(created.body.understanding.summary, 'Reads price action first.');
  assert.equal(created.body.understanding.version, 2);

  const fetched = await api('GET', '/api/sync/analysis-profiles/ap-i', { userId: user.id });
  assert.deepEqual(fetched.body.concepts, created.body.concepts);
  assert.deepEqual(fetched.body.understanding, created.body.understanding);
});

test('omitting concepts/understanding on POST defaults them to the empty shape, never null/undefined - a pre-memory-fields client keeps working unchanged', async () => {
  const user = await createUser('Trader Ten');
  const created = await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile('ap-j') });
  assert.deepEqual(created.body.concepts, []);
  assert.deepEqual(created.body.understanding, { summary: '', version: 0, updatedAt: null });
});
