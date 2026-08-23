#!/usr/bin/env node
// Out-of-band admin provisioning - the ONLY way an account is ever promoted to role='admin' now
// that the public-registration ADMIN_BOOTSTRAP_EMAIL auto-promotion path has been removed
// entirely (docs/auth/ADR-0001 section 3). Deliberately a standalone CLI script, never a web
// route: it can only run on a machine/operator with real access to the database connection
// string, and it requires the operator to type the target email TWICE (once as the target, once
// as an explicit --confirm= match) so a copy-pasted command against the wrong environment fails
// loudly instead of silently promoting the wrong account. It refuses to run against an account
// whose email is not yet verified - proof of email ownership must exist before this tool will
// ever consider granting admin, closing the exact "a real-looking bootstrap email is committed
// and gets auto-promoted before ownership is verified" hole this script replaces.
import { createPgRepo } from '../server/db/repo.pg.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { createPool } from '../server/db/pool.mjs';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(arg);
    if (match) out[match[1]] = match[2] === undefined ? true : match[2];
  }
  return out;
}

function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = normalizeEmail(args.email);
  const confirm = normalizeEmail(args.confirm);
  const revoke = Boolean(args.revoke);

  if (!email) {
    console.error('Usage: node scripts/admin-grant.mjs --email=<address> --confirm=<same address> [--revoke]');
    console.error('  --revoke   demote the target account back to role="user" instead of granting admin');
    process.exitCode = 1;
    return;
  }
  if (email !== confirm) {
    console.error('FATAL: --confirm must exactly repeat --email. Refusing to act on a mismatched or missing confirmation.');
    process.exitCode = 1;
    return;
  }

  const usingMemory = !process.env.DATABASE_URL;
  if (usingMemory) {
    console.warn('WARNING: DATABASE_URL is not set - this run uses a throwaway in-memory repo and grants nothing persistent. Set DATABASE_URL to act on the real database.');
  }
  const repo = usingMemory ? createMemoryRepo() : createPgRepo(createPool(process.env.DATABASE_URL));

  const creds = await repo.users.findCredentialsByEmail(email);
  if (!creds) {
    console.error(`FATAL: no account found for ${email}. This tool only promotes an EXISTING, already-registered account - it never creates one.`);
    process.exitCode = 1;
    return;
  }
  const user = await repo.users.get(creds.id);
  if (!revoke && !user.emailVerified) {
    console.error(`FATAL: ${email} has not verified their email yet. Admin cannot be granted before email ownership is proven - ask the account holder to verify first, or use the account's own verification flow.`);
    process.exitCode = 1;
    return;
  }

  const nextRole = revoke ? 'user' : 'admin';
  if (user.role === nextRole) {
    console.log(`No-op: ${email} already has role="${nextRole}".`);
    return;
  }
  await repo.users.update(user.id, { role: nextRole });
  await repo.securityEvents.record({
    userId: user.id,
    type: revoke ? 'admin_revoked_cli' : 'admin_granted_cli',
    detail: { via: 'scripts/admin-grant.mjs' }
  });
  console.log(`OK: ${email} (${user.id}) is now role="${nextRole}". Recorded in security_events. Their other active sessions were NOT automatically revoked by this script - if this account is already logged in elsewhere and you want the new role to require a fresh reauthentication everywhere, revoke its other sessions from the Admin Panel's Users tab (PATCH /api/admin/users/:id) or have the account log out and back in.`);
}

main().catch((error) => {
  console.error('FATAL:', error.message);
  process.exitCode = 1;
});
