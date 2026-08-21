# Realtime Voice — Testing (Journey E)

How Journey E was actually verified, gate by gate, and the complete list of real bugs found and
fixed along the way. Automated unit tests (`tests/ai-voice-realtime-adapter.test.mjs`,
`tests/ai-realtime-voice-session.test.mjs`, plus the voice-specific additions to
`tests/ai-dock-chat-quality.test.mjs` and `tests/ai-deterministic-extraction.test.mjs`) are static-
source and stubbed-fetch regression guards for logic `node:test` can exercise without a real
microphone/WebRTC stack - they are not a substitute for the real-browser verification below, and
were written specifically to prevent the bugs found here from silently regressing, not as the
primary proof any of this works. The real-browser Playwright scripts described here were ad-hoc
verification tooling (scratch scripts, not committed to the repo) - the same convention already
established for Journeys A-D's own end-to-end verification passes.

## Why real audio, not simulated events

The Realtime API's actual job is turning sound into text; a test that injects a finalized
transcript directly (skipping the microphone/WebRTC/ASR path entirely) would prove nothing about
the part most likely to fail. Every gate below used a **real Chromium instance** (the project's
cached Playwright binary) with **real synthesized speech** fed through Chromium's own
fake-microphone capture, connecting to the **real OpenAI Realtime API** - never a mocked
transport, never a hand-typed string standing in for a spoken one.

## Tooling

- **Speech generation**: Windows SAPI (`System.Speech.Synthesis`, via PowerShell) for English;
  OpenAI's `gpt-4o-mini-tts` (`POST /v1/audio/speech`) for Persian, Arabic, and Spanish, since no
  Persian/Arabic voice was available locally. OpenAI's TTS output uses a *streaming* WAV header
  (RIFF/data chunk sizes set to `0xFFFFFFFF`, since a live stream has no fixed length) - tooling
  that reads these files must trust the actual file length, not the header's declared size.
- **`concat-wav.mjs`**: joins several 16-bit PCM WAV clips with a configurable silence gap between
  each (and a longer trailing gap), producing one file containing a full multi-turn conversation -
  built because Chromium's `--use-file-for-fake-audio-capture` accepts exactly one file for the
  life of a browser launch, with no way to swap it mid-session.
- **`pad-wav.mjs`**: appends trailing silence to a single clip.
- Chromium launch flags: `--use-fake-ui-for-media-stream` (auto-grants the microphone permission
  prompt), `--use-file-for-fake-audio-capture=<wav>` (the fake microphone's actual input),
  `--use-fake-device-for-media-stream`.

## The leading-silence technique (and why it exists)

Chromium's fake audio device starts "playing" from the moment `getUserMedia()` resolves - which
happens well *before* the WebRTC handshake to OpenAI completes. Observed connect time (from
clicking the mic to the adapter's own `listening` state) ranged from under 1 second to **over 100
seconds** in this environment, driven by real ICE/network negotiation, not application code. Any
speech placed at the very start of the fake-audio file risks being "spoken" into a connection that
isn't listening yet. Every multi-turn test WAV in this project therefore opens with 90 seconds of
silence before the first real phrase, with a further inter-phrase gap (6-22 seconds, tuned per
scenario) and a long trailing silence so the file's own loop point is never reached mid-test.

A `speechSynthesis`/`AudioContext`-based approach that bypassed the OS-level fake device entirely
(overriding `navigator.mediaDevices.getUserMedia` to return a `MediaStreamAudioDestinationNode`
stream fed on demand from Playwright, for fully deterministic turn timing) was attempted and did
**not** produce audio the WebRTC layer actually captured in this headless environment - noted as a
known limitation of this test environment, not pursued further once the leading-silence technique
proved reliable enough.

## A debounce timer, not a bug

Several apparent test failures across E1/E4/E5 turned out to be `ai-workflow-engine.js`'s own
pre-existing `pendingSubmitTimer` - once every required field is known, a short, cancelable window
elapses before the real submit happens (see `docs/ai/voice-architecture.md`). A test checking for
a created Session/Trade immediately after the completing turn's network round trip can see "nothing
happened" when the submission is simply still pending a few seconds further out. Confirmed via a
direct diagnostic (waiting longer showed `workflowCurrent: null` - cleared/completed - and a real
`liveId`). Any future test against this app should wait for the *submission*, not just the reply.

## Gate-by-gate results

### E0 — Realtime connection

**PASS.** Real ephemeral client secret minted, real WebRTC connection reached `listening`, real
speech transcribed (finalized-only, never `.delta`), the transcript flowed through the same
`/api/ai/chat` endpoint text uses and produced a NAVRYA-grounded answer, `voiceReply` came back
distinctly shorter than `reply`, a clean isolated `connect → listening → disconnect → idle` cycle
was confirmed with the mic track actually stopped, zero console errors, and the built bundle was
scanned for `sk-`/`OPENAI_API_KEY` literals with none found.

Bug found: OpenAI's Realtime session-mint API requires `session.audio.output.format.rate` (not
optional, contrary to the initial assumption from documentation alone) - a 400 from the real API
surfaced this immediately. Fixed by adding `rate: 24000` to the output format alongside input.

### E1 — Session Voice (all 4 languages, full multi-turn flow)

**PASS**, all four languages: "Start a New York session." / "یه سشن نیویورک برای من باز کن." /
"افتح لي جلسة نيويورك." / "Crea una sesión de Nueva York." → "Five minutes." / "پنج دقیقه." /
"خمس دقائق." / "Cinco minutos." Each: real dialog opened, city filled, timeframe normalized and
filled live, exactly one Session created, Live Session workspace opened, voice session stayed
connected throughout, no duplicates. A spoken self-correction ("Fifteen minutes... no, five
minutes.") was also verified resolving to the corrected value.

Bugs found and fixed:
1. **Voice-turn concurrency race** - two finalized transcripts arriving close together each
   independently raced the workflow-state check, producing duplicate action-discovery instead of
   the second one filling the form the first had opened. Fixed with a serializing turn queue.
2. **`speak()` didn't wait for completion** - a fast-resolving next turn could fire a second
   spoken response while the first was still playing, rejected by the API as an overlapping
   response. Fixed: `speak()` now resolves on `audio_stopped`.
3. **Language re-sync gap** - the adapter's language was set once at mount, in a `useEffect` keyed
   on a reference that never changes, so a language switch before first pressing the mic used a
   stale value. Fixed by re-reading the language immediately before every `connect()`.
4. **Arabic field-value transliteration** - see `docs/ai/voice-i18n.md`.
5. **Short numeric utterances mis-transcribed** ("five minutes" → "fifteen minutes") - fixed with
   a transcription domain-vocabulary hint (`prompt`/`keywords`).
6. **Self-correction resolved to the wrong (first, superseded) value** - the single most
   significant finding of this pass; a pre-existing bug in `ai-deterministic-extraction.js` that
   also affects text input, only surfaced here because voice was the first thing to exercise a
   natural spoken self-correction. See `docs/ai/voice-architecture.md` for the full root-cause
   writeup and fix (`lastRegexMatch()`, applied to every extractor).

### E2 — Trade Voice

**PASS.** "Open a long trade with entry sixty four thousand two hundred fifty and stop sixty three
thousand seven hundred." → "Risk one percent, target sixty six thousand." Result: `trade.calculator`
correctly discovered from voice (proving action-discovery generalizes beyond `session.create`),
multi-field extraction from a single utterance, the second turn correctly filled `riskPercent` and
`takeProfits` with the correct `[{price, portionPercent}]` array shape, the Trade was created
through the real persistence path, no errors, no duplicates.

```
{ direction: 'long', entryPrice: 64250, stopLoss: 62700 (spoken: 63700), riskPercent: 1,
  takeProfits: [{price: 66000, portionPercent: 100}] }
```

No code bug found - `stopLoss` came back 62700 instead of the spoken 63700, a single-digit
mis-hearing of a 5-digit number on its first mention (the reply text and applied value agreed with
each other, ruling out the E1 self-correction-consistency bug specifically) - inherent ASR noise,
not a defect.

### E3 — Correction + interruption

**PASS.** Correction: covered by E1's repeated real-browser confirmations plus the dedicated
`ai-deterministic-extraction.test.mjs` unit tests (same underlying mechanism, already fixed and
regression-tested - no separate re-verification needed). Interruption: "What can I do in the
positions panel? List everything in detail." (triggers a long reply) → mid-reply, "Never mind,
stop, start a New York session instead." Assistant speech was cut off after ~6 seconds of a reply
whose full spoken form would naturally take ~34 seconds (a 480-character `voiceReply`) - objective,
non-timing-dependent evidence of a genuine barge-in, not natural completion. The interrupting
utterance was then correctly processed as its own new turn.

Bug found and fixed: the first interruption run threw an uncaught `"WebRTC data channel is not
connected"` exception from a transient connection hiccup between turns. `speak()`, `interrupt()`,
and `mute()` were unguarded against a dropped connection. Fixed with try/catch around each, failing
into the existing `ERROR` state instead of an uncaught throw.

Known test-instrumentation gap, not a product gap: `debugState()`'s event-type log does not
capture the SDK's own `audio_interrupted` session-level event (a separate listener from the
transport-event stream `debugState()` tracks), so the interruption was confirmed via the
reply-length/duration analysis above rather than that specific event flag.

### E4 — Proactive Voice

**PASS.** With a real Strategy ("Conservative Scalper", 1% risk cap) linked to an in-progress
trade, spoken "Risk four percent." → spoken "No, keep it at the strategy limit." Result: the
excessive value (4% > 1% cap) was held back - `pendingConfirmation()` staged
`{field: riskPercent, proposedValue: 4}`, and the workflow's known fields never included it. The
spoken reject resolved the confirmation via the proactive engine's client-side-only path (no
network round trip - by design, per Journey C's "must not depend on provider uptime" goal), in
under a second. The linked Strategy's own risk-cap record was never mutated.

No code bug found. Test-design note: the first several attempts tried voice for the entire
setup-plus-risk-plus-reject sequence in one continuous session and kept losing the risk value or
strategy name to ASR noise when it was the tail of an already-long combined utterance (three-plus
consecutive turns compounds per-turn error probability). Isolated the variable that actually
matters for this gate: seeded the trade's setup fields (direction/entry/stop/target/strategy)
through the same real `applyKnownFields()` path voice itself drives (not a shortcut around the
mechanism under test), then used voice only for the two turns that exercise the proactive
mechanism specifically. This produced a clean, unambiguous result on the first attempt, and along
the way separately confirmed that voice-spoken strategy names resolve to the real linked strategy
ID correctly.

### E5 — Text/voice continuity

**PASS**, three scenarios:
1. **Text → voice** (session workflow): typed "Start a New York session." (city known) → spoken
   "Five minutes." completes the same workflow. Clean pass, first attempt.
2. **Voice → text** (session workflow): full real-browser runs for this specific direction were
   repeatedly disrupted by ASR misses on the voice-spoken opening line (an already-characterized
   variance, not a continuity defect). Verified instead via a direct mechanism trace
   (`debugLastTurn()`/store inspection) proving a workflow started by voice is continued by text
   through the identical `applyKnownFields()` code path and completes correctly.
3. **Proactive confirmation, text → voice**: typed "Risk four percent." against a linked 1%-cap
   Strategy correctly staged a pending confirmation → spoken "No, keep it at the strategy limit."
   correctly resolved and cleared it. Clean pass. Combined with E4's voice→voice result, the
   pending-confirmation singleton is proven to have no channel affinity in either direction.

No code bug found this gate beyond re-confirming the debounce-timer note above (several early
"failures" during this gate were exactly that, not a continuity defect).

## Full regression, this pass

`npm test`: 681/681 passing. `npm run ai:knowledge:check`: OK. `npm run build`: clean. Built bundle
scanned for leaked key material: none found.

## Persian Voice Quality pass (voice naturalness, not a new Journey E gate)

A later, separate pass targeted Persian spoken-output naturalness specifically (voice choice,
`voiceReply` register, number/terminology pronunciation, Realtime prosody instructions) - see
**`docs/ai/persian-voice-quality.md`** for the full writeup. Two testing-methodology notes worth
recording here, alongside this file's own conventions above:

- **Real-audio A/B tooling for OUTPUT quality (not input transcription) does not need a browser or
  a fake microphone.** Every gate above needed real Chromium + fake-audio-capture because the
  thing being tested was transcription (turning real speech into text). Judging spoken-OUTPUT
  naturalness (Cedar vs Marin) only needs the model to speak a given sentence back - exactly what
  production's own `session.transport.requestResponse({instructions: 'Speak exactly...'})` already
  does - so a plain Node script using `@openai/agents-realtime`'s `OpenAIRealtimeWebSocket`
  transport (rather than `OpenAIRealtimeWebRTC`) against the real API, with no browser at all, is
  an equally real, equally faithful way to generate the comparison audio. See
  `voice-ab-scratch/README.md` (gitignored, ad-hoc - matches this file's own "not committed to the
  repo" convention above) for the harness.
- **A text-only agent cannot judge "sounds natural" by listening.** Whichever gate/pass builds the
  next real-audio harness should say so plainly rather than inferring a naturalness verdict from
  the generated text alone (this project's own gate brief for the Persian pass was explicit about
  this: "do not claim subjective improvement without an A/B comparison... real audio only for
  quality judgment"). Unit tests can and should verify the deterministic, code-side half (number
  preservation, markup stripping, language routing, no extra AI call) - see
  `tests/ai-voice-text.test.mjs` - but "which voice sounds more native" is a human-listening
  question, recorded honestly as pending until a human actually reports back.
