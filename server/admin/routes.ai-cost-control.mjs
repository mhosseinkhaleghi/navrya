import express from 'express';
import { ApiError, asyncHandler } from '../community/errors.mjs';
import { requireRecentReauth } from './auth-admin.mjs';
import { rateLimit, sessionKey } from '../community/security/rate-limit.mjs';
import { listAdapters, getAdapter } from '../commercial/provider-cost/registry.mjs';
import '../commercial/provider-cost/bootstrap.mjs'; // side effect: registers the real openai adapter
import { refreshProviderCosts, latestExternalCostForRange } from '../commercial/provider-cost/cost-sync-service.mjs';
import { reconcileInternalWalletUsage, reconcileExternalProviderCost, resolveVarianceTolerancePercent } from '../commercial/provider-cost/reconciliation-service.mjs';
import { invalidateCommercialConfigCache } from '../commercial/commercial-config.mjs';

const KNOWN_COST_PROVIDERS = ['openai', 'anthropic', 'gemini', 'kimi', 'deepseek'];
const RANGE_PRESET_MS = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 };
const MAX_CUSTOM_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

// Server-side UTC range validation/resolution - the single place every route below derives
// {start, end} from the request, so a bad/oversized/inverted custom range is always rejected the
// same way rather than re-validated ad hoc per route. `end` is always exclusive.
function resolveRange(query) {
  const preset = query.range || '30d';
  const now = new Date();
  if (preset === 'month') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start: start.toISOString(), end: end.toISOString(), preset };
  }
  if (preset === 'custom') {
    const start = query.start ? new Date(query.start) : null;
    const end = query.end ? new Date(query.end) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'range', reason: 'start and end must be valid ISO 8601 UTC timestamps' });
    }
    if (end.getTime() <= start.getTime()) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'range', reason: 'end must be after start' });
    if (end.getTime() - start.getTime() > MAX_CUSTOM_RANGE_MS) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'range', reason: 'range exceeds 366 days' });
    return { start: start.toISOString(), end: end.toISOString(), preset };
  }
  const windowMs = RANGE_PRESET_MS[preset];
  if (!windowMs) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'range' });
  return { start: new Date(now.getTime() - windowMs).toISOString(), end: now.toISOString(), preset };
}

function requireKnownProvider(provider) {
  if (!KNOWN_COST_PROVIDERS.includes(provider)) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'provider' });
}

function fmtCredential(credential) {
  // Never includes apiKey - repo.providerCostCredentials.get()/list()/create()/replace() already
  // omit it unless includeDecrypted is explicitly passed, which no route in this file ever does.
  return credential;
}

// Live, per-provider "would a refresh work right now" status - drives the admin UI's own
// unsupported/unconfigured distinction without duplicating this logic client-side.
async function providerConfigStatus(repo, provider) {
  const adapter = getAdapter(provider);
  if (!adapter || !adapter.supportsActualCosts) return { supported: false, configured: false, credential: null };
  const credentials = await repo.providerCostCredentials.listByProvider(provider);
  const active = credentials.find((row) => row.enabled) || null;
  return { supported: true, configured: Boolean(active), credential: active };
}

const refreshLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, keyFn: sessionKey('ai-cost-control-refresh') });
const testConnectionLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, keyFn: sessionKey('ai-cost-control-test-connection') });

// Mounted at /api/admin/commercial/ai-cost-control (server/admin/routes.commercial.mjs) - inherits
// requireAuth+csrfProtection+requireAdmin from the /api/admin mount, exactly like every other
// commercial sub-router.
export function router(repo) {
  const app = express.Router();

  async function audit(req, action, targetType, targetId, details) {
    await repo.auditLog.create({ adminUserId: req.currentUser.id, action, targetType, targetId, details: details || {} });
  }

  // ---- Provider catalog (extensible, server-driven - the client never hardcodes a provider list) ----
  app.get('/providers/catalog', asyncHandler(async (req, res) => {
    const catalog = listAdapters();
    const withStatus = await Promise.all(catalog.map(async (entry) => ({ ...entry, ...(await providerConfigStatus(repo, entry.id)) })));
    res.json({ providers: withStatus });
  }));

  // ---- Overview cards -------------------------------------------------------------------------
  app.get('/overview', asyncHandler(async (req, res) => {
    const range = resolveRange(req.query);
    const [internalRows, catalog] = await Promise.all([
      repo.usageEvents.aggregateByModelInRange(range),
      Promise.all(listAdapters().map(async (entry) => ({ ...entry, ...(await providerConfigStatus(repo, entry.id)) })))
    ]);
    const internalEstimateMicroUsd = internalRows.reduce((sum, row) => sum + row.providerCostMicroUsd, 0);
    const retailChargeMicroUsd = internalRows.reduce((sum, row) => sum + row.retailChargeMicroUsd, 0);

    let externalActualCostMicroUsd = 0;
    let anyExternalComparable = false;
    let staleCount = 0;
    let notSyncedCount = 0;
    const comparableProviders = catalog.filter((entry) => entry.supported && entry.configured);
    for (const entry of comparableProviders) {
      // eslint-disable-next-line no-await-in-loop
      const external = await latestExternalCostForRange(repo, { provider: entry.id, scopeKey: entry.credential && entry.credential.scopeConfig && entry.credential.scopeConfig.projectId, start: range.start, end: range.end });
      if (external.status === 'ok') {
        externalActualCostMicroUsd += external.amountMicroUsd;
        anyExternalComparable = true;
        if (external.stale) staleCount += 1;
      } else {
        notSyncedCount += 1;
      }
    }

    const [internal, walletDebit] = await Promise.all([
      reconcileInternalWalletUsage(repo, { start: range.start, end: range.end, exceptionPageSize: 1 }),
      repo.wallet.sumSettlementsInRange(range)
    ]);

    res.json({
      range,
      externalActualCostMicroUsd: anyExternalComparable ? externalActualCostMicroUsd : null,
      externalCostComparable: anyExternalComparable,
      internalEstimateMicroUsd, retailChargeMicroUsd,
      actualWalletDebitMicroUsd: walletDebit.totalMicroUsd,
      actualWalletDebitSplit: { cashMicroUsd: walletDebit.cashMicroUsd, promoMicroUsd: walletDebit.promoMicroUsd },
      marginMicroUsd: anyExternalComparable ? retailChargeMicroUsd - externalActualCostMicroUsd : null,
      reconciliation: {
        matched: internal.matched, exceptionCounts: internal.exceptionCounts, totalExceptions: internal.exceptions.total, truncated: internal.truncated
      },
      freshness: { staleProviderCount: staleCount, notSyncedProviderCount: notSyncedCount, comparableProviderCount: comparableProviders.length }
    });
  }));

  // ---- Provider table --------------------------------------------------------------------------
  app.get('/providers', asyncHandler(async (req, res) => {
    const range = resolveRange(req.query);
    const catalog = listAdapters();
    const rows = await Promise.all(catalog.map(async (entry) => {
      const status = await providerConfigStatus(repo, entry.id);
      const external = await reconcileExternalProviderCost(repo, {
        provider: entry.id, scopeKey: status.credential && status.credential.scopeConfig && status.credential.scopeConfig.projectId,
        start: range.start, end: range.end, credentialConfigured: status.configured
      });
      const balance = entry.supportsBalance ? { supported: false } : { supported: false, reason: 'NO_OFFICIAL_BALANCE_API' };
      const manualBalance = await repo.providerBalanceSnapshots.latest(entry.id);
      return {
        provider: entry.id, displayName: entry.displayName,
        adapterRegistered: entry.adapterRegistered, supportsActualCosts: entry.supportsActualCosts, supportsBalance: entry.supportsBalance,
        credentialConfigured: status.configured, credentialId: status.credential ? status.credential.id : null,
        scopeConfig: status.credential ? status.credential.scopeConfig : null,
        external, balance, manualBalance
      };
    }));
    res.json({ range, providers: rows });
  }));

  // ---- Model table (paginated) -----------------------------------------------------------------
  app.get('/models', asyncHandler(async (req, res) => {
    const range = resolveRange(req.query);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const rows = await repo.usageEvents.aggregateByModelInRange(range);
    const total = rows.length;
    const slice = rows.slice((page - 1) * pageSize, page * pageSize);
    const withPricingStatus = await Promise.all(slice.map(async (row) => {
      const pricing = await repo.providerModelPricing.get(row.provider, row.model);
      return {
        ...row,
        priceConfigured: Boolean(pricing && pricing.enabled && (pricing.promptPricePer1k != null || pricing.completionPricePer1k != null)),
        // Per this feature's own scoped decision (see the OpenAI adapter's own header comment):
        // no provider's Costs API is model-attributable in this pass, so this is always false -
        // the model table's "external cost" column stays explicitly unsupported, never guessed.
        externalCostSupported: false
      };
    }));
    res.json({ range, models: withPricingStatus, total, page, pageSize });
  }));

  // ---- Reconciliation - Domain A (internal, exact) ----------------------------------------------
  app.get('/reconciliation/internal', asyncHandler(async (req, res) => {
    const range = resolveRange(req.query);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const result = await reconcileInternalWalletUsage(repo, { start: range.start, end: range.end, exceptionPage: page, exceptionPageSize: pageSize });
    res.json({ range, ...result });
  }));

  // ---- Reconciliation - Domain B (external, expected to vary) -----------------------------------
  app.get('/reconciliation/external', asyncHandler(async (req, res) => {
    const range = resolveRange(req.query);
    const tolerancePercent = await resolveVarianceTolerancePercent(repo);
    const catalog = listAdapters();
    const results = await Promise.all(catalog.map(async (entry) => {
      const status = await providerConfigStatus(repo, entry.id);
      return reconcileExternalProviderCost(repo, {
        provider: entry.id, scopeKey: status.credential && status.credential.scopeConfig && status.credential.scopeConfig.projectId,
        start: range.start, end: range.end, credentialConfigured: status.configured
      });
    }));
    res.json({ range, tolerancePercent, providers: results });
  }));

  app.patch('/variance-tolerance', requireRecentReauth(), asyncHandler(async (req, res) => {
    const percent = Number((req.body || {}).percent);
    if (!Number.isFinite(percent) || percent < 0) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'percent' });
    await repo.commercialConfig.publish('aiCostControl:varianceTolerancePercent', { percent }, { updatedBy: req.currentUser.id, changeSummary: 'Updated AI Cost Control variance tolerance' });
    invalidateCommercialConfigCache();
    await audit(req, 'aiCostControl.varianceTolerance.update', 'aiCostControlConfig', 'global', { percent });
    res.json({ percent });
  }));

  // ---- Provider cost-reconciliation credentials (encrypted, NEVER admin_ai_keys) ----------------
  app.get('/credentials', asyncHandler(async (req, res) => {
    const rows = await repo.providerCostCredentials.list();
    res.json({ credentials: rows.map(fmtCredential) });
  }));

  app.post('/credentials', requireRecentReauth(), asyncHandler(async (req, res) => {
    const body = req.body || {};
    requireKnownProvider(body.provider);
    if (!getAdapter(body.provider)) throw new ApiError(400, 'NO_ADAPTER_CONFIGURED', null, { provider: body.provider });
    const apiKey = String(body.apiKey || '').trim();
    if (!apiKey) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'apiKey' });
    const scopeConfig = body.scopeConfig && typeof body.scopeConfig === 'object' ? body.scopeConfig : {};
    if (body.provider === 'openai' && !String(scopeConfig.projectId || '').trim()) {
      throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'scopeConfig.projectId', reason: 'A dedicated NAVRYA OpenAI project id is required' });
    }
    const credential = await repo.providerCostCredentials.create({ provider: body.provider, label: body.label || (body.provider + ' cost reconciliation'), apiKey, scopeConfig, updatedBy: req.currentUser.id });
    await audit(req, 'aiCostControl.credential.create', 'providerCostCredential', credential.id, { provider: body.provider, scopeConfig });
    res.status(201).json(fmtCredential(credential));
  }));

  app.patch('/credentials/:id', requireRecentReauth(), asyncHandler(async (req, res) => {
    const body = req.body || {};
    const existing = await repo.providerCostCredentials.get(req.params.id);
    if (!existing) throw new ApiError(404, 'CREDENTIAL_NOT_FOUND');
    const updated = await repo.providerCostCredentials.replace(req.params.id, {
      label: body.label, apiKey: body.apiKey, scopeConfig: body.scopeConfig, enabled: body.enabled, updatedBy: req.currentUser.id
    });
    // Deliberately never includes the apiKey value - only whether one was rotated this call.
    await audit(req, 'aiCostControl.credential.update', 'providerCostCredential', req.params.id, { keyRotated: Boolean(body.apiKey), scopeConfig: body.scopeConfig || null, enabled: body.enabled });
    res.json(fmtCredential(updated));
  }));

  app.delete('/credentials/:id', requireRecentReauth(), asyncHandler(async (req, res) => {
    const existing = await repo.providerCostCredentials.get(req.params.id);
    if (!existing) throw new ApiError(404, 'CREDENTIAL_NOT_FOUND');
    await repo.providerCostCredentials.delete(req.params.id);
    await audit(req, 'aiCostControl.credential.delete', 'providerCostCredential', req.params.id, { provider: existing.provider });
    res.status(204).end();
  }));

  // Read-only diagnostic (a small real cost-API call, scoped to the last day, never reauth-gated -
  // same convention as crypto-payments' test-connection) - rate-limited since it costs a real
  // upstream request.
  app.post('/credentials/:id/test-connection', testConnectionLimiter, asyncHandler(async (req, res) => {
    const credential = await repo.providerCostCredentials.get(req.params.id, { includeDecrypted: true });
    if (!credential) throw new ApiError(404, 'CREDENTIAL_NOT_FOUND');
    const adapter = getAdapter(credential.provider);
    if (!adapter || !adapter.supportsActualCosts) throw new ApiError(400, 'NO_ADAPTER_CONFIGURED');
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    try {
      const result = await adapter.fetchActualCosts({ apiKey: credential.apiKey, scopeConfig: credential.scopeConfig, start: start.toISOString(), end: end.toISOString() });
      await repo.providerCostCredentials.recordValidation(credential.id, { status: 'valid', error: null });
      await audit(req, 'aiCostControl.credential.testConnection', 'providerCostCredential', credential.id, { ok: true });
      res.json({ ok: true, periodCount: result.periods.length });
    } catch (error) {
      const code = error && error.code ? error.code : 'UNKNOWN_ERROR';
      const status = code === 'OPENAI_COSTS_UNAUTHORIZED' || code === 'OPENAI_COSTS_FORBIDDEN' ? 'invalid' : 'unknown';
      await repo.providerCostCredentials.recordValidation(credential.id, { status, error: code });
      await audit(req, 'aiCostControl.credential.testConnection', 'providerCostCredential', credential.id, { ok: false, errorCode: code });
      res.json({ ok: false, reason: code });
    }
  }));

  // ---- Manual refresh against the provider's official cost API ---------------------------------
  app.post('/refresh', refreshLimiter, asyncHandler(async (req, res) => {
    const body = req.body || {};
    requireKnownProvider(body.provider);
    const range = resolveRange(body);
    const status = await providerConfigStatus(repo, body.provider);
    if (!status.supported) throw new ApiError(400, 'NO_ADAPTER_CONFIGURED', null, { provider: body.provider });
    if (!status.configured) throw new ApiError(400, 'CREDENTIAL_NOT_CONFIGURED', null, { provider: body.provider });
    const credential = await repo.providerCostCredentials.get(status.credential.id, { includeDecrypted: true });
    const result = await refreshProviderCosts(repo, {
      provider: body.provider, credentialId: credential.id, apiKey: credential.apiKey, scopeConfig: credential.scopeConfig,
      start: range.start, end: range.end, triggeredBy: req.currentUser.id
    });
    await audit(req, 'aiCostControl.provider.refresh', 'providerCostSyncRun', result.run ? result.run.id : null, { provider: body.provider, range, ok: result.ok, reason: result.reason || null });
    if (!result.ok) return res.status(502).json(result);
    res.status(201).json(result);
  }));

  app.get('/sync-runs', asyncHandler(async (req, res) => {
    const provider = req.query.provider;
    if (provider) requireKnownProvider(provider);
    const runs = await repo.providerCostSync.recentRuns({ provider, limit: Math.min(100, Math.max(1, Number(req.query.limit) || 20)) });
    res.json({ runs });
  }));

  // ---- Balance (official when supported, else honestly unavailable; optional manual note) ------
  app.get('/balance/:provider', asyncHandler(async (req, res) => {
    requireKnownProvider(req.params.provider);
    const adapter = getAdapter(req.params.provider);
    const status = await providerConfigStatus(repo, req.params.provider);
    const manual = await repo.providerBalanceSnapshots.latest(req.params.provider);
    if (adapter && adapter.supportsBalance && status.configured) {
      const credential = await repo.providerCostCredentials.get(status.credential.id, { includeDecrypted: true });
      const result = await adapter.fetchBalance({ apiKey: credential.apiKey, scopeConfig: credential.scopeConfig });
      return res.json({ ...result, manual });
    }
    res.json({ supported: false, reason: adapter ? 'NO_OFFICIAL_BALANCE_API' : 'NO_ADAPTER_CONFIGURED', manual });
  }));

  app.post('/balance/:provider/manual-snapshot', asyncHandler(async (req, res) => {
    requireKnownProvider(req.params.provider);
    const body = req.body || {};
    const amountUsd = Number(body.amountUsd);
    if (!Number.isFinite(amountUsd) || amountUsd < 0) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'amountUsd' });
    const snapshot = await repo.providerBalanceSnapshots.create({
      provider: req.params.provider, amountMicroUsd: Math.round(amountUsd * 1000000), currency: body.currency || 'usd',
      note: body.note || null, adminUserId: req.currentUser.id
    });
    await audit(req, 'aiCostControl.balance.manualSnapshot', 'provider', req.params.provider, { amountUsd, hasNote: Boolean(body.note) });
    res.status(201).json(snapshot);
  }));

  return app;
}
