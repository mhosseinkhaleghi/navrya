import { resolveSession } from './security/session-service.mjs';

// Replaces the old raw-bearer-header trust model entirely: identity now comes ONLY from the
// HttpOnly session cookie (server/community/security/session-service.mjs), verified against the
// hashed, server-side auth_sessions row - never from a client-supplied header. The historical
// `x-dev-user-id` header is not read here at all anymore; it is retained only as the wire name
// nothing meaningful is sent under any more (see public/pages/shared/dev-user-switcher.js) and
// as the input to the separate, narrow, time-boxed POST /api/auth/legacy-exchange endpoint
// (routes.auth.mjs) that trades an old-format bearer token for a real session ONE TIME - this
// middleware never accepts that old format for ongoing request authentication.
//
// Fails closed on every branch: no cookie, an unknown/expired/revoked session, or a suspended
// account all produce a generic 401/403 with no information about which case applied.
export function requireAuth(repo) {
  return async function (req, res, next) {
    try {
      const sessionRecord = await resolveSession(repo, req);
      if (!sessionRecord) return res.status(401).json({ error: 'AUTH_SESSION_REQUIRED' });
      const user = await repo.users.get(sessionRecord.userId);
      if (!user) return res.status(401).json({ error: 'AUTH_SESSION_REQUIRED' });
      // suspendedAt is enforced on every single authenticated request, the one place every
      // route already passes through - a suspension takes effect on this user's very next
      // request, not just their next login.
      if (user.suspendedAt) return res.status(403).json({ error: 'ACCOUNT_SUSPENDED' });
      req.currentUser = user;
      req.sessionId = sessionRecord.id;
      req.sessionRecord = sessionRecord;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// A lightweight variant for routes that behave differently for an authenticated vs anonymous
// caller (none exist yet on this API, but GET /api/auth/session - the frontend's early bootstrap
// call - needs exactly this: never a 401, just req.currentUser being present or not).
export function optionalAuth(repo) {
  return async function (req, res, next) {
    try {
      const sessionRecord = await resolveSession(repo, req);
      if (sessionRecord) {
        const user = await repo.users.get(sessionRecord.userId);
        if (user && !user.suspendedAt) {
          req.currentUser = user;
          req.sessionId = sessionRecord.id;
          req.sessionRecord = sessionRecord;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
