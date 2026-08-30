import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

// Journey H2 expressive/context follow-up. Mounted at /api/sync/conversation-scenario-exposures,
// behind the same global requireAuth() every /api/sync/* route already sits behind (see
// server/community/app.mjs) - real per-user data, never admin-gated.
//
// The one, small, bounded map ai-conversation-router.js's own variant selector needs: how many
// times has each published scenario already been delivered to THIS user, and with which variant
// last. `POST /record` is the ONE write path, and it always server-increments - a client can only
// ever say "this exact scenario was just delivered," never supply a count directly (spec section
// 16's own "never trust a client-supplied count" rule).
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    const rows = await repo.conversationScenarioExposures.getAllForUser(req.currentUser.id);
    const byScenarioKey = {};
    rows.forEach((row) => {
      byScenarioKey[row.scenarioKey] = { count: row.count, lastPresentedAt: row.lastPresentedAt, lastVariantKey: row.lastVariantKey };
    });
    res.json({ exposures: byScenarioKey });
  }));

  app.post('/record', asyncHandler(async (req, res) => {
    const scenarioKey = String((req.body || {}).scenarioKey || '').trim();
    if (!scenarioKey) throw new ApiError(400, 'VALIDATION_FAILED');
    const variantKey = (req.body || {}).variantKey ? String(req.body.variantKey).trim() : null;
    const record = await repo.conversationScenarioExposures.record(req.currentUser.id, scenarioKey, variantKey);
    res.status(200).json({
      exposure: { count: record.count, lastPresentedAt: record.lastPresentedAt, lastVariantKey: record.lastVariantKey }
    });
  }));

  return app;
}
