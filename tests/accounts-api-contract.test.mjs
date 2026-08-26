import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

let server, baseUrl, uploadsDir, repo;

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-'));
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(uploadsDir, { recursive: true, force: true });
});

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}
async function createUser(name) {
  return repo.users.create({ displayName: name });
}
// Instrument Catalog domain: a brand-new trade now requires a real, cataloged instrument -
// every fixture trade below needs one seeded for its own user first.
async function seedInstrument(userId, code = 'XAUUSD') {
  return repo.instrumentCatalog.upsert(userId, { id: 'instr-' + userId + '-' + code, code });
}

function propAccount(id) {
  return {
    id, kind: 'prop', firm: 'Atlas Funding', program: 'Evaluation Pro $100K', platform: 'MetaTrader 5',
    numberMasked: '••••4172', status: 'active', currency: 'USD', startDate: '2026-08-01', startingBalance: 100000,
    rules: { profitTargetPercent: 10, dailyLossLimitPercent: 5, maxDrawdownPercent: 10, drawdownType: 'static', minTradingDays: 5, consistencyCapPercent: 40 }
  };
}
function personalAccount(id) {
  return {
    id, kind: 'personal', firm: 'IC Markets', program: 'Live · Raw Spread', platform: 'MetaTrader 5',
    status: 'active', currency: 'USD', startDate: '2026-06-12', startingBalance: 15000,
    rules: { dailyLossCap: 400, maxRiskPerTradePercent: 1, monthlyGoalPercent: 8, maxOpenPositions: 3 }
  };
}

test('a request with no auth is rejected', async () => {
  const result = await api('GET', '/api/sync/accounts');
  assert.equal(result.status, 401);
});

test('POST upserts a prop account and GET reassembles it, with the rules blob normalized by kind', async () => {
  const user = await createUser('Prop Trader');
  const created = await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('acct-a') });
  assert.equal(created.status, 200);
  assert.equal(created.body.kind, 'prop');
  assert.equal(created.body.firm, 'Atlas Funding');
  assert.equal(created.body.rules.profitTargetPercent, 10);
  assert.equal(created.body.rules.kind, 'prop');
  assert.equal(created.body.rules.dailyLossCap, undefined, 'a prop rules blob must not carry personal-only fields');

  const fetched = await api('GET', '/api/sync/accounts/acct-a', { userId: user.id });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.startingBalance, 100000);

  const list = await api('GET', '/api/sync/accounts', { userId: user.id });
  assert.equal(list.body.accounts.length, 1);
});

test('a personal account normalizes to the personal rule shape', async () => {
  const user = await createUser('Personal Trader');
  const created = await api('POST', '/api/sync/accounts', { userId: user.id, body: personalAccount('acct-p') });
  assert.equal(created.body.rules.kind, 'personal');
  assert.equal(created.body.rules.dailyLossCap, 400);
  assert.equal(created.body.rules.profitTargetPercent, undefined, 'a personal rules blob must not carry prop-only fields');
});

test('re-POSTing the same account id is an idempotent upsert, not a duplicate', async () => {
  const user = await createUser('Idempotent Trader');
  await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('acct-b') });
  const changed = propAccount('acct-b');
  changed.startingBalance = 150000;
  const updated = await api('POST', '/api/sync/accounts', { userId: user.id, body: changed });
  assert.equal(updated.body.startingBalance, 150000);
  const list = await api('GET', '/api/sync/accounts', { userId: user.id });
  assert.equal(list.body.accounts.length, 1);
});

test('an account belonging to another user cannot be fetched, upserted, or deleted', async () => {
  const owner = await createUser('Owner');
  const stranger = await createUser('Stranger');
  await api('POST', '/api/sync/accounts', { userId: owner.id, body: propAccount('acct-c') });

  const strangerFetch = await api('GET', '/api/sync/accounts/acct-c', { userId: stranger.id });
  assert.equal(strangerFetch.status, 404);

  const strangerOverwrite = await api('POST', '/api/sync/accounts', { userId: stranger.id, body: propAccount('acct-c') });
  assert.equal(strangerOverwrite.status, 403);
  assert.equal(strangerOverwrite.body.error, 'NOT_ACCOUNT_OWNER');

  const strangerDelete = await api('DELETE', '/api/sync/accounts/acct-c', { userId: stranger.id });
  assert.equal(strangerDelete.status, 403);
});

test('DELETE removes an account with no trades against it', async () => {
  const user = await createUser('Clean Delete');
  await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('acct-d') });
  const deleted = await api('DELETE', '/api/sync/accounts/acct-d', { userId: user.id });
  assert.equal(deleted.status, 204);
  const list = await api('GET', '/api/sync/accounts', { userId: user.id });
  assert.equal(list.body.accounts.length, 0);
});

test('DELETE archives (does not delete) an account that trades still reference', async () => {
  const user = await createUser('Archive Not Delete');
  await seedInstrument(user.id);
  await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('acct-e') });
  await api('POST', '/api/sync/trades', {
    userId: user.id,
    body: { id: 'trade-linked', status: 'closed', direction: 'long', entryMode: 'full', instrument: 'XAUUSD', accountId: 'acct-e', outcome: 'win', pnl: 120 }
  });

  const deleted = await api('DELETE', '/api/sync/accounts/acct-e', { userId: user.id });
  assert.equal(deleted.status, 204, 'the endpoint still reports success even though it archived instead of deleted');

  const fetched = await api('GET', '/api/sync/accounts/acct-e', { userId: user.id });
  assert.equal(fetched.status, 200, 'the account record must still exist - trade history is never orphaned');
  assert.equal(fetched.body.status, 'archived');
  assert.ok(fetched.body.archivedAt);

  const trade = await api('GET', '/api/sync/trades/trade-linked', { userId: user.id });
  assert.equal(trade.body.accountId, 'acct-e', 'the linked trade keeps pointing at the archived account, not nulled out');
});

test('a trade cannot be attached to an account owned by another user', async () => {
  const owner = await createUser('Account Owner');
  const attacker = await createUser('Attacker');
  await api('POST', '/api/sync/accounts', { userId: owner.id, body: propAccount('acct-f') });

  const result = await api('POST', '/api/sync/trades', {
    userId: attacker.id,
    body: { id: 'trade-attack', status: 'hunting', direction: 'long', entryMode: 'full', accountId: 'acct-f' }
  });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'NOT_ACCOUNT_OWNER');
});

test('a trade with accountId:null is unassigned, never rejected', async () => {
  const user = await createUser('Unassigned Trader');
  await seedInstrument(user.id);
  const result = await api('POST', '/api/sync/trades', {
    userId: user.id,
    body: { id: 'trade-unassigned', status: 'hunting', direction: 'long', entryMode: 'full', instrument: 'XAUUSD', accountId: null }
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.accountId, null);
});

// ---- Defect #1: account is mandatory for a brand-new trade once the user has an active account ----

test('a brand-new trade with no accountId is rejected once the user owns an active account', async () => {
  const user = await createUser('Mandatory Account Trader');
  await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('acct-mand-1') });
  const result = await api('POST', '/api/sync/trades', { userId: user.id, body: { id: 'trade-mand-1', status: 'hunting', direction: 'long', entryMode: 'full', accountId: null } });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'ACCOUNT_REQUIRED');
});

test('a brand-new trade with no accountId succeeds when the user has zero accounts at all', async () => {
  const user = await createUser('Zero Account Trader');
  await seedInstrument(user.id);
  const result = await api('POST', '/api/sync/trades', { userId: user.id, body: { id: 'trade-mand-2', status: 'hunting', direction: 'long', entryMode: 'full', instrument: 'XAUUSD', accountId: null } });
  assert.equal(result.status, 200);
  assert.equal(result.body.accountId, null);
});

test('a brand-new trade with no accountId succeeds when the user\'s only account is archived', async () => {
  const user = await createUser('Archived Only Trader');
  await seedInstrument(user.id);
  const created = await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('acct-mand-3') });
  await api('POST', '/api/sync/trades', { userId: user.id, body: { id: 'trade-linked-mand', status: 'closed', direction: 'long', entryMode: 'full', instrument: 'XAUUSD', accountId: 'acct-mand-3', outcome: 'win', pnl: 10 } });
  await api('DELETE', '/api/sync/accounts/acct-mand-3', { userId: user.id }); // archives (a trade references it)
  const fetched = await api('GET', '/api/sync/accounts/acct-mand-3', { userId: user.id });
  assert.equal(fetched.body.status, 'archived');
  const result = await api('POST', '/api/sync/trades', { userId: user.id, body: { id: 'trade-mand-3', status: 'hunting', direction: 'long', entryMode: 'full', instrument: 'XAUUSD', accountId: null } });
  assert.equal(result.status, 200, 'an archived-only account must not count as "an active account exists"');
});

test('EDITING an already-existing trade never gets retroactively forced to pick an account', async () => {
  const user = await createUser('Legacy Trade Editor');
  await seedInstrument(user.id);
  // A trade created back when the user had zero accounts (accountId:null, allowed).
  const created = await api('POST', '/api/sync/trades', { userId: user.id, body: { id: 'trade-legacy-1', status: 'hunting', direction: 'long', entryMode: 'full', instrument: 'XAUUSD', accountId: null } });
  assert.equal(created.status, 200);
  // The user creates their first account AFTER that trade already existed.
  await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('acct-mand-4') });
  // Editing the legacy trade (still accountId:null) must still succeed - never silently rewritten, never rejected.
  const edited = await api('POST', '/api/sync/trades', { userId: user.id, body: { id: 'trade-legacy-1', status: 'hunting', direction: 'long', entryMode: 'full', accountId: null, chartNote: 'edited later' } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.accountId, null);
  assert.equal(edited.body.chartNote, 'edited later');
});

// ---- Defect #3: archived accounts are read-only for new/changed trade assignment ----

test('assigning a NEW trade to an archived account is rejected with ACCOUNT_ARCHIVED', async () => {
  const user = await createUser('Archive Assign Trader');
  await seedInstrument(user.id);
  await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('acct-arch-1') });
  await api('POST', '/api/sync/trades', { userId: user.id, body: { id: 'trade-arch-seed', status: 'closed', direction: 'long', entryMode: 'full', instrument: 'XAUUSD', accountId: 'acct-arch-1', outcome: 'win', pnl: 5 } });
  await api('DELETE', '/api/sync/accounts/acct-arch-1', { userId: user.id }); // archives (referenced by trade-arch-seed)

  const result = await api('POST', '/api/sync/trades', { userId: user.id, body: { id: 'trade-arch-new', status: 'hunting', direction: 'long', entryMode: 'full', instrument: 'XAUUSD', accountId: 'acct-arch-1' } });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'ACCOUNT_ARCHIVED');
});

test('re-pointing an EXISTING trade onto an archived account is rejected, but a trade that already pointed there stays editable', async () => {
  const user = await createUser('Archive Repoint Trader');
  await seedInstrument(user.id);
  await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('acct-arch-2') });
  await api('POST', '/api/sync/accounts', { userId: user.id, body: propAccount('acct-arch-3') });
  await api('POST', '/api/sync/trades', { userId: user.id, body: { id: 'trade-arch-a', status: 'closed', direction: 'long', entryMode: 'full', instrument: 'XAUUSD', accountId: 'acct-arch-2', outcome: 'win', pnl: 5 } });
  await api('DELETE', '/api/sync/accounts/acct-arch-2', { userId: user.id }); // archives

  // Editing trade-arch-a WITHOUT changing its accountId must still succeed.
  const sameAccount = await api('POST', '/api/sync/trades', { userId: user.id, body: { id: 'trade-arch-a', status: 'closed', direction: 'long', entryMode: 'full', instrument: 'XAUUSD', accountId: 'acct-arch-2', outcome: 'win', pnl: 5, chartNote: 'still editable' } });
  assert.equal(sameAccount.status, 200);
  assert.equal(sameAccount.body.chartNote, 'still editable');

  // Re-pointing a DIFFERENT trade onto the now-archived account must fail.
  const repoint = await api('POST', '/api/sync/trades', { userId: user.id, body: { id: 'trade-arch-b', status: 'hunting', direction: 'long', entryMode: 'full', instrument: 'XAUUSD', accountId: 'acct-arch-3' } });
  assert.equal(repoint.status, 200);
  const changeToArchived = await api('POST', '/api/sync/trades', { userId: user.id, body: { id: 'trade-arch-b', status: 'hunting', direction: 'long', entryMode: 'full', instrument: 'XAUUSD', accountId: 'acct-arch-2' } });
  assert.equal(changeToArchived.status, 403);
  assert.equal(changeToArchived.body.error, 'ACCOUNT_ARCHIVED');
});

test('a trade instrument field round-trips', async () => {
  const user = await createUser('Instrument Trader');
  await seedInstrument(user.id);
  const result = await api('POST', '/api/sync/trades', {
    userId: user.id,
    body: { id: 'trade-instrument', status: 'hunting', direction: 'long', entryMode: 'full', instrument: 'XAUUSD' }
  });
  assert.equal(result.body.instrument, 'XAUUSD');
  const fetched = await api('GET', '/api/sync/trades/trade-instrument', { userId: user.id });
  assert.equal(fetched.body.instrument, 'XAUUSD');
});
