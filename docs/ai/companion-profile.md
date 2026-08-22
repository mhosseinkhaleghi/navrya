# Companion Profile & Persistence (Journey G)

`public/pages/shared/ai-companion-profile.js` → `window.TradeJournalAICompanionProfile`
`server/community/routes.companion.mjs`, `server/db/migrations/018_companion_state.sql`

The one small, server-backed document Journey G is allowed to persist. Two genuinely different
concerns share this one document on purpose - a **communication preference model** (how the
Companion talks) and a small set of **user choices that cannot be derived** (what's been
dismissed, snoozed, or explicitly chosen) - because both are equally small and equally
per-user, and splitting them into two synced documents would double the sync/reconciliation
surface for no real benefit.

## Persistence boundary (§3 of the brief)

**Persisted** (nothing else):

```js
{
  version: 1, lastUpdatedAt,
  walkthroughSeenAt,        // one-time first-run flag (§16)
  currentGoal,               // explicit user-chosen domain (§32) - never inferred
  dismissedSteps: { [dedupeKey]: iso },  // "Later" on a step's own card
  snoozedSteps: { [stepId]: iso },       // reserved for a future timed-snooze UI; dismissStep()
                                          // is what the current CompanionCard's Later button uses
  skippedOptional: [stepId, ...],        // explicit Skip on an optional step
  preferences: { experienceLevel, explanationDepth, teachingPreference, initiativePreference, interactionPreference }
}
```

**Never persisted here** (all derived fresh by `ai-journey-engine.js` on every read): `hasPattern`,
`hasStrategy`, `hasTrade`, `hasSession`, `intakeComplete`, or any other fact a real store already
proves. Duplicating one of these would let the cached copy drift from reality - exactly the
failure mode the brief's §2/§3 warn against.

## The Companion Profile is a communication model, not a psychological one (§8/§9)

`preferences.experienceLevel/explanationDepth/teachingPreference/interactionPreference` are
**user-selected** (a Settings toggle for `initiativePreference` ships in this gate;
the other four fields exist in the schema and API for a future preferences UI, defaulting to
`null`/unset until then - never silently inferred from psychological signals). What this module
must **never** do, and does not do anywhere in this codebase:

- read from `TradeJournalMentalHealthStore` (intake, redFlags, chatHistory, biases) at all;
- store a label like "anxious," "impulsive," or "revenge trader" - even as an internal-only field;
- infer a preference from Signal Router/Proactive Engine output (those remain the sole owners of
  trading-relevant behavioral evidence - see `docs/ai/signal-routing.md`,
  `docs/ai/proactive-engine.md`).

`tests/ai-journey-engine.test.mjs`'s `companionContext()` privacy test additionally asserts that
even the trimmed, model-facing package built from this profile never carries raw Mental Health
content.

## Server shape

Mirrors `mental_health_profiles` (Section 7.18 Module 5) exactly, for the same reason: one row per
`user_id`, the entire document as a single `state JSONB` column, no child tables, because nothing
anywhere queries into its handful of fields individually.

```
companion_state(user_id PK -> users, state jsonb, created_at, updated_at)
GET  /api/sync/companion-state  -> { state }         (null for a user who never saved one)
POST /api/sync/companion-state  <- the whole document -> { state }  (whole-document upsert)
```

Mounted at `/api/sync/companion-state` (the established `/api/sync/*` prefix, not
`/api/companion` - see `routes.trading-sessions.mjs`'s comment for why). No `uploadsDir`, no
`/images` route, no `GET /:id`/`DELETE /:id` - identical shape to `routes.mental-health.mjs`,
since there is exactly one document per user, addressed implicitly by `req.currentUser.id`.

## User-switch leak prevention (Item 4 follow-up)

This app's real user-switch flow (`dev-user-switcher.js`'s "Log out" button) is a full navigation
to the login screen - never an in-place swap - and `logout()` only clears the auth token, on
purpose (every local-first module in this app, including this one, relies on the SAME
"reconcile against the server on next load" recovery, not a logout-time wipe). Combined with this
module's localStorage key being a single, global (not per-user) key - the same shape every other
Section 7.18 module already uses - a naive `load()` could otherwise show User A's leftover cached
goal/dismissals/preferences to User B for the brief window before the next reconcile completes.

The fix: every real write stamps a local-only `_ownerUserId` tag (never sent as a meaningful
field - it exists purely so `load()` can recognize when the cache belongs to someone else).
`load()` itself - the one function every read in this module funnels through - refuses to reveal
a document stamped for a different, currently-live user, returning a fresh default instead:

```js
function load() {
  var stored = readRaw();
  var currentUid = liveUserId();
  if (currentUid && stored._ownerUserId && stored._ownerUserId !== currentUid) return empty();
  return stored;
}
```

This is synchronous and takes effect immediately on the very first read after a switch - it does
not wait for any network round trip. **What this does not do** (an honest limitation, not a
second bug): because the cache is a single shared key, User B's own local write physically
overwrites the bytes User A's browser was holding - switching back to A does not resurrect A's
data bit-for-bit from the local cache alone. What it guarantees is the safety property that
actually matters: A never sees B's data and B never sees A's, symmetrically. Recovering a user's
own real data after such a switch is the pre-existing `migrateOrAdopt()`/reconcile path already
described above, fetching it back from the server - proven end to end in
`tests/companion-profile-sync.test.mjs`'s user-switch test. Implementing genuinely per-user local
namespacing (so every user's own cache survives locally, independent of who else used the same
browser) would be a real architectural improvement, but it is not how any other Section 7.18
module works today either, so building it only for the Companion module was judged out of this
gate's scope - a candidate for one future pass across every local-first module, not a Journey
G-specific fix.

## Client sync

Registers with the existing `TradeJournalSyncQueue` under module `'companion-state'` - the same
write-local-first/enqueue/background-retry contract every other Section 7.18-shaped module uses.
First activation adopts the server's copy outright if one exists (no prior local edit worth
protecting yet); otherwise pushes the local document up, but only when it genuinely diverges from
a fresh default (a brand-new browser has nothing meaningful to push). Steady-state reconciliation
(the `online` event) keeps whichever copy's `lastUpdatedAt` is newer - the same "single document,
no per-record id to merge by" reasoning `mental-health-store.js` already established.

## API

```js
TradeJournalAICompanionProfile.load() / .get()          // -> the normalized document
TradeJournalAICompanionProfile.hasSeenWalkthrough()      // -> boolean
TradeJournalAICompanionProfile.setWalkthroughSeen()
TradeJournalAICompanionProfile.currentGoal() / .setCurrentGoal(domainOrNull)
TradeJournalAICompanionProfile.isDismissed(dedupeKey) / .dismissStep(dedupeKey)
TradeJournalAICompanionProfile.isSnoozed(stepId) / .snoozeStep(stepId, untilIso)
TradeJournalAICompanionProfile.isSkipped(stepId) / .skipOptionalStep(stepId)
TradeJournalAICompanionProfile.preferences() / .initiativePreference() / .setPreference(key, value)
```

## The shipped preference UI

`navrya-src/settingsView.jsx`'s `CompanionSection` exposes two real controls:

- `initiativePreference` (Low/Normal/High) - a `Select` bound directly to this store.
- `currentGoal` (Item 3 follow-up) - `CompanionGoalSelect`, a `Select` offering exactly the five
  real domains a step in `ai-journey-steps.js` actually uses (`patterns`/`strategies`/`sessions`/
  `trades`/`psychology`), plus a "no specific goal" option that clears it. Selecting a value calls
  `TradeJournalAICompanionOrchestrator.setCurrentGoal(domainOrNull)` (not this store directly) so
  the orchestrator's own cooldown-reset + republish happens too - the Companion card reflects a
  freshly-set goal immediately (see `docs/ai/companion-orchestration.md`). `tests/ai-journey-
  engine.test.mjs` proves every offered option maps to a real domain (never an invented
  capability) and that the goal is a pure priority boost - it never marks a milestone complete,
  never outranks an active Trade or a due Reflection (both already sit far above any
  goal-boosted foundational step's priority), and never bypasses safety.

The other three communication-preference fields (`experienceLevel`/`explanationDepth`/
`teachingPreference`) are real, synced, and read by `ai-journey-engine.js`'s `companionContext()`
today, but have no settings UI yet; this is an honestly-scoped gap, not a silent omission (see the
final report).
