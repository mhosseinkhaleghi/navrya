# Character Interaction Policy (Hunter + Commander + Market Engineer)

`public/pages/shared/character-interaction-policy.js` → `window.TradeJournalCharacterPolicy`
`server/pattern-ai-server.mjs` (`CHARACTER_GEAR_INSTRUCTION`/`characterDeliveryGear`/`voiceCharacterReplyStyle`)
`docs/ai/characters/hunter.md`, `commander.md`, `market-engineer.md` (each character's own identity/voice/example lines)
`tests/character-policy-parity.test.mjs` (client/server drift guard)

NAVRYA's deterministic engines (Workflow/Action/Risk/Safety/Proactive/Conversation Router) decide
**what** happens. A character only ever decides **how** it is communicated:

```
REAL NAVRYA EVENT / FACT / DECISION
        ↓
Character Interaction Policy
        ↓
Character wording / delivery guidance
        ↓
Text or Voice
```

This architecture currently implements the policy layer for **Hunter, Commander and Market
Engineer** (`hunter` shipped first; `commander` and `engineer` each reuse the exact same
architecture, added in later gates) - `sage` keeps its original, unchanged behavior throughout.
There is one brain; no character adds a second one. No character-specific action/risk/workflow/
form/safety logic exists, and no new AI endpoint or runtime emotion classifier was created for any
of them. `character-interaction-policy.js`'s `IMPLEMENTED_CHARACTERS` set is the one place that
lists which characters have real policy content - adding another character means adding to that
set, to a `PHRASES` table beside it, and to the server's `CHARACTER_GEAR_INSTRUCTION` map, never a
second copy of the event/gear model itself. `tests/character-policy-parity.test.mjs` fails if the
two sides disagree on which characters are implemented, or on which gear the same event lands on.

## Why this file exists, and why it isn't the only place a character's voice lives

Before the Hunter gate, "character" only ever meant two things: an ElevenLabs/Gemini voice-ID pick
(audio identity, `docs/ai/elevenlabs-voice-providers.md`), and one hard-coded, voice-turn-only,
one-line style hint server-side (`VOICE_CHARACTER_REPLY_STYLE`, still unchanged for `sage`, and
still the allowlist of valid character ids for every character). A written chat conversation got
**zero** character-aware wording at all, even though Hunter is this app's default character.

This codebase has no bundler and no file-sharing mechanism between the Node server
(`server/*.mjs`) and the browser client (`public/pages/shared/*.js`, `navrya-src/*.jsx`) - every
existing per-character string (`VOICE_CHARACTER_REPLY_STYLE`) is already hand-authored directly in
the server file, independent of anything client-side. None of the Hunter, Commander or Market
Engineer gates invents a new cross-runtime sharing mechanism as a one-off; all follow the same
existing convention. Concretely, the *same* event→gear model is implemented in two independent
places, kept in sync by hand (and guarded against drift by the parity test above):

- **Server** (`server/pattern-ai-server.mjs`): `CHARACTER_GEAR_INSTRUCTION` (a map of
  `HUNTER_GEAR_INSTRUCTION`/`COMMANDER_GEAR_INSTRUCTION`/`ENGINEER_GEAR_INSTRUCTION`) +
  `characterDeliveryGear()`, consulted by
  `voiceCharacterReplyStyle()` inside `dockChat()` - governs the LLM-generated wording for general
  Q&A, product explanation, data answers, and the natural-language phrasing of a form question
  (including a gate/destructive-confirmation question).
- **Client** (`public/pages/shared/character-interaction-policy.js`): the same `EVENTS`/`GEARS`
  enum and address/metaphor allowance table (both character-agnostic - see below), plus per-
  character phrase tables for the handful of **fully deterministic, non-model** replies this
  architecture wires characters into (see below). Consumed by `ai-companion-orchestrator.js` and
  `chat-dock-core.js`; `navrya-src/chatDockView.jsx` also reads it (loaded on every character page
  as a plain script, same as `ai-i18n.js`).

Every consumer treats `character-interaction-policy.js` as **additive and best-effort** - if it
isn't loaded on some page, each caller falls back to its own inline copy of the exact same text
(the same posture this codebase already uses for e.g. `TradeJournalAIContextBuilder`).

## The four delivery gears - shared across every implemented character

`NORMAL` (welcome, general Q&A, navigation) · `FOCUSED` (form interview, Trade/Session/Strategy/
Risk/analysis, correction) · `HUMAN_MOMENT` (loss, reflection, psychology) · `NEUTRAL` (a
destructive or override confirmation - character flavor becomes minimal). A gate/destructive/
override event, or an explicit `sensitivity: 'safety'`/`'gate'`, always wins `NEUTRAL` regardless
of what event was passed - `character-interaction-policy.js`'s `gearForEvent()` and the server's
`characterDeliveryGear()` both encode this structurally rather than leaving it to every caller to
remember. **This event→gear mapping is character-agnostic** - the Commander and Market Engineer
gates reused it unchanged ("reuse existing gears, do not add a second gear enum"); only the
wording each gear resolves to differs per character (each character's `*_GEAR_INSTRUCTION`
server-side, and its own `PHRASES` table client-side).

| | Hunter | Commander | Market Engineer |
|---|---|---|---|
| `NORMAL` | field-partner "briefing" - warm, observant | BRIEFING - fast, structured situation report | SYSTEMS MODE - observation, cause, consequence |
| `FOCUSED` | fast interview, "never chase" | TACTICAL - compact, fact-first checklist | DEBUG MODE - very compact, one variable at a time |
| `HUMAN_MOMENT` | quieter field partner, non-mystical | AFTER_ACTION - accountable, no blame | POST-MORTEM - hypothesis vs execution vs result; never a feeling-as-bug |
| `NEUTRAL` | no metaphor, no humor | no military vocabulary, no urgency | no debug/system metaphor, no humor |
| Address | "رفیق", occasional | "قربان", operational only | **none** - no signature title at all |

## Safety already outranks character - structurally, not by convention

`mental-health-safety.js`'s crisis-safety preflight (`chat-dock-core.js`'s `sendChat()`) returns
`{kind: 'safety'}` **before any reply is composed and before the server is ever called** - a
genuine safety turn never reaches `dockChat()` or this policy layer at all. Separately,
`server/pattern-ai-server.mjs` already states, verbatim, ahead of this gate: "Where a persona
preference and a safety/behavior rule from the rest of this prompt conflict, the safety/behavior
rule always wins" - unchanged by this gate. The `NEUTRAL`-on-safety behavior in this policy is a
second, belt-and-braces guarantee, not the only one.

## Event → real integration point

| Event(s) | Where it's wired | What changed |
|---|---|---|
| `GENERAL_QA`, `PRODUCT_EXPLANATION`, `DATA_ANSWER`, action-discovery | `dockChat()`'s `voiceCharacterStyle`, `NORMAL` gear | An implemented character's identity/tone instruction now applies on **every** turn (text or voice), not voice-only |
| `FORM_NEXT_FIELD`/`FORM_FIELD_ACCEPTED`/`FORM_CORRECTION`/`FORM_STEP_TRANSITION` | `dockChat()`, `activeProcess` present, `nextQuestion.role !== 'gate'`, `FOCUSED` gear | Same interview mechanism, compact delivery instruction only |
| `FORM_CLARIFICATION` (psychology/self-reflection) | `dockChat()`, `activeProcess.id` matches `mh-`/`psychology-`, `HUMAN_MOMENT` gear | Layered on top of the pre-existing non-diagnostic clause, unchanged |
| `DESTRUCTIVE_CONFIRMATION`, `RISK_OVERRIDE_CONFIRMATION` | `dockChat()`, `activeProcess.nextQuestion.role === 'gate'`, `NEUTRAL` gear | The model-phrased confirmation question drops all character flavor |
| `VOICE_START`/`CONTEXTUAL_OPENING` | `ai-companion-orchestrator.js`'s `voiceOpening()` → `characterGreetingText()` | Picks a `<key>_<character>` i18n entry when one exists for the language, else the original generic greeting - which action fires is unchanged |
| `RISK_WARNING`/`RISK_OVERRIDE_CONFIRMATION` (the deterministic Proactive-Engine reply, not the model-phrased gate question above) | `chat-dock-core.js`'s `buildProactiveReply()` | An implemented character gets a short opener before a blocking conflict and its own override question; the underlying finding/evidence/message text is never touched. Market Engineer additionally gets one DIFFERENCE line (`proactiveDifferenceLine`) - pure subtraction over the `strategy-risk-limit` finding's own `requestedRiskPercent`/`strategyMaxRiskPercent` evidence, empty for any other finding, non-numeric or missing evidence, or any other character |
| `ANALYSIS_HEADLINE` | `navrya-src/chatDockView.jsx`'s `onAnalysisReady()` | Prepends a compact lead-in in front of the model's real, unchanged headline |

Events not listed here (`FORM_COMPLETE`, `WORKFLOW_CANCEL`, `PROACTIVE_NUDGE`, `POST_TRADE_REFLECTION`,
`ANALYSIS_FULL`, `LOW_CONFIDENCE`, `PRAISE`, `ERROR_RECOVERY`, `LEARNED_COMMAND_FEEDBACK`) are
classified in `character-interaction-policy.js`'s `EVENT_GEAR` table (for future wiring and for
tests) but are not yet wired to a distinct real reply site of their own in this gate - they are
model-driven replies inside the `GENERAL_QA`/`FORM_*` branches above and already inherit that
branch's gear.

## What this gate deliberately did not touch

- Field order, `applyValue()`'s allowlist enforcement, gate-field confirmation semantics
  (`ai-process-registry.js`, `ai-workflow-engine.js`) - unchanged.
- The Proactive Engine's own rule evaluation, severity, and evidence (`ai-proactive-engine.js`) -
  unchanged; only the surrounding reply framing in `chat-dock-core.js` changed.
- `analysisSectionTexts()`'s full-narration section order (`navrya-src/character-app.jsx`) - out of
  scope for all three gates; only the immediate "just landed" headline announcement got a character
  lead-in (see each character doc's own honest-limitations note).
- Conversation Studio's authored scenarios (`written`/`voiceReply`/`performanceText`) - untouched;
  character-specific authored dialogue there remains a content decision for whoever authors
  scenarios, not something this policy layer rewrites.
- Live-voice non-verbal cues (`[laughs]`, `[pause]`) - `ai-voice-text.js`'s `stripMarkupForSpeech()`
  currently deletes bracketed cues before any live TTS call; this gate does not touch that, so no
  non-verbal cue is added to the live voice path (only to Conversation Studio's own
  `performanceText`, which already supports it independently).

## Admin `interactionRule`: a bounded style overlay, subordinate to the canonical Character Policy

Admin > Voice stores a per-character Gemini Voice Profile (`server/ai/gemini-voice-profiles.mjs`,
table `admin_gemini_voice_profiles`) with a `speechRule` (TTS delivery direction, consumed by the
speech path) and an `interactionRule` (a one-paragraph reply-style hint). The Hunter gate made
`voiceCharacterReplyStyle()` return an implemented character's gear paragraph *before* the branch
that read `interactionRule`, so the admin field silently stopped reaching the model for Hunter,
Commander and Market Engineer (Commander/Engineer copied it). That was an accident; the current
contract is:

```
safety / hard product rules  >  canonical Character Policy  >  active gear  >  admin interactionRule overlay
```

`adminInteractionOverlay()` in `server/pattern-ai-server.mjs` implements it for **implemented
characters only** (Hunter, Commander, Market Engineer):

- **Prompt order** is `[hard product rules] [gear paragraph: identity, pace, address rule, gear
  meaning] [overlay, if any] [closing "preserve every fact, number, safety warning, and required
  confirmation" rule]`. The overlay is purely additive - it never edits or replaces the gear
  paragraph, and the closing rule stays last.
- **Legacy seeds are not injected.** There are no seed rows in the DB (a row exists only after an
  admin saves), but the admin form pre-fills the merged default text and requires a non-empty
  `interactionRule`, so saving *any* other field stores the default verbatim. A stored rule that is
  exactly the seeded default (`isSeededInteractionRule()`, whitespace-insensitive, compared against
  the module's live defaults - never a second copy of the text) means "never customized" and is
  skipped: the seeded wording predates the canonical policy and can contradict it (Hunter's says
  "patient", the gears say fast). The three implemented characters' defaults have never changed
  since they were introduced (git history), so the current default is the only known seed. No data
  is migrated or rewritten.
- **A genuinely customized rule is kept**, as one clearly secondary sentence: `Admin style
  preference, secondary: use it only where it fits the character and gear above and every
  safety/confirmation rule; on any conflict the character above wins: "<rule>".` (172 characters of
  wrapper; the rule text itself is already capped at 900 by the profile validator.)
- **NEUTRAL gear drops the overlay entirely** (destructive/override confirmation): character flavor
  is minimal by design, so the prompt is byte-identical to one with no customization. A genuine
  crisis-safety turn never reaches `dockChat()` at all.
- **Scope is exactly what it was before the character gates:** only a Gemini voice turn
  (`source: 'voice'` + `voiceTransport: 'gemini'`) ever read this field; text turns and every other
  voice transport (which used the hard-coded `VOICE_CHARACTER_REPLY_STYLE`) get no overlay.
- **Sage is unchanged** (no Character Policy yet): on a Gemini voice turn the admin's rule - raw,
  seeded default included - is still its whole style; other transports use the hard-coded style;
  text turns get nothing.
- `speechRule` and voice selection/routing are not touched.
- The profile is read from the existing 10-second cache, never awaited: the first Gemini voice turn
  after a cold start sees defaults (so no overlay) and the refresh lands for the next turn, exactly
  as for Sage. No model call is added.

What this cannot guarantee: the wrapper *asks* the model to subordinate the overlay. Order,
additivity, seed-skipping and NEUTRAL omission are structural and tested
(`tests/character-admin-interaction-rule.test.mjs`); a model obeying the subordination clause for a
hostile custom rule is not something a unit test can prove.

## Model-token impact

Each implemented character adds one compact gear paragraph, appended exactly once per `dockChat()`
call. Measured added characters per gear (paragraph + the shared closing "preserve every fact,
number, safety warning, and required confirmation" sentence; ~4 characters per token):

| Gear | Hunter | Commander | Market Engineer |
|---|---|---|---|
| `NORMAL` | 554 | 656 | 677 |
| `FOCUSED` | 433 | 361 | 503 |
| `NEUTRAL` | 348 | 381 | 365 |
| `HUMAN_MOMENT` | 482 | 429 | 575 |

i.e. roughly 90-170 tokens on a turn whose base prompt is ~2,000 (plain Q&A) to ~5,300
(open form) characters. `tests/engineer-character-server-prompt.test.mjs` keeps every Market
Engineer paragraph under 700 added characters. The admin overlay adds **0** characters when the
stored rule is the seeded default or the turn is NEUTRAL, and otherwise a fixed 172-character
wrapper plus the rule text (a typical short rule: +206; worst case, a 900-character rule: +1,072,
~270 tokens, on Gemini voice turns only). No new model call is introduced by any gate; every
deterministic reply (proactive warning, voice opening, analysis headline) stays exactly as free of
a model call as it was before. (The Hunter gate's earlier "~450 characters" figure was an estimate;
the table above is measured.)
