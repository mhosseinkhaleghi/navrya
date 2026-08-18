# Context Package Builder (Journey D)

`public/pages/shared/ai-context-builder.js` → `window.TradeJournalAIContextBuilder`

Assembles the **smallest context sufficient for one turn** from the three knowledge layers (see
`knowledge-base.md`), via deterministic narrowing — never "send everything every turn."

## API

```js
TradeJournalAIContextBuilder.build({
  message,               // this turn's literal user text
  currentContext,        // an ai-context-engine.js snapshot() - {navigation, activeEntities, workflow}
  activeStrategyId?,      // optional override - resolved from real, live UI state by default (see below)
  activePatternId?,
  activeTradeId?
})
// -> { intentContext, liveContext, productKnowledge, userMemory, availableActions, proactiveContext }

TradeJournalAIContextBuilder.debugLastPackage()
// Dev-only diagnostic - sanitized metadata about the LAST build() call, never raw content.
// -> null before build() has ever run, else:
// { domains, knowledgeEntries, userMemorySources, liveContextSources, actions,
//   approxChars, approxTokens }
```

## The narrowing pipeline

1. **Current UI domain always seeds the set** — `navigation.activeId` (the three React canvas
   views + sessions) and `window.location.hash` (the hash-routed pages: psychology/ai-assistant/
   community/account) both map to real domain ids. This runs **before** any lexical search, and a
   search result never *replaces* it — only adds to it.
2. **`ai-knowledge-registry.js`'s own deterministic `search(message)`** adds any domain the
   message's own wording clearly references (e.g. a cross-domain question mentioning "Patterns" on
   the Dashboard).
3. **LAYER B (`ai-user-memory.js`) is only ever pulled for a domain actually selected above**, and
   only ever the one active entity relevant to it — never a bulk dump. Psychology is the one
   deliberate cross-cutting exception: included for `trade-planning` too (never `community`/
   `account`/`settings`, regardless of message wording), since that is exactly the real evidence
   `ai-proactive-engine.js`'s own risk-escalation/stress rules need.
4. **LAYER C (live state)** is read fresh from `window.location.hash` plus the caller's own
   `currentContext` (itself an `ai-context-engine.js` `snapshot()`) — never cached here.

## Why `window.location.hash` is read directly here

`ai-context-engine.js`'s own `navigation.activeId` can only ever express the three React "canvas"
views (`dashboard`/`strategies`/`settings`) plus `sessions` — psychology/ai-assistant/community/
account are `location.hash` routes instead (a real, current split in how this app is built, not a
design choice made in Journey D). Reading `window.location.hash` directly — a live global, read
fresh on every `build()` call, never cached — is additive context this module gathers on its own;
it does **not** require, and must never require, a change to the protected `ai-context-engine.js`
itself.

## Wired into the real chat turn (`chat-dock-core.js`)

```js
var built = TradeJournalAIContextBuilder.build({ message: text, currentContext: contextEngine.snapshot() });
requestBody.productContext = shapeProductContextForWire(built); // trims to the wire-worthy fields
```

`shapeProductContextForWire()` drops internal bookkeeping (`routes`, `entities`, `terms`,
`relatedDomains`, `verifiedAgainst`) and anything already sent separately (`availableActions`,
`proactiveContext` — both client-only concerns, sending them again would be redundant, not
additive), keeping only `{id, title, description, workflows, capabilities, relationships, notes}`
per domain plus `userMemory`/`liveContext`. Best-effort and purely additive end to end: a `build()`
throw, or the module simply not being loaded on a page, falls back to exactly pre-Journey-D
behavior — verified by test (`tests/chat-dock-core.test.mjs`).

Server-side, `server/pattern-ai-server.mjs`'s `buildProductContextText()` renders it into one
clearly delimited reference block — see `knowledge-base.md`'s own prompt-injection-boundary
section for the exact SYSTEM POLICY / PRODUCT KNOWLEDGE / LIVE STATE / USER DATA / USER MESSAGE
separation.

## Token-budget observability

`debugLastPackage().approxTokens` is a deliberately crude proxy (`chars / 4`, the same rule of
thumb OpenAI's own docs use for a rough English-text estimate) — not a real tokenizer, and
documented as such rather than implying more precision than this actually has. Its real job is
catching an accidental regression back toward "send everything every turn": a narrowly-scoped
single-domain question measured well under 1,500 estimated tokens in both unit tests and real
browser runs; a broad cross-domain question still measured in the low thousands, never the whole
registry's full content. See `tests/ai-context-builder.test.mjs`'s own token-budget tests.

## `activeStrategyId`/`activePatternId`/`activeTradeId` — resolved from real, live UI state

Closed in the Journey A–D stabilization checkpoint. The Context Engine (Journey A/B/C, protected,
untouched) still has no concept of "which Strategy/Pattern/Trade detail view is currently open" —
this module resolves it independently, the same way it already resolves `window.location.hash`,
never by changing the protected Context Engine.

`resolveActiveIdByPrefix(prefix)` mirrors `ai-context-engine.js`'s own `activeScenarioId()`
exactly: a real detail view registers itself with `TradeJournalAIProcessRegistry` purely so this
module can read it back —

- `navrya-src/tradeDetailsModal.jsx` now registers `'trade-details-' + trade.id` (a new, additive
  registration — this view previously registered nothing at all, since it has no fillable field of
  its own; `edit`/`close position` already delegate to their own separately registered flows).
- `navrya-src/strategiesHubView.jsx`'s `StrategyDetailsTab`/`PatternDetailsTab` already registered
  `'strategy-editor-' + id` / `'pattern-editor-' + id` (Journey A/B era) — this checkpoint is the
  first thing to actually *read* those ids back for context, not just for field-filling.

`TradeJournalAIProcessRegistry.openIdsWithPrefix(prefix)` (a small, additive registry method,
most-recently-touched match first) answers "is a detail view matching this prefix genuinely open
right now" independently of `activeOpenProcess()`'s own single "most recently touched overall" pick
— necessary because the relevant detail view might not be the single most-recently-touched process
system-wide.

`build()` resolves all three ids this way by default; an explicit `opts.activeXxxId` still wins
when a caller already has certainty (kept for forward-compatibility and tests). Verified: "this
trade"/"this strategy"/"that pattern" resolve correctly when the matching real detail view is open,
resolve to `null`/empty memory when nothing is (never a guessed/first-in-list default), and follow
a genuinely re-opened *different* entity rather than a stale id
(`tests/ai-context-builder.test.mjs`). The model's own natural-language understanding still does
all of the actual pronoun interpretation ("this"/"that" → "the one currently in view") — NAVRYA's
only job is supplying the real, live answer to "which one is that," exactly the same
interpret-vs-decide split the rest of this architecture already follows.
