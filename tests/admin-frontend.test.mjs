import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const source = () => readFile(path.join(root, 'public', 'pages', 'admin', 'app.js'), 'utf8');

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

class FakeNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; this.attributes = {}; this._handlers = {}; this.hidden = false; this.value = ''; }
  addEventListener(type, fn) { this._handlers[type] = this._handlers[type] || []; this._handlers[type].push(fn); }
  removeEventListener() {}
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  append(...nodes) { this.children.push(...nodes); }
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

function buildSandbox(fetchImpl, switcherStub) {
  const toast = new FakeNode('div');
  const languageButton = new FakeNode('button');
  const languageMenu = new FakeNode('div'); languageMenu.hidden = true;
  const currentLanguage = new FakeNode('span');
  const langButtons = ['fa', 'ar', 'en', 'es'].map((l) => { const b = new FakeNode('button'); b.dataset.language = l; return b; });
  const adminGate = new FakeNode('div'); adminGate.hidden = true;
  const gateEmail = new FakeNode('input');
  const gatePassword = new FakeNode('input');
  const gateError = new FakeNode('p'); gateError.hidden = true;
  const gateSubmit = new FakeNode('button');
  const adminLayout = new FakeNode('div'); adminLayout.hidden = true;
  const adminSidebar = new FakeNode('aside');
  const sidebarToggle = new FakeNode('button');
  const pageTitle = new FakeNode('h1');
  const adminBody = new FakeNode('div');
  const currentUserLabel = new FakeNode('span'); currentUserLabel.hidden = true;
  const currentUserName = new FakeNode('span');
  const tabButtons = ['users', 'ai', 'technical', 'xp', 'marketplace', 'financial'].map((tab) => { const b = new FakeNode('button'); b.dataset.tab = tab; return b; });

  const byId = {
    toast, languageButton, languageMenu, currentLanguage, adminGate, gateEmail, gatePassword, gateError, gateSubmit,
    adminLayout, adminSidebar, sidebarToggle, pageTitle, adminBody, currentUserLabel, currentUserName
  };

  const documentElement = {};
  const document = {
    documentElement,
    createElement: (tag) => new FakeNode(tag),
    createTextNode: (text) => { const node = new FakeNode('#text'); node.textContent = text; return node; },
    querySelector: (sel) => (sel.startsWith('#') ? byId[sel.slice(1)] || null : null),
    querySelectorAll: (sel) => {
      if (sel === '[data-i18n]') return [];
      if (sel === '[data-language]') return langButtons;
      if (sel === '#adminTabs button') return tabButtons;
      return [];
    },
    addEventListener() {}
  };

  // A real browser fires 'hashchange' (asynchronously) whenever location.hash is set, which is
  // exactly what startApp() relies on to render the default tab after redirecting to
  // #/admin/users. Dispatching synchronously to registered listeners here is faithful enough
  // for this sandbox and keeps the tests from needing arbitrary waits.
  const windowListeners = {};
  function addEventListener(type, fn) { windowListeners[type] = windowListeners[type] || []; windowListeners[type].push(fn); }
  function removeEventListener() {}
  let hash = '';
  const location = {
    get hash() { return hash; },
    set hash(value) { hash = value; (windowListeners.hashchange || []).forEach((fn) => fn()); }
  };

  // Real browsers provide a global Option constructor for building <option> elements
  // (new Option(text, value)); userDetailRow()/aiTab()'s role/kyc/provider <select> building
  // relies on it and would ReferenceError without this stub - a vm sandbox has no DOM globals.
  class Option {
    constructor(text, value, defaultSelected, selected) { this.tagName = 'option'; this.text = text; this.textContent = text; this.value = value; this.selected = Boolean(selected); }
  }

  const sandbox = {
    document, location, localStorage: memoryStorage(), fetch: fetchImpl,
    setTimeout: (fn, delay) => { if (!delay) fn(); return 0; }, clearTimeout() {},
    addEventListener, removeEventListener,
    innerWidth: 1280,
    TradeJournalDevUserSwitcher: switcherStub,
    Option,
    console
  };
  sandbox.window = sandbox; // real browsers alias window to the global object itself

  return {
    sandbox,
    els: {
      toast, languageButton, languageMenu, currentLanguage, langButtons, adminGate, gateEmail, gatePassword, gateError, gateSubmit,
      adminLayout, adminSidebar, sidebarToggle, pageTitle, adminBody, currentUserLabel, currentUserName, tabButtons
    }
  };
}

async function load(fetchCallCounter, fetchImplOverride, switcherStub) {
  const fetchImpl = fetchImplOverride || ((...args) => {
    fetchCallCounter.count += 1;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ authEnforced: false }) });
  });
  const { sandbox, els } = buildSandbox(fetchImpl, switcherStub);
  vm.runInNewContext(await source(), sandbox, { filename: 'admin-app.js' });
  return { app: sandbox.window.TradeJournalAdminApp, els, sandbox };
}

test('route() parses all six admin tab hashes and defaults to "users" for anything else', async () => {
  const counter = { count: 0 };
  const { app, sandbox } = await load(counter);
  const cases = [
    ['#/admin/users', 'users'], ['#/admin/ai', 'ai'], ['#/admin/technical', 'technical'],
    ['#/admin/xp', 'xp'], ['#/admin/marketplace', 'marketplace'], ['#/admin/financial', 'financial'],
    ['', 'users'], ['#/admin/unknown', 'users'], ['#/dashboard/hunter', 'users']
  ];
  cases.forEach(([hash, expected]) => {
    sandbox.location.hash = hash;
    assert.equal(app.route(), expected, 'hash ' + JSON.stringify(hash) + ' should route to ' + expected);
  });
});

test('the XP & Segmentation tab fetches real config from GET /xp/config and renders editable tables, not the old placeholder', async () => {
  const xpConfigResponse = {
    points: [{ type: 'session_created', domain: 'session', default: 2, current: 2, overridden: false, updatedAt: null },
      { type: 'trade_calculation_valid', domain: 'trade', default: 2, current: 9, overridden: true, updatedAt: '2026-08-04T00:00:00Z' }],
    domainCaps: [{ domain: 'session', default: 35, current: 35, overridden: false, updatedAt: null }],
    recurringCap: { default: 80, current: 80, overridden: false, updatedAt: null },
    sourceCaps: [{ type: 'session_chart_entry_added', default: 3, current: 3, overridden: false, updatedAt: null }],
    periodCaps: [{ type: 'psych_checkin', default: { max: 2, period: 'day' }, current: { max: 2, period: 'day' }, overridden: false, updatedAt: null }],
    sourceTotalCaps: [{ sourceType: 'trade', default: 18, current: 18, overridden: false, updatedAt: null }],
    achievementPoints: [{ key: 'first_trade_closed', default: 10, current: 10, overridden: false, updatedAt: null }],
    masteryRequirements: [{ level: 2, requirementKey: 'closedSessions', default: 2, current: 2, overridden: false, updatedAt: null }]
  };
  const counter = { count: 0 };
  const fetchImpl = (url) => {
    counter.count += 1;
    if (String(url).indexOf('/xp/config') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(xpConfigResponse) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ authEnforced: false }) });
  };
  const { app } = await load(counter, fetchImpl);
  const beforeCount = counter.count;
  const node = await app.xpTab();
  assert.ok(counter.count > beforeCount, 'the XP tab must fetch real config from the API, not render a static placeholder');
  const texts = findAll(node, () => true).map((n) => n.textContent).join(' | ');
  assert.match(texts, /session_created/, 'a real XP type from the response must render');
  assert.match(texts, /trade_calculation_valid/);
  assert.doesNotMatch(texts, /coming in the next phase/i, 'the old static placeholder copy must be gone');
  const overriddenRow = findAll(node, (n) => n.tagName === 'tr' && n.className.indexOf('admin-xp-overridden') > -1);
  assert.equal(overriddenRow.length, 1, 'exactly the one overridden row (trade_calculation_valid) must get the highlight class');
});

test('on load, the admin gate shows a real login form - no test-mode bypass exists anymore', async () => {
  const counter = { count: 0 };
  const { els } = await load(counter);
  await new Promise((resolve) => setTimeout(resolve, 0)); // let boot()'s config fetch settle
  assert.equal(els.adminGate.hidden, false);
  assert.equal(els.adminLayout.hidden, true, 'the sidebar/topbar shell must stay hidden until a real admin login succeeds');
});

test('submitting valid admin credentials logs in, reveals the sidebar/topbar shell, and loads the default Users tab', async () => {
  const switcherStub = {
    login: ({ email, password }) => { assert.equal(email, 'admin@example.com'); assert.equal(password, 'abcd1234'); return Promise.resolve({ id: 'user-1', role: 'admin', displayName: 'Test Admin' }); },
    logout: () => {}, currentUserId: () => ''
  };
  const fetchImpl = (url) => {
    const u = String(url);
    if (u.indexOf('/api/admin/config') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ authEnforced: true }) });
    if (u.indexOf('/api/admin/users') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ users: [], total: 0, page: 1, pageSize: 20, onlineCount: 0 }) });
    if (u.indexOf('/api/users/me') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1', displayName: 'Test Admin' }) });
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  };
  const { els } = await load({ count: 0 }, fetchImpl, switcherStub);
  await new Promise((resolve) => setTimeout(resolve, 0));
  els.gateEmail.value = 'admin@example.com';
  els.gatePassword.value = 'abcd1234';
  els.gateSubmit._handlers.click[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(els.adminGate.hidden, true);
  assert.equal(els.adminLayout.hidden, false);
  assert.match(els.pageTitle.textContent, /Users/);
  assert.equal(els.currentUserLabel.hidden, false, 'a successful /api/users/me fetch must reveal the topbar user label');
  assert.equal(els.currentUserName.textContent, 'Test Admin');
});

test('a real login that resolves to a non-admin account is rejected, logs the token back out, and never reveals the shell', async () => {
  let loggedOut = false;
  const switcherStub = {
    login: () => Promise.resolve({ id: 'user-2', role: 'user', displayName: 'Regular User' }),
    logout: () => { loggedOut = true; }, currentUserId: () => ''
  };
  const { els } = await load({ count: 0 }, undefined, switcherStub);
  await new Promise((resolve) => setTimeout(resolve, 0));
  els.gateSubmit._handlers.click[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(els.adminLayout.hidden, true, 'a non-admin account must never see the admin shell');
  assert.equal(els.gateError.hidden, false);
  assert.match(els.gateError.textContent, /admin access/i);
  assert.ok(loggedOut, 'the session token for a non-admin account must be discarded, not left stored');
});

test('a rejected login (wrong credentials) shows a translated error and keeps the form open', async () => {
  const invalid = new Error('INVALID_CREDENTIALS'); invalid.code = 'INVALID_CREDENTIALS';
  const switcherStub = { login: () => Promise.reject(invalid), logout: () => {}, currentUserId: () => '' };
  const { els } = await load({ count: 0 }, undefined, switcherStub);
  await new Promise((resolve) => setTimeout(resolve, 0));
  els.gateSubmit._handlers.click[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(els.adminLayout.hidden, true);
  assert.equal(els.gateError.hidden, false);
  assert.match(els.gateError.textContent, /Incorrect email or password/);
});

test('a returning browser with an already-valid admin session token skips the login form entirely', async () => {
  const switcherStub = { login: () => Promise.reject(new Error('must not be called')), logout: () => {}, currentUserId: () => 'existing-token' };
  const fetchImpl = (url) => {
    const u = String(url);
    if (u.indexOf('/api/users/me') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'user-1', role: 'admin', displayName: 'Returning Admin' }) });
    if (u.indexOf('/api/admin/users') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ users: [], total: 0, page: 1, pageSize: 20, onlineCount: 0 }) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ authEnforced: true }) });
  };
  const { els } = await load({ count: 0 }, fetchImpl, switcherStub);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(els.adminLayout.hidden, false, 'an existing admin session should fast-forward past the login form');
});

test('the sidebar-collapse toggle persists its state to localStorage and flips the layout class', async () => {
  const switcherStub = { login: () => Promise.resolve({ id: 'user-1', role: 'admin', displayName: 'Test Admin' }), logout: () => {}, currentUserId: () => '' };
  const fetchImpl = (url) => {
    if (String(url).indexOf('/api/admin/users') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ users: [], total: 0, page: 1, pageSize: 20, onlineCount: 0 }) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ authEnforced: false }) });
  };
  const { els, sandbox } = await load({ count: 0 }, fetchImpl, switcherStub);
  await new Promise((resolve) => setTimeout(resolve, 0));
  els.gateSubmit._handlers.click[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));

  els.sidebarToggle._handlers.click[0]();
  assert.match(els.adminLayout.className, /collapsed/);
  assert.equal(sandbox.localStorage.getItem('tradejournal:admin-sidebar-collapsed'), '1');

  els.sidebarToggle._handlers.click[0]();
  assert.doesNotMatch(els.adminLayout.className, /collapsed/);
  assert.equal(sandbox.localStorage.getItem('tradejournal:admin-sidebar-collapsed'), '0');
});

function findAll(node, predicate, out = []) {
  if (!node || !node.children) return out;
  node.children.forEach((child) => { if (predicate(child)) out.push(child); findAll(child, predicate, out); });
  return out;
}

test('expanding a user row fetches the enriched GET /users/:id detail and renders identity/KYC/level/achievements/subscriptions; Save KYC PATCHes the dedicated endpoint', async () => {
  const switcherStub = { currentUserId: () => 'admin-1' };
  const listUser = { id: 'u1', displayName: 'Jane Trader', role: 'user', suspendedAt: null, createdAt: new Date().toISOString(), lastLoginAt: null, isOnline: false, hoursOnline: 0, purchaseCount: 0, totalMockSpent: 0, totalTokensUsed: 0 };
  const detailUser = {
    id: 'u1', displayName: 'Jane Trader', role: 'user', suspendedAt: null, email: 'jane@example.com', phone: null,
    profileRole: 'trader', kycStatus: 'pending', xpTotal: 120, level: 2, avatarDataUrl: null,
    achievements: [{ achievementKey: 'first_trade_closed', unlockedAt: new Date().toISOString() }],
    subscriptions: [{ purchasedAt: new Date().toISOString(), listing: { title: 'Mentor Access' } }]
  };
  let kycPatchBody = null;
  const fetchImpl = (url, options) => {
    const u = String(url);
    if (u.indexOf('/api/admin/users/u1/kyc') > -1) { kycPatchBody = JSON.parse(options.body); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...detailUser, kycStatus: kycPatchBody.kycStatus }) }); }
    if (u.indexOf('/api/admin/users/u1') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(detailUser) });
    if (u.indexOf('/api/admin/users') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ users: [listUser], total: 1, page: 1, pageSize: 20, onlineCount: 0 }) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ authEnforced: false }) });
  };
  const { app } = await load({ count: 0 }, fetchImpl, switcherStub);

  let wrap = await app.usersTab();
  const [detailBtn] = findAll(wrap, (n) => n.tagName === 'button' && n.textContent === 'Actions');
  assert.ok(detailBtn, 'expected a detail/Actions button for the listed user');
  detailBtn.onclick();

  wrap = await app.usersTab();
  const texts = findAll(wrap, () => true).map((n) => n.textContent).join(' | ');
  assert.match(texts, /jane@example\.com/, 'email must render from the enriched detail response');
  assert.match(texts, /Level 2/, 'level line must use the enriched xpTotal/level');
  assert.match(texts, /First Trade Closed/, 'achievement key must be humanized, not shown raw');
  assert.match(texts, /Mentor Access/, 'subscription must show the joined listing title');

  const kycSelect = findAll(wrap, (n) => n.tagName === 'select').find((select) => select.children.some((opt) => opt.value === 'verified'));
  assert.ok(kycSelect, 'expected a KYC status <select>');
  kycSelect.value = 'verified';
  const saveKycBtn = findAll(wrap, (n) => n.tagName === 'button' && n.textContent === 'Save status')[0];
  assert.ok(saveKycBtn, 'expected a Save status button next to the KYC select');
  saveKycBtn.onclick();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(kycPatchBody, { kycStatus: 'verified' }, 'Save must PATCH /api/admin/users/:id/kyc, not the general /users/:id route');
});

test('the AI tab renders per-provider health badges, a Test now action, a recent-events feed, and a top-users table from GET /ai/health and /users', async () => {
  // Empty usage/pricing on purpose - keeps both bar-chart cards on their "no usage yet" hint
  // branch (this sandbox's FakeNode has no real <canvas> 2D context to draw into), while still
  // exercising the new health/recent-events/top-users sections this test actually targets.
  const healthResponse = {
    providers: [
      { provider: 'openai', status: 'healthy', configured: true, lastEventAt: '2026-08-17T10:00:00Z', lastOk: true, lastErrorCode: null, lastLatencyMs: 220, last24h: { calls: 5, failures: 0, successRatePercent: 100, avgLatencyMs: 210 } },
      { provider: 'anthropic', status: 'disconnected', configured: true, lastEventAt: '2026-08-17T09:00:00Z', lastOk: false, lastErrorCode: 'ANTHROPIC_401', lastLatencyMs: 90, last24h: { calls: 2, failures: 1, successRatePercent: 50, avgLatencyMs: 100 } },
      { provider: 'kimi', status: 'unconfigured', configured: false, lastEventAt: null, lastOk: null, lastErrorCode: null, lastLatencyMs: null, last24h: { calls: 0, failures: 0, successRatePercent: null, avgLatencyMs: null } },
      { provider: 'deepseek', status: 'unknown', configured: true, lastEventAt: null, lastOk: null, lastErrorCode: null, lastLatencyMs: null, last24h: { calls: 0, failures: 0, successRatePercent: null, avgLatencyMs: null } }
    ],
    recent: [{ provider: 'openai', ok: true, errorCode: null, latencyMs: 220, source: 'ai.testConnection', createdAt: '2026-08-17T10:00:00Z' }]
  };
  const topUsersResponse = { users: [{ id: 'u1', displayName: 'Heavy User', totalTokensUsed: 4200 }], total: 1, page: 1, pageSize: 10, onlineCount: 0 };
  const fetchImpl = (url) => {
    const u = String(url);
    if (u.indexOf('/ai/health') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(healthResponse) });
    if (u.indexOf('/ai/usage') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ byProviderAndDay: [], byUser: {}, days: 14 }) });
    if (u.indexOf('/ai/keys') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve([{ provider: 'openai', isSet: true, updatedAt: null }]) });
    if (u.indexOf('/ai/pricing') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    if (u.indexOf('/finance/overview') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ mockRevenue: { total: 0, mock: true }, aiCostByProvider: [], remainingBudgetByProvider: [] }) });
    if (u.indexOf('/api/admin/users') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(topUsersResponse) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ authEnforced: false }) });
  };
  const { app } = await load({ count: 0 }, fetchImpl);
  const node = await app.aiTab();
  const texts = findAll(node, () => true).map((n) => n.textContent).join(' | ');
  assert.match(texts, /Healthy/, 'a provider with a fresh successful event must show the Healthy badge');
  assert.match(texts, /Disconnected/, 'a provider whose most recent event failed must show the Disconnected badge, even with configured:true');
  assert.match(texts, /Not configured/, 'a provider with no key set and no successful event must read as Not configured');
  assert.match(texts, /Not tested yet/, 'a configured provider with no event yet must read as Not tested yet, not Healthy');
  assert.match(texts, /ANTHROPIC_401/, 'the real error code from the last failed event must be shown for a disconnected provider');
  assert.match(texts, /ai.testConnection/, 'the recent-events feed must render the real source label');
  assert.match(texts, /Heavy User/, 'the top-users table must render the real display name from GET /users');
  assert.match(texts, /4,200|4200/, 'the top-users table must render the real token total');
  const testButtons = findAll(node, (n) => n.tagName === 'button' && n.textContent === 'Test now');
  assert.equal(testButtons.length, 4, 'every one of the four providers must have its own Test now action');
});

test('the AI tab still renders key/pricing management when the newer usage/health/finance/topUsers sections fail (e.g. a migration not yet applied)', async () => {
  const failing = { ok: false, json: () => Promise.resolve({ error: 'DB_ERROR' }) };
  const fetchImpl = (url) => {
    const u = String(url);
    if (u.indexOf('/ai/health') > -1 || u.indexOf('/ai/usage') > -1 || u.indexOf('/finance/overview') > -1 || u.indexOf('/api/admin/users') > -1) return Promise.resolve(failing);
    if (u.indexOf('/ai/keys') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve([{ provider: 'openai', isSet: true, updatedAt: null }, { provider: 'anthropic', isSet: false, updatedAt: null }, { provider: 'kimi', isSet: false, updatedAt: null }, { provider: 'deepseek', isSet: false, updatedAt: null }]) });
    if (u.indexOf('/ai/pricing') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ authEnforced: false }) });
  };
  const { app } = await load({ count: 0 }, fetchImpl);
  const node = await app.aiTab();
  const texts = findAll(node, () => true).map((n) => n.textContent).join(' | ');
  assert.doesNotMatch(texts, /Something went wrong/, 'a failure in the newer usage/health/finance/topUsers sections must never take down the whole tab');
  assert.match(texts, /openai/, 'the per-provider key cards must still render');
  const saveKeyButtons = findAll(node, (n) => n.tagName === 'button' && n.textContent === 'Save key');
  assert.equal(saveKeyButtons.length, 4, 'key management must stay fully usable for every provider regardless of the other sections failing');
});
