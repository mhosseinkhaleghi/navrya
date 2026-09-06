# Realtime Voice (Journey E)

`navrya-src/aiVoiceRealtime.js` → `window.TradeJournalAIVoiceRealtime` (browser transport adapter)
`server/pattern-ai-server.mjs` → `mintRealtimeClientSecret()` / `POST /api/ai/realtime/session`

`navrya-src/geminiLiveVoice.js` → Gemini Live browser transport adapter
`server/pattern-ai-server.mjs` → `POST /api/ai/gemini-live/session` / `POST /api/ai/gemini-live/speak`

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
it does not replace or change the OpenAI Voice path. Its microphone audio goes directly from the
browser to Gemini Live using a server-minted, one-use constrained token. The browser never gets
`GEMINI_API_KEY`.

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
authoritative.

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
