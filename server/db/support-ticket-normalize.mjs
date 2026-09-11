import { ApiError } from '../community/errors.mjs';

// Shared, backend-agnostic validation for the Support Tickets domain (058_support_tickets.sql) -
// imported by both repo.pg.mjs and repo.memory.mjs so the same field limits/enum are enforced
// identically regardless of which backend is injected, matching this repo's existing
// instrument-normalize.mjs/learned-command-normalize.mjs precedent of a shared pure-validation
// module rather than duplicating the same rule twice.
export const TICKET_CATEGORIES = ['technical', 'billing', 'account', 'other'];
export const TICKET_STATUSES = ['open', 'waiting_user', 'resolved', 'closed'];
export const SUBJECT_MAX_LENGTH = 160;
export const MESSAGE_MAX_LENGTH = 5000;

export function normalizeTicketSubject(subject) {
  const trimmed = String(subject || '').trim();
  if (!trimmed || trimmed.length > SUBJECT_MAX_LENGTH) throw new ApiError(400, 'VALIDATION_FAILED');
  return trimmed;
}

export function normalizeTicketCategory(category) {
  if (!TICKET_CATEGORIES.includes(category)) throw new ApiError(400, 'VALIDATION_FAILED');
  return category;
}

export function normalizeTicketMessage(content) {
  const trimmed = String(content || '').trim();
  if (!trimmed || trimmed.length > MESSAGE_MAX_LENGTH) throw new ApiError(400, 'VALIDATION_FAILED');
  return trimmed;
}
