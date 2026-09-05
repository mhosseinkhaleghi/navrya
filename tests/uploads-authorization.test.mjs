import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// P0-2 launch-readiness fix (docs/PUBLIC-LAUNCH-READINESS-AUDIT.md): private
// /uploads/{session,pattern,strategy,trade}/* used to be gated by "any authenticated user,"
// never the file's actual owner - server/community/app.mjs's own middleware chain only ever
// called requireAuth(), with no ownership check at all. These tests prove the real fix
// (server/community/security/upload-ownership.mjs): the owner - resolved either via the
// upload-time storage_objects record, or, for a file that predates that table, the owning domain
// row that still references its URL - can read it; a different authenticated user cannot, even
// though both are equally "logged in."

let server, baseUrl, uploadsDir, repo;

async function api(method, urlPath, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + urlPath, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const dataUrl = `data:image/png;base64,${tinyPngBase64}`;

// Per-category real-flow wiring - one real upload endpoint (the storage_objects/tier-1 path),
// one direct repo.upsert() shape mirroring what a genuinely pre-storage_objects record looks
// like (the domain-row/tier-2 fallback path). instrument seeding mirrors this codebase's own
// existing convention (tests/trades-api-contract.test.mjs's seedInstrument(), tests/
// storage-quota-enforcement.test.mjs's direct instrumentCatalog.upsert()).
const CATEGORY_CONFIG = {
  trade: {
    uploadEndpoint: '/api/sync/trades/images',
    seed: (userId) => repo.instrumentCatalog.upsert(userId, { id: `instr-trade-${userId}`, code: 'XAUUSD' }),
    createLegacyRecord: (userId, url) => repo.trades.upsert(userId, {
      id: `trade-legacy-${userId}`, instrument: 'XAUUSD', screenshots: [{ id: 'shot-1', imageUrl: url }]
    })
  },
  pattern: {
    uploadEndpoint: '/api/sync/patterns/images',
    seed: (userId) => repo.instrumentCatalog.upsert(userId, { id: `instr-pattern-${userId}`, code: 'XAUUSD' }),
    createLegacyRecord: (userId, url) => repo.patterns.upsert(userId, {
      id: `pattern-legacy-${userId}`, instruments: ['XAUUSD'], referenceScreenshots: [{ id: 'shot-1', imageUrl: url }]
    })
  },
  strategy: {
    uploadEndpoint: '/api/sync/strategies/images',
    seed: () => Promise.resolve(), // strategies carry no instrument requirement (008_strategies.sql has no such column)
    createLegacyRecord: (userId, url) => repo.strategies.upsert(userId, {
      id: `strategy-legacy-${userId}`, positionManagement: { attachments: [{ id: 'att-1', fileUrl: url }] }
    })
  },
  session: {
    uploadEndpoint: '/api/sync/sessions/images',
    seed: (userId) => repo.instrumentCatalog.upsert(userId, { id: `instr-session-${userId}`, code: 'XAUUSD' }),
    createLegacyRecord: (userId, url) => repo.tradingSessions.upsert(userId, {
      id: `session-legacy-${userId}`, character: 'hunter', market: 'London', instrument: 'XAUUSD',
      entries: [{ id: 'entry-1', type: 'chart', imageUrl: url }]
    })
  }
};

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-'));
  for (const category of ['session', 'pattern', 'strategy', 'trade', 'posts', 'listings']) {
    await mkdir(path.join(uploadsDir, category), { recursive: true });
  }
  // A file with NO owning DB row anywhere (not storage_objects, not any domain table) - the
  // fail-closed default this fix must produce for anyone but a genuine, resolvable owner.
  for (const category of Object.keys(CATEGORY_CONFIG)) {
    await writeFile(path.join(uploadsDir, category, 'img-orphan.png'), Buffer.from([137, 80, 78, 71]));
  }
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(uploadsDir, { recursive: true, force: true });
});

for (const category of Object.keys(CATEGORY_CONFIG)) {
  test(`GET /uploads/${category}/... requires a real session - anonymous is rejected, never served publicly`, async () => {
    const response = await fetch(`${baseUrl}/uploads/${category}/img-orphan.png`);
    assert.equal(response.status, 401);
  });

  test(`GET /uploads/${category}/... - a real session with NO ownership record for this file is denied (P0-2: "any logged-in user" is no longer sufficient)`, async () => {
    const user = await repo.users.create({ displayName: 'Media Viewer' });
    const headers = await authHeadersFor(repo, user.id);
    const response = await fetch(`${baseUrl}/uploads/${category}/img-orphan.png`, { headers });
    assert.equal(response.status, 404);
  });

  test(`GET /uploads/${category}/... - real upload flow: the uploader reads their own file, a different real user cannot (storage_objects tier)`, async () => {
    const { uploadEndpoint, seed } = CATEGORY_CONFIG[category];
    const owner = await repo.users.create({ displayName: 'Owner' });
    const stranger = await repo.users.create({ displayName: 'Stranger' });
    await seed(owner.id);

    const uploaded = await api('POST', uploadEndpoint, { userId: owner.id, body: { dataUrl } });
    assert.equal(uploaded.status, 201);
    assert.match(uploaded.body.url, new RegExp(`^/uploads/${category}/`));

    const ownerHeaders = await authHeadersFor(repo, owner.id);
    const ownerResponse = await fetch(baseUrl + uploaded.body.url, { headers: ownerHeaders });
    assert.equal(ownerResponse.status, 200);

    const strangerHeaders = await authHeadersFor(repo, stranger.id);
    const strangerResponse = await fetch(baseUrl + uploaded.body.url, { headers: strangerHeaders });
    assert.equal(strangerResponse.status, 404);
  });

  test(`GET /uploads/${category}/... - a file uploaded before storage_objects existed is still correctly owner-scoped (domain-row fallback tier)`, async () => {
    const { seed, createLegacyRecord } = CATEGORY_CONFIG[category];
    const owner = await repo.users.create({ displayName: 'Legacy Owner' });
    const stranger = await repo.users.create({ displayName: 'Legacy Stranger' });
    await seed(owner.id); // the domain's own instrument-catalog prerequisite, unrelated to the upload/ownership mechanism under test
    const fileName = `img-legacy-${category}.png`;
    await writeFile(path.join(uploadsDir, category, fileName), Buffer.from([137, 80, 78, 71]));
    const legacyUrl = `/uploads/${category}/${fileName}`;
    // Deliberately never touches storage_objects - this is exactly the shape a real screenshot
    // uploaded before migration 035 landed would have: a real domain row referencing a real file,
    // with no storage_objects row at all.
    await createLegacyRecord(owner.id, legacyUrl);

    const ownerHeaders = await authHeadersFor(repo, owner.id);
    const ownerResponse = await fetch(baseUrl + legacyUrl, { headers: ownerHeaders });
    assert.equal(ownerResponse.status, 200);

    const strangerHeaders = await authHeadersFor(repo, stranger.id);
    const strangerResponse = await fetch(baseUrl + legacyUrl, { headers: strangerHeaders });
    assert.equal(strangerResponse.status, 404);
  });
}

for (const category of ['posts', 'listings']) {
  test(`GET /uploads/${category}/... stays PUBLIC (Community content is public by design) - anonymous access still works`, async () => {
    const fileName = 'img-test.png';
    await writeFile(path.join(uploadsDir, category, fileName), Buffer.from([137, 80, 78, 71]));
    const response = await fetch(`${baseUrl}/uploads/${category}/${fileName}`);
    assert.equal(response.status, 200);
  });
}
