// The single runtime-resolution point for BSC crypto payment configuration (admin-config task,
// B/C). Every consumer that used to read process.env.BSC_* directly - billing-provider-factory.mjs,
// bsc-crypto-billing-provider.mjs, crypto-invoice-service.mjs - calls resolveBscRuntimeConfig(repo)
// instead, so there is exactly one place that merges:
//   1. the public, versioned settings (server/commercial/commercial-config.mjs's `bsc` section -
//      admin overrides in commercial_config_overrides, falling back to .env for local dev, falling
//      back to commercial-defaults.mjs's BSC_DEFAULTS), and
//   2. the two real secrets (RPC URL, optional webhook HMAC secret), which never touch
//      commercial_config_overrides/versions at all - they live encrypted-at-rest in the dedicated
//      bsc_payment_secrets table (039_bsc_payment_secrets.sql) and are decrypted here, in-process,
//      for internal use only. This function's return value must NEVER be sent to any HTTP
//      response as-is - callers that expose status to the Admin UI use
//      commercial-config.mjs's getBscPublicConfig()/repo.bscPaymentSecrets.get() (both
//      secret-free) instead.
import { getEffectiveCommercialConfig } from './commercial-config.mjs';

export async function resolveBscRuntimeConfig(repo) {
  const { bsc } = await getEffectiveCommercialConfig(repo);
  // getRaw() is the one internal-only repo method that returns real, decrypted secret values
  // (mirrors admin_voice_provider_credentials' `includeDecrypted` convention) - never called from
  // any admin/browser-facing route, only from here.
  const secrets = await repo.bscPaymentSecrets.getRaw();

  // .env is a local-development/bootstrap fallback ONLY (task B.1) - never the production source
  // of truth once an admin has saved a real value through the encrypted store.
  const rpcUrl = (secrets && secrets.rpcUrl) || process.env.BSC_RPC_URL || null;
  const webhookSecret = (secrets && secrets.webhookSecret) || process.env.BSC_WEBHOOK_SECRET || null;

  return {
    ...bsc,
    rpcUrl,
    webhookSecret,
    rpcConfigured: Boolean(rpcUrl),
    webhookConfigured: Boolean(webhookSecret)
  };
}

// True when every field a real invoice needs is present - used both by the enable route (task
// A.4's "enable BSC only when configuration is complete") and by BscCryptoBillingProvider's own
// defense-in-depth check before creating an invoice.
export function isBscConfigComplete(config) {
  return Boolean(config.depositAddress && config.tokenContract && config.rpcConfigured);
}
