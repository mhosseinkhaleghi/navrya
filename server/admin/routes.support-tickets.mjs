import express from 'express';
import { asyncHandler, ApiError } from '../community/errors.mjs';

// Admin Support Tickets queue/reply surface - mounted at /api/admin/support-tickets, inherits
// requireAdmin from the /api/admin mount point (app.mjs), same "own file, mounted here to inherit
// requireAdmin for free" pattern as routes.voice-providers.mjs/routes.commercial.mjs.
export function router(repo) {
  const app = express.Router();

  async function audit(req, action, targetType, targetId, details) {
    await repo.auditLog.create({ adminUserId: req.currentUser.id, action, targetType, targetId, details: details || {} });
  }

  async function ownersById(tickets) {
    const ids = Array.from(new Set(tickets.map((t) => t.userId)));
    const users = await Promise.all(ids.map((id) => repo.users.get(id)));
    const byId = {};
    users.forEach((user, i) => { byId[ids[i]] = user; });
    return byId;
  }

  function enrich(ticket, owner) {
    return {
      id: ticket.id, subject: ticket.subject, category: ticket.category, status: ticket.status,
      lastActivityAt: ticket.lastActivityAt, createdAt: ticket.createdAt, awaitingStaff: ticket.status === 'open',
      ownerId: ticket.userId, ownerName: owner ? owner.displayName : null, ownerEmail: owner ? owner.email : null
    };
  }

  // Filter (status/category) happens in the repo; search (subject / owner name / owner email /
  // ticket id) and pagination happen here, in JS - the same split GET /api/admin/users already
  // established (repo.users.list() -> the route itself filters/sorts/pages), reused rather than
  // inventing a second convention.
  app.get('/', asyncHandler(async (req, res) => {
    const status = req.query.status && req.query.status !== 'all' ? req.query.status : undefined;
    const category = req.query.category && req.query.category !== 'all' ? req.query.category : undefined;
    const tickets = await repo.supportTickets.listAll({ status, category });
    const owners = await ownersById(tickets);
    let rows = tickets.map((ticket) => enrich(ticket, owners[ticket.userId]));

    const search = String(req.query.search || '').trim().toLowerCase();
    if (search) {
      rows = rows.filter((row) =>
        row.id.toLowerCase().includes(search) ||
        row.subject.toLowerCase().includes(search) ||
        (row.ownerName && row.ownerName.toLowerCase().includes(search)) ||
        (row.ownerEmail && row.ownerEmail.toLowerCase().includes(search)));
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const total = rows.length;
    res.json({ tickets: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const ticket = await repo.supportTickets.get(req.params.id);
    if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND');
    const owner = await repo.users.get(ticket.userId);
    const rawMessages = await repo.supportTickets.listMessages(ticket.id);
    const authorCache = new Map([[ticket.userId, owner]]);
    const messages = [];
    for (const message of rawMessages) {
      if (!authorCache.has(message.authorId)) authorCache.set(message.authorId, await repo.users.get(message.authorId));
      const author = authorCache.get(message.authorId);
      messages.push({ ...message, authorName: author ? author.displayName : null });
    }
    res.json({ ticket: enrich(ticket, owner), messages });
  }));

  // Staff reply. `nextStatus` is optional (defaults to 'waiting_user' - see repo.supportTickets.reply)
  // and is how an admin resolves/closes a ticket in the same action as their reply, rather than a
  // second round trip.
  app.post('/:id/messages', asyncHandler(async (req, res) => {
    const { message, nextStatus } = req.body || {};
    const result = await repo.supportTickets.reply({ ticketId: req.params.id, authorId: req.currentUser.id, authorRole: 'staff', content: message, nextStatus });
    await audit(req, 'support-ticket.reply', 'support_ticket', req.params.id, { nextStatus: result.ticket.status });
    const owner = await repo.users.get(result.ticket.userId);
    res.status(201).json({ ticket: enrich(result.ticket, owner), message: { ...result.message, authorName: req.currentUser.displayName } });
  }));

  // Status-only change (no accompanying message) - e.g. resolving after an out-of-band contact,
  // or reopening a closed ticket (the one supported way a closed ticket ever moves again).
  app.patch('/:id/status', asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    const updated = await repo.supportTickets.updateStatus(req.params.id, status);
    await audit(req, 'support-ticket.status', 'support_ticket', req.params.id, { status });
    const owner = await repo.users.get(updated.userId);
    res.json(enrich(updated, owner));
  }));

  return app;
}
