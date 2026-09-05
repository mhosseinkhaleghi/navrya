# NAVRYA Public Launch Readiness Audit

**Audit date:** 2026-09-04 (original audit) — **remediation status updated 2026-09-05**
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

## 0. Remediation Status (as of 2026-09-05)

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

## 27. Launch Gates (updated)

| Gate | Status | Blocking issue |
|---|---|---|
| 1 — Security | **Improved** (was PARTIAL, blocked on P0-2) | P0-2 closed; no other P0-level security gap identified in the original pass |
| 3 — Production infrastructure | **Improved, not yet PASS** | P0-1's code is live; real off-server protection needs operator credential setup + a real restore drill before this gate can read PASS |
| 6 — Backup/Restore | **Improved, not yet PASS** | Same as Gate 3 — mechanism exists, has not been proven against real infrastructure |
| 5, 7, 9 | Unchanged (FAIL/PARTIAL) | No error telemetry (P1-1), no real-browser E2E (P1-2), no Community rate limiting (P1-3) — none of this has been started |
| 8 — Deployment/Rollback | **PASS, now with a real data point** | The exact deploy pipeline this gate assessed was exercised for real, twice, in this remediation pass (`P0-2`→run #144, `P0-1`→run #145), both `success`, both independently verified via the GitHub API and live HTTP checks — this is no longer only "reviewed code," it is now also "observed working." |

## 31. GO / NO-GO Decision (updated)

`PUBLIC LAUNCH: CONDITIONAL GO` (unchanged classification)

Conditions from the original audit, with current status:

1. ~~**P0-1**: automated Postgres + uploads backups exist, and one real restore has been verified.~~ → Code done; **restore drill still outstanding** (needs a real off-server repository + operator credentials).
2. **P0-2**: private media authorized by ownership. → **Done, verified live.**
3. **P0-3**: the promoted commit has a fully green, fresh `npm test`. → **Done, verified live.**
4. **P1-3**: rate limiting on Community/Marketplace/Messaging writes. → **Not started.**
5. **P1-1**: minimal error-telemetry pipeline live. → **Not started.**
6. Top user journeys proven against a real browser. → **Not started.**

Two of six original GO conditions are now met with live evidence; a real backup restore drill would bring a third to effectively-met (mechanism proven, only operator credential setup remaining). Conditions 4-6 remain the real work standing between here and GO.
