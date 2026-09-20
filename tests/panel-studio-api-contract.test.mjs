process.env.INTERNAL_API_SECRET = 'test-internal-secret-please-ignore';

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

let server, baseUrl, uploadsDir, repo;

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-'));
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(uploadsDir, { recursive: true, force: true });
});

async function api(method, urlPath, { body, userId, headers } = {}) {
  const reqHeaders = { 'Content-Type': 'application/json', ...(headers || {}) };
  if (userId) Object.assign(reqHeaders, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + urlPath, { method, headers: reqHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// The exact write path pattern-ai-server.mjs uses in production, after a streamed generation has
// completed and passed validation - never called directly by a browser.
function internalCreateRevision(payload) {
  return fetch(baseUrl + '/internal/panel-artifacts/revisions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
    body: JSON.stringify(payload)
  }).then(async (res) => ({ status: res.status, body: await res.json() }));
}

async function createUser(name) { return repo.users.create({ displayName: name }); }

async function seedArtifact(userId, source = '<div>hello</div>') {
  const result = await internalCreateRevision({
    userId, artifactId: null, target: 'dashboard.panel', title: 'Win rate', source,
    prompt: 'show my win rate', provider: 'openai', model: 'gpt-5.6-luna', codingEngineId: 'codex'
  });
  assert.equal(result.status, 201);
  return result.body;
}

test('a request with no session is rejected with AUTH_SESSION_REQUIRED', async () => {
  const list = await api('GET', '/api/sync/panel-studio/artifacts');
  assert.equal(list.status, 401);
  assert.equal(list.body.error, 'AUTH_SESSION_REQUIRED');
});

test('the internal generation bridge requires the shared secret and independently re-verifies ownership', async () => {
  const user = await createUser('Alice');
  const noSecret = await fetch(baseUrl + '/internal/panel-artifacts/revisions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.id, target: 'dashboard.panel', source: '<div/>' })
  });
  assert.equal(noSecret.status, 403);

  const missingUser = await internalCreateRevision({ userId: 'nonexistent', target: 'dashboard.panel', source: '<div/>' });
  assert.equal(missingUser.status, 404);
  assert.equal(missingUser.body.error, 'USER_NOT_FOUND');

  const stranger = await createUser('Stranger');
  const seeded = await seedArtifact(user.id);
  const forged = await internalCreateRevision({ userId: stranger.id, artifactId: seeded.artifact.id, target: 'dashboard.panel', source: '<div>forged</div>' });
  assert.equal(forged.status, 403);
  assert.equal(forged.body.error, 'NOT_ARTIFACT_OWNER');
});

test('a real generation creates the artifact as draft-turned-ready, never applied, until an explicit apply', async () => {
  const user = await createUser('Bob');
  const seeded = await seedArtifact(user.id);
  assert.equal(seeded.artifact.status, 'ready');
  assert.equal(seeded.artifact.appliedRevisionId, null);
  assert.equal(seeded.revision.sourceKind, 'generated');
  assert.equal(seeded.revision.codingEngineId, 'codex');
});

test('list/get: scoped to the owner, revisions include full source, ownership is enforced', async () => {
  const owner = await createUser('Carol');
  const stranger = await createUser('Dave');
  const seeded = await seedArtifact(owner.id);

  const list = await api('GET', '/api/sync/panel-studio/artifacts', { userId: owner.id });
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].id, seeded.artifact.id);

  const strangerList = await api('GET', '/api/sync/panel-studio/artifacts', { userId: stranger.id });
  assert.equal(strangerList.body.length, 0, 'a stranger must never see another user\'s artifacts');

  const detail = await api('GET', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}`, { userId: owner.id });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.revisions.length, 1);
  assert.equal(detail.body.revisions[0].source, '<div>hello</div>');

  const strangerDetail = await api('GET', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}`, { userId: stranger.id });
  assert.equal(strangerDetail.status, 403);
  assert.equal(strangerDetail.body.error, 'NOT_ARTIFACT_OWNER');

  const missing = await api('GET', '/api/sync/panel-studio/artifacts/nonexistent', { userId: owner.id });
  assert.equal(missing.status, 404);
});

test('manual edit: requires the correct baseRevisionId (409 on conflict), enforces the size limit, and never mutates the prior revision', async () => {
  const user = await createUser('Erin');
  const seeded = await seedArtifact(user.id);

  const wrongBase = await api('POST', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}/revisions`, {
    userId: user.id, body: { source: '<div>v2</div>', sourceKind: 'manual-edit', baseRevisionId: 'not-the-real-one' }
  });
  assert.equal(wrongBase.status, 409);
  assert.equal(wrongBase.body.error, 'REVISION_CONFLICT');

  const tooBig = await api('POST', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}/revisions`, {
    userId: user.id, body: { source: '<div>' + 'x'.repeat(13 * 1024) + '</div>', sourceKind: 'manual-edit', baseRevisionId: seeded.revision.id }
  });
  assert.equal(tooBig.status, 400);
  assert.equal(tooBig.body.error, 'SOURCE_TOO_LARGE');

  const edited = await api('POST', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}/revisions`, {
    userId: user.id, body: { source: '<div>v2</div>', sourceKind: 'manual-edit', baseRevisionId: seeded.revision.id }
  });
  assert.equal(edited.status, 201);
  assert.equal(edited.body.revision.revisionNumber, 2);
  assert.equal(edited.body.revision.sourceKind, 'manual-edit');

  const original = await api('GET', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}`, { userId: user.id });
  const first = original.body.revisions.find((r) => r.revisionNumber === 1);
  assert.equal(first.source, '<div>hello</div>', 'the first revision must never be mutated');
});

test('restore: server loads the source itself from restoredFromRevisionId, ignoring any client-sent source, and produces a new top revision', async () => {
  const user = await createUser('Frank');
  const seeded = await seedArtifact(user.id, '<div>original</div>');
  const edited = await api('POST', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}/revisions`, {
    userId: user.id, body: { source: '<div>edited badly</div>', sourceKind: 'manual-edit', baseRevisionId: seeded.revision.id }
  });

  const restored = await api('POST', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}/revisions`, {
    userId: user.id,
    body: {
      sourceKind: 'restore', restoredFromRevisionId: seeded.revision.id, baseRevisionId: edited.body.revision.id,
      source: '<div>a client-forged value that must be ignored</div>'
    }
  });
  assert.equal(restored.status, 201);
  assert.equal(restored.body.revision.source, '<div>original</div>', 'the server must load the real source, never trust the client-sent one');
  assert.equal(restored.body.revision.restoredFromRevisionId, seeded.revision.id);
  assert.equal(restored.body.revision.revisionNumber, 3);
});

test('restoring from a revision that belongs to a different artifact is rejected', async () => {
  const user = await createUser('Grace');
  const a = await seedArtifact(user.id, '<div>a</div>');
  const b = await seedArtifact(user.id, '<div>b</div>');
  const result = await api('POST', `/api/sync/panel-studio/artifacts/${a.artifact.id}/revisions`, {
    userId: user.id, body: { sourceKind: 'restore', restoredFromRevisionId: b.revision.id, baseRevisionId: a.revision.id }
  });
  assert.equal(result.status, 404);
  assert.equal(result.body.error, 'REVISION_NOT_FOUND');
});

test('apply: only action that changes appliedRevisionId; disabled by ownership, not left implicit after generation', async () => {
  const user = await createUser('Henry');
  const stranger = await createUser('Ivy');
  const seeded = await seedArtifact(user.id);

  const strangerApply = await api('POST', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}/apply`, { userId: stranger.id, body: {} });
  assert.equal(strangerApply.status, 403);

  const applied = await api('POST', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}/apply`, { userId: user.id, body: {} });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.status, 'applied');
  assert.equal(applied.body.appliedRevisionId, seeded.revision.id);
});

test('archive/unarchive: archived artifacts reject new revisions/apply; ownership enforced on both actions', async () => {
  const user = await createUser('Jack');
  const stranger = await createUser('Kate');
  const seeded = await seedArtifact(user.id);

  const strangerArchive = await api('POST', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}/archive`, { userId: stranger.id });
  assert.equal(strangerArchive.status, 403);

  const archived = await api('POST', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}/archive`, { userId: user.id });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.status, 'archived');

  const blockedEdit = await api('POST', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}/revisions`, {
    userId: user.id, body: { source: '<div>x</div>', sourceKind: 'manual-edit', baseRevisionId: seeded.revision.id }
  });
  assert.equal(blockedEdit.status, 400);
  assert.equal(blockedEdit.body.error, 'ARTIFACT_ARCHIVED');

  const unarchived = await api('POST', `/api/sync/panel-studio/artifacts/${seeded.artifact.id}/unarchive`, { userId: user.id });
  assert.equal(unarchived.status, 200);
  assert.equal(unarchived.body.status, 'ready');
});
