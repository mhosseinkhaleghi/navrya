// AI Cost Control: one small, capability-driven registry every provider's EXTERNAL cost-
// reconciliation adapter registers into. This is the extensibility point the feature is built
// around - adding a future provider's official cost API is "write one adapter object and call
// registerAdapter()", never a redesign of the reconciliation service, the admin routes, or the
// admin UI (which renders purely from what listAdapters()/getAdapter() report, never a
// hardcoded provider list of its own).
//
// An adapter is a plain object:
//   {
//     id, displayName,
//     supportsActualCosts: boolean,   // has a real, documented official cost API
//     supportsBalance: boolean,       // has a real, documented official balance/credit API
//     supportsUsage: boolean,         // has a real, documented official usage (not cost) API
//     supportedScopes: string[],      // e.g. ['project'] - what scope_config keys this adapter needs
//     async fetchActualCosts({ apiKey, scopeConfig, start, end, fetchImpl }) -> { periods: [...], sourceUpdatedAt }
//     async fetchBalance({ apiKey, scopeConfig, fetchImpl }) -> { amountMicroUsd, currency, sourceUpdatedAt }  (only if supportsBalance)
//   }
// fetchActualCosts/fetchBalance are OPTIONAL on the object - only present when the matching
// supports* flag is true. Calling one that isn't implemented is a programming error (the caller
// is expected to check supportsActualCosts/supportsBalance first), never something the registry
// silently papers over with fake data.

export class ProviderCostAdapterError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'ProviderCostAdapterError';
    this.code = code;
  }
}

const adapters = new Map();

export function registerAdapter(adapter) {
  if (!adapter || !adapter.id) throw new Error('ProviderCostAdapter must have an id');
  adapters.set(adapter.id, adapter);
}

export function getAdapter(id) {
  return adapters.get(id) || null;
}

// Every provider this app's AI gateway already knows about (server/pattern-ai-server.mjs's own
// KNOWN_PROVIDERS list) gets a catalog row here, REGARDLESS of whether a real adapter is
// registered for it yet - a provider with no registered adapter still reports
// supportsActualCosts:false/supportsBalance:false/supportsUsage:false, which is exactly the
// signal the admin UI/route layer uses to render "No official cost reconciliation adapter
// configured" instead of silently omitting the provider or inventing a $0 row for it.
const KNOWN_COST_PROVIDERS = ['openai', 'anthropic', 'gemini', 'kimi', 'deepseek'];

export function listAdapters() {
  return KNOWN_COST_PROVIDERS.map((id) => {
    const adapter = adapters.get(id);
    if (!adapter) {
      return {
        id, displayName: id.charAt(0).toUpperCase() + id.slice(1),
        supportsActualCosts: false, supportsBalance: false, supportsUsage: false, supportedScopes: [], adapterRegistered: false
      };
    }
    return {
      id: adapter.id, displayName: adapter.displayName,
      supportsActualCosts: Boolean(adapter.supportsActualCosts), supportsBalance: Boolean(adapter.supportsBalance),
      supportsUsage: Boolean(adapter.supportsUsage), supportedScopes: adapter.supportedScopes || [], adapterRegistered: true
    };
  });
}
