# Handoff

- Rules: `AGENTS.md` plus the task-selected `skills/*/SKILL.md` files are mandatory for every contributor and agent.
- Architecture: Vite/React client, Express Community API, AI API, PostgreSQL, Caddy, Docker Compose.
- Git: `dev` is the integration branch; `main` is production and receives only verified fast-forwards from `dev`.
- Status: Agent skills and separate staging deployment automation are ready on `docs/agent-skills-and-staging`; `npm test` 730 passed and production build passed with Node.js 24.
- Next: Promote this branch, configure staging DNS/server/secrets, then create `staging` from verified `dev` with `scripts/promote-dev-to-staging.sh`.
- Known issues: GitHub branch protection settings remain to be enabled by a signed-in repository admin.
