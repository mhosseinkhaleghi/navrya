import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

function assertParticipant(thread, userId) {
  if (thread.buyerId !== userId && thread.sellerId !== userId) throw new ApiError(403, 'NOT_THREAD_PARTICIPANT');
}

// Mounted at /api/messages, behind devUserAuth. Threads are always anchored to a specific
// marketplace listing (buyer asking the seller about that item) - never a general inbox.
export function router(repo) {
  const app = express.Router();

  app.get('/threads', asyncHandler(async (req, res) => {
    const threads = await repo.threads.listByUser(req.currentUser.id);
    const enriched = [];
    for (const thread of threads) {
      const messages = await repo.messages.listByThread(thread.id);
      const listing = await repo.listings.get(thread.listingId);
      const counterpartyId = thread.buyerId === req.currentUser.id ? thread.sellerId : thread.buyerId;
      enriched.push({
        ...thread,
        listingTitle: listing ? listing.title : null,
        counterparty: await repo.users.get(counterpartyId),
        lastMessage: messages.length ? messages[messages.length - 1] : null,
        unreadCount: messages.filter((m) => m.senderId !== req.currentUser.id && !m.readAt).length
      });
    }
    res.json(enriched);
  }));

  app.post('/threads', asyncHandler(async (req, res) => {
    const { listingId } = req.body || {};
    if (!listingId) throw new ApiError(400, 'VALIDATION_FAILED');
    const thread = await repo.threads.findOrCreate({ listingId, buyerId: req.currentUser.id });
    res.status(201).json(thread);
  }));

  app.get('/threads/:id', asyncHandler(async (req, res) => {
    const thread = await repo.threads.get(req.params.id);
    if (!thread) throw new ApiError(404, 'THREAD_NOT_FOUND');
    assertParticipant(thread, req.currentUser.id);
    await repo.messages.markRead({ threadId: thread.id, userId: req.currentUser.id });
    const messages = await repo.messages.listByThread(thread.id);
    res.json({ thread, messages });
  }));

  app.post('/threads/:id/messages', asyncHandler(async (req, res) => {
    const thread = await repo.threads.get(req.params.id);
    if (!thread) throw new ApiError(404, 'THREAD_NOT_FOUND');
    assertParticipant(thread, req.currentUser.id);
    const message = await repo.messages.create({ threadId: thread.id, senderId: req.currentUser.id, content: (req.body || {}).content });
    res.status(201).json(message);
  }));

  return app;
}
