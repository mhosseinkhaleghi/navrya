# Admin Panel — pending backend work

Checked every UI surface in `public/pages/admin/app.js` against `server/admin/routes.mjs` /
`server/community/routes.users.mjs`. As of this pass, **every tab is wired to a real endpoint —
there is nothing mocked and nothing to build here.**

| Tab | Endpoint(s) | Status |
|---|---|---|
| Users | `GET /api/admin/users`, `GET/PATCH /api/admin/users/:id`, `GET /api/users/me` (topbar label) | Real |
| AI | `GET/POST /api/admin/ai/keys`, `GET/POST /api/admin/ai/pricing`, `GET /api/admin/ai/usage` | Real |
| Technical | `GET /api/admin/technical` | Real |
| Marketplace | `GET /api/admin/marketplace/listings`, `PATCH /api/admin/marketplace/listings/:id` | Real |
| Financial | `GET /api/admin/finance/overview` | Real |
| XP & Segmentation | *(none — intentional)* | **Deliberate placeholder, not a gap.** Per `ARCHITECTURE.md` §7.16, this tab renders a static "coming in the next phase" empty state and issues zero fetch calls, by design. Do not add an endpoint or mock data for it without an explicit instruction — that instruction should come with an actual spec for what XP/segmentation means in this app (there is no XP calculation, persistence, or scoring model anywhere in the codebase today; see §10 "XP/progression"). |

## How to use this file going forward

If a future UI addition needs a route that doesn't exist yet, follow this project's established
pattern instead of inventing a new one:
1. Build the UI against the exact request/response shape the real route will eventually have.
2. Wire a `// TODO(backend): <method> <path> — <one-line description>` comment directly above the
   `fetch`/`api(...)` call, and have that same function return a clearly-labeled mock value in the
   meantime (a small `⚠ mock` badge in the UI, matching the project's "insufficient data over
   fabricated numbers" standard — see `ARCHITECTURE.md` §7.15/§7.16 for existing examples of this
   pattern, e.g. the Financial tab's `NO_PRICING_SET`/`NO_BUDGET_SET` states).
3. Add a row to a table in this file: path, method, request body/query, response shape, and which
   table/migration it needs (reuse `sessions`/`usageEvents`/`providerPricing`/`adminKeys`/
   `auditLog` where possible — see `server/db/repo.memory.mjs`/`repo.pg.mjs` for the existing
   method surface before proposing a new one).
4. Stop there. New server-side routes are not built without an explicit go-ahead — this file is
   the handoff artifact for that next instruction, not an invitation to build ahead of it.

Nothing currently qualifies for that table.
