# NAVRYA Public Launch Readiness Audit

**Audit date:** 2026-09-04
**Branch audited:** `fix/voice-mode-reliability` (working tree, with uncommitted changes to voice/chat-dock files — see gitStatus)
**Auditor role:** Principal Engineer / SRE / Security / Release Engineer (Phase 1 — audit only, no code changed)
**Environment constraints on this pass:** no Docker, no reachable Postgres/Redis, no live OIDC vendor tenant, no Playwright/browser binaries, no access to the production host. Every claim below is labeled with its evidence type (code, test, config, doc) and confidence (CONFIRMED / LIKELY / POSSIBLE / UNKNOWN).

---

## 1. Executive Summary

**Launch Readiness Score: 58 / 100**

**Current Recommendation: CONDITIONAL GO**

**Recommended Release Stage: Closed / Invite-only Beta → staged public rollout, gated on the P0 list below**

**Estimated earliest technically realistic launch window for full public availability:** **2–4 weeks** of focused engineering (assuming 1 engineer full-time on the P0/P1 backlog; less if the team already fixing the current branch is dedicated to this list). This is a range derived from the effort estimates in Section 28, not a calendar commitment.

### Assumptions and important context

- NAVRYA is **not a greenfield project**. `HANDOFF.md` and `docs/auth/IMPLEMENTATION_STATUS.md` show this is an actively operated system with real production deploys, real BSC crypto payments, real wallet balances, and a real user base already interacting with `app.navrya.com` / `admin.navrya.com`. Several findings below (especially the backup gap) are therefore **present-tense risk to real data today**, not only a pre-launch checklist item.
- The authentication/session/CSRF/admin-authorization subsystem is unusually mature for a project this size — a dedicated hardening pass (`docs/auth/ADR-0001`, `IMPLEMENTATION_STATUS.md`) rewrote it from a bearer-token/fail-open model onto real hashed sessions, fail-closed admin, and tested OIDC/PKCE. This materially raises the score versus a typical early-stage app.
- The single largest score deductions are **not code-quality problems** — they are two structural gaps (no backup/DR strategy, and a self-documented authorization gap on private user media) plus **the literal current state of the working tree**, which has 78 failing tests concentrated in the AI voice subsystem currently being modified.
- This audit could not exercise real Postgres, real Redis, a real OIDC vendor, or a real browser. Everything under those categories is graded by code inspection only and marked UNKNOWN where a real-environment behavior cannot be inferred from code alone.

---

## 2. Current Production Architecture

### Frontend
- **Entry point:** `index.html` → `src/release.js` (active production hash-router shell); `src/App.jsx`/`src/main.jsx` exist as an inactive, parallel module-based shell (documented drift in `ARCHITECTURE.md`, not currently served).
- **Character dashboards** (`public/pages/{commander,engineer,hunter,sage}/`): same-origin iframes hosting per-character bundles (`navrya-{character}-sessions-app.js`, ~2.6MB / 680KB gzip each, built by `navrya-src/build.mjs` + Vite).
- **Shared browser modules** (`public/pages/shared/*.js`): trade/pattern/strategy/session/mental-health stores, AI dock/voice, i18n (fa/ar/en/es), panel system, `window.TradeJournal*` global APIs.
- **Boot gate:** `boot-language-gate.js` — one request resolves auth/self-user/CSRF-token/language, purges any previous-user cache using the server-confirmed user id, fails closed (purges) on no stamp.
- **Identity:** in-memory `window.__NAVRYA_AUTH__`, populated via `GET /api/auth/session`; `tradejournal:auth-token` no longer exists in `localStorage`.
- **CSRF:** `csrf-fetch-patch.js` transparently attaches `X-CSRF-Token` to every same-origin unsafe-method `fetch`.
- **postMessage:** validated origin + `event.source` + shape (`select/app.js`, `src/release.js`).
- **Local-first storage:** localStorage + IndexedDB (`tradejournal-images-v1`) hold a local replica that syncs to `/api/sync/*`.

### Backend — two Node processes, one Postgres, one Redis
| Process | File | Port | Purpose | Auth model |
|---|---|---|---|---|
| Community API | `server/community-api-server.mjs` → `server/community/app.mjs` | 8788 | Users, sessions, community/marketplace/messages, all `/api/sync/*` CRUD, admin, storage, wallet, webhooks | Real HttpOnly session cookie + CSRF |
| AI/Pattern gateway | `server/pattern-ai-server.mjs` | 8787 | Every AI provider call, Realtime Voice SDP relay, ElevenLabs TTS | Cookie forwarded, verified via internal `/session-introspect` call to the Community API (fail-closed) |

Both processes are deliberately DB-free/DB-owning respectively (gateway has no direct Postgres dependency; it bridges to the Community API over an `INTERNAL_API_SECRET`-protected `/internal/*` surface for admin keys, wallet, and session identity).

### Data infrastructure
```
Browser (4 character iframes + admin)
   │  HttpOnly session cookie + CSRF header, same-origin fetch
   ▼
Caddy (deploy/Caddyfile) — TLS, static dist/, reverse-proxies /api/* and /uploads/*
   │                         │
   ▼                         ▼
Community API (8788)   AI/Pattern gateway (8787)
   │  pg.Pool               │  fetch (INTERNAL_API_SECRET) → Community API /internal/session-introspect, /internal/admin-ai-keys, /internal/voice-provider-config, wallet reserve/settle
   ▼                         ▼
PostgreSQL (single container, single volume)   OpenAI / Anthropic / Gemini / Kimi / DeepSeek / ElevenLabs (external)
   │
   ▼
Redis (single container, --appendonly no) — rate-limit counters, AI per-user/global quota, Realtime SDP-relay leases (all disposable-by-design state)

Uploads: local disk, single Docker named volume (uploads_data), served by Community API's express.static
```

Single production server (per `DEPLOYMENT.md`): one Docker Compose stack, Postgres/Redis/uploads only reachable on the private Docker network. Staging is a separate, independently-provisioned server running the same stack. No managed/HA database service, no object storage (S3-class) is used anywhere — confirmed by `docker-compose.production.yml` and `server/storage/*`.

---

## 3. What Is Already Production-Ready

- **Session model** (`security/session-service.mjs`): opaque random session id, stored only as a SHA-256 hash, independent idle (14d)/absolute (90d) expiry, family-based rotation for replay detection, throttled `last_seen_at` writes (once/5min) — a genuinely well-designed model, not a toy.
- **Cookies** (`security/cookies.mjs`): HttpOnly session cookie, non-HttpOnly-but-SameSite CSRF cookie, `__Host-` prefix in production, `SameSite=Lax`, no `Domain` attribute (host-only).
- **CSRF**: signed double-submit bound to the session id (`security/csrf.mjs`) — a stolen/planted cookie on a sibling origin cannot forge a token that verifies against a real session.
- **Origin defense-in-depth**: CORS allowlist (never `*`, always `Vary: Origin`) + independent Origin/Referer/`Sec-Fetch-Site` check on every unsafe request (`security/origins.mjs`).
- **Admin authorization fails closed unconditionally**; `ADMIN_AUTH_ENFORCED=false` is refused outright under `NODE_ENV=production` (`server/admin/auth-admin.mjs`); final-admin protection exists; step-up reauth (15 min) gates role/suspension/KYC/AI-key/voice-credential changes and revokes every other session for the target user.
- **Password policy**: argon2id (OWASP-recommended params) with a documented scrypt fallback, 15-character NIST-aligned minimum, common-password + identifier-in-password rejection, all checked **before** the expensive hash call (`security/passwords.mjs`).
- **Rate limiting**: real Redis-backed, atomic Lua `INCR`+`PEXPIRE`, shared across replicas; **production refuses to boot on a memory store**; every `/api/auth/*` route (register, login, google, password change/forgot/reset, email verify/resend, legacy-exchange, OIDC start/callback) has both an IP-window and an IP+identifier-window limiter.
- **OIDC**: real `openid-client` v6, PKCE + state + nonce, tested end-to-end against a mock spec-shaped issuer (`tests/oidc-adapter.test.mjs`, `tests/routes-auth-oidc.test.mjs`) including tamper/replay/mismatch rejection.
- **Upload validation** (`server/storage/storage.mjs`): declared-MIME allowlist (png/jpeg/webp/gif only, SVG/HTML/XML rejected outright) + real sharp-based magic-byte detection + **mandatory decode-and-re-encode before disk**, which neutralizes polyglot payloads and strips embedded metadata. Regression-tested for SVG rejection and MIME-spoofing.
- **AI gateway**: every AI route requires a verified, non-suspended session **before** the body is read, a provider key is chosen, or any provider is called; failure of the identity check (network error, Community API down) is **fail-closed**, not fail-open; server-authoritative per-user + global hourly quota (Redis-backed); a real wallet/billing settlement path (`server/commercial/wallet-service.mjs`) with retry-on-transient-failure for already-earned charges.
- **CI/CD**: `deploy.yml` checks out the exact `github.sha` (not `origin/main`), records `.last-deployed-sha`/`.previous-deployed-sha`, runs a post-deploy smoke check against `/readyz`/`/health`, and **verifies the running container's static bundle hash matches the just-built image** before declaring success — a genuinely strong "provably the same commit" guarantee (Section 28 requirement). `scripts/rollback.sh` exists as a one-command rollback.
- **Migrations**: Postgres advisory lock serializes concurrent runs, per-migration SHA-256 checksum detects silent drift, additive-only convention observed across all 50 migration files spot-checked.
- **Test coverage breadth**: 2,440 tests including dedicated `security-csrf-and-cookies`, `security-passwords`, `security-rate-limit`, `security-session-service`, `uploads-authorization`, `user-scope-guard`, `postmessage-security`, `voice-conversation-isolation`, `voice-multi-tab-isolation`, `quota-enforcement`, `storage-quota-enforcement` suites — this is real, substantive regression coverage, not just happy-path smoke tests.
- **Health checks**: `/livez` (process-only) vs `/readyz` (dependency-aware) correctly separated on both servers; the AI gateway's readiness deliberately does **not** require an upstream AI provider to be up, matching this audit's own Section 20 guidance.

---

## 4. Launch Blockers — P0

| ID | Finding | Evidence | Impact | Fix | Effort | Verification |
|---|---|---|---|---|---|---|
| P0-1 | **No backup/disaster-recovery strategy exists anywhere in the repo.** No `pg_dump`/WAL-archiving/`wal-g` job, no backup cron, no restore script, in `scripts/`, `docs/`, or `deploy/`. PostgreSQL and uploads each live on exactly one unbacked-up Docker named volume on one server. | `docker-compose.production.yml` (postgres/uploads_data volumes, no backup service); repo-wide search for backup tooling returned zero results; `DEPLOYMENT.md` describes a single-server topology | A disk failure, accidental `docker volume rm`, host compromise, or bad migration on the one production server **permanently destroys all trades, patterns, strategies, mental-health profiles, screenshots, wallet ledgers, and messages for every user**, with no recovery path. Given this system already has real users and real payments, this is present-tense risk, not hypothetical. | Automated nightly (or more frequent) `pg_dump`/logical backup to off-server object storage, with a tested restore procedure; a separate backup/replication path for the uploads volume (or migrate uploads to S3-class storage, which also solves several Section 12 concerns). | **M–L** (3–5 days impl + a real restore drill) | Restore a real backup into a scratch Postgres instance and diff row counts / spot-check data; document RPO/RTO achieved. |
| P0-2 | **Private user media is authorized by "any authenticated user," not by the actual owner.** `/uploads/{session,pattern,strategy,trade}/*` requires only `requireAuth`, never an ownership check, before `express.static` serves the file. This is a self-documented gap in the code and in `IMPLEMENTATION_STATUS.md` §8. | `server/community/app.mjs:117-131` (comment explicitly names this "an honest, named gap"); `server/db/id.mjs` (`newId()` — filenames are `Date.now().toString(36)` + only 8 hex chars / 32 bits of randomness); no rate limit on the `/uploads` static route | Any registered user (registration is self-serve, rate-limited only to 5/hour/IP — trivially obtainable) can attempt to read **any other user's private trading and mental-health-adjacent screenshots** if they can guess or enumerate a filename. Entropy is modest (32 bits per plausible timestamp window) and there is no throttling on the static file route itself. This is exactly the IDOR/BOLA class this audit was asked to hunt for, on the most sensitive data category in the app. | Store an owner index per uploaded object (the DB rows already exist — e.g. `trade_screenshots.trade_id → trades.user_id`) and check it before serving, or move to short-lived signed URLs. | **M** (2–3 days) | New authorization test: user B's session must receive 403/404 for user A's private object key; regression test for every one of the four private categories. |
| P0-3 | **The exact code currently checked out (`fix/voice-mode-reliability`, uncommitted changes) fails 78/2,440 tests**, 100% concentrated in the AI voice/chat-dock subsystem under active modification (`tests/voice-conversation-isolation.test.mjs`, `tests/voice-transport-lifecycle.test.mjs`, `tests/chat-dock-core.test.mjs`, `tests/ai-voice-*`, `tests/companion-*`). | `node --test tests/*.test.mjs` run in this session: `tests 2440 / pass 2362 / fail 78` | This exact working tree must not be merged to `dev`/`main` or deployed. It represents mid-refactor state, not a release candidate. | Finish or revert the in-progress voice work until the suite is green again. | **S–M** (depends on how much of the WIP is intended to land) | `npm test` returns 0 failures on the branch before any promotion. |

## 5. High Priority — P1

| ID | Finding | Evidence | Impact | Fix | Effort | Verification |
|---|---|---|---|---|---|---|
| P1-1 | **No error/crash telemetry or observability stack exists.** No `window.onerror`/`unhandledrejection` capture found anywhere under `navrya-src`/`public/pages/shared`; no Sentry/Bugsnag/equivalent; no structured server logs beyond `console.log`/`console.warn`; no metrics endpoint. | Repo-wide search for `window.onerror`, `unhandledrejection`, `sentry`/`bugsnag`/`rollbar`, and any error-reporting endpoint returned nothing real (one "sentry" hit was `sEntryId`, a false positive) | Cannot answer "is one release producing frontend crashes," "which endpoint is failing," or "which users are affected" within 5 minutes during an incident, as this audit's own Section 19 requires — today that requires manually SSHing in and reading raw stdout. | See Section 18 design below (low-overhead self-hosted ingestion recommended for this stage). | **M** (client capture + one aggregation table + admin view: 2–3 days for a minimal version) | Trigger a real client error, confirm it is captured/aggregated once (not per-occurrence) with PII/secret redaction verified. |
| P1-2 | **No automated real-browser E2E suite exists.** No Playwright (or equivalent) in `package.json`/devDependencies; all 2,440 tests run under Node's test runner against mocked DOM/fetch/IndexedDB, never a real Chromium instance. | `package.json` scripts/devDependencies; repo-wide search for `playwright` returned nothing | This project's own history (multiple `HANDOFF.md` entries distinguishing "tests passed" from a separate "user browser-verified" step, and at least one documented cross-origin iframe compositing gap only caught in headless Chrome) shows this class of bug reaches production today. None of the 33 journeys in Section 16 below run automatically against a real browser. | Stand up Playwright against a local Docker Compose stack (real Postgres/Redis) for the top 8-10 journeys (register→login→create trade→logout, two-account isolation, character switch, image upload, session expiry, AI chat happy path). | **L** (4-7 days for infra + first journey set) | CI job runs the suite headlessly on every PR to `dev`. |
| P1-3 | **No rate limiting on any Community/Marketplace/Messaging write endpoint.** `POST /api/community/posts`, `/posts/:id/comments`, `/posts/:id/likes`, `/reports`, `/api/messages/threads`, `/threads/:id/messages`, `/api/marketplace/listings`, `/listings/:id/purchase`, `/listings/:id/ratings` all have zero `rateLimit()` calls. | `server/community/routes.posts.mjs`, `routes.messages.mjs`, `routes.marketplace.mjs` (grepped for `rateLimit\(` — zero matches) vs. the thorough coverage on `/api/auth/*` | Once registration is public, a single account (or a handful, given cheap registration) can spam unlimited posts/comments/messages/listings/ratings with no automated throttle — pure moderator-hours as the only defense. | Apply the existing `rateLimit()`/`sessionKey()` primitives (already used elsewhere in the codebase) to these routes with sane per-action ceilings. | **S** (0.5–1 day — the primitive already exists, this is wiring) | `security-rate-limit`-style test per route: Nth request in a window returns 429 with `Retry-After`. |
| P1-4 | **No admin review surface for user-submitted Community reports.** `POST /api/community/reports` exists and creates a report; no corresponding `GET /api/admin/reports` (or equivalent moderation queue) was found in `server/admin/routes.mjs`. | `server/admin/routes.mjs` grep for "report" (only unrelated usage-reporting comments matched); `server/admin/TODO-endpoints.md` (exhaustively enumerates every admin tab and does not list a Reports/Moderation tab) | Reports can be filed but there is no demonstrated way for an admin to see, triage, or resolve them — Section 25's "reports can actually be reviewed and resolved, not merely collected" requirement is unmet. | Minimal admin list+status (OPEN/INVESTIGATING/RESOLVED/IGNORED) view over the existing reports table. | **S–M** (1–2 days) | Admin marks a seeded report resolved; status persists and is queryable. |
| P1-5 | **`npm audit` reports 3 moderate vulnerabilities in production runtime dependencies** (`qs` array-limit bypass / DoS, reached via `body-parser` → `express@4.22.2`). This directly contradicts `docs/auth/IMPLEMENTATION_STATUS.md`'s claim of "0 vulnerabilities in production runtime dependencies" — real drift since that document was written. | `npm audit --omit=dev --audit-level=high` output, this session | A known-class DoS-adjacent parsing bug is present in the exact dependency chain that parses every request body. | `npm audit fix --force` bumps to Express 5 (breaking) — needs a scoped compatibility pass, not a blind bump. | **M** (1–2 days: dependency bump + full regression run + manual smoke of body-parsing edge cases) | `npm audit --omit=dev --audit-level=high` returns clean; full suite green. |
| P1-6 | **`server/db/pool.mjs` uses `new Pool({ connectionString })` with no `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, or `statement_timeout`.** | `server/db/pool.mjs:9-11` (full file, 3 lines of actual logic) | Under real concurrent load, `pg`'s default pool size (10) may serialize requests behind a queue with **no bound** on how long a request waits, and a single slow/runaway query can hold a connection indefinitely — directly relevant to the Section 15 "PostgreSQL pool is full" incident, which today has no configured ceiling behavior at all. | Set an explicit `max` sized to real Postgres `max_connections` minus headroom for both processes/replicas, plus `connectionTimeoutMillis` and a `statement_timeout` on the connection. | **XS** (a few hours) | Load test (autocannon, already a devDependency) against a real Postgres instance; confirm bounded queueing and no connection leak over a sustained run. |
| P1-7 | **Single-server, single-instance architecture is unproven at more than one replica.** Rate limiting and AI quota are correctly Redis-backed (multi-instance-safe by design), but nothing in `docker-compose.production.yml` currently runs more than one `community-api`/`pattern-ai` replica, and there is no load balancer config in this repo. | `docker-compose.production.yml` (one replica per service, no `deploy.replicas`, no LB) | If traffic requires horizontal scaling, the path is currently untested, not merely "needs a config change." | Define and smoke-test a 2-replica topology behind Caddy's own load-balancing (or an external LB) before it's needed under real load. | **M** (2-3 days) | Run the existing test suite's rate-limit/quota assertions against 2 real replicas sharing one Redis; confirm no double-counting or bypass. |

## 6. Medium Priority — P2

- **`/readyz` on the Community API checks only PostgreSQL, not Redis** (`server/community/app.mjs:83-88`), even though rate-limiting and AI quota depend on it — an operator cannot see "Redis is down" via the readiness probe alone. *(CONFIRMED, code)*
- **No table retention/partitioning strategy** for growth-prone tables (`ai_usage_events`, `security_events`, audit-style tables) — fine at initial scale, a real watch-item past ~1M rows. *(LIKELY, code inspection of migrations, no load data to confirm)*
- **No generic feature kill-switches** for Community/Marketplace/uploads or an individual AI provider as a whole — existing flags (`AI_WALLET_ENFORCED`, `ADMIN_AUTH_ENFORCED`, `CSP_ENFORCE`, `ELEVENLABS_EMERGENCY_ENV_FALLBACK`) are narrower than "disable this whole feature area without a redeploy." *(CONFIRMED, config search)*
- **CSP is report-only by default** (`CSP_ENFORCE` defaults false in `docker-compose.production.yml`) — an intentional staged rollout per the code's own comments, but still not a blocking policy in production today. *(CONFIRMED, config)*
- **Non-image attachments (pdf/txt/docx for Strategy Education) are not re-encoded/sanitized** the way images are — a documented, known, intentionally-deferred gap. *(CONFIRMED, `IMPLEMENTATION_STATUS.md` §8)*
- **Frontend bundle size**: each character app bundle is ~2.6MB (680KB gzip), built as one chunk with no code-splitting; `npm run build` also warns the root `index.html`'s vendored React scripts aren't `type="module"`, leaving them outside Vite's module graph/caching. *(CONFIRMED, `npm run build` output this session)*
- **GitHub branch protection is not enabled** (per `HANDOFF.md`'s own "Known pending" list) — nothing structurally stops a direct push to `main` bypassing CI. *(CONFIRMED, doc, not independently re-verified against live GitHub settings)*
- **MFA/TOTP has no enrollment or verification flow** (DB columns + `crypto-util.mjs` encryption primitive exist; no route was found) — acceptable for an initial public launch, but relevant to admin-account-compromise resistance. *(CONFIRMED, code search + `IMPLEMENTATION_STATUS.md` §4)*
- **Scheduled cleanup of expired sessions/OIDC transactions is not wired** (`deleteExpired()` exists on both repo domains, no cron calls it) — `auth_sessions`/`auth_transactions` will grow unbounded until something purges them. *(CONFIRMED, `IMPLEMENTATION_STATUS.md` §1)*

## 7. Low Priority — P3

- `render.yaml` is explicitly marked as a deprecated/inactive blueprint but still present in the repo root — fine to keep as historical reference, worth a comment or removal for clarity.
- The AI gateway's own CORS header remains `Access-Control-Allow-Origin: '*'` (deliberately, since identity travels only via a cookie that never reaches a cross-origin request) — reasonable as documented, but inconsistent with the Community API's real allowlist; tightening it is low-value defense-in-depth, not a real exposure.
- `voice-ab-scratch/`, `voice-review/`, `tailadmin-reference/` are gitignored/reference directories that add repository noise but no runtime risk.

---

## 8. Security Audit

Covered in depth in Sections 4-7 and 9-10. Summary posture: **authentication, session, CSRF, origin, and admin-authorization are strong and independently tested; the one confirmed hostile-review finding is the private-media IDOR (P0-2).** No SQL injection, hard-coded secret, or fail-open authentication path was found in the modules read this pass (session-service, cookies, csrf, origins, rate-limit, auth-real, auth-admin, secrets, passwords, headers, storage). Secrets are read only from `process.env`, cached per-process, and production refuses to boot with any of `AUTH_TOKEN_SECRET`/`CSRF_SECRET`/`ENCRYPTION_KEY`/`DATABASE_URL`/`ALLOWED_ORIGINS`/`REDIS_URL`/`INTERNAL_API_SECRET` missing (`server/community/security/secrets.mjs`, `server/community-api-server.mjs:24-42`) — a genuinely fail-closed production posture.

## 9. Authentication & Authorization

See Section 3 (strengths) and Section 6 (P2 MFA gap). Realistic "one user accesses another's account" paths considered and their status:
- **Stolen session cookie** → HttpOnly defeats XSS-based theft; the cookie is a random 32-byte token hashed at rest, so a DB read alone can't produce a usable session; no per-device/IP pinning exists beyond `ipHash`/`userAgent` recorded for audit, not enforcement — **a stolen raw cookie value itself (e.g. via a MITM on a misconfigured client, or physical device access) is not currently detectable/revocable except by the user's own "log out everywhere" or an admin's forced revoke.** *(CONFIRMED gap, LOW residual risk given HTTPS+HttpOnly, standard for this class of app.)*
- **Suspended user with an existing session** → enforced on every request via `requireAuth` (`user.suspendedAt` check) — takes effect on the very next request, not next login. *(CONFIRMED, code + comment)*
- **Privilege change while another session is open** → `revokeOtherSessionsAfterPrivilegeChange` is called on role/suspension change, revoking every other session immediately. *(CONFIRMED, code)*
- **Admin account compromised** → no MFA to blunt it; step-up reauth (15 min) still gates the most sensitive actions even within a valid session, which limits blast radius somewhat but does not prevent a genuinely stolen, freshly-authenticated admin session from acting. *(CONFIRMED gap — see P2 MFA item.)*

## 10. Data Isolation

Every user-owned route read this pass (`routes.trades.mjs`, `routes.mental-health.mjs`, `routes.storage.mjs`) scopes reads/writes/deletes by `req.currentUser.id`, either as an explicit repo-method argument (`repo.trades.get(userId, id)`) or implicitly (mental-health profile has no separate id, addressed only by user id). This is the correct pattern and — per `tests/user-scope-guard.test.mjs` existing as a dedicated suite — is deliberately regression-tested. The one confirmed break in this pattern is **P0-2 (private media)**, where the authorization check is "authenticated" rather than "owner," at the static-file layer rather than the API layer. Cross-user localStorage/IndexedDB isolation (`boot-language-gate.js` purging on server-confirmed user-id mismatch) was read and looks correctly fail-closed, but was **not exercised in a real second-browser-tab scenario** in this pass (UNKNOWN — needs the E2E suite from P1-2 to actually prove it under real navigation/reload/logout timing).

## 11. Database Readiness

Migrations (50 files, spot-checked `009_trades.sql`, `037_ai_usage_events_authoritative.sql`, plus the full list) show consistent conventions: `TEXT PRIMARY KEY` ids, `ON DELETE CASCADE` foreign keys, an index on every foreign-key column, `CHECK` constraints on enum-like columns, additive-only `ALTER ... ADD COLUMN IF NOT EXISTS` for schema evolution, and a checksum+advisory-lock migration runner (`server/db/migrate.mjs`, per `IMPLEMENTATION_STATUS.md` §11). This is good hygiene. **Real gaps:** the connection pool has no production tuning (P1-6), and no query has been profiled against real data volume (no load test was run against a real Postgres instance this pass — UNKNOWN at 10k/100k/1M rows for any specific query; the `*_user_idx` indexes present on every user-scoped table are the right shape for the obvious "list my records" queries, which is reassuring but not proof).

## 12. Offline / Replica / Synchronization

Not independently re-verified against real Postgres/Redis in this pass (environment constraint). Code-level observations: sync routes are idempotent upserts keyed by the client-generated record id (`POST /api/sync/trades` — "Idempotent upsert by the record's own client-generated id"), which is the right shape to survive retries/duplicate submission without creating duplicate rows. `tests/sync-queue.test.mjs`, `tests/dashboard-board-sync.test.mjs`, and per-domain `*-sync.test.mjs` files exist and presumably cover much of Section 8's scenario list at the unit level (not independently read line-by-line this pass — **UNKNOWN** exhaustive coverage, LIKELY reasonable coverage given the file count and this project's demonstrated testing discipline elsewhere).

## 13. AI Infrastructure

See Section 3 strengths. Worst-case cost-abuse scenario: a malicious authenticated user is bounded by `AI_QUOTA_PER_USER_PER_HOUR` (default 200 calls/hour) and, when `AI_WALLET_ENFORCED=true` (confirmed live in production per `HANDOFF.md`'s 2026-08-29 entry), by their own real wallet balance — so a single compromised/malicious account cannot generate unbounded platform cost, only cost against its own funded balance, up to the per-user hourly call ceiling. The **global** hourly ceiling (`AI_QUOTA_GLOBAL_PER_HOUR`, default 20,000) is the platform-wide backstop against a distributed abuse campaign (many cheap accounts) exhausting provider spend before wallet billing catches up — this is a reasonable design, contingent on that limit actually being tuned to real provider budget (not independently verified against a real bill this pass).

## 14. Upload / Storage Infrastructure

See Section 3 (validation strengths) and P0-2 (authorization gap). Storage is **local disk only**, in a single Docker named volume — confirmed no S3-class/CDN-backed storage anywhere in `server/storage/`. This means: a redeploy is safe (volume persists), but **horizontal scaling to more than one app instance would break uploads** (each instance would only see files written to its own local disk) unless the volume is a real shared network filesystem, which `docker-compose.production.yml` does not configure — worth folding into the P1-7 multi-instance work.

## 15. Scalability Assessment

No load test was run against real infrastructure this pass. The architecture's own design choices that matter for scale: Redis-backed rate limiting/quota (multi-instance-safe), unbounded-`max` `pg.Pool` (P1-6, needs tuning), single-instance app/db/redis today (P1-7). See Section 16 for a concrete test plan.

## 16. Load Testing Plan

`autocannon` is already a devDependency (used for the one bounded local smoke test recorded in `IMPLEMENTATION_STATUS.md`: 10 conn/10s against `POST /api/auth/login`, confirming the rate limiter itself holds at ~9,000 req/sec while the expensive argon2 path is only reached for legitimately-throttled attempts). Recommended matrix, to run against a real staging Postgres/Redis before any broad public rollout:

| Workflow | Concurrency | Duration | Payload | Success criteria | Failure criteria |
|---|---|---|---|---|---|
| Login storm | 50 / 500 / 5,000 | 60s | real credentials, spread across N seeded accounts | p95 < 500ms for legitimate traffic under the per-identifier limit; 429+Retry-After for over-limit | 5xx, pool exhaustion, argon2 path reached for throttled requests |
| Dashboard/replica hydration | 50 / 500 | 60s | `GET /api/sync/*` per domain | p95 < 300ms | timeouts, N+1 fan-out visible in DB connection count |
| Trade/pattern/strategy writes | 50 / 500 | 120s | realistic JSON payload | p95 < 400ms, no duplicate rows on retry | lost updates, duplicate ids |
| AI chat | 10 / 50 / 100 | 120s | short prompt | quota correctly enforced at configured ceiling, no provider key leak in logs | AI cost spike beyond `AI_QUOTA_GLOBAL_PER_HOUR` |
| Image upload | 10 / 50 | 60s | 5-15MB images | correct 15MB rejection, no memory blowup | process OOM, disk fill |
| Community feed / messaging | 50 / 500 | 60s | post/comment/message creation | once P1-3 rate limits ship: 429 at ceiling | unlimited spam accepted |
| Admin dashboard | 5 / 20 | 60s | admin list/detail views | p95 < 500ms | slow JSONB queries under `repo.pg.mjs` |

Target SLOs: API error rate < 0.1% outside intentional 429s; p95 < 500ms for interactive routes; DB active connections stay under pool `max` with near-zero waiting connections; AI upstream timeout rate < 1%; event-loop lag < 50ms under the above load.

## 17. Failure Scenario Matrix

| # | Incident | Current behavior | User impact | Data risk | Recovery | Missing protection | Severity |
|---|---|---|---|---|---|---|---|
| 1 | Postgres unavailable 30s | `/readyz` reports not-ready; requests likely 500/timeout | Errors surfaced, no silent corruption | None if writes fail cleanly | Automatic once DB returns | No circuit breaker/backoff visible in route handlers | P2 |
| 2 | Postgres slow 5min | Requests queue behind the untuned pool (P1-6) | Slow/hanging UI, no bound | Low | Manual restart likely needed | `statement_timeout`/pool timeout | P1 |
| 3 | Pool exhausted | Untuned `max` (P1-6) — behavior under real load UNKNOWN | Requests hang | Low | Process restart | Pool tuning + timeouts | P1 |
| 4 | Redis unavailable | Rate-limit/AI-quota `incr` throws → prod returns 503 for those routes (`rate-limit.mjs`); non-billed routes unaffected | Auth/AI temporarily degraded, not silently open | None (Redis holds only disposable state) | Automatic on Redis return | `/readyz` doesn't surface this (P2) | P2 |
| 5 | Redis latency 2s | Every rate-limited request slows by ~2s | Slow login/AI calls | None | Automatic | No timeout on Redis calls seen | P2 |
| 6 | Community API down | AI gateway's session-introspect fails closed → every AI call rejected | AI unusable, core CRUD unaffected only if Community API IS the CRUD API (it is) — full outage | None | Restart | — | P0-scope outage, not a data-risk finding |
| 7 | AI gateway down | Core app (trades/patterns/community) unaffected; AI features fail | Partial outage | None | Restart | — | P2 |
| 8 | One AI provider down | Multi-provider support exists but no automatic fallback between providers was confirmed in this pass | That provider's features fail | None | Manual/admin key swap | Automatic fallback (UNKNOWN if built) | P2 |
| 9 | All AI providers down | All AI features fail | Partial outage | None | Manual | — | P2 |
| 10 | AI provider 429 | Not fully traced this pass | Likely user-facing error | None | Retry by user | UNKNOWN retry/backoff | P2 |
| 11 | OAuth/OIDC provider down | Google/OIDC login fails; password login unaffected | Partial login outage | None | Automatic | — | P3 |
| 12 | Storage (disk) unavailable | Upload writes fail | Uploads broken | None (writes fail before persistence) | Manual (disk/volume fix) | No alerting on disk pressure | P1 (ties to P0-1 backup gap) |
| 13 | Disk full | Uploads + Postgres writes fail | Full outage risk | **Possible corruption on Postgres side if disk fills mid-write** | Manual | No disk-usage alerting found | P1 |
| 14 | User loses internet during save | Local-first replica queues; syncs on reconnect (by design) | Degraded, not lost, by architecture | SAFE by design (LIKELY, not E2E-proven) | Automatic | — | P2 (proof gap, not known defect) |
| 15 | Browser refresh during pending write | Depends on sync-queue durability (IndexedDB) — not E2E-verified | LIKELY safe | LIKELY SAFE | Automatic | E2E proof missing (P1-2) | P2 |
| 16 | Duplicate API submission | Idempotent upsert-by-client-id pattern confirmed on trades route | Safe | SAFE (CONFIRMED for trades; LIKELY for other sync domains) | N/A | — | P3 |
| 17 | Two tabs, same record | Not independently verified; last-write-wins is the likely upsert semantics | Possible lost update on true concurrent edit | DEGRADED BUT LIKELY SAFE | N/A | No optimistic-concurrency/ETag mechanism observed | P2 |
| 18 | Two devices, same record | Same as #17 | Same as #17 | Same as #17 | N/A | Same as #17 | P2 |
| 19 | Deploy during active sessions | Graceful shutdown (SIGTERM handling, in-flight requests finish, bounded force-exit) confirmed on both server processes | Brief reconnect for in-flight requests started right at cutover | Low | Automatic | — | P3 |
| 20 | Migration fails halfway | Advisory lock + checksum verification exist; a failed migration mid-run is not itself transactionally wrapped per-file (UNKNOWN without a real Postgres run) | Possible deploy blocker | UNKNOWN | Manual investigation | Not tested against real Postgres this pass | P1 |
| 21 | Server restarts | Graceful shutdown + Docker `restart: unless-stopped` | Brief downtime | None | Automatic | No documented restart budget/alert | P3 |
| 22 | 1,000 users log in simultaneously | Rate limiter proven cheap under load (documented autocannon smoke test); real behavior at this scale UNKNOWN without a real run | UNKNOWN | None expected | — | Real load test (Section 16) | P1 |
| 23 | 1,000 users reconnect simultaneously | UNKNOWN | UNKNOWN | None expected | — | Real load test | P1 |
| 24 | Malicious user spams AI endpoints | Bounded by per-user quota + wallet | Contained | None | Automatic | — | P3 (already mitigated) |
| 25 | Malicious user spams uploads | 15MB cap + storage quota (`storage-service.mjs`) bound size; **no rate limit on upload frequency itself was independently confirmed this pass** | Possibly high disk usage before quota triggers | Low-medium | Manual cleanup | Confirm per-route rate limit on `/images` upload endpoints | P2 |
| 26 | Malformed giant request body | `/api/auth` capped at 32kb; general JSON capped at 60mb; AI gateway capped at 100mb | Rejected cleanly | None | N/A | — | P3 (already mitigated) |
| 27 | Corrupted image | `sharp` decode failure → `IMAGE_DECODE_FAILED` (400) | Clean rejection | None | N/A | — | P3 (already mitigated) |
| 28 | Stolen session cookie | See Section 9 — no device pinning, HttpOnly mitigates the common theft vector | Account takeover if cookie value itself is exfiltrated by another means | High if it happens | User/admin revoke-all | No anomaly detection | P2 |
| 29 | Suspended user has existing session | Enforced on next request (`requireAuth`) | Immediate cutoff | None | Automatic | — | P3 (already mitigated) |
| 30 | Admin account compromised | Step-up reauth limits blast radius within the window; no MFA | Serious if achieved | High | Manual revoke, `admin-grant.mjs` for recovery | MFA (P2 backlog item) | P1 |

## 18. Error Reporting / Bug Telemetry Architecture

**Current state: none exists** (P1-1). Recommended minimal design for this stage:

**Browser side** — one small module loaded on every page:
- Hook `window.onerror` + `unhandledrejection` + wrap critical `fetch` calls (auth, sync, AI) to catch failed responses.
- Compute a **fingerprint** client-side: `hash(message + normalized-stack-top-frame + route)` — never the full stack with variable data.
- Batch in memory, flush at most once per 10-30s or on page unload (`navigator.sendBeacon`, fire-and-forget), capped at e.g. 20 events/flush.
- **Redact before it ever leaves the browser**: strip anything from trade notes, mental-health text, screenshots, cookies, auth tokens, or AI keys — send only `{fingerprint, message (truncated), route, releaseVersion, browser, os, viewport, language, timestamp}`.
- Sample: if the same fingerprint has already been sent N times this session, stop sending it client-side (belt-and-suspenders with server dedup below).

**Server side** — one endpoint, one table:
- `POST /internal/client-errors` (or a new `/api/errors` behind light auth) — never opens a DB write per event; instead does `INSERT ... ON CONFLICT (fingerprint, release_version) DO UPDATE SET last_seen_at = now(), count = count + 1` — this is the aggregation strategy that turns "100,000 identical errors" into **one row with a counter**, not 100,000 writes.
- Table shape: `fingerprint, release_version, first_seen_at, last_seen_at, count, sample_payload (jsonb, last N examples capped), status`.
- Rate-limit the ingestion endpoint itself (reuse the existing `rate-limit.mjs` primitive) and cap payload size hard (a few KB).
- Server-side errors (uncaught exceptions, unhandled rejections, DB/Redis/AI-upstream failures) funnel into the **same table** with a `source: 'server'` tag, using the same fingerprint+upsert pattern — never a second parallel error-logging system.
- Drop (not queue) new events once a bounded in-memory queue is full during overload — losing telemetry during an incident is acceptable; adding load during an incident is not.

**Self-hosted vs. managed (Sentry-class):** given NAVRYA already operates its own Postgres/Redis and has a demonstrated pattern of building exactly this kind of small, purpose-built table (`ai_usage_events`, `security_events`), a **self-hosted lightweight table + admin view** is the right fit for this stage — it avoids a new vendor dependency/cost line and a new PII-handling review, and the aggregation pattern above is genuinely lightweight (one upsert per unique fingerprint per release, not per occurrence). **Recommend self-hosted now; revisit Sentry (or similar) once team size/on-call maturity justifies its alerting/UI investment** — this is an explicit, reversible choice, not a permanent one.

## 19. Observability & Alerting

Currently: `console.log`/`console.warn` only, no structured logging, no metrics endpoint, no correlation-ID propagation confirmed across Browser→API→DB/Redis/AI. This is the same gap as Section 18 from a different angle. Minimum viable addition for launch: structured JSON log lines (`timestamp, level, service, env, releaseSha, requestId, route, status, durationMs`) on both server processes, and a request-id generated at the edge (Caddy or first Express middleware) threaded through the internal `/internal/*` calls so a Community-API-down incident is traceable from an AI-gateway log line back to its cause. **UNKNOWN whether any of this exists in the actual deployed Caddy/Docker logging config** (not inspected — Caddy's own access log format was not read this pass).

## 20. Backup / Restore / Disaster Recovery

**FAIL — see P0-1.** No backup exists for PostgreSQL, Redis (acceptable — disposable state), or uploads. Recommended targets once implemented: **RPO ≤ 24h (ideally ≤ 1h via WAL shipping), RTO ≤ 4h** for a single-server topology at this stage — tighter numbers require a managed/replicated database, which is a larger architectural change than this audit recommends attempting before the basic backup exists at all.

## 21. Deployment & Rollback

**Strong — see Section 3.** `deploy.yml` deploys the exact tested commit, verifies the running container's bundle hash, records the previous SHA, and `scripts/rollback.sh` exists for one-command rollback. **Not exercised against the real production host in this audit pass** (by design — this audit did not deploy anything). Recommend a deliberate rollback drill (deploy a trivial change, then roll it back for real) before broadening public traffic, simply to convert this from "reviewed code" to "proven procedure."

## 22. CI/CD

`.github/workflows/deploy.yml`/`verify-dev.yml`/`verify-main-source.yml`/`deploy-staging.yml` run `npm test` + `npm run build` + `npm audit --omit=dev --audit-level=high` (with a sensible retry for transient registry timeouts) before any deploy job runs, and deploy is additionally gated behind the `DEPLOY_ENABLED` repository variable (per the user's own `[[navrya_gitflow_dev_main_deploy]]` operating convention). **Gap:** branch protection on `main` is not enabled (per `HANDOFF.md`), so CI gating is a convention, not an enforced GitHub setting — a direct push could still bypass it.

## 23. Privacy/Sensitive Data Engineering

Mental-health and trading data is stored in Postgres without column-level encryption at rest (relies on disk/volume-level protection, which is standard for this class of app but worth naming explicitly given the sensitivity). `security/user-views.mjs`'s `publicUserView`/`selfUserView`/`adminUserView` split was built specifically to stop full user records (email/phone/KYC/role/suspension) leaking to peer users — confirmed applied to `routes.users.mjs`; **`IMPLEMENTATION_STATUS.md` §6 itself flags that posts/comments/marketplace/messages' own user-enrichment call sites were not individually re-audited for the same leak pattern** — this is a real, not-yet-closed follow-up, not a new finding of this pass (LIKELY low residual risk given the pattern is now established, but unverified).

## 24. Community Abuse / Moderation

See P1-3 (no rate limiting) and P1-4 (no report review surface). Combined, these are the weakest area of the abuse-control posture relative to the otherwise strong auth/AI abuse controls.

## 25. Performance & Browser Reliability

Not independently profiled with real long-lived sessions (1h/8h/multi-day) in this pass — UNKNOWN for memory/CPU growth, MutationObserver load, or object-URL leaks specifically. The one concrete, measured finding is bundle size (Section 6, P2) from the actual `npm run build` output this session.

## 26. Missing Tests

| Category | Status |
|---|---|
| UNIT | Extensive (2,440 tests) |
| INTEGRATION (mocked repo/store) | Extensive |
| POSTGRES (real) | **Missing** — `repo.pg.mjs` and `migrate.mjs` are unit-tested against their own logic only; never run against a real Postgres instance in CI or this pass |
| REDIS (real) | **Missing** — same gap for `ioredis`-backed rate-limit/quota paths |
| E2E (real browser) | **Missing entirely** (P1-2) |
| LOAD | One bounded manual `autocannon` smoke test recorded in `IMPLEMENTATION_STATUS.md`; no repeatable load-test suite/CI job |
| SECURITY (beyond unit-level CSRF/rate-limit/password tests) | No dependency-scanning gate beyond `npm audit` in CI; no DAST/pen-test evidence |
| FAILURE-INJECTION | None automated — Section 17's matrix is reasoned from code, not exercised |

## 27. Launch Gates

| Gate | Status | Blocking issue |
|---|---|---|
| 1 — Security | PARTIAL | P0-2 private-media authorization |
| 2 — Data integrity | PARTIAL | Sync/concurrency scenarios unproven against real infra (UNKNOWN, not FAIL) |
| 3 — Production infrastructure | **FAIL** | P0-1 no backup/DR |
| 4 — Load capacity | UNKNOWN | No real load test executed |
| 5 — Observability | **FAIL** | P1-1 no error telemetry/metrics |
| 6 — Backup/restore | **FAIL** | P0-1 |
| 7 — E2E | **FAIL** | P1-2 no real-browser suite |
| 8 — Deployment/rollback | PASS | Strong CI/CD, not live-drilled this pass |
| 9 — Abuse controls | PARTIAL | P1-3/P1-4 Community/Marketplace has none |
| 10 — Cost controls | PASS | AI wallet+quota live and fail-closed |

A public launch recommendation cannot be YES while Gates 3, 5, 6, and 7 are FAIL — hence CONDITIONAL GO, not GO.

## 28. Prioritized Engineering Backlog

| Order | ID | Severity | Task | Why | Dependency | Effort |
|---|---|---|---|---|---|---|
| 1 | P0-3 | P0 | Land or revert the in-progress voice/chat-dock work until `npm test` is green | Nothing else should merge on top of a red suite | — | S–M |
| 2 | P0-1 | P0 | Automated Postgres backup + uploads backup + one real tested restore | Present-tense data-loss risk to real users today | A place to store off-server backups | M–L |
| 3 | P0-2 | P0 | Owner-authorization check on private media (`/uploads/{session,pattern,strategy,trade}/*`) | Confirmed IDOR-class gap on the most sensitive data | — | M |
| 4 | P1-6 | P1 | Tune `server/db/pool.mjs` (`max`, timeouts, `statement_timeout`) | Cheapest fix with real backpressure benefit | — | XS |
| 5 | P1-3 | P1 | Rate-limit Community/Marketplace/Messaging write routes | Cheap (primitive exists), closes an open abuse path before public registration widens | — | S |
| 6 | P1-5 | P1 | Resolve the `qs`/`express` moderate vulnerabilities | Known-CVE-class exposure in the request-parsing path | Regression run after Express bump | M |
| 7 | P1-1 | P1 | Minimal error-telemetry table + client capture (Section 18 design) | Cannot safely operate a public incident response without this | — | M |
| 8 | P1-4 | P1 | Admin report-review queue | Moderation currently collects but never resolves | — | S–M |
| 9 | P1-2 | P1 | Playwright E2E for the top 8-10 journeys | This project's own known failure mode (real-browser-only bugs) | A real staging Postgres/Redis to run against | L |
| 10 | P1-7 | P1 | Prove a 2-replica topology (app + shared uploads path) | Needed before any real horizontal scale-out | Shared storage decision (S3-class vs. network volume) | M |
| 11 | — | P2 | `/readyz` includes Redis; scheduled cleanup cron for expired sessions/transactions; branch protection on `main` | Cheap operational hardening | — | S combined |
| 12 | — | P2 | MFA/TOTP enrollment flow | Admin-compromise blast-radius reduction | DB/crypto primitives already exist | M |

## 29. Critical Path to Launch

```
P0-3 (green test suite on the branch)
   ↓
P0-1 (backup + tested restore)  ──────┐
   ↓                                   │
P0-2 (private-media authorization)     │  (can run in parallel with P0-1)
   ↓                                   │
P1-6 (pool tuning) + P1-3 (community rate limits) + P1-5 (dependency fix)
   ↓
P1-1 (error telemetry) + P1-4 (report queue)
   ↓
P1-2 (E2E for top journeys) ── requires a real staging Postgres/Redis
   ↓
Section 16 load test against staging
   ↓
Rollback drill (Section 21) on staging
   ↓
Staged public rollout (Section 30): 1% → 5% → 20% → 50% → 100%
```

## 30. Release Timeline Scenarios

### Aggressive — P0 + unavoidable P1 only
Fix P0-1, P0-2, P0-3, P1-6 (pool tuning is nearly free), P1-3 (rate limits, cheap wiring). Skip E2E/telemetry for the very first opening. **~1–1.5 weeks** of focused work. Assumption: accepts operating a public surface with no error visibility and no automated browser regression coverage — real risk if a real-browser-only bug reaches production during the opening (this project's own demonstrated failure mode).

### Recommended — P0 + P1 + required operational readiness
All of the above plus P1-1 (telemetry), P1-4 (report queue), P1-5 (dependency fix), and at minimum the top 3-4 E2E journeys from P1-2 (register/login/logout, two-account isolation, create-trade-with-image, session expiry). **~3–4 weeks.** This is the scenario this audit's CONDITIONAL GO assumes.

### Conservative — additional P2 hardening included
All of Recommended, plus the full P1-2 E2E set, P1-7 (proven 2-replica topology), MFA enrollment, and a live rollback drill on staging. **~5–7 weeks.**

All three assume one engineer at the pace implied by the effort sizes in Section 28; parallelizable across more engineers where dependencies allow (see Section 29's graph — P0-1 and P0-2 can run in parallel, as can several P1 items).

## 31. GO / NO-GO Decision

`PUBLIC LAUNCH: CONDITIONAL GO`

Conditions required to change this to a full **GO**:
1. **P0-1**: automated Postgres + uploads backups exist, and one real restore has been performed and verified against a scratch environment.
2. **P0-2**: private user media (`session`/`pattern`/`strategy`/`trade` uploads) is authorized by ownership, not merely by authentication.
3. **P0-3**: the branch/commit actually being promoted has a fully green `npm test` run (0 failures), confirmed fresh, not inherited from an older doc.
4. **P1-3**: Community/Marketplace/Messaging write endpoints have rate limiting.
5. **P1-1**: a minimal error-telemetry pipeline is live, so an incident during the public opening is visible within minutes, not discovered from user reports.
6. At least the top user journeys (register/login/logout, cross-account isolation, create-and-view-trade-with-image) have been proven against a **real browser**, not only mocked-DOM unit tests.

Everything else in this report (P2/P3, the full E2E matrix, MFA, multi-replica scaling) can reasonably wait until after a **staged** public rollout (1% → 5% → 20% → 50% → 100%, per Section 29), watching the new error-telemetry pipeline and the load-test SLOs from Section 16 at each step, rather than blocking the first opening entirely.
