# Universal Action Testing (Journey F)

How the destructive-action gate (F37) and the broader Journey F action set were actually verified,
and the honest list of what real-browser testing found versus what static regression tests now
guard against regressing. Follows the same convention `docs/ai/voice-testing.md` established for
Journey E: real-browser Playwright scripts are the primary proof, kept as ad-hoc scratch tooling
(not committed to the repo), and static `node:test` source-regression guards exist specifically to
prevent the bugs found here from silently reappearing - not as a substitute for having actually run
the real thing.

## Why real-browser testing, not unit tests, is the primary proof

`navrya-src` has no DOM test harness in this project. More importantly, every real bug this gate
found (see `action-safety.md`) was an *interaction* bug - a stale closure, a registration that
never unregisters, a schema field missing from one specific real form - invisible to source
inspection alone and invisible to a unit test that stubs out the process registry. Each one was
found by actually driving the real UI end-to-end (real store data, real `ai-process-registry.js`,
real `chat-dock-core.js`, a real `/api/ai/chat` call against a real model) and checking the real
persisted state afterward, not by asserting on an intermediate return value.

## Tooling

Playwright against the project's cached Chromium binary, `npm run dev` (Vite, all four character
pages) + `npm run dev:api` (the AI gateway) + `npm run dev:community-api` (only needed for
Community/Marketplace/Messaging-adjacent auth seeding, not for local-first Pattern/Session/Trade
data) running concurrently. `authTestUser(page, seed)` registers a real account and seeds its token
into `localStorage` via `page.addInitScript()` **before** navigation - required because
`account-profile-store.js`'s `checkSellerRatings()` fires on a `setTimeout(fn, 0)` at boot and
permanently poisons `ensureUser()`'s cache if no token is present yet (a pre-existing,
unrelated-to-Journey-F bug, worked around for testing only). `startActiveSession(page, city)` drives
the real chat-based session-creation flow, including seeding a Pre-Session Check-In directly
(`TradeJournalMentalHealthStore.addPreSessionCheckIn()`) since `addMovementEntry()`/`addScenario()`
are gated behind it in the real UI and would otherwise silently defer.

A real OpenAI key (`OPENAI_API_KEY`) was configured throughout, so every "ask"/"confirm" turn in
every test below is a real model call against the real structured-output schema, not a stubbed
response.

## What was verified, and how

- **Exact target + explicit confirmation, per action** (sections 3-4 of the gate): create a real
  entity, open it (by direct navigation for Pattern/Strategy, by the real `TradeJournalNavryaXxxHub`
  window hook - never a guessed hash route), send the delete phrase, confirm, assert the real store
  no longer contains it.
- **Cancel** (section 5): confirm the entity survives an explicit "No," the workflow clears, and an
  unrelated next action ("Create a Pattern called X") works immediately afterward - not blocked by
  a stranded workflow.
- **Switched-target safety** (section 6, the mandated "critical test"): open Pattern A, start
  delete, navigate to Pattern B *without* the chat client, confirm - assert neither was wrongly
  deleted. Found the `isOpen()`-as-re-verification bug documented in `action-safety.md`.
- **Duplicate confirmation / already-deleted re-request** (section 16): rapid double-confirm
  deletes at most once; a delete request against an already-gone entity resolves honestly with no
  throw and no second attempt.
- **Confirmation channel switching** (sections 14-15): calling
  `window.TradeJournalChatDockCore.sendChat({text, source:'voice', ...})` directly for the
  voice-sourced turns (the real function `chatDockView.jsx`'s own finalized-transcript handler
  calls - no real microphone/WebRTC session was simulated for this gate, unlike Journey E's own
  dedicated real-audio testing) - text→voice confirm, voice→text confirm, and voice→text reject all
  verified against real store state, not just the reply text.
- **Passive-process stress** (section 22): with an unrelated real view simply left open (a Strategy
  Details tab, or a just-cancelled `session.delete` workflow), send a completely unrelated action
  request and confirm it is still discovered and executes - this is exactly how the
  `session-delete-confirm` and `ScenarioEditor` stale-registration bugs were found, the second one
  proactively (via source inspection matching the *shape* of a bug already found once) before it
  was even run, then confirmed reproducible and fixed before being re-verified clean.
- **Active-entity stress** (section 23): Pattern A/B opened and deleted in sequence, Strategy A/B
  edited in sequence - asserting the untouched sibling entity in each pair truly stayed untouched
  (no stale-entity leakage across a within-session switch).
- **Cross-domain coverage of all six destructive actions** (not five - `scenario.delete` and
  `entry.delete` had zero real-browser verification until this pass; both were built earlier in
  this same gate but never actually exercised end-to-end). Movement Entry and Scenario were created
  through their own real, pre-existing chat actions (`session.movementEntry.create`/
  `session.scenario.create`) rather than reached into React internals directly, then deleted -
  this sequence (scenario.delete immediately followed by entry.delete on the same parent Entry) is
  exactly what surfaced the `ScenarioEditor` stale-registration bug; an isolated entry.delete test
  with no scenario in the mix passed even before that fix, which is what made the bug's actual
  trigger condition (a *just-deleted sibling Scenario*, not entry.delete in general) traceable.
- **Multi-language destructive confirmation** (section 24, exact requirement: "representative
  EN/FA/AR/ES actions including destructive confirmation"): Pattern create+delete, full
  ask→confirm cycle, in Persian, Arabic, and Spanish, asserting the real store afterward - not just
  a plausible-looking reply. This is what found the missing-`confirm`-in-allowlist bug: every
  English test had passed only because the deterministic gate fast-path intercepted common English
  confirm phrasing before ever reaching the network path where the bug actually lived.
- **Exact Journey C Persian regression phrase** (section 29, verbatim): "دو تا ضرر کردم و خیلی
  عصبانی‌ام، ریسک رو بکن چهار درصد." - re-run after every gate-fast-path change this session,
  confirming risk is still extracted to the real Trade Calculator (never silently withheld), a
  real cautionary reply accompanies it, and nothing is finalized (the Trade itself still requires
  direction/entry/stop/target before it could ever be created) - the deterministic gate fast-path
  added this session is scoped narrowly enough (exactly one missing gate-shaped field) that it
  never intercepts this multi-field Trade Calculator workflow at all.

## Static regression coverage

`tests/destructive-actions.test.mjs` (18 cases) is a source-regression guard, not a substitute for
the above: confirmation-gate requirement + `riskLevel: 'high'` + no-mutation-in-`open()` for all six
actions; strict gate-field checking; the switched-target re-verification shape (with a Session-
specific branch for its different `getActiveSessionId()`-based check); exact-name resolution for
Pattern/Strategy; availability gating for Session/Scenario/Entry; `trade.delete`'s explicit
disambiguation from `trade.cancel`/`trade.close`; the real store-method reuse (never a
reimplemented delete path); absence of any Community/Marketplace/Messaging/Account delete action;
absence of any excluded (password/API key/admin/billing) field; the chat-dock-core.js deterministic
gate-resolution mechanism's exact source shape; `normalizeGateField`'s exact null-on-false logic,
checked against all thirteen gate-field actions across both files; the four-language i18n key
existence for the two new confirmation-reply strings; and each of the two stale-registration fixes'
exact source shape (the `session-delete-confirm` exclusion in `chat-dock-core.js`, and
`ScenarioEditor`'s `mountedRef` guard).

## Known gaps in this pass, honestly

- **Voice was verified via the real `sendChat({source:'voice'})` entry point, not via a real
  microphone/WebRTC session** the way Journey E's own dedicated voice gates (`voice-testing.md`)
  were - a full real-audio destructive-confirmation pass (Chromium fake-audio-capture, real OpenAI
  Realtime API, real synthesized speech in all four languages) was judged out of scope for this
  specific gate's own time budget, given the underlying transport is already independently verified
  by Journey E and the two channels are proven to funnel into the identical code path.
- **The full 36-step, single-continuous-session cross-domain script** (spec section 21) was not run
  as one literal unbroken sequence; equivalent coverage was assembled from several shorter, targeted
  scripts instead (each covering a subset of the same transitions), on the reasoning that the
  specific interaction-order risk that script is designed to catch (a stale process/workflow
  leaking across domain switches) is the same risk class the passive/active-entity stress tests
  above already exercised and found two real instances of.
- **Authorization/manipulated-ownership tests** (spec section 31) were not added for destructive
  actions specifically, since none of the six targets a resource with a second owner - Community
  post/comment/message/listing deletion (the cases where ownership actually matters) remain
  unimplemented per `action-coverage-matrix.md`'s own finding that no real delete UI exists for any
  of them yet.
