# Git Workflow

```text
main <- automated fast-forward <- dev <- guarded fast-forward <- task branch
```

1. Start from current `dev`.
2. Create one task branch.
3. Fetch and rebase onto `origin/dev` before each new commit.
4. Run `scripts/push-to-dev.sh` with Node.js 22 or newer when the task is ready.
5. GitHub verifies `dev`, fast-forwards `main`, and deploys `main`.

Do not push directly to `main`. Do not merge task work manually into `dev`. See `AGENTS.md` for the required preflight and collaboration rules.

## Required GitHub settings

- Protect `main`: restrict direct pushes and require the `Verify main source` status check.
- Protect `dev`: disallow force pushes.
- Give the GitHub Actions token repository write permission so the promotion workflow can fast-forward `main`.
