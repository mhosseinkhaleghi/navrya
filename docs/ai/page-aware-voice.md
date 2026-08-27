# Page-Aware Voice (Journey H1)

How Voice knows what real UI surface the user is looking at right now, how "topmost surface" is
resolved deterministically, and the zero-model-call guarantee this entire gate depends on.

## What already existed

Before this gate, "what's open" had exactly one source of truth: `ai-process-registry.js`'s
`activeOpenProcess()` - whichever currently-`isOpen()` registration was most recently
(re-)registered wins. `ai-context-engine.js`'s `snapshot()` composes that into
`{navigation, activeEntities, workflow}`. There was no concept of a modal/wizard/editor
outranking a background page - "most recently touched" was the only tie-break, which happened to
work for the app's original single-flow-at-a-time shape but had no answer for "a foreground editor
is open AND the Dashboard behind it is technically still mounted."

## The `layer` model

`ai-process-registry.js`'s `register()` now accepts an optional `layer: 'foreground' | 'background'`
(default `'background'` - every pre-existing registration is unaffected). `activeOpenProcess()`'s
winner comparison became `(layerRank, _order)` instead of plain `_order`: an open `foreground`
registration always outranks an open `background` one, and the existing same-layer recency rule is
unchanged within a tier.

This is deliberately binary, not a full z-index/DOM-stacking model - nothing in this app needs
one. Every real registrant is either:
- a **foreground** surface genuinely laid over the rest of the page (a modal, a wizard, a
  full-detail editor tab) - `session-create`, `trade-calculator`, `trade-wizard`, `mh-intake`,
  `pattern-editor-{id}`, `strategy-editor-{id}`, `strategy-hub-publish-flow`, or
- a **background** surface that competes *with* the rest of the page rather than covering it - a
  persistent inline section (`settings-trading-defaults`) or an ambient per-card registration
  (`live-session-entry-{id}`/`live-session-scenario-{id}`, Community comment boxes) that was
  already deliberately excluded from `chat-dock-core.js`'s `activeProcess` resolution for its own,
  separate reasons documented there.

## Surface Context (`ai-surface-context.js`)

`window.TradeJournalAISurfaceContext.snapshot()` is the single "what real UI surface is the user
on" resolver, additive to (never a replacement for) the protected `ai-context-engine.js`:

```
{
  processId,   // activeOpenProcess().id, or null
  layer,       // that process's own registered layer, or null
  step,        // that process's activeStep(), or null
  page,        // location.hash-mapped page ('psychology'/'ai-assistant'/'community'/'account'),
               // falling back to navigation.activeId (the 3 React canvas views + 'sessions')
  entities,    // ai-context-engine.js's own activeEntities, passed through unchanged
  fallbackNextStep  // ai-journey-engine.js's existing nextBestStep() - ONLY consulted when
                     // processId is null (nothing open at all)
}
```

The hash-page mapping is kept in sync with `ai-context-builder.js`'s own `HASH_DOMAINS` table
(`#mindset` -> psychology, `#ai-settings` -> ai-assistant, `#community` -> community, `#account`
-> account) rather than re-derived independently.

## Dashboard "what deserves attention" (brief section 8)

No new priority scorer was built. `fallbackNextStep` is `ai-journey-engine.js`'s own, already
deterministic `nextBestStep()` - a pure function of already-evaluated state (open Trade, due
Reflection, active Session, Journey phase) that Journey G already computes for the Companion card.
It is called (via `TradeJournalAISurfaceContext.snapshot()`) only when nothing is genuinely open,
matching the brief's own "topmost surface wins" rule extended one level further: foreground surface
> background page > a suggested next step > neutral.

## Stale-action protection (`ai-ui-revision-guard.js`)

`window.TradeJournalAIUiRevisionGuard`:
- `capture(processId)` -> `{processId, layer, step}` snapshot of a process's current, real state
  (via `ai-process-registry.js`'s new `snapshot(processId)`), or `null` if it isn't open.
- `hasDiverged(captured)` -> `true` iff any of: the process closed; its step changed to something
  other than what was captured (a human's own Back/Next/Skip, or reopening at a different step);
  or - only for a `foreground`-layer capture - a *different* registration is now topmost.

`ai-workflow-engine.js` calls `capture()` once a workflow's real `processId` is known (right after
`start()`'s stashed `open()` resolves), checks `hasDiverged()` before applying each later turn's
fields, and re-captures after its own field application legitimately advances a step (via the
`stepForPath`/`goToStep` mechanism - see `docs/ai/voice-ui-synchronization.md`) so its own
step-follow is never mistaken for a human's independent action on the very next turn. See that
guard's own header comment for why this is narrower than a generic diff, and section 27/49-51 of
the product brief for the underlying "manual edits are always authoritative" rule this exists to
protect.

## Zero-model-call guarantee

Every function introduced in this gate - `activeOpenProcess()`'s layer comparison,
`ai-wizard-step-map.js`'s `stepForPath()`, `ai-ui-revision-guard.js`'s `capture()`/`hasDiverged()`,
`ai-surface-context.js`'s `snapshot()`, `ai-field-fill-bus.js`'s `emit()`/`on()` - is a synchronous,
local read of state that already exists in memory for other reasons (Process Registry
registrations, Journey Engine's own evaluation, a plain in-memory event list). None of them fetch,
await a network response, or call the AI provider. The only network call anywhere in the pipeline
this gate touches remains `chat-dock-core.js`'s single `fetch('/api/ai/chat')` per conversational
turn - unchanged from Journey A-G.

## What this gate does NOT add

No z-index/DOM-stacking model, no cross-tab/cross-window surface tracking, no persistence of
surface history. `layer` answers exactly one question - "is this a modal/wizard/editor, or a
persistent page section" - and nothing more.
