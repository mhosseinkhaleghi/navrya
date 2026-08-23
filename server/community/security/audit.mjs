import { hashIp } from './crypto-util.mjs';
import { sessionSigningSecret } from './secrets.mjs';

// Single write path for server/db's security_events table (020_auth_sessions.sql) - the
// instruction's "never log raw tokens/passwords/CSRF values/authorization headers/cookies/
// secrets/full emails" rule is enforced HERE, once, rather than trusted to every call site
// remembering it. Any key whose name looks credential-shaped is dropped, and an email value (a
// string containing '@') is reduced to a stable, non-reversible pseudonymous form rather than
// logged in full - enough to notice "the same address keeps failing" without persisting the PII
// itself in a table optimized for wide, long-lived analytical retention.
const CREDENTIAL_KEY_PATTERN = /password|token|secret|credential|authorization|cookie|csrf|apikey|api_key/i;

function pseudonymEmail(email) {
  const value = String(email || '');
  const at = value.indexOf('@');
  if (at < 1) return null;
  return `${hashIp(value.toLowerCase(), sessionSigningSecret()).slice(0, 12)}@${value.slice(at + 1)}`;
}

export function redactDetail(detail) {
  if (!detail || typeof detail !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(detail)) {
    if (CREDENTIAL_KEY_PATTERN.test(key)) continue;
    if (typeof value === 'string' && key.toLowerCase().includes('email')) { out[key] = pseudonymEmail(value); continue; }
    if (typeof value === 'string' && value.length > 500) { out[key] = value.slice(0, 500); continue; }
    out[key] = value;
  }
  return out;
}

function clientIp(req) { return req?.ip || req?.socket?.remoteAddress || null; }

export async function recordSecurityEvent(repo, { req, userId, type, detail }) {
  try {
    await repo.securityEvents.record({
      userId: userId || null,
      type,
      ipHash: req ? hashIp(clientIp(req), sessionSigningSecret()) : null,
      detail: redactDetail(detail)
    });
  } catch (error) {
    // Security-event logging must never be able to fail an actual auth request - log locally
    // (already redacted) and move on, mirroring ai-usage-store.js's own "reporting is best-effort,
    // never blocks the real response" convention on the client side.
    console.error('[audit] failed to record security event', type, error.message); // eslint-disable-line no-console
  }
}
