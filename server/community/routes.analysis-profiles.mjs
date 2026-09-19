import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

// Analysis Profiles domain (see ARCHITECTURE.md §7.25). Mounted at /api/sync/analysis-profiles,
// behind devUserAuth/requireAuth - see routes.trading-sessions.mjs's comment for why /api/sync/*
// is its own prefix, separate from the AI-only gateway. Mirrors routes.patterns.mjs's shape
// exactly, minus an /images route - this domain has no user-uploaded files.
//
// Deliberately NOT gated by createWithQuota (unlike Patterns/Strategies, which are commercial
// content domains with their own plan limits) - Analysis Profiles is a foundational identity
// domain the brief never asked to be plan-limited; adding that gate would be unrequested scope.
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ analysisProfiles: await repo.analysisProfiles.listByUser(req.currentUser.id) });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const record = await repo.analysisProfiles.get(req.currentUser.id, req.params.id);
    if (!record) throw new ApiError(404, 'ANALYSIS_PROFILE_NOT_FOUND');
    res.json(record);
  }));

  // Idempotent upsert by the record's own client-generated id - the one write path
  // server-replica.js's upsert() always calls, for both a brand-new profile and an edit.
  app.post('/', asyncHandler(async (req, res) => {
    const record = req.body || {};
    if (!record.id) throw new ApiError(400, 'VALIDATION_FAILED');
    const saved = await repo.analysisProfiles.upsert(req.currentUser.id, record);
    res.status(200).json(saved);
  }));

  app.delete('/:id', asyncHandler(async (req, res) => {
    await repo.analysisProfiles.remove(req.currentUser.id, req.params.id);
    res.status(204).end();
  }));

  // Engine-memory learning ledger (068_analysis_profile_memory.sql) - append-only, nested under
  // its owning profile (same "action route under the parent id" shape as routes.media.mjs's own
  // POST /assets/:id/links), never a top-level server-replica list domain: lazily fetched only
  // when a profile's Memory tab actually opens, not part of the boot-time hydrate every list
  // domain participates in. Ownership is re-checked against the real profile row inside the repo
  // methods themselves, never trusted from the URL alone.
  app.get('/:id/events', asyncHandler(async (req, res) => {
    res.json({ events: await repo.analysisProfileEvents.listByProfile(req.currentUser.id, req.params.id) });
  }));
  app.post('/:id/events', asyncHandler(async (req, res) => {
    const saved = await repo.analysisProfileEvents.create(req.currentUser.id, req.params.id, req.body || {});
    res.status(201).json(saved);
  }));

  return app;
}
