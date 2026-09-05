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

**Voice coverage update**: Weekly Check-In, Post-Trade Reflection, Mood, Routine, Therapist
review, and Analysis Profile creation/editing are action-startable through their existing React
surfaces. Their fields use the same Process Registry apply path as every other action. For any
stepped registration, Workflow Engine now prepares the next field's declared real step and waits
for a rendered frame before the reply can reach chat or Voice TTS. Crypto invoices and subscription
purchase remain intentionally outside both registries.

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
| `session.create` | sessions | city, timeframe, instrument | gregorian, jalali, loop, grace, accountId | `session-create` (instrument resolved strictly against the user's own Instrument Catalog - never guessed) |
| `trade.calculator` | trades | direction, entryPrice, stopLoss, riskPercent, takeProfits, instrument | leverage, marginMode, accountBalance, riskAmount, linkedStrategyId, linkedPatternIds, accountId | `trade-calculator` (instrument is prefilled-then-implicitly-satisfied when a source Session already supplies one; otherwise resolved strictly against the catalog) |
| `navigate.to` | navigation | domainId | - | `navigate-to` (no fillable fields - exists only so the Workflow Engine has a liveness check) |
| `pattern.create` (F1) | patterns | instruments | name, description, completionThreshold | `pattern-editor-{id}` (dynamic - open() resolves `instruments` against the catalog on the SAME turn and creates nothing, resolving null, until at least one resolves; the real id only exists once open() creates the Pattern) |
| `pattern.edit` (F2) | patterns | patternName (resolution-only, never applied to the real UI) | name, description, completionThreshold, instruments (resolved strictly against the catalog) | `pattern-editor-{id}` (dynamic - resolved by exact, case-insensitive name match; zero/ambiguous matches resolve nothing, never guessed) |
| `strategy.create` (F15) | strategies | name | full real Strategy allowlist | `strategy-editor-{id}` |
| `strategy.edit` (F15) | strategies | strategyName (resolution-only) | name + full real Strategy allowlist | `strategy-editor-{id}` |
| `psychology.weeklyCheckIn.fill` | psychology | disciplineRating, biggestWin, biggestLesson | - | `mh-weekly-checkin` (opens `openWeeklyCheckIn()` and submits through its existing save handler) |
| `psychology.postTradeReflection.fill` | psychology | setupQualityRating, planAdherenceRating, emotionManagementRating, deviationReason, sentenceOfTheDay | tradeReference (resolution-only) | `mh-post-trade-reflection` (opens only an active or explicitly identified recent closed Trade via `openPostTradeReflection(trade)`, never guesses) |
| `psychology.mood.log` | psychology | mood | sleepQuality, somethingToProveToday, significantPersonalEvent | `psychology-mood-log` (the real pre-session mood flow) |
| `psychology.routine.create` / `.edit` | psychology | template, name, days / - | real routine-rule toggles | `psychology-routine-editor` (the existing builder; edit opens only the current active Routine) |
| `psychology.therapist.review` | psychology | - | queueView | `psychology-therapist-review` (view filter only; individual/bulk approve and reject remain human-click-only) |
| `profile.analysis.create` | strategies | primaryStyleId, focusIds, name | secondaryStyleIds, customMethodNotes | `analysis-profile-editor` (existing two-step onboarding) |
| `profile.analysis.edit` | strategies | profileName (resolution-only) | primaryStyleId, focusIds, name, secondaryStyleIds, customMethodNotes | `analysis-profile-editor` (exact, case-insensitive name resolution; zero/ambiguous matches do not open) |
| `session.chartEntry.create` (F19) | sessions | - | timeframe, market, date, note | `live-session-chart-entry` (fixed id, entityAlreadyPersisted - a real modal the user explicitly closes; **never auto-submits - the real form's own `file` requirement is not, and must never become, AI-fillable; see F19 notes below**) |
| `session.movementEntry.create` (F19) | sessions | - | note | `live-session-entry-{id}` (dynamic; deliberately NOT entityAlreadyPersisted - see F19 notes below) |
| `session.analysis.run` | sessions | - | - | `session-analysis-run` (fixed id via the default `processIdFor()` mapping; entityAlreadyPersisted - the real AI Analysis result modal stays open until explicitly closed). Runs the real `POST /api/sessions/analyze` call (`session-analysis-client.js`'s `analyzeSession()`, the exact same one the in-app "AI analysis" button uses - never a second request-building path) against the Session's latest chart entry with an image; `submit()` awaits the real result via `liveSessionView.jsx`'s `runAiAnalysis()` hub method. Once a result lands (from this action OR any of the 3 pre-existing manual triggers alike), `liveSessionView.jsx` dispatches `tradejournal:ai-analysis-ready` with the result's own `thesis.headline`; `chatDockView.jsx` speaks it through the existing PlaybackController queue only when Voice Mode is genuinely connected - no new LLM call, text mode never sees the tag-free headline spoken aloud at all. |
| `session.scenario.create` (F20) | sessions | title | description, evidence, problem, trigger, patternName (resolution-only, resolves to the real snapshot-preserving `scenario.pattern` shape) | `live-session-scenario-{id}` (dynamic; deliberately NOT entityAlreadyPersisted - see F19/F20 notes below; attaches to whichever real Entry is currently selected/open) |
| `session.scenario.edit` (F20) | sessions | scenarioTitle (resolution-only) | title, description, evidence, problem, trigger, patternName | `live-session-scenario-{id}` (dynamic, resolved by exact, case-insensitive title match against the currently active Session's own scenarios only - never guessed, never cross-Session) |
| `trade.open` (F22) | trades | - | - | `trade-details-{id}` (dynamic; the mutation itself happens synchronously in `open()`, the exact same `updateStatus()` call the real "Mark Open" button makes - no separate submit step) |
| `trade.cancel` (F22) | trades | confirm (CONSEQUENTIAL - never inferred, only ever set true from an explicit later confirmation) | - | `trade-details-{id}` (dynamic; `open()` only shows the Trade - the real cancellation happens in `submit()`, gated on confirm) |
| `trade.close` (F23) | trades | exitPrice | - | `trade-close-position` (fixed id; real Close Position modal, real `computeClose()` P&L math - deliberately NOT entityAlreadyPersisted, see F22/F23 notes below) |
| `trade.emotion.log` (F22) | trades | - | note | `trade-emotion-log` (fixed id; the real form's own AI allowlist is note-only) |
| `community.post.create` (F26) | community | publish (PUBLIC_MUTATION gate - never inferred from "write"/"draft"/"compose", only an explicit publish intent) | text | `community-new-post` (fixed id; real composer, real `createPost()` REST call - no separate draft-then-publish step exists in the real product, so the gate lives entirely in this action's own required field) |
| `community.comment.create` (F26) | community | send (PUBLIC_MUTATION gate) | draft | `community-comment-{id}` (dynamic; resolved from whichever post's comment panel is currently expanded, same "most recently touched wins" convention as Scenario cards) |
| `marketplace.publish` (F27-31) | marketplace | confirmPublish (PUBLIC_MUTATION gate) | title, description, priceAmount, priceCurrency, previewItemCount | `publish-flow` (fixed id; real publish/edit modal shared by Pattern and Strategy - performance data (`successRatePercent`/`sampleSize`) is computed by the real caller and passed in as a fixed prop, never typed into the form or AI-fillable at all) |
| `marketplace.rate` (F27-31) | marketplace | ratingValue | reviewText | `marketplace-rate-{id}` (dynamic; the registration's own `isOpen: () => !isSeller && unlocked` is the real eligibility gate - NAVRYA, not the model, decides whether rating is even offered) |
| `marketplace.messageSeller` (F27-31) | marketplace | send (OUTBOUND_MESSAGE gate) | text | resolves the real seller thread via `openThread(listingId)` (the same real call the "Message Seller" button makes), then behaves like `message.reply` from there |
| `message.compose` (F32) | messaging | send (OUTBOUND_MESSAGE gate) | recipientName, text | `messages-compose` (fixed id; recipientName resolves via the real `/api/users/search` the UI's own autocomplete already uses - never a raw guessed id) |
| `message.reply` (F32) | messaging | send (OUTBOUND_MESSAGE gate) | draft | `messages-thread-reply` (fixed id; only ever targets the currently active/open conversation thread) |
| `profile.edit` (F33) | account | - | displayName, email, phone | `account-profile-identity` (fixed id; avatarDataUrl deliberately never AI-fillable - F33 section 8, the model cannot supply a real picked file) |
| `profile.role.update` (F33) | account | role (trader/mentor/teacher only - real registration independently rejects anything else) | - | `account-profile-role` (fixed id; no admin/authorization role exists as an option) |
| `settings.trading.update` (F34) | settings | - | defaultRiskPercent, leverageCap, maxTradesPerSession | `settings-trading-defaults` (fixed id; entityAlreadyPersisted - every field applies+persists immediately, clamped to real min/max, no separate Save) |
| `settings.language.update` (F35) | settings | - | language, region.country, region.timezone, region.currency, region.weekStart | `settings-region-language` (fixed id; entityAlreadyPersisted; `language` only from an explicit app-language request, never inferred from the language spoken - F35 section 16) |
| `settings.ai.update` (F36) | settings | - | provider, model, voice | `ai-assistant-engine` (fixed id, new registration; entityAlreadyPersisted; API key/"remember key"/budget are never wired into `applyValue` at all, not merely excluded from the allowlist) |
| `pattern.delete` (F37) | patterns | confirm (destructive - never inferred) | patternName (resolution-only) | `pattern-editor-{id}` (dynamic; reused from pattern.edit; `submit()` re-verifies this exact registration is still open before calling `PatternStore.remove()` directly - the real UI's own `window.confirm()` cannot be driven by chat) |
| `strategy.delete` (F37) | strategies | confirm (destructive) | strategyName (resolution-only) | `strategy-editor-{id}` (dynamic; same shape as pattern.delete; real cascade behavior - `orphanLinkedTrades()` - is preserved because `submit()` calls the real store's own `remove()`, never reimplemented) |
| `session.delete` (F37) | sessions | confirm (destructive) | - | `session-delete-confirm` (new, fixed, synthetic id - registered by `open()` itself as a real, always-open process, purely so `ai-workflow-engine.js`'s own `scheduleSubmit()` liveness check has something real to find; only available while a real Session is active; `submit()` re-verifies `getActiveSessionId()` still matches before calling `Workspace.remove()`) |
| `scenario.delete` (F37) | sessions | confirmDelete (destructive) | - | `live-session-scenario-{id}` (dynamic; extends the existing F19/F20 registration with a new `submit()` calling the real, previously-unconfirmed `deleteScenario()` - the real delete icon had no confirmation of its own) |
| `entry.delete` (F37) | sessions | confirmDelete (destructive) | - | `live-session-entry-{id}` (dynamic; same shape as scenario.delete, extending the real, previously-unconfirmed `deleteEntry()`) |
| `trade.delete` (F37) | trades | confirm (destructive) | - | `trade-details-{id}` (dynamic; distinct from trade.cancel/trade.close - removes the record entirely, `submit()` re-verifies this exact registration is still open before calling `TradeStore.remove()` directly) |

### F37 notes - four real bugs found via real-browser testing, none of them design flaws in the confirmation architecture itself

Full writeup in `docs/ai/action-safety.md`; summarized here for this table's own audit trail.

1. **An explicit `confirm:false` silently counted as "known"** (`ai-workflow-engine.js`'s
   `missingFields()` only checks `undefined`/`null`/`''`, not falsy-ness) - self-clearing the
   workflow with nothing confirmed, so a later genuine "Yes." fell through to fresh re-discovery
   against whatever was then active. Fixed with `normalizeGateField()`, applied to all thirteen
   gate-field actions across both files (six new destructive + six pre-existing F26-32 + trade.cancel).
2. **`session-delete-confirm`'s own registration is permanently open** (a synthetic, non-DOM-backed
   id, registered once with `isOpen: () => true` so `scheduleSubmit()`'s own liveness check has
   something real to find) and was never excluded from `activeProcess` resolution - would silently
   block ALL future action discovery for the rest of the page load after even one `session.delete`
   flow, the same bug class already documented for `settings-trading-defaults`/`ai-assistant-engine`
   in F33-36. Fixed by adding it to `chat-dock-core.js`'s existing unconditional-exclusion list.
3. **`pattern-editor-{id}`/`strategy-editor-{id}`'s own real allowlists never gained the synthetic
   `confirm` field** the same way `community-new-post`/`publish-flow`/... already did for their own
   gate fields in F26-32. Every English confirm phrase happened to be intercepted by the
   deterministic gate fast-path (`chat-dock-core.js`) before ever reaching the network path where
   this actually mattered, masking it entirely - found via real-browser FA/AR/ES testing (that
   classifier only recognizes English and a narrow set of Persian phrases), where every non-fast-
   path confirm turn silently deleted nothing. Fixed by extending both allowlists.
4. **`ScenarioEditor`'s `live-session-scenario-{id}` registration had no `mountedRef`** - `isOpen()`
   tracked only the live `open` prop, correct until `scenario.delete` made a real unmount (via
   actual deletion) possible for the first time; the stale, last-registered closure (`open` baked in
   as `true`) then permanently outranked its own still-open parent Entry in `activeOpenProcess()`,
   silently making `entry.delete` permanently unavailable for that Entry - found via real-browser
   testing of `scenario.delete` immediately followed by `entry.delete` on the same Entry (an
   isolated `entry.delete` test with no Scenario in the mix passed even before this fix, which is
   what made the actual trigger condition traceable). Fixed with a real `mountedRef` guard.

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

### F22/F23/F24 notes - Trade lifecycle

**Real Trade lifecycle, as it actually exists (not invented for this gate)**: `dashboardView.jsx`'s
own Positions panel comment explains the real design intent precisely - "A hunting trade was never
actually opened - it has no entry fill to close, only a plan to either activate (open) or abandon
(cancel)." Hunting trades show **Mark Open**/**Cancel Trade** buttons (`tradeStore.updateStatus()`,
direct, no confirmation dialog); Open trades show **Log Emotion**/**Close Position** buttons
(`tradeUi.openEmotion()`/`tradeUi.closeTrade()`). `tradeDetailsModal.jsx`'s own `canClose` still
includes `'hunting'` - a genuine, pre-existing inconsistency between the two real UI surfaces, not
introduced by this gate and not fixed here (out of scope); `trade.close`'s own `available()` gate
follows the dashboard's more carefully-reasoned, more recent behavior (`status === 'open'` only).

**`entityAlreadyPersisted` was initially misapplied to `trade.close`/`trade.emotion.log`, the
mirror image of the F19/F20 finding.** Both were first built with the flag (pattern-matched too
hastily from "real modal" -> "entityAlreadyPersisted", the same shorthand that was correct for
Pattern/Strategy/Chart Entry) - found via real browser testing: the exit price visibly filled but
the Trade never actually closed, because `entityAlreadyPersisted: true` skips the workflow
engine's own submit-scheduling entirely (`ai-workflow-engine.js`: `if (action.entityAlreadyPersisted)
current.status = 'collecting'; else scheduleSubmit(...)`). That is correct for Pattern/Strategy/
Chart Entry because their own "submit" is already a no-op - every field write is already a
complete, individually-persisted mutation, with nothing left to finalize. It is wrong for
`trade.close`/`trade.emotion.log`: their real submit() functions perform the actual persisting
write (closePositionModal.jsx's own `tradeStore.save(next)`, complete with real P&L), and neither
`trade-close-position` nor `trade-emotion-log` is excluded from `activeProcess` (both have real,
non-empty allowlists) - so, unlike Scenario/Entry, the normal continuation branch already reaches
them correctly. Removed the flag from both; they now use the same ordinary
auto-submit-once-complete shape `session.create`/`trade.calculator` already established.

**A second, genuinely new instance of the F21 pending-submit routing gap, this time in
`'collecting'` status, not just the post-collection grace window.** `trade.cancel` deliberately
requires a `confirm` field that only ever arrives on a separate, later turn ("Cancel this trade."
-> "are you sure?" -> "Yes, cancel it.") - by design, since this is the confirmation seam itself
(see below). Its process (`trade-details-{id}`) is excluded from `activeProcess` (empty allowlist,
the same general rule that already excludes Scenario/Entry cards) - found via real browser testing
that the *first* confirmation turn correctly asked "are you sure?", but the *second* ("Yes, cancel
it.") produced `action: null` and never actually cancelled anything. The F21 fix only bypassed this
dead branch during the brief `pending-submit`/`submitting` grace window; a workflow still
`'collecting'` (never entering a grace window at all, since its required field is still missing)
hit the identical structural trap. Generalized `chat-dock-core.js`'s own exclusion to apply in
*any* status, not just the grace window, and added `trade-details-` to the excluded-prefix list.
Verified safe for every process this now covers: Scenario/Entry's own records are already created
synchronously in `open()` (documented above), and `trade.cancel`'s own `open()` never mutates
anything at all - only `submit()`, gated on `confirm`, does - so a fresh re-discovery re-running
`open()` a second time is always harmless.

**Cancel confirmation is a required `confirm` field, not a `window.confirm()` dialog.** The real
Hunting-Cancel buttons (`dashboardView.jsx`, `liveSessionView.jsx` x2) have no confirmation
dialog today, unlike every destructive delete elsewhere in this app. Retrofitting
`window.confirm()` onto three existing human-facing buttons was judged out of this gate's own
scope (it is about the new AI action, not auditing/changing existing human UI elsewhere); instead
`trade.cancel` requires an explicit `confirm` field the model may only set `true` once the user has
explicitly confirmed - `open()` only shows the real Trade (Trade Details), the actual
`updateStatus(id, 'cancelled')` call happens exclusively in `submit()`, gated on `confirm === true`.
This is the smallest deterministic seam that does not bypass the normal lifecycle: the real
`updateStatus()` call is unchanged, only reachable later and only once confirmed.

**Close Trade's own real submit() needed the same stale-closure fix as `ScenarioEditor`, found
proactively this time (before, not after, a real-browser regression).** `closePositionModal.jsx`'s
`submit()` closes over `exitInput` state; its AI registration's `useEffect` has an empty deps
array (runs once per mount). Exposing `submit` directly in that registration would have frozen the
FIRST render's `exitInput` (`''`) forever, exactly the `ScenarioEditor` bug from the F19-21
closure gate - an AI-filled exit price would always fail validation silently. Fixed with the same
`submitRef` pattern (updated every render, read inside the once-only effect) before this bug could
ever reach a real browser. `logEmotionModal.jsx` got the identical proactive fix for the same
reason.

**P&L, commission, and outcome are always `computeClose()`'s real math, never the model's.** The
model's only real fields are `exitPrice` (`trade.close`) and `note` (`trade.emotion.log`) - there
is no code path by which either action could report a P&L number itself; `resultContext`/the
reply text can only ever describe what `closePositionModal.jsx`'s own `computeClose()` already
wrote to the real Trade record.

**Active Trade resolution is intentionally narrower than Session/Scenario/Entry resolution.**
`resolveActiveTrade()` only reads `context.activeEntities.tradeId` (itself only ever resolved from
a real, currently-open `trade-details-{id}` Trade Details view) - no "uniquely resolvable visible
Trade" auto-selection among several Hunting/Open trades on the dashboard was implemented. This is
a deliberate scope decision, not an oversight: guessing which of several *visible-but-not-opened*
trades "this trade" refers to is exactly the class of guess F5/F53 already forbid for
Session/Scenario/Pattern/Strategy; extending resolution to include it would need its own
disambiguation design (matching against direction/entry price, or asking when >1 exists) that this
gate deliberately left for later rather than risk a wrong-Trade mutation. Zero Trades open ->
`available()` is false for every lifecycle action -> ASK/GUIDE-only, matching F5's "no active
Session, no guessing" precedent exactly.

**`trade.open` vs `trade.calculator` is resolved entirely by aliases/description, cross-referenced
in both directions** - `trade.open`'s own description explicitly distinguishes itself from
"planning a brand-new Trade", and `trade.calculator`'s own description was extended with one
sentence naming `trade.open` as the different, existing-Trade action. No code-level heuristic
inspects the sentence itself; this mirrors exactly how `session.scenario.create` vs
`session.scenario.edit` are already disambiguated. Verified via real browser testing (not just
inspection): "Open a trade for me." with a Hunting Trade visibly selected correctly triggers
`trade.calculator`, not `trade.open`, and leaves the Hunting Trade's status untouched.

**Post-trade reflection needs no new code at all.** `closePositionModal.jsx`'s own `submit()`
already calls `TradeJournalMentalHealthContinuous.onTradeClosed(saved)` unconditionally after every
successful close; reusing the real modal's real `submit()` (via the registry) means this real,
existing behavior fires automatically for an AI-driven close exactly as it does for a human-driven
one, with zero additional wiring.

### F26-F32 notes - Community/Marketplace/Messaging (external side effects)

**Side-effect classification** (deterministic, never model-decided): `LOCAL_DRAFT` (opening a
composer, filling a field - nothing external happens) / `PUBLIC_MUTATION` (`community.post.create`,
`community.comment.create`, `marketplace.publish`) / `OUTBOUND_MESSAGE`
(`message.compose`/`message.reply`/`marketplace.messageSeller`). Marketplace `rateListing`,
`purchaseListing` are also real REST calls but are gated entirely by the real UI's own eligibility
checks (`isOpen: () => !isSeller && unlocked` for rating; no AI purchase action was built at all -
see below), not by a chat-level classification.

**None of Community Post, Comment, or Marketplace Publish has a real draft-then-publish two-step in
the product today** - every one of `NewPostDialog`/`CommentsPanel`/`PublishFlowModal`'s own real
submit button performs the actual REST call immediately (`createPost`/`createComment`/
`createListing`/`updateListing`). There is no server-side "draft" status to save into and finish
later. This makes the classic "requiredFields all known -> auto-submit" shape (used successfully by
every private-mutation action so far) actively wrong here: filling `text` would auto-publish the
instant it's known. Every one of these actions instead has an explicit boolean gate as a required
field (`publish`/`send`/`confirmPublish`) that the model may only extract from a message expressing
genuine publish/send intent ("post this", "publish it", "send it") - never from
"write"/"draft"/"compose"/"create a post saying X" alone, which only ever fills the visible
composer. This is the same `confirm`-field seam `trade.cancel` already established, generalized
from "consequential" to "external/public" as the reason it's needed.

**No Marketplace listing-creation UI exists inside `marketplaceView.jsx` itself.** The real publish
flow (`publishFlowModal.jsx`'s `openPublishFlow()`) is triggered from inside the Pattern/Strategy
hub's own "Sharing" tab (`patternRegistryView.jsx`'s `PatternSharing`/`strategyEducationView.jsx`'s
`StrategySharing`), where `evidence`/`buildContent` are constructed from the real, live Pattern/
Strategy record - never reconstructable from chat history. `marketplace.publish`'s `open()`
therefore: resolves the active Pattern or Strategy (new `activePatternId()`/`activeStrategyId()`
context resolvers, mirroring `activeTradeId()`), navigates to that entity's own Sharing tab, and
calls a new small window hook (`TradeJournalNavryaPatternSharingHub`/`...StrategySharingHub`,
mirroring every other `TradeJournalNavryaXxxHub` in this codebase) exposing the real, already-built
`openFlow()` - never reconstructing `evidence`/`buildContent` itself.

**Performance data cannot be fabricated by construction, not just by prompt instruction.**
`PublishFlowModal`'s own allowlist (`title`, `description`, `priceAmount`, `priceCurrency`,
`previewItemCount`) does not include `successRatePercent`/`sampleSize`/`evidenceAsOf` at all - these
are computed by the real caller (`store.detectionStats()`/`store.scenarioReport()`) and passed in as
a fixed `evidence` prop, the exact same structural protection `trade.emotion.log`'s stress/focus
fields already established for F22.

**Mock purchase is real and already-honest**: `BuyBox`'s own `Notice` renders `i18n.t('mockBadge')`
unconditionally next to every Buy button - the real product itself already discloses this is not a
real payment flow. No AI purchase action was added in this gate (not requested, and F16's "the AI
must never claim payment completed" is trivially satisfied by not building a path that could say
so); the Knowledge Base's own description of Marketplace purchase should be checked against this
same honesty if it is ever surfaced to the model, but no existing text was found claiming otherwise.

**Recipient resolution mirrors `trade.calculator`'s own name-then-resolve pattern.**
`RecipientPicker`'s real autocomplete (`GET /api/users/search`) is the only path to a valid
recipient in the real UI - free text was never an option even for a human. `message.compose`
extends `messages-compose`'s registration with a new `recipientName` field, resolved through that
same real search endpoint (exact match preferred, ask when zero or ambiguous - F53), never a raw
guessed user id.

**`marketplace.messageSeller` reuses `openThread(listingId)`, the exact real call the "Message
Seller" button already makes** (`MarketplaceDetail`'s own `message()` function, exposed via a new
`TradeJournalNavryaMessageSeller` window hook) - not `openThreadWithUser`, which is for an arbitrary
named recipient (`message.compose`'s own path). This is a structural, not a heuristic, distinction:
a listing-originated conversation and an arbitrary new one are two different real store calls.

**Injection boundary is unchanged, not newly built.** Community post/comment bodies, listing
descriptions, and message content all flow into the model (if at all) only through Journey D's
existing `ai-context-builder.js` PRODUCT KNOWLEDGE/LIVE STATE/USER DATA framing, which already
treats stored records as inert data the model must never follow as instructions (see
`server/pattern-ai-server.mjs`'s own system-prompt clause on this, already shipped, unchanged here).
No new prompt-injection surface was introduced - see the new regression tests exercising this
exactly with Community/Marketplace/Messaging content specifically.

**Real-browser testing found and fixed four bugs before this gate could pass:**

1. **`ensureUser()`'s permanent auth-failure cache** (`dev-user-switcher.js`, pre-existing, not
   introduced here): `account-profile-store.js`'s own `checkSellerRatings()` calls
   `communityStore.myListings()` on every page boot (`setTimeout(fn, 0)`), before any login has a
   chance to complete - `ensureUser()`'s `pending` promise, once set, is never invalidated on a
   later successful login, permanently breaking Community/Marketplace/Messaging for the rest of
   that page load. Not a Journey F code change (out of scope to fix without being asked) - worked
   around for testing only by seeding a real, freshly-registered token into `localStorage` via
   `page.addInitScript()` **before** navigation, beating the same-tick check.
2. **Missing synthetic gate fields on the real DOM registrations**: `community-new-post`,
   `community-comment-{id}`, `publish-flow`, `messages-compose`, and `messages-thread-reply`'s
   `publish`/`send`/`confirmPublish` requiredFields exist only at the *action* level - none of
   them were in the matching *real registration's* own `allowlist`. A workflow continuing through
   an already-open one of these processes is served `activeProcess.allowlist` (not the action's
   `requiredFields`) as its schema, so the model had no path to ever express the confirmation on a
   follow-up turn ("Publish it." kept replying "I can't do that from chat"). Fixed by extending
   each real registration's allowlist with the matching synthetic field (a no-op for
   `applyValue`), the same pattern `recipientName` already established for `messages-compose`.
3. **Passively-open Pattern/Strategy/thread/comment/rating views blocked all-new-action discovery**
   (`chat-dock-core.js`): `pattern-editor-{id}`/`strategy-editor-{id}`/`messages-thread-reply`/
   `community-comment-{id}`/`marketplace-rate-{id}` are open the entire time an unrelated page
   state says so (a Pattern tab showing, a thread open, a comment panel expanded, an eligible
   listing's rating form rendered), not because of a deliberate "fill this out" gesture - but
   unlike `trade-details-{id}`, they carry a real, non-empty allowlist, so the existing
   empty-allowlist exclusion never applied. With a Pattern's Details tab simply open (no
   pattern-editing workflow in flight), "Publish this pattern to Marketplace." never reached
   action-discovery at all; the identical failure reproduced for `message.reply` with a thread
   simply open. Fixed by nulling `activeProcess` for these ids too, unless a workflow is already
   genuinely continuing through that exact process (verified via
   `currentWorkflow.processId === activeProcess.id`) - `pattern.edit`'s own live field-continuation
   is unaffected. Regression-tested in `tests/chat-dock-core.test.mjs`.
4. **`marketplace.publish`'s `open()` never actually reached the Sharing tab**: the Pattern/Strategy
   Sharing hub (`TradeJournalNavryaPatternSharingHub`/`...StrategySharingHub`) only mounts while
   the real Sharing sub-tab is showing - and `resolveActivePatternId`/`resolveActiveStrategyId`
   only resolve while the user is on a *different* tab (bug 3, above). `open()` now navigates to
   the Sharing tab itself first (`patternRegistryView.jsx`'s own `navigateProfile(id, 'sharing')`/
   `strategyEducationView.jsx`'s `TradeJournalStrategyEducation.openDetail(id, 'sharing')`), using
   the Pattern/Strategy id already resolved from context before that navigation moves off the tab
   that resolved it.

**Two pre-existing, out-of-scope bugs were found and are NOT fixed by this gate** (both predate
Journey F; confirmed via `git diff main` on the affected lines):

- `marketplaceView.jsx`'s `isSeller` check compares `switcher.currentUserId()` (now a signed JWT
  **token** string, since the client-side auth migration - see `dev-user-switcher.js`'s own
  comment) against `listing.sellerId` (a raw user id) - these can never be equal, so `isSeller` is
  always `false` for every user on every listing, including a seller viewing their own. This is a
  real-UI bug, not an AI-specific one: `marketplace.rate`'s `available()` correctly delegates to
  the exact same (broken) real gate the human-facing rating form uses, rather than reimplementing
  its own eligibility check - it is exactly as safe (and exactly as broken) as the button next to
  it.
- **`POST /listings/:id/ratings` (`server/community/routes.marketplace.mjs`) has no server-side
  eligibility, purchase, or duplicate-rating check at all** - it creates a rating record from
  whatever `req.currentUser.id`/`rating`/`reviewText` it receives, unconditionally. Combined with
  the client bug above, this means the *only* thing currently preventing a seller from rating their
  own listing, an unpurchased buyer from rating without buying, or a buyer from rating the same
  listing twice is the client-side form not rendering - there is no independent backend
  enforcement. This is a genuine, pre-existing gap relevant to F26-F32 section 20's own requirement
  that NAVRYA (not the model) enforce eligibility; flagged here as a recommended follow-up, not
  fixed as part of this gate.

### F33-F36 notes - Account/Profile, Trading Settings, Language/Region, AI provider Settings

**Side-effect classification**: `ACCOUNT_PROFILE` (`profile.edit`, `profile.role.update`) /
`LOCAL_PREFERENCE` (`settings.trading.update`, `settings.language.update`, `settings.ai.update` -
each is a private, immediately-reversible preference, never a public or outbound effect, so none
of them needs a confirmation gate the way Community/Marketplace/Messaging did). `SENSITIVE_EXCLUDED`
covers password, API key (view/edit/remember), admin/authorization role, billing/subscription, and
account deletion - none of these fields exist in any new allowlist, and none of the real
registrations they would target expose them to `applyValue` at all (not merely omitted from the
action's own field list).

**Three of the four real Settings/Profile registrations already existed before this gate** -
`account-profile-identity`, `account-profile-role`, and `settings-trading-defaults` were already
real, human-fillable `ai-process-registry.js` registrations (found via the same repository audit
the Section 0 finding on p.1 documents), just never wired to a startable Action. This gate added
`submit()` (via the same `submitRef` pattern used throughout this project) to the two Account
Profile registrations, whose real save is an explicit button, not an immediate per-field apply;
Trading Defaults needed no such change since it was already immediate-apply.

**`settings-region-language`'s own allowlist never covered the real interface-language select** -
only `region.country`/`region.timezone`/`region.currency`/`region.weekStart` (Region & language's
five other fields) were AI-fillable; the language `<Select>` right next to them called
`store.setLanguage()` directly, entirely outside the registration. Extended the allowlist with a
`language` field, validated the same way every other field here is (against the real, fixed
`languageOptions` list), calling the exact same `store.setLanguage()` the human-facing select uses.

**`aiAssistantView.jsx` had NO process registration at all before this gate** - a deliberate
absence per the pre-existing matrix note ("F36/F37: never make this AI-fillable"), because the
screen mixes safe fields (provider, model, voice) with the API key. Rather than leaving the whole
screen unregistered, a new `ai-assistant-engine` registration exposes only `provider`/`model`/
`voice` - `applyValue` never references `setKey`/`setPersistApiKey`/`setBudget` at all, so a future
allowlist edit cannot silently reopen the credential seam by accident. `model` validates against
the REAL current provider's own `models` array (`ai-settings-store.js`'s `PROVIDER_CATALOG`) -
asking for an unlisted model (F36 section 23's own "GPT-5.6 that doesn't exist" case) simply never
applies, exactly like every other never-fabricate-a-value field in this codebase.

**Settings-context disambiguation (F34 sections 10-12) is handled entirely through each action's
own description text**, not a structural gate - `settings.trading.update`'s description explicitly
distinguishes the user's Trading *default* risk from a currently-open Trade's own risk field
(`trade.calculator`'s workflow) or a Strategy's own max-risk rule (`strategy.edit`'s
`riskManagement.maxRiskPerTradePercent`), instructing the model to only match this action for an
explicit "my default risk"/"Trading Settings" request. No code-level ambiguity exists between these
three real targets - they are three different real UI surfaces/process ids, and `resolveActiveTrade`/
`resolveActivePatternId`-style resolution already means an actively open Trade/Strategy naturally
wins as `activeProcess` over the passively-open Settings page (see the `chat-dock-core.js` fix
below), so a genuinely ambiguous "set risk to 1%" while a Trade is open should route to the Trade,
not silently rewrite the global default.

**"Zero-field start" (F33 section 5) accepts a harmless no-op resave, matching `trade.emotion.log`'s
own established precedent.** `profile.edit` has empty `requiredFields` (unlike the Community/
Marketplace/Messaging gate's own public-mutation actions, there is no consequential gate field to
withhold): a bare "Edit my profile." opens the real Identity tab and lets the model ask what to
change via its own reply text, but if nothing is ever supplied, the workflow's grace-window
auto-submit will re-save the user's own already-correct values unchanged - not an "arbitrary value
change" (nothing the user did not already have gets written), the same trade-off already accepted
for `trade.emotion.log`'s own empty-note case. `profile.role.update`/the three Settings actions
either require the one real field they need (`role`) or are `entityAlreadyPersisted` (no auto-submit
timer exists for them at all), so this trade-off is specific to `profile.edit` alone.

**Passive Settings/Profile/AI-Assistant registrations block fresh action-discovery the same way
Pattern/Strategy editors did in F27-31** - `settings-ai-panel-builder`/`settings-region-language`/
`settings-trading-defaults` are all simultaneously mounted the entire time `#settings` is open (not
tabs - one page, three registrations, "most recently registered wins" would otherwise pick whichever
one happens to be last in render order regardless of what the user is actually asking about), and
`account-profile-identity`/`account-profile-role`/`ai-assistant-engine` are each open for as long as
their own page is simply visible. Generalized the same `chat-dock-core.js` fix (null `activeProcess`
for these ids unless a workflow is already genuinely continuing through that exact process) to cover
all six - see the new regression tests and the F46 real-browser verification below.

**Real-browser testing found and fixed two more bugs, both specific to this gate's own new
territory (immediate-apply, entity-resolution-free Settings actions):**

1. **A value/code mismatch silently dropped every language and AI-provider switch.** A model
   extracting `language`/`provider` from a natural request just as reasonably returns the name as
   it appeared ("Persian", "Anthropic") as the real underlying code/id (`fa`, `anthropic`) - the
   real allowlist's own options-check correctly rejected the mismatched value, so "Change NAVRYA to
   Persian." and "Switch the assistant to Anthropic." silently applied nothing at all, with no
   error surfaced anywhere. Fixed the same way `session.create`'s own `normalizeSessionCity`/
   `normalizeSessionTimeframe` already solve this exact "natural extraction vs. real option value"
   problem: a `normalizeField` on both actions maps common names (English and, for language, each
   supported locale's own name) onto the real code/id before the value ever reaches `applyValue` -
   `settings.ai.update`'s reads the real `providerCatalog()` directly rather than duplicating it,
   so it can never drift from the actual catalog.
2. **A `entityAlreadyPersisted` workflow that never completes permanently traps ALL later
   discovery, not just its own domain.** `settings.trading.update`/`settings.language.update`/
   `settings.ai.update` apply every field immediately with no separate Save step, so - unlike
   Pattern/Strategy/Trade actions that eventually auto-submit-then-clear - their workflow status
   never advances past `'collecting'` on its own; only closing the target page (`pruneIfAbandoned`)
   or a full page reload ever clears it. The existing "passive process, excluded unless a workflow
   is genuinely continuing through it" fix (used for Pattern/Strategy/thread/comment/rating above)
   was the wrong shape here specifically because it *preserves* `activeProcess` once a workflow
   matches - correct for `pattern.edit` (whose `open()` must re-resolve a named Pattern each turn,
   so continuation is genuinely needed) but wrong for these three, which need no entity resolution
   at all and where fresh re-discovery is exactly as good as continuation. Found via the real
   18-turn-class regression script: "Set my default risk to 3%." followed by *any* later,
   unrelated message ("Cancel that.", "Create a Pattern.") kept returning `action: null` for the
   rest of that page visit. Fixed by excluding these three unconditionally (like
   `live-session-entry-`/`live-session-scenario-` above them), both from `activeProcess` and from
   `workflowProcessExcluded` (the separate check gating `availableActions` itself) - two call sites
   needed the same fix since each independently blocked discovery on its own.

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

### Strategies / Analysis Profiles

| Workflow | Real UI | Process id | Allowlist | Open | Save | Action? | Confirm? |
|---|---|---|---|---|---|---|---|
| Analysis Profile create/edit | `analysisProfileOnboarding.jsx` / `analysisProfilesView.jsx` | `analysis-profile-editor` | primaryStyleId, secondaryStyleIds, customMethodNotes, focusIds, name | New Profile / Edit | existing `AnalysisProfileStore` create/update path | **YES - `profile.analysis.create` / `.edit`** | normal; edit resolves an exact existing name, never guesses |

### Psychology

| Workflow | Real UI | Process id | Allowlist | Open | Save | Action? | Confirm? |
|---|---|---|---|---|---|---|---|
| Pre-Session Check-in | `preSessionCheckInModal.jsx` | `mh-pre-session-checkin` | sleepQuality, currentStressLevel, significantPersonalEvent | gated before first session entry | `mh.addPreSessionCheckIn()` | NO | normal - **F58 applies: never fabricate the numeric ratings** |
| Post-Trade Reflection | `postTradeReflectionModal.jsx` | `mh-post-trade-reflection` | setupQualityRating, planAdherenceRating, emotionManagementRating, deviationReason, sentenceOfTheDay | auto-opens after a close / explicit closed-trade action | `mh.addPostTradeReflection()` | **YES - `psychology.postTradeReflection.fill`** | normal - `sentenceOfTheDay` is safety-screened |
| Weekly Check-in | `weeklyCheckInModal.jsx` | `mh-weekly-checkin` | disciplineRating, biggestWin, biggestLesson | "Run check-in now" / action | `mh.addWeeklyCheckIn()` | **YES - `psychology.weeklyCheckIn.fill`** | normal |
| Mood check-in | `moodTab.jsx` | `psychology-mood-log` | mood, sleepQuality, somethingToProveToday, significantPersonalEvent | Psychology Mood tab | existing `log()` / Pre-Session Check-in flow | **YES - `psychology.mood.log`** | normal |
| Routine builder | `routineTab.jsx` | `psychology-routine-editor` | template, name, days, rule toggles | Psychology Routine tab | existing `RoutineStore.create()` / `.update()` path | **YES - `psychology.routine.create` / `.edit`** | normal |
| Therapist review filter | `therapistTab.jsx` | `psychology-therapist-review` | queueView | Psychology Therapist tab | none - view only | **YES - `psychology.therapist.review`** | approve/reject/bulk actions remain click-only |
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
| Profile identity | `accountProfileView.jsx` `IdentityTab` | `account-profile-identity` | displayName, email, phone, avatarDataUrl | Account page | `AccountProfileStore.updateProfile()` | **YES - `profile.edit` (F33)** | normal (avatarDataUrl excluded from the action's own fields - see above) |
| Profile role | `accountProfileView.jsx` `RoleTab` | `account-profile-role` | role (trader/mentor/teacher) | Account page | `AccountProfileStore.updateProfile()` | **YES - `profile.role.update` (F33)** | normal - no admin-role path exists |

### Settings

| Workflow | Real UI | Process id | Allowlist | Open | Save | Action? | Confirm? |
|---|---|---|---|---|---|---|---|
| AI panel builder | `settingsView.jsx` `AiPanelBuilderSection` | `settings-ai-panel-builder` | prompt | Settings page | draft only - "Add to board" separately calls `addCustomPanel()` | NO | normal (out of scope for F33-F36 - drafts dashboard panels, not a Settings value) |
| Region & language | `settingsView.jsx` `RegionLanguageSection` | `settings-region-language` | language, region.country, region.timezone, region.currency, region.weekStart | Settings page | `store.setLanguage()` for language; `AppSettingsStore.saveSettings({region})` for the rest | **YES - `settings.language.update` (F35)** | normal - `language` only applies from an explicit app-language request (F35 section 16) |
| Trading defaults | `settingsView.jsx` `TradingDefaultsSection` | `settings-trading-defaults` | defaultRiskPercent, leverageCap, maxTradesPerSession | Settings page | `TradeStore.saveSettings()`, clamped to real min/max | **YES - `settings.trading.update` (F34)** | normal |
| AI Assistant engine | `aiAssistantView.jsx` (new registration) | `ai-assistant-engine` | provider, model, voice | AI Assistant page | `AISettingsStore.saveSettings()`/`setVoice()` | **YES - `settings.ai.update` (F36)** | normal - apiKey/persistApiKey/budget never wired into `applyValue` at all |

## Workflows with no Process Registry registration (6)

1. **Mark hunting trade open / Cancel hunting trade** - plain buttons in `dashboardView.jsx`/`liveSessionView.jsx`, `tradeStore.updateStatus()`, no registration.
2. **Report abuse** (`reportFlow.jsx`) - a real, cross-cutting modal (posts/comments/listings/messages), `reason` textarea is plain React state, never registered. Per the original Journey D note (still valid): an AI-drafted abuse report would undermine it as a genuine user signal - **recommend leaving unregistered**, matching that precedent.
3. **Post delete** - no delete UI exists in the live Community view at all (store function unused).

## Cross-cutting notes for later gates

- **Strategy risk edit vs. Trade risk override are different events** (F18): the Strategy-editor row above writes `Strategy.riskManagement.maxRiskPerTradePercent` directly, via `strategy-editor-{id}`'s own allowlist - it is not routed through `ai-proactive-engine.js`'s `strategy-risk-limit` rule at all (that rule only ever fires on a *Trade's* `riskPercent` exceeding its *linked* Strategy's cap). A future `strategy.edit` action must target this process, never the Trade Calculator's.
- **Entity resolution for "this Pattern"/"that Strategy"** (F53) has a real, already-built answer for context: `ai-context-engine.js`'s `snapshot().activeEntities` (Journey D) already resolves `activePatternId`/`activeStrategyId` from whichever `pattern-editor-{id}`/`strategy-editor-{id}` process is currently open, the same mechanism `trade.calculator`'s `linkedStrategyId` normalization already reuses.
- **Destructive-action confirmation is inconsistent today** (F24/F25/F86): Session/Pattern/Strategy/Trade deletes already have a `window.confirm()`; Live Session scenario/entry deletes and stage/screenshot deletes do not. Any Journey F action wrapping one of the *unconfirmed* deletes needs its own explicit confirmation step (Journey C's `CONFIRM_OVERRIDE`-style pattern, or a dedicated new one) rather than assuming the real UI already gates it.
