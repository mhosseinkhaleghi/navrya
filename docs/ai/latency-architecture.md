# AI Copilot Latency Architecture

What was measured, what turned out to actually dominate turn latency, which optimizations were
implemented (and why each one is safe), which were deliberately rejected, and the exact rules the
new fast path and adaptive grace follow. Companion doc: `latency-testing.md` (methodology and the
real before/after numbers this pass produced). This pass changed **latency only** - no new
capability, no architecture redesign, no safety weakened to shave a benchmark number.

## Read this first: nothing about the runtime shape changed

Every optimization below is either (a) skipping a step that turns out to be unnecessary for a
specific, narrow, structurally-unambiguous class of turn, or (b) tuning an existing per-turn-type
knob that was already there (the reasoning/verbosity split). Context Engine, Action Registry,
Workflow Engine, Process Registry, and Proactive Engine are exactly the modules they were before
this pass - the fast path below calls all four of them, the same way the model-driven path always
has. There is still exactly one AI call per turn that needs one, never two.

## Instrumentation

`window.TradeJournalChatDockCore.debugLastLatency()` (dev-only, sanitized - durations, counts, and
byte/token estimates only, never a prompt, key, or message body) reports the last turn's own
breakdown:

```js
{
  totalMs, clientPrepMs, contextMs, productContextMs, networkToGatewayMs, providerMs, parseMs,
  workflowMs, graceMs, renderMs, requestBytes, promptApproxTokens, historyMessages,
  availableActionCount, fullActionCount, schemaBytes, provider, model, turnType, aiCallMade
}
```

- `providerMs`/`gatewayMs`/`keyLookupMs`/`schemaBytes`/`promptApproxChars`/`historyMessages`/
  `availableActionCount` are computed **server-side** (`server/pattern-ai-server.mjs`'s `dockChat()`
  now returns a `serverTiming` object alongside the normal reply) and threaded back into this same
  client-side record - reusing the exact `latencyMs` `callProvider()` already computed for the
  pre-existing provider-health event feed (section 37 of the spec: "do not build another
  provider-health database"), not a second measurement.
- `networkToGatewayMs` folds in round-trip transit time plus Node's own request-parse-to-`dockChat()`
  overhead - the one figure not independently observable from either side alone without
  synchronized clocks, so it is derived (`client-observed round trip` − `server's own reported
  elapsed time`), not measured directly.
- `turnType` is a best-effort classification from which branch this turn actually took
  (`SIMPLE_QA`/`PRODUCT_QA`/`NEW_ACTION`/`NAVIGATION`/`WORKFLOW_CONTINUATION`/`CONFIRMATION`/
  `VOICE_ACTION`/`VOICE_QA` - a genuinely mixed turn only ever gets one label, documented as an
  approximation, not implied precision).
- `renderMs` is stamped separately by `chatDockView.jsx` (`recordRenderComplete()`) via a
  `requestAnimationFrame` after the popover state commits - `chat-dock-core.js` has no visibility
  into React's own paint timing, so this is an honest approximation of "painted," not a DOM mutation
  observer's exact figure.
- Voice's own two numbers (`transcriptToReplyMs`, `transcriptToSpeakRequestedMs`) live in
  `window.TradeJournalChatDockVoiceLatency` instead (`chatDockView.jsx`'s own `onVoiceTranscript`) -
  `chat-dock-core.js` has no concept of the voice transport at all. `transcriptToSpeakRequestedMs`
  is **not** "audio actually started" - the real first-audio-byte moment is inside
  `aiVoiceRealtime.js`'s own `speak()`/`response.create` round trip, not observable from this layer
  without deeper transport instrumentation (out of scope this pass - see `latency-testing.md`'s
  Known Limitations).

## What actually dominates (measured, not assumed)

Every network-requiring turn's own `serverTiming.providerMs` was, by a wide margin, the largest
single component of total latency - typically 85-95% of the round trip, confirmed across every
scenario measured (see `latency-testing.md`). Client-side processing (context snapshot, action
catalog build, proactive check, workflow apply) measured in the **single-digit-to-low-double-digit
milliseconds** for every turn type, network or not. This is the central, measured finding this
whole pass is built around: **the dominant cost for any turn that genuinely needs the model is the
model itself**, not NAVRYA's own client or gateway code. The optimizations below therefore split
into two real categories - eliminate the AI call entirely when it's provably unnecessary, or make
the AI call itself less expensive when a lighter, faster tier suffices - rather than chasing
client-side micro-optimizations that measurement showed were never the bottleneck.

## 1. The deterministic single-missing-field slot fast path

`chat-dock-core.js`'s `sendChat()`, positioned right after the pre-existing F37 gate-field
confirm/reject fast path (Journey F, unchanged in shape - see below), before the network call:

```
a workflow already exists, with EXACTLY ONE non-gate required field still missing
  AND the message is short (<= 24 chars - nothing else could plausibly be riding along with it)
  AND the missing field is in a small, explicit whitelist of known-safe slot types
  AND a narrow, unambiguous extractor confidently resolves a value from the raw text
    -> apply it (through runProactiveCheck() -> Workflow Engine -> Process Registry, exactly
       the same calls the model-driven path makes), reply with a deterministic localized
       acknowledgement, ZERO network calls
  otherwise -> fall straight through to the existing AI path, unchanged
```

**Field whitelist**, deliberately small and explicit (the same "narrow, never a second intent
layer" boundary `ai-deterministic-extraction.js` already documents for itself):

- Token fields (`timeframe`, `city`, `direction`) resolve through
  `ai-deterministic-extraction.js`'s own existing domain-scoped extractor
  (`extractDeterministicFields(text, {domain})`) - the exact same regex set
  `mergedFields()` already uses to merge onto the model's own extraction, never a
  second, duplicated pattern set. EN + FA only, matching that module's own existing scope - a bare
  Arabic/Spanish timeframe phrase is not guessed at, and correctly falls through to the AI path.
- Numeric fields (`riskPercent`, `defaultRiskPercent`, `exitPrice`, `entryPrice`, `stopLoss`,
  `leverageCap`, `maxTradesPerSession`) resolve through a new, small `extractBareNumber(text)`
  (`ai-deterministic-extraction.js`) - the ENTIRE trimmed message, once its optional `%`/currency
  decoration is stripped, is nothing but one number. No label word needed (unlike the pre-existing
  `extractLabeledPrice()`) - safe specifically *because* the caller only reaches this when exactly
  one field is left to ask about, not because the function itself understands trading semantics.
  Language-agnostic by construction (a bare digit string needs no label word in any of the four
  supported languages) - confirmed working for a bare numeric reply in all four in practice, even
  though the token extractors above remain EN/FA-only.

**Journey C safety is never bypassed.** A slot-filled `riskPercent` still runs through the exact
same `runProactiveCheck()` the model-driven path calls. If a proactive finding fires (the one real
case in this whitelist: `riskPercent` over a linked Strategy's cap), the fast path does **not**
apply the field and falls through to the normal AI path instead - Journey C's own
`pendingConfirmation()` mechanism still resolves the confirmation deterministically on the
following turn, exactly as it already does for a model-driven turn. This costs nothing: `trade.
calculator` is the only action in the whitelist that `runProactiveCheck()` has any rules for at
all (every other action's own call is a documented no-op), so this branch is only ever reached in
the one case where it actually matters.

**Deliberately conservative, several ways at once** (section 6's own "false positives are worse
than a slower turn"):
- Only ever fires when a workflow **already exists** - never for fresh discovery. A brand-new
  action-discovery turn always goes through the model.
- The extractors themselves are unchanged, narrow, and already-proven (the same ones
  `ai-deterministic-extraction.js` uses for the model-merge path) - "no confident match" is the
  overwhelmingly common outcome for anything that isn't a clean bare value, and correctly falls
  through with zero side effects.
- The length cap means a message like "Change it" or "Sorry, let's actually go with 5 minutes
  instead please" is never bare-matched even if it happens to contain a recognizable token deeper
  in the sentence - genuinely ambiguous or compound phrasing is always left to the model.
- A fully-known workflow (nothing left missing) never enters this branch at all - there is no
  "one missing field" for it to even consider.

## 2. Adaptive submit grace - zero for an explicit confirmation, unchanged everywhere else

`ai-workflow-engine.js`'s `SUBMIT_GRACE_MS` (~3000ms in production) exists so a same-breath
correction ("15 minutes... no, make that 5") has somewhere to land before an ordinary multi-field
workflow auto-submits. That reasoning does not apply to an explicit yes/no on a gate field - there
is no meaningful "correction" of a deliberate final "Yes, delete it." The pre-existing F37 gate
fast path (Journey F - `confirm`/`confirmDelete`/`confirmPublish`/`send`/`publish`, the exact same
deterministic `interpretConfirmationText()` classifier, unchanged) now saves the engine's current
grace setting, sets it to `0` for the one `applyKnownFields()` call that completes the
confirmation, and restores the saved value immediately afterward
(`ai-workflow-engine.js`'s new, symmetric `getSubmitGraceMs()`/existing `setSubmitGraceMs()`) - a
**local, per-call override**, never a global change to the constant. Every other action
(`session.create`, `trade.calculator`, ordinary Settings/Strategy edits, ...) keeps its exact
existing grace window, unaffected.

This is deliberately narrower than "zero grace for every destructive action" - it targets the
specific moment (an explicit gate-field confirmation) where the correction-window rationale
genuinely does not apply, leaving every other completion path (a normal multi-field create/update,
still benefiting from room for a same-breath correction) exactly as it was.

## 3. Turn-type-aware reasoning/verbosity - a third tier, not a new mechanism

`server/pattern-ai-server.mjs`'s `dockChat()` already had a two-tier reasoning/verbosity policy
from an earlier repair pass (`activeProcess` open → `low`/`medium`; everything else → `medium`/
`high`). Measurement showed `availableActions` (fresh action discovery - deciding which of a small
offered set the user means, and extracting its fields) was sharing the **same** heavier tier as a
genuinely open-ended Q&A question, even though it is architecturally closer to "fill a form" than
"answer a question." Discovery now gets the same light tier `activeProcess` continuation already
used:

```
activeProcess open (workflow continuation)  -> reasoning: low,    verbosity: medium
availableActions offered (fresh discovery)  -> reasoning: low,    verbosity: medium   (NEW - was medium/high)
neither (genuine open-ended Q&A)            -> reasoning: medium, verbosity: high      (UNCHANGED)
```

Genuine Q&A is **deliberately, explicitly unaffected** - the one turn type this pass never touches,
so answer quality/depth stays exactly what it was (see `latency-testing.md`'s quality-regression
check). `reasoning`/`text.verbosity` remain OpenAI-only Responses API parameters (unchanged
mechanism, only the tier values moved) - `callAnthropic()`/`callOpenAICompatible()` each build
their own request body from `payload.input`/`payload.text.format` only, so an extra
`payload.reasoning`/`payload.text.verbosity` a caller sets is structurally never read by either;
the other three providers are unaffected by construction, not by a guard that has to be remembered.

## 4. History persistence is now genuinely fire-and-forget

`ARCHITECTURE.md`'s own stated intent (history sync must not block a reply) was not actually true
in code: `ai-chat-history-store.js`'s `appendExchange()` (the call made on every turn *after* the
first of a conversation) was `await`ed inside `sendChat()` before the reply was ever returned -
**two sequential network round trips** (a `GET` then a `PATCH` to the Community API) added to
every single turn of an ongoing conversation. `appendExchange()` is now called without `await`
(`.catch()`-guarded, same soft-fail posture `ai-usage-store.js`'s own `reportToServer()` already
uses) - nothing about the current turn's own return value ever depended on its result.
`startConversation()` (the **first** message of a fresh conversation only) stays `await`ed on
purpose: the caller genuinely needs the newly-minted conversation id back this turn so a second
message appends to it instead of starting a duplicate - a one-time-per-conversation cost, not a
per-turn one.

## What was measured but deliberately NOT changed in this pass

- **Candidate action-catalog reduction (spec section 8).** Measured, not assumed: a real
  `fresh_strategy_creation` discovery turn sent 16 actions, a ~16.7KB request body, ~5460 estimated
  prompt tokens. Real per-turn variance in `providerMs` across three identical repeats of that exact
  payload (2169-3132ms - roughly 1000ms of run-to-run swing for byte-identical requests) was larger
  than any plausible saving from a smaller catalog would explain, pointing at provider-side
  generation variance, not payload size, as the dominant remaining lever here. Given "never lose
  functionality merely to shrink tokens" and the real risk of a candidate-selection bug silently
  narrowing which actions a message can ever match, this was judged not worth the risk in this pass
  - reported honestly as a measured, real, but lower-priority opportunity, not implemented.
- **Chat-history trimming for the model context (section 11).** The 10-turn Q&A conversation
  benchmark showed some apparent growth in later-turn latency, but the sample (one run, one turn
  each) was too noisy to distinguish a real client-side/history-size effect from ordinary
  provider-side variance - the same kind of ~1000ms swing observed above. `debugLastLatency()`'s own
  `historyMessages` field now makes this directly measurable going forward; a real trim (separating
  display history from model-context history while preserving corrections/pronoun resolution)
  is a genuinely separate, more invasive change this pass did not have strong enough evidence to
  justify - see `latency-testing.md`'s Known Limitations.
- **Q&A streaming (section 20).** Not attempted - would require fragile partial-JSON-schema parsing
  given this app's existing strict structured-output contract, and multi-provider parity (Anthropic's
  forced-tool-use structured output in particular) makes this materially harder than a single-provider
  app. Reported as a future option, not built.
- **Admin-key-lookup prewarming (section 17).** Measured: `keyLookupMs` (surfaced in
  `serverTiming`) was consistently single-digit milliseconds once the existing 60s cache was warm,
  and the BYO-key/per-request-override path (the common case in this app's own testing) skips the
  lookup entirely. Not material enough to justify touching the existing security boundary.
- **Network connection reuse (section 18).** Not touched - no dependency added, no evidence in the
  measured data that connection setup, rather than provider generation time, was a material
  contributor.

## Voice

No voice-specific code changed. Voice already funnels through the identical `sendChat()` pipeline
(`source: 'voice'`) documented in `voice-architecture.md` - every optimization above applies to a
voice-sourced turn exactly as it does to a typed one, with zero additional voice-specific branching.
A deterministic slot-fill or gate-confirmation reached by voice now resolves with the same
near-instant reply and speaks back the same short, deterministic localized acknowledgement
(`aiDockSlotFilled`/`aiDockConfirmationAccepted`) a text turn would get - see `latency-testing.md`
for what was verified. Section 22's own examples ("Set to 5 minutes.", "Cancelled.") are exactly
what the pre-existing `aiDockConfirmationCancelled`/`aiDockConfirmationAccepted` keys and the new
`aiDockSlotFilled` key (EN/FA/AR/ES, `{value}`-interpolated) already produce - no new localization
mechanism, the same `ai-i18n.js` `t(key, vars)` every other dock string already uses.
