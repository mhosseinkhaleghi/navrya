-- A crypto invoice's real, sufficiently-confirmed transfer can arrive at the correct recipient on
-- the correct chain/token but for a DIFFERENT amount than invoiced
-- (server/commercial/crypto-invoice-service.mjs's AMOUNT_MISMATCH path,
-- server/commercial/bsc-chain-client.mjs's verifyBscTransfer()). This column records the wallet
-- credit that path always produces, in either direction:
--   - UNDER-payment: the purchase never silently activates at a partial price - it fails (the
--     existing 'failed' status; no CHECK-constraint change needed), and this column holds the
--     FULL amount credited to the wallet instead.
--   - OVER-payment: the purchase still completes normally at the invoiced price ('confirmed'),
--     and this column holds only the EXCESS credited on top.
-- A later re-check (or an admin looking at the row) can always tell "this amount was credited
-- because of a mismatch" from either terminal status; every other failure/confirmation leaves
-- this column NULL.
--
-- Additive only - expand, never edit 001-049.

ALTER TABLE crypto_invoices
  ADD COLUMN IF NOT EXISTS mismatch_credited_micro_usd BIGINT;
