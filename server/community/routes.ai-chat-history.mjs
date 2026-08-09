import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

// History for the global AI assistant dock - mounted at /api/sync/ai-chat-history, behind
// requireAuth. Mirrors routes.mental-health.mjs exactly: one document per user (no
// uploadsDir/images sub-route, no GET /:id or DELETE /:id - addressed implicitly by
// req.currentUser.id), whole-array upsert rather than a partial patch.
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    const messages = await repo.aiChatHistory.get(req.currentUser.id);
    res.json({ messages });
  }));

  app.post('/', asyncHandler(async (req, res) => {
    const messages = req.body && req.body.messages;
    if (!Array.isArray(messages)) throw new ApiError(400, 'VALIDATION_FAILED');
    const saved = await repo.aiChatHistory.upsert(req.currentUser.id, messages);
    res.status(200).json({ messages: saved });
  }));

  return app;
}
