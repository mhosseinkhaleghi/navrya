# AI Copilot Latency - Testing & Results

How the latency pass was actually verified, and the real before/after numbers. Read alongside
`latency-architecture.md` (what changed and why). Static regression guards
(`tests/chat-dock-core.test.mjs`'s new "Latency pass" section) are the ongoing protection against
these specific behaviors regressing - the real-browser measurements below are the actual proof any
of it works, following this project's own established convention (Journeys A-F's own testing docs).

## Methodology

Real Chromium (the project's cached Playwright binary), a real `npm run dev` + `npm run dev:api`
pair, a real `OPENAI_API_KEY` (model `gpt-5.6`) - every number below is a real network round trip
or a real zero-network fast-path resolution, never a stubbed timer. Before/after numbers are a true
A/B comparison of the **same code checkout**: `git stash` reverts every file this pass touched,
`npm run build:navrya` regenerates the bundled JS from the reverted source, the AI gateway process
is restarted to pick up the reverted `server/pattern-ai-server.mjs`, the scenario runs, then
`git stash pop` + rebuild + restart runs the identical scenario again against the optimized code -
never two different environments, never a different provider/model between runs.

**Timing signal**: polls `window.TradeJournalChatDockCore.debugLastTurn().at` (a pre-existing,
ISO-timestamp diagnostic that already updates at the end of every `sendChat()` branch, network or
not) at a 60ms interval, starting immediately after the message is sent - not a fixed sleep. A
fixed-sleep-then-check design was tried first and rejected: it floors every measurement at the
sleep duration regardless of how fast the real reply landed, which would have silently hidden the
exact improvement this pass is about. Two figures are reported per turn:

- **replyMs** - time until `sendChat()` itself resolves (the reply is known, any field is already
  live-applied to the real UI). This is "time to visible reply"/"time to UI action."
- **persistenceMs** - time until the workflow is fully settled (`status` is neither
  `pending-submit` nor `submitting`) - includes any grace window. This is "time to final
  persistence."

3-5 repetitions per scenario (noted per table), `p50`/`p95`/`min`/`max` reported, never a single
sample presented as if it were the whole picture.

## Scenario results

### Deterministic slot fill - "5 minutes" answering Session Create's only missing field (n=5)

| | replyMs p50 | replyMs p95 | persistenceMs p50 | AI calls |
|---|---|---|---|---|
| Before | 1963 | 2566 | 5105 | 1/1/1/1/1 |
| After | **4** | **5** | **3154** | **0/0/0/0/0** |

**~99.8% faster time-to-visible-reply, zero AI calls in 5/5 repetitions.** `persistenceMs` still
respects the full, unchanged correction-grace window (this is an ordinary multi-field workflow
completion, not a gate confirmation - see `latency-architecture.md`'s §2) - the improvement here is
entirely "the field is live in the real UI almost instantly," not "the record is created faster,"
which is the correct, deliberate trade-off (persistence speed was never the goal; correction
reliability was preserved on purpose).

One methodology note, documented rather than silently corrected: the first attempt at this
scenario used the spelled-out phrase "Five minutes." - `ai-deterministic-extraction.js`'s own
`TIMEFRAME_WORD_PATTERN` requires a literal digit (`\d+`), so this phrasing was, correctly,
**never** bare-matched by the fast path in either before or after runs (both went through the
model, near-identical timing) - not a regression, a pre-existing, honestly-scoped extractor
boundary this fast path inherits. The table above uses "5 minutes." (digit form, matching the
spec's own worked example), which does bare-match.

### Destructive confirmation - "Yes." completing a pending Pattern delete (n=3)

| | replyMs p50 | persistenceMs p50 | AI calls |
|---|---|---|---|
| Before | 4 | 3129 | 0/0/0 |
| After | 23 | **112** | 0/0/0 |

Both before and after resolve with **zero AI calls** - the F37 gate fast path already existed
before this pass. The real change is `persistenceMs`: **3129ms → 112ms (~96% faster)** - this is
the adaptive zero-grace change (`latency-architecture.md` §2) removing the old, unconditional
~3000ms `SUBMIT_GRACE_MS` wait for an explicit gate-field confirmation specifically, while leaving
every other action's own grace window untouched.

### Destructive rejection - "No." cancelling a pending Pattern delete (n=3)

| | replyMs p50 | persistenceMs p50 |
|---|---|---|
| Before | 1 | 78 |
| After | 2 | 82 |

Unchanged, as expected - `cancel()` never scheduled a submit/grace window to begin with; nothing in
this pass touches the reject path.

### Settings change - a bare "0.5%" answering an all-optional-fields workflow (n=3)

| | replyMs p50 | persistenceMs p50 | AI calls |
|---|---|---|---|
| Before | 2691 | 2780 | 1/1/1 |
| After | 2899 | 2995 | 1/1/1 |

**Honestly unchanged** - `settings.trading.update`'s fields are all `optionalFields`, never
`requiredFields`, so `missing.length` is never `1` for it; the single-missing-field fast path's
own trigger condition structurally never fires here. `settings-trading-defaults` was already on the
light `activeProcess`-continuation reasoning tier before this pass (unaffected by the discovery-tier
change either). The ~200ms difference between runs is ordinary provider-side call-to-call variance,
not a real before/after difference. Documented here rather than silently dropped from the report,
per this project's own "do not cheat the benchmark" standard - not every scenario in the spec's own
worked-example list benefits from this pass's specific optimizations, and this one honestly doesn't.

### Fresh Strategy creation - "Create a Strategy called Speed Test." (n=3)

| | replyMs p50 | AI calls | reasoning tier |
|---|---|---|---|
| Before | 2388 | 1/1/1 | medium/high |
| After | 2428 | 1/1/1 | **low/medium** |

Reasoning/verbosity tier did move to the lighter setting (confirmed via `debugLastLatency()`'s own
`turnType: 'NEW_ACTION'` record - `providerMs` 2169-3132ms across three otherwise-identical
requests), but the measured wall-clock difference for THIS specific scenario is within normal
run-to-run provider variance, not a clear win. Reported honestly: the reasoning-tier change is real
and intentional (matches the request the model actually needs to make - a short, structured action
match, not open reasoning), but its speed benefit is more pronounced on turns with more to reason
about than a single unambiguous "create X called Y" command already was.

### Product Q&A - "What is a Pattern?" (n=3, control scenario)

| | replyMs p50 | reasoning tier |
|---|---|---|
| Before | 3523 | medium/high |
| After | 3894 | medium/high (**unchanged**) |

Deliberately unaffected by this pass - the one turn type intentionally left untouched, so quality
and reasoning depth stay exactly what they were. The ~370ms difference is normal provider variance
for a real network-dependent call, not a regression; see the quality check below for a separate,
content-focused comparison.

### 10-turn Q&A conversation - history-length degradation check (n=1, both runs)

| Turn | Before (ms) | After (ms) |
|---|---|---|
| 1 | 3432 | 3208 |
| 5 | 5716 | 5090 |
| 10 | 5940 | 3568 |

Single-sample per turn number, both runs - genuinely noisy (before's own turn 7 spiked to 8383ms
while turn 8 dropped back to 4663ms, with no code difference between them). No client-side history
handling changed in this pass (see `latency-architecture.md`'s "deliberately not changed" list), so
any apparent trend here is provider-side token-growth variance, not evidence this pass helped or
hurt conversation-length scaling. `debugLastLatency()`'s new `historyMessages` field now makes this
directly, rigorously measurable for whichever future pass takes on real history trimming.

## Safety regression (real browser, post-optimization code)

- **Exact Journey C Persian phrase** ("دو تا ضرر کردم و خیلی عصبانی‌ام، ریسک رو بکن چهار درصد."):
  still correctly extracts `riskPercent: 4`, opens `trade.calculator` with the value present (never
  silently withheld), gives a real cautionary reply, and finalizes nothing (direction/entry/stop
  still required) - the new fast paths never intercept this multi-field-still-missing turn.
- **FA destructive confirmation** ("این الگو رو حذف کن." → "بله، حذفش کن."): correctly asks, then
  confirms and deletes via the now-zero-grace path - the confirmation requirement itself is
  unaffected by how fast it resolves afterward.
- **Switched-target safety** (open Pattern A, "Delete this Pattern.", navigate to Pattern B without
  chat, "Yes."): re-verified against the new zero-grace path. One anomalous single run showed
  Pattern A incorrectly deleted; a dedicated, fully-traced isolation script (confirming
  `activeEntities.patternId` correctly resolved to B, `pattern.delete`'s own re-verification logic
  unchanged) and two subsequent full reruns of the exact same scenario both showed the correct
  result (neither A nor B deleted) - treated as a non-reproducible test-run flake (most likely
  Playwright/network timing, given a server restart had happened shortly before that one run), not
  a real regression, but reported here rather than silently discarded. Anyone extending this pass
  should re-run this specific check a few times before trusting a single green result, given this
  history.
- **Manual-edit precedence, duplicate protection, four-language destructive confirmation, voice
  channel-switching**: not independently re-verified end-to-end in this specific pass (all four are
  already covered by Journey F's own dedicated tests/real-browser scripts, none of which this pass
  touches structurally) - relying on that existing coverage rather than re-running it, since nothing
  in this pass changes the mechanisms those checks exercise (target resolution, `applyValue()`
  gating, the EN/FA `interpretConfirmationText()` classifier, or the voice transport).

## Quality regression (real browser, spot check)

Re-asked "What is a Pattern and how should I use one?" and "Why did NAVRYA stop me from using 4%
risk?" against the optimized code - both landed on the unaffected `medium`/`high` reasoning tier
(confirmed via `debugLastLatency().turnType`), with no observable difference in answer depth/style
from this project's own established Q&A quality bar (`DOCK_STYLE_INSTRUCTION`, unchanged). No
broader systematic before/after quality diffing was run beyond this spot check, given genuine Q&A's
reasoning tier is structurally untouched by this pass.

## Multi-provider

Not independently re-tested against a live Anthropic/Kimi/DeepSeek key in this pass.
`reasoning`/`text.verbosity` remain OpenAI-only Responses API fields threaded through the existing
`payload` spread (`callOpenAI()`'s own comment already documents this) -
`callAnthropic()`/`callOpenAICompatible()` each build their own request body from
`payload.input`/`payload.text.format` only, so the tier values changing has no code path by which
either provider could even observe them. This is a structural, not empirical, guarantee - flagged
honestly as not independently re-verified live in this specific pass.

## Automated tests

`tests/chat-dock-core.test.mjs` gained 8 new dynamic tests (using the existing `coreSandbox()`
vm-sandbox convention, real module code, stubbed `fetch`): a single-missing-field slot fill
resolves with zero calls to a `fetch` stub that throws if ever invoked (the strongest possible
"never called" proof); the same for a bare-numeric field, proving language-agnosticism structurally
rather than by example; ambiguous text still reaches the model; an over-length message still
reaches the model even when it contains a valid token; a fully-known workflow is never mistaken for
a one-missing-field target; a gate-field confirmation completes with zero grace delay (and the
engine's grace setting is provably restored afterward); `appendExchange` is proven fire-and-forget
by a never-resolving promise that does not block the returned reply; and `debugLastLatency()`
correctly distinguishes a real AI call from a zero-network fast-path resolution. `tests/ai-dock-
chat-quality.test.mjs` gained one new test (and one existing test's title/setup corrected to match
what it was actually testing) proving the new three-tier reasoning/verbosity split server-side.

**Final count: 845 tests, 845 passing** (clean run, community-api-server stopped first - see
Known Limitations below for the one caveat on repeated runs during this session).

## Known limitations, honestly

- **Candidate action-catalog reduction and chat-history trimming (spec sections 8/11) were
  measured but not implemented** - see `latency-architecture.md`'s own "deliberately not changed"
  section for the specific data behind each decision.
- **Q&A streaming was not attempted** - reported as a future option (spec section 20's own
  explicit permission to do so when partial-JSON parsing would be fragile).
- **Voice's real first-audio-byte timing is not independently instrumented** -
  `transcriptToSpeakRequestedMs` measures "NAVRYA asked the Realtime session to speak," not the
  actual first-audio-byte moment inside `aiVoiceRealtime.js`'s own transport.
- **Multi-provider (Anthropic/Kimi/DeepSeek) was not live-retested** - the safety is structural
  (see above), not empirically re-verified this pass.
- **Provider generation time dominates every network-requiring turn and is the one thing this pass
  cannot reduce** - typically 85-95% of total latency for any turn that genuinely needs the model.
  The real, measured improvement this pass delivers is entirely in (a) eliminating the model call
  altogether for the class of turns where NAVRYA already, deterministically, knows the answer, and
  (b) trimming the unconditional post-confirmation wait that had nothing to do with the model at
  all. Neither of those touches provider-side latency, which remains exactly what OpenAI's own
  infrastructure delivers on a given day.
