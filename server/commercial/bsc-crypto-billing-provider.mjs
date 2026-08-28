// Real BSC (BNB Smart Chain) crypto BillingProvider (task A). Same six-method interface every
// caller (routes.wallet.mjs/routes.subscriptions.mjs/routes.storage.mjs) already calls through -
// see server/commercial/billing-provider.mjs - so choosing this provider over ManualBillingProvider
// is a one-line factory swap (server/commercial/billing-provider-factory.mjs), never a caller
// rewrite. Every create* method still creates the SAME payment_transactions row Manual creates
// (status 'pending', a config snapshot in metadata) and additionally creates a linked
// crypto_invoices row with the exact on-chain facts a wallet/QR code needs. Nothing is ever
// entitled/credited here - that still only ever happens through
// server/commercial/payment-service.mjs's confirmTransaction(), called only after a verified
// on-chain transfer (server/commercial/bsc-chain-client.mjs's verifyBscTransfer()) or a verified
// webhook - never from this provider's own create* methods, and never from the browser.
import crypto from 'node:crypto';
import { newId } from '../db/id.mjs';
import { ApiError } from '../community/errors.mjs';
import { BillingProvider } from './billing-provider.mjs';
import { getPlanPrice, getWalletRules } from './commercial-config.mjs';
import { toMicroUsd } from './wallet-service.mjs';
import { getChainId } from './bsc-chain-client.mjs';

// Fails explicitly (task A.8) the moment any required config is missing - never a fake/simulated
// invoice. BSC_EXCHANGE_RATE_USD_PER_TOKEN defaults to 1 (a USD-pegged stablecoin, e.g. USDT) -
// the only rate this system can respond honestly without integrating a live price feed; a
// non-stablecoin asset must set this explicitly and accepts its own necessarily-approximate
// snapshot (see computeAtomicAmount's own comment).
function requireBscConfig() {
  const rpcUrl = process.env.BSC_RPC_URL;
  const depositAddress = process.env.BSC_DEPOSIT_ADDRESS;
  const tokenContract = process.env.BSC_TOKEN_CONTRACT;
  const tokenDecimalsRaw = process.env.BSC_TOKEN_DECIMALS;
  const missing = [];
  if (!rpcUrl) missing.push('BSC_RPC_URL');
  if (!depositAddress) missing.push('BSC_DEPOSIT_ADDRESS');
  if (!tokenContract) missing.push('BSC_TOKEN_CONTRACT');
  if (!tokenDecimalsRaw) missing.push('BSC_TOKEN_DECIMALS');
  if (missing.length) throw new ApiError(503, 'BSC_PROVIDER_NOT_CONFIGURED', null, { missing });
  return {
    chainId: Number(process.env.BSC_CHAIN_ID || 56),
    assetSymbol: process.env.BSC_TOKEN_SYMBOL || 'USDT',
    depositAddress,
    tokenContract,
    tokenDecimals: Number(tokenDecimalsRaw),
    confirmationsRequired: Number(process.env.BSC_CONFIRMATIONS_REQUIRED || 15),
    invoiceExpiryMinutes: Number(process.env.BSC_INVOICE_EXPIRY_MINUTES || 30),
    exchangeRateSnapshot: Number(process.env.BSC_EXCHANGE_RATE_USD_PER_TOKEN || 1)
  };
}

function computeAtomicAmount(amountMicroUsd, decimals, exchangeRateSnapshot) {
  if (exchangeRateSnapshot === 1) {
    // Exact integer math for the common stablecoin (1:1) case - never a float.
    return (BigInt(amountMicroUsd) * (10n ** BigInt(decimals)) / 1000000n).toString();
  }
  const usd = amountMicroUsd / 1000000;
  const tokenAmount = usd / exchangeRateSnapshot;
  return BigInt(Math.round(tokenAmount * Math.pow(10, decimals))).toString();
}

export class BscCryptoBillingProvider extends BillingProvider {
  constructor(repo) {
    super();
    this.repo = repo;
  }

  async _createInvoiceFor(transaction) {
    const config = requireBscConfig();
    // Cross-checked against the RPC endpoint itself, not just trusted from env - task A.6's
    // "validates chain ID" requirement applies at creation time too, not only at confirmation.
    const actualChainId = await getChainId();
    if (actualChainId !== config.chainId) throw new ApiError(503, 'BSC_CHAIN_ID_MISMATCH', null, { configured: config.chainId, actual: actualChainId });
    const atomicAmount = computeAtomicAmount(transaction.amountMicroUsd, config.tokenDecimals, config.exchangeRateSnapshot);
    const expiresAt = new Date(Date.now() + config.invoiceExpiryMinutes * 60 * 1000).toISOString();
    return this.repo.cryptoInvoices.create({
      transactionId: transaction.id, provider: 'bsc_crypto', chainId: config.chainId, assetSymbol: config.assetSymbol,
      tokenContract: config.tokenContract, tokenDecimals: config.tokenDecimals, recipientAddress: config.depositAddress,
      atomicAmount, usdAmountMicroUsd: transaction.amountMicroUsd, exchangeRateSnapshot: config.exchangeRateSnapshot, expiresAt
    });
  }

  async createWalletTopUp({ userId, amountUsd }) {
    const walletRules = await getWalletRules(this.repo);
    if (!Number.isFinite(amountUsd) || amountUsd < walletRules.minimumTopUpUsd) {
      throw new ApiError(400, 'WALLET_TOPUP_BELOW_MINIMUM', null, { minimumTopUpUsd: walletRules.minimumTopUpUsd });
    }
    const transaction = await this.repo.paymentTransactions.create({
      userId, type: 'wallet_topup', provider: 'bsc_crypto', externalTransactionId: newId('bscTx'),
      amountMicroUsd: toMicroUsd(amountUsd), currency: 'USD', metadata: { amountUsd }
    });
    const invoice = await this._createInvoiceFor(transaction);
    return { transactionId: transaction.id, status: transaction.status, invoiceId: invoice.id };
  }

  async createSubscription({ userId, planId }) {
    if (!['plus', 'personalized'].includes(planId)) throw new ApiError(400, 'VALIDATION_FAILED');
    const price = await getPlanPrice(this.repo, planId);
    const transaction = await this.repo.paymentTransactions.create({
      userId, type: 'subscription', provider: 'bsc_crypto', externalTransactionId: newId('bscTx'),
      amountMicroUsd: toMicroUsd(price.amountUsd), currency: 'USD', productId: planId,
      metadata: { planId, priceAmountUsd: price.amountUsd, billingInterval: price.billingInterval }
    });
    const invoice = await this._createInvoiceFor(transaction);
    return { transactionId: transaction.id, status: transaction.status, invoiceId: invoice.id };
  }

  async createStoragePurchase({ userId, productId }) {
    const product = await this.repo.storageProducts.get(productId);
    if (!product || !product.enabled) throw new ApiError(404, 'STORAGE_PRODUCT_NOT_FOUND');
    const transaction = await this.repo.paymentTransactions.create({
      userId, type: 'storage_purchase', provider: 'bsc_crypto', externalTransactionId: newId('bscTx'),
      amountMicroUsd: product.priceAmountMicroUsd, currency: product.currency, productId: product.id,
      metadata: { productId: product.id, capacityBytes: product.capacityBytes, priceAmountMicroUsd: product.priceAmountMicroUsd, validityDays: product.validityDays }
    });
    const invoice = await this._createInvoiceFor(transaction);
    return { transactionId: transaction.id, status: transaction.status, invoiceId: invoice.id };
  }

  // No live gateway subscription to cancel for a self-verified on-chain provider - identical
  // posture to ManualBillingProvider's own cancelSubscription() (the real state transition
  // happens directly against the repo in server/commercial/subscription-service.mjs).
  // eslint-disable-next-line no-unused-vars
  async cancelSubscription({ subscriptionId }) {
    return { ok: true };
  }

  // Refunding a crypto payment is not automatable (there is no reverse on-chain transfer this
  // system can trigger unilaterally) - recorded as a real refund transaction for audit/entitlement-
  // revocation purposes exactly like Manual's refund does, but the actual on-chain refund to the
  // payer is necessarily a manual operator action, named here rather than silently implied.
  async refund({ transactionId, amountUsd }) {
    const original = await this.repo.paymentTransactions.get(transactionId);
    if (!original) throw new ApiError(404, 'PAYMENT_TRANSACTION_NOT_FOUND');
    if (original.status !== 'confirmed') throw new ApiError(400, 'ONLY_CONFIRMED_TRANSACTIONS_CAN_BE_REFUNDED');
    if (amountUsd !== undefined && Math.round(Number(amountUsd) * 1000000) !== original.amountMicroUsd) {
      throw new ApiError(400, 'PARTIAL_REFUND_NOT_SUPPORTED');
    }
    const existingRefund = await this.repo.paymentTransactions.findRefundFor(transactionId);
    if (existingRefund) throw new ApiError(409, 'ALREADY_REFUNDED', null, { refundTransactionId: existingRefund.id });
    const refundTransaction = await this.repo.paymentTransactions.create({
      userId: original.userId, type: 'refund', provider: 'bsc_crypto', externalTransactionId: newId('bscTx'),
      amountMicroUsd: original.amountMicroUsd, currency: original.currency, productId: original.productId,
      metadata: { originalTransactionId: transactionId, originalType: original.type, requiresManualOnChainRefund: true }
    });
    return { transactionId: refundTransaction.id, status: refundTransaction.status };
  }

  // Real HMAC-SHA256 signature verification over the RAW request body (task A.6) - never accepts
  // an unverified payload. Explicitly unsupported (task A.8's "retain a safe manual/dev path")
  // when no real webhook secret is configured, rather than silently treating every request as
  // trusted.
  async verifyWebhook(req) {
    const secret = process.env.BSC_WEBHOOK_SECRET;
    if (!secret) throw new ApiError(501, 'WEBHOOK_NOT_SUPPORTED');
    const signature = req.header('x-webhook-signature') || '';
    const rawBody = req.rawBody;
    if (!rawBody) throw new ApiError(400, 'MISSING_RAW_BODY');
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const valid = signatureBuf.length === expectedBuf.length && crypto.timingSafeEqual(signatureBuf, expectedBuf);
    if (!valid) throw new ApiError(401, 'INVALID_WEBHOOK_SIGNATURE');
    return { ok: true };
  }
}
