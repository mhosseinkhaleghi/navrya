import { randomToken, sha256Hex, hashIp } from './crypto-util.mjs';
import { sessionSigningSecret } from './secrets.mjs';
import {
  serializeSessionCookie, serializeCsrfCookie, appendSetCookie, clearAuthCookies,
  readSessionCookie
} from './cookies.mjs';
import { issueCsrfToken } from './csrf.mjs';

// The one place that decides session lifetime policy. Both windows are real and independent:
// idle expiry SLIDES forward on activity (throttled - see TOUCH_THROTTLE_MS) up to the absolute
// ceiling, which never slides. A session is only ever valid while now() is before BOTH.
const IDLE_DAYS = Number(process.env.AUTH_SESSION_IDLE_DAYS || 14);
const ABSOLUTE_DAYS = Number(process.env.AUTH_SESSION_ABSOLUTE_DAYS || 90);
const IDLE_MS = IDLE_DAYS * 24 * 60 * 60 * 1000;
const ABSOLUTE_MS = ABSOLUTE_DAYS * 24 * 60 * 60 * 1000;
// last_seen_at is a write on every authenticated request if unthrottled - at real scale that is
// one UPDATE per request, which the instructions explicitly call out to amortize. Only actually
// persisted when this much wall-clock time has passed since the session's own last recorded
// last_seen_at, per the "amortize last_seen writes instead of writing on every request" requirement.
const TOUCH_THROTTLE_MS = 5 * 60 * 1000;

function clientIp(req) { return req?.ip || req?.socket?.remoteAddress || null; }

// Creates a brand-new session (fresh login, OR the rotated successor of an existing one).
// `familyId` groups every session descended from one original login via rotation, so a detected
// replay (see rotateSession below) can revoke the WHOLE family in one call, not just the one
// stolen/reused token. Returns the RAW session id (never persisted anywhere - only its hash is)
// so the caller can set it in a cookie exactly once.
export async function createSession(repo, { userId, req, familyId, reauth = true }) {
  const rawId = randomToken(32);
  const idleExpiresAt = new Date(Date.now() + IDLE_MS).toISOString();
  const absoluteExpiresAt = new Date(Date.now() + ABSOLUTE_MS).toISOString();
  const record = await repo.authSessions.create({
    userId,
    sessionHash: sha256Hex(rawId),
    familyId: familyId || randomToken(12),
    idleExpiresAt,
    absoluteExpiresAt,
    ipHash: hashIp(clientIp(req), sessionSigningSecret()),
    userAgent: req ? String(req.headers['user-agent'] || '').slice(0, 256) : null
  });
  if (!reauth) record.reauthAt = null;
  return { rawId, record };
}

// Sets both cookies (session + CSRF) for a freshly created session. Called on login/register/
// OIDC callback/session rotation - never on an ordinary authenticated request (those only read
// the existing cookie, they don't reissue it).
export function issueSessionCookies(res, rawSessionId, sessionRecordId) {
  const maxAgeSeconds = ABSOLUTE_MS / 1000;
  const csrfToken = issueCsrfToken(sessionRecordId);
  appendSetCookie(res, serializeSessionCookie(rawSessionId, { maxAgeSeconds }));
  appendSetCookie(res, serializeCsrfCookie(csrfToken, { maxAgeSeconds }));
  return csrfToken;
}

// Verifies the raw session id from the browser's cookie against the stored hash, enforces both
// expiry windows, and performs the throttled idle-slide touch. Returns null for ANY failure
// reason (missing cookie, unknown hash, revoked, expired) - callers turn null into a uniform 401,
// never distinguishing why, so a session cookie can't be used as a probing oracle.
export async function resolveSession(repo, req) {
  const rawId = readSessionCookie(req);
  if (!rawId) return null;
  return resolveSessionByRawId(repo, rawId);
}

// Same verification, given the raw session id directly rather than pulled from a cookie header -
// used by the AI gateway's internal session-introspection bridge (server/pattern-ai-server.mjs
// has no Express `req` of the Community API's own shape to read a cookie off of; it forwards the
// raw value it parsed from ITS OWN incoming request's Cookie header instead - see
// routes.internal.mjs's /session-introspect and the gateway's own cookie-parsing).
export async function resolveSessionByRawId(repo, rawId) {
  if (!rawId) return null;
  const hash = sha256Hex(rawId);
  const record = await repo.authSessions.findByHash(hash);
  if (!record || record.revokedAt) return null;
  const nowMs = Date.now();
  if (nowMs > new Date(record.idleExpiresAt).getTime()) return null;
  if (nowMs > new Date(record.absoluteExpiresAt).getTime()) return null;
  if (nowMs - new Date(record.lastSeenAt).getTime() > TOUCH_THROTTLE_MS) {
    const nextIdle = new Date(Math.min(nowMs + IDLE_MS, new Date(record.absoluteExpiresAt).getTime())).toISOString();
    await repo.authSessions.touch(record.id, { lastSeenAt: new Date(nowMs).toISOString(), idleExpiresAt: nextIdle });
  }
  return record;
}

export async function revokeCurrentSession(repo, sessionRecordId, res) {
  await repo.authSessions.revoke(sessionRecordId, 'logout');
  if (res) clearAuthCookies(res);
}
export async function revokeAllSessions(repo, userId, reason, { exceptId } = {}) {
  return repo.authSessions.revokeAllForUser(userId, reason, { exceptId });
}

// Called after a privilege-relevant change (password changed, role changed, account suspended) -
// every OTHER session for this user is force-revoked so the change takes effect immediately
// everywhere, not just on the session that triggered it.
export async function revokeOtherSessionsAfterPrivilegeChange(repo, userId, currentSessionId, reason) {
  return repo.authSessions.revokeAllForUser(userId, reason, { exceptId: currentSessionId });
}

// Session-fixation prevention + refresh-style rotation: mint a brand-new session id (same
// family, so a later-detected replay of the OLD id revokes this whole lineage), revoke the old
// one, and reissue cookies. Called after authentication level changes (login, MFA/step-up,
// reauthentication) - the pre-auth session id must never remain valid post-auth.
export async function rotateSession(repo, res, oldRecord) {
  const { rawId, record } = await createSession(repo, { userId: oldRecord.userId, familyId: oldRecord.familyId });
  await repo.authSessions.revoke(oldRecord.id, 'rotated');
  issueSessionCookies(res, rawId, record.id);
  return record;
}

export function isStepUpFresh(sessionRecord, maxAgeMs) {
  if (!sessionRecord || !sessionRecord.reauthAt) return false;
  return Date.now() - new Date(sessionRecord.reauthAt).getTime() <= maxAgeMs;
}

export { IDLE_MS, ABSOLUTE_MS, TOUCH_THROTTLE_MS };
