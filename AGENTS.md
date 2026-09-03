# NAVRYA Agent Contract

These rules are mandatory for every human and agent in this repository.

## Read first

Before task work, read:

1. `HANDOFF.md`
2. `skills/INDEX.md`
3. Every skill selected by that index

The relevant skill is the operating procedure. Implementation and focused tests are authoritative where historic documentation disagrees.

## Documentation authority

`docs/README.md` maps every documentation area to one canonical source. Update that source and link to it instead of copying operational rules into another document. `HANDOFF.md` is current state, not a replacement for policy or architecture documentation.

## Efficiency and maintainability

- Start with targeted discovery: use `rg` to find the existing feature, store, API, event, test, and design contract before creating anything new.
- Reuse the established implementation path. Do not create a second store, endpoint, component, event, data shape, persistence path, or design system for an existing domain.
- Keep one canonical source of truth per concern. Extend a public adapter when cross-feature access is needed instead of reading another module's internals.
- Make the smallest coherent change. Do not rewrite, reformat, or refactor unrelated code.
- Read only task-relevant skills and references. Keep reports compact, avoid repeated summaries, and record durable context once in `HANDOFF.md` or the relevant skill.
- `ARCHITECTURE.md` is a reference manual, not a session primer. Grep its headings (`grep -n "^#" ARCHITECTURE.md`) for the relevant section and read only that, never the whole file, unless doing a full architecture audit.
- `dist/` and `public/pages/**/*.js` are generated, duplicated build output. Never read or grep them directly; the source is `navrya-src/` and `server/`.
- Treat any file over ~20K tokens (~80KB) as a reference doc: grep the heading you need, then read only that section, never the whole file start to finish.
- Exclude `node_modules`, `dist`, `build`, `coverage`, `vendor`, and `package-lock.json` from any recursive search.
- Never read `.env`/`.env.*` files in full. Grep for the one key needed.
- Push exploration spanning more than a few files to a background/sub-agent and keep only the synthesized answer in the main task.

## Execution style

- Do not ask a clarifying question when a reasonable default exists. State the assumption in one line and proceed. Only stop for a decision that is genuinely ambiguous, or for anything destructive, hard to reverse, or outside this contract's explicit approval gates (git/deploy policy below).
- No preamble, no restating the request back, no trailing summary of what was just done unless asked. Report results, not process.
- Batch independent discovery/reads into one pass instead of a back-and-forth series of single lookups.
- Never drive the app through a browser (Playwright, MCP browser/preview tools, screenshots, clicking through a UI flow) unless the user explicitly asks for that verification on this task. Development, plus the focused `node --test` file(s) for the change, is the job; the user does visual/UI testing and reports back. A cheap `curl`/`WebFetch` check that a deployed URL returns the expected status, or that a live bundle contains an expected marker string, is not UI testing and stays required by `skills/navrya-deployment/SKILL.md`'s release checks.

## Working and response language

- Accept requests in any language. Translate non-English requests into English before planning or implementation.
- Use English for reasoning, task tracking, progress updates, code, identifiers, comments, filenames, branches, commits, tests, and internal documentation.
- Preserve a non-English language only when the task specifically creates, translates, or validates localized product content.
- Write the final user-facing response only in the language the user used most recently, or in the language they explicitly request. Do not duplicate the response in English unless asked.

## Non-negotiable Git policy

- Work only on a short-lived task branch created from current `origin/dev`.
- Never commit directly to `dev`, `staging`, or `main`.
- Fetch before every commit. If `origin/dev` advanced after the task branch was last synchronized, rebase before committing. When task edits are uncommitted, safely stash them, rebase, and restore them before the commit.
- Use `git pull --ff-only` for shared branches. Do not create merge commits.
- Stage only task files and use small Conventional Commits.
- Do not force-push `dev`, `staging`, or `main`.
- Run `scripts/push-to-dev.sh` to promote a completed task. Do not manually push to `dev`.
- A `dev` push runs verification only. It never publishes staging or production.
- Run `scripts/promote-dev-to-staging.sh` only after the explicit request "publish staging" or "push to staging".
- Run `scripts/promote-dev-to-production.sh` only after the explicit request "publish production" or "push to production".
- When staging does not exist, an explicit "set up staging" or "publish staging" request authorizes the deployment agent to provision the separate staging environment, attach its staging DNS names, configure GitHub deployment credentials, and publish staging. It must record only non-secret verified facts in `HANDOFF.md`.
- Do not infer a production release from "push to site", "deploy", or "push this". Ask the user to choose `dev`, `staging`, or `production`.
- Never manually push to `staging` or `main`, SSH to deploy, or restart Caddy. The guarded promotion scripts are the only release path.

## Collaboration

- One task branch has one owner. Declare files before editing and do not edit the same file concurrently.
- Only the primary agent integrates, commits, and pushes shared work.
- Update `HANDOFF.md` with one compact line per entry: `branch (owner): what shipped, one clause | validation: pass count only | next: one clause`. No inline commit hashes, workflow run IDs, or byte-exact sizes, `git log` already has those. Collapse a resolved entry to one history line instead of leaving the full entry in place, and cap the file at roughly 60 lines by archiving or cutting old entries.

## Source documents

- `skills/navrya-git-collaboration/SKILL.md`
- `skills/navrya-deployment/SKILL.md`
- `skills/navrya-architecture/SKILL.md`
- `skills/navrya-javascript-engineering/SKILL.md`
