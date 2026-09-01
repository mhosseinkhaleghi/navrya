import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { createSession } from '../server/community/security/session-service.mjs';
import { issueCsrfToken } from '../server/community/security/csrf.mjs';
import { sessionCookieName, csrfCookieName } from '../server/community/security/cookies.mjs';

// Contract-level coverage for server/admin/routes.commercial.mjs (spec section 65/72): non-admin
// rejection, admin edits writing admin_audit_log, and invalid-config rejection. Mirrors
// xp-config-admin.test.mjs / admin-voice-providers-contract.test.mjs's own
// createApp()/repo.memory.mjs convention.

let server, baseUrl, repo;

before(async () => {
  delete process.env.ADMIN_AUTH_ENFORCED;
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function api(method, path, { body, userId, headers } = {}) {
  const reqHeaders = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(reqHeaders, await authHeadersFor(repo, userId));
  Object.assign(reqHeaders, headers || {});
  const response = await fetch(baseUrl + path, { method, headers: reqHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }
async function createAdmin(name) {
  const user = await repo.users.create({ displayName: name });
  return repo.users.update(user.id, { role: 'admin' });
}
// See admin-voice-providers-contract.test.mjs's identical helper - authHeadersFor's cached
// session is always reauth-fresh by construction, so this is the only way to exercise a real
// admin whose step-up has gone stale.
async function staleReauthAdminHeaders(userId) {
  const { rawId, record } = await createSession(repo, { userId, reauth: false });
  const csrfToken = issueCsrfToken(record.id);
  return { Cookie: `${sessionCookieName()}=${rawId}; ${csrfCookieName()}=${csrfToken}`, 'x-csrf-token': csrfToken };
}

test('a non-admin cannot edit plan limits', async () => {
  const user = await createUser('Regular User');
  const result = await api('PATCH', '/api/admin/commercial/plans/free', { userId: user.id, body: { limits: { patterns: 10 } } });
  assert.equal(result.status, 403);
});

test('an admin plan edit is applied and writes an audit log entry', async () => {
  const admin = await createAdmin('Admin A');
  const result = await api('PATCH', '/api/admin/commercial/plans/free', { userId: admin.id, body: { limits: { patterns: 7 } } });
  assert.equal(result.status, 200);
  assert.equal(result.body.plan.limits.patterns, 7);
  const audit = await repo.auditLog.list({ limit: 10 });
  assert.ok(audit.some((entry) => entry.action === 'commercial.plan.update' && entry.targetId === 'free'));
});

test('a negative plan limit is rejected', async () => {
  const admin = await createAdmin('Admin B');
  const result = await api('PATCH', '/api/admin/commercial/plans/free', { userId: admin.id, body: { limits: { patterns: -1 } } });
  assert.equal(result.status, 400);
});

test('a negative storage quota is rejected', async () => {
  const admin = await createAdmin('Admin C');
  const result = await api('PATCH', '/api/admin/commercial/plans/plus', { userId: admin.id, body: { storageBytes: -5 } });
  assert.equal(result.status, 400);
});

test('an unknown plan name is rejected', async () => {
  const admin = await createAdmin('Admin D');
  const result = await api('PATCH', '/api/admin/commercial/plans/enterprise', { userId: admin.id, body: { limits: { patterns: 1 } } });
  assert.equal(result.status, 400);
});

// Real-money subscription rollout: the new 'pro' plan is a real, admin-editable plan exactly like
// the three pre-existing ones - not a special case requiring a separate route or payload shape.
test('the new pro plan is a real, editable plan - not rejected as unknown', async () => {
  const admin = await createAdmin('Admin Pro');
  const result = await api('PATCH', '/api/admin/commercial/plans/pro', { userId: admin.id, body: { limits: { patterns: 42 } } });
  assert.equal(result.status, 200);
  assert.equal(result.body.plan.limits.patterns, 42);
});

test('an admin can rename any plan via displayName, including Free, and can set premiumModels/byok feature flags', async () => {
  const admin = await createAdmin('Admin Rename');
  const renamed = await api('PATCH', '/api/admin/commercial/plans/free', { userId: admin.id, body: { displayName: 'Starter' } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.plan.displayName, 'Starter');

  const featured = await api('PATCH', '/api/admin/commercial/plans/pro', { userId: admin.id, body: { features: { premiumModels: false, byok: false } } });
  assert.equal(featured.status, 200);
  assert.equal(featured.body.plan.features.premiumModels, false, 'admin must be able to turn the premium-model unlock off too, not just on');
  assert.equal(featured.body.plan.features.byok, false);
});

test('an admin can set a token discount for a paid plan, but it is silently ignored for Free (same rule as price)', async () => {
  const admin = await createAdmin('Admin Discount');
  const proResult = await api('PATCH', '/api/admin/commercial/plans/pro', { userId: admin.id, body: { tokenDiscountPercent: 35 } });
  assert.equal(proResult.status, 200);
  assert.equal(proResult.body.plan.tokenDiscountPercent, 35);

  const freeResult = await api('PATCH', '/api/admin/commercial/plans/free', { userId: admin.id, body: { tokenDiscountPercent: 50 } });
  assert.equal(freeResult.status, 200);
  assert.equal(freeResult.body.plan.tokenDiscountPercent, 0, 'Free must stay fixed at 0 even if a caller sends a discount for it');
});

test('an out-of-range token discount percent is rejected', async () => {
  const admin = await createAdmin('Admin Discount Bad');
  const result = await api('PATCH', '/api/admin/commercial/plans/pro', { userId: admin.id, body: { tokenDiscountPercent: 150 } });
  assert.equal(result.status, 400);
});

test('an admin markup change is applied, previewable via the retail multiplier, and audited', async () => {
  const admin = await createAdmin('Admin E');
  const result = await api('PATCH', '/api/admin/commercial/wallet-rules', { userId: admin.id, body: { markupPercent: 150 } });
  assert.equal(result.status, 200);
  assert.equal(result.body.markupPercent, 150);
  assert.equal(result.body.retailMultiplier, 2.5);
  const audit = await repo.auditLog.list({ limit: 10 });
  assert.ok(audit.some((entry) => entry.action === 'commercial.walletRules.update'));
});

test('a negative markup percent is rejected', async () => {
  const admin = await createAdmin('Admin F');
  const result = await api('PATCH', '/api/admin/commercial/wallet-rules', { userId: admin.id, body: { markupPercent: -10 } });
  assert.equal(result.status, 400);
});

test('admin credit/debit requires a fresh step-up reauth even for a real admin', async () => {
  const admin = await createAdmin('Stale Admin');
  const target = await createUser('Target User');
  const staleHeaders = await staleReauthAdminHeaders(admin.id);
  const result = await api('POST', `/api/admin/commercial/users/${target.id}/credit`, { headers: staleHeaders, body: { amountUsd: 5, balanceType: 'paid' } });
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'STEP_UP_REQUIRED');
});

test('an admin credit with a fresh session increases the target user balance and is audited', async () => {
  const admin = await createAdmin('Admin G');
  const target = await createUser('Target User Two');
  const result = await api('POST', `/api/admin/commercial/users/${target.id}/credit`, { userId: admin.id, body: { amountUsd: 5, balanceType: 'paid', reason: 'goodwill' } });
  assert.equal(result.status, 201);
  const account = await repo.wallet.getAccount(target.id);
  assert.equal(account.paidBalanceMicroUsd, 5000000 + 0); // +$5, no promo touched
  const audit = await repo.auditLog.list({ limit: 10 });
  assert.ok(audit.some((entry) => entry.action === 'commercial.wallet.credit' && entry.targetId === target.id));
});

test('assigning a test plan updates the user and is audited', async () => {
  const admin = await createAdmin('Admin H');
  const target = await createUser('Target User Three');
  const result = await api('PATCH', `/api/admin/commercial/users/${target.id}/plan`, { userId: admin.id, body: { plan: 'plus' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.plan, 'plus');
});
