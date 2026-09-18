# Character Interaction Policy (Hunter + Commander)

`public/pages/shared/character-interaction-policy.js` → `window.TradeJournalCharacterPolicy`
`server/pattern-ai-server.mjs` (`CHARACTER_GEAR_INSTRUCTION`/`characterDeliveryGear`/`voiceCharacterReplyStyle`)
`docs/ai/characters/hunter.md`, `docs/ai/characters/commander.md` (each character's own identity/voice/example lines)

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

This architecture currently implements the policy layer for **Hunter and Commander only**
(`hunter` shipped first; `commander` reuses the exact same architecture, added in a later gate) -
`engineer`/`sage` keep their original, unchanged behavior throughout. There is one brain; neither
character adds a second one. No character-specific action/risk/workflow/form/safety logic exists,
and no new AI endpoint or runtime emotion classifier was created for either character.
`character-interaction-policy.js`'s `IMPLEMENTED_CHARACTERS` set is the one place that lists which
characters have real policy content - adding a third character means adding to that set and to the
server's `CHARACTER_GEAR_INSTRUCTION` map, never a second copy of the event/gear model itself.

## Why this file exists, and why it isn't the only place a character's voice lives

Before the Hunter gate, "character" only ever meant two things: an ElevenLabs/Gemini voice-ID pick
(audio identity, `docs/ai/elevenlabs-voice-providers.md`), and one hard-coded, voice-turn-only,
one-line style hint server-side (`VOICE_CHARACTER_REPLY_STYLE`, still unchanged for `engineer`/
`sage`). A written chat conversation got **zero** character-aware wording at all, even though
Hunter is this app's default character.

This codebase has no bundler and no file-sharing mechanism between the Node server
(`server/*.mjs`) and the browser client (`public/pages/shared/*.js`, `navrya-src/*.jsx`) - every
existing per-character string (`VOICE_CHARACTER_REPLY_STYLE`) is already hand-authored directly in
the server file, independent of anything client-side. Neither the Hunter nor the Commander gate
invents a new cross-runtime sharing mechanism as a one-off; both follow the same existing
convention. Concretely, the *same* event→gear model is implemented in two independent places, kept
in sync by hand:

- **Server** (`server/pattern-ai-server.mjs`): `CHARACTER_GEAR_INSTRUCTION` (a map of
  `HUNTER_GEAR_INSTRUCTION`/`COMMANDER_GEAR_INSTRUCTION`) + `characterDeliveryGear()`, consulted by
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
remember. **This event→gear mapping is character-agnostic** - the Commander gate reused it
unchanged (its own brief, section 7: "reuse existing gears, do not add a second gear enum"); only
the wording each gear resolves to differs per character (Hunter's `HUNTER_GEAR_INSTRUCTION` vs.
Commander's `COMMANDER_GEAR_INSTRUCTION`, and each character's own phrase tables client-side).

| | Hunter | Commander |
|---|---|---|
| `NORMAL` | field-partner "briefing" - warm, observant | BRIEFING - fast, structured situation report |
| `FOCUSED` | fast interview, "never chase" | TACTICAL - compact, fact-first checklist |
| `HUMAN_MOMENT` | quieter field partner, non-mystical | AFTER_ACTION - accountable, no blame |
| `NEUTRAL` | no metaphor, no humor | no military vocabulary, no urgency |

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
| `RISK_WARNING`/`RISK_OVERRIDE_CONFIRMATION` (the deterministic Proactive-Engine reply, not the model-phrased gate question above) | `chat-dock-core.js`'s `buildProactiveReply()` | An implemented character gets a short opener before a blocking conflict and its own override question; the underlying finding/evidence/message text is never touched |
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
  scope for both gates; only the immediate "just landed" headline announcement got a character
  lead-in (see each character doc's own honest-limitations note).
- Conversation Studio's authored scenarios (`written`/`voiceReply`/`performanceText`) - untouched;
  character-specific authored dialogue there remains a content decision for whoever authors
  scenarios, not something this policy layer rewrites.
- Live-voice non-verbal cues (`[laughs]`, `[pause]`) - `ai-voice-text.js`'s `stripMarkupForSpeech()`
  currently deletes bracketed cues before any live TTS call; this gate does not touch that, so no
  non-verbal cue is added to the live voice path (only to Conversation Studio's own
  `performanceText`, which already supports it independently).

## Model-token impact

Each implemented character's server-side addition is one compact paragraph (~450 characters) per
gear, appended exactly once per `dockChat()` call - the same place and size class as the
pre-existing `VOICE_CHARACTER_REPLY_STYLE` line it replaces for that character. No new model call
is introduced by either gate; every deterministic reply (proactive warning, voice opening,
analysis headline) stays exactly as free of a model call as it was before.
