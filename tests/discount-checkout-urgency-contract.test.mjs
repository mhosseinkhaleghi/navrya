import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { ManualBillingProvider } from '../server/commercial/manual-billing-provider.mjs';
import { confirmTransaction } from '../server/commercial/payment-service.mjs';
import { withApp, makeUser, makeCode, iso, ORIGINAL_FETCH, MINUTE_MS, HOUR_MS, PRO_MICRO } from './helpers/discount-fixtures.mjs';

// Checkout urgency UI (task: countdown to a time-limited code's expiry, a live remaining-capacity count for a
// usage-limited code). Pins:
//   POST /api/sync/subscriptions/quote                        now also returns codeId, expiresAt, maxRedemptions, remaining
//   GET  /api/sync/subscriptions/discount-codes/:id/status    a cheap, read-only poll target - NOT the rate-limited
//                                                              quote/checkout budget, so a client can watch it tick
//                                                              every few seconds without tripping code-guessing throttling.
//
// The client never invents these numbers: everything shown is exactly what the server reports here.

afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

const QUOTE = '/api/sync/subscriptions/quote';
const status = (id) => '/api/sync/subscriptions/discount-codes/' + id + '/status';

test('the quote additionally reports the code id, its expiry, its capacity and how much remains - null when the code has no limit', async () => {
  await withApp(async ({ repo, api }) => {
    const unlimited = await makeCode(repo, { code: 'NOLIMIT' });
    const capped = await makeCode(repo, { code: 'CAPPED', maxRedemptions: 20 });
    const expiring = await makeCode(repo, { code: 'EXPIRING', expiresAt: iso(Date.now() + HOUR_MS) });
    const user = await makeUser(repo, 'Quoter');

    const a = await api('POST', QUOTE, { userId: user.id, body: { planId: 'pro', code: 'NOLIMIT' } });
    assert.equal(a.body.codeId, unlimited.id);
    assert.equal(a.body.expiresAt, null);
    assert.equal(a.body.maxRedemptions, null);
    assert.equal(a.body.remaining, null);

    const b = await api('POST', QUOTE, { userId: user.id, body: { planId: 'pro', code: 'CAPPED' } });
    assert.equal(b.body.codeId, capped.id);
    assert.equal(b.body.maxRedemptions, 20);
    assert.equal(b.body.remaining, 20, 'nothing consumed yet');

    const c = await api('POST', QUOTE, { userId: user.id, body: { planId: 'pro', code: 'EXPIRING' } });
    assert.equal(c.body.codeId, expiring.id);
    assert.equal(c.body.expiresAt, iso(Date.parse(expiring.expiresAt)));
    assert.equal(c.body.maxRedemptions, null);
  });
});

test('GET status: a fresh capped code reports active/remaining/maxRedemptions, and a plain code reports null limits', async () => {
  await withApp(async ({ repo, api }) => {
    const capped = await makeCode(repo, { code: 'LIVE20', maxRedemptions: 20 });
    const plain = await makeCode(repo, { code: 'PLAINCODE' });
    const user = await makeUser(repo, 'Watcher');

    const a = await api('GET', status(capped.id), { userId: user.id });
    assert.equal(a.status, 200);
    assert.deepEqual(a.body, { status: 'active', active: true, expiresAt: null, startsAt: null, maxRedemptions: 20, remaining: 20 });

    const b = await api('GET', status(plain.id), { userId: user.id });
    assert.deepEqual(b.body, { status: 'active', active: true, expiresAt: null, startsAt: null, maxRedemptions: null, remaining: null });
  });
});

test('GET status is LIVE: it drops the instant another user\'s purchase confirms - real capacity, not a cached snapshot', async () => {
  await withApp(async ({ repo, api }) => {
    const code = await makeCode(repo, { code: 'RACE20', maxRedemptions: 20 });
    const manual = new ManualBillingProvider(repo);
    const watcher = await makeUser(repo, 'Watcher');
    const buyer = await makeUser(repo, 'Buyer');

    const before = await api('GET', status(code.id), { userId: watcher.id });
    assert.equal(before.body.remaining, 20);

    const checkout = await manual.createSubscription({ userId: buyer.id, planId: 'pro', discountCode: 'RACE20' });
    const during = await api('GET', status(code.id), { userId: watcher.id });
    assert.equal(during.body.remaining, 19, 'a live (unconfirmed) reservation already counts against capacity');

    await confirmTransaction(repo, checkout.transactionId);
    const after = await api('GET', status(code.id), { userId: watcher.id });
    assert.equal(after.body.remaining, 19, 'confirming does not double-count the same slot');
  });
});

test('GET status reflects expiry and exhaustion the same way the checkout itself would refuse the code', async (t) => {
  await withApp(async ({ repo, api }) => {
    const expiring = await makeCode(repo, { code: 'SOONEXP', expiresAt: iso(Date.now() + MINUTE_MS) });
    const capped = await makeCode(repo, { code: 'ONESHOT', maxRedemptions: 1 });
    const watcher = await makeUser(repo, 'Watcher Two');
    const buyer = await makeUser(repo, 'Buyer Two');

    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    t.mock.timers.tick(2 * MINUTE_MS);
    const expired = await api('GET', status(expiring.id), { userId: watcher.id });
    assert.equal(expired.body.status, 'expired');
    assert.equal(expired.body.active, false);

    await new ManualBillingProvider(repo).createSubscription({ userId: buyer.id, planId: 'pro', discountCode: 'ONESHOT' });
    const exhausted = await api('GET', status(capped.id), { userId: watcher.id });
    assert.equal(exhausted.body.status, 'exhausted');
    assert.equal(exhausted.body.active, false);
    assert.equal(exhausted.body.remaining, 0);
  });
});

test('GET status: 404 for an unknown id, and 401 without a session (never leaks whether the id exists)', async () => {
  await withApp(async ({ repo, api }) => {
    const user = await makeUser(repo, 'Lonely');
    const anon = await api('GET', status('no-such-code-id'), { userId: user.id });
    assert.equal(anon.status, 404);
    assert.equal(anon.body.error, 'DISCOUNT_CODE_NOT_FOUND');

    const code = await makeCode(repo, { code: 'AUTHED' });
    const noAuth = await api('GET', status(code.id), {});
    assert.equal(noAuth.status, 401);
  });
});

test('the status poll has its OWN rate budget: exhausting it never blocks quote/checkout, and exhausting quote/checkout never blocks it', async () => {
  await withApp(async ({ repo, api }) => {
    const code = await makeCode(repo, { code: 'BUDGET', maxRedemptions: 5 });
    const user = await makeUser(repo, 'Budget Watcher');

    for (let i = 0; i < 30; i += 1) await api('GET', status(code.id), { userId: user.id });
    const stillWorks = await api('POST', QUOTE, { userId: user.id, body: { planId: 'pro', code: 'BUDGET' } });
    assert.equal(stillWorks.status, 200, 'polling status 30 times must not exhaust the quote/checkout code-guessing budget');

    const other = await makeUser(repo, 'Quote Spender');
    for (let i = 0; i < 20; i += 1) await api('POST', QUOTE, { userId: other.id, body: { planId: 'pro', code: 'no-such-code-' + i } });
    const rateLimited = await api('POST', QUOTE, { userId: other.id, body: { planId: 'pro', code: 'BUDGET' } });
    assert.equal(rateLimited.status, 429, 'precondition: the quote budget really is exhausted for this user');
    const statusStillWorks = await api('GET', status(code.id), { userId: other.id });
    assert.equal(statusStillWorks.status, 200, 'exhausting the quote/checkout budget must not block the live status poll');
  });
});
