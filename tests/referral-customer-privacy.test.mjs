import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';
import { MICRO } from '../server/commercial/referral-rules.mjs';
import { setupProgram, attribute, pay, payoutArgs } from './helpers/referral-repo-scenarios.mjs';
import { RECIPIENT, publishPayoutSettings, restoreFetch } from './helpers/referral-payout-fixtures.mjs';

// GET /api/referrals/me and /ledger are the only server responses a REFERRER ever sees about the people they referred. This
// file builds a world with real referred users (distinctive names/emails), real payments, a real payout, then scans every
// referral customer response byte-for-byte for any of it leaking through - recursively, so a privacy leak buried inside a
// nested object can never hide from a shallow key check.
let server, baseUrl, repo;

before(async () => {
  invalidateCommercialConfigCache();
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { restoreFetch(); await new Promise((resolve) => server.close(resolve)); });

// Each test builds its OWN program world; archiving the previous platform default relinquishes that flag so a fresh one
// can be created (repo.referralPrograms.createProgram enforces "at most one platform default" as a real DB-level constraint).
async function freshProgram(options = {}) {
  for (const program of await repo.referralPrograms.listPrograms()) {
    if (program.status !== 'archived') await repo.referralPrograms.updateProgram(program.id, { status: 'archived' });
  }
  return setupProgram(repo, options);
}

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await authHeadersFor(repo, userId)) };
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// Every string/number leaf of a JSON value, recursively - what a "scan the whole response" check actually needs, since a leak
// could be nested at any depth or inside an array.
function leaves(value, path = '$', out = []) {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) { value.forEach((item, i) => leaves(item, `${path}[${i}]`, out)); return out; }
  if (typeof value === 'object') { for (const [key, v] of Object.entries(value)) leaves(v, `${path}.${key}`, out); return out; }
  out.push([path, value]);
  return out;
}
function assertNeverLeaks(body, forbiddenValues, label) {
  const text = JSON.stringify(body);
  for (const value of forbiddenValues) {
    if (value === null || value === undefined || value === '') continue;
    assert.doesNotMatch(text, new RegExp(escapeRegExp(String(value)), 'i'), `${label} must never contain ${JSON.stringify(value)}`);
  }
}
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

test('the referral customer surface never exposes a referred user\'s identity, purchases, wallet, trades, program internals, or the full recipient address', async () => {
  const ctx = await freshProgram({ commissionBps: 1000, extra: { programBudgetCapUsd: 5000, perUserCapUsd: 5000, perCustomerCapUsd: 5000, minMarginUsd: 1, paymentFeePercent: 2.9 } });
  const referredNames = ['Zephyrine Okonkwo-Vasquez', 'Highly Distinctive Referred Trader'];
  const referredEmails = [];
  const secrets = [];
  for (const name of referredNames) {
    const { referred } = await attribute(repo, ctx, name);
    referredEmails.push(referred.email);
    secrets.push(referred.id, name, referred.email);
    const { tx } = await pay(repo, referred, 40, { confirmedDaysAgo: 2 });
    secrets.push(tx.id);
    // Give the referred user their OWN unrelated trading footprint that must never leak through the REFERRER's view.
    await repo.tradingSessions.upsert(referred.id, { id: 'privacy-session-' + referred.id, market: 'forex', instrument: 'EURUSD', timeframe: '1h' }).catch(() => {});
  }
  await repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 2 * MICRO, idempotencyKey: 'privacy-convert' });
  await publishPayoutSettings(repo, { minPayoutMicroUsd: 1 * MICRO });
  await repo.users.markEmailVerified(ctx.referrer.id);
  await repo.users.updateKyc(ctx.referrer.id, 'verified');
  const payoutResult = await repo.referralPayouts.createRequest(payoutArgs(ctx.referrer.id, 3 * MICRO, 'privacy-payout', { minPayoutMicroUsd: 1 * MICRO }));
  assert.equal(payoutResult.ok, true);
  // Note: the payout REQUEST id itself is the referrer's own record, legitimately shown back to them - only the full
  // recipient address is a real secret here (checked separately below via its masked-form assertion).
  secrets.push(RECIPIENT);

  const me = await api('GET', '/api/referrals/me', { userId: ctx.referrer.id });
  assert.equal(me.status, 200);
  const ledger = await api('GET', '/api/referrals/ledger', { userId: ctx.referrer.id });
  assert.equal(ledger.status, 200);
  const payouts = await api('GET', '/api/referrals/payouts', { userId: ctx.referrer.id });
  assert.equal(payouts.status, 200);
  const payoutConfig = await api('GET', '/api/referrals/payout-config', { userId: ctx.referrer.id });
  assert.equal(payoutConfig.status, 200);

  for (const [label, response] of [['me', me], ['ledger', ledger], ['payouts', payouts], ['payout-config', payoutConfig]]) {
    assertNeverLeaks(response.body, [...referredNames, ...referredEmails, ...secrets], label);
  }

  // The recipient must appear ONLY as its masked form, never the full address, anywhere in the payouts response.
  const payoutText = JSON.stringify(payouts.body);
  assert.doesNotMatch(payoutText, new RegExp(RECIPIENT.slice(2), 'i'));
  assert.match(payoutText, /0x5aAe.{1,3}eAed|recipientMasked/);

  // Whitelist check on GET /me: every leaf key must be one of the documented, aggregate-only fields.
  const allowedRoots = new Set(['enrolled', 'program', 'influencerDisclosure', 'code', 'funnel', 'balances', 'aiConversion', 'cashOut', 'payouts']);
  assert.deepEqual(Object.keys(me.body).sort(), [...allowedRoots].sort());
  const funnelKeys = Object.keys(me.body.funnel).sort();
  assert.deepEqual(funnelKeys, ['clicks', 'qualifiedCustomers', 'signups', 'uniqueVisitors']);
  for (const key of funnelKeys) assert.equal(typeof me.body.funnel[key], 'number', key);
  // No per-referral identifiers anywhere in the funnel or balances (only aggregate counts/money).
  const numericOrCountLeaves = leaves({ funnel: me.body.funnel, balances: me.body.balances });
  for (const [path, value] of numericOrCountLeaves) assert.equal(typeof value, 'number', path);

  // Program internals a customer must never see: caps, budgets, margin parameters, ids.
  const programText = JSON.stringify(me.body.program);
  for (const forbidden of ['CapUsd', 'BudgetUsd', 'marginBps', 'paymentFeeBps', 'serviceCostBps', 'programId', 'versionId', 'assignmentId']) {
    assert.doesNotMatch(programText, new RegExp(forbidden));
  }

  // The ledger carries movement records, never a payment/attribution/transaction id or a counterparty.
  for (const entry of ledger.body.entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['amountMicroUsd', 'createdAt', 'id', 'state', 'type']);
    assertNeverLeaks(entry, secrets, 'ledger entry');
  }

  // The payout history carries only the customer-safe shape.
  for (const payout of payouts.body.payouts) {
    assert.deepEqual(Object.keys(payout).sort(), ['amountMicroUsd', 'assetSymbol', 'cancellable', 'chainId', 'chainName', 'confirmations', 'explorerUrl', 'id', 'paidAt', 'recipientMasked', 'requestedAt', 'statusNote', 'status', 'txHash'].sort());
  }
});

test('a Disabled user sees an empty, honest surface with no code and no false promises', async () => {
  const ctx = await freshProgram({ autoEnroll: false });
  const { parseAssignmentInput } = await import('../server/commercial/referral-rules.mjs');
  const solo = await repo.users.create({ displayName: 'Disabled Solo User' });
  await repo.referralPrograms.assign(solo.id, parseAssignmentInput({ mode: 'disabled' }), { createdBy: ctx.admin.id });
  const me = await api('GET', '/api/referrals/me', { userId: solo.id });
  assert.equal(me.status, 200);
  assert.equal(me.body.enrolled, false);
  assert.equal(me.body.code, null);
  assert.equal(me.body.program.active, false);
});

test('two different referrers never see each other\'s balances, codes or funnel counts', async () => {
  const a = await freshProgram({ commissionBps: 1000 });
  const { referred: referredA } = await attribute(repo, a, 'Referrer A Customer');
  await pay(repo, referredA, 100, { confirmedDaysAgo: 1 });
  await repo.referralPrograms.updateProgram(a.program.id, { status: 'archived' }).catch(() => {});
  const b = await freshProgram({ commissionBps: 500 });

  const meA = await api('GET', '/api/referrals/me', { userId: a.referrer.id });
  const meB = await api('GET', '/api/referrals/me', { userId: b.referrer.id });
  assert.notEqual(meA.body.code.publicCode, meB.body.code.publicCode);
  assert.ok(meA.body.balances.lifetimeEarnedMicroUsd > 0);
  assert.equal(meB.body.balances.lifetimeEarnedMicroUsd, 0, 'B never sees A\'s earnings');
  assertNeverLeaks(meB.body, [meA.body.code.publicCode, a.referrer.id, referredA.id, referredA.email], 'B\'s own summary');
});
