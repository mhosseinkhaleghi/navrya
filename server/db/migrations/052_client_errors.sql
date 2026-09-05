-- Launch-readiness audit fix (P1-1): a minimal, low-overhead error-telemetry table. Before this,
-- there was no error/crash reporting of any kind - an incident was only ever discovered by a user
-- report or by manually reading raw process stdout.
--
-- One row per (fingerprint, release_version) pair, never one row per occurrence - the exact
-- aggregation the audit's Section 18 design called for: a repeated error happening 100,000 times
-- must produce one row with a counter, never 100,000 writes. `sample_payload` deliberately never
-- carries screenshots, mental-health text, trade notes, passwords, cookies, or auth tokens - only
-- coarse client metadata (browser/os/viewport/language), enforced at the route layer
-- (routes.errors.mjs), not by this schema alone.
CREATE TABLE IF NOT EXISTS client_errors (
  id                TEXT PRIMARY KEY,
  fingerprint       TEXT NOT NULL,
  release_version   TEXT NOT NULL DEFAULT 'unknown',
  source            TEXT NOT NULL DEFAULT 'client' CHECK (source IN ('client','server')),
  message           TEXT NOT NULL,
  route             TEXT,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  occurrence_count  INTEGER NOT NULL DEFAULT 1,
  sample_payload    JSONB,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','ignored')),
  UNIQUE (fingerprint, release_version)
);
CREATE INDEX IF NOT EXISTS client_errors_status_idx ON client_errors (status, last_seen_at DESC);
