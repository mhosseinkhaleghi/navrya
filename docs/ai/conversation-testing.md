# Conversation Studio & Router Testing (Journey H2, Gate 2)

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

## Regression discipline

Every existing Gate 1 test either still passes unmodified or was updated to reflect a genuine,
intentional API change (e.g. `ai-conversation-router.js` no longer exports `normalize()` directly
- that assertion moved to `ai-conversation-matcher.test.mjs`, matching where the function actually
lives now). The full suite (`npm test`) was green - **1917/1917** - after this gate, and `npm run
build`/`npm run ai:knowledge:check` were both re-run clean, confirming this gate touched nothing
in Journey D's Knowledge Base pipeline.
