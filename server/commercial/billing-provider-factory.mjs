// Selects which BillingProvider implementation a request-handling route uses (task A, now
// admin-config-driven). Defaults to the existing ManualBillingProvider unconditionally - real BSC
// crypto payments only activate once an admin has explicitly enabled them through
// PATCH /api/admin/commercial/crypto-payments/status (server/commercial/bsc-config.mjs's
// resolveBscRuntimeConfig().enabled), never implicitly from `.env` alone (see
// commercial-defaults.mjs's BSC_DEFAULTS - `enabled` is never read from `.env`). Every caller
// (routes.wallet.mjs/routes.subscriptions.mjs/routes.storage.mjs/routes.webhooks-bsc.mjs) now
// awaits this PER REQUEST (never once at router-construction time) so an admin's change takes
// effect on the very next request - no API restart required (task B.2).
import { ManualBillingProvider } from './manual-billing-provider.mjs';
import { BscCryptoBillingProvider } from './bsc-crypto-billing-provider.mjs';
import { resolveBscRuntimeConfig } from './bsc-config.mjs';

export async function getBillingProvider(repo) {
  const config = await resolveBscRuntimeConfig(repo);
  if (config.enabled) return new BscCryptoBillingProvider(repo);
  return new ManualBillingProvider(repo);
}
