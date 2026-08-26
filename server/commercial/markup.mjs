// Markup override hierarchy (spec section 18): GLOBAL default -> FEATURE -> PROVIDER -> MODEL ->
// FEATURE+MODEL, most specific wins. The global default lives in commercial-config.mjs's wallet
// rules; everything more specific is an ai_markup_rules row (server/db/migrations/028). Works
// with zero rows in that table - overrides are optional, never required (spec: "Default system
// should work with only global markup").
import { getWalletRules, retailMultiplierFor } from './commercial-config.mjs';

const PRECEDENCE = ['feature_model', 'model', 'provider', 'feature'];

function scopeKeyFor(scopeType, { feature, provider, model }) {
  if (scopeType === 'feature_model') return feature && model ? `${feature}:${model}` : null;
  if (scopeType === 'model') return model || null;
  if (scopeType === 'provider') return provider || null;
  if (scopeType === 'feature') return feature || null;
  return null;
}

export async function resolveMarkupPercent(repo, { feature, provider, model } = {}) {
  const rules = await repo.markupRules.list();
  for (const scopeType of PRECEDENCE) {
    const key = scopeKeyFor(scopeType, { feature, provider, model });
    if (!key) continue;
    const match = rules.find((rule) => rule.enabled && rule.scopeType === scopeType && rule.scopeKey === key);
    if (match) return Number(match.markupPercent);
  }
  const walletRules = await getWalletRules(repo);
  return walletRules.markupPercent;
}

export async function resolveRetailMultiplier(repo, ctx) {
  const markupPercent = await resolveMarkupPercent(repo, ctx);
  return { markupPercent, retailMultiplier: retailMultiplierFor(markupPercent) };
}
