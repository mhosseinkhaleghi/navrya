# Conversation Studio & Router Testing (Journey H2, Gate 2; expressive dialogue + context
# variants coverage added in the H2 follow-up gate)

## Automated coverage

| File | Covers |
|---|---|
| `tests/ai-conversation-matcher.test.mjs` | `normalize()` (FA/EN/AR/ES edge cases), `matchScenarios()` scoring/confidence bands, negatives/collisions, `scenarioFromBundleRow()`, `renderTemplate()`/`templateVariablesIn()` |
| `tests/ai-conversation-router.test.mjs` | Bundle cache (localStorage-first, background refresh, failed-refresh resilience), data-query freshness, the §19 "no response for this language" fallback rule, generic vs. `surface_help` admission, `debugLastMatch()` shape |
| `tests/chat-dock-core.test.mjs` (Gate 1/2 sections) | The real `sendChat()` integration point: zero `fetch` calls on a HIGH match, exactly one `/api/ai/chat` call on an ambiguous question (isolated from the router's own incidental background bundle-refresh fetch, which is a separate, harmless network call), a genuinely open form suppressing generic mode, `surface_help` resolving for its own open process while an in-flight workflow on a *different* process doesn't block it, and an in-flight workflow on the *exact same* process still blocking `surface_help` |
| `tests/admin-conversation-scenarios-contract.test.mjs` | Full lifecycle (create → draft edit → publish v1 → revision v2 → publish v2 archives v1 → rollback to v1 creates v3), archive/unarchive bundle exclusion, publish-validation blocking (unsafe CTA, invalid template variable, misrouted positive example), the Trigger Lab `/test` endpoint, `/test-batch`, non-admin/unauthenticated rejection, real `admin_audit_log` rows with no response text leaked |
| `tests/conversation-scenarios-sync-contract.test.mjs` | The public bundle: auth-required, empty-set handling, published-only (draft/archived never leak), production-safe row shape, `updatedAt` reflecting the real latest publish |
| `tests/admin-conversation-studio-i18n.test.mjs` | Every `convStudio*`/`tabConversationStudio` key exists in all four language blocks; the tab is registered in both hash-route regex spots and the builder dispatch table |

All of the above are real, dynamic tests (real Express app + real in-memory repo for the server
side, real `vm.runInNewContext`-loaded browser source for the client side) - none are static
source-assertions, since none of this gate's logic falls into this project's known "cannot be
executed by `node --test`" categories (`.jsx` files, `session-workspace-logic.js`'s DOM/interval
dependencies).

## H2 follow-up: expressive dialogue + context variants coverage

| File | Covers |
|---|---|
| `tests/performance-text.test.mjs` (new) | `stripPerformanceTags()` (recognized tags removed, an unrecognized tag flagged and left in place), `supportsExpressiveAudioTags()` (`eleven_v3*` yes, a v2 model no), `validatePerformanceText()` against the **real** shared matcher's `normalize()` - a valid tag/punctuation-only enhancement, every added/removed/reordered-word rejection case, an unsupported tag, empty/missing text, and a real Persian (ZWNJ/digit-fold) case; `effectiveVoiceText()`'s full fallback matrix (missing, invalid, unsupported model); `responseSetFor()`'s STANDARD-vs-variant resolution and its graceful degrade for a stale/renamed variant key; `effectiveVoiceTextFor()` end-to-end |
| `tests/ai-conversation-matcher.test.mjs` (extended) | `scenarioFromBundleRow()` flattens `variants`; `selectVariant()`'s full priority truth table (the exact `session.purpose` acceptance sequence: 0→FIRST_TIME, 1→STANDARD, 2→THIRD_TIME_PLUS, 3+→THIRD_TIME_PLUS; surface+exposure beats exposure-only beats surface-only; deterministic tie-break, never random); `variantsCollide()`'s real range-overlap logic (two different `NTH_OR_LATER` thresholds still collide; `FIRST_TIME` never collides with a high-enough threshold; different surfaces/specificities never collide) |
| `tests/ai-conversation-router.test.mjs` (extended) | The full `session.purpose` acceptance example end-to-end through `route()` with a seeded exposure cache; published audio keyed by the *selected* variant, never always `standard`; a scenario with no authored variants completely unaffected; `recordExposure()`'s optimistic local increment (three real turns in one sitting see counts 0/1/2, no network round trip needed); `performanceText` never leaking into any field of a resolution |
| `tests/chat-dock-core.test.mjs` (extended) | `sendChat()` calls `recordExposure(scenarioKey, variantKey)` exactly once for a real local delivery, and never for an LLM-fallback turn |
| `tests/conversation-scenario-exposures-contract.test.mjs` (new) | Auth required; an empty bounded map for a fresh user; `POST /record` always server-increments (a client-supplied `count` is completely ignored); per-scenario independence; `lastVariantKey` tracking; strict per-user scoping; validation on a missing `scenarioKey`; the exact bounded response shape (`count`/`lastPresentedAt`/`lastVariantKey`, nothing else) |
| `tests/admin-conversation-scenarios-contract.test.mjs` (extended) | Publish blocked (422) by an invalid STANDARD `performanceText`, an invalid variant `performanceText`, and a real variant-context collision; publish succeeds for a valid tag-only enhancement and for two variants on non-overlapping surfaces |
| `tests/admin-conversation-audio-contract.test.mjs` (extended) | Enhance Delivery: a valid suggestion (audited), an invented suggestion reported invalid (never silently good), a missing admin OpenAI key (400, zero OpenAI calls), no stored spoken text at all (400, zero OpenAI calls), non-admin rejection; audio-identity invalidation on a performance-tag change alone (different hash, stale flag, old asset archived on re-approval); a performanceText silently unused when the chosen model doesn't support tags; a context variant's own independent, separately-approvable audio identity |

### A real test-isolation lesson worth recording (again)

Adding the variant-collision test above initially reused `'thingamajig'` - already this file's own
pre-existing `test-batch` test's vocabulary - and separately, a `replace_all` text edit meant to
fix that new test's own word accidentally rewrote the *pre-existing* test's vocabulary too (both
happened to contain the same string), silently reintroducing the identical collision under a new
word. Caught immediately by re-running the full file, not assumed fixed. The generalizable lesson,
restated: a blind find-and-replace across a shared test file is exactly as risky as copy-pasting
vocabulary by hand - always re-verify the *other* test that used to pass still uses its own,
original, unique words after any edit that touches shared trigger vocabulary.

### A real test-isolation lesson worth recording

Early drafts of `tests/admin-conversation-scenarios-contract.test.mjs` reused the same trigger
vocabulary (`"widget"`/`"what is a widget"`) across what were meant to be independent test cases,
all running against one shared `repo`/Express app instance for the whole file (the same
`before()`-once convention every admin contract test in this repo uses). Because a scenario
published in an earlier test stays published for the rest of the file, two unrelated tests'
scenarios ended up genuinely colliding with each other - the matcher correctly detected the
collision (a real margin-based tie, `confidenceBand: 'MEDIUM'`), which looked like a router bug
until traced back to the test data itself. Fixed by giving each test its own unique vocabulary
(`sprocket`, `thingamajig`, `gizmo`, `doohickey`, ...) - a real, generalizable lesson for any
future test added to this file: unrelated test scenarios must not share trigger words, or they
will genuinely collide via the shared repo state, exactly as two unrelated real Studio scenarios
would in production.

## Manual browser checklist - **NOT YET PERFORMED**, reported honestly

No live-browser-driving tool was available in this session (the same disclosed limitation as
Gate 1 and, earlier, Journey G's own companion-testing gap and Phase 8e's boot-language-gate
work). Before relying on this gate in production, a human should walk through:

**Admin:**
1. Open Conversation Studio, open `session.purpose`.
2. Add a Persian trigger phrase and a negative example via the Editor's per-language fields; Save
   Draft.
3. Run the Trigger Lab against the new phrase - expect `HIGH`/`LOCAL`; against the negative
   example - expect it not to resolve to `session.purpose`.
4. Edit the Persian written response; Publish.

**User app (a different browser tab/session than the admin one above):**
5. Ask the edited Persian phrase - expect the new response text, and confirm via the Network tab
   that `/api/ai/chat` was never called (only, at most, the harmless background
   `/api/sync/conversation-scenarios` refresh).
6. Ask the negative example - expect it to reach the model normally instead.
7. Ask something genuinely ambiguous - expect exactly one real `/api/ai/chat` call.
8. Open the Strategy editor (or another registered form) and ask a question a `surface_help`
   scenario is authored for (none are seeded by default this gate - an admin would need to author
   one first, e.g. a Risk Management field-help scenario scoped to `strategy-editor-`) - expect a
   local answer with the form still fully open and unaffected.
9. Repeat step 5-7 in English, Arabic, and Spanish.
10. Confirm a page reload within the 5-minute cache window still shows the pre-refresh content
    (proving the cache, not just the network, is doing real work), and that reloading again after
    the window (or forcing a fresh `localStorage`) picks up the newly published version with no
    app rebuild or redeploy.

## H2 follow-up manual checklist - **NOT YET PERFORMED**, reported honestly

Same disclosed limitation - no live-browser-driving tool and no live ElevenLabs/OpenAI credential
were available in this session.

**Admin:**
1. Open `session.purpose`. Add a `FIRST_TIME` variant (Exposure: First time) and a
   `THIRD_TIME_PLUS` variant (Exposure: Nth time or later, threshold 3), each with different
   spoken text from STANDARD and from each other; Save Draft.
2. Click Enhance Delivery for STANDARD and for each variant separately. Confirm the generated
   expressive text contains natural, supported tags and the exact same words as the spoken text
   for that dialogue - never copied between variants.
3. Generate + approve ElevenLabs Preview for STANDARD, `FIRST_TIME`, and `THIRD_TIME_PLUS`
   independently; Publish.

**User app (a fresh test account, different session than the admin one above):**
4. Ask "what is a session" by Voice - expect the `FIRST_TIME` dialogue and its own approved audio.
5. Ask it again - expect STANDARD (no forced second-time variant).
6. Ask it a third time - expect `THIRD_TIME_PLUS` and its own approved audio, never STANDARD's or
   `FIRST_TIME`'s.
7. Refresh/re-login and ask a fourth time - expect `THIRD_TIME_PLUS` again, proving exposure
   persistence survives reload/re-login, not just an in-memory session variable.
8. Confirm via the Network tab, for every one of steps 4-7: zero `/api/ai/chat` calls, zero new
   ElevenLabs generation calls (only the already-approved file is fetched).
9. Type (don't speak) "what is a session" - confirm the written reply renders normally and no
   audio tag (`[curious]`, etc.) is ever visible in the ChatDock UI.
10. Change one performance tag on the approved `FIRST_TIME` audio's dialogue (e.g. `[curious]` to
    `[softly]`), regenerate, and confirm the old approved audio is now flagged stale and cannot be
    approved again as-is - only the freshly regenerated candidate can be approved.

## Regression discipline

Every existing Gate 1 test either still passes unmodified or was updated to reflect a genuine,
intentional API change (e.g. `ai-conversation-router.js` no longer exports `normalize()` directly
- that assertion moved to `ai-conversation-matcher.test.mjs`, matching where the function actually
lives now). The full suite (`npm test`) was green - **1917/1917** - after this gate, and `npm run
build`/`npm run ai:knowledge:check` were both re-run clean, confirming this gate touched nothing
in Journey D's Knowledge Base pipeline.

**H2 follow-up (expressive dialogue + context variants)**: every existing test either passed
unmodified or was updated for a genuine, intentional shape change (`route()`'s resolution gaining
`variantKey`, the `enqueue()`/exposure-cache background fetch changing an exact fetch-call-count
assertion in one pre-existing test). `conversation-audio-identity.mjs`'s own `spokenTextFor()` was
removed outright, not just deprecated, once nothing referenced it any more - confirmed via a full
`npm test` re-run immediately after deleting it. Full suite: **2050/2050**. `npm run
ai:knowledge:check`, the complete `npm run build`, and `git diff --check` were all re-run clean on
the final, real diff.
