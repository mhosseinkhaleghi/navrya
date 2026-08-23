import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './pool.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, 'migrations');

// A fixed, arbitrary 64-bit key for pg_advisory_lock - shared by every process that might ever
// run this script (a local dev machine, a CI job, a deploy's preDeployCommand) so two concurrent
// migration runs against the SAME database serialize against each other instead of racing to
// apply the same new migration twice. Postgres releases an advisory lock automatically if the
// holding session disconnects, so a crashed migrator never leaves the lock stuck forever.
const ADVISORY_LOCK_KEY = 875_309_042_017n;

// Migrations whose SQL cannot run inside a transaction block (most notably
// `CREATE INDEX CONCURRENTLY`) are named with a `.concurrent.sql` suffix instead of the usual
// `.sql` - this script recognizes that convention and runs their statements outside BEGIN/COMMIT,
// one at a time. No migration in this repo needs this yet; the mechanism is documented here for
// the first one that does, per the instruction to provide "a documented mechanism for
// non-transactional online operations".
export function isConcurrentMigration(filename) {
  return filename.endsWith('.concurrent.sql');
}

export function checksumOf(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

export async function run() {
  const pool = createPool(process.env.DATABASE_URL);
  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock($1::bigint)`, [ADVISORY_LOCK_KEY.toString()]);
    try {
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
      // Additive: a pre-existing schema_migrations table from before this checksum feature
      // existed gets the column added, with NULL for every row already in it - those rows are
      // treated as "no checksum on record" below (skip verification, never treated as a mismatch),
      // so upgrading an existing database never fails or requires a manual backfill.
      await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT');

      const { rows: appliedRows } = await client.query('SELECT id, checksum FROM schema_migrations');
      const applied = new Map(appliedRows.map((row) => [row.id, row.checksum]));

      const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
      for (const file of files) {
        const sql = await readFile(path.join(migrationsDir, file), 'utf8');
        const checksum = checksumOf(sql);

        if (applied.has(file)) {
          const storedChecksum = applied.get(file);
          if (storedChecksum && storedChecksum !== checksum) {
            // A migration that was already applied must never be edited after the fact (the
            // instruction's "never modify or destructively reinterpret an applied migration") -
            // this is the real enforcement of that rule, not just a comment asking nicely.
            throw new Error(
              `FATAL: migration ${file} was already applied with checksum ${storedChecksum.slice(0, 12)}... but the file on disk now hashes to ${checksum.slice(0, 12)}... ` +
              `Applied migrations must never be edited - add a new migration file instead of changing this one.`
            );
          }
          console.log(`skip ${file} (already applied${storedChecksum ? '' : ', no recorded checksum to verify against'})`);
          continue;
        }

        if (isConcurrentMigration(file)) {
          console.log(`applying ${file} (non-transactional - contains a CONCURRENTLY-style operation)`);
          const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
          for (const statement of statements) await client.query(statement);
          await client.query('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [file, checksum]);
          console.log(`applied ${file}`);
          continue;
        }

        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [file, checksum]);
          await client.query('COMMIT');
          console.log(`applied ${file}`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw new Error(`Migration ${file} failed: ${error.message}`);
        }
      }
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1::bigint)`, [ADVISORY_LOCK_KEY.toString()]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

// Guarded so importing this module (e.g. to unit-test checksumOf()/isConcurrentMigration()
// without a real database - see tests/migrate-checksums.test.mjs) never triggers a real
// connection attempt. Only runs automatically when this file is executed directly, e.g.
// `node server/db/migrate.mjs` (matches this project's own `npm run db:migrate` script).
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  run().then(() => { console.log('migrations complete'); process.exit(0); }).catch((error) => { console.error(error); process.exit(1); });
}
