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
async function resolvePricingRate(repo, { provider, model }) {
  if (model) {
    const modelRow = await repo.providerModelPricing.get(provider, model);
    if (modelRow && modelRow.enabled && (modelRow.promptPricePer1k != null || modelRow.completionPricePer1k != null)) {
      return { promptPricePer1k: modelRow.promptPricePer1k || 0, completionPricePer1k: modelRow.completionPricePer1k || 0 };
    }
  }
  const providerRow = await repo.providerPricing.get(provider);
  if (providerRow && (providerRow.promptPricePer1k != null || providerRow.completionPricePer1k != null)) {
    return { promptPricePer1k: providerRow.promptPricePer1k || 0, completionPricePer1k: providerRow.completionPricePer1k || 0 };
  }
  return null;
}

function costMicroUsdFor(rate, { promptTokens, completionTokens }) {
  const usd = (Number(promptTokens) || 0) / 1000 * rate.promptPricePer1k + (Number(completionTokens) || 0) / 1000 * rate.completionPricePer1k;
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
  const providerCostMicroUsd = rate ? costMicroUsdFor(rate, { promptTokens: usage && usage.promptTokens, completionTokens: usage && usage.completionTokens }) : 0;
  const retailChargeMicroUsd = Math.round(providerCostMicroUsd * retailMultiplier);
  return repo.wallet.settle(reservationId, {
    providerCostMicroUsd, retailChargeMicroUsd, markupPercent, retailMultiplier, provider, model, feature,
    idempotencyKey: 'ai-settle:' + reservationId
  });
}

export async function releaseAiCall(repo, reservationId) {
  return repo.wallet.release(reservationId);
}
