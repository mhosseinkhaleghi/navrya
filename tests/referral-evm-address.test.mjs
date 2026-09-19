import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  keccakSponge, keccak256, toChecksumAddress, normalizeEvmAddress, addressesEqual, isZeroAddress, maskAddress, bytesToHex
} from '../server/commercial/evm-address.mjs';

// --- correctness of the hand-written Keccak-f[1600] permutation/sponge --------------------------
// The permutation, rotation offsets and round constants are IDENTICAL between NIST SHA3-256 and
// the original Keccak-256 Ethereum uses - the two variants differ ONLY in one padding domain byte
// (0x06 for SHA3, 0x01 for Keccak). Running this module's own generic sponge with the SHA3 domain
// byte and comparing it to Node's own built-in, OpenSSL-backed `sha3-256` is therefore a strong,
// independently-checkable proof that the permutation itself (theta/rho/pi/chi/iota, the 24 round
// constants, the 25 rotation offsets) is correct - only the one-byte domain separator is
// Keccak-specific from there, and that is trivial to get right.
function sha3_256(bytes) { return keccakSponge(bytes, { rateBytes: 136, outputBytes: 32, domainByte: 0x06 }); }
function nodeSha3(text) { return createHash('sha3-256').update(text).digest('hex'); }

test('the hand-written sponge matches Node\'s native SHA3-256 for the empty string (proves the permutation)', () => {
  assert.equal(bytesToHex(sha3_256(new Uint8Array(0))), nodeSha3(''));
});
test('the hand-written sponge matches Node\'s native SHA3-256 for "abc" (proves single-block absorption)', () => {
  assert.equal(bytesToHex(sha3_256(new TextEncoder().encode('abc'))), nodeSha3('abc'));
});
test('the hand-written sponge matches Node\'s native SHA3-256 for a message spanning multiple 136-byte blocks', () => {
  const long = 'The quick brown fox jumps over the lazy dog. '.repeat(20); // well over 136 bytes
  assert.equal(bytesToHex(sha3_256(new TextEncoder().encode(long))), nodeSha3(long));
});
test('the hand-written sponge matches Node\'s native SHA3-256 exactly at the rate-boundary edge case (135, 136, 137 bytes)', () => {
  for (const len of [135, 136, 137, 272]) {
    const bytes = new Uint8Array(len).fill(0x61); // 'a' repeated
    const text = 'a'.repeat(len);
    assert.equal(bytesToHex(sha3_256(bytes)), nodeSha3(text), `mismatch at length ${len}`);
  }
});

// --- the real Ethereum keccak256 (0x01 domain byte) - a well-known, widely published constant ----
test('keccak256("") matches the well-known Ethereum constant', () => {
  assert.equal(bytesToHex(keccak256(new Uint8Array(0))), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
});
test('keccak256 of the empty string differs from SHA3-256 of the empty string (proves the domain byte is actually used)', () => {
  assert.notEqual(bytesToHex(keccak256(new Uint8Array(0))), bytesToHex(sha3_256(new Uint8Array(0))));
});

// --- EIP-55 checksum encoding ---------------------------------------------------------------------
// Official EIP-55 test vectors (https://eips.ethereum.org/EIPS/eip-55) - a correct keccak256 plus a
// correct checksum-casing rule must reproduce every one of these exactly.
const EIP55_VECTORS = [
  '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
  '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
  '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb'
];
test('toChecksumAddress reproduces every official EIP-55 test vector from its lowercase form', () => {
  for (const expected of EIP55_VECTORS) {
    const lower = expected.slice(2).toLowerCase();
    assert.equal(toChecksumAddress(lower), expected, `checksum mismatch for ${expected}`);
  }
});
test('normalizeEvmAddress accepts an all-lowercase or all-uppercase address and returns the checksum form', () => {
  for (const expected of EIP55_VECTORS) {
    assert.equal(normalizeEvmAddress(expected.toLowerCase()), expected);
    assert.equal(normalizeEvmAddress(expected.toUpperCase().replace('0X', '0x')), expected);
  }
});
test('normalizeEvmAddress accepts a correctly-cased mixed address unchanged', () => {
  for (const expected of EIP55_VECTORS) assert.equal(normalizeEvmAddress(expected), expected);
});
test('normalizeEvmAddress REJECTS a mixed-case address whose checksum does not match (a typo/mis-copy)', () => {
  const corrupted = EIP55_VECTORS[0].slice(0, -1) + (EIP55_VECTORS[0].slice(-1) === 'd' ? 'D' : 'd');
  assert.notEqual(corrupted, EIP55_VECTORS[0]);
  assert.equal(normalizeEvmAddress(corrupted), null);
});
test('normalizeEvmAddress rejects malformed shapes', () => {
  assert.equal(normalizeEvmAddress('not an address'), null);
  assert.equal(normalizeEvmAddress('0x123'), null);
  assert.equal(normalizeEvmAddress(EIP55_VECTORS[0] + 'ff'), null);
  assert.equal(normalizeEvmAddress(null), null);
  assert.equal(normalizeEvmAddress(undefined), null);
  assert.equal(normalizeEvmAddress(123), null);
});
test('normalizeEvmAddress tolerates surrounding whitespace and a missing 0x prefix', () => {
  assert.equal(normalizeEvmAddress('  ' + EIP55_VECTORS[0] + '  '), EIP55_VECTORS[0]);
  assert.equal(normalizeEvmAddress(EIP55_VECTORS[0].slice(2).toLowerCase()), EIP55_VECTORS[0]);
});

test('addressesEqual compares by normalized checksum, independent of the input casing', () => {
  assert.equal(addressesEqual(EIP55_VECTORS[0], EIP55_VECTORS[0].toLowerCase()), true);
  assert.equal(addressesEqual(EIP55_VECTORS[0], EIP55_VECTORS[1]), false);
  assert.equal(addressesEqual('garbage', EIP55_VECTORS[0]), false);
});
test('isZeroAddress recognizes only the all-zero address', () => {
  assert.equal(isZeroAddress(normalizeEvmAddress('0x' + '0'.repeat(40))), true);
  assert.equal(isZeroAddress(EIP55_VECTORS[0]), false);
});
test('maskAddress shows only the first 6 and last 4 characters, never the full recipient', () => {
  const masked = maskAddress(EIP55_VECTORS[0]);
  assert.equal(masked, '0x5aAe…eAed');
  assert.ok(!masked.includes(EIP55_VECTORS[0].slice(10, -6)), 'the masked middle must not leak');
});
