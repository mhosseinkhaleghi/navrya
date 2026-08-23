# Handoff

- Rules: `AGENTS.md` plus the task-selected `skills/*/SKILL.md` files are mandatory for every contributor and agent.
- Architecture: Vite/React client, Express Community API, AI API, PostgreSQL, Caddy, Docker Compose.
- Git: task branches start from and return to `dev`; staging and production publish only after an explicit user request.
- Status: Agent skills and separate staging deployment automation are promoted to `dev`, `main`, and `staging` at `41bcf73`; `npm test` 730 passed and production build passed with Node.js 24.
- Status: Agent rules explicitly require targeted discovery, pattern reuse, single data paths, minimal changes, and compact context/reporting on `docs/maintainability-rules`.
- Status: Language contract promoted to `dev` and `main` at `9037581`: work artifacts stay in English; final responses use the user's requested or most recent language.
- Status: Explicit-release policy: `dev` verifies automatically; staging and production require separate user requests.
- Status: The staging branch and deployment workflow exist, but no separate staging server, DNS, or GitHub staging credentials are configured.
- Next: On "set up staging" or first "publish staging", the deployment agent provisions the separate staging environment, attaches staging DNS, configures credentials, verifies HTTPS, and records non-secret facts here.
- Known issues: GitHub branch protection settings remain to be enabled by a signed-in repository admin.
