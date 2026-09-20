# Vibe Coding Panel Studio

The real, current contract behind the AI Assistant's Panel Builder tab: how a natural-language
request becomes a real, streamed AI code generation, how the result is sandboxed and previewed,
how it becomes durable revision history, and how a revision is explicitly applied to a trader's
dashboard. `ARCHITECTURE.md` §7.14 links here for the detailed contract; this document is the
canonical source for it.

## Canonical path

```
PanelBuilderTab (navrya-src/aiAssistantView.jsx)
  -> POST /api/ai/panel-builder/generate, SSE (server/pattern-ai-server.mjs's panelBuilderGenerate())
       provider dispatch: callOpenAIStreaming() / callAnthropicStreaming()
       validation: navrya-src/dashboardPanelBuilder.js's parseGeneration()
  -> POST /internal/panel-artifacts/revisions (server/community/routes.internal.mjs, secret-gated)
  -> repo.panelStudioArtifacts.createRevision() (server/db/panel-studio-repo.{pg,memory}.mjs)
-- separately, ordinary session-cookie CRUD --
GET/POST /api/sync/panel-studio/artifacts/... (server/community/routes.panel-studio.mjs)
-- applying to the dashboard --
dashboardView.addArtifactPanel() -> loadBoard/saveBoard's existing `custom` map
  -> ArtifactPanelSlot renders via navrya-src/dashboardPanelSandbox.jsx's SandboxedDashboardPanel
```

## Coding-engine identity (`navrya-src/codingEngine.js`)

"Codex" and "Claude Code" are UX coding-profile identities layered on top of the real, existing
OpenAI/Anthropic calls this repo already makes. They are **never** a real external coding-agent
process, **never** an invented model id, and the UI/SSE protocol always carry the real underlying
`provider`/`model` alongside the profile label (e.g. "Codex · OpenAI · GPT-5.6 Luna").

```js
openai    -> { id: 'codex',       label: 'Codex' }
anthropic -> { id: 'claude-code', label: 'Claude Code' }
anything else -> null   // fails closed - never a guessed/default mapping
```

`resolveCodingEngine()` is imported both by the Studio UI (optimistic client-side chip) and by
`server/pattern-ai-server.mjs` (the authoritative SSE `engine` event and the 400-reject gate for
an unsupported `provider`) - one deterministic source, so the two can never disagree.

## Target manifest (`navrya-src/panelStudioTargets.js`)

The one place that decides which application surfaces AI-generated code is allowed to touch. V1
enables exactly one entry, `dashboard.panel`. A future target (`session.panel`, `report.widget`, a
reviewed UI-change proposal) requires a real, already-implemented `promptBuilderModule`,
`sandboxModule`, `bridgeMethods` list, and `applyAdapter` before it can be added here with
`enabled: true` - never a boolean flip alone. Migration `076_panel_studio_artifacts.sql`'s own
`CHECK (target IN ('dashboard.panel'))` is the matching server-side, defense-in-depth backstop.

## Generation prompt and sandbox contract (`dashboard.panel`)

`navrya-src/dashboardPanelBuilder.js` builds the real instruction sent to the provider
(`buildGenerationPrompt()`), server-side, from the trader's short raw request text - untrusted
data wrapped by, and never able to override, this module's own system policy. The contract:

- Output **one** self-contained HTML fragment into `#navrya-panel-root` - no markdown fences, no
  prose, no `<html>`/`<head>`/`<body>` wrapper.
- Plain DOM/CSS/JS only - no framework, library, CDN, or network reference of any kind.
- The only data source is the read-only `navrya` bridge (version 1):
  `getTradeSummary()`, `getOpenPositions()`, `getPatternStats()`, `getPsychologyMirror()`,
  `onUpdate(fn)`. No write/mutate method exists in the protocol.
- No price/candle data, no news feed, no access to any other site or service.
- Theme via the 8 forwarded CSS custom properties (`--char-accent`, `--text-primary`, etc.).
- User-visible text in the trader's own language (fa/ar/en/es).
- Source capped at 12 KB (`MAX_SOURCE_BYTES`); the model is told this exact budget.
- **Honesty rule:** a request needing data this sandbox does not have (live prices, account
  balances, wallet data, another trader's identity) must be refused with exactly
  `NAVRYA_UNAVAILABLE: <one short sentence>` - never a fabricated/mocked value.
- A revision request includes the previous source and asks for the complete updated fragment, not
  a diff.

`parseGeneration()` (also imported server-side - the authoritative persist-gate) strips one
wrapping code fence, checks the unavailable marker first, and refuses a reply with no HTML markup
at all as prose rather than injecting it into the sandbox.

## Sandbox security model (`navrya-src/dashboardPanelSandbox.jsx`)

An **independent** module from `navrya-src/analysisWorkspacePanelRuntime.jsx` (the pre-existing
Analysis Workspace panel sandbox) - deliberately not refactored to share file-level source with
it, because that file's own security test (`tests/analysis-workspace-panel.test.mjs`) asserts
exact literal substrings of its own source text, so any extraction would break those assertions
without making either sandbox more secure. The two are architecturally identical, independently
audited (`tests/dashboard-panel-studio-sandbox.test.mjs` mirrors the same assertions against this
new file):

1. `<iframe sandbox="allow-scripts">` - **never** `allow-same-origin`. Opaque origin: no access to
   the host document, DOM, cookies, localStorage, or auth token. Generated code is never evaluated
   in the app's own realm - no `eval()`/`new Function()`/`dangerouslySetInnerHTML` anywhere.
2. Strict CSP baked into the iframe document: `default-src 'none'; img-src data:; style-src
   'unsafe-inline'; script-src 'unsafe-inline'; font-src data:;` - no `connect-src`, so fetch/XHR/
   WebSocket/beacon/remote script/CDN/external image or font are all blocked by construction.
3. postMessage bridge, read-only by construction: the parent answers exactly
   `BRIDGE_METHODS = ['tradeSummary','openPositions','patternStats','psychologyMirror']` and
   nothing else - there is no write/mutate method in the protocol at all.
4. Identity check via `event.source === frame.contentWindow`, never an origin string (a sandboxed
   opaque-origin frame always reports `event.origin === "null"`).

`buildDashboardBridgeSnapshot(character)` is the read-only data contract - aggregate,
already-visibly-rendered trading-activity facts only, sourced from the same global stores the
existing Dashboard catalog panels already read synchronously
(`window.TradeJournalTradeStore`/`TradeJournalPatternStore`/`TradeJournalPsychologyStore`). It
never includes user identity/email, API keys, sessions/tokens, wallet balances, or raw
images/blobs. **Known limitation:** XP/level fields (`TradeJournalAccountProfileStore`) are
intentionally omitted from v1 pending confirmation that store's API is genuinely synchronous.

## SSE generation protocol (`POST /api/ai/panel-builder/generate`)

The only streaming route in this gateway - every other route here does one `await fetch()` then
one JSON write. Not `EventSource` (this is a POST with a JSON body) - the client uses `fetch()` +
a manual `response.body.getReader()` SSE-frame parser, with an `AbortController` wired to Cancel.

| Event | Payload | When |
|---|---|---|
| `started` | `{requestId}` | after entitlement/quota/wallet gates and body validation pass |
| `engine` | `{codingEngineId, codingEngineLabel, provider, model}` | immediately after, before the first provider byte |
| `delta` | `{text}` | once per real upstream chunk, incremental, never batched or faked |
| `validating` | `{}` | once the upstream stream itself completes, before parse/size checks |
| `complete` | `{artifact, revision}` | only after validation **and** persistence both succeed |
| `error` | `{code, message}` | `PROVIDER_ERROR`, `GENERATION_UNAVAILABLE`, `GENERATION_EMPTY`, `GENERATION_TOO_LARGE`, `PERSIST_FAILED`; terminal, always followed by `response.end()` |

**No partial or cancelled source is ever persisted** - this is structural, not a check-then-hope:
the internal persistence bridge call (`POST /internal/panel-artifacts/revisions`) is reachable
only after `parseGeneration()`/size checks both succeed inside the handler, and a genuine client
disconnect (the dispatcher's existing `clientDisconnectController`, the same one used by
`/api/mental-health/chat` and `/api/ai/chat`) aborts the upstream provider fetch and causes the
handler to rethrow before `validating`/persistence are ever reached
(`tests/ai-panel-builder-sse.test.mjs` proves this against a real abort mid-stream).

## Entitlement and billing

`aiPanelBuilder` is an existing plan feature flag (`server/commercial/commercial-defaults.mjs`'s
`PLAN_DEFAULTS`: `false` for free/plus/pro, `true` for personalized) - the same flag the Analysis
Workspace's own panel builder already reads client-side. The client-side check
(`aiAssistantView.jsx`'s `entitled` prop, fetched once from `/api/sync/subscriptions` +
`/api/sync/subscriptions/catalog`, the same two endpoints this screen already used for its
byok/premiumModels gates) is **UX only**. The authoritative, server-side gate lives in
`server/commercial/wallet-service.mjs`'s `reserveForAiCall()` - it now checks
`entitlements.features[feature]` for any `feature` name that is itself a real `features.*` key
(today, only `aiPanelBuilder`), before any provider call or pricing lookup. Billing feature name:
`'aiPanelBuilder'`, wired into `pattern-ai-server.mjs`'s `AI_BILLED_ROUTES` map exactly like every
other billed route.

## Artifact/revision lifecycle

Two tables (migration `076_panel_studio_artifacts.sql`): `panel_studio_artifacts` (one row per
panel, `status` draft/ready/applied/archived, `current_revision_id`, `applied_revision_id`) and
`panel_studio_revisions` (append-only, `revision_number`, `source`, `source_kind`
generated/manual-edit/restore, provider/model/coding-engine attribution). A revision is **never**
mutated in place.

- **`current_revision_id`** is whatever the Studio is showing/editing right now - advances on
  every generation, manual edit, or restore.
- **`applied_revision_id`** is set **only** by the explicit "Apply to dashboard" action. These two
  pointers are deliberately independent: iterating on an already-applied panel never silently
  changes what is live on the dashboard, and generation finishing never applies anything by
  itself.
- **Restore** is not a separate code path - it is `createRevision()` with
  `sourceKind: 'restore'` and `restoredFromRevisionId` set; the server loads that past revision's
  source itself (never trusting a client-resent copy) and writes it as a **brand-new** top
  revision.
- **Optimistic concurrency**: `createRevision()` accepts a `baseRevisionId` and, inside a row-locked
  transaction (`SELECT ... FOR UPDATE`), rejects with `409 REVISION_CONFLICT` if it does not match
  the artifact's real `current_revision_id` - this repo's existing pessimistic-lock-plus-
  precondition idiom (`conversationScenarios.publish()`/`rollback()`), not a client-side ETag
  mechanism.
- **Applying to the dashboard** is the one action that changes what a trader actually sees:
  `dashboardView.addArtifactPanel()` writes a small `{title, kind:'artifact', artifactId,
  revisionId}` entry into the same `custom` board map the legacy free-text panels already use
  (`resolveCustomEntry`/`panelBody` grew an additive `kind === 'artifact'` branch; the legacy
  `{title, desc}` shape is untouched and never auto-converted). Re-applying a newer revision of an
  already-on-board artifact reuses the same board slot id instead of duplicating the panel.

## Future targets

A future target (`session.panel`, `report.widget`, a reviewed application-wide UI-change proposal)
must, before it can be enabled:

1. Register a real `panelStudioTargets.js` entry (not merely flip `enabled`).
2. Provide its own narrow, read-only capability/data bridge - never generic app-state access.
3. Provide its own source/schema validator.
4. Provide its own preview strategy.
5. Provide a user-visible diff for any non-generation change.
6. Require an explicit confirmation gate before anything is applied.
7. Provide a reversible apply/rollback path.
8. Be server-side authorized and auditable, the same way `dashboard.panel` is today.

Future application-wide UI changes are proposal/review artifacts or allowlisted adapter
operations - never arbitrary generated-code access to the app runtime, repository source, APIs, or
user data.

## Known limitations (v1)

- The Diff tab is a whole-revision side-by-side comparison, not a real line/token diff algorithm.
- No pagination on an artifact's revision list.
- No hard-delete route - archive/unarchive only, so an applied dashboard slot can never be
  orphaned by deleting the artifact it points at.
- `buildDashboardBridgeSnapshot` omits XP/level fields pending confirmation of a synchronous read
  path.
- A streamed generation's `409 REVISION_CONFLICT` surfaces to the client only as a generic
  `PERSIST_FAILED` SSE error, not a distinct conflict message.
- The client sends only the trader's short raw request text, never a pre-built instruction - the
  server is the sole author of what actually reaches the provider.
- No admin moderation/visibility surface for generated panel source.
