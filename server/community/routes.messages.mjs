import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { rateLimit, sessionKey } from './security/rate-limit.mjs';

function assertParticipant(thread, userId) {
  if (thread.buyerId !== userId && thread.sellerId !== userId) throw new ApiError(403, 'NOT_THREAD_PARTICIPANT');
}

// Launch-readiness audit fix (P1-3) - see routes.posts.mjs's identical comment for the full
// reasoning; same primitive, applied here to thread creation and message sending.
const threadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, keyFn: sessionKey('messages-thread') });
const messageLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyFn: sessionKey('messages-send') });

// Mounted at /api/messages, behind requireAuth. Threads are either anchored to a specific
// marketplace listing (buyer asking the seller about that item) or general (started from
// Community's "New message" dialog, listingId null) - see repo.threads.findOrCreate.
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

  // Either the existing product-anchored flow (listingId) or a general DM to any user
  // (counterpartyId, from Community's "New message" dialog) - repo.threads.findOrCreate resolves
  // both to the same idempotent thread lookup.
  app.post('/threads', threadLimiter, asyncHandler(async (req, res) => {
    const { listingId, counterpartyId } = req.body || {};
    if (!listingId && !counterpartyId) throw new ApiError(400, 'VALIDATION_FAILED');
    const thread = await repo.threads.findOrCreate({ listingId, counterpartyId, buyerId: req.currentUser.id });
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

  app.post('/threads/:id/messages', messageLimiter, asyncHandler(async (req, res) => {
    const thread = await repo.threads.get(req.params.id);
    if (!thread) throw new ApiError(404, 'THREAD_NOT_FOUND');
    assertParticipant(thread, req.currentUser.id);
    const message = await repo.messages.create({ threadId: thread.id, senderId: req.currentUser.id, content: (req.body || {}).content });
    res.status(201).json(message);
  }));

  return app;
}
