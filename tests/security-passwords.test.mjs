import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, assertPasswordPolicy, PasswordPolicyError, MIN_PASSWORD_LENGTH, MAX_PASSWORD_BYTES } from '../server/community/security/passwords.mjs';
import { isCommonPassword } from '../server/community/security/common-passwords.mjs';

test('hashPassword produces an argon2id-tagged hash and verifyPassword accepts the correct password', async () => {
  const hash = await hashPassword('a genuinely long passphrase 1234');
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword('a genuinely long passphrase 1234', hash), true);
});

test('verifyPassword rejects a wrong password against a real hash', async () => {
  const hash = await hashPassword('a genuinely long passphrase 1234');
  assert.equal(await verifyPassword('totally the wrong passphrase 5678', hash), false);
});

test('verifyPassword rejects gracefully on garbage stored hash input instead of throwing', async () => {
  assert.equal(await verifyPassword('anything', 'not-a-real-hash'), false);
  assert.equal(await verifyPassword('anything', null), false);
});

test('assertPasswordPolicy enforces the 15-character NIST minimum, not a legacy 4-character minimum', () => {
  assert.throws(() => assertPasswordPolicy('short12345678'), PasswordPolicyError);
  assert.doesNotThrow(() => assertPasswordPolicy('a fifteen char pw!'));
  assert.equal(MIN_PASSWORD_LENGTH, 15);
});

test('assertPasswordPolicy rejects a password longer than the byte cap BEFORE any hashing cost is spent', () => {
  const huge = 'a'.repeat(MAX_PASSWORD_BYTES + 1);
  assert.throws(() => assertPasswordPolicy(huge), (error) => error.code === 'PASSWORD_TOO_LONG');
});

test('assertPasswordPolicy blocks common/breached passwords even when they meet the length minimum', () => {
  assert.throws(() => assertPasswordPolicy('passwordpassword'), (error) => error.code === 'PASSWORD_TOO_COMMON');
  assert.throws(() => assertPasswordPolicy('welcometoNAVRYA'), (error) => error.code === 'PASSWORD_TOO_COMMON');
});

test('assertPasswordPolicy blocks a password that embeds the account email or display name', () => {
  assert.throws(
    () => assertPasswordPolicy('mhosseinkhaleghi-secret', { email: 'mhosseinkhaleghi@example.com' }),
    (error) => error.code === 'PASSWORD_CONTAINS_IDENTIFIER'
  );
  assert.throws(
    () => assertPasswordPolicy('TraderJoeAccount1', { displayName: 'TraderJoe' }),
    (error) => error.code === 'PASSWORD_CONTAINS_IDENTIFIER'
  );
});

test('assertPasswordPolicy allows a long, non-common passphrase unrelated to the identifiers - no arbitrary composition rules', () => {
  assert.doesNotThrow(() => assertPasswordPolicy('correct horse battery staple wagon', { email: 'someone@example.com', displayName: 'Trader' }));
});

test('isCommonPassword flags all-same-character and sequential runs even if not in the static list', () => {
  assert.equal(isCommonPassword('aaaaaaaaaaaaaaa'), true);
  assert.equal(isCommonPassword('abcdefghijklmno'), true);
  assert.equal(isCommonPassword('correct horse battery staple wagon'), false);
});

test('a pre-existing legacy synchronous-scrypt hash (the format this change replaces) is still verifiable', async () => {
  // Mirrors the exact format server/community/auth-tokens.mjs's original hashPassword produced
  // (scrypt$N$r$p$saltHex$hashHex, N=16384 r=8 p=1) - existing accounts must not be locked out.
  const { scryptSync, randomBytes } = await import('node:crypto');
  const salt = randomBytes(16);
  const hash = scryptSync('an existing legacy password', salt, 64, { N: 16384, r: 8, p: 1 });
  const legacyStored = `scrypt$16384$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
  assert.equal(await verifyPassword('an existing legacy password', legacyStored), true);
  assert.equal(await verifyPassword('wrong password entirely', legacyStored), false);
});
