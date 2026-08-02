// DEV MODE ONLY - not real authentication. Trusts an `x-dev-user-id` header the browser
// sends from dev-user-switcher.js's chosen "current user". This is intentionally the ONLY
// place identity is resolved: every downstream route handler reads `req.currentUser`, never
// the raw header directly. A future real-auth swap is additive - write auth-real.mjs with
// the identical `(repo) => (req,res,next) => {...; next();}` shape (verifying a session/JWT
// instead of trusting a header), then change the one `app.use(devUserAuth(repo))` line in
// community-api-server.mjs. No route file changes required.
export function devUserAuth(repo) {
  return async function (req, res, next) {
    try {
      const userId = req.header('x-dev-user-id');
      if (!userId) return res.status(401).json({ error: 'DEV_USER_ID_REQUIRED' });
      const user = await repo.users.get(userId);
      if (!user) return res.status(401).json({ error: 'UNKNOWN_DEV_USER' });
      req.currentUser = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}
