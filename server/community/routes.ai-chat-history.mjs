import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

// Real, multiple, resumable conversations for the global AI assistant dock - mounted at
// /api/sync/ai-chat-history, behind requireAuth, ownership enforced via req.currentUser.id
// exactly like routes.trades.mjs/routes.patterns.mjs already do for their own per-record routes.
// Replaces the original one-row-per-user "flat messages array" shape (014_ai_chat_history.sql) -
// see 017_ai_conversations.sql for why that reshape was safe.
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ conversations: await repo.aiChatHistory.list(req.currentUser.id) });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const record = await repo.aiChatHistory.get(req.currentUser.id, req.params.id);
    if (!record) throw new ApiError(404, 'CONVERSATION_NOT_FOUND');
    res.json(record);
  }));

  app.post('/', asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!Array.isArray(body.messages) || !body.messages.length) throw new ApiError(400, 'VALIDATION_FAILED');
    const record = await repo.aiChatHistory.create({ userId: req.currentUser.id, provider: body.provider, title: body.title, messages: body.messages, tokens: body.tokens });
    res.status(201).json(record);
  }));

  // Whole-array replace for messages, not a partial patch - the dock always sends its full
  // accumulated transcript, same "replace nested data wholesale" convention every other migrated
  // module uses. `tokens` is this call's new tokens only (incremented server-side), not a total.
  app.patch('/:id', asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!Array.isArray(body.messages) || !body.messages.length) throw new ApiError(400, 'VALIDATION_FAILED');
    const record = await repo.aiChatHistory.appendAndSave(req.currentUser.id, req.params.id, { title: body.title, messages: body.messages, tokens: body.tokens });
    if (!record) throw new ApiError(404, 'CONVERSATION_NOT_FOUND');
    res.json(record);
  }));

  app.delete('/:id', asyncHandler(async (req, res) => {
    const removed = await repo.aiChatHistory.remove(req.currentUser.id, req.params.id);
    if (!removed) throw new ApiError(404, 'CONVERSATION_NOT_FOUND');
    res.status(204).end();
  }));

  return app;
}
