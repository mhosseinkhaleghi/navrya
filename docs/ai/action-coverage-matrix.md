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

**Journey F progress so far**: `pattern.create` (F1, first slice) and `pattern.edit` (F2, second
slice) are now action-startable - see the updated Action Registry table and Pattern-edit row
below. `pattern.edit` introduced a new, generalized `ai-workflow-engine.js` capability: `start()`
now passes the very same turn's own extracted fields through to `open()` as a second argument, so
an action whose `open()` must first RESOLVE an existing real entity by name (never guess - F53)
can do that lookup before deciding what (if anything) to open. Verified via real browser testing
that a genuinely multi-turn phrasing ("Edit a pattern." -> "Which Pattern?" -> "The Order Block
one.") still resolves correctly two turns later: the model itself defers picking the action until
it actually has a name (guided by the action's own description), rather than the workflow engine
needing to retry `open()` across turns.

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
| Strategy edit | `strategiesHubView.jsx` `StrategyDetailsTab` | `strategy-editor-{id}` | positionManagement.{entryRules,stopLossRules,exitTargetRules,positionSizingRules,freeNotes}, riskManagement.{freeNotes,maxRiskPerTradePercent,dailyDrawdownLimitPercent,totalDrawdownLimitPercent,maxConcurrentTrades,maxProfitCapPerTrade}, overallFramework.description | same tabs | `StrategyEducationStore.setPath()` per field | NO | normal |
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
