// Side-effect module: registers every real, implemented provider cost-reconciliation adapter into
// the registry (registry.mjs). Import this once before reading listAdapters()/getAdapter() -
// server/admin/routes.ai-cost-control.mjs is the one place that does so. Adding a future
// provider's real adapter is exactly one more import + registerAdapter() call here - never a
// change to the registry, the reconciliation service, the admin routes, or the admin UI.
import { registerAdapter } from './registry.mjs';
import { openaiCostAdapter } from './openai-cost-adapter.mjs';

registerAdapter(openaiCostAdapter);

// Anthropic/Kimi/DeepSeek deliberately have no registered adapter yet - registry.listAdapters()
// already reports them with supportsActualCosts:false for any provider with no registration, so
// the admin UI shows "No official cost reconciliation adapter configured" for each rather than a
// missing row or a fabricated $0. See registry.mjs's own KNOWN_COST_PROVIDERS list.
