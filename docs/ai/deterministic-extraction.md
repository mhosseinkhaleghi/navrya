# Deterministic Field Extraction (Journey D, Section 0)

`public/pages/shared/ai-deterministic-extraction.js` → `window.TradeJournalAIDeterministicExtraction`

A small, provider-independent extractor for a bounded set of high-confidence, structured trading
values (risk %, direction, labeled entry/stop/target, common timeframes, known Session city names),
in English and Persian, merged on top of whatever the model itself extracts. This was gated as
**Section 0 of Journey D** — explicitly required to pass, with zero model dependency, before any
Knowledge Base work began.

## Why this exists

Journey C's own real browser testing found a genuine, non-deterministic model-reliability gap: an
LLM given `trade.calculator`'s explicit instruction ("extraction and policy are different jobs —
always extract the literal number, even one that sounds risky") could still, on its own initiative,
decline to extract a value it perceived as unsafe — most visible on the single most
emotionally-loaded required phrasing: *"I've had two losses, I'm angry, and I want to increase risk
to 4%."* A stronger system-prompt instruction narrowed this but never fully closed it — a prompt
can request a behavior, never guarantee one. See `proactive-engine.md`'s own "resolved" note.

This module closes the gap a different way: NAVRYA recognizes its own users' literal words for a
narrow, unambiguous set of forms itself, with plain regexes, no network call, so the model's
cooperation stops being a dependency at all for these specific fields.

## Design boundary — deliberately NOT a second intent layer

`extractDeterministicFields()` only ever claims a value when the surrounding words make the field
unambiguous:

- **riskPercent**: only next to the literal word "risk"/"ریسک" and a `%`/`درصد` — a bare `4` in a
  sentence full of numbers is never claimed.
- **direction**: only `long`/`buy`/`bullish`/`لانگ`/`خرید` vs. `short`/`sell`/`bearish`/`شورت`/`فروش`
  — both or neither present is left `null` (genuinely ambiguous, left to the model).
- **entryPrice/stopLoss/takeProfits**: only a number sitting next to an explicit label
  (`entry`/`ورود`, `stop loss`/`حد ضرر`/`استاپ`, `take profit`/`target`/`tp`/`هدف`/`تارگت`).
- **timeframe**: only the real `NewSessionDialog.jsx` `TIMEFRAMES` list (`5m`,`15m`,`1h`,`4h`,`1D`)
  plus natural phrasing (`"15 minutes"`, `"۱۵ دقیقه"`) that resolves to one of those exact tokens —
  an unrecognized value returns `null`, never a guess.
- **city**: only the real `SESSION_CITIES` list (`London`,`New York`,`Tokyo`,`Sydney`) plus their
  common Persian names.

Anything genuinely semantic or free-form — `linkedStrategyId`, `linkedPatternIds`, the reply text
itself — is never attempted here and stays entirely the model's job.

## API

```js
TradeJournalAIDeterministicExtraction.extractDeterministicFields(text, context)
// context: {domain: 'trade' | 'session'} - narrows which fields are worth attempting (a
// session-creation turn has no reason to look for stopLoss). Omit for "try everything safe."
// -> a plain {path: value} map, only the fields actually found.

TradeJournalAIDeterministicExtraction.mergeWithModelFields(modelFields, text, context)
// -> the model's own {path,value}[] fields array, with every deterministically-found path
// overwritten (mode:'replace', source:'deterministic') and any path the model omitted filled in.
// Never removes a model-supplied field this module doesn't itself recognize.
```

Deterministic wins for any path it found — a direct, unambiguous parse of the user's own literal
words is more reliable than an LLM's interpretation for this narrow, well-defined set, and it is
never wrong to prefer NAVRYA's own reading of "risk to 4%" over a model's paraphrase of the same
words.

## Integration (`chat-dock-core.js`)

```js
var ACTION_DETERMINISTIC_DOMAIN = { 'trade.calculator': 'trade', 'session.create': 'session' };
function mergedFields(modelFields, text, actionId) {
  var domain = ACTION_DETERMINISTIC_DOMAIN[actionId];
  if (!extraction || !domain) return modelFields;
  return extraction.mergeWithModelFields(modelFields, text, { domain: domain });
}
```

Called for both the turn-1 branch (`payload.action.fields`) and the turn-2+ branch
(`payload.suggestions`), before either ever reaches `runProactiveCheck()`/`applyKnownFields()` — so
`ai-proactive-engine.js`'s own rules (Rule A in particular) always see the real, complete, merged
value regardless of what the model chose to do this turn. An action with neither domain mapped
(e.g. `navigate.to`) is left completely untouched.

## Verified, not just unit-tested

`tests/ai-deterministic-extraction.test.mjs` (21 tests) proves both exact required Journey C
sentences always extract `riskPercent: 4`, with zero model dependency. Beyond unit tests: verified
**3/3 in real browser runs** where the live model declined to extract `riskPercent` on every single
attempt, and NAVRYA still correctly recovered `riskPercent: 4` and staged the real
`strategy-risk-limit` confirmation card each time — zero retries, exactly the outcome Journey C's
own spec asked for. Re-verified again during Journey D's own regression pass
(`docs/ai/knowledge-base.md`'s own "Regression" section).
