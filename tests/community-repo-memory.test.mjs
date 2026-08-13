import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

async function seedUsers(repo, names) {
  const users = [];
  for (const name of names) users.push(await repo.users.create({ displayName: name }));
  return users;
}

test('purchases: a buyer cannot purchase the same listing twice', async () => {
  const repo = createMemoryRepo();
  const [seller, buyer] = await seedUsers(repo, ['Seller', 'Buyer']);
  const listing = await repo.listings.create({ sellerId: seller.id, type: 'pattern', sourceId: 'p-1', title: 'Breakout', priceAmount: 10, previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString() });
  const first = await repo.purchases.create({ listingId: listing.id, buyerId: buyer.id, priceAtPurchase: 10 });
  assert.equal(first.mock, true, 'every purchase is recorded as mock:true');
  await assert.rejects(
    () => repo.purchases.create({ listingId: listing.id, buyerId: buyer.id, priceAtPurchase: 10 }),
    (error) => error.code === 'ALREADY_PURCHASED' && error.status === 409
  );
});

test('purchases: a seller cannot purchase their own listing', async () => {
  const repo = createMemoryRepo();
  const [seller] = await seedUsers(repo, ['Seller']);
  const listing = await repo.listings.create({ sellerId: seller.id, type: 'strategy', sourceId: 's-1', title: 'London breakout', priceAmount: 5, previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString() });
  await assert.rejects(
    () => repo.purchases.create({ listingId: listing.id, buyerId: seller.id, priceAtPurchase: 5 }),
    (error) => error.code === 'CANNOT_PURCHASE_OWN_LISTING' && error.status === 400
  );
});

test('ratings: require a prior purchase, and can only be left once per buyer/listing', async () => {
  const repo = createMemoryRepo();
  const [seller, buyer] = await seedUsers(repo, ['Seller', 'Buyer']);
  const listing = await repo.listings.create({ sellerId: seller.id, type: 'pattern', sourceId: 'p-2', title: 'Reversal', priceAmount: 0, previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString() });

  await assert.rejects(
    () => repo.ratings.create({ listingId: listing.id, buyerId: buyer.id, rating: 5 }),
    (error) => error.code === 'PURCHASE_REQUIRED' && error.status === 403
  );

  await repo.purchases.create({ listingId: listing.id, buyerId: buyer.id, priceAtPurchase: 0 });
  const rating = await repo.ratings.create({ listingId: listing.id, buyerId: buyer.id, rating: 4, reviewText: 'Solid' });
  assert.equal(rating.rating, 4);

  await assert.rejects(
    () => repo.ratings.create({ listingId: listing.id, buyerId: buyer.id, rating: 2 }),
    (error) => error.code === 'ALREADY_RATED' && error.status === 409
  );
});

test('ratings: out-of-range values are rejected even after a valid purchase', async () => {
  const repo = createMemoryRepo();
  const [seller, buyer] = await seedUsers(repo, ['Seller', 'Buyer']);
  const listing = await repo.listings.create({ sellerId: seller.id, type: 'pattern', sourceId: 'p-3', title: 'Flag', priceAmount: 0, previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString() });
  await repo.purchases.create({ listingId: listing.id, buyerId: buyer.id, priceAtPurchase: 0 });
  await assert.rejects(() => repo.ratings.create({ listingId: listing.id, buyerId: buyer.id, rating: 6 }), (error) => error.code === 'VALIDATION_FAILED');
  await assert.rejects(() => repo.ratings.create({ listingId: listing.id, buyerId: buyer.id, rating: 0 }), (error) => error.code === 'VALIDATION_FAILED');
});

test('threads: findOrCreate is idempotent for the same listing/buyer pair, and rejects messaging your own listing', async () => {
  const repo = createMemoryRepo();
  const [seller, buyer] = await seedUsers(repo, ['Seller', 'Buyer']);
  const listing = await repo.listings.create({ sellerId: seller.id, type: 'strategy', sourceId: 's-2', title: 'Scalper', priceAmount: 20, previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString() });
  const first = await repo.threads.findOrCreate({ listingId: listing.id, buyerId: buyer.id });
  const second = await repo.threads.findOrCreate({ listingId: listing.id, buyerId: buyer.id });
  assert.equal(first.id, second.id, 'a second findOrCreate for the same buyer/listing returns the same thread, not a duplicate');
  assert.equal(first.sellerId, seller.id, 'sellerId is derived from the listing, not passed by the caller');

  await assert.rejects(
    () => repo.threads.findOrCreate({ listingId: listing.id, buyerId: seller.id }),
    (error) => error.code === 'CANNOT_MESSAGE_OWN_LISTING' && error.status === 400
  );
});

test('threads: the counterpartyId (listing-less) path is idempotent from either direction and rejects self-messaging', async () => {
  const repo = createMemoryRepo();
  const [userA, userB] = await seedUsers(repo, ['GeneralA', 'GeneralB']);

  await assert.rejects(
    () => repo.threads.findOrCreate({ buyerId: userA.id, counterpartyId: userA.id }),
    (error) => error.code === 'CANNOT_MESSAGE_SELF' && error.status === 400
  );

  const fromA = await repo.threads.findOrCreate({ buyerId: userA.id, counterpartyId: userB.id });
  assert.equal(fromA.listingId, null);
  const fromB = await repo.threads.findOrCreate({ buyerId: userB.id, counterpartyId: userA.id });
  assert.equal(fromA.id, fromB.id, 'either participant finding-or-creating resolves to the same general thread');

  const listing = await repo.listings.create({ sellerId: userB.id, type: 'pattern', sourceId: 'p-general', title: 'Range', priceAmount: 0, previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString() });
  const listingThread = await repo.threads.findOrCreate({ listingId: listing.id, buyerId: userA.id });
  assert.notEqual(listingThread.id, fromA.id, 'a listing-anchored thread between the same two users stays a separate record');
});

test('likes: creating twice for the same post/user is idempotent, and remove()/listByPost() behave', async () => {
  const repo = createMemoryRepo();
  const [author, liker] = await seedUsers(repo, ['LikeAuthor', 'Liker']);
  const post = await repo.posts.create({ userId: author.id, content: 'like me', images: [] });

  const first = await repo.likes.create({ postId: post.id, userId: liker.id });
  const second = await repo.likes.create({ postId: post.id, userId: liker.id });
  assert.equal(first.id, second.id, 'liking twice returns the existing like, not a duplicate row');
  assert.equal((await repo.likes.listByPost(post.id)).length, 1);

  assert.ok(await repo.likes.find(post.id, liker.id));
  await repo.likes.remove(post.id, liker.id);
  assert.equal(await repo.likes.find(post.id, liker.id), null);
  assert.equal((await repo.likes.listByPost(post.id)).length, 0);
});

test('reports: accepts all four target types when the target actually exists, and rejects an unknown type or a missing target', async () => {
  const repo = createMemoryRepo();
  const [reporter, author] = await seedUsers(repo, ['Reporter', 'Author']);
  const post = await repo.posts.create({ userId: author.id, content: 'hello', images: [] });
  const comment = await repo.comments.create({ postId: post.id, userId: author.id, content: 'a reply' });
  const listing = await repo.listings.create({ sellerId: author.id, type: 'pattern', sourceId: 'p-4', title: 'Wedge', priceAmount: 0, previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString() });
  const thread = await repo.threads.findOrCreate({ listingId: listing.id, buyerId: reporter.id });
  const message = await repo.messages.create({ threadId: thread.id, senderId: reporter.id, content: 'hi' });

  const targets = [['post', post.id], ['comment', comment.id], ['listing', listing.id], ['message', message.id]];
  for (const [targetType, targetId] of targets) {
    const report = await repo.reports.create({ targetType, targetId, reporterId: reporter.id, reason: 'spam' });
    assert.equal(report.status, 'open');
    assert.equal(report.targetType, targetType);
  }

  await assert.rejects(
    () => repo.reports.create({ targetType: 'not-a-type', targetId: post.id, reporterId: reporter.id, reason: 'x' }),
    (error) => error.code === 'INVALID_TARGET_TYPE'
  );
  await assert.rejects(
    () => repo.reports.create({ targetType: 'post', targetId: 'missing-post', reporterId: reporter.id, reason: 'x' }),
    (error) => error.code === 'TARGET_NOT_FOUND'
  );
});

test('posts: only the author can delete their own post', async () => {
  const repo = createMemoryRepo();
  const [author, someoneElse] = await seedUsers(repo, ['Author', 'Someone']);
  const post = await repo.posts.create({ userId: author.id, content: 'mine', images: [] });
  await assert.rejects(() => repo.posts.remove(post.id, someoneElse.id), (error) => error.code === 'NOT_POST_OWNER' && error.status === 403);
  await repo.posts.remove(post.id, author.id);
  assert.equal(await repo.posts.get(post.id), null);
});
