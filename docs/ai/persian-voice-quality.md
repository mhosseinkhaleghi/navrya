# Persian Voice Quality (Voice Naturalness Gate)

A quality pass on top of Journey E (`docs/ai/voice-architecture.md`), not a new journey and not a
new AI brain. Goal: make NAVRYA's Persian *spoken* output sound natural, fluent, contemporary, and
conversational - closer to a real one-to-one conversation, further from a formal document read
aloud - without touching the Action Registry, Workflow Engine, Proactive Engine, destructive
confirmation, or the text/voice single-conversation architecture. This document records what was
actually found in the repository (not assumed from prior docs), what was changed, what was
researched externally, and - honestly - what required a human actually listening to real generated
audio (this pass could tool for that, but the naturalness verdict itself had to come from the user
actually listening - see the Status section immediately below for the real result).

## Status of the real-audio Cedar vs Marin decision

**Decided: Marin, for Persian only.** A real-audio generation harness (`voice-ab-scratch/`,
gitignored, not committed - matches this project's existing ad-hoc-verification-tooling
convention) was built and run against the real OpenAI Realtime API with the exact production
model/instructions. The user listened to a real smoke-test pair (one full representative
sentence, both voices) and then a 10-category validation set (natural conversation, 0.5% risk,
large/decimal trading prices, BTC/OpenAI mixed terminology, Strategy/Pattern terminology, Journey
C's risk warning, destructive confirmation, a self-correction resolving to a timeframe, and a
multi-sentence product Q&A - every sample built from the real production code paths, not hand-typed
stand-ins: model-generated categories called the real `dockChat()`; deterministic categories called
the real `ai-voice-text.js`/`ai-proactive-engine.js` functions directly) and clearly preferred
Marin for Persian naturalness. `REALTIME_VOICE_BY_LANGUAGE.fa` in `server/pattern-ai-server.mjs` is
now `'marin'`; English/Arabic/Spanish are unchanged (`'cedar'`), per the gate's own explicit rule
not to change other languages' voice merely because Persian changed. See
`voice-ab-scratch/README.md` for the harness and corpus if this needs to be re-run for a future
model/voice update.

One honest caveat from the 10-category set: the destructive-confirmation sample's synthetic test
scaffold (an `activeProcess` built by hand to approximate a real gate-discovery turn) did not
perfectly reproduce production's own real destructive-confirmation wording - the model's phrasing
came out serviceable but clunkier than this gate's own "این کار قابل برگشت نیست"-style example. The
underlying deterministic confirm/reject *mechanism* itself is completely unaffected by this pass
and remains fully covered by the existing destructive-action test suite (`tests/
destructive-actions.test.mjs`, `docs/ai/action-safety.md`) - this caveat is about one test sample's
wording, not the safety guarantee.

## 1. Current voice stack (verified in the repository, not assumed from documentation)

```
Realtime model:          gpt-realtime-2.1 (server/pattern-ai-server.mjs's REALTIME_MODEL;
                          overridable via OPENAI_REALTIME_MODEL, unset in production)
Voice:                    marin for Persian, cedar for English/Arabic/Spanish
                          (REALTIME_VOICE_BY_LANGUAGE, new in this pass - fa flipped after a real
                          human-listened Cedar-vs-Marin A/B, the other three languages unchanged)
Transcription model:     gpt-live-transcribe
Language configuration:  REALTIME_LANGUAGES = ['fa','ar','en','es'], read live from
                          document.documentElement.lang via ai-i18n.js's language()
Session instructions:    a fixed transport-only instruction ("never answer/decide/act, only
                          transcribe, and speak back an exact given sentence verbatim") - this
                          pass appends a Persian-only AUDIO DELIVERY addendum (section 4 below),
                          English/Arabic/Spanish keep the exact original string
Audio output format:     audio/pcm, 24000 Hz, both directions
Turn detection:          semantic_vad, eagerness: medium, create_response:false,
                          interrupt_response:false - NAVRYA always decides before the model may
                          speak (verified true in code, not just documentation)
Response creation:       session.transport.requestResponse({instructions: 'Speak exactly the
                          following text, verbatim...'}) - a one-off response.create with an
                          instruction override, never sendMessage()
```

This confirms `docs/ai/voice-architecture.md`'s "one brain" diagram is accurate today - traced end
to end in code: `chatDockView.jsx`'s `onVoiceTranscript` → `submit(text, {source:'voice'})` →
`chat-dock-core.js`'s `sendChat()` → `server/pattern-ai-server.mjs`'s `dockChat()` →
`{reply, voiceReply}` → (this pass's new step) `ai-voice-text.js`'s `toSpokenText()` →
`voiceRef.current.speak()`.

## 2. OpenAI voice options (researched live, not from memory)

Current Realtime API voice roster: `alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin,
cedar`. OpenAI's own current guidance: *"for best quality, we recommend `marin` or `cedar`"* - no
per-language (Persian-specific) recommendation is published by OpenAI anywhere found. This means
neither voice has been vetted by OpenAI for Persian specifically; the real answer can only come
from actually listening to Persian output from both (see the Status section above).

## 3. GPT-Live availability (researched live)

**Not available as a callable API for this project today.** GPT-Live (`gpt-live-1`/
`gpt-live-1-mini`, OpenAI's full-duplex model powering ChatGPT's own Voice experience since July
2026) is a ChatGPT product surface only - OpenAI has a "bring GPT-Live to the API soon" sign-up
form, no published endpoint, no pricing, no GA date. Per this gate's own instructions (outcome A):
documented here as unavailable, no migration attempted, no experimental benchmark built for it -
continue optimizing the existing Realtime stack (`gpt-realtime-2.1`, already the correct current
model - no version bump needed). Re-check this section if/when OpenAI actually ships API access.

## 4. What changed, and why each change is safe

### 4.1 The single highest-impact fix: Journey C's safety/confirmation messages were English-only

Auditing every string handed to `chat-dock-core.js`'s `buildProactiveReply()`/`confirmationReply()`
(the deterministic Journey C safety path - gate section 24) found `ai-proactive-engine.js`'s five
rule messages and `confirmationReply()`'s two replies were **hardcoded English literals,
regardless of `i18n.language()`**. Not a voice-specific bug - the *written* transcript was wrong
too - but the single highest-impact fix for "Persian sounds natural," since no prosody/voice
change can fix a reply spoken (and shown) in the wrong language entirely. Fixed by threading
`language` through `evaluate()`/`confirmationReply()` (defaulting to `'en'` so every pre-existing
caller, including this file's own test suite, is unaffected) and adding fa/ar/es message tables
(fa written in the gate's own requested register; ar/es are a first-pass correctness fix -
localizing previously English-only text - not a naturalness-tested pass the way Persian's is).

Before (any language): `"Your linked strategy caps risk at 1%. You are asking for 4%."`
After (fa): `"سقف ریسک استراتژیت 1%‌ه، ولی الان 4% خواستی."`

### 4.2 `voiceReply` gets a real Persian spoken-style contract

Before this pass, `voiceReply` was only ever asked to be *"a short, natural spoken version...
noticeably shorter... phrased the way a person actually talks"* - true for every language, but
never told that written and spoken Persian are different registers the way English mostly isn't.
`server/pattern-ai-server.mjs`'s `dockChat()` now appends a Persian-only addendum (only when
`body.language === 'fa'` - English/Arabic/Spanish keep the exact original instruction, unchanged)
with concrete before/after examples pulled directly from this gate's own brief:

```
Bad:   آیا مایل هستید که فرایند ایجاد جلسه معاملاتی نیویورک را ادامه دهید؟
Better: می‌خوای سشن نیویورک رو ادامه بدیم؟

Bad:   ریسک تعیین‌شده توسط شما از حداکثر ریسک مجاز استراتژی فراتر می‌رود.
Better: ریسکی که گفتی از سقف این استراتژی بیشتره.
```

The instruction explicitly bounds itself to STYLE: *"Only the STYLE may change this way - never a
fact, a trading number, a safety warning, or a confirmation requirement, all of which must carry
over from `reply` exactly."* No slang requirement - "sound like a calm, intelligent, warm,
educated contemporary Iranian Persian speaker."

### 4.3 A deterministic, voice-only post-processing layer (`ai-voice-text.js`)

New module, `public/pages/shared/ai-voice-text.js` - pure string transforms, **zero network calls,
zero model calls** (gate section 35: one ordinary turn stays one AI call maximum). Applied exactly
once, in `chatDockView.jsx`, right before `speak()` - never touches the written `reply` shown in
the transcript (gate section 12). Three passes, always in this order:

1. **`stripMarkupForSpeech`** (all languages) - strips markdown bold/headers/bullets/backticks/
   links/bare URLs/stray JSON braces that would otherwise be read aloud literally if a model reply
   slipped past its own existing "no markdown" instruction (`DOCK_STYLE_INSTRUCTION`) - belt and
   suspenders, not a replacement for that prompt rule.
2. **`normalizeNumbersForSpeech`** (Persian only - see section 5 below).
3. **`applyPronunciationMap`** (Persian only - see section 6 below).

### 4.4 Context-aware deterministic acknowledgements (gate section 22/23)

The zero-network fast paths (`chat-dock-core.js`'s single-missing-field slot fill and the F37
gate-field confirm/reject) previously spoke the exact same flat, formal string for every event
(`aiDockSlotFilled: '{value} ثبت شد.'` for a timeframe, a price, *and* a risk percent alike). Each
now computes a **field-aware** Persian `voiceReply` via `ai-voice-text.js`'s
`spokenSlotFilled(field, value, 'fa')`/`spokenConfirmation(kind, 'fa')` - the WRITTEN `reply` shown
in the transcript is completely unchanged (still the existing generic, polished i18n string - gate
section 12). Returns `null` for any language/field not (yet) covered, so English/Arabic/Spanish and
any unmapped Persian field fall back to exactly the pre-existing generic text - zero regression.

```
Field           Before (spoken, same for every field)   After (spoken, Persian only)
timeframe       "5m ثبت شد."                              "اوکی، شد پنج دقیقه."
defaultRiskPercent "0.5 ثبت شد."                          "ریسکت شد نیم درصد."
exitPrice       "65500 ثبت شد."                           "قیمت خروج شد شصت و پنج هزار و پانصد."
gate confirm    "تأیید شد."  (unchanged text, same voice)  "باشه، تأیید شد."
gate cancel     "باشه، لغو شد..."  (unchanged text)         "باشه، لغوش کردم."
```

### 4.5 Realtime session prosody instructions (gate section 18)

`mintRealtimeClientSecret()`'s Realtime session `instructions` gain a Persian-only AUDIO DELIVERY
addendum (appended, never replacing the base transport-only contract):

> *"When the sentence you are asked to speak is in Persian, deliver it as fluent, contemporary
> Iranian Persian speech: natural Iranian rhythm and stress, a warm, calm, intelligent one-to-one
> conversational tone, a moderate pace with small natural pauses between thoughts, and without
> over-enunciating every word or sounding like a newsreader or formal written text being read
> aloud. Keep trading terminology familiar to Persian-speaking traders. This is only about HOW you
> say it - always preserve the given sentence's exact factual meaning, and never add, invent, or
> omit any claim or number."*

Deliberately about delivery only, never business logic - the session still has zero tools and is
still forbidden from answering/deciding/acting; this only shapes how an already-decided sentence is
spoken. English/Arabic/Spanish keep the exact original instructions string, unchanged.

### 4.6 Per-language voice mapping (gate section 8)

`REALTIME_VOICE_BY_LANGUAGE` (`server/pattern-ai-server.mjs`) now exists, mapping every language
independently to a voice - Persian resolves to `marin`, English/Arabic/Spanish stay on `cedar`
(see the Status section above for the real listening result this reflects). Flipping any other
language later, or moving Persian again if a future model/voice release changes the picture, is a
one-line edit to this map alone.

## 5. Numbers - exact before/after, and why the risky cases are deliberately left alone

`ai-voice-text.js`'s `normalizeNumbersForSpeech()` spells out only a small, closed, NAVRYA-owned
set of numeric forms into Persian words - anything outside that set is left exactly as written
(gate section 14: *"if exact spoken normalization is uncertain, leave the precise representation
alone - correctness beats naturalness"*). See `tests/ai-voice-text.test.mjs` for the executable
regression suite this table is drawn from.

| Input | Output | Why |
|---|---|---|
| `0.5%` | نیم درصد | closed fraction set (half/quarter/three-quarters) |
| `1%` | یک درصد | whole percent |
| `1.25%` | یک و ربع درصد | closed fraction set |
| `0.05%` | `0.05%` (unchanged) | not a clean half/quarter/three-quarters - left alone, never guessed |
| `65,500` | شصت و پنج هزار و پانصد | comma-grouped whole number, always unambiguous |
| `64,250.75` | `64250.75` (unchanged, both halves) | any decimal price is left FULLY untouched, never half-converted |
| `5m` / `15m` / `1h` / `4h` / `1D` | پنج دقیقه / پانزده دقیقه / یک ساعت / چهار ساعت / یک روز | NAVRYA's own fixed, closed `TIMEFRAME_TOKENS` enum |
| `1:2` | یک به دو | both sides integers |
| `1:3.5` | یک به سه و نیم | the one safe fractional ratio shape (exactly `.5`) |

Standard written Persian numerals are used throughout (پانصد, not the colloquial پونصد) -
deliberate, matching the gate's own "educated contemporary Iranian Persian speaker... do not
require slang" bar. Persian-indic digits (۰-۹) are normalized to ASCII before conversion, reusing
the same `faDigitsToAscii`-equivalent approach `ai-deterministic-extraction.js` already established
for the opposite (input) direction.

**No number corruption regression tests**: `tests/ai-voice-text.test.mjs` exercises every value
gate section 14 explicitly named (`0.5`, `0.05`, `1.5`, `65,500`, `65,420`, `64250.75`, `1:2`,
`1:3.5`) plus the closed timeframe set - 23 tests, all passing.

## 6. Trading pronunciation dictionary (gate section 16)

Deliberately short - `ai-voice-text.js`'s `PRONUNCIATION_MAP_FA` only covers `BTC` → `بیت‌کوین` and
`ETH` → `اتریوم`, chosen because these are near-universally how Persian-speaking crypto
communities already say them regardless of listening-test results, not a guess this pass could not
verify. Every other candidate the gate named (`SL`/`TP`/`RR`/`OpenAI`/`New York`/`Strategy`/
`Pattern`) was deliberately **left untouched**, pending a real listening pass to determine the
preferred spoken form (gate section 16: *"determine the preferred spoken form through testing"*) -
this pass could not itself listen, so it did not guess. `docs/ai/voice-i18n.md` already documents
that a Session city's *value* stays canonical English while the *reply* pronounces it naturally in
the reply's own language (e.g. Arabic's "نيويورك") - that existing behavior is untouched.

## 7. Regressions checked

- **Latency fast paths (gate section 36)**: the deterministic slot-fill/gate-confirm/gate-reject
  paths are still zero-network (`recordZeroNetworkLatency`, unchanged) - this pass only added a
  synchronous string computation (`spokenSlotFilled`/`spokenConfirmation`), never a network or
  model call. `tests/chat-dock-core.test.mjs`'s existing "zero AI calls" tests (fetch throws if
  ever reached) still pass unmodified.
- **No extra AI call (gate section 35)**: `voiceReply`'s Persian style contract is additional
  *instruction text* on the SAME existing `dockChat()` call, not a second model call. The
  voice-text post-processing layer is pure JS, zero network.
- **EN/AR/ES (gate section 32/33)**: every new Persian-only branch (`voiceInstruction`'s style
  addendum, the Realtime session's delivery addendum, `normalizeNumbersForSpeech`,
  `spokenSlotFilled`/`spokenConfirmation`) is gated on `language === 'fa'` explicitly and returns
  `null`/the original string otherwise - regression-tested in `tests/ai-dock-chat-quality.test.mjs`,
  `tests/ai-realtime-voice-session.test.mjs`, and `tests/ai-voice-text.test.mjs`.
- **Journey C value preservation**: the localized proactive messages interpolate the exact same
  `evidence` numbers the English originals did (`tests/ai-proactive-engine.test.mjs`'s new
  localization test asserts both percent values survive exactly).
- **Full suite**: `npm test` - 878 tests, 0 failures (see section 9).

## 8. Known gap - how close is this to a native conversational Persian voice

Honestly: **closer, but not proven equal to a native speaker, and not "the same as ChatGPT Voice"**
(that phrase is never used here - see the gate's own explicit instruction not to claim it unless
proven on the same architecture, which GPT-Live is not available to prove). What this pass
*verifiably* fixed: a real, confirmed English-only bug in Persian safety messaging (section 4.1);
gave `voiceReply` an actual Persian register contract instead of "shorter" alone; stopped a small
set of NAVRYA-owned numbers/timeframes from being read as raw digits/Latin tokens; replaced one
flat acknowledgement template with field-aware phrasing; and added Persian-specific delivery
guidance to the Realtime session itself. What remains **fundamentally limited by the current
OpenAI voice model/architecture, not by anything in this repository**: Cedar and Marin are both
general-purpose multilingual voices, not Persian-specialized ones - OpenAI has published no
Persian-specific naturalness claim for either. The real listening pass (section "Status," above)
picked Marin as clearly better for Persian across a real, varied validation set, but the ceiling on
rhythm/stress/warmth for Persian specifically remains whatever this general-purpose model is
actually capable of - a real, human-judged improvement, not a claim of parity with a native
speaker. GPT-Live's
full-duplex architecture (the thing ChatGPT Voice itself now runs on) is simply not available to
this project's API today (section 3) - if/when it becomes available, it is a materially different,
likely more capable ceiling than anything achievable by prompting the current Realtime API harder.
