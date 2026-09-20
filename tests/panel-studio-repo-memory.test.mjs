import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

async function seedUsers(repo, names) {
  const users = [];
  for (const name of names) users.push(await repo.users.create({ displayName: name, email: name.toLowerCase().replace(/\s+/g, '') + '@example.com' }));
  return users;
}

test('createRevision with no artifactId creates a brand-new draft artifact plus its first revision, revision 1, status ready', async () => {
  const repo = createMemoryRepo();
  const [user] = await seedUsers(repo, ['Alice']);
  const { artifact, revision } = await repo.panelStudioArtifacts.createRevision({
    userId: user.id, artifactId: null, target: 'dashboard.panel', title: 'Win rate', source: '<div>ok</div>',
    sourceKind: 'generated', prompt: 'show my win rate', provider: 'openai', model: 'gpt-5.6-luna',
    codingEngineId: 'codex', baseRevisionId: null, createdBy: user.id
  });
  assert.equal(artifact.userId, user.id);
  assert.equal(artifact.target, 'dashboard.panel');
  assert.equal(artifact.status, 'ready');
  assert.equal(artifact.currentRevisionId, revision.id);
  assert.equal(artifact.appliedRevisionId, null, 'generation alone must never apply a panel to the dashboard');
  assert.equal(revision.revisionNumber, 1);
  assert.equal(revision.sourceKind, 'generated');
});

test('creating a new artifact with a baseRevisionId set is rejected - a brand-new artifact has no prior revision to be based on', async () => {
  const repo = createMemoryRepo();
  const [user] = await seedUsers(repo, ['Bob']);
  await assert.rejects(
    () => repo.panelStudioArtifacts.createRevision({ userId: user.id, artifactId: null, target: 'dashboard.panel', title: 't', source: '<div/>', sourceKind: 'generated', baseRevisionId: 'panelrev-ghost', createdBy: user.id }),
    (e) => e.code === 'REVISION_CONFLICT' && e.status === 409
  );
});

test('an unsupported target is rejected fail-closed when creating a new artifact', async () => {
  const repo = createMemoryRepo();
  const [user] = await seedUsers(repo, ['Carol']);
  await assert.rejects(
    () => repo.panelStudioArtifacts.createRevision({ userId: user.id, artifactId: null, target: 'session.panel', title: 't', source: '<div/>', sourceKind: 'generated', createdBy: user.id }),
    (e) => e.code === 'PANEL_STUDIO_TARGET_UNSUPPORTED' && e.status === 400
  );
});

test('a second revision on the same artifact requires the correct baseRevisionId, never mutates the first revision, and bumps revision_number', async () => {
  const repo = createMemoryRepo();
  const [user] = await seedUsers(repo, ['Dave']);
  const first = await repo.panelStudioArtifacts.createRevision({
    userId: user.id, artifactId: null, target: 'dashboard.panel', title: 't', source: '<div>v1</div>',
    sourceKind: 'generated', baseRevisionId: null, createdBy: user.id
  });

  await assert.rejects(
    () => repo.panelStudioArtifacts.createRevision({
      userId: user.id, artifactId: first.artifact.id, target: 'dashboard.panel', source: '<div>v2</div>',
      sourceKind: 'manual-edit', baseRevisionId: 'wrong-revision-id', createdBy: user.id
    }),
    (e) => e.code === 'REVISION_CONFLICT' && e.status === 409
  );

  const second = await repo.panelStudioArtifacts.createRevision({
    userId: user.id, artifactId: first.artifact.id, target: 'dashboard.panel', source: '<div>v2</div>',
    sourceKind: 'manual-edit', baseRevisionId: first.revision.id, createdBy: user.id
  });
  assert.equal(second.revision.revisionNumber, 2);
  assert.equal(second.artifact.currentRevisionId, second.revision.id);

  const stillIntact = await repo.panelStudioArtifacts.getRevision(first.revision.id);
  assert.equal(stillIntact.source, '<div>v1</div>', 'the first revision must never be mutated in place');

  const history = await repo.panelStudioArtifacts.listRevisions(first.artifact.id);
  assert.deepEqual(history.map((r) => r.revisionNumber), [2, 1], 'history is newest-first and both revisions survive');
});

test('restore is expressed as createRevision with sourceKind restore + restoredFromRevisionId, producing a NEW top revision', async () => {
  const repo = createMemoryRepo();
  const [user] = await seedUsers(repo, ['Erin']);
  const gen = await repo.panelStudioArtifacts.createRevision({
    userId: user.id, artifactId: null, target: 'dashboard.panel', title: 't', source: '<div>original</div>',
    sourceKind: 'generated', baseRevisionId: null, createdBy: user.id
  });
  const edit = await repo.panelStudioArtifacts.createRevision({
    userId: user.id, artifactId: gen.artifact.id, target: 'dashboard.panel', source: '<div>edited badly</div>',
    sourceKind: 'manual-edit', baseRevisionId: gen.revision.id, createdBy: user.id
  });
  const restored = await repo.panelStudioArtifacts.createRevision({
    userId: user.id, artifactId: gen.artifact.id, target: 'dashboard.panel', source: gen.revision.source,
    sourceKind: 'restore', restoredFromRevisionId: gen.revision.id, baseRevisionId: edit.revision.id, createdBy: user.id
  });
  assert.equal(restored.revision.revisionNumber, 3);
  assert.equal(restored.revision.source, '<div>original</div>');
  assert.equal(restored.revision.restoredFromRevisionId, gen.revision.id);
  assert.equal(restored.artifact.currentRevisionId, restored.revision.id);
});

test('ownership: a stranger cannot add a revision, apply, or archive another user\'s artifact', async () => {
  const repo = createMemoryRepo();
  const [owner, stranger] = await seedUsers(repo, ['Frank', 'Grace']);
  const { artifact, revision } = await repo.panelStudioArtifacts.createRevision({
    userId: owner.id, artifactId: null, target: 'dashboard.panel', title: 't', source: '<div/>', sourceKind: 'generated', baseRevisionId: null, createdBy: owner.id
  });
  await assert.rejects(
    () => repo.panelStudioArtifacts.createRevision({ userId: stranger.id, artifactId: artifact.id, target: 'dashboard.panel', source: '<div>x</div>', sourceKind: 'manual-edit', baseRevisionId: revision.id, createdBy: stranger.id }),
    (e) => e.code === 'NOT_ARTIFACT_OWNER' && e.status === 403
  );
  await assert.rejects(() => repo.panelStudioArtifacts.apply(artifact.id, stranger.id, revision.id), (e) => e.code === 'NOT_ARTIFACT_OWNER' && e.status === 403);
  await assert.rejects(() => repo.panelStudioArtifacts.archive(artifact.id, stranger.id), (e) => e.code === 'NOT_ARTIFACT_OWNER' && e.status === 403);
});

test('apply sets appliedRevisionId + status applied, independently of currentRevisionId - a later revision never silently changes what is applied', async () => {
  const repo = createMemoryRepo();
  const [user] = await seedUsers(repo, ['Henry']);
  const gen = await repo.panelStudioArtifacts.createRevision({
    userId: user.id, artifactId: null, target: 'dashboard.panel', title: 't', source: '<div>v1</div>', sourceKind: 'generated', baseRevisionId: null, createdBy: user.id
  });
  const applied = await repo.panelStudioArtifacts.apply(gen.artifact.id, user.id, gen.revision.id);
  assert.equal(applied.status, 'applied');
  assert.equal(applied.appliedRevisionId, gen.revision.id);

  const edited = await repo.panelStudioArtifacts.createRevision({
    userId: user.id, artifactId: gen.artifact.id, target: 'dashboard.panel', source: '<div>v2</div>', sourceKind: 'manual-edit', baseRevisionId: gen.revision.id, createdBy: user.id
  });
  assert.equal(edited.artifact.appliedRevisionId, gen.revision.id, 'creating a new revision must never move the applied pointer');
  assert.equal(edited.artifact.status, 'applied', 'status stays applied - a panel already live stays live while it is iterated on');
  assert.equal(edited.artifact.currentRevisionId, edited.revision.id);
});

test('apply defaults to the current revision when no revisionId is given, and rejects a revision from a different artifact', async () => {
  const repo = createMemoryRepo();
  const [user] = await seedUsers(repo, ['Ivy']);
  const a = await repo.panelStudioArtifacts.createRevision({ userId: user.id, artifactId: null, target: 'dashboard.panel', title: 'A', source: '<div>a</div>', sourceKind: 'generated', baseRevisionId: null, createdBy: user.id });
  const b = await repo.panelStudioArtifacts.createRevision({ userId: user.id, artifactId: null, target: 'dashboard.panel', title: 'B', source: '<div>b</div>', sourceKind: 'generated', baseRevisionId: null, createdBy: user.id });

  const appliedDefault = await repo.panelStudioArtifacts.apply(a.artifact.id, user.id);
  assert.equal(appliedDefault.appliedRevisionId, a.revision.id);

  await assert.rejects(() => repo.panelStudioArtifacts.apply(a.artifact.id, user.id, b.revision.id), (e) => e.code === 'REVISION_NOT_FOUND' && e.status === 404);
});

test('archive/unarchive: an archived artifact rejects new revisions and re-apply; unarchiving recomputes status from its real pointers, never assumed', async () => {
  const repo = createMemoryRepo();
  const [user] = await seedUsers(repo, ['Jack']);
  const gen = await repo.panelStudioArtifacts.createRevision({ userId: user.id, artifactId: null, target: 'dashboard.panel', title: 't', source: '<div/>', sourceKind: 'generated', baseRevisionId: null, createdBy: user.id });
  await repo.panelStudioArtifacts.apply(gen.artifact.id, user.id, gen.revision.id);

  const archived = await repo.panelStudioArtifacts.archive(gen.artifact.id, user.id);
  assert.equal(archived.status, 'archived');

  await assert.rejects(
    () => repo.panelStudioArtifacts.createRevision({ userId: user.id, artifactId: gen.artifact.id, target: 'dashboard.panel', source: '<div>x</div>', sourceKind: 'manual-edit', baseRevisionId: gen.revision.id, createdBy: user.id }),
    (e) => e.code === 'ARTIFACT_ARCHIVED' && e.status === 400
  );
  await assert.rejects(() => repo.panelStudioArtifacts.apply(gen.artifact.id, user.id), (e) => e.code === 'ARTIFACT_ARCHIVED' && e.status === 400);

  const unarchived = await repo.panelStudioArtifacts.unarchive(gen.artifact.id, user.id);
  assert.equal(unarchived.status, 'applied', 'an artifact that was applied before archiving comes back applied, not demoted to ready');

  await assert.rejects(() => repo.panelStudioArtifacts.unarchive(gen.artifact.id, user.id), (e) => e.code === 'ARTIFACT_NOT_ARCHIVED' && e.status === 400);
});

test('listForUser scopes strictly to the caller and supports an optional status filter, most-recently-updated first', async () => {
  const repo = createMemoryRepo();
  const [me, other] = await seedUsers(repo, ['Kim', 'Leo']);
  await repo.panelStudioArtifacts.createRevision({ userId: other.id, artifactId: null, target: 'dashboard.panel', title: 'not mine', source: '<div/>', sourceKind: 'generated', baseRevisionId: null, createdBy: other.id });
  const mine1 = await repo.panelStudioArtifacts.createRevision({ userId: me.id, artifactId: null, target: 'dashboard.panel', title: 'mine 1', source: '<div/>', sourceKind: 'generated', baseRevisionId: null, createdBy: me.id });
  const mine2 = await repo.panelStudioArtifacts.createRevision({ userId: me.id, artifactId: null, target: 'dashboard.panel', title: 'mine 2', source: '<div/>', sourceKind: 'generated', baseRevisionId: null, createdBy: me.id });
  await repo.panelStudioArtifacts.apply(mine2.artifact.id, me.id, mine2.revision.id);

  const list = await repo.panelStudioArtifacts.listForUser(me.id);
  assert.equal(list.length, 2);
  assert.ok(list.every((a) => a.userId === me.id));

  const readyOnly = await repo.panelStudioArtifacts.listForUser(me.id, { status: 'ready' });
  assert.deepEqual(readyOnly.map((a) => a.id), [mine1.artifact.id]);
});

test('createRevision validates sourceKind and requires a non-empty source', async () => {
  const repo = createMemoryRepo();
  const [user] = await seedUsers(repo, ['Mona']);
  await assert.rejects(
    () => repo.panelStudioArtifacts.createRevision({ userId: user.id, artifactId: null, target: 'dashboard.panel', title: 't', source: '<div/>', sourceKind: 'not-a-real-kind', baseRevisionId: null, createdBy: user.id }),
    (e) => e.code === 'VALIDATION_FAILED' && e.status === 400
  );
  await assert.rejects(
    () => repo.panelStudioArtifacts.createRevision({ userId: user.id, artifactId: null, target: 'dashboard.panel', title: 't', source: '', sourceKind: 'generated', baseRevisionId: null, createdBy: user.id }),
    (e) => e.code === 'VALIDATION_FAILED' && e.status === 400
  );
});
