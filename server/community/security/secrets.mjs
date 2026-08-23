import { randomBytes } from 'node:crypto';

// Centralizes the "required secret" pattern used by every signing/encryption key this module
// family needs (session-cookie HMAC salt for csrf binding, CSRF secret, at-rest encryption key
// for TOTP secrets). Mirrors auth-tokens.mjs's existing resolveAuthSecret() convention (loud
// warning + ephemeral in-memory secret when unset) for NON-production, but - unlike that
// pre-existing function - REFUSES to start at all under NODE_ENV=production, per the
// instruction that production must fail closed on missing signing/encryption configuration
// rather than silently degrade to a per-process ephemeral secret (which would make every
// session/CSRF token invalid on every restart/redeploy in a horizontally scaled fleet, and
// worse, would let two replicas disagree on the secret entirely).
const cache = new Map();

export function requireSecret(envVar, { minLength = 32 } = {}) {
  if (cache.has(envVar)) return cache.get(envVar);
  const value = process.env[envVar];
  if (value && value.length >= minLength) {
    cache.set(envVar, value);
    return value;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`FATAL: ${envVar} must be set (>= ${minLength} chars) in production. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
  }
  const ephemeral = randomBytes(32).toString('hex');
  console.warn(`[auth] ${envVar} is not set - using a temporary in-memory value for local development only. Every session/token signed with it is invalidated on restart, and it will refuse to start this way in production. Set ${envVar} in .env.`); // eslint-disable-line no-console
  cache.set(envVar, ephemeral);
  return ephemeral;
}

export function sessionSigningSecret() { return requireSecret('AUTH_TOKEN_SECRET'); }
export function csrfSecret() { return requireSecret('CSRF_SECRET'); }
export function encryptionKeyHex() { return requireSecret('ENCRYPTION_KEY', { minLength: 64 }); } // 32 bytes hex = 64 chars

// Test-only escape hatch: tests intentionally exercise multiple "processes" in one node process
// (e.g. spinning up two createApp() instances to represent two API replicas) and need a clean
// cache between fixtures that set/unset env vars. Never called from production code paths.
export function __resetSecretCacheForTests() { cache.clear(); }
