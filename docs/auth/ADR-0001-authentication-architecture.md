# ADR-0001: Authentication, Session, and Authorization Architecture

Status: **Accepted, implementation in progress.** See `IMPLEMENTATION_STATUS.md` for exact done/deferred state.

## Context

NAVRYA's current identity layer (`server/community/routes.auth.mjs`, `auth-real.mjs`,
`auth-tokens.mjs`) is a hand-rolled, single-file replacement for the original dev-mode
`x-dev-user-id` trust model. It works for a solo-developer preview but has structural problems
that make it unsafe for a public, multi-million-account target:

- A 30-day bearer credential lives in `localStorage` and is replayed on every request via the
  `x-dev-user-id` header (a name that no longer describes what it carries).
- `ADMIN_BOOTSTRAP_EMAIL` promotes *any* registrant whose email matches to `role: 'admin'`
  before email ownership is verified, and a real-looking address is committed in `render.yaml`.
- `ADMIN_AUTH_ENFORCED` defaults to disabled (fail-open); tests assert the fail-open behavior.
- No CSRF defense, no rate limiting, no distributed throttling, no security headers, no upload
  content-type verification, no DTO separation between public/self/admin user views, and the
  AI gateway (`server/pattern-ai-server.mjs`) trusts any caller once Basic Auth is absent.
- Password hashing runs synchronous `scryptSync` in the request thread with a 4-character
  minimum and no upper bound.

This ADR is scoped to identity/session/authorization/abuse-prevention only. It does not change
the trading-domain data model (Section 3 of `ARCHITECTURE.md`) or any Section 7.18 replica
infrastructure beyond how it resolves "who is the current user."

## Decision

### 1. Managed OIDC is the default target; a generic, standards-based adapter is what gets built now

Per instruction, the default is a maintained, standards-compliant managed OIDC identity provider
for password lifecycle, federation, verification, recovery, bot protection, MFA, and passkeys.
**No specific vendor is committed to in code.** The repository does not currently document a
selected IdP, so this implementation builds a **provider-neutral OIDC Relying Party adapter**
using `openid-client` (maintained, spec-compliant, actively developed by panva) driven entirely
by OIDC Discovery (`OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`).
Any provider that speaks standard OIDC (Auth0, Okta, WorkOS, Google Identity Platform, Keycloak,
Ory, Zitadel, ...) plugs in by configuration only.

The adapter is real code, exercised by real tests against a **local mock OIDC issuer**
(`tests/support/mock-oidc-issuer.mjs`, a minimal spec-shaped issuer used only in tests — not a
production dependency). Wiring a live vendor tenant (creating the account, registering the
redirect URI, obtaining a client secret) is an **operator prerequisite**, not a blocker to
building or testing the adapter itself.

Existing Google Sign-In (`google-auth-library`, ID-token verification) is kept as-is: it already
follows Google's official server-side verification guidance (issuer/audience/expiry/signature via
a maintained library) and is treated as one federated identity source among others, mapped by
`(issuer, subject)` exactly like the generic OIDC path — never by email.

### 2. Backend-for-frontend session model — NAVRYA never exposes a provider token to the browser

Regardless of how a user proves identity (password, Google, generic OIDC), the browser only ever
receives a **first-party, HttpOnly, Secure, SameSite session cookie** referencing a server-side
`auth_sessions` row. Provider access/refresh/ID tokens are consumed server-side and never
reach browser JavaScript. This directly removes the `localStorage` bearer-token model and the
`x-dev-user-id` misnomer.

- Session identifiers are cryptographically random (`crypto.randomBytes(32)`), stored **hashed**
  (SHA-256) in `auth_sessions`, never in plaintext server-side either.
- Idle and absolute expiry are both enforced; `last_seen` is amortized (throttled write, not
  every request).
- Logout, logout-all, per-device revoke, suspension revoke, and role-change revoke are real,
  server-side operations against `auth_sessions`, not client-side credential deletion.
- CSRF is handled via a **signed double-submit cookie** (HMAC of the session id with a
  server secret, delivered in a non-HttpOnly cookie, echoed by the client in a header) — the
  OWASP-documented pattern for exactly this "no server-side per-request state beyond the
  session itself" case. `Origin`/`Referer`/Fetch-Metadata (`Sec-Fetch-Site`) are validated in
  addition, since SameSite alone is not sufficient and this app's own iframe/postMessage
  architecture makes explicit origin checks doubly relevant.
- Legacy tokens (`x-dev-user-id` bearer values already issued under the old scheme) are accepted
  **only** through a time-boxed, heavily-throttled one-time exchange endpoint that mints a real
  cookie session and never re-issues the legacy format; a `LEGACY_AUTH_SUNSET_AT` date disables
  the exchange entirely once past. No new legacy tokens are ever minted after this change ships.

### 3. NAVRYA keeps owning authorization; the IdP (or password path) only proves identity

Internal user id, `role` (`user`/`moderator`/`admin` — authorization), `profileRole`
(`trader`/`mentor`/`teacher` — product label, unchanged separation), suspension, entitlements,
sessions, quotas, and audit events all remain NAVRYA-owned, keyed by internal `users.id`.
External identities map via a new `external_identities (issuer, subject) -> user_id` table with
a unique `(issuer, subject)` constraint — never a bare email join. Linking a new external
identity to an *existing* authenticated account requires an active session plus a recent
reauthentication marker; it is never automatic on email match (this already matched the
pre-existing Google path's own stated design and is now the uniform rule for every provider).

### 4. Self-hosted password path is kept, but hardened — not replaced by a second hand-rolled protocol

A full managed-IdP cutover requires a live vendor tenant NAVRYA does not have credentials for in
this environment. Per instruction, that absence is an **operator-configuration prerequisite**,
not license to keep extending the current hand-rolled HMAC token as the long-term design. So:

- Password hashing moves to **argon2id** (the `argon2` package, OWASP/NIST-recommended default,
  a maintained native binding — not a hand-rolled KDF invocation), tuned to OWASP's current
  minimum memory/time-cost guidance, with a documented async-scrypt fallback path only if a
  target platform genuinely cannot load the native binding.
- Password policy follows NIST 800-63B-4 / ASVS 5 L2 exactly as instructed: **minimum 15
  characters**, no arbitrary composition rules, no forced rotation, a bounded byte-length cap
  before hashing (documented max 256 bytes) applied *before* the expensive hash call, a local
  compromised/common-password blocklist check, and paste/autofill/password-manager compatibility
  (no client-side blocking of paste).
- Every other requirement in this ADR (sessions, CSRF, rate limiting, DTOs, audit log, MFA
  scaffold) is identical regardless of whether a given account authenticated via password or via
  OIDC — the session model is the single source of truth downstream of "how did you log in."

### 5. Redis is required for distributed state in production; in-memory is dev/test-only

Rate limiting (IP, normalized-account, session, sensitive-action) and short-lived login/OIDC
transaction state (PKCE verifier, `state`, `nonce`) need to be shared across horizontally scaled
API instances. A `RateLimitStore`/`TransactionStore` interface is implemented twice: an
`ioredis`-backed store (production) and an in-memory store (test/local dev only). Production
startup (`NODE_ENV=production`) refuses to boot without `REDIS_URL` — the same fail-closed
posture applied to `DATABASE_URL`, `AUTH_TOKEN_SECRET`/session-signing key, `INTERNAL_API_SECRET`,
and `ALLOWED_ORIGINS`.

### 6. The AI gateway gets real identity via internal session introspection, not a new DB connection

`server/pattern-ai-server.mjs` is deliberately Postgres-free by design (existing property, kept).
It already calls the Community API server-to-server for admin-configured keys
(`/internal/admin-ai-keys`, shared-secret protected). The same pattern is extended: a new
`/internal/session-introspect` endpoint on the Community API verifies a session cookie and
returns `{userId, role, suspended}`; the AI gateway calls it once per request (short in-memory
cache keyed by session-hash, not by raw cookie value) before doing anything else — before reading
the body, selecting a provider key, calling a provider, recording usage, or minting a Realtime
credential. Missing `INTERNAL_API_SECRET` in production is a hard startup failure for both
processes.

### 7. Object storage stays disk-backed for now behind a swappable interface

Full S3 migration needs real bucket credentials this environment does not have. The existing
`server/storage/storage.mjs` disk adapter is kept as the default local-dev implementation behind
a small `ObjectStore` interface (`put`, `getSignedUrl`, `delete`); an S3-compatible adapter is
added as a second implementation, selected by `OBJECT_STORE_DRIVER`, and is code-complete but
**not** integration-verified against a real bucket in this session.

## Consequences

- Every browser-side call site that manually attaches `x-dev-user-id` continues to compile and
  run unmodified during the transition, because identity now travels via cookie automatically;
  the handful of *helper* functions that mint/read the credential are what change, not the ~30
  call sites that consume them. The header name is retained one more time, now carrying an
  **empty/absent value** by design (cookie is authoritative), then removed outright once the
  legacy-token sunset window closes.
- `docs/auth/IMPLEMENTATION_STATUS.md` tracks exactly what is code-complete, locally verified
  (via `npm test` against the in-memory repo and a mock OIDC issuer), integration-verified
  (would need real Postgres/Redis, not available in this sandboxed environment), staging-verified
  (not performed — no staging host was touched), and left as an explicit operator prerequisite
  (a live OIDC tenant, a live Redis instance, a live S3-compatible bucket, live PostgreSQL).
- No production deploy is performed by this work. Rollout, canary, and rollback remain the
  operator's action, guided by the runbook this work adds under `docs/auth/`.
