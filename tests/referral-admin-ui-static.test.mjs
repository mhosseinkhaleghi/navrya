import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Static registration checks + a real sandboxed render of the admin Referral Programs console and the user-detail
// "Referral partnership" card, mirroring tests/admin-ai-cost-control-ui.test.mjs's own vm.runInNewContext/FakeNode/
// fetch-stub convention (no shared harness module exists for public/pages/admin/app.js today).
const root = process.cwd();
const source = () => readFile(path.join(root, 'public', 'pages', 'admin', 'app.js'), 'utf8');

let src;
test.before(async () => { src = await source(); });

test('the Referral Programs sub-tab is registered in the nav array and the builder map', () => {
  assert.match(src, /\['cryptoPayments', t\('comSubCryptoPayments'\)\], \['aiCostControl', t\('comSubAiCostControl'\)\], \['referrals', t\('comSubReferrals'\)\]/);
  assert.match(src, /cryptoPayments: commercialCryptoPaymentsSubTab, aiCostControl: commercialAiCostControlSubTab, referrals: commercialReferralsSubTab/);
});
test('the referral partnership card is wired into the user-detail page, right after the verification/KYC card', () => {
  assert.match(src, /verifyCard\.append\(kycField, saveKycBtn\);\s*\n\s*left\.append\(verifyCard\);\s*\n\s*\n\s*left\.append\(refPartnershipCard\(user, referral, referralPrograms \|\| \[\]\)\);/);
  assert.match(src, /userProfilePage\(id\)/);
  assert.match(src, /api\('\/commercial\/referrals\/partners\/' \+ id\)/);
});
test('every refAdmin/refField/refPc/comSubReferrals key is defined (English-only, matching the rest of Commercial admin)', () => {
  const enStart = src.indexOf('const translations = {') + 'const translations = {'.length;
  const enEnd = src.indexOf('\n  fa: {', enStart);
  const enBlock = src.slice(enStart, enEnd);
  for (const key of ['comSubReferrals', 'refAdminReportTitle', 'refAdminProgramsTitle', 'refFieldCommissionPercent', 'refAdminPayoutConfigTitle', 'refPcEnabled', 'refAdminPayoutQueueTitle', 'refAdminPartnershipTitle', 'refAdminMode']) {
    assert.match(enBlock, new RegExp(key + ':'), `missing key ${key}`);
  }
});
test('the payout queue never sends a hash to submit-hash without a non-empty value, and reveal-recipient requires its own explicit click', () => {
  const tab = src.slice(src.indexOf('function refPayoutQueueCard'), src.indexOf('function refDebtsCard'));
  assert.match(tab, /if \(hashInput\.value\.trim\(\)\) doAction\('submit-hash'/);
  assert.match(tab, /reveal-recipient/);
});

class FakeNode {
  constructor(tag) { this.tagName = tag; this.className = ''; this.textContent = ''; this.dataset = {}; this.children = []; this.attributes = {}; this._handlers = {}; this.hidden = false; this.value = ''; this.selected = false; this.style = {}; }
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
function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}
function buildSandbox(fetchImpl) {
  const byId = {};
  ['toast', 'languageButton', 'languageMenu', 'currentLanguage', 'adminGate', 'gateEmail', 'gatePassword', 'gateError', 'gateSubmit',
    'adminLayout', 'adminSidebar', 'sidebarToggle', 'pageTitle', 'adminBody', 'currentUserLabel', 'currentUserName'].forEach((id) => { byId[id] = new FakeNode('div'); byId[id].hidden = true; });
  const document = {
    documentElement: {}, createElement: (tag) => new FakeNode(tag),
    createTextNode: (text) => { const node = new FakeNode('#text'); node.textContent = text; return node; },
    querySelector: (sel) => (sel.startsWith('#') ? byId[sel.slice(1)] || null : null),
    querySelectorAll: () => [], addEventListener() {}
  };
  const windowListeners = {};
  let hash = '';
  const location = { get hash() { return hash; }, set hash(value) { hash = value; (windowListeners.hashchange || []).forEach((fn) => fn()); } };
  class Option { constructor(text, value, defaultSelected, selected) { this.tagName = 'option'; this.text = text; this.textContent = text; this.value = value; this.selected = Boolean(selected); } }
  const sandbox = {
    document, location, localStorage: memoryStorage(), fetch: fetchImpl,
    setTimeout: (fn, delay) => { if (!delay) fn(); return 0; }, clearTimeout() {},
    addEventListener: (type, fn) => { windowListeners[type] = windowListeners[type] || []; windowListeners[type].push(fn); }, removeEventListener() {},
    innerWidth: 1280, TradeJournalDevUserSwitcher: { currentUserId: () => 'admin-1', login: () => Promise.resolve(null), logout: () => {} },
    Option, console, window: undefined
  };
  sandbox.window = sandbox;
  return sandbox;
}
async function loadApp(fetchImpl) {
  const sandbox = buildSandbox(fetchImpl);
  vm.runInNewContext(await source(), sandbox, { filename: 'admin-app.js' });
  return sandbox.window.TradeJournalAdminApp;
}
function findAll(node, predicate, out = []) {
  if (!node || !node.children) return out;
  node.children.forEach((child) => { if (predicate(child)) out.push(child); findAll(child, predicate, out); });
  return out;
}
function allText(node) { return [node.textContent || ''].concat(findAll(node, () => true).map((n) => n.textContent || '')).join(' | '); }

function fakeProgramsResponse() {
  return {
    programs: [{
      id: 'prog-1', kind: 'standard', name: 'Standard Program', status: 'active', isPlatformDefault: true, autoEnrollUnassigned: true,
      publishedVersionId: 'ver-1', versionCount: 1, budgetUsedUsd: 42.5, budgetCapUsd: 1000, budgetRemainingUsd: 957.5,
      versions: [{ id: 'ver-1', programId: 'prog-1', versionNo: 1, status: 'published', commissionBps: 1000, commissionPercent: 10, eligibleSources: ['subscription'], eligiblePlans: null, eligibleProducts: null, attributionWindowDays: 30, holdDays: 14, commissionTermDays: null, cashOutMinimumUsd: 10, programBudgetCapUsd: 1000, perUserCapUsd: null, perCustomerCapUsd: null, campaignCapUsd: null, maxReferredCustomers: null, minMarginUsd: 0, minMarginPercent: 0, paymentFeePercent: 0, serviceCostPercent: 0, payoutAssetPolicy: 'bep20_usdt', effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null }]
    }]
  };
}
function fakePayoutConfigResponse() {
  return { enabled: true, chainId: 56, chainName: 'BNB Smart Chain (BSC)', tokenSymbol: 'USDT', tokenContract: '0x55d398326f99059fF775485246999027B3197955', tokenDecimals: 18, treasurySender: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', minConfirmations: 15, minPayoutUsd: 10, explorerTxUrlTemplate: 'https://bscscan.com/tx/{txHash}', requiredKycStatus: 'verified', reauthMaxAgeMinutes: 10, termsVersion: 'referral-payout-v1', makerCheckerRequired: true, complete: true, rpcConfigured: true };
}
function fakeReportResponse() {
  return {
    range: { from: null, to: null, programId: null },
    funnel: { clicks: 340, uniqueVisitors: 210, signups: 44, flaggedSignups: 2, qualifiedCustomers: 19 },
    liability: { pendingMicroUsd: 5000000, availableMicroUsd: 12000000, convertedAiCreditMicroUsd: 3000000, reservedPayoutMicroUsd: 2000000, paidMicroUsd: 9000000, reversedMicroUsd: 1000000, openDebtMicroUsd: 500000 },
    economics: { netRevenueMicroUsd: 40000000, expectedCostsMicroUsd: 4000000, actualCostsMicroUsd: 3500000, commissionsNetMicroUsd: 8000000, postCommissionContributionMarginMicroUsd: 28000000, actualCostsNote: 'x' },
    payouts: { requested: 3, inReview: 2, paid: 7, rejectedOrCancelled: 1 },
    skippedEarnings: { total: 5, byReason: { CAP_REACHED: 3, MARGIN_GUARD: 2 } },
    byProgram: [], conversions: { count: 4, amountMicroUsd: 3000000 }
  };
}
function fakePayoutsResponse() {
  return { payouts: [{ id: 'payout-1', userId: 'user-referrer-1', status: 'under_review', amountMicroUsd: 15000000, assetSymbol: 'USDT', chainId: 56, tokenContract: '0x55d3', treasurySender: '0x5aAe', atomicAmount: '15000000000000000000', recipientMasked: '0x5aAe…eAed', kycStatusSnapshot: 'verified', emailVerifiedSnapshot: true, termsVersion: 'v1', acknowledgements: {}, policy: {}, requestedAt: '2026-09-01T00:00:00.000Z', txHash: null, verification: null, confirmations: null, hasFlaggedRisk: false }] };
}

function referralFetchImplFor(overrides = {}) {
  const responses = Object.assign({ programs: fakeProgramsResponse(), payoutConfig: fakePayoutConfigResponse(), report: fakeReportResponse(), payouts: fakePayoutsResponse(), debts: { debts: [] }, attributions: { attributions: [] } }, overrides);
  return (url) => {
    const u = String(url);
    if (u.indexOf('/api/admin/config') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ authEnforced: false }) });
    if (u.indexOf('/commercial/referrals/programs') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(responses.programs) });
    if (u.indexOf('/commercial/referrals/payout-config') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(responses.payoutConfig) });
    if (u.indexOf('/commercial/referrals/report') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(responses.report) });
    if (u.indexOf('/commercial/referrals/payouts') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(responses.payouts) });
    if (u.indexOf('/commercial/referrals/debts') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(responses.debts) });
    if (u.indexOf('/commercial/referrals/attributions') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(responses.attributions) });
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'UNEXPECTED_URL: ' + u }) });
  };
}

test('commercialReferralsSubTab renders real program, report, payout-config and payout-queue data from their real endpoints', async () => {
  const app = await loadApp(referralFetchImplFor());
  const node = await app.commercialReferralsSubTab();
  const text = allText(node);
  assert.match(text, /Standard Program/);
  assert.match(text, /active/);
  assert.match(text, /\$957\.5000|957\.50/, 'budget remaining renders'); // fmtMicroUsd uses 4dp, but the plain kvRow value passed is the already-converted $ string
  assert.match(text, /44/, 'signups render');
  assert.match(text, /19/, 'qualified customers render');
  assert.match(text, /under_review/, 'the queued payout status renders');
  assert.match(text, /0x5aAe…eAed/, 'the payout shows the MASKED recipient, never the full address');
  assert.doesNotMatch(text, /0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed/.source === undefined ? /$^/ : new RegExp('5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'), 'the queue view never leaks a full recipient address');
  assert.match(text, /CAP_REACHED/, 'skipped-earning reasons render');
});
test('commercialReferralsSubTab money is always formatted via fmtMicroUsd/refFmtUsd, never a raw microUsd integer printed as dollars', async () => {
  const app = await loadApp(referralFetchImplFor());
  const node = await app.commercialReferralsSubTab();
  const text = allText(node);
  assert.doesNotMatch(text, /\b5000000\b|\b12000000\b|\b40000000\b/, 'a raw micro-USD integer must never appear unformatted');
});

test('userProfilePage renders the Referral partnership card with the real assigned mode and balances, never a raw referred-user field', async () => {
  const fakeUser = { id: 'user-1', displayName: 'Test User', email: 't@example.test', role: 'user', suspendedAt: null, kycStatus: 'verified', profileRole: 'trader', xpTotal: 100, avatarDataUrl: null, achievements: [], subscriptions: [], usageByProvider: [], aiCost: {}, createdAt: '2026-01-01T00:00:00.000Z' };
  const fakePartner = {
    userId: 'user-1', active: { id: 'assign-1', userId: 'user-1', mode: 'influencer', programVersionId: 'ver-1', rateBpsOverride: 2500, ratePercentOverride: 25, effectiveFrom: '2026-02-01T00:00:00.000Z', effectiveTo: null, commissionTermDays: 180, partnershipCapUsd: 5000, perCustomerCapUsd: null, maxReferredCustomers: null, allowedSources: ['subscription'], notes: 'Negotiated Q1 deal', status: 'active', createdBy: 'admin-1', supersededAt: null, createdAt: '2026-02-01T00:00:00.000Z' },
    history: [{ id: 'assign-0', mode: 'disabled', status: 'superseded', notes: null, createdAt: '2026-01-15T00:00:00.000Z' }],
    effective: { mode: 'influencer', canAttribute: true, programId: 'prog-2', programName: 'Creator Partnership', version: null, commissionBps: 2500 },
    code: { publicCode: 'ABCD2345', status: 'active' },
    balances: { pendingMicroUsd: 1000000, availableCashMicroUsd: 2000000, aiConvertedMicroUsd: 0, payoutReservedMicroUsd: 0, paidMicroUsd: 500000, reversedMicroUsd: 0 },
    openDebtMicroUsd: 0, payoutBlocked: false, payoutBlockedReason: null, audit: [{ id: 'a1', action: 'referral.assignment.set', createdAt: '2026-02-01T00:00:00.000Z' }]
  };
  const fetchImpl = (url) => {
    const u = String(url);
    if (u.indexOf('/api/admin/config') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ authEnforced: false }) });
    if (u.indexOf('/commercial/referrals/partners/') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(fakePartner) });
    if (u.indexOf('/commercial/referrals/programs') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(fakeProgramsResponse()) });
    if (u.indexOf('/users/user-1') > -1) return Promise.resolve({ ok: true, json: () => Promise.resolve(fakeUser) });
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'UNEXPECTED_URL: ' + u }) });
  };
  const app = await loadApp(fetchImpl);
  const node = await app.userProfilePage('user-1');
  const text = allText(node);
  assert.match(text, /Referral partnership/);
  assert.match(text, /Creator Partnership/, 'the effective program name renders');
  assert.match(text, /influencer/);
  assert.match(text, /ABCD2345/, 'the referrer\'s own code renders');
  assert.match(text, /Jan 15, 2026.*disabled \(superseded\)/, 'the assignment history renders');
  assert.match(text, /referral\.assignment\.set/, 'the audit log renders');
  // The existing negotiated notes are pre-filled into the (editable) notes <input>'s value - a real <input> never puts its
  // value in textContent, so this checks the actual DOM property field()'s input holds, not a text-walk false negative.
  const notesInputs = findAll(node, (n) => n.tagName === 'input' && n.value === 'Negotiated Q1 deal');
  assert.equal(notesInputs.length, 1, 'the notes field is pre-filled with the existing assignment\'s notes');
  assert.doesNotMatch(text, /referredUserId|customerEmail/i);
});
