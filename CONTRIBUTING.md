# Contribution Quick Reference

This is a human entry point. The full, canonical Git procedure is
[`skills/navrya-git-collaboration/SKILL.md`](skills/navrya-git-collaboration/SKILL.md).

```text
task branch -> dev
                  \
                   staging -> staging environment
                  \
                   main -> production
```

1. Start from current `dev` and create one task branch.
2. Fetch before each commit and rebase onto `origin/dev` when it advanced.
3. Run `scripts/push-to-dev.sh` with Node.js 22 or newer when the task is ready.
4. `dev` verifies code only. Publish staging or production only after the explicit user request and by using the guarded command in the canonical Git skill.

Do not push directly to `dev`, `staging`, or `main`. Do not merge task work manually into `dev`. Do not treat "push to site" as a release target: ask the user to specify `dev`, `staging`, or `production`.

## Required GitHub settings

- Protect `main`: restrict direct pushes and require the `Verify main source` status check. Permit only the configured release maintainer to use the guarded production promotion script.
- Protect `dev`: disallow force pushes.
- Protect `staging`: disallow force pushes.
