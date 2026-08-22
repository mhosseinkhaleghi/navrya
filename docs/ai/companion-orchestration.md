# Companion Orchestration & ChatDock Integration (Journey G)

`public/pages/shared/ai-companion-orchestrator.js` → `window.TradeJournalAICompanionOrchestrator`
`public/pages/shared/navrya/components/assistant/CompanionCard.jsx`
`navrya-src/chatDockView.jsx` (integration), `server/pattern-ai-server.mjs` (prompt wiring)

The thin, deterministic glue between `ai-journey-engine.js` (what's next) and the ChatDock's
Companion card (how it's shown and acted on). No polling, no second AI runtime, no second chat
surface.

## Event-driven, never a poller (§22)

`ai-companion-orchestrator.js` listens to the real CustomEvents every relevant store already
dispatches - `tradejournal:trades-changed`, `-sessions-changed`, `-patterns-changed`,
`-strategy-education-changed`, `-mental-health-changed`, `-companion-state-changed` - and
republishes one UI-agnostic `tradejournal:companion-updated` event, the same cross-root-sync
convention `tradejournal:ai-settings-changed` already established. `init()` is idempotent and runs
once automatically at module load.

## Two-layer gating: eligibility vs. render-time

`ai-journey-engine.js`'s `nextBestStep()` already refuses to return anything while a workflow is
in flight or a Proactive Engine confirmation is pending (see `docs/ai/journey-engine.md`'s
"Safety precedence"). That covers *product-state* safety. A second, separate gate lives in
`chatDockView.jsx` itself, for *transient UI state* the orchestrator has no reason to track:

```js
const showCompanionCard = !!companionCard && !popover && !historyOpen && !therapistMode && voiceState === VOICE_STATES.IDLE;
```

The Companion card never appears over a reply popover, the history dropdown, Therapist Mode, or
an active Voice session - each of those is already real React component state in
`chatDockView.jsx`; teaching the vanilla orchestrator module about them would mean inventing a
second, redundant channel for state that already exists. This is a deliberate split, not an
oversight: **product-state safety lives in the engine; transient-UI safety lives in the
component that owns that UI state.**

## The Companion card is not proactive-popping (§16, §23)

The card renders inline, above the ChatDock's input bar, only while the dock is otherwise idle -
it never auto-opens the dock, never plays a sound, never interrupts. "Proactive" in this gate
means *the card's content updates the instant something relevant changes* (a new Pattern
completes, a Trade opens), not that the UI forces itself in front of the user. A future pass could
add a small unread-indicator dot on the dock button itself; Gate 1 deliberately does not, to avoid
building a notification-badge system without real evidence it's needed.

## Response stance (§10) - never a second router call

`ai-journey-engine.js`'s `responseStance()` returns one of three plain strings:

- **GUIDE** - a clear next real product step exists.
- **TEACHER** - the user tapped Explain (an explicit ask to understand something).
- **COMPANION** - an active Trade or a due Reflection is the live context.

This is computed in the same synchronous pass as `nextBestStep()` - never a second model call to
decide "which mode." It is sent to the model purely as labeled reference text inside
`companionContext`; the model may phrase its answer differently for each stance, but never decides
the underlying milestone/journey fact itself.

## Wiring into the existing chat pipeline (§11)

`chat-dock-core.js`'s `sendChat()` builds `companionContext` the exact same way it already builds
`productContext` - additive, best-effort, skipped while a workflow/activeProcess is already
driving the turn (there is no "what's next" decision to make mid-workflow):

```js
var companionPackage = journeyEngine.companionContext({ explicitExplain: !!(options && options.explainStepId) });
if (companionPackage) requestBody.companionContext = companionPackage;
```

Server-side, `server/pattern-ai-server.mjs`'s `buildCompanionContextText()` renders it under its
own `=== COMPANION CONTEXT ===` header, and `dockChat()` appends one explicit sentence (mirroring
`buildProductContextText()`'s own) telling the model this block is read-only reference data, never
an instruction or a permission to act - proven inert against injected content in
`tests/companion-context-prompt.test.mjs`, the same standard already applied to PRODUCT
KNOWLEDGE/LIVE STATE/USER DATA. **One ordinary chat turn still makes at most one model call** -
Companion context rides the existing call, it never adds a second one.

## Continue is deterministic (§18/§19)

```js
function continueStep(stepId, rawContext) {
  window.TradeJournalAIJourneyEngine.executeStep(stepId, rawContext);
  publish();
}
```

Clicking Continue never sends a synthetic chat message asking the model to guess what to do -
`executeStep()` runs the step's own real executor directly (see `docs/ai/journey-engine.md`'s
"Executors"). This also sidesteps the documented action-discovery limitation (ARCHITECTURE.md
Known Constraints: a brand-new action can't always be discovered via chat while
Dashboard/Strategies/Settings has a legitimately open inline registration) - Continue never
depends on chat-based discovery at all.

## Explain-only mode (Item 1 follow-up) - never hijacked by an unrelated open form

The first Gate-1 build gated `companionContext` on `!activeProcess && !workflowBlocksDiscovery`,
which meant an Explain tap while Settings/Strategies (or any future page) had a real, unrelated,
legitimately-open inline registration would have that registration's own `activeProcess` win the
turn - `dockChat()` would treat the message as an attempt to fill THAT form, never answer the
actual question, and could even propose a stray suggestion against it.

The fix is an explicit `companionIntent: 'explain'` flag, threaded end to end:

```js
// chatDockView.jsx
function companionExplain() { submit(companionCard.explainPrompt, { companionIntent: 'explain', explainStepId: companionCard.id }); }

// chat-dock-core.js's sendChat() - computed once near the top, then enforced right before the
// request body is built, AFTER every existing activeProcess-exclusion rule has already run:
if (companionIntent === 'explain') { activeProcess = null; availableActions = null; }
if (companionIntent) requestBody.companionIntent = companionIntent;
```

This is the smallest change that satisfies every requirement:

- **Exactly one AI call, no router call** - `companionIntent` never triggers a second request; it
  only changes what one already-existing call sends.
- **The unrelated process is never touched** - `TradeJournalAIProcessRegistry` itself is never
  read again for this turn, let alone mutated; the override only changes this one request's own
  local view. The real registration stays open, unaffected, verified directly in
  `tests/companion-explain-mode.test.mjs` (`registry.query(processId).open === true` after the
  turn).
- **No suggestions applied, no workflow starts** - with `activeProcess`/`availableActions` both
  null, `dockChat()`'s own schema selection (`dockChatFormatFor()`) structurally omits the
  `suggestions`/`action` properties entirely - the model has nothing to return even if it tried,
  and the two client-side branches that ever call `applyKnownFields()`/`registry.applyValue()`
  each require `availableActions`/`activeProcess` to be truthy, so neither can run. Proven with a
  deliberately "unsafe" fake server reply that DOES carry `suggestions`/`action` in the test suite
  - the client still applies neither.
- **TEACHER stance preserved, `productContext`/`companionContext` still available** -
  `companionContext` is gated by `companionIntent === 'explain' || (!activeProcess &&
  !workflowBlocksDiscovery)`, unconditional for this intent; `productContext` was never gated on
  `activeProcess` to begin with. Server-side, `companionIntent === 'explain'` adds one explicit
  reinforcing sentence to the system prompt and its own `COMPANION_EXPLAIN` `turnType` (for
  `serverTiming` diagnostics), on top of the TEACHER-stance `companionContext` block.
- **Existing form stays open and unchanged; normal ChatDock behavior resumes** - nothing global
  was ever touched; the very next ordinary message (no `companionIntent`) reads `activeProcess`
  exactly as it always did.
- **Safety/Therapist Mode intact** - `companionIntent` is read after the Therapist Mode branch (an
  unconditional early return) and after Journey C's own pending-confirmation resolution, so
  neither is bypassed; in practice the Companion card itself is never visible while either is
  active (see the render-time gate above), so the two paths cannot collide through the real UI.

A second, smaller doc-drift found while fixing this: ARCHITECTURE.md's Known Constraints describe
"Dashboard/Strategies/Settings" as three pages each registering a persistent inline AI process,
but only Strategies (`pattern-editor-{id}`/`strategy-editor-{id}`) and Settings
(`settings-ai-panel-builder`/`settings-trading-defaults`/`settings-region-language`) actually do -
`navrya-src/dashboardView.jsx` and `canvasApp.jsx` register nothing. The fix above is fully
id-agnostic (it never special-cases which process is open), so this is noted for accuracy, not
because it changes what needed fixing.

## Explain uses the real chat pipeline, in TEACHER stance

```js
function companionExplain() { submit(companionCard.explainPrompt, { companionIntent: 'explain', explainStepId: companionCard.id }); }
```

`companionCard.explainPrompt` is a real, per-step localized question (e.g. "What is a Pattern?"),
not a synthetic "explain this" marker - the same `submit()` a typed message already goes through,
so the answer lands in the normal transcript/history exactly like any other turn.

## Welcome (§16)

`welcomeCard()` returns a `kind:'welcome'` card once, before `walkthroughSeenAt` is set - a
deterministic, zero-network, localized (fa/ar/en/es) card with Start/What is NAVRYA?/Later. Any of
the three marks it seen (a deliberate simplification: this is a one-time welcome, not a recurring
reminder, so there is no separate "ask again later" state to track). It never auto-speaks over
Voice on ordinary page load - Voice only ever speaks in response to a user-initiated turn.

## Initiative preference (§54) - now a real, observable Low/Normal/High (Item 2 follow-up)

Two independent mechanisms combine to make the three settings genuinely different, never just
"Normal behaves like High":

1. **Eligibility (tier gating)** - `ai-journey-engine.js`'s `eligibleSteps()` filters by each
   step's `tier` (`'core'` vs `'progression'`). See `docs/ai/journey-engine.md`'s table. This is
   what makes `'high'` able to surface `pattern_report` at all, and what makes `'low'` suppress
   every non-contextual step.
2. **Cooldown (this file)** - even when a step is *eligible*, `ai-companion-orchestrator.js`
   throttles how soon a genuinely DIFFERENT, non-contextual suggestion may replace the one
   currently shown:

   ```js
   var NORMAL_COOLDOWN_MS = 15 * 60 * 1000; // conservative
   var HIGH_COOLDOWN_MS = 3 * 60 * 1000;    // shorter, never zero/instant
   ```

   The cooldown is in-memory only (not persisted - it throttles rapid *background* re-suggestion
   within one live session; a fresh page load always shows today's real `nextBestStep()`
   immediately). A **contextual** step (an open Trade, a due Reflection) always bypasses the
   cooldown unconditionally - a real lifecycle moment must never wait. Showing the *same* step
   again is never throttled either - only a genuine change to a *different* step is. Any
   user-driven interaction with the card (Continue/Later/Skip, or setting/clearing `currentGoal`)
   resets the cooldown, so the very next card always reflects what the user just did immediately -
   the cooldown exists only for changes the user didn't just cause.

Even at `'low'`, the user can still always reach every real flow directly, and Explain/typed chat
are completely unaffected by any of this; initiative only governs what the Companion *card* offers
unprompted, never the general chat pipeline's own capability.

## Journey G UX correction - the first-run welcome is no longer an automatic popup

Real-world review of the shipped Gate-1 UX found the first-run welcome card auto-popping over the
application the instant NAVRYA loaded, in Text mode, every time. This section documents the fix:
the Companion should feel primarily like a conversational AI companion, especially in Voice Mode -
not a modal interrupting an ordinary page load.

### 1. `dockExplicitlyOpened` - the WELCOME card's own new gate (Text mode)

`chatDockView.jsx` tracks one additional boolean, `dockExplicitlyOpened` (starts `false`), set true
by exactly three real user gestures - focusing the ChatDock's input (`onInputFocus`, a small,
additive prop `ChatDock.jsx` now fires alongside its own pre-existing local `focused` styling
state), pressing the Voice button (`toggleVoice()`), or sending any message (`submit()`). It is
**never** set by mounting, refreshing, or navigating. The render gate becomes:

```js
const companionCardAllowed = companionCard && (companionCard.kind !== 'welcome' || dockExplicitlyOpened);
const showCompanionCard = !!companionCardAllowed && !popover && !historyOpen && !therapistMode &&
  (voiceState === VOICE_STATES.IDLE || companionOpeningActive);
```

Only the `kind:'welcome'` card is affected - a regular `kind:'step'` guidance card is completely
unaffected and keeps showing through the pre-existing, cooldown-gated
`ai-companion-orchestrator.js` mechanism documented above. This satisfies item 14's "a Text-only
user must still be able to see next-step guidance" without reintroducing the auto-popup: the
foundational-milestone step cards (Pattern/Strategy/Session/...) were never the actual complaint -
only the large welcome card auto-opening was.

### 2-9. The Voice Companion opening - NAVRYA speaks first, deterministically

**Architecture (unchanged elsewhere in this app's AI Copilot stack):**

```
Voice button pressed (explicit user gesture, the consent boundary - item 6)
  -> aiVoiceRealtime.js's own connect() (untouched transport) reaches LISTENING for the first time
  -> chatDockView.jsx's voiceState effect calls deliverCompanionOpening()
  -> ai-companion-orchestrator.js's voiceOpening() reads ai-journey-engine.js's
     voiceOpeningContext() (real facts only) and decides whether/what to say - zero model calls
  -> chatDockView.jsx hands the EXACT localized text to the existing voiceRef.current.speak() -
     the same call every ordinary reply already uses
  -> the Realtime session speaks it verbatim (it is given zero tools and forbidden from
     improvising - see docs/ai/voice-architecture.md's "one brain" rule, completely unchanged)
  -> listening resumes
```

No new Voice brain, no bypass of ChatDock, no business rules added to `aiVoiceRealtime.js` (still
a pure transport - confirmed by grep, that file contains no mention of "companion" or "opening"
anywhere).

**The real trigger point (`chatDockView.jsx`):**

```js
React.useEffect(() => {
  const previous = previousVoiceStateRef.current;
  previousVoiceStateRef.current = voiceState;
  if (voiceState === VOICE_STATES.LISTENING && previous === VOICE_STATES.CONNECTING) deliverCompanionOpening();
  if (voiceState === VOICE_STATES.IDLE || voiceState === VOICE_STATES.ERROR) openingDeliveredForConnectionRef.current = false;
}, [voiceState]);
```

`aiVoiceRealtime.js`'s own `connect()` already transitions `CONNECTING -> LISTENING` itself the
instant `session.connect()` resolves - the FIRST time that specific transition is observed for a
connection is the one real "the session just became ready, nothing said yet" moment. No new
`VOICE_STATES` value was added to the transport - `ASSISTANT_SPEAKING` (which `speak()` already
sets) *is* the "companion_opening" state item 7 asked for; `chatDockView.jsx` layers a caller-level
label, `companionOpeningActive`, on top of it purely for the visual sync (below) and diagnostics,
never inside the transport itself.

**No duplicate opening:** `openingDeliveredForConnectionRef` guards `deliverCompanionOpening()`
against firing twice within one connection, and is reset only on `IDLE`/`ERROR` (a real
disconnect/failed session) - not on every `LISTENING` re-entry, which happens constantly during an
ordinary conversation (`USER_SPEAKING -> LISTENING`, `ASSISTANT_SPEAKING -> LISTENING`).

**Zero model calls (item 4):** `voiceOpening()` (`ai-companion-orchestrator.js`) is entirely
synchronous, reads only `ai-journey-engine.js`'s `voiceOpeningContext()` (itself zero-network,
proven in `tests/ai-journey-engine.test.mjs`) plus `TradeJournalAII18n`, and never calls `fetch`.

**Fresh vs. returning user (item 5) - priority mirrors `nextBestStep()`'s own contextual-beats-
onboarding rule:**

| Priority | Condition | `opening.kind` | i18n key |
|---:|---|---|---|
| 1 | an active open Trade | `activeTrade` | `voiceOpeningActiveTrade` |
| 2 | a due Post-Trade Reflection (no open Trade) | `dueReflection` | `voiceOpeningDueReflection` |
| 3 | a genuinely open Session (`status === 'open'`, no Trade/Reflection above) | `activeSession` | `voiceOpeningActiveSession` |
| 4 | walkthrough not yet seen (fresh user, nothing contextual above) | `freshWelcome` | `voiceOpeningFreshWelcome` |
| 5 | none of the above (a returning user, fully caught up) | `returningNeutral` | `voiceOpeningReturningNeutral` |

Every contextual fact (`openTradeId`/`reflectionDueTradeId`/`openSessionId`) comes from
`ai-journey-steps.js`'s real readers (`firstOpenTrade()`/`firstIncompleteReflectionTrade()`/the
new `firstOpenSession()`) - never a hardcoded claim.

**Item 13 - the fresh-welcome greeting never repeats:** `voiceOpening()` calls
`TradeJournalAICompanionProfile.setWalkthroughSeen()` the moment it *decides* to speak the
`freshWelcome` opening - before the user has replied at all. A real spoken interaction can't be
"un-heard," so the moment NAVRYA is about to say it is the moment it counts as delivered (the same
rule the equivalent Text welcome card already uses for all three of its own buttons). It becomes
eligible again only if the walkthrough flag is ever cleared by a future pass (not built - none of
Start/Later/Explain ever clears it once set); a "Later" reply just avoids jumping into the next
real step's UI, it does not schedule a re-greeting.

### 9. Visual sync during the opening - no new overlay

The render gate (§1 above) additionally allows the CompanionCard to render **while
`companionOpeningActive` is true**, even though `voiceState` is not `IDLE` - reusing the exact
same, already-existing component, never a second overlay. For the `freshWelcome` case specifically,
`deliverCompanionOpening()` captures `orchestrator.currentCard()` **before** calling
`voiceOpening()` (which may mark the walkthrough seen as a side effect) - this is what lets the
real Start/What is NAVRYA?/Later card still appear synchronized with the spoken greeting, instead
of `voiceOpening()`'s own side effect making `currentCard()` return something else by the time the
card would render. Once the opening finishes speaking, `companionOpeningActive` returns to `false`
and the card disappears - it is a synchronized flash of visual context around the greeting, not a
persistent overlay competing with the Voice Console for the rest of the session.

### 8. Interruption reuses the existing barge-in path - no second system

The opening is delivered through the identical `voiceRef.current.speak(text)` call every ordinary
reply already uses. `aiVoiceRealtime.js`'s pre-existing barge-in handling
(`TRANSPORT_SPEECH_STARTED` -> `interrupt()` while `state === ASSISTANT_SPEAKING`) already covers
*any* `ASSISTANT_SPEAKING` playback - `speak()` sets that exact state for every call it makes, the
opening included, so nothing new was needed there. What *was* needed: `deliverCompanionOpening()`
routes its `speak()` call through the same `voiceTurnQueue` every real voice turn already
serializes through (`voiceTurnQueue.current = voiceTurnQueue.current.catch(...).then(...)`) - this
is what stops a barge-in's own resulting reply-`speak()` call from ever overlapping the opening's
still-resolving one (the exact class of bug `voiceTurnQueue` was already built to prevent for two
ordinary back-to-back turns, documented on its own declaration).

### 10-12. Deterministic reply classification - never a second intent model

`awaitingCompanionOpeningReplyRef` is set `true` only inside `deliverCompanionOpening()`, and
read-and-cleared exactly once at the top of `onVoiceTranscript()` - so only the ONE transcript that
immediately follows a spoken opening is ever treated specially. That flag threads through
`submit()` into `core.sendChat({..., awaitingCompanionOpeningReply: true})`, where
`chat-dock-core.js` runs a new, narrowly-scoped deterministic classifier
(`ai-companion-orchestrator.js`'s `interpretVoiceOpeningReply()`) - EN/FA only, the exact same
scope `ai-proactive-engine.js`'s own `interpretConfirmationText()` already established (a bare
"yes"/"بله" is a safe match only because this only ever runs in the narrow window right after
NAVRYA asked a yes/no-shaped question):

- **`'start'`/`'later'`** resolve with **zero model calls**, via `resolveVoiceOpeningChoice()`,
  which calls the exact same real functions the visual card's own Continue/Later buttons call.
  `'start'` never hardcodes a target (item 11) - it re-reads `nextBestStep()` fresh at the moment
  of the reply (the walkthrough is already marked seen by this point, so for a fresh user this
  correctly resolves to their real first step, e.g. Pattern creation) and calls `continueStep()`
  with whatever that currently is.
- **`'explain'`** (`"NAVRYA چیه؟"`/`"what is NAVRYA?"`-shaped) sets `companionIntent = 'explain'`
  and lets the ONE ordinary AI turn run, using the user's own real spoken words as the message -
  item 12's "TEACHER behavior through the normal ChatDock + Knowledge Base," never a second answer
  path, never letting Realtime improvise.
- **Anything ambiguous** (including every AR/ES reply) returns `null` and falls straight through to
  that same one ordinary AI turn, with `companionContext` still attached - "never exceed one
  ordinary main AI call" holds in every branch.

### 16. Safety priority for the spoken opening

`deliverCompanionOpening()` checks `therapistMode` (component state) and returns immediately if
true, *before* the orchestrator is ever consulted - Therapist Mode suppresses the proactive Journey
opening entirely, the same "product-state safety lives in the engine, transient-UI safety lives in
the component" split used everywhere else in this file. Destructive/Proactive-Engine-confirmation/
active-workflow safety is checked inside `voiceOpeningContext()` itself (`blocked`), the identical
gate `nextBestStep()` already uses - `voiceOpening()` returns `null` in that case, and
`deliverCompanionOpening()` stays silent rather than forcing anything. "Voice already processing
another turn" is structurally impossible for the opening specifically, since it only ever fires
once, from the one `CONNECTING -> LISTENING` transition, before any turn has had a chance to start.
