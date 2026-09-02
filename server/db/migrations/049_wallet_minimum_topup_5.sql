-- The wallet top-up floor becomes $5 (server/commercial/commercial-defaults.mjs's
-- WALLET_DEFAULTS.minimumTopUpUsd), matching the smallest amount the wallet UI offers.
--
-- Changing that DEFAULT alone is not enough: commercial-config.mjs's buildEffective() lets a
-- stored commercial_config_overrides row WIN over the default, and a deployment previously set to
-- $10 through Admin > Commercial > Wallet keeps that row forever. That is precisely the reported
-- bug - the UI offered a $5 chip and the server answered 400 WALLET_TOPUP_BELOW_MINIMUM with
-- minimumTopUpUsd: 10. So this migration lowers the stored override too.
--
-- Deliberately narrow: it only ever LOWERS a floor that sits above $5, and only touches the one
-- config key. An operator who has since set a floor at or below $5 keeps their value untouched,
-- and setting a higher floor again afterwards through the admin route still works normally (this
-- runs once, it is not a trigger). Re-running it is a no-op.
--
-- Additive/idempotent only - expand, never edit 001-048.

UPDATE commercial_config_overrides
   SET value = jsonb_set(value, '{amount}', to_jsonb(5::numeric)),
       updated_at = now()
 WHERE config_key = 'wallet:minimumTopUpUsd'
   AND jsonb_typeof(value -> 'amount') = 'number'
   AND (value ->> 'amount')::numeric > 5;
