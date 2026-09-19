import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import {
  startApp, makeUser, makeAdmin, makeCode, staleReauthHeaders, requireDiscountDomains, iso, HOUR_MS, PRO_MICRO
} from './helpers/discount-fixtures.mjs';

// Admin discount-code management - /api/admin/commercial/discount-codes (routes.discount-codes.mjs,
// mounted from routes.commercial.mjs). Mirrors commercial-admin-api-contract.test.mjs's topology.
//
// Approved decision under test: EVERY mutation (create, update, activate, deactivate) requires a
// recent admin re-authentication - unconditionally, never "only when the code can produce a $0
// price". Reads (list, detail) need admin authorization but not a fresh step-up.

const BASE = '/api/admin/commercial/discount-codes';
let app, repo, api;
let counter = 0;
const uniq = (prefix = 'ADM') => prefix + (++counter);
const validBody = (overrides = {}) => ({
  code: uniq(), campaignName: 'Spring launch', discountType: 'percent', discountValue: 15, maxRedemptions: 30, ...overrides
});

before(async () => {
  app = await startApp();
  ({ repo, api } = app);
});
after(() => app.close());

test('a non-admin cannot list, create, or change discount codes', async () => {
  const user = await makeUser(repo, 'Regular User');
  const code = await makeCode(repo, {});
  assert.equal((await api('GET', BASE, { userId: user.id })).status, 403);
  assert.equal((await api('GET', `${BASE}/${code.id}`, { userId: user.id })).status, 403);
  assert.equal((await api('POST', BASE, { userId: user.id, body: validBody() })).status, 403);
  assert.equal((await api('PATCH', `${BASE}/${code.id}`, { userId: user.id, body: { active: false } })).status, 403);
  assert.equal((await repo.discountCodes.get(code.id)).active, true, 'the refused PATCH changed nothing');
});

test('APPROVED DECISION: create, update, activate and deactivate ALL require a fresh admin re-authentication, even for a plain 10% code', async () => {
  const admin = await makeAdmin(repo, 'Stale Admin');
  const created = await api('POST', BASE, { userId: admin.id, body: validBody({ discountValue: 10 }) });
  assert.equal(created.status, 201, 'a fresh session may create');
  const id = created.body.id;
  const stale = await staleReauthHeaders(repo, admin.id);

  const auditBefore = (await repo.auditLog.list({ limit: 1000 })).length;
  const codesBefore = (await repo.discountCodes.list()).length;
  const attempts = [
    ['create', () => api('POST', BASE, { headers: stale, body: validBody({ discountValue: 10 }) })],
    ['update', () => api('PATCH', `${BASE}/${id}`, { headers: stale, body: { campaignName: 'Renamed by stale admin' } })],
    ['activate', () => api('PATCH', `${BASE}/${id}`, { headers: stale, body: { active: true } })],
    ['deactivate', () => api('PATCH', `${BASE}/${id}`, { headers: stale, body: { active: false } })]
  ];
  for (const [name, run] of attempts) {
    const result = await run();
    assert.equal(result.status, 401, name + ' must be refused for a stale session');
    assert.equal(result.body.error, 'STEP_UP_REQUIRED', name);
  }

  const unchanged = await repo.discountCodes.get(id);
  assert.equal(unchanged.campaignName, 'Spring launch');
  assert.equal(unchanged.active, true);
  assert.equal((await repo.discountCodes.list()).length, codesBefore, 'the refused create made no code');
  assert.equal((await repo.auditLog.list({ limit: 1000 })).length, auditBefore, 'refused mutations write no audit rows');

  // Reads stay available to an admin whose step-up has gone stale.
  assert.equal((await api('GET', BASE, { headers: stale })).status, 200);
  assert.equal((await api('GET', `${BASE}/${id}`, { headers: stale })).status, 200);
});

test('a fresh-session admin can create, update, deactivate and reactivate', async () => {
  const admin = await makeAdmin(repo, 'Fresh Admin');
  const created = await api('POST', BASE, { userId: admin.id, body: validBody() });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal((await api('PATCH', `${BASE}/${id}`, { userId: admin.id, body: { campaignName: 'Renamed' } })).status, 200);
  assert.equal((await api('PATCH', `${BASE}/${id}`, { userId: admin.id, body: { active: false } })).status, 200);
  assert.equal((await api('PATCH', `${BASE}/${id}`, { userId: admin.id, body: { active: true } })).status, 200);
});

const INVALID = [
  ['missing code', { code: undefined }, 'code'],
  ['too-short code', { code: 'ab' }, 'code'],
  ['code with a space', { code: 'SPRING 15' }, 'code'],
  ['look-alike unicode code', { code: 'ſpring15' }, 'code'],
  ['over-long code', { code: 'X'.repeat(33) }, 'code'],
  ['blank campaign name', { campaignName: '   ' }, 'campaignName'],
  ['huge campaign name', { campaignName: 'x'.repeat(500) }, 'campaignName'],
  ['unknown discount type', { discountType: 'bogus' }, 'discountType'],
  ['missing discount type', { discountType: undefined }, 'discountType'],
  ['percent zero', { discountValue: 0 }, 'discountValue'],
  ['percent negative', { discountValue: -5 }, 'discountValue'],
  ['percent above 100', { discountValue: 100.01 }, 'discountValue'],
  ['percent with three decimals', { discountValue: 12.345 }, 'discountValue'],
  ['percent not a number', { discountValue: 'abc' }, 'discountValue'],
  ['percent null', { discountValue: null }, 'discountValue'],
  ['fixed zero', { discountType: 'fixed', discountValue: 0 }, 'discountValue'],
  ['fixed negative', { discountType: 'fixed', discountValue: -1 }, 'discountValue'],
  ['fixed with seven decimals', { discountType: 'fixed', discountValue: 1.1234567 }, 'discountValue'],
  ['capacity zero', { maxRedemptions: 0 }, 'maxRedemptions'],
  ['capacity negative', { maxRedemptions: -3 }, 'maxRedemptions'],
  ['capacity fractional', { maxRedemptions: 1.5 }, 'maxRedemptions'],
  ['capacity as a string', { maxRedemptions: '30' }, 'maxRedemptions'],
  ['unparseable start date', { startsAt: 'not-a-date' }, 'startsAt'],
  ['unparseable expiry date', { expiresAt: 'nope' }, 'expiresAt'],
  ['expiry before start', { startsAt: '2030-02-01T00:00:00.000Z', expiresAt: '2030-01-01T00:00:00.000Z' }, 'expiresAt'],
  ['expiry equal to start', { startsAt: '2030-02-01T00:00:00.000Z', expiresAt: '2030-02-01T00:00:00.000Z' }, 'expiresAt'],
  ['non-boolean active flag', { active: 'yes' }, 'active']
];

test('invalid create requests are rejected with 400 VALIDATION_FAILED naming the field, and create nothing', async () => {
  requireDiscountDomains(repo);
  const admin = await makeAdmin(repo, 'Validation Admin');
  const before = (await repo.discountCodes.list()).length;
  for (const [label, overrides, field] of INVALID) {
    const result = await api('POST', BASE, { userId: admin.id, body: validBody(overrides) });
    assert.equal(result.status, 400, label);
    assert.equal(result.body.error, 'VALIDATION_FAILED', label);
    assert.equal(result.body.field, field, label);
  }
  assert.equal((await repo.discountCodes.list()).length, before);
});

test('create normalizes the code, converts admin units to integer stored units, and returns the full DTO with stats', async () => {
  const admin = await makeAdmin(repo, 'Create Admin');
  const raw = '  adm-norm-' + uniq('') + ' ';
  const result = await api('POST', BASE, {
    userId: admin.id,
    body: validBody({ code: raw, startsAt: '2030-01-01T00:00:00.000Z', expiresAt: '2030-12-31T00:00:00.000Z', maxRedemptions: 30 })
  });
  assert.equal(result.status, 201);
  const dto = result.body;
  assert.equal(dto.code, raw.trim().toUpperCase());
  assert.equal(dto.campaignName, 'Spring launch');
  assert.equal(dto.active, true);
  assert.equal(dto.discountType, 'percent');
  assert.equal(dto.discountValue, 15, 'the DTO speaks admin units (percent), not basis points');
  assert.equal(dto.maxRedemptions, 30);
  assert.equal(dto.startsAt, '2030-01-01T00:00:00.000Z');
  assert.equal(dto.expiresAt, '2030-12-31T00:00:00.000Z');
  assert.equal(dto.status, 'scheduled');
  assert.deepEqual({ confirmed: dto.stats.confirmed, pendingReservations: dto.stats.pendingReservations, remaining: dto.stats.remaining }, { confirmed: 0, pendingReservations: 0, remaining: 30 });
  assert.ok(dto.id);

  const stored = await repo.discountCodes.get(dto.id);
  assert.equal(stored.code, dto.code);
  assert.equal(stored.discountValue, 1500, 'stored as integer basis points');
  const audit = (await repo.auditLog.list({ limit: 1000 })).find((entry) => entry.action === 'commercial.discountCode.create' && entry.targetId === dto.id);
  assert.ok(audit, 'creation is audited');
  assert.equal(audit.targetType, 'discountCode');
});

test('percent and fixed values are stored as exact integers (basis points / micro-USD), never floats', async () => {
  const admin = await makeAdmin(repo, 'Units Admin');
  const cases = [
    [{ discountType: 'percent', discountValue: 12.5 }, 1250],
    [{ discountType: 'percent', discountValue: 0.01 }, 1],
    [{ discountType: 'percent', discountValue: 100 }, 10000],
    [{ discountType: 'fixed', discountValue: 5 }, 5_000_000],
    [{ discountType: 'fixed', discountValue: 0.5 }, 500_000],
    [{ discountType: 'fixed', discountValue: 14.989999 }, 14_989_999]
  ];
  for (const [overrides, expectedStored] of cases) {
    const result = await api('POST', BASE, { userId: admin.id, body: validBody(overrides) });
    assert.equal(result.status, 201, JSON.stringify(overrides));
    assert.equal(result.body.discountValue, overrides.discountValue);
    assert.equal((await repo.discountCodes.get(result.body.id)).discountValue, expectedStored, JSON.stringify(overrides));
  }
});

test('the normalized code is unique: every case/whitespace spelling of an existing code is refused with 409 DISCOUNT_CODE_EXISTS', async () => {
  const admin = await makeAdmin(repo, 'Unique Admin');
  const code = 'DUP' + uniq('');
  assert.equal((await api('POST', BASE, { userId: admin.id, body: validBody({ code: code.toLowerCase() }) })).status, 201);
  for (const spelling of [code, code.toLowerCase(), '  ' + code + '  ', code[0] + code.slice(1).toLowerCase()]) {
    const result = await api('POST', BASE, { userId: admin.id, body: validBody({ code: spelling }) });
    assert.equal(result.status, 409, JSON.stringify(spelling));
    assert.equal(result.body.error, 'DISCOUNT_CODE_EXISTS');
  }
});

test('list returns every code with derived status and live stats', async () => {
  const admin = await makeAdmin(repo, 'List Admin');
  const buyer = await makeUser(repo, 'Buyer');
  const active = await makeCode(repo, { code: 'LISTACTIVE' + uniq(''), maxRedemptions: 3 });
  const inactive = await makeCode(repo, { code: 'LISTOFF' + uniq(''), active: false });
  const scheduled = await makeCode(repo, { code: 'LISTSOON' + uniq(''), startsAt: iso(Date.now() + 5 * HOUR_MS) });
  const expired = await makeCode(repo, { code: 'LISTOLD' + uniq(''), expiresAt: iso(Date.now() - HOUR_MS) });
  const full = await makeCode(repo, { code: 'LISTFULL' + uniq(''), maxRedemptions: 1 });
  await repo.discountRedemptions.reserve({ codeId: full.id, userId: buyer.id, planId: 'pro', originalAmountMicroUsd: PRO_MICRO, reservedUntil: iso(Date.now() + HOUR_MS) });
  await repo.discountRedemptions.reserve({ codeId: active.id, userId: buyer.id, planId: 'pro', originalAmountMicroUsd: PRO_MICRO, reservedUntil: iso(Date.now() + HOUR_MS) });

  const result = await api('GET', BASE, { userId: admin.id });
  assert.equal(result.status, 200);
  const byId = new Map(result.body.codes.map((dto) => [dto.id, dto]));
  assert.equal(byId.get(active.id).status, 'active');
  assert.equal(byId.get(inactive.id).status, 'inactive');
  assert.equal(byId.get(scheduled.id).status, 'scheduled');
  assert.equal(byId.get(expired.id).status, 'expired');
  assert.equal(byId.get(full.id).status, 'exhausted');
  assert.equal(byId.get(active.id).stats.pendingReservations, 1);
  assert.equal(byId.get(active.id).stats.remaining, 2);
  assert.equal(byId.get(full.id).stats.remaining, 0);
});

test('detail returns the code plus its redemption history; unknown ids are 404 DISCOUNT_CODE_NOT_FOUND', async () => {
  const admin = await makeAdmin(repo, 'Detail Admin');
  const [a, b] = await Promise.all([makeUser(repo, 'A'), makeUser(repo, 'B')]);
  const code = await makeCode(repo, { code: 'DETAIL' + uniq(''), maxRedemptions: 3 });
  const redemptionA = await repo.discountRedemptions.reserve({ codeId: code.id, userId: a.id, planId: 'pro', originalAmountMicroUsd: PRO_MICRO, reservedUntil: iso(Date.now() + HOUR_MS) });
  const txA = await repo.paymentTransactions.create({ userId: a.id, type: 'subscription', provider: 'manual', amountMicroUsd: redemptionA.finalAmountMicroUsd, productId: 'pro', metadata: { planId: 'pro' } });
  await repo.discountRedemptions.attachTransaction(redemptionA.id, txA.id);
  await repo.discountRedemptions.confirmForTransaction(txA.id);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await repo.discountRedemptions.reserve({ codeId: code.id, userId: b.id, planId: 'pro', originalAmountMicroUsd: PRO_MICRO, reservedUntil: iso(Date.now() + HOUR_MS) });

  const result = await api('GET', `${BASE}/${code.id}`, { userId: admin.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.code.id, code.id);
  assert.deepEqual(
    { confirmed: result.body.code.stats.confirmed, pendingReservations: result.body.code.stats.pendingReservations, remaining: result.body.code.stats.remaining },
    { confirmed: 1, pendingReservations: 1, remaining: 1 }
  );
  assert.equal(result.body.redemptions.length, 2);
  const rowA = result.body.redemptions.find((row) => row.userId === a.id);
  assert.equal(rowA.status, 'confirmed');
  assert.equal(rowA.transactionId, txA.id);
  assert.equal(rowA.planId, 'pro');
  assert.equal(rowA.originalAmountMicroUsd, PRO_MICRO);
  assert.equal(rowA.discountAmountMicroUsd, 2_248_500);
  assert.equal(rowA.finalAmountMicroUsd, 12_741_500);
  assert.ok(rowA.reservedUntil && rowA.confirmedAt);
  assert.equal(result.body.redemptions[0].userId, b.id, 'newest first');

  const missing = await api('GET', `${BASE}/no-such-code`, { userId: admin.id });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'DISCOUNT_CODE_NOT_FOUND');
});

test('update changes future behavior, is audited with before/after, and never rewrites a past redemption', async () => {
  requireDiscountDomains(repo);
  const admin = await makeAdmin(repo, 'Update Admin');
  const buyer = await makeUser(repo, 'Early Buyer');
  const created = await api('POST', BASE, { userId: admin.id, body: validBody({ maxRedemptions: 10 }) });
  const id = created.body.id;
  await repo.discountRedemptions.reserve({ codeId: id, userId: buyer.id, planId: 'pro', originalAmountMicroUsd: PRO_MICRO, reservedUntil: iso(Date.now() + HOUR_MS) });

  const patched = await api('PATCH', `${BASE}/${id}`, {
    userId: admin.id,
    body: { campaignName: 'Renamed', discountType: 'fixed', discountValue: 5, maxRedemptions: 40, expiresAt: '2031-01-01T00:00:00.000Z' }
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.campaignName, 'Renamed');
  assert.equal(patched.body.discountType, 'fixed');
  assert.equal(patched.body.discountValue, 5);
  assert.equal(patched.body.maxRedemptions, 40);
  assert.equal(patched.body.expiresAt, '2031-01-01T00:00:00.000Z');
  assert.equal((await repo.discountCodes.get(id)).discountValue, 5_000_000);

  const audit = (await repo.auditLog.list({ limit: 1000 })).find((entry) => entry.action === 'commercial.discountCode.update' && entry.targetId === id);
  assert.ok(audit, 'a multi-field edit is audited as an update');
  assert.equal(audit.details.before.campaignName, 'Spring launch');
  assert.equal(audit.details.after.campaignName, 'Renamed');

  const history = (await api('GET', `${BASE}/${id}`, { userId: admin.id })).body.redemptions;
  assert.equal(history[0].discountAmountMicroUsd, 2_248_500, 'the earlier redemption keeps the 15% terms it was made under');
});

test('activate and deactivate are audited as their own actions and move the derived status', async () => {
  const admin = await makeAdmin(repo, 'Toggle Admin');
  const id = (await api('POST', BASE, { userId: admin.id, body: validBody() })).body.id;

  const off = await api('PATCH', `${BASE}/${id}`, { userId: admin.id, body: { active: false } });
  assert.equal(off.status, 200);
  assert.equal(off.body.active, false);
  assert.equal(off.body.status, 'inactive');
  const on = await api('PATCH', `${BASE}/${id}`, { userId: admin.id, body: { active: true } });
  assert.equal(on.body.active, true);
  assert.equal(on.body.status, 'active');

  const audit = await repo.auditLog.list({ limit: 1000 });
  assert.ok(audit.some((entry) => entry.action === 'commercial.discountCode.deactivate' && entry.targetId === id));
  assert.ok(audit.some((entry) => entry.action === 'commercial.discountCode.activate' && entry.targetId === id));
});

test('the code string is immutable; invalid or unknown updates are rejected', async () => {
  const admin = await makeAdmin(repo, 'Immutable Admin');
  const id = (await api('POST', BASE, { userId: admin.id, body: validBody() })).body.id;

  const rename = await api('PATCH', `${BASE}/${id}`, { userId: admin.id, body: { code: 'SOMETHINGELSE' } });
  assert.equal(rename.status, 400);
  assert.equal(rename.body.field, 'code');

  const percentTooBig = await api('PATCH', `${BASE}/${id}`, { userId: admin.id, body: { discountValue: 150 } });
  assert.equal(percentTooBig.status, 400);
  assert.equal(percentTooBig.body.field, 'discountValue');

  const missing = await api('PATCH', `${BASE}/no-such-code`, { userId: admin.id, body: { active: false } });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'DISCOUNT_CODE_NOT_FOUND');
});

test('capacity cannot be lowered below what is confirmed or held: 409 DISCOUNT_CAPACITY_BELOW_USED', async () => {
  requireDiscountDomains(repo);
  const admin = await makeAdmin(repo, 'Capacity Admin');
  const [a, b] = await Promise.all([makeUser(repo, 'A'), makeUser(repo, 'B')]);
  const id = (await api('POST', BASE, { userId: admin.id, body: validBody({ maxRedemptions: 5 }) })).body.id;
  for (const user of [a, b]) {
    await repo.discountRedemptions.reserve({ codeId: id, userId: user.id, planId: 'pro', originalAmountMicroUsd: PRO_MICRO, reservedUntil: iso(Date.now() + HOUR_MS) });
  }
  const tooLow = await api('PATCH', `${BASE}/${id}`, { userId: admin.id, body: { maxRedemptions: 1 } });
  assert.equal(tooLow.status, 409);
  assert.equal(tooLow.body.error, 'DISCOUNT_CAPACITY_BELOW_USED');
  assert.equal((await api('PATCH', `${BASE}/${id}`, { userId: admin.id, body: { maxRedemptions: 2 } })).status, 200);
  assert.equal((await api('PATCH', `${BASE}/${id}`, { userId: admin.id, body: { maxRedemptions: null } })).status, 200);
});

test('codes can only be deactivated, never deleted', async () => {
  requireDiscountDomains(repo);
  const admin = await makeAdmin(repo, 'No Delete Admin');
  const created = await api('POST', BASE, { userId: admin.id, body: validBody() });
  assert.equal(created.status, 201, 'the code must exist before we can prove it cannot be deleted');
  const id = created.body.id;
  const result = await api('DELETE', `${BASE}/${id}`, { userId: admin.id });
  assert.ok([404, 405].includes(result.status), 'there is no DELETE route');
  assert.ok(await repo.discountCodes.get(id), 'the code still exists');
});
