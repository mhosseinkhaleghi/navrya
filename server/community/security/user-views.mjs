// Explicit, allowlist-based serializers between the repo's full user record (`mapUser()` in
// repo.pg.mjs/repo.memory.mjs - id/displayName/avatarUrl/bio/role/suspendedAt/email/
// emailVerified/phone/phoneVerified/profileRole/kycStatus/xpTotal/avatarDataUrl/createdAt) and
// what actually gets serialized to an HTTP response. The repo layer is intentionally left
// returning the full shape (many internal call sites need all of it); this module is the ONE
// place that decides what a public viewer, the account owner, and an admin each get to see.
// Never spread/passthrough a raw repo record directly into a response - always route it through
// one of these three.

export function publicUserView(user) {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl || null,
    avatarDataUrl: user.avatarDataUrl || null,
    bio: user.bio || null,
    profileRole: user.profileRole || 'trader',
    createdAt: user.createdAt
  };
}

export function publicUserViewList(users) {
  return (users || []).map(publicUserView);
}

// The account owner sees their own security-relevant fields (email, verification, KYC status,
// their own authorization role, suspension) - none of that is private FROM them, it's private
// from everyone else. Still never includes password_hash/google_id/totp_secret_enc (those never
// exist on the repo's mapped record in the first place - see 013_real_auth.sql's own comment -
// so there is nothing to accidentally forget to strip here).
export function selfUserView(user) {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl || null,
    avatarDataUrl: user.avatarDataUrl || null,
    bio: user.bio || null,
    role: user.role,
    suspendedAt: user.suspendedAt || null,
    email: user.email || null,
    emailVerified: Boolean(user.emailVerified),
    phone: user.phone || null,
    phoneVerified: Boolean(user.phoneVerified),
    profileRole: user.profileRole || 'trader',
    kycStatus: user.kycStatus || 'not_started',
    xpTotal: user.xpTotal || 0,
    totpEnabled: Boolean(user.totpEnabledAt),
    createdAt: user.createdAt
  };
}

// Admin sees the same fields self does (this IS the admin surface for user management) - kept
// as its own explicit function, not an alias, so admin-only additions never accidentally also
// appear in selfUserView.
export function adminUserView(user) {
  if (!user) return null;
  return { ...selfUserView(user) };
}
