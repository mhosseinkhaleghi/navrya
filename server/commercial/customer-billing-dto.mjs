// What a CUSTOMER may see of their own AI billing. Provider API cost, provider pricing, markup, margins and
// reconciliation figures are internal/admin-only: they never appear in a customer-facing response, and hiding them
// in the browser would not be enough (a response body is readable by anyone with devtools). Every customer route that
// returns wallet or AI-usage data goes through this module, so the rule lives in one place; the admin routes keep
// reading the raw ledger/usage rows untouched.
//
// The one AI number a customer gets is the amount actually deducted from THEIR wallet - the settled ledger movement
// (cash + promo, subscription discount and bonus lots already applied), never a provider cost and never a usage-event
// "retail" figure (which in unbilled/enforcement-off mode is only what a charge WOULD have been).

// Ledger fields a customer may see. Deliberately a whitelist: a field added to the ledger later is private until it is
// listed here. Excluded on purpose: providerCostMicroUsd, retailChargeMicroUsd, markupPercent, retailMultiplier,
// tokenDiscountPercent (pricing internals), adminUserId, idempotencyKey and metadata (internal).
const CUSTOMER_LEDGER_FIELDS = [
  'id', 'userId', 'type', 'cashDeltaMicroUsd', 'promoDeltaMicroUsd', 'provider', 'model', 'feature', 'sourceAction', 'createdAt',
  // Added by enrichLedgerEntries(): the customer's own subscription-bonus accounting.
  'subscriptionBonusUsedMicroUsd', 'subscriptionBonusAllocations', 'bonusLot'
];

export function toCustomerLedgerEntry(entry) {
  const dto = {};
  for (const field of CUSTOMER_LEDGER_FIELDS) if (entry[field] !== undefined) dto[field] = entry[field];
  return dto;
}

const modelKey = (provider, model) => String(provider || '') + '|' + String(model || '');

// Per (provider, model): how many AI calls the customer made, their tokens and what the wallet was actually debited.
// A row's provider/model come straight from the settled ledger row and the gateway usage event - no provider-only
// matching, no cross-provider or cross-model fallback, so an OpenAI row can never carry a Gemini figure. Tokens and
// calls come from the gateway-recorded usage events; the debit comes from the ledger. A model with usage but no
// settlement (platform-funded / enforcement off) honestly shows a zero debit.
export async function customerAiUsageByModel(repo, userId, { since } = {}) {
  const [usage, debits] = await Promise.all([
    repo.usageEvents.aggregateByModelForUser(userId, { since }),
    repo.wallet.aiDebitsByModelForUser(userId, { since })
  ]);
  const rows = new Map();
  for (const row of usage) {
    rows.set(modelKey(row.provider, row.model), {
      provider: row.provider, model: row.model || null, calls: row.calls, totalTokens: row.totalTokens, walletDebitMicroUsd: 0
    });
  }
  for (const debit of debits) {
    const key = modelKey(debit.provider, debit.model);
    const row = rows.get(key) || { provider: debit.provider, model: debit.model || null, calls: debit.settlements, totalTokens: 0, walletDebitMicroUsd: 0 };
    row.walletDebitMicroUsd += debit.walletDebitMicroUsd;
    rows.set(key, row);
  }
  return Array.from(rows.values()).sort((a, b) =>
    b.walletDebitMicroUsd - a.walletDebitMicroUsd || String(a.provider).localeCompare(String(b.provider)) || String(a.model).localeCompare(String(b.model)));
}
