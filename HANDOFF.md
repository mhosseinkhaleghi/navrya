# Handoff

Format: one compact line per entry, no embedded commit hashes / run IDs / byte sizes (git log has those). Archive or cut resolved entries before this file passes ~60 lines. Full history: `git log -- HANDOFF.md`.

## Active

(nothing in flight)

## Known pending

- GitHub branch protection is still not enabled (needs a signed-in repo admin).
- GPT-5.6 Sol/Terra/Luna: no `provider_model_pricing` rows yet, calls fail closed until an admin adds them.
- Gemini: needs a real multi-turn Voice session test (`GEMINI_API_KEY` + billing) and Gemini pricing set before enabling `AI_WALLET_ENFORCED` for it.
- Market chart screenshot capture: mechanism verified live; real chart-pixel content only checked in headless Chrome (cross-origin iframe compositing gap), needs one real non-headless confirmation.
- AI Cost Control: needs a real OpenAI org admin key + project id (Admin > Commercial > AI Cost Control) before external reconciliation shows real data.
- Visa / Iran payment gateway: intentionally unimplemented, shown as "coming soon."

## Shipped history

- 2026-09-04: `docs/payment-release-confirmed` (Codex): confirmed the crypto Check Now fix is included in the current live production revision; authenticated Actions verification/deploy jobs succeeded and app/admin/session HTTPS checks pass, superseding the earlier dev-only and unverified-deploy notes | validation: 2,397 tests passed | next: user payment-flow verification; no duplicate deployment needed
- 2026-09-04: session-auth-routing hardening (responsive mobile shell, locked phone nav, Gemini Voice shared-language STT/chat/TTS path) + Google sign-in rework (immediate loading/success/error modal matching the gamification design system with ornamented corners and a real Google logo, account-linking so a password account can also sign in via Google, dossier logout button, numeric version badge) promoted to production (`main`) via the guarded script; full suite + build passed inside its own gate. User browser-verified login live. Actions run itself not independently confirmed (no `gh` access this session).
- 2026-09-04: `docs/psychology-release-verified` (Codex): published Mood/Calm Room, Therapist/review queue, chart redesign, tilt/gauges, My File rebuild and 90-day weather calendar to app.navrya.com/admin.navrya.com; Actions and live version/four bundle hashes/HTTPS/auth checks pass | validation: 2,382 tests passed | next: user functional verification; later crypto Check Now fix remains dev-only
- 2026-09-04: `fix/docker-build-version-metadata` (Codex): published current dev including ROUTINE to production app.navrya.com/admin.navrya.com; fixed Git-free Docker version generation and SSH keepalives; Actions deploy succeeded, live version and all four bundle hashes match, HTTPS/auth checks pass | validation: 2,375 tests passed | next: user functional verification
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
