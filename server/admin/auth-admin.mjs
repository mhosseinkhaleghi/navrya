import { isStepUpFresh } from '../community/security/session-service.mjs';

// Admin authorization now FAILS CLOSED unconditionally. The previous default (disabled unless
// ADMIN_AUTH_ENFORCED==='true', so ANY authenticated user was treated as admin) is removed
// entirely, not merely flipped - see docs/auth/ADR-0001 section 3 and the instruction's
// completion criterion "admin authorization can fail open" as a hard blocker. The only escape
// hatch is an EXPLICIT ADMIN_AUTH_ENFORCED='false', and even that is refused outright under
// NODE_ENV=production - so a production deployment can never accidentally ship with every user
// treated as an admin, regardless of what else is misconfigured.
export function requireAdmin(repo) { // eslint-disable-line no-unused-vars
  const explicitlyDisabled = process.env.ADMIN_AUTH_ENFORCED === 'false';
  if (explicitlyDisabled && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: ADMIN_AUTH_ENFORCED=false is not permitted when NODE_ENV=production. Remove this variable or set it to anything other than "false".');
  }
  console.log(explicitlyDisabled ? '[admin] auth DISABLED — non-production test mode, every request is treated as admin' : '[admin] auth ENFORCED'); // eslint-disable-line no-console
  return function (req, res, next) {
    if (explicitlyDisabled) return next();
    if (!req.currentUser || req.currentUser.role !== 'admin') return res.status(403).json({ error: 'ADMIN_ROLE_REQUIRED' });
    next();
  };
}

// Step-up requirement for genuinely sensitive admin actions (role/suspension/KYC changes,
// provider-key management, security configuration, revoking another admin, financial actions -
// see server/admin/routes.mjs for exactly which routes apply this). "Recent" means the admin's
// CURRENT session proved a credential (password/OIDC/legacy-exchange) within maxAgeMs - a
// session that has simply been open a long time without a fresh login does not qualify, forcing
// a real reauthentication before the action proceeds.
const DEFAULT_STEP_UP_MAX_AGE_MS = 15 * 60 * 1000;
export function requireRecentReauth(maxAgeMs = DEFAULT_STEP_UP_MAX_AGE_MS) {
  return function (req, res, next) {
    if (!isStepUpFresh(req.sessionRecord, maxAgeMs)) {
      return res.status(401).json({ error: 'STEP_UP_REQUIRED', maxAgeMs });
    }
    next();
  };
}
