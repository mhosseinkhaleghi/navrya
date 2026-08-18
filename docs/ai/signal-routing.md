# Psychology Signal Router (Journey C)

`public/pages/shared/ai-signal-router.js` → `window.TradeJournalAISignalRouter`

Decides two things about a chat message: (a) does it carry a trading-relevant
behavioral/emotional signal at all, and (b) where, if anywhere, that signal may be persisted. It
never decides how to interpret a signal clinically — `mental-health-safety.js` remains the sole
authority on that (see "Safety boundary" below).

## Why deterministic, not model-based

Classification here is keyword-based EN+FA matching, not a model call. Every one of Journey C's
own required scenarios uses an *explicit* emotion word ("angry" / "عصبانی"), and the architecture
spec's own guidance is that explicit phrases need no semantic guesswork. A `modelHint` extension
point is intentionally reserved (unused today) for a future pass that layers model-provided
classification of *indirect* phrasing on top, without changing this module's contract. This keeps
Journey C's signal detection provider-neutral by construction — it works identically regardless of
which LLM (or none) is configured, and needs no server changes at all.

## API

```js
TradeJournalAISignalRouter.classify({ text, context })
// -> { relevant: bool, secondarySignals: [...], destination }
// context: { hasActiveTradeWorkflow, activeSessionId }

TradeJournalAISignalRouter.DESTINATION
// { TRANSIENT, TRADE_LOG, SESSION_CONTEXT, PSYCHOLOGY_PROFILE, CHAT_ONLY }
```

## Relevance gating (prefers false negatives)

1. **UI-directed complaints win over everything.** "This modal/popup/page/button is making me
   angry" is never trading psychology, regardless of active-trade context — checked first, before
   any emotion keyword.
2. **No emotion keyword → not relevant.** A plain "What does this Pattern mean?" is never routed
   anywhere.
3. **Relevance requires ONE of:** an active AI trade workflow in flight, an active Session (an
   emotional statement made while genuinely inside a Session is plausible pre-session context even
   without an explicit trading noun — "I'm anxious before New York opens" names a Session city,
   not a risk/entry/stop term), explicit trading vocabulary in the same message, or a loss
   reference (inherently trade-domain language).

Verified in the browser: "This modal is making me angry" (with an active trade open) → not
relevant, nothing persisted. "I've had two losses, I'm angry, and I want to increase risk to 4%."
(same context) → relevant, routed.

## Persistence policy

| Destination | When | What happens today |
|---|---|---|
| `TRADE_LOG` | an active `trade.calculator` workflow is in flight | Applied live via `registry.applyValue(processId, 'pendingEmotionSignal', {emotion, note}, 'replace')` — the exact same mechanism every other AI-filled field on that modal already uses. Carried onto the real Trade's own `emotionLog[]` (`stage: 'entry'`) only once the trade is actually created — there is no id to attach to before that. |
| `SESSION_CONTEXT` | an active Session, no trade workflow | Classified and returned as context for this turn; **not persisted** in this vertical slice. Forcing a write into `mental-health-store.js`'s pre-session check-in here would be "silently forcing a Mental Health record," which the architecture spec explicitly rules out — the real check-in flow is a UI-driven, user-initiated flow, never auto-triggered from a stray remark. This is a documented integration seam for a future pass, not a gap that was implemented incorrectly. |
| `CHAT_ONLY` | neither of the above | Nothing persisted; the signal is still returned so the Proactive Engine can use it as evidence for *this turn only*. |
| `PSYCHOLOGY_PROFILE` | — | Never written to directly by this router. The existing `mental-health-collector.js` pipeline (loss-streak / time-of-day / gap-after-loss / high-stress / revenge-trading / overtrading detectors) is the sole owner of that profile and already re-runs itself on every `tradejournal:trades-changed` event — Journey C does not duplicate or bypass it. |

## Never fabricates

- No numeric score is ever invented. `trade.emotionLog`'s own `normalize()` step in
  `trade-store.js` fills `stressLevel`/`focusQuality`/`planCommitment` to a neutral default of `5`
  for *any* caller that omits them — this is pre-existing, unmodified store behavior (the real
  manual "Log Emotion" modal produces the exact same default for those two fields today). Journey
  C's own rules never treat that default as a measured value — `ai-proactive-engine.js`'s Rule E
  only ever reads stress from a real, validated pre-session check-in, never from
  `trade.emotionLog`.
- `dominantEmotions` only ever contains an emotion the user explicitly stated (`anger` / `stress`),
  matched by keyword — never inferred from tone, and never more than one per message today.
- A `behavioral_context: recent_losses` secondary signal is marked `requiresVerification: true` —
  it is a claim about what the user *said*, not a fact until `ai-proactive-engine.js`'s
  `buildTradeContext()` cross-checks it against `TradeJournalTradeStore`. See "Verified vs
  unverified" below.

## Verified vs unverified

Three states, matching the architecture spec's own vocabulary:

- `USER_STATED` — what `ai-signal-router.js` returns before any cross-check (every
  `secondarySignals[]` entry from this module carries this status).
- `VERIFIED_FROM_NAVRYA` — reached only inside `ai-proactive-engine.js`'s own `buildTradeContext()`,
  which independently queries `TradeJournalTradeStore.listSync()` for real closed-loss trades; the
  router itself never claims verification.
- `INFERRED` — not currently produced by either module; reserved for a future model-assisted pass.

If a user claims two losses NAVRYA cannot find in the real trade history, the deterministic
`recentTrades` context simply reports what is actually there (e.g. `recentLosses: 0`) — the
proactive rules and any reply built from them are grounded in that real number, never in the
user's unverified claim. NAVRYA is never made to *say* "yes, I see your two losses" when it can't.

## Trade emotion routing details

Stage is always `'entry'` for a Journey C-routed signal, since it is always attached while the
trade is still being *planned* (`trade.calculator`, not yet persisted) — matching the real Trade
lifecycle convention `trade-store.js`'s own `addEmotion()` already uses
(`planning/entry → 'entry'`). Journey C never calls `addEmotion()` directly (there is no trade id
yet); instead the signal rides through `tradeCalculatorModal.jsx`'s own `submit()`, which seeds
`emotionLog` onto the draft before `applyCalculatedToTrade()` — confirmed by reading that
function that it never touches `emotionLog`, so the seeded entry survives untouched into the saved
Trade.

## Safety boundary

`mental-health-safety.js`'s `checkText()` gate is never bypassed. `chat-dock-core.js`'s own
`runSignalRouting()` runs it on any text about to be routed anywhere (`TRADE_LOG`/
`SESSION_CONTEXT`), before persisting anything; a flagged message short-circuits to
`{kind: 'safety'}`, the same response shape therapist mode already produces for a flagged message.
The AI remains non-diagnostic throughout — no rule, template reply, or persisted record anywhere
in Journey C uses a clinical label (addiction/disorder/mania/depression/gambling disorder); the
existing "revenge"/"overconfidence" labeling that already lives in `mental-health-collector.js` is
untouched and not duplicated here.

## Privacy minimization

Only the minimum relevant subset of psychology context ever reaches
`ai-proactive-engine.js`'s own findings/evidence — `buildTradeContext()` extracts exactly
`{currentStress, source, recordedAt}` from the real profile, never the full
`continuousTracking`/intake payload. Nothing here sends any psychology data to a model at all —
signal classification is entirely local/deterministic, so no psychology-adjacent free text is
ever transmitted to a provider by this router.
