import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { rateLimit, sessionKey } from './security/rate-limit.mjs';

// Same primitive/shape as routes.posts.mjs's postLimiter/commentLimiter and
// routes.messages.mjs's threadLimiter/messageLimiter - session-keyed, not IP-keyed (every caller
// here already has a real session).
const ticketCreateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyFn: sessionKey('support-ticket-create') });
const ticketReplyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, keyFn: sessionKey('support-ticket-reply') });

async function withAuthorNames(repo, messages) {
  const cache = new Map();
  async function nameFor(userId) {
    if (!cache.has(userId)) {
      const user = await repo.users.get(userId);
      cache.set(userId, user ? user.displayName : null);
    }
    return cache.get(userId);
  }
  const enriched = [];
  for (const message of messages) enriched.push({ ...message, authorName: await nameFor(message.authorId) });
  return enriched;
}

function ticketResponse(ticket) {
  return {
    id: ticket.id, subject: ticket.subject, category: ticket.category, status: ticket.status,
    lastActivityAt: ticket.lastActivityAt, createdAt: ticket.createdAt, unread: Boolean(ticket.ownerUnread)
  };
}

async function loadOwnedTicket(repo, id, userId) {
  const ticket = await repo.supportTickets.get(id);
  if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND');
  if (ticket.userId !== userId) throw new ApiError(403, 'NOT_TICKET_OWNER');
  return ticket;
}

// Mounted at /api/sync/support-tickets, behind requireAuth+csrfProtection (see app.mjs) - a
// normal authenticated user's own tickets only. The admin queue/reply surface is a separate
// router (server/admin/routes.support-tickets.mjs), mounted behind requireAdmin.
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    const tickets = await repo.supportTickets.listForUser(req.currentUser.id);
    res.json(tickets.map(ticketResponse));
  }));

  app.post('/', ticketCreateLimiter, asyncHandler(async (req, res) => {
    const { subject, category, message } = req.body || {};
    const ticket = await repo.supportTickets.create({ userId: req.currentUser.id, subject, category, content: message });
    res.status(201).json(ticketResponse(ticket));
  }));

  // Opening a ticket is what marks its staff replies read for the owner (spec section C.2) -
  // server-authoritative, never a separate client-driven "mark read" call the client could skip
  // or race.
  app.get('/:id', asyncHandler(async (req, res) => {
    const ticket = await loadOwnedTicket(repo, req.params.id, req.currentUser.id);
    await repo.supportTickets.markRead(ticket.id, req.currentUser.id);
    const messages = await withAuthorNames(repo, await repo.supportTickets.listMessages(ticket.id));
    res.json({ ticket: { ...ticketResponse(ticket), unread: false }, messages });
  }));

  app.post('/:id/messages', ticketReplyLimiter, asyncHandler(async (req, res) => {
    await loadOwnedTicket(repo, req.params.id, req.currentUser.id);
    const { message: content } = req.body || {};
    const result = await repo.supportTickets.reply({ ticketId: req.params.id, authorId: req.currentUser.id, authorRole: 'user', content });
    const [message] = await withAuthorNames(repo, [result.message]);
    res.status(201).json({ ticket: ticketResponse(result.ticket), message });
  }));

  app.post('/:id/close', asyncHandler(async (req, res) => {
    const ticket = await loadOwnedTicket(repo, req.params.id, req.currentUser.id);
    const closed = await repo.supportTickets.close(ticket.id, req.currentUser.id);
    res.json(ticketResponse(closed));
  }));

  return app;
}
