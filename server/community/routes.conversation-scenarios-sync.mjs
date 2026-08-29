import express from 'express';
import { asyncHandler } from './errors.mjs';

// Journey H2, Gate 2: the public, real-user-authenticated (never admin-gated - this is app
// content, not user data) bundle the browser Conversation Router actually fetches. Mounted at
// /api/sync/conversation-scenarios alongside every other /api/sync/* domain (see
// server/community/app.mjs) - the applicable existing prefix for browser-fetched, already-
// authenticated content, unlike the voice-provider precedent (admin_voice_character_configs),
// which is consumed by a different backend PROCESS (pattern-ai-server.mjs) via its own
// /internal/* bridge, not by a browser fetch at all.
//
// Returns ONLY the trimmed, production-safe shape (spec section 33): no admin metadata, no draft
// content, no authoring prompts - repo.conversationScenarios.listPublishedForBundle() already
// enforces "published, non-archived only" at the query level, so this route has nothing further
// to filter, only to shape into the response envelope.
//
// `version`/`updatedAt` are informational diagnostics (surfaced client-side via
// debugLastMatch().bundleVersion) - nothing in this gate uses them to drive push-based
// invalidation logic; the client's own lazy 5-minute refresh (ai-conversation-router.js) is what
// actually keeps the bundle fresh, per spec section 34's "reasonable refresh mechanism, don't poll
// aggressively" instruction.
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    const scenarios = await repo.conversationScenarios.listPublishedForBundle();
    let updatedAt = null;
    scenarios.forEach((s) => {
      const stamp = s.publishedAt ? new Date(s.publishedAt).getTime() : 0;
      if (!updatedAt || stamp > new Date(updatedAt).getTime()) updatedAt = s.publishedAt || updatedAt;
    });
    res.json({
      version: scenarios.length + ':' + (updatedAt || 'empty'),
      updatedAt: updatedAt,
      scenarios: scenarios.map((s) => ({
        id: s.id, scenarioKey: s.scenarioKey, domain: s.domain, kind: s.kind,
        dataQueryRef: s.dataQueryRef, ctaActionId: s.ctaActionId,
        allowedProcesses: s.allowedProcesses, allowedSteps: s.allowedSteps,
        publishedVersion: s.publishedVersion, definition: s.definition,
        // Journey H2, Gate 3: {[language]: {[variantKey]: {url, mimeType, durationMs}}} - only
        // ever approved, hash-current assets (repo.conversationScenarios.listPublishedForBundle()
        // already re-verifies this) - never voice_profile_key/voice_id/provider/credential
        // internals, never a non-approved candidate.
        audio: s.audio || {}
      }))
    });
  }));

  return app;
}
