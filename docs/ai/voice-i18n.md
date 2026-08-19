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

## UI labels: reused, not a new key set

The Journey E spec that scoped this project called for a dedicated `voice.*` i18n key set
(`voice.connecting`, `voice.listening`, `voice.speaking`, `voice.muted`, `voice.interrupted`, one
key per state in the adapter's ten-state machine, all four languages). **That key set was not
built.** What was actually implemented: the ChatDock's pre-existing mic button and its
`micLabel`/`stopListeningLabel`/`listeningPlaceholder` props (`aiDockMic`, `aiDockStopListening`,
`aiDockListening` in `ai-i18n.js`, already translated in all four languages before this journey)
now drive a real voice connection instead of the cosmetic toggle they previously drove. The
adapter's internal ten-state machine (`idle`/`requesting_permission`/`connecting`/`listening`/
`user_speaking`/`processing`/`assistant_speaking`/`interrupted`/`reconnecting`/`error`) exists and
is exercised in every gate's tests, but the **UI itself only visibly distinguishes two states**
(not listening vs. listening - the existing waveform indicator), the same binary the mic button
already expressed. A user does not currently see a distinct label for "connecting" vs.
"listening" vs. "processing," or a translated error message for a failed connection/denied
microphone permission.

**This is scoped, honest technical debt, not an oversight to paper over.** Building it out is
straightforward given the state machine already exists and is already localized-adjacent (every
other NAVRYA surface already has the four-language infrastructure) - it just was not part of what
got built and real-browser-verified in this pass. If/when it is built, the 15 keys the original
spec named (`voice.start`, `voice.stop`, `voice.listening`, `voice.connecting`, `voice.speaking`,
`voice.processing`, `voice.muted`, `voice.unmuted`, `voice.interrupted`, `voice.reconnecting`,
`voice.connectionFailed`, `voice.microphoneDenied`, `voice.microphoneUnavailable`,
`voice.tryAgain`, `voice.endSession`) map directly onto the adapter's existing state values and
`onError({code, stage})` shape - no adapter-level change would be needed, only new `ai-i18n.js`
entries and a richer `ChatDock.jsx` rendering of `voiceState`.

## Not verified

- **Voice selection is not varied per language.** The Realtime session's TTS voice
  (`REALTIME_VOICE = 'cedar'` in `mintRealtimeClientSecret()`) is fixed for all four languages.
  Pronunciation/naturalness quality per language was not formally assessed beyond confirming
  intelligible, on-topic spoken replies were produced (the content proof in
  `docs/ai/voice-testing.md`), not a native-speaker quality review.
- **Dedicated RTL viewport testing for the voice UI** (Persian/Arabic at 1920×1080/1366×768/
  1024×768, called for in the original spec) was not performed. The mic button and waveform
  indicator use `ChatDock.jsx`'s existing RTL-aware layout (`dir` prop, logical CSS properties),
  unchanged by Journey E, but no dedicated screenshot-based RTL check of the voice-specific
  elements was done.
- **Auto-detection of a language switch mid-utterance** (a user code-switching within one spoken
  turn) was not tested. `languages` is a single-value array sent at session-mint time from the
  UI's current language; the Realtime transcription model may still recognize mixed-language
  speech to some extent, but this was not a deliberate test scenario.
