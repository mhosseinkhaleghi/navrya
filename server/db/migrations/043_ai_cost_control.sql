-- AI Cost Control dashboard (Admin > Commercial). Extends the existing canonical AI billing
-- system (037_ai_usage_events_authoritative.sql's ai_usage_events, 029_provider_model_pricing.sql's
-- provider_model_pricing, wallet_ledger) rather than creating a second usage ledger, a second
-- wallet, or a second pricing path. Four concerns, kept in four tables:
--
-- 1. Normalized usage-breakdown columns on ai_usage_events (cached/cache-write input tokens,
--    reasoning tokens) - additive/nullable, so every existing row and every existing reader is
--    unaffected. `usage_raw` keeps the provider's own unmodified usage object for audit, never
--    parsed/trusted for cost math (that stays server/commercial/wallet-service.mjs's job).
-- 2. Cached-input/cache-write pricing dimensions on provider_model_pricing - additive/nullable,
--    so an existing prompt/completion-only row keeps pricing exactly as it always has.
-- 3. A dedicated, encrypted-at-rest credential store for EXTERNAL provider cost-reconciliation
--    APIs (e.g. an OpenAI organization admin key) - deliberately separate from the legacy
--    plaintext admin_ai_keys (004_admin.sql, used only to call the model API itself) and from
--    admin_voice_provider_credentials (023_voice_providers.sql, a different provider category).
--    Same AES-256-GCM envelope/masked-response convention as those two encrypted tables
--    (server/community/security/crypto-util.mjs's encryptSecret()/decryptSecret()) - multi-row,
--    multi-provider, generated id (an org may hold more than one credential per provider, and
--    future providers reuse this same table without a schema change).
-- 4. Durable, auditable snapshots of what a provider's OFFICIAL cost API actually reported for a
--    given scope/period - never a second internal usage ledger, purely an external-truth mirror
--    fetched on admin-triggered refresh. One immutable row per (sync run, period bucket, line
--    item), so a later query always picks one specific run's rows for a given period rather than
--    silently summing across two different refreshes covering overlapping ranges.
--
-- Additive only - expand, never edit 001-042.

ALTER TABLE ai_usage_events
  ADD COLUMN IF NOT EXISTS cached_input_tokens     INTEGER,
  ADD COLUMN IF NOT EXISTS cache_write_input_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS reasoning_tokens         INTEGER,
  -- The provider's own raw usage object, verbatim, for admin drill-down/audit only - never read
  -- by any pricing/reconciliation code path (those read the normalized columns above).
  ADD COLUMN IF NOT EXISTS usage_raw                JSONB;

ALTER TABLE provider_model_pricing
  ADD COLUMN IF NOT EXISTS cached_input_price_per_1k     NUMERIC,
  ADD COLUMN IF NOT EXISTS cache_write_input_price_per_1k NUMERIC;

-- Encrypted credentials for provider cost-reconciliation APIs (OpenAI organization Costs API
-- today; the same table serves any future provider's own reconciliation credential without a
-- migration). `scope_config` holds real but NON-secret scoping data (e.g. an OpenAI project id to
-- filter organization-wide cost data down to NAVRYA's own usage) - never a credential value.
CREATE TABLE IF NOT EXISTS provider_cost_credentials (
  id                 TEXT PRIMARY KEY,
  provider           TEXT NOT NULL,
  label              TEXT NOT NULL,
  api_key_encrypted  TEXT NOT NULL,
  key_hint           TEXT NOT NULL,               -- last 4 chars only, e.g. "…a1b2" - never the raw key
  scope_config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled            BOOLEAN NOT NULL DEFAULT true,
  validation_status  TEXT NOT NULL DEFAULT 'unknown', -- 'unknown' | 'valid' | 'invalid' | 'restricted'
  validation_error   TEXT,                          -- sanitized reason only, never a raw upstream body
  validated_at       TIMESTAMPTZ,
  updated_by         TEXT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_cost_credentials_provider_idx ON provider_cost_credentials (provider);

-- One row per admin-triggered (or, later, scheduled) fetch attempt against a provider's official
-- cost API for one requested UTC range. `status` lets a genuinely failed/partial fetch be shown
-- honestly instead of as "$0 spent" - see status values below.
CREATE TABLE IF NOT EXISTS provider_cost_sync_runs (
  id                TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,
  scope_key         TEXT NOT NULL,                 -- e.g. an OpenAI project id, or 'default' when a provider has no sub-scope
  requested_start    TIMESTAMPTZ NOT NULL,
  requested_end      TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'error')),
  error_code        TEXT,                          -- sanitized reason only, never a raw upstream body or secret
  triggered_by      TEXT REFERENCES users(id),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS provider_cost_sync_runs_lookup_idx ON provider_cost_sync_runs (provider, scope_key, status, requested_start, requested_end);

-- Immutable line items from ONE successful sync run. A read never merges rows across two
-- different runs for an overlapping period - it always selects the single latest successful run
-- whose requested range covers the period being displayed (see
-- server/commercial/provider-cost/reconciliation-service.mjs), so two overlapping refreshes can
-- never double-count.
CREATE TABLE IF NOT EXISTS provider_cost_snapshots (
  id                TEXT PRIMARY KEY,
  sync_run_id       TEXT NOT NULL REFERENCES provider_cost_sync_runs(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL,
  scope_key         TEXT NOT NULL,
  period_start      TIMESTAMPTZ NOT NULL,
  period_end        TIMESTAMPTZ NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'usd',
  amount_micro_usd  BIGINT NOT NULL,
  -- The provider's own free-text cost-category label (e.g. OpenAI's "line_item":
  -- "gpt-4o, input") - a real but NOT normalized model id; never auto-mapped onto this app's own
  -- model ids (see the adapter's own header comment for why).
  line_item         TEXT,
  project_id        TEXT,                          -- provider-reported project/sub-scope for this row, when grouped by it
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_cost_snapshots_run_idx ON provider_cost_snapshots (sync_run_id);
CREATE INDEX IF NOT EXISTS provider_cost_snapshots_lookup_idx ON provider_cost_snapshots (provider, scope_key, period_start, period_end);

-- Optional, explicitly-labeled manual balance entry - never used for reconciliation math (no
-- official OpenAI balance API exists today - see docs/ai/ai-cost-control.md). Purely an operator
-- convenience note with a real timestamp/author, always rendered with a "manual, not reconciled"
-- label by the UI.
CREATE TABLE IF NOT EXISTS provider_balance_manual_snapshots (
  id                TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,
  amount_micro_usd  BIGINT NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'usd',
  note              TEXT,
  admin_user_id     TEXT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_balance_manual_snapshots_provider_idx ON provider_balance_manual_snapshots (provider, created_at DESC);
