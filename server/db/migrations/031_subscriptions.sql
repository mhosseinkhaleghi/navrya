-- Commercial System Slice 2: the real subscription lifecycle (spec section 2). Money is integer
-- microUSD (BIGINT), same convention as 027_wallet.sql, for the same reason (no float drift).
-- `price_amount_micro_usd`/`currency` are a SNAPSHOT taken when the subscription was
-- created/renewed - never re-derived from current commercial config, so an admin price change
-- tomorrow never silently rewrites an existing subscriber's billing (spec section 2's own example).
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                          TEXT PRIMARY KEY,
  user_id                     TEXT NOT NULL REFERENCES users(id),
  plan_id                     TEXT NOT NULL CHECK (plan_id IN ('free','plus','personalized')),
  provider                    TEXT NOT NULL DEFAULT 'manual',
  external_customer_id        TEXT,
  external_subscription_id    TEXT,
  status                      TEXT NOT NULL CHECK (status IN ('inactive','active','past_due','canceled','expired')),
  current_period_start        TIMESTAMPTZ,
  current_period_end          TIMESTAMPTZ,
  cancel_at_period_end        BOOLEAN NOT NULL DEFAULT FALSE,
  price_amount_micro_usd      BIGINT NOT NULL DEFAULT 0,
  currency                    TEXT NOT NULL DEFAULT 'USD',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- "The active subscription for a user" is looked up constantly (every entitlement resolution) -
-- one partial index over the statuses that can ever be the current effective one.
CREATE INDEX IF NOT EXISTS user_subscriptions_user_status_idx ON user_subscriptions (user_id, status);
