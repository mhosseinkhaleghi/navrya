# Destructive Action Safety (Journey F, F37)

The confirmation and target-resolution architecture behind every irreversible chat action, and the
four real bugs this session's own real-browser verification found and fixed - each one a case
where the *mechanism* was already correct in principle but a specific closure/registration detail
silently defeated it. Read alongside `action-coverage-matrix.md` (which action targets which real
process) and `action-testing.md` (how each of these was actually verified).

## The core principle

> MODEL interprets intent → NAVRYA resolves the exact target → the real delete/confirmation UI
> opens → deterministic confirmation state → user explicitly confirms → the existing deletion
> mechanism executes.

Never: `AI → store.delete(id)` directly behind the UI. Every one of the six destructive actions
below (`pattern.delete`, `strategy.delete`, `session.delete`, `scenario.delete`, `entry.delete`,
`trade.delete`) calls the exact same store/workspace `remove()` method the human-facing,
`window.confirm()`-gated delete button already reaches - never a second, reimplemented delete path.
This means real, pre-existing cascade behavior (`StrategyEducationStore.remove()`'s own
`orphanLinkedTrades()`, `PatternStore.remove()`'s screenshot cleanup) is preserved automatically,
and never invented or extended from chat.

## No destructive operation without an exact resolved entity

Every destructive action resolves its target one of two ways, never a third:

1. **The one currently active/open** - `resolveActivePatternId(context)` /
   `resolveActiveStrategyId(context)` / `resolveActiveTrade(context)` /
   `context.activeEntities.{sessionId,scenarioId,entryId}` (`ai-context-engine.js`'s `snapshot()`).
2. **By exact, case-insensitive name match** (`patternName`/`strategyName`, resolution-only fields,
   never themselves written) - zero or more than one match resolves nothing at all; the model is
   told to ask which one, never to guess (F53).

If neither resolves, `open()` returns `null` and no workflow starts.

## Explicit confirmation is structured Workflow state, not model prose

Every destructive action declares a boolean gate field (`confirm` or `confirmDelete`) in
`requiredFields`. `open()` never mutates anything - only `submit()`, gated on
`known.confirm === true || known.confirm === 'true'` (a strict check, not truthiness), calls the
real delete. A reply like "Looks good." cannot confirm deletion: it extracts nothing onto the gate
field, so `missing` still contains it and the workflow just sits, unresolved, waiting for an actual
yes/no.

**Bug found and fixed this session - an explicit `false` was silently treated as "known":**
`ai-workflow-engine.js`'s `missingFields()` only checks for `undefined`/`null`/`''`, not falsy-ness
- a model turn that explicitly extracts `{confirm: false}` (rather than omitting the field) was
incorrectly read as "resolved," letting the workflow auto-schedule-submit and self-clear with
nothing actually confirmed. A later genuine "Yes." then fell through to fresh re-discovery and could
resolve against whatever was *currently* active - not necessarily the original target. Fixed with
`normalizeGateField(fieldName)`, wired into all six destructive actions (and the six pre-existing
F26-32 external-effect actions sharing the same gate-field shape): returns `null` (never applied,
i.e. "still missing") for an explicit `false`.

## Switched-target safety (the critical test)

Scenario: open Pattern A, say "Delete this Pattern," navigate to Pattern B before confirming, then
say "Yes." Pattern B must never be deleted for a confirmation that was never given for it, and
Pattern A must not be deleted either unless it's still the thing actually being confirmed.

Every `submit()` re-verifies the target is *still* the active one, immediately before deleting -
never trusting the id captured at `open()` time alone:

```js
var currentActive = resolveActivePatternId(context);
if (currentActive && currentActive !== id) return undefined; // refuse - target changed
```

**Bug found this session - a single registration's own `isOpen()` is not a safe re-verification
signal.** The first design checked `registry.query('pattern-editor-' + id).open` to decide whether
the original target was "still showing." Real testing found `pattern-editor-{id}`'s registration
never reports `isOpen()==false` again once opened, even after navigating away - two Patterns' own
registrations both report `true` simultaneously forever. Checking a single registration's own
`isOpen()` therefore could not tell "still the same target" from "some Pattern editor exists
somewhere." Fixed by re-resolving the *currently active* entity fresh from context each time and
comparing ids, not by asking a specific registration whether it still thinks it's open. Session
delete has no per-entity registration to fall back on at all - it re-reads
`TradeJournalNavryaLiveSession.getActiveSessionId()` directly instead.

## Two stale-registration bugs from the same root cause, found via real testing

`ai-process-registry.js`'s `activeOpenProcess()` picks whichever *currently-open* registration was
most recently registered - and every registration everywhere in this app follows the same
convention: a `React.useEffect` registers on mount/relevant-prop-change, and a paired
`mountedRef`/cleanup flips `isOpen()` to `false` on unmount. Two of Journey F's own new pieces
skipped half of that convention and broke in ways only a real, multi-step browser test surfaced:

1. **`session-delete-confirm` is a synthetic, non-DOM-backed process** (`session.delete` has no
   real per-session UI to reuse), registered with `isOpen: () => true` permanently, once, inside
   `session.delete`'s own `open()`. Correct for its one real purpose (`ai-workflow-engine.js`'s
   `scheduleSubmit()` needs *some* real registration to find "open" before it will ever call
   `submit()` - an unregistered processId silently discards the workflow instead) - but a
   permanently-open, non-empty-allowlist registration is exactly the shape `activeOpenProcess()`
   was never meant to see stick around forever. Left unfixed, any later, unrelated message sent
   after even one `session.delete` flow would find this stale registration outranking everything
   else, permanently blocking all further action discovery for the rest of the page load (the same
   bug class documented for `settings-trading-defaults`/`ai-assistant-engine` back in F33-36).
   Fixed by unconditionally excluding `session-delete-confirm` from `activeProcess` resolution in
   `chat-dock-core.js`, the same way those three already are.
2. **`ScenarioEditor`'s own `live-session-scenario-{id}` registration tracked `isOpen: () => open`**
   (the live "is this card expanded" prop) on the explicit, once-true assumption that the component
   itself never unmounts except by leaving the whole Session - correct until `scenario.delete` made
   real deletion (hence a real unmount) possible. With no cleanup function, deleting a Scenario left
   its *last* registered closure (`open` baked in as `true`, since a Scenario is normally expanded
   right before it's deleted) permanently reporting itself open. Because `activeOpenProcess()`
   picks the single most-recently-open registration *globally*, this stale, already-deleted
   Scenario permanently outranked its own still-open parent Entry, so
   `ai-context-engine.js`'s `activeEntryId()` could never resolve the Entry again -
   silently making `entry.delete`'s own `available()` gate false forever, for the rest of the page
   load. Fixed with a real `mountedRef`, guarding `isOpen()` as `mountedRef.current && open`.

**The general lesson, not specific to either bug:** any registration that can ever stop being
genuinely open - by unmount, by the underlying record being deleted, or simply by time - must have
a way to report that, checked fresh, not baked into a stale closure. A registration that is
"permanently open by design" (a fixed-id synthetic process) must instead be excluded from
`activeProcess` resolution explicitly, since nothing will ever make it report closed.

## Missing synthetic gate field on the real registration - the same F26-32 bug, reapplied here

A workflow *continuing* through an already-open process (rather than being freshly re-discovered)
is served that process's own real `allowlist` as its schema, not the action's `requiredFields`.
`pattern-editor-{id}`/`strategy-editor-{id}` are only *conditionally* excluded from `activeProcess`
(preserved for `pattern.edit`/`strategy.edit`'s own legitimate multi-turn name resolution) - so
`pattern.delete`/`strategy.delete`'s own confirm turn continues through that exact allowlist.

**Bug found this session:** neither registration's allowlist included `confirm` - the exact
"missing synthetic gate field" bug already found and fixed for
`community-new-post`/`publish-flow`/`messages-compose` back in F26-32, never re-applied when F37
added Pattern/Strategy delete. The model had no schema path to ever express confirmation on that
turn. Every English test happened to pass anyway, because the deterministic gate fast-path (below)
intercepts common English confirm phrasing (`^\s*yes\b`, "confirm", "delete it", ...) *before* the
network call is ever made - masking the bug entirely for English. Real-browser testing in Persian,
Arabic, and Spanish (whose confirm phrasing the fast-path's classifier does not cover at all, or
only partially for Persian - see below) surfaced it immediately: every non-fast-path confirm turn
silently failed to delete anything. Fixed by extending both allowlists with a synthetic `confirm`
field (a no-op for `applyValue`, exactly the established F26-32 pattern) - `strategy-editor-{id}`'s
generic path-forwarding `applyValue` also needed an explicit exclusion so `confirm` can never be
written onto the real Strategy record.

## The deterministic gate fast-path, and its real limits

`chat-dock-core.js` intercepts a message when exactly one gate-shaped field (`/^(confirm|send|
publish)/i`) is missing, classifying it via `ai-proactive-engine.js`'s existing
`interpretConfirmationText()` (a pure EN/FA regex, originally built for Journey C's own risk-
override confirmation) before ever reaching the network - `reject` cancels the workflow and clears
it; `confirm` applies the gate field directly via `workflowEngine.applyKnownFields()`. This is a
reliability *optimization*, not the only path that works: the classifier only recognizes English
and a narrow set of Persian override-style phrases (`تأیید`, `باشه...بزن`, ...) - it does not
recognize an ordinary Persian "yes" (`بله`), and has no Arabic or Spanish patterns at all. Any
confirm/reject phrasing outside that narrow set falls through to the network call and depends
entirely on the real registration's own allowlist including the gate field (see above) - which is
exactly why that bug went undetected until non-English testing.

## Partial speech can never confirm - by construction, not by a runtime check

`navrya-src/aiVoiceRealtime.js` only ever calls `onFinalTranscript()` on the Realtime API's
`conversation.item.input_audio_transcription.completed` event; interim/delta transcripts are never
listened to at all ("ABSOLUTE rule," per that file's own comment). There is no code path by which a
partial utterance could reach `chat-dock-core.js`'s `sendChat()`, gate fast-path, or the network
call - confirmation can only ever be evaluated against a finalized turn.

## Confirmation channel switching works because there is exactly one workflow state

`ai-workflow-engine.js`'s workflow state is a single, page-load-scoped object, read and written
identically regardless of whether a turn originated from the text input or from a finalized voice
transcript (`source: 'voice'` is passed through to the server for `voiceReply` generation only - it
never forks workflow state). A destructive workflow started by voice and confirmed by text, or
started by text and confirmed by voice, or rejected from either channel, is the same single record
throughout - verified by real-browser tests calling `TradeJournalChatDockCore.sendChat({text,
source:'voice', ...})` directly (the exact function `chatDockView.jsx`'s own `onVoiceTranscript`
handler calls - not a stand-in, the real voice pipeline's own entry point once transcription
finishes).

## Duplicate deletion protection

Rapid "Delete it." "Delete it." executes at most once: the first confirm's `submit()` clears the
pending id (`var id = pendingXDeleteId; pendingXDeleteId = null;`) before calling the real delete,
so a second, near-simultaneous confirm finds nothing pending and refuses (`return undefined`). A
later "Delete it again." after the entity is already gone goes through fresh target resolution,
finds nothing to resolve, and reports that honestly - never a throw, never a second delete attempt
against a stale reference.

## What remains explicitly excluded from this gate

`SENSITIVE_EXCLUDED`, structurally: password, API key (view/edit/remember), admin/authorization
role, billing/subscription, brokerage/exchange order execution, and account deletion. None of these
fields exist in any action's `requiredFields`/`optionalFields`, and none of the real registrations
these actions target expose them to `applyValue` at all - not merely omitted from an action's own
field list (`ai-assistant-engine`'s registration, for one concrete example, never references
`setKey`/`setPersistApiKey`/`setBudget`, so a future careless allowlist edit cannot silently reopen
that seam). Account deletion specifically remains manual because no deliberately-designed,
human-confirmed deletion flow exists in the product at all yet to safely wrap.
