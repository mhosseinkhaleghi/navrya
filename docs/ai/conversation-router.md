# Deterministic Conversation Router (Journey H2, Gates 1-3)

Status: **Gates 1-3 complete.** Gate 1 shipped the deterministic router with a hardcoded,
7-scenario library. Gate 2 moved scenario authoring entirely into **Conversation Studio** (see
`docs/ai/conversation-studio.md`) and extracted the scoring engine into its own file so there is
exactly one matching implementation shared by the production router, the admin Trigger Lab, and
server-side publish validation. Gate 3 (see `docs/ai/conversation-voice-assets.md`) added
pre-generated, admin-approved audio for a matched scenario's response, so a HIGH-confidence Voice
turn can skip live speech generation too, not only the LLM call - `route()`'s resolution now
carries `audioUrl`/`audioMimeType` alongside `voiceReply`, computed unconditionally exactly like
that field already is. Deterministic ACTION/NAVIGATION bypass, CTA follow-up execution, and
telemetry dashboards remain out of scope, tracked as Gates 4-5 below.

## Why this exists

`chat-dock-core.js`'s `sendChat()` already runs a chain of deterministic, zero-network fast paths
before it ever calls the model: the mental-health safety preflight, a pending Journey C proactive
confirmation, a Companion voice-opening reply, the F37 destructive-action gate-field yes/no, and
the single-missing-field workflow slot fill (Section 7.22's latency pass). This router is the next
fast path in that exact same chain - not a parallel system - for a class of turn none of those
already handle: a plain-language product question ("what is a session for?"), a simple factual
data lookup ("how many open trades do I have?"), or (Gate 2) a question about a form/editor that
is genuinely open right now ("what does risk management mean?" while the Strategy editor is open).

The core rule, unchanged since Gate 1: **if NAVRYA can reliably answer locally, don't call the
model. If there's real doubt, always fall through to the model** - a wrong canned answer is worse
than one extra API call.

## What changed in Gate 2

- **The scoring engine moved out of this file** into `public/pages/shared/ai-conversation-
  matcher.js` (`window.TradeJournalAIConversationMatcher`) - `normalize()`, the group/strong/
  negative scorer, and confidence-band logic are unchanged algorithmically, just relocated so a
  server-side bridge (`server/community/conversation-matcher-bridge.mjs`) can load the exact same
  file via `vm.runInNewContext` for publish-time validation and collision checks. `ai-
  conversation-router.js` is now a thin wrapper: bundle fetch/cache, the two code-owned
  data-query resolvers, and response rendering.
- **The hardcoded `SCENARIOS` array is gone.** Scenarios now come from `GET /api/sync/
  conversation-scenarios` (the published bundle - see `docs/ai/conversation-publishing.md`),
  cached in `localStorage` (`tradejournal:conversation-scenarios-bundle:v1`) and refreshed lazily
  at most once per 5 minutes. A cold cache with no successful fetch yet means an empty scenario
  list - every turn safely falls through to the LLM, never an error.
- **Response text moved out of `ai-i18n.js`.** The `convRouter*` keys from Gate 1 are gone; each
  scenario's `definition.responses[lang]` now carries its own `written`/`voiceReply` text,
  authored in Conversation Studio, rendered via the matcher's own `renderTemplate()` (a `{var}`
  substitution restricted to an explicit allowlist - never i18n's `t()`, which is for
  developer-shipped UI strings, not admin-authored content).
- **A second admission mode, `surface_help`**, added for a form/editor that is genuinely open
  right now - see "Two admission modes" below.

## Where it runs

`public/pages/shared/ai-conversation-router.js` -> `window.TradeJournalAIConversationRouter`.
Loaded on all four character pages, after `ai-conversation-matcher.js` and before
`chat-dock-core.js`.

### Two admission modes

Inside `sendChat()`, `chat-dock-core.js` tries the router in this order, right after every
`activeProcess`/`availableActions` exclusion rule has already settled:

1. **`surface_help`** (Gate 2): `rawActiveProcess` - the real `activeOpenProcess()`, captured
   **before** any of Gate 1's passive-registration exclusion rules ran, since those exist so
   action-discovery can see past exactly the kind of passively-open editor (a Pattern/Strategy
   tab, a Settings panel) surface-help wants to answer a question about - is truthy, and no AI
   workflow is actively mid-fill on that *exact* process (`currentWorkflow.processId !==
   rawActiveProcess.id`; a workflow on a different, unrelated process never blocks this). Only
   `kind: 'surface_help'` scenarios whose `allowedProcesses` prefix-matches `rawActiveProcess.id`
   (and `allowedSteps`, if declared, matches the process's own `step` from
   `ai-surface-context.js`'s existing, structurally-safe `{processId, step}` snapshot - never raw
   form field values) are ever considered. A match never sets/clears `activeProcess`, never
   touches the workflow or a field or a step - purely an answer.
2. **generic** (Gate 1's exact original rule, tried only if surface_help didn't already resolve):
   `!activeProcess && !workflowBlocksDiscovery` - nothing open, no workflow being continued. Only
   `faq`/`data_query` scenarios are ever considered here.

An explicit Companion "Explain" tap (`companionIntent === 'explain'`) skips both modes - that turn
deliberately wants the model's own TEACHER-stance answer, never a canned one.

On a match, `sendChat()` returns the same `{kind: 'assistant', reply, voiceReply, ...}` shape the
therapist-mode path already uses, so `chatDockView.jsx` needs no changes to render or persist it.
Like every other deterministic fast path in this file, a locally-resolved turn is **not**
persisted to the server-side chat history - that only happens on the real LLM path.

## How matching works (`ai-conversation-matcher.js`)

1. **Normalize.** Unicode NFKC, Persian/Arabic-Indic digits to ASCII, Persian/Arabic letter-variant
   folding (ي->ی, ك->ک, ى->ی, ة->ه), Arabic harakat/tatweel stripped, Persian ZWNJ (نیم‌فاصله)
   turned into a space, Latin vowel-accent folding (Spanish qué/cómo/etc, never touching ñ),
   lowercasing, punctuation (including Spanish ¿¡) collapsed to spaces, then a conservative
   3-plus-repeat character collapse ("چیههه" -> "چیه", "????" -> "?"), then whitespace collapse.
   No transliteration between scripts, and no fuzzy/edit-distance matching - curated aliases only
   (see "Explicitly deferred" below for why).
2. **Score every scenario** (`matchScenarios(text, scenarios, surfaceContext)`). Each scenario
   declares, per language (`fa`/`en`/`ar`/`es`):
   - `groups`: concept groups, OR-within-group, AND-across-groups. A scenario earns
     `(matchedGroups / totalGroups) * 70` points. Requiring every group to match at least once is
     the real precision lever - e.g. `session.purpose` needs BOTH an entity term ("session"/"سشن")
     AND a purpose-question phrase ("what is"/"چیه") present, not just one or the other.
   - `strong`: a small set of curated, exact-known phrasings - a flat **+40** bonus on top of
     group credit (never a substitute for it; high enough to reach `HIGH` alone even when a
     phrasing only satisfies one of two concept groups, since a curated exact match is inherently
     stronger evidence than the generic group heuristic).
   - `negative`: any hit is a hard veto (score 0 for that language) - this is what keeps "create a
     session" from ever resolving to `session.purpose`.
   - An optional `surfaceBoost` (+10) when the current page matches - never load-bearing alone.
   A scenario's overall score is the best score across its four language rule sets (no real
   language-detection step - trying all four and taking the max is what makes a mixed-language or
   wrong-UI-language message still resolvable).
3. **Confidence band.** `HIGH` requires score >= 70 **and** a margin of at least 20 over the
   runner-up candidate - a close two-way tie never resolves locally. `MEDIUM` is score >= 35.
   Everything else is `LOW`. **Only `HIGH` ever bypasses the model.**
4. **Response language rule** (Gate 2, spec §19): a scenario matched HIGH but with no
   `responses[currentLanguage]` never resolves - never serve a different language, never
   runtime-translate. Falls straight through to the model.
5. **Data queries never fabricate.** A `data_query` scenario's resolver reads a real,
   already-loaded store fresh (no caching) and returns `null` on any doubt - a `null` means the
   turn is never answered locally, even at HIGH text-confidence.

## Scenario source (Gate 2)

Scenarios are entirely admin-authored via Conversation Studio (`docs/ai/conversation-studio.md`)
and delivered through the public bundle (`docs/ai/conversation-publishing.md`). The migration
`041_conversation_scenarios.sql` seeds the original 7 Gate-1 scenarios as real, published-v1 rows
with byte-identical trigger/response content, so a fresh database reproduces the exact same
runtime behavior Gate 1 shipped - see that migration's own file for the full list
(`session.purpose`, `pattern.purpose`, `strategy.purpose`, `navrya.ai.what_can_you_do`,
`dashboard.purpose`, `trade.open_count_query`, `trade.default_risk_query`).

Data-query resolvers stay code-owned in `ai-conversation-router.js` (`DATA_QUERY_RESOLVERS`,
keyed by the scenario's `dataQueryRef`) - Studio only ever authors trigger wording and the
response template that renders a resolver's output, never the query logic itself.

## Diagnostics

`window.TradeJournalAIConversationRouter.debugLastMatch()` returns the last `route()` call's full
diagnostic: normalized text, resolved surface page, every candidate's score/reasons, the winner,
confidence band, margin, resolution kind, admission `mode`, `scenarioSource` (`'published_bundle'`),
`bundleVersion`, and evaluation time in ms. Mirrors the existing `debugLastTurn()`/
`debugLastLatency()` convention in `chat-dock-core.js`. Generic/faq/data_query scenarios never
touch Mental Health data; a `surface_help` scenario's context is structurally limited to
`{processId, step}`, incapable of carrying intake answers or chat history.

## Explicitly deferred (not silently dropped)

- **Gate 4 - Deterministic ACTION/NAVIGATION bypass, CTA follow-ups, telemetry**: `ctaActionId` is
  authored and publish-validated (a static safe allowlist) but purely inert metadata this gate -
  nothing executes it yet. Unmatched-intent aggregate telemetry and a cost/bypass-rate admin
  dashboard are not built.
- **Gate 5**: action-catalog reduction and chat-history trimming for the LLM fallback path itself.
- **Not planned for any near-term gate, by design**: fuzzy/typo-distance matching and any
  embedding/vector/semantic-model dependency (recreating the cost this system exists to remove
  would defeat its own purpose).

## Verification

Automated: `tests/ai-conversation-matcher.test.mjs` (normalization + scoring, moved from Gate 1's
router tests since that's where the logic now lives), `tests/ai-conversation-router.test.mjs`
(bundle cache-first resolution, data-query freshness, the response-language fallback rule, both
admission modes, background refresh behavior, Gate 3's `audioUrl`/`audioMimeType` threading),
`tests/chat-dock-core.test.mjs` (the real integration point: zero `fetch` calls on a match,
exactly one on an ambiguous question, generic vs. surface_help admission, an in-flight workflow on
the exact same process still blocking surface-help, and - Gate 3 - a HIGH match with approved
audio still making zero `/api/ai/chat` calls). Server-side:
`tests/admin-conversation-scenarios-contract.test.mjs`,
`tests/conversation-scenarios-sync-contract.test.mjs`,
`tests/admin-conversation-audio-contract.test.mjs` (see `docs/ai/conversation-testing.md` and,
for Gate 3 specifically, `docs/ai/conversation-voice-testing.md`).

**Not yet done, reported honestly rather than claimed**: real-browser verification for Gates 1-3
alike, and (Gate 3 specifically) a real, live ElevenLabs audio generation/playback round trip - no
live-browser-driving tool or live ElevenLabs credential was available in this session. Built and
tested entirely through `node --test`. Before relying on this in production, a human should walk
through `docs/ai/conversation-testing.md`'s manual checklist and, for the voice asset pipeline,
`docs/ai/conversation-voice-testing.md`'s.
