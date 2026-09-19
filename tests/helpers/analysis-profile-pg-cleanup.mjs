// Cleanup for the DATABASE_URL-gated Analysis Profile PostgreSQL integration tests. Creating a user also
// writes a wallet account and a signup-credit ledger row, and neither cascades on user delete, so deleting
// only "the profile rows and the user" silently fails and leaks a user per run into the test database (16
// piled up before this helper existed). The order below is the order the foreign keys allow.
//
// Per-statement errors are swallowed on purpose - the same convention every other *-postgres-integration
// test in this repo follows - so a cleanup problem never masks the real assertion that failed; the leak
// count is easy to check afterwards: SELECT count(*) FROM users WHERE display_name LIKE 'AP%IT%'.
export async function dropAnalysisProfileTestUser(pool, userId) {
  if (!pool || !userId) return;
  const statements = [
    'DELETE FROM analysis_profile_messages WHERE user_id=$1',
    'DELETE FROM analysis_profile_sources WHERE user_id=$1',
    'DELETE FROM analysis_profile_events WHERE user_id=$1',
    'DELETE FROM analysis_profiles WHERE user_id=$1',
    'DELETE FROM wallet_reservations WHERE user_id=$1',
    'DELETE FROM wallet_ledger WHERE user_id=$1',
    'DELETE FROM wallet_accounts WHERE user_id=$1',
    'DELETE FROM users WHERE id=$1'
  ];
  for (const sql of statements) await pool.query(sql, [userId]).catch(() => {});
}
