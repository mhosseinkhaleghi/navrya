import { signToken, resolveAuthSecret } from '../../server/community/auth-tokens.mjs';

// Mints a session token for a given user id, signed with the same (possibly ephemeral,
// process-cached) secret server/community/auth-real.mjs verifies against - see
// resolveAuthSecret()'s comment. Test files that used to send a raw user id as the
// x-dev-user-id header now send testToken(id) instead; nothing else about the header changes.
export function testToken(userId) {
  return signToken(userId, resolveAuthSecret());
}
