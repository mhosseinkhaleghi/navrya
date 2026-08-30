import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { reconcileInternalWalletUsage, reconcileExternalProviderCost } from '../server/commercial/provider-cost/reconciliation-service.mjs';
import '../server/commercial/provider-cost/bootstrap.mjs'; // registers the real openai adapter for this process

// Internal-reconciliation (Domain A) tests only need a range that contains "now" - any bounds
// work, since usage/ledger rows are matched by content, not by day-snapping.
const RANGE_START = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const RANGE_END = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

// External-reconciliation (Domain B) tests construct a provider_cost_sync_runs row directly
// (bypassing refreshProviderCosts(), which normally snaps the stored range to whole UTC days -
// see cost-sync-service.mjs's own header comment on why). Using an already UTC-midnight-aligned
// range here means the "snap" is a no-op, so a directly-created run's stored range exactly equals
// what latestExternalCostForRange()'s own internal snapping computes for the same query - without
// duplicating that snapping logic in this test file. Bracketing "today" (rather than a fixed past
// date) means a real usageEvents.create() row (createdAt always defaults to "now") also falls
// inside this same window, so the internal-estimate side of the comparison is real too.
const NOW = new Date();
const EXTERNAL_RANGE_START = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate())).toISOString();
const EXTERNAL_RANGE_END = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate() + 1)).toISOString();

async function seededUser(repo) {
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.wallet.grant(user.id, { type: 'PROMO_CREDIT', promoDeltaMicroUsd: 100000000, sourceAction: 'test-seed' });
  return user;
}

// Creates a REAL reservation + settlement through the actual wallet.reserve()/settle() code path
// (never a hand-built ledger row) so this test exercises the exact same mechanics production does.
async function realSettlement(repo, userId, { retailChargeMicroUsd, provider, model, feature = 'aiChat' }) {
  const reserved = await repo.wallet.reserve(userId, { estimatedRetailMicroUsd: retailChargeMicroUsd, provider, model, feature });
  assert.equal(reserved.ok, true);
  const idempotencyKey = 'ai-settle:' + reserved.reservation.id;
  const settled = await repo.wallet.settle(reserved.reservation.id, {
    providerCostMicroUsd: Math.round(retailChargeMicroUsd / 3), retailChargeMicroUsd, markupPercent: 200, retailMultiplier: 3,
    provider, model, feature, idempotencyKey
  });
  assert.equal(settled.ok, true);
  return { idempotencyKey, ledgerEntry: settled.ledgerEntry };
}

test('a matched, exact case: one billed usage event and its real settlement agree on everything - zero exceptions', async () => {
  const repo = createMemoryRepo();
  const user = await seededUser(repo);
  const { idempotencyKey } = await realSettlement(repo, user.id, { retailChargeMicroUsd: 3000000, provider: 'openai', model: 'gpt-5.6-sol' });
  await repo.usageEvents.create({
    userId: user.id, provider: 'openai', model: 'gpt-5.6-sol', feature: 'aiChat', promptTokens: 1000, completionTokens: 500, totalTokens: 1500,
    source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 1000000, retailChargeMicroUsd: 3000000, linkedLedgerIdempotencyKey: idempotencyKey
  });

  const result = await reconcileInternalWalletUsage(repo, { start: RANGE_START, end: RANGE_END });
  assert.equal(result.matched, 1);
  assert.equal(result.matchedRetailMicroUsd, 3000000);
  assert.deepEqual(result.exceptionCounts, { MISSING_SETTLEMENT: 0, ORPHAN_SETTLEMENT: 0, AMOUNT_MISMATCH: 0, PROVIDER_MODEL_MISMATCH: 0 });
  assert.equal(result.exceptions.total, 0);
});

test('a matched case where the retail charge was split across BOTH cash and promo balance still passes the abs(cash)+abs(promo)===retailCharge check', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'MixedBalanceTrader' });
  // getAccount() lazily seeds a real signup promo credit on first touch - read it back rather than
  // assuming a bare number, so this test stays correct regardless of that default's own value.
  const existingPromo = (await repo.wallet.getAccount(user.id)).promoBalanceMicroUsd;
  await repo.wallet.grant(user.id, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: 5000000, sourceAction: 'test-seed' });
  const retailChargeMicroUsd = existingPromo + 600000; // guarantees a real cash+promo split, whatever the promo default is
  const { idempotencyKey, ledgerEntry } = await realSettlement(repo, user.id, { retailChargeMicroUsd, provider: 'openai', model: 'gpt-5.6-sol' });
  assert.equal(Math.abs(ledgerEntry.cashDeltaMicroUsd), 600000);
  assert.equal(Math.abs(ledgerEntry.promoDeltaMicroUsd), existingPromo);
  assert.ok(existingPromo > 0, 'sanity check - this test only proves something when a real promo balance is actually spent alongside cash');
  await repo.usageEvents.create({
    userId: user.id, provider: 'openai', model: 'gpt-5.6-sol', feature: 'aiChat', promptTokens: 100, completionTokens: 50, totalTokens: 150,
    source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 300000, retailChargeMicroUsd: retailChargeMicroUsd, linkedLedgerIdempotencyKey: idempotencyKey
  });

  const result = await reconcileInternalWalletUsage(repo, { start: RANGE_START, end: RANGE_END });
  assert.equal(result.matched, 1);
  assert.equal(result.exceptions.total, 0);
});

test('MISSING_SETTLEMENT: a billed usage event whose settle() call silently failed (a real production gap - settleWalletFundsForCall is best-effort) is detected', async () => {
  const repo = createMemoryRepo();
  const user = await seededUser(repo);
  // No real settle() ever ran for this - simulates settleWalletFundsForCall() exhausting all
  // retries against a down Community API while recordAiUsageForCall() still succeeded afterward.
  await repo.usageEvents.create({
    userId: user.id, provider: 'openai', model: 'gpt-5.6-sol', feature: 'aiChat', promptTokens: 1000, completionTokens: 500, totalTokens: 1500,
    source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 1000000, retailChargeMicroUsd: 3000000, linkedLedgerIdempotencyKey: 'ai-settle:reservation-never-settled'
  });

  const result = await reconcileInternalWalletUsage(repo, { start: RANGE_START, end: RANGE_END });
  assert.equal(result.matched, 0);
  assert.equal(result.exceptionCounts.MISSING_SETTLEMENT, 1);
  assert.equal(result.exceptions.items[0].type, 'MISSING_SETTLEMENT');
  assert.equal(result.exceptions.items[0].retailChargeMicroUsd, 3000000);
});

test('ORPHAN_SETTLEMENT: a real settlement whose usage-record call failed is detected', async () => {
  const repo = createMemoryRepo();
  const user = await seededUser(repo);
  // A real settle() happened, but recordAiUsageForCall() (the /internal/usage/record write) never
  // landed - simulates that call exhausting its own retries.
  await realSettlement(repo, user.id, { retailChargeMicroUsd: 2000000, provider: 'openai', model: 'gpt-5.6-sol' });

  const result = await reconcileInternalWalletUsage(repo, { start: RANGE_START, end: RANGE_END });
  assert.equal(result.matched, 0);
  assert.equal(result.exceptionCounts.ORPHAN_SETTLEMENT, 1);
  assert.equal(result.exceptions.items[0].retailChargeMicroUsd, 2000000);
});

test('AMOUNT_MISMATCH: the usage event and its settlement disagree on retail charge (e.g. a markup-rule race between the two nearly-simultaneous calls)', async () => {
  const repo = createMemoryRepo();
  const user = await seededUser(repo);
  const { idempotencyKey } = await realSettlement(repo, user.id, { retailChargeMicroUsd: 3000000, provider: 'openai', model: 'gpt-5.6-sol' });
  // settle() charged 3000000, but the usage-record call resolved a DIFFERENT markup a moment
  // later and computed 3500000 - a real, subtle race this reconciliation exists to catch.
  await repo.usageEvents.create({
    userId: user.id, provider: 'openai', model: 'gpt-5.6-sol', feature: 'aiChat', promptTokens: 1000, completionTokens: 500, totalTokens: 1500,
    source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 1000000, retailChargeMicroUsd: 3500000, linkedLedgerIdempotencyKey: idempotencyKey
  });

  const result = await reconcileInternalWalletUsage(repo, { start: RANGE_START, end: RANGE_END });
  assert.equal(result.matched, 0);
  assert.equal(result.exceptionCounts.AMOUNT_MISMATCH, 1);
  assert.equal(result.exceptions.items[0].expectedRetailChargeMicroUsd, 3500000);
  assert.equal(result.exceptions.items[0].actualLedgerMovementMicroUsd, 3000000);
});

test('PROVIDER_MODEL_MISMATCH: same key and same amount, but provider/model disagree', async () => {
  const repo = createMemoryRepo();
  const user = await seededUser(repo);
  const { idempotencyKey } = await realSettlement(repo, user.id, { retailChargeMicroUsd: 1500000, provider: 'openai', model: 'gpt-5.6-sol' });
  await repo.usageEvents.create({
    userId: user.id, provider: 'openai', model: 'gpt-5.6-terra', feature: 'aiChat', promptTokens: 500, completionTokens: 250, totalTokens: 750,
    source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 500000, retailChargeMicroUsd: 1500000, linkedLedgerIdempotencyKey: idempotencyKey
  });

  const result = await reconcileInternalWalletUsage(repo, { start: RANGE_START, end: RANGE_END });
  assert.equal(result.exceptionCounts.PROVIDER_MODEL_MISMATCH, 1);
  assert.equal(result.exceptions.items[0].usageProviderModel.model, 'gpt-5.6-terra');
  assert.equal(result.exceptions.items[0].settlementProviderModel.model, 'gpt-5.6-sol');
});

test('non-billable/excluded rows (client-origin, or gateway rows never billed at all) are counted separately, never scanned as reconciliation exceptions', async () => {
  const repo = createMemoryRepo();
  const user = await seededUser(repo);
  await repo.usageEvents.create({ userId: user.id, provider: 'openai', model: 'gpt-5.6-sol', source: 'client-self-report', origin: 'client', promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  await repo.usageEvents.create({ userId: user.id, provider: 'openai', model: 'gpt-5.6-sol', feature: 'aiChat', source: 'gateway-dispatch', origin: 'gateway', promptTokens: 10, completionTokens: 5, totalTokens: 15, providerCostMicroUsd: 1000, retailChargeMicroUsd: 0 });

  const result = await reconcileInternalWalletUsage(repo, { start: RANGE_START, end: RANGE_END });
  assert.equal(result.matched, 0);
  assert.equal(result.excludedCount, 2, 'a client-origin row and a genuinely non-billed platform-funded row are both excluded, not exceptions');
  assert.equal(result.exceptions.total, 0);
});

// --- Domain B: external reconciliation never asserts equality --------------------------------

test('reconcileExternalProviderCost reports no_adapter for a provider with no registered adapter, not_configured when unconfigured, and never fabricates a number', async () => {
  const repo = createMemoryRepo();
  const noAdapter = await reconcileExternalProviderCost(repo, { provider: 'anthropic', start: RANGE_START, end: RANGE_END, credentialConfigured: false });
  assert.equal(noAdapter.status, 'no_adapter');
  assert.equal(noAdapter.comparable, false);

  const notConfigured = await reconcileExternalProviderCost(repo, { provider: 'openai', start: RANGE_START, end: RANGE_END, credentialConfigured: false });
  assert.equal(notConfigured.status, 'not_configured');
  assert.equal(notConfigured.comparable, false);
});

test('reconcileExternalProviderCost reports not_synced when a provider is configured but has never had a successful sync for the range', async () => {
  const repo = createMemoryRepo();
  const result = await reconcileExternalProviderCost(repo, { provider: 'openai', scopeKey: 'proj_navrya', start: RANGE_START, end: RANGE_END, credentialConfigured: true });
  assert.equal(result.status, 'not_synced');
  assert.equal(result.comparable, false);
});

test('reconcileExternalProviderCost never asserts external cost equals retail charge or internal estimate - all three are reported, and diff/tolerance is derived, not compared for equality', async () => {
  const repo = createMemoryRepo();
  const user = await seededUser(repo);
  await realSettlement(repo, user.id, { retailChargeMicroUsd: 9000000, provider: 'openai', model: 'gpt-5.6-sol' });
  await repo.usageEvents.create({ userId: user.id, provider: 'openai', model: 'gpt-5.6-sol', feature: 'aiChat', promptTokens: 3000, completionTokens: 1000, totalTokens: 4000, source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 3000000, retailChargeMicroUsd: 9000000 });

  const run = await repo.providerCostSync.createRun({ provider: 'openai', scopeKey: 'proj_navrya', requestedStart: EXTERNAL_RANGE_START, requestedEnd: EXTERNAL_RANGE_END, triggeredBy: 'admin-1' });
  await repo.providerCostSync.insertSnapshots(run.id, [{ periodStart: EXTERNAL_RANGE_START, periodEnd: EXTERNAL_RANGE_END, currency: 'usd', amountMicroUsd: 3500000, lineItem: 'gpt-4o, input', projectId: 'proj_navrya' }]);
  await repo.providerCostSync.finishRun(run.id, { status: 'success' });

  const result = await reconcileExternalProviderCost(repo, { provider: 'openai', scopeKey: 'proj_navrya', start: EXTERNAL_RANGE_START, end: EXTERNAL_RANGE_END, credentialConfigured: true });
  assert.equal(result.status, 'ok');
  assert.equal(result.externalActualCostMicroUsd, 3500000);
  assert.equal(result.internalEstimateMicroUsd, 3000000);
  assert.equal(result.retailChargeMicroUsd, 9000000);
  // With a 200% markup, retail (9000000) is roughly 3x internal estimate (3000000) BY DESIGN -
  // this must never be flagged as a reconciliation problem. Only external-vs-internal is compared.
  assert.equal(result.diffMicroUsd, 500000);
  assert.ok(Math.abs(result.diffPercent - 16.666666666666668) < 0.001);
  assert.equal(result.marginMicroUsd, 9000000 - 3500000);
});

test('a currency other than USD is reported as not comparable, never silently treated as if it were USD', async () => {
  const repo = createMemoryRepo();
  const run = await repo.providerCostSync.createRun({ provider: 'openai', scopeKey: 'proj_navrya', requestedStart: EXTERNAL_RANGE_START, requestedEnd: EXTERNAL_RANGE_END, triggeredBy: 'admin-1' });
  await repo.providerCostSync.insertSnapshots(run.id, [{ periodStart: EXTERNAL_RANGE_START, periodEnd: EXTERNAL_RANGE_END, currency: 'eur', amountMicroUsd: 1000000, lineItem: null, projectId: 'proj_navrya' }]);
  await repo.providerCostSync.finishRun(run.id, { status: 'success' });

  const result = await reconcileExternalProviderCost(repo, { provider: 'openai', scopeKey: 'proj_navrya', start: EXTERNAL_RANGE_START, end: EXTERNAL_RANGE_END, credentialConfigured: true });
  assert.equal(result.status, 'not_comparable_currency');
  assert.equal(result.comparable, false);
});

test('an out-of-tolerance diff is flagged using the admin-configurable tolerance percent, not a hardcoded value', async () => {
  const repo = createMemoryRepo();
  const user = await seededUser(repo);
  await realSettlement(repo, user.id, { retailChargeMicroUsd: 3000000, provider: 'openai', model: 'gpt-5.6-sol' });
  await repo.usageEvents.create({ userId: user.id, provider: 'openai', model: 'gpt-5.6-sol', feature: 'aiChat', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 1000000, retailChargeMicroUsd: 3000000 });
  const run = await repo.providerCostSync.createRun({ provider: 'openai', scopeKey: 'proj_navrya', requestedStart: EXTERNAL_RANGE_START, requestedEnd: EXTERNAL_RANGE_END, triggeredBy: 'admin-1' });
  await repo.providerCostSync.insertSnapshots(run.id, [{ periodStart: EXTERNAL_RANGE_START, periodEnd: EXTERNAL_RANGE_END, currency: 'usd', amountMicroUsd: 2000000, lineItem: null, projectId: 'proj_navrya' }]); // 100% off internal estimate
  await repo.providerCostSync.finishRun(run.id, { status: 'success' });

  await repo.commercialConfig.publish('aiCostControl:varianceTolerancePercent', { percent: 5 }, { updatedBy: 'admin-1', changeSummary: 'test' });
  const { invalidateCommercialConfigCache } = await import('../server/commercial/commercial-config.mjs');
  invalidateCommercialConfigCache();

  const result = await reconcileExternalProviderCost(repo, { provider: 'openai', scopeKey: 'proj_navrya', start: EXTERNAL_RANGE_START, end: EXTERNAL_RANGE_END, credentialConfigured: true });
  assert.equal(result.tolerancePercent, 5);
  assert.equal(result.outOfTolerance, true);
});
