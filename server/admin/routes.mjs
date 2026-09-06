import express from 'express';
import { ApiError, asyncHandler } from '../community/errors.mjs';
import { requireRecentReauth } from './auth-admin.mjs';
import {
  levelForXp, POINTS_BY_TYPE, DOMAIN_BY_TYPE, DOMAIN_DAILY_CAP, PER_SOURCE_MAX, PER_TYPE_PERIOD_CAP,
  RECURRING_DAILY_CAP_TOTAL, SOURCE_TOTAL_CAP
} from '../community/xp-rules.mjs';
import { ACHIEVEMENTS } from '../community/achievement-rules.mjs';
import { LEVEL_REQUIREMENTS } from '../community/mastery-rules.mjs';
import { getEffectiveXpConfig, invalidateXpConfigCache, SERVER_ONLY_ACHIEVEMENT_POINTS } from '../community/xp-config.mjs';
import { router as voiceProvidersRouter } from './routes.voice-providers.mjs';
import { router as commercialRouter } from './routes.commercial.mjs';
import { router as conversationScenariosRouter } from './routes.conversation-scenarios.mjs';
import { GEMINI_TTS_VOICE_OPTIONS, GEMINI_VOICE_CHARACTERS, mergeGeminiVoiceProfile, normalizeGeminiVoiceProfileInput } from '../ai/gemini-voice-profiles.mjs';

const KNOWN_PROVIDERS = ['openai', 'anthropic', 'gemini', 'kimi', 'deepseek'];
// Admin's server fallback catalog. This is intentionally not the trader-facing model picker:
// a user's explicit in-app model choice still wins for that request. The Gemini choices mirror
// public/pages/shared/ai-settings-store.js, so the generic Admin test cannot accidentally keep
// calling the retired gemini-2.5-pro model shown in the production error report.
const PROVIDER_MODEL_OPTIONS = {
  gemini: ['gemini-3.1-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
};
const PROVIDER_DEFAULT_MODELS = { gemini: 'gemini-3.1-pro-preview' };
const PROVIDER_MODEL_ENV = { gemini: 'GEMINI_MODEL' };
const SORTABLE_COLUMNS = ['displayName', 'createdAt', 'lastLoginAt', 'isOnline', 'hoursOnline', 'purchaseCount', 'totalMockSpent', 'totalTokensUsed'];
// 3x the 45s client heartbeat interval (admin-heartbeat.js) - a missed beat or two shouldn't
// flip a still-open tab to "offline"; matches repo.pg.mjs's ONLINE_THRESHOLD_SECONDS.
const ONLINE_SWEEP_THRESHOLD_MS = 135000;

function numOrNull(value) { return value === null || value === undefined || value === '' ? null : Number(value); }
function intOrNull(value) { return value === null || value === undefined || value === '' ? null : Math.round(Number(value)); }
// AI billing operational fix - mirrors routes.commercial.mjs's identical guard for
// provider_model_pricing: resolvePricingRate() (wallet-service.mjs) treats an explicit 0 as
// "configured", so a provider-level row saved with both prices at 0 would silently make every
// model under that provider free forever with no error. null+null (not yet configured) stays
// allowed and correctly fails closed later via PROVIDER_PRICING_NOT_CONFIGURED.
function isZeroPricedPair(promptPricePer1k, completionPricePer1k) {
  return promptPricePer1k === 0 && completionPricePer1k === 0;
}

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

export function router(repo, uploadsDir) {
  const app = express.Router();

  async function audit(req, action, targetType, targetId, details) {
    await repo.auditLog.create({ adminUserId: req.currentUser.id, action, targetType, targetId, details: details || {} });
  }

  // Prevents removal/suspension/demotion of the LAST remaining active admin without a separate,
  // explicit out-of-band recovery procedure (scripts/admin-grant.mjs) - otherwise a single
  // careless or malicious PATCH could permanently lock every admin surface (including the one
  // needed to undo it) with no way back in short of direct database access.
  async function isOnlyActiveAdmin(userId) {
    const users = await repo.users.list();
    const activeAdmins = users.filter((u) => u.role === 'admin' && !u.suspendedAt);
    return activeAdmins.length === 1 && activeAdmins[0].id === userId;
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
    const [sessions, usageAgg, usageByProvider, purchaseAgg, achievements, purchases, usageByModel, settlements] = await Promise.all([
      repo.sessions.listByUser(user.id), repo.usageEvents.aggregateByUser(), repo.usageEvents.aggregateByUserAndProvider(user.id),
      repo.purchases.aggregateByBuyer(), repo.achievements.listForUser(user.id), repo.purchases.listByBuyer(user.id),
      // Real per-model $ cost/charge (task D.2) - gateway-origin only (default), so this can never
      // be inflated by the same user's own untrusted client-reported usageByProvider tokens above.
      repo.usageEvents.aggregateByModelForUser(user.id),
      // AI Cost Control's per-user drill-down (integrated into this same existing profile view,
      // never a parallel endpoint) - real wallet settlement links, cash vs promo debit.
      repo.wallet.settlementsForUser(user.id, { limit: 100 })
    ]);
    const purchasesWithListings = await Promise.all(purchases.map(async (purchase) => ({ purchase, listing: await repo.listings.get(purchase.listingId) })));
    const subscriptions = purchasesWithListings
      .filter((row) => row.listing && row.listing.type === 'subscription')
      .map((row) => ({ ...row.purchase, listing: row.listing }));
    const settledRetailChargeMicroUsd = settlements.reduce((sum, entry) => sum + Math.abs(entry.cashDeltaMicroUsd) + Math.abs(entry.promoDeltaMicroUsd), 0);
    const expectedRetailChargeMicroUsd = usageByModel.reduce((sum, row) => sum + row.retailChargeMicroUsd, 0);
    const aiCost = {
      providerCostMicroUsd: usageByModel.reduce((sum, row) => sum + row.providerCostMicroUsd, 0),
      retailChargeMicroUsd: expectedRetailChargeMicroUsd,
      byModel: usageByModel,
      // AI Cost Control: real settlement links with the cash/promo split each one actually moved -
      // never organization-level external cost allocated to a user as if it were exact (this app
      // has no per-call, per-user external cost attribution from any provider's cost API).
      walletSettlements: settlements.map((entry) => ({
        id: entry.id, provider: entry.provider, model: entry.model, feature: entry.feature,
        cashDeltaMicroUsd: entry.cashDeltaMicroUsd, promoDeltaMicroUsd: entry.promoDeltaMicroUsd,
        providerCostMicroUsd: entry.providerCostMicroUsd, retailChargeMicroUsd: entry.retailChargeMicroUsd, createdAt: entry.createdAt
      })),
      // A cheap, real reconciliation signal computed from data already fetched above (never a
      // second query): this user's total EXPECTED retail charge (from their own gateway-
      // authoritative usage events, unbounded) versus what the last 100 AI_SETTLEMENT ledger rows
      // for this user actually moved. Honestly scoped, not the full exact Domain A reconciliation
      // (server/commercial/provider-cost/reconciliation-service.mjs, date-ranged and unbounded via
      // pagination) - `sampleLimited` is true when this user has more than 100 settlements, in
      // which case a "mismatch" here may simply mean "older than the last 100," not a real
      // exception; only trust `matches` as a real signal when `sampleLimited` is false.
      reconciliation: {
        expectedRetailChargeMicroUsd, settledRetailChargeMicroUsd,
        matches: expectedRetailChargeMicroUsd === settledRetailChargeMicroUsd,
        sampleLimited: settlements.length >= 100
      }
    };
    res.json({
      ...user, level: levelForXp(user.xpTotal), sessions, totalTokensUsed: usageAgg[user.id] || 0, usageByProvider,
      purchases: purchaseAgg[user.id] || { count: 0, total: 0 }, achievements, subscriptions, aiCost
    });
  }));

  // Step-up required (requireRecentReauth): KYC status is a real trust signal other systems key
  // off of - changing it must follow a genuine recent reauthentication, not just an
  // already-long-open admin session.
  app.patch('/users/:id/kyc', requireRecentReauth(), asyncHandler(async (req, res) => {
    const existing = await repo.users.get(req.params.id);
    if (!existing) throw new ApiError(404, 'USER_NOT_FOUND');
    const body = req.body || {};
    if (!['not_started', 'pending', 'verified', 'rejected'].includes(body.kycStatus)) throw new ApiError(400, 'VALIDATION_FAILED');
    const updated = await repo.users.updateKyc(req.params.id, body.kycStatus);
    await audit(req, 'user.kyc.update', 'user', req.params.id, { before: { kycStatus: existing.kycStatus }, after: { kycStatus: body.kycStatus } });
    res.json(updated);
  }));

  // Step-up required. Also the final-admin protection: a role change away from 'admin' or a
  // suspension applied to the LAST remaining active admin is rejected outright (409), rather
  // than silently locking every admin surface including the one that would be needed to undo it.
  app.patch('/users/:id', requireRecentReauth(), asyncHandler(async (req, res) => {
    const existing = await repo.users.get(req.params.id);
    if (!existing) throw new ApiError(404, 'USER_NOT_FOUND');
    const body = req.body || {};
    const patch = {};
    if (body.role !== undefined) {
      if (!['user', 'moderator', 'admin'].includes(body.role)) throw new ApiError(400, 'VALIDATION_FAILED');
      if (existing.role === 'admin' && body.role !== 'admin' && await isOnlyActiveAdmin(existing.id)) {
        throw new ApiError(409, 'CANNOT_REMOVE_LAST_ADMIN');
      }
      patch.role = body.role;
    }
    if ('suspendedAt' in body) {
      if (body.suspendedAt && existing.role === 'admin' && await isOnlyActiveAdmin(existing.id)) {
        throw new ApiError(409, 'CANNOT_SUSPEND_LAST_ADMIN');
      }
      patch.suspendedAt = body.suspendedAt || null;
    }
    const updated = await repo.users.update(req.params.id, patch);
    // A role change or suspension is a privilege-relevant change for the TARGET user - force
    // every one of their other sessions to re-authenticate immediately, not just on next login.
    if ('role' in patch || 'suspendedAt' in patch) {
      const { revokeAllSessions } = await import('../community/security/session-service.mjs');
      await revokeAllSessions(repo, req.params.id, 'role_change');
    }
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

  // Step-up required: a provider API key is a real production credential.
  app.post('/ai/keys', requireRecentReauth(), asyncHandler(async (req, res) => {
    const provider = req.body && req.body.provider;
    if (!KNOWN_PROVIDERS.includes(provider)) throw new ApiError(400, 'VALIDATION_FAILED');
    await repo.adminKeys.upsert({ provider, apiKey: req.body.apiKey, updatedBy: req.currentUser.id });
    // Deliberately no key material in the audit trail - just the fact that it was set.
    await audit(req, 'ai.keys.set', 'adminKey', provider, {});
    const row = await repo.adminKeys.get(provider);
    res.status(201).json({ provider, isSet: Boolean(row), updatedAt: row ? row.updatedAt : null });
  }));

  // The effective model is exposed separately from key status so model operations never risk
  // returning credential material. An admin override is live runtime configuration; without one,
  // the deployed environment value remains the fallback, then the reviewed code default.
  app.get('/ai/models', asyncHandler(async (_req, res) => {
    const rows = await repo.adminModelOverrides.list();
    const byProvider = {};
    rows.forEach((row) => { byProvider[row.provider] = row; });
    res.json(KNOWN_PROVIDERS.map((provider) => {
      const override = byProvider[provider] || null;
      const environmentModel = PROVIDER_MODEL_ENV[provider] ? (process.env[PROVIDER_MODEL_ENV[provider]] || null) : null;
      const defaultModel = PROVIDER_DEFAULT_MODELS[provider] || null;
      const effectiveModel = override ? override.model : (environmentModel || defaultModel);
      return {
        provider,
        effectiveModel,
        source: override ? 'admin' : (environmentModel ? 'environment' : 'default'),
        overrideModel: override ? override.model : null,
        updatedAt: override ? override.updatedAt : null,
        options: PROVIDER_MODEL_OPTIONS[provider] || []
      };
    }));
  }));

  // At present Gemini is the only independently verified provider model catalog in Admin. Keep
  // the validation allowlisted; accepting arbitrary model strings here would let an operator
  // silently route all live traffic to a typo, retired model, or unintended paid preview.
  app.post('/ai/models', requireRecentReauth(), asyncHandler(async (req, res) => {
    const provider = req.body && req.body.provider;
    const model = req.body && req.body.model;
    if (!PROVIDER_MODEL_OPTIONS[provider] || !PROVIDER_MODEL_OPTIONS[provider].includes(model)) throw new ApiError(400, 'MODEL_NOT_ALLOWED');
    const record = await repo.adminModelOverrides.upsert({ provider, model, updatedBy: req.currentUser.id });
    await audit(req, 'ai.model.set', 'adminModelOverride', provider, { model: record.model });
    res.status(201).json(record);
  }));

  // Gemini Voice is an independent delivery-profile surface. It does not store a key, alter
  // Gemini text-chat settings, or weaken the approved workflow/safety path. Every saved rule is
  // bounded and merged with reviewed defaults by the gateway before it reaches a live session.
  app.get('/ai/gemini-voice-profiles', asyncHandler(async (_req, res) => {
    const rows = await repo.adminGeminiVoiceProfiles.list();
    const byCharacter = {};
    rows.forEach((row) => { byCharacter[row.character] = row; });
    res.json({
      voices: GEMINI_TTS_VOICE_OPTIONS,
      profiles: GEMINI_VOICE_CHARACTERS.map((character) => mergeGeminiVoiceProfile(character, byCharacter[character]))
    });
  }));

  app.post('/ai/gemini-voice-profiles', requireRecentReauth(), asyncHandler(async (req, res) => {
    let input;
    try {
      input = normalizeGeminiVoiceProfileInput(req.body || {});
    } catch (error) {
      throw new ApiError(400, error.message === 'GEMINI_VOICE_PROFILE_TOO_LONG' || error.message === 'GEMINI_VOICE_NOT_ALLOWED' ? error.message : 'VALIDATION_FAILED');
    }
    const record = await repo.adminGeminiVoiceProfiles.upsert({ ...input, updatedBy: req.currentUser.id });
    await audit(req, 'ai.geminiVoiceProfile.set', 'adminGeminiVoiceProfile', record.character, {
      voiceMale: record.voiceMale, voiceFemale: record.voiceFemale,
      speechRuleLength: record.speechRule.length, interactionRuleLength: record.interactionRule.length
    });
    res.status(201).json(mergeGeminiVoiceProfile(record.character, record));
  }));

  app.get('/ai/usage', asyncHandler(async (req, res) => {
    // Defaults to a 30-day trend rather than an unbounded all-time scan; ?days=N (e.g. the AI
    // tab's 14-day chart) narrows it further. aggregateByProviderAndDay already supported
    // {since} - this route just never exposed it until now.
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const [byProviderAndDay, byUser] = await Promise.all([repo.usageEvents.aggregateByProviderAndDay({ since }), repo.usageEvents.aggregateByUser()]);
    res.json({ byProviderAndDay, byUser, days });
  }));

  // Real, settled per-model $ cost/charge across every user (task D.3) - additive to the
  // provider-level token/estimate reporting above, never replacing it. Gateway-origin only
  // (aggregateByModel's default), so this is real cost, not the token-count-times-price estimate
  // /ai/usage and /finance/overview already show - keep the two clearly labeled and distinct on
  // the client (never summed together as one number).
  app.get('/ai/usage-by-model', asyncHandler(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const byModel = await repo.usageEvents.aggregateByModel({ since });
    res.json({ byModel, days });
  }));

  // Section 7.16 follow-up: "is this provider actually working right now, or did it just
  // disconnect" - derived read-side from the append-only ai_provider_health_events log
  // (server/pattern-ai-server.mjs reports one event per callProvider() outcome via
  // POST /internal/ai-health-event). Status is computed here, never stored, mirroring
  // xp-config.mjs's "merge at read time" convention.
  const HEALTH_FRESH_WINDOW_MS = 15 * 60 * 1000;
  const HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;
  app.get('/ai/health', asyncHandler(async (req, res) => {
    const since = new Date(Date.now() - HEALTH_WINDOW_MS).toISOString();
    const [latestByProvider, aggregateSince, recent, keyRows] = await Promise.all([
      repo.providerHealth.latestByProvider(), repo.providerHealth.aggregateSince(since),
      repo.providerHealth.recent({ limit: 50 }), repo.adminKeys.list()
    ]);
    const aggByProvider = {};
    aggregateSince.forEach((row) => { aggByProvider[row.provider] = row; });
    const configuredProviders = new Set(keyRows.map((row) => row.provider));

    const providers = KNOWN_PROVIDERS.map((provider) => {
      const latest = latestByProvider[provider] || null;
      const agg = aggByProvider[provider] || { calls: 0, failures: 0, avgLatencyMs: null };
      const successRatePercent = agg.calls > 0 ? Math.round(((agg.calls - agg.failures) / agg.calls) * 100) : null;
      const configured = configuredProviders.has(provider);
      const freshMs = latest ? Date.now() - new Date(latest.createdAt).getTime() : null;

      let status;
      if (!latest) status = configured ? 'unknown' : 'unconfigured';
      else if (!latest.ok) status = 'disconnected';
      else if (successRatePercent != null && successRatePercent < 80) status = 'degraded';
      else if (freshMs != null && freshMs > HEALTH_FRESH_WINDOW_MS) status = 'idle';
      else status = 'healthy';

      return {
        provider, status, configured, lastEventAt: latest ? latest.createdAt : null,
        lastOk: latest ? latest.ok : null, lastErrorCode: latest ? latest.errorCode : null,
        lastLatencyMs: latest ? latest.latencyMs : null,
        last24h: { calls: agg.calls, failures: agg.failures, successRatePercent, avgLatencyMs: agg.avgLatencyMs }
      };
    });

    res.json({ providers, recent });
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
    const promptPricePer1k = numOrNull(req.body.promptPricePer1k);
    const completionPricePer1k = numOrNull(req.body.completionPricePer1k);
    // provider_pricing has no enabled column (004_admin.sql) - every row here is "live" the
    // moment it's saved, so this check always applies (see isZeroPricedPair()'s own comment).
    if (isZeroPricedPair(promptPricePer1k, completionPricePer1k)) throw new ApiError(400, 'ZERO_PRICE_NOT_ALLOWED');
    const record = await repo.providerPricing.upsert({
      provider,
      promptPricePer1k,
      completionPricePer1k,
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

  // Launch-readiness audit fix (P1-4): reports (posts/comments/listings/messages) could be
  // created since day one (server/community/routes.posts.mjs) but nothing ever read them back -
  // "reporting exists but there is no moderation queue" was a real, named gap. This is the
  // review surface: list (optionally by status) and move a report through
  // open -> reviewed/dismissed, same audit-logged PATCH shape as every other admin mutation here.
  app.get('/reports', asyncHandler(async (req, res) => {
    const status = req.query.status && req.query.status !== 'all' ? req.query.status : undefined;
    const [reports, users] = await Promise.all([repo.reports.list({ status }), repo.users.list()]);
    const byId = {};
    users.forEach((u) => { byId[u.id] = u; });
    res.json(reports.map((report) => ({ ...report, reporterName: byId[report.reporterId] ? byId[report.reporterId].displayName : null })));
  }));

  app.patch('/reports/:id', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const updated = await repo.reports.updateStatus(req.params.id, body.status);
    await audit(req, 'community.report.update', 'report', req.params.id, { status: body.status });
    res.json(updated);
  }));

  // Launch-readiness audit fix (P1-1): the error-telemetry review surface - same shape as the
  // /reports pair above. Server-side implementation only this pass (routes.errors.mjs,
  // repo.clientErrors) - no dedicated admin UI panel/tab yet, same honest "API exists, UI is a
  // fast-follow" scope as the reports queue.
  app.get('/errors', asyncHandler(async (req, res) => {
    const status = req.query.status && req.query.status !== 'all' ? req.query.status : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json(await repo.clientErrors.list({ status, limit }));
  }));

  app.patch('/errors/:id', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const updated = await repo.clientErrors.updateStatus(req.params.id, body.status);
    await audit(req, 'client-error.update', 'client_error', req.params.id, { status: body.status });
    res.json(updated);
  }));

  // AI Cost Control correction: this route has always been a token-count x admin-set rate-card
  // ESTIMATE (never a reconciled provider invoice, never gateway-settled cost) - the `aiCostByProvider`
  // shape below is unchanged (no existing caller breaks), but the response now says so explicitly
  // rather than only in a comment, and names the real canonical endpoints for external actual cost
  // (GET /api/admin/commercial/ai-cost-control/reconciliation/external) and settled cost
  // (GET /api/admin/ai/usage-by-model, GET /api/admin/commercial/ai-cost-control/models).
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
      remainingBudgetByProvider,
      // Additive labeling only - every existing field above is byte-identical, so no existing
      // caller breaks. See this route's own header comment.
      legacyEstimate: true,
      source: 'internal-rate-card-estimate',
      note: 'aiCostByProvider is a token-count x admin-configured-rate ESTIMATE, not a reconciled provider invoice or gateway-settled cost.',
      canonicalEndpoints: {
        externalActualProviderCost: '/api/admin/commercial/ai-cost-control/reconciliation/external',
        settledInternalCost: '/api/admin/ai/usage-by-model',
        modelBreakdown: '/api/admin/commercial/ai-cost-control/models'
      }
    });
  }));

  // Voice Providers (ElevenLabs) - a large enough surface (credentials, per-language routing,
  // catalogs, health, usage, paid test samples) to warrant its own file; mounted here so it
  // inherits this router's own requireAdmin (applied at the /api/admin mount in app.mjs) for free,
  // exactly like every route above it.
  app.use('/voice-providers', voiceProvidersRouter(repo));

  // Commercial System Slice 1 (Plans/Wallet/Markup/Provider-Model-Pricing/per-user credit-debit) -
  // same "own file, mounted here to inherit requireAdmin for free" pattern as voice-providers above.
  app.use('/commercial', commercialRouter(repo));

  // Journey H2, Gate 2: Conversation Studio - same "own file, mounted here to inherit
  // requireAdmin for free" pattern as voice-providers/commercial above.
  app.use('/conversation-scenarios', conversationScenariosRouter(repo, uploadsDir));

  return app;
}
