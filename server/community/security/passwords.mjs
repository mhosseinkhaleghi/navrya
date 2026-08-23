import { scrypt as scryptAsync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { isCommonPassword } from './common-passwords.mjs';

const scrypt = promisify(scryptAsync);

// NIST SP 800-63B-4 / OWASP ASVS 5 L2 policy: minimum 15 Unicode code points when password is
// the only factor, support long passphrases, no arbitrary composition rules, no forced periodic
// rotation. MAX_BYTES is a DoS/hashing-cost guard (applied BEFORE the expensive hash call, never
// silently truncating - an over-length password is a real 400, not a quietly-truncated hash) -
// 256 bytes comfortably covers any realistic passphrase while bounding argon2's own CPU/memory
// cost per request.
export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_BYTES = 256;

export class PasswordPolicyError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Checked BEFORE hashing (cheap) so an over-long/too-short/common password never reaches the
// expensive argon2 call at all - this is itself part of the abuse-resistance story, not just UX.
export function assertPasswordPolicy(password, { email, displayName } = {}) {
  const value = String(password || '');
  if (Buffer.byteLength(value, 'utf8') > MAX_PASSWORD_BYTES) throw new PasswordPolicyError('PASSWORD_TOO_LONG');
  if ([...value].length < MIN_PASSWORD_LENGTH) throw new PasswordPolicyError('PASSWORD_TOO_SHORT');
  if (isCommonPassword(value)) throw new PasswordPolicyError('PASSWORD_TOO_COMMON');
  const lowered = value.toLowerCase();
  if (email && lowered.includes(String(email).split('@')[0].toLowerCase()) && String(email).split('@')[0].length >= 5) {
    throw new PasswordPolicyError('PASSWORD_CONTAINS_IDENTIFIER');
  }
  if (displayName && String(displayName).length >= 5 && lowered.includes(String(displayName).toLowerCase())) {
    throw new PasswordPolicyError('PASSWORD_CONTAINS_IDENTIFIER');
  }
}

// argon2id, OWASP Password Storage Cheat Sheet's second listed acceptable configuration
// (m=19456 KiB, t=2, p=1) - chosen over the higher m=47104 option to keep single-request CPU/
// memory cost predictable under concurrent auth load on a modest instance; revisit upward once
// real capacity numbers exist (see docs/auth/CAPACITY_MODEL.md). Params are self-describing
// inside argon2's own encoded hash string, so a future retune never breaks verifying old hashes.
const ARGON2_OPTIONS = { type: 2 /* argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 };

// Lazily imported so a platform without a prebuilt argon2 binary (no native build toolchain
// available) degrades to the documented async-scrypt fallback instead of crashing the whole
// process at import time - see ADR-0001 section 4. Cached after first resolution.
let argon2Module = null;
let argon2LoadFailed = false;
async function loadArgon2() {
  if (argon2Module || argon2LoadFailed) return argon2Module;
  try {
    argon2Module = await import('argon2');
  } catch (_) {
    argon2LoadFailed = true;
    console.warn('[auth] argon2 native binding unavailable on this platform - falling back to async scrypt for password hashing. See docs/auth/ADR-0001-authentication-architecture.md section 4.'); // eslint-disable-line no-console
  }
  return argon2Module;
}

const SCRYPT_FALLBACK_N = 32768;
const SCRYPT_FALLBACK_R = 8;
const SCRYPT_FALLBACK_P = 1;
const SCRYPT_KEY_LENGTH = 64;

async function scryptHash(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEY_LENGTH, { N: SCRYPT_FALLBACK_N, r: SCRYPT_FALLBACK_R, p: SCRYPT_FALLBACK_P, maxmem: 128 * 1024 * 1024 });
  return `scryptfb$${SCRYPT_FALLBACK_N}$${SCRYPT_FALLBACK_R}$${SCRYPT_FALLBACK_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}
async function scryptVerify(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scryptfb') return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, salt, expected.length, { N: Number(nStr), r: Number(rStr), p: Number(pStr), maxmem: 128 * 1024 * 1024 });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// Async end to end (Node's event loop is never blocked by a single request's hash/verify,
// unlike the previous synchronous scryptSync call) - this is itself a DoS-resistance property
// under concurrent auth load, not just a style preference.
export async function hashPassword(password) {
  const argon2 = await loadArgon2();
  if (argon2) return argon2.hash(String(password), ARGON2_OPTIONS);
  return scryptHash(String(password));
}

export async function verifyPassword(password, stored) {
  if (!stored) return false;
  if (String(stored).startsWith('scryptfb$')) return scryptVerify(String(password), stored);
  if (String(stored).startsWith('scrypt$')) return legacyScryptVerify(String(password), stored); // pre-existing hashes from before this change
  const argon2 = await loadArgon2();
  if (!argon2) throw new Error('ARGON2_UNAVAILABLE_FOR_VERIFY');
  try {
    return await argon2.verify(stored, String(password));
  } catch (_) {
    return false;
  }
}

// Verifies a hash produced by the OLD synchronous scryptSync scheme this change replaces
// (server/community/auth-tokens.mjs's original hashPassword, N=16384 r=8 p=1) so existing
// accounts are not locked out. A successful legacy verify should be followed by re-hashing the
// password under the new scheme (see routes.auth.mjs's login handler) - this function only
// verifies, it never re-hashes itself, to keep this module's own responsibility narrow.
async function legacyScryptVerify(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, salt, expected.length, { N: Number(nStr), r: Number(rStr), p: Number(pStr), maxmem: 128 * 1024 * 1024 });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
export function isLegacyHash(stored) {
  return String(stored || '').startsWith('scrypt$');
}

// Optional, network-based, k-anonymity compromised-password check (Have I Been Pwned's range
// API - only the first 5 hex characters of the SHA-1 hash ever leave this process, the password
// itself never does). Off by default (HIBP_CHECK_ENABLED must be 'true') and ALWAYS fail-open:
// a network error, timeout, or non-200 response must never block a real signup because a
// third-party service hiccuped. Never called from tests (no live network calls in this suite);
// callers should treat a `false` result as "not flagged", not "confirmed safe".
export async function checkPwnedPassword(password, { timeoutMs = 1500 } = {}) {
  if (process.env.HIBP_CHECK_ENABLED !== 'true') return false;
  try {
    const sha1 = createHash('sha1').update(String(password)).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return false;
    const text = await response.text();
    return text.split('\n').some((line) => line.trim().toUpperCase().startsWith(`${suffix}:`));
  } catch (_) {
    return false; // fail-open, by design - see doc comment above
  }
}
