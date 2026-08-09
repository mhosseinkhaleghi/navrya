import { scryptSync, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

// Password hashing (scrypt via node:crypto - no bcrypt/argon2 dependency, matches this
// project's near-zero-dependency style). Params are embedded in the stored string itself
// (scrypt$N$r$p$saltHex$hashHex), like bcrypt embeds its own cost factor, so a future bump to
// N/r/p never breaks verification of hashes issued under the old params.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(password), salt, expected.length, { N: Number(nStr), r: Number(rStr), p: Number(pStr) });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// Session tokens: a minimal hand-rolled HMAC-SHA256-signed token (base64url(payload) + '.' +
// base64url(signature)) rather than adding the `jsonwebtoken` package - deliberately has no
// algorithm field to parse or dispatch on, so the classic JWT "alg:none"/algorithm-confusion
// bug class is structurally impossible here, not just guarded against.
function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlToBuffer(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

const DEFAULT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, no refresh token in v1

// Mirrors community-api-server.mjs's own DATABASE_URL-unset fallback convention: never refuse
// to start, degrade loudly instead. Cached per process so every signToken()/verifyToken() call
// in this process (including test files importing this function directly to mint matching
// tokens) agrees on the same secret - just not a stable one across restarts until
// AUTH_TOKEN_SECRET is actually set.
let cachedSecret = null;
export function resolveAuthSecret() {
  if (cachedSecret) return cachedSecret;
  if (process.env.AUTH_TOKEN_SECRET) {
    cachedSecret = process.env.AUTH_TOKEN_SECRET;
    return cachedSecret;
  }
  cachedSecret = randomBytes(32).toString('hex');
  console.warn('[auth] No AUTH_TOKEN_SECRET set: using a temporary in-memory secret. Every session is invalidated on restart. Set AUTH_TOKEN_SECRET (see .env.example) for stable sessions.');
  return cachedSecret;
}

function sign(payloadBuffer, secret) {
  return createHmac('sha256', secret).update(payloadBuffer).digest();
}

export function signToken(userId, secret, ttlMs = DEFAULT_TOKEN_TTL_MS) {
  const payload = base64url(Buffer.from(JSON.stringify({ sub: userId, iat: Date.now(), exp: Date.now() + ttlMs })));
  const signature = base64url(sign(Buffer.from(payload), secret));
  return `${payload}.${signature}`;
}

// Returns the decoded claims on success, or null on any failure (missing/malformed/expired/bad
// signature) - callers turn a null into a 401, never see why, so a token can't be used as an
// oracle for "index existed but signature failed" vs "totally malformed".
export function verifyToken(token, secret) {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expectedSignature = base64url(sign(Buffer.from(payload), secret));
  const actual = base64urlToBuffer(signature);
  const expected = base64urlToBuffer(expectedSignature);
  // timingSafeEqual throws (not returns false) on a length mismatch - guard explicitly rather
  // than let a malformed/truncated signature take down the request with an uncaught exception.
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let claims;
  try {
    claims = JSON.parse(base64urlToBuffer(payload).toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!claims || typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
  if (Date.now() > claims.exp) return null;
  return claims;
}
