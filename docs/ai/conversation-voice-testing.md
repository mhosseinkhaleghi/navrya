# Conversation Studio Voice Asset Pipeline Testing (Journey H2, Gate 3)

## Automated coverage

| File | Covers |
|---|---|
| `tests/admin-conversation-audio-contract.test.mjs` (new) | Auth/non-admin rejection, `kind:'data_query'` rejection (400, before any ElevenLabs call), the full lifecycle (generate -> preview, not runtime-active -> approve -> appears in the published bundle -> regenerate+approve archives the prior slot-mate), staleness (a draft edit invalidates a prior candidate and blocks its approval with `409`; a **published** version's approved audio can never go stale under it, since Gate 2 made definitions immutable once published), `studio_audio_generation` usage/audit recording separate from `live_voice_mode`, a failed ElevenLabs call recording a failed usage event without ever creating an asset row, the `voiceReply`-falls-back-to-`written` rule and its `usedFallbackText` flag |
| `tests/conversation-scenarios-sync-contract.test.mjs` (extended) | The production-safe bundle row shape now includes `audio`; only an **approved, hash-current** audio asset ever appears in the public bundle - a `preview` candidate never does |
| `tests/ai-conversation-matcher.test.mjs` (extended) | `scenarioFromBundleRow()` carries `audio` through into the flattened scenario shape |
| `tests/ai-conversation-router.test.mjs` (extended, 4 tests) | `route()`'s resolution carries `audioUrl`/`audioMimeType` for a matched `faq`/`surface_help` scenario with approved audio for the current language; `null` when unavailable, wrong language, or the scenario is `data_query` |
| `tests/chat-dock-core.test.mjs` (extended, 2 tests) | `audioUrl`/`audioMimeType` thread through `sendChat()`'s own return shape unchanged; a HIGH-confidence match with approved audio still makes **zero** `/api/ai/chat` calls - the Gate 1/2 invariant is preserved, this gate only ever adds metadata to an already-zero-network path |
| `tests/ai-voice-output-resolver.test.mjs` (new) | The pure `resolve({source, hasAudio})` truth table: non-voice always `TEXT_ONLY` regardless of `hasAudio`; voice+audio `PUBLISHED_AUDIO`; voice+no-audio `DYNAMIC_TTS` |
| `tests/ai-voice-playback-controller.test.mjs` (extended, 6 tests) | An entry with `audioUrl` calls `playAudioUrl` instead of `speak`, never both on success; `onAudioStart` fires exactly once, before `playAudioUrl` resolves; a `playAudioUrl` failure falls back to `speak(text)` for the **same** entry (never re-running business logic); a missing `playAudioUrl` option gracefully falls back to `speak()` (feature-detected, never throws); `interrupt()` stops a currently-playing published-audio entry via the same injected `interrupt()` function |
| `tests/ai-voice-realtime-adapter.test.mjs` (extended, 7 tests) | `playAudioUrl` is dedicated/exported and never routed through `speak()`/`speakViaOpenAI()`/`speakViaElevenLabs()`; uses a **third**, dedicated `<audio>` element, never reusing `elevenLabsAudioEl`; does not require a live `session`; resolves on a natural end but **rejects** on a real failure (error/timeout/`play()` rejection) - the deliberately different contract from `playElevenLabsAudio()`, since this path has a further fallback available; resolves (never rejects) when stopped via `interrupt()`/teardown, since that is an intentional stop, not a broken file, and `PlaybackController` has already settled the entry itself by then; `interrupt()` and `teardownTransport()` both stop any in-flight published-audio playback unconditionally |
| `tests/ai-voice-realtime-adapter.test.mjs` (chatDockView.jsx section, extended, 4 tests) | `submit()` threads `audioUrl`/`audioMimeType` through unconditionally; `PlaybackController.create()` is wired with `playAudioUrl`, read fresh from `voiceRef.current`; the voice `onResult` wiring calls the resolver with `source:'voice'` before ever enqueuing an `audioUrl`, and degrades to `DYNAMIC_TTS` (never `PUBLISHED_AUDIO`) if the resolver module is missing; a typed (text-source) `submit()` structurally never reaches this wiring at all |
| `tests/ai-voice-chatdock-ux.test.mjs` (regex updated) | Existing Gate-pre-3 assertions on the exact `enqueue()` call text updated to include the new `audioUrl` argument - no behavioral change to what those tests actually verify |
| `tests/admin-conversation-scenarios-contract.test.mjs` / `tests/admin-conversation-studio-i18n.test.mjs` (re-run, unmodified) | Confirm the new `uploadsDir` threading through `routes.mjs`/`app.mjs` and the new admin i18n keys caused zero regression to the existing Conversation Studio contract/i18n suites |

All of the above are real, dynamic tests (real Express app + real in-memory repo for the server
side, real `vm.runInNewContext`-loaded browser source for the client side), **except** the
`aiVoiceRealtime.js`/`chatDockView.jsx` additions, which follow this repo's own pre-existing,
explicitly-documented convention for that one file: static-source regex assertions on structure
(`tests/ai-voice-realtime-adapter.test.mjs`'s own header comment explains why - `RealtimeSession`,
`getUserMedia`, and `RTCPeerConnection` cannot be constructed under `node --test`, so the real proof
for that file has always been real-browser verification, with these tests acting as regression
guards against a structural regression, not a functional one).

### A real bug found and fixed during this gate

`listPublishedForBundle()` (the repo layer, both `repo.pg.mjs`/`repo.memory.mjs`) was correctly
extended to include `audio` on each bundle row - but
`server/community/routes.conversation-scenarios-sync.mjs`'s own `res.json()` call explicitly
whitelists which fields reach the public bundle via `scenarios.map((s) => ({...}))`, and the repo
change alone was not reflected there. Caught by the sync-contract test's own shape assertion
(`Object.keys(row).sort()`) failing to include `'audio'` - fixed by adding `audio: s.audio || {}`
to that route's own mapping. Recorded here because it is a real, generalizable lesson matching
Gate 2's own "route-level whitelists don't inherit repo-layer changes for free" pattern - the same
class of gap `conversation-publishing.md` already documents this route as deliberately guarding
against for every *other* field.

A second, narrower fix: the new admin audio-generation route needs `uploadsDir` to call
`saveAudio()`, but `server/admin/routes.mjs`'s `router(repo)` and
`server/community/app.mjs`'s mount call didn't pass it through. Threaded `uploadsDir` through
`app.mjs` -> `routesAdmin.router(repo, uploadsDir)` -> `routes.mjs`'s own `router(repo, uploadsDir)`
-> `conversationScenariosRouter(repo, uploadsDir)`; verified no regression via
`tests/admin-conversation-scenarios-contract.test.mjs`/`tests/admin-voice-providers-contract.test.mjs`
(both already pass `uploadsDir` as `/tmp` in their own `createApp()` calls, so this would have
surfaced immediately as a wiring error if missed).

A test-isolation fix worth recording alongside Gate 2's own lesson (`conversation-testing.md`): the
initial `'a failed ElevenLabs call...'` test asserted a failure count via
`repo.voiceTtsUsage.aggregateByLanguage({})`, but since the repo/server instance persists across
every test in the file, prior successful generations in earlier tests had already incremented that
aggregate, producing a false failure unrelated to the actual behavior under test. Fixed by
switching to `repo.voiceTtsUsage.recent({limit: 1})`, which checks only the most-recently-recorded
event and is unambiguous regardless of test execution order or accumulated history - a more robust
pattern than an aggregate query whenever a test file shares one long-lived repo instance across all
its cases.

## Manual browser checklist - **NOT YET PERFORMED**, reported honestly

No live-browser-driving tool, and no live ElevenLabs credential, was available in this session (the
same disclosed limitation as Gates 1-2, and explicitly anticipated by this gate's own brief). Before
relying on this gate in production, a human should walk through:

**Admin (Conversation Studio):**
1. Open a published, audio-eligible (`faq`/`surface_help`) scenario, e.g. `session.purpose`.
2. In the new "Published audio" panel, pick a real ElevenLabs credential, load its voices, pick a
   voice, and click Generate for one language. Confirm a preview player appears and actually plays
   real synthesized speech through the browser.
3. Click Approve. Confirm the panel now shows it as approved/live, and confirm via
   `GET /api/sync/conversation-scenarios` (Network tab) that this scenario's bundle row now carries
   a real `audio[language].standard.url`.
4. Start a new revision, edit that language's spoken/written response text, and confirm the
   previously-approved asset is now flagged stale in the UI and (if a fresh preview is generated
   against the *old* text somehow) that approval is refused with `409`.
5. Publish the new revision. Confirm the *old* published version's approved audio is untouched
   (still approved, still playable) - a published version's own audio can never go stale under it.
6. Generate audio for a `kind: 'data_query'` scenario and confirm the panel shows the
   not-eligible explanation with no Generate button/network call at all.

**User app, Voice Mode (a different browser tab/session than the admin one above):**
7. Open Voice Mode, ask (by speaking) the exact question the approved audio was generated for.
   Confirm, via the Network tab: **no** `/api/ai/chat` call, **no** `POST /api/ai/voice/speak`
   call, and the pre-generated file itself is fetched/played (its URL should be visible as a media
   request). Confirm the written transcript/reply still renders normally.
8. Rename/replace the approved file on disk (or otherwise force a load failure) and repeat step 7 -
   confirm the turn falls back to the normal live TTS engine (a `speak`/`/api/ai/voice/speak` call
   now appears) rather than silently producing no audio, and confirm this fallback never triggers a
   second `/api/ai/chat` call.
9. While the published clip is playing, speak again (barge-in) - confirm playback stops
   immediately, exactly like it does for a live ElevenLabs or OpenAI-Realtime-spoken reply.
10. Type (don't speak) the exact same question in the chat input. Confirm the written reply
    appears normally and **no audio autoplays** - published audio must only ever play for a real
    Voice-sourced turn.
11. Confirm a fresh page load / Voice reconnect mid-playback correctly tears down the published
    `<audio>` element without leaving stale audio playing into the new session.
12. Repeat steps 7-10 in at least one non-English language with approved audio, to confirm
    language-specific selection (`audio[language]`, never a wrong-language fallback).

## Regression discipline

Every existing Gate 1/2 test either still passes unmodified or was updated to reflect a genuine,
intentional shape change (the `enqueue()` call gaining an `audioUrl` argument, the public bundle
row shape gaining `audio`). The full suite (`npm test`) is green - **1952/1952** - after this gate.
`npm run ai:knowledge:check` re-ran clean. `npm run build`'s four character-app bundles
(`navrya-{hunter,commander,engineer,sage}-sessions-app.js`, the actual product of
`navrya-src/build.mjs`, which is what packages this gate's `chatDockView.jsx`/`aiVoiceRealtime.js`
changes for real browser use) all built cleanly (449 modules transformed each). The build script's
final, separate top-level `vite build` step failed in this sandboxed environment with `'vite' is
not recognized` - traced to `node_modules/.bin/vite` being absent from this environment's
`node_modules` entirely (confirmed via `npx vite build` failing identically, and the `vite` package
itself being present with a normal `bin` entry) - a pre-existing local-environment install gap,
unrelated to any change in this gate, and outside this gate's scope to repair.
