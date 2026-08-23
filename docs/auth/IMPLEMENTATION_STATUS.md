# Auth Rework — Implementation Status

Living document. See `ADR-0001-authentication-architecture.md` for the architecture decision.
This reflects the state at the end of this implementation pass.

**Baseline (verified before any change):** `npm test` → 1149/1149 passing (the task brief cited
1130/1130 from an earlier audit; 1149 was the real count on `feature/journey-g-companion` at the
start of this session — re-verified directly, not assumed).

**Current:** `npm test` → 1230/1230 passing. `npm run build` succeeds. `npm audit` → 0 vulnerabilities
in production runtime dependencies; 5 remaining (4 moderate, 1 high) are all in dev-only tooling
(`vite`/`esbuild`'s dev-server-only advisory, and `autocannon`'s own transitive `uuid`/`hyperid` —
a load-testing dev-dependency added in this pass), none shipped to production, fixable only via a
breaking major-version bump not attempted here.

**Environment constraints (affects what "verified" can mean below):** no Docker, no local/
reachable Redis, no live OIDC vendor tenant, no Playwright browser binaries, and no access to the
production host were available in this sandboxed session. npm registry access worked (used to add
`argon2`, `ioredis`, `openid-client`, `cookie` as explicit runtime deps, and `jose`/`autocannon` as
dev deps). Everything below is labeled: ✅ locally verified (real automated test, in-memory
repo/mock issuer/in-memory rate-limit store) — 🔶 code-complete, not integration-verified against
the real external service — ⬜ not started / deferred, reason given.

One incidental note, not repeated elsewhere: this session's own `Read` of the repo's `.env` echoed
a live `OPENAI_API_KEY` into the conversation transcript. It was never written to any file and is
not reproduced here, but it is now visible in session output — rotate that key.

## 1. Identity & session model

- ✅ Migration `020_auth_sessions.sql` (additive only — `001`–`019` untouched): `auth_sessions`,
  `external_identities`, `security_events`, `auth_transactions` (OIDC state/nonce/PKCE, password
  reset, email verify, legacy exchange), plus `users.totp_secret_enc`/`totp_enabled_at`/
  `email_verified_at`.
- ✅ `repo.pg.mjs`/`repo.memory.mjs` parity for all four new domains + `users.markEmailVerified`.
- ✅ `server/community/security/session-service.mjs`: create/resolve/revoke/revoke-all/rotate,
  opaque random session ids stored only as a SHA-256 hash, independent idle (14d default)/absolute
  (90d default) expiry, `last_seen_at` writes throttled to once per 5 minutes.
- ✅ `security/cookies.mjs` (the maintained `cookie` package, not hand-rolled parsing):
  HttpOnly/Secure(prod)/SameSite=Lax/`__Host-`-prefixed(prod) session + CSRF cookies.
- ✅ `security/csrf.mjs`: signed double-submit (HMAC of nonce+sessionId) + `security/origins.mjs`'s
  Origin/Referer/`Sec-Fetch-Site` check on every unsafe request.
- 🔶 Scheduled cleanup for expired sessions/transactions: `deleteExpired()` exists on both repo
  domains; no cron/scheduler wiring was added (a documented follow-up, not silently dropped).

## 2. Community API auth & authz

- ✅ `auth-real.mjs`'s `requireAuth`/`optionalAuth` resolve only a cookie-backed session.
- ✅ `/livez` (process-only) and `/readyz` (checks `repo.health()`, never leaks detail) on both
  the Community API and the AI gateway.
- ✅ CORS allowlist (`ALLOWED_ORIGINS`) replacing `Access-Control-Allow-Origin: '*'`.
- ✅ Rate limiting (`security/rate-limit.mjs`): real `ioredis` Lua `INCR`+`PEXPIRE` adapter for
  production, in-memory adapter for dev/test; production refuses to boot without `REDIS_URL`.
  🔶 the `ioredis` code path itself was not run against a live Redis server (none reachable here).
- ✅ Per-route body limit (`32kb`) on `/api/auth/*`, ahead of the general `60mb` limit and ahead
  of any password hashing.
- ✅ `csrfProtection()` mounted globally right after the global `requireAuth` — every
  session-gated router (community/marketplace/messages/sync/admin) requires a valid CSRF token
  for unsafe methods.
- ✅ Production preflight (`community-api-server.mjs`): refuses to start under `NODE_ENV=production`
  with `DATABASE_URL`/`ALLOWED_ORIGINS`/`REDIS_URL`/`INTERNAL_API_SECRET` missing, or with
  `AUTH_TOKEN_SECRET`/`CSRF_SECRET` unset (forces the lazy secret check to run at startup, not on
  first request).
- ✅ Graceful shutdown (`SIGTERM`/`SIGINT`) on both server processes, with a bounded force-exit
  timeout.

## 3. Admin security

- ✅ `ADMIN_BOOTSTRAP_EMAIL` auto-promotion removed entirely from `routes.auth.mjs`, `render.yaml`,
  and `docker-compose.production.yml` — not disabled, gone.
- ✅ `scripts/admin-grant.mjs`: out-of-band CLI grant/revoke, requires `--confirm` to exactly
  repeat `--email`, refuses an unverified account, records a `security_events` row, cannot run
  from a web request.
- ✅ `requireAdmin` fails closed unconditionally; `ADMIN_AUTH_ENFORCED=false` is refused outright
  under `NODE_ENV=production`. The pre-existing test that asserted the old fail-open default as a
  *feature* was rewritten to assert the fix instead.
- ✅ Final-admin protection (`CANNOT_REMOVE_LAST_ADMIN`/`CANNOT_SUSPEND_LAST_ADMIN`).
- ✅ Step-up (`requireRecentReauth`, 15 min) on KYC change, role/suspension change, AI-provider-key
  upsert. A role/suspension change revokes every other session for the target user immediately.

## 4. Account lifecycle

- ✅ Generic OIDC adapter (`security/oidc.mjs`, `openid-client` v6) + `routes.auth-oidc.mjs`
  (`/api/auth/oidc/start`+`/callback`) — real PKCE/state/nonce, verified end-to-end against a real
  (mock, spec-shaped) issuer in `tests/oidc-adapter.test.mjs` (6/6) and through the full app in
  `tests/routes-auth-oidc.test.mjs` (6/6), including tamper/replay/mismatch/preemption rejection.
  🔶 no live vendor tenant configured or tested — operator prerequisite.
- ✅ Register/login/Google sign-in rewritten onto real sessions + argon2id + the 15-char policy +
  timing-safe missing-account handling + legacy-hash transparent upgrade.
- ✅ Password change (current-password-as-step-up), password forgot/reset (enumeration-resistant,
  single-use hashed tokens, real end-to-end test via captured dev-mode mailer output), email
  verify/resend.
- ✅ One-time legacy bearer-token exchange (`POST /api/auth/legacy-exchange`), disabled by default,
  gated by `LEGACY_AUTH_SUNSET_AT`.
- 🔶 No real email/SMTP provider wired — `security/mailer.mjs`'s `EMAIL_WEBHOOK_URL` seam is
  code-complete, not tested against a live provider. Reset/verify links log locally outside
  production and are never delivered in production without an operator-configured webhook.
- ⬜ MFA/passkey enrollment UI and TOTP verification flow: DB columns and the encryption
  primitive (`crypto-util.mjs`) exist; no enrollment/verification route or UI was built.

## 5. Frontend & boot sequencing

- ✅ `tradejournal:auth-token` is gone from `localStorage` entirely; identity lives in an
  in-memory `window.__NAVRYA_AUTH__`, populated by a real `GET /api/auth/session` call.
- ✅ `boot-language-gate.js` is the consolidated boot gate: resolves authenticated/self-user/
  CSRF-token/language in one request, purges mismatched previous-user caches using the real
  server-confirmed user id (fail-closed on no stamp), applies language/dir, reveals, redirects an
  unauthenticated dashboard visit to the account route. `user-scope-guard.js` is kept as the
  on-demand purge library.
- ✅ `csrf-fetch-patch.js` (new): wraps `window.fetch` once to attach `X-CSRF-Token` to every
  same-origin unsafe-method request — no per-call-site changes needed anywhere else.
- ✅ `dev-user-switcher.js` rewritten: `currentUserId()` returns the real internal user id (fixing
  a real, live bug — see ARCHITECTURE.md's correction note); `logout()` revokes the server session
  first, purges local caches, broadcasts to other tabs via `BroadcastChannel`, then navigates.
- ✅ `server-replica.js`'s `hasCurrentUser()` gate reads `window.__NAVRYA_AUTH__`.
- ✅ `select/app.js`'s `postMessage` targets the real origin (not `'*'`, except the documented
  `file://` exception); `src/release.js`/`App.jsx` validate origin, `event.source` (must be the
  shell's own mounted iframe), and message shape.
- ⬜ Full `currentUserId()`/ownership-comparison audit beyond the four `navrya-src` files already
  confirmed correct (`communityAvatar.jsx`, `communityView.jsx`, `marketplaceView.jsx`,
  `messagesView.jsx`): not exhaustively re-swept across every remaining call site.

## 6. DTOs / data privacy

- ✅ `security/user-views.mjs`: `publicUserView`/`selfUserView`/`adminUserView`. Applied to
  `GET /api/users/me`/`/:id`/`/search` (`routes.users.mjs`) — previously all three leaked the full
  record (email/phone/KYC/role/suspension) to any authenticated peer.
- ⬜ Full audit of posts/comments/ratings/marketplace/messages' own user-enrichment call sites for
  the same leak pattern: not individually re-verified this pass (routes.users.mjs was the
  confirmed, demonstrated instance).

## 7. AI gateway auth & quotas

- ✅ `/internal/session-introspect` (new) + gateway-side enforcement before body/provider/usage/
  Realtime-minting. Fail-closed by design: an unreachable Community API means every caller is
  rejected, never admitted (the opposite of the pre-existing admin-key-bridge's soft-fail-open).
  Verified end-to-end in `tests/ai-gateway-auth.test.mjs` (7/7): anonymous denial, suspended-user
  denial, forged-cookie denial, per-user quota isolation, "no provider-calling code reached for
  an anonymous caller."
- ✅ Redis-backed (in-memory dev/test) per-user + global AI quota, server-authoritative.
- ✅ Production preflight + graceful shutdown added to `pattern-ai-server.mjs` too.

## 8. Upload & active-content security

- ✅ `storage.mjs`: declared-MIME allowlist (png/jpeg/webp/gif only — SVG/HTML/XML rejected
  outright) + real magic-byte/decode verification via `sharp` + mandatory re-encode before disk
  (neutralizes polyglot payloads, strips embedded metadata). Regression-tested for SVG rejection
  and MIME-spoofing/polyglot rejection.
  🔶 no re-encode of non-image attachment types (pdf/txt/docx for Strategy Education) — unchanged
  from before this pass, out of scope.
- ✅ `/uploads/{session,pattern,strategy,trade}/*` (private trading/mental-health-adjacent media)
  now require a real session; `/uploads/{posts,listings}/*` stay public by design.
  ⬜ Per-owner (not just per-authentication) authorization on individual files, or short-lived
  signed URLs: not built this pass — a real, named, honest gap.

## 9. Security headers

- ✅ `security/headers.mjs`: HSTS (prod), CSP (report-only by default, `CSP_ENFORCE=true` to
  enforce), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`+`frame-ancestors`,
  COOP/CORP, `X-Powered-By` removed, `Cache-Control: no-store` on `/api/auth/*`. No `unsafe-eval`.

## 10. Scale & observability

- 🔶 Design-level guidance only (capacity/pool/Redis sizing discussed in the ADR); no formal
  capacity-model document, no metrics/alerting wiring, added this pass.
- ✅ Graceful shutdown + `/livez`/`/readyz` (see sections 2/7 above) are the concrete, shipped
  piece of this section.

## 11. Migrations & deployment safety

- ✅ `server/db/migrate.mjs`: Postgres advisory lock (serializes concurrent migration runs),
  per-migration SHA-256 checksum recorded and verified on every run (an already-applied migration
  whose file changed now fails loudly instead of silently re-diverging), a documented
  `.concurrent.sql` naming convention for non-transactional operations (no migration needs it yet).
  🔶 not run against a real Postgres instance (none reachable) — `tests/migrate-checksums.test.mjs`
  covers the pure checksum/naming logic and proves importing the module never attempts a real
  connection.
- ✅ `.github/workflows/deploy.yml`: deploys the exact tested `github.sha` (checked out by commit,
  never `origin/main`) — closes the tested-commit/deployed-commit race; records
  `.last-deployed-sha`/`.previous-deployed-sha`; runs a post-deploy smoke check (`/readyz`,
  `/health`) before declaring success; prunes only images older than 24h instead of immediately;
  added `npm audit --omit=dev --audit-level=high` to the `verify` job.
  `scripts/rollback.sh`: one-command rollback to the previous deployed commit, with its own
  smoke check. 🔶 neither the workflow change nor the rollback script has been exercised against
  the real production host (not attempted — this task explicitly says not to deploy).
- ✅ `render.yaml`: marked clearly as the deprecated/non-active blueprint, hardcoded bootstrap
  email removed, all new required production env vars added for completeness if ever revived.

## Test evidence (all runnable locally, all passing)

- `npm test` → **1230/1230 passing** (`node --test tests/*.test.mjs`).
- `npm run build` → succeeds (Vite + navrya-src bundles).
- `npm audit` → 0 vulnerabilities in production runtime dependencies.
- Bounded local load smoke (`autocannon`, in-memory repo, this session only, never production):
  10 connections/10s against `POST /api/auth/login` with a real registered user — 8 requests
  succeeded (matching the real 8-per-15-min per-identifier login rate limit) then ~89k requests
  in the remaining window were rejected with 429 at ~9,000 req/sec, proving the rate limiter
  itself is cheap and holds up under sustained load, and that the expensive argon2id path is
  only ever reached for legitimately-throttled attempts.
- New test files this pass: `tests/oidc-adapter.test.mjs` (6), `tests/routes-auth-oidc.test.mjs`
  (6), `tests/routes-auth.test.mjs` (17), `tests/ai-gateway-auth.test.mjs` (7),
  `tests/security-passwords.test.mjs` (10), `tests/security-session-service.test.mjs` (9),
  `tests/security-csrf-and-cookies.test.mjs` (8), `tests/security-rate-limit.test.mjs` (5),
  `tests/uploads-authorization.test.mjs` (10), `tests/postmessage-security.test.mjs` (5),
  `tests/migrate-checksums.test.mjs` (5), plus 2 new regression tests in
  `tests/uploads-storage.test.mjs` (SVG rejection, MIME-spoofing/polyglot rejection).
- ~35 pre-existing test files updated for the fallout of removing fail-open/bearer-token
  behavior — every admin-acting test user now explicitly granted `role:'admin'`
  (`createAdmin()` helper) instead of relying on the old disabled-by-default posture; every
  `x-dev-user-id: signedToken(id)` header replaced with a real `Cookie`+`X-CSRF-Token` pair from
  `authHeadersFor()`; the one test that asserted "any identified user can use admin routes" as a
  *feature* now asserts the opposite.

## Honest operator prerequisites (not achievable from this sandboxed session)

- A live OIDC vendor tenant (issuer URL, client id/secret, redirect URI registered) if a managed
  IdP is wanted beyond password + Google.
- A live, reachable Redis instance for production (`REDIS_URL`) — required at startup.
- A live PostgreSQL instance to run `server/db/migrate.mjs` against for real (the checksum/
  advisory-lock logic is unit-tested but never exercised against real Postgres).
- A real email/SMTP or transactional-email provider (`EMAIL_WEBHOOK_URL`) for password-reset/
  verification delivery in production.
- Real production secrets: `AUTH_TOKEN_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY`,
  `INTERNAL_API_SECRET`, `ALLOWED_ORIGINS` — see `.env.production.example`.
- Rotating the `OPENAI_API_KEY` that was incidentally echoed into this session's own transcript
  (see the note at the top of this document).
- A real staging/production host to run the CI/CD deploy workflow, the post-deploy smoke check,
  and `scripts/rollback.sh` against for real — not performed from this session by design.
