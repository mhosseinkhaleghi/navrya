# Git Workflow

```text
task branch -> dev
                  \
                   staging -> staging environment
                  \
                   main -> production
```

1. Start from current `dev`.
2. Create one task branch.
3. Fetch and rebase onto `origin/dev` before each new commit.
4. Run `scripts/push-to-dev.sh` with Node.js 22 or newer when the task is ready.
5. GitHub verifies `dev` only. A `dev` push never publishes an environment.
6. Only when the user explicitly requests it, run `scripts/promote-dev-to-staging.sh` from an up-to-date `dev` checkout to publish staging.
7. Only when the user explicitly requests it, run `scripts/promote-dev-to-production.sh` from an up-to-date `dev` checkout to publish production.

Do not push directly to `dev`, `staging`, or `main`. Do not merge task work manually into `dev`. Do not treat "push to site" as a release target: ask the user to specify `dev`, `staging`, or `production`. See `AGENTS.md` and `skills/INDEX.md` for required rules.

## Required GitHub settings

- Protect `main`: restrict direct pushes and require the `Verify main source` status check. Permit only the configured release maintainer to use the guarded production promotion script.
- Protect `dev`: disallow force pushes.
- Protect `staging`: disallow force pushes.
