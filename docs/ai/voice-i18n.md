# Realtime Voice — Language Handling (Journey E)

Four languages: English, Persian (Farsi), Arabic, Spanish - the same four `ai-i18n.js` already
supports for every other NAVRYA surface. Voice adds no new language, no new language preference,
and no separate voice-language setting.

## Language is read from the same place text already reads it from

`ai-i18n.js`'s `language()` reads `document.documentElement.lang` live (falling back through
`ar`/`es`/`en` prefixes, then Persian) - the exact same function every other localized string in
the app already calls. Journey E does not introduce a second language state:

```
document.documentElement.lang
        │
        ▼
  i18n.language()  ──────────────────────────────► dockChat()'s reply language
        │                                           ("Respond only in ${language}.")
        │
        ▼ (re-read immediately before every connect() -
        │  see aiVoiceRealtime.js's own note on why this
        │  can't be a React effect keyed on the i18n object)
        ▼
  createVoiceSession({ language }) → fetchSession(language)
        │
        ▼
  POST /api/ai/realtime/session { language }
        │
        ▼
  mintRealtimeClientSecret(): session.audio.input.transcription.languages = [language]
```

`REALTIME_LANGUAGES = ['fa', 'ar', 'en', 'es']` on the server; an unrecognized value (a future
language `ai-i18n.js` doesn't support yet, or a malformed request) falls back to `'en'` rather
than being sent to OpenAI unchecked.

Gemini Voice applies the same allowlist twice: the server pins its constrained transcription token
to the current language, and the browser adapter normalizes the current value before it opens the
Live socket. Gemini TTS receives the same selected language as an explicit delivery constraint.
Character selection changes only delivery: Hunter is watchful, Commander decisive, Engineer
evidence-led, and Sage calm and reflective. It never selects a language, translates a reply, or
changes the approved transcript.

## What was actually verified per language

All four were exercised with real synthesized speech through the real OpenAI Realtime API - see
`docs/ai/voice-testing.md` for the full methodology and every real-browser run. Summary of what is
demonstrated, not assumed:

| Language | Transcription of spoken domain phrases (city/timeframe/risk/trade fields) | Reply language | Field values stay canonical (English) | Full multi-turn Session flow | Notes |
|---|---|---|---|---|---|
| English | Verified | Verified | N/A (already English) | Verified (E1) | Baseline |
| Persian | Verified | Verified | Verified (e.g. spoken "پنج دقیقه" → `timeframe: "5m"`) | Verified (E1) | |
| Arabic | Verified | Verified | Verified, **after a fix** - see below | Verified (E1) | |
| Spanish | Verified | Verified | Verified | Verified (E1) | |

### The one real per-language bug: Arabic field values were transliterated

Found during E1: a spoken Arabic city name extracted as `"نيويورك"` instead of NAVRYA's own
canonical `"New York"`. Every field NAVRYA stores as a fixed-choice value (a Session city, a
timeframe) is an English string internally (`SESSION_CITIES = ['London', 'New York', 'Tokyo',
'Sydney']`, `TIMEFRAMES = ['5m', '15m', '1h', '4h', '1D']`) - the UI reads/matches these directly,
with no per-language value table. `dockChat()`'s system prompt now says explicitly: keep a
fixed-choice field's *value* in its canonical English form regardless of the *reply's* language.
Re-verified after the fix: the written and spoken reply stay fully idiomatic Arabic (the spoken
`voiceReply` naturally pronounces "نيويورك"), while the underlying field value applied to the real
form is `"New York"`. See `docs/ai/voice-architecture.md`'s "Transcription accuracy" section for
the full writeup - this is a prompt-level fix, not a hardcoded per-language value map, so it
generalizes to Persian/Spanish (and any future language) the same way.

## UI labels: a dedicated `voiceDock*` key set (closed in the ChatDock Voice-UX repair pass)

Journey E's original pass deliberately left this gap open (see the git history of this file for
the prior write-up) - the ChatDock only distinguished two visible states (not-listening vs.
listening), and the button most likely to read as "start voice" to a real user was actually a
non-functional decoy: the primary send button showed a waveform icon labelled "Voice mode" when
the text field was empty, but its click handler was the plain text-submit function, which did
nothing on empty input. The real, working control was the separate ghost-styled `mic` button,
easy to mistake for a plain dictation toggle rather than a live spoken conversation with NAVRYA.

That gap is now closed. `ai-i18n.js` carries a real `voiceDock*` key set, present and non-empty in
all four languages (`voiceDockStart`, `voiceDockStop`, `voiceDockRequestingPermission`,
`voiceDockConnecting`, `voiceDockListening`, `voiceDockUserSpeaking`, `voiceDockProcessing`,
`voiceDockSpeaking`, `voiceDockReconnecting`, `voiceDockError`, `voiceDockErrorPermissionDenied`,
`voiceDockMute`, `voiceDockUnmute`, `voiceDockMuted` - `tests/ai-voice-chatdock-ux.test.mjs`
regression-guards every key's presence across all four). `ChatDock.jsx` now renders every reachable
`VOICE_STATES` value distinctly: the decoy is gone, the one real Voice button changes icon/tone per
state (a distinct speaker icon while NAVRYA itself is talking, not just "mic" again), and a small
status pill (`[ ● Listening ]`-shaped, `role="status"`) shows the real, localized state text next
to the input - including a specific, actionable message for a denied microphone permission,
distinct from the generic Voice-error message every other failure mode falls back to. A mute
control appears once a session is live, mirroring the adapter's own `mute()`/`isMuted()`.

Real-browser-verified this pass (see the ChatDock Voice-UX repair final report): clicking the real,
visible "Start Voice" button (no DevTools) against a real WebRTC connection with real synthesized
speech input correctly walked through `Requesting microphone access…` → `Connecting…` → `Listening`
→ `You are speaking` → `Processing…` → `NAVRYA is speaking` → back to `Listening`, with the real
Session dialog opening mid-flow exactly as Journey A already established, and objective proof (a
real, inspectable `<audio>` element handed to the transport, not left for the SDK to manage
invisibly) that assistant audio was actually playing, not just that the state machine claimed it.
A simulated denied microphone permission produced the correct localized error, left the text
ChatDock fully usable, and a retry click did not get stuck. All four languages and all four
character dashboards were confirmed to expose and correctly drive the same real control.

## Persian Voice Quality pass (update)

A later pass (`docs/ai/persian-voice-quality.md`) added per-language voice-mapping
*infrastructure* (`REALTIME_VOICE_BY_LANGUAGE`), a Persian-only `voiceReply` spoken-style contract,
Persian-only Realtime prosody instructions, a deterministic voice-only number/markup/pronunciation
post-processing layer, and fixed a real bug where Journey C's proactive-safety messages were
hardcoded English regardless of language. Every one of these is explicitly gated to `fa` only and
regression-tested to leave EN/AR/ES byte-for-byte unaffected - see that document for the full
before/after detail. The item below has since been resolved by a real human-listened Cedar-vs-Marin
A/B, run after this document's own original "Not verified" note was written - see
`docs/ai/persian-voice-quality.md`'s Status section for the real result.

## Not verified

- **Voice selection now varies by language, but only Persian has actually been listened to.**
  `REALTIME_VOICE_BY_LANGUAGE` (`mintRealtimeClientSecret()`) maps Persian to `marin` (a real
  Cedar-vs-Marin Persian A/B - `voice-ab-scratch/`, gitignored - was generated with the real
  OpenAI Realtime API and listened to by the user, who clearly preferred Marin) and keeps
  English/Arabic/Spanish on the original `cedar` default, unvalidated either way by this pass.
  Pronunciation/naturalness quality for English/Arabic/Spanish still has not been assessed by a
  native-speaker quality review beyond confirming intelligible, on-topic spoken replies were
  produced (the content proof in `docs/ai/voice-testing.md`).
- **A live, real-audio-triggered interrupt (barge-in) was not cleanly reproduced in the ChatDock
  Voice-UX repair pass's own test harness** - a two-phrase fake-microphone WAV timed to land the
  second utterance mid-reply did not register a second finalized transcript in this environment
  (most likely a turn-detection/VAD timing artifact of the synthetic test audio, not a code change
  in this pass - `aiVoiceRealtime.js`'s own `interrupt()`/barge-in handling is untouched from the
  original Journey E implementation, already real-browser-verified in the E3 gate in
  `docs/ai/voice-testing.md`). The new UI's own state-to-label mapping for `user_speaking` and
  `interrupted` is code-verified (`tests/ai-voice-chatdock-ux.test.mjs`), not re-confirmed against
  a fresh live interrupt in this specific pass.
- **Auto-detection of a language switch mid-utterance** (a user code-switching within one spoken
  turn) was not tested. `languages` is a single-value array sent at session-mint time from the
  UI's current language; the Realtime transcription model may still recognize mixed-language
  speech to some extent, but this was not a deliberate test scenario.
