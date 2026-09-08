# Voice ↔ UI Synchronization (Journey H1)

How a Voice-driven field/step change reaches the REAL UI, how a human's own manual action becomes
Voice's new truth on the very next turn, and how the magic-fill animation is presented - all
without a second UI/data path.

## Voice → UI

Unchanged pipeline, one addition inside it:

```
transcript (aiVoiceRealtime.js)
  -> chatDockView.jsx submit()
  -> chat-dock-core.js sendChat()            [the one model call]
  -> ai-workflow-engine.js start()/applyKnownFields()
  -> ai-process-registry.js applyValue()
       -> (NEW) stepForPath/goToStep lockstep, if the registration declares them
       -> the real registration's own applyValue() - the SAME setState a human typing would trigger
       -> (NEW) TradeJournalAIFieldFillBus.emit() - presentation only, fires AFTER the real write
  -> the real component's own submit() (via ai-process-registry.js's submit())
  -> the real store
```

No new file in this chain ever calls a store directly. `ai-workflow-engine.js` still only ever
calls `action.open()`/`action.submit()`/`action.resultContext()` (the Action Registry's own,
already-real functions) and `TradeJournalAIProcessRegistry.applyValue()`/`.submit()` (the Process
Registry's own, already-real functions).

## Multi-step wizard lockstep (brief sections 18-21)

Two genuine multi-step wizards exist: `tradeLogModal.jsx` (`trade-wizard`, 5 steps) and
`mentalHealthIntakeModal.jsx` (`mh-intake`, 13 steps, 5 chapters). Both now declare
`stepForPath`/`goToStep` on their Process Registry registration, built once from
`ai-wizard-step-map.js`'s `forGroups({step: [paths-or-prefixes]})`:

**`trade-wizard`** (from `trade.types.js`'s `tradeWizardPaths`):
| Step | Component | Fields |
|---|---|---|
| 1 | StepStatus | `direction`, `marginMode`, `entryPrice`, `stopLoss`, `riskPercent`, `riskAmount`, `leverage`, `positionSize` |
| 2 | StepTimeframes | `primaryTimeframe` |
| 3 | StepSeen | `conceptTags`, `chartNote` |
| 4 | StepEmotions | none (`dominantEmotions`/`stressLevel`/`note` are a SEPARATE allowlist - `trade.emotion.log`'s own `trade-emotion-log` process) |
| 5 | StepScreenshots | none |

`accountId`/`instrument` are deliberately in NEITHER group - they live in a persistent header
shown on every step, so `stepForPath` correctly returns `null` for them (apply wherever the wizard
already is, never force a step change).

**`mh-intake`** (from `mental-health.types.js`'s `intakePaths`):
| Step | Component | Fields |
|---|---|---|
| 2 | DemographicsStep | `intake.demographics.*` |
| 3 | FinancialStep | `intake.financialContext.*` |
| 4 | ExperienceStep | `intake.tradingHistory.yearsTrading`, `.marketsTraded` |
| 6 | MotivationStep | `intake.motivationForTrading`, `intake.firstBigLossReaction` (both questions live in the SAME step, despite the name "firstBigLossReaction" suggesting ExtremesStep - verified against the real step->component map) |
| 7 | TransparencyStep | `intake.transparencyMatrix.*` |

Steps 1 (Orientation), 5 (Extremes), 8-12 (Scenario), 13 (Summary/Sealed) have no group: step 5's
own visible fields (`largestWin`/`largestLoss`/`marginCallOrZeroedCount`) are real
`numericPaths` but are **not** in `intakePaths` - a pre-existing scope limit (nothing on that step
is AI-fillable through `mh-intake` today), left as-is rather than expanded in this gate.

`ai-process-registry.js`'s `applyValue()` resolves `stepForPath(path)`; if it names a step other
than `activeStep()`, it calls the registration's own `goToStep()` - the exact same function the
real Next/Back buttons call - **before** writing the value, so the value always lands on the step
that is about to become visible, never a step the user isn't looking at.

Verified live in-browser (see the Journey H1 final report): applying `primaryTimeframe` to an
open `trade-wizard` on step 1 visibly advances it to step 2; applying
`intake.demographics.age`/`intake.financialContext.capitalType`/`intake.tradingHistory.yearsTrading`
in sequence visibly advances a fresh `mh-intake` through steps 1→2→3→4, each field landing on its
own now-current step.

## Forward-looking step synchronization (voice step-lookahead)

The lockstep above is entirely **reactive**: `stepForPath`/`goToStep` only ever run as a side
effect of `applyValue()` actually writing a field's *value* - a field the model extracted THIS
turn. But the model decides two things together, in the one same network call: which fields to
extract, and what the reply text itself says next. A reply that **asks about** a field (e.g. "What
timeframe did you trade?") is not the same event as a field being *answered* - nothing was
extracted for `primaryTimeframe` this turn, so nothing drove `goToStep(2)`, so the real wizard
stayed on step 1 while the reply already asked a step-2 question. Confirmed as a genuine, live gap
(not previously fixed): a trader watching the screen while talking would hear/read a question
about a field the form had not moved to yet - it only caught up one turn later, once they actually
answered and that answer's own `applyValue()` call finally moved the step.

Two additions close this, without inventing a second step map or a second decision path:

**`nextFieldPath`** (`server/pattern-ai-server.mjs`'s `dockChatFormatFor()`): a new, nullable,
enum-constrained response field, present in both the `activeProcess` and `availableActions`
schema branches (scoped to exactly that branch's own real field paths, `null` when the reply is
not asking about one specific field). The model is prompted to set it whenever its own reply
text is specifically about one particular field - the exact same JSON turn already decides the
reply and the extracted fields, this is simply a third, explicit thing it reports about that same
reply.

**`prepareForPath(processId, path, identity)`** (`ai-process-registry.js`): an awaitable
counterpart to `applyValue()`'s own reactive step-follow, reusing the SAME registration-declared
`stepForPath`/`goToStep` (never a duplicate map). Given the field `payload.nextFieldPath` names,
it resolves the step that owns it and, if that differs from the step currently showing, calls the
real `goToStep()` and then polls `activeStep()` (bounded, ~500ms in production, configurable via
`setPrepareForPathTiming()` for tests) until the change has actually committed - honestly
resolving `{ready:false, reason:'timeout'}` rather than pretending success if it never does. Two
things it deliberately never does: apply a value, or submit. An optional `identity` (a
`TradeJournalAIUiRevisionGuard.capture()` snapshot - the caller reuses the current workflow's own
already-captured `uiSnapshot` when the target process matches it, or `prepareForPath` captures a
fresh one itself) is re-checked before starting and while polling; a `'closed'`/`'surface'`
divergence aborts with `{ready:false, reason:'diverged'}` rather than acting on a form that is no
longer genuinely showing. A `'step'` divergence (the SAME wizard moved under the user's own hand
while this was pending) is NOT treated as a reason to abort - `goToStep()` here is itself
authoritative for where this call wants to land regardless.

`chat-dock-core.js`'s `sendChat()` awaits `prepareForPath()` - best-effort, wrapped so a failure
never breaks the actual reply - immediately after the existing field-application branches and
before returning this turn's result. The required order this guarantees:

```
1. one network call decides BOTH the reply text AND nextFieldPath together
2. this turn's own extracted fields are applied (existing reactive lockstep, unchanged)
3. (NEW) prepareForPath() moves the real form to nextFieldPath's own step, awaited
4. sendChat() returns - only now does chatDockView.jsx ever display/speak the reply
5. the question is spoken/shown with the real screen already caught up to what it describes
```

Deliberately NOT done this pass: an `nextFieldPath`-equivalent for Anthropic/Kimi/DeepSeek's own
JSON-shape reliability is trusted on the same established precedent `action`/`suggestions` already
proved for these three providers (no native structured-output enforcement, but the system prompt's
own JSON-shape instruction is already followed reliably in practice) - not separately re-verified
against a real Anthropic/Kimi/DeepSeek account in this pass. A real multi-turn browser/voice
verification against a live provider was not performed either - covered by behavioral VM-sandbox
tests (`tests/ai-process-registry.test.mjs`, `tests/voice-step-lookahead.test.mjs`) and the schema
tests in `tests/ai-dock-chat-actions.test.mjs` instead.

## UI → Voice (manual intervention, brief sections 26-32, 49-51)

Nothing is cached. `ai-process-registry.js`'s `isOpen()`/`activeStep()` are re-invoked on every
`query()`/`snapshot()` call - a human's own click (Next/Back/Skip, closing a modal, editing a
field, opening a different surface) is visible on the very next read, with zero polling and zero
extra events: the registrations themselves are just live closures over real React state.

Two additional guarantees this gate adds, both via `ai-ui-revision-guard.js` (see
`docs/ai/page-aware-voice.md`):
- A manual step change (clicking Back/Next in the real UI) diverges a workflow's captured
  baseline - the next Voice turn's fields are discarded rather than applied against a step the
  user has since left, and the workflow clears so a later turn re-evaluates fresh.
- A manual switch to a different foreground surface (opening a different modal) does the same for
  any in-flight `foreground`-layer workflow.

A manual field EDIT was already protected before this gate: `ai-workflow-engine.js`'s
`applyKnownFields()` only re-applies a path whose extracted value actually changed since it was
last known (`JSON.stringify` compare) - a model re-echoing an old value never clobbers what the
user has since typed by hand. This gate does not change that mechanism, only adds the step/surface
guards above on top of it.

Verified live in-browser: manually clicking the real Intake modal's "Previous" button (a genuine
DOM click, not a registry call) moves the real `step` from 4 to 3, and the very next
`registry.query('mh-intake').step` read reflects `3` immediately.

## Magic-fill animation

```
ai-process-registry.js's applyValue()  [after the real write already landed]
  -> TradeJournalAIFieldFillBus.emit(processId, path, {value, mode})
  -> useAiFieldFill(processId, path) [React hook, subscribed by that one field]
  -> boolean flips true, auto-clears after ~650ms
  -> <AiMagicFill active={...}> toggles a data-attribute on its wrapped child
  -> CSS (@keyframes nv-magic-fill-pulse, AiMagicFill.motion.js) renders the glow
```

The bus carries only presentation metadata (`processId`, `path`, `value`, `mode`, `timestamp`) and
is never read as a source of truth for form data. `AiMagicFill` wraps its child with
`display:contents` (never affects a parent flex/grid layout) and never touches `value` or reads
the DOM - correctness is the real component's own controlled state throughout; the animation is a
pure, decoupled side observer.

**Accessibility**: `prefers-reduced-motion` is handled entirely in CSS
(`@media (prefers-reduced-motion:reduce)`), not a JS `matchMedia` branch - the animation itself is
neutralized but a static, instant `box-shadow` highlight remains, so success is never communicated
by motion alone (brief section 17).

**Wired domains** (this pass): Session creation (city/timeframe/instrument), Trade Calculator
(direction/entryPrice/stopLoss/riskPercent), Trade Wizard (all of steps 1-3's fields above),
Pattern editor (name/description/completionThreshold/instruments), Strategy editor (every
position/risk/framework field, generically via `StrategyMagicField`), Psychology Intake (every
`intakePaths` field across Demographics/Financial/Experience/Motivation/Transparency, via
`IntakeMagicField`), Settings Trading Defaults (all three rows, the representative persistent
inline-form case - `layer` stays `'background'` there, proving the animation hook works
identically outside a modal).

Verified live in-browser on every wired domain: the real DOM element ends up with
`data-nv-magic-fill="active"`, `getComputedStyle(...).animationName === 'nv-magic-fill-pulse'`
and a non-zero `boxShadow` mid-flight, and the attribute is gone once the window elapses.

## Questions during an active form (brief sections 24-25, 48)

Unchanged by this gate - `chat-dock-core.js`'s existing Explain-mode branch already never touches
`applyValue`/`goToStep` for a `companionIntent === 'explain'` turn (it forces the local
`activeProcess`/`availableActions` view to `null` for that turn only, never the real registry), so
a form stays open, on the same step, with no field mutated, exactly as before this gate.

**Not done this pass**: threading `TradeJournalAISurfaceContext.snapshot()`'s step-aware detail
into the Explain turn's own `companionContext`/server prompt, so "what does this field mean"
answers could name the exact visible step by construction rather than relying on the model's own
reading of chat history. `ai-surface-context.js` already exposes everything needed
(`processId`/`step`/`page`) - the remaining work is wiring it into `requestBody` AND into the
server-side prompt builder (`server/pattern-ai-server.mjs`, not audited or touched this pass) to
actually use it, which is real, separately-scoped work rather than a one-line addition. Logged
honestly here rather than half-wired.
