-- Support Ticket attachments (image/video) - additive column on the existing
-- support_ticket_messages table (058_support_tickets.sql). Each element is
-- {url, type ('image'|'video'), mimeType} - the SAME shape posts.images already uses for
-- Community, just per-message instead of per-post. Files themselves are saved via
-- server/storage/storage.mjs's saveImages()/saveVideos() under uploads/ticket/ (a PRIVATE
-- category - see app.mjs's PRIVATE_UPLOAD_CATEGORIES and security/upload-ownership.mjs's new
-- 'ticket' resolver), never a public one - a support attachment can contain sensitive
-- account/billing screenshots.
ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
