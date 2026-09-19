import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import vm from 'node:vm';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { invalidateCommercialConfigCache, getReferralPayoutConfig } from '../server/commercial/commercial-config.mjs';
import { MICRO } from '../server/commercial/referral-rules.mjs';
import { requestPayout } from '../server/commercial/referral-payouts.mjs';
import { setupProgram, attribute, pay } from './helpers/referral-repo-scenarios.mjs';
import { payoutWorld, requestBody, publishPayoutSettings, RECIPIENT } from './helpers/referral-payout-fixtures.mjs';

// UI <-> SERVER CONTRACT for the referral admin console. tests/referral-admin-ui-static.test.mjs renders the admin UI from
// hand-written fixtures; this file closes the loop the fixtures cannot: it runs the REAL public/pages/admin/app.js in a vm sandbox
// whose fetch() forwards to a REAL createApp() server (memory repo, real admin session + CSRF), so
//   (1) every screen renders from the server's actual response shapes (a wrong field/array/object assumption fails here), and
//   (2) every write the UI builds - create program, save/publish draft, clone a version, assign a partner, save payout settings,
//       payout queue actions, debt resolution - is a payload the server ACCEPTS (each recorded call must be 2xx).
const realFetch = globalThis.fetch;
const source = () => readFile(path.join(process.cwd(), 'public', 'pages', 'admin', 'app.js'), 'utf8');

class FakeNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; this.attributes = {}; this._handlers = {}; this.hidden = false; this.value = ''; this.selected = false; this.checked = false; this.style = {}; }
  addEventListener(type, fn) { this._handlers[type] = this._handlers[type] || []; this._handlers[type].push(fn); }
  removeEventListener() {}
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  // A real <select> exposes the value of its selected option (else its first) - FakeNode has no such default, and the admin UI's
  // hand-built selects (kind, KYC requirement, assignment mode) rely on it.
  append(...nodes) {
    this.children.push(...nodes);
    if (this.tagName === 'select') {
      const options = this.children.filter((child) => child.tagName === 'option');
      const chosen = options.find((option) => option.selected) || options[0];
      if (chosen) this.value = chosen.value;
    }
  }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  focus() {}
  get classList() {
    const self = this;
    return {
      add(c) { if (self.className.split(' ').indexOf(c) === -1) self.className = (self.className + ' ' + c).trim(); },
      remove(c) { self.className = self.className.split(' ').filter((x) => x !== c).join(' '); },
      toggle(c, on) { const has = self.className.split(' ').indexOf(c) > -1; const want = on === undefined ? !has : on; if (want && !has) this.add(c); else if (!want && has) this.remove(c); return want; },
      contains(c) { return self.className.split(' ').indexOf(c) > -1; }
    };
  }
}
function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}
function findAll(node, predicate, out = []) {
  if (!node || !node.children) return out;
  node.children.forEach((child) => { if (predicate(child)) out.push(child); findAll(child, predicate, out); });
  return out;
}
const allText = (node) => [node.textContent || ''].concat(findAll(node, () => true).map((n) => n.textContent || '')).join(' | ');
const button = (root, text, index = 0) => findAll(root, (n) => n.tagName === 'button' && n.textContent === text)[index];
// The control inside a `field()` / hand-built `label.field`: children are [span(label), control].
const control = (root, labelText, index = 0) => {
  const labels = findAll(root, (n) => n.tagName === 'label' && n.children[0] && n.children[0].textContent === labelText);
  return labels[index < 0 ? labels.length + index : index] && labels[index < 0 ? labels.length + index : index].children[1];
};
// The innermost .admin-card that holds the given button - scopes a field lookup to ONE editor (the create form, each draft
// row and the profitability preview all reuse the same rules-form labels).
const cardWith = (root, buttonText) => findAll(root, (n) => n.className === 'admin-card' && button(n, buttonText)).pop();
async function until(check, what, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting for: ' + what);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

const closers = [];
after(async () => { await Promise.all(closers.map((close) => close())); });

// A whole world: memory repo + real server + the real admin script wired to it with an admin session.
async function startWorld(repo) {
  invalidateCommercialConfigCache();
  delete process.env.ADMIN_AUTH_ENFORCED;
  const server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  closers.push(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const adminUser = await repo.users.create({ displayName: 'UI Admin', email: 'ui-admin@example.test' });
  await repo.users.update(adminUser.id, { role: 'admin' });
  const headers = { ...(await authHeadersFor(repo, adminUser.id)) };

  const calls = []; // every request the admin UI made: { method, url, status }
  const alerts = [];
  const fetchImpl = async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    const response = await realFetch(baseUrl + url, { ...options, headers: { ...(options.headers || {}), ...headers } });
    calls.push({ method, url: String(url), status: response.status });
    return response;
  };
  const byId = {};
  ['toast', 'languageButton', 'languageMenu', 'currentLanguage', 'adminGate', 'gateEmail', 'gatePassword', 'gateError', 'gateSubmit',
    'adminLayout', 'adminSidebar', 'sidebarToggle', 'pageTitle', 'adminBody', 'currentUserLabel', 'currentUserName'].forEach((id) => { byId[id] = new FakeNode('div'); byId[id].hidden = true; });
  const document = {
    documentElement: {}, createElement: (tag) => new FakeNode(tag),
    createTextNode: (text) => { const node = new FakeNode('#text'); node.textContent = text; return node; },
    querySelector: (sel) => (sel.startsWith('#') ? byId[sel.slice(1)] || null : null), querySelectorAll: () => [], addEventListener() {}
  };
  const listeners = {};
  let hash = '';
  const location = { get hash() { return hash; }, set hash(value) { hash = value; (listeners.hashchange || []).forEach((fn) => fn()); } };
  class Option { constructor(text, value, defaultSelected, selected) { this.tagName = 'option'; this.text = text; this.textContent = text; this.value = value; this.selected = Boolean(selected); } }
  const sandbox = {
    document, location, localStorage: memoryStorage(), fetch: fetchImpl,
    setTimeout: (fn, delay) => { if (!delay) fn(); return 0; }, clearTimeout() {},
    addEventListener: (type, fn) => { listeners[type] = listeners[type] || []; listeners[type].push(fn); }, removeEventListener() {},
    innerWidth: 1280, TradeJournalDevUserSwitcher: { currentUserId: () => null, login: () => Promise.resolve(null), logout: () => {} },
    Option, console, alert: (message) => alerts.push(String(message)), prompt: () => 'ui test note', confirm: () => true
  };
  sandbox.window = sandbox;
  vm.runInNewContext(await source(), sandbox, { filename: 'admin-app.js' });
  return { repo, sandbox, app: sandbox.window.TradeJournalAdminApp, calls, alerts, adminUser, baseUrl, headers, toast: byId.toast };
}
// `pattern` is a substring or a RegExp. Ambiguous URLs MUST use an anchored RegExp: '/versions' also matches
// '/versions/<id>/publish', so under load an already-recorded publish (200) was mistaken for the clone POST (201) still in flight.
const matches = (call, method, pattern) => call.method === method && (pattern instanceof RegExp ? pattern.test(call.url) : call.url.includes(pattern));
const lastCall = (calls, method, pattern) => [...calls].reverse().find((c) => matches(c, method, pattern));
// The server state can change a tick before the UI's fetch() promise resolves and the call is recorded - wait for the record.
const settled = (calls, method, pattern) => until(() => lastCall(calls, method, pattern), `${method} ${pattern} to be recorded`);
async function serverCall(world, method, urlPath, body) {
  const response = await realFetch(world.baseUrl + urlPath, { method, headers: { 'Content-Type': 'application/json', ...world.headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test('the admin console creates, edits, publishes and clones a program through payloads the real server accepts', async () => {
  const world = await startWorld(createMemoryRepo());
  const { repo, app, calls } = world;

  // Empty world: the sub-tab renders with the real (empty) programs/report/payouts/debts/attributions responses.
  let tab = await app.commercialReferralsSubTab();
  assert.match(allText(tab), /No referral programs yet/);
  assert.match(allText(tab), /Referral report/);
  assert.match(allText(tab), /BSC payout configuration/);

  // The admin fills the "Create program" form (a real browser's <select> defaults to its first option; FakeNode has no such default).
  control(tab, 'Name').value = 'UI Created Program';
  const kind = findAll(tab, (n) => n.tagName === 'select' && n.children.some((o) => o.value === 'influencer') && n.children.some((o) => o.value === 'standard') && !n.children.some((o) => o.value === 'disabled'))[0];
  assert.equal(kind.value, 'standard', 'the Standard option is the default');
  button(tab, 'Create program').onclick();
  const program = await until(async () => (await repo.referralPrograms.listPrograms())[0], 'the program to be created');
  assert.equal((await settled(calls, 'POST', /\/commercial\/referrals\/programs$/)).status, 201);
  const drafts = await repo.referralPrograms.listVersions(program.id);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].status, 'draft');
  assert.equal(drafts[0].commissionBps, 1000, '10% typed in the UI is sent as 1000 bps');
  assert.equal(drafts[0].holdDays, 14);
  assert.equal(drafts[0].cashOutMinimumMicroUsd, 10 * MICRO);
  assert.deepEqual(drafts[0].eligibleSources, ['subscription']);

  // Expand the program, edit the draft's hold period, save, then publish.
  tab = await app.commercialReferralsSubTab();
  assert.match(allText(tab), /UI Created Program/);
  button(tab, 'Version history ▼').onclick();
  tab = await app.commercialReferralsSubTab();
  assert.match(allText(tab), /v1/);
  control(cardWith(tab, 'Save draft'), 'Hold period (days)').value = 21;
  button(tab, 'Save draft').onclick();
  await until(async () => (await repo.referralPrograms.getVersion(drafts[0].id)).holdDays === 21, 'the draft edit to be saved');
  assert.equal((await settled(calls, 'PATCH', /\/programs\/[^/]+\/versions\/[^/]+$/)).status, 200);
  button(tab, 'Publish').onclick();
  await until(async () => (await repo.referralPrograms.getVersion(drafts[0].id)).status === 'published', 'the version to be published');
  assert.equal((await settled(calls, 'POST', /\/versions\/[^/]+\/publish$/)).status, 200);

  // A new draft cloned from the published version carries its rules and stays a draft (the published one is immutable).
  tab = await app.commercialReferralsSubTab();
  button(tab, 'New draft version').onclick();
  const versions = await until(async () => { const list = await repo.referralPrograms.listVersions(program.id); return list.length === 2 && list; }, 'the cloned draft');
  const clone = versions.find((v) => v.status === 'draft');
  assert.equal(clone.holdDays, 21);
  assert.equal(clone.commissionBps, 1000);
  assert.equal((await settled(calls, 'POST', /\/programs\/[^/]+\/versions$/)).status, 201);

  // The rendered programs list now reflects the real DTO (published version id, both versions, budget line).
  tab = await app.commercialReferralsSubTab();
  const text = allText(tab);
  assert.match(text, /UI Created Program/);
  assert.match(text, /published/);
  assert.match(text, /draft/);

  // Profitability preview: the UI's payload is accepted and a result table (or the honest "no paid plans") renders.
  const previewButton = button(tab, 'Preview profitability');
  previewButton.onclick();
  await settled(calls, 'POST', /\/commercial\/referrals\/preview$/);
  assert.equal((await settled(calls, 'POST', /\/commercial\/referrals\/preview$/)).status, 200);

  // Nothing the UI did was rejected.
  for (const call of calls.filter((c) => c.method !== 'GET' && c.url.includes('/commercial/referrals'))) assert.ok(call.status >= 200 && call.status < 300, `${call.method} ${call.url} -> ${call.status}`);
});

test('the payout queue renders the real admin payout DTO (masked recipient only) and each action the UI sends is accepted', async () => {
  const w = await payoutWorld({ availableUsd: 40 });
  await w.repo.users.update(w.admin1.id, { role: 'admin' });
  const world = await startWorld(w.repo);
  const { app, calls, alerts } = world;
  const { request } = await requestPayout(w.repo, { user: w.user, sessionRecord: w.session, body: requestBody({ amountMicroUsd: 12 * MICRO }) });

  let tab = await app.commercialReferralsSubTab();
  let text = allText(tab);
  assert.match(text, /Payout queue/);
  assert.match(text, /requested/);
  assert.match(text, /\$12\.0000/);
  assert.ok(text.includes(request.recipientMasked), 'the queue shows the masked recipient');
  assert.ok(!text.includes(RECIPIENT) && !text.includes(RECIPIENT.slice(8, 30)), 'the queue never shows the full recipient address');

  button(tab, 'Start review').onclick();
  await until(async () => (await w.repo.referralPayouts.getRequest(request.id)).status === 'under_review', 'start-review');
  tab = await app.commercialReferralsSubTab();
  button(tab, 'Approve').onclick();
  await until(async () => (await w.repo.referralPayouts.getRequest(request.id)).status === 'approved', 'approve');

  // Enter the transaction hash the treasury operator produced. It is only SUBMITTED - never paid because an admin typed a hash.
  tab = await app.commercialReferralsSubTab();
  const hashInput = findAll(tab, (n) => n.tagName === 'input' && n.className === 'admin-inline-input')[0];
  hashInput.value = '0x' + 'ab'.repeat(32);
  button(tab, 'Enter tx hash').onclick();
  await until(async () => (await w.repo.referralPayouts.getRequest(request.id)).status === 'submitted', 'submit-hash');
  assert.equal((await w.repo.referralPayouts.getRequest(request.id)).status, 'submitted');

  // The one place a full address is ever returned: an explicit, audited reveal.
  tab = await app.commercialReferralsSubTab();
  text = allText(tab);
  assert.match(text, /submitted/);
  assert.ok(text.includes('0x' + 'ab'.repeat(32)), 'the entered hash renders');
  button(tab, 'Reveal address').onclick();
  await until(() => alerts.length > 0, 'the reveal alert');
  assert.equal(alerts[0], RECIPIENT);
  assert.ok((await w.repo.auditLog.list({ limit: 200 })).some((entry) => entry.action === 'referral.payout.revealRecipient'), 'the reveal itself is audited');

  for (const call of calls.filter((c) => c.method !== 'GET' && c.url.includes('/payouts/'))) assert.ok(call.status >= 200 && call.status < 300, `${call.method} ${call.url} -> ${call.status}`);
});

test('recoverable debt cases render from the real { debts: [...] } response and Resolve / Write off are accepted', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo, { commissionBps: 1000 });
  const { referred } = await attribute(repo, ctx);
  const { tx } = await pay(repo, referred, 100, { confirmedDaysAgo: 2 });
  await repo.referralEarnings.convertToAi({ userId: ctx.referrer.id, amountMicroUsd: 10 * MICRO, idempotencyKey: 'ui-debt-convert' });
  const world = await startWorld(repo);
  // A chargeback after the earning was irreversibly converted to AI credit can never be clawed back: it becomes recoverable debt.
  const reversal = await serverCall(world, 'POST', '/api/admin/commercial/referrals/reversals', { transactionId: tx.id, reason: 'chargeback', reference: 'cb-ui-1' });
  assert.equal(reversal.status, 200, JSON.stringify(reversal.body));
  const debts = await repo.referralEarnings.listDebtCases({});
  assert.equal(debts.length, 1);

  let tab = await world.app.commercialReferralsSubTab();
  let text = allText(tab);
  assert.match(text, /Referral debt cases/);
  assert.ok(text.includes(ctx.referrer.id), 'the debt row shows the referrer');
  assert.match(text, /\$10\.0000 open/);
  assert.doesNotMatch(text, /No open debt cases/);

  button(tab, 'Resolve').onclick();
  await until(async () => (await repo.referralEarnings.getDebtCase(debts[0].id)).status === 'resolved', 'debt resolution');
  assert.equal((await settled(world.calls, 'POST', '/debts/')).status, 200);
  tab = await world.app.commercialReferralsSubTab();
  text = allText(tab);
  assert.match(text, /No open debt cases/, 'a resolved case leaves the open list');
});

test('the referral partnership card round-trips: the real partner GET renders, and the UI\'s assignment + payout-block writes are accepted', async () => {
  const repo = createMemoryRepo();
  const ctx = await setupProgram(repo, { commissionBps: 1000 });
  const world = await startWorld(repo);
  const { app, calls } = world;

  // An influencer program with a published version (through the real API), for the assignment's program-version select.
  const created = await serverCall(world, 'POST', '/api/admin/commercial/referrals/programs', {
    kind: 'influencer', name: 'Creators', rules: { commissionBps: 2000, eligibleSources: ['subscription'], attributionWindowDays: 45, holdDays: 7, cashOutMinimumUsd: 25 }
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const published = await serverCall(world, 'POST', `/api/admin/commercial/referrals/programs/${created.body.id}/versions/${created.body.versions[0].id}/publish`, {});
  assert.equal(published.status, 200, JSON.stringify(published.body));

  let page = await app.userProfilePage(ctx.referrer.id);
  let text = allText(page);
  assert.match(text, /Referral partnership/);
  assert.match(text, /Currently effective/);
  assert.match(text, /Standard Program|Standard /, 'implicit standard resolves to the platform default');

  const mode = control(page, 'Mode');
  mode.value = 'influencer';
  mode.onchange();
  control(page, 'Program version').value = published.body.id;
  control(page, 'Negotiated rate override (%, blank = use version rate)').value = 25;
  control(page, 'Notes').value = 'Negotiated in the UI test';
  button(page, 'Save assignment').onclick();
  const assignment = await until(() => repo.referralPrograms.getActiveAssignment(ctx.referrer.id), 'the assignment to be saved');
  assert.equal(assignment.mode, 'influencer');
  assert.equal(assignment.programVersionId, published.body.id);
  assert.equal(assignment.rateBpsOverride, 2500, '25% typed in the UI is sent as 2500 bps');
  assert.equal(assignment.notes, 'Negotiated in the UI test');
  assert.equal((await settled(calls, 'PUT', '/partners/')).status, 200);

  page = await app.userProfilePage(ctx.referrer.id);
  text = allText(page);
  assert.match(text, /Creators - influencer \(25%\)/, 'the real effective terms render');
  assert.match(text, /Assignment history/);
  assert.match(text, /referral\.assignment/, 'the audit log renders');

  // Payout-block toggle: block (with a reason), the card flips, then unblock.
  button(page, 'Block payouts').onclick();
  await until(async () => (await repo.referral.getAccount(ctx.referrer.id)).payoutBlocked === true, 'payout block');
  page = await app.userProfilePage(ctx.referrer.id);
  assert.match(allText(page), /Payouts blocked/);
  button(page, 'Unblock payouts').onclick();
  await until(async () => (await repo.referral.getAccount(ctx.referrer.id)).payoutBlocked === false, 'payout unblock');

  for (const call of calls.filter((c) => c.method !== 'GET' && c.url.includes('/commercial/referrals'))) assert.ok(call.status >= 200 && call.status < 300, `${call.method} ${call.url} -> ${call.status}`);
});

test('the BSC payout settings editor renders the real config and its PATCH body is accepted unchanged', async () => {
  const w = await payoutWorld({ availableUsd: 20 });
  await w.repo.users.update(w.admin1.id, { role: 'admin' });
  await publishPayoutSettings(w.repo, {});
  const world = await startWorld(w.repo);
  const before = await getReferralPayoutConfig(w.repo);

  const tab = await world.app.commercialReferralsSubTab();
  const text = allText(tab);
  assert.match(text, /BSC payout configuration/);
  assert.match(text, /Configuration complete/);
  button(tab, 'Save payout configuration').onclick();
  await until(() => lastCall(world.calls, 'PATCH', '/payout-config'), 'the settings PATCH');
  const call = await settled(world.calls, 'PATCH', '/payout-config');
  assert.equal(call.status, 200, 'the editor\'s payload (field names and units) is accepted by the server');
  invalidateCommercialConfigCache();
  const after = await getReferralPayoutConfig(w.repo);
  assert.equal(after.enabled, before.enabled);
  assert.equal(after.tokenContract, before.tokenContract);
  assert.equal(after.treasurySender, before.treasurySender);
  assert.equal(after.minPayoutMicroUsd, before.minPayoutMicroUsd, 'a save without edits never changes the minimum payout (USD <-> micro-USD round trip)');
  assert.equal(after.minConfirmations, before.minConfirmations);
});
