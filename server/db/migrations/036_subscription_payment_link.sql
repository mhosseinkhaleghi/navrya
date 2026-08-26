-- Commercial System Validation Gate: links a subscription back to the payment_transactions row
-- that most recently activated/renewed it (spec section 19's refund reversal needs to find the
-- EXACT subscription a given transaction produced, not guess via "the user's current active
-- subscription for that plan" - which would be wrong the moment a user has switched plans again
-- between purchase and refund). Nullable + additive - no backfill for pre-existing rows.
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS payment_transaction_id TEXT REFERENCES payment_transactions(id);
