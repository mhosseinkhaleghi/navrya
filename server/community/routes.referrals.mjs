import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { rateLimit, ipKey } from './security/rate-limit.mjs';
import { appendSetCookie, serializeReferralCookie } from './security/cookies.mjs';
import { recordSecurityEvent } from './security/audit.mjs';
import { normalizeReferralCode } from '../commercial/referral-rules.mjs';
import { resolveReferralTerms } from '../commercial/referral-programs.mjs';
import { signReferralCookie, visitorHashOf } from '../commercial/referral-attribution.mjs';
import { buildCustomerSummary, toCustomerLedgerDto } from '../commercial/referral-reports.mjs';
import { convertReferralToAiCredit } from '../commercial/referral-conversion.mjs';
import { requestPayout, cancelPayout, effectiveCashOutMinimum, toCustomerPayoutDto } from '../commercial/referral-payouts.mjs';
import { getReferralPayoutConfig } from '../commercial/commercial-config.mjs';
import { toCustomerPayoutConfigDto } from '../commercial/referral-payout-settings.mjs';

// Referral & Affiliate - the two customer-facing routers (server/commercial/referral-*.mjs own every rule).
//
// clickRouter  -> mounted PUBLIC, before requireAuth/csrfProtection, at /api/referrals (app.mjs). It is the shared-link landing:
//                 GET /c/:publicCode validates the code, sets the signed host-only HttpOnly SameSite=Lax attribution cookie and
//                 302s to "/" (the iframe-based app shell serves "/", so a bare query parameter would be lost - that is why the
//                 attribution rides a cookie, not a ?ref=). A code that is unknown / disabled / paused / belongs to a Disabled
//                 referrer answers the IDENTICAL redirect with no cookie, so the endpoint is not an existence oracle. Clicks are
//                 recorded as aggregate, pseudonymous counters only.
// router       -> behind requireAuth + csrfProtection at /api/referrals. Everything a referrer can read here is aggregate counts
//                 and their OWN balances (see referral-reports.mjs); nothing about the people they referred.
const clickLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, keyFn: ipKey('referral-click') });

export function clickRouter(repo) {
  const r = express.Router();
  r.get('/c/:publicCode', clickLimiter, asyncHandler(async (req, res) => {
    try {
      const publicCode = normalizeReferralCode(req.params.publicCode);
      const code = publicCode ? await repo.referral.getCodeByPublicCode(publicCode) : null;
      if (code && code.status === 'active') {
        const terms = await resolveReferralTerms(repo, code.userId);
        if (terms.canAttribute) {
          await repo.referral.recordClick({ codeId: code.id, visitorHash: visitorHashOf(req) });
          const ttlSeconds = terms.rules.attributionWindowDays * 24 * 60 * 60;
          appendSetCookie(res, serializeReferralCookie(signReferralCookie({ publicCode: code.publicCode, ttlSeconds }), { maxAgeSeconds: ttlSeconds }));
        }
      }
    } catch (error) {
      // A broken referral link must still land the visitor on the app - attribution is best-effort by design.
      try { console.error('[referral] click handling failed:', (error && (error.code || error.message)) || 'unknown'); } catch { /* ignore */ }
    }
    res.redirect(302, '/');
  }));
  return r;
}

const perUser = (prefix) => (req) => `${prefix}:${req.currentUser.id}`;
const readLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, keyFn: perUser('referral-read') });
const convertLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, keyFn: perUser('referral-convert') });
const payoutLimiter = rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 5, keyFn: perUser('referral-payout') });
const cancelLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, keyFn: perUser('referral-payout-cancel') });

export function router(repo) {
  const r = express.Router();

  // Always the freshest user row (KYC / email verification can change between requests).
  async function currentUser(req) {
    const user = await repo.users.get(req.currentUser.id);
    if (!user) throw new ApiError(401, 'AUTH_SESSION_REQUIRED');
    return user;
  }

  r.get('/me', readLimiter, asyncHandler(async (req, res) => {
    res.json(await buildCustomerSummary(repo, await currentUser(req)));
  }));

  r.get('/ledger', readLimiter, asyncHandler(async (req, res) => {
    res.json({ entries: toCustomerLedgerDto(await repo.referralEarnings.ledgerForUser(req.currentUser.id, { limit: 100 })) });
  }));

  // What a customer needs to understand and consent to a transfer: never the treasury sender or any secret.
  r.get('/payout-config', readLimiter, asyncHandler(async (req, res) => {
    const config = await getReferralPayoutConfig(repo);
    res.json(toCustomerPayoutConfigDto(config, { effectiveMinimumMicroUsd: await effectiveCashOutMinimum(repo, req.currentUser.id, config) }));
  }));

  // Voluntary, IRREVERSIBLE conversion of unconverted available referral earnings into (non-withdrawable) AI credit.
  r.post('/convert-to-ai', convertLimiter, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const result = await convertReferralToAiCredit(repo, { userId: req.currentUser.id, amountMicroUsd: body.amountMicroUsd, idempotencyKey: body.idempotencyKey });
    if (!result.duplicate) await recordSecurityEvent(repo, { req, userId: req.currentUser.id, type: 'referral_ai_conversion', detail: { amountMicroUsd: result.amountMicroUsd } });
    res.status(result.duplicate ? 200 : 201).json(result);
  }));

  r.get('/payouts', readLimiter, asyncHandler(async (req, res) => {
    res.json({ payouts: (await repo.referralPayouts.listForUser(req.currentUser.id, { limit: 50 })).map(toCustomerPayoutDto) });
  }));

  r.post('/payouts', payoutLimiter, asyncHandler(async (req, res) => {
    const { request, duplicate } = await requestPayout(repo, { user: await currentUser(req), sessionRecord: req.sessionRecord, body: req.body });
    if (!duplicate) await recordSecurityEvent(repo, { req, userId: req.currentUser.id, type: 'referral_payout_requested', detail: { payoutId: request.id, amountMicroUsd: request.amountMicroUsd } });
    res.status(duplicate ? 200 : 201).json(toCustomerPayoutDto(request));
  }));

  r.post('/payouts/:id/cancel', cancelLimiter, asyncHandler(async (req, res) => {
    const request = await cancelPayout(repo, { userId: req.currentUser.id, requestId: req.params.id });
    await recordSecurityEvent(repo, { req, userId: req.currentUser.id, type: 'referral_payout_cancelled', detail: { payoutId: request.id } });
    res.json(toCustomerPayoutDto(request));
  }));

  return r;
}
