-- Referral & Affiliate subsystem, part 1/3: admin-owned programs, immutable published versions,
-- and audited per-user partner assignments. Additive only (001-067 untouched).
--
-- referral_programs / referral_program_versions: a program (STANDARD or INFLUENCER "kind") is a
-- container; every financial rule lives on a VERSION of it, never on the program row itself.
-- Editing financial rules always creates a new version - a published/superseded/archived version's
-- rule columns are immutable (enforced by the trigger below, mirroring subscription_bonus_
-- allocations' own "database refuses the write" precedent from 065_subscription_bonus_lots.sql),
-- so a past attribution/earning's snapshot of "the rules at the time" can never be retroactively
-- altered by a later edit. Money is integer micro-USD, rates are integer basis points (0-10000) -
-- never floats, per instruction.
--
-- referral_partner_assignments: the dedicated, audited domain that assigns Disabled/Standard/
-- Influencer to a specific user. This is INTENTIONALLY separate from users.profile_role (a
-- user-editable, unrelated field - see 005_account_profile.sql) and from users.role (authorization,
-- not commercial). A user can never write to this table themselves - every route that touches it
-- requires admin authorization (see server/admin/routes.referrals.mjs). Like discount_redemptions,
-- an assignment's own terms are immutable once created - "editing" one supersedes it with a new
-- row, preserving the exact terms an attribution/earning snapshot was made under.
CREATE TABLE IF NOT EXISTS referral_programs (
  id                        TEXT PRIMARY KEY,
  kind                      TEXT NOT NULL CHECK (kind IN ('standard', 'influencer')),
  name                      TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  is_platform_default       BOOLEAN NOT NULL DEFAULT false,
  auto_enroll_unassigned    BOOLEAN NOT NULL DEFAULT false,
  created_by                TEXT REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Only a STANDARD-kind program can ever be the platform default (an influencer partnership is
  -- never a fallback for unassigned users, by definition).
  CHECK (kind = 'standard' OR is_platform_default = false)
);
-- At most one platform-default program at a time - the implicit-standard resolution
-- (referral-rules.mjs's resolveEffectiveMode()) reads exactly this one row.
CREATE UNIQUE INDEX IF NOT EXISTS referral_programs_single_default_uidx ON referral_programs (is_platform_default) WHERE is_platform_default = true;
CREATE INDEX IF NOT EXISTS referral_programs_status_idx ON referral_programs (status);

CREATE TABLE IF NOT EXISTS referral_program_versions (
  id                              TEXT PRIMARY KEY,
  program_id                      TEXT NOT NULL REFERENCES referral_programs(id),
  version_no                      INT NOT NULL CHECK (version_no >= 1),
  status                          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'superseded', 'archived')),
  commission_bps                  INT NOT NULL CHECK (commission_bps BETWEEN 0 AND 10000),
  -- Never 'wallet_topup' - the CHECK below enforces every element is one of the three real
  -- eligible-source values, so a top-up can never be configured as commission-earning even by
  -- admin mistake (instruction: "Wallet top-ups must never earn commission").
  eligible_sources                TEXT[] NOT NULL DEFAULT ARRAY['subscription'],
  eligible_plans                  TEXT[],  -- NULL = every plan eligible
  attribution_window_days         INT NOT NULL DEFAULT 30 CHECK (attribution_window_days BETWEEN 1 AND 365),
  hold_days                       INT NOT NULL DEFAULT 14 CHECK (hold_days BETWEEN 0 AND 180),
  commission_term_days            INT CHECK (commission_term_days IS NULL OR commission_term_days >= 1),
  cash_out_minimum_micro_usd      BIGINT NOT NULL DEFAULT 10000000 CHECK (cash_out_minimum_micro_usd >= 0),
  program_budget_cap_micro_usd    BIGINT CHECK (program_budget_cap_micro_usd IS NULL OR program_budget_cap_micro_usd >= 0),
  per_user_cap_micro_usd          BIGINT CHECK (per_user_cap_micro_usd IS NULL OR per_user_cap_micro_usd >= 0),
  per_customer_cap_micro_usd      BIGINT CHECK (per_customer_cap_micro_usd IS NULL OR per_customer_cap_micro_usd >= 0),
  campaign_cap_micro_usd          BIGINT CHECK (campaign_cap_micro_usd IS NULL OR campaign_cap_micro_usd >= 0),
  max_referred_customers          INT CHECK (max_referred_customers IS NULL OR max_referred_customers >= 1),
  -- Contribution-margin guard estimates (no per-payment fee/cost column exists yet - see
  -- payment_transactions' own column list - so these are admin-set, program-version-snapshotted
  -- estimates, never a real per-payment lookup).
  min_margin_micro_usd            BIGINT NOT NULL DEFAULT 0 CHECK (min_margin_micro_usd >= 0),
  min_margin_bps                  INT NOT NULL DEFAULT 0 CHECK (min_margin_bps BETWEEN 0 AND 10000),
  payment_fee_bps                 INT NOT NULL DEFAULT 0 CHECK (payment_fee_bps BETWEEN 0 AND 10000),
  service_cost_bps                INT NOT NULL DEFAULT 0 CHECK (service_cost_bps BETWEEN 0 AND 10000),
  payout_asset_policy             TEXT NOT NULL DEFAULT 'bep20_usdt' CHECK (payout_asset_policy IN ('bep20_usdt')),
  effective_from                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to                    TIMESTAMPTZ,
  rules_hash                      TEXT NOT NULL,
  created_by                      TEXT REFERENCES users(id),
  published_at                    TIMESTAMPTZ,
  published_by                    TEXT REFERENCES users(id),
  archived_at                     TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, version_no),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (
    array_length(eligible_sources, 1) > 0
    AND eligible_sources <@ ARRAY['subscription', 'storage_purchase', 'ai_margin']::text[]
  ),
  -- A published version always records who published it and when (superseded/archived versions
  -- keep those values, so the history of "who approved these rules" is never lost).
  CHECK (status <> 'published' OR (published_at IS NOT NULL AND published_by IS NOT NULL))
);
-- At most one PUBLISHED version per program - the single source of "what STANDARD pays right now"
-- (server/commercial/referral-programs.mjs never has to pick among several).
CREATE UNIQUE INDEX IF NOT EXISTS referral_program_versions_single_published_uidx ON referral_program_versions (program_id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS referral_program_versions_program_idx ON referral_program_versions (program_id, version_no DESC);

-- Once a version leaves 'draft', every rule column is frozen - only status/effective_to/
-- published_at/published_by/archived_at/updated_at may still change (publish/pause/archive
-- transitions). This is the real enforcement of "editing financial rules must create a new
-- version; never retroactively alter past attributions or earnings" - a snapshot taken from a
-- published version can never be invalidated by a later edit to that same row.
CREATE OR REPLACE FUNCTION referral_program_versions_guard_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF NEW.program_id IS DISTINCT FROM OLD.program_id OR NEW.version_no IS DISTINCT FROM OLD.version_no
      OR NEW.commission_bps IS DISTINCT FROM OLD.commission_bps
      OR NEW.eligible_sources IS DISTINCT FROM OLD.eligible_sources
      OR NEW.eligible_plans IS DISTINCT FROM OLD.eligible_plans
      OR NEW.attribution_window_days IS DISTINCT FROM OLD.attribution_window_days
      OR NEW.hold_days IS DISTINCT FROM OLD.hold_days
      OR NEW.commission_term_days IS DISTINCT FROM OLD.commission_term_days
      OR NEW.cash_out_minimum_micro_usd IS DISTINCT FROM OLD.cash_out_minimum_micro_usd
      OR NEW.program_budget_cap_micro_usd IS DISTINCT FROM OLD.program_budget_cap_micro_usd
      OR NEW.per_user_cap_micro_usd IS DISTINCT FROM OLD.per_user_cap_micro_usd
      OR NEW.per_customer_cap_micro_usd IS DISTINCT FROM OLD.per_customer_cap_micro_usd
      OR NEW.campaign_cap_micro_usd IS DISTINCT FROM OLD.campaign_cap_micro_usd
      OR NEW.max_referred_customers IS DISTINCT FROM OLD.max_referred_customers
      OR NEW.min_margin_micro_usd IS DISTINCT FROM OLD.min_margin_micro_usd
      OR NEW.min_margin_bps IS DISTINCT FROM OLD.min_margin_bps
      OR NEW.payment_fee_bps IS DISTINCT FROM OLD.payment_fee_bps
      OR NEW.service_cost_bps IS DISTINCT FROM OLD.service_cost_bps
      OR NEW.payout_asset_policy IS DISTINCT FROM OLD.payout_asset_policy
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
      OR NEW.rules_hash IS DISTINCT FROM OLD.rules_hash
    THEN
      RAISE EXCEPTION 'referral_program_versions rule columns are immutable once published/superseded/archived - create a new version instead' USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS referral_program_versions_guard_immutable_trg ON referral_program_versions;
CREATE TRIGGER referral_program_versions_guard_immutable_trg
  BEFORE UPDATE ON referral_program_versions FOR EACH ROW EXECUTE PROCEDURE referral_program_versions_guard_immutable();

CREATE OR REPLACE FUNCTION referral_program_versions_reject_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'referral_program_versions rows are never deleted (% refused) - archive instead', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS referral_program_versions_reject_delete_trg ON referral_program_versions;
CREATE TRIGGER referral_program_versions_reject_delete_trg
  BEFORE DELETE ON referral_program_versions FOR EACH ROW EXECUTE PROCEDURE referral_program_versions_reject_delete();

CREATE TABLE IF NOT EXISTS referral_partner_assignments (
  id                              TEXT PRIMARY KEY,
  user_id                         TEXT NOT NULL REFERENCES users(id),
  mode                            TEXT NOT NULL CHECK (mode IN ('disabled', 'standard', 'influencer')),
  program_version_id              TEXT REFERENCES referral_program_versions(id),
  rate_bps_override               INT CHECK (rate_bps_override IS NULL OR rate_bps_override BETWEEN 0 AND 10000),
  effective_from                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to                    TIMESTAMPTZ,
  program_budget_cap_micro_usd    BIGINT CHECK (program_budget_cap_micro_usd IS NULL OR program_budget_cap_micro_usd >= 0), -- the negotiated partnership/campaign cap
  per_customer_cap_micro_usd      BIGINT CHECK (per_customer_cap_micro_usd IS NULL OR per_customer_cap_micro_usd >= 0),
  max_referred_customers          INT CHECK (max_referred_customers IS NULL OR max_referred_customers >= 1),
  allowed_sources                 TEXT[], -- NULL = inherit the assigned program version's eligible_sources
  notes                           TEXT,
  status                          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'revoked')),
  created_by                      TEXT NOT NULL REFERENCES users(id), -- the admin who made this assignment (audited)
  superseded_at                   TIMESTAMPTZ,
  superseded_by_assignment_id     TEXT REFERENCES referral_partner_assignments(id),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (mode <> 'influencer' OR program_version_id IS NOT NULL),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (allowed_sources IS NULL OR (array_length(allowed_sources, 1) > 0 AND allowed_sources <@ ARRAY['subscription', 'storage_purchase', 'ai_margin']::text[]))
);
-- At most one ACTIVE assignment per user - resolveEffectiveMode() always has exactly one row to
-- read. Editing an assignment supersedes it (status -> 'superseded') and inserts a new active row,
-- exactly like discount_redemptions' own "one live row per user" pattern.
CREATE UNIQUE INDEX IF NOT EXISTS referral_partner_assignments_single_active_uidx ON referral_partner_assignments (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS referral_partner_assignments_user_idx ON referral_partner_assignments (user_id, created_at DESC);

-- An assignment's own negotiated terms are immutable once created (defence-in-depth for the
-- assignment-snapshot guarantee attributions/earnings rely on) - only status/superseded_* may
-- change, exactly the "edit = supersede + insert" rule referral-programs.mjs enforces at the
-- application layer too.
CREATE OR REPLACE FUNCTION referral_partner_assignments_guard_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.mode IS DISTINCT FROM OLD.mode
    OR NEW.program_version_id IS DISTINCT FROM OLD.program_version_id
    OR NEW.rate_bps_override IS DISTINCT FROM OLD.rate_bps_override
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
    OR NEW.program_budget_cap_micro_usd IS DISTINCT FROM OLD.program_budget_cap_micro_usd
    OR NEW.per_customer_cap_micro_usd IS DISTINCT FROM OLD.per_customer_cap_micro_usd
    OR NEW.max_referred_customers IS DISTINCT FROM OLD.max_referred_customers
    OR NEW.allowed_sources IS DISTINCT FROM OLD.allowed_sources
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'referral_partner_assignments terms are immutable once created - supersede with a new row instead' USING ERRCODE = 'restrict_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS referral_partner_assignments_guard_immutable_trg ON referral_partner_assignments;
CREATE TRIGGER referral_partner_assignments_guard_immutable_trg
  BEFORE UPDATE ON referral_partner_assignments FOR EACH ROW EXECUTE PROCEDURE referral_partner_assignments_guard_immutable();

CREATE OR REPLACE FUNCTION referral_partner_assignments_reject_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'referral_partner_assignments rows are never deleted (% refused) - revoke instead', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS referral_partner_assignments_reject_delete_trg ON referral_partner_assignments;
CREATE TRIGGER referral_partner_assignments_reject_delete_trg
  BEFORE DELETE ON referral_partner_assignments FOR EACH ROW EXECUTE PROCEDURE referral_partner_assignments_reject_delete();
