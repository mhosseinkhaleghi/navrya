---
name: navrya-architecture
description: Plan and implement NAVRYA changes within its hybrid React, static dashboard, Express, PostgreSQL, AI, and local-first architecture. Use for feature design, architecture, data model, API, UI-runtime, AI, i18n, or integration work in this repository.
---

# NAVRYA Architecture

## Active runtime

NAVRYA is a hybrid application. The active outer shell is `index.html` plus `src/release.js`, which renders a full-page iframe. Character dashboards run as static HTML, CSS, and classic browser JavaScript inside that iframe. Do not assume `src/App.jsx` or `src/main.jsx` is the production entry.

`navrya-src/` contains React source for the generated NAVRYA views. Run `npm run build:navrya` or `npm run build` to regenerate `public/pages/shared/navrya-*-sessions-app.js`. Never hand-edit generated bundles.

## System boundaries

- Browser features: `public/pages/shared/`, normally strict-mode IIFEs that expose one `window.TradeJournal...` API.
- Server APIs: `server/pattern-ai-server.mjs` for AI and `server/community-api-server.mjs` for Express Community, identity, sync, and admin APIs.
- Persistence: PostgreSQL is server-canonical for migrated domains. Browser `localStorage` remains a write-through offline cache with `TradeJournalSyncQueue`; IndexedDB holds blobs.
- Tests: `server/community/app.mjs` accepts an injected repository, so tests use the memory repository and require no live PostgreSQL instance.

## Safe design rules

- Reuse an existing store, public adapter, event, and API boundary. Do not introduce parallel state or duplicate persistence paths.
- Preserve all four character pages and their script order. A shared script or CSS addition usually belongs in all four entry pages.
- Keep character identity in theme tokens. Use logical CSS properties and implement all four language dictionaries: `fa`, `ar`, `en`, and `es`.
- Keep AI credentials server-side. AI output must be validated and must not replace deterministic safety or confirmation rules.
- Before changing a visible NAVRYA component, read its matching `public/pages/shared/navrya/components/**/*.prompt.md` design contract.

## Read detailed references on demand

- `ARCHITECTURE.md` for the system map, data shapes, public APIs, feature inventory, and known constraints.
- `docs/ai/*.md` for AI, Copilot, deterministic extraction, context, knowledge, and Voice boundaries.
- `public/pages/{hunter,engineer,commander,sage,select}/README.md` for page intent.
- The actual source and focused tests are authoritative when historic prose differs from implementation.
