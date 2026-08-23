# NAVRYA Documentation Map

Use this map to avoid maintaining the same rule in multiple places. Update the canonical document,
then link to it from summaries. Implementation and focused tests win when historic prose differs.

| Topic | Canonical source | Supporting documents |
| --- | --- | --- |
| Mandatory agent behavior | `AGENTS.md` | `HANDOFF.md` for current state; `skills/INDEX.md` for skill selection |
| Git branches, synchronization, commits, and releases | `skills/navrya-git-collaboration/SKILL.md` | `CONTRIBUTING.md` is the human quick reference |
| Server, DNS, GitHub secrets, Caddy, staging, and production | `DEPLOYMENT.md` | `skills/navrya-deployment/SKILL.md` is the agent operating procedure |
| Runtime, data, APIs, UI boundaries, and known constraints | `ARCHITECTURE.md` | `skills/navrya-architecture/SKILL.md` is the implementation summary |
| JavaScript conventions and validation | `skills/navrya-javascript-engineering/SKILL.md` | `package.json` and `tests/` are executable authority |
| AI and Voice implementation | `docs/ai/*.md` | `ARCHITECTURE.md` contains only the high-level map |
| Component appearance and interaction contracts | `public/pages/shared/navrya/components/**/*.prompt.md` | Each component document is intentionally independent |
| Static page preview notes | `public/pages/README.md` | Per-page README files contain only page-specific differences |
| Landing-site art direction and assets | `landing/docs/01_MASTER_BUILD_PROMPT.md` | `landing/docs/02_ASSET_PROMPT_PACK.md` |

Do not merge component prompt documents, AI design documents, landing prompts, or detailed
architecture sections merely because they share vocabulary. They describe separate contracts.
