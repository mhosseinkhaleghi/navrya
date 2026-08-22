import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

// Journey G (AI Companion & Journey Orchestration). Mounted at /api/sync/companion-state, behind
// requireAuth - see routes.trading-sessions.mjs's comment for why /api/sync/* is its own prefix,
// and routes.mental-health.mjs (the closest precedent) for why this router, like that one, takes
// only `repo` - no uploadsDir, no /images sub-route, since Companion state has no user-uploaded
// files. There is also no GET /:id or DELETE /:id - there is exactly one companion-state document
// per user, addressed implicitly by req.currentUser.id, never by a separate record id.
//
// What is ever stored here is deliberately small: walkthrough/onboarding flags, dismissed/snoozed
// step ids, an explicit user-chosen currentGoal, and communication preferences (never a
// psychological label, never Mental Health content - see docs/ai/companion-profile.md). The
// derived Journey snapshot itself (phase, completed milestones, nextBestStep) is never sent here -
// it is recomputed client-side from real product data on every read, exactly like every other
// derived value in this app stays synchronous and local (ARCHITECTURE.md's "reads stay
// synchronous" decision, Section 7.18).
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    const state = await repo.companionState.get(req.currentUser.id);
    res.json({ state });
  }));

  // Whole-document upsert - the client always sends the full, already-normalized state object,
  // never a partial patch, matching mental-health-store.js's own save() convention.
  app.post('/', asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'VALIDATION_FAILED');
    const saved = await repo.companionState.upsert(req.currentUser.id, body);
    res.status(200).json({ state: saved });
  }));

  return app;
}
