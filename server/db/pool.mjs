import pg from 'pg';

const { Pool } = pg;

// pg.Pool never opens a real connection at construction time - it connects lazily, per
// query. That's what makes it safe to import server/community-api-server.mjs (which builds
// a pool at module scope) even when no Postgres instance is reachable: nothing here blocks
// or throws until a query actually runs.
export function createPool(connectionString) {
  return new Pool({ connectionString });
}
