// Pure selectors over the customer's own AI usage rows (GET /api/users/me/ai-usage-by-model): one row per
// (provider, model) - { provider, model, calls, totalTokens, walletDebitMicroUsd }, where walletDebitMicroUsd is what
// was actually deducted from THEIR wallet (server/commercial/customer-billing-dto.mjs). The browser never derives a
// provider cost or a price from anything: it only picks, and sums, the rows the server already settled.
//
// Every lookup is exact. An engine-context view (the engine being configured, an engine card) takes rowsForEngine() -
// only that provider's rows, never another engine's - and a model-specific view takes rowForModel(), the exact
// (provider, model) row, never "the first row of this provider". A provider total is only ever produced by
// engineTotal(), which is explicitly an aggregate and is labelled as one by its callers. Only the general Costs view
// may combine engines, through allEnginesTotal().

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function normalizeUsageRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === 'object' && row.provider)
    .map((row) => ({
      provider: String(row.provider), model: row.model ? String(row.model) : null, calls: num(row.calls),
      totalTokens: num(row.totalTokens), walletDebitMicroUsd: num(row.walletDebitMicroUsd)
    }));
}

// Only the given engine's rows (exact provider match), never another provider's.
export function rowsForEngine(rows, provider) {
  return normalizeUsageRows(rows).filter((row) => row.provider === provider);
}

// The exact (provider, model) row, or null when that model has no recorded usage - never a sibling model's row.
export function rowForModel(rows, provider, model) {
  return normalizeUsageRows(rows).find((row) => row.provider === provider && row.model === (model || null)) || null;
}

function sum(rows) {
  return rows.reduce((total, row) => ({
    calls: total.calls + row.calls, totalTokens: total.totalTokens + row.totalTokens,
    walletDebitMicroUsd: total.walletDebitMicroUsd + row.walletDebitMicroUsd
  }), { calls: 0, totalTokens: 0, walletDebitMicroUsd: 0 });
}

// An explicit aggregate over ALL of one engine's models. Callers label it as a total for that engine.
export function engineTotal(rows, provider) {
  const own = rowsForEngine(rows, provider);
  return { provider, modelCount: own.length, ...sum(own) };
}

// An explicit aggregate over every engine - for the general Costs comparison only, never an engine-context view.
export function allEnginesTotal(rows) {
  const all = normalizeUsageRows(rows);
  return { modelCount: all.length, ...sum(all) };
}

// "$0.0000" - the one money format the customer AI views use (micro-USD in, dollars out).
export function fmtWalletUsd(microUsd) {
  return '$' + (num(microUsd) / 1000000).toFixed(4);
}
