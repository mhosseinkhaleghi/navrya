-- Widens the two schema CHECKs that predate the Pro plan so a real PostgreSQL database accepts it, matching the
-- application layer (PLAN_NAMES in server/commercial/commercial-defaults.mjs has included 'pro' since it was added).
--
-- users.plan (026_commercial_config.sql) and user_subscriptions.plan_id (031_subscriptions.sql) both restrict their
-- value to ('free','plus','personalized') - a leftover from before Pro existed. On real PostgreSQL this makes a
-- confirmed Pro subscription fail at activateOrRenewSubscription() (adding a row to user_subscriptions violates
-- user_subscriptions_plan_id_check) and an admin "assign plan" PATCH fail at users_plan_check, in both cases AFTER
-- the payment has already been marked confirmed - a gap invisible to the in-memory repository, which enforces no
-- such constraint. Both auto-generated constraint names are found by their definition and replaced, the same
-- pattern 064_discount_codes.sql already uses for wallet_ledger.type. Widening a CHECK never invalidates existing
-- rows - additive only, never edit 001-065.
DO $$
DECLARE
  old_constraint TEXT;
BEGIN
  FOR old_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'users'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%free%' AND pg_get_constraintdef(oid) LIKE '%personalized%'
  LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', old_constraint);
  END LOOP;
END $$;

ALTER TABLE users ADD CONSTRAINT users_plan_check CHECK (plan IN ('free', 'plus', 'pro', 'personalized'));

DO $$
DECLARE
  old_constraint TEXT;
BEGIN
  FOR old_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'user_subscriptions'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%free%' AND pg_get_constraintdef(oid) LIKE '%personalized%'
  LOOP
    EXECUTE format('ALTER TABLE user_subscriptions DROP CONSTRAINT %I', old_constraint);
  END LOOP;
END $$;

ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_plan_id_check CHECK (plan_id IN ('free', 'plus', 'pro', 'personalized'));
