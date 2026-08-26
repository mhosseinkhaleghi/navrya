import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Commercial System Slice 1 - Free plan quota enforcement (spec section 5/52/53/66), exercised
// through the real HTTP route (server/community/routes.accounts.mjs's createWithQuota() wiring),
// same app.listen(0) + native fetch convention as accounts-api-contract.test.mjs. Accounts (not
// Patterns) is used here since it needs no Instrument Catalog fixture, keeping the test focused
// purely on the quota mechanism rather than an unrelated domain's own validation.

let server, baseUrl, repo;

before(async () => {
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
function account(id) {
  return { id, kind: 'personal', firm: 'IC Markets', status: 'active', currency: 'USD', startDate: '2026-01-01', startingBalance: 1000 };
}

test('Free plan allows exactly 3 accounts and blocks the 4th', async () => {
  const user = await repo.users.create({ displayName: 'Free Trader' });
  for (const id of ['acct-a', 'acct-b', 'acct-c']) {
    const result = await api('POST', '/api/sync/accounts', { userId: user.id, body: account(id) });
    assert.equal(result.status, 200, `expected ${id} to be allowed`);
  }
  const fourth = await api('POST', '/api/sync/accounts', { userId: user.id, body: account('acct-d') });
  assert.equal(fourth.status, 403);
  assert.equal(fourth.body.error, 'PLAN_LIMIT_REACHED');
});

test('deleting one account frees a slot for a new one (current count, not lifetime creations)', async () => {
  const user = await repo.users.create({ displayName: 'Free Trader Two' });
  for (const id of ['x-a', 'x-b', 'x-c']) await api('POST', '/api/sync/accounts', { userId: user.id, body: account(id) });
  await api('DELETE', '/api/sync/accounts/x-a', { userId: user.id });
  const replacement = await api('POST', '/api/sync/accounts', { userId: user.id, body: account('x-d') });
  assert.equal(replacement.status, 200);
});

test('editing an existing account never counts against the limit, even once already at 3', async () => {
  const user = await repo.users.create({ displayName: 'Free Trader Three' });
  for (const id of ['e-a', 'e-b', 'e-c']) await api('POST', '/api/sync/accounts', { userId: user.id, body: account(id) });
  const edited = account('e-a');
  edited.firm = 'Renamed Firm';
  const result = await api('POST', '/api/sync/accounts', { userId: user.id, body: edited });
  assert.equal(result.status, 200);
  assert.equal(result.body.firm, 'Renamed Firm');
});

test('a Plus plan has no account limit', async () => {
  const user = await repo.users.create({ displayName: 'Plus Trader' });
  await repo.users.update(user.id, { plan: 'plus' });
  for (const id of ['p-a', 'p-b', 'p-c', 'p-d', 'p-e']) {
    const result = await api('POST', '/api/sync/accounts', { userId: user.id, body: account(id) });
    assert.equal(result.status, 200);
  }
});

test('two simultaneous requests at 2-of-3 never both succeed and produce 4 (race safety, spec section 53)', async () => {
  const user = await repo.users.create({ displayName: 'Race Trader' });
  await api('POST', '/api/sync/accounts', { userId: user.id, body: account('r-a') });
  await api('POST', '/api/sync/accounts', { userId: user.id, body: account('r-b') });
  const [first, second] = await Promise.all([
    api('POST', '/api/sync/accounts', { userId: user.id, body: account('r-c') }),
    api('POST', '/api/sync/accounts', { userId: user.id, body: account('r-d') })
  ]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [200, 403]);
  const activeAccounts = (await repo.accounts.listByUser(user.id)).filter((a) => a.status !== 'archived');
  assert.equal(activeAccounts.length, 3);
});
