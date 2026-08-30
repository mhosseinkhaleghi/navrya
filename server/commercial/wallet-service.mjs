// Orchestrates the AI Wallet reserve -> call provider -> settle/release flow (spec section 27).
// Called ONLY from server/community/routes.internal.mjs's wallet bridge endpoints - this module
// has real Postgres access (via `repo`), which is exactly why it can never be imported into
// server/pattern-ai-server.mjs directly (that process is deliberately DB-free - see
// routes.internal.mjs's own header comment). The AI gateway talks to this logic only over HTTP.
import { resolveRetailMultiplier } from './markup.mjs';
import { resolveUserEntitlements } from './entitlement-resolver.mjs';

const MICRO = 1000000;

export function toMicroUsd(usd) { return Math.round(Number(usd) * MICRO); }

// Provider cost rate resolution (spec section 19/20): a model-specific provider_model_pricing
// row wins if present and enabled; otherwise falls back to the provider-level provider_pricing
// row already used by the existing Admin "AI" tab. Returns null (never a guessed/zero rate) when
// neither exists, so the caller can fail closed rather than serve a request NAVRYA cannot price.
// Exported (alongside costMicroUsdFor below) so the authoritative AI-usage-recording path
// (server/community/routes.internal.mjs's /internal/usage/record) reuses this SAME resolution -
// never a second cost formula for the same real-cost concept.
// cachedInputPricePer1k/cacheWriteInputPricePer1k (AI Cost Control) only ever come from the
// model-specific row - the provider-level fallback table (provider_pricing, the older/coarser
// admin "AI" tab concept) has no columns for these dimensions and never will, since a real cached-
// token discount is always model-specific in practice. Leaving them undefined when only the
// provider-level fallback applies is intentional: costMicroUsdFor() below treats "no cached rate
// configured" as "price those tokens at the regular input rate" (a safe, non-zero, mildly
// conservative default - see that function's own comment), never as an error and never as free.
export async function resolvePricingRate(repo, { provider, model }) {
  if (model) {
    const modelRow = await repo.providerModelPricing.get(provider, model);
    if (modelRow && modelRow.enabled && (modelRow.promptPricePer1k != null || modelRow.completionPricePer1k != null)) {
      return {
        promptPricePer1k: modelRow.promptPricePer1k || 0, completionPricePer1k: modelRow.completionPricePer1k || 0,
        cachedInputPricePer1k: modelRow.cachedInputPricePer1k ?? null, cacheWriteInputPricePer1k: modelRow.cacheWriteInputPricePer1k ?? null
      };
    }
  }
  const providerRow = await repo.providerPricing.get(provider);
  if (providerRow && (providerRow.promptPricePer1k != null || providerRow.completionPricePer1k != null)) {
    return {
      promptPricePer1k: providerRow.promptPricePer1k || 0, completionPricePer1k: providerRow.completionPricePer1k || 0,
      cachedInputPricePer1k: null, cacheWriteInputPricePer1k: null
    };
  }
  return null;
}

// AI Cost Control: extended to price cached-input and cache-write-input tokens (OpenAI's
// input_tokens_details.cached_tokens, Anthropic's cache_read_input_tokens/
// cache_creation_input_tokens - see callOpenAI()/callAnthropic() in pattern-ai-server.mjs) as
// their own dimensions instead of folding them into the plain prompt-token count. Deliberately
// backward compatible: when usage carries no cached/cache-write tokens (every call before this
// change, and every provider that doesn't report them), cachedInputTokens/cacheWriteInputTokens
// are both 0 and this reduces to EXACTLY the pre-existing formula, byte-for-byte.
//
// cachedInputTokens is a SUBSET of promptTokens (a provider never reports it as additional), so
// it is subtracted out of the regular-input bucket before pricing, never double-counted.
// cacheWriteInputTokens is genuinely additional work the provider billed (Anthropic charges a
// premium to write a new cache entry), so it is priced on top.
//
// Reasoning tokens (OpenAI's output_tokens_details.reasoning_tokens) are deliberately NEVER an
// extra pricing dimension here - they are already included inside completionTokens/output_tokens
// by the provider's own accounting, so completionPricePer1k already covers them. They are
// captured elsewhere (ai_usage_events.reasoning_tokens) purely for admin observability, never
// added to this cost formula - adding them here would double-bill.
//
// A missing cached/cache-write RATE (rate.cachedInputPricePer1k/cacheWriteInputPricePer1k is
// null, e.g. an admin configured only the base prompt/completion price for a model that does
// report cached tokens) never becomes a silent $0 for that dimension - the instruction that an
// unpriced billable dimension must never be silently treated as zero. It falls back to the same
// model's own base input price instead: a safe, always-non-zero, mildly conservative estimate
// (never lower than what "no caching happened at all" would have cost), which is a materially
// different failure mode from resolvePricingRate() returning `null` entirely (that case still
// fails the WHOLE call closed with PROVIDER_PRICING_NOT_CONFIGURED, unchanged by this function).
export function costMicroUsdFor(rate, { promptTokens, completionTokens, cachedInputTokens, cacheWriteInputTokens }) {
  const totalPromptTokens = Number(promptTokens) || 0;
  const completionTokensNum = Number(completionTokens) || 0;
  const cachedTokens = Math.max(0, Math.min(Number(cachedInputTokens) || 0, totalPromptTokens));
  const cacheWriteTokens = Math.max(0, Number(cacheWriteInputTokens) || 0);
  const regularInputTokens = totalPromptTokens - cachedTokens;
  const cachedInputRate = rate.cachedInputPricePer1k != null ? rate.cachedInputPricePer1k : rate.promptPricePer1k;
  const cacheWriteRate = rate.cacheWriteInputPricePer1k != null ? rate.cacheWriteInputPricePer1k : rate.promptPricePer1k;
  const usd = regularInputTokens / 1000 * rate.promptPricePer1k
    + cachedTokens / 1000 * cachedInputRate
    + cacheWriteTokens / 1000 * cacheWriteRate
    + completionTokensNum / 1000 * rate.completionPricePer1k;
  return Math.max(0, Math.round(usd * MICRO));
}

// Pre-call estimate used only to size the reservation hold, never the final charge (settleAiCall
// always recomputes from real usage). ~4 chars/token is a standard rough heuristic; a heavy
// image payload (base64 in the JSON body) inflates the character count enormously, which makes
// this estimate ERR CONSERVATIVE (reserve high) for exactly the requests hardest to size
// precisely up front - the safe direction for a hold, since settlement always true-ups to the
// real, usually much smaller, actual cost. ASSUMED_MAX_COMPLETION_TOKENS covers the completion
// side, which the request payload says nothing about.
const ASSUMED_MAX_COMPLETION_TOKENS = 2000;
export function estimateTokensFromPayload(payload) {
  const approxPromptTokens = Math.ceil(JSON.stringify(payload || {}).length / 4);
  return { promptTokens: approxPromptTokens, completionTokens: ASSUMED_MAX_COMPLETION_TOKENS };
}

// Reserves a hold for an upcoming provider call. Checks the plan's `ai` feature flag first (spec
// section 52's "check feature entitlement + Wallet"), then fails closed with
// PROVIDER_PRICING_NOT_CONFIGURED (spec section 20) before ever touching the wallet balance if
// NAVRYA cannot price this provider/model - an unpriceable request must never be served "for
// free" by omission.
export async function reserveForAiCall(repo, { userId, feature, provider, model, payload }) {
  const entitlements = await resolveUserEntitlements(userId, repo);
  if (!entitlements.features.ai) return { ok: false, reason: 'FEATURE_NOT_ENTITLED' };
  const rate = await resolvePricingRate(repo, { provider, model });
  if (!rate) return { ok: false, reason: 'PROVIDER_PRICING_NOT_CONFIGURED' };
  const { markupPercent, retailMultiplier } = await resolveRetailMultiplier(repo, { feature, provider, model });
  const estimate = estimateTokensFromPayload(payload);
  const estimatedProviderCostMicroUsd = costMicroUsdFor(rate, estimate);
  const estimatedRetailMicroUsd = Math.round(estimatedProviderCostMicroUsd * retailMultiplier);
  const result = await repo.wallet.reserve(userId, { estimatedRetailMicroUsd, provider, model, feature });
  if (!result.ok) return result;
  return { ok: true, reservationId: result.reservation.id, markupPercent, retailMultiplier };
}

// Settles a reservation using the REAL usage the provider reported - the estimate above never
// determines the actual charge, only whether the hold was large enough to attempt the call.
export async function settleAiCall(repo, { reservationId, provider, model, feature, usage }) {
  const rate = await resolvePricingRate(repo, { provider, model });
  const { markupPercent, retailMultiplier } = await resolveRetailMultiplier(repo, { feature, provider, model });
  const providerCostMicroUsd = rate ? costMicroUsdFor(rate, {
    promptTokens: usage && usage.promptTokens, completionTokens: usage && usage.completionTokens,
    cachedInputTokens: usage && usage.cachedInputTokens, cacheWriteInputTokens: usage && usage.cacheWriteInputTokens
  }) : 0;
  const retailChargeMicroUsd = Math.round(providerCostMicroUsd * retailMultiplier);
  return repo.wallet.settle(reservationId, {
    providerCostMicroUsd, retailChargeMicroUsd, markupPercent, retailMultiplier, provider, model, feature,
    idempotencyKey: 'ai-settle:' + reservationId
  });
}

export async function releaseAiCall(repo, reservationId) {
  return repo.wallet.release(reservationId);
}
