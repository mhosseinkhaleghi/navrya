# NAVRYA Public Launch Readiness Audit

**Audit date:** 2026-09-04 (original audit) — **remediation status updated 2026-09-06**
**Branch audited (original pass):** `fix/voice-mode-reliability` (dirty working tree at the time)
**Auditor role:** Principal Engineer / SRE / Security / Release Engineer
**Environment constraints on the original pass:** no Docker, no reachable Postgres/Redis, no live OIDC vendor tenant, no Playwright/browser binaries, no access to the production host. Every claim is labeled with its evidence type (code, test, configuration, doc, or live verification) and confidence.

> **Note on this file's own history:** the first version of this document was written but never
> committed (it was an "optional documentation artifact" per the original audit instructions). In
> this repo's shared-worktree setup it was accidentally swept into an unrelated session's broad
> WIP snapshot commit on `fix/voice-mode-reliability`, then deleted when that work was finalized
> into a different commit. It is recreated here, updated with real remediation evidence, and is
> now actually committed so it survives future branch switches.

---

## 0. Remediation Status (as of 2026-09-06)

**Nine backlog items closed this pass** (commits `d7e1574` → `8481320` on `dev`, all pushed; `d7e1574`/`2f06989`/`03c324c` also promoted to `main`/production and independently verified live via the GitHub Actions API and direct HTTP checks - see the P0 rows below). Every item has real, automated test coverage that ran and passed before its commit; none of this is claimed without evidence.

| ID | Item | Status | Commit |
|---|---|---|---|
| P0-1 | No backup/DR | Code shipped & live. **Operator activation (real off-server credentials + cron + restore drill) still required.** | `2f06989` |
| P0-2 | Private-upload IDOR | **Closed, verified live.** | `d7e1574` |
| P0-3 | Red branch could be promoted | **Closed** (the red branch was never merged; verified fresh on the live commit). | `03c324c` |
| P1-5 | npm audit (qs vuln) | **Closed.** `qs@6.16.0` forced via `overrides` (no Express major bump) - `npm audit --omit=dev --audit-level=high` now 0 vulnerabilities. | `23b5bf7` |
| P1-6 | DB pool untuned | **Closed.** `max`/`idleTimeoutMillis`/`connectionTimeoutMillis`/`statement_timeout`/`query_timeout`, all env-overridable. | `23b5bf7` |
| P1-3 | No rate limiting on Community/Marketplace/Messaging writes | **Closed.** 9 routes limited, each proven to 429+Retry-After over real HTTP once exceeded. | `23b5bf7` |
| P1-4 | No admin report-review queue | **Closed (API only).** `GET/PATCH /api/admin/reports`, fail-closed, audit-logged. **No dedicated admin UI panel yet** - noted fast-follow. | `23b5bf7` |
| P2 | Expired sessions/OIDC transactions never cleaned up | **Closed.** In-process interval (6h + once at startup), real repo only. | `23b5bf7` |
| P2 | `/readyz` didn't check Redis | **Closed.** Configured-but-unreachable Redis now fails readiness; unconfigured (dev/test) still doesn't block it. | `43ff4ce` |
| P1-1 | No error/crash telemetry | **Closed (server-side only).** Ingestion (`POST /api/errors`, pre-auth, rate-limited, field-capped) + upsert-based aggregation + admin review (`GET/PATCH /api/admin/errors`). **No client-side capture script or HTML wiring yet** - explicitly deferred, see below. | `8481320` |

### Explicitly deferred this pass, with reasons (not silently skipped)

- **P1-1's client half** (window.onerror/unhandledrejection capture script + `<script>` wiring into the character/admin/select pages): the server pipeline is complete and tested; wiring the client requires verifying against each page's existing exact script-order test contracts (ARCHITECTURE.md's "Character page contract"), which this pass's remaining time didn't allow doing carefully enough to risk on a live production codebase. A future pass should read those contract tests first, then add one `<script>` tag per page.
- **P1-2 (real-browser E2E / Playwright):** genuinely attempted a feasibility check (npm registry reachable), but a real setup needs a downloaded Chromium binary plus orchestrating the actual multi-process dev stack (Vite + community-api + pattern-ai) under test - the audit's own effort estimate for this item was **L (4-7 days)** even for a focused human engineer. A rushed, partial version risked real time for token value; deferred rather than forced.
- **P1-7 (prove a 2-replica topology):** needs a real, reachable Redis instance to prove rate-limit/quota state is genuinely shared across replicas - none was available in this sandboxed session.
- **GitHub branch protection** (mentioned in `HANDOFF.md`'s own "Known pending"): needs a signed-in repo admin acting through the GitHub UI or an API token - neither `gh` CLI nor a `GITHUB_TOKEN` was available in this session.
- **MFA/TOTP enrollment:** a real, standalone feature (DB columns + encryption primitive already exist per `IMPLEMENTATION_STATUS.md` - only the enrollment/verification UI and route are missing) - out of scope for this pass's backlog, left as originally assessed (P2).

### A real incident during this pass, worth recording honestly

Partway through this session, this repository's shared working directory (used concurrently by another agent session working on an unrelated `docs/voice-agentification-audit` branch) was silently re-checked-out to that other branch mid-edit. Because that branch's pointer sits at the same commit `dev` started this session from (with no commits of its own - the other session works via uncommitted changes), the checkout silently reverted several files this session had already committed (P0-2's `app.mjs`/`repo.pg.mjs`/`repo.memory.mjs` changes) back to their pre-fix state **in the working directory only** - `origin/dev`/`origin/main`'s actual git history was never at risk. Caught immediately (a file that should have contained the P0-2 wiring didn't), diagnosed via `git log`/`git diff` rather than guessed, and recovered by capturing the one genuinely-conflicting uncommitted edit, discarding the corrupted working-tree copies, and re-checking out `dev` cleanly before reapplying that edit on the correct base. Verified via a full fresh test run afterward (2493/2493) that nothing was lost. Recorded here because it is exactly the kind of failure mode this audit's own methodology (verify, don't assume) is supposed to catch even in the tooling doing the remediation.

| ID | Finding | Status | Evidence |
|---|---|---|---|
| **P0-1** | No backup/DR strategy for PostgreSQL/uploads | **Code shipped, live in production. Operator activation still required.** | `scripts/backup.sh`/`scripts/restore.sh`, `docker-compose.production.yml`'s `backup` service, `docs/BACKUP-AND-RESTORE.md` — merged to `dev`/`main` at commit `2f06989`, deployed via GitHub Actions run `#145` (`conclusion: success`, verified via the GitHub REST API directly, not assumed). **The mechanism is live; actual protection is not yet active** — `RESTIC_REPOSITORY`/`RESTIC_PASSWORD`/backend credentials still need to be set in the production server's real `.env` and the cron job installed (real operator actions requiring server access this session does not have). A real restore drill (the runbook's own mandatory step 6) has not been performed. |
| **P0-2** | Private uploads authorized by "any session," not real ownership | **Fixed and verified live.** | `server/community/security/upload-ownership.mjs` + repo methods + `051_upload_ownership_indexes.sql` — merged to `dev`/`main` at commit `d7e1574`, deployed via GitHub Actions run `#144` (`success`, 7.3m). `tests/uploads-authorization.test.mjs` rewritten to prove owner-vs-stranger isolation on both the storage_objects tier and the pre-storage_objects domain-row fallback tier. |
| **P0-3** | The branch/commit actually promoted must have a fully green, fresh `npm test` | **Resolved — confirmed for the exact commit currently live.** | The original finding was about `fix/voice-mode-reliability`'s dirty working tree (78/2440 failing, all in the AI voice subsystem then under active edit). That exact branch's unfinished work (`672ad40`) was **never merged** — it sits disconnected from `dev`/`main` to this day (`git merge-base --is-ancestor origin/fix/voice-mode-reliability origin/dev` → false; the only commit on that branch not in `dev` is the abandoned WIP snapshot itself). The voice-subsystem work that actually reached `dev`/`main` came through a different, completed path (`76531de`). A fresh, explicit `npm test` run against `origin/main`'s exact current commit (`2f06989`), timestamped `2026-09-05T15:59:12Z`, passed **2466/2466, 0 failures** — this is what is genuinely live today, independently re-verified, not inferred from an old run. |

Both live-deploy claims above (P0-1's shipped code, P0-2) were checked against the **real** GitHub Actions API (`api.github.com/repos/.../actions/workflows/330715813/runs`), not assumed from a local `git push` succeeding, and against the **real** live domains (`https://app.navrya.com/` and `https://admin.navrya.com/`, both `HTTP 200` at verification time).

**Everything else in this document (P1/P2/P3 findings, the failure matrix, the load-testing plan, the missing E2E/observability gaps, etc.) is unchanged from the original audit** — only P0-1/P0-2/P0-3 have been acted on so far.

---

## 1. Executive Summary

**Launch Readiness Score: 58 / 100 at the time of the original audit → materially improved for the three P0 items above, but the score is not re-computed wholesale here** (P1 items — no error telemetry, no real-browser E2E, no Community rate limiting — remain fully open, and P0-1's real-world protection depends on an operator step not yet performed). Treat the P0 section above as authoritative for what has changed; the rest of this document's severity/priority tables are as originally assessed.

**Current Recommendation: CONDITIONAL GO** (unchanged classification — P0-1's operator activation and the P1 backlog are what keep it from GO; see Section 31).

**Recommended Release Stage:** Closed / Invite-only Beta → staged public rollout, gated on the remaining P1 backlog (Section 28).

### Assumptions and important context

- NAVRYA is an actively operated system with real production deploys, real BSC crypto payments, and a real user base on `app.navrya.com`/`admin.navrya.com` — confirmed still true and unchanged since the original audit.
- The three P0 items tracked in Section 0 were fixed and pushed through this project's real git-flow (`dev` → `main`, guarded by `scripts/push-to-dev.sh`/manual equivalent checks, each gated on a real `npm test`/`npm run build` pass) and confirmed live via the real GitHub Actions API and direct HTTP checks against the production domains — not claimed from local success alone.
- This audit pass (and the remediation work) could still not exercise real Postgres/Redis/OIDC/a real restic backend/a real browser from this sandboxed session. Everything under those categories remains graded by code inspection only, per the original audit.

---

## 2. Current Production Architecture

Unchanged from the original audit. See the architecture diagram and component breakdown preserved below (Section 2 of the original pass) — no structural changes were made by the P0-1/P0-2/P0-3 remediation, only: a new `backup` one-shot Docker service/image stage (P0-1), a new authorization middleware layer in front of `express.static` for `/uploads/{session,pattern,strategy,trade}/*` (P0-2), and no code change at all for P0-3 (a verification/branch-hygiene finding, not a code defect).

```
Browser (4 character iframes + admin)
   │  HttpOnly session cookie + CSRF header, same-origin fetch
   ▼
Caddy — TLS, static dist/, reverse-proxies /api/* and /uploads/*
   │                         │
   ▼                         ▼
Community API (8788)   AI/Pattern gateway (8787)
   │  pg.Pool               │  fetch (INTERNAL_API_SECRET) → Community API /internal/*
   ▼                         ▼
PostgreSQL (single container, single volume)   OpenAI / Anthropic / Gemini / Kimi / DeepSeek / ElevenLabs
   │
   ▼
Redis (single container, --appendonly no) — disposable rate-limit/quota/lease state

Uploads: local disk, single Docker named volume, served by Community API's express.static
  (now behind requireAuth() + requireUploadOwnership() for the four private categories - P0-2)

NEW: `backup` one-shot service (P0-1) — pg_dump + restic, pushed to an off-server repository,
  invoked by host cron (not yet configured with real credentials on the production server).
```

---

## 3. What Is Already Production-Ready

Unchanged from the original audit (strong session/CSRF/admin/AI-gateway/CI-CD foundation) — see the full list preserved in the original pass. **Now additionally true:**

- Private trading/mental-health-adjacent media is authorized by real ownership, not merely by authentication (P0-2, live).
- A real, tested backup/restore mechanism exists in code and is deployed (P0-1) — pending operator activation to become an actual guarantee.
- The commit currently live on production has a freshly, independently re-verified 100% green test suite (P0-3).

---

## 4. Launch Blockers — P0 (original findings, now cross-referenced to Section 0's status)

| ID | Finding | Status | Effort remaining |
|---|---|---|---|
| P0-1 | No backup/DR strategy | Code shipped & live; **operator must configure `RESTIC_REPOSITORY`/`RESTIC_PASSWORD`/backend credentials on the real production `.env`, install the cron line from `DEPLOYMENT.md`, and perform a real restore drill** (`docs/BACKUP-AND-RESTORE.md` step 6) | XS-S of operator time, not engineering time |
| P0-2 | Private-media IDOR | **Closed, verified live** | none |
| P0-3 | Red branch could be promoted | **Closed** — the red branch was never merged; the live commit is freshly verified green | none |

## 5-30. (Unchanged from the original audit)

Sections 5 through 30 of the original audit (P1/P2/P3 findings, Security/Auth/Data-Isolation/
Database/Sync/AI/Upload/Scalability detail, the 30-scenario Failure Matrix, the Load-Testing Plan,
the Error-Telemetry design, Observability, Deployment/Rollback, CI/CD, Privacy, Moderation,
Performance, Missing Tests, the Prioritized Backlog, and the Critical Path) are **unchanged** from
the 2026-09-04 pass and remain fully applicable — none of that work has been started yet. Refer to
the original audit content (this repository's own commit/chat history from 2026-09-04) for the
complete detail; it is not restated here to avoid this remediation update silently drifting from
what was actually re-verified today versus what is still exactly as it was.

## 27. Launch Gates (updated 2026-09-06)

| Gate | Status | Blocking issue |
|---|---|---|
| 1 — Security | **PASS** (was PARTIAL, blocked on P0-2) | P0-2 closed and verified live; P1-5's dependency vulnerability also closed. No other P0-level security gap identified. |
| 2 — Data integrity | PARTIAL (unchanged) | Sync/concurrency scenarios still unproven against real Postgres/Redis (UNKNOWN, not FAIL) - not addressed this pass |
| 3 — Production infrastructure | **Improved, not yet PASS** | P0-1's code is live and DB pool tuning (P1-6) closed; real off-server backup protection still needs operator credential setup + a real restore drill |
| 4 — Load capacity | UNKNOWN (unchanged) | No real load test executed - not addressed this pass |
| 5 — Observability | **Improved, not yet PASS** | Error-telemetry pipeline is built and live server-side (P1-1); `/readyz` now checks Redis too. Still missing: the client-side capture script actually wired into pages, and structured request logging/metrics (not attempted this pass) |
| 6 — Backup/Restore | **Improved, not yet PASS** | Same as Gate 3 — mechanism exists and is tested, has not been proven against real off-server infrastructure |
| 7 — E2E | FAIL (unchanged) | P1-2 explicitly deferred this pass - see Section 0's reasoning |
| 8 — Deployment/Rollback | **PASS, with real data points** | The exact deploy pipeline this gate assessed was exercised for real, five times across this remediation work (runs #144/#145 and three subsequent `dev` pushes with full local test+build gates each), every one `success` or independently green - "observed working," not only "reviewed code." |
| 9 — Abuse controls | **Improved, not yet PASS** | P1-3 (Community/Marketplace/Messaging rate limiting) and P1-4 (report review) both closed. AI/auth abuse controls were already strong. Remaining gap: no CAPTCHA/similar on registration itself (not part of the original P1 backlog, not assessed) |
| 10 — Cost controls | PASS (unchanged) | AI wallet+quota already live and fail-closed |

## 31. GO / NO-GO Decision (updated 2026-09-06)

`PUBLIC LAUNCH: CONDITIONAL GO` (unchanged classification — condition 6 alone still keeps this from full GO)

Conditions from the original audit, with current status:

1. **P0-1**: automated Postgres + uploads backups exist, and one real restore has been verified. → Code done, live; **the real restore drill against real off-server infrastructure is the one piece an operator, not this session, must still perform.**
2. **P0-2**: private media authorized by ownership. → **Done, verified live.**
3. **P0-3**: the promoted commit has a fully green, fresh `npm test`. → **Done, verified live.**
4. **P1-3**: rate limiting on Community/Marketplace/Messaging writes. → **Done, verified with real tests, pushed to `dev`.**
5. **P1-1**: minimal error-telemetry pipeline live. → **Done server-side, verified with real tests, pushed to `dev`. Client-side capture is the remaining half** (see Section 0).
6. Top user journeys proven against a real browser. → **Not done** - explicitly deferred this pass (Section 0); the largest remaining item.

Four of six original GO conditions are now substantively met (two fully live in production, two more complete and merged to `dev` pending its own next promotion). Condition 1's remaining piece is a bounded operator task, not engineering work. **Condition 6 (real-browser proof of the top user journeys) is now the single largest remaining gap standing between CONDITIONAL GO and GO** - everything else this pass touched has real, passing, automated evidence behind it.
