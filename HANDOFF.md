# Handoff

Format: one compact line per entry, no embedded commit hashes / run IDs / byte sizes (git log has those). Archive or cut resolved entries before this file passes ~60 lines. Full history: `git log -- HANDOFF.md`.

## Active

- `feat/gemini-provider` (Codex, current branch): Gemini added as an additive GenerateContent provider; current follow-up adds Gemini Live mic transcription (one-use browser tokens) + server-side Gemini TTS. Voice console now distinguishes permission-denied from config/connection errors. Focused Gemini Voice suite 106/106, build passes; a parallel full-suite run hit 7 pre-existing server-runner crashes under forced ephemeral ports (not a feature failure). Next: run validation gates, test a real multi-turn Gemini Voice session (needs `GEMINI_API_KEY` + billing), set Gemini pricing before enabling `AI_WALLET_ENFORCED` for Gemini. No browser/deploy verification yet.
- `fix/google-sign-in-client` (Codex): Google web client ID fixed and tested (17/17 focused + 2,333 full suite). Blocked in production: deploy workflow verified the commit but failed in "Deploy the tested commit on the server" right after SSH config; live site still serves the old client ID. Needs an operator to inspect/repair/rerun the deploy step, no manual SSH/Caddy workaround. Staging (`staging.navrya.com`) still has no DNS/server configured.

## Known pending

- GitHub branch protection is still not enabled (needs a signed-in repo admin).
- GPT-5.6 Sol/Terra/Luna: no `provider_model_pricing` rows yet, calls fail closed until an admin adds them.
- Market chart screenshot capture: mechanism verified live; real chart-pixel content only checked in headless Chrome (cross-origin iframe compositing gap), needs one real non-headless confirmation.
- AI Cost Control: needs a real OpenAI org admin key + project id (Admin > Commercial > AI Cost Control) before external reconciliation shows real data.
- Visa / Iran payment gateway: intentionally unimplemented, shown as "coming soon."

## Shipped history

- 2026-08-24: agent skills + staging deploy automation promoted (730 tests).
- 2026-08-24: production release `b562bede` verified/deployed (1,390 tests).
- 2026-08-24: stale-container incident (migrate step ate SSH stdin) found and fixed across two follow-up releases.
- 2026-08-24: Accounts modal/panel redesign shipped and verified live (1,394 tests).
- 2026-08-25: hosted Voice release (Realtime SDP relay, Redis credential leases) shipped and verified live (1,436 tests).
- 2026-08-26: Instrument Catalog domain (fail-closed instrument matching across sessions/patterns/trades) shipped, browser-verified, one UI bug found/fixed same day (1,597 tests).
- 2026-08-27: production AI chat outage fixed (`AI_WALLET_ENFORCED` rollout flag added, default off) and verified (1,669 tests).
- 2026-08-28: BSC crypto payments wallet + per-model AI cost reporting shipped, confirmed live (1,785 tests).
- 2026-08-28: admin-configurable BSC crypto payments (security fix + encrypted secrets + admin UI) shipped and verified live (1,837 tests).
- 2026-08-29: wallet top-up minimum lowered to $1 + low-amount popup shipped and verified live (1,844 tests).
- 2026-08-29: AI billing operational fixes (zero-price guard, settle retry, stale-reservation sweep) shipped; `AI_WALLET_ENFORCED=true` activated in production same day (1,858 tests).
- 2026-08-29: GPT-5.6 Sol/Terra/Luna model catalog added, Sol default (1,965 tests).
- 2026-08-30: GPT-5.6 catalog verified live; Luna later flipped to default (1,996 tests).
- 2026-08-30: TradingView Market chart view added to Live Session, verified live; same-day fix let any typed instrument code resolve, not just 5 curated symbols (1,979 tests).
- 2026-08-30: Market chart fullscreen toggle, persistent widget, inline toolbar actions, and screenshot capture (Add-chart + Log-movement) shipped and verified live (1,989 tests).
- 2026-08-30: AI Cost Control admin dashboard (external OpenAI cost reconciliation, encrypted provider credentials) shipped and verified live (2,041 tests).
- 2026-08-31: Session AI Analysis header button fixed to open the right popup.
- 2026-09-02: commercial-plans-v3 (Pro plan, per-plan token discount, BYOK/premium-model gating, crypto/Visa payment-method modal) shipped and verified live (2,315 tests).
