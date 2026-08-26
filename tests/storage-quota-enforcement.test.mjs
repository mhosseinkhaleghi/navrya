import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';

// Commercial System Slice 2 - exercises storage-quota enforcement through the REAL upload
// endpoint (server/community/routes.patterns.mjs's /images), not just the underlying service
// functions - same real HTTP + memory-repo convention as accounts-api-contract.test.mjs.

let server, baseUrl, repo;

before(async () => {
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => invalidateCommercialConfigCache());

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const dataUrl = `data:image/png;base64,${tinyPngBase64}`;

test('an upload well within quota succeeds and increases server-authoritative usage', async () => {
  const user = await repo.users.create({ displayName: 'Trader' });
  const before = await api('GET', '/api/sync/storage', { userId: user.id });
  assert.equal(before.body.usedBytes, 0);

  const upload = await api('POST', '/api/sync/patterns/images', { userId: user.id, body: { dataUrl } });
  assert.equal(upload.status, 201);
  assert.match(upload.body.url, /^\/uploads\/pattern\//);

  const after = await api('GET', '/api/sync/storage', { userId: user.id });
  assert.ok(after.body.usedBytes > 0);
  assert.equal(after.body.quotaBytes, 104857600);
});

test('an upload that would exceed the quota is rejected with STORAGE_QUOTA_EXCEEDED and usage/quota/required details, never silently allowed', async () => {
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.commercialConfig.publish('plan:free:storageBytes', { bytes: 10 }, {}); // far smaller than any real image
  invalidateCommercialConfigCache();

  const upload = await api('POST', '/api/sync/patterns/images', { userId: user.id, body: { dataUrl } });
  assert.equal(upload.status, 403);
  assert.equal(upload.body.error, 'STORAGE_QUOTA_EXCEEDED');
  assert.equal(upload.body.quotaBytes, 10);
  assert.ok(upload.body.requiredBytes > 10);
  assert.equal(upload.body.usedBytes, 0);

  // This file shares one repo/server across every test - restore the global override so later
  // tests aren't affected by this one's deliberately tiny quota.
  await repo.commercialConfig.publish('plan:free:storageBytes', { bytes: 104857600 }, {});
  invalidateCommercialConfigCache();
});

test('being over quota blocks new uploads but never affects reading existing records', async () => {
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.instrumentCatalog.upsert(user.id, { id: 'instr-1', code: 'XAUUSD' });
  const uploaded = await api('POST', '/api/sync/patterns/images', { userId: user.id, body: { dataUrl } });
  await repo.patterns.upsert(user.id, { id: 'pattern-1', name: 'Existing', instruments: ['XAUUSD'], referenceScreenshots: [{ id: 'shot-1', imageUrl: uploaded.body.url }] });

  await repo.commercialConfig.publish('plan:free:storageBytes', { bytes: 1 }, {}); // now already over quota
  invalidateCommercialConfigCache();

  const secondUpload = await api('POST', '/api/sync/patterns/images', { userId: user.id, body: { dataUrl } });
  assert.equal(secondUpload.status, 403);

  const readBack = await api('GET', '/api/sync/patterns/pattern-1', { userId: user.id });
  assert.equal(readBack.status, 200);
  assert.equal(readBack.body.referenceScreenshots[0].imageUrl, uploaded.body.url);
});

test('a Plus subscriber gets the full 10 GB quota for the same upload path', async () => {
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.subscriptions.create({
    userId: user.id, planId: 'plus', status: 'active', provider: 'manual',
    currentPeriodStart: new Date().toISOString(), currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    priceAmountMicroUsd: 4990000, currency: 'USD'
  });
  const storageStatus = await api('GET', '/api/sync/storage', { userId: user.id });
  assert.equal(storageStatus.body.quotaBytes, 10737418240);
});
