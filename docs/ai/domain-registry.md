# Knowledge Domain Registry — LAYER A (Journey D)

`public/pages/shared/ai-knowledge-registry.js` → `window.TradeJournalAIKnowledgeRegistry`

NAVRYA's own, application-owned record of what NAVRYA **is** — pages, entities, capabilities,
terminology, relationships. This is LAYER A of the three-layer knowledge model (see
`knowledge-base.md`): shared across every user, describes the product itself, and is never a
substitute for LAYER B (one user's own real Strategies/Patterns/Sessions/Trades) or LAYER C (live
runtime state).

## Where this data came from

Every domain below was built by reading the real, current repository — `navrya-src/*.jsx`,
`public/pages/shared/*.types.js`, real route/registration call sites — turn by turn, **not** from
`ARCHITECTURE.md` or any other doc that could itself be stale. Each domain's own `verifiedAgainst`
field records exactly which real files were read to write it. Where the real UI has a documented
gap, that gap is recorded in the domain's own `notes` field rather than silently omitted or
silently presented as if it were live — the whole point of this registry is that the AI never
hallucinates a capability NAVRYA doesn't actually have.

## API

```js
TradeJournalAIKnowledgeRegistry.registerKnowledgeDomain(config)
// config: {id, title, description, routes[], entities[], workflows[], capabilities[], terms[],
// relationships[], relatedDomains[], notes?, verifiedAgainst[]}. Every array defaults to [].
// Rejects (returns null) a missing id or a duplicate id - never silently overwrites one.

TradeJournalAIKnowledgeRegistry.getDomain(id)      // -> the full entry, or null (never a guess)
TradeJournalAIKnowledgeRegistry.listDomains()      // -> every registered domain, registration order

TradeJournalAIKnowledgeRegistry.actionsKnowledge()
// Generated LIVE from the real Action Registry (window.TradeJournalAIActionRegistry.catalogFor({})),
// never hand-duplicated - "generate from the canonical source" (see build script below for why
// this one part is NOT baked into the generated JSON artifact).

TradeJournalAIKnowledgeRegistry.search(query, options?)
// Deterministic lexical search, no embeddings - see "Search design" below. options.limit
// defaults to 5.
```

## The 12 real, registered domains

| id | title | real gap honestly documented? |
|---|---|---|
| `dashboard` | Dashboard | three catalog panel types are unwired placeholders, excluded from the default board |
| `sessions` | Trading Sessions | — |
| `trade-planning` | Trade Planning & Open Positions | no standalone "Open Positions" page — deliberately cross-cutting (Dashboard panel + Session tab + Strategies Hub Positions view) |
| `strategies` | Strategies | — |
| `patterns` | Patterns (Pattern Registry) | — |
| `reports` | Reports / All Trades / Trading Calendar | **legacy, unreachable from any current navigation** — "Trading Calendar" has no live React equivalent at all today |
| `psychology` | Psychology / Mental Health Profile | distinct from "Therapist Mode" (a ChatDock mode, not this page) |
| `ai-assistant` | AI Assistant & AI Settings | API key values are never exposed back once saved, only a masked status |
| `community` | Community | Marketplace purchases are real records but the payment step is an explicit, disclosed mock (`MarketplacePurchase.mock: true`) |
| `account` | Account / Profile / Subscriptions | KYC is entirely manual/admin-only, no real identity-verification provider |
| `settings` | Settings | trading defaults are pre-fill values only — nothing hard-enforces them as a ceiling |
| `character` | Character System / XP / Levels / Achievements | — |

Every `relatedDomains` reference is verified (test) to point at a real, registered domain id — no
dangling cross-reference.

## Search design

Deterministic, lexical, exact-token matching against each domain's own **curated vocabulary only**
— `title` + `terms` + `entities`. `description` is deliberately excluded from the search haystack:
it is free-text prose written for a human reader, so it inevitably contains generic connective
words and passing cross-references to other domains (e.g. Dashboard's own description mentions "a
psychology snapshot" panel in passing). Found via real testing: a query like *"what does navrya
know about my psychology"* wrongly pulled in Dashboard/Community/Character purely because "about",
"psychology", and the product's own name "NAVRYA" happened to appear somewhere in their prose.
Restricting the haystack to curated `title`/`terms`/`entities` fixed this at the root, without
resorting to an ever-growing stopword list chasing individual false positives.

A short EN/FA stopword list (`a`,`an`,`the`,`is`,`in`,`i`,`my`,`what`, …) is filtered out of the
**query's** own tokens (never a domain's own terms) — e.g. `"i"` would otherwise substring-match
`"check-in"`.

## `navigate.to` — Knowledge → Planner → a registered Action

`navrya-src/character-app.jsx` registers a third real action (alongside `session.create` and
`trade.calculator`): `navigate.to`, `requiredFields: ['domainId']`. It reuses the exact same real
navigation primitives the sidebar itself already uses — `store.setActiveId()` for the three React
canvas views (dashboard/strategies/settings) plus sessions, `location.hash` for the hash-routed
pages — never arbitrary DOM mutation, and never a second navigation mechanism.

`domainId` is intentionally restricted to exactly the domains that have **one real, navigable
page** today: `dashboard`, `sessions`, `strategies`, `patterns` (lands on the same Strategies Hub
page — its own tab isn't separately hash-addressable), `settings`, `psychology`, `ai-assistant`,
`community`, `account`. `reports` (legacy/unreachable), `trade-planning` (no single page — genuinely
cross-cutting) and `character` (switching character happens from Settings, not a page of its own)
are deliberately excluded, matching those domains' own honestly-documented gaps rather than
inventing a target for them.

`navigate.to` reuses the untouched, protected Workflow Engine exactly like every other action,
including its ~3s submit-grace window — a small, honestly-disclosed pause before the app actually
navigates, not a special case carved out of that engine. It registers the thinnest possible real
`TradeJournalAIProcessRegistry` process purely so the engine's own liveness check has something
real to read (`isOpen()` tied to the workflow's own lifetime, never permanently open — a
permanently-open registration would silently disable Journey A/B's own action discovery for the
rest of the session; this exact failure mode was found and fixed during Journey D's own real
browser regression pass, see `knowledge-base.md`).

**Known limitation, found via real browser testing:** while a user is genuinely on the
Dashboard/Strategies/Settings canvas page itself, that page's own inline AI-fillable section (e.g.
Settings' `TradingDefaultsSection`) is a real, legitimately open process for as long as it's
mounted — exactly like any other open form, this correctly blocks discovery of a *brand-new* action
via chat, `navigate.to` included, matching the same rule Journey A/B's own action discovery already
relies on (`tests/chat-dock-core.test.mjs`'s own "any other open process… still blocks discovery"
case). `navigate.to` works correctly from Sessions or any hash-routed page, where no such competing
registration exists — verified in the real browser both ways.

## Generated build artifact (`npm run ai:knowledge:build` / `ai:knowledge:check`)

`scripts/ai-knowledge-build.mjs` snapshots the real, live registry (loaded via the same
`vm.runInNewContext` technique the test suite already uses — never a hand-duplicated copy) into a
versioned, content-hashed JSON file at `public/pages/shared/ai-knowledge/domains.generated.json`.

**This artifact is not read by the running app.** Every character page still loads the real, live
`ai-knowledge-registry.js` directly — that stays the one runtime source of truth. Reading this JSON
back into the browser instead would recreate exactly the "two sources of truth" risk the whole
Knowledge Base design otherwise avoids. It exists for three narrower, real purposes:

1. `npm run ai:knowledge:check` — a CI-style staleness gate (non-zero exit if the committed
   artifact's content hash no longer matches a fresh build).
2. A stable, versioned, diffable snapshot for code review.
3. Honestly satisfying the spec's own "build commands producing versioned/hashed generated JSON
   artifacts" requirement, rather than a symbolic stand-in.

`actionsKnowledge()` (the live Action Registry catalog) is deliberately **not** included in the
generated artifact — there is no browser/React mount in this Node build context to read a real
Action Registry from, and baking a stand-in catalog into a committed file risks it going stale
silently. Real per-turn `availableActions` always come from the live registry at request time.
