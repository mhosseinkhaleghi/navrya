# Action Coverage Matrix (Journey F)

A complete inventory of every user-editable workflow in the app, built by reading the actual
repository (not inferred from names or from the Journey F spec) - which Process Registry
registration exists today, whether it is also a startable Action Registry action, and why not
where it isn't yet. This is the baseline F1 (Pattern) and every later Journey F gate builds from.

**Baseline counts** (before any Journey F action is added): **34** real, reachable, user-editable
workflows found. **28** already have an `ai-process-registry.js` registration (can be filled once
a human has the UI open). **3** are also `ai-action-registry.js` actions (can be conversationally
*started*): `session.create`, `trade.calculator`, `navigate.to`. **6** editable workflows have no
Process Registry registration at all (listed below). One live, reachable workflow
(`mh-bias-checklist`) runs through legacy vanilla-DOM, not a NAVRYA React component.

**Journey F progress so far**: `pattern.create` (F1), `pattern.edit` (F2), `strategy.create` and
`strategy.edit` (F15) are now action-startable - see the updated Action Registry table and the
Pattern/Strategy edit rows below. `pattern.edit`/`strategy.edit` share a generalized
`ai-workflow-engine.js` capability: `start()` passes the very same turn's own extracted fields
through to `open()` as a second argument, so an action whose `open()` must first RESOLVE an
existing real entity by name (never guess - F53) can do that lookup before deciding what (if
anything) to open.

**F15 found and fixed two real, general bugs** (neither specific to Strategy - both equally affect
`pattern.create`/`pattern.edit`, fixed there too):
1. **A submit-grace-window race**: an action whose real entity already persists the instant
   `open()` creates/resolves it (`submit()` is already a no-op for all four of these actions) was
   still scheduling the same auto-submit-then-clear machinery `session.create`'s own real "time to
   persist now" moment uses. The moment the sole required field (often just `name`) became known,
   the workflow entered `pending-submit` and, after `SUBMIT_GRACE_MS`, cleared to `null`. A
   follow-up turn arriving a beat after that window found no workflow left to continue, fell back
   to fresh action-discovery, and lost the field. Fixed with a new, explicit opt-in action flag,
   `entityAlreadyPersisted: true` - such a workflow now just stays `collecting` for as long as the
   real target UI stays open (`pruneIfAbandoned()` already clears it once that closes).
2. **A stale-closure bug in both `StrategyDetailsTab`'s `set()` and `PatternDetailsTab`'s
   `patch()`**: the AI process registration effect runs once at mount and never re-runs, so it
   permanently captured whichever save-function existed at that render - but `strategy`/`pattern`
   is re-derived fresh from the store on every render (a genuinely different object each time), so
   a later AI-driven field write, called through the stale mount-time closure, silently clobbered
   any manual edit (or any other field change) made via a fresher render's own closure since mount.
   Concretely: AI sets `maxRisk=1%`, user manually edits it to `0.75%`, AI later sets
   `maxConcurrentTrades=2` -> the stale closure's own save re-wrote the whole record from its
   outdated snapshot, reverting `maxRisk` back to `1%`. Fixed with a ref kept current every render
   (the same pattern `chatDockView.jsx`'s own `submitRef` already uses), so the mount-time closure
   always reads/writes through the latest object regardless of which render's closure is invoked.

Verified via real browser testing that a genuinely multi-turn phrasing ("Edit a pattern." -> "Which
Pattern?" -> "The Order Block one.") still resolves correctly two turns later: the model itself
defers picking the action until it actually has a name (guided by the action's own description),
rather than the workflow engine needing to retry `open()` across turns. Also verified: cross-page
action discovery (Dashboard/Psychology -> Strategies), active-entity resolution surviving a
navigate-away-and-back by name (not a remembered id), zero stale `activeStrategyId` leaking between
two open-in-sequence Strategies, and voice/text continuity (a workflow started by voice, continued
by text, continued by voice again, stays the same single record).

## Section 0 — a finding that changes how this matrix must be read

The app runs two UI generations on every page at once: a legacy vanilla-JS system
(`pattern-registry.js`, `strategy-education.js`, `trade-ui.js`, `mental-health-continuous.js`,
...) and the current `navrya-src` React bundle. Every legacy file checks a
`window.TradeJournalNavryaXxx` hook first and only falls back to its own `register()` call when
that hook is absent - which in the live app is **never** (the React bundle always mounts). Several
legacy `register()` calls are therefore **dead code that never executes**, superseded by a live
React registration under a different process id:

| Dead (never executes) | Live replacement |
|---|---|
| `trade-ui.js`'s `'trade-emotion-log'` | `logEmotionModal.jsx`'s `'trade-emotion-log'` (same id, different implementation) |
| `trade-ui.js`'s `'trade-wizard'` | `tradeLogModal.jsx`'s `'trade-wizard'` (same id) |
| `mental-health-continuous.js`'s `'mh-pre-session-checkin'` | `preSessionCheckInModal.jsx`'s `'mh-pre-session-checkin'` (same id) |
| `mental-health-continuous.js`'s `'mh-post-trade-reflection'` | `postTradeReflectionModal.jsx`'s `'mh-post-trade-reflection'` (same id) |
| `pattern-registry.js`'s `'pattern-editor-{id}'` (`patternRegistryView.jsx`) | `strategiesHubView.jsx`'s `PatternDetailsTab`, same id pattern, different allowlist |
| `strategy-education.js`'s `'strategy-editor-{id}'` (`strategyEducationView.jsx`) | `strategiesHubView.jsx`'s `StrategyDetailsTab`, same id pattern, different allowlist |
| `sessionEntryCardsView.jsx`'s `'session-scenario-{id}'` | `liveSessionView.jsx`'s `'live-session-scenario-{id}'` (different id prefix) |
| `sessionEntryCardsView.jsx`'s `'session-entry-{id}'` | `liveSessionView.jsx`'s `'live-session-entry-{id}'` (different id prefix) |

**Consequence for this matrix and for every future Journey F action**: the process id and
allowlist that matter are always the ones on the **live React component**, confirmed reachable via
the real routing chain (`store.js` → `panel-system.js` → `TradeJournalNavryaCanvas` →
`canvasApp.jsx`). The dead legacy files are not listed as separate rows below.

**One exception, live but still legacy**: `mental-health-continuous.js`'s `openBiasChecklist()`
has no hook check - it always opens a hand-built `tj-wizard` DOM modal, and its registration
(`mh-bias-checklist`) is real and reachable from `psychologyView.jsx`. A future Journey F action
targeting it would be driving legacy DOM, not a `Modal`/NAVRYA component - noted per-row below.

## Existing Action Registry (startable today)

| id | domain | requiredFields | optionalFields | target process |
|---|---|---|---|---|
| `session.create` | sessions | city, timeframe | gregorian, jalali, loop, grace | `session-create` |
| `trade.calculator` | trades | direction, entryPrice, stopLoss, riskPercent, takeProfits | leverage, marginMode, accountBalance, riskAmount, linkedStrategyId, linkedPatternIds | `trade-calculator` |
| `navigate.to` | navigation | domainId | - | `navigate-to` (no fillable fields - exists only so the Workflow Engine has a liveness check) |
| `pattern.create` (F1) | patterns | name | description, completionThreshold | `pattern-editor-{id}` (dynamic - the real id only exists once open() creates the Pattern) |
| `pattern.edit` (F2) | patterns | patternName (resolution-only, never applied to the real UI) | name, description, completionThreshold | `pattern-editor-{id}` (dynamic - resolved by exact, case-insensitive name match; zero/ambiguous matches resolve nothing, never guessed) |
| `strategy.create` (F15) | strategies | name | full real Strategy allowlist | `strategy-editor-{id}` |
| `strategy.edit` (F15) | strategies | strategyName (resolution-only) | name + full real Strategy allowlist | `strategy-editor-{id}` |
| `session.chartEntry.create` (F19) | sessions | - | timeframe, market, date, note | `live-session-chart-entry` (fixed id, entityAlreadyPersisted - a real modal the user explicitly closes; **never auto-submits - the real form's own `file` requirement is not, and must never become, AI-fillable; see F19 notes below**) |
| `session.movementEntry.create` (F19) | sessions | - | note | `live-session-entry-{id}` (dynamic; deliberately NOT entityAlreadyPersisted - see F19 notes below) |
| `session.scenario.create` (F20) | sessions | title | description, evidence, problem, trigger, patternName (resolution-only, resolves to the real snapshot-preserving `scenario.pattern` shape) | `live-session-scenario-{id}` (dynamic; deliberately NOT entityAlreadyPersisted - see F19/F20 notes below; attaches to whichever real Entry is currently selected/open) |
| `session.scenario.edit` (F20) | sessions | scenarioTitle (resolution-only) | title, description, evidence, problem, trigger, patternName | `live-session-scenario-{id}` (dynamic, resolved by exact, case-insensitive title match against the currently active Session's own scenarios only - never guessed, never cross-Session) |

### F19/F20 notes - three real, structural findings, not design choices

**`entityAlreadyPersisted` is only correct when the real UI process is either a genuine modal
(the user must explicitly close it) or a multi-field record naturally filled over several turns
AND its own process id is not otherwise excluded from `activeProcess`.** Found via real browser
testing: `session.movementEntry.create` and `session.scenario.create`/`.edit` were all initially
built with this flag (matching Pattern/Strategy) and it broke action discovery entirely - "Create
a scenario called X" right after adding a movement entry got silently mis-routed into the
still-registered entry's own `note` field. Root causes, two distinct ones stacked together:
1. A `live-session-entry-{id}` registration reports itself open for as long as that Entry happens
   to be the one currently selected in the timeline (`liveSessionView.jsx` defaults `selId` to the
   first entry the instant any exist) - an ambient, passive state with no deliberate "stay focused
   here" gesture behind it, unlike a real modal. Fixed generally: `chat-dock-core.js`'s own
   `activeProcess` resolution now excludes `live-session-entry-` the same way it already excludes
   `live-session-scenario-` (see that file's own comment, originally added for Journey B's "start
   a Trade from this Scenario" discovery) - not a Session-specific patch, the same real, general
   mechanism generalized by its own actual reason (passive/ambient, not a deliberate focus
   gesture).
2. Because `live-session-scenario-` is *already*, and deliberately, excluded from `activeProcess`
   (for that same pre-existing Journey B reason), the workflow-continuation branch
   `entityAlreadyPersisted` exists to keep alive for can never actually fire for a Scenario - so
   keeping its workflow around only blocked *all* later action discovery for no benefit.
   `session.scenario.create`/`.edit` were changed to the normal auto-submit-then-clear behavior;
   a later edit turn goes through fresh re-discovery of `session.scenario.edit`, resolved by title
   from conversation history - the exact same real, already-proven mechanism `pattern.edit`/
   `strategy.edit` use for "the Pattern I don't yet have a name for yet".
   `session.movementEntry.create` also does not need the flag - it has only one real field worth
   filling (`note`), no natural "add more later" shape the way Pattern/Strategy/Scenario have.
   `session.chartEntry.create` keeps it correctly: `live-session-chart-entry` is a real modal, not
   excluded from `activeProcess`, so its own continuation branch works exactly like Pattern/
   Strategy's.

**A hedging action description can make the model decline to select an already-available action.**
`session.scenario.create`'s first description included "Only available while a Session AND a
specific Entry are both open - if the user has not selected/added an Entry yet, guide them to do
that first instead of guessing one." - found via real testing (`debugLastTurn()`) that even when
`available()` had already gated the action correctly (it genuinely was in the offered catalog,
with the real `entryId` already resolved), the model still declined to select it, replying
conversationally about needing an Entry instead. The gating logic was never the problem - the
model does not need to be told to re-verify a precondition the catalog itself already enforced.
Shortened to a plain, confident description with no hedging clause; re-verified fixed.

**A pending-submit workflow whose process is excluded from `activeProcess` strands the very next
turn in neither routing branch - a fourth structural finding, found via F21's own
active-session-context tests.** `session.scenario.create`/`.edit`/`session.movementEntry.create`
deliberately have no `entityAlreadyPersisted` (point 2 above), so once their one required field is
known they sit in a brief `pending-submit` grace window (`ai-workflow-engine.js`'s
`SUBMIT_GRACE_MS`) before clearing. `chat-dock-core.js`'s own `pruneIfAbandoned()` correctly never
touches a workflow in that status (it is about to legitimately complete) - but a workflow in that
state also still counts as non-null for the `!currentWorkflow` check gating fresh `availableActions`
discovery, and its process id (`live-session-entry-`/`live-session-scenario-`) is *always* excluded
from `activeProcess` (point 1 above), so the "continue this same workflow" branch
(`activeProcess.id === currentWorkflow.processId`) can structurally never match either. Any message
sent during that window fell through to neither branch, guaranteeing `action: null` no matter what
the user said - real symptom: "Create a scenario called X" followed a few seconds later by a
completely unrelated "Create a Strategy called Y" silently failed to create the Strategy, and the
same shape blocked a same-Scenario follow-up edit, a brand-new Session-switch, and Journey B's own
"open a Trade from this Scenario" cross-domain discovery. Fixed generally in `chat-dock-core.js`:
discovery is also allowed when the current workflow's process id matches one of the two excluded
prefixes AND its status is `pending-submit`/`submitting` - both conditions together mean the
workflow needs no further user input and can never be reached any other way, so treating it as
non-blocking costs nothing. Two smaller, compounding contributors found alongside this one, both
model-prompting issues rather than routing bugs: (a) `DOCK_STYLE_INSTRUCTION`'s pre-existing "never
claim a NAVRYA action occurred until the application confirms it" had no matching "a *past* turn's
action should be assumed to have already succeeded" counterpart, so the model treated its own prior
"I'll open a new Scenario..." reply as perpetually unconfirmed for the rest of the conversation once
routing *did* offer it a choice; (b) the `availableActions` branch's system prompt had no explicit
instruction against topic-recency bias, so a new message naming a clearly different action (e.g.
"Strategy" right after several Scenario-focused turns) was sometimes misclassified as continuing the
old topic even when the correct action was present in the offered catalog. Both were given small,
general clarifying clauses in `server/pattern-ai-server.mjs`'s system-prompt text (not new mechanism)
- see `tests/ai-dock-chat-quality.test.mjs`'s and `tests/chat-dock-core.test.mjs`'s new regression
tests for all three fixes together.

**Scenarios belong to Entries, not directly to Sessions** (`liveSessionView.jsx`'s own `addScenario(entry)`: `{ id, entryId: entry.id, title, ... }`). The real UI's own "Add scenario" control is only ever reachable from within an already-selected Entry's detail view. `session.scenario.create` therefore resolves the Entry to attach to via `activeEntryId()` (new, added to `ai-context-engine.js`, exact same "whichever `live-session-entry-{id}` process is currently open" pattern `activeScenarioId()` already established - `EntryDetailPanel`'s own comment already documents "only one is ever shown at a time" here, i.e. this is not a new assumption, just a previously-unused consequence of an existing, deliberate design) - if the Live Session workspace has no entries yet (nothing selected, `activeEntryId()` returns null), `session.scenario.create` cannot create anything and says so, exactly like "no active Session" in F5 - it does not invent an Entry to attach to.

**Chart Entry's real file requirement is a hard AI boundary, not an oversight**: `ChartEntryModal`'s own `submit()` blocks (`if (!file) { setError(...); return; }`) until a real image is attached - the existing registration's own allowlist (`note, timeframe, market, date`) already excludes the image path entirely, and `session.chartEntry.create` does not, and must not, add one. The action can only ever open the real modal and live-fill the non-image fields; the user must attach the screenshot by hand through the real UI, exactly as today.

**Pattern linking preserves the real snapshot shape**: `ScenarioEditor`'s own `handlePatternChange(patternId)` writes `scenario.pattern = { patternTagId, name, stages, completedStageIds, completionThreshold }`, not a bare id - `session.scenario.create`/`.edit`'s `patternName` resolution reuses this exact function (through the real registration's `applyValue`, never a second write path), so a Pattern later renamed or re-staged does not retroactively change what an already-created Scenario snapshot says.

**Probability is deliberately never AI-fillable.** `probabilityHistory` (seeded `[{value: 50, loggedAt}]` at creation, by the real UI itself) is not in the allowlist and is not added by this gate - F99's "never invent probability" rule has nothing to attach to today; if a future gate adds a real probability-adjustment control to the UI, it should go through this same resolve-then-apply pattern, never a value the model invents unprompted.

**Fate Entry/Fate Summary (session-closing) are deliberately out of scope for this gate** - they are a terminal, session-status-changing action (`sets session.status/closedAt`), materially different in consequence from adding an Entry/Scenario, and the user's own F19 spec's worked examples never exercise them. Left for a later, explicitly-scoped gate rather than folded in here.

## Process Registry inventory, by domain

Columns match F4's template: **Domain · Intent · Real UI surface · Process id · Allowlist · Open
mechanism · Submit/save mechanism · Action Registry today? · AI controllable? · Confirmation
required? · Reason if excluded.** "AI controllable?" here means *process-fillable* (a human opens
it, AI can help fill it) vs. *action-startable* (AI can open it from a plain sentence) - see
Section 5 of the Journey F spec; today only the three rows above are action-startable, every
other row below is process-fillable only.

### Sessions

| Workflow | Real UI | Process id | Allowlist | Open | Save | Action? | Confirm? |
|---|---|---|---|---|---|---|---|
| Session creation | `NewSessionDialog.jsx` | `session-create` | city, timeframe, gregorian, jalali, loop, grace | "New session" button | `sessionsAdapter.createSession()` | **YES** | normal |
| Session delete | `SessionLibrary` card | - (plain button) | - | trash icon | `TradeJournalWorkspace.remove(id)` | NO | `window.confirm()` already gates it |
| Live Session chart entry | `liveSessionView.jsx` `ChartEntryModal` | `live-session-chart-entry` | note, timeframe, market, date | "Add chart" | `session-workspace-logic.js` save | NO | normal |
| Live Session scenario | `liveSessionView.jsx` `ScenarioEditor` | `live-session-scenario-{id}` | title, description, evidence, problem, trigger, positionType, entryPrices, stopLoss, takeProfit | card expand | `saveAndOpen()` | NO | normal |
| Live Session scenario delete | same file | - | - | trash icon | `onDelete` | NO | **NO confirm() today** - see F25 |
| Live Session entry note | `liveSessionView.jsx` `EntryDetailPanel` | `live-session-entry-{id}` | note | select entry in timeline | `saveAndOpen()` | NO | normal |
| Live Session entry delete | same file | - | - | trash icon | `onDeleteEntry` | NO | **NO confirm() today** - see F25 |
| Session fate entry (closing) | `liveSessionView.jsx` `FateEntryModal` | `live-session-fate-entry` | note, timeframe, market | "Fate"/close-session | sets session.status/closedAt | NO | normal (terminal action, not deletion) |
| Session fate summary | `liveSessionView.jsx` `FateSummaryModal` | `live-session-fate-summary` | moveStrength, spike, note | follows fate entry | sets session.fateSummary | NO | normal |

### Patterns / Strategies (both live inside `strategiesHubView.jsx`)

| Workflow | Real UI | Process id | Allowlist | Open | Save | Action? | Confirm? |
|---|---|---|---|---|---|---|---|
| Pattern edit | `strategiesHubView.jsx` `PatternDetailsTab` | `pattern-editor-{id}` | name, description, completionThreshold **(stages/screenshots are still UI-only, not on the allowlist)** | ItemCard open / DetailView tabs / `pattern.edit` action (F2) | `PatternStore.save()` per field | **YES (F2)** | normal |
| Pattern delete | same file | - | - | trash icon | `window.confirm()` → `PatternStore.remove(id)` | NO | already confirmed |
| Pattern stage delete | same file | - | - | per-stage trash | `deleteStage()` | NO | **no confirm today** |
| Pattern screenshot remove | same file | - | - | per-shot remove | `removeShot()` | NO | **no confirm today** |
| Strategy edit | `strategiesHubView.jsx` `StrategyDetailsTab` | `strategy-editor-{id}` | name **(F15)**, positionManagement.{entryRules,stopLossRules,exitTargetRules,positionSizingRules,freeNotes}, riskManagement.{freeNotes,maxRiskPerTradePercent,dailyDrawdownLimitPercent,totalDrawdownLimitPercent,maxConcurrentTrades,maxProfitCapPerTrade}, overallFramework.description | same tabs / `strategy.create` and `strategy.edit` actions (F15) | `StrategyEducationStore.setPath()` per field | **YES (F15)** | normal |
| Strategy delete | same file | - | - | trash icon | `window.confirm()` → `StrategyEducationStore.remove(id)` | NO | already confirmed |
| Strategy active toggle | same file | - | - | toggle | `toggleActive()` | NO | not destructive |

**Gap found, not a Journey F omission**: `StrategyAttachment` upload/remove UI exists only in the
dead legacy `strategy-education.js` - the live `StrategyDetailsTab` has no attachment UI at all.
Nothing for Journey F to drive here until the live UI itself gains this capability.

### Trades

| Workflow | Real UI | Process id | Allowlist | Open | Save | Action? | Confirm? |
|---|---|---|---|---|---|---|---|
| Trade Calculator | `tradeCalculatorModal.jsx` | `trade-calculator` | direction, marginMode, entryPrice, stopLoss, accountBalance, riskPercent, riskAmount, leverage, feeType, feePercent, takeProfits, linkedStrategyId, linkedPatternIds, sourceSessionId, sourceScenarioId, pendingEmotionSignal, riskOverride | FAB / Dashboard / Live Session | `applyCalculatedToTrade()` → `tradeStore.save()` | **YES** | normal (Journey C guards riskPercent) |
| Trade Wizard ("Log Trade") | `tradeLogModal.jsx` | `trade-wizard` | direction, marginMode, entryPrice, stopLoss, riskPercent, riskAmount, leverage, positionSize, primaryTimeframe, chartNote, conceptTags | Calculator's "Log trade" | `tradeStore.save()` | NO | normal |
| Trade Details (view + delegate) | `tradeDetailsModal.jsx` | `trade-details-{id}` | **[] (empty - intentional)** | trade card | N/A - delegates to edit/close/delete | NO | N/A |
| Trade delete | same file | - | - | trash icon | `window.confirm()` → `tradeStore.remove(id)` | NO | already confirmed |
| Close position | `closePositionModal.jsx` | `trade-close-position` | exitPrice | Positions panel / Trade Details | `computeClose()` → `tradeStore.save(status:'closed')` | NO | normal - **F23's exact scenario** |
| Log emotion | `logEmotionModal.jsx` | `trade-emotion-log` | note (emotion/intensity/tags/stress are UI-only) | trade stage trigger | `tradeStore.addEmotion()` | NO | normal |
| Mark hunting trade open | `dashboardView.jsx` / `liveSessionView.jsx` | - (plain button) | - | Positions panel button | `tradeStore.updateStatus(id,'open')` | NO | **no confirm - low risk, reversible-ish** |
| Cancel hunting trade | same | - | - | Positions panel button | `tradeStore.updateStatus(id,'cancelled')` | NO | **no confirm today** |

### Psychology

| Workflow | Real UI | Process id | Allowlist | Open | Save | Action? | Confirm? |
|---|---|---|---|---|---|---|---|
| Pre-Session Check-in | `preSessionCheckInModal.jsx` | `mh-pre-session-checkin` | sleepQuality, currentStressLevel, significantPersonalEvent | gated before first session entry | `mh.addPreSessionCheckIn()` | NO | normal - **F58 applies: never fabricate the numeric ratings** |
| Post-Trade Reflection | `postTradeReflectionModal.jsx` | `mh-post-trade-reflection` | setupQualityRating, planAdherenceRating, emotionManagementRating, deviationReason, sentenceOfTheDay | auto-opens after a close | `mh.addPostTradeReflection()` | NO | normal - `sentenceOfTheDay` is safety-screened |
| Weekly Check-in | `weeklyCheckInModal.jsx` | `mh-weekly-checkin` | disciplineRating, biggestWin, biggestLesson | "Run check-in now" | `mh.addWeeklyCheckIn()` | NO | normal |
| Monthly Bias Checklist | `mental-health-continuous.js` (**legacy DOM, see Section 0**) | `mh-bias-checklist` | per-bias-type `.selfRating`/`.example` × 7 types | `psychologyView.jsx` "Run checklist" | `store.saveBiasChecklist()` | NO | normal, but implemented on non-React DOM |
| Mental Health Intake | `mentalHealthIntakeModal.jsx` | `mh-intake` | 12 dotted paths (demographics/financialContext/tradingHistory/motivation/firstBigLossReaction/transparencyMatrix) | first-run / Psychology menu | `store.save(intake.completed=true)` | NO | normal - **F59 applies** |

### Community / Marketplace / Messaging

| Workflow | Real UI | Process id | Allowlist | Open | Save | Action? | Confirm? |
|---|---|---|---|---|---|---|---|
| New feed post | `communityView.jsx` `NewPostDialog` | `community-new-post` | text | "New post" | `CommunityStore.createPost()` | NO | normal - **F26/F27 apply** |
| Post delete | - | - | - | - | **no delete UI wired** (store has `removePost()`, unused) | N/A | out of scope until UI exists |
| Comment | `communityView.jsx` `CommentsPanel` | `community-comment-{id}` | draft | comment box | `CommunityStore.createComment()` | NO | normal |
| Marketplace rating | `marketplaceView.jsx` `RatingsPanel` | `marketplace-rate-{id}` | ratingValue, reviewText | only if `!isSeller && unlocked` | `CommunityStore.rateListing()` | NO | eligibility already gated by real state, per F31 |
| Publish flow (Pattern/Strategy/Community) | `publishFlowModal.jsx` | `publish-flow` | title, description, priceAmount, priceCurrency, previewItemCount | Strategies Hub "Share" tab | `createListing()`/`updateListing()` | NO | normal, but **F29/F30 apply** (mock purchase pipeline - never claim a real payment) |
| Compose new message | `messagesView.jsx` `NewMessageDialog` | `messages-compose` | text (recipient is a picked object, deliberately not on the allowlist) | "New message" | `sendMessage()` after `openThreadWithUser()` | NO | normal - **F32 applies** (never guess a recipient) |
| Reply in thread | `messagesView.jsx` `ThreadPanel` | `messages-thread-reply` | draft | open thread | `CommunityStore.sendMessage()` | NO | normal |

### Account

| Workflow | Real UI | Process id | Allowlist | Open | Save | Action? | Confirm? |
|---|---|---|---|---|---|---|---|
| Profile identity | `accountProfileView.jsx` `IdentityTab` | `account-profile-identity` | displayName, email, phone, avatarDataUrl | Account page | `AccountProfileStore.updateProfile()` | NO | normal |
| Profile role | `accountProfileView.jsx` `RoleTab` | `account-profile-role` | role (trader/mentor/teacher) | Account page | `AccountProfileStore.updateProfile()` | NO | normal - **F33 explicit: no admin-role path here** |

### Settings

| Workflow | Real UI | Process id | Allowlist | Open | Save | Action? | Confirm? |
|---|---|---|---|---|---|---|---|
| AI panel builder | `settingsView.jsx` `AiPanelBuilderSection` | `settings-ai-panel-builder` | prompt | Settings page | draft only - "Add to board" separately calls `addCustomPanel()` | NO | normal |
| Region & language | `settingsView.jsx` `RegionLanguageSection` | `settings-region-language` | region.country, region.timezone, region.currency, region.weekStart (language + clock24 NOT on allowlist) | Settings page | `AppSettingsStore.saveSettings({region})` | NO | **F35 applies**: no AI-drivable language setter exists today (language changes via `store.setLanguage()` directly, outside the allowlist) |
| Trading defaults | `settingsView.jsx` `TradingDefaultsSection` | `settings-trading-defaults` | defaultRiskPercent, leverageCap, maxTradesPerSession | Settings page | `TradeStore.saveSettings()`, clamped to real min/max | NO | normal - **F34's exact scenario** |
| AI Assistant / provider+key | `aiAssistantView.jsx` | **NONE - deliberately** | - | AI Assistant page | `settingsStore.setKey()` | N/A | **F36/F37: never make this AI-fillable** |

## Workflows with no Process Registry registration (6)

1. **Mark hunting trade open / Cancel hunting trade** - plain buttons in `dashboardView.jsx`/`liveSessionView.jsx`, `tradeStore.updateStatus()`, no registration.
2. **Report abuse** (`reportFlow.jsx`) - a real, cross-cutting modal (posts/comments/listings/messages), `reason` textarea is plain React state, never registered. Per the original Journey D note (still valid): an AI-drafted abuse report would undermine it as a genuine user signal - **recommend leaving unregistered**, matching that precedent.
3. **Post delete** - no delete UI exists in the live Community view at all (store function unused).

## Cross-cutting notes for later gates

- **Strategy risk edit vs. Trade risk override are different events** (F18): the Strategy-editor row above writes `Strategy.riskManagement.maxRiskPerTradePercent` directly, via `strategy-editor-{id}`'s own allowlist - it is not routed through `ai-proactive-engine.js`'s `strategy-risk-limit` rule at all (that rule only ever fires on a *Trade's* `riskPercent` exceeding its *linked* Strategy's cap). A future `strategy.edit` action must target this process, never the Trade Calculator's.
- **Entity resolution for "this Pattern"/"that Strategy"** (F53) has a real, already-built answer for context: `ai-context-engine.js`'s `snapshot().activeEntities` (Journey D) already resolves `activePatternId`/`activeStrategyId` from whichever `pattern-editor-{id}`/`strategy-editor-{id}` process is currently open, the same mechanism `trade.calculator`'s `linkedStrategyId` normalization already reuses.
- **Destructive-action confirmation is inconsistent today** (F24/F25/F86): Session/Pattern/Strategy/Trade deletes already have a `window.confirm()`; Live Session scenario/entry deletes and stage/screenshot deletes do not. Any Journey F action wrapping one of the *unconfirmed* deletes needs its own explicit confirmation step (Journey C's `CONFIRM_OVERRIDE`-style pattern, or a dedicated new one) rather than assuming the real UI already gates it.
