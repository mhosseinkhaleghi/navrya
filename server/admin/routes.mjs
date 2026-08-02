import express from 'express';
import { ApiError, asyncHandler } from '../community/errors.mjs';

const KNOWN_PROVIDERS = ['openai', 'anthropic', 'kimi', 'deepseek'];
const SORTABLE_COLUMNS = ['displayName', 'createdAt', 'lastLoginAt', 'isOnline', 'hoursOnline', 'purchaseCount', 'totalMockSpent', 'totalTokensUsed'];
// 3x the 45s client heartbeat interval (admin-heartbeat.js) - a missed beat or two shouldn't
// flip a still-open tab to "offline"; matches repo.pg.mjs's ONLINE_THRESHOLD_SECONDS.
const ONLINE_SWEEP_THRESHOLD_MS = 135000;

function numOrNull(value) { return value === null || value === undefined || value === '' ? null : Number(value); }
function intOrNull(value) { return value === null || value === undefined || value === '' ? null : Math.round(Number(value)); }

export function router(repo) {
  const app = express.Router();

  async function audit(req, action, targetType, targetId, details) {
    await repo.auditLog.create({ adminUserId: req.currentUser.id, action, targetType, targetId, details: details || {} });
  }

  app.get('/users', asyncHandler(async (req, res) => {
    await repo.sessions.sweepStale(ONLINE_SWEEP_THRESHOLD_MS);
    const [users, sessionAgg, usageAgg, purchaseAgg] = await Promise.all([
      repo.users.list(), repo.sessions.aggregateByUser(), repo.usageEvents.aggregateByUser(), repo.purchases.aggregateByBuyer()
    ]);
    let rows = users.map((u) => {
      const s = sessionAgg[u.id] || {};
      const p = purchaseAgg[u.id] || { count: 0, total: 0 };
      return {
        id: u.id, displayName: u.displayName, role: u.role, suspendedAt: u.suspendedAt, createdAt: u.createdAt,
        lastLoginAt: s.lastLoginAt || null, isOnline: Boolean(s.isOnline), hoursOnline: Number((s.hoursOnline || 0).toFixed(2)),
        purchaseCount: p.count, totalMockSpent: p.total, totalTokensUsed: usageAgg[u.id] || 0
      };
    });
    const search = String(req.query.search || '').trim().toLowerCase();
    if (search) rows = rows.filter((r) => r.displayName.toLowerCase().includes(search));
    const sortKey = SORTABLE_COLUMNS.includes(req.query.sort) ? req.query.sort : 'createdAt';
    const dir = req.query.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string' || typeof bv === 'string') return dir * String(av || '').localeCompare(String(bv || ''));
      return dir * ((Number(av) || 0) - (Number(bv) || 0));
    });
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const total = rows.length;
    res.json({ users: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize });
  }));

  app.get('/users/:id', asyncHandler(async (req, res) => {
    const user = await repo.users.get(req.params.id);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
    const [sessions, usageAgg, purchaseAgg] = await Promise.all([
      repo.sessions.listByUser(user.id), repo.usageEvents.aggregateByUser(), repo.purchases.aggregateByBuyer()
    ]);
    res.json({ ...user, sessions, totalTokensUsed: usageAgg[user.id] || 0, purchases: purchaseAgg[user.id] || { count: 0, total: 0 } });
  }));

  app.patch('/users/:id', asyncHandler(async (req, res) => {
    const existing = await repo.users.get(req.params.id);
    if (!existing) throw new ApiError(404, 'USER_NOT_FOUND');
    const body = req.body || {};
    const patch = {};
    if (body.role !== undefined) {
      if (!['user', 'moderator', 'admin'].includes(body.role)) throw new ApiError(400, 'VALIDATION_FAILED');
      patch.role = body.role;
    }
    if ('suspendedAt' in body) patch.suspendedAt = body.suspendedAt || null;
    const updated = await repo.users.update(req.params.id, patch);
    await audit(req, 'user.update', 'user', req.params.id, { before: { role: existing.role, suspendedAt: existing.suspendedAt }, after: patch });
    res.json(updated);
  }));

  app.get('/ai/keys', asyncHandler(async (req, res) => {
    const rows = await repo.adminKeys.list();
    const byProvider = {};
    rows.forEach((row) => { byProvider[row.provider] = row; });
    // Built field-by-field from the masked shape only - row.apiKey never touches this response.
    res.json(KNOWN_PROVIDERS.map((provider) => {
      const row = byProvider[provider];
      return { provider, isSet: Boolean(row), updatedAt: row ? row.updatedAt : null };
    }));
  }));

  app.post('/ai/keys', asyncHandler(async (req, res) => {
    const provider = req.body && req.body.provider;
    if (!KNOWN_PROVIDERS.includes(provider)) throw new ApiError(400, 'VALIDATION_FAILED');
    await repo.adminKeys.upsert({ provider, apiKey: req.body.apiKey, updatedBy: req.currentUser.id });
    // Deliberately no key material in the audit trail - just the fact that it was set.
    await audit(req, 'ai.keys.set', 'adminKey', provider, {});
    const row = await repo.adminKeys.get(provider);
    res.status(201).json({ provider, isSet: Boolean(row), updatedAt: row ? row.updatedAt : null });
  }));

  app.get('/ai/usage', asyncHandler(async (req, res) => {
    const [byProviderAndDay, byUser] = await Promise.all([repo.usageEvents.aggregateByProviderAndDay({}), repo.usageEvents.aggregateByUser()]);
    res.json({ byProviderAndDay, byUser });
  }));

  app.get('/ai/pricing', asyncHandler(async (req, res) => {
    const rows = await repo.providerPricing.list();
    const byProvider = {};
    rows.forEach((row) => { byProvider[row.provider] = row; });
    res.json(KNOWN_PROVIDERS.map((provider) => byProvider[provider] || { provider, promptPricePer1k: null, completionPricePer1k: null, monthlyTokenBudget: null, updatedAt: null }));
  }));

  app.post('/ai/pricing', asyncHandler(async (req, res) => {
    const provider = req.body && req.body.provider;
    if (!KNOWN_PROVIDERS.includes(provider)) throw new ApiError(400, 'VALIDATION_FAILED');
    const record = await repo.providerPricing.upsert({
      provider,
      promptPricePer1k: numOrNull(req.body.promptPricePer1k),
      completionPricePer1k: numOrNull(req.body.completionPricePer1k),
      monthlyTokenBudget: intOrNull(req.body.monthlyTokenBudget)
    });
    await audit(req, 'ai.pricing.set', 'providerPricing', provider, record);
    res.status(201).json(record);
  }));

  app.get('/technical', asyncHandler(async (req, res) => {
    const health = await repo.health();
    let aiGateway = { ok: false };
    try {
      const url = (process.env.PATTERN_AI_URL || 'http://127.0.0.1:8787') + '/health';
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      aiGateway = response.ok ? await response.json() : { ok: false };
    } catch (_) { aiGateway = { ok: false }; }
    res.json({
      db: { backend: health.backend, ok: health.dbOk },
      migrations: health.migrations,
      communityApi: { ok: true },
      aiGateway,
      errorTracking: 'not implemented'
    });
  }));

  app.get('/marketplace/listings', asyncHandler(async (req, res) => {
    const [listings, sellers] = await Promise.all([repo.listings.listAll({ status: req.query.status || 'all' }), repo.users.list()]);
    const byId = {};
    sellers.forEach((u) => { byId[u.id] = u; });
    res.json(listings.map((listing) => ({ ...listing, sellerName: byId[listing.sellerId] ? byId[listing.sellerId].displayName : null })));
  }));

  app.patch('/marketplace/listings/:id', asyncHandler(async (req, res) => {
    const existing = await repo.listings.get(req.params.id);
    if (!existing) throw new ApiError(404, 'LISTING_NOT_FOUND');
    const body = req.body || {};
    const patch = {};
    if (body.status !== undefined) {
      if (!['draft', 'published', 'delisted'].includes(body.status)) throw new ApiError(400, 'VALIDATION_FAILED');
      patch.status = body.status;
    }
    if (body.featured !== undefined) patch.featured = Boolean(body.featured);
    const updated = await repo.listings.update(req.params.id, patch);
    await audit(req, 'marketplace.listing.update', 'listing', req.params.id, { before: { status: existing.status, featured: existing.featured }, after: patch });
    res.json(updated);
  }));

  app.get('/finance/overview', asyncHandler(async (req, res) => {
    const monthKey = new Date().toISOString().slice(0, 7);
    const [buyerAgg, usageThisMonth, pricingRows] = await Promise.all([
      repo.purchases.aggregateByBuyer(), repo.usageEvents.aggregateByProviderForMonth(monthKey), repo.providerPricing.list()
    ]);
    const mockRevenueTotal = Object.values(buyerAgg).reduce((sum, b) => sum + b.total, 0);
    const pricingByProvider = {};
    pricingRows.forEach((p) => { pricingByProvider[p.provider] = p; });
    const usageByProvider = {};
    usageThisMonth.forEach((u) => { usageByProvider[u.provider] = u; });

    const aiCostByProvider = KNOWN_PROVIDERS.map((provider) => {
      const pricing = pricingByProvider[provider];
      const usage = usageByProvider[provider] || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      if (!pricing || pricing.promptPricePer1k == null || pricing.completionPricePer1k == null) {
        return { provider, cost: null, reason: 'NO_PRICING_SET', tokensUsed: usage.totalTokens };
      }
      const cost = (usage.promptTokens / 1000) * pricing.promptPricePer1k + (usage.completionTokens / 1000) * pricing.completionPricePer1k;
      return { provider, cost: Number(cost.toFixed(4)), tokensUsed: usage.totalTokens };
    });

    const remainingBudgetByProvider = KNOWN_PROVIDERS.map((provider) => {
      const pricing = pricingByProvider[provider];
      const usage = usageByProvider[provider] || { totalTokens: 0 };
      if (!pricing || pricing.monthlyTokenBudget == null) return { provider, remaining: null, reason: 'NO_BUDGET_SET' };
      return { provider, remaining: pricing.monthlyTokenBudget - usage.totalTokens, budget: pricing.monthlyTokenBudget, used: usage.totalTokens };
    });

    res.json({
      mockRevenue: { total: Number(mockRevenueTotal.toFixed(2)), mock: true },
      aiCostByProvider,
      remainingBudgetByProvider
    });
  }));

  return app;
}
