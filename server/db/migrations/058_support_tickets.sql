-- Support Tickets: authenticated users file/follow a support ticket, admins reply as staff and
-- manage its status. Mirrors this repo's existing dm_threads/dm_messages shape (002/003) - a
-- parent conversation row plus a child message row, owner-only for a normal user, admin-only for
-- the staff/queue surface (server/admin/routes.support-tickets.mjs).
--
-- owner_unread is a plain boolean flag, not a "last read" timestamp compared against a "last
-- reply" timestamp - deliberately, to avoid a same-millisecond tie between a write and a read
-- ever making a genuinely-unread reply look read (or vice versa). Same idiom this repo already
-- uses for dm_messages.read_at (NULL/non-NULL, never a timestamp race): true the instant a staff
-- message is inserted, false the instant the owner opens the ticket (GET /:id).
CREATE TABLE IF NOT EXISTS support_tickets (
  id                     TEXT PRIMARY KEY,
  user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject                TEXT NOT NULL,
  category               TEXT NOT NULL CHECK (category IN ('technical','billing','account','other')),
  status                 TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','waiting_user','resolved','closed')),
  last_activity_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  owner_unread           BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Owner's own ticket list, most-recently-active first (GET /api/sync/support-tickets).
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets (user_id, last_activity_at DESC);
-- Admin queue: filter by status (the "awaiting staff response" count/filter is status='open'),
-- most-recently-active first.
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id            TEXT PRIMARY KEY,
  ticket_id     TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Snapshotted at write time from the authenticated session that made the call (never
  -- client-supplied - see routes.support-tickets.mjs/admin/routes.support-tickets.mjs), so a
  -- later role change can never retroactively repaint who spoke as staff in an existing thread.
  author_role   TEXT NOT NULL CHECK (author_role IN ('user','staff')),
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON support_ticket_messages (ticket_id, created_at);

-- Community notification-badge cursor (Section C.1 of the Support Tickets + badges brief): one
-- row per user, holding the last moment their own Community unread badge was acknowledged.
-- Initialized to now() on first read (repo.communityCursors.getOrInit), never backfilled, so
-- pre-existing Community content never produces a false first-login badge - same "never guess a
-- value for a row that predates the feature" precedent as 057_analysis_graph.sql's own column.
CREATE TABLE IF NOT EXISTS community_notification_cursors (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
