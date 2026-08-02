CREATE TABLE IF NOT EXISTS marketplace_listings (
  id                    TEXT PRIMARY KEY,
  seller_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                  TEXT NOT NULL CHECK (type IN ('pattern','strategy')),
  source_id             TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  price_amount          NUMERIC(12,2) NOT NULL CHECK (price_amount >= 0),
  price_currency        TEXT NOT NULL DEFAULT 'USD',
  success_rate_percent  NUMERIC(5,2),
  sample_size           INTEGER NOT NULL DEFAULT 0,
  evidence_as_of        TIMESTAMPTZ NOT NULL,
  preview_content       JSONB NOT NULL,
  full_content          JSONB NOT NULL,
  screenshots           JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','delisted')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_listings_status_idx ON marketplace_listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_listings_seller_idx ON marketplace_listings (seller_id);
CREATE INDEX IF NOT EXISTS marketplace_listings_source_idx ON marketplace_listings (source_id, seller_id);

CREATE TABLE IF NOT EXISTS marketplace_purchases (
  id                  TEXT PRIMARY KEY,
  listing_id          TEXT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  buyer_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchased_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  price_at_purchase   NUMERIC(12,2) NOT NULL,
  mock                BOOLEAN NOT NULL DEFAULT TRUE CHECK (mock = TRUE),
  UNIQUE (listing_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS marketplace_purchases_buyer_idx ON marketplace_purchases (buyer_id);

CREATE TABLE IF NOT EXISTS marketplace_ratings (
  id           TEXT PRIMARY KEY,
  listing_id   TEXT NOT NULL,
  buyer_id     TEXT NOT NULL,
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id),
  FOREIGN KEY (listing_id, buyer_id) REFERENCES marketplace_purchases (listing_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS marketplace_ratings_listing_idx ON marketplace_ratings (listing_id);

CREATE TABLE IF NOT EXISTS dm_threads (
  id          TEXT PRIMARY KEY,
  listing_id  TEXT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  buyer_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS dm_threads_buyer_idx ON dm_threads (buyer_id);
CREATE INDEX IF NOT EXISTS dm_threads_seller_idx ON dm_threads (seller_id);

CREATE TABLE IF NOT EXISTS dm_messages (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS dm_messages_thread_idx ON dm_messages (thread_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  target_type  TEXT NOT NULL CHECK (target_type IN ('post','comment','listing','message')),
  target_id    TEXT NOT NULL,
  reporter_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status, created_at);
CREATE INDEX IF NOT EXISTS reports_target_idx ON reports (target_type, target_id);
