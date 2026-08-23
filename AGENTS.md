# NAVRYA Agent Contract

These rules are mandatory for every human and agent in this repository.

## Read first

Before task work, read:

1. `HANDOFF.md`
2. `skills/INDEX.md`
3. Every skill selected by that index

The relevant skill is the operating procedure. Implementation and focused tests are authoritative where historic documentation disagrees.

## Non-negotiable Git policy

- Work only on a short-lived task branch created from current `origin/dev`.
- Never commit directly to `dev`, `staging`, or `main`.
- Fetch before every commit. Rebase the task branch onto `origin/dev` whenever it advanced.
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
