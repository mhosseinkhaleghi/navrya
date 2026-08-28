// Selects which BillingProvider implementation a request-handling route uses (task A). Defaults
// to the existing ManualBillingProvider unconditionally - opting into the real BSC crypto rail is
// an explicit operator choice (BILLING_PROVIDER=bsc_crypto), never an implicit side effect of this
// code merely existing, mirroring this codebase's existing "opt-in, rollout-safe" convention for
// AI_WALLET_ENFORCED. Every caller (routes.wallet.mjs/routes.subscriptions.mjs/routes.storage.mjs)
// depends only on the BillingProvider interface (server/commercial/billing-provider.mjs) - this is
// the one place that picks a concrete implementation.
import { ManualBillingProvider } from './manual-billing-provider.mjs';
import { BscCryptoBillingProvider } from './bsc-crypto-billing-provider.mjs';

export function getBillingProvider(repo) {
  if (process.env.BILLING_PROVIDER === 'bsc_crypto') return new BscCryptoBillingProvider(repo);
  return new ManualBillingProvider(repo);
}
