import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { createSession } from '../server/community/security/session-service.mjs';
import { issueCsrfToken } from '../server/community/security/csrf.mjs';
import { sessionCookieName, csrfCookieName } from '../server/community/security/cookies.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';
import { MICRO } from '../server/commercial/referral-rules.mjs';
import { requestPayout } from '../server/commercial/referral-payouts.mjs';
import { payoutWorld, requestBody, restoreFetch } from './helpers/referral-payout-fixtures.mjs';

// The customer Referral Marketing tab (navrya-src/accountProfileView.jsx) is React/JSX and is not rendered here. This file locks
// its DATA CONTRACT against the REAL server instead: every property the component reads off /api/referrals/me, /payout-config and
// a payout row is extracted from the JSX source and must exist in the real response (so renaming a DTO field, or the UI reading a
// field the server never sends, fails here), and every server error code the component branches on must really be what the server
// answers - which also proves the exact request body the UI sends is accepted.
let world, server, baseUrl, referrerId, jsx;

before(async () => {
  invalidateCommercialConfigCache();
  world = await payoutWorld({ availableUsd: 40 });
  referrerId = world.ctx.referrer.id;
  server = createApp({ repo: world.repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  jsx = await readFile(path.join(process.cwd(), 'navrya-src', 'accountProfileView.jsx'), 'utf8');
});
after(async () => { restoreFetch(); await new Promise((resolve) => server.close(resolve)); });

async function call(method, urlPath, { body, headers } = {}) {
  const response = await fetch(baseUrl + urlPath, { method, headers: { 'Content-Type': 'application/json', ...(headers || await authHeadersFor(world.repo, referrerId)) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function staleHeaders(userId) {
  const { rawId, record } = await createSession(world.repo, { userId, reauth: false });
  const csrfToken = issueCsrfToken(record.id);
  return { Cookie: `${sessionCookieName()}=${rawId}; ${csrfCookieName()}=${csrfToken}`, 'x-csrf-token': csrfToken };
}
const tabSource = () => jsx.slice(jsx.indexOf('function fmtRefUsd'), jsx.indexOf('function SubscriptionTab'));
function readPaths(source, root) {
  // `me.balances.pendingMicroUsd` -> ['balances', 'pendingMicroUsd'] (only plain property reads, never method calls)
  const paths = new Set();
  const re = new RegExp(`\\b${root}((?:\\.[A-Za-z_]\\w*)+)(?!\\w|\\()`, 'g');
  let match;
  while ((match = re.exec(source))) paths.add(match[1].slice(1));
  return [...paths];
}
function has(object, dotted) {
  let cursor = object;
  for (const key of dotted.split('.')) {
    if (cursor === null || typeof cursor !== 'object' || !(key in cursor)) return false;
    cursor = cursor[key];
  }
  return true;
}

test('every property the tab reads off GET /api/referrals/me exists in the real response', async () => {
  await requestPayout(world.repo, { user: world.user, sessionRecord: world.session, body: requestBody({ amountMicroUsd: 12 * MICRO }) });
  const me = await call('GET', '/api/referrals/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.enrolled, true);
  const paths = readPaths(tabSource(), 'me').filter((p) => !p.startsWith('payouts.'));
  assert.ok(paths.length >= 15, `sanity: extracted ${paths.length} reads of me.*`);
  const conditional = new Set(['influencerDisclosure']); // present always, but only used as a flag
  for (const dotted of paths) assert.ok(has(me.body, dotted) || conditional.has(dotted), `the UI reads me.${dotted} but the server response has no such field`);
  // Aliases the component assigns (const rate = me.program; funnel/balances props): check those too.
  for (const dotted of readPaths(tabSource(), 'rate')) assert.ok(has(me.body.program, dotted), `the UI reads program.${dotted} (via 'rate') but the server response has no such field`);
  for (const dotted of readPaths(tabSource(), 'balances')) assert.ok(has(me.body.balances, dotted), `the UI reads balances.${dotted} but the server response has no such field`);
  for (const dotted of readPaths(tabSource(), 'funnel')) assert.ok(has(me.body.funnel, dotted), `the UI reads funnel.${dotted} but the server response has no such field`);
});

test('every property the payout history and the payout form read (payout row, payout-config) exists in the real responses', async () => {
  const me = await call('GET', '/api/referrals/me');
  assert.ok(me.body.payouts.length >= 1);
  for (const dotted of readPaths(tabSource().slice(tabSource().indexOf('function ReferralPayoutHistory'), tabSource().indexOf('function ReferralPayoutCard')), 'p')) {
    assert.ok(has(me.body.payouts[0], dotted), `the UI reads payout.${dotted} but the server payout row has no such field`);
  }
  const config = await call('GET', '/api/referrals/payout-config');
  assert.equal(config.status, 200);
  const cardSource = tabSource().slice(tabSource().indexOf('function ReferralPayoutCard'), tabSource().indexOf('function ReferralMarketingTab'));
  for (const dotted of readPaths(cardSource, 'config')) assert.ok(has(config.body, dotted), `the UI reads config.${dotted} but /payout-config has no such field`);
  // The customer config never carries the treasury sender or any secret.
  assert.equal('treasurySender' in config.body, false);
});

test('every blocker code the tab has a message for is a code the server actually emits, and a real blocker maps to a message', async () => {
  const uiCodes = [...tabSource().matchAll(/([A-Z][A-Z_]+):\s*'ref[A-Za-z]+'/g)].map((m) => m[1]);
  assert.deepEqual(uiCodes.sort(), ['BELOW_MINIMUM', 'DEBT_OPEN', 'EMAIL_NOT_VERIFIED', 'KYC_REQUIRED', 'PAYOUT_BLOCKED', 'PAYOUT_DISABLED']);
  const reports = await readFile(path.join(process.cwd(), 'server', 'commercial', 'referral-reports.mjs'), 'utf8');
  for (const code of uiCodes) assert.ok(reports.includes(`'${code}'`), `${code} is not a blocker the server emits`);
  // A real, blocked account: below the cash-out minimum.
  const solo = await world.repo.users.create({ displayName: 'Low Balance Referrer', email: 'lowbal@example.test' });
  const meSolo = await call('GET', '/api/referrals/me', { headers: await authHeadersFor(world.repo, solo.id) });
  assert.equal(meSolo.body.cashOut.enabled, false);
  for (const blocker of meSolo.body.cashOut.blockers) assert.ok(uiCodes.includes(blocker), `blocker ${blocker} has no customer-facing message`);
});

test('the exact request the payout form sends is accepted, and the error codes it branches on are the codes the server returns', async () => {
  // The body keys the component sends (see the JSON.stringify in submitRequest).
  const source = tabSource();
  for (const key of ['amountMicroUsd', 'address', 'confirmAddress', 'acceptedTermsVersion', 'acknowledgeIrreversible', 'acknowledgeNetwork', 'idempotencyKey']) {
    assert.ok(source.includes(key), `the payout form no longer sends ${key}`);
  }
  const good = requestBody({ amountMicroUsd: 11 * MICRO });
  const config = await call('GET', '/api/referrals/payout-config');
  assert.equal(good.acceptedTermsVersion, config.body.termsVersion, 'the UI echoes the terms version the server published');

  // 1. addresses that differ -> ADDRESS_MISMATCH (the UI shows its own translated message for this code)
  const mismatch = await call('POST', '/api/referrals/payouts', { body: { ...good, confirmAddress: '0x' + '1'.repeat(40) } });
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.error, 'ADDRESS_MISMATCH');
  // 2. a malformed address -> INVALID_ADDRESS
  const invalid = await call('POST', '/api/referrals/payouts', { body: { ...good, address: '0xnothex', confirmAddress: '0xnothex' } });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, 'INVALID_ADDRESS');
  for (const code of ['ADDRESS_MISMATCH', 'INVALID_ADDRESS', 'REAUTH_REQUIRED']) assert.ok(source.includes(`'${code}'`), `the UI no longer handles ${code}`);
  // 3. a stale session -> 401 REAUTH_REQUIRED, which is what opens the password confirmation dialog
  const stale = await call('POST', '/api/referrals/payouts', { body: good, headers: await staleHeaders(referrerId) });
  assert.equal(stale.status, 401);
  assert.equal(stale.body.error, 'REAUTH_REQUIRED');
  // 4. after the reauth the UI performs (POST /api/auth/reauth with { password }), the same request is created.
  assert.ok(source.includes("'/api/auth/reauth'") && source.includes('JSON.stringify({ password })'));
  const created = await call('POST', '/api/referrals/payouts', { body: good });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  for (const dotted of ['id', 'status', 'amountMicroUsd', 'recipientMasked', 'cancellable']) assert.ok(dotted in created.body, dotted);
  assert.equal(created.body.status, 'requested');
  assert.ok(!JSON.stringify(created.body).toLowerCase().includes(good.address.slice(4).toLowerCase()), 'the full address is never echoed back');
});

test('the conversion request the tab sends ({ amountMicroUsd, idempotencyKey }) is accepted and reflected in the next /me', async () => {
  assert.ok(tabSource().includes("'/api/referrals/convert-to-ai'") && tabSource().includes('amountMicroUsd, idempotencyKey'));
  const before = (await call('GET', '/api/referrals/me')).body;
  const amount = 2 * MICRO;
  const converted = await call('POST', '/api/referrals/convert-to-ai', { body: { amountMicroUsd: amount, idempotencyKey: 'ui-convert-' + Date.now() } });
  assert.equal(converted.status, 201, JSON.stringify(converted.body));
  const after = (await call('GET', '/api/referrals/me')).body;
  assert.equal(after.balances.aiConvertedMicroUsd, before.balances.aiConvertedMicroUsd + amount);
  assert.equal(after.aiConversion.availableMicroUsd, before.aiConversion.availableMicroUsd - amount);
});

test('a payout row\'s cancel action is offered only while cancellable, and the server enforces the same rule', async () => {
  const me = (await call('GET', '/api/referrals/me')).body;
  const open = me.payouts.find((p) => p.cancellable);
  assert.ok(open, 'a freshly requested payout is cancellable');
  const cancelled = await call('POST', `/api/referrals/payouts/${open.id}/cancel`, { body: {} });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.status, 'cancelled');
  assert.equal(cancelled.body.cancellable, false);
  const again = await call('POST', `/api/referrals/payouts/${open.id}/cancel`, { body: {} });
  assert.equal(again.status, 409);
});
