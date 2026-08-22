# Journey Engine (Journey G)

`public/pages/shared/ai-journey-steps.js` → `window.TradeJournalAIJourneySteps`
`public/pages/shared/ai-journey-engine.js` → `window.TradeJournalAIJourneyEngine`

A deterministic, zero-model-call layer that answers one question on demand: *where is this
trader in their own NAVRYA journey, and what is the smallest useful next step?* It never decides
this by asking a model, and it never stores an answer to trust later - every call reads real,
already-loaded product stores fresh (mirrors `mental-health-collector.js`'s `recompute()`
discipline) and recomputes from scratch.

## Why this exists

Journeys A-F gave NAVRYA a real action runtime (Action Registry, Workflow Engine, Proactive
Engine, Knowledge Base) but no notion of *product journey state* - nothing could answer "has this
trader done the fundamentals yet, and if not, which one is missing." `account-profile-store.js`
already has a real `nextGoal()` (achievement/level guidance for the sidebar's reward widget); this
is a different, complementary question - a *product workflow* milestone (create a Pattern,
complete a Strategy, plan a Trade), not an *achievement/level* milestone. Where the two describe
the same real fact (a Pattern exists, a Trade closed), the Journey Engine reads the exact same
underlying store data `account-profile-store.js` already reads - it never invents a second,
parallel notion of "has a Pattern."

## Core principle: state is derived, never trusted

`ai-journey-steps.js` is a step registry (id/phase/domain/optional/priority/`available(ctx)`/
`completed(ctx)`/`execute(ctx)`). Every `completed()` check reads a real store directly:

- Intake → `TradeJournalMentalHealthStore.load().intake.completed`
- Pattern → `TradeJournalPatternStore.listSync()`, name+description+≥3 stages
- Strategy → `TradeJournalStrategyEducationStore.listSync()`, the same
  position/risk/framework-completeness fields `account-profile-store.js` already checks
- Session → the shared `tradejournal:sessions:v1:shared` cache, market+timeframe+date
- Scenario → a scenario with a real `executionPlan` (entryPrices/stopLoss/takeProfit)
- Trade Plan → `TradeJournalTradeStore.listSync()`, entryPrice/stopLoss/takeProfits/direction

Nothing here is a duplicate completion flag. `ai-companion-profile.js` persists only what
genuinely cannot be derived - see `docs/ai/companion-profile.md`'s persistence boundary.

## Phases (§5)

`ORIENTATION → KNOW_YOURSELF → KNOW_WHAT_YOU_SEE → KNOW_WHAT_YOU_DO → PLAN → EXECUTE → REFLECT →
IMPROVE` - a recommended sequence, never a hard lock. `currentPhase()` walks the six foundational
steps in order and returns the phase of the first genuine gap; an active open Trade or a due
Reflection can still surface a higher-priority step from a *later* phase (EXECUTE/REFLECT)
without that retroactively changing the trader's onboarding phase.

## nextBestStep() priority (§13)

Highest priority wins, subject to eligibility (`available && !completed && !dismissed &&
!snoozed && !skipped-if-optional`):

| Priority | Step | Why it outranks onboarding |
|---:|---|---|
| — (blocks entirely) | any pending Proactive Engine confirmation, or `TradeJournalAIWorkflowEngine.current()` truthy | `nextBestStep()` returns `null` - see "Safety precedence" below |
| 1000 | `open_trade_attention` | a real open Trade needs attention now |
| 900 | `post_trade_reflection` | a real closed Trade has no Reflection yet |
| +500 (additive) | the step whose `domain` matches the user's explicit `currentGoal` | §32 - never overrides safety or invents an unavailable action |
| 80 | `intake` (optional) | |
| 70 | `pattern_create` | |
| 60 | `strategy_create` | |
| 50 | `session_create` | |
| 45 | `scenario_plan` | |
| 40 | `trade_plan` | |
| 10 | `pattern_report` (optional) | IMPROVE-phase, once ≥5 real scenario samples exist |

A Companion-initiative preference (Low/Normal/High) additionally gates eligibility by `tier`
(added to every step in `ai-journey-steps.js`) - see the next section. `nextBestStep()` returning
`null` is a legitimate, quiet outcome, not an error.

## Initiative tiers (Low/Normal/High) - the eligibility half

Every non-contextual step (priority < 500) carries a `tier`: `'core'` (a foundational onboarding
milestone - intake/pattern/strategy/session/scenario/trade-plan) or `'progression'` (a purely
supplementary, later-stage suggestion - currently only `pattern_report`). `eligibleSteps()` in
`ai-journey-engine.js` applies:

| Initiative | Contextual (priority ≥ 500) | `tier: 'core'` | `tier: 'progression'` |
|---|---|---|---|
| `low` | always eligible | never eligible | never eligible |
| `normal` (default) | always eligible | eligible | never eligible |
| `high` | always eligible | eligible | eligible |

This is the exact, observable difference between the three settings: `'low'` only ever proactively
offers a real lifecycle moment (an open Trade, a due Reflection); `'normal'` additionally offers
foundational onboarding guidance; `'high'` additionally offers `pattern_report` once real evidence
exists. Explicit typed/spoken chat requests, and Explain on an already-shown card, are unaffected
by initiative at every level - this setting only governs what the Companion *card* offers
unprompted.

The second half - a cooldown between successive DIFFERENT proactive suggestions, also
differentiated by initiative - lives in `ai-companion-orchestrator.js`; see
`docs/ai/companion-orchestration.md`'s "Cooldown" section.

## Safety precedence

`safetyOrWorkflowActive()` checks `TradeJournalAIWorkflowEngine.current()` and
`TradeJournalAIProactiveEngine.pendingConfirmation()` before anything else. Either truthy makes
`nextBestStep()`/`evaluate().nextBestStep` return `null` for the whole call - the Journey Engine
never tries to interleave a nudge with an in-flight workflow or an unresolved safety
confirmation. This is a conservative superset of "never interrupt safety": any workflow (not just
a destructive one) silences the Companion until it resolves.

## Dedupe keys

`journey:{stepId}:{relevantVersionOrMilestone}` - never a bare timestamp. A step tied to a real
entity (`pattern_report`, `post_trade_reflection`, `open_trade_attention`) keys on that entity's
id, so dismissing one Pattern's report nudge doesn't suppress a *different* Pattern's later one.
Every other step keys on its bare id.

## API

```js
TradeJournalAIJourneyEngine.evaluate()
// -> { phase, completedMilestones, optionalSkippedMilestones, activeContext, blockers,
//      nextBestStep, educationNeeded, currentGoal, evidence }
TradeJournalAIJourneyEngine.nextBestStep()     // -> the single top step, or null
TradeJournalAIJourneyEngine.milestones()       // -> { completed, skipped }
TradeJournalAIJourneyEngine.explainNextStep()  // -> { title, why, explainPrompt } or null
TradeJournalAIJourneyEngine.companionContext({ explicitExplain })
// -> the trimmed, model-facing package - see docs/ai/companion-orchestration.md
TradeJournalAIJourneyEngine.debugLastSnapshot()
// -> sanitized dev diagnostic (phase/nextStepId/completedMilestones/blockers/responseStance) -
//    never raw store content
TradeJournalAIJourneyEngine.executeStep(stepId, rawContext)
// -> deterministically runs that step's real executor (§18/§19) - never a chat turn
TradeJournalAIJourneyEngine.dedupeKeyFor(stepId)
```

## Executors

A step's `primaryAction` resolves one of two ways, both calling something that already exists:

1. **A real Action Registry action** (`pattern.create`, `strategy.create`, `session.create`,
   `trade.calculator`) - `ai-journey-steps.js`'s `actionOpen(actionId, ctx.raw)` calls
   `TradeJournalAIActionRegistry.get(actionId).open()` directly, the exact same function Journey
   F's conversational actions already call. Continue never goes through the Workflow Engine's
   slot-filling - it only *opens* the real UI, matching §18's "Continue is deterministic."
2. **A registered executor** (`ai-journey-steps.js`'s `registerExecutor(stepId, fn)`) for steps
   with no matching conversational action: `intake` → `openIntake()`, `post_trade_reflection` →
   `openPostTradeReflection(trade)`, `open_trade_attention` → `openTradeDetails(trade)`,
   `scenario_plan` → `openLiveSession(sessionId)`, `pattern_report` → a real hash navigation to
   `#strategies/patterns/{id}/report`. Every one of these is wired from `character-app.jsx`'s
   `mount()`, reusing the exact same already-imported functions its own `TradeJournalNavryaXxx`
   hooks already expose - never a second, parallel open path.

## Zero model calls

Every function above is synchronous, reads only already-loaded `window.TradeJournal*` stores and
`localStorage`, and never calls `fetch`. `tests/ai-journey-engine.test.mjs` asserts this directly
by giving the vm sandbox a `fetch` that throws if ever invoked.

## Known Gate-1 simplifications (see the final report for the full list)

- `nextBestStep()` does not pull live async mastery blockers (`getMastery()` is a fetch) into its
  synchronous evaluation - IMPROVE-phase guidance stays limited to what a synchronous snapshot can
  derive (`pattern_report` only). Mastery/achievement "what's next" guidance remains
  `account-profile-store.js`'s `nextGoal()`'s own job, surfaced in the sidebar reward widget.
- Only one step currently carries `tier: 'progression'` (`pattern_report`) - `'high'`'s
  "additional optional educational/progression guidance" is real and tested, but there is only one
  such step to reveal today. Adding a genuinely new step to the registry (not part of this gate)
  would automatically gain the same Low/Normal/High treatment for free by declaring its own tier.
