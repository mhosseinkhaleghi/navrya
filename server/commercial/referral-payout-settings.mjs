// The public (non-secret), versioned settings of the referral BSC payout workflow: defaults, validation and the
// customer-safe projection. Pure - no repo, no HTTP. Stored as ONE commercial_config_overrides row
// (`referralPayout:settings`) so every admin edit is a single atomic, versioned publish (repo.commercialConfig.publish),
// merged into the effective commercial config by commercial-config.mjs (getReferralPayoutConfig).
//
// SEPARATE from the inbound `bsc` section on purpose: inbound payment verification (deposit address) and outbound payout
// (treasury sender) are different trust domains and must be independently configurable, enable-able and auditable. The
// only thing they share is the RPC endpoint secret (bsc_payment_secrets), which is never part of these settings.
import { ApiError } from '../community/errors.mjs';
import { MICRO } from './referral-rules.mjs';
import { normalizeEvmAddress, isZeroAddress, addressesEqual } from './evm-address.mjs';

// BSC Mainnet, pinned. There is no user- or admin-selectable network: the value is validated to equal this constant.
export const PAYOUT_CHAIN_ID = 56;
export const PAYOUT_CHAIN_NAME = 'BNB Smart Chain (BSC)';

export const REFERRAL_PAYOUT_DEFAULTS = Object.freeze({
  enabled: false,
  chainId: PAYOUT_CHAIN_ID,
  tokenSymbol: 'USDT',
  tokenContract: '',
  tokenDecimals: 18,
  treasurySender: '',
  minConfirmations: 15,
  minPayoutMicroUsd: 10 * MICRO,
  explorerTxUrlTemplate: 'https://bscscan.com/tx/{txHash}',
  requiredKycStatus: 'verified', // 'verified' | 'none'
  reauthMaxAgeMinutes: 10,
  termsVersion: 'referral-payout-v1',
  makerCheckerRequired: true
});

const KYC_REQUIREMENTS = ['verified', 'none'];
const fieldError = (field) => new ApiError(400, 'VALIDATION_FAILED', null, { field });
const has = (input, key) => Object.prototype.hasOwnProperty.call(input, key);

function decimalPlaces(value) {
  if (Number.isInteger(value)) return 0;
  const text = String(value);
  return /e/i.test(text) ? 99 : text.split('.')[1].length;
}

function parseAddress(raw, field) {
  if (raw === '' || raw === null || raw === undefined) return '';
  const normalized = normalizeEvmAddress(raw);
  if (!normalized || isZeroAddress(normalized)) throw fieldError(field);
  return normalized;
}

// An explorer link is rendered as an <a href> in the customer UI, so it must be a plain https URL to a named host with
// the {txHash} placeholder exactly once - never javascript:/data:/http:, never credentials, never a bare IP.
export function parseExplorerTemplate(raw) {
  if (typeof raw !== 'string') throw fieldError('explorerTxUrlTemplate');
  const template = raw.trim();
  if (template.length > 200 || (template.match(/\{txHash\}/g) || []).length !== 1) throw fieldError('explorerTxUrlTemplate');
  let url;
  try { url = new URL(template.replace('{txHash}', '0x' + '0'.repeat(64))); } catch { throw fieldError('explorerTxUrlTemplate'); }
  const hostIsIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.includes(':');
  if (url.protocol !== 'https:' || url.username || url.password || hostIsIp || !url.hostname.includes('.')) throw fieldError('explorerTxUrlTemplate');
  return template;
}
export function explorerUrlFor(template, txHash) {
  return template && txHash ? template.replace('{txHash}', txHash) : null;
}

// Admin-facing units in (USD), stored units out (micro-USD). `partial` = a PATCH: only the present fields are validated and
// returned. Enabling additionally requires the whole set to be complete (checked by isPayoutConfigComplete()).
export function parseReferralPayoutSettingsInput(body, { partial = false } = {}) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const out = {};
  const need = (key) => !partial || has(input, key);
  if (need('enabled')) {
    if (typeof input.enabled !== 'boolean') throw fieldError('enabled');
    out.enabled = input.enabled;
  }
  // chainId is accepted only so an admin UI can echo the pinned value back; anything but 56 is refused outright.
  if (has(input, 'chainId') && input.chainId !== PAYOUT_CHAIN_ID) throw fieldError('chainId');
  if (need('tokenSymbol')) {
    const symbol = typeof input.tokenSymbol === 'string' ? input.tokenSymbol.trim().toUpperCase() : '';
    if (!/^[A-Z0-9]{2,10}$/.test(symbol)) throw fieldError('tokenSymbol');
    out.tokenSymbol = symbol;
  }
  if (need('tokenContract')) out.tokenContract = parseAddress(input.tokenContract, 'tokenContract');
  if (need('treasurySender')) out.treasurySender = parseAddress(input.treasurySender, 'treasurySender');
  if (need('tokenDecimals')) {
    if (!Number.isInteger(input.tokenDecimals) || input.tokenDecimals < 6 || input.tokenDecimals > 36) throw fieldError('tokenDecimals');
    out.tokenDecimals = input.tokenDecimals;
  }
  if (need('minConfirmations')) {
    if (!Number.isInteger(input.minConfirmations) || input.minConfirmations < 1 || input.minConfirmations > 1000) throw fieldError('minConfirmations');
    out.minConfirmations = input.minConfirmations;
  }
  if (need('minPayoutUsd')) {
    const usd = input.minPayoutUsd;
    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 1 || usd > 1000000 || decimalPlaces(usd) > 6) throw fieldError('minPayoutUsd');
    out.minPayoutMicroUsd = Math.round(usd * MICRO);
  }
  if (need('explorerTxUrlTemplate')) out.explorerTxUrlTemplate = parseExplorerTemplate(input.explorerTxUrlTemplate);
  if (need('requiredKycStatus')) {
    if (!KYC_REQUIREMENTS.includes(input.requiredKycStatus)) throw fieldError('requiredKycStatus');
    out.requiredKycStatus = input.requiredKycStatus;
  }
  if (need('reauthMaxAgeMinutes')) {
    if (!Number.isInteger(input.reauthMaxAgeMinutes) || input.reauthMaxAgeMinutes < 1 || input.reauthMaxAgeMinutes > 60) throw fieldError('reauthMaxAgeMinutes');
    out.reauthMaxAgeMinutes = input.reauthMaxAgeMinutes;
  }
  if (need('termsVersion')) {
    if (typeof input.termsVersion !== 'string' || !/^[A-Za-z0-9._-]{1,40}$/.test(input.termsVersion)) throw fieldError('termsVersion');
    out.termsVersion = input.termsVersion;
  }
  if (need('makerCheckerRequired')) {
    if (typeof input.makerCheckerRequired !== 'boolean') throw fieldError('makerCheckerRequired');
    out.makerCheckerRequired = input.makerCheckerRequired;
  }
  return out;
}

// Cross-field rules that only make sense on the merged result.
export function assertPayoutSettingsCoherent(settings) {
  if (settings.tokenContract && settings.treasurySender && addressesEqual(settings.tokenContract, settings.treasurySender)) throw fieldError('treasurySender');
  if (settings.enabled && !isPayoutConfigComplete(settings)) throw new ApiError(409, 'REFERRAL_PAYOUT_CONFIG_INCOMPLETE');
}

// Every field a real payout verification needs is present (the RPC endpoint is checked separately by the caller).
export function isPayoutConfigComplete(settings) {
  return Boolean(settings.chainId === PAYOUT_CHAIN_ID && settings.tokenContract && settings.treasurySender && settings.tokenSymbol && settings.tokenDecimals >= 6);
}

// Merge a stored override over the defaults, re-validating defensively: a corrupt/legacy stored value can never widen the
// pinned chain or produce a non-normalized address - it falls back to the safe default for that field.
export function mergeReferralPayoutSettings(stored) {
  const merged = { ...REFERRAL_PAYOUT_DEFAULTS };
  if (!stored || typeof stored !== 'object') return merged;
  const attempt = (key, value) => {
    try { Object.assign(merged, parseReferralPayoutSettingsInput({ [key]: value }, { partial: true })); } catch { /* keep the default */ }
  };
  for (const key of ['enabled', 'tokenSymbol', 'tokenContract', 'treasurySender', 'tokenDecimals', 'minConfirmations', 'explorerTxUrlTemplate', 'requiredKycStatus', 'reauthMaxAgeMinutes', 'termsVersion', 'makerCheckerRequired']) {
    if (key in stored) attempt(key, stored[key]);
  }
  if (Number.isSafeInteger(stored.minPayoutMicroUsd) && stored.minPayoutMicroUsd >= MICRO) merged.minPayoutMicroUsd = stored.minPayoutMicroUsd;
  merged.chainId = PAYOUT_CHAIN_ID;
  // An enabled flag can never survive an incomplete configuration.
  if (merged.enabled && !isPayoutConfigComplete(merged)) merged.enabled = false;
  return merged;
}

// Stored form of an admin edit (micro-USD already converted by the parser).
export function storedFormOf(settings) {
  const { chainId, ...rest } = settings; // chainId is a constant, never stored
  void chainId;
  return rest;
}

// The admin view of the settings (USD for the money field; the pinned chain shown as a constant).
export function toAdminSettingsDto(settings, { rpcConfigured }) {
  return {
    enabled: settings.enabled, chainId: PAYOUT_CHAIN_ID, chainName: PAYOUT_CHAIN_NAME, tokenSymbol: settings.tokenSymbol,
    tokenContract: settings.tokenContract, tokenDecimals: settings.tokenDecimals, treasurySender: settings.treasurySender,
    minConfirmations: settings.minConfirmations, minPayoutUsd: settings.minPayoutMicroUsd / MICRO, explorerTxUrlTemplate: settings.explorerTxUrlTemplate,
    requiredKycStatus: settings.requiredKycStatus, reauthMaxAgeMinutes: settings.reauthMaxAgeMinutes, termsVersion: settings.termsVersion,
    makerCheckerRequired: settings.makerCheckerRequired, complete: isPayoutConfigComplete(settings), rpcConfigured: Boolean(rpcConfigured)
  };
}

// What a CUSTOMER may see: enough to understand and consent to the transfer, never the treasury sender or any secret.
export function toCustomerPayoutConfigDto(settings, { effectiveMinimumMicroUsd }) {
  return {
    enabled: settings.enabled, chainId: PAYOUT_CHAIN_ID, chainName: PAYOUT_CHAIN_NAME, tokenSymbol: settings.tokenSymbol, tokenContract: settings.tokenContract,
    tokenDecimals: settings.tokenDecimals, minConfirmations: settings.minConfirmations, minimumMicroUsd: effectiveMinimumMicroUsd,
    explorerTxUrlTemplate: settings.explorerTxUrlTemplate, requiredKycStatus: settings.requiredKycStatus, termsVersion: settings.termsVersion,
    reauthMaxAgeMinutes: settings.reauthMaxAgeMinutes
  };
}
