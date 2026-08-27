# Voice ↔ UI Synchronization Coverage Matrix (Journey H1)

Built the same way `docs/ai/action-coverage-matrix.md` was: by reading the actual repository, not
inferred from names or from the product brief. Columns: **surface-aware** (Voice can resolve
`processId`/`layer`/`step` for it), **open** (Voice can start it from a bare utterance via the
Action Registry), **fill** (an already-open instance's fields sync live, with the magic-fill
animation), **multi-step** (a real wizard, and Voice follows/advances its steps), **bidirectional**
(manual Back/Next/Skip/edit/close is read fresh, never cached - true for every registered process
in this app by construction, see `docs/ai/voice-ui-synchronization.md`), **tested** (automated +
live-browser).

## Covered this pass (deep)

| Domain | Surface | surface-aware | open | fill+animate | multi-step | bidirectional | tested |
|---|---|---|---|---|---|---|---|
| Pattern create | Modal (instrument picker) | ✅ | ✅ (`pattern.create`, pre-existing, re-verified live) | n/a (single required field, resolved same-turn) | no | ✅ | automated + browser |
| Pattern edit | Inline editor (`pattern-editor-{id}`) | ✅ (`layer:foreground`) | ✅ (`pattern.edit`) | ✅ name/description/completionThreshold/instruments | no (single step) | ✅ | automated + browser |
| Strategy create | Inline editor | ✅ | ✅ (`strategy.create`) | n/a | no | ✅ | automated |
| Strategy edit | Inline editor (`strategy-editor-{id}`) | ✅ (`layer:foreground`) | ✅ (`strategy.edit`) | ✅ every position/risk/framework field | no (single step) | ✅ | automated + browser |
| Marketplace publish (Pattern/Strategy) | Modal (live Hub's own Share tab) | ✅ (`strategy-hub-publish-flow`, NEW) | ✅ (`marketplace.publish`, **fixed** - see below) | ✅ title/description/price/currency/previewCount | no | ✅ | automated + browser |
| Session create | Modal | ✅ (`layer:foreground`) | ✅ (`session.create`, pre-existing) | ✅ city/timeframe/instrument | no (single step) | ✅ | automated + browser |
| Session Entry / Scenario | Inline expand/collapse cards | ✅ (ambient, `layer:background` by design) | ✅ (`session.chartEntry.create`/`session.movementEntry.create`/`session.scenario.create`, pre-existing) | pre-existing (this pass added no new field-fill here - already covered by Journey B/F) | no | ✅ | pre-existing automated |
| Trade Calculator | Modal | ✅ (`layer:foreground`) | ✅ (`trade.calculator`, pre-existing) | ✅ direction/entryPrice/stopLoss/riskPercent | no (single screen) | ✅ | automated + browser |
| Trade Wizard ("Log a trade") | Modal, 5 real steps | ✅ (`layer:foreground`) | ✅ (`trade.wizard`, **NEW** - previously had no Action Registry entry at all) | ✅ steps 1-3's full field set | ✅ real `stepForPath`/`goToStep` lockstep | ✅ | automated + browser |
| Trade lifecycle (open/cancel/close/emotion-log) | Modals | ✅ | ✅ (pre-existing Journey F) | pre-existing | no | ✅ | pre-existing automated |
| Psychology Intake | Modal, 13 real steps | ✅ (`layer:foreground`) | ✅ (`psychology.intake.start`, **NEW** - previously only reachable via the Companion's own proactive nudge, never by name) | ✅ every `intakePaths` field (steps 2/3/4/6/7) | ✅ real `stepForPath`/`goToStep` lockstep, verified across 3 consecutive steps + a real manual "Previous" click | ✅ | automated + browser |
| Settings Trading Defaults | Persistent inline section | ✅ (`layer:background` - correctly does NOT compete with a modal) | ✅ (`settings.trading.update`, pre-existing) | ✅ all 3 rows, the representative persistent-surface case | no | ✅ | automated + browser |
| Dashboard / cross-cutting precedence | n/a | ✅ (`fallbackNextStep`, only when nothing is open) | n/a | n/a | n/a | ✅ (a real foreground surface always wins - verified by the `layer` precedence tests) | automated |
| Account | Inline editor (`account-profile-identity`/`-role`) | ✅ (already correct - empty/allowlisted registrations) | ✅ (pre-existing) | pre-existing (out of scope to expand this pass - already structurally correct) | no | ✅ | pre-existing automated |

**The confirmed bug fix**: `marketplace.publish` previously routed through the orphaned, pre-NAVRYA
legacy pages (`pattern-registry.js`/`strategy-education.js`) instead of the live Strategies Hub -
`panel-system.js`'s own `showCustom()` (what those legacy pages' `layer.show()` calls into) never
unmounted the previous React root, so the live Hub was left mounted-but-detached and the user saw
the wrong page. Fixed to open the live Hub's own Share tab / `PublishForm` (which already existed
and worked for a human click, just was never registered with the Process Registry) instead - see
`ARCHITECTURE.md`'s Journey H1 section and `tests/community-marketplace-messaging-actions.test.mjs`
for the regression guard that the legacy globals are never called again.

**The bug that did NOT reproduce**: the product brief's own headline claim - "saying 'create a
pattern' doesn't open the real Pattern UI" - was checked live in a real browser before touching any
code. `pattern.create` genuinely opened the real Pattern editor, instrument pre-filled, on the
first attempt. No fix was made to it.

## Not covered this pass (audited, honestly out of scope)

| Domain | Why |
|---|---|
| Community (post/comment draft flows) | User-approved scope excludes it; `community.post.create`/`community.comment.create` are audited as already-working Journey F actions but received no new surface/sync/animation work. |
| Marketplace `rate`/`messageSeller` | Same - audited, unchanged. Only `marketplace.publish`'s routing bug was in scope (a confirmed, adjacent, low-risk fix). |
| Messaging (`message.compose`/`message.reply`) | Audited, unchanged. |
| Account beyond existing surface-awareness | Already structurally correct (empty-allowlist context-only registrations) - no new field-fill work was needed to prove the shared architecture, so none was added. |

No expansion was made to `ai-user-memory.js`'s `getRelevantPsychologyContext()` or any other Mental
Health data surface beyond the pre-existing `intakePaths` allowlist and step metadata - Psychology
Intake's full sync uses exactly the same fields/paths a human filling the form by hand already
writes.

## Known gaps (real, found during this pass, not fixed - out of the "wire the missing submit"
mandate)

- `ExtremesStep` (Intake step 5)'s own visible fields (`largestWin`/`largestLoss`/
  `marginCallOrZeroedCount`) are real `numericPaths` but are not in the `mh-intake` registration's
  own `intakePaths` allowlist - nothing on that step can be Voice-filled today. Pre-existing scope
  limit, not introduced by this gate.
- Explain-mode's `companionContext` does not yet carry `ai-surface-context.js`'s step-aware detail
  into the model prompt - see `voice-ui-synchronization.md`'s own "Not done this pass" note.
- `session.chartEntry.create`/`session.movementEntry.create`/`session.scenario.create`/Scenario
  editor fields received no NEW magic-fill wiring this pass (they were already real, working,
  pre-existing Journey B/F flows - adding the animation there is a small, low-risk follow-up, not
  done here to keep this pass's diff scoped to the domains actually re-verified end-to-end).
