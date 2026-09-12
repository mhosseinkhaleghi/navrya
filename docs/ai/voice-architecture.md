# Realtime Voice (Journey E)

`navrya-src/aiVoiceRealtime.js` → `window.TradeJournalAIVoiceRealtime` (browser transport adapter)
`server/pattern-ai-server.mjs` → `mintRealtimeClientSecret()` / `POST /api/ai/realtime/session`

`navrya-src/geminiLiveVoice.js` → Gemini Live browser transport adapter
`server/pattern-ai-server.mjs` → `POST /api/ai/gemini-live/session` / `WS /api/ai/gemini-live/socket` / `POST /api/ai/gemini-live/speak`

Adds OpenAI Realtime Voice (browser WebRTC) as a second input/output *channel* for the existing
ChatDock/Copilot runtime. It is not a second AI brain: the Realtime model never decides what
NAVRYA should do or say. It transcribes speech and, on request, reads back an exact sentence
NAVRYA already decided on through its normal text pipeline (Context Engine, Action Registry,
Workflow Engine, Proactive Engine, Knowledge Base - all of Journeys A-D, untouched).

## Status

All six gates are complete, each verified in a real browser against the real OpenAI Realtime API
(never simulated text events) before being marked done:

| Gate | Scope | Result |
|---|---|---|
| E0 | Realtime connection (ephemeral credentials, WebRTC, transcription→core routing, spoken reply) | PASS |
| E1 | Session Voice, full multi-turn flow, all 4 languages (EN/FA/AR/ES) + spoken self-correction | PASS |
| E2 | Trade Voice - multi-field extraction from spoken input, correct array-shaped output | PASS |
| E3 | Correction + interruption (barge-in) | PASS |
| E4 | Proactive Voice - Journey C's risk-limit confirmation reachable and resolvable by voice | PASS |
| E5 | Text/voice continuity, both directions, including a Journey C confirmation surviving a channel switch | PASS |

See `docs/ai/voice-testing.md` for the full test methodology and the complete bug list found and
fixed during each gate. This document covers architecture and design rationale only.

## Why "one brain, not two conversations"

The Realtime API is capable of holding its own conversation, reasoning about what to say, and
calling tools directly. Using it that way here would create a second, parallel decision-maker
with no access to NAVRYA's Action Registry, Workflow Engine, Proactive Engine, or Knowledge Base -
exactly the anti-pattern the Journey E spec explicitly forbids. Instead:

1. The Realtime session is given **zero tools** and an instruction that it must never answer
   questions, decide anything, or take an action itself - only transcribe speech, and speak back
   an exact sentence when told to.
2. `turn_detection.create_response` and `interrupt_response` are both `false` at session-mint
   time (`mintRealtimeClientSecret()`). The API still runs VAD and reports finalized turn
   boundaries, but it never auto-generates a spoken reply on its own - NAVRYA is always asked
   first ("RESPONSE CONTROL": NAVRYA inspects a finalized turn before the model is ever allowed
   to speak).
3. A finalized transcript (`conversation.item.input_audio_transcription.completed` - **never**
   the `.delta` interim event) is handed to `chatDockView.jsx`'s existing `submit()`, the exact
   same function a typed message already goes through. Same Context Engine snapshot, same
   Action Registry catalog, same Workflow Engine, same Proactive Engine, same Knowledge Base, same
   `activeConversationId`/transcript/popover state. Voice and text are the same conversation.
4. Once that call resolves with NAVRYA's own reply, the adapter calls
   `session.transport.requestResponse({ instructions: 'Speak exactly the following text, verbatim, and nothing else: "..."' })`
   - a one-off `response.create` with an instruction override, never `sendMessage()` (which would
   inject a fake user turn and let the model reason about its own answer).

```
Mic → getUserMedia → RealtimeSession (WebRTC) → OpenAI Realtime API
                                    │  (transcription only, zero tools,
                                    │   create_response: false)
                                    ▼
              conversation.item.input_audio_transcription.completed
                                    │  (finalized text only - never .delta)
                                    ▼
      chatDockView.jsx submit(text, { source: 'voice' })  ◄── same function typed
                                    │                          messages already use
                                    ▼
  Context Engine / Action Registry / Workflow Engine / Proactive Engine / Knowledge Base
                                    │
                                    ▼
                     { reply, voiceReply } from dockChat()
                                    │
                                    ▼
        session.transport.requestResponse({ instructions: speak(voiceReply) })
```

## Gemini Voice: separate transport, same decision path

Gemini Voice is an additive option selected by choosing Gemini in the existing provider control;
it does not replace or change the OpenAI Voice path. Its microphone audio uses a server-minted,
one-use constrained token over NAVRYA's same-origin WebSocket relay. The relay validates the real
NAVRYA session plus a user-bound, atomically consumed token lease before opening the fixed Gemini
upstream. This avoids production networks that block browser-direct Google WebSockets without
turning the endpoint into a general proxy. The browser never gets `GEMINI_API_KEY`.

Gemini Live is deliberately used for finalized transcription rather than autonomous replies.
Each final transcript still takes the same `chatDockView.jsx` → `submit()` route above. Gemini TTS
then renders only the resulting approved `voiceReply`/`reply`; it has no access to tools, action
selection, workflow state, or the ability to alter the answer. This preserves the one-brain
contract and keeps text, OpenAI Voice, and Gemini Voice in one conversation.

The server controls `GEMINI_LIVE_MODEL` (default `gemini-3.5-transcribe-live`) and
`GEMINI_TTS_MODEL` (default `gemini-3.1-flash-tts-preview`). They are supplied to the `pattern-ai`
service only. The Gemini integration is implemented and regression-tested, but it is not marked
browser-verified or release-ready until a signed-in user completes a real Gemini key/billing test.

### Character delivery and the Admin Gemini fallback

Voice remains one approved decision path, but delivery is now role-specific. The selected
Hunter, Commander, Market Engineer, or Market Sage is sent with a voice turn; `dockChat()` adds
the corresponding communication frame to the approved reply, OpenAI Realtime mints a role-specific
built-in voice and delivery instruction, and Gemini TTS selects its role/gender profile with the
same constraint that it must read the approved text exactly. The deterministic Voice Companion
opening introduces that selected role in the current interface language before the factual
Journey opening.

Admin → AI exposes the effective Gemini fallback model, its source (Admin override, environment,
or reviewed code default), and a strict allowlisted selector. Saving it is audited and reaches the
DB-free gateway through the internal model-config bridge within its short cache window. A trader's
explicit model selection still wins for that one request; the Admin setting governs model-less
calls such as the server-side connection test and default runtime fallback.

### Gemini Voice Profiles

Gemini Voice appears as its own final Admin section, separate from provider keys/model selection
and ElevenLabs. Each fixed role has a reviewed default male/female Gemini voice, a **speech
delivery rule**, and a **spoken interaction rule**. The defaults explicitly define audible
character: Hunter is watchful and measured, Commander purposeful, Engineer structured, and Market
Sage an elder, warm, resonant, unhurried mentor. The profile editor is allowlisted for roles and
prebuilt voices, bounded in length, audited, and persisted through
`admin_gemini_voice_profiles`.

**Test rule** sends the unsaved profile draft only to the admin-only Gemini Live/TTS diagnostic and
returns a short playable role greeting. It never stores the draft. **Save role rule** makes the
same profile live through the DB-free internal bridge. The speech rule affects Gemini TTS. The
interaction rule is added only to a Gemini Voice-originated turn and is explicitly delivery-only;
the OpenAI conversation brain, deterministic workflow, facts, warnings, and confirmations remain
authoritative. Profile reads are best-effort background refreshes: a cold, slow, or unavailable
Admin bridge uses the last known/default delivery profile immediately and can never delay, abort,
or otherwise interrupt the GPT decision call.

## E2/E4/E5 needed zero action- or feature-specific voice code

This is the architecture's central claim, and E2/E4/E5 are the proof of it, not just gates that
happened to pass. Trade Voice (E2 - a second, unrelated action with five required fields and an
array-shaped `takeProfits` output), Proactive Voice (E4 - Journey C's strategy-risk-limit
confirmation), and text/voice continuity (E5, including a pending confirmation surviving a channel
switch) all worked correctly the moment a finalized transcript reached `submit()`, with **no new
per-action or per-feature branch anywhere in the voice adapter or `chatDockView.jsx`**. That is a
direct, structural consequence of §"one brain" above: `trade.calculator`'s field extraction,
`ai-proactive-engine.js`'s `pendingConfirmation()`, and `activeConversationId`/`workflowEngine`
state are all plain module-level state shared by every caller of `submit()`, regardless of which
channel produced the text. The one genuine gap this exposed - a spoken numeric utterance being
harder to transcribe accurately than typed text - lives entirely in the transcription/extraction
layer (see "Transcription accuracy" below), not in how any given action or channel is wired.

## Ephemeral credentials

The permanent `OPENAI_API_KEY` never reaches the browser. `POST /api/ai/realtime/session`
(`mintRealtimeClientSecret()`) resolves a key the same three-tier way `callProvider()` already
does for every other AI route (per-request override → admin-configured key via the Community API
bridge → server `.env`), then calls OpenAI's **current** (2026) endpoint,
`POST https://api.openai.com/v1/realtime/client_secrets` - not the removed `/v1/realtime/sessions`
beta path some older tutorials still reference - and returns only the short-lived `value`
(`ek_...`, expires in 10 minutes by default) plus the resolved model/voice/language. Session
config (model, voice, audio format, transcription, turn detection, instructions, `tools: []`) is
baked in server-side at mint time, so a compromised browser session can't widen its own
permissions by reconnecting with different session options.

## Client adapter (`aiVoiceRealtime.js`)

Pure transport, no business rules - it never imports or calls anything from the Action
Registry/Workflow Engine/Proactive Engine directly. Built on the official
`@openai/agents-realtime` SDK (`RealtimeAgent` + `RealtimeSession` + `OpenAIRealtimeWebRTC`), not
a hand-rolled WebRTC/SDP implementation.

- `createSession({ language, fetchSession, onStateChange, onFinalTranscript, onError })` - the
  caller injects `fetchSession` (an async function hitting `/api/ai/realtime/session`) so this
  module has zero knowledge of the real HTTP endpoint, the caller's provider settings, or personal
  API keys.
- `connect()` - requests the mic (`getUserMedia`, own explicit `REQUESTING_PERMISSION` state,
  never auto-enabled on load) then opens the WebRTC session. The language passed to
  `fetchSession()` is re-read from `i18n.language()` immediately before every `connect()` call
  (in `chatDockView.jsx`'s `toggleVoice()`), not fixed once at mount - `i18n` is a stable
  singleton object with no change event, so a `useEffect` keyed on it would silently miss a
  language switch made between mounting the dock and first pressing the mic.
- State machine: `idle → requesting_permission → connecting → listening ⇄ user_speaking →
  processing → assistant_speaking → listening`, with `interrupted`/`reconnecting`/`error` as
  needed. Exposed via `debugState()` (dev diagnostic - state/language/session-active/recent event
  *types* only, never the transcript text or the ephemeral token, mirroring
  `chat-dock-core.js`'s own `debugLastTurn()` privacy posture).
- Barge-in: a `input_audio_buffer.speech_started` event while `assistant_speaking` calls the
  module's own guarded `interrupt()` (never the session directly - see "Connection-drop
  hardening" below), which stops playback via `session.interrupt()` and returns to `listening`.
  Verified with an objective, non-timing-dependent signal: a reply whose spoken form would
  naturally take ~34s to finish was cut off after ~6s of audio when barge-in speech arrived.
- `disconnect()` closes the session and stops the mic track's own tracks (the SDK's own
  `mediaStream` option keeps stream ownership with the caller specifically so this is possible).

### Turn serialization (`chatDockView.jsx`'s `voiceTurnQueue`)

`aiVoiceRealtime.js`'s transcription-completed handler fires once per finalized transcript with
no awareness of whether a prior voice turn is still being processed. Found via real E1 multi-turn
testing: two finalized transcripts arriving close together (a fast talker, or a backlog after a
slow reply) each independently called `submit()` and both raced `core.sendChat()`'s own read of
"is there already an open workflow" before either had finished starting one - producing duplicate
`session.create`/`trade.calculator` action-discovery turns instead of the second one correctly
filling the form the first had just opened. Text input never had this problem (one input field,
one submit at a time); voice needed the same guarantee made explicit. `onVoiceTranscript()` now
chains every voice-originated `submit()` + `speak()` cycle through a single `Promise` queue
(`voiceTurnQueue`), processed strictly one at a time in arrival order - "one utterance → one
Copilot turn," never two turns in flight concurrently.

### `speak()` waits for the reply to actually finish

A related discovery from the same testing pass: `speak()` used to return as soon as the
`response.create` request was sent, not once the response had actually finished playing. Combined
with the turn queue above, a *fast-resolving* next turn could still fire a second
`response.create` while the first one's audio was mid-playback - the Realtime API rejects an
overlapping response, which surfaced as a transient session error mid-conversation. `speak()` now
returns a Promise that resolves on the session's `audio_stopped` event (with a 12-second safety
timeout so a lost event can never wedge the queue), and the caller `await`s it before the next
queued turn starts.

### Connection-drop hardening

Found via real E3 barge-in testing: the underlying WebRTC data channel can drop between two turns
(a genuine, if infrequent, network hiccup - not simulated). A call made just after that happened
threw a raw, uncaught `"WebRTC data channel is not connected"` exception. `speak()`, `interrupt()`,
and `mute()` are now all guarded with try/catch, failing into the same `ERROR` state / `onError()`
path every other failure mode already uses, instead of an uncaught throw. The barge-in handler
calls the module's own guarded `interrupt()`, never `session.interrupt()` directly, so a
connection dropped at exactly that moment fails the same safe way.

### Transcription accuracy: domain vocabulary + "last value wins"

Two accuracy issues surfaced during real multi-language testing, both fixed at the layer that
actually owns them:

- **Domain vocabulary hint.** A short, low-information utterance ("five minutes" / "خمس دقائق")
  was occasionally mis-transcribed as a different, still-plausible value ("fifteen minutes") -
  dangerous specifically because a wrong-but-valid value sails through extraction uncaught. Fixed
  server-side: `mintRealtimeClientSecret()`'s transcription config now includes a `prompt`
  (describing the NAVRYA domain - cities, timeframes, trading terms, all four languages) and
  `keywords` (the literal city/timeframe tokens), the two vocabulary-hint fields the Realtime
  transcription API accepts.
- **Self-correction resolves to the wrong, superseded value.** Found via a spoken correction
  ("fifteen minutes... no, five minutes"): the reply text correctly named the corrected value, but
  the value actually applied to the trade/session was still the *first*, superseded one. Root
  cause was **not** the model, and **not voice-specific** - `ai-deterministic-extraction.js`'s
  extractors (`extractTimeframe`, `extractRiskPercent`, `extractLabeledPrice`,
  `extractSessionCity`) each used a plain `.exec()`/list-order lookup, which only ever returns the
  *first* match in the text or the first entry in a fixed list - and `mergeWithModelFields()`
  lets a deterministic match unconditionally override the model's own (in this case correct)
  extraction. A self-correction states the real intent *last*; every extractor now runs a shared
  `lastRegexMatch()` helper (and, for `extractSessionCity`, a position-sorted city-match list)
  that prefers whichever match starts latest in the text. This fixes text-input self-corrections
  too, not only voice - it was simply voice testing that first exercised the pattern.
- Both the `activeProcess` and `availableActions` branches of `dockChat()`'s system prompt also
  gained one explicit sentence: extract only the final, corrected value from a self-correcting
  message, and keep the reply text and any extracted field value in agreement with each other -
  a second, independent line of defense on top of the extraction-layer fix above.
- **Non-English field values must stay canonical.** In Arabic, the extracted `city` field value
  came back transliterated ("نيويورك") instead of NAVRYA's own canonical English form ("New
  York"). Not a crash - `character-app.jsx`'s `normalizeSessionCity()` already refuses an
  unrecognized value rather than applying something the real dropdown wouldn't accept - but it
  silently dropped a field the user clearly supplied, asking them to repeat it. Fixed with one
  more sentence in `dockChat()`'s system prompt (same two branches): keep a fixed-choice field's
  *value* in its plain canonical English form regardless of the *reply's* language. Re-verified:
  Arabic now returns `value: "New York"` while the reply text stays fully idiomatic Arabic (the
  *spoken* `voiceReply` naturally pronounces "نيويورك" while the underlying field value stays
  "New York").

### The workflow-completion debounce (`pendingSubmitTimer`)

Not a Journey E addition, but a pre-existing Journey A/B design property that voice testing made
newly relevant: once every required field is known, `ai-workflow-engine.js` does not submit
immediately - a short, cancelable `pendingSubmitTimer` window elapses first (long enough for a
same-breath correction, e.g. "no wait, make that 5 minutes," to still land before the value is
irreversibly submitted). A test that checks for a created Session/Trade immediately after the
completing turn's own network round trip can see this as "nothing happened" when the submission is
simply still pending - several apparent E1/E5 test failures during this project turned out to be
exactly this, not a defect (see `docs/ai/voice-testing.md`).

## Voice replies are shorter than written replies

Found during E0's own real-browser verification, not assumed up front: reading a full
written-Q&A-length reply back verbatim via TTS took over a minute for an ordinary product
question. `dockChat()` now accepts `source: 'voice'` (threaded from
`chat-dock-core.js`'s `sendChat({ source })` → the request body) and, only in that case, the
structured-output schema (`dockChatFormatFor(..., voiceSource)`) also requires a `voiceReply`
field alongside the unchanged `reply` - a short, natural, TTS-phrased rendering of the same
answer, in the same language. The written transcript (`reply`) is completely unaffected; only the
spoken rendering is deliberately shorter. `speak()` is called with `voiceReply || reply`.

## Persian Voice Quality pass (naturalness, on top of everything above)

A later, separate pass ("pause all feature development, make Persian voice sound natural") added,
purely additively, on top of the architecture above:

- **`ai-voice-text.js`** (`public/pages/shared/`, new): a deterministic, voice-ONLY post-processing
  layer (markup stripping, Persian number/timeframe spelling-out, a short pronunciation map) run in
  `chatDockView.jsx` right before `speak()` - never touches the written `reply`/transcript. Zero
  network, zero model calls.
- **`voiceReply` gained a real Persian spoken-style contract** (`dockChat()`'s `voiceInstruction`,
  language-gated) - previously only ever asked to be "shorter," now told written and spoken Persian
  are different registers, with concrete before/after examples.
- **The Realtime session's own `instructions` gained a Persian-only audio-delivery addendum**
  (`mintRealtimeClientSecret()`) - delivery/prosody guidance only, never a change to the
  transport's "never answer/decide/act" contract.
- **A per-language voice map (`REALTIME_VOICE_BY_LANGUAGE`) now exists** - Persian resolves to
  `marin` after a real human-listened Cedar-vs-Marin A/B; English/Arabic/Spanish stay on `cedar`.
- **A real, pre-existing bug found and fixed, unrelated to voice choice/prosody**:
  `ai-proactive-engine.js`'s five rule messages and `confirmationReply()` were hardcoded English
  literals regardless of `i18n.language()` - Journey C's own safety/confirmation text was never
  actually localized at all. Fixed by threading `language` through, defaulting to `'en'` so every
  pre-existing caller is unaffected.

Full detail, the real research on current OpenAI voice options and GPT-Live's API availability,
exact number-normalization before/after tables, and the honest "known gap vs. a native speaker"
assessment are in **`docs/ai/persian-voice-quality.md`** - this section is a pointer, not a
restatement, matching this file's own convention for other sub-passes.

## Voice Mode performance pass (`feature/voice-mode-performance`)

A later, separate pass on top of everything above ("harden Voice Mode's connection lifecycle and
stop playback from blocking the next turn"). Scope: architecture and reliability only - the "one
brain" design, the confirmation/action pipeline, and text/voice continuity above are all
unchanged. Builds on `feature/auth-security-hardening`'s own AI hardening pass (safety preflight
ordering, BYOK, atomic history append, the 12s `speak()` stall fix - see that branch's own commits
for detail); this pass does not redo or regress any of that.

### TurnCoordinator / PlaybackController split

`chatDockView.jsx`'s old `voiceTurnQueue` chained `submit()` (business/inference - the ChatDock
core call that reaches Context Engine/Action Registry/Workflow Engine/Proactive Engine) and
`speak()` (playback) into **one** serial promise per turn. A second, already-finalized transcript
arriving while the first turn's reply was still being spoken could not even start its own
`submit()` until that speech finished - so a long spoken reply silently delayed recognizing the
user's very next utterance.

Split into two independently-testable, dependency-injected plain modules
(`public/pages/shared/ai-voice-turn-coordinator.js` / `ai-voice-playback-controller.js`, loaded the
same way every other shared `ai-*.js` module is):

- **TurnCoordinator** serializes `submit()` calls against *each other only* (preserving the real
  reason the queue existed - two turns racing `sendChat()`'s own "is a workflow already open"
  check produced duplicate action-discovery turns) - never against playback.
- **PlaybackController** owns speech only: its own one-at-a-time queue, `interrupt()` (stops
  current playback and drops everything still queued), and `invalidate()` (bumps an internal
  epoch so a stale entry can never be spoken, even one already queued when the bump happened).

`chatDockView.jsx` connects them by handing a resolved turn's text to
`playbackControllerRef.current.enqueue()` - fire-and-forget, never awaited, so TurnCoordinator's
own queue moves on to the next turn immediately regardless of how long that reply takes to speak.

### turnId / responseId / conversationEpoch / connectionEpoch

- **turnId**: assigned by TurnCoordinator per finalized transcript.
- **responseId**: assigned by PlaybackController per `enqueue()` call.
- **conversationEpoch**: a ref in `chatDockView.jsx` (`conversationEpochRef`), bumped by
  `startNewChat()` and `resumeConversation()` (switching to a different past conversation is the
  same kind of "moved on" event). TurnCoordinator reads it fresh both when a turn is enqueued and
  again once `submit()` resolves - a turn whose epoch changed mid-flight is reported `discarded`
  and never reaches the transcript/caption/playback. Both callers also call
  `playbackControllerRef.current.invalidate()`, so anything already queued to be spoken from the
  old conversation is dropped too, not just future turns.
- **connectionEpoch**: owned by `aiVoiceRealtime.js`, bumped once per genuine connection attempt
  (fresh connect or reconnect). Every session/transport event listener closes over the epoch value
  active when it was registered and checks it before mutating state, so an event from a session
  that's since been superseded can never do so.

### Connection state machine and reconnect

`RECONNECTING` existed in `VOICE_STATES` from the original Journey E pass but was never actually
entered - there was no automatic reconnect at all. This pass adds it for real:

- **Bounded exponential backoff with jitter** (`RECONNECT_BASE_DELAY_MS`=500,
  `RECONNECT_MAX_DELAY_MS`=8000, `RECONNECT_MAX_ATTEMPTS`=5, jitter 50-100% of the computed delay)
  on an *unexpected* drop only - detected on the WebRTC transport's own `connection_change` event.
  Grounded against the installed `@openai/agents-realtime` SDK's own source (not assumed):
  `RealtimeSession` never re-emits `connection_change` (its `#setEventListeners()` only forwards
  raw server-sent events with a `.type` field via a wildcard listener, a fixed list of named
  transport events that does not include it), so this listens directly on the local `transport`
  object this module already constructs, not `session.on(...)`.
- Reconnect never touches TurnCoordinator/PlaybackController or replays a business side effect -
  it only calls `connect()` again, the same transport-only operation a manual retry would be.
- **One overall deadline** (`CONNECT_TIMEOUT_MS`=15000) bounds the whole attempt (mic + token mint
  + SDP/ICE + session ack combined) via `Promise.race` against a single shared deadline promise,
  not a fresh timer per phase - the installed SDK's `session.connect()` has no `AbortSignal` of
  its own, so a timeout here stops the client from waiting, not the underlying negotiation, and
  the same cleanup path a failed `connect()` already used runs regardless.
- **Mic readiness and token minting run in parallel**, not sequentially - independent until both
  are needed to actually build the transport.
- A fresh, user-initiated `connect()` always mints at server-default eagerness (`medium`); a
  reconnect mints with whatever eagerness was last in effect, so a network hiccup mid-confirmation
  doesn't silently revert the session to a slower default right when a quick yes/no is expected.

### Dynamic semantic VAD eagerness

`turn_detection.eagerness` was a fixed `'medium'` at mint time. Now:

- `public/pages/shared/ai-voice-eagerness.js`'s `deriveEagerness()` is the **one configuration
  authority** - a pure, deterministic function from real post-turn workflow state (never a second,
  invented signal): `'high'` when exactly one short, closed-form field remains (a yes/no gate -
  `confirm`/`confirmDelete`/`confirmPublish`/`send`/`publish` - or a short slot like
  city/timeframe/a price/a percent); `'low'` for a remaining long-form field (note/description/
  evidence/problem/trigger/reviewText), an explicit Companion "Explain" turn, or Therapist Mode;
  `'medium'` otherwise.
- `chatDockView.jsx` re-derives it after every voice turn and calls `aiVoiceRealtime.js`'s
  `setEagerness()`, which sends a live `session.update` (`session.transport.updateSessionConfig()`)
  rather than reconnecting - and is a no-op if the requested value is already in effect, so an
  ordinary run of turns never sends a redundant update. `create_response`/`interrupt_response` are
  resent as `false` on every call, never eagerness alone, so a live update can never accidentally
  revert the "NAVRYA always decides before the model may speak" contract.
- The effective value is verified from the real `session.updated` acknowledgement
  (`onTransportEvent`'s handling of `TRANSPORT_SESSION_UPDATED`), surfaced through
  `debugState().effectiveTurnDetection` - never assumed from what was merely requested.
- **Not run**: benchmarking these three tiers against a real Persian speech fixture corpus (pauses,
  fillers, corrections, code-switching, trading terminology) requires real OpenAI Realtime API
  audio and was not attempted in this pass (no rotated, valid credential available in this
  sandboxed session) - the rule set above is a reasoned default, not a tuned one. Re-run
  `voice-ab-scratch/`-style real-audio validation (see `docs/ai/persian-voice-quality.md`) before
  trusting these tiers' exact values in production.

### Before/after: acceptance gates

Measured in `tests/voice-latency-gates.test.mjs`, against the real `TurnCoordinator`/
`PlaybackController` code under deterministic, documented mock I/O timing (no real OpenAI/WebRTC
credentials used or required) - see that file for the exact methodology and reasoning behind each
mock latency value. Representative run:

| Gate | Requirement | Measured |
|---|---|---|
| Final-transcript -> submit() dispatch | p95 <= 100ms | p50=0ms p95=0ms max=1ms |
| Interruption -> local audio cutoff | p95 <= 250ms | p50=0ms p95=1ms max=1ms |
| Next turn blocked by prior playback | never | second turn dispatched 0ms after arrival, while a 3000ms reply was still playing |
| Before/after improvement (old coupled queue vs. the split) | >=40% | old: +3128ms, new: +123ms -> **96%** |

"Before" reconstructs the literal shape of the removed `voiceTurnQueue` coupling (chain
`submit()` then `await speak()` per turn) under the identical mock timings, for a direct,
apples-to-apples comparison - not a hypothetical baseline.

The already-existing 12-second-stall fix (`audio_interrupted` added to `speak()`'s settle
listeners, `disconnect()` explicitly settling a pending `speak()`) shipped on
`feature/auth-security-hardening` before this pass started and is unchanged - this pass's own
tests (`tests/ai-voice-realtime-adapter.test.mjs`) re-verify it stays fixed, not re-fix it.

Real OpenAI Realtime API / WebRTC measurements were **not run** in this pass (no rotated, valid
credential available in this sandboxed session) - clearly labeled as such rather than fabricated,
per this task's own instruction.

## Voice Mode hardening pass (feat/voice-mode-hardening)

A later pass re-verified `docs/ai/voice-agentification-audit.md`'s T1-T14/C1-C11/F1-F11 findings
against current source and found most of the transport-level findings (T1-T3, T5-T9, T12-T14,
C1-C6/C9) already fixed by an earlier, undocumented "Slice R1"/"Slice R2" pass on this same
codebase (request ownership/cancellation and transport repair respectively - see the inline
`Slice R1`/`Slice R2, audit finding TN` comments throughout `aiVoiceRealtime.js`,
`geminiLiveVoice.js`, `chat-dock-core.js`, and `server/pattern-ai-server.mjs`). This pass closed
the specific gaps that re-verification found were still genuinely open:

- **Stale queued voice turns** (`ai-voice-turn-coordinator.js`): `epochAtEnqueue` was recorded but
  only re-checked AFTER `submitFn()` resolved, not before invoking it at the front of the queue - a
  turn queued behind a slow prior turn could still call `submitFn()` (starting a workflow, mutating
  a form) against a conversation the epoch had already moved on from. Fixed with a check
  immediately before `submitFn()` is called; `submitFn()` is never invoked at all for a turn whose
  epoch is already stale by the time it reaches the front.
- **T4 (OpenAI mute-across-reconnect)**: a brand-new `RealtimeSession` created during
  connect()/reconnect never reapplied the user's current mute preference on its own. Fixed by
  calling `session.mute(isMuted)` right after connect succeeds, before the connection is ever
  exposed as `LISTENING`.
- **T11 (Gemini published-audio ownership)**: `playAudioUrl()` created a completely unowned local
  `Audio` element - never registered in the `playbackStop` slot `interrupt()`/`teardown()` already
  know how to stop, never setting `ASSISTANT_SPEAKING`, never emitting `output_audio_buffer.*`
  events. Rewritten to give published audio the exact same ownership contract `playPcm()` already
  has, plus a two-stage first-audio/stall watchdog mirroring `aiVoiceRealtime.js`'s own
  `armPlaybackWatchdog` (Gemini has no equivalent helper of its own, so an inline pair of constants/
  timers was added rather than extracting a premature shared utility across the two files).
- **Remaining request cancellation** (section 6 of the task brief): business-chat fetch
  cancellation (R1) never covered the Voice-transport-specific network calls. Both adapters now
  mint a real, per-operation `AbortController` for the Realtime session mint (`connectAbortController`)
  and the TTS fetch (`speakAbortController` - ElevenLabs on the OpenAI adapter, Gemini's own
  `fetchSpeakAudio` on the Gemini adapter), aborted from `disconnect()`/`interrupt()` respectively.
  `fetchGeminiLiveSession`/`fetchGeminiSpeak`/`fetchVoiceProviderSpeak` (`chatDockView.jsx`) all
  gained the same optional `{signal}` parameter `fetchRealtimeSession` already had.
- **F8 (trade.cancel switched-target safety)**: `trade.cancel`'s own `submit()` re-resolved the
  active Trade fresh from context with no comparison against which Trade the confirmation was
  actually for - unlike `trade.delete`'s own `pendingTradeDeleteId`. Fixed with the identical
  pin-at-open/compare-at-submit pattern (`pendingTradeCancelId`, scoped locally to the
  trade-lifecycle block).
- **Pending clarification invalidation** (`ai-clarification-state.js`, section 13): End Voice,
  unmount, and a provider switch never invalidated a pending trade-emotion clarification staged
  while Voice was active - only a genuinely different `conversationId` did (via the module's own
  check). `chat-dock-core.js` now exposes `clearPendingClarification()`; `resetConversationState()`
  (New Chat/resume) calls it alongside its pre-existing workflow/proactive-confirmation clearing,
  and `chatDockView.jsx`'s `endVoice()`/unmount call it directly (not the broader
  `resetConversationState()`, which would also cancel an unrelated in-progress form workflow).

**Confirmed still-open, deliberately not fixed in this pass** (see the pass's own delivery report
for full reasoning): AudioWorklet migration for Gemini's local barge-in detection (still
`ScriptProcessorNode`); Gemini TTS time-to-first-audio (still waits for the full response before
playback - the actual streaming capability of the specific endpoint in use could not be verified
from source alone); explicit provider-ownership policy (Voice reasoning still forced to OpenAI
regardless of the configured reasoning provider - a real product-policy decision with billing
implications, not implemented pending explicit confirmation); the general "initial model-supplied
`confirm:true` on the same turn as the original request" structural gap (F9) - confirmed still
real (purely a prompt-level mitigation today, no engine-level enforcement), but deliberately not
force-fixed given the real risk of breaking a legitimate single-utterance "do X and confirm it"
pattern this app's own tests already rely on elsewhere, without an explicit product-policy answer
to "should that ever be allowed."

## Provider Ownership, Natural Listening, Streaming TTS & Low-Friction Confirmation addendum

A follow-on addendum to the pass above, explicitly building on it rather than redesigning Voice -
the same "one brain, multiple channels" architecture throughout. This section covers what the
addendum has completed so far; see the addendum's own final report for the complete status,
including what remains open at hand-off (natural-listening/AudioWorklet, the wider latency
instrumentation, and a full Section 5 playback-ownership re-audit were still in progress when this
section was last updated).

### Section 1: explicit provider ownership (implemented)

**The confirmed bug**: `chatDockView.jsx`'s `submit()` unconditionally overrode a Voice-originated
turn's provider to `'openai'` (`provider: source === 'voice' ? 'openai' : undefined`), regardless
of the user's actually-configured reasoning provider. A user with Gemini (or Anthropic/Kimi/
DeepSeek) configured as their primary provider had every Voice turn silently reasoned by OpenAI
instead - a real silent-provider-mismatch bug the addendum's Section 1 explicitly forbids
("Gemini reasoning/STT with silent OpenAI TTS is explicitly forbidden"; the mirror case, Gemini
Live transport with silently-OpenAI-reasoned turns, is the same failure mode). Fixed by removing
the override entirely - `chat-dock-core.js`'s own pre-existing `requestedProvider` resolution
(`options.provider === 'openai' ? 'openai' : active.provider`) now applies uniformly to voice and
typed turns, and billing/usage recording (`TradeJournalAIUsage.record({provider: payload.provider,
...})`) already keyed off that same resolved value, so it self-corrects with no separate change.

**Capability gate (fail closed, never silently substitute)**: `chatDockView.jsx` gained
`VOICE_TRANSPORT_SUPPORTED_PROVIDERS = { openai: true, gemini: true }` - the only two providers
with a real Voice transport in this app. `toggleVoice()` checks this BEFORE `connect()`; on a
mismatch (e.g. the active provider is Anthropic/Kimi/DeepSeek) it fails closed
(`voiceErrorStage: 'provider_voice_unsupported'`, `VOICE_STATES.ERROR`) with no permission prompt,
network call, or quota spend against any provider - never a silent fallback to OpenAI's transport
(the pre-existing behavior: `useGeminiLive = providerId === 'gemini'` defaulted every other
provider id straight to the OpenAI transport). A dedicated i18n key
(`voiceDockErrorProviderUnsupported`) covers all four supported UI languages.

**Single source of truth, by construction**: because Voice now refuses to connect at all unless
`providerId` is Voice-capable, and reasoning follows that same `providerId` with no override,
listening/reasoning/speaking are structurally guaranteed to be the same provider for the entire
lifetime of any connected Voice session - satisfying the "one single source of truth" requirement
without a new dedicated configuration module. Minimal debug-state transparency was added for this:
`aiVoiceRealtime.js`'s `refreshDebugState()` now reports `provider: 'openai'`, and
`geminiLiveVoice.js`'s returned session API now exposes `provider: () => 'gemini'`. A full
three-field Listening/Reasoning/Speaking status display in the Voice UI itself was judged
lower-priority given the structural guarantee above and was not built this pass.

### Section 4: Gemini TTS streaming investigation (verified: NOT genuinely streaming)

**Investigated, not assumed**, per the addendum's own explicit instruction. `speakWithGemini()`
(`server/pattern-ai-server.mjs`) calls Gemini's REST `:generateContent` endpoint (audio-output/
native-TTS preview model, `responseModalities: ['AUDIO']`) and does `const data = await
response.json()` - a single, fully-buffered response containing one `inlineData` part with the
complete synthesized audio as one base64 blob. There is no chunked or incremental response
handling anywhere in this path, client or server.

A live (unauthenticated) probe of `https://generativelanguage.googleapis.com/v1beta/models/
<model>:streamGenerateContent?alt=sse` confirms the generic streaming route exists at the API
surface level (a `403 PERMISSION_DENIED`, not a `404`) - this is Google's ordinary
`streamGenerateContent` capability, available generically across `generateContent`-family calls
for any model. That is not the same claim as "this specific TTS-preview model incrementally
produces multiple playable audio segments across that stream." No real `GEMINI_API_KEY` was
available in this sandboxed session to make an authenticated call and observe the actual chunking
behavior first-hand; the finding below is the verified structural fact (single-request/single-
response REST call, confirmed above) plus the well-established behavior of this exact model
family (Gemini's single-turn native-TTS preview models synthesize a full utterance in one pass -
this is a fundamentally different capability from the separate, genuinely-bidirectional-streaming
**Gemini Live API** this app already uses for the Listening/Reasoning half of a Gemini Voice
session; migrating utterance playback itself onto that live-session transport, instead of a
one-shot "read this exact already-approved reply verbatim" REST call, would be a materially larger
architecture change than "add streaming to the existing endpoint," and is explicitly out of scope
here).

**Conclusion: no genuine incremental audio streaming exists on the endpoint NAVRYA's Gemini TTS
path actually uses.** Per the addendum's own explicit fallback instruction, this pass did **not**
fake streaming (e.g. artificially chunking an already-fully-received buffer to look incremental).
Instead:

- **Latency instrumentation** (`geminiLiveVoice.js`'s `speak()`): each call now records a
  sanitized `{ textLength, fetchMs, interrupted, error? }` breakdown (`nowMs()`, a monotonic
  `performance.now()`-based helper matching `chat-dock-core.js`'s own `now()` convention), exposed
  via the session API's `lastSpeakLatency()` getter. Since nothing plays before the fetch resolves
  on this confirmed non-streaming path, `fetchMs` (network + full server-side synthesis time) IS
  effectively "time to first audible sound" here - the one latency figure actually worth
  surfacing. Never logs the transcript itself, matching this file's existing privacy posture.
- **Cancellation/generation-fencing/centralized playback ownership**: already real (Phase C's
  `speakAbortController` + `activeSpeakToken` + the T11 playback-ownership rewrite covered above) -
  no change needed for this finding specifically.
- **Bounded reply length**: `speakWithGemini()` already rejects text over `ELEVENLABS_SPEAK_TEXT_MAX`
  (2000 chars, shared across every TTS provider this server supports). Whether NAVRYA should
  additionally cap **voice-reply length more tightly than that shared, cross-provider constant**
  specifically to reduce Gemini's one-shot time-to-first-audio is a genuine product-policy
  trade-off (shorter voice replies vs. this specific provider's higher latency for a long reply) -
  flagged here rather than silently decided, per the addendum's own "STOP and report the exact
  decision" instruction.
- **Reduced buffering**: no additional client-side buffering exists in this path beyond the decode
  step already required to turn the received base64 PCM into a playable `AudioBuffer`
  (`playPcm()`) - there was nothing further to remove.

### Sections 2/3: natural listening (detection algorithm implemented; AudioWorklet migration NOT done this pass)

**The confirmed gap**: `geminiLiveVoice.js`'s local microphone-energy analysis (used only for
UI/barge-in state - Gemini Live's own server-side VAD and finalized transcript remain the sole
authority on turn boundaries and content, per that file's own docstring) used one fixed energy
threshold (`0.025`) with **no minimum-duration requirement at all**. A single loud frame (a cough,
a keyboard click, a door) while the assistant was speaking immediately flipped state to
`USER_SPEAKING` and called `onBargeIn()` - and kept calling it on every subsequent frame for as
long as the overlap lasted, with no cooldown against a burst of choppy noise re-triggering several
interrupts of the same reply in quick succession. `aiVoiceRealtime.js` (OpenAI) has no equivalent
local energy analysis at all - it relies entirely on the Realtime API's own modern, server-side
turn detection, per the addendum's own "don't duplicate provider-side turn detection if a modern
one exists" guidance; Gemini's local analysis exists only because interrupting LOCAL audio playback
is inherently a client-side action that cannot wait on a server round-trip.

**Fixed**: a new, dependency-free, purely-algorithmic module,
`navrya-src/geminiSpeechActivityDetector.js` (`createSpeechActivityDetector()`), replaces the
inline fixed-threshold comparison in `wireMicrophone()`. It adds every protection the addendum
asks for: a calibrated, ADAPTIVE noise floor (a slow-moving average of recent quiet-frame energy,
frozen while actively speaking so a sustained loud voice can never drag it upward and desensitize
the detector mid-utterance); HYSTERESIS (the "become speaking" threshold sits meaningfully above
the floor, `FLOOR_MARGIN_RATIO`; "become quiet" is the floor itself); a MINIMUM SPEECH DURATION
(`MIN_SPEECH_MS`, time-based rather than a frame count so it stays correct regardless of a given
browser/device's actual buffer size and sample rate) before a run of loud frames is ever confirmed
as real speech or fires a barge-in at all - a single transient spike can no longer flip state or
interrupt playback; a MINIMUM SILENCE DURATION (`MIN_SILENCE_MS`) before a confirmed speaking
episode is considered over, so a short pause/hesitation/breath is never mistaken for the end of a
turn; and a `BARGE_IN_COOLDOWN_MS` after a genuine barge-in fires, before another can fire, so a
burst of choppy noise can no longer re-interrupt the same reply repeatedly. A fresh detector
instance is created per real connection (`wireMicrophone()` only ever runs once per successful
`connect()`), so a reconnect never inherits a stale "already speaking"/"recently barged-in" state.

`MIN_SILENCE_MS` deliberately keeps the exact pre-existing value (850ms) rather than being
re-tuned, since the addendum's own priority order places "no accidental interruption" above "low
latency," and changing an already-informally-accepted production number with no real device
available to validate against in this sandboxed session would be a guess in either direction. Every
other constant (`MIN_SPEECH_MS`, `FLOOR_MARGIN_RATIO`, `FLOOR_ADAPT_RATE`, `MIN_FLOOR`,
`BARGE_IN_COOLDOWN_MS`) is a genuinely new protection with no prior production value to preserve -
these are principled defaults, **not validated against a real microphone/speaker/room** (no real
device was available in this session either) - real-device tuning of these specific numbers remains
an honest, open item.

**NOT done this pass: the actual AudioWorklet migration.** `wireMicrophone()` still uses
`audioContext.createScriptProcessor()` (deprecated in the Web Audio API spec, though still broadly
implemented) - the detection ALGORITHM above is deliberately independent of which audio-capture
primitive delivers it a raw per-frame energy value, so it is equally usable from either
`ScriptProcessorNode` or a future `AudioWorkletNode`, but the actual `AudioWorkletProcessor`
module, its `audioWorklet.addModule()` loading, and a deterministic feature-detected fallback to
`ScriptProcessorNode` where `audioContext.audioWorklet` is unavailable were not built this pass.
This is the one concrete Section 2/3 deliverable still outstanding.

**Tests**: `tests/gemini-speech-activity-detector.test.mjs` unit tests the detector module directly
with synthetic energy/timestamp sequences (no DOM/AudioContext/microphone needed at all) -
single-frame noise never flipping to speaking, sustained speech committing after `MIN_SPEECH_MS`,
a broken run never accumulating across a gap, a short pause never ending a confirmed turn, a long
enough pause ending it exactly once, the floor adapting only while quiet, the floor's implied
threshold never dropping to near-zero even in a very quiet room, the cooldown suppressing a
same-window repeated barge-in while still correctly tracking speaking state, a later genuine
barge-in firing once the cooldown has actually elapsed, and `reset()`'s own contract (clears
speaking/timing state always; clears the learned floor only when explicitly asked). A
static-source test in `tests/gemini-live-voice-adapter.test.mjs` proves the wiring itself: the old
inline threshold is fully gone, a fresh detector is created per connection, its
`becameSpeaking`/`becameQuiet`/`bargeIn` outputs (not a bare energy comparison) drive the state
machine, and the `realtimeInput` send to Gemini remains unconditional on every path (local
detection must never gate what audio actually reaches the server).

### Sections 7/8: low-friction confirmation policy (implemented)

**The core requirement**: the system must distinguish real USER confirmation from a
MODEL-SUPPLIED `confirm:true` - the model's own JSON claim must never itself count as proof of
consent. `chat-dock-core.js` gained `sanitizeUnverifiedGateConfirmation(fields, actionId, text)`,
called on both the fresh-discovery and continuation branches of `sendChat()` immediately before
`workflowEngine.applyKnownFields(...)`: for the action's own declared `gateField`, if the model's
returned value is `true`/`'true'`, the RAW user `text` for that turn is independently cross-checked
via `ai-proactive-engine.js`'s `interpretConfirmationText(text)`; anything other than a genuine
`'confirm'` verdict replaces the field's value with `null` (not `false` - `false` would be treated
as a known-and-rejected answer; `null` correctly leaves it genuinely missing, so the workflow
re-asks exactly as if the model had never returned that field at all). This runs whether the
model hallucinated `confirm:true` on the very first discovery turn, or on a later continuation turn
whose real text was unrelated to confirming anything.

**Extending the classifier itself**: `interpretConfirmationText()` previously covered English and
a narrow set of Persian override-style phrases only (it did not even recognize a plain "بله"/
"آره" alone). Extended with real Arabic and Spanish patterns, plain Persian yes/no, and - critically
- a `LEADING_CONFIRM` pattern checked first: an unambiguous leading affirmation ("Yes"/"بله"/
"آره"/"نعم"/"sí") wins outright even when a later, purely incidental word in the same sentence also
matches the reject vocabulary. This was required because destructive actions are frequently named
after their own verb (`trade.cancel`) - "Yes, cancel it." is a completely ordinary, unambiguous
confirmation, but literally contains "cancel" (`REJECT_PATTERN`'s own vocabulary), which without
`LEADING_CONFIRM` made the classifier return an ambiguous `null` instead of `'confirm'` and would
have wrongly blocked a valid single-utterance confirmation. The identical ambiguity exists in
Spanish (`"Sí, cancelar."` vs. `cancelar` in `REJECT_PATTERN_ES`) and is covered the same way.

Two latent bugs were found and fixed while extending this classifier: (1) `\b` (word boundary) is
an ASCII-only primitive in JS regex and does not reliably delimit Persian/Arabic script - patterns
anchored like `^\s*(بله|آره)\b` silently never matched; fixed with an explicit boundary set
(`(?:$|[\s.،!؟])`) everywhere a Perso-Arabic word needs one. (2) The same is true after an accented
Latin letter - `\bsí\b` never matches "sí" alone or "sí." for the identical reason (`í` is not a
`\w` character to the same ASCII-only engine), which meant a bare `"Sí."` (no trailing action word
to anchor on) silently failed to confirm anything; fixed the same way (`sí(?:$|[\s.,!¡¿?])`).

**Confirmation-fatigue audit**: every current action's `gateField` was reviewed against the
addendum's own examples of what should NOT require confirmation. Findings: `trade.emotion.log`,
`session.movementEntry.create`, `session.chartEntry.create`, and `session.create` have no
`gateField` at all - they auto-submit once their (already-minimal) required fields are known,
exactly matching the "ordinary/reversible/low-risk actions... execute WITHOUT unnecessary
confirmation" requirement. The only non-destructive actions with a gate (`account.create`/
`account.edit`/`settings.persona.update`, all `gateField: 'save'`) mirror a REAL "Save" button
that already exists in each one's own human-facing tab (verified directly against
`aiAssistantView.jsx`'s `PersonaTab`) - a genuine batch-edit-then-save UI pattern the AI path
reuses as-is, not a manufactured "are you sure?" dialog, so this is not confirmation fatigue.
Every other `gateField` belongs to a `riskLevel: 'high'` action (trade/pattern/strategy/session/
scenario/entry deletion and cancellation, community/marketplace/messaging send-publish) - exactly
where the addendum wants exactly one confirmation. No confirmation-fatigue violation was found in
the current action set.

**Tests**: `tests/ai-proactive-engine.test.mjs` covers the classifier extension directly (Persian
plain yes/no, Arabic, Spanish including the accented-"sí"-alone and "Sí, cancelar." tie-break
cases, and the pre-existing "si tienes tiempo..." conditional-clause false-positive guard).
`tests/chat-dock-core.test.mjs` covers the `sanitizeUnverifiedGateConfirmation()` wiring end to
end: a model-hallucinated `confirm:true` on the very first turn is stripped (workflow stays
`collecting`, `submit()` never runs); the same for a hallucinated `confirm:true` on a continuation
turn whose real text is a genuinely unrelated question; a real "Yes, cancel it." confirmation still
satisfies the gate despite the name collision; and - proving "no confirmation chains" - once a
destructive action is validly confirmed and executes, the very next turn's unrelated, ungated
ordinary action executes on its own after its normal auto-submit grace window, with no repeated
confirmation asked at all.

## How this was verified

Every gate (E0-E5) was verified against the real OpenAI Realtime API in a real Chromium instance,
with real synthesized speech fed through Chromium's fake-microphone capture (never a simulated
text event standing in for audio) - see **`docs/ai/voice-testing.md`** for the full methodology
(how the test audio was generated and sequenced, the tooling built to do it, and the complete
per-gate bug list) and **`docs/ai/voice-i18n.md`** for how the four supported languages flow
through transcription, extraction, and spoken replies.

The Voice Mode performance pass above was verified with real behavioral tests against the real
modules (`tests/ai-voice-turn-coordinator.test.mjs`, `tests/ai-voice-playback-controller.test.mjs`,
`tests/ai-voice-eagerness.test.mjs`, `tests/voice-latency-gates.test.mjs`) and static-source
regression guards for the JSX/SDK-facing code that has no DOM/render harness in this repo
(`tests/ai-voice-realtime-adapter.test.mjs`, `tests/voice-conversation-isolation.test.mjs`,
`tests/ai-realtime-voice-session.test.mjs`) - not against a real browser/WebRTC connection. Real
credentials were not available in this sandboxed session; production/real-browser validation of
this specific pass remains an open item (see `docs/ai/realtime-deployment.md`).

## Deployment

See **`docs/ai/realtime-deployment.md`** for environment variables, routing, HTTPS/CSP
requirements, and the current state of production validation (local-dev-verified only, as of this
writing - production validation of the Realtime-specific endpoint has not yet been done).

## GPT-Live 1 migration - OpenAI Realtime retired as the Voice Mode transport

A later, two-pass migration (`feat/voice-gpt-live-1`) replaced OpenAI Realtime with `gpt-live-1`
(OpenAI's newer full-duplex model, reachable only through its own `POST /v1/live/sessions`
endpoint) as NAVRYA's **sole** OpenAI Voice Mode transport. Gemini Live is entirely unaffected -
`docs/ai/voice-architecture.md`'s "one brain, not two conversations" contract, the confirmation-
gate/workflow/wallet architecture above, and everything Journeys A-D own are all unchanged; only
which transport carries an OpenAI-provider voice turn changed.

**Pass 1** added GPT-Live as a second, user-selectable OpenAI voice engine alongside Realtime (a
`voiceEngine` setting), built against an *inferred* protocol (a WebSocket connection with manually
base64-encoded PCM audio chunks, by analogy to `geminiLiveVoice.js`).

**Pass 2** (this section) made GPT-Live the *only* OpenAI Voice Mode transport per explicit product
direction, and - critically - **corrected the inferred protocol** after fetching and quoting
OpenAI's own documentation verbatim (`developers.openai.com/api/docs/models/gpt-live-1`,
`.../guides/voice-webrtc?api=live`, `.../guides/live-delegation`, `.../guides/live-conversations`).
The corrected facts, each a real change from pass 1's guess:

- **Transport is WebRTC, not WebSocket**, for the browser case - the model's own page states it
  plainly: "WebRTC for browser voice applications. Media tracks carry audio; a data channel
  carries JSON events." Audio is therefore real, continuous WebRTC media (mic track added via
  `RTCPeerConnection.addTrack`, remote audio played through a plain `<audio>` element via
  `ontrack`) - never a base64-encoded JSON chunk stream. `session.input_audio.append`/
  `session.output_audio.delta` (pass 1's assumption) are very likely WebSocket-only (server-side/
  telephony) events and are not used by the browser adapter at all. There is no audio sample rate
  for the client to pick - WebRTC's own SDP negotiation handles codec/rate.
- **Session creation is a single combined step**, not Realtime's own two-step ephemeral-token-then-
  connect pattern: the browser builds its own local SDP offer, posts it to NAVRYA's server
  alongside the real session config, and the server forwards both to OpenAI's
  `POST /v1/live/sessions` (`{session: {model, instructions, delegation}, transport: {type:
  'webrtc', sdp: offer}}`) using the permanent server-only key, then relays back the returned SDP
  answer (`{session: {id}, transport: {type:'webrtc', sdp: answer}}`). There is no ephemeral
  client-secret concept for this transport at all - the browser never receives any OpenAI
  credential for it, a stronger posture than Realtime's own ephemeral `ek_...` token.
- **Client delegation** (`delegation: {type:'client'}`) is the mechanism that keeps GPT-Live from
  ever reasoning/deciding/acting on its own - confirmed unchanged from pass 1. `session.delegation.
  created` (carrying a `delegation.id`, no request text/arguments) is the one documented "backend
  work needed now" signal, treated as the finalized-transcript-equivalent trigger for the existing
  `submit()`/`dockChat()` pipeline. The reply is spoken back via `session.commentary.append`
  (`delegation_id`, `content`, documented as "limited to 500 tokens per append") wrapped in an
  explicit verbatim/no-paraphrase instruction, mirroring Realtime's own `requestResponse()`
  pattern - OpenAI's own docs say commentary "causes the model to paraphrase" by default, so this
  is a real, only partially provable mitigation, not a guarantee.
- **Session lifecycle is confirmed**: `session.started` (ready), `session.closed` (graceful-close
  confirmation, fires even on connection loss/safety termination, carries the real, authoritative
  `usage.seconds`), `session.usage.updated` (interim usage). No terminal "this reply's audio just
  finished" event is documented at all - the adapter uses a short quiet window on the
  `session.output_transcript.delta` stream as the honest analog, the same pattern
  `geminiLiveVoice.js` already established for its own documented-but-unreliable transcript
  `finished` flag.
- Wallet settlement now prefers the real `usage.seconds` from `session.closed` over the pass-1
  locally-estimated elapsed-wall-clock-time fallback (still used only if that event is lost).

**Retirement mechanics**: `POST /api/ai/realtime/session` and `POST /api/ai/realtime/call` (the
same-origin SDP relay) both now return `410 REALTIME_VOICE_RETIRED` unconditionally for any
authenticated request, before ever reaching OpenAI - the pre-existing auth checks (401 anonymous,
403 suspended) are preserved ahead of the retirement check. `navrya-src/aiVoiceRealtime.js`,
`mintRealtimeClientSecret()`, and `handleRealtimeCallRelay()` are left fully intact (not deleted) -
unreachable from any live route, but still directly unit-tested as the historical, still-correct
record of what Realtime Voice Mode used to do; only `VOICE_STATES` is still imported from that
module by the live client wiring. The Realtime-vs-GPT-Live `voiceEngine` user setting from pass 1
was removed along with its UI - GPT-Live is unconditional for the `openai` provider now; a legacy
stored `voiceEngine:'realtime'` preference reads back as `'gpt-live'` (read-time normalization,
never a forced re-write of the stored record, matching this file's own established convention for
the Gemini 2.5 Pro model retirement in `ai-settings-store.js`).

**Still genuinely unverified against a real Live-API account** (flagged in code, not silently
assumed): the exact WebRTC data-channel label (`oai-events`, inferred from OpenAI's own adjacent
Realtime example on the same guide page, not confirmed GPT-Live-specific); whether an explicit
client-sent interrupt/cancel event exists at all (none is documented - "Stop reply" instead pauses
local playback immediately, a guaranteed client-side action, plus a best-effort
`session.instructions.append`); the real character-to-token ratio behind commentary's documented
500-token limit (approximated conservatively, client-side, never a real token count). No real
OpenAI Live API connection was made in either pass (no live account access in this sandboxed
session) - see `docs/ai/realtime-deployment.md` for the equivalent open item already tracked for
Realtime, now joined by this same gap for GPT-Live.
