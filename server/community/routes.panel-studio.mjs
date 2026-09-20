import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

// Ordinary session-cookie-authenticated CRUD for the Vibe Coding Panel Studio's artifact/revision
// domain, mounted at /api/sync/panel-studio behind app.mjs's global requireAuth+csrfProtection -
// NOT behind the internal secret (compare server/community/routes.internal.mjs's
// /panel-artifacts/revisions bridge, which pattern-ai-server.mjs alone calls after a streamed
// generation completes). This router covers everything a browser does directly: listing an
// artifact's own history, a manual source edit, restoring an old revision, applying a revision to
// the dashboard, and archiving.
//
// Restore is deliberately NOT a separate repo method - it is createRevision() with
// sourceKind:'restore' and the source loaded server-side from the target revision (never resent by
// the client), mirroring conversationScenarios.rollback()'s "copy server-side, never trust the
// caller's copy" precedent.

const MAX_MANUAL_SOURCE_BYTES = 12 * 1024;

function byteLength(text) {
  return Buffer.byteLength(String(text || ''), 'utf8');
}

function artifactResponse(artifact) {
  return {
    id: artifact.id, target: artifact.target, title: artifact.title, status: artifact.status,
    currentRevisionId: artifact.currentRevisionId, appliedRevisionId: artifact.appliedRevisionId,
    createdAt: artifact.createdAt, updatedAt: artifact.updatedAt
  };
}

function revisionResponse(revision) {
  return {
    id: revision.id, artifactId: revision.artifactId, revisionNumber: revision.revisionNumber,
    source: revision.source, sourceKind: revision.sourceKind, prompt: revision.prompt,
    restoredFromRevisionId: revision.restoredFromRevisionId, provider: revision.provider,
    model: revision.model, codingEngineId: revision.codingEngineId, createdAt: revision.createdAt
  };
}

async function loadOwnedArtifact(repo, id, userId) {
  const artifact = await repo.panelStudioArtifacts.get(id);
  if (!artifact) throw new ApiError(404, 'ARTIFACT_NOT_FOUND');
  if (artifact.userId !== userId) throw new ApiError(403, 'NOT_ARTIFACT_OWNER');
  return artifact;
}

export function router(repo) {
  const app = express.Router();

  app.get('/artifacts', asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const artifacts = await repo.panelStudioArtifacts.listForUser(req.currentUser.id, { status });
    res.json(artifacts.map(artifactResponse));
  }));

  app.get('/artifacts/:id', asyncHandler(async (req, res) => {
    const artifact = await loadOwnedArtifact(repo, req.params.id, req.currentUser.id);
    const revisions = await repo.panelStudioArtifacts.listRevisions(artifact.id);
    res.json({ artifact: artifactResponse(artifact), revisions: revisions.map(revisionResponse) });
  }));

  // sourceKind 'manual-edit': the trader edited the code pane directly and explicitly saved.
  // sourceKind 'restore': copies a past revision's source into a brand-new top revision - the past
  // revision itself is never mutated. Both go through the SAME createRevision() path a real AI
  // generation uses (server/community/routes.internal.mjs's /panel-artifacts/revisions bridge), so
  // there is exactly one place revision history is ever appended to.
  app.post('/artifacts/:id/revisions', asyncHandler(async (req, res) => {
    const artifact = await loadOwnedArtifact(repo, req.params.id, req.currentUser.id);
    const body = req.body || {};
    const sourceKind = body.sourceKind;
    const baseRevisionId = body.baseRevisionId ? String(body.baseRevisionId) : null;

    let source;
    let restoredFromRevisionId = null;
    if (sourceKind === 'restore') {
      restoredFromRevisionId = String(body.restoredFromRevisionId || '');
      if (!restoredFromRevisionId) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'restoredFromRevisionId' });
      const target = await repo.panelStudioArtifacts.getRevision(restoredFromRevisionId);
      if (!target || target.artifactId !== artifact.id) throw new ApiError(404, 'REVISION_NOT_FOUND');
      // Loaded server-side, never resent by the client - the client only names WHICH revision to
      // restore, it never gets to supply what the restored source actually is.
      source = target.source;
    } else if (sourceKind === 'manual-edit') {
      source = String(body.source || '');
      if (!source.trim()) throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'source' });
      if (byteLength(source) > MAX_MANUAL_SOURCE_BYTES) throw new ApiError(400, 'SOURCE_TOO_LARGE', null, { limit: MAX_MANUAL_SOURCE_BYTES });
    } else {
      throw new ApiError(400, 'VALIDATION_FAILED', null, { field: 'sourceKind' });
    }

    const result = await repo.panelStudioArtifacts.createRevision({
      userId: req.currentUser.id, artifactId: artifact.id, target: artifact.target, source, sourceKind,
      prompt: null, restoredFromRevisionId, provider: null, model: null, codingEngineId: null,
      baseRevisionId, createdBy: req.currentUser.id
    });
    res.status(201).json({ artifact: artifactResponse(result.artifact), revision: revisionResponse(result.revision) });
  }));

  app.post('/artifacts/:id/apply', asyncHandler(async (req, res) => {
    const artifact = await loadOwnedArtifact(repo, req.params.id, req.currentUser.id);
    const revisionId = req.body && req.body.revisionId ? String(req.body.revisionId) : undefined;
    const updated = await repo.panelStudioArtifacts.apply(artifact.id, req.currentUser.id, revisionId);
    res.json(artifactResponse(updated));
  }));

  app.post('/artifacts/:id/archive', asyncHandler(async (req, res) => {
    await loadOwnedArtifact(repo, req.params.id, req.currentUser.id);
    const updated = await repo.panelStudioArtifacts.archive(req.params.id, req.currentUser.id);
    res.json(artifactResponse(updated));
  }));

  app.post('/artifacts/:id/unarchive', asyncHandler(async (req, res) => {
    await loadOwnedArtifact(repo, req.params.id, req.currentUser.id);
    const updated = await repo.panelStudioArtifacts.unarchive(req.params.id, req.currentUser.id);
    res.json(artifactResponse(updated));
  }));

  return app;
}
