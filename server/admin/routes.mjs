import express from 'express';
import { ApiError, asyncHandler } from '../community/errors.mjs';
import {
  levelForXp, POINTS_BY_TYPE, DOMAIN_BY_TYPE, DOMAIN_DAILY_CAP, PER_SOURCE_MAX, PER_TYPE_PERIOD_CAP,
  RECURRING_DAILY_CAP_TOTAL, SOURCE_TOTAL_CAP
} from '../community/xp-rules.mjs';
import { ACHIEVEMENTS } from '../community/achievement-rules.mjs';
import { LEVEL_REQUIREMENTS } from '../community/mastery-rules.mjs';
import { getEffectiveXpConfig, invalidateXpConfigCache, SERVER_ONLY_ACHIEVEMENT_POINTS } from '../community/xp-config.mjs';

const KNOWN_PROVIDERS = ['openai', 'anthropic', 'kimi', 'deepseek'];
const SORTABLE_COLUMNS = ['displayName', 'createdAt', 'lastLoginAt', 'isOnline', 'hoursOnline', 'purchaseCount', 'totalMockSpent', 'totalTokensUsed'];
// 3x the 45s client heartbeat interval (admin-heartbeat.js) - a missed beat or two shouldn't
// flip a still-open tab to "offline"; matches repo.pg.mjs's ONLINE_THRESHOLD_SECONDS.
const ONLINE_SWEEP_THRESHOLD_MS = 135000;

function numOrNull(value) { return value === null || value === undefined || value === '' ? null : Number(value); }
function intOrNull(value) { return value === null || value === undefined || value === '' ? null : Math.round(Number(value)); }

// --- XP config admin editing (Section 11 "XP & Segmentation" tab) helpers ---
// Splits a requirement object like {closedSessions:2, domainXpMin:{psychology:100}} into flat
// {requirementKey, value} rows - one level of object nesting only, matching the two real nested
// shapes (domainXpMin/domainMinPercent) LEVEL_REQUIREMENTS actually uses.
function flattenRequirement(req) {
  const out = [];
  Object.keys(req).forEach((key) => {
    const value = req[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.keys(value).forEach((inner) => out.push({ requirementKey: key + ':' + inner, value: value[inner] }));
    } else {
      out.push({ requirementKey: key, value });
    }
  });
  return out;
}
function readNestedRequirement(req, requirementKey) {
  if (!req) return null;
  if (requirementKey.indexOf(':') === -1) return req[requirementKey];
  const [outer, inner] = requirementKey.split(':');
  return req[outer] ? req[outer][inner] : null;
}

// Every editable target must correspond to a REAL key already declared in the code defaults -
// an admin can retune a number, never invent a brand-new XP type/domain/achievement/requirement
// dimension through this route (that stays a code change, on purpose - see xp-config.mjs's header
// comment on the code-vs-data boundary).
function isKnownXpConfigTarget(category, key) {
  if (category === 'points') return key in POINTS_BY_TYPE;
  if (category === 'domainCap') return key in DOMAIN_DAILY_CAP;
  if (category === 'recurringCap') return true;
  if (category === 'sourceCap') return key in PER_SOURCE_MAX;
  if (category === 'periodCap') return key in PER_TYPE_PERIOD_CAP;
  if (category === 'sourceTotalCap') return key in SOURCE_TOTAL_CAP;
  if (category === 'achievementPoints') return key in ACHIEVEMENTS || key in SERVER_ONLY_ACHIEVEMENT_POINTS;
  if (category === 'mastery') {
    const sep = key.indexOf(':');
    if (sep === -1) return false;
    const level = Number(key.slice(0, sep));
    const requirementKey = key.slice(sep + 1);
    const req = LEVEL_REQUIREMENTS[level];
    if (!req) return false;
    return readNestedRequirement(req, requirementKey) !== null && readNestedRequirement(req, requirementKey) !== undefined;
  }
  return false;
}

function xpConfigKeyFor(category, key) {
  if (category === 'recurringCap') return 'recurringCap';
  if (category === 'points') return 'points:' + key;
  if (category === 'domainCap') return 'domainCap:' + key;
  if (category === 'sourceCap') return 'sourceCap:' + key;
  if (category === 'periodCap') return 'periodCap:' + key;
  if (category === 'sourceTotalCap') return 'sourceTotalCap:' + key;
  if (category === 'achievementPoints') return 'achievementPoints:' + key;
  if (category === 'mastery') return 'mastery:' + key;
  return null;
}

// Validates/normalizes the admin-submitted raw value into the JSONB shape xp-config.mjs's
// buildEffective() expects for that category, or null if invalid (caller 400s).
function xpConfigValueFor(category, rawValue) {
  if (category === 'periodCap') {
    const maxCount = Math.round(Number(rawValue && rawValue.maxCount));
    if (!Number.isFinite(maxCount) || maxCount < 0) return null;
    return { maxCount, period: rawValue && rawValue.period === 'week' ? 'week' : 'day' };
  }
  if (category === 'domainCap' || category === 'recurringCap') {
    const dailyCap = Math.round(Number(rawValue));
    return Number.isFinite(dailyCap) && dailyCap >= 0 ? { dailyCap } : null;
  }
  if (category === 'sourceCap') {
    const maxCount = Math.round(Number(rawValue));
    return Number.isFinite(maxCount) && maxCount >= 0 ? { maxCount } : null;
  }
  if (category === 'sourceTotalCap') {
    const cap = Math.round(Number(rawValue));
    return Number.isFinite(cap) && cap >= 0 ? { cap } : null;
  }
  if (category === 'mastery') {
    const value = Number(rawValue);
    return Number.isFinite(value) && value >= 0 ? { value } : null;
  }
  if (category === 'points' || category === 'achievementPoints') {
    const points = Math.round(Number(rawValue));
    return Number.isFinite(points) && points >= 0 ? { points } : null;
  }
  return null;
}

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
    // Computed from the full (unfiltered-by-search) set, since this backs a top-of-page "at a
    // glance" stat card - it should reflect the whole user base, not just whatever a search
    // term or pagination happens to be showing in the table below it.
    const onlineCount = rows.filter((r) => r.isOnline).length;
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
    res.json({ users: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, onlineCount });
  }));

  app.get('/users/:id', asyncHandler(async (req, res) => {
    const user = await repo.users.get(req.params.id);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
    // `...user` already carries email/phone/profileRole/kycStatus/xpTotal/avatarDataUrl - mapUser()
    // was extended for the Account Profile feature, so no extra fetch is needed for those. This
    // response additionally joins in the level, unlocked achievements, and subscription
    // purchases so the Admin Users-tab detail view has everything a support agent needs on one
    // screen (ARCHITECTURE.md §7.16/§7.17), without a second round trip.
    const [sessions, usageAgg, purchaseAgg, achievements, purchases] = await Promise.all([
      repo.sessions.listByUser(user.id), repo.usageEvents.aggregateByUser(), repo.purchases.aggregateByBuyer(),
      repo.achievements.listForUser(user.id), repo.purchases.listByBuyer(user.id)
    ]);
    const purchasesWithListings = await Promise.all(purchases.map(async (purchase) => ({ purchase, listing: await repo.listings.get(purchase.listingId) })));
    const subscriptions = purchasesWithListings
      .filter((row) => row.listing && row.listing.type === 'subscription')
      .map((row) => ({ ...row.purchase, listing: row.listing }));
    res.json({
      ...user, level: levelForXp(user.xpTotal), sessions, totalTokensUsed: usageAgg[user.id] || 0,
      purchases: purchaseAgg[user.id] || { count: 0, total: 0 }, achievements, subscriptions
    });
  }));

  app.patch('/users/:id/kyc', asyncHandler(async (req, res) => {
    const existing = await repo.users.get(req.params.id);
    if (!existing) throw new ApiError(404, 'USER_NOT_FOUND');
    const body = req.body || {};
    if (!['not_started', 'pending', 'verified', 'rejected'].includes(body.kycStatus)) throw new ApiError(400, 'VALIDATION_FAILED');
    const updated = await repo.users.updateKyc(req.params.id, body.kycStatus);
    await audit(req, 'user.kyc.update', 'user', req.params.id, { before: { kycStatus: existing.kycStatus }, after: { kycStatus: body.kycStatus } });
    res.json(updated);
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

  // --- XP & Segmentation tab (Section 11 XP engine) - real admin-editable rule configuration,
  // not the placeholder it used to be. Every number the XP engine uses is listed here alongside
  // its code default and whether it's currently overridden; only points:/caps:/mastery-threshold
  // NUMBERS are ever editable (see isKnownXpConfigTarget's comment) - never the verification
  // logic behind them.
  app.get('/xp/config', asyncHandler(async (req, res) => {
    const [cfg, overrideRows] = await Promise.all([getEffectiveXpConfig(repo), repo.xpConfig.list()]);
    const overriddenKeys = new Set(overrideRows.map((row) => row.key));
    const updatedAtByKey = {};
    overrideRows.forEach((row) => { updatedAtByKey[row.key] = row.updatedAt; });
    const rowFor = (dbKey, extra, def, current) => ({ ...extra, default: def, current, overridden: overriddenKeys.has(dbKey), updatedAt: updatedAtByKey[dbKey] || null });

    const points = Object.keys(POINTS_BY_TYPE).sort().map((type) =>
      rowFor('points:' + type, { type, domain: DOMAIN_BY_TYPE[type] || null }, POINTS_BY_TYPE[type], cfg.points[type]));
    const domainCaps = Object.keys(DOMAIN_DAILY_CAP).map((domain) =>
      rowFor('domainCap:' + domain, { domain }, DOMAIN_DAILY_CAP[domain], cfg.domainCaps[domain]));
    const recurringCap = rowFor('recurringCap', {}, RECURRING_DAILY_CAP_TOTAL, cfg.recurringCap);
    const sourceCaps = Object.keys(PER_SOURCE_MAX).sort().map((type) =>
      rowFor('sourceCap:' + type, { type }, PER_SOURCE_MAX[type], cfg.sourceCaps[type]));
    const periodCaps = Object.keys(PER_TYPE_PERIOD_CAP).sort().map((type) =>
      rowFor('periodCap:' + type, { type }, PER_TYPE_PERIOD_CAP[type], cfg.periodCaps[type]));
    const sourceTotalCaps = Object.keys(SOURCE_TOTAL_CAP).sort().map((sourceType) =>
      rowFor('sourceTotalCap:' + sourceType, { sourceType }, SOURCE_TOTAL_CAP[sourceType], cfg.sourceTotalCaps[sourceType]));
    const achievementKeys = Array.from(new Set(Object.keys(ACHIEVEMENTS).concat(Object.keys(SERVER_ONLY_ACHIEVEMENT_POINTS)))).sort();
    const achievementPoints = achievementKeys.map((key) =>
      rowFor('achievementPoints:' + key, { key }, (ACHIEVEMENTS[key] || {}).points ?? SERVER_ONLY_ACHIEVEMENT_POINTS[key], cfg.achievementPoints[key]));
    const masteryRequirements = [];
    Object.keys(LEVEL_REQUIREMENTS).forEach((levelStr) => {
      const level = Number(levelStr);
      flattenRequirement(LEVEL_REQUIREMENTS[level]).forEach(({ requirementKey, value }) => {
        masteryRequirements.push(rowFor('mastery:' + level + ':' + requirementKey, { level, requirementKey }, value, readNestedRequirement(cfg.masteryRequirements[level], requirementKey)));
      });
    });

    res.json({ points, domainCaps, recurringCap, sourceCaps, periodCaps, sourceTotalCaps, achievementPoints, masteryRequirements });
  }));

  app.post('/xp/config', asyncHandler(async (req, res) => {
    const { category, key, value } = req.body || {};
    const normalizedKey = category === 'recurringCap' ? '' : String(key || '');
    if (!isKnownXpConfigTarget(category, normalizedKey)) throw new ApiError(400, 'UNKNOWN_XP_CONFIG_TARGET');
    const configKey = xpConfigKeyFor(category, normalizedKey);
    const dbValue = xpConfigValueFor(category, value);
    if (!configKey || dbValue == null) throw new ApiError(400, 'VALIDATION_FAILED');
    const record = await repo.xpConfig.set(configKey, dbValue, req.currentUser.id);
    invalidateXpConfigCache();
    await audit(req, 'xp.config.set', 'xpConfigOverride', configKey, { category, key: normalizedKey, value: dbValue });
    res.status(201).json(record);
  }));

  app.delete('/xp/config', asyncHandler(async (req, res) => {
    const category = req.query.category;
    const key = category === 'recurringCap' ? '' : String(req.query.key || '');
    const configKey = xpConfigKeyFor(category, key);
    if (!configKey) throw new ApiError(400, 'VALIDATION_FAILED');
    await repo.xpConfig.remove(configKey);
    invalidateXpConfigCache();
    await audit(req, 'xp.config.reset', 'xpConfigOverride', configKey, { category, key });
    res.json({ removed: true });
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
