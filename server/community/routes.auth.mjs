import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import { asyncHandler, ApiError } from './errors.mjs';
import { hashPassword, verifyPassword, signToken, resolveAuthSecret } from './auth-tokens.mjs';

// Mounted at /api/auth, before the auth gate (server/community/app.mjs) - this is where a
// browser gets its first token from. Replaces the old public POST /api/users (name-only, no
// credential) entirely; see server/community/routes.users.mjs (publicRouter removed).
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Only applied at account-creation time (register/Google-signup), never on ordinary login - so
// an admin explicitly demoted by another admin doesn't get silently re-promoted on their next
// login just because ADMIN_BOOTSTRAP_EMAIL is still set in the environment.
async function bootstrapAdminIfMatch(repo, user) {
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  if (!bootstrapEmail || user.role === 'admin') return user;
  if (normalizeEmail(user.email) !== normalizeEmail(bootstrapEmail)) return user;
  return repo.users.update(user.id, { role: 'admin' });
}

function issueSession(res, status, user) {
  res.status(status).json({ user, token: signToken(user.id, resolveAuthSecret()) });
}

export function router(repo) {
  const r = express.Router();

  r.post('/register', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const displayName = String(body.displayName || '').trim();
    if (!looksLikeEmail(email)) throw new ApiError(400, 'INVALID_EMAIL');
    // Deliberately permissive during the testing phase - a real complexity policy is a later
    // concern, not something to build ahead of having real users to annoy with it.
    if (password.length < 4) throw new ApiError(400, 'PASSWORD_TOO_SHORT');
    if (!displayName) throw new ApiError(400, 'VALIDATION_FAILED');
    if (await repo.users.findCredentialsByEmail(email)) throw new ApiError(409, 'EMAIL_TAKEN');

    const passwordHash = hashPassword(password);
    let user = await repo.users.create({ displayName, email });
    await repo.users.setCredentials(user.id, { passwordHash });
    user = await bootstrapAdminIfMatch(repo, user);
    issueSession(res, 201, user);
  }));

  r.post('/login', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const creds = await repo.users.findCredentialsByEmail(email);
    // One generic error for "no such email" and "wrong password" alike - never confirm or deny
    // whether an email is registered.
    if (!creds || !verifyPassword(password, creds.passwordHash)) throw new ApiError(401, 'INVALID_CREDENTIALS');
    if (creds.suspendedAt) throw new ApiError(403, 'ACCOUNT_SUSPENDED');
    issueSession(res, 200, await repo.users.get(creds.id));
  }));

  r.post('/google', asyncHandler(async (req, res) => {
    const credential = (req.body || {}).credential;
    if (!credential) throw new ApiError(400, 'VALIDATION_FAILED');
    const clientId = process.env.GOOGLE_CLIENT_ID;
    // Clean 503 rather than a crash - mirrors pattern-ai-server.mjs's *_API_KEY_MISSING
    // convention, so the rest of the app (email/password login included) stays fully usable
    // before a Google Client ID is configured.
    if (!clientId) throw new ApiError(503, 'GOOGLE_AUTH_NOT_CONFIGURED');

    let payload;
    try {
      const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: credential, audience: clientId });
      payload = ticket.getPayload();
    } catch (_) {
      throw new ApiError(401, 'GOOGLE_TOKEN_INVALID');
    }
    // Explicit check, not an assumption - Google's own docs note hosted/Workspace accounts can
    // occasionally carry email_verified=false.
    if (!payload || payload.email_verified !== true) throw new ApiError(401, 'GOOGLE_EMAIL_NOT_VERIFIED');

    const existingId = await repo.users.findIdByGoogleId(payload.sub);
    if (existingId) {
      const user = await repo.users.get(existingId);
      if (user.suspendedAt) throw new ApiError(403, 'ACCOUNT_SUSPENDED');
      return issueSession(res, 200, user);
    }

    // No existing google_id match - deliberately NOT auto-linking to an existing password
    // account with a matching email (classic OAuth account-preemption: someone could
    // pre-register your email with a password of their choosing, then "inherit" your identity
    // the moment you first sign in with Google). Tell the visitor to use the other method
    // instead of silently merging or creating a duplicate.
    const email = normalizeEmail(payload.email);
    if (await repo.users.findCredentialsByEmail(email)) throw new ApiError(409, 'EMAIL_ALREADY_REGISTERED');

    const displayName = String(payload.name || '').trim() || email || 'Trader';
    let user = await repo.users.create({ displayName, email, avatarUrl: payload.picture || null });
    await repo.users.setCredentials(user.id, { googleId: payload.sub });
    user = await bootstrapAdminIfMatch(repo, user);
    issueSession(res, 201, user);
  }));

  return r;
}
