import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { asyncHandler, ApiError } from './errors.mjs';
import { requireAuth, optionalAuth } from './auth-real.mjs';
import {
  hashPassword, verifyPassword, assertPasswordPolicy, PasswordPolicyError, isLegacyHash
} from './security/passwords.mjs';
import {
  createSession, issueSessionCookies, revokeCurrentSession, revokeAllSessions,
  revokeOtherSessionsAfterPrivilegeChange
} from './security/session-service.mjs';
import { selfUserView } from './security/user-views.mjs';
import { recordSecurityEvent } from './security/audit.mjs';
import { rateLimit, ipKey, ipAndIdentifierKey } from './security/rate-limit.mjs';
import { randomToken, sha256Hex } from './security/crypto-util.mjs';
import { csrfProtection, issueCsrfToken } from './security/csrf.mjs';
import { clearAuthCookies } from './security/cookies.mjs';
import { sendMail } from './security/mailer.mjs';
import { verifyToken as verifyLegacyToken, resolveAuthSecret as legacyAuthSecret } from './auth-tokens.mjs';

// Temporary production bootstrap while the approved server operator does not have access to set
// GOOGLE_CLIENT_ID in the private server .env. This is a public OAuth client ID, not a secret.
// Once that environment value is verified, remove this override and restore env-only resolution.
const TEMPORARY_PRODUCTION_GOOGLE_CLIENT_ID = '443787785968-2e2nvrnt4lsq70ob5i2pvj3ujo6uekmf.apps.googleusercontent.com';

function googleClientId() {
  if (process.env.NODE_ENV === 'production') return TEMPORARY_PRODUCTION_GOOGLE_CLIENT_ID;
  return String(process.env.GOOGLE_CLIENT_ID || '').trim();
}

// Mounted at /api/auth, before the global requireAuth gate (server/community/app.mjs) - this
// router applies requireAuth/optionalAuth itself, per route, exactly where identity is actually
// needed (register/login/google/oidc/password-reset/legacy-exchange are necessarily pre-auth;
// logout/logout-all/sessions/password-change require an existing session).
//
// The pre-013/pre-real-auth ADMIN_BOOTSTRAP_EMAIL auto-promotion is REMOVED ENTIRELY (not
// disabled, not gated) - see docs/auth/ADR-0001 section 3 and IMPLEMENTATION_STATUS.md. The
// first admin account is now provisioned exclusively out-of-band via `node scripts/admin-grant.mjs`.
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

// Timing-attack mitigation (instruction #5: "missing-account login is cheaper than
// wrong-password login"). A fixed, pre-computed hash argon2 always verifies against even when no
// real credential row exists, so the expensive hash-comparison work happens on every login
// attempt regardless of whether the email is registered - an attacker measuring response time
// cannot distinguish "no such account" from "wrong password" by latency alone. Computed lazily,
// once, and cached for the life of the process (recomputing per request would defeat the point
// of a constant reference to compare against, and would itself be expensive per request).
let dummyHashPromise = null;
function dummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(randomToken(32));
  return dummyHashPromise;
}

export function router(repo) {
  const r = express.Router();

  // ---- Registration / login / Google -------------------------------------------------------
  r.post(
    '/register',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 20, keyFn: ipKey('register') }),
    rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyFn: ipAndIdentifierKey('register', (req) => (req.body || {}).email) }),
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const displayName = String(body.displayName || '').trim();
      if (!looksLikeEmail(email)) throw new ApiError(400, 'INVALID_EMAIL');
      if (!displayName || displayName.length > 80) throw new ApiError(400, 'VALIDATION_FAILED');
      try {
        assertPasswordPolicy(password, { email, displayName });
      } catch (error) {
        if (error instanceof PasswordPolicyError) throw new ApiError(400, error.code);
        throw error;
      }
      if (await repo.users.findCredentialsByEmail(email)) throw new ApiError(409, 'EMAIL_TAKEN');

      const passwordHash = await hashPassword(password);
      let user = await repo.users.create({ displayName, email });
      await repo.users.setCredentials(user.id, { passwordHash });

      const { rawId, record } = await createSession(repo, { userId: user.id, req });
      const csrfToken = issueSessionCookies(res, rawId, record.id);
      await sendVerificationEmail(repo, user);
      await recordSecurityEvent(repo, { req, userId: user.id, type: 'register', detail: { email } });
      res.status(201).json({ user: selfUserView(user), csrfToken });
    })
  );

  r.post(
    '/login',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 40, keyFn: ipKey('login') }),
    rateLimit({ windowMs: 15 * 60 * 1000, max: 8, keyFn: ipAndIdentifierKey('login', (req) => (req.body || {}).email) }),
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const creds = await repo.users.findCredentialsByEmail(email);
      // Always run a real password verification, even with no matching account, against a fixed
      // dummy hash - see dummyHash() above for why.
      const verified = creds
        ? await verifyPassword(password, creds.passwordHash)
        : await verifyPassword(password, await dummyHash()).then(() => false);
      if (!creds || !verified) {
        await recordSecurityEvent(repo, { req, type: 'login_failed', detail: { email } });
        throw new ApiError(401, 'INVALID_CREDENTIALS');
      }
      if (creds.suspendedAt) throw new ApiError(403, 'ACCOUNT_SUSPENDED');

      // Transparent upgrade: a successful login against the OLD synchronous-scrypt format
      // (server/community/auth-tokens.mjs's original hashPassword) is re-hashed under argon2id
      // right away, so every account migrates off the legacy format the first time its owner
      // actually logs in again - no bulk migration job needed, and no account is ever locked out.
      if (isLegacyHash(creds.passwordHash)) {
        await repo.users.setCredentials(creds.id, { passwordHash: await hashPassword(password) });
      }

      const user = await repo.users.get(creds.id);
      const { rawId, record } = await createSession(repo, { userId: user.id, req });
      const csrfToken = issueSessionCookies(res, rawId, record.id);
      await recordSecurityEvent(repo, { req, userId: user.id, type: 'login_success', detail: {} });
      res.status(200).json({ user: selfUserView(user), csrfToken });
    })
  );

  r.post(
    '/google',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyFn: ipKey('google') }),
    asyncHandler(async (req, res) => {
      const credential = (req.body || {}).credential;
      if (!credential) throw new ApiError(400, 'VALIDATION_FAILED');
      const clientId = googleClientId();
      if (!clientId) throw new ApiError(503, 'GOOGLE_AUTH_NOT_CONFIGURED');

      let payload;
      try {
        const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: credential, audience: clientId });
        payload = ticket.getPayload();
      } catch (_) {
        throw new ApiError(401, 'GOOGLE_TOKEN_INVALID');
      }
      if (!payload || payload.email_verified !== true) throw new ApiError(401, 'GOOGLE_EMAIL_NOT_VERIFIED');

      const issuer = 'https://accounts.google.com';
      // (issuer, subject) is the real identity key (ADR-0001 section 3) - never email. Legacy
      // rows that only ever had users.google_id set (pre-external_identities) are still resolved
      // by findIdByGoogleId for back-compat, then backfilled into external_identities so every
      // future lookup uses the new table uniformly.
      let userId = await repo.externalIdentities.findUserId(issuer, payload.sub);
      if (!userId) userId = await repo.users.findIdByGoogleId(payload.sub);
      if (userId) {
        await repo.externalIdentities.link({ userId, issuer, subject: payload.sub, emailAtLink: normalizeEmail(payload.email) }).catch(() => {});
        const user = await repo.users.get(userId);
        if (!user) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID');
        if (user.suspendedAt) throw new ApiError(403, 'ACCOUNT_SUSPENDED');
        const { rawId, record } = await createSession(repo, { userId: user.id, req });
        const csrfToken = issueSessionCookies(res, rawId, record.id);
        await recordSecurityEvent(repo, { req, userId: user.id, type: 'login_success', detail: { provider: 'google' } });
        return res.status(200).json({ user: selfUserView(user), csrfToken });
      }

      // No existing identity match - deliberately NOT auto-linking to an existing password
      // account with a matching email (OAuth account-preemption defense, ADR-0001 section 3).
      const email = normalizeEmail(payload.email);
      if (await repo.users.findCredentialsByEmail(email)) throw new ApiError(409, 'EMAIL_ALREADY_REGISTERED');

      const displayName = String(payload.name || '').trim() || email || 'Trader';
      const user = await repo.users.create({ displayName, email, avatarUrl: payload.picture || null });
      await repo.users.setCredentials(user.id, { googleId: payload.sub });
      await repo.externalIdentities.link({ userId: user.id, issuer, subject: payload.sub, emailAtLink: email });
      await repo.users.markEmailVerified(user.id); // Google already verified this address
      const { rawId, record } = await createSession(repo, { userId: user.id, req });
      const csrfToken = issueSessionCookies(res, rawId, record.id);
      await recordSecurityEvent(repo, { req, userId: user.id, type: 'register', detail: { provider: 'google', email } });
      res.status(201).json({ user: selfUserView(await repo.users.get(user.id)), csrfToken });
    })
  );

  // ---- Session bootstrap (the frontend's one early call before rendering anything user-scoped) -
  r.get(
    '/session',
    optionalAuth(repo),
    asyncHandler(async (req, res) => {
      if (!req.currentUser) return res.json({ authenticated: false, user: null, csrfToken: null, language: null });
      // Re-issuing a CSRF token for the SAME session id (not a new session) - issueCsrfToken
      // mints a fresh nonce each call, all equally valid against this session id, so calling it
      // again here is correct and requires no extra cookie write.
      // Bundles the language preference into this SAME response (one early bootstrap request,
      // per the frontend boot-sequencing requirement) rather than a second round trip to
      // /api/sync/preferences - public/pages/shared/boot-language-gate.js is this response's
      // one and only caller for the zero-flash boot gate.
      const prefs = await repo.userPreferences.listByUser(req.currentUser.id);
      const languagePref = prefs.find((p) => p.id === 'language');
      res.json({
        authenticated: true, user: selfUserView(req.currentUser), csrfToken: issueCsrfToken(req.sessionId),
        language: languagePref ? languagePref.value : null
      });
    })
  );

  // ---- Logout / session management (require an existing session + CSRF) --------------------
  r.post('/logout', requireAuth(repo), csrfProtection(), asyncHandler(async (req, res) => {
    await revokeCurrentSession(repo, req.sessionId, res);
    await recordSecurityEvent(repo, { req, userId: req.currentUser.id, type: 'logout', detail: {} });
    res.json({ ok: true });
  }));

  r.post('/logout-all', requireAuth(repo), csrfProtection(), asyncHandler(async (req, res) => {
    const count = await revokeAllSessions(repo, req.currentUser.id, 'logout_all');
    clearAuthCookies(res);
    await recordSecurityEvent(repo, { req, userId: req.currentUser.id, type: 'logout_all', detail: { revoked: count } });
    res.json({ ok: true, revoked: count });
  }));

  r.get('/sessions', requireAuth(repo), asyncHandler(async (req, res) => {
    const sessions = await repo.authSessions.listActiveForUser(req.currentUser.id);
    res.json({
      sessions: sessions.map((s) => ({
        id: s.id, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, userAgent: s.userAgent,
        isCurrent: s.id === req.sessionId
      }))
    });
  }));

  r.delete('/sessions/:id', requireAuth(repo), csrfProtection(), asyncHandler(async (req, res) => {
    const sessions = await repo.authSessions.listActiveForUser(req.currentUser.id);
    const target = sessions.find((s) => s.id === req.params.id);
    if (!target) throw new ApiError(404, 'SESSION_NOT_FOUND');
    await repo.authSessions.revoke(target.id, 'session_revoked');
    await recordSecurityEvent(repo, { req, userId: req.currentUser.id, type: 'session_revoked', detail: { sessionId: target.id } });
    res.json({ ok: true });
  }));

  // ---- Password change (self-service, proof-of-knowledge of the CURRENT password is the
  // step-up itself - no separate reauth timer needed for this specific action) ----------------
  r.post(
    '/password/change',
    requireAuth(repo),
    csrfProtection(),
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyFn: (req) => `pwchange:${req.currentUser.id}` }),
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      const creds = await repo.users.findCredentialsByEmail(req.currentUser.email);
      if (!creds || !(await verifyPassword(String(body.currentPassword || ''), creds.passwordHash))) {
        throw new ApiError(401, 'CURRENT_PASSWORD_INCORRECT');
      }
      try {
        assertPasswordPolicy(String(body.newPassword || ''), { email: req.currentUser.email, displayName: req.currentUser.displayName });
      } catch (error) {
        if (error instanceof PasswordPolicyError) throw new ApiError(400, error.code);
        throw error;
      }
      await repo.users.setCredentials(req.currentUser.id, { passwordHash: await hashPassword(String(body.newPassword)) });
      await repo.authSessions.markReauth(req.sessionId);
      await revokeOtherSessionsAfterPrivilegeChange(repo, req.currentUser.id, req.sessionId, 'password_changed');
      await recordSecurityEvent(repo, { req, userId: req.currentUser.id, type: 'password_changed', detail: {} });
      res.json({ ok: true });
    })
  );

  // ---- Password recovery (no session yet) - always a generic response, never confirms or
  // denies whether an email is registered ------------------------------------------------------
  r.post(
    '/password/forgot',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 20, keyFn: ipKey('forgot') }),
    rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyFn: ipAndIdentifierKey('forgot', (req) => (req.body || {}).email) }),
    asyncHandler(async (req, res) => {
      const email = normalizeEmail((req.body || {}).email);
      if (looksLikeEmail(email)) {
        const creds = await repo.users.findCredentialsByEmail(email);
        if (creds) await sendPasswordResetEmail(repo, await repo.users.get(creds.id));
      }
      res.json({ ok: true }); // identical response whether or not the email exists
    })
  );

  r.post(
    '/password/reset',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 20, keyFn: ipKey('reset') }),
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      const transactionId = String(body.transactionId || '');
      const token = String(body.token || '');
      if (!transactionId || !token) throw new ApiError(400, 'VALIDATION_FAILED');
      const transaction = await repo.authTransactions.get(transactionId);
      if (!transaction || transaction.purpose !== 'password_reset' || transaction.tokenHash !== sha256Hex(token)) {
        throw new ApiError(400, 'RESET_TOKEN_INVALID');
      }
      const consumed = await repo.authTransactions.consume(transactionId);
      if (!consumed) throw new ApiError(400, 'RESET_TOKEN_INVALID');
      try {
        assertPasswordPolicy(String(body.newPassword || ''), {});
      } catch (error) {
        if (error instanceof PasswordPolicyError) throw new ApiError(400, error.code);
        throw error;
      }
      await repo.users.setCredentials(consumed.userId, { passwordHash: await hashPassword(String(body.newPassword)) });
      await revokeAllSessions(repo, consumed.userId, 'password_changed');
      await recordSecurityEvent(repo, { req, userId: consumed.userId, type: 'password_changed', detail: { via: 'reset' } });
      res.json({ ok: true });
    })
  );

  // ---- Email verification --------------------------------------------------------------------
  r.post('/email/resend-verification', requireAuth(repo), rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyFn: (req) => `resend:${req.currentUser.id}` }), asyncHandler(async (req, res) => {
    if (req.currentUser.emailVerified) return res.json({ ok: true, alreadyVerified: true });
    await sendVerificationEmail(repo, req.currentUser);
    res.json({ ok: true });
  }));

  r.post('/email/verify', rateLimit({ windowMs: 60 * 60 * 1000, max: 30, keyFn: ipKey('email-verify') }), asyncHandler(async (req, res) => {
    const body = req.body || {};
    const transactionId = String(body.transactionId || '');
    const token = String(body.token || '');
    const transaction = transactionId ? await repo.authTransactions.get(transactionId) : null;
    if (!transaction || transaction.purpose !== 'email_verify' || transaction.tokenHash !== sha256Hex(token)) {
      throw new ApiError(400, 'VERIFY_TOKEN_INVALID');
    }
    const consumed = await repo.authTransactions.consume(transactionId);
    if (!consumed) throw new ApiError(400, 'VERIFY_TOKEN_INVALID');
    await repo.users.markEmailVerified(consumed.userId);
    await recordSecurityEvent(repo, { req, userId: consumed.userId, type: 'email_verified', detail: {} });
    res.json({ ok: true });
  }));

  // ---- One-time legacy bearer-token exchange (ADR-0001 section 2 / 4) ------------------------
  // A browser that still holds a pre-existing `x-dev-user-id` bearer value (the old
  // HMAC-signed token from server/community/auth-tokens.mjs) trades it in for a real cookie
  // session, exactly once per browser (the client deletes its localStorage copy immediately
  // after - see public/pages/shared/dev-user-switcher.js). This is NOT a parallel ongoing auth
  // mechanism: requireAuth() never accepts this header for regular request authentication, only
  // this one narrow endpoint does, and only while LEGACY_AUTH_SUNSET_AT has not passed. No new
  // tokens of the old format are ever minted anywhere after this change.
  r.post(
    '/legacy-exchange',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 20, keyFn: ipKey('legacy-exchange') }),
    asyncHandler(async (req, res) => {
      const sunset = process.env.LEGACY_AUTH_SUNSET_AT;
      const disabled = !sunset || new Date(sunset).getTime() < Date.now();
      if (disabled) throw new ApiError(410, 'LEGACY_EXCHANGE_DISABLED');
      const legacyToken = String((req.body || {}).legacyToken || '');
      const claims = verifyLegacyToken(legacyToken, legacyAuthSecret());
      if (!claims) throw new ApiError(401, 'LEGACY_TOKEN_INVALID');
      const user = await repo.users.get(claims.sub);
      if (!user) throw new ApiError(401, 'LEGACY_TOKEN_INVALID');
      if (user.suspendedAt) throw new ApiError(403, 'ACCOUNT_SUSPENDED');
      const { rawId, record } = await createSession(repo, { userId: user.id, req });
      const csrfToken = issueSessionCookies(res, rawId, record.id);
      await recordSecurityEvent(repo, { req, userId: user.id, type: 'legacy_token_exchanged', detail: {} });
      res.json({ user: selfUserView(user), csrfToken });
    })
  );

  return r;
}

// ---- Email helpers (dev-mode: link is logged/returned; production: sent via mailer.mjs, never
// returned in the response body - see sendMail()'s own production-vs-dev split) ---------------
const RESET_TTL_MS = 30 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

async function sendPasswordResetEmail(repo, user) {
  const token = randomToken(32);
  const transaction = await repo.authTransactions.create({
    purpose: 'password_reset', userId: user.id, tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString()
  });
  const link = `${process.env.APP_ORIGIN || ''}/reset-password?transactionId=${transaction.id}&token=${token}`;
  await sendMail({ to: user.email, subject: 'Reset your NAVRYA password', text: `Reset your password: ${link}\nThis link expires in 30 minutes.` });
  return process.env.NODE_ENV === 'production' ? undefined : { transactionId: transaction.id, token, link };
}

async function sendVerificationEmail(repo, user) {
  if (!user.email) return undefined;
  const token = randomToken(32);
  const transaction = await repo.authTransactions.create({
    purpose: 'email_verify', userId: user.id, tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS).toISOString()
  });
  const link = `${process.env.APP_ORIGIN || ''}/verify-email?transactionId=${transaction.id}&token=${token}`;
  await sendMail({ to: user.email, subject: 'Verify your NAVRYA email', text: `Verify your email: ${link}\nThis link expires in 24 hours.` });
  return process.env.NODE_ENV === 'production' ? undefined : { transactionId: transaction.id, token, link };
}
