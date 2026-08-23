import { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';

// Shared low-level primitives every other security/*.mjs module builds on. Nothing here decides
// policy (session length, cookie flags, password rules) - this is only "generate a random opaque
// token" / "hash it for storage" / "HMAC-sign a value" / "encrypt a small secret at rest",
// each using node:crypto directly (no hand-rolled algorithm), per the instruction not to
// hand-roll cryptographic primitives when a maintained implementation exists.

// Opaque bearer values (session ids, reset/verification tokens, CSRF secrets): 256 bits of
// entropy, base64url so they're cookie/URL-safe with no padding to strip.
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

// One-way, for storing an opaque token server-side (a session id, a reset link's token) so the
// database never holds the actual bearer value - mirrors "never store a password plaintext"
// applied to session/reset tokens too. Not a password hash (no per-token salt/cost needed - the
// token itself already has 256 bits of uniformly random entropy, unlike a human-chosen password).
export function sha256Hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function hmacHex(value, secret) {
  return createHmac('sha256', secret).update(String(value)).digest('hex');
}

export function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(String(a || ''), 'hex');
  const bufB = Buffer.from(String(b || ''), 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Salted hash of a client IP for security_events/auth_sessions.ip_hash - enough to correlate
// "same origin repeated this" for abuse detection/session listing, without persisting the raw
// IP (a real PII minimization concern once this scales to millions of rows). Salt is process-wide
// (from the same signing secret every other HMAC in this module family uses), not per-row -
// this is a correlation aid, not a security boundary, so a stable salt is fine and lets an
// operator correlate two rows without re-deriving anything.
export function hashIp(ip, secret) {
  if (!ip) return null;
  return hmacHex(`ip:${ip}`, secret);
}

// AES-256-GCM, versioned key id embedded in the ciphertext envelope (`v1:<ivHex>:<tagHex>:<ctHex>`)
// so a future key rotation can decrypt old rows under the old key while encrypting new rows under
// a new one, without a data migration. Used only for the optional self-hosted TOTP secret column
// (users.totp_secret_enc) - there is no other server-side secret this app needs to encrypt at
// rest today (BYO AI keys are explicitly client-only by design; provider keys in admin_ai_keys
// are a separate, already-documented plaintext-at-rest tradeoff, Section 7.16).
const ENC_VERSION = 'v1';
export function encryptSecret(plaintext, keyHex) {
  if (!keyHex) throw new Error('ENCRYPTION_KEY_MISSING');
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY_INVALID_LENGTH');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}
export function decryptSecret(envelope, keyHex) {
  const parts = String(envelope || '').split(':');
  if (parts.length !== 4 || parts[0] !== ENC_VERSION) throw new Error('ENCRYPTED_SECRET_MALFORMED');
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const ct = Buffer.from(parts[3], 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
