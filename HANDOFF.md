# Handoff

- Rules: `AGENTS.md` plus the task-selected `skills/*/SKILL.md` files are mandatory for every contributor and agent.
- Architecture: Vite/React client, Express Community API, AI API, PostgreSQL, Caddy, Docker Compose.
- Git: `dev` is the integration branch; `main` is production and receives only verified fast-forwards from `dev`.
- Status: Agent skills and separate staging deployment automation are promoted to `dev`, `main`, and `staging` at `41bcf73`; `npm test` 730 passed and production build passed with Node.js 24.
- Status: Agent rules explicitly require targeted discovery, pattern reuse, single data paths, minimal changes, and compact context/reporting on `docs/maintainability-rules`.
- Status: Language contract added on `docs/agent-language-contract`: work artifacts stay in English; final responses use the user's requested or most recent language.
- Next: Configure staging DNS/server/secrets and set `STAGING_DEPLOY_ENABLED=true` to publish the existing verified `staging` branch.
- Known issues: GitHub branch protection settings remain to be enabled by a signed-in repository admin.
