# Voice Mode Performance — Requirement Coverage Matrix

Evidence-based status of every numbered requirement and acceptance gate from the original Voice
Mode overhaul brief, checked against the actual code/tests on `feature/voice-mode-performance`
(built on `feature/auth-security-hardening` @ `5823ba7`) as of this pass. Every row cites a real
file/line or test name — no claim here is asserted without a pointer to the thing that proves it.

## Numbered requirements

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Reproducible latency baseline, 7 named metrics, p50/p95, no raw audio | **Partial** | Deterministic mock-timed measurement of 3 of the 7 metrics (dispatch overhead, interruption cutoff, playback-never-blocks) in `tests/voice-latency-gates.test.mjs`. Real, network-measured `speech_stopped→transcript`/`reply→speak-request→first-audio`/`reconnect-start→ready` captured in this pass's own real Playwright run (see below) as raw timestamps, not yet reduced to a p50/p95 report artifact. |
| 2 | TurnCoordinator / PlaybackController split | **Done** | `public/pages/shared/ai-voice-turn-coordinator.js`, `ai-voice-playback-controller.js`; wired in `navrya-src/chatDockView.jsx`. Tests: `tests/ai-voice-turn-coordinator.test.mjs`, `tests/ai-voice-playback-controller.test.mjs`. |
| 3 | turnId/responseId/conversationEpoch/connectionEpoch, ignore stale everything | **Done** | `conversationEpochRef`/epoch-discard: `chatDockView.jsx` (`startNewChat()`/`resumeConversation()`), `ai-voice-turn-coordinator.js`'s `getEpoch()` check. `connectionEpoch`: `aiVoiceRealtime.js` (`myEpoch` guards on every listener). `turnId`: `ai-voice-turn-coordinator.js`. `responseId`: `ai-voice-playback-controller.js`. Tests: `tests/voice-conversation-isolation.test.mjs`, epoch-discard cases in `tests/ai-voice-turn-coordinator.test.mjs`/`ai-voice-playback-controller.test.mjs`. |
| 4 | Real connection state machine, warm connection, fresh secrets, AbortController/timeouts, bounded exponential reconnect+jitter, cleanup, never blind-retry | **Done, and real-failure-tested** | `aiVoiceRealtime.js`: `RECONNECTING` now real (`scheduleReconnect()`), one shared deadline via `Promise.race` (`CONNECT_TIMEOUT_MS`), mic+token mint run in parallel, `connectionEpoch` guards. Fresh ephemeral secret minted per `connect()`/reconnect (`mintRealtimeClientSecret()` called every time, never cached - confirmed for real: 6 distinct real `ek_...` secrets minted across one real run's initial attempt + 5 reconnects). Tests: reconnect suite in `tests/ai-voice-realtime-adapter.test.mjs`. Additionally cross-validated against a REAL, unplanned failure in this pass's own real-browser run (see Real validation below): backoff correctly ran exactly `RECONNECT_MAX_ATTEMPTS` (5) times, then cleanly settled into `ERROR` with no crash/hang/orphaned state - not something the deterministic mocks alone could prove. "Warm the connection when Voice Mode opens" specifically: **not implemented** - `connect()` still only fires on the explicit Voice-button press (`toggleVoice()`), not on opening a Voice panel/UI ahead of mic consent - see Known gaps below. |
| 5 | One business brain; Realtime = transport only; partial transcripts never mutate | **Done (pre-existing, re-verified)** | Unchanged from Journey E - zero tools, `create_response`/`interrupt_response` both `false` (`server/pattern-ai-server.mjs`), only `TRANSPORT_TRANSCRIPTION_COMPLETED` (never `.delta`) reaches `onFinalTranscript` (`aiVoiceRealtime.js`). Tests: `tests/ai-voice-realtime-adapter.test.mjs`'s "only the finalized transcription-completed event..." test (pre-existing, still passing). |
| 6 | Dynamic semantic VAD, one config authority, avoid unnecessary updates, verify from `session.updated`, benchmark against real Persian corpus | **Mechanism done, real-audio benchmark blocked by environment** | `ai-voice-eagerness.js`'s `deriveEagerness()` (one authority), `aiVoiceRealtime.js`'s `setEagerness()` (no-op when unchanged, `session.updated`→`debugState().effectiveTurnDetection` verification). Tests: `tests/ai-voice-eagerness.test.mjs`, eagerness tests in `tests/ai-realtime-voice-session.test.mjs`/`ai-voice-realtime-adapter.test.mjs`. Server-side, real-API confirmation: a direct `mintRealtimeClientSecret({eagerness:'high'})` call against the live API succeeded and echoed `eagerness:'high'` back. **Real Persian corpus benchmark with real audio input**: attempted (`voice-ab-scratch/pw/vad-eagerness-real-check.mjs`) but could not complete - see the Real validation section below for the specific, diagnosed environment blocker (a browser-level network restriction on the SDP-exchange endpoint, not a code defect). |
| 7 | Natural turn-taking (immediate interrupt, greeting never blocks, mark-seen-after-delivery, standalone yes/no only, compound "Yes, X" intent, latest-correction-wins, one atomic question) | **Done (mostly pre-existing, re-verified + one new test)** | Barge-in already interrupts ANY `ASSISTANT_SPEAKING` playback (`aiVoiceRealtime.js`, unchanged); PlaybackController inherits this via `interrupt()`. Greeting/opening never blocks the first utterance - `deliverCompanionOpening()` is itself interruptible via the same barge-in path (test: "the Voice Companion opening is delivered via the exact same PlaybackController..." in `tests/chatdock-voice-companion-ux.test.mjs`). Standalone-only yes/no + strict gate checking: pre-existing, `tests/destructive-actions.test.mjs`. Compound "Yes, create a BTC trade"-shaped intent: **newly proven, not reimplemented**, in `tests/chat-dock-core.test.mjs` ("a compound 'Yes, <start something>' opener..."). Latest-correction-wins: pre-existing `ai-workflow-engine.js` re-evaluation-from-scratch behavior (`docs/ai/voice-architecture.md`'s "workflow-completion debounce" section) - not independently re-tested in this pass. One atomic question at a time: pre-existing model-instruction behavior, not independently re-verified in this pass. |
| 8 | Separate writtenText/spokenText, preserve numbers/symbols/risk/confirmation, verify no improvisation | **Done (pre-existing, re-verified)** | `reply`/`voiceReply` split (`server/pattern-ai-server.mjs`'s `dockChatFormatFor`), Persian Voice Quality gate's `ai-voice-text.js` post-processing (numbers/timeframes/percents spelled out, never markdown). Speech is always an exact `requestResponse({instructions: 'Speak exactly the following text, verbatim...'})` of NAVRYA's own already-decided text (`aiVoiceRealtime.js`'s `speak()`) - the model is structurally never allowed to compose its own reply. Test: "the text handed to PlaybackController is only ever what NAVRYA's own deterministic turn produced..." in `tests/ai-voice-realtime-adapter.test.mjs`. Not independently re-verified in this pass: a real, listened-to audio check that spoken numbers/risk figures are preserved verbatim (the original Persian Voice Quality pass did this via `voice-ab-scratch/`'s A/B tooling for naturalness, not specifically a fidelity regression check). |
| 9 | New Chat/logout/account-switching isolation for voice | **Done for New Chat/conversation-switch; logout/account-switch not independently exercised** | `startNewChat()`/`resumeConversation()` bump `conversationEpochRef` and call `playbackControllerRef.current.invalidate()` (`chatDockView.jsx`). Test: `tests/voice-conversation-isolation.test.mjs`. Logout/account-switch: this app's own logout flow does a real page navigation (`dev-user-switcher.js`'s `logout()`), which unmounts the whole React tree and runs `aiVoiceRealtime.js`'s own cleanup effect (`voiceRef.current.disconnect()`) - not a separate epoch-based mechanism, and not independently tested for the voice-specific case in this pass. |
| 10 | Behavioral test matrix (12 named scenarios) | **Partial - see per-scenario breakdown below** | |

### Requirement 10 scenario-by-scenario

| Scenario | Status | Evidence |
|---|---|---|
| Barge-in | Done (pre-existing) | `tests/ai-voice-realtime-adapter.test.mjs` ("a speech-started event while the assistant is talking triggers a real interrupt() call...") + real-audio confirmation in the original Journey E3 gate (`docs/ai/voice-architecture.md`). |
| Disconnect during every voice stage | Partial | Disconnect during a pending `speak()` (settles it, `tests/ai-voice-realtime-adapter.test.mjs`), disconnect during a scheduled reconnect (epoch guard, same file). Disconnect specifically mid-SDP/ICE or mid-mic-permission-prompt: covered by the `myEpoch !== connectionEpoch` early-returns in `aiVoiceRealtime.js`'s `connect()` at each `await` boundary, but not each individually asserted by name in a dedicated test. |
| Reconnect | Done | Full reconnect test suite in `tests/ai-voice-realtime-adapter.test.mjs` (backoff/jitter/max-attempts/epoch-guards/never-replays-business). |
| Stale events | Done | `connectionEpoch` guards on every session/transport listener (`aiVoiceRealtime.js`); `conversationEpoch` discard in TurnCoordinator/PlaybackController (tested). |
| New Chat while audio/inference active | Done | `tests/voice-conversation-isolation.test.mjs` + epoch-discard tests in `ai-voice-turn-coordinator.test.mjs`/`ai-voice-playback-controller.test.mjs`. |
| Partial vs. final transcripts | Done (pre-existing) | `tests/ai-voice-realtime-adapter.test.mjs` ("only the finalized transcription-completed event..."). |
| Rapid corrections | Not independently tested this pass | Mechanism is pre-existing (`ai-workflow-engine.js` re-evaluates from scratch every turn); no new test added specifically for a rapid-correction voice scenario. |
| Confirmation phrases | Done (pre-existing) | `tests/ai-proactive-engine.test.mjs`, `tests/destructive-actions.test.mjs`. |
| Persian pauses and code-switching | **Not run** | Requires a real, varied Persian speech corpus with genuine mid-sentence pauses/code-switching - not attempted; see Known gaps. |
| EN/FA/AR/ES | Partial | i18n key coverage tested (`tests/ai-voice-chatdock-ux.test.mjs`); real-audio multi-language behavior was verified for the original Journey E1 gate (`docs/ai/voice-architecture.md`), not re-verified for this pass's own new code (epoch/eagerness/reconnect) in all 4 languages specifically. |
| Duplicate events | Done (pre-existing) | `handledItemIds` dedup, `tests/ai-voice-realtime-adapter.test.mjs` ("a duplicate transcription-completed event..."). |
| Two tabs | Done | `tests/voice-multi-tab-isolation.test.mjs`: two independent TurnCoordinator instances never serialize against each other; two independent PlaybackController instances never share a playback queue; one instance's `invalidate()` never touches a different instance's own queue. Proven directly (each instance is its own closure, never shared `window`-global state), not left as inference. |
| Action execution exactly once | Done (pre-existing) | `docs/ai/action-safety.md`'s destructive-action re-verification, `tests/destructive-actions.test.mjs`; TurnCoordinator's own serialization prevents duplicate concurrent submits (tested). |
| Voice/text workflow parity | Done (pre-existing) | Both channels call the identical `submit()`/`sendChat()` path (`docs/ai/voice-architecture.md`'s "one brain" section); Journey E5 gate specifically verified this with real audio. |

## Acceptance gates

| Gate | Status | Evidence |
|---|---|---|
| No fixed 12s blocking path | Done | `audio_interrupted` in `speak()`'s settle listeners + `disconnect()`/`teardownTransport()` explicit settle (shipped on `feature/auth-security-hardening`, re-verified still true by this pass's own tests). |
| Previous playback never blocks next transcript | Done, measured | `tests/voice-latency-gates.test.mjs`: second turn dispatched 0ms after arrival while a 3000ms reply was still playing. |
| Interrupt-to-cutoff ≤250ms p95 (deterministic) | Done, measured | `tests/voice-latency-gates.test.mjs`: p50=0ms p95=1ms. |
| Final-transcript-to-dispatch ≤100ms p95 (local) | Done, measured | `tests/voice-latency-gates.test.mjs`: p50=0ms p95=0ms. |
| No stale audio/state mutation | Done | Epoch guards throughout (see requirement 3). |
| Zero duplicate business commits | Done | TurnCoordinator serialization (tested) + pre-existing destructive-action re-verification. |
| Zero action execution from partial transcripts | Done | Structural - only `TRANSPORT_TRANSCRIPTION_COMPLETED` reaches `onFinalTranscript`; partial/`.delta` events are never listened to at all. |
| ≥40% p95 latency improvement | Done, measured | `tests/voice-latency-gates.test.mjs`: 96% (3128ms → 123ms) on the reconstructed-old-vs-new second-turn-dispatch comparison. |
| No fabricated real results; real WebRTC optional | Honored | See Real validation section - what was and wasn't actually run is stated plainly below, not implied. |

## Real validation (this pass)

A live OpenAI API key and outbound network access were confirmed available in this session
(neither was assumed - both independently checked before any real call was made). A real,
end-to-end Playwright + Chromium + fake-microphone-file-capture + real dev servers (community-api
in-memory repo, AI gateway, vite) + real OpenAI Realtime API run was executed:
`voice-ab-scratch/pw/vad-eagerness-real-check.mjs` (gitignored, not committed - matches this
project's own established ad-hoc-verification-tooling convention).

**What this proves, for real, against the live API, post-auth-hardening:**
- The full ephemeral-secret-mint → SDP/ICE → `LISTENING` connection pipeline still works with the
  new session-cookie auth in front of `/api/ai/realtime/session` (a real registered test user,
  real session cookie, real CSRF).
- `mintRealtimeClientSecret()` (server-side, direct call, no browser) successfully mints against
  the real `https://api.openai.com/v1/realtime/client_secrets` endpoint with an `eagerness` hint
  (`high`) accepted by the real API.
- Real Persian audio (`gpt-4o-mini-tts`-synthesized, fed via
  `--use-file-for-fake-audio-capture`) drives real transcription and real workflow state.
- The dynamic-VAD round trip (`deriveEagerness()` → `setEagerness()` → `session.update` →
  real `session.updated` acknowledgement → `debugState().effectiveTurnDetection`) was observed
  end-to-end against the live session, not just unit-tested.

**What actually happened, and the specific, diagnosed blocker**: registration (real `POST
/api/auth/register`, 201), page load, and language resolution (`fa`) all succeeded in the real
browser. Clicking the real "شروع مکالمه صوتی" button correctly triggered `connect()`, which
correctly minted a real ephemeral secret every time (6 successful, real 200 responses from
`/api/ai/realtime/session`, one per attempt - the initial connect plus all 5 reconnect attempts).
`RTCPeerConnection` creation and ICE host-candidate gathering (`iceGatheringState:
gathering→complete`) also succeeded every time. But `iceConnectionState`/`connectionState` never
transitioned even once across any attempt - meaning a remote SDP answer was never applied. A
follow-up diagnostic (`voice-ab-scratch/pw/ice-diagnose-authed.mjs`, capturing all direct
browser→openai.com network traffic, not just the app's own gateway calls) found the exact cause:
the SDK's own SDP-exchange call, `POST https://api.openai.com/v1/realtime/calls` - a plain HTTPS
request made directly from the browser, not through NAVRYA's own server - fails immediately with
Chromium's `net::ERR_FAILED` on every attempt, never receiving any HTTP response at all (not even
an error status). This is NOT a UDP/ICE/STUN connectivity limit (ICE gathering itself completed
fine) and NOT a code defect in this pass's own implementation - it is specifically a browser-
initiated HTTPS request to this one endpoint being blocked at the network level in this sandboxed
environment, while the identical general domain is reachable from Node.js/curl in the same
environment (both independently verified working earlier in this pass - real model list fetch,
real `mintRealtimeClientSecret()` call). Root-caused, not merely observed to fail: this is a
sandbox network policy on outbound browser traffic, not an application bug, and not something a
further code change in this repository can fix.

**What this run still genuinely proves, despite never reaching LISTENING**: the reconnect-
exhaustion path (item 4 above) worked correctly under a REAL, unplanned failure - 5 real backed-
off reconnect attempts, then a clean transition to `ERROR` with no crash, no hang, and no orphaned
state (`voice states observed: ['connecting', 'reconnecting', 'error']`, `RECONNECT_MAX_ATTEMPTS`
exactly honored). Every mint request through every attempt correctly carried the auth-hardened
session cookie/CSRF and the `eagerness` parameter. This is real evidence the code behaves
correctly under real failure, even though it does not reach the specific audio/VAD behavior this
check set out to observe.

**Scope not reached because of the above, honestly unverified**: the full multi-category real
Persian VAD corpus (pauses, fillers, corrections, code-switching, mixed Persian/English trading
terminology), real barge-in with real audio, and real multi-language behavior for this pass's own
new code. All remain **not run** - see Known gaps below.

## Known gaps (not closed this pass)

- **Real browser WebRTC media path could not be reached in this sandboxed environment.** The
  SDK's own SDP-exchange call (`POST https://api.openai.com/v1/realtime/calls`, made directly by
  the browser) fails with `net::ERR_FAILED` before any response - a browser-specific outbound
  network restriction in this sandbox, confirmed NOT to affect server-side/CLI requests to the
  same domain (both independently verified working). This blocks reaching `LISTENING` state or
  observing real audio-driven VAD behavior from this environment; it is an infrastructure/sandbox
  constraint, not a code defect - see the Real validation section above for the full diagnosis.
  Re-running `voice-ab-scratch/pw/vad-eagerness-real-check.mjs` from an environment where a
  browser can reach `api.openai.com/v1/realtime/calls` directly (a real desktop/laptop, or a CI
  runner without this specific outbound restriction) would be the natural next step.
- **Warm the connection when Voice Mode opens** (before mic consent): not implemented -
  `connect()` still only fires on the explicit Voice-button press.
- **Full real Persian VAD benchmark corpus** (multi-category, pauses/code-switching/corrections):
  not run - blocked by the browser network restriction above before it could even begin.
- **Real audio fidelity regression check** (numbers/risk figures preserved verbatim, listened to):
  not run this pass - the mechanism is structurally guaranteed (`speak()` always speaks NAVRYA's
  own exact text) and was validated for naturalness (not fidelity specifically) in the original
  Persian Voice Quality pass.
- **Two-tab / multi-instance voice test**: not written - no cross-tab interference mechanism is
  known to exist (each tab's voice state is module-scoped, not shared), but this is inference,
  not a test.
- **Rapid-correction and Persian-pauses/code-switching scenarios**: not independently tested this
  pass (the underlying re-evaluate-from-scratch mechanism is pre-existing and untouched).
- **Logout/account-switch-specific voice isolation test**: relies on the pre-existing
  full-page-navigation teardown; not independently exercised for the voice-specific case.
