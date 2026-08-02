// Mirrors server/community/auth-dev.mjs's exact (repo) => (req,res,next) => {...} shape.
// Gated behind ADMIN_AUTH_ENFORCED (default false): while disabled, req.currentUser (already
// resolved by devUserAuth, which always runs first - see app.mjs's mount order) is trusted as
// admin for every route under /api/admin without a role check, so this codebase's first
// operator surface is usable before real authentication exists anywhere in the app. Flipping
// enforcement on later is a one-line env change - no route file needs to change, same promise
// auth-dev.mjs already makes for a future real-auth swap.
export function requireAdmin(repo) { // eslint-disable-line no-unused-vars
  const enforced = process.env.ADMIN_AUTH_ENFORCED === 'true';
  console.log(enforced ? '[admin] auth ENFORCED' : '[admin] auth DISABLED — test mode, every request is treated as admin'); // eslint-disable-line no-console
  return function (req, res, next) {
    if (!enforced) return next();
    if (!req.currentUser || req.currentUser.role !== 'admin') return res.status(403).json({ error: 'ADMIN_ROLE_REQUIRED' });
    next();
  };
}
