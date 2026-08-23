import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { isOidcConfigured, startAuthorization, completeAuthorization } from './security/oidc.mjs';
import { randomToken, sha256Hex } from './security/crypto-util.mjs';
import { createSession, issueSessionCookies } from './security/session-service.mjs';
import { serializeOidcTxnCookie, readOidcTxnCookie, appendSetCookie } from './security/cookies.mjs';
import { recordSecurityEvent } from './security/audit.mjs';
import { rateLimit, ipKey } from './security/rate-limit.mjs';

// Generic OIDC Relying Party routes (ADR-0001 section 1) - mounted at /api/auth/oidc, separate
// from routes.auth.mjs purely to keep that already-large file from growing further, not for any
// access-control reason (both are pre-auth, no-session-yet routes). No vendor-specific code:
// everything provider-specific is resolved through server/community/security/oidc.mjs's generic
// adapter, driven by OIDC_ISSUER_URL/OIDC_CLIENT_ID/OIDC_CLIENT_SECRET/OIDC_REDIRECT_URI.
//
// Only an ALLOWLISTED set of post-login return paths is honored (never an arbitrary
// client-supplied redirect) - this is the open-redirect defense the instructions call out
// specifically for the OIDC callback's "return safely to the intended Account -> Character
// journey" requirement.
const ALLOWED_RETURN_PATHS = new Set(['/', '/account', '/dashboard']);
function safeReturnPath(candidate) {
  return ALLOWED_RETURN_PATHS.has(candidate) ? candidate : '/';
}

const TXN_TTL_MS = 10 * 60 * 1000;

export function router(repo) {
  const r = express.Router();

  r.get(
    '/start',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyFn: ipKey('oidc-start') }),
    asyncHandler(async (req, res) => {
      if (!isOidcConfigured()) throw new ApiError(503, 'OIDC_NOT_CONFIGURED');
      const redirectUri = process.env.OIDC_REDIRECT_URI;
      if (!redirectUri) throw new ApiError(503, 'OIDC_NOT_CONFIGURED');
      const { authorizationUrl, state, nonce, codeVerifier } = await startAuthorization({ redirectUri });
      const returnTo = safeReturnPath(String(req.query.returnTo || '/'));
      const transaction = await repo.authTransactions.create({
        purpose: 'oidc',
        payload: { state, nonce, codeVerifier, redirectUri, returnTo },
        expiresAt: new Date(Date.now() + TXN_TTL_MS).toISOString()
      });
      appendSetCookie(res, serializeOidcTxnCookie(transaction.id, { maxAgeSeconds: TXN_TTL_MS / 1000 }));
      res.redirect(302, authorizationUrl);
    })
  );

  r.get(
    '/callback',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyFn: ipKey('oidc-callback') }),
    asyncHandler(async (req, res) => {
      const txnId = readOidcTxnCookie(req);
      if (!txnId) throw new ApiError(400, 'OIDC_TRANSACTION_MISSING');
      const transaction = await repo.authTransactions.consume(txnId);
      clearOidcTxnCookieOnly(res);
      if (!transaction || transaction.purpose !== 'oidc') throw new ApiError(400, 'OIDC_TRANSACTION_INVALID');

      const currentUrl = new URL(req.originalUrl, transaction.payload.redirectUri);
      let claims;
      let issuer;
      try {
        ({ claims, issuer } = await completeAuthorization({
          currentUrl,
          expectedState: transaction.payload.state,
          expectedNonce: transaction.payload.nonce,
          codeVerifier: transaction.payload.codeVerifier
        }));
      } catch (_) {
        throw new ApiError(401, 'OIDC_CALLBACK_INVALID');
      }

      let userId = await repo.externalIdentities.findUserId(issuer, claims.sub);
      if (!userId) {
        const email = claims.email ? String(claims.email).trim().toLowerCase() : null;
        // Same anti-preemption rule as Google sign-in (ADR-0001 section 3): never silently link
        // to an existing account just because the email matches. A genuinely new identity with
        // an email that already has a password/other-provider account must go through an
        // explicit, authenticated linking flow instead (not yet a self-service UI - see
        // IMPLEMENTATION_STATUS.md) rather than auto-merge.
        if (email && await repo.users.findCredentialsByEmail(email)) {
          throw new ApiError(409, 'EMAIL_ALREADY_REGISTERED');
        }
        const user = await repo.users.create({ displayName: claims.name || email || 'Trader', email });
        await repo.externalIdentities.link({ userId: user.id, issuer, subject: claims.sub, emailAtLink: email });
        if (claims.email_verified === true) await repo.users.markEmailVerified(user.id);
        userId = user.id;
        await recordSecurityEvent(repo, { req, userId, type: 'register', detail: { provider: 'oidc', issuer } });
      } else {
        await recordSecurityEvent(repo, { req, userId, type: 'login_success', detail: { provider: 'oidc', issuer } });
      }

      const user = await repo.users.get(userId);
      if (user.suspendedAt) throw new ApiError(403, 'ACCOUNT_SUSPENDED');
      const { rawId, record } = await createSession(repo, { userId: user.id, req });
      issueSessionCookies(res, rawId, record.id);
      res.redirect(302, safeReturnPath(transaction.payload.returnTo));
    })
  );

  return r;
}

function clearOidcTxnCookieOnly(res) {
  // clearAuthCookies() also clears the session/CSRF cookies, which would be wrong to do here
  // (this callback may be completing a login for a browser that had no prior session at all,
  // and must never clobber cookies unrelated to the OIDC transaction). Only the transaction
  // cookie needs clearing once consumed; reuse the shared serializer for the other two by simply
  // not calling them.
  appendSetCookie(res, serializeOidcTxnCookie('', { maxAgeSeconds: 0 }));
}
