import express from 'express';
import { ApiError, asyncHandler } from '../community/errors.mjs';
import { requireRecentReauth } from './auth-admin.mjs';
import { isStepUpFresh } from '../community/security/session-service.mjs';
import { randomToken } from '../community/security/crypto-util.mjs';
import { getEffectiveCommercialConfig, getBscPublicConfig, invalidateCommercialConfigCache, retailMultiplierFor } from '../commercial/commercial-config.mjs';
import { PLAN_NAMES, RESOURCE_TYPES } from '../commercial/commercial-defaults.mjs';
import { toMicroUsd } from '../commercial/wallet-service.mjs';
import { confirmTransaction, failTransaction } from '../commercial/payment-service.mjs';
import { ManualBillingProvider } from '../commercial/manual-billing-provider.mjs';
import { resolveBscRuntimeConfig, isBscConfigComplete } from '../commercial/bsc-config.mjs';
import { getChainId, isValidEvmAddress } from '../commercial/bsc-chain-client.mjs';
import { resolvePricingRate } from '../commercial/wallet-service.mjs';
import { router as aiCostControlRouter } from './routes.ai-cost-control.mjs';

const STEP_UP_MAX_AGE_MS = 15 * 60 * 1000; // mirrors auth-admin.mjs's own DEFAULT_STEP_UP_MAX_AGE_MS

const MARKUP_SCOPE_TYPES = ['feature', 'provider', 'model', 'feature_model'];

function numOrNull(value) { return value === null || value === undefined || value === '' ? null : Number(value); }
function isNonNegativeIntegerOrNull(value) { return value === null || (Number.isInteger(value) && value >= 0); }
function isNonNegativeNumber(value) { return Number.isFinite(value) && value >= 0; }
// AI billing operational fix - resolvePricingRate() (wallet-service.mjs) treats an explicit `0` as
// "configured" (never a guessed/zero rate the way `null` is), which is exactly right for a
// genuinely free/loss-leader model an admin means to configure - but a *paid* platform model
// saved with both prices at 0 would silently make every provider-funded call free forever, with
// no error anywhere. Reject that specific shape at write time - null+null (not yet configured)
// stays allowed and correctly fails closed later via PROVIDER_PRICING_NOT_CONFIGURED.
function isZeroPricedPair(promptPricePer1k, completionPricePer1k) {
  return promptPricePer1k === 0 && completionPricePer1k === 0;
}
// Same reasoning as isZeroPricedPair() above, for a flat-priced (046_flat_priced_ai_features.sql)
// row instead of a token-priced one - a flat rate saved as exactly 0 while enabled would silently
// make every provider-funded call in that pricing mode free forever.
function isZeroFlatPrice(flatPricePerCallMicroUsd) {
  return flatPricePerCallMicroUsd === 0;
}

// Commercial System Slice 1 - Admin controls for plans, wallet rules, markup overrides, provider
// model pricing, and per-user credit/debit (spec sections 14/15/17/18/19/50). Mounted at
// /api/admin/commercial from server/admin/routes.mjs's own bottom mount (see that file's
// voice-providers precedent) - inherits requireAuth+csrfProtection+requireAdmin for free from the
// /api/admin mount point in server/community/app.mjs.
export function router(repo) {
  const app = express.Router();
  const billingProvider = new ManualBillingProvider(repo);

  async function audit(req, action, targetType, targetId, details) {
    await repo.auditLog.create({ adminUserId: req.currentUser.id, action, targetType, targetId, details: details || {} });
  }

  // ---- Plans (spec section 14) --------------------------------------------------------------
  app.get('/plans', asyncHandler(async (req, res) => {
    const config = await getEffectiveCommercialConfig(repo);
    res.json({ plans: config.plans });
  }));

  app.patch('/plans/:plan', asyncHandler(async (req, res) => {
    const plan = req.params.plan;
    if (!PLAN_NAMES.includes(plan)) throw new ApiError(400, 'VALIDATION_FAILED');
    const body = req.body || {};
    const configBefore = await getEffectiveCommercialConfig(repo);
    const before = configBefore.plans[plan];

    if (body.limits && typeof body.limits === 'object') {
      const limits = {};
      for (const key of RESOURCE_TYPES) {
        if (!(key in body.limits)) continue;
        const raw = body.limits[key];
        const value = raw === null ? null : Math.round(Number(raw));
        if (!isNonNegativeIntegerOrNull(value)) throw new ApiError(400, 'VALIDATION_FAILED');
        limits[key] = value;
      }
      await repo.commercialConfig.publish('plan:' + plan + ':limits', limits, { updatedBy: req.currentUser.id, changeSummary: 'Updated ' + plan + ' plan limits' });
    }
    if ('storageBytes' in body) {
      const bytes = Math.round(Number(body.storageBytes));
      if (!Number.isFinite(bytes) || bytes < 0) throw new ApiError(400, 'VALIDATION_FAILED');
      await repo.commercialConfig.publish('plan:' + plan + ':storageBytes', { bytes }, { updatedBy: req.currentUser.id, changeSummary: 'Updated ' + plan + ' storage quota' });
    }
    if (body.features && typeof body.features === 'object') {
      const features = {};
      ['wallet', 'ai', 'voice', 'aiPanelBuilder'].forEach((key) => { if (key in body.features) features[key] = Boolean(body.features[key]); });
      await repo.commercialConfig.publish('plan:' + plan + ':features', features, { updatedBy: req.currentUser.id, changeSummary: 'Updated ' + plan + ' feature flags' });
    }
    // Slice 2 - Free has no price to change (it's fixed at $0, spec section 1), so this block is
    // silently a no-op for plan==='free' even if a caller sends a `price` field for it.
    if (body.price && typeof body.price === 'object' && plan !== 'free') {
      const amountUsd = Number(body.price.amountUsd);
      if (!isNonNegativeNumber(amountUsd)) throw new ApiError(400, 'VALIDATION_FAILED');
      const billingInterval = body.price.billingInterval === 'year' ? 'year' : 'month';
      await repo.commercialConfig.publish('plan:' + plan + ':price', { amountUsd, billingInterval }, { updatedBy: req.currentUser.id, changeSummary: 'Updated ' + plan + ' price' });
    }

    invalidateCommercialConfigCache();
    const configAfter = await getEffectiveCommercialConfig(repo);
    await audit(req, 'commercial.plan.update', 'plan', plan, { before, after: configAfter.plans[plan] });
    res.json({ plan: configAfter.plans[plan] });
  }));

  // ---- Wallet rules + markup (spec section 15/17) --------------------------------------------
  app.get('/wallet-rules', asyncHandler(async (req, res) => {
    const config = await getEffectiveCommercialConfig(repo);
    res.json({ ...config.wallet, retailMultiplier: retailMultiplierFor(config.wallet.markupPercent) });
  }));

  app.patch('/wallet-rules', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const before = (await getEffectiveCommercialConfig(repo)).wallet;
    if ('markupPercent' in body) {
      const percent = Number(body.markupPercent);
      if (!isNonNegativeNumber(percent)) throw new ApiError(400, 'VALIDATION_FAILED');
      await repo.commercialConfig.publish('wallet:markupPercent', { percent }, { updatedBy: req.currentUser.id, changeSummary: 'Updated global AI markup' });
    }
    if ('minimumTopUpUsd' in body) {
      const amount = Number(body.minimumTopUpUsd);
      if (!isNonNegativeNumber(amount)) throw new ApiError(400, 'VALIDATION_FAILED');
      await repo.commercialConfig.publish('wallet:minimumTopUpUsd', { amount }, { updatedBy: req.currentUser.id, changeSummary: 'Updated minimum top-up' });
    }
    if ('signupPromoRetailUsd' in body) {
      const amount = Number(body.signupPromoRetailUsd);
      if (!isNonNegativeNumber(amount)) throw new ApiError(400, 'VALIDATION_FAILED');
      await repo.commercialConfig.publish('wallet:signupPromoRetailUsd', { amount }, { updatedBy: req.currentUser.id, changeSummary: 'Updated signup promo credit' });
    }
    invalidateCommercialConfigCache();
    const after = (await getEffectiveCommercialConfig(repo)).wallet;
    await audit(req, 'commercial.walletRules.update', 'walletRules', 'global', { before, after });
    res.json({ ...after, retailMultiplier: retailMultiplierFor(after.markupPercent) });
  }));

  app.get('/markup-rules', asyncHandler(async (req, res) => {
    res.json({ rules: await repo.markupRules.list() });
  }));

  app.post('/markup-rules', asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!MARKUP_SCOPE_TYPES.includes(body.scopeType)) throw new ApiError(400, 'VALIDATION_FAILED');
    const scopeKey = String(body.scopeKey || '').trim();
    if (!scopeKey) throw new ApiError(400, 'VALIDATION_FAILED');
    const markupPercent = Number(body.markupPercent);
    if (!isNonNegativeNumber(markupPercent)) throw new ApiError(400, 'VALIDATION_FAILED');
    const rule = await repo.markupRules.upsert({ scopeType: body.scopeType, scopeKey, markupPercent, enabled: body.enabled !== false });
    await audit(req, 'commercial.markupRule.upsert', 'markupRule', rule.id, rule);
    res.status(201).json(rule);
  }));

  app.delete('/markup-rules/:id', asyncHandler(async (req, res) => {
    await repo.markupRules.remove(req.params.id);
    await audit(req, 'commercial.markupRule.remove', 'markupRule', req.params.id, {});
    res.status(204).end();
  }));

  // ---- Provider model pricing (spec section 19) ----------------------------------------------
  app.get('/provider-pricing', asyncHandler(async (req, res) => {
    res.json({ rows: await repo.providerModelPricing.list() });
  }));

  app.post('/provider-pricing', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const provider = String(body.provider || '').trim();
    const model = String(body.model || '').trim();
    if (!provider || !model) throw new ApiError(400, 'VALIDATION_FAILED');
    const promptPricePer1k = numOrNull(body.promptPricePer1k);
    const completionPricePer1k = numOrNull(body.completionPricePer1k);
    // AI Cost Control - optional cached-input/cache-write-input pricing dimensions. Never
    // zero-price-guarded like prompt/completion below: a genuinely free cached-read tier is a
    // real, legitimate provider pricing shape, and an unset (null) value already falls back
    // safely to the base prompt price rather than $0 (see wallet-service.mjs's costMicroUsdFor()).
    const cachedInputPricePer1k = numOrNull(body.cachedInputPricePer1k);
    const cacheWriteInputPricePer1k = numOrNull(body.cacheWriteInputPricePer1k);
    // Flat, non-token per-call rate (046_flat_priced_ai_features.sql) - a real provider pricing
    // shape (e.g. gpt-image-1, billed per image/size rather than by token), independent of the
    // prompt/completion fields above. See wallet-service.mjs's resolvePricingRate() for how a row
    // that sets this is treated as flat-priced. Admin UI sends plain USD (same convention as
    // storage-products' priceAmountUsd) - converted to the stored micro-USD unit here, not in the
    // client.
    const flatPricePerCallUsdInput = numOrNull(body.flatPricePerCallUsd);
    const flatPricePerCallMicroUsd = flatPricePerCallUsdInput === null ? null : toMicroUsd(flatPricePerCallUsdInput);
    const enabled = body.enabled !== false;
    // A zero-priced row that resolves as "configured" must never silently make provider-funded
    // calls free forever - see isZeroPricedPair()'s own comment. Only checked when the row would
    // actually be enabled; a disabled row can hold whatever draft values without risk.
    if (enabled && isZeroPricedPair(promptPricePer1k, completionPricePer1k)) throw new ApiError(400, 'ZERO_PRICE_NOT_ALLOWED');
    if (enabled && isZeroFlatPrice(flatPricePerCallMicroUsd)) throw new ApiError(400, 'ZERO_PRICE_NOT_ALLOWED');
    const row = await repo.providerModelPricing.upsert({
      provider, model, promptPricePer1k, completionPricePer1k, cachedInputPricePer1k, cacheWriteInputPricePer1k, flatPricePerCallMicroUsd,
      currency: body.currency || 'USD', enabled
    });
    await audit(req, 'commercial.providerModelPricing.upsert', 'providerModelPricing', provider + ':' + model, row);
    res.status(201).json(row);
  }));

  app.delete('/provider-pricing/:provider/:model', asyncHandler(async (req, res) => {
    await repo.providerModelPricing.remove(req.params.provider, req.params.model);
    await audit(req, 'commercial.providerModelPricing.remove', 'providerModelPricing', req.params.provider + ':' + req.params.model, {});
    res.status(204).end();
  }));

  // ---- Configuration History + global ledger view (spec section 43/48) ----------------------
  app.get('/versions', asyncHandler(async (req, res) => {
    res.json({ versions: await repo.commercialConfig.listVersions({ limit: 200 }) });
  }));

  app.get('/ledger', asyncHandler(async (req, res) => {
    res.json({ entries: await repo.wallet.recentLedger({ limit: 200 }) });
  }));

  // ---- Per-user Wallet + plan admin actions (spec section 50) --------------------------------
  // Real money movement - requires a recent reauth like every other sensitive admin action
  // (role/suspension/KYC/provider-key changes already do, see server/admin/routes.mjs).
  app.post('/users/:id/credit', requireRecentReauth(), asyncHandler(async (req, res) => {
    const body = req.body || {};
    const user = await repo.users.get(req.params.id);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
    const amountUsd = Number(body.amountUsd);
    if (!isNonNegativeNumber(amountUsd) || amountUsd <= 0) throw new ApiError(400, 'VALIDATION_FAILED');
    const balanceType = body.balanceType === 'promo' ? 'promo' : 'paid';
    const amountMicroUsd = toMicroUsd(amountUsd);
    const result = await repo.wallet.grant(req.params.id, {
      type: 'ADMIN_CREDIT',
      cashDeltaMicroUsd: balanceType === 'paid' ? amountMicroUsd : 0,
      promoDeltaMicroUsd: balanceType === 'promo' ? amountMicroUsd : 0,
      adminUserId: req.currentUser.id, sourceAction: body.reason || 'admin-credit'
    });
    await audit(req, 'commercial.wallet.credit', 'user', req.params.id, { amountUsd, balanceType, reason: body.reason || null });
    res.status(201).json(result.ledgerEntry);
  }));

  app.post('/users/:id/debit', requireRecentReauth(), asyncHandler(async (req, res) => {
    const body = req.body || {};
    const user = await repo.users.get(req.params.id);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
    const amountUsd = Number(body.amountUsd);
    if (!isNonNegativeNumber(amountUsd) || amountUsd <= 0) throw new ApiError(400, 'VALIDATION_FAILED');
    const balanceType = body.balanceType === 'promo' ? 'promo' : 'paid';
    const amountMicroUsd = toMicroUsd(amountUsd);
    const result = await repo.wallet.grant(req.params.id, {
      type: 'ADMIN_DEBIT',
      cashDeltaMicroUsd: balanceType === 'paid' ? -amountMicroUsd : 0,
      promoDeltaMicroUsd: balanceType === 'promo' ? -amountMicroUsd : 0,
      adminUserId: req.currentUser.id, sourceAction: body.reason || 'admin-debit'
    });
    await audit(req, 'commercial.wallet.debit', 'user', req.params.id, { amountUsd, balanceType, reason: body.reason || null });
    res.status(201).json(result.ledgerEntry);
  }));

  app.get('/users/:id/wallet', asyncHandler(async (req, res) => {
    const account = await repo.wallet.getAccount(req.params.id);
    const ledger = await repo.wallet.ledgerForUser(req.params.id, { limit: 100 });
    res.json({ account, ledger });
  }));

  // "Assign test plan" (spec section 50) - real subscriptions don't exist yet this slice, so
  // this plain field write IS the mechanism, same as every other admin field edit in this file.
  app.patch('/users/:id/plan', asyncHandler(async (req, res) => {
    const plan = req.body && req.body.plan;
    if (!PLAN_NAMES.includes(plan)) throw new ApiError(400, 'VALIDATION_FAILED');
    const before = await repo.users.get(req.params.id);
    if (!before) throw new ApiError(404, 'USER_NOT_FOUND');
    const updated = await repo.users.update(req.params.id, { plan });
    await audit(req, 'commercial.user.planAssign', 'user', req.params.id, { before: before.plan, after: plan });
    res.json({ user: updated });
  }));

  // ---- Storage Products (spec section 6/19) ---------------------------------------------------
  app.get('/storage-products', asyncHandler(async (req, res) => {
    res.json({ products: await repo.storageProducts.list() });
  }));

  app.post('/storage-products', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const capacityBytes = Math.round(Number(body.capacityBytes));
    const priceAmountUsd = Number(body.priceAmountUsd);
    const validityDays = Math.round(Number(body.validityDays));
    if (!name || !Number.isFinite(capacityBytes) || capacityBytes <= 0) throw new ApiError(400, 'VALIDATION_FAILED');
    if (!isNonNegativeNumber(priceAmountUsd)) throw new ApiError(400, 'VALIDATION_FAILED');
    if (!Number.isFinite(validityDays) || validityDays <= 0) throw new ApiError(400, 'VALIDATION_FAILED');
    const product = await repo.storageProducts.upsert({
      id: body.id || undefined, name, capacityBytes, priceAmountMicroUsd: toMicroUsd(priceAmountUsd), currency: body.currency || 'USD',
      validityDays, enabled: body.enabled !== false, displayOrder: Number(body.displayOrder) || 0,
      stackingAllowed: body.stackingAllowed !== false, purchaseLimit: body.purchaseLimit ? Math.round(Number(body.purchaseLimit)) : null
    });
    await audit(req, 'commercial.storageProduct.upsert', 'storageProduct', product.id, product);
    res.status(201).json(product);
  }));

  // Dedicated small toggle, same shape as marketplace listings' PATCH .../:id (fetch -> validate
  // -> partial patch -> repo.X.upsert() -> audit) - used for enable/disable and reorder without
  // requiring the full create form's every field.
  app.patch('/storage-products/:id', asyncHandler(async (req, res) => {
    const existing = await repo.storageProducts.get(req.params.id);
    if (!existing) throw new ApiError(404, 'STORAGE_PRODUCT_NOT_FOUND');
    const body = req.body || {};
    const patch = { ...existing };
    if ('enabled' in body) patch.enabled = Boolean(body.enabled);
    if ('displayOrder' in body) patch.displayOrder = Number(body.displayOrder) || 0;
    if ('priceAmountUsd' in body) patch.priceAmountMicroUsd = toMicroUsd(Number(body.priceAmountUsd));
    if ('capacityBytes' in body) patch.capacityBytes = Math.round(Number(body.capacityBytes));
    if ('validityDays' in body) patch.validityDays = Math.round(Number(body.validityDays));
    if ('name' in body) patch.name = String(body.name).trim();
    const updated = await repo.storageProducts.upsert({ id: existing.id, ...patch });
    await audit(req, 'commercial.storageProduct.update', 'storageProduct', existing.id, { before: existing, after: updated });
    res.json(updated);
  }));

  // ---- Subscriptions (spec section 18) --------------------------------------------------------
  app.get('/subscriptions', asyncHandler(async (req, res) => {
    res.json({ stats: await repo.subscriptions.adminStats() });
  }));

  // ---- Transactions (spec section 20) ---------------------------------------------------------
  app.get('/transactions', asyncHandler(async (req, res) => {
    res.json({ transactions: await repo.paymentTransactions.listAll({ status: req.query.status, limit: 200 }) });
  }));

  // Money-adjacent - same step-up reauth requirement as wallet credit/debit above.
  app.post('/transactions/:id/confirm', requireRecentReauth(), asyncHandler(async (req, res) => {
    const result = await confirmTransaction(repo, req.params.id, { adminUserId: req.currentUser.id });
    await audit(req, 'commercial.transaction.confirm', 'paymentTransaction', req.params.id, { alreadyProcessed: result.alreadyProcessed });
    res.json(result);
  }));

  app.post('/transactions/:id/fail', requireRecentReauth(), asyncHandler(async (req, res) => {
    const result = await failTransaction(repo, req.params.id);
    await audit(req, 'commercial.transaction.fail', 'paymentTransaction', req.params.id, { alreadyProcessed: result.alreadyProcessed });
    res.json(result);
  }));

  // Validation Gate (spec section 19/20/21/22) - creates a pending refund transaction (always
  // full amount - see ManualBillingProvider.refund()'s own PARTIAL_REFUND_NOT_SUPPORTED guard),
  // then immediately confirms it so the reversal (wallet debit / subscription or storage
  // entitlement revocation) actually takes effect through the same idempotent confirm path every
  // other transaction type uses - a refund is never "half-applied" as pending-only in this flow.
  app.post('/transactions/:id/refund', requireRecentReauth(), asyncHandler(async (req, res) => {
    const body = req.body || {};
    const refundRequest = await billingProvider.refund({ transactionId: req.params.id, amountUsd: body.amountUsd });
    const confirmed = await confirmTransaction(repo, refundRequest.transactionId, { adminUserId: req.currentUser.id });
    await audit(req, 'commercial.transaction.refund', 'paymentTransaction', req.params.id, { refundTransactionId: refundRequest.transactionId });
    res.status(201).json(confirmed);
  }));

  // ---- Crypto payments (BSC) - admin config (admin-config task A/B/C) ------------------------
  // Public, non-secret settings are versioned through the same repo.commercialConfig.publish()
  // every other commercial setting uses (see PATCH /wallet-rules above); the RPC URL and webhook
  // secret NEVER go through that path - they live encrypted-at-rest in the dedicated
  // repo.bscPaymentSecrets store (server/db/migrations/039_bsc_payment_secrets.sql) and are never
  // returned by any route below. No response, audit `details`, or error in this whole section
  // ever includes a raw RPC URL or webhook secret value - only booleans/hints/status.
  function isPlausibleRpcUrl(value) { return typeof value === 'string' && /^https?:\/\/.+/i.test(value.trim()); }

  async function buildCryptoPaymentsStatusDto() {
    const [publicConfig, secretsStatus] = await Promise.all([getBscPublicConfig(repo), repo.bscPaymentSecrets.get()]);
    const configComplete = isBscConfigComplete({ ...publicConfig, rpcConfigured: secretsStatus.rpcConfigured });
    return {
      ...publicConfig, mode: publicConfig.enabled ? 'bsc_crypto' : 'manual',
      rpcConfigured: secretsStatus.rpcConfigured, webhookConfigured: secretsStatus.webhookConfigured,
      webhookSecretHint: secretsStatus.webhookSecretHint, lastTestedAt: secretsStatus.lastTestedAt,
      lastTestOk: secretsStatus.lastTestOk, lastDetectedChainId: secretsStatus.lastDetectedChainId,
      configComplete
    };
  }

  // Live RPC probe - never leaks the raw URL or underlying error, only a safe reason code.
  async function testRpcConnection(rpcUrl, configuredChainId) {
    if (!rpcUrl) return { ok: false, reason: 'RPC_URL_NOT_CONFIGURED' };
    try {
      const detectedChainId = await getChainId(rpcUrl);
      return { ok: true, detectedChainId, configuredChainId, matches: detectedChainId === configuredChainId };
    } catch {
      return { ok: false, reason: 'UNREACHABLE' };
    }
  }

  app.get('/crypto-payments/status', asyncHandler(async (req, res) => {
    res.json(await buildCryptoPaymentsStatusDto());
  }));

  // Only "changing the recipient wallet" is reauth-gated among the public fields (task A.3/A.4) -
  // chain id/token symbol/contract/decimals/rate/confirmations/expiry save without it, exactly
  // like every other /wallet-rules-style setting in this file. Checked inline (not as route
  // middleware) so ONE save action can cover the whole form while only actually requiring a fresh
  // reauth when depositAddress is part of what changed.
  app.patch('/crypto-payments/public-settings', asyncHandler(async (req, res) => {
    const body = req.body || {};
    if ('depositAddress' in body && !isStepUpFresh(req.sessionRecord, STEP_UP_MAX_AGE_MS)) {
      throw new ApiError(401, 'STEP_UP_REQUIRED', null, { maxAgeMs: STEP_UP_MAX_AGE_MS });
    }
    const before = await getBscPublicConfig(repo);
    const updatedBy = req.currentUser.id;
    if ('chainId' in body) {
      const chainId = Number(body.chainId);
      if (!Number.isFinite(chainId) || chainId <= 0) throw new ApiError(400, 'VALIDATION_FAILED');
      await repo.commercialConfig.publish('bsc:chainId', { chainId }, { updatedBy, changeSummary: 'Updated BSC chain id' });
    }
    if ('depositAddress' in body) {
      const address = String(body.depositAddress || '').trim();
      if (!isValidEvmAddress(address)) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'depositAddress' });
      await repo.commercialConfig.publish('bsc:depositAddress', { address }, { updatedBy, changeSummary: 'Updated BSC deposit address' });
    }
    if ('tokenSymbol' in body) {
      const symbol = String(body.tokenSymbol || '').trim();
      if (!symbol) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'tokenSymbol' });
      await repo.commercialConfig.publish('bsc:tokenSymbol', { symbol }, { updatedBy, changeSummary: 'Updated BSC token symbol' });
    }
    if ('tokenContract' in body) {
      const address = String(body.tokenContract || '').trim();
      if (!isValidEvmAddress(address)) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'tokenContract' });
      await repo.commercialConfig.publish('bsc:tokenContract', { address }, { updatedBy, changeSummary: 'Updated BSC token contract' });
    }
    if ('tokenDecimals' in body) {
      const decimals = Number(body.tokenDecimals);
      if (!Number.isInteger(decimals) || decimals < 0) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'tokenDecimals' });
      await repo.commercialConfig.publish('bsc:tokenDecimals', { decimals }, { updatedBy, changeSummary: 'Updated BSC token decimals' });
    }
    if ('exchangeRateUsdPerToken' in body) {
      const rate = Number(body.exchangeRateUsdPerToken);
      if (!Number.isFinite(rate) || rate <= 0) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'exchangeRateUsdPerToken' });
      await repo.commercialConfig.publish('bsc:exchangeRateUsdPerToken', { rate }, { updatedBy, changeSummary: 'Updated BSC exchange rate snapshot' });
    }
    if ('confirmationsRequired' in body) {
      const count = Number(body.confirmationsRequired);
      if (!Number.isInteger(count) || count < 1) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'confirmationsRequired' });
      await repo.commercialConfig.publish('bsc:confirmationsRequired', { count }, { updatedBy, changeSummary: 'Updated BSC confirmations required' });
    }
    if ('invoiceExpiryMinutes' in body) {
      const minutes = Number(body.invoiceExpiryMinutes);
      if (!Number.isInteger(minutes) || minutes < 1) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'invoiceExpiryMinutes' });
      await repo.commercialConfig.publish('bsc:invoiceExpiryMinutes', { minutes }, { updatedBy, changeSummary: 'Updated BSC invoice expiry' });
    }
    invalidateCommercialConfigCache();
    const after = await getBscPublicConfig(repo);
    await audit(req, 'commercial.cryptoPayments.publicSettings.update', 'cryptoPaymentsConfig', 'global', { before, after });
    res.json(await buildCryptoPaymentsStatusDto());
  }));

  app.post('/crypto-payments/rpc-secret', requireRecentReauth(), asyncHandler(async (req, res) => {
    const rpcUrl = String((req.body || {}).rpcUrl || '').trim();
    if (!isPlausibleRpcUrl(rpcUrl)) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'rpcUrl' });
    await repo.bscPaymentSecrets.setRpcUrl(rpcUrl, { updatedBy: req.currentUser.id });
    await audit(req, 'commercial.cryptoPayments.rpcSecret.set', 'cryptoPaymentsConfig', 'global', {});
    res.json({ rpcConfigured: true });
  }));

  app.delete('/crypto-payments/rpc-secret', requireRecentReauth(), asyncHandler(async (req, res) => {
    await repo.bscPaymentSecrets.clearRpcUrl({ updatedBy: req.currentUser.id });
    const wasEnabled = (await getBscPublicConfig(repo)).enabled;
    let autoDisabled = false;
    if (wasEnabled) {
      // Never leave "enabled" silently meaning "misconfigured" - clearing the only RPC credential
      // a live BSC provider needs must disable it too, not just remove the ability to test it.
      await repo.commercialConfig.publish('bsc:enabled', { enabled: false }, { updatedBy: req.currentUser.id, changeSummary: 'Auto-disabled: RPC secret cleared' });
      invalidateCommercialConfigCache();
      autoDisabled = true;
    }
    await audit(req, 'commercial.cryptoPayments.rpcSecret.clear', 'cryptoPaymentsConfig', 'global', { autoDisabled });
    res.json({ rpcConfigured: false, autoDisabled });
  }));

  // Generates the secret server-side (never accepts an admin-supplied value) and returns it in
  // plaintext EXACTLY ONCE in this response - the only place in this whole feature a secret value
  // is ever sent to a client. Never logged, never re-returned by any GET afterward.
  app.post('/crypto-payments/webhook-secret', requireRecentReauth(), asyncHandler(async (req, res) => {
    const webhookSecret = randomToken(32);
    const status = await repo.bscPaymentSecrets.setWebhookSecret(webhookSecret, { updatedBy: req.currentUser.id });
    await audit(req, 'commercial.cryptoPayments.webhookSecret.rotate', 'cryptoPaymentsConfig', 'global', {});
    res.json({ webhookSecret, hint: status.webhookSecretHint });
  }));

  app.delete('/crypto-payments/webhook-secret', requireRecentReauth(), asyncHandler(async (req, res) => {
    await repo.bscPaymentSecrets.clearWebhookSecret({ updatedBy: req.currentUser.id });
    await audit(req, 'commercial.cryptoPayments.webhookSecret.clear', 'cryptoPaymentsConfig', 'global', {});
    res.json({ webhookConfigured: false });
  }));

  // Read-only diagnostic - not reauth-gated. Tests an unsaved candidate URL when the admin
  // supplies one (validating before committing), else the currently configured/saved one.
  app.post('/crypto-payments/test-connection', asyncHandler(async (req, res) => {
    const candidateRpcUrl = (req.body || {}).rpcUrl ? String(req.body.rpcUrl).trim() : null;
    const config = await resolveBscRuntimeConfig(repo);
    const rpcUrl = candidateRpcUrl || config.rpcUrl;
    const result = await testRpcConnection(rpcUrl, config.chainId);
    if (!candidateRpcUrl) await repo.bscPaymentSecrets.recordTestResult({ ok: result.ok, chainId: result.detectedChainId });
    res.json(result);
  }));

  // Enabling requires a complete config AND a live RPC check confirming the reachable chain
  // matches what's configured (task A.4) - never just trusting the last recorded test result,
  // since config could have changed since. Disabling is always allowed. Because the mandatory
  // security fix (exact-amount match, required tx hash - see crypto-invoice-service.mjs) already
  // landed before this route exists at all, BSC can never be enabled into an unsafe verification
  // path.
  app.patch('/crypto-payments/status', requireRecentReauth(), asyncHandler(async (req, res) => {
    const enabled = Boolean((req.body || {}).enabled);
    const before = (await getBscPublicConfig(repo)).enabled;
    if (enabled) {
      const config = await resolveBscRuntimeConfig(repo);
      if (!isBscConfigComplete(config)) {
        const missing = [];
        if (!config.depositAddress) missing.push('depositAddress');
        if (!config.tokenContract) missing.push('tokenContract');
        if (!config.rpcConfigured) missing.push('rpcUrl');
        throw new ApiError(400, 'BSC_CONFIG_INCOMPLETE', null, { missing });
      }
      const rpcResult = await testRpcConnection(config.rpcUrl, config.chainId);
      await repo.bscPaymentSecrets.recordTestResult({ ok: rpcResult.ok, chainId: rpcResult.detectedChainId });
      if (!rpcResult.ok || !rpcResult.matches) throw new ApiError(400, 'BSC_RPC_VALIDATION_FAILED', null, rpcResult);
    }
    await repo.commercialConfig.publish('bsc:enabled', { enabled }, { updatedBy: req.currentUser.id, changeSummary: enabled ? 'Enabled BSC crypto payments' : 'Disabled BSC crypto payments' });
    invalidateCommercialConfigCache();
    await audit(req, 'commercial.cryptoPayments.status.update', 'cryptoPaymentsConfig', 'global', { before: { enabled: before }, after: { enabled } });
    res.json(await buildCryptoPaymentsStatusDto());
  }));

  // ---- AI billing readiness (production diagnosis: real OpenAI usage recorded, cost stuck at
  // $0.00000 - traced to missing provider_model_pricing, not a settlement/reporting bug) --------
  // Built entirely from already-existing, already-tested functions - repo.usageEvents
  // .aggregateByModel() (gateway-origin only, same aggregation the admin AI tab and per-user
  // breakdown already read) and wallet-service.mjs's own resolvePricingRate() (the exact function
  // that decides whether a real call will price at $0). Never a second pricing/usage concept -
  // this route only ever asks the existing resolver "would this price right now?" per model that
  // has actually seen gateway traffic, so it surfaces precisely the openai/gpt-5.6 symptom: real
  // calls, priceConfigured:false, providerCostMicroUsd:0.
  app.get('/billing-readiness', asyncHandler(async (req, res) => {
    const activeModels = await repo.usageEvents.aggregateByModel({ origin: 'gateway' });
    const pricing = await Promise.all(activeModels.map(async (row) => ({
      provider: row.provider, model: row.model, calls: row.calls,
      priceConfigured: Boolean(await resolvePricingRate(repo, { provider: row.provider, model: row.model })),
      providerCostMicroUsd: row.providerCostMicroUsd, retailChargeMicroUsd: row.retailChargeMicroUsd
    })));
    res.json({
      // AI_WALLET_ENFORCED is read here from the community-api process's own env - see
      // docker-compose.production.yml's community-api service block, which now also receives this
      // SAME flag (never a second enforcement flag) purely so this status display can show it;
      // pattern-ai-server.mjs's own aiWalletEnforced() remains the only place that actually
      // decides enforcement for a real request.
      walletEnforced: String(process.env.AI_WALLET_ENFORCED || '').trim().toLowerCase() === 'true',
      internalApiSecretConfigured: Boolean(process.env.INTERNAL_API_SECRET),
      pricing
    });
  }));

  // ---- AI Cost Control (own file - real external-provider reconciliation, encrypted credential
  // store, internal exact/external variance reconciliation) - own file for the same "large enough
  // surface, own file, mounted here to inherit requireAdmin for free" reason crypto-payments and
  // voice-providers already use. -------------------------------------------------------------
  app.use('/ai-cost-control', aiCostControlRouter(repo));

  return app;
}
