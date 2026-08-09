import { createApp } from './community/app.mjs';
import { createPool } from './db/pool.mjs';
import { createPgRepo } from './db/repo.pg.mjs';
import { createMemoryRepo } from './db/repo.memory.mjs';

// The project's first real multi-user backend - the entrypoint process. Deliberately a
// separate file/process from server/pattern-ai-server.mjs (AI-endpoint code and
// community/account CRUD stay cleanly separated) even though both could technically run on
// one machine. The actual Express app is built by the side-effect-free createApp() in
// server/community/app.mjs; this file's only job is to wire up a repo and bind a real port -
// kept separate so tests can import createApp() directly without ever triggering a port bind.
const uploadsDir = process.env.UPLOADS_DIR || './uploads';
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || process.env.COMMUNITY_API_PORT || 8788);

// No DATABASE_URL configured -> no Postgres/Docker setup has been done. Rather than refusing
// to start (leaving account creation permanently broken until someone installs Docker), fall
// back to the same in-memory repo the contract tests already run against: real business rules
// (unique purchase, rating-requires-purchase, thread find-or-create, etc.), just non-persistent
// across process restarts. Explicitly logged so it is never mistaken for real persistence.
const usingMemoryRepo = !process.env.DATABASE_URL;
const repo = usingMemoryRepo ? createMemoryRepo() : createPgRepo(createPool(process.env.DATABASE_URL));

// pg.Pool never opens a connection at construction (lazy per-query), so building it is safe
// even with no Postgres reachable - exactly what makes the import-triggers-listen smoke test
// (mirroring tests/ai-gateway.test.mjs) safe to run here.
const server = createApp({ repo, uploadsDir }).listen(port, host, () => {
  console.log(`Community API server: http://${host}:${port}`);
  if (usingMemoryRepo) {
    console.log('  -> No DATABASE_URL set: using an IN-MEMORY repo. Data resets on restart. Set DATABASE_URL (see .env.example) for real Postgres persistence.');
  }
});

export default server;
