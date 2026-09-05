import pg from 'pg';

const { Pool } = pg;

// pg.Pool never opens a real connection at construction time - it connects lazily, per
// query. That's what makes it safe to import server/community-api-server.mjs (which builds
// a pool at module scope) even when no Postgres instance is reachable: nothing here blocks
// or throws until a query actually runs.
//
// Launch-readiness audit fix (P1-6): this used to be `new Pool({ connectionString })` with no
// other options - pg's own defaults (max: 10, no connection/statement timeout at all) mean a
// single slow/runaway query could hold a connection indefinitely, and a burst of concurrent
// requests beyond 10 in flight would queue with no bound on how long a caller waits. Every value
// below is a real, environment-overridable production concern, not a hardcoded guess:
//   - `max`: sized well under Postgres's own default max_connections (100) with headroom for
//     both the migrate one-shot job and any future second API replica sharing the same database.
//   - `idleTimeoutMillis`: releases a connection back to the OS-level TCP pool after being idle -
//     keeps a quiet period from holding `max` connections open for no reason.
//   - `connectionTimeoutMillis`: how long a caller waits for a pool slot before failing loudly
//     with a real, catchable error instead of hanging forever - this is what turns "the pool is
//     full" from an indefinite hang into a real 5xx a client (and an operator's alerting) can see.
//   - `statement_timeout`/`query_timeout`: a server-enforced ceiling on any single query - the
//     concrete fix for the Section 15/17 "PostgreSQL slow for 5 minutes" failure-injection
//     scenario, which previously had no bound on this connection at all.
export function createPool(connectionString) {
  return new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 20),
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || 5000),
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 30000),
    query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 30000)
  });
}
