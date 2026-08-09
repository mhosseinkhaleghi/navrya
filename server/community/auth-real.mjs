import { verifyToken, resolveAuthSecret } from './auth-tokens.mjs';

// Replaces server/community/auth-dev.mjs, which trusted a client-supplied x-dev-user-id header
// verbatim. The header name is kept as-is on purpose - about 30 call sites across ~9
// public/pages/shared/*.js files already attach it on every fetch, and none of them need to
// change: the header now carries a signed session token (see routes.auth.mjs) instead of a raw
// user id, but the wire-level name is unchanged. It no longer means "dev user id" - it means
// "bearer session token" - see server/community/routes.auth.mjs for where it's issued.
export function requireAuth(repo) {
  return async function (req, res, next) {
    try {
      const token = req.header('x-dev-user-id');
      if (!token) return res.status(401).json({ error: 'AUTH_TOKEN_REQUIRED' });
      const claims = verifyToken(token, resolveAuthSecret());
      if (!claims) return res.status(401).json({ error: 'AUTH_TOKEN_INVALID' });
      const user = await repo.users.get(claims.sub);
      if (!user) return res.status(401).json({ error: 'AUTH_USER_NOT_FOUND' });
      // suspendedAt existed before this change but was never actually enforced anywhere -
      // closing that gap here since this is the one place every request already passes through.
      if (user.suspendedAt) return res.status(403).json({ error: 'ACCOUNT_SUSPENDED' });
      req.currentUser = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}
