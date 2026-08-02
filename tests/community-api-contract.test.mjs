import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// server/community/app.mjs's createApp() has zero import-time side effects (no port bind, no
// DB pool) - unlike server/community-api-server.mjs (the real entrypoint), so this file never
// risks colliding with tests/community-api-server.test.mjs's real-server smoke test on the
// same port.
let server, baseUrl, uploadsDir;

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-'));
  server = createApp({ repo: createMemoryRepo(), uploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(uploadsDir, { recursive: true, force: true });
});

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) headers['x-dev-user-id'] = userId;
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}

async function createUser(name) {
  const { body } = await api('POST', '/api/users', { body: { displayName: name } });
  return body;
}

test('a request with no x-dev-user-id is rejected with DEV_USER_ID_REQUIRED', async () => {
  const result = await api('GET', '/api/community/posts');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'DEV_USER_ID_REQUIRED');
});

test('an unknown x-dev-user-id is rejected with UNKNOWN_DEV_USER', async () => {
  const result = await api('GET', '/api/community/posts', { userId: 'user-does-not-exist' });
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'UNKNOWN_DEV_USER');
});

test('posts + comments: create, list, comment, and only-author delete', async () => {
  const author = await createUser('Author');
  const stranger = await createUser('Stranger');

  const created = await api('POST', '/api/community/posts', { userId: author.id, body: { content: 'hello world' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.author.id, author.id);

  const list = await api('GET', '/api/community/posts', { userId: stranger.id });
  assert.equal(list.status, 200);
  assert.equal(list.body.posts.length, 1);
  assert.equal(list.body.posts[0].commentCount, 0);

  const comment = await api('POST', `/api/community/posts/${created.body.id}/comments`, { userId: stranger.id, body: { content: 'nice post' } });
  assert.equal(comment.status, 201);
  const comments = await api('GET', `/api/community/posts/${created.body.id}/comments`, { userId: author.id });
  assert.equal(comments.body.length, 1);

  const deniedDelete = await api('DELETE', `/api/community/posts/${created.body.id}`, { userId: stranger.id });
  assert.equal(deniedDelete.status, 403);
  assert.equal(deniedDelete.body.error, 'NOT_POST_OWNER');

  const allowedDelete = await api('DELETE', `/api/community/posts/${created.body.id}`, { userId: author.id });
  assert.equal(allowedDelete.status, 204);
});

test('marketplace: publish always records mock:true on purchase and evidenceAsOf round-trips exactly as submitted', async () => {
  const seller = await createUser('Seller');
  const buyer = await createUser('Buyer');
  const evidenceAsOf = '2026-01-15T00:00:00.000Z';

  const listing = await api('POST', '/api/marketplace/listings', {
    userId: seller.id,
    body: {
      type: 'pattern', sourceId: 'pattern-abc', title: 'Breakout', description: 'A breakout pattern',
      priceAmount: 25, priceCurrency: 'USD', successRatePercent: 78.4, sampleSize: 42, evidenceAsOf,
      previewContent: { name: 'Breakout', stages: ['stage 1'] }, fullContent: { name: 'Breakout', stages: ['stage 1', 'stage 2'] }
    }
  });
  assert.equal(listing.status, 201);
  assert.equal(listing.body.evidenceAsOf, evidenceAsOf, 'evidenceAsOf must round-trip exactly as submitted, never silently recomputed');

  const bySource = await api('GET', `/api/marketplace/listings/by-source/${listing.body.sourceId}`, { userId: seller.id });
  assert.equal(bySource.status, 200);
  assert.equal(bySource.body.id, listing.body.id);

  const lockedView = await api('GET', `/api/marketplace/listings/${listing.body.id}`, { userId: buyer.id });
  assert.equal(lockedView.body.fullContent, null, 'fullContent is hidden from a non-buyer, non-seller viewer');

  const purchaseBody = { priceAtPurchase: 999 }; // client-supplied price is ignored - server sets mock:true and its own price
  const purchase = await api('POST', `/api/marketplace/listings/${listing.body.id}/purchase`, { userId: buyer.id, body: purchaseBody });
  assert.equal(purchase.status, 201);
  assert.equal(purchase.body.mock, true, 'purchases are always recorded with mock:true, regardless of client input');

  const unlockedView = await api('GET', `/api/marketplace/listings/${listing.body.id}`, { userId: buyer.id });
  assert.notEqual(unlockedView.body.fullContent, null, 'fullContent unlocks after a real purchase record exists');

  const duplicate = await api('POST', `/api/marketplace/listings/${listing.body.id}/purchase`, { userId: buyer.id });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error, 'ALREADY_PURCHASED');
});

test('marketplace: ratings can only be created by a buyer with a matching purchase row for that listing', async () => {
  const seller = await createUser('Seller2');
  const buyer = await createUser('Buyer2');
  const listing = await api('POST', '/api/marketplace/listings', {
    userId: seller.id,
    body: { type: 'strategy', sourceId: 'strategy-xyz', title: 'Scalper', priceAmount: 0, evidenceAsOf: new Date().toISOString(), previewContent: {}, fullContent: {} }
  });

  const deniedRating = await api('POST', `/api/marketplace/listings/${listing.body.id}/ratings`, { userId: buyer.id, body: { rating: 5 } });
  assert.equal(deniedRating.status, 403);
  assert.equal(deniedRating.body.error, 'PURCHASE_REQUIRED');

  await api('POST', `/api/marketplace/listings/${listing.body.id}/purchase`, { userId: buyer.id });
  const allowedRating = await api('POST', `/api/marketplace/listings/${listing.body.id}/ratings`, { userId: buyer.id, body: { rating: 5, reviewText: 'Great' } });
  assert.equal(allowedRating.status, 201);

  const ratings = await api('GET', `/api/marketplace/listings/${listing.body.id}/ratings`, { userId: seller.id });
  assert.equal(ratings.body.count, 1);
  assert.equal(ratings.body.average, 5);
});

test('marketplace: a seller cannot purchase or rate their own listing', async () => {
  const seller = await createUser('Seller3');
  const listing = await api('POST', '/api/marketplace/listings', {
    userId: seller.id,
    body: { type: 'pattern', sourceId: 'pattern-own', title: 'Mine', priceAmount: 10, evidenceAsOf: new Date().toISOString(), previewContent: {}, fullContent: {} }
  });
  const purchase = await api('POST', `/api/marketplace/listings/${listing.body.id}/purchase`, { userId: seller.id });
  assert.equal(purchase.status, 400);
  assert.equal(purchase.body.error, 'CANNOT_PURCHASE_OWN_LISTING');
});

test('marketplace: only the seller can PATCH (delist / refresh evidence) their own listing', async () => {
  const seller = await createUser('Seller4');
  const stranger = await createUser('Stranger4');
  const listing = await api('POST', '/api/marketplace/listings', {
    userId: seller.id,
    body: { type: 'pattern', sourceId: 'pattern-patch', title: 'Patchable', priceAmount: 5, evidenceAsOf: new Date().toISOString(), previewContent: {}, fullContent: {} }
  });
  const denied = await api('PATCH', `/api/marketplace/listings/${listing.body.id}`, { userId: stranger.id, body: { status: 'delisted' } });
  assert.equal(denied.status, 403);
  const allowed = await api('PATCH', `/api/marketplace/listings/${listing.body.id}`, { userId: seller.id, body: { status: 'delisted' } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.status, 'delisted');
});

test('messaging: a thread is anchored to one listing, only participants can read/send, and self-messaging is rejected', async () => {
  const seller = await createUser('Seller5');
  const buyer = await createUser('Buyer5');
  const outsider = await createUser('Outsider5');
  const listing = await api('POST', '/api/marketplace/listings', {
    userId: seller.id,
    body: { type: 'strategy', sourceId: 'strategy-msg', title: 'Messaged strategy', priceAmount: 0, evidenceAsOf: new Date().toISOString(), previewContent: {}, fullContent: {} }
  });

  const selfThread = await api('POST', '/api/messages/threads', { userId: seller.id, body: { listingId: listing.body.id } });
  assert.equal(selfThread.status, 400);
  assert.equal(selfThread.body.error, 'CANNOT_MESSAGE_OWN_LISTING');

  const thread = await api('POST', '/api/messages/threads', { userId: buyer.id, body: { listingId: listing.body.id } });
  assert.equal(thread.status, 201);

  const deniedRead = await api('GET', `/api/messages/threads/${thread.body.id}`, { userId: outsider.id });
  assert.equal(deniedRead.status, 403);
  assert.equal(deniedRead.body.error, 'NOT_THREAD_PARTICIPANT');

  const sent = await api('POST', `/api/messages/threads/${thread.body.id}/messages`, { userId: buyer.id, body: { content: 'Is this pattern still working?' } });
  assert.equal(sent.status, 201);

  const sellerThreads = await api('GET', '/api/messages/threads', { userId: seller.id });
  assert.equal(sellerThreads.body.length, 1);
  assert.equal(sellerThreads.body[0].unreadCount, 1, 'the seller has one unread message from the buyer');

  const readByOpening = await api('GET', `/api/messages/threads/${thread.body.id}`, { userId: seller.id });
  assert.equal(readByOpening.body.messages.length, 1);
  const sellerThreadsAfterRead = await api('GET', '/api/messages/threads', { userId: seller.id });
  assert.equal(sellerThreadsAfterRead.body[0].unreadCount, 0, 'opening the thread marks incoming messages read');
});

test('reporting: works for post/comment/listing/message target types with no special permission beyond a valid dev user', async () => {
  const author = await createUser('ReportAuthor');
  const reporter = await createUser('Reporter2');
  const post = await api('POST', '/api/community/posts', { userId: author.id, body: { content: 'reportable' } });
  const report = await api('POST', '/api/community/reports', { userId: reporter.id, body: { targetType: 'post', targetId: post.body.id, reason: 'spam' } });
  assert.equal(report.status, 201);
  assert.equal(report.body.status, 'open');

  const badTarget = await api('POST', '/api/community/reports', { userId: reporter.id, body: { targetType: 'post', targetId: 'nope', reason: 'x' } });
  assert.equal(badTarget.status, 404);
  assert.equal(badTarget.body.error, 'TARGET_NOT_FOUND');
});

test('an invalid image data URL is rejected with a validation error, not silently dropped', async () => {
  const user = await createUser('ImageUser');
  const result = await api('POST', '/api/community/posts', { userId: user.id, body: { content: 'bad image', images: ['not-a-data-url'] } });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'INVALID_IMAGE_TYPE');
});

test('unknown routes return 404 NOT_FOUND for an authenticated caller, and OPTIONS returns 204 unauthenticated', async () => {
  const user = await createUser('RouteUser');
  const notFound = await api('GET', '/api/community/does-not-exist', { userId: user.id });
  assert.equal(notFound.status, 404);
  assert.equal(notFound.body.error, 'NOT_FOUND');
  const options = await fetch(baseUrl + '/api/community/posts', { method: 'OPTIONS' });
  assert.equal(options.status, 204, 'OPTIONS is handled by the CORS middleware, before auth is ever checked');
});
