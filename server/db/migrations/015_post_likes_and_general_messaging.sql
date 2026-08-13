CREATE TABLE IF NOT EXISTS post_likes (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_likes_post_idx ON post_likes (post_id);

-- dm_threads used to require a listing (buyer asking a seller about that item). The Community
-- redesign's "New message" flow needs general, listing-less DMs to any user, so listing_id
-- becomes optional and the uniqueness rule splits into two partial indexes: one per
-- (listing, buyer) for the existing product-anchored flow, one per unordered user pair for
-- general threads (regardless of who started it).
ALTER TABLE dm_threads ALTER COLUMN listing_id DROP NOT NULL;
ALTER TABLE dm_threads DROP CONSTRAINT IF EXISTS dm_threads_listing_id_buyer_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS dm_threads_listing_buyer_uidx
  ON dm_threads (listing_id, buyer_id) WHERE listing_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dm_threads_general_pair_uidx
  ON dm_threads (LEAST(buyer_id, seller_id), GREATEST(buyer_id, seller_id)) WHERE listing_id IS NULL;
