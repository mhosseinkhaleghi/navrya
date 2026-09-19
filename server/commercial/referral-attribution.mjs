// Referral attribution: the signed attribution cookie, click recording, and the claim made when a GENUINELY NEW account is
// created. The three registration paths (email, Google new user, OIDC new identity) call claimReferralAttributionSafe() right
// after `repo.users.create()`; nothing else ever does - never on login, never on an identity collision, never for a returning
// user. It can never fail an account creation (it swallows and logs), and it is idempotent (referred_user_id is UNIQUE).
//
// Privacy: the referrer never learns anything about the referred user here - the funnel is aggregate counts only. Network
// signals (IP / user-agent) are stored as keyed HMACs, used ONLY as review signals for an admin - never an automatic ban.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { hashIp, hmacHex } from '../community/security/crypto-util.mjs';
import { sessionSigningSecret } from '../community/security/secrets.mjs';
import { readReferralCookie, clearReferralCookie } from '../community/security/cookies.mjs';
import { normalizeReferralCode } from './referral-rules.mjs';
import { resolveReferralTerms, attributionSnapshotFor } from './referral-programs.mjs';

// An account counts as "genuinely new" only for a short window after it was created - the claim runs inside the very request
// that created it, so this is generous; it exists so a stray future caller could never attach a referral to an old account.
export const NEW_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;
// A fingerprint shared by this many EARLIER signups of the same referrer flags the next one for review.
export const DUPLICATE_FINGERPRINT_THRESHOLD = 2;
const COOKIE_VERSION = 'v1';

// Domain-separated key derived from the existing signing secret - the cookie can never be confused with, or replayed as,
// any other token signed with AUTH_TOKEN_SECRET.
function cookieKey() { return createHmac('sha256', sessionSigningSecret()).update('navrya-referral-attribution-cookie-v1').digest(); }
const b64u = (buffer) => Buffer.from(buffer).toString('base64url');

export function signReferralCookie({ publicCode, ttlSeconds, nowMs = Date.now() }) {
  const payload = b64u(JSON.stringify({ c: publicCode, i: Math.floor(nowMs / 1000), e: Math.floor(nowMs / 1000) + ttlSeconds }));
  const signature = b64u(createHmac('sha256', cookieKey()).update(`${COOKIE_VERSION}.${payload}`).digest());
  return `${COOKIE_VERSION}.${payload}.${signature}`;
}

// Returns { publicCode, issuedAt, expiresAt } for a valid, unexpired, correctly-signed token - otherwise null. Constant-time compare.
export function verifyReferralCookie(token, nowMs = Date.now()) {
  if (typeof token !== 'string' || token.length > 400) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== COOKIE_VERSION) return null;
  const expected = createHmac('sha256', cookieKey()).update(`${parts[0]}.${parts[1]}`).digest();
  let given;
  try { given = Buffer.from(parts[2], 'base64url'); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || typeof payload.c !== 'string' || !Number.isFinite(payload.e) || !Number.isFinite(payload.i)) return null;
  if (payload.e * 1000 <= nowMs || payload.i * 1000 > nowMs + 60000) return null;
  const publicCode = normalizeReferralCode(payload.c);
  return publicCode ? { publicCode, issuedAt: payload.i, expiresAt: payload.e } : null;
}

function clientIp(req) { return (req && (req.ip || (req.socket && req.socket.remoteAddress))) || null; }
function userAgent(req) { return String((req && req.headers && req.headers['user-agent']) || '').slice(0, 256); }
// Same hash the session store uses for auth_sessions.ip_hash, so a referrer's own sessions can be compared with a signup's.
export function ipHashOf(req) { return hashIp(clientIp(req), sessionSigningSecret()); }
export function uaHashOf(req) { const ua = userAgent(req); return ua ? hmacHex('referral-ua:' + ua, sessionSigningSecret()) : null; }
// A pseudonymous visitor id for unique-click counting: never the IP or user agent themselves.
export function visitorHashOf(req) { return hmacHex('referral-visitor:' + (clientIp(req) || '') + '|' + userAgent(req), sessionSigningSecret()); }

// ---------------------------------------------------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------------------------------------------------
async function reject(repo, { userId, codeId, reason }) {
  await repo.referral.logAttempt({ referredUserId: userId, codeId: codeId || null, outcome: 'rejected', reason });
  return { claimed: false, reason };
}

export async function claimReferralAttribution(repo, { req, res, userId, nowMs = Date.now() }) {
  const token = readReferralCookie(req);
  if (!token) return { claimed: false, reason: 'NO_COOKIE' };
  // One shot: the cookie is consumed whatever the outcome, so it can never be replayed for a second account.
  if (res) clearReferralCookie(res);
  const payload = verifyReferralCookie(token, nowMs);
  if (!payload) return { claimed: false, reason: 'INVALID_COOKIE' };
  const code = await repo.referral.getCodeByPublicCode(payload.publicCode);
  if (!code || code.status !== 'active') return reject(repo, { userId, codeId: code && code.id, reason: 'CODE_INVALID' });

  const user = await repo.users.get(userId);
  if (!user) return { claimed: false, reason: 'USER_NOT_FOUND' };
  // Only a genuinely NEW account, never an existing one (the callers already only invoke this for a freshly created row).
  if (nowMs - Date.parse(user.createdAt) > NEW_ACCOUNT_WINDOW_MS) return reject(repo, { userId, codeId: code.id, reason: 'NOT_NEW_ACCOUNT' });
  if (code.userId === userId) return reject(repo, { userId, codeId: code.id, reason: 'SELF_REFERRAL' });
  const referrer = await repo.users.get(code.userId);
  if (!referrer || referrer.suspendedAt) return reject(repo, { userId, codeId: code.id, reason: 'REFERRER_UNAVAILABLE' });
  if (referrer.email && user.email && referrer.email.trim().toLowerCase() === user.email.trim().toLowerCase()) return reject(repo, { userId, codeId: code.id, reason: 'SELF_REFERRAL' });
  if (await repo.referral.getAttributionByReferred(userId)) return reject(repo, { userId, codeId: code.id, reason: 'ALREADY_ATTRIBUTED' });
  // An existing commercial customer can never be attributed (they already paid without this referral).
  if (await repo.referral.userHasConfirmedPayment(userId)) return reject(repo, { userId, codeId: code.id, reason: 'EXISTING_CUSTOMER' });

  const terms = await resolveReferralTerms(repo, code.userId);
  if (!terms.canAttribute) return reject(repo, { userId, codeId: code.id, reason: 'REFERRER_NOT_ELIGIBLE' });

  // Risk SIGNALS for an admin to review - never a ban, and the attribution is still recorded.
  const ipHash = ipHashOf(req);
  const uaHash = uaHashOf(req);
  const signals = await repo.referral.signalsForClaim({ referrerUserId: code.userId, ipHash, uaHash });
  const riskFlags = [];
  if (signals.referrerIpMatch) riskFlags.push('REFERRER_IP_MATCH');
  if (signals.duplicateFingerprintCount >= DUPLICATE_FINGERPRINT_THRESHOLD) riskFlags.push('DUPLICATE_SIGNUP_FINGERPRINT');

  const attributedAt = new Date(nowMs).toISOString();
  const result = await repo.referral.claimAttribution({
    referredUserId: userId, referrerUserId: code.userId, codeId: code.id, ...attributionSnapshotFor(terms, { attributedAt }),
    riskFlags, riskReviewStatus: riskFlags.length ? 'flagged' : 'none', signupIpHash: ipHash, signupUaHash: uaHash
  });
  if (!result.ok) return reject(repo, { userId, codeId: code.id, reason: result.reason });
  await repo.referral.logAttempt({ referredUserId: userId, codeId: code.id, outcome: 'attributed', reason: riskFlags.length ? riskFlags.join(',') : null });
  return { claimed: true, attributionId: result.attribution.id, riskFlags };
}

// The only entry point the registration routes use: it can NEVER throw, so a referral problem can never prevent, delay or
// roll back an account creation. Failures are logged (no PII) and simply mean "no attribution".
export async function claimReferralAttributionSafe(repo, args) {
  try {
    return await claimReferralAttribution(repo, args);
  } catch (error) {
    try { console.error('[referral] attribution claim failed - account creation is unaffected:', (error && (error.code || error.message)) || 'unknown'); } catch { /* logging must not throw either */ }
    return { claimed: false, reason: 'ERROR' };
  }
}
