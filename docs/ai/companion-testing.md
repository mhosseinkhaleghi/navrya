# Journey G Testing (AI Companion & Journey Orchestration)

Mirrors Journeys A-F's own testing convention: real, dynamic `vm.runInNewContext` sandboxes over
the real shared `.js` files (never regexing source text for behavior), plus real
`createApp()`/`createMemoryRepo()` HTTP contract tests for the new server routes, plus real
`dockChat()` unit tests for the prompt-injection/safety boundary. No new testing framework or
convention was introduced.

## Test files (131 Journey-G-specific tests across four passes, 0 skipped, 0 failing; 1009/1009 total)

Four passes so far: the original Gate 1 build (43 tests, listed below), the "close the gaps
before commit" follow-up (Items 1-5 - explain-only mode, real Low/Normal/High, a real currentGoal
UI, local-first proof, derived-state-after-mutation regressions - folded into the existing files
below plus `tests/companion-explain-mode.test.mjs`), the UX correction pass (the no-auto-popup
fix and the Voice Companion opening - `tests/companion-voice-opening-turn.test.mjs` and
`tests/chatdock-voice-companion-ux.test.mjs`, plus additions to `ai-journey-engine.test.mjs`/
`ai-companion-orchestrator.test.mjs`), and a real-browser verification pass (2 more tests in
`ai-companion-orchestrator.test.mjs` for a real bug found live - see below). Gate 1's own original
file list:

- **`tests/ai-journey-engine.test.mjs`** (14 tests) - the derivation engine itself: fresh-user vs.
  existing-user snapshot, milestone recomputation, `nextBestStep()` priority ordering (safety/
  active-Trade/due-Reflection beating onboarding), explicit `currentGoal` boost, Later/Snooze
  persistence, Low-initiative gating, `companionContext()`'s privacy boundary, `debugLastSnapshot()`
  sanitization, a direct "the sandboxed `fetch` throws if ever called" proof of zero model calls,
  and the four-character script-order contract.
- **`tests/companion-profile-sync.test.mjs`** (8 tests) - `ai-companion-profile.js`'s own
  persistence: the sync-queue sender, every mutation funneling through `write()`/enqueuing once,
  the exact persisted-field allowlist (proving no derivable fact sneaks in), preference
  validation, first-activation adopt/push, and steady-state reconcile-by-`lastUpdatedAt`.
- **`tests/companion-state-api-contract.test.mjs`** (6 tests) - the new `/api/sync/companion-state`
  route against a real `createApp()`/`createMemoryRepo()`: auth-required, null-when-unset,
  upsert/reassemble, idempotent whole-document replace, strict per-user scoping, and the real
  Express `strict: true` JSON behavior for a non-object body.
- **`tests/companion-context-prompt.test.mjs`** (6 tests) - `buildCompanionContextText()`'s own
  rendering (empty/malformed input, the delimited header, an unset preference never rendered as
  `null`) and `dockChat()`'s wiring: backward-compatible when absent, correctly injected when
  present, a malicious `nextBestStep.why` proven inert (rendered verbatim as data, framed by an
  explicit "never a permission to act" sentence, the same standard already proven for PRODUCT
  KNOWLEDGE/USER DATA), and confirmation that `companionContext` never changes the
  activeProcess/availableActions reasoning-tier tuning.
- **`tests/ai-companion-orchestrator.test.mjs`** (9 tests) - the orchestrator's own glue: welcome
  vs. step card selection, the legitimate-null "nothing to offer" outcome, `startWalkthrough()`'s
  side effects, `continueStep()`/`laterStep()`/`skipStep()` calling exactly the right real
  engine/profile method with the right arguments (dedupe key resolved from the engine, never a
  bare id), and event-driven (not polled) republishing with exactly one listener per watched event.

## Journey G UX correction - new test coverage

- **`tests/chatdock-voice-companion-ux.test.mjs`** (15 tests) - source-structure assertions on
  `chatDockView.jsx`/`ChatDock.jsx`/`aiVoiceRealtime.js` (the same convention
  `ai-voice-realtime-adapter.test.mjs`/`ai-voice-chatdock-ux.test.mjs` already established for this
  React component): `dockExplicitlyOpened` starts `false` and only the WELCOME card is gated by it;
  the three real gestures that set it (input focus/Voice press/send) and that mounting never does;
  `deliverCompanionOpening()` is reachable from exactly one place (the `CONNECTING -> LISTENING`
  voiceState effect), never a mount effect; the `openingDeliveredForConnectionRef` no-duplicate
  guard and its `IDLE`/`ERROR` reset; Voice's own `connect()` is called from exactly one place
  (the user's `toggleVoice()`); the visual-sync render gate and the pre-`voiceOpening()` card
  capture for the fresh-welcome case; `aiVoiceRealtime.js` contains no mention of "companion" or
  "opening" anywhere (still a pure, business-rule-free transport) and its existing barge-in handler
  is unchanged; the opening is routed through the same `voiceTurnQueue`;
  `awaitingCompanionOpeningReplyRef` is set in exactly one place and read-and-cleared once;
  Therapist Mode is checked before the orchestrator is ever consulted; the Persian `marin` voice
  mapping is untouched; and all seven new `voiceOpening*` i18n keys exist with real values in all
  four languages.
- **`tests/companion-voice-opening-turn.test.mjs`** (6 tests) - `chat-dock-core.js`'s own
  deterministic fast path: "start"/"later" resolve with zero `fetch` calls and the real ack text;
  "explain" makes exactly one AI call with `companionIntent` forced and the user's own real words
  as the message; an ambiguous reply falls through to that same one ordinary call unaffected; the
  classifier is never even consulted when `awaitingCompanionOpeningReply` isn't set; and a
  start/later resolution is recorded via the same zero-network `debugLastTurn()`/`debugLastLatency()`
  path every other deterministic fast path already uses.
- **`ai-journey-engine.test.mjs`** additions (4 tests) - `voiceOpeningContext()` itself, against
  real store fakes: `blocked` matches `safetyOrWorkflowActive()` exactly; the real open-Trade/due-
  Reflection/open-Session ids (including the new `firstOpenSession()` reader, sourced from a real
  `status: 'open'` session in the shared local cache); `hasSeenWalkthrough` reflects the real
  Companion Profile document; and zero `fetch` calls.
- **`ai-companion-orchestrator.test.mjs`** additions (13 tests) - `voiceOpening()`'s full priority
  ladder (Trade > Reflection > Session > fresh-welcome-with-immediate-mark-seen > returning-
  neutral), the safety-blocked `null` outcome, and proof a second call for what was a fresh user
  never repeats the onboarding greeting; `interpretVoiceOpeningReply()`'s EN/FA
  start/later/explain classification with AR/ES and ambiguous EN/FA text all returning `null`;
  `resolveVoiceOpeningChoice('start')` re-reading `nextBestStep()` fresh on every call (never a
  hardcoded/cached target) and its graceful no-op when nothing is left to continue into;
  `resolveVoiceOpeningChoice('later')` dismissing the real currently-shown step by its real dedupe
  key.

## What each risk from the brief maps to

| Brief requirement | Where it's verified |
|---|---|
| No model call for Journey evaluation (§38) | `ai-journey-engine.test.mjs`'s throwing-fetch sandbox |
| No router+answer double call (§39) | `companion-context-prompt.test.mjs` - one `dockChat()` call per turn either way |
| Safety/destructive-confirmation precedence (§24) | `ai-journey-engine.test.mjs`'s "safety always wins" test |
| Psychology/privacy boundary (§55) | `ai-journey-engine.test.mjs`'s `companionContext()` privacy test |
| Prompt-injection inertness (§56) | `companion-context-prompt.test.mjs`'s malicious-content test |
| No duplicate nudge (§53) | `ai-journey-engine.test.mjs`'s dedupe-key dismiss test + the orchestrator's exactly-one-listener test |
| Offline/local derivation (§48) | every engine test runs with `fetch` disabled entirely - all reads are local |
| Reconciliation behavior (§48) | `companion-profile-sync.test.mjs`'s adopt/push/reconcile tests |
| Continue uses a real action path, never fakes a chat message (§18) | `ai-companion-orchestrator.test.mjs`'s `continueStep()` test |
| EN/FA/AR/ES coverage | every new i18n key (`ai-i18n.js`, `settingsView.jsx`'s `copy`) was added to all four language blocks - see `docs/ai/companion-profile.md`/`companion-orchestration.md` for the strings themselves |

## Real-browser verification (fourth pass) - what was actually run, live

The first three passes had no live-browser-driving tool available. This fourth pass found one
(Playwright, driving the system-installed Chrome directly via `executablePath` - the bundled
Chromium download is blocked in this environment by a geo restriction) and used it against the
real dev servers (`npm run dev`, `npm run dev:community-api`, `npm run dev:api`, the last with a
real configured `OPENAI_API_KEY`) - the real built bundles, the real backend, a real model. Every
result below is a real screenshot/DOM read/network capture, not a simulation.

**Verified, live, and passing:**
- **Scenario A/E (no auto-popup on load or reload).** A fresh browser context loading
  `#/dashboard/hunter` shows no `[data-companion-card]` node at all; a reload stays silent the same
  way.
- **The `dockExplicitlyOpened` gesture.** Focusing the real ChatDock input (not the decoy "Search
  sessions" box, which shares the generic `input` tag - the actual selector is
  `[data-navrya-chat-dock] input[type="text"]`) makes the exact real welcome card appear, with the
  correct Persian copy and all three buttons.
- **Item 11 (Start uses the real current step, never hardcoded).** Clicking "شروع کنیم" instantly
  (zero network requests) marks the walkthrough seen and replaces the card with the real `intake`
  step's own card (title/why/Continue/Explain/Skip/Later) - confirmed by reading the DOM directly,
  not inferred.
- **Continue opens the real, existing UI.** Clicking "ادامه" on the Intake card opened the real
  Mental Health Intake wizard modal (`روان‌شناسی · پروندهٔ پذیرش`, the real 13-question flow) with
  zero AI calls - not a duplicate/placeholder form.
- **Explain - full real round trip.** Clicking "توضیح بده" made exactly one `/api/ai/chat` request,
  with `companionIntent:"explain"`, `activeProcess:null`, and a real `companionContext` carrying
  `responseStance:"TEACHER"` - and got back a genuine, well-grounded, non-diagnostic explanation
  from the real model (`gpt-5.6`) with `suggestions:[]` and `action:null`.
- **Existing-user derivation, in the real bundle.** Seeding realistic Pattern/Strategy/Session/
  Trade records into `localStorage` and reloading made the real, live
  `window.TradeJournalAIJourneyEngine.nextBestStep()` correctly resolve to `post_trade_reflection`
  for the seeded closed trade - the exact derivation already proven in isolation by
  `ai-journey-engine.test.mjs`, now confirmed inside the actual production bundle too.
- **Zero console errors** across every interaction above.

**A real bug found and fixed by this pass:** `ai-companion-orchestrator.js`'s `currentCard()`
checked `welcomeCard()` *before* ever consulting the engine's own safety/workflow gate - so a real,
live `TradeJournalAIWorkflowEngine.start()` call (confirmed via `window.TradeJournalAICompanion
Orchestrator.currentCard()` returning the welcome card while a real workflow was genuinely in
flight, then `null` once fixed) could let the welcome card win over "safety always wins." Fixed by
checking `evaluate().blockers` first, before either card kind is considered; re-verified live,
including through the real DOM render (not just the function's return value) via a forced
`tradejournal:companion-updated` re-render while a real workflow was active. Two new regression
tests added to `ai-companion-orchestrator.test.mjs`.

**Not verified by this pass - genuinely requires a human with real audio hardware:** every Voice
scenario (pressing the mic, hearing NAVRYA speak first, replying by voice, interrupting mid-
opening, Persian TTS quality). This is not a session-capability gap closeable with more time or a
different tool - OpenAI's Realtime transcription needs genuine microphone input a headless browser
automation session cannot produce, and this repo has no synthesized-speech-injection harness. Also
not exercised this pass (feasible, but not attempted, for cost/time reasons): the Journey C unsafe-
risk-request phrase, a full destructive-delete-via-chat flow, and the Low/Normal/High Settings
toggle's visible effect. The manual script below still stands for a human to complete the rest.

## Manual real-browser validation script (for whatever this pass didn't cover)

**Voice (B, C, D, F, G below), the Journey C phrase, and the destructive-delete-via-chat flow
still need a human.** Start all three dev servers (`npm run dev`, `npm run dev:community-api`,
`npm run dev:api`), open the app at the URL Vite prints, and pick any character.

**B - Press Voice.** Click the mic button. Expected: once connected, NAVRYA speaks first (the fresh
welcome), before you say anything - a synchronized visual card (Start/What is NAVRYA?/Later) may
also appear.

**C - Persian fresh user.** Same as B with the interface language set to Persian. Expected: a
natural, contemporary-Persian welcome, spoken in the current validated Marin voice.

**D - Say "آره، شروع کنیم" (or "yes, let's start" in English).** Expected: NAVRYA acknowledges
(zero-delay, deterministic) and opens the real next step (e.g. Pattern creation) - not a hardcoded
target, whatever `nextBestStep()` genuinely resolves to.

**F - Start Voice again after choosing Later on a previous run.** Expected: no repeated onboarding
greeting - a short neutral "I'm ready, what do you want to work on?"-style greeting instead (the
fresh welcome is one-time only, marked seen the moment it was first spoken).

**G - Returning user with an active Trade.** Seed/use a user with an open Trade, then press Voice.
Expected: no beginner welcome - a contextual "you have an open Trade, want to review it?" greeting
instead, outranking onboarding and any set `currentGoal`.

**Also still relevant:**

1. Switch Low/Normal/High initiative in Settings → a real, observable difference in what the
   Companion card proactively offers (Item 2) - logic verified in isolation, not clicked through.
2. The Journey C regression phrase ("دو تا ضرر کردم و خیلی عصبانی‌ام، ریسک رو بکن چهار درصد") -
   confirm the existing proactive-safety outcome is unaffected and no Companion nudge/opening
   interrupts it.
3. A destructive-delete confirmation flow driven via chat (e.g. "این پترن رو حذف کن"): confirm no
   Companion card/opening interrupts the pending confirmation, "No" deletes nothing, and a repeated
   attempt with "Yes" deletes only the exact disposable target. (The *direct* safety gate - a real
   workflow blocking `currentCard()` - is now verified live, above; only the specific
   chat-driven-delete path remains manual.)
4. Interrupt NAVRYA mid-opening by speaking over it: speech should stop promptly, your utterance
   should be captured as exactly one finalized transcript producing exactly one ChatDock turn, and
   no remainder of the old opening should play afterward.

## Quality gates run this session

UX-correction pass: `node --test tests/*.test.mjs` - 1007/1007 passing (971 going in + 36 new: 15
in `chatdock-voice-companion-ux.test.mjs`, 6 in `companion-voice-opening-turn.test.mjs`, 4 added to
`ai-journey-engine.test.mjs`, 11 added to `ai-companion-orchestrator.test.mjs`), 0 skipped.

Real-browser verification pass (after the bug fix above): **1009/1009 passing** (1007 + 2 new
regression tests for the `currentCard()` safety-ordering fix), `node scripts/ai-knowledge-build.mjs
check` OK (unchanged), `npm run build` clean (all four character bundles and the outer shell; the
two `<script>`-without-`type="module"` warnings on the outer build are pre-existing, unrelated to
this work).
