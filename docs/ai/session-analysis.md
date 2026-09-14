# Adaptive AI Session Analysis

The real, current contract behind the Session workspace's "AI Analysis" feature - what gets sent
to a provider, what comes back, what gets persisted, and where every piece lives. Session-scoped
only ("نقشه تحلیل" Analysis Map/Session Fate are separate, adjacent features - see their own code,
not this file). `ARCHITECTURE.md` §7.5 links here for the detailed contract; this document is the
canonical source for it.

## Canonical path

```
SessionAiAnalysisModal (navrya-src/sessionAiAnalysisModal.jsx)
  -> TradeJournalSessionAnalysisClient.analyzeSession() (public/pages/shared/session-analysis-client.js)
  -> POST /api/sessions/analyze (server/pattern-ai-server.mjs's analyzeSession())
  -> LiveSessionView.applyAnalysisResult()/persist() (navrya-src/liveSessionView.jsx)
  -> TradeJournalWorkspace.save() -> existing session sync/repository persistence
```

One provider call per user-triggered analysis, always - `sessionAnalysisFormat` (the shared
structured-output JSON schema) covers everything (thesis, blocks, scenarios, scenario
evaluations, per-timeframe reads, note feedback, request/response, unresolved items, memory
update) in that single response. Nothing in this domain makes a second "summarize/evaluate" call.

`public/pages/shared/session-analysis-schema.js` is the pure, DOM-free normalization/memory/
fingerprint/patch logic (unit-tested directly in Node - `tests/session-analysis-schema.test.mjs`).
`session-analysis-client.js` is the one orchestration seam (context gathering, the network call,
cache lookup, deterministic persistence patches) - it never touches
`window.TradeJournalWorkspace` itself; the caller (`liveSessionView.jsx`) always applies patches
through the session's own existing `persist()`/`save()` path.

## Envelope (persisted on `entry.aiAnalysisResult` and `session.aiSessionAnalysisResult`)

`normalizeAnalysisResult()` always returns every field, defensively defaulted, version 2:
`thesis`, `stateMetrics`, `whatChanged`, `blocks` (model-chosen/ordered, `custom` type is the
escape hatch), `scenarios` (proposals), `deferredScenarios`, `scenarioEvaluations`,
`watchItems`, `unresolvedItems`, `unknowns` (legacy, read-only), `whatWouldChangeView`,
`confidence`, `memoryUpdate`, `requestResponse`, `noteFeedback`, `timeframeAnalyses`,
`timeframeSynthesis`, `requiredInputsFlagged`, plus the NAVRYA-owned envelope fields
(`analysisId`, `provider`, `model`, `fingerprint`, `usage`, `generatedAt`, `entryId`). A
provider/model is used exactly as returned by `callProvider()` - never the currently-selected
settings - so historical attribution survives a later provider-settings change.

## Session Memory (`session.aiSessionAnalysisResult.memory`, version 2)

Deterministic, pure compaction (`buildSessionMemory()`) of the model's own `memoryUpdate` plus
NAVRYA-owned live state - never a second model call. Carries `noteReceipts` (`{entryId, field,
revision}` only, never raw note text) and compact `unresolvedItems` (`{id, status, description,
whyItMatters, missingEvidence, action}`) forward between analyses. A v1 memory (predating this
contract) upgrades in place the next time an analysis runs - there is no separate migration step.

## Timeline note feedback

`gatherPendingNotes(session, memory)` collects `entry.note`/`entry.movementNote` text not already
reviewed (compared by `noteRevision()`, a deterministic djb2-style hash - an edited note gets a
new revision and becomes eligible again automatically). Sent as `body.pendingNoteRefs`
(`{entryId, field, revision, text}`), rendered in the prompt as untrusted DATA. The model returns
`noteFeedback` keyed to a `noteRef` copied exactly; `validateSessionAnalysisResult()` (server,
authoritative) and `computeAnalysisPatches()` (client, defense in depth, re-derives the trusted
ref list from `(session, previousMemory)` rather than trusting the caller) both drop any item
whose `noteRef` does not exactly match a ref that was actually sent - a hallucinated id can never
mark a real note "reviewed".

## "Your view and instruction"

The modal field (labelled this way in all four languages, not just "Your view") carries either a
market opinion or a scoped analytical request (e.g. "check liquidity zones"). Wired unchanged as
`body.userView`; the system prompt frames it as a bounded analytical focus that can never override
the contract, safety, or evidence rules. The model's `requestResponse`
(`{requested, analyzed, answer, limitation}`) is rendered in the card and hidden entirely when the
trader wrote nothing.

## Unresolved-item lifecycle

`unresolvedItems` (`{id, status, description, whyItMatters, missingEvidence, action,
resolutionEvidence}`, `status` in `open|partially_resolved|resolved|superseded`) replaces the old
string-only `unknowns` as the model-facing field. `gatherOpenUnresolvedItems(memory)` sends
previously-open items as context (`body.openUnresolvedItems`); the model is asked to return each
again with the SAME id and an updated status when it is still relevant. A legacy stored result
(predates this contract, has `unknowns` but no `unresolvedItems`) still renders and narrates
correctly - `resolveUnresolvedItems(result)` (exported from `sessionAnalysisCard.jsx`, reused by
`character-app.jsx`'s voice narration) degrades a plain string into a minimal open item.

## Scenario probability updates (normal analyses, not just "Evaluate with AI")

A normal `initial`/`update` analysis now evaluates every eligible active scenario supplied as
`body.activeScenarios` in the SAME response - the old UPDATE-time prohibition is gone. Both this
path and the explicit, focused "Evaluate with AI" action (`scenarioTargets`) apply the identical
deterministic patch, `applyScenarioEvaluationPatch()` (session-analysis-schema.js):

- Always appends to `probabilityHistory`, never overwrites it.
- `status==='invalidated'` or `invalidationOccurred` deterministically forces the persisted
  probability to exactly 0 and status to `invalidated`, regardless of what numeric value the
  model itself returned - enforced identically server-side (`serverCalibrateActiveProbability`/
  `validateSessionAnalysisResult`) and client-side.
- A still-viable value is calibrated (`calibratedActiveProbability` - floored at 10, never a
  meaningless single-digit %) but never rounded off a legitimate precise model estimate; the
  system prompt separately asks the model to prefer a multiples-of-5 scale.
- Appends a full audit entry to `scenario.evaluationHistory` (`previousProbability`,
  `newProbability`, `delta`, status, confirmed/contradictory/unresolved evidence, rationale,
  `sourceEntryId`, `analysisId`, `provider`, `model`, `evaluatedAt`) and refreshes
  `scenario.lastEvaluation` with the same fields.

`MAX_SCENARIOS_PER_ANALYSIS` (12, `session-analysis-client.js`) bounds what one call evaluates;
anything eligible beyond that is `deferredScenarios` (id/title only), disclosed explicitly in the
card and narration, never silently dropped. A cache hit never re-applies scenario patches -
`liveSessionView.jsx`'s `applyAnalysisResult(entry, result, meta)` skips `scenarioPatches`
entirely when `meta.cached` is true.

`isScenarioActiveState()` (schema.js, delegated to by the client's `isScenarioActive()`) is the
one active/invalidation predicate this whole domain uses: not occurred, no `invalidationTagIds`,
`status !== 'invalidated'`, latest logged probability `> 0`. Fixes the pre-existing
`confirmedInvalidationTagIds` typo (the real field is `invalidationTagIds` - `confirmedInvalidationTagIds`
is a genuinely different, unrelated field owned by the manual invalidation-tag-confirmation UI in
`session-card-updates.js`/`sessionEntryCardsView.jsx`, not touched by this domain).

## Multi-timeframe

`entry.images` is the canonical ordered array (`{id, mediaAssetId?, imageBlobId?, imageUrl?,
timeframe, detectedTimeframe}`, up to 4), additive alongside every entry's existing single-image
fields. `canonicalEntryImages()`/`entryImagesIdentity()`/`resolveEntryImagesForTransport()`
(session-analysis-client.js) normalize a legacy entry (no `images[]`) into a one-item array at
read/transport time - nothing forces a migration. Server-side, `body.images` accepts either the
legacy plain-string array or the labelled `{id, timeframe, dataUrl}` shape
(`normalizeSessionImages()`); each image is preceded by an `input_text` label
("Image <id> — timeframe <tf>:") before its own image content block
(`labelledImageContent()`), so the model can honestly key `timeframeAnalyses` to a real
supplied id - `validateSessionAnalysisResult()` drops any `timeframeAnalyses` entry referencing
an id that was not actually sent.

**UI**: `MultiTimeframeSlots` (`liveSessionView.jsx`) is the one reusable up-to-4-slot picker,
each slot backed by the existing `MediaPicker` (`intent="chartEntry"`, so a freshly uploaded slot
image runs through the real Media Drive upload + chart-detection call automatically - never a
second upload/detection path). Reused by both `ChartEntryModal`'s own "Multi-timeframe" toggle
(off by default; the toggle itself is only offered for a plain manual "Add chart" open, not one
already pinned to a captured Media Asset) and `MultiImageAttachModal` (post-creation "Add images"
action on an existing entry, exposed identically for a chart OR a movement entry via
`EntryDetailPanel`'s own header button - this is how a movement entry, which is created instantly
with no modal, gets real multi-timeframe support). `attachMultipleImages()`/`submitChartEntry()`
persist the canonical array and additionally mirror the FIRST image onto the entry's own legacy
single-image fields, so a reader that only ever looks at `entry.imageUrl` still sees a real chart.

**Persistence**: `061_session_entry_images.sql` adds `trading_session_entry_images` (additive,
never touches `trading_session_entries`). `repo.pg.mjs`/`repo.memory.mjs` both delete-then-
reinsert an entry's images on every session upsert, mirroring the existing entries/scenarios/
activity-log child-table convention exactly. Round-trip covered against the memory repo through
the real HTTP API (`tests/trading-sessions-api-contract.test.mjs`) - the real Postgres INSERT/
SELECT path is structurally correct but, like every other domain in this codebase, has not been
exercised against a live Postgres instance in this sandbox.

## Style-specific indicator preflight

`analysisContext.requiredInputs` (`analysis-context.js`'s `getAnalysisContext()`) is the union of
the selected style(s)' AND focus(es)' own registry-declared `requiredInputs` - read generically,
never a hand-maintained per-style list. The modal renders one non-blocking warning line per
declared input beyond the trivial default `chart_image` (`REQUIRED_INPUT_INFO` in
`sessionAiAnalysisModal.jsx`), and the same union is echoed into the prompt
(`analysisProfile.requiredInputs`) so the model is told to honestly report unavailable evidence
rather than invent an indicator reading. `visible_indicator_overlay` was added to the eight
`indicator_mathematical`-category styles (Ichimoku, moving averages, momentum, oscillator, RSI,
MACD, Bollinger/volatility bands) in `analysis-style-registry.js` - additive, the registry's own
data drives the warning, not a special-cased consumer check.

## Fingerprint / cache (`buildAnalysisFingerprint()`)

Changes when any of: session/entry id, image identity (single or the ordered multi-image
identity+timeframe list), provider, model, analysis type, profile id/version, memory version,
depth, scenario targets, the user's own instruction text, any pending note revision, active
scenario state (`id:status:probability` per eligible scenario), or the open-unresolved-item
revision. A cache hit resolves with zero network calls and is always display-only (see scenario
patches above). A caller that only ever knew the pre-upgrade fields (plain single image, no
notes/scenarios/unresolved items) computes the exact same fingerprint string as before this
upgrade - verified directly in `tests/session-analysis-schema.test.mjs`.

## Provider/model attribution

`ProviderAttribution` (`sessionAnalysisCard.jsx`) renders `ModelGlyph` + the real provider/model
label from `window.TradeJournalAISettingsStore.providerCatalog()`, keyed off `result.provider`/
`result.model` (the SAVED analysis result) - never the currently-selected settings, so changing
provider later never rewrites history. Reuses the one existing catalog/glyph system; no second
logo registry.
