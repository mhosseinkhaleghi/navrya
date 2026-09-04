# Handoff

Format: one compact line per entry, no embedded commit hashes / run IDs / byte sizes (git log has those). Archive or cut resolved entries before this file passes ~60 lines. Full history: `git log -- HANDOFF.md`.

## Active

- `fix/docker-build-version-metadata` (Codex): fixes the verified Docker release failure by passing exact checkout metadata to version generation; owns Dockerfile, release workflows, rollback/bootstrap commands, version script and regression test | validation: 13 focused tests passed | next: guarded production release and live version/bundle verification
- `fix/session-auth-routing` (Codex): fixed CSRF/logout, Google chooser wait, fail-closed auth bootstrap, server-backed character/language preferences, and Gemini Voice token schema/error cleanup | validation: 125 focused tests passed | next: user browser verification
- `feat/gemini-provider` (Claude, current branch): Gemini GenerateContent provider + Gemini Live voice transport shipped; added a loading/success modal + button spinner for Google sign-in on the select page (matches shared `Modal.jsx` design tokens: scrim, ink-900, motion durations). Pushed to `dev` (2,345/2,345 full suite, build clean). Next: real multi-turn Gemini Voice session test (needs `GEMINI_API_KEY` + billing), set Gemini pricing before enabling `AI_WALLET_ENFORCED` for Gemini, browser-verify the new Google-auth modal. No browser/deploy verification yet on either piece.

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
- 2026-09-03: Google sign-in client ID fix confirmed live in production (verified via direct request, serves the correct client ID) — the earlier stuck-deploy blocker is resolved.
