# Git Workflow

```text
task branch -> dev -> main -> production
                  \
                   staging -> staging environment
```

1. Start from current `dev`.
2. Create one task branch.
3. Fetch and rebase onto `origin/dev` before each new commit.
4. Run `scripts/push-to-dev.sh` with Node.js 22 or newer when the task is ready.
5. GitHub verifies `dev`, fast-forwards `main`, and deploys `main`.
6. Run `scripts/promote-dev-to-staging.sh` from an up-to-date `dev` checkout to publish a separately selected staging revision.

Do not push directly to `dev`, `staging`, or `main`. Do not merge task work manually into `dev`. See `AGENTS.md` and `skills/INDEX.md` for required rules.

## Required GitHub settings

- Protect `main`: restrict direct pushes and require the `Verify main source` status check.
- Protect `dev`: disallow force pushes.
- Protect `staging`: disallow force pushes.
- Give the GitHub Actions token repository write permission so the promotion workflow can fast-forward `main`.
