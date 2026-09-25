import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';
import { reserveForAiCall, settleAiCall, toMicroUsd } from '../server/commercial/wallet-service.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { loadJsx, visibleText } from './helpers/render-jsx.mjs';

// Customer-facing AI billing. Provider API cost, provider pricing, markup and margins are internal/admin-only and
// must be absent from every customer DTO (a response body is readable by anyone with devtools, so hiding them in React
// would not be enough); the ONE AI number a customer sees is what was actually debited from THEIR wallet - the settled
// ledger movement, including promo-balance use and the plan's discount. The admin reports keep the raw figures.

const root = process.cwd();
let server, baseUrl, repo;

before(async () => {
  invalidateCommercialConfigCache();
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
  return { status: response.status, text, body: text ? JSON.parse(text) : null };
}

// Two providers, three models, each with its own model-level price.
async function seedPricing() {
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-5.6-luna', promptPricePer1k: 0.01, completionPricePer1k: 0.03, enabled: true });
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-4o', promptPricePer1k: 0.005, completionPricePer1k: 0.015, enabled: true });
  await repo.providerModelPricing.upsert({ provider: 'gemini', model: 'gemini-2.5-flash', promptPricePer1k: 0.0003, completionPricePer1k: 0.0025, enabled: true });
}

// One real AI call the way the gateway does it: reserve, settle from real usage, then record the usage event.
async function aiCall(user, provider, model, usage) {
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'aiChat', provider, model, payload: { input: 'x' } });
  assert.equal(gate.ok, true, provider + '/' + model + ' must be billable');
  const settled = await settleAiCall(repo, { reservationId: gate.reservationId, provider, model, feature: 'aiChat', usage });
  await repo.usageEvents.create({
    userId: user.id, provider, model, feature: 'aiChat', promptTokens: usage.promptTokens, completionTokens: usage.completionTokens,
    totalTokens: usage.promptTokens + usage.completionTokens, source: 'gateway-dispatch', origin: 'gateway',
    providerCostMicroUsd: settled.ledgerEntry.providerCostMicroUsd, retailChargeMicroUsd: settled.ledgerEntry.retailChargeMicroUsd,
    tokenDiscountPercent: settled.ledgerEntry.tokenDiscountPercent, linkedLedgerIdempotencyKey: 'ai-settle:' + gate.reservationId
  });
  return settled.ledgerEntry;
}

const FORBIDDEN = /providerCost|providerPrice|markup|retailMultiplier|retailCharge|reconcil|margin/i;
const ROW_FIELDS = ['calls', 'model', 'provider', 'totalTokens', 'walletDebitMicroUsd'];

async function scenario() {
  await seedPricing();
  const user = await repo.users.create({ displayName: 'Subscriber ' + Math.random().toString(36).slice(2, 7) });
  await repo.users.update(user.id, { plan: 'pro' }); // the plan's token discount applies to the retail charge
  const admin = await repo.users.update((await repo.users.create({ displayName: 'Ledger Admin' })).id, { role: 'admin' });
  // A paid balance next to the $0.50 signup promo, so the first settlement spends promo AND paid (both buckets).
  await repo.wallet.grant(user.id, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: toMicroUsd(5), adminUserId: admin.id, sourceAction: 'goodwill credit', idempotencyKey: 'seed-credit-' + user.id, metadata: { note: 'internal reason' } });
  const before = await repo.wallet.getAccount(user.id);
  const entries = [
    await aiCall(user, 'openai', 'gpt-5.6-luna', { promptTokens: 20000, completionTokens: 10000 }),
    await aiCall(user, 'openai', 'gpt-5.6-luna', { promptTokens: 1000, completionTokens: 1000 }),
    await aiCall(user, 'openai', 'gpt-4o', { promptTokens: 4000, completionTokens: 2000 }),
    await aiCall(user, 'gemini', 'gemini-2.5-flash', { promptTokens: 50000, completionTokens: 20000 })
  ];
  const after = await repo.wallet.getAccount(user.id);
  return { user, admin, entries, before, after };
}

test('the customer AI usage DTO has exactly the customer fields - no provider cost, pricing, markup, retail or margin data anywhere in the response', async () => {
  const s = await scenario();
  const result = await api('GET', '/api/users/me/ai-usage-by-model', { userId: s.user.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.byModel.length, 3);
  for (const row of result.body.byModel) assert.deepEqual(Object.keys(row).sort(), ROW_FIELDS, row.provider + '/' + row.model);
  assert.doesNotMatch(result.text, FORBIDDEN, 'no forbidden field name or word anywhere in the raw body');
  // ...and the same when scoped to a window.
  const recent = await api('GET', '/api/users/me/ai-usage-by-model?days=30', { userId: s.user.id });
  assert.doesNotMatch(recent.text, FORBIDDEN);
  assert.equal(recent.body.byModel.length, 3);
});

test('the wallet debit shown per model EQUALS the settled ledger movement (promo + paid, after the plan discount), and the rows add up to what the wallet really lost', async () => {
  const s = await scenario();
  const result = await api('GET', '/api/users/me/ai-usage-by-model', { userId: s.user.id });
  const byKey = new Map(result.body.byModel.map((row) => [row.provider + '/' + row.model, row]));

  const movement = (entries) => entries.reduce((sum, entry) => sum - (entry.cashDeltaMicroUsd + entry.promoDeltaMicroUsd), 0);
  assert.equal(byKey.get('openai/gpt-5.6-luna').walletDebitMicroUsd, movement(s.entries.slice(0, 2)));
  assert.equal(byKey.get('openai/gpt-4o').walletDebitMicroUsd, movement(s.entries.slice(2, 3)));
  assert.equal(byKey.get('gemini/gemini-2.5-flash').walletDebitMicroUsd, movement(s.entries.slice(3)));
  assert.equal(byKey.get('openai/gpt-5.6-luna').calls, 2);

  // Promo balance was really involved (the first charge drained the $0.50 signup credit first), and the plan discount
  // really applied - so this is not a trivially-equal scenario.
  assert.ok(s.entries.some((entry) => entry.promoDeltaMicroUsd < 0), 'promo credit was spent');
  assert.ok(s.entries.some((entry) => entry.cashDeltaMicroUsd < 0), 'paid balance was spent too');
  assert.ok(s.entries.every((entry) => entry.tokenDiscountPercent === 20), 'the Pro plan discount applied to every charge');

  const totalDebited = result.body.byModel.reduce((sum, row) => sum + row.walletDebitMicroUsd, 0);
  const lost = (s.before.paidBalanceMicroUsd + s.before.promoBalanceMicroUsd) - (s.after.paidBalanceMicroUsd + s.after.promoBalanceMicroUsd);
  assert.equal(totalDebited, lost, 'the customer-visible total is exactly what left the wallet');
  assert.equal(totalDebited, s.entries.reduce((sum, entry) => sum + entry.retailChargeMicroUsd, 0), 'and it is the discounted retail charge, never the provider cost');
});

test('a usage event that was never settled against the wallet shows a ZERO debit - the retail figure stored on the usage event is not a charge', async () => {
  await seedPricing();
  const user = await repo.users.create({ displayName: 'Unbilled ' + Math.random().toString(36).slice(2, 7) });
  await repo.usageEvents.create({ userId: user.id, provider: 'gemini', model: 'gemini-2.5-flash', totalTokens: 500, source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 1000, retailChargeMicroUsd: 3000 });
  const result = await api('GET', '/api/users/me/ai-usage-by-model', { userId: user.id });
  assert.equal(result.body.byModel.length, 1);
  assert.equal(result.body.byModel[0].totalTokens, 500);
  assert.equal(result.body.byModel[0].walletDebitMicroUsd, 0, 'enforcement-off usage records what a charge WOULD have been; the wallet was not debited');
});

test('the customer wallet ledger omits provider cost, markup, retail and admin/idempotency internals, keeps what the UI shows, and matches the usage DTO', async () => {
  const s = await scenario();
  const ledger = await api('GET', '/api/sync/wallet/ledger', { userId: s.user.id });
  assert.equal(ledger.status, 200);
  assert.doesNotMatch(ledger.text, /providerCost|markup|retailMultiplier|retailCharge|adminUserId|idempotencyKey|tokenDiscountPercent|"metadata"/);
  const settlements = ledger.body.entries.filter((entry) => entry.type === 'AI_SETTLEMENT');
  assert.equal(settlements.length, 4);
  for (const entry of settlements) {
    assert.ok(entry.provider && entry.model, 'the customer can still tell WHAT was charged');
    assert.equal(entry.feature, 'aiChat');
    assert.ok(entry.cashDeltaMicroUsd + entry.promoDeltaMicroUsd < 0);
    assert.ok(entry.createdAt);
  }
  const credit = ledger.body.entries.find((entry) => entry.type === 'ADMIN_CREDIT');
  assert.equal(credit.sourceAction, 'goodwill credit', 'the customer-visible reason is kept');
  assert.equal('adminUserId' in credit, false, 'which admin did it is internal');
  assert.equal('metadata' in credit, false);

  const usage = await api('GET', '/api/users/me/ai-usage-by-model', { userId: s.user.id });
  const fromLedger = settlements.reduce((sum, entry) => sum - (entry.cashDeltaMicroUsd + entry.promoDeltaMicroUsd), 0);
  assert.equal(usage.body.byModel.reduce((sum, row) => sum + row.walletDebitMicroUsd, 0), fromLedger);
});

test('admin reporting is untouched: the raw provider cost, retail charge and markup are still available to admins', async () => {
  const s = await scenario();
  const perUser = await api('GET', '/api/admin/users/' + s.user.id, { userId: s.admin.id });
  assert.equal(perUser.status, 200);
  assert.ok(perUser.body.aiCost.providerCostMicroUsd > 0, 'per-user provider cost remains');
  assert.ok(perUser.body.aiCost.retailChargeMicroUsd > 0);
  const byModel = await api('GET', '/api/admin/ai/usage-by-model', { userId: s.admin.id });
  const luna = byModel.body.byModel.find((row) => row.model === 'gpt-5.6-luna');
  assert.ok(luna.providerCostMicroUsd > 0 && luna.retailChargeMicroUsd > 0);
  const rawLedger = await repo.wallet.ledgerForUser(s.user.id, { limit: 50 });
  const settlement = rawLedger.find((entry) => entry.type === 'AI_SETTLEMENT');
  for (const field of ['providerCostMicroUsd', 'retailChargeMicroUsd', 'markupPercent', 'retailMultiplier']) assert.ok(field in settlement, 'the stored ledger row still carries ' + field);
});

test('server-side pricing stays per provider and model: an unpriced provider fails closed and each model settles at its own rate - no cross-provider fallback or pricing bleed', async () => {
  await seedPricing();
  const user = await repo.users.create({ displayName: 'No Bleed ' + Math.random().toString(36).slice(2, 7) });
  await repo.wallet.grant(user.id, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: toMicroUsd(5), idempotencyKey: 'nb-' + user.id });
  const unpriced = await reserveForAiCall(repo, { userId: user.id, feature: 'aiChat', provider: 'anthropic', model: 'claude-sonnet-4-5', payload: { input: 'x' } });
  assert.equal(unpriced.ok, false);
  assert.equal(unpriced.reason, 'PROVIDER_PRICING_NOT_CONFIGURED', 'OpenAI and Gemini being priced never prices Claude');
  const usage = { promptTokens: 10000, completionTokens: 10000 };
  const openai = await aiCall(user, 'openai', 'gpt-5.6-luna', usage);
  const gemini = await aiCall(user, 'gemini', 'gemini-2.5-flash', usage);
  // The same tokens cost each provider's own price: openai (0.01 + 0.03) x 10 vs gemini (0.0003 + 0.0025) x 10, before the same markup.
  assert.equal(openai.providerCostMicroUsd, toMicroUsd(0.4));
  assert.equal(gemini.providerCostMicroUsd, toMicroUsd(0.028));
  assert.equal(openai.retailMultiplier, gemini.retailMultiplier, 'only the provider cost differs - one markup rule, applied per settled call');
});

// ---- the customer UI: what is rendered, and how it is scoped ------------------------------------------------------

const ROWS = [
  { provider: 'openai', model: 'gpt-5.6-luna', calls: 2, totalTokens: 32000, walletDebitMicroUsd: 1200000 },
  { provider: 'openai', model: 'gpt-4o', calls: 1, totalTokens: 6000, walletDebitMicroUsd: 340000 },
  { provider: 'gemini', model: 'gemini-2.5-flash', calls: 5, totalTokens: 70000, walletDebitMicroUsd: 90000 },
  // A stray field a server bug could add: it must never be rendered.
  { provider: 'gemini', model: 'gemini-2.5-flash-lite', calls: 1, totalTokens: 100, walletDebitMicroUsd: 1000, providerCostMicroUsd: 987654 }
];
const I18N = {
  t: (key, vars) => key + (vars && vars.engine ? '[' + vars.engine + ']' : ''),
  number: (value) => String(value)
};

let selectors, view, jsx;
before(async () => {
  selectors = await import(pathToFileURL(path.join(root, 'navrya-src', 'aiWalletUsage.js')).href);
  jsx = await loadJsx({ view: 'navrya-src/aiWalletUsageView.jsx' });
  view = jsx.modules.view;
});
after(() => jsx && jsx.cleanup());

test('selectors are exact: an engine view sees only its own provider, a model view is the exact (provider, model) row - never the first row of the provider', () => {
  assert.deepEqual(selectors.rowsForEngine(ROWS, 'openai').map((row) => row.model), ['gpt-5.6-luna', 'gpt-4o']);
  assert.deepEqual(selectors.rowsForEngine(ROWS, 'gemini').map((row) => row.model), ['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  assert.deepEqual(selectors.rowsForEngine(ROWS, 'anthropic'), [], 'an engine with no usage has no rows - no fallback to another engine');

  const exact = selectors.rowForModel(ROWS, 'openai', 'gpt-4o');
  assert.equal(exact.model, 'gpt-4o');
  assert.equal(exact.walletDebitMicroUsd, 340000, 'not gpt-5.6-luna, which is openai\'s FIRST row');
  assert.equal(selectors.rowForModel(ROWS, 'openai', 'gpt-4.1'), null, 'a model with no usage has no row - never a sibling model\'s');
  assert.equal(selectors.rowForModel(ROWS, 'gemini', 'gpt-4o'), null, 'a model name never matches across providers');

  const openaiTotal = selectors.engineTotal(ROWS, 'openai');
  assert.equal(openaiTotal.walletDebitMicroUsd, 1540000);
  assert.equal(openaiTotal.calls, 3);
  assert.equal(selectors.engineTotal(ROWS, 'gemini').walletDebitMicroUsd, 91000);
  assert.equal(selectors.allEnginesTotal(ROWS).walletDebitMicroUsd, 1631000, 'only the explicit all-engines total combines engines');
  assert.deepEqual(selectors.normalizeUsageRows(null), []);
});

test('OpenAI selected: the engine view renders only OpenAI models and OpenAI charges - not one Gemini row or amount', () => {
  const html = jsx.render(view.EngineChargesList, { i18n: I18N, engineLabel: 'ChatGPT', rows: ROWS, provider: 'openai', selectedModel: 'gpt-4o' });
  const text = visibleText(html);
  assert.match(text, /gpt-5\.6-luna/);
  assert.match(text, /gpt-4o/);
  assert.doesNotMatch(text, /gemini/i, 'no Gemini model in an OpenAI context');
  assert.match(text, /\$1\.2000/);
  assert.match(text, /\$0\.3400/);
  assert.doesNotMatch(text, /\$0\.0900|\$0\.0010/, 'no Gemini charge either');
  assert.match(text, /aiAsstRealCostEngineTotal\[ChatGPT\]/, 'the aggregate is explicitly labelled as this engine\'s total');
  assert.match(text, /\$1\.5400/, 'the total is the sum of OpenAI rows only');
  assert.match(html, /border:1px solid var\(--char-accent\)/, 'the configured model\'s exact row is the highlighted one');
});

test('Gemini selected: only Gemini models and charges - and a stray provider-cost field is never rendered', () => {
  const html = jsx.render(view.EngineChargesList, { i18n: I18N, engineLabel: 'Gemini', rows: ROWS, provider: 'gemini', selectedModel: 'gemini-2.5-flash' });
  const text = visibleText(html);
  assert.match(text, /gemini-2\.5-flash/);
  assert.doesNotMatch(text, /gpt-|openai/i, 'no OpenAI model in a Gemini context');
  assert.doesNotMatch(text, /\$1\.2000|\$0\.3400|\$1\.5400/, 'no OpenAI charge');
  assert.match(text, /\$0\.0910/, 'Gemini engine total');
  assert.doesNotMatch(html, /987654|0\.9877/, 'a provider cost the row happened to carry is never shown');
});

test('an engine with no usage shows the empty state - it never borrows another engine\'s rows', () => {
  const text = visibleText(jsx.render(view.EngineChargesList, { i18n: I18N, engineLabel: 'Claude', rows: ROWS, provider: 'anthropic', selectedModel: 'claude-sonnet-4-5' }));
  assert.match(text, /aiAsstRealCostEmpty/);
  assert.doesNotMatch(text, /gpt-|gemini|\$\d/);
});

test('the Dashboard engine card shows the engine\'s explicit TOTAL and its configured model - not the first model row of the provider', () => {
  const openai = visibleText(jsx.render(view.EngineCardCharges, { i18n: I18N, engineLabel: 'ChatGPT', rows: ROWS, provider: 'openai', configuredModel: 'gpt-4o' }));
  assert.match(openai, /aiAsstRealCostEngineTotal\[ChatGPT\]/);
  assert.match(openai, /\$1\.5400/);
  assert.match(openai, /gpt-4o/);
  assert.doesNotMatch(openai, /gpt-5\.6-luna|\$1\.2000/, 'the old provider-only find() showed the first row (luna, $1.20) as the engine');
  const gemini = visibleText(jsx.render(view.EngineCardCharges, { i18n: I18N, engineLabel: 'Gemini', rows: ROWS, provider: 'gemini', configuredModel: 'gemini-2.5-flash' }));
  assert.match(gemini, /\$0\.0910/);
  assert.doesNotMatch(gemini, /\$1\.5400/);
});

test('the general Costs view compares every engine explicitly: exact provider/model rows, an all-engines total, wallet debits only', () => {
  const html = jsx.render(view.AllEnginesChargesList, { i18n: I18N, rows: ROWS, providerColor: () => '#000' });
  const text = visibleText(html);
  for (const label of ['openai / gpt-5.6-luna', 'openai / gpt-4o', 'gemini / gemini-2.5-flash', 'gemini / gemini-2.5-flash-lite']) assert.ok(text.includes(label), label);
  assert.match(text, /aiAsstRealCostAllEngines/);
  assert.match(text, /\$1\.6310/, 'the all-engines total');
  assert.match(text, /aiAsstRealCostCharged/);
  assert.doesNotMatch(html, /ProviderCost|987654|0\.9877/, 'no provider cost label or value is rendered');
});

test('nothing in the customer AI screens can still show a provider cost: no label, no field, no old selector', async () => {
  const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');
  const view = await read('navrya-src', 'aiAssistantView.jsx');
  const viewModule = await read('navrya-src', 'aiWalletUsageView.jsx');
  const i18n = await read('public', 'pages', 'shared', 'ai-i18n.js');
  assert.doesNotMatch(view + viewModule, /providerCostMicroUsd|aiAsstRealCostProviderCost|retailChargeMicroUsd/);
  assert.doesNotMatch(i18n, /aiAsstRealCostProviderCost/, 'the provider-cost label is gone from every language');
  assert.doesNotMatch(view, /\.find\(\(r\) => r\.provider === /, 'no provider-only first-row lookup');
  assert.match(view, /<EngineChargesList[^>]*provider=\{model\}/, 'the engine context passes the selected engine');
  assert.match(view, /<EngineCardCharges[^>]*provider=\{entry\.id\}/);
  assert.match(view, /<AllEnginesChargesList/);
});
