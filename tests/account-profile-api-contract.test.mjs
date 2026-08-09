import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { testToken } from './helpers/auth-token.mjs';

let server, baseUrl, repo;

before(async () => {
  delete process.env.ADMIN_AUTH_ENFORCED;
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) headers['x-dev-user-id'] = testToken(userId);
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }

test('GET /api/users/me/profile requires auth and returns the fresh-user defaults plus a computed level', async () => {
  const anonymous = await api('GET', '/api/users/me/profile');
  assert.equal(anonymous.status, 401);

  const user = await createUser('Profile Tester');
  const result = await api('GET', '/api/users/me/profile', { userId: user.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.profileRole, 'trader');
  assert.equal(result.body.kycStatus, 'not_started');
  assert.equal(result.body.xpTotal, 0);
  assert.equal(result.body.level, 1);
});

test('PATCH /api/users/me/profile updates trader-editable fields and silently ignores kycStatus/xpTotal/role in the body', async () => {
  const user = await createUser('Editable');
  const result = await api('PATCH', '/api/users/me/profile', { userId: user.id, body: { displayName: 'New Name', email: 'x@y.com', profileRole: 'mentor', kycStatus: 'verified', xpTotal: 50000, role: 'admin' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.displayName, 'New Name');
  assert.equal(result.body.profileRole, 'mentor');
  assert.equal(result.body.kycStatus, 'not_started');
  assert.equal(result.body.xpTotal, 0);
});

test('PATCH /api/users/me/profile rejects an invalid profileRole and an empty displayName', async () => {
  const user = await createUser('Validator');
  const badRole = await api('PATCH', '/api/users/me/profile', { userId: user.id, body: { profileRole: 'wizard' } });
  assert.equal(badRole.status, 400);
  assert.equal(badRole.body.error, 'VALIDATION_FAILED');
  const emptyName = await api('PATCH', '/api/users/me/profile', { userId: user.id, body: { displayName: '   ' } });
  assert.equal(emptyName.status, 400);
});

test('GET /api/users/me/xp-events lists the current user\'s own events only', async () => {
  const user = await createUser('XP Lister');
  const other = await createUser('Someone Else');
  await repo.xpEvents.record({ userId: user.id, type: 'trade_closed', points: 5, meta: { tradeId: 't1' } });
  await repo.xpEvents.record({ userId: other.id, type: 'trade_closed', points: 5, meta: { tradeId: 't2' } });
  const result = await api('GET', '/api/users/me/xp-events', { userId: user.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].meta.tradeId, 't1');
});

test('POST /api/users/me/xp-events clamps points to the canonical maximum for that type, never trusting the client', async () => {
  const user = await createUser('XP Tester');
  const result = await api('POST', '/api/users/me/xp-events', { userId: user.id, body: { type: 'trade_closed', points: 999999, meta: { tradeId: 't1' } } });
  assert.equal(result.status, 201);
  assert.equal(result.body.xpTotal, 5, 'trade_closed caps at 5 XP regardless of what the client requested');
  assert.equal(result.body.level, 1);
});

test('POST /api/users/me/xp-events rejects an unknown type', async () => {
  const user = await createUser('XP Tester 2');
  const result = await api('POST', '/api/users/me/xp-events', { userId: user.id, body: { type: 'made_up_type', points: 1000 } });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'INVALID_XP_TYPE');
});

test('a once-per-user XP type is only ever awarded once - a repeat call is skipped, not double-awarded', async () => {
  const user = await createUser('Once Tester');
  const first = await api('POST', '/api/users/me/xp-events', { userId: user.id, body: { type: 'intake_completed', points: 15 } });
  assert.equal(first.status, 201);
  assert.equal(first.body.xpTotal, 15);
  const second = await api('POST', '/api/users/me/xp-events', { userId: user.id, body: { type: 'intake_completed', points: 15 } });
  assert.equal(second.status, 200);
  assert.equal(second.body.skipped, true);
  const profile = await api('GET', '/api/users/me/profile', { userId: user.id });
  assert.equal(profile.body.xpTotal, 15, 'xpTotal must not have grown from the skipped repeat');
});

test('POST /api/users/me/achievements/:key/unlock rejects an unknown achievement and insufficient evidence, grants XP on a real unlock', async () => {
  const user = await createUser('Achiever');
  const unknown = await api('POST', '/api/users/me/achievements/not_a_real_key/unlock', { userId: user.id, body: { evidence: {} } });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error, 'INVALID_ACHIEVEMENT');

  const insufficient = await api('POST', '/api/users/me/achievements/ten_trades_closed/unlock', { userId: user.id, body: { evidence: { tradeIds: ['t1', 't2'] } } });
  assert.equal(insufficient.status, 400);
  assert.equal(insufficient.body.error, 'INSUFFICIENT_EVIDENCE');

  const granted = await api('POST', '/api/users/me/achievements/first_trade_closed/unlock', { userId: user.id, body: { evidence: { tradeIds: ['t1'] } } });
  assert.equal(granted.status, 201);
  const profile = await api('GET', '/api/users/me/profile', { userId: user.id });
  assert.equal(profile.body.xpTotal, 10, 'first_trade_closed is worth 10 XP');

  const repeat = await api('POST', '/api/users/me/achievements/first_trade_closed/unlock', { userId: user.id, body: { evidence: { tradeIds: ['t1'] } } });
  assert.equal(repeat.status, 200, 'a repeat unlock returns 200, not 201, and must not grant XP again');
  const profileAfterRepeat = await api('GET', '/api/users/me/profile', { userId: user.id });
  assert.equal(profileAfterRepeat.body.xpTotal, 10, 'a repeat unlock must not double-award XP');
});

test('GET /api/users/me/achievements grants level_5_reached automatically once xpTotal crosses 1500, as a read side-effect', async () => {
  const user = await createUser('Leveler');
  await repo.xpEvents.record({ userId: user.id, type: 'trade_closed', points: 1500, meta: {} });
  const result = await api('GET', '/api/users/me/achievements', { userId: user.id });
  assert.equal(result.status, 200);
  const keys = result.body.map((a) => a.achievementKey);
  assert.ok(keys.includes('level_5_reached'));
});

test('GET /api/users/me/subscriptions only returns purchases of subscription-type listings, not pattern/strategy ones', async () => {
  const seller = await createUser('Seller');
  const buyer = await createUser('Buyer');
  const subListing = await repo.listings.create({ sellerId: seller.id, type: 'subscription', sourceId: 'sub-1', title: 'Mentor Access', priceAmount: 10, previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString() });
  const patternListing = await repo.listings.create({ sellerId: seller.id, type: 'pattern', sourceId: 'pat-1', title: 'A Pattern', priceAmount: 5, previewContent: {}, fullContent: {}, evidenceAsOf: new Date().toISOString() });
  await repo.purchases.create({ listingId: subListing.id, buyerId: buyer.id, priceAtPurchase: 10 });
  await repo.purchases.create({ listingId: patternListing.id, buyerId: buyer.id, priceAtPurchase: 5 });

  const result = await api('GET', '/api/users/me/subscriptions', { userId: buyer.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].listing.type, 'subscription');
});
