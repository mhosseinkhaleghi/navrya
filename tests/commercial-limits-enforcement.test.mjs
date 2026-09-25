import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { PLAN_DEFAULTS } from '../server/commercial/commercial-defaults.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';
import { confirmTransaction } from '../server/commercial/payment-service.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Plan limits are configured centrally (commercial-defaults.mjs + admin overrides) and enforced by the SERVER.
// `sessions` caps Sessions; `analysisSymbols` caps the Instrument Catalog - the store the Session InstrumentPicker
// really writes - so neither can be bypassed by calling the API directly. Every number below is read from the
// configured plan (never a literal), so an admin edit of the defaults cannot silently make these tests lie.

const FREE = PLAN_DEFAULTS.free.limits;
assert.ok(Number.isInteger(FREE.sessions) && FREE.sessions > 0 && Number.isInteger(FREE.analysisSymbols) && FREE.analysisSymbols > 0, 'the Free plan must configure both caps');

async function withWorld(fn) {
  invalidateCommercialConfigCache();
  const repo = createMemoryRepo();
  const server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function api(method, path, { body, userId } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
    const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  try { return await fn({ repo, api }); } finally {
    await new Promise((resolve) => server.close(resolve));
    invalidateCommercialConfigCache();
  }
}

const newUser = (repo, name, plan) => repo.users.create({ displayName: name }).then((user) => (plan ? repo.users.update(user.id, { plan }) : user));
const instrument = (id, code) => ({ id, code });
const session = (id, code = 'XAUUSD') => ({ id, market: 'London', instrument: code, timeframe: '5m', date: '2026-01-01', status: 'open', entries: [] });
const postInstrument = (api, userId, id, code) => api('POST', '/api/sync/instrument-catalog', { userId, body: instrument(id, code) });
const postSession = (api, userId, id, code) => api('POST', '/api/sync/sessions', { userId, body: session(id, code) });
// Distinct valid codes: XAU0, XAU1, ...
const code = (index) => 'XAU' + index;

test('Free: the configured number of sessions is allowed, the next one is refused by the server with the plan facts, and no ghost session is left', async () => {
  await withWorld(async ({ repo, api }) => {
    const user = await newUser(repo, 'Free Sessions');
    await repo.instrumentCatalog.upsert(user.id, instrument('i-1', 'XAUUSD'));
    for (let index = 0; index < FREE.sessions; index += 1) {
      const created = await postSession(api, user.id, 's-' + index);
      assert.equal(created.status, 200, 'session ' + (index + 1) + ' of ' + FREE.sessions + ' must be allowed');
    }
    const refused = await postSession(api, user.id, 's-over');
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error, 'PLAN_LIMIT_REACHED');
    assert.deepEqual({ resource: refused.body.resource, limit: refused.body.limit, used: refused.body.used, plan: refused.body.plan }, { resource: 'sessions', limit: FREE.sessions, used: FREE.sessions, plan: 'free' });
    const listed = await api('GET', '/api/sync/sessions', { userId: user.id });
    assert.equal(listed.body.sessions.length, FREE.sessions, 'the refused session was not saved anywhere');
    assert.equal(listed.body.sessions.some((row) => row.id === 's-over'), false);
    const edited = await api('POST', '/api/sync/sessions', { userId: user.id, body: { ...session('s-0'), status: 'closed' } });
    assert.equal(edited.status, 200, 'editing an existing session is never blocked by the cap');
  });
});

test('a paid (unlimited) plan is not blocked by either Free cap', async () => {
  await withWorld(async ({ repo, api }) => {
    const user = await newUser(repo, 'Plus Trader', 'plus');
    for (let index = 0; index < FREE.analysisSymbols + 3; index += 1) {
      assert.equal((await postInstrument(api, user.id, 'i-' + index, code(index))).status, 200);
    }
    for (let index = 0; index < FREE.sessions + 3; index += 1) {
      assert.equal((await postSession(api, user.id, 's-' + index, code(0))).status, 200);
    }
  });
});

test('Free: the Instrument Catalog allows exactly the configured number of distinct instruments and the next one is refused through the real endpoint', async () => {
  await withWorld(async ({ repo, api }) => {
    const user = await newUser(repo, 'Free Instruments');
    for (let index = 0; index < FREE.analysisSymbols; index += 1) {
      assert.equal((await postInstrument(api, user.id, 'i-' + index, code(index))).status, 200, 'instrument ' + (index + 1) + ' must be allowed');
    }
    const refused = await postInstrument(api, user.id, 'i-over', code(FREE.analysisSymbols));
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error, 'PLAN_LIMIT_REACHED');
    assert.deepEqual({ resource: refused.body.resource, limit: refused.body.limit, used: refused.body.used }, { resource: 'analysisSymbols', limit: FREE.analysisSymbols, used: FREE.analysisSymbols });
    const listed = await api('GET', '/api/sync/instrument-catalog', { userId: user.id });
    assert.equal(listed.body.instrumentCatalog.length, FREE.analysisSymbols, 'the refused instrument is not in the catalog');
    assert.equal((await repo.instrumentCatalog.listByUser(user.id)).some((row) => row.code === code(FREE.analysisSymbols)), false);
  });
});

test('at the instrument cap: updating an instrument, re-adding a code already held (409, never a limit error) and re-POSTing the same id all stay possible', async () => {
  await withWorld(async ({ repo, api }) => {
    const user = await newUser(repo, 'At The Cap');
    for (let index = 0; index < FREE.analysisSymbols; index += 1) await postInstrument(api, user.id, 'i-' + index, code(index));
    const renamed = await api('POST', '/api/sync/instrument-catalog', { userId: user.id, body: { id: 'i-0', code: code(0), displayName: 'Gold' } });
    assert.equal(renamed.status, 200, 'updating an existing instrument is not a new one');
    assert.equal(renamed.body.displayName, 'Gold');
    const duplicate = await postInstrument(api, user.id, 'i-dup', code(0).toLowerCase());
    assert.equal(duplicate.status, 409, 'a code the user already holds is a duplicate, not a plan limit');
    assert.equal(duplicate.body.error, 'INSTRUMENT_ALREADY_EXISTS');
    const invalid = await postInstrument(api, user.id, 'i-bad', '!!');
    assert.equal(invalid.status, 400, 'validation is answered before capacity');
  });
});

test('at the instrument cap a user can still create sessions with an already-catalogued instrument, but never with a new symbol', async () => {
  await withWorld(async ({ repo, api }) => {
    const user = await newUser(repo, 'Cap And Sessions');
    for (let index = 0; index < FREE.analysisSymbols; index += 1) await postInstrument(api, user.id, 'i-' + index, code(index));
    const ok = await postSession(api, user.id, 's-1', code(0));
    assert.equal(ok.status, 200, 'a catalogued instrument needs no new capacity');
    const unknown = await postSession(api, user.id, 's-2', 'NEWSYMBOL');
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error, 'INSTRUMENT_NOT_IN_CATALOG', 'the only way to a new symbol is the catalog, which is capped');
    const viaCatalog = await postInstrument(api, user.id, 'i-new', 'NEWSYMBOL');
    assert.equal(viaCatalog.status, 403);
  });
});

test('deleting a catalog instrument frees its slot immediately; capacity is the CURRENT count, not lifetime creations', async () => {
  await withWorld(async ({ repo, api }) => {
    const user = await newUser(repo, 'Delete Frees');
    for (let index = 0; index < FREE.analysisSymbols; index += 1) await postInstrument(api, user.id, 'i-' + index, code(index));
    assert.equal((await postInstrument(api, user.id, 'i-x', 'OTHER')).status, 403);
    assert.equal((await api('DELETE', '/api/sync/instrument-catalog/i-0', { userId: user.id })).status, 204);
    assert.equal((await postInstrument(api, user.id, 'i-x', 'OTHER')).status, 200);
    assert.equal((await postInstrument(api, user.id, 'i-y', 'ANOTHER')).status, 403, 'the freed slot is taken again, so the cap holds');
  });
});

test('concurrent creates cannot exceed the instrument cap: exactly the free capacity is granted, the rest are refused', async () => {
  await withWorld(async ({ repo, api }) => {
    const user = await newUser(repo, 'Race Instruments');
    const attempts = FREE.analysisSymbols + 3;
    const results = await Promise.all(Array.from({ length: attempts }, (_, index) => postInstrument(api, user.id, 'r-' + index, code(index))));
    const statuses = results.map((result) => result.status);
    assert.equal(statuses.filter((status) => status === 200).length, FREE.analysisSymbols);
    assert.equal(statuses.filter((status) => status === 403).length, 3);
    assert.equal((await repo.instrumentCatalog.listByUser(user.id)).length, FREE.analysisSymbols);
  });
});

test('concurrent creates cannot exceed the session cap either', async () => {
  await withWorld(async ({ repo, api }) => {
    const user = await newUser(repo, 'Race Sessions');
    await repo.instrumentCatalog.upsert(user.id, instrument('i-1', 'XAUUSD'));
    const attempts = FREE.sessions + 4;
    const results = await Promise.all(Array.from({ length: attempts }, (_, index) => postSession(api, user.id, 'r-' + index)));
    assert.equal(results.filter((result) => result.status === 200).length, FREE.sessions);
    assert.equal(results.filter((result) => result.status === 403).length, 4);
    assert.equal((await repo.tradingSessions.listByUser(user.id)).length, FREE.sessions);
  });
});

test('a downgrade never deletes data: everything stays readable, editable and deletable, only NEW records are refused', async () => {
  await withWorld(async ({ repo, api }) => {
    const user = await newUser(repo, 'Downgrader', 'plus');
    const instruments = FREE.analysisSymbols + 2;
    const sessions = FREE.sessions + 2;
    for (let index = 0; index < instruments; index += 1) await postInstrument(api, user.id, 'i-' + index, code(index));
    for (let index = 0; index < sessions; index += 1) await postSession(api, user.id, 's-' + index, code(0));

    await repo.users.update(user.id, { plan: 'free' });
    assert.equal((await api('GET', '/api/sync/instrument-catalog', { userId: user.id })).body.instrumentCatalog.length, instruments);
    assert.equal((await api('GET', '/api/sync/sessions', { userId: user.id })).body.sessions.length, sessions);
    assert.equal((await postInstrument(api, user.id, 'i-new', 'BRANDNEW')).status, 403);
    assert.equal((await postSession(api, user.id, 's-new', code(0))).status, 403);
    assert.equal((await api('POST', '/api/sync/instrument-catalog', { userId: user.id, body: { id: 'i-0', code: code(0), displayName: 'Edited' } })).status, 200);
    assert.equal((await api('DELETE', '/api/sync/instrument-catalog/i-1', { userId: user.id })).status, 204);
  });
});

test('an admin-configured limit override reaches BOTH enforcement and the plan display (one effective config)', async () => {
  await withWorld(async ({ repo, api }) => {
    const user = await newUser(repo, 'Override Trader');
    await repo.commercialConfig.publish('plan:free:limits', { sessions: 2, analysisSymbols: 3 }, { updatedBy: null, changeSummary: 'test override' });
    invalidateCommercialConfigCache();

    const shown = (await api('GET', '/api/sync/subscriptions/catalog', { userId: user.id })).body.plans.free.limits;
    assert.equal(shown.sessions, 2);
    assert.equal(shown.analysisSymbols, 3);

    for (let index = 0; index < 3; index += 1) assert.equal((await postInstrument(api, user.id, 'i-' + index, code(index))).status, 200);
    const fourth = await postInstrument(api, user.id, 'i-3', code(3));
    assert.equal(fourth.status, 403);
    assert.equal(fourth.body.limit, 3, 'the refusal reports the overridden limit');
    for (let index = 0; index < 2; index += 1) assert.equal((await postSession(api, user.id, 's-' + index, code(0))).status, 200);
    const third = await postSession(api, user.id, 's-2', code(0));
    assert.equal(third.status, 403);
    assert.equal(third.body.limit, 2);

    // null means unlimited, again identically in enforcement and display.
    await repo.commercialConfig.publish('plan:free:limits', { sessions: null, analysisSymbols: null }, { updatedBy: null, changeSummary: 'test unlimited' });
    invalidateCommercialConfigCache();
    const unlimited = (await api('GET', '/api/sync/subscriptions/catalog', { userId: user.id })).body.plans.free.limits;
    assert.equal(unlimited.sessions, null);
    assert.equal(unlimited.analysisSymbols, null);
    assert.equal((await postInstrument(api, user.id, 'i-9', code(9))).status, 200);
    assert.equal((await postSession(api, user.id, 's-9', code(0))).status, 200);
  });
});

test('the retired /api/sync/analysis-symbols route is gone, so no second store can sit outside the instrument cap', async () => {
  await withWorld(async ({ repo, api }) => {
    const user = await newUser(repo, 'Old Route');
    const posted = await api('POST', '/api/sync/analysis-symbols', { userId: user.id, body: { id: 'a-1', symbol: 'XAUUSD' } });
    assert.equal(posted.status, 404);
    assert.equal((await api('GET', '/api/sync/analysis-symbols', { userId: user.id })).status, 404);
    assert.equal(repo.analysisSymbols, undefined, 'no parallel symbol store exists in the repository');
  });
});

test('a PENDING purchase never lifts a limit; only a server-confirmed payment does, and the plan display and enforcement then agree', async () => {
  await withWorld(async ({ repo, api }) => {
    const user = await newUser(repo, 'Pending Buyer');
    await repo.instrumentCatalog.upsert(user.id, instrument('i-1', 'XAUUSD'));
    for (let index = 0; index < FREE.sessions; index += 1) await postSession(api, user.id, 's-' + index);

    const request = await api('POST', '/api/sync/subscriptions/upgrade-request', { userId: user.id, body: { planId: 'plus' } });
    assert.equal(request.status, 201);
    assert.equal(request.body.status, 'pending');
    assert.equal((await api('GET', '/api/sync/subscriptions', { userId: user.id })).body.plan, 'free', 'a pending checkout grants no plan');
    const stillCapped = await postSession(api, user.id, 's-pending');
    assert.equal(stillCapped.status, 403, 'and no paid-plan limits: the Free cap still holds while the payment is pending');
    assert.equal(stillCapped.body.plan, 'free');

    await confirmTransaction(repo, request.body.transactionId, { adminUserId: null });
    invalidateCommercialConfigCache();
    assert.equal((await api('GET', '/api/sync/subscriptions', { userId: user.id })).body.plan, 'plus');
    assert.equal((await postSession(api, user.id, 's-confirmed')).status, 200, 'the confirmed plan is unlimited, in enforcement');
    const shown = (await api('GET', '/api/sync/subscriptions/catalog', { userId: user.id })).body.plans.plus.limits;
    assert.equal(shown.sessions, null, 'and in the plan display - the same effective config');
  });
});
