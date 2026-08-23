# NAVRYA Agent Contract

These rules are mandatory for every human and agent in this repository.

## Read first

Before task work, read:

1. `HANDOFF.md`
2. `skills/INDEX.md`
3. Every skill selected by that index

The relevant skill is the operating procedure. Implementation and focused tests are authoritative where historic documentation disagrees.

## Efficiency and maintainability

- Start with targeted discovery: use `rg` to find the existing feature, store, API, event, test, and design contract before creating anything new.
- Reuse the established implementation path. Do not create a second store, endpoint, component, event, data shape, persistence path, or design system for an existing domain.
- Keep one canonical source of truth per concern. Extend a public adapter when cross-feature access is needed instead of reading another module's internals.
- Make the smallest coherent change. Do not rewrite, reformat, or refactor unrelated code.
- Read only task-relevant skills and references. Keep reports compact, avoid repeated summaries, and record durable context once in `HANDOFF.md` or the relevant skill.

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
- GitHub Actions alone fast-forwards `main` from verified `dev` and deploys production.
- Run `scripts/promote-dev-to-staging.sh` only to publish a selected verified `dev` commit to staging.
- A request to “push to site” means: complete the task-branch commit, run `scripts/push-to-dev.sh`, wait for the GitHub Actions deployment, and report its result. It never means a direct `main` push or server SSH deployment.

## Collaboration

- One task branch has one owner. Declare files before editing and do not edit the same file concurrently.
- Only the primary agent integrates, commits, and pushes shared work.
- Update `HANDOFF.md` with active branch, owner, changed files, validation, remote state, and next action.

## Source documents

- `skills/navrya-git-collaboration/SKILL.md`
- `skills/navrya-deployment/SKILL.md`
- `skills/navrya-architecture/SKILL.md`
- `skills/navrya-javascript-engineering/SKILL.md`
