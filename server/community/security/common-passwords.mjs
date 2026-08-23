// A small, bundled deny-list of the most common/breached passwords, checked case-insensitively
// with punctuation/whitespace stripped. This is NOT a substitute for a live compromised-password
// database (see checkPwnedPassword() in passwords.mjs for the optional, network-based,
// fail-open HIBP k-anonymity check) - it exists so the check works with zero network dependency
// (including inside this project's own test suite, which must never make a live HTTP call).
// Sourced from long-published, non-proprietary "most common passwords" research lists (the same
// public-domain data every password-strength library ships some version of).
export const COMMON_PASSWORDS = new Set([
  '123456', '123456789', 'qwerty', 'password', '12345', '12345678', '111111', '1234567',
  'sunshine', 'qwerty123', 'iloveyou', '1q2w3e4r', '000000', 'qwertyuiop', '123123', 'zaq12wsx',
  'dragon', 'password1', 'football', 'baseball', 'welcome', 'letmein', 'monkey', 'abc123',
  'starwars', '123321', 'mustang', 'access', 'shadow', 'master', 'jennifer', 'jordan23',
  '696969', 'hunter2', 'trustno1', 'batman', 'superman', 'princess', 'flower', 'passw0rd',
  'admin123', 'charlie', 'donald', 'michael', 'freedom', 'whatever', 'qazwsx', 'michelle',
  'daniel', 'ginger', 'chelsea', 'summer', 'winter', 'jessica', 'matthew', 'andrew', 'joshua',
  'passw0rd!', 'p@ssw0rd', 'p@ssword', 'password123', 'password1!', 'iloveyou1', 'welcome123',
  'changeme', 'letmein123', '1qaz2wsx', 'qwerty12345', 'aaaaaaaa', 'zxcvbnm', 'asdfghjkl',
  'nicole', 'ashley', 'amanda', 'tigger', 'cheese', 'computer', 'internet', 'service',
  'canada', 'liverpool', 'arsenal', 'chelsea1', 'newyork', 'london123', 'trading123',
  'crypto123', 'bitcoin1', 'password!', 'passwordpassword', '12345678910', '1234567890',
  'qwerty1234', 'iloveyou123', 'admin1234', 'letmein1234', 'welcometoNAVRYA', 'navrya123'
]);

function normalize(password) {
  return String(password || '').toLowerCase().replace(/[\s._-]/g, '');
}

// The list above is written for human readability (mixed case for a couple of entries like
// 'welcometoNAVRYA') - normalize every entry once at module load so membership checks compare
// like with like, rather than requiring every literal in COMMON_PASSWORDS to already be
// pre-normalized by hand (an easy, silent way to accidentally make an entry unmatchable).
const NORMALIZED_COMMON_PASSWORDS = new Set(Array.from(COMMON_PASSWORDS, normalize));

export function isCommonPassword(password) {
  const normalized = normalize(password);
  if (NORMALIZED_COMMON_PASSWORDS.has(normalized)) return true;
  // Cheap structural checks that a static list alone would miss: all one character, or a
  // straight ascending/descending numeric or alphabetic run of the same length as the input.
  if (/^(.)\1+$/.test(normalized)) return true;
  if (isSequential(normalized)) return true;
  return false;
}

function isSequential(value) {
  if (value.length < 6) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < value.length; i += 1) {
    const diff = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (diff !== 1) ascending = false;
    if (diff !== -1) descending = false;
  }
  return ascending || descending;
}
