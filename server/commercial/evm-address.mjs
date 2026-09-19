// Dependency-free EVM/BEP-20 address validation with EIP-55 mixed-case checksum support, for the
// BSC referral payout workflow. This repository deliberately carries no ethers/web3 dependency
// (bsc-chain-client.mjs's own header comment: "needs no ethers/web3 dependency, only fetch") and a
// new production dependency risks a fresh `npm audit` advisory blocking every deploy (see
// AGENTS.md-linked HANDOFF history) - so EIP-55's one real hard part, Keccak-256, is implemented
// here directly from the public Keccak specification (the permutation, rotation offsets and round
// constants are published algorithm parameters, not any one project's copyrighted expression).
//
// Correctness strategy (see tests/referral-evm-address.test.mjs): the sponge/permutation below is
// parameterized by its padding domain byte, so the exact same code, run with the NIST SHA3 domain
// byte (0x06) instead of the original Keccak domain byte (0x01) this module actually uses,
// reproduces Node's own built-in `crypto.createHash('sha3-256')` byte-for-byte - strong, checkable
// evidence that the permutation/rotation-offsets/round-constants/sponge mechanics are correct,
// leaving only a single well-known constant (0x01 vs 0x06) as the real Ethereum-specific choice.

const MASK64 = (1n << 64n) - 1n;

// Keccak-f[1600] round constants (24 values) and rho rotation offsets (25 values, index = x + 5y).
// Public FIPS-202 / Keccak reference specification parameters - identical in every conformant
// implementation.
const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];
const ROTATION_OFFSETS = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14
];

function rotl64(x, n) {
  const shift = BigInt(n) % 64n;
  if (shift === 0n) return x & MASK64;
  return ((x << shift) | (x >> (64n - shift))) & MASK64;
}

// `state` is a 25-element array of 64-bit lanes (BigInt), mutated in place - lane(x,y) lives at
// index x + 5*y, the same convention the Keccak reference uses.
function keccakF1600(state) {
  const C = new Array(5);
  const D = new Array(5);
  const B = new Array(25);
  for (let round = 0; round < 24; round++) {
    // Theta
    for (let x = 0; x < 5; x++) C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) state[x + 5 * y] ^= D[x];
    // Rho + Pi
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const newX = y;
        const newY = (2 * x + 3 * y) % 5;
        B[newX + 5 * newY] = rotl64(state[x + 5 * y], ROTATION_OFFSETS[x + 5 * y]);
      }
    }
    // Chi
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[x + 5 * y] = (B[x + 5 * y] ^ (~B[((x + 1) % 5) + 5 * y] & B[((x + 2) % 5) + 5 * y])) & MASK64;
      }
    }
    // Iota
    state[0] = (state[0] ^ ROUND_CONSTANTS[round]) & MASK64;
  }
}

function bytesToLane(bytes, offset) {
  let lane = 0n;
  for (let i = 7; i >= 0; i--) lane = (lane << 8n) | BigInt(bytes[offset + i]);
  return lane;
}
function laneToBytes(lane, out, offset) {
  let value = lane;
  for (let i = 0; i < 8; i++) {
    out[offset + i] = Number(value & 0xffn);
    value >>= 8n;
  }
}

// pad10*1 with an explicit domain-separation byte - 0x01 for original Keccak (Ethereum's
// keccak256), 0x06 for NIST SHA3 (used only by the cross-check test). `rateBytes` = 136 for the
// 256-bit-output/512-bit-capacity parameterization both variants share.
function pad(messageBytes, rateBytes, domainByte) {
  const blockCount = Math.floor(messageBytes.length / rateBytes) + 1;
  const padded = new Uint8Array(blockCount * rateBytes);
  padded.set(messageBytes);
  padded[messageBytes.length] ^= domainByte;
  padded[padded.length - 1] ^= 0x80;
  return padded;
}

// Generic Keccak sponge, exported only for the SHA3 cross-check test - real callers use
// keccak256() below.
export function keccakSponge(messageBytes, { rateBytes = 136, outputBytes = 32, domainByte } = {}) {
  const laneCount = rateBytes / 8;
  const state = new Array(25).fill(0n);
  const padded = pad(messageBytes, rateBytes, domainByte);
  for (let offset = 0; offset < padded.length; offset += rateBytes) {
    for (let lane = 0; lane < laneCount; lane++) {
      state[lane] = (state[lane] ^ bytesToLane(padded, offset + lane * 8)) & MASK64;
    }
    keccakF1600(state);
  }
  const out = new Uint8Array(outputBytes);
  let written = 0;
  let laneIndex = 0;
  while (written < outputBytes) {
    if (laneIndex >= laneCount) { keccakF1600(state); laneIndex = 0; }
    const chunk = new Uint8Array(8);
    laneToBytes(state[laneIndex], chunk, 0);
    out.set(chunk.subarray(0, Math.min(8, outputBytes - written)), written);
    written += 8;
    laneIndex += 1;
  }
  return out;
}

export function keccak256(messageBytes) {
  return keccakSponge(messageBytes, { rateBytes: 136, outputBytes: 32, domainByte: 0x01 });
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const HEX40_LOWER = /^[0-9a-f]{40}$/;
const HEX40_ANY = /^[0-9a-fA-F]{40}$/;

// EIP-55: checksum the 40 lowercase hex characters against the keccak256 hash of THEIR OWN ASCII
// bytes (never the decoded 20 raw address bytes) - a letter is uppercased exactly when its matching
// hash nibble is >= 0x8.
export function toChecksumAddress(lowerHex40) {
  const hash = keccak256(new TextEncoder().encode(lowerHex40));
  let out = '';
  for (let i = 0; i < lowerHex40.length; i++) {
    const ch = lowerHex40[i];
    if (ch >= '0' && ch <= '9') { out += ch; continue; }
    const byte = hash[i >> 1];
    const nibble = i % 2 === 0 ? byte >> 4 : byte & 0x0f;
    out += nibble >= 8 ? ch.toUpperCase() : ch;
  }
  return '0x' + out;
}

export function isPlausibleEvmAddress(value) {
  return typeof value === 'string' && HEX40_ANY.test(value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value);
}

// Validates and normalizes a user-submitted address to its canonical EIP-55 checksum form.
// - All-lowercase or all-uppercase input: accepted, checksum computed and returned (no typo
//   protection was possible in that shape anyway).
// - Mixed-case input: MUST already match its own EIP-55 checksum, or it is rejected outright - a
//   mixed-case string that doesn't check out is exactly the class of "typo, or a wallet mis-copy"
//   EIP-55 exists to catch, and this codebase never guesses a "probably meant" address for a
//   money-moving field.
// Returns the canonical `0x` + EIP-55-checksummed 40 hex characters, or null.
export function normalizeEvmAddress(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const hasPrefix = trimmed.startsWith('0x') || trimmed.startsWith('0X');
  const hex = hasPrefix ? trimmed.slice(2) : trimmed;
  if (!HEX40_ANY.test(hex)) return null;
  const isAllLower = HEX40_LOWER.test(hex);
  const isAllUpper = /^[0-9A-F]{40}$/.test(hex);
  const checksum = toChecksumAddress(hex.toLowerCase());
  if (isAllLower || isAllUpper) return checksum;
  // Mixed case: must equal its own checksum exactly.
  return ('0x' + hex) === checksum ? checksum : null;
}

export function addressesEqual(a, b) {
  const na = normalizeEvmAddress(a);
  const nb = normalizeEvmAddress(b);
  return Boolean(na) && na === nb;
}

export function isZeroAddress(normalizedAddress) {
  return typeof normalizedAddress === 'string' && normalizedAddress.toLowerCase() === '0x' + '0'.repeat(40);
}

// `0x1234…AbCd` - customer-facing responses and admin list views never carry the full address (the
// spec's "mask it in ordinary responses"); only the dedicated step-up "reveal" admin action does.
export function maskAddress(normalizedAddress) {
  if (typeof normalizedAddress !== 'string' || normalizedAddress.length < 12) return null;
  return `${normalizedAddress.slice(0, 6)}…${normalizedAddress.slice(-4)}`;
}

export { bytesToHex };
