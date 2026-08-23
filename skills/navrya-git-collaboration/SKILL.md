---
name: navrya-git-collaboration
description: Safely synchronize, create, commit, rebase, and promote NAVRYA work across task, dev, staging, and main branches. Use for every Git action, branch update, commit, rebase, push, release, or multi-agent collaboration task in this repository.
---

# NAVRYA Git Collaboration

Treat `main`, `dev`, and `staging` as shared deployment branches. Never commit directly to them.

## Mandatory preflight

Before editing, creating a branch, or committing, run:

```sh
git config --get user.name
git config --get user.email
git fetch --prune origin
git status --short --branch
git push --dry-run origin HEAD:refs/heads/dev
```

Stop if the identity, SSH access, or worktree is wrong. Preserve unrelated local work.

## Branch model

```text
task branch -> dev -> main -> production
                  \
                   staging -> staging environment
```

- Start a task branch from current `origin/dev`: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`, or `docs/<scope>`.
- `dev` is the integration branch. `main` is production and is changed only by GitHub Actions after `dev` verification.
- `staging` is a deploy-only snapshot of a selected `dev` commit. It can differ from production. Never develop or commit directly on it.
- One task branch has one owner. Agents declare owned files before editing. Only the primary agent integrates, commits, and pushes.

Create a task branch only with:

```sh
git switch dev
git pull --ff-only origin dev
git switch -c feat/<scope>
```

## Sync and commit

Fetch before every commit. If `origin/dev` advanced, rebase the task branch before committing:

```sh
git fetch --prune origin
git rebase origin/dev
```

Use `git pull --ff-only` on shared branches. Do not create merge commits. Stage only task files and use small Conventional Commits. Do not force-push `dev`, `staging`, or `main`. A task-branch owner may use `--force-with-lease` only after an approved rebase.

## Promotion commands

When asked to push work to development, run only:

```sh
scripts/push-to-dev.sh
```

It rejects dirty or stale work, runs the full test/build gate, and fast-forwards `dev`. GitHub Actions then verifies `dev`, fast-forwards `main`, and deploys production.

When asked to publish the current verified `dev` revision to staging, run only:

```sh
git switch dev
git pull --ff-only origin dev
scripts/promote-dev-to-staging.sh
```

Do not manually push a branch to `main`, SSH to a server to deploy, restart Caddy, or claim a release succeeded before its GitHub Actions run succeeds.

## Agent handoff

Update `HANDOFF.md` with the branch, owner, changed files, checks, remote state, and next action. Read it again after a context reset.

## References

- `AGENTS.md` for mandatory repository policy.
- `CONTRIBUTING.md` for the concise branch flow.
- `HANDOFF.md` for current work.
- `/Users/soeil/Documents/claude-instructions/GIT_HELP.md` and `git-custom-github-workflow.md` for identity and SSH diagnosis. Do not import their generic `main` workflow over this repository's branch model.
