# Handoff

- Rules: `AGENTS.md` is mandatory for every contributor and agent.
- Architecture: Vite/React client, Express Community API, AI API, PostgreSQL, Caddy, Docker Compose.
- Git: `dev` is the integration branch; `main` is production and receives only verified fast-forwards from `dev`.
- Status: Git-flow automation policy ready on `chore/git-flow-automation`; `npm test` 722 passed and production build passed with Node.js 24.
- Known issues: GitHub branch protection settings must be enabled by a repository admin.
