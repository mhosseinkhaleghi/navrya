// AI Cost Control: two DELIBERATELY SEPARATE reconciliation domains - never conflated into one
// number or one pass/fail flag.
//
// Domain A (internal, exact): every gateway-authoritative, actually-billed ai_usage_events row
// must correspond to exactly one AI_SETTLEMENT wallet_ledger row, agreeing on provider/model/
// feature/cost/charge, with the ledger's own cash+promo movement equal to the retail charge. This
// is a real bug-detection tool - a genuine mismatch here means NAVRYA's own two systems (usage
// recording and wallet settlement) disagree with each other, which should never happen and is
// always worth an admin's attention.
//
// Domain B (external, expected to vary): a provider's OWN official cost API total compared
// against NAVRYA's internal rate-card estimate for the same period. These are NOT expected to be
// equal, and this module never asserts they are - with a 200% markup, retail charge is expected
// to be ~3x internal estimate; the external actual cost is a THIRD, independent number again,
// compared for drift/reconciliation, not equality. See docs/ai/ai-cost-control.md for the full
// definitions this module implements literally.
import { getEffectiveCommercialConfig } from '../commercial-config.mjs';
import { listAdapters } from './registry.mjs';
import { latestExternalCostForRange } from './cost-sync-service.mjs';

const PAGE_SIZE = 500;
const SAFETY_CAP_ROWS = 20000; // bounds a single reconciliation pass against a runaway range/data volume
const DEFAULT_VARIANCE_TOLERANCE_PERCENT = 10;

async function fetchAllInRange(listFn, { start, end }) {
  const rows = [];
  let offset = 0;
  let truncated = false;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await listFn({ start, end, limit: PAGE_SIZE, offset });
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (offset >= SAFETY_CAP_ROWS) { truncated = true; break; }
  }
  return { rows, truncated };
}

function countByType(exceptions) {
  const counts = { MISSING_SETTLEMENT: 0, ORPHAN_SETTLEMENT: 0, AMOUNT_MISMATCH: 0, PROVIDER_MODEL_MISMATCH: 0 };
  exceptions.forEach((exception) => { counts[exception.type] = (counts[exception.type] || 0) + 1; });
  return counts;
}

// Domain A. `start`/`end` are ISO 8601 UTC strings (end exclusive). Paginates its own exception
// list (`exceptionPage`/`exceptionPageSize`) for the admin drill-down table, while the summary
// counts/totals always reflect every row scanned in the range (up to the safety cap, honestly
// flagged via `truncated` rather than silently under-reporting).
export async function reconcileInternalWalletUsage(repo, { start, end, exceptionPage = 1, exceptionPageSize = 50 }) {
  const [usageEvents, settlements] = await Promise.all([
    fetchAllInRange(repo.usageEvents.listBilledInRange, { start, end }),
    fetchAllInRange(repo.wallet.listSettlementsInRange, { start, end })
  ]);

  const usageByKey = new Map(usageEvents.rows.map((event) => [event.linkedLedgerIdempotencyKey, event]));
  const settlementByKey = new Map(settlements.rows.filter((entry) => entry.idempotencyKey).map((entry) => [entry.idempotencyKey, entry]));

  const exceptions = [];
  let matched = 0;
  let matchedRetailMicroUsd = 0;

  for (const [key, event] of usageByKey) {
    const settlement = settlementByKey.get(key);
    if (!settlement) {
      exceptions.push({ type: 'MISSING_SETTLEMENT', key, usageEventId: event.id, provider: event.provider, model: event.model, retailChargeMicroUsd: event.retailChargeMicroUsd, occurredAt: event.createdAt });
      continue;
    }
    const ledgerMovementMicroUsd = Math.abs(settlement.cashDeltaMicroUsd) + Math.abs(settlement.promoDeltaMicroUsd);
    const expectedMicroUsd = event.retailChargeMicroUsd || 0;
    if (ledgerMovementMicroUsd !== expectedMicroUsd) {
      exceptions.push({
        type: 'AMOUNT_MISMATCH', key, usageEventId: event.id, walletLedgerId: settlement.id,
        provider: event.provider, model: event.model, expectedRetailChargeMicroUsd: expectedMicroUsd, actualLedgerMovementMicroUsd: ledgerMovementMicroUsd, occurredAt: event.createdAt
      });
      continue;
    }
    if (settlement.provider !== event.provider || settlement.model !== event.model) {
      exceptions.push({
        type: 'PROVIDER_MODEL_MISMATCH', key, usageEventId: event.id, walletLedgerId: settlement.id,
        usageProviderModel: { provider: event.provider, model: event.model }, settlementProviderModel: { provider: settlement.provider, model: settlement.model }, occurredAt: event.createdAt
      });
      continue;
    }
    matched += 1;
    matchedRetailMicroUsd += expectedMicroUsd;
  }

  for (const [key, settlement] of settlementByKey) {
    if (!usageByKey.has(key)) {
      exceptions.push({ type: 'ORPHAN_SETTLEMENT', key, walletLedgerId: settlement.id, provider: settlement.provider, model: settlement.model, retailChargeMicroUsd: settlement.retailChargeMicroUsd, occurredAt: settlement.createdAt });
    }
  }

  const excludedCount = await repo.usageEvents.countExcludedInRange({ start, end });
  const totalExceptions = exceptions.length;
  const totalPages = Math.max(1, Math.ceil(totalExceptions / exceptionPageSize));
  const clampedPage = Math.min(Math.max(1, exceptionPage), totalPages);
  const pageStart = (clampedPage - 1) * exceptionPageSize;

  return {
    range: { start, end },
    matched, matchedRetailMicroUsd,
    exceptionCounts: countByType(exceptions),
    excludedCount,
    scannedUsageEvents: usageEvents.rows.length, scannedSettlements: settlements.rows.length,
    truncated: usageEvents.truncated || settlements.truncated,
    exceptions: { items: exceptions.slice(pageStart, pageStart + exceptionPageSize), total: totalExceptions, page: clampedPage, pageSize: exceptionPageSize, totalPages }
  };
}

export async function resolveVarianceTolerancePercent(repo) {
  const config = await getEffectiveCommercialConfig(repo);
  const override = config.overridesByKey['aiCostControl:varianceTolerancePercent'];
  const percent = override && override.value && Number(override.value.percent);
  return Number.isFinite(percent) && percent >= 0 ? percent : DEFAULT_VARIANCE_TOLERANCE_PERCENT;
}

// Domain B, one provider at a time. Never asserts external cost == retail charge (see this file's
// own header comment) - reports the three real numbers side by side plus a derived diff/margin,
// and an explicit `status` distinguishing "no adapter for this provider at all",
// "adapter exists but no credential/scope configured", "never successfully synced for this
// range", and "ok" (a real comparison exists). `comparable` is false whenever `status` isn't 'ok'.
export async function reconcileExternalProviderCost(repo, { provider, scopeKey, start, end, credentialConfigured }) {
  const adapterMeta = listAdapters().find((entry) => entry.id === provider);
  const internalRows = (await repo.usageEvents.aggregateByModelInRange({ start, end })).filter((row) => row.provider === provider);
  const internalEstimateMicroUsd = internalRows.reduce((sum, row) => sum + row.providerCostMicroUsd, 0);
  const retailChargeMicroUsd = internalRows.reduce((sum, row) => sum + row.retailChargeMicroUsd, 0);

  if (!adapterMeta || !adapterMeta.supportsActualCosts) {
    return { status: 'no_adapter', provider, comparable: false, internalEstimateMicroUsd, retailChargeMicroUsd };
  }
  if (!credentialConfigured) {
    return { status: 'not_configured', provider, comparable: false, internalEstimateMicroUsd, retailChargeMicroUsd };
  }

  const external = await latestExternalCostForRange(repo, { provider, scopeKey, start, end });
  if (external.status !== 'ok') {
    return { status: 'not_synced', provider, comparable: false, internalEstimateMicroUsd, retailChargeMicroUsd };
  }
  // Every internal amount in this app is USD-denominated (micro-USD end to end) - a provider
  // reporting a different settlement currency for this period is a real scope mismatch, not a
  // number to silently compare as if it were USD.
  if (external.currency && external.currency !== 'usd') {
    return { status: 'not_comparable_currency', provider, comparable: false, internalEstimateMicroUsd, retailChargeMicroUsd, externalCurrency: external.currency };
  }

  const diffMicroUsd = external.amountMicroUsd - internalEstimateMicroUsd;
  const diffPercent = internalEstimateMicroUsd > 0 ? (diffMicroUsd / internalEstimateMicroUsd) * 100 : null;
  const tolerancePercent = await resolveVarianceTolerancePercent(repo);
  const outOfTolerance = diffPercent != null && Math.abs(diffPercent) > tolerancePercent;

  return {
    status: 'ok', provider, comparable: true,
    externalActualCostMicroUsd: external.amountMicroUsd, currency: external.currency,
    internalEstimateMicroUsd, retailChargeMicroUsd,
    marginMicroUsd: retailChargeMicroUsd - external.amountMicroUsd,
    diffMicroUsd, diffPercent, tolerancePercent, outOfTolerance,
    stale: Boolean(external.stale),
    freshness: { lastSuccessfulSyncAt: external.run.finishedAt, freshnessMs: external.freshnessMs },
    lineItems: external.lineItems
  };
}
