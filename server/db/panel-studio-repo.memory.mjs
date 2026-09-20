// In-memory implementation of the Vibe Coding Panel Studio artifact/revision repository domain.
// Mirrors server/db/panel-studio-repo.pg.mjs method-for-method - same names, arguments, and
// result shapes - so every route/gateway test runs with zero Postgres dependency.
//
// Atomicity: repo.pg.mjs serializes with a row lock (SELECT ... FOR UPDATE) inside a transaction.
// JavaScript is single-threaded here, so the equivalent guarantee is that every
// read-check-write below is one synchronous block with no `await` between the check and the
// write - the same convention this repo family already uses elsewhere (see
// server/db/referral-repo.memory.mjs's own header comment for the identical argument).
//
// Wired in from createMemoryRepo() (server/db/repo.memory.mjs) with just the shared `state`,
// `clone`, and `now` helpers.
import { newId } from './id.mjs';
import { ApiError } from '../community/errors.mjs';

const VALID_TARGETS = ['dashboard.panel'];
const VALID_SOURCE_KINDS = ['generated', 'manual-edit', 'restore'];

export function createPanelStudioMemoryDomains({ state, clone, now }) {
  if (!state.panelStudioArtifacts) state.panelStudioArtifacts = new Map();
  if (!state.panelStudioRevisions) state.panelStudioRevisions = new Map();

  function revisionsFor(artifactId) {
    return Array.from(state.panelStudioRevisions.values()).filter((r) => r.artifactId === artifactId);
  }

  const panelStudioArtifacts = {
    async get(id) {
      const record = state.panelStudioArtifacts.get(id);
      return record ? clone(record) : null;
    },
    async listForUser(userId, { status } = {}) {
      return Array.from(state.panelStudioArtifacts.values())
        .filter((a) => a.userId === userId && (!status || a.status === status))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .map(clone);
    },
    async listRevisions(artifactId) {
      return revisionsFor(artifactId).sort((a, b) => b.revisionNumber - a.revisionNumber).map(clone);
    },
    async getRevision(revisionId) {
      const record = state.panelStudioRevisions.get(revisionId);
      return record ? clone(record) : null;
    },
    async createRevision({ userId, artifactId, target, title, source, sourceKind, prompt, restoredFromRevisionId, provider, model, codingEngineId, baseRevisionId, createdBy }) {
      if (!VALID_SOURCE_KINDS.includes(sourceKind)) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'sourceKind' });
      if (!source) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'source' });

      let artifact;
      if (!artifactId) {
        if (baseRevisionId) throw new ApiError(409, 'REVISION_CONFLICT');
        if (!VALID_TARGETS.includes(target)) throw new ApiError(400, 'PANEL_STUDIO_TARGET_UNSUPPORTED');
        artifact = {
          id: newId('panelart'), userId, target, title: String(title || 'Untitled panel').slice(0, 120),
          status: 'draft', currentRevisionId: null, appliedRevisionId: null,
          createdAt: now(), updatedAt: now()
        };
        state.panelStudioArtifacts.set(artifact.id, artifact);
      } else {
        artifact = state.panelStudioArtifacts.get(artifactId);
        if (!artifact) throw new ApiError(404, 'ARTIFACT_NOT_FOUND');
        if (artifact.userId !== userId) throw new ApiError(403, 'NOT_ARTIFACT_OWNER');
        if (artifact.status === 'archived') throw new ApiError(400, 'ARTIFACT_ARCHIVED');
        if ((artifact.currentRevisionId || null) !== (baseRevisionId || null)) throw new ApiError(409, 'REVISION_CONFLICT');
      }

      const existing = revisionsFor(artifact.id);
      const nextNumber = existing.reduce((max, r) => Math.max(max, r.revisionNumber), 0) + 1;
      const revision = {
        id: newId('panelrev'), artifactId: artifact.id, revisionNumber: nextNumber, source, sourceKind,
        prompt: prompt || null, restoredFromRevisionId: restoredFromRevisionId || null,
        provider: provider || null, model: model || null, codingEngineId: codingEngineId || null,
        createdBy, createdAt: now()
      };
      state.panelStudioRevisions.set(revision.id, revision);

      artifact.currentRevisionId = revision.id;
      artifact.status = artifact.status === 'applied' ? 'applied' : 'ready';
      artifact.updatedAt = now();
      state.panelStudioArtifacts.set(artifact.id, artifact);

      return { artifact: clone(artifact), revision: clone(revision) };
    },
    async apply(artifactId, userId, revisionId) {
      const artifact = state.panelStudioArtifacts.get(artifactId);
      if (!artifact) throw new ApiError(404, 'ARTIFACT_NOT_FOUND');
      if (artifact.userId !== userId) throw new ApiError(403, 'NOT_ARTIFACT_OWNER');
      if (artifact.status === 'archived') throw new ApiError(400, 'ARTIFACT_ARCHIVED');
      const targetRevisionId = revisionId || artifact.currentRevisionId;
      if (!targetRevisionId) throw new ApiError(400, 'NO_REVISION_TO_APPLY');
      const revision = state.panelStudioRevisions.get(targetRevisionId);
      if (!revision || revision.artifactId !== artifactId) throw new ApiError(404, 'REVISION_NOT_FOUND');
      artifact.appliedRevisionId = targetRevisionId;
      artifact.status = 'applied';
      artifact.updatedAt = now();
      state.panelStudioArtifacts.set(artifactId, artifact);
      return clone(artifact);
    },
    async archive(artifactId, userId) {
      const artifact = state.panelStudioArtifacts.get(artifactId);
      if (!artifact) throw new ApiError(404, 'ARTIFACT_NOT_FOUND');
      if (artifact.userId !== userId) throw new ApiError(403, 'NOT_ARTIFACT_OWNER');
      artifact.status = 'archived';
      artifact.updatedAt = now();
      state.panelStudioArtifacts.set(artifactId, artifact);
      return clone(artifact);
    },
    async unarchive(artifactId, userId) {
      const artifact = state.panelStudioArtifacts.get(artifactId);
      if (!artifact) throw new ApiError(404, 'ARTIFACT_NOT_FOUND');
      if (artifact.userId !== userId) throw new ApiError(403, 'NOT_ARTIFACT_OWNER');
      if (artifact.status !== 'archived') throw new ApiError(400, 'ARTIFACT_NOT_ARCHIVED');
      artifact.status = artifact.appliedRevisionId ? 'applied' : artifact.currentRevisionId ? 'ready' : 'draft';
      artifact.updatedAt = now();
      state.panelStudioArtifacts.set(artifactId, artifact);
      return clone(artifact);
    }
  };

  return { panelStudioArtifacts };
}
