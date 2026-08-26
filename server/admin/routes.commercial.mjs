import express from 'express';
import { ApiError, asyncHandler } from '../community/errors.mjs';
import { requireRecentReauth } from './auth-admin.mjs';
import { getEffectiveCommercialConfig, invalidateCommercialConfigCache, retailMultiplierFor } from '../commercial/commercial-config.mjs';
import { PLAN_NAMES, RESOURCE_TYPES } from '../commercial/commercial-defaults.mjs';
import { toMicroUsd } from '../commercial/wallet-service.mjs';
import { confirmTransaction, failTransaction } from '../commercial/payment-service.mjs';
import { ManualBillingProvider } from '../commercial/manual-billing-provider.mjs';

const MARKUP_SCOPE_TYPES = ['feature', 'provider', 'model', 'feature_model'];

function numOrNull(value) { return value === null || value === undefined || value === '' ? null : Number(value); }
function isNonNegativeIntegerOrNull(value) { return value === null || (Number.isInteger(value) && value >= 0); }
function isNonNegativeNumber(value) { return Number.isFinite(value) && value >= 0; }

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
    const row = await repo.providerModelPricing.upsert({
      provider, model, promptPricePer1k: numOrNull(body.promptPricePer1k), completionPricePer1k: numOrNull(body.completionPricePer1k),
      currency: body.currency || 'USD', enabled: body.enabled !== false
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

  return app;
}
