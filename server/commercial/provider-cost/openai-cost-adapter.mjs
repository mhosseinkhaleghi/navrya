// AI Cost Control: the real OpenAI organization Costs API adapter - the only official, documented
// way to retrieve what OpenAI actually billed (never scraped from the web dashboard, never an
// undocumented endpoint). Verified against OpenAI's own published API reference and cookbook
// example (developers.openai.com) before implementation:
//
//   GET https://api.openai.com/v1/organization/costs
//   Auth: Authorization: Bearer <organization ADMIN key> - a DIFFERENT credential from the normal
//         project/provider API key this app already uses to call chat/completions endpoints. An
//         admin key is minted separately at platform.openai.com/settings/organization/admin-keys.
//   Query: start_time (required, unix seconds), end_time (unix seconds), bucket_width (only '1d'
//          is supported today - so cost data is DAILY-granularity, never finer), group_by (array
//          of strings, e.g. ['project_id']), limit (1-180 buckets, default 7), page (opaque cursor).
//   Response: { object:'page', data:[{ object:'bucket', start_time, end_time,
//               results:[{ object:'organization.costs.result', amount:{value,currency},
//                          line_item, project_id }] }], has_more, next_page }
//
// Known, honestly-disclosed limitation: the Costs API has NO server-side project filter query
// parameter (unlike the separate Usage API's `project_ids`) - the only way to scope results to
// one project is to request group_by:['project_id'] (which tags every result row with its real
// project_id) and then filter client-side to the configured NAVRYA project id, discarding every
// other project's rows. This is what dedicatedProjectScope below does - "a dedicated NAVRYA
// project id" is enforced by this client-side filter, not by the request itself.
//
// Known, honestly-disclosed limitation #2: there is no official OpenAI balance/credit API for a
// standard API account (the legacy /dashboard/billing/credit_grants endpoint is undocumented and
// was never an official API - explicitly out of scope per the instruction not to call
// undocumented billing endpoints). fetchBalance() below always reports unsupported.
//
// Known, honestly-disclosed limitation #3: `line_item` (e.g. "gpt-4o, input") is the provider's
// own free-text cost-category label, not a normalized model id - this adapter stores it verbatim
// for admin drill-down but never attempts to map it onto this app's own provider_model_pricing
// rows, so OpenAI does not support real per-model external-cost attribution in this pass (the
// admin UI shows the provider-level total as real external cost, and the model-level table's
// "external cost" column is intentionally left blank/unsupported for OpenAI).

import { ProviderCostAdapterError } from './registry.mjs';

const COSTS_URL = 'https://api.openai.com/v1/organization/costs';
const MAX_PAGES = 50; // safety cap against a runaway pagination loop, not a real-world limit

function toUnixSeconds(isoOrDate) {
  const ms = isoOrDate instanceof Date ? isoOrDate.getTime() : new Date(isoOrDate).getTime();
  if (!Number.isFinite(ms)) throw new ProviderCostAdapterError('INVALID_TIME_RANGE', 'start/end must be valid dates');
  return Math.floor(ms / 1000);
}

function mapUpstreamErrorCode(status) {
  if (status === 401) return 'OPENAI_COSTS_UNAUTHORIZED';
  if (status === 403) return 'OPENAI_COSTS_FORBIDDEN';
  if (status === 429) return 'OPENAI_COSTS_RATE_LIMITED';
  return `OPENAI_COSTS_${status}`;
}

export const openaiCostAdapter = {
  id: 'openai',
  displayName: 'OpenAI',
  supportsActualCosts: true,
  supportsBalance: false,
  supportsUsage: false,
  supportedScopes: ['project'],

  // apiKey: the decrypted organization ADMIN key (never the normal chat-completions key).
  // scopeConfig: { projectId } - the dedicated NAVRYA OpenAI project id, required.
  // start/end: ISO 8601 UTC strings, exclusive-end (matches this feature's own UTC-range
  // convention elsewhere). fetchImpl is injectable for testing - defaults to the real global fetch.
  async fetchActualCosts({ apiKey, scopeConfig, start, end, fetchImpl = fetch }) {
    if (!apiKey) throw new ProviderCostAdapterError('OPENAI_CREDENTIAL_NOT_CONFIGURED', 'No OpenAI organization admin key is configured');
    const projectId = scopeConfig && scopeConfig.projectId;
    if (!projectId) throw new ProviderCostAdapterError('OPENAI_PROJECT_SCOPE_NOT_CONFIGURED', 'No NAVRYA OpenAI project id is configured');
    const startTime = toUnixSeconds(start);
    const endTime = toUnixSeconds(end);
    if (endTime <= startTime) throw new ProviderCostAdapterError('INVALID_TIME_RANGE', 'end must be after start');

    const periods = [];
    let page = null;
    let pageCount = 0;
    do {
      const url = new URL(COSTS_URL);
      url.searchParams.set('start_time', String(startTime));
      url.searchParams.set('end_time', String(endTime));
      url.searchParams.set('bucket_width', '1d');
      url.searchParams.set('limit', '180');
      // Standard repeated-key array encoding for OpenAI's documented `group_by: array of strings`
      // parameter - grouping by project_id is what makes each result row carry a real project_id
      // to filter on client-side (see this file's own header comment for why there is no
      // server-side project filter on this endpoint).
      url.searchParams.append('group_by', 'project_id');
      if (page) url.searchParams.set('page', page);

      let response;
      try {
        response = await fetchImpl(url.toString(), {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(15000)
        });
      } catch (error) {
        throw new ProviderCostAdapterError('OPENAI_COSTS_UNREACHABLE', error && error.message);
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new ProviderCostAdapterError(mapUpstreamErrorCode(response.status), body && body.error && body.error.message);
      }

      for (const bucket of body.data || []) {
        for (const result of bucket.results || []) {
          // Client-side project scoping (see header comment) - a null/other-project row is real
          // OpenAI organization spend, just not NAVRYA's, so it must never be counted here.
          if (!result || result.project_id !== projectId) continue;
          const amount = result.amount || {};
          periods.push({
            periodStart: new Date(bucket.start_time * 1000).toISOString(),
            periodEnd: new Date(bucket.end_time * 1000).toISOString(),
            currency: (amount.currency || 'usd').toLowerCase(),
            amountMicroUsd: Math.round((Number(amount.value) || 0) * 1000000),
            lineItem: result.line_item || null,
            projectId: result.project_id || null
          });
        }
      }

      page = body.next_page || null;
      pageCount += 1;
    } while (page && pageCount < MAX_PAGES);

    return { periods, sourceUpdatedAt: new Date().toISOString(), truncated: Boolean(page) };
  },

  // No official OpenAI balance/credit API exists for a standard API account - see this file's own
  // header comment. Reports unsupported rather than guessing or scraping.
  async fetchBalance() {
    return { supported: false, reason: 'NO_OFFICIAL_BALANCE_API' };
  }
};
