// AI Cost Control: orchestrates one admin-triggered refresh against a provider's official cost
// API (via the registry's adapter) and durably records the result - success, partial, or error -
// as an immutable provider_cost_sync_runs/provider_cost_snapshots pair (043_ai_cost_control.sql).
// Never a second usage ledger: this only ever mirrors what the PROVIDER'S OWN API reported for a
// requested UTC range, kept separate from and never merged into ai_usage_events.
import { getAdapter, ProviderCostAdapterError } from './registry.mjs';

// Every official provider cost API this app integrates with today is daily-bucketed (OpenAI's
// Costs API only supports bucket_width='1d') - so the DOLLAR AMOUNT this feature reports is
// already day-granularity no matter what. The one place millisecond precision actively hurts is
// the "does an already-synced run cover this new read" check: a rolling preset range ("last 30
// days", ending at `now()`) has an `end` boundary that moves forward on every single call, so a
// run stored with the exact raw `end` from ITS OWN call time could never satisfy
// `requested_end >= end` for any LATER call - the covering check would always miss, even one
// millisecond after a successful refresh. Snapping the STORED run's own requested range to whole
// UTC days (floor start, ceil end) fixes this: two calls within the same UTC day snap to the
// identical window, so a same-day refresh reliably covers a same-day read. This only affects what
// gets written to provider_cost_sync_runs/read by latestSuccessfulRunCovering() - the actual
// dollar amount summed by latestExternalCostForRange() below still filters snapshot rows against
// the CALLER's exact, unsnapped [start, end), never the widened stored window.
function snapToUtcDayBoundaries(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const snappedStart = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const endIsExactlyMidnight = endDate.getUTCHours() === 0 && endDate.getUTCMinutes() === 0 && endDate.getUTCSeconds() === 0 && endDate.getUTCMilliseconds() === 0;
  const snappedEnd = endIsExactlyMidnight
    ? endDate
    : new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate() + 1));
  return { snappedStart: snappedStart.toISOString(), snappedEnd: snappedEnd.toISOString() };
}

// Never called from anywhere the caller doesn't already hold a decrypted credential (the admin
// route resolves the credential and passes its decrypted apiKey in - this function never reads
// the credential store itself, so it has nothing secret to accidentally log).
export async function refreshProviderCosts(repo, { provider, credentialId, apiKey, scopeConfig, start, end, triggeredBy }) {
  const adapter = getAdapter(provider);
  if (!adapter || !adapter.supportsActualCosts) {
    return { ok: false, reason: 'NO_ADAPTER_CONFIGURED' };
  }
  if (!apiKey) return { ok: false, reason: 'CREDENTIAL_NOT_CONFIGURED' };
  const scopeKey = (scopeConfig && scopeConfig.projectId) || 'default';
  const { snappedStart, snappedEnd } = snapToUtcDayBoundaries(start, end);
  const run = await repo.providerCostSync.createRun({ provider, scopeKey, requestedStart: snappedStart, requestedEnd: snappedEnd, triggeredBy });
  try {
    const result = await adapter.fetchActualCosts({ apiKey, scopeConfig, start, end });
    await repo.providerCostSync.insertSnapshots(run.id, result.periods);
    const finished = await repo.providerCostSync.finishRun(run.id, { status: result.truncated ? 'partial' : 'success' });
    return { ok: true, run: finished, periodCount: result.periods.length, truncated: Boolean(result.truncated) };
  } catch (error) {
    const code = error instanceof ProviderCostAdapterError ? error.code : 'UNKNOWN_ERROR';
    await repo.providerCostSync.finishRun(run.id, { status: 'error', errorCode: code });
    return { ok: false, reason: code, credentialId };
  }
}

// The one read every "external actual provider cost" display goes through - never a second
// query shape elsewhere. Picks the single latest SUCCESSFUL run whose own requested range covers
// [start, end) (see 043_ai_cost_control.sql's own comment for why), so two overlapping refreshes
// can never be double-counted. A genuinely absent sync (never refreshed, or every refresh failed)
// is reported as status:'not_synced' - never a fabricated $0.
export async function latestExternalCostForRange(repo, { provider, scopeKey, start, end }) {
  // Every official cost API this app integrates with is daily-bucketed (see this file's own
  // header comment on snapToUtcDayBoundaries) - a "period" is always a whole UTC day, so filtering
  // snapshot rows by the caller's raw, sub-day-precision boundaries would systematically under-
  // count (a period's start stamped at UTC midnight can fall just outside an exact-millisecond
  // window). The SAME snapped boundaries used for the covering check above are used here too, so
  // "which run answers this read" and "which of its rows count" are always consistent with each
  // other.
  const { snappedStart, snappedEnd } = snapToUtcDayBoundaries(start, end);
  const run = await repo.providerCostSync.latestSuccessfulRunCovering({ provider, scopeKey: scopeKey || 'default', start: snappedStart, end: snappedEnd });
  if (!run) return { status: 'not_synced', amountMicroUsd: null, currency: null, run: null, lineItems: [] };
  const snapshots = await repo.providerCostSync.snapshotsForRun(run.id);
  const inRange = snapshots.filter((s) => s.periodStart >= snappedStart && s.periodStart < snappedEnd);
  const amountMicroUsd = inRange.reduce((sum, s) => sum + s.amountMicroUsd, 0);
  const freshnessMs = run.finishedAt ? Date.now() - new Date(run.finishedAt).getTime() : null;
  return {
    status: 'ok', amountMicroUsd, currency: inRange[0] ? inRange[0].currency : 'usd',
    run, lineItems: inRange, freshnessMs, stale: run.status === 'partial'
  };
}
