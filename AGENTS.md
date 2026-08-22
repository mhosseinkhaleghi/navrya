# Collaboration and Git Rules

These rules are mandatory for every human and agent working in this repository.

## Branch model

- `main` is production. It is updated only by the `dev` promotion workflow.
- `dev` is the shared integration branch.
- Create one short-lived task branch from current `origin/dev`: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`, or `docs/<scope>`.
- Never commit directly to `main` or work directly on `dev`.
- Do not mix unrelated tasks on one branch.

## Required preflight

Before editing files or creating a branch, run:

```sh
git config --get user.name
git config --get user.email
git fetch --prune origin
git status --short --branch
git push --dry-run origin HEAD:refs/heads/dev
```

If author identity, remote write access, or the working tree state is wrong, stop and resolve it before making changes. Do not create commits that cannot be pushed.

Create the task branch only from an up-to-date `dev`:

```sh
git switch dev
git pull --ff-only origin dev
git switch -c feat/<scope>
```

## Sync and commits

- Fetch before every new commit.
- If `origin/dev` advanced, rebase the task branch onto it before committing. Resolve conflicts deliberately and run the affected checks again.
- Never use `git pull` to create merge commits. Use `git pull --ff-only` for `dev` and `git rebase origin/dev` for task branches.
- Stage only task files. Never revert or include unrelated user changes.
- Make small, coherent Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, or `test:`.

## Collaboration

- One task branch has one owner.
- Agents must declare the files they own before editing. No concurrent editing of the same file.
- Subagents report findings and patches to the primary agent. Only the primary agent integrates, commits, and pushes.
- Record the active branch, owner, changed files, checks, and next action in `HANDOFF.md`.

## Promote to dev

When asked to push work to `dev`, run only:

```sh
scripts/push-to-dev.sh
```

The script fetches remotes, rejects a stale or dirty branch, requires both `dev` and `main` to be ancestors of the task branch, runs the full test and production build, then fast-forwards `dev`. A failed guard must be fixed, never bypassed.

## Main and deployment

- A successful `dev` push is verified and automatically fast-forwarded to `main` by GitHub Actions.
- A direct `main` push is invalid and is detected by GitHub Actions.
- Deployment always uses `main` after it has been promoted from `dev`.
- Do not force-push `dev` or `main`. Do not force-push task branches unless the owner explicitly approves `--force-with-lease` after a rebase.
